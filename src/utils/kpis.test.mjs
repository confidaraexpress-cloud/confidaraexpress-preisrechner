// Tests für die Kennzahlkarten der Kundenübersicht (vier Karten) und ihre Filter.
// Seit den Betreiberentscheidungen E1–E4 (2026-11-06) rechnet das Frontend keine Kennzahl mehr nach:
// Zähler, Filter und Kundenstand jeder Zeile kommen aus EINER Regelfassung im Backend
// (lib/shipmentKpis.js). Geprüft wird hier, dass dieses Modul nur noch Serverwerte liest — fail-safe —
// und die Texte der vier Karten und Filter an genau einer Stelle hält.
// Läuft ohne zusätzliche Abhängigkeit über Node's eingebauten Test-Runner:
//   node --test src/utils/kpis.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SHIPMENT_KPIS, SHIPMENT_KPI_KEYS, KPI_TEXT, isShipmentKpiKey, shipmentKpi, sendungenAnzahl,
  kpisFromServerStats, activeNewNote, businessMonthKey,
} from "./kpis.mjs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const STATS = { total: 22, active: 4, in_transit: 1, delivered_this_month: 3, delayed: 2, new_24h: 1, test_bookings: 2 };

// ── Die vier Karten und ihre Filter (E3) ───────────────────────────────────
test("vier Karten in fester Reihenfolge — Schlüssel = Filter = stats-Felder des Servers", () => {
  assert.deepEqual([...SHIPMENT_KPI_KEYS], ["active", "in_transit", "delivered_this_month", "delayed"]);
  assert.deepEqual(SHIPMENT_KPIS.map((k) => k.label), ["Aktive Sendungen", "Unterwegs", "Zugestellt", "Verzögert"]);
  assert.deepEqual(SHIPMENT_KPIS.map((k) => k.context), [
    "Gebucht, noch nicht zugestellt",
    "Beim Versanddienstleister unterwegs",
    "Im aktuellen Monat",
    "Voraussichtlicher Liefertermin überschritten",
  ]);
  assert.deepEqual(SHIPMENT_KPIS.map((k) => k.filter), ["Aktive Sendungen", "Unterwegs", "Zugestellt im aktuellen Monat", "Verzögert"]);
  assert.equal(SHIPMENT_KPIS.find((k) => k.key === "delayed").empty, "Aktuell keine verzögerten Sendungen.");
  // Die Filterleiste erklärt genauer als die Karte und wiederholt den Filternamen nicht.
  assert.equal(SHIPMENT_KPIS.find((k) => k.key === "delayed").explain, "Voraussichtlicher Liefertermin überschritten, noch keine Zustellmeldung");
  for (const k of SHIPMENT_KPIS) assert.ok(k.explain && k.explain !== k.filter, `${k.key}: Erklärung fehlt oder wiederholt den Namen`);
  assert.ok(!/aktuellen Monat/i.test(SHIPMENT_KPIS.find((k) => k.key === "delivered_this_month").explain),
    "„Zugestellt im aktuellen Monat“ · „Im aktuellen Monat“ wiederholte sich");
  for (const k of SHIPMENT_KPIS) assert.ok(k.empty.endsWith("."), `${k.key}: Leersatz ist ein Satz`);
  assert.ok(!SHIPMENT_KPIS.some((k) => k.label === "In Zustellung"), "„In Zustellung“ ist durch „Unterwegs“ ersetzt");
  assert.ok(Object.isFrozen(SHIPMENT_KPIS) && SHIPMENT_KPIS.every(Object.isFrozen));
});

test("nur die vier Schlüssel sind Filter — alles andere nie", () => {
  for (const k of SHIPMENT_KPI_KEYS) assert.equal(isShipmentKpiKey(k), true);
  for (const x of ["", "x", "ACTIVE", "transit", "delivered", "new_24h", "test_bookings", "total", null, undefined, 1, ["active"], {}]) {
    assert.equal(isShipmentKpiKey(x), false, JSON.stringify(x));
  }
  assert.equal(shipmentKpi("delayed").label, "Verzögert");
  assert.equal(shipmentKpi("x"), null);
});

