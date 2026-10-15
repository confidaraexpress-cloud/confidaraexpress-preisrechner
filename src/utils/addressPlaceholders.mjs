// utils/addressPlaceholders.mjs — Platzhalter für das Ortsfeld je Land.
//
// Reine Anzeige: ein Beispielort in der Schreibweise des Landes, passend zum PLZ-Beispiel aus
// postalCode.mjs. Er ist nie ein Wert, keine Auswahlliste und keine Prüfgrundlage — die
// Adressprüfung kennt keine Ortsliste im Client (addressValidationUx Test 17). Vorher stand
// unabhängig vom Land „Stuttgart“ oder „Zürich“ im Feld, auch neben einem niederländischen
// PLZ-Beispiel.
//
// Abgedeckt ist der EU-Launch-Scope; jedes andere Land bekommt keinen Beispielort.
const BEISPIELORT = Object.freeze({
  AT: "Wien", BE: "Bruxelles", BG: "Sofia", CY: "Lefkosia", CZ: "Praha", DE: "Berlin",
  DK: "København", EE: "Tallinn", ES: "Madrid", FI: "Helsinki", FR: "Paris", GR: "Athina",
  HR: "Zagreb", HU: "Budapest", IE: "Dublin", IT: "Roma", LT: "Vilnius", LU: "Luxembourg",
  LV: "Rīga", MT: "Valletta", NL: "Amsterdam", PL: "Warszawa", PT: "Lisboa", RO: "București",
  SE: "Stockholm", SI: "Ljubljana", SK: "Bratislava",
});

export function cityPlaceholder(country) {
  return BEISPIELORT[String(country || "").trim().toUpperCase()] || "";
}
