// Sofortkorrektur B (Auftrag 1, 2026-10-17): Grenzzeilen der Angebotsdetails deutsch formatiert.
// Das Verhalten im Browser prüft tests/e2e/tg22ProductDetails.test.mjs (E: „31,5 kg“) und
// tests/e2e/tg22ReferenceFlow.test.mjs (Singular „max. 1 Packstück“).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./OfferCard.jsx", import.meta.url), "utf8");

test("B — buildLimitLines formatiert jede Grenze de-DE (31,5 statt 31.5)", () => {
  assert.match(src, /const LIMIT_NUMBER = new Intl\.NumberFormat\("de-DE", \{ maximumFractionDigits: 2 \}\);/);
  assert.match(src, /rule\.tpl\(opWord, LIMIT_NUMBER\.format\(num\), num\)/, "die Zahl geht roh in den Satz");
  assert.doesNotMatch(src, /rule\.tpl\(opWord, num\)/);
  const f = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
  assert.equal(f.format(31.5), "31,5");
  assert.equal(f.format(2), "2");
  assert.equal(f.format(0.25), "0,25");
});

test("B — der Singular hängt an der Zahl, nicht am formatierten Text", () => {
  // Der formatierte Wert ist ein String; „v === 1“ wäre nie wahr und machte aus
  // „max. 1 Packstück“ ein „max. 1 Packstücke“ (in der CI gemessen).
  assert.match(src, /packages_count:\s+\{ order: 4, tpl: \(op, v, n\) => n === 1/);
});
