// utils/streetLine.mjs — Straße, Hausnummer und Wohnungsangabe aus EINEM Feld.
//
// ConfidaraExpress speichert „Straße und Hausnummer“ in einem Feld. Zerlegt wird nur für die
// Adressprüfung und für die Übernahme eines Vorschlags; gespeichert und gesendet wird, was der
// Kunde im Feld stehen hat.
//
// DIESELBE Regel steht im Backend (lib/addressValidation/streetLine.js). Beide bestehen dieselbe
// Falltabelle — hier src/testing/houseNumberCases.json, dort tests/fixtures/house-number-cases.json,
// bytegleich (die Prüfsumme steht in beiden Tests). Eine Änderung gehört in beide Repos.
//
// Ergebnis von splitStreetAndNumber:
//   street       Straßenname ohne Hausnummer.
//   houseNumber  Hausnummer in kompakter Form („12a“, „12-14“, „12bis“, „846/1“): Strichvarianten
//                (–, —) werden „-“, Leerraum entfällt, „12 bis 14“ wird „12-14“.
//   unit         Wohnungs-, Etagen- oder Gebäudeangabe („bus 3“, „lgh 1102“, „2º B“, „/34“) — gehört
//                NICHT zur Hausnummer.
//   unitBefore / unitAfter  dieselbe Angabe samt Trennzeichen, so wie sie stand. formatStreetLine
//                stellt sie unverändert zurück — eine Übernahme verliert nie die Wohnungsangabe.

// In Frankreich, Luxemburg, Irland und Malta steht die Hausnummer VORN („12 rue de la Paix“).
export const NUMBER_FIRST_COUNTRIES = Object.freeze(["FR", "LU", "IE", "MT"]);
// „12/34“ trennt in Polen Haus und Wohnung, in Österreich Haus, Stiege und Tür; „12-34“ in Litauen,
// Lettland und Estland Haus und Wohnung. Überall sonst gehören Schrägstrich und Strich zur
// Hausnummer („12/1“, „846/1“, „1/B“, „12-14“).
const SLASH_UNIT_COUNTRIES = Object.freeze(["PL", "AT"]);
const HYPHEN_UNIT_COUNTRIES = Object.freeze(["LT", "LV", "EE"]);

// Strichvarianten (U+2010 bis U+2015 und das Minuszeichen U+2212) werden zu „-“. Über fromCharCode
// gebaut, damit kein unsichtbares Zeichen im Quelltext steht.
const DASH_CHARS = [0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212].map((c) => String.fromCharCode(c)).join("");
const DASHES_RE = new RegExp(`[${DASH_CHARS}]`, "g");

export function normalizeDashes(value) {
  return String(value == null ? "" : value).replace(DASHES_RE, "-");
}

function normalizeCountryCode(country) {
  return String(country == null ? "" : country).trim().toUpperCase();
}

export function isNumberFirstCountry(country) {
  return NUMBER_FIRST_COUNTRIES.includes(normalizeCountryCode(country));
}

