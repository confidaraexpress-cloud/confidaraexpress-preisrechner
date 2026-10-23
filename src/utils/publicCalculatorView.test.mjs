// Öffentlicher Preisrechner: Formular, Anfrage (15 Felder), Ordnung, Preiskennzeichnung, Kartentexte,
// Antwortzustände — dieselben Regeln wie der Kundenrechner, wo es um Tarife geht.
//
// Run: node --test src/utils/publicCalculatorView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  HINT_TEXT, OUTCOME, OUTCOME_TEXT, PRICE_TEXT, PUBLIC_HANDOFF_URL, SORT_OPTIONS, SERVICE_FILTER_OPTIONS,
  SHIPPING_MODE_OPTIONS, availabilityFromPrepare, buildPublicQuoteRequest, carrierChoices, emptyPublicForm,
  filterOffersByCarrier, handoffUrl, localIsoDate, normalizeDecimalInput, offerCanContinue, offerDeliveryView,
  offerHints, offerPickupView, offerPriceView, offerUnavailableText, publicFormErrors, quoteOutcomeFromError,
  quoteOutcomeFromResponse, requestKey, requestSummary, resultAnnouncement, shippingDateAllowed, shortDay, sortPublicOffers,
} from "./publicCalculatorView.mjs";
import { getCalculatorErrors } from "./calculatorValidation.mjs";
import { RESIDENTIAL_TEXT } from "./residentialPriceInputs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const TOKEN = "h1." + "Q".repeat(60);
// Intl setzt zwischen Betrag und Währung ein geschütztes Leerzeichen.
const NBSP = String.fromCharCode(160);
const FORM = {
  from_country: "DE", from_zip: "70173", from_city: " Stuttgart ",
  to_country: "AT", to_zip: "1010", to_city: "Wien",
  packageCount: "2", weight: "2,5", length: "30", width: "20", height: "10",
};

test("(1) Prüfung: dieselbe Funktion wie der Kundenrechner — Dezimalkomma wird zur Zahl", () => {
  const leer = publicFormErrors(emptyPublicForm());
  assert.deepEqual(leer.fieldErrors, getCalculatorErrors(emptyPublicForm()).fieldErrors);
  assert.equal(leer.firstField, "from_zip");
  assert.deepEqual(publicFormErrors(FORM).fieldErrors, {}, "2,5 kg ist gültig");
  assert.equal(normalizeDecimalInput("2,5"), "2.5");
  assert.equal(normalizeDecimalInput(" 12 "), "12");
  assert.equal(normalizeDecimalInput("1.000,5"), "1.000,5", "Tausenderpunkte werden nicht umgedeutet");
  assert.ok(publicFormErrors({ ...FORM, weight: "abc" }).fieldErrors.weight);
});

test("(2) Anfrage: genau die 15 Felder des Kundenrechners, Zahlen als Zahlen, Carrierauswahl leer", () => {
  const body = buildPublicQuoteRequest(FORM, { serviceFilter: "pickup", shippingModeFilter: "express", shippingDate: "2026-10-21" });
  assert.deepEqual(Object.keys(body).sort(), [
    "from_city", "from_country", "from_zip", "height", "length", "packageCount", "publicCarrierIds",
    "serviceFilter", "shippingDate", "shippingModeFilter", "to_city", "to_country", "to_zip", "weight", "width",
  ]);
  assert.equal(body.from_city, "Stuttgart");
  assert.equal(body.weight, 2.5);
  assert.equal(body.packageCount, 2);
  assert.deepEqual(body.publicCarrierIds, []);
  assert.equal(buildPublicQuoteRequest(FORM, { serviceFilter: "irgendwas" }).serviceFilter, "all");
  assert.equal(requestKey(body), requestKey(buildPublicQuoteRequest({ ...FORM }, {
    serviceFilter: "pickup", shippingModeFilter: "express", shippingDate: "2026-10-21",
  })), "gleiche Eingabe, gleicher Schlüssel — kein zweiter Request");
});

