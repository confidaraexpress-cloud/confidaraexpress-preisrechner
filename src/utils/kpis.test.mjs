// Tests für die Dashboard-KPI-Logik (vier Karten).
// Läuft ohne zusätzliche Abhängigkeit über Node's eingebauten Test-Runner:
//   node --test src/utils/kpis.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeKpis, isActive, isInTransit, isDelivered, isDeliveredThisMonth, isDelayed, isCancelled,
  businessMonthKey, TRACKING_IN_TRANSIT, TRACKING_DELIVERED,
} from "./kpis.mjs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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
  assert.equal(isInTransit({ status: "in_transit" }), false, "Business-Status zählt NICHT");
  assert.equal(isInTransit({}), false);
});

test("In Zustellung ist unabhängig vom Monat und vom Monatskennzeichen", () => {
  // Eine Sendung aus dem Vormonat, die weiterhin unterwegs ist, zählt weiter.
  const alt = { status: "booked", tracking_status: TRACKING_IN_TRANSIT, created_at: "2026-05-02", delivered_this_month: false };
  assert.equal(isInTransit(alt), true);
  assert.equal(computeKpis([alt], NOW).inTransit, 1, "kein Monatsfilter auf „In Zustellung“");
});

// ── KPI 3 · Zugestellt: ausschließlich das serverseitige Monatskennzeichen ────
test("Zugestellt zählt NUR delivered_this_month === true", () => {
  assert.equal(isDeliveredThisMonth({ delivered_this_month: true }), true);
  assert.equal(isDeliveredThisMonth({ delivered_this_month: false }), false);
  assert.equal(isDeliveredThisMonth({ delivered_this_month: null }), false, "null zählt nicht");
  assert.equal(isDeliveredThisMonth({}), false, "fehlendes Feld zählt nicht");
  assert.equal(isDeliveredThisMonth(undefined), false);
  // Kein „truthy"-Fehlgriff: nur der echte Boolean true zählt.
  assert.equal(isDeliveredThisMonth({ delivered_this_month: "true" }), false, "String zählt nicht");
  assert.equal(isDeliveredThisMonth({ delivered_this_month: 1 }), false, "Zahl zählt nicht");
});

test("tracking_status='delivered' allein zählt NICHT mehr für „Zugestellt“", () => {
  // Der zentrale Verhaltenswechsel: früher hätte das mitgezählt (alle jemals
  // zugestellten Sendungen), jetzt entscheidet allein die serverseitige Monatsgrenze.
  const altZugestellt = { status: "booked", tracking_status: TRACKING_DELIVERED, delivered_this_month: false };
  assert.equal(computeKpis([altZugestellt], NOW).delivered, 0);
  const neuZugestellt = { status: "booked", tracking_status: TRACKING_DELIVERED, delivered_this_month: true };
  assert.equal(computeKpis([neuZugestellt], NOW).delivered, 1);
});

test("fehlendes Monatskennzeichen wird NICHT durch eine Ersatzrechnung gerettet", () => {
  // Älteres Backend ohne das additive Feld: lieber sichtbar zu niedrig als geraten.
  const ohneFeld = { status: "booked", tracking_status: TRACKING_DELIVERED, delivered_at: "2026-07-02T10:00:00Z" };
  assert.equal(computeKpis([ohneFeld], NOW).delivered, 0);
  // Und im Quelltext existiert auch wirklich kein solcher Rückfall.
  const code = stripComments(src("./kpis.mjs"));
  const fn = code.slice(code.indexOf("export function isDeliveredThisMonth"));
  const koerper = fn.slice(0, fn.indexOf("}") + 1);
  for (const verboten of ["delivered_at", "created_at", "updated_at", "getMonth", "tracking_status"]) {
    assert.ok(!koerper.includes(verboten), `Fallback auf ${verboten} ist unzulässig`);
  }
});

// isDelivered bleibt erhalten — es wird für „Aktiv"/„Verzögert" gebraucht.
test("isDelivered bleibt als Trackingzustand erhalten (für Aktiv/Verzögert)", () => {
  assert.equal(isDelivered({ tracking_status: TRACKING_DELIVERED }), true);
  assert.equal(isDelivered({ tracking_status: " Delivered " }), true);
  assert.equal(isDelivered({ tracking_status: null }), false);
});

// ── Stornierung ──────────────────────────────────────────────────────────────
test("isCancelled: nur der Endzustand 'accepted' beendet den Bestand", () => {
  assert.equal(isCancelled({ cancellation_status: "accepted" }), true);
  assert.equal(isCancelled({ cancellation_status: "pending" }), false, "laufende Anfrage");
  assert.equal(isCancelled({ cancellation_status: "in_review" }), false, "laufende Anfrage");
  assert.equal(isCancelled({ cancellation_status: "rejected" }), false, "abgelehnt → bleibt bestehen");
  assert.equal(isCancelled({ cancellation_status: null }), false);
  assert.equal(isCancelled({}), false);
});

