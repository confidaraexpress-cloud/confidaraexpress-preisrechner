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

test("1 — jede Suite mit Dev-Server startet ihn in einer EIGENEN Prozessgruppe", () => {
  const ohne = serverSuiten()
    .filter(({ src }) => !/detached:\s*true/.test(src))
    .map(({ name }) => name);

  assert.deepEqual(ohne, [],
    "Ohne `detached: true` gehoert der Dev-Server zur Prozessgruppe des Testlaufs.\n" +
    "Ein Gruppenkill ist dann nicht moeglich, und der Server ueberlebt die Suite:\n  " +
    ohne.join("\n  "));
});

test("2 — jede Suite mit Dev-Server beendet die PROZESSGRUPPE, nicht nur das Kind", () => {
  const ohne = serverSuiten()
    .filter(({ src }) => !/process\.kill\(\s*-\s*server\.pid/.test(src))
    .map(({ name }) => name);

  assert.deepEqual(ohne, [],
    "npx startet `sh -c vite`, das node startet. Ein Signal an den npx-Prozess\n" +
    "laesst den Enkel — den eigentlichen Dev-Server — auf seinem Port stehen:\n  " +
    ohne.join("\n  "));
});

test("3 — der Gruppenkill steht im Teardown und ist gegen ESRCH gefasst", () => {
  /* Ein bereits beendeter Server ist kein Testfehler: `process.kill` auf eine
     leere Gruppe wirft ESRCH. Ohne `try` risse das den `test.after`-Haken auf
     und faerbte eine erfolgreiche Suite rot — der Aufraeumcode wuerde damit
     genau das kaputtmachen, wofuer er da ist. */
  const fehler = [];
  for (const { name, src } of serverSuiten()) {
    // Beide Schreibweisen sind gleichwertig: `test.after(…)` und der aus
    // `node:test` importierte Haken `after(…)`. Drei Suiten nutzen die zweite.
    if (!/\bafter\s*\(/.test(src)) {
      fehler.push(`${name}: kein after-Haken — der Server wird nie beendet`);
      continue;
    }
    const zeile = src.split("\n").find((z) => /process\.kill\(\s*-\s*server\.pid/.test(z));
    if (zeile && !/try\s*\{/.test(zeile)) {
      fehler.push(`${name}: Gruppenkill ohne try — ESRCH wuerde den Teardown aufreissen`);
    }
  }
  assert.deepEqual(fehler, [], fehler.join("\n"));
});
