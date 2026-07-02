import React from "react";
import { Icon } from "../ui/Icon";

// Zusatzversicherung (F1/F2) — REINE DARSTELLUNG. Die gesamte Logik (State,
// Reprice, Validierung, Stale-Gating, /book-Übergabe) bleibt im Orchestrator
// (BookingPage) und wird über Props hereingereicht. Verhalten unverändert.
export function InsuranceModule({
  insCards, insuranceType, onSelectType,
  isInsured, insuredValue, onInsuredValueChange,
  insContent, onInsContentChange, insValueError, contentPlaceholder,
  repriceError, repricePending, repriceResult, repriceStale,
}) {
  return (
    <div className="booking-insurance-box">
      <div className="ins-head">
        <span className="ins-head-title"><Icon n="shield" s={16} c="currentColor" /> Zusatzversicherung</span>
        <span className="ins-badge-taxfree">steuerfrei</span>
      </div>
      <p className="ins-head-sub">
        Optional — sichern Sie den Warenwert Ihrer Sendung zusätzlich ab.
      </p>

      <div className="ins-cards" role="radiogroup" aria-label="Zusatzversicherung wählen">
        {insCards.map(c => {
          const selected = insuranceType === c.id;
          return (
            <label
              key={c.id}
              className={`ins-card${selected ? " ins-card--selected" : ""}${c.muted ? " ins-card--muted" : ""}${c.hero ? " ins-card--hero" : ""}`}
            >
              <input
                type="radio"
                name="insuranceType"
                value={c.id}
                checked={selected}
                onChange={() => onSelectType(c.id)}
              />
              <span className="ins-card-radio" aria-hidden="true" />
              <span className="ins-card-main">
                <span className="ins-card-name">{c.name}</span>
                <span className="ins-card-desc">{c.desc}</span>
                {c.trust && <span className="ins-card-trust">{c.trust}</span>}
              </span>
              <span className="ins-card-price">
                {c.priceVal != null && (
                  <span className="ins-card-price-val">{c.pricePrefix}{c.priceVal}</span>
                )}
                {c.priceSub && <span className="ins-card-price-sub">{c.priceSub}</span>}
              </span>
            </label>
          );
        })}
      </div>

      {isInsured && (
        <div className="ins-fields">
          <div className="field">
            <label className="field-label" htmlFor="ins-value">Versicherter Wert (EUR)</label>
            <input
              id="ins-value"
              className={`field-input${insValueError ? " field-input-error" : ""}`}
              type="number" inputMode="decimal" min="0" max="20000" step="0.01"
              value={insuredValue}
              onChange={e => onInsuredValueChange(e.target.value)}
              placeholder="z. B. 500"
            />
            {insValueError && <span className="field-error">{insValueError}</span>}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="ins-content">
              Inhaltsbeschreibung <span className="field-optional">(max. 35 Zeichen)</span>
            </label>
            <input
              id="ins-content"
              className="field-input"
              value={insContent}
              onChange={e => onInsContentChange(e.target.value)}
              placeholder={contentPlaceholder}
              maxLength={35}
            />
          </div>
          {/* Live-Status statt manuellem Button — der debounced Reprice läuft
              automatisch im Orchestrator (Logik unverändert). */}
          <div className="ins-status" aria-live="polite">
            {repriceError ? (
              <span className="ins-status-error"><Icon n="info" s={14} c="currentColor" /> {repriceError}</span>
            ) : repricePending ? (
              <span className="ins-status-loading"><span className="spinner spinner-dark" /> Preis wird aktualisiert…</span>
            ) : (repriceResult && !repriceStale) ? (
              <span className="ins-status-ok">✓ Preis aktualisiert</span>
            ) : null}
          </div>
          <p className="ins-note">
            Die Zusatzversicherung ist steuerfrei und wird ohne 19 % MwSt. separat ausgewiesen.
          </p>
        </div>
      )}
    </div>
  );
}
