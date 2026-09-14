// TG22 Package B — die voraussichtliche Lieferung in der Oberfläche (utils/deliveryProjectionView.mjs, der Zustellvertrag,
// die Buchungsflächen, Karte und Detailbereich).
//
// Die Oberfläche rechnet nichts: die Tage kommen vom Server (`deliveryProjection`). Geprüft wird, dass sie genau diese Tage
// zeigt — als Zeitraum, als einzelnen Tag oder „ab …" —, dass die Laufzeit des Anbieters stehen bleibt, dass keine Uhrzeit
// und keine Zusage entsteht, dass Filter und Auszeichnungen die Prognose nicht lesen und dass JUMiNGO mit seinen
// Anbieterdaten unverändert bleibt.
//
// Die Testnamen tragen die Nummern der Frontend-Pflichttests 1–14. Die Browserprüfungen 15–18 (1440 / 834 / 390 px, kein
// horizontaler Überlauf) stehen in tests/e2e/tg22DeliveryProjection.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  readDeliveryProjection, projectedDeliveryText, projectedDeliveryDateText, DELIVERY_PROJECTION_TEXT,
} from "./deliveryProjectionView.mjs";
import { deliveryContractOf, DELIVERY_LABEL } from "./deliveryContractView.mjs";
import { deliveryInfo } from "./bookingSummaryView.mjs";
import { serviceDetailsView, SERVICE_DETAILS_TEXT } from "./serviceDetailsView.mjs";
import { applyResultFilters } from "./offersFilterView.mjs";
import { assignBadges } from "./offerBadges.js";
import { sameDayOfferView } from "./sameDayCollectionView.mjs";
import { offerSurchargeHint } from "./residentialPriceInputs.mjs";
import { offerCardInsurance } from "./coverInsuranceView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => readFileSync(path.join(HIER, p), "utf8").replace(/\r\n/g, "\n");
const ohneKommentare = (s) => s
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const code = (p) => ohneKommentare(lies(p));
const abschnitt = (quelle, von, bis) => {
  const a = quelle.indexOf(von);
  assert.ok(a >= 0, `Anker fehlt: ${von}`);
  const b = quelle.indexOf(bis, a + von.length);
  assert.ok(b > a, `Endanker fehlt: ${bis}`);
  return quelle.slice(a, b);
};

const MODUL = "deliveryProjectionView.mjs";
const KARTE = "../components/offers/OfferCard.jsx";

/* ══════════ Fixtures — die Formen des Vertrags ══════════ */

// Das öffentliche TG22-Angebot mit Prognose: Abholung Montag, 14.09.2026, Laufzeit 1–2 Tage (Fixturewerte des Servers).
const TG22 = Object.freeze({
  offerId: "22pb0000000000000000000000000022", publicCarrierId: "ups", publicServiceName: "Standardversand",
  serviceType: "pickup", collectionDate: "2026-09-14", collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  deliveryProjection: { kind: "estimated", dateMin: "2026-09-15", dateMax: "2026-09-16" },
  netPrice: 12.74, vatAmount: 2.42, finalPrice: 15.16, currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: false, insuranceDetails: null, trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }, { operant: "weight", operator: "<=", value: 70 }],
  serviceDetails: { summaryKey: "economy_standard", volumetricDivisor: 5000, notAccepted: ["pallets", "suitcases"],
                    basicCoverMaxGoodsValue: 50, maxCoverValue: 2500 },
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
});
const mit = (over = {}) => ({ ...TG22, ...over });
const OHNE_PROGNOSE = mit({ deliveryProjection: null });

// Ein Tarif der anderen Einkaufsquelle mit eigenen Zustelldaten und Uhrzeit.
const JUMINGO = Object.freeze({
  id: 3708, shipper_tariff_id: 3708, offerId: "ju-pb-000000000000000000000003708",
  publicCarrierId: "dhl", publicServiceName: "Standardversand", serviceType: "pickup",
  transitDaysMin: 1, transitDaysMax: 2, deliveryDate: "2026-09-16T00:00:00Z",
  deliveryDateMin: "2026-09-16T00:00:00Z", deliveryDateMax: "2026-09-17T00:00:00Z", deliveryTimeUntil: "18:00",
  netPrice: 12.9, vatAmount: 2.45, finalPrice: 15.35, currency: "EUR", bookable: true, requiredPriceInputs: [],
  trackingAvailable: true, printerRequired: false,
});

