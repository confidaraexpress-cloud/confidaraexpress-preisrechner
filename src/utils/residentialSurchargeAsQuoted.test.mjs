// DHL-Privatadresszuschlag (Betreiberentscheidung 2026-10-10) — „Art der Lieferadresse", deren Zuschlag der Server
// je Sendung nennt: auf dem Livekonto 5,00 € Einkauf, auf Staging keiner. Das Angebot führt die Angabe deshalb NICHT
// in `surchargeFreePriceInputs` — und eine bestätigte Privatoption kann trotzdem „+ 0,00 €" tragen.
//
// Die Antworten unten haben genau die Form, die das Backend liefert (Optionen und Bindung, mitgeschnitten aus
// tests/dhl-residential-surcharge-as-quoted.test.js des Backends, Produkt 84 DE→DE; für 85/87/107 dieselbe Form mit
// den dort von Hand gerechneten Beträgen). Geprüft wird der ganze Weg über die Helfer der Buchungsseite:
// Karte → Optionen → Bindungskörper → Bindung → gebundenes Angebot → Buchungssperre → Buchungsteil — dazu die
// Rückwege (Neuwahl, Wiederherstellung) und dass der bisherige Vertrag Zeile für Zeile gilt.
//
// Die Testnamen tragen die Nummer Q1–Q12.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  RESIDENTIAL_TEXT, RESIDENTIAL_STATUS, RESIDENTIAL_ACTION,
  offerRequiresResidentialChoice, offerResidentialSurchargeFree, offerSurchargeHint, residentialBoundValue,
  readPriceInputOptions, bindRequestBody, readPriceInputBinding, tariffWithPriceInputBinding, residentialBookPayload,
  residentialModuleView, residentialBlocksBooking, optionsAfterBinding, tariffMatchesOptionsBinding, isRebindRequired,
  residentialErrorAction,
} from "./residentialPriceInputs.mjs";
import { offerSelectable, offerBookable } from "./offerIdentity.mjs";
import { buildBookingPriceView, PRICE_STATUS } from "./bookingPriceView.mjs";
import { surchargeSummaryNote } from "./bookingSummaryView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => readFileSync(path.join(HIER, rel), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
// Intl setzt zwischen Betrag und Währung ein geschütztes Leerzeichen — für den Vergleich ein gewöhnliches.
const nbsp = (s) => s.replace(/\s/g, " ");

/* ══════════ Fixtures — die Formen des Backendvertrags ══════════ */

const OPTIONS_ID = "387170a6225a895fc68ca9ac04ea970b";
const NULL_ZUSCHLAG = Object.freeze({ net: 0, vat: 0, gross: 0 });
const COVER = Object.freeze({ isInsurable: true, selectionModel: "cover_value", coverState: "available", coverValue: 500 });
const summen = ([n, v, g]) => ({ customerShippingNet: n, shippingVat: v, customerShippingGross: g, insuranceGross: 0,
                                 customerTotalNet: n, customerTotalGross: g });
const cent = (b) => Math.round(b * 100);
const differenz = (p, b) => ({ net: (cent(p[0]) - cent(b[0])) / 100, vat: (cent(p[1]) - cent(b[1])) / 100,
                               gross: (cent(p[2]) - cent(b[2])) / 100 });

/* Je Produkt: Geschäfts- und Privatpreis (netto · MwSt. · brutto) live mit RES 5,00 und auf Staging ohne RES. */
const PRODUKTE = Object.freeze([
  { name: "84 Domestic Express", id: "084", live: { b: [31.75, 6.03, 37.78], p: [38.25, 7.27, 45.52] },
    staging: [154.36, 29.33, 183.69] },
  { name: "85 Domestic Express 9:00", id: "085", live: { b: [116.47, 22.13, 138.6], p: [122.97, 23.36, 146.33] },
    staging: [64.66, 12.29, 76.95] },
  { name: "87 Domestic Express 12:00", id: "087", live: { b: [43.85, 8.33, 52.18], p: [50.35, 9.57, 59.92] },
    staging: [29.3, 5.57, 34.87] },
  { name: "107 Economy Select", id: "107", live: { b: [28.54, 5.42, 33.96], p: [34.54, 6.56, 41.1] },
    staging: [18.17, 3.45, 21.62] },
]);

