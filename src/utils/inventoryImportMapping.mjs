/* ── Artikelimport — Spalten erkennen und zuordnen ───────────────────────────
   Eindeutige Spaltennamen (deutsch und englisch) werden automatisch zugeordnet,
   mehrdeutige nur VORGESCHLAGEN und als „bitte prüfen“ markiert. „Verfügbar“ oder
   „available“ wird nie als Bestand vorgeschlagen: verfügbarer Bestand ist nicht der
   physische. Jedes Feld nimmt höchstens eine Spalte, jede Spalte höchstens ein Feld.

   Einheiten kommen aus dem Spaltennamen („Gewicht (g)“, „Länge in mm“). Fehlt die
   Angabe, ist die Wahl im Zuordnungsschritt Pflicht — die Werte werden nie zur
   Einheitenvermutung herangezogen. */

import { formatEvidence, isAmbiguousNumberText } from "./inventoryImportNumbers.mjs";

export const IMPORT_FIELDS = Object.freeze([
  { key: "sku", label: "Artikelnummer (SKU)", kind: "text", required: true },
  { key: "name", label: "Bezeichnung", kind: "text", requiredForNew: true },
  { key: "weightKg", label: "Gewicht", kind: "decimal", unit: "weight", requiredForNew: true },
  { key: "lengthCm", label: "Länge", kind: "decimal", unit: "length" },
  { key: "widthCm", label: "Breite", kind: "decimal", unit: "length" },
  { key: "heightCm", label: "Höhe", kind: "decimal", unit: "length" },
  { key: "ean", label: "EAN / GTIN", kind: "text" },
  { key: "description", label: "Beschreibung", kind: "text" },
  { key: "minStock", label: "Mindestbestand", kind: "integer" },
  { key: "unitValue", label: "Warenwert je Stück (EUR)", kind: "decimal" },
  { key: "stock", label: "Bestand (gezählt)", kind: "integer" },
]);

export const FIELD_BY_KEY = Object.freeze(Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, f])));

// Normalisierte Spaltennamen (klein, Umlaute ausgeschrieben, nur Buchstaben und Ziffern).
const SYNONYME = Object.freeze({
  sku: {
    sicher: ["artikelnummer", "artikelnr", "artnr", "artikelno", "sku", "itemnumber", "itemno", "articlenumber", "articleno",
      "productnumber", "productno", "produktnummer", "partnumber", "partno", "teilenummer", "materialnummer", "artikelcode", "productcode", "produktcode"],
    pruefen: ["nummer", "nr", "id", "code", "referenz", "reference", "artikel", "item"],
  },
  name: {
    sicher: ["bezeichnung", "artikelbezeichnung", "artikelname", "produktname", "produktbezeichnung", "productname", "itemname",
      "articlename", "name", "titel", "title", "kurzbezeichnung"],
    pruefen: ["produkt", "product", "kurztext"],
  },
  weightKg: {
    sicher: ["gewicht", "weight", "versandgewicht", "shippingweight", "artikelgewicht", "stueckgewicht", "unitweight", "itemweight"],
    pruefen: ["bruttogewicht", "nettogewicht", "grossweight", "netweight"],
  },
  lengthCm: { sicher: ["laenge", "length", "artikellaenge"], pruefen: ["l"] },
  widthCm: { sicher: ["breite", "width", "artikelbreite"], pruefen: ["b", "w"] },
  heightCm: { sicher: ["hoehe", "height", "artikelhoehe"], pruefen: ["h"] },
  ean: { sicher: ["ean", "gtin", "ean13", "gtin13", "eancode", "barcode"], pruefen: ["upc"] },
  description: {
    sicher: ["beschreibung", "artikelbeschreibung", "produktbeschreibung", "description", "productdescription"],
    pruefen: ["langtext", "text", "details"],
  },
  minStock: {
    sicher: ["mindestbestand", "minbestand", "minstock", "minimumstock", "meldebestand"],
    pruefen: ["sicherheitsbestand", "reorderpoint", "safetystock"],
  },
  unitValue: {
    sicher: ["warenwert", "warenwertjestueck", "stueckwert", "einzelwert", "unitvalue", "itemvalue"],
    pruefen: ["wert", "value", "preis", "price", "einkaufspreis", "verkaufspreis", "ek", "vk", "nettopreis"],
  },
  stock: {
    sicher: ["bestand", "lagerbestand", "istbestand", "physischerbestand", "stock", "onhand", "stockonhand", "inventory", "quantityonhand"],
    pruefen: ["menge", "anzahl", "quantity", "qty", "stk", "stueck", "stueckzahl"],
  },
});

// Ausdrücklich nie als Bestand vorschlagen (verfügbar ≠ physisch).
const NIE_BESTAND = Object.freeze(["verfuegbar", "verfuegbarerbestand", "available", "availablestock", "frei", "freierbestand"]);

