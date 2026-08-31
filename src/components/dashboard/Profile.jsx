import React, { useState, useRef, useEffect } from "react";
import { PageHeader } from "../ui/PageHeader";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { PasswordField } from "../ui/PasswordField";
import { FormAlert } from "../ui/FormAlert";
import { apiFetch, authH, triggerAuthError } from "../../api/client";
import { normalizeThrownError } from "../../utils/apiError.mjs";
import { countries } from "../../utils/countries";
import { useLaunchScope } from "../../hooks/useLaunchScope";
import { CUSTOMS_UI_ENABLED } from "../../config/launchMode.mjs";
import { useAuth } from "../../context/AuthContext";
import { EmailChangeSection } from "./EmailChangeSection";
// Die drei Einstellungskarten mit eigener Speicherstrecke (Lieferschein,
// Abrechnungsart, Firmenlogo) sind eigenständige Abschnittskomponenten nach dem
// Vorbild der EmailChangeSection — jede trägt ihren Zustand selbst.
import { DeliveryNoteCard } from "./DeliveryNoteCard";
import { BillingModeCard } from "./BillingModeCard";
import { CompanyLogoCard } from "./CompanyLogoCard";
import { cardHead } from "./ProfileCardHead";
import {
  companyBaseline, contactBaseline,
  buildCompanyPatch, buildContactPatch,
  validateCompanyForm, validateContactForm, isFormValid,
  canSaveCompany, canSaveContact, isEditActionDisabled,
  companyAddressLine, paymentTermValue, PROFILE_TEXT,
  mapApiProfileError,
} from "../../utils/profileView.mjs";
import { customerNumberOf, NOT_ASSIGNED_TEXT, NUMBER_LABELS } from "../../utils/businessNumbers.mjs";
// Nur der Hilfetext des EORI-Felds. Formatprüfung und Normalisierung laufen bereits in
// profileView.mjs (companyBaseline/buildCompanyPatch/validateCompanyForm) — hier steht
// keine zweite Regel.
import { EORI_HINT, eoriFieldError } from "../../utils/eori.mjs";
import { accountInitials, accountDisplayName } from "../../utils/accountIdentity.mjs";
// Passwort-Längenregel (8–128, Zählung in Code-Points). Einzige Quelle der
// Wahrheit im Frontend; Spiegel von lib/passwordPolicy.js im Backend.
import { PASSWORD_MIN_LEN, PASSWORD_MAX_LEN, passwordLengthError } from "../../utils/passwordPolicy.mjs";
import { CopyableNumber } from "../ui/CopyableNumber";

// Benötigt Backend: PATCH /kunde/profil — bereichsweise Teilupdates:
//   Unternehmensdaten → { company_name, vat_id, eori_number, street, zip, city, country }
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

