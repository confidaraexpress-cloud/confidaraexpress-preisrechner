// ─────────────────────────────────────────────────────────────────────────────
// „Mein Profil" — reine, framework-freie Hilfslogik (.mjs, wie addressBookView/
// emailChangeView/draftsView). Bündelt die testbare Logik der bereichsweisen
// Profilbearbeitung: PATCH-Body-Bau (mit strukturell garantiertem Mass-Assignment-
// Schutz), Dirty-State, Ein-Karten-Editregel, Client-Validierung und die
// funktionalen Texte. Kein React, kein Netzwerk — nur mit `node --test` geprüfte,
// deterministische Funktionen. Das Backend (PATCH /kunde/profil) bleibt in allem
// autoritativ und validiert erneut.
//
// WICHTIG (Backend-Abgleich, siehe routes/kunde.js PROFILE_EDITABLE_FIELDS):
// Editierbar sind ausschließlich  name, company_name, vat_id, street, zip, city,
// country. E-Mail, Passwort, Status, Rolle, Zahlungsziel, Kreditwerte, id sind
// NICHT editierbar und tauchen in keinem PATCH-Body auf. Ein „phone"/Telefon-Feld
// existiert im Nutzer-Datenmodell NICHT (keine users.phone-Spalte, nicht in der
// Whitelist, nicht in /kundenbereich) — die Ansprechpartner-Karte führt daher
// bewusst nur „Name" und täuscht keinen nicht speicherbaren Telefonwert vor.
// ─────────────────────────────────────────────────────────────────────────────

import { B2B_REQUIRED_FIELDS, b2bFieldError } from "./registrationValidation.mjs";
// Eine Länderquelle für das ganze Portal (calculatorValidation.mjs importiert sie ebenso).
import { normalizeCountryCode } from "./countries.js";

// Feldgruppen exakt nach Backend-Whitelist (snake_case = echte Spalten-/Body-Namen).
export const COMPANY_FIELDS = ["company_name", "vat_id", "street", "zip", "city", "country"];
export const CONTACT_FIELDS = ["name"];

// Backend-Längengrenzen (routes/kunde.js PROFILE_EDITABLE_FIELDS). Frontend prüft
// nur vor, damit kein Roh-400 nötig ist; strengere Fachregeln werden NICHT erfunden.
export const FIELD_MAXLEN = {
  name: 100,
  company_name: 200,
  vat_id: 30,
  street: 200,
  zip: 10,
  city: 100,
};

const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const trimmed = (v) => str(v).trim();

// ── Baselines (Serverzustand → lokale Formular-Ausgangswerte) ────────────────
// Deutschland-Default fürs Land (bestehendes Verhalten); alle übrigen Felder leer,
// falls nicht gesetzt. Diese Baseline ist zugleich die Vergleichsbasis für Dirty.
export function companyBaseline(user) {
  return {
    company_name: str(user?.company_name),
    vat_id: str(user?.vat_id),
    street: str(user?.street),
    zip: str(user?.zip),
    city: str(user?.city),
    // Über die Länderliste, nicht roh: ein gespeicherter Wert, den das Auswahlfeld
    // nicht darstellen kann (`users.country` ist VARCHAR(10) ohne CHECK), machte die
    // Unternehmenskarte unspeicherbar — das Feld sah gefüllt aus, der PATCH lehnte
    // den unveränderten Wert aber mit „2-stelliger ISO-Ländercode erforderlich" ab.
    // Der Kunde konnte sein Profil dadurch nicht selbst in Ordnung bringen.
    // Die ANZEIGE der Profilseite bleibt bewusst ungefiltert („Nicht angegeben"),
    // damit sie nicht behauptet, es sei ein Land hinterlegt.
    country: normalizeCountryCode(user?.country),
  };
}

export function contactBaseline(user) {
  return { name: str(user?.name) };
}

// ── PATCH-Body-Bau ──────────────────────────────────────────────────────────
// NUR die jeweilige Feldgruppe, getrimmt (Land zusätzlich upper-case wie das
// Backend). Die Schlüsselmenge ist fix aus COMPANY_FIELDS/CONTACT_FIELDS abgeleitet
// → strukturell kein Mass Assignment: E-Mail/Status/Rolle/Zahlung/id sind nicht
// enthaltbar, egal was im Formular-State liegt.
export function buildCompanyPatch(form) {
  return {
    company_name: trimmed(form?.company_name),
    vat_id: trimmed(form?.vat_id),
    street: trimmed(form?.street),
    zip: trimmed(form?.zip),
    city: trimmed(form?.city),
    country: trimmed(form?.country).toUpperCase(),
  };
}

export function buildContactPatch(form) {
  return { name: trimmed(form?.name) };
}

// ── Dirty-State ─────────────────────────────────────────────────────────────
// Vergleich der NORMALISIERTEN Werte (getrimmt) gegen die Baseline. Reine Fokus-/
// Blur-Aktion ohne Wertänderung zählt nicht. Speichern nur bei echter Änderung.
function shallowEqual(a, b) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

export function isCompanyDirty(form, baseline) {
  return !shallowEqual(buildCompanyPatch(form), buildCompanyPatch(baseline));
}

