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
import {
  NUMBER_FIRST_COUNTRIES, splitStreetAndNumber, formatStreetLine, chooseHouseNumber,
} from "./streetLine.mjs";

// Die Zerlegung von „Straße und Hausnummer“ steht in streetLine.mjs — dieselbe Regel und
// Falltabelle wie im Backend. Hier weitergereicht, damit die Formulare EINEN Einstieg haben.
export { NUMBER_FIRST_COUNTRIES, splitStreetAndNumber, formatStreetLine };

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
// Anschrift bis zur Hausnummer.
//
// Kurz gehalten (Premium-Durchgang 2026-10-15): jeder Text passt auch bei 390 px in EINE Zeile
// der Statuszeile. Deren Höhe ist reserviert — ein Statuswechsel verschiebt so kein Feld darunter.
export const ADDRESS_MESSAGES = {
  [ADDRESS_STATUS.CONFIRMED]:   "Adresse gefunden",
  [ADDRESS_STATUS.UNVERIFIED]:  "Adresse nicht bestätigt – bitte Schreibweise prüfen.",
  [ADDRESS_STATUS.UNAVAILABLE]: "Adressprüfung derzeit nicht verfügbar.",
};

export const ADDRESS_REASON_MESSAGES = {
  house_number_unconfirmed:  "Hausnummer nicht bestätigt – bitte prüfen.",
  house_number_missing:      "Hausnummer ergänzen, falls vorhanden.",
  postal_code_city_mismatch: "PLZ und Ort passen evtl. nicht zusammen.",
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
// Die Zerlegung selbst (Hausnummer vorn in FR/LU/IE/MT, Wohnungsangaben wie „bus 3“, „/34“,
// „2º B“) steht in streetLine.mjs, siehe Import oben.

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
// Die Angaben des Kunden werden nie still überschrieben (Auftrag 1, P2):
//   • Hat der Vorschlag keine Hausnummer, bleibt die eingegebene; eine genauere eingegebene
//     Nummer („12a“ zu „12“) bleibt ebenfalls (chooseHouseNumber). Erfunden wird keine.
//   • Eine Wohnungs-, Etagen- oder Gebäudeangabe („bus 3“, „/34“, „2º B“, „Apartment 4,“) steht
//     nach der Übernahme wieder an ihrem Platz.
//   • Trägt die Eingabe Ziffern, die keine erkennbare Hausnummer sind, und nennt der Vorschlag
//     keine, bleibt die Straßenzeile so, wie der Kunde sie geschrieben hat — übernommen werden dann
//     nur PLZ und Ort. Vorher wurde aus „Hauptstraße 12–14“ still „Hauptstraße“.
// Ein leerer Wert des Vorschlags überschreibt nie einen vorhandenen.
export function applyAddressSuggestion({ country, street }, suggestion) {
  if (!suggestion || typeof suggestion !== "object" || !String(suggestion.street || "").trim()) return {};
  const typed = splitStreetAndNumber(street, country);
  const offered = String(suggestion.houseNumber || "").trim();
  const ohneErkannteNummer = !typed.houseNumber && !typed.unit && /\d/.test(String(street || ""));
  const patch = {
    street: ohneErkannteNummer && !offered
      ? String(street).replace(/\s+/g, " ").trim()
      : formatStreetLine(country, String(suggestion.street).trim(), chooseHouseNumber(typed.houseNumber, offered), typed),
  };
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

// Der Ton der Statusanzeige. Es gibt keinen Fehlerton: ein Hinweis des Adressdienstes ist nie
// ein Beweis, dass die Anschrift falsch ist. Ein Ausfall der Prüfung ist neutral — er sagt
// nichts über die Eingabe des Kunden und ist deshalb keine Warnung.
export function addressStatusTone(status) {
  if (status === ADDRESS_STATUS.CONFIRMED) return "success";
  if (status === ADDRESS_STATUS.UNVERIFIED) return "warning";
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

// ── Land zuerst ─────────────────────────────────────────────────────────────
// Adressvorschläge gelten immer für EIN Land. Ist noch keines gewählt, kann die Suche nicht
// starten — das sagt der Hinweis am Straßenfeld, statt still nichts anzuzeigen. Eine bereits
// eingetippte Straße bleibt stehen; sobald das Land gewählt ist, sucht der Hook damit los.
export const COUNTRY_FIRST_HINT = "Bitte zuerst das Land auswählen.";

// Nur der Land-zuerst-Hinweis — für Formulare ohne Versandlängen (Profil, Registrierung,
// Partnerabrechnung).
export function countryFirstHint(country) {
  return isAddressCheckSupported(country) ? null : COUNTRY_FIRST_HINT;
}

// Hinweis unter dem Straßenfeld: ohne Land der Land-zuerst-Hinweis, sonst ggf. der Längenhinweis.
export function streetFieldHint(country, street) {
  return countryFirstHint(country) || shippingLengthHint("street", street);
}

// ── Hervorhebung in der Vorschlagsliste ─────────────────────────────────────
// Markiert in einem Vorschlag die Wortanfänge, die der Kunde getippt hat („Schweinheimer Str 187“
// → „Schweinheimer“, „Str“ in „Straße“, „187“). Reine Anzeige: geliefert werden Textstücke
// mit `match`; zusammengesetzt ergeben sie exakt den Ausgangstext. Ohne verwertbare Eingabe
// kommt der Text unverändert als ein Stück zurück.
const WORD_SEPARATORS = /([\s,.\-/]+)/;

// Autofill-Token der eigenen Vorschlagsfelder (Straße, Ort) — Betreiberentscheidung Auftrag 1,
// P5 (2026-10-17). Bewusst KEIN Standard-Token (address-line1, street-address, address-level2):
// diese luden Chrome-Autofill ein, dessen natives Popup über unserer Liste lag, und eine
// Autofill-Auswahl öffnete unsere Liste zusätzlich. Chromium füllt Felder mit unbekanntem Token
// nicht und zeigt dort keine Vorschläge. Grenzen: Firefox und Safari können weiter heuristisch
// füllen (Safari etwa über die Tastaturleiste); "off" beachtet Chrome bei Adressfeldern nicht verlässlich.
export const ADDRESS_SUGGEST_AUTOCOMPLETE = "ce-vorschlagsliste";

export function highlightSegments(text, query) {
  const t = String(text ?? "");
  const tokens = [...new Set(String(query ?? "").toLowerCase().split(WORD_SEPARATORS)
    .filter((w, i) => i % 2 === 0 && (w.length >= 2 || /^\d+$/.test(w))))]
    .sort((a, b) => b.length - a.length);
  if (!t || tokens.length === 0) return [{ text: t, match: false }];
  const out = [];
  const push = (part, match) => {
    if (!part) return;
    const last = out[out.length - 1];
    if (last && last.match === match) last.text += part;
    else out.push({ text: part, match });
  };
  t.split(WORD_SEPARATORS).forEach((part, i) => {
    if (i % 2 === 1) { push(part, false); return; }
    const low = part.toLowerCase();
    const token = low.length === part.length ? tokens.find((k) => low.startsWith(k)) : null;
    if (token) { push(part.slice(0, token.length), true); push(part.slice(token.length), false); }
    else push(part, false);
  });
  return out;
}