const VERBOTEN_ZUSAGE = /garant|zugesichert|spätestens|pünktlich|verbindlich|fest zugesagt/i;

/* ══════════ 1–4  DARSTELLUNG ══════════ */

test("1 — Zeitraum: „Di., 15.09. – Mi., 16.09.“", () => {
  assert.equal(projectedDeliveryText({ dateMin: "2026-09-15", dateMax: "2026-09-16" }), "Di., 15.09. – Mi., 16.09.");
  assert.equal(projectedDeliveryText(readDeliveryProjection(TG22)), "Di., 15.09. – Mi., 16.09.");
  // Freitag + 1–2 → Montag–Dienstag; Jahreswechsel ohne Jahreszahl wie die übrige Karte.
  assert.equal(projectedDeliveryText({ dateMin: "2026-09-21", dateMax: "2026-09-22" }), "Mo., 21.09. – Di., 22.09.");
  assert.equal(projectedDeliveryText({ dateMin: "2027-01-01", dateMax: "2027-01-04" }), "Fr., 01.01. – Mo., 04.01.");
  assert.equal(projectedDeliveryDateText({ dateMin: "2026-09-15", dateMax: "2026-09-16" }), "15.09.2026 – 16.09.2026");
});

test("2 — ein einzelner Tag: „Di., 15.09.“", () => {
  assert.equal(projectedDeliveryText({ dateMin: "2026-09-15", dateMax: "2026-09-15" }), "Di., 15.09.");
  assert.equal(projectedDeliveryDateText({ dateMin: "2026-09-15", dateMax: "2026-09-15" }), "15.09.2026");
});

test("3 — nach oben offen: „ab Di., 15.09.“ — keine erfundene Obergrenze", () => {
  const offen = mit({ transitDaysMax: null, deliveryTime: "ab 1 Tag",
                      deliveryProjection: { kind: "estimated", dateMin: "2026-09-15", dateMax: null } });
  assert.equal(projectedDeliveryText(readDeliveryProjection(offen)), "ab Di., 15.09.");
  assert.equal(deliveryInfo(offen).value, "ab 15.09.2026");
  assert.equal(deliveryContractOf(offen).transit, "ab 1 Tag");
  assert.ok(!/–/.test(projectedDeliveryText(readDeliveryProjection(offen))), "eine Obergrenze wurde erfunden");
});

test("4 — Beschriftung „Voraussichtliche Lieferung“ auf Karte, Buchungsflächen und Detailbereich", () => {
  assert.equal(DELIVERY_PROJECTION_TEXT.label, "Voraussichtliche Lieferung");
  assert.equal(DELIVERY_LABEL.ESTIMATED, "Voraussichtliche Lieferung");
  const z = deliveryContractOf(TG22);
  assert.equal(z.kind, "estimate");
  assert.equal(z.label, "Voraussichtliche Lieferung");
  assert.deepEqual({ ...z.estimate }, { dateMin: "2026-09-15", dateMax: "2026-09-16" });
  assert.deepEqual(deliveryInfo(TG22), { label: "Voraussichtliche Lieferung", value: "15.09.2026 – 16.09.2026", until: null, isRange: false });
  // Die Karte liest dieselbe Aussage: der Knoten trägt den Titel des Vertrags und die Tage des Servers.
  const ende = abschnitt(code(KARTE), "function buildEnd", "function DetailRow");
  assert.match(ende, /else if \(zustellung\.kind === "estimate"\) primary = projectedDeliveryText\(zustellung\.estimate\);/);
  assert.match(ende, /const title = zustellung\.label;/);
  const profil = serviceDetailsView(TG22);
  assert.deepEqual(profil.transit.rows.find((r) => r.id === "projection"),
    { id: "projection", label: "Voraussichtliche Lieferung", value: "Di., 15.09. – Mi., 16.09." });
});

/* ══════════ 5–8  LAUFZEIT, UHRZEIT, ZUSAGE, RÜCKFALL ══════════ */

