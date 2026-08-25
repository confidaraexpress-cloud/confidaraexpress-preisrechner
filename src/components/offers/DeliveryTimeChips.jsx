import React, { useRef } from "react";

/* ─── Uhrzeitzeile der „Spätesten Lieferzeit" ──────────────────────────────────
 *
 * EIN Bauteil für alle drei Bedienstellen (Formular „Neue Sendung", Formular
 * Preisrechner, Lieferungs-Dropdown der Angebotsliste). Sie schreiben denselben
 * Wert; es gibt keinen zweiten Filterzustand.
 *
 * Die Auswahlmöglichkeiten kommen aus `deliveryTimeOptions(tariffs)` — also aus
 * den TATSÄCHLICH geladenen Tarifen, nie aus einer festen Liste. Eine
 * hartcodierte Uhrzeit hätte auf vielen Routen garantiert null Treffer, und eine
 * Filteroption ohne möglichen Treffer behauptet eine Funktion, die es nicht gibt.
 *
 * Ohne Datum ist die Zeile bedienbar deaktiviert (`aria-disabled` UND sichtbarer
 * Grund): eine Uhrzeit ohne Datum ergibt keinen Zeitpunkt.
 *
 * Semantik: echte Radiogruppe mit Roving Tabindex — genau ein Chip ist im
 * Tabfluss, Pfeiltasten wechseln, Home/End springen. Kein Dialog, keine
 * Fokusfalle: die Zeile ist Teil des umgebenden Popovers.
 */
export default function DeliveryTimeChips({ options, value, onChange, hasDate, idPrefix }) {
  const gruppeRef = useRef(null);

  // „Beliebig" ist immer die erste Wahlmöglichkeit und zugleich der Leerwert.
  const werte = ["", ...(options || [])];
  const aktiv = werte.includes(value) ? value : "";

  const onKeyDown = (e) => {
    const tasten = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!tasten.includes(e.key)) return;
    e.preventDefault();
    const i = werte.indexOf(aktiv);
    let ziel;
    if (e.key === "Home") ziel = 0;
    else if (e.key === "End") ziel = werte.length - 1;
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") ziel = (i + 1) % werte.length;
    else ziel = (i - 1 + werte.length) % werte.length;
    const naechster = werte[ziel];
    onChange(naechster);
    // Der Fokus folgt der Auswahl — sonst läge er auf einem Chip, der nicht
    // mehr der ausgewählte ist, und die Gruppe wäre mit der Tastatur verloren.
    const knopf = gruppeRef.current?.querySelector(`[data-zeit="${naechster}"]`);
    if (knopf) knopf.focus();
  };

  const hinweisId = `${idPrefix}-zeit-hinweis`;

  return (
    <div className="offers-time-row">
      <div className="offers-time-label" id={`${idPrefix}-zeit-label`}>Uhrzeit (optional)</div>
      {hasDate ? (
        <div
          className="date-quick-options offers-time-chips"
          role="radiogroup"
          aria-labelledby={`${idPrefix}-zeit-label`}
          ref={gruppeRef}
          onKeyDown={onKeyDown}
        >
          {werte.map((v) => (
            <button
              key={v || "beliebig"}
              type="button"
              role="radio"
              data-zeit={v}
              aria-checked={aktiv === v}
              tabIndex={aktiv === v ? 0 : -1}
              className={`date-quick-btn ${aktiv === v ? "active" : ""}`}
              onClick={() => onChange(v)}
            >
              {v || "Beliebig"}
            </button>
          ))}
        </div>
      ) : (
        <p className="offers-time-disabled" id={hinweisId} aria-disabled="true">
          Erst ein Datum wählen
        </p>
      )}
    </div>
  );
}
