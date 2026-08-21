import { apiFetch } from "./client";
import { BILLING_MODES as ADMIN_BILLING_MODES } from "../utils/billingModeView.mjs";
import { buildCancellationPatchBody } from "../utils/adminCancellations.mjs";
import { buildSupportPatchBody } from "../utils/adminSupportView.mjs";
import { buildPriceMarkupBody } from "../utils/customerMarkup.mjs";
import { idempotencyHeader } from "../utils/idempotencyKey.mjs";

// ── Admin-API (dünner Wrapper um das zentrale apiFetch) ──────────────────────
// Alle Aufrufe laufen über apiFetch(..., { auth: true }): Bearer-Header und das
// zentrale 401/403-Handling (Token-Entfernung + Logout/Redirect) greifen damit
// unverändert. Diese Schicht ist bewusst „dünn": sie baut nur einen sauberen
// Query-String und reicht die rohe Response zurück — der Aufrufer wertet
// Status/JSON selbst aus (konsistent mit searchAccessPoints/repriceInsurance in
// client.js).
//
// WICHTIG (Sicherheit/Datenschutz):
//   • KEIN persistenter Cache — jede Seite hält Daten nur im Komponenten-State.
//   • KEIN Logging von Antwortdaten (PII).
//   • Das Backend (requireAdmin) bleibt für JEDEN /admin/*-Endpunkt die
//     autoritative Autorisierung. Diese Datei ist reine Transport-/UX-Schicht,
//     kein Sicherheitsersatz.

// Nur explizit erlaubte Query-Parameter werden gesendet — keine erfundenen
// Felder. `page`/`page_size` folgen der gängigen Pagination-Konvention; falls
// der Backend-Vertrag andere Namen nutzt, ausschließlich hier anpassen.
const AUDIT_LOG_PARAMS = [
  "action",
  "result",
  "actor_user_id",
  "target_user_id",
  "from",
  "to",
  "page",
  "page_size",
];

