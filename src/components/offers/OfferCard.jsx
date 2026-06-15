import React, { useState } from "react";
import { Icon } from "../ui/Icon";
import { money, fmtDelivery } from "../../utils/formatters";
import { resolveCarrier } from "../../utils/carrierMap";

const fmtDE = (iso) => {
  if (!iso) return "";
  const d = (iso || "").split("T")[0];
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
};

function DetailRow({ label, value, strong }) {
  return (
    <div className={`offer-detail-row${strong ? " offer-detail-row--strong" : ""}`}>
      <span className="offer-detail-label">{label}</span>
      <span className="offer-detail-value">{value}</span>
    </div>
  );
}

function DetailsPanel({ tariff: t }) {
  const hasPrice = t.netPrice != null || t.vatAmount != null || t.finalPrice != null;
  const hasService = t.trackingAvailable != null || t.printerRequired != null || t.serviceType;
  const hasTermin = t.shopName || t.pickupDate || t.pickupTimeFrom || t.deliveryDate;

  return (
    <>
      {hasPrice && (
        <div className="offer-details-section">
          <div className="offer-detail-section-title">Preisaufschlüsselung</div>
          {t.netPrice != null && <DetailRow label="Netto" value={money(t.netPrice)} />}
          {t.vatAmount != null && <DetailRow label="MwSt." value={money(t.vatAmount)} />}
          {t.finalPrice != null && <DetailRow label="Brutto" value={money(t.finalPrice)} strong />}
        </div>
      )}

      {hasService && (
        <div className="offer-details-section">
          <div className="offer-detail-section-title">Leistungsumfang</div>
          {t.serviceType && (
            <DetailRow
              label="Versandart"
              value={t.serviceType === "pickup" ? "Abholung" : t.serviceType === "dropoff" ? "Shopabgabe" : t.serviceType}
            />
          )}
          {t.trackingAvailable != null && (
            <DetailRow label="Sendungsverfolgung" value={t.trackingAvailable ? "Inklusive" : "Nicht verfügbar"} />
          )}
          {t.printerRequired != null && (
            <DetailRow
              label="Drucker"
              value={t.printerRequired ? "Erforderlich (Versandlabel)" : "Nicht erforderlich (QR-Code)"}
            />
          )}
        </div>
      )}

      {hasTermin && (
        <div className="offer-details-section">
          <div className="offer-detail-section-title">Termin &amp; Abholung</div>
          {t.serviceType === "dropoff" && t.shopName && <DetailRow label="Abgabestelle" value={t.shopName} />}
          {t.pickupDate && <DetailRow label="Abholtermin" value={fmtDE(t.pickupDate)} />}
          {t.pickupTimeFrom && t.pickupTimeUntil && (
            <DetailRow label="Zeitfenster" value={`${t.pickupTimeFrom} – ${t.pickupTimeUntil} Uhr`} />
          )}
          {t.deliveryDate && <DetailRow label="Liefertermin" value={fmtDE(t.deliveryDate)} />}
          {t.deliveryTimeUntil && <DetailRow label="Lieferung bis" value={`${t.deliveryTimeUntil} Uhr`} />}
        </div>
      )}
    </>
  );
}

