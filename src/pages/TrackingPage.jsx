import React, { useState } from "react";
import { API } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { dateDE, dtDE, isoDayDE } from "../utils/formatters";
import { TRACKING_NOT_FOUND } from "../utils/trackingMessages";

const ERROR_MESSAGES = {
  400: "Bitte geben Sie eine gültige Trackingnummer ein.",
  404: TRACKING_NOT_FOUND,
  429: "Zu viele Anfragen. Bitte versuchen Sie es später erneut.",
  500: "Tracking aktuell nicht verfügbar.",
};

// Bekannte Backend-/Carrier-Status → verständliches Deutsch für die große
// Status-Box. Unbekannte ECHTE Statuswerte werden weiterhin roh angezeigt;
// Titel-/Metatexte wie "UPS shipment tracking" (erkennbar am Wort "tracking")
// erscheinen nie als Hauptstatus — dann entfällt die Box, der Stufenbalken
// kommuniziert den Zustand weiter.
const STATUS_LABELS = {
  success:     "Zugestellt",
  delivered:   "Zugestellt",
  transit:     "Unterwegs",
  pickup:      "Sendung übernommen",
  exception:   "Ausnahme",
  undelivered: "Nicht zustellbar",
  new:         "Sendung erstellt",
};

function statusLabelFor(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  const known = STATUS_LABELS[s.toLowerCase()];
  if (known) return known;
  if (/tracking/i.test(s)) return null; // Titel/Metatext, kein Sendungsstatus
  return s;
}

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

  // Live-Format: Events liegen unter tracking.data.steps[] (date/time/type/
  // location). Das frühere tracking_events[] bleibt defensiver Fallback.
  const trackData = result?.tracking?.data || result?.data || result || {};
  const rawSteps = Array.isArray(trackData.steps) ? trackData.steps : [];
  const rawEvents = result?.tracking?.data?.tracking_events
    || result?.data?.tracking_events
    || result?.tracking_events
    || [];
  const mapped = rawSteps.length > 0
    ? rawSteps.map((s) => ({
        description: s.type || s.description || s.status || "Ereignis",
        day: s.date ? isoDayDE(s.date) : null,
        timeText: s.time ? `${s.time} Uhr` : null,
        location: s.location || null,
        groupKey: s.date ? isoDayDE(s.date) : "Ohne Datum",
        timestamp: null,
        sortTs: s.date ? Date.parse(`${s.date}T${s.time || "00:00"}`) : NaN,
      }))
    : (Array.isArray(rawEvents) ? rawEvents : []).map((ev) => {
        const ts = ev.timestamp || ev.date || ev.time || ev.datetime || null;
        return {
          description: ev.description || ev.status || ev.event || ev.message || "Ereignis",
          day: ts ? dateDE(ts) : null,
          timeText: ts ? `${timeDE(ts)} Uhr` : null,
          location: ev.location || ev.city || ev.place || null,
          groupKey: ts ? dateDE(ts) : "Ohne Datum",
          timestamp: ts,
          sortTs: ts ? Date.parse(ts) : NaN,
        };
      });

  // Garantie „neuestes Ereignis oben": Liefert das Backend bereits absteigend,
  // bleibt die Reihenfolge unangetastet. Nur wenn die Chronologie nachweislich
  // aufsteigend ist (erstes Event älter als letztes), wird intern gedreht.
  // Nicht parsebare Datumswerte → keine Annahme, keine Umsortierung.
  const events =
    mapped.length >= 2 &&
    Number.isFinite(mapped[0].sortTs) &&
    Number.isFinite(mapped[mapped.length - 1].sortTs) &&
    mapped[0].sortTs < mapped[mapped.length - 1].sortTs
      ? [...mapped].reverse()
      : mapped;

  // carrier kann String ODER Objekt ({ code, name, image, phone, id }) sein →
  // niemals das Objekt direkt rendern (React-Crash). Nur den Namen anzeigen.
  const carrierRaw = result?.tracking?.carrier || result?.tracking?.data?.carrier
    || result?.data?.carrier || result?.carrier;
  const carrierName = typeof carrierRaw === "string" ? carrierRaw
    : (carrierRaw && typeof carrierRaw === "object" ? (carrierRaw.name || null) : null);

  // Status defensiv nur als String übernehmen (kein Objekt rendern) und für
  // die Anzeige übersetzen. Der Stufenbalken nutzt bevorzugt das übersetzte
  // Label (z. B. "success" → "Zugestellt" → Stufe 4), sonst den Rohwert.
  const statusRaw = result?.tracking?.status || result?.tracking?.data?.status
    || result?.data?.status || result?.status;
  const currentStatus = typeof statusRaw === "string" ? statusRaw : null;
  const statusLabel = statusLabelFor(currentStatus);

  const first = events[0];
  const lastUpdateLabel = !first ? null
    : first.timestamp ? dtDE(first.timestamp)
    : ([first.day, first.timeText].filter(Boolean).join(" ").trim() || null);
  const stepIndex = resolveStepIndex(`${statusLabel || currentStatus || ""} ${first?.description || ""}`);

  // Ereignisse nach Tag gruppieren, Reihenfolge bleibt erhalten
  const dayGroups = [];
  events.forEach((ev) => {
    const day = ev.groupKey;
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
              {carrierName && (
                <span className="text-sm text-muted ml-auto">{carrierName}</span>
              )}
            </div>
            <div className="calc-panel-body">
              <div className="tracking-meta-row">
                <span className="tracking-meta-id">Trackingnummer: <strong>{searchedKey}</strong></span>
                {lastUpdateLabel && <span className="tracking-meta-updated">Aktualisiert: {lastUpdateLabel}</span>}
              </div>

              {statusLabel && (
                <div className="tracking-status-box tracking-status-box-lg">
                  <span className="tracking-status-text">{statusLabel}</span>
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
                            {ev.timeText && (
                              <div className="track-time">{ev.timeText}</div>
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
