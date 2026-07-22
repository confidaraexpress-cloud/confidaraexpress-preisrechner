// ─────────────────────────────────────────────────────────────────────────────
// Verifizierte Login-E-Mail-Änderung — reine, framework-freie Hilfslogik (.mjs,
// wie addressBookView/draftsView). Bündelt: Client-Validierung des Startdialogs,
// Fehlercode-Mapping (Start/Resend) und die Klassifikation der öffentlichen
// Bestätigungsseite. Kein React, kein Netzwerk — nur mit node --test geprüfte,
// deterministische Funktionen. Das Backend bleibt in allem autoritativ.
//
// WICHTIG (Backend-Semantik, siehe Aufgabenstellung): E-Mail-Adressen sind
// case-sensitive. Es findet KEINE automatische Kleinschreibung statt — die neue
// Adresse wird ausschließlich getrimmt (erst beim Absenden), niemals verändert.
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
export function isSessionExpiredBody(body) {
  return !!body && body.error === SESSION_EXPIRED_ERROR;
}

// ── Startdialog-Validierung ─────────────────────────────────────────────────
// Liefert ein Fehlerobjekt (leer = gültig). Rein clientseitig für schnelles
// Feedback; Reihenfolge: neue E-Mail (Pflicht → Länge → Format → nicht identisch
// mit aktueller), dann Passwort (Pflicht). Vergleich mit der aktuellen Adresse
// ist EXAKT/case-sensitive (keine Normalisierung), konsistent mit dem Backend.
export function validateEmailChangeForm(form, currentEmail) {
  const errors = {};
  const newEmail = typeof form?.newEmail === "string" ? form.newEmail.trim() : "";
  const currentPassword = form?.currentPassword || "";

  if (!newEmail) {
    errors.newEmail = "Bitte gib eine neue E-Mail-Adresse ein.";
  } else if (newEmail.length > EMAIL_MAX_LENGTH) {
    errors.newEmail = `Die E-Mail-Adresse darf höchstens ${EMAIL_MAX_LENGTH} Zeichen lang sein.`;
  } else if (!EMAIL_RE.test(newEmail)) {
    errors.newEmail = "Bitte gib eine gültige E-Mail-Adresse ein.";
  } else if (currentEmail != null && newEmail === currentEmail) {
    errors.newEmail = "Die neue E-Mail-Adresse entspricht bereits deiner aktuellen Login-E-Mail.";
  }

  if (!currentPassword) {
    errors.currentPassword = "Bitte gib dein aktuelles Passwort ein.";
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
  EMAIL_CHANGE_EMAIL_INVALID: "Bitte gib eine gültige E-Mail-Adresse ein.",
  EMAIL_CHANGE_SAME_EMAIL: "Die neue E-Mail-Adresse entspricht bereits deiner aktuellen Login-E-Mail.",
  EMAIL_CHANGE_EMAIL_UNAVAILABLE: "Diese E-Mail-Adresse kann nicht verwendet werden.",
  EMAIL_CHANGE_CONFIGURATION_ERROR: "Die E-Mail-Änderung ist derzeit nicht verfügbar. Bitte versuche es später erneut.",
};
export const EMAIL_CHANGE_START_GENERIC = "Die E-Mail-Änderung konnte nicht gestartet werden. Bitte versuche es erneut.";
export const EMAIL_CHANGE_RATE_LIMIT = "Zu viele Versuche in kurzer Zeit. Bitte versuche es später erneut.";

export function mapEmailChangeStartError(code) {
  return START_ERROR_MESSAGES[code] || EMAIL_CHANGE_START_GENERIC;
}

// ── Fehlercode-Mapping: Resend ──────────────────────────────────────────────
const RESEND_ERROR_MESSAGES = {
  EMAIL_CHANGE_REQUEST_NOT_FOUND: "Es ist keine ausstehende E-Mail-Änderung mehr vorhanden.",
  EMAIL_CHANGE_RESEND_TOO_SOON: "Bitte warte kurz, bevor du die E-Mail erneut sendest.",
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
export const EMAIL_CHANGE_CANCEL_GENERIC = "Die ausstehende E-Mail-Änderung konnte nicht abgebrochen werden. Bitte versuche es erneut.";

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
