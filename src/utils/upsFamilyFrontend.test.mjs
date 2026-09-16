// UPS-Vervollständigung — UPS · Express (Transglobal intern 29) und UPS · Standardversand Mehrpaket (intern 26) in der
// Oberfläche. Die Oberfläche bleibt fähigkeitsgesteuert: was ein Angebot kann, sagt der Server über dieselben Felder wie
// bei 22 und 23. Es gibt keine ServiceID-Weiche, keine eigene Karte und keine eigene Buchungsseite.
//
//   §A  UPS · Express bis zur Freigabe: Preisauskunft — nicht auswählbar, keine Frage, keine Absicherung, kein Same-Day
//   §B  UPS · Express nach der Freigabe: dieselben Felder wie 23 genügen — die Oberfläche braucht keine Änderung
//   §C  UPS · Standardversand Mehrpaket: Preisauskunft ohne Profil, ohne erfundene Grenze
//   §D  Mehrpaket: Paketzeile, Versandbelege „1 von N“, Dokumentübersicht, mehrere Trackingnummern
//   §E  White Label und keine ServiceID-Weiche
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

const TG26 = Object.freeze({
  offerId: "mp260000000000000000000000000026", publicCarrierId: "ups", publicServiceName: "Standardversand Mehrpaket",
  serviceType: "pickup", collectionDate: "2026-09-16", collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage", deliveryProjection: null,
  netPrice: 24, vatAmount: 4.56, finalPrice: 28.56, currency: "EUR",
  bookable: false, unavailableReason: "quote_only", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential", "collectionIsResidential"],
  chargeableWeight: 8, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: false, insuranceDetails: null, trackingAvailable: null, printerRequired: null,
  tariffLimits: [], serviceDetails: null,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
});

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

test("C1 — UPS · Standardversand Mehrpaket: Preisauskunft ohne Profil, ohne Prognose und ohne erfundene Grenze", () => {
  assert.equal(offerSelectable(TG26), false);
  assert.equal(offerBlockedLabel(TG26), "Derzeit nicht direkt buchbar");
  assert.equal(offerSurchargeHint(TG26), null, "eine Preisauskunft stellt keine Adressfrage");
  assert.equal(serviceDetailsView(TG26), null, "ohne Profil bleibt der bisherige Detailbereich");
  assert.equal(readDeliveryProjection(TG26), null);
  assert.equal(offerCardInsurance(TG26).insurable, false);
  assert.deepEqual(TG26.tariffLimits, [], "Vorbedingung: der Server nennt keine Grenze");
});

/* ══════════ §D  MEHRPAKET ══════════ */

test("D1 — die Paketzeile nennt Anzahl und Maße JE Paket — genau das CE-Modell (gleiche Pakete)", () => {
  assert.equal(packageSummaryLine({ packageCount: "2", weight: "4", length: "40", width: "30", height: "20" }),
    "2 Pakete · je 4 kg · 40 × 30 × 20 cm");
  assert.equal(packageSummaryLine({ packageCount: "1", weight: "2", length: "30", width: "20", height: "15" }),
    "2 kg · 30 × 20 × 15 cm");
});

// Die Buchungsantwort einer Mehrpaketsendung: zwei Pakete, je A4 und Thermodruck, dazu das Abholetikett.
const beleg = (ordinal, label, carrierReference, labelSize, type = "LABEL") => ({
  type, ordinal, label, carrierReference, labelSize, status: "ready",
  downloadPath: `/api/shipments/4711/provider-documents/${type}/${ordinal}`,
});
const ZWEI_PAKETE = [
  beleg(0, "Versandlabel 1 von 2 (A4)", "1Z26MULTI00000001", "A4"),
  beleg(1, "Versandlabel 1 von 2 (Thermodruck)", "1Z26MULTI00000001", "THERMAL"),
  beleg(2, "Versandlabel 2 von 2 (A4)", "1Z26MULTI00000002", "A4"),
  beleg(3, "Versandlabel 2 von 2 (Thermodruck)", "1Z26MULTI00000002", "THERMAL"),
  beleg(0, "Abholetikett (A4)", "1Z26COLLECT0000001", "A4", "COLLECTION_LABEL"),
];

