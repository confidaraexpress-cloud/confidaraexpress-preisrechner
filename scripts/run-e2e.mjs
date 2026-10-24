#!/usr/bin/env node
/* Startet die Browser-E2E-Suiten — mit AUFFINDUNG statt Dateiliste.
 *
 * Warum es dieses Skript gibt: `package.json` führte die E2E-Dateien einzeln
 * auf. Eine neu angelegte Suite lief dadurch nur, wenn jemand daran dachte,
 * sie zusätzlich einzutragen — `tests/e2e/addressValidation.test.mjs` lag so
 * über Monate unbenutzt im Repository, samt zehn Browserprüfungen, die nie
 * jemand ausgeführt hat. Der Fehler war nicht die vergessene Zeile, sondern
 * dass es überhaupt eine Zeile brauchte.
 *
 * Jede Datei unter `tests/e2e/` mit der Endung `.test.mjs` läuft ab jetzt
 * automatisch mit. Es gibt keine Ausnahmeliste: wer eine Suite nicht laufen
 * lassen will, löscht sie oder benennt sie um — beides ist im Diff sichtbar,
 * ein stiller Ausschluss wäre es nicht.
 *
 * ── Aufteilung (Sharding) ─────────────────────────────────────────────────
 * Jede Suite startet ihren EIGENEN Vite-Dev-Server und ihren eigenen Chromium.
 * Nacheinander dauert der volle Lauf entsprechend lang. `--shard i/n` teilt
 * die Dateien auf n Läufe auf, die parallel auf getrennten CI-Maschinen laufen
 * können; lokal bleibt der Aufruf ohne Parameter und führt alles aus.
 *
 * Verteilt wird NACH GEMESSENER LAUFZEIT (seit 2026-10-24, scripts/e2eVerteilung.mjs
 * mit scripts/e2e-laufzeiten.json): längste Suite zuerst, jeweils in den
 * leichtesten Teil. Reihum nach Dateiname lagen die vier Teile 16–22 Minuten
 * auseinander, weil die Laufzeiten der Suiten sehr ungleich sind. Eine Suite
 * ohne Messwert zählt mit dem Median — sie läuft immer mit, nur ihre Balance
 * ist geschätzt. Die Teilanzahl steht allein im CI-Workflow.
 *
 * WICHTIG: Der Aufteilung liegt dieselbe Auffindung zugrunde wie dem vollen
 * Lauf. Es gibt genau eine Quelle für „welche Dateien gibt es" — lokal und in
 * der CI. Zwei getrennte Listen wären wieder der Fehler von oben.
 *
 *   node scripts/run-e2e.mjs                 alle Suiten
 *   node scripts/run-e2e.mjs --shard 2/4     nur der zweite von vier Teilen
 *   node scripts/run-e2e.mjs --list          nur auflisten, nichts starten
 */
import { readdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verteileSuiten } from "./e2eVerteilung.mjs";

const WURZEL   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E2E_DIR  = path.join(WURZEL, "tests", "e2e");

/** Deterministisch sortiert — sonst ordnete das Dateisystem die Teile bei
 *  jedem Lauf anders zu und ein Fehlschlag wäre nicht reproduzierbar. */
function findeSuiten() {
  return readdirSync(E2E_DIR)
    .filter((n) => n.endsWith(".test.mjs"))
    .sort()
    .map((n) => path.join("tests", "e2e", n));
}

function leseShard(argv) {
  const i = argv.indexOf("--shard");
  if (i === -1) return null;
  const roh = argv[i + 1] || "";
  const m = /^(\d+)\/(\d+)$/.exec(roh);
  if (!m) {
    console.error(`--shard erwartet die Form i/n (z. B. 2/4), bekommen: "${roh}"`);
    process.exit(2);
  }
  const teil = Number(m[1]), gesamt = Number(m[2]);
  if (teil < 1 || gesamt < 1 || teil > gesamt) {
    console.error(`--shard ${roh} ist außerhalb des gültigen Bereichs`);
    process.exit(2);
  }
  return { teil, gesamt };
}

const argv   = process.argv.slice(2);
const shard  = leseShard(argv);
const alle   = findeSuiten();

if (alle.length === 0) {
  console.error("Keine E2E-Suiten unter tests/e2e/ gefunden — das ist mit hoher");
  console.error("Wahrscheinlichkeit ein Fehler und kein leeres Verzeichnis.");
  process.exit(1);
}

function leseLaufzeiten() {
  try {
    return JSON.parse(readFileSync(path.join(WURZEL, "scripts", "e2e-laufzeiten.json"), "utf8")).suiten || {};
  } catch (e) {
    // Ohne Messwerte bleibt die Verteilung vollständig, nur die Balance ist geschätzt (gleiche Gewichte).
    console.log(`::warning::E2E-Laufzeiten nicht lesbar (${e.message}) — Verteilung mit gleichen Gewichten.`);
    return {};
  }
}

let dateien = alle;
let erwartet = null;
if (shard) {
  const teil = verteileSuiten(alle, leseLaufzeiten(), shard.gesamt)[shard.teil - 1];
  dateien = teil.suiten;
  erwartet = teil.last;
}

const kopf = shard ? `Teil ${shard.teil}/${shard.gesamt}` : "vollständig";
console.log(`E2E ${kopf}: ${dateien.length} von ${alle.length} Suiten`
  + (erwartet != null ? ` · erwartet ≈ ${(erwartet / 60).toFixed(1)} min` : ""));
for (const d of dateien) console.log("  ·", d);

if (argv.includes("--list")) process.exit(0);

