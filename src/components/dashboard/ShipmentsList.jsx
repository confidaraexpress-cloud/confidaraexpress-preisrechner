import React from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { EmptyState } from "../ui/StateView";
import { money, dateDE, isoDayDE } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { getTracking, requestShipmentCancellation } from "../../api/client";
import { TRACKING_NOT_FOUND } from "../../utils/trackingMessages";
import { CancellationRequestDialog } from "./CancellationRequestDialog";
import { ShipmentDocumentsDrawer } from "./ShipmentDocumentsDrawer";
import { DOCUMENTS_TEXT } from "../../utils/shipmentDocumentsView.mjs";
import { customerShipmentNumbers, NO_ORDER_CONFIRMATION_TEXT, NUMBER_LABELS } from "../../utils/businessNumbers.mjs";
import { isHttpUrl } from "../../utils/externalLink.mjs";
import { shipmentServiceNameOf, SHIPMENT_SERVICE_LABEL } from "../../utils/shipmentServiceNameView.mjs";
import {
  multiTrackingReferencesOf, trackingReferencesSummary, TRACKING_REFERENCES_TEXT,
} from "../../utils/trackingReferencesView.mjs";
import {
  trackingLegsOf, trackingStatusLabel, eventWhenText, trackingLegHeading, TRACKING_LEGS_TEXT,
} from "../../utils/trackingLegsView.mjs";
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
   dieselben Handler, keine geänderte Logik. `expanded` sagt Vorlesesoftware,
   ob die Trackingansicht dieser Sendung gerade offen ist. */
function ShipmentRowActions({ s, expanded, onTrack, onDocuments, onCancel }) {
  return (
    <div className="flex gap-8 stn-actions">
      {s.id && (
        <button className="btn btn-ghost btn-sm" aria-expanded={expanded === true} onClick={() => onTrack(s.id)}>Sendung verfolgen</button>
      )}
      {/* EINE dokumentbezogene Aktion statt wachsender Einzelknöpfe. Vorher standen
          hier „Label" und „Auftragsbestätigung" nebeneinander — je Dokumenttyp ein
          weiterer Knopf, und jeder trug seine eigene Sichtbarkeitsbedingung aus der
          Zeile (Status, vorhandene Nummer). Beides ist entfallen: welche Dokumente
          es gibt, sagt der Server im Drawer, nicht diese Liste.

          Tracking und Stornierung bleiben eigenständig — sie sind keine Dokumente. */}
      {s.id && (
        <button className="btn btn-ghost btn-sm" onClick={() => onDocuments(s)}>
          <Icon n="form" s={15} /> {DOCUMENTS_TEXT.action}
        </button>
      )}
      {canRequestCancellation(s) && (
        <button className="btn btn-ghost btn-sm" onClick={() => onCancel(s)}>Stornieren</button>
      )}
      {hasCancellationRequest(s) && <CancellationStatusPill status={s.cancellation_status} />}
    </div>
  );
}

/* ── Trackingansicht einer Sendung ────────────────────────────────────────────
   TG22 Paket B: dieselbe Ansicht in der Tabellen-Detailzeile UND in der Mobilkarte.
   Bis hierher war sie der Tabelle vorbehalten — unter 1100 px ist die Tabelle aber
   ausgeblendet, und „Sendung verfolgen" auf der Karte lud den Stand, ohne ihn je zu zeigen.

   Reine Darstellung: Zustand, Endpunkt und „Aktualisieren" kommen aus der Liste. Beide
   Stellen zeigen damit denselben Stand aus demselben Abruf. */
