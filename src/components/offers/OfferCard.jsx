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

// ── Versandlaufzeit als ganze Detailzeile: "1–3 Arbeitstage" ──
// Lokale Variante (Arbeitstage-Wording), ohne den geteilten fmtDelivery-Helfer
// zu verändern (der weiterhin Karte/ETA & BookingPage versorgt).
function fmtTransitDetail(t) {
  const a = t.transitDaysMin, b = t.transitDaysMax;
  if (a != null && b != null) {
    if (a === b) return a === 0 ? "Noch heute" : a === 1 ? "1 Arbeitstag" : `${a} Arbeitstage`;
    return `${a}–${b} Arbeitstage`;
  }
  return fmtDelivery(t) || null;
}

// ── tariffLimits → natürliche, kundennahe deutsche Sätze ──
// Jeder bekannte Operant hat ein Satz-Template mit Slot für Operator-Wort + Wert.
// Das Operator-Wort steht im Satz (z. B. "max."), sodass der häufige <=-Fall
// natürlich klingt. Unbekannte Operanten/Operatoren werden bewusst übersprungen
// (keine falsche Übersetzung, keine Rohwerte). `order` steuert die fachliche
// Reihenfolge: Gewicht → Maße/Seiten → Gurtmaß → Packstücke → Gesamtgewicht.
const LIMIT_OPERATORS = { "<=": "max.", "<": "weniger als", ">=": "mindestens", ">": "größer als" };

const LIMIT_RULES = {
  weight:                    { order: 1, tpl: (op, v) => `Packstücke dürfen ${op} ${v} kg wiegen.` },
  chargeableWeight:          { order: 1, tpl: (op, v) => `Das frachtpflichtige Gewicht darf ${op} ${v} kg betragen.` },
  length:                    { order: 2, tpl: (op, v) => `Die Länge darf ${op} ${v} cm betragen.` },
  width:                     { order: 2, tpl: (op, v) => `Die Breite darf ${op} ${v} cm betragen.` },
  height:                    { order: 2, tpl: (op, v) => `Die Höhe darf ${op} ${v} cm betragen.` },
  first_length:              { order: 2, tpl: (op, v) => `Die längste Seite eines Packstücks darf ${op} ${v} cm lang sein.` },
  second_length:             { order: 2, tpl: (op, v) => `Die zweitlängste Seite eines Packstücks darf ${op} ${v} cm lang sein.` },
  shortest_and_longest_side: { order: 2, tpl: (op, v) => `Die kürzeste und die längste Seite eines Packstücks dürfen zusammen ${op} ${v} cm lang sein.` },
  girth:                     { order: 3, tpl: (op, v) => `Das Gurtmaß eines Packstücks darf ${op} ${v} cm betragen.` },
  packages_count:            { order: 4, tpl: (op, v) => `Mit diesem Versandtarif können ${op} ${v} Packstücke pro Sendung verschickt werden.` },
  packages_total_weight:     { order: 5, tpl: (op, v) => `Das Gesamtgewicht aller Packstücke darf ${op} ${v} kg betragen.` },
};

function buildLimitLines(tariffLimits) {
  if (!Array.isArray(tariffLimits)) return [];
  const lines = [];
  tariffLimits.forEach((lim, i) => {
    if (!lim || typeof lim !== "object") return;
    const { operant, operator, value } = lim;
    // value 0 darf nicht via || verloren gehen → explizite Zahl-Prüfung.
    // null/undefined/leer aber überspringen (Number(null) wäre 0 → kein "max. 0").
    if (value == null || value === "") return;
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) return;
    // Nutzlose untere 0-Grenzen ausblenden (z. B. shortest_and_longest_side > 0).
    if (num === 0 && (operator === ">" || operator === ">=")) return;
    const rule   = LIMIT_RULES[operant];
    const opWord = LIMIT_OPERATORS[operator];
    if (!rule || !opWord) return; // unbekannte Operanten/Operatoren überspringen
    lines.push({ key: `${operant}-${operator}-${i}`, order: rule.order, text: rule.tpl(opWord, num) });
  });
  return lines.sort((a, b) => a.order - b.order);
}

// ── carrierLinks: nur valide http(s)-URLs, neutrale deutsche Labels ──
const CARRIER_LINK_DEFS = [
  { key: "agb",         label: "AGB / Versandbedingungen" },
  { key: "tracking",    label: "Sendungsverfolgung beim Carrier" },
  { key: "transitTime", label: "Laufzeitinformationen" },
];
const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\/\S/i.test(v);

