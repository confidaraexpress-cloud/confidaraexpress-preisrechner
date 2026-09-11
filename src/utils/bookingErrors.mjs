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
  // Zeitüberschreitung UNSERES Limits während /book (Phase 1, F5): der Ausgang ist
  // UNBEKANNT — der Server kann die Bestellung nach dem Abbruch noch platziert haben.
  // Deshalb ausdrücklich KEINE „bitte erneut versuchen"-Aufforderung, sondern zuerst
  // der Blick in die Sendungsliste. Serverseitig schützt der Buchungsclaim zusätzlich
  // vor einer Doppelbuchung desselben Vorgangs; der Text verlässt sich darauf nicht.
  // ─── CE-19: der Ausgang ist OFFEN — der Provider kann bereits gebucht haben ─────────
  // Serverseitig ist das ein eigener, ausdrücklich benannter Zustand: JUMiNGO antwortet
  // `502 BOOKING_OUTCOME_UNKNOWN` mit dem Text „bitte buchen Sie sie NICHT erneut",
  // Transglobal `202 BOOKING_PENDING` für einen mehrdeutigen oder klärungspflichtigen
  // Ausgang. In beiden Fällen liegt beim Anbieter unter Umständen eine echte, bezahlte
  // Sendung — ein zweiter Versuch erzeugte eine ZWEITE davon, an einen echten Empfänger.
  //
  // Deshalb steht hier bewusst KEINE Aufforderung zum Wiederholen, in keiner Formulierung.
  // Der Server sperrt den Vorgang zusätzlich (der Buchungsclaim bleibt stehen, das Angebot
  // gilt als verbraucht); dieser Text verlässt sich darauf nicht.
  PRUEFUNG_LAEUFT: {
    title: "Buchungsstatus wird geprüft",
    message: "Ihre Buchung wurde entgegengenommen, das Ergebnis steht aber noch nicht fest. Bitte senden Sie die Buchung NICHT erneut ab — es könnte sonst eine zweite Sendung entstehen. Den Stand finden Sie unter „Sendungen“; wir melden uns, sobald der Status feststeht.",
    retryable: false,
  },
  // Der Preis konnte VOR der Bestellung nicht bestätigt werden. Hier ist ausdrücklich
  // nichts beauftragt worden — ein erneuter Versuch ist sicher und die richtige Handlung.
  PREIS_UNBESTAETIGT: {
    title: "Preis konnte nicht bestätigt werden",
    message: "Der Preis für dieses Angebot ließ sich gerade nicht bestätigen. Es wurde nichts beauftragt und nichts berechnet. Bitte versuchen Sie es in einem Moment erneut.",
    retryable: true,
  },
  // Das Angebot ist nicht (mehr) buchbar oder die Buchung ist sauber gescheitert, ohne
  // dass etwas beauftragt wurde. Die Handlung ist NEU BERECHNEN, nicht wiederholen: ein
  // zweiter Versuch mit demselben Angebot endete genauso.
  NEU_BERECHNEN: {
    title: "Angebot nicht mehr buchbar",
    message: "Dieses Angebot kann nicht mehr gebucht werden. Es wurde nichts beauftragt. Bitte lassen Sie die Versandangebote neu berechnen und wählen Sie erneut.",
    retryable: false,
  },
  // Für dieselbe Sendung läuft bereits eine Buchung. Kein zweiter Versuch — er würde
  // entweder abgewiesen oder, schlimmer, eine zweite Sendung erzeugen.
  BUCHUNG_LAEUFT: {
    title: "Buchung läuft bereits",
    message: "Für diese Sendung läuft bereits eine Buchung. Bitte senden Sie sie nicht erneut ab und prüfen Sie den Stand unter „Sendungen“.",
    retryable: false,
  },
  // Das Angebot ist bereits VERBRAUCHT. Serverseitig geschieht das ausschließlich, wenn beim
  // Anbieter ein Auftrag existiert oder existieren KANN: gebucht, unklarer Ausgang,
  // klärungspflichtig. Es ist also ausdrücklich NICHT „nichts beauftragt" — eine Neuberechnung
  // lüde zu einer zweiten Sendung ein. Der richtige Ort ist die Sendungsliste.
  ANGEBOT_VERWENDET: {
    title: "Angebot bereits verwendet",
    message: "Mit diesem Angebot wurde bereits eine Buchung ausgelöst. Bitte senden Sie sie nicht erneut ab und prüfen Sie den Stand unter „Sendungen“.",
    retryable: false,
  },
  ZEIT_UNBEKANNT: {
    title: "Keine Antwort vom Server",
    message: "Der Server hat nicht rechtzeitig geantwortet. Ob die Buchung durchgeführt wurde, lässt sich gerade nicht feststellen. Bitte prüfen Sie zuerst unter „Sendungen“, ob die Sendung angelegt wurde, bevor Sie die Buchung erneut auslösen.",
    retryable: false,
  },
};

