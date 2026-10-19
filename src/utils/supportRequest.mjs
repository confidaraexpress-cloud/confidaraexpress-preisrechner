// Reine Logik der Kunden-Supportanfrage: Kategorien, Eingabezustände, Fehlerabbildung
// und Erfolgsmeldung. Kein JSX, kein State, kein Fetch — testbar unter Node (`.mjs`).
//
// WICHTIG: Diese Datei ersetzt KEINE serverseitige Prüfung. Betreff und Nachricht werden
// serverseitig erneut validiert und bereinigt (Steuerzeichen, CR/LF im Betreff, Längen);
// die Werte hier steuern ausschließlich die Oberfläche (Zähler, Hinweise, Button-Zustand).
// Sie sind bewusst identisch zu den Backendgrenzen gewählt, damit der Kunde nicht erst
// nach dem Absenden von einem Fehler erfährt.

// ── Kategorien ───────────────────────────────────────────────────────────────
// Technischer Wert (an das Backend gesendet) ↔ deutscher Anzeigename. Die technischen
// Werte sind Vertrag und entsprechen exakt lib/support.js im Backend. Reihenfolge =
// Anzeigereihenfolge im Auswahlfeld.
export const SUPPORT_CATEGORIES = Object.freeze([
  { value: "booking",      label: "Buchung und Versand" },
  { value: "tracking",     label: "Sendungsverfolgung" },
  { value: "damage",       label: "Schaden oder Verlust" },
  { value: "invoice",      label: "Rechnung" },
  { value: "cancellation", label: "Stornierung" },
  { value: "account",      label: "Konto und Unternehmen" },
  { value: "technical",    label: "Technisches Problem" },
  { value: "other",        label: "Sonstiges" },
]);

export const SUPPORT_CATEGORY_VALUES = Object.freeze(SUPPORT_CATEGORIES.map((c) => c.value));

export function supportCategoryLabel(value) {
  const hit = SUPPORT_CATEGORIES.find((c) => c.value === value);
  return hit ? hit.label : null;
}

// Anzeigefassung der Kategorie — dieselbe Regel wie statusFallback für Status:
// ein unbekannter Wert erscheint NIE roh im sichtbaren Text. Bis Paket D fiel
// die Anzeige auf `req.category` zurück und zeigte damit den Backendwert
// („shipping", „billing_v2") mitten im deutschen Satz.
// Rückgabe: [sichtbarerText, rohwertOderNull] — der Rohwert gehört höchstens
// in ein title-Attribut, damit der Support ihn nachschlagen kann.
export const SUPPORT_CATEGORY_UNKNOWN = "Ohne Kategorie";
export function supportCategoryDisplay(value) {
  const label = supportCategoryLabel(value);
  if (label) return [label, null];
  const roh = typeof value === "string" && value.trim() ? value.trim() : null;
  return [SUPPORT_CATEGORY_UNKNOWN, roh];
}

// Kein vorausgewählter Wert: der Kunde soll bewusst wählen, statt eine Voreinstellung
// versehentlich mitzusenden.
export const SUPPORT_CATEGORY_PLACEHOLDER = "Bitte wählen";

// ── Grenzen (identisch zum Backend) ──────────────────────────────────────────
export const SUPPORT_SUBJECT_MIN = 3;
export const SUPPORT_SUBJECT_MAX = 200;
export const SUPPORT_MESSAGE_MIN = 20;
export const SUPPORT_MESSAGE_MAX = 5000;

// ── Eingabezustände ──────────────────────────────────────────────────────────
// Gemessen wird IMMER der getrimmte Wert — reine Leerzeichen sind keine Eingabe.
// `length` ist dagegen die Rohlänge, weil sie zum maxLength-Attribut des Feldes passt
// (der Zähler darf nicht springen, während der Kunde Leerzeichen tippt).
export function supportSubjectState(value) {
  const raw = typeof value === "string" ? value : "";
  const trimmed = raw.trim();
  return {
    length: raw.length,
    trimmedLength: trimmed.length,
    empty: trimmed.length === 0,
    tooShort: trimmed.length > 0 && trimmed.length < SUPPORT_SUBJECT_MIN,
    tooLong: trimmed.length > SUPPORT_SUBJECT_MAX,
    valid: trimmed.length >= SUPPORT_SUBJECT_MIN && trimmed.length <= SUPPORT_SUBJECT_MAX,
  };
}

