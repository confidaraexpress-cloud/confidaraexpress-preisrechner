// ─────────────────────────────────────────────────────────────────────────────
// Auth-Fehlertexte und -zuordnung (Login, Registrierung, Passwort vergessen/
// zurücksetzen, Reset-Token-Prüfung).
//
// Vorher zeigte AuthPage rohe `e.message`-Texte („Failed to fetch", JSON-
// Parserfehler) und warf `new Error(d.error)` ohne Fallback — bei einem Body
// ohne `error`-Feld blieb der Banner dadurch KOMPLETT LEER (Error(undefined)
// hat eine leere message, `{error && …}` rendert nichts).
//
// Arbeitsteilung nach dem Architekturprinzip des Audits:
//   Transportebene  → utils/apiError.mjs (normalizeThrownError klassifiziert
//                     Netzwerk/Timeout/Abort zentral — kein zweiter Normalizer)
//   Domänenebene    → dieses Modul übersetzt die Auth-Codes des Backends
//                     (INVALID_CREDENTIALS, ACCOUNT_BLOCKED, ACCOUNT_PENDING_
//                     APPROVAL, RESET_TOKEN_EXPIRED, INVALID_RESET_TOKEN, …)
//                     in konkrete Kundentexte
//   Darstellung     → AuthPage (role="alert"-Banner)
//
// Framework-frei (.mjs) und damit ohne DOM mit `node --test` prüfbar.
// Codes steuern die Logik; Backend-Freitexte werden nur als Anzeige-Fallback
// verwendet, nie verglichen.
// ─────────────────────────────────────────────────────────────────────────────
import { normalizeThrownError } from "./apiError.mjs";

const istText = (v) => typeof v === "string" && v.trim() !== "";
const sicher = (v, fallback) => (istText(v) ? v.trim() : fallback);

export const AUTH_CODE_TEXTE = {
  INVALID_CREDENTIALS: "E-Mail-Adresse oder Passwort sind nicht korrekt.",
  ACCOUNT_PENDING_APPROVAL: "Ihr Konto wurde noch nicht freigeschaltet. Sie erhalten eine Nachricht, sobald der Zugang aktiviert wurde.",
  ACCOUNT_BLOCKED: "Ihr Konto wurde gesperrt. Bitte wenden Sie sich an den Support.",
};

export const AUTH_NETZFEHLER = "Die Verbindung zum Server konnte nicht hergestellt werden. Bitte prüfen Sie Ihre Internetverbindung.";
export const LOGIN_SERVERFEHLER = "Die Anmeldung ist momentan nicht möglich. Bitte versuchen Sie es erneut.";
export const AUTH_GENERISCH = "Die Anfrage konnte momentan nicht verarbeitet werden. Bitte versuchen Sie es erneut.";

// Login war erfolgreich, aber /kundenbereich ließ sich nicht laden: Vorher
// sprang die Seite in diesem Fall KOMMENTARLOS zurück auf den Login (die
// Rückgabe von login() wurde ignoriert) — der Kunde hielt sein Passwort für
// falsch.
export const KUNDENBEREICH_NACH_LOGIN_FEHLER =
  "Die Anmeldung war erfolgreich, Ihr Kundenbereich konnte aber nicht geladen werden. Bitte versuchen Sie es erneut.";

// ── Login ────────────────────────────────────────────────────────────────────
export function mapLoginError(status, body) {
  const code = body && typeof body.code === "string" ? body.code : null;
  if (code && AUTH_CODE_TEXTE[code]) return AUTH_CODE_TEXTE[code];
  if (status === 401) return AUTH_CODE_TEXTE.INVALID_CREDENTIALS;
  // 403 ohne (bekannten) Code: altes Backend — dessen kuratierter Text ist die
  // beste verfügbare Information (z. B. „Konto wartet auf Freigabe durch Admin").
  if (status === 403) return sicher(body?.error, AUTH_CODE_TEXTE.ACCOUNT_PENDING_APPROVAL);
  if (status === 429) return sicher(body?.error, "Zu viele Anmeldeversuche. Bitte warten Sie einen Moment und versuchen Sie es anschließend erneut.");
  if (status >= 500) return LOGIN_SERVERFEHLER;
  return sicher(body?.error, LOGIN_SERVERFEHLER);
}

// ── Passwort vergessen ───────────────────────────────────────────────────────
// Neutraler Erfolgstext (kein Rückschluss, ob die Adresse registriert ist) —
// greift auch, wenn das Backend keinen message-Text liefert.
export const FORGOT_NEUTRAL_ERFOLG =
  "Falls zu dieser E-Mail-Adresse ein Konto besteht, wurde eine Nachricht zum Zurücksetzen des Passworts versendet.";

export function mapForgotError(status, body) {
  if (status === 400 || status === 429) return sicher(body?.error, AUTH_GENERISCH);
  return AUTH_GENERISCH;
}

// ── Passwort zurücksetzen ────────────────────────────────────────────────────
export const RESET_ABGELAUFEN =
  "Der Link ist abgelaufen. Bitte fordern Sie über Passwort vergessen einen neuen Link an.";
export const RESET_UNGUELTIG =
  "Der Link ist ungültig oder wurde bereits verwendet. Bitte fordern Sie über Passwort vergessen einen neuen Link an.";

export function mapResetError(status, body) {
  const code = body && typeof body.code === "string" ? body.code : null;
  if (code === "RESET_TOKEN_EXPIRED") return RESET_ABGELAUFEN;
  if (code === "INVALID_RESET_TOKEN") return RESET_UNGUELTIG;
  if (status === 400 || status === 429) return sicher(body?.error, AUTH_GENERISCH);
  return "Das Passwort konnte momentan nicht zurückgesetzt werden. Bitte versuchen Sie es erneut.";
}

// ── Reset-Token-Prüfung ──────────────────────────────────────────────────────
// Antwortform des Backends: { valid: boolean, code? } — defensiv gelesen.
// "unusable" heißt: Link ist sicher nicht (mehr) brauchbar → zurück zum Login
// MIT Erklärung. Netzwerkfehler sind bewusst KEIN "unusable": dort bleibt der
// Nutzer auf dem Reset-Schritt und kann erneut prüfen.
export function classifyResetTokenCheck(body) {
  if (body && body.valid === true) return { state: "valid", message: null };
  const code = body && typeof body.code === "string" ? body.code : null;
  if (code === "RESET_TOKEN_EXPIRED") return { state: "unusable", message: RESET_ABGELAUFEN };
  return { state: "unusable", message: RESET_UNGUELTIG };
}

export const RESET_PRUEFUNG_NETZFEHLER =
  "Der Link konnte nicht geprüft werden. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.";

// ── Geworfene Fehler (Netz/Timeout/Abort) ────────────────────────────────────
// Zentrale Transportklassifizierung; nur der reine Netzwerkfall bekommt den
// Auth-spezifischen Wortlaut aus der Vorgabe.
export function mapAuthThrownError(e) {
  const n = normalizeThrownError(e);
  if (n.code === "NETWORK_ERROR") return AUTH_NETZFEHLER;
  return n.message;
}
