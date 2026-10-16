// Übernahme aus dem öffentlichen Preisrechner nach „Neue Sendung": Patch aus den geprüften Eingaben,
// Absicht mit productKey und öffentlichem Preis, Auflösung bei genau einem Treffer, Preisvergleich —
// nie still überschrieben.
//
// Run: node --test src/utils/publicQuoteHandoff.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  CALCULATOR_INTENT_SOURCE, PUBLIC_CALCULATOR_INTENT_SOURCE, PUBLIC_PRICE_COMPARISON_TEXT, calculatorIntentNotice,
  normalizeCalculatorIntent, publicPriceComparison, publicQuoteToShipmentTransfer, resolveCalculatorIntent,
} from "./calculatorShipmentHandoff.mjs";
import { normalizeScope } from "./shippingFlowState.mjs";

const PK = "pk1_" + "A".repeat(22);
const PK2 = "pk1_" + "B".repeat(22);
const NBSP = String.fromCharCode(160);
const EINGABE = {
  from_country: "DE", from_zip: "70173", from_city: "Stuttgart", to_country: "AT", to_zip: "1010", to_city: "Wien",
  packageCount: 2, weight: 2.5, length: 30, width: 20, height: 10,
  serviceFilter: "pickup", shippingModeFilter: "express", shippingDate: "2026-10-21", publicCarrierIds: [],
};
const AUSWAHL = {
  productKey: PK, publicCarrierId: "ups", publicServiceName: "Express", priceStatus: "from",
  netPrice: 10.5, vatAmount: 2, finalPrice: 12.5, currency: "EUR",
};

test("(1) Absicht: Quelle public_calculator verlangt productKey und Namen; Preis nur in gültiger Form", () => {
  const a = normalizeCalculatorIntent({ source: PUBLIC_CALCULATOR_INTENT_SOURCE, productKey: PK, label: " UPS · Express ", publicPrice: AUSWAHL });
  assert.deepEqual(a, {
    source: "public_calculator", offerId: null, tariffId: null, label: "UPS · Express", productKey: PK,
    publicPrice: { priceStatus: "from", netPrice: 10.5, vatAmount: 2, finalPrice: 12.5, currency: "EUR" },
  });
  assert.equal(normalizeCalculatorIntent({ source: PUBLIC_CALCULATOR_INTENT_SOURCE, productKey: "pk1_zu-kurz", label: "x" }), null);
  assert.equal(normalizeCalculatorIntent({ source: PUBLIC_CALCULATOR_INTENT_SOURCE, productKey: PK, label: "" }), null);
  assert.equal(normalizeCalculatorIntent({ source: "fremd", productKey: PK, label: "x" }), null);
  assert.equal(normalizeCalculatorIntent({ source: PUBLIC_CALCULATOR_INTENT_SOURCE, productKey: PK, label: "x",
    publicPrice: { priceStatus: "irgendwas", netPrice: 1 } }).publicPrice, null);
  // Die bisherige Quelle behält ihre Form — ohne neue Felder.
  assert.deepEqual(Object.keys(normalizeCalculatorIntent({ source: CALCULATOR_INTENT_SOURCE, tariffId: 3588, label: "DHL" })).sort(),
    ["label", "offerId", "source", "tariffId"]);
});

test("(2) Patch: dieselbe Form wie die Kundenrechner-Übergabe, Eingaben vorbelegt, alles Ergebnisabhängige leer", () => {
  const p = publicQuoteToShipmentTransfer({ input: EINGABE, selection: AUSWAHL, label: "UPS · Express" });
  assert.deepEqual([p.form.s_country, p.form.s_zip, p.form.s_city, p.form.r_country, p.form.r_zip, p.form.r_city],
    ["DE", "70173", "Stuttgart", "AT", "1010", "Wien"]);
  assert.deepEqual([p.form.packageCount, p.form.weight, p.form.length, p.form.width, p.form.height], ["2", "2.5", "30", "20", "10"]);
  assert.equal(p.form.s_street ?? "", "", "Straße, Name und Firma werden in „Neue Sendung“ ergänzt — nichts erfunden");
  assert.deepEqual([p.shippingDate, p.serviceFilter, p.shippingModeFilter, p.vatMode], ["2026-10-21", "pickup", "express", "net"]);
  assert.deepEqual([p.tariffs, p.selected, p.ceShipmentId], [[], null, null]);
  assert.equal(p.calculatorIntent.source, PUBLIC_CALCULATOR_INTENT_SOURCE);
  assert.equal(p.calculatorIntent.productKey, PK);
  assert.equal(p.calculatorIntent.publicPrice.priceStatus, "from");
  // Der Vorgang trägt die Absicht unverändert (Bereich „shipment").
  assert.deepEqual(normalizeScope(p, "shipment").calculatorIntent, p.calculatorIntent);
});

