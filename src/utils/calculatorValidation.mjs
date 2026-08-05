// ─────────────────────────────────────────────────────────────────────────────
// Clientseitige Feldvalidierung des Preisrechners.
//
// Ersetzt das frühere landesunabhängige `ZIP_RE = /^[A-Z0-9][A-Z0-9 \-]{1,9}$/i`
// in CalculatorPage.jsx. Genau dieses Muster ließ „4444" als deutsche PLZ durch:
// die Eingabe wurde ans Backend geschickt, dort korrekt mit 422 abgelehnt — und
// die Ablehnung ging im Client verloren. Jetzt greift dieselbe zentrale,
// generierte Landesregel wie in „Neue Sendung" und im Adressbuch
// (src/utils/postalCode.mjs). Kein eigenes Regex, keine erfundenen Landesregeln.
//
// Liefert eine FELDBEZOGENE Fehlerkarte statt eines einzelnen Sammeltexts,
// damit jeder Fehler unter seinem Feld stehen, das Feld markiert und angesprungen
// werden kann.
//
// Wichtig: Diese Prüfung ist reine Benutzerführung. Das Backend validiert
// dieselben Regeln autoritativ erneut — der Client kann sie nicht umgehen.
// ─────────────────────────────────────────────────────────────────────────────
import { validatePostalCode, postalCodeExample, describePostalFormat } from "./postalCode.mjs";
import { countries } from "./countries.js";

// Reihenfolge der Felder im Formular — bestimmt, welches Feld bei mehreren
// Fehlern angesprungen wird (immer das oberste sichtbare).
export const CALCULATOR_FIELD_ORDER = [
  "from_country", "from_zip", "to_country", "to_zip",
  "packageCount", "weight", "length", "width", "height",
];

// Backend-Feldpfad → Formularschlüssel des Preisrechners. Wird an
// normalizeApiError(fieldMap) übergeben, damit ein Serverfehler am richtigen
// Eingabefeld landet statt nur im globalen Banner.
export const CALCULATOR_FIELD_MAP = {
  "sender.postalCode": "from_zip",
  "recipient.postalCode": "to_zip",
  "sender.country": "from_country",
  "recipient.country": "to_country",
  from_zip: "from_zip",
  to_zip: "to_zip",
  from_country: "from_country",
  to_country: "to_country",
  weight: "weight",
  length: "length",
  width: "width",
  height: "height",
  packageCount: "packageCount",
};

export function countryName(code) {
  const cc = String(code || "").trim().toUpperCase();
  const hit = countries.find((c) => c.code === cc);
  return hit ? hit.name : cc;
}

// Sprachlich natürliche Adjektivform NUR für die Hauptversandländer. Alle
// übrigen Länder bekommen die ebenso klare Form „… für <Land> …" — bewusst
// keine automatische Adjektivbildung für 74 Länder (die ginge im Deutschen
// regelmäßig schief).
const COUNTRY_ADJECTIVE = { DE: "deutsche", AT: "österreichische", CH: "schweizerische" };

// „eine fünfstellige deutsche Postleitzahl" bzw. „eine vierstellige Postleitzahl
// für Belgien" — je nachdem, ob eine Adjektivform hinterlegt ist.
function postalPhrase(country, wortform) {
  const cc = String(country || "").trim().toUpperCase();
  const adj = COUNTRY_ADJECTIVE[cc];
  if (adj) return `eine ${wortform} ${adj} Postleitzahl`;
  return `eine ${wortform} Postleitzahl für ${countryName(cc)}`;
}

// Baut die beiden Texte für eine ungültige/fehlende PLZ:
//   message      — vollständiger Satz fürs Banner (nennt Wert und Land)
//   fieldMessage — kurze Korrekturanweisung direkt unter dem Feld
// `label` ist „Ziel-Postleitzahl" bzw. „Herkunfts-Postleitzahl".
export function postalCodeTexts(country, value, label) {
  const pc = validatePostalCode(country, value);
  if (pc.valid) return null;

  const land = countryName(country);
  const wortform = describePostalFormat(country);   // z. B. „fünfstellige" — oder null
  const beispiel = postalCodeExample(country);

  if (pc.code === "POSTAL_CODE_REQUIRED") {
    return {
      code: pc.code,
      title: "Postleitzahl fehlt",
      message: `Für ${land} ist eine Postleitzahl erforderlich. Bitte tragen Sie die ${label} ein.`,
      fieldMessage: wortform
        ? `Bitte geben Sie eine ${wortform} Postleitzahl ein.`
        : (beispiel ? `Bitte geben Sie eine Postleitzahl ein (Beispiel: ${beispiel}).` : "Bitte geben Sie eine Postleitzahl ein."),
    };
  }

  // Der eingegebene Wert wird im Satz zitiert, damit sofort klar ist, worauf
  // sich die Meldung bezieht. Länge begrenzt, damit ein absurd langer Wert das
  // Banner nicht sprengt.
  const eingabe = String(value ?? "").trim().slice(0, 20);
  const anweisung = wortform
    ? `Bitte geben Sie eine ${wortform} Postleitzahl ein.`
    : (beispiel ? `Bitte geben Sie eine Postleitzahl im Format ${beispiel} ein.` : "Bitte prüfen Sie die Postleitzahl.");

  return {
    code: pc.code,
    title: "Postleitzahl prüfen",
    message: `Die eingegebene ${label} „${eingabe}" ist für ${land} ungültig. ${anweisung}`,
    fieldMessage: wortform ? `Bitte geben Sie ${postalPhrase(country, wortform)} ein.` : anweisung,
  };
}