export function isContactDirty(form, baseline) {
  return buildContactPatch(form).name !== buildContactPatch(baseline).name;
}

// ── B2B-Pflichtfelder ───────────────────────────────────────────────────────
// ConfidaraExpress ist ausschließlich B2B: ein aktives Kundenkonto muss dauerhaft
// Firmenname und Ansprechpartner besitzen. Beide dürfen im Profil geändert, aber
// nicht geleert werden (Backend: PATCH /kunde/profil, code B2B_PROFILE_FIELD_REQUIRED).
// Die Regeln kommen aus registrationValidation.mjs — dieselbe Quelle wie im
// Registrierungsformular, damit Profil und Registrierung nicht auseinanderlaufen.
export const B2B_REQUIRED_PROFILE_FIELDS = B2B_REQUIRED_FIELDS.map((r) => r.apiField);

export function isB2BRequiredField(field) {
  return B2B_REQUIRED_PROFILE_FIELDS.includes(field);
}

// Pflichtfeldfehler für die Felder EINER Kartengruppe (leer = ok).
function validateB2BRequired(fields, form) {
  const errors = {};
  for (const rule of B2B_REQUIRED_FIELDS) {
    if (!fields.includes(rule.apiField)) continue;
    const err = b2bFieldError(rule, form?.[rule.apiField]);
    if (err) errors[rule.apiField] = err;
  }
  return errors;
}

// ── Client-Validierung (nur technische Mindestprüfung, kein Fach-Overreach) ──
// Optionale Felder dürfen weiterhin geleert werden (Backend → NULL); geprüft wird
// dort nur Länge und — fürs Land — das 2-stellige ISO-Format. Für die beiden
// B2B-Pflichtfelder gilt zusätzlich die trim-basierte Pflichtprüfung oben.
// Rückgabe: Fehlerobjekt (leer = ok).
function validateMaxLen(fields, form) {
  const errors = {};
  for (const key of fields) {
    if (key === "country") continue;
    const val = trimmed(form?.[key]);
    if (FIELD_MAXLEN[key] != null && val.length > FIELD_MAXLEN[key]) {
      errors[key] = `Maximal ${FIELD_MAXLEN[key]} Zeichen erlaubt.`;
    }
  }
  return errors;
}

export function validateCompanyForm(form) {
  const errors = { ...validateMaxLen(COMPANY_FIELDS, form), ...validateB2BRequired(COMPANY_FIELDS, form) };
  const country = trimmed(form?.country);
  if (country !== "" && !/^[A-Z]{2}$/i.test(country)) {
    errors.country = "Bitte ein gültiges Land wählen.";
  }
  return errors;
}

export function validateContactForm(form) {
  return { ...validateMaxLen(CONTACT_FIELDS, form), ...validateB2BRequired(CONTACT_FIELDS, form) };
}

// ── Backend-Feldfehler zuordnen ─────────────────────────────────────────────
// Das Backend liefert bei Feldfehlern { error, code, field } (gleiche Form wie bei
// der Registrierung). Kennt das Formular das Feld, wird der Text am Eingabefeld
// angezeigt; sonst bleibt es bei der allgemeinen Kartenmeldung.
// → { fieldErrors, generalError }
const KNOWN_PROFILE_FIELDS = new Set([...COMPANY_FIELDS, ...CONTACT_FIELDS]);

export function mapApiProfileError(payload, fallback = "Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.") {
  const data = payload && typeof payload === "object" ? payload : {};
  const message = typeof data.error === "string" && data.error.trim() ? data.error.trim() : fallback;
  const field = typeof data.field === "string" ? data.field : "";
  if (field && KNOWN_PROFILE_FIELDS.has(field)) {
    return { fieldErrors: { [field]: message }, generalError: "" };
  }
  return { fieldErrors: {}, generalError: message };
}

export function isFormValid(errors) {
  return !errors || Object.keys(errors).length === 0;
}

// Speichern-Button freigeben: gültig UND geändert UND kein laufender Request.
export function canSaveCompany(form, baseline, saving) {
  return !saving && isCompanyDirty(form, baseline) && isFormValid(validateCompanyForm(form));
}
export function canSaveContact(form, baseline, saving) {
  return !saving && isContactDirty(form, baseline) && isFormValid(validateContactForm(form));
}

// ── Ein-Karten-Editregel (§9) ───────────────────────────────────────────────
// Es darf immer nur EINE Profilkarte gleichzeitig bearbeitet werden. Der
// „Bearbeiten"-Button einer anderen Karte ist deaktiviert, solange eine Karte
// aktiv im Edit ist. activeCard ∈ { null, "company", "contact" }.
export function isEditActionDisabled(activeCard, card) {
  return activeCard != null && activeCard !== card;
}

// ── Anzeige-Ableitungen ─────────────────────────────────────────────────────
// Kompakte Adresse aus Straße/PLZ/Stadt (nur echte, gesetzte Werte).
export function companyAddressLine(user) {
  return user?.street ? `${user.street}, ${user.zip || ""} ${user.city || ""}`.trim() : "";
}

