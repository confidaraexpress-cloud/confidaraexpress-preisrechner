import React, { useMemo, useState } from "react";
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
  maxPrice, maxDays, onMaxPriceChange, onMaxDaysChange, onClearFilters,
  vatMode, onVatToggle,
}) {
  const [filterOpen, setFilterOpen] = useState(false);
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

  const activeFilterCount = [maxPrice, maxDays].filter(Boolean).length;
  const hasFilter  = activeFilterCount > 0;
  const showCards  = !loading && sorted.length > 0;
  const showSortBar = hasResults && !loading && tariffs.length > 0;
  const showTrust  = hasResults && !loading && tariffs.length > 0;

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
        <div className="offers-trust-badges">
          <div className="offers-trust-badge">
            <Icon n="shield" s={13} c="rgba(255,255,255,0.9)" />
            <span>Sicher &amp; verschlüsselt</span>
          </div>
          <div className="offers-trust-badge">
            <Icon n="headset" s={13} c="rgba(255,255,255,0.9)" />
            <span>Persönlicher Support</span>
          </div>
        </div>
      </div>

      {/* ── Sort + Filter Bar ── */}
      {showSortBar && (
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
          <button
            className={`offers-sort-btn offers-filter-btn${hasFilter ? " has-filter" : ""}`}
            onClick={() => setFilterOpen(o => !o)}
            type="button"
          >
            <Icon n="filter" s={12} c="currentColor" />
            Filter
          </button>
          {hasFilter && (
            <>
              <span className="offers-filter-active-badge">
                <span className="offers-filter-active-dot" />
                {activeFilterCount > 1 ? `${activeFilterCount} Filter aktiv` : "Filter aktiv"}
              </span>
              <button className="offers-filter-reset-btn" onClick={onClearFilters} type="button">
                <Icon n="x" s={11} c="currentColor" />
                Filter zurücksetzen
              </button>
            </>
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
      )}

      {/* ── Filter Panel ── */}
      {showSortBar && filterOpen && (
        <div className="offers-filter-panel">
          <div className="field-row field-row-2">
            <div className="field offers-price-filter">
              <div className="offers-price-filter-head">
                <label className="field-label offers-price-filter-label">Maximaler Preis</label>
                <span className="offers-price-filter-value">
                  {maxPrice ? `bis ${money(Number(maxPrice))} netto` : "Alle Preise"}
                </span>
              </div>
              <input
                type="range"
                className="offers-price-slider"
                min={0}
                max={hasPriceRange ? priceSliderMax : 0}
                step={1}
                value={priceSliderValue}
                onChange={handlePriceSlider}
                disabled={!hasPriceRange}
              />
              <div className="offers-price-scale">
                <span>0 €</span>
                <span>{hasPriceRange ? money(priceSliderMax) : "—"}</span>
              </div>
            </div>
            <div className="field">
              <label className="field-label">Max. Lieferzeit (Tage)</label>
              <input
                className="field-input"
                type="number"
                value={maxDays}
                onChange={e => onMaxDaysChange(e.target.value)}
                placeholder="Kein Limit"
              />
            </div>
          </div>
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
            <div className="offers-empty-icon">🔍</div>
            <p className="offers-empty-title">Keine Tarife gefunden</p>
            <p className="offers-empty-sub">
              Für diese Route und das gewählte Datum wurden keine Tarife gefunden.
              Ändern Sie das Datum oder wählen Sie „Alle Dienstleistungen".
            </p>
          </div>
        )}

        {!loading && hasResults && tariffs.length > 0 && filtered.length === 0 && (
          <div className="offers-empty">
            <div className="offers-empty-icon">🎯</div>
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
                <Icon n={item.icon} s={17} c="#1D4ED8" />
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
            <Icon n="lightbulb" s={15} c="#d97706" />
          </div>
          <p className="offers-tipp-text">
            <strong>Tipp:</strong> Der empfohlene Tarif bietet das optimale Preis-Leistungs-Verhältnis für Ihre Sendung.
            Bei regelmäßigen Sendungen sparen Sie mit einem Vertragstarif noch mehr.
          </p>
        </div>
      )}
    </div>
  );
}