const num = (v) => (v === "" || v == null ? NaN : Number(v));

// Prüft ein Maßfeld (Länge/Breite/Höhe). Leer ist erlaubt — das Backend setzt
// dann dokumentierte Standardmaße ein (30/20/15); nur ein GESETZTER, ungültiger
// Wert ist ein Fehler.
function dimensionError(value, label) {
  if (value === "" || value == null) return null;
  const v = num(value);
  if (Number.isNaN(v)) return `${label} muss eine Zahl sein.`;
  if (v <= 0) return `${label} muss größer als 0 cm sein.`;
  if (v < 0.1 || v > 300) return `${label} muss zwischen 0,1 und 300 cm liegen.`;
  return null;
}

// ── Hauptfunktion ───────────────────────────────────────────────────────────
// getCalculatorErrors(form) → { fieldErrors, banner }
//   fieldErrors  { [feldschlüssel]: "kurzer Text unter dem Feld" }
//   banner       { title, message } für den ERSTEN Fehler — oder null
export function getCalculatorErrors(form = {}) {
  const fieldErrors = {};
  let banner = null;
  const setBanner = (b) => { if (!banner) banner = b; };

  // ── Route: Land + PLZ je Seite ──
  for (const [zipKey, countryKey, label] of [
    ["from_zip", "from_country", "Herkunfts-Postleitzahl"],
    ["to_zip", "to_country", "Ziel-Postleitzahl"],
  ]) {
    if (!String(form[countryKey] || "").trim()) {
      fieldErrors[countryKey] = "Bitte wählen Sie ein Land aus.";
      setBanner({ title: "Land fehlt", message: `Bitte wählen Sie das Land für die ${label.replace("-Postleitzahl", "")} aus.` });
      continue;
    }
    const texts = postalCodeTexts(form[countryKey], form[zipKey], label);
    if (texts) {
      fieldErrors[zipKey] = texts.fieldMessage;
      setBanner({ title: texts.title, message: texts.message });
    }
  }

  // ── Paketanzahl ──
  const pc = num(form.packageCount);
  if (form.packageCount === "" || form.packageCount == null) {
    fieldErrors.packageCount = "Bitte geben Sie die Paketanzahl ein.";
    setBanner({ title: "Paketanzahl fehlt", message: "Bitte geben Sie an, wie viele identische Pakete versendet werden." });
  } else if (!Number.isInteger(pc) || pc < 1 || pc > 99) {
    fieldErrors.packageCount = "Zwischen 1 und 99.";
    setBanner({ title: "Paketanzahl prüfen", message: "Die Paketanzahl muss eine ganze Zahl zwischen 1 und 99 sein." });
  }

  // ── Gewicht ──
  const w = num(form.weight);
  if (form.weight === "" || form.weight == null) {
    fieldErrors.weight = "Bitte geben Sie das Gewicht des Pakets ein.";
    setBanner({ title: "Gewicht fehlt", message: "Bitte geben Sie das Gewicht des Pakets ein." });
  } else if (Number.isNaN(w)) {
    fieldErrors.weight = "Bitte geben Sie eine Zahl ein.";
    setBanner({ title: "Gewicht prüfen", message: "Das Gewicht muss eine Zahl sein (Dezimaltrennzeichen: Punkt oder Komma)." });
  } else if (w <= 0) {
    fieldErrors.weight = "Das Gewicht muss größer als 0 kg sein.";
    setBanner({ title: "Gewicht prüfen", message: "Das Gewicht muss größer als 0 kg sein." });
  } else if (w < 0.1 || w > 1000) {
    fieldErrors.weight = "Zwischen 0,1 und 1.000 kg.";
    setBanner({ title: "Gewicht prüfen", message: "Das Gewicht muss zwischen 0,1 und 1.000 kg liegen." });
  }

  // ── Maße (einzeln optional; ein gesetzter Wert muss gültig sein) ──
  for (const [key, label] of [["length", "Länge"], ["width", "Breite"], ["height", "Höhe"]]) {
    const msg = dimensionError(form[key], label);
    if (msg) {
      fieldErrors[key] = msg;
      setBanner({ title: "Maße prüfen", message: msg });
    }
  }

  // Teilweise ausgefüllte Maße: entweder alle drei oder keines — sonst rechnet
  // das Backend mit Standardmaßen weiter, was der Kunde nicht erwartet.
  const gesetzt = ["length", "width", "height"].filter((k) => String(form[k] ?? "").trim() !== "");
  if (gesetzt.length > 0 && gesetzt.length < 3) {
    for (const k of ["length", "width", "height"]) {
      if (String(form[k] ?? "").trim() === "" && !fieldErrors[k]) fieldErrors[k] = "Bitte vollständig ausfüllen.";
    }
    setBanner({
      title: "Maße unvollständig",
      message: "Bitte geben Sie Länge, Breite und Höhe vollständig ein — oder lassen Sie alle drei Felder leer, um mit Standardmaßen zu rechnen.",
    });
  }

  return { fieldErrors, banner };
}

// Erstes fehlerhaftes Feld in Formularreihenfolge — Ziel für Scrollen/Fokus.
export function firstErrorField(fieldErrors, order = CALCULATOR_FIELD_ORDER) {
  if (!fieldErrors) return null;
  for (const key of order) if (fieldErrors[key]) return key;
  const rest = Object.keys(fieldErrors);
  return rest.length ? rest[0] : null;
}
