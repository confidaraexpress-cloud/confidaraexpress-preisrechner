import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { OfferCard } from "./OfferCard";
import { assignBadges } from "../../utils/offerBadges";
import { money } from "../../utils/formatters";

const SORT_OPTIONS = [
  { id: "recommended", label: "Empfehlung" },
  { id: "cheapest",    label: "Günstigste" },
  { id: "fastest",     label: "Schnellste" },
  { id: "priciest",    label: "Teuerste"   },
];

const TRUST_ITEMS = [
  { icon: "shield",  title: "Sicher & zuverlässig",  desc: "SSL-verschlüsselt, DSGVO-konform" },
  { icon: "leaf",    title: "Nachhaltige Optionen",   desc: "Umweltfreundliche Versandwege" },
  { icon: "clock",   title: "Zeitsparnis",            desc: "Vergleich in Sekunden, nicht Stunden" },
  { icon: "headset", title: "Persönlicher Support",   desc: "Ihr Team ist jederzeit erreichbar" },
];

export function OffersList({
  sorted, filtered, tariffs, loading, hasResults,
  selected, onSelect, onBook,
  sortMode, onSortChange,
  onRecalculate,
  maxPrice, onMaxPriceChange, onClearFilters,
  vatMode, onVatToggle,
  senderPrefill,
}) {
  // Aktives Filter-Dropdown: "price" | "days" | null. Es ist immer höchstens
  // eines offen; das Öffnen des einen schließt das andere. Ersetzt den früheren
  // kombinierten Inline-Panel-Toggle durch rechts angedockte JUMiNGO-Dropdowns.
  const [openFilter, setOpenFilter] = useState(null);
  const filterZoneRef = useRef(null);
  const badges = useMemo(() => assignBadges(sorted), [sorted]);

  // Slider-Obergrenze aus der ungefilterten Tarifliste ableiten, damit der
  // aktive Preisfilter den eigenen Maximalwert nicht selbst verkleinert.
  const priceSliderMax = useMemo(() => {
    const values = tariffs
      .map(t => t.netPrice)
      .filter(v => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return null;
    const rawMax = Math.max(...values);
    if (rawMax <= 100) return Math.ceil(rawMax / 10) * 10;
    if (rawMax <= 500) return Math.ceil(rawMax / 25) * 25;
    return Math.ceil(rawMax / 50) * 50;
  }, [tariffs]);
  const hasPriceRange = priceSliderMax != null && priceSliderMax > 0;
  const priceSliderValue = maxPrice
    ? Math.min(Number(maxPrice), hasPriceRange ? priceSliderMax : 0)
    : (hasPriceRange ? priceSliderMax : 0);
  const handlePriceSlider = (e) => {
    const val = Number(e.target.value);
    if (!hasPriceRange || val >= priceSliderMax) onMaxPriceChange("");
    else onMaxPriceChange(String(val));
  };

  const activeFilterCount = [maxPrice].filter(Boolean).length;
  const hasFilter  = activeFilterCount > 0;
  const showCards  = !loading && sorted.length > 0;
  const showSortBar = hasResults && !loading && tariffs.length > 0;
  const showTrust  = hasResults && !loading && tariffs.length > 0;

  // Offenes Dropdown bei Klick außerhalb der Filterzone bzw. per Escape schließen.
  useEffect(() => {
    if (!openFilter) return;
    const onDown = (e) => {
      if (filterZoneRef.current && !filterZoneRef.current.contains(e.target)) setOpenFilter(null);
    };
    const onEsc = (e) => { if (e.key === "Escape") setOpenFilter(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openFilter]);

  // Wird die Leiste ausgeblendet (Laden/Neuberechnung), offenes Dropdown
  // schließen, damit es nach dem Remount nicht ungewollt sichtbar bleibt.
  useEffect(() => {
    if (!showSortBar) setOpenFilter(null);
  }, [showSortBar]);

  return (
    <div className="offers-section">
      {/* ── Result Header ── */}
      <div className="offers-result-header">
        <div>
          <div className="offers-result-count">
            {loading
              ? "Preise werden geladen…"
              : hasResults
                ? (hasFilter
                    ? `${filtered.length} von ${tariffs.length} Angeboten angezeigt`
                    : `${tariffs.length} Angebot${tariffs.length !== 1 ? "e" : ""} gefunden`)
                : "Versandangebote"
            }
          </div>
          {hasResults && !loading && (
            <div className="offers-result-sub">Wählen Sie Ihr bevorzugtes Angebot</div>
          )}
        </div>
      </div>

      {/* ── Sortier- + Filterzone (JUMiNGO-artige Filter-Chips mit rechts
             angedockten Dropdowns). Die Zone umschließt Leiste UND Dropdowns,
             damit die Dropdowns nicht vom horizontal scrollenden Bar-Container
             (Mobile) abgeschnitten werden. ── */}
      {showSortBar && (
        <div className="offers-filter-zone" ref={filterZoneRef}>
          <div className="offers-sort-bar">
            <span className="offers-sort-label">Sortierung</span>
            {SORT_OPTIONS.map(o => (
              <button
                key={o.id}
                className={`offers-sort-btn${sortMode === o.id ? " active" : ""}`}
                onClick={() => onSortChange(o.id)}
                type="button"
              >
                {o.label}
              </button>
            ))}
            <div className="offers-sort-sep" />

            {/* Filterpunkt „Preis" → rechts angedocktes Dropdown */}
            <button
              className={`offers-sort-btn offers-filter-chip${maxPrice ? " has-filter" : ""}${openFilter === "price" ? " open" : ""}`}
              onClick={() => setOpenFilter(o => (o === "price" ? null : "price"))}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={openFilter === "price"}
            >
              <Icon n="filter" s={12} c="currentColor" />
              {maxPrice ? `Preis · bis ${money(Number(maxPrice))}` : "Preis"}
              <span className="offers-filter-chip-caret" aria-hidden="true">
                <Icon n="chevron" s={13} c="currentColor" />
              </span>
            </button>

            {hasFilter && (
              <button className="offers-filter-reset-btn" onClick={onClearFilters} type="button">
                <Icon n="x" s={11} c="currentColor" />
                Zurücksetzen
              </button>
            )}

            <div className="offers-sort-sep" />
            <div className="offers-vat-toggle" role="group" aria-label="Preisdarstellung">
              <button
                className={`offers-sort-btn${vatMode !== "gross" ? " active" : ""}`}
                onClick={() => onVatToggle("net")}
                type="button"
              >
                exkl. MwSt.
              </button>
              <button
                className={`offers-sort-btn${vatMode === "gross" ? " active" : ""}`}
                onClick={() => onVatToggle("gross")}
                type="button"
              >
                inkl. MwSt.
              </button>
            </div>
          </div>

          {/* ── Preis-Dropdown: filtert live nach netPrice über den bestehenden
                 max_price-Mechanismus (kein API-Request). Am Maximum kein Filter. ── */}
          {openFilter === "price" && (
            <div className="offers-filter-dropdown offers-price-dropdown" role="dialog" aria-label="Preisfilter">
              <div className="offers-filter-dd-head">
                <span className="offers-filter-dd-title">Preis</span>
                <span className={`offers-filter-dd-status${maxPrice ? " is-set" : ""}`}>
                  {maxPrice ? `bis ${money(Number(maxPrice))}` : "Beliebiger Preis"}
                </span>
              </div>
              <p className="offers-filter-dd-sub">Bitte wählen Sie Ihren max. Preis</p>
              <input
                type="range"
                className="offers-price-slider"
                min={0}
                max={hasPriceRange ? priceSliderMax : 0}
                step={1}
                value={priceSliderValue}
                onChange={handlePriceSlider}
                disabled={!hasPriceRange}
                aria-label="Maximaler Preis"
              />
              <div className="offers-price-scale">
                <span>0 €</span>
                <span>{hasPriceRange ? money(priceSliderMax) : "—"}</span>
              </div>
              {maxPrice && (
                <div className="offers-filter-dd-foot">
                  <button className="offers-filter-dd-clear" onClick={() => onMaxPriceChange("")} type="button">
                    Preisfilter zurücksetzen
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className="offers-body">
        {loading && (
          <div className="offers-loading">
            <span className="spinner spinner-dark" />
            <span className="text-sm text-muted">Preise werden geladen…</span>
          </div>
        )}

        {!loading && hasResults && tariffs.length === 0 && (
          <div className="offers-empty">
            <div className="offers-empty-icon"><Icon n="search" s={26} c="currentColor" /></div>
            <p className="offers-empty-title">Keine Tarife gefunden</p>
            <p className="offers-empty-sub">
              Für diese Route und das gewählte Datum wurden keine Tarife gefunden.
              Ändern Sie das Datum oder wählen Sie „Alle Dienstleistungen".
            </p>
          </div>
        )}

        {!loading && hasResults && tariffs.length > 0 && filtered.length === 0 && (
          <div className="offers-empty">
            <div className="offers-empty-icon"><Icon n="filter" s={26} c="currentColor" /></div>
            <p className="offers-empty-title">Filter anpassen</p>
            <p className="offers-empty-sub">
              Alle Tarife wurden durch Ihre Preisfilter ausgeblendet.
              Erhöhen Sie das Preislimit oder entfernen Sie den Filter.
            </p>
          </div>
        )}

        {showCards && sorted.map((t, idx) => (
          <OfferCard
            key={t.id}
            tariff={t}
            badge={badges.get(t.id) || null}
            isTop={idx === 0}
            selected={selected?.id === t.id}
            onSelect={onSelect}
            onBook={onBook}
            vatMode={vatMode}
            senderPrefill={senderPrefill}
          />
        ))}

        {hasResults && !loading && (
          <div className="offers-recalc">
            <button className="offers-recalc-btn" onClick={onRecalculate} type="button">
              <Icon n="refresh" s={13} c="currentColor" /> Neu berechnen
            </button>
          </div>
        )}
      </div>

      {/* ── Trust Strip ── */}
      {showTrust && (
        <div className="offers-trust-strip">
          {TRUST_ITEMS.map(item => (
            <div key={item.title} className="offers-trust-item">
              <div className="offers-trust-icon">
                <Icon n={item.icon} s={17} c="var(--ce-color-brand)" />
              </div>
              <div>
                <div className="offers-trust-title">{item.title}</div>
                <div className="offers-trust-desc">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tipp Leiste ── */}
      {showTrust && (
        <div className="offers-tipp">
          <div className="offers-tipp-icon">
            <Icon n="lightbulb" s={15} c="var(--warn)" />
          </div>
          <p className="offers-tipp-text">
            <strong>Tipp:</strong> Vergleichen Sie Preis, Laufzeit und Abholart, bevor Sie ein Angebot auswählen.
          </p>
        </div>
      )}
    </div>
  );
}
