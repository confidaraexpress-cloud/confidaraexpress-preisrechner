import React, { useState, useRef, useEffect } from "react";
import { PageHeader } from "../ui/PageHeader";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { PasswordField } from "../ui/PasswordField";
import { FormAlert } from "../ui/FormAlert";
import { apiFetch, authH, triggerAuthError, getCurrentConsolidatedPeriod } from "../../api/client";
import { money } from "../../utils/formatters";
import {
  BILLING_MODES, BILLING_MODE_TEXT, billingMode, buildBillingModePatch,
  consolidatedPeriodView,
} from "../../utils/billingModeView.mjs";
import { normalizeThrownError } from "../../utils/apiError.mjs";
import { countries } from "../../utils/countries";
import { useAuth } from "../../context/AuthContext";
import { EmailChangeSection } from "./EmailChangeSection";
import {
  companyBaseline, contactBaseline,
  buildCompanyPatch, buildContactPatch,
  validateCompanyForm, validateContactForm, isFormValid,
  canSaveCompany, canSaveContact, isEditActionDisabled,
  companyAddressLine, paymentTermValue, PROFILE_TEXT,
  mapApiProfileError,
  DELIVERY_NOTE_MODES, DELIVERY_NOTE_TEXT, deliveryNoteMode, buildDeliveryNotePatch,
} from "../../utils/profileView.mjs";
import { customerNumberOf, NOT_ASSIGNED_TEXT, NUMBER_LABELS } from "../../utils/businessNumbers.mjs";
import { accountInitials, accountDisplayName } from "../../utils/accountIdentity.mjs";
import { CopyableNumber } from "../ui/CopyableNumber";
import { CompanyLogoPreview } from "../ui/UserChip";
import { useCompanyLogo } from "../../hooks/useCompanyLogo";
import { uploadCompanyLogo, deleteCompanyLogo } from "../../api/companyLogoApi";
import {
  COMPANY_LOGO_TEXT, LOGO_ACCEPT, companyLogoMeta,
  formatLogoSize, formatLogoDimensions, preCheckLogoFile, logoErrorMessage,
} from "../../utils/companyLogoView.mjs";

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