// Baut aus einem Params-Objekt einen Query-String — nur allowlisted Keys, leere
// Werte werden verworfen. Kein Erfinden unbekannter Parameter.
function buildQuery(params, allow) {
  const q = new URLSearchParams();
  if (params && typeof params === "object") {
    for (const key of allow) {
      const raw = params[key];
      if (raw === undefined || raw === null) continue;
      const val = String(raw).trim();
      if (val !== "") q.set(key, val);
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// GET /admin/audit-logs — read-only. Gibt die rohe Response zurück; der Aufrufer
// prüft r.ok/r.status und liest den Body defensiv (kein rohes Objekt rendern).
export function listAuditLogs(params = {}) {
  return apiFetch(`/admin/audit-logs${buildQuery(params, AUDIT_LOG_PARAMS)}`, { auth: true });
}

// Erlaubte Query-Parameter für GET /admin/shipments (Backend-Vertrag). Bewusst
// allowlisted; Pagination läuft serverseitig über limit/offset.
const SHIPMENT_PARAMS = [
  "user_id",
  "status",
  "carrier",
  "created_from",
  "created_to",
  "has_tracking",
  "limit",
  "offset",
];

// GET /admin/shipments — read-only, PII-arm. Die UI arbeitet mit page/pageSize;
// hier zentral auf den Backend-Vertrag limit/offset gemappt (page ist 1-basiert):
//   page=1,pageSize=25 → limit=25&offset=0 · page=2 → limit=25&offset=25.
// Übrige Filter werden unverändert (aber allowlisted) durchgereicht; keine
// erfundenen Felder, kein persistenter Cache. Rohe Response zurück.
export function listAdminShipments(params = {}) {
  const { page = 1, pageSize = 25, ...filters } = params || {};
  const size = Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : 25;
  const p = Number(page) >= 1 ? Math.floor(Number(page)) : 1;
  const query = { ...filters, limit: size, offset: (p - 1) * size };
  return apiFetch(`/admin/shipments${buildQuery(query, SHIPMENT_PARAMS)}`, { auth: true });
}

// DELETE /admin/shipments/:id/draft — einen einzelnen Sendungsentwurf löschen.
// Kein Body: Endpunkt und :id identifizieren das Ziel eindeutig. Das Backend ist die
// verbindliche Sicherheitsinstanz — es prüft im Moment des Löschens erneut, ob die Zeile noch
// ein echter Entwurf ist (Status, Ordernummer, Label, Tracking, Rechnung, Stornoanfrage) und
// antwortet sonst mit 409, NICHT mit einem stillen Erfolg. 404 = unbekannt. Die Aktion wird
// serverseitig auditiert (admin.shipment.draft_delete). Rohe Response zurück.
export function deleteAdminShipmentDraft(id) {
  return apiFetch(`/admin/shipments/${encodeURIComponent(id)}/draft`, {
    method: "DELETE",
    auth: true,
  });
}

// DELETE /admin/shipments/drafts — ALLE Sendungsentwürfe systemweit löschen.
// Bewusst OHNE Parameter und ohne Body: die zu löschende Menge bestimmt ausschließlich der
// Server in einer Transaktion. Es werden weder IDs noch die aktuellen Listenfilter übermittelt —
// „Alle Entwürfe löschen" ist systemweit gemeint und darf nicht davon abhängen, was der Admin
// gerade filtert. Antwort: { deletedCount }. Auditiert (admin.shipment.draft_bulk_delete).
export function deleteAllAdminShipmentDrafts() {
  return apiFetch(`/admin/shipments/drafts`, {
    method: "DELETE",
    auth: true,
  });
}

// GET /admin/shipments/:id — read-only Detail. Der Detailabruf wird backendseitig
// auditiert (admin.shipment.view). Keine Query-Parameter, kein persistenter Cache.
// Rohe Response zurück; der Aufrufer liest den Body defensiv und rendert nie das
// ganze Objekt.
export function getAdminShipment(id) {
  return apiFetch(`/admin/shipments/${encodeURIComponent(id)}`, { auth: true });
}

// GET /admin/shipments/:id/label — lädt das Versandlabel als PDF-Blob und stößt
// einen Browser-Download an. Bewusst wie utils/downloadLabel.js (Kundenpfad),
// nur gegen den Admin-Endpunkt — der Kundenpfad selbst bleibt unangetastet.
// Sicherheit/Datenschutz:
//   • KEINE JSON-Annahme bei Erfolg (Blob), KEIN Speichern der Bytes: der Blob
//     lebt nur lokal, die ObjectURL wird sofort nach dem Klick revoked.
//   • KEIN Preview/Inline-Render, KEIN Logging von Labeldaten.
//   • Bei Fehlern wird eine Error mit .status geworfen (der Aufrufer mappt auf
//     verständliche Texte) — es wird KEIN roher Backend-Body ausgegeben.
//   • Der Abruf wird backendseitig auditiert (admin.shipment.label_download).
export async function downloadAdminShipmentLabel(id) {
  let r;
  try {
    r = await apiFetch(`/admin/shipments/${encodeURIComponent(id)}/label`, { auth: true });
  } catch {
    const err = new Error("Label konnte nicht heruntergeladen werden.");
    err.network = true;
    throw err;
  }
  if (!r.ok) {
    const err = new Error("Label konnte nicht heruntergeladen werden.");
    err.status = r.status; // 401/403 hat apiFetch bereits zentral behandelt
    throw err;
  }
  const blob = await r.blob();
  if (!blob || blob.size === 0) {
    const err = new Error("Label konnte nicht heruntergeladen werden.");
    err.empty = true;
    throw err;
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `confidara-label-${id}.pdf`;
    a.click();
  } finally {
    URL.revokeObjectURL(url); // Blob-URL sofort freigeben — nichts bleibt liegen
  }
}

// GET /admin/shipments/:id/tracking — read-only, liefert ausschließlich
// minimierte Trackingdaten (nie rohe JUMiNGO-Response). Der Abruf wird
// backendseitig auditiert (admin.shipment.tracking_view). KEIN Cache, KEINE
// Persistierung, kein Logging. Rohe Response zurück; der Aufrufer selektiert
// defensiv nur die erlaubten Felder (nie das ganze Objekt, keine Events).
export function getAdminShipmentTracking(id) {
  return apiFetch(`/admin/shipments/${encodeURIComponent(id)}/tracking`, { auth: true });
}

// POST /admin/shipments/:id/email-deliveries/:deliveryId/retry — stößt EINE bereits
// fehlgeschlagene Zusatzzustellung erneut an. Bewusst OHNE Body: Empfänger, Betreff,
// Inhalt, Anhang und Trackinglink stehen serverseitig fest und dürfen von keiner
// Clienteingabe bestimmt werden (sonst wäre die Funktion ein offenes Mailrelais).
// Der Server erlaubt den Versuch ausschließlich für eine Zustellung im Status
// „failed", die zu GENAU dieser Sendung gehört, und auditiert ihn.
export function retryAdminShipmentEmailDelivery(shipmentId, deliveryId) {
  return apiFetch(
    `/admin/shipments/${encodeURIComponent(shipmentId)}/email-deliveries/${encodeURIComponent(deliveryId)}/retry`,
    { method: "POST", auth: true }
  );
}

// Erlaubte Query-Parameter für GET /admin/users. Das Backend bietet aktuell
// KEINE Server-Filter — nur Pagination über limit/offset. Bewusst allowlisted.
const USER_PARAMS = ["limit", "offset"];

// GET /admin/users — read-only Kundenliste. UI arbeitet mit page/pageSize; hier
// zentral auf limit/offset gemappt (page=1→offset=0, page=2→offset=25). Keine
// Server-Filter, keine erfundenen Felder, kein Cache. Rohe Response zurück; der
// Aufrufer selektiert defensiv nur erlaubte Felder (nie password/hash/token).
export function listAdminUsers(params = {}) {
  const { page = 1, pageSize = 25 } = params || {};
  const size = Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : 25;
  const p = Number(page) >= 1 ? Math.floor(Number(page)) : 1;
  const query = { limit: size, offset: (p - 1) * size };
  return apiFetch(`/admin/users${buildQuery(query, USER_PARAMS)}`, { auth: true });
}

// Über die normale Statusroute setzbare Werte. „anonymized" ist bewusst NICHT
// dabei — Anonymisierung läuft über eine eigene, separat abzusichernde Aktion.
const SETTABLE_USER_STATUS = ["pending", "approved", "blocked"];

// PATCH /admin/users/:id/status — Kundenstatus setzen. Content-Type
// application/json + Bearer kommen aus apiFetch(auth:true). Es wird
// AUSSCHLIESSLICH { status } gesendet (keine weiteren Felder). Die Änderung wird
// backendseitig auditiert (user.status_change). Kein Cache, kein Logging von
// Response-Daten; 401/403 behandelt apiFetch zentral. Defensiver Guard: nur
// pending/approved/blocked werden je gesendet — nie „anonymized" o. Ä.
export function setAdminUserStatus(userId, status) {
  if (!SETTABLE_USER_STATUS.includes(status)) {
    return Promise.reject(new Error("invalid_status"));
  }
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/status`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify({ status }),
  });
}

// GET /admin/users/:id — read-only Kundendetail (User + Aggregat-Summary).
// Keine Query-Parameter, kein Cache, kein Logging von Response-Daten. Rohe
// Response zurück; der Aufrufer selektiert defensiv nur erlaubte Felder (nie
// password/hash/token/secret) und rendert nie das ganze Objekt.
export function getAdminUser(id) {
  return apiFetch(`/admin/users/${encodeURIComponent(id)}`, { auth: true });
}

// Erforderlicher Bestätigungswert für die irreversible Anonymisierung.
const ANONYMIZE_CONFIRM = "ANONYMIZE_USER";

// POST /admin/users/:id/anonymize — DSGVO-Anonymisierung (irreversibel). Der Body
// ist exakt { confirm: "ANONYMIZE_USER", targetUserId: <id> } — keine weiteren
// Felder. Defensiver Guard: es wird NUR gesendet, wenn im UI exakt
// „ANONYMIZE_USER" getippt wurde (der Aufrufer übergibt den getippten Wert).
// Bearer + Content-Type kommen aus apiFetch(auth:true). Kein Cache, kein Logging;
// 401/403 behandelt apiFetch zentral.
export function anonymizeAdminUser(id, confirmation) {
  if (confirmation !== ANONYMIZE_CONFIRM) {
    return Promise.reject(new Error("confirm_mismatch"));
  }
  const targetUserId = /^\d+$/.test(String(id)) ? Number(id) : id;
  return apiFetch(`/admin/users/${encodeURIComponent(id)}/anonymize`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ confirm: ANONYMIZE_CONFIRM, targetUserId }),
  });
}

// DELETE /admin/users/:id — harte Löschung eines Kunden. Nur ohne abhängige
// Sendungs-/Rechnungsdaten möglich: der Backend-Delete-Guard blockiert andernfalls
// mit 409 (dann ist Anonymisierung der richtige Weg). Kein Body — der Endpunkt und
// die :id identifizieren das Ziel eindeutig. Bearer kommt aus apiFetch(auth:true).
// Die Aktion wird backendseitig auditiert (user.delete bzw. user.delete_denied).
// Kein Cache, kein Logging von Response-Daten; 401/403 behandelt apiFetch zentral.
export function deleteAdminUser(id) {
  return apiFetch(`/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: true,
  });
}

// ── Individueller Kundenaufschlag (Admin) ────────────────────────────────────
// Pfadkonvention wie bei allen übrigen Admin-Endpunkten dieser Datei: `/admin/…`
// OHNE führendes `/api`. VITE_API_URL enthält nur Schema+Domain
// (https://api.confidaraexpress.de) — der resultierende öffentliche Pfad ist
// exakt `/admin/users/:id/price-markup`, NIE `/api/admin/users/:id/price-markup`.
// Die :id stammt ausschließlich aus der aktuellen Adminroute; es wird nie ein
// Prozentwert oder ein anderer Pricing-Wert in Query-Parametern übertragen.

// GET /admin/users/:id/price-markup — read-only. Liefert
// { userId, priceMarkupPercent, confirmed, confirmedAt, confirmedBy, updatedAt }.
// Kein Cache, kein Logging von Antwortdaten. Optionales AbortSignal, damit ein
// Seitenwechsel eine noch laufende Abfrage abbrechen kann (kein veralteter
// Bestätigungsstatus in einer bereits gewechselten Ansicht). Rohe Response
// zurück; der Aufrufer selektiert defensiv über selectPriceMarkup().
export function getAdminCustomerPriceMarkup(userId, { signal } = {}) {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/price-markup`, { auth: true, signal });
}

// PUT /admin/users/:id/price-markup — ausdrückliche Bestätigung bzw.
// Aktualisierung des individuellen Kundenaufschlags durch den Admin.
//
// Der Body enthält AUSSCHLIESSLICH { priceMarkupPercent } und — sofern der
// Aufrufer ihn übergibt — { expressPriceMarkupPercent } (zentral über
// buildPriceMarkupBody zusammengesetzt — einzige Quelle der Wahrheit):
//   • KEINE Auditfelder (confirmed/confirmedAt/confirmedBy/updatedAt) — die setzt
//     ausschließlich das Backend aus der Adminsitzung.
//   • KEIN vollständiges Benutzerobjekt, KEINE userId im Body, KEINE dynamischen
//     Feldnamen und keine alternativen Schreibweisen.
// Beide Werte sind PROZENTWERTE (20 = 20 %, 0.20 = 0,20 %) — nie ein Faktor.
//
// expressRaw (optional, String aus dem Eingabefeld):
//   • nicht übergeben → das Feld fehlt im Body; das Backend lässt einen
//     gespeicherten Expressaufschlag dann UNVERÄNDERT (kein versehentliches Löschen).
//   • leerer String   → expressPriceMarkupPercent: null → Fallback auf den
//     Standardaufschlag wird ausdrücklich aktiviert.
//   • Zahlenstring    → dieser Wert (0 ist ein gültiger Aufschlag, kein „leer").
// Defensiver Guard: ein ungültiger Wert wird gar nicht erst gesendet (das
// Backend prüft ihn zusätzlich autoritativ und antwortet dann mit 400
// INVALID_PRICE_MARKUP_PERCENT bzw. INVALID_EXPRESS_MARKUP_PERCENT). Bearer +
// Content-Type aus apiFetch(auth:true); 401/403 behandelt apiFetch zentral.
export function updateAdminCustomerPriceMarkup(userId, priceMarkupPercent, expressRaw) {
  const body = buildPriceMarkupBody(priceMarkupPercent, expressRaw);
  if (!body) return Promise.reject(new Error("invalid_price_markup_percent"));
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/price-markup`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify(body),
  });
}

