import React from "react";
import { Icon } from "../ui/Icon";
import { PasswordField } from "../ui/PasswordField";

// Beide Felder tragen autocomplete="new-password" und eine Beschriftung per htmlFor (Admin-Anmeldung, Canonical v2.130):
// Passwortmanager schlagen dann ein starkes, neues Passwort vor; sichtbar ändert sich nichts.
export function ResetPasswordForm({ password, confirmPassword, onPasswordChange, onConfirmChange, onSubmit, loading, error, success }) {
  return (
    <div className="auth-card animate-fadeUp" style={{ width: "100%", maxWidth: "480px" }}>
      <div className="auth-card-top">
        <div className="auth-card-icon" aria-hidden="true"><Icon n="shieldCheck" s={40} /></div>
        <h2 className="auth-card-title">Neues Passwort</h2>
        <p className="auth-card-desc">
          Wählen Sie ein sicheres Passwort mit mindestens 8 Zeichen.
        </p>
      </div>
      {error   && <div className="auth-alert auth-alert-error" role="alert">{error}</div>}
      {success && <div className="auth-alert auth-alert-success">{success}</div>}
      {!success && (
        <>
          <div className="auth-field">
            <div className="auth-field-row">
              <label className="auth-field-label" htmlFor="reset-password">Neues Passwort</label>
            </div>
            <div className="auth-input-wrap">
              <span className="auth-input-ico"><Icon n="lock" s={18} /></span>
              <PasswordField
                slim
                id="reset-password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                autoComplete="new-password"
                placeholder="Mind. 8 Zeichen"
              />
            </div>
          </div>
          <div className="auth-field">
            <div className="auth-field-row">
              <label className="auth-field-label" htmlFor="reset-password-confirm">Passwort bestätigen</label>
            </div>
            <div className="auth-input-wrap">
              <span className="auth-input-ico"><Icon n="lock" s={18} /></span>
              <PasswordField
                slim
                id="reset-password-confirm"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => onConfirmChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSubmit()}
                placeholder="Passwort erneut eingeben"
              />
            </div>
          </div>
          <button className="auth-cta" onClick={onSubmit} disabled={loading || !password}>
            <span>{loading ? "Wird gespeichert…" : "Passwort speichern"}</span>
            <span className="auth-cta-arrow"><Icon n="arrowRight" s={18} /></span>
          </button>
        </>
      )}
    </div>
  );
}