export function Profile({ user, utility }) {
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
  // Der Passwortbereich ist geschlossen, bis der Nutzer ihn ausdrücklich
  // öffnet (Paket D, Teil 4). Vorher stand das dreifeldrige Formular dauerhaft
  // offen und dominierte die Sicherheitskarte, obwohl ein Passwortwechsel eine
  // seltene, bewusste Handlung ist. Regeln, Felder und API sind unverändert.
  const [pwOpen, setPwOpen] = useState(false);

  // Lieferscheineinstellung. Eigener Speicherzustand statt der Ein-Karten-Editregel:
  // eine Auswahl aus drei Optionen hat keinen Bearbeiten-Modus — sie wird umgestellt und
  // gespeichert. Gespeichert wird über denselben PATCH /kunde/profil wie alle anderen
  // Profilfelder, es gibt keine zweite Speicherstrecke.
  const [dnMode, setDnMode] = useState(() => deliveryNoteMode(user));
  const [dnSaving, setDnSaving] = useState(false);
  const [dnError, setDnError] = useState("");
  const [dnSaved, setDnSaved] = useState(false);
  // Serverwahrheit gewinnt: nach einem erfolgreichen Speichern (updateUser) und nach
  // jedem Neuladen folgt die Auswahl dem Konto, nicht dem lokalen Zwischenstand.
  const serverDnMode = deliveryNoteMode(user);
  useEffect(() => { setDnMode(serverDnMode); }, [serverDnMode]);

  // Abrechnungsart. Exakt dasselbe Muster wie die Lieferscheineinstellung darüber:
  // eine Auswahl aus zwei Optionen hat keinen Bearbeiten-Modus, sie wird umgestellt und
  // über denselben PATCH /kunde/profil gespeichert. Keine zweite Speicherstrecke.
  const [bmMode, setBmMode] = useState(() => billingMode(user));
  const [bmSaving, setBmSaving] = useState(false);
  const [bmError, setBmError] = useState("");
  const [bmSaved, setBmSaved] = useState(false);
  const serverBmMode = billingMode(user);
  useEffect(() => { setBmMode(serverBmMode); }, [serverBmMode]);

  // Vorschau auf den laufenden Sammelzeitraum. Sie wird NUR bei Sammelabrechnung geholt —
  // ein Einzelrechnungskonto stellt die Anfrage gar nicht erst. Der Abruf verändert
  // serverseitig nichts (read-only) und darf die Karte bei einem Ausfall nicht brechen:
  // ein Fehler ergibt eine ruhige Hinweiszeile, keine leere Fläche.
  const [periodData, setPeriodData] = useState(null);
  const [periodError, setPeriodError] = useState("");
  useEffect(() => {
    if (serverBmMode !== "consolidated_7d") { setPeriodData(null); setPeriodError(""); return undefined; }
    let alive = true;
    (async () => {
      try {
        const r = await getCurrentConsolidatedPeriod();
        if (!alive) return;
        if (!r.ok) { setPeriodError(BILLING_MODE_TEXT.periodLoadError); return; }
        setPeriodError(""); setPeriodData(r.data);
      } catch {
        if (alive) setPeriodError(BILLING_MODE_TEXT.periodLoadError);
      }
    })();
    return () => { alive = false; };
  }, [serverBmMode]);

  // Firmenlogo. Das Bild selbst kommt aus derselben Quelle wie im Benutzerchip
  // (ein Abruf je Fassung, Modulzwischenspeicher) — hier wird nichts zweites
  // geladen. Der Dateidialog läuft über ein verstecktes <input type="file">, das
  // ein regulärer .btn auslöst: ein nativer Dateiknopf lässt sich nicht auf die
  // Foundation-Primitives bringen.
  const logoMeta = companyLogoMeta(user);
  const logoUrl = useCompanyLogo(user);
  const logoInputRef = useRef(null);
  const [logoBusy, setLogoBusy] = useState("");     // "" | "upload" | "remove"
  const [logoError, setLogoError] = useState("");
  const [logoSaved, setLogoSaved] = useState("");

  const companyBtnRef = useRef(null);
  const contactBtnRef = useRef(null);
  const refocusRef = useRef(null);
  const pwToggleRef = useRef(null);
  const pwFirstFieldRef = useRef(null);
  // Fokus folgt der Nutzeraktion: beim Öffnen ins erste Feld, beim Schließen
  // zurück auf den auslösenden Knopf. `pwReturnFocus` verhindert, dass der
  // Fokus beim Erst-Mount gestohlen wird.
  const pwReturnFocus = useRef(false);
  useEffect(() => {
    if (pwOpen) { pwFirstFieldRef.current?.focus(); return; }
    if (pwReturnFocus.current) { pwToggleRef.current?.focus(); pwReturnFocus.current = false; }
  }, [pwOpen]);

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
      // Zentrale Transportklassifizierung statt rohem e.message: ein
      // Verbindungsabbruch hieß hier vorher wortwörtlich „Failed to fetch".
      setCardError(normalizeThrownError(e).message);
    }
    setSaving(false);
  };

  const updPw = (k, v) => setPwForm(p => ({ ...p, [k]: v }));

  // Öffnen startet immer mit leeren Feldern und ohne Altmeldungen.
  const openPwForm = () => {
    setPwForm(EMPTY_PW_FORM);
    setPwError("");
    setPwSuccess(false);
    setPwOpen(true);
  };

  // Abbrechen stellt den geschlossenen Zustand wieder her und verwirft die
  // Eingaben — ein halb ausgefülltes Passwortformular soll nicht stehen bleiben.
  const closePwForm = () => {
    if (pwSaving) return;
    setPwForm(EMPTY_PW_FORM);
    setPwError("");
    pwReturnFocus.current = true;
    setPwOpen(false);
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
        // Erfolgreich geändert → der Bereich schließt sich wieder; die
        // Erfolgsmeldung bleibt als Quittung sichtbar.
        pwReturnFocus.current = true;
        setPwOpen(false);
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

  // Speichert die Lieferscheineinstellung über denselben Profil-PATCH wie alle anderen
  // Felder. Der Wert wird optimistisch angezeigt (die Auswahl fühlt sich sofort an) und
  // bei einem Fehler auf die Serverwahrheit zurückgesetzt — es bleibt nie eine Auswahl
  // stehen, die nicht gespeichert wurde.
  const saveDeliveryNoteMode = async (mode) => {
    if (dnSaving || mode === serverDnMode) return;
    setDnMode(mode);
    setDnSaving(true); setDnError(""); setDnSaved(false);
    try {
      const r = await apiFetch(`/kunde/profil`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(buildDeliveryNotePatch(mode)),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setDnMode(serverDnMode);
        setDnError(d?.error || "Die Einstellung konnte nicht gespeichert werden.");
        setDnSaving(false);
        return;
      }
      if (d.user) updateUser(d.user);
      setDnSaved(true);
    } catch (e) {
      setDnMode(serverDnMode);
      setDnError(normalizeThrownError(e).message);
    }
    setDnSaving(false);
  };

  // Native Radios auf dem globalen forms.css-Primitive — dasselbe Muster wie die
  // Zollrechnungsauswahl der Buchung. Kein zweites Auswahlbauteil.
  const renderDeliveryNoteCard = () => (
    <div className="table-card profile-card">
      {cardHead("form", DELIVERY_NOTE_TEXT.title, DELIVERY_NOTE_TEXT.subtitle, null)}
      <div className="profile-section-body">
        <fieldset className="dn-mode-fieldset" disabled={dnSaving}>
          <legend className="field-label">{DELIVERY_NOTE_TEXT.fieldLabel}</legend>
          {DELIVERY_NOTE_MODES.map((mode) => {
            const opt = DELIVERY_NOTE_TEXT.options[mode];
            const id = `dn-mode-${mode}`;
            return (
              <label key={mode} className={`dn-mode-option${dnMode === mode ? " selected" : ""}`} htmlFor={id}>
                <input
                  id={id}
                  type="radio"
                  name="deliveryNoteMode"
                  value={mode}
                  checked={dnMode === mode}
                  onChange={() => saveDeliveryNoteMode(mode)}
                />
                <span className="dn-mode-text">
                  <span className="dn-mode-label">{opt.label}</span>
                  <span className="field-hint">{opt.hint}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {dnError && <FormAlert tone="error" message={dnError} className="mt-16" />}
        {dnSaved && !dnError && (
          <p className="profile-saved" role="status">
            <Icon n="check" s={14} /> Einstellung gespeichert
          </p>
        )}
      </div>
    </div>
  );

  // Speichert die Abrechnungsart über denselben Profil-PATCH. Optimistische Anzeige mit
  // Rückfall auf die Serverwahrheit bei einem Fehler — es bleibt nie eine Auswahl stehen,
  // die nicht gespeichert wurde.
  const saveBillingMode = async (mode) => {
    if (bmSaving || mode === serverBmMode) return;
    setBmMode(mode);
    setBmSaving(true); setBmError(""); setBmSaved(false);
    try {
      const r = await apiFetch(`/kunde/profil`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(buildBillingModePatch(mode)),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setBmMode(serverBmMode);
        setBmError(d?.error || "Die Einstellung konnte nicht gespeichert werden.");
        setBmSaving(false);
        return;
      }
      if (d.user) updateUser(d.user);
      setBmSaved(true);
    } catch (e) {
      setBmMode(serverBmMode);
      setBmError(normalizeThrownError(e).message);
    }
    setBmSaving(false);
  };

  // Dieselben nativen Radios auf demselben forms.css-Primitive wie die
  // Lieferscheinauswahl — kein zweites Auswahlbauteil, keine eigenen Klassen.
  const renderBillingModeCard = () => {
    const period = periodData ? consolidatedPeriodView(periodData) : null;
    return (
      <div className="table-card profile-card">
        {cardHead("invoice", BILLING_MODE_TEXT.title, BILLING_MODE_TEXT.subtitle, null)}
        <div className="profile-section-body">
          <fieldset className="dn-mode-fieldset" disabled={bmSaving}>
            <legend className="field-label">{BILLING_MODE_TEXT.fieldLabel}</legend>
            {BILLING_MODES.map((mode) => {
              const opt = BILLING_MODE_TEXT.options[mode];
              const id = `bm-mode-${mode}`;
              return (
                <label key={mode} className={`dn-mode-option${bmMode === mode ? " selected" : ""}`} htmlFor={id}>
                  <input
                    id={id}
                    type="radio"
                    name="billingMode"
                    value={mode}
                    checked={bmMode === mode}
                    onChange={() => saveBillingMode(mode)}
                  />
                  <span className="dn-mode-text">
                    <span className="dn-mode-label">{opt.label}</span>
                    <span className="field-hint">{opt.hint}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <p className="field-hint mt-8">{BILLING_MODE_TEXT.changeNote}</p>
          {bmError && <FormAlert tone="error" message={bmError} className="mt-16" />}
          {bmSaved && !bmError && (
            <p className="profile-saved" role="status">
              <Icon n="check" s={14} /> Einstellung gespeichert
            </p>
          )}
          {/* Laufender Zeitraum — ausschließlich Serverwerte, nichts wird gerechnet.
              Erscheint nur bei Sammelabrechnung und nur, wenn der Server tatsächlich
              einen Zeitraum liefert; sonst steht dort der leere Zustand. */}
          {serverBmMode === "consolidated_7d" && (
            <div className="bm-period mt-16">
              <h4 className="field-label">{BILLING_MODE_TEXT.periodTitle}</h4>
              {periodError && <FormAlert tone="error" message={periodError} className="mt-8" />}
              {!periodError && (!period || !period.hasPeriod) && (
                <p className="field-hint">{BILLING_MODE_TEXT.periodEmpty}</p>
              )}
              {!periodError && period && period.hasPeriod && (
                <>
                  <div className="summary-detail-row summary-detail-row-border">
                    <span className="text-sm text-muted summary-detail-key">Zeitraum</span>
                    <span className="text-sm font-bold summary-detail-val">{period.rangeLabel}</span>
                  </div>
                  <div className="summary-detail-row summary-detail-row-border">
                    <span className="text-sm text-muted summary-detail-key">{BILLING_MODE_TEXT.periodCountLabel}</span>
                    <span className="text-sm font-bold summary-detail-val">{period.shipmentCount}</span>
                  </div>
                  <div className="summary-detail-row summary-detail-row-border">
                    <span className="text-sm text-muted summary-detail-key">{BILLING_MODE_TEXT.periodAmountLabel}</span>
                    <span className="text-sm font-bold summary-detail-val">{money(period.grossAmount)}</span>
                  </div>
                  {period.invoiceDateLabel && (
                    <div className="summary-detail-row summary-detail-row-border">
                      <span className="text-sm text-muted summary-detail-key">{BILLING_MODE_TEXT.periodInvoiceDateLabel}</span>
                      <span className="text-sm font-bold summary-detail-val">{period.invoiceDateLabel}</span>
                    </div>
                  )}
                  <p className="field-hint mt-8">{BILLING_MODE_TEXT.periodPreviewNote}</p>
                  {period.earlierCount > 0 && (
                    <p className="field-hint">
                      {period.earlierCount === 1
                        ? "1 weitere Sendung aus einem früheren Zeitraum wartet noch auf ihre Rechnung."
                        : `${period.earlierCount} weitere Sendungen aus früheren Zeiträumen warten noch auf ihre Rechnung.`}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Firmenlogo ─────────────────────────────────────────────────────────────
  // Der Upload läuft über den eigenen, auth-geschützten Endpunkt (Multipart) —
  // NICHT über PATCH /kunde/profil: der JSON-Body ist serverseitig auf 100 KB
  // gedeckelt, ein Bild passt dort nicht hinein.
  //
  // Die Clientprüfung davor ist reiner Komfort (sofortige Rückmeldung statt
  // Rundreise) und ausdrücklich KEIN Ersatz für die Serverprüfung: der Server
  // prüft MIME-Typ, Dateisignatur, Größe und Bildmaße erneut und ist allein
  // maßgeblich.
  const onLogoSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    // Den Dateidialog sofort zurücksetzen: sonst löst dieselbe Datei beim
    // zweiten Wählen kein change-Ereignis aus.
    e.target.value = "";
    if (!file) return;

    const complaint = preCheckLogoFile(file);
    if (complaint) { setLogoError(complaint); setLogoSaved(""); return; }

    setLogoBusy("upload"); setLogoError(""); setLogoSaved("");
    try {
      const r = await uploadCompanyLogo(file);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setLogoError(logoErrorMessage(d)); setLogoBusy(""); return; }
      // Der Server liefert die neuen Metadaten inklusive Version zurück. Sie in
      // das Konto zu spiegeln, ist zugleich der Cache-Busting-Mechanismus: die
      // geänderte Version lässt den Bildzwischenspeicher nicht mehr greifen, und
      // Chip wie Vorschau holen dieselbe neue Fassung.
      updateUser({ companyLogo: d.companyLogo ?? null });
      setLogoSaved(COMPANY_LOGO_TEXT.savedUpload);
    } catch (err) {
      setLogoError(normalizeThrownError(err).message);
    }
    setLogoBusy("");
  };

  const onLogoRemove = async () => {
    if (logoBusy) return;
    setLogoBusy("remove"); setLogoError(""); setLogoSaved("");
    try {
      const r = await deleteCompanyLogo();
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setLogoError(logoErrorMessage(d, COMPANY_LOGO_TEXT.removeError)); setLogoBusy(""); return; }
      updateUser({ companyLogo: null });
      setLogoSaved(COMPANY_LOGO_TEXT.savedRemove);
    } catch (err) {
      setLogoError(normalizeThrownError(err).message);
    }
    setLogoBusy("");
  };

  const renderCompanyLogoCard = () => {
    const size = formatLogoSize(logoMeta?.sizeBytes);
    const dims = formatLogoDimensions(logoMeta);
    const facts = [size, dims].filter(Boolean).join(" · ");
    return (
      <div className="table-card profile-card">
        {cardHead("image", COMPANY_LOGO_TEXT.title, COMPANY_LOGO_TEXT.subtitle, null)}
        <div className="profile-section-body">
          <div className="profile-logo-row">
            <CompanyLogoPreview logoUrl={logoUrl} initial={accountInitials(user)} />
            <div className="profile-logo-copy">
              <p className="profile-logo-desc">{COMPANY_LOGO_TEXT.description}</p>
              {logoMeta
                ? facts && <p className="profile-logo-meta">{facts}</p>
                : <p className="profile-logo-meta">{COMPANY_LOGO_TEXT.empty}</p>}
            </div>
          </div>

          {/* Das native Dateifeld bleibt unsichtbar, ist aber ein echtes
              Formularelement — der sichtbare Knopf löst es aus. Keine
              Drag-and-drop-Fläche, kein Zuschneide-Editor: das war nicht
              Teil der Aufgabe. */}
          <input
            ref={logoInputRef}
            type="file"
            accept={LOGO_ACCEPT}
            className="sr-only"
            onChange={onLogoSelected}
            aria-hidden="true"
            tabIndex={-1}
          />

          <div className="profile-logo-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoBusy !== ""}
            >
              <Icon n="upload" s={14} />
              {logoBusy === "upload" ? COMPANY_LOGO_TEXT.uploading : (logoMeta ? COMPANY_LOGO_TEXT.replace : COMPANY_LOGO_TEXT.choose)}
            </button>
            {logoMeta && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onLogoRemove}
                disabled={logoBusy !== ""}
              >
                {logoBusy === "remove" ? COMPANY_LOGO_TEXT.removing : COMPANY_LOGO_TEXT.remove}
              </button>
            )}
          </div>

          <p className="field-hint profile-logo-req">
            {COMPANY_LOGO_TEXT.requirements} {COMPANY_LOGO_TEXT.svgHint}
          </p>

          {logoError && <FormAlert tone="error" message={logoError} className="mt-16" />}
          {logoSaved && !logoError && (
            <p className="profile-saved" role="status">
              <Icon n="check" s={14} /> {logoSaved}
            </p>
          )}
        </div>
      </div>
    );
  };

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
        <div className="profile-password-row">
          <div className="profile-password-copy">
            <span className="profile-password-title">Passwort</span>
            <p className="profile-password-desc">Ändern Sie Ihr Passwort regelmäßig, um Ihr Konto zu schützen.</p>
          </div>
          {!pwOpen && (
            <button
              type="button"
              ref={pwToggleRef}
              className="btn btn-outline btn-sm"
              onClick={openPwForm}
              aria-expanded={false}
            >
              <Icon n="lock" s={14} /> Passwort ändern
            </button>
          )}
        </div>

        {/* Die Erfolgsmeldung bleibt auch nach dem Schließen stehen — sie ist
            die Quittung der abgeschlossenen Handlung. */}
        {pwSuccess && (
          <FormAlert tone="success" message="Passwort erfolgreich geändert." />
        )}

        {pwOpen && (
          <div className="profile-password-form">
            {pwError && <FormAlert tone="error" message={pwError} />}

            <PasswordField
              dark={false}
              id="pf-pw-current"
              inputRef={pwFirstFieldRef}
              label="Aktuelles Passwort"
              value={pwForm.currentPassword}
              onChange={(e) => updPw("currentPassword", e.target.value)}
              autoComplete="current-password"
            />
            <PasswordField
              dark={false}
              id="pf-pw-new"
              label="Neues Passwort"
              value={pwForm.newPassword}
              onChange={(e) => updPw("newPassword", e.target.value)}
              autoComplete="new-password"
            />
            <PasswordField
              dark={false}
              id="pf-pw-confirm"
              label="Neues Passwort wiederholen"
              value={pwForm.newPasswordConfirm}
              onChange={(e) => updPw("newPasswordConfirm", e.target.value)}
              autoComplete="new-password"
            />

            <div className="profile-form-actions">
              <button type="button" className="btn btn-outline" onClick={closePwForm} disabled={pwSaving}>Abbrechen</button>
              <button type="button" className="btn btn-primary" onClick={handlePasswordChange} disabled={pwSaving}>
                {pwSaving ? <><span className="spinner" /> Wird geändert…</> : <><Icon n="lock" s={14} /> Passwort ändern</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="page-body">
        <PageHeader
          eyebrow="Konto"
          title={<>Kontoeinstellungen</>}
          subtitle="Verwalten Sie Ihre Unternehmens- und Kontodaten sicher an einem Ort."
          utility={utility}
          className="profile-page-head"
        />

        {/* Profilhero als Base Card (Paket D): dasselbe Material wie jede
            andere Fläche des eingeloggten Bereichs — kein eigener Verlauf,
            keine eigene Kante, keine eigene Tiefe mehr.
            Die Initiale kommt aus derselben Quelle wie Sidebar und
            Benutzerchip; die frühere fest verdrahtete Marke „CE" zeigte für
            ein Konto „Muster GmbH" das falsche Zeichen. */}
        <div className="ce-card profile-account-header">
          <div className="profile-account-identity">
            <div className="profile-avatar-lg" aria-hidden="true">{accountInitials(user)}</div>
            <div className="profile-account-info">
              <div className="profile-account-name">{accountDisplayName(user, "Nicht angegeben")}</div>
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
            {/* Das Logo gehört zu den Unternehmensdaten und steht deshalb
                direkt darunter — nicht in der Kontospalte. */}
            {renderCompanyLogoCard()}
            {renderContactCard()}
          </div>
          <div className="profile-col">
            {renderAccountCard()}
            {renderDeliveryNoteCard()}
            {renderBillingModeCard()}
            {renderSecurityCard()}
          </div>
        </div>
    </div>
  );
}
