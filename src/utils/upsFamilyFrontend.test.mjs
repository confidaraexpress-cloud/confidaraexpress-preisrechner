// UPS-Vervollständigung — UPS · Express (Transglobal intern 29) und UPS · Standardversand Mehrpaket (intern 26) in der
// Oberfläche. Die Oberfläche bleibt fähigkeitsgesteuert: was ein Angebot kann, sagt der Server über dieselben Felder wie
// bei 22 und 23. Es gibt keine ServiceID-Weiche, keine eigene Karte und keine eigene Buchungsseite.
//
//   §A  UPS · Express bis zur Freigabe: Preisauskunft — nicht auswählbar, keine Frage, keine Absicherung, kein Same-Day
//   §B  UPS · Express nach der Freigabe: dieselben Felder wie 23 genügen — die Oberfläche braucht keine Änderung
//   §C  UPS · Standardversand Mehrpaket (freigegeben, TG26): auswählbar mit der Frage nach der Lieferadresse, ohne Profil
//       und Prognose; Grenze, Sendungsverfolgung und Drucker aus den Serverfeldern; nie eine Abholung heute
//   §D  Mehrpaket: Paketzeile; GEMESSENE Belege (eine Nummer, „Versandlabel (A4)“ und „Versandlabel (Thermodruck)“);
//       GENERISCH mehrere Nummern („1 von N“, Abholetikett zuletzt), Tracking und Admin-Detail
//   §E  White Label und keine ServiceID-Weiche
//
// Die TG26-Werte sind Fixturewerte nach dem gemessenen Staging-Fall (zwei Packstücke je 2 kg, Standardaufschlag).
// Die Sendungsnummer ist synthetisch: eine Staging-Platzhalternummer ist kein Produktionsvertrag.
//
// Browserprüfung: tests/e2e/upsFamilyOffers.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { offerSelectable, offerBookable, offerBlockedLabel, offerBlockedHint } from "./offerIdentity.mjs";
import { offerCardInsurance } from "./coverInsuranceView.mjs";
import { sameDayOfferView } from "./sameDayCollectionView.mjs";
import { offerRequiresResidentialChoice, offerSurchargeHint } from "./residentialPriceInputs.mjs";
import { readDeliveryProjection, projectedDeliveryText } from "./deliveryProjectionView.mjs";
import { serviceDetailsView } from "./serviceDetailsView.mjs";
import { packageSummaryLine } from "./newShipmentForm.mjs";
import {
  bookingShippingDocuments, shippingDocumentButtonLabel, shippingDocumentFallbackFilename,
} from "./bookingShippingDocuments.mjs";
import { groupShipmentDocuments, documentLabel, documentCarrierReference } from "./shipmentDocumentsView.mjs";
import { trackingReferencesOf, multiTrackingReferencesOf, trackingReferencesSummary } from "./trackingReferencesView.mjs";
import { selectOperations, documentsSummary } from "./adminShipmentOperations.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => readFileSync(path.join(HIER, p), "utf8").replace(/\r\n/g, "\n");
const ohneKommentare = (s) => s
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/* ══════════ Fixtures — die öffentlichen Angebote, wie calculate-price sie liefert (Fixturewerte) ══════════ */

const TG29 = Object.freeze({
  offerId: "ex290000000000000000000000000029", publicCarrierId: "ups", publicServiceName: "Express",
  serviceType: "pickup", collectionDate: "2026-09-16", collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
  deliveryProjection: { kind: "estimated", dateMin: "2026-09-17", dateMax: "2026-09-17" },
  netPrice: 31.67, vatAmount: 6.02, finalPrice: 37.69, currency: "EUR",
  bookable: false, unavailableReason: "quote_only", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: false, insuranceDetails: null, trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }],
  serviceDetails: { summaryKey: "express_urgent", volumetricDivisor: null, notAccepted: ["pallets", "suitcases"],
                    basicCoverMaxGoodsValue: 50, maxCoverValue: 2500 },
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
});

