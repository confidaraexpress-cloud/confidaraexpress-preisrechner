import React from "react";
import { Icon } from "../ui/Icon";

export function ForgotPasswordForm({ email, onChange, onSubmit, onBack, loading, error, success }) {
  return (
    <div className="auth-card animate-fadeUp" style={{ width: "100%", maxWidth: "480px" }}>
      <div className="auth-card-top">
        <div className="auth-card-icon">🔑</div>
        <h2 className="auth-card-title">Passwort vergessen</h2>
        <p className="auth-card-desc">
          Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Reset-Link.
        </p>
      </div>
      {error   && <div className="auth-alert auth-alert-error">{error}</div>}
      {success && <div className="auth-alert auth-alert-success">{success}</div>}
      {!success && (
        <>
          <div className="auth-field">
            <div className="auth-field-row">
              <label className="auth-field-label" htmlFor="forgot-email">E-Mail-Adresse</label>
            </div>
            <div className="auth-input-wrap">
              <span className="auth-input-ico"><Icon n="mail" s={18} /></span>
              <input
                id="forgot-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSubmit()}
                placeholder="firma@beispiel.de"
                autoFocus
              />
            </div>
          </div>
          <button className="auth-cta" onClick={onSubmit} disabled={loading || !email}>
            <span>{loading ? "Wird gesendet…" : "Reset-Link senden"}</span>
            <span className="auth-cta-arrow"><Icon n="arrowRight" s={18} /></span>
          </button>
        </>
      )}
      <button className="auth-btn-ghost" onClick={onBack}>
        ← Zurück zum Login
      </button>
    </div>
  );
}
