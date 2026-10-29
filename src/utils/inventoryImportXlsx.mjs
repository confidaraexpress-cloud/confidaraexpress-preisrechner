/* ── Artikelimport — Excel (.xlsx) lesen ─────────────────────────────────────
   Die Zellwerte liest read-excel-file (Export „universal“: ohne Web Worker, ohne eval;
   im Browser und unter Node identisch). Diese Bibliothek wertet das <f>-Element nicht
   aus — ein gespeichertes Formelergebnis sähe aus wie ein fester Wert. Deshalb markiert
   ein schmaler Scan über dieselben geprüften Bibliotheken (fflate entpackt, saxen liest
   XML) jede Formelzelle; sie wird nie ausgewertet und nie als Wert übernommen.

   Schutz vor manipulierten Dateien (bevor etwas entpackt wird):
   · Dateigröße, angegebene entpackte Größe je Eintrag und gesamt (ZIP-Bombe)
   · keine DOCTYPE-/ENTITY-Deklaration in den gelesenen XML-Teilen
   · Zeilen- und Spaltengrenzen
   Unbekannte oder unvollständige Strukturen werden abgelehnt, nie halb gelesen.

   Die Bibliotheken werden dynamisch geladen (eigener Chunk) — wie maplibre-gl. */

import { ImportReadError } from "./inventoryImportCsv.mjs";

export const XLSX_LIMITS = Object.freeze({
  maxFileBytes: 15 * 1024 * 1024,
  maxEntryBytes: 80 * 1024 * 1024,
  maxUnpackedBytes: 150 * 1024 * 1024,
  maxRows: 10001,
  maxColumns: 100,
});

function localName(name) {
  const i = name.indexOf(":");
  return i >= 0 ? name.slice(i + 1) : name;
}

function guardXml(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new ImportReadError("XLSX_UNSAFE");
  return xml;
}

/** „AB12“ → { row: 12, col: 28 } (1-basiert); null bei unbekanntem Format. */
export function parseCellRef(ref) {
  const m = /^\$?([A-Z]{1,3})\$?([1-9][0-9]{0,6})$/.exec(String(ref || "").toUpperCase());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]), col };
}

function markRange(range, set, limits) {
  const [a, b] = String(range).split(":");
  const from = parseCellRef(a);
  const to = parseCellRef(b || a);
  if (!from || !to) return;
  const r2 = Math.min(Math.max(from.row, to.row), limits.maxRows + 1);
  const c2 = Math.min(Math.max(from.col, to.col), limits.maxColumns + 1);
  for (let r = Math.min(from.row, to.row); r <= r2; r++) {
    for (let c = Math.min(from.col, to.col); c <= c2; c++) set.add(`${r}:${c}`);
  }
}

function parseXml(Parser, xml, handlers) {
  const parser = new Parser();
  let failed = false;
  parser.on("error", () => { failed = true; });
  if (handlers.openTag) parser.on("openTag", handlers.openTag);
  if (handlers.closeTag) parser.on("closeTag", handlers.closeTag);
  parser.parse(xml);
  if (failed) throw new ImportReadError("XLSX_UNREADABLE");
}

// workbook.xml: Blattname → Beziehungs-ID; workbook.xml.rels: ID → Pfad des Blatts.
function sheetPaths(Parser, workbookXml, relsXml) {
  const sheets = [];
  parseXml(Parser, workbookXml, {
    openTag(name, attrs, decode) {
      if (localName(name) !== "sheet") return;
      const a = attrs();
      const rid = Object.keys(a).find((k) => localName(k) === "id" && k.includes(":"));
      if (a.name && rid) sheets.push({ name: decode(a.name), rid: a[rid] });
    },
  });
  const targets = new Map();
  parseXml(Parser, relsXml, {
    openTag(name, attrs) {
      if (localName(name) !== "Relationship") return;
      const a = attrs();
      if (!a.Id || !a.Target) return;
      const t = a.Target.startsWith("/") ? a.Target.slice(1) : `xl/${a.Target.replace(/^\.\//, "")}`;
      targets.set(a.Id, t);
    },
  });
  return new Map(sheets.map((s) => [s.name, targets.get(s.rid) || null]));
}

