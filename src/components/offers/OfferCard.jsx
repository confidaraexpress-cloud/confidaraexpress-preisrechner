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

// Kompaktes Premium-Datum mit Wochentag für die Timeline: "Mi., 12.06."
// Manuell zerlegt, um Zeitzonen-Verschiebungen von new Date(iso) zu vermeiden.
const fmtDay = (iso) => {
  if (!iso) return "";
  const [y, m, d] = (iso.split("T")[0] || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });
};

// ── Zone 2: Versandablauf-Knoten aus vorhandenen Daten ableiten ──
// Es werden ausschließlich real vorhandene Felder genutzt; fehlt alles,
// fällt der Ziel-Knoten sauber auf die relative Laufzeit zurück.
// Knoten als { title, primary, secondary[] }: der Titel (Abholung/Lieferung)
// und die primäre Zeile (Datum bzw. relative Laufzeit) tragen das visuelle
// Gewicht; Uhrzeit/Shopname bleiben sekundär und dezent.
function buildStart(t) {
  let title;
  if (t.serviceType === "dropoff")     title = "Shopabgabe";
  else if (t.serviceType === "pickup") title = t.pickupToday ? "Abholung heute" : "Abholung";
  else                                 title = "Versand";

  const primary = t.pickupDate ? fmtDay(t.pickupDate) : null;
  const secondary = [];
  if (t.pickupTimeFrom && t.pickupTimeUntil)     secondary.push(`${t.pickupTimeFrom}–${t.pickupTimeUntil} Uhr`);
  if (t.serviceType === "dropoff" && t.shopName) secondary.push(t.shopName);
  return { title, primary, secondary };
}

function buildEnd(t, etaLabel) {
  // Absolutes Lieferdatum bevorzugt; fehlt es, sauberer Fallback auf relative Laufzeit.
  const primary = t.deliveryDate ? fmtDay(t.deliveryDate) : etaLabel;
  const secondary = [];
  if (t.deliveryTimeUntil) secondary.push(`bis ${t.deliveryTimeUntil} Uhr`);
  return { title: "Lieferung", primary, secondary };
}

function DetailRow({ label, value, strong }) {
  return (
    <div className={`offer-detail-row${strong ? " offer-detail-row--strong" : ""}`}>
      <span className="offer-detail-label">{label}</span>
      <span className="offer-detail-value">{value}</span>
    </div>
  );
}

