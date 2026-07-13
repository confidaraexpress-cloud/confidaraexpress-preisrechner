import React from "react";
import { Icon } from "../ui/Icon";
import { money, isoDayDE } from "../../utils/formatters";
import { publicCarrierDisplay, publicServiceName, publicDropoffLabel } from "../../utils/carrierMap";

// Step 1 — „Ausgewähltes Angebot". Reine Darstellung des gewählten Tarifs,
// unverändert aus BookingPage extrahiert. Keine Logik, keine State.
export function OfferSummaryModule({ tariff }) {
  const { name: carrierName, logo: carrierLogo } = publicCarrierDisplay(tariff);
  const dropoffLabel = publicDropoffLabel(tariff);
  return (
    <div className="calc-panel mb-16">
      <div className="calc-panel-header"><Icon n="truck" s={18} c="#1D4ED8" /><h3>Ausgewähltes Angebot</h3></div>
      <div className="calc-panel-body">
        <div className="flex-between">
          <div>
            <div className="booking-carrier-wrap">
              {carrierLogo && (
                <img src={carrierLogo} alt="" aria-hidden="true" className="booking-carrier-logo" />
              )}
              <span className="booking-carrier-name">{carrierName}</span>
            </div>
            <div className="text-sm text-muted">{publicServiceName(tariff)} · {tariff.deliveryTime || "Auf Anfrage"}</div>
            {tariff.serviceType && (
              <div className="booking-service-info">
                {tariff.serviceType === "pickup" ? "🚐 Abholung" : "🏪 Shopabgabe"}
                {dropoffLabel           && ` · ${dropoffLabel}`}
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

        {/* Termin & Ablauf — ausschließlich real vorhandene Tarif-Felder, keine
            erfundenen Werte, keine Platzhalter bei fehlenden Angaben. */}
        {(tariff.pickupDate || (tariff.pickupTimeFrom && tariff.pickupTimeUntil) ||
          tariff.deliveryDate || (tariff.deliveryDateMin && tariff.deliveryDateMax) ||
          tariff.deliveryTimeUntil || tariff.hasPickupSurcharge === true ||
          tariff.trackingAvailable != null) && (
          <div className="mt-12">
            {tariff.pickupDate && (
              <div className="summary-detail-row summary-detail-row-border">
                <span className="text-sm text-muted summary-detail-key">Abholtermin</span>
                <span className="text-sm font-bold summary-detail-val">{isoDayDE(tariff.pickupDate)}</span>
              </div>
            )}
            {tariff.pickupTimeFrom && tariff.pickupTimeUntil && (
              <div className="summary-detail-row summary-detail-row-border">
                <span className="text-sm text-muted summary-detail-key">Abholzeitfenster</span>
                <span className="text-sm font-bold summary-detail-val">{tariff.pickupTimeFrom}–{tariff.pickupTimeUntil} Uhr</span>
              </div>
            )}
            {tariff.deliveryDateMin && tariff.deliveryDateMax ? (
              <div className="summary-detail-row summary-detail-row-border">
                <span className="text-sm text-muted summary-detail-key">Lieferzeitraum</span>
                <span className="text-sm font-bold summary-detail-val">{isoDayDE(tariff.deliveryDateMin)} – {isoDayDE(tariff.deliveryDateMax)}</span>
              </div>
            ) : tariff.deliveryDate && (
              <div className="summary-detail-row summary-detail-row-border">
                <span className="text-sm text-muted summary-detail-key">Liefertermin</span>
                <span className="text-sm font-bold summary-detail-val">{isoDayDE(tariff.deliveryDate)}</span>
              </div>
            )}
            {tariff.deliveryTimeUntil && (
              <div className="summary-detail-row summary-detail-row-border">
                <span className="text-sm text-muted summary-detail-key">Lieferung</span>
                <span className="text-sm font-bold summary-detail-val">
                  {/^bis\b/i.test(tariff.deliveryTimeUntil) ? tariff.deliveryTimeUntil : `bis ${tariff.deliveryTimeUntil}`} Uhr
                </span>
              </div>
            )}
            {tariff.trackingAvailable != null && (
              <div className="summary-detail-row summary-detail-row-border">
                <span className="text-sm text-muted summary-detail-key">Sendungsverfolgung</span>
                <span className="text-sm font-bold summary-detail-val">{tariff.trackingAvailable ? "Inklusive" : "Nicht verfügbar"}</span>
              </div>
            )}
            {tariff.hasPickupSurcharge === true && (
              <div className="booking-price-detail">Abholzuschlag im Tarif berücksichtigt.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
