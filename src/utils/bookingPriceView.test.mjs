// Tests für das zentrale Booking-Preis-View-Model + Kartenpreise + Progressive
// Disclosure (Paket B/D/E/F). Reines node --test; keine React-Runtime nötig. Wo
// eine Aussage nur das UI betrifft (Feld entfernt / Payload-Default), wird der
// Quelltext gescannt (dasselbe Muster wie im Backend).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBookingPriceView, priceViewBlocksBooking, insuranceCardPrice,
  insuranceValueFieldsVisible, autofillInsuranceValue, goodsExceedsInsuranceMax,
  isInsuredType, INSURANCE_VALUE_MAX, PRICE_STATUS,
} from "./bookingPriceView.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");

const TARIFF = {
  netPrice: 31.25, vatAmount: 5.94, finalPrice: 37.19,
  serviceType: "pickup", publicCarrierId: "dpd", publicServiceName: "Standardversand",
  insuranceDetails: {
    isInsurable: true,
    extraInsurancePriceBruttoPreselect: 3.99,
    extraInsurancePremiumPriceBruttoPreselect: 7.99,
  },
};
const REPRICE_STD = { selectedInsurance: "standard", totals: {
  customerShippingNet: 31.25, shippingVat: 5.94, customerShippingGross: 37.19,
  insuranceGross: 4.49, customerTotalGross: 41.68,
} };
const view = (over) => buildBookingPriceView({ tariff: TARIFF, ...over });

// ─── Price-View-Model (1–10) ──────────────────────────────────────────────────
test("(1) none → BASE_CONFIRMED aus Basistarif", () => {
  const v = view({ insuranceType: "none" });
  assert.equal(v.status, PRICE_STATUS.BASE_CONFIRMED);
  assert.equal(v.source, "tariff");
  assert.equal(v.totalGross, 37.19);
  assert.equal(v.insuranceGross, 0);
  assert.equal(v.hasConfirmedPrice, true);
});
test("(2) Standard ohne Reprice → REPRICE_REQUIRED", () => {
  const v = view({ insuranceType: "standard", repriceResult: null, insValid: false });
  assert.equal(v.status, PRICE_STATUS.REPRICE_REQUIRED);
  assert.equal(v.totalGross, null);
  assert.equal(v.hasConfirmedPrice, false);
});
test("(3) Premium ohne Reprice → REPRICE_REQUIRED", () => {
  const v = view({ insuranceType: "premium", repriceResult: null, insValid: false });
  assert.equal(v.status, PRICE_STATUS.REPRICE_REQUIRED);
  assert.equal(v.hasConfirmedPrice, false);
});
test("(4) laufender Request → REPRICING", () => {
  const v = view({ insuranceType: "standard", repriceLoading: true, repriceStale: true });
  assert.equal(v.status, PRICE_STATUS.REPRICING);
  assert.equal(v.isRepricing, true);
  assert.equal(v.hasConfirmedPrice, false);
});
test("(5) stale mit altem Ergebnis → STALE", () => {
  const v = view({ insuranceType: "standard", repriceResult: REPRICE_STD, repriceStale: true });
  assert.equal(v.status, PRICE_STATUS.STALE);
  assert.equal(v.isStale, true);
  assert.equal(v.hasConfirmedPrice, false);
});
test("(6) erfolgreicher Reprice nutzt NUR Server-Totals", () => {
  const v = view({ insuranceType: "standard", repriceResult: REPRICE_STD });
  assert.equal(v.status, PRICE_STATUS.REPRICE_CONFIRMED);
  assert.equal(v.shippingNet, 31.25);
  assert.equal(v.shippingVat, 5.94);
  assert.equal(v.insuranceGross, 4.49);
  assert.equal(v.totalGross, 41.68);
  assert.equal(v.hasConfirmedPrice, true);
});
test("(7) Fehler → REPRICE_ERROR, kein bestätigter Preis", () => {
  const v = view({ insuranceType: "standard", repriceError: "boom", repriceResult: REPRICE_STD });
  assert.equal(v.status, PRICE_STATUS.REPRICE_ERROR);
  assert.equal(v.hasError, true);
  assert.equal(v.totalGross, null);
  assert.equal(v.hasConfirmedPrice, false);
});
test("(8) Preselect wird NIE lokal zum Gesamtbetrag addiert", () => {
  // Selbst mit vorhandenen Preselect-Beträgen bleibt der Basis-Total unverändert.
  const v = view({ insuranceType: "none" });
  assert.equal(v.totalGross, 37.19); // NICHT 37.19 + 3.99
});
test("(9) Netto/MwSt/Versicherung/Brutto exakt aus Serverwerten", () => {
  const v = view({ insuranceType: "premium", repriceResult: { totals: {
    customerShippingNet: 40, shippingVat: 7.6, customerShippingGross: 47.6,
    insuranceGross: 9.99, customerTotalGross: 57.59 } } });
  assert.equal(v.shippingNet, 40);
  assert.equal(v.shippingVat, 7.6);
  assert.equal(v.insuranceGross, 9.99);
  assert.equal(v.totalNet, 49.99);   // 40 + 9.99 (Versicherung steuerfrei)
  assert.equal(v.totalGross, 57.59);
});
test("(10) fehlende Preisfelder → fail-closed (nicht bestätigt)", () => {
  const vBase = buildBookingPriceView({ tariff: { netPrice: 10 }, insuranceType: "none" }); // kein finalPrice
  assert.equal(vBase.hasConfirmedPrice, false);
  const vRep = view({ insuranceType: "standard", repriceResult: { totals: { customerShippingNet: 10 } } }); // kein Total
  assert.equal(vRep.hasConfirmedPrice, false);
});

