// utils/legalBookingView.mjs — Auswertung der Legal-Buchungsschranke (Go-Live Paket 4-B).
//
// REIN: kein React, kein Netz, kein Storage. Hier steht, was eine Serverantwort bedeutet und
// was daraus für den Checkout folgt — die Komponente rendert es nur.
//
// Der Server ist die einzige Autorität. Es gibt hier keine Dokumentliste, keine Version, keinen
// Schalter und keine Ersatzfassung: Was gilt, sagt `GET /api/legal/booking-context`.

// ZWEI Listen, wie serverseitig auch — der Unterschied ist tragend.
//
// REQUIRED   was ein heute gültiges Set enthalten MUSS: AGB und Datenschutzerklärung. Fehlt
//            einer davon, ist der Kontext unbrauchbar — eine Bestellung mit halbem
//            Legal-Kontext gibt es nicht.
// SUPPORTED  was überhaupt vorkommen KANN, inklusive der ausgelaufenen
//            B2B-Vertragsinformationen. Sie bestimmt allein die ANZEIGEreihenfolge: liefert
//            der Server für ein historisches Set noch eine solche Fassung, wird sie an ihrer
//            Stelle mit angezeigt statt stillschweigend verschluckt.
//
// Neue Sets tragen sie nicht mehr. Deshalb erscheint sie im heutigen Checkout auch nicht —
// nicht, weil das Frontend sie ausblendet, sondern weil es sie nicht mehr gibt.
export const LEGAL_REQUIRED_DOCUMENT_TYPES = Object.freeze(["terms", "privacy"]);
export const LEGAL_SUPPORTED_DOCUMENT_TYPES =
  Object.freeze(["terms", "privacy", "b2b_contract_information"]);
export const LEGAL_TERMS_TYPE = "terms";

// Vier Zustände, mehr braucht der Checkout nicht.
export const LEGAL_LOADING  = "loading";   // Antwort steht noch aus
export const LEGAL_DISABLED = "disabled";  // Schranke aus — heutiger Checkout, unverändert
export const LEGAL_READY    = "ready";     // Schranke an, vollständiges Set liegt vor
export const LEGAL_ERROR    = "error";     // Schranke an, aber nicht auslieferbar / Abruf gescheitert

export const LEGAL_ERROR_TEXT =
  "Die Vertragsunterlagen können derzeit nicht geladen werden. Bitte versuchen Sie es später erneut.";
export const LEGAL_SET_CHANGED_TEXT =
  "Die Vertragsunterlagen wurden aktualisiert. Bitte prüfen und bestätigen Sie die aktuelle Fassung erneut.";

export const legalLoadingContext = () => ({ state: LEGAL_LOADING, setKey: null, documents: [] });

/**
 * Wertet die Antwort von `GET /api/legal/booking-context` aus.
 *
 * Fail-closed in EINE Richtung, aber nicht in die andere: eine kaputte oder unlesbare Antwort
 * bei AKTIVER Schranke ergibt `error` (kein Buchen) — niemals `disabled`. Andernfalls würde ein
 * Serverfehler die Schranke stillschweigend abschalten, und genau das wäre der Fail-Open-Fall,
 * den das ganze Paket verhindern soll.
 *
 * `enabled:false` ist dagegen eine gültige, vollständige Aussage und braucht nichts weiter.
 */
