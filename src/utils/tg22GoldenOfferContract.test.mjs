/* TG22 Golden Offer Contract — Preisautorität, Preisänderung, Angebotsliste, Zustellung,
 * Abholung und Labelangaben auf allen Kundenflächen.
 *
 * TG ServiceID 22 ist die Referenz; der gemeinsame Pfad gilt für jede Einkaufsquelle. Gemessen
 * wird zweierlei:
 *   • die reinen Helfer (View-Model, Zustell-/Abholvertrag, Labelübersetzer, Preisänderung,
 *     übernommener Angebotspreis) — mit echten Zahlen des Referenzfalls,
 *   • am kommentarfreien Quelltext, dass JEDE Fläche genau diese Helfer liest und keine eigene
 *     Wahrheit mehr hält (es gibt keine React-Render-Testschicht).
 *
 * Kein Netz, kein Browser, keine Providerdaten.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildBookingPriceView, priceViewBlocksBooking, PRICE_STATUS } from "./bookingPriceView.mjs";
import {
  deliveryInfo, priceInfo, PRICE_CHANGED_LABEL, PRICE_CHANGED_HINT,
} from "./bookingSummaryView.mjs";
import { deliveryContractOf, DELIVERY_LABEL, DELIVERY_ON_REQUEST } from "./deliveryContractView.mjs";
import { pickupSummaryOf } from "./pickupContractView.mjs";
import {
  labelSizeName, labelFileFormatName, labelDeliveryInfo, labelFormatOptionsOf,
} from "./labelFormatOptions.mjs";
import { labelCapabilityLine } from "./offerMetadataView.mjs";
import {
  priceChangeAnsicht, preisIstBestaetigbar, pendingPriceChangeNotice, PRICE_CHANGE_KIND,
  PREISAENDERUNG_OFFEN_TEXT,
} from "./priceChangeView.mjs";
import { insuredPriceChangeView } from "./coverInsuranceView.mjs";
import { acceptedShippingPrice, tariffWithAcceptedShippingPrice, replaceOffer } from "./acceptedOfferPrice.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => fs.readFileSync(path.join(HIER, "..", p), "utf8");
const ohneKommentar = (s) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = (p) => ohneKommentar(lies(p));

const SEITE    = "pages/BookingPage.jsx";
const AUSWAHL  = "components/booking/OfferSummaryModule.jsx";
const LIVE     = "components/booking/BookingLiveSummary.jsx";
const STICKY   = "components/booking/BookingStickySummary.jsx";
const SUMME    = "components/booking/PriceSummaryModule.jsx";
const AKTION   = "components/booking/BookingActionModule.jsx";
const KARTE    = "components/offers/OfferCard.jsx";

/* Das öffentliche TG22-Angebot in der Feldmenge des Servers — ohne Tarif-ID, ohne ServiceID. */
const TG22 = Object.freeze({
  offerId: "22g0000000000000000000000000022a", publicCarrierId: "ups", publicServiceName: "Standardversand",
  serviceType: "pickup", collectionDate: "2026-09-15", collectionReadyFrom: "09:00",
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  netPrice: 15.33, vatAmount: 2.91, finalPrice: 18.24, currency: "EUR", bookable: true,
  labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  chargeableWeight: 2, trackingAvailable: true, printerRequired: true,
  insuranceAvailable: true,
  insuranceDetails: { isInsurable: true, selectionModel: "cover_value", excessValue: 20 },
});
/* Die bestätigte Neubepreisung mit Transportabsicherung (10,00 €, steuerfrei). */
const TG22_ABGESICHERT = Object.freeze({
  selectedInsurance: "transit_cover",
  insurance: { coverValue: 500, excessValue: 20, goodsAreNew: true, goodsAreFragile: false, insuranceGross: 10 },
  totals: {
    customerShippingNet: 15.33, shippingVat: 2.91, customerShippingGross: 18.24,
    insuranceGross: 10, customerTotalNet: 25.33, customerTotalGross: 28.24,
  },
  priceRevision: 0,
});
/* Ein Angebot der anderen Einkaufsquelle: Tarif-ID, Abholfenster, Zustelldaten, A4/A6-Wahl. */
const JUMINGO = Object.freeze({
  id: 17, shipper_tariff_id: 3708, offerId: "j".repeat(32), publicCarrierId: "ups",
  publicServiceName: "Standardversand", serviceType: "pickup",
  pickupDate: "2026-09-15T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDateMin: "2026-09-16T00:00:00Z", deliveryDateMax: "2026-09-17T00:00:00Z", deliveryTimeUntil: "18:00",
  transitDaysMin: 1, transitDaysMax: 2,
  netPrice: 12.9, vatAmount: 2.45, finalPrice: 15.35, currency: "EUR",
  labelFormatOptions: ["A4", "A6"],
});

