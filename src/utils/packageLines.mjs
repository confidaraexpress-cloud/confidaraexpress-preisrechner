// Paketzeilen — individuelle Mehrpaketsendungen (Canonical v2.79, §15 „Paketeditor“). Rein, ohne React
// und bewusst ohne Abhängigkeiten: der öffentliche Preisrechner bündelt dieses Modul mit.
//
// ── Das Modell ──────────────────────────────────────────────────────────────────────────────
// Zeile 1 IST das bisherige Paket: dieselben fünf Formularfelder (`packageCount`, `weight`, `length`,
// `width`, `height`), dieselben Feld-IDs, Prüfungen, Entwürfe und Übergaben. Weitere Zeilen stehen im
// Formular unter `extraPackageLines` — Formularwerte als Zeichenketten wie die flachen Felder, dazu
// ein stabiler `key` für React. Ein Formular ohne weitere Zeilen ist damit exakt das bisherige.
//
// ── Was gesendet wird ───────────────────────────────────────────────────────────────────────
// Gleiche Zeilen (Gewicht und alle drei Maße gleich) sind EINE Paketart: sie werden zur Menge
// zusammengefasst, und gesendet wird der flache Vertrag — bytegleich zu vorher. Erst zwei
// VERSCHIEDENE Zeilen senden `packageLines`, und zwar in der Reihenfolge des Formulars: so zeigt ein
// Serverfehler `packageLines[i].<feld>` auf genau die Zeile i. Zusammengefasst wird dann serverseitig
// nach derselben Regel (lib/packageDimensions.js).
//
// ── Grenzen ─────────────────────────────────────────────────────────────────────────────────
// Wie der Server: höchstens 20 Zeilen und 99 Pakete je Sendung; jede Zeile mit den Grenzen des
// einzelnen Pakets. Die Feldtexte bleiben die der jeweiligen Seite — dieses Modul bekommt deren
// Feldprüfer übergeben und setzt nur den Zeilenbezug („Paket 2: …“) davor.

/** Die fünf Paketfelder — Zeile 1 im Formular, jede weitere Zeile mit denselben Schlüsseln. */
export const PACKAGE_FIELDS = Object.freeze(["packageCount", "weight", "length", "width", "height"]);
/** Höchstens 99 Pakete je Sendung (= lib/packageDimensions.js PACKAGE_COUNT_MAX). */
export const PACKAGE_COUNT_MAX = 99;
/** Vorbelegung der Menge — begründet in newShipmentForm.mjs (eine Paketzeile hat mindestens ein Paket). */
export const PACKAGE_COUNT_DEFAULT = "1";
/** Höchstens 20 Paketzeilen (= lib/packageDimensions.js PACKAGE_LINES_MAX). */
export const PACKAGE_LINES_MAX = 20;
/** Formularschlüssel der Zeilen 2 bis 20. */
export const EXTRA_PACKAGE_LINES_KEY = "extraPackageLines";
/** Fehlerschlüssel der Summe — und Präfix der Feldschlüssel ab Zeile 2 (`packageLines.1.weight`). */
export const PACKAGE_LINES_KEY = "packageLines";

export const PACKAGE_LINES_LIMIT_TEXT = `Höchstens ${PACKAGE_LINES_MAX} Paketzeilen`;
export const PACKAGE_TOTAL_LIMIT_TEXT = `Höchstens ${PACKAGE_COUNT_MAX} Pakete je Sendung.`;

const WERTFELDER = Object.freeze(["weight", "length", "width", "height"]);
const ERSTE_ZEILE = "zeile-1";

let laufendeNummer = 0;
/** Ein neuer, in dieser Sitzung eindeutiger Zeilenschlüssel (nur für React, nie gesendet). */
export function newPackageLineKey() {
  laufendeNummer += 1;
  return `zeile-n${laufendeNummer}`;
}

const istObjekt = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const alsText = (v) => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "");

/** Eine leere Zeile — Menge 1, alles andere leer (wie der Ausgangszustand des Formulars). */
export function emptyPackageLine() {
  return { key: newPackageLineKey(), packageCount: PACKAGE_COUNT_DEFAULT, weight: "", length: "", width: "", height: "" };
}

