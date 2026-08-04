import { apiFetch } from "./client";
import { buildSupportRequestBody } from "../utils/supportRequest.mjs";
import { idempotencyHeader } from "../utils/idempotencyKey.mjs";

// ── Supportanfrage (Kunde) ───────────────────────────────────────────────────
// POST /kunde/support-requests — legt eine allgemeine Supportanfrage an. KEINE
// Sendungs-, Rechnungs- oder Zahlungswirkung: die Anfrage ist rein kommunikativ.
// Antworten des Supports erscheinen im Nachrichtenverlauf des Vorgangs (und
// zusätzlich per E-Mail).
//
// Pfadbasis wie die übrigen Kundenendpunkte des Bereichs (/kunde/..., ohne /api) —
// dieselbe Konvention wie /kunde/shipments und die Stornierungsanfrage. Der Body
// enthält ausschließlich category/subject/message (zentral über
// buildSupportRequestBody, einzige Quelle der Wahrheit) — keine user_id, kein Status,
// keine Ticketnummer. Auth und das 401/403-Handling laufen zentral über apiFetch.
//
// Gibt die rohe Response zurück; der Aufrufer wertet Status/JSON selbst aus
// (konsistent mit den übrigen Callern) — u. a. 400 Validierung, 429 Rate-Limit.
// Kein Cache, kein Logging von Eingaben oder Antwortdaten.
export function createSupportRequest({ category, subject, message }) {
  return apiFetch(`/kunde/support-requests`, {
    method: "POST",
    auth: true,
    body: JSON.stringify(buildSupportRequestBody({ category, subject, message })),
  });
}

// ── Nachrichtenverlauf (Kunde) ───────────────────────────────────────────────
// Asynchrones Ticketsystem, kein Live-Chat: es gibt keinen Socket, keinen
// Onlinestatus und keine Tippanzeige — der Verlauf wird beim Öffnen geladen.
//
// Alle Funktionen geben die ROHE Response zurück; Auth und das zentrale
// 401/403-Handling laufen über apiFetch. Ein fremder oder unbekannter Vorgang
// antwortet serverseitig neutral mit 404.

// Eigene Vorgänge (Übersicht, ohne Nachrichtentexte).
export function listSupportRequests() {
  return apiFetch(`/kunde/support-requests`, { auth: true });
}

// Ein Vorgang samt öffentlichem Verlauf. Reines Lesen — dieser Aufruf verändert
// KEINE Benachrichtigung (das tut erst confirmSupportViewed).
export function getSupportRequest(id) {
  return apiFetch(`/kunde/support-requests/${encodeURIComponent(String(id))}`, { auth: true });
}

// Antwort im laufenden Vorgang. Ein geschlossener Vorgang wird dadurch
// serverseitig wieder geöffnet.
//
// `idempotencyKey` identifiziert die Absendeaktion und schützt gegen die
// Wiederholung nach einem verlorenen Response (siehe utils/idempotencyKey.mjs).
// Der Body bleibt unverändert `{ message }` — der Schlüssel reist im Header.
export function replySupportRequest(id, message, idempotencyKey) {
  return apiFetch(`/kunde/support-requests/${encodeURIComponent(String(id))}/messages`, {
    method: "POST",
    auth: true,
    headers: idempotencyHeader(idempotencyKey),
    body: JSON.stringify({ message }),
  });
}

// Bestätigt, dass der Verlauf BIS EINSCHLIESSLICH `throughMessageId` gesehen
// wurde. Erst dieser Aufruf erledigt die Glockenmeldung — und nur, wenn seither
// keine neuere Adminantwort eingetroffen ist. Dadurch geht eine Antwort, die
// genau währenddessen gespeichert wird, nicht ungesehen verloren.
export function confirmSupportViewed(id, throughMessageId) {
  return apiFetch(`/kunde/support-requests/${encodeURIComponent(String(id))}/viewed`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ throughMessageId }),
  });
}