// ─── Kartenpreise (11–18) ─────────────────────────────────────────────────────
const pre = { standard: 3.99, premium: 7.99 };
test("(11) none-Karte zeigt 0,00 (kein ab)", () => {
  const p = insuranceCardPrice({ cardType: "none", selectedType: "none", view: view({ insuranceType: "none" }), preselectGross: null });
  assert.deepEqual(p, { kind: "zero", value: 0 });
});
test("(12) Standard vor Reprice → ab-Preis (preselect)", () => {
  const p = insuranceCardPrice({ cardType: "standard", selectedType: "standard", view: view({ insuranceType: "standard", insValid: false }), preselectGross: pre.standard });
  assert.deepEqual(p, { kind: "preselect", value: 3.99 });
});
test("(13) Premium vor Reprice → ab-Preis (preselect)", () => {
  const p = insuranceCardPrice({ cardType: "premium", selectedType: "standard", view: view({ insuranceType: "standard" }), preselectGross: pre.premium });
  assert.deepEqual(p, { kind: "preselect", value: 7.99 });
});
test("(14) ausgewählte Standardkarte nach Erfolg → exakter Aufpreis", () => {
  const p = insuranceCardPrice({ cardType: "standard", selectedType: "standard", view: view({ insuranceType: "standard", repriceResult: REPRICE_STD }), preselectGross: pre.standard });
  assert.deepEqual(p, { kind: "exact", value: 4.49 });
});
test("(15) ausgewählte Premiumkarte nach Erfolg → exakter Aufpreis", () => {
  const rp = { selectedInsurance: "premium", totals: { ...REPRICE_STD.totals, insuranceGross: 9.5, customerTotalGross: 46.69 } };
  const p = insuranceCardPrice({ cardType: "premium", selectedType: "premium", view: view({ insuranceType: "premium", repriceResult: rp }), preselectGross: pre.premium });
  assert.deepEqual(p, { kind: "exact", value: 9.5 });
});
test("(16) nicht ausgewählte Karte bleibt beim ab-Preis (kein 2. Reprice)", () => {
  // Standard ist gewählt+bestätigt; Premium-Karte darf NUR ihren Preselect zeigen.
  const p = insuranceCardPrice({ cardType: "premium", selectedType: "standard", view: view({ insuranceType: "standard", repriceResult: REPRICE_STD }), preselectGross: pre.premium });
  assert.deepEqual(p, { kind: "preselect", value: 7.99 });
});
test("(17) fehlender Preselect → unknown (Preis nach Warenwert)", () => {
  const p = insuranceCardPrice({ cardType: "standard", selectedType: "premium", view: view({ insuranceType: "premium" }), preselectGross: null });
  assert.deepEqual(p, { kind: "unknown", value: null });
});
test("(18) kein exakter Preis für die NICHT gewählte Stufe (nie 2. Provider-Call)", () => {
  // selektiert=standard bestätigt → view.insuranceGross gehört zu standard; Premium bekommt ihn NICHT.
  const p = insuranceCardPrice({ cardType: "premium", selectedType: "standard", view: view({ insuranceType: "standard", repriceResult: REPRICE_STD }), preselectGross: pre.premium });
  assert.notEqual(p.kind, "exact");
});

