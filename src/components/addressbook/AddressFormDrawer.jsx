import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { countries } from "../../utils/countries";
import { postalCodeExample, postalCodeInputMode, postalCodeMaxLength, isPostalCodeRequired } from "../../utils/postalCode.mjs";
import {
  UI_ROLE_OPTIONS, ROLE_SENDER, ROLE_RECIPIENT, ROLE_BOTH,
  validateAddressForm, normalizeAddressForm, canSetDefaultSender, canSetDefaultRecipient,
} from "../../utils/addressBookView.mjs";

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
export function AddressFormDrawer({ mode, initialForm, archived, onSubmit, onClose }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const drawerRef = useRef(null);
  const firstFieldRef = useRef(null);
  const dirtyRef = useRef(JSON.stringify(initialForm));
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  useEffect(() => {
    firstFieldRef.current?.focus();
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
      return;
    }
    setErrors({}); setSubmitError(""); setSaving(true);
    const payload = normalizeAddressForm(form);
    const result = await onSubmit(payload);
    setSaving(false);
    if (!result?.ok) {
      setErrors(result?.fieldErrors || {});
      setSubmitError(result?.message || "Die Adresse konnte nicht gespeichert werden.");
      return;
    }
    onClose();
  };

  const canDefaultSender = canSetDefaultSender({ role: form.role, archivedAt: archived ? "x" : null });
  const canDefaultRecipient = canSetDefaultRecipient({ role: form.role, archivedAt: archived ? "x" : null });

  const field = (key, label, opts = {}) => (
    <div className="field">
      <label className="field-label" htmlFor={`abk-${key}`}>
        {label}{opts.optional && <span className="field-optional"> (optional)</span>}
      </label>
      <input
        id={`abk-${key}`}
        ref={opts.autoFocus ? firstFieldRef : undefined}
        className={`field-input${errors[key] ? " field-input-error" : ""}`}
        type={opts.type || "text"}
        value={form[key]}
        onChange={(e) => upd(key, e.target.value)}
        placeholder={opts.placeholder}
        maxLength={opts.maxLength}
        inputMode={opts.inputMode}
      />
      {errors[key] ? <span className="field-error">{errors[key]}</span> : (opts.hint && <span className="field-hint">{opts.hint}</span>)}
    </div>
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
          <button type="button" className="abk-drawer-close" aria-label="Drawer schließen" onClick={requestClose}>
            <Icon n="x" s={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "contents" }}>
          <div className="abk-drawer-body">
            {submitError && (
              <div className="alert alert-error mb-16" role="alert"><Icon n="x" s={15} />{submitError}</div>
            )}

            {/* Abschnitt 1 — Zuordnung */}
            <div className="abk-drawer-section">
              <div className="abk-drawer-section-title">Zuordnung</div>
              {field("label", "Anzeigename / Label", { optional: true, placeholder: "z. B. Lager Berlin", autoFocus: true, maxLength: 100 })}
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
              {field("company", "Firma", { optional: true, placeholder: "Beispiel GmbH", maxLength: 200 })}
              {field("contactName", "Ansprechpartner", { optional: true, placeholder: "Max Mustermann", maxLength: 35, hint: "Max. 35 Zeichen." })}
              {field("email", "E-Mail", { optional: true, type: "email", placeholder: "logistik@beispiel.de" })}
              {field("phone", "Telefon", { optional: true, type: "tel", placeholder: "+49 30 1234" })}
            </div>

            {/* Abschnitt 3 — Anschrift */}
            <div className="abk-drawer-section">
              <div className="abk-drawer-section-title">Anschrift</div>
              {field("streetAndNumber", "Straße und Hausnummer", { placeholder: "Musterstraße 1", maxLength: 200 })}
              {field("addressAdd", "Adresszusatz", { optional: true, placeholder: "Etage, c/o …", maxLength: 100 })}
              <div className="field-row field-row-2">
                <div className="field">
                  <label className="field-label" htmlFor="abk-postalCode">PLZ</label>
                  <input
                    id="abk-postalCode"
                    className={`field-input${errors.postalCode ? " field-input-error" : ""}`}
                    value={form.postalCode}
                    onChange={(e) => upd("postalCode", e.target.value)}
                    placeholder={postalCodeExample(form.country) || "PLZ"}
                    inputMode={postalCodeInputMode(form.country)}
                    maxLength={postalCodeMaxLength()}
                  />
                  {errors.postalCode
                    ? <span className="field-error">{errors.postalCode}</span>
                    : (postalCodeExample(form.country)
                        ? <span className="field-hint">Beispiel: {postalCodeExample(form.country)}</span>
                        : (!isPostalCodeRequired(form.country) ? <span className="field-hint">Für dieses Land optional.</span> : null))}
                </div>
                {field("city", "Ort", { placeholder: "Berlin" })}
              </div>
              {field("state", "Bundesland / Region", { optional: true, placeholder: "z. B. Berlin", maxLength: 100 })}
              <div className="field">
                <label className="field-label" htmlFor="abk-country">Land</label>
                <select
                  id="abk-country"
                  className={`field-input field-select${errors.country ? " field-input-error" : ""}`}
                  value={form.country}
                  onChange={(e) => upd("country", e.target.value)}
                >
                  {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
                {errors.country && <span className="field-error">{errors.country}</span>}
              </div>
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
                  {archived ? "Archivierte Adressen können nicht als Standard verwendet werden." : "Nur bei Typ Eigene Adresse oder Beides verfügbar."}
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
                  {archived ? "Archivierte Adressen können nicht als Standard verwendet werden." : "Nur bei Typ Empfänger oder Beides verfügbar."}
                </p>
              )}
            </div>

            {/* Abschnitt 5 — Notiz */}
            <div className="abk-drawer-section">
              <div className="abk-drawer-section-title">Notiz</div>
              <div className="field">
                <label className="field-label" htmlFor="abk-notes">Interne Notiz <span className="field-optional">(optional)</span></label>
                <textarea
                  id="abk-notes"
                  className="field-input"
                  style={{ minHeight: 80, resize: "vertical", fontFamily: "'DM Sans', sans-serif" }}
                  value={form.notes}
                  onChange={(e) => upd("notes", e.target.value)}
                  maxLength={500}
                  placeholder="Nur intern sichtbar …"
                />
              </div>
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
