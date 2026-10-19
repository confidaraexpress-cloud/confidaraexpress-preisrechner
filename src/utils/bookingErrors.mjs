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
import { normalizeApiError } from "./apiError.mjs";
import { inventoryErrorText } from "./inventoryErrors.mjs";
import {
  SAME_DAY_TEXT, SAME_DAY_COLLECTION_UNAVAILABLE_CODE, SAME_DAY_UNAVAILABLE_KIND, sameDayUnavailableKindOf,
} from "./sameDayCollectionView.mjs";

// TG22 Paket B — derselbe Satz bei /book und bei der Neubepreisung der Absicherung.
export const OFFER_ALREADY_USED_TEXT = "Dieses Angebot wurde bereits verwendet. Bitte prüfen Sie Ihre Sendungen.";

// TG22 Paket B — 400 INVALID_REFERENCE_NUMBER (Feld `referenceNumber`).
export const REFERENCE_INVALID_TEXT =
  "Die Referenznummer enthält unzulässige Zeichen. Bitte verwenden Sie höchstens 35 gut lesbare Zeichen.";

export const BOOK_FEHLER = {
  RATE_LIMITED: {
    title: "Zu viele Anfragen",
    message: "Es wurden in kurzer Zeit zu viele Buchungsanfragen gesendet. Bitte warten Sie einen Moment und versuchen Sie es anschließend erneut.",
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
  // ─── CE-19: der Ausgang ist OFFEN — der Provider kann bereits gebucht haben ─────────
  // Serverseitig ist das ein eigener, ausdrücklich benannter Zustand: `502
  // BOOKING_OUTCOME_UNKNOWN` (auch nach einem Fehler NACH der Bestellung beim Anbieter) mit dem
  // Text „bitte buchen Sie sie NICHT erneut", `202 BOOKING_PENDING` für einen mehrdeutigen oder
  // klärungspflichtigen Ausgang. In beiden Fällen liegt beim Anbieter unter Umständen eine
  // echte, bezahlte Sendung — ein zweiter Versuch erzeugte eine ZWEITE davon.
  //
  // ─── TG22 Paket B: dieselbe Lage OHNE Code ─────────────────────────────────────────
  // Ein Zeitlimit, ein Verbindungsabbruch, ein unlesbarer Erfolg oder ein 5xx ohne Code nach
  // dem Absenden der FINALEN Buchung sagen nichts darüber, ob bestellt wurde. Bis hierher
  // bekamen sie „Bitte versuchen Sie es erneut" (Netz, 5xx, unlesbar) — genau die Einladung
  // zur zweiten Sendung, die dieser Text verhindern soll. Sie laufen deshalb ebenfalls hierher.
  //
  // Deshalb steht hier bewusst KEINE Aufforderung zum Wiederholen, in keiner Formulierung.
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
    message: OFFER_ALREADY_USED_TEXT,
    retryable: false,
  },
  // TG22 Residential: für dieses Angebot ist die Art der Lieferadresse noch nicht gewählt (oder
  // muss neu bestätigt werden). Nichts beauftragt; die Handlung steht auf der Buchungsseite.
  PREISANGABE_FEHLT: {
    title: "Art der Lieferadresse fehlt",
    message: "Bitte wählen Sie zuerst die Art der Lieferadresse.",
    retryable: false,
  },
  // TG22/TG23 Same-Day: die Abholung heute trägt nicht. Nichts beauftragt; dieselbe Angebotskennung trägt
  // heute nicht mehr — die Handlung ist ein späterer Abholtag, also neu berechnen. Nie „erneut versuchen".
  // Welcher Satz, sagt die Art der Antwort (`sameDayUnavailableKind`): „nicht mehr möglich" nur beim
  // zeitlichen Ablauf; ohne oder mit unbekannter Art der zurückhaltende Satz „kann derzeit nicht bestätigt werden".
  ABHOLUNG_HEUTE_VORBEI: {
    title: SAME_DAY_TEXT.unavailable,
    message: SAME_DAY_TEXT.bookingUnavailable,
    retryable: false,
  },
  ABHOLUNG_HEUTE_UNBESTAETIGT: {
    title: SAME_DAY_TEXT.unconfirmed,
    message: SAME_DAY_TEXT.bookingUnconfirmed,
    retryable: false,
  },
  ABHOLUNG_HEUTE_NICHT_PRUEFBAR: {
    title: SAME_DAY_TEXT.unverifiable,
    message: SAME_DAY_TEXT.bookingUnverifiable,
    retryable: false,
  },
  // ─── P0-01: NACHWEISLICH NICHT BESTELLT ───────────────────────────────────────────
  // Der Server sagt mit `BOOKING_FAILED`, dass beim Anbieter bewiesen NICHTS bestellt wurde — der
  // Buchungsweg brach vor der Bestellung ab (Tarifabruf, Entwurf, Warenkorb, Verbindung) oder der Anbieter
  // hat dokumentiert abgelehnt. Der Status ist dabei eine Transportaussage (409, aber auch 502/503/500):
  // ein 5xx MIT diesem Code ist kein offener Ausgang. Bis hierher las die Seite ihn als „Angebot nicht
  // mehr buchbar" — das stimmt nicht: das Angebot kann nach einer Neuberechnung wieder tragen.
  NICHT_DURCHGEFUEHRT: {
    title: "Buchung nicht durchgeführt",
    message: "Die Buchung wurde nicht durchgeführt. Es wurde nichts beauftragt und nichts berechnet. Bitte berechnen Sie die Angebote neu und versuchen Sie es erneut.",
    retryable: false,
  },
  // Der bestätigte Gutschein gilt unmittelbar vor der Bestellung nicht mehr. Nichts beauftragt; der
  // Preis ohne Gutschein ist ein anderer — die Handlung ist eine Neuberechnung, kein Wiederholen.
  GUTSCHEIN_NICHT_ANWENDBAR: {
    title: "Gutschein nicht mehr anwendbar",
    message: "Der Gutscheincode konnte nicht mehr angewendet werden. Es wurde nichts beauftragt und nichts berechnet. Bitte berechnen Sie die Angebote neu und prüfen Sie den Preis.",
    retryable: false,
  },
  // Zollpflichtige Sendungen sind serverseitig gerade nicht buchbar. Nichts beauftragt; eine Neuberechnung
  // repariert das nicht, ein späterer Versuch mit denselben Angaben schon.
  ZOLL_DERZEIT_NICHT_BUCHBAR: {
    title: "Zollpflichtige Buchung derzeit nicht möglich",
    message: "Zollpflichtige Sendungen können derzeit nicht gebucht werden. Es wurde nichts beauftragt und nichts berechnet. Bitte versuchen Sie es später erneut.",
    retryable: true,
  },
  // Nach dem Hinterlegen der eigenen Handelsrechnung ist die Sendung noch nicht versandbereit. Nichts
  // beauftragt; dieselbe Buchung trägt, sobald die Sendung bereit ist.
  ZOLL_NOCH_NICHT_BEREIT: {
    title: "Sendung noch nicht versandbereit",
    message: "Die Sendung ist nach dem Hinterlegen der Handelsrechnung noch nicht versandbereit. Es wurde nichts beauftragt und nichts berechnet. Bitte versuchen Sie es in einigen Minuten erneut.",
    retryable: true,
  },
  // ─── P1-03: DER FRÜHESTE ABHOLTAG HAT SICH GEÄNDERT ───────────────────────────────
  // Das Angebot zeigte einen Abholtag; unmittelbar vor der Buchung nennt der Anbieter einen anderen. Es
  // wird nichts beauftragt — der Kunde bucht nie still einen anderen Tag, als er gesehen hat. Der Satz mit
  // dem neuen Tag entsteht in `collectionDateChangedText` (der Wert kommt vom Server).
  ABHOLTAG_GEAENDERT: {
    title: "Abholtag geändert",
    message: "Der früheste Abholtag hat sich geändert. Bitte Angebot neu berechnen.",
    retryable: false,
  },
  // ─── 400 PRICE_INPUTS_MISSING (Transglobal) ───────────────────────────────────────
  // Die Revalidierung VOR dem Claim stellt fest, dass preisrelevante Angaben fehlen, die der Kunde auf dieser
  // Seite nicht nachtragen kann (siehe `preisangabenFehlenHandlung`). Nichts beauftragt; die Handlung ist
  // eine Neuberechnung — nie die Adressfläche: an der Anschrift fehlt nichts.
  PREISANGABEN_UNVOLLSTAENDIG: {
    title: "Preisangaben unvollständig",
    message: "Für dieses Angebot fehlen preisrelevante Angaben. Es wurde nichts beauftragt und nichts berechnet. Bitte berechnen Sie die Angebote neu.",
    retryable: false,
  },
  // ─── 503 LEGAL_DOCUMENTS_NOT_CONFIGURED ───────────────────────────────────────────
  // Die Vertragsunterlagen der Buchung sind serverseitig gerade nicht abrufbar (lib/legalBookingGate.js). Beide
  // Buchungswege prüfen das VOR jedem Providerkontakt — es wurde also nichts beauftragt. Weder ein offener
  // Ausgang („wird geprüft") noch ein Adressfehler: es ist ein Konfigurationszustand des Systems. Eine
  // Neuberechnung repariert ihn nicht, ein späterer Versuch derselben Buchung schon; der Bestellknopf bleibt,
  // und nichts wird automatisch wiederholt. Gilt ausschließlich für DIESEN Code — ein 503 ohne Code bleibt ein
  // offener Ausgang.
  BUCHUNG_DERZEIT_NICHT_MOEGLICH: {
    title: "Buchung derzeit nicht möglich",
    message: "Die Vertragsunterlagen sind derzeit nicht abrufbar, deshalb ist die Buchung gerade nicht möglich. Es wurde nichts beauftragt und nichts berechnet. Bitte versuchen Sie es später erneut.",
    retryable: true,
  },
};

