// ── Admin: öffentlicher Preisrechner — Anzeige, Eingabe, Bestätigung, Antwort (rein) ─
//
// /admin/public-calculator pflegt zwei Werte des Servers (public_calculator_settings):
//   • den globalen Besucheraufschlag (Prozent auf den Einkaufspreis netto, alle Services
//     inklusive Express) — Kundenaufschläge bleiben davon unberührt,
//   • den Schalter, ob preisrechner.confidaraexpress.de Preise berechnet.
// Jede Änderung trägt die zuletzt gelesene Revision; ein Konflikt (409) zeigt den
// aktuellen Stand und speichert nichts. Die Eingabe folgt derselben Prüfung wie jeder
// Kundenaufschlag (parseMarkupInput) — nur die Texte nennen diesen Aufschlag.

import { formatConfirmedBy, formatMarkupDateTime, formatMarkupPercent, markupInputValue, parseMarkupInput }
  from "./customerMarkup.mjs";

export const PUBLIC_CALC_ADMIN_TEXT = Object.freeze({
  title: "Öffentlicher Preisrechner",
  subtitle: "Preise ohne Anmeldung auf preisrechner.confidaraexpress.de. Änderungen wirken ab der nächsten Berechnung und werden protokolliert.",
  markupCard: "Aufschlag",
  markupLabel: "Neuer Aufschlag in Prozent",
  markupHint: "Zum Beispiel 25 oder 22,5 — höchstens zwei Nachkommastellen, zwischen 0 und 100.",
  markupScope: "Auf den Einkaufspreis netto, für alle Services inklusive Express. Kundenaufschläge bleiben unverändert.",
  markupSubmit: "Aufschlag ändern",
  markupUnchanged: "Der Wert entspricht dem aktuellen Aufschlag — es ist keine Änderung nötig.",
  availabilityCard: "Verfügbarkeit",
  enabled: "Eingeschaltet",
  disabled: "Ausgeschaltet",
  enabledText: "Besucher berechnen Preise ohne Anmeldung; jede Berechnung fragt die Versanddienstleister an.",
  disabledText: "Besucher sehen den Hinweis, dass der Preisrechner in Kürze verfügbar ist. Es werden keine Preise abgefragt.",
  switchOn: "Preisrechner einschalten",
  switchOff: "Preisrechner ausschalten",
  lastChange: "Letzte Änderung",
  current: "Aktueller Aufschlag",
  status: "Status",
  conflict: "Die Einstellungen wurden zwischenzeitlich geändert. Ihre Änderung wurde nicht gespeichert.",
  reload: "Aktuellen Stand laden",
  loadError: "Die Einstellungen konnten nicht geladen werden.",
  retry: "Erneut versuchen",
  saveError: "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  rateLimited: "Zu viele Änderungen in kurzer Zeit. Bitte versuchen Sie es in einigen Minuten erneut.",
});

const INPUT_TEXT = Object.freeze({
  empty: "Bitte geben Sie den Aufschlag in Prozent an.",
  format: "Bitte geben Sie eine Zahl ein — zum Beispiel 25 oder 22,5.",
  range: "Der Aufschlag muss zwischen 0 und 100 Prozent liegen.",
  decimals: "Bitte höchstens zwei Nachkommastellen angeben.",
});

/** Die Antwort von GET /admin/public-calculator/settings (oder `current` eines Konflikts) — sonst `null`. */
export function parsePublicCalculatorSettings(body) {
  const b = body && typeof body === "object" ? body : null;
  if (!b) return null;
  const markupPercent = typeof b.markupPercent === "number" && Number.isFinite(b.markupPercent) ? b.markupPercent : null;
  const revision = Number.isSafeInteger(b.revision) && b.revision >= 1 ? b.revision : null;
  if (markupPercent === null || revision === null || typeof b.enabled !== "boolean") return null;
  return Object.freeze({
    markupPercent,
    enabled: b.enabled,
    revision,
    updatedAt: typeof b.updatedAt === "string" ? b.updatedAt : null,
    updatedBy: b.updatedBy ?? null,
  });
}