/* ══════════ §A  EINE PREISPROJEKTION — SERVERAUTORITÄT ═══════════════════════════ */

test("A1 — TG22 ohne Absicherung: „Gesamt 15,33 netto / 18,24 brutto“ aus dem Angebot", () => {
  const v = buildBookingPriceView({ tariff: TG22, insuranceType: "none" });
  assert.equal(v.status, PRICE_STATUS.BASE_CONFIRMED);
  assert.deepEqual(priceInfo(v), { confirmed: true, changed: false, label: "Gesamt", gross: 18.24, net: 15.33 });
});

test("A2 — TG22 mit Absicherung: „Gesamt 25,33 / 28,24“ ausschließlich aus der Serverantwort", () => {
  const v = buildBookingPriceView({ tariff: TG22, insuranceType: "transit_cover", repriceResult: TG22_ABGESICHERT });
  assert.equal(v.status, PRICE_STATUS.REPRICE_CONFIRMED);
  assert.equal(v.shippingNet, 15.33);
  assert.equal(v.shippingVat, 2.91);
  assert.equal(v.shippingGross, 18.24);
  assert.equal(v.insuranceGross, 10);
  assert.equal(v.totalNet, 25.33);
  assert.equal(v.totalGross, 28.24);
  assert.deepEqual(priceInfo(v), { confirmed: true, changed: false, label: "Gesamt", gross: 28.24, net: 25.33 });
  // Vor der Bestätigung: der Versandpreis, ausdrücklich als „Versand" — nie ein Gesamtbetrag.
  const offen = buildBookingPriceView({ tariff: TG22, insuranceType: "transit_cover", repriceResult: null });
  assert.deepEqual(priceInfo(offen), { confirmed: false, changed: false, label: "Versand", gross: 18.24, net: 15.33 });
});

test("A3 — fehlt customerTotalNet, bleibt der Nettogesamtbetrag leer — keine lokale Rekonstruktion", () => {
  const ohneNetto = { ...TG22_ABGESICHERT, totals: { ...TG22_ABGESICHERT.totals } };
  delete ohneNetto.totals.customerTotalNet;
  const v = buildBookingPriceView({ tariff: TG22, insuranceType: "transit_cover", repriceResult: ohneNetto });
  assert.equal(v.totalNet, null, "der Client hat Versandnetto und Absicherung selbst addiert");
  assert.equal(v.totalGross, 28.24);
  assert.equal(priceInfo(v).net, null);
});

test("A4 — der Client übernimmt den Servernettobetrag auch dann, wenn er nicht der eigenen Summe entspräche", () => {
  // Beweis durch Widerspruch: rechnete der Client, stünde hier 25,33.
  const v = buildBookingPriceView({ tariff: TG22, insuranceType: "transit_cover", repriceResult: {
    ...TG22_ABGESICHERT, totals: { ...TG22_ABGESICHERT.totals, customerTotalNet: 25.34 } } });
  assert.equal(v.totalNet, 25.34);
});

test("A5 — das View-Model enthält keine Preisaddition mehr", () => {
  const modul = code("utils/bookingPriceView.mjs");
  assert.ok(!/round2/.test(modul), "die clientseitige Rundungshilfe ist zurück");
  assert.ok(!/shippingNet\s*\+|\+\s*insuranceGross/.test(modul), "Versandnetto und Absicherung werden wieder addiert");
  assert.match(modul, /const totalNet\s+= num\(totals\.customerTotalNet\);/);
});

test("A6 — ausgewähltes Angebot, Live- und Sticky-Leiste lesen denselben Preis aus priceInfo", () => {
  const auswahl = code(AUSWAHL);
  assert.match(auswahl, /const preis = priceInfo\(priceView\);/);
  assert.match(auswahl, /\{preis\.label\}/, "das ausgewählte Angebot nennt nicht, WAS der Betrag ist");
  assert.ok(!/tariff\.(netPrice|finalPrice|vatAmount)/.test(auswahl), "das ausgewählte Angebot liest den Tarifpreis wieder direkt");
  const live = code(LIVE);
  assert.match(live, /const preis = priceInfo\(v\);/);
  assert.match(live, /\{preis\.label\}/);
  assert.ok(!/baseShippingGross|totalGross|hasConfirmedPrice/.test(live), "die Live-Leiste wählt den Betrag wieder selbst");
  const sticky = code(STICKY);
  assert.match(sticky, /const preis = priceInfo\(priceView\);/);
  assert.match(sticky, /<span className="bsum-price-label">\{preis\.label\}<\/span>/, "die Sticky-Leiste zeigt kein Preislabel");
});