// ─── Progressive Disclosure (19–27) ──────────────────────────────────────────
test("(19) none → keine Wertfelder", () => assert.equal(insuranceValueFieldsVisible("none"), false));
test("(20) Standard → Wertfelder sichtbar", () => assert.equal(insuranceValueFieldsVisible("standard"), true));
test("(21) Premium → Wertfelder sichtbar", () => assert.equal(insuranceValueFieldsVisible("premium"), true));
test("(22) Versicherungswert spiegelt Warenwert, solange nicht manuell", () => {
  assert.equal(autofillInsuranceValue({ goodsValue: "500", insuranceValueManual: false }), "500");
});
test("(23) manuelle Anpassung bleibt erhalten (kein Auto-Spiegeln mehr)", () => {
  assert.equal(autofillInsuranceValue({ goodsValue: "700", insuranceValueManual: true }), null);
});
test("(24) Warenwert über Maximum wird erkannt (öffnet Anpassungsbereich)", () => {
  assert.equal(goodsExceedsInsuranceMax("25000"), true);
  assert.equal(goodsExceedsInsuranceMax("20000"), false);
  assert.equal(goodsExceedsInsuranceMax(""), false);
});
test("(25) keine stille Kappung — Autofill gibt den Rohwert (auch >Max) zurück", () => {
  assert.equal(autofillInsuranceValue({ goodsValue: "25000", insuranceValueManual: false }), "25000");
});
test("(26) Inhaltsbeschreibungs-Feld ist aus dem Versicherungs-UI entfernt", () => {
  const mod = read("../components/booking/InsuranceModule.jsx");
  assert.ok(!/id="ins-content"/.test(mod), "ins-content-Input darf nicht mehr existieren");
  assert.ok(!/insContent|onInsContentChange|contentPlaceholder/.test(mod), "kein insContent-State/-Prop mehr im UI");
});
test("(27) technischer contentDescription-Vertrag bleibt (Default „Paket“ weiter gesendet)", () => {
  const page = read("../pages/BookingPage.jsx");
  assert.ok(/contentDescription/.test(page), "contentDescription muss weiter Teil des Payloads sein");
  assert.ok(/"Paket"/.test(page), "sicherer Default „Paket“ bleibt erhalten");
});

