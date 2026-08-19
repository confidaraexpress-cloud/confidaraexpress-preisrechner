// Ausgangszustand und Paketregeln von „Neue Sendung" — rein, ohne React.
//
// ── Die Produktregel ────────────────────────────────────────────────────────
// „Neue Sendung" ist ein NEUER Vorgang. Das Formular startet deshalb vollständig
// leer: kein Absender aus dem Profil, kein Empfänger, keine Paketdaten, kein
// Land. Gespeicherte Angaben bleiben komfortabel erreichbar — aber ausschließlich
// über eine bewusste Aktion („Eigene Absenderadresse übernehmen", Adressbuch)
// oder über das ausdrückliche Öffnen eines Entwurfs.
//
// Vorher belegte `profilSeed()` Firma, Name, Straße, PLZ, Ort, Land, Telefon und
// E-Mail des Kontos automatisch beim Mount. Der Kunde sah ein ausgefülltes
// Formular, ohne etwas eingegeben zu haben — und konnte nicht unterscheiden, was
// er selbst geprüft hatte und was das System angenommen hat.
//
// ── Warum die Paketregeln hier stehen ───────────────────────────────────────
// Sie müssen exakt so streng sein wie die serverseitige Prüfung
// (`lib/packageDimensions.js` im Backend). Das Frontend ersetzt sie nicht — es
// verhindert nur, dass der Kunde einen Knopf drückt, der garantiert 400 liefert.
// Beide Seiten kennen dieselben Grenzen: Gewicht 0,1–1000 kg, Maße 0,1–300 cm,
// Anzahl 1–99 als ganze Zahl.

import { normalizeCountryCode } from "./countries.js";

export const PACKAGE_FIELDS = Object.freeze(["packageCount", "weight", "length", "width", "height"]);
export const PARTY_PREFIXES = Object.freeze(["s", "r"]);

const PARTY_SUFFIXES = Object.freeze([
  "company", "fullName", "street", "addition", "zip", "city", "country", "phone", "email",
]);

export const WEIGHT_MIN_KG = 0.1;
export const WEIGHT_MAX_KG = 1000;
export const DIMENSION_MIN_CM = 0.1;
export const DIMENSION_MAX_CM = 300;
export const PACKAGE_COUNT_MAX = 99;

// Beispielwerte. Sie sind PLACEHOLDER und niemals Formularwerte — das „z. B."
// steht bewusst davor: eine nackte „5" in einem Zahlenfeld ist von einer echten
// Eingabe nicht zu unterscheiden. Bei der Anzahl genügt die „1", weil dort keine
// Einheit und keine Größenordnung erklärt werden muss.
export const PACKAGE_PLACEHOLDERS = Object.freeze({
  packageCount: "1",
  weight: "z. B. 5",
  length: "z. B. 30",
  width: "z. B. 20",
  height: "z. B. 15",
});

/**
 * Der leere Ausgangszustand — die EINZIGE Quelle dafür.
 *
 * Alle Werte sind `""`, nicht `null`/`undefined`: die Felder sind kontrollierte
 * React-Eingaben, und `undefined` würde sie in unkontrollierte Felder verwandeln
 * (React warnt, und der erste Tastendruck verlöre den Zustandswechsel).
 *
 * Das Land ist ebenfalls leer. Ein vorausgewähltes „DE" ist eine Annahme über
 * die Sendung, keine Tatsache — und beim Empfänger war sie besonders fragwürdig.
 */
export function createEmptyShipmentForm() {
  const form = {};
  for (const p of PARTY_PREFIXES)
    for (const s of PARTY_SUFFIXES) form[`${p}_${s}`] = "";
  for (const k of PACKAGE_FIELDS) form[k] = "";
  form.max_price = "";
  form.latestDeliveryDate = "";
  return form;
}

