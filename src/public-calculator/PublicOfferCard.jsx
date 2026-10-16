import React from "react";
import { publicCarrierDisplay, publicServiceName } from "../utils/carrierMap.js";
import {
  PRICE_TEXT, handoffUrl, offerCanContinue, offerDeliveryView, offerHints, offerPickupView, offerPriceView,
  offerUnavailableText,
} from "../utils/publicCalculatorView.mjs";

// ── Tarifkarte des öffentlichen Preisrechners ────────────────────────────────
// Carrier und Service, Übergabe und Abholtag, Laufzeit „laut Versanddienstleister",
// Netto und Brutto (bei nicht exaktem Preis mit „ab" und Erklärung), Hinweise.
// „Mit diesem Tarif fortfahren" nur, wenn der Server das Angebot mit vollständigen
// Sendungsangaben als buchbar kennzeichnet; sonst bleibt die Karte sichtbar wie im
// Portal — mit dem Grundtext und ohne Aktion. Keine Auszeichnung, kein Rang.

export function PublicOfferCard({ offer, index }) {
  const carrier = publicCarrierDisplay(offer);
  const service = publicServiceName(offer);
  const preis = offerPriceView(offer);
  const abholung = offerPickupView(offer);
  const zustellung = offerDeliveryView(offer);
  const hinweise = offerHints(offer);
  const weiter = offerCanContinue(offer);
  const gesperrt = offerUnavailableText(offer);
  const titelId = `pc-offer-${index}-title`;

  const fortfahren = () => {
    const ziel = handoffUrl(offer.handoffToken);
    if (ziel) window.location.assign(ziel);
  };

  return (
    <article className="pc-offer" aria-labelledby={titelId} data-product-key={offer.productKey || undefined}>
      <header className="pc-offer-head">
        <span className="pc-offer-logo">
          {carrier.logo ? <img src={carrier.logo} alt="" width="72" height="32" loading="lazy" /> : null}
        </span>
        <div className="pc-offer-name">
          <h3 className="pc-offer-carrier" id={titelId}>{carrier.name}</h3>
          <p className="pc-offer-service">{service}</p>
        </div>
      </header>

      <dl className="pc-offer-facts">
        {abholung.title && (
          <div className="pc-fact">
            <dt>Übergabe</dt>
            <dd>{abholung.title}</dd>
          </div>
        )}
        <div className="pc-fact">
          <dt>{abholung.dayLabel}</dt>
          <dd>
            {abholung.day || "—"}
            {abholung.time && <span className="pc-fact-sub">{abholung.time}</span>}
            {abholung.adjustedNote && <span className="pc-fact-sub">{abholung.adjustedNote}</span>}
          </dd>
        </div>
        <div className="pc-fact">
          <dt>{zustellung.label}</dt>
          <dd>
            {zustellung.value}
            {zustellung.time && <span className="pc-fact-sub">{zustellung.time}</span>}
            {zustellung.note && <span className="pc-fact-sub pc-fact-note">{zustellung.note}</span>}
          </dd>
        </div>
      </dl>

      <div className="pc-offer-price">
        {preis.onRequest ? (
          <p className="pc-price-net">{PRICE_TEXT.onRequest}</p>
        ) : (
          <>
            <p className="pc-price-net">
              <span className="pc-price-amount">{preis.net}</span> <span className="pc-price-suffix">{PRICE_TEXT.net}</span>
            </p>
            {preis.gross && (
              <p className="pc-price-gross">{preis.gross} {PRICE_TEXT.gross}</p>
            )}
            {preis.note && <p className="pc-price-note">{preis.note}</p>}
          </>
        )}
      </div>

      {hinweise.length > 0 && (
        <ul className="pc-offer-hints">
          {hinweise.map((h) => <li key={h}>{h}</li>)}
        </ul>
      )}

      <div className="pc-offer-action">
        {weiter ? (
          <button type="button" className="pc-button pc-button--primary pc-offer-continue" onClick={fortfahren}
            aria-describedby={titelId}>
            Mit diesem Tarif fortfahren
          </button>
        ) : (
          <p className="pc-offer-unavailable">{gesperrt}</p>
        )}
      </div>
    </article>
  );
}