// Formelzellen eines Blatts als Menge „Zeile:Spalte“ (1-basiert, absolute Excel-Position).
// Geteilte, Matrix- und Datentabellenformeln markieren ihren ganzen Bereich.
function scanFormulas(Parser, xml, limits) {
  const formulas = new Set();
  let inSheetData = false;
  let row = 0;
  let col = 0;
  let cell = null;
  parseXml(Parser, xml, {
    openTag(name, attrs) {
      const local = localName(name);
      if (local === "sheetData") { inSheetData = true; return; }
      if (!inSheetData) return;
      if (local === "row") {
        const r = Number(attrs().r);
        row = Number.isInteger(r) && r > 0 ? r : row + 1;
        col = 0;
        return;
      }
      if (local === "c") {
        const pos = parseCellRef(attrs().r);
        if (pos) { row = pos.row; col = pos.col; } else col += 1;
        cell = `${row}:${col}`;
        return;
      }
      if (local === "f" && cell) {
        formulas.add(cell);
        const a = attrs();
        if (a.ref && (a.t === "shared" || a.t === "array" || a.t === "dataTable")) markRange(a.ref, formulas, limits);
      }
    },
    closeTag(name) {
      const local = localName(name);
      if (local === "c") cell = null;
      if (local === "sheetData") inSheetData = false;
    },
  });
  return formulas;
}

function toArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  throw new Error("ArrayBuffer erwartet");
}

/**
 * .xlsx → Blätter mit Zellwerten und Formelpositionen.
 * @returns {Promise<Array<{ name: string, rows: Array<Array<string|number|boolean|Date|null>>, formulas: Set<string> }>>}
 */
export async function readXlsx(input, limits = XLSX_LIMITS) {
  const buffer = toArrayBuffer(input);
  if (buffer.byteLength > limits.maxFileBytes) throw new ImportReadError("FILE_TOO_LARGE", { maxBytes: limits.maxFileBytes });
  const [{ unzipSync, strFromU8 }, { Parser }, { default: readXlsxFile }] = await Promise.all([
    import("fflate"), import("saxen"), import("read-excel-file/universal"),
  ]);
  const bytes = new Uint8Array(buffer);

  // 1) Angegebene Größen prüfen, ohne etwas zu entpacken (filter liefert false).
  const names = new Set();
  let total = 0;
  try {
    unzipSync(bytes, {
      filter(file) {
        names.add(file.name);
        total += file.originalSize;
        if (file.originalSize > limits.maxEntryBytes || total > limits.maxUnpackedBytes) {
          throw new ImportReadError("FILE_TOO_LARGE_UNPACKED");
        }
        return false;
      },
    });
  } catch (e) {
    if (e instanceof ImportReadError) throw e;
    throw new ImportReadError("XLSX_UNREADABLE");
  }
  if (!names.has("xl/workbook.xml") || !names.has("xl/_rels/workbook.xml.rels")) throw new ImportReadError("XLSX_UNREADABLE");

  // 2) Nur die Strukturteile entpacken und auf Formeln prüfen.
  let parts;
  try {
    parts = unzipSync(bytes, {
      filter: (f) => f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels" || /^xl\/worksheets\/[^/]+\.xml$/.test(f.name),
    });
  } catch {
    throw new ImportReadError("XLSX_UNREADABLE");
  }
  const text = (name) => (parts[name] ? strFromU8(parts[name]) : null);
  const paths = sheetPaths(Parser, guardXml(text("xl/workbook.xml")), guardXml(text("xl/_rels/workbook.xml.rels")));

  // 3) Zellwerte über read-excel-file.
  let sheets;
  try {
    sheets = await readXlsxFile(buffer);
  } catch {
    throw new ImportReadError("XLSX_UNREADABLE");
  }

  // Ein Blatt, das sich nicht sicher lesen lässt, ist nicht wählbar (`blocked`) — die
  // übrigen Blätter bleiben nutzbar. Ohne Blatt-XML ist keine Formelprüfung möglich.
  return sheets.map((s) => {
    const path = paths.get(s.sheet);
    const xml = path ? text(path) : null;
    const rows = Array.isArray(s.data) ? s.data : [];
    let blocked = null;
    if (xml === null) blocked = "XLSX_STRUCTURE_UNSUPPORTED";
    else if (rows.length > limits.maxRows) blocked = "TOO_MANY_ROWS";
    else if (rows.some((r) => Array.isArray(r) && r.length > limits.maxColumns)) blocked = "TOO_MANY_COLUMNS";
    return {
      name: s.sheet,
      rows: blocked ? [] : rows,
      formulas: blocked ? new Set() : scanFormulas(Parser, guardXml(xml), limits),
      blocked,
    };
  });
}
