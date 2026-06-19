import React, { useState } from "react";
import { API } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { dateDE, dtDE } from "../utils/formatters";

const ERROR_MESSAGES = {
  400: "Bitte gib eine gültige Trackingnummer ein.",
  404: "Sendung nicht gefunden.",
  429: "Zu viele Anfragen. Bitte versuche es später erneut.",
  500: "Tracking aktuell nicht verfügbar.",
};

const STATUS_STEPS = [
  "Daten übermittelt",
  "Unterwegs",
  "In Zustellung",
  "Zugestellt",
];

// Best-effort: ordnet den (von Carrier zu Carrier unterschiedlichen) Statustext
// auf eine der vier Stufen ab. Bei unbekanntem Text bleibt Stufe 0 aktiv.
function resolveStepIndex(text) {
  const t = (text || "").toLowerCase();
  if (/zugestellt|delivered/.test(t)) return 3;
  if (/zustellung|out for delivery|in delivery/.test(t)) return 2;
  if (/unterwegs|transit|abgeholt|picked up|shipped|versendet/.test(t)) return 1;
  return 0;
}

const timeDE = (d) => (d ? new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "");

export default function TrackingPage() {
  const [id, setId] = useState("");
  const [searchedKey, setSearchedKey] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const track = async () => {
    const trackingKey = id.trim();
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

  // Defensiv: verschiedene mögliche API-Response-Strukturen und Feldnamen abdecken
  const rawEvents = result?.tracking?.data?.tracking_events
    || result?.data?.tracking_events
    || result?.tracking_events
    || [];
  const events = rawEvents.map((ev) => ({
    description: ev.description || ev.status || ev.event || ev.message || "Ereignis",
    timestamp: ev.timestamp || ev.date || ev.time || ev.datetime || null,
    location: ev.location || ev.city || ev.place || null,
  }));
  const carrier = result?.tracking?.carrier || result?.tracking?.data?.carrier
    || result?.data?.carrier || result?.carrier;
  const currentStatus = result?.tracking?.status || result?.tracking?.data?.status
    || result?.data?.status || result?.status;
  const lastUpdate = events[0]?.timestamp;
  const stepIndex = resolveStepIndex(`${currentStatus || ""} ${events[0]?.description || ""}`);

  // Ereignisse nach Tag gruppieren, Reihenfolge bleibt erhalten (neueste zuerst)
  const dayGroups = [];
  events.forEach((ev) => {
    const day = ev.timestamp ? dateDE(ev.timestamp) : "Ohne Datum";
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.day === day) last.items.push(ev);
    else dayGroups.push({ day, items: [ev] });
  });

  return (
    <div className="page-with-navbar">
      <div className="container tracking-page-wrap">
        <div className="text-center mb-32">
          <h1 className="section-title">Sendung verfolgen</h1>
          <p className="tracking-page-sub">Geben Sie Ihre Trackingnummer ein, um den aktuellen Status Ihrer Sendung zu sehen.</p>
        </div>

        <div className="calc-panel">
          <div className="calc-panel-body">
            <div className="field">
              <label className="field-label">Trackingnummer</label>
              <input
                className="field-input"
                value={id}
                onChange={e => setId(e.target.value)}
                onKeyDown={e => e.key === "Enter" && track()}
                placeholder="Trackingnummer aus Ihrer Buchungsbestätigung"
                autoFocus
              />
            </div>
            {error && (
              <div className="alert alert-error mb-16">
                <Icon n="x" s={16} />{error}
              </div>
            )}
            <button className="btn btn-primary btn-full" onClick={track} disabled={loading || !id.trim()}>
              {loading ? <><span className="spinner" /> Suche…</> : <><Icon n="search" s={16} /> Verfolgen</>}
            </button>
          </div>
        </div>

        {result && (
          <div className="calc-panel mt-16">
            <div className="calc-panel-header">
              <Icon n="map" s={18} c="#1D4ED8" />
              <h3>Sendungsverlauf</h3>
              {carrier && (
                <span className="text-sm text-muted ml-auto">{carrier}</span>
              )}
            </div>
            <div className="calc-panel-body">
              <div className="tracking-meta-row">
                <span className="tracking-meta-id">Trackingnummer: <strong>{searchedKey}</strong></span>
                {lastUpdate && <span className="tracking-meta-updated">Aktualisiert: {dtDE(lastUpdate)}</span>}
              </div>

              {currentStatus && (
                <div className="tracking-status-box tracking-status-box-lg">
                  <span className="tracking-status-text">{currentStatus}</span>
                </div>
              )}

              <div className="steps-bar mb-24">
                {STATUS_STEPS.map((label, i) => (
                  <div key={label} className="step-item">
                    <div className="step-wrap">
                      <div className={`step-circle ${i === stepIndex ? "active" : i < stepIndex ? "done" : ""}`}>
                        {i < stepIndex ? "✓" : i + 1}
                      </div>
                      <span className={`step-label ${i === stepIndex ? "active" : i < stepIndex ? "done" : ""}`}>{label}</span>
                    </div>
                    {i < STATUS_STEPS.length - 1 && <div className={`step-line ${i < stepIndex ? "done" : ""}`} />}
                  </div>
                ))}
              </div>

              {events.length > 0 ? (
                <div className="tracking-timeline">
                  {dayGroups.map((group, gi) => (
                    <div key={gi} className="tracking-day-group">
                      <div className="tracking-day-label">{group.day}</div>
                      {group.items.map((ev, i) => (
                        <div key={i} className="track-event">
                          <div className={`track-dot ${gi === 0 && i === 0 ? "active" : "done"}`}>
                            {gi === 0 && i === 0 ? "●" : "✓"}
                          </div>
                          <div className="track-info">
                            <div className="track-title">{ev.description}</div>
                            {ev.timestamp && (
                              <div className="track-time">{timeDE(ev.timestamp)} Uhr</div>
                            )}
                            {ev.location && (
                              <div className="track-time">{ev.location}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty tracking-events-empty">
                  <div className="empty-icon">📦</div>
                  <div className="empty-title">Keine Ereignisse verfügbar</div>
                  <p className="text-sm text-muted mt-8">
                    Für diese Sendung sind noch keine Tracking-Ereignisse vorhanden.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
