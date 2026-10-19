/* ── Adressbuch — Formularmodell, Validierung, Normalisierung ─────────────────
   Herausgelöst aus addressBookView.mjs (Modularisierungs-Audit). Fachmodul des
   Adressformulars: leeres Formular, Objekt↔Formular-Abbildung, Duplikat,
   Validierung, API-Normalisierung und das Fehlercode-Mapping der
   Adressendpunkte. Kein React, kein Netzwerk. */

import { validatePostalCode } from "./postalCode.mjs";
import { ROLE_SENDER, validateRoleDefaultConsistency } from "./addressRoles.mjs";

// ── Formularmodell ────────────────────────────────────────────────────────────
// Leeres Formular für „Neue Adresse". uiRole ist bewusst der Backend-Rollenwert
// selbst (sender/recipient/both) — die Oberfläche zeigt nur andere Labels
// (UI_ROLE_OPTIONS), das Shape bleibt identisch.
export function emptyAddressForm(initialRole = ROLE_SENDER) {
  return {
    label: "", company: "", contactName: "",
    firstName: "", lastName: "", email: "", phone: "",
    streetAndNumber: "", addressAdd: "", postalCode: "", city: "", state: "", country: "DE",
    notes: "", role: initialRole, favorite: false, isDefaultSender: false, isDefaultRecipient: false,
  };
}

// Kanonisches Adressobjekt → Formularmodell. Liest AUSSCHLIESSLICH bekannte
// Felder (unbekannte Response-Felder beeinflussen das Formular nicht).
export function addressToFormValues(address) {
  const a = address || {};
  return {
    label: a.label || "",
    company: a.company || "",
    contactName: a.contactName || "",
    // Altbestand trägt nur `contactName`. Vor- und Nachname bleiben dann LEER — sie
    // werden nicht aus ihm erzeugt, und der Nutzer ergänzt sie beim Bearbeiten.
    firstName: a.firstName || "",
    lastName: a.lastName || "",
    email: a.email || "",
    phone: a.phone || "",
    streetAndNumber: a.streetAndNumber || "",
    addressAdd: a.addressAdd || "",
    postalCode: a.postalCode || "",
    city: a.city || "",
    state: a.state || "",
    country: (a.country || "DE").toUpperCase(),
    notes: a.notes || "",
    role: a.role || ROLE_SENDER,
    favorite: a.favorite === true,
    isDefaultSender: a.isDefaultSender === true,
    isDefaultRecipient: a.isDefaultRecipient === true,
  };
}

// ── Feldlängen ───────────────────────────────────────────────────────────────
// Nie über der Servergrenze (routes/addresses.js STRING_MAXLEN: Label 80, Firma/Straße/Zusatz/
// Ort/E-Mail 255, Bundesland 100, Telefon 40, Vor-/Nachname/Ansprechpartner 35, Notiz 2000).
// Wo das Versandformular enger ist (Firma 200, Straße 200, Zusatz 100, Ort 100, E-Mail 254 wie der
// Versandkontakt), gilt die engere Grenze — eine Adresse aus dem Adressbuch muss in „Neue Sendung“
// übernehmbar bleiben. Bis 2026-10 erlaubte das Formular ein Label mit 100 Zeichen und ein Telefon
// ohne Grenze; der Server lehnte ab, und die Seite zeigte nur eine allgemeine Meldung (Audit P7).
export const ADDRESS_FIELD_MAXLEN = Object.freeze({
  label: 80, company: 200, contactName: 35, firstName: 35, lastName: 35,
  email: 254, phone: 40, streetAndNumber: 200, addressAdd: 100, city: 100, state: 100, notes: 500,
});

// Sichtbare Feldnamen für Meldungen am Feld und im Sammelhinweis.
export const ADDRESS_FIELD_LABELS = Object.freeze({
  label: "Anzeigename", company: "Firma", contactName: "Ansprechpartner",
  firstName: "Vorname", lastName: "Nachname", email: "E-Mail", phone: "Telefon",
  streetAndNumber: "Straße und Hausnummer", addressAdd: "Adresszusatz", postalCode: "PLZ",
  city: "Ort", state: "Bundesland / Region", country: "Land", notes: "Interne Notiz",
});

const DUPLICATE_PREFIX = "Kopie von ";

// „Kopie von …“ höchstens so lang wie die Servergrenze des Labels: ein langes Original wird mit „…“
// gekürzt, statt beim Speichern zu scheitern. Ein Ersatzpaar (Emoji) wird nie halbiert.
function duplicateLabel(source) {
  const max = ADDRESS_FIELD_MAXLEN.label;
  const voll = `${DUPLICATE_PREFIX}${source}`;
  if (voll.length <= max) return voll;
  let rest = source.slice(0, max - DUPLICATE_PREFIX.length - 1);
  const letztes = rest.charCodeAt(rest.length - 1);
  if (letztes >= 0xd800 && letztes <= 0xdbff) rest = rest.slice(0, -1);
  return `${DUPLICATE_PREFIX}${rest.trimEnd()}…`;
}