test("Trefferzahl: „1 Sendung“ / „n Sendungen“ mit geschütztem Leerzeichen", () => {
  assert.equal(sendungenAnzahl(0), "0 Sendungen");
  assert.equal(sendungenAnzahl(1), "1 Sendung");
  assert.equal(sendungenAnzahl(12), "12 Sendungen");
});

test("Texte: Testhinweis (E1), Filter entfernen, alle anzeigen, nicht verfügbar", () => {
  assert.equal(KPI_TEXT.testHint, "Kennzahlen enthalten Testsendungen.");
  assert.equal(KPI_TEXT.removeFilter, "Filter entfernen");
  assert.equal(KPI_TEXT.showAll, "Alle Sendungen anzeigen");
  assert.match(KPI_TEXT.unavailable, /nicht verfügbar/);
});

// ── Serveraggregat → Kartenwerte (fail-safe) ───────────────────────────────
test("ein vollständiges Aggregat wird 1:1 übernommen, je Filterschlüssel abrufbar", () => {
  const k = kpisFromServerStats(STATS);
  assert.deepEqual(k, {
    active: 4, inTransit: 1, delivered: 3, delayed: 2, new24: 1, testBookings: 2,
    byKey: { active: 4, in_transit: 1, delivered_this_month: 3, delayed: 2 },
  });
  assert.deepEqual(kpisFromServerStats({ ...STATS, total: 0, active: 0, in_transit: 0, delivered_this_month: 0, delayed: 0, new_24h: 0, test_bookings: 0 }).byKey,
    { active: 0, in_transit: 0, delivered_this_month: 0, delayed: 0 }, "0 ist überall ein gültiger Wert");
});

test("jedes unvollständige oder unplausible Aggregat ergibt null — keine geratene Zahl", () => {
  for (const kaputt of [null, undefined, "stats", [1, 2], {}, { ...STATS, total: undefined }, { ...STATS, active: "viele" },
    { ...STATS, delayed: -1 }, { ...STATS, in_transit: Infinity }, { ...STATS, new_24h: null }]) {
    assert.equal(kpisFromServerStats(kaputt), null, JSON.stringify(kaputt));
  }
});

test("„davon n neu (24 h)“ ist eine Teilmenge der aktiven — sonst entfällt nur der Zusatz", () => {
  assert.equal(activeNewNote(kpisFromServerStats(STATS)), "davon 1 neu (24 h)");
  assert.equal(activeNewNote(kpisFromServerStats({ ...STATS, new_24h: 0 })), null, "bei 0 entfällt der Zusatz");
  const alt = kpisFromServerStats({ ...STATS, active: 3, new_24h: 4 });
  assert.equal(alt.new24, null, "mehr neue als aktive: Aggregat vor E3");
  assert.equal(alt.active, 3, "die Kennzahl selbst bleibt");
  assert.equal(activeNewNote(alt), null);
  assert.equal(activeNewNote(null), null);
});

test("test_bookings ist optional: ohne Feld fehlt nur der Testhinweis", () => {
  const { test_bookings: _weg, ...ohne } = STATS;   // eslint-disable-line no-unused-vars
  const k = kpisFromServerStats(ohne);
  assert.equal(k.testBookings, null);
  assert.equal(k.active, 4);
});

// ── Keine zweite Regelfassung im Frontend ──────────────────────────────────
test("das Modul rechnet keine Kennzahl nach (keine Status-, Tracking-, ETA- oder Zeitlogik)", () => {
  const code = stripComments(src("./kpis.mjs"));
  for (const verboten of ["computeKpis", "isActive", "isDelayed", "isInTransit", "tracking_status", "delivery_date_max",
    "cancellation_status", "created_at", "ACTIVE_BUSINESS_STATUSES", "getTime()"]) {
    assert.ok(!code.includes(verboten), `kpis.mjs enthält noch ${verboten}`);
  }
});

test("weder Modul noch Übersicht enthalten Ausgaben-/Preislogik", () => {
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
