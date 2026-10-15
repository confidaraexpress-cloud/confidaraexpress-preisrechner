/* Jede E2E-Suite muss ihren Dev-Server WIRKLICH beenden.
 *
 * ── Der gemessene Fehler ──────────────────────────────────────────────────
 * `spawn("npx", ["vite", …])` erzeugt keinen Prozess, sondern drei:
 *
 *     npx  ->  sh -c vite  ->  node …/node_modules/.bin/vite
 *              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *              der eigentliche Dev-Server, der den Port haelt
 *
 * `server.kill(…)` signalisiert nur den npx-Prozess. Kind und Enkel bleiben
 * stehen — mitsamt dem gebundenen Port. Im Messlauf war das eindeutig: von
 * den Suiten OHNE Gruppenkill hinterliess jede einzelne ihren Server
 * (`authErrors` 5225, `adminDraftDeletion` 5236, `bookingOptionControls`
 * 5248, `addressValidation` 5263 …), waehrend `adminOverviewMetrics` — mit
 * `detached` + `process.kill(-pid)` — sauber aufraeumte.
 *
 * Die Folge ist keine Kleinigkeit: nach einem vollen Lauf stehen ~30
 * Dev-Server auf ihren Ports. Ein ZWEITER `npm run test:e2e` auf derselben
 * Maschine faellt damit in JEDER Suite aus, weil `--strictPort` nicht
 * ausweicht — und zwar jedes Mal erst nach der vollen Startfrist von 90
 * Sekunden. Der Lauf ist dann nicht mehr wiederholbar, und genau das ist
 * der Zweck dieser Testinfrastruktur.
 *
 * ── Warum BEIDE Teile noetig sind ─────────────────────────────────────────
 * `detached: true` macht das Kind zum Anfuehrer einer eigenen Prozessgruppe;
 * erst dadurch adressiert `process.kill(-pid)` die ganze Gruppe. Ohne
 * `detached` gehoerte das Kind zur Gruppe des Testlaufs — ein negatives
 * Signal traefe dann den Testlauf selbst oder liefe ins Leere. Ohne den
 * Gruppenkill wiederum nuetzt `detached` nichts: es entkoppelt den Enkel nur
 * zusaetzlich. Die beiden Zeilen sind ein Paar, deshalb pruefen sie hier
 * gemeinsam.
 *
 * Der zweite Kill auf das Kind bleibt als Rueckfallebene stehen: ist die
 * Gruppe bereits weg, wirft der erste Aufruf ESRCH, und der zweite raeumt
 * einen etwaigen Rest ab. Beide sind deshalb in `try` gefasst — ein bereits
 * beendeter Server ist kein Testfehler.
 *
 * ── Windows ───────────────────────────────────────────────────────────────
 * Dort gibt es weder Prozessgruppen-Signale noch ein harmloses `detached`:
 * ein detached-Kind hat keine Konsole, und `cmd.exe` der Volta-Shims oeffnet
 * dann je Suite ein sichtbares Terminalfenster; `process.kill(-pid)` wirft
 * immer, Vite blieb samt Port stehen. Beides kapselt deshalb EIN Helfer,
 * `helpers/devServer.mjs`: `DEV_SERVER_SPAWN` (POSIX `detached`, Windows
 * `windowsHide`) und `stopDevServer` (POSIX Gruppenkill, Windows
 * `taskkill /T`). Die Suiten benutzen nur den Helfer; die Pruefungen unten
 * stellen sicher, dass keine an ihm vorbei startet oder beendet.
 *
 * Schwesterdatei: `portUniqueness.test.mjs` deckt dieselbe Fehlerklasse von
 * der anderen Seite ab (zwei Suiten auf EINEM Port). Beide brauchen keinen
 * Browser und laufen deshalb im Unit-Lauf mit: `npm test` sucht neben `src/`
 * ausdruecklich auch `tests/e2e/helpers/*.test.mjs` ab. `scripts/run-e2e.mjs`
 * startet sie bewusst NICHT als Browsersuite (es sucht `tests/e2e/*.test.mjs`,
 * nicht rekursiv).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer, isStillRunning } from "./devServer.mjs";

const E2E = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Alle Suiten, die sich einen Dev-Server starten.
 *
 * Erkannt wird `server = spawn(` — die einheitliche Schreibweise dieses
 * Repositories. Bewusst NICHT `spawn("npx", ["vite"…])`: zwei Suiten
 * (`insuranceTerms`, `newShipmentFloatingLabels`) starten denselben Server
 * ueber `npm run dev` und faenden dann gar nicht statt. Eine Pruefung, die
 * einen Teil ihres Gegenstands nicht sieht, meldet Gruen fuer etwas, das sie
 * nie angeschaut hat — genau die Luecke, die dieses Haertungspaket beseitigt.
 */
