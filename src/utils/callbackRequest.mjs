// Rückrufwunsch (Startklar, Betreiberentscheidung 2026-11-23): reine Logik des Dialogs „Rückruf anfragen“ der
// Ansprechpartnerkarte. Kein JSX, kein State, kein Fetch — testbar unter Node.
//
// Der Rückrufwunsch ist ein regulärer Supportvorgang der Kategorie `callback` über dieselbe Route wie jede
// Supportanfrage (Backend lib/supportCallback.js). Diese Datei ersetzt KEINE serverseitige Prüfung: das Backend prüft
// Name, Telefonnummer und Grund erneut und ist autoritativ. Die Grenzen hier sind identisch zum Backend gewählt, damit
// ein Fehler direkt am Feld steht, bevor etwas gesendet wird.
//
// Wiederverwendet, nicht nachgebaut:
//   • Telefonnummer: validateContactPhone (utils/contactDetails.mjs → zentraler Telefonvertrag phoneNumber.mjs) —
//     dieselbe Höchstlänge (30) und derselbe Fehlertext wie die Kontakt-Telefonnummer des Kontos, hier als Pflicht.
//   • Name und Grund: normalizeFreeText (utils/textInput.mjs, Spiegel von lib/textInput.js).
//   • Allgemeine Fehler (429, 5xx, Netzwerk): mapSupportError und SUPPORT_NETWORK_ERROR (utils/supportRequest.mjs),
//     Ticketnummer: readTicketNumber — ausschließlich aus der Serverantwort.

import { CONTACT_DETAILS_TEXT, CONTACT_PHONE_MAXLEN, validateContactPhone } from "./contactDetails.mjs";
import { normalizeFreeText } from "./textInput.mjs";
import { mapSupportError, readTicketNumber } from "./supportRequest.mjs";

export const CALLBACK_CATEGORY = "callback";
// Identisch zu lib/support.js (CALLBACK_NAME_MIN_LEN, CALLBACK_NAME_MAX_LEN, CALLBACK_REASON_MAX_LEN).
export const CALLBACK_NAME_MIN = 2;
export const CALLBACK_NAME_MAX = 100;
export const CALLBACK_PHONE_MAX = CONTACT_PHONE_MAXLEN;
export const CALLBACK_REASON_MAX = 1000;

// Festgelegter Wortlaut. Keine Zusage einer Rückrufzeit oder Antwortfrist — nur, was tatsächlich geschieht: ein
// Vorgang mit Nummer entsteht, und er steht unter „Supportanfragen“.
export const CALLBACK_TEXT = Object.freeze({
  titel: "Rückruf anfragen",
  beschreibung: "Sagen Sie uns, unter welcher Nummer wir Sie erreichen. Die Angaben aus Ihrem Konto sind vorausgefüllt – bitte prüfen Sie sie.",
  name: "Name",
  telefon: "Telefonnummer",
  grund: "Grund",
  optional: "(optional)",
  grundPlatzhalter: "Worum geht es? Zum Beispiel eine Sendung oder eine Rechnung.",
  absenden: "Rückruf anfragen",
  sendet: "Wird gesendet …",
  abbrechen: "Abbrechen",
  erfolgTitel: "Rückruf angefragt",
  erfolgBasis: "Ihr Rückrufwunsch ist bei uns eingegangen.",
  erfolgHinweis: "Den Vorgang finden Sie in Ihrem Konto unter „Supportanfragen“.",
  schliessen: "Schließen",
  nameFehler: `Bitte geben Sie Ihren Namen an (${CALLBACK_NAME_MIN} bis ${CALLBACK_NAME_MAX} Zeichen).`,
  telefonFehler: CONTACT_DETAILS_TEXT.phoneInvalid,
  grundFehler: `Der Grund darf höchstens ${CALLBACK_REASON_MAX} Zeichen lang sein.`,
});

// Die drei Felder in der Reihenfolge des Dialogs; die Schlüssel sind die Feldnamen des Backendvertrags.
export const CALLBACK_FIELDS = Object.freeze(["callbackName", "callbackPhone", "message"]);

function nameNormal(raw) {
  return typeof raw === "string" ? normalizeFreeText(raw).replace(/\s+/g, " ").trim() : "";
}
function grundNormal(raw) {
  return typeof raw === "string" ? normalizeFreeText(raw).trim() : "";
}

