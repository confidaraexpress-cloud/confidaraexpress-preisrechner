// ─────────────────────────────────────────────────────────────────────────────
// Individueller Kundenaufschlag (Adminbereich) — reine, framework-freie Logik.
//
// Bündelt alles, was an der Aufschlags-Oberfläche testbar ist: Prozent-Eingabe
// normalisieren, Anzeige nach de-DE formatieren, Bestätigungsstatus ableiten,
// Freischaltung fachlich vor-prüfen und Backend-Fehler in verständliche deutsche
// Texte übersetzen. Kein React, kein Netzwerk, kein State.
//
// PROZENTVERTRAG (Backend) — die wichtigste Regel dieses Moduls:
//     20    = 20 %
//     17.5  = 17,5 %
//     0.20  = 0,20 %   ← NICHT 20 %
// Es wird ausschließlich ein Prozentwert übertragen. Es gibt hier keinen Faktor,
// keinen Multiplikator und keine Umrechnung — „0,20" bleibt 0,20 % und wird
// niemals zu 20 % umgedeutet.
//
// AUTORITÄT: Das Backend bleibt in allem verbindlich. Die Vorabprüfungen hier
// dienen der Bedienbarkeit (keine sinnlosen Requests, klare Hinweise) und sind
// ausdrücklich KEIN Sicherheitsersatz — das serverseitige Gate vor jeder echten
// Transition nach „approved" bleibt die maßgebliche Instanz.
// ─────────────────────────────────────────────────────────────────────────────

// Zulässiger Wertebereich und Genauigkeit (Backend-Vertrag).
export const MARKUP_MIN = 0;
export const MARKUP_MAX = 100;
export const MARKUP_MAX_DECIMALS = 2;

// Backend-Fehlercodes, die dieses Modul kennt. Keine erfundenen Codes.
export const CODE_INVALID_PERCENT = "INVALID_PRICE_MARKUP_PERCENT";
export const CODE_CONFIRMATION_REQUIRED = "PRICE_MARKUP_CONFIRMATION_REQUIRED";
// Eigener Code des Expressfelds — damit der Fehler am RICHTIGEN der beiden
// Prozentfelder erscheint und nicht pauschal am Standardfeld.
export const CODE_INVALID_EXPRESS_PERCENT = "INVALID_EXPRESS_MARKUP_PERCENT";

// ── Texte ───────────────────────────────────────────────────────────────────
// Deutsch, ohne interne Preisbegriffe (kein „Margin Rate"/„Multiplier"/
// „Supplier Net"/„Internal Pricing"): der Admin sieht ausschließlich den
// Kundenaufschlag, nie eine Rechenbasis.
export const MARKUP_TEXTS = Object.freeze({
  sectionTitle: "Individueller Kundenaufschlag",
  fieldLabel: "Kundenaufschlag",
  inputHelp:
    "Geben Sie den Prozentwert ein. Beispiel: 20 entspricht 20 %. "
    + "Ein Wert von 0,20 entspricht 0,20 %.",
  effectHint:
    "Der bestätigte Aufschlag gilt für zukünftige Preisberechnungen und Buchungen dieses Kunden. "
    + "Bereits abgeschlossene Buchungen und gestellte Rechnungen bleiben unverändert.",
  confirmRequired: "Vor der Freischaltung muss der Kundenaufschlag festgelegt und bestätigt werden.",
  approvalBlockedTitle: "Kundenaufschlag erforderlich",
  approvalBlockedText: "Vor der Freischaltung muss der individuelle Kundenaufschlag festgelegt und bestätigt werden.",
  approvalBlockedCta: "Aufschlag festlegen",
  reactivationRequired: "Zur Reaktivierung ist ein bestätigter Kundenaufschlag erforderlich.",
  legacyApproved: "Globaler Standardaufschlag aktiv",
  legacyApprovedText:
    "Für diesen bereits freigeschalteten Kunden gilt aktuell der globale Standardaufschlag. "
    + "Der Zugang bleibt bestehen. Eine individuelle Bestätigung ist vor einer späteren erneuten "
    + "Freischaltung erforderlich.",
  loadingPricing: "Kundenaufschlag wird geladen…",
  confirmedPrefix: "Bestätigter Kundenaufschlag",
  // ── Expressaufschlag ──────────────────────────────────────────────────────
  standardGroupTitle: "Standardaufschlag",
  standardGroupScope: "Gilt für Standard-, Economy- und alle übrigen Tarife.",
  expressGroupTitle: "Expressaufschlag",
  expressGroupScope: "Gilt nur für Tarife, die serverseitig eindeutig als Express eingestuft sind.",
  expressFieldLabel: "Expressaufschlag",
  expressOptional: "optional",
  expressInputHelp:
    "Leer lassen, wenn für Expresstarife derselbe Aufschlag gelten soll wie sonst. "
    + "Ein Wert von 0 bedeutet ausdrücklich 0 % — nicht \u201Enicht festgelegt\u201C.",
  expressFallbackAction: "Standardaufschlag verwenden",
  expressFallbackHint:
    "Ist kein eigener Expressaufschlag gesetzt, wird automatisch der Standardaufschlag verwendet. "
    + "Eine Änderung des Standardaufschlags verändert dann auch den Expresspreis.",
  expressNotSet: "Standardaufschlag verwenden",
  effectiveExpressPrefix: "Wirksamer Expressaufschlag",
  effectiveExpressViaFallback: "über den Standardaufschlag",
  effectiveExpressOwn: "eigener Expressaufschlag",
});