// Dieselbe 29 NACH einer Freigabe — ausschließlich andere Serverwerte, keine anderen Felder.
const TG29_FREI = Object.freeze({ ...TG29, unavailableReason: "price_inputs_required" });
const TG29_HEUTE = Object.freeze({
  ...TG29_FREI, collectionReadyFrom: "11:30", netPrice: 34.94, vatAmount: 6.64, finalPrice: 41.58,
  pickupToday: true, pickupTodayUntil: "16:45", sameDaySurchargeNet: 3.27, sameDaySurchargeGross: 3.89,
});
const TG29_GEBUNDEN = Object.freeze({
  ...TG29_FREI, bookable: true, unavailableReason: null, priceCompleteness: "complete",
  insuranceAvailable: true,
  insuranceDetails: { isInsurable: true, selectionModel: "cover_value", excessValue: 20, requiresGoodsAreNew: true,
                      requiresGoodsAreFragile: true, priceOnSelection: true, coverValueSource: "goods_value",
                      coverState: "available", coverValue: 500, basicCoverMaxGoodsValue: 50, maxCoverValue: 2500 },
});

// UPS · Standardversand Mehrpaket, wie calculate-price den freigegebenen Service mit zwei Packstücken liefert: vorläufiger
// Geschäftspreis bis zur Art der Lieferadresse, Laufzeit „1–5 Tage", Abrechnungsgewicht 4 kg, höchstens zwei Packstücke.
const TG26 = Object.freeze({
  offerId: "mp260000000000000000000000000026", publicCarrierId: "ups", publicServiceName: "Standardversand Mehrpaket",
  serviceType: "pickup", collectionDate: "2026-09-18", collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 5, deliveryTime: "1–5 Tage", deliveryProjection: null,
  netPrice: 31.93, vatAmount: 6.07, finalPrice: 38, currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"],
  chargeableWeight: 4, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: false, insuranceDetails: null, trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 2 }], serviceDetails: null,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
});
// Nach der Bindung „Privatadresse": die Serverwerte der Bindungsantwort — buchbar, Absicherung nach Warenwert wählbar.
const TG26_GEBUNDEN = Object.freeze({
  ...TG26, netPrice: 35.11, vatAmount: 6.67, finalPrice: 41.78,
  bookable: true, unavailableReason: null, priceCompleteness: "complete",
  insuranceAvailable: true, insuranceDetails: TG29_GEBUNDEN.insuranceDetails,
});
// Heute als Abholtag: der Server sperrt den Tag (keine kuratierte Abholung am selben Tag) und nennt keine „bereit ab"-Zeit.
const TG26_HEUTE = Object.freeze({ ...TG26, collectionDate: "2026-09-17", collectionReadyFrom: null,
                                   unavailableReason: "date_unavailable" });

/* ══════════ §A  UPS · EXPRESS BIS ZUR FREIGABE ══════════ */

test("A1 — UPS · Express ist bis zur Freigabe eine vollwertige Preisauskunft: nicht auswählbar, neutral begründet", () => {
  assert.equal(offerSelectable(TG29), false);
  assert.equal(offerBookable(TG29), false);
  assert.equal(offerBlockedLabel(TG29), "Derzeit nicht direkt buchbar");
  assert.equal(offerBlockedHint(TG29), null, "ein anderer Abholtermin hilft hier nicht");
  // Keine Frage, keine Absicherung, keine Abholung heute — obwohl die Felder dafür bereitstehen.
  assert.equal(offerSurchargeHint(TG29), null);
  assert.equal(offerCardInsurance(TG29).insurable, false);
  assert.equal(sameDayOfferView(TG29), null);
});

test("A2 — Profil, Laufzeit und voraussichtliche Lieferung erscheinen schon als Preisauskunft", () => {
  const v = serviceDetailsView(TG29);
  assert.ok(v, "das Profil wurde nicht gebildet");
  assert.equal(v.main.summary, "Schneller Expressversand für eilige Sendungen.");
  assert.equal(v.size.formula, null, "ein nicht belegter Divisor wurde erklärt");
  assert.equal(projectedDeliveryText(readDeliveryProjection(TG29)), "Do., 17.09.");
});

/* ══════════ §B  UPS · EXPRESS NACH DER FREIGABE ══════════ */

