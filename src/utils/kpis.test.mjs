// Tests für die Dashboard-KPI-Logik (Tracking-Modell, Phase 3).
// Läuft ohne zusätzliche Abhängigkeit über Node's eingebauten Test-Runner:
//   node --test src/utils/kpis.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeKpis, isActive, isInTransit, isDelivered, isDelayed,
  TRACKING_IN_TRANSIT, TRACKING_DELIVERED,
} from "./kpis.mjs";

// Fixer „heute": Montag, 6. Juli 2026, 12:00 lokal.
const NOW = new Date("2026-07-06T12:00:00");
const ETA_YESTERDAY = "2026-07-05";
const ETA_TODAY     = "2026-07-06";
const ETA_TOMORROW  = "2026-07-07";
const ETA_FAR_PAST  = "2026-06-30";

// ── KPI 2 · In Zustellung: nur tracking_status === "in_transit" ──────────────
test("In Zustellung zählt nur tracking_status === 'in_transit'", () => {
  assert.equal(isInTransit({ tracking_status: TRACKING_IN_TRANSIT }), true);
  assert.equal(isInTransit({ tracking_status: "IN_TRANSIT" }), true, "case-insensitiv");
  assert.equal(isInTransit({ tracking_status: " in_transit " }), true, "getrimmt");
  assert.equal(isInTransit({ tracking_status: TRACKING_DELIVERED }), false);
  assert.equal(isInTransit({ tracking_status: null }), false, "NULL zählt nicht");
  assert.equal(isInTransit({ status: "in_transit" }), false, "Business-Status zählt NICHT mehr");
  assert.equal(isInTransit({}), false);
});

// ── KPI 3 · Zugestellt: nur tracking_status === "delivered" ──────────────────
test("Zugestellt zählt nur tracking_status === 'delivered'", () => {
  assert.equal(isDelivered({ tracking_status: TRACKING_DELIVERED }), true);
  assert.equal(isDelivered({ tracking_status: " Delivered " }), true, "getrimmt + case-insensitiv");
  assert.equal(isDelivered({ tracking_status: TRACKING_IN_TRANSIT }), false);
  assert.equal(isDelivered({ tracking_status: null }), false, "NULL zählt nicht");
  assert.equal(isDelivered({ status: "delivered" }), false, "Business-Status zählt NICHT mehr");
  assert.equal(isDelivered({}), false);
});

// ── KPI 1 · Aktive Sendungen: offener Business-Status UND nicht zugestellt ────
test("Aktiv = offener Business-Status UND laut Tracking nicht zugestellt", () => {
  assert.equal(isActive({ status: "booked", tracking_status: null }), true, "gebucht, kein Tracking → aktiv");
  assert.equal(isActive({ status: "booked", tracking_status: TRACKING_IN_TRANSIT }), true, "unterwegs → aktiv");
  assert.equal(isActive({ status: "booked", tracking_status: TRACKING_DELIVERED }), false, "zugestellt → NICHT aktiv (Tracking überstimmt Business-Status)");
  assert.equal(isActive({ status: "label_ready", tracking_status: null }), true);
  assert.equal(isActive({ status: "delivered", tracking_status: null }), false, "Business-Endzustand nicht im Aktiv-Set");
  assert.equal(isActive({ status: "cancelled", tracking_status: null }), false);
  assert.equal(isActive({ status: null, tracking_status: TRACKING_IN_TRANSIT }), false, "ohne offenen Business-Status nicht aktiv");
  assert.equal(isActive({}), false);
});

// ── KPI 4 · Verzögert: nicht zugestellt + ETA vorhanden + heute > ETA ────────
test("Verzögert: ETA in der Vergangenheit, nicht zugestellt", () => {
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: ETA_YESTERDAY }, NOW), true);
  assert.equal(isDelayed({ tracking_status: null, delivery_date_max: ETA_FAR_PAST }, NOW), true, "tracking_status NULL + überschrittene ETA → verzögert");
});

