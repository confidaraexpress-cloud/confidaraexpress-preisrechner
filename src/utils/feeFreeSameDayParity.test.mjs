// Gebührenfreie Abholung am selben Tag — Frontend-Parität OHNE Frontend-Codeänderung (D1, Frontend-Schleife).
//
// Die Karte eines gebührenfreien Dienstes sagt bis zum Abholschluss „Abholung heute" — zu Recht, der Anbieter holt heute
// ab und berechnet dafür nichts. Bis zur Backendkorrektur scheiterte danach JEDER Schritt: die Optionen antworteten
// 409 `SAME_DAY_COLLECTION_UNAVAILABLE`, die Oberfläche bot daraufhin „Angebote neu berechnen" an, und der neue Vergleich
// lieferte vor dem Abholschluss wieder genau diese Karte — eine Schleife ohne Ende. Die Ursache lag ausschließlich im
// Server (Nullunterschied als Fehler, fehlender Befund vor dem Quote). Diese Datei beweist, dass die Oberfläche die
// korrigierten Serverantworten unverändert trägt:
//
//   P1  die Karte           heute, auswählbar (Art der Lieferadresse steht aus), kein Zuschlag, derselbe Serverpreis
//   P2  die Optionen        200 ohne Same-Day-Block → lesbar, zwei Karten „+ 0,00 €", KEIN Fehler, KEIN „neu berechnen"
//   P3  die Bindung         nur der Versand, Tag und „bereit ab“ der Karte bleiben, Buchung nicht gesperrt
//   P4  der Erfolg          die Abholung, die den Anbieter erreicht hat: Tag · bereit ab
//   P5  nach Abholschluss   409 „nicht mehr möglich" → neu berechnen → die neue Karte ist der naechste Versandtag,
//                           sichtbar als „Frühester Abholtag" — keine Schleife
//   P6  22/26 unverändert   ein Same-Day-Block trägt IMMER einen Zuschlag > 0; ohne Zuschlag gibt es keinen Block
//
// Die Fixtures sind die ECHTEN Antworten des korrigierten Backends (DHL 84, Montag 14.09.2026, 11:18–11:22 Uhr bzw.
// 16:00 Uhr), erzeugt über dieselbe Testkette wie `tests/tg-fee-free-same-day-chain.test.js` im Backend — kein Netz,
// kein Anbieter. Entschieden wird ausschließlich an Serverfeldern; keine ServiceID, kein Carrier, keine Uhr.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RESIDENTIAL_STATUS, RESIDENTIAL_ACTION, offerRequiresResidentialChoice, offerResidentialSurchargeFree,
  readPriceInputOptions, bindRequestBody, readPriceInputBinding, tariffWithPriceInputBinding, residentialModuleView,
  residentialBlocksBooking, residentialErrorAction, optionsAfterBinding,
} from "./residentialPriceInputs.mjs";
import {
  sameDayOfferView, sameDaySummaryNote, sameDaySuccessPickupText, readSameDayCollectionBlock,
} from "./sameDayCollectionView.mjs";
import { pickupContractOf, pickupDayLabel, pickupAdjustedNote, pickupTimeText } from "./pickupContractView.mjs";
import { offerSelectable, offerBookable } from "./offerIdentity.mjs";

/* ══════════ Die echten Serverantworten ══════════ */

const OFFER_ID = "fd1f32b4a8dc7c47772b42308255b1e9";
const OPTIONS_ID = "a205692e1f046b92e7a92a5e0ff8044c";
const TOTALS = Object.freeze({ customerShippingNet: 154.36, shippingVat: 29.33, customerShippingGross: 183.69,
                               insuranceGross: 0, customerTotalNet: 154.36, customerTotalGross: 183.69 });
const NULL = Object.freeze({ net: 0, vat: 0, gross: 0 });
const BASIS = Object.freeze({ type: "shipping_base", taxable: true, net: 154.36, vat: 29.33, gross: 183.69 });

const karte = (over = {}) => Object.freeze({
  offerId: OFFER_ID, publicCarrierId: "dhl", publicServiceName: "Domestic Express", serviceType: "pickup",
  netPrice: 154.36, vatAmount: 29.33, finalPrice: 183.69, currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: Object.freeze(["deliveryIsResidential"]), surchargeFreePriceInputs: Object.freeze(["deliveryIsResidential"]),
  sameDaySurchargeNet: null, sameDaySurchargeGross: null,
  ...over,
});
// 11:18 Uhr: heute, bis 14:45 Uhr beauftragbar, bereit ab 11:30 Uhr.
const KARTE_HEUTE = karte({ collectionDate: "2026-09-14", collectionReadyFrom: "11:30", collectionDateAdjusted: false,
                            pickupToday: true, pickupTodayUntil: "14:45" });
// 16:00 Uhr (nach dem wirksamen Abholschluss): der naechste Versandtag, als verschoben markiert.
const KARTE_NACH_SCHLUSS = karte({ offerId: "e5b701aba2671ebbe7be856ae3fa8c65", collectionDate: "2026-09-15",
                                   collectionReadyFrom: "09:00", collectionDateAdjusted: true, pickupToday: false,
                                   pickupTodayUntil: null });
