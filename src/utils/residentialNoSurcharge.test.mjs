// DHL Foundation — „Art der Lieferadresse" OHNE belegten Zuschlag (`surchargeFreePriceInputs`).
//
// Derselbe Ablauf wie in residentialPriceInputs.test.mjs (Frage, Optionen, Bindung, Buchungsteil) — nur dass der Server
// die Angabe zusätzlich als zuschlagsfrei ausweist. Dann kündigt die Karte keinen Zuschlag an, beide Optionen tragen
// „+ 0,00 €" und denselben Preis, und keine Bindung trägt eine Zuschlagszeile. Entschieden wird ausschließlich am
// Serverfeld; ohne Feld gilt der bisherige Vertrag (Zuschlag möglich) unverändert.
//
// Die Testnamen tragen die Nummer N1–N11.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  RESIDENTIAL_TEXT, RESIDENTIAL_STATUS, RESIDENTIAL_ACTION,
  offerRequiresResidentialChoice, offerResidentialSurchargeFree, offerSurchargeHint, residentialBoundValue,
  readPriceInputOptions, bindRequestBody, readPriceInputBinding, tariffWithPriceInputBinding, residentialBookPayload,
  residentialModuleView, residentialBlocksBooking, optionsAfterBinding, tariffMatchesOptionsBinding,
} from "./residentialPriceInputs.mjs";
import { offerSelectable, offerBookable } from "./offerIdentity.mjs";
import { buildBookingPriceView, PRICE_STATUS } from "./bookingPriceView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => readFileSync(path.join(HIER, rel), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ══════════ Fixtures — die Formen des Vertrags ══════════ */

const OFFER_ID = "0123456789abcdef0123456789abc084";
const OPTIONS_ID = "fedcba9876543210fedcba9876543084";

// Ein Angebot, dessen Lieferadresse erfragt wird, aber keinen Zuschlag trägt — ohne Service- oder Carrierbezug.
const OHNE = Object.freeze({
  offerId: OFFER_ID, publicCarrierId: "dhl", publicServiceName: "Domestic Express", serviceType: "pickup",
  netPrice: 154.36, vatAmount: 29.33, finalPrice: 183.69, currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: Object.freeze(["deliveryIsResidential"]),
  surchargeFreePriceInputs: Object.freeze(["deliveryIsResidential"]),
  insuranceAvailable: false, insuranceDetails: null,
});
// Dasselbe Angebot im bisherigen Vertrag: das Feld fehlt oder nennt die Angabe nicht.
const MIT = Object.freeze({ ...OHNE, surchargeFreePriceInputs: Object.freeze([]) });
const ALT = (() => { const { surchargeFreePriceInputs, ...rest } = OHNE; return Object.freeze(rest); })();

const TOTALS = Object.freeze({ customerShippingNet: 154.36, shippingVat: 29.33, customerShippingGross: 183.69,
                               insuranceGross: 0, customerTotalNet: 154.36, customerTotalGross: 183.69 });
const NULL_ZUSCHLAG = Object.freeze({ net: 0, vat: 0, gross: 0 });

const optionen = (over = {}) => ({
  offerId: OFFER_ID, offerRevision: 0, optionsId: OPTIONS_ID, expiresAt: "2026-09-17T12:15:00.000Z",
  priceInput: "deliveryIsResidential", boundValue: null,
  options: [
    { value: false, surcharge: NULL_ZUSCHLAG, totals: TOTALS },
    { value: true, surcharge: NULL_ZUSCHLAG, totals: TOTALS },
  ],
  ...over,
});

const BASIS = Object.freeze({ type: "shipping_base", taxable: true, net: 154.36, vat: 29.33, gross: 183.69 });
const ZUSCHLAG = Object.freeze({ type: "residential_delivery_surcharge", taxable: true, net: 3.45, vat: 0.66, gross: 4.11 });
const COVER = Object.freeze({ isInsurable: true, selectionModel: "cover_value", coverState: "available" });

