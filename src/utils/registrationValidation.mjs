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
// Formprüfung des Empfehlungscodes (Vertriebspartnerprogramm, unten ergänzt).
import { normalizeReferralCode } from "./referralCapture.mjs";
// Auftrag 2 / P10: USt-IdNr. — EINE Regel, gespiegelt aus Backend lib/vatId.js (gemeinsame Falltabelle).
import { validateRequiredVatId, normalizeVatId } from "./vatId.mjs";

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

  // Auftrag 2 / P10 (Betreiberentscheidung 2026-10-17): die USt-IdNr. ist bei jeder Neuregistrierung Pflicht —
  // Format nach Länderpräfix, keine behördliche Prüfung. Verbindlich prüft der Server.
  const ust = validateRequiredVatId(form.vat_id);
  if (!ust.ok) e.vat_id = ust.error;

  // Weiterhin optionale Felder: nur Längenobergrenzen.
  if (form.street?.length > 200) e.street = "Straße darf maximal 200 Zeichen enthalten.";
  if (form.zip?.length > 10)     e.zip    = "PLZ darf maximal 10 Zeichen enthalten.";
  if (form.city?.length > 100)   e.city   = "Stadt darf maximal 100 Zeichen enthalten.";

  return e;
}

// Felder, die das Formular überhaupt kennt — schützt davor, dass eine unbekannte
// `field`-Angabe aus einer Antwort einen unsichtbaren Fehler erzeugt.
// Die beiden Erklärungen (Paket C) zählen dazu: ein Feldfehler des Servers landet
// dann an der jeweiligen Checkbox statt als allgemeiner Banner.
const KNOWN_FORM_FIELDS = new Set([
  "name", "email", "password", "company_name", "vat_id", "street", "zip", "city", "country",
  "businessCustomerConfirmed", "termsAcknowledged",
]);

// ═════════════════════════════════════════════════════════════════════════════
// Erklärungen bei der Registrierung (Go-Live Paket C) — ADDITIV. Die Regeln oben
// (Feldnamen, Pflichtfelder, Payload) sind unverändert; die Erklärungen haben
// eine eigene Prüfung, damit bestehende Aufrufer von getRegErrors gleich bleiben.
//
// Zwei Pflicht-Checkboxen VOR dem Absenden: die Unternehmererklärung (§ 14 BGB)
// und die Bestätigung der AGB in der angezeigten Fassung. Die Datenschutz-
// erklärung wird nur verlinkt — eine „Datenschutz akzeptiert"-Box wäre eine
// erfundene Einwilligung. Was gilt und gespeichert wird, entscheidet der Server.
// ═════════════════════════════════════════════════════════════════════════════
export const REG_DECLARATION_TEXTS = Object.freeze({
  business:
    "Ich lege dieses Konto als Unternehmer im Sinne von § 14 BGB an, also für meine gewerbliche oder selbständige berufliche Tätigkeit.",
  businessRequired: "Bitte bestätigen Sie, dass Sie das Konto als Unternehmer anlegen.",
  termsRequired: "Bitte bestätigen Sie die Allgemeinen Geschäftsbedingungen.",
  setChanged:
    "Die Allgemeinen Geschäftsbedingungen wurden aktualisiert. Bitte prüfen und bestätigen Sie die aktuelle Fassung erneut.",
  // Steht unter den Erklärungen, sobald NUR noch sie fehlen: der Knopf ist dann gesperrt, und
  // ein gesperrter Knopf ohne Begründung ist im UAT als Fehler gemessen worden.
  missingHint: "Bitte bestätigen Sie die beiden Erklärungen, um das Konto zu beantragen.",
});

export const emptyRegistrationDeclarations = () => ({ businessCustomerConfirmed: false, termsAcknowledged: false });

// Rückgabe wie getRegErrors: { <feld>: "<Text>" } — leer = absendbar.
export function getRegDeclarationErrors(decl = {}) {
  const e = {};
  if (decl.businessCustomerConfirmed !== true) e.businessCustomerConfirmed = REG_DECLARATION_TEXTS.businessRequired;
  if (decl.termsAcknowledged !== true) e.termsAcknowledged = REG_DECLARATION_TEXTS.termsRequired;
  return e;
}

/**
 * Wertet `GET /api/legal/current` für die Registrierung aus — welche AGB-Fassung wird
 * angezeigt? `null`, wenn keine Fassung abrufbar ist (dann verweist die Checkbox auf die
 * Webseite /agb, und der Server speichert die Bestätigung ehrlich ohne Fassung).
 */