// Derselbe Dienst fuer einen spaeteren Tag — derselbe Preis.
const KARTE_SPAETER = karte({ offerId: "d56a70819214f6df4aa68ed153835c36", collectionDate: "2026-09-16",
                              collectionReadyFrom: "09:00", collectionDateAdjusted: false, pickupToday: false,
                              pickupTodayUntil: null });

const OPTIONEN = Object.freeze({
  offerId: OFFER_ID, offerRevision: 0, optionsId: OPTIONS_ID, expiresAt: "2026-09-14T09:35:00.000Z",
  priceInput: "deliveryIsResidential", boundValue: null,
  options: [{ value: false, surcharge: NULL, totals: TOTALS }, { value: true, surcharge: NULL, totals: TOTALS }],
});
const COVER = Object.freeze({ isInsurable: true, selectionModel: "cover_value", excessValue: 20, requiresGoodsAreNew: true,
  requiresGoodsAreFragile: true, priceOnSelection: true, coverValueSource: "goods_value", coverState: "available",
  coverValue: 500, basicCoverMaxGoodsValue: 50, maxCoverValue: 2500 });
const BINDUNG = Object.freeze({
  offerId: OFFER_ID, offerRevision: 1, priceInputs: { deliveryIsResidential: false }, priceCompleteness: "complete",
  components: [BASIS], totals: TOTALS,
  offer: { netPrice: 154.36, vatAmount: 29.33, finalPrice: 183.69, bookable: true, unavailableReason: null,
           priceCompleteness: "complete", insuranceAvailable: true, insuranceDetails: COVER },
  insuranceReset: false, idempotent: false,
});
const BUCHUNG = Object.freeze({
  message: "Sendung gebucht", amount: 183.69, priceComponents: [BASIS],
  sameDayCollection: { collectionDate: "2026-09-14", collectionReadyFrom: "11:30" },
});
const OPTIONEN_NACH_SCHLUSS = Object.freeze({
  error: "Abholung heute nicht mehr möglich. Bitte wählen Sie einen späteren Abholtag.",
  code: "SAME_DAY_COLLECTION_UNAVAILABLE", sameDayUnavailableKind: "expired",
});

/* ══════════ Tests ══════════ */

test("P1 — die Karte: heute, auswählbar, ohne Zuschlag und zum selben Serverpreis wie ein späterer Tag", () => {
  assert.equal(offerSelectable(KARTE_HEUTE), true, "die heutige Karte ist nicht auswählbar");
  assert.equal(offerBookable(KARTE_HEUTE), false, "vor der Adressart wäre sie schon buchbar");
  assert.equal(offerRequiresResidentialChoice(KARTE_HEUTE), true);
  assert.equal(offerResidentialSurchargeFree(KARTE_HEUTE), true);
  const vertrag = pickupContractOf(KARTE_HEUTE);
  assert.deepEqual([vertrag.day, vertrag.readyFrom, vertrag.dayAdjusted, pickupDayLabel(vertrag), pickupTimeText(vertrag)],
    ["2026-09-14", "11:30", false, "Abholtermin", "bereit ab 11:30 Uhr"]);
  // Gebührenfrei: KEINE Zuschlagszeile — die Aussage „heute" steht allein am Tag (`pickupToday`).
  assert.equal(KARTE_HEUTE.pickupToday, true);
  assert.equal(sameDayOfferView(KARTE_HEUTE), null);
  assert.equal(sameDaySummaryNote({}, KARTE_HEUTE), null);
  // Der Preis ist der Serverpreis — heute wie an einem späteren Tag.
  assert.deepEqual([KARTE_HEUTE.netPrice, KARTE_HEUTE.finalPrice], [KARTE_SPAETER.netPrice, KARTE_SPAETER.finalPrice]);
});

test("P2 — die Optionen: 200 ohne Same-Day-Block → lesbar, zwei Karten „+ 0,00 €“, kein Fehler und keine Neuberechnung", () => {
  const optionen = readPriceInputOptions(OPTIONEN, KARTE_HEUTE);
  assert.ok(optionen, "die echte Optionsantwort ist für die Oberfläche unlesbar");
  assert.equal(optionen.sameDayCollection, undefined);
  assert.deepEqual(optionen.options.map((o) => [o.value, o.surcharge.gross, o.totals.customerShippingGross]),
    [[false, 0, 183.69], [true, 0, 183.69]]);
  const view = residentialModuleView({ status: RESIDENTIAL_STATUS.READY, options: optionen, boundValue: null, surchargeFree: true });
  assert.deepEqual([view.showError, view.errorAction, view.cards.length], [false, null, 2]);
  // Der Betrag kommt aus der gemeinsamen Geldformatierung (geschütztes Leerzeichen vor „€") — hier nur seine Form.
  for (const k of view.cards) assert.match(k.grossText, /^\+ 0,00\s€ brutto$/u);
  // Die Bindungsanfrage entsteht aus der gelesenen Antwort — mit dem Serverbetrag als Wächter, nicht mit einem eigenen.
  assert.deepEqual(bindRequestBody({ tariff: KARTE_HEUTE, options: optionen, value: false }),
    { offerId: OFFER_ID, offerRevision: 0, optionsId: OPTIONS_ID, deliveryIsResidential: false, expectedShippingGross: 183.69 });
});