const bindung = (wert, over = {}) => ({
  offerId: OFFER_ID, offerRevision: 1,
  priceInputs: { deliveryIsResidential: wert }, priceCompleteness: "complete",
  components: [BASIS],
  totals: TOTALS,
  offer: { netPrice: 154.36, vatAmount: 29.33, finalPrice: 183.69, bookable: true, unavailableReason: null,
           priceCompleteness: "complete", insuranceAvailable: true, insuranceDetails: COVER },
  insuranceReset: false, idempotent: false,
  ...over,
});

const gebunden = (wert, tariff = OHNE) =>
  tariffWithPriceInputBinding(tariff, readPriceInputBinding(bindung(wert), { tariff, value: wert }));

/* ══════════ Tests ══════════ */

test("N1 — das Serverfeld entscheidet: zuschlagsfrei nur mit Frage UND Nennung in surchargeFreePriceInputs", () => {
  assert.equal(offerResidentialSurchargeFree(OHNE), true);
  for (const t of [MIT, ALT, null, {}, { ...OHNE, requiredPriceInputs: [] },
                   { ...OHNE, surchargeFreePriceInputs: "deliveryIsResidential" },
                   { ...OHNE, surchargeFreePriceInputs: ["collectionIsResidential"] }]) {
    assert.equal(offerResidentialSurchargeFree(t), false, JSON.stringify(t));
  }
  // Die Frage selbst bleibt dieselbe — auswählbar, nicht buchbar, bis die Angabe gebunden ist.
  assert.deepEqual([offerRequiresResidentialChoice(OHNE), offerSelectable(OHNE), offerBookable(OHNE)], [true, true, false]);
});

test("N2 — die Karte kündigt keinen Zuschlag an, sondern nennt die Abfrage; der bisherige Vertrag bleibt", () => {
  assert.equal(offerSurchargeHint(OHNE), "Die Art der Lieferadresse wird vor der Buchung abgefragt.");
  assert.doesNotMatch(offerSurchargeHint(OHNE), /Zuschlag/);
  for (const t of [MIT, ALT]) assert.equal(offerSurchargeHint(t), "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.");
  // Ohne ausstehende Angabe (Preisauskunft, gebunden) steht gar kein Hinweis da.
  assert.equal(offerSurchargeHint({ ...OHNE, unavailableReason: "quote_only" }), null);
  assert.equal(offerSurchargeHint(gebunden(true)), null);
});

test("N3 — Optionen: beide ohne Zuschlag und mit demselben Preis — sonst fail closed", () => {
  const o = readPriceInputOptions(optionen(), OHNE);
  assert.ok(o, "eine gültige zuschlagsfreie Antwort wurde verworfen");
  assert.deepEqual(o.options.map((x) => [x.value, x.surcharge.gross, x.totals.customerShippingGross]),
    [[false, 0, 183.69], [true, 0, 183.69]]);
  const privatTeurer = optionen({ options: [
    { value: false, surcharge: NULL_ZUSCHLAG, totals: TOTALS },
    { value: true, surcharge: { net: 3.45, vat: 0.66, gross: 4.11 },
      totals: { ...TOTALS, customerShippingNet: 157.81, shippingVat: 29.99, customerShippingGross: 187.8,
                customerTotalNet: 157.81, customerTotalGross: 187.8 } },
  ] });
  assert.equal(readPriceInputOptions(privatTeurer, OHNE), null, "ein Zuschlag wurde als zuschlagsfrei gelesen");
  const andererPreis = optionen({ options: [
    { value: false, surcharge: NULL_ZUSCHLAG, totals: TOTALS },
    { value: true, surcharge: NULL_ZUSCHLAG, totals: { ...TOTALS, customerTotalGross: 183.7 } },
  ] });
  assert.equal(readPriceInputOptions(andererPreis, OHNE), null, "zwei Preise ohne Zuschlag wurden akzeptiert");
  // Im bisherigen Vertrag bleibt dieselbe Antwort mit Zuschlag lesbar.
  assert.ok(readPriceInputOptions(privatTeurer, MIT));
});

