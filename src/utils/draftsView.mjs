// ─────────────────────────────────────────────────────────────────────────────
// Entwürfe — reine, framework-freie Hilfslogik (.mjs, wie addressBookView).
// Query-Parameter-Aufbau, Pagination-Anfügen, Anzeige-Formatierung (Empfänger/
// Route/Paket/Datum) und Fehlercode-Mapping. Kein React, kein Netzwerk.
//
// Backend-Kontrakt (siehe Aufgabenstellung, PR #162/#163):
//   GET /api/kunde/drafts?limit=20&cursor=... → { items: [...], nextCursor }
//   Draft-Objekt: id, jumingoShipmentId, status, weight, length, width, height,
//   packageCount, fromCountry, toCountry, fromPostalCode, toPostalCode,
//   senderAddress, recipientAddress, requestedShippingDate, createdAt, updatedAt.
//
// Feldnamen von senderAddress/recipientAddress sind im Kontrakt NICHT explizit
// dokumentiert (nur "{}" als Beispiel). Ermittelt aus dem tatsächlichen
// Datenmodell: NewShipmentPage.buildParty()/BookingPage.buildParty() bauen das
// exakt gleiche Objekt, das als sender/recipient an /calculate-price bzw. /book
// geht — Belegte Feldnamen dort: fullName, company, streetAndNumber,
// addressAddition, postalCode, city, country, phone, email (NICHT contactName,
// NICHT name — das ist das Adressbuch-Shape, ein ANDERES Datenmodell). Defensiv
// werden contactName/name dennoch als Fallback geprüft (Aufgabenstellung nennt
// beide als Möglichkeit), aber fullName hat Priorität als belegter Wert.
export const DRAFT_STATUS = "draft";

// ── Requestparameter (Pagination) ────────────────────────────────────────────
const DRAFT_LIST_QUERY_KEYS = ["limit", "cursor"];

export function buildDraftListParams({ limit, cursor } = {}) {
  const params = {};
  if (limit != null) params.limit = String(limit);
  // Cursor NUR opak weiterreichen — kein Dekodieren, keine Annahmen über den
  // Aufbau. null/undefined/"" → weggelassen (erste Seite).
  if (cursor != null && cursor !== "") params.cursor = String(cursor);
  return params;
}

