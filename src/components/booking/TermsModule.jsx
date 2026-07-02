import React from "react";
import { Link } from "react-router-dom";

// AGB-Bestätigung — REINE DARSTELLUNG; der Zustand (agbAccepted) bleibt im
// Orchestrator. Unverändert extrahiert. 7-Tage-Zahlungsziel-Wording unberührt.
export function TermsModule({ accepted, onChange }) {
  return (
    <label className="booking-agb-label">
      <input type="checkbox" className="booking-agb-checkbox" checked={accepted} onChange={e => onChange(e.target.checked)} />
      <span className="booking-agb-text">
        Ich bestätige die oben genannten Sendungsdaten und stimme den{" "}
        <Link to="/agb" className="booking-agb-link">Allgemeinen Geschäftsbedingungen</Link>{" "}
        zu. Mir ist bewusst, dass diese Bestellung verbindlich ist und eine Zahlungsverpflichtung auslöst.
      </span>
    </label>
  );
}
