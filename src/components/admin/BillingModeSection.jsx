import React from "react";
import { Icon } from "../ui/Icon";
import { BILLING_MODES, BILLING_MODE_TEXT } from "../../utils/billingModeView.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Sektion „Abrechnung" in der Admin-Kundendetailansicht.
//
// Zeigt die Abrechnungsart des Kontos und erlaubt, sie umzustellen — für Support
// und Onboarding: ein Kunde, der auf Sammelrechnung wechseln möchte, soll nicht
// auf ein Selfservice-Feature warten müssen. Rein darstellend; der Request liegt
// in der Seite (ein Request-Pfad, ein Zustand) — dieselbe Aufteilung wie bei
// `CustomerMarkupSection`.
//
// Bewusst OHNE Bestätigungsdialog: eine
// Abrechnungsart ist keine Berechtigung, sie ist umkehrbar, und sie wirkt
// ausschließlich für KÜNFTIGE Buchungen. Bereits gebuchte Sendungen tragen ihre
// Abrechnungsart eingefroren und werden nicht umsortiert; ausgestellte Rechnungen
// bleiben unberührt. Ein Dialog wäre hier Zeremonie ohne Gegenwert.
//
// Ein einfaches `<select>` statt Radios: im Admin zählt Dichte, und die beiden
// Optionen brauchen keine dauerhaft sichtbaren Erklärtexte nebeneinander — die
// Erläuterung des GEWÄHLTEN Modus steht darunter.
// ─────────────────────────────────────────────────────────────────────────────

export const BILLING_MODE_SELECT_ID = "adm-billing-mode-select";
export const BILLING_MODE_SECTION_ID = "adm-billing-mode-section";

export function BillingModeSection({
  mode,                  // aktueller Modus aus der Kundenantwort (bereits normalisiert)
  busy = false,
  error = "",
  successText = "",
  onChange,              // (nextMode: string) => void
}) {
  const current = BILLING_MODES.includes(mode) ? mode : "single";
  const opt = BILLING_MODE_TEXT.options[current];

  return (
    <div className="adm-card" id={BILLING_MODE_SECTION_ID}>
      {/* Der Zustand steht doppelt codiert da: als Text im Kartenkopf und als
          Auswahlstellung — nie allein farblich. */}
      <div className="adm-card-head">
        <Icon n="invoice" s={17} /> Abrechnung
        <span className="badge badge--neutral" style={{ marginInlineStart: "auto" }}>
          <span className="badge-dot" />{opt.label}
        </span>
      </div>
      <div className="adm-card-body">
        <label className="field-label" htmlFor={BILLING_MODE_SELECT_ID}>
          {BILLING_MODE_TEXT.fieldLabel}
        </label>
        <select
          id={BILLING_MODE_SELECT_ID}
          className="field-select"
          value={current}
          disabled={busy}
          onChange={(e) => onChange && onChange(e.target.value)}
        >
          {BILLING_MODES.map((m) => (
            <option key={m} value={m}>{BILLING_MODE_TEXT.options[m].label}</option>
          ))}
        </select>
        <p className="field-hint mt-8">{opt.hint}</p>
        {/* Sagt ausdrücklich, was die Umstellung NICHT tut — sonst nimmt ein Admin an,
            offene Sendungen würden mit umgestellt. */}
        <div className="adm-note mt-8">
          <Icon n="info" s={16} />
          <span>{BILLING_MODE_TEXT.changeNote}</span>
        </div>
        {error && (
          <div className="adm-note adm-note--error mt-8" role="alert">
            <Icon n="alert" s={16} /><span>{error}</span>
          </div>
        )}
        {successText && !error && (
          <p className="profile-saved mt-8" role="status">
            <Icon n="check" s={14} /> {successText}
          </p>
        )}
      </div>
    </div>
  );
}
