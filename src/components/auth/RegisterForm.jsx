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
import { AddressSuggestInput } from "../address/AddressSuggestInput";
import { useAddressValidation } from "../../hooks/useAddressValidation";
import { applyAddressSuggestion, cityFromSuggestion, countryFirstHint } from "../../utils/addressValidationView.mjs";
import { cityPlaceholder } from "../../utils/addressPlaceholders.mjs";
import { postalCodeExample, postalCodeInputMode } from "../../utils/postalCode.mjs";
import { VAT_ID_TEXT, VAT_ID_ABSENT_TEXT, LEGAL_FORMS_WITHOUT_VAT_ID } from "../../utils/vatId.mjs";

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
  form, onChange, onRegister, loading, errors = {}, regValid = true, passwordRepeat = "", onPasswordRepeatChange, onPasswordBlur, onVatBlur,
  // Paket C: Erklärungen (Unternehmer, AGB) und die angezeigte AGB-Fassung (oder null).
  declarations = {}, onDeclarationChange = () => {}, legalContext = null,
  // Nur noch die Erklärungen fehlen: der Knopf ist gesperrt, der Grund steht unter den Erklärungen.
  declarationsMissingOnly = false,
}) {
  // Nur die Länder, die ConfidaraExpress heute anbietet — die Liste kommt vom Server
  // (GET /api/shipping/launch-scope), nicht aus einer zweiten Aufzählung im Client.
  const { countries: launchCountries } = useLaunchScope();
  // Adressvorschläge auch ohne Anmeldung — über die öffentlichen Routen mit eigener Grenze
  // je IP und eigenem kleinen Kontingent; eine Gesamtprüfung gibt es hier nicht. Die Adresse
  // bleibt optional, die Registrierung hängt nie an den Vorschlägen.
  const addressHelp = useAddressValidation({
    country: form.country, postalCode: form.zip, city: form.city, street: form.street, publicAccess: true,
  });
  const applyAddress = (item) => {
    const patch = applyAddressSuggestion({ country: form.country, street: form.street }, item);
    if (!patch.street) return;
    addressHelp.markSelected(patch.street);
    onChange("street", patch.street);
    if (patch.postalCode) onChange("zip", patch.postalCode);
    if (patch.city) onChange("city", patch.city);
  };
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
          {form.vat_id_absent !== true && (
            <>
              <div className="auth-field-row">
                <label className="auth-field-label" htmlFor="reg-vat">{VAT_ID_TEXT.label} <Req /></label>
              </div>
              <div className="auth-input-wrap">
                {/* Auftrag 2 / P10: Pflichtfeld — Format nach Länderpräfix, keine behördliche Bestätigung. */}
                <input
                  id="reg-vat"
                  className={`auth-input auth-input-no-icon${errors.vat_id ? " auth-input-error" : ""}`}
                  value={form.vat_id}
                  onChange={(e) => upd("vat_id", e.target.value)}
                  onBlur={() => onVatBlur?.()}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={20}
                  required
                  aria-required="true"
                  aria-invalid={errors.vat_id ? "true" : undefined}
                  aria-describedby="reg-vat-hint"
                />
              </div>
              <span className="auth-field-hint" id="reg-vat-hint">{VAT_ID_TEXT.hint}</span>
              {errors.vat_id && <span className="auth-field-error">{errors.vat_id}</span>}
            </>
          )}
          {/* Paket D (D2/D3): ausdrücklich ohne USt-IdNr. — Rechtsform statt Nummer, Sitz Deutschland, manuelle
              Prüfung durch das Team. Dieselbe Checkbox-Form wie die Erklärungen (Tastatur, role=checkbox). */}
          <div
            id="reg-vat-absent"
            className={`auth-check auth-declaration ${form.vat_id_absent === true ? "checked" : ""}`}
            onClick={() => upd("vat_id_absent", form.vat_id_absent !== true)}
            role="checkbox"
            aria-checked={form.vat_id_absent === true}
            aria-invalid={errors.vat_id_absent ? "true" : undefined}
            aria-describedby={errors.vat_id_absent ? "reg-vat-absent-error" : (form.vat_id_absent === true ? "reg-vat-absent-hint" : undefined)}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); upd("vat_id_absent", form.vat_id_absent !== true); } }}
          >
            <span className="auth-checkbox" />
            <span>{VAT_ID_ABSENT_TEXT.toggle}</span>
          </div>
          {errors.vat_id_absent && <span className="auth-field-error" id="reg-vat-absent-error">{errors.vat_id_absent}</span>}
          {form.vat_id_absent === true && (
            <>
              <div className="auth-field-row">
                <label className="auth-field-label" htmlFor="reg-legal-form">{VAT_ID_ABSENT_TEXT.legalFormLabel} <Req /></label>
              </div>
              <div className="auth-input-wrap">
                <select
                  id="reg-legal-form"
                  className={`auth-input auth-select auth-input-no-icon${errors.legal_form ? " auth-input-error" : ""}`}
                  value={form.legal_form || ""}
                  onChange={(e) => upd("legal_form", e.target.value)}
                  required
                  aria-required="true"
                  aria-invalid={errors.legal_form ? "true" : undefined}
                  aria-describedby="reg-vat-absent-hint"
                >
                  <option value="">{VAT_ID_ABSENT_TEXT.legalFormPlaceholder}</option>
                  {LEGAL_FORMS_WITHOUT_VAT_ID.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <span className="auth-field-hint" id="reg-vat-absent-hint">{VAT_ID_ABSENT_TEXT.hint}</span>
              {errors.legal_form && <span className="auth-field-error">{errors.legal_form}</span>}
            </>
          )}
        </div>
      </div>

      <span className="auth-section-label">Adresse <span className="auth-optional">(optional)</span></span>

      {/* Land ZUERST (wie in „Neue Sendung“): Adressvorschläge gelten immer für ein Land.
          Stand es hinter PLZ und Stadt, suchte eine ausländische Anschrift noch mit der
          Vorbelegung DE. Die Vorbelegung selbst bleibt unverändert. */}
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

      <div className="auth-field">
        <div className="auth-field-row">
          <label className="auth-field-label" htmlFor="reg-street">Straße &amp; Hausnummer</label>
        </div>
        <AddressSuggestInput
          id="reg-street"
          wrapClassName="auth-input-wrap"
          inputClassName={`auth-input auth-input-no-icon${errors.street ? " auth-input-error" : ""}`}
          value={form.street}
          onChange={(v) => upd("street", v)}
          onSelect={applyAddress}
          suggestions={addressHelp.streetOptions}
          loading={addressHelp.streetLoading}
          noResults={addressHelp.streetNoResults}
          hint={countryFirstHint(form.country) || undefined}
          placeholder="Musterstraße 12"
          invalid={Boolean(errors.street)}
        />
        {errors.street && <span className="auth-field-error">{errors.street}</span>}
      </div>

      <div className="field-row field-row-2">
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
              placeholder={postalCodeExample(form.country)}
              inputMode={postalCodeInputMode(form.country)}
              aria-invalid={errors.zip ? "true" : undefined}
            />
          </div>
          {errors.zip && <span className="auth-field-error">{errors.zip}</span>}
        </div>
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label" htmlFor="reg-city">Stadt</label>
          </div>
          <AddressSuggestInput
            id="reg-city"
            wrapClassName="auth-input-wrap"
            inputClassName={`auth-input auth-input-no-icon${errors.city ? " auth-input-error" : ""}`}
            value={form.city}
            onChange={(v) => upd("city", v)}
            onSelect={(item) => upd("city", cityFromSuggestion(item))}
            suggestions={addressHelp.cityOptions}
            placeholder={cityPlaceholder(form.country)}
            invalid={Boolean(errors.city)}
          />
          {errors.city && <span className="auth-field-error">{errors.city}</span>}
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
