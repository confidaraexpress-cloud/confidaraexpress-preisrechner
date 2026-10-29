// Artikelimport im Browser — Lesen, Zuordnen, Umrechnen, Dokument, CSV-Ausgabe.
// Die XLSX-Testdateien entstehen hier mit fflate (zipSync) in den Strukturen, die Excel,
// LibreOffice, Google Sheets und Numbers schreiben (gemeinsame Texte, Inline-Texte,
// Zeilen ohne Positionsangabe, Formeln mit Ergebnis, geteilte Formeln, Datumsformat).
import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { parseNumberText, isAmbiguousNumberText, formatEvidence, toKg, toCm } from "./inventoryImportNumbers.mjs";
import { decodeText, detectDelimiter, parseCsv, ImportReadError } from "./inventoryImportCsv.mjs";
import { suggestMapping, analyseHeader, unitsFor, mappingProblems, numberFormatEvidence } from "./inventoryImportMapping.mjs";
import { readXlsx, parseCellRef, XLSX_LIMITS } from "./inventoryImportXlsx.mjs";
import { buildImportDocument, csvCell, toCsv, templateCsv, MAX_IMPORT_ROWS } from "./inventoryImportDocument.mjs";
import { issueText, stockText, changeText, readErrorText } from "./inventoryImportText.mjs";

// ── Zahlen und Einheiten ────────────────────────────────────────────────────
test("Zahlen werden streng nach Format gelesen", () => {
  assert.deepEqual(parseNumberText("1.234,5", "de"), { ok: true, value: 1234.5 });
  assert.deepEqual(parseNumberText("0,25", "de"), { ok: true, value: 0.25 });
  assert.deepEqual(parseNumberText("1,234.5", "intl"), { ok: true, value: 1234.5 });
  assert.deepEqual(parseNumberText("0.25", "intl"), { ok: true, value: 0.25 });
  assert.deepEqual(parseNumberText("  ", "de"), { ok: true, value: null });
  for (const bad of ["0.25", "1.2.3", "12,5,5", "1e3", "abc", "1.23"]) {
    assert.equal(parseNumberText(bad, "de").ok, false, `de: ${bad}`);
  }
  for (const bad of ["0,25", "1,2", "1e3", "1.2.3"]) assert.equal(parseNumberText(bad, "intl").ok, false, `intl: ${bad}`);
});

test("Mehrdeutigkeit und Formatbeleg", () => {
  assert.equal(isAmbiguousNumberText("1.234"), true);
  assert.equal(isAmbiguousNumberText("1,500"), true);
  assert.equal(isAmbiguousNumberText("0,5"), false);
  assert.equal(isAmbiguousNumberText("1234"), false);
  assert.equal(formatEvidence("0,5"), "de");
  assert.equal(formatEvidence("2.25"), "intl");
  assert.equal(formatEvidence("1.234.567"), "de");
  assert.equal(formatEvidence("1.234"), null);
});

test("Einheiten: Gramm → kg, Millimeter und Meter → cm, ohne Gleitkommarauschen", () => {
  assert.equal(toKg(250, "g"), 0.25);
  assert.equal(toKg(1.5, "kg"), 1.5);
  assert.equal(toCm(333, "mm"), 33.3);
  assert.equal(toCm(0.123, "m"), 12.3);
  assert.throws(() => toKg(1, "lb"));
});

// ── CSV ─────────────────────────────────────────────────────────────────────
test("Zeichensatz: BOM, strenges UTF-8, sonst Windows-1252", () => {
  assert.deepEqual(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0xc3, 0xa4])), { text: "Aä", encoding: "utf-8" });
  assert.deepEqual(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xe4, 0x00])), { text: "Aä", encoding: "utf-16le" });
  assert.deepEqual(decodeText(new Uint8Array([0x41, 0xc3, 0xa4])), { text: "Aä", encoding: "utf-8" });
  assert.deepEqual(decodeText(new Uint8Array([0x48, 0xf6, 0x68, 0x65])), { text: "Höhe", encoding: "windows-1252" });
  assert.deepEqual(decodeText(new Uint8Array([0x80])), { text: "€", encoding: "windows-1252" });
});

