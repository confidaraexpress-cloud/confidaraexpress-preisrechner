import React, { useState } from "react";
import { Icon } from "./Icon";

// `required` ist optional und wird nur im slim-Modus an das Eingabefeld durchgereicht
// (Registrierungsformular). Ohne die Prop verhält sich die Komponente unverändert.
export function PasswordField({ label, value, onChange, onKeyDown, placeholder, dark = true, slim = false, id, autoComplete, required = false }) {
  const [show, setShow] = useState(false);

  // slim-Modus: nur input + eye-button (kein Wrapper-div, keine Label).
  // Wird in auth-input-wrap eingebettet, wo das linke Icon bereits sitzt.
  if (slim) {
    return (
      <>
        <input
          id={id}
          type={show ? "text" : "password"}
          className="auth-input"
          style={{ paddingRight: "44px" }}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder || "••••••••"}
          autoComplete={autoComplete}
          required={required || undefined}
          aria-required={required ? "true" : undefined}
        />
        <button type="button" className="auth-eye-btn" onClick={() => setShow((s) => !s)} tabIndex={-1}>
          <Icon n={show ? "eyeOff" : "eye"} s={16} c="var(--auth-ink-3)" />
        </button>
      </>
    );
  }

  // Standard-Modus: vollständiger Wrapper mit optionalem Label (Dashboard/Booking)
  const inputCls = dark ? "field-input-dark" : "field-input";
  const labelCls = dark ? "field-label-dark" : "field-label";
  return (
    <div className="field">
      {label && <label className={labelCls}>{label}</label>}
      <div className="field-input-wrap">
        <input
          type={show ? "text" : "password"}
          className={inputCls}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder || "••••••••"}
        />
        <button type="button" className="field-eye-btn" onClick={() => setShow((s) => !s)}>
          <Icon
            n={show ? "eyeOff" : "eye"}
            s={16}
            c={dark ? "rgba(255,255,255,0.4)" : "var(--gray400)"}
          />
        </button>
      </div>
    </div>
  );
}
