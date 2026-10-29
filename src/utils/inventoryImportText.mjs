/* ── Artikelimport — Kundentexte ─────────────────────────────────────────────
   EINE Stelle für alle Texte des Imports: Zeilenbefunde des Servers und des Browsers,
   Konfliktgründe der Übernahme, Vorher/Nachher-Darstellung, Lesefehler der Datei.
   Ein Rohcode erscheint nie im sichtbaren Text. Feldgrenzen entsprechen denen des
   Artikelformulars (ProductForm) und des Servers (validateProductInput). */

import { formatUnits } from "./inventoryFormat.mjs";

export const FIELD_LABELS = Object.freeze({
  sku: "Artikelnummer",
  name: "Bezeichnung",
  weightKg: "Gewicht",
  lengthCm: "Länge",
  widthCm: "Breite",
  heightCm: "Höhe",
  ean: "EAN",
  description: "Beschreibung",
  minStock: "Mindestbestand",
  unitValue: "Warenwert",
  stock: "Bestand",
});

const GRENZEN = Object.freeze({
  sku: "höchstens 64 Zeichen.",
  name: "höchstens 255 Zeichen.",
  weightKg: "bitte zwischen 0,1 und 1.000 kg angeben.",
  lengthCm: "bitte zwischen 0,1 und 300 cm angeben.",
  widthCm: "bitte zwischen 0,1 und 300 cm angeben.",
  heightCm: "bitte zwischen 0,1 und 300 cm angeben.",
  ean: "höchstens 20 Zeichen.",
  description: "höchstens 5.000 Zeichen.",
  minStock: "ganze Zahl von 0 bis 1.000.000.",
  unitValue: "Betrag ab 0 in Euro.",
  stock: "ganze Zahl von 0 bis 1.000.000.",
});

const zahl = (n) => (typeof n === "number" && Number.isFinite(n) ? n : null);
const zeilenListe = (rows) => (Array.isArray(rows) && rows.length ? rows.slice(0, 10).map((n) => formatUnits(n)).join(", ") : null);

/** Spaltenname aus der Datei, sonst die Feldbezeichnung. */
export function columnLabel(field, columns) {
  if (!field) return null;
  const aus = columns && typeof columns[field] === "string" && columns[field].trim() ? columns[field].trim() : null;
  return aus || FIELD_LABELS[field] || field;
}

/** Ein Befund (Server oder Browser) als Satz. */
export function issueText(issue, columns) {
  const i = issue || {};
  const spalte = columnLabel(i.field, columns);
  const p = i.params || {};
  switch (i.code) {
    case "ROW_SKU_MISSING": return "Die Artikelnummer fehlt.";
    case "ROW_SKU_DUPLICATE": {
      const andere = zeilenListe(p.rows);
      return andere ? `Die Artikelnummer steht mehrfach in der Datei (auch Zeile ${andere}).` : "Die Artikelnummer steht mehrfach in der Datei.";
    }
    case "ROW_FIELD_INVALID":
      if (!i.field) return "Die Zeile enthält ungültige Angaben.";
      return `${spalte}: ${GRENZEN[i.field] || "ungültiger Wert."}`;
    case "ROW_FIELD_REQUIRED": return `${spalte}: für neue Artikel Pflicht.`;
    case "ROW_PRODUCT_INACTIVE": return "Der Artikel ist deaktiviert. Bitte aktivieren Sie ihn zuerst in der Artikelverwaltung.";
    case "ROW_EXISTS_SKIPPED": return p.inactive ? "Artikel vorhanden (deaktiviert) – übersprungen." : "Artikel vorhanden – übersprungen.";
    case "ROW_STOCK_INVALID": return `${spalte}: ${GRENZEN.stock}`;
    case "ROW_STOCK_RESERVED": {
      const r = zahl(p.reserved), b = zahl(p.blocked);
      if (r !== null || b !== null) {
        return `Der Bestand kann nicht unter die reservierte und gesperrte Menge sinken (reserviert ${formatUnits(r ?? 0)}, gesperrt ${formatUnits(b ?? 0)}).`;
      }
      return "Der Bestand ist inzwischen reserviert oder gesperrt und wurde nicht gesenkt.";
    }
    case "ROW_EAN_DUPLICATE": {
      const andere = zeilenListe(p.rows);
      return andere ? `Dieselbe EAN steht auch in Zeile ${andere}.` : "Dieselbe EAN steht mehrfach in der Datei.";
    }
    case "FORMULA": return `${spalte}: Formel statt festem Wert. Bitte speichern Sie die Datei mit Werten.`;
    case "NUMBER_AMBIGUOUS": return `${spalte}: Zahl nicht eindeutig lesbar.`;
    case "NUMBER_INVALID": return `${spalte}: keine gültige Zahl im gewählten Zahlformat.`;
    case "DATE_VALUE": return `${spalte}: Datum statt Zahl oder Text.`;
    case "TEXT_INVALID": return `${spalte}: enthält unzulässige Zeichen oder keinen Text.`;
    case "SKU_NUMERIC": return "Die Artikelnummer war als Zahl gespeichert – bitte führende Nullen prüfen.";
    // Konflikte der Übernahme (Zeile nicht gebucht)
    case "ROW_STOCK_CHANGED": {
      const jetzt = zahl(p.current);
      return jetzt !== null ? `Der Bestand hat sich seit der Vorschau geändert (jetzt ${formatUnits(jetzt)}).` : "Der Bestand hat sich seit der Vorschau geändert.";
    }
    case "ROW_PRODUCT_CHANGED": {
      const felder = Array.isArray(p.fields) ? p.fields.map((f) => FIELD_LABELS[f] || f).join(", ") : null;
      return felder ? `Der Artikel wurde seit der Vorschau geändert (${felder}).` : "Der Artikel wurde seit der Vorschau geändert.";
    }
    case "ROW_PRODUCT_CREATED": return "Ein Artikel mit dieser Artikelnummer wurde inzwischen angelegt.";
    case "ROW_PRODUCT_MISSING": return "Der Artikel ist nicht mehr vorhanden.";
    default: return "Die Zeile konnte nicht übernommen werden.";
  }
}

