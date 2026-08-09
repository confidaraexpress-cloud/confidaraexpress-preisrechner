import React, { useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { money } from "../../utils/formatters";
import { InsuranceDetailsDialog } from "./InsuranceDetailsDialog";
import {
  INSURANCE_CARD_COPY,
  INSURANCE_TEXT,
  carrierTermsHref,
} from "../../utils/insuranceTerms.mjs";
import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from "../../utils/externalLink.mjs";

// Transportversicherung — REINE DARSTELLUNG. Auswahl, Reprice, Validierung,
// Preis-View-Model und /book-Übergabe bleiben im Orchestrator (BookingPage) und
// kommen über Props herein.
//
// Progressive Disclosure: bei „Keine zusätzliche Transportversicherung" werden
// keine Wertfelder gezeigt. Bei Standard/Premium ist der Warenwert das primäre Feld; der
// Versicherungswert wird automatisch aus dem Warenwert vorbelegt und nur bei
// Bedarf über „Versicherungswert anpassen" eingeblendet. Das frühere
// Inhaltsbeschreibungs-Feld ist bewusst entfernt (der technische
// contentDescription-Default bleibt im Orchestrator unverändert erhalten).
//
// Karten: neutraler Grundzustand, nur die AUSGEWÄHLTE Karte ist blau hervorgehoben.
// Preise stammen aus dem zentralen Price-View-Model (nur „ab"-Preselect ODER exakter
// Aufpreis der ausgewählten, bestätigten Stufe) — keine lokale Prämienberechnung,
// keine zweite Reprice-Anfrage für die nicht gewählte Stufe.

// Karteninhalte kommen aus dem zentralen Datenmodul (utils/insuranceTerms.mjs) —
// dieselbe Quelle speist den Detaildialog, damit Karte und Dialog nicht
// auseinanderlaufen können. `info` → dezentes neutrales Icon, sonst dezenter
// grüner Haken.
//
// Der frühere statische Link auf /agb#paragraf-10 ist ERSATZLOS entfallen: dort
// steht die Vertragshaftung von ConfidaraExpress, nicht die Beförderungs-
// bedingung des Versanddienstleisters. Diese kommt jetzt tarifgenau aus
// tariff.carrierLinks.agb — und wenn der Tarif keine liefert, steht dort nur
// der neutrale Hinweistext und KEIN Link.
const CARD_COPY = INSURANCE_CARD_COPY;

// Barrierefreier Name des nativen Radios: Kartenname + Preis in Worten, damit der
// Preis NICHT nur farblich/visuell transportiert wird (Screenreader lesen ihn mit).
function cardAriaLabel(c) {
  const p = (c && c.price) || { kind: "zero", value: 0 };
  const priceTxt =
    p.kind === "exact"     ? `Aufpreis ${money(p.value)}` :
    p.kind === "preselect" ? `ab ${money(p.value)}, steuerfrei` :
    p.kind === "unknown"   ? "Preis nach Warenwert" :
                             money(0);
  return `${c.name}: ${priceTxt}`;
}

// „50,00 €"-artige Beträge typografisch zusammenhalten (kein Umbruch zwischen Zahl
// und Eurozeichen) — rein darstellend, OHNE die Kartentexte fachlich zu verändern.
const AMOUNT_RE = /(\d[\d.]*,\d{2}\s?€)/;
function withAmountNoWrap(text) {
  return text.split(AMOUNT_RE).map((part, i) =>
    AMOUNT_RE.test(part)
      ? <span key={i} className="ins-nowrap">{part}</span>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}

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
  isInsured, tariff,
  goodsValue, onGoodsValueChange, onGoodsValueBlur, goodsValueError,
  insuranceValue, onInsuranceValueChange, onInsuranceValueBlur, insValueError,
  insValueFieldVisible, onRevealInsValue, goodsOverMax, insuranceValueMax,
  repriceError, isRepricing, isStale, repriceConfirmed,
}) {
  const pending = isRepricing || isStale;
  // Bedingungslink des GEWÄHLTEN TARIFS — null, wenn der Tarif keinen (gültigen)
  // liefert. Dann erscheint kein Link, nicht etwa ein Ersatzlink.
  const carrierTerms = carrierTermsHref(tariff);

  // Reiner UI-Zustand des Detaildialogs (nichts davon wird gespeichert oder
  // gebucht). Das Rückgabeziel merkt sich den auslösenden Knopf, damit der
  // Fokus nach dem Schließen genau dorthin zurückkehrt.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsTrigger = useRef(null);
  const openDetails = (e) => { detailsTrigger.current = e.currentTarget; setDetailsOpen(true); };

  return (
    <div className="booking-insurance-box">
      <div className="ins-head">
        <span className="ins-head-title"><Icon n="shieldCheck" s={18} c="currentColor" /> {INSURANCE_TEXT.sectionTitle}</span>
        <span className="ins-badge-taxfree">steuerfrei</span>
      </div>
      <p className="ins-head-sub">{INSURANCE_TEXT.sectionIntro}</p>

      {/* Drei Optionskarten — Grundzustand neutral, nur die Auswahl blau. */}
      <div className="ins-cards" role="radiogroup" aria-label="Transportversicherung wählen">
        {insCards.map(c => {
          const selected = insuranceType === c.id;
          const copy = CARD_COPY[c.id] || { bullets: [] };
          return (
            <label key={c.id} className={`ins-card${selected ? " ins-card--selected" : ""}`}>
              <input
                type="radio"
                name="insuranceType"
                value={c.id}
                checked={selected}
                onChange={() => onSelectType(c.id)}
                aria-label={cardAriaLabel(c)}
              />
              {/* Stabiler Kartenkopf als 2-Spalten-Grid: links Titelbereich (Name +
                  Badge darunter), rechts der Preis. Name und Preis konkurrieren nie
                  um dieselbe Zeile; das Badge sitzt immer direkt unter dem Namen. */}
              <span className="ins-card-head">
                <span className="ins-card-title-area">
                  <span className="ins-card-head-name">
                    <span className="ins-card-radio" aria-hidden="true" />
                    <span className="ins-card-name" lang="de">{c.name}</span>
                  </span>
                  {copy.badge && <span className="ins-card-badge">{copy.badge}</span>}
                </span>
                <CardPrice price={c.price} />
              </span>

              {selected && isInsured && pending && (
                <span className="ins-card-calc" aria-live="polite">
                  <span className="spinner spinner-dark" /> Preis wird berechnet …
                </span>
              )}

              {/* Ein Satz je Karte: worin sich diese Option unterscheidet. */}
              {copy.description && <span className="ins-card-desc">{copy.description}</span>}

              {copy.bullets.length > 0 && (
                <ul className="ins-card-bullets">
                  {copy.bullets.map((b, i) => (
                    <li key={i} className="ins-card-bullet">
                      <span className={`ins-bullet-ico ins-bullet-ico--${b.info ? "info" : "check"}`}>
                        <Icon n={b.info ? "info" : "check"} s={14} c="currentColor" />
                      </span>
                      <span className="ins-bullet-txt">{withAmountNoWrap(b.text)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Fußzeile der Karte: genau EIN Weg zu den Details.
                  Standard/Premium → CE-Zusammenfassung im Dialog.
                  Keine Zusatzversicherung → Bedingungen DIESES Tarifs, sofern
                  der Tarif welche liefert; sonst gar nichts (der neutrale Satz
                  steht bereits als Beschreibung oben). Ein <button>/<a> ist
                  interaktiver Inhalt und schaltet das Radio des umgebenden
                  <label> nicht mit — die Auswahl bleibt unberührt. */}
              {copy.hasDetails && (
                <span className="ins-card-cond">
                  <button type="button" className="ins-card-details-btn" onClick={openDetails}>
                    {INSURANCE_TEXT.detailsAction}
                  </button>
                </span>
              )}
              {copy.hasCarrierTerms && carrierTerms && (
                <span className="ins-card-cond">
                  <a
                    className="ins-card-terms-link"
                    href={carrierTerms}
                    target={EXTERNAL_LINK_TARGET}
                    rel={EXTERNAL_LINK_REL}
                  >
                    <span>{INSURANCE_TEXT.carrierTerms}</span>
                    <Icon n="external" s={13} c="currentColor" />
                  </a>
                </span>
              )}
            </label>
          );
        })}
      </div>

      <InsuranceDetailsDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        returnFocusTo={detailsTrigger}
      />

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
              onBlur={onGoodsValueBlur}
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
                onBlur={onInsuranceValueBlur}
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
