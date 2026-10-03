import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { API } from "../api/client";
import { EmptyState } from "../components/ui/StateView";
import { resolveCarrierName } from "../utils/carrierMap";
import { TRACKING_NOT_FOUND } from "../utils/trackingMessages";
import { STATUS_STEPS, buildTrackingView } from "./trackingView";
import {
  trackingLegsOf, trackingLegEventCount, latestTrackingLegEvent, eventWhenText, trackingLegHeading,
  TRACKING_LEGS_TEXT,
} from "../utils/trackingLegsView.mjs";

const ERROR_MESSAGES = {
  400: "Bitte geben Sie eine gültige Trackingnummer ein.",
  404: TRACKING_NOT_FOUND,
  429: "Zu viele Anfragen. Bitte versuchen Sie es später erneut.",
  500: "Tracking aktuell nicht verfügbar.",
};

// Ereignisse nach Tag gruppieren, Reihenfolge bleibt erhalten.
function nachTagen(liste) {
  const gruppen = [];
  liste.forEach((ev) => {
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.day === ev.groupKey) letzte.items.push(ev);
    else gruppen.push({ day: ev.groupKey, items: [ev] });
  });
  return gruppen;
}

export default function TrackingPage({ utility = null } = {}) {
  const [id, setId] = useState("");
  const [searchedKey, setSearchedKey] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // trackingKey wird explizit übergeben, wenn die Suche aus dem Deep-Link kommt:
  // der State ist im selben Commit noch nicht gesetzt, ein Rückgriff auf `id`
  // würde dort ins Leere laufen.
  const track = async (keyArg) => {
    const trackingKey = String(keyArg ?? id).trim();
    if (!trackingKey) return;
    setError(""); setLoading(true); setResult(null); setSearchedKey(trackingKey);
    let r;
    try {
      r = await fetch(`${API}/api/tracking/public/${encodeURIComponent(trackingKey)}`);
    } catch {
      setError("Tracking aktuell nicht verfügbar.");
      setLoading(false);
      return;
    }
    if (!r.ok) {
      setError(ERROR_MESSAGES[r.status] || "Tracking aktuell nicht verfügbar.");
      setLoading(false);
      return;
    }
    try {
      const d = await r.json();
      setResult(d);
    } catch {
      setError("Tracking aktuell nicht verfügbar.");
    }
    setLoading(false);
  };

  /* Deep-Link „/tracking?nummer=…" — der Trackinglink aus den Versand-E-Mails.
     Ohne ihn müsste der Empfänger die Nummer aus der Mail von Hand abtippen.
     Genau EINMAL beim Mount: `ranOnce` verhindert, dass ein späteres Rendern
     (oder ein Parameterwechsel) die Suche des Nutzers überschreibt. Ohne
     Parameter bleibt die Seite exakt wie bisher — ein leeres Suchfeld. */
  const [searchParams] = useSearchParams();
  const ranOnce = useRef(false);
  useEffect(() => {
    if (ranOnce.current) return;
    const key = (searchParams.get("nummer") || "").trim();
    if (!key) return;
    ranOnce.current = true;
    setId(key);
    track(key);
  }, [searchParams]);

  // ── Transportabschnitte (providerneutral) ─────────────────────────────────────────────────
  // Die öffentliche Trackingantwort hat für jeden Einkaufsweg DIESELBE Form: Ereignisse, Orte und
  // Zeitangaben stehen ausschließlich in `trackingLegs` — je Abschnitt, aufsteigend und ohne
  // erfundene Zeitzone (utils/trackingLegsView.mjs). Ein Rohobjekt eines Anbieters wird nicht
  // gelesen. Mehrere Abschnitte erscheinen getrennt, jeweils mit Carrier und Nummer — nie als „Paket 2".
  const legs = trackingLegsOf(result);
  const eventCount = trackingLegEventCount(legs);

  // Carrier: ausschließlich der neutrale Name der Antwort — nie ein Objekt rendern.
  const carrierName = typeof result?.carrier === "string" && result.carrier.trim() ? result.carrier.trim() : null;

  // ── Anzeige-Sicht aus REINER, unit-getesteter Logik (./trackingView) ─────────────────────────
  // Statusquelle ist AUSSCHLIESSLICH der Transportstatus result.trackingStatus. Ohne Events UND
  // ohne explizites Carrier-„delivered" bleibt die Timeline auf Stufe 0 — so entsteht nie
  // „Zugestellt" + „Keine Ereignisse" zugleich; ein echtes delivered bleibt auch bei leerer Liste sichtbar.
  const { heroStatus, heroDesc, stepIndex } = buildTrackingView(result, { hasEvents: eventCount > 0 });

  // Zeitpunkt des neuesten Ereignisses, wie er geliefert wurde — ohne Zone.
  const heroWhen = eventWhenText(latestTrackingLegEvent(legs));
  // Carrier nur als reiner Name ("UPS", "DHL Express", …) — resolveCarrierName
  // normalisiert Werte wie "UPS shipment tracking" auf den bekannten Namen.
  const carrierDisplay = carrierName ? resolveCarrierName(carrierName) : null;

  // Ereignisse nach Tag gruppieren, Reihenfolge bleibt erhalten — je Abschnitt eine Timeline.
  const sections = legs.map((leg) => ({
    key: leg.key,
    heading: legs.length > 1 ? trackingLegHeading(leg) : null,
    dayGroups: nachTagen(leg.events.map((ev) => ({
      description: ev.description,
      timeText: ev.time ? `${ev.time} ${TRACKING_LEGS_TEXT.timeSuffix}` : null,
      location: ev.location,
      groupKey: ev.day || TRACKING_LEGS_TEXT.noDate,
    }))),
  }));

  /* ── Darstellung (Redesign 2026-10) ──────────────────────────────────────────────────────────
     Dieselbe Titelrolle wie jede andere Seite (DM Sans 28/36, links), darunter EIN beschriftetes
     Feld mit „Verfolgen", dann der Ergebnisstatus und der Verlauf als ruhige chronologische
     Textliste. Öffentlich (/tracking) steht die Seite in schmaler Lesebreite, im Kundenbereich auf
     derselben Inhaltskante wie die Shell (dashboard.css, .tracking-page-wrap).

     Barrierefreiheit (Auditbefund P1): das sichtbare Label ist über htmlFor/id mit dem Feld
     verbunden, der erklärende Satz darüber über aria-describedby. Abfrage, Autofokus,
     Enter-Verhalten und Deep-Link sind unverändert. */
  const FELD_ID = "tracking-number-input";
  const HINWEIS_ID = "tracking-number-hint";

  return (
    <div className="page-with-navbar tracking-page">
      <div className="tracking-page-wrap">
        {utility && <div className="ce-page-header-utility tracking-utility">{utility}</div>}
        <header className="tracking-head">
          <h1 className="tracking-title">Sendung verfolgen</h1>
          <p className="tracking-page-sub" id={HINWEIS_ID}>Geben Sie Ihre Trackingnummer ein, um den aktuellen Status Ihrer Sendung zu sehen.</p>
        </header>

        <div className="ce-card tracking-search">
          <div className="tracking-search-row">
            <div className="field tracking-search-field">
              <label className="field-label" htmlFor={FELD_ID}>Trackingnummer</label>
              <input
                id={FELD_ID}
                className="field-input"
                value={id}
                onChange={e => setId(e.target.value)}
                onKeyDown={e => e.key === "Enter" && track()}
                placeholder="Trackingnummer aus Ihrer Buchungsbestätigung"
                aria-describedby={HINWEIS_ID}
                autoFocus
              />
            </div>
            {/* `() => track()` statt `track`: als Handler übergeben bekäme `track` das
                Klickereignis als `keyArg` — gesucht würde dann „[object Object]" statt der
                eingegebenen Nummer. */}
            <button type="button" className="btn btn-primary tracking-search-btn" onClick={() => track()} disabled={loading || !id.trim()}>
              {loading ? <><span className="spinner" /> Suche…</> : "Verfolgen"}
            </button>
          </div>
          {error && (
            <div className="alert alert-error tracking-search-error" role="alert">
              {error}
            </div>
          )}
        </div>

        {result && (
          <section className="ce-card tracking-result" aria-labelledby="tracking-result-title">
            <h2 className="tracking-result-title" id="tracking-result-title">Sendungsverfolgung</h2>

            {/* ── Status zuerst (wichtigste Information), Meta darunter ── */}
            <div className="tracking-hero">
              <div className="tracking-hero-status">{heroStatus}</div>
              {heroDesc && <p className="tracking-hero-desc">{heroDesc}</p>}
              {heroWhen && <div className="tracking-hero-when">{heroWhen}</div>}
            </div>

            <dl className="tracking-hero-meta">
              <div className="tracking-hero-meta-item">
                <dt className="tracking-hero-meta-label">Trackingnummer</dt>
                {/* .tracking-id-value: user-select all — vorbereitet für eine
                    spätere Copy-Funktion (bewusst noch ohne Button). */}
                <dd className="tracking-hero-meta-value tracking-id-value">{searchedKey}</dd>
              </div>
              {carrierDisplay && (
                <div className="tracking-hero-meta-item">
                  <dt className="tracking-hero-meta-label">Versanddienstleister</dt>
                  <dd className="tracking-hero-meta-value">{carrierDisplay}</dd>
                </div>
              )}
            </dl>

            {/* Fortschritt in vier Stufen — Zahl statt Häkchen, der Zustand steht zusätzlich
                im Text der Stufe. */}
            <div className="steps-bar tracking-steps">
              {STATUS_STEPS.map((label, i) => (
                <div key={label} className="step-item">
                  <div className="step-wrap">
                    <div className={`step-circle ${i === stepIndex ? "active" : i < stepIndex ? "done" : ""}`} aria-hidden="true">
                      {i + 1}
                    </div>
                    <span className={`step-label ${i === stepIndex ? "active" : i < stepIndex ? "done" : ""}`}>{label}</span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && <div className={`step-line ${i < stepIndex ? "done" : ""}`} />}
                </div>
              ))}
            </div>

            {eventCount > 0 ? (
              sections.map((section) => (
                <div key={section.key} className="tracking-timeline">
                  {section.heading && <div className="tracking-day-label tracking-leg-heading">{section.heading}</div>}
                  {section.dayGroups.map((group, gi) => (
                    <div key={gi} className="tracking-day-group">
                      <div className="tracking-day-label">{group.day}</div>
                      {group.items.map((ev, i) => {
                        // Neuestes Ereignis = letztes Element der letzten Tagesgruppe
                        // (Timeline läuft aufsteigend). Der Punkt ist reine Markierung.
                        const isLatest = gi === section.dayGroups.length - 1 && i === group.items.length - 1;
                        return (
                        <div key={i} className="track-event">
                          <div className={`track-dot ${isLatest ? "active" : "done"}`} aria-hidden="true" />
                          <div className="track-info">
                            <div className="track-title">{ev.description}</div>
                            {ev.timeText && (
                              <div className="track-time">{ev.timeText}</div>
                            )}
                            {ev.location && (
                              <div className="track-time">{ev.location}</div>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <EmptyState
                title="Keine Ereignisse verfügbar"
                text={result.liveTracking === false
                  ? TRACKING_LEGS_TEXT.liveUnavailable
                  : "Für diese Sendung sind noch keine Tracking-Ereignisse vorhanden."}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