export function supportMessageState(value) {
  const raw = typeof value === "string" ? value : "";
  const trimmed = raw.trim();
  return {
    length: raw.length,
    trimmedLength: trimmed.length,
    empty: trimmed.length === 0,
    tooShort: trimmed.length > 0 && trimmed.length < SUPPORT_MESSAGE_MIN,
    tooLong: trimmed.length > SUPPORT_MESSAGE_MAX,
    valid: trimmed.length >= SUPPORT_MESSAGE_MIN && trimmed.length <= SUPPORT_MESSAGE_MAX,
  };
}

// ── Schaden oder Verlust (Go-Live Paket G) ───────────────────────────────────
// Die einzige Kategorie mit Sendungsbezug: der Kunde wählt die betroffene Sendung aus seiner
// eigenen Sendungsliste (GET /kunde/shipments). Gesendet wird ihre interne ID; der Server prüft
// das Eigentum an dieser ID. Die Auftragsbestätigungsnummer (CE-AB…) dient nur der Anzeige in
// der Auswahl — sie löst serverseitig nichts auf. Maßgeblich bleibt der Server.
export const SUPPORT_DAMAGE_CATEGORY = "damage";
// Kein Fristversprechen und keine Rechtsauskunft: nur, was in jedem Fall stimmt.
export const SUPPORT_DAMAGE_TEXTS = Object.freeze({
  label: "Betroffene Sendung",
  placeholder: "Bitte Sendung wählen",
  help: "Zur Auswahl stehen die letzten Sendungen Ihres Kontos.",
  loading: "Ihre Sendungen werden geladen …",
  loadError: "Ihre Sendungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
  empty: "In Ihrem Konto gibt es noch keine Sendung, zu der Sie einen Schaden melden könnten.",
  hint: "Bitte melden Sie Schäden und Verluste so schnell wie möglich – für Reklamationen gelten kurze Fristen. Bewahren Sie Verpackung und Ware bis zur Klärung auf.",
});

// Strikte positive Ganzzahl wie serverseitig (lib/support.js: parseSupportShipmentId).
function parseShipmentId(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

// Auswahl aus der eigenen Sendungsliste: [{ value: "<id>", label }]. Beschriftung aus der
// Auftragsbestätigungsnummer (Rückfall: „Sendung ohne Vorgangsnummer"), Buchungstag und Carrier —
// nur Werte, die die Liste ohnehin zeigt. Zeilen ohne gültige ID entfallen.
export function supportShipmentOptions(shipments) {
  if (!Array.isArray(shipments)) return [];
  const datum = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  };
  const out = [];
  for (const s of shipments) {
    const id = parseShipmentId(s && s.id);
    if (!id) continue;
    const nr = typeof s.order_confirmation_number === "string" && s.order_confirmation_number.trim()
      ? s.order_confirmation_number.trim() : "Sendung ohne Vorgangsnummer";
    const carrier = typeof s.selected_carrier === "string" && s.selected_carrier.trim() ? s.selected_carrier.trim().toUpperCase() : "";
    out.push({ value: String(id), label: [nr, datum(s.created_at), carrier].filter(Boolean).join(" · ") });
  }
  return out;
}

// Gesamtzustand des Formulars. `canSubmit` ist die EINZIGE Quelle für den Button —
// es gibt keine zweite, abweichende Bedingung in der Komponente.
export function supportFormState({ category, subject, message, shipmentId } = {}) {
  const categoryValid = SUPPORT_CATEGORY_VALUES.includes(category);
  const subjectState = supportSubjectState(subject);
  const messageState = supportMessageState(message);
  const referenceRequired = category === SUPPORT_DAMAGE_CATEGORY;
  const reference = {
    required: referenceRequired,
    valid: !referenceRequired || parseShipmentId(shipmentId) !== null,
  };
  return {
    categoryValid,
    subject: subjectState,
    message: messageState,
    reference,
    canSubmit: categoryValid && subjectState.valid && messageState.valid && reference.valid,
  };
}

