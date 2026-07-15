// Frontend-Tests (16–24) für das Abholzeitfenster — reine Client-Entscheidungslogik
// aus pickupWindowClient.mjs, die Modul (PickupWindowModule) und Seite (BookingPage)
// teilen. Läuft über Node's eingebauten Test-Runner:
//   node --test src/utils/pickupWindowClient.test.mjs   (bzw. `npm test`)
//
// FAIL-CLOSED / P0: Diese Helfer sind NICHT autoritativ — der finale /book prüft das
// gespeicherte Fenster erneut (409 PICKUP_WINDOW_CHANGED). Getestet wird die Anzeige-/
// Freigabelogik: verstellbar?, Validierung, „volles Fenster" (→ Draft NULL/NULL) und
// das Buchungs-Gate während/bei Fehler der Hydrierung.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickupTimeToMinutes,
  minutesToHHMM,
  toHHMM,
  formatDuration,
  isPickupWindowAdjustable,
  validatePickupSelection,
  isFullCarrierWindow,
  pickupWindowBlocksBooking,
} from "./pickupWindowClient.mjs";

// Belegter Tarif-Ausschnitt: Carrier-Fenster 11:00–18:00, Mindestdauer 120 Min, verstellbar.
const TARIFF = {
  serviceType: "pickup",
  pickupTimeFrom: "11:00",
  pickupTimeUntil: "18:00",
  pickupWindowMinMinutes: 120,
  pickupWindowAdjustable: true,
};
const BOUNDS = { boundFrom: "11:00", boundUntil: "18:00", minMinutes: 120 };

// ── 16: Verstellbarkeit — read-only, wenn Tarif es nicht erlaubt ─────────────
test("(16) isPickupWindowAdjustable: nur bei explizitem Flag + echtem Von<Bis-Fenster", () => {
  assert.equal(isPickupWindowAdjustable(TARIFF), true);
  // Flag fehlt/false → read-only Anzeige (kein Slider)
  assert.equal(isPickupWindowAdjustable({ ...TARIFF, pickupWindowAdjustable: false }), false);
  assert.equal(isPickupWindowAdjustable({ pickupTimeFrom: "11:00", pickupTimeUntil: "18:00" }), false);
  // Grenzen fehlen oder umgekehrt → nicht verstellbar
  assert.equal(isPickupWindowAdjustable({ ...TARIFF, pickupTimeUntil: null }), false);
  assert.equal(isPickupWindowAdjustable({ ...TARIFF, pickupTimeFrom: "18:00", pickupTimeUntil: "11:00" }), false);
});

// ── 17: Anzeige/Hydrierung — HH:mm:ss aus dem Draft wird auf HH:mm normalisiert ─
test("(17) parse/format: Draft-HH:mm:ss → HH:mm; kaputt → leer/null (kein Carrier-Default erzwingen)", () => {
  assert.equal(pickupTimeToMinutes("11:45"), 705);
  assert.equal(pickupTimeToMinutes("11:45:00"), 705);
  assert.equal(minutesToHHMM(705), "11:45");
  assert.equal(toHHMM("11:45:00"), "11:45");
  assert.equal(toHHMM("15:00"), "15:00");
  for (const bad of ["24:00", "12:60", "abc", "", null, undefined]) assert.equal(pickupTimeToMinutes(bad), null, `bad: ${bad}`);
  assert.equal(toHHMM("kaputt"), "");
});

// ── 18: Validierung — gültige Auswahl innerhalb Grenzen + Mindestdauer ───────
test("(18) validatePickupSelection: gültige individuelle Auswahl → { valid:true }", () => {
  assert.deepEqual(validatePickupSelection({ from: "11:45", until: "15:00", ...BOUNDS }), { valid: true });
  assert.deepEqual(validatePickupSelection({ from: "11:00", until: "18:00", ...BOUNDS }), { valid: true }); // volles Fenster ist gültig
  assert.deepEqual(validatePickupSelection({ from: "11:00", until: "13:00", ...BOUNDS }), { valid: true }); // exakt Mindestdauer
});

