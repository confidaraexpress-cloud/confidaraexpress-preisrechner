import React from "react";
import { Icon } from "../ui/Icon";
import { money } from "../../utils/formatters";
import { resolveCarrier, resolveCarrierName } from "../../utils/carrierMap";

// Step 1 — „Ausgewähltes Angebot". Reine Darstellung des gewählten Tarifs,
// unverändert aus BookingPage extrahiert. Keine Logik, keine State.
export function OfferSummaryModule({ tariff }) {
  return (
    <div className="calc-panel mb-16">
      <div className="calc-panel-header"><Icon n="truck" s={18} c="#1D4ED8" /><h3>Ausgewähltes Angebot</h3></div>
      <div className="calc-panel-body">
        <div className="flex-between">
          <div>
            <div className="booking-carrier-wrap">
              {resolveCarrier(tariff.carrier).logo && (
                <img src={resolveCarrier(tariff.carrier).logo} alt="" aria-hidden="true" className="booking-carrier-logo" />
              )}
              <span className="booking-carrier-name">{resolveCarrierName(tariff.carrier)}</span>
            </div>
            <div className="text-sm text-muted">{tariff.tariffName} · {tariff.deliveryTime || "Auf Anfrage"}</div>
            {tariff.serviceType && (
              <div className="booking-service-info">
                {tariff.serviceType === "pickup" ? "🚐 Abholung" : "🏪 Shopabgabe"}
                {tariff.shopName        && ` · ${tariff.shopName}`}
                {tariff.pickupToday     && " · Abholung heute"}
                {tariff.printerRequired && " · Drucker erforderlich"}
              </div>
            )}
          </div>
          <div className="booking-price-col">
            {tariff.netPrice != null ? (
              <div className="booking-price-display">{money(tariff.netPrice)}</div>
            ) : (
              <div className="tariff-price-na">Preis fehlt</div>
            )}
            {tariff.netPrice != null && <div className="tariff-price-sub">exkl. MwSt.</div>}
            {tariff.vatAmount != null && tariff.finalPrice != null && (
              <div className="booking-price-detail">
                <div>MwSt. 19% {money(tariff.vatAmount)}</div>
                <div className="booking-price-detail-total">Brutto {money(tariff.finalPrice)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
