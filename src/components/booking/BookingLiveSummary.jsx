import React from "react";
import { Icon } from "../ui/Icon";
import { money, isoDayDE } from "../../utils/formatters";
import { publicCarrierDisplay, publicServiceName, publicDropoffLabel } from "../../utils/carrierMap";
import { isInsuredType } from "../../utils/bookingPriceView.mjs";
import { INSURANCE_TYPE_TRANSIT_COVER } from "../../utils/coverInsuranceView.mjs";
import { COVER_INSURANCE_TEXT } from "../../utils/insuranceTerms.mjs";
import { handoverInfo, deliveryInfo, priceInfo, PRICE_CHANGED_HINT } from "../../utils/bookingSummaryView.mjs";
import { pickupSummaryOf } from "../../utils/pickupContractView.mjs";

// Permanente Live-Zusammenfassungsleiste — REINE DARSTELLUNG, sichtbar in Schritt 1
// und 2. Vier Zonen: Versandprodukt · Übergabe · Zustellung · aktueller Preis. Alle
// Werte kommen aus BELEGTEN, providerneutralen Feldern bzw. dem zentralen
// Price-View-Model — keine JUMiNGO-Rohfelder, keine lokale Preisberechnung.
//
// TG22 Golden Offer Contract: Übergabe, Zustellung und Preis stammen aus DENSELBEN
// Helfern wie Sticky-Leiste und ausgewähltes Angebot (bookingSummaryView,
// pickupContractView). Vorher leitete jede der drei Flächen selbst ab — und die
// Beschriftungen und Beträge liefen auseinander.
export function BookingLiveSummary({ tariff, priceView, pickupWindow }) {
  if (!tariff) return null;
  const { name: carrierName, logo: carrierLogo } = publicCarrierDisplay(tariff);
  const handover = handoverInfo(tariff);

  // ── Übergabe ──
  // Providerneutraler Paketshop-TYP (kein gebundener konkreter Shop — der
  // Dropoff-Guard bindet keine Access-Point-ID); daher zusätzlich „frei wählbar".
  const shopLabel = handover.isDropoff ? (publicDropoffLabel(tariff) || "Paketshop") : null;
  // Tag und Zeit aus dem gemeinsamen Abholvertrag: das gewählte Fenster (nur, wo das Angebot
  // ein Fenster trägt) → das Carrier-Fenster → die reine „bereit ab"-Zeit. Die letzte Stufe
  // wird NIE zu einem Fenster ergänzt. Die Zeit gehört ausschließlich zur Abholung.
  const abholung = pickupSummaryOf(tariff, pickupWindow);
  const handoverDate = abholung.day ? isoDayDE(abholung.day) : null;
  const win = handover.isPickup ? abholung.time : null;

  // ── Zustellung ──
  const zustellung = deliveryInfo(tariff);

  // ── Preis (aus dem View-Model) ──
  const v = priceView || {};
  const preis = priceInfo(v);
  const insured = isInsuredType(v.selectedInsuranceType);
  const cover = v.selectedInsuranceType === INSURANCE_TYPE_TRANSIT_COVER;

  // Sekundärzeile, solange KEIN Gesamtpreis bestätigt ist: der Versicherungszustand — oder,
  // nach einer gemeldeten Preisänderung, dass der bisherige Preis nicht mehr gilt. Ein
  // „ab"-Betrag wird nie addiert. Die zusätzliche Transportabsicherung hat keinen „ab"-Preis —
  // ihr Preis entsteht erst mit den Angaben des Kunden, und die Texte nennen keine Stufe.
  let insNote = null, insNoteError = false, insNoteLoading = false;
  if (preis.changed) {
    insNote = PRICE_CHANGED_HINT; insNoteError = true;
  } else if (!preis.confirmed && insured && cover) {
    if (v.hasError)                      { insNote = COVER_INSURANCE_TEXT.liveError; insNoteError = true; }
    else if (v.isRepricing || v.isStale) { insNote = COVER_INSURANCE_TEXT.liveLoading; insNoteLoading = true; }
    else                                 { insNote = COVER_INSURANCE_TEXT.liveUnknown; }
  } else if (!preis.confirmed && insured) {
    if (v.hasError)                      { insNote = "Versicherungspreis nicht bestätigt"; insNoteError = true; }
    else if (v.isRepricing || v.isStale) { insNote = "Versicherung wird berechnet …";     insNoteLoading = true; }
    else if (v.hasInsurancePreselect)    { insNote = `Versicherung ab ${money(v.selectedInsurancePreselectGross)}`; }
    else                                 { insNote = "Versicherungspreis nach Warenwert"; }
  }

  return (
    <div className="booking-livesum" aria-label="Zusammenfassung Ihrer Sendung">
      {/* Zone 1 — Versandprodukt */}
      <div className="blsum-zone blsum-product">
        {/* Wie in der Angebotskarte: Logo oder neutrales Paket-Icon — nie ein leeres
            Element, damit die Zeile bei unbekanntem Carrier nicht springt. */}
        {carrierLogo
          ? <img src={carrierLogo} alt="" aria-hidden="true" className="blsum-logo" />
          : <span className="blsum-logo blsum-logo--generic" aria-hidden="true"><Icon n="package" s={20} c="currentColor" /></span>}
        <span className="blsum-product-txt">
          <span className="blsum-carrier">{carrierName}</span>
          <span className="blsum-service">{publicServiceName(tariff)}</span>
        </span>
      </div>

      {/* Zone 2 — Übergabe */}
      <div className="blsum-zone blsum-handover">
        <span className="blsum-label">{handover.label}</span>
        {shopLabel && <span className="blsum-val">{shopLabel}</span>}
        {handover.isDropoff && <span className="blsum-sub">frei wählbar</span>}
        {handoverDate && <span className="blsum-val">{handoverDate}</span>}
        {win && <span className="blsum-sub">{win}</span>}
        {!shopLabel && !handoverDate && !win && !handover.isDropoff && <span className="blsum-sub">nach Auswahl</span>}
      </div>

      {/* Zone 3 — Zustellung */}
      <div className="blsum-zone blsum-delivery">
        <span className="blsum-label">{zustellung.label}</span>
        <span className="blsum-val">{zustellung.value}</span>
        {zustellung.until && <span className="blsum-sub">{zustellung.until} Uhr</span>}
      </div>

      {/* Zone 4 — Preis: „Gesamt" bei bestätigtem Preis, sonst „Versand" (+ Zustandshinweis);
          nach einer gemeldeten Preisänderung ohne Betrag. Label und Beträge aus priceInfo. */}
      <div className="blsum-zone blsum-price" aria-live="polite">
        <span className="blsum-price-label">{preis.label}</span>
        <span className="blsum-price-box">
          <span className="blsum-price-gross">
            {preis.gross != null ? money(preis.gross) : "—"}
            <span className="blsum-price-unit"> brutto</span>
          </span>
          {preis.net != null && <span className="blsum-price-net">{money(preis.net)} netto</span>}
        </span>
        {insNote && (
          <span className={`blsum-ins-note${insNoteError ? " blsum-ins-note--error" : ""}`}>
            {insNoteLoading && <span className="spinner spinner-dark" />}
            {insNote}
          </span>
        )}
      </div>
    </div>
  );
}
