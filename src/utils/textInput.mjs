/* ── Text an den Eingabegrenzen (Eingabe-Audit A9, 2026-11-03) ─────────────────────────────────
   Spiegel von lib/textInput.js im Backend; das Backend bleibt autoritativ.

   Eingefügter Text bringt zwei unsichtbare Abweichungen mit, die `trim()` nicht entfernt:
   zerlegte Umlaute (NFD: „u" + U+0308) und Formatzeichen ohne Breite (U+200B, U+2060, U+FEFF,
   in Formatfeldern auch U+200C/U+200D). Eine PLZ „\u200B70794" galt deshalb als „entspricht nicht dem
   Format", eine Telefonnummer als „nicht erkannt". Nichts wird gekürzt, kein sichtbares Zeichen
   ersetzt. */

// Formatfelder (PLZ, Telefon, USt-IdNr.): dort hat keines dieser Zeichen eine Bedeutung.
const FORMAT_INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF]/g;
// Freitext: U+200C/U+200D bleiben — in manchen Schriften tragen sie Bedeutung.
const TEXT_INVISIBLE_RE = /[\u200B\u2060\uFEFF]/g;

/** Entfernt unsichtbare Formatzeichen aus einem Formatfeld. Nicht-Strings bleiben unverändert. */
export function stripInvisibleFormatChars(value) {
  return typeof value === "string" ? value.replace(FORMAT_INVISIBLE_RE, "") : value;
}

/** NFC und ohne unsichtbare Breitenzeichen — für Namen, Firmen und Anschriften. */
export function normalizeFreeText(value) {
  return typeof value === "string" ? value.normalize("NFC").replace(TEXT_INVISIBLE_RE, "") : value;
}