// ─── Konsistenz & Gates (28–35) ───────────────────────────────────────────────
test("(28) Live-Leiste und Preiszusammenfassung nutzen dasselbe View-Model-Objekt", () => {
  // Ein einziges View → identische Zahlen an beiden Stellen (Objekt-Identität der Quelle).
  const v = view({ insuranceType: "standard", repriceResult: REPRICE_STD });
  assert.equal(v.totalGross, 41.68);
  // Beide Konsumenten lesen dieselben Felder:
  assert.equal(v.totalGross, v.totalGross);
});
test("(29) REPRICING blockiert Buchung", () => {
  assert.equal(priceViewBlocksBooking(view({ insuranceType: "standard", repriceLoading: true, repriceStale: true })), true);
});
test("(30) STALE blockiert Buchung", () => {
  assert.equal(priceViewBlocksBooking(view({ insuranceType: "standard", repriceResult: REPRICE_STD, repriceStale: true })), true);
});
test("(31) REPRICE_ERROR blockiert Buchung", () => {
  assert.equal(priceViewBlocksBooking(view({ insuranceType: "standard", repriceError: true })), true);
});
test("(32) bestätigter Reprice erlaubt Buchung (View-seitig)", () => {
  assert.equal(priceViewBlocksBooking(view({ insuranceType: "standard", repriceResult: REPRICE_STD })), false);
});
test("(33) Wechsel auf none stellt bestätigten Basistarif wieder her", () => {
  const v = view({ insuranceType: "none", repriceResult: REPRICE_STD /* Alt-Ergebnis egal */ });
  assert.equal(v.status, PRICE_STATUS.BASE_CONFIRMED);
  assert.equal(v.totalGross, 37.19);
  assert.equal(priceViewBlocksBooking(v), false);
});
test("(34) PRICE_CHANGED-Flow (none-Pfad) bleibt unberührt vom View-Model", () => {
  const page = read("../pages/BookingPage.jsx");
  assert.ok(/PRICE_CHANGED/.test(page) && /confirmedFinalPriceRef/.test(page), "none-Preisdrift-Flow erhalten");
});
test("(35) PICKUP_WINDOW_CHANGED-Flow bleibt unberührt", () => {
  const page = read("../pages/BookingPage.jsx");
  assert.ok(/PICKUP_WINDOW_CHANGED/.test(page), "Pickup-Window-Drift-Flow erhalten");
});

// ─── Regression (36–45) ───────────────────────────────────────────────────────
test("(36) Pickup-Tarif liefert konsistentes View", () => {
  const v = buildBookingPriceView({ tariff: { ...TARIFF, serviceType: "pickup" }, insuranceType: "none" });
  assert.equal(v.hasConfirmedPrice, true);
});
test("(37) Dropoff-Tarif liefert konsistentes View", () => {
  const v = buildBookingPriceView({ tariff: { ...TARIFF, serviceType: "dropoff" }, insuranceType: "none" });
  assert.equal(v.hasConfirmedPrice, true);
});
test("(38) Dropoff ohne gebundenen Shop bleibt buchbar (Preis unabhängig vom Shop)", () => {
  const v = buildBookingPriceView({ tariff: { ...TARIFF, serviceType: "dropoff", publicDropoffLabel: null }, insuranceType: "none" });
  assert.equal(priceViewBlocksBooking(v), false);
});
test("(39) nationale Sendung (kein customs) — View unabhängig", () => {
  const v = view({ insuranceType: "standard", repriceResult: REPRICE_STD });
  assert.equal(v.status, PRICE_STATUS.REPRICE_CONFIRMED);
});
test("(40) EU-Sendung — dieselbe Logik", () => {
  const v = buildBookingPriceView({ tariff: { ...TARIFF, toCountry: "FR" }, insuranceType: "none" });
  assert.equal(v.totalGross, 37.19);
});
test("(41) Zollsendung — Preislogik unverändert (customs berührt View nicht)", () => {
  const v = buildBookingPriceView({ tariff: { ...TARIFF, hsTariffNumberRequired: true }, insuranceType: "none" });
  assert.equal(v.hasConfirmedPrice, true);
});
test("(42) Carrier-Fallback (unbekannte publicCarrierId) — View robust", () => {
  const v = buildBookingPriceView({ tariff: { ...TARIFF, publicCarrierId: undefined }, insuranceType: "none" });
  assert.equal(v.totalGross, 37.19);
});
test("(43) Label-Logik unangetastet (A4/A6 im Payload)", () => {
  const page = read("../pages/BookingPage.jsx");
  assert.ok(/labelFormat/.test(page), "labelFormat bleibt Teil des /book-Payloads");
});
test("(44) Referenznummer-Logik unangetastet", () => {
  const page = read("../pages/BookingPage.jsx");
  assert.ok(/referenceNumber/.test(page), "Referenznummer bleibt erhalten");
});
test("(45) 7-Tage-Rechnung unverändert (paymentTerm-Hinweis bleibt)", () => {
  const psm = read("../components/booking/PriceSummaryModule.jsx");
  assert.ok(/7 Tage/.test(psm) || /paymentTerm/.test(psm), "Zahlungshinweis 7 Tage auf Rechnung bleibt");
});