// ── Absende-Payload ──────────────────────────────────────────────────────────
// Genau drei Felder — bei „Schaden oder Verlust" zusätzlich die gewählte Sendung (interne ID,
// serverseitig auf Eigentum geprüft). Nie eine user_id, nie ein Status, nie eine Ticketnummer.
// Werte werden getrimmt gesendet; die abschließende Bereinigung bleibt serverseitig. Ungültige
// Eingaben werden fail-closed abgelehnt (der Aufrufer prüft vorher canSubmit).
export function buildSupportRequestBody({ category, subject, message, shipmentId } = {}) {
  if (!SUPPORT_CATEGORY_VALUES.includes(category)) throw new Error("invalid_category");
  const body = {
    category,
    subject: String(subject ?? "").trim(),
    message: String(message ?? "").trim(),
  };
  if (category === SUPPORT_DAMAGE_CATEGORY) {
    const id = parseShipmentId(shipmentId);
    if (!id) throw new Error("invalid_shipment");
    body.shipmentId = id;
  }
  return body;
}

// ── Erfolgsmeldung ───────────────────────────────────────────────────────────
// Wortlaut ist festgelegt. Die Ticketnummer kommt AUSSCHLIESSLICH aus der Serverantwort —
// sie wird nie clientseitig erzeugt oder geraten. Fehlt sie (älteres Backend, unerwarteter
// Body), entfällt der Ticketsatz, statt „undefined" anzuzeigen.
export const SUPPORT_SUCCESS_BASE =
  "Ihre Supportanfrage wurde erfolgreich übermittelt. Wir melden uns zeitnah bei Ihnen.";

export function supportSuccessMessage(ticketNumber) {
  const t = typeof ticketNumber === "string" ? ticketNumber.trim() : "";
  return t ? `${SUPPORT_SUCCESS_BASE} Ihre Ticketnummer: ${t}` : SUPPORT_SUCCESS_BASE;
}

// Liest die Ticketnummer defensiv aus der Serverantwort. Nur die belegten Positionen des
// Backendvertrags werden gelesen — es wird nichts aus anderen Feldern abgeleitet.
export function readTicketNumber(body) {
  const b = body && typeof body === "object" ? body : {};
  const sr = b.supportRequest && typeof b.supportRequest === "object" ? b.supportRequest : {};
  for (const v of [sr.ticketNumber, sr.ticket_number, b.ticketNumber, b.ticket_number]) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}

// ── Fehlerabbildung ──────────────────────────────────────────────────────────
// Kundentaugliche Meldungen je Statuscode/Fehlercode. Serverfehlertexte werden NICHT roh
// angezeigt (sie können technische Details enthalten); die Codes des Backendvertrags
// werden gezielt übersetzt. 401/403 behandelt apiFetch zentral (Logout/Redirect) — dafür
// gibt es hier bewusst keine Meldung.
const CODE_MESSAGES = {
  SUPPORT_CATEGORY_INVALID: "Bitte wählen Sie eine gültige Kategorie aus.",
  SUPPORT_SUBJECT_INVALID: `Bitte geben Sie einen Betreff mit ${SUPPORT_SUBJECT_MIN} bis ${SUPPORT_SUBJECT_MAX} Zeichen an.`,
  SUPPORT_MESSAGE_INVALID: `Bitte beschreiben Sie Ihr Anliegen mit ${SUPPORT_MESSAGE_MIN} bis ${SUPPORT_MESSAGE_MAX} Zeichen.`,
  SUPPORT_RATE_LIMITED: "Sie haben in kurzer Zeit mehrere Anfragen gesendet. Bitte versuchen Sie es in einigen Minuten erneut.",
  ACCOUNT_NOT_AVAILABLE: "Ihr Konto ist derzeit nicht verfügbar. Bitte melden Sie sich neu an.",
  SUPPORT_SHIPMENT_REFERENCE_INVALID: "Bitte wählen Sie die betroffene Sendung aus.",
  // Unbekannt und fremd sind serverseitig bewusst nicht unterscheidbar — hier ebenso.
  SUPPORT_SHIPMENT_NOT_FOUND: "Diese Sendung finden wir in Ihrem Konto nicht. Bitte wählen Sie eine Sendung aus Ihrer Liste.",
};

const STATUS_MESSAGES = {
  400: "Bitte prüfen Sie Ihre Eingaben.",
  429: "Sie haben in kurzer Zeit mehrere Anfragen gesendet. Bitte versuchen Sie es in einigen Minuten erneut.",
};

