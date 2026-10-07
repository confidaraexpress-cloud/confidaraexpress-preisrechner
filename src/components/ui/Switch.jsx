import React from "react";

/* Schalter — das EINE Ein/Aus-Primitiv der Oberfläche.
   =============================================================================
   Bewusst ein echtes <input type="checkbox"> mit role="switch" statt eines
   nachgebauten <div role="switch">: Tastaturbedienung (Space), der Klick auf
   das Label und die Zuordnung checked → aria-checked kommen damit vom Browser
   und nicht aus handgeschriebenem ARIA, das bei jeder Änderung mitgepflegt
   werden müsste.

   Der Zustand ist nie nur farblich codiert: der Knopf wandert sichtbar von
   links nach rechts, und Screenreader lesen über role="switch" „ein"/„aus".

   Aufklappende Inhalte gehören NICHT in dieses Label — sonst schaltete ein
   Klick ins Detailfeld den Schalter wieder um. Sie stehen als Geschwister
   direkt danach.

   `disabled` ist additiv (z. B. solange ein Abrechnungslauf läuft): die
   native Sperre der Eingabe — ohne sie ist der Schalter unverändert. */
export function Switch({ checked, onChange, label, hint, id, disabled = false }) {
  return (
    <label className="ce-switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="ce-switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ce-switch-track" aria-hidden="true">
        <span className="ce-switch-knob" />
      </span>
      <span className="ce-switch-text">
        <span className="ce-switch-label">{label}</span>
        {hint ? <span className="ce-switch-hint">{hint}</span> : null}
      </span>
    </label>
  );
}
