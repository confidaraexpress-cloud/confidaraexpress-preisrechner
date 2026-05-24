import React from "react";
import { PasswordField } from "../ui/PasswordField";
import { countries } from "../../utils/countries";

export function RegisterForm({ form, onChange, onRegister, loading }) {
  const upd = (k, v) => onChange(k, v);
  return (
    <>
      <div className="field-row field-row-2">
        <div className="field">
          <label className="auth-label">Name</label>
          <input className="auth-input" value={form.name} onChange={(e) => upd("name", e.target.value)} />
        </div>
        <div className="field">
          <label className="auth-label">E-Mail</label>
          <input className="auth-input" type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} />
        </div>
      </div>
      <PasswordField
        label="Passwort (min. 8 Zeichen)"
        value={form.password}
        onChange={(e) => upd("password", e.target.value)}
        dark={false}
      />
      <div className="field-row field-row-2">
        <div className="field">
          <label className="auth-label">Firmenname</label>
          <input className="auth-input" value={form.company_name} onChange={(e) => upd("company_name", e.target.value)} />
        </div>
        <div className="field">
          <label className="auth-label">USt-ID</label>
          <input className="auth-input" value={form.vat_id} onChange={(e) => upd("vat_id", e.target.value)} placeholder="DE123456789" />
        </div>
      </div>
      <div className="field">
        <label className="auth-label">Straße &amp; Hausnummer</label>
        <input className="auth-input" value={form.street} onChange={(e) => upd("street", e.target.value)} />
      </div>
      <div className="field-row field-row-3">
        <div className="field">
          <label className="auth-label">PLZ</label>
          <input className="auth-input" value={form.zip} onChange={(e) => upd("zip", e.target.value)} />
        </div>
        <div className="field">
          <label className="auth-label">Stadt</label>
          <input className="auth-input" value={form.city} onChange={(e) => upd("city", e.target.value)} />
        </div>
        <div className="field">
          <label className="auth-label">Land</label>
          <select
            className="auth-input auth-select"
            value={form.country}
            onChange={(e) => upd("country", e.target.value)}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <button className="auth-btn-primary" onClick={onRegister} disabled={loading}>
        {loading ? <span className="spinner" /> : "Konto beantragen →"}
      </button>
    </>
  );
}