// ── Entfernt: setAdminUserTestBooking ────────────────────────────────────────
// Der Adminendpunkt PUT /admin/users/:id/test-booking existiert nicht mehr. Über
// den JUMiNGO-Sandboxgutschein entscheidet serverseitig der globale Pre-Live-
// Schalter JUMINGO_SANDBOX_ENABLED zusammen mit der Authentifizierung — es gibt
// keine kontoindividuelle Freigabe mehr, die eine Adminoberfläche setzen könnte.

// PUT /admin/users/:id/billing-mode — Abrechnungsart eines Kontos setzen.
//
// Gesendet wird AUSSCHLIESSLICH der Modus; das ausführende Adminkonto kommt
// serverseitig aus dem JWT und nie aus dem Body. Ein ungültiger Wert wird gar
// nicht erst gesendet — die erlaubte Menge ist dieselbe wie im Kundenportal und
// im Backend (eine Liste, drei Leser).
export function setAdminUserBillingMode(userId, billingMode) {
  if (!ADMIN_BILLING_MODES.includes(billingMode)) return Promise.reject(new Error("invalid_billing_mode"));
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/billing-mode`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify({ billingMode }),
  });
}

// POST /admin/consolidated-invoices/run — den Sammelrechnungslauf manuell anstoßen.
//
// Bewusst OHNE Parameter: kein Konto, kein Zeitraum, kein Stichtag. Ein Aufruf, über
// den sich der Abrechnungsstichtag von außen setzen ließe, wäre ein Weg, einen noch
// laufenden Zeitraum vorzeitig zu fakturieren.
export function runConsolidatedInvoicing() {
  return apiFetch(`/admin/consolidated-invoices/run`, { method: "POST", auth: true });
}

// Erlaubte Query-Parameter für GET /admin/invoices (Backend-Vertrag). Bewusst
// allowlisted; Pagination über limit/offset, `overdue` nur als "true".
const INVOICE_PARAMS = ["status", "user_id", "overdue", "limit", "offset"];

// GET /admin/invoices — read-only Rechnungsliste (read-only Forderungsübersicht,
// KEINE Zahlungs-/Mutationsaktion in diesem Schritt). UI arbeitet mit page/
// pageSize; hier zentral auf den Backend-Vertrag limit/offset gemappt (page=1→
// offset=0, page=2→offset=25). Filter status/user_id/overdue werden allowlisted
// durchgereicht — keine erfundenen Felder, kein Cache, kein Logging. Rohe Response
// zurück; der Aufrufer selektiert defensiv nur erlaubte Felder (nie password/
// hash/token) und rendert nie das ganze Objekt.
export function listAdminInvoices(params = {}) {
  const { page = 1, pageSize = 25, ...filters } = params || {};
  const size = Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : 25;
  const p = Number(page) >= 1 ? Math.floor(Number(page)) : 1;
  const query = { ...filters, limit: size, offset: (p - 1) * size };
  return apiFetch(`/admin/invoices${buildQuery(query, INVOICE_PARAMS)}`, { auth: true });
}

// GET /admin/invoices/:id — read-only Einzelrechnung (Backend-Vertrag: liefert
// { invoice: {...} }). Keine Query-Parameter, kein Body, kein Cache, kein Logging
// von Response-Daten. Rohe Response zurück; der Aufrufer selektiert defensiv nur
// erlaubte Felder (nie password/hash/token/secret, keine Adressen/Label/Tracking)
// und rendert nie das ganze Objekt. 401/403 behandelt apiFetch zentral.
export function getAdminInvoice(id) {
  return apiFetch(`/admin/invoices/${encodeURIComponent(id)}`, { auth: true });
}

// ── Stornierungsanfragen (Admin) ─────────────────────────────────────────────
// INTERNER Verwaltungsvorgang: Prüfen und Bearbeiten von Kunden-Storno-Wünschen.
// KEINE echte Carrier-/JUMiNGO-Stornierung, KEINE Erstattung/Gutschrift — diese
// Schicht transportiert nur; das Backend (requireAdmin) bleibt autoritativ.
//
// Pfadkonvention: konsistent mit allen übrigen Admin-Endpunkten dieser Datei
// wird `/admin/…` (ohne führendes `/api`) verwendet — VITE_API_URL enthält kein
// `/api`-Präfix (vgl. /admin/shipments, /admin/invoices, /admin/users). Falls der
// Backend-Vertrag abweichende Pfade/Feldnamen nutzt, ausschließlich hier anpassen.

// Erlaubte Query-Parameter für GET /admin/cancellation-requests. Bewusst
// allowlisted; Pagination über limit/offset, Statusfilter optional.
const CANCELLATION_PARAMS = ["status", "limit", "offset"];

// GET /admin/cancellation-requests — read-only paginierte Liste. UI arbeitet mit
// page/pageSize; hier zentral auf den Backend-Vertrag limit/offset gemappt
// (page=1→offset=0, page=2→offset=25). Der optionale Statusfilter wird
// allowlisted durchgereicht — keine erfundenen Felder, kein Cache, kein Logging.
// Rohe Response zurück; der Aufrufer liest den Body defensiv.
export function listAdminCancellationRequests(params = {}) {
  const { page = 1, pageSize = 25, ...filters } = params || {};
  const size = Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : 25;
  const p = Number(page) >= 1 ? Math.floor(Number(page)) : 1;
  const query = { ...filters, limit: size, offset: (p - 1) * size };
  return apiFetch(`/admin/cancellation-requests${buildQuery(query, CANCELLATION_PARAMS)}`, { auth: true });
}

// GET /admin/cancellation-requests/:id — read-only Detail (Anfrage inkl.
// Kundengrund, Sendungs-/Kundendaten und `revision` für Optimistic Locking).
// Keine Query-Parameter, kein Cache, kein Logging von Response-Daten. Rohe
// Response zurück; der Aufrufer selektiert defensiv nur erlaubte Felder.
export function getAdminCancellationRequest(id) {
  return apiFetch(`/admin/cancellation-requests/${encodeURIComponent(id)}`, { auth: true });
}

// PATCH /admin/cancellation-requests/:id — Status setzen und/oder interne Notiz
// speichern. Kanonischer Backend-Vertrag: der Body enthält `revision` (immer,
// Optimistic Locking) plus mindestens eines von `status` / `adminNote`. Die
// interne Notiz heißt im Vertrag ausschließlich `adminNote` (NICHT internal_note/
// admin_note/note) — der Body wird zentral über buildCancellationPatchBody
// zusammengesetzt (einzige Quelle der Wahrheit, keine zweite PATCH-Abstraktion).
// Bei zwischenzeitlicher Änderung antwortet das Backend mit 409 (Aufrufer lädt
// neu, kein Auto-Retry). Content-Type + Bearer kommen aus apiFetch(auth:true).
// Kein Cache, kein Logging; 401/403 behandelt apiFetch zentral.
export function updateAdminCancellationRequest(id, payload = {}) {
  const body = buildCancellationPatchBody(payload);
  return apiFetch(`/admin/cancellation-requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(body),
  });
}