test("D2 — Erfolgsbildschirm: je Beleg ein Knopf mit dem Servernamen „Versandlabel 1 von 2 (A4)“ — keine Dublette, kein fremder Pfad", () => {
  const liste = bookingShippingDocuments({ shippingDocuments: [
    ZWEI_PAKETE[4], ZWEI_PAKETE[2], ZWEI_PAKETE[0], ZWEI_PAKETE[3], ZWEI_PAKETE[1],
    { ...ZWEI_PAKETE[0] },                                              // derselbe Pfad zweimal
    { ...beleg(4, "Versandlabel 3 von 2", "X", "A4"), downloadPath: "https://provider.example/label" },
    { ...beleg(5, "", "Y", "A4") },
  ] });
  assert.deepEqual(liste.map(shippingDocumentButtonLabel), [
    "Versandlabel 1 von 2 (A4) herunterladen", "Versandlabel 1 von 2 (Thermodruck) herunterladen",
    "Versandlabel 2 von 2 (A4) herunterladen", "Versandlabel 2 von 2 (Thermodruck) herunterladen",
    "Abholetikett (A4) herunterladen",
  ]);
  assert.deepEqual(liste.map((d) => d.carrierReference),
    ["1Z26MULTI00000001", "1Z26MULTI00000001", "1Z26MULTI00000002", "1Z26MULTI00000002", "1Z26COLLECT0000001"]);
  assert.deepEqual(liste.map(shippingDocumentFallbackFilename).slice(0, 2), ["versandlabel-a4.pdf", "versandlabel-thermodruck.pdf"]);
  assert.ok(!JSON.stringify(liste).includes("provider.example"));
});

test("D3 — Dokumentübersicht: Versandlabels nach der Serverreihenfolge, das Abholetikett direkt dahinter", () => {
  const gruppen = groupShipmentDocuments({ documents: [
    { ...ZWEI_PAKETE[4], category: "SHIPPING" }, { ...ZWEI_PAKETE[3], category: "SHIPPING" },
    { ...ZWEI_PAKETE[0], category: "SHIPPING" }, { ...ZWEI_PAKETE[2], category: "SHIPPING" },
    { ...ZWEI_PAKETE[1], category: "SHIPPING" },
  ] });
  assert.equal(gruppen.length, 1);
  assert.deepEqual(gruppen[0].documents.map(documentLabel), [
    "Versandlabel 1 von 2 (A4)", "Versandlabel 1 von 2 (Thermodruck)", "Versandlabel 2 von 2 (A4)",
    "Versandlabel 2 von 2 (Thermodruck)", "Abholetikett (A4)",
  ]);
  assert.deepEqual(gruppen[0].documents.map(documentCarrierReference).slice(0, 4),
    ["1Z26MULTI00000001", "1Z26MULTI00000001", "1Z26MULTI00000002", "1Z26MULTI00000002"]);
});

test("D4 — Tracking: eine Nummer bleibt die bisherige Anzeige; mehrere Nummern werden gelistet — ohne Paketzuordnung", () => {
  assert.equal(multiTrackingReferencesOf({ trackingReferences: ["1Z29EXPRESS000001"] }), null);
  const zwei = { trackingReferences: ["1Z26MULTI00000001", "1Z26MULTI00000002", "1Z26MULTI00000001", "https://x.example"] };
  assert.deepEqual(trackingReferencesOf(zwei), ["1Z26MULTI00000001", "1Z26MULTI00000002"]);
  assert.deepEqual(multiTrackingReferencesOf(zwei), ["1Z26MULTI00000001", "1Z26MULTI00000002"]);
  assert.equal(trackingReferencesSummary(multiTrackingReferencesOf(zwei)), "2 Trackingnummern");
  // Die Sendungsliste liefert dieselbe Liste unter ihrem Spaltennamen.
  assert.deepEqual(multiTrackingReferencesOf({ tracking_references: zwei.trackingReferences }), trackingReferencesOf(zwei));
});

test("D5 — Admin-Detail: alle Trackingreferenzen und alle Anbieterbelege einer Mehrpaketsendung — vier Versandlabels, ein Abholetikett", () => {
  const beleg = (id, documentType, ordinal, labelSize) =>
    ({ id, documentType, ordinal, format: "PDF", labelSize, sizeBytes: 2048, bookingAttemptId: 901 });
  const o = selectOperations({ operations: {
    provider: "transglobal", providerServiceId: "26", providerBookingReference: "7201",
    trackingReferences: ["1Z26MULTI00000001", "1Z26MULTI00000002"], bookedAt: "2026-09-16T08:00:00Z",
    latestAttemptId: 901, attemptsTotal: 1, attemptsLimited: false, legacyWithoutAttempt: false,
    bookingAttempts: [{ id: 901, provider: "transglobal", attempt: 1, state: "booked", createdAt: "t", isLatest: true }],
    documents: { storedLabel: false, providerDocuments: [
      beleg(1, "LABEL", 0, "A4"), beleg(2, "LABEL", 1, "THERMAL"), beleg(3, "LABEL", 2, "A4"),
      beleg(4, "LABEL", 3, "THERMAL"), beleg(5, "COLLECTION_LABEL", 0, "A4"),
    ] },
  } });
  assert.deepEqual(o.trackingReferences, ["1Z26MULTI00000001", "1Z26MULTI00000002"]);
  assert.deepEqual(o.documents.providerDocuments.map((d) => [d.typeText, d.labelSize]), [
    ["Versandlabel", "A4"], ["Versandlabel", "THERMAL"], ["Versandlabel", "A4"], ["Versandlabel", "THERMAL"], ["Abholetikett", "A4"],
  ]);
  assert.deepEqual(documentsSummary(o), { hasLabel: true, storedLabel: false, providerLabelCount: 4, providerDocumentCount: 5 });
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
