// „Buchungsdetails anzeigen" — der aufklappbare Teil der Erfolgsseite (Variante A, Phase 1, Canonical v2.117).
//
// Ergänzende Angaben, die der Kunde nicht sofort braucht: vollständige Anschriften, Pakete, Kundenreferenz. Alles
// stammt aus den beim Buchen gesendeten Daten — kein Abruf, keine Ableitung. Geöffnet wird über einen Knopf mit
// aria-expanded/aria-controls, nicht über <details>: dessen Sichtbarkeit meldet Chromium in Tests nur über
// checkVisibility(), und der Knopf verhält sich in jedem Browser gleich.
import { useState } from "react";
import { Icon } from "../ui/Icon";
import { BOOKING_SUCCESS_TEXT, bookingSuccessAddressLines } from "../../utils/bookingSuccessActions.mjs";
import { packageSummaryLine } from "../../utils/newShipmentForm.mjs";
import { countries } from "../../utils/countries";

const landName = (code) => (countries.find((c) => c.code === String(code).toUpperCase()) || {}).name || null;

export function BookingSuccessDetails({ form, reference }) {
  const T = BOOKING_SUCCESS_TEXT;
  const [offen, setOffen] = useState(false);
  const absender = bookingSuccessAddressLines(form, "s", landName);
  const empfaenger = bookingSuccessAddressLines(form, "r", landName);
  const pakete = form ? packageSummaryLine(form) : null;
  const eintraege = [
    absender.length > 0 && ["Absender", absender],
    empfaenger.length > 0 && ["Empfänger", empfaenger],
    pakete && ["Pakete", [pakete]],
    reference && ["Ihre Referenz", [reference]],
  ].filter(Boolean);
  if (eintraege.length === 0) return null;
  return (
    <section className={`bsx-details${offen ? " is-offen" : ""}`} aria-label="Buchungsdetails">
      <button type="button" className="bsx-details-knopf" aria-expanded={offen} aria-controls="bsx-details-inhalt"
              onClick={() => setOffen((o) => !o)}>
        <span>{offen ? T.detailsHide : T.detailsShow}</span>
        <Icon n="chevron" s={18} />
      </button>
      <div className="bsx-details-inhalt" id="bsx-details-inhalt" hidden={!offen}>
        <dl className="bsx-details-liste">
          {eintraege.map(([k, zeilen]) => (
            <div className="bsx-details-eintrag" key={k}>
              <dt>{k}</dt>
              <dd>{zeilen.map((z, i) => <span className="bsx-details-zeile" key={i}>{z}</span>)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