test("B1 — nach der Freigabe genügen dieselben Felder wie bei 23: Auswahl, Adressfrage, Same-Day, Absicherung", () => {
  assert.equal(offerSelectable(TG29_FREI), true);
  assert.equal(offerRequiresResidentialChoice(TG29_FREI), true);
  assert.equal(offerSurchargeHint(TG29_FREI), "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.");
  const heute = sameDayOfferView(TG29_HEUTE);
  assert.deepEqual([heute.until, heute.untilText, heute.surchargeNet, heute.surchargeGross],
    ["16:45", "Abholung heute möglich bis 16:45 Uhr", 3.27, 3.89]);
  const absicherung = offerCardInsurance(TG29_GEBUNDEN);
  assert.deepEqual([absicherung.insurable, absicherung.coverModel, absicherung.excessValue], [true, true, 20]);
  assert.equal(offerSelectable(TG29_GEBUNDEN), true);
  assert.equal(offerBlockedLabel(TG29_GEBUNDEN), null);
});

test("B2 — eine gesperrte Abholung heute nennt einen der drei Gründe und den Hinweis — generisch, wie bei 22 und 23", () => {
  for (const [grund, text] of [["same_day_unavailable", "Abholung heute nicht mehr möglich."],
                               ["same_day_unconfirmed", "Abholung heute für dieses Angebot nicht verfügbar."],
                               ["same_day_unverifiable", "Abholung heute kann derzeit nicht bestätigt werden."]]) {
    const t = { ...TG29, unavailableReason: grund, collectionReadyFrom: null };
    assert.equal(offerBlockedLabel(t), text, grund);
    assert.equal(offerBlockedHint(t), "Bitte wählen Sie einen späteren Abholtag.", grund);
    assert.equal(sameDayOfferView(t), null, grund);
  }
});

/* ══════════ §C  UPS · STANDARDVERSAND MEHRPAKET ══════════ */

test("C1 — UPS · Standardversand Mehrpaket ist auswählbar: erst die Art der Lieferadresse, kein Profil, keine Prognose", () => {
  assert.equal(offerSelectable(TG26), true);
  assert.equal(offerBookable(TG26), false, "gebucht wird erst nach der Bindung");
  assert.equal(offerBlockedLabel(TG26), null);
  assert.equal(offerRequiresResidentialChoice(TG26), true);
  assert.equal(offerSurchargeHint(TG26), "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.");
  assert.equal(serviceDetailsView(TG26), null, "ohne Profil bleibt der bisherige Detailbereich");
  assert.equal(readDeliveryProjection(TG26), null);
  assert.equal(sameDayOfferView(TG26), null);
  // Vor der Bindung sagt der Server über die Absicherung nichts — die Karte behauptet kein „nicht verfügbar".
  const absicherung = offerCardInsurance(TG26);
  assert.deepEqual([absicherung.insurable, absicherung.explicitlyUnavailable, absicherung.notice], [false, false, null]);
  // Vorbedingung: Grenze, Sendungsverfolgung und Drucker sind Serverfelder — die Oberfläche kennt keine eigene Zahl.
  assert.deepEqual([TG26.tariffLimits, TG26.trackingAvailable, TG26.printerRequired],
    [[{ operant: "packages_count", operator: "<=", value: 2 }], true, true]);
});

test("C2 — gebunden: buchbar mit der Absicherung nach Warenwert — dieselben Felder wie bei 22 und 23", () => {
  assert.equal(offerSelectable(TG26_GEBUNDEN), true);
  assert.equal(offerBookable(TG26_GEBUNDEN), true);
  assert.equal(offerBlockedLabel(TG26_GEBUNDEN), null);
  assert.equal(offerSurchargeHint(TG26_GEBUNDEN), null, "nach der Bindung steht kein Zuschlagshinweis mehr da");
  const absicherung = offerCardInsurance(TG26_GEBUNDEN);
  assert.deepEqual([absicherung.insurable, absicherung.coverModel, absicherung.excessValue], [true, true, 20]);
  assert.equal(sameDayOfferView(TG26_GEBUNDEN), null);
});

test("C3 — heute nie: der Server sperrt den Tag, die Karte nennt ihn und den Hinweis — keine Abholung am selben Tag", () => {
  assert.equal(offerSelectable(TG26_HEUTE), false);
  assert.equal(offerBlockedLabel(TG26_HEUTE), "Für dieses Abholdatum nicht verfügbar.");
  assert.equal(offerBlockedHint(TG26_HEUTE), "Bitte wählen Sie einen anderen Abholtermin.");
  assert.equal(offerSurchargeHint(TG26_HEUTE), null);
  assert.equal(sameDayOfferView(TG26_HEUTE), null);
});

/* ══════════ §D  MEHRPAKET ══════════ */