/**
 * Absenderfelder aus dem Profil — die Datenquelle der Komfortfunktion.
 *
 * Das Profil bleibt also Quelle; es schreibt nur nicht mehr von selbst ins
 * Formular. Das Land läuft unverändert über `normalizeCountryCode()`: die Spalte
 * `users.country` ist VARCHAR(10) ohne CHECK, und ein Wert wie „DEU" stünde in
 * keiner `<option>` — das Auswahlfeld zeigte dann gar nichts an, während jeder
 * Entwurf und jede Buchung dieses Kontos serverseitig scheiterte.
 */
export function senderPatchFromProfile(user) {
  const u = user || {};
  return {
    s_company: u.company_name || "",
    s_fullName: u.name || "",
    s_street: u.street || "",
    s_addition: "",
    s_zip: u.zip || "",
    s_city: u.city || "",
    s_country: normalizeCountryCode(u.country),
    s_phone: u.phone || "",
    s_email: u.email || "",
  };
}

/**
 * Hat das Konto überhaupt eine übernehmbare Anschrift?
 *
 * Ohne diese Prüfung böte die Komfortfunktion einem frisch angelegten Konto eine
 * Aktion an, die sichtbar nichts tut. Das Land allein zählt nicht: es kommt aus
 * `normalizeCountryCode()` und ist selbst bei einem leeren Profil gesetzt.
 */
export function hasProfileSenderData(user) {
  const patch = senderPatchFromProfile(user);
  return ["s_company", "s_fullName", "s_street", "s_zip", "s_city", "s_phone", "s_email"]
    .some((k) => String(patch[k] || "").trim() !== "");
}

/* ══════════ Paketangaben ═════════════════════════════════════════════════ */

// Ein Wert gilt als ANGEGEBEN, wenn er nicht fehlt und nicht leer ist.
// `Number("")` ist 0 und `Number(" ")` ebenfalls — eine Prüfung, die direkt
// parst, macht aus einem leeren Feld eine gültige Null.
function istAngegeben(raw) {
  if (raw === undefined || raw === null) return false;
  return String(raw).trim() !== "";
}

