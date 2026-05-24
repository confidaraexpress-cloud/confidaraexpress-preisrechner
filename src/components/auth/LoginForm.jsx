import React from "react";
import { PasswordField } from "../ui/PasswordField";

export function LoginForm({ form, onChange, onLogin, onForgot, loading, rememberMe, onRememberMe }) {
  return (
    <>
      <div className="field">
        <label className="auth-label">E-Mail-Adresse</label>
        <input
          className="auth-input"
          type="email"
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          placeholder="firma@beispiel.de"
          autoFocus
        />
      </div>
      <div className="field">
        <div className="auth-label-row">
          <label className="auth-label">Passwort</label>
          <span className="auth-link" onClick={onForgot}>Vergessen?</span>
        </div>
        <PasswordField
          value={form.password}
          onChange={(e) => onChange("password", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onLogin()}
        />
      </div>
      <label className="auth-check-label">
        <input type="checkbox" checked={rememberMe} onChange={(e) => onRememberMe(e.target.checked)} />
        <span>30 Tage angemeldet bleiben</span>
      </label>
      <button className="auth-btn-primary" onClick={onLogin} disabled={loading}>
        {loading ? <span className="spinner" /> : "Anmelden →"}
      </button>
    </>
  );
}