// Badge-Beschriftung: „Bestätigt" ausschließlich bei confirmed === true.
// Der gespeicherte Standardwert (z. B. 20.00) ist ohne Bestätigung KEIN
// individuell bestätigter Aufschlag und wird auch nicht so dargestellt.
export const BADGE_CONFIRMED = "Bestätigt";
export const BADGE_UNCONFIRMED = "Noch nicht bestätigt";

// ── Response lesen ──────────────────────────────────────────────────────────
// GET /admin/users/:id/price-markup liefert exakt:
//   { userId, priceMarkupPercent, confirmed, confirmedAt, confirmedBy, updatedAt }
// Es werden AUSSCHLIESSLICH diese Felder übernommen. Alles andere (auch wenn das
// Backend es je mitschickte) kann damit gar nicht erst im DOM landen — keine
// internen Preisquellen, keine Lieferantenwerte, keine Tokens.
const PRICE_MARKUP_FIELDS = Object.freeze([
  "userId", "priceMarkupPercent",
  // Expressaufschlag: Rohwert (null = nicht festgelegt), der vom SERVER berechnete
  // wirksame Wert und der Fallbackstatus. Der wirksame Wert wird bewusst NICHT im
  // Frontend hergeleitet — sonst gäbe es zwei Wahrheiten über denselben Preis.
  "expressPriceMarkupPercent", "effectiveExpressPriceMarkupPercent", "expressMarkupUsesFallback",
  "confirmed", "confirmedAt", "confirmedBy", "updatedAt",
]);

const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const strOrNull = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

// → normalisiertes Objekt oder null (kein verwertbarer Body).
// `confirmed` ist fail-closed: alles außer exakt true gilt als „nicht bestätigt".
export function selectPriceMarkup(payload) {
  let raw = payload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  // Nur die im Vertrag belegten Hüllen werden entpackt — kein Raten.
  if (raw.priceMarkup && typeof raw.priceMarkup === "object") raw = raw.priceMarkup;
  else if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) raw = raw.data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  return {
    userId: numOrNull(raw.userId) ?? strOrNull(raw.userId),
    priceMarkupPercent: numOrNull(raw.priceMarkupPercent),
    // null bedeutet ausdrücklich \u201Enicht festgelegt\u201C — niemals 0 %.
    expressPriceMarkupPercent: numOrNull(raw.expressPriceMarkupPercent),
    // Fällt der Server (Altstand) diese Felder nicht mit, wird der Fallback aus dem
    // Rohwert abgeleitet — das ist dieselbe Regel, die der Server anwendet.
    effectiveExpressPriceMarkupPercent:
      numOrNull(raw.effectiveExpressPriceMarkupPercent)
      ?? numOrNull(raw.expressPriceMarkupPercent)
      ?? numOrNull(raw.priceMarkupPercent),
    expressMarkupUsesFallback:
      typeof raw.expressMarkupUsesFallback === "boolean"
        ? raw.expressMarkupUsesFallback
        : numOrNull(raw.expressPriceMarkupPercent) === null,
    confirmed: raw.confirmed === true,
    confirmedAt: strOrNull(raw.confirmedAt),
    confirmedBy: numOrNull(raw.confirmedBy) ?? strOrNull(raw.confirmedBy),
    updatedAt: strOrNull(raw.updatedAt),
  };
}