const offerIdVon = (prod) => `0123456789abcdef0123456789abc${prod.id}`;

// Die Karte aus dem Vergleich: die Angabe wird erfragt, ist aber NICHT zuschlagsfrei.
const karte = (prod, b) => Object.freeze({
  offerId: offerIdVon(prod), publicCarrierId: "dhl", publicServiceName: prod.name.replace(/^\d+ /, ""), serviceType: "pickup",
  netPrice: b[0], vatAmount: b[1], finalPrice: b[2], currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: Object.freeze(["deliveryIsResidential"]), surchargeFreePriceInputs: Object.freeze([]),
  insuranceAvailable: false, insuranceDetails: null,
});

// Die Optionsantwort: Geschäftsadresse ohne Zuschlag, Privatadresse mit dem Zuschlag des Quotes (Differenz der Preise).
const optionen = (prod, b, p, over = {}) => ({
  offerId: offerIdVon(prod), offerRevision: 0, optionsId: OPTIONS_ID, expiresAt: "2026-09-14T10:15:00.000Z",
  priceInput: "deliveryIsResidential", boundValue: null,
  options: [
    { value: false, surcharge: NULL_ZUSCHLAG, totals: summen(b) },
    { value: true, surcharge: differenz(p, b), totals: summen(p) },
  ],
  ...over,
});

// Die Bindungsantwort: Versand (Geschäftspreis) und — nur wenn die Option einen nannte — der Zuschlag Privatadresse.
const bindung = (prod, wert, b, p, over = {}) => {
  const preis = wert ? p : b;
  const zuschlag = differenz(p, b);
  const components = [{ type: "shipping_base", taxable: true, net: b[0], vat: b[1], gross: b[2] }];
  if (wert && zuschlag.gross > 0) components.push({ type: "residential_delivery_surcharge", taxable: true, ...zuschlag });
  return {
    offerId: offerIdVon(prod), offerRevision: 1, priceInputs: { deliveryIsResidential: wert }, priceCompleteness: "complete",
    components, totals: summen(preis),
    offer: { netPrice: preis[0], vatAmount: preis[1], finalPrice: preis[2], bookable: true, unavailableReason: null,
             priceCompleteness: "complete", insuranceAvailable: true, insuranceDetails: COVER },
    insuranceReset: false, idempotent: false,
    ...over,
  };
};

const LIVE84 = PRODUKTE[0];
const L = LIVE84.live;
const S = LIVE84.staging;

/* Der ganze Weg einer Wahl über die Helfer der Buchungsseite. */
function weg(prod, b, p, wert) {
  const tarif = karte(prod, b);
  const o = readPriceInputOptions(optionen(prod, b, p), tarif);
  assert.ok(o, `${prod.name}: die Optionsantwort wurde verworfen`);
  const koerper = bindRequestBody({ tariff: tarif, options: o, value: wert });
  const gelesen = readPriceInputBinding(bindung(prod, wert, b, p), { tariff: tarif, value: wert, options: o });
  const gebunden = gelesen ? tariffWithPriceInputBinding(tarif, gelesen) : null;
  const nachher = gelesen ? optionsAfterBinding(o, gelesen) : null;
  return { tarif, o, koerper, gelesen, gebunden, nachher };
}

/* ══════════ Tests ══════════ */

test("Q1 — die Karte: Frage ja, zuschlagsfrei nein — der Hinweis kündigt einen möglichen Zuschlag an", () => {
  const t = karte(LIVE84, L.b);
  assert.deepEqual([offerRequiresResidentialChoice(t), offerResidentialSurchargeFree(t), offerSelectable(t), offerBookable(t)],
    [true, false, true, false]);
  assert.equal(offerSurchargeHint(t), "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.");
});