function DetailsPanel({ tariff: t }) {
  const hasPrice   = t.netPrice != null || t.vatAmount != null || t.finalPrice != null;
  const hasService = t.trackingAvailable != null || t.printerRequired != null || t.serviceType;
  const hasTermin  = t.shopName || t.pickupDate || t.pickupTimeFrom || t.deliveryDate;

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

export function OfferCard({ tariff: t, badge, isTop, selected, onSelect, onBook, vatMode }) {
  const { name: carrierName, logo: carrierLogo } = resolveCarrier(t.carrier);
  const [detailsOpen, setDetailsOpen]       = useState(false);
  const [detailsMounted, setDetailsMounted] = useState(false);

  const unavailable = t.availableForDate === false;
  const etaLabel    = fmtDelivery(t) || "Auf Anfrage";
  const start = buildStart(t);
  const end   = buildEnd(t, etaLabel);

  // Zone 4: Meta-Hinweise als ruhige, monochrome Icon+Text-Items.
  // Service-Typ (Abholung/Shopabgabe) wird hier NICHT wiederholt — er ist
  // bereits der Start-Knoten in Zone 2.
  const metaItems = [];
  if (t.trackingAvailable) {
    metaItems.push({ icon: "truck", label: "Sendungsverfolgung", tone: "default" });
  }
  if (t.printerRequired === true) {
    metaItems.push({ icon: "printer", label: "Drucker erforderlich", tone: "warn" });
  } else if (t.printerRequired === false) {
    metaItems.push({ icon: "printer", label: "Kein Drucker nötig", tone: "default" });
  }

  const toggleDetails = (e) => {
    e.stopPropagation();
    if (!detailsMounted) setDetailsMounted(true);
    setDetailsOpen(o => !o);
  };

  const handleSelect = () => { if (!unavailable) onSelect(t); };
  const handleBook = (e) => {
    e.stopPropagation();
    if (!unavailable) onBook(t);
  };

  const ctaClass = unavailable
    ? "offer-cta-btn--disabled"
    : selected ? "offer-cta-btn--primary" : "offer-cta-btn--outline";

  return (
    <div
      className={`offer-card${selected ? " offer-card--selected" : ""}${unavailable ? " offer-card--unavailable" : ""}`}
      onClick={handleSelect}
    >
      <div className="offer-card-inner">
        {/* ── Zone 1: Anbieter & Hauptnutzen ── */}
        <div className="offer-zone-1">
          <div className="offer-logo-tile">
            {carrierLogo
              ? <img src={carrierLogo} alt={carrierName} width="44" height="44" />
              : <span className="offer-logo-tile-text">{carrierName}</span>
            }
          </div>
          <div className="offer-zone-1-main">
            <div className="offer-carrier-name">{carrierName}</div>
            <div className="offer-eta">{etaLabel}</div>
            <div className="offer-service-type">{t.shippingModeLabel || t.tariffName || "Standardversand"}</div>
          </div>
        </div>

        {/* ── Zone 2: Versandablauf / Timeline ── */}
        <div className="offer-zone-2">
          {unavailable ? (
            <div className="offer-unavail">
              <Icon n="info" s={15} c="currentColor" />
              <span>Nicht verfügbar für dieses Datum</span>
            </div>
          ) : (
            <div className="offer-timeline">
              <div className="offer-tl-rail" aria-hidden="true">
                <span className="offer-tl-dot offer-tl-dot--start" />
                <span className="offer-tl-track" />
                <span className="offer-tl-dot offer-tl-dot--end" />
              </div>
              <div className="offer-tl-labels">
                <div className="offer-tl-node offer-tl-node--start">
                  <span className="offer-tl-title">{start.title}</span>
                  {start.primary && <span className="offer-tl-primary">{start.primary}</span>}
                  {start.secondary.map((s, i) => <span key={i} className="offer-tl-sub">{s}</span>)}
                </div>
                <div className="offer-tl-node offer-tl-node--end">
                  <span className="offer-tl-title">{end.title}</span>
                  {end.primary && <span className="offer-tl-primary">{end.primary}</span>}
                  {end.secondary.map((s, i) => <span key={i} className="offer-tl-sub">{s}</span>)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Zone 3: Preis & Aktion ── */}
        <div className="offer-zone-3">
          <div className="offer-zone-3-top">
            {badge && (
              <div className={`offer-badge offer-badge-${badge.color}`}>{badge.label}</div>
            )}
          </div>
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
              <div className="offer-price-na">Preis fehlt</div>
            )}
          </div>
          <button
            className={`offer-cta-btn ${ctaClass}`}
            onClick={handleBook}
            type="button"
            disabled={unavailable}
            aria-label={unavailable ? `${carrierName} nicht verfügbar` : `${carrierName} Angebot auswählen`}
          >
            {unavailable
              ? "Nicht verfügbar"
              : <>Angebot auswählen <Icon n="arrow" s={15} c="currentColor" /></>}
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

        {/* ── Zone 4: Meta-/Hinweis-Fußzeile ──
            Fehlen Tracking/Drucker, bleibt die Zeile bewusst leer (Mindesthöhe
            sorgt für gleiche Kartenhöhe) — kein redundanter Fallback-Text. */}
        <div className="offer-zone-4">
          {metaItems.map((m, i) => (
            <span key={i} className={`offer-meta-item${m.tone === "warn" ? " offer-meta-item--warn" : ""}`}>
              <Icon n={m.icon} s={14} c="currentColor" />
              {m.label}
            </span>
          ))}
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
