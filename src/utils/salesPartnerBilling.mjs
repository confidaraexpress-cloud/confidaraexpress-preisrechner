// ── Abrechnungsdaten der Vertriebspartner ───────────────────────────────────
//
// Ein Partner hinterlegt im Partnerportal (Konto → „Abrechnungsdaten") die
// Angaben, mit denen ConfidaraExpress ihm Gutschriften ausstellt: Name bzw.
// Firma, Anschrift, Steuerstatus mit Steuernummer und/oder USt-IdNr. und die
// Bankverbindung für die Überweisung. Jede echte Änderung geht in die Prüfung
// („In Prüfung") und gilt nur für künftige Gutschriften.
//
//   GET /api/sales-partner/me/billing-details → { status, billingDetails | null, accountEmail }
//   PUT /api/sales-partner/me/billing-details → { status, billingDetails, changedFields, unchanged }
//                                              400 { error, code: "BILLING_DETAILS_INVALID", field }
//
// Verbindlich:
//   • Die vollständige IBAN gelangt im Partnerportal NIE in den Zustand: die
//     Antwort trägt nur `ibanMasked`, ein Feld `iban` wird beim Normalisieren
//     verworfen, und selbst eine ungemaskte `ibanMasked` erscheint maskiert.
//     Im Formular bleibt das IBAN-Feld leer; leer gesendet (Feld weggelassen)
//     heißt „hinterlegte IBAN behalten" — nur, wenn schon eine hinterlegt ist.
//   • Steuer- und Bankdaten stehen ausschließlich in dieser Kontofläche (und
//     im Admin-Partnerdetail), nie in Team- oder anderen Ansichten.
//   • Status nie als Rohwert: deutsche Labels, Unbekanntes über statusFallback.
//   • Jeder Body entsteht hier (Allowlist der Vertragsfelder, Prüfung vor dem
//     Senden). Verbindlich bleibt die Prüfung des Servers.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

import { customerText } from "./apiError.mjs";
import { countries } from "./countries.js";
import { statusMetaFrom } from "./salesPartnerView.mjs";
import { formatDateTime } from "./salesPartnerAgreement.mjs";

