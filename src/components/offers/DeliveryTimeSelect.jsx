import React from "react";
import { Icon } from "../ui/Icon";
import { deliveryTimeOptionLabel } from "../../utils/deliveryTimeView.mjs";

/* ─── Uhrzeit der „Spätesten Lieferzeit“ ───────────────────────────────────────
 *
 * EIN Bauteil für alle drei Bedienstellen (Formular „Neue Sendung“, Formular
 * Preisrechner, Lieferungs-Dropdown der Angebotsliste). Sie schreiben denselben
 * Wert; es gibt keinen zweiten Filterzustand.
 *
 * WARUM EIN NATIVES `<select>`. Die Vorgängerfassung reihte jede verfügbare
 * Uhrzeit als eigenen Chip auf — bei acht Zeiten neun Pillen, die den ruhigen
 * B2B-Stil der übrigen Filter aufbrachen und technisch wirkten. Ein Auswahlfeld
 * zeigt stattdessen genau EINEN Wert und öffnet den Rest auf Anforderung.
 *
 * Das Feld ist das vorhandene Primitive `.field-select` (forms.css): eigene
 * Fläche, `--ce-color-border-interactive`, `--ce-radius-md`, Foundation-
 * Fokusring und ein einheitlicher Chevron über `appearance: none`. forms.css
 * hält ausdrücklich fest, dass Selects im System NATIV bleiben und nur ihren
 * Chevron bekommen — das hier ist also das bestehende Muster, kein zweites
 * Designsystem und ausdrücklich kein ungestylter Browser-Select.
 *
 * Der Nebeneffekt ist der eigentliche Gewinn: Öffnen mit Enter/Space, Schließen
 * mit Escape, Pfeiltasten, Auswahl mit Enter, sichtbarer Fokus und ein
 * Screenreader, der den aktuellen Wert vorliest, kommen vollständig vom
 * Browser. Eine handgebaute Combobox müsste das alles nachbilden und wäre
 * dabei bestenfalls gleich gut.
 */
export default function DeliveryTimeSelect({ options, value, onChange, hasDate, idPrefix }) {
  const feldId   = `${idPrefix}-zeit`;
  const hinweisId = `${idPrefix}-zeit-hinweis`;

  // „Beliebig“ ist immer die erste Wahlmöglichkeit und zugleich der Leerwert.
  // Die übrigen Zeiten kommen aus `deliveryTimeOptions(tariffs)` — also aus den
  // TATSÄCHLICH geladenen Tarifen, nie aus einer festen Liste. Eine hartcodierte
  // Uhrzeit hätte auf vielen Routen garantiert null Treffer, und eine
  // Filteroption ohne möglichen Treffer behauptet eine Funktion, die es nicht gibt.
  const werte = ["", ...(options || [])];
  const aktiv = werte.includes(value) ? value : "";

  return (
    <div className="offers-time-row">
      <label className="offers-time-label" htmlFor={feldId}>Uhrzeit (optional)</label>
      <div className="offers-time-field">
        <span className="offers-time-icon" aria-hidden="true">
          <Icon n="clock" s={15} c="currentColor" />
        </span>
        <select
          id={feldId}
          className="field-select offers-time-select"
          value={aktiv}
          disabled={!hasDate}
          aria-describedby={hasDate ? undefined : hinweisId}
          onChange={(e) => onChange(e.target.value)}
        >
          {werte.map((v) => (
            <option key={v || "beliebig"} value={v}>{deliveryTimeOptionLabel(v)}</option>
          ))}
        </select>
      </div>
      {/* Ohne Datum ergibt eine Uhrzeit keinen Zeitpunkt. Das Feld ist deshalb
          echt deaktiviert (nicht nur ausgegraut) UND nennt den Grund sichtbar —
          `aria-describedby` verbindet beides für Screenreader. */}
      {!hasDate && (
        <p className="offers-time-hint" id={hinweisId}>Erst ein Datum wählen</p>
      )}
    </div>
  );
}
