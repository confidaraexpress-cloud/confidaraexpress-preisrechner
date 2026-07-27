import React, { useState, useRef, useEffect } from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { PasswordField } from "../ui/PasswordField";
import { apiFetch, authH, triggerAuthError } from "../../api/client";
import { countries } from "../../utils/countries";
import { useAuth } from "../../context/AuthContext";
import { PremiumBackground } from "./PremiumBackground";
import { EmailChangeSection } from "./EmailChangeSection";
import {
  companyBaseline, contactBaseline,
  buildCompanyPatch, buildContactPatch,
  validateCompanyForm, validateContactForm, isFormValid,
  canSaveCompany, canSaveContact, isEditActionDisabled,
  companyAddressLine, paymentTermValue, PROFILE_TEXT,
  mapApiProfileError,
} from "../../utils/profileView.mjs";
import { customerNumberOf, NOT_ASSIGNED_TEXT, NUMBER_LABELS } from "../../utils/businessNumbers.mjs";
import { CopyableNumber } from "../ui/CopyableNumber";

// Benötigt Backend: PATCH /kunde/profil — bereichsweise Teilupdates:
//   Unternehmensdaten → { company_name, vat_id, street, zip, city, country }
//   Ansprechpartner   → { name }
// Response: { user: { ...aktualisiertes User-Objekt } }
//
// Benötigt Backend: PATCH /kunde/password
// Request-Body: { currentPassword, newPassword, newPasswordConfirm }
// Response:     { message } bei Erfolg, { error } bei Fehler
//
// „Telefon" wird bewusst NICHT geführt: das Nutzer-Datenmodell hat keine
// phone-Spalte (weder in users, noch in der Profil-Whitelist, noch in
// /kundenbereich). Es wird kein nicht speicherbarer Wert vorgetäuscht.

const EMPTY_PW_FORM = { currentPassword: "", newPassword: "", newPasswordConfirm: "" };