test("Verzögert NICHT bei fehlender ETA", () => {
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: null }, NOW), false);
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT }, NOW), false, "delivery_date_max fehlt ganz");
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: "" }, NOW), false);
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: "kein-datum" }, NOW), false, "unparsbare ETA");
});

test("Verzögert NICHT wenn zugestellt (auch bei überschrittener ETA)", () => {
  assert.equal(isDelayed({ tracking_status: TRACKING_DELIVERED, delivery_date_max: ETA_YESTERDAY }, NOW), false);
});

test("Verzögert NICHT bei ETA heute oder morgen", () => {
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: ETA_TODAY }, NOW), false, "ETA = heute → noch nicht verzögert");
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: ETA_TOMORROW }, NOW), false, "ETA = morgen → nicht verzögert");
});

test("Verzögert: ISO-Datetime-ETA wird datumsgenau (ohne Zeit/TZ) verglichen", () => {
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: "2026-07-05T23:59:59Z" }, NOW), true, "gestern (mit Zeitanteil) → verzögert");
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: "2026-07-06T00:00:00Z" }, NOW), false, "heute (mit Zeitanteil) → nicht verzögert");
});

// ── NULL-/Robustheit: keine Abstürze, keine Falschwerte ──────────────────────
test("Robust gegen NULL/leere Eingaben — keine Abstürze, alles 0", () => {
  for (const input of [undefined, null, [], [null], [undefined], [{}]]) {
    const k = computeKpis(input, NOW);
    assert.equal(k.active, 0);
    assert.equal(k.inTransit, 0);
    assert.equal(k.delivered, 0);
    assert.equal(k.delayed, 0);
  }
});

// ── Aggregat über eine gemischte Sendungsliste ───────────────────────────────
test("computeKpis aggregiert die vier Status-KPIs korrekt", () => {
  const shipments = [
    { status: "booked",      tracking_status: null },                                            // aktiv
    { status: "label_ready", tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: ETA_TOMORROW }, // aktiv + in Zustellung
    { status: "booked",      tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: ETA_YESTERDAY }, // aktiv + in Zustellung + verzögert
    { status: "booked",      tracking_status: TRACKING_DELIVERED,  delivery_date_max: ETA_YESTERDAY }, // zugestellt (nicht aktiv, nicht verzögert)
    { status: "delivered",   tracking_status: TRACKING_DELIVERED },                              // zugestellt
    { status: "cancelled",   tracking_status: null },                                            // nichts
  ];
  const k = computeKpis(shipments, NOW);
  assert.equal(k.active, 3,     "aktiv: 3 (booked/label_ready ohne Zustellung)");
  assert.equal(k.inTransit, 2,  "in Zustellung: 2 (tracking_status in_transit)");
  assert.equal(k.delivered, 2,  "zugestellt: 2 (tracking_status delivered)");
  assert.equal(k.delayed, 1,    "verzögert: 1 (in_transit, ETA gestern)");
});

// ── KPI 5 · Ausgaben (Monat): unverändert weiterhin korrekt ──────────────────
test("Ausgaben (Monat) bleiben unverändert: Summe price_final nach created_at-Monat", () => {
  const shipments = [
    { status: "booked", created_at: "2026-07-02", price_final: 18, tracking_status: null }, // dieser Monat
    { status: "booked", created_at: "2026-07-04", price_final: 12, tracking_status: null }, // dieser Monat
    { status: "booked", created_at: "2026-06-20", price_final: 40, tracking_status: null }, // Vormonat
    { status: "booked", created_at: "2026-07-01", price_final: 0,  tracking_status: null }, // 0 → ignoriert
  ];
  const k = computeKpis(shipments, NOW);
  assert.equal(k.spendThis, 30);
  assert.equal(k.spendPrev, 40);
  assert.equal(k.hasSpend, true);
  assert.equal(k.deltaPct, Math.round(((30 - 40) / 40) * 100)); // -25 %
});
