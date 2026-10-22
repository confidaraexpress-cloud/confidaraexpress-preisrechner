// Quellenlage des Angebotsvergleichs (Auftrag 2 / P5): ein Serverwort, ein Kundenhinweis — nie ein Quellenname.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_COVERAGE, PARTIAL_COVERAGE_NOTICE, readSourceCoverage, sourceCoverageNotice } from "./sourceCoverageView.mjs";
import { normalizeApiError, ERROR_TYPE } from "./apiError.mjs";

const hier = path.dirname(fileURLToPath(import.meta.url));
const quelle = (p) => fs.readFileSync(path.join(hier, "..", p), "utf8");

test("1 — nur die drei Serverwerte werden gelesen, alles andere ist null", () => {
  assert.equal(readSourceCoverage({ sourceCoverage: "complete" }), SOURCE_COVERAGE.COMPLETE);
  assert.equal(readSourceCoverage({ sourceCoverage: "partial" }), SOURCE_COVERAGE.PARTIAL);
  assert.equal(readSourceCoverage({ sourceCoverage: "unavailable" }), SOURCE_COVERAGE.UNAVAILABLE);
  for (const w of [undefined, null, "", "PARTIAL", "jumingo", 1, {}]) {
    assert.equal(readSourceCoverage({ sourceCoverage: w }), null, String(w));
  }
  assert.equal(readSourceCoverage(null), null);
  assert.equal(readSourceCoverage({}), null);
});

test("2 — der Hinweis erscheint ausschließlich bei partial; eine Antwort ohne das Feld behauptet nichts", () => {
  assert.equal(sourceCoverageNotice({ sourceCoverage: "partial" }), PARTIAL_COVERAGE_NOTICE);
  assert.equal(sourceCoverageNotice({ sourceCoverage: "complete" }), null);
  assert.equal(sourceCoverageNotice({ sourceCoverage: "unavailable" }), null);
  assert.equal(sourceCoverageNotice({ tariffs: [] }), null);
  assert.equal(sourceCoverageNotice(undefined), null);
});

test("3 — White Label: der Hinweis nennt keine Einkaufsquelle und keinen Anbieter, aber die Handlung", () => {
  assert.doesNotMatch(PARTIAL_COVERAGE_NOTICE, /jumingo|transglobal|anbieter|provider/i);
  assert.match(PARTIAL_COVERAGE_NOTICE, /unvollständig/);
  assert.match(PARTIAL_COVERAGE_NOTICE, /erneute Berechnung/);
});

test("4 — ein technischer Ausfall aller Quellen ist KEIN „Keine Angebote“: QUOTE_SOURCES_UNAVAILABLE ist technisch und wiederholbar", () => {
  const n = normalizeApiError({ status: 503, body: { error: "x", code: "QUOTE_SOURCES_UNAVAILABLE", sourceCoverage: "partial" } });
  assert.equal(n.code, "QUOTE_SOURCES_UNAVAILABLE");
  assert.equal(n.type, ERROR_TYPE.TECHNICAL);
  assert.equal(n.retryable, true);
  assert.doesNotMatch(n.title, /Keine Angebote/);
  assert.match(n.message, /erneut/);
  assert.doesNotMatch(n.message, /jumingo|transglobal/i);
  // Der fachliche Fall bleibt, was er war.
  const leer = normalizeApiError({ status: 422, body: { error: "Keine Preise gefunden", code: "NO_RATES_FOUND", sourceCoverage: "complete" } });
  assert.equal(leer.type, ERROR_TYPE.BUSINESS);
  assert.equal(leer.retryable, false);
});

test("5 — Verdrahtung: beide Rechnerseiten lesen das Serverwort und reichen den Hinweis an die Angebotsliste", () => {
  for (const seite of ["pages/CalculatorPage.jsx", "pages/NewShipmentPage.jsx"]) {
    const src = quelle(seite);
    assert.ok(src.includes("sourceCoverageNotice(d)"), `${seite}: liest das Serverwort nicht`);
    assert.ok(src.includes("coverageNotice={coverageNotice}"), `${seite}: reicht den Hinweis nicht an die Liste`);
  }
  const liste = quelle("components/offers/OffersList.jsx");
  assert.ok(liste.includes("coverageNotice") && liste.includes("offers-coverage-notice"), "die Liste zeigt den Hinweis nicht");
});
