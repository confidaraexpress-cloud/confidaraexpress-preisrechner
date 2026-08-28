import React, { useState, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { FormAlert } from "../ui/FormAlert";
import { apiFetch } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { normalizeThrownError } from "../../utils/apiError.mjs";
import {
  DELIVERY_NOTE_MODES, DELIVERY_NOTE_TEXT, deliveryNoteMode, buildDeliveryNotePatch,
} from "../../utils/profileView.mjs";
import { cardHead } from "./ProfileCardHead";

// Lieferscheineinstellung der Kontoseite. Eigener Speicherzustand statt der
// Ein-Karten-Editregel von Profile.jsx: eine Auswahl aus drei Optionen hat
// keinen Bearbeiten-Modus — sie wird umgestellt und gespeichert. Gespeichert
// wird über denselben PATCH /kunde/profil wie alle anderen Profilfelder, es
// gibt keine zweite Speicherstrecke.
export function DeliveryNoteCard({ user }) {
  const { updateUser } = useAuth();

  const [dnMode, setDnMode] = useState(() => deliveryNoteMode(user));
  const [dnSaving, setDnSaving] = useState(false);
  const [dnError, setDnError] = useState("");
  const [dnSaved, setDnSaved] = useState(false);
  // Serverwahrheit gewinnt: nach einem erfolgreichen Speichern (updateUser) und nach
  // jedem Neuladen folgt die Auswahl dem Konto, nicht dem lokalen Zwischenstand.
  const serverDnMode = deliveryNoteMode(user);
  useEffect(() => { setDnMode(serverDnMode); }, [serverDnMode]);

  // Speichert die Lieferscheineinstellung über denselben Profil-PATCH wie alle anderen
  // Felder. Der Wert wird optimistisch angezeigt (die Auswahl fühlt sich sofort an) und
  // bei einem Fehler auf die Serverwahrheit zurückgesetzt — es bleibt nie eine Auswahl
  // stehen, die nicht gespeichert wurde.
  const saveDeliveryNoteMode = async (mode) => {
    if (dnSaving || mode === serverDnMode) return;
    setDnMode(mode);
    setDnSaving(true); setDnError(""); setDnSaved(false);
    try {
      const r = await apiFetch(`/kunde/profil`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(buildDeliveryNotePatch(mode)),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setDnMode(serverDnMode);
        setDnError(d?.error || "Die Einstellung konnte nicht gespeichert werden.");
        setDnSaving(false);
        return;
      }
      if (d.user) updateUser(d.user);
      setDnSaved(true);
    } catch (e) {
      setDnMode(serverDnMode);
      setDnError(normalizeThrownError(e).message);
    }
    setDnSaving(false);
  };

  // Native Radios auf dem globalen forms.css-Primitive — dasselbe Muster wie die
  // Zollrechnungsauswahl der Buchung. Kein zweites Auswahlbauteil.
  return (
    <div className="table-card profile-card">
      {cardHead("form", DELIVERY_NOTE_TEXT.title, DELIVERY_NOTE_TEXT.subtitle, null)}
      <div className="profile-section-body">
        <fieldset className="dn-mode-fieldset" disabled={dnSaving}>
          <legend className="field-label">{DELIVERY_NOTE_TEXT.fieldLabel}</legend>
          {DELIVERY_NOTE_MODES.map((mode) => {
            const opt = DELIVERY_NOTE_TEXT.options[mode];
            const id = `dn-mode-${mode}`;
            return (
              <label key={mode} className={`dn-mode-option${dnMode === mode ? " selected" : ""}`} htmlFor={id}>
                <input
                  id={id}
                  type="radio"
                  name="deliveryNoteMode"
                  value={mode}
                  checked={dnMode === mode}
                  onChange={() => saveDeliveryNoteMode(mode)}
                />
                <span className="dn-mode-text">
                  <span className="dn-mode-label">{opt.label}</span>
                  <span className="field-hint">{opt.hint}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {dnError && <FormAlert tone="error" message={dnError} className="mt-16" />}
        {dnSaved && !dnError && (
          <p className="profile-saved" role="status">
            <Icon n="check" s={14} /> Einstellung gespeichert
          </p>
        )}
      </div>
    </div>
  );
}
