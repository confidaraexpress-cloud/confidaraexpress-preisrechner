import React, { useEffect, useRef } from "react";
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
import { cityPlaceholder, postalCodePlaceholder } from "../../utils/addressPlaceholders.mjs";
import { postalCodeInputMode } from "../../utils/postalCode.mjs";
import { VAT_ID_TEXT, VAT_ID_ABSENT_TEXT, LEGAL_FORMS_WITHOUT_VAT_ID } from "../../utils/vatId.mjs";
// Phase 1 (Canonical v2.117): voraussichtliches monatliches Versandvolumen — acht feste Angaben, eine Quelle.
import { SHIPMENT_VOLUME_OPTIONS, SHIPMENT_VOLUME_QUESTION, SHIPMENT_VOLUME_TEXT } from "../../utils/shipmentVolume.mjs";
// Premium UX 4.0 (Betreiberentscheidung A3, 2026-11-22): drei Schritte über DASSELBE Formular.
import { REG_STEPS, REG_LAST_STEP, REG_STEP_TEXT, regSummary } from "../../utils/registrationSteps.mjs";

// Pflichtfeld-Markierung. Das Sternchen ist rein visuell (aria-hidden) — für
// Screenreader trägt das jeweilige Eingabefeld required/aria-required.
const Req = () => <span className="auth-req" aria-hidden="true">*</span>;

// Eine Pflicht-Checkbox im Stil der übrigen Auth-Checkboxen.
//
// AUD-012 (Audit 2026-11-10): bis dahin war der ganze Block ein `role="checkbox"`-Element, in dem der
// AGB-Link steckte — ein Bedienelement in einem Bedienelement (axe „nested-interactive“); Tastatur und
// Screenreader konnten Kästchen und Link nicht getrennt erreichen. Jetzt ist das Kästchen ein echtes,
// nur visuell verborgenes `<input type="checkbox">`, der Text samt Link ein `<label>`. Ein Klick auf den
// Text schaltet das Kästchen (Label-Verhalten), ein Klick auf den Link öffnet NUR den Link — Lesen ist
// keine Zustimmung; Tab erreicht Kästchen und Link nacheinander. Der Wrapper behält `id` und die
// Klassen (`checked` steuert die Zeichnung), die Kennung des Eingabefelds ist `${id}-input`.
function Erklaerung({ id, checked, onToggle, error, children }) {
  return (
    <>
      <div id={id} className={`auth-check auth-declaration ${checked ? "checked" : ""}`}>
        <input
          type="checkbox"
          id={`${id}-input`}
          className="auth-check-input"
          checked={checked === true}
          onChange={(e) => onToggle(e.target.checked)}
          required
          aria-required="true"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <label htmlFor={`${id}-input`} className="auth-check-label">
          <span className="auth-checkbox" aria-hidden="true" />
          <span>{children} <Req /></span>
        </label>
      </div>
      {error && <span className="auth-field-error" id={`${id}-error`}>{error}</span>}
    </>
  );
}

