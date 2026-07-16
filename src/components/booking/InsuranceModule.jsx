import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { money } from "../../utils/formatters";

// Transportversicherung — REINE DARSTELLUNG. Auswahl, Reprice, Validierung,
// Preis-View-Model und /book-Übergabe bleiben im Orchestrator (BookingPage) und
// kommen über Props herein.
//
// Progressive Disclosure: bei „Kein Versicherungsschutz" werden keine Wertfelder
// gezeigt. Bei Standard/Premium ist der Warenwert das primäre Feld; der
// Versicherungswert wird automatisch aus dem Warenwert vorbelegt und nur bei
// Bedarf über „Versicherungswert anpassen" eingeblendet. Das frühere
// Inhaltsbeschreibungs-Feld ist bewusst entfernt (der technische
// contentDescription-Default bleibt im Orchestrator unverändert erhalten).
//
// Karten: neutraler Grundzustand, nur die AUSGEWÄHLTE Karte ist blau hervorgehoben.
// Preise stammen aus dem zentralen Price-View-Model (nur „ab"-Preselect ODER exakter
// Aufpreis der ausgewählten, bestätigten Stufe) — keine lokale Prämienberechnung,
// keine zweite Reprice-Anfrage für die nicht gewählte Stufe.

// Statische Karteninhalte (bewusst übernommen, unverändert). `info` → dezentes
// neutrales Icon, sonst dezenter grüner Haken. Haftungsbedingungen → AGB § 10.
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

function CardPrice({ price }) {
  const p = price || { kind: "zero", value: 0 };
  if (p.kind === "unknown") {
    return (
      <span className="ins-card-price">
        <span className="ins-card-price-val ins-card-price-val--muted">Preis nach Warenwert</span>
      </span>
    );
  }
  const prefix = p.kind === "exact" ? "+ " : p.kind === "preselect" ? "ab " : "";
  const withSub = p.kind === "exact" || p.kind === "preselect";
  return (
    <span className="ins-card-price">
      <span className="ins-card-price-val">{prefix}{money(p.value)}</span>
      {withSub && <span className="ins-card-price-sub">steuerfrei</span>}
    </span>
  );
}

export function InsuranceModule({
  insCards, insuranceType, onSelectType,
  isInsured,
  goodsValue, onGoodsValueChange, goodsValueError,
  insuranceValue, onInsuranceValueChange, insValueError,
  insValueFieldVisible, onRevealInsValue, goodsOverMax, insuranceValueMax,
  repriceError, isRepricing, isStale, repriceConfirmed,
}) {
  const pending = isRepricing || isStale;
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

      {/* Drei Optionskarten — Grundzustand neutral, nur die Auswahl blau. */}
      <div className="ins-cards" role="radiogroup" aria-label="Transportversicherung wählen">
        {insCards.map(c => {
          const selected = insuranceType === c.id;
          const copy = CARD_COPY[c.id] || { bullets: [], link: null };
          return (
            <label key={c.id} className={`ins-card${selected ? " ins-card--selected" : ""}`}>
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
                {c.id === "premium" && <span className="ins-card-badge">Erweiterter Schutz</span>}
                <CardPrice price={c.price} />
              </span>

              {selected && isInsured && pending && (
                <span className="ins-card-calc" aria-live="polite">
                  <span className="spinner spinner-dark" /> Preis wird berechnet …
                </span>
              )}

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
                </span>
              )}
            </label>
          );
        })}
      </div>

      {/* Wertfelder NUR bei Standard/Premium (Progressive Disclosure). */}
      {isInsured && (
        <div className="ins-inputs">
          <div className="field">
            <label className="field-label" htmlFor="ins-goods">Warenwert der Sendung (EUR)</label>
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

          {goodsOverMax && (
            <p className="ins-overmax" role="note">
              <Icon n="info" s={14} c="currentColor" />
              <span>
                Der Warenwert liegt über dem maximal versicherbaren Betrag.
                Bitte wählen Sie einen Versicherungswert bis {money(insuranceValueMax)}.
              </span>
            </p>
          )}

          {insValueFieldVisible ? (
            <div className="field">
              <label className="field-label" htmlFor="ins-value">Versicherungswert (EUR)</label>
              <input
                id="ins-value"
                className={`field-input${insValueError ? " field-input-error" : ""}`}
                type="number" inputMode="decimal" min="0" max={insuranceValueMax} step="0.01"
                value={insuranceValue}
                onChange={e => onInsuranceValueChange(e.target.value)}
                placeholder="z. B. 500"
              />
              {insValueError
                ? <span className="field-error">{insValueError}</span>
                : <span className="field-hint">Maximal {money(insuranceValueMax)}. Standardmäßig entspricht er dem Warenwert.</span>}
            </div>
          ) : (
            <button type="button" className="ins-adjust-btn" onClick={onRevealInsValue}>
              Versicherungswert anpassen
            </button>
          )}
        </div>
      )}

      {/* Reprice-Status + steuerfrei-Hinweis (nur bei versicherter Auswahl). */}
      {isInsured && (
        <div className="ins-after">
          <div className="ins-status" aria-live="polite">
            {repriceError ? (
              <span className="ins-status-error"><Icon n="info" s={14} c="currentColor" /> {repriceError}</span>
            ) : pending ? (
              <span className="ins-status-loading"><span className="spinner spinner-dark" /> Preis wird aktualisiert…</span>
            ) : repriceConfirmed ? (
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
