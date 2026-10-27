import React from "react";
import { Icon } from "../ui/Icon";
import { publicCarrierDisplay, publicServiceName } from "../../utils/carrierMap";
import { handoverInfo, priceInfo } from "../../utils/bookingSummaryView.mjs";
import { sameDayUntilText } from "../../utils/sameDayCollectionView.mjs";

// Step 1 — „Ausgewähltes Angebot“ (Betreiberentscheidung G6/M9, 2026-10-27).
//
// Preis, Übergabe und Zustellung stehen auf der Buchungsseite an GENAU EINER Stelle: im Beleg — der
// Live-Zusammenfassung (ab 1440 px die Seitenspalte, schmaler über dem Blatt) samt klebender Kurzleiste beim
// Scrollen. Bis 2026-10-27 wiederholte diese Karte Preis, Zustellung und Abholung direkt daneben (Audit M9).
//
// Hier steht deshalb nur, was den Beleg ergänzt: welches Angebot gewählt ist (Carrier, Dienst, Übergabeart) und
// die Bedingungen, die sonst nirgends stehen — „Drucker erforderlich“, bis wann die Abholung heute möglich ist,
// und dass ein Preis fehlt. Der MwSt.-Hinweis steht seitdem am Preis im Beleg (vatIncludedNote). Keine Angabe
// entfällt, keine Logik, keine Neuberechnung — dieselben Helfer wie zuvor.
export function OfferSummaryModule({ tariff, priceView }) {
  const { name: carrierName, logo: carrierLogo } = publicCarrierDisplay(tariff);
  const handover = handoverInfo(tariff);
  const serviceMode = handover.isPickup || handover.isDropoff ? handover.label : null;
  const printerRequired = tariff.printerRequired === true;
  // TG22 Same-Day: bis wann die Abholung heute möglich ist — vom Server.
  const sameDayBis = sameDayUntilText(tariff);
  const preis = priceInfo(priceView);
  // Nach einer gemeldeten Preisänderung sagt der Beleg „Nicht mehr aktuell“; hier steht nur der Fall ohne Betrag.
  const preisFehlt = preis.net == null && preis.gross == null && !preis.changed;

  return (
    <div className="calc-panel mb-16 offsum--kompakt">
      <div className="calc-panel-header"><h3>Ausgewähltes Angebot</h3></div>
      <div className="calc-panel-body">
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
        </div>

        {(printerRequired || sameDayBis || preisFehlt) && (
          <div className="offsum-meta">
            {preisFehlt && <span className="offsum-flag offsum-price-na" role="note">Preis fehlt</span>}
            {printerRequired && (
              <span className="offsum-flag" role="note">
                Drucker erforderlich
              </span>
            )}
            {sameDayBis && (
              <span className="offsum-flag" id="offer-summary-sameday-until" role="note">
                {sameDayBis}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
