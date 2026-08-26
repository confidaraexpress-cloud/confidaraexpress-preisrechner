// ─────────────────────────────────────────────────────────────────────────────
// Zentrale Normalisierung von API- und Netzwerkfehlern.
//
// Problem, das dieses Modul löst: Die Aufrufer lasen bisher jeweils EIN Feld der
// Serverantwort (meist `d.error`) und ersetzten alles andere durch einen
// Sammeltext. Der providerneutrale PLZ-422 des Backends trägt aber `message`,
// `code`, `field` und `example` — und GAR KEIN `error`. Dadurch fiel eine
// vollständig erklärte Serverantwort auf „Fehler bei Preisberechnung" zurück und
// Kunde wie Support sahen weder Feld noch Ursache.
//
// Dieses Modul liest deshalb ALLE bekannten Antwortformen und liefert ein
// einheitliches internes Format:
//
//   { code, type, title, message, fieldMessage, field, retryable }
//
//   code         stabiler Maschinenschlüssel (z. B. INVALID_POSTAL_CODE_FORMAT)
//   type         validation | business | auth | rate_limit | network | technical
//   title        kurze Überschrift für Banner/Zusammenfassung
//   message      vollständige Erklärung für den Kunden
//   fieldMessage kurze Korrekturanweisung direkt unter dem Feld (oder null)
//   field        FRONTEND-Feldschlüssel (bereits gemappt) oder null
//   retryable    ob ein erneuter Versuch überhaupt Sinn ergibt
//
// Framework-frei (.mjs wie postalCode.mjs/bookingGate.mjs), damit die Logik ohne
// DOM testbar bleibt. Enthält KEINE technischen Interna: Stacktraces,
// Datenbank- und Carrier-Rohmeldungen erreichen den Kunden nie.
// ─────────────────────────────────────────────────────────────────────────────

export const ERROR_TYPE = {
  VALIDATION: "validation",
  BUSINESS: "business",
  AUTH: "auth",
  RATE_LIMIT: "rate_limit",
  NETWORK: "network",
  TECHNICAL: "technical",
};

// Sicherer Auffangtext — bewusst ohne technische Details, mit Supporthinweis.
export const GENERIC_FALLBACK = {
  code: "UNKNOWN_ERROR",
  type: ERROR_TYPE.TECHNICAL,
  title: "Anfrage nicht verarbeitet",
  message: "Die Anfrage konnte aufgrund eines technischen Problems nicht verarbeitet werden. Bitte versuchen Sie es erneut. Sollte der Fehler weiterhin auftreten, kontaktieren Sie den Support.",
  fieldMessage: null,
  field: null,
  retryable: true,
};

