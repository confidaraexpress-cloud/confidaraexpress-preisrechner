/* ── Zweiter Anmeldeschritt des Adminbereichs (Passkey oder Wiederherstellungscode, Betreiberauftrag 2026-11-22) ──
   Hat ein Adminkonto einen Passkey, antwortet POST /auth/admin-login nach dem Passwort OHNE Token, dafür mit einem
   Anmeldeticket (5 Minuten, höchstens 5 Versuche). Diese Datei liest die Antwort streng und übersetzt jede Ablehnung in
   einen verständlichen Satz — nie die Rohmeldung, nie ein Code. */

export const ZWEITER_SCHRITT_TEXT = Object.freeze({
  passkeyTitel: "Anmeldung bestätigen",
  passkeyText: "Bestätigen Sie die Anmeldung mit dem Passkey Ihres Geräts – zum Beispiel per Fingerabdruck, Gesichtserkennung oder Geräte-PIN.",
  passkeyKnopf: "Mit Passkey bestätigen",
  passkeyLaeuft: "Warte auf Bestätigung …",
  codeWechsel: "Wiederherstellungscode verwenden",
  codeTitel: "Wiederherstellungscode eingeben",
  codeText: "Geben Sie einen Ihrer Wiederherstellungscodes ein. Jeder Code gilt nur einmal.",
  codeLabel: "Wiederherstellungscode",
  codeKnopf: "Anmelden",
  codeLaeuft: "Wird geprüft …",
  passkeyWechsel: "Doch mit Passkey bestätigen",
  codeFehlt: "Bitte geben Sie einen Wiederherstellungscode ein.",
  codeVerbraucht: (n) => (n === 0
    ? "Sie haben Ihren letzten Wiederherstellungscode verwendet. Erzeugen Sie unter „Sicherheit“ neue Codes."
    : `Noch ${n} ${n === 1 ? "Wiederherstellungscode" : "Wiederherstellungscodes"} übrig. Neue Codes erzeugen Sie unter „Sicherheit“.`),
});

export const ZWEITER_SCHRITT_FEHLER = Object.freeze({
  LOGIN_TICKET_INVALID: "Die Anmeldung ist abgelaufen. Bitte melden Sie sich erneut mit E-Mail-Adresse und Passwort an.",
  PASSKEY_VERIFICATION_FAILED: "Der Passkey konnte nicht bestätigt werden. Bitte versuchen Sie es erneut oder verwenden Sie einen Wiederherstellungscode.",
  RECOVERY_CODE_INVALID: "Dieser Code ist ungültig oder wurde bereits verwendet.",
  ZU_VIELE: "Zu viele Versuche. Bitte warten Sie 15 Minuten.",
  SERVER: "Die Anmeldung konnte gerade nicht abgeschlossen werden. Bitte versuchen Sie es erneut.",
});

/** Liest die Antwort von POST /auth/admin-login: null = kein zweiter Schritt (dann gilt das Token wie bisher). */
export function zweiterSchrittAus(d) {
  if (!d || d.secondFactorRequired !== true) return null;
  if (typeof d.loginTicket !== "string" || d.loginTicket.length < 20) return null;
  if (!d.passkeyOptions || typeof d.passkeyOptions !== "object" || typeof d.passkeyOptions.challenge !== "string") return null;
  return { loginTicket: d.loginTicket, passkeyOptions: d.passkeyOptions, recoveryAvailable: d.recoveryAvailable === true };
}

/** Ablehnung im zweiten Schritt → { text, neuAnmelden }. neuAnmelden: das Ticket ist verbraucht, zurück zum Passwort. */
export function zweiterSchrittFehler(status, d) {
  const code = d && typeof d.code === "string" ? d.code : "";
  if (status === 429) return { text: ZWEITER_SCHRITT_FEHLER.ZU_VIELE, neuAnmelden: false };
  if (code === "LOGIN_TICKET_INVALID") return { text: ZWEITER_SCHRITT_FEHLER.LOGIN_TICKET_INVALID, neuAnmelden: true };
  if (code === "PASSKEY_VERIFICATION_FAILED") return { text: ZWEITER_SCHRITT_FEHLER.PASSKEY_VERIFICATION_FAILED, neuAnmelden: false };
  if (code === "RECOVERY_CODE_INVALID") return { text: ZWEITER_SCHRITT_FEHLER.RECOVERY_CODE_INVALID, neuAnmelden: false };
  if (status === 401 || status === 403) return { text: ZWEITER_SCHRITT_FEHLER.LOGIN_TICKET_INVALID, neuAnmelden: true };
  return { text: ZWEITER_SCHRITT_FEHLER.SERVER, neuAnmelden: false };
}

/** Eingabe eines Wiederherstellungscodes: nur Leerraum am Rand entfernen — die Normalisierung macht der Server. */
export function codeEingabe(text) {
  return typeof text === "string" ? text.trim().slice(0, 40) : "";
}