export const SUPPORT_GENERIC_ERROR =
  "Ihre Anfrage konnte nicht übermittelt werden. Bitte versuchen Sie es später erneut.";

export const SUPPORT_NETWORK_ERROR =
  "Die Verbindung zum Server ist fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.";

export function mapSupportError(status, body) {
  const b = body && typeof body === "object" ? body : {};
  const code = typeof b.code === "string" ? b.code : "";
  if (Object.prototype.hasOwnProperty.call(CODE_MESSAGES, code)) return CODE_MESSAGES[code];
  if (Object.prototype.hasOwnProperty.call(STATUS_MESSAGES, status)) return STATUS_MESSAGES[status];
  return SUPPORT_GENERIC_ERROR;
}

// ── Texte der Supportkarte (Sidebar) ─────────────────────────────────────────
// Festgelegter Wortlaut — an genau einer Stelle definiert, damit Karte und Test nicht
// auseinanderlaufen können.
export const SUPPORT_CARD = Object.freeze({
  kicker: "Ihr persönlicher Kontakt",
  title: "Wir helfen Ihnen weiter",
  action: "Support kontaktieren",
  hint: "Ihre Anfrage wird zeitnah beantwortet.",
});

// ── Nachrichtenverlauf (Kunde) ───────────────────────────────────────────────
// Eigene, bewusst NIEDRIGERE Mindestlänge als beim Anlegen einer Anfrage: eine
// Erstanfrage soll das Anliegen beschreiben, eine Antwort im laufenden Verlauf
// darf kurz sein. „Danke" oder „Ja, bitte" sind vollständige Antworten — die
// Anfrage-Mindestlänge hier zu übernehmen, hätte genau diese Fälle abgelehnt.
// Spiegelt den Serververtrag (lib/support.js: REPLY_MIN_LEN/REPLY_MAX_LEN).
export const SUPPORT_REPLY_MIN = 2;
export const SUPPORT_REPLY_MAX = 5000;

// Zustand des Antwortfeldes: { value, length, valid, tooLong }.
// Die Prüfung ist eine reine Komfortfunktion für das Formular — maßgeblich ist
// immer die serverseitige Validierung.
export function supportReplyState(raw) {
  const value = typeof raw === "string" ? raw : "";
  const trimmed = value.trim();
  return {
    value,
    length: trimmed.length,
    valid: trimmed.length >= SUPPORT_REPLY_MIN && trimmed.length <= SUPPORT_REPLY_MAX,
    tooLong: trimmed.length > SUPPORT_REPLY_MAX,
  };
}

// Rollenbezeichnung im Verlauf. Der Kunde sieht „Sie" bzw. den Absender
// ConfidaraExpress Support — nie den Namen eines einzelnen Mitarbeiters.
export function supportAuthorLabel(role) {
  return role === "admin" ? "ConfidaraExpress Support" : "Sie";
}

export const SUPPORT_THREAD_EMPTY = "Für diesen Vorgang gibt es noch keine Antwort.";
export const SUPPORT_LIST_EMPTY_TITLE = "Noch keine Supportanfragen";
export const SUPPORT_LIST_EMPTY_TEXT =
  "Sobald Sie eine Anfrage stellen, finden Sie hier den vollständigen Nachrichtenverlauf.";
export const SUPPORT_REPLY_PLACEHOLDER = "Ihre Antwort an den Support …";
export const SUPPORT_REPLY_SUBMIT = "Antwort senden";
export const SUPPORT_REPLY_ERROR =
  "Ihre Antwort konnte nicht gesendet werden. Bitte versuchen Sie es erneut.";
export const SUPPORT_DETAIL_ERROR = "Der Vorgang konnte nicht geladen werden.";
export const SUPPORT_CUSTOMER_LIST_ERROR = "Ihre Supportanfragen konnten nicht geladen werden.";
// Hinweis auf einen wieder geöffneten Vorgang — der Kunde soll verstehen, warum
// sich der Status durch seine Antwort geändert hat.
export const SUPPORT_REOPEN_HINT =
  "Ihre Antwort hat den Vorgang wieder geöffnet. Wir melden uns zeitnah bei Ihnen.";