// ─── CE-19: die REALEN Backendcodes, nach Handlungsklasse ──────────────────────────
// Ermittelt aus dem Code, nicht aus Auditbezeichnungen: `lib/booking/bookHandler.js`
// (JUMiNGO) und `lib/booking/transglobalBookingEntry.js` (Transglobal).
//
//   Code                        Status   Ausgang                       Wiederholen?
//   BOOKING_OUTCOME_UNKNOWN     502      offen, evtl. gebucht          NIEMALS
//   BOOKING_PENDING             202      offen, evtl. gebucht          NIEMALS
//   BOOKING_IN_PROGRESS         409      läuft bereits                 NIEMALS
//   PRICE_UNCONFIRMED           503      nichts beauftragt             ja, sicher
//   OFFER_NOT_BOOKABLE          409      nichts beauftragt             neu berechnen
//   BOOKING_FAILED              409      nichts beauftragt             neu berechnen
//
// Die Zuordnung steht VOR der Statusauswertung, und das ist der Kern des Befunds: ein
// `502 BOOKING_OUTCOME_UNKNOWN` fiel bisher in den Sammelzweig `status >= 500` und bekam
// damit den Text „Bitte versuchen Sie es erneut." — obwohl der Server im selben Body
// wörtlich „bitte buchen Sie sie NICHT erneut" sagt. Der Client hat die einzige Warnung
// überschrieben, die vor einer doppelten, kostenpflichtigen Sendung schützt.
// ─── TG-7: weitere Codes, alle mit derselben Handlung ──────────────────────────────
// Sie standen bisher in keiner Tabelle und fielen damit in den 409-Sammelzweig der
// Buchungsseite. Dessen Text („Diese Sendung wurde bereits verarbeitet …") und dessen
// Knopf („Zu meinen Sendungen") sind für sie beide falsch: es wurde NICHTS beauftragt,
// und in der Sendungsliste steht deshalb auch nichts, das man dort prüfen könnte.
//
//   Code                            Status  Ausgang                    Wiederholen?
//   SHIPMENT_DECLARATIONS_MISMATCH  409     nichts beauftragt          neu berechnen
//   SHIPMENT_DECLARATIONS_MISSING   409     nichts beauftragt          neu berechnen
//   OFFER_MISMATCH                  409     nichts beauftragt          neu berechnen
//
// Alle bedeuten dasselbe: das vorliegende Angebot trägt nicht mehr. Ein zweiter Versuch
// mit derselben Angebotskennung endete zwangsläufig genauso — die einzige Handlung, die
// etwas ändert, ist eine neue Berechnung. Genau das sagt NEU_BERECHNEN bereits.
//
// ─── Buchungssicherheit: OFFER_ALREADY_USED ist KEIN „nichts beauftragt" ────────────
//   OFFER_ALREADY_USED              409     gebucht / evtl. gebucht    NIEMALS
// Ein Angebot wird serverseitig nur verbraucht, wenn beim Anbieter ein Auftrag existiert
// oder existieren KANN (gebucht, unklarer Ausgang, klärungspflichtig). Er stand bis hierher
// unter NEU_BERECHNEN — dessen Text („Es wurde nichts beauftragt") war dafür falsch, und die
// Neuberechnung lud zu einer zweiten Sendung ein. Er führt deshalb in die Sendungsliste.
//
// Die beiden Deklarationscodes sind nach TG-7 Defense-in-Depth: über die Oberfläche
// ist eine abweichende Angabe nicht mehr erzeugbar, seit die beantworteten Werte auf
// der Buchungsseite nur noch angezeigt werden. Erreichbar bleiben sie über einen
// gebauten Request und über ein zum Deploymentzeitpunkt offenes Bundle.
const BOOK_CODE_FEHLER = {
  BOOKING_OUTCOME_UNKNOWN: "PRUEFUNG_LAEUFT",
  BOOKING_PENDING:         "PRUEFUNG_LAEUFT",
  BOOKING_IN_PROGRESS:     "BUCHUNG_LAEUFT",
  PRICE_UNCONFIRMED:       "PREIS_UNBESTAETIGT",
  OFFER_NOT_BOOKABLE:      "NEU_BERECHNEN",
  BOOKING_FAILED:          "NEU_BERECHNEN",
  SHIPMENT_DECLARATIONS_MISMATCH: "NEU_BERECHNEN",
  SHIPMENT_DECLARATIONS_MISSING:  "NEU_BERECHNEN",
  OFFER_ALREADY_USED:             "ANGEBOT_VERWENDET",
  OFFER_MISMATCH:                 "NEU_BERECHNEN",
};