// Eine Zeile aus beliebiger Quelle (Formular, Sitzungszustand) — nur die fünf Felder, nur Text. Ein
// fehlender Schlüssel wird neu vergeben.
function zeileAusQuelle(src) {
  const z = istObjekt(src) ? src : {};
  const zeile = { key: typeof z.key === "string" && z.key.trim() ? z.key : newPackageLineKey() };
  for (const f of PACKAGE_FIELDS) zeile[f] = alsText(z[f]);
  return zeile;
}

/**
 * Die weiteren Zeilen eines gespeicherten oder übergebenen Formulars, bereinigt: höchstens 19,
 * nur Objekte, nur die fünf Felder als Text, jede mit Schlüssel. Fehlt etwas: keine weiteren Zeilen.
 */
export function normalizeExtraPackageLines(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(istObjekt).slice(0, PACKAGE_LINES_MAX - 1).map(zeileAusQuelle);
}

/** Alle Zeilen eines Formulars: Zeile 1 aus den flachen Feldern, danach `extraPackageLines`. */
export function formPackageLines(form) {
  const f = istObjekt(form) ? form : {};
  return [zeileAusQuelle({ ...f, key: ERSTE_ZEILE }), ...normalizeExtraPackageLines(f[EXTRA_PACKAGE_LINES_KEY])];
}

/** Hat das Formular mehr als eine Paketzeile? */
export function hasExtraPackageLines(form) {
  return istObjekt(form) && Array.isArray(form[EXTRA_PACKAGE_LINES_KEY]) && form[EXTRA_PACKAGE_LINES_KEY].length > 0;
}

/** Der Formularpatch zu einer Zeilenliste: Zeile 1 in die flachen Felder, der Rest nach `extraPackageLines`. */
export function formPatchFromPackageLines(lines) {
  const liste = Array.isArray(lines) && lines.length ? lines.slice(0, PACKAGE_LINES_MAX) : [emptyPackageLine()];
  const [erste, ...weitere] = liste;
  const patch = {};
  for (const f of PACKAGE_FIELDS) patch[f] = alsText(erste && erste[f]);
  patch[EXTRA_PACKAGE_LINES_KEY] = weitere.map(zeileAusQuelle);
  return patch;
}

/* ══════════ Bearbeiten ═══════════════════════════════════════════════════════════════════ */

/** Hängt eine leere Zeile an (bis 20). */
export function addPackageLine(lines) {
  const liste = Array.isArray(lines) ? lines : [];
  if (liste.length >= PACKAGE_LINES_MAX) return liste;
  return [...liste, emptyPackageLine()];
}

/** Setzt direkt unter Zeile `index` eine Kopie mit denselben Werten und Menge 1 (bis 20). */
export function copyPackageLine(lines, index) {
  const liste = Array.isArray(lines) ? lines : [];
  if (liste.length >= PACKAGE_LINES_MAX || !liste[index]) return liste;
  const kopie = { ...zeileAusQuelle(liste[index]), key: newPackageLineKey(), packageCount: PACKAGE_COUNT_DEFAULT };
  return [...liste.slice(0, index + 1), kopie, ...liste.slice(index + 1)];
}

/** Entfernt Zeile `index`; die letzte verbleibende Zeile bleibt immer stehen. */
export function removePackageLine(lines, index) {
  const liste = Array.isArray(lines) ? lines : [];
  if (liste.length <= 1 || !liste[index]) return liste;
  return liste.filter((_, i) => i !== index);
}

/** Ändert ein Feld einer Zeile. */
export function updatePackageLine(lines, index, field, value) {
  const liste = Array.isArray(lines) ? lines : [];
  if (!liste[index] || !PACKAGE_FIELDS.includes(field)) return liste;
  return liste.map((z, i) => (i === index ? { ...z, [field]: value } : z));
}

/* ══════════ Schlüssel, IDs, Fehler ═══════════════════════════════════════════════════════ */