test("(3) Optionen: dieselben Kennungen wie der Kundenrechner, ohne wertende Texte", () => {
  assert.deepEqual(SERVICE_FILTER_OPTIONS.map((o) => o.id), ["all", "pickup", "dropoff", "pickup_today"]);
  assert.deepEqual(SHIPPING_MODE_OPTIONS.map((o) => o.id), ["all", "standard", "express", "economy"]);
  assert.deepEqual(SORT_OPTIONS.map((o) => o.id), ["recommended", "cheapest", "priciest", "fastest"]);
  const texte = JSON.stringify([SERVICE_FILTER_OPTIONS, SHIPPING_MODE_OPTIONS, SORT_OPTIONS]);
  assert.doesNotMatch(texte, /günstigst|empfehl|beste/i);
});

test("(4) Versanddatum: heute ist die Vorgabe, Vergangenheit nicht zulässig", () => {
  const jetzt = new Date(2026, 9, 21, 9, 30);
  assert.equal(localIsoDate(jetzt), "2026-10-21");
  assert.equal(shippingDateAllowed("2026-10-21", jetzt), true);
  assert.equal(shippingDateAllowed("2026-10-20", jetzt), false);
  assert.equal(shippingDateAllowed("21.10.2026", jetzt), false);
});

test("(5) Ordnung wie im Portal, ohne Eingabe zu verändern; Carrierauswahl im Browser", () => {
  const liste = [
    { productKey: "a", publicCarrierId: "ups", netPrice: 12, transitDaysMin: 1, transitDaysMax: 2 },
    { productKey: "b", publicCarrierId: "dhl", netPrice: 9, transitDaysMin: 2, transitDaysMax: 3 },
    { productKey: "c", publicCarrierId: "dpd", netPrice: null, transitDaysMin: 1, transitDaysMax: 1 },
  ];
  const kopie = JSON.stringify(liste);
  assert.deepEqual(sortPublicOffers(liste, "recommended").map((o) => o.productKey), ["a", "b", "c"]);
  assert.deepEqual(sortPublicOffers(liste, "cheapest").map((o) => o.productKey), ["b", "a", "c"]);
  assert.deepEqual(sortPublicOffers(liste, "priciest").map((o) => o.productKey), ["a", "b", "c"]);
  assert.deepEqual(sortPublicOffers(liste, "fastest").map((o) => o.productKey), ["c", "a", "b"]);
  assert.equal(JSON.stringify(liste), kopie);
  assert.deepEqual(filterOffersByCarrier(liste, ["dhl", "dpd"]).map((o) => o.productKey), ["b", "c"]);
  assert.deepEqual(filterOffersByCarrier(liste, []).length, 3);
  assert.deepEqual(carrierChoices([{ id: "ups", name: "UPS" }, { id: "gls", name: "GLS" }, { id: "dhl", name: "DHL Express" }], liste),
    [{ id: "ups", label: "UPS" }, { id: "dhl", label: "DHL Express" }], "nur Carrier mit Angebot");
});

test("(6) Preis: exakt ohne Zusatz, sonst „ab“ mit Erklärung; Netto UND Brutto; nie „0,00 €“ für Unbekanntes", () => {
  const exakt = offerPriceView({ priceStatus: "exact", netPrice: 10.5, finalPrice: 12.5 });
  assert.deepEqual([exakt.net, exakt.gross, exakt.note], [`10,50${NBSP}€`, `12,50${NBSP}€`, null]);
  const ab = offerPriceView({ priceStatus: "from", netPrice: 8.4, finalPrice: 10 });
  assert.deepEqual([ab.net, ab.gross, ab.note], [`ab 8,40${NBSP}€`, `ab 10,00${NBSP}€`, PRICE_TEXT.fromNote]);
  assert.match(PRICE_TEXT.fromNote, /nach der Anmeldung mit vollständigen Sendungsangaben/);
  assert.equal(offerPriceView({ priceStatus: "weird", netPrice: 1, finalPrice: 1.19 }).status, "from", "unbekannt ist nie exakt");
  const ohne = offerPriceView({ priceStatus: "exact", netPrice: null, finalPrice: null });
  assert.equal(ohne.onRequest, true);
  assert.equal(ohne.net, null);
});

