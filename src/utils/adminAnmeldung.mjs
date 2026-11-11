// ── Admin-Anmeldung (/admin/login, Canonical v2.130) — Texte und reine Logik ──────────────────────────────
//
// Die Seite pages/AdminAnmeldungPage.jsx ist der EINE Eingang in den Adminbereich: Anmelden, Passwort vergessen,
// Passwort über den Einmallink selbst setzen. Die Entscheidung, wer Admin ist, fällt ausschließlich auf dem Server
// (POST /auth/admin-login: nur ein Adminkonto bekommt ein Token; requireAdmin an jeder Adminroute). Diese Datei
// übersetzt nur Codes in Texte, wählt geprüfte Ziele und hält die sichtbaren Wortlaute an einer Stelle.
//
// Wortlaut nach Auftrag: sichtbar sind „ConfidaraExpress Adminbereich“, die Felder und „Passwort vergessen?“ —
// kein Werbetext, kein Sicherheitsslogan, keine Registrierung.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.
import { ADMIN_HOME, ADMIN_LOGIN_PATH } from "./roleLanding.mjs";
import { adminReturnTarget } from "./loginReturnTarget.mjs";
import { LOGIN_SERVERFEHLER, AUTH_GENERISCH } from "./authErrors.mjs";

export const ADMIN_ANMELDUNG_TEXT = Object.freeze({
  titel: "Adminbereich",
  email: "E-Mail-Adresse",
  passwort: "Passwort",
  passwortZeigen: "Passwort anzeigen",
  passwortVerbergen: "Passwort verbergen",
  vergessen: "Passwort vergessen?",
  anmelden: "Anmelden",
  anmeldenLaeuft: "Anmeldung läuft …",
  sitzungAbgelaufen: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
  vergessenTitel: "Passwort zurücksetzen",
  vergessenText: "Sie erhalten einen Link an Ihre E-Mail-Adresse. Er ist 15 Minuten gültig.",
  vergessenSenden: "Link senden",
  vergessenSendenLaeuft: "Link wird gesendet …",
  zurueck: "Zurück zur Anmeldung",
  neuesPasswortTitel: "Neues Passwort festlegen",
  neuesPasswortText: "Mindestens 8 Zeichen. Empfohlen sind 12 oder mehr, nur für dieses Konto.",
  neuesPasswort: "Neues Passwort",
  neuesPasswortWdh: "Passwort wiederholen",
  speichern: "Passwort speichern",
  speichernLaeuft: "Passwort wird gespeichert …",
  gespeichert: "Ihr Passwort ist gespeichert. Sie können sich jetzt anmelden.",
  linkPruefen: "Der Link wird geprüft …",
  linkErneutPruefen: "Link erneut prüfen",
  neuenLinkAnfordern: "Neuen Link anfordern",
  ungleich: "Die Passwörter stimmen nicht überein.",
  recht: "Rechtliche Informationen",
});

// Antworten von POST /auth/admin-login → Text. Gesteuert wird über den Code; ohne gültige Zugangsdaten antwortet der
// Server wortgleich wie für eine unbekannte Adresse (401 INVALID_CREDENTIALS) — die Seite verrät ebenso nichts.
export const ADMIN_ANMELDE_FEHLER = Object.freeze({
  INVALID_CREDENTIALS: "E-Mail-Adresse oder Passwort sind nicht korrekt.",
  ADMIN_ACCESS_REQUIRED: "Für dieses Konto besteht kein Zugang zum Adminbereich.",
  ACCOUNT_BLOCKED: "Dieser Adminzugang ist gesperrt. Ein anderer Administrator kann ihn wieder freischalten.",
  ACCOUNT_PENDING_APPROVAL: "Dieser Adminzugang ist noch nicht freigeschaltet. Ein Administrator schaltet ihn im Adminbereich frei.",
  ZU_VIELE: "Zu viele Anmeldeversuche. Bitte warten Sie 15 Minuten und versuchen Sie es dann erneut.",
});

export function mapAdminAnmeldeFehler(status, body) {
  const code = body && typeof body.code === "string" ? body.code : null;
  if (code && Object.prototype.hasOwnProperty.call(ADMIN_ANMELDE_FEHLER, code)) return ADMIN_ANMELDE_FEHLER[code];
  if (status === 401) return ADMIN_ANMELDE_FEHLER.INVALID_CREDENTIALS;
  if (status === 429) return ADMIN_ANMELDE_FEHLER.ZU_VIELE;
  // Ein 403 ohne bekannten Code: kein Adminzugang — nie ein Rohtext des Servers.
  if (status === 403) return ADMIN_ANMELDE_FEHLER.ADMIN_ACCESS_REQUIRED;
  if (status === 400) return ADMIN_ANMELDE_FEHLER.INVALID_CREDENTIALS;
  return LOGIN_SERVERFEHLER;
}

// „Passwort vergessen“: die Antwort ist immer neutral — kein Rückschluss, ob die Adresse ein (Admin-)Konto hat.
export const ADMIN_VERGESSEN_ERFOLG =
  "Falls zu dieser E-Mail-Adresse ein Konto besteht, ist eine Nachricht mit einem Link unterwegs.";

export function mapAdminVergessenFehler(status) {
  if (status === 429) return "Zu viele Anfragen. Bitte warten Sie 15 Minuten und versuchen Sie es dann erneut.";
  if (status === 400) return "Bitte geben Sie eine gültige E-Mail-Adresse ein.";
  return AUTH_GENERISCH;
}

/** Ziel nach einer erfolgreichen Admin-Anmeldung: das geprüfte Rücksprungziel im Adminbereich, sonst /admin. */
export function adminZielNachAnmeldung(rueckspruchRoh) {
  return adminReturnTarget(rueckspruchRoh) || ADMIN_HOME;
}

/** Welche Anmeldeseite ein Sitzungsende (401/403 im zentralen Handler) oder eine Schutzroute ansteuert:
 *  Adressen des Adminbereichs (und die Admin-Vorschau der Rechtstexte) führen nach /admin/login, alles andere
 *  bleibt bei /login. */
export function anmeldeseiteFuer(pathname) {
  if (typeof pathname !== "string") return "/login";
  if (pathname === ADMIN_LOGIN_PATH) return ADMIN_LOGIN_PATH;
  if (pathname === ADMIN_HOME || pathname.startsWith(`${ADMIN_HOME}/`) || pathname.startsWith("/vorschau/")) return ADMIN_LOGIN_PATH;
  return "/login";
}

/** Auf diesen Seiten leitet ein Sitzungsende nicht weiter (man ist schon dort bzw. die Seite arbeitet ohne Sitzung). */
export function ohneSitzungsweiterleitung(pathname) {
  return pathname === "/login" || pathname === ADMIN_LOGIN_PATH || pathname === "/confirm-email-change";
}

/** Einmallink aus der Adresse (…?reset=<token>): nur die Form eines Tokens, sonst null. Ob er gilt, prüft der Server. */
export function resetTokenAus(search) {
  if (typeof search !== "string" || search === "") return null;
  let wert = null;
  try { wert = new URLSearchParams(search).get("reset"); } catch { return null; }
  return typeof wert === "string" && /^[A-Za-z0-9]{32,128}$/.test(wert) ? wert : null;
}

export { ADMIN_HOME, ADMIN_LOGIN_PATH };
