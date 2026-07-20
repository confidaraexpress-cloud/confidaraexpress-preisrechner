import { buildDraftListParams, toQueryString } from "../utils/draftsView.mjs";

export const API = import.meta.env.VITE_API_URL;

export const token = () => localStorage.getItem("ce_token");

export const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

export const jsonH = { "Content-Type": "application/json" };

// ── Central auth-error handler ───────────────────────────────────────────────
// AuthContext registers a handler here; apiFetch invokes it on a 401/403 from
// an authenticated request (auth: true). Public requests never trigger it.
let authErrorHandler = null;
export const setAuthErrorHandler = (fn) => { authErrorHandler = fn; };

// Macht den registrierten Handler für Sonderfälle aufrufbar, die bewusst kein
// `auth: true` nutzen (z.B. Passwortänderung, wo ein 401 meist "falsches
// Passwort" statt "Session ungültig" bedeutet, aber im P3-Fall doch Session-
// Invalidierung sein kann).
export const triggerAuthError = () => { if (authErrorHandler) authErrorHandler(); };

// ── Minimal central fetch wrapper (no dependency, no global fetch patch) ─────
// apiFetch("/path", { auth, method, body, headers, ... })
//   - auth: true  → adds Authorization (Bearer) + JSON Content-Type via authH()
//   - On 401/403 for an authenticated request: removes ce_token and fires the
//     central auth-error handler (→ logout + redirect). The raw Response is
//     still returned so existing callers keep their own .ok/.json()/status logic.
//   - Public requests (auth falsy) pass through untouched; their 401/403 is
//     returned normally and never triggers a logout.
export async function apiFetch(pathOrUrl, options = {}) {
  const { auth = false, headers, ...rest } = options;
  const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${API}${pathOrUrl}`;
  // FormData (Multipart-Upload): der Browser MUSS den Content-Type inklusive
  // Boundary selbst setzen. Daher bei auth:true nur den Bearer-Header, KEINEN
  // JSON-Content-Type. Rückwärtskompatibel — greift ausschließlich für FormData.
  const isFormData = typeof FormData !== "undefined" && rest.body instanceof FormData;
  const authHeaders = auth ? (isFormData ? { Authorization: `Bearer ${token()}` } : authH()) : null;
  const finalHeaders = auth ? { ...authHeaders, ...headers } : headers;
  const res = await fetch(url, { ...rest, headers: finalHeaders });
  if (auth && (res.status === 401 || res.status === 403)) {
    localStorage.removeItem("ce_token");
    if (authErrorHandler) authErrorHandler();
  }
  return res;
}

// ── Jumingo Access-Point / Paketshop-Suche (read-only) ───────────────────────
// Dünner Wrapper um POST /api/jumingo/access-points-search (auth-geschützt,
// read-only Proxy). Reine Orientierungs-/Anzeigesuche: KEINE Buchung, KEINE
// Persistenz — die Auswahl fließt bewusst NICHT in den /book-Payload. Die
// `carrierCodes` setzt der Aufrufer und sie müssen serverseitig allowlisted
// sein (aktuell ausschließlich "ups"). Gibt die rohe Response zurück; der
// Aufrufer wertet Status/JSON selbst aus (konsistent mit den übrigen Callern).
export function searchAccessPoints({ carrierCodes, countryCode, postCode, city, street, radius, onlyOpen }) {
  return apiFetch(`/api/jumingo/access-points-search`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ carrierCodes, countryCode, postCode, city, street, radius, onlyOpen }),
  });
}

// ── Abholzeitfenster: kundengewähltes Von/Bis-Fenster auf dem Draft laden/speichern ──
// GET/POST /api/jumingo/draft/pickup-window (auth, nur eigener Draft). Zeiten als "HH:mm".
// Speichern fail-closed: beide gesetzt ODER beide null; beide null → Fenster löschen.
// Buchungswirksam erst serverseitig im /book (dort autoritativ gegen den frischen Tarif geprüft;
// bei Drift 409 PICKUP_WINDOW_CHANGED). Gibt die rohe Response zurück — Aufrufer wertet selbst aus.
export function getDraftPickupWindow(shipmentId) {
  const id = encodeURIComponent(String(shipmentId ?? "").trim());
  return apiFetch(`/api/jumingo/draft/pickup-window?shipmentId=${id}`, { auth: true });
}

export function saveDraftPickupWindow({ shipmentId, pickupTimeFrom, pickupTimeUntil }) {
  return apiFetch(`/api/jumingo/draft/pickup-window`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ shipmentId, pickupTimeFrom, pickupTimeUntil }),
  });
}

// ── Versicherung: Live-Repricing (auth) ──────────────────────────────────────
// POST /api/jumingo/reprice-insurance — read-only Preisberechnung für eine
// gewählte Zusatzversicherung. WICHTIG (Backend-Vertrag): `insuranceType` wird
// FLACH gesendet (nicht verschachtelt), `value_currency` NICHT, und es werden
// KEINE Client-Preise übertragen. Gibt die rohe Response zurück (der Aufrufer
// wertet Status/JSON selbst aus, konsistent mit den übrigen Callern). Optionales
// AbortSignal, um veraltete In-Flight-Requests bei schneller Eingabe abzubrechen.
export function repriceInsurance(payload, { signal } = {}) {
  return apiFetch(`/api/jumingo/reprice-insurance`, {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload),
    signal,
  });
}

// ── Tracking (auth) ──────────────────────────────────────────────────────────
// Liest die additiven Tracking-Felder defensiv: Der Backend-Vertrag legt noch
// nicht endgültig fest, ob trackingAvailable/trackingNumber/trackingStatus/
// carrierTrackingPage top-level oder unter `tracking` liegen — daher beide
// Positionen prüfen (top-level hat Vorrang). Die bestehende verschachtelte
// Struktur (`tracking` inkl. `tracking.data.tracking_events`) wird unverändert
// weitergereicht, damit die vorhandene Timeline-Anzeige nicht bricht.
function selectTracking(d) {
  const payload = d && typeof d === "object" ? d : {};
  const nested  = payload.tracking && typeof payload.tracking === "object" ? payload.tracking : null;
  const pick = (key) =>
    payload[key] !== undefined ? payload[key]
    : nested && nested[key] !== undefined ? nested[key]
    : undefined;
  return {
    trackingAvailable:   pick("trackingAvailable"),
    trackingNumber:      pick("trackingNumber"),
    trackingStatus:      pick("trackingStatus"),
    carrierTrackingPage: pick("carrierTrackingPage"),
    tracking:            payload.tracking, // bestehende Struktur/Events unverändert weiterreichen
  };
}

// getTracking(shipmentId): GET /api/tracking/:shipmentId über das zentrale
// apiFetch (Bearer-Auth; 401/403 → zentraler Logout/Redirect). Wirft NICHT bei
// HTTP-Fehlern, sondern liefert { ok:false, status } zurück, damit der Aufrufer
// wie gewohnt eine kundenfreundliche Statusmeldung wählen kann. Bei Erfolg:
// { ok:true, status, ...defensiv selektierte Felder }. Kein Logging von Daten.
export async function getTracking(shipmentId) {
  const id = encodeURIComponent(String(shipmentId ?? "").trim());
  const r = await apiFetch(`/api/tracking/${id}`, { auth: true });
  if (!r.ok) return { ok: false, status: r.status };
  let d = {};
  try { d = await r.json(); } catch { /* leerer / kein JSON-Body → Defaults */ }
  return { ok: true, status: r.status, ...selectTracking(d) };
}

// ── Zoll-Handelsrechnung (Customs commercial invoice) ────────────────────────
// Dünne Wrapper um das bereits gemergte, auth-geschützte Confidara-Gateway.
// `:shipmentId` ist AUSSCHLIESSLICH die interne Confidara-Shipment-ID. Die PDF
// wird NUR über dieses Gateway übertragen — NIE direkt an JUMiNGO aus dem Browser.
// Kein Logging von Datei-/Body-Daten, keine Base64, keine Client-Persistenz.
const ciPath = (shipmentId) =>
  `/api/jumingo/shipments/${encodeURIComponent(String(shipmentId ?? "").trim())}/commercial-invoice`;

// GET → { present: true|false, document: {...}|null }. Rohe Response zurück; der
// Aufrufer liest Status/JSON defensiv (kein rohes Objekt rendern).
export function getCommercialInvoiceStatus(shipmentId) {
  return apiFetch(ciPath(shipmentId), { auth: true });
}

// POST multipart/form-data mit GENAU einem Feld `file`. Content-Type setzt der
// Browser (Boundary) — daher hier bewusst NICHT manuell gesetzt (apiFetch lässt
// ihn bei FormData weg). Keine UUID, kein Dokumenttyp, kein Multipart-Key aus
// UI-Eingaben — nur die interne shipmentId im Pfad.
export function uploadCommercialInvoice(shipmentId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch(ciPath(shipmentId), { method: "POST", auth: true, body: formData });
}

// DELETE → entfernt ausschließlich die commercial-invoice (idempotent). Kein Body.
export function deleteCommercialInvoice(shipmentId) {
  return apiFetch(ciPath(shipmentId), { method: "DELETE", auth: true });
}

// ── Benutzer-Entwürfe (Backend PR #162) ──────────────────────────────────────
// Ausschließlich bewusst gespeicherte Entwürfe (shipments.is_saved_draft=true).
// GET liefert Keyset-Pagination { items, nextCursor }; der Cursor wird NUR
// opak weitergereicht (buildDraftListParams/toQueryString in draftsView.mjs —
// kein Dekodieren, keine Annahmen über den Aufbau). :id ist überall die interne
// numerische Shipment-ID (NICHT jumingoShipmentId).
export function getDrafts({ limit, cursor } = {}, { signal } = {}) {
  const params = buildDraftListParams({ limit, cursor });
  return apiFetch(`/api/kunde/drafts${toQueryString(params)}`, { auth: true, signal });
}

// Speichert einen bestehenden technischen Draft bewusst als Benutzer-Entwurf
// (idempotent). `id` MUSS die interne numerische Shipment-ID sein.
export function saveDraft(id) {
  return apiFetch(`/api/kunde/drafts/${encodeURIComponent(String(id))}/save`, {
    method: "POST", auth: true,
  });
}

// Löscht einen eigenen gespeicherten Entwurf endgültig. Erfolg → 204 (kein Body).
export function deleteDraft(id) {
  return apiFetch(`/api/kunde/drafts/${encodeURIComponent(String(id))}`, {
    method: "DELETE", auth: true,
  });
}
