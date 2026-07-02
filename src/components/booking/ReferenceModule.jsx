import React from "react";

// Optionale Referenznummer / Bestellnummer / Kostenstelle — REINE DARSTELLUNG.
// Der Wert liegt im Orchestrator (BookingPage.form.reference); Sanitizing
// (< und > entfernen, max. 35 Zeichen) erfolgt im onChange des Orchestrators.
// maxLength={35} ist eine zusätzliche harte Grenze. Keine eigene Businesslogik.
export function ReferenceModule({ value, onChange }) {
  return (
    <div className="calc-panel mb-16">
      <div className="calc-panel-body">
        <div className="field booking-content-field">
          <label className="field-label" htmlFor="booking-reference">
            Referenznummer / Bestellnummer <span className="field-optional">(optional)</span>
          </label>
          <input
            id="booking-reference"
            className="field-input"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="z. B. Bestellnummer, Kostenstelle …"
            maxLength={35}
          />
          <span className="field-hint">
            Optional – z. B. Bestellnummer, Kostenstelle oder interne Referenz. Max. 35 Zeichen.
          </span>
        </div>
      </div>
    </div>
  );
}