export function parseRegistrationLegalContext(status, body) {
  if (status !== 200 || !body || typeof body !== "object") return null;
  const setKey = typeof body.setKey === "string" ? body.setKey.trim() : "";
  const docs = Array.isArray(body.documents) ? body.documents : [];
  const doc = (typ) => {
    const d = docs.find((x) => x && x.type === typ);
    if (!d || typeof d.version !== "string" || typeof d.url !== "string" || !d.url) return null;
    const suffix = typeof d.labelSuffix === "string" && d.labelSuffix.trim() ? d.labelSuffix.trim() : null;
    return { version: d.version, url: d.url, labelSuffix: suffix };
  };
  const terms = doc("terms");
  if (!setKey || !terms) return null;
  return { setKey, terms, privacy: doc("privacy") };
}

// Die Erklärungen kommen nur in den Body, wenn BEIDE gesetzt sind — sonst bleibt der
// Payload exakt der bisherige. Der Setschlüssel nur, wenn eine Fassung angezeigt wurde:
// er ist ein „das habe ich gesehen"-Token, keine Auswahl (der Server vergleicht).
export function withRegistrationDeclarations(payload, decl = {}, legalContext = null) {
  if (decl.businessCustomerConfirmed !== true || decl.termsAcknowledged !== true) return payload;
  const out = { ...payload, businessCustomerConfirmed: true, termsAcknowledged: true };
  if (legalContext && legalContext.setKey) out.legalSetKey = legalContext.setKey;
  return out;
}

export const isRegistrationSetChanged = (status, body) =>
  status === 409 && !!body && body.code === "LEGAL_SET_CHANGED";

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
  // Auftrag 2 / P10: die USt-IdNr. in der normalisierten Form (der Server normalisiert dieselbe Regel erneut).
  if (typeof form.vat_id === "string") payload.vat_id = normalizeVatId(form.vat_id);
  return payload;
}

// ═════════════════════════════════════════════════════════════════════════════
// Vertriebspartnerprogramm — ausschließlich ADDITIV ergänzt. Die Kundenregeln
// oben (Feldnamen, Pflichtfelder, Payload) sind unverändert.
// ═════════════════════════════════════════════════════════════════════════════

// Kundenregistrierung: der Empfehlungscode kommt als EIGENES Feld hinzu — und
// nur, wenn ein formal gültiger Code vorliegt. Ohne Code ist der Payload exakt
// der bisherige (dieselben Schlüssel, dieselbe Reihenfolge). Ob der Code gilt,
// entscheidet allein der Server; die Antwort verrät es nicht.
export function withReferralCode(payload, code) {
  const sauber = normalizeReferralCode(code);
  return sauber ? { ...payload, referralCode: sauber } : payload;
}

// Partnerregistrierung: eigener Flow, eigene Feldnamen (camelCase laut
// Partnervertrag), dieselben Regeln für E-Mail und Passwort wie oben.
export const PARTNER_NAME_RULE = Object.freeze({ apiField: "name", label: "Name", minLen: 2, maxLen: 100 });
export const PARTNER_COMPANY_MAX = 200;
export const PARTNER_PHONE_MAX = 40;
const PARTNER_PHONE_RE = /^[0-9+()/. -]*$/;

export const PARTNER_REG_TEXTS = Object.freeze({
  agreementRequired: "Bitte bestätigen Sie die Vertriebspartnervereinbarung.",
  // Pre-Live-Testweg: statt der Vertragsannahme (wörtlich laut Betreiber). Kein Vertragstext, keine
  // Zustimmung — der Hinweis wird nicht gespeichert und nicht gesendet.
  preliveNotice: "Pre-Live-Testbetrieb – diese Registrierung dient ausschließlich dem internen Funktionstest und begründet noch keine rechtsverbindliche Vertriebspartnervereinbarung.",
  companyTooLong: `Firma darf maximal ${PARTNER_COMPANY_MAX} Zeichen enthalten.`,
  phoneTooLong: `Telefon darf maximal ${PARTNER_PHONE_MAX} Zeichen enthalten.`,
  phoneInvalid: "Bitte eine gültige Telefonnummer eingeben.",
  disabled: "Die Registrierung für Vertriebspartner ist derzeit nicht geöffnet.",
  emailTaken: "Diese E-Mail-Adresse ist bereits registriert.",
  rateLimited: "Zu viele Versuche. Bitte warten Sie einen Moment und versuchen Sie es anschließend erneut.",
  generic: "Die Registrierung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.",
  // UX-Paket 6: eindeutiger Erfolg und der nächste Schritt — ohne Anmeldeknopf,
  // denn vor der Freigabe ist keine Anmeldung möglich. Die Freigabemail nennt
  // nur der produktive Weg (an Testkonten hält der Versandschutz sie zurück).
  success: "Ihr Antrag ist eingegangen und wird geprüft.",
  successNext: "Sobald Ihr Konto freigeschaltet ist, melden Sie sich mit Ihrer E-Mail-Adresse und Ihrem Passwort an. Vorher ist keine Anmeldung möglich.",
  successMail: "Über die Freigabe informieren wir Sie per E-Mail.",
  requiredHint: "Pflichtfelder sind mit * markiert.",
  checkMarked: "Bitte prüfen Sie die markierten Angaben.",
});

