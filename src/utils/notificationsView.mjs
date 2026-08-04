// Reine Ansichtslogik des Benachrichtigungscenters (keine React-Abhängigkeit,
// kein DOM, kein Netz) — dadurch vollständig deterministisch testbar, wie die
// übrigen *View-Module des Projekts.

// ── Die drei Typen (abschließend) ────────────────────────────────────────────
// Spiegelt den Serververtrag (lib/notifications.js). Ein unbekannter Typ wird
// nicht geraten, sondern ausgeblendet: lieber eine Meldung weniger als eine
// Meldung, deren Aktion ins Leere führt.
export const NOTIFICATION_TYPES = Object.freeze(["invoice_ready", "invoice_overdue", "support_reply"]);

export const NOTIFICATION_TITLES = Object.freeze({
  invoice_ready: "Neue Rechnung verfügbar",
  invoice_overdue: "Rechnung überfällig",
  support_reply: "Neue Antwort vom Support",
});

// Aktionstext je Typ. Bei „Rechnung überfällig" ist das Ansehen die richtige
// Aktion — der Download würde die Meldung nicht erledigen (das tut erst die
// Zahlungsverbuchung), ein „PDF herunterladen" suggerierte dort eine Wirkung,
// die es nicht hat.
export const NOTIFICATION_ACTIONS = Object.freeze({
  invoice_ready: "PDF herunterladen",
  invoice_overdue: "Rechnung ansehen",
  support_reply: "Anfrage öffnen",
});

export function isNotificationType(value) {
  return typeof value === "string" && NOTIFICATION_TYPES.includes(value);
}

// ── Badge ────────────────────────────────────────────────────────────────────
// 0 → gar keine Anzeige · 1–9 → die Zahl · ab 10 → „9+".
export const BADGE_MAX = 9;
export function badgeLabel(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n > BADGE_MAX ? `${BADGE_MAX}+` : String(Math.floor(n));
}
export function showBadge(count) {
  return badgeLabel(count) !== "";
}
// Vorlesbare Fassung für aria-label — „9+" ist als Screenreader-Text unbrauchbar.
export function badgeAriaLabel(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return "Benachrichtigungen";
  return n === 1 ? "Benachrichtigungen: 1 ungelesen" : `Benachrichtigungen: ${Math.floor(n)} ungelesen`;
}

// ── Normalisierung einer Servermeldung ───────────────────────────────────────
// Defensiv: fehlende oder unbekannte Felder ergeben null statt eines geratenen
// Werts. Ein Eintrag ohne brauchbare Identität wird verworfen (Rückgabe null),
// damit die Liste keine unklickbaren Zeilen enthält.
export function normalizeNotification(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!isNotificationType(raw.type)) return null;

  const invoiceId = Number.isInteger(Number(raw.invoiceId)) && Number(raw.invoiceId) > 0 ? Number(raw.invoiceId) : null;
  const supportRequestId = Number.isInteger(Number(raw.supportRequestId)) && Number(raw.supportRequestId) > 0
    ? Number(raw.supportRequestId) : null;

  // Typ und Entität müssen zusammenpassen — sonst ist die Aktion nicht bestimmbar.
  if ((raw.type === "invoice_ready" || raw.type === "invoice_overdue") && invoiceId === null) return null;
  if (raw.type === "support_reply" && supportRequestId === null) return null;

  const unseen = Number(raw.unseenCount);
  return {
    id,
    type: raw.type,
    title: NOTIFICATION_TITLES[raw.type],
    actionLabel: NOTIFICATION_ACTIONS[raw.type],
    invoiceId,
    invoiceNumber: typeof raw.invoiceNumber === "string" && raw.invoiceNumber ? raw.invoiceNumber : null,
    supportRequestId,
    ticketNumber: typeof raw.ticketNumber === "string" && raw.ticketNumber ? raw.ticketNumber : null,
    unseenCount: Number.isFinite(unseen) && unseen > 1 ? Math.floor(unseen) : null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
    read: raw.readAt != null,
  };
}

