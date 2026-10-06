import React, { useState, useRef, useEffect } from "react";
import { PasswordField } from "../ui/PasswordField";
import { FormAlert } from "../ui/FormAlert";
import { apiFetch, authH, triggerAuthError } from "../../api/client";
// Passwort-Längenregel (8–128, Zählung in Code-Points). Einzige Quelle der
// Wahrheit im Frontend; Spiegel von lib/passwordPolicy.js im Backend.
import { PASSWORD_MIN_LEN, PASSWORD_MAX_LEN, passwordLengthError } from "../../utils/passwordPolicy.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Passwortänderung — aus Profile.jsx ausgelagert, wortgleich und
// verhaltensgleich (Texte, Felder, Fokusführung, 401-Sitzungssentinel, 429).
// Genutzt von den Kontoeinstellungen des Kundenbereichs (Profile.jsx) und vom
// Bereich „Konto" des Partnerportals: PATCH /kunde/password steht laut
// Backendvertrag Kunden, Admins UND Vertriebspartnern offen.
//
// Benötigt Backend: PATCH /kunde/password
// Request-Body: { currentPassword, newPassword, newPasswordConfirm }
// Response:     { message } bei Erfolg, { error } bei Fehler
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_PW_FORM = { currentPassword: "", newPassword: "", newPasswordConfirm: "" };

// Wortlaute der Passwortänderung — wortgleich zu vorher (ein Governance-Test
// prüft den Text). Die Regel selbst (8–128, Code-Points) steht in
// passwordPolicy.mjs; hier steht nur die Formulierung.
const PW_CHANGE_TEXTS = Object.freeze({
  tooShort: `Das neue Passwort muss mindestens ${PASSWORD_MIN_LEN} Zeichen lang sein.`,
  tooLong:  `Das neue Passwort darf höchstens ${PASSWORD_MAX_LEN} Zeichen lang sein.`,
});

