import React from "react";
import { Link } from "react-router-dom";

// AGB-Bestätigung + separate Pflichtbestätigung zu ausgeschlossenen Gütern —
// REINE DARSTELLUNG; die Zustände (agbAccepted, prohibitedGoodsAccepted) bleiben
// im Orchestrator. Die AGB-Checkbox ist unverändert; die zweite Checkbox ist eine
// eigenständige, verpflichtende Bestätigung (kein Zusammenlegen). 7-Tage-Zahlungs-
// ziel-Wording unberührt. Reines Frontend-Gate — kein Payload/keine Persistenz.
export function TermsModule({ accepted, onChange, prohibitedAccepted, onProhibitedChange, prohibitedError }) {
  const hasErr = !!prohibitedError;
  return (
    <>
      <label className="booking-agb-label">
        <input type="checkbox" className="booking-agb-checkbox" checked={accepted} onChange={e => onChange(e.target.checked)} />
        <span className="booking-agb-text">
          Ich bestätige die oben genannten Sendungsdaten und stimme den{" "}
          <Link to="/agb" className="booking-agb-link">Allgemeinen Geschäftsbedingungen</Link>{" "}
          zu. Mir ist bewusst, dass diese Bestellung verbindlich ist und eine Zahlungsverpflichtung auslöst.
        </span>
      </label>

      <label className="booking-agb-label">
        <input
          type="checkbox"
          id="booking-prohibited-goods"
          className="booking-agb-checkbox"
          checked={!!prohibitedAccepted}
          onChange={e => onProhibitedChange(e.target.checked)}
          aria-invalid={hasErr ? "true" : undefined}
          aria-describedby={hasErr ? "booking-prohibited-error" : undefined}
        />
        <span className="booking-agb-text">
          Ich bestätige, dass die Sendung keine{" "}
          <Link to="/agb#paragraf-8" className="booking-agb-link" target="_blank" rel="noopener noreferrer">
            verbotenen oder vom Transport ausgeschlossenen Gegenstände
          </Link>{" "}
          enthält.
        </span>
      </label>
      {hasErr && (
        <span id="booking-prohibited-error" className="field-error booking-prohibited-error" role="alert">
          {prohibitedError}
        </span>
      )}
    </>
  );
}