test("Q2 — Optionen: live mit Zuschlag, Staging mit „+ 0,00 €\" zum Geschäftspreis — ein 0-€-Zuschlag mit anderem Preis nie", () => {
  for (const prod of PRODUKTE) {
    const live = readPriceInputOptions(optionen(prod, prod.live.b, prod.live.p), karte(prod, prod.live.b));
    assert.deepEqual(live.options.map((x) => [x.value, x.surcharge, x.totals.customerShippingGross]),
      [[false, NULL_ZUSCHLAG, prod.live.b[2]], [true, differenz(prod.live.p, prod.live.b), prod.live.p[2]]], prod.name);
    const staging = readPriceInputOptions(optionen(prod, prod.staging, prod.staging), karte(prod, prod.staging));
    assert.deepEqual(staging.options.map((x) => [x.value, x.surcharge, x.totals.customerShippingGross]),
      [[false, NULL_ZUSCHLAG, prod.staging[2]], [true, NULL_ZUSCHLAG, prod.staging[2]]], prod.name);
  }
  // Ein Zuschlag von 0,00 € mit einem ANDEREN Preis als die Geschäftsadresse ist ein Widerspruch — verworfen.
  const widerspruch = optionen(LIVE84, L.b, L.p, { options: [
    { value: false, surcharge: NULL_ZUSCHLAG, totals: summen(L.b) },
    { value: true, surcharge: NULL_ZUSCHLAG, totals: summen(L.p) },
  ] });
  assert.equal(readPriceInputOptions(widerspruch, karte(LIVE84, L.b)), null);
  // Ein Zuschlag an der Geschäftsadresse bleibt verworfen.
  const geschaeftMitZuschlag = optionen(LIVE84, L.b, L.p, { options: [
    { value: false, surcharge: differenz(L.p, L.b), totals: summen(L.p) },
    { value: true, surcharge: differenz(L.p, L.b), totals: summen(L.p) },
  ] });
  assert.equal(readPriceInputOptions(geschaeftMitZuschlag, karte(LIVE84, L.b)), null);
});

test("Q3 — DER GANZE WEG live privat (RES 5,00): Bindung mit genau dem bestätigten Zuschlag, Buchung frei", () => {
  for (const prod of PRODUKTE) {
    const { tarif, koerper, gelesen, gebunden, nachher } = weg(prod, prod.live.b, prod.live.p, true);
    assert.deepEqual(koerper, { offerId: offerIdVon(prod), offerRevision: 0, optionsId: OPTIONS_ID, deliveryIsResidential: true,
                                expectedShippingGross: prod.live.p[2] }, prod.name);
    assert.ok(gelesen, `${prod.name}: die Bindung mit Zuschlag wurde verworfen`);
    assert.deepEqual([gelesen.residentialSurchargeConfirmed, gelesen.components.map((k) => [k.type, k.gross])],
      [true, [["shipping_base", prod.live.b[2]], ["residential_delivery_surcharge", differenz(prod.live.p, prod.live.b).gross]]],
      prod.name);
    assert.deepEqual([residentialBoundValue(gebunden), gebunden.finalPrice, gebunden.residentialSurchargeConfirmed],
      [true, prod.live.p[2], true], prod.name);
    assert.equal(tariffMatchesOptionsBinding(gebunden, nachher), true, prod.name);
    assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.READY, boundValue: true, tariff: gebunden,
                                            options: nachher }), false, prod.name);
    assert.deepEqual(residentialBookPayload(gebunden), { offerRevision: 1, priceInputs: { deliveryIsResidential: true } }, prod.name);
    // Die Preisfläche nennt den Zuschlag aus dem Serverbestandteil — nichts ist addiert.
    const v = buildBookingPriceView({ tariff: gebunden, insuranceType: "none", priceInputsRequired: false });
    assert.equal(v.status, PRICE_STATUS.BASE_CONFIRMED, prod.name);
    assert.equal(nbsp(surchargeSummaryNote(v)), nbsp(`inkl. Zuschlag Privatadresse ${differenz(prod.live.p, prod.live.b).gross
      .toFixed(2).replace(".", ",")} €`), prod.name);
    assert.equal(tarif.surchargeFreePriceInputs.length, 0);
  }
});

