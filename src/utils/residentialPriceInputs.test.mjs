// TG22 Residential — „Art der Lieferadresse" nach der Angebotsauswahl.
//
// Reine Helfer (utils/residentialPriceInputs.mjs) und ihr Zusammenspiel mit Angebotsidentität,
// Price-View-Model, Absicherung, Preisänderung und Sendungsangaben. Die Verdrahtung auf den Seiten
// prüft tg22ResidentialWiring.test.mjs, das gerenderte Verhalten tests/e2e/tg22ResidentialPriceInputs.test.mjs.
//
// Die Testnamen tragen die Nummer der Frontend-Pflichttests (R1–R24) bzw. der Sicherheitsfälle (S1–S9).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  RESIDENTIAL_TEXT, RESIDENTIAL_STATUS, RESIDENTIAL_ACTION,
  offerRequiresResidentialChoice, offerSurchargeHint, offerRevisionOf, residentialBoundValue,
  optionsRequestBody, readPriceInputOptions, optionFor, bindRequestBody, readPriceInputBinding,
  tariffWithPriceInputBinding, optionsAfterBinding, tariffMatchesOptionsBinding, residentialBookPayload,
  residentialErrorAction, conflictRevisionOf, isRebindRequired, isPriceInputsRequired,
  residentialModuleView, residentialBlocksBooking,
} from "./residentialPriceInputs.mjs";
import {
  offerSelectable, offerBlocked, offerBookable, offerBlockedLabel, offerBlockedHint, offerAwaitsPriceInputs,
} from "./offerIdentity.mjs";
import { isIndicativePrice, INDICATIVE_PRICE_LABEL } from "./priceCompletenessView.mjs";
import { buildBookingPriceView, PRICE_STATUS, priceViewBlocksBooking } from "./bookingPriceView.mjs";
import { priceInfo, surchargeSummaryNote } from "./bookingSummaryView.mjs";
import { PRICE_COMPONENT_LABELS, priceSummaryComponents } from "./priceComponentsView.mjs";
import { insuranceRestoreKey, insuranceRestoreApplies, restoredInsuranceState } from "./insuranceRestore.mjs";
import { replaceOffer } from "./acceptedOfferPrice.mjs";
import {
  priceChangeAnsicht, preisIstBestaetigbar, pendingPriceChangeNotice, PRICE_CHANGE_KIND, PREISAENDERUNG_TEXT,
} from "./priceChangeView.mjs";
import { insuredPriceChangeView } from "./coverInsuranceView.mjs";
import { mapBookRestError, OFFER_ALREADY_USED_TEXT } from "./bookingErrors.mjs";
import {
  blankDeclarations, declarationErrors, declarationsPayload, declarationsFromSnapshot, declarationsSnapshot,
  bookingContentPayload,
} from "./shipmentDeclarations.mjs";
import { SHIPMENT_FORM_KEYS, BOOKING_KEYS, normalizeForm, normalizeBooking, emptyBooking } from "./shippingFlowState.mjs";
import { buildResumeInitialState } from "./formDraftsView.mjs";
import { bookingSuccessComponents } from "./bookingSuccessView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
// Intl setzt zwischen Betrag und Währung ein geschütztes Leerzeichen.
const nbsp = (s) => String(s).replace(/ /g, " ");

/* ══════════ Fixtures — die Formen des Vertrags ══════════ */

const OFFER_ID = "0123456789abcdef0123456789abcdef";
const OPTIONS_ID = "fedcba9876543210fedcba9876543210";

const TG22 = Object.freeze({
  offerId: OFFER_ID, publicCarrierId: "ups", publicServiceName: "Standardversand", serviceType: "pickup",
  netPrice: 12.34, vatAmount: 2.34, finalPrice: 14.68, currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: Object.freeze(["deliveryIsResidential"]), insuranceAvailable: false, insuranceDetails: null,
});

const JUMINGO = Object.freeze({
  id: 3712, shipper_tariff_id: 11, offerId: "11112222333344445555666677778888", publicCarrierId: "dhl",
  netPrice: 9.9, vatAmount: 1.88, finalPrice: 11.78, bookable: true, requiredPriceInputs: Object.freeze([]),
});

const TOTALS_GESCHAEFT = Object.freeze({ customerShippingNet: 12.34, shippingVat: 2.34, customerShippingGross: 14.68,
                                         insuranceGross: 0, customerTotalNet: 12.34, customerTotalGross: 14.68 });
const TOTALS_PRIVAT = Object.freeze({ customerShippingNet: 15.52, shippingVat: 2.95, customerShippingGross: 18.47,
                                      insuranceGross: 0, customerTotalNet: 15.52, customerTotalGross: 18.47 });

const optionen = (over = {}) => ({
  offerId: OFFER_ID, offerRevision: 0, optionsId: OPTIONS_ID, expiresAt: "2026-09-14T12:15:00.000Z",
  priceInput: "deliveryIsResidential", boundValue: null,
  options: [
    { value: false, surcharge: { net: 0, vat: 0, gross: 0 }, totals: TOTALS_GESCHAEFT },
    { value: true, surcharge: { net: 3.18, vat: 0.61, gross: 3.79 }, totals: TOTALS_PRIVAT },
  ],
  ...over,
});

const BASIS = Object.freeze({ type: "shipping_base", taxable: true, net: 12.34, vat: 2.34, gross: 14.68 });
const ZUSCHLAG = Object.freeze({ type: "residential_delivery_surcharge", taxable: true, net: 3.18, vat: 0.61, gross: 3.79 });
const COVER = Object.freeze({ isInsurable: true, selectionModel: "cover_value", coverState: "available" });