/** Konfliktgrund einer nicht gebuchten Zeile (apply_code). */
export function applyCodeText(code, issues, columns) {
  const passend = Array.isArray(issues) ? issues.find((i) => i && i.code === code) : null;
  if (code === "ROW_PRODUCT_INACTIVE") return "Der Artikel wurde inzwischen deaktiviert.";
  return issueText(passend || { code }, columns);
}

function wertText(field, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    const s = value.toLocaleString("de-DE", { maximumFractionDigits: 3 });
    if (field === "weightKg") return `${s} kg`;
    if (field === "lengthCm" || field === "widthCm" || field === "heightCm") return `${s} cm`;
    if (field === "unitValue") return value.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
    return s;
  }
  const t = String(value);
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

/** „Gewicht: 0,5 kg → 0,6 kg“ */
export function changeText(change) {
  const c = change || {};
  return `${FIELD_LABELS[c.field] || c.field}: ${wertText(c.field, c.before)} → ${wertText(c.field, c.after)}`;
}

/** Bestandszeile der Vorschau je Modus. */
export function stockText(stock, stockMode) {
  if (!stock) return null;
  const vorher = zahl(stock.onHandBefore);
  const delta = zahl(stock.delta);
  if (stockMode === "receipt") {
    if (!delta) return "Wareneingang: keine Menge";
    return vorher !== null ? `Wareneingang +${formatUnits(delta)} (Bestand ${formatUnits(vorher)} → ${formatUnits(vorher + delta)})` : `Wareneingang +${formatUnits(delta)}`;
  }
  if (delta === null || delta === 0) return vorher !== null ? `Bestand ${formatUnits(vorher)} (unverändert)` : null;
  const vz = delta > 0 ? `+${formatUnits(delta)}` : `−${formatUnits(Math.abs(delta))}`;
  return `Bestand ${formatUnits(vorher ?? 0)} → ${formatUnits((vorher ?? 0) + delta)} (${vz})`;
}

export const ACTION_LABELS = Object.freeze({
  create: "Neu",
  update: "Aktualisiert",
  unchanged: "Unverändert",
  skip: "Übersprungen",
  error: "Fehler",
});

export const APPLY_STATUS_LABELS = Object.freeze({
  pending: "Offen",
  noop: "Unverändert",
  skipped: "Übersprungen",
  error: "Fehler – nicht übernommen",
  applied: "Übernommen",
  stale: "Geändert – neu prüfen",
  failed: "Nicht übernommen",
  cancelled: "Nicht übernommen (abgeschlossen)",
});

/** Lesefehler der Datei im Browser. */
export function readErrorText(code, params) {
  const p = params || {};
  switch (code) {
    case "FILE_TYPE": return "Bitte wählen Sie eine Excel-Datei (.xlsx) oder eine CSV-Datei (.csv).";
    case "FILE_EMPTY": return "Die Datei ist leer.";
    case "FILE_TOO_LARGE": return "Die Datei ist größer als 15 MB. Bitte teilen Sie sie auf.";
    case "FILE_TOO_LARGE_UNPACKED": return "Die Excel-Datei ist entpackt zu groß. Bitte speichern Sie nur die benötigten Daten oder als CSV.";
    case "TOO_MANY_ROWS": return `Die Datei hat mehr als ${formatUnits(p.max ?? 10000)} Datenzeilen. Bitte teilen Sie sie auf.`;
    case "TOO_MANY_COLUMNS": return `Die Datei hat mehr als ${formatUnits(p.max ?? 100)} Spalten.`;
    case "CSV_UNTERMINATED_QUOTE": return "Die CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.";
    case "XLSX_UNSAFE": return "Die Excel-Datei enthält unzulässige Strukturen und wird nicht gelesen.";
    case "XLSX_STRUCTURE_UNSUPPORTED": return "Dieses Tabellenblatt kann nicht sicher gelesen werden. Bitte speichern Sie es als .xlsx neu oder als CSV.";
    case "NO_DATA": return "Die Datei enthält keine Datenzeilen unter der Kopfzeile.";
    case "XLSX_UNREADABLE":
    default:
      return "Diese Datei kann nicht gelesen werden. Bitte speichern Sie sie als .xlsx oder CSV.";
  }
}