// Formularmodell → Duplikat-Formularmodell: KEINE id/Defaultflags übernehmen;
// Label sinnvoll als „Kopie von …" kennzeichnen, ohne bestehende
// Labels zu zerstören (nur eine NEUE, unabhängige Kopie wird erzeugt).
export function prepareDuplicateFormValues(address) {
  const base = addressToFormValues(address);
  const sourceLabel = (address?.label || "").trim();
  const sourceCompany = (address?.company || "").trim();
  const newLabel = sourceLabel ? duplicateLabel(sourceLabel) : (sourceCompany ? duplicateLabel(sourceCompany) : "");
  return {
    ...base,
    label: newLabel,
    favorite: false,
    isDefaultSender: false,
    isDefaultRecipient: false,
  };
}

// ── Validierung ──────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO2_RE = /^[A-Z]{2}$/;

function postalErrorMessage(country, value) {
  const pc = validatePostalCode(country, value);
  if (pc.valid) return null;
  if (pc.code === "POSTAL_CODE_REQUIRED") return "PLZ ist ein Pflichtfeld.";
  return pc.example ? `PLZ passt nicht zum Landesformat (Beispiel: ${pc.example}).` : "PLZ ist ungültig.";
}

// Liefert ein Fehlerobjekt (leer = gültig). Rein clientseitig — schnelles
// Feedback; das Backend bleibt autoritativ (validiert erneut vor Persistenz).
export function validateAddressForm(form) {
  const f = form || {};
  const errors = {};

  // ── Versandkontakt ─────────────────────────────────────────────────────────────
  // Dieselbe Produktregel wie im Versandformular: eine Adresse, mit der versendet
  // werden soll, trägt eine vollständige Kontaktperson. Eine ALTBESTANDSadresse lässt
  // sich weiterhin öffnen und ansehen — gespeichert wird sie erst wieder, wenn die vier
  // Felder stehen. Genau deshalb erscheinen sie beim Bearbeiten leer und als Pflicht.
  if (!f.firstName?.trim()) errors.firstName = "Vorname ist ein Pflichtfeld.";
  else if (f.firstName.trim().length > 35) errors.firstName = "Vorname darf maximal 35 Zeichen enthalten.";
  if (!f.lastName?.trim()) errors.lastName = "Nachname ist ein Pflichtfeld.";
  else if (f.lastName.trim().length > 35) errors.lastName = "Nachname darf maximal 35 Zeichen enthalten.";
  if (f.firstName?.trim() && f.lastName?.trim()
      && `${f.firstName.trim()} ${f.lastName.trim()}`.length > 35)
    errors.lastName = "Vor- und Nachname dürfen zusammen maximal 35 Zeichen enthalten.";
  if (!f.email?.trim()) errors.email = "E-Mail-Adresse ist ein Pflichtfeld.";
  if (!f.phone?.trim()) errors.phone = "Telefonnummer ist ein Pflichtfeld.";

  if (!f.streetAndNumber?.trim()) errors.streetAndNumber = "Straße und Hausnummer ist ein Pflichtfeld.";
  if (!f.city?.trim()) errors.city = "Ort ist ein Pflichtfeld.";

  const country = (f.country || "").trim().toUpperCase();
  if (!country) errors.country = "Land ist ein Pflichtfeld.";
  else if (!ISO2_RE.test(country)) errors.country = "Land muss ein gültiger ISO-2-Code sein.";

  { const m = postalErrorMessage(country, f.postalCode); if (m) errors.postalCode = m; }

  if (f.contactName && f.contactName.length > 35) {
    errors.contactName = "Ansprechpartner darf maximal 35 Zeichen enthalten.";
  }
  if (f.email && !EMAIL_RE.test(f.email.trim())) {
    errors.email = "E-Mail-Adresse ist ungültig.";
  }

  // Längen wie der Server (oder enger, siehe ADDRESS_FIELD_MAXLEN) — schon vor dem Absenden, damit
  // nichts erst am Server scheitert. Ein bereits benannter Fehler desselben Felds hat Vorrang.
  for (const [key, max] of Object.entries(ADDRESS_FIELD_MAXLEN)) {
    if (errors[key]) continue;
    const wert = typeof f[key] === "string" ? f[key].trim() : "";
    if (wert.length > max) errors[key] = `${ADDRESS_FIELD_LABELS[key]} darf maximal ${max} Zeichen enthalten.`;
  }

  const roleErrors = validateRoleDefaultConsistency(f);
  Object.assign(errors, roleErrors);

  return errors;
}

