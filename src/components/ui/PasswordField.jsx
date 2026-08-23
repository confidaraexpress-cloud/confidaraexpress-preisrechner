import React, { useState } from "react";
import { Icon } from "./Icon";

// `required` ist optional und wird nur im slim-Modus an das Eingabefeld durchgereicht
// (Registrierungsformular). Ohne die Prop verhält sich die Komponente unverändert.
//
// `inputRef` (Paket D) reicht eine Ref an das Eingabefeld durch — der
// Sicherheitsbereich des Profils setzt damit den Fokus in das erste Feld,
// sobald der Nutzer das Formular öffnet. Ohne die Prop ändert sich nichts.
export function PasswordField({ label, value, onChange, onKeyDown, onBlur, placeholder, dark = true, slim = false, id, autoComplete, required = false, inputRef }) {
  const [show, setShow] = useState(false);
  const toggleLabel = show ? "Passwort verbergen" : "Passwort anzeigen";

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
          onBlur={onBlur}
          placeholder={placeholder || "••••••••"}
          autoComplete={autoComplete}
          required={required || undefined}
          aria-required={required ? "true" : undefined}
        />
        <button
          type="button"
          className="auth-eye-btn"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
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
      {label && <label className={labelCls} htmlFor={id}>{label}</label>}
      <div className="field-input-wrap">
        <input
          id={id}
          ref={inputRef}
          type={show ? "text" : "password"}
          className={inputCls}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          placeholder={placeholder || "••••••••"}
          /* autoComplete wurde bisher nur im slim-Modus durchgereicht — im
             Standardmodus ging die Angabe der Aufrufer verloren, sodass
             Passwortmanager „aktuelles" und „neues" Passwort nicht
             unterscheiden konnten. */
          autoComplete={autoComplete}
          required={required || undefined}
          aria-required={required ? "true" : undefined}
        />
        <button
          type="button"
          className="field-eye-btn"
          onClick={() => setShow((s) => !s)}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          <Icon
            n={show ? "eyeOff" : "eye"}
            s={16}
            /* --gray400 misst auf Weiß 2,4:1 und trägt seit Paket A keine
               Textrolle mehr; das Auge ist hier der einzige Inhalt des
               Knopfes und braucht einen lesbaren Ton. */
            c={dark ? "rgba(255,255,255,0.4)" : "var(--ce-color-text-muted)"}
          />
        </button>
      </div>
    </div>
  );
}