function ShipmentTrackingDetail({ tracking, loading, onRefresh }) {
  if (loading) return <div className="loading-center"><span className="spinner spinner-dark" /></div>;
  if (tracking?.error) return <p className="text-muted text-sm">{tracking.error}</p>;

  const number = tracking?.trackingNumber;
  // TG-F6: die Trackingantwort trägt ALLE Nummern der Sendung.
  const liveNummern = multiTrackingReferencesOf(tracking);
  // Providerneutrale Transportabschnitte: Stand, Ereignisse und
  // Zeitangaben stammen für jeden Einkaufsweg aus derselben Form
  // (utils/trackingLegsView.mjs) — ohne erfundene Zeitzone. Ein
  // Rohobjekt eines Anbieters wird nicht gelesen.
  const legs = trackingLegsOf(tracking);
  const statusLabel = trackingStatusLabel(tracking?.trackingStatus);
  const carrierUrl = isHttpUrl(tracking?.carrierTrackingPage) ? tracking.carrierTrackingPage : null;

  // Je Abschnitt eine Timeline.
  const sections = legs.map((leg) => ({
    key: leg.key,
    heading: legs.length > 1 ? trackingLegHeading(leg) : null,
    link: legs.length > 1 ? leg.carrierTrackingPage : null,
    events: leg.events.map((ev) => ({
      title: ev.description,
      when: eventWhenText(ev, { withSuffix: false }) || "",
      location: ev.location,
    })),
  }));
  const eventCount = sections.reduce((n, sec) => n + sec.events.length, 0);

  // Backend sagt explizit „noch nicht verfügbar“ → freundlicher Hinweis
  // statt „Keine Events“. Manuelles Aktualisieren, kein Auto-Polling.
  if (tracking?.trackingAvailable === false && !number) {
    return (
      <div className="shipment-track-pending">
        <p className="text-muted text-sm">
          Tracking ist noch nicht verfügbar. Die Sendungsverfolgung erscheint,
          sobald der Versanddienstleister die Sendung übernommen hat.
        </p>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}>
          <Icon n="refresh" s={13} /> Aktualisieren
        </button>
      </div>
    );
  }

  return (
    <div className="shipment-track-detail">
      {(number || statusLabel || carrierUrl) && (
        <div className="shipment-track-head">
          {liveNummern ? (
            <span className="shipment-track-number">
              {TRACKING_REFERENCES_TEXT.plural}: <strong style={{ wordBreak: "break-all" }}>{liveNummern.join(", ")}</strong>
            </span>
          ) : number && (
            <span className="shipment-track-number">
              Trackingnummer: <strong>{number}</strong>
            </span>
          )}
          {statusLabel && <span className="badge badge--info">{statusLabel}</span>}
          {carrierUrl && (
            <a className="shipment-track-link" href={carrierUrl} target="_blank" rel="noopener noreferrer">
              Beim Versanddienstleister verfolgen <Icon n="external" s={12} c="currentColor" />
            </a>
          )}
        </div>
      )}
      {eventCount > 0 ? sections.map((section) => (
        <div key={section.key} className="tracking-timeline">
          {/* Mehrere Abschnitte: je Abschnitt Carrier und Nummer — nie „Paket 2". */}
          {section.heading && <p className="text-muted text-sm shipment-track-leg">{section.heading}</p>}
          {section.link && (
            <a className="shipment-track-link" href={section.link} target="_blank" rel="noopener noreferrer">
              Beim Versanddienstleister verfolgen <Icon n="external" s={12} c="currentColor" />
            </a>
          )}
          {section.events.map((ev, i) => (
            <div key={i} className="track-event">
              {/* Aktiver Punkt = neuestes Ereignis = letztes Element (aufsteigende Timeline) */}
              <div className={`track-dot ${i === section.events.length - 1 ? "active" : "done"}`}>
                {i === section.events.length - 1 ? <Icon n="mapPin" s={14} /> : <Icon n="check" s={14} />}
              </div>
              <div className="track-info">
                <div className="track-title">{ev.title}</div>
                {ev.when && <div className="track-time">{ev.when}</div>}
                {ev.location && <div className="track-time">{ev.location}</div>}
              </div>
            </div>
          ))}
        </div>
      )) : (
        <p className="text-muted text-sm shipment-track-noevents">
          {tracking?.liveTracking === false ? TRACKING_LEGS_TEXT.liveUnavailable : "Noch keine Ereignisse vorhanden."}
        </p>
      )}
    </div>
  );
}