test("Trennzeichen: Semikolon, Komma, Tabulator; unklar → null", () => {
  assert.equal(detectDelimiter("a;b;c\n1;2;3\n"), ";");
  assert.equal(detectDelimiter('a,b,c\n"1,5",2,3\n'), ",");
  assert.equal(detectDelimiter("a\tb\n1\t2\n"), "\t");
  assert.equal(detectDelimiter("nur eine spalte\nwert\n"), ";");
  assert.equal(detectDelimiter("a;b,c\n1,2;3\n"), null);
});

test("CSV nach RFC 4180: Anführungszeichen, Umbrüche in Feldern, leere Zeilen behalten die Zeilennummer", () => {
  const rows = parseCsv('SKU;Name\r\n"A-1";"Schraube; ""M6"""\r\n\r\nB-2;"zwei\nZeilen"\r\n', ";");
  assert.deepEqual(rows, [["SKU", "Name"], ["A-1", 'Schraube; "M6"'], [], ["B-2", "zwei\nZeilen"]]);
});

test("CSV-Grenzen und offenes Anführungszeichen", () => {
  assert.throws(() => parseCsv('a;"b\n1;2', ";"), (e) => e instanceof ImportReadError && e.code === "CSV_UNTERMINATED_QUOTE");
  assert.throws(() => parseCsv("a\n1\n2\n3\n", ";", { maxRows: 3 }), (e) => e.code === "TOO_MANY_ROWS");
  assert.throws(() => parseCsv("a;b;c\n", ";", { maxColumns: 2 }), (e) => e.code === "TOO_MANY_COLUMNS");
});

// ── Zuordnung ───────────────────────────────────────────────────────────────
test("deutsche und englische Spaltennamen werden zugeordnet, Einheiten aus dem Namen erkannt", () => {
  const de = suggestMapping(["Art.-Nr.", "Bezeichnung", "Gewicht (g)", "Länge in mm", "Breite (mm)", "Höhe (mm)", "EAN-Code", "Lagerbestand"]);
  assert.deepEqual(de.mapping, { sku: 0, name: 1, weightKg: 2, lengthCm: 3, widthCm: 4, heightCm: 5, ean: 6, stock: 7 });
  assert.ok(Object.values(de.status).every((s) => s === "auto"));
  assert.deepEqual(de.units, { weight: "g", length: "mm" });
  const en = suggestMapping(["Item No.", "Product name", "Weight", "Stock on hand", "Unit value"]);
  assert.deepEqual(en.mapping, { sku: 0, name: 1, weightKg: 2, unitValue: 4, stock: 3 });
  assert.deepEqual(en.units, { weight: null, length: null });
});

test("mehrdeutige Namen sind nur Vorschläge; „Verfügbar“ wird nie Bestand", () => {
  const s = suggestMapping(["Nr", "Name", "Menge", "Verfügbar", "Gewicht", "Versandgewicht"]);
  assert.equal(s.mapping.sku, 0);
  assert.equal(s.status.sku, "check");
  assert.equal(s.mapping.stock, 2);
  assert.equal(s.status.stock, "check");
  assert.ok(!Object.values(s.mapping).includes(3), "Verfügbar darf nicht zugeordnet werden");
  assert.equal(s.mapping.weightKg, 4);
  assert.equal(s.status.weightKg, "check", "zwei sichere Gewichtsspalten konkurrieren");
});

test("Spaltennamen-Analyse und Einheitenpflicht", () => {
  assert.deepEqual(analyseHeader("Gewicht [kg]"), { label: "Gewicht [kg]", key: "gewicht", unit: "kg" });
  assert.equal(analyseHeader("Größe M").key, "groessem");
  assert.deepEqual(unitsFor(["L (cm)", "B (mm)", "H"], { lengthCm: 0, widthCm: 1, heightCm: 2 }), { weight: null, length: null });
  assert.deepEqual(mappingProblems({ name: 0 }, { stockMode: "counted", units: { weight: null, length: null } }), ["SKU_UNMAPPED", "STOCK_UNMAPPED"]);
  assert.deepEqual(mappingProblems({ sku: 0, weightKg: 1 }, { stockMode: "none", units: { weight: null, length: null } }), ["WEIGHT_UNIT_MISSING"]);
  assert.deepEqual(mappingProblems({ sku: 0, name: 0 }, { stockMode: "none", units: { weight: null, length: null } }), ["COLUMN_TWICE"]);
});