test("Stornostatus ist robust gegen Groß-/Kleinschreibung und Leerzeichen", () => {
  for (const v of ["accepted", "ACCEPTED", "Accepted", " accepted ", "  AcCePtEd\t"]) {
    assert.equal(isCancelled({ cancellation_status: v }), true, `„${v}“ muss als storniert gelten`);
  }
});

test("Business-Status 'cancelled' und 'canceled' gelten als storniert", () => {
  for (const v of ["cancelled", "canceled", "CANCELLED", " Canceled "]) {
    assert.equal(isCancelled({ status: v }), true, `„${v}“ muss als storniert gelten`);
  }
});

// ── KPI 1 · Aktive Sendungen ─────────────────────────────────────────────────
test("Aktiv = offener Business-Status, nicht zugestellt, nicht storniert", () => {
  assert.equal(isActive({ status: "booked", tracking_status: null }), true, "gebucht → aktiv");
  assert.equal(isActive({ status: "booked", tracking_status: TRACKING_IN_TRANSIT }), true, "unterwegs → aktiv");
  assert.equal(isActive({ status: "booked", tracking_status: TRACKING_DELIVERED }), false, "zugestellt → nicht aktiv");
  assert.equal(isActive({ status: "label_ready", tracking_status: null }), true);
  assert.equal(isActive({ status: "delivered", tracking_status: null }), false, "Business-Endzustand");
  assert.equal(isActive({ status: null, tracking_status: TRACKING_IN_TRANSIT }), false, "ohne offenen Status nicht aktiv");
  assert.equal(isActive({}), false);
});

test("eine akzeptiert stornierte Sendung ist NICHT aktiv", () => {
  const storniert = { status: "booked", tracking_status: null, cancellation_status: "accepted" };
  assert.equal(isActive(storniert), false);
  assert.equal(computeKpis([storniert], NOW).active, 0);
  // Laufende oder abgelehnte Anfragen ändern dagegen nichts.
  assert.equal(isActive({ status: "booked", tracking_status: null, cancellation_status: "pending" }), true);
  assert.equal(isActive({ status: "booked", tracking_status: null, cancellation_status: "rejected" }), true);
});

test("Aktive Sendungen sind unabhängig vom Monat", () => {
  const ausVormonat = { status: "booked", tracking_status: null, created_at: "2026-05-02" };
  assert.equal(computeKpis([ausVormonat], NOW).active, 1, "Vormonatssendung bleibt aktiv sichtbar");
});

// ── KPI 4 · Verzögert ────────────────────────────────────────────────────────
test("Verzögert: ETA in der Vergangenheit, nicht zugestellt", () => {
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: ETA_YESTERDAY }, NOW), true);
  assert.equal(isDelayed({ tracking_status: null, delivery_date_max: ETA_FAR_PAST }, NOW), true);
});

test("Verzögert NICHT bei fehlender ETA", () => {
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: null }, NOW), false);
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT }, NOW), false);
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: "" }, NOW), false);
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: "kein-datum" }, NOW), false);
});

test("Verzögert NICHT wenn zugestellt (auch bei überschrittener ETA)", () => {
  assert.equal(isDelayed({ tracking_status: TRACKING_DELIVERED, delivery_date_max: ETA_YESTERDAY }, NOW), false);
});

test("Verzögert NICHT bei ETA heute oder morgen", () => {
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: ETA_TODAY }, NOW), false);
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: ETA_TOMORROW }, NOW), false);
});

test("Verzögert: ISO-Datetime-ETA wird datumsgenau verglichen", () => {
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: "2026-07-05T23:59:59Z" }, NOW), true);
  assert.equal(isDelayed({ tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: "2026-07-06T00:00:00Z" }, NOW), false);
});

test("Verzögert ist unabhängig vom Monat und vom Monatskennzeichen", () => {
  const altVerspaetet = { status: "booked", tracking_status: TRACKING_IN_TRANSIT,
                          delivery_date_max: "2026-04-01", created_at: "2026-03-20", delivered_this_month: false };
  assert.equal(computeKpis([altVerspaetet], NOW).delayed, 1, "seit Monaten überfällig → weiter sichtbar");
});

// ── Robustheit und Aggregat ──────────────────────────────────────────────────
test("Robust gegen NULL/leere Eingaben — keine Abstürze, alles 0", () => {
  for (const input of [undefined, null, [], [null], [undefined], [{}]]) {
    const k = computeKpis(input, NOW);
    assert.equal(k.active, 0);
    assert.equal(k.inTransit, 0);
    assert.equal(k.delivered, 0);
    assert.equal(k.delayed, 0);
  }
});

