/* Jede Browser-E2E-Suite braucht ihren EIGENEN Dev-Server-Port.
 *
 * ── Der gemessene Fehler ──────────────────────────────────────────────────
 * Sieben Ports wurden von fünfzehn Suiten geteilt, einer davon von dreien:
 *
 *     5241  inventoryModule · newShipmentEmptyState · parcelShopParity
 *     5253  legalBookingGate · newShipmentFloatingLabels
 *     5225  authErrors · shippingProcessPaketB
 *     …
 *
 * Solange alles streng nacheinander läuft und jede Suite ihren Server sauber
 * beendet, fällt das nicht auf. Beides ist aber nicht garantiert:
 *
 *   · Jede Suite startet ihren Server mit `--strictPort`. Hängt der Server der
 *     vorherigen Suite auch nur eine Sekunde nach — ein `SIGKILL` wirkt nicht
 *     augenblicklich, und ein abgebrochener Lauf hinterlässt Waisen —, dann
 *     bindet die nächste Suite nicht und meldet „Dev-Server startet nicht".
 *     Genau so ist `newShipmentFloatingLabels` reproduzierbar ausgefallen,
 *     unmittelbar nach `legalBookingGate` auf demselben Port 5253.
 *   · Der Fehler sieht aus wie Flakiness, ist aber deterministisch. Er kostet
 *     jedes Mal die volle Startfrist von 90 Sekunden, bevor er sich meldet.
 *   · Mit der Aufteilung auf mehrere Läufe (`scripts/run-e2e.mjs --shard`)
 *     wird die Annahme „läuft ohnehin alles nacheinander" endgültig unhaltbar.
 *
 * Ein eindeutiger Port je Suite beseitigt die ganze Fehlerklasse. Diese Datei
 * hält das fest — sie ist billig und läuft ohne Browser.
 *
 * Hinweis zur Einhängung: die Datei liegt unter `tests/e2e/helpers/` und wird
 * von `scripts/run-e2e.mjs` bewusst NICHT als Browsersuite gestartet (das sucht
 * nur `tests/e2e/*.test.mjs`, nicht rekursiv) — sie braucht keinen Browser.
 * Gelaufen wird sie über `npm test`, dessen zweites Suchmuster genau dieses
 * Verzeichnis abdeckt:
 *
 *     node --test "src/**\/*.test.mjs" "tests/e2e/helpers/*.test.mjs"
 *
 * Diese Zeile stand hier zunächst falsch: sie behauptete einen eigenen
 * CI-Schritt, den es nie gab — die Datei lief damit in KEINEM Lauf. Das ist
 * exakt der Fehler, gegen den dieses Härtungspaket angetreten ist
 * (`voucherUx.test.mjs` und `addressValidation.test.mjs` lagen ebenso da,
 * ohne je ausgeführt zu werden). Wer das Suchmuster aus `package.json`
 * entfernt, stellt ihn wieder her.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const E2E = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function suitenPorts() {
  const treffer = [];
  for (const name of readdirSync(E2E).filter((n) => n.endsWith(".test.mjs")).sort()) {
    const src = readFileSync(path.join(E2E, name), "utf8");
    // Alle Portliterale der Datei — nicht nur das erste. Eine Suite, die sich
    // einen zweiten Server startet, muss ebenfalls auffallen.
    for (const m of src.matchAll(/\bPORT\w*\s*=\s*(\d{4,5})\b/g)) {
      treffer.push({ suite: name, port: Number(m[1]) });
    }
  }
  return treffer;
}

test("1 — jede E2E-Suite hat einen EIGENEN Dev-Server-Port", () => {
  const alle = suitenPorts();
  assert.ok(alle.length > 0, "keine Portdeklaration gefunden — hat sich das Muster geändert?");

  const nachPort = new Map();
  for (const { suite, port } of alle) {
    if (!nachPort.has(port)) nachPort.set(port, new Set());
    nachPort.get(port).add(suite);
  }

  const kollisionen = [...nachPort.entries()]
    .filter(([, suiten]) => suiten.size > 1)
    .map(([port, suiten]) => `  ${port}: ${[...suiten].join(", ")}`);

  assert.deepEqual(kollisionen, [],
    "Portkollision — mit --strictPort scheitert die zweite Suite, sobald der\n" +
    "Server der ersten auch nur kurz nachhängt:\n" + kollisionen.join("\n"));
});

test("2 — jede Suite, die einen Dev-Server startet, deklariert auch ihren Port", () => {
  /* Nicht jede Suite braucht einen Server: `fontWeightAxis` liest die
     Schriftdateien direkt und öffnet Chromium ohne Seite. Die Bedingung ist
     deshalb nicht „hat einen Port", sondern „wer einen Server startet, hat
     einen". Sonst müsste man beim nächsten serverlosen Test wieder eine
     Ausnahme eintragen — und Ausnahmelisten sind genau das Problem, das
     dieses Härtungspaket beseitigt. */
  const mitPort = new Set(suitenPorts().map((t) => t.suite));
  const ohne = readdirSync(E2E)
    .filter((n) => n.endsWith(".test.mjs"))
    .filter((n) => /spawn\(\s*["']npx["']\s*,\s*\[\s*["']vite["']/.test(readFileSync(path.join(E2E, n), "utf8")))
    .filter((n) => !mitPort.has(n));
  assert.deepEqual(ohne, [],
    `Suite startet einen Dev-Server, deklariert aber keinen Port — die Eindeutigkeitsprüfung greift dort nicht: ${ohne.join(", ")}`);
});

test("3 — die Ports liegen in einem Bereich, der keine üblichen Dienste trifft", () => {
  // 5432 PostgreSQL, 3000/3001 Node-Server, 5173 Vite-Standard, 8080 Proxys.
  const VERBOTEN = new Set([3000, 3001, 5173, 5432, 6379, 8080, 8000, 80, 443]);
  const belegt = suitenPorts().filter(({ port }) => VERBOTEN.has(port));
  assert.deepEqual(belegt, [],
    `Suite belegt einen Port, auf dem üblicherweise ein echter Dienst läuft: ` +
    belegt.map((b) => `${b.suite} → ${b.port}`).join(", "));
});
