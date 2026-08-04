import { apiFetch } from "./client";

// ── Benachrichtigungscenter (Kundenglocke) ───────────────────────────────────
// Drei Endpunkte, exakt die Pfadkonvention der übrigen Kundenaufrufe (/kunde/…,
// ohne /api) — dieselbe Basis wie /kunde/invoices und /kunde/support-requests.
//
// Es gibt bewusst KEINE Funktion, die eine Meldung als erledigt markiert: das
// Backend setzt `resolved_at` ausschließlich aus Fachereignissen (PDF-Abruf,
// Zahlungsverbuchung, Übergang zu überfällig, bestätigtes Öffnen eines
// Supportverlaufs). Ein Client könnte eine Rechnungsmeldung sonst wegklicken,
// ohne die Rechnung je abgerufen zu haben.
//
// Alle Funktionen geben die ROHE Response zurück; der Aufrufer wertet Status und
// JSON selbst aus (konsistent mit den übrigen Callern). Auth und das zentrale
// 401/403-Handling laufen über apiFetch.

export function listNotifications({ limit, offset } = {}) {
  const q = new URLSearchParams();
  if (Number.isInteger(limit) && limit > 0) q.set("limit", String(limit));
  if (Number.isInteger(offset) && offset > 0) q.set("offset", String(offset));
  const suffix = q.toString() ? `?${q}` : "";
  return apiFetch(`/kunde/notifications${suffix}`, { auth: true });
}

// Schlanker Endpunkt für das Polling — ein indizierter COUNT, keine Liste.
export function getUnreadCount() {
  return apiFetch(`/kunde/notifications/unread-count`, { auth: true });
}

// Explizit als GELESEN markieren — niemals als erledigt.
//
// `snapshotAt` ist der Zeitpunkt, den der Server mit der zuletzt geladenen Liste
// geliefert hat. Er begrenzt die Wirkung auf genau den Stand, den der Nutzer
// tatsächlich gesehen hat: trifft währenddessen eine neue Supportantwort ein
// (die eine aktive Meldung aggregiert und wieder auf ungelesen setzt), bleibt
// diese ungelesen, statt von einem veralteten Client stillschweigend
// mitmarkiert zu werden.
export function markNotificationsRead({ ids, all = false, snapshotAt } = {}) {
  const body = all ? { all: true } : { ids };
  if (snapshotAt) body.snapshotAt = snapshotAt;
  return apiFetch(`/kunde/notifications/mark-read`, {
    method: "POST",
    auth: true,
    body: JSON.stringify(body),
  });
}