const angebotsausschnitt = (wert) => (wert
  ? { netPrice: 15.52, vatAmount: 2.95, finalPrice: 18.47, bookable: true, unavailableReason: null,
      priceCompleteness: "complete", insuranceAvailable: true, insuranceDetails: COVER }
  : { netPrice: 12.34, vatAmount: 2.34, finalPrice: 14.68, bookable: true, unavailableReason: null,
      priceCompleteness: "complete", insuranceAvailable: true, insuranceDetails: COVER });

const bindung = (wert, over = {}) => ({
  offerId: OFFER_ID, offerRevision: 1,
  priceInputs: { deliveryIsResidential: wert }, priceCompleteness: "complete",
  components: wert ? [BASIS, ZUSCHLAG] : [BASIS],
  totals: wert ? TOTALS_PRIVAT : TOTALS_GESCHAEFT,
  offer: angebotsausschnitt(wert),
  insuranceReset: false, idempotent: false,
  ...over,
});

const OPT = readPriceInputOptions(optionen(), TG22);
const PRIVAT = tariffWithPriceInputBinding(TG22, readPriceInputBinding(bindung(true), { tariff: TG22, value: true }));

/* ══════════ §38 — Frontend-Pflichttests ══════════ */

test("R1 — vor dem Angebotsvergleich gibt es keine Adressfrage; der Vergleich sendet Inhalt und Warenwert", () => {
  assert.deepEqual(Object.keys(blankDeclarations()).sort(), ["declaredContent", "declaredGoodsValue"]);
  const f = { declaredContent: "Ersatzteile", declaredGoodsValue: "250" };
  assert.deepEqual(declarationErrors(f), {}, "ohne Adressart ist das Formular unvollständig");
  assert.deepEqual(declarationsPayload(f), { content: "Ersatzteile", goodsValue: 250 });
  assert.deepEqual(declarationsPayload({ ...f, collectionIsResidential: true, deliveryIsResidential: false }),
    { content: "Ersatzteile", goodsValue: 250 }, "eine Adressart gelangt in den Vergleich");
  for (const k of ["collectionIsResidential", "deliveryIsResidential"]) {
    assert.ok(!SHIPMENT_FORM_KEYS.includes(k), `${k} steht wieder im Formularvorgang`);
    assert.ok(!BOOKING_KEYS.includes(k), `${k} steht wieder im Buchungsvorgang`);
  }
});

test("R2 — ein Angebot ohne diese Angabe (JUMiNGO) bekommt keine Frage, keine Anfrage, keinen Buchungsteil", () => {
  assert.equal(offerRequiresResidentialChoice(JUMINGO), false);
  assert.equal(offerSurchargeHint(JUMINGO), null);
  assert.deepEqual(residentialBookPayload(JUMINGO), {});
  assert.equal(residentialBlocksBooking({ required: offerRequiresResidentialChoice(JUMINGO),
    status: RESIDENTIAL_STATUS.IDLE, boundValue: null, tariff: JUMINGO }), false);
  for (const t of [null, {}, { requiredPriceInputs: null }, { requiredPriceInputs: "deliveryIsResidential" },
                   { requiredPriceInputs: ["collectionIsResidential"] }]) {
    assert.equal(offerRequiresResidentialChoice(t), false, JSON.stringify(t));
  }
  const v = buildBookingPriceView({ tariff: JUMINGO, insuranceType: "none" });
  assert.equal(v.status, PRICE_STATUS.BASE_CONFIRMED);
  assert.equal(v.components, null);
});

test("R3 — ein TG22-Angebot: auswählbar, nicht buchbar, genau die Frage nach der Lieferadresse", () => {
  assert.equal(offerRequiresResidentialChoice(TG22), true);
  assert.equal(offerAwaitsPriceInputs(TG22), true);
  assert.equal(offerSelectable(TG22), true, "das Angebot ist nicht auswählbar");
  assert.equal(offerBookable(TG22), false, "das Angebot gilt als buchbar (Auszeichnungen)");
  assert.equal(offerBlockedLabel(TG22), null, "der Knopf trägt einen Sperrgrund statt „Angebot auswählen“");
  assert.equal(offerBlockedHint(TG22), null);
  assert.equal(isIndicativePrice(TG22), true);
  assert.equal(INDICATIVE_PRICE_LABEL, "Vorläufiger Preis");
  assert.equal(offerSurchargeHint(TG22), "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.");

  // Nur genau dieser Grund mit genau dieser Angabe macht auswählbar.
  for (const t of [{ ...TG22, unavailableReason: "quote_only" }, { ...TG22, unavailableReason: "irgendwas" },
                   { ...TG22, requiredPriceInputs: ["collectionIsResidential"] }, { ...TG22, requiredPriceInputs: [] },
                   { ...TG22, availableForDate: false }]) {
    assert.equal(offerSelectable(t), false, JSON.stringify(t));
    assert.equal(offerSurchargeHint(t), null);
  }

  const view = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: OPT, boundValue: null });
  assert.equal(RESIDENTIAL_TEXT.sectionTitle, "Art der Lieferadresse");
  assert.deepEqual(view.cards.map((k) => k.id), ["residential-delivery-business", "residential-delivery-private"]);
  assert.deepEqual(view.cards.map((k) => k.label), ["Geschäftsadresse", "Privatadresse"]);
  assert.equal(view.cards.some((k) => k.checked), false, "ohne Bindung ist eine Karte vorausgewählt");
  assert.equal(view.cards.some((k) => k.disabled), false);
});