/** Feldschlüssel (`data-field`, Fehler, Berührt-Zustand): Zeile 1 flach, ab Zeile 2 `packageLines.<i>.<feld>`. */
export function packageLineFieldKey(index, field) {
  return index === 0 ? field : `${PACKAGE_LINES_KEY}.${index}.${field}`;
}

/** Element-ID eines Feldes: Zeile 1 unverändert (`ns-weight`), ab Zeile 2 mit Nummer (`ns-weight-2`). */
export function packageLineFieldId(idPrefix, index, field) {
  return index === 0 ? `${idPrefix}${field}` : `${idPrefix}${field}-${index + 1}`;
}

/** Alle Feldschlüssel in Formularreihenfolge (für den Sprung zum obersten Fehler), zuletzt die Summe. */
export const PACKAGE_LINE_ERROR_ORDER = Object.freeze([
  ...Array.from({ length: PACKAGE_LINES_MAX }, (_, i) => PACKAGE_FIELDS.map((f) => packageLineFieldKey(i, f))).flat(),
  PACKAGE_LINES_KEY,
]);

// Dieselbe Lesart wie die Feldprüfer der Seiten (`Number`, ganze Zahl 1…99) — was dort gilt, wird
// hier gezählt und gesendet.
const ganzeMenge = (raw) => {
  const t = alsText(raw).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= PACKAGE_COUNT_MAX ? n : null;
};

