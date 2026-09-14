import React from "react";
import { RESIDENTIAL_TEXT, RESIDENTIAL_ACTION } from "../../utils/residentialPriceInputs.mjs";

/* „Art der Lieferadresse" — nach der Auswahl eines Angebots, das diese Angabe braucht.

   ─── REINE DARSTELLUNG ───────────────────────────────────────────────────────
   Laden, Binden, Fehler und Preisstand stehen im Orchestrator (BookingPage). Dieses Bauteil
   bekommt das fertige Anzeigemodell (`residentialModuleView`) und meldet nur die Auswahl und
   die gewählte Folgehandlung eines Fehlers.

   ─── DIE BETRÄGE KOMMEN VOM SERVER ───────────────────────────────────────────
   „+ X,XX € brutto" und „Y,YY € netto" sind der Zuschlag aus der Optionsantwort. Es wird
   nichts gerechnet und kein Gesamtpreis gebildet.

   ─── ZWEI RADIOS OHNE VORAUSWAHL ─────────────────────────────────────────────
   Die Angabe ist dreiwertig: Geschäftsadresse, Privatadresse, noch nicht gewählt. `checked`
   vergleicht deshalb strikt; ohne Bindung ist keine Karte markiert. Gesperrt werden die Radios
   ausschließlich, solange eine Bindung läuft — ein zweiter Klick soll keine zweite auslösen.

   Kein Providername, kein Anbieterbegriff: alle Texte kommen aus residentialPriceInputs.mjs. */
export function ResidentialPriceInputModule({ view, onSelect, onRetry, onRecalculate, onNavigateShipments }) {
  const v = view || {};
  const karten = Array.isArray(v.cards) ? v.cards : [];
  return (
    <div className="calc-panel mb-16 res-price-inputs" id="residential-price-inputs">
      <div className="calc-panel-body">
        <div className="calc-section-head">
          <h3 className="calc-section-title" id="residential-price-inputs-title">{RESIDENTIAL_TEXT.sectionTitle}</h3>
        </div>

        {v.showLoading && (
          <p className="res-state res-state--loading" id="residential-options-loading" role="status" aria-live="polite">
            <span className="spinner spinner-dark" />
            <span>{RESIDENTIAL_TEXT.loading}</span>
          </p>
        )}

        {v.showError && (
          <div className="res-state res-state--error" id="residential-options-error" role="alert">
            <span>{v.errorText}</span>
            {v.errorAction === RESIDENTIAL_ACTION.RETRY && (
              <button type="button" className="btn btn-outline" id="residential-options-retry" onClick={onRetry}>
                {RESIDENTIAL_TEXT.retry}
              </button>
            )}
            {v.errorAction === RESIDENTIAL_ACTION.RECALCULATE && (
              <button type="button" className="btn btn-outline" id="residential-options-recalculate" onClick={onRecalculate}>
                {RESIDENTIAL_TEXT.recalculateAction}
              </button>
            )}
            {v.errorAction === RESIDENTIAL_ACTION.USED && (
              <button type="button" className="btn btn-outline" id="residential-options-shipments" onClick={onNavigateShipments}>
                {RESIDENTIAL_TEXT.shipmentsAction}
              </button>
            )}
          </div>
        )}

        {karten.length > 0 && (
          <div
            className="res-cards"
            role="radiogroup"
            aria-labelledby="residential-price-inputs-title"
            aria-busy={v.locked ? true : undefined}
          >
            {karten.map((k) => (
              <label
                key={k.id}
                htmlFor={k.id}
                className={`res-card${k.checked ? " res-card--selected" : ""}${k.disabled ? " res-card--locked" : ""}`}
              >
                <input
                  type="radio"
                  id={k.id}
                  name="residential-delivery"
                  checked={k.checked === true}
                  disabled={k.disabled === true}
                  onChange={() => onSelect(k.value)}
                />
                <span className="res-card-head">
                  <span className="res-card-radio" aria-hidden="true" />
                  <span className="res-card-name">{k.label}</span>
                </span>
                <span className="res-card-price">
                  <span className="res-card-price-val">{k.grossText}</span>
                  <span className="res-card-price-sub">{k.netText}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        {v.bindingText && (
          <p className="res-notice" id="residential-binding" role="status" aria-live="polite">{v.bindingText}</p>
        )}
        {v.notice && (
          <p className="res-notice" id="residential-options-notice" role="status">{v.notice}</p>
        )}
      </div>
    </div>
  );
}