export function parseBookingContext(status, body) {
  if (status === 200 && body && body.enabled === false) {
    return { state: LEGAL_DISABLED, setKey: null, documents: [] };
  }
  if (status === 200 && body && body.enabled === true) {
    const setKey = typeof body.setKey === "string" ? body.setKey.trim() : "";
    const documents = Array.isArray(body.documents) ? body.documents : [];
    // Vollständigkeit wird hier NICHT nachgerechnet, sondern nur festgestellt: der Server hat
    // bereits aufgelöst, geprüft und die Integrität der Dateien bestätigt. Diese Prüfung fängt
    // eine strukturell unbrauchbare Antwort ab, sie ersetzt die serverseitige nicht.
    const typen = documents.map((d) => d && d.type);
    const vollstaendig = LEGAL_REQUIRED_DOCUMENT_TYPES.every((t) => typen.includes(t));
    const brauchbar = documents.every((d) => d && typeof d.url === "string" && d.url && d.version);
    if (!setKey || !vollstaendig || !brauchbar) {
      return { state: LEGAL_ERROR, setKey: null, documents: [] };
    }
    // Feste Reihenfolge — unabhängig davon, wie der Server sortiert hat. Geordnet nach
    // SUPPORTED, damit ein historisches Set nichts verliert; `filter(Boolean)` entfernt die
    // Typen, die es in diesem Set gar nicht gibt (bei einem neuen Set die B2B-Fassung).
    const sortiert = LEGAL_SUPPORTED_DOCUMENT_TYPES
      .map((t) => documents.find((d) => d.type === t))
      .filter(Boolean);
    return { state: LEGAL_READY, setKey, documents: sortiert };
  }
  return { state: LEGAL_ERROR, setKey: null, documents: [] };
}

// Das terms-Dokument — Ziel BEIDER Bestätigungen. Die zweite Checkbox verweist bewusst auf
// dieselbe versionierte Fassung: der bisherige Link `/agb#paragraf-8` zeigt auf die jeweils
// AKTUELLE Webseite und könnte damit etwas anderes anzeigen als die Fassung, der zugestimmt
// wird. Ein Nachweis, der auf einen beweglichen Text zeigt, ist kein Nachweis.
export function legalTermsDocument(ctx) {
  if (!ctx || ctx.state !== LEGAL_READY) return null;
  return ctx.documents.find((d) => d.type === LEGAL_TERMS_TYPE) || null;
}

// Blockiert die Schranke die Bestellung? Ausschließlich bei `loading` und `error` — bei
// `disabled` und `ready` entscheidet allein der bestehende Buchungs-Gate-Vertrag weiter.
export function legalGateBlocks(ctx) {
  const state = ctx && ctx.state;
  return state === LEGAL_LOADING || state === LEGAL_ERROR;
}

// Sichtbarer Fehler im Bestätigungsbereich — nur im Fehlerfall, nie beim Laden.
export function legalGateError(ctx) {
  return ctx && ctx.state === LEGAL_ERROR ? LEGAL_ERROR_TEXT : null;
}

/**
 * Die Legal-Felder des `/book`-Payloads.
 *
 * NUR bei aktiver Schranke. Ist sie aus, entsteht ein LEERES Objekt — es werden dann bewusst
 * keine Felder mitgeschickt: der Server ignorierte sie ohnehin, und ein mitgesendeter
 * `termsAccepted: true` würde fälschlich nahelegen, es sei ein Nachweis entstanden.
 *
 * Gesendet wird ausschließlich, was der Server verlangt: der gesehene Schlüssel und die beiden
 * Bestätigungen als echte Booleans. Kein `acceptedAt`, keine Version, keine Dokument-ID — der
 * Server bestimmt Zeitpunkt und Fassung selbst und würde einen Clientwert ohnehin verwerfen.
 */
export function legalBookingPayload(ctx, { agbAccepted, prohibitedGoodsAccepted } = {}) {
  if (!ctx || ctx.state !== LEGAL_READY || !ctx.setKey) return {};
  return {
    legalSetKey: ctx.setKey,
    termsAccepted: agbAccepted === true,
    prohibitedGoodsAccepted: prohibitedGoodsAccepted === true,
  };
}

// Erkennt den Fassungswechsel aus der `/book`-Antwort.
export function isLegalSetChanged(status, body) {
  return status === 409 && !!body && body.code === "LEGAL_SET_CHANGED";
}

// Hat sich das gültige Set gegenüber dem zuletzt gesehenen geändert? Dann verfallen beide
// Bestätigungen: eine Zustimmung zu Fassung A ist keine Zustimmung zu Fassung B. Das gilt
// unabhängig vom 409-Fall — auch ein stiller Wechsel während offener Seite zählt.
export function legalSetChangedBetween(vorher, nachher) {
  const a = vorher && vorher.setKey ? vorher.setKey : null;
  const b = nachher && nachher.setKey ? nachher.setKey : null;
  if (!a || !b) return false;
  return a !== b;
}
