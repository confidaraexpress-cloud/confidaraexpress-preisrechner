// utils/addressValidationView.mjs — reine Logik der Adressvalidierung im Formular.
//
// Framework-frei und ohne Seiteneffekte (wie postalCode.mjs, bookingGate, pickupWindowClient),
// damit die Regeln testbar sind und nicht in einem Effekt verschwinden.
//
// ── Abgrenzung zur bestehenden PLZ-Prüfung ──────────────────────────────────
// `postalCode.mjs` prüft weiterhin allein das FORMAT je Land (generierte
// libaddressinput-Regeln) und bleibt unverändert zuständig — auch und gerade für Länder
// wie IE/AE/HK ohne Postleitzahlpflicht. Dieses Modul beantwortet eine andere Frage:
// existiert der Ort, existiert die Straße, passen sie zusammen? Die beiden ersetzen
// einander nie.
//
// ── Grundsatz ────────────────────────────────────────────────────────────────
// Das Frontend entscheidet NICHT selbst über Gültigkeit. Jeder Status kommt aus der
// serverbestätigten Antwort. Es gibt hier keine Ortsliste, keine Straßenliste und keine
// Länderdatenbank.

export const ADDRESS_STATUS = {
  IDLE:        "idle",         // noch nichts geprüft
  CHECKING:    "checking",     // Prüfung läuft
  CONFIRMED:   "confirmed",    // Anbieter hat bestätigt
  INVALID:     "invalid",      // eindeutiger Widerspruch
  UNVERIFIED:  "unverified",   // konnte nicht bestätigt werden (KEIN Fehler des Kunden)
  UNAVAILABLE: "unavailable",  // Prüfdienst nicht erreichbar
  UNSUPPORTED: "unsupported",  // Land wird nicht abgedeckt — bisheriges Verhalten
};

// Kundentexte. Bewusst ohne technische Begriffe: kein Anbietername, kein „API", kein
// HTTP-Status, kein „Provider". Der Kunde soll wissen, was zu tun ist — nicht, welche
// Schnittstelle gerade klemmt.
export const ADDRESS_MESSAGES = {
  [ADDRESS_STATUS.CONFIRMED]:   "PLZ, Ort und Straße bestätigt",
  [ADDRESS_STATUS.INVALID]:     "PLZ und Ort passen nicht zusammen.",
  [ADDRESS_STATUS.UNVERIFIED]:  "Adresse konnte nicht automatisch bestätigt werden. Bitte prüfen Sie die Schreibweise.",
  [ADDRESS_STATUS.UNAVAILABLE]: "Automatische Adressprüfung ist momentan nicht verfügbar.",
};

// Länder mit Anbieterabdeckung. Diese Liste steuert AUSSCHLIESSLICH, ob überhaupt geprüft
// wird — sie trifft nie eine Aussage über Gültigkeit. Für alle anderen Länder bleibt der
// bestehende Ablauf unverändert.
export const SUPPORTED_COUNTRIES = ["DE", "AT", "CH", "LI"];

export function isAddressCheckSupported(country) {
  return SUPPORTED_COUNTRIES.includes(String(country || "").trim().toUpperCase());
}

// ── Wann darf überhaupt gefragt werden? ─────────────────────────────────────
// Erst ab einer plausibel vollständigen PLZ. In DE/AT/CH/LI sind das 4–5 Ziffern; kürzer
// zu fragen liefert nur Rauschen und belastet einen kostenlosen Dienst.
export function isPostalCodeQueryable(country, postalCode) {
  if (!isAddressCheckSupported(country)) return false;
  const digits = String(postalCode || "").replace(/\D/g, "");
  const cc = String(country).trim().toUpperCase();
  const min = cc === "DE" ? 5 : 4;
  return digits.length >= min;
}

// Mindestlänge für die Straßensuche — dieselbe Grenze hält auch der Server ein.
export const STREET_MIN_CHARS = 2;

export function isStreetQueryable(country, postalCode, city, street) {
  if (!isAddressCheckSupported(country)) return false;
  if (!isPostalCodeQueryable(country, postalCode)) return false;
  if (!String(city || "").trim()) return false;
  return streetSearchTerm(street).length >= STREET_MIN_CHARS;
}

