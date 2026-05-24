import React from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { money, dateDE, dtDE } from "../../utils/formatters";
import { API, authH } from "../../api/client";

export function ShipmentsList({ shipments, loading }) {
  const [trackingId, setTrackingId] = React.useState(null);
  const [tracking, setTracking] = React.useState(null);
  const [trackLoading, setTrackLoading] = React.useState(false);

  const loadTracking = async (id) => {
    if (trackingId === id) { setTrackingId(null); return; }
    setTrackLoading(true); setTrackingId(id); setTracking(null);
    try {
      const r = await fetch(`${API}/api/tracking/${id}`, { headers: authH() });
      const d = await r.json();
      setTracking(d.tracking);
    } catch { setTracking({ error: "Tracking nicht verfügbar" }); }
    setTrackLoading(false);
  };

  const downloadLabel = async (id) => {
    try {
      const r = await fetch(`${API}/api/jumingo/label/${id}`, { headers: authH() });
      const d = await r.json();
      if (d.label) {
        const a = document.createElement("a");
        a.href = `data:application/pdf;base64,${d.label}`;
        a.download = `label-${id}.pdf`;
        a.click();
      }
    } catch { alert("Label nicht verfügbar"); }
  };

  return (
    <>
      <div className="page-header">
        <div><div className="page-header-title">Sendungen</div></div>
      </div>
      <div className="page-body">
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
                        <td>{s.selected_carrier || "—"}</td>
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
                              <button className="btn btn-ghost btn-sm" onClick={() => downloadLabel(s.jumingo_shipment_id)}>Label</button>
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
                            ) : (
                              <div className="tracking-timeline">
                                {tracking?.data?.tracking_events?.map((ev, i) => (
                                  <div key={i} className="track-event">
                                    <div className={`track-dot ${i === 0 ? "active" : "done"}`}>{i === 0 ? "●" : "✓"}</div>
                                    <div className="track-info">
                                      <div className="track-title">{ev.description || ev.status}</div>
                                      <div className="track-time">{ev.timestamp ? dtDE(ev.timestamp) : ""}</div>
                                    </div>
                                  </div>
                                )) || <p className="text-muted text-sm">Keine Events</p>}
                              </div>
                            )}
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
