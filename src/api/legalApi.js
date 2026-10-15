// api/legalApi.js — Zugriff auf die Rechtsdokumente von ConfidaraExpress (Go-Live Paket 4-B).
//
// EINE Frage, EIN Endpunkt: gilt die Legal-Buchungsschranke gerade, und wenn ja, welche
// Fassungen muss der Kunde vor der Bestellung gesehen haben?
//
// ─── Warum das Frontend hier nichts selbst entscheidet ──────────────────────────────────────
// Es gibt genau EINEN Schalter, und er steht auf dem Server. Ein zusätzliches
// `VITE_LEGAL_BOOKING_GATE_ENABLED` könnte vom Serverwert abweichen — und die Abweichung wäre
// ausgerechnet im Checkout sichtbar: entweder verlangte die Oberfläche Bestätigungen, die der
// Server gar nicht auswertet, oder sie ließe die weg, die er verlangt. Deshalb wird gefragt,
// nicht konfiguriert.
//
// Der Endpunkt ist bewusst OHNE Auth (`auth: false`): Rechtsdokumente sind öffentlich, und die
// Antwort enthält weder Konto- noch Sendungsdaten. Damit läuft der Abruf auch dann sauber,
// wenn das Token gerade abgelaufen ist — der zentrale 401/403-Handler bleibt unberührt.
import { API, apiFetch } from "./client";

// ── Öffentliche Rechtsseiten (/agb, /datenschutz, /partnervereinbarung) ─────────
// Welche Fassung gilt, sagt GET /api/legal/current (getCurrentLegalSet, unten); trägt sie eine
// Webfassung, steht deren Pfad in `contentPath` (utils/legalPageState.mjs).

// GET …/inhalt — die Webfassung genau dieser Fassung. Öffentlich, ohne Auth; der Pfad kommt
// aus der Serverantwort und ist vorher geprüft (safeContentPath).
export function getLegalContent(contentPath, { signal } = {}) {
  return apiFetch(contentPath, { signal });
}

/** Adresse einer registrierten Fassung (PDF) am API-Host — oder null. */
export function legalDocumentUrl(documentPath) {
  return typeof documentPath === "string" && documentPath.startsWith("/api/legal/") ? `${API}${documentPath}` : null;
}

// Gibt die rohe Response zurück; der Aufrufer wertet Status und Body selbst aus (konsistent mit
// den übrigen Callern dieses Projekts). 200 → `{ enabled:false }` oder `{ enabled:true, setKey,
// documents }`; 503 → `LEGAL_DOCUMENTS_NOT_CONFIGURED` (Schranke an, Tresor nicht auslieferbar).
export function getLegalBookingContext({ signal } = {}) {
  return apiFetch(`/api/legal/booking-context`, { signal });
}

// Die heute gültigen Fassungen (Paket C): die Registrierung zeigt die AGB-Fassung an, der
// zugestimmt wird, und meldet ihren Setschlüssel als „gesehen" zurück. Öffentlich, ohne Auth.
// 200 → `{ setId, setKey, documents }`; 503 → keine auslieferbare Fassung.
export function getCurrentLegalSet({ signal } = {}) {
  return apiFetch(`/api/legal/current`, { signal });
}
