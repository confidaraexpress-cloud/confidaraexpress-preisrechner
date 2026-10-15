// ─────────────────────────────────────────────────────────────────────────────
// Verifizierte Login-E-Mail-Änderung — reine, framework-freie Hilfslogik (.mjs,
// wie addressBookView/draftsView). Bündelt: Client-Validierung des Startdialogs,
// Fehlercode-Mapping (Start/Resend) und die Klassifikation der öffentlichen
// Bestätigungsseite. Kein React, kein Netzwerk — nur mit node --test geprüfte,
// deterministische Funktionen. Das Backend bleibt in allem autoritativ.
//
// WICHTIG (Backend-Semantik): seit F2 vergleicht das Backend Login-E-Mails ohne
// Groß-/Kleinschreibung; gespeichert wird die Schreibweise der Eingabe. Es findet
// deshalb KEINE automatische Kleinschreibung statt — die neue Adresse wird
// ausschließlich getrimmt (erst beim Absenden), niemals verändert.
// ─────────────────────────────────────────────────────────────────────────────

// Projektweit verwendete E-Mail-Regex (identisch zu AuthPage/NewShipmentPage/
// addressBookView) — bewusst KEINE strengere oder schwächere Logik als das
// Backend, das ohnehin erneut validiert.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX_LENGTH = 255;

// Sentinel des serverseitigen „echten" Session-401 (identisch zur bestehenden
// Passwortänderung in Profile.jsx). Nur DIESER Body auf einem 401 des Start-
// Endpunkts ist eine abgelaufene Sitzung (→ globaler Logout); jeder andere 401
// ist die fachliche Falscheingabe „aktuelles Passwort falsch" und darf NICHT
// ausloggen.
export const SESSION_EXPIRED_ERROR = "Sitzung abgelaufen. Bitte melden Sie sich erneut an.";
// Paritätsaudit A6: maßgeblich ist der Code `SESSION_EXPIRED` (middleware/auth.js),
// nicht der Wortlaut — auch „Token fehlt“ ist ein Sitzungsende. Der Textvergleich
// bleibt nur als Rückfall für einen Server ohne Code.
export function isSessionExpiredBody(body) {
  if (!body || typeof body !== "object") return false;
  return body.code === "SESSION_EXPIRED" || body.error === SESSION_EXPIRED_ERROR;
}

// Paritätsaudit A6/BP6: Endet mit dieser Antwort die Sitzung? Ein 401 nur mit dem
// Sitzungscode (sonst ist er die fachliche Falscheingabe „aktuelles Passwort falsch“),
// ein 403 immer: auf diesen Selbstbedienungsrouten bedeutet er gesperrtes, nicht
// freigegebenes oder nicht mehr vorhandenes Konto (ACCOUNT_BLOCKED, ACCOUNT_PENDING_APPROVAL,
// ACCOUNT_PRELIVE_TEST_INACTIVE …) — dieselbe Regel wie der zentrale Abmeldeweg in api/client.js.
export function endsSession(status, body) {
  if (status === 403) return true;
  return status === 401 && isSessionExpiredBody(body);
}

// ── Startdialog-Validierung ─────────────────────────────────────────────────
// Liefert ein Fehlerobjekt (leer = gültig). Rein clientseitig für schnelles
// Feedback; Reihenfolge: neue E-Mail (Pflicht → Länge → Format → nicht identisch
// mit aktueller), dann Passwort (Pflicht). F2: der Vergleich mit der aktuellen
// Adresse ignoriert Groß-/Kleinschreibung — wie das Backend (lib/accountEmail.js),
// für das „Max@Firma.de" und „max@firma.de" dieselbe Login-E-Mail sind. Gesendet
// wird die Eingabe weiterhin nur getrimmt, nie kleingeschrieben.
export function validateEmailChangeForm(form, currentEmail) {
  const errors = {};
  const newEmail = typeof form?.newEmail === "string" ? form.newEmail.trim() : "";
  const currentPassword = form?.currentPassword || "";

  if (!newEmail) {
    errors.newEmail = "Bitte geben Sie eine neue E-Mail-Adresse ein.";
  } else if (newEmail.length > EMAIL_MAX_LENGTH) {
    errors.newEmail = `Die E-Mail-Adresse darf höchstens ${EMAIL_MAX_LENGTH} Zeichen lang sein.`;
  } else if (!EMAIL_RE.test(newEmail)) {
    errors.newEmail = "Bitte geben Sie eine gültige E-Mail-Adresse ein.";
  } else if (typeof currentEmail === "string" && newEmail.toLowerCase() === currentEmail.trim().toLowerCase()) {
    errors.newEmail = "Die neue E-Mail-Adresse entspricht bereits Ihrer aktuellen Login-E-Mail.";
  }

  if (!currentPassword) {
    errors.currentPassword = "Bitte geben Sie Ihr aktuelles Passwort ein.";
  }

  return errors;
}