function serverSuiten() {
  return readdirSync(E2E)
    .filter((n) => n.endsWith(".test.mjs"))
    .sort()
    .map((name) => ({ name, src: readFileSync(path.join(E2E, name), "utf8") }))
    .filter(({ src }) => /\bserver\s*=\s*spawn\(/.test(src));
}

test("0 — die Pruefung sieht ALLE Suiten, die einen Dev-Server starten", () => {
  /* Gegenprobe zur Erkennung selbst: jede Datei, die irgendwo `spawn(` ruft,
     muss auch von `serverSuiten()` erfasst sein. Sonst waeren die drei
     folgenden Tests fuer sie stumm. */
  const erkannt = new Set(serverSuiten().map((s) => s.name));
  const uebersehen = readdirSync(E2E)
    .filter((n) => n.endsWith(".test.mjs"))
    .filter((n) => /\bspawn\(/.test(readFileSync(path.join(E2E, n), "utf8")))
    .filter((n) => !erkannt.has(n));

  assert.deepEqual(uebersehen, [],
    `Suite ruft spawn(), wird aber nicht als Dev-Server-Suite erkannt — die\n` +
    `Teardown-Pruefung greift dort nicht: ${uebersehen.join(", ")}`);
});

/** Der Text des spawn-Aufrufs, von `server = spawn(` bis zum schliessenden `);`. */
function spawnStatement(src) {
  const m = /\bserver\s*=\s*spawn\(/.exec(src);
  if (!m) return null;
  const ende = src.indexOf(");", m.index);
  return ende === -1 ? null : src.slice(m.index, ende + 2);
}

/** Die Schluessel, die DIREKT im Optionsobjekt des Aufrufs stehen — nicht in
 *  einem verschachtelten Objekt darin. Ein Spread zaehlt als `...NAME`.
 *
 *  Das ist keine Spitzfindigkeit, sondern ein gemessener Fehler: in
 *  `newShipmentEmptyState` landete `detached` zunaechst INNERHALB von
 *  `env: { … }`. Dort ist es bedeutungslos — es wird zu einer
 *  Umgebungsvariable namens „detached" — und der Dev-Server lief undetached
 *  weiter. Eine reine Textsuche sah die Zeile und war zufrieden; der Server
 *  ueberlebte den Lauf trotzdem. Deshalb wird hier die Klammertiefe
 *  mitgezaehlt statt nur nach Text zu suchen. */
function optionsSchluessel(stmt) {
  const schluessel = [];
  let paren = 0, brace = 0, bracket = 0, optionsTiefe = null;
  for (let i = 0; i < stmt.length; i++) {
    const c = stmt[i];
    if (c === "(") paren++;
    else if (c === ")") paren--;
    else if (c === "[") bracket++;
    else if (c === "]") bracket--;
    else if (c === "{") {
      brace++;
      // Das Optionsobjekt ist das erste `{` direkt in der Argumentliste.
      if (optionsTiefe === null && paren === 1 && bracket === 0) optionsTiefe = brace;
    } else if (c === "}") brace--;
    else if (optionsTiefe !== null && brace === optionsTiefe && bracket === 0) {
      const m = /^(\.\.\.\w+|\w+)\s*(?=[:,}\s])/.exec(stmt.slice(i));
      if (m && /[{,\s]/.test(stmt[i - 1])) { schluessel.push(m[1]); i += m[1].length - 1; }
    }
  }
  return schluessel;
}

test("1 — jede Suite startet ihren Dev-Server mit DEV_SERVER_SPAWN und ueberschreibt es nicht", () => {
  const fehler = [];
  for (const { name, src } of serverSuiten()) {
    const stmt = spawnStatement(src);
    const s = stmt ? optionsSchluessel(stmt) : [];
    if (!s.includes("...DEV_SERVER_SPAWN")) fehler.push(`${name}: \`...DEV_SERVER_SPAWN\` fehlt im Optionsobjekt`);
    // Ein eigenes `detached`/`windowsHide` daneben hebelte den Helfer aus —
    // auf Windows hiesse das wieder ein Konsolenfenster je Suite.
    for (const k of ["detached", "windowsHide"]) {
      if (s.includes(k)) fehler.push(`${name}: eigenes \`${k}\` neben DEV_SERVER_SPAWN`);
    }
  }
  assert.deepEqual(fehler, [],
    "Jede Suite startet ihren Server ueber `helpers/devServer.mjs` (in einem\n" +
    "verschachtelten `env: {…}` wirkt der Spread NICHT). Ohne eigene Prozessgruppe\n" +
    "ueberlebt der Server die Suite (POSIX), mit `detached` oeffnet er ein\n" +
    "Konsolenfenster (Windows):\n  " + fehler.join("\n  "));
});

test("2 — jede Suite beendet den Server ueber stopDevServer, nicht an ihm vorbei", () => {
  const fehler = [];
  for (const { name, src } of serverSuiten()) {
    if (!/\bstopDevServer\(\s*server\b/.test(src)) fehler.push(`${name}: kein stopDevServer(server, …)`);
    // Direkte Gruppenkills sind POSIX-only: unter Windows werfen sie immer, und
    // `server.kill()` allein laesst den Enkel — den eigentlichen Dev-Server — stehen.
    if (/process\.kill\(\s*-/.test(src)) fehler.push(`${name}: direkter process.kill(-…) statt stopDevServer`);
  }
  assert.deepEqual(fehler, [], fehler.join("\n"));
});

test("3 — der Aufruf steht in einem after-Haken", () => {
  // Beide Schreibweisen sind gleichwertig: `test.after(…)` und der aus
  // `node:test` importierte Haken `after(…)`. Drei Suiten nutzen die zweite.
  const ohne = serverSuiten()
    .filter(({ src }) => !/\bafter\s*\(/.test(src))
    .map(({ name }) => `${name}: kein after-Haken — der Server wird nie beendet`);
  assert.deepEqual(ohne, [], ohne.join("\n"));
});

test("4 — DEV_SERVER_SPAWN: POSIX eigene Prozessgruppe, Windows unsichtbare Konsole ohne detached", () => {
  assert.equal(DEV_SERVER_SPAWN.windowsHide, true);
  assert.equal(DEV_SERVER_SPAWN.detached, process.platform !== "win32");
  assert.ok(Object.isFrozen(DEV_SERVER_SPAWN), "eine Suite darf die gemeinsamen Optionen nicht veraendern");
});

test("5 — stopDevServer beendet Kind UND Enkel und wirft bei einem beendeten Server nicht", async () => {
  /* Nachgebaut wie `npx -> sh -c vite -> node`: das Kind startet einen Enkel,
     meldet dessen PID und bleibt stehen. Geprueft wird am Enkel — er haelt im
     echten Lauf den Port. */
  const kindCode =
    "const { spawn } = require('node:child_process');" +
    "const e = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });" +
    "console.log(e.pid); setInterval(() => {}, 1000);";
  const kind = spawn(process.execPath, ["-e", kindCode], { ...DEV_SERVER_SPAWN, stdio: ["ignore", "pipe", "ignore"] });
  const enkelPid = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("Enkel meldet sich nicht")), 10000);
    kind.stdout.once("data", (d) => { clearTimeout(t); res(Number(String(d).trim())); });
  });
  const lebt = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  assert.ok(lebt(enkelPid), "Vorbedingung: der Enkel laeuft");

  stopDevServer(kind, "SIGKILL");
  const ende = Date.now() + 5000;
  while (lebt(enkelPid) && Date.now() < ende) await new Promise((r) => setTimeout(r, 100));
  assert.equal(lebt(enkelPid), false, "der Enkel muss mit dem Kind fallen");

  assert.doesNotThrow(() => stopDevServer(kind, "SIGKILL"), "zweiter Aufruf auf beendeten Server");
  assert.doesNotThrow(() => stopDevServer(null), "kein Server gestartet");
});

test("6 — Windows: taskkill nur fuer den eigenen, noch laufenden Prozess (keine neu vergebene PID)", () => {
  /* Nach dem Ende eines Kindes darf Windows seine PID neu vergeben. `taskkill /PID … /T`
     auf eine solche PID beendete einen FREMDEN Prozessbaum — eine andere Suite, ein
     anderes Projekt oder eine laufende Claude-Sitzung. Deshalb ruft stopDevServer
     taskkill nur, solange Node den Prozess noch als laufend kennt. */
  assert.equal(isStillRunning({ pid: 4242, exitCode: null, signalCode: null }), true);
  assert.equal(isStillRunning({ pid: 4242, exitCode: 0, signalCode: null }), false, "mit Exitcode beendet");
  assert.equal(isStillRunning({ pid: 4242, exitCode: null, signalCode: "SIGKILL" }), false, "per Signal beendet");
  assert.equal(isStillRunning({ pid: undefined, exitCode: null, signalCode: null }), false, "nie gestartet");
  assert.equal(isStillRunning(null), false);
  const helfer = readFileSync(path.join(E2E, "helpers", "devServer.mjs"), "utf8");
  const vorTaskkill = helfer.slice(0, helfer.indexOf('spawnSync("taskkill"'));
  assert.ok(vorTaskkill.slice(vorTaskkill.lastIndexOf("if (WINDOWS)")).includes("if (isStillRunning(server))"),
    "taskkill muss hinter der Laufpruefung stehen");
  assert.ok(!/taskkill[^\n]*\/IM|Stop-Process|pkill|killall/.test(helfer), "kein Beenden nach Prozessname");
});