const WOCHENTAGE = Object.freeze(["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"]);

/** Ein vom Server gelieferter Kalendertag (YYYY-MM-DD) als „Montag, 28.12.2026" — sonst null. */
function kalendertagText(wert) {
  const m = typeof wert === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert.trim()) : null;
  if (!m) return null;
  const tag = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Ein Kalendertag, den es nicht gibt (2026-02-30), wird nicht still in den Folgemonat gerechnet.
  if (tag.getUTCFullYear() !== Number(m[1]) || tag.getUTCMonth() !== Number(m[2]) - 1 || tag.getUTCDate() !== Number(m[3])) {
    return null;
  }
  return `${WOCHENTAGE[tag.getUTCDay()]}, ${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * P1-03: der Kundensatz zu `409 COLLECTION_DATE_CHANGED` — mit dem neuen frühesten Abholtag, wenn der
 * Server ihn lesbar nennt; ohne ihn der Satz ohne Datum (nie ein geratenes Datum).
 */
export function collectionDateChangedText(body) {
  const neu = kalendertagText(body && typeof body === "object" ? body.newCollectionDate : null);
  return neu
    ? `Der früheste Abholtag hat sich geändert auf ${neu}. Bitte Angebot neu berechnen.`
    : BOOK_FEHLER.ABHOLTAG_GEAENDERT.message;
}

// TG22/TG23 Same-Day: die Fehlerklasse je Art der Antwort.
const SAME_DAY_FEHLER_JE_ART = Object.freeze({
  [SAME_DAY_UNAVAILABLE_KIND.EXPIRED]: "ABHOLUNG_HEUTE_VORBEI",
  [SAME_DAY_UNAVAILABLE_KIND.UNCONFIRMED]: "ABHOLUNG_HEUTE_UNBESTAETIGT",
  [SAME_DAY_UNAVAILABLE_KIND.UNVERIFIABLE]: "ABHOLUNG_HEUTE_NICHT_PRUEFBAR",
});

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
//   BOOKING_FAILED              409/5xx  nichts beauftragt             neu berechnen (s. u.)
//
// Die Zuordnung steht VOR der Statusauswertung, und das ist der Kern des Befunds: ein
// `502 BOOKING_OUTCOME_UNKNOWN` fiel früher in den Sammelzweig `status >= 500` und bekam
// damit den Text „Bitte versuchen Sie es erneut." — obwohl der Server im selben Body
// wörtlich „bitte buchen Sie sie NICHT erneut" sagt.
// ─── TG-7: weitere Codes, alle mit derselben Handlung ──────────────────────────────
//   SHIPMENT_DECLARATIONS_MISMATCH  409     nichts beauftragt          neu berechnen
//   SHIPMENT_DECLARATIONS_MISSING   409     nichts beauftragt          neu berechnen
//   OFFER_MISMATCH                  409     nichts beauftragt          neu berechnen
// ─── TG22 Paket B ──────────────────────────────────────────────────────────────────
//   COLLECTION_DATE_MISSING         409     nichts beauftragt          neu berechnen
//   COLLECTION_SLOT_REQUIRED        409     nichts beauftragt          neu berechnen  (TG110 GLS Portal)
//   LABEL_FORMAT_NOT_SUPPORTED      400     nichts beauftragt          neu berechnen
// Beide tragen mit derselben Angebotskennung nicht: ohne Abholtag gibt es keinen Auftrag, und
// ein Format, das dieses Angebot nicht kennt, entsteht nur aus einem veralteten Angebotsstand.
//
// ─── Buchungssicherheit: OFFER_ALREADY_USED ist KEIN „nichts beauftragt" ────────────
//   OFFER_ALREADY_USED              409     gebucht / evtl. gebucht    NIEMALS
// Ein Angebot wird serverseitig nur verbraucht, wenn beim Anbieter ein Auftrag existiert
// oder existieren KANN (gebucht, unklarer Ausgang, klärungspflichtig). Er führt deshalb in die
// Sendungsliste.
//
// ─── Final Bookability Closure: jeder „nichts beauftragt"-Code hat eine eigene Handlung ─
//   BOOKING_FAILED                  409/5xx nachweislich nicht bestellt    neu berechnen (P0-01)
//   PROVIDER_UNAVAILABLE            503     nichts beauftragt          neu berechnen
//   SHIPMENT_PROVIDER_UNSUPPORTED   409     nichts beauftragt          neu berechnen
//   VOUCHER_NOT_APPLICABLE          409     nichts beauftragt          neu berechnen
//   COLLECTION_DATE_CHANGED         409     nichts beauftragt          neu berechnen (P1-03, mit Datum)
//   CUSTOMS_BOOKING_UNAVAILABLE     503     nichts beauftragt          später erneut
//   CUSTOMS_NOT_READY_AFTER_INVOICE_UPLOAD 409 nichts beauftragt       später erneut
//   CHECKOUT_CHECK_FAILED (502) / CHECKOUT_NOT_READY (409) — die früheren Codes derselben
//     Warenkorbprüfung VOR der Bestellung; ein Server vor diesem Stand sendet sie noch.
// Bis hierher liefen die 5xx dieser Liste als offener Ausgang („wird geprüft", „Zu meinen Sendungen")
// und die 409 als „bereits verarbeitet" — für einen Vorgang, bei dem nichts bestellt wurde.
//
// ─── TG-Abschluss (2026-10-12): drei weitere „nichts beauftragt"-Antworten ───────────
//   LEGAL_DOCUMENTS_NOT_CONFIGURED  503     nichts beauftragt          später erneut (diese Tabelle)
//   INSUFFICIENT_STOCK u. a.        409     nichts beauftragt (Lager)  Bestand/Auftrag prüfen, neu berechnen
//                                                                      (`lagerkonfliktBeimBuchen`)
//   PRICE_INPUTS_MISSING            400     nichts beauftragt          Art der Lieferadresse neu wählen oder
//                                                                      neu berechnen (`preisangabenFehlenHandlung`)
// Die beiden letzten brauchen den Kontext der Seite (Status bzw. abgefragte Angaben) und stehen deshalb nicht
// in dieser Tabelle; ein 503 ohne Code bleibt unverändert ein offener Ausgang.
const BOOK_CODE_FEHLER = {
  BOOKING_OUTCOME_UNKNOWN: "PRUEFUNG_LAEUFT",
  BOOKING_PENDING:         "PRUEFUNG_LAEUFT",
  BOOKING_IN_PROGRESS:     "BUCHUNG_LAEUFT",
  PRICE_UNCONFIRMED:       "PREIS_UNBESTAETIGT",
  OFFER_NOT_BOOKABLE:      "NEU_BERECHNEN",
  BOOKING_FAILED:          "NICHT_DURCHGEFUEHRT",
  PROVIDER_UNAVAILABLE:    "NICHT_DURCHGEFUEHRT",
  CHECKOUT_CHECK_FAILED:   "NICHT_DURCHGEFUEHRT",
  CHECKOUT_NOT_READY:      "NICHT_DURCHGEFUEHRT",
  SHIPMENT_PROVIDER_UNSUPPORTED: "NEU_BERECHNEN",
  VOUCHER_NOT_APPLICABLE:        "GUTSCHEIN_NICHT_ANWENDBAR",
  COLLECTION_DATE_CHANGED:       "ABHOLTAG_GEAENDERT",
  CUSTOMS_BOOKING_UNAVAILABLE:   "ZOLL_DERZEIT_NICHT_BUCHBAR",
  CUSTOMS_NOT_READY_AFTER_INVOICE_UPLOAD: "ZOLL_NOCH_NICHT_BEREIT",
  SHIPMENT_DECLARATIONS_MISMATCH: "NEU_BERECHNEN",
  SHIPMENT_DECLARATIONS_MISSING:  "NEU_BERECHNEN",
  OFFER_ALREADY_USED:             "ANGEBOT_VERWENDET",
  OFFER_MISMATCH:                 "NEU_BERECHNEN",
  COLLECTION_DATE_MISSING:        "NEU_BERECHNEN",
  // TG110 GLS Pick&Ship (Portal): der Fahrer-Abhol-Slot fehlt/ist ungueltig. Wie COLLECTION_DATE_MISSING:
  // nichts beauftragt, und dieselbe Angebotskennung traegt ohne gueltigen Abholtag nicht — neu berechnen.
  COLLECTION_SLOT_REQUIRED:       "NEU_BERECHNEN",
  LABEL_FORMAT_NOT_SUPPORTED:     "NEU_BERECHNEN",
  // TG22 Residential — PRICE_INPUTS_REQUIRED: die Lieferadresse ist nicht gebunden; die Seite führt
  // zurück an die Auswahl. PRICE_INPUTS_NOT_SUPPORTED: das Angebot kennt die Angabe nicht (mehr).
  PRICE_INPUTS_REQUIRED:          "PREISANGABE_FEHLT",
  PRICE_INPUTS_NOT_SUPPORTED:     "NEU_BERECHNEN",
  // TG22/TG23 Same-Day — 409, nichts beauftragt, ein späterer Abholtag ist die Handlung. Die Klasse hängt an
  // der Art der Antwort (`fehlerKlasse`).
  [SAME_DAY_COLLECTION_UNAVAILABLE_CODE]: "ABHOLUNG_HEUTE_NICHT_PRUEFBAR",
  // 503, nichts beauftragt (Legal-Prüfung vor jedem Providerkontakt) — später erneut, kein offener Ausgang.
  LEGAL_DOCUMENTS_NOT_CONFIGURED: "BUCHUNG_DERZEIT_NICHT_MOEGLICH",
};

// Die Fehlerklasse einer Antwort: über den Code — bei einer nicht verfügbaren Abholung heute über deren Art.
function fehlerKlasse(code, body) {
  if (code === SAME_DAY_COLLECTION_UNAVAILABLE_CODE) return SAME_DAY_FEHLER_JE_ART[sameDayUnavailableKindOf(body)];
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(BOOK_CODE_FEHLER, code)
    ? BOOK_CODE_FEHLER[code] : null;
}

// Die Handlungsklassen „nichts beauftragt, dieselbe Angebotskennung trägt nicht mehr".
const NEUBERECHNUNG_KLASSEN = Object.freeze([
  "NEU_BERECHNEN", "ABHOLUNG_HEUTE_VORBEI", "ABHOLUNG_HEUTE_UNBESTAETIGT", "ABHOLUNG_HEUTE_NICHT_PRUEFBAR",
  "NICHT_DURCHGEFUEHRT", "GUTSCHEIN_NICHT_ANWENDBAR", "ABHOLTAG_GEAENDERT",
]);

// Die Handlungsklassen „nichts beauftragt, dieselbe Buchung trägt später wieder" — kein Konflikt, keine
// Neuberechnung: der Bestellknopf bleibt.
const SPAETER_KLASSEN = Object.freeze([
  "ZOLL_DERZEIT_NICHT_BUCHBAR", "ZOLL_NOCH_NICHT_BEREIT", "BUCHUNG_DERZEIT_NICHT_MOEGLICH",
]);

// Trägt diese Antwort einen Ausgang, bei dem NICHTS beauftragt wurde und dieselbe
// Angebotskennung nicht mehr trägt? Eigener Export, weil die Buchungsseite ihre
// 409-Zweige in fester Reihenfolge prüft und dort denselben Satz Codes braucht,
// ohne ihn ein zweites Mal aufzuschreiben.
export function fordertNeuberechnung(body) {
  const code = body && typeof body === "object" ? body.code : null;
  return typeof code === "string" && NEUBERECHNUNG_KLASSEN.includes(fehlerKlasse(code, body));
}

// Trägt diese Antwort einen Ausgang, bei dem NICHTS beauftragt wurde und dieselbe Buchung später
// wieder trägt? Dann ein Hinweis mit stehendem Bestellknopf — nie „Zu meinen Sendungen" (dort steht
// nichts) und nie eine Versicherungsaktualisierung (sie repariert nichts).
export function erlaubtSpaeterenVersuch(body) {
  const code = body && typeof body === "object" ? body.code : null;
  return typeof code === "string" && SPAETER_KLASSEN.includes(fehlerKlasse(code, body));
}

// ─── Lagerkonflikt beim Buchen ─────────────────────────────────────────────────────
// Eine Sendung mit Lagerbezug reserviert ihren Bestand VOR der Bestellung in einer eigenen Transaktion
// (Backend lib/booking/inventoryReservation.js — JUMiNGO und Transglobal gleich). Scheitert das, gibt der
// Server den Sendungs-Claim zurück und antwortet 409 mit dem Code der Bestandslogik; bestellt wurde NICHTS.
// Erreichbar sind dort genau diese Codes (lib/inventoryShipment.js `reserveShipmentInventory` →
// lib/inventory.js `claimReservation`/`reserve`): zu wenig Bestand, eine von einer anderen Sendung gehaltene
// Auftragsmenge, ein nicht mehr vorhandener Artikel oder Lagerplatz, eine unbrauchbare Menge.
//
// Bis hierher lief dieser 409 in den Sammelzweig der Buchungsseite („bereits verarbeitet", „Zu meinen
// Sendungen") — bei versicherter Buchung sogar in eine Neubepreisung, die nichts löst. Der Weg ist: Bestand
// bzw. Auftrag prüfen, danach neu berechnen. Wohin der Korrekturweg führt, sagt `ziel` (Seite des Lagermoduls);
// ohne Ziel bleibt allein die Neuberechnung.
const LAGERKONFLIKT_ZIEL = Object.freeze({
  INSUFFICIENT_STOCK: "stock",
  PRODUCT_NOT_FOUND: "stock",
  RESERVATION_CLAIMED: "orders",
  INVALID_QUANTITY: null,
});

const LAGERKONFLIKT_HANDLUNG = Object.freeze({
  stock: "Bitte prüfen Sie den Bestand und berechnen Sie die Angebote danach neu.",
  orders: "Bitte prüfen Sie den Auftrag und berechnen Sie die Angebote danach neu.",
  ohne: "Bitte berechnen Sie die Angebote neu.",
});

/** Die Beschriftung des Korrekturwegs je Ziel — eine Stelle für Fläche und Tests. */
export const LAGERKONFLIKT_ZIEL_TEXT = Object.freeze({
  stock: "Bestand prüfen",
  orders: "Aufträge prüfen",
});

// Der Bestandssatz: derselbe Text wie im Lagermodul (inventoryErrors.mjs). Nennt der Server den Artikel, nennt
// ihn der Satz auch — der Name ist ein Artikel des Kunden selbst. Die gehaltene Auftragsmenge ist kein
// Bestandsmangel und bekommt ihren eigenen Satz.
function lagerkonfliktSatz(body) {
  if (body.code === "INSUFFICIENT_STOCK") {
    const d = body.details && typeof body.details === "object" ? body.details : {};
    const name = [d.name, d.sku].find((w) => typeof w === "string" && w.trim() !== "");
    if (name) return `Für „${name.trim()}“ ist nicht genügend Bestand verfügbar.`;
  }
  if (body.code === "RESERVATION_CLAIMED") return "Diese Auftragsmenge wird bereits für eine andere Sendung verwendet.";
  return inventoryErrorText(body);
}

/**
 * Ein Lagerkonflikt der Buchung — `{ text, ziel }` — oder `null` für jede andere Antwort. Nur ein 409 mit einem
 * der Codes oben: ein anderer Status oder Code ist keine Aussage über den Bestand.
 */
export function lagerkonfliktBeimBuchen(status, body) {
  if (status !== 409 || !body || typeof body !== "object" || typeof body.code !== "string") return null;
  if (!Object.prototype.hasOwnProperty.call(LAGERKONFLIKT_ZIEL, body.code)) return null;
  const ziel = LAGERKONFLIKT_ZIEL[body.code];
  return {
    text: `${lagerkonfliktSatz(body)} Es wurde nichts beauftragt und nichts berechnet. ${LAGERKONFLIKT_HANDLUNG[ziel || "ohne"]}`,
    ziel,
  };
}

// ─── 400 PRICE_INPUTS_MISSING (Transglobal) ────────────────────────────────────────
// Die Revalidierung VOR dem Claim (Backend lib/booking/transglobalBookingEntry.js, für `/book` und die
// Neubepreisung der Absicherung) meldet fehlende preisrelevante Angaben und nennt sie in `fields`. Nichts
// beauftragt. Ist es AUSSCHLIESSLICH die Art der Lieferadresse und fragt die Seite sie für dieses Angebot ab,
// führt der Weg an genau diese Auswahl zurück — dieselbe Neubindung wie bei `PRICE_INPUTS_REQUIRED`, danach der
// bestehende Bindungs- und Bestätigungsablauf. Jede andere Angabe (etwa die Art der Abholadresse) kann der
// Kunde auf dieser Seite nicht nachtragen: dann neu berechnen. Es wird keine Auswahl erfunden.
export const PRICE_INPUTS_MISSING_CODE = "PRICE_INPUTS_MISSING";

/**
 * `{ aktion: "neubindung" }`, `{ aktion: "neu_berechnen", text }` oder `null`, wenn die Antwort nicht
 * `PRICE_INPUTS_MISSING` ist. `lieferadressartAbfragbar`: fragt die Buchungsseite für dieses Angebot die Art der
 * Lieferadresse ab?
 */
export function preisangabenFehlenHandlung(body, { lieferadressartAbfragbar = false } = {}) {
  if (!body || typeof body !== "object" || body.code !== PRICE_INPUTS_MISSING_CODE) return null;
  const felder = Array.isArray(body.fields) ? body.fields : [];
  if (lieferadressartAbfragbar === true && felder.length > 0 && felder.every((f) => f === "deliveryIsResidential")) {
    return { aktion: "neubindung" };
  }
  return { aktion: "neu_berechnen", text: BOOK_FEHLER.PREISANGABEN_UNVOLLSTAENDIG.message };
}

// Trägt diese Antwort einen Ausgang, bei dem der Provider bereits gebucht haben KANN?
// Eigener Export, weil die Buchungsseite das auch für einen ERFOLGSSTATUS (202) wissen
// muss, wo `mapBookRestError` gar nicht läuft.
export function istOffenerAusgang(status, body) {
  const code = body && typeof body === "object" ? body.code : null;
  return code === "BOOKING_PENDING" || code === "BOOKING_OUTCOME_UNKNOWN";
}

// Ist dieser Buchungsfehler ein offener Ausgang? Dann gehört er in die Konfliktfläche, die
// den Bestellknopf durch „Zu meinen Sendungen" ERSETZT — nicht in das Fehlerbanner, neben dem
// der Knopf stehen bliebe.
export function istUnklarerAusgang(fehler) {
  return fehler === BOOK_FEHLER.PRUEFUNG_LAEUFT;
}

// Restpfad einer NICHT-ok-Antwort. `body` ist der defensiv gelesene JSON-Body
// (null bei leerem/unlesbarem Body — z. B. HTML-Fehlerseite eines Proxys).
export function mapBookRestError(status, body) {
  // Ein bekannter Backendcode entscheidet IMMER vor dem Status. Ein Status ist eine
  // Transportklasse, ein Code ist eine fachliche Aussage über den Ausgang — und nur die
  // zweite weiß, ob eine Wiederholung eine zweite Sendung erzeugen würde.
  const code = body && typeof body === "object" ? body.code : null;
  const klasse = fehlerKlasse(code, body);
  if (klasse === "ABHOLTAG_GEAENDERT") return { ...BOOK_FEHLER.ABHOLTAG_GEAENDERT, message: collectionDateChangedText(body) };
  if (klasse) return BOOK_FEHLER[klasse];
  if (status === 404) return BOOK_FEHLER.ANGEBOT_WEG;   // abgelaufenes/fremdes Angebot — neu berechnen ist die Handlung
  if (status === 429) return BOOK_FEHLER.RATE_LIMITED;
  // TG22 Paket B: ein 5xx OHNE bekannten Code nach dem Absenden der finalen Buchung sagt nicht,
  // ob beim Anbieter bestellt wurde (ein Proxy-Timeout nach der Bestellung sieht genauso aus).
  if (status >= 500) return BOOK_FEHLER.PRUEFUNG_LAEUFT;
  if (body === null || body === undefined) return BOOK_FEHLER.UNLESBAR;
  // Unerwarteter Reststatus mit lesbarem Body → zentrale Klassifizierung
  // (liest error UND message, wertet code aus, verliert nichts).
  const n = normalizeApiError({ status, body });
  return { title: n.title, message: n.message, retryable: n.retryable === true };
}

// Erfolgsstatus, aber der Body ließ sich nicht als Buchungsobjekt lesen — KEINE
// Erfolgsanzeige. TG22 Paket B: der Server hat mit Erfolg geantwortet, gebucht sein KANN
// also sehr wohl — offener Ausgang, kein „bitte erneut versuchen".
export function mapBookUnreadableSuccess() {
  return BOOK_FEHLER.PRUEFUNG_LAEUFT;
}

// Geworfene Fehler der finalen Buchung (Zeitlimit, Netzabbruch, Abbruch). Ob die Bestellung
// zustande kam, ist clientseitig nicht feststellbar: die Anfrage kann den Server erreicht
// haben. TG22 Paket B: deshalb in JEDEM Fall der offene Ausgang — nie „erneut versuchen".
export function mapBookThrownError(_e) {
  return BOOK_FEHLER.PRUEFUNG_LAEUFT;
}

// ─── Paritätsaudit 2026-10-15 (Session 2) ─────────────────────────────────────────
// A4 — 409 PARCELSHOP_REQUIRED (Transglobal-Buchungseinstieg): ohne gültigen Abgabe-Paketshop
// beauftragt der Server NICHTS. Bis hierher lief der Code in den Sammelzweig („bereits verarbeitet“,
// „Zu meinen Sendungen“) oder bei versicherter Buchung in eine Neubepreisung, die nichts löst. Die
// Handlung ist dieselbe wie beim clientseitigen Gate: zurück an die Shopauswahl.
export const PARCELSHOP_REQUIRED_CODE = "PARCELSHOP_REQUIRED";
export const PARCELSHOP_REQUIRED_TEXT =
  "Bitte wählen Sie einen Paketshop für die Abgabe, bevor Sie buchen. Es wurde nichts beauftragt.";
export function paketshopFehlt(status, body) {
  return status === 409 && !!body && typeof body === "object" && body.code === PARCELSHOP_REQUIRED_CODE;
}

// A5 — Fehler der zusätzlichen E-Mail-Adressen gehören an ihr Feld. Nennt die Antwort `field`
// (trackingEmail, labelTrackingEmail), steht der Grund an genau dieser Option und oben nur der Hinweis,
// wo zu prüfen ist. Seit Backend #432 trägt auch 400 LABEL_EMAIL_NOT_AVAILABLE den Feldbezug: der Tarif
// bringt das Label bei der Abholung mit, eine Labelmail gibt es nicht — vorher führte die Oberfläche den
// Kunden zu „Adressen vervollständigen“. `serverText` ist der bereits gefilterte Kundentext der Seite.
export const LABEL_EMAIL_NOT_AVAILABLE_TEXT =
  "Für diesen Tarif wird das Versandlabel bei der Abholung am Paket angebracht. Ein Versandlabel per E-Mail ist nicht verfügbar — bitte schalten Sie diese Option aus.";
export const ZUSATZMAIL_HINWEIS = "Bitte prüfen Sie die markierte Angabe unter „Zusätzliche Optionen“.";
export function zusatzmailFehler(body, serverText) {
  const field = body && typeof body === "object" ? body.field : null;
  if (field !== "trackingEmail" && field !== "labelTrackingEmail") return null;
  if (body.code === "LABEL_EMAIL_NOT_AVAILABLE") {
    return { feld: "labelTrackingEmail", feldText: LABEL_EMAIL_NOT_AVAILABLE_TEXT, text: ZUSATZMAIL_HINWEIS };
  }
  const text = typeof serverText === "string" && serverText.trim() ? serverText.trim() : null;
  return text
    ? { feld: field, feldText: text, text: ZUSATZMAIL_HINWEIS }
    : { feld: field, feldText: null, text: "Bitte prüfen Sie die zusätzliche E-Mail-Adresse." };
}

// O1 — Neubepreisung der gestuften Versicherung (POST /api/insurance/reprice, Angebot ohne
// Deckungsmodell). Seit Backend #432 trägt jeder 4xx-Zweig einen Code; die Texte des Servers nennen
// dort Feldnamen („goodsValue: …“). Die Weiche davor antwortet mit OFFER_NOT_FOUND, OFFER_ALREADY_USED
// und OFFER_MISMATCH. Bekannter Code → Kundentext; unbekannt → null (die Seite behält ihre bisherige
// Rückfallkette). Bis hierher wurde jeder 409 als „Der Preis hat sich geändert“ angezeigt — auch eine
// Sendung, die gar nicht mehr im Entwurf ist, oder ein bereits verwendetes Angebot.
const REPRICE_CODE_TEXT = Object.freeze({
  TARIFF_SELECTION_INVALID: "Der gewählte Tarif konnte nicht zugeordnet werden. Bitte berechnen Sie die Preise erneut.",
  OFFER_NOT_BOOKABLE: "Dieser Tarif ist nicht mehr verfügbar. Bitte berechnen Sie die Preise erneut.",
  OFFER_NOT_FOUND: "Dieses Angebot ist nicht mehr gültig. Bitte berechnen Sie die Preise erneut.",
  OFFER_MISMATCH: "Dieses Angebot passt nicht mehr zu Ihrer Sendung. Bitte berechnen Sie die Preise erneut.",
  OFFER_ALREADY_USED: OFFER_ALREADY_USED_TEXT,
  TARIFF_NOT_FOUND: "Der gewählte Tarif ist nicht mehr verfügbar. Bitte berechnen Sie die Preise erneut.",
  TARIFF_AMBIGUOUS: "Der gewählte Tarif konnte nicht eindeutig zugeordnet werden. Bitte berechnen Sie die Preise erneut.",
  TARIFF_NOT_INSURABLE: "Dieser Tarif kann nicht zusätzlich versichert werden. Bitte wählen Sie einen anderen Tarif oder „ohne Versicherung“.",
  INSURANCE_SELECTION_INVALID: "Bitte wählen Sie eine gültige Versicherungsstufe.",
  CONTENT_DESCRIPTION_INVALID: "Die Inhaltsbeschreibung darf höchstens 35 Zeichen lang sein.",
  GOODS_VALUE_REQUIRED: "Bitte geben Sie den Warenwert an — er ist für die Versicherung erforderlich.",
  GOODS_VALUE_INVALID: "Bitte geben Sie einen Warenwert zwischen 1 und 9.999.999 € an.",
  INSURANCE_VALUE_INVALID: "Bitte geben Sie einen Versicherungswert zwischen 1 und 20.000 € an.",
  SHIPMENT_NOT_FOUND: "Die Sendung wurde nicht gefunden. Bitte berechnen Sie die Preise erneut.",
  SHIPMENT_NOT_DRAFT: "Diese Sendung kann nicht mehr geändert werden. Bitte prüfen Sie Ihre Sendungen.",
});
export function repriceFehlerText(body) {
  const code = body && typeof body === "object" ? body.code : null;
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(REPRICE_CODE_TEXT, code)
    ? REPRICE_CODE_TEXT[code] : null;
}
