import React from "react";
import { Icon } from "../ui/Icon";
import { money, isoDayDE } from "../../utils/formatters";
import { publicCarrierDisplay, publicServiceName } from "../../utils/carrierMap";

// Step 1 — „Ausgewähltes Angebot". Kompakte, ruhige Zusammenfassung des gewählten
// Tarifs in drei Zonen: Identität (Carrier/Service) · Laufzeit & relevante
// Bedingungen · Preis. REINE DARSTELLUNG — keine Logik, keine Neuberechnung; alle
// Werte kommen unverändert aus dem Tarif (money()/isoDayDE() nur zur Formatierung).
// Bewusst NICHT hier: Sendungsverfolgung und Abholzuschlag-Hinweis (redundant),
// dominante MwSt.-Betragszeile (durch kompakten Hinweis ersetzt) sowie die
// doppelte Lieferzeit-/Serviceart-Darstellung.
export function OfferSummaryModule({ tariff }) {
  const { name: carrierName, logo: carrierLogo } = publicCarrierDisplay(tariff);
  const serviceMode =
    tariff.serviceType === "pickup"  ? "Abholung"   :
    tariff.serviceType === "dropoff" ? "Shopabgabe" : null;

  // Laufzeit/Liefertermin — EINE primäre Darstellung: konkrete Zustelldaten haben
  // Vorrang vor der Freitext-Laufzeit; Fallback „Auf Anfrage" (nie leer).
  const deliveryRange = (tariff.deliveryDateMin && tariff.deliveryDateMax)
    ? `${isoDayDE(tariff.deliveryDateMin)} – ${isoDayDE(tariff.deliveryDateMax)}` : null;
  const deliveryDate  = !deliveryRange && tariff.deliveryDate ? isoDayDE(tariff.deliveryDate) : null;
  const deliveryText  = (typeof tariff.deliveryTime === "string" && tariff.deliveryTime.trim())
    ? tariff.deliveryTime.trim() : null;
  const deliveryValue = deliveryRange || deliveryDate || deliveryText || "Auf Anfrage";
  const deliveryLabel = (deliveryRange || deliveryDate) ? "Lieferung" : "Laufzeit";

  // Abholtermin/-fenster — nur wenn tatsächlich vorhanden (handlungsrelevant).
  const pickupWindow = (tariff.pickupTimeFrom && tariff.pickupTimeUntil)
    ? `${tariff.pickupTimeFrom}–${tariff.pickupTimeUntil} Uhr` : null;
  const pickupDate   = tariff.pickupDate ? isoDayDE(tariff.pickupDate) : null;
  const pickupValue  = [pickupDate, pickupWindow].filter(Boolean).join(" · ") || null;

  // Garantierte Zustellung bis Uhrzeit — nur bei echter Zeitangabe.
  const deliveryUntil = tariff.deliveryTimeUntil
    ? (/^bis\b/i.test(tariff.deliveryTimeUntil) ? tariff.deliveryTimeUntil : `bis ${tariff.deliveryTimeUntil}`)
    : null;

  const printerRequired = tariff.printerRequired === true;
  const hasNet   = tariff.netPrice != null;
  const hasGross = tariff.finalPrice != null;

  return (
    <div className="calc-panel mb-16">
      <div className="calc-panel-header"><Icon n="truck" s={18} c="#1D4ED8" /><h3>Ausgewähltes Angebot</h3></div>
      <div className="calc-panel-body">
        {/* Zone 1 (Identität) links · Zone 3 (Preis) rechts */}
        <div className="offsum-top">
          <div className="offsum-identity">
            <div className="booking-carrier-wrap">
              {carrierLogo && (
                <img src={carrierLogo} alt="" aria-hidden="true" className="booking-carrier-logo" />
              )}
              <span className="booking-carrier-name">{carrierName}</span>
            </div>
            <div className="offsum-service">
              <span className="offsum-service-name">{publicServiceName(tariff)}</span>
              {serviceMode && <span className="offsum-service-mode">{serviceMode}</span>}
            </div>
          </div>

          <div className="offsum-price">
            {hasNet ? (
              <>
                <div className="offsum-price-net">{money(tariff.netPrice)}<span className="offsum-price-unit"> netto</span></div>
                {hasGross ? (
                  <>
                    <div className="offsum-price-gross">{money(tariff.finalPrice)} brutto</div>
                    <div className="offsum-price-vat">inkl. 19 % MwSt.</div>
                  </>
                ) : (
                  <div className="offsum-price-vat">exkl. MwSt.</div>
                )}
              </>
            ) : (
              <div className="offsum-price-na">Preis fehlt</div>
            )}
          </div>
        </div>

        {/* Zone 2 — Laufzeit & relevante Bedingungen (nur vorhandene Angaben) */}
        <div className="offsum-meta">
          <dl className="offsum-facts">
            <div className="offsum-fact">
              <dt>{deliveryLabel}</dt>
              <dd>{deliveryValue}</dd>
            </div>
            {pickupValue && (
              <div className="offsum-fact">
                <dt>Abholung</dt>
                <dd>{pickupValue}</dd>
              </div>
            )}
            {deliveryUntil && (
              <div className="offsum-fact">
                <dt>Zustellung</dt>
                <dd>{deliveryUntil} Uhr</dd>
              </div>
            )}
          </dl>
          {printerRequired && (
            <span className="offsum-flag" role="note">
              <Icon n="printer" s={13} c="currentColor" /> Drucker erforderlich
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