test("A7 — die Buchungsseite reicht DASSELBE priceView an alle Preisflächen", () => {
  const seite = code(SEITE);
  for (const muster of [
    /<OfferSummaryModule tariff=\{tariff\} priceView=\{priceView\} pickupWindow=\{pickupWindow\} \/>/,
    /<BookingLiveSummary tariff=\{tariff\} priceView=\{priceView\}/,
    /<BookingStickySummary tariff=\{tariff\} priceView=\{priceView\}/,
    /<PriceSummaryModule\s+priceView=\{priceView\}/,
  ]) {
    assert.match(seite, muster);
  }
});

/* ══════════ §B  PRICE_CHANGED — KEIN ALTER PREIS, KEINE BUCHUNG, KEINE SCHLEIFE ═══ */

test("B1 — eine offene Preisänderung entwertet Basis- UND Neubepreisungspreis und sperrt die Buchung", () => {
  for (const eingabe of [
    { tariff: TG22, insuranceType: "none" },
    { tariff: TG22, insuranceType: "transit_cover", repriceResult: TG22_ABGESICHERT },
    { tariff: JUMINGO, insuranceType: "standard", repriceResult: { totals: { customerShippingNet: 12.9 } } },
  ]) {
    const v = buildBookingPriceView({ ...eingabe, priceChangePending: true });
    assert.equal(v.status, PRICE_STATUS.PRICE_CHANGED);
    assert.equal(v.isPriceChanged, true);
    assert.equal(v.hasConfirmedPrice, false);
    assert.equal(v.totalGross, null);
    assert.equal(v.totalNet, null);
    assert.equal(v.shippingGross, null);
    assert.equal(priceViewBlocksBooking(v), true);
    assert.deepEqual(priceInfo(v), { confirmed: false, changed: true, label: PRICE_CHANGED_LABEL, gross: null, net: null });
  }
  assert.equal(PRICE_CHANGED_LABEL, "Preis geändert");
  assert.equal(PRICE_CHANGED_HINT, "Nicht mehr aktuell");
  // Ohne offene Preisänderung bleibt alles wie bisher.
  assert.equal(buildBookingPriceView({ tariff: TG22, insuranceType: "none", priceChangePending: false }).status,
    PRICE_STATUS.BASE_CONFIRMED);
});

