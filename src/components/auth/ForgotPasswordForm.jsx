import React from "react";

export function ForgotPasswordForm({ email, onChange, onSubmit, onBack, loading, error, success }) {
  return (
    <div className="auth-card animate-fadeUp">
      <div className="auth-card-top">
        <div className="auth-card-icon">🔑</div>
        <h1 className="auth-card-title">Passwort vergessen</h1>
        <p className="auth-card-desc">
          Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Reset-Link.
        </p>
      </div>
      {error && <div className="auth-alert auth-alert-error">{error}</div>}
      {success && <div className="auth-alert auth-alert-success">{success}</div>}
      {!success && (
        <>
          <div className="field">
            <label className="auth-label">E-Mail-Adresse</label>
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              placeholder="firma@beispiel.de"
              autoFocus
            />
          </div>
          <button
            className="auth-btn-primary"
            onClick={onSubmit}
            disabled={loading || !email}
          >
            {loading ? <span className="spinner" /> : "Reset-Link senden"}
          </button>
        </>
      )}
      <button className="auth-btn-ghost" onClick={onBack}>
        ← Zurück zum Login
      </button>
    </div>
  );
}