function ausschreiben(s) {
  return s.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

// Einheitenhinweis aus dem Spaltennamen und der Name ohne ihn.
export function analyseHeader(header) {
  const roh = String(header ?? "").trim();
  const klein = ausschreiben(roh);
  let unit = null;
  const einheit = /(?:\(|\[|\bin\s+|\s|^)(kg|kilogramm|g|gr|gramm|mm|millimeter|cm|zentimeter|m|meter)(?:\)|\]|\s|$)/.exec(klein);
  if (einheit) {
    const e = einheit[1];
    unit = { kg: "kg", kilogramm: "kg", g: "g", gr: "g", gramm: "g", mm: "mm", millimeter: "mm", cm: "cm", zentimeter: "cm", m: "m", meter: "m" }[e];
  }
  const ohneEinheit = klein
    .replace(/\((?:[^)]*)\)|\[(?:[^\]]*)\]/g, " ")
    .replace(/\bin\s+(kg|g|gr|gramm|kilogramm|mm|cm|m|meter|millimeter|zentimeter)\b/g, " ");
  const key = ohneEinheit.replace(/[^a-z0-9]/g, "");
  return { label: roh, key, unit };
}

/**
 * Vorschlag für die Zuordnung.
 * @param {string[]} headers Kopfzeile der Datei
 * @returns {{ mapping: Record<string, number>, status: Record<string, "auto"|"check">, units: {weight: string|null, length: string|null} }}
 */
export function suggestMapping(headers) {
  const analysed = headers.map(analyseHeader);
  const kandidaten = [];
  analysed.forEach((h, col) => {
    if (!h.key) return;
    for (const field of IMPORT_FIELDS) {
      const s = SYNONYME[field.key];
      if (field.key === "stock" && NIE_BESTAND.includes(h.key)) continue;
      if (s.sicher.includes(h.key)) kandidaten.push({ field: field.key, col, staerke: 2 });
      else if (s.pruefen.includes(h.key)) kandidaten.push({ field: field.key, col, staerke: 1 });
    }
  });
  const mapping = {};
  const status = {};
  const belegt = new Set();
  for (const field of IMPORT_FIELDS) {
    const eigene = kandidaten.filter((k) => k.field === field.key && !belegt.has(k.col))
      .sort((a, b) => b.staerke - a.staerke || a.col - b.col);
    if (eigene.length === 0) continue;
    const best = eigene[0];
    mapping[field.key] = best.col;
    belegt.add(best.col);
    // Unsicher: nur ein Vorschlag, oder mehrere sichere Spalten konkurrieren.
    const konkurrenz = eigene.filter((k) => k.staerke === 2).length > 1;
    status[field.key] = best.staerke === 2 && !konkurrenz ? "auto" : "check";
  }
  return { mapping, status, units: unitsFor(headers, mapping) };
}

/** Einheiten aus den Spaltennamen der zugeordneten Felder (null = Wahl nötig). */
export function unitsFor(headers, mapping) {
  const unitOf = (key) => (mapping[key] !== undefined ? analyseHeader(headers[mapping[key]]).unit : null);
  const weight = unitOf("weightKg");
  const lengths = ["lengthCm", "widthCm", "heightCm"].filter((k) => mapping[k] !== undefined).map(unitOf);
  const lengthUnits = new Set(lengths.filter(Boolean));
  return {
    weight: weight === "kg" || weight === "g" ? weight : null,
    // Alle Maßspalten müssen dieselbe genannte Einheit tragen, sonst ist die Wahl nötig.
    length: lengths.length > 0 && lengthUnits.size === 1 && lengths.every(Boolean) && ["cm", "mm", "m"].includes([...lengthUnits][0])
      ? [...lengthUnits][0] : null,
  };
}

/** Fehlende Pflichtangaben der Zuordnung (für „Weiter“). */
export function mappingProblems(mapping, { stockMode, units }) {
  const problems = [];
  if (mapping.sku === undefined) problems.push("SKU_UNMAPPED");
  const cols = Object.values(mapping);
  if (new Set(cols).size !== cols.length) problems.push("COLUMN_TWICE");
  if (mapping.weightKg !== undefined && !units.weight) problems.push("WEIGHT_UNIT_MISSING");
  if (["lengthCm", "widthCm", "heightCm"].some((k) => mapping[k] !== undefined) && !units.length) problems.push("LENGTH_UNIT_MISSING");
  if (stockMode !== "none" && mapping.stock === undefined) problems.push("STOCK_UNMAPPED");
  return problems;
}

/**
 * Zahlformat einer Datei: Belege aus Textzellen der zugeordneten Zahlenspalten.
 * `ambiguous` nennt Beispielwerte, die nur das Format eindeutig macht; ohne Beleg in der
 * Datei muss der Kunde das Format dann ausdrücklich wählen.
 */
export function numberFormatEvidence(dataRows, mapping) {
  const numericCols = IMPORT_FIELDS.filter((f) => f.kind !== "text" && mapping[f.key] !== undefined).map((f) => mapping[f.key]);
  const seen = { de: 0, intl: 0 };
  const ambiguous = [];
  for (const row of dataRows) {
    for (const col of numericCols) {
      const v = row[col];
      if (typeof v !== "string") continue;
      const ev = formatEvidence(v);
      if (ev) seen[ev]++;
      else if (isAmbiguousNumberText(v) && ambiguous.length < 3 && !ambiguous.includes(v.trim())) ambiguous.push(v.trim());
    }
  }
  const suggested = seen.de > 0 && seen.intl === 0 ? "de" : seen.intl > 0 && seen.de === 0 ? "intl" : null;
  return { suggested, contradictory: seen.de > 0 && seen.intl > 0, ambiguous, needsChoice: ambiguous.length > 0 && suggested === null };
}