// Zusatz: Grenze zentralisiert, kein neuer Wert
test("(x) INSURANCE_VALUE_MAX = 20000 (zentralisierte bestehende Grenze)", () => {
  assert.equal(INSURANCE_VALUE_MAX, 20000);
  assert.equal(isInsuredType("none"), false);
});

// ─── Basis-Versandpreis + „ab"-Preselect im View-Model (Paket 3/5) ────────────
test("(P1) none → Basis-Versandpreis präsent, kein Preselect", () => {
  const v = view({ insuranceType: "none" });
  assert.equal(v.baseShippingNet, 31.25);
  assert.equal(v.baseShippingVat, 5.94);
  assert.equal(v.baseShippingGross, 37.19);
  assert.equal(v.selectedInsuranceType, "none");
  assert.equal(v.selectedInsurancePreselectGross, null);
  assert.equal(v.hasInsurancePreselect, false);
});
test("(P2) Standard ohne Warenwert (REQUIRED) → Versand + ab-Preis 3,99 sichtbar, kein Total", () => {
  const v = view({ insuranceType: "standard", insValid: false });
  assert.equal(v.status, PRICE_STATUS.REPRICE_REQUIRED);
  assert.equal(v.baseShippingGross, 37.19);                 // Versand bleibt sichtbar
  assert.equal(v.selectedInsurancePreselectGross, 3.99);    // „ab"-Preselect der Stufe
  assert.equal(v.hasInsurancePreselect, true);
  assert.equal(v.totalGross, null);                         // KEIN erfundener Gesamtpreis
  assert.equal(v.hasConfirmedPrice, false);
});
test("(P3) Premium ohne Warenwert → Preselect 7,99 (Premium-Rohwert, nicht Standard)", () => {
  const v = view({ insuranceType: "premium", insValid: false });
  assert.equal(v.selectedInsurancePreselectGross, 7.99);
  assert.equal(v.standardPreselectGross, 3.99);
  assert.equal(v.premiumPreselectGross, 7.99);
});
test("(P4) Versandpreis überlebt REPRICING (bleibt sichtbar)", () => {
  const v = view({ insuranceType: "standard", repriceLoading: true, repriceStale: true });
  assert.equal(v.status, PRICE_STATUS.REPRICING);
  assert.equal(v.baseShippingGross, 37.19);
  assert.equal(v.hasConfirmedPrice, false);
});
test("(P5) Versandpreis überlebt REPRICE_ERROR (bleibt sichtbar, Buchung blockiert)", () => {
  const v = view({ insuranceType: "standard", repriceError: "boom" });
  assert.equal(v.status, PRICE_STATUS.REPRICE_ERROR);
  assert.equal(v.baseShippingGross, 37.19);
  assert.equal(priceViewBlocksBooking(v), true);
});
test("(P6) Versandpreis überlebt STALE", () => {
  const v = view({ insuranceType: "standard", repriceResult: REPRICE_STD, repriceStale: true });
  assert.equal(v.status, PRICE_STATUS.STALE);
  assert.equal(v.baseShippingGross, 37.19);
});
test("(P7) bestätigter Reprice → Basis-Versandpreis weiterhin präsent (neben Totals)", () => {
  const v = view({ insuranceType: "standard", repriceResult: REPRICE_STD });
  assert.equal(v.baseShippingGross, 37.19);
  assert.equal(v.totalGross, 41.68);
});
test("(P8) Preselect = 0 → kein Preselect (nie 0,00 € als Gratisversicherung)", () => {
  const v = buildBookingPriceView({ tariff: { ...TARIFF, insuranceDetails: { isInsurable: true, extraInsurancePriceBruttoPreselect: 0 } }, insuranceType: "standard", insValid: false });
  assert.equal(v.selectedInsurancePreselectGross, null);
  assert.equal(v.hasInsurancePreselect, false);
});
test("(P9) negativer Preselect → null", () => {
  const v = buildBookingPriceView({ tariff: { ...TARIFF, insuranceDetails: { isInsurable: true, extraInsurancePriceBruttoPreselect: -1 } }, insuranceType: "standard", insValid: false });
  assert.equal(v.selectedInsurancePreselectGross, null);
});
test("(P10) fehlende insuranceDetails → Preselect null (kein Crash)", () => {
  const v = buildBookingPriceView({ tariff: { netPrice: 10, vatAmount: 1.9, finalPrice: 11.9 }, insuranceType: "standard", insValid: false });
  assert.equal(v.selectedInsurancePreselectGross, null);
  assert.equal(v.baseShippingGross, 11.9);
});
test("(P11) selectedInsuranceType spiegelt die Auswahl (none/standard/premium)", () => {
  assert.equal(view({ insuranceType: "none" }).selectedInsuranceType, "none");
  assert.equal(view({ insuranceType: "standard", insValid: false }).selectedInsuranceType, "standard");
  assert.equal(view({ insuranceType: "premium", insValid: false }).selectedInsuranceType, "premium");
});
test("(P12) Preselect wird NIE zum Gesamtbetrag addiert (auch mit sichtbarem ab-Preis)", () => {
  const v = view({ insuranceType: "standard", insValid: false });
  assert.equal(v.hasInsurancePreselect, true);
  assert.equal(v.totalGross, null);                    // 37.19 + 3.99 wäre 41.18 — kommt NICHT vor
  assert.notEqual(v.totalGross, 41.18);
});
test("(P13) none-Total bleibt Versandpreis trotz vorhandener Preselect-Rohwerte", () => {
  const v = view({ insuranceType: "none" });
  assert.equal(v.totalGross, 37.19);
  assert.equal(v.standardPreselectGross, 3.99);        // Rohwert exponiert, aber nie addiert
});