// ── Supportanfragen (Admin) ─────────────────────────────────────────────────
// Erlaubte Query-Parameter laut Backendvertrag. `userId` filtert auf einen Kunden
// (Supportspalte im Kundenprofil) — dieselbe Liste, kein zweiter Endpunkt.
const SUPPORT_PARAMS = ["status", "category", "userId", "q", "sort", "limit", "offset"];

// GET /admin/support-requests — read-only paginierte Liste. UI arbeitet mit
// page/pageSize; hier zentral auf den Backendvertrag limit/offset gemappt.
// Die Liste liefert bewusst NICHT den vollen Nachrichtentext (nur eine
// serverseitig gekürzte Betreffvorschau). Kein Cache, kein Logging.
export function listAdminSupportRequests(params = {}) {
  const { page = 1, pageSize = 25, ...filters } = params || {};
  const size = Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : 25;
  const p = Number(page) >= 1 ? Math.floor(Number(page)) : 1;
  const query = { ...filters, limit: size, offset: (p - 1) * size };
  return apiFetch(`/admin/support-requests${buildQuery(query, SUPPORT_PARAMS)}`, { auth: true });
}

// GET /admin/support-requests/:id — read-only Detail (inkl. vollem Nachrichtentext,
// Kundendaten und `revision` für Optimistic Locking). Der Abruf wird serverseitig
// auditiert. Kein Cache, kein Logging von Response-Daten.
export function getAdminSupportRequest(id) {
  return apiFetch(`/admin/support-requests/${encodeURIComponent(id)}`, { auth: true });
}