test("Zahlformat-Beleg: eindeutige Werte schlagen vor, nur mehrdeutige verlangen die Wahl", () => {
  const map = { sku: 0, weightKg: 1, stock: 2 };
  // „1.200“ bleibt als Beispiel sichtbar, die Datei belegt das Format aber selbst („0,5“) → keine Pflichtwahl.
  assert.deepEqual(numberFormatEvidence([["A", "0,5", "1.200"]], map), { suggested: "de", contradictory: false, ambiguous: ["1.200"], needsChoice: false });
  const amb = numberFormatEvidence([["A", "1.234", "12"], ["B", "2.500", "3"]], map);
  assert.equal(amb.needsChoice, true);
  assert.deepEqual(amb.ambiguous, ["1.234", "2.500"]);
  assert.equal(numberFormatEvidence([["A", "0,5", "1"], ["B", "0.5", "1"]], map).contradictory, true);
});

// ── XLSX ────────────────────────────────────────────────────────────────────
const CT = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>';
const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
const STYLES = '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>';

function xlsx({ sheets, shared = null, absoluteTarget = false, extra = {} }) {
  const wb = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${absoluteTarget ? "/xl/" : ""}worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${shared ? '<Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' : ""}</Relationships>`;
  const files = {
    "[Content_Types].xml": strToU8(CT), "_rels/.rels": strToU8(ROOT_RELS), "xl/workbook.xml": strToU8(wb),
    "xl/_rels/workbook.xml.rels": strToU8(rels), "xl/styles.xml": strToU8(STYLES), ...extra,
  };
  if (shared) files["xl/sharedStrings.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>`);
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${s.xml}</worksheet>`); });
  const z = zipSync(files);
  return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength);
}

test("Excel-Struktur: gemeinsame Texte, Formeln mit Ergebnis, geteilte Formel, Datumszelle", async () => {
  const buf = xlsx({
    shared: ["Artikelnummer", "Bezeichnung", "Gewicht (kg)", "Bestand", "A-1", "Schraube"],
    sheets: [{
      name: "Artikel",
      xml: '<dimension ref="A1:D4"/><sheetData>'
        + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>'
        + '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2"><f>0.25*2</f><v>0.5</v></c><c r="D2"><v>12</v></c></row>'
        + '<row r="3"><c r="A3"><v>4711</v></c><c r="B3" t="str"><f>"X"&amp;"Y"</f><v>XY</v></c><c r="C3"><v>1.5</v></c><c r="D3"><f t="shared" ref="D3:D4" si="0">D2+1</f><v>13</v></c></row>'
        + '<row r="4"><c r="A4" t="inlineStr"><is><t>00123</t></is></c><c r="B4" t="inlineStr"><is><t>Mutter</t></is></c><c r="C4" s="1"><v>45000</v></c><c r="D4"><f t="shared" si="0"/><v>14</v></c></row>'
        + "</sheetData>",
    }],
  });
  const [sheet] = await readXlsx(buf);
  assert.equal(sheet.name, "Artikel");
  assert.equal(sheet.blocked, null);
  assert.deepEqual(sheet.rows[1], ["A-1", "Schraube", 0.5, 12]);
  assert.ok(sheet.rows[3][2] instanceof Date, "Datumsformat wird als Datum gelesen");
  assert.deepEqual([...sheet.formulas].sort(), ["2:3", "3:2", "3:4", "4:4"]);

  const { document } = buildImportDocument({
    rows: sheet.rows, headerIndex: 0, mapping: { sku: 0, name: 1, weightKg: 2, stock: 3 },
    labels: { sku: "Artikelnummer", weightKg: "Gewicht (kg)" }, units: { weight: "kg", length: null }, numberFormat: "de",
    formulas: sheet.formulas, source: { type: "xlsx", name: "a.xlsx", sheet: "Artikel" },
    options: { stockMode: "counted", updateExisting: true, warehouseId: "7" },
  });
  assert.deepEqual(document.rows[0], { row: 2, values: { sku: "A-1", name: "Schraube", stock: 12 }, issues: [{ field: "weightKg", code: "FORMULA" }] });
  assert.deepEqual(document.rows[1], { row: 3, values: { sku: "4711", weightKg: 1.5 }, issues: [{ field: "sku", code: "SKU_NUMERIC" }, { field: "name", code: "FORMULA" }, { field: "stock", code: "FORMULA" }] });
  assert.deepEqual(document.rows[2], { row: 4, values: { sku: "00123", name: "Mutter" }, issues: [{ field: "weightKg", code: "DATE_VALUE" }, { field: "stock", code: "FORMULA" }] });
});

test("LibreOffice-/Google-Sheets-Struktur: Formel mit Attributen, absolutes Ziel, Entität im Blattnamen, mehrere Blätter", async () => {
  const buf = xlsx({
    absoluteTarget: true,
    sheets: [
      { name: "Hinweise", xml: '<sheetData><row r="1" spans="1:1"><c r="A1" t="inlineStr"><is><t>Bitte nicht ändern</t></is></c></row></sheetData>' },
      { name: "Daten &amp; Bestand", xml: '<sheetData><row r="1" spans="1:2"><c r="A1" t="inlineStr"><is><t>SKU</t></is></c><c r="B1" t="inlineStr"><is><t>Stock</t></is></c></row><row r="2" spans="1:2"><c r="A2" t="inlineStr"><is><t>B-7</t></is></c><c r="B2" s="0" t="n"><f aca="false">3+4</f><v>7</v></c></row></sheetData>' },
    ],
  });
  const sheets = await readXlsx(buf);
  assert.deepEqual(sheets.map((s) => s.name), ["Hinweise", "Daten & Bestand"]);
  assert.deepEqual(sheets[1].rows, [["SKU", "Stock"], ["B-7", 7]]);
  assert.deepEqual([...sheets[1].formulas], ["2:2"]);
});

test("Numbers-ähnliche Struktur mit Präfix-Namensraum wird ebenfalls auf Formeln geprüft", async () => {
  const sheet = '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>SKU</t></is></c><c r="B1" t="inlineStr"><is><t>Bestand</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>N-1</t></is></c><c r="B2"><x:f xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">1+1</x:f><v>2</v></c></row></sheetData>';
  const [s] = await readXlsx(xlsx({ sheets: [{ name: "Tabelle 1", xml: sheet }] }));
  assert.ok(s.formulas.has("2:2"));
});

test("manipulierte Dateien: DOCTYPE, keine Arbeitsmappe, keine ZIP-Datei, angegebene Größe zu groß", async () => {
  const doctype = xlsx({ sheets: [{ name: "A", xml: "<sheetData/>" }], extra: {} });
  const withDoctype = zipSync({
    "[Content_Types].xml": strToU8(CT), "_rels/.rels": strToU8(ROOT_RELS),
    "xl/workbook.xml": strToU8('<?xml version="1.0"?><!DOCTYPE lol [<!ENTITY lol "lol">]><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="r"><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'),
  });
  await assert.rejects(readXlsx(withDoctype), (e) => e.code === "XLSX_UNSAFE");
  const noWorkbook = zipSync({ "a.txt": strToU8("x") });
  await assert.rejects(readXlsx(noWorkbook), (e) => e.code === "XLSX_UNREADABLE");
  await assert.rejects(readXlsx(new TextEncoder().encode("SKU;Name\nA;B").buffer), (e) => e.code === "XLSX_UNREADABLE");
  await assert.rejects(readXlsx(doctype, { ...XLSX_LIMITS, maxUnpackedBytes: 100 }), (e) => e.code === "FILE_TOO_LARGE_UNPACKED");
  await assert.rejects(readXlsx(doctype, { ...XLSX_LIMITS, maxFileBytes: 10 }), (e) => e.code === "FILE_TOO_LARGE");
});

test("Zelladressen", () => {
  assert.deepEqual(parseCellRef("A1"), { row: 1, col: 1 });
  assert.deepEqual(parseCellRef("AB12"), { row: 12, col: 28 });
  assert.deepEqual(parseCellRef("$C$7"), { row: 7, col: 3 });
  assert.equal(parseCellRef("1A"), null);
});

// ── Dokument ────────────────────────────────────────────────────────────────
test("CSV-Dokument: Einheiten, Zahlformat, Formeltext, Steuerzeichen, leere Zeilen, Zeilennummern der Datei", () => {
  const rows = parseCsv("Art.-Nr.;Bezeichnung;Gewicht (g);Länge (mm);Bestand\nA-1;Schraube;250;1.234,5;10\n\nA-2;=HYPERLINK(\"x\");1,5;12;3\nA-3;Te\u0007xt;abc;;0\n;;;;\n", ";");
  const { document, dataRows, emptyRows } = buildImportDocument({
    rows, headerIndex: 0, mapping: { sku: 0, name: 1, weightKg: 2, lengthCm: 3, stock: 4 }, labels: {},
    units: { weight: "g", length: "mm" }, numberFormat: "de", source: { type: "csv", name: "a.csv", sheet: null },
    options: { stockMode: "counted", updateExisting: true, warehouseId: null },
  });
  assert.equal(dataRows, 3);
  assert.equal(emptyRows, 2);
  assert.deepEqual(document.rows[0], { row: 2, values: { sku: "A-1", name: "Schraube", weightKg: 0.25, lengthCm: 123.45, stock: 10 } });
  assert.deepEqual(document.rows[1], { row: 4, values: { sku: "A-2", weightKg: 0.0015, lengthCm: 1.2, stock: 3 }, issues: [{ field: "name", code: "FORMULA" }] });
  assert.deepEqual(document.rows[2], { row: 5, values: { sku: "A-3", stock: 0 }, issues: [{ field: "name", code: "TEXT_INVALID" }, { field: "weightKg", code: "NUMBER_INVALID" }] });
});

test("Modus „Bestand nicht ändern“ sendet keine Bestandswerte; über 10.000 Datenzeilen wird abgelehnt", () => {
  const rows = [["SKU", "Bestand"], ["A", "5"]];
  const { document } = buildImportDocument({
    rows, headerIndex: 0, mapping: { sku: 0, stock: 1 }, labels: {}, units: { weight: null, length: null }, numberFormat: "de",
    source: { type: "csv", name: null, sheet: null }, options: { stockMode: "none", updateExisting: false, warehouseId: "9" },
  });
  assert.deepEqual(document.rows, [{ row: 2, values: { sku: "A" } }]);
  assert.deepEqual(document.options, { stockMode: "none", updateExisting: false, warehouseId: null });
  const viele = [["SKU"], ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [`S${i}`])];
  assert.throws(() => buildImportDocument({
    rows: viele, headerIndex: 0, mapping: { sku: 0 }, labels: {}, units: { weight: null, length: null }, numberFormat: "de",
    source: { type: "csv", name: null, sheet: null }, options: { stockMode: "none", updateExisting: true, warehouseId: null },
  }), (e) => e.code === "TOO_MANY_ROWS");
});

// ── CSV-Ausgabe ─────────────────────────────────────────────────────────────
test("Fehlerliste und Vorlage sind gegen Formel-Injektion geschützt", () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), "\"'=HYPERLINK(\"\"http://x\"\")\"");
  for (const s of ["+1", "-2", "@SUM(A1)", "\tx"]) assert.ok(csvCell(s).startsWith("\"'"), s);
  assert.equal(csvCell("A-1"), '"A-1"');
  const csv = toCsv([["Zeile", "Hinweis"], [2, "=1+1"]]);
  assert.ok(csv.startsWith("﻿"));
  assert.equal(csv, "﻿\"Zeile\";\"Hinweis\"\r\n\"2\";\"'=1+1\"\r\n");
  const vorlage = templateCsv();
  assert.ok(vorlage.startsWith("﻿\"Artikelnummer\";\"Bezeichnung\";\"Gewicht (kg)\""));
  const zurueck = parseCsv(decodeText(new TextEncoder().encode(vorlage)).text, ";");
  assert.equal(zurueck[1][0], "A-1001");
});

// ── Texte ───────────────────────────────────────────────────────────────────
test("Kundentexte nennen Spalte und Grund, nie einen Rohcode", () => {
  const cols = { weightKg: "Gewicht (g)" };
  assert.equal(issueText({ field: "weightKg", code: "ROW_FIELD_INVALID" }, cols), "Gewicht (g): bitte zwischen 0,1 und 1.000 kg angeben.");
  assert.equal(issueText({ field: "sku", code: "ROW_SKU_DUPLICATE", params: { rows: [9, 12] } }, {}), "Die Artikelnummer steht mehrfach in der Datei (auch Zeilen 9, 12).");
  assert.equal(issueText({ field: "sku", code: "ROW_SKU_DUPLICATE", params: { rows: [312] } }, {}), "Die Artikelnummer steht mehrfach in der Datei (auch Zeile 312).");
  assert.equal(issueText({ field: "ean", code: "ROW_EAN_DUPLICATE", params: { rows: [4, 7] } }, {}), "Dieselbe EAN steht auch in Zeilen 4, 7.");
  assert.equal(issueText({ code: "ROW_STOCK_RESERVED", params: { reserved: 6, blocked: 2 } }), "Der Bestand kann nicht unter die reservierte und gesperrte Menge sinken (reserviert 6, gesperrt 2).");
  assert.equal(issueText({ code: "UNBEKANNT" }), "Die Zeile konnte nicht übernommen werden.");
  assert.equal(stockText({ value: 28, onHandBefore: 30, delta: -2 }, "counted"), "Bestand 30 → 28 (−2)");
  assert.equal(stockText({ value: 10, onHandBefore: 1200, delta: 10 }, "receipt"), "Wareneingang +10 (Bestand 1.200 → 1.210)");
  assert.equal(changeText({ field: "weightKg", before: 0.5, after: 0.6 }), "Gewicht: 0,5 kg → 0,6 kg");
  assert.equal(readErrorText("TOO_MANY_ROWS", { max: 10000 }), "Die Datei hat mehr als 10.000 Datenzeilen. Bitte teilen Sie sie auf.");
});

// ── Große Dateien ───────────────────────────────────────────────────────────
for (const n of [5000, 10000]) {
  test(`${n} Zeilen: CSV und XLSX werden in vertretbarer Zeit gelesen und vollständig übertragen`, async () => {
    const zeilen = ["Artikelnummer;Bezeichnung;Gewicht (kg);Länge (cm);Breite (cm);Höhe (cm);EAN;Bestand"];
    for (let i = 0; i < n; i++) zeilen.push(`L-${String(i).padStart(5, "0")};Lasttest ${i} – Schraubensortiment;${(0.1 + (i % 40) / 10).toFixed(1).replace(".", ",")};30;20,5;10;${4000000000000 + i};${i % 500}`);
    const csvBytes = new TextEncoder().encode(zeilen.join("\r\n"));
    const t0 = performance.now();
    const { text } = decodeText(csvBytes);
    const rows = parseCsv(text, detectDelimiter(text));
    const { mapping } = suggestMapping(rows[0]);
    const { document } = buildImportDocument({
      rows, headerIndex: 0, mapping, labels: {}, units: { weight: "kg", length: "cm" }, numberFormat: "de",
      source: { type: "csv", name: "last.csv", sheet: null }, options: { stockMode: "counted", updateExisting: true, warehouseId: null },
    });
    const tCsv = performance.now() - t0;
    assert.equal(document.rows.length, n);
    assert.ok(document.rows.every((r) => !r.issues));
    const bytes = new TextEncoder().encode(JSON.stringify(document)).length;
    assert.ok(bytes < 10 * 1024 * 1024, `Dokument ${bytes} B sprengt das Serverlimit`);

    const sheetRows = [["Artikelnummer", "Bezeichnung", "Gewicht (kg)", "Bestand"], ...Array.from({ length: n }, (_, i) => [`X-${i}`, `Artikel ${i}`, 0.5, i % 9])];
    const xml = "<sheetData>" + sheetRows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => typeof v === "number" ? `<c r="${String.fromCharCode(65 + j)}${i + 1}"><v>${v}</v></c>` : `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${v}</t></is></c>`).join("")}</row>`).join("") + "</sheetData>";
    const t1 = performance.now();
    const [sheet] = await readXlsx(xlsx({ sheets: [{ name: "Artikel", xml }] }));
    const tXlsx = performance.now() - t1;
    assert.equal(sheet.rows.length, n + 1);
    assert.equal(sheet.formulas.size, 0);
    console.log(`  Messung ${n}: CSV lesen+Dokument ${Math.round(tCsv)} ms (${Math.round(bytes / 1024)} KiB), XLSX lesen ${Math.round(tXlsx)} ms`);
    assert.ok(tCsv < 15000 && tXlsx < 30000);
  });
}
