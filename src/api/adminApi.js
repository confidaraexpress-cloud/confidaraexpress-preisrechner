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