// Die Feldliste ist Teil des Vertrags — exportiert, damit Tests sie prüfen können.
export const priceMarkupFields = () => [...PRICE_MARKUP_FIELDS];

// Ist ein individueller Aufschlag bestätigt? Einzige Quelle: `confirmed`.
export const isMarkupConfirmed = (pricing) => !!pricing && pricing.confirmed === true;

// [badge-Klasse, Label] — konsistent mit userStatusMeta/candidateStatusMeta.
// Der Status wird zusätzlich im Text getragen, nie nur über Farbe.
export function markupBadge(pricing) {
  return isMarkupConfirmed(pricing)
    ? ["badge-green", BADGE_CONFIRMED]
    : ["badge-yellow", BADGE_UNCONFIRMED];
}

// ── Anzeige (de-DE) ─────────────────────────────────────────────────────────

// 20 → „20,00 %" · 17.5 → „17,50 %" · 0.2 → „0,20 %". Nie „0.2 rate" o. Ä.
export function formatMarkupPercent(value) {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return "—";
  const num = n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${num} %`;
}

// ISO-Zeitstempel → „28.07.2026, 20:15 Uhr" (de-DE). Ungültig/leer → „—".
export function formatMarkupDateTime(value) {
  if (value === null || value === undefined || value === "") return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const s = d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return `${s} Uhr`;
}

// Bestätigender Admin — nur die technische Kennung, keine Kontaktdaten.
export function formatConfirmedBy(value) {
  const n = Number(value);
  if (value === null || value === undefined || value === "") return "—";
  if (Number.isFinite(n)) return `Admin #${n}`;
  return String(value);
}

