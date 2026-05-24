import React, { useState } from "react";
import { Icon } from "./Icon";

export function PasswordField({ label, value, onChange, onKeyDown, placeholder, dark = true }) {
  const [show, setShow] = useState(false);
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