export function normalizeNotificationList(data) {
  const rows = data && Array.isArray(data.notifications) ? data.notifications : [];
  return rows.map(normalizeNotification).filter(Boolean);
}

// ── Zweite Zeile einer Meldung ───────────────────────────────────────────────
// Beleg- bzw. Ticketnummer als Kontext; bei mehreren ungesehenen Antworten die
// aggregierte Anzahl statt vieler Einzelmeldungen.
export function notificationSubline(n) {
  if (!n) return "";
  if (n.type === "support_reply") {
    const base = n.ticketNumber || "Supportanfrage";
    return n.unseenCount ? `${base} · ${n.unseenCount} neue Antworten` : base;
  }
  return n.invoiceNumber || "Rechnung";
}

// ── Navigationsziel ──────────────────────────────────────────────────────────
// Das Ziel wird AUSSCHLIESSLICH aus Typ und Entitäts-ID abgeleitet — es wird
// niemals eine URL aus dem Serverpayload geöffnet. Damit gibt es keine Fläche
// für eine manipulierte Weiterleitung, und die Ziele bleiben an das bestehende
// Navigationsmodell gebunden (?page=… mit fester Allowlist).
export function notificationTarget(n) {
  if (!n) return null;
  if (n.type === "support_reply") {
    return { page: "support", ticket: n.supportRequestId };
  }
  return { page: "invoices", invoice: n.invoiceId };
}

// Query-String für einen Deep-Link ins Dashboard. Ausschließlich aus geprüften
// Ganzzahlen und festen Seitenschlüsseln zusammengesetzt.
export function notificationHref(n) {
  const t = notificationTarget(n);
  if (!t) return null;
  if (t.page === "support") {
    return t.ticket ? `/dashboard?page=support&ticket=${encodeURIComponent(String(t.ticket))}` : "/dashboard?page=support";
  }
  return "/dashboard?page=invoices";
}

// ── Zeitangabe ───────────────────────────────────────────────────────────────
// Kurze relative Angabe für die Liste; ab einer Woche das Datum. `now` ist ein
// Parameter, damit die Funktion deterministisch testbar bleibt.
export function relativeTime(value, now = new Date()) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return "gerade eben";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.floor(min / 60);
  if (std < 24) return `vor ${std} Std.`;
  const tage = Math.floor(std / 24);
  if (tage === 1) return "gestern";
  if (tage < 7) return `vor ${tage} Tagen`;
  return d.toLocaleDateString("de-DE");
}

// ── Texte ────────────────────────────────────────────────────────────────────
export const PANEL_TITLE = "Benachrichtigungen";
export const MARK_ALL_LABEL = "Alle als gelesen markieren";
export const EMPTY_TITLE = "Keine neuen Benachrichtigungen";
export const EMPTY_TEXT = "Sobald eine Rechnung bereitsteht oder der Support antwortet, erscheint es hier.";
export const LOADING_TEXT = "Benachrichtigungen werden geladen …";
export const LOAD_ERROR_TEXT = "Die Benachrichtigungen konnten nicht geladen werden.";
export const RETRY_LABEL = "Erneut versuchen";

// ── Aktualisierungsstrategie ─────────────────────────────────────────────────
// Zurückhaltendes Polling, ausschließlich bei sichtbarem Tab (das Intervall wird
// bei verborgenem Tab abgebaut, nicht nur übersprungen). Keine WebSockets, keine
// zusätzliche Abhängigkeit.
export const POLL_INTERVAL_MS = 60000;

// Ungelesenenzahl aus einer Serverantwort — defensiv gegen fehlende Felder.
export function readUnreadCount(data) {
  const n = data && Number(data.unreadCount);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function readSnapshot(data) {
  const s = data && data.snapshotAt;
  return typeof s === "string" && s ? s : null;
}
