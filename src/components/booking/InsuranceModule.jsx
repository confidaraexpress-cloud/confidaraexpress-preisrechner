import React from "react";
import { Icon } from "../ui/Icon";
import { money } from "../../utils/formatters";

// Zusatzversicherung (F1/F2) — REINE DARSTELLUNG. Die gesamte Logik (State,
// Reprice, Validierung, Stale-Gating, /book-Übergabe) bleibt im Orchestrator
// (BookingPage) und wird über Props hereingereicht. Warenwert und
// Versicherungswert sind bewusst GETRENNTE Felder mit eigener Validierung.
// Alle angezeigten Deckungsfakten stammen aus real vorhandenen Backend-Feldern
// — keine erfundenen Aussagen (kein „100 % versichert", keine „Selbstbeteiligung",
// kein „Priority Support", kein Bedingungen-Link ohne echte URL).
export function InsuranceModule({
  insCards, insuranceType, onSelectType,
  isInsured,
  goodsValue, onGoodsValueChange, goodsValueError,
  insuranceValue, onInsuranceValueChange, insValueError,
  insContent, onInsContentChange, contentPlaceholder,
  insBase, insProvider, insLiability,
  repriceError, repricePending, repriceResult, repriceStale,
}) {
  // Objektive Deckungsfakten — jede Zeile nur, wenn der Wert real vorhanden ist.
  const facts = [
    insBase != null      ? { label: "Grunddeckung", value: `max. ${money(insBase)}` } : null,
    insProvider          ? { label: "Versicherer", value: insProvider } : null,
    insLiability != null ? { label: "Haftung (gewichtsabhängig)", value: `max. ${money(insLiability)}` } : null,
  ].filter(Boolean);

  return (
    <div className="booking-insurance-box">
      <div className="ins-head">
        <span className="ins-head-title"><Icon n="shieldCheck" s={16} c="currentColor" /> Zusatzversicherung</span>
        <span className="ins-badge-taxfree">steuerfrei</span>
      </div>
      <p className="ins-head-sub">
        Optional — sichern Sie den Warenwert Ihrer Sendung über die im Tarif
        enthaltene Grunddeckung hinaus zusätzlich ab.
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
          {facts.length > 0 && (
            <div className="ins-facts" aria-label="Deckungsangaben">
              {facts.map((f, i) => (
                <div key={i} className="ins-fact">
                  <span className="ins-fact-label">{f.label}</span>
                  <span className="ins-fact-val">{f.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Warenwert und Versicherungswert bewusst GETRENNT — sauber erklärt. */}
          <div className="ins-value-grid">
            <div className="field">
              <label className="field-label" htmlFor="ins-goods">Warenwert (EUR)</label>
              <input
                id="ins-goods"
                className={`field-input${goodsValueError ? " field-input-error" : ""}`}
                type="number" inputMode="decimal" min="0" max="9999999" step="0.01"
                value={goodsValue}
                onChange={e => onGoodsValueChange(e.target.value)}
                placeholder="z. B. 500"
              />
              {goodsValueError
                ? <span className="field-error">{goodsValueError}</span>
                : <span className="field-hint">Tatsächlicher Warenwert der Sendung.</span>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="ins-value">Versicherungswert (EUR)</label>
              <input
                id="ins-value"
                className={`field-input${insValueError ? " field-input-error" : ""}`}
                type="number" inputMode="decimal" min="0" max="20000" step="0.01"
                value={insuranceValue}
                onChange={e => onInsuranceValueChange(e.target.value)}
                placeholder="z. B. 500"
              />
              {insValueError
                ? <span className="field-error">{insValueError}</span>
                : <span className="field-hint">Gewünschte zusätzliche Versicherungssumme (max. 20.000 €).</span>}
            </div>
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
            <span className="field-hint">Kurze Beschreibung des Sendungsinhalts für die Versicherung.</span>
          </div>

          {/* Live-Status statt manuellem Button — der debounced Reprice läuft
              automatisch im Orchestrator (Logik unverändert). */}
          <div className="ins-status" aria-live="polite">
            {repriceError ? (
              <span className="ins-status-error"><Icon n="info" s={14} c="currentColor" /> {repriceError}</span>
            ) : repricePending ? (
              <span className="ins-status-loading"><span className="spinner spinner-dark" /> Preis wird aktualisiert…</span>
            ) : (repriceResult && !repriceStale) ? (
              <span className="ins-status-ok"><Icon n="check" s={14} c="currentColor" /> Versicherungspreis bestätigt</span>
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