// Rückgabe wie getRegErrors: { <feld>: "<Text>" } — leer = absendbar.
// Feldschlüssel: name, email, password, passwordRepeat, companyName, phone, agreement.
// requireAgreement: false NUR im Pre-Live-Testweg (dort gibt es keine Vertragsannahme); alle übrigen
// Felder und Regeln bleiben exakt dieselben.
export function getPartnerRegErrors(form = {}, passwordRepeat = "", { requireAgreement = true } = {}) {
  const e = {};
  const nameError = b2bFieldError(PARTNER_NAME_RULE, form.name);
  if (nameError) e.name = nameError;
  // E-Mail, Passwortlänge und Wiederholung über EXAKT die Kundenregeln — keine
  // zweite Fassung. Die B2B-Pflichtfelder der Kundenregistrierung spielen hier
  // keine Rolle und werden verworfen.
  const basis = getRegErrors({ email: form.email, password: form.password }, passwordRepeat);
  for (const k of ["email", "password", "passwordRepeat"]) if (basis[k]) e[k] = basis[k];
  if (trimmed(form.companyName).length > PARTNER_COMPANY_MAX) e.companyName = PARTNER_REG_TEXTS.companyTooLong;
  const phone = trimmed(form.phone);
  if (phone.length > PARTNER_PHONE_MAX) e.phone = PARTNER_REG_TEXTS.phoneTooLong;
  else if (!PARTNER_PHONE_RE.test(phone)) e.phone = PARTNER_REG_TEXTS.phoneInvalid;
  if (requireAgreement && form.agreementAccepted !== true) e.agreement = PARTNER_REG_TEXTS.agreementRequired;
  return e;
}

// Body für POST /api/sales-partner/register. Optionale Felder nur, wenn sie
// einen Wert tragen; der Sponsorcode nur, wenn er formal gültig ist; die
// Vereinbarungsfassung nur bei bestätigter Zustimmung.
export function buildPartnerRegistrationPayload(form = {}, { sponsorCode = null, agreementVersion = null } = {}) {
  const payload = {
    name: trimmed(form.name),
    email: trimmed(form.email),
    password: typeof form.password === "string" ? form.password : "",
  };
  const company = trimmed(form.companyName);
  if (company) payload.companyName = company;
  const phone = trimmed(form.phone);
  if (phone) payload.phone = phone;
  const sponsor = normalizeReferralCode(sponsorCode);
  if (sponsor) payload.sponsorCode = sponsor;
  const version = trimmed(agreementVersion);
  if (form.agreementAccepted === true && version) payload.acceptedAgreementVersion = version;
  return payload;
}

const PARTNER_FORM_FIELDS = Object.freeze({
  name: "name", email: "email", password: "password", companyName: "companyName", phone: "phone",
  acceptedAgreementVersion: "agreement", agreement: "agreement",
});

// Fehlerantwort → { disabled, fieldErrors, generalError }. Ein Ablehnungsgrund
// wird nie geraten; Servertexte nur bei Eingabefehlern (400/422), nie bei 5xx.
export function mapPartnerRegistrationError(status, payload) {
  const d = payload && typeof payload === "object" ? payload : {};
  const code = typeof d.code === "string" ? d.code.trim() : "";
  const serverText = typeof d.error === "string" && d.error.trim() ? d.error.trim() : "";
  const ergebnis = (fieldErrors = {}, generalError = "", disabled = false) => ({ disabled, fieldErrors, generalError });

  // Abgeschaltet oder (noch) nicht vorhanden: fail-closed wie „nicht geöffnet".
  if (status === 404) return ergebnis({}, "", true);
  if (code === "AGREEMENT_REQUIRED") return ergebnis({ agreement: PARTNER_REG_TEXTS.agreementRequired });
  if (status === 409) return ergebnis({ email: serverText || PARTNER_REG_TEXTS.emailTaken });
  if (status === 429) return ergebnis({}, PARTNER_REG_TEXTS.rateLimited);
  if (status === 400 || status === 422) {
    const field = typeof d.field === "string" ? PARTNER_FORM_FIELDS[d.field.trim()] : undefined;
    if (field) return ergebnis({ [field]: serverText || PARTNER_REG_TEXTS.generic });
    return ergebnis({}, serverText || PARTNER_REG_TEXTS.generic);
  }
  return ergebnis({}, PARTNER_REG_TEXTS.generic);
}
