import React from "react";
import { publicCarrierDisplay, publicServiceName } from "../utils/carrierMap.js";
import { Werte } from "../components/ui/Werte.jsx";
import {
  PRICE_TEXT, handoffUrl, offerCanContinue, offerDeliveryView, offerHints, offerPickupView, offerPriceView,
  offerUnavailableText,
} from "../utils/publicCalculatorView.mjs";

// ── Tarifkarte des öffentlichen Preisrechners ────────────────────────────────
// Kopf: Carrier, Service und die Übergabeart als Kennzeichnung. Darunter in zwei
// Spalten Abholtag bzw. Abgabe und Laufzeit „laut Versanddienstleister", dann die
// Hinweise und der Abschluss: der Preis — netto groß, darunter klein „zzgl. MwSt."
// (Betreiberentscheidung 2026-10-16: öffentlich nur der Nettopreis) — mit der Aktion
// in einer Zeile (Komplettabschluss 2026-10-28: kompakter Knopf statt Vollbreite),
// bei nicht exaktem Preis darunter „ab" mit Erklärung. „Angebot auswählen" nur, wenn der Server
// das Angebot mit vollständigen Sendungsangaben als buchbar kennzeichnet; sie führt
// über die Übernahmeseite der Hauptdomain direkt in die Registrierung (angemeldete
// Kundinnen und Kunden direkt in „Neue Sendung"). Sonst bleibt die Karte sichtbar wie
// im Portal — mit dem Grundtext und ohne Aktion. Keine Auszeichnung, kein Rang.

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
  const abgabe = offer.serviceType === "dropoff";

  const auswaehlen = () => {
    const ziel = handoffUrl(offer.handoffToken);
    if (ziel) window.location.assign(ziel);
  };

  return (
    <article className={`pc-offer${weiter ? "" : " pc-offer--quiet"}`} aria-labelledby={titelId}
      data-product-key={offer.productKey || undefined}>
      <header className="pc-offer-head">
        <span className="pc-offer-logo">
          {carrier.logo ? <img src={carrier.logo} alt="" width="72" height="32" loading="lazy" /> : null}
        </span>
        <div className="pc-offer-name">
          <h3 className="pc-offer-carrier" id={titelId}>{carrier.name}</h3>
          <p className="pc-offer-service">{service}</p>
        </div>
        {abholung.title && (
          <span className={`pc-offer-tag${abgabe ? " pc-offer-tag--dropoff" : ""}`}>{abholung.title}</span>
        )}
      </header>

      <dl className="pc-offer-facts">
        <div className="pc-fact">
          <dt>{abholung.dayLabel}</dt>
          <dd>
            <span className="pc-fact-main"><Werte>{abholung.day || "—"}</Werte></span>
            {abholung.time && <span className="pc-fact-sub"><Werte>{abholung.time}</Werte></span>}
            {abholung.adjustedNote && <span className="pc-fact-sub"><Werte>{abholung.adjustedNote}</Werte></span>}
          </dd>
        </div>
        <div className="pc-fact">
          <dt>{zustellung.label}</dt>
          <dd>
            <span className="pc-fact-main"><Werte>{zustellung.value}</Werte></span>
            {zustellung.time && <span className="pc-fact-sub"><Werte>{zustellung.time}</Werte></span>}
            {zustellung.note && <span className="pc-fact-sub pc-fact-note"><Werte>{zustellung.note}</Werte></span>}
          </dd>
        </div>
      </dl>

      {hinweise.length > 0 && (
        <ul className="pc-offer-hints">
          {hinweise.map((h) => <li key={h}>{h}</li>)}
        </ul>
      )}

      <div className="pc-offer-abschluss">
        <div className="pc-offer-zeile">
          <div className="pc-offer-price">
            {preis.onRequest ? (
              <p className="pc-price-main">{PRICE_TEXT.onRequest}</p>
            ) : (
              <>
                <p className="pc-price-main"><span className="pc-price-amount">{preis.net}</span></p>
                <p className="pc-price-vat">{PRICE_TEXT.vatNote}</p>
              </>
            )}
          </div>
          <div className="pc-offer-action">
            {weiter ? (
              <button type="button" className="pc-button pc-button--offer pc-offer-continue" onClick={auswaehlen}
                aria-describedby={titelId}>
                Angebot auswählen
              </button>
            ) : (
              <p className="pc-offer-unavailable">{gesperrt}</p>
            )}
          </div>
        </div>
        {!preis.onRequest && preis.note && <p className="pc-price-note">{preis.note}</p>}
      </div>
    </article>
  );
}
