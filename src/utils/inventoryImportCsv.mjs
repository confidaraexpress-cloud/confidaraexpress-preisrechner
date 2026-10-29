/* ── Artikelimport — CSV lesen ───────────────────────────────────────────────
   Zeichensatz: Byte-Order-Mark entscheidet (UTF-8, UTF-16 LE/BE). Ohne BOM wird STRENG
   als UTF-8 gelesen; scheitert das, ist es Windows-1252 (Excel „CSV (Trennzeichen-
   getrennt)“ unter deutschem Windows). Der erkannte Zeichensatz wird angezeigt.

   Trennzeichen: Semikolon, Komma oder Tabulator — das Zeichen, das in den ersten Zeilen
   außerhalb von Anführungszeichen gleichbleibend am häufigsten vorkommt. Ist das nicht
   eindeutig, entscheidet der Kunde (null).

   Felder nach RFC 4180: Anführungszeichen umschließen Trennzeichen und Zeilenumbrüche,
   "" ist ein Anführungszeichen. Grenzen schützen den Browser vor übergroßen Dateien. */

export const CSV_DELIMITERS = Object.freeze([";", ",", "\t"]);

export class ImportReadError extends Error {
  constructor(code, params = null) {
    super(code);
    this.name = "ImportReadError";
    this.code = code;
    this.params = params;
  }
}

/** Bytes → Text und erkannter Zeichensatz. */
export function decodeText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(u8.subarray(3)), encoding: "utf-8" };
  }
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(u8.subarray(2)), encoding: "utf-16le" };
  }
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(u8.subarray(2)), encoding: "utf-16be" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(u8), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(u8), encoding: "windows-1252" };
  }
}

// Zählt je Zeile die Kandidaten außerhalb von Anführungszeichen (nur die ersten Zeilen).
function zaehleKandidaten(text, maxZeilen = 20) {
  const zeilen = [];
  let aktuell = Object.fromEntries(CSV_DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  let hatInhalt = false;
  for (let i = 0; i < text.length && zeilen.length < maxZeilen; i++) {
    const ch = text[i];
    if (ch === '"') { inQuotes = !inQuotes; hatInhalt = true; continue; }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (hatInhalt) zeilen.push(aktuell);
      aktuell = Object.fromEntries(CSV_DELIMITERS.map((d) => [d, 0]));
      hatInhalt = false;
      continue;
    }
    if (!inQuotes && Object.prototype.hasOwnProperty.call(aktuell, ch)) aktuell[ch]++;
    if (ch.trim() !== "") hatInhalt = true;
  }
  if (hatInhalt && zeilen.length < maxZeilen) zeilen.push(aktuell);
  return zeilen;
}

/** Trennzeichen erkennen; null, wenn nicht eindeutig. Eine einzige Spalte ergibt ";". */
export function detectDelimiter(text) {
  const zeilen = zaehleKandidaten(text);
  if (zeilen.length === 0) return ";";
  const bewertet = CSV_DELIMITERS.map((d) => {
    const counts = zeilen.map((z) => z[d]);
    const kopf = counts[0];
    const gleich = counts.filter((c) => c === kopf).length;
    return { d, kopf, anteil: gleich / counts.length };
  }).filter((b) => b.kopf > 0 && b.anteil >= 0.8);
  if (bewertet.length === 0) return zeilen.every((z) => CSV_DELIMITERS.every((d) => z[d] === 0)) ? ";" : null;
  bewertet.sort((a, b) => b.anteil - a.anteil || b.kopf - a.kopf);
  if (bewertet.length > 1 && bewertet[0].anteil === bewertet[1].anteil && bewertet[0].kopf === bewertet[1].kopf) return null;
  return bewertet[0].d;
}

/**
 * CSV-Text → Zeilen (Listen von Texten). Leere Zeilen bleiben als [] erhalten, damit die
 * Zeilennummer der Datei stimmt.
 * @param {{ maxRows?: number, maxColumns?: number }} limits
 */
export function parseCsv(text, delimiter, { maxRows = 10001, maxColumns = 100 } = {}) {
  if (!CSV_DELIMITERS.includes(delimiter)) throw new Error("Unbekanntes Trennzeichen");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;
  const endField = () => {
    row.push(field);
    if (row.length > maxColumns) throw new ImportReadError("TOO_MANY_COLUMNS", { max: maxColumns });
    field = "";
    fieldStarted = false;
  };
  const endRow = () => {
    if (row.length === 1 && row[0] === "" ) row = [];
    rows.push(row);
    if (rows.length > maxRows) throw new ImportReadError("TOO_MANY_ROWS", { max: maxRows - 1 });
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && !fieldStarted && field === "") { inQuotes = true; fieldStarted = true; continue; }
    if (ch === delimiter) { endField(); continue; }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endField();
      endRow();
      continue;
    }
    field += ch;
    fieldStarted = true;
  }
  if (inQuotes) throw new ImportReadError("CSV_UNTERMINATED_QUOTE");
  if (field !== "" || row.length > 0) { endField(); endRow(); }
  // Abschließende Leerzeilen tragen keine Daten.
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}
