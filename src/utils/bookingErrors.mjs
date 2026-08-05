// ─────────────────────────────────────────────────────────────────────────────
// Buchungs-Fehlertexte für den RESTPFAD von POST /api/jumingo/book.
//
// „Restpfad" heißt: alles NACH den fachlichen Spezialzweigen der BookingPage
// (Zoll-Guard-Codes, 409 PICKUP_WINDOW_CHANGED/PRICE_CHANGED/Duplikat/Drift,
// 400/422 Zoll-/Adressfehler, 401/403 → zentraler Auth-Redirect). Diese
// Spezialzweige bleiben unverändert — hier wird nur der frühere Sammelzweig
// `throw new Error(d.error || "Buchung fehlgeschlagen")` ersetzt, über den
// 404/429/5xx ununterschieden liefen und ein Netzwerkabbruch als rohes
// „Failed to fetch" im Banner landete.
//
// Arbeitsteilung (Architekturprinzip): Transportklassifizierung zentral über
// utils/apiError.mjs — dieses Modul übersetzt nur in die Buchungs-Wortwahl.
// Framework-frei und damit ohne DOM mit `node --test` prüfbar.
// ─────────────────────────────────────────────────────────────────────────────
import { normalizeApiError, normalizeThrownError } from "./apiError.mjs";

export const BOOK_FEHLER = {
  RATE_LIMITED: {
    title: "Zu viele Anfragen",
    message: "Es wurden in kurzer Zeit zu viele Buchungsanfragen gesendet. Bitte warten Sie einen Moment und versuchen Sie es anschließend erneut.",
    retryable: true,
  },
  SERVER: {
    title: "Buchung momentan nicht möglich",
    message: "Die Buchung konnte aufgrund eines technischen Problems nicht abgeschlossen werden. Ihre Angaben bleiben erhalten. Bitte versuchen Sie es erneut.",
    retryable: true,
  },
  NETZ: {
    title: "Verbindung unterbrochen",
    message: "Die Verbindung zum Server wurde unterbrochen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie die Buchung erneut.",
    retryable: true,
  },
  UNLESBAR: {
    title: "Technisches Problem",
    message: "Die Antwort des Servers konnte nicht verarbeitet werden. Ihre Angaben bleiben erhalten. Bitte versuchen Sie es erneut.",
    retryable: true,
  },
  ANGEBOT_WEG: {
    title: "Angebot nicht mehr verfügbar",
    message: "Das ausgewählte Angebot ist nicht mehr verfügbar. Bitte lassen Sie die Versandangebote erneut berechnen.",
    retryable: false,
  },
};

// Restpfad einer NICHT-ok-Antwort. `body` ist der defensiv gelesene JSON-Body
// (null bei leerem/unlesbarem Body — z. B. HTML-Fehlerseite eines Proxys).
export function mapBookRestError(status, body) {
  if (status === 404) return BOOK_FEHLER.ANGEBOT_WEG;   // abgelaufenes/fremdes Angebot — neu berechnen ist die Handlung
  if (status === 429) return BOOK_FEHLER.RATE_LIMITED;
  if (status >= 500) return BOOK_FEHLER.SERVER;
  if (body === null || body === undefined) return BOOK_FEHLER.UNLESBAR;
  // Unerwarteter Reststatus mit lesbarem Body → zentrale Klassifizierung
  // (liest error UND message, wertet code aus, verliert nichts).
  const n = normalizeApiError({ status, body });
  return { title: n.title, message: n.message, retryable: n.retryable === true };
}

// Erfolgsstatus, aber der Body ließ sich nicht als Buchungsobjekt lesen —
// KEINE Erfolgsanzeige, keine Navigation, Angaben bleiben erhalten.
export function mapBookUnreadableSuccess() {
  return BOOK_FEHLER.UNLESBAR;
}

// Geworfene Fehler (fetch-Abbruch, Timeout …). Ein Abbruch während der Buchung
// wird wie ein Verbindungsproblem behandelt: ob die Order zustande kam, ist
// clientseitig nicht feststellbar — der Text lädt zum bewussten erneuten
// Versuch ein, ohne fälschlich Erfolg oder endgültiges Scheitern zu behaupten.
export function mapBookThrownError(e) {
  const n = normalizeThrownError(e);
  if (n.code === "NETWORK_ERROR" || n.code === "ABORTED") return BOOK_FEHLER.NETZ;
  return { title: n.title, message: n.message, retryable: n.retryable === true };
}