// Für die Suche zählt nur der Straßenname. Tippt der Kunde bereits die Hausnummer mit,
// würde die Suche sonst ins Leere laufen. Der Feldwert selbst bleibt unangetastet —
// gespeichert und gebucht wird immer die vollständige Eingabe des Kunden.
export function streetSearchTerm(streetAndNumber) {
  const raw = String(streetAndNumber || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const m = /^(.*?)[\s,]+(\d+\s*[a-zA-Z]?(?:\s*[-/]\s*\d+\s*[a-zA-Z]?)?)\s*$/.exec(raw);
  if (!m) return raw;
  const name = m[1].trim();
  return name || raw;
}

// Behält die Hausnummer des Kunden bei, wenn ein Vorschlag den Straßennamen ersetzt.
// Ein Vorschlag korrigiert die Schreibweise der STRASSE — er darf die Hausnummer weder
// verlieren noch erfinden.
export function applyStreetSuggestion(currentValue, suggestedStreet) {
  const raw = String(currentValue || "").trim().replace(/\s+/g, " ");
  const suggestion = String(suggestedStreet || "").trim();
  if (!suggestion) return currentValue;
  const m = /^(.*?)[\s,]+(\d+\s*[a-zA-Z]?(?:\s*[-/]\s*\d+\s*[a-zA-Z]?)?)\s*$/.exec(raw);
  const houseNumber = m && m[1].trim() ? m[2].replace(/\s+/g, "") : "";
  return houseNumber ? `${suggestion} ${houseNumber}` : suggestion;
}

// ── Fingerabdruck der geprüften Adresse ─────────────────────────────────────
// Der bestätigte Zustand gehört zu GENAU dieser Adresse. Ändert der Kunde danach Land,
// PLZ, Ort oder Straße, ist die frühere Bestätigung wertlos und muss verfallen — sonst
// stünde ein grüner Haken neben einer inzwischen anderen Adresse.
//
// Die Hausnummer ist bewusst NICHT Teil des Fingerabdrucks: sie wird ohnehin nie geprüft
// (der Anbieter führt keine vollständige Hausnummerndatenbank), und ein Verfall bei jedem
// Tippen in der Hausnummer wäre reine Schikane.
export function addressFingerprint({ country, postalCode, city, street }) {
  const norm = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  return [
    norm(country),
    norm(postalCode),
    norm(city),
    norm(streetSearchTerm(street)),
  ].join("|");
}

export function shouldInvalidateAddress(previousFingerprint, nextFingerprint) {
  return typeof previousFingerprint === "string" && previousFingerprint !== nextFingerprint;
}

// ── Auswertung der Serverantwort ────────────────────────────────────────────
// Alles, was nicht eindeutig ein bekannter Status ist, wird zu `unverified` — nie zu
// `invalid`. Eine kaputte oder unerwartete Antwort darf niemals als „Adresse falsch"
// beim Kunden ankommen.
export function readAddressResponse(body) {
  const b = body && typeof body === "object" ? body : {};
  const known = [
    ADDRESS_STATUS.CONFIRMED, ADDRESS_STATUS.INVALID,
    ADDRESS_STATUS.UNVERIFIED, ADDRESS_STATUS.UNAVAILABLE, ADDRESS_STATUS.UNSUPPORTED,
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
    // Wird vom Server immer als false geliefert. Hier defensiv erzwungen, damit auch eine
    // manipulierte oder veraltete Antwort die Oberfläche nicht dazu bringt, eine geprüfte
    // Hausnummer zu behaupten.
    houseNumberVerified: false,
  };
}

// ── Buchungs-/Preis-Gate ────────────────────────────────────────────────────
// NUR ein eindeutiger Widerspruch blockiert. `unverified` und `unavailable` sind
// ausdrücklich KEINE Blocker: eine Datenlücke oder ein Ausfall des Prüfdienstes darf
// einen realen Kunden nicht am Versand hindern.
export function addressBlocksSubmit(status) {
  return status === ADDRESS_STATUS.INVALID;
}

// Braucht der Zustand eine bewusste Bestätigung des Kunden, bevor es weitergeht?
// („Adresse trotzdem verwenden" — der Kunde entscheidet, nicht der Automat.)
export function addressNeedsAcknowledgement(status) {
  return status === ADDRESS_STATUS.UNVERIFIED || status === ADDRESS_STATUS.UNAVAILABLE;
}

// Der Ton der Statusanzeige: Erfolg, Fehler oder Hinweis.
export function addressStatusTone(status) {
  if (status === ADDRESS_STATUS.CONFIRMED) return "success";
  if (status === ADDRESS_STATUS.INVALID) return "error";
  if (status === ADDRESS_STATUS.UNVERIFIED || status === ADDRESS_STATUS.UNAVAILABLE) return "warning";
  return "neutral";
}

// Wird überhaupt etwas angezeigt? Bei `idle`, `unsupported` und im Ausgangszustand bleibt
// das Formular so ruhig wie bisher — die Funktion darf sich nicht aufdrängen.
export function showsAddressStatus(status) {
  return status === ADDRESS_STATUS.CONFIRMED || status === ADDRESS_STATUS.INVALID
      || status === ADDRESS_STATUS.UNVERIFIED || status === ADDRESS_STATUS.UNAVAILABLE
      || status === ADDRESS_STATUS.CHECKING;
}