function buildCarrierLinks(carrierLinks) {
  if (!carrierLinks || typeof carrierLinks !== "object") return [];
  return CARRIER_LINK_DEFS
    .map(d => ({ ...d, url: typeof carrierLinks[d.key] === "string" ? carrierLinks[d.key].trim() : "" }))
    .filter(d => isHttpUrl(d.url));
}

function DetailRow({ label, value, strong, subtle }) {
  return (
    <div className={`offer-detail-row${strong ? " offer-detail-row--strong" : ""}${subtle ? " offer-detail-row--subtle" : ""}`}>
      <span className="offer-detail-label">{label}</span>
      <span className="offer-detail-value">{value}</span>
    </div>
  );
}

function DetailsPanel({ tariff: t }) {
  // Alle Felder/Sektionen werden defensiv gerendert: Eine Zeile/Sektion erscheint
  // ausschließlich, wenn der Wert real vorhanden ist. Keine erfundenen Werte,
  // kein null/undefined, keine technischen Rohwerte.

  // Versandart als lesbares Label.
  const serviceLabel =
    t.serviceType === "pickup"  ? "Abholung"   :
    t.serviceType === "dropoff" ? "Shopabgabe" :
    t.serviceType || null;

  // Tarif-ID nur sekundär (Support/Abgleich) — Jumingo-seitige ID bevorzugt.
  const tariffId = t.shipper_tariff_id ?? t.id ?? null;

  // Versandlaufzeit als sachliche Detailzeile (nicht überdominant).
  const transitDetail = fmtTransitDetail(t);

  // Versicherung aus insuranceDetails (reales Backend-Feld), defensiv geprüft.
  const ins = t.insuranceDetails && typeof t.insuranceDetails === "object" ? t.insuranceDetails : null;
  const hasInsurableFlag = ins != null && typeof ins.isInsurable === "boolean";
  // Versicherungswert nur bei positiver Zahl (0/fehlend → keine Haftungszeile),
  // bewusst neutrale Formulierung "lt. Tarifdaten" — keine Haftungsgarantie.
  const insValue = ins != null && typeof ins.insuranceValue === "number" ? ins.insuranceValue : null;
  const showInsValue = insValue != null && insValue > 0;

  // Lieferzeitraum aus min/max (beide nötig) — bevorzugt vor Einzeldatum.
  const hasDeliveryRange = !!(t.deliveryDateMin && t.deliveryDateMax);
  const deliveryRange = hasDeliveryRange
    ? `${fmtDE(t.deliveryDateMin)} – ${fmtDE(t.deliveryDateMax)}`
    : null;

  // Abholzuschlag nur als neutraler Hinweis — niemals als zusätzlicher Preis.
  const showPickupSurcharge = t.hasPickupSurcharge === true;

  // Neue Jumingo-Felder: Einschränkungen (tariffLimits) & Carrier-Links.
  const limitLines = buildLimitLines(t.tariffLimits);
  const carrierLinkItems = buildCarrierLinks(t.carrierLinks);

  // ── Hauptmerkmale als Feature-Grid: dezentes Label + starker Wert + kleines
  // Icon aus der bestehenden Icon-Sprache. Nur real vorhandene Felder. Infos,
  // die "Termin & Abholung" konkreter zeigt (Abgabestelle, Lieferzeit), werden
  // hier bewusst NICHT wiederholt. Der Tarifname spannt die volle Breite.
  const features = [];
  if (transitDetail)               features.push({ icon: "clock",   label: "Versandlaufzeit",        value: transitDetail });
  if (showInsValue)                features.push({ icon: "shield",  label: "Haftung / Versicherung", value: `max. ${money(insValue)} lt. Tarifdaten` });
  if (t.printerRequired != null)   features.push({ icon: "printer", label: "Drucker",                value: t.printerRequired ? "Erforderlich" : "Nicht erforderlich" });
  if (t.trackingAvailable != null) features.push({ icon: "truck",   label: "Sendungsverfolgung",     value: t.trackingAvailable ? "Inklusive" : "Nicht verfügbar" });
  if (hasInsurableFlag)            features.push({ icon: "shield",  label: "Versicherungsschutz",    value: ins.isInsurable ? "Buchbar" : "Nicht verfügbar" });
  if (serviceLabel)                features.push({ icon: "package", label: "Versandart",             value: serviceLabel });
  if (t.tariffName)                features.push({ icon: "cube",    label: "Tarif",                  value: t.tariffName, wide: true });
  if (tariffId != null)            features.push({ icon: "info",    label: "Tarif-ID",               value: String(tariffId), subtle: true });

  const hasPrice = t.netPrice != null || t.vatAmount != null || t.finalPrice != null;
  const hasMain  = features.length > 0;
  const hasLimits = limitLines.length > 0;
  const hasTermin = !!(t.shopName || t.pickupDate || (t.pickupTimeFrom && t.pickupTimeUntil)
                   || hasDeliveryRange || t.deliveryDate || t.deliveryTimeUntil);
  const hasHinweise = showPickupSurcharge;
  const hasLinks = carrierLinkItems.length > 0;

  return (
    <>
      {hasMain && (
        <div className="offer-details-section">
          <div className="offer-detail-section-title">Hauptmerkmale</div>
          <div className="offer-feature-grid">
            {features.map(f => (
              <div key={f.label} className={`offer-feature${f.wide ? " offer-feature--wide" : ""}`}>
                <span className="offer-feature-icon"><Icon n={f.icon} s={15} c="currentColor" /></span>
                <span className="offer-feature-body">
                  <span className="offer-feature-label">{f.label}</span>
                  <span className={`offer-feature-value${f.subtle ? " offer-feature-value--subtle" : ""}`}>{f.value}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasLimits && (
        <div className="offer-details-section">
          <div className="offer-detail-section-title">Einschränkungen</div>
          <ul className="offer-limit-list">
            {limitLines.map(l => (
              <li key={l.key} className="offer-limit-item">{l.text}</li>
            ))}
          </ul>
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
          {hasDeliveryRange
            ? <DetailRow label="Lieferzeitraum" value={deliveryRange} />
            : t.deliveryDate && <DetailRow label="Liefertermin" value={fmtDE(t.deliveryDate)} />}
          {t.deliveryTimeUntil && <DetailRow label="Lieferung bis" value={`${t.deliveryTimeUntil} Uhr`} />}
        </div>
      )}

      {hasPrice && (
        <div className="offer-details-section offer-details-section--price">
          <div className="offer-detail-section-title">Preisaufschlüsselung</div>
          {t.netPrice  != null && <DetailRow label="Netto"  value={money(t.netPrice)} />}
          {t.vatAmount != null && <DetailRow label="MwSt."  value={money(t.vatAmount)} />}
          {t.finalPrice != null && <DetailRow label="Brutto" value={money(t.finalPrice)} strong />}
        </div>
      )}

      {hasLinks && (
        <div className="offer-details-section">
          <div className="offer-detail-section-title">Links &amp; Bedingungen</div>
          <div className="offer-links-list">
            {carrierLinkItems.map(link => (
              <a
                key={link.key}
                className="offer-link-row"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="offer-link-label">{link.label}</span>
                <Icon n="external" s={13} c="currentColor" />
              </a>
            ))}
          </div>
        </div>
      )}

      {hasHinweise && (
        <div className="offer-details-section">
          <div className="offer-detail-section-title">Zusatzhinweise</div>
          {showPickupSurcharge && (
            <DetailRow label="Abholzuschlag" value="Im Tarif berücksichtigt" />
          )}
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
  const etaLabel    = fmtDelivery(t) || "Auf Anfrage";
  const start = buildStart(t);
  const end   = buildEnd(t, etaLabel);

  // Zone 4: Meta-Hinweise als ruhige, monochrome Icon+Text-Items.
  // Service-Typ (Abholung/Shopabgabe) wird hier NICHT wiederholt — er ist
  // bereits der Start-Knoten in Zone 2.
  const metaItems = [];
  if (t.trackingAvailable) {
    metaItems.push({ icon: "truck", label: "Sendungsverfolgung", tone: "info" });
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
      aria-disabled={unavailable || undefined}
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
              <div className="offer-price-na">Preis auf Anfrage</div>
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
          {metaItems.map((m, i) => {
            const toneClass = m.tone === "warn" ? " offer-meta-item--warn"
                            : m.tone === "info" ? " offer-meta-item--info" : "";
            return (
              <span key={i} className={`offer-meta-item${toneClass}`}>
                <Icon n={m.icon} s={14} c="currentColor" />
                {m.label}
              </span>
            );
          })}
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
