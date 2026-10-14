import React from "react";
import {
  ADDRESS_STATUS, addressStatusMessage, addressStatusTone, showsAddressStatus,
  addressNeedsAcknowledgement,
} from "../../utils/addressValidationView.mjs";

// AddressStatusLine — die einzige Anzeige des Prüfergebnisses. REINE DARSTELLUNG.
//
// „Adresse gefunden“ erscheint nur, wenn der Adressdienst die Anschrift bis zur Hausnummer
// gefunden hat; eine Zusage, dass dort zugestellt werden kann, ist das nicht und wird nirgends
// behauptet. Alle übrigen Ergebnisse sind Hinweise — die Statuszeile sperrt nie etwas.
//
// Bei `unverified` und `unavailable` steht „Adresse so verwenden“ daneben: der Kunde bestätigt,
// dass seine Eingabe stimmt, und der Hinweis tritt zurück. Passt die PLZ möglicherweise nicht
// zum Ort, bietet die Zeile die Orte an, die der Dienst zu dieser PLZ kennt.
//
// Seit dem Redesign (2026-10) ohne Symbol: der Ton steckt in Fläche und Text
// (addr-status--success/-warning), die Aussage im Satz selbst.
export function AddressStatusLine({ status, reason = null, onAcknowledge, acknowledged, citySuggestions = [], onPickCity }) {
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
  const message = addressStatusMessage(status, reason);
  const canAcknowledge = addressNeedsAcknowledgement(status) && !acknowledged && typeof onAcknowledge === "function";
  const zeigeOrte = status === ADDRESS_STATUS.UNVERIFIED && reason === "postal_code_city_mismatch"
    && citySuggestions.length > 0 && typeof onPickCity === "function";

  return (
    <div className={`addr-status addr-status--${tone}`} role="status" aria-live="polite">
      <span className="addr-status-text">
        {acknowledged && addressNeedsAcknowledgement(status)
          ? "Adresse wird wie eingegeben übernommen."
          : message}
        {/* Die Orte, die der Dienst zu dieser PLZ kennt — die schnellste Korrektur, falls
            der Ort tatsächlich vertippt war. Eine Auswahl ist nie Pflicht. */}
        {zeigeOrte && !acknowledged && (
          <span className="addr-status-suggest">
            {" "}Passend wäre:{" "}
            {citySuggestions.slice(0, 3).map((c, i) => (
              <React.Fragment key={c}>
                {i > 0 && ", "}
                <button type="button" className="btn btn-link btn-sm addr-status-city" onClick={() => onPickCity(c)}>
                  {c}
                </button>
              </React.Fragment>
            ))}
          </span>
        )}
      </span>
      {canAcknowledge && (
        <button type="button" className="btn btn-link btn-sm addr-status-ack" onClick={onAcknowledge}>
          Adresse so verwenden
        </button>
      )}
    </div>
  );
}
