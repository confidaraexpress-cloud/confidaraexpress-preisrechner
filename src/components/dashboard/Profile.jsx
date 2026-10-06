import React, { useState, useRef, useEffect } from "react";
import { PageHeader } from "../ui/PageHeader";
import { StatusBadge } from "../ui/StatusBadge";
import { apiFetch } from "../../api/client";
import { normalizeThrownError } from "../../utils/apiError.mjs";
import { countries } from "../../utils/countries";
import { useLaunchScope } from "../../hooks/useLaunchScope";
import { CUSTOMS_UI_ENABLED } from "../../config/launchMode.mjs";
import { useAuth } from "../../context/AuthContext";
import { EmailChangeSection } from "./EmailChangeSection";
// Die Passwortänderung ist eine eigene Abschnittskomponente (wortgleich ausgelagert),
// damit das Partnerportal sie ebenfalls nutzen kann.
import { PasswordChangeSection } from "./PasswordChangeSection";
// Die drei Einstellungskarten mit eigener Speicherstrecke (Lieferschein,
// Abrechnungsart, Firmenlogo) sind eigenständige Abschnittskomponenten nach dem
// Vorbild der EmailChangeSection — jede trägt ihren Zustand selbst.
import { DeliveryNoteCard } from "./DeliveryNoteCard";
import { BillingModeCard } from "./BillingModeCard";
import { CompanyLogoCard } from "./CompanyLogoCard";
import { AppInstallCard } from "./AppInstallCard";
import { SettingsSection } from "./ProfileCardHead";
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
import { CopyableNumber } from "../ui/CopyableNumber";