export function ShipmentsList({ shipments, loading, onCancellationRequested, hasMore, loadingMore, loadMoreError, onLoadMore }) {
  const [trackingId, setTrackingId] = React.useState(null);
  const [tracking, setTracking] = React.useState(null);
  const [trackLoading, setTrackLoading] = React.useState(false);
  // TG22 Paket B: Antwortschutz. Klappt der Kunde eine andere Sendung auf (oder dieselbe zu),
  // bevor der Abruf zurück ist, darf dessen Antwort die jetzt sichtbare Ansicht nicht mehr
  // überschreiben — sonst stünde der Stand der einen Sendung unter der anderen.
  const trackRequest = React.useRef(0);
  // Die Sendung, deren Dokumente offen sind — `null` heißt: kein Drawer
  // gemountet und damit auch kein Abruf. Beim Rendern der Liste wird
  // NICHTS vorab geholt (kein N+1).
  const [documentsShipment, setDocumentsShipment] = React.useState(null);

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
    const anfrage = ++trackRequest.current;
    const aktuell = () => mountedRef.current && anfrage === trackRequest.current;
    setTrackLoading(true); setTracking(null);
    try {
      const res = await getTracking(id);
      if (!aktuell()) return;
      if (!res || !res.ok) {
        if (res?.status !== 401 && res?.status !== 403) // globaler Auth-Redirect übernimmt sonst
          setTracking({ error: TRACKING_ERROR_MESSAGES[res?.status] || "Tracking aktuell nicht verfügbar." });
      } else {
        setTracking(res);
      }
    } catch {
      if (!aktuell()) return;
      setTracking({ error: "Tracking aktuell nicht verfügbar." });
    }
    setTrackLoading(false);
  };

  const loadTracking = (id) => {
    if (trackingId === id) { // erneuter Klick = einklappen; ein laufender Abruf gilt nicht mehr
      trackRequest.current++;
      setTrackingId(null); setTrackLoading(false);
      return;
    }
    setTrackingId(id);
    fetchTracking(id);
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
    const ceId = s.id;
    submittingRef.current = true;
    setCancelBusy(true);
    setCancelError("");
    try {
      const resp = await requestShipmentCancellation(ceId, reason);
      if (!mountedRef.current) return;
      if (resp.ok) {
        let d = {};
        try { d = await resp.json(); } catch { d = {}; }
        const cr = d && typeof d.cancellationRequest === "object" && d.cancellationRequest ? d.cancellationRequest : {};
        const status = cr.status || "pending";
        const requestedAt = cr.createdAt || cr.created_at || null;
        setCancelShipment(null);
        setNotice({ type: "success", text: "Ihre Stornierungsanfrage wird bearbeitet. Wir melden uns persönlich bei Ihnen." });
        onCancellationRequested?.(ceId, { status, requestedAt });
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
        // `ceId` — derselbe CE-Sendungshandle, mit dem der Request adressiert wurde
        // und den der Erfolgszweig darüber übergibt. Hier stand `jid`, ein Restname
        // aus der Zeit, als die Stornierung über die JUMiNGO-Referenz lief: die
        // Variable existiert in dieser Funktion nicht mehr. In einem ES-Modul
        // (strict mode) ist das ein ReferenceError — geworfen INNERHALB des try,
        // vom äußeren catch gefangen und dort als „konnte nicht gesendet werden"
        // ausgegeben. Sichtbare Folge: die Liste wurde nie abgeglichen
        // (`fetchData()` lief nicht) und die Zeile behielt ihren alten Zustand,
        // obwohl der Server gerade gemeldet hatte, dass er sich geändert hat.
        onCancellationRequested?.(ceId, cls.markPending ? { status: "pending" } : {});
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
        {notice && (
          <div className={`alert ${notice.type === "success" ? "alert-success" : "alert-info"} mb-16`} role="status">
            <Icon n={notice.type === "success" ? "check" : "info"} s={16} />{notice.text}
          </div>
        )}
        {loading ? (
          <div className="loading-center"><span className="spinner spinner-dark" /></div>
        ) : shipments.length === 0 ? (
          <EmptyState icon="package" title="Noch keine Sendungen" />
        ) : (
          <>
          <div className="table-card ce-list-table">
            <div className="table-scroll">
              <table>
                <caption className="sr-only">Ihre Sendungen</caption>
                <thead>
                  <tr><th scope="col">Auftragsbestätigung</th><th scope="col">Carrier</th><th scope="col" className="ce-num">Gewicht</th><th scope="col" className="ce-num">Preis</th><th scope="col">Status</th><th scope="col">Datum</th><th scope="col">Aktionen</th></tr>
                </thead>
                <tbody>
                  {shipments.map((s) => {
                    const nums = customerShipmentNumbers(s);
                    // TG-F6: mehrere Trackingnummern — nur dann ändert sich die Anzeige.
                    const alleNummern = multiTrackingReferencesOf(s);
                    return (
                    <React.Fragment key={s.id}>
                      <tr>
                        {/* Die Auftragsbestätigungsnummer (CE-AB…) ist die primäre sichtbare
                            Vorgangsnummer und steht daher zuerst und optisch hervorgehoben.
                            Sendungen aus der Zeit vor CE-AB zeigen einen neutralen Hinweis —
                            NIE die interne Bestellnummer (CE-BS…), NIE die interne Shipment-ID
                            und NIE die JUMiNGO-Shipment-/Ordernummer als Ersatz. */}
                        <td>
                          {nums.orderConfirmationNumber
                            ? <span className="mono font-bold" style={{ fontSize: 13, wordBreak: "break-all" }}>{nums.orderConfirmationNumber}</span>
                            : <span className="text-muted" style={{ fontSize: 12 }}>{NO_ORDER_CONFIRMATION_TEXT}</span>}
                          {/* TG-F6: in der engen Zelle nur die Anzahl — alle Nummern stehen im
                              Sendungsdetail darunter. Eine Einzelnummer bleibt, wie sie war. */}
                          {alleNummern ? (
                            <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                              {trackingReferencesSummary(alleNummern)}
                            </div>
                          ) : nums.trackingNumber && (
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
                          <ShipmentRowActions s={s} expanded={trackingId === s.id} onTrack={loadTracking} onDocuments={setDocumentsShipment} onCancel={openCancel} />
                        </td>
                      </tr>
                      {trackingId === s.id && (
                        <tr>
                          <td colSpan={7} className="shipment-detail-cell">
                          <div className="ce-card-muted shipment-detail-card">
                            {/* Sendungsdetail: die drei kundensichtbaren Werte GETRENNT benannt.
                                Die interne shipments.id (Sendungshandle für Track/Label/Storno)
                                und erst recht die JUMiNGO-Referenz werden hier bewusst NICHT
                                angezeigt — der Handle lebt nur im State und im API-Aufruf. */}
                            <dl className="shipment-detail-numbers">
                              <div className="shipment-detail-item">
                                <dt className="shipment-detail-label">{NUMBER_LABELS.orderConfirmation}</dt>
                                <dd className="shipment-detail-value mono font-bold">
                                  {nums.orderConfirmationNumber || NO_ORDER_CONFIRMATION_TEXT}
                                </dd>
                              </div>
                              {/* TG-F6: ALLE Trackingnummern der Sendung, in Serverreihenfolge. */}
                              {alleNummern ? (
                                <div className="shipment-detail-item">
                                  <dt className="shipment-detail-label">{TRACKING_REFERENCES_TEXT.plural}</dt>
                                  <dd className="shipment-detail-value mono">
                                    <ol className="shipment-tracking-references" style={{ margin: 0, paddingLeft: 18 }}>
                                      {alleNummern.map((nr) => (
                                        <li key={nr} style={{ wordBreak: "break-all" }}>{nr}</li>
                                      ))}
                                    </ol>
                                  </dd>
                                </div>
                              ) : nums.trackingNumber && (
                                <div className="shipment-detail-item">
                                  <dt className="shipment-detail-label">{NUMBER_LABELS.tracking}</dt>
                                  <dd className="shipment-detail-value mono">{nums.trackingNumber}</dd>
                                </div>
                              )}
                              {nums.customerReference && (
                                <div className="shipment-detail-item">
                                  <dt className="shipment-detail-label">{NUMBER_LABELS.customerReference}</dt>
                                  <dd className="shipment-detail-value mono">{nums.customerReference}</dd>
                                </div>
                              )}
                              <div className="shipment-detail-item">
                                <dt className="shipment-detail-label">Carrier</dt>
                                <dd className="shipment-detail-value">{s.selected_carrier ? resolveCarrierName(s.selected_carrier) : "—"}</dd>
                              </div>
                              {shipmentServiceNameOf(s) && (
                                <div className="shipment-detail-item">
                                  <dt className="shipment-detail-label">{SHIPMENT_SERVICE_LABEL}</dt>
                                  <dd className="shipment-detail-value">{shipmentServiceNameOf(s)}</dd>
                                </div>
                              )}
                              <div className="shipment-detail-item">
                                <dt className="shipment-detail-label">Buchungsdatum</dt>
                                <dd className="shipment-detail-value">{dateDE(s.created_at)}</dd>
                              </div>
                              {s.requested_shipping_date && (
                                <div className="shipment-detail-item">
                                  <dt className="shipment-detail-label">Geplantes Versanddatum</dt>
                                  <dd className="shipment-detail-value">{isoDayDE(s.requested_shipping_date)}</dd>
                                </div>
                              )}
                            </dl>
                            <ShipmentTrackingDetail tracking={tracking} loading={trackLoading} onRefresh={() => fetchTracking(s.id)} />
                          </div>
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

          {/* Mobile Kartenansicht (Paket A, Phase 3): bis 1100 px zeigt die
              Liste Karten statt einer quer gescrollten Tabelle — dasselbe
              Muster, das Rechnungen, Entwürfe, Adressbuch und die Adminlisten
              bereits nutzen. Gleiche Daten, gleiche Aktionen, gleiche
              Bedingungen. TG22 Paket B: „Sendung verfolgen" zeigt den Stand jetzt
              auch hier — dieselbe Trackingansicht wie in der Detailzeile der Tabelle. */}
          <ul className="ce-list-cards" aria-label="Sendungen">
            {shipments.map((s) => {
              const nums = customerShipmentNumbers(s);
              // TG-F6: mehrere Trackingnummern — nur dann ändert sich die Anzeige.
              const alleNummern = multiTrackingReferencesOf(s);
              return (
                <li className="ce-list-card" key={`card-${s.id}`}>
                  <div className="ce-list-card-head">
                    <div style={{ minWidth: 0 }}>
                      {nums.orderConfirmationNumber
                        ? <span className="mono font-bold" style={{ fontSize: 13, wordBreak: "break-all" }}>{nums.orderConfirmationNumber}</span>
                        : <span className="text-muted" style={{ fontSize: 12 }}>{NO_ORDER_CONFIRMATION_TEXT}</span>}
                      {alleNummern ? (
                        <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {trackingReferencesSummary(alleNummern)}
                        </div>
                      ) : nums.trackingNumber && (
                        <div className="text-muted mono" style={{ fontSize: 11, marginTop: 2, wordBreak: "break-all" }}>
                          {NUMBER_LABELS.tracking}: {nums.trackingNumber}
                        </div>
                      )}
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  {/* TG-F6: die Karte hat Platz für die vollständige Liste — mobil soll
                      keine Nummer fehlen. */}
                  {alleNummern && (
                    <div className="ce-list-card-row">
                      <span className="ce-list-card-key">{TRACKING_REFERENCES_TEXT.plural}</span>
                      <span className="ce-list-card-val mono">
                        {alleNummern.map((nr) => (
                          <span key={nr} style={{ display: "block", wordBreak: "break-all" }}>{nr}</span>
                        ))}
                      </span>
                    </div>
                  )}
                  <div className="ce-list-card-row">
                    <span className="ce-list-card-key">Carrier</span>
                    <span className="ce-list-card-val">{s.selected_carrier ? resolveCarrierName(s.selected_carrier) : "—"}</span>
                  </div>
                  {shipmentServiceNameOf(s) && (
                    <div className="ce-list-card-row">
                      <span className="ce-list-card-key">{SHIPMENT_SERVICE_LABEL}</span>
                      <span className="ce-list-card-val">{shipmentServiceNameOf(s)}</span>
                    </div>
                  )}
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
                    <ShipmentRowActions s={s} expanded={trackingId === s.id} onTrack={loadTracking} onDocuments={setDocumentsShipment} onCancel={openCancel} />
                  </div>
                  {trackingId === s.id && (
                    <div className="shipment-card-tracking">
                      <ShipmentTrackingDetail tracking={tracking} loading={trackLoading} onRefresh={() => fetchTracking(s.id)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          </>
        )}

        {/* Nachladen weiterer Seiten (Phase 1 Betriebsreife): sichtbar nur, solange der
            Server einen nextCursor meldet — null/fehlend heißt verbindlich „alles geladen"
            (auch gegen ein altes Backend ohne Pagination). Eine bewusste Aktion je Seite,
            kein Scroll-Trigger — dasselbe Muster wie die Auftragsliste. */}
        {hasMore && (
          <div className="ce-load-more">
            <button type="button" className="btn btn-outline" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? "Wird geladen …" : "Weitere Sendungen laden"}
            </button>
          </div>
        )}
        {loadMoreError && <p className="ce-load-more-error" role="alert">{loadMoreError}</p>}
      </div>

      {/* Erst der Klick montiert den Drawer — und erst der Drawer holt die
          Dokumentliste. Die Sendungsliste selbst fragt nie danach. */}
      {documentsShipment && (
        <ShipmentDocumentsDrawer
          shipmentId={documentsShipment.id}
          contextNumber={customerShipmentNumbers(documentsShipment).orderConfirmationNumber || null}
          onClose={() => setDocumentsShipment(null)}
        />
      )}

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