// Trägt diese Antwort einen Ausgang, bei dem NICHTS beauftragt wurde und dieselbe
// Angebotskennung nicht mehr trägt? Eigener Export, weil die Buchungsseite ihre
// 409-Zweige in fester Reihenfolge prüft und dort denselben Satz Codes braucht,
// ohne ihn ein zweites Mal aufzuschreiben.
export function fordertNeuberechnung(body) {
  const code = body && typeof body === "object" ? body.code : null;
  return typeof code === "string" && BOOK_CODE_FEHLER[code] === "NEU_BERECHNEN";
}

// Trägt diese Antwort einen Ausgang, bei dem der Provider bereits gebucht haben KANN?
// Eigener Export, weil die Buchungsseite das auch für einen ERFOLGSSTATUS (202) wissen
// muss, wo `mapBookRestError` gar nicht läuft.
export function istOffenerAusgang(status, body) {
  const code = body && typeof body === "object" ? body.code : null;
  return code === "BOOKING_PENDING" || code === "BOOKING_OUTCOME_UNKNOWN";
}

// Restpfad einer NICHT-ok-Antwort. `body` ist der defensiv gelesene JSON-Body
// (null bei leerem/unlesbarem Body — z. B. HTML-Fehlerseite eines Proxys).
export function mapBookRestError(status, body) {
  // Ein bekannter Backendcode entscheidet IMMER vor dem Status. Ein Status ist eine
  // Transportklasse, ein Code ist eine fachliche Aussage über den Ausgang — und nur die
  // zweite weiß, ob eine Wiederholung eine zweite Sendung erzeugen würde.
  const code = body && typeof body === "object" ? body.code : null;
  if (code && BOOK_CODE_FEHLER[code]) return BOOK_FEHLER[BOOK_CODE_FEHLER[code]];
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
  // Zeitlimit VOR dem Netz-Sammelfall: ein Timeout heißt bei der Buchung „Ausgang
  // unbekannt", nicht „Verbindung prüfen und erneut versuchen".
  if (n.code === "TIMEOUT") return BOOK_FEHLER.ZEIT_UNBEKANNT;
  if (n.code === "NETWORK_ERROR" || n.code === "ABORTED") return BOOK_FEHLER.NETZ;
  return { title: n.title, message: n.message, retryable: n.retryable === true };
}