const objOrNull = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const trimmed = (v) => (typeof v === "string" ? v.trim() : "");
const own = (map, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(map, key);

export const BILLING_TEXTS = Object.freeze({
  title: "Abrechnungsdaten",
  subtitle: "Für Ihre Gutschriften",
  futureOnly: "Änderungen gelten nur für künftige Gutschriften und werden vorher geprüft.",
  loadError: "Ihre Abrechnungsdaten konnten nicht geladen werden.",
  saveFailed: "Ihre Abrechnungsdaten wurden nicht gespeichert. Bitte versuchen Sie es erneut.",
  checkInput: "Bitte prüfen Sie Ihre Angaben.",
  checkMarked: "Bitte prüfen Sie die markierten Angaben.",
  fieldInvalid: "Bitte prüfen Sie diese Angabe.",
  submitted: "Ihre Abrechnungsdaten wurden zur Prüfung eingereicht.",
  unchanged: "Ihre Angaben sind unverändert. Es wurde nichts eingereicht.",
  required: "Bitte ausfüllen.",
  countryRequired: "Bitte wählen Sie ein Land.",
  taxStatusRequired: "Bitte wählen Sie Ihren Steuerstatus.",
  taxIdRequired: "Bitte geben Sie eine Steuernummer oder eine USt-IdNr. an.",
  ibanRequired: "Bitte geben Sie Ihre IBAN an.",
  ibanInvalid: "Bitte prüfen Sie die IBAN.",
  ibanKeep: "Leer lassen, um die hinterlegte IBAN zu behalten.",
  bicInvalid: "Bitte prüfen Sie die BIC.",
  rateLimited: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  notProvided: "Nicht angegeben",
});

// ── Status ──────────────────────────────────────────────────────────────────
export const BILLING_STATUS_VALUES = Object.freeze(["incomplete", "submitted", "confirmed", "rejected"]);

const BILLING_STATUS_META = Object.freeze({
  incomplete: Object.freeze(["badge-yellow", "Unvollständig"]),
  submitted: Object.freeze(["badge-blue", "In Prüfung"]),
  confirmed: Object.freeze(["badge-green", "Bestätigt"]),
  rejected: Object.freeze(["badge-red", "Abgelehnt"]),
});
export const billingStatusMeta = (status) => statusMetaFrom(BILLING_STATUS_META, status);

const BILLING_STATUS_TEXT = Object.freeze({
  incomplete: "Bitte hinterlegen Sie Ihre Abrechnungsdaten. Sie werden vor der ersten Gutschrift geprüft.",
  submitted: "Ihre Angaben werden geprüft. Gutschriften werden erst nach der Bestätigung ausgestellt.",
  confirmed: "Ihre Abrechnungsdaten sind geprüft und bestätigt.",
  rejected: "Ihre Abrechnungsdaten wurden nicht bestätigt. Bitte prüfen und korrigieren Sie Ihre Angaben.",
});
/** Erklärung zum Status — nur für bekannte Werte, sonst null (kein geratener Satz). */
export const billingStatusText = (status) => (own(BILLING_STATUS_TEXT, status) ? BILLING_STATUS_TEXT[status] : null);

// ── Steuerstatus ────────────────────────────────────────────────────────────
export const TAX_STATUS_OPTIONS = Object.freeze([
  Object.freeze({ value: "with_vat", label: "Mit Umsatzsteuerausweis" }),
  Object.freeze({ value: "without_vat", label: "Ohne Umsatzsteuerausweis (Sonderstatus)" }),
]);
const TAX_STATUS_VALUES = TAX_STATUS_OPTIONS.map((o) => o.value);
export function taxStatusLabel(value) {
  const treffer = TAX_STATUS_OPTIONS.find((o) => o.value === value);
  if (treffer) return treffer.label;
  return str(value) ? "Unbekannter Steuerstatus" : "—";
}

// ── Felder ──────────────────────────────────────────────────────────────────
export const BILLING_FIELDS = Object.freeze(["billingName", "street", "postalCode", "city", "country", "taxStatus",
  "taxNumber", "vatId", "accountHolder", "iban", "bic"]);

export const BILLING_FIELD_LABELS = Object.freeze({
  billingName: "Name bzw. Firma",
  street: "Straße und Hausnummer",
  postalCode: "PLZ",
  city: "Ort",
  country: "Land",
  taxStatus: "Steuerstatus",
  taxNumber: "Steuernummer",
  vatId: "USt-IdNr.",
  accountHolder: "Kontoinhaber",
  iban: "IBAN",
  bic: "BIC",
});
/** Deutsches Label eines Vertragsfelds; ein unbekannter Schlüssel erscheint nie roh. */
export const billingFieldLabel = (key) => (own(BILLING_FIELD_LABELS, key) ? BILLING_FIELD_LABELS[key] : "Weitere Angabe");

/** „Geändert: PLZ, IBAN." — nur bekannte Felder, ohne Wiederholung; sonst null. */
export function changedFieldsText(changedFields) {
  const namen = [...new Set((Array.isArray(changedFields) ? changedFields : [])
    .filter((k) => own(BILLING_FIELD_LABELS, k)).map((k) => BILLING_FIELD_LABELS[k]))];
  return namen.length ? `Geändert: ${namen.join(", ")}.` : null;
}

/** Ländername aus der zentralen Liste; ein unbekannter Code bleibt als Code sichtbar. */
export function countryName(code) {
  const c = str(code);
  if (!c) return null;
  const treffer = countries.find((x) => x.code === c.toUpperCase());
  return treffer ? treffer.name : c;
}

/** Auswahlliste der Länder. Ein gespeicherter Code, den die Liste nicht kennt,
 *  wird als eigene Option ergänzt — nie still auf ein anderes Land umgestellt. */
export function billingCountryOptions(current) {
  const c = trimmed(current).toUpperCase();
  const liste = countries.map((x) => ({ value: x.code, label: x.name }));
  if (/^[A-Z]{2}$/.test(c) && !countries.some((x) => x.code === c)) liste.unshift({ value: c, label: c });
  return liste;
}

// ── IBAN ────────────────────────────────────────────────────────────────────

/** Eingabe → kompakte Großschreibung ohne Leerraum. */
export const normalizeIbanInput = (raw) => trimmed(raw).replace(/\s+/g, "").toUpperCase();

/** Formale IBAN-Prüfung: Länderkennung, Prüfziffern, Länge und Modulo 97. Eine
 *  Vorabprüfung gegen Tippfehler — verbindlich prüft der Server. */
export function isValidIban(raw) {
  const iban = normalizeIbanInput(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const zeichen of umgestellt) {
    const wert = /[A-Z]/.test(zeichen) ? String(zeichen.charCodeAt(0) - 55) : zeichen;
    for (const ziffer of wert) rest = (rest * 10 + Number(ziffer)) % 97;
  }
  return rest === 1;
}

/** Die maskierte IBAN der Serverantwort — so, wie der Server sie maskiert hat.
 *  Trägt der Wert kein Maskenzeichen (Zeichen außerhalb des IBAN-Alphabets),
 *  wird er hier maskiert: die Oberfläche zeigt nie eine vollständige IBAN. */
export function maskIbanForDisplay(raw) {
  const v = trimmed(raw).replace(/\s+/g, " ");
  if (!v) return null;
  if (/[^A-Za-z0-9 ]/.test(v)) return v;
  const kompakt = v.replace(/ /g, "").toUpperCase();
  if (kompakt.length < 8) return null;
  return `${kompakt.slice(0, 4)} •••• ${kompakt.slice(-4)}`;
}

/** Vollständige IBAN in Vierergruppen (nur Admin, zur manuellen Überweisung). */
export function formatIbanGroups(raw) {
  const kompakt = normalizeIbanInput(raw);
  return kompakt ? kompakt.replace(/(.{4})/g, "$1 ").trim() : null;
}

const BIC_RE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

// ── Normalisierung ──────────────────────────────────────────────────────────

/** billingDetails → View-Modell oder null. Im Partnerportal (admin: false)
 *  wird eine vollständige IBAN nie übernommen. */
export function normalizeBillingDetails(raw, { admin = false } = {}) {
  const d = objOrNull(raw);
  if (!d) return null;
  const out = {
    billingName: str(d.billingName),
    street: str(d.street),
    postalCode: str(d.postalCode),
    city: str(d.city),
    country: str(d.country) ? str(d.country).toUpperCase() : null,
    taxStatus: str(d.taxStatus),
    taxNumber: str(d.taxNumber),
    vatId: str(d.vatId),
    accountHolder: str(d.accountHolder),
    ibanMasked: maskIbanForDisplay(d.ibanMasked),
    bic: str(d.bic),
    submittedAt: str(d.submittedAt),
    reviewedAt: str(d.reviewedAt),
    reviewNote: str(d.reviewNote),
  };
  if (admin) out.iban = str(d.iban) ? normalizeIbanInput(d.iban) : null;
  return out;
}

/** GET/PUT-Antwort → { status, billingDetails, accountEmail, missingFields }.
 *  `missingFields` liest nur der Adminbereich. */
export function normalizeBillingResponse(raw, { admin = false } = {}) {
  const d = objOrNull(raw) || {};
  const fehlend = admin && Array.isArray(d.missingFields)
    ? [...new Set(d.missingFields.filter((k) => typeof k === "string" && k.trim() !== "").map((k) => k.trim()))]
    : [];
  return {
    status: str(d.status),
    billingDetails: normalizeBillingDetails(d.billingDetails, { admin }),
    accountEmail: str(d.accountEmail),
    missingFields: fehlend,
  };
}

/** Ist eine IBAN hinterlegt (dann darf das Feld leer bleiben)? */
export const hasStoredIban = (details) => !!(details && (details.ibanMasked || details.iban));

/** Eine Anschrift in einer Zeile: „Musterweg 1, 10115 Berlin, Deutschland". */
export function billingAddressLine(details) {
  if (!details) return null;
  const ort = [details.postalCode, details.city].filter(Boolean).join(" ");
  const teile = [details.street, ort, countryName(details.country)].filter(Boolean);
  return teile.length ? teile.join(", ") : null;
}

const zeile = (key, k, wert) => ({ key, k, v: wert || BILLING_TEXTS.notProvided, empty: !wert });

/** Datenzeilen der Partneransicht — die IBAN nur maskiert. */
export function partnerBillingRows(details) {
  if (!details) return [];
  const rows = [
    zeile("billingName", "Name bzw. Firma", details.billingName),
    zeile("address", "Anschrift", billingAddressLine(details)),
    zeile("taxStatus", "Steuerstatus", details.taxStatus ? taxStatusLabel(details.taxStatus) : null),
    zeile("taxNumber", "Steuernummer", details.taxNumber),
    zeile("vatId", "USt-IdNr.", details.vatId),
    zeile("accountHolder", "Kontoinhaber", details.accountHolder),
    zeile("iban", "IBAN", details.ibanMasked),
    zeile("bic", "BIC", details.bic),
  ];
  const eingereicht = formatDateTime(details.submittedAt);
  if (eingereicht !== "—") rows.push(zeile("submittedAt", "Eingereicht am", eingereicht));
  const geprueft = formatDateTime(details.reviewedAt);
  if (geprueft !== "—") rows.push(zeile("reviewedAt", "Geprüft am", geprueft));
  return rows;
}

// ── Formular und Body ───────────────────────────────────────────────────────

export function emptyBillingForm() {
  return { billingName: "", street: "", postalCode: "", city: "", country: "", taxStatus: "",
    taxNumber: "", vatId: "", accountHolder: "", iban: "", bic: "" };
}

/** Startwerte aus den hinterlegten Angaben. Das IBAN-Feld bleibt IMMER leer —
 *  die vollständige IBAN kennt die Oberfläche nicht. */
export function billingFormFrom(details) {
  const f = emptyBillingForm();
  if (!details) return f;
  for (const k of ["billingName", "street", "postalCode", "city", "country", "taxNumber", "vatId", "accountHolder", "bic"]) {
    f[k] = details[k] || "";
  }
  f.taxStatus = TAX_STATUS_VALUES.includes(details.taxStatus) ? details.taxStatus : "";
  return f;
}

const ergebnis = (errors, body) => (Object.keys(errors).length ? { ok: false, errors } : { ok: true, body, errors: {} });

/** PUT-Body aus dem Formular → { ok, body, errors }.
 *  Pflicht: Name/Firma, Straße, PLZ, Ort, Land (ISO-2), Steuerstatus,
 *  Kontoinhaber, mindestens Steuernummer oder USt-IdNr., IBAN bei Erstanlage.
 *  Optionale Felder gehen nur mit Wert hinaus; eine leere IBAN wird nur bei
 *  hinterlegter IBAN weggelassen (= behalten). Fehler unter `taxIds` betreffen
 *  Steuernummer UND USt-IdNr. gemeinsam. */
export function buildBillingDetailsPayload(form = {}, { hasStoredIban: ibanHinterlegt = false } = {}) {
  const f = objOrNull(form) || {};
  const errors = {};
  const pflicht = (k) => {
    const v = trimmed(f[k]);
    if (!v) errors[k] = BILLING_TEXTS.required;
    return v;
  };
  const billingName = pflicht("billingName");
  const street = pflicht("street");
  const postalCode = pflicht("postalCode");
  const city = pflicht("city");
  const country = trimmed(f.country).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) errors.country = BILLING_TEXTS.countryRequired;
  const taxStatus = TAX_STATUS_VALUES.includes(f.taxStatus) ? f.taxStatus : null;
  if (!taxStatus) errors.taxStatus = BILLING_TEXTS.taxStatusRequired;
  const taxNumber = trimmed(f.taxNumber);
  const vatId = trimmed(f.vatId).replace(/\s+/g, "").toUpperCase();
  if (!taxNumber && !vatId) errors.taxIds = BILLING_TEXTS.taxIdRequired;
  const accountHolder = pflicht("accountHolder");
  const iban = normalizeIbanInput(f.iban);
  if (!iban) {
    if (!ibanHinterlegt) errors.iban = BILLING_TEXTS.ibanRequired;
  } else if (!isValidIban(iban)) {
    errors.iban = BILLING_TEXTS.ibanInvalid;
  }
  const bic = trimmed(f.bic).replace(/\s+/g, "").toUpperCase();
  if (bic && !BIC_RE.test(bic)) errors.bic = BILLING_TEXTS.bicInvalid;

  const body = { billingName, street, postalCode, city, country, taxStatus, accountHolder };
  if (taxNumber) body.taxNumber = taxNumber;
  if (vatId) body.vatId = vatId;
  if (iban) body.iban = iban;
  if (bic) body.bic = bic;
  return ergebnis(errors, body);
}