test("Q4 — DER GANZE WEG Staging privat (kein RES): „+ 0,00 €\" bestätigt, Bindung ohne Zuschlagszeile, Buchung frei", () => {
  for (const prod of PRODUKTE) {
    const { gelesen, gebunden, nachher } = weg(prod, prod.staging, prod.staging, true);
    assert.ok(gelesen, `${prod.name}: die bestätigte Privatoption ohne Zuschlag wurde verworfen`);
    assert.deepEqual([gelesen.residentialSurchargeConfirmed, gelesen.components.map((k) => k.type)],
      [false, ["shipping_base"]], prod.name);
    assert.deepEqual([residentialBoundValue(gebunden), gebunden.finalPrice], [true, prod.staging[2]], prod.name);
    assert.equal(tariffMatchesOptionsBinding(gebunden, nachher), true, prod.name);
    assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.READY, boundValue: true, tariff: gebunden,
                                            options: nachher }), false, prod.name);
    assert.deepEqual(residentialBookPayload(gebunden), { offerRevision: 1, priceInputs: { deliveryIsResidential: true } }, prod.name);
    const v = buildBookingPriceView({ tariff: gebunden, insuranceType: "none", priceInputsRequired: false });
    assert.deepEqual([v.status, surchargeSummaryNote(v)], [PRICE_STATUS.BASE_CONFIRMED, null], prod.name);
  }
});

test("Q5 — Geschäftsadresse: nie eine Zuschlagszeile — live wie Staging, für alle vier", () => {
  for (const prod of PRODUKTE) {
    for (const [b, p] of [[prod.live.b, prod.live.p], [prod.staging, prod.staging]]) {
      const { gelesen, gebunden } = weg(prod, b, p, false);
      assert.deepEqual([gelesen.residentialSurchargeConfirmed, gelesen.components.map((k) => k.type), residentialBoundValue(gebunden),
                        gebunden.finalPrice], [false, ["shipping_base"], false, b[2]], prod.name);
      assert.deepEqual(residentialBookPayload(gebunden), { offerRevision: 1, priceInputs: { deliveryIsResidential: false } });
      const mitZeile = bindung(prod, false, b, p, { components: [
        { type: "shipping_base", taxable: true, net: b[0], vat: b[1], gross: b[2] },
        { type: "residential_delivery_surcharge", taxable: true, net: 6.5, vat: 1.24, gross: 7.74 }] });
      assert.equal(readPriceInputBinding(mitZeile, { tariff: karte(prod, b), value: false,
        options: readPriceInputOptions(optionen(prod, b, p), karte(prod, b)) }), null, prod.name);
    }
  }
});

test("Q6 — nie still übergangen: fehlt die bestätigte Zeile, weicht ihr Betrag ab oder steht eine unbestätigte da — verworfen", () => {
  const t = karte(LIVE84, L.b);
  const o = readPriceInputOptions(optionen(LIVE84, L.b, L.p), t);
  const ohneZeile = bindung(LIVE84, true, L.b, L.p, { components: [{ type: "shipping_base", taxable: true, net: 38.25, vat: 7.27,
                                                                    gross: 45.52 }] });
  assert.equal(readPriceInputBinding(ohneZeile, { tariff: t, value: true, options: o }), null, "Zuschlag bestätigt, Zeile fehlt");
  const andererBetrag = bindung(LIVE84, true, L.b, L.p, { components: [
    { type: "shipping_base", taxable: true, net: 31.75, vat: 6.03, gross: 37.78 },
    { type: "residential_delivery_surcharge", taxable: true, net: 3.45, vat: 0.66, gross: 4.11 }] });
  assert.equal(readPriceInputBinding(andererBetrag, { tariff: t, value: true, options: o }), null, "ein anderer Zuschlag als bestätigt");
  // Staging: die bestätigte Option nannte 0,00 € — eine Zuschlagszeile in der Bindung wäre ein unbestätigter Zuschlag.
  const ts = karte(LIVE84, S);
  const os = readPriceInputOptions(optionen(LIVE84, S, S), ts);
  const unbestaetigt = bindung(LIVE84, true, S, S, { components: [
    { type: "shipping_base", taxable: true, net: 150.91, vat: 28.67, gross: 179.58 },
    { type: "residential_delivery_surcharge", taxable: true, net: 3.45, vat: 0.66, gross: 4.11 }] });
  assert.equal(readPriceInputBinding(unbestaetigt, { tariff: ts, value: true, options: os }), null, "Zeile ohne bestätigten Zuschlag");
  // Optionen eines anderen Angebots bestätigen nichts.
  const fremd = { ...os, offerId: "ffffffffffffffffffffffffffffffff" };
  assert.equal(readPriceInputBinding(bindung(LIVE84, true, S, S), { tariff: ts, value: true, options: fremd }), null);
  assert.equal(readPriceInputBinding(bindung(LIVE84, true, S, S), { tariff: ts, value: true, options: null }), null);
});