// Schrittleiste: ein geordneter Ablauf, deshalb Nummern. Erledigte Schritte sind Knöpfe zurück; nach vorn geht es nur
// über „Weiter“ (mit Prüfung des Schritts). Der aktuelle Schritt trägt aria-current="step".
function Schrittleiste({ step, onGoToStep }) {
  return (
    <ol className="auth-reg-leiste" aria-label={REG_STEP_TEXT.fortschritt}>
      {REG_STEPS.map((s, i) => {
        const zustand = i < step ? "erledigt" : i === step ? "aktiv" : "offen";
        const inhalt = (
          <>
            <span className="auth-reg-marke" aria-hidden="true">{i < step ? <Icon n="check" s={14} /> : i + 1}</span>
            <span className="auth-reg-name">{s.kurz}</span>
            {/* Derselbe Name nur für Screenreader. Je nach Breite steht genau eine der beiden Fassungen (Stil
                „Registrierung in drei Schritten“, Abschnitt „Schmal“): breit die sichtbare, schmal diese. */}
            <span className="sr-only auth-reg-name-sr">{s.kurz}</span>
          </>
        );
        return (
          <li key={s.id} className={`auth-reg-punkt auth-reg-punkt--${zustand}`} aria-current={i === step ? "step" : undefined}>
            {i < step ? (
              <button type="button" className="auth-reg-punkt-ziel" onClick={() => onGoToStep(i)}>
                {inhalt}<span className="sr-only">, {REG_STEP_TEXT.erledigt}</span>
              </button>
            ) : (
              <span className="auth-reg-punkt-ziel">{inhalt}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function RegisterForm({
  form, onChange, onRegister, loading, errors = {}, regValid = true, passwordRepeat = "", onPasswordRepeatChange, onPasswordBlur, onVatBlur,
  // Paket C: Erklärungen (Unternehmer, AGB) und die angezeigte AGB-Fassung (oder null).
  declarations = {}, onDeclarationChange = () => {}, legalContext = null,
  // Nur noch die Erklärungen fehlen: der Knopf ist gesperrt, der Grund steht unter den Erklärungen.
  declarationsMissingOnly = false,
  // Phase 1: nur noch das Versandvolumen fehlt — derselbe Grund-Hinweis wie bei den Erklärungen.
  volumeMissingOnly = false, onVolumeBlur,
  // Premium UX 4.0: Schritt (0–2) und Führung. onNext prüft den Schritt im Browser und sendet nichts; focusRequest
  // ({ ziel: "kopf" | Kennung, n }) bittet um den Fokus — auf die Überschrift des Schritts oder ein fehlerhaftes Feld.
  step = 0, onNext = () => {}, onBack = () => {}, onGoToStep = () => {}, focusRequest = null,
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

  // Fokusführung: nach einem Schrittwechsel die Überschrift des neuen Schritts (die Leiste rückt ins Bild, falls sie
  // außerhalb liegt), bei einem Fehler das erste fehlerhafte Feld. Alle Schritte bleiben im Formular (inaktive mit
  // `hidden`) — Werte, Passwortmanager und Fehler gehören zu EINEM Formular.
  const leisteRef = useRef(null);
  const kopfRefs = useRef([]);
  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.ziel === "kopf") {
      const leiste = leisteRef.current;
      if (leiste) {
        const r = leiste.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) leiste.scrollIntoView({ block: "start" });
      }
      kopfRefs.current[step]?.focus({ preventScroll: true });
      return;
    }
    document.getElementById(focusRequest.ziel)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  const fehlerId = (feld) => (errors[feld] ? `${feld === "passwordRepeat" ? "reg-password-repeat" : `reg-${feld}`}-error` : undefined);
  const landName = (code) => launchCountries.find((c) => c.code === code)?.name || code;
  // Der zweite Klick eines Doppelklicks löst kein zweites Absenden aus (siehe Aktionsleiste).
  const nurEinKlick = (e) => { if (e.detail > 1) e.preventDefault(); };
  const kopf = (i) => (
    <h3 className="auth-reg-titel" id={`reg-schritt-${REG_STEPS[i].id}`} tabIndex={-1} ref={(el) => { kopfRefs.current[i] = el; }}>
      <span className="sr-only">{REG_STEP_TEXT.schrittVon(i + 1, REG_STEPS.length)}: </span>{REG_STEPS[i].titel}
    </h3>
  );

  return (
    <form
      noValidate
      className="auth-reg"
      onSubmit={(e) => { e.preventDefault(); if (step < REG_LAST_STEP) onNext(); else onRegister(); }}
    >
      <div ref={leisteRef}>
        <Schrittleiste step={step} onGoToStep={onGoToStep} />
      </div>

      {/* ── Schritt 1: Ansprechpartner und Zugang ───────────────────────────────────────────────────────── */}
      <div className="auth-reg-schritt" role="group" aria-labelledby={`reg-schritt-${REG_STEPS[0].id}`} hidden={step !== 0}>
      {kopf(0)}
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
              aria-describedby={fehlerId("name")}
              autoFocus
            />
          </div>
          {errors.name && <span className="auth-field-error" id="reg-name-error">{errors.name}</span>}
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
              aria-describedby={fehlerId("email")}
            />
          </div>
          {errors.email && <span className="auth-field-error" id="reg-email-error">{errors.email}</span>}
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
            /* Bewusst beim Verlassen des Feldes, nicht beim Tippen: sonst stünde
               schon nach dem ersten Zeichen „mindestens 8 Zeichen". „Weiter“
               prüft den Schritt ohnehin und nennt den Grund am Feld. */
            onBlur={() => onPasswordBlur?.()}
            placeholder={`Mind. ${PASSWORD_MIN_LEN} Zeichen`}
            autoComplete="new-password"
            required
            aria-required="true"
            invalid={Boolean(errors.password)}
            describedBy={fehlerId("password")}
          />
        </div>
        {errors.password && <span className="auth-field-error" id="reg-password-error">{errors.password}</span>}
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
            invalid={Boolean(errors.passwordRepeat)}
            describedBy={fehlerId("passwordRepeat")}
          />
        </div>
        {errors.passwordRepeat && <span className="auth-field-error" id="reg-password-repeat-error">{errors.passwordRepeat}</span>}
      </div>
      </div>

      {/* ── Schritt 2: Ihr Unternehmen ──────────────────────────────────────────────────────────────────── */}
      <div className="auth-reg-schritt" role="group" aria-labelledby={`reg-schritt-${REG_STEPS[1].id}`} hidden={step !== 1}>
      {kopf(1)}

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
              aria-describedby={errors.company_name ? "reg-company-error" : undefined}
            />
          </div>
          {errors.company_name && <span className="auth-field-error" id="reg-company-error">{errors.company_name}</span>}
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
                  aria-describedby={errors.vat_id ? "reg-vat-hint reg-vat-error" : "reg-vat-hint"}
                />
              </div>
              <span className="auth-field-hint" id="reg-vat-hint">{VAT_ID_TEXT.hint}</span>
              {errors.vat_id && <span className="auth-field-error" id="reg-vat-error">{errors.vat_id}</span>}
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
                  aria-describedby={errors.legal_form ? "reg-vat-absent-hint reg-legal-form-error" : "reg-vat-absent-hint"}
                >
                  <option value="">{VAT_ID_ABSENT_TEXT.legalFormPlaceholder}</option>
                  {LEGAL_FORMS_WITHOUT_VAT_ID.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <span className="auth-field-hint" id="reg-vat-absent-hint">{VAT_ID_ABSENT_TEXT.hint}</span>
              {errors.legal_form && <span className="auth-field-error" id="reg-legal-form-error">{errors.legal_form}</span>}
            </>
          )}
        </div>
      </div>

      {/* Voraussichtliches monatliches Versandvolumen (Phase 1, Betreiberentscheidung 2026-11-06) — Pflicht, ohne
          Vorauswahl, genau eine von acht Angaben. Seit der Premium-UX-Nachbesserung (2026-11-06) ein natives
          Auswahlfeld wie „Land“ statt acht dauerhaft sichtbarer Optionsfelder: geschlossen eine Zeile, geöffnet die
          acht Angaben in der Auswahlliste des Systems (Maus, Touch, Tastatur, Screenreader; mobil nie abgeschnitten).
          Der Platzhalter ist keine Angabe und in der Liste nicht wählbar. Verlässt der Fokus das Feld ohne Wahl,
          steht der Grund sofort am Feld (onVolumeBlur). */}
      <div className={`auth-field auth-volume${errors.monthly_shipment_volume ? " auth-volume-invalid" : ""}`}>
        <div className="auth-field-row">
          <label className="auth-field-label" htmlFor="reg-volume">{SHIPMENT_VOLUME_QUESTION} <Req /></label>
        </div>
        <div className="auth-input-wrap">
          <select
            id="reg-volume"
            name="monthly_shipment_volume"
            className={`auth-input auth-select auth-input-no-icon${form.monthly_shipment_volume ? "" : " auth-select--leer"}${errors.monthly_shipment_volume ? " auth-input-error" : ""}`}
            value={form.monthly_shipment_volume || ""}
            onChange={(e) => upd("monthly_shipment_volume", e.target.value)}
            onBlur={() => onVolumeBlur?.()}
            required
            aria-required="true"
            aria-invalid={errors.monthly_shipment_volume ? "true" : undefined}
            aria-describedby={errors.monthly_shipment_volume ? "reg-volume-hint reg-volume-error" : "reg-volume-hint"}
          >
            <option value="" disabled hidden>{SHIPMENT_VOLUME_TEXT.placeholder}</option>
            {SHIPMENT_VOLUME_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <span className="auth-field-hint" id="reg-volume-hint">{SHIPMENT_VOLUME_TEXT.hint}</span>
        {errors.monthly_shipment_volume && (
          <span className="auth-field-error" id="reg-volume-error">{errors.monthly_shipment_volume}</span>
        )}
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
          describedBy={errors.street ? `${countryFirstHint(form.country) ? "reg-street-hint " : ""}reg-street-error` : undefined}
        />
        {errors.street && <span className="auth-field-error" id="reg-street-error">{errors.street}</span>}
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
              placeholder={postalCodePlaceholder(form.country)}
              inputMode={postalCodeInputMode(form.country)}
              aria-invalid={errors.zip ? "true" : undefined}
              aria-describedby={errors.zip ? "reg-zip-error" : undefined}
            />
          </div>
          {errors.zip && <span className="auth-field-error" id="reg-zip-error">{errors.zip}</span>}
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
            describedBy={errors.city ? "reg-city-error" : undefined}
          />
          {errors.city && <span className="auth-field-error" id="reg-city-error">{errors.city}</span>}
        </div>
      </div>
      </div>

      {/* ── Schritt 3: Prüfen und beantragen ────────────────────────────────────────────────────────────── */}
      <div className="auth-reg-schritt" role="group" aria-labelledby={`reg-schritt-${REG_STEPS[2].id}`} hidden={step !== 2}>
      {kopf(2)}
      <p className="auth-reg-hinweis">{REG_STEP_TEXT.pruefenText}</p>
      <div className="auth-reg-uebersicht">
        {regSummary(form, { landName }).map((g) => (
          <div key={g.schritt} className="auth-reg-gruppe">
            <div className="auth-reg-gruppe-kopf">
              <h4 className="auth-reg-gruppe-titel" id={`reg-gruppe-${REG_STEPS[g.schritt].id}`}>{g.titel}</h4>
              <button type="button" className="auth-reg-aendern" onClick={() => onGoToStep(g.schritt)}
                aria-describedby={`reg-gruppe-${REG_STEPS[g.schritt].id}`}>
                {REG_STEP_TEXT.aendern}
              </button>
            </div>
            <dl className="auth-reg-liste">
              {g.zeilen.map((z) => (
                <div key={z.feld} className="auth-reg-zeile">
                  <dt>{z.label}</dt>
                  <dd>{z.wert || REG_STEP_TEXT.keineAngabe}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
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
        {volumeMissingOnly && (
          <p className="auth-declaration-hint" role="status">{SHIPMENT_VOLUME_TEXT.required}</p>
        )}
      </div>
      </div>

      {/* Eine Aktionsleiste für alle Schritte: zurück (ohne Prüfung) und genau EIN Absendeknopf — „Weiter“ prüft den
          Schritt im Browser, „Konto beantragen“ sendet die eine Anfrage. Weil es immer nur einen Absendeknopf gibt,
          greift Enter stets den sichtbaren, und ein gesperrter Knopf sperrt auch Enter (Chromium).
          Ein Doppelklick zählt einmal (`detail` > 1 verworfen): „Weiter“ und „Konto beantragen“ stehen an derselben
          Stelle — sonst könnte der zweite Klick den Antrag senden, bevor die Zusammenfassung gelesen ist (nach einem
          Rücksprung sind die Erklärungen womöglich schon gesetzt). Tastatur (detail 0) und ein einzelner Klick bleiben. */}
      <div className="auth-reg-aktionen">
        {step > 0 && (
          <button type="button" className="auth-reg-zurueck" onClick={(e) => { if (e.detail <= 1) onBack(); }}>
            <Icon n="chevronLeft" s={16} />
            <span>{REG_STEP_TEXT.zurueck}</span>
          </button>
        )}
        {step < REG_LAST_STEP ? (
          <button key="weiter" type="submit" className="auth-cta auth-reg-weiter" onClick={nurEinKlick}>
            <span>{REG_STEP_TEXT.weiter}</span>
            <span className="auth-cta-arrow"><Icon n="arrowRight" s={18} /></span>
          </button>
        ) : (
          <button key="absenden" type="submit" className="auth-cta auth-reg-absenden" disabled={loading || !regValid} onClick={nurEinKlick} aria-busy={loading ? "true" : undefined}>
            <span>{loading ? REG_STEP_TEXT.absendenLaeuft : REG_STEP_TEXT.absenden}</span>
            <span className="auth-cta-arrow"><Icon n="arrowRight" s={18} /></span>
          </button>
        )}
      </div>

      <p className="auth-form-legal">
        Wie wir Ihre Daten verarbeiten, erklärt unsere{" "}
        <Link to="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutzerklärung</Link>.
      </p>
    </form>
  );
}
