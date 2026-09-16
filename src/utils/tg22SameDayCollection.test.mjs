// TG22 Same-Day — die Abholung am selben Tag in der Oberfläche (utils/sameDayCollectionView.mjs und Verdrahtung).
//
// Die Oberfläche entscheidet nichts: OB heute abgeholt werden kann, BIS WANN und mit welchem ZUSCHLAG, sagt der
// Server. Geprüft wird, dass sie genau diese Aussagen zeigt — auf der Angebotskarte, der Buchungsseite und dem
// Erfolgsbildschirm —, dass sie dabei nichts rechnet und keine Uhr liest, und dass JUMiNGO und ein künftiger
// Abholtag unverändert bleiben.
//
// Die Testnamen tragen die Nummern der Frontend-Pflichttests 1–20. Die Browserprüfungen 21–24 (1440 / 834 /
// 390 px, kein horizontaler Überlauf) stehen in tests/e2e/tg22SameDayCollection.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  sameDayOfferView, sameDaySurchargeLine, sameDayDetailValue, sameDayUntilText, sameDaySummaryNote,
  readSameDayCollectionBlock, sameDaySuccessPickupText, SAME_DAY_TEXT, SAME_DAY_COLLECTION_UNAVAILABLE_CODE,
  SAME_DAY_UNAVAILABLE_REASON, SAME_DAY_UNAVAILABLE_REASONS, SAME_DAY_UNAVAILABLE_KIND, sameDayUnavailableKindOf,
  sameDayUnavailableView, sameDayUnavailableBookingText,
} from "./sameDayCollectionView.mjs";
import {
  offerSelectable, offerBookable, offerBlockedLabel, offerBlockedHint, offerAwaitsPriceInputs,
  OFFER_SAME_DAY_UNAVAILABLE_TEXT, OFFER_SAME_DAY_UNAVAILABLE_HINT, OFFER_DATE_UNAVAILABLE_HINT,
  OFFER_SAME_DAY_UNCONFIRMED_TEXT, OFFER_SAME_DAY_UNVERIFIABLE_TEXT, OFFER_BLOCKED_FALLBACK,
} from "./offerIdentity.mjs";
import { PRICE_COMPONENT_LABELS, priceSummaryComponents, hasSameDayCollectionSurcharge } from "./priceComponentsView.mjs";
import {
  readPriceInputOptions, readPriceInputBinding, tariffWithPriceInputBinding, residentialBoundValue,
  residentialErrorAction, residentialModuleView, residentialBookPayload, optionsAfterBinding, bindRequestBody,
  offerSurchargeHint, RESIDENTIAL_ACTION, RESIDENTIAL_STATUS,
} from "./residentialPriceInputs.mjs";
import { buildBookingPriceView, PRICE_STATUS } from "./bookingPriceView.mjs";
import { priceInfo, surchargeSummaryNote } from "./bookingSummaryView.mjs";
import { bookingSuccessComponents, bookingSuccessAmountView } from "./bookingSuccessView.mjs";
import { mapBookRestError, fordertNeuberechnung, BOOK_FEHLER } from "./bookingErrors.mjs";
import { coverRepriceErrorText } from "./coverInsuranceView.mjs";
import { replaceOffer } from "./acceptedOfferPrice.mjs";
import { buildResumeInitialState } from "./formDraftsView.mjs";
import { BOOKING_KEYS, SHIPMENT_FORM_KEYS } from "./shippingFlowState.mjs";
import { pickupContractOf, pickupTimeText } from "./pickupContractView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
// CRLF-Checkouts (Windows) auf LF bringen — mehrere Anker enthalten Zeilenumbrüche.
const lies = (p) => readFileSync(path.join(HIER, p), "utf8").replace(/\r\n/g, "\n");
// Ganze Zeilenkommentare zuerst, dann Blockkommentare, dann Restkommentare hinter Code.
const ohneKommentare = (s) => s
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const code = (p) => ohneKommentare(lies(p));
const ohneTexte = (s) => s
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
  .replace(/`(?:[^`\\]|\\.)*`/g, "``");
const abschnitt = (quelle, von, bis) => {
  const a = quelle.indexOf(von);
  assert.ok(a >= 0, `Anker fehlt: ${von}`);
  const b = quelle.indexOf(bis, a + von.length);
  assert.ok(b > a, `Endanker fehlt: ${bis}`);
  return quelle.slice(a, b);
};
// Intl setzt zwischen Betrag und Währung ein geschütztes Leerzeichen.
const nbsp = (s) => String(s).replace(/ /g, " ");

const KARTE = "../components/offers/OfferCard.jsx";
const SUMMARY = "../components/booking/OfferSummaryModule.jsx";
const LIVE = "../components/booking/BookingLiveSummary.jsx";
const ERFOLG = "../components/booking/BookingSuccessStep.jsx";
const SEITE = "../pages/BookingPage.jsx";

// Kein Einkaufsanbieter, kein Anbietercode, kein Rohfeld des Anbieters.
const VERBOTEN = /transglobal|jumingo|colfee|same day collection fee|sameDayCollectionCutOffTime|itemdescription|quoteid/i;

/* ══════════ Fixtures — die Formen des Vertrags ══════════ */

const OFFER_ID = "22sd0000000000000000000000000022";
const OPTIONS_ID = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
const HEUTE = "2026-09-14";

// Serverbeträge der Evidenz R2 (20 % Aufschlag, 19 % MwSt.) — hier nur Fixturewerte, nie gerechnet:
//   B   ohne Zuschlag                  12,34 / 2,34 / 14,68
//   S   Abholung heute                 15,36 / 2,92 / 18,28   Zuschlag S − B   3,02 / 0,58 / 3,60
//   PS  heute + Privatadresse          18,54 / 3,52 / 22,06   Zuschlag PS − S  3,18 / 0,60 / 3,78
const B = Object.freeze({ net: 12.34, vat: 2.34, gross: 14.68 });
const S = Object.freeze({ net: 15.36, vat: 2.92, gross: 18.28 });
const PS = Object.freeze({ net: 18.54, vat: 3.52, gross: 22.06 });
const SD = Object.freeze({ net: 3.02, vat: 0.58, gross: 3.6 });
const RES = Object.freeze({ net: 3.18, vat: 0.6, gross: 3.78 });

const TG22_HEUTE = Object.freeze({
  offerId: OFFER_ID, publicCarrierId: "ups", publicServiceName: "Standardversand", serviceType: "pickup",
  collectionDate: HEUTE, collectionReadyFrom: "11:30",
  netPrice: S.net, vatAmount: S.vat, finalPrice: S.gross, currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: Object.freeze(["deliveryIsResidential"]), insuranceAvailable: false, insuranceDetails: null,
  pickupToday: true, pickupTodayUntil: "16:45", sameDaySurchargeNet: SD.net, sameDaySurchargeGross: SD.gross,
});
// Gesperrte Abholung heute: der Server nennt den Tag, aber keine „bereit ab"-Zeit (Same-Day-Grundvertrag).
const TG22_HEUTE_VORBEI = Object.freeze({
  ...TG22_HEUTE, netPrice: B.net, vatAmount: B.vat, finalPrice: B.gross,
  unavailableReason: "same_day_unavailable", collectionReadyFrom: null,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
});
const TG22_HEUTE_UNBESTAETIGT = Object.freeze({ ...TG22_HEUTE_VORBEI, unavailableReason: "same_day_unconfirmed" });
const TG22_HEUTE_UNPRUEFBAR = Object.freeze({ ...TG22_HEUTE_VORBEI, unavailableReason: "same_day_unverifiable" });
// TG23 (Expressversand) trägt denselben Vertrag — die Oberfläche kennt keine ServiceID.
const TG23_HEUTE_UNBESTAETIGT = Object.freeze({
  ...TG22_HEUTE_UNBESTAETIGT, offerId: "23sd0000000000000000000000000023", publicServiceName: "Expressversand",
  netPrice: 26.25, vatAmount: 4.99, finalPrice: 31.24,
});
const TG22_MORGEN = Object.freeze({
  ...TG22_HEUTE, collectionDate: "2026-09-15", collectionReadyFrom: "09:00",
  netPrice: B.net, vatAmount: B.vat, finalPrice: B.gross,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
});
// Ein JUMiNGO-Tarif mit eigener Abholung heute — er trägt `pickupToday`, aber keinen Same-Day-Vertrag.
const JUMINGO_HEUTE = Object.freeze({
  id: 3712, shipper_tariff_id: 11, offerId: "11112222333344445555666677778888", publicCarrierId: "dhl",
  serviceType: "pickup", pickupToday: true, pickupDate: HEUTE, pickupTimeFrom: "13:00", pickupTimeUntil: "17:00",
  netPrice: 9.9, vatAmount: 1.88, finalPrice: 11.78, bookable: true, requiredPriceInputs: Object.freeze([]),
});

const BLOCK = Object.freeze({ pickupTodayUntil: "16:45", collectionDate: HEUTE, collectionReadyFrom: "11:45", surcharge: SD });
const BASIS_K = Object.freeze({ type: "shipping_base", taxable: true, ...B });
const SD_K = Object.freeze({ type: "same_day_collection_surcharge", taxable: true, ...SD });
const RES_K = Object.freeze({ type: "residential_delivery_surcharge", taxable: true, ...RES });
const INS_K = Object.freeze({ type: "transport_insurance", taxable: false, net: 10, vat: 0, gross: 10 });
const COVER = Object.freeze({ isInsurable: true, selectionModel: "cover_value", coverState: "available" });

const summen = (p) => ({ customerShippingNet: p.net, shippingVat: p.vat, customerShippingGross: p.gross,
                         insuranceGross: 0, customerTotalNet: p.net, customerTotalGross: p.gross });

const optionen = (over = {}) => ({
  offerId: OFFER_ID, offerRevision: 0, optionsId: OPTIONS_ID, expiresAt: "2026-09-14T10:15:00.000Z",
  priceInput: "deliveryIsResidential", boundValue: null,
  options: [
    { value: false, surcharge: { net: 0, vat: 0, gross: 0 }, totals: summen(S) },
    { value: true, surcharge: { ...RES }, totals: summen(PS) },
  ],
  sameDayCollection: BLOCK,
  ...over,
});

const bindung = (wert, over = {}) => {
  const p = wert ? PS : S;
  return {
    offerId: OFFER_ID, offerRevision: 1, priceInputs: { deliveryIsResidential: wert }, priceCompleteness: "complete",
    components: wert ? [BASIS_K, SD_K, RES_K] : [BASIS_K, SD_K],
    totals: summen(p),
    offer: { netPrice: p.net, vatAmount: p.vat, finalPrice: p.gross, bookable: true, unavailableReason: null,
             priceCompleteness: "complete", insuranceAvailable: true, insuranceDetails: COVER },
    insuranceReset: false, idempotent: false,
    sameDayCollection: BLOCK,
    ...over,
  };
};
const gebundenAn = (wert) =>
  tariffWithPriceInputBinding(TG22_HEUTE, readPriceInputBinding(bindung(wert), { tariff: TG22_HEUTE, value: wert }));

/* ══════════ §48 — Frontend-Pflichttests ══════════ */

test("1 — sichtbar: ein Angebot mit Abholung heute ist auswählbar und trägt Zuschlags- und Abholschlusszeile", () => {
  const v = sameDayOfferView(TG22_HEUTE);
  assert.ok(v, "die Serveraussage wird nicht gelesen");
  assert.equal(offerSelectable(TG22_HEUTE), true);
  assert.equal(offerAwaitsPriceInputs(TG22_HEUTE), true);
  assert.equal(offerBlockedLabel(TG22_HEUTE), null, "der Knopf trägt einen Sperrgrund statt „Angebot auswählen“");
  const karte = code(KARTE);
  assert.match(karte, /import \{\s*sameDayOfferView, sameDaySurchargeLine, sameDayDetailValue, SAME_DAY_TEXT,\s*\} from "\.\.\/\.\.\/utils\/sameDayCollectionView\.mjs";/);
  assert.match(karte, /const sameDay = sameDayOfferView\(t\);/);
  assert.match(karte, /\{sameDay && \(\s*<div className="offer-sameday-surcharge">\{sameDaySurchargeLine\(sameDay, vatMode\)\}<\/div>\s*\)\}/);
  assert.match(karte, /\{sameDay && <p className="offer-cta-hint offer-sameday-until">\{sameDay\.untilText\}<\/p>\}/);
  // Die Zeile gehört zum Preis: sie steht im Preisblock, nicht in der Timeline.
  const preisblock = abschnitt(karte, 'className="offer-price-block"', "className={`offer-cta-btn ${ctaClass}`}");
  assert.ok(preisblock.includes("offer-sameday-surcharge"), "die Zuschlagszeile steht nicht am Preis");
  const timeline = abschnitt(karte, 'className="offer-zone-2"', 'className="offer-zone-3"');
  assert.doesNotMatch(timeline, /sameDay/, "die Timeline trägt die Zuschlagszeile");
});

test("2 — der Kartenpreis ist der Serverpreis: der Zuschlag steckt darin, nichts wird addiert", () => {
  const karte = code(KARTE);
  const preisblock = abschnitt(karte, 'className="offer-price-block"', "className={`offer-cta-btn ${ctaClass}`}");
  assert.match(preisblock, /vatMode === "gross"\s*\? money\(t\.finalPrice \?\? t\.netPrice\)\s*: money\(t\.netPrice\)/);
  assert.doesNotMatch(karte, /sameDaySurcharge(Net|Gross)/, "die Karte liest die Zuschlagsfelder selbst");
  assert.equal(TG22_HEUTE.finalPrice, S.gross);
  // Das Modul rechnet nicht: keine arithmetische Verknüpfung außerhalb von Texten und Mustern.
  const modul = ohneTexte(code("sameDayCollectionView.mjs"))
    .replace(/\/\^.*?\$\//g, "//")
    .replace(/=>/g, "");
  assert.ok(!/[\w)\]]\s*[*/+-]\s*[\w(]/.test(modul), "im Modul steht eine Rechnung");
});

test("3 — die Zuschlagszeile: „Zuschlag für Abholung am selben Tag: +X,XX €“", () => {
  const v = sameDayOfferView(TG22_HEUTE);
  assert.equal(nbsp(sameDaySurchargeLine(v, "net")), "Zuschlag für Abholung am selben Tag: +3,02 €");
  assert.equal(PRICE_COMPONENT_LABELS.same_day_collection_surcharge, "Zuschlag für Abholung am selben Tag");
  assert.equal(SAME_DAY_TEXT.surchargeLabel, "Zuschlag für Abholung am selben Tag");
  assert.equal(sameDaySurchargeLine(null, "net"), null);
});

test("4 — netto oder brutto wie der Kartenpreis; die Preisaufschlüsselung nennt beide", () => {
  const v = sameDayOfferView(TG22_HEUTE);
  assert.equal(nbsp(sameDaySurchargeLine(v, "gross")), "Zuschlag für Abholung am selben Tag: +3,60 €");
  assert.equal(nbsp(sameDaySurchargeLine(v, "net")), "Zuschlag für Abholung am selben Tag: +3,02 €");
  assert.equal(nbsp(sameDayDetailValue(v)), "+3,02 € netto · +3,60 € brutto");
  assert.equal(sameDayDetailValue(null), null);
  const details = abschnitt(code(KARTE), "function DetailsPanel", "function OfferCardBase");
  assert.match(details, /const sameDay = sameDayOfferView\(t\);/);
  assert.match(details, /\{sameDay && <DetailRow label=\{SAME_DAY_TEXT\.surchargeLabel\} value=\{sameDayDetailValue\(sameDay\)\} \/>\}/);
});

test("5 — „Abholung heute möglich bis HH:MM Uhr“ nennt die Uhrzeit des Servers — unbrauchbar heißt keine Zeile", () => {
  assert.equal(sameDayOfferView(TG22_HEUTE).untilText, "Abholung heute möglich bis 16:45 Uhr");
  assert.equal(sameDayUntilText(TG22_HEUTE), "Abholung heute möglich bis 16:45 Uhr");
  assert.equal(sameDayUntilText({ ...TG22_HEUTE, pickupTodayUntil: "15:30" }), "Abholung heute möglich bis 15:30 Uhr");
  for (const kaputt of [
    { pickupTodayUntil: "16:45:00" }, { pickupTodayUntil: "24:00" }, { pickupTodayUntil: "" }, { pickupTodayUntil: null },
    { sameDaySurchargeNet: null }, { sameDaySurchargeGross: "3.60" }, { sameDaySurchargeNet: 0 },
    { sameDaySurchargeNet: -1 }, { sameDaySurchargeGross: 2.5 }, { pickupToday: "true" }, { pickupToday: 1 },
    { sameDaySurchargeNet: Number.NaN },
  ]) {
    assert.equal(sameDayOfferView({ ...TG22_HEUTE, ...kaputt }), null, JSON.stringify(kaputt));
  }
  assert.equal(sameDayUntilText(null), null);
});

test("6 — nach dem Abholschluss bleibt das Angebot sichtbar: Preis, Grund am Knopf, Hinweis darunter", () => {
  assert.equal(TG22_HEUTE_VORBEI.unavailableReason, SAME_DAY_UNAVAILABLE_REASON);
  assert.equal(offerBlockedLabel(TG22_HEUTE_VORBEI), "Abholung heute nicht mehr möglich.");
  assert.equal(offerBlockedHint(TG22_HEUTE_VORBEI), "Bitte wählen Sie einen späteren Abholtag.");
  assert.equal(sameDayOfferView(TG22_HEUTE_VORBEI), null, "ein nicht mehr möglicher Zuschlag wird genannt");
  assert.equal(TG22_HEUTE_VORBEI.netPrice, B.net);
  // Keine Fläche filtert oder entscheidet an diesem Grund — die Karte bleibt im Vergleich.
  for (const datei of ["../pages/NewShipmentPage.jsx", "../components/offers/OffersList.jsx", "offerBadges.js"]) {
    assert.doesNotMatch(code(datei), /same_day_unavailable|pickupTodayUntil|sameDaySurcharge/, datei);
  }
  const karte = code(KARTE);
  assert.match(karte, /\{unavailableHint && <p className="offer-cta-hint">\{unavailableHint\}<\/p>\}/);
});

test("7 — nach dem Abholschluss nicht auswählbar und nicht buchbar", () => {
  assert.equal(offerSelectable(TG22_HEUTE_VORBEI), false);
  assert.equal(offerBookable(TG22_HEUTE_VORBEI), false);
  assert.equal(offerAwaitsPriceInputs(TG22_HEUTE_VORBEI), false);
  assert.equal(offerSurchargeHint(TG22_HEUTE_VORBEI), null);
  const karte = code(KARTE);
  assert.ok(karte.includes("const handleSelect = () => { if (!unavailable) onSelect(t); };"));
  assert.match(karte, /const unavailable = !offerSelectable\(t\);/);
  assert.match(karte, /disabled=\{unavailable\}/);
});

test("8 — je Art derselbe Satz bei Optionen, Bindung, Neubepreisung und Buchung — Handlung „neu berechnen“", () => {
  assert.equal(OFFER_SAME_DAY_UNAVAILABLE_TEXT, "Abholung heute nicht mehr möglich.");
  assert.equal(OFFER_SAME_DAY_UNAVAILABLE_HINT, "Bitte wählen Sie einen späteren Abholtag.");
  assert.equal(SAME_DAY_TEXT.bookingUnavailable, "Abholung heute nicht mehr möglich. Bitte wählen Sie einen späteren Abholtag.");
  assert.equal(SAME_DAY_TEXT.bookingUnconfirmed,
    "Abholung heute für dieses Angebot nicht verfügbar. Bitte wählen Sie einen späteren Abholtag.");
  assert.equal(SAME_DAY_TEXT.bookingUnverifiable,
    "Abholung heute kann derzeit nicht bestätigt werden. Bitte wählen Sie einen späteren Abholtag.");
  for (const t of [OFFER_SAME_DAY_UNAVAILABLE_TEXT, OFFER_SAME_DAY_UNAVAILABLE_HINT, ...Object.values(SAME_DAY_TEXT),
                   sameDayOfferView(TG22_HEUTE).untilText]) {
    assert.doesNotMatch(t, VERBOTEN);
  }
  assert.equal(SAME_DAY_COLLECTION_UNAVAILABLE_CODE, "SAME_DAY_COLLECTION_UNAVAILABLE");

  const JE_ART = [
    ["expired", RESIDENTIAL_ACTION.SAME_DAY_UNAVAILABLE, BOOK_FEHLER.ABHOLUNG_HEUTE_VORBEI, SAME_DAY_TEXT.bookingUnavailable],
    ["unconfirmed", RESIDENTIAL_ACTION.SAME_DAY_UNCONFIRMED, BOOK_FEHLER.ABHOLUNG_HEUTE_UNBESTAETIGT,
     SAME_DAY_TEXT.bookingUnconfirmed],
    ["unverifiable", RESIDENTIAL_ACTION.SAME_DAY_UNVERIFIABLE, BOOK_FEHLER.ABHOLUNG_HEUTE_NICHT_PRUEFBAR,
     SAME_DAY_TEXT.bookingUnverifiable],
  ];
  for (const [art, aktion, fehler, text] of JE_ART) {
    const body = { code: SAME_DAY_COLLECTION_UNAVAILABLE_CODE, sameDayUnavailableKind: art, error: "Rohtext des Servers" };
    // Optionen und Bindung: Fehlerfläche mit dem Satz der Art und dem Weg zur Neuberechnung — keine Karte, kein „erneut".
    assert.equal(residentialErrorAction(409, body), aktion, art);
    const modul = residentialModuleView({ status: RESIDENTIAL_STATUS.ERROR, errorKind: aktion });
    assert.equal(modul.errorText, text, art);
    assert.equal(modul.errorAction, RESIDENTIAL_ACTION.RECALCULATE, art);
    assert.deepEqual(modul.cards, [], art);
    // Buchung: kein Wiederholen, dieselbe Handlung wie „nichts beauftragt, neu berechnen".
    assert.equal(fordertNeuberechnung(body), true, art);
    const f = mapBookRestError(409, body);
    assert.equal(f, fehler, art);
    assert.equal(f.message, text, art);
    assert.equal(f.retryable, false, art);
    assert.doesNotMatch(`${f.title} ${f.message}`, /Rohtext|erneut versuchen/i, art);
    // Neubepreisung der Absicherung: derselbe Satz.
    assert.equal(coverRepriceErrorText(409, body), text, art);
    assert.equal(sameDayUnavailableBookingText(body), text, art);
  }
  // „nicht mehr möglich" steht nur beim zeitlichen Ablauf.
  assert.doesNotMatch(SAME_DAY_TEXT.bookingUnconfirmed + SAME_DAY_TEXT.bookingUnverifiable, /nicht mehr/);

  // Seite: Neubepreisung und Übernahme ersetzen den Bestellknopf durch den Hinweis mit Neuberechnung.
  const seite = code(SEITE);
  assert.match(seite, /import \{ sameDayUnavailableBookingText, SAME_DAY_COLLECTION_UNAVAILABLE_CODE \} from "\.\.\/utils\/sameDayCollectionView\.mjs";/);
  const lauf = abschnitt(seite, "const runReprice = async", "useEffect(() => {\n    repriceSeq.current++;");
  assert.match(lauf, /if \(d\?\.code === SAME_DAY_COLLECTION_UNAVAILABLE_CODE\) \{\s*setRepriceError\(sameDayUnavailableBookingText\(d\)\);\s*setRecalcNotice\(sameDayUnavailableBookingText\(d\)\);\s*setRepriceLoading\(false\);\s*return;\s*\}/);
  const annahme = abschnitt(seite, "const acceptInsuredPriceChange = async", "const continueWithNewPrice");
  assert.match(annahme, /if \(d\?\.code === SAME_DAY_COLLECTION_UNAVAILABLE_CODE\) \{\s*setPriceChange\(null\);\s*setRecalcNotice\(sameDayUnavailableBookingText\(d\)\);\s*return;\s*\}/);
  assert.doesNotMatch(lauf + annahme, /doBook\(|\/api\/jumingo\/book/, "der Hinweis bucht");
  assert.doesNotMatch(seite, /SAME_DAY_TEXT\.bookingUnavailable/, "die Seite setzt den Satz des zeitlichen Ablaufs pauschal");
});

test("9 — Zusammenfassungen: vorläufig aus dem Angebot, bestätigt aus dem Serverbestandteil, nie nach einer Preisänderung", () => {
  const vorlaeufig = buildBookingPriceView({ tariff: TG22_HEUTE, insuranceType: "none", priceInputsRequired: true });
  assert.equal(vorlaeufig.status, PRICE_STATUS.PRICE_INPUTS_REQUIRED);
  assert.equal(priceInfo(vorlaeufig).gross, S.gross, "der vorläufige Preis ist nicht der Serverpreis mit Zuschlag");
  assert.equal(nbsp(sameDaySummaryNote(vorlaeufig, TG22_HEUTE)), "inkl. Zuschlag für Abholung am selben Tag 3,60 €");

  const gebunden = gebundenAn(false);
  const bestaetigt = buildBookingPriceView({ tariff: gebunden, insuranceType: "none" });
  assert.equal(bestaetigt.status, PRICE_STATUS.BASE_CONFIRMED);
  assert.equal(nbsp(sameDaySummaryNote(bestaetigt, gebunden)), "inkl. Zuschlag für Abholung am selben Tag 3,60 €");
  assert.deepEqual(priceSummaryComponents(bestaetigt).taxable.map((k) => [k.label, k.net]),
    [["Versand", 12.34], ["Zuschlag für Abholung am selben Tag", 3.02]]);

  assert.equal(sameDaySummaryNote({ ...bestaetigt, isPriceChanged: true }, gebunden), null);
  // Bestätigte Bestandteile OHNE Zuschlag gewinnen gegen die Felder des Angebots.
  const ohneZuschlag = buildBookingPriceView({ tariff: { ...gebunden, priceComponents: [BASIS_K] }, insuranceType: "none" });
  assert.equal(sameDaySummaryNote(ohneZuschlag, gebunden), null);
  assert.equal(sameDaySummaryNote(null, null), null);

  const summary = code(SUMMARY);
  assert.match(summary, /import \{ sameDaySummaryNote, sameDayUntilText \} from "\.\.\/\.\.\/utils\/sameDayCollectionView\.mjs";/);
  assert.match(summary, /const sameDayHinweis = sameDaySummaryNote\(priceView, tariff\);/);
  assert.match(summary, /const sameDayBis = sameDayUntilText\(tariff\);/);
  assert.match(summary, /\{sameDayHinweis && \(\s*<div className="offsum-price-vat" id="offer-summary-sameday-note">\{sameDayHinweis\}<\/div>\s*\)\}/);
  assert.match(summary, /id="offer-summary-sameday-until"/);
  const live = code(LIVE);
  assert.match(live, /const sameDayHinweis = sameDaySummaryNote\(v, tariff\);/);
  assert.match(live, /\{sameDayHinweis && \(\s*<span className="blsum-ins-note" id="booking-live-sameday-note">\{sameDayHinweis\}<\/span>\s*\)\}/);
  // Beide Flächen lesen weiterhin den gemeinsamen Abholvertrag und keine Abholfelder direkt.
  for (const q of [summary, live]) {
    assert.ok(q.includes("pickupSummaryOf(tariff, pickupWindow)"));
    assert.doesNotMatch(q, /collectionReadyFrom|collectionDate|pickupTodayUntil|sameDaySurcharge/);
  }
});

test("10 — Erfolg: die gebuchten Bestandteile und die TATSÄCHLICH gesendete Abholzeit", () => {
  const booking = { amount: 22.06, priceComponents: [BASIS_K, SD_K, RES_K],
                    sameDayCollection: { collectionDate: HEUTE, collectionReadyFrom: "12:00" } };
  assert.deepEqual(bookingSuccessComponents(booking, null).map((k) => k.label),
    ["Versand", "Zuschlag für Abholung am selben Tag", "Zuschlag Privatadresse"]);
  assert.equal(sameDaySuccessPickupText(booking), "14.09.2026 · bereit ab 12:00 Uhr");
  for (const b of [null, {}, { sameDayCollection: null }, { sameDayCollection: { collectionDate: HEUTE } },
                   { sameDayCollection: { collectionDate: "14.09.2026", collectionReadyFrom: "12:00" } },
                   { sameDayCollection: { collectionDate: HEUTE, collectionReadyFrom: "12:00:00" } },
                   { sameDayCollection: [HEUTE, "12:00"] }]) {
    assert.equal(sameDaySuccessPickupText(b), null, JSON.stringify(b));
  }
  const erfolg = code(ERFOLG);
  assert.match(erfolg, /const abholungHeute = sameDaySuccessPickupText\(booking\);/);
  assert.match(erfolg, /\{abholungHeute && \(\s*<div className="summary-detail-row summary-detail-row-border" id="booking-success-pickup">/);
  assert.match(erfolg, /components: bookingSuccessComponents\(booking, priceView\)/);
  assert.doesNotMatch(erfolg, /collectionReadyFrom|pickupTodayUntil/, "der Erfolg liest die Abholzeit des Angebots");
});

test("11 — heute + Privatadresse: Optionen mit Block, Bindung mit drei Bestandteilen, frische „bereit ab“-Zeit", () => {
  const opt = readPriceInputOptions(optionen(), TG22_HEUTE);
  assert.ok(opt, "die Optionsantwort mit Same-Day-Block wurde verworfen");
  assert.deepEqual({ ...opt.sameDayCollection, surcharge: { ...opt.sameDayCollection.surcharge } },
    { pickupTodayUntil: "16:45", collectionDate: HEUTE, collectionReadyFrom: "11:45", surcharge: { ...SD } });
  assert.deepEqual({ ...opt.options[1].surcharge }, { ...RES });
  assert.equal(opt.options[1].totals.customerShippingGross, PS.gross);
  assert.deepEqual(bindRequestBody({ tariff: TG22_HEUTE, options: opt, value: true }),
    { offerId: OFFER_ID, offerRevision: 0, optionsId: OPTIONS_ID, deliveryIsResidential: true, expectedShippingGross: 22.06 });

  const b = readPriceInputBinding(bindung(true), { tariff: TG22_HEUTE, value: true });
  assert.ok(b, "die Bindung mit Same-Day-Bestandteil wurde verworfen");
  assert.deepEqual(b.components.map((k) => k.type),
    ["shipping_base", "same_day_collection_surcharge", "residential_delivery_surcharge"]);
  const neu = tariffWithPriceInputBinding(TG22_HEUTE, b);
  assert.equal(neu.collectionReadyFrom, "11:45", "die frische „bereit ab“-Zeit der Bindung fehlt");
  assert.equal(pickupTimeText(pickupContractOf(neu)), "bereit ab 11:45 Uhr");
  assert.equal(neu.finalPrice, PS.gross);
  assert.equal(residentialBoundValue(neu), true);
  assert.deepEqual([neu.pickupToday, neu.pickupTodayUntil], [true, "16:45"]);
  assert.equal(optionsAfterBinding(opt, b).sameDayCollection, opt.sameDayCollection);

  // Fail closed: ein Block in anderer Form, ein Block ohne Zuschlag im Preis, ein anderer Abholtag.
  assert.equal(readPriceInputOptions(optionen({ sameDayCollection: { pickupTodayUntil: "16:45" } }), TG22_HEUTE), null);
  assert.equal(readPriceInputOptions(optionen({ sameDayCollection: "heute" }), TG22_HEUTE), null);
  assert.equal(readPriceInputBinding(bindung(true, { components: [BASIS_K, RES_K] }), { tariff: TG22_HEUTE, value: true }),
    null, "ein Block ohne Zuschlag im gebundenen Preis wurde übernommen");
  assert.equal(tariffWithPriceInputBinding({ ...TG22_HEUTE, collectionDate: "2026-09-15" }, b), null,
    "eine Abholzeit für einen anderen Abholtag wurde übernommen");
  assert.equal(readSameDayCollectionBlock({ ...BLOCK, surcharge: { ...SD, gross: 0 } }).ok, false);
  assert.equal(readSameDayCollectionBlock({ ...BLOCK, collectionReadyFrom: "9:00" }).ok, false);
  assert.deepEqual(readSameDayCollectionBlock(undefined), { ok: true, value: null });
});

test("12 — heute + Absicherung: Bestandteile der Neubepreisung, Absicherung steuerfrei, Zuschlagszeile bleibt", () => {
  const gebunden = gebundenAn(false);
  const reprice = {
    totals: { customerShippingNet: 15.36, shippingVat: 2.92, customerShippingGross: 18.28,
              insuranceGross: 10, customerTotalNet: 25.36, customerTotalGross: 28.28 },
    components: [BASIS_K, SD_K, INS_K], insurance: { coverValue: 500, excessValue: 20 },
  };
  const v = buildBookingPriceView({ tariff: gebunden, insuranceType: "transit_cover", repriceResult: reprice });
  assert.equal(v.status, PRICE_STATUS.REPRICE_CONFIRMED);
  const zeilen = priceSummaryComponents(v);
  assert.deepEqual(zeilen.taxable.map((k) => k.type), ["shipping_base", "same_day_collection_surcharge"]);
  assert.deepEqual(zeilen.taxFree.map((k) => [k.label, k.gross]), [["Zusätzliche Transportabsicherung", 10]]);
  assert.equal(v.totalGross, 28.28);
  assert.equal(nbsp(sameDaySummaryNote(v, gebunden)), "inkl. Zuschlag für Abholung am selben Tag 3,60 €");
  assert.equal(surchargeSummaryNote(v), null, "ohne Privatadresse erscheint ein Zuschlag Privatadresse");
});

test("13 — heute + Privatadresse + Absicherung: vier Bestandteile, zwei Zuschlagszeilen, /book ohne Same-Day-Angabe", () => {
  const gebunden = gebundenAn(true);
  const reprice = {
    totals: { customerShippingNet: 18.54, shippingVat: 3.52, customerShippingGross: 22.06,
              insuranceGross: 10, customerTotalNet: 28.54, customerTotalGross: 32.06 },
    components: [BASIS_K, SD_K, RES_K, INS_K], insurance: { coverValue: 500, excessValue: 20 },
  };
  const v = buildBookingPriceView({ tariff: gebunden, insuranceType: "transit_cover", repriceResult: reprice });
  const zeilen = priceSummaryComponents(v);
  assert.deepEqual(zeilen.taxable.map((k) => k.label), ["Versand", "Zuschlag für Abholung am selben Tag", "Zuschlag Privatadresse"]);
  assert.equal(zeilen.taxFree.length, 1);
  assert.equal(nbsp(surchargeSummaryNote(v)), "inkl. Zuschlag Privatadresse 3,78 €");
  assert.equal(nbsp(sameDaySummaryNote(v, gebunden)), "inkl. Zuschlag für Abholung am selben Tag 3,60 €");

  const buchung = residentialBookPayload(gebunden);
  assert.deepEqual(buchung, { offerRevision: 1, priceInputs: { deliveryIsResidential: true } });
  assert.doesNotMatch(JSON.stringify(buchung), /pickupToday|sameDay|collectionReadyFrom/, "/book sendet eine Same-Day-Angabe");

  const booking = { amount: 32.06, priceComponents: [BASIS_K, SD_K, RES_K, INS_K],
                    sameDayCollection: { collectionDate: HEUTE, collectionReadyFrom: "12:00" } };
  assert.equal(bookingSuccessAmountView(booking, v).showBreakdown, true);
  assert.equal(bookingSuccessComponents(booking, v).length, 4);
});

test("14 — Zurück zum Vergleich: das gebundene Angebot behält Zuschlagszeile und Serverpreis — ohne Neuberechnung", () => {
  const gebunden = gebundenAn(false);
  const liste = replaceOffer([JUMINGO_HEUTE, TG22_HEUTE], gebunden);
  assert.equal(liste[0], JUMINGO_HEUTE);
  assert.equal(liste[1], gebunden);
  const v = sameDayOfferView(liste[1]);
  assert.ok(v, "nach der Rückkehr fehlt die Zuschlagszeile");
  assert.equal(nbsp(sameDaySurchargeLine(v, "net")), "Zuschlag für Abholung am selben Tag: +3,02 €");
  assert.equal(liste[1].netPrice, S.net);
  assert.equal(offerSelectable(liste[1]), true);
  const zurueck = abschnitt(code(SEITE), "const goBackToOffers = () => {", "const addrVollstaendig");
  assert.doesNotMatch(zurueck, /calculate-price|apiFetch|setFlowScope/, "der Rückweg berechnet oder verwirft Angebote");
});

test("15 — heute → morgen: ein Datumswechsel verwirft die Angebote; die neue Antwort trägt keinen Zuschlag", () => {
  const neu = code("../pages/NewShipmentPage.jsx");
  const wechsel = neu.match(/const handleDateChange\s*= \(iso\) => \{[\s\S]*?\n  \};/);
  assert.ok(wechsel, "handleDateChange fehlt");
  assert.match(wechsel[0], /setShippingDate\(iso\);/);
  assert.match(wechsel[0], /resetResults\(\);/);
  const reset = neu.match(/const resetResults = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(reset, "resetResults fehlt");
  assert.match(reset[0], /setTariffs\(\[\]\);/);
  assert.match(reset[0], /setSelected\(null\);/);
  assert.equal(sameDayOfferView(TG22_MORGEN), null);
  assert.equal(offerBlockedHint(TG22_MORGEN), null);
  assert.equal(offerSelectable(TG22_MORGEN), true);
});

test("16 — morgen → heute: die Oberfläche vergleicht kein Datum — der Zuschlag erscheint nur mit der Serveraussage", () => {
  assert.doesNotMatch(code("sameDayCollectionView.mjs"), /new Date|Date\.now|todayISO|businessTodayISO|getHours|toLocale/,
    "das Modul liest eine Uhr");
  for (const datei of [KARTE, SUMMARY, LIVE, ERFOLG]) {
    assert.doesNotMatch(code(datei), /pickupTodayUntil|sameDaySurcharge(Net|Gross)/, `${datei} liest die Serverfelder selbst`);
  }
  assert.equal(sameDayOfferView(TG22_MORGEN), null);
  assert.ok(sameDayOfferView(TG22_HEUTE));
  // Ein heutiger Abholtag ALLEIN gibt nichts frei.
  assert.equal(sameDayOfferView({ ...TG22_MORGEN, collectionDate: HEUTE }), null);
});

test("17 — Entwurf fortsetzen: nie ein Zuschlag, nie eine Abholung heute aus einem Speicher", () => {
  const init = buildResumeInitialState({
    shippingDate: HEUTE, pickupToday: true, pickupTodayUntil: "16:45",
    sameDaySurchargeNet: 3.02, sameDaySurchargeGross: 3.6, tariffs: [TG22_HEUTE],
  }, { today: "2026-09-15" });
  assert.doesNotMatch(JSON.stringify(init), /pickupTodayUntil|sameDaySurcharge|same_day/);
  for (const k of [...BOOKING_KEYS, ...SHIPMENT_FORM_KEYS]) {
    assert.doesNotMatch(k, /sameDay|pickupToday/i, `${k} gehört nicht in den Vorgang`);
  }
});

test("18 — künftiger Abholtag: TG22 unverändert — keine Zeile, keine Blockpflicht, Abholzeit bleibt", () => {
  assert.equal(sameDayOfferView(TG22_MORGEN), null);
  assert.equal(offerBlockedLabel(TG22_MORGEN), null);
  assert.equal(offerSurchargeHint(TG22_MORGEN), "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.");
  const privat = { net: 15.52, vat: 2.95, gross: 18.47 };
  const zuschlag = { net: 3.18, vat: 0.61, gross: 3.79 };
  const opt = readPriceInputOptions(optionen({
    sameDayCollection: undefined,
    options: [
      { value: false, surcharge: { net: 0, vat: 0, gross: 0 }, totals: summen(B) },
      { value: true, surcharge: zuschlag, totals: summen(privat) },
    ],
  }), TG22_MORGEN);
  assert.ok(opt && !("sameDayCollection" in opt));
  const b = readPriceInputBinding({
    ...bindung(true), sameDayCollection: undefined,
    components: [BASIS_K, { type: "residential_delivery_surcharge", taxable: true, ...zuschlag }],
    totals: summen(privat),
    offer: { ...bindung(true).offer, netPrice: privat.net, vatAmount: privat.vat, finalPrice: privat.gross },
  }, { tariff: TG22_MORGEN, value: true });
  assert.ok(b && !("sameDayCollection" in b));
  const neu = tariffWithPriceInputBinding(TG22_MORGEN, b);
  assert.equal(neu.collectionReadyFrom, "09:00", "die Abholzeit eines künftigen Tages wurde überschrieben");
  assert.equal(hasSameDayCollectionSurcharge(neu.priceComponents), false);
  const t = { bookable: false, unavailableReason: "date_unavailable" };
  assert.equal(offerBlockedLabel(t), "Für dieses Abholdatum nicht verfügbar.");
  assert.equal(offerBlockedHint(t), OFFER_DATE_UNAVAILABLE_HINT);
});

test("19 — JUMiNGO unverändert: „Abholung heute“ ohne Zuschlagszeile, ohne Anfrage, ohne Buchungsteil", () => {
  assert.equal(sameDayOfferView(JUMINGO_HEUTE), null);
  assert.equal(sameDaySummaryNote(buildBookingPriceView({ tariff: JUMINGO_HEUTE, insuranceType: "none" }), JUMINGO_HEUTE), null);
  assert.equal(offerSelectable(JUMINGO_HEUTE), true);
  assert.equal(offerBlockedLabel(JUMINGO_HEUTE), null);
  assert.equal(offerBlockedHint(JUMINGO_HEUTE), null);
  assert.deepEqual(residentialBookPayload(JUMINGO_HEUTE), {});
  assert.equal(pickupTimeText(pickupContractOf(JUMINGO_HEUTE)), "13:00–17:00 Uhr");
  assert.match(code(KARTE), /title = t\.pickupToday \? "Abholung heute" : "Abholung";/);
  for (const c of ["OFFER_NOT_BOOKABLE", "BOOKING_FAILED", "PRICE_UNCONFIRMED", "BOOKING_PENDING"]) {
    for (const k of ["ABHOLUNG_HEUTE_VORBEI", "ABHOLUNG_HEUTE_UNBESTAETIGT", "ABHOLUNG_HEUTE_NICHT_PRUEFBAR"]) {
      assert.notEqual(mapBookRestError(409, { code: c, sameDayUnavailableKind: "expired" }), BOOK_FEHLER[k], `${c} ${k}`);
    }
  }
  assert.equal(residentialErrorAction(409, { code: "OFFER_NOT_BOOKABLE" }), RESIDENTIAL_ACTION.RECALCULATE);
});

test("20 — kein Anbieter, kein Anbietercode, kein Rohfeld in den Same-Day-Flächen", () => {
  for (const datei of ["sameDayCollectionView.mjs", "offerIdentity.mjs", "priceComponentsView.mjs",
                       "residentialPriceInputs.mjs", "bookingErrors.mjs", KARTE, SUMMARY, LIVE, ERFOLG]) {
    assert.doesNotMatch(code(datei), VERBOTEN, datei);
  }
  for (const t of Object.values(SAME_DAY_TEXT)) assert.doesNotMatch(t, /UPS Standard|Single/i);
  for (const k of ["ABHOLUNG_HEUTE_VORBEI", "ABHOLUNG_HEUTE_UNBESTAETIGT", "ABHOLUNG_HEUTE_NICHT_PRUEFBAR"]) {
    assert.doesNotMatch(`${BOOK_FEHLER[k].title} ${BOOK_FEHLER[k].message}`, VERBOTEN, k);
  }
});

/* ══════════ Grundvertrag — abgelaufen · nicht bestätigt · nicht verifizierbar ══════════ */

test("G1 — Karte: drei Gründe, drei Sätze, derselbe Hinweis; ein unbekannter Grund bleibt neutral", () => {
  assert.deepEqual([...SAME_DAY_UNAVAILABLE_REASONS], ["same_day_unavailable", "same_day_unconfirmed", "same_day_unverifiable"]);
  for (const [t, satz] of [[TG22_HEUTE_VORBEI, "Abholung heute nicht mehr möglich."],
                           [TG22_HEUTE_UNBESTAETIGT, "Abholung heute für dieses Angebot nicht verfügbar."],
                           [TG22_HEUTE_UNPRUEFBAR, "Abholung heute kann derzeit nicht bestätigt werden."]]) {
    assert.equal(offerBlockedLabel(t), satz, t.unavailableReason);
    assert.equal(offerBlockedHint(t), "Bitte wählen Sie einen späteren Abholtag.", t.unavailableReason);
    assert.equal(offerSelectable(t), false, t.unavailableReason);
    assert.equal(offerBookable(t), false, t.unavailableReason);
    assert.equal(sameDayOfferView(t), null, t.unavailableReason);
    assert.doesNotMatch(`${offerBlockedLabel(t)} ${offerBlockedHint(t)}`, VERBOTEN);
  }
  assert.equal(OFFER_SAME_DAY_UNCONFIRMED_TEXT, "Abholung heute für dieses Angebot nicht verfügbar.");
  assert.equal(OFFER_SAME_DAY_UNVERIFIABLE_TEXT, "Abholung heute kann derzeit nicht bestätigt werden.");
  // Unbekannter Grund: der neutrale Satz, kein Hinweis, kein Rohwert.
  for (const grund of ["same_day_timeout", "same_day_cutoff_missing", "unconfirmed", "toString", ""]) {
    const t = { ...TG22_HEUTE_VORBEI, unavailableReason: grund };
    assert.equal(offerBlockedLabel(t), OFFER_BLOCKED_FALLBACK, grund);
    assert.equal(offerBlockedHint(t), null, grund);
  }
  assert.equal(OFFER_BLOCKED_FALLBACK, "Derzeit nicht buchbar");
});

test("G2 — Ablehnung: fehlende oder unbekannte Art ist „nicht verifizierbar“ — nie „nicht mehr möglich“", () => {
  assert.deepEqual({ ...SAME_DAY_UNAVAILABLE_KIND }, { EXPIRED: "expired", UNCONFIRMED: "unconfirmed", UNVERIFIABLE: "unverifiable" });
  for (const body of [{ code: SAME_DAY_COLLECTION_UNAVAILABLE_CODE },
                      { code: SAME_DAY_COLLECTION_UNAVAILABLE_CODE, sameDayUnavailableKind: "timeout" },
                      { code: SAME_DAY_COLLECTION_UNAVAILABLE_CODE, sameDayUnavailableKind: "EXPIRED" },
                      { code: SAME_DAY_COLLECTION_UNAVAILABLE_CODE, sameDayUnavailableKind: "toString" },
                      { code: SAME_DAY_COLLECTION_UNAVAILABLE_CODE, sameDayUnavailableKind: null }, null, "expired"]) {
    const name = JSON.stringify(body);
    assert.equal(sameDayUnavailableKindOf(body), "unverifiable", name);
    assert.deepEqual({ ...sameDayUnavailableView(body) },
      { title: SAME_DAY_TEXT.unverifiable, message: SAME_DAY_TEXT.bookingUnverifiable }, name);
    if (body && typeof body === "object") {
      assert.equal(mapBookRestError(409, body), BOOK_FEHLER.ABHOLUNG_HEUTE_NICHT_PRUEFBAR, name);
      assert.equal(fordertNeuberechnung(body), true, name);
      assert.equal(coverRepriceErrorText(409, body), SAME_DAY_TEXT.bookingUnverifiable, name);
      assert.equal(residentialErrorAction(409, body), RESIDENTIAL_ACTION.SAME_DAY_UNVERIFIABLE, name);
    }
  }
  // Ein unbekannter Code bleibt ein unbekannter Code — die Art macht keinen Same-Day-Fall daraus.
  assert.equal(residentialErrorAction(409, { code: "SOMETHING_ELSE", sameDayUnavailableKind: "expired" }), RESIDENTIAL_ACTION.RETRY);
  assert.equal(fordertNeuberechnung({ code: "toString" }), false);
  // Ein unbekannter Fehlerzustand des Moduls bleibt „erneut versuchen" — nie ein Same-Day-Satz.
  assert.equal(residentialModuleView({ status: RESIDENTIAL_STATUS.ERROR, errorKind: "same_day_other" }).errorAction,
    RESIDENTIAL_ACTION.RETRY);
});

test("G3 — gesperrte Abholung heute: keine „bereit ab“-Zeile, der Tag bleibt; verfügbar dynamisch; später 09:00", () => {
  for (const t of [TG22_HEUTE_VORBEI, TG22_HEUTE_UNBESTAETIGT, TG22_HEUTE_UNPRUEFBAR, TG23_HEUTE_UNBESTAETIGT]) {
    const vertrag = pickupContractOf(t);
    assert.equal(vertrag.day, HEUTE, t.unavailableReason);
    assert.equal(vertrag.readyFrom, null, t.unavailableReason);
    assert.equal(pickupTimeText(vertrag), null, `${t.unavailableReason}: „bereit ab" für eine gesperrte Abholung heute`);
  }
  // Verfügbar: die dynamische Zeit des Servers (11:37 → 11:45), später Abholtag: die Vorgabezeit.
  assert.equal(pickupTimeText(pickupContractOf({ ...TG22_HEUTE, collectionReadyFrom: "11:45" })), "bereit ab 11:45 Uhr");
  assert.equal(pickupTimeText(pickupContractOf(TG22_MORGEN)), "bereit ab 09:00 Uhr");
  // Die Karte liest die Abholzeit ausschließlich über den gemeinsamen Helfer — keine eigene Ersatzzeit.
  const karte = code(KARTE);
  assert.doesNotMatch(karte, /collectionReadyFrom|"09:00"/, "die Karte ergänzt eine Abholzeit");
  assert.doesNotMatch(code("pickupContractView.mjs"), /"09:00"/, "der Helfer ergänzt eine Vorgabezeit");
});