test("(3) Auflösung über productKey: genau ein auswählbarer Treffer, sonst keiner", () => {
  const absicht = publicQuoteToShipmentTransfer({ input: EINGABE, selection: AUSWAHL, label: "UPS · Express" }).calculatorIntent;
  const treffer = { offerId: "o1", productKey: PK, bookable: true, netPrice: 11.2, finalPrice: 13.33 };
  const anderer = { offerId: "o2", productKey: PK2, bookable: true, netPrice: 9 };
  const ok = resolveCalculatorIntent([anderer, treffer], absicht);
  assert.deepEqual([ok.outcome, ok.offer, ok.source], ["matched", treffer, PUBLIC_CALCULATOR_INTENT_SOURCE]);
  assert.equal(resolveCalculatorIntent([anderer], absicht).outcome, "unmatched");
  assert.equal(resolveCalculatorIntent([treffer, { ...treffer, offerId: "o3" }], absicht).outcome, "unmatched", "zwei Treffer: nicht raten");
  assert.equal(resolveCalculatorIntent([{ ...treffer, bookable: false, unavailableReason: "quote_only" }], absicht).outcome, "unmatched");
  assert.match(calculatorIntentNotice({ resolution: ok, selected: treffer }), /ist ausgewählt: UPS · Express/);
});

test("(4) Preisvergleich: neuer Kundenpreis neben dem öffentlichen samt Status — Abweichung deutlich", () => {
  const absicht = publicQuoteToShipmentTransfer({ input: EINGABE, selection: AUSWAHL, label: "UPS · Express" }).calculatorIntent;
  const treffer = { offerId: "o1", productKey: PK, bookable: true, netPrice: 11.2, finalPrice: 13.33 };
  const aufloesung = resolveCalculatorIntent([treffer], absicht);
  const v = publicPriceComparison({ resolution: aufloesung, selected: treffer });
  assert.deepEqual(v, {
    publicNet: `ab 10,50${NBSP}€`, publicGross: `ab 12,50${NBSP}€`, customerNet: `11,20${NBSP}€`, customerGross: `13,33${NBSP}€`,
    changed: true, note: PUBLIC_PRICE_COMPARISON_TEXT.changed, fromNote: PUBLIC_PRICE_COMPARISON_TEXT.fromNote,
  });
  const exakt = publicQuoteToShipmentTransfer({ input: EINGABE, selection: { ...AUSWAHL, priceStatus: "exact" }, label: "UPS" }).calculatorIntent;
  const gleich = { ...treffer, netPrice: 10.5, finalPrice: 12.5 };
  const w = publicPriceComparison({ resolution: resolveCalculatorIntent([gleich], exakt), selected: gleich });
  assert.deepEqual([w.publicNet, w.changed, w.note, w.fromNote], [`10,50${NBSP}€`, false, PUBLIC_PRICE_COMPARISON_TEXT.same, null]);
  // Nur solange genau dieses Angebot ausgewählt ist; nie für die bisherige Quelle.
  assert.equal(publicPriceComparison({ resolution: aufloesung, selected: { offerId: "anders" } }), null);
  const alt = resolveCalculatorIntent([{ id: 3588, bookable: true }], { source: CALCULATOR_INTENT_SOURCE, tariffId: 3588, label: "DHL" });
  assert.equal(publicPriceComparison({ resolution: alt, selected: { id: 3588 } }), null);
});