// Vereinheitlicht die Eingabe nur für die Zerlegung: Strichvarianten, Leerraum und ein fehlendes
// Leerzeichen hinter einer Abkürzung („Hauptstr.12“ → „Hauptstr. 12“).
function normalizeLine(value) {
  return normalizeDashes(value)
    .replace(/\.(?=\d)/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Grammatik der Hausnummer ─────────────────────────────────────────────────────────────────
// Eine Zahl, optional mit Buchstaben („12a“, „12ab“, „12 a“), dem französischen Zusatz bis/ter/
// quater („12bis“, „12 bis“) und weiteren Teilen hinter „-“, „/“ oder „bis“ („12-14“, „12/1“,
// „12a-c“, „12 bis 14“). Ein Buchstabe gehört nur zur Hausnummer, wenn kein weiterer Buchstabe,
// keine Ziffer und kein Punkt folgt — „12 m. 34“, „16 bus 3“ und „12 hs“ beginnen eine
// Wohnungsangabe, keine Hausnummer.
const AFTER_LETTER = String.raw`(?![\p{L}\p{N}.])`;
// Ein durch Leerzeichen abgesetzter Buchstabe („12 a“) zusätzlich nicht vor „/“ — „12 R/C“ ist
// Hausnummer 12 mit Erdgeschossangabe (PT), nicht „12 R“.
const AFTER_SPACED_LETTER = String.raw`(?![\p{L}\p{N}./])`;
const SEGMENT = String.raw`(?:\d+(?:\p{L}${AFTER_LETTER})?|\p{L}${AFTER_LETTER})`;
const HOUSE_NUMBER = String.raw`\d+(?:\p{L}{1,2}${AFTER_LETTER}| \p{L}${AFTER_SPACED_LETTER})?`
  + String.raw`(?: ?(?:bis|ter|quater)(?![\p{L}\p{N}])(?! ?\d))?`
  + String.raw`(?: ?(?:[-/]|bis(?= ?\d)) ?${SEGMENT})*`;
// Erst die volle Form, dann nur die Zahl: „12 A 5“ (Finnland: Treppe A, Wohnung 5) ist Hausnummer 12.
const HOUSE_NUMBER_FORMS = Object.freeze([HOUSE_NUMBER, String.raw`\d+`]);

function stickyHouseNumber(form) {
  return new RegExp(form, "iuy");
}

// Kompakte Form für den Vergleich: „12 a“ → „12a“, „12 – 14“ → „12-14“, „12 bis 14“ → „12-14“.
export function compactHouseNumber(value) {
  return normalizeDashes(value).replace(/ ?bis ?(?=\d)/giu, "-").replace(/\s+/g, "").trim();
}

// ── Wohnungs-, Etagen- und Gebäudeangaben ────────────────────────────────────────────────────
// Nach der Hausnummer beginnt eine Wohnungsangabe, wenn ein Komma folgt, eines dieser Wörter,
// eine Etage („2º“, „2. OG“, „2. th.“, „3. em.“) oder — je Land — ein Schrägstrich, ein Strich
// mit Zahl, eine römische Etage oder Treppe und Wohnung.
const UNIT_WORDS = Object.freeze([
  "bus", "bte", "boîte", "boite",                              // BE
  "lgh", "lägenhet",                                           // SE
  "int", "interno", "scala",                                   // IT
  "m", "lok", "lokal", "mieszkanie",                           // PL
  "top", "tür", "stiege", "stg",                               // AT
  "hs", "bg", "huis",                                          // NL
  "apt", "apartment", "appt", "appartement", "app", "flat", "unit", "suite",
  "whg", "wohnung", "hinterhaus", "vorderhaus", "gartenhaus", "seitenflügel", "eg", "og", "dg", "ug", // DE
  "bl", "sc", "ap", "et", "etaj", "vh",                        // RO, BG
  "piso", "planta", "puerta", "esc", "escalera", "izq", "izda", "dcha", "dcho", "dto", "dta", "esq", "r/c", // ES, PT
  "em", "emelet", "ajtó", "fszt",                              // HU
  "th", "tv", "mf", "st", "kl",                                // DK
  "c/o",
]);
const UNIT_WORD_RE = new RegExp(String.raw`^\s*[/-]?\s*(?:${UNIT_WORDS.join("|")})\.?(?=[\s\d,./-]|$)`, "iu");
const UNIT_TAIL_PATTERNS = Object.freeze([
  /^\s*[,(]/,                                                                    // „…, 2º B“, „… (Hinterhaus)“
  /^\.\s*$/,                                                                     // Punkt hinter der Nummer (HU „12.“)
  /^\.?\s*\d+\s*[º°ª]/,                                                          // Etage ES/PT „2º“, „3ª“
  /^\.?\s*\d+\s*\.?\s*(?:og|etage|stock|obergeschoss|th|tv|mf|em|emelet|piso|planta|sal)\b/i, // „2. OG“, „2. th.“
]);

function isUnitTail(rest, country) {
  if (UNIT_WORD_RE.test(rest)) return true;
  if (UNIT_TAIL_PATTERNS.some((re) => re.test(rest))) return true;
  const cc = normalizeCountryCode(country);
  if (SLASH_UNIT_COUNTRIES.includes(cc) && /^\s*\//.test(rest)) return true;              // AT „12/Stiege 3/Top 5“
  if (HYPHEN_UNIT_COUNTRIES.includes(cc) && /^\s*-\s*\d/.test(rest)) return true;
  if ((cc === "NL" || cc === "BE") && /^\s*-?\s*(?:I{1,3}|IV|VI{0,3}|IX|X)(?![\p{L}\p{N}])/u.test(rest)) return true; // „12-II“
  if (cc === "FI" && /^\s*\p{L}\s*\d+\s*$/u.test(rest)) return true;                     // „12 A 5“
  return false;
}

// Trennt in PL/AT den Teil ab „/“, in LT/LV/EE den Teil ab „-“ als Wohnungsangabe ab.
function splitAttachedUnit(compact, country) {
  const cc = normalizeCountryCode(country);
  const sep = SLASH_UNIT_COUNTRIES.includes(cc) ? "/" : HYPHEN_UNIT_COUNTRIES.includes(cc) ? "-" : "";
  const i = sep ? compact.indexOf(sep) : -1;
  if (i > 0) return { core: compact.slice(0, i), unit: compact.slice(i) };
  return { core: compact, unit: "" };
}

// Straßenteil vor der Hausnummer: ohne Komma am Ende, ohne „nr.“/„no.“ (RO „Str. Victoriei nr. 12“).
function cleanStreetPart(text) {
  return String(text).replace(/[\s,]+$/, "").replace(/\s+(?:nr|no|n°|nº)\.?$/iu, "").trim();
}

// Hausnummer hinten: die ERSTE Zahl hinter einem Straßennamen, auf die das Zeilenende oder eine
// Wohnungsangabe folgt. „Straße des 17. Juni 112“ → 112, „Wetstraat 16 bus 3“ → 16 (nicht 3).
function splitTrailing(line, country) {
  const positions = /(^|[ ,])(?=\d)/g;
  let m;
  while ((m = positions.exec(line)) !== null) {
    const pos = m.index + m[1].length;
    if (m[0] === "") positions.lastIndex = m.index + 1;
    const street = cleanStreetPart(line.slice(0, pos));
    if (!/\p{L}/u.test(street)) continue;
    for (const form of HOUSE_NUMBER_FORMS) {
      const re = stickyHouseNumber(form);
      re.lastIndex = pos;
      const h = re.exec(line);
      if (!h) continue;
      const rest = line.slice(pos + h[0].length);
      if (rest !== "" && !isUnitTail(rest, country)) continue;
      const parts = splitAttachedUnit(compactHouseNumber(h[0]), country);
      return { street, houseNumber: parts.core, unitAfter: parts.unit + rest };
    }
  }
  return null;
}

// Hausnummer vorn (FR, LU, IE, MT): „12 rue de la Paix“, „12, rue du Fort“, „12 bis rue …“.
// Ein Zusatz hinter einem Komma der Straße bleibt Wohnungsangabe („12 Main Street, Apt 4“).
function splitLeading(line, country) {
  for (const form of HOUSE_NUMBER_FORMS) {
    const re = stickyHouseNumber(form);
    re.lastIndex = 0;
    const h = re.exec(line);
    if (!h) continue;
    const afterNumber = line.slice(h[0].length);
    const sep = /^(?:\s*,\s*|\s+)/.exec(afterNumber);
    if (!sep) continue;
    const remainder = afterNumber.slice(sep[0].length);
    if (!/\p{L}/u.test(remainder)) continue;
    const comma = remainder.indexOf(",");
    const street = (comma > 0 ? remainder.slice(0, comma) : remainder).trim();
    if (!street) continue;
    const parts = splitAttachedUnit(compactHouseNumber(h[0]), country);
    return { street, houseNumber: parts.core, unitAfter: parts.unit + (comma > 0 ? remainder.slice(comma) : "") };
  }
  return null;
}

// Wohnungsangabe VOR der Anschrift — irisch/maltesisch „Apartment 4, 12 Main Street“.
const UNIT_PREFIX_RE = /^((?:apartment|apt|flat|unit|suite|appt|appartement|app|bâtiment|batiment|bât|bat|résidence|residence)\.?\s*[\p{L}\p{N}-]+\s*,\s*)/iu;
// Spanisch/portugiesisch „s/n“ (ohne Hausnummer) am Ende.
const WITHOUT_NUMBER_RE = /\s+s\/n[º°.]?$/iu;

function unitText(before, after) {
  const b = String(before).replace(/[\s,]+$/, "").trim();
  const a = String(after).replace(/^[\s,.]+/, "").trim();
  return [b, a].filter(Boolean).join(" ");
}

export function splitStreetAndNumber(value, country) {
  let line = normalizeLine(value);
  if (!line) return { street: "", houseNumber: "", unit: "", unitBefore: "", unitAfter: "" };
  let unitBefore = "";
  if (isNumberFirstCountry(country)) {
    const p = UNIT_PREFIX_RE.exec(line);
    if (p && p[1].length < line.length) { unitBefore = p[1]; line = line.slice(p[1].length); }
  }
  let ohneNummer = "";
  const sn = WITHOUT_NUMBER_RE.exec(line);
  if (sn && sn.index > 0) { ohneNummer = sn[0]; line = line.slice(0, sn.index); }
  const hit = (isNumberFirstCountry(country)
    ? (splitLeading(line, country) || splitTrailing(line, country))
    : splitTrailing(line, country)) || { street: line, houseNumber: "", unitAfter: "" };
  const unitAfter = hit.unitAfter + ohneNummer;
  return {
    street: hit.street,
    houseNumber: hit.houseNumber,
    unit: unitText(unitBefore, unitAfter),
    unitBefore,
    unitAfter,
  };
}

// Setzt Straße und Hausnummer in der landesüblichen Reihenfolge zusammen; eine Wohnungsangabe aus
// splitStreetAndNumber (unitBefore/unitAfter) steht wieder an ihrem Platz.
export function formatStreetLine(country, street, houseNumber, affixes) {
  const s = String(street == null ? "" : street).trim();
  const n = String(houseNumber == null ? "" : houseNumber).trim();
  const core = !s ? n : !n ? s : (isNumberFirstCountry(country) ? `${n} ${s}` : `${s} ${n}`);
  const before = affixes && typeof affixes.unitBefore === "string" ? affixes.unitBefore : "";
  const after = affixes && typeof affixes.unitAfter === "string" ? affixes.unitAfter : "";
  return `${before}${core}${after}`.replace(/\s+/g, " ").trim();
}

// Welche Hausnummer gilt nach der Auswahl eines Vorschlags? Die Information des Kunden wird nie
// still überschrieben:
//   • nichts getippt              → die Nummer des Vorschlags
//   • Vorschlag ohne Nummer       → die getippte Nummer bleibt
//   • gleich (kompakt)            → die Schreibweise des Vorschlags
//   • getippte Nummer ist genauer („12a“, „12-14“, „12bis“ zu „12“) → die getippte bleibt
//   • sonst (der Kunde tippte einen Anfang, „1“ → „13“, oder wählte sichtbar eine andere Nummer)
//                                 → die Nummer des Vorschlags
export function chooseHouseNumber(typed, offered) {
  const t = compactHouseNumber(typed), o = compactHouseNumber(offered);
  if (!t) return o;
  if (!o) return t;
  const tl = t.toLowerCase(), ol = o.toLowerCase();
  if (tl === ol) return o;
  if (tl.startsWith(ol) && !/^\d/.test(tl.slice(ol.length))) return t;
  return o;
}
