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
  rangePercent,
  pickupSliderGap,
  clampPickupFrom,
  clampPickupUntil,
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

// ── Dual-Range-Slider-Helfer (reine Anzeige-/Interaktionsmathematik) ─────────
// Carrier-Achse 11:00–18:00 = 660..1080 Min, Mindestdauer 120, Raster 15.

test("(25) rangePercent: Position auf der Achse, geklemmt auf 0..100", () => {
  assert.equal(rangePercent(660, 660, 1080), 0);    // Anfang
  assert.equal(rangePercent(1080, 660, 1080), 100); // Ende
  assert.equal(rangePercent(870, 660, 1080), 50);   // Mitte (13:30)
  assert.equal(rangePercent(600, 660, 1080), 0);    // unter min → geklemmt
  assert.equal(rangePercent(2000, 660, 1080), 100); // über max → geklemmt
  assert.equal(rangePercent(700, 660, 660), 0);     // degenerierte Achse → 0
});

test("(26) pickupSliderGap: Mindestdauer, aber nie kleiner als ein Rasterschritt", () => {
  assert.equal(pickupSliderGap(120, 15), 120); // Mindestdauer dominiert
  assert.equal(pickupSliderGap(0, 15), 15);    // ohne Mindestdauer → mind. 1 Schritt (from < until)
  assert.equal(pickupSliderGap(90, 15), 90);
});

test("(27) clampPickupFrom: hält Carrierbeginn UND Mindestabstand zum Ende ein", () => {
  const bMin = 660, gap = 120;
  assert.equal(clampPickupFrom(705, 900, bMin, gap), 705);  // 11:45 zulässig (bis 13:00)
  assert.equal(clampPickupFrom(600, 900, bMin, gap), 660);  // vor Carrierbeginn → 11:00
  assert.equal(clampPickupFrom(880, 900, bMin, gap), 780);  // würde Mindestdauer verletzen → until-gap (13:00)
  assert.equal(clampPickupFrom("x", 900, bMin, gap), null); // Unsinn → null
});

test("(28) clampPickupUntil: hält Carrierende UND Mindestabstand zum Beginn ein", () => {
  const bMax = 1080, gap = 120;
  assert.equal(clampPickupUntil(900, 705, 1080, gap), 900);  // 15:00 zulässig (ab 13:45)
  assert.equal(clampPickupUntil(1200, 705, bMax, gap), 1080); // nach Carrierende → 18:00
  assert.equal(clampPickupUntil(800, 705, bMax, gap), 825);  // würde Mindestdauer verletzen → from+gap (13:45)
  assert.equal(clampPickupUntil(900, "x", bMax, gap), null); // Unsinn → null
});