test("N4 — die Modulkarten: „+ 0,00 €\" für beide Adressarten, Lade- und Fehlertext ohne Zuschlag", () => {
  const o = readPriceInputOptions(optionen(), OHNE);
  const v = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: o, boundValue: null, surchargeFree: true });
  // Intl setzt zwischen Betrag und Währung ein geschütztes Leerzeichen.
  assert.deepEqual(v.cards.map((k) => [k.label, k.grossText.replace(/ /g, " "), k.checked]),
    [["Geschäftsadresse", "+ 0,00 € brutto", false], ["Privatadresse", "+ 0,00 € brutto", false]]);
  const laden = residentialModuleView({ status: RESIDENTIAL_STATUS.LOADING, surchargeFree: true });
  assert.deepEqual([laden.showLoading, laden.loadingText], [true, "Preis wird geprüft …"]);
  const fehler = residentialModuleView({ status: RESIDENTIAL_STATUS.ERROR, errorKind: RESIDENTIAL_ACTION.RETRY, surchargeFree: true });
  assert.deepEqual([fehler.errorText, fehler.errorAction], ["Der Preis konnte nicht geprüft werden.", RESIDENTIAL_ACTION.RETRY]);
  for (const t of [laden.loadingText, fehler.errorText]) assert.doesNotMatch(t, /Zuschlag/);
  // „Neu berechnen" (auch nach einem Vertragswechsel des Anbieters) bleibt derselbe Satz.
  const neu = residentialModuleView({ status: RESIDENTIAL_STATUS.ERROR, errorKind: RESIDENTIAL_ACTION.RECALCULATE, surchargeFree: true });
  assert.deepEqual([neu.errorText, neu.errorAction], [RESIDENTIAL_TEXT.recalculate, RESIDENTIAL_ACTION.RECALCULATE]);
  // Ohne Flag — und mit jedem anderen Wert — die bisherigen Texte.
  for (const flag of [undefined, false, "true", 1]) {
    assert.equal(residentialModuleView({ status: RESIDENTIAL_STATUS.LOADING, surchargeFree: flag }).loadingText,
      "Zuschlag wird berechnet …", String(flag));
    assert.equal(residentialModuleView({ status: RESIDENTIAL_STATUS.ERROR, errorKind: RESIDENTIAL_ACTION.RETRY,
      surchargeFree: flag }).errorText, RESIDENTIAL_TEXT.error, String(flag));
  }
});

test("N5 — Bindung privat UND geschäftlich: nur der Versand als Bestandteil wird gelesen", () => {
  for (const wert of [true, false]) {
    const b = readPriceInputBinding(bindung(wert), { tariff: OHNE, value: wert });
    assert.ok(b, `die zuschlagsfreie Bindung ${wert} wurde verworfen`);
    assert.deepEqual([b.value, b.components.map((k) => k.type), b.overlay.finalPrice], [wert, ["shipping_base"], 183.69]);
    const t = tariffWithPriceInputBinding(OHNE, b);
    assert.deepEqual([residentialBoundValue(t), t.requiredPriceInputs, t.surchargeFreePriceInputs],
      [wert, ["deliveryIsResidential"], ["deliveryIsResidential"]]);
    assert.deepEqual(residentialBookPayload(t), { offerRevision: 1, priceInputs: { deliveryIsResidential: wert } });
  }
});

test("N6 — eine Zuschlagszeile an einem zuschlagsfreien Angebot ist ein Widerspruch — gelesen wird nichts", () => {
  const mitZeile = bindung(true, { components: [BASIS, ZUSCHLAG] });
  assert.equal(readPriceInputBinding(mitZeile, { tariff: OHNE, value: true }), null);
  assert.equal(readPriceInputBinding(bindung(false, { components: [BASIS, ZUSCHLAG] }), { tariff: OHNE, value: false }), null);
  // Und am Angebot selbst: behauptet es eine solche Zeile, gilt es als ungebunden.
  const behauptet = { ...gebunden(true), priceComponents: [BASIS, ZUSCHLAG] };
  assert.equal(residentialBoundValue(behauptet), null);
});