test("eine erfolgreich geladene LEERE Liste ergibt für alle vier KPI 0", () => {
  const k = computeKpis([], NOW);
  assert.deepEqual(
    { active: k.active, inTransit: k.inTransit, delivered: k.delivered, delayed: k.delayed },
    { active: 0, inTransit: 0, delivered: 0, delayed: 0 });
});

test("computeKpis aggregiert die vier Status-KPIs korrekt", () => {
  const shipments = [
    { status: "booked",      tracking_status: null },                                                    // aktiv
    { status: "label_ready", tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: ETA_TOMORROW },    // aktiv + unterwegs
    { status: "booked",      tracking_status: TRACKING_IN_TRANSIT, delivery_date_max: ETA_YESTERDAY },   // aktiv + unterwegs + verzögert
    { status: "booked",      tracking_status: TRACKING_DELIVERED, delivered_this_month: true },          // zugestellt (diesen Monat)
    { status: "booked",      tracking_status: TRACKING_DELIVERED, delivered_this_month: false },         // zugestellt, aber Vormonat
    { status: "booked",      tracking_status: null, cancellation_status: "accepted" },                   // storniert → nichts
    { status: "cancelled",   tracking_status: null },                                                    // storniert → nichts
  ];
  const k = computeKpis(shipments, NOW);
  assert.equal(k.active, 3,    "aktiv: 3 (Stornierungen zählen nicht)");
  assert.equal(k.inTransit, 2, "in Zustellung: 2");
  assert.equal(k.delivered, 1, "zugestellt: nur die mit delivered_this_month=true");
  assert.equal(k.delayed, 1,   "verzögert: 1");
});

// ── new24 bleibt erhalten (Fußzeile „Aktive Sendungen") ─────────────────────
test("new24 zählt weiterhin die Sendungen der letzten 24 Stunden", () => {
  const jetzt = new Date("2026-07-06T12:00:00Z");
  const k = computeKpis([
    { status: "booked", tracking_status: null, created_at: "2026-07-06T09:00:00Z" }, // vor 3 h
    { status: "booked", tracking_status: null, created_at: "2026-07-05T13:00:00Z" }, // vor 23 h
    { status: "booked", tracking_status: null, created_at: "2026-07-04T09:00:00Z" }, // älter
  ], jetzt);
  assert.equal(k.new24, 2);
  assert.equal(k.hasCreatedAt, true);
});

// ── Die Spend-Bestandteile sind restlos entfernt ────────────────────────────
test("computeKpis liefert KEINE Ausgaben-Felder mehr", () => {
  const k = computeKpis([{ status: "booked", tracking_status: null, created_at: "2026-07-02", price_final: 99 }], NOW);
  for (const feld of ["spendThis", "spendPrev", "deltaPct", "hasSpend"]) {
    assert.ok(!(feld in k), `${feld} darf im Ergebnis nicht mehr existieren`);
  }
  assert.deepEqual(Object.keys(k).sort(), ["active", "delayed", "delivered", "hasCreatedAt", "inTransit", "new24"]);
});

test("weder Modul noch Übersicht enthalten noch Ausgaben-/Preislogik", () => {
  const kpiSrc = stripComments(src("./kpis.mjs"));
  const overview = stripComments(src("../components/dashboard/Overview.jsx"));
  for (const feld of ["spendThis", "spendPrev", "deltaPct", "hasSpend", "spendFoot", "moneyCompact", "price_final"]) {
    assert.ok(!kpiSrc.includes(feld), `kpis.mjs enthält noch ${feld}`);
    assert.ok(!overview.includes(feld), `Overview.jsx enthält noch ${feld}`);
  }
  assert.ok(!overview.includes("Ausgaben"), "die Karte „Ausgaben (Monat)“ ist noch vorhanden");
});

// ── Fachlicher Monatsschlüssel (nur Refetch-Auslöser, nie Zählgrenze) ───────
test("businessMonthKey liefert den Berliner Monat als 'YYYY-MM'", () => {
  // 31.12. 23:30 UTC ist in Berlin bereits der 1. Januar → neuer Monat.
  assert.equal(businessMonthKey(new Date("2026-12-31T23:30:00Z")), "2027-01");
  assert.equal(businessMonthKey(new Date("2026-12-31T22:30:00Z")), "2026-12");
  // Sommerzeit: 31.07. 22:30 UTC ist in Berlin bereits der 1. August.
  assert.equal(businessMonthKey(new Date("2026-07-31T22:30:00Z")), "2026-08");
  assert.equal(businessMonthKey(new Date("2026-07-31T21:30:00Z")), "2026-07");
});
