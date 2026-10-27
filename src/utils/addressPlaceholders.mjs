// utils/addressPlaceholders.mjs — Platzhalter für das Ortsfeld je Land.
//
// Reine Anzeige: ein Beispielort in der Schreibweise des Landes, passend zum PLZ-Beispiel aus
// postalCode.mjs. Er ist nie ein Wert, keine Auswahlliste und keine Prüfgrundlage — die
// Adressprüfung kennt keine Ortsliste im Client (addressValidationUx Test 17). Vorher stand
// unabhängig vom Land „Stuttgart“ oder „Zürich“ im Feld, auch neben einem niederländischen
// PLZ-Beispiel.
//
// Abgedeckt ist der EU-Launch-Scope; jedes andere Land bekommt keinen Beispielort.
import { postalCodeExample } from "./postalCode.mjs";

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

// Die PLZ des Platzhalters gehört zum Beispielort daneben (Audit B.9, Komplettabschluss 2026-10-27): bisher stand
// das Beispiel der Formatregeln neben dem Ort — „26133“ (Oldenburg) neben „Berlin“, „33380“ neben „Paris“. Je Land
// ein Paar aus demselben Ort, im Format des Landes (addressValidationUx 44 prüft beides). Reine Anzeige:
// Prüfung und Fehlermeldungen nutzen weiter die Formatregeln (postalCode.mjs). Ohne Eintrag deren Beispiel.
const BEISPIEL_PLZ = Object.freeze({
  AT: "1010", BE: "1000", BG: "1000", CY: "1010", CZ: "110 00", DE: "10115", DK: "1050", EE: "10111",
  ES: "28013", FI: "00100", FR: "75001", GR: "105 57", HR: "10000", HU: "1051", IE: "D02 X285", IT: "00184",
  LT: "01103", LU: "1111", LV: "LV-1050", MT: "VLT 1117", NL: "1012 AB", PL: "00-950", PT: "1100-148",
  RO: "030167", SE: "111 52", SI: "1000", SK: "811 01",
});

export function postalCodePlaceholder(country) {
  const land = String(country || "").trim().toUpperCase();
  return BEISPIEL_PLZ[land] || postalCodeExample(land);
}
