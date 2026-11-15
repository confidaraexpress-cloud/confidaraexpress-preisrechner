import React from "react";
import { RESIDENTIAL_TEXT, RESIDENTIAL_ACTION } from "../../utils/residentialPriceInputs.mjs";
import { AuswahlMenue } from "../ui/AuswahlMenue";

/* „Art der Lieferadresse" — nach der Auswahl eines Angebots, das diese Angabe braucht.

   ─── REINE DARSTELLUNG ───────────────────────────────────────────────────────
   Laden, Binden, Fehler und Preisstand stehen im Orchestrator (BookingPage). Dieses Bauteil
   bekommt das fertige Anzeigemodell (`residentialModuleView`) und meldet nur die Auswahl und
   die gewählte Folgehandlung eines Fehlers.

   ─── DIE BETRÄGE KOMMEN VOM SERVER ───────────────────────────────────────────
   „+ X,XX € brutto" und „Y,YY € netto" sind der Zuschlag aus der Optionsantwort. Es wird
   nichts gerechnet und kein Gesamtpreis gebildet.

   ─── ZWEI OPTIONEN OHNE VORAUSWAHL ───────────────────────────────────────────
   Die Angabe ist dreiwertig: Geschäftsadresse, Privatadresse, noch nicht gewählt. `checked`
   vergleicht deshalb strikt; ohne Bindung ist keine Option gewählt. Gesperrt werden die Optionen
   ausschließlich, solange eine Bindung läuft — eine zweite Wahl soll keine zweite auslösen.

   Kein Providername, kein Anbieterbegriff: alle Texte kommen aus residentialPriceInputs.mjs. */
export function ResidentialPriceInputModule({ view, onSelect, onRetry, onRecalculate, onNavigateShipments }) {
  const v = view || {};
  const karten = Array.isArray(v.cards) ? v.cards : [];
  const gewaehlt = karten.find((k) => k.checked === true) || null;
  return (
    <div className="calc-panel mb-16 res-price-inputs" id="residential-price-inputs">
      <div className="calc-panel-body">
        <div className="calc-section-head">
          <h3 className="calc-section-title" id="residential-price-inputs-title">{RESIDENTIAL_TEXT.sectionTitle}</h3>
        </div>

        {v.showLoading && (
          <p className="res-state res-state--loading" id="residential-options-loading" role="status" aria-live="polite">
            <span className="spinner spinner-dark" />
            <span>{v.loadingText || RESIDENTIAL_TEXT.loading}</span>
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

        {/* Kompaktes Auswahlmenü (Premium Control System 2.0, 2026-11-14). Ohne Bindung steht „Bitte wählen“ im Feld —
            keine Vorauswahl. Netto/Brutto (2026-10-02): vorn der Zuschlag im gewählten Anzeigemodus, darunter der
            andere — beide unverändert aus der Optionsantwort des Servers. Während einer Bindung sind die Optionen
            gesperrt (eine zweite Wahl löst keine zweite Bindung aus), das Feld selbst nicht: es behält den Fokus. */}
        {karten.length > 0 && (
          <AuswahlMenue
            name="residential-delivery"
            id="residential-delivery"
            labelId="residential-price-inputs-title"
            value={gewaehlt ? gewaehlt.value : null}
            options={karten.map((k) => ({
              value: k.value,
              id: k.id,
              label: k.label,
              aside: k.primaryText,
              asideSub: k.secondaryText,
              disabled: k.disabled === true,
            }))}
            onChange={onSelect}
            busy={v.locked === true}
          />
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
