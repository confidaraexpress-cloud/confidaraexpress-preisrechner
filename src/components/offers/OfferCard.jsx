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

// isTop bleibt Teil des Props-Vertrags (von OffersList übergeben), löst aber
// bewusst keine visuelle Hervorhebung mehr aus — es gibt keine "Top Empfehlung".
export function OfferCard({ tariff: t, badge, isTop, selected, onSelect, onBook, vatMode }) {
  const { name: carrierName, logo: carrierLogo } = resolveCarrier(t.carrier);
  const [detailsOpen, setDetailsOpen]       = useState(false);
  const [detailsMounted, setDetailsMounted] = useState(false);

  const unavailable = t.availableForDate === false;

  const toggleDetails = (e) => {
    e.stopPropagation();
    if (!detailsMounted) setDetailsMounted(true);
    setDetailsOpen(o => !o);
  };

  const handleSelect = () => {
    if (unavailable) return;
    onSelect(t);
  };

  const handleBook = (e) => {
    e.stopPropagation();
    if (unavailable) return;
    onBook(t);
  };

  const delivery = fmtDelivery(t);

  // ── Zone 2: Versandablauf ──
  const startLabel    = t.serviceType === "dropoff" ? "Shopabgabe" : "Abholung";
  const startDate     = t.pickupDate ? fmtDE(t.pickupDate) : null;
  const startTime     = (t.pickupTimeFrom && t.pickupTimeUntil)
    ? `${t.pickupTimeFrom}–${t.pickupTimeUntil} Uhr` : null;
  const shopName      = t.serviceType === "dropoff" && t.shopName ? t.shopName : null;
  const deliveryDate  = t.deliveryDate ? fmtDE(t.deliveryDate) : null;
  const deliveryUntil = t.deliveryTimeUntil ? `bis ${t.deliveryTimeUntil} Uhr` : null;
  // Absolute Termin-/Zeitdaten vorhanden? Sonst graceful fallback auf rel. Laufzeit.
  const hasTimeline   = !!(startDate || startTime || shopName || deliveryDate || deliveryUntil);

  return (
    <div
      className={`offer-card${selected ? " offer-card--selected" : ""}${unavailable ? " offer-card--unavailable" : ""}`}
      onClick={handleSelect}
      aria-disabled={unavailable || undefined}
    >
      {/* Objektives Label — dezenter Eck-Pill, verändert die Kartenhöhe nicht */}
      {badge && (
        <div className={`offer-label offer-label--${badge.key}`}>{badge.label}</div>
      )}

      <div className="offer-card-inner">
        {/* ── Zone 1: Anbieter & Hauptnutzen ── */}
        <div className="offer-zone-a">
          <div className="offer-logo-tile">
            {carrierLogo
              ? <img src={carrierLogo} alt={carrierName} width="40" height="40" />
              : <span className="offer-logo-tile-text">{carrierName}</span>
            }
          </div>
          <div className="offer-carrier-name">{carrierName}</div>
          {delivery
            ? <div className="offer-eta">{delivery}</div>
            : <div className="offer-eta offer-eta--na">Laufzeit auf Anfrage</div>
          }
          <div className="offer-service-type">
            {t.shippingModeLabel || t.tariffName || "Standardversand"}
          </div>
        </div>

        {/* ── Zone 2: Versandablauf / Timeline ── */}
        <div className="offer-zone-b">
          {unavailable ? (
            <div className="offer-timeline-empty">
              <Icon n="info" s={15} c="currentColor" />
              <span>Nicht verfügbar für dieses Datum</span>
            </div>
          ) : (
            <div className="offer-timeline">
              <div className="offer-tl-node">
                <div className="offer-tl-head">
                  <span className="offer-tl-dot offer-tl-dot--start" aria-hidden="true" />
                  <span className="offer-tl-label">{startLabel}</span>
                </div>
                {startDate && <div className="offer-tl-sub">{startDate}</div>}
                {startTime && <div className="offer-tl-sub">{startTime}</div>}
                {shopName  && <div className="offer-tl-sub">{shopName}</div>}
                {!hasTimeline && delivery && (
                  <div className="offer-tl-sub">Laufzeit {delivery}</div>
                )}
              </div>

              <div className="offer-tl-connector" aria-hidden="true" />

              <div className="offer-tl-node offer-tl-node--end">
                <div className="offer-tl-head">
                  <span className="offer-tl-dot offer-tl-dot--end" aria-hidden="true" />
                  <span className="offer-tl-label">Lieferung</span>
                </div>
                {deliveryDate  && <div className="offer-tl-sub">{deliveryDate}</div>}
                {deliveryUntil && <div className="offer-tl-sub">{deliveryUntil}</div>}
              </div>
            </div>
          )}
        </div>

        {/* ── Zone 3: Preis & Aktion ── */}
        <div className="offer-zone-c">
          <div className="offer-price-block">
            {t.netPrice != null ? (
              <>
                <div className="offer-price">
                  {vatMode === "gross"
                    ? money(t.finalPrice ?? t.netPrice)
                    : money(t.netPrice)}
                </div>
                <div className="offer-price-sub">
                  {vatMode === "gross" ? "inkl. MwSt." : "exkl. MwSt."}
                </div>
              </>
            ) : (
              <div className="offer-price-na">Preis auf Anfrage</div>
            )}
          </div>
          <button
            className={`offer-cta-btn${
              unavailable ? " offer-cta-btn--disabled"
              : selected ? " offer-cta-btn--primary"
              : " offer-cta-btn--outline"}`}
            onClick={handleBook}
            type="button"
            disabled={unavailable}
            aria-label={unavailable
              ? `${carrierName} – nicht verfügbar`
              : `${carrierName} – Angebot auswählen`}
          >
            {unavailable ? "Nicht verfügbar" : (
              <>
                {selected && <Icon n="check" s={16} c="currentColor" />}
                Angebot auswählen
              </>
            )}
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

        {/* ── Zone 4: Meta-/Hinweis-Fußzeile ── */}
        <div className="offer-zone-d">
          {t.trackingAvailable && (
            <span className="offer-meta-item">
              <Icon n="mapPin" s={14} c="currentColor" />
              Sendungsverfolgung
            </span>
          )}
          {t.printerRequired != null && (
            <span className={`offer-meta-item${t.printerRequired ? " offer-meta-item--warn" : ""}`}>
              <Icon n="printer" s={14} c="currentColor" />
              {t.printerRequired ? "Drucker erforderlich" : "Kein Drucker nötig"}
            </span>
          )}
          {t.serviceType === "pickup" && t.pickupToday && (
            <span className="offer-meta-item">
              <Icon n="zap" s={14} c="currentColor" />
              Abholung heute möglich
            </span>
          )}
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