test("R4 — während des Ladens: Hinweis, keine Karte", () => {
  assert.equal(RESIDENTIAL_TEXT.loading, "Zuschlag wird berechnet …");
  for (const status of [RESIDENTIAL_STATUS.IDLE, RESIDENTIAL_STATUS.LOADING]) {
    const v = residentialModuleView({ status, options: OPT, boundValue: true });
    assert.equal(v.showLoading, true);
    assert.equal(v.cards.length, 0, `${status}: eine alte Option ist während des Ladens wählbar`);
    assert.equal(v.showError, false);
  }
});

test("R5 — Geschäftsadresse: „+ 0,00 € brutto“ und „0,00 € netto“", () => {
  const [geschaeft] = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: OPT }).cards;
  assert.equal(nbsp(geschaeft.grossText), "+ 0,00 € brutto");
  assert.equal(nbsp(geschaeft.netText), "0,00 € netto");
  assert.equal(geschaeft.value, false);
});

test("R6 — Privatadresse: der Zuschlag des Servers, brutto und netto, ohne „+ MwSt.“", () => {
  const [, privat] = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: OPT }).cards;
  assert.equal(nbsp(privat.grossText), "+ 3,79 € brutto");
  assert.equal(nbsp(privat.netText), "3,18 € netto");
  assert.doesNotMatch(`${privat.grossText} ${privat.netText}`, /MwSt/);
  // Ein anderer Serverwert erscheint genau so — es gibt keinen Rechenweg im Client.
  const anders = optionen();
  anders.options = [anders.options[0], { value: true, surcharge: { net: 2.23, vat: 0.42, gross: 2.65 }, totals: TOTALS_PRIVAT }];
  const karte = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: readPriceInputOptions(anders, TG22) }).cards[1];
  assert.equal(nbsp(karte.grossText), "+ 2,65 € brutto");
  assert.equal(nbsp(karte.netText), "2,23 € netto");
  assert.equal(optionFor(OPT, true).totals.customerShippingGross, 18.47);
});

test("R7 — Optionen scheitern: Fehlertext, „Erneut versuchen“, keine Karte, kein lokaler Ersatz", () => {
  for (const [status, body] of [[503, { code: "PRICE_INPUT_OPTIONS_UNAVAILABLE" }], [503, { code: "PRICE_INPUT_OPTIONS_INCONSISTENT" }],
                                [429, null], [500, { error: "x" }], [0, null], [400, { code: "PRICE_INPUTS_REQUEST_INVALID" }]]) {
    assert.equal(residentialErrorAction(status, body), RESIDENTIAL_ACTION.RETRY, `${status} ${JSON.stringify(body)}`);
  }
  const v = residentialModuleView({ status: RESIDENTIAL_STATUS.ERROR, options: OPT, errorKind: RESIDENTIAL_ACTION.RETRY });
  assert.equal(v.errorText, "Der Zuschlag konnte nicht berechnet werden.");
  assert.equal(v.errorAction, RESIDENTIAL_ACTION.RETRY);
  assert.equal(RESIDENTIAL_TEXT.retry, "Erneut versuchen");
  assert.equal(v.cards.length, 0, "neben dem Fehler steht eine wählbare Karte");
  // Ein unbekannter Fehlerzustand zeigt denselben neutralen Text — nie etwas Erfundenes.
  assert.equal(residentialModuleView({ status: RESIDENTIAL_STATUS.ERROR, errorKind: "quatsch" }).errorAction, RESIDENTIAL_ACTION.RETRY);

  // Eine Antwort in anderer Form ist KEINE Option.
  const vertauscht = optionen(); vertauscht.options = [vertauscht.options[1], vertauscht.options[0]];
  const geschaeftMitZuschlag = optionen(); geschaeftMitZuschlag.options[0] = { ...geschaeftMitZuschlag.options[0], surcharge: { net: 1, vat: 0.19, gross: 1.19 } };
  const ohneTotal = optionen(); ohneTotal.options[1] = { ...ohneTotal.options[1], totals: { ...TOTALS_PRIVAT, customerTotalNet: undefined } };
  const textbetrag = optionen(); textbetrag.options[1] = { ...textbetrag.options[1], surcharge: { net: "3.18", vat: 0.61, gross: 3.79 } };
  for (const kaputt of [null, {}, "x", optionen({ optionsId: "" }), optionen({ offerRevision: -1 }), optionen({ offerRevision: 1.5 }),
                        optionen({ priceInput: "collectionIsResidential" }), optionen({ options: [] }),
                        optionen({ offerId: "99999999999999999999999999999999" }), vertauscht, geschaeftMitZuschlag, ohneTotal, textbetrag]) {
    assert.equal(readPriceInputOptions(kaputt, TG22), null, JSON.stringify(kaputt));
  }
});

