import React from "react";
import { Icon } from "../ui/Icon";
import { PasswordField } from "../ui/PasswordField";
import { countries } from "../../utils/countries";

export function RegisterForm({ form, onChange, onRegister, loading }) {
  const upd = (k, v) => onChange(k, v);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onRegister(); }}>
      <div className="field-row field-row-2">
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label">Name</label>
          </div>
          <div className="auth-input-wrap">
            <span className="auth-input-ico"><Icon n="user" s={18} /></span>
            <input
              className="auth-input"
              value={form.name}
              onChange={(e) => upd("name", e.target.value)}
              placeholder="Max Mustermann"
              autoFocus
            />
          </div>
        </div>
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label">E-Mail</label>
          </div>
          <div className="auth-input-wrap">
            <span className="auth-input-ico"><Icon n="mail" s={18} /></span>
            <input
              className="auth-input"
              type="email"
              value={form.email}
              onChange={(e) => upd("email", e.target.value)}
              placeholder="firma@beispiel.de"
            />
          </div>
        </div>
      </div>

      <div className="auth-field">
        <div className="auth-field-row">
          <label className="auth-field-label">Passwort (min. 8 Zeichen)</label>
        </div>
        <div className="auth-input-wrap">
          <span className="auth-input-ico"><Icon n="lock" s={18} /></span>
          <PasswordField
            slim
            value={form.password}
            onChange={(e) => upd("password", e.target.value)}
            placeholder="Mind. 8 Zeichen"
          />
        </div>
      </div>

      <span className="auth-section-label">Unternehmen</span>

      <div className="field-row field-row-2">
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label">Firmenname</label>
          </div>
          <div className="auth-input-wrap" style={{ paddingLeft: 0 }}>
            <input
              className="auth-input"
              style={{ paddingLeft: "14px" }}
              value={form.company_name}
              onChange={(e) => upd("company_name", e.target.value)}
            />
          </div>
        </div>
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label">USt-ID</label>
          </div>
          <div className="auth-input-wrap" style={{ paddingLeft: 0 }}>
            <input
              className="auth-input"
              style={{ paddingLeft: "14px" }}
              value={form.vat_id}
              onChange={(e) => upd("vat_id", e.target.value)}
              placeholder="DE123456789"
            />
          </div>
        </div>
      </div>

      <span className="auth-section-label">Adresse</span>

      <div className="auth-field">
        <div className="auth-field-row">
          <label className="auth-field-label">Straße &amp; Hausnummer</label>
        </div>
        <div className="auth-input-wrap" style={{ paddingLeft: 0 }}>
          <input
            className="auth-input"
            style={{ paddingLeft: "14px" }}
            value={form.street}
            onChange={(e) => upd("street", e.target.value)}
          />
        </div>
      </div>

      <div className="field-row field-row-3">
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label">PLZ</label>
          </div>
          <div className="auth-input-wrap" style={{ paddingLeft: 0 }}>
            <input
              className="auth-input"
              style={{ paddingLeft: "14px" }}
              value={form.zip}
              onChange={(e) => upd("zip", e.target.value)}
            />
          </div>
        </div>
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label">Stadt</label>
          </div>
          <div className="auth-input-wrap" style={{ paddingLeft: 0 }}>
            <input
              className="auth-input"
              style={{ paddingLeft: "14px" }}
              value={form.city}
              onChange={(e) => upd("city", e.target.value)}
            />
          </div>
        </div>
        <div className="auth-field">
          <div className="auth-field-row">
            <label className="auth-field-label">Land</label>
          </div>
          <div className="auth-input-wrap" style={{ paddingLeft: 0 }}>
            <select
              className="auth-input auth-select"
              style={{ paddingLeft: "14px" }}
              value={form.country}
              onChange={(e) => upd("country", e.target.value)}
            >
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <button type="submit" className="auth-cta" disabled={loading}>
        <span>{loading ? "Wird erstellt…" : "Konto beantragen"}</span>
        <span className="auth-cta-arrow"><Icon n="arrowRight" s={18} /></span>
      </button>
    </form>
  );
}
