/* ── Partner-Anmeldung /partner/login (Betreiberauftrag 2026-11-22, Abschnitt 8) ────────────────────────────────────
   Eigener, rollenbeschränkter Eingang der Partner-App: POST /auth/partner-login gibt nur einem Vertriebspartner
   (Rolle sales_partner) ein Token. Andere Konten werden neutral abgewiesen — Kunden ohne Hinweis auf fremde Bereiche,
   Administratoren mit dem Weg zur Admin-Anmeldung. Dieselbe Kontologik wie /login, keine zweite Datenbank. */
import { mapLoginError } from "./authErrors.mjs";

export const PARTNER_LOGIN_PATH = "/partner/login";
export const PARTNER_PORTAL_PATH = "/partner";

export const PARTNER_ANMELDE_TEXT = Object.freeze({
  bereich: "Partnerbereich",
  titel: "Anmelden",
  text: "Melden Sie sich mit Ihrem Partnerkonto an.",
  email: "E-Mail-Adresse",
  passwort: "Passwort",
  bleiben: "Angemeldet bleiben",
  bleibenHilfe: "Bis zu 30 Tage auf diesem Gerät. Auf gemeinsam genutzten Geräten nicht aktivieren.",
  anmelden: "Anmelden",
  anmeldenLaeuft: "Anmeldung läuft …",
  vergessen: "Passwort vergessen?",
  vergessenTitel: "Passwort zurücksetzen",
  vergessenText: "Geben Sie die E-Mail-Adresse Ihres Partnerkontos ein. Sie erhalten einen Link zum Setzen eines neuen Passworts.",
  vergessenSenden: "Link anfordern",
  vergessenLaeuft: "Wird gesendet …",
  zurueck: "Zurück zur Anmeldung",
  fehltEingabe: "Bitte geben Sie E-Mail-Adresse und Passwort ein.",
  fehltEmail: "Bitte geben Sie Ihre E-Mail-Adresse ein.",
  sitzungAbgelaufen: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
  partnerWerden: "Noch kein Partner?",
  partnerWerdenLink: "Jetzt Vertriebspartner werden",
  nichtGeladen: "Die Anmeldung war erfolgreich, das Partnerportal konnte aber nicht geladen werden. Bitte versuchen Sie es erneut.",
});

export const PARTNER_ANMELDE_FEHLER = Object.freeze({
  PARTNER_ACCESS_REQUIRED: "Für dieses Konto besteht kein Zugang zum Partnerbereich.",
  ADMIN_LOGIN_REQUIRED: "Administratoren melden sich über die Admin-Anmeldung an.",
});

/** Ablehnung von POST /auth/partner-login → Satz. Codes des Servers steuern, Freitexte nie. */
export function mapPartnerAnmeldeFehler(status, body) {
  const code = body && typeof body.code === "string" ? body.code : null;
  if (code && PARTNER_ANMELDE_FEHLER[code]) return PARTNER_ANMELDE_FEHLER[code];
  return mapLoginError(status, body);
}

/** Pfade, deren Sitzungsende auf die Partner-Anmeldung führt (nicht: /partner-registrieren, /partnervereinbarung). */
export function istPartnerPortalPfad(pathname) {
  return typeof pathname === "string" && (pathname === PARTNER_PORTAL_PATH || pathname.startsWith(`${PARTNER_PORTAL_PATH}/`));
}