// Wortlaute der Passwortänderung — wortgleich zu vorher (ein Governance-Test
// prüft den Text). Die Regel selbst (8–128, Code-Points) steht in
// passwordPolicy.mjs; hier steht nur die Formulierung.
const PW_CHANGE_TEXTS = Object.freeze({
  tooShort: `Das neue Passwort muss mindestens ${PASSWORD_MIN_LEN} Zeichen lang sein.`,
  tooLong:  `Das neue Passwort darf höchstens ${PASSWORD_MAX_LEN} Zeichen lang sein.`,
});

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

  // Lieferschein, Abrechnungsart und Firmenlogo sind eigenständige
  // Abschnittskomponenten (DeliveryNoteCard, BillingModeCard, CompanyLogoCard)
  // mit je eigenem Zustand und eigener Speicherstrecke — siehe Imports oben.

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
  // Nur die Länder, die ConfidaraExpress heute anbietet — die Liste kommt vom Server
  // (GET /api/shipping/launch-scope), nicht aus einer zweiten Aufzählung im Client.
  // Die ANZEIGE eines gespeicherten Landes läuft weiter über die volle Liste: ein Konto,
  // das noch ein nicht mehr angebotenes Land trägt, soll seinen Wert lesbar sehen und
  // nicht plötzlich einen rohen Ländercode.
  const { countries: launchCountries } = useLaunchScope();
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
    // Länge über die zentrale Regel; die beiden Wortlaute bleiben unverändert.
    const lengthError = passwordLengthError(newPassword, PW_CHANGE_TEXTS);
    if (lengthError) return lengthError;
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
  // Der gemeinsame Kartenkopf (cardHead) kommt aus ProfileCardHead.jsx — dieselbe
  // Fassung nutzen auch die drei ausgelagerten Einstellungskarten.
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
            {/* ── Launch-Modus: die EORI-Nummer wird nicht erfasst ──────────────────────
                Sie identifiziert den Ausführer gegenüber dem Zoll und wird ausschließlich
                für eine zollpflichtige Sendung gebraucht. Solange ConfidaraExpress keinen
                Drittlandversand anbietet, wäre das Feld eine Abfrage ohne Verwendung — und
                ein Stammdatum, das der Kunde pflegt, ohne dass es je gelesen wird.

                Der gespeicherte Wert bleibt unangetastet: `users.eori_number` wird nicht
                geleert, nicht migriert und beim Speichern der Unternehmenskarte nicht
                überschrieben (`buildCompanyPatch` sendet nur geänderte Felder, und dieses
                kann sich ohne Eingabefeld nicht ändern). Für Customs V2 fällt hier nur die
                Bedingung weg — Feld, Hilfetext, Formatprüfung und `utils/eori.mjs` sind
                vollständig erhalten. */}
            {CUSTOMS_UI_ENABLED && <div className="field">
              {/* Optional — bewusst OHNE Pflichtsternchen: die EORI ist ein Stammdatum,
                  kein Registrierungserfordernis. Verlangt wird sie ausschließlich beim
                  Buchen einer zollpflichtigen Sendung, und dort sagt es die Buchungsseite.
                  Der Hilfetext nennt den Zweck und behauptet NICHT, die Eingabe sei damit
                  behördlich geprüft — geprüft wird nur das Format. */}
              <label className="field-label" htmlFor="pf-eori">EORI-Nummer</label>
              <input id="pf-eori" className="field-input" value={companyForm.eori_number}
                onChange={e => updCompany("eori_number", e.target.value)}
                placeholder="DE123456789012345" autoComplete="off"
                aria-describedby="pf-eori-hint" />
              <span className="field-hint" id="pf-eori-hint">{EORI_HINT}</span>
              {/* Der Formatfehler kommt hier AUCH aus der Clientprüfung, nicht nur aus einer
                  Backendantwort: ein ungültiges Format sperrt den Speichern-Knopf, und ein
                  gesperrter Knopf ohne Begründung ist genau das Muster, das dieses Projekt
                  an anderer Stelle als Fehler festgehalten hat. Gezeigt wird er erst, wenn
                  tatsächlich etwas eingetippt wurde — ein leeres Feld ist gültig. Ein
                  Backendfehler am selben Feld hat Vorrang (er ist die Serverwahrheit). */}
              {fieldErr("eori_number")
                || (eoriFieldError(companyForm.eori_number)
                  ? <span className="profile-field-error" role="alert">{eoriFieldError(companyForm.eori_number)}</span>
                  : null)}
            </div>}
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
                  {launchCountries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
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
              // Im Launch-Modus gibt es kein Eingabefeld dafür (siehe oben) — eine Zeile
              // „Noch nicht hinterlegt" für etwas, das man nicht hinterlegen kann, wäre eine
              // Aufforderung ins Leere. Der gespeicherte Wert bleibt in der Datenbank.
              ...(CUSTOMS_UI_ENABLED
                ? [{ k: "EORI-Nummer", v: user?.eori_number || "Noch nicht hinterlegt", empty: !user?.eori_number }]
                : []),
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
            <CompanyLogoCard user={user} />
            {renderContactCard()}
          </div>
          <div className="profile-col">
            {renderAccountCard()}
            <DeliveryNoteCard user={user} />
            <BillingModeCard user={user} />
            {renderSecurityCard()}
          </div>
        </div>
    </div>
  );
}
