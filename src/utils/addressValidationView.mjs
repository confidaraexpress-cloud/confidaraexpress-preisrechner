// utils/addressValidationView.mjs — reine Logik der Adressvorschläge und Adressprüfung im Formular.
//
// Framework-frei und ohne Seiteneffekte (wie postalCode.mjs, bookingGate, pickupWindowClient),
// damit die Regeln testbar sind und nicht in einem Effekt verschwinden.
//
// ── Abgrenzung zur bestehenden PLZ-Prüfung ──────────────────────────────────
// `postalCode.mjs` prüft weiterhin allein das FORMAT je Land (generierte
// libaddressinput-Regeln) und bleibt unverändert zuständig. Dieses Modul nutzt sie nur, um
// zu entscheiden, WANN eine Abfrage sinnvoll ist (erst bei formal gültiger PLZ). Es beantwortet
// eine andere Frage: findet der Adressdienst die Anschrift, und passen ihre Teile zusammen?
//
// ── Grundsatz ────────────────────────────────────────────────────────────────
// Das Frontend entscheidet NICHT selbst über Gültigkeit. Jeder Status kommt aus der
// Serverantwort. Es gibt hier keine Ortsliste, keine Straßenliste und keine Länderliste: welche
// Länder abgedeckt sind, sagt der Server (`unsupported`). Die Prüfung ist eine Eingabehilfe —
// sie sperrt nie, weder die Preisberechnung noch das Speichern.

import { validatePostalCode } from "./postalCode.mjs";

export const ADDRESS_STATUS = {
  IDLE:        "idle",         // noch nichts geprüft
  CHECKING:    "checking",     // Prüfung läuft
  CONFIRMED:   "confirmed",    // Anschrift bis zur Hausnummer gefunden
  UNVERIFIED:  "unverified",   // nicht (vollständig) bestätigt — Grund in `reason`, KEIN Fehler
  UNAVAILABLE: "unavailable",  // Prüfdienst nicht erreichbar oder Kontingent erschöpft
  UNSUPPORTED: "unsupported",  // Land nicht abgedeckt oder Dienst nicht eingerichtet — bisheriges Verhalten
};

// Kundentexte. Bewusst ohne technische Begriffe: kein Anbietername, kein „API“, kein
// HTTP-Status, kein „Provider“. Der Kunde soll wissen, was zu tun ist. Keine Aussage behauptet,
// dass eine Sendung zugestellt werden kann — „gefunden“ heißt: der Adressdienst kennt die
// Anschrift.
export const ADDRESS_MESSAGES = {
  [ADDRESS_STATUS.CONFIRMED]:   "Adresse gefunden (Straße, Hausnummer, PLZ und Ort).",
  [ADDRESS_STATUS.UNVERIFIED]:  "Adresse konnte nicht automatisch bestätigt werden. Bitte prüfen Sie die Schreibweise.",
  [ADDRESS_STATUS.UNAVAILABLE]: "Automatische Adressprüfung ist momentan nicht verfügbar.",
};

export const ADDRESS_REASON_MESSAGES = {
  house_number_unconfirmed:  "Straße gefunden – die Hausnummer konnte nicht bestätigt werden. Bitte prüfen.",
  house_number_missing:      "Straße gefunden. Bitte ergänzen Sie die Hausnummer, falls vorhanden.",
  postal_code_city_mismatch: "PLZ und Ort passen möglicherweise nicht zusammen.",
};

export function addressStatusMessage(status, reason) {
  if (status === ADDRESS_STATUS.UNVERIFIED && reason && ADDRESS_REASON_MESSAGES[reason]) {
    return ADDRESS_REASON_MESSAGES[reason];
  }
  return ADDRESS_MESSAGES[status] || "";
}

// ── Wann darf überhaupt gefragt werden? ─────────────────────────────────────
// Länder: nur ein formal gültiger ISO-2-Code. Ob das Land abgedeckt ist, entscheidet der Server.
export function isAddressCheckSupported(country) {
  return /^[A-Z]{2}$/.test(String(country || "").trim().toUpperCase());
}

// Orte zur PLZ erst bei formal gültiger PLZ des Landes — kürzer zu fragen liefert nur
// Rauschen und kostet Anfragen.
export function isPostalCodeQueryable(country, postalCode) {
  if (!isAddressCheckSupported(country)) return false;
  const value = String(postalCode || "").trim();
  if (!value) return false;
  return validatePostalCode(String(country).trim().toUpperCase(), value).valid === true;
}

// Mindestlänge für Vorschläge — dieselbe Grenze hält auch der Server ein.
export const STREET_MIN_CHARS = 3;

// Vorschläge gibt es ab drei Zeichen im Feld „Straße und Hausnummer“. PLZ und Ort grenzen die
// Suche ein, sind aber keine Voraussetzung: man kann mit der Straße beginnen.
export function isStreetQueryable(country, postalCode, city, street) {
  if (!isAddressCheckSupported(country)) return false;
  return streetQueryText(street).length >= STREET_MIN_CHARS;
}

