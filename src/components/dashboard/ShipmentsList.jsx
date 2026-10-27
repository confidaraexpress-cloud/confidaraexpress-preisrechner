import React from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { EmptyState, ErrorState } from "../ui/StateView";
import { money, dateDE, isoDayDE } from "../../utils/formatters";
import { resolveCarrier, resolveCarrierName } from "../../utils/carrierMap";
import { shipmentRecipient } from "../../utils/shipmentRecipientView.mjs";
import { getTracking, requestShipmentCancellation } from "../../api/client";
import { TRACKING_NOT_FOUND } from "../../utils/trackingMessages";
import { CancellationRequestDialog } from "./CancellationRequestDialog";
import { ShipmentDocumentsDrawer } from "./ShipmentDocumentsDrawer";
import { DOCUMENTS_TEXT } from "../../utils/shipmentDocumentsView.mjs";
import { customerShipmentNumbers, NO_ORDER_CONFIRMATION_TEXT, NUMBER_LABELS } from "../../utils/businessNumbers.mjs";
import { isHttpUrl } from "../../utils/externalLink.mjs";
import { dezimal, packageLinesSummaryText } from "../../utils/packageLines.mjs";
import { shipmentServiceNameOf, SHIPMENT_SERVICE_LABEL } from "../../utils/shipmentServiceNameView.mjs";
import {
  multiTrackingReferencesOf, trackingReferencesSummary, TRACKING_REFERENCES_TEXT,
} from "../../utils/trackingReferencesView.mjs";
import {
  trackingLegsOf, trackingStatusLabel, trackingStatusBadgeClass, eventWhenText, trackingLegHeading, trackingEventTone, TRACKING_LEGS_TEXT,
} from "../../utils/trackingLegsView.mjs";
import {
  canRequestCancellation,
  hasCancellationRequest,
  customerCancellationStatusMeta,
  classifyCancellationError,
  readErrorCode,
} from "../../utils/customerCancellation.mjs";
import { BOOKING_IN_REVIEW_TEXT, isBookingInReview } from "../../utils/customerBookingStatus.mjs";
// Block C: der beim Buchen gebundene Abgabe-Paketshop — nur aus dem Serverfeld `dropoff_location`.
import { boundDropoffLocationLine, DROPOFF_LOCATION_LABEL } from "../../utils/dropoffParcelShop.mjs";
import { listeMitFokus } from "../../utils/kundenSuche.mjs";

// Die Gewichtsangabe einer Sendung — bei unterschiedlichen Paketen die Summe („3 Pakete · 31 kg gesamt“,
// Canonical v2.79; die API liefert dann `package_lines`), sonst wie bisher das Gewicht.
// Das Gewicht deutsch geschrieben: der Server liefert es als Dezimalzahl („2.50“), die Liste zeigt „2,5 kg“.
const kg = (w) => { const n = Number(w); return Number.isFinite(n) ? dezimal(n) : String(w); };
const gewichtText = (s) => (Array.isArray(s.package_lines) && s.package_lines.length > 1
  ? packageLinesSummaryText(s.package_lines) : null) || (s.weight ? `${kg(s.weight)} kg` : "—");

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
   ob die Trackingansicht dieser Sendung gerade offen ist.

   Redesign 2026-10: drei klar benannte Textaktionen in EINER Gruppe
   (.ce-row-actions) — „Tracking" klappt die bestehende Trackingansicht auf,
   „Dokumente" öffnet den bestehenden Drawer, „Stornierung anfragen" den
   bestehenden Dialog. Die Stornierung ist als einzige gefährliche Aktion
   erkennbar sekundär (rote Textaktion), kein Symbol, keine Fläche. */