// Vorbelegung des Eingabefelds aus dem gespeicherten Wert — in deutscher
// Schreibweise, damit die Anzeige und das Feld dieselbe Sprache sprechen.
// Wichtig: 0.2 → „0,20" (parst wieder zu 0,2 % — nie zu 20 %).
export function markupInputValue(percent) {
  const n = Number(percent);
  if (percent === null || percent === undefined || percent === "" || !Number.isFinite(n)) return "";
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Eingabe normalisieren ───────────────────────────────────────────────────
// Erlaubt: reine Dezimalzahl mit Punkt ODER Komma als Trennzeichen.
// Nicht erlaubt: Vorzeichen, Exponentialschreibweise, Tausendertrennzeichen,
// Einheiten („20 %", „20 Prozent"), mehr als zwei Nachkommastellen.
const NUMERIC = /^\d+(?:[.,]\d+)?$/;

export const MARKUP_INPUT_ERRORS = Object.freeze({
  empty: "Bitte geben Sie den Kundenaufschlag in Prozent an.",
  format: "Bitte geben Sie eine Zahl ein — zum Beispiel 20 oder 17,5.",
  range: `Der Kundenaufschlag muss zwischen ${MARKUP_MIN} und ${MARKUP_MAX} Prozent liegen.`,
  decimals: "Bitte höchstens zwei Nachkommastellen angeben.",
});

const fail = (code) => ({ ok: false, value: null, code, error: MARKUP_INPUT_ERRORS[code] });

// → { ok:true, value:<Number>, code:null, error:null }
//   { ok:false, value:null, code:"empty"|"format"|"range"|"decimals", error:<Text> }
// Es wird NIE still gerundet: drei Nachkommastellen sind ein Fehler, keine
// Korrektur. Und es wird NIE umgedeutet: „0,20" ergibt 0.2, nicht 20.
export function parseMarkupInput(raw) {
  let s;
  if (typeof raw === "number") s = Number.isFinite(raw) ? String(raw) : "";
  else if (typeof raw === "string") s = raw.trim();
  else s = "";

  if (s === "") return fail("empty");
  // Vorzeichen ist nie zulässig. „-5" ist fachlich ein Bereichsfehler (negativ),
  // „+5"/„-abc" bleiben ein Formatfehler.
  if (/^[-+]/.test(s)) return fail(s.startsWith("-") && NUMERIC.test(s.slice(1)) ? "range" : "format");
  if (!NUMERIC.test(s)) return fail("format");

  const dot = s.replace(",", ".");
  const decimals = dot.includes(".") ? dot.split(".")[1].length : 0;
  if (decimals > MARKUP_MAX_DECIMALS) return fail("decimals");

  const value = Number(dot);
  if (!Number.isFinite(value)) return fail("format");
  if (value < MARKUP_MIN || value > MARKUP_MAX) return fail("range");

  return { ok: true, value, code: null, error: null };
}

// Ist der aktuelle Eingabewert absendbar? Steuert direkt den Button-Disabled-State.
export const canSubmitMarkup = (raw) => parseMarkupInput(raw).ok;

// Unterscheidet sich die Eingabe vom gespeicherten, bereits bestätigten Wert?
// Ohne Bestätigung ist jede gültige Eingabe eine echte Aktion (die Bestätigung
// selbst). Mit Bestätigung ist der unveränderte Wert KEINE Änderung — dafür wird
// bewusst kein Request abgesetzt.
export function markupHasChange(pricing, raw) {
  const parsed = parseMarkupInput(raw);
  if (!parsed.ok) return false;
  if (!isMarkupConfirmed(pricing)) return true;
  const stored = Number(pricing.priceMarkupPercent);
  if (!Number.isFinite(stored)) return true;
  // Auf zwei Nachkommastellen vergleichen — genau die zulässige Genauigkeit.
  return Math.round(parsed.value * 100) !== Math.round(stored * 100);
}

// Absendbar = gültig UND (noch nicht bestätigt ODER tatsächlich geändert).
export const canSaveMarkup = (pricing, raw) => parseMarkupInput(raw).ok && markupHasChange(pricing, raw);

export const NO_CHANGE_HINT = "Der Wert entspricht dem bereits bestätigten Aufschlag — es ist keine Änderung nötig.";

// ── Expressaufschlag: Eingabe, Anzeige, Änderungserkennung ──────────────────
// Der Expresswert ist OPTIONAL. Die Eingabe kennt deshalb genau zwei gültige
// Zustände, und sie sind nie mehrdeutig:
//   leer        → kein eigener Expressaufschlag → an das Backend geht null
//   Zahl 0…100  → dieser Wert (0 ist ein echter Aufschlag, kein „leer")
// Ein leerer String wird NIEMALS an das Backend gesendet — das Backend lehnt ihn
// ausdrücklich ab, damit „nicht ausgefüllt" und „löschen" unterscheidbar bleiben.
// → { ok:true, value:<Number|null>, cleared:<Boolean>, code:null, error:null }
//   { ok:false, value:null, cleared:false, code, error }
export function parseExpressMarkupInput(raw) {
  const s = typeof raw === "number" ? (Number.isFinite(raw) ? String(raw) : "")
          : typeof raw === "string" ? raw.trim()
          : raw === null || raw === undefined ? ""
          : "\u0000";  // nicht darstellbarer Typ → Formatfehler unten
  if (s === "") return { ok: true, value: null, cleared: true, code: null, error: null };
  const parsed = parseMarkupInput(s);
  if (!parsed.ok) return { ...parsed, cleared: false };
  return { ok: true, value: parsed.value, cleared: false, code: null, error: null };
}

// Eingabewert des Expressfelds aus dem gespeicherten Zustand: null → leeres Feld.
export const expressMarkupInputValue = (pricing) =>
  markupInputValue(pricing ? pricing.expressPriceMarkupPercent : null);

// Nutzt dieser Kunde den Fallback (kein eigener Expresssatz)?
export const expressUsesFallback = (pricing) =>
  !pricing || pricing.expressPriceMarkupPercent === null || pricing.expressPriceMarkupPercent === undefined;

// Anzeigezeile des hinterlegten Expresswerts — ohne technische Begriffe wie „null".
export const expressMarkupDisplay = (pricing) =>
  (expressUsesFallback(pricing)
    ? MARKUP_TEXTS.expressNotSet
    : formatMarkupPercent(pricing.expressPriceMarkupPercent));

// „Wirksamer Expressaufschlag: 20,00 % — über den Standardaufschlag"
// Der Prozentwert stammt aus dem SERVERFELD, nicht aus einer eigenen Rechnung.
export function effectiveExpressLine(pricing) {
  if (!pricing) return null;
  const eff = pricing.effectiveExpressPriceMarkupPercent;
  if (eff === null || eff === undefined) return null;
  const via = expressUsesFallback(pricing)
    ? MARKUP_TEXTS.effectiveExpressViaFallback
    : MARKUP_TEXTS.effectiveExpressOwn;
  return `${MARKUP_TEXTS.effectiveExpressPrefix}: ${formatMarkupPercent(eff)} — ${via}`;
}

// Hat sich der EXPRESSwert gegenüber dem gespeicherten Zustand geändert?
// Vergleicht auf zwei Nachkommastellen; „leer ↔ nicht gesetzt" ist keine Änderung.
export function expressMarkupHasChange(pricing, raw) {
  const parsed = parseExpressMarkupInput(raw);
  if (!parsed.ok) return false;
  // WICHTIG: null/undefined zuerst ausdrücklich prüfen. Number(null) ist 0 und wäre
  // eine endliche Zahl — „nicht festgelegt" würde dadurch zu „0 %" und jede
  // Formularanzeige als Änderung gelten.
  const stored = numOrNull(pricing ? pricing.expressPriceMarkupPercent : null);
  if (parsed.value === null) return stored !== null;
  if (stored === null) return true;
  return Math.round(parsed.value * 100) !== Math.round(stored * 100);
}

// Änderungserkennung über BEIDE Felder — steuert den Speichern-Button.
// Ohne Bestätigung ist jede gültige Eingabe eine echte Aktion (die Bestätigung selbst).
export function markupFormHasChange(pricing, standardRaw, expressRaw) {
  if (!parseMarkupInput(standardRaw).ok) return false;
  if (!parseExpressMarkupInput(expressRaw).ok) return false;
  if (!isMarkupConfirmed(pricing)) return true;
  return markupHasChange(pricing, standardRaw) || expressMarkupHasChange(pricing, expressRaw);
}

// Absendbar = beide Felder gültig UND (noch nicht bestätigt ODER tatsächlich geändert).
export const canSaveMarkupForm = (pricing, standardRaw, expressRaw) =>
  parseMarkupInput(standardRaw).ok
  && parseExpressMarkupInput(expressRaw).ok
  && markupFormHasChange(pricing, standardRaw, expressRaw);

// ── Request-Body ────────────────────────────────────────────────────────────
// PUT /admin/users/:id/price-markup — der Body enthält AUSSCHLIESSLICH
// { priceMarkupPercent }. Keine Auditfelder (confirmedAt/confirmedBy/updatedAt),
// kein Benutzerobjekt, keine userId (die steht im Pfad und stammt allein aus der
// aktuellen Adminroute), keine dynamischen Feldnamen.
export function buildPriceMarkupBody(percent, expressRaw) {
  const parsed = parseMarkupInput(percent);
  if (!parsed.ok) return null;
  // Ohne zweites Argument bleibt der Body exakt wie bisher — ein Aufrufer, der den
  // Expressaufschlag nicht kennt, LÖSCHT ihn dadurch nicht (das Backend lässt ein
  // fehlendes Feld unverändert).
  if (expressRaw === undefined) return { priceMarkupPercent: parsed.value };
  const express = parseExpressMarkupInput(expressRaw);
  if (!express.ok) return null;
  // express.value ist entweder eine Zahl oder null — niemals "" und niemals undefined.
  return { priceMarkupPercent: parsed.value, expressPriceMarkupPercent: express.value };
}

// ── Aktionsbeschriftung & Erfolgsmeldungen ──────────────────────────────────
// Die Aktion heißt nie nur „Speichern": sie ist eine ausdrückliche Bestätigung.
export const markupActionLabel = (pricing) =>
  (isMarkupConfirmed(pricing) ? "Aufschlag aktualisieren" : "Aufschlag bestätigen");

export const markupActionBusyLabel = (pricing) =>
  (isMarkupConfirmed(pricing) ? "Wird aktualisiert…" : "Wird bestätigt…");

export function markupSuccessMessage(wasConfirmedBefore) {
  return wasConfirmedBefore
    ? "Der Kundenaufschlag wurde aktualisiert. Die Änderung gilt für zukünftige Preisberechnungen und Buchungen."
    : "Der Kundenaufschlag wurde bestätigt.";
}

// ── Fehlerbehandlung ────────────────────────────────────────────────────────
// Keine technischen Details, keine rohen Backend-Bodies, keine Stacktraces.
export const MARKUP_SAVE_ERRORS = Object.freeze({
  400: "Der Kundenaufschlag muss zwischen 0 und 100 Prozent liegen und darf höchstens zwei Nachkommastellen besitzen.",
  404: "Der Kunde wurde nicht gefunden oder ist nicht mehr verfügbar.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Der Vorgang konnte nicht abgeschlossen werden. Es wurden keine Änderungen übernommen.",
  default: "Der Vorgang konnte nicht abgeschlossen werden. Es wurden keine Änderungen übernommen.",
  expressInvalid:
    "Der Expressaufschlag muss zwischen 0 und 100 Prozent liegen und darf höchstens zwei "
    + "Nachkommastellen besitzen. Zum Entfernen das Feld leer lassen.",
});

// → null bei 401/403 (zentrales Auth-Verhalten übernimmt: Logout/Redirect —
//   hier wird bewusst nichts angezeigt und keine neue Tokenlogik gebaut).
// → { field, text }: `field: true` heißt „direkt am Eingabefeld anzeigen".
export function markupSaveError(status, body) {
  if (status === 401 || status === 403) return null;
  const code = body && typeof body === "object" && typeof body.code === "string" ? body.code : null;
  // Eigener Code des Expressfelds → der Fehler erscheint am EXPRESSfeld, nicht am
  // Standardfeld. `target` benennt das betroffene Eingabefeld eindeutig.
  if (code === CODE_INVALID_EXPRESS_PERCENT) {
    return { field: true, target: "express", code, text: MARKUP_SAVE_ERRORS.expressInvalid };
  }
  if (status === 400 || code === CODE_INVALID_PERCENT) {
    return { field: true, target: "standard", code: code || CODE_INVALID_PERCENT, text: MARKUP_SAVE_ERRORS[400] };
  }
  return { field: false, code, text: MARKUP_SAVE_ERRORS[status] || MARKUP_SAVE_ERRORS.default };
}

// Fehlertexte des bestehenden Statusendpunkts (PATCH /admin/users/:id/status).
export const APPROVAL_ERRORS = Object.freeze({
  400: "Der gewünschte Status ist ungültig.",
  404: "Der Kunde wurde nicht gefunden oder ist nicht mehr verfügbar.",
  409: "Die Freischaltung wurde nicht durchgeführt. Bitte bestätigen Sie zuerst den Kundenaufschlag.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Der Vorgang konnte nicht abgeschlossen werden. Es wurden keine Änderungen übernommen.",
  default: "Der Vorgang konnte nicht abgeschlossen werden. Es wurden keine Änderungen übernommen.",
});

// → null bei 401/403 (zentrales Auth-Verhalten).
// → { text, reloadPricing }
// 409 kann trotz Frontendprüfung auftreten (parallele Änderung in einem anderen
// Tab). Nur beim Aufschlags-Gate (Code PRICE_MARKUP_CONFIRMATION_REQUIRED) werden
// die Pricing-Daten neu geladen; der bereits bestehende B2B-Guard (409 mit
// Klartext-`error`) behält sein bisheriges Verhalten unverändert.
export function approvalError(status, body) {
  if (status === 401 || status === 403) return null;
  const obj = body && typeof body === "object" ? body : {};
  const code = typeof obj.code === "string" ? obj.code : null;
  if (status === 409 && code === CODE_CONFIRMATION_REQUIRED) {
    return { text: APPROVAL_ERRORS[409], code, reloadPricing: true };
  }
  if (status === 409) {
    const serverText = typeof obj.error === "string" && obj.error.trim() ? obj.error.trim() : null;
    return { text: serverText || APPROVAL_ERRORS[409], code, reloadPricing: !serverText };
  }
  return { text: APPROVAL_ERRORS[status] || APPROVAL_ERRORS.default, code, reloadPricing: false };
}

// ── Freischaltungs-Gate (Bedienbarkeit, kein Sicherheitsersatz) ─────────────
// Verhindert Requests, von denen das Frontend sicher weiß, dass sie am
// serverseitigen Gate scheitern — und verhindert genauso, dass die Freischaltung
// als möglich erscheint, solange die Pricing-Daten nicht geladen sind.
//
// reason ∈
//   null                    → erlaubt
//   "not_approval"          → anderes Ziel (z. B. blockieren) — unverändert erlaubt
//   "already_approved"      → approved → approved ist ein No-op, kein Request
//   "anonymized"            → anonymisiertes Konto: keine Statusaktion im UI
//   "loading"               → Pricing-Daten werden noch geladen
//   "unknown"               → Pricing-Daten nicht lesbar → fail-closed
//   "confirmation_required" → Aufschlag noch nicht bestätigt
export function approvalGate({
  currentStatus,
  targetStatus = "approved",
  pricing = null,
  loading = false,
  error = false,
} = {}) {
  const reactivation = currentStatus === "blocked";
  const base = { reactivation, currentStatus, targetStatus };

  if (targetStatus !== "approved") return { ...base, allowed: true, reason: "not_approval" };
  if (currentStatus === "approved") return { ...base, allowed: false, reason: "already_approved" };
  if (currentStatus === "anonymized") return { ...base, allowed: false, reason: "anonymized" };
  if (loading) return { ...base, allowed: false, reason: "loading" };
  if (error || !pricing) return { ...base, allowed: false, reason: "unknown" };
  if (!isMarkupConfirmed(pricing)) return { ...base, allowed: false, reason: "confirmation_required" };
  return { ...base, allowed: true, reason: null };
}

// Erklärtext zum Gate — der Admin soll jederzeit wissen, was als Nächstes zu tun ist.
// → { title, text, cta } · cta === null heißt „keine Handlungsaufforderung".
export function approvalGateExplanation(gate) {
  const g = gate || {};
  switch (g.reason) {
    case "confirmation_required":
      return {
        title: MARKUP_TEXTS.approvalBlockedTitle,
        text: g.reactivation
          ? `${MARKUP_TEXTS.approvalBlockedText} ${MARKUP_TEXTS.reactivationRequired}`
          : MARKUP_TEXTS.approvalBlockedText,
        cta: MARKUP_TEXTS.approvalBlockedCta,
      };
    case "loading":
      return { title: "Kundenaufschlag wird geprüft", text: MARKUP_TEXTS.loadingPricing, cta: null };
    case "unknown":
      return {
        title: "Kundenaufschlag unbekannt",
        text: "Der Kundenaufschlag konnte nicht geladen werden. Bitte laden Sie die Daten erneut, "
          + "bevor Sie den Kunden freischalten.",
        cta: null,
      };
    case "already_approved":
      return { title: "Kunde ist bereits freigeschaltet", text: "Es ist keine Änderung erforderlich.", cta: null };
    case "anonymized":
      return {
        title: "Keine Statusänderung möglich",
        text: "Dieses Konto ist anonymisiert.",
        cta: null,
      };
    default:
      return { title: "", text: "", cta: null };
  }
}

// Bestätigter Aufschlag als Zeile für den Freischaltungsdialog:
// „Bestätigter Kundenaufschlag: 20,00 %". Ohne Bestätigung → null.
export function confirmedMarkupLine(pricing) {
  if (!isMarkupConfirmed(pricing)) return null;
  return `${MARKUP_TEXTS.confirmedPrefix}: ${formatMarkupPercent(pricing.priceMarkupPercent)}`;
}

// Bestandskunden: freigeschaltet, aber (noch) ohne individuell bestätigten
// Aufschlag. Sachliche Information, KEIN Warnzustand — der Zugang bleibt
// unverändert nutzbar, es gibt keinen Backfill und keine Zwangsbestätigung.
export function legacyApprovedNotice({ currentStatus, pricing, loading = false, error = false } = {}) {
  if (loading || error || !pricing) return { show: false, tone: "info", headline: "", text: "" };
  if (currentStatus !== "approved" || isMarkupConfirmed(pricing)) {
    return { show: false, tone: "info", headline: "", text: "" };
  }
  return {
    show: true,
    tone: "info",
    headline: MARKUP_TEXTS.legacyApproved,
    text: MARKUP_TEXTS.legacyApprovedText,
  };
}