test("B2 — Escape und Hintergrund schließen nur die Anzeige; die Preisänderung bleibt offen", () => {
  const seite = code(SEITE);
  assert.match(seite, /const priceChangeDialogOpen = !!priceChange && dismissedPriceChange !== priceChange;/);
  assert.match(seite, /useDialog\(\{\s*open: priceChangeDialogOpen,\s*onClose: \(\) => \{ setDismissedPriceChange\(priceChange\); setPriceAcceptError\(""\); \},\s*closeOnEscape: !priceAccepting,\s*returnFocusTo: priceChangeActionRef,\s*\}\)/);
  assert.match(seite, /onMouseDown=\{\(e\) => \{ if \(e\.target === e\.currentTarget && !priceAccepting\) \{ setDismissedPriceChange\(priceChange\); setPriceAcceptError\(""\); \} \}\}/);
  assert.match(seite, /\{priceChangeDialogOpen && \(\s*<div\s+className="price-drift-overlay"/);
  assert.ok(!/useDialog\(\{\s*open: !!priceChange, onClose: \(\) => setPriceChange\(null\)/.test(seite),
    "Escape setzt die Preisänderung wieder zurück — der alte Preis wäre erneut buchbar");
  // Das View-Model erfährt von der offenen Preisänderung.
  assert.match(seite, /priceChangePending: !!priceChange,/);
});

test("B3 — die Buchung selbst verweigert sich bei offener Preisänderung; nur die Dialogbestätigung bucht weiter", () => {
  const seite = code(SEITE);
  const doBook = seite.slice(seite.indexOf("const doBook = async"), seite.indexOf("await apiFetch(`/api/jumingo/book`"));
  assert.match(doBook, /^const doBook = async \(optionen\) => \{\s*if \(!agbAccepted\) return;\s*if \(priceChange && optionen\?\.nachPreisbestaetigung !== true\) return;/);
  const fortfahren = seite.slice(seite.indexOf("const continueWithNewPrice = "));
  assert.match(fortfahren, /confirmedFinalPriceRef\.current = np;[^\n]*\n\s*setPriceChange\(null\);\s*doBook\(\{ nachPreisbestaetigung: true \}\);/);
  // Der Bestellknopf ruft doBook mit dem Klickereignis — das trägt die Kennung nie.
  assert.match(seite, /onBook=\{doBook\}/);
});

test("B4 — der Hinweis ersetzt den Bestellknopf; „ansehen“ nur bei bestätigbarem Preispaar", () => {
  const a = code(AKTION);
  const konflikt = a.indexOf("conflict ? (");
  const offen = a.indexOf("priceChangeNotice ? (");
  const neu = a.indexOf("recalcNotice ? (");
  const knopf = a.indexOf("booking-book-btn");
  assert.ok(konflikt > -1 && offen > konflikt && neu > offen && knopf > neu,
    "der Hinweis steht nicht zwischen Konfliktfläche und Bestellknopf");
  assert.match(a, /\{priceChangeNotice\.reviewable && \(\s*<button\s+type="button"\s+id="booking-price-change-review"/);
  assert.match(a, /id="booking-price-change-recalculate"[\s\S]*?onClick=\{onRecalculate\}/);
  const seite = code(SEITE);
  assert.match(seite, /priceChangeNotice=\{pendingPriceChangeNotice\(priceChange\)\}/);
  assert.match(seite, /onReviewPriceChange=\{\(\) => setDismissedPriceChange\(null\)\}/);
});

test("B5 — pendingPriceChangeNotice: bestätigbar → ansehen möglich; sonst nur Neuberechnung", () => {
  const bestaetigbar = priceChangeAnsicht({ code: "PRICE_CHANGED", oldPrice: 22.19, newPrice: 24.49 });
  assert.deepEqual({ ...pendingPriceChangeNotice(bestaetigbar) },
    { reviewable: true, text: PREISAENDERUNG_OFFEN_TEXT[PRICE_CHANGE_KIND.CONFIRMABLE] });
  const neu = priceChangeAnsicht({ code: "PRICE_CHANGED", price: 24.49 });
  assert.deepEqual({ ...pendingPriceChangeNotice(neu) },
    { reviewable: false, text: PREISAENDERUNG_OFFEN_TEXT[PRICE_CHANGE_KIND.RECALCULATE] });
  for (const leer of [null, undefined, "", 0]) assert.equal(pendingPriceChangeNotice(leer), null);
  for (const t of Object.values(PREISAENDERUNG_OFFEN_TEXT)) {
    assert.match(t, /Es wurde nichts gebucht\./);
    assert.ok(!/transglobal|jumingo/i.test(t));
  }
});

test("B6 — die Preiszusammenfassung nennt bei offener Preisänderung keinen alten Betrag", () => {
  const summe = code(SUMME);
  assert.match(summe, /const changed = v\.isPriceChanged === true;/);
  assert.match(summe, /const shipNet\s+= changed \? null :/);
  assert.match(summe, /const shipGross = changed \? null :/);
  assert.match(summe, /insState = \{ kind: "error", text: PRICE_CHANGED_SUMMARY, id: "booking-price-changed-state" \};/);
  assert.match(summe, /betragOderStrich\(shipNet\)/, "ein fehlender Betrag erschiene als 0,00 €");
});

/* ══════════ §C  DRIFT OHNE NEUBINDUNG → NUR NEU BERECHNEN ════════════════════════ */

test("C1 — recalculationRequired bietet keinen Bestätigungsweg — auch nicht mit Beträgen", () => {
  const nur = priceChangeAnsicht({ code: "PRICE_CHANGED", price: 35.7, recalculationRequired: true });
  assert.equal(nur.kind, PRICE_CHANGE_KIND.RECALCULATE);
  const mitPaar = priceChangeAnsicht({ code: "PRICE_CHANGED", oldPrice: 9.99, newPrice: 35.7, recalculationRequired: true });
  assert.equal(mitPaar.kind, PRICE_CHANGE_KIND.RECALCULATE);
  assert.equal(preisIstBestaetigbar(mitPaar), false);
  // Nur ein echtes `true` zählt.
  assert.equal(priceChangeAnsicht({ oldPrice: 9.99, newPrice: 35.7, recalculationRequired: "true" }).kind,
    PRICE_CHANGE_KIND.CONFIRMABLE);
});

test("C2 — versicherte Drift ohne Neubindung wird nie aus dem letzten Betrag zu einem Preispaar ergänzt", () => {
  const v = insuredPriceChangeView({ code: "PRICE_CHANGED", price: 40.7, recalculationRequired: true }, 35.7);
  assert.equal(v.kind, PRICE_CHANGE_KIND.RECALCULATE);
  assert.equal(preisIstBestaetigbar(v), false);
});

test("C3 — TG-Neubindung bleibt bestätigbar: Form B mit letztem Betrag und Form A mit Zusammensetzung", () => {
  const formB = insuredPriceChangeView({ code: "PRICE_CHANGED", price: 30.24 }, 28.24);
  assert.equal(formB.kind, PRICE_CHANGE_KIND.CONFIRMABLE);
  assert.equal(formB.oldPrice, 28.24);
  assert.equal(formB.newPrice, 30.24);
  assert.equal(formB.insured, true);
  const formA = insuredPriceChangeView({
    code: "PRICE_CHANGED", price: 30.24, oldPrice: 28.24, newPrice: 30.24,
    priceChange: { shipping: { oldGross: 18.24, newGross: 20.24 }, insurance: { oldGross: 10, newGross: 10 } },
  }, undefined);
  assert.equal(formA.kind, PRICE_CHANGE_KIND.CONFIRMABLE);
  assert.ok(formA.breakdown, "die Zusammensetzung der Serverantwort fehlt");
});

test("C4 — „Angebote neu berechnen“ verwirft die gespeicherten Angebote, bevor es zum Formular geht", () => {
  const seite = code(SEITE);
  const neu = seite.slice(seite.indexOf("const handlePriceChangeRecalculate = () => {"));
  assert.match(neu, /^const handlePriceChangeRecalculate = \(\) => \{\s*setPriceChange\(null\);\s*setFlowScope\("shipment", \{ tariffs: \[\], selected: null, calculatedAt: null \}\);\s*setFlowStep\("form"\);\s*navigate\("\/dashboard\?page=new"\);\s*\};/);
});

/* ══════════ §D  ANGEBOTSLISTE NACH ÜBERNOMMENER PREISÄNDERUNG ═══════════════════ */

test("D1 — übernommen werden ausschließlich die drei Versandbeträge der Serverantwort", () => {
  assert.deepEqual({ ...acceptedShippingPrice({ customerShippingNet: 17.01, shippingVat: 3.23, customerShippingGross: 20.24, customerTotalGross: 30.24 }) },
    { netPrice: 17.01, vatAmount: 3.23, finalPrice: 20.24 });
  for (const kaputt of [null, undefined, [], "x",
                        { customerShippingNet: 17.01, shippingVat: 3.23 },
                        { customerShippingNet: "17.01", shippingVat: 3.23, customerShippingGross: 20.24 },
                        { customerShippingNet: -1, shippingVat: 3.23, customerShippingGross: 20.24 },
                        { customerShippingNet: NaN, shippingVat: 3.23, customerShippingGross: 20.24 }]) {
    assert.equal(acceptedShippingPrice(kaputt), null, JSON.stringify(kaputt));
  }
});

test("D2 — das Angebot trägt danach den neuen Versandpreis; Identität und alle übrigen Felder bleiben", () => {
  const neu = tariffWithAcceptedShippingPrice(TG22, { customerShippingNet: 17.01, shippingVat: 3.23, customerShippingGross: 20.24 });
  assert.equal(neu.netPrice, 17.01);
  assert.equal(neu.vatAmount, 3.23);
  assert.equal(neu.finalPrice, 20.24);
  assert.equal(neu.offerId, TG22.offerId);
  assert.equal(neu.publicServiceName, "Standardversand");
  assert.equal(TG22.finalPrice, 18.24, "das Ursprungsangebot wurde verändert");
  // Derselbe Preis oder unvollständige Werte: nichts zu übernehmen.
  assert.equal(tariffWithAcceptedShippingPrice(TG22, TG22_ABGESICHERT.totals), null);
  assert.equal(tariffWithAcceptedShippingPrice(TG22, { customerShippingGross: 20.24 }), null);
  assert.equal(tariffWithAcceptedShippingPrice(null, TG22_ABGESICHERT.totals), null);
});

test("D3 — in der Liste wird genau dieses Angebot ersetzt; ein Angebot ohne Kennung ersetzt nichts", () => {
  const neu = { ...TG22, finalPrice: 20.24 };
  const liste = [JUMINGO, TG22, { netPrice: 1 }];
  const ergebnis = replaceOffer(liste, neu);
  assert.equal(ergebnis[0], JUMINGO);
  assert.equal(ergebnis[1], neu);
  assert.equal(ergebnis[2], liste[2]);
  assert.deepEqual(replaceOffer(liste, { netPrice: 99 }), liste);
  assert.deepEqual(replaceOffer(null, neu), []);
});

test("D4 — nach der Übernahme aktualisiert die Seite Angebot, Vorgang und Verlaufseintrag — ohne Neuladen", () => {
  const seite = code(SEITE);
  const annahme = seite.slice(seite.indexOf("const acceptInsuredPriceChange = "), seite.indexOf("const continueWithNewPrice = "));
  assert.match(annahme, /if \(r\.ok\) \{\s*setRepriceResult\(d\); setRepriceStale\(false\);\s*setPriceChange\(null\);\s*setPriceAcceptNotice\(COVER_PRICE_CHANGE_TEXT\.accepted\);\s*uebernimmAngebotspreis\(d\?\.totals\);\s*return;\s*\}/);
  const helfer = seite.slice(seite.indexOf("const uebernimmAngebotspreis = "), seite.indexOf("const acceptInsuredPriceChange = "));
  assert.match(helfer, /const neu = tariffWithAcceptedShippingPrice\(tariff, totals\);\s*if \(!neu\) return;/);
  assert.match(helfer, /tariffs: replaceOffer\(flowShipment\.tariffs, neu\),/);
  assert.match(helfer, /sameOffer\(flowShipment\.selected, neu\) \? \{ selected: neu \} : \{\}/);
  assert.match(helfer, /navigate\(`\$\{location\.pathname\}\$\{location\.search\}`, \{ replace: true, state: \{ \.\.\.navState, tariff: neu \} \}\);/);
  assert.ok(!/doBook\(|\/api\/jumingo\/book/.test(helfer), "die Übernahme des Angebotspreises bucht");
});

test("D5 — der übernommene Angebotspreis wird nicht gerechnet", () => {
  const modul = code("utils/acceptedOfferPrice.mjs");
  assert.ok(!/[\w)\]]\s*[*/+-]\s*[\w(]/.test(modul.replace(/=>/g, "")), "im Modul steht eine Rechnung");
  assert.ok(!/transglobal|jumingo/i.test(modul));
});

/* ══════════ §E  ZUSTELLUNG — EINE BESCHRIFTUNG, NUR ANBIETERDATEN ════════════════ */

test("E1 — nur eine Laufzeit: „Voraussichtliche Laufzeit · 1–2 Tage“, kein Datum", () => {
  const z = deliveryContractOf(TG22);
  assert.equal(z.kind, "transit");
  assert.equal(z.label, "Voraussichtliche Laufzeit");
  assert.equal(z.transit, "1–2 Tage");
  assert.equal(z.day, null);
  assert.deepEqual(deliveryInfo(TG22), { label: "Voraussichtliche Laufzeit", value: "1–2 Tage", until: null, isRange: false });
});

test("E2 — Zustelldaten des Angebots: „Zustellung“ mit Zeitraum und „bis“-Uhrzeit bleiben erhalten", () => {
  const z = deliveryContractOf(JUMINGO);
  assert.equal(z.kind, "range");
  assert.equal(z.label, DELIVERY_LABEL.DATED);
  assert.deepEqual(deliveryInfo(JUMINGO), {
    label: "Zustellung", value: "16.09.2026 – 17.09.2026", until: "bis 18:00", isRange: true,
  });
});

test("E3 — gleicher Tag, Einzeldatum, nichts: Tag, Tag, „Auf Anfrage“", () => {
  const gleich = { deliveryDateMin: "2026-09-16T00:00:00Z", deliveryDateMax: "2026-09-16", transitDaysMin: 1, transitDaysMax: 1 };
  assert.equal(deliveryContractOf(gleich).kind, "date");
  assert.equal(deliveryInfo(gleich).value, "16.09.2026");
  assert.equal(deliveryInfo({ deliveryDate: "2026-09-18" }).value, "18.09.2026");
  assert.equal(deliveryInfo({ deliveryDate: "2026-09-18" }).label, "Zustellung");
  const nichts = deliveryInfo({});
  assert.deepEqual(nichts, { label: "Zustellung", value: DELIVERY_ON_REQUEST, until: null, isRange: false });
  assert.equal(deliveryContractOf(null).kind, "unknown");
  assert.equal(deliveryContractOf({ deliveryTimeUntil: "bis 12:00" }).until, "bis 12:00");
});

test("E4 — der Zustellvertrag rechnet kein Datum und kennt keine Einkaufsquelle", () => {
  const modul = code("utils/deliveryContractView.mjs");
  for (const verboten of ["new Date", "Date.now", "setDate", "addDays", "getDate"]) {
    assert.ok(!modul.includes(verboten), `der Zustellvertrag rechnet mit „${verboten}"`);
  }
  assert.ok(!/transglobal|jumingo|provider/i.test(modul));
});

test("E5 — Karte, ausgewähltes Angebot, Live- und Sticky-Leiste zeigen dieselbe Beschriftung", () => {
  const karte = code(KARTE);
  const ende = karte.slice(karte.indexOf("function buildEnd"), karte.indexOf("function DetailRow"));
  assert.match(ende, /const zustellung = deliveryContractOf\(t\);\s*const title = zustellung\.label;/);
  assert.ok(!/title = "Lieferung"|title = "Voraussichtliche Laufzeit"/.test(ende), "die Karte benennt den Knoten wieder selbst");
  const details = karte.slice(karte.indexOf("function DetailsPanel"), karte.indexOf("function OfferCardBase"));
  assert.match(details, /const zustellung = deliveryContractOf\(t\);/);
  for (const zeile of ['label="Zustellzeitraum"', 'label="Zustelltermin"', 'label="Zustellung"']) {
    assert.ok(details.includes(zeile), `Detailzeile ${zeile} fehlt`);
  }
  assert.ok(!/label="Liefer/.test(details), "im Detailbereich steht wieder eine „Liefer…“-Beschriftung");
  assert.match(code(AUSWAHL), /<dt>\{zustellung\.label\}<\/dt>/);
  assert.match(code(LIVE), /<span className="blsum-label">\{zustellung\.label\}<\/span>/);
  assert.match(code(STICKY), /<span className="bsum-delivery-label">\{delivery\.label\}<\/span>/);
  for (const datei of [AUSWAHL, LIVE, STICKY]) {
    assert.ok(!/deliveryDateMin|deliveryDateMax|deliveryTimeUntil|transitDays/.test(code(datei)),
      `${datei} leitet die Zustellung wieder selbst ab`);
  }
});

/* ══════════ §F  ABHOLUNG — FENSTER ODER „BEREIT AB“ ══════════════════════════════ */

test("F1 — TG22: Tag und „bereit ab 09:00 Uhr“; eine Fensterwahl gilt dort nicht", () => {
  assert.deepEqual({ ...pickupSummaryOf(TG22, null) }, { day: "2026-09-15", time: "bereit ab 09:00 Uhr" });
  assert.deepEqual({ ...pickupSummaryOf(TG22, { from: "10:00", until: "12:00" }) },
    { day: "2026-09-15", time: "bereit ab 09:00 Uhr" }, "aus einer Wahl entstand bei „bereit ab“ eine Endzeit");
});

test("F2 — mit echtem Fenster: Carrierfenster, nach Wahl das gewählte Fenster", () => {
  assert.deepEqual({ ...pickupSummaryOf(JUMINGO, null) }, { day: "2026-09-15T00:00:00Z", time: "09:00–17:00 Uhr" });
  assert.deepEqual({ ...pickupSummaryOf(JUMINGO, { from: "10:00", until: "12:00" }) },
    { day: "2026-09-15T00:00:00Z", time: "10:00–12:00 Uhr" });
  assert.equal(pickupSummaryOf(JUMINGO, { from: "10:00" }).time, "09:00–17:00 Uhr", "ein halbes Fenster wurde übernommen");
  assert.deepEqual({ ...pickupSummaryOf(null, null) }, { day: null, time: null });
});

test("F3 — ausgewähltes Angebot und Live-Leiste lesen den Abholvertrag, nicht die Rohfelder", () => {
  for (const datei of [AUSWAHL, LIVE]) {
    const src = code(datei);
    assert.match(src, /pickupSummaryOf\(tariff, pickupWindow\)/, `${datei} liest den Abholvertrag nicht`);
    assert.ok(!/collectionReadyFrom|collectionDate|pickupTimeFrom|pickupTimeUntil|pickupDate/.test(src),
      `${datei} bildet die Abholzeile wieder selbst`);
  }
});

/* ══════════ §G  LABELANGABEN — EIN ÜBERSETZER ═════════════════════════════════════ */

test("G1 — Kundennamen: A4 → DIN A4, A6 → DIN A6, THERMAL/Thermal → Thermodruck, PDF → PDF", () => {
  assert.equal(labelSizeName("A4"), "DIN A4");
  assert.equal(labelSizeName(" a6 "), "DIN A6");
  assert.equal(labelSizeName("THERMAL"), "Thermodruck");
  assert.equal(labelSizeName("Thermal"), "Thermodruck");
  assert.equal(labelFileFormatName("PDF"), "PDF");
  assert.equal(labelFileFormatName("pdf"), "PDF");
  for (const roh of ["ZPL", "Letter", "", null, 4, "constructor", "__proto__"]) {
    assert.equal(labelSizeName(roh), null, String(roh));
    assert.equal(labelFileFormatName(roh), null, String(roh));
  }
});

test("G2 — TG22: Karte „PDF · DIN A4 / Thermodruck“, Buchung „Versandlabel verfügbar als DIN A4 und Thermodruck“", () => {
  assert.equal(labelCapabilityLine(TG22), "PDF · DIN A4 / Thermodruck");
  assert.equal(labelDeliveryInfo(TG22), "Versandlabel verfügbar als DIN A4 und Thermodruck");
  // Unbekannte Rohwerte erscheinen nicht — und nie als Rohschreibweise.
  assert.equal(labelCapabilityLine({ labelFormats: ["PDF", "ZPL"], labelSizes: ["A4", "Letter"] }), "PDF · DIN A4");
  assert.equal(labelCapabilityLine({ labelFormats: ["ZPL"], labelSizes: ["Letter"] }), null);
  assert.doesNotMatch(labelCapabilityLine(TG22), /Thermal\b/);
  assert.doesNotMatch(labelCapabilityLine(TG22), /(?<!DIN )A4/, "eine Größe steht ohne Kundennamen da");
});

test("G3 — die A4/A6-Auswahl eines Angebots mit Formatwahl bleibt unverändert", () => {
  assert.deepEqual(labelFormatOptionsOf(JUMINGO), ["A4", "A6"]);
  assert.deepEqual(labelFormatOptionsOf(TG22), []);
});

/* ══════════ §H  LEISTUNGSNAME, TARIF-ID, WHITE LABEL ═════════════════════════════ */

test("H1 — der Leistungsname kommt aus dem Angebot („Standardversand“), ohne Providerzweig", () => {
  const karte = lies("utils/carrierMap.js");
  const fn = karte.slice(karte.indexOf("export function publicServiceName"), karte.indexOf("export function publicCarrierChipLabel"));
  assert.match(fn, /const s = tariff\?\.publicServiceName;\s*if \(typeof s === "string" && s\.trim\(\)\) return s\.trim\(\);/);
  assert.ok(!/transglobal|jumingo|provider/i.test(ohneKommentar(fn)));
  assert.match(karte, /standard: "Standardversand"/);
});

test("H2 — Produktentscheidung Tarif-ID: sichtbar für Angebote MIT Tarifkennung, nie als Rohfeldname", () => {
  const karte = code(KARTE);
  assert.match(karte, /const tariffId = t\.shipper_tariff_id \?\? t\.id \?\? null;/);
  assert.match(karte, /if \(tariffId != null\)\s+features\.push\(\{ icon: "info",\s+label: "Tarif-ID",/);
  // Das Label ist „Tarif-ID“ — der technische Feldname steht nie als Text im JSX.
  assert.ok(!/>\s*shipper_tariff_id|label: "shipper_tariff_id"|"shipper_tariff_id"/.test(karte));
  assert.ok(!/jumingo|transglobal/i.test(karte), "die Karte nennt eine Einkaufsquelle");
  // Das öffentliche TG22-Angebot trägt weder Tarif-ID noch ServiceID — dort entsteht keine Zeile.
  for (const feld of ["id", "shipper_tariff_id", "serviceId", "providerServiceRef", "provider"]) {
    assert.ok(!(feld in TG22), `das TG22-Angebot trägt „${feld}"`);
  }
  assert.equal(JUMINGO.shipper_tariff_id ?? JUMINGO.id, 3708);
});

test("H3 — kein Einkaufsname in den Vertragsmodulen und Buchungsflächen dieses Pakets", () => {
  for (const datei of ["utils/deliveryContractView.mjs", "utils/acceptedOfferPrice.mjs", "utils/bookingSummaryView.mjs",
                       "utils/pickupContractView.mjs", "utils/priceChangeView.mjs", "utils/labelFormatOptions.mjs",
                       AUSWAHL, LIVE, STICKY, SUMME, AKTION]) {
    assert.ok(!/transglobal|jumingo/i.test(code(datei)), `${datei} nennt eine Einkaufsquelle`);
  }
});
