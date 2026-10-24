// Verteilung der Browser-E2E auf CI-Teile (Performance-Optimierung M3, 2026-10-24):
// vollständig, überschneidungsfrei, deterministisch — und passend zum Workflow, damit keine Suite still entfällt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verteileSuiten, gewichtung, suitenSchluessel } from "../../../scripts/e2eVerteilung.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SUITEN = readdirSync(path.join(WURZEL, "tests", "e2e"))
  .filter((n) => n.endsWith(".test.mjs")).sort().map((n) => path.join("tests", "e2e", n));
const LAUFZEITEN = JSON.parse(readFileSync(path.join(WURZEL, "scripts", "e2e-laufzeiten.json"), "utf8")).suiten;
const WORKFLOW = readFileSync(path.join(WURZEL, ".github", "workflows", "ci.yml"), "utf8").replace(/\r\n/g, "\n");
const JOBS_BLOCK = WORKFLOW.slice(WORKFLOW.indexOf("\njobs:\n"));

test("jede aufgefundene Suite liegt für jede Teilanzahl in genau einem Teil", () => {
  assert.ok(SUITEN.length > 0);
  for (let n = 1; n <= 12; n++) {
    const teile = verteileSuiten(SUITEN, LAUFZEITEN, n);
    assert.equal(teile.length, n);
    const verteilt = teile.flatMap((t) => t.suiten);
    assert.equal(verteilt.length, SUITEN.length, `n=${n}: Anzahl`);
    assert.equal(new Set(verteilt).size, verteilt.length, `n=${n}: doppelt verteilt`);
    assert.deepEqual([...verteilt].sort(), [...SUITEN].sort(), `n=${n}: Menge`);
  }
});

test("deterministisch: gleiche Eingaben ergeben dieselben Teile, auch in anderer Eingabereihenfolge", () => {
  assert.deepEqual(verteileSuiten(SUITEN, LAUFZEITEN, 8), verteileSuiten([...SUITEN].reverse(), LAUFZEITEN, 8));
});

test("eine neue Suite ohne Messwert läuft mit und zählt mit dem Median", () => {
  const neu = path.join("tests", "e2e", "zzNeueSuiteOhneMesswert.test.mjs");
  const teile = verteileSuiten([...SUITEN, neu], LAUFZEITEN, 8);
  assert.equal(teile.flatMap((t) => t.suiten).filter((s) => s === neu).length, 1);
  const werte = Object.values(LAUFZEITEN).sort((a, b) => a - b);
  assert.equal(gewichtung(LAUFZEITEN)(neu), werte[Math.floor(werte.length / 2)]);
});

test("Balance: schwerster und leichtester Teil liegen höchstens eine längste Suite auseinander", () => {
  const g = gewichtung(LAUFZEITEN);
  const laengste = Math.max(...SUITEN.map(g));
  for (const n of [4, 6, 8, 10]) {
    const lasten = verteileSuiten(SUITEN, LAUFZEITEN, n).map((t) => t.last);
    assert.ok(Math.max(...lasten) - Math.min(...lasten) <= laengste + 1e-9, `n=${n}`);
  }
});

test("Windows- und POSIX-Pfade ergeben denselben Laufzeitschlüssel", () => {
  assert.equal(suitenSchluessel("tests\\e2e\\a.test.mjs"), "a.test.mjs");
  assert.equal(suitenSchluessel("tests/e2e/a.test.mjs"), "a.test.mjs");
});

test("Laufzeitdatei: Dateinamen von Suiten mit positiven Sekunden", () => {
  assert.ok(Object.keys(LAUFZEITEN).length > 0);
  for (const [k, v] of Object.entries(LAUFZEITEN)) {
    assert.match(k, /^[\w.-]+\.test\.mjs$/);
    assert.ok(Number.isFinite(v) && v > 0, k);
  }
});

test("Workflow: Matrix 1…N, Aufruf --shard …/N und Jobname passen zusammen", () => {
  const matrix = JOBS_BLOCK.match(/\n {8}shard: \[([\d,\s]+)\]\n/);
  assert.ok(matrix, "keine Shard-Matrix");
  const nummern = matrix[1].split(",").map((s) => Number(s.trim()));
  const n = nummern.length;
  assert.deepEqual(nummern, Array.from({ length: n }, (_, i) => i + 1));
  assert.match(JOBS_BLOCK, new RegExp(`run: node scripts/run-e2e\\.mjs --shard \\$\\{\\{ matrix\\.shard \\}\\}/${n}\\n`));
  assert.match(JOBS_BLOCK, new RegExp(`name: Browser-E2E \\$\\{\\{ matrix\\.shard \\}\\}/${n}\\n`));
  assert.match(JOBS_BLOCK, /fail-fast: false/);
});

test("„CI-Ergebnis“ wartet auf jeden anderen Job, läuft immer und verlangt überall success", () => {
  const jobs = [...JOBS_BLOCK.matchAll(/^ {2}([a-z0-9-]+):\n/gm)].map((m) => m[1]);
  const start = JOBS_BLOCK.indexOf("\n  ergebnis:\n");
  assert.ok(start >= 0, "kein Job „ergebnis“");
  const block = JOBS_BLOCK.slice(start);
  assert.match(block, /\n {4}name: CI-Ergebnis\n/);
  assert.match(block, /\n {4}if: always\(\)\n/);
  const needs = block.match(/needs: \[([^\]]+)\]/)[1].split(",").map((s) => s.trim()).sort();
  assert.deepEqual(needs, jobs.filter((j) => j !== "ergebnis").sort());
  assert.match(block, /all\(\.value\.result == "success"\)/);
});

test("PWA-C11-Stabilitätsprüfung: drei unabhängige Durchläufe bleiben im Workflow", () => {
  assert.match(JOBS_BLOCK, /for durchlauf in 1 2 3; do/);
  assert.match(JOBS_BLOCK, /node --test --test-name-pattern="C11" tests\/e2e\/pwaInstallCta\.test\.mjs/);
});
