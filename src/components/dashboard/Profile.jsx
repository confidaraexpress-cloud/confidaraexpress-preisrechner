import React, { useState } from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { apiFetch } from "../../api/client";
import { countries } from "../../utils/countries";
import { useAuth } from "../../context/AuthContext";

// Benötigt Backend: PATCH /kunde/profil
// Request-Body: { name, company_name, vat_id, street, zip, city, country }
// Response:     { user: { ...aktualisiertes User-Objekt } }

export function Profile({ user }) {
  const { updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [form, setForm] = useState({});

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

  const initials = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();
  const countryName = countries.find(c => c.code === user?.country)?.name;
  const paymentTermLabel = user?.payment_term ? `${user.payment_term} Tage` : "Nicht hinterlegt";

  const companyCard = {
    title: "Unternehmensdaten",
    items: [
      ["Firmenname", user?.company_name || "Nicht angegeben"],
      ["USt-ID", user?.vat_id || "Noch nicht hinterlegt"],
      ["Adresse", user?.street ? `${user.street}, ${user.zip} ${user.city}` : "Keine Adresse hinterlegt"],
      ["Land", countryName || "Nicht angegeben"],
    ],
  };

  const contactCard = {
    title: "Ansprechpartner",
    items: [
      ["Name", user?.name || "Nicht angegeben"],
      ["E-Mail", user?.email || "Nicht angegeben"],
      ["Telefon", user?.phone || "Noch nicht hinterlegt"],
    ],
  };

  const accountCard = {
    title: "Konto & Zahlungsbedingungen",
    items: [
      ["Status", <StatusBadge key="status" status={user?.status} />],
      ["Zahlungsart", "Rechnungskauf"],
      ["Zahlungsziel", paymentTermLabel],
    ],
    hint: "Zahlungsbedingungen werden durch ConfidaraExpress verwaltet.",
  };

  const securityCard = {
    title: "Sicherheit",
    items: [
      ["Login-E-Mail", user?.email || "Nicht angegeben"],
    ],
    hint: "Sensible Kontodaten werden geschützt verwaltet.",
  };

  const renderCard = (section, key) => (
    <div key={key} className="table-card">
      <div className="table-card-header">
        <span className="table-card-title">{section.title}</span>
      </div>
      <div className="profile-section-body">
        {section.items.map(([k, v], i) => (
          <div key={i} className={`profile-row${i < section.items.length - 1 ? " profile-row-border" : ""}`}>
            <span className="text-sm text-muted">{k}</span>
            <span className="text-sm font-bold profile-row-val">{v}</span>
          </div>
        ))}
        {section.hint && <p className="profile-hint">{section.hint}</p>}
      </div>
    </div>
  );

  return (
    <>
      <div className="page-body">
        <div className="profile-account-header">
          <div className="profile-account-identity">
            <div className="profile-avatar-lg">{initials}</div>
            <div className="profile-account-info">
              <div className="profile-account-name">{user?.company_name || user?.name || "Nicht angegeben"}</div>
              <div className="profile-account-email">
                <Icon n="mail" s={13} /> {user?.email || "Nicht angegeben"}
              </div>
              <div className="profile-meta-row">
                <StatusBadge status={user?.status} />
                <span className="profile-meta-chip">B2B-Konto</span>
                <span className="profile-meta-chip profile-meta-chip-accent">Zahlungsziel: {paymentTermLabel}</span>
              </div>
            </div>
          </div>
          {!editing && (
            <div className="profile-account-actions">
              <button className="btn btn-primary profile-edit-btn" onClick={startEdit}>
                <Icon n="settings" s={14} /> Profil bearbeiten
              </button>
            </div>
          )}
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
              <div className="table-card-header">
                <span className="table-card-title">Kontakt</span>
              </div>
              <div className="profile-form-body">
                <div className="field">
                  <label className="field-label">Name</label>
                  <input className="field-input" value={form.name} onChange={e => upd("name", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="table-card">
              <div className="table-card-header">
                <span className="table-card-title">Firma</span>
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
              {renderCard(companyCard, "company")}
              {renderCard(contactCard, "contact")}
            </div>
            <div className="profile-col">
              {renderCard(accountCard, "account")}
              {renderCard(securityCard, "security")}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