// ── Bekannte Fehlercodes ────────────────────────────────────────────────────
// Nur Codes, die das Backend tatsächlich sendet (bestehende) oder die mit diesem
// Paket ergänzt wurden. Ein unbekannter Code fällt NICHT auf diese Tabelle
// zurück, sondern wird über den HTTP-Status eingeordnet — so kann eine neue
// Serverantwort nie stillschweigend als „gültig behandelt" gelten.
const CODE_MAP = {
  // ── Postleitzahl (Backend sendet diese beiden bereits produktiv) ──
  POSTAL_CODE_REQUIRED: {
    type: ERROR_TYPE.VALIDATION, title: "Postleitzahl fehlt", retryable: false,
  },
  INVALID_POSTAL_CODE_FORMAT: {
    type: ERROR_TYPE.VALIDATION, title: "Postleitzahl prüfen", retryable: false,
  },

  // ── Paketdaten / Route (mit diesem Paket im Backend ergänzt) ──
  WEIGHT_REQUIRED:      { type: ERROR_TYPE.VALIDATION, title: "Gewicht fehlt", retryable: false,
    message: "Bitte geben Sie das Gewicht des Pakets ein.", fieldMessage: "Bitte geben Sie das Gewicht des Pakets ein." },
  WEIGHT_INVALID:       { type: ERROR_TYPE.VALIDATION, title: "Gewicht prüfen", retryable: false,
    message: "Das Gewicht muss größer als 0 kg sein und darf 1.000 kg nicht überschreiten.", fieldMessage: "Das Gewicht muss größer als 0 kg sein (max. 1.000 kg)." },
  DIMENSION_INVALID:    { type: ERROR_TYPE.VALIDATION, title: "Maße prüfen", retryable: false,
    message: "Länge, Breite und Höhe müssen jeweils zwischen 0,1 und 300 cm liegen.", fieldMessage: "Wert muss zwischen 0,1 und 300 cm liegen." },
  DIMENSIONS_INCOMPLETE:{ type: ERROR_TYPE.VALIDATION, title: "Maße unvollständig", retryable: false,
    message: "Bitte geben Sie Länge, Breite und Höhe vollständig ein.", fieldMessage: "Bitte vollständig ausfüllen." },
  PACKAGE_COUNT_INVALID:{ type: ERROR_TYPE.VALIDATION, title: "Paketanzahl prüfen", retryable: false,
    message: "Die Paketanzahl muss zwischen 1 und 99 liegen.", fieldMessage: "Zwischen 1 und 99." },
  COUNTRY_INVALID:      { type: ERROR_TYPE.VALIDATION, title: "Land prüfen", retryable: false,
    message: "Bitte wählen Sie ein gültiges Land aus.", fieldMessage: "Bitte wählen Sie ein Land aus." },
  SHIPPING_DATE_INVALID:{ type: ERROR_TYPE.VALIDATION, title: "Versanddatum prüfen", retryable: false,
    message: "Das Versanddatum ist ungültig. Bitte wählen Sie ein Datum im Format TT.MM.JJJJ.", fieldMessage: "Bitte ein gültiges Datum wählen." },
  SHIPPING_DATE_IN_PAST:{ type: ERROR_TYPE.VALIDATION, title: "Versanddatum prüfen", retryable: false,
    message: "Das Versanddatum darf nicht in der Vergangenheit liegen. Bitte wählen Sie den heutigen oder einen späteren Tag.", fieldMessage: "Bitte heutigen oder späteren Tag wählen." },
  ADDRESS_INCOMPLETE_FOR_COUNTRY: { type: ERROR_TYPE.VALIDATION, title: "Adresse unvollständig", retryable: false,
    message: "Für das gewählte Land sind Postleitzahl und Stadt erforderlich.", fieldMessage: "Für dieses Land erforderlich." },
  SERVICE_FILTER_INVALID:   { type: ERROR_TYPE.VALIDATION, title: "Versandart prüfen", retryable: false,
    message: "Die gewählte Versandart wird nicht unterstützt. Bitte wählen Sie eine andere Versandart." },
  SHIPPING_MODE_INVALID:    { type: ERROR_TYPE.VALIDATION, title: "Versandart prüfen", retryable: false,
    message: "Der gewählte Versandmodus wird nicht unterstützt. Bitte wählen Sie einen anderen Modus." },

  // ── Geschäftsfälle: kein Serverfehler, sondern ein erklärbares Ergebnis ──
  NO_RATES_FOUND: {
    type: ERROR_TYPE.BUSINESS, title: "Keine Angebote gefunden", retryable: false,
    message: "Für diese Angaben wurden keine Versandangebote gefunden. Bitte prüfen Sie Versandroute, Versanddatum und Paketdaten.",
  },
  ROUTE_NOT_SUPPORTED: {
    type: ERROR_TYPE.BUSINESS, title: "Versandroute nicht verfügbar", retryable: false,
    message: "Für diese Versandroute sind momentan keine Angebote verfügbar. Bitte prüfen Sie Versanddatum, Paketdaten oder Versandart.",
  },
  ACCOUNT_NOT_CONFIGURED: {
    type: ERROR_TYPE.BUSINESS, title: "Konto nicht freigeschaltet", retryable: false,
    message: "Ihr Konto ist für die Preisberechnung noch nicht vollständig freigeschaltet. Bitte kontaktieren Sie den Support.",
  },

  // ── Entwurfsübergang (Backend sendet diese bereits produktiv) ──
  FORM_DRAFT_NOT_FOUND: { type: ERROR_TYPE.BUSINESS, title: "Entwurf nicht gefunden", retryable: false,
    message: "Dieser Entwurf ist nicht mehr vorhanden. Ihre Eingaben bleiben erhalten — Sie können die Angebote normal neu berechnen." },
  FORM_DRAFT_CONFLICT: { type: ERROR_TYPE.BUSINESS, title: "Entwurf wurde geändert", retryable: false,
    message: "Der Entwurf wurde zwischenzeitlich an anderer Stelle geändert. Bitte laden Sie die aktuelle Version, bevor Sie fortfahren." },
  FORM_DRAFT_CONVERSION_IN_PROGRESS: { type: ERROR_TYPE.BUSINESS, title: "Entwurf wird verarbeitet", retryable: true,
    message: "Dieser Entwurf wird gerade verarbeitet. Bitte versuchen Sie es in einem Moment erneut." },

  PICKUP_WINDOW_CHANGED: { type: ERROR_TYPE.BUSINESS, title: "Abholzeitfenster geändert", retryable: false,
    message: "Das Abholzeitfenster hat sich geändert. Bitte prüfen Sie die Angaben und bestätigen Sie erneut." },
};

