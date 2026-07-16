import React from "react";
import { money } from "../../utils/formatters";

// Preisaufschlüsselung im Bestätigungsschritt — REINE DARSTELLUNG. Alle Beträge
// stammen aus dem zentralen Price-View-Model (bookingPriceView) — dieselbe Quelle
// wie Live-Leiste und Versicherungskarten. Keine clientseitige Berechnung, keine
// MwSt./Marge auf die Versicherung. Solange kein Preis bestätigt ist (Repricing,
// stale, Fehler, Warenwert fehlt), wird KEIN Gesamtbetrag als final dargestellt.
export function PriceSummaryModule({ priceView, paymentTerm }) {
  const v = priceView || {};
  const confirmed = v.hasConfirmedPrice === true;
  const hasInsurance = Number(v.insuranceGross) > 0;

  const pendingNote =
    v.hasError                    ? "Der Versicherungspreis konnte nicht bestätigt werden. Bitte versuchen Sie es erneut." :
    (v.isRepricing || v.isStale)  ? "Preis wird aktualisiert …" :
    "Bitte geben Sie den Warenwert an, um den Versicherungspreis zu bestätigen.";

  return (
    <>
      {confirmed ? (
        <>
          <div className="booking-confirm-row">
            <span className="text-sm text-muted">Versand netto</span>
            <span className="text-sm font-bold booking-confirm-val">{money(v.shippingNet)}</span>
          </div>
          <div className="booking-confirm-row">
            <span className="text-sm text-muted">
              Transportversicherung{hasInsurance && <span className="booking-tax-chip">steuerfrei</span>}
            </span>
            <span className="text-sm font-bold booking-confirm-val">{money(v.insuranceGross)}</span>
          </div>
          <div className="booking-confirm-row mb-16">
            <span className="text-sm text-muted">MwSt. 19 %</span>
            <span className="text-sm font-bold booking-confirm-val">{money(v.shippingVat)}</span>
          </div>
          <div className="booking-total-row">
            <span className="booking-total-label">Gesamtbetrag brutto</span>
            <span className="booking-total-amount">{money(v.totalGross)}</span>
          </div>
        </>
      ) : (
        <div className={`booking-price-pending${v.hasError ? " booking-price-pending--error" : ""}`} role="status" aria-live="polite">
          {(v.isRepricing || v.isStale) && <span className="spinner spinner-dark" />}
          <span>{pendingNote}</span>
        </div>
      )}
      <p className="booking-payment-note">
        inkl. 19 % MwSt. auf Versand · Zahlung auf Rechnung · zahlbar innerhalb von {paymentTerm} Tagen
      </p>
    </>
  );
}
