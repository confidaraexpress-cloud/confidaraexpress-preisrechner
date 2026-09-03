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
  "from_country", "from_zip", "from_city", "to_country", "to_zip", "to_city",
  "packageCount", "weight", "length", "width", "height",
];

// Backend-Feldpfad → Formularschlüssel des Preisrechners. Wird an
// normalizeApiError(fieldMap) übergeben, damit ein Serverfehler am richtigen
// Eingabefeld landet statt nur im globalen Banner.
export const CALCULATOR_FIELD_MAP = {
  "sender.postalCode": "from_zip",
  "recipient.postalCode": "to_zip",
  "sender.city": "from_city",
  "recipient.city": "to_city",
  "sender.country": "from_country",
  "recipient.country": "to_country",
  from_zip: "from_zip",
  to_zip: "to_zip",
  from_city: "from_city",
  to_city: "to_city",
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

// ── Ort ─────────────────────────────────────────────────────────────────────
// Geprüft wird ANWESENHEIT, nicht Existenz. Es gibt im Client keine Ortsliste
// und ausdrücklich KEINE Ableitung aus der Postleitzahl: ein aus der PLZ
// erzeugter Ort wäre eine erfundene Adresse — der Kunde bekäme einen Tarif für
// einen Ort, den er nie genannt hat. Dieselbe Disziplin wie bei den Paketmaßen.
//
// Die Obergrenze spiegelt „Neue Sendung" (dort 100 Zeichen). Zwei verschiedene
// Grenzen für dasselbe Feld auf zwei Seiten wären genau die Drift, die dieses
// Projekt an `users.zip`/`users.country` schon zweimal bezahlt hat.
export const CITY_MAX_LENGTH = 100;

// `seite` ist „die Herkunft" bzw. „das Ziel" — er steht nur im Bannertext.
function cityError(value, seite) {
  const v = String(value ?? "").trim();
  if (v === "") {
    return {
      title: "Ort fehlt",
      message: `Bitte geben Sie den Ort für ${seite} ein.`,
      fieldMessage: "Bitte geben Sie den Ort ein.",
    };
  }
  if (v.length > CITY_MAX_LENGTH) {
    return {
      title: "Ort prüfen",
      message: `Der Ort für ${seite} darf höchstens ${CITY_MAX_LENGTH} Zeichen enthalten.`,
      fieldMessage: `Höchstens ${CITY_MAX_LENGTH} Zeichen.`,
    };
  }
  return null;
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

  // ── Route: Land, PLZ und Ort je Seite ──
  for (const [zipKey, countryKey, cityKey, label, seite] of [
    ["from_zip", "from_country", "from_city", "Herkunfts-Postleitzahl", "die Herkunft"],
    ["to_zip", "to_country", "to_city", "Ziel-Postleitzahl", "das Ziel"],
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
    const ort = cityError(form[cityKey], seite);
    if (ort) {
      fieldErrors[cityKey] = ort.fieldMessage;
      setBanner({ title: ort.title, message: ort.message });
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

  // ── Maße: alle drei sind PFLICHT ──
  //
  // Bis zu diesem Paket waren sie optional, und das Backend ersetzte leere
  // Felder still durch 30 × 20 × 15 cm (`Number("") === 0` → falsy → Fallback).
  // Der frühere Hinweis „… oder lassen Sie alle drei Felder leer, um mit
  // Standardmaßen zu rechnen" beschrieb genau das — ein Preis für ein Paket,
  // das der Kunde nie beschrieben hat. Diese Möglichkeit gibt es nicht mehr:
  // ohne Maße keine Tarifabfrage, hier wie serverseitig.
  for (const [key, label] of [["length", "Länge"], ["width", "Breite"], ["height", "Höhe"]]) {
    if (String(form[key] ?? "").trim() === "") {
      fieldErrors[key] = `Bitte geben Sie die ${label} ein.`;
      setBanner({
        title: "Maße fehlen",
        message: "Bitte geben Sie Länge, Breite und Höhe vollständig ein — ohne Maße lässt sich kein Tarif berechnen.",
      });
      continue;
    }
    const msg = dimensionError(form[key], label);
    if (msg) {
      fieldErrors[key] = msg;
      setBanner({ title: "Maße prüfen", message: msg });
    }
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
