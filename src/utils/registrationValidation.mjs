// Registrierungsvalidierung + B2B-Wording für AuthPage/RegisterForm.
//
// ConfidaraExpress richtet sich ausschließlich an Unternehmen und Geschäftskunden.
// Es gibt keinen Kontotyp-Schalter privat/geschäftlich — jedes Konto ist ein
// Firmenkonto. Firmenname und Ansprechpartner sind deshalb Pflichtfelder.
//
// Diese Datei ist bewusst frei von React/DOM, damit sie mit `node --test` direkt
// geprüft werden kann (das Repo hat keine React-Render-Testinfrastruktur).
//
// WICHTIG: Das Frontend ersetzt keine serverseitige Prüfung. Die verbindliche
// Validierung liegt im Backend (lib/b2bRegistration.js + POST /register); die
// Regeln hier spiegeln sie nur, damit Nutzende Fehler sofort sehen statt erst
// nach dem Absenden. Grenzwerte bewusst identisch gehalten.

import { PASSWORD_MIN_LEN, PASSWORD_MAX_LEN, passwordLengthError } from "./passwordPolicy.mjs";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Fehlertexte des Registrierungsformulars. Die REGEL (8–128, Zählung in
// Code-Points) steht ausschließlich in passwordPolicy.mjs; hier steht nur der
// Wortlaut. Beide Texte sind gegenüber vorher unverändert.
export const REG_PASSWORD_TEXTS = Object.freeze({
  tooShort: `Passwort muss mindestens ${PASSWORD_MIN_LEN} Zeichen enthalten.`,
  tooLong:  `Passwort darf maximal ${PASSWORD_MAX_LEN} Zeichen enthalten.`,
});

// Spiegel von B2B_FIELD_RULES im Backend. apiField ist der tatsächliche JSON-Feldname
// des bestehenden API-Vertrags (snake_case) — es gibt bewusst keine parallelen
// Varianten wie `company` oder `companyName`.
export const B2B_REQUIRED_FIELDS = Object.freeze([
  Object.freeze({ apiField: "company_name", label: "Firmenname",     minLen: 2, maxLen: 200 }),
  Object.freeze({ apiField: "name",         label: "Ansprechpartner", minLen: 2, maxLen: 100 }),
]);

// Hinweistexte über dem Registrierungsformular.
export const B2B_NOTICE =
  "ConfidaraExpress richtet sich ausschließlich an Unternehmen und Geschäftskunden.";
export const B2B_ACTIVATION_NOTE =
  "Nach Ihrer Registrierung prüfen und aktivieren wir Ihr Firmenkonto persönlich.";

const trimmed = (v) => (typeof v === "string" ? v.trim() : "");

// Validiert genau ein B2B-Pflichtfeld → Fehlertext oder null.
export function b2bFieldError(rule, raw) {
  const value = trimmed(raw);
  if (value === "")            return `${rule.label} ist ein Pflichtfeld.`;
  if (value.length < rule.minLen) return `${rule.label} muss mindestens ${rule.minLen} Zeichen enthalten.`;
  if (value.length > rule.maxLen) return `${rule.label} darf maximal ${rule.maxLen} Zeichen enthalten.`;
  return null;
}

// Vollständige Feldfehler des Registrierungsformulars.
// Rückgabe: { <feldname>: "<deutscher Fehlertext>" } — leer = absendbar.
export function getRegErrors(form = {}, passwordRepeat = "") {
  const e = {};

  if (!form.email?.trim())                     e.email    = "E-Mail ist ein Pflichtfeld.";
  else if (!EMAIL_RE.test(form.email.trim()))  e.email    = "Bitte eine gültige geschäftliche E-Mail-Adresse eingeben.";

  // Länge über die zentrale Regel — nie über form.password.length: `.length`
  // zählt UTF-16-Code-Units, sodass sieben getippte Zeichen mit einem Emoji
  // darin als 8 durchgingen (UAT T-003).
  if (!form.password) {
    e.password = "Passwort ist ein Pflichtfeld.";
  } else {
    const pwError = passwordLengthError(form.password, REG_PASSWORD_TEXTS);
    if (pwError) e.password = pwError;
  }

  if (form.password && passwordRepeat !== form.password)
    e.passwordRepeat = "Die Passwörter stimmen nicht überein.";

  // B2B-Pflichtfelder (Firmenname, Ansprechpartner) — trim-basiert, damit reine
  // Leerzeicheneingaben nicht durchrutschen.
  for (const rule of B2B_REQUIRED_FIELDS) {
    const err = b2bFieldError(rule, form[rule.apiField]);
    if (err) e[rule.apiField] = err;
  }

  // Weiterhin optionale Felder: nur Längenobergrenzen.
  if (form.vat_id?.length > 30)  e.vat_id = "USt-ID darf maximal 30 Zeichen enthalten.";
  if (form.street?.length > 200) e.street = "Straße darf maximal 200 Zeichen enthalten.";
  if (form.zip?.length > 10)     e.zip    = "PLZ darf maximal 10 Zeichen enthalten.";
  if (form.city?.length > 100)   e.city   = "Stadt darf maximal 100 Zeichen enthalten.";

  return e;
}

// Felder, die das Formular überhaupt kennt — schützt davor, dass eine unbekannte
// `field`-Angabe aus einer Antwort einen unsichtbaren Fehler erzeugt.
const KNOWN_FORM_FIELDS = new Set([
  "name", "email", "password", "company_name", "vat_id", "street", "zip", "city", "country",
]);

// Ordnet eine Fehlerantwort des Backends dem richtigen Eingabefeld zu.
//
// Das Backend liefert bei Feldfehlern { error, code, field } (dieselbe Form wie
// in routes/formDrafts.js). Kennt das Frontend das Feld, wird der Text am Feld
// angezeigt; sonst bleibt es bei der allgemeinen Fehlermeldung über dem Formular.
//
// Rückgabe: { fieldErrors: {...}, generalError: "" | "<text>" }
export function mapApiRegistrationError(payload, fallback = "Registrierung fehlgeschlagen") {
  const data = payload && typeof payload === "object" ? payload : {};
  const message = typeof data.error === "string" && data.error.trim() ? data.error.trim() : fallback;
  const field = typeof data.field === "string" ? data.field : "";

  if (field && KNOWN_FORM_FIELDS.has(field)) {
    return { fieldErrors: { [field]: message }, generalError: "" };
  }
  return { fieldErrors: {}, generalError: message };
}

// Sendepayload: getrimmte Pflichtfelder, unveränderte Feldnamen des bestehenden
// API-Vertrags. Wird so an POST /register geschickt.
export function buildRegistrationPayload(form = {}) {
  const payload = { ...form };
  for (const rule of B2B_REQUIRED_FIELDS) {
    payload[rule.apiField] = trimmed(form[rule.apiField]);
  }
  if (typeof form.email === "string") payload.email = form.email.trim();
  return payload;
}
