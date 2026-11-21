import React from "react";
import { publicCarrierDisplay, publicServiceName } from "../utils/carrierMap.js";
import { Werte } from "../components/ui/Werte.jsx";
import {
  PRICE_TEXT, handoffUrl, offerCanContinue, offerDeliveryView, offerHints, offerPickupView, offerPriceView,
  offerUnavailableText,
} from "../utils/publicCalculatorView.mjs";
import { OFFER_REFRESH_TEXT } from "../utils/offerRefresh.mjs";

// ── Tarifkarte des öffentlichen Preisrechners ────────────────────────────────
// Eine Karte je Zeile (Betreiberentscheidung 2026-10-27, UX-Korrektur B), aufgebaut wie die Tarifkarte des
// Kundenbereichs: Identität (Carrier, Service, Übergabeart als Kennzeichnung, darunter die Hinweise) · Ablauf
// (Achse von der Abholung bzw. Abgabe zur Laufzeit „laut Versanddienstleister") · Preisspalte. Der Preis steht
// netto groß, darunter klein „zzgl. MwSt." (Betreiberentscheidung 2026-10-16: öffentlich nur der Nettopreis),
// bei nicht exaktem Preis darunter „ab" mit Erklärung. Wo die Zonen stehen, entscheidet allein die Breite der
// Karte (public-calculator.css, Container pc-karte). „Angebot auswählen" nur, wenn der Server das Angebot mit
// vollständigen Sendungsangaben als buchbar kennzeichnet; sie führt über die Übernahmeseite der Hauptdomain
// direkt in die Registrierung (angemeldete Kundinnen und Kunden direkt in „Neue Sendung"). Sonst bleibt die Karte
// sichtbar wie im Portal — an der Stelle der Aktion steht ihr Grund, nie eine leere Fläche. Keine Auszeichnung,
// kein Rang. Kein Carrier-Logo (Betreiberentscheidung 2026-11-02): Carrier und Service stehen als Text; das Portal
// zeigt seine Logos unverändert weiter.

// Masteranalyse Angebotskarten 2026-11-20 (§5.3): `expired` — die Aussage dieses Angebots ist abgelaufen. Die Karte führt
// dann nicht weiter, sondern bietet „Angebote aktualisieren" (`onRefresh`, dieselbe Anfrage ab dem heutigen Tag).
export function PublicOfferCard({ offer, index, shippingDate = null, expired = false, onRefresh, todayISO = null }) {
  const carrier = publicCarrierDisplay(offer);
  const service = publicServiceName(offer);
  const preis = offerPriceView(offer);
  const abholung = offerPickupView(offer, { shippingDate, todayISO, expired: expired === true });
  const zustellung = offerDeliveryView(offer);
  const hinweise = offerHints(offer);
  const abgelaufen = expired === true;
  const weiter = !abgelaufen && offerCanContinue(offer);
  const gesperrt = offerUnavailableText(offer);
  const titelId = `pc-offer-${index}-title`;
  const abgabe = offer.serviceType === "dropoff";

  const auswaehlen = () => {
    const ziel = handoffUrl(offer.handoffToken);
    if (ziel) window.location.assign(ziel);
  };

  return (
    <article className={`pc-offer${weiter ? "" : " pc-offer--quiet"}${abgelaufen ? " pc-offer--expired" : ""}`} aria-labelledby={titelId}
      data-product-key={offer.productKey || undefined}>
      <header className="pc-offer-head">
        <div className="pc-offer-name">
          <h3 className="pc-offer-carrier" id={titelId}>{carrier.name}</h3>
          <p className="pc-offer-service">{service}</p>
        </div>
        {abholung.title && (
          <span className={`pc-offer-tag${abgabe ? " pc-offer-tag--dropoff" : ""}`}>{abholung.title}</span>
        )}
      </header>

      <div className="pc-offer-ablauf">
        <span className="pc-offer-achse" aria-hidden="true" />
        <dl className="pc-offer-facts">
          <div className="pc-fact">
            <dt>{abholung.dayLabel}</dt>
            <dd>
              <span className="pc-fact-main"><Werte>{abholung.day || "—"}</Werte></span>
              {abholung.time && <span className="pc-fact-sub"><Werte>{abholung.time}</Werte></span>}
              {abholung.adjustedNote && <span className="pc-fact-sub"><Werte>{abholung.adjustedNote}</Werte></span>}
              {abholung.deadline && <span className="pc-fact-sub pc-fact-deadline"><Werte>{abholung.deadline}</Werte></span>}
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
      </div>

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
                {preis.sameDayNote && <p className="pc-price-sameday">{preis.sameDayNote}</p>}
              </>
            )}
          </div>
          <div className="pc-offer-action">
            {abgelaufen ? (
              typeof onRefresh === "function"
                ? <button type="button" className="pc-button pc-button--secondary pc-offer-refresh" onClick={onRefresh}
                    aria-describedby={titelId}>{OFFER_REFRESH_TEXT.action}</button>
                : <p className="pc-offer-unavailable">{OFFER_REFRESH_TEXT.status}</p>
            ) : weiter ? (
              <button type="button" className="pc-button pc-button--offer pc-offer-continue" onClick={auswaehlen}
                aria-describedby={titelId}>
                Angebot auswählen
              </button>
            ) : (
              gesperrt && <p className="pc-offer-unavailable">{gesperrt}</p>
            )}
          </div>
        </div>
        {!preis.onRequest && preis.note && <p className="pc-price-note">{preis.note}</p>}
      </div>
    </article>
  );
}