test("R8 — Bindung gelungen: Anfrage mit Serverwerten; Angebot, Preisstand, Bestandteile und Preis kommen vom Server", () => {
  assert.deepEqual(bindRequestBody({ tariff: TG22, options: OPT, value: true }),
    { offerId: OFFER_ID, offerRevision: 0, optionsId: OPTIONS_ID, deliveryIsResidential: true, expectedShippingGross: 18.47 });

  const b = readPriceInputBinding(bindung(true), { tariff: TG22, value: true });
  assert.ok(b, "eine gültige Bindungsantwort wurde verworfen");
  assert.ok(!("requiredPriceInputs" in b.overlay), "der Ausschnitt trägt eine eigene Liste");

  assert.equal(PRIVAT.bookable, true);
  assert.equal(PRIVAT.unavailableReason, null);
  assert.equal(PRIVAT.priceCompleteness, "complete");
  assert.deepEqual([PRIVAT.netPrice, PRIVAT.vatAmount, PRIVAT.finalPrice], [15.52, 2.95, 18.47]);
  assert.equal(PRIVAT.offerRevision, 1);
  assert.deepEqual(PRIVAT.priceInputs, { deliveryIsResidential: true });
  assert.deepEqual([...PRIVAT.requiredPriceInputs], ["deliveryIsResidential"], "die Liste des Vergleichs ging verloren");
  assert.equal(PRIVAT.insuranceAvailable, true);
  assert.equal(PRIVAT.publicServiceName, "Standardversand");
  assert.equal(TG22.bookable, false, "das Ursprungsangebot wurde verändert");
  assert.equal(offerRevisionOf(PRIVAT), 1);
  assert.equal(residentialBoundValue(PRIVAT), true);
  assert.equal(residentialBoundValue(TG22), null);
  assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.READY, boundValue: true, tariff: PRIVAT }), false);

  const v = buildBookingPriceView({ tariff: PRIVAT, insuranceType: "none" });
  assert.equal(v.status, PRICE_STATUS.BASE_CONFIRMED);
  assert.equal(v.totalGross, 18.47);
  assert.equal(v.totalNet, 15.52);
  assert.deepEqual(v.components.map((k) => k.type), ["shipping_base", "residential_delivery_surcharge"]);
});

test("R9 — veralteter Preisstand oder abgelaufene Optionen: neu laden, nicht binden", () => {
  for (const code of ["OFFER_PRICE_CONFLICT", "PRICE_INPUT_OPTIONS_EXPIRED", "PRICE_CONFIRMATION_REQUIRED"]) {
    assert.equal(residentialErrorAction(409, { code, offerRevision: 3 }), RESIDENTIAL_ACTION.RELOAD, code);
  }
  assert.equal(conflictRevisionOf({ code: "OFFER_PRICE_CONFLICT", offerRevision: 3 }), 3);
  for (const body of [{ code: "OFFER_PRICE_CONFLICT" }, { offerRevision: "3" }, { offerRevision: -1 }, null]) {
    assert.equal(conflictRevisionOf(body), null, JSON.stringify(body));
  }
  assert.deepEqual(optionsRequestBody(TG22), { offerId: OFFER_ID, offerRevision: 0 });
  assert.deepEqual(optionsRequestBody(TG22, 3), { offerId: OFFER_ID, offerRevision: 3 });
  assert.deepEqual(optionsRequestBody(PRIVAT), { offerId: OFFER_ID, offerRevision: 1 });
  assert.deepEqual(Object.keys(optionsRequestBody(PRIVAT)), ["offerId", "offerRevision"], "die Optionsanfrage trägt mehr als zwei Felder");
  assert.equal(optionsRequestBody({ ...TG22, offerId: "" }), null);
  // Eine Antwort zu einer anderen Wahl bindet nichts.
  assert.equal(readPriceInputBinding(bindung(false), { tariff: TG22, value: true }), null);
});

test("R10 — Wechsel Privat → Geschäft: neuer Preisstand, eine Zeile, kein Zuschlag", () => {
  const privatBindung = readPriceInputBinding(bindung(true), { tariff: TG22, value: true });
  const nachPrivat = optionsAfterBinding(OPT, privatBindung);
  assert.deepEqual([nachPrivat.offerRevision, nachPrivat.boundValue, nachPrivat.optionsId], [1, true, OPTIONS_ID]);
  assert.equal(OPT.offerRevision, 0, "der vorherige Optionsstand wurde verändert");
  assert.equal(optionsAfterBinding(OPT, { ...privatBindung, offerId: "andere" }), null);

  assert.deepEqual(bindRequestBody({ tariff: PRIVAT, options: nachPrivat, value: false }),
    { offerId: OFFER_ID, offerRevision: 1, optionsId: OPTIONS_ID, deliveryIsResidential: false, expectedShippingGross: 14.68 });

  const geschaeft = tariffWithPriceInputBinding(PRIVAT,
    readPriceInputBinding(bindung(false, { offerRevision: 2 }), { tariff: PRIVAT, value: false }));
  assert.deepEqual([geschaeft.finalPrice, geschaeft.offerRevision], [14.68, 2]);
  assert.equal(residentialBoundValue(geschaeft), false, "Geschäftsadresse gilt nicht als Antwort");
  assert.equal(geschaeft.priceComponents.length, 1);
  const v = buildBookingPriceView({ tariff: geschaeft, insuranceType: "none" });
  assert.deepEqual(v.components.map((k) => k.type), ["shipping_base"]);
  assert.equal(surchargeSummaryNote(v), null);

  // Eine Geschäftsadresse mit Nullzuschlagszeile ist nicht dieser Vertrag.
  assert.equal(readPriceInputBinding(bindung(false, { components: [BASIS, { ...ZUSCHLAG, net: 0, vat: 0, gross: 0 }] }),
    { tariff: PRIVAT, value: false }), null);
});

