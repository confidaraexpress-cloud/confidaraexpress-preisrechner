import React from "react";
import { Icon } from "../ui/Icon";
import { PasswordField } from "../ui/PasswordField";

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
              <label className="auth-field-label">Neues Passwort</label>
            </div>
            <div className="auth-input-wrap">
              <span className="auth-input-ico"><Icon n="lock" s={18} /></span>
              <PasswordField
                slim
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="Mind. 8 Zeichen"
              />
            </div>
          </div>
          <div className="auth-field">
            <div className="auth-field-row">
              <label className="auth-field-label">Passwort bestätigen</label>
            </div>
            <div className="auth-input-wrap">
              <span className="auth-input-ico"><Icon n="lock" s={18} /></span>
              <PasswordField
                slim
                value={confirmPassword}
                onChange={(e) => onConfirmChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSubmit()}
                placeholder="••••••••••"
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