test("D1 — die Paketzeile nennt Anzahl und Maße JE Paket — genau das CE-Modell (gleiche Pakete)", () => {
  assert.equal(packageSummaryLine({ packageCount: "2", weight: "2", length: "30", width: "20", height: "15" }),
    "2 Pakete · je 2 kg · 30 × 20 × 15 cm");
  assert.equal(packageSummaryLine({ packageCount: "2", weight: "4", length: "40", width: "30", height: "20" }),
    "2 Pakete · je 4 kg · 40 × 30 × 20 cm");
  assert.equal(packageSummaryLine({ packageCount: "1", weight: "2", length: "30", width: "20", height: "15" }),
    "2 kg · 30 × 20 × 15 cm");
});

const beleg = (ordinal, label, carrierReference, labelSize, type = "LABEL") => ({
  type, ordinal, label, carrierReference, labelSize, status: "ready",
  downloadPath: `/api/shipments/4711/provider-documents/${type}/${ordinal}`,
});
// GEMESSEN (TG26): eine Sendungsnummer, ein A4- und ein Thermodruck-PDF mit je einer Seite je Paket — der Server nennt
// sie „Versandlabel (A4)" und „Versandlabel (Thermodruck)". Kein Abholetikett.
const AWB_26 = "1Z999AA10123456726";
const GEMESSEN = [
  beleg(0, "Versandlabel (A4)", AWB_26, "A4"),
  beleg(1, "Versandlabel (Thermodruck)", AWB_26, "THERMAL"),
];
// GENERISCH (keine TG26-Aussage): mehrere Sendungsnummern und ein Abholetikett — die Oberfläche trägt jede Anzahl.
const AWB_A = "1Z999AA10123456731";
const AWB_B = "1Z999AA10123456742";
const AWB_ABHOLUNG = "1Z999AA10123456753";
const MEHRERE_NUMMERN = [
  beleg(0, "Versandlabel 1 von 2 (A4)", AWB_A, "A4"),
  beleg(1, "Versandlabel 1 von 2 (Thermodruck)", AWB_A, "THERMAL"),
  beleg(2, "Versandlabel 2 von 2 (A4)", AWB_B, "A4"),
  beleg(3, "Versandlabel 2 von 2 (Thermodruck)", AWB_B, "THERMAL"),
  beleg(0, "Abholetikett (A4)", AWB_ABHOLUNG, "A4", "COLLECTION_LABEL"),
];

test("D2 — Erfolgsbildschirm (gemessen): zwei Knöpfe mit den Servernamen — keine Dublette, kein fremder Pfad, kein „1 von 2“", () => {
  const liste = bookingShippingDocuments({ shippingDocuments: [
    GEMESSEN[1], GEMESSEN[0],
    { ...GEMESSEN[0] },                                                 // derselbe Pfad zweimal
    { ...beleg(4, "Versandlabel (A4)", "X", "A4"), downloadPath: "https://provider.example/label" },
    { ...beleg(5, "", "Y", "A4") },
  ] });
  assert.deepEqual(liste.map(shippingDocumentButtonLabel),
    ["Versandlabel (A4) herunterladen", "Versandlabel (Thermodruck) herunterladen"]);
  assert.deepEqual(liste.map((d) => [d.type, d.ordinal, d.labelSize, d.carrierReference]),
    [["LABEL", 0, "A4", AWB_26], ["LABEL", 1, "THERMAL", AWB_26]]);
  assert.deepEqual(liste.map(shippingDocumentFallbackFilename), ["versandlabel-a4.pdf", "versandlabel-thermodruck.pdf"]);
  assert.ok(!JSON.stringify(liste).includes("provider.example"));
});

test("D3 — Dokumentübersicht (gemessen): ein Versandlabel in zwei Formaten, dieselbe Nummer", () => {
  const gruppen = groupShipmentDocuments({ documents: [
    { ...GEMESSEN[1], category: "SHIPPING" }, { ...GEMESSEN[0], category: "SHIPPING" },
  ] });
  assert.equal(gruppen.length, 1);
  assert.deepEqual(gruppen[0].documents.map(documentLabel), ["Versandlabel (A4)", "Versandlabel (Thermodruck)"]);
  assert.deepEqual(gruppen[0].documents.map(documentCarrierReference), [AWB_26, AWB_26]);
});

