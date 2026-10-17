import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import {
  ADDRESS_STATUS, addressStatusMessage, addressStatusTone, showsAddressStatus,
} from "../../utils/addressValidationView.mjs";

// AddressStatusLine — die einzige Anzeige des Prüfergebnisses. REINE DARSTELLUNG.
//
// „Adresse gefunden“ erscheint nur, wenn der Adressdienst die Anschrift bis zur Hausnummer
// gefunden hat; eine Zusage, dass dort zugestellt werden kann, ist das nicht und wird nirgends
// behauptet. Alle übrigen Ergebnisse sind Hinweise — die Statuszeile sperrt nie etwas, und es gibt
// nichts zu bestätigen. (Bis 2026-10-15 stand hier „Adresse so verwenden“: ein Knopf, der nur den
// eigenen Hinweistext austauschte und sonst nichts bewirkte — entfernt.) Passt die PLZ
// möglicherweise nicht zum Ort, bietet die Zeile die Orte an, die der Dienst zu dieser PLZ kennt.
//
// Ruhe im Formular (Premium-Durchgang 2026-10-15):
//   • Der Platz der Zeile ist IMMER reserviert (`.addr-status-slot`, eine Textzeile hoch). Ein
//     Ergebnis, das kommt oder geht, verschiebt kein Feld darunter. Der Platz ist zugleich die
//     dauerhafte Live-Region — Screenreader hören jedes Ergebnis, ohne dass Elemente erscheinen.
//   • „Adresse wird geprüft …“ erscheint erst, wenn die Prüfung spürbar dauert. Eine schnelle
//     Antwort geht ohne Zwischenzustand direkt ins Ergebnis — kein Flackern.
//   • „Adresse gefunden“ steht als Text nur kurz nach der Prüfung da; danach bleibt allein das
//     Häkchen. Ein mitgebrachtes Ergebnis (Rückkehr aus der Buchung) zeigt gleich nur das Häkchen.
//   • Ändert der Kunde die Anschrift, verschwindet ein früheres Ergebnis sofort — auch kein
//     gedimmtes Häkchen bleibt neben einer anderen Adresse stehen (der Hook setzt `idle`).
export const CHECKING_DELAY_MS = 400;
export const CONFIRMED_TEXT_MS = 4000;

export function AddressStatusLine({ status, reason = null, citySuggestions = [], onPickCity }) {
  const [pruefungSichtbar, setPruefungSichtbar] = useState(false);
  const [textSichtbar, setTextSichtbar] = useState(false);
  const vorher = useRef(status);

  useEffect(() => {
    if (status !== ADDRESS_STATUS.CHECKING) { setPruefungSichtbar(false); return undefined; }
    const t = setTimeout(() => setPruefungSichtbar(true), CHECKING_DELAY_MS);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    const war = vorher.current;
    vorher.current = status;
    if (status !== ADDRESS_STATUS.CONFIRMED) { setTextSichtbar(false); return undefined; }
    if (war === ADDRESS_STATUS.CONFIRMED) return undefined;
    setTextSichtbar(true);
    const t = setTimeout(() => setTextSichtbar(false), CONFIRMED_TEXT_MS);
    return () => clearTimeout(t);
  }, [status]);

  let inhalt = null;
  if (status === ADDRESS_STATUS.CHECKING) {
    if (pruefungSichtbar) {
      inhalt = (
        <p className="addr-status addr-status--checking">
          <span className="spinner spinner-dark" aria-hidden="true" />
          <span className="addr-status-text">Adresse wird geprüft …</span>
        </p>
      );
    }
  } else if (showsAddressStatus(status)) {
    const tone = addressStatusTone(status);
    const message = addressStatusMessage(status, reason);
    const zeigeOrte = status === ADDRESS_STATUS.UNVERIFIED && reason === "postal_code_city_mismatch"
      && citySuggestions.length > 0 && typeof onPickCity === "function";
    // Nur „Adresse gefunden“ trägt ein Symbol (Häkchen). Hinweise stehen als ruhiger Text ohne
    // Warn- oder Infosymbol (Betreiberentscheidung Auftrag 1, 2026-10-16) — der Wortlaut und die
    // Live-Region bleiben, nichts wird dadurch gesperrt oder abgeschaltet.
    const icon = tone === "success" ? "check" : null;
    const leise = status === ADDRESS_STATUS.CONFIRMED && !textSichtbar;
    inhalt = (
      <p className={`addr-status addr-status--${tone}`} title={leise ? message : undefined}>
        {icon && <span className="addr-status-icon" aria-hidden="true"><Icon n={icon} s={12} /></span>}
        <span className={`addr-status-text${leise ? " addr-status-text--quiet" : ""}`}>
          {message}
          {/* Die Orte, die der Dienst zu dieser PLZ kennt — die schnellste Korrektur, falls
              der Ort tatsächlich vertippt war. Eine Auswahl ist nie Pflicht. */}
          {zeigeOrte && (
            <span className="addr-status-suggest">
              {" "}Passend:{" "}
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
      </p>
    );
  }

  return (
    <div className="addr-status-slot" role="status" aria-live="polite">
      {inhalt}
    </div>
  );
}