// Formularmodell → API-Payload (kanonisches Shape). Leere optionale Felder
// werden als null normalisiert (nicht als ""), Pflichtfelder getrimmt, Land
// großgeschrieben. Keine Felder ergänzen, die das Backend-MVP nicht speichert.
export function normalizeAddressForm(form) {
  const f = form || {};
  const optional = (v) => {
    const t = typeof v === "string" ? v.trim() : v;
    return t ? t : null;
  };
  return {
    label: optional(f.label),
    company: optional(f.company),
    contactName: optional(f.contactName),
    // Pflichtfelder gehen getrimmt und IMMER mit — auch leer, damit die serverseitige
    // Prüfung greift, statt dass ein fehlender Schlüssel still durchrutscht.
    firstName: (f.firstName || "").trim(),
    lastName: (f.lastName || "").trim(),
    email: (f.email || "").trim(),
    phone: (f.phone || "").trim(),
    streetAndNumber: (f.streetAndNumber || "").trim(),
    addressAdd: optional(f.addressAdd),
    postalCode: (f.postalCode || "").trim(),
    city: (f.city || "").trim(),
    state: optional(f.state),
    country: (f.country || "").trim().toUpperCase(),
    notes: optional(f.notes),
    role: f.role,
    favorite: f.favorite === true,
    isDefaultSender: f.isDefaultSender === true,
    isDefaultRecipient: f.isDefaultRecipient === true,
  };
}

// ── Fehlercode-Mapping (Backend → verständliche deutsche Meldung) ───────────
// Keine internen Backend-/SQL-Details. Unbekannte Codes → generische Meldung.
const ERROR_MESSAGES = {
  ADDRESS_NOT_FOUND: "Die Adresse wurde nicht gefunden oder ist nicht mehr verfügbar.",
  ADDRESS_INVALID: "Die Adressangaben sind unvollständig oder ungültig. Bitte prüfen Sie Ihre Eingaben.",
  ADDRESS_ROLE_INVALID: "Die gewählte Rolle ist für diese Adresse nicht gültig.",
  ADDRESS_DEFAULT_ROLE_CONFLICT: "Diese Adresse kann mit der gewählten Rolle nicht als Standard verwendet werden.",
  ADDRESS_DELETE_FAILED: "Die Adresse konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.",
  ADDRESS_LIMIT_INVALID: "Die angeforderte Seitengröße ist ungültig.",
  ADDRESS_CURSOR_INVALID: "Die Liste konnte nicht fortgesetzt werden. Bitte laden Sie die Seite neu.",
  INVALID_POSTAL_CODE_FORMAT: "Bitte prüfen Sie die Postleitzahl für das ausgewählte Land.",
  POSTAL_CODE_REQUIRED: "Für das ausgewählte Land ist eine Postleitzahl erforderlich.",
};
const GENERIC_ERROR_MESSAGE = "Die Adresse konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.";

// Paritätsaudit A3: das Backend speichert keine Adresse ohne vollständigen
// Versandkontakt — auch nicht beim Favorit-/Standardsetzen einer Altbestandsadresse,
// die nur `contactName` trägt. Seit Backend #432 nennt `field` das erste fehlende
// Feld im öffentlichen Vertrag (firstName, lastName, email, phone).
const CONTACT_FIELD_LABELS = Object.freeze({
  firstName: "der Vorname",
  lastName: "der Nachname",
  email: "die E-Mail-Adresse",
  phone: "die Telefonnummer",
});
const CONTACT_INCOMPLETE_HINT = "Bitte ergänzen Sie Vor- und Nachname, E-Mail-Adresse und Telefonnummer über „Bearbeiten“ — erst dann lässt sich die Adresse ändern.";

export function mapAddressErrorToMessage(code, field) {
  if (code === "ADDRESS_CONTACT_INCOMPLETE") {
    const fehlt = CONTACT_FIELD_LABELS[field];
    return fehlt
      ? `Für diese Adresse fehlt noch ${fehlt} des Versandkontakts. ${CONTACT_INCOMPLETE_HINT}`
      : `Für diese Adresse fehlt noch der vollständige Versandkontakt. ${CONTACT_INCOMPLETE_HINT}`;
  }
  return ERROR_MESSAGES[code] || GENERIC_ERROR_MESSAGE;
}

// ── Fehlertexte je Vorgang (Audit P7) ───────────────────────────────────────
// Laden, Nachladen, Speichern, Ändern (Favorit/Standard) und Löschen haben je eigene Sätze. Bis
// 2026-10 erschien beim Laden der Rohtext des Browsers („Failed to fetch“) und bei einem
// Serverfehler „Die Adresse konnte nicht gespeichert werden“ — obwohl gar nichts gespeichert werden
// sollte. Ein Zeitlimit bei einer Änderung sagt ehrlich, dass der Ausgang offen ist.
export const ADDRESS_OPERATIONS = Object.freeze({
  LOAD: "load", LOAD_MORE: "loadMore", SAVE: "save", UPDATE: "update", DELETE: "delete",
});

