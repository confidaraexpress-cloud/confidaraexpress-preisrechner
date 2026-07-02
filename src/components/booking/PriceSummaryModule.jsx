import React from "react";
import { money } from "../../utils/formatters";

// Preisaufschlüsselung im Bestätigungsschritt — REINE DARSTELLUNG. Werte
// ausschließlich aus der Reprice-Response (rt) bzw. dem Tarif; keine
// clientseitige Berechnung, keine MwSt./Marge auf Versicherung. Unverändert
// aus BookingPage extrahiert.
export function PriceSummaryModule({ showRepriceTotals, rt, tariff, paymentTerm }) {
  return (
    <>
      {showRepriceTotals ? (
        <>
          <div className="booking-confirm-row">
            <span className="text-sm text-muted">Versand (brutto)</span>
            <span className="text-sm font-bold booking-confirm-val">{money(rt.customerShippingGross)}</span>
          </div>
          <div className="booking-confirm-subrow">
            <span className="booking-confirm-subnote">
              Netto {money(rt.customerShippingNet)} · MwSt. 19 % {money(rt.shippingVat)}
            </span>
          </div>
          <div className="booking-confirm-row mb-16">
            <span className="text-sm text-muted">
              Zusatzversicherung <span className="booking-tax-chip">steuerfrei</span>
            </span>
            <span className="text-sm font-bold booking-confirm-val">{money(rt.insuranceGross)}</span>
          </div>
          <div className="booking-total-row">
            <span className="booking-total-label">Gesamtbetrag</span>
            <span className="booking-total-amount">{money(rt.customerTotalGross)}</span>
          </div>
        </>
      ) : (
        <>
          {tariff.netPrice != null && (
            <div className="booking-confirm-row">
              <span className="text-sm text-muted">Nettobetrag</span>
              <span className="text-sm font-bold booking-confirm-val">{money(tariff.netPrice)}</span>
            </div>
          )}
          {tariff.vatAmount != null && (
            <div className="booking-confirm-row">
              <span className="text-sm text-muted">MwSt. 19%</span>
              <span className="text-sm font-bold booking-confirm-val">{money(tariff.vatAmount)}</span>
            </div>
          )}
          <div className="booking-total-row">
            <span className="booking-total-label">Gesamtbetrag brutto</span>
            <span className="booking-total-amount">{money(tariff.finalPrice)}</span>
          </div>
        </>
      )}
      <p className="booking-payment-note">
        inkl. 19 % MwSt. auf Versand · Zahlung: {paymentTerm} Tage auf Rechnung
      </p>
    </>
  );
}
