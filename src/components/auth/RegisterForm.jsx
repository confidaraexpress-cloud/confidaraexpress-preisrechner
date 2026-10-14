import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { PasswordField } from "../ui/PasswordField";
import { useLaunchScope } from "../../hooks/useLaunchScope";
import { API } from "../../api/client";
import { B2B_NOTICE, B2B_ACTIVATION_NOTE, REG_DECLARATION_TEXTS } from "../../utils/registrationValidation.mjs";
// Die sichtbare Zusage „min. 8 Zeichen" kommt aus derselben Konstante wie die
// Prüfung — Text und Regel können damit nicht auseinanderlaufen.
import { PASSWORD_MIN_LEN } from "../../utils/passwordPolicy.mjs";

// Pflichtfeld-Markierung. Das Sternchen ist rein visuell (aria-hidden) — für
// Screenreader trägt das jeweilige Eingabefeld required/aria-required.
const Req = () => <span className="auth-req" aria-hidden="true">*</span>;

// Eine Pflicht-Checkbox im Stil der übrigen Auth-Checkboxen (role="checkbox", Tastatur).
// Ein Link im Text schaltet die Checkbox NICHT um — Lesen ist keine Zustimmung.
function Erklaerung({ id, checked, onToggle, error, children }) {
  const toggle = () => onToggle(!checked);
  return (
    <>
      <div
        id={id}
        className={`auth-check auth-declaration ${checked ? "checked" : ""}`}
        onClick={toggle}
        role="checkbox"
        aria-checked={checked === true}
        aria-required="true"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } }}
      >
        <span className="auth-checkbox" />
        <span>{children} <Req /></span>
      </div>
      {error && <span className="auth-field-error" id={`${id}-error`}>{error}</span>}
    </>
  );
}

