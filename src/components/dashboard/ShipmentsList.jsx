import React from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { money, dateDE, dtDE, isoDayDE } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { getTracking, requestShipmentCancellation } from "../../api/client";
import { downloadLabel } from "../../utils/downloadLabel";
import { TRACKING_NOT_FOUND } from "../../utils/trackingMessages";
import { CancellationRequestDialog } from "./CancellationRequestDialog";
import { customerShipmentNumbers, NOT_ASSIGNED_TEXT, NUMBER_LABELS } from "../../utils/businessNumbers.mjs";
import {
  canRequestCancellation,
  hasCancellationRequest,
  customerCancellationStatusMeta,
  classifyCancellationError,
  readErrorCode,
} from "../../utils/customerCancellation.mjs";

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

// Sekundäres Statusbadge der Stornierungsanfrage (Actions-Zelle). Überschreibt
// NICHT den normalen Sendungsstatus (eigene Spalte). Reiner Text (nicht nur
// farblich). Bei „angenommen" ein dezenter Hinweis zur persönlichen Bearbeitung.
function CancellationStatusPill({ status }) {
  const [cls, label] = customerCancellationStatusMeta(status);
  const title = status === "accepted"
    ? "Die weitere Bearbeitung erfolgt persönlich durch ConfidaraExpress."
    : undefined;
  return <span className={`badge ${cls} stn-status`} title={title}>{label}</span>;
}

/* Aktionen einer Sendungszeile — identisch in Tabelle und Mobilkarte.
   Reine Darstellungs-Extraktion (Paket A, Phase 3): dieselben Bedingungen,
   dieselben Handler, keine geänderte Logik. */
function ShipmentRowActions({ s, onTrack, onLabel, onCancel }) {
  return (
    <div className="flex gap-8 stn-actions">
      {s.jumingo_shipment_id && (
        <button className="btn btn-ghost btn-sm" onClick={() => onTrack(s.jumingo_shipment_id)}>Track</button>
      )}
      {(s.status === "booked" || s.status === "label_ready") && (
        <button className="btn btn-ghost btn-sm" onClick={() => onLabel(s.jumingo_shipment_id)}>Label</button>
      )}
      {canRequestCancellation(s) && (
        <button className="btn btn-ghost btn-sm" onClick={() => onCancel(s)}>Stornieren</button>
      )}
      {hasCancellationRequest(s) && <CancellationStatusPill status={s.cancellation_status} />}
    </div>
  );
}

