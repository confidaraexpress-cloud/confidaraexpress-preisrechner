import React from "react";
import { Icon } from "../ui/Icon";
import { money, isoDayDE } from "../../utils/formatters";
import { publicCarrierDisplay, publicServiceName } from "../../utils/carrierMap";
import { handoverInfo, deliveryInfo, priceInfo, PRICE_CHANGED_HINT, surchargeSummaryNote } from "../../utils/bookingSummaryView.mjs";
import { pickupSummaryOf, pickupDayLabel } from "../../utils/pickupContractView.mjs";
import { sameDaySummaryNote, sameDayUntilText } from "../../utils/sameDayCollectionView.mjs";

// Step 1 — „Ausgewähltes Angebot". Kompakte, ruhige Zusammenfassung des gewählten
// Tarifs in drei Zonen: Identität (Carrier/Service) · Zustellung & relevante
// Bedingungen · Preis. REINE DARSTELLUNG — keine Logik, keine Neuberechnung.
//
// TG22 Golden Offer Contract — dieselben Quellen wie Live- und Sticky-Leiste:
//   • Preis      → priceInfo(priceView): „Gesamt" bei bestätigtem Preis, sonst
//                  „Versand", nach einer gemeldeten Preisänderung KEIN Betrag. Bis
//                  hierher las diese Karte tariff.netPrice/finalPrice und zeigte nach
//                  einer bestätigten Absicherung einen anderen Betrag als die Leiste.
//   • Zustellung → deliveryInfo(tariff): dieselbe Beschriftung wie die Angebotskarte.
//   • Abholung   → pickupSummaryOf(tariff, pickupWindow): Fenster ODER „bereit ab".
// Bewusst NICHT hier: Sendungsverfolgung und Abholzuschlag-Hinweis (redundant),
// dominante MwSt.-Betragszeile (durch kompakten Hinweis ersetzt) sowie die
// doppelte Lieferzeit-/Serviceart-Darstellung.
export function OfferSummaryModule({ tariff, priceView, pickupWindow }) {
  const { name: carrierName, logo: carrierLogo } = publicCarrierDisplay(tariff);
  const handover = handoverInfo(tariff);
  const serviceMode = handover.isPickup || handover.isDropoff ? handover.label : null;

  // Zustellung — EINE primäre Darstellung aus dem gemeinsamen Vertrag; die „bis"-Uhrzeit
  // gehört zur selben Aussage und steht deshalb in derselben Zeile.
  const zustellung = deliveryInfo(tariff);

  // Abholtermin — nur wenn tatsächlich vorhanden (handlungsrelevant).
  const abholung = pickupSummaryOf(tariff, pickupWindow);
  const pickupValue = [abholung.day ? isoDayDE(abholung.day) : null, abholung.time]
    .filter(Boolean).join(" · ") || null;

  const printerRequired = tariff.printerRequired === true;

  const preis = priceInfo(priceView);
  const hatBetrag = preis.net != null || preis.gross != null;
  // Die Mehrwertsteuer betrifft nur den Versand. Enthält der bestätigte Gesamtbetrag eine
  // steuerfreie Absicherung, sagt der Hinweis das — ein Text, keine Rechnung.
  const mitAbsicherung = preis.confirmed && Number(priceView?.insuranceGross) > 0;
  // TG22 Residential: ein bestätigter Zuschlag für die Privatadresse steht als eigene Zeile unter dem
  // Preis — Bezeichnung und Betrag aus dem Serverbestandteil.
  const zuschlagHinweis = surchargeSummaryNote(priceView);
  // TG22 Same-Day: der Zuschlag der Abholung am selben Tag und bis wann sie heute möglich ist — vom Server.
  const sameDayHinweis = sameDaySummaryNote(priceView, tariff);
  const sameDayBis = sameDayUntilText(tariff);

  return (
    <div className="calc-panel mb-16">
      <div className="calc-panel-header"><Icon n="truck" s={18} c="var(--ce-color-brand-ink)" /><h3>Ausgewähltes Angebot</h3></div>
      <div className="calc-panel-body">
        {/* Zone 1 (Identität) links · Zone 3 (Preis) rechts */}
        <div className="offsum-top">
          <div className="offsum-identity">
            <div className="booking-carrier-wrap">
              {/* Wie in der Angebotskarte: Logo oder neutrales Paket-Icon. */}
              {carrierLogo ? (
                <img src={carrierLogo} alt="" aria-hidden="true" className="booking-carrier-logo" />
              ) : (
                <span className="booking-carrier-logo booking-carrier-logo--generic" aria-hidden="true">
                  <Icon n="package" s={20} c="currentColor" />
                </span>
              )}
              <span className="booking-carrier-name">{carrierName}</span>
            </div>
            <div className="offsum-service">
              <span className="offsum-service-name">{publicServiceName(tariff)}</span>
              {serviceMode && <span className="offsum-service-mode">{serviceMode}</span>}
            </div>
          </div>

          <div className="offsum-price">
            <div className="offsum-price-label">{preis.label}</div>
            {hatBetrag ? (
              <>
                {preis.net != null && (
                  <div className="offsum-price-net">{money(preis.net)}<span className="offsum-price-unit"> netto</span></div>
                )}
                {preis.gross != null ? (
                  <>
                    <div className="offsum-price-gross">{money(preis.gross)} brutto</div>
                    <div className="offsum-price-vat">{mitAbsicherung ? "inkl. 19 % MwSt. auf Versand" : "inkl. 19 % MwSt."}</div>
                    {zuschlagHinweis && (
                      <div className="offsum-price-vat" id="offer-summary-surcharge-note">{zuschlagHinweis}</div>
                    )}
                    {sameDayHinweis && (
                      <div className="offsum-price-vat" id="offer-summary-sameday-note">{sameDayHinweis}</div>
                    )}
                  </>
                ) : (
                  <div className="offsum-price-vat">exkl. MwSt.</div>
                )}
              </>
            ) : (
              <div className="offsum-price-na">{preis.changed ? PRICE_CHANGED_HINT : "Preis fehlt"}</div>
            )}
          </div>
        </div>

        {/* Zone 2 — Zustellung & relevante Bedingungen (nur vorhandene Angaben) */}
        <div className="offsum-meta">
          <dl className="offsum-facts">
            <div className="offsum-fact">
              <dt>{zustellung.label}</dt>
              <dd>{zustellung.value}{zustellung.until ? ` · ${zustellung.until} Uhr` : ""}</dd>
            </div>
            {pickupValue && (
              <div className="offsum-fact">
                <dt>{pickupDayLabel(abholung, "Abholung")}</dt>
                <dd>{pickupValue}</dd>
              </div>
            )}
          </dl>
          {printerRequired && (
            <span className="offsum-flag" role="note">
              <Icon n="printer" s={13} c="currentColor" /> Drucker erforderlich
            </span>
          )}
          {sameDayBis && (
            <span className="offsum-flag" id="offer-summary-sameday-until" role="note">
              <Icon n="clock" s={13} c="currentColor" /> {sameDayBis}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