// Benötigt Backend: PATCH /kunde/profil — bereichsweise Teilupdates:
//   Unternehmensdaten → { company_name, vat_id, eori_number, street, zip, city, country }
//   Ansprechpartner   → { name }
// Response: { user: { ...aktualisiertes User-Objekt } }
//
// Die Passwortänderung (PATCH /kunde/password) steht in PasswordChangeSection.jsx.
//
// „Telefon" wird bewusst NICHT geführt: das Nutzer-Datenmodell hat keine
// phone-Spalte (weder in users, noch in der Profil-Whitelist, noch in
// /kundenbereich). Es wird kein nicht speicherbarer Wert vorgetäuscht.

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

  // Lieferschein, Abrechnungsart und Firmenlogo sind eigenständige
  // Abschnittskomponenten (DeliveryNoteCard, BillingModeCard, CompanyLogoCard)
  // mit je eigenem Zustand und eigener Speicherstrecke — siehe Imports oben.

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

  // ── Render-Helfer ──────────────────────────────────────────────────────────
  // Der gemeinsame Abschnitt (SettingsSection) kommt aus ProfileCardHead.jsx —
  // dieselbe Fassung nutzen auch die drei ausgelagerten Einstellungsabschnitte.
  // „Bearbeiten" ist eine Textaktion oben rechts in der Inhaltsfläche; der
  // zugängliche Name nennt zusätzlich den Bereich und enthält das sichtbare Wort.
  const editButton = (card, ref, onClick, label) => (
    <button
      type="button"
      ref={ref}
      className="btn btn-ghost btn-sm profile-card-edit-action"
      onClick={onClick}
      disabled={isEditActionDisabled(editCard, card)}
      aria-label={label}
    >
      Bearbeiten
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
        {saving ? <><span className="spinner" /> Wird gespeichert…</> : "Speichern"}
      </button>
    </div>
  );

  const renderCompanyCard = () => {
    const editing = editCard === "company";
    return (
      <SettingsSection
        title={PROFILE_TEXT.companyTitle}
        subtitle={PROFILE_TEXT.companySubtitle}
        action={!editing && editButton("company", companyBtnRef, startCompanyEdit, "Unternehmensdaten bearbeiten")}
      >
        {editing ? (
          <div className="profile-form-body profile-inline-form">
            {cardError && (
              <div className="alert alert-error mb-16" role="alert">{cardError}</div>
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
      </SettingsSection>
    );
  };

  const renderContactCard = () => {
    const editing = editCard === "contact";
    return (
      <SettingsSection
        title={PROFILE_TEXT.contactTitle}
        subtitle={PROFILE_TEXT.contactSubtitle}
        action={!editing && editButton("contact", contactBtnRef, startContactEdit, "Ansprechpartner bearbeiten")}
      >
        {editing ? (
          <div className="profile-form-body profile-inline-form">
            {cardError && (
              <div className="alert alert-error mb-16" role="alert">{cardError}</div>
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
      </SettingsSection>
    );
  };

  // Der Kontostatus steht genau EINMAL — im Identitätskopf. Dieser Abschnitt
  // trägt die Zahlungsbedingungen (vorher doppelt: Status und Zahlungsziel
  // standen zusätzlich als Chips im Kopf).
  const renderAccountCard = () => (
    <SettingsSection title={PROFILE_TEXT.accountTitle} subtitle="Informationen zu Ihrem Geschäftskonto">
      <div className="profile-section-body">
        {renderRows([
          { k: PROFILE_TEXT.paymentMethodLabel, v: PROFILE_TEXT.paymentMethodValue },
          { k: PROFILE_TEXT.paymentTermLabel, v: paymentTerm, empty: !user?.payment_term },
        ])}
        <div className="profile-hint">
          <div className="profile-hint-text"><p>{PROFILE_TEXT.paymentHint}</p></div>
        </div>
      </div>
    </SettingsSection>
  );

  const renderSecurityCard = () => (
    <SettingsSection title="Sicherheit" subtitle="Schützen Sie Ihr Konto">
      <div className="profile-section-body">
        {renderRows([
          { k: "Login-E-Mail", v: user?.email || "Nicht angegeben", empty: !user?.email },
        ])}
        {/* Login-E-Mail ändern: direkt unter der aktuellen Login-E-Mail,
            getrennt von der Passwortänderung (eigener State/Fehler/Busy). */}
        <EmailChangeSection user={user} />
        <div className="profile-hint">
          <div className="profile-hint-text"><p>{PROFILE_TEXT.securityHint}</p></div>
        </div>
      </div>

      <PasswordChangeSection />
    </SettingsSection>
  );

  return (
    <div className="page-body">
        <PageHeader
          title={<>Kontoeinstellungen</>}
          subtitle="Verwalten Sie Ihre Unternehmens- und Kontodaten sicher an einem Ort."
          utility={utility}
          className="profile-page-head"
        />

        {/* Kompakter Identitätskopf: Firmenmarke (Initiale aus derselben Quelle
            wie Benutzerchip), Firmenname, Login-E-Mail, Kundennummer und der
            Kontostatus — genau EINMAL. Zahlungsziel und Zahlungsweise stehen im
            Abschnitt „Konto & Zahlungsbedingungen", nicht zusätzlich hier. */}
        <div className="ce-card profile-account-header">
          <div className="profile-account-identity">
            <div className="profile-avatar-lg" aria-hidden="true">{accountInitials(user)}</div>
            <div className="profile-account-info">
              <div className="profile-account-name">{accountDisplayName(user, "Nicht angegeben")}</div>
              <div className="profile-account-email">{user?.email || "Nicht angegeben"}</div>
              {/* Kundennummer (CE-K-…) — rein lesend, nicht editierbar und bewusst NICHT an
                  users.id gekoppelt. Bestandskonten ohne Nummer zeigen einen neutralen
                  Hinweis statt eines technischen Leerwerts. */}
              <div className="profile-account-customer-number">
                <span className="profile-account-number-label">{NUMBER_LABELS.customer}:</span>
                {customerNumber
                  ? <CopyableNumber value={customerNumber} label={NUMBER_LABELS.customer} />
                  : <span className="profile-account-number-empty">{NOT_ASSIGNED_TEXT}</span>}
              </div>
            </div>
          </div>
          <div className="profile-meta-row">
            <StatusBadge status={user?.status} />
          </div>
        </div>

        {savedCard && editCard === null && (
          <div className="alert alert-success mb-16" role="status">
            Profil erfolgreich gespeichert.
          </div>
        )}

        {/* Einspaltige Abschnitte in der Reihenfolge der Kontopflege:
            Unternehmensdaten → Ansprechpartner → Logo → Versanddokumente →
            Abrechnung → Sicherheit → App. Jeder Abschnitt: links Titel und
            Erklärung, rechts Daten bzw. Bedienelemente. */}
        <div className="profile-sections">
          {renderCompanyCard()}
          {renderContactCard()}
          {/* Das Logo gehört zu den Unternehmensdaten und steht deshalb
              direkt nach ihnen. */}
          <CompanyLogoCard user={user} />
          <DeliveryNoteCard user={user} />
          {renderAccountCard()}
          <BillingModeCard user={user} />
          {renderSecurityCard()}
          {/* „ConfidaraExpress als App" — der dauerhafte Ort für die
              Installation, direkt nach „Sicherheit" (dieses Gerät). */}
          <AppInstallCard />
        </div>
    </div>
  );
}
