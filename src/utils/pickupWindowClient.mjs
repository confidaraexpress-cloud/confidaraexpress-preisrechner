// Reine, framework-freie Client-Helfer für das Abholzeitfenster (.mjs, wie
// bookingGate.mjs / kpis.mjs). KEIN React, KEIN fetch — nur Entscheidungslogik,
// die das Modul (PickupWindowModule) und die Seite (BookingPage) teilen, damit
// UI-Anzeige, Buchungs-Gate und Tests EINE Quelle der Wahrheit nutzen.
//
// WICHTIG: reine Frontend-Darstellung/-Freigabe. Diese Helfer sind NICHT
// autoritativ — der finale /book prüft das gespeicherte Fenster erneut gegen den
// frischen Tarif (fail-closed 409 PICKUP_WINDOW_CHANGED). Nichts hier berechnet
// Preise oder erfindet Jumingo-Felder; es werden nur belegte Tariffelder gelesen
// (pickupTimeFrom/pickupTimeUntil, pickupWindowMinMinutes, pickupWindowAdjustable).

// "HH:mm[:ss]" → Minuten seit 00:00; sonst null.
export function pickupTimeToMinutes(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? "").trim());
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  return h > 23 || mm > 59 ? null : h * 60 + mm;
}

// Minuten seit 00:00 → "HH:mm"; ungültig → "".
export function minutesToHHMM(n) {
  if (!Number.isFinite(n) || n < 0) return "";
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

// Belegten Zeitwert (HH:mm oder HH:mm:ss) auf "HH:mm" normalisieren; sonst "".
export function toHHMM(v) {
  const n = pickupTimeToMinutes(v);
  return n == null ? "" : minutesToHHMM(n);
}

// Minuten → deutsche Kurzdauer ("120" → "2 Std.", "90" → "1 Std. 30 Min.").
export function formatDuration(min) {
  const n = Number(min) || 0;
  const h = Math.floor(n / 60), m = n % 60;
  return [h ? `${h} Std.` : null, m ? `${m} Min.` : null].filter(Boolean).join(" ") || "0 Min.";
}

// Verstellbar NUR, wenn der Tarif es ausdrücklich erlaubt (pickupWindowAdjustable)
// UND ein echtes Von<Bis-Carrier-Fenster vorliegt. Sonst read-only Anzeige.
export function isPickupWindowAdjustable(tariff) {
  const bMin = pickupTimeToMinutes(tariff?.pickupTimeFrom);
  const bMax = pickupTimeToMinutes(tariff?.pickupTimeUntil);
  return tariff?.pickupWindowAdjustable === true && bMin != null && bMax != null && bMin < bMax;
}

// Reine Client-Validierung der Nutzerauswahl gegen die belegten Tarifgrenzen +
// tarifabhängige Mindestdauer. Spiegelt die Backend-Autorität NICHT — der finale
// /book validiert erneut. Rückgabe: { valid:true } oder { valid:false, reason }.
// Gründe: INVALID_FORMAT | OUTSIDE_AVAILABLE_WINDOW | BELOW_MINIMUM_DURATION.
export function validatePickupSelection({ from, until, boundFrom, boundUntil, minMinutes = 0 } = {}) {
  const s = pickupTimeToMinutes(from), e = pickupTimeToMinutes(until);
  const bMin = pickupTimeToMinutes(boundFrom), bMax = pickupTimeToMinutes(boundUntil);
  if (s == null || e == null || bMin == null || bMax == null) return { valid: false, reason: "INVALID_FORMAT" };
  if (s < bMin || e > bMax || s >= e) return { valid: false, reason: "OUTSIDE_AVAILABLE_WINDOW" };
  if ((e - s) < (Number(minMinutes) || 0)) return { valid: false, reason: "BELOW_MINIMUM_DURATION" };
  return { valid: true };
}

// Deckt die Auswahl exakt das volle Carrier-Fenster ab? Dann wird KEIN
// individuelles Fenster gespeichert (Draft NULL/NULL) — verhindert unnötige
// Persistenz und hält „volles Fenster" von „bewusster Einschränkung" getrennt.
export function isFullCarrierWindow({ from, until, boundFrom, boundUntil } = {}) {
  const s = pickupTimeToMinutes(from), e = pickupTimeToMinutes(until);
  const bMin = pickupTimeToMinutes(boundFrom), bMax = pickupTimeToMinutes(boundUntil);
  return s != null && e != null && bMin != null && bMax != null && s === bMin && e === bMax;
}

// Buchungs-Gate für das Abholzeitfenster: Bei Pickup blockiert eine laufende
// ODER fehlgeschlagene Hydrierung die Buchung — kein unbemerktes Buchen mit einem
// anderen als dem angezeigten Fenster. Nicht-Pickup ist nie betroffen.
export function pickupWindowBlocksBooking({ serviceType, hydration } = {}) {
  if (serviceType !== "pickup") return false;
  const h = hydration || {};
  return h.loading === true || h.error === true;
}

// ── Dual-Range-Slider: reine Anzeige-/Interaktionsmathematik ─────────────────
// KEINE Geschäftslogik — die Auswahl bleibt über validatePickupSelection gültig,
// die Persistenz-/Buchungsentscheidung liegt weiterhin serverseitig im /book.

// Positionsprozent (0..100) eines Minutenwerts auf der Carrier-Achse [min..max].
// Für Fill-/Griff-Position. Ungültige/degenerierte Achse → 0.
export function rangePercent(value, min, max) {
  const v = Number(value), lo = Number(min), hi = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return 0;
  return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
}

// Mindestabstand der beiden Griffe (Minuten): die tarifabhängige Mindestdauer,
// aber nie kleiner als ein Rasterschritt — sonst könnten Griffe zusammenfallen
// (from == until). Hält from<until UND die Mindestdauer gleichzeitig ein.
export function pickupSliderGap(minMinutes, step = 15) {
  const m = Math.max(0, Number(minMinutes) || 0);
  const s = Math.max(0, Number(step) || 0);
  return Math.max(m, s);
}

// Griff „Frühestens" auf [boundFromMin .. untilMin - gap] begrenzen (ganze Minuten).
// Garantiert: from ≥ Carrierbeginn und Abstand ≥ gap zum Ende. Unsinn → null.
export function clampPickupFrom(proposedMin, untilMin, boundFromMin, gap) {
  const p = Number(proposedMin), u = Number(untilMin), lo = Number(boundFromMin), g = Number(gap) || 0;
  if (!Number.isFinite(p) || !Number.isFinite(u) || !Number.isFinite(lo)) return null;
  return Math.round(Math.max(lo, Math.min(p, u - g)));
}

// Griff „Spätestens" auf [fromMin + gap .. boundUntilMin] begrenzen (ganze Minuten).
// Garantiert: until ≤ Carrierende und Abstand ≥ gap zum Beginn. Unsinn → null.
export function clampPickupUntil(proposedMin, fromMin, boundUntilMin, gap) {
  const p = Number(proposedMin), f = Number(fromMin), hi = Number(boundUntilMin), g = Number(gap) || 0;
  if (!Number.isFinite(p) || !Number.isFinite(f) || !Number.isFinite(hi)) return null;
  return Math.round(Math.min(hi, Math.max(p, f + g)));
}