// Der Suchtext ist die Eingabe des Kunden — MIT Hausnummer, damit der Dienst Gebäude
// vorschlagen kann. Nur Leerraum wird vereinheitlicht.
export function streetQueryText(streetAndNumber) {
  return String(streetAndNumber || "").trim().replace(/\s+/g, " ");
}

// Eine Gesamtprüfung lohnt erst, wenn die Anschrift vollständig aussieht: Straße, Ort und eine
// formal gültige (oder im Land nicht verlangte) PLZ.
export function isValidationReady({ country, postalCode, city, street }) {
  if (!isStreetQueryable(country, postalCode, city, street)) return false;
  if (!String(city || "").trim()) return false;
  const cc = String(country).trim().toUpperCase();
  const pc = String(postalCode || "").trim();
  return validatePostalCode(cc, pc).valid === true;
}

// ── Straße und Hausnummer ───────────────────────────────────────────────────
// Gespeichert wird beides in EINEM Feld. In den meisten EU-Ländern steht die Hausnummer hinten,
// in Frankreich, Luxemburg, Irland und Malta vorn. Dieselbe Regel steht im Backend
// (lib/addressValidation/index.js) — sie muss dort und hier gleich bleiben.
export const NUMBER_FIRST_COUNTRIES = Object.freeze(["FR", "LU", "IE", "MT"]);
const HOUSE_NUMBER = String.raw`\d+\s*[a-zA-Z]?(?:\s*[-/]\s*(?:\d+\s*[a-zA-Z]?|[a-zA-Z]\b))?`;
const TRAILING_NUMBER_RE = new RegExp(String.raw`^(.*?)[\s,]+(${HOUSE_NUMBER})\s*$`);
const LEADING_NUMBER_RE = new RegExp(String.raw`^(${HOUSE_NUMBER})(?:\s*,\s*|\s+)(.+)$`);

function isNumberFirst(country) {
  return NUMBER_FIRST_COUNTRIES.includes(String(country || "").trim().toUpperCase());
}

export function splitStreetAndNumber(value, country) {
  const raw = streetQueryText(value);
  if (!raw) return { street: "", houseNumber: "" };
  const trailing = () => {
    const m = TRAILING_NUMBER_RE.exec(raw);
    return m && m[1].trim() ? { street: m[1].trim().replace(/,$/, ""), houseNumber: m[2].replace(/\s+/g, "") } : null;
  };
  const leading = () => {
    const m = LEADING_NUMBER_RE.exec(raw);
    return m && m[2].trim() ? { street: m[2].trim(), houseNumber: m[1].replace(/\s+/g, "") } : null;
  };
  return (isNumberFirst(country) ? (leading() || trailing()) : trailing()) || { street: raw, houseNumber: "" };
}

export function formatStreetLine(country, street, houseNumber) {
  const s = String(street || "").trim();
  const n = String(houseNumber || "").trim();
  if (!s) return n;
  if (!n) return s;
  return isNumberFirst(country) ? `${n} ${s}` : `${s} ${n}`;
}

// Nur der Straßenname (ohne Hausnummer) — für Anzeige und Vergleiche.
export function streetSearchTerm(streetAndNumber, country = "DE") {
  return splitStreetAndNumber(streetAndNumber, country).street;
}

// Anzeige eines Vorschlags in der Liste: Straße und Hausnummer in Landesreihenfolge.
export function suggestionLabel(item, country) {
  if (!item || typeof item !== "object") return "";
  return formatStreetLine(country, item.street, item.houseNumber);
}

// ── Übernahme eines ausgewählten Vorschlags ─────────────────────────────────
// Liefert AUSSCHLIESSLICH die Felder, die der Vorschlag belegt: Straße und Hausnummer, PLZ und
// Ort. Firma, Namen, Adresszusatz, Kontakt, Bundesstaat/Region und die Angabe Privat/Geschäft
// gehören nicht dazu und werden nie angefasst. Die Region wird bewusst nicht übernommen: im
// EU-Launch-Scope hat kein Formular ein Regionsfeld, das der Versand braucht (Bundesstaaten nur
// US/CA) — ein gefülltes Feld ginge sonst an Versanddienste, die es nicht erwarten.
//
// Hat der Vorschlag keine Hausnummer, bleibt die bereits eingegebene erhalten; erfunden wird
// keine. Ein leerer Wert des Vorschlags überschreibt nie einen vorhandenen.
export function applyAddressSuggestion({ country, street }, suggestion) {
  if (!suggestion || typeof suggestion !== "object" || !String(suggestion.street || "").trim()) return {};
  const typed = splitStreetAndNumber(street, country).houseNumber;
  const houseNumber = String(suggestion.houseNumber || "").trim() || typed;
  const patch = { street: formatStreetLine(country, String(suggestion.street).trim(), houseNumber) };
  const pc = String(suggestion.postalCode || "").trim();
  const city = String(suggestion.city || "").trim();
  if (pc) patch.postalCode = pc;
  if (city) patch.city = city;
  return patch;
}

// Ein Ort aus der Ortsliste: ein Text oder ein Objekt mit `city`.
export function cityFromSuggestion(item) {
  if (typeof item === "string") return item;
  return item && typeof item.city === "string" ? item.city : "";
}