test("5 — die Laufzeit des Anbieters bleibt stehen: Karte oben, Zustellvertrag und Detailbereich", () => {
  assert.equal(deliveryContractOf(TG22).transit, "1–2 Tage");
  const v = serviceDetailsView(TG22);
  assert.deepEqual(v.transit.rows, [
    { id: "transit", label: "Voraussichtliche Laufzeit", value: "1–2 Tage" },
    { id: "projection", label: "Voraussichtliche Lieferung", value: "Di., 15.09. – Mi., 16.09." },
  ]);
  assert.equal(v.transit.note, SERVICE_DETAILS_TEXT.transitNote, "der Hinweis zur Laufzeit ist verschwunden");
  assert.equal(v.transit.projectionNote, DELIVERY_PROJECTION_TEXT.note);
  assert.match(DELIVERY_PROJECTION_TEXT.note, /Wochenenden/);
  assert.match(DELIVERY_PROJECTION_TEXT.note, /Feiertage können die Zustellung verschieben/);
  // Die große Laufzeitangabe der Karte bleibt die Laufzeit des Anbieters.
  assert.match(code(KARTE), /const etaLabel\s+= fmtDelivery\(t\) \|\| "Auf Anfrage";/);
});

test("6 — kein „bis HH:MM“ für eine Prognose — auch nicht, wenn das Angebot eine Uhrzeit trüge", () => {
  const mitUhrzeit = mit({ deliveryTimeUntil: "18:00" });
  assert.equal(deliveryContractOf(mitUhrzeit).until, null);
  assert.equal(deliveryInfo(mitUhrzeit).until, null);
  for (const text of [projectedDeliveryText(readDeliveryProjection(TG22)), deliveryInfo(TG22).value,
                      JSON.stringify(serviceDetailsView(TG22).transit)]) {
    assert.ok(!/\d{1,2}:\d{2}|\bUhr\b/.test(text), `eine Uhrzeit: ${text}`);
  }
  assert.ok(!/deliveryTimeUntil|Uhr\b/.test(code(MODUL)));
});

test("7 — keine Zusage: kein „garantiert“, kein „spätestens“, kein „pünktlich“", () => {
  for (const text of [DELIVERY_PROJECTION_TEXT.label, DELIVERY_PROJECTION_TEXT.note, projectedDeliveryText(readDeliveryProjection(TG22)),
                      JSON.stringify(serviceDetailsView(TG22))]) {
    assert.ok(!VERBOTEN_ZUSAGE.test(text), `Zusage im Text: ${text}`);
  }
});

test("8 — ohne gültige Prognose kein Datum: die Laufzeit bleibt die einzige Aussage", () => {
  const z = deliveryContractOf(OHNE_PROGNOSE);
  assert.deepEqual([z.kind, z.label, z.transit, z.estimate], ["transit", "Voraussichtliche Laufzeit", "1–2 Tage", null]);
  for (const kaputt of [
    undefined, "2026-09-15", [], {}, { kind: "guaranteed", dateMin: "2026-09-15", dateMax: "2026-09-16" },
    { kind: "estimated", dateMin: "2026-02-30", dateMax: null }, { kind: "estimated", dateMin: "15.09.2026", dateMax: null },
    { kind: "estimated", dateMin: "2026-09-16", dateMax: "2026-09-15" }, { kind: "estimated", dateMax: "2026-09-16" },
    { kind: "estimated", dateMin: "2026-09-15T00:00:00Z", dateMax: null },
  ]) {
    const t = mit({ deliveryProjection: kaputt });
    assert.equal(readDeliveryProjection(t), null, JSON.stringify(kaputt));
    assert.equal(deliveryContractOf(t).kind, "transit", JSON.stringify(kaputt));
    assert.equal(serviceDetailsView(t).transit.rows.length, 1, JSON.stringify(kaputt));
  }
  assert.equal(projectedDeliveryText(null), null);
  // Die Oberfläche rechnet keinen Tag: kein Addieren, kein Überspringen, keine Uhr.
  const modul = code(MODUL);
  for (const verboten of ["setUTCDate", "setDate", "Date.now", "toLocale", "addBusinessDays", "+ 1", "+ n"]) {
    assert.ok(!modul.includes(verboten), `das Modul rechnet: „${verboten}"`);
  }
});

/* ══════════ 9–12  PACKAGE A, SAME-DAY, PRIVATADRESSE, ABSICHERUNG ══════════ */