test("N7 — der bisherige Vertrag bleibt Zeile für Zeile: privat ohne Zuschlagszeile ist dort ungültig", () => {
  for (const t of [MIT, ALT]) {
    assert.equal(readPriceInputBinding(bindung(true), { tariff: t, value: true }), null, JSON.stringify(t.surchargeFreePriceInputs));
    const mitZeile = bindung(true, { components: [BASIS, ZUSCHLAG],
      totals: { ...TOTALS, customerShippingNet: 157.81, shippingVat: 29.99, customerShippingGross: 187.8,
                customerTotalNet: 157.81, customerTotalGross: 187.8 },
      offer: { ...bindung(true).offer, netPrice: 157.81, vatAmount: 29.99, finalPrice: 187.8 } });
    assert.ok(readPriceInputBinding(mitZeile, { tariff: t, value: true }));
  }
  // Ohne Angebot (kein Vergleich möglich) gilt ebenfalls der bisherige Vertrag.
  assert.equal(readPriceInputBinding(bindung(true)), null);
});

test("N8 — die Buchung bleibt gesperrt, bis die Angabe gebunden ist — dann frei, zum Serverpreis", () => {
  const o = readPriceInputOptions(optionen(), OHNE);
  assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.READY, boundValue: null, tariff: OHNE, options: o }), true);
  const t = gebunden(true);
  const nachher = optionsAfterBinding(o, readPriceInputBinding(bindung(true), { tariff: OHNE, value: true }));
  assert.equal(tariffMatchesOptionsBinding(t, nachher), true);
  assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.READY, boundValue: true, tariff: t, options: nachher }), false);
  // Dieselbe Preisprojektion wie im bisherigen Vertrag: die Seite meldet die ausstehende Angabe, der Preis ist vorläufig.
  const vorher = buildBookingPriceView({ tariff: OHNE, insuranceType: "none", priceInputsRequired: true });
  assert.equal(vorher.status, PRICE_STATUS.PRICE_INPUTS_REQUIRED);
  const v = buildBookingPriceView({ tariff: t, insuranceType: "none", priceInputsRequired: false });
  assert.equal(v.status, PRICE_STATUS.BASE_CONFIRMED);
});

test("N9 — der Bindungskörper bleibt derselbe: Wahl und gesehener Versandbetrag, kein Zuschlag", () => {
  const o = readPriceInputOptions(optionen(), OHNE);
  assert.deepEqual(bindRequestBody({ tariff: OHNE, options: o, value: true }), {
    offerId: OFFER_ID, offerRevision: 0, optionsId: OPTIONS_ID, deliveryIsResidential: true, expectedShippingGross: 183.69,
  });
});

test("N10 — keine Service-, Carrier- oder Providerweiche: nur das Serverfeld steuert den Modus", () => {
  const modul = ohneKommentare(lies("residentialPriceInputs.mjs"));
  assert.match(modul, /surchargeFreePriceInputs/);
  assert.doesNotMatch(modul, /\b(84|85|86|87)\b|dhl|DHL|Domestic|ransglobal/);
  const seite = ohneKommentare(lies("../pages/BookingPage.jsx"));
  assert.match(seite, /surchargeFree: offerResidentialSurchargeFree\(tariff\),/);
  assert.doesNotMatch(seite, /surchargeFreePriceInputs/, "die Seite liest das Feld selbst statt über den Helfer");
  const baustein = ohneKommentare(lies("../components/booking/ResidentialPriceInputModule.jsx"));
  assert.match(baustein, /\{v\.loadingText \|\| RESIDENTIAL_TEXT\.loading\}/);
  for (const text of [RESIDENTIAL_TEXT.addressTypeHint, RESIDENTIAL_TEXT.loadingNoSurcharge, RESIDENTIAL_TEXT.errorNoSurcharge]) {
    assert.doesNotMatch(text, /ransglobal|umingo|DHL|Zuschlag|garantiert/i, text);
  }
});

test("N11 — die Absicherung bleibt bis zur Bindung weder sichtbar noch bepreisbar — auch ohne Zuschlag", () => {
  const vorher = buildBookingPriceView({ tariff: OHNE, insuranceType: "transit_cover", priceInputsRequired: true,
                                         repriceResult: { totals: { ...TOTALS, insuranceGross: 10, customerTotalGross: 193.69,
                                                                    customerTotalNet: 164.36 } } });
  assert.equal(vorher.status, PRICE_STATUS.PRICE_INPUTS_REQUIRED);
  assert.equal(OHNE.insuranceAvailable, false);
  const t = gebunden(false);
  assert.deepEqual([t.insuranceAvailable, t.insuranceDetails], [true, COVER]);
});