test("G4 — TG22 und TG23: derselbe generische Weg — keine ServiceID in den Same-Day-Modulen", () => {
  assert.equal(offerBlockedLabel(TG23_HEUTE_UNBESTAETIGT), offerBlockedLabel(TG22_HEUTE_UNBESTAETIGT));
  assert.equal(offerBlockedHint(TG23_HEUTE_UNBESTAETIGT), offerBlockedHint(TG22_HEUTE_UNBESTAETIGT));
  assert.equal(pickupTimeText(pickupContractOf(TG23_HEUTE_UNBESTAETIGT)), null);
  for (const datei of ["sameDayCollectionView.mjs", "offerIdentity.mjs", "bookingErrors.mjs", "coverInsuranceView.mjs",
                       "residentialPriceInputs.mjs", "pickupContractView.mjs"]) {
    const q = ohneTexte(code(datei));
    assert.doesNotMatch(q, /serviceId|providerServiceRef|\b2[23]\b/, `${datei} kennt eine ServiceID`);
  }
});

test("G5 — JUMiNGO unberührt: keine Same-Day-Gründe, Abholfenster und Knopf wie bisher", () => {
  assert.equal(offerBlockedLabel(JUMINGO_HEUTE), null);
  assert.equal(offerBlockedHint(JUMINGO_HEUTE), null);
  assert.equal(pickupTimeText(pickupContractOf(JUMINGO_HEUTE)), "13:00–17:00 Uhr");
  const jumingoGesperrt = { ...JUMINGO_HEUTE, bookable: false, unavailableReason: "quote_only" };
  assert.equal(offerBlockedLabel(jumingoGesperrt), "Derzeit nicht direkt buchbar");
  assert.equal(offerBlockedHint(jumingoGesperrt), null);
});