function ShipmentRowActions({ s, expanded, onTrack, onDocuments, onCancel }) {
  /* Package C: eine Sendung in Buchungsklärung hat noch nichts, worauf sich eine
     Aktion beziehen könnte — keine Trackingnummer, keine Dokumente, nichts zu
     stornieren. Statt Knöpfen, die ins Leere führten, steht dort der Satz, der die
     Lage erklärt. Und kein „erneut buchen": der Ausgang ist offen. */
  if (isBookingInReview(s)) {
    return (
      <div className="ce-row-actions stn-actions">
        <span className="shipment-review-note">{BOOKING_IN_REVIEW_TEXT.note}</span>
      </div>
    );
  }
  /* Feste Plätze (Audit B.4, 2026-10-28): Tracking, Dokumente und Stornierung stehen in jeder Zeile an derselben
     Stelle — fehlt eine Aktion, bleibt ihr Platz frei, statt dass die folgenden nach links rutschen. */
  return (
    <div className="ce-row-actions stn-actions stn-actions--plaetze">
      {s.id && (
        <button type="button" className="btn btn-ghost btn-sm stn-act stn-act--tracking" aria-expanded={expanded === true} onClick={() => onTrack(s.id)}>Tracking</button>
      )}
      {/* EINE dokumentbezogene Aktion statt wachsender Einzelknöpfe: welche
          Dokumente es gibt, sagt der Server im Drawer, nicht diese Liste.
          Tracking und Stornierung bleiben eigenständig — sie sind keine Dokumente. */}
      {s.id && (
        <button type="button" className="btn btn-ghost btn-sm stn-act stn-act--dokumente" onClick={() => onDocuments(s)}>
          {DOCUMENTS_TEXT.action}
        </button>
      )}
      {canRequestCancellation(s) && (
        <button type="button" className="btn btn-ghost btn-sm stn-act stn-act--storno stn-request-btn" onClick={() => onCancel(s)}>Stornierung anfragen</button>
      )}
      {hasCancellationRequest(s) && <span className="stn-act stn-act--storno"><CancellationStatusPill status={s.cancellation_status} /></span>}
    </div>
  );
}

/* Empfänger einer Zeile: wer und wohin — aus recipient_address (utils/shipmentRecipientView.mjs). */
function EmpfaengerZelle({ s }) {
  const e = shipmentRecipient(s);
  if (!e) return <span className="shipment-empfaenger shipment-empfaenger--leer">—</span>;
  return (
    <div className="shipment-empfaenger">
      {e.name && <span className="shipment-empfaenger-name">{e.name}</span>}
      {e.wohin && <span className="shipment-empfaenger-ort">{e.wohin}</span>}
    </div>
  );
}

/* Versand einer Zeile: Carrier mit Logo, darunter Dienst und Gewicht. */
function VersandZelle({ s }) {
  const carrier = s.selected_carrier ? resolveCarrier(s.selected_carrier) : null;
  const dienst = shipmentServiceNameOf(s);
  return (
    <div className="shipment-versand">
      <span className="shipment-versand-carrier">
        {carrier?.logo && <img className="shipment-versand-logo" src={carrier.logo} alt="" />}
        <span>{carrier ? carrier.name : "Carrier offen"}</span>
      </span>
      <span className="shipment-versand-detail">{[dienst, gewichtText(s)].filter((t) => t && t !== "—").join(" · ") || "—"}</span>
    </div>
  );
}

