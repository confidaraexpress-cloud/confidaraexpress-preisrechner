/* ── Artikelimport — kanonisches Dokument, Vorlage, Fehlerliste ──────────────
   Baut aus der gelesenen Tabelle das Importdokument (version 1), das der Server prüft
   (backend lib/inventoryImport.js). Hier wird nur gelesen, umgerechnet und markiert —
   ob eine Zeile gültig ist, entscheidet ausschließlich der Server.

   Je Zelle eines zugeordneten Felds:
   · Formelzelle (xlsx) oder Textzelle mit führendem „=“ (csv) → Befund FORMULA, kein Wert
   · Datumszelle → DATE_VALUE, kein Wert
   · Zahl im Textfeld: ganzzahlig → Text; bei der Artikelnummer zusätzlich SKU_NUMERIC
   · Textzahl → streng nach Zahlformat, sonst NUMBER_INVALID; Gewicht in kg, Maße in cm
   · Steuerzeichen → TEXT_INVALID
   Leere Zellen fehlen im Dokument: eine leere Zelle ändert nie einen Wert. */

import { IMPORT_FIELDS } from "./inventoryImportMapping.mjs";
import { parseNumberText, toKg, toCm } from "./inventoryImportNumbers.mjs";

export const IMPORT_DOCUMENT_VERSION = 1;
export const MAX_IMPORT_ROWS = 10000;

// Steuerzeichen außer Tab und Zeilenumbruch.
// eslint-disable-next-line no-control-regex
const STEUERZEICHEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function zelleLeer(v) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function textWert(field, v, sourceType, issues) {
  if (typeof v === "string") {
    const s = v.trim();
    if (STEUERZEICHEN.test(s)) { issues.push({ field, code: "TEXT_INVALID" }); return undefined; }
    if (sourceType === "csv" && s.startsWith("=")) { issues.push({ field, code: "FORMULA" }); return undefined; }
    return s;
  }
  if (typeof v === "number" && Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER) {
    if (field === "sku") issues.push({ field, code: "SKU_NUMERIC" });
    return String(v);
  }
  issues.push({ field, code: "TEXT_INVALID" });
  return undefined;
}

function zahlWert(field, v, numberFormat, issues) {
  let n;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const r = parseNumberText(v, numberFormat);
    if (!r.ok) { issues.push({ field, code: r.code }); return undefined; }
    n = r.value;
  } else { issues.push({ field, code: "NUMBER_INVALID" }); return undefined; }
  if (n === null || !Number.isFinite(n)) return undefined;
  return n;
}

/**
 * @param {object} p
 * @param {Array<Array<any>>} p.rows       gelesene Tabelle (Zeile 1 der Datei = Index 0)
 * @param {number} p.headerIndex           Index der Kopfzeile
 * @param {Record<string, number>} p.mapping Feld → Spaltenindex
 * @param {Record<string, string>} p.labels  Feld → Spaltenname (Anzeige)
 * @param {{weight: string|null, length: string|null}} p.units
 * @param {"de"|"intl"} p.numberFormat
 * @param {Set<string>} [p.formulas]       Formelpositionen „Zeile:Spalte“ (1-basiert)
 * @param {{type: "csv"|"xlsx", name: string|null, sheet: string|null}} p.source
 * @param {{stockMode: string, updateExisting: boolean, warehouseId: string|null}} p.options
 */
export function buildImportDocument({ rows, headerIndex, mapping, labels, units, numberFormat, formulas = new Set(), source, options }) {
  const felder = IMPORT_FIELDS.filter((f) => mapping[f.key] !== undefined && (f.key !== "stock" || options.stockMode !== "none"));
  const out = [];
  let emptyRows = 0;
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const fileRow = i + 1;
    if (felder.every((f) => zelleLeer(row[mapping[f.key]]))) { emptyRows++; continue; }
    const values = {};
    const issues = [];
    for (const f of felder) {
      const col = mapping[f.key];
      const v = row[col];
      if (formulas.has(`${fileRow}:${col + 1}`)) { issues.push({ field: f.key, code: "FORMULA" }); continue; }
      if (zelleLeer(v)) continue;
      if (v instanceof Date) { issues.push({ field: f.key, code: "DATE_VALUE" }); continue; }
      if (typeof v === "boolean") { issues.push({ field: f.key, code: f.kind === "text" ? "TEXT_INVALID" : "NUMBER_INVALID" }); continue; }
      if (f.kind === "text") {
        const t = textWert(f.key, v, source.type, issues);
        if (t !== undefined && t !== "") values[f.key] = t;
        continue;
      }
      let n = zahlWert(f.key, v, numberFormat, issues);
      if (n === undefined) continue;
      if (f.unit === "weight") n = toKg(n, units.weight);
      if (f.unit === "length") n = toCm(n, units.length);
      values[f.key] = n;
    }
    out.push(issues.length ? { row: fileRow, values, issues: issues.slice(0, 20) } : { row: fileRow, values });
  }
  if (out.length > MAX_IMPORT_ROWS) {
    const e = new Error("TOO_MANY_ROWS");
    e.code = "TOO_MANY_ROWS";
    e.params = { max: MAX_IMPORT_ROWS };
    throw e;
  }
  const columns = {};
  for (const f of felder) if (labels && typeof labels[f.key] === "string" && labels[f.key].trim()) columns[f.key] = labels[f.key].trim().slice(0, 120);
  return {
    document: {
      version: IMPORT_DOCUMENT_VERSION,
      source: { type: source.type, name: source.name || null, sheet: source.sheet || null },
      options: { stockMode: options.stockMode, updateExisting: options.updateExisting === true, warehouseId: options.stockMode === "none" ? null : (options.warehouseId || null) },
      columns,
      rows: out,
    },
    dataRows: out.length,
    emptyRows,
  };
}

// ── CSV-Ausgabe (Vorlage, Fehlerliste) ──────────────────────────────────────
// Semikolon und UTF-8 mit BOM öffnet Excel unter deutschem Windows korrekt. Jede Zelle,
// die mit = + - @ oder einem Steuerzeichen beginnt, bekommt ein vorangestelltes
// Apostroph — beim späteren Öffnen wird nie eine Tabellenformel ausgeführt.
export function csvCell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(lines) {
  return "﻿" + lines.map((cells) => cells.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export const TEMPLATE_HEADERS = Object.freeze([
  "Artikelnummer", "Bezeichnung", "Gewicht (kg)", "Länge (cm)", "Breite (cm)", "Höhe (cm)",
  "EAN", "Beschreibung", "Mindestbestand", "Warenwert (EUR)", "Bestand",
]);

export function templateCsv() {
  return toCsv([
    TEMPLATE_HEADERS,
    ["A-1001", "Schraube M6 Edelstahl, 100 Stück", "0,25", "12", "8", "4", "4006381333931", "", "10", "4,90", "250"],
  ]);
}
