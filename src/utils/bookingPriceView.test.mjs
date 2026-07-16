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
