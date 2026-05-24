import React from "react";
import { PasswordField } from "../ui/PasswordField";

export function ResetPasswordForm({ password, confirmPassword, onPasswordChange, onConfirmChange, onSubmit, loading, error, success }) {
  return (
    <div className="auth-card animate-fadeUp">
      <div className="auth-card-top">
        <div className="auth-card-icon">🔒</div>
        <h1 className="auth-card-title">Neues Passwort</h1>
        <p className="auth-card-desc">
          Wählen Sie ein sicheres Passwort mit mindestens 8 Zeichen.
        </p>
      </div>
      {error && <div className="auth-alert auth-alert-error">{error}</div>}
      {success && <div className="auth-alert auth-alert-success">{success}</div>}
      {!success && (
        <>
          <PasswordField
            label="Neues Passwort"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
          />
          <PasswordField
            label="Passwort bestätigen"
            value={confirmPassword}
            onChange={(e) => onConfirmChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          />
          <button
            className="auth-btn-primary"
            onClick={onSubmit}
            disabled={loading || !password}
          >
            {loading ? <span className="spinner" /> : "Passwort speichern"}
          </button>
        </>
      )}
    </div>
  );
}