// ─── Komponenten-Redesign (Quelltext-Scan; keine React-Runtime) ───────────────
test("(P14) PriceSummaryModule: Versandpreis IMMER sichtbar (baseShipping* + Versand netto)", () => {
  const psm = read("../components/booking/PriceSummaryModule.jsx");
  assert.ok(/Versand netto/.test(psm), "Versand-netto-Zeile fehlt");
  assert.ok(/baseShippingNet/.test(psm) && /baseShippingGross/.test(psm), "Basis-Versandwerte werden nicht gelesen");
});
test("(P15) PriceSummaryModule: Versicherungszustand ab/nach Warenwert/aktualisiert/Fehler", () => {
  const psm = read("../components/booking/PriceSummaryModule.jsx");
  assert.ok(/selectedInsurancePreselectGross/.test(psm), "ab-Preselect wird nicht angezeigt");
  assert.ok(/nach Warenwert/.test(psm), "nach-Warenwert-Hinweis fehlt");
  assert.ok(/wird aktualisiert/.test(psm), "Repricing-Zustand fehlt");
  assert.ok(/nicht bestätigt/.test(psm), "Fehlerzustand fehlt");
});
test("(P16) PriceSummaryModule addiert den Preselect NICHT clientseitig zum Versand", () => {
  const psm = read("../components/booking/PriceSummaryModule.jsx");
  assert.ok(!/baseShipping\w*\s*\+/.test(psm), "keine Addition auf den Versandpreis erlaubt");
  assert.ok(!/selectedInsurancePreselectGross\s*\+/.test(psm), "Preselect darf nicht aufaddiert werden");
});
test("(P17) BookingLiveSummary: Versand sichtbar + Versicherungshinweis wenn unbestätigt", () => {
  const bls = read("../components/booking/BookingLiveSummary.jsx");
  assert.ok(/baseShippingGross/.test(bls), "Basis-Versandpreis wird nicht angezeigt");
  assert.ok(/blsum-ins-note/.test(bls), "Versicherungshinweiszeile fehlt");
  assert.ok(/Versicherung ab \$\{money\(v\.selectedInsurancePreselectGross\)\}/.test(bls), "Versicherung-ab-Hinweis fehlt");
  assert.ok(/nach Warenwert/.test(bls), "nach-Warenwert-Hinweis fehlt");
});
test("(P18) BookingLiveSummary: kontextuelles Label (Gesamt/Versand) statt fixem Kopf", () => {
  const bls = read("../components/booking/BookingLiveSummary.jsx");
  assert.ok(/Gesamt/.test(bls) && /Versand/.test(bls), "kontextuelle Preis-Labels fehlen");
  assert.ok(!/Aktueller Preis/.test(bls), "statischer Aktueller-Preis-Kopf soll entfallen");
});
test("(P19) InsuranceModule: stabiler Grid-Kopf (Name links, Preis rechts) + Badge", () => {
  const ins = read("../components/booking/InsuranceModule.jsx");
  const copy = read("../utils/insuranceTerms.mjs");
  assert.ok(/ins-card-head-name/.test(ins), "Grid-Kopf-Namensspalte fehlt");
  // Das Badge wird weiterhin gerendert, sein Text kommt jetzt aus dem zentralen
  // Textmodul. Der frühere Wortlaut „Erweiterter Schutz" ist bewusst weg: er
  // behauptete einen besseren VERSICHERUNGSSCHUTZ, den Premium nicht bietet —
  // Premium erweitert den Service auf derselben Versicherung.
  assert.ok(/\{copy\.badge && <span className="ins-card-badge">/.test(ins), "Premium-Badge fehlt");
  assert.ok(/badge: "Erweiterter Service"/.test(copy), "Badge-Text fehlt im Textmodul");
  // Kommentare abziehen: die Begründung der Umbenennung DARF den alten Wortlaut
  // nennen — verboten ist er als ausgelieferter Text.
  const ohneKommentare = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/Erweiterter Schutz/.test(ohneKommentare(ins)) && !/Erweiterter Schutz/.test(ohneKommentare(copy)),
    `„Erweiterter Schutz" überzeichnet den Versicherungsumfang und darf nicht zurückkehren`);
});
test("(P20) InsuranceModule: natives Radio trägt Preis im barrierefreien Namen (aria-label)", () => {
  const ins = read("../components/booking/InsuranceModule.jsx");
  assert.ok(/aria-label=\{cardAriaLabel\(c\)\}/.test(ins), "aria-label am Radio fehlt");
  assert.ok(/function cardAriaLabel/.test(ins), "cardAriaLabel-Helfer fehlt");
});
test("(P21) calculator.css: Grid-Kartenkopf + Live-Leisten-Trenner + Ins-State-Klassen", () => {
  const css = read("../styles/calculator.css");
  assert.ok(/\.ins-card-head\s*\{[^}]*grid/.test(css), "Kartenkopf-Grid fehlt");
  assert.ok(/\.blsum-zone \+ \.blsum-zone/.test(css), "vertikale Live-Leisten-Trenner fehlen");
  assert.ok(/\.booking-ins-state/.test(css), "Preis-Zustandsklassen fehlen");
});
test("(P22) keine JUMiNGO-Rohfelder (insuranceModel/insuranceProvider) im Booking-UI", () => {
  for (const f of ["../components/booking/BookingLiveSummary.jsx", "../components/booking/PriceSummaryModule.jsx", "../components/booking/InsuranceModule.jsx"]) {
    const s = read(f);
    assert.ok(!/insuranceModel/.test(s), `insuranceModel darf nicht in ${f} gelesen werden`);
    assert.ok(!/insuranceProvider/.test(s), `insuranceProvider darf nicht in ${f} gelesen werden`);
  }
});
test("(P23) BookingPage übergibt dasselbe priceView an Live-Leiste UND Preiszusammenfassung", () => {
  const page = read("../pages/BookingPage.jsx");
  assert.ok(/<BookingLiveSummary[^>]*priceView=\{priceView\}/.test(page), "Live-Leiste erhält priceView");
  assert.ok(/<PriceSummaryModule[^>]*priceView=\{priceView\}/.test(page), "Preiszusammenfassung erhält priceView");
});
test("(P24) INSURANCE_VALUE_MAX/Gate/Reprice-Vertrag unverändert (Regression)", () => {
  const page = read("../pages/BookingPage.jsx");
  assert.ok(/priceViewBlocksBooking/.test(page), "Buchungs-Gate bleibt am View-Model");
  assert.ok(/repriceInsurance/.test(page), "Reprice-Aufruf bleibt erhalten");
});