const FAILED = Object.freeze({
  load: "Die Adressen konnten gerade nicht geladen werden. Bitte versuchen Sie es erneut.",
  loadMore: "Weitere Adressen konnten gerade nicht geladen werden. Bitte versuchen Sie es erneut.",
  save: GENERIC_ERROR_MESSAGE,
  update: "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  delete: "Die Adresse konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.",
});
const OFFLINE = Object.freeze({
  load: "Die Adressen konnten nicht geladen werden — keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
  loadMore: "Weitere Adressen konnten nicht geladen werden — keine Verbindung zum Server. Bitte versuchen Sie es erneut.",
  save: "Die Adresse konnte nicht gespeichert werden — keine Verbindung zum Server. Bitte versuchen Sie es erneut.",
  update: "Die Änderung konnte nicht gespeichert werden — keine Verbindung zum Server. Bitte versuchen Sie es erneut.",
  delete: "Die Adresse konnte nicht gelöscht werden — keine Verbindung zum Server. Bitte versuchen Sie es erneut.",
});
const TIMEOUT_READ = "Der Server hat nicht rechtzeitig geantwortet. Bitte versuchen Sie es erneut.";
const TIMEOUT_WRITE = "Der Server hat nicht rechtzeitig geantwortet. Ob die Änderung übernommen wurde, ist offen — bitte laden Sie das Adressbuch neu und prüfen Sie den Eintrag.";
const RATE_LIMITED = "Zu viele Änderungen in kurzer Zeit. Bitte warten Sie einen Moment und versuchen Sie es erneut.";

const operation = (op) => (Object.prototype.hasOwnProperty.call(FAILED, op) ? op : "save");

// Meldung zu einer Fehlerantwort des Servers (HTTP nicht ok). Bekannte Codes behalten ihren Satz;
// ohne Code entscheiden Status und Vorgang — nie ein Rohwert aus der Antwort.
export function addressFailureMessage(op, { status, code, field } = {}) {
  if (code === "ADDRESS_CONTACT_INCOMPLETE" || (code && ERROR_MESSAGES[code])) return mapAddressErrorToMessage(code, field);
  if (status === 404) return ERROR_MESSAGES.ADDRESS_NOT_FOUND;
  if (status === 429) return RATE_LIMITED;
  return FAILED[operation(op)];
}

// Meldung zu einem Ausnahmefehler ohne Serverbescheid: Zeitlimit (ApiTimeoutError aus apiFetch)
// oder keine Verbindung. Die Fehlermeldung des Browsers wird nie angezeigt.
export function addressExceptionMessage(op, error) {
  const o = operation(op);
  const zeitlimit = !!error && (error.name === "ApiTimeoutError" || error.code === "API_TIMEOUT");
  if (zeitlimit) return o === "load" || o === "loadMore" ? TIMEOUT_READ : TIMEOUT_WRITE;
  return OFFLINE[o];
}

// Feldfehler einer Serverantwort: `field` (öffentlicher Name) steht am Feld, PLZ-Codes an der PLZ.
// Unbekannte Felder ergeben keinen Feldfehler (der Sammelhinweis bleibt).
export function addressServerFieldErrors({ code, field } = {}) {
  if (code === "INVALID_POSTAL_CODE_FORMAT") return { postalCode: "PLZ passt nicht zum Landesformat." };
  if (code === "POSTAL_CODE_REQUIRED") return { postalCode: "PLZ ist ein Pflichtfeld." };
  if (typeof field !== "string" || !Object.prototype.hasOwnProperty.call(ADDRESS_FIELD_LABELS, field)) return {};
  const name = ADDRESS_FIELD_LABELS[field];
  if (code === "ADDRESS_CONTACT_INCOMPLETE") return { [field]: `${name} ist ein Pflichtfeld.` };
  if (code === "ADDRESS_INVALID") {
    const max = ADDRESS_FIELD_MAXLEN[field];
    return { [field]: max
      ? `${name} wurde nicht angenommen — bitte Länge (höchstens ${max} Zeichen) und Format prüfen.`
      : `${name} wurde nicht angenommen — bitte prüfen.` };
  }
  return {};
}

// Reihenfolge der Felder im Formular — der Fokus geht nach einem Fehler auf das erste.
export const ADDRESS_FIELD_ORDER = Object.freeze([
  "label", "company", "firstName", "lastName", "email", "phone",
  "country", "state", "streetAndNumber", "addressAdd", "postalCode", "city", "notes",
]);

export function firstAddressErrorField(errors) {
  const e = errors || {};
  return ADDRESS_FIELD_ORDER.find((k) => e[k]) || null;
}
