import React from "react";
import { money } from "../../utils/formatters";
import { paymentTermSentence } from "../../utils/paymentTerm.mjs";
import { isInsuredType } from "../../utils/bookingPriceView.mjs";
import { INSURANCE_TYPE_TRANSIT_COVER } from "../../utils/coverInsuranceView.mjs";
import { COVER_INSURANCE_TEXT } from "../../utils/insuranceTerms.mjs";
import { PRICE_CHANGED_SUMMARY } from "../../utils/bookingSummaryView.mjs";
import { priceSummaryComponents } from "../../utils/priceComponentsView.mjs";

// Ein fehlender Betrag erscheint als Gedankenstrich — `money(null)` ergäbe „0,00 €", also
// einen erfundenen Nullbetrag in der verbindlichen Aufstellung.
const betragOderStrich = (w) => (w == null ? "—" : money(w));

// Der Satz steht hier als drittes Glied einer Aufzählung und beginnt deshalb klein. Nur der
// ERSTE Buchstabe wird herabgesetzt — ein volles toLowerCase() zerstörte im Deutschen die
// Substantivgroßschreibung („7 tagen rein netto nach rechnungserhalt").
const lowerFirst = (s) => (typeof s === "string" && s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

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
//
// Zusätzliche Transportabsicherung (Deckungsbetragsmodell): eigene, neutrale Bezeichnung
// und zusätzlich versicherter Betrag und Selbstbeteiligung — beide ausschließlich aus der
// bestätigten Neubepreisung. Keine Stufenbegriffe.
export function PriceSummaryModule({ priceView, paymentTerm, voucherLines }) {
  const v = priceView || {};
  const confirmed = v.hasConfirmedPrice === true;
  // TG22 Golden Offer Contract: nach einer gemeldeten Preisänderung gilt kein Betrag —
  // auch nicht der Versandpreis des Angebots. Die Aufstellung zeigt dann Striche und sagt,
  // warum; sie nennt den alten Preis nicht mehr, als gälte er noch.
  const changed = v.isPriceChanged === true;
  const insured = isInsuredType(v.selectedInsuranceType);
  const cover = v.selectedInsuranceType === INSURANCE_TYPE_TRANSIT_COVER;
  const hasInsuranceAmount = Number(v.insuranceGross) > 0;
  const insLabel = v.selectedInsuranceType === "premium" ? "Premiumversicherung" : "Standardversicherung";

  // Versandwerte: bestätigt aus den Server-Totals, sonst aus dem immer verfügbaren
  // Basistarif — beide sind derselbe Versandpreis, nur die Quelle unterscheidet sich.
  const shipNet   = changed ? null : confirmed ? v.shippingNet   : v.baseShippingNet;
  const shipVat   = changed ? null : confirmed ? v.shippingVat   : v.baseShippingVat;
  const shipGross = changed ? null : confirmed ? v.shippingGross  : v.baseShippingGross;

  // Versicherungszeile im UNBESTÄTIGTEN Zustand (nur bei versicherter Auswahl) — oder der
  // Hinweis auf die offene Preisänderung, der jeden anderen Zustand verdrängt.
  let insState = null;
  if (changed) {
    insState = { kind: "error", text: PRICE_CHANGED_SUMMARY, id: "booking-price-changed-state" };
  } else if (!confirmed && insured && cover) {
    if (v.hasError)                     insState = { kind: "error",   text: COVER_INSURANCE_TEXT.summaryError };
    else if (v.isRepricing || v.isStale) insState = { kind: "loading", text: COVER_INSURANCE_TEXT.summaryLoading };
    else                                 insState = { kind: "unknown", text: COVER_INSURANCE_TEXT.summaryUnknown };
  } else if (!confirmed && insured) {
    if (v.hasError)                     insState = { kind: "error",     text: "Versicherungspreis konnte nicht bestätigt werden." };
    else if (v.isRepricing || v.isStale) insState = { kind: "loading",   text: "Versicherungspreis wird aktualisiert …" };
    else if (v.hasInsurancePreselect)    insState = { kind: "preselect", text: `${insLabel} ab ${money(v.selectedInsurancePreselectGross)}`, taxfree: true };
    else                                 insState = { kind: "unknown",   text: "Versicherungspreis nach Warenwert" };
  }

  // TG22 Residential: trägt der BESTÄTIGTE Preis Serverbestandteile (Versand, Zuschlag Privatadresse,
  // zusätzliche Transportabsicherung), treten sie an die Stelle der Sammelzeilen — steuerpflichtige
  // netto, steuerfreie brutto, die MwSt. und der Gesamtbetrag unverändert aus den Server-Totals.
  // Passen die Bestandteile nicht zum bestätigten Preis, bleibt die bisherige Aufstellung.
  const bestandteile = priceSummaryComponents(v);

  return (
    <>
      {bestandteile ? bestandteile.taxable.map((k) => (
        <div className="booking-confirm-row" key={k.type} data-component={k.type}>
          <span className="text-sm text-muted">{k.label} netto</span>
          <span className="text-sm font-bold booking-confirm-val">{money(k.net)}</span>
        </div>
      )) : (
        <div className="booking-confirm-row">
          <span className="text-sm text-muted">Versand netto</span>
          <span className="text-sm font-bold booking-confirm-val">{betragOderStrich(shipNet)}</span>
        </div>
      )}
      <div className="booking-confirm-row">
        <span className="text-sm text-muted">MwSt. 19 %</span>
        <span className="text-sm font-bold booking-confirm-val">{betragOderStrich(shipVat)}</span>
      </div>

      {confirmed ? (
        <>
          {bestandteile ? bestandteile.taxFree.map((k) => (
            <div className="booking-confirm-row" key={k.type} data-component={k.type}>
              <span className="text-sm text-muted">
                {k.label}<span className="booking-tax-chip">steuerfrei</span>
              </span>
              <span className="text-sm font-bold booking-confirm-val">{money(k.gross)}</span>
            </div>
          )) : hasInsuranceAmount && (
            <div className="booking-confirm-row">
              <span className="text-sm text-muted">
                {cover ? COVER_INSURANCE_TEXT.sectionTitle : "Transportversicherung"}<span className="booking-tax-chip">steuerfrei</span>
              </span>
              <span className="text-sm font-bold booking-confirm-val">{money(v.insuranceGross)}</span>
            </div>
          )}
          {hasInsuranceAmount && cover && v.coverInsuredAmount != null && (
            <div className="booking-confirm-row">
              <span className="text-sm text-muted">{COVER_INSURANCE_TEXT.insuredAmountLabel}</span>
              <span className="text-sm font-bold booking-confirm-val">{money(v.coverInsuredAmount)}</span>
            </div>
          )}
          {hasInsuranceAmount && cover && v.coverExcessValue != null && (
            <div className="booking-confirm-row">
              <span className="text-sm text-muted">{COVER_INSURANCE_TEXT.excessLabel}</span>
              <span className="text-sm font-bold booking-confirm-val">{money(v.coverExcessValue)}</span>
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
            <span className="text-sm font-bold booking-confirm-val">{betragOderStrich(shipGross)}</span>
          </div>
          {insState && (
            <div
              className={`booking-ins-state booking-ins-state--${insState.kind}`}
              id={insState.id}
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
          {insured && !changed && (
            <p className="booking-total-pending" role="note">
              {cover
                ? COVER_INSURANCE_TEXT.summaryPending
                : "Der Gesamtbetrag wird angezeigt, sobald der Versicherungspreis bestätigt ist."}
            </p>
          )}
        </>
      )}

      <p className="booking-payment-note">
        inkl. 19 % MwSt. auf Versand · Zahlung auf Rechnung · {lowerFirst(paymentTermSentence(paymentTerm))}
      </p>
    </>
  );
}