test("P3 — die Bindung: nur der Versand, Tag und „bereit ab“ der Karte bleiben, die Buchung ist nicht gesperrt", () => {
  const optionen = readPriceInputOptions(OPTIONEN, KARTE_HEUTE);
  const bindung = readPriceInputBinding(BINDUNG, { tariff: KARTE_HEUTE, value: false });
  assert.ok(bindung, "die echte Bindungsantwort ist für die Oberfläche unlesbar");
  assert.equal(bindung.sameDayCollection, undefined);
  assert.deepEqual(bindung.components.map((k) => k.type), ["shipping_base"]);
  const gebunden = tariffWithPriceInputBinding(KARTE_HEUTE, bindung);
  assert.ok(gebunden);
  // Der Tag, die „bereit ab"-Zeit und die Aussage „heute" kommen unverändert vom Server; der Preis ist der gebundene.
  assert.deepEqual([gebunden.collectionDate, gebunden.collectionReadyFrom, gebunden.pickupToday, gebunden.finalPrice,
                    gebunden.bookable, gebunden.priceCompleteness],
    ["2026-09-14", "11:30", true, 183.69, true, "complete"]);
  assert.equal(residentialBlocksBooking({ required: true, status: RESIDENTIAL_STATUS.READY, boundValue: false,
                                          tariff: gebunden, options: optionsAfterBinding(optionen, bindung) }), false,
  "die gebundene heutige Abholung bleibt gesperrt");
});

test("P4 — der Erfolg nennt die Abholung, die den Anbieter erreicht hat — Tag und „bereit ab“", () => {
  assert.equal(sameDaySuccessPickupText(BUCHUNG), "14.09.2026 · bereit ab 11:30 Uhr");
});

test("P5 — nach dem Abholschluss: 409 → neu berechnen → der naechste Versandtag, sichtbar als „Frühester Abholtag“ (keine Schleife)", () => {
  const aktion = residentialErrorAction(409, OPTIONEN_NACH_SCHLUSS);
  assert.equal(aktion, RESIDENTIAL_ACTION.SAME_DAY_UNAVAILABLE);
  const view = residentialModuleView({ status: RESIDENTIAL_STATUS.ERROR, errorKind: aktion, surchargeFree: true });
  assert.deepEqual([view.showError, view.errorAction], [true, RESIDENTIAL_ACTION.RECALCULATE]);
  // Die Neuberechnung liefert NICHT wieder dieselbe Karte, sondern den naechsten Versandtag — ohne „heute".
  const vertrag = pickupContractOf(KARTE_NACH_SCHLUSS);
  assert.deepEqual([vertrag.day, KARTE_NACH_SCHLUSS.pickupToday, pickupDayLabel(vertrag), pickupAdjustedNote(vertrag),
                    pickupTimeText(vertrag)],
    ["2026-09-15", false, "Frühester Abholtag", "frühester Abholtag", "bereit ab 09:00 Uhr"]);
  assert.equal(offerSelectable(KARTE_NACH_SCHLUSS), true);
  assert.notEqual(KARTE_NACH_SCHLUSS.collectionDate, KARTE_HEUTE.collectionDate);
  assert.equal(KARTE_NACH_SCHLUSS.finalPrice, KARTE_HEUTE.finalPrice, "der verschobene Tag änderte den Preis");
});

test("P6 — 22/26 unverändert: ein Same-Day-Block trägt immer einen Zuschlag > 0; ohne Zuschlag gibt es keinen Block", () => {
  const mitGebuehr = { pickupTodayUntil: "16:45", collectionDate: "2026-09-14", collectionReadyFrom: "11:30",
                       surcharge: { net: 3.02, vat: 0.58, gross: 3.6 } };
  assert.deepEqual(readSameDayCollectionBlock(mitGebuehr).ok, true);
  // Ein Block mit Nullzuschlag beschreibt etwas anderes als diesen Vertrag — deshalb schickt der Server gebührenfrei keinen.
  assert.deepEqual(readSameDayCollectionBlock({ ...mitGebuehr, surcharge: { net: 0, vat: 0, gross: 0 } }).ok, false);
  assert.equal(readPriceInputOptions({ ...OPTIONEN, sameDayCollection: { ...mitGebuehr, surcharge: NULL } }, KARTE_HEUTE), null);
  // Ohne Block bleibt es beim gewöhnlichen Vertrag — genau die Form der gebührenfreien Antwort.
  assert.deepEqual(readSameDayCollectionBlock(undefined), { ok: true, value: null });
});
