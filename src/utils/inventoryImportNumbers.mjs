/* ── Artikelimport — Zahlen und Einheiten ────────────────────────────────────
   Eine Zahl aus einer Textzelle wird STRENG nach dem gewählten Dateiformat gelesen:
     Deutsch        1.234,5   (Punkt gruppiert in Dreiergruppen, Komma trennt Dezimalen)
     International  1,234.5   (Komma gruppiert, Punkt trennt Dezimalen)
   Was nicht passt, ist ein Fehler — nie eine stille Umdeutung. Mehrdeutig ist ein Wert,
   der in BEIDEN Formaten gültig ist und dabei Verschiedenes bedeutet („1.234“ = 1234
   oder 1,234). Enthält eine Spalte nur solche Werte, muss der Kunde das Format
   ausdrücklich wählen (siehe inventoryImportMapping.mjs).

   Einheiten: der Server führt kg und cm. Gramm, Millimeter und Meter werden HIER
   umgerechnet — die Einheit kommt aus dem Spaltennamen oder der ausdrücklichen Wahl,
   nie aus einer Vermutung über die Werte. */

export const NUMBER_FORMATS = Object.freeze({ de: "de", intl: "intl" });

const MUSTER = Object.freeze({
  de: /^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/,
  intl: /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/,
});

function normalisiere(text) {
  // Geschützte und schmale Leerzeichen kommen aus Tabellenprogrammen; außen weg damit.
  return String(text).replace(/[  ]/g, " ").trim();
}

function liesNach(s, format) {
  if (!MUSTER[format].test(s)) return null;
  const ohneGruppen = format === "de" ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(ohneGruppen);
  return Number.isFinite(n) ? n : null;
}

/**
 * Textzahl → Zahl nach Format.
 * @returns {{ ok: true, value: number|null } | { ok: false, code: "NUMBER_INVALID" }}
 */
export function parseNumberText(text, format) {
  if (format !== "de" && format !== "intl") throw new Error("Unbekanntes Zahlformat");
  const s = normalisiere(text);
  if (s === "") return { ok: true, value: null };
  const n = liesNach(s, format);
  return n === null ? { ok: false, code: "NUMBER_INVALID" } : { ok: true, value: n };
}

/** Gültig in beiden Formaten, aber mit verschiedenem Wert (z. B. „1.234“, „1,500“). */
export function isAmbiguousNumberText(text) {
  const s = normalisiere(text);
  if (s === "") return false;
  const de = liesNach(s, "de");
  const intl = liesNach(s, "intl");
  return de !== null && intl !== null && de !== intl;
}

/** Nur in genau einem Format gültig → Beleg für dieses Format; sonst null. */
export function formatEvidence(text) {
  const s = normalisiere(text);
  if (s === "") return null;
  const de = liesNach(s, "de") !== null;
  const intl = liesNach(s, "intl") !== null;
  if (de && !intl) return "de";
  if (intl && !de) return "intl";
  return null;
}

export const WEIGHT_UNITS = Object.freeze(["kg", "g"]);
export const LENGTH_UNITS = Object.freeze(["cm", "mm", "m"]);

/** Gewicht in kg. */
export function toKg(value, unit) {
  if (value === null || value === undefined) return value;
  if (unit === "kg") return value;
  if (unit === "g") return Number((value / 1000).toPrecision(12));
  throw new Error("Unbekannte Gewichtseinheit");
}

/** Länge in cm. */
export function toCm(value, unit) {
  if (value === null || value === undefined) return value;
  if (unit === "cm") return value;
  if (unit === "mm") return Number((value / 10).toPrecision(12));
  if (unit === "m") return Number((value * 100).toPrecision(12));
  throw new Error("Unbekannte Längeneinheit");
}
