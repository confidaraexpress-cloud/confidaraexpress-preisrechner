import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import {
  getAdminShipment, downloadAdminShipmentLabel, getAdminShipmentTracking,
  retryAdminShipmentEmailDelivery,
} from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { maskTail, shipmentStatusMeta } from "../../utils/adminShipments";
import { invoiceStatusMeta } from "../../utils/adminInvoices";
import { orderConfirmationNumberOf, NUMBER_LABELS } from "../../utils/businessNumbers.mjs";
import {
  TRACKING_HINTS,
  TRACKING_LABELS,
  customerIdentity,
  detailSections,
  routeLabel,
  shipmentIdentity,
  shippingModeLabel,
  trackingLinkOrNull,
  trackingView,
} from "../../utils/adminShipmentView.mjs";
import {
  canRetryDelivery, deliveryStatusMeta, deliveryTypeLabel, sortDeliveries,
} from "../../utils/shipmentEmailDeliveryView.mjs";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

const ERROR_MESSAGES = {
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Die Sendung konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Die Sendung konnte nicht geladen werden. Bitte versuchen Sie es erneut.";

// Fehlertexte für den Label-Download (verständlich, kein roher Backend-Body).
const LABEL_ERRORS = {
  404: "Label oder Sendung wurde nicht gefunden.",
  409: "Für diese Sendung ist noch kein Label verfügbar.",
  429: "Zu viele Labelabrufe. Bitte später erneut versuchen.",
  // 500 konsistent zur Kundenmeldung (labelErrors.mjs) — gleiche Ursache,
  // gleicher Wortlaut für Support-Rückfragen.
  500: "Das Versandlabel konnte momentan nicht geladen werden. Bitte versuchen Sie es später erneut.",
  502: "Der Labeldienst ist momentan nicht erreichbar.",
  default: "Label konnte nicht heruntergeladen werden.",
};

// Fehlertexte für die LIVE-Abfrage. Sie sagen ausdrücklich nichts über die
// gespeicherte Trackingnummer aus — 409 heißt „keine Live-Abfrage möglich",
// nicht „keine Trackingnummer vorhanden".
const TRACK_ERRORS = {
  404: "Sendung wurde nicht gefunden.",
  409: "Für diese Sendung ist keine Live-Abfrage beim Versanddienstleister möglich.",
  502: "Der Trackingdienst ist momentan nicht erreichbar.",
  default: "Die Live-Trackingdaten konnten nicht geladen werden.",
};

// Fehlertexte des erneuten Zustellversuchs. Der 409 ist der fachlich wichtige
// Fall: der Server nimmt einen Versuch NUR für eine tatsächlich fehlgeschlagene
// Zustellung an — hat der Worker sie zwischenzeitlich selbst zugestellt oder
// läuft sie gerade, ist der Knopf gegenstandslos.
const RETRY_ERRORS = {
  404: "Diese Zustellung gehört nicht zu dieser Sendung oder existiert nicht mehr.",
  409: "Diese Zustellung ist derzeit nicht wiederholbar. Bitte laden Sie die Seite neu.",
  429: "Zu viele Versuche. Bitte in Kürze erneut versuchen.",
  default: "Der Versand konnte nicht erneut angestoßen werden.",
};

// [badge-Klasse, Anzeigetext]. Farbe heuristisch nach Status-Schlüsselwort,
// unbekannt → neutral. Angezeigt wird der minimierte Backend-Status als Text.
// Ohne Status wird KEIN Status behauptet — der Badge benennt das Fehlen.
function trackStatusMeta(status) {
  if (status === undefined || status === null || status === "") return ["badge-gray", "Kein Trackingstatus"];
  const s = String(status).toLowerCase();
  if (/deliver|zugestellt/.test(s)) return ["badge-green", String(status)];
  if (/transit|unterwegs|zustellung|out.?for/.test(s)) return ["badge-blue", String(status)];
  if (/delay|verzöger|verzoeger|exception|problem|hold/.test(s)) return ["badge-yellow", String(status)];
  if (/fail|fehl|return|retoure|cancel|storn/.test(s)) return ["badge-red", String(status)];
  return ["badge-gray", String(status)];
}

// Selektiert AUSSCHLIESSLICH die minimierten Felder — nie Events/Steps oder ein
// ganzes JUMiNGO-Objekt. Liest top-level und (defensiv) unter `tracking`, aber
// immer nur die erlaubten Skalar-Schlüssel.
function selectTracking(d) {
  const o = d && typeof d === "object" ? d : {};
  const nested = o.tracking && typeof o.tracking === "object" ? o.tracking : null;
  const pick = (...keys) => {
    for (const k of keys) {
      const v = o[k] !== undefined ? o[k] : nested ? nested[k] : undefined;
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  };
  // Carrier-Link: NUR was das Backend liefert. Es wird keine Tracking-URL aus
  // Carrier + Nummer zusammengesetzt. Die Prüfung auf http(s) greift schon hier,
  // damit gar kein javascript:-Wert in den State gelangt — dieselbe Funktion
  // prüft beim Rendern erneut.
  const link = pick("carrierTrackingPage", "carrier_tracking_url", "carrier_tracking_page", "carrierTrackingUrl", "tracking_url");
  return {
    available: pick("trackingAvailable", "tracking_available", "available"),
    status: pick("trackingStatus", "tracking_status", "status"),
    number: pick("trackingNumber", "tracking_number"),
    link: trackingLinkOrNull(typeof link === "string" ? link : null),
    carrier: pick("carrier", "carrier_name", "carrierName"),
    source: pick("source", "quelle"),
  };
}

// Sendungsobjekt defensiv aus der Response ziehen (evtl. unter { shipment }).
function selectShipment(d) {
  if (d && typeof d === "object" && !Array.isArray(d)) {
    if (d.shipment && typeof d.shipment === "object") return d.shipment;
    if (d.data && typeof d.data === "object" && !Array.isArray(d.data)) return d.data;
    return d;
  }
  return null;
}

// ── Feld-Getter (nur erlaubte Felder; nie ganze Objekte rendern) ─────────────
const idOf = (s) => firstDefined(s.id, s.shipment_id, s.shipmentId);
const userIdOf = (s) => firstDefined(s.user_id, s.userId);
const statusOf = (s) => firstDefined(s.status, s.state);
const carrierOf = (s) => firstDefined(s.carrier, s.selected_carrier, s.carrier_name, s.carrierName);
const serviceOf = (s) => firstDefined(s.service_type, s.serviceType, s.service, s.shipment_type);
const dateOf = (s) => firstDefined(s.created_at, s.createdAt, s.created, s.date);
const labelAvailOf = (s) => firstDefined(s.label_available, s.labelAvailable);
const fromCountryOf = (s) => firstDefined(s.from_country, s.fromCountry, s.origin_country);
const toCountryOf = (s) => firstDefined(s.to_country, s.toCountry, s.destination_country);
const fromZipOf = (s) => firstDefined(s.from_zip, s.fromZip, s.origin_zip);
const toZipOf = (s) => firstDefined(s.to_zip, s.toZip, s.destination_zip);
const weightOf = (s) => firstDefined(s.weight, s.weight_kg, s.total_weight);
const lengthOf = (s) => firstDefined(s.length, s.length_cm, s.l);
const widthOf = (s) => firstDefined(s.width, s.width_cm, s.b, s.w);
const heightOf = (s) => firstDefined(s.height, s.height_cm, s.h);
const pkgOf = (s) => firstDefined(s.package_count, s.packageCount, s.packages, s.parcel_count);
const refOf = (s) => firstDefined(s.reference_number, s.reference, s.customer_reference);
const jumingoOf = (s) => firstDefined(s.jumingo_shipment_id, s.jumingoShipmentId, s.jumingo_id, s.jumingo_shipment_id_masked);
const orderOf = (s) => firstDefined(s.order_number, s.orderNumber, s.order_id);
const invoiceOf = (s) => (s.invoice && typeof s.invoice === "object" ? s.invoice : null);
// Zusätzliche Sendungsbenachrichtigungen. Ein Backend ohne dieses Feld liefert es
// schlicht nicht — dann bleibt die Liste leer und die Karte erscheint gar nicht.
const emailDeliveriesOf = (s) =>
  Array.isArray(s.email_deliveries) ? s.email_deliveries
  : Array.isArray(s.emailDeliveries) ? s.emailDeliveries
  : [];

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  // Ohne Sekunden — dieselbe Regel wie dtDE() im Kundenportal (Paket C). Der
  // Zeitpunkt bleibt identisch, nur die Darstellung ist ruhiger. Der
  // Rohwert-Fallback für unparsbare Werte bleibt unverändert.
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString("de-DE", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}

const asStr = (v) => (v != null && v !== "" ? String(v) : null);
const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");

// Referenz: nur wenn unkritisch/kurz — sonst gekürzt (kein Masking, aber kein
// überlanger Freitext im DOM).
function refDisplay(v) {
  const s = asStr(v);
  if (!s) return "—";
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

function dimensions(s) {
  const l = lengthOf(s), w = widthOf(s), h = heightOf(s);
  if (l == null && w == null && h == null) return "—";
  const part = (x) => (x == null || x === "" ? "?" : String(x));
  return `${part(l)} × ${part(w)} × ${part(h)} cm`;
}

function routeStr(s) {
  const from = fromCountryOf(s), to = toCountryOf(s);
  if (!from && !to) return "—";
  return `${asStr(from)?.toUpperCase() || "?"} → ${asStr(to)?.toUpperCase() || "?"}`;
}

// ── Adresse strukturiert aufbereiten (KEIN Object.keys, feste Feldliste) ─────
function buildAddress(addr) {
  if (addr === null || addr === undefined) return { state: "none" };
  if (typeof addr === "string") return addr.trim() ? { state: "string", text: addr.trim() } : { state: "none" };
  if (typeof addr !== "object" || Array.isArray(addr)) return { state: "none" };
  if (addr.anonymized === true || addr.is_anonymized === true || addr.tombstoned === true || addr.deleted === true || addr.anonymized_at) {
    return { state: "anon" };
  }
  const fields = [
    ["Firma", firstDefined(addr.company, addr.company_name, addr.firma)],
    ["Name", firstDefined(addr.name, addr.contact_name, addr.full_name, addr.contact)],
    ["Straße", firstDefined(addr.street, addr.street1, addr.address1, addr.strasse, addr.address_line1)],
    ["Zusatz", firstDefined(addr.address_addition, addr.addition, addr.street2, addr.address2, addr.zusatz, addr.address_line2)],
    ["PLZ", firstDefined(addr.zip, addr.postal_code, addr.plz, addr.postcode, addr.zip_code)],
    ["Stadt", firstDefined(addr.city, addr.stadt, addr.town, addr.ort)],
    ["Land", firstDefined(addr.country, addr.country_code, addr.land)],
    ["Telefon", firstDefined(addr.phone, addr.tel, addr.telefon, addr.phone_number)],
    ["E-Mail", firstDefined(addr.email, addr.e_mail, addr.mail)],
  ];
  if (!fields.some(([, v]) => v != null && v !== "")) return { state: "anon" };
  return { state: "object", fields };
}

function KV({ items }) {
  return (
    <dl className="adm-kv">
      {items.map(([k, v]) => (
        <div className="adm-kv-item" key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function AddressBlock({ title, addr }) {
  const built = buildAddress(addr);
  return (
    <div className="adm-addr">
      <div className="adm-addr-title">{title}</div>
      {built.state === "none" ? (
        <p className="adm-addr-note">Nicht verfügbar</p>
      ) : built.state === "anon" ? (
        <p className="adm-addr-note">Anonymisiert</p>
      ) : built.state === "string" ? (
        <p className="adm-addr-str">{built.text}</p>
      ) : (
        <dl className="adm-kv">
          {built.fields.map(([k, v]) => (
            <div className="adm-kv-item" key={k}>
              <dt>{k}</dt>
              <dd>{dash(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export default function AdminShipmentDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [showPii, setShowPii] = useState(false); // Adressen initial NICHT im DOM
  const [confirmLabel, setConfirmLabel] = useState(false); // Bestätigungsdialog
  const [labelBusy, setLabelBusy] = useState(false);       // Download läuft
  const [labelMsg, setLabelMsg] = useState(null);          // { type, text }
  const [trackBusy, setTrackBusy] = useState(false);       // Tracking-Abruf läuft
  const [trackData, setTrackData] = useState(null);        // nur minimierte Felder
  const [trackError, setTrackError] = useState(null);      // Fehlertext
  const [retryBusyId, setRetryBusyId] = useState(null);    // laufender Zustellversuch
  const [retryMsg, setRetryMsg] = useState(null);          // { type, text }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotFound(false);
    setShowPii(false); // jede Sendung startet eingeklappt; kein Merken (localStorage)
    setConfirmLabel(false);
    setLabelMsg(null);
    setTrackData(null); // kein Cache über Sendungen hinweg
    setTrackError(null);
    setRetryMsg(null);
    setRetryBusyId(null);
    try {
      const r = await getAdminShipment(id);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect
        if (r.status === 404) { setNotFound(true); setData(null); return; }
        setError(ERROR_MESSAGES[r.status] || GENERIC_ERROR);
        setData(null);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      setData(selectShipment(d));
    } catch {
      setError(GENERIC_ERROR);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const back = (
    <Link to="/admin/shipments" className="adm-back">
      <Icon n="chevronLeft" s={16} /> Zurück zur Liste
    </Link>
  );

  if (loading) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card"><div className="loading-center" role="status" aria-live="polite"><span className="spinner spinner-dark" /> Sendung wird geladen…</div></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card">
          <div className="empty">
            <div className="empty-icon" aria-hidden="true"><Icon n="search" s={24} /></div>
            <div className="empty-title">Die Sendung wurde nicht gefunden.</div>
            <p className="empty-text">
              Möglicherweise wurde sie entfernt oder die Adresse ist nicht mehr gültig.
            </p>
            <Link className="btn btn-outline btn-sm" to="/admin/shipments">Zurück zur Sendungsliste</Link>
          </div>
        </div>
      </div>
    );
  }

  // Ladefehler: verständliche Meldung MIT direkter Wiederholung — kein
  // Stacktrace, kein roher Backendtext, keine Sackgasse.
  if (error || !data) {
    return (
      <div className="adm-page">
        {back}
        <div className="adm-loaderr">
          <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{error || GENERIC_ERROR}</div>
          <div className="adm-loaderr-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={load} disabled={loading}>
              <Icon n="refresh" s={14} /> Erneut versuchen
            </button>
            <Link className="btn btn-outline btn-sm" to="/admin/shipments">Zurück zur Sendungsliste</Link>
          </div>
        </div>
      </div>
    );
  }

  const s = data;
  const ident = shipmentIdentity(s);
  const cust = customerIdentity(s);
  const sections = detailSections(s);
  const emailDeliveries = sortDeliveries(emailDeliveriesOf(s));
  const [statusCls, statusLabel] = shipmentStatusMeta(statusOf(s));
  // EIN Tracking-View-Model für Kopfbereich, Versanddaten und Live-Block. Die
  // drei Zustände (gespeicherte Nummer / Live-Daten / Carrier-Link) kommen ab
  // hier ausschließlich von hier — es gibt keine zweite Bedingungslogik mehr.
  const track = trackingView(s, trackData);
  const invoice = invoiceOf(s);
  const labelAvailable = labelAvailOf(s) === true || labelAvailOf(s) === "true";

  const openLabelConfirm = () => { setLabelMsg(null); setConfirmLabel(true); };
  const confirmDownload = async () => {
    setConfirmLabel(false);
    setLabelBusy(true);
    setLabelMsg(null);
    try {
      // Blob-Download + sofortiges revokeObjectURL passieren in adminApi; hier
      // wird nichts vom Label gehalten (kein State, kein DOM, kein Log).
      await downloadAdminShipmentLabel(id);
      setLabelMsg({ type: "success", text: "Label wurde heruntergeladen." });
    } catch (e) {
      // 401/403 hat apiFetch bereits zentral behandelt (Logout/Redirect).
      if (e?.status !== 401 && e?.status !== 403) {
        setLabelMsg({ type: "error", text: LABEL_ERRORS[e?.status] || LABEL_ERRORS.default });
      }
    } finally {
      setLabelBusy(false);
    }
  };

  // Tracking wird NUR nach bewusstem Klick geladen. Jeder Klick lädt neu (kein
  // Cache). Es werden ausschließlich die minimierten Felder im State gehalten —
  // nie das rohe Objekt, keine Events, kein Logging, keine Persistierung.
  const loadTracking = async () => {
    setTrackBusy(true);
    setTrackError(null);
    setTrackData(null);
    try {
      const r = await getAdminShipmentTracking(id);
      if (!r.ok) {
        // 401/403 hat apiFetch bereits zentral behandelt (Logout/Redirect).
        if (r.status !== 401 && r.status !== 403) {
          setTrackError(TRACK_ERRORS[r.status] || TRACK_ERRORS.default);
        }
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      setTrackData(selectTracking(d));
    } catch {
      setTrackError(TRACK_ERRORS.default);
    } finally {
      setTrackBusy(false);
    }
  };

  // Erneuter Zustellversuch EINER fehlgeschlagenen Zusatzmail. Es wird kein Body
  // gesendet: Empfänger, Betreff, Inhalt, Anhang und Trackinglink stehen
  // serverseitig fest. Nach dem Anstoßen wird die Detailseite neu geladen, statt
  // den Zustand lokal umzuschreiben — der maßgebliche Status steht in der
  // Datenbank, und der Worker kann ihn zwischenzeitlich weitergedreht haben.
  const retryDelivery = async (deliveryId) => {
    setRetryBusyId(deliveryId);
    setRetryMsg(null);
    try {
      const r = await retryAdminShipmentEmailDelivery(id, deliveryId);
      if (!r.ok) {
        if (r.status !== 401 && r.status !== 403) {
          setRetryMsg({ type: "error", text: RETRY_ERRORS[r.status] || RETRY_ERRORS.default });
        }
        return;
      }
      setRetryMsg({ type: "success", text: "Der Versand wurde erneut angestoßen." });
      await load();
    } catch {
      setRetryMsg({ type: "error", text: RETRY_ERRORS.default });
    } finally {
      setRetryBusyId(null);
    }
  };

  return (
    <div className="adm-page">
      {/* 1) Kopfbereich — derselbe Seitenkopf wie in den Adminlisten. Die
          fachliche Sendungskennung ist der Titel; die interne ID ist ein
          technischer Schlüssel und steht unten bei den technischen Infos.

          Die Aktion „Kunde öffnen" stand hier bis Paket E ein ZWEITES Mal —
          identisch zu „Kundendetail öffnen" in der Karte „Kunde". Sie lebt
          jetzt nur noch dort, direkt neben den Kundendaten. */}
      <PageHeader
        variant="admin"
        eyebrow="Verwaltung"
        backLink={back}
        title={ident.primary}
        subtitle={(
          <span className="adm-detail-sub">
            <span>{cust.primary}</span>
            {cust.secondary && <span>{cust.secondary}</span>}
            {routeLabel(s) && <span>{routeLabel(s)}</span>}
          </span>
        )}
        meta={(
          <>
            <span className={`badge ${statusCls}`}>{statusLabel}</span>
            <span className="adm-chip"><Icon n="package" s={13} />{carrierOf(s) ? resolveCarrierName(carrierOf(s)) : "Carrier noch nicht gewählt"}</span>
            <span className="adm-chip">{shippingModeLabel(s)}</span>
            <span className="adm-chip"><Icon n="calendar" s={13} />{fmtDate(dateOf(s))}</span>
            {sections.label && <span className="badge badge-green">Label verfügbar</span>}
            {/* Aussage ausschließlich über die GESPEICHERTE Nummer — nicht
                über Live-Daten oder einen Carrier-Link. Gleiche Quelle wie
                die Zeile „Trackingnummer (gespeichert)" weiter unten. */}
            {sections.trackingNumber && (
              <span className="badge badge-green">{TRACKING_LABELS.storedBadge}</span>
            )}
          </>
        )}
      />

      <div className="adm-cards">
        {/* 2) Kunde — fachliche Identität plus Sprung ins Kundenkonto. Bewusst
             ohne E-Mail/Kontoadresse: dafür ist die Kundendetailseite zuständig. */}
        {sections.customer && (
          <div className="adm-card">
            <div className="adm-card-head"><Icon n="building" s={17} /> Kunde</div>
            <div className="adm-card-body">
              <KV items={[
                ["Firmenname", cust.known ? cust.primary : <span className="adm-muted">{cust.primary}</span>],
                ["Kundennummer", cust.secondary || "—"],
                ["Ansprechpartner", dash(firstDefined(s.customer_name, s.customerName))],
              ]} />
              {userIdOf(s) != null && (
                <div className="adm-track-link">
                  <Link className="btn btn-outline btn-sm" to={`/admin/users/${encodeURIComponent(userIdOf(s))}`}>
                    <Icon n="arrowRight" s={14} /> Kundendetail öffnen
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3) Versanddaten */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="package" s={17} /> Versanddaten</div>
          <div className="adm-card-body">
            <KV items={[
              ["Route", routeStr(s)],
              ["PLZ (Von → Bis)", (fromZipOf(s) || toZipOf(s)) ? `${dash(fromZipOf(s))} → ${dash(toZipOf(s))}` : "—"],
              ["Gewicht", weightOf(s) != null ? `${weightOf(s)} kg` : "—"],
              ["Maße (L × B × H)", dimensions(s)],
              ["Pakete", pkgOf(s) != null ? String(pkgOf(s)) : "—"],
              // Nummern strikt getrennt benannt: „Auftragsbestätigung" ist AUSSCHLIESSLICH die
              // CE-Vorgangsnummer (CE-AB…). Die externe JUMiNGO-Ordernummer trägt weiter unten
              // eine eigene, unmissverständliche Beschriftung — sie hieß hier einmal
              // „Bestell-Nr." und war damit von der CE-Nummer nicht unterscheidbar.
              // Die interne Bestellnummer (CE-BS…) wird auch im Admin nicht mehr angezeigt:
              // sie bezeichnet denselben Vorgang und stand hier als zweite Nummer daneben.
              [NUMBER_LABELS.orderConfirmation, orderConfirmationNumberOf(s)
                ? <span className="adm-mono">{orderConfirmationNumberOf(s)}</span> : "—"],
              [NUMBER_LABELS.adminCustomerReference, refDisplay(refOf(s))],
              // Beschriftung sagt ausdrücklich „gespeichert": das ist die bei
              // ConfidaraExpress hinterlegte Nummer, NICHT das Ergebnis einer
              // Live-Abfrage beim Carrier. Beide standen vorher unter demselben
              // Wort „Trackingnummer" und schienen sich zu widersprechen.
              [TRACKING_LABELS.storedNumber, track.stored.present
                ? <span className="adm-mask">{maskTail(track.stored.number) || "Vorhanden"}</span>
                : <span className="adm-muted">{TRACKING_HINTS.noStoredNumber}</span>],
              [NUMBER_LABELS.jumingoOrder, <span className="adm-mask">{maskTail(orderOf(s)) || "—"}</span>],
              ["JUMiNGO-Shipment-ID", <span className="adm-mask">{maskTail(jumingoOf(s)) || "—"}</span>],
            ]} />
          </div>
        </div>

        {/* 3) Preisbereich (nur Anzeige) */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="euro" s={17} /> Preis</div>
          <div className="adm-card-body">
            <KV items={[
              ["Ursprungspreis", firstDefined(s.price_original, s.priceOriginal) != null ? money(firstDefined(s.price_original, s.priceOriginal)) : "—"],
              ["Netto", firstDefined(s.price_netto, s.price_net, s.priceNet) != null ? money(firstDefined(s.price_netto, s.price_net, s.priceNet)) : "—"],
              ["MwSt.", firstDefined(s.price_vat, s.priceVat, s.vat) != null ? money(firstDefined(s.price_vat, s.priceVat, s.vat)) : "—"],
              ["Endpreis", firstDefined(s.price_final, s.priceFinal) != null ? money(firstDefined(s.price_final, s.priceFinal)) : "—"],
            ]} />
          </div>
        </div>

        {/* 4) Rechnungsbereich */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="invoice" s={17} /> Rechnung</div>
          <div className="adm-card-body">
            {invoice ? (
              <KV items={[
                ["Rechnungs-ID", dash(firstDefined(invoice.id, invoice.invoice_id))],
                ["Nummer", dash(firstDefined(invoice.invoice_number, invoice.number))],
                ["Betrag", firstDefined(invoice.amount, invoice.total) != null ? money(firstDefined(invoice.amount, invoice.total)) : "—"],
                ["Status", (() => { const [c, l] = invoiceStatusMeta(firstDefined(invoice.status)); return <span className={`badge ${c}`}>{l}</span>; })()],
                ["Fällig", fmtDate(firstDefined(invoice.due_date, invoice.dueDate))],
                ["Bezahlt am", fmtDate(firstDefined(invoice.paid_at, invoice.paidAt))],
              ]} />
            ) : (
              <p className="adm-addr-note">Keine Rechnung verknüpft</p>
            )}
          </div>
        </div>

        {/* 4b) Zusätzliche E-Mail-Zustellungen — NUR wenn der Kunde welche bestellt
             hat. Der Normalfall ist die leere Liste; eine leere Karte würde eine
             Funktion behaupten, die diese Sendung gar nicht nutzt (dieselbe Regel
             wie bei der Zollkarte weiter unten). Sachliche Statusanzeige, keine
             neue Adminseite, kein Menüpunkt, kein Dashboardmodul. */}
        {emailDeliveries.length > 0 && (
          <div className="adm-card">
            <div className="adm-card-head"><Icon n="mail" s={17} /> Zusätzliche E-Mail-Zustellungen</div>
            <div className="adm-card-body">
              {retryMsg && (
                <div
                  className={`alert ${retryMsg.type === "success" ? "alert-success" : "alert-error"}`}
                  role="status"
                  aria-live="polite"
                >
                  <Icon n={retryMsg.type === "success" ? "check" : "info"} s={16} />
                  {retryMsg.text}
                </div>
              )}
              {emailDeliveries.map((row) => {
                const [cls, text, roh] = deliveryStatusMeta(row.status);
                return (
                  <div className="adm-maildel" key={row.id}>
                    <div className="adm-maildel-main">
                      <div className="adm-maildel-type">{deliveryTypeLabel(row.notification_type)}</div>
                      {/* Die Adresse steht vollständig: ein Supportfall lebt genau davon,
                          und diese Seite liefert ohnehin auditiert Adressdaten aus. */}
                      <div className="adm-maildel-to">{dash(row.recipient_email)}</div>
                      <div className="adm-maildel-meta">
                        {row.status === "sent" && row.sent_at
                          ? `Gesendet am ${fmtDateTime(row.sent_at)}`
                          : row.status === "pending" && row.next_attempt_at
                            ? `Nächster Versuch: ${fmtDateTime(row.next_attempt_at)}`
                            : null}
                      </div>
                    </div>
                    <div className="adm-maildel-side">
                      {/* Rohwert höchstens im title, nie im sichtbaren Text. */}
                      <span className={`badge ${cls}`} title={roh || undefined}>{text}</span>
                      {canRetryDelivery(row) && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => retryDelivery(row.id)}
                          disabled={retryBusyId != null}
                        >
                          {retryBusyId === row.id ? "Wird angestoßen …" : "Erneut versuchen"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="adm-support-hint">
                Diese Nachrichten gehen zusätzlich an die vom Kunden angegebenen Adressen.
                Empfänger, Betreff, Inhalt und Anhang stehen serverseitig fest und sind hier
                nicht veränderbar.
              </p>
            </div>
          </div>
        )}

        {/* 5) Adressbereich / PII — standardmäßig eingeklappt */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="lock" s={17} /> Adressdaten</div>
          <div className="adm-card-body">
            <div className="adm-pii-warn">
              <Icon n="lock" s={16} />
              <span>
                Diese Daten enthalten personenbezogene Absender- und Empfängerinformationen.
                Der Detailzugriff wird protokolliert.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowPii((v) => !v)}
              aria-expanded={showPii}
            >
              <Icon n={showPii ? "eyeOff" : "eye"} s={14} />
              {showPii ? "Adressdaten ausblenden" : "Adressdaten anzeigen"}
            </button>

            {showPii && (
              <div className="adm-addr-grid" style={{ marginTop: 16 }}>
                <AddressBlock title="Absender" addr={firstDefined(s.sender_address, s.senderAddress)} />
                <AddressBlock title="Empfänger" addr={firstDefined(s.recipient_address, s.recipientAddress)} />
              </div>
            )}
          </div>
        </div>

        {/* Support-Aktionen — „Label herunterladen" aktiv; Tracking folgt später */}
        {/* Zoll — NUR bei tatsächlicher Zollrelevanz, nie als leere Karte bei
             Inlandssendungen. Es werden ausschließlich gespeicherte Werte gezeigt;
             die fachliche Zollprüfung bleibt vollständig im Backend. */}
        {sections.customs && (
          <div className="adm-card">
            <div className="adm-card-head"><Icon n="globe" s={17} /> Zoll</div>
            <div className="adm-card-body">
              <KV items={[
                ["Zollrelevant", "Ja — Sendung verlässt den EU-Zollraum"],
                ["Warenwert", firstDefined(s.goods_value, s.goodsValue) != null
                  ? money(firstDefined(s.goods_value, s.goodsValue)) : "—"],
                ["Ursprungsland", dash(fromCountryOf(s))],
                ["Zielland", dash(toCountryOf(s))],
              ]} />
              <p className="adm-support-hint">
                Warenpositionen und Handelsrechnung werden im Buchungsvorgang erfasst und sind
                hier bewusst nicht dupliziert.
              </p>
            </div>
          </div>
        )}

        {/* Technische Informationen — eingeklappt, natives <details>. */}
        <details className="adm-card adm-tech">
          <summary className="adm-card-head adm-tech-summary">
            <Icon n="settings" s={17} /> Technische Informationen
            <span className="adm-tech-caret" aria-hidden="true"><Icon n="chevron" s={16} /></span>
          </summary>
          <div className="adm-card-body">
            <KV items={[
              ["Interne Sendungs-ID", dash(idOf(s))],
              ["Interne Kunden-ID", dash(userIdOf(s))],
              ["Interner Status", dash(statusOf(s))],
              ["Versandart (roh)", dash(serviceOf(s))],
              ["JUMiNGO-Sendungs-ID", jumingoOf(s) ? <span className="adm-mask">{maskTail(jumingoOf(s))}</span> : "—"],
              ["JUMiNGO-Ordernummer", orderOf(s) ? <span className="adm-mask">{maskTail(orderOf(s))}</span> : "—"],
              ["Erstellt am", fmtDateTime(dateOf(s))],
              ["Zuletzt getrackt", fmtDateTime(firstDefined(s.last_tracked_at, s.lastTrackedAt))],
            ]} />
          </div>
        </details>

        <div className="adm-card">
          <div className="adm-card-head"><Icon n="headset" s={17} /> Support-Aktionen</div>
          <div className="adm-card-body">
            {labelMsg && (
              <div className={`alert ${labelMsg.type === "success" ? "alert-success" : "alert-error"}`} role={labelMsg.type === "success" ? "status" : "alert"} style={{ marginBottom: 12 }}>
                <Icon n={labelMsg.type === "success" ? "check" : "x"} s={16} />{labelMsg.text}
              </div>
            )}
            <div className="adm-support">
              {labelAvailable ? (
                <button type="button" className="btn btn-outline btn-sm" onClick={openLabelConfirm} disabled={labelBusy}>
                  {labelBusy
                    ? <><span className="spinner spinner-dark" /> Wird geladen…</>
                    : <><Icon n="download" s={14} /> Label herunterladen</>}
                </button>
              ) : (
                <button type="button" className="btn btn-outline btn-sm" disabled title="Label noch nicht verfügbar">
                  <Icon n="download" s={14} /> Label herunterladen
                </button>
              )}
              {/* Live-Abfrage nur anbieten, wenn sie fachlich möglich ist: ohne
                  JUMiNGO-Sendungs-ID antwortet das Backend mit 409. Der Button
                  betrifft ausschließlich Live-Daten und Carrier-Link — nicht die
                  gespeicherte Trackingnummer. */}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={loadTracking}
                disabled={trackBusy || !track.lookup.possible}
                title={track.lookup.possible ? undefined : track.lookup.hint}
                aria-describedby={track.lookup.possible ? undefined : "adm-track-lookup-hint"}
              >
                {trackBusy
                  ? <><span className="spinner spinner-dark" /> Lade Live-Tracking…</>
                  : <><Icon n="mapPin" s={14} /> {TRACKING_LABELS.lookupAction}</>}
              </button>
            </div>
            {!labelAvailable && <p className="adm-support-hint">Label für diese Sendung noch nicht verfügbar.</p>}
            {!track.lookup.possible && (
              <p className="adm-support-hint" id="adm-track-lookup-hint">{track.lookup.hint}</p>
            )}
            <p className="adm-support-hint">Label- und Trackingabrufe werden protokolliert.</p>

            {trackError && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                <Icon n="x" s={16} />{trackError}
              </div>
            )}
            {/* Live-Block — ausschließlich Zustand 2 und 3. Er trifft KEINE
                Aussage über die gespeicherte Trackingnummer; die steht zum
                Vergleich mit eigener Beschriftung mit drin. */}
            {track.live.loaded && (
              <div className="adm-track">
                <div className="adm-track-head">
                  <span className="adm-track-title">{TRACKING_LABELS.liveTitle}</span>
                  {(() => { const [c, l] = trackStatusMeta(track.live.status); return <span className={`badge ${c}`}>{l}</span>; })()}
                </div>
                {!track.live.hasData && <p className="adm-track-note">{track.live.hint}</p>}
                <dl className="adm-kv">
                  <div className="adm-kv-item">
                    <dt>{TRACKING_LABELS.liveStatus}</dt>
                    <dd>{track.live.status || "Noch kein Status geliefert"}</dd>
                  </div>
                  <div className="adm-kv-item">
                    <dt>{TRACKING_LABELS.liveNumber}</dt>
                    <dd className="adm-mask">{maskTail(track.live.number) || "Nicht geliefert"}</dd>
                  </div>
                  <div className="adm-kv-item">
                    <dt>{TRACKING_LABELS.storedNumber}</dt>
                    <dd className="adm-mask">
                      {track.stored.present
                        ? (maskTail(track.stored.number) || "Vorhanden")
                        : TRACKING_HINTS.noStoredNumber}
                    </dd>
                  </div>
                  <div className="adm-kv-item">
                    <dt>Carrier</dt>
                    <dd>{track.live.carrier ? resolveCarrierName(track.live.carrier) : "—"}</dd>
                  </div>
                  <div className="adm-kv-item"><dt>Quelle</dt><dd>{dash(track.live.source)}</dd></div>
                </dl>
                <div className="adm-track-link">
                  {track.link.available ? (
                    <a className="btn btn-outline btn-sm" href={track.link.url} target="_blank" rel="noopener noreferrer">
                      <Icon n="external" s={14} /> {TRACKING_LABELS.carrierLink} öffnen
                    </a>
                  ) : (
                    <span className="adm-support-hint">{track.link.hint}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bestätigungsdialog — Download erst nach bewusster Bestätigung. Bis
          Paket E war er handgebaut und hatte weder Fokusfalle noch
          Fokusrückgabe noch Escape; er läuft jetzt über die gemeinsame
          ConfirmDialog-Komponente. Der Wortlaut ist unverändert. */}
      {confirmLabel && (
        <ConfirmDialog
          title="Label herunterladen"
          text="Dieses Label enthält Absender- und Empfängeradressen. Der Download wird protokolliert."
          icon="download"
          confirmIcon="download"
          confirmLabel="Download bestätigen"
          onCancel={() => setConfirmLabel(false)}
          onConfirm={confirmDownload}
        />
      )}
    </div>
  );
}