test("9 — der Package-A-Detailbereich bleibt: nur der Laufzeitblock bekommt eine Zeile und einen Hinweis", () => {
  const mitP = serviceDetailsView(TG22);
  const ohneP = serviceDetailsView(OHNE_PROGNOSE);
  for (const bereich of ["main", "size", "cover", "restrictions"]) {
    assert.deepEqual(mitP[bereich], ohneP[bereich], `${bereich} hängt an der Prognose`);
  }
  assert.deepEqual(ohneP.transit, {
    rows: [{ id: "transit", label: "Voraussichtliche Laufzeit", value: "1–2 Tage" }],
    note: SERVICE_DETAILS_TEXT.transitNote, projectionNote: null,
  });
  const profil = code("../components/offers/ServiceProfileDetails.jsx");
  assert.match(profil, /transit\.projectionNote && \(/);
});

test("10 — Abholung am selben Tag: Zuschlagszeilen und Prognose stehen nebeneinander", () => {
  const heute = mit({ pickupToday: true, pickupTodayUntil: "16:45", sameDaySurchargeNet: 3.02, sameDaySurchargeGross: 3.6 });
  assert.ok(sameDayOfferView(heute), "die Abholung heute ist verschwunden");
  assert.deepEqual(sameDayOfferView(heute), sameDayOfferView({ ...heute, deliveryProjection: null }));
  assert.equal(deliveryContractOf(heute).kind, "estimate");
});

test("11 — Privatadresse: der Hinweis und der vorläufige Preis bleiben unverändert", () => {
  assert.equal(offerSurchargeHint(TG22), offerSurchargeHint(OHNE_PROGNOSE));
  assert.ok(offerSurchargeHint(TG22), "der Hinweis zur Privatadresse fehlt");
});

test("12 — Absicherung: die Aussage der Karte ist mit und ohne Prognose identisch", () => {
  const buchbar = mit({ bookable: true, unavailableReason: null, insuranceAvailable: true,
    insuranceDetails: { isInsurable: true, selectionModel: "cover_value", excessValue: 20,
                        requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true } });
  assert.deepEqual(offerCardInsurance(buchbar), offerCardInsurance({ ...buchbar, deliveryProjection: null }));
});

/* ══════════ 13–14  JUMINGO ══════════ */

test("13 — JUMiNGO: Zustellzeitraum aus Anbieterdaten unverändert — eine Prognose überschreibt ihn nie", () => {
  const z = deliveryContractOf(JUMINGO);
  assert.deepEqual([z.kind, z.label, z.estimate], ["range", "Zustellung", null]);
  assert.deepEqual(deliveryInfo(JUMINGO), { label: "Zustellung", value: "16.09.2026 – 17.09.2026", until: "bis 18:00", isRange: true });
  const mitFremderPrognose = { ...JUMINGO, deliveryProjection: { kind: "estimated", dateMin: "2026-09-15", dateMax: "2026-09-15" } };
  assert.deepEqual(deliveryInfo(mitFremderPrognose), deliveryInfo(JUMINGO));
});

test("14 — JUMiNGO: die Zustelluhrzeit bleibt sichtbar", () => {
  assert.equal(deliveryContractOf(JUMINGO).until, "bis 18:00");
  const ende = abschnitt(code(KARTE), "function buildEnd", "function DetailRow");
  assert.match(ende, /const zeitText = deliveryTimeLabel\(t\);/);
  const details = abschnitt(code(KARTE), "function DetailsPanel", "function OfferCardBase");
  assert.ok(details.includes('label="Zustellung"'), "die Zustellzeile der Details fehlt");
});

/* ══════════ Keine operative Autorität: Filter, Auszeichnungen, Sortierung, Kennzahl ══════════ */

test("Filter und Auszeichnungen lesen die Prognose nicht — „Schnellste“ bleibt die Laufzeit", () => {
  // Der Lieferdatumsfilter kennt nur Anbieterdaten: ein Angebot ohne sie bleibt wie bisher sichtbar.
  const frist = { latestDeliveryDate: "2026-09-15" };
  assert.deepEqual(applyResultFilters([TG22, JUMINGO], frist).map((t) => t.offerId),
                   applyResultFilters([OHNE_PROGNOSE, JUMINGO], frist).map((t) => t.offerId));
  const schnell = mit({ offerId: "22pb0000000000000000000000000023", bookable: true, unavailableReason: null,
                        transitDaysMin: 2, transitDaysMax: 3, deliveryProjection: { kind: "estimated", dateMin: "2026-09-15", dateMax: "2026-09-15" } });
  const alle = [{ ...TG22, bookable: true, unavailableReason: null }, schnell];
  assert.deepEqual([...assignBadges(alle).entries()],
                   [...assignBadges(alle.map((t) => ({ ...t, deliveryProjection: null }))).entries()]);
  for (const datei of ["offersFilterView.mjs", "offerBadges.js", "kpis.mjs", "../pages/NewShipmentPage.jsx", "../pages/CalculatorPage.jsx"]) {
    assert.ok(!/deliveryProjection|projectedDelivery/.test(code(datei)), `${datei} liest die Prognose`);
  }
});