if (dateien.length === 0) {
  // Mehr Teile als Dateien: kein Fehler, es gibt für diesen Teil nichts zu tun.
  console.log("Für diesen Teil gibt es keine Suite — nichts zu tun.");
  process.exit(0);
}

/* ── Ausführung je Suite (seit 2026-10-24) ────────────────────────────────────
 * Jede Suite läuft in einem EIGENEN `node --test`-Aufruf, nacheinander: jede
 * belegt einen festen Port für ihren Dev-Server, parallel gestartet kollidieren
 * sie (`--strictPort`). Danach steht je Suite eine Zeile
 *     E2E-Laufzeit <datei> <sekunden> s · <n> Tests, …
 * im Protokoll — die Messgrundlage der Laufzeitverteilung — und am Ende eine
 * Zusammenfassung des Teils.
 *
 * Eine Suite gilt nur als bestanden, wenn ihr Prozess mit 0 endet, mindestens
 * ein Test bestanden ist und kein Test rot oder abgebrochen ist. Bewusst
 * übersprungene Tests (etwa bei abgeschalteter Zolloberfläche) bleiben erlaubt,
 * stehen aber je Suite sichtbar im Protokoll. Eine rote Suite verdeckt die
 * übrigen nicht: es laufen immer alle zugeteilten Suiten. */
function fuehreSuiteAus(datei) {
  return new Promise((resolve) => {
    const kind = spawn(process.execPath, ["--test", "--test-concurrency=1", datei], {
      cwd: WURZEL,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const zaehler = { tests: 0, pass: 0, fail: 0, skipped: 0, cancelled: 0, dateiAlsTest: false };
    const norm = (p) => p.replace(/[\\/]+/g, "/"); // TAP verdoppelt Backslashes unter Windows
    const dateiNorm = norm(datei);
    let rest = "";
    const lies = (stueck) => {
      rest += stueck;
      const zeilen = rest.split("\n");
      rest = zeilen.pop();
      for (const z of zeilen) {
        // TAP („# tests 3", Node 22 ohne Terminal, CI) und spec („ℹ tests 3", Node 24 lokal).
        const m = /^(?:#|ℹ) (tests|pass|fail|skipped|cancelled) (\d+)\s*$/.exec(z);
        if (m) zaehler[m[1]] = Number(m[2]);
        // Eine Datei OHNE eigene Tests meldet `node --test` als einen bestandenen Test mit dem Dateinamen
        // („ok 1 - tests/e2e/x.test.mjs“ bzw. „✔ tests\e2e\x.test.mjs (…ms)“) — der Zähler allein sähe 1/1.
        const t = /^(?:(?:not )?ok \d+ - |[✔✖] )(.+?)(?: \([\d.]+ms\))?\s*$/.exec(z);
        if (t && norm(t[1]) === dateiNorm) zaehler.dateiAlsTest = true;
      }
    };
    kind.stdout.setEncoding("utf8");
    kind.stderr.setEncoding("utf8");
    kind.stdout.on("data", (s) => { process.stdout.write(s); lies(s); });
    kind.stderr.on("data", (s) => process.stderr.write(s));
    kind.on("error", (e) => resolve({ code: 1, ...zaehler, fehler: e.message }));
    kind.on("close", (code, signal) => {
      if (rest) lies(rest + "\n");
      resolve({ code: signal ? 1 : code ?? 1, ...zaehler });
    });
  });
}

function befundFuer(r) {
  if (r.fehler) return `nicht gestartet: ${r.fehler}`;
  if (r.code !== 0) return `Exit ${r.code}`;
  if (r.dateiAlsTest) return "keine eigenen Tests (node --test meldet nur die Datei selbst)";
  if (r.fail > 0 || r.cancelled > 0) return `${r.fail} rot, ${r.cancelled} abgebrochen trotz Exit 0`;
  if (r.tests === 0) return "0 Tests ausgeführt";
  if (r.pass === 0) return "kein Test bestanden";
  return null;
}

const ergebnisse = [];
const beginnGesamt = Date.now();
for (const datei of dateien) {
  const beginn = Date.now();
  const r = await fuehreSuiteAus(datei);
  const sekunden = (Date.now() - beginn) / 1000;
  const befund = befundFuer(r);
  ergebnisse.push({ datei, sekunden, befund, ...r });
  console.log(`E2E-Laufzeit ${datei} ${sekunden.toFixed(1)} s · ${r.tests} Tests, ${r.pass} bestanden, `
    + `${r.fail} rot, ${r.skipped} übersprungen${befund ? ` · ROT: ${befund}` : ""}`);
}

const summe = (k) => ergebnisse.reduce((s, e) => s + e[k], 0);
const rot = ergebnisse.filter((e) => e.befund);
console.log(`\nE2E ${kopf}: ${ergebnisse.length} von ${dateien.length} Suiten gelaufen · ${summe("tests")} Tests, `
  + `${summe("pass")} bestanden, ${summe("fail")} rot, ${summe("skipped")} übersprungen · `
  + `${((Date.now() - beginnGesamt) / 60000).toFixed(1)} min`);
if (ergebnisse.length !== dateien.length) {
  console.error("❌ Nicht jede zugeteilte Suite ist gelaufen.");
  process.exit(1);
}
if (rot.length > 0) {
  console.error(`❌ ${rot.length} von ${ergebnisse.length} Suite(n) rot:`);
  for (const e of rot) console.error(`   ${e.datei}: ${e.befund}`);
  process.exit(1);
}
console.log(`✅ Alle ${ergebnisse.length} Suiten bestanden.`);
