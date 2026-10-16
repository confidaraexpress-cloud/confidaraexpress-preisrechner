import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  OUTCOME, OUTCOME_TEXT, SORT_OPTIONS, carrierChoices, filterOffersByCarrier, resultAnnouncement, sortPublicOffers,
} from "../utils/publicCalculatorView.mjs";
import { Field } from "../components/ui/Field";
import { PublicOfferCard } from "./PublicOfferCard.jsx";

// ── Ergebnisbereich (Portal in #pc-results) ──────────────────────────────────
// Überschrift und Einleitung stehen statisch in der Seite; hier entstehen nur
// Wartezustand, Hinweise und Karten. Der Wartezustand reserviert den Platz der
// Karten (Skelette), damit nichts springt. Carrierauswahl und Ordnung laufen im
// Browser über die bereits geladenen Angebote — kein neuer Request.

const WIEDERHOLBAR = new Set([OUTCOME.NETWORK, OUTCOME.TIMEOUT, OUTCOME.UPSTREAM, OUTCOME.SERVER]);
const SKELETTE = [0, 1, 2];

function Hinweis({ ton, titel, text, id, role = "status", children = null }) {
  return (
    <div className={`pc-notice pc-notice--${ton}`} role={role} id={id}>
      <p className="pc-notice-title">{titel}</p>
      {text && <p className="pc-notice-text">{text}</p>}
      {children}
    </div>
  );
}

function Warten({ langsam, sekunden }) {
  return (
    <div className="pc-loading" id="pc-loading">
      <div className="pc-loading-status">
        <p className="pc-loading-title">Die Preise werden bei den Versanddienstleistern abgefragt.</p>
        <p className="pc-loading-time" aria-hidden="true">Seit {sekunden} {sekunden === 1 ? "Sekunde" : "Sekunden"}</p>
        {langsam && (
          <p className="pc-loading-slow" id="pc-loading-slow">
            Einige Versanddienstleister benötigen für ihre Preise etwas länger. Die Berechnung läuft weiter.
          </p>
        )}
      </div>
      <ul className="pc-offers" aria-hidden="true">
        {SKELETTE.map((i) => <li key={i} className="pc-offer pc-offer--skeleton"><span className="pc-skeleton-line" /><span className="pc-skeleton-line pc-skeleton-line--short" /><span className="pc-skeleton-block" /></li>)}
      </ul>
    </div>
  );
}

function Liste({ ergebnis }) {
  const angebote = ergebnis.result ? ergebnis.result.offers : [];
  const [carrier, setCarrier] = useState([]);
  const [ordnung, setOrdnung] = useState("recommended");
  const auswahl = useMemo(() => carrierChoices(ergebnis.result ? ergebnis.result.publicCarriers : [], angebote),
    [ergebnis, angebote]);
  const sichtbar = useMemo(() => sortPublicOffers(filterOffersByCarrier(angebote, carrier), ordnung),
    [angebote, carrier, ordnung]);
  const umschalten = (id) => setCarrier((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <>
      <div className="pc-toolbar">
        <p className="pc-count" id="pc-count">
          {sichtbar.length === 1 ? "1 Angebot" : `${sichtbar.length} Angebote`}
          {carrier.length > 0 && ` von ${angebote.length}`}
        </p>
        {auswahl.length > 1 && (
          <fieldset className="pc-chips">
            <legend className="pc-chips-legend">Versanddienstleister</legend>
            {auswahl.map((c) => (
              <label key={c.id} className={`pc-chip${carrier.includes(c.id) ? " pc-chip--on" : ""}`}>
                <input type="checkbox" className="pc-chip-input" id={`pc-carrier-${c.id}`}
                  checked={carrier.includes(c.id)} onChange={() => umschalten(c.id)} />
                <span>{c.label}</span>
              </label>
            ))}
          </fieldset>
        )}
        <Field as="select" id="pc-sort" label="Sortierung" value={ordnung} onChange={(v) => setOrdnung(v)} className="pc-sort">
          {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Field>
      </div>
      {sichtbar.length === 0 ? (
        <Hinweis ton="info" titel="Keine Angebote für diese Auswahl" text="Für die gewählten Versanddienstleister liegt kein Angebot vor." id="pc-filter-empty">
          <button type="button" className="pc-button pc-button--secondary" onClick={() => setCarrier([])}>Auswahl zurücksetzen</button>
        </Hinweis>
      ) : (
        <ul className="pc-offers" id="pc-offers">
          {sichtbar.map((o, i) => <li key={o.productKey || `angebot-${i}`} className="pc-offers-item"><PublicOfferCard offer={o} index={i} /></li>)}
        </ul>
      )}
    </>
  );
}

export function PublicResults({ host, phase, ergebnis, langsam, sekunden, onRetry }) {
  // Die statische Einleitung weicht, sobald gerechnet wird — ohne den Platz der Überschrift zu verändern.
  useEffect(() => {
    const intro = document.getElementById("pc-results-intro");
    if (intro) intro.hidden = phase !== "idle";
  }, [phase]);

  if (!host) return null;
  const ausgang = ergebnis ? ergebnis.outcome : null;
  const anzahl = ergebnis && ergebnis.result ? ergebnis.result.offers.length : 0;
  const ansage = phase === "done" ? resultAnnouncement(ausgang, anzahl) : "";

  let inhalt = null;
  if (phase === "loading") {
    inhalt = <Warten langsam={langsam} sekunden={sekunden} />;
  } else if (phase === "done" && ergebnis) {
    const t = OUTCOME_TEXT[ausgang];
    if (ausgang === OUTCOME.OK || (ausgang === OUTCOME.PARTIAL && anzahl > 0)) {
      inhalt = (
        <>
          {ausgang === OUTCOME.PARTIAL && <Hinweis ton="warning" titel={t.title} text={t.message} id="pc-partial" />}
          <Liste key={ergebnis.request ? JSON.stringify(ergebnis.request) : "liste"} ergebnis={ergebnis} />
        </>
      );
    } else if (ausgang === OUTCOME.NO_OFFERS || ausgang === OUTCOME.PARTIAL) {
      inhalt = <Hinweis ton="info" titel={OUTCOME_TEXT[OUTCOME.NO_OFFERS].title}
        text={ausgang === OUTCOME.PARTIAL ? t.message : OUTCOME_TEXT[OUTCOME.NO_OFFERS].message} id="pc-empty" />;
    } else if (t) {
      inhalt = (
        <Hinweis ton={ausgang === OUTCOME.INVALID ? "warning" : "error"} titel={t.title} text={t.message} id={`pc-outcome-${ausgang}`} role="alert">
          {WIEDERHOLBAR.has(ausgang) && (
            <button type="button" className="pc-button pc-button--secondary" id="pc-retry" onClick={onRetry}>Erneut versuchen</button>
          )}
        </Hinweis>
      );
    }
  }

  return createPortal(
    <div className="pc-results" data-phase={phase}>
      <p className="pc-sr-only" aria-live="polite" id="pc-results-status">{ansage}</p>
      {inhalt}
    </div>,
    host,
  );
}