const zahl = (raw) => {
  const t = alsText(raw).trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Summe der gültigen Mengen aller Zeilen. */
export function packageLinesTotalCount(lines) {
  return (Array.isArray(lines) ? lines : []).reduce((s, z) => s + (ganzeMenge(z && z.packageCount) || 0), 0);
}

/** Der Zeilenbezug eines Fehlertexts: ab zwei Zeilen „Paket k: …“, bei einer Zeile der Text unverändert. */
export function packageLineErrorText(index, lineCount, text) {
  return lineCount > 1 ? `Paket ${index + 1}: ${text}` : text;
}

/**
 * Feldfehler aller Zeilen mit dem Feldprüfer der Seite (`fieldError(feld, rohwert) → Text|null`).
 * Eine Zeile: genau die Schlüssel und Texte des flachen Formulars. Ab zwei Zeilen: jeder Text mit
 * „Paket k: “ davor, Zeile 1 unter den flachen, die übrigen unter den Zeilenschlüsseln — dazu die
 * Summengrenze unter `packageLines`.
 */
export function packageLinesFieldErrors(lines, fieldError) {
  const liste = Array.isArray(lines) && lines.length ? lines : [{}];
  const e = {};
  liste.forEach((z, i) => {
    for (const f of PACKAGE_FIELDS) {
      const text = fieldError(f, z ? z[f] : undefined);
      if (text) e[packageLineFieldKey(i, f)] = packageLineErrorText(i, liste.length, text);
    }
  });
  if (packageLinesTotalExceeded(liste)) e[PACKAGE_LINES_KEY] = PACKAGE_TOTAL_LIMIT_TEXT;
  return e;
}

/** Überschreiten mehrere Zeilen zusammen 99 Pakete? (Eine Zeile prüft ihre Anzahl selbst.) */
export function packageLinesTotalExceeded(lines) {
  return Array.isArray(lines) && lines.length > 1 && packageLinesTotalCount(lines) > PACKAGE_COUNT_MAX;
}

/**
 * Serverfeldpfad → Feldschlüssel: `packageLines[i].<feld>` landet an der Zeile i (Menge = `quantity`
 * → `packageCount`), `packageLines` an der Summe — das setzt voraus, dass die Zeilen in
 * Formularreihenfolge gesendet wurden (packageLinesPayload). Andere Pfade: `null`.
 */
export function mapPackageLinesServerField(serverField) {
  // Die Entwurfsroute nennt dieselben Pfade unter `packages.` (Formularentwurf Fassung 2).
  const s = (typeof serverField === "string" ? serverField.trim() : "").replace(/^packages\./, "");
  if (s === PACKAGE_LINES_KEY) return PACKAGE_LINES_KEY;
  const m = /^packageLines\[(\d{1,2})\](?:\.(quantity|weight|length|width|height))?$/.exec(s);
  if (!m) return null;
  const i = Number(m[1]);
  if (i >= PACKAGE_LINES_MAX) return PACKAGE_LINES_KEY;
  const feld = m[2] === "quantity" || !m[2] ? "packageCount" : m[2];
  return packageLineFieldKey(i, feld);
}

/* ══════════ Werte, Zusammenfassen, Senden ════════════════════════════════════════════════ */

// Eine vollständige Zeile als Zahlen, sonst null.
function zahlenzeile(z) {
  const quantity = ganzeMenge(z && z.packageCount);
  if (quantity === null) return null;
  const werte = { quantity };
  for (const f of WERTFELDER) {
    const n = zahl(z[f]);
    if (n === null) return null;
    werte[f] = n;
  }
  return werte;
}

const gleichePaketart = (a, b) => WERTFELDER.every((f) => a[f] === b[f]);

/**
 * Gleiche Zeilen zusammengefasst, in der Reihenfolge ihres ersten Auftretens — oder `null`, solange
 * eine Zeile unvollständig ist. Eine Zeile im Ergebnis ⇔ alle Pakete sind gleich.
 */
export function canonicalPackageLines(lines) {
  const liste = Array.isArray(lines) ? lines : [];
  const out = [];
  for (const z of liste) {
    const w = zahlenzeile(z);
    if (!w) return null;
    const gleich = out.find((o) => gleichePaketart(o, w));
    if (gleich) gleich.quantity += w.quantity;
    else out.push({ ...w });
  }
  return out.length ? out : null;
}

/**
 * Unterschiedliche Pakete? Ab zwei Zeilen, deren Werte (auch unvollständige) nicht alle gleich sind.
 * Gleiche Zeilen sind eine Paketart — sie werden als eine Zeile mit der Summe der Mengen behandelt.
 */
export function hasMixedPackageLines(lines) {
  const liste = Array.isArray(lines) ? lines : [];
  if (liste.length < 2) return false;
  const roh = (z) => WERTFELDER.map((f) => zahl(z && z[f]));
  const erste = roh(liste[0]);
  return liste.slice(1).some((z) => roh(z).some((v, i) => v !== erste[i]));
}

/**
 * Die Paketwerte des Requests — `null`, solange `fieldErrors` etwas meldet oder eine Zeile fehlt.
 * Eine Paketart: der flache Vertrag `{ packageCount, weight, length, width, height }` (bei mehreren
 * gleichen Zeilen mit der Summe als Anzahl). Unterschiedliche Pakete: `{ packageLines }` in
 * Formularreihenfolge.
 */
export function packageLinesPayload(lines, fieldErrors) {
  if (fieldErrors && Object.keys(fieldErrors).length) return null;
  const kanonisch = canonicalPackageLines(lines);
  if (!kanonisch) return null;
  if (kanonisch.length === 1) {
    const { quantity, ...paket } = kanonisch[0];
    if (quantity > PACKAGE_COUNT_MAX) return null;
    return { packageCount: quantity, ...paket };
  }
  if (packageLinesTotalCount(lines) > PACKAGE_COUNT_MAX) return null;
  return { [PACKAGE_LINES_KEY]: lines.map((z) => zahlenzeile(z)) };
}

/** Eine positive ganze Menge wie im Entwurf der ersten Zeile (shipmentFormSnapshot `posInt`), sonst 1. */
export function draftQuantity(raw) {
  const t = alsText(raw).trim();
  const n = t === "" ? NaN : Number(t);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Die Paketzeilen für einen Formularentwurf (Fassung 2) — oder `null` bei gleichen Paketen (Fassung 1).
 * Gespeichert wird, was im Formular steht, mit derselben Lesart wie die erste Zeile: Menge als positive
 * ganze Zahl (sonst 1), jeder Wert als Zahl oder `null`. Die Grenzen prüft der Server.
 */
export function packageLinesSnapshot(lines) {
  const liste = Array.isArray(lines) ? lines.slice(0, PACKAGE_LINES_MAX) : [];
  if (!hasMixedPackageLines(liste)) return null;
  return liste.map((z) => {
    const out = { quantity: draftQuantity(z && z.packageCount) };
    for (const f of WERTFELDER) out[f] = zahl(z && z[f]);
    return out;
  });
}

/** Zeilen aus Serverdaten (`[{ quantity, weight, length, width, height }]`) als Formularzeilen — oder `null`. */
export function packageLinesFromServer(raw) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > PACKAGE_LINES_MAX) return null;
  const zeilen = [];
  for (let i = 0; i < raw.length; i += 1) {
    const z = raw[i];
    if (!istObjekt(z)) return null;
    const menge = Number.isInteger(z.quantity) && z.quantity >= 1 && z.quantity <= PACKAGE_COUNT_MAX ? z.quantity : null;
    if (menge === null) return null;
    const zeile = { key: i === 0 ? ERSTE_ZEILE : newPackageLineKey(), packageCount: String(menge) };
    for (const f of WERTFELDER) zeile[f] = typeof z[f] === "number" && Number.isFinite(z[f]) && z[f] > 0 ? String(z[f]) : "";
    zeilen.push(zeile);
  }
  return zeilen;
}