// Submit-Button-Freigabe: gültiges Formular UND kein laufender Request.
export function isEmailChangeFormValid(form, currentEmail) {
  return Object.keys(validateEmailChangeForm(form, currentEmail)).length === 0;
}

// ── Fehlercode-Mapping: Start ───────────────────────────────────────────────
// Keine Backend-Rohcodes anzeigen; unbekannte Codes → generische Meldung.
const START_ERROR_MESSAGES = {
  CURRENT_PASSWORD_INVALID: "Das aktuelle Passwort ist nicht korrekt.",
  EMAIL_CHANGE_EMAIL_INVALID: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
  EMAIL_CHANGE_SAME_EMAIL: "Die neue E-Mail-Adresse entspricht bereits Ihrer aktuellen Login-E-Mail.",
  EMAIL_CHANGE_EMAIL_UNAVAILABLE: "Diese E-Mail-Adresse kann nicht verwendet werden.",
  EMAIL_CHANGE_CONFIGURATION_ERROR: "Die E-Mail-Änderung ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.",
};
export const EMAIL_CHANGE_START_GENERIC = "Die E-Mail-Änderung konnte nicht gestartet werden. Bitte versuchen Sie es erneut.";
export const EMAIL_CHANGE_RATE_LIMIT = "Zu viele Versuche in kurzer Zeit. Bitte versuchen Sie es später erneut.";

export function mapEmailChangeStartError(code) {
  return START_ERROR_MESSAGES[code] || EMAIL_CHANGE_START_GENERIC;
}

// ── Fehlercode-Mapping: Resend ──────────────────────────────────────────────
const RESEND_ERROR_MESSAGES = {
  EMAIL_CHANGE_REQUEST_NOT_FOUND: "Es ist keine ausstehende E-Mail-Änderung mehr vorhanden.",
  EMAIL_CHANGE_RESEND_TOO_SOON: "Bitte warten Sie kurz, bevor Sie die E-Mail erneut senden.",
  EMAIL_CHANGE_EMAIL_UNAVAILABLE: "Diese E-Mail-Adresse kann inzwischen nicht mehr verwendet werden.",
};
export const EMAIL_CHANGE_RESEND_GENERIC = "Die Bestätigungs-E-Mail konnte nicht erneut gesendet werden.";

export function mapEmailChangeResendError(code) {
  return RESEND_ERROR_MESSAGES[code] || EMAIL_CHANGE_RESEND_GENERIC;
}

// Resend-„request not found" ist der einzige Resend-Fall, der einen Profil-
// Refetch/Reconcile erzwingt (die serverseitige Pending-Änderung existiert nicht
// mehr → Pending-Bereich muss verschwinden).
export function isResendRequestGone(code) {
  return code === "EMAIL_CHANGE_REQUEST_NOT_FOUND";
}

// ── Cancel-Fehlermapping ────────────────────────────────────────────────────
// „Nicht mehr vorhanden" ist hier faktisch schon der Zielzustand (nichts mehr
// abzubrechen) — der Aufrufer behandelt es als Erfolg + Refetch.
export const EMAIL_CHANGE_CANCEL_GENERIC = "Die ausstehende E-Mail-Änderung konnte nicht abgebrochen werden. Bitte versuchen Sie es erneut.";

// ── Bestätigungsseite: Klassifikation ───────────────────────────────────────
// HTTP-Status (+ optionaler Fehlercode) → UI-Zustand. Robust gegen die exakten
// Fehlercodes des Backends: Unterscheidung primär nach Statusklasse.
//   success     → confirmed
//   unavailable → Ziel-E-Mail inzwischen belegt/gesperrt (eigener Hinweis)
//   invalid     → Token ungültig/abgelaufen (nicht-transient, 4xx)
//   error       → transient (Netzwerk / 429 / 5xx) → Retry anbieten
export function classifyEmailChangeConfirm({ ok, status, code } = {}) {
  if (ok) return "success";
  if (code === "EMAIL_CHANGE_EMAIL_UNAVAILABLE") return "unavailable";
  // transient: kein Status (Netzwerkabbruch), Rate-Limit oder Serverfehler
  if (!status || status === 429 || status >= 500) return "error";
  // jeder andere 4xx (400/401/403/404/409/410/422 …) → ungültiger/abgelaufener Link
  return "invalid";
}

// Nur der transiente Zustand ("error") darf einen Retry anbieten — kein Retry
// bei ungültigem/abgelaufenem Link oder belegter Adresse.
export function isRetryableConfirmState(state) {
  return state === "error";
}

// Minimale clientseitige Token-Vorprüfung (nur „vorhanden & nicht leer");
// die echte Prüfung macht ausschließlich das Backend. Kein Format-Raten.
export function hasUsableToken(token) {
  return typeof token === "string" && token.trim().length > 0;
}
