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
 * Verteilt wird REIHUM (Datei k → Teil k mod n), nicht in Blöcken: die
 * Laufzeiten der Suiten sind sehr ungleich, und aufeinanderfolgende Dateien
 * gehören oft zum selben Themengebiet und sind dann ähnlich teuer. Blockweise
 * bekäme ein Teil alle schweren.
 *
 * WICHTIG: Der Aufteilung liegt dieselbe Auffindung zugrunde wie dem vollen
 * Lauf. Es gibt genau eine Quelle für „welche Dateien gibt es" — lokal und in
 * der CI. Zwei getrennte Listen wären wieder der Fehler von oben.
 *
 *   node scripts/run-e2e.mjs                 alle Suiten
 *   node scripts/run-e2e.mjs --shard 2/4     nur der zweite von vier Teilen
 *   node scripts/run-e2e.mjs --list          nur auflisten, nichts starten
 */
import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const dateien = shard
  ? alle.filter((_, k) => k % shard.gesamt === shard.teil - 1)
  : alle;

const kopf = shard ? `Teil ${shard.teil}/${shard.gesamt}` : "vollständig";
console.log(`E2E ${kopf}: ${dateien.length} von ${alle.length} Suiten`);
for (const d of dateien) console.log("  ·", d);

if (argv.includes("--list")) process.exit(0);

if (dateien.length === 0) {
  // Mehr Teile als Dateien: kein Fehler, es gibt für diesen Teil nichts zu tun.
  console.log("Für diesen Teil gibt es keine Suite — nichts zu tun.");
  process.exit(0);
}

/* --test-concurrency=1: jede Suite belegt einen festen Port für ihren
   Dev-Server. Parallel gestartet kollidieren sie (`--strictPort`). */
const kind = spawn(
  process.execPath,
  ["--test", "--test-concurrency=1", ...dateien],
  { cwd: WURZEL, stdio: "inherit" }
);
kind.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 1));
