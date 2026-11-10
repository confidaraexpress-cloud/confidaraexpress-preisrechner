// „Auf einen Blick“ der Admin-Detailseiten (Admin-Vereinfachung, Betreiberauftrag 2026-11-10).
// Nur Serverwerte, nichts gerechnet; Unbekanntes entfällt statt als 0 zu erscheinen.
//
// Run: node --test src/utils/adminFactsView.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { billingModeFact, creditFact, markupFact, openAmountFact } from "./adminFactsView.mjs";
import { selectPriceMarkup } from "./customerMarkup.mjs";

const euro = (s) => s.replace(/ /g, " ");

test("Aufschlag: bestätigt mit wirksamem Expresssatz, unbestätigt als Warnung, unbekannt entfällt", () => {
  const bestaetigt = selectPriceMarkup({ priceMarkupPercent: 20, expressPriceMarkupPercent: 30, effectiveExpressPriceMarkupPercent: 30, confirmed: true });
  assert.deepEqual(markupFact(bestaetigt), { label: "Aufschlag", value: "20,00 %", hint: "Express 30,00 %" });
  const offen = selectPriceMarkup({ priceMarkupPercent: 20, confirmed: false });
  const f = markupFact(offen);
  assert.equal(f.value, "20,00 %");
  assert.equal(f.hint, "Noch nicht bestätigt");
  assert.equal(f.tone, "warning");
  for (const p of [null, undefined, {}, { priceMarkupPercent: null }]) assert.equal(markupFact(p), null, JSON.stringify(p));
});

test("Buchungsrahmen: verfügbarer Betrag aus der Serverantwort, ausgeschöpft als Warnung im Text", () => {
  const f = creditFact({ credit: { limit: 1500, open: 50, reserved: 0, available: 1450 } });
  assert.equal(f.label, "Buchungsrahmen frei");
  assert.equal(euro(f.value), "1.450,00 €");
  assert.equal(euro(f.hint), "Rahmen 1.500,00 €");
  assert.equal(f.tone, undefined);
  const voll = creditFact({ credit: { limit: 100, open: 100, reserved: 0, available: 0, exhausted: true } });
  assert.match(voll.hint, /^ausgeschöpft · Rahmen/);
  assert.equal(voll.tone, "warning");
  // Ohne vollständige Werte (altes Backend) kein Eintrag — nie ein erfundener Rahmen.
  for (const p of [null, {}, { credit: { limit: 100 } }]) assert.equal(creditFact(p), null, JSON.stringify(p));
});

test("Offener Betrag: nur mit Serverwert; überfällige Rechnungen färben den Wert und stehen im Text", () => {
  assert.equal(openAmountFact({ openAmount: null }), null);
  assert.equal(openAmountFact(null), null);
  const ok = openAmountFact({ openAmount: 120.5, invoicesUnpaid: 2, invoicesOverdue: 0 });
  assert.equal(euro(ok.value), "120,50 €");
  assert.equal(ok.hint, "2 offene Rechnungen");
  assert.equal(ok.tone, undefined);
  assert.equal(openAmountFact({ openAmount: 10, invoicesUnpaid: 1, invoicesOverdue: 0 }).hint, "1 offene Rechnung");
  const ueber = openAmountFact({ openAmount: 99, invoicesUnpaid: 3, invoicesOverdue: 2 });
  assert.equal(ueber.hint, "2 überfällig");
  assert.equal(ueber.tone, "danger");
});

test("Abrechnung: Alltagssprache für die zwei belegten Modi, sonst kein Eintrag", () => {
  assert.deepEqual(billingModeFact("single"), { label: "Abrechnung", value: "Einzelrechnung", hint: "je Sendung" });
  assert.deepEqual(billingModeFact("consolidated_7d"), { label: "Abrechnung", value: "Sammelrechnung", hint: "alle 7 Tage" });
  for (const m of [undefined, null, "", "monthly"]) assert.equal(billingModeFact(m), null, String(m));
});
