// src/pages/trackingView.mjs
// Seiten-lokale, REINE Anzeige-Logik für TrackingPage.jsx. Bewusst KEINE globale Tracking-Utility
// (der Bug existiert nur hier) — nur von TrackingPage.jsx und ihrem Test importiert. Kein React,
// kein I/O → direkt unit-testbar (node --test).
//
// KRITISCH (bewiesene Root Cause): Das JUMiNGO-„ShipmentTracking"-Objekt trägt einen
// Top-Level-`status` (freier String, OpenAPI ShipmentTracking.status) — das ist der
// Request-/Gesamtstatus der Trackingabfrage (z. B. "success"), NICHT der Transportstatus.
// Der echte Transportstatus liegt in `trackingStatus` (Backend-normalisiert = data.status)
// bzw. `tracking.data.status`. Der Envelope darf die Sendungsdarstellung NIEMALS steuern.

// Die vier Timeline-Stufen (Index 0..3).
export const STATUS_STEPS = ["Daten übermittelt", "Unterwegs", "In Zustellung", "Zugestellt"];

// NUR echte Transport-/Carrier-Statuswerte → deutsches Label. KEIN "success"/"ok"/"completed"
// (Envelope). Belegte JUMiNGO-Enum-Werte (transit/pickup/exception/undelivered/delivered) +
// defensive Synonyme (in_transit/out_for_delivery/in_delivery). new/notfound/expired/unbekannt
// erhalten bewusst KEIN Label (→ neutraler Fallback), damit nie geraten wird.
export const STATUS_LABELS = {
  delivered:        "Zugestellt",
  out_for_delivery: "In Zustellung",
  in_delivery:      "In Zustellung",
  transit:          "Unterwegs",
  in_transit:       "Unterwegs",
  pickup:           "Sendung übernommen",
  exception:        "Ausnahme",
  undelivered:      "Nicht zustellbar",
};

// Kurze, kundenfreundliche Beschreibung je bekanntem Anzeige-Status (reine Darstellung).
export const STATUS_DESCRIPTIONS = {
  "Zugestellt":         "Ihre Sendung wurde erfolgreich zugestellt.",
  "In Zustellung":      "Ihre Sendung befindet sich in der Zustellung.",
  "Unterwegs":          "Ihre Sendung befindet sich aktuell im Transport.",
  "Sendung übernommen": "Der Versanddienstleister hat Ihre Sendung übernommen.",
  "Daten übermittelt":  "Ihre Sendungsdaten wurden übermittelt.",
  "Nicht zustellbar":   "Ihre Sendung konnte leider nicht zugestellt werden.",
  "Ausnahme":           "Bei der Zustellung Ihrer Sendung ist eine Ausnahme aufgetreten.",
};

// Neutrale Hero-Zustände, wenn (noch) kein echter Transportstatus vorliegt.
const HERO_DATA_RECEIVED = "Daten übermittelt";              // Trackingnummer vorhanden
const HERO_UNAVAILABLE   = "Tracking noch nicht verfügbar";  // keine Trackingnummer

// Feste Stufen-Zuordnung je exaktem Transportstatus (verhindert Substring-Fallen wie
// "undelivered" ⊃ "delivered"). Nicht gelistete Werte → 0 (sicherer Initialzustand).
const STEP_INDEX = { delivered: 3, out_for_delivery: 2, in_delivery: 2, transit: 1, in_transit: 1, pickup: 1 };

// String → getrimmt/klein oder null.
function norm(v) {
  return typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null;
}

