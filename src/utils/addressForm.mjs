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
    label: "", company: "", contactName: "", email: "", phone: "",
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

// Formularmodell → Duplikat-Formularmodell: KEINE id/Defaultflags übernehmen;
// Label sinnvoll als „Kopie von …" kennzeichnen, ohne bestehende
// Labels zu zerstören (nur eine NEUE, unabhängige Kopie wird erzeugt).
export function prepareDuplicateFormValues(address) {
  const base = addressToFormValues(address);
  const sourceLabel = (address?.label || "").trim();
  const sourceCompany = (address?.company || "").trim();
  const newLabel = sourceLabel ? `Kopie von ${sourceLabel}` : (sourceCompany ? `Kopie von ${sourceCompany}` : "");
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
    email: optional(f.email),
    phone: optional(f.phone),
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

export function mapAddressErrorToMessage(code) {
  return ERROR_MESSAGES[code] || GENERIC_ERROR_MESSAGE;
}
