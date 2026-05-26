import React from "react";
import { Icon } from "../ui/Icon";
import { PasswordField } from "../ui/PasswordField";

export function LoginForm({ form, onChange, onLogin, onForgot, loading, rememberMe, onRememberMe }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onLogin(); }}>
      <div className="auth-field">
        <div className="auth-field-row">
          <label className="auth-field-label" htmlFor="auth-email">E-Mail-Adresse</label>
        </div>
        <div className="auth-input-wrap">
          <span className="auth-input-ico"><Icon n="mail" s={18} /></span>
          <input
            id="auth-email"
            className="auth-input"
            type="email"
            autoComplete="email"
            placeholder="firma@beispiel.de"
            value={form.email}
            onChange={(e) => onChange("email", e.target.value)}
            autoFocus
          />
        </div>
      </div>

      <div className="auth-field">
        <div className="auth-field-row">
          <label className="auth-field-label" htmlFor="auth-password">Passwort</label>
          <button type="button" className="auth-field-link" onClick={onForgot}>Vergessen?</button>
        </div>
        <div className="auth-input-wrap">
          <span className="auth-input-ico"><Icon n="lock" s={18} /></span>
          <PasswordField
            slim
            id="auth-password"
            value={form.password}
            onChange={(e) => onChange("password", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onLogin()}
            placeholder="••••••••••"
            autoComplete="current-password"
          />
        </div>
      </div>

      <div className="auth-row">
        <div
          className={`auth-check ${rememberMe ? "checked" : ""}`}
          onClick={() => onRememberMe(!rememberMe)}
          role="checkbox"
          aria-checked={rememberMe}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onRememberMe(!rememberMe); } }}
        >
          <span className="auth-checkbox" />
          <span>30 Tage angemeldet bleiben</span>
        </div>
      </div>

      <button type="submit" className="auth-cta" disabled={loading}>
        <span>{loading ? "Wird angemeldet…" : "Anmelden"}</span>
        <span className="auth-cta-arrow"><Icon n="arrowRight" s={18} /></span>
      </button>
    </form>
  );
}