// AUTORITATIVE Transport-Statusquelle. Priorität:
//   1. result.trackingStatus         (Backend-normalisiert = data.status)
//   2. result.tracking.data.status   (JUMiNGO ShipmentTracking.data.status)
//   3. result.data.status            (verschachtelte Antwortform)
// NIEMALS result.tracking.status (Envelope, z. B. "success") und NIEMALS result.status.
export function resolveTransportStatus(result) {
  const r = result && typeof result === "object" ? result : {};
  const tracking = r.tracking && typeof r.tracking === "object" ? r.tracking : null;
  const trackingData = tracking && tracking.data && typeof tracking.data === "object" ? tracking.data : null;
  const nestedData = r.data && typeof r.data === "object" ? r.data : null;
  return (
    norm(r.trackingStatus) ||
    (trackingData ? norm(trackingData.status) : null) ||
    (nestedData ? norm(nestedData.status) : null) ||
    null
  );
}

// Trackingnummer (nur zur Fallback-Entscheidung Hero „Daten übermittelt" vs. „…nicht verfügbar").
export function resolveTrackingNumber(result) {
  const r = result && typeof result === "object" ? result : {};
  const tracking = r.tracking && typeof r.tracking === "object" ? r.tracking : null;
  const cands = [
    r.trackingNumber,
    tracking ? tracking.trackingNumber : undefined,
    tracking && tracking.data ? tracking.data.tracking_number : undefined,
  ];
  for (const c of cands) if (typeof c === "string" && c.trim()) return c.trim();
  return null;
}

// Transportstatus → deutsches Label ODER null. Unbekannt/leer/Envelope → null (kein Raten,
// niemals „Zugestellt" für unbekannte/Envelope-Werte).
export function statusLabelFor(status) {
  const s = norm(status);
  if (!s) return null;
  return STATUS_LABELS[s] || null;
}

// Transportstatus → Timeline-Stufe 0..3. delivered→3, out_for_delivery→2, transit/pickup→1;
// alles andere (new/unknown/notfound/expired/undelivered/leer/Envelope) → 0 (sicher nach unten).
export function resolveStepIndex(status) {
  const s = norm(status);
  if (!s) return 0;
  if (Object.prototype.hasOwnProperty.call(STEP_INDEX, s)) return STEP_INDEX[s];
  if (/undelivered|nicht zustellbar/.test(s)) return 0;                 // VOR delivered prüfen
  if (/zugestellt|\bdelivered\b/.test(s)) return 3;
  if (/out.?for.?delivery|in.?delivery|in.?zustellung/.test(s)) return 2;
  if (/transit|unterwegs|pickup|abgeholt|picked.?up|shipped|versendet|versandt/.test(s)) return 1;
  return 0;
}

// Komponiert die reine Anzeige-Sicht. hasEvents = ob die Timeline echte Carrier-Events hat.
// Regeln:
//  - „Zugestellt"/Stufe 3 NUR bei explizitem Transport-„delivered" (auch bei leerer Eventliste).
//  - Ohne Events UND ohne explizites delivered bleibt die Timeline auf Stufe 0 und der Hero wird
//    NIE „Zugestellt" (kein künstlicher Fortschritt) → nie „Zugestellt" + „Keine Ereignisse" zugleich.
//  - Unbekannt/fehlend: Trackingnummer vorhanden → „Daten übermittelt"; sonst „Tracking noch nicht verfügbar".
export function buildTrackingView(result, opts = {}) {
  const hasEvents = Boolean(opts.hasEvents);
  const transportStatus = resolveTransportStatus(result);
  const isDelivered = transportStatus === "delivered";
  const hasNumber = Boolean(resolveTrackingNumber(result));
  const advanced = hasEvents || isDelivered;             // Fortschritt nur mit Beleg (Events) ODER explizitem delivered
  const stepIndex = advanced ? resolveStepIndex(transportStatus) : 0;
  const knownLabel = statusLabelFor(transportStatus);
  const heroStatus = isDelivered
    ? "Zugestellt"
    : (advanced && knownLabel)
      ? knownLabel
      : (hasNumber ? HERO_DATA_RECEIVED : HERO_UNAVAILABLE);
  const heroDesc = STATUS_DESCRIPTIONS[heroStatus] || null;
  return { transportStatus, isDelivered, stepIndex, statusLabel: knownLabel, heroStatus, heroDesc };
}