/**
 * Den Rückruf bietet die Karte nur einem angemeldeten Kundenkonto an — nicht dem Admin, nicht der öffentlichen Demo
 * (sie hat kein Konto, ein Rückrufwunsch dort wäre eine leere Zusage). Das Konto bestimmt der Server aus der Sitzung.
 */
export function rueckrufAnbieten(user, demo) {
  return Boolean(user && typeof user === "object" && user.role === "customer" && demo !== true);
}

/** Vorschlag aus dem Konto: Name des Ansprechpartners und die hinterlegte Kontakt-Telefonnummer, beide änderbar. */
export function callbackPrefill(user) {
  const u = user && typeof user === "object" ? user : {};
  return {
    name: typeof u.name === "string" ? u.name.trim() : "",
    phone: typeof u.contact_phone === "string" ? u.contact_phone.trim() : "",
  };
}

/** Feldfehler vor dem Absenden → { callbackName?, callbackPhone?, message? } (leer = absendbar). */
export function callbackFieldErrors({ name, phone, reason } = {}) {
  const fehler = {};
  const n = nameNormal(name);
  if (n.length < CALLBACK_NAME_MIN || n.length > CALLBACK_NAME_MAX) fehler.callbackName = CALLBACK_TEXT.nameFehler;
  const p = validateContactPhone(typeof phone === "string" ? phone : "");
  if (!p.ok || p.value === null) fehler.callbackPhone = CALLBACK_TEXT.telefonFehler;
  if (grundNormal(reason).length > CALLBACK_REASON_MAX) fehler.message = CALLBACK_TEXT.grundFehler;
  return fehler;
}

/**
 * Body für POST /kunde/support-requests. Genau die vier Felder des Rückrufvertrags — kein Betreff, keine Sendung,
 * keine Konto- oder Statusangabe (das Konto kommt aus der Sitzung). Ein leerer Grund wird nicht mitgesendet.
 */
export function buildCallbackRequestBody({ name, phone, reason } = {}) {
  const p = validateContactPhone(typeof phone === "string" ? phone : "");
  const body = {
    category: CALLBACK_CATEGORY,
    callbackName: nameNormal(name),
    callbackPhone: p.ok && p.value !== null ? p.value : (typeof phone === "string" ? phone.trim() : ""),
  };
  const g = grundNormal(reason);
  if (g !== "") body.message = g;
  return body;
}

// Fehlercodes des Backendvertrags (lib/supportCallback.js, CALLBACK_ERR) → Feld. Der Text kommt von hier, nie roh vom
// Server (dieselbe Regel wie mapSupportError).
const FELD_JE_CODE = Object.freeze({
  SUPPORT_CALLBACK_NAME_INVALID: "callbackName",
  SUPPORT_CALLBACK_PHONE_INVALID: "callbackPhone",
  SUPPORT_CALLBACK_REASON_INVALID: "message",
});
const TEXT_JE_FELD = Object.freeze({
  callbackName: CALLBACK_TEXT.nameFehler,
  callbackPhone: CALLBACK_TEXT.telefonFehler,
  message: CALLBACK_TEXT.grundFehler,
});

/** Serverfehler → { field, text }: Feldfehler am Feld, alles andere (429, 5xx, unbekannt) als allgemeiner Hinweis. */
export function mapCallbackError(status, body) {
  const b = body && typeof body === "object" ? body : {};
  const code = typeof b.code === "string" ? b.code : "";
  if (status === 400 && Object.prototype.hasOwnProperty.call(FELD_JE_CODE, code)) {
    const field = FELD_JE_CODE[code];
    return { field, text: TEXT_JE_FELD[field] };
  }
  return { field: null, text: mapSupportError(status, b) };
}

/** Bestätigung mit der Vorgangsnummer AUS DER SERVERANTWORT; fehlt sie, entfällt der Nummernsatz. */
export function callbackSuccessMessage(body) {
  const t = readTicketNumber(body);
  return t ? `${CALLBACK_TEXT.erfolgBasis} Ihre Vorgangsnummer: ${t}` : CALLBACK_TEXT.erfolgBasis;
}