export function RegisterForm({
  form, onChange, onRegister, loading, errors = {}, regValid = true, passwordRepeat = "", onPasswordRepeatChange, onPasswordBlur,
  // Paket C: Erklärungen (Unternehmer, AGB) und die angezeigte AGB-Fassung (oder null).
  declarations = {}, onDeclarationChange = () => {}, legalContext = null,
  // Nur noch die Erklärungen fehlen: der Knopf ist gesperrt, der Grund steht unter den Erklärungen.
  declarationsMissingOnly = false,
}) {
  // Nur die Länder, die ConfidaraExpress heute anbietet — die Liste kommt vom Server
  // (GET /api/shipping/launch-scope), nicht aus einer zweiten Aufzählung im Client.
  const { countries: launchCountries } = useLaunchScope();
  const upd = (k, v) => onChange(k, v);
  // AGB-Link: die angezeigte, versionierte Fassung (PDF auf der API) — sonst die Webseite.
  const agb = legalContext && legalContext.terms ? legalContext.terms : null;
  const ohneUmschalten = (e) => e.stopPropagation();
  const agbLink = agb
    ? <a href={`${API}${agb.url}`} target="_blank" rel="noopener noreferrer" onClick={ohneUmschalten}>Allgemeinen Geschäftsbedingungen</a>
    : <Link to="/agb" target="_blank" rel="noopener noreferrer" onClick={ohneUmschalten}>Allgemeinen Geschäftsbedingungen</Link>;
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
          <label className="auth-field-label" htmlFor="reg-password">Passwort (min. {PASSWORD_MIN_LEN} Zeichen) <Req /></label>
        </div>
        <div className="auth-input-wrap">
          <span className="auth-input-ico"><Icon n="lock" s={18} /></span>
          <PasswordField
            slim
            id="reg-password"
            value={form.password}
            onChange={(e) => upd("password", e.target.value)}
            /* Der CTA ist bei zu kurzem Passwort deaktiviert — und Chromium
               unterdrückt dann auch die implizite Formularabsendung per Enter.
               Ohne diese Rückmeldung sähe der Kunde einen gesperrten Knopf ganz
               ohne Begründung (im UAT gemessen). Bewusst beim Verlassen des
               Feldes, nicht beim Tippen: sonst stünde schon nach dem ersten
               Zeichen „mindestens 8 Zeichen". */
            onBlur={() => onPasswordBlur?.()}
            placeholder={`Mind. ${PASSWORD_MIN_LEN} Zeichen`}
            autoComplete="new-password"
            required
            aria-required="true"
          />
        </div>
        {errors.password && <span className="auth-field-error">{errors.password}</span>}
      </div>

      <div className="auth-field">
        <div className="auth-field-row">
          <label className="auth-field-label" htmlFor="reg-password-repeat">Passwort wiederholen <Req /></label>
        </div>
        <div className="auth-input-wrap">
          <span className="auth-input-ico"><Icon n="lock" s={18} /></span>
          <PasswordField
            slim
            id="reg-password-repeat"
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
          <label className="auth-field-label" htmlFor="reg-street">Straße &amp; Hausnummer</label>
        </div>
        <div className="auth-input-wrap">
          <input
            id="reg-street"
            className={`auth-input auth-input-no-icon${errors.street ? " auth-input-error" : ""}`}
            value={form.street}
            onChange={(e) => upd("street", e.target.value)}
            placeholder="Musterstraße 12"
            autoComplete="street-address"
            aria-invalid={errors.street ? "true" : undefined}
          />
        </div>
        {errors.street && <span className="auth-field-error">{errors.street}</span>}
      </div>

      <div className="field-row field-row-3">
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label" htmlFor="reg-zip">PLZ</label>
          </div>
          <div className="auth-input-wrap">
            <input
              id="reg-zip"
              className={`auth-input auth-input-no-icon${errors.zip ? " auth-input-error" : ""}`}
              value={form.zip}
              onChange={(e) => upd("zip", e.target.value)}
              autoComplete="postal-code"
              inputMode="numeric"
              aria-invalid={errors.zip ? "true" : undefined}
            />
          </div>
          {errors.zip && <span className="auth-field-error">{errors.zip}</span>}
        </div>
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label" htmlFor="reg-city">Stadt</label>
          </div>
          <div className="auth-input-wrap">
            <input
              id="reg-city"
              className={`auth-input auth-input-no-icon${errors.city ? " auth-input-error" : ""}`}
              value={form.city}
              onChange={(e) => upd("city", e.target.value)}
              autoComplete="address-level2"
              aria-invalid={errors.city ? "true" : undefined}
            />
          </div>
          {errors.city && <span className="auth-field-error">{errors.city}</span>}
        </div>
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label" htmlFor="reg-country">Land</label>
          </div>
          <div className="auth-input-wrap">
            <select
              id="reg-country"
              className="auth-input auth-select auth-input-no-icon"
              value={form.country}
              onChange={(e) => upd("country", e.target.value)}
              autoComplete="country"
            >
              {launchCountries.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Paket C: die Erklärungen stehen VOR dem Absenden und werden mit dem Konto
          gespeichert. Die Datenschutzerklärung wird nur verlinkt — keine Einwilligungsbox. */}
      <div className="auth-declarations">
        <Erklaerung
          id="reg-business"
          checked={declarations.businessCustomerConfirmed === true}
          onToggle={(v) => onDeclarationChange("businessCustomerConfirmed", v)}
          error={errors.businessCustomerConfirmed}
        >
          {REG_DECLARATION_TEXTS.business}
        </Erklaerung>
        <Erklaerung
          id="reg-terms"
          checked={declarations.termsAcknowledged === true}
          onToggle={(v) => onDeclarationChange("termsAcknowledged", v)}
          error={errors.termsAcknowledged}
        >
          Ich stimme der Geltung der {agbLink}
          {/* Die Fassung bricht nie im Datum um („2026-“ / „08"). */}
          {agb ? <> <span className="auth-nowrap">(Stand {agb.version})</span>{agb.labelSuffix ? <> {agb.labelSuffix}</> : null}</> : null} zu.
        </Erklaerung>
        {declarationsMissingOnly && (
          <p className="auth-declaration-hint" role="status">{REG_DECLARATION_TEXTS.missingHint}</p>
        )}
      </div>

      <button type="submit" className="auth-cta" disabled={loading || !regValid}>
        <span>{loading ? "Wird erstellt…" : "Konto beantragen"}</span>
        <span className="auth-cta-arrow"><Icon n="arrowRight" s={18} /></span>
      </button>

      <p className="auth-form-legal">
        Wie wir Ihre Daten verarbeiten, erklärt unsere{" "}
        <Link to="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutzerklärung</Link>.
      </p>
    </form>
  );
}