// ── Fingerabdruck der geprüften Adresse ─────────────────────────────────────
// Der bestätigte Zustand gehört zu GENAU dieser Adresse. Ändert der Kunde danach Land, PLZ,
// Ort, Straße ODER Hausnummer, ist die frühere Bestätigung wertlos und verfällt — die
// Hausnummer gehört dazu, weil sie seit der Gebäudeprüfung Teil der Bestätigung ist.
export function addressFingerprint({ country, postalCode, city, street }) {
  const norm = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  return [norm(country), norm(postalCode), norm(city), norm(street)].join("|");
}

export function shouldInvalidateAddress(previousFingerprint, nextFingerprint) {
  return typeof previousFingerprint === "string" && previousFingerprint !== nextFingerprint;
}

// ── Auswertung der Serverantwort ────────────────────────────────────────────
// Alles, was nicht eindeutig ein bekannter Status ist, wird zu `unverified`. Eine kaputte
// oder unerwartete Antwort darf nie als „gefunden“ beim Kunden ankommen.
export function readAddressResponse(body) {
  const b = body && typeof body === "object" ? body : {};
  const known = [
    ADDRESS_STATUS.CONFIRMED, ADDRESS_STATUS.UNVERIFIED,
    ADDRESS_STATUS.UNAVAILABLE, ADDRESS_STATUS.UNSUPPORTED,
  ];
  const status = known.includes(b.status) ? b.status : ADDRESS_STATUS.UNVERIFIED;
  return {
    status,
    reason: typeof b.reason === "string" ? b.reason : null,
    citySuggestions: Array.isArray(b.citySuggestions) ? b.citySuggestions.filter((c) => typeof c === "string") : [],
    streetSuggestions: Array.isArray(b.streetSuggestions)
      ? b.streetSuggestions.filter((s) => s && typeof s.street === "string")
      : [],
    normalized: b.normalized && typeof b.normalized === "object" ? b.normalized : null,
    // Nur zusammen mit `confirmed` glaubwürdig; jede andere Kombination gilt als nicht bestätigt.
    houseNumberVerified: status === ADDRESS_STATUS.CONFIRMED && b.houseNumberVerified === true,
  };
}

// Straßenvorschläge der Serverantwort defensiv lesen.
export function readStreetSuggestions(body) {
  const list = body && Array.isArray(body.streets) ? body.streets : [];
  return list
    .filter((s) => s && typeof s.street === "string" && s.street.trim())
    .map((s) => ({
      street: s.street.trim(),
      houseNumber: typeof s.houseNumber === "string" ? s.houseNumber.trim() : "",
      postalCode: typeof s.postalCode === "string" ? s.postalCode.trim() : "",
      city: typeof s.city === "string" ? s.city.trim() : "",
    }));
}

// Braucht der Zustand einen Hinweis mit der Möglichkeit, ihn bewusst zu übergehen?
// („Adresse so verwenden“ — der Kunde entscheidet, nicht der Automat. Gesperrt wird nichts.)
export function addressNeedsAcknowledgement(status) {
  return status === ADDRESS_STATUS.UNVERIFIED || status === ADDRESS_STATUS.UNAVAILABLE;
}

// Der Ton der Statusanzeige. Es gibt keinen Fehlerton: ein Hinweis des Adressdienstes ist nie
// ein Beweis, dass die Anschrift falsch ist.
export function addressStatusTone(status) {
  if (status === ADDRESS_STATUS.CONFIRMED) return "success";
  if (status === ADDRESS_STATUS.UNVERIFIED || status === ADDRESS_STATUS.UNAVAILABLE) return "warning";
  return "neutral";
}

// Wird überhaupt etwas angezeigt? Bei `idle`, `unsupported` und im Ausgangszustand bleibt
// das Formular so ruhig wie bisher — die Funktion darf sich nicht aufdrängen.
export function showsAddressStatus(status) {
  return status === ADDRESS_STATUS.CONFIRMED
      || status === ADDRESS_STATUS.UNVERIFIED || status === ADDRESS_STATUS.UNAVAILABLE
      || status === ADDRESS_STATUS.CHECKING;
}

// ── Längenhinweis für Versandadressen ───────────────────────────────────────
// Einige Versandwege übernehmen Adresszeilen nur bis zu einer festen Länge (Straße und
// Hausnummer 35, Ort 30, Firma 35 Zeichen — Buchungsvertrag im Backend, routes/jumingo.js
// validateAddress). Andere Versandwege haben andere Grenzen. Deshalb ist das ein HINWEIS, keine
// Sperre: die Eingabe bleibt gültig, der Kunde erfährt es aber vor dem Buchen statt danach.
export const SHIPPING_LINE_HINT_LIMITS = Object.freeze({ street: 35, city: 30, company: 35 });

export function shippingLengthHint(field, value) {
  const limit = SHIPPING_LINE_HINT_LIMITS[field];
  const len = String(value || "").trim().length;
  if (!limit || len <= limit) return null;
  return `${len} Zeichen – einige Versandoptionen übernehmen höchstens ${limit}. Kürzen Sie bei Bedarf (z. B. „Str.“).`;
}