export function PasswordChangeSection() {
  const [pwForm, setPwForm] = useState(EMPTY_PW_FORM);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  // Der Passwortbereich ist geschlossen, bis der Nutzer ihn ausdrücklich
  // öffnet (Paket D, Teil 4). Vorher stand das dreifeldrige Formular dauerhaft
  // offen und dominierte die Sicherheitskarte, obwohl ein Passwortwechsel eine
  // seltene, bewusste Handlung ist. Regeln, Felder und API sind unverändert.
  const [pwOpen, setPwOpen] = useState(false);

  const pwToggleRef = useRef(null);
  const pwFirstFieldRef = useRef(null);
  // Fokus folgt der Nutzeraktion: beim Öffnen ins erste Feld, beim Schließen
  // zurück auf den auslösenden Knopf. `pwReturnFocus` verhindert, dass der
  // Fokus beim Erst-Mount gestohlen wird.
  const pwReturnFocus = useRef(false);
  useEffect(() => {
    if (pwOpen) { pwFirstFieldRef.current?.focus(); return; }
    if (pwReturnFocus.current) { pwToggleRef.current?.focus(); pwReturnFocus.current = false; }
  }, [pwOpen]);

  const updPw = (k, v) => setPwForm(p => ({ ...p, [k]: v }));

  // Öffnen startet immer mit leeren Feldern und ohne Altmeldungen.
  const openPwForm = () => {
    setPwForm(EMPTY_PW_FORM);
    setPwError("");
    setPwSuccess(false);
    setPwOpen(true);
  };

  // Abbrechen stellt den geschlossenen Zustand wieder her und verwirft die
  // Eingaben — ein halb ausgefülltes Passwortformular soll nicht stehen bleiben.
  const closePwForm = () => {
    if (pwSaving) return;
    setPwForm(EMPTY_PW_FORM);
    setPwError("");
    pwReturnFocus.current = true;
    setPwOpen(false);
  };

  const validatePwForm = () => {
    const { currentPassword, newPassword, newPasswordConfirm } = pwForm;
    if (!currentPassword) return "Bitte geben Sie Ihr aktuelles Passwort ein.";
    if (!newPassword) return "Bitte geben Sie ein neues Passwort ein.";
    // Länge über die zentrale Regel; die beiden Wortlaute bleiben unverändert.
    const lengthError = passwordLengthError(newPassword, PW_CHANGE_TEXTS);
    if (lengthError) return lengthError;
    if (newPassword === currentPassword) return "Das neue Passwort darf nicht mit dem aktuellen Passwort identisch sein.";
    if (newPasswordConfirm !== newPassword) return "Die neuen Passwörter stimmen nicht überein.";
    return "";
  };

  const handlePasswordChange = async () => {
    setPwSuccess(false);
    const validationError = validatePwForm();
    if (validationError) { setPwError(validationError); return; }

    setPwError("");
    setPwSaving(true);
    try {
      // Bewusst kein `auth: true`: apiFetch würde bei 401 automatisch das
      // Token entfernen + Logout auslösen. Ein 401 hier bedeutet aber
      // "aktuelles Passwort falsch", nicht "Session ungültig" — die gültige
      // Session darf erhalten bleiben. Der Auth-Header wird daher manuell
      // über authH() gesetzt.
      const r = await apiFetch(`/kunde/password`, {
        method: "PATCH",
        headers: authH(),
        body: JSON.stringify(pwForm),
      });
      if (r.ok) {
        setPwSuccess(true);
        setPwForm(EMPTY_PW_FORM);
        // Erfolgreich geändert → der Bereich schließt sich wieder; die
        // Erfolgsmeldung bleibt als Quittung sichtbar.
        pwReturnFocus.current = true;
        setPwOpen(false);
      } else if (r.status === 401) {
        const d = await r.json().catch(() => ({}));
        // P3: Token wurde serverseitig bereits invalidiert (z.B. Passwort in
        // einem anderen Tab geändert) — dann ist es keine Falscheingabe,
        // sondern eine abgelaufene Session. Gleicher Logout-Pfad wie bei
        // jedem anderen 401 auf einem `auth: true`-Request.
        if (d.error === "Sitzung abgelaufen. Bitte melden Sie sich erneut an.") {
          triggerAuthError();
        } else {
          setPwError("Das aktuelle Passwort ist nicht korrekt.");
        }
      } else if (r.status === 429) {
        setPwError("Zu viele Versuche. Bitte versuchen Sie es später erneut.");
      } else {
        const d = await r.json().catch(() => ({}));
        setPwError(d.error || "Passwort konnte nicht geändert werden. Bitte versuchen Sie es erneut.");
      }
    } catch {
      setPwError("Passwort konnte nicht geändert werden. Bitte versuchen Sie es erneut.");
    }
    setPwSaving(false);
  };

  return (
    <div className="profile-form-body profile-password-section">
      <div className="profile-password-row">
        <div className="profile-password-copy">
          <span className="profile-password-title">Passwort</span>
          <p className="profile-password-desc">Ändern Sie Ihr Passwort regelmäßig, um Ihr Konto zu schützen.</p>
        </div>
        {!pwOpen && (
          <button
            type="button"
            ref={pwToggleRef}
            className="btn btn-outline btn-sm"
            onClick={openPwForm}
            aria-expanded={false}
          >
            Passwort ändern
          </button>
        )}
      </div>

      {/* Die Erfolgsmeldung bleibt auch nach dem Schließen stehen — sie ist
          die Quittung der abgeschlossenen Handlung. */}
      {pwSuccess && (
        <FormAlert tone="success" message="Passwort erfolgreich geändert." />
      )}

      {pwOpen && (
        <div className="profile-password-form">
          {pwError && <FormAlert tone="error" message={pwError} />}

          <PasswordField
            dark={false}
            id="pf-pw-current"
            inputRef={pwFirstFieldRef}
            label="Aktuelles Passwort"
            value={pwForm.currentPassword}
            onChange={(e) => updPw("currentPassword", e.target.value)}
            autoComplete="current-password"
          />
          <PasswordField
            dark={false}
            id="pf-pw-new"
            label="Neues Passwort"
            value={pwForm.newPassword}
            onChange={(e) => updPw("newPassword", e.target.value)}
            autoComplete="new-password"
          />
          <PasswordField
            dark={false}
            id="pf-pw-confirm"
            label="Neues Passwort wiederholen"
            value={pwForm.newPasswordConfirm}
            onChange={(e) => updPw("newPasswordConfirm", e.target.value)}
            autoComplete="new-password"
          />

          <div className="profile-form-actions">
            <button type="button" className="btn btn-outline" onClick={closePwForm} disabled={pwSaving}>Abbrechen</button>
            <button type="button" className="btn btn-primary" onClick={handlePasswordChange} disabled={pwSaving}>
              {pwSaving ? <><span className="spinner" /> Wird geändert…</> : "Passwort ändern"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PasswordChangeSection;