test("(7) Abholung und Zustellung aus den Portalhelfern; Laufzeit immer „laut Versanddienstleister“", () => {
  const abholung = offerPickupView({ serviceType: "pickup", pickupDate: "2026-10-21", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00" });
  assert.deepEqual([abholung.title, abholung.day, abholung.time], ["Abholung", "Mi., 21.10.", "09:00–17:00 Uhr"]);
  const abgabe = offerPickupView({ serviceType: "dropoff", collectionDate: "2026-10-22", collectionDateAdjusted: true });
  assert.equal(abgabe.title, "Abgabe im Paketshop");
  assert.ok(abgabe.adjustedNote);
  const laufzeit = offerDeliveryView({ transitDaysMin: 1, transitDaysMax: 2 });
  assert.deepEqual([laufzeit.label, laufzeit.value, laufzeit.note], ["Voraussichtliche Laufzeit", "1–2 Tage", "laut Versanddienstleister"]);
  const datum = offerDeliveryView({ deliveryDate: "2026-10-23" });
  assert.deepEqual([datum.value, datum.note], ["Fr., 23.10.", "laut Versanddienstleister"]);
  assert.equal(offerDeliveryView({}).value, "Auf Anfrage");
  assert.equal(offerDeliveryView({}).note, null);
  assert.equal(shortDay("2026-02-30T00:00:00Z") !== undefined, true);
});

test("(8) Hinweise: Zuschlag nur laut requiredPriceInputs, Geschäftsempfänger, Label und Drucker", () => {
  assert.deepEqual(offerHints({ requiredPriceInputs: ["deliveryIsResidential"] }), [RESIDENTIAL_TEXT.surchargeHint]);
  assert.deepEqual(offerHints({ requiredPriceInputs: ["deliveryIsResidential"], surchargeFreePriceInputs: ["deliveryIsResidential"] }),
    [RESIDENTIAL_TEXT.addressTypeHint]);
  assert.deepEqual(offerHints({ requiredPriceInputs: [] }), [], "ohne Angabe kein Zuschlagshinweis");
  assert.deepEqual(offerHints({ recipientRequirement: "business", printerRequired: true }),
    [HINT_TEXT.businessRecipient, HINT_TEXT.printerRequired]);
  assert.deepEqual(offerHints({ labelHandling: "carrier_at_pickup", printerRequired: false }), [HINT_TEXT.labelAtPickup]);
  assert.deepEqual(offerHints({ printerRequired: null }), [], "unbeantwortet sagt nichts");
});

test("(9) Aktion nur mit Serverzusage und gültigem Token; sonst Grundtext des Portals", () => {
  assert.equal(offerCanContinue({ availableWithShipmentDetails: true, handoffToken: TOKEN }), true);
  assert.equal(offerCanContinue({ availableWithShipmentDetails: true, handoffToken: null }), false);
  assert.equal(offerCanContinue({ availableWithShipmentDetails: false, handoffToken: TOKEN }), false);
  assert.equal(offerUnavailableText({ availableWithShipmentDetails: true, handoffToken: TOKEN }), null);
  assert.equal(offerUnavailableText({ availableWithShipmentDetails: false, unavailableReason: "quote_only" }), "Derzeit nicht direkt buchbar");
  assert.equal(offerUnavailableText({ availableWithShipmentDetails: false, unavailableReason: "unbekannt_xy" }), "Derzeit nicht buchbar");
  assert.equal(handoffUrl(TOKEN), `${PUBLIC_HANDOFF_URL}#t=${TOKEN}`);
  assert.equal(PUBLIC_HANDOFF_URL, "https://confidaraexpress.de/preisrechner-uebernahme");
  assert.equal(handoffUrl("javascript:alert(1)"), null);
});

test("(10) Antwortzustände: ok, partial, no_offers, 400 am Feld, 422, 429, 503, 502, Netz, Zeitlimit, Abbruch", () => {
  const ok = quoteOutcomeFromResponse(200, { status: "ok", offers: [{ productKey: "x" }], publicCarriers: [] });
  assert.equal(ok.outcome, OUTCOME.OK);
  assert.equal(quoteOutcomeFromResponse(200, { status: "partial", offers: [{}] }).outcome, OUTCOME.PARTIAL);
  assert.equal(quoteOutcomeFromResponse(200, { status: "no_offers", offers: [] }).outcome, OUTCOME.NO_OFFERS);
  assert.equal(quoteOutcomeFromResponse(200, { status: "partial", offers: [] }).outcome, OUTCOME.PARTIAL);
  const feld = quoteOutcomeFromResponse(400, { error: "Bitte geben Sie eine gültige Postleitzahl ein.", code: "INVALID_POSTAL_CODE", field: "to_zip" });
  assert.deepEqual([feld.outcome, feld.field], [OUTCOME.INVALID, "to_zip"]);
  assert.equal(quoteOutcomeFromResponse(400, { error: "x", code: "UNKNOWN_FIELD", field: "sender" }).field, null, "fremde Felder nie markieren");
  assert.equal(quoteOutcomeFromResponse(422, { code: "ROUTE_NOT_SUPPORTED" }).outcome, OUTCOME.ROUTE);
  assert.equal(quoteOutcomeFromResponse(429, {}).outcome, OUTCOME.RATE_LIMITED);
  assert.equal(quoteOutcomeFromResponse(503, { code: "PUBLIC_CALCULATOR_UNAVAILABLE" }).outcome, OUTCOME.UNAVAILABLE);
  assert.equal(quoteOutcomeFromResponse(502, {}).outcome, OUTCOME.UPSTREAM);
  assert.equal(quoteOutcomeFromResponse(500, {}).outcome, OUTCOME.SERVER);
  assert.equal(quoteOutcomeFromError({ name: "ApiTimeoutError" }).outcome, OUTCOME.TIMEOUT);
  assert.equal(quoteOutcomeFromError(new TypeError("Failed to fetch")).outcome, OUTCOME.NETWORK);
  assert.equal(quoteOutcomeFromError({ name: "AbortError" }), null);
  assert.equal(resultAnnouncement(OUTCOME.OK, 3), "3 Angebote gefunden.");
  assert.equal(resultAnnouncement(OUTCOME.NO_OFFERS, 0), OUTCOME_TEXT[OUTCOME.NO_OFFERS].title);
  assert.equal(availabilityFromPrepare({ available: false }), false);
  assert.equal(availabilityFromPrepare(null), null);
});

test("(11) keine Zusagen, keine Anbieter: Texte ohne Garantie, Bestpreis oder Einkaufsquelle", () => {
  const alles = JSON.stringify([OUTCOME_TEXT, PRICE_TEXT, HINT_TEXT]);
  assert.doesNotMatch(alles, /garantiert|günstigste|beste[nr]? Preis|jumingo|transglobal/i);
  const src = ohneKommentare(read("utils/publicCalculatorView.mjs"));
  assert.doesNotMatch(src, /localStorage|sessionStorage|fetch\(|Date\.now\(\)/, "rein: kein Speicher, kein Netz, keine Uhr");
});

test("(12) Zusammenfassung über den Ergebnissen: Strecke, Pakete, Gewicht, Maße — ohne Versanddatum", () => {
  const body = buildPublicQuoteRequest(FORM, { serviceFilter: "all", shippingModeFilter: "all", shippingDate: "2026-10-21" });
  assert.equal(requestSummary(body),
    "DE 70173 Stuttgart → AT 1010 Wien · 2 Pakete · 2,5 kg je Paket · 30 × 20 × 10 cm");
  assert.equal(requestSummary({ ...body, packageCount: 1 }),
    "DE 70173 Stuttgart → AT 1010 Wien · 1 Paket · 2,5 kg · 30 × 20 × 10 cm");
  assert.equal(requestSummary(null), null);
  assert.equal(requestSummary({}), null);
});

test("Paket C — der öffentliche Rechner nennt bei einer gesperrten Route das erkannte Gebiet", () => {
  const r = quoteOutcomeFromResponse(422, { code: "ROUTE_NOT_SUPPORTED", reason: "special_territory", field: "recipient", territory: "Nordzypern" });
  assert.equal(r.outcome, OUTCOME.ROUTE);
  assert.equal(r.message, "Die Empfängeradresse liegt in einem Gebiet, das ConfidaraExpress derzeit nicht bedient: Nordzypern. Bitte prüfen Sie Land und Postleitzahl.");
  assert.equal(quoteOutcomeFromResponse(422, { code: "ROUTE_NOT_SUPPORTED" }).message, OUTCOME_TEXT[OUTCOME.ROUTE].message);
  assert.equal(OUTCOME_TEXT[OUTCOME.ROUTE].title, "Versandziel nicht verfügbar");
});
