import React, { useState } from "react";
import { API } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { dtDE } from "../utils/formatters";

const ERROR_MESSAGES = {
  400: "Bitte gib eine gültige Trackingnummer ein.",
  404: "Sendung nicht gefunden.",
  429: "Zu viele Anfragen. Bitte später erneut versuchen.",
  500: "Tracking aktuell nicht verfügbar.",
};

export default function TrackingPage() {
  const [id, setId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const track = async () => {
    const trackingKey = id.trim();
    if (!trackingKey) return;
    setError(""); setLoading(true); setResult(null);
    try {
      const r = await fetch(`${API}/api/tracking/public/${encodeURIComponent(trackingKey)}`);
      if (!r.ok) throw new Error(ERROR_MESSAGES[r.status] || "Tracking aktuell nicht verfügbar.");
      const d = await r.json();
      setResult(d);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // Defensiv: verschiedene mögliche API-Response-Strukturen abdecken
  const events = result?.tracking?.data?.tracking_events
    || result?.data?.tracking_events
    || result?.tracking_events
    || [];
  const carrier = result?.tracking?.carrier || result?.carrier;
  const currentStatus = result?.tracking?.status || result?.status;

  return (
    <div className="page-with-navbar">
      <div className="container tracking-page-wrap">
        <div className="text-center mb-32">
          <h1 className="section-title">Sendung verfolgen</h1>
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
              {currentStatus && (
                <div className="tracking-status-box">
                  <span className="tracking-status-text">Status: {currentStatus}</span>
                </div>
              )}
              {events.length > 0 ? (
                <div className="tracking-timeline">
                  {events.map((ev, i) => (
                    <div key={i} className="track-event">
                      <div className={`track-dot ${i === 0 ? "active" : "done"}`}>
                        {i === 0 ? "●" : "✓"}
                      </div>
                      <div className="track-info">
                        <div className="track-title">{ev.description || ev.status || "Ereignis"}</div>
                        {ev.timestamp && (
                          <div className="track-time">{dtDE(ev.timestamp)}</div>
                        )}
                        {ev.location && (
                          <div className="track-time">{ev.location}</div>
                        )}
                      </div>
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
