/* ── Lager & Aufträge — optionale Formularabschnitte des Artikels ────────────
   Herausgelöst aus inventoryView.mjs (Modularisierungs-Audit). Kleinstes
   Fachmodul mit genau einer Verantwortung: welche Felder zu welchem
   einklappbaren Abschnitt des Artikelformulars gehören. */

/* Welche Felder gehören zu welchem einklappbaren Abschnitt.
   Hier statt in der Komponente, weil es reine Zuordnung ist — und weil ein
   Test sie so ohne Browser prüfen kann. */
export const SECTION_FIELDS = Object.freeze({
  dimensions: ["lengthCm", "widthCm", "heightCm"],
  customs: ["unitValue", "hsCode", "countryOfOrigin", "customsDescription"],
});

/**
 * Trägt ein optionaler Abschnitt bereits Daten?
 *
 * Grundlage der Regel „vorhandene Angaben werden nie versteckt": ein Abschnitt
 * mit Inhalt startet beim Bearbeiten geöffnet. Geprüft werden die tatsächlichen
 * Formularwerte (Strings), nicht das Rohobjekt — dieselbe Aussage gilt damit
 * für Anlegen und Bearbeiten. Reiner Leerraum zählt nicht als Wert, eine
 * gesetzte 0 dagegen schon.
 */
export function sectionHasData(values, section) {
  const felder = SECTION_FIELDS[section] || [];
  return felder.some((k) => String(values?.[k] ?? "").trim() !== "");
}