test("Q7 — ohne bestätigte Option gilt die strenge Regel: Privatadresse heißt Zuschlagszeile", () => {
  const ts = karte(LIVE84, S);
  assert.equal(readPriceInputBinding(bindung(LIVE84, true, S, S), { tariff: ts, value: true }), null);
  assert.ok(readPriceInputBinding(bindung(LIVE84, true, L.b, L.p), { tariff: karte(LIVE84, L.b), value: true }));
  // Ein Angebot ohne die bestätigte Aussage (etwa aus einem älteren Stand) gilt mit privater Wahl ohne Zeile als UNGEBUNDEN —
  // die Seite bindet dieselbe Wahl dann still neu und prüft dabei gegen die Optionen.
  const { gebunden } = weg(LIVE84, S, S, true);
  const { residentialSurchargeConfirmed, ...ohneAussage } = gebunden;
  assert.equal(residentialSurchargeConfirmed, false);
  assert.equal(residentialBoundValue(ohneAussage), null);
  // Und eine behauptete Aussage ändert keine Zeile: wer „ohne" sagt und eine Zeile trägt, ist ungebunden.
  const { gebunden: mit } = weg(LIVE84, L.b, L.p, true);
  assert.equal(residentialBoundValue({ ...mit, residentialSurchargeConfirmed: false }), null);
  // Eine Bindung ohne Aussage ersetzt eine frühere Aussage — kein Rest bleibt am Angebot stehen.
  const ersetzt = tariffWithPriceInputBinding(gebunden, { ...readPriceInputBinding(bindung(LIVE84, true, L.b, L.p),
    { tariff: karte(LIVE84, L.b), value: true }), residentialSurchargeConfirmed: undefined });
  assert.equal(ersetzt.residentialSurchargeConfirmed, undefined);
});

test("Q8 — Wiederherstellung: ein Angebot ohne Serverbindung wird zur bestätigten Option still gebunden — dann frei", () => {
  const ts = karte(LIVE84, S);
  const o = readPriceInputOptions(optionen(LIVE84, S, S, { boundValue: true, offerRevision: 1 }), ts);
  // Der Vorgang trägt nur die Karte (keine Bindung): die Optionen nennen die Wahl, das Angebot trägt sie nicht.
  assert.equal(tariffMatchesOptionsBinding(ts, o), false);
  // Die Seite bindet dieselbe Wahl still (idempotent) und prüft die Antwort gegen genau diese Optionen.
  const gelesen = readPriceInputBinding(bindung(LIVE84, true, S, S, { idempotent: true }), { tariff: ts, value: true, options: o });
  const gebunden = tariffWithPriceInputBinding(ts, gelesen);
  assert.equal(tariffMatchesOptionsBinding(gebunden, optionsAfterBinding(o, gelesen)), true);
  assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.READY, boundValue: true, tariff: gebunden,
                                          options: optionsAfterBinding(o, gelesen) }), false);
});

