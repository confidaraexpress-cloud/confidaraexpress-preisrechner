import React from "react";
import { money } from "../../utils/formatters";

// Preisaufschlüsselung im Bestätigungsschritt — REINE DARSTELLUNG. Alle Beträge
// stammen aus dem zentralen Price-View-Model (bookingPriceView) — dieselbe Quelle
// wie Live-Leiste und Versicherungskarten. Keine clientseitige Berechnung, keine
// MwSt./Marge auf die Versicherung.
//
// Der Versandpreis ist IMMER sichtbar (auch bevor die Versicherung bestätigt ist).
// Ein „ab"-Preselect wird NIE zu einem Gesamtbetrag addiert: solange kein Preis
// bestätigt ist (Standard/Premium ohne Warenwert, Repricing, stale, Fehler), wird
// KEIN Gesamtbetrag dargestellt — nur der belegte Versandpreis plus ein Hinweis
// zum Versicherungszustand.
// `voucherLines` ist null, solange kein Gutschein bestätigt ist — dann bleibt die Darstellung
// EXAKT wie bisher (ein Gesamtbetrag). Mit bestätigtem Gutschein treten Zwischensumme,
// Rabattzeile und „Zu zahlen" an die Stelle des Gesamtbetrags. Die Werte kommen fertig aus der
// serverbestätigten Antwort — hier wird nichts gerechnet und nichts abgezogen.
export function PriceSummaryModule({ priceView, paymentTerm, voucherLines }) {
  const v = priceView || {};
  const confirmed = v.hasConfirmedPrice === true;
  const insured = v.selectedInsuranceType === "standard" || v.selectedInsuranceType === "premium";
  const hasInsuranceAmount = Number(v.insuranceGross) > 0;
  const insLabel = v.selectedInsuranceType === "premium" ? "Premiumversicherung" : "Standardversicherung";

  // Versandwerte: bestätigt aus den Server-Totals, sonst aus dem immer verfügbaren
  // Basistarif — beide sind derselbe Versandpreis, nur die Quelle unterscheidet sich.
  const shipNet   = confirmed ? v.shippingNet   : v.baseShippingNet;
  const shipVat   = confirmed ? v.shippingVat   : v.baseShippingVat;
  const shipGross = confirmed ? v.shippingGross  : v.baseShippingGross;

  // Versicherungszeile im UNBESTÄTIGTEN Zustand (nur bei versicherter Auswahl).
  let insState = null;
  if (!confirmed && insured) {
    if (v.hasError)                     insState = { kind: "error",     text: "Versicherungspreis konnte nicht bestätigt werden." };
    else if (v.isRepricing || v.isStale) insState = { kind: "loading",   text: "Versicherungspreis wird aktualisiert …" };
    else if (v.hasInsurancePreselect)    insState = { kind: "preselect", text: `${insLabel} ab ${money(v.selectedInsurancePreselectGross)}`, taxfree: true };
    else                                 insState = { kind: "unknown",   text: "Versicherungspreis nach Warenwert" };
  }

  return (
    <>
      <div className="booking-confirm-row">
        <span className="text-sm text-muted">Versand netto</span>
        <span className="text-sm font-bold booking-confirm-val">{money(shipNet)}</span>
      </div>
      <div className="booking-confirm-row">
        <span className="text-sm text-muted">MwSt. 19 %</span>
        <span className="text-sm font-bold booking-confirm-val">{money(shipVat)}</span>
      </div>

      {confirmed ? (
        <>
          {hasInsuranceAmount && (
            <div className="booking-confirm-row">
              <span className="text-sm text-muted">
                Transportversicherung<span className="booking-tax-chip">steuerfrei</span>
              </span>
              <span className="text-sm font-bold booking-confirm-val">{money(v.insuranceGross)}</span>
            </div>
          )}
          {voucherLines && voucherLines.hasVoucher ? (
            <>
              <div className="booking-total-row mt-8">
                <span className="booking-total-label">Zwischensumme</span>
                <span className="text-sm font-bold booking-confirm-val">{money(voucherLines.subtotalGross)}</span>
              </div>
              <div className="booking-discount-row">
                <span className="booking-discount-label">
                  Gutschein {voucherLines.code}
                  {Number.isFinite(voucherLines.percent) ? ` · ${voucherLines.percent} %` : ""}
                </span>
                {/* Minuszeichen gehört zur Darstellung des Rabatts; der Betrag selbst kommt
                    unverändert aus der Serverantwort. */}
                <span className="booking-discount-val">−{money(voucherLines.discountGross)}</span>
              </div>
              <div className="booking-total-row mt-8">
                <span className="booking-total-label">Zu zahlen</span>
                <span className="booking-total-amount">{money(voucherLines.finalGross)}</span>
              </div>
            </>
          ) : (
            <div className="booking-total-row mt-8">
              <span className="booking-total-label">Gesamtbetrag brutto</span>
              <span className="booking-total-amount">{money(v.totalGross)}</span>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="booking-confirm-row">
            <span className="text-sm text-muted">Versand brutto</span>
            <span className="text-sm font-bold booking-confirm-val">{money(shipGross)}</span>
          </div>
          {insState && (
            <div
              className={`booking-ins-state booking-ins-state--${insState.kind}`}
              role="status"
              aria-live="polite"
            >
              {insState.kind === "loading" && <span className="spinner spinner-dark" />}
              <span className="booking-ins-state-txt">
                {insState.text}
                {insState.taxfree && <span className="booking-tax-chip">steuerfrei</span>}
              </span>
            </div>
          )}
          {insured && (
            <p className="booking-total-pending" role="note">
              Der Gesamtbetrag wird angezeigt, sobald der Versicherungspreis bestätigt ist.
            </p>
          )}
        </>
      )}

      <p className="booking-payment-note">
        inkl. 19 % MwSt. auf Versand · Zahlung auf Rechnung · zahlbar innerhalb von {paymentTerm} Tagen
      </p>
    </>
  );
}