// PATCH /admin/support-requests/:id — Status setzen und/oder internen Vermerk
// speichern. Der Body enthält `revision` (immer, Optimistic Locking) plus mindestens
// eines von `status` / `adminNote`; er wird zentral über buildSupportPatchBody
// zusammengesetzt (einzige Quelle der Wahrheit). Bei zwischenzeitlicher Änderung
// antwortet das Backend mit 409 und liefert den aktuellen Stand mit — der Aufrufer
// löst den Konflikt bewusst auf, es gibt KEINEN Auto-Retry.
//
// Fachlich: verschickt KEINE Kundenmail und verändert weder Sendung noch Rechnung
// oder Zahlung — die Bearbeitung ist rein organisatorisch.
export function updateAdminSupportRequest(id, payload = {}) {
  const body = buildSupportPatchBody(payload);
  return apiFetch(`/admin/support-requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(body),
  });
}

// PATCH /admin/invoices/:id/paid — markiert eine Rechnung als bezahlt. Der Endpunkt
// ist backendseitig idempotent + transaktional (setzt status='paid'/paid_at, gibt
// den reservierten Kundenkredit einmalig frei, auditiert invoice.mark_paid). KEIN
// Body — Endpunkt und :id identifizieren das Ziel eindeutig. Bearer aus
// apiFetch(auth:true); kein Cache, kein Logging, kein direkter fetch. 401/403
// behandelt apiFetch zentral. Rohe Response zurück; der Aufrufer liest defensiv
// { message, alreadyPaid } und rendert nie das ganze Objekt.
export function markAdminInvoicePaid(id) {
  return apiFetch(`/admin/invoices/${encodeURIComponent(id)}/paid`, {
    method: "PATCH",
    auth: true,
  });
}

// GET /admin/invoices/:id/pdf — auditierter Admin-Download der Rechnungs-PDF
// (Phase 3). Binärantwort (application/pdf) — der Aufrufer verarbeitet sie als
// Blob (utils/downloadInvoicePdf.js), niemals als öffentliche URL. Testdokumente
// sind für Admins erlaubt und serverseitig im Dateinamen gekennzeichnet.
export function getAdminInvoicePdf(id) {
  return apiFetch(`/admin/invoices/${encodeURIComponent(id)}/pdf`, { auth: true });
}

// POST /admin/invoices/:id/generate-document — stößt die serverseitige
// PDF-Erzeugung an (bei pending_document) bzw. wiederholt sie (bei
// document_failed). Idempotent: erzeugt keine neue Rechnung/Nummer und
// überschreibt kein fertiges Dokument (already_ready/in_progress als no_op).
// KEIN Body; Antwort enthält nur Status + sichere Metadaten, nie PDF-Bytes.
export function generateAdminInvoiceDocument(id) {
  return apiFetch(`/admin/invoices/${encodeURIComponent(id)}/generate-document`, {
    method: "POST",
    auth: true,
  });
}

// POST /admin/invoices/:id/send-email — kontrollierter Rechnungs-E-Mail-Versand
// (pending) bzw. erneuter Versuch (failed; das Backend klassifiziert als retry).
// Idempotent: bereits versendete Rechnungen antworten mit outcome already_sent
// OHNE zweiten Provider-Aufruf; die harte Testmodus-Sperre antwortet 409
// invoice_email_test_mode. KEIN Body — Empfänger/Inhalt stammen ausschließlich
// aus den serverseitig gespeicherten Snapshots, nie aus dem Client.
export function sendAdminInvoiceEmail(id) {
  return apiFetch(`/admin/invoices/${encodeURIComponent(id)}/send-email`, {
    method: "POST",
    auth: true,
  });
}

// POST /admin/invoices/:id/resend-email — BEWUSSTER erneuter Versand eines
// bereits versendeten, unveränderten Rechnungsdokuments (nur Status sent;
// sonst 409 invoice_email_not_sent_yet). Auditiert als invoice.email_resend.
export function resendAdminInvoiceEmail(id) {
  return apiFetch(`/admin/invoices/${encodeURIComponent(id)}/resend-email`, {
    method: "POST",
    auth: true,
  });
}

// ── Produktionsbereitschaft & PDF-Backfill (Phase 5, korrigierter Standardprozess) ──
// Alle drei Endpunkte sind serverseitig admin-geschützt (requireAdmin bleibt
// autoritativ). Die read-only GETs liefern ausschließlich secret-/PII-arme Felder
// (Feldnamen/Status/Zähler, nie Ausstellerwerte/Bankdaten/Snapshots). Der mutierende
// POST sendet AUSSCHLIESSLICH { confirm: true } — KEIN Empfänger, KEINE Preis-/
// Datumsangaben aus dem Client. Es gibt bewusst KEINE Produktiv-Konvertierungs- oder
// rückwirkende E-Mail-Sonderaktion mehr (auf ausdrücklichen Betreiberwunsch entfernt) —
// ein Admin nutzt für den E-Mail-Versand einer PDF-gebackfillten Rechnung den ganz
// normalen sendAdminInvoiceEmail-Wrapper oben.

// GET /admin/invoices/production-readiness — informative Anzeige, welche Aussteller-/
// Bank-/E-Mail-Stammdaten vor dem ersten echten Kunden noch ersetzt werden müssen.
// Blockiert NICHTS (weder den PDF-Backfill unten noch künftige Buchungen). Rohe
// Response zurück; der Aufrufer liest defensiv { ready, testMode, missingFields,
// placeholderFields, emailProviderReady, databaseReady, … Zähler }.
export function getInvoiceProductionReadiness() {
  return apiFetch(`/admin/invoices/production-readiness`, { auth: true });
}

// Erlaubte Query-Parameter für GET /admin/invoices/backfill-preview (Backend-Vertrag).
// Bewusst allowlisted; Pagination über limit/offset, status=missing|ready,
// generatable nur als "true"/"false".
const BACKFILL_PARAMS = ["status", "generatable", "limit", "offset"];

// GET /admin/invoices/backfill-preview — read-only Vorschau: für ALLE Rechnungen zu
// tatsächlich gebuchten Sendungen zeigt sie, ob bereits ein PDF vorliegt bzw. ob es
// aus den gespeicherten historischen Daten erzeugbar ist. UI arbeitet mit
// page/pageSize; hier zentral auf limit/offset gemappt. Filter werden allowlisted
// durchgereicht — keine erfundenen Felder, kein Cache, kein Logging. Rohe Response
// zurück; der Aufrufer liest defensiv { candidates, summary }.
export function listInvoiceBackfillPreview(params = {}) {
  const { page = 1, pageSize = 25, ...filters } = params || {};
  const size = Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : 25;
  const p = Number(page) >= 1 ? Math.floor(Number(page)) : 1;
  const query = { ...filters, limit: size, offset: (p - 1) * size };
  return apiFetch(`/admin/invoices/backfill-preview${buildQuery(query, BACKFILL_PARAMS)}`, { auth: true });
}

// POST /admin/invoices/:id/backfill-document — erzeugt NUR das FEHLENDE PDF einer
// bestehenden, tatsächlich gebuchten Rechnung (nutzt dieselbe Erzeugungslogik wie
// der normale Buchungsfluss). Der Body ist exakt { confirm: true } (bewusste
// Bestätigung; das Backend lehnt sonst mit 400 ab). Serverseitig: KEINE neue
// Rechnungsnummer, KEINE Änderung von Preis/Datum, KEIN JUMiNGO-Aufruf, KEIN
// automatischer E-Mail-Versand. Antwort trägt nur Status/Metadaten, nie PDF-Bytes.
export function backfillInvoiceDocument(id) {
  return apiFetch(`/admin/invoices/${encodeURIComponent(id)}/backfill-document`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ confirm: true }),
  });
}

// ── Öffentliche Adminantwort im Supportverlauf ───────────────────────────────
// POST /admin/support-requests/:id/messages — speichert eine für den Kunden
// SICHTBARE Antwort und erzeugt (serverseitig, in derselben Transaktion) dessen
// Glockenbenachrichtigung.
//
// Bewusst ein EIGENER Endpunkt neben dem PATCH (Status + interner Vermerk): die
// Trennung zwischen öffentlicher Antwort und interner Notiz soll nicht davon
// abhängen, welches Feld gerade befüllt wird. Der Body trägt ausschließlich den
// Nachrichtentext — die Sichtbarkeit setzt der Server fest auf „öffentlich".
// `idempotencyKey` identifiziert die Absendeaktion: eine Wiederholung nach einem
// verlorenen Response erzeugt serverseitig KEINE zweite Nachricht, keine zweite
// Kundenbenachrichtigung und keinen zweiten Auditeintrag. Der Body bleibt
// ausschliesslich `{ message }` — der Schluessel reist im Header.
export function replyAdminSupportRequest(id, message, idempotencyKey) {
  return apiFetch(`/admin/support-requests/${encodeURIComponent(String(id))}/messages`, {
    method: "POST",
    auth: true,
    headers: idempotencyHeader(idempotencyKey),
    body: JSON.stringify({ message }),
  });
}