test("D4 — GENERISCH mehrere Nummern: Knöpfe und Übersicht „1 von 2“ in Serverreihenfolge, das Abholetikett zuletzt", () => {
  const liste = bookingShippingDocuments({ shippingDocuments: [
    MEHRERE_NUMMERN[4], MEHRERE_NUMMERN[2], MEHRERE_NUMMERN[0], MEHRERE_NUMMERN[3], MEHRERE_NUMMERN[1],
  ] });
  assert.deepEqual(liste.map(shippingDocumentButtonLabel), [
    "Versandlabel 1 von 2 (A4) herunterladen", "Versandlabel 1 von 2 (Thermodruck) herunterladen",
    "Versandlabel 2 von 2 (A4) herunterladen", "Versandlabel 2 von 2 (Thermodruck) herunterladen",
    "Abholetikett (A4) herunterladen",
  ]);
  assert.deepEqual(liste.map((d) => d.carrierReference), [AWB_A, AWB_A, AWB_B, AWB_B, AWB_ABHOLUNG]);
  const gruppen = groupShipmentDocuments({ documents: [
    { ...MEHRERE_NUMMERN[4], category: "SHIPPING" }, { ...MEHRERE_NUMMERN[3], category: "SHIPPING" },
    { ...MEHRERE_NUMMERN[0], category: "SHIPPING" }, { ...MEHRERE_NUMMERN[2], category: "SHIPPING" },
    { ...MEHRERE_NUMMERN[1], category: "SHIPPING" },
  ] });
  assert.equal(gruppen.length, 1);
  assert.deepEqual(gruppen[0].documents.map(documentLabel), [
    "Versandlabel 1 von 2 (A4)", "Versandlabel 1 von 2 (Thermodruck)", "Versandlabel 2 von 2 (A4)",
    "Versandlabel 2 von 2 (Thermodruck)", "Abholetikett (A4)",
  ]);
  assert.deepEqual(gruppen[0].documents.map(documentCarrierReference).slice(0, 4), [AWB_A, AWB_A, AWB_B, AWB_B]);
});

test("D5 — Tracking: eine Nummer (gemessen) bleibt die bisherige Anzeige; mehrere Nummern werden gelistet — ohne Paketzuordnung", () => {
  assert.equal(multiTrackingReferencesOf({ trackingReferences: [AWB_26] }), null);
  assert.deepEqual(trackingReferencesOf({ trackingReferences: [AWB_26, AWB_26] }), [AWB_26]);
  const zwei = { trackingReferences: [AWB_A, AWB_B, AWB_A, "https://x.example"] };
  assert.deepEqual(trackingReferencesOf(zwei), [AWB_A, AWB_B]);
  assert.deepEqual(multiTrackingReferencesOf(zwei), [AWB_A, AWB_B]);
  assert.equal(trackingReferencesSummary(multiTrackingReferencesOf(zwei)), "2 Trackingnummern");
  // Die Sendungsliste liefert dieselbe Liste unter ihrem Spaltennamen.
  assert.deepEqual(multiTrackingReferencesOf({ tracking_references: zwei.trackingReferences }), trackingReferencesOf(zwei));
});

