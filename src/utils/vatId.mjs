/* utils/vatId.mjs — USt-IdNr. bei der Neuregistrierung (Auftrag 2 / P10, 2026-10-17).
   Reine Funktionen, gespiegelt aus Backend `lib/vatId.js`; beide prüfen gegen dieselbe Falltabelle
   (src/testing/vatIdCases.json ↔ Backend tests/fixtures/vatIdCases.json). Das Backend bleibt verbindlich —
   hier wird nur vorgeprüft, damit der Fehler direkt am Feld steht.

   Betreiberentscheidung: die USt-IdNr. ist bei jeder neuen Geschäftskundenregistrierung Pflicht; es gibt keine
   alternative Steuernummer. Geprüft wird das FORMAT nach Länderpräfix — keine behördliche Bestätigung, keine
   Steuerbefreiung, kein Reverse-Charge. Leerzeichen, Punkte, Binde- und Schrägstriche entfallen; „GR“ wird „EL“. */

const VAT_ID_FORMATS = Object.freeze({
  AT: /^U\d{8}$/,
  BE: /^[01]\d{9}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-HJ-NP-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^(\d{7}[A-W][A-I]?|\d[A-Z+*]\d{5}[A-W])$/,
  IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
  XI: /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
});

export const VAT_ID_TEXT = Object.freeze({
  label: "USt-IdNr.",
  hint: "Mit Länderkürzel, für Deutschland DE und 9 Ziffern. Wir prüfen das Format, keine behördliche Bestätigung.",
  required: "Bitte geben Sie die USt-IdNr. Ihres Unternehmens an.",
  invalid: "Die USt-IdNr. hat kein gültiges Format. Sie beginnt mit dem Länderkürzel, für Deutschland DE und 9 Ziffern.",
  notEu: "Bitte geben Sie eine USt-IdNr. eines EU-Mitgliedstaats an, beginnend mit dem Länderkürzel (z. B. DE).",
});

// ── Paket D (Betreiberentscheidungen D2/D3, 2026-10-23): Registrierung OHNE USt-IdNr. ─────────────────────────
// Spiegel von lib/vatId.js (Backend): wer keine USt-IdNr. hat und seinen Sitz in Deutschland hat, wählt die Option
// und nennt die Rechtsform; das Konto wird manuell geprüft. Keine Steuernummer, kein Dokumentenupload;
// „Kleinunternehmer" ist eine Steuerregel und keine Rechtsform — bewusst nicht in der Liste. Verbindlich prüft der Server.
export const LEGAL_FORMS_WITHOUT_VAT_ID = Object.freeze([
  Object.freeze({ value: "sole_proprietorship", label: "Einzelunternehmen" }),
  Object.freeze({ value: "freelancer", label: "Freiberufliche Tätigkeit" }),
  Object.freeze({ value: "gbr", label: "Gesellschaft bürgerlichen Rechts (GbR)" }),
  Object.freeze({ value: "registered_merchant", label: "Eingetragener Kaufmann / eingetragene Kauffrau (e.K.)" }),
  Object.freeze({ value: "other", label: "Sonstige Rechtsform" }),
]);
export const isLegalFormWithoutVatId = (v) => typeof v === "string" && LEGAL_FORMS_WITHOUT_VAT_ID.some((f) => f.value === v.trim());
export const legalFormLabel = (v) => {
  const f = typeof v === "string" ? LEGAL_FORMS_WITHOUT_VAT_ID.find((x) => x.value === v.trim()) : null;
  return f ? f.label : null;
};

export const VAT_ID_ABSENT_TEXT = Object.freeze({
  toggle: "Keine USt-IdNr. vorhanden",
  legalFormLabel: "Rechtsform",
  legalFormPlaceholder: "Bitte wählen",
  legalFormRequired: "Bitte wählen Sie die Rechtsform Ihres Unternehmens.",
  countryOnlyDe: "Ohne USt-IdNr. können wir derzeit nur Unternehmen mit Sitz in Deutschland registrieren.",
  conflict: "Bitte geben Sie entweder Ihre USt-IdNr. an oder wählen Sie „Keine USt-IdNr. vorhanden“ — nicht beides.",
  hint: "Gilt für Unternehmen mit Sitz in Deutschland. Wir prüfen die Unternehmereigenschaft manuell und melden uns, falls wir dafür einen Nachweis benötigen — Sie müssen vorab nichts einreichen.",
  adminBadge: "Ohne USt-IdNr. registriert",
});

/** Die normalisierte Form — oder "" ohne Eingabe. */
export function normalizeVatId(raw) {
  if (typeof raw !== "string") return "";
  const v = raw.replace(/[\s./-]+/g, "").toUpperCase();
  return v.startsWith("GR") ? `EL${v.slice(2)}` : v;
}

/** → { ok: true, value } | { ok: false, code, error } — dieselben Codes wie das Backend. */
export function validateRequiredVatId(raw) {
  const fehler = (code, error) => ({ ok: false, code, error });
  if (raw !== undefined && raw !== null && typeof raw !== "string") return fehler("VAT_ID_INVALID", VAT_ID_TEXT.invalid);
  const v = normalizeVatId(raw);
  if (v === "") return fehler("VAT_ID_REQUIRED", VAT_ID_TEXT.required);
  if (v.length > 14 || !/^[A-Z]{2}[0-9A-Z+*]+$/.test(v)) return fehler("VAT_ID_INVALID", VAT_ID_TEXT.invalid);
  const land = v.slice(0, 2);
  const format = Object.prototype.hasOwnProperty.call(VAT_ID_FORMATS, land) ? VAT_ID_FORMATS[land] : null;
  if (!format) return fehler("VAT_ID_INVALID", VAT_ID_TEXT.notEu);
  const rest = v.slice(2);
  if (!format.test(rest)) return fehler("VAT_ID_INVALID", VAT_ID_TEXT.invalid);
  // Dieselbe Plausibilitätsregel wie das Backend: ein langer Null-Lauf oder nur eine einzige Ziffer.
  if (/0{6,}/.test(v) || /^(\d)\1+$/.test(rest.replace(/^U/, ""))) return fehler("VAT_ID_INVALID", VAT_ID_TEXT.invalid);
  return { ok: true, value: v };
}
