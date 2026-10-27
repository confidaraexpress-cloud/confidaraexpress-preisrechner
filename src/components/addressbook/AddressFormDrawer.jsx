import React, { useEffect, useRef, useState } from "react";
import { useLaunchScope } from "../../hooks/useLaunchScope";
import { postalCodeInputMode, postalCodeMaxLength, isPostalCodeRequired } from "../../utils/postalCode.mjs";
import {
  UI_ROLE_OPTIONS, ROLE_SENDER, ROLE_RECIPIENT, ROLE_BOTH,
  validateAddressForm, normalizeAddressForm, canSetDefaultSender, canSetDefaultRecipient,
  ADDRESS_FIELD_MAXLEN, firstAddressErrorField,
} from "../../utils/addressBookView.mjs";
import { Field } from "../ui/Field";
import { AddressSuggestInput } from "../address/AddressSuggestInput";
import { AddressStatusLine } from "../address/AddressStatusLine";
import { useAddressValidation } from "../../hooks/useAddressValidation";
import { applyAddressSuggestion, cityFromSuggestion, shippingLengthHint, streetFieldHint } from "../../utils/addressValidationView.mjs";
// Paket A (2026-10-23): derselbe Hinweis unter dem Telefonfeld wie im Versandformular.
import { phoneTransmissionHint } from "../../utils/phoneNumber.mjs";
import { cityPlaceholder, postalCodePlaceholder } from "../../utils/addressPlaceholders.mjs";

const TITLES = { create: "Neue Adresse", edit: "Adresse bearbeiten", duplicate: "Adresse duplizieren" };

function focusableElements(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((n) => !n.disabled && n.offsetParent !== null);
}

