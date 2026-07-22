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
    country: user?.country ? str(user.country) : "DE",
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

// ── Client-Validierung (nur technische Mindestprüfung, kein Fach-Overreach) ──
// Alle Felder optional (Backend erlaubt Leeren → NULL); geprüft wird nur Länge
// und — fürs Land — das 2-stellige ISO-Format. Rückgabe: Fehlerobjekt (leer = ok).
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
  const errors = validateMaxLen(COMPANY_FIELDS, form);
  const country = trimmed(form?.country);
  if (country !== "" && !/^[A-Z]{2}$/i.test(country)) {
    errors.country = "Bitte ein gültiges Land wählen.";
  }
  return errors;
}

export function validateContactForm(form) {
  return validateMaxLen(CONTACT_FIELDS, form);
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