export function ShipmentsList({ shipments, loading, onCancellationRequested }) {
  const [trackingId, setTrackingId] = React.useState(null);
  const [tracking, setTracking] = React.useState(null);
  const [trackLoading, setTrackLoading] = React.useState(false);
  const [labelError, setLabelError] = React.useState("");

  // ── Stornierungsanfrage ────────────────────────────────────────────────────
  const [cancelShipment, setCancelShipment] = React.useState(null); // aktive Zielsendung / null
  const [cancelBusy, setCancelBusy] = React.useState(false);
  const [cancelError, setCancelError] = React.useState("");         // im Dialog (korrigierbar)
  const [notice, setNotice] = React.useState(null);                 // { type, text } oberhalb der Tabelle
  const submittingRef = React.useRef(false);                        // Doppelklick-/Race-Schutz
  const mountedRef = React.useRef(true);
  React.useEffect(() => () => { mountedRef.current = false; }, []);

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

  const openCancel = (s) => { setCancelError(""); setNotice(null); setCancelShipment(s); };
  const closeCancel = () => { if (!cancelBusy) { setCancelShipment(null); setCancelError(""); } };

  // Absenden der Stornierungsanfrage. Genau EIN POST pro Dialog (submittingRef),
  // Buttons während des Requests deaktiviert, keine State-Updates nach Unmount,
  // Zielsendung bleibt über die lokale `s`-Bindung stabil.
  const submitCancel = async (reason) => {
    if (submittingRef.current) return;
    const s = cancelShipment;
    if (!s) return;
    const jid = s.jumingo_shipment_id;
    submittingRef.current = true;
    setCancelBusy(true);
    setCancelError("");
    try {
      const resp = await requestShipmentCancellation(jid, reason);
      if (!mountedRef.current) return;
      if (resp.ok) {
        let d = {};
        try { d = await resp.json(); } catch { d = {}; }
        const cr = d && typeof d.cancellationRequest === "object" && d.cancellationRequest ? d.cancellationRequest : {};
        const status = cr.status || "pending";
        const requestedAt = cr.createdAt || cr.created_at || null;
        setCancelShipment(null);
        setNotice({ type: "success", text: "Ihre Stornierungsanfrage wird bearbeitet. Wir melden uns persönlich bei Ihnen." });
        onCancellationRequested?.(jid, { status, requestedAt });
        return;
      }
      if (resp.status === 401 || resp.status === 403) return; // zentraler Logout/Redirect via apiFetch
      let body = {};
      try { body = await resp.json(); } catch { body = {}; }
      const cls = classifyCancellationError(resp.status, readErrorCode(body));
      if (cls.keepDialogOpen) {
        // Korrigierbarer Fehler (Reason ungültig / Rate-Limit / generisch):
        // Dialog offen lassen, Eingabe bleibt erhalten.
        setCancelError(cls.message);
      } else {
        // Serverzustand hat sich geändert (bereits vorhanden / nicht erlaubt /
        // nicht gefunden): Dialog schließen, Info anzeigen, Liste reconcilen.
        setCancelShipment(null);
        setNotice({ type: "info", text: cls.message });
        onCancellationRequested?.(jid, cls.markPending ? { status: "pending" } : {});
      }
    } catch {
      if (mountedRef.current) {
        setCancelError("Die Stornierungsanfrage konnte nicht gesendet werden. Bitte versuche es erneut.");
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setCancelBusy(false);
    }
  };

  return (
    <>
      <div className="page-body">
        {labelError && (
          <div className="alert alert-error mb-16" role="alert">
            <Icon n="x" s={16} />{labelError}
          </div>
        )}
        {notice && (
          <div className={`alert ${notice.type === "success" ? "alert-success" : "alert-info"} mb-16`} role="status">
            <Icon n={notice.type === "success" ? "check" : "info"} s={16} />{notice.text}
          </div>
        )}
        {loading ? (
          <div className="loading-center"><span className="spinner spinner-dark" /></div>
        ) : shipments.length === 0 ? (
          <div className="empty">
            <div className="empty-icon" aria-hidden="true"><Icon n="package" s={24} /></div>
            <div className="empty-title">Noch keine Sendungen</div>
          </div>
        ) : (
          <>
          <div className="table-card ce-list-table">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Bestellnummer</th><th>Carrier</th><th className="ce-num">Gewicht</th><th className="ce-num">Preis</th><th>Status</th><th>Datum</th><th>Aktionen</th></tr>
                </thead>
                <tbody>
                  {shipments.map((s) => {
                    const nums = customerShipmentNumbers(s);
                    return (
                    <React.Fragment key={s.id}>
                      <tr>
                        {/* Die Confidara-Bestellnummer ist die primäre Vorgangsnummer und steht
                            daher zuerst und optisch hervorgehoben. Legacy-Sendungen ohne Nummer
                            zeigen einen neutralen Hinweis — NIE die interne Shipment-ID und NIE
                            die JUMiNGO-Shipment-/Ordernummer als Ersatz. */}
                        <td>
                          {nums.businessOrderNumber
                            ? <span className="mono font-bold" style={{ fontSize: 13, wordBreak: "break-all" }}>{nums.businessOrderNumber}</span>
                            : <span className="text-muted" style={{ fontSize: 12 }}>{NOT_ASSIGNED_TEXT}</span>}
                          {nums.trackingNumber && (
                            <div className="text-muted mono" style={{ fontSize: 11, marginTop: 2, wordBreak: "break-all" }}>
                              {NUMBER_LABELS.tracking}: {nums.trackingNumber}
                            </div>
                          )}
                        </td>
                        <td>
                          {s.selected_carrier ? resolveCarrierName(s.selected_carrier) : "—"}
                          {nums.customerReference && (
                            <div className="text-muted mono" style={{ fontSize: 12, marginTop: 2 }}>Ref: {nums.customerReference}</div>
                          )}
                        </td>
                        <td className="text-muted ce-num">{s.weight ? `${s.weight} kg` : "—"}</td>
                        <td className="font-bold ce-num">{money(s.price_final)}</td>
                        <td><StatusBadge status={s.status} /></td>
                        <td className="text-muted">{dateDE(s.created_at)}</td>
                        <td className="ce-col-actions">
                          <ShipmentRowActions s={s} onTrack={loadTracking} onLabel={handleDownloadLabel} onCancel={openCancel} />
                        </td>
                      </tr>
                      {trackingId === s.jumingo_shipment_id && (
                        <tr>
                          <td colSpan={7} style={{ background: "var(--gray50)", padding: "20px 24px" }}>
                            {/* Sendungsdetail: die drei kundensichtbaren Werte GETRENNT benannt.
                                JUMiNGO-Shipment-ID/-Ordernummer und die interne shipments.id
                                werden hier bewusst NICHT angezeigt — die IDs bleiben lediglich
                                im State/API-Aufruf (Track/Label) erhalten. */}
                            <dl className="shipment-detail-numbers" style={{ display: "flex", flexWrap: "wrap", gap: "8px 28px", margin: "0 0 16px" }}>
                              <div>
                                <dt className="text-muted" style={{ fontSize: 11 }}>{NUMBER_LABELS.businessOrder}</dt>
                                <dd className="mono" style={{ margin: 0, fontSize: 13, fontWeight: 600, wordBreak: "break-all" }}>
                                  {nums.businessOrderNumber || NOT_ASSIGNED_TEXT}
                                </dd>
                              </div>
                              {nums.trackingNumber && (
                                <div>
                                  <dt className="text-muted" style={{ fontSize: 11 }}>{NUMBER_LABELS.tracking}</dt>
                                  <dd className="mono" style={{ margin: 0, fontSize: 13, wordBreak: "break-all" }}>{nums.trackingNumber}</dd>
                                </div>
                              )}
                              {nums.customerReference && (
                                <div>
                                  <dt className="text-muted" style={{ fontSize: 11 }}>{NUMBER_LABELS.customerReference}</dt>
                                  <dd className="mono" style={{ margin: 0, fontSize: 13, wordBreak: "break-all" }}>{nums.customerReference}</dd>
                                </div>
                              )}
                              <div>
                                <dt className="text-muted" style={{ fontSize: 11 }}>Carrier</dt>
                                <dd style={{ margin: 0, fontSize: 13 }}>{s.selected_carrier ? resolveCarrierName(s.selected_carrier) : "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-muted" style={{ fontSize: 11 }}>Buchungsdatum</dt>
                                <dd style={{ margin: 0, fontSize: 13 }}>{dateDE(s.created_at)}</dd>
                              </div>
                              {s.requested_shipping_date && (
                                <div>
                                  <dt className="text-muted" style={{ fontSize: 11 }}>Geplantes Versanddatum</dt>
                                  <dd style={{ margin: 0, fontSize: 13 }}>{isoDayDE(s.requested_shipping_date)}</dd>
                                </div>
                              )}
                            </dl>
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
                              // Chronologisch aufsteigend garantieren (ältestes oben,
                              // neuestes unten; aktiver Punkt = letztes Event): nur bei
                              // nachweislich absteigender Chronologie intern drehen,
                              // sonst Backend-Reihenfolge unangetastet lassen.
                              const events =
                                mapped.length >= 2 &&
                                Number.isFinite(mapped[0].sortTs) &&
                                Number.isFinite(mapped[mapped.length - 1].sortTs) &&
                                mapped[0].sortTs > mapped[mapped.length - 1].sortTs
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
                                          {/* Aktiver Punkt = neuestes Ereignis = letztes Element (aufsteigende Timeline) */}
                                          <div className={`track-dot ${i === events.length - 1 ? "active" : "done"}`}>{i === events.length - 1 ? "●" : "✓"}</div>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Kartenansicht (Paket A, Phase 3): unter 768 px zeigt die
              Liste Karten statt einer quer gescrollten Tabelle — dasselbe
              Muster, das Rechnungen, Entwürfe, Adressbuch und die Adminlisten
              bereits nutzen. Gleiche Daten, gleiche Aktionen, gleiche
              Bedingungen; die Tracking-Detailansicht bleibt der Tabelle
              vorbehalten und ist über „Track" weiterhin erreichbar. */}
          <ul className="ce-list-cards" aria-label="Sendungen">
            {shipments.map((s) => {
              const nums = customerShipmentNumbers(s);
              return (
                <li className="ce-list-card" key={`card-${s.id}`}>
                  <div className="ce-list-card-head">
                    <div style={{ minWidth: 0 }}>
                      {nums.businessOrderNumber
                        ? <span className="mono font-bold" style={{ fontSize: 13, wordBreak: "break-all" }}>{nums.businessOrderNumber}</span>
                        : <span className="text-muted" style={{ fontSize: 12 }}>{NOT_ASSIGNED_TEXT}</span>}
                      {nums.trackingNumber && (
                        <div className="text-muted mono" style={{ fontSize: 11, marginTop: 2, wordBreak: "break-all" }}>
                          {NUMBER_LABELS.tracking}: {nums.trackingNumber}
                        </div>
                      )}
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="ce-list-card-row">
                    <span className="ce-list-card-key">Carrier</span>
                    <span className="ce-list-card-val">{s.selected_carrier ? resolveCarrierName(s.selected_carrier) : "—"}</span>
                  </div>
                  <div className="ce-list-card-row">
                    <span className="ce-list-card-key">Gewicht</span>
                    <span className="ce-list-card-val ce-num">{s.weight ? `${s.weight} kg` : "—"}</span>
                  </div>
                  <div className="ce-list-card-row">
                    <span className="ce-list-card-key">Preis</span>
                    <span className="ce-list-card-val ce-num font-bold">{money(s.price_final)}</span>
                  </div>
                  <div className="ce-list-card-row">
                    <span className="ce-list-card-key">Datum</span>
                    <span className="ce-list-card-val">{dateDE(s.created_at)}</span>
                  </div>
                  <div className="ce-list-card-actions">
                    <ShipmentRowActions s={s} onTrack={loadTracking} onLabel={handleDownloadLabel} onCancel={openCancel} />
                  </div>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </div>

      {cancelShipment && (
        <CancellationRequestDialog
          shipment={cancelShipment}
          busy={cancelBusy}
          error={cancelError}
          onSubmit={submitCancel}
          onClose={closeCancel}
        />
      )}
    </>
  );
}