test("R11 — vor der Bindung: kein bestätigter Preis, keine Absicherung, Buchung gesperrt", () => {
  const v = buildBookingPriceView({ tariff: TG22, insuranceType: "transit_cover", priceInputsRequired: true,
                                    repriceResult: { totals: TOTALS_PRIVAT } });
  assert.equal(v.status, PRICE_STATUS.PRICE_INPUTS_REQUIRED);
  assert.equal(v.isPriceInputsRequired, true);
  assert.equal(v.hasConfirmedPrice, false);
  assert.equal(v.components, null);
  assert.equal(priceViewBlocksBooking(v), true);
  // Eine offene Preisänderung sticht weiterhin.
  assert.equal(buildBookingPriceView({ tariff: TG22, priceChangePending: true, priceInputsRequired: true }).status,
    PRICE_STATUS.PRICE_CHANGED);

  for (const status of Object.values(RESIDENTIAL_STATUS)) {
    assert.equal(residentialBlocksBooking({ required: true, status, boundValue: null, tariff: TG22 }), true, status);
  }
  // Eine Wahl ohne gebundenes Angebot gilt nicht — ebensowenig ein gebundenes Angebot während neu geladen wird.
  assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.READY, boundValue: true, tariff: TG22 }), true);
  assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.LOADING, boundValue: true, tariff: PRIVAT }), true);
  assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.READY, boundValue: false, tariff: PRIVAT }), true);
  // Dieselbe Wahl, aber das Angebot trägt einen älteren Preisstand als der Optionsstand (Neubestätigung):
  // gesperrt, bis das Angebot die neue Bindung trägt.
  assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.READY, boundValue: true,
    tariff: PRIVAT, options: { offerRevision: 3 } }), true);
  assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.READY, boundValue: true,
    tariff: PRIVAT, options: { offerRevision: 1 } }), false);

  assert.equal(isPriceInputsRequired({ code: "PRICE_INPUTS_REQUIRED" }), true);
  assert.equal(isPriceInputsRequired({ code: "PRICE_CHANGED" }), false);
  assert.equal(RESIDENTIAL_TEXT.required, "Bitte wählen Sie zuerst die Art der Lieferadresse.");
});

test("R12 — nach einem Wechsel kommt keine alte Absicherung zurück (Schlüssel = Angebot + Preisstand)", () => {
  const geschaeftBindung = readPriceInputBinding(bindung(false, { offerRevision: 2, insuranceReset: true }), { tariff: PRIVAT, value: false });
  assert.equal(geschaeftBindung.insuranceReset, true);
  const geschaeft = tariffWithPriceInputBinding(PRIVAT, geschaeftBindung);

  assert.equal(insuranceRestoreKey(TG22), `${OFFER_ID}:0`);
  assert.equal(insuranceRestoreKey(PRIVAT), `${OFFER_ID}:1`);
  assert.equal(insuranceRestoreKey(geschaeft), `${OFFER_ID}:2`);
  assert.equal(insuranceRestoreKey({}), null);

  const gespeichert = { step: 2, insuranceOfferKey: insuranceRestoreKey(PRIVAT), insuranceType: "transit_cover",
                        insuranceValue: "250", goodsAreNew: false, goodsAreFragile: false };
  assert.equal(insuranceRestoreApplies(gespeichert, PRIVAT), true);
  assert.equal(insuranceRestoreApplies(gespeichert, geschaeft), false, "eine Absicherung zum alten Preisstand kommt zurück");
  assert.deepEqual(restoredInsuranceState(gespeichert, geschaeft),
    { step: 1, insuranceType: "none", insuranceValue: "", insValueManual: false, goodsAreNew: null, goodsAreFragile: null });
  // Ein älterer Vorgang (Schlüssel ohne Preisstand) passt zu keinem Angebot.
  assert.equal(insuranceRestoreApplies({ ...gespeichert, insuranceOfferKey: OFFER_ID }, PRIVAT), false);
});

test("R13 — Aufstellung: Bestandteile mit Bezeichnung, Totals vom Server; unbekannter Typ → keine Zeilen", () => {
  const v = buildBookingPriceView({ tariff: PRIVAT, insuranceType: "none" });
  const zeilen = priceSummaryComponents(v);
  assert.deepEqual(zeilen.taxable.map((k) => [k.label, k.net]), [["Versand", 12.34], ["Zuschlag Privatadresse", 3.18]]);
  assert.equal(zeilen.taxFree.length, 0);

  const reprice = {
    totals: { customerShippingNet: 15.52, shippingVat: 2.95, customerShippingGross: 18.47, insuranceGross: 4.5,
              customerTotalNet: 20.02, customerTotalGross: 22.97 },
    components: [BASIS, ZUSCHLAG, { type: "transport_insurance", taxable: false, net: 4.5, vat: 0, gross: 4.5 }],
    priceRevision: 1,
  };
  const vi = buildBookingPriceView({ tariff: PRIVAT, insuranceType: "transit_cover", repriceResult: reprice });
  assert.equal(vi.status, PRICE_STATUS.REPRICE_CONFIRMED);
  assert.equal(vi.totalGross, 22.97);
  assert.deepEqual(priceSummaryComponents(vi).taxFree.map((k) => k.label), ["Zusätzliche Transportabsicherung"]);

  const fremd = { ...PRIVAT, priceComponents: [BASIS, { type: "fuel_surcharge", taxable: true, net: 1, vat: 0.19, gross: 1.19 }] };
  const vf = buildBookingPriceView({ tariff: fremd, insuranceType: "none" });
  assert.equal(vf.components, null, "ein unbekannter Typ bekam eine geratene Zeile");
  assert.equal(vf.hasConfirmedPrice, true, "die Totals verschwanden mit den Bestandteilen");
  assert.equal(vf.totalGross, 18.47);
  assert.equal(priceSummaryComponents(vf), null);

  // Der Gesamtbetrag ist der des Servers — auch wenn die Zeilen etwas anderes ergäben.
  const abweichend = { ...PRIVAT, priceComponents: [BASIS, { ...ZUSCHLAG, gross: 9.99 }] };
  assert.equal(buildBookingPriceView({ tariff: abweichend, insuranceType: "none" }).totalGross, 18.47);

  // Erfolgsbildschirm: bevorzugt die Bestandteile der Buchungsantwort.
  assert.equal(bookingSuccessComponents({ priceComponents: [BASIS] }, vi).length, 1);
  assert.equal(bookingSuccessComponents({ priceComponents: null }, vi).length, 3);
  assert.equal(bookingSuccessComponents({}, {}), null);
});

