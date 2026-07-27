import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { PasswordField } from "../ui/PasswordField";
import { countries } from "../../utils/countries";
import { B2B_NOTICE, B2B_ACTIVATION_NOTE } from "../../utils/registrationValidation.mjs";

// Pflichtfeld-Markierung. Das Sternchen ist rein visuell (aria-hidden) — für
// Screenreader trägt das jeweilige Eingabefeld required/aria-required.
const Req = () => <span className="auth-req" aria-hidden="true">*</span>;

export function RegisterForm({ form, onChange, onRegister, loading, errors = {}, regValid = true, passwordRepeat = "", onPasswordRepeatChange }) {
  const upd = (k, v) => onChange(k, v);
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); onRegister(); }}>
      {/* Kein Kontotyp-Schalter: ConfidaraExpress kennt ausschließlich Firmenkonten. */}
      <div className="auth-alert auth-alert-info auth-b2b-notice">
        <strong>{B2B_NOTICE}</strong>
        <span className="auth-b2b-notice-sub">{B2B_ACTIVATION_NOTE}</span>
      </div>

      <div className="field-row field-row-2">
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label" htmlFor="reg-name">Ansprechpartner <Req /></label>
          </div>
          <div className="auth-input-wrap">
            <span className="auth-input-ico"><Icon n="user" s={18} /></span>
            <input
              id="reg-name"
              className={`auth-input${errors.name ? " auth-input-error" : ""}`}
              value={form.name}
              onChange={(e) => upd("name", e.target.value)}
              placeholder="Max Mustermann"
              autoComplete="name"
              required
              aria-required="true"
              aria-invalid={errors.name ? "true" : undefined}
              autoFocus
            />
          </div>
          {errors.name && <span className="auth-field-error">{errors.name}</span>}
        </div>
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label" htmlFor="reg-email">Geschäftliche E-Mail <Req /></label>
          </div>
          <div className="auth-input-wrap">
            <span className="auth-input-ico"><Icon n="mail" s={18} /></span>
            <input
              id="reg-email"
              className={`auth-input${errors.email ? " auth-input-error" : ""}`}
              type="email"
              value={form.email}
              onChange={(e) => upd("email", e.target.value)}
              placeholder="firma@beispiel.de"
              autoComplete="email"
              inputMode="email"
              required
              aria-required="true"
              aria-invalid={errors.email ? "true" : undefined}
            />
          </div>
          {errors.email && <span className="auth-field-error">{errors.email}</span>}
        </div>
      </div>

      <div className="auth-field">
        <div className="auth-field-row">
          <label className="auth-field-label">Passwort (min. 8 Zeichen) <Req /></label>
        </div>
        <div className="auth-input-wrap">
          <span className="auth-input-ico"><Icon n="lock" s={18} /></span>
          <PasswordField
            slim
            value={form.password}
            onChange={(e) => upd("password", e.target.value)}
            placeholder="Mind. 8 Zeichen"
            autoComplete="new-password"
            required
            aria-required="true"
          />
        </div>
        {errors.password && <span className="auth-field-error">{errors.password}</span>}
      </div>

      <div className="auth-field">
        <div className="auth-field-row">
          <label className="auth-field-label">Passwort wiederholen <Req /></label>
        </div>
        <div className="auth-input-wrap">
          <span className="auth-input-ico"><Icon n="lock" s={18} /></span>
          <PasswordField
            slim
            value={passwordRepeat}
            onChange={(e) => onPasswordRepeatChange(e.target.value)}
            placeholder="Passwort erneut eingeben"
            autoComplete="new-password"
            required
            aria-required="true"
          />
        </div>
        {errors.passwordRepeat && <span className="auth-field-error">{errors.passwordRepeat}</span>}
      </div>

      <span className="auth-section-label">Unternehmen</span>

      <div className="field-row field-row-2">
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label" htmlFor="reg-company">Firmenname <Req /></label>
          </div>
          <div className="auth-input-wrap">
            <input
              id="reg-company"
              className={`auth-input auth-input-no-icon${errors.company_name ? " auth-input-error" : ""}`}
              value={form.company_name}
              onChange={(e) => upd("company_name", e.target.value)}
              placeholder="Muster Logistik GmbH"
              autoComplete="organization"
              required
              aria-required="true"
              aria-invalid={errors.company_name ? "true" : undefined}
            />
          </div>
          {errors.company_name && <span className="auth-field-error">{errors.company_name}</span>}
        </div>
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label" htmlFor="reg-vat">USt-ID <span className="auth-optional">(optional)</span></label>
          </div>
          <div className="auth-input-wrap">
            <input
              id="reg-vat"
              className={`auth-input auth-input-no-icon${errors.vat_id ? " auth-input-error" : ""}`}
              value={form.vat_id}
              onChange={(e) => upd("vat_id", e.target.value)}
              placeholder="DE123456789"
              autoComplete="off"
            />
          </div>
          {errors.vat_id && <span className="auth-field-error">{errors.vat_id}</span>}
        </div>
      </div>

      <span className="auth-section-label">Adresse <span className="auth-optional">(optional)</span></span>

      <div className="auth-field">
        <div className="auth-field-row">
          <label className="auth-field-label">Straße &amp; Hausnummer</label>
        </div>
        <div className="auth-input-wrap">
          <input
            className={`auth-input auth-input-no-icon${errors.street ? " auth-input-error" : ""}`}
            value={form.street}
            onChange={(e) => upd("street", e.target.value)}
            placeholder="Musterstraße 12"
            autoComplete="street-address"
          />
        </div>
        {errors.street && <span className="auth-field-error">{errors.street}</span>}
      </div>

      <div className="field-row field-row-3">
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label">PLZ</label>
          </div>
          <div className="auth-input-wrap">
            <input
              className={`auth-input auth-input-no-icon${errors.zip ? " auth-input-error" : ""}`}
              value={form.zip}
              onChange={(e) => upd("zip", e.target.value)}
              autoComplete="postal-code"
              inputMode="numeric"
            />
          </div>
          {errors.zip && <span className="auth-field-error">{errors.zip}</span>}
        </div>
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label">Stadt</label>
          </div>
          <div className="auth-input-wrap">
            <input
              className={`auth-input auth-input-no-icon${errors.city ? " auth-input-error" : ""}`}
              value={form.city}
              onChange={(e) => upd("city", e.target.value)}
              autoComplete="address-level2"
            />
          </div>
          {errors.city && <span className="auth-field-error">{errors.city}</span>}
        </div>
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label">Land</label>
          </div>
          <div className="auth-input-wrap">
            <select
              className="auth-input auth-select auth-input-no-icon"
              value={form.country}
              onChange={(e) => upd("country", e.target.value)}
              autoComplete="country"
            >
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <button type="submit" className="auth-cta" disabled={loading || !regValid}>
        <span>{loading ? "Wird erstellt…" : "Konto beantragen"}</span>
        <span className="auth-cta-arrow"><Icon n="arrowRight" s={18} /></span>
      </button>

      <p className="auth-form-legal">
        Mit der Registrierung akzeptieren Sie die{" "}
        <Link to="/agb" target="_blank" rel="noopener noreferrer">AGB</Link> und{" "}
        <Link to="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutzerklärung</Link>.
      </p>
    </form>
  );
}