export function toQueryString(params) {
  const q = new URLSearchParams();
  for (const key of DRAFT_LIST_QUERY_KEYS) {
    const raw = params?.[key];
    if (raw === undefined || raw === null) continue;
    const val = String(raw).trim();
    if (val !== "") q.set(key, val);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ── Pagination: Ergebnisse ohne Duplikate anfügen ───────────────────────────
export function appendDraftPage(existingItems, newItems) {
  const seen = new Set((existingItems || []).map((d) => d.id));
  const deduped = (newItems || []).filter((d) => !seen.has(d.id));
  return [...(existingItems || []), ...deduped];
}

// Entfernt einen Draft anhand seiner id aus der geladenen Liste (nach
// erfolgreichem Löschen — sofortige lokale Entfernung, kein Reload).
export function removeDraftFromList(items, id) {
  return (items || []).filter((d) => d.id !== id);
}

// ── Anzeige: Empfänger ───────────────────────────────────────────────────────
// Priorität: company → fullName (Fallback contactName/name) → PLZ+Land →
// "Empfänger noch unvollständig". Kein spekulativer Zugriff auf erfundene Felder.
export function formatRecipientDisplay(draft) {
  const addr = draft?.recipientAddress;
  if (addr && typeof addr === "object") {
    const company = typeof addr.company === "string" ? addr.company.trim() : "";
    if (company) return company;
    const name = [addr.fullName, addr.contactName, addr.name]
      .find((v) => typeof v === "string" && v.trim().length > 0);
    if (name) return name.trim();
  }
  const country = (draft?.toCountry || "").trim();
  const postal = (draft?.toPostalCode || "").trim();
  if (country || postal) return [postal, country].filter(Boolean).join(" ");
  return "Empfänger noch unvollständig";
}

// ── Anzeige: Route ("DE 63743 → FR 75001") ──────────────────────────────────
function routeSide(country, postal) {
  const c = (country || "").trim().toUpperCase();
  const p = (postal || "").trim();
  if (!c && !p) return null;
  return [c, p].filter(Boolean).join(" ");
}

export function formatRoute(draft) {
  const from = routeSide(draft?.fromCountry, draft?.fromPostalCode);
  const to = routeSide(draft?.toCountry, draft?.toPostalCode);
  if (!from && !to) return "Route noch unvollständig";
  return `${from || "–"} → ${to || "–"}`;
}

// ── Anzeige: Paketdaten ──────────────────────────────────────────────────────
// { countLine: "2 Pakete · 8,5 kg" | null, dimsLine: "40 × 30 × 25 cm" | null }
export function formatPackageSummary(draft) {
  const countNum = Number(draft?.packageCount);
  const countLabel = Number.isFinite(countNum) && countNum > 0
    ? `${countNum} Paket${countNum === 1 ? "" : "e"}` : null;
  const weightNum = Number(draft?.weight);
  const weightLabel = draft?.weight != null && Number.isFinite(weightNum)
    ? `${weightNum.toLocaleString("de-DE")} kg` : null;
  const countLine = [countLabel, weightLabel].filter(Boolean).join(" · ") || null;

  const { length, width, height } = draft || {};
  const dimsLine = (length != null && width != null && height != null)
    ? `${length} × ${width} × ${height} cm` : null;

  return { countLine, dimsLine };
}

// ── Anzeige: Versanddatum ────────────────────────────────────────────────────
// Reine Werteauswahl — die eigentliche DE-Formatierung übernimmt der
// bestehende Helfer fmtDE() aus utils/date.js (keine neue Date-Bibliothek).
export function shippingDateValue(draft) {
  return draft?.requestedShippingDate || null;
}

// ── Fehlercode-Mapping ────────────────────────────────────────────────────────
const DRAFT_ERROR_MESSAGES = {
  DRAFT_NOT_AVAILABLE: "Diese Sendung kann derzeit nicht als Entwurf gespeichert werden.",
  DRAFT_NOT_FOUND: "Der Entwurf wurde bereits gelöscht oder ist nicht mehr verfügbar.",
};
const GENERIC_DRAFT_ERROR = "Der Entwurf konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.";
const GENERIC_DELETE_ERROR = "Der Entwurf konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.";

export function mapDraftErrorToMessage(code, fallback = GENERIC_DRAFT_ERROR) {
  return DRAFT_ERROR_MESSAGES[code] || fallback;
}
export function mapDraftDeleteErrorToMessage(code) {
  return DRAFT_ERROR_MESSAGES[code] || GENERIC_DELETE_ERROR;
}

// ── „Als Entwurf speichern" — Verfügbarkeit der numerischen Shipment-ID ─────
// Der Save-Endpunkt erwartet die interne numerische Shipment-ID. bookingData
// .shipmentId (aus /calculate-price → NewShipmentPage → Router-State) ist
// exakt dieselbe ID, die client.js bereits für Commercial-Invoice/Pickup-
// Window als "interne Confidara-Shipment-ID" verwendet (siehe ciPath-Kommentar
// in api/client.js) — kein Raten, kein neuer Vertrag.
export function hasSavableShipmentId(shipmentId) {
  if (shipmentId == null) return false;
  const s = String(shipmentId).trim();
  return s.length > 0;
}

// ── Empty-State-Text (nur "noch keine Entwürfe" — kein Suchtreffer-Fall im MVP) ──
export function draftsEmptyCopy() {
  return {
    title: "Noch keine Entwürfe",
    desc: "Speichere eine angefangene Sendung, um sie später weiterzubearbeiten.",
    cta: "Neue Sendung erstellen",
  };
}
