import { apiFetch } from "./client";

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