/* ── Trackingansicht einer Sendung ────────────────────────────────────────────
   TG22 Paket B: dieselbe Ansicht in der Tabellen-Detailzeile UND in der Mobilkarte.

   Reine Darstellung: Zustand, Endpunkt und „Aktualisieren" kommen aus der Liste. Beide
   Stellen zeigen damit denselben Stand aus demselben Abruf. Die Ereignisse stehen als
   ruhige chronologische Textliste: ein kleiner Punkt je Ereignis — jedes erreichte grün,
   das neueste eines Abschnitts im Stand „Ausnahme" in der Warnfarbe (trackingEventTone,
   dieselbe Regel wie die öffentliche Trackingseite). Keine Symbole im Punkt. */
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
    events: leg.events.map((ev, i) => ({
      title: ev.description,
      when: eventWhenText(ev, { withSuffix: false }) || "",
      location: ev.location,
      tone: trackingEventTone(leg, i),
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
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh}>
          Aktualisieren
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
          {statusLabel && <span className={`badge ${trackingStatusBadgeClass(tracking?.trackingStatus)}`}>{statusLabel}</span>}
          {carrierUrl && (
            <a className="shipment-track-link" href={carrierUrl} target="_blank" rel="noopener noreferrer">
              Beim Versanddienstleister verfolgen
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
              Beim Versanddienstleister verfolgen
            </a>
          )}
          {section.events.map((ev, i) => (
            <div key={i} className="track-event">
              {/* Neuestes Ereignis = letztes Element (aufsteigende Timeline). Der
                  Punkt ist reine Markierung — die Aussage steht im Text daneben. */}
              <div className={`track-dot ${ev.tone}`} aria-hidden="true" />
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

const SHIPMENTS_LOAD_ERROR_TITLE = "Die Sendungen konnten nicht geladen werden.";

export function ShipmentsList({ shipments, loading, loadError, onRetry, onNewShipment, onCancellationRequested, hasMore, loadingMore, loadMoreError, onLoadMore, fokus = null }) {
  // Kopfsuche (Premium-Redesign): der gesuchte Eintrag steht hervorgehoben in der Liste — stand er nicht in den
  // geladenen Seiten, vorn. Zeile und Karte tragen data-suche-fokus; die sichtbare scrollt in den Blick.
  const anzeige = React.useMemo(() => listeMitFokus(shipments, fokus), [shipments, fokus]);
  const fokusId = fokus && fokus.id != null ? String(fokus.id) : null;
  React.useEffect(() => {
    if (!fokusId) return;
    const ziel = [...document.querySelectorAll("[data-suche-fokus]")].find((e) => e.getAttribute("data-suche-fokus") === fokusId && e.offsetParent !== null);
    if (ziel && typeof ziel.scrollIntoView === "function") ziel.scrollIntoView({ block: "center" });
  }, [fokusId]);
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
        setCancelError("Die Stornierungsanfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.");
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
            {notice.text}
          </div>
        )}
        {loading ? (
          <div className="loading-center"><span className="spinner spinner-dark" /></div>
        ) : shipments.length === 0 && loadError ? (
          // F5: Ein Ladefehler ist kein Leerzustand. Der Kunde sieht, dass die Liste nicht geladen wurde, und kann
          // es erneut versuchen (derselbe Weg wie bei den Rechnungen).
          <ErrorState
            title={SHIPMENTS_LOAD_ERROR_TITLE}
            action={<button type="button" className="btn btn-primary btn-sm" id="shipments-retry" onClick={onRetry}>Erneut versuchen</button>}
          />
        ) : shipments.length === 0 ? (
          // Leerzustand nach B8: Titel, ein Satz, eine Aktion — der bestehende Weg zu „Neue Sendung“.
          <EmptyState
            title="Noch keine Sendungen"
            text="Gebuchte Sendungen erscheinen hier mit Status, Dokumenten und Sendungsverfolgung."
            action={onNewShipment ? <button type="button" className="btn btn-primary btn-sm" id="shipments-empty-new" onClick={onNewShipment}>Neue Sendung</button> : null}
          />
        ) : (
          <>
          {/* Desktop: Identität links (Auftragsbestätigung, darunter Carrier · Datum
              und Trackingangabe), Zahlen rechts, Status als ganzer Begriff, Aktionen
              als Textgruppe. Keine gleich breiten Spalten: jede Spalte bekommt die
              Breite ihres Inhalts, die Identität den Rest. */}
          <div className="table-card ce-list-table shipment-table">
            <div className="table-scroll">
              <table>
                <caption className="sr-only">Ihre Sendungen</caption>
                <thead>
                  {/* Die beiden Zahlenspalten tragen den Marker auf Kopf UND Zelle
                      (.ce-num, rechtsbündig, tabellarisch). */}
                  <tr>
                    <th scope="col">Auftragsbestätigung</th>
                    <th scope="col">Empfänger</th>
                    <th scope="col">Versand</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="ce-num">Preis</th>
                    <th scope="col" className="ce-col-actions"><span className="sr-only">Aktionen</span></th>
                  </tr>
                </thead>
                <tbody>
                  {anzeige.map((s) => {
                    const nums = customerShipmentNumbers(s);
                    // TG-F6: mehrere Trackingnummern — nur dann ändert sich die Anzeige.
                    const alleNummern = multiTrackingReferencesOf(s);
                    const gesucht = fokusId !== null && String(s.id) === fokusId;
                    return (
                    <React.Fragment key={s.id}>
                      <tr className={gesucht ? "ce-suche-fokus" : undefined} data-suche-fokus={gesucht ? fokusId : undefined}>
                        {/* Die Auftragsbestätigungsnummer (CE-AB…) ist die primäre sichtbare
                            Vorgangsnummer und steht daher zuerst und optisch hervorgehoben.
                            Sendungen aus der Zeit vor CE-AB zeigen einen neutralen Hinweis —
                            NIE die interne Bestellnummer (CE-BS…), NIE die interne Shipment-ID
                            und NIE die JUMiNGO-Shipment-/Ordernummer als Ersatz. */}
                        <td className="shipment-id-cell">
                          <div className="shipment-id">
                            {nums.orderConfirmationNumber
                              ? <span className="shipment-id-number mono ce-wert">{nums.orderConfirmationNumber}</span>
                              : <span className="shipment-id-fallback">{NO_ORDER_CONFIRMATION_TEXT}</span>}
                            <span className="shipment-id-meta">{dateDE(s.created_at)}</span>
                            {/* TG-F6: in der Zeile nur die Anzahl — alle Nummern stehen im
                                Sendungsdetail darunter. Eine Einzelnummer bleibt, wie sie war. */}
                            {alleNummern ? (
                              <span className="shipment-id-sub">
                                {trackingReferencesSummary(alleNummern)}
                              </span>
                            ) : nums.trackingNumber && (
                              <span className="shipment-id-sub">
                                {NUMBER_LABELS.tracking}:{" "}
                                {/* Die Nummer als Ganzes: passt sie nicht mehr hinter die Beschriftung, beginnt sie in der
                                    nächsten Zeile; nur eine Nummer länger als die Spalte bricht (Audit B.4, umbrechende IDs). */}
                                <span className="shipment-id-nr mono" style={{ wordBreak: "break-all" }}>{nums.trackingNumber}</span>
                              </span>
                            )}
                            {nums.customerReference && (
                              <span className="shipment-id-sub mono">Ref: {nums.customerReference}</span>
                            )}
                          </div>
                        </td>
                        <td className="shipment-empfaenger-cell"><EmpfaengerZelle s={s} /></td>
                        <td className="shipment-versand-cell"><VersandZelle s={s} /></td>
                        <td className="shipment-status"><StatusBadge status={s.status} /></td>
                        <td className="shipment-price ce-num">{money(s.price_final)}</td>
                        <td className="ce-col-actions">
                          <ShipmentRowActions s={s} expanded={trackingId === s.id} onTrack={loadTracking} onDocuments={setDocumentsShipment} onCancel={openCancel} />
                        </td>
                      </tr>
                      {trackingId === s.id && (
                        <tr className="shipment-detail-row">
                          <td colSpan={6} className="shipment-detail-cell">
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
                                    <ol className="shipment-tracking-references">
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
                              {boundDropoffLocationLine(s) && (
                                <div className="shipment-detail-item shipment-detail-dropoff-location">
                                  <dt className="shipment-detail-label">{DROPOFF_LOCATION_LABEL}</dt>
                                  <dd className="shipment-detail-value">{boundDropoffLocationLine(s)}</dd>
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

          {/* Kartenansicht (bis 1100 px statt einer quer gescrollten Tabelle) —
              dasselbe Muster wie Rechnungen, Entwürfe, Adressbuch und die
              Adminlisten. Gleiche Daten, gleiche Aktionen, gleiche Bedingungen:
              Identität und Status zuerst, dann die beschrifteten Werte, dann die
              Textaktionen. TG22 Paket B: „Tracking" zeigt den Stand auch hier —
              dieselbe Trackingansicht wie in der Detailzeile der Tabelle. */}
          <ul className="ce-list-cards shipment-cards" aria-label="Sendungen">
            {anzeige.map((s) => {
              const nums = customerShipmentNumbers(s);
              // TG-F6: mehrere Trackingnummern — nur dann ändert sich die Anzeige.
              const alleNummern = multiTrackingReferencesOf(s);
              const gesucht = fokusId !== null && String(s.id) === fokusId;
              return (
                <li className={`ce-list-card shipment-card${gesucht ? " ce-suche-fokus" : ""}`} key={`card-${s.id}`} data-suche-fokus={gesucht ? fokusId : undefined}>
                  {/* Nur Nummer und Status teilen sich die Kopfzeile; die Trackingangabe
                      steht darunter über die volle Kartenbreite — neben dem Status würde
                      eine lange Nummer schon bei 320 px mitten in der Ziffernfolge brechen. */}
                  <div className="shipment-id shipment-card-ident">
                    <div className="ce-list-card-head">
                      {nums.orderConfirmationNumber
                        ? <span className="shipment-id-number mono" style={{ wordBreak: "break-all" }}>{nums.orderConfirmationNumber}</span>
                        : <span className="shipment-id-fallback">{NO_ORDER_CONFIRMATION_TEXT}</span>}
                      <span className="shipment-status"><StatusBadge status={s.status} /></span>
                    </div>
                    {alleNummern ? (
                      <span className="shipment-id-sub">
                        {trackingReferencesSummary(alleNummern)}
                      </span>
                    ) : nums.trackingNumber && (
                      <span className="shipment-id-sub mono" style={{ wordBreak: "break-all" }}>
                        {NUMBER_LABELS.tracking}: {nums.trackingNumber}
                      </span>
                    )}
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
                    <span className="ce-list-card-key">Empfänger</span>
                    <span className="ce-list-card-val"><EmpfaengerZelle s={s} /></span>
                  </div>
                  <div className="ce-list-card-row">
                    <span className="ce-list-card-key">Carrier</span>
                    <span className="ce-list-card-val shipment-versand-carrier">
                      {s.selected_carrier && resolveCarrier(s.selected_carrier).logo && (
                        <img className="shipment-versand-logo" src={resolveCarrier(s.selected_carrier).logo} alt="" />
                      )}
                      <span>{s.selected_carrier ? resolveCarrierName(s.selected_carrier) : "—"}</span>
                    </span>
                  </div>
                  {shipmentServiceNameOf(s) && (
                    <div className="ce-list-card-row">
                      <span className="ce-list-card-key">{SHIPMENT_SERVICE_LABEL}</span>
                      <span className="ce-list-card-val">{shipmentServiceNameOf(s)}</span>
                    </div>
                  )}
                  <div className="ce-list-card-row">
                    <span className="ce-list-card-key">Datum</span>
                    <span className="ce-list-card-val">{dateDE(s.created_at)}</span>
                  </div>
                  <div className="ce-list-card-row">
                    <span className="ce-list-card-key">Gewicht</span>
                    <span className="ce-list-card-val ce-num">{gewichtText(s)}</span>
                  </div>
                  <div className="ce-list-card-row">
                    <span className="ce-list-card-key">Preis</span>
                    <span className="ce-list-card-val ce-num shipment-card-price">{money(s.price_final)}</span>
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
