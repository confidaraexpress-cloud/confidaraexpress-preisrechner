// ── Übernahmeseite /preisrechner-uebernahme: Zustände und Texte (rein) ─────────
//
// Die Seite entscheidet nach dem Login, was mit einer Tarifwahl aus dem öffentlichen
// Preisrechner geschieht. Rein: kein React, kein Netz, kein Speicher.
//
//   Kundenkonto        → Prüfung beim Server (handoff/verify), dann „Neue Sendung" vorbelegt
//   Admin / Partner    → Hinweis und die eigene Startseite — nie ein Kundenendpunkt
//   abgelaufen (410)   → Hinweis ohne Vorbelegung
//   ungültig (400)     → Hinweis ohne Vorbelegung
//   kein Token         → Hinweis (die Übernahme überlebt kein Neuladen)
//   sonst              → Hinweis mit „Erneut versuchen"; das Token bleibt bis dahin erhalten

import { SALES_PARTNER_ROLE, PARTNER_HOME, CUSTOMER_HOME } from "./roleLanding.mjs";

export const PUBLIC_CALCULATOR_URL = "https://preisrechner.confidaraexpress.de/";
export const ADMIN_HOME = "/admin";

export const HANDOFF_STATE = Object.freeze({
  CHECKING: "checking",
  EXPIRED: "expired",
  INVALID: "invalid",
  ROLE: "role",
  EMPTY: "empty",
  ERROR: "error",
});

export const HANDOFF_PAGE_TEXT = Object.freeze({
  title: "Tarifauswahl aus dem Preisrechner",
  checking: "Ihre Tarifauswahl wird übernommen …",
  [HANDOFF_STATE.EXPIRED]: {
    title: "Die Tarifauswahl ist abgelaufen",
    text: "Eine Auswahl aus dem Preisrechner gilt eine Stunde. Berechnen Sie die Preise im Preisrechner erneut oder vergleichen Sie die Angebote direkt in „Neue Sendung“.",
  },
  [HANDOFF_STATE.INVALID]: {
    title: "Die Tarifauswahl konnte nicht übernommen werden",
    text: "Berechnen Sie die Preise im Preisrechner erneut oder vergleichen Sie die Angebote direkt in „Neue Sendung“.",
  },
  [HANDOFF_STATE.ROLE]: {
    title: "Nur für Kundenkonten",
    text: "Die Übernahme aus dem Preisrechner ist für Kundenkonten vorgesehen. Mit diesem Konto geht es auf Ihrer eigenen Startseite weiter.",
  },
  [HANDOFF_STATE.EMPTY]: {
    title: "Keine Tarifauswahl vorhanden",
    text: "Eine Auswahl aus dem Preisrechner bleibt nur bis zum Neuladen der Seite erhalten. Berechnen Sie die Preise erneut oder vergleichen Sie die Angebote direkt in „Neue Sendung“.",
  },
  [HANDOFF_STATE.ERROR]: {
    title: "Die Tarifauswahl konnte gerade nicht geprüft werden",
    text: "Bitte versuchen Sie es erneut.",
  },
  retry: "Erneut versuchen",
  newShipment: "Zu „Neue Sendung“",
  calculator: "Zum Preisrechner",
  ownHome: "Zur Startseite",
});

// Die Hinweise der Anmeldeseite (AuthPage).
export const HANDOFF_AUTH_TEXT = Object.freeze({
  pending: "Ihre Tarifauswahl aus dem Preisrechner wartet. Nach der Anmeldung übernehmen wir sie in „Neue Sendung“ und berechnen die Preise mit Ihren Konditionen neu.",
  // Aus dem Preisrechner kommt man direkt in die Registrierung; bestehende Konten wechseln zur Anmeldung.
  pendingRegister: "Ihre Tarifauswahl aus dem Preisrechner wartet. Registrieren Sie hier Ihr Geschäftskonto — gebucht wird nach der Freischaltung. Sie haben schon ein Konto? Dann melden Sie sich an: wir übernehmen die Auswahl in „Neue Sendung“ und berechnen die Preise mit Ihren Konditionen neu.",
  droppedAfterRegistration: "Ihre Tarifauswahl aus dem Preisrechner bleibt bis zur Freischaltung Ihres Kontos nicht erhalten. Nach der Freischaltung berechnen Sie die Preise einfach erneut.",
});

/** Ist das Konto ein Kundenkonto? Strikt — eine fehlende Rolle ist keines. */
export function isCustomerAccount(user) {
  return !!user && typeof user === "object" && user.role === "customer";
}

/** Die eigene Startseite eines Nicht-Kundenkontos. */
export function ownHomeFor(user) {
  if (user && user.role === SALES_PARTNER_ROLE) return PARTNER_HOME;
  if (user && user.role === "admin") return ADMIN_HOME;
  return CUSTOMER_HOME;
}

/**
 * Die Antwort der Prüfung als nächster Schritt.
 * @returns {{kind: "transfer", input: object, selection: object} | {kind: "state", state: string, consume: boolean}
 *           | {kind: "relogin"}}
 */
export function handoffVerifyOutcome(status, body) {
  const b = body && typeof body === "object" ? body : {};
  if (status === 200 && b.input && typeof b.input === "object" && b.selection && typeof b.selection === "object") {
    return { kind: "transfer", input: b.input, selection: b.selection };
  }
  if (status === 401) return { kind: "relogin" };
  if (status === 410) return { kind: "state", state: HANDOFF_STATE.EXPIRED, consume: true };
  if (status === 400) return { kind: "state", state: HANDOFF_STATE.INVALID, consume: true };
  if (status === 403) return { kind: "state", state: HANDOFF_STATE.ROLE, consume: true };
  return { kind: "state", state: HANDOFF_STATE.ERROR, consume: false };
}
