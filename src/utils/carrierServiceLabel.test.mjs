// F4 (Premium-Redesign Etappe 1): zusammengesetzte Bezeichnung ohne doppelten Carriernamen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { carrierServiceLabel } from "./carrierServiceLabel.mjs";

const hier = path.dirname(fileURLToPath(import.meta.url));
const code = (rel) => readFileSync(path.join(hier, rel), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("1 — ohne Präfix bleibt die Zusammensetzung wörtlich", () => {
  assert.equal(carrierServiceLabel("UPS", "Expressversand", " — "), "UPS — Expressversand");
  assert.equal(carrierServiceLabel("UPS", "Standard Samstagszustellung"), "UPS · Standard Samstagszustellung");
  assert.equal(carrierServiceLabel("GLS", "Standardversand"), "GLS · Standardversand");
});

test("2 — beginnt der Service mit dem Carrier, steht der Carrier nur einmal da", () => {
  assert.equal(carrierServiceLabel("DHL", "DHL Paket", " — "), "DHL Paket");
  assert.equal(carrierServiceLabel("UPS", "UPS Express Saver"), "UPS Express Saver");
  assert.equal(carrierServiceLabel("DHL", "dhl Paket"), "dhl Paket", "Groß- und Kleinschreibung zählt nicht");
  assert.equal(carrierServiceLabel("DHL", "DHL"), "DHL");
  assert.equal(carrierServiceLabel("DHL", "DHL-Paket"), "DHL-Paket");
});

test("3 — nur ganze Wörter: ein längeres Wort mit gleichem Anfang ist kein Präfix", () => {
  assert.equal(carrierServiceLabel("DHL", "DHLX Kurier"), "DHL · DHLX Kurier");
  assert.equal(carrierServiceLabel("UPS", "Upsell"), "UPS · Upsell");
});

test("4 — fehlende Teile: kein leerer Trenner, keine erfundene Angabe", () => {
  assert.equal(carrierServiceLabel("", "Expressversand"), "Expressversand");
  assert.equal(carrierServiceLabel("UPS", ""), "UPS");
  assert.equal(carrierServiceLabel(null, undefined), "");
  assert.equal(carrierServiceLabel("  DHL ", " Paket "), "DHL · Paket");
});

test("5 — jede Zusammensetzung der Oberfläche läuft über den Helfer", () => {
  const stellen = [
    ["../components/booking/BookingSuccessStep.jsx", /carrierServiceLabel\(publicCarrierDisplay\(tariff\)\.name, publicServiceName\(tariff\), " — "\)/],
    ["../pages/BookingPage.jsx", /carrierServiceLabel\(publicCarrierDisplay\(tariff\)\.name, publicServiceName\(tariff\), " — "\)/],
    ["../pages/CalculatorPage.jsx", /label: carrierServiceLabel\(publicCarrierDisplay\(tariff\)\.name, publicServiceName\(tariff\)\)/],
    ["../pages/PublicQuoteHandoffPage.jsx", /const label = carrierServiceLabel\(publicCarrierDisplay\(auswahl\)\.name, publicServiceName\(auswahl\)\);/],
  ];
  for (const [datei, muster] of stellen) {
    const q = code(datei);
    assert.match(q, muster, `${datei}: Zusammensetzung ohne Doppelungsschutz`);
    assert.doesNotMatch(q, /\.name\} — \{publicServiceName|\.name\} · \$\{publicServiceName/, `${datei}: freie Zusammensetzung übrig`);
  }
});
