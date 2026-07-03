import React from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { money, dateDE, dtDE, isoDayDE } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { getTracking } from "../../api/client";
import { downloadLabel } from "../../utils/downloadLabel";
import { TRACKING_NOT_FOUND } from "../../utils/trackingMessages";

const TRACKING_ERROR_MESSAGES = {
  400: "Bitte geben Sie eine gültige Trackingnummer ein.",
  404: TRACKING_NOT_FOUND,
  429: "Zu viele Anfragen. Bitte später erneut versuchen.",
  500: "Tracking aktuell nicht verfügbar.",
};

// Nur valide http(s)-Carrier-Links öffnen (sicher: target=_blank + noopener).
const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\/\S/i.test(v);

// trackingStatus dezent darstellen: bekannter Vertragswert "new" wird
// kundenfreundlich übersetzt, sonst der Backend-Status unverändert gezeigt
// (keine geratenen Werte). Reine Anzeige.
const TRACK_STATUS_LABELS = { new: "In Vorbereitung" };
const labelForTrackStatus = (s) =>
  s == null || s === "" ? null : (TRACK_STATUS_LABELS[String(s).toLowerCase()] || String(s));

export function ShipmentsList({ shipments, loading }) {
  const [trackingId, setTrackingId] = React.useState(null);
  const [tracking, setTracking] = React.useState(null);
  const [trackLoading, setTrackLoading] = React.useState(false);
  const [labelError, setLabelError] = React.useState("");

  // Holt den Trackingstand (auch für „Aktualisieren“), ohne die Zeile zu togglen.
  // Nutzt die zentrale getTracking-Funktion (defensives Feld-Lesen, Auth zentral).
  const fetchTracking = async (id) => {
    setTrackLoading(true); setTracking(null);
    try {
      const res = await getTracking(id);
      if (!res.ok) {
        if (res.status !== 401 && res.status !== 403) // globaler Auth-Redirect übernimmt sonst
          setTracking({ error: TRACKING_ERROR_MESSAGES[res.status] || "Tracking aktuell nicht verfügbar." });
      } else {
        setTracking(res);
      }
    } catch { setTracking({ error: "Tracking aktuell nicht verfügbar." }); }
    setTrackLoading(false);
  };

  const loadTracking = (id) => {
    if (trackingId === id) { setTrackingId(null); return; } // erneuter Klick = einklappen
    setTrackingId(id);
    fetchTracking(id);
  };

  const handleDownloadLabel = async (id) => {
    setLabelError("");
    try {
      await downloadLabel(id);
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setLabelError(e.message); // globaler Auth-Redirect übernimmt sonst
    }
  };

  return (
    <>
      <div className="page-body">
        {labelError && (
          <div className="alert alert-error mb-16">
            <Icon n="x" s={16} />{labelError}
          </div>
        )}
        {loading ? (
          <div className="loading-center"><span className="spinner spinner-dark" /></div>
        ) : shipments.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📦</div>
            <div className="empty-title">Noch keine Sendungen</div>
          </div>
        ) : (
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Carrier</th><th>Gewicht</th><th>Preis</th><th>Status</th><th>Datum</th><th>Aktionen</th></tr>
                </thead>
                <tbody>
                  {shipments.map((s) => (
                    <React.Fragment key={s.id}>
                      <tr>
                        <td>
                          {s.selected_carrier ? resolveCarrierName(s.selected_carrier) : "—"}
                          {s.reference_number && (
                            <div className="text-muted mono" style={{ fontSize: 12, marginTop: 2 }}>Ref: {s.reference_number}</div>
                          )}
                        </td>
                        <td className="text-muted">{s.weight ? `${s.weight} kg` : "—"}</td>
                        <td className="font-bold">{money(s.price_final)}</td>
                        <td><StatusBadge status={s.status} /></td>
                        <td className="text-muted">{dateDE(s.created_at)}</td>
                        <td>
                          <div className="flex gap-8">
                            {s.jumingo_shipment_id && (
                              <button className="btn btn-ghost btn-sm" onClick={() => loadTracking(s.jumingo_shipment_id)}>Track</button>
                            )}
                            {(s.status === "booked" || s.status === "label_ready") && (
                              <button className="btn btn-ghost btn-sm" onClick={() => handleDownloadLabel(s.jumingo_shipment_id)}>Label</button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {trackingId === s.jumingo_shipment_id && (
                        <tr>
                          <td colSpan={6} style={{ background: "var(--gray50)", padding: "20px 24px" }}>
                            {trackLoading ? (
                              <div className="loading-center"><span className="spinner spinner-dark" /></div>
                            ) : tracking?.error ? (
                              <p className="text-muted text-sm">{tracking.error}</p>
                            ) : (() => {
                              const number = tracking?.trackingNumber;
                              const statusLabel = labelForTrackStatus(tracking?.trackingStatus);
                              const carrierUrl = isHttpUrl(tracking?.carrierTrackingPage) ? tracking.carrierTrackingPage : null;
                              // Live-Format: Events unter tracking.data.steps[]
                              // (date/time/type/location). tracking_events[] bleibt
                              // defensiver Fallback.
                              const trackData = tracking?.tracking?.data || {};
                              const rawSteps = Array.isArray(trackData.steps) ? trackData.steps : [];
                              const rawEvents = Array.isArray(trackData.tracking_events) ? trackData.tracking_events : [];
                              const mapped = rawSteps.length > 0
                                ? rawSteps.map((s) => ({
                                    title: s.type || s.description || s.status || "Ereignis",
                                    when: [s.date ? isoDayDE(s.date) : null, s.time].filter(Boolean).join(" "),
                                    location: s.location || null,
                                    sortTs: s.date ? Date.parse(`${s.date}T${s.time || "00:00"}`) : NaN,
                                  }))
                                : rawEvents.map((ev) => ({
                                    title: ev.description || ev.status || "Ereignis",
                                    when: ev.timestamp ? dtDE(ev.timestamp) : "",
                                    location: ev.location || null,
                                    sortTs: ev.timestamp ? Date.parse(ev.timestamp) : NaN,
                                  }));
                              // „Neuestes zuerst" garantieren (aktiver Punkt = Index 0):
                              // nur bei nachweislich aufsteigender Chronologie intern drehen,
                              // sonst Backend-Reihenfolge unangetastet lassen.
                              const events =
                                mapped.length >= 2 &&
                                Number.isFinite(mapped[0].sortTs) &&
                                Number.isFinite(mapped[mapped.length - 1].sortTs) &&
                                mapped[0].sortTs < mapped[mapped.length - 1].sortTs
                                  ? [...mapped].reverse()
                                  : mapped;

                              // Backend sagt explizit „noch nicht verfügbar“ → freundlicher Hinweis
                              // statt „Keine Events“. Manuelles Aktualisieren, kein Auto-Polling.
                              if (tracking?.trackingAvailable === false && !number) {
                                return (
                                  <div className="shipment-track-pending">
                                    <p className="text-muted text-sm">
                                      Tracking ist noch nicht verfügbar. Die Sendungsverfolgung erscheint,
                                      sobald der Versanddienstleister die Sendung übernommen hat.
                                    </p>
                                    <button className="btn btn-ghost btn-sm" onClick={() => fetchTracking(s.jumingo_shipment_id)}>
                                      <Icon n="refresh" s={13} /> Aktualisieren
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <div className="shipment-track-detail">
                                  {(number || statusLabel || carrierUrl) && (
                                    <div className="shipment-track-head">
                                      {number && (
                                        <span className="shipment-track-number">
                                          Trackingnummer: <strong>{number}</strong>
                                        </span>
                                      )}
                                      {statusLabel && <span className="shipment-track-chip">{statusLabel}</span>}
                                      {carrierUrl && (
                                        <a className="shipment-track-link" href={carrierUrl} target="_blank" rel="noopener noreferrer">
                                          Beim Versanddienstleister verfolgen <Icon n="external" s={12} c="currentColor" />
                                        </a>
                                      )}
                                    </div>
                                  )}
                                  {events.length > 0 ? (
                                    <div className="tracking-timeline">
                                      {events.map((ev, i) => (
                                        <div key={i} className="track-event">
                                          <div className={`track-dot ${i === 0 ? "active" : "done"}`}>{i === 0 ? "●" : "✓"}</div>
                                          <div className="track-info">
                                            <div className="track-title">{ev.title}</div>
                                            {ev.when && <div className="track-time">{ev.when}</div>}
                                            {ev.location && <div className="track-time">{ev.location}</div>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-muted text-sm shipment-track-noevents">Noch keine Ereignisse vorhanden.</p>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
