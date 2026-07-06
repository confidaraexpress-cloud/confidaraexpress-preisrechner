import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";

// Transportversicherung — REINE DARSTELLUNG. Die gesamte Logik (State, Reprice,
// Validierung, Stale-Gating, /book-Übergabe) bleibt im Orchestrator (BookingPage)
// und wird über Props hereingereicht. Warenwert und Versicherungswert bleiben
// getrennte Felder mit eigener Validierung.
//
// Aufbau bewusst nah an JUMiNGO: Header + Erklärung, Eingabefelder oben, drei
// Optionskarten nebeneinander mit Bulletpoints und Bedingungs-Link je Karte —
// optisch aber im ConfidaraExpress-Premium-Stil, ohne JUMiNGO-Branding und ohne
// fremde Logos. Die Bulletpoints sind bewusst übernommene statische Inhalte; der
// Versicherer wird nur als Text gezeigt, wenn er aus echten Daten kommt (insProvider).

// Statische Karteninhalte (bewusst übernommen). `info` → dezentes Info-Icon,
// sonst grüner Haken. `href: null` → nicht-navigierender Info-Link (keine lokale
// Versicherungsbedingungen-Seite vorhanden). Haftungsbedingungen → AGB § 10.
const CARD_COPY = {
  standard: {
    bullets: [
      { text: "Wert zu 100% versichert" },
      { text: "Selbstbeteiligung 50,00 €", info: true },
      { text: "Regulärer Support" },
    ],
    link: { label: "Versicherungsbedingungen", href: null },
  },
  premium: {
    bullets: [
      { text: "Wert zu 100% versichert" },
      { text: "Keine Selbstbeteiligung" },
      { text: "Priority Kundensupport" },
      { text: "Wöchentliche Status-Updates" },
    ],
    link: { label: "Versicherungsbedingungen", href: null },
  },
  none: {
    bullets: [
      { text: "Haftung ist gewichtsabhängig", info: true },
      { text: "Keine Selbstbeteiligung" },
      { text: "Regulärer Support" },
    ],
    link: { label: "Haftungsbedingungen", href: "/agb#paragraf-10" },
  },
};

export function InsuranceModule({
  insCards, insuranceType, onSelectType,
  isInsured,
  goodsValue, onGoodsValueChange, goodsValueError,
  insuranceValue, onInsuranceValueChange, insValueError,
  insContent, onInsContentChange, contentPlaceholder,
  insProvider,
  repriceError, repricePending, repriceResult, repriceStale,
}) {
  return (
    <div className="booking-insurance-box">
      <div className="ins-head">
        <span className="ins-head-title"><Icon n="shieldCheck" s={18} c="currentColor" /> Transportversicherung</span>
        <span className="ins-badge-taxfree">steuerfrei</span>
      </div>
      <p className="ins-head-sub">
        Mit der passenden Transportversicherung schützen Sie Ihre Sendung
        zuverlässig vor Verlust, Diebstahl und Transportschäden.
      </p>

      {/* Eingabefelder oben — Warenwert und Versicherungswert bewusst GETRENNT. */}
      <div className="ins-inputs">
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
      </div>

      {/* Drei Optionskarten nebeneinander (mobil untereinander). */}
      <div className="ins-cards" role="radiogroup" aria-label="Transportversicherung wählen">
        {insCards.map(c => {
          const selected = insuranceType === c.id;
          const copy = CARD_COPY[c.id] || { bullets: [], link: null };
          return (
            <label
              key={c.id}
              className={`ins-card ins-card--${c.tone}${selected ? " ins-card--selected" : ""}`}
            >
              <input
                type="radio"
                name="insuranceType"
                value={c.id}
                checked={selected}
                onChange={() => onSelectType(c.id)}
              />
              <span className="ins-card-head">
                <span className="ins-card-head-l">
                  <span className="ins-card-radio" aria-hidden="true" />
                  <span className="ins-card-name" lang="de">{c.name}</span>
                </span>
                {c.priceVal != null && (
                  <span className="ins-card-price">
                    <span className="ins-card-price-val">{c.pricePrefix}{c.priceVal}</span>
                    {c.priceSub && <span className="ins-card-price-sub">{c.priceSub}</span>}
                  </span>
                )}
              </span>

              <ul className="ins-card-bullets">
                {copy.bullets.map((b, i) => (
                  <li key={i} className="ins-card-bullet">
                    <span className={`ins-bullet-ico ins-bullet-ico--${b.info ? "info" : "check"}`}>
                      <Icon n={b.info ? "info" : "check"} s={14} c="currentColor" />
                    </span>
                    <span className="ins-bullet-txt">{b.text}</span>
                  </li>
                ))}
              </ul>

              {copy.link && (
                <span className="ins-card-cond">
                  {copy.link.href
                    ? <Link to={copy.link.href} className="ins-card-cond-link">{copy.link.label}</Link>
                    : <span className="ins-card-cond-link ins-card-cond-link--static" role="note">{copy.link.label}</span>}
                  {c.id !== "none" && insProvider && <span className="ins-card-provider">· {insProvider}</span>}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {/* Reprice-Status + steuerfrei-Hinweis (nur bei versicherter Auswahl). */}
      {isInsured && (
        <div className="ins-after">
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