test("R14 — ausgewähltes Angebot: vorher „Vorläufiger Preis“, nachher „Gesamt“ mit Zuschlagszeile", () => {
  const vorher = buildBookingPriceView({ tariff: TG22, insuranceType: "none", priceInputsRequired: true });
  assert.deepEqual(priceInfo(vorher), { confirmed: false, changed: false, label: "Vorläufiger Preis", gross: 14.68, net: 12.34 });
  assert.equal(surchargeSummaryNote(vorher), null);
  const nachher = buildBookingPriceView({ tariff: PRIVAT, insuranceType: "none" });
  assert.deepEqual(priceInfo(nachher), { confirmed: true, changed: false, label: "Gesamt", gross: 18.47, net: 15.52 });
  assert.equal(nbsp(surchargeSummaryNote(nachher)), "inkl. Zuschlag Privatadresse 3,79 €");
});

test("R15 — die Angebotsliste trägt nach der Bindung genau dieses Angebot mit Serverwerten", () => {
  const liste = [JUMINGO, TG22];
  const ergebnis = replaceOffer(liste, PRIVAT);
  assert.equal(ergebnis[0], JUMINGO);
  assert.equal(ergebnis[1], PRIVAT);
  assert.equal(liste[1], TG22, "die Liste wurde verändert statt ersetzt");
  // In der Liste ist es jetzt buchbar und vollständig bepreist — kein Zuschlagshinweis mehr.
  assert.equal(offerBookable(PRIVAT), true);
  assert.equal(offerSurchargeHint(PRIVAT), null);
  assert.equal(isIndicativePrice(PRIVAT), false);
});

test("R16 — Zurück und wieder hinein: die Wahl kommt über die Optionsantwort zurück", () => {
  const o = readPriceInputOptions(optionen({ offerRevision: 1, boundValue: true }), PRIVAT);
  assert.equal(tariffMatchesOptionsBinding(PRIVAT, o), true);
  assert.deepEqual(residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: o, boundValue: true }).cards.map((k) => k.checked),
    [false, true]);
  // Ohne gebundenes Angebot, zu einem anderen Stand oder zu einer anderen Wahl: keine stille Übernahme.
  assert.equal(tariffMatchesOptionsBinding(TG22, o), false);
  assert.equal(tariffMatchesOptionsBinding(PRIVAT, readPriceInputOptions(optionen({ offerRevision: 2, boundValue: true }), PRIVAT)), false);
  assert.equal(tariffMatchesOptionsBinding(PRIVAT, readPriceInputOptions(optionen({ offerRevision: 1, boundValue: false }), PRIVAT)), false);
  assert.equal(tariffMatchesOptionsBinding(PRIVAT, readPriceInputOptions(optionen({ offerRevision: 1 }), PRIVAT)), false);
  // Die stille Wiederherstellung bindet dieselbe Wahl aus demselben Serverstand.
  assert.deepEqual(bindRequestBody({ tariff: TG22, options: o, value: true }),
    { offerId: OFFER_ID, offerRevision: 1, optionsId: OPTIONS_ID, deliveryIsResidential: true, expectedShippingGross: 18.47 });
  assert.deepEqual(residentialBookPayload(PRIVAT), { offerRevision: 1, priceInputs: { deliveryIsResidential: true } });
});

test("R17 — Entwurf und Vorgang aus der Zeit davor: Adressarten werden ignoriert, nichts sperrt", () => {
  const alt = { content: "Ersatzteile", goodsValue: 250, collectionIsResidential: true, deliveryIsResidential: false };
  assert.deepEqual(declarationsFromSnapshot(alt), { declaredContent: "Ersatzteile", declaredGoodsValue: "250" });
  const { form } = buildResumeInitialState({ declarations: alt }, { today: "2026-09-14" });
  assert.equal(form.declaredGoodsValue, "250");
  assert.ok(!("collectionIsResidential" in form) && !("deliveryIsResidential" in form), "der Entwurf bringt eine Adressart zurück");
  assert.deepEqual(declarationErrors(form), {}, "eine fehlende Adressart sperrt den Vergleich");
  assert.deepEqual(declarationsSnapshot({ declaredContent: "X", declaredGoodsValue: "5", deliveryIsResidential: true }),
    { content: "X", goodsValue: 5 });

  const f = normalizeForm({ declaredContent: "X", collectionIsResidential: false, deliveryIsResidential: true }, "shipment");
  assert.equal(f.declaredContent, "X");
  assert.ok(!("collectionIsResidential" in f) && !("deliveryIsResidential" in f));
  const b = normalizeBooking({ deliveryIsResidential: true, collectionIsResidential: false, insuranceOfferKey: `${OFFER_ID}:1` });
  assert.ok(!("deliveryIsResidential" in b) && !("collectionIsResidential" in b));
  assert.equal(b.insuranceOfferKey, `${OFFER_ID}:1`);
  assert.ok(!("deliveryIsResidential" in emptyBooking()));
});