// Zahlungsziel-Anzeige aus dem realen Backendwert (payment_term). Bewusst „X Tage"
// (nicht „Kalendertage" — dafür gibt es keine belegte fachliche Grundlage).
export function paymentTermValue(user) {
  return user?.payment_term ? `${user.payment_term} Tage` : "Nicht hinterlegt";
}

// ── Funktionale Texte (§10/§28) ─────────────────────────────────────────────
// Zahlungsweise: reines Anzeigelabel „Rechnung" (der gespeicherte Backendwert wird
// NICHT verändert). Sicherheitshinweis in der sachlich korrekten Variante: die
// Passwortänderung verlangt nur das aktuelle Passwort (keine separate Bestätigung),
// daher „geschützt verarbeitet" statt „bestätigt".
// ── Lieferscheine ───────────────────────────────────────────────────────────
// Eine Kontoeinstellung mit drei Werten. Sie läuft über denselben PATCH /kunde/profil
// wie alle anderen Profilfelder — es gibt keine zweite Speicherstrecke.
//
// Der Wert `external` verhält sich beim Buchen wie `none` (es entsteht kein
// Confidara-Lieferschein); der Unterschied ist rein darstellerisch: nur dort bietet die
// Oberfläche das Feld für die eigene Lieferscheinnummer an.
export const DELIVERY_NOTE_MODES = ["confidara", "external", "none"];
export const DEFAULT_DELIVERY_NOTE_MODE = "none";

// Fail-safe: ein unbekannter oder fehlender Wert gilt als „keine Lieferscheine". Ein
// Konto, dessen Antwort das Feld noch nicht trägt (altes Backend), verhält sich damit
// exakt wie bisher.
export function deliveryNoteMode(user) {
  const v = user?.delivery_note_mode;
  return DELIVERY_NOTE_MODES.includes(v) ? v : DEFAULT_DELIVERY_NOTE_MODE;
}

// Nur der eine Schlüssel — dieselbe strukturelle Mass-Assignment-Sicherheit wie bei den
// übrigen Karten. Ein ungültiger Wert wird gar nicht erst gesendet.
export function buildDeliveryNotePatch(mode) {
  const value = DELIVERY_NOTE_MODES.includes(mode) ? mode : DEFAULT_DELIVERY_NOTE_MODE;
  return { delivery_note_mode: value };
}

// Zeigt die Oberfläche das Feld für die eigene Lieferscheinnummer? Nur im Modus
// `external` UND nur dort, wo überhaupt strukturierte Warendaten vorliegen (Versand aus
// Artikel oder Auftrag). Für eine gewöhnliche Sendung ohne Lagerbezug wäre das Feld eine
// Funktion ohne Gegenstück — es gibt dort keinen Lieferschein, auf den es sich bezöge.
export function showsExternalDeliveryNoteField(user, hasInventoryContext) {
  return deliveryNoteMode(user) === "external" && hasInventoryContext === true;
}

// Kundensprache — bewusst OHNE technische Begriffe (kein „shipment_items", kein
// „delivery_note_mode", kein „Inventory Context").
export const DELIVERY_NOTE_TEXT = {
  title: "Lieferscheine",
  subtitle: "Warenbegleitpapiere für Ihre Sendungen",
  fieldLabel: "Standard für neue Sendungen",
  options: {
    confidara: {
      label: "Automatisch mit Confidara erstellen",
      hint: "Für Sendungen aus Lagerartikeln oder Aufträgen erstellt Confidara nach erfolgreicher Buchung automatisch einen Lieferschein.",
    },
    external: {
      label: "Eigenes Lieferscheinsystem",
      hint: "Confidara erstellt keinen eigenen Lieferschein. Bei Bedarf können Sie Ihre eigene Lieferscheinnummer zur Sendung hinterlegen.",
    },
    none: {
      label: "Keine Lieferscheine",
      hint: "Der bisherige Versandprozess bleibt unverändert.",
    },
  },
  externalFieldLabel: "Eigene Lieferscheinnummer",
  externalFieldHint: "Optional. Die Nummer aus Ihrem eigenen System wird mit dieser Sendung verknüpft.",
  externalFieldPlaceholder: "z. B. LS-58421",
  // Spiegelt die Backendgrenze (lib/deliveryNotes.js EXTERNAL_DELIVERY_NOTE_NUMBER_MAX).
  externalFieldMaxLen: 64,
};

export const PROFILE_TEXT = {
  companyTitle: "Unternehmensdaten",
  companySubtitle: "Stammdaten Ihres Unternehmens",
  contactTitle: "Ansprechpartner",
  contactSubtitle: "Kontaktperson für Rückfragen",
  accountTitle: "Konto & Zahlungsbedingungen",
  paymentMethodLabel: "Zahlungsweise",
  paymentMethodValue: "Rechnung",
  paymentTermLabel: "Zahlungsziel",
  paymentHint: "Änderungen der Zahlungsbedingungen erfolgen nach Rücksprache mit ConfidaraExpress.",
  securityHint: "Änderungen an Login-E-Mail und Passwort werden aus Sicherheitsgründen geschützt verarbeitet.",
};