// Create-/Edit-/Duplizieren-Drawer (rechts). Formularstate + Validierung leben
// hier (REIN clientseitig, das Backend bleibt autoritativ); die eigentliche
// Mutation (create/update) übernimmt der Orchestrator über `onSubmit`, der
// { ok:true } oder { ok:false, fieldErrors?, message? } zurückgibt.
export function AddressFormDrawer({ mode, initialForm, onSubmit, onClose }) {
  // Nur die Länder, die ConfidaraExpress heute anbietet — die Liste kommt vom Server
  // (GET /api/shipping/launch-scope), nicht aus einer zweiten Aufzählung im Client.
  const { countries: launchCountries } = useLaunchScope();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // Fokusauftrag nach einem gescheiterten Speichern: erst NACH dem Rendern der Fehler auf das
  // erste Fehlerfeld — dann trägt es schon aria-invalid und seinen Fehlertext (Audit P7).
  const [fokusAuftrag, setFokusAuftrag] = useState(0);
  const drawerRef = useRef(null);
  const dirtyRef = useRef(JSON.stringify(initialForm));
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  useEffect(() => {
    if (!fokusAuftrag) return;
    const feld = firstAddressErrorField(errors);
    const el = feld ? drawerRef.current?.querySelector(`#abk-${feld}`) : null;
    if (el) { el.focus(); el.scrollIntoView?.({ block: "center" }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fokusAuftrag]);

  useEffect(() => {
    drawerRef.current?.querySelector("#abk-label")?.focus();
    const el = drawerRef.current;
    const onKeyDown = (e) => {
      if (e.key === "Tab") {
        const items = focusableElements(el);
        if (items.length === 0) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      } else if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adressprüfung der eingegebenen Anschrift. Es werden ausschließlich Land, PLZ, Ort sowie
  // Straße und Hausnummer geprüft — Firma, Ansprechpartner, E-Mail und Telefon bleiben im
  // Formular. Für Länder ohne Abdeckung meldet der Hook `unsupported` und zeigt nichts an; das
  // Speichern einer Adresse wird durch die Prüfung NIE blockiert (das Adressbuch ist eine
  // Stammdatenpflege, keine Buchung).
  const addressCheck = useAddressValidation({
    country: form.country, postalCode: form.postalCode, city: form.city, street: form.streetAndNumber,
  });

  // Genau EIN gefundener Ort wird ergänzt — aber nur in ein leeres Feld. Bei mehreren
  // gültigen Orten zu einer PLZ wäre jede Auswahl geraten; dann bleiben es Vorschläge.
  useEffect(() => {
    if (addressCheck.cityOptions.length === 1 && !String(form.city || "").trim()) {
      setForm((prev) => (String(prev.city || "").trim() ? prev : { ...prev, city: addressCheck.cityOptions[0] }));
    }
  }, [addressCheck.cityOptions]);

  const upd = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Rollenwechsel: inkonsistent gewordene Standard-Flags SOFORT sichtbar
      // zurücksetzen (kein stilles Verändern der ROLLE — nur die abhängigen
      // Flags folgen unmittelbar der Nutzeraktion, kein verdecktes Nachjustieren).
      if (key === "role") {
        next.isDefaultSender = prev.isDefaultSender && (value === ROLE_SENDER || value === ROLE_BOTH);
        next.isDefaultRecipient = prev.isDefaultRecipient && (value === ROLE_RECIPIENT || value === ROLE_BOTH);
      }
      return next;
    });
    setErrors((prev) => { if (!prev[key]) return prev; const n = { ...prev }; delete n[key]; return n; });
  };

  const isDirty = () => JSON.stringify(form) !== dirtyRef.current;
  const requestClose = () => {
    if (saving) return;
    if (isDirty() && !window.confirm("Es gibt ungespeicherte Änderungen. Trotzdem schließen?")) return;
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const localErrors = validateAddressForm(form);
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      setSubmitError("Bitte korrigieren Sie die markierten Felder.");
      setFokusAuftrag((n) => n + 1);
      return;
    }
    setErrors({}); setSubmitError(""); setSaving(true);
    const payload = normalizeAddressForm(form);
    const result = await onSubmit(payload);
    setSaving(false);
    if (!result?.ok) {
      // Ein Serverfehler mit Feldbezug steht am Feld (fieldErrors), der Satz darüber nennt den Vorgang.
      setErrors(result?.fieldErrors || {});
      setSubmitError(result?.message || "Die Adresse konnte nicht gespeichert werden.");
      if (result?.fieldErrors && Object.keys(result.fieldErrors).length > 0) setFokusAuftrag((n) => n + 1);
      return;
    }
    onClose();
  };

  const canDefaultSender = canSetDefaultSender({ role: form.role });
  const canDefaultRecipient = canSetDefaultRecipient({ role: form.role });

  // Eingabefelder über das zentrale Field (Audit P7): Beschriftung über htmlFor, bei Fehler
  // aria-invalid und aria-describedby auf den Fehlertext, sonst auf den Hinweis. Die Längen kommen
  // aus ADDRESS_FIELD_MAXLEN (nie über der Servergrenze). Die IDs bleiben `abk-<Feld>`.
  const field = (key, label, opts = {}) => (
    <Field
      id={`abk-${key}`}
      label={label}
      optional={opts.optional === true}
      value={form[key]}
      onChange={(v) => upd(key, v)}
      type={opts.type || "text"}
      placeholder={opts.placeholder}
      maxLength={ADDRESS_FIELD_MAXLEN[key]}
      inputMode={opts.inputMode}
      error={errors[key]}
      hint={opts.hint}
      aria-required={opts.optional ? undefined : "true"}
    />
  );

  return (
    <div className="abk-drawer-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div
        ref={drawerRef}
        className="abk-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="abk-drawer-title"
      >
        <div className="abk-drawer-header">
          <h2 id="abk-drawer-title" className="abk-drawer-title">{TITLES[mode] || TITLES.create}</h2>
          <button type="button" className="btn btn-ghost btn-sm abk-drawer-close" aria-label="Formular schließen" onClick={requestClose}>
            Schließen
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "contents" }}>
          <div className="abk-drawer-body">
            {submitError && (
              <div className="alert alert-error mb-16" role="alert">{submitError}</div>
            )}

            {/* Abschnitt 1 — Zuordnung */}
            <div className="abk-drawer-section">
              <div className="abk-drawer-section-title">Zuordnung</div>
              {field("label", "Anzeigename / Label", { optional: true, placeholder: "z. B. Lager Berlin" })}
              <div className="field">
                <span className="field-label">Typ</span>
                <div className="abk-role-options" role="radiogroup" aria-label="Adresstyp">
                  {UI_ROLE_OPTIONS.map((opt) => (
                    <label key={opt.value} className={`abk-role-option${form.role === opt.value ? " abk-role-option--selected" : ""}`}>
                      <input type="radio" name="abk-role" checked={form.role === opt.value} onChange={() => upd("role", opt.value)} />
                      <span className="abk-role-option-label">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Abschnitt 2 — Firma und Kontakt */}
            <div className="abk-drawer-section">
              <div className="abk-drawer-section-title">Firma und Kontakt</div>
              {field("company", "Firma", { optional: true })}
              {/* Die Kontaktperson strukturiert — dieselbe Regel wie im Versandformular.
                  Eine Adresse aus der Zeit davor öffnet sich mit leeren Namensfeldern:
                  der alte `contactName` wird NICHT zerlegt, sondern bleibt darunter als
                  Altwert sichtbar, bis die Felder ergänzt sind. */}
              {field("firstName", "Vorname")}
              {field("lastName", "Nachname", {
                                               hint: "Vor- und Nachname zusammen max. 35 Zeichen." })}
              {form.contactName && !(form.firstName || form.lastName) && (
                <p className="abk-drawer-hint">
                  Bisher gespeichert: <strong>{form.contactName}</strong>. Bitte tragen Sie
                  Vor- und Nachname getrennt ein.
                </p>
              )}
              {field("email", "E-Mail", { type: "email", placeholder: "logistik@beispiel.de" })}
              {field("phone", "Telefon", { type: "tel", placeholder: "+49 30 1234567", hint: phoneTransmissionHint(form.phone) || undefined })}
            </div>

            {/* Abschnitt 3 — Anschrift */}
            <div className="abk-drawer-section">
              <div className="abk-drawer-section-title">Anschrift</div>
              {/* Land ZUERST (wie in „Neue Sendung“): Adressvorschläge gelten immer für ein Land.
                  Stand es unter der Straße, suchte eine ausländische Adresse noch mit der
                  Vorbelegung DE — und eine Auswahl brachte deutsche PLZ und Orte mit. Die
                  Vorbelegung selbst bleibt unverändert; die Region folgt dem Land. */}
              <div className="field">
                <label className="field-label" htmlFor="abk-country">Land</label>
                <select
                  id="abk-country"
                  className={`field-input field-select${errors.country ? " field-input-error" : ""}`}
                  value={form.country}
                  onChange={(e) => upd("country", e.target.value)}
                  aria-invalid={errors.country ? "true" : undefined}
                  aria-describedby={errors.country ? "abk-country-err" : undefined}
                >
                  {launchCountries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
                {errors.country && <span className="field-error" id="abk-country-err">{errors.country}</span>}
              </div>
              {field("state", "Bundesland / Region", { optional: true, placeholder: "z. B. Berlin" })}
              <AddressSuggestInput
                id="abk-streetAndNumber"
                label="Straße und Hausnummer"
                value={form.streetAndNumber}
                onChange={(v) => upd("streetAndNumber", v)}
                onSelect={(item) => {
                  // Nur Straße/Hausnummer, PLZ und Ort — Firma, Namen, Zusatz, Region, Kontakt
                  // und Rolle bleiben unberührt.
                  const patch = applyAddressSuggestion({ country: form.country, street: form.streetAndNumber }, item);
                  if (!patch.street) return;
                  addressCheck.markSelected(patch.street);
                  setForm((prev) => ({
                    ...prev,
                    streetAndNumber: patch.street,
                    ...(patch.postalCode ? { postalCode: patch.postalCode } : {}),
                    ...(patch.city ? { city: patch.city } : {}),
                  }));
                }}
                suggestions={addressCheck.streetOptions}
                loading={addressCheck.streetLoading}
                noResults={addressCheck.streetNoResults}
                maxLength={200}
                error={errors.streetAndNumber}
                hint={streetFieldHint(form.country, form.streetAndNumber) || undefined}
                className="field"
              />
              {field("addressAdd", "Adresszusatz", { optional: true, placeholder: "Etage, c/o …" })}
              <div className="field-row field-row-2">
                {/* Das Beispiel steht im Platzhalter; eine zweite Zeile „Beispiel: …“ wiederholte
                    es nur und blieb auch neben einer fertigen PLZ stehen. */}
                <Field
                  id="abk-postalCode"
                  label="PLZ"
                  value={form.postalCode}
                  onChange={(v) => upd("postalCode", v)}
                  placeholder={postalCodePlaceholder(form.country) || "PLZ"}
                  inputMode={postalCodeInputMode(form.country)}
                  maxLength={postalCodeMaxLength()}
                  autoComplete="postal-code"
                  error={errors.postalCode}
                  hint={!isPostalCodeRequired(form.country) ? "Für dieses Land optional." : undefined}
                  aria-required={isPostalCodeRequired(form.country) ? "true" : undefined}
                />
                <AddressSuggestInput
                  id="abk-city"
                  label="Ort"
                  value={form.city}
                  onChange={(v) => upd("city", v)}
                  onSelect={(item) => upd("city", cityFromSuggestion(item))}
                  suggestions={addressCheck.cityOptions}
                  placeholder={cityPlaceholder(form.country)}
                  error={errors.city}
                  hint={shippingLengthHint("city", form.city) || undefined}
                  className="field"
                />
              </div>
              {/* Ergebnis der Adressprüfung — Platz reserviert, Text nur, wenn es etwas zu sagen gibt. */}
              <AddressStatusLine
                status={addressCheck.status}
                reason={addressCheck.reason}
                citySuggestions={addressCheck.cityOptions}
                onPickCity={(c) => upd("city", c)}
              />
            </div>

            {/* Abschnitt 4 — Optionen */}
            <div className="abk-drawer-section">
              <div className="abk-drawer-section-title">Optionen</div>
              <div className="abk-check-row">
                <input id="abk-favorite" type="checkbox" checked={form.favorite} onChange={(e) => upd("favorite", e.target.checked)} />
                <label htmlFor="abk-favorite">Als Favorit markieren</label>
              </div>
              <div className="abk-check-row">
                <input
                  id="abk-defSender" type="checkbox" checked={form.isDefaultSender}
                  disabled={!canDefaultSender}
                  onChange={(e) => upd("isDefaultSender", e.target.checked)}
                  aria-describedby={!canDefaultSender ? "abk-defSender-hint" : undefined}
                />
                <label htmlFor="abk-defSender">Standard-Absender</label>
              </div>
              {!canDefaultSender && (
                <p id="abk-defSender-hint" className="abk-check-hint">
                  Nur bei Typ Eigene Adresse oder Beides verfügbar.
                </p>
              )}
              <div className="abk-check-row">
                <input
                  id="abk-defRecipient" type="checkbox" checked={form.isDefaultRecipient}
                  disabled={!canDefaultRecipient}
                  onChange={(e) => upd("isDefaultRecipient", e.target.checked)}
                  aria-describedby={!canDefaultRecipient ? "abk-defRecipient-hint" : undefined}
                />
                <label htmlFor="abk-defRecipient">Standard-Empfänger</label>
              </div>
              {!canDefaultRecipient && (
                <p id="abk-defRecipient-hint" className="abk-check-hint">
                  Nur bei Typ Empfänger oder Beides verfügbar.
                </p>
              )}
            </div>

            {/* Abschnitt 5 — Notiz */}
            <div className="abk-drawer-section">
              <div className="abk-drawer-section-title">Notiz</div>
              <Field
                as="textarea"
                id="abk-notes"
                label="Interne Notiz"
                optional
                value={form.notes}
                onChange={(v) => upd("notes", v)}
                maxLength={ADDRESS_FIELD_MAXLEN.notes}
                placeholder="Nur intern sichtbar …"
                error={errors.notes}
              />
            </div>
          </div>

          <div className="abk-drawer-footer">
            {isDirty() && <span className="abk-drawer-unsaved-note">Ungespeicherte Änderungen</span>}
            <button type="button" className="btn btn-outline" onClick={requestClose} disabled={saving}>Abbrechen</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner" /> Wird gespeichert …</> : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