test("R18 — PRICE_CHANGED mit Neubestätigung: kein Übernahmeknopf, Text zur Lieferadresse", () => {
  const antwort = { code: "PRICE_CHANGED", priceInputsRebindRequired: true, offerRevision: 2 };
  assert.equal(isRebindRequired(antwort), true);
  assert.equal(isRebindRequired({ code: "PRICE_CHANGED" }), false);
  const text = "Der Preis für dieses Angebot hat sich geändert. Bitte wählen Sie die Art der Lieferadresse erneut.";
  assert.equal(RESIDENTIAL_TEXT.rebind, text);

  // Auch wenn die Antwort (unerwartet) Beträge trüge: keine Bestätigung über Beträge.
  const ansicht = priceChangeAnsicht({ ...antwort, oldPrice: 14.68, newPrice: 15.1 });
  assert.equal(ansicht.kind, PRICE_CHANGE_KIND.REBIND);
  assert.equal(preisIstBestaetigbar(ansicht), false, "eine Neubestätigung bekommt einen Übernahmeknopf");
  assert.equal(PREISAENDERUNG_TEXT[PRICE_CHANGE_KIND.REBIND], text);
  const offen = pendingPriceChangeNotice(ansicht);
  assert.equal(offen.reviewable, false);
  assert.match(offen.text, /Art der Lieferadresse erneut/);
  assert.equal(preisIstBestaetigbar(insuredPriceChangeView({ ...antwort, oldTotalGross: 20, newTotalGross: 21 }, 20)), false);

  const fehler = mapBookRestError(409, { code: "PRICE_INPUTS_REQUIRED", error: "roh" });
  assert.equal(fehler.message, "Bitte wählen Sie zuerst die Art der Lieferadresse.");
  assert.equal(fehler.retryable, false);
});

test("R19 — kein Anbietername in Texten, Bezeichnungen und neuen Modulen", () => {
  const verboten = /transglobal|jumingo|quoteid|shipper_tariff_id|itemdescription/i;
  const texte = [...Object.values(RESIDENTIAL_TEXT), ...Object.values(PRICE_COMPONENT_LABELS), INDICATIVE_PRICE_LABEL,
                 PREISAENDERUNG_TEXT[PRICE_CHANGE_KIND.REBIND],
                 ...residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: OPT }).cards.flatMap((k) => [k.label, k.grossText, k.netText])];
  for (const t of texte) {
    assert.doesNotMatch(t, verboten, t);
    assert.doesNotMatch(t, /\bRES\b/, t);
  }
  for (const datei of ["residentialPriceInputs.mjs", "priceComponentsView.mjs", "../components/booking/ResidentialPriceInputModule.jsx"]) {
    const quelle = readFileSync(path.join(HIER, datei), "utf8");
    assert.doesNotMatch(quelle, verboten, datei);
    assert.doesNotMatch(quelle, /\bRES\b/, datei);
  }
});

test("R24 — Regression JUMiNGO: Auswahl, Sperrgründe, Inhalt und Absicherungsschlüssel unverändert", () => {
  assert.equal(offerSelectable(JUMINGO), true);
  assert.equal(offerBlocked(JUMINGO), false);
  assert.equal(offerAwaitsPriceInputs(JUMINGO), false);
  assert.equal(offerBlockedLabel({ bookable: false, unavailableReason: "quote_only" }), "Derzeit nicht direkt buchbar");
  assert.equal(offerBlockedLabel({ availableForDate: false }), "Nicht verfügbar für dieses Datum");
  assert.deepEqual(bookingContentPayload("Paket", JUMINGO.requiredPriceInputs), { content: "Paket" });
  assert.deepEqual(bookingContentPayload("Paket", TG22.requiredPriceInputs), {});
  assert.equal(insuranceRestoreKey(JUMINGO), `${JUMINGO.offerId}:0`);
  assert.equal(insuranceRestoreKey({ id: 3712 }), "t:3712:0");
  const v = buildBookingPriceView({ tariff: JUMINGO, insuranceType: "none" });
  assert.deepEqual(priceInfo(v), { confirmed: true, changed: false, label: "Gesamt", gross: 11.78, net: 9.9 });
  assert.equal(surchargeSummaryNote(v), null);
});

/* ══════════ §39 — Sicherheitsfälle, soweit das Frontend sie trägt ══════════ */

test("S1 — fremdes Angebot oder fremder Optionsstand: keine Option, keine Bindungsanfrage", () => {
  assert.equal(readPriceInputOptions(optionen({ offerId: "99999999999999999999999999999999" }), TG22), null);
  assert.equal(bindRequestBody({ tariff: { ...TG22, offerId: "99999999999999999999999999999999" }, options: OPT, value: true }), null);
  assert.equal(bindRequestBody({ tariff: TG22, options: null, value: true }), null);
  // Die Optionskennung stammt ausschließlich aus der Serverantwort.
  assert.equal(bindRequestBody({ tariff: { ...TG22, optionsId: "manipuliert" }, options: OPT, value: true }).optionsId, OPTIONS_ID);
});

test("S2 — manipulierte Wahl: nur echte Booleans werden gebunden", () => {
  for (const wert of ["true", "false", 1, 0, null, undefined, {}]) {
    assert.equal(bindRequestBody({ tariff: TG22, options: OPT, value: wert }), null, JSON.stringify(wert));
  }
});