test("D6 — Admin-Detail: alle Trackingreferenzen und Anbieterbelege — gemessen zwei Versandlabels, generisch vier und ein Abholetikett", () => {
  const anbieterbeleg = (id, documentType, ordinal, labelSize) =>
    ({ id, documentType, ordinal, format: "PDF", labelSize, sizeBytes: 2048, bookingAttemptId: 901 });
  const betrieb = (trackingReferences, providerDocuments) => selectOperations({ operations: {
    provider: "transglobal", providerServiceId: "26", providerBookingReference: "DE9900626",
    trackingReferences, bookedAt: "2026-09-17T08:00:00Z",
    latestAttemptId: 901, attemptsTotal: 1, attemptsLimited: false, legacyWithoutAttempt: false,
    bookingAttempts: [{ id: 901, provider: "transglobal", attempt: 1, state: "booked", createdAt: "t", isLatest: true }],
    documents: { storedLabel: false, providerDocuments },
  } });

  const gemessen = betrieb([AWB_26], [anbieterbeleg(1, "LABEL", 0, "A4"), anbieterbeleg(2, "LABEL", 1, "THERMAL")]);
  assert.deepEqual(gemessen.trackingReferences, [AWB_26]);
  assert.deepEqual(gemessen.documents.providerDocuments.map((d) => [d.typeText, d.labelSize]),
    [["Versandlabel", "A4"], ["Versandlabel", "THERMAL"]]);
  assert.deepEqual(documentsSummary(gemessen), { hasLabel: true, storedLabel: false, providerLabelCount: 2, providerDocumentCount: 2 });

  const generisch = betrieb([AWB_A, AWB_B], [
    anbieterbeleg(1, "LABEL", 0, "A4"), anbieterbeleg(2, "LABEL", 1, "THERMAL"), anbieterbeleg(3, "LABEL", 2, "A4"),
    anbieterbeleg(4, "LABEL", 3, "THERMAL"), anbieterbeleg(5, "COLLECTION_LABEL", 0, "A4"),
  ]);
  assert.deepEqual(generisch.trackingReferences, [AWB_A, AWB_B]);
  assert.deepEqual(generisch.documents.providerDocuments.map((d) => [d.typeText, d.labelSize]), [
    ["Versandlabel", "A4"], ["Versandlabel", "THERMAL"], ["Versandlabel", "A4"], ["Versandlabel", "THERMAL"], ["Abholetikett", "A4"],
  ]);
  assert.deepEqual(documentsSummary(generisch), { hasLabel: true, storedLabel: false, providerLabelCount: 4, providerDocumentCount: 5 });
});

/* ══════════ §E  WHITE LABEL, BEDIENBARKEIT UND KEINE SERVICEID-WEICHE ══════════ */

test("E0 — eine Preisauskunft bleibt lesbar: gesperrt ist allein der CTA, die Karte trägt kein aria-disabled", () => {
  const karte = ohneKommentare(lies("../components/offers/OfferCard.jsx"));
  assert.doesNotMatch(karte, /aria-disabled/, "aria-disabled vererbt sich auf „Details anzeigen“");
  assert.match(karte, /disabled=\{unavailable\}/, "der CTA einer Preisauskunft ist nicht mehr gesperrt");
  assert.match(karte, /aria-label=\{\s*unavailable \? `\$\{carrierName\}: \$\{unavailableText\}`/, "der Grund fehlt am CTA");
  assert.match(karte, /const handleSelect = \(\) => \{ if \(!unavailable\) onSelect\(t\); \};/);
});

test("E1 — kein Produktionsmodul kennt die UPS-Produktnamen oder verzweigt an 26 oder 29", () => {
  const WURZEL = path.join(HIER, "..");
  const dateien = [];
  const lauf = (rel) => {
    for (const e of readdirSync(path.join(WURZEL, rel), { withFileTypes: true })) {
      const p = path.join(rel, e.name);
      if (e.isDirectory()) { lauf(p); continue; }
      if (/\.(jsx|js|mjs)$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) dateien.push(p);
    }
  };
  lauf(".");
  assert.ok(dateien.length > 50, `zu wenige Dateien: ${dateien.length}`);
  const ID = "(?:providerServiceRef|provider_service_id|serviceId|serviceID|ServiceID)";
  const weiche = new RegExp(`\\b${ID}\\b\\s*(?:===?|!==?)\\s*["'\`]?(?:26|29)\\b|["'\`]?\\b(?:26|29)\\b["'\`]?\\s*(?:===?|!==?)\\s*[\\w.]*\\b${ID}\\b`);
  let kundenflaechen = 0;
  for (const datei of dateien) {
    const quelle = ohneKommentare(lies(path.relative(HIER, path.join(WURZEL, datei))));
    assert.ok(!weiche.test(quelle), `${datei} verzweigt an einer UPS-ServiceID`);
    // Der Produktname kommt ausschließlich vom Server — keine Datei buchstabiert ihn nach.
    assert.ok(!/Mehrpaket|UPS Express|Standard Multi/i.test(quelle), `${datei} kennt einen UPS-Produktnamen`);
    // Den Einkaufsnamen kennen nur die Admin-Abstimmung und das Admin-Debug-Overlay (eigene Verträge).
    if (/admin|debug/i.test(datei)) continue;
    kundenflaechen += 1;
    assert.ok(!/transglobal/i.test(quelle), `${datei} kennt den Einkaufsnamen`);
  }
  assert.ok(kundenflaechen > 50, `zu wenige Kundenmodule geprüft: ${kundenflaechen}`);
});
