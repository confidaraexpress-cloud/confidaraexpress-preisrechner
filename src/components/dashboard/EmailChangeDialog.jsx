import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { PasswordField } from "../ui/PasswordField";
import { validateEmailChangeForm, isEmailChangeFormValid, EMAIL_MAX_LENGTH } from "../../utils/emailChangeView.mjs";

// Startdialog „E-Mail-Adresse ändern". Heller, zentrierter Modal-Dialog (wie die
// bestehenden Bestätigungsdialoge) mit vollständigem Fokusmanagement:
// initialer Fokus auf die neue E-Mail, Fokusfalle (Tab zyklisch innerhalb des
// Dialogs), Escape schließt (außer während eines laufenden Requests) und der
// Fokus kehrt beim Schließen zum auslösenden Element zurück.
//
// Der Dialog hält Passwort und neue E-Mail ausschließlich in LOKALEM State und
// wird beim Schließen ausgehängt → nichts (insb. das Passwort) bleibt danach im
// Speicher erhalten. Getrimmt wird die E-Mail erst beim Absenden; niemals
// kleingeschrieben (case-sensitive Backend-Semantik).
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select, textarea, [href], [tabindex]:not([tabindex="-1"])';

export function EmailChangeDialog({ currentEmail, busy, error, onSubmit, onClose }) {
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [attempted, setAttempted] = useState(false);

  const dialogRef = useRef(null);
  const newEmailRef = useRef(null);
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);
  // Aktuelle busy/onClose über Refs, damit der Effekt GENAU EINMAL beim Mount
  // läuft (Fokus + Listener) und trotzdem nie veraltete Werte liest — kein
  // erneutes Fokussieren, wenn während des Requests busy wechselt.
  const busyRef = useRef(busy); busyRef.current = busy;
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;

  const errors = validateEmailChangeForm({ newEmail, currentPassword }, currentEmail);
  const valid = isEmailChangeFormValid({ newEmail, currentPassword }, currentEmail);
  // Inline-Fehler für die neue E-Mail: sobald etwas eingegeben wurde (Live-
  // Feedback zu Format/„identisch") oder nach einem Absendeversuch.
  const showNewEmailError = errors.newEmail && (attempted || newEmail.trim().length > 0);

  useEffect(() => {
    newEmailRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { if (!busyRef.current) onCloseRef.current?.(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    const opener = openerRef.current;
    return () => {
      document.removeEventListener("keydown", onKey, true);
      opener?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    setAttempted(true);
    if (!valid || busy) return;
    // Trimmen erst beim Absenden; KEIN Lowercasing.
    onSubmit(newEmail.trim(), currentPassword);
  };

  return (
    <div className="email-change-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div
        ref={dialogRef}
        className="email-change-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ec-dialog-title"
        aria-describedby="ec-dialog-desc"
      >
        <div className="email-change-modal-head">
          <div className="email-change-modal-icon" aria-hidden="true"><Icon n="mail" s={20} /></div>
          <h2 id="ec-dialog-title" className="email-change-modal-title">E-Mail-Adresse ändern</h2>
        </div>
        <p id="ec-dialog-desc" className="email-change-modal-desc">
          Die neue Adresse wird erst nach Bestätigung über den zugesendeten Link als
          Login-E-Mail übernommen.
        </p>

        {error && (
          <div className="alert alert-error mb-16" role="alert">
            <Icon n="x" s={16} /><span>{error}</span>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="field">
            <label className="field-label" htmlFor="ec-current-email">Aktuelle E-Mail-Adresse</label>
            <input
              id="ec-current-email"
              className="field-input email-change-readonly"
              type="email"
              value={currentEmail || ""}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="ec-new-email">Neue E-Mail-Adresse</label>
            <input
              id="ec-new-email"
              ref={newEmailRef}
              className={`field-input${showNewEmailError ? " field-input-error" : ""}`}
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={EMAIL_MAX_LENGTH}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              aria-invalid={showNewEmailError ? "true" : undefined}
              aria-describedby={showNewEmailError ? "ec-new-email-err" : undefined}
              placeholder="neue-adresse@firma.de"
            />
            {showNewEmailError && <span id="ec-new-email-err" className="field-error" role="alert">{errors.newEmail}</span>}
          </div>

          <PasswordField
            dark={false}
            label="Aktuelles Passwort"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />

          <div className="email-change-modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Abbrechen</button>
            <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
              {busy ? <><span className="spinner" /> Wird geprüft …</> : <><Icon n="mail" s={14} /> Änderung bestätigen</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