// ── 19: Validierung — fail-closed Gründe (kein stiller Fallback) ─────────────
test("(19) validatePickupSelection: außerhalb/zu kurz/kaputt → präziser reason", () => {
  assert.deepEqual(validatePickupSelection({ from: "09:00", until: "15:00", ...BOUNDS }), { valid: false, reason: "OUTSIDE_AVAILABLE_WINDOW" });
  assert.deepEqual(validatePickupSelection({ from: "13:00", until: "19:30", ...BOUNDS }), { valid: false, reason: "OUTSIDE_AVAILABLE_WINDOW" });
  assert.deepEqual(validatePickupSelection({ from: "15:00", until: "12:00", ...BOUNDS }), { valid: false, reason: "OUTSIDE_AVAILABLE_WINDOW" }); // Beginn ≥ Ende
  assert.deepEqual(validatePickupSelection({ from: "12:00", until: "13:00", ...BOUNDS }), { valid: false, reason: "BELOW_MINIMUM_DURATION" });
  assert.deepEqual(validatePickupSelection({ from: "abc", until: "15:00", ...BOUNDS }), { valid: false, reason: "INVALID_FORMAT" });
});

// ── 20: „Volles Fenster" — Auswahl == Grenzen → Draft NULL/NULL ──────────────
test("(20) isFullCarrierWindow: exakt volle Grenzen → true (→ kein individueller Wunsch)", () => {
  assert.equal(isFullCarrierWindow({ from: "11:00", until: "18:00", boundFrom: "11:00", boundUntil: "18:00" }), true);
  assert.equal(isFullCarrierWindow({ from: "11:45", until: "15:00", boundFrom: "11:00", boundUntil: "18:00" }), false);
  assert.equal(isFullCarrierWindow({ from: "11:00", until: "17:00", boundFrom: "11:00", boundUntil: "18:00" }), false);
});

// ── 21: Persistenz-Auflösung — volles Fenster speichert NULL/NULL, Teilfenster den Wunsch ─
test("(21) volles Fenster → NULL/NULL (kein Re-Save), Teilfenster → individueller Wunsch", () => {
  // Spiegelt die Modul-Auflösung `resolved = isFull ? null : { from, until }` — dieselbe geteilte Wahrheit.
  const resolve = (from, until) =>
    isFullCarrierWindow({ from, until, boundFrom: "11:00", boundUntil: "18:00" }) ? null : { from, until };
  assert.equal(resolve("11:00", "18:00"), null);                         // volles Fenster → nichts Individuelles speichern
  assert.deepEqual(resolve("11:45", "15:00"), { from: "11:45", until: "15:00" });
});

// ── 22: Buchungs-Gate — Hydrierung läuft → blockiert (nur Pickup) ────────────
test("(22) pickupWindowBlocksBooking: Pickup + Hydrierung lädt → blockiert", () => {
  assert.equal(pickupWindowBlocksBooking({ serviceType: "pickup", hydration: { loading: true, error: false } }), true);
  assert.equal(pickupWindowBlocksBooking({ serviceType: "pickup", hydration: { loading: false, error: false } }), false);
});

// ── 23: Buchungs-Gate — Ladefehler → blockiert, geladen → frei ───────────────
test("(23) pickupWindowBlocksBooking: Pickup + Ladefehler → blockiert; sauber geladen → frei", () => {
  assert.equal(pickupWindowBlocksBooking({ serviceType: "pickup", hydration: { loading: false, error: true } }), true);
  assert.equal(pickupWindowBlocksBooking({ serviceType: "pickup", hydration: {} }), false);
  assert.equal(pickupWindowBlocksBooking({ serviceType: "pickup" }), false);
});

// ── 24: Nicht-Pickup nie blockiert + 409-Dialog-Dauer-Anzeige ────────────────
test("(24) Dropoff/kein Pickup nie blockiert; formatDuration rendert die neue Mindestdauer", () => {
  assert.equal(pickupWindowBlocksBooking({ serviceType: "dropoff", hydration: { loading: true, error: true } }), false);
  assert.equal(pickupWindowBlocksBooking({ serviceType: undefined, hydration: { error: true } }), false);
  assert.equal(pickupWindowBlocksBooking({}), false);
  // 409-Dialog zeigt minimumMinutes menschenlesbar
  assert.equal(formatDuration(120), "2 Std.");
  assert.equal(formatDuration(90), "1 Std. 30 Min.");
  assert.equal(formatDuration(0), "0 Min.");
});