/** Fehlerantwort des PUT → { fieldErrors, generalError }. Ein 400 mit
 *  bekanntem `field` landet am Feld; alles andere als allgemeine Meldung. */
export function mapBillingDetailsSaveError(status, body) {
  const d = objOrNull(body) || {};
  const text = customerText(d);
  if (status === 400 || status === 422) {
    const feld = str(d.field);
    if (d.code === "BILLING_DETAILS_INVALID" && feld && BILLING_FIELDS.includes(feld)) {
      return { fieldErrors: { [feld]: text || BILLING_TEXTS.fieldInvalid }, generalError: BILLING_TEXTS.checkMarked };
    }
    return { fieldErrors: {}, generalError: text || BILLING_TEXTS.checkInput };
  }
  if (status === 429) return { fieldErrors: {}, generalError: BILLING_TEXTS.rateLimited };
  return { fieldErrors: {}, generalError: BILLING_TEXTS.saveFailed };
}

/** Rückmeldung nach einem erfolgreichen PUT. */
export function billingSaveMessage(response) {
  if (response && response.unchanged === true) return BILLING_TEXTS.unchanged;
  const geaendert = changedFieldsText(response?.changedFields);
  return geaendert ? `${BILLING_TEXTS.submitted} ${geaendert}` : BILLING_TEXTS.submitted;
}