test("Q9 — Preisänderung (anderer Zuschlag): kein Übernahmeweg, Neuwahl zu den neuen Optionen — die alte Aussage gilt nicht weiter", () => {
  // Gebunden ohne Zuschlag (Staging-Preisstand) …
  const { gebunden } = weg(LIVE84, S, S, true);
  // … /book meldet eine Preisänderung mit Neuwahl: kein Betrag, kein Bestätigungsweg.
  const antwort = { error: "Preis geändert", code: "PRICE_CHANGED", priceInputsRebindRequired: true, offerRevision: 1 };
  assert.equal(isRebindRequired(antwort), true);
  assert.equal(residentialErrorAction(409, antwort), RESIDENTIAL_ACTION.RETRY);
  // Die neuen Optionen nennen den Zuschlag; die alte Bindung passt nicht mehr dazu und sperrt die Buchung.
  const neu = readPriceInputOptions(optionen(LIVE84, L.b, L.p, { offerRevision: 1, boundValue: true }), gebunden);
  assert.ok(neu);
  const bindungNeu = bindung(LIVE84, true, L.b, L.p, { offerRevision: 2 });
  const gelesen = readPriceInputBinding(bindungNeu, { tariff: gebunden, value: true, options: neu });
  assert.ok(gelesen, "die Neuwahl mit Zuschlag wurde verworfen");
  const danach = tariffWithPriceInputBinding(gebunden, gelesen);
  assert.deepEqual([residentialBoundValue(danach), danach.finalPrice, danach.residentialSurchargeConfirmed, danach.offerRevision],
    [true, L.p[2], true, 2]);
  assert.deepEqual(residentialBookPayload(danach), { offerRevision: 2, priceInputs: { deliveryIsResidential: true } });
});

test("Q10 — die Modulkarten: der Zuschlag aus der Optionsantwort — „+ 7,74 €\" live, „+ 0,00 €\" Staging; Texte mit Zuschlag", () => {
  const live = readPriceInputOptions(optionen(LIVE84, L.b, L.p), karte(LIVE84, L.b));
  const v = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: live, boundValue: null, surchargeFree: false,
                                    vatMode: "gross" });
  assert.deepEqual(v.cards.map((k) => [k.label, nbsp(k.primaryText)]),
    [["Geschäftsadresse", "+ 0,00 € brutto"], ["Privatadresse", "+ 7,74 € brutto"]]);
  const staging = readPriceInputOptions(optionen(LIVE84, S, S), karte(LIVE84, S));
  const w = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: staging, boundValue: null, surchargeFree: false,
                                    vatMode: "gross" });
  assert.deepEqual(w.cards.map((k) => nbsp(k.primaryText)), ["+ 0,00 € brutto", "+ 0,00 € brutto"]);
  // Nicht zuschlagsfrei: Lade- und Fehlertext sprechen vom Zuschlag (er kann anfallen).
  assert.equal(residentialModuleView({ status: RESIDENTIAL_STATUS.LOADING, surchargeFree: false }).loadingText,
    RESIDENTIAL_TEXT.loading);
});

test("Q11 — der bisherige Vertrag (UPS) bleibt streng — mit Optionen jetzt auch betragsgenau", () => {
  // Dieselbe Form wie UPS: der Zuschlag der Privatadresse ist immer > 0.
  const ups = { ...karte(LIVE84, L.b), publicCarrierId: "ups", offerId: "0123456789abcdef0123456789abc022" };
  const prod = { ...LIVE84, id: "022" };
  const o = readPriceInputOptions(optionen(prod, L.b, L.p), ups);
  assert.equal(readPriceInputBinding(bindung(prod, true, L.b, L.p, { components: [
    { type: "shipping_base", taxable: true, net: 38.25, vat: 7.27, gross: 45.52 }] }), { tariff: ups, value: true, options: o }), null);
  assert.ok(readPriceInputBinding(bindung(prod, true, L.b, L.p), { tariff: ups, value: true, options: o }));
  assert.ok(readPriceInputBinding(bindung(prod, true, L.b, L.p), { tariff: ups, value: true }));
});

test("Q12 — Quelltext: die Seite prüft die Bindung gegen die bestätigten Optionen; keine Service- oder Carrierweiche", () => {
  const seite = ohneKommentare(lies("../pages/BookingPage.jsx"));
  assert.match(seite, /readPriceInputBinding\(d, \{ tariff, value: wert, options: optionen \}\)/);
  const modul = ohneKommentare(lies("residentialPriceInputs.mjs"));
  assert.doesNotMatch(modul, /\b(84|85|87|107)\b|dhl|DHL|Domestic|Economy|ransglobal/);
  // Kein Betrag im Modul: der Zuschlag kommt ausschließlich aus der Optionsantwort.
  assert.doesNotMatch(modul, /\b5[.,]00\b|\b7[.,]74\b|\b6[.,]50\b/);
});