/** Die Anzeige: „25,00 %", Status, letzte Änderung. */
export function publicCalculatorSettingsView(settings) {
  const s = settings || null;
  if (!s) return null;
  return {
    markupText: formatMarkupPercent(s.markupPercent),
    statusText: s.enabled ? PUBLIC_CALC_ADMIN_TEXT.enabled : PUBLIC_CALC_ADMIN_TEXT.disabled,
    statusDetail: s.enabled ? PUBLIC_CALC_ADMIN_TEXT.enabledText : PUBLIC_CALC_ADMIN_TEXT.disabledText,
    lastChangeText: s.updatedAt ? `${formatMarkupDateTime(s.updatedAt)} · ${formatConfirmedBy(s.updatedBy)}` : "—",
    inputValue: markupInputValue(s.markupPercent),
  };
}

/** Die Eingabe in de-DE — dieselbe Prüfung wie jeder Kundenaufschlag, eigene Texte. */
export function parsePublicMarkupInput(raw) {
  const p = parseMarkupInput(raw);
  return p.ok ? p : { ...p, error: INPUT_TEXT[p.code] || INPUT_TEXT.format };
}

/** Ist der neue Wert derselbe wie der gespeicherte (auf zwei Nachkommastellen)? */
export function markupUnchanged(settings, value) {
  return !!settings && Math.round(Number(settings.markupPercent) * 100) === Math.round(Number(value) * 100);
}

/** Der Bestätigungsdialog der Aufschlagsänderung: alter und neuer Wert, dazu die Wirkung. */
export function markupConfirmation(settings, value) {
  const alt = formatMarkupPercent(settings ? settings.markupPercent : null);
  const neu = formatMarkupPercent(value);
  return {
    title: "Aufschlag des Preisrechners ändern",
    text: `Bisher ${alt}, neu ${neu}.`,
    note: `Wirkung: Ab der nächsten Berechnung zeigt der öffentliche Preisrechner alle Preise mit ${neu} Aufschlag auf den Einkaufspreis netto — auch für Express. Kundenaufschläge und gespeicherte Angebote bleiben unverändert. Die Änderung wird protokolliert.`,
    confirmLabel: "Aufschlag speichern",
  };
}

/** Der Bestätigungsdialog des Schalters — eigene Bestätigung je Richtung. */
export function availabilityConfirmation(settings) {
  const an = !!(settings && settings.enabled);
  return an ? {
    title: "Preisrechner ausschalten",
    text: "Der öffentliche Preisrechner berechnet danach keine Preise mehr; Besucher sehen den Hinweis, dass er in Kürze verfügbar ist.",
    note: "Wirkt sofort und lässt sich jederzeit wieder einschalten. Die Änderung wird protokolliert.",
    confirmLabel: PUBLIC_CALC_ADMIN_TEXT.switchOff,
    next: false,
  } : {
    title: "Preisrechner einschalten",
    text: "Besucher berechnen danach Preise ohne Anmeldung; jede Berechnung fragt die Versanddienstleister an.",
    note: `Wirkt sofort mit dem aktuellen Aufschlag von ${formatMarkupPercent(settings ? settings.markupPercent : null)}. Ausschalten ist jederzeit möglich. Die Änderung wird protokolliert.`,
    confirmLabel: PUBLIC_CALC_ADMIN_TEXT.switchOn,
    next: true,
  };
}

/**
 * Die Antwort einer Änderung.
 * @returns {{kind: "saved", settings: object} | {kind: "conflict", settings: object|null}
 *           | {kind: "invalid", text: string} | {kind: "error", text: string} | {kind: "auth"}}
 */
export function publicCalculatorSaveOutcome(status, body) {
  const b = body && typeof body === "object" ? body : {};
  if (status === 200) {
    const s = parsePublicCalculatorSettings(b);
    return s ? { kind: "saved", settings: s } : { kind: "error", text: PUBLIC_CALC_ADMIN_TEXT.saveError };
  }
  if (status === 409 && b.code === "PUBLIC_CALCULATOR_REVISION_CONFLICT") {
    return { kind: "conflict", settings: parsePublicCalculatorSettings(b.current) };
  }
  if (status === 400 && b.code === "PUBLIC_CALCULATOR_REVISION_INVALID") return { kind: "conflict", settings: null };
  if (status === 400 && b.code === "MARKUP_INVALID") return { kind: "invalid", text: INPUT_TEXT.format };
  if (status === 401 || status === 403) return { kind: "auth" };
  if (status === 429) return { kind: "error", text: PUBLIC_CALC_ADMIN_TEXT.rateLimited };
  return { kind: "error", text: PUBLIC_CALC_ADMIN_TEXT.saveError };
}
