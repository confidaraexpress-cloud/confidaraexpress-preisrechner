import React from "react";
import { Icon } from "../ui/Icon";
import {
  ADDRESS_STATUS, ADDRESS_MESSAGES, addressStatusTone, showsAddressStatus,
  addressNeedsAcknowledgement,
} from "../../utils/addressValidationView.mjs";

// AddressStatusLine — die einzige Anzeige des Prüfergebnisses. REINE DARSTELLUNG.
//
// Sie sagt nie „Hausnummer bestätigt": der Datendienst führt keine vollständige
// Hausnummerndatenbank, und eine solche Aussage wäre schlicht falsch. Der bestätigte Text
// nennt deshalb ausdrücklich nur PLZ, Ort und Straße.
//
// Bei `unverified` und `unavailable` steht eine Möglichkeit zum Weitermachen daneben — eine
// Datenlücke oder ein Ausfall des Prüfdienstes darf einen realen Kunden nicht am Versand
// hindern. Nur der eindeutige Widerspruch (`invalid`) bietet diesen Ausweg NICHT.
export function AddressStatusLine({ status, onAcknowledge, acknowledged, citySuggestions = [], onPickCity }) {
  if (!showsAddressStatus(status)) return null;

  if (status === ADDRESS_STATUS.CHECKING) {
    return (
      <p className="addr-status addr-status--checking" role="status" aria-live="polite">
        <span className="spinner spinner-dark" />
        <span>Adresse wird geprüft …</span>
      </p>
    );
  }

  const tone = addressStatusTone(status);
  const message = ADDRESS_MESSAGES[status] || "";
  const canAcknowledge = addressNeedsAcknowledgement(status) && !acknowledged && typeof onAcknowledge === "function";
  const icon = tone === "success" ? "check" : "info";

  return (
    <div className={`addr-status addr-status--${tone}`} role="status" aria-live="polite">
      <Icon n={icon} s={15} c="currentColor" />
      <span className="addr-status-text">
        {acknowledged && addressNeedsAcknowledgement(status)
          ? "Adresse wird wie eingegeben übernommen."
          : message}
        {/* Bei einem Widerspruch werden die tatsächlich zur PLZ gehörenden Orte angeboten —
            das ist die schnellste Korrektur und verlangt kein Nachschlagen. */}
        {status === ADDRESS_STATUS.INVALID && citySuggestions.length > 0 && (
          <span className="addr-status-suggest">
            {" "}Passend wäre:{" "}
            {citySuggestions.slice(0, 3).map((c, i) => (
              <React.Fragment key={c}>
                {i > 0 && ", "}
                <button type="button" className="btn btn-link btn-sm addr-status-city" onClick={() => onPickCity?.(c)}>
                  {c}
                </button>
              </React.Fragment>
            ))}
          </span>
        )}
      </span>
      {canAcknowledge && (
        <button type="button" className="btn btn-link btn-sm addr-status-ack" onClick={onAcknowledge}>
          Adresse trotzdem verwenden
        </button>
      )}
    </div>
  );
}