// ── HTTP-Status → Einordnung, wenn KEIN bekannter Code vorliegt ──────────────
function fromStatus(status, serverText) {
  if (status === 401 || status === 403) {
    return { code: "SESSION_EXPIRED", type: ERROR_TYPE.AUTH, title: "Sitzung abgelaufen", retryable: false,
      message: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an." };
  }
  if (status === 404) {
    return { code: "NOT_FOUND", type: ERROR_TYPE.BUSINESS, title: "Nicht gefunden", retryable: false,
      message: "Der aufgerufene Vorgang ist nicht mehr vorhanden. Bitte laden Sie die Seite neu." };
  }
  if (status === 409) {
    return { code: "CONFLICT", type: ERROR_TYPE.BUSINESS, title: "Vorgang bereits verändert", retryable: false,
      message: serverText || "Dieser Vorgang wurde zwischenzeitlich verändert. Bitte laden Sie die aktuellen Daten und versuchen Sie es erneut." };
  }
  if (status === 429) {
    return { code: "RATE_LIMITED", type: ERROR_TYPE.RATE_LIMIT, title: "Zu viele Anfragen", retryable: true,
      message: "Es wurden zu viele Anfragen in kurzer Zeit gestellt. Bitte warten Sie einen Moment und versuchen Sie es erneut." };
  }
  if (status === 408 || status === 504) {
    return { code: "TIMEOUT", type: ERROR_TYPE.TECHNICAL, title: "Zeitüberschreitung", retryable: true,
      message: "Die Anfrage dauert länger als erwartet. Bitte versuchen Sie es erneut." };
  }
  if (status === 502 || status === 503) {
    return { code: "SERVICE_UNAVAILABLE", type: ERROR_TYPE.TECHNICAL, title: "Dienst vorübergehend nicht erreichbar", retryable: true,
      message: "Der Dienst ist momentan nicht erreichbar. Bitte versuchen Sie es in Kürze erneut." };
  }
  if (status >= 500) {
    return { code: "SERVER_ERROR", type: ERROR_TYPE.TECHNICAL, title: "Technisches Problem", retryable: true,
      message: "Die Anfrage konnte aufgrund eines technischen Problems nicht verarbeitet werden. Bitte versuchen Sie es erneut. Sollte der Fehler weiterhin auftreten, kontaktieren Sie den Support." };
  }
  // 400/422 ohne Code: der Servertext ist die einzige verwertbare Information.
  // Er wird übernommen, weil das Backend hier fachliche Klartexte liefert —
  // aber als Validierung eingeordnet, damit die UI ihn nicht als Systemfehler
  // darstellt.
  if (status === 400 || status === 422) {
    return { code: "VALIDATION_FAILED", type: ERROR_TYPE.VALIDATION, title: "Angaben prüfen", retryable: false,
      message: serverText || "Bitte prüfen Sie Ihre Angaben." };
  }
  return null;
}

// Backend-Feldpfad → Frontend-Feldschlüssel. Ohne Treffer: null (der Fehler wird
// dann global gezeigt, statt an einem falschen Feld zu kleben).
export function mapServerField(serverField, fieldMap) {
  if (!serverField || !fieldMap) return null;
  const key = String(serverField).trim();
  if (Object.prototype.hasOwnProperty.call(fieldMap, key)) return fieldMap[key];
  // Auch den letzten Pfadabschnitt versuchen (z. B. "recipient.postalCode" →
  // "postalCode"), falls der Aufrufer nur Kurzschlüssel pflegt.
  const short = key.includes(".") ? key.slice(key.lastIndexOf(".") + 1) : null;
  if (short && Object.prototype.hasOwnProperty.call(fieldMap, short)) return fieldMap[short];
  return null;
}

const isText = (v) => typeof v === "string" && v.trim() !== "";

// ── Hauptfunktion ───────────────────────────────────────────────────────────
// normalizeApiError({ status, body, fieldMap })
//   status   HTTP-Status der Antwort
//   body     bereits geparster JSON-Body (oder null bei nicht lesbarem Body)
//   fieldMap { "recipient.postalCode": "to_zip", … } — optional
export function normalizeApiError({ status, body, fieldMap } = {}) {
  const d = body && typeof body === "object" ? body : {};
  // Beide historischen Formen lesen: `error` (Mehrheit der Routen) UND `message`
  // (providerneutraler 422). Genau hier ging die konkrete Meldung bisher verloren.
  const serverText = isText(d.error) ? d.error.trim() : (isText(d.message) ? d.message.trim() : null);
  const code = isText(d.code) ? d.code.trim() : null;
  const field = mapServerField(d.field, fieldMap);

  const known = code && CODE_MAP[code] ? CODE_MAP[code] : null;
  if (known) {
    return {
      code,
      type: known.type,
      title: known.title,
      // Reihenfolge bewusst: eigener kuratierter Text vor Servertext. Der
      // Servertext ist für Entwickler formuliert („weight: Pflichtfeld…"),
      // der kuratierte für Kundinnen und Kunden.
      message: known.message || serverText || GENERIC_FALLBACK.message,
      fieldMessage: known.fieldMessage || null,
      field,
      retryable: known.retryable === true,
    };
  }

  const byStatus = fromStatus(status, serverText);
  if (byStatus) return { ...byStatus, fieldMessage: null, field };

  // Unbekannter Status UND unbekannter Code → sicherer Auffangtext.
  return { ...GENERIC_FALLBACK, field };
}

// ── Geworfene Fehler (kein HTTP-Ergebnis) ───────────────────────────────────
// fetch wirft bei Netzwerkabbruch einen TypeError, bei Abbruch einen AbortError,
// und r.json() wirft bei nicht-JSON-Antworten. Diese Fälle sahen bisher wie
// Eingabefehler aus („Failed to fetch" im roten Banner).
export function normalizeThrownError(e) {
  if (e && (e.name === "AbortError" || e.code === 20)) {
    return { code: "ABORTED", type: ERROR_TYPE.NETWORK, title: "Abgebrochen", retryable: true,
      message: "Die Anfrage wurde abgebrochen.", fieldMessage: null, field: null };
  }
  // "TimeoutError" wäre AbortSignal.timeout(); "ApiTimeoutError" ist das zentrale
  // apiFetch-Zeitlimit (api/client.js, Phase 1 Betriebsreife) — beide bedeuten
  // dasselbe: UNSER Limit hat abgebrochen, kein Abbruch des Aufrufers.
  if (e && (e.name === "TimeoutError" || e.name === "ApiTimeoutError")) {
    return { code: "TIMEOUT", type: ERROR_TYPE.TECHNICAL, title: "Zeitüberschreitung", retryable: true,
      message: "Die Anfrage dauert länger als erwartet. Bitte versuchen Sie es erneut.", fieldMessage: null, field: null };
  }
  // Klassischer Offline-/Verbindungsabbruch.
  if (e instanceof TypeError || (e && /fetch|network|Failed to fetch|NetworkError/i.test(String(e.message || "")))) {
    return { code: "NETWORK_ERROR", type: ERROR_TYPE.NETWORK, title: "Verbindung unterbrochen", retryable: true,
      message: "Die Verbindung zum Server wurde unterbrochen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
      fieldMessage: null, field: null };
  }
  return { ...GENERIC_FALLBACK };
}

// ── Bequemlichkeit: Response → normalisierter Fehler ────────────────────────
// Liest den Body defensiv (auch leere oder nicht-JSON-Antworten) und normalisiert.
export async function errorFromResponse(response, { fieldMap } = {}) {
  let body = null;
  try { body = await response.json(); } catch { /* leer / kein JSON → Status entscheidet */ }
  return normalizeApiError({ status: response.status, body, fieldMap });
}

// Zusammenfassungstext über dem Aktionsbutton.
export function summaryMessage(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  if (n === 1) return "Bitte prüfen Sie die markierte Angabe.";
  return `Bitte korrigieren Sie die ${n} markierten Angaben.`;
}