export function Profile({ user }) {
  const { updateUser } = useAuth();

  // Bereichsweise Bearbeitung: höchstens EINE Karte gleichzeitig im Edit-Modus.
  const [editCard, setEditCard] = useState(null);   // null | "company" | "contact"
  const [companyForm, setCompanyForm] = useState(null);
  const [contactForm, setContactForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cardError, setCardError] = useState("");
  // Feldbezogene Fehler (Client-Validierung und Backend-`field`) — werden direkt am
  // betroffenen Eingabefeld angezeigt statt nur als Kartenmeldung.
  const [fieldErrors, setFieldErrors] = useState({});
  const [savedCard, setSavedCard] = useState("");    // dezente gemeinsame Erfolgsmeldung

  const [pwForm, setPwForm] = useState(EMPTY_PW_FORM);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const companyBtnRef = useRef(null);
  const contactBtnRef = useRef(null);
  const refocusRef = useRef(null);

  // Fokus nach Schließen (Speichern/Abbrechen) zurück auf den jeweiligen
  // „Bearbeiten"-Button (Accessibility §20). Kein Fokus-Diebstahl beim Erst-Mount.
  useEffect(() => {
    if (editCard === null && refocusRef.current) {
      const el = refocusRef.current === "company" ? companyBtnRef.current : contactBtnRef.current;
      el?.focus();
      refocusRef.current = null;
    }
  }, [editCard]);

  const companyBase = companyBaseline(user);
  const contactBase = contactBaseline(user);
  const countryName = countries.find(c => c.code === user?.country)?.name;
  const paymentTerm = paymentTermValue(user);
  // Kundennummer ausschließlich aus dem API-Feld customer_number — nie aus user.id abgeleitet.
  const customerNumber = customerNumberOf(user);
  const addressLine = companyAddressLine(user);

  const startCompanyEdit = () => {
    setCompanyForm(companyBaseline(user));
    setCardError(""); setFieldErrors({}); setSavedCard(""); setEditCard("company");
  };
  const startContactEdit = () => {
    setContactForm(contactBaseline(user));
    setCardError(""); setFieldErrors({}); setSavedCard(""); setEditCard("contact");
  };
  const cancelEdit = () => {
    refocusRef.current = editCard;
    setCardError(""); setFieldErrors({});
    setCompanyForm(null); setContactForm(null);
    setEditCard(null);
  };

  const clearFieldError = (k) => setFieldErrors(p => {
    if (!p[k]) return p;
    const n = { ...p }; delete n[k]; return n;
  });
  const updCompany = (k, v) => { clearFieldError(k); setCompanyForm(p => ({ ...p, [k]: v })); };
  const updContact = (k, v) => { clearFieldError(k); setContactForm(p => ({ ...p, [k]: v })); };

  const saveCard = async (which) => {
    const form = which === "company" ? companyForm : contactForm;
    const errors = which === "company" ? validateCompanyForm(form) : validateContactForm(form);
    // Ungültige Pflichtfelder werden gar nicht erst abgesendet.
    if (!isFormValid(errors)) { setFieldErrors(errors); setCardError(Object.values(errors)[0]); return; }
    const patch = which === "company" ? buildCompanyPatch(form) : buildContactPatch(form);

    if (saving) return; // Doppelklick-/Mehrfachversand-Schutz
    setSaving(true); setCardError(""); setFieldErrors({});
    try {
      // auth: true → ein echter Session-401 löst korrekt den globalen Logout aus.
      // Fachliche Validierungsfehler kommen als 400 zurück und loggen NICHT aus.
      const r = await apiFetch(`/kunde/profil`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(patch),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // Feldbezogene Backendfehler (z. B. geleerter Firmenname) am richtigen Feld
        // zeigen; alles andere bleibt die allgemeine Kartenmeldung.
        const { fieldErrors: fe, generalError } = mapApiProfileError(d);
        setFieldErrors(fe);
        setCardError(generalError || Object.values(fe)[0] || "");
        setSaving(false);
        return;
      }
      // Serverwahrheit aus der PATCH-Antwort (RETURNING-Zeile) übernehmen. updateUser
      // merged über den bestehenden State → pendingEmailChange bleibt erhalten.
      if (d.user) updateUser(d.user);
      refocusRef.current = which;
      setSavedCard(which);
      setCompanyForm(null); setContactForm(null);
      setEditCard(null);
    } catch (e) {
      // Editmodus offen lassen, Eingaben erhalten, verständliche Meldung zeigen.
      setCardError(e.message);
    }
    setSaving(false);
  };

  const updPw = (k, v) => setPwForm(p => ({ ...p, [k]: v }));

  const resetPwForm = () => {
    setPwForm(EMPTY_PW_FORM);
    setPwError("");
    setPwSuccess(false);
  };

  const validatePwForm = () => {
    const { currentPassword, newPassword, newPasswordConfirm } = pwForm;
    if (!currentPassword) return "Bitte geben Sie Ihr aktuelles Passwort ein.";
    if (!newPassword) return "Bitte geben Sie ein neues Passwort ein.";
    if (newPassword.length < 8) return "Das neue Passwort muss mindestens 8 Zeichen lang sein.";
    if (newPassword.length > 128) return "Das neue Passwort darf höchstens 128 Zeichen lang sein.";
    if (newPassword === currentPassword) return "Das neue Passwort darf nicht mit dem aktuellen Passwort identisch sein.";
    if (newPasswordConfirm !== newPassword) return "Die neuen Passwörter stimmen nicht überein.";
    return "";
  };

  const handlePasswordChange = async () => {
    setPwSuccess(false);
    const validationError = validatePwForm();
    if (validationError) { setPwError(validationError); return; }

    setPwError("");
    setPwSaving(true);
    try {
      // Bewusst kein `auth: true`: apiFetch würde bei 401 automatisch das
      // Token entfernen + Logout auslösen. Ein 401 hier bedeutet aber
      // "aktuelles Passwort falsch", nicht "Session ungültig" — die gültige
      // Session darf erhalten bleiben. Der Auth-Header wird daher manuell
      // über authH() gesetzt.
      const r = await apiFetch(`/kunde/password`, {
        method: "PATCH",
        headers: authH(),
        body: JSON.stringify(pwForm),
      });
      if (r.ok) {
        setPwSuccess(true);
        setPwForm(EMPTY_PW_FORM);
      } else if (r.status === 401) {
        const d = await r.json().catch(() => ({}));
        // P3: Token wurde serverseitig bereits invalidiert (z.B. Passwort in
        // einem anderen Tab geändert) — dann ist es keine Falscheingabe,
        // sondern eine abgelaufene Session. Gleicher Logout-Pfad wie bei
        // jedem anderen 401 auf einem `auth: true`-Request.
        if (d.error === "Sitzung abgelaufen. Bitte melden Sie sich erneut an.") {
          triggerAuthError();
        } else {
          setPwError("Das aktuelle Passwort ist nicht korrekt.");
        }
      } else if (r.status === 429) {
        setPwError("Zu viele Versuche. Bitte versuchen Sie es später erneut.");
      } else {
        const d = await r.json().catch(() => ({}));
        setPwError(d.error || "Passwort konnte nicht geändert werden. Bitte versuchen Sie es erneut.");
      }
    } catch {
      setPwError("Passwort konnte nicht geändert werden. Bitte versuchen Sie es erneut.");
    }
    setPwSaving(false);
  };

  // ── Render-Helfer ──────────────────────────────────────────────────────────
  const cardHead = (icon, title, subtitle, action) => (
    <div className="table-card-header profile-card-head">
      <div className="profile-card-icon"><Icon n={icon} s={21} /></div>
      <div className="profile-card-heading">
        <span className="table-card-title">{title}</span>
        {subtitle && <span className="profile-card-sub">{subtitle}</span>}
      </div>
      {action}
    </div>
  );

  const editButton = (card, ref, onClick, label) => (
    <button
      type="button"
      ref={ref}
      className="profile-card-edit-action"
      onClick={onClick}
      disabled={isEditActionDisabled(editCard, card)}
      aria-label={label}
    >
      <Icon n="settings" s={14} /> Bearbeiten
    </button>
  );

  const renderRows = (items) => items.map((it, i) => (
    <div key={i} className={`profile-row${i < items.length - 1 ? " profile-row-border" : ""}`}>
      <span className="profile-row-key">{it.k}</span>
      <span className={`profile-row-val${it.empty ? " profile-row-empty" : ""}`}>{it.v}</span>
    </div>
  ));

  // Pflichtfeld-Sternchen (rein visuell; das Eingabefeld trägt required/aria-required).
  const req = <span className="profile-req" aria-hidden="true">*</span>;
  const fieldErr = (k) => fieldErrors[k]
    ? <span className="profile-field-error" role="alert">{fieldErrors[k]}</span>
    : null;
  // Gemeinsame Props für die beiden B2B-Pflichtfelder.
  const requiredProps = (k) => ({
    required: true,
    "aria-required": "true",
    "aria-invalid": fieldErrors[k] ? "true" : undefined,
    className: `field-input${fieldErrors[k] ? " field-input-error" : ""}`,
  });

  const renderCardActions = (which, canSave) => (
    <div className="profile-form-actions">
      <button type="button" className="btn btn-outline" onClick={cancelEdit} disabled={saving}>Abbrechen</button>
      <button type="button" className="btn btn-primary" onClick={() => saveCard(which)} disabled={!canSave}>
        {saving ? <><span className="spinner" /> Wird gespeichert…</> : <><Icon n="check" s={14} /> Speichern</>}
      </button>
    </div>
  );

  const renderCompanyCard = () => {
    const editing = editCard === "company";
    return (
      <div className="table-card profile-card">
        {cardHead("building", PROFILE_TEXT.companyTitle, PROFILE_TEXT.companySubtitle,
          !editing && editButton("company", companyBtnRef, startCompanyEdit, "Unternehmensdaten bearbeiten"))}
        {editing ? (
          <div className="profile-form-body profile-inline-form">
            {cardError && (
              <div className="alert alert-error mb-16" role="alert"><Icon n="x" s={16} />{cardError}</div>
            )}
            <p className="profile-required-hint">
              Firmenname ist eine Pflichtangabe — ConfidaraExpress ist eine reine Geschäftskundenplattform.
            </p>
            <div className="field">
              <label className="field-label" htmlFor="pf-company-name">Firmenname {req}</label>
              <input id="pf-company-name" {...requiredProps("company_name")} value={companyForm.company_name}
                onChange={e => updCompany("company_name", e.target.value)}
                autoComplete="organization" />
              {fieldErr("company_name")}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="pf-vat">USt-ID</label>
              <input id="pf-vat" className="field-input" value={companyForm.vat_id}
                onChange={e => updCompany("vat_id", e.target.value)} placeholder="DE123456789" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="pf-street">Straße & Hausnummer</label>
              <input id="pf-street" className="field-input" value={companyForm.street}
                onChange={e => updCompany("street", e.target.value)} />
            </div>
            <div className="field-row field-row-3">
              <div className="field">
                <label className="field-label" htmlFor="pf-zip">PLZ</label>
                <input id="pf-zip" className="field-input" value={companyForm.zip}
                  onChange={e => updCompany("zip", e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="pf-city">Stadt</label>
                <input id="pf-city" className="field-input" value={companyForm.city}
                  onChange={e => updCompany("city", e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="pf-country">Land</label>
                <select id="pf-country" className="field-input field-select" value={companyForm.country}
                  onChange={e => updCompany("country", e.target.value)}>
                  {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
            </div>
            {renderCardActions("company", canSaveCompany(companyForm, companyBase, saving))}
          </div>
        ) : (
          <div className="profile-section-body">
            {renderRows([
              { k: "Firmenname", v: user?.company_name || "Nicht angegeben", empty: !user?.company_name },
              { k: "USt-ID", v: user?.vat_id || "Noch nicht hinterlegt", empty: !user?.vat_id },
              { k: "Adresse", v: addressLine || "Keine Adresse hinterlegt", empty: !addressLine },
              { k: "Land", v: countryName || "Nicht angegeben", empty: !countryName },
            ])}
          </div>
        )}
      </div>
    );
  };

  const renderContactCard = () => {
    const editing = editCard === "contact";
    return (
      <div className="table-card profile-card">
        {cardHead("user", PROFILE_TEXT.contactTitle, PROFILE_TEXT.contactSubtitle,
          !editing && editButton("contact", contactBtnRef, startContactEdit, "Ansprechpartner bearbeiten"))}
        {editing ? (
          <div className="profile-form-body profile-inline-form">
            {cardError && (
              <div className="alert alert-error mb-16" role="alert"><Icon n="x" s={16} />{cardError}</div>
            )}
            <p className="profile-required-hint">
              Der Ansprechpartner ist eine Pflichtangabe und kann nicht entfernt werden.
            </p>
            <div className="field">
              <label className="field-label" htmlFor="pf-name">Name {req}</label>
              <input id="pf-name" {...requiredProps("name")} value={contactForm.name}
                onChange={e => updContact("name", e.target.value)}
                autoComplete="name" />
              {fieldErr("name")}
            </div>
            {renderCardActions("contact", canSaveContact(contactForm, contactBase, saving))}
          </div>
        ) : (
          <div className="profile-section-body">
            {renderRows([
              { k: "Name", v: user?.name || "Nicht angegeben", empty: !user?.name },
            ])}
          </div>
        )}
      </div>
    );
  };

  const renderAccountCard = () => (
    <div className="table-card profile-card">
      {cardHead("card", PROFILE_TEXT.accountTitle, "Informationen zu Ihrem Geschäftskonto", null)}
      <div className="profile-section-body">
        {renderRows([
          { k: "Status", v: <StatusBadge status={user?.status} /> },
          { k: PROFILE_TEXT.paymentMethodLabel, v: PROFILE_TEXT.paymentMethodValue },
          { k: PROFILE_TEXT.paymentTermLabel, v: paymentTerm, empty: !user?.payment_term },
        ])}
        <div className="profile-hint">
          <Icon n="info" s={15} />
          <div className="profile-hint-text"><p>{PROFILE_TEXT.paymentHint}</p></div>
        </div>
      </div>
    </div>
  );

  const renderSecurityCard = () => (
    <div className="table-card profile-card">
      {cardHead("shield", "Sicherheit", "Schützen Sie Ihr Konto", null)}
      <div className="profile-section-body">
        {renderRows([
          { k: "Login-E-Mail", v: user?.email || "Nicht angegeben", empty: !user?.email },
        ])}
        {/* Login-E-Mail ändern: direkt unter der aktuellen Login-E-Mail,
            getrennt von der Passwortänderung (eigener State/Fehler/Busy). */}
        <EmailChangeSection user={user} />
        <div className="profile-hint">
          <Icon n="lock" s={15} />
          <div className="profile-hint-text"><p>{PROFILE_TEXT.securityHint}</p></div>
        </div>
      </div>

      <div className="profile-form-body profile-password-section">
        <span className="profile-password-title">Passwort ändern</span>
        <p className="profile-password-desc">Ändern Sie Ihr Passwort regelmäßig, um Ihr Konto zu schützen.</p>

        {pwSuccess && (
          <div className="alert alert-success mb-16" role="status">
            <Icon n="shield" s={16} /> Passwort erfolgreich geändert.
          </div>
        )}
        {pwError && (
          <div className="alert alert-error mb-16" role="alert">
            <Icon n="x" s={16} />{pwError}
          </div>
        )}

        <PasswordField
          dark={false}
          label="Aktuelles Passwort"
          value={pwForm.currentPassword}
          onChange={(e) => updPw("currentPassword", e.target.value)}
          autoComplete="current-password"
        />
        <PasswordField
          dark={false}
          label="Neues Passwort"
          value={pwForm.newPassword}
          onChange={(e) => updPw("newPassword", e.target.value)}
          autoComplete="new-password"
        />
        <PasswordField
          dark={false}
          label="Neues Passwort wiederholen"
          value={pwForm.newPasswordConfirm}
          onChange={(e) => updPw("newPasswordConfirm", e.target.value)}
          autoComplete="new-password"
        />

        <div className="profile-form-actions">
          <button type="button" className="btn btn-outline" onClick={resetPwForm} disabled={pwSaving}>Zurücksetzen</button>
          <button type="button" className="btn btn-primary" onClick={handlePasswordChange} disabled={pwSaving}>
            {pwSaving ? <><span className="spinner" /> Wird geändert…</> : <><Icon n="lock" s={14} /> Passwort ändern</>}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <PremiumBackground variant="profile" />
      <div className="page-body">
        <div className="profile-page-head">
          <div className="profile-page-head-text">
            <h1 className="dash-section-title">Unternehmen &amp; Konto</h1>
            <p className="dash-section-sub">Verwalten Sie Ihre Unternehmens- und Kontodaten sicher an einem Ort.</p>
          </div>
        </div>

        <div className="profile-account-header">
          <div className="profile-account-identity">
            <div className="profile-avatar-lg">CE</div>
            <div className="profile-account-info">
              <div className="profile-account-name">{user?.company_name || user?.name || "Nicht angegeben"}</div>
              <div className="profile-account-email">
                <Icon n="mail" s={14} /> {user?.email || "Nicht angegeben"}
              </div>
              {/* Kundennummer (CE-K-…) — rein lesend, nicht editierbar und bewusst NICHT an
                  users.id gekoppelt. Bestandskonten ohne Nummer zeigen einen neutralen
                  Hinweis statt eines technischen Leerwerts. */}
              <div className="profile-account-customer-number" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="text-muted" style={{ fontSize: 12 }}>{NUMBER_LABELS.customer}:</span>
                {customerNumber
                  ? <CopyableNumber value={customerNumber} label={NUMBER_LABELS.customer} />
                  : <span className="text-muted" style={{ fontSize: 13 }}>{NOT_ASSIGNED_TEXT}</span>}
              </div>
              <div className="profile-meta-row">
                <StatusBadge status={user?.status} />
                <span className="profile-meta-chip"><Icon n="building" s={13} /> B2B-Konto</span>
                <span className="profile-meta-chip profile-meta-chip-accent"><Icon n="clock" s={13} /> Zahlungsziel: {paymentTerm}</span>
              </div>
            </div>
          </div>
        </div>

        {savedCard && editCard === null && (
          <div className="alert alert-success mb-16" role="status">
            <Icon n="shield" s={16} /> Profil erfolgreich gespeichert.
          </div>
        )}

        <div className="profile-grid">
          <div className="profile-col">
            {renderCompanyCard()}
            {renderContactCard()}
          </div>
          <div className="profile-col">
            {renderAccountCard()}
            {renderSecurityCard()}
          </div>
        </div>
      </div>
    </>
  );
}