/** Ein Formularpatch aus Serverzeilen — oder `null`, wenn sie nicht lesbar sind. */
export function formPatchFromServerPackageLines(raw) {
  const zeilen = packageLinesFromServer(raw);
  return zeilen ? formPatchFromPackageLines(zeilen) : null;
}

/* ══════════ Anzeige ══════════════════════════════════════════════════════════════════════ */

// Wie die Auftragsbestätigung (lib/orderConfirmationPdf.js): Dezimalkomma, keine Tausendertrennung.
export const dezimal = (v) => String(v).replace(".", ",");

/** Eine Zeile als Text, wie Buchungsübersicht und Auftragsbestätigung sie zeigen: „2 × 8 kg · 40 × 30 × 25 cm“. */
export function packageLineText(line) {
  const w = zahlenzeile(line) || (istObjekt(line) && Number.isInteger(line.quantity) ? line : null);
  if (!w) return null;
  const werte = WERTFELDER.map((f) => Number(w[f]));
  if (!werte.every((v) => Number.isFinite(v) && v > 0)) return null;
  const [gewicht, ...masse] = werte;
  return `${w.quantity} × ${dezimal(gewicht)} kg · ${masse.map(dezimal).join(" × ")} cm`;
}

/** Gesamtgewicht in kg auf Gramm gerundet — oder `null`, solange eine Menge oder ein Gewicht fehlt. */
export function packageLinesTotalWeight(lines) {
  const liste = Array.isArray(lines) ? lines : [];
  let summe = 0;
  for (const z of liste) {
    const menge = Number.isInteger(z && z.quantity) ? z.quantity : ganzeMenge(z && z.packageCount);
    const gewicht = typeof (z && z.weight) === "number" ? z.weight : zahl(z && z.weight);
    if (!menge || gewicht === null || gewicht <= 0) return null;
    summe += menge * gewicht;
  }
  return liste.length ? Math.round(summe * 1000) / 1000 : null;
}

/**
 * „3 Pakete · 31 kg gesamt“ — ab zwei Zeilen die Summe (Canonical §15). Das Gewicht erscheint erst,
 * wenn jede Zeile Menge und Gewicht trägt; davor nur die Zahl der Pakete.
 */
export function packageLinesSummaryText(lines) {
  const liste = Array.isArray(lines) ? lines : [];
  const anzahl = liste.reduce((s, z) => s + (Number.isInteger(z && z.quantity) ? z.quantity : ganzeMenge(z && z.packageCount) || 0), 0);
  if (anzahl < 1) return null;
  const pakete = anzahl === 1 ? "1 Paket" : `${anzahl} Pakete`;
  const gewicht = packageLinesTotalWeight(liste);
  return gewicht === null ? pakete : `${pakete} · ${dezimal(gewicht)} kg gesamt`;
}

/** Der Vergleichsschlüssel aller Zeilen (Neuberechnung, Gutschein): nur die Werte, ohne React-Schlüssel. */
export function packageLinesKey(form) {
  return JSON.stringify(formPackageLines(form).map((z) => PACKAGE_FIELDS.map((f) => z[f])));
}
