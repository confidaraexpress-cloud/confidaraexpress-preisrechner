import React from "react";
import { money, isoDayDE } from "../../utils/formatters";
import { publicCarrierDisplay, publicServiceName, publicDropoffLabel } from "../../utils/carrierMap";

// Permanente Live-Zusammenfassungsleiste — REINE DARSTELLUNG, sichtbar in Schritt 1
// und 2. Vier Zonen: Versandprodukt · Übergabe · Zustellung · aktueller Preis. Alle
// Werte kommen aus BELEGTEN, providerneutralen Feldern (carrierMap-Helfer + Tarif)
// bzw. dem zentralen Price-View-Model — keine JUMiNGO-Rohfelder, keine lokale
// Preisberechnung. Der Preis rechts spiegelt exakt dieselbe Quelle wie die
// Preiszusammenfassung und die Versicherungskarten.
export function BookingLiveSummary({ tariff, priceView, pickupWindow }) {
  if (!tariff) return null;
  const { name: carrierName, logo: carrierLogo } = publicCarrierDisplay(tariff);
  const isPickup  = tariff.serviceType === "pickup";
  const isDropoff = tariff.serviceType === "dropoff";

  // ── Übergabe ──
  const handoverLabel = isPickup ? "Abholung" : isDropoff ? "Shopabgabe" : "Übergabe";
  // Providerneutraler Paketshop-TYP (kein gebundener konkreter Shop — der
  // Dropoff-Guard bindet keine Access-Point-ID); daher zusätzlich „frei wählbar".
  const shopLabel = isDropoff ? (publicDropoffLabel(tariff) || "Paketshop") : null;
  const handoverDate = tariff.pickupDate ? isoDayDE(tariff.pickupDate) : null;
  // Gewähltes Abholzeitfenster (nur Pickup) hat Vorrang; sonst das Carrier-Fenster.
  const win = (isPickup && pickupWindow && pickupWindow.from && pickupWindow.until)
    ? `${pickupWindow.from}–${pickupWindow.until} Uhr`
    : (isPickup && tariff.pickupTimeFrom && tariff.pickupTimeUntil)
      ? `${tariff.pickupTimeFrom}–${tariff.pickupTimeUntil} Uhr`
      : null;

  // ── Zustellung ──
  const deliveryRange = (tariff.deliveryDateMin && tariff.deliveryDateMax && tariff.deliveryDateMin !== tariff.deliveryDateMax)
    ? `${isoDayDE(tariff.deliveryDateMin)} – ${isoDayDE(tariff.deliveryDateMax)}` : null;
  const deliverySingle = !deliveryRange
    ? (tariff.deliveryDateMin || tariff.deliveryDate ? isoDayDE(tariff.deliveryDateMin || tariff.deliveryDate) : null)
    : null;
  const deliveryText = (typeof tariff.deliveryTime === "string" && tariff.deliveryTime.trim()) ? tariff.deliveryTime.trim() : null;
  const deliveryValue = deliveryRange || deliverySingle || deliveryText || "Auf Anfrage";
  const deliveryUntil = tariff.deliveryTimeUntil
    ? (/^bis\b/i.test(tariff.deliveryTimeUntil) ? tariff.deliveryTimeUntil : `bis ${tariff.deliveryTimeUntil}`)
    : null;

  // ── Preis (aus dem View-Model) ──
  const v = priceView || {};
  const confirmed = v.hasConfirmedPrice === true;

  return (
    <div className="booking-livesum" aria-label="Zusammenfassung Ihrer Sendung">
      {/* Zone 1 — Versandprodukt */}
      <div className="blsum-zone blsum-product">
        {carrierLogo && <img src={carrierLogo} alt="" aria-hidden="true" className="blsum-logo" />}
        <span className="blsum-product-txt">
          <span className="blsum-carrier">{carrierName}</span>
          <span className="blsum-service">{publicServiceName(tariff)}</span>
        </span>
      </div>

      {/* Zone 2 — Übergabe */}
      <div className="blsum-zone blsum-handover">
        <span className="blsum-label">{handoverLabel}</span>
        {shopLabel && <span className="blsum-val">{shopLabel}</span>}
        {isDropoff && <span className="blsum-sub">frei wählbar</span>}
        {handoverDate && <span className="blsum-val">{handoverDate}</span>}
        {win && <span className="blsum-sub">{win}</span>}
        {!shopLabel && !handoverDate && !win && !isDropoff && <span className="blsum-sub">nach Auswahl</span>}
      </div>

      {/* Zone 3 — Zustellung */}
      <div className="blsum-zone blsum-delivery">
        <span className="blsum-label">Zustellung</span>
        <span className="blsum-val">{deliveryValue}</span>
        {deliveryUntil && <span className="blsum-sub">{deliveryUntil} Uhr</span>}
      </div>

      {/* Zone 4 — Aktueller Preis */}
      <div className="blsum-zone blsum-price" aria-live="polite">
        <span className="blsum-price-label">Aktueller Preis</span>
        {confirmed ? (
          <span className="blsum-price-box">
            {v.totalNet != null && <span className="blsum-price-net">{money(v.totalNet)} netto</span>}
            <span className="blsum-price-gross">{money(v.totalGross)} brutto</span>
          </span>
        ) : v.hasError ? (
          <span className="blsum-price-note blsum-price-note--error">Preis konnte nicht bestätigt werden</span>
        ) : (v.isRepricing || v.isStale) ? (
          <span className="blsum-price-note"><span className="spinner spinner-dark" /> Preis wird aktualisiert …</span>
        ) : (
          <span className="blsum-price-note">Preis nach Warenwert</span>
        )}
      </div>
    </div>
  );
}
