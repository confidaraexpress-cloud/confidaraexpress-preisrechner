// TG22 Residential — Preisbestandteile aus der Serverantwort (utils/priceComponentsView.mjs).
//
// Die Oberfläche liest Bestandteile, sie bildet keine: Bezeichnung aus dem Typ, Beträge unverändert,
// ein unbekannter oder unstimmiger Bestandteil ergibt KEINE Aufschlüsselung (fail closed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  PRICE_COMPONENT_LABELS, PRICE_COMPONENT_TYPE, readPriceComponents, hasResidentialSurcharge,
  priceSummaryComponents, hasSameDayCollectionSurcharge,
} from "./priceComponentsView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ohneKommentare = (s) => s
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const ohneTexte = (s) => s
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
  .replace(/`(?:[^`\\]|\\.)*`/g, "``");

const BASIS = Object.freeze({ type: "shipping_base", taxable: true, net: 12.34, vat: 2.34, gross: 14.68 });
const ZUSCHLAG = Object.freeze({ type: "residential_delivery_surcharge", taxable: true, net: 3.18, vat: 0.61, gross: 3.79 });
const ABSICHERUNG = Object.freeze({ type: "transport_insurance", taxable: false, net: 4.5, vat: 0, gross: 4.5 });

test("K1 — die Bezeichnungen kommen ausschließlich aus dem Typ", () => {
  // TG22 Same-Day: der Zuschlag der Abholung am selben Tag ist ein eigener Typ mit eigener Bezeichnung.
  assert.deepEqual({ ...PRICE_COMPONENT_LABELS }, {
    shipping_base: "Versand",
    same_day_collection_surcharge: "Zuschlag für Abholung am selben Tag",
    residential_delivery_surcharge: "Zuschlag Privatadresse",
    transport_insurance: "Zusätzliche Transportabsicherung",
  });
  assert.equal(PRICE_COMPONENT_TYPE.RESIDENTIAL_DELIVERY_SURCHARGE, "residential_delivery_surcharge");
  // Eine mitgelieferte Bezeichnung ändert nichts.
  const [k] = readPriceComponents([{ ...BASIS, label: "Frachtkosten Anbieter" }]);
  assert.equal(k.label, "Versand");
});

test("K2 — Geschäftsadresse: genau ein Bestandteil, eingefroren", () => {
  const liste = readPriceComponents([BASIS]);
  assert.equal(liste.length, 1);
  assert.deepEqual({ ...liste[0] }, { type: "shipping_base", label: "Versand", taxable: true, net: 12.34, vat: 2.34, gross: 14.68 });
  assert.ok(Object.isFrozen(liste) && Object.isFrozen(liste[0]));
});

test("K3 — Privatadresse mit Absicherung: Reihenfolge und Beträge unverändert, nichts gerundet", () => {
  const liste = readPriceComponents([BASIS, ZUSCHLAG, ABSICHERUNG]);
  assert.deepEqual(liste.map((k) => k.type), ["shipping_base", "residential_delivery_surcharge", "transport_insurance"]);
  assert.deepEqual(liste.map((k) => [k.net, k.vat, k.gross]), [[12.34, 2.34, 14.68], [3.18, 0.61, 3.79], [4.5, 0, 4.5]]);
  assert.deepEqual(liste.map((k) => k.taxable), [true, true, false]);
  // Fehlt `taxable`, gilt die Eigenschaft des Typs.
  assert.equal(readPriceComponents([{ type: "shipping_base", net: 1, vat: 0.19, gross: 1.19 }])[0].taxable, true);
});

test("K4 — fail closed: ein unbekannter oder unstimmiger Bestandteil ergibt keine Aufschlüsselung", () => {
  const faelle = [
    null, undefined, "shipping_base", {}, [],
    [{ ...BASIS, type: "fuel_surcharge" }],
    [BASIS, { ...ZUSCHLAG, type: "Residential Surcharge" }],
    [BASIS, BASIS],
    [ZUSCHLAG, BASIS],
    [ABSICHERUNG],
    [{ ...BASIS, net: -1 }],
    [{ ...BASIS, gross: "14.68" }],
    [{ ...BASIS, vat: Number.NaN }],
    [{ ...BASIS, net: Number.POSITIVE_INFINITY }],
    [BASIS, { ...ZUSCHLAG, taxable: false }],
    [BASIS, { ...ABSICHERUNG, taxable: true }],
    [BASIS, null],
    [BASIS, [ZUSCHLAG]],
    Array.from({ length: 9 }, () => BASIS),
  ];
  for (const f of faelle) assert.equal(readPriceComponents(f), null, JSON.stringify(f));
});

test("K5 — ein Zuschlag für die Privatadresse ist eine Aussage der Liste, keine Rechnung", () => {
  assert.equal(hasResidentialSurcharge(readPriceComponents([BASIS, ZUSCHLAG])), true);
  assert.equal(hasResidentialSurcharge(readPriceComponents([BASIS])), false);
  assert.equal(hasResidentialSurcharge(null), false);
});

test("K6 — Zeilen der Preisaufstellung nur zum bestätigten Preis und nur passend zur Absicherung", () => {
  const ohne = priceSummaryComponents({ hasConfirmedPrice: true, insuranceGross: 0, components: [BASIS, ZUSCHLAG] });
  assert.deepEqual(ohne.taxable.map((k) => k.label), ["Versand", "Zuschlag Privatadresse"]);
  assert.equal(ohne.taxFree.length, 0);

  const mit = priceSummaryComponents({ hasConfirmedPrice: true, insuranceGross: 4.5, components: [BASIS, ZUSCHLAG, ABSICHERUNG] });
  assert.deepEqual(mit.taxFree.map((k) => k.label), ["Zusätzliche Transportabsicherung"]);
  assert.equal(mit.taxFree[0].gross, 4.5);

  for (const v of [
    { hasConfirmedPrice: true, insuranceGross: 4.5, components: [BASIS, ZUSCHLAG] },
    { hasConfirmedPrice: true, insuranceGross: 0, components: [BASIS, ABSICHERUNG] },
    { hasConfirmedPrice: false, insuranceGross: 0, components: [BASIS, ZUSCHLAG] },
    { hasConfirmedPrice: true, isPriceChanged: true, insuranceGross: 0, components: [BASIS] },
    { hasConfirmedPrice: true, insuranceGross: 0, components: [BASIS, { ...ZUSCHLAG, type: "unbekannt" }] },
    { hasConfirmedPrice: true, insuranceGross: 0, components: null },
    null,
  ]) assert.equal(priceSummaryComponents(v), null, JSON.stringify(v));
});

test("K8 — TG22 Same-Day: der Zuschlag der Abholung am selben Tag ist steuerpflichtig und steht zwischen Versand und Privatadresse", () => {
  const SELBER_TAG = Object.freeze({ type: "same_day_collection_surcharge", taxable: true, net: 3.02, vat: 0.58, gross: 3.6 });
  const liste = readPriceComponents([BASIS, SELBER_TAG, ZUSCHLAG, ABSICHERUNG]);
  assert.deepEqual(liste.map((k) => k.label),
    ["Versand", "Zuschlag für Abholung am selben Tag", "Zuschlag Privatadresse", "Zusätzliche Transportabsicherung"]);
  assert.deepEqual(liste.map((k) => k.taxable), [true, true, true, false]);
  assert.equal(PRICE_COMPONENT_TYPE.SAME_DAY_COLLECTION_SURCHARGE, "same_day_collection_surcharge");
  assert.equal(hasSameDayCollectionSurcharge(liste), true);
  assert.equal(hasSameDayCollectionSurcharge(readPriceComponents([BASIS, ZUSCHLAG])), false);
  assert.equal(hasSameDayCollectionSurcharge(null), false);
  // Fail closed: steuerfrei behauptet, doppelt, oder ohne Versand an erster Stelle.
  for (const f of [[BASIS, { ...SELBER_TAG, taxable: false }], [BASIS, SELBER_TAG, SELBER_TAG], [SELBER_TAG, BASIS],
                   [BASIS, { ...SELBER_TAG, gross: "3.60" }]]) {
    assert.equal(readPriceComponents(f), null, JSON.stringify(f));
  }
  // Die Aufstellung nennt ihn netto — die MwSt. steht in der eigenen Zeile, nichts wird addiert.
  const zeilen = priceSummaryComponents({ hasConfirmedPrice: true, insuranceGross: 0, components: [BASIS, SELBER_TAG] });
  assert.deepEqual(zeilen.taxable.map((k) => [k.label, k.net]), [["Versand", 12.34], ["Zuschlag für Abholung am selben Tag", 3.02]]);
});

test("K7 — das Modul rechnet nicht und nennt keinen Anbieter", () => {
  const roh = readFileSync(path.join(HIER, "priceComponentsView.mjs"), "utf8");
  const code = ohneTexte(ohneKommentare(roh)).replace(/=>/g, "");
  assert.ok(!/[\w)\]]\s*[*/+-]\s*[\w(]/.test(code), "im Modul steht eine Rechnung");
  assert.doesNotMatch(roh, /transglobal|jumingo|quoteid|shipper_tariff_id|itemdescription/i);
  assert.doesNotMatch(roh, /\bRES\b/);
});
