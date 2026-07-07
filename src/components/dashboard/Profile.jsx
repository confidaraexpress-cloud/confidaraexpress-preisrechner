import React, { useState } from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { PasswordField } from "../ui/PasswordField";
import { apiFetch, authH, triggerAuthError } from "../../api/client";
import { countries } from "../../utils/countries";
import { useAuth } from "../../context/AuthContext";
import { PremiumBackground } from "./PremiumBackground";

// Benötigt Backend: PATCH /kunde/profil
// Request-Body: { name, company_name, vat_id, street, zip, city, country }
// Response:     { user: { ...aktualisiertes User-Objekt } }

// Benötigt Backend: PATCH /kunde/password
// Request-Body: { currentPassword, newPassword, newPasswordConfirm }
// Response:     { message } bei Erfolg, { error } bei Fehler

const EMPTY_PW_FORM = { currentPassword: "", newPassword: "", newPasswordConfirm: "" };

export function Profile({ user }) {
  const { updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [form, setForm] = useState({});

  const [pwForm, setPwForm] = useState(EMPTY_PW_FORM);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const startEdit = () => {
    setForm({
      name: user?.name || "",
      company_name: user?.company_name || "",
      vat_id: user?.vat_id || "",
      street: user?.street || "",
      zip: user?.zip || "",
      city: user?.city || "",
      country: user?.country || "DE",
    });
    setSaveError("");
    setSaveSuccess(false);
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setSaveError(""); };
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

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

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const r = await apiFetch(`/kunde/profil`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Speichern fehlgeschlagen");
      if (d.user) updateUser(d.user);
      setSaveSuccess(true);
      setEditing(false);
    } catch (e) {
      setSaveError(e.message);
    }
    setSaving(false);
  };

  const countryName = countries.find(c => c.code === user?.country)?.name;
  const paymentTermLabel = user?.payment_term ? `${user.payment_term} Tage` : "Nicht hinterlegt";
  const address = user?.street ? `${user.street}, ${user.zip} ${user.city}` : null;

  // Read-View-Karten. `empty` markiert Platzhalter, damit Leerwerte optisch
  // schwächer dargestellt werden als echte Daten. Alle Werte stammen direkt
  // aus dem User-Objekt — keine erfundenen Frontend-Felder.
  const cards = [
    {
      icon: "building",
      title: "Unternehmensdaten",
      subtitle: "Stammdaten Ihres Unternehmens",
      items: [
        { k: "Firmenname", v: user?.company_name || "Nicht angegeben", empty: !user?.company_name },
        { k: "USt-ID", v: user?.vat_id || "Noch nicht hinterlegt", empty: !user?.vat_id },
        { k: "Adresse", v: address || "Keine Adresse hinterlegt", empty: !address },
        { k: "Land", v: countryName || "Nicht angegeben", empty: !countryName },
      ],
    },
    {
      icon: "card",
      title: "Konto & Zahlungsbedingungen",
      subtitle: "Informationen zu Ihrem Geschäftskonto",
      items: [
        { k: "Status", v: <StatusBadge status={user?.status} /> },
        { k: "Zahlungsart", v: "Rechnungskauf" },
        { k: "Zahlungsziel", v: paymentTermLabel, empty: !user?.payment_term },
      ],
      hint: { icon: "info", lines: ["Zahlungsbedingungen werden durch ConfidaraExpress verwaltet."] },
    },
    {
      icon: "user",
      title: "Ansprechpartner",
      subtitle: "Ihre hinterlegte Kontaktperson",
      items: [
        { k: "Name", v: user?.name || "Nicht angegeben", empty: !user?.name },
        { k: "E-Mail", v: user?.email || "Nicht angegeben", empty: !user?.email },
        { k: "Telefon", v: user?.phone || "Noch nicht hinterlegt", empty: !user?.phone },
      ],
    },
    {
      icon: "shield",
      title: "Sicherheit",
      subtitle: "Schützen Sie Ihr Konto",
      items: [
        { k: "Login-E-Mail", v: user?.email || "Nicht angegeben", empty: !user?.email },
      ],
      hint: {
        icon: "lock",
        lines: [
          "Sensible Kontodaten werden geschützt verwaltet.",
          "Änderungen werden aus Sicherheitsgründen geprüft.",
        ],
      },
    },
  ];

  const renderCard = (section, key) => (
    <div key={key} className="table-card profile-card">
      <div className="table-card-header profile-card-head">
        <div className="profile-card-icon"><Icon n={section.icon} s={21} /></div>
        <div className="profile-card-heading">
          <span className="table-card-title">{section.title}</span>
          {section.subtitle && <span className="profile-card-sub">{section.subtitle}</span>}
        </div>
      </div>
      <div className="profile-section-body">
        {section.items.map((it, i) => (
          <div key={i} className={`profile-row${i < section.items.length - 1 ? " profile-row-border" : ""}`}>
            <span className="profile-row-key">{it.k}</span>
            <span className={`profile-row-val${it.empty ? " profile-row-empty" : ""}`}>{it.v}</span>
          </div>
        ))}
        {section.hint && (
          <div className="profile-hint">
            <Icon n={section.hint.icon} s={15} />
            <div className="profile-hint-text">
              {section.hint.lines.map((line, i) => <p key={i}>{line}</p>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderSecurityCard = () => {
    const section = cards[3];
    return (
      <div key="security" className="table-card profile-card">
        <div className="table-card-header profile-card-head">
          <div className="profile-card-icon"><Icon n={section.icon} s={21} /></div>
          <div className="profile-card-heading">
            <span className="table-card-title">{section.title}</span>
            {section.subtitle && <span className="profile-card-sub">{section.subtitle}</span>}
          </div>
        </div>
        <div className="profile-section-body">
          {section.items.map((it, i) => (
            <div key={i} className={`profile-row${i < section.items.length - 1 ? " profile-row-border" : ""}`}>
              <span className="profile-row-key">{it.k}</span>
              <span className={`profile-row-val${it.empty ? " profile-row-empty" : ""}`}>{it.v}</span>
            </div>
          ))}
          {section.hint && (
            <div className="profile-hint">
              <Icon n={section.hint.icon} s={15} />
              <div className="profile-hint-text">
                {section.hint.lines.map((line, i) => <p key={i}>{line}</p>)}
              </div>
            </div>
          )}
        </div>

        <div className="profile-form-body profile-password-section">
          <span className="profile-password-title">Passwort ändern</span>
          <p className="profile-password-desc">Ändern Sie Ihr Passwort regelmäßig, um Ihr Konto zu schützen.</p>

          {pwSuccess && (
            <div className="alert alert-success mb-16">
              <Icon n="shield" s={16} /> Passwort erfolgreich geändert.
            </div>
          )}
          {pwError && (
            <div className="alert alert-error mb-16">
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
            <button className="btn btn-outline" onClick={resetPwForm} disabled={pwSaving}>Zurücksetzen</button>
            <button className="btn btn-primary" onClick={handlePasswordChange} disabled={pwSaving}>
              {pwSaving ? <><span className="spinner" /> Wird geändert…</> : <><Icon n="lock" s={14} /> Passwort ändern</>}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <PremiumBackground variant="profile" />
      <div className="page-body">
      <div className="profile-page-head">
        <div className="profile-page-head-text">
          <h1 className="dash-section-title">Mein Profil</h1>
          <p className="dash-section-sub">Verwalten Sie Ihre Unternehmens- und Kontodaten sicher an einem Ort.</p>
        </div>
        {!editing && (
          <button className="btn btn-primary profile-edit-btn" onClick={startEdit}>
            <Icon n="settings" s={15} /> Profil bearbeiten
          </button>
        )}
      </div>

      <div className="profile-account-header">
        <div className="profile-account-identity">
          <div className="profile-avatar-lg">CE</div>
          <div className="profile-account-info">
            <div className="profile-account-name">{user?.company_name || user?.name || "Nicht angegeben"}</div>
            <div className="profile-account-email">
              <Icon n="mail" s={14} /> {user?.email || "Nicht angegeben"}
            </div>
            <div className="profile-meta-row">
              <StatusBadge status={user?.status} />
              <span className="profile-meta-chip"><Icon n="building" s={13} /> B2B-Konto</span>
              <span className="profile-meta-chip profile-meta-chip-accent"><Icon n="clock" s={13} /> Zahlungsziel: {paymentTermLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {saveSuccess && !editing && (
        <div className="alert alert-success mb-16">
          <Icon n="shield" s={16} /> Profil erfolgreich gespeichert.
        </div>
      )}

      {editing ? (
        <div className="profile-edit-stack">
          {saveError && (
            <div className="alert alert-error mb-16">
              <Icon n="x" s={16} />{saveError}
            </div>
          )}

          <div className="table-card">
            <div className="table-card-header profile-card-head">
              <div className="profile-card-icon"><Icon n="user" s={19} /></div>
              <div className="profile-card-heading">
                <span className="table-card-title">Kontakt</span>
                <span className="profile-card-sub">Ihre hinterlegte Kontaktperson</span>
              </div>
            </div>
            <div className="profile-form-body">
              <div className="field">
                <label className="field-label">Name</label>
                <input className="field-input" value={form.name} onChange={e => upd("name", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="table-card">
            <div className="table-card-header profile-card-head">
              <div className="profile-card-icon"><Icon n="building" s={19} /></div>
              <div className="profile-card-heading">
                <span className="table-card-title">Firma</span>
                <span className="profile-card-sub">Stammdaten Ihres Unternehmens</span>
              </div>
            </div>
            <div className="profile-form-body">
              <div className="field">
                <label className="field-label">Firmenname</label>
                <input className="field-input" value={form.company_name} onChange={e => upd("company_name", e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">USt-ID</label>
                <input className="field-input" value={form.vat_id} onChange={e => upd("vat_id", e.target.value)} placeholder="DE123456789" />
              </div>
              <div className="field">
                <label className="field-label">Straße & Hausnummer</label>
                <input className="field-input" value={form.street} onChange={e => upd("street", e.target.value)} />
              </div>
              <div className="field-row field-row-3">
                <div className="field">
                  <label className="field-label">PLZ</label>
                  <input className="field-input" value={form.zip} onChange={e => upd("zip", e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Stadt</label>
                  <input className="field-input" value={form.city} onChange={e => upd("city", e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Land</label>
                  <select className="field-input field-select" value={form.country} onChange={e => upd("country", e.target.value)}>
                    {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="profile-form-actions">
            <button className="btn btn-outline" onClick={cancelEdit} disabled={saving}>Abbrechen</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner" /> Speichern…</> : <><Icon n="shield" s={14} /> Speichern</>}
            </button>
          </div>
        </div>
      ) : (
        <div className="profile-grid">
          <div className="profile-col">
            {renderCard(cards[0], "company")}
            {renderCard(cards[2], "contact")}
          </div>
          <div className="profile-col">
            {renderCard(cards[1], "account")}
            {renderSecurityCard()}
          </div>
        </div>
      )}
      </div>
    </>
  );
}
