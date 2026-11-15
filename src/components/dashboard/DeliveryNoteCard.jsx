import React, { useState, useEffect } from "react";
import { FormAlert } from "../ui/FormAlert";
import { apiFetch } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { normalizeThrownError } from "../../utils/apiError.mjs";
import {
  DELIVERY_NOTE_MODES, DELIVERY_NOTE_TEXT, deliveryNoteMode, buildDeliveryNotePatch,
} from "../../utils/profileView.mjs";
import { SettingsSection } from "./ProfileCardHead";
import { AuswahlMenue } from "../ui/AuswahlMenue";

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

  // Kompaktes Auswahlmenü (Premium Control System 2.0, 2026-11-14) — dasselbe Bauteil wie Abrechnung, Absicherung
  // und Lieferadresse. Jede Option nennt ihre Erklärung in der Liste; die gewählte steht im Feld und darunter.
  // Während des Speicherns sind nur die übrigen Optionen gesperrt, nie das Feld selbst: es behält den
  // Tastaturfokus. Ein gesperrtes Feld nähme ihn ihm, der Browser setzte ihn auf die Seite zurück
  // (tests/e2e/billingMode.test.mjs, B12).
  const optionen = DELIVERY_NOTE_MODES.map((mode) => ({
    value: mode,
    id: `dn-mode-${mode}`,
    label: DELIVERY_NOTE_TEXT.options[mode].label,
    description: DELIVERY_NOTE_TEXT.options[mode].hint,
    disabled: dnSaving && dnMode !== mode,
  }));
  const gewaehlteErklaerung = DELIVERY_NOTE_TEXT.options[dnMode]?.hint;
  return (
    <SettingsSection title={DELIVERY_NOTE_TEXT.title} subtitle={DELIVERY_NOTE_TEXT.subtitle}>
      <div className="profile-section-body">
        <div className="dn-mode-feld">
          <span className="field-label" id="dn-mode-label">{DELIVERY_NOTE_TEXT.fieldLabel}</span>
          <AuswahlMenue
            name="deliveryNoteMode"
            id="dn-mode"
            labelId="dn-mode-label"
            value={dnMode}
            options={optionen}
            onChange={saveDeliveryNoteMode}
            busy={dnSaving}
            describedBy={gewaehlteErklaerung ? "dn-mode-erklaerung" : undefined}
          />
          {gewaehlteErklaerung && <p className="field-hint dn-mode-erklaerung" id="dn-mode-erklaerung">{gewaehlteErklaerung}</p>}
        </div>
        {dnError && <FormAlert tone="error" message={dnError} className="mt-16" />}
        {dnSaved && !dnError && (
          <p className="profile-saved" role="status">
            Einstellung gespeichert
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