// Erst Anwesenheit, dann parsen, dann Bereich — nie in einem Schritt.
function alsZahl(raw) {
  if (!istAngegeben(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fehlertext für genau ein Paketfeld, oder `null`.
 *
 * Länge, Breite und Höhe sind PFLICHT. Zuvor prüfte das Formular sie nur, wenn
 * bereits etwas eingetragen war (`if (form.length) { … }`) — ein leeres Feld kam
 * damit ohne Beanstandung durch, und das Backend ersetzte es still durch 30/20/15.
 */
export function packageFieldError(field, raw) {
  if (field === "packageCount") {
    if (!istAngegeben(raw)) return "Anzahl ist ein Pflichtfeld.";
    const n = alsZahl(raw);
    if (n === null || !Number.isInteger(n) || n < 1 || n > PACKAGE_COUNT_MAX)
      return `Anzahl muss zwischen 1 und ${PACKAGE_COUNT_MAX} liegen.`;
    return null;
  }
  if (field === "weight") {
    if (!istAngegeben(raw)) return "Gewicht ist ein Pflichtfeld.";
    const n = alsZahl(raw);
    if (n === null || n < WEIGHT_MIN_KG || n > WEIGHT_MAX_KG)
      return "Gewicht muss zwischen 0,1 und 1.000 kg liegen.";
    return null;
  }
  const namen = { length: "Länge", width: "Breite", height: "Höhe" };
  if (!namen[field]) return null;
  if (!istAngegeben(raw)) return `${namen[field]} ist ein Pflichtfeld.`;
  const n = alsZahl(raw);
  if (n === null || n < DIMENSION_MIN_CM || n > DIMENSION_MAX_CM)
    return `${namen[field]} muss zwischen 0,1 und 300 cm liegen.`;
  return null;
}

/** Alle Paketfehler eines Formulars als `{ feld: text }`. */
export function packageErrors(form) {
  const e = {};
  for (const f of PACKAGE_FIELDS) {
    const m = packageFieldError(f, (form || {})[f]);
    if (m) e[f] = m;
  }
  return e;
}

/** Sind Anzahl, Gewicht und alle drei Maße vollständig und gültig? */
export function packageComplete(form) {
  return Object.keys(packageErrors(form)).length === 0;
}

/**
 * Ein Satz, der sagt, was noch fehlt — für die Zeile am Angebotsknopf.
 *
 * Er erscheint erst, wenn der Kunde weiterklicken will oder ein Feld berührt hat
 * (siehe `showErrors` in NewShipmentPage): ein frisches, leeres Formular soll
 * keine Fehlerwand zeigen. Fehlt nur eine Angabe, wird auch nur diese genannt.
 */
export function packageHint(form) {
  const fehlend = PACKAGE_FIELDS.filter((f) => !istAngegeben((form || {})[f]));
  if (fehlend.length === 0) return "";
  const nurMasse = ["length", "width", "height"];
  if (fehlend.length === PACKAGE_FIELDS.length || fehlend.includes("weight"))
    return "Bitte geben Sie Gewicht sowie Länge, Breite und Höhe vollständig an.";
  if (fehlend.every((f) => nurMasse.includes(f)))
    return "Bitte geben Sie Länge, Breite und Höhe vollständig an.";
  const namen = { packageCount: "Anzahl", weight: "Gewicht", length: "Länge", width: "Breite", height: "Höhe" };
  return `Bitte ergänzen Sie: ${fehlend.map((f) => namen[f]).join(", ")}.`;
}

/**
 * Die Paketzeile der Buchungsübersicht — „5 kg · 30 × 20 × 15 cm".
 *
 * Der Kunde soll vor der verbindlichen Bestellung Gewicht UND Abmessungen noch
 * einmal kontrollieren können; bis hierher stand dort nur das Gewicht, weil die
 * Maße im Formular leer bleiben durften und erst serverseitig entstanden.
 *
 * Es wird ausschließlich dargestellt, was tatsächlich im Vorgang steht — nichts
 * ergänzt, nichts gerundet, nichts angenommen. Fehlt eine Angabe, entfällt der
 * betreffende Teil (bei mehr als einem Paket ist das aber ausgeschlossen, weil
 * ohne vollständige Maße gar kein Tarif entsteht).
 *
 * Bei mehreren Paketen wird „je" vorangestellt: Gewicht und Maße gelten laut
 * Formular PRO Paket, und ohne dieses Wort läse sich die Zeile als Gesamtgewicht.
 */
export function packageSummaryLine(form) {
  const f = form || {};
  const anzahl = Number(f.packageCount);
  const mehrere = Number.isInteger(anzahl) && anzahl > 1;

  const gewicht = istAngegeben(f.weight) ? `${f.weight} kg` : null;
  const masse = (istAngegeben(f.length) && istAngegeben(f.width) && istAngegeben(f.height))
    ? `${f.length} × ${f.width} × ${f.height} cm`
    : null;
  if (!gewicht && !masse) return null;

  const teile = [];
  if (mehrere) teile.push(`${anzahl} Pakete`);
  // „je" nur einmal und nur vor der ersten tatsächlich vorhandenen Angabe.
  const praefix = mehrere ? "je " : "";
  if (gewicht) teile.push(`${praefix}${gewicht}`);
  if (masse) teile.push(gewicht ? masse : `${praefix}${masse}`);
  return teile.join(" · ");
}

/**
 * Die Paketwerte für den Request — als Zahlen, ohne jeden Ersatzwert.
 *
 * Gibt `null` zurück, wenn etwas fehlt. Der Aufrufer darf dann nicht senden.
 * Das ersetzt `Number(form.length) || 30` im Preisrechner: dort wurde aus einem
 * leeren Feld dieselbe erfundene 30 wie im Backend.
 */
export function packagePayload(form) {
  if (!packageComplete(form)) return null;
  return {
    packageCount: Number(form.packageCount),
    weight: Number(form.weight),
    length: Number(form.length),
    width: Number(form.width),
    height: Number(form.height),
  };
}
