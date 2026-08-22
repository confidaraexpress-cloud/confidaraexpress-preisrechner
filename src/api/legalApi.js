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
import { apiFetch } from "./client";

// Gibt die rohe Response zurück; der Aufrufer wertet Status und Body selbst aus (konsistent mit
// den übrigen Callern dieses Projekts). 200 → `{ enabled:false }` oder `{ enabled:true, setKey,
// documents }`; 503 → `LEGAL_DOCUMENTS_NOT_CONFIGURED` (Schranke an, Tresor nicht auslieferbar).
export function getLegalBookingContext({ signal } = {}) {
  return apiFetch(`/api/legal/booking-context`, { signal });
}