test("S3 — der bestätigte Versandbetrag stammt aus der gewählten Option, nicht aus dem Angebot", () => {
  assert.equal(bindRequestBody({ tariff: { ...TG22, finalPrice: 1 }, options: OPT, value: true }).expectedShippingGross, 18.47);
  assert.equal(bindRequestBody({ tariff: { ...TG22, finalPrice: 99 }, options: OPT, value: false }).expectedShippingGross, 14.68);
});

test("S4 — verbrauchtes, unbekanntes oder nicht mehr buchbares Angebot: eigene Handlung, nie „erneut versuchen“", () => {
  assert.equal(residentialErrorAction(409, { code: "OFFER_ALREADY_USED" }), RESIDENTIAL_ACTION.USED);
  for (const [status, code] of [[404, "OFFER_NOT_FOUND"], [404, undefined], [409, "OFFER_MISMATCH"], [409, "OFFER_NOT_BOOKABLE"],
                                [409, "SHIPMENT_DECLARATIONS_MISSING"], [409, "SHIPMENT_NOT_DRAFT"], [409, "PRICE_INPUTS_NOT_SUPPORTED"]]) {
    assert.equal(residentialErrorAction(status, code ? { code } : null), RESIDENTIAL_ACTION.RECALCULATE, `${status} ${code}`);
  }
  const verwendet = residentialModuleView({ status: RESIDENTIAL_STATUS.ERROR, errorKind: RESIDENTIAL_ACTION.USED });
  assert.equal(verwendet.errorText, OFFER_ALREADY_USED_TEXT);
  assert.equal(verwendet.errorAction, RESIDENTIAL_ACTION.USED);
  const neu = residentialModuleView({ status: RESIDENTIAL_STATUS.ERROR, errorKind: RESIDENTIAL_ACTION.RECALCULATE });
  assert.equal(neu.errorText, RESIDENTIAL_TEXT.recalculate);
  assert.equal(neu.errorAction, RESIDENTIAL_ACTION.RECALCULATE);
});

test("S5 — eine manipulierte Bindungsantwort wird verworfen", () => {
  const faelle = [
    bindung(true, { offerId: "99999999999999999999999999999999" }),
    bindung(true, { priceCompleteness: "indicative" }),
    bindung(true, { components: [BASIS] }),
    bindung(false, { components: [BASIS, ZUSCHLAG] }),
    bindung(true, { components: [BASIS, ZUSCHLAG, { type: "transport_insurance", taxable: false, net: 4, vat: 0, gross: 4 }] }),
    bindung(true, { components: [BASIS, { ...ZUSCHLAG, type: "Residential Surcharge" }] }),
    bindung(true, { totals: { ...TOTALS_PRIVAT, customerShippingGross: "18.47" } }),
    bindung(true, { offer: { ...angebotsausschnitt(true), finalPrice: 19 } }),
    bindung(true, { offer: { ...angebotsausschnitt(true), netPrice: undefined } }),
    bindung(true, { offer: { ...angebotsausschnitt(true), bookable: "true" } }),
    bindung(true, { offer: { ...angebotsausschnitt(true), priceCompleteness: "indicative" } }),
    bindung(true, { offer: null }),
    bindung(true, { offerRevision: -1 }),
    bindung(true, { priceInputs: { deliveryIsResidential: "true" } }),
    null,
  ];
  for (const f of faelle) assert.equal(readPriceInputBinding(f, { tariff: TG22, value: true }) === null
    || readPriceInputBinding(f, { tariff: TG22, value: false }) === null, true, JSON.stringify(f));
  for (const f of faelle.slice(0, -1)) {
    assert.equal(readPriceInputBinding(f, { tariff: TG22 }), null, JSON.stringify(f));
  }
});

test("S6 — direkte Buchung ohne Bindung: keine behauptete Wahl, Sperre bleibt", () => {
  assert.deepEqual(residentialBookPayload(TG22), { offerRevision: 0 });
  assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.READY, boundValue: null, tariff: TG22 }), true);
  // Ein Angebot, das eine Bindung nur behauptet (ohne Serverbestandteile), gilt nicht als gebunden.
  const behauptet = { ...TG22, bookable: true, priceCompleteness: "complete", priceInputs: { deliveryIsResidential: true } };
  assert.equal(residentialBoundValue(behauptet), null);
  assert.deepEqual(residentialBookPayload(behauptet), { offerRevision: 0 });
});

test("S7 — Doppelklick: während der Bindung sind beide Karten gesperrt, die gewählte ist markiert", () => {
  const v = residentialModuleView({ status: RESIDENTIAL_STATUS.BINDING, options: OPT, boundValue: false, pendingValue: true });
  assert.equal(v.locked, true);
  assert.deepEqual(v.cards.map((k) => k.disabled), [true, true]);
  assert.deepEqual(v.cards.map((k) => k.checked), [false, true]);
  assert.equal(v.bindingText, RESIDENTIAL_TEXT.binding);
  const bereit = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: OPT, boundValue: false, pendingValue: true });
  assert.deepEqual(bereit.cards.map((k) => k.checked), [true, false], "außerhalb der Bindung zählt die gebundene Wahl");
  assert.equal(bereit.locked, false);
});

test("S8 — Nachricht zur Neubestätigung und zum Zurücksetzen der Absicherung", () => {
  const v = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: OPT, notice: RESIDENTIAL_TEXT.insuranceReset });
  assert.equal(v.notice, RESIDENTIAL_TEXT.insuranceReset);
  assert.equal(residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: OPT, notice: "" }).notice, null);
  assert.match(RESIDENTIAL_TEXT.reconfirm, /Art der Lieferadresse erneut/);
});