export function OfferCard({ tariff: t, badge, isTop, selected, onSelect, onBook }) {
  const { name: carrierName, logo: carrierLogo } = resolveCarrier(t.carrier);
  const [detailsOpen, setDetailsOpen]       = useState(false);
  const [detailsMounted, setDetailsMounted] = useState(false);

  const toggleDetails = (e) => {
    e.stopPropagation();
    if (!detailsMounted) setDetailsMounted(true);
    setDetailsOpen(o => !o);
  };

  const handleBook = (e) => {
    e.stopPropagation();
    onBook(t);
  };

  const delivery  = fmtDelivery(t);
  const hasStatus = (t.serviceType === "pickup" && t.pickupToday) || t.printerRequired;
  const hasMeta   = (t.serviceType === "dropoff" && t.shopName) ||
                    (t.serviceType === "pickup" && t.pickupDate && !t.pickupToday);
  const hasDate   = t.availableForDate === false || t.deliveryDate || t.pickupTimeFrom;

  return (
    <div
      className={`offer-card${isTop ? " offer-card--top" : ""}${selected ? " offer-card--selected" : ""}`}
      onClick={() => onSelect(t)}
    >
      {isTop && (
        <div className="offer-ribbon" aria-label="Empfohlenes Angebot">
          ★ Top Empfehlung
        </div>
      )}

      <div className="offer-card-inner">
        {/* ── Zone A: Carrier ── */}
        <div className="offer-zone-a">
          <div className="offer-logo-tile">
            {carrierLogo
              ? <img src={carrierLogo} alt={carrierName} width="46" height="46" />
              : <span className="offer-logo-tile-text">{carrierName}</span>
            }
          </div>
          <div>
            <div className="offer-carrier-name">{carrierName}</div>
            <div className="offer-service-type">{t.tariffName}</div>
          </div>
        </div>

        {/* ── Zone B: Chips + Status + Meta + Dates ── */}
        <div className="offer-zone-b">
          <div className="offer-chips">
            {delivery && (
              <span className="offer-chip offer-chip-eta">
                <Icon n="clock" s={13} c="currentColor" /> {delivery}
              </span>
            )}
            {t.trackingAvailable && (
              <span className="offer-chip offer-chip-tracking">✓ Tracking</span>
            )}
            {t.serviceType === "pickup" && (
              <span className="offer-chip offer-chip-service">🚐 Abholung</span>
            )}
            {t.serviceType === "dropoff" && (
              <span className="offer-chip offer-chip-service">🏪 Shopabgabe</span>
            )}
            {t.shippingModeLabel && (
              <span className="offer-chip offer-chip-service">{t.shippingModeLabel}</span>
            )}
          </div>

          {hasStatus && (
            <div className="offer-status-row">
              {t.serviceType === "pickup" && t.pickupToday && (
                <span className="offer-status-pickup-today">
                  <Icon n="zap" s={13} c="currentColor" /> Abholung heute möglich
                </span>
              )}
              {t.printerRequired && (
                <span className="offer-status-printer">
                  <Icon n="info" s={13} c="currentColor" /> Drucker erforderlich
                </span>
              )}
            </div>
          )}

          {hasMeta && (
            <div className="offer-meta-row">
              {t.serviceType === "dropoff" && t.shopName && (
                <span className="offer-meta-text">
                  <Icon n="mapPin" s={13} c="currentColor" /> {t.shopName}
                </span>
              )}
              {t.serviceType === "pickup" && t.pickupDate && !t.pickupToday && (
                <span className="offer-meta-text">
                  <Icon n="truck" s={13} c="currentColor" /> Abholung: {fmtDE(t.pickupDate)}
                </span>
              )}
            </div>
          )}

          {hasDate && (
            <div className="offer-date-row">
              {t.availableForDate === false && (
                <span className="offer-unavail-note">⚠ Nicht verfügbar für dieses Datum</span>
              )}
              {t.deliveryDate && t.availableForDate !== false && (
                <span className="offer-date-text">
                  📅 Lieferung: {fmtDE(t.deliveryDate)}
                  {t.deliveryTimeUntil ? ` bis ${t.deliveryTimeUntil} Uhr` : ""}
                </span>
              )}
              {t.pickupTimeFrom && t.pickupTimeUntil && t.availableForDate !== false && (
                <span className="offer-date-text">
                  🕐 {t.pickupTimeFrom}–{t.pickupTimeUntil} Uhr
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Zone C: Badge + Price + CTA ── */}
        <div className="offer-zone-c">
          {badge && badge.key !== "top" && (
            <div className={`offer-badge offer-badge-${badge.color}`}>
              {badge.label}
            </div>
          )}
          <div className="offer-price-block">
            {t.netPrice != null ? (
              <>
                <div className="offer-price">{money(t.netPrice)}</div>
                <div className="offer-price-sub">exkl. MwSt.</div>
              </>
            ) : (
              <div className="offer-price-na">Preis fehlt</div>
            )}
          </div>
          <button
            className={`offer-cta-btn${isTop || selected ? " offer-cta-btn--primary" : " offer-cta-btn--outline"}`}
            onClick={handleBook}
            type="button"
            aria-label={`${carrierName} auswählen und buchen`}
          >
            Auswählen →
          </button>
          <button
            className="offer-details-link"
            onClick={toggleDetails}
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={`offer-details-${t.id}`}
          >
            {detailsOpen ? "Details ausblenden" : "Details anzeigen"}
            <span className={`offer-details-chevron${detailsOpen ? " open" : ""}`} aria-hidden="true">
              <Icon n="chevron" s={14} c="currentColor" />
            </span>
          </button>
        </div>
      </div>

      {/* ── Details Panel (lazy) ── */}
      {detailsMounted && (
        <div
          id={`offer-details-${t.id}`}
          className={`offer-details-panel${detailsOpen ? "--open" : "--closed"}`}
          role="region"
          aria-label={`Details für ${carrierName}`}
        >
          <DetailsPanel tariff={t} />
        </div>
      )}
    </div>
  );
}
