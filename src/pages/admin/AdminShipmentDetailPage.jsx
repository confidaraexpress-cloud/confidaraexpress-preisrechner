import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { getAdminShipment, downloadAdminShipmentLabel, getAdminShipmentTracking } from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { maskTail, shipmentStatusMeta, serviceLabel } from "../../utils/adminShipments";
import { invoiceStatusMeta } from "../../utils/adminInvoices";

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
  502: "Der Labeldienst ist momentan nicht erreichbar.",
  default: "Label konnte nicht heruntergeladen werden.",
};

// Fehlertexte für den Tracking-Abruf.
const TRACK_ERRORS = {
  404: "Sendung wurde nicht gefunden.",
  409: "Für diese Sendung sind noch keine Trackinginformationen verfügbar.",
  502: "Trackingdienst momentan nicht erreichbar.",
  default: "Tracking konnte nicht geladen werden.",
};

// Nur valide http(s)-Links als Carrier-Link zulassen (verhindert javascript:-URLs).
const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\/\S/i.test(v.trim());
const yesNoText = (v) =>
  v === true || v === "true" || v === 1 || v === "1" ? "Ja"
  : v === false || v === "false" || v === 0 || v === "0" ? "Nein"
  : "—";

// [badge-Klasse, Anzeigetext]. Farbe heuristisch nach Status-Schlüsselwort,
// unbekannt → neutral. Angezeigt wird der minimierte Backend-Status als Text.
function trackStatusMeta(status) {
  if (status === undefined || status === null || status === "") return ["badge-gray", "Unbekannt"];
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
  const link = pick("carrierTrackingPage", "carrier_tracking_url", "carrier_tracking_page", "carrierTrackingUrl", "tracking_url");
  return {
    available: pick("trackingAvailable", "tracking_available", "available"),
    status: pick("trackingStatus", "tracking_status", "status"),
    number: pick("trackingNumber", "tracking_number"),
    link: isHttpUrl(link) ? String(link).trim() : null,
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
const trackingOf = (s) => firstDefined(s.tracking_number, s.trackingNumber, s.tracking_number_masked, s.masked_tracking_number);
const jumingoOf = (s) => firstDefined(s.jumingo_shipment_id, s.jumingoShipmentId, s.jumingo_id, s.jumingo_shipment_id_masked);
const orderOf = (s) => firstDefined(s.order_number, s.orderNumber, s.order_id);
const invoiceOf = (s) => (s.invoice && typeof s.invoice === "object" ? s.invoice : null);

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}

function hasTrackingOf(s) {
  const v = firstDefined(s.has_tracking, s.hasTracking);
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return trackingOf(s) ? true : null; // aus Daten ableiten, sonst unbekannt
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotFound(false);
    setShowPii(false); // jede Sendung startet eingeklappt; kein Merken (localStorage)
    setConfirmLabel(false);
    setLabelMsg(null);
    setTrackData(null); // kein Cache über Sendungen hinweg
    setTrackError(null);
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
        <div className="table-card"><div className="loading-center"><span className="spinner spinner-dark" /> Wird geladen…</div></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card">
          <div className="empty">
            <div className="empty-icon">🔎</div>
            <div className="empty-title">Sendung nicht gefunden</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="adm-page">
        {back}
        <div className="alert alert-error"><Icon n="x" s={16} />{error || GENERIC_ERROR}</div>
      </div>
    );
  }

  const s = data;
  const [statusCls, statusLabel] = shipmentStatusMeta(statusOf(s));
  const hasTracking = hasTrackingOf(s);
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

  return (
    <div className="adm-page">
      {back}

      {/* 1) Kopfbereich */}
      <div className="adm-card">
        <div className="adm-card-body">
          <div className="adm-detail-head">
            <span className="adm-detail-id">Sendung #{dash(idOf(s))}</span>
            <span className="adm-detail-badges">
              <span className={`badge ${statusCls}`}>{statusLabel}</span>
              <span className="adm-chip"><Icon n="package" s={13} />{carrierOf(s) ? resolveCarrierName(carrierOf(s)) : "—"}</span>
              <span className="adm-chip">{serviceLabel(serviceOf(s))}</span>
              <span className="adm-chip"><Icon n="calendar" s={13} />{fmtDate(dateOf(s))}</span>
              <span className={`badge ${labelAvailOf(s) === true || labelAvailOf(s) === "true" ? "badge-green" : "badge-gray"}`}>
                Label {labelAvailOf(s) === true || labelAvailOf(s) === "true" ? "verfügbar" : "nicht verfügbar"}
              </span>
              {hasTracking !== null && (
                <span className={`badge ${hasTracking ? "badge-green" : "badge-gray"}`}>
                  Tracking {hasTracking ? "vorhanden" : "keins"}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="adm-cards">
        {/* 2) Versanddaten */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="package" s={17} /> Versanddaten</div>
          <div className="adm-card-body">
            <KV items={[
              ["Route", routeStr(s)],
              ["PLZ (Von → Bis)", (fromZipOf(s) || toZipOf(s)) ? `${dash(fromZipOf(s))} → ${dash(toZipOf(s))}` : "—"],
              ["Gewicht", weightOf(s) != null ? `${weightOf(s)} kg` : "—"],
              ["Maße (L × B × H)", dimensions(s)],
              ["Pakete", pkgOf(s) != null ? String(pkgOf(s)) : "—"],
              ["Referenz", refDisplay(refOf(s))],
              ["Tracking-Nr.", <span className="adm-mask">{maskTail(trackingOf(s)) || "—"}</span>],
              ["JUMiNGO-ID", <span className="adm-mask">{maskTail(jumingoOf(s)) || "—"}</span>],
              ["Bestell-Nr.", <span className="adm-mask">{maskTail(orderOf(s)) || "—"}</span>],
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
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="headset" s={17} /> Support-Aktionen</div>
          <div className="adm-card-body">
            {labelMsg && (
              <div className={`alert ${labelMsg.type === "success" ? "alert-success" : "alert-error"}`} style={{ marginBottom: 12 }}>
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
              <button type="button" className="btn btn-outline btn-sm" onClick={loadTracking} disabled={trackBusy}>
                {trackBusy
                  ? <><span className="spinner spinner-dark" /> Lade Tracking…</>
                  : <><Icon n="mapPin" s={14} /> Tracking prüfen</>}
              </button>
            </div>
            {!labelAvailable && <p className="adm-support-hint">Label für diese Sendung noch nicht verfügbar.</p>}
            <p className="adm-support-hint">Label- und Trackingabrufe werden protokolliert.</p>

            {trackError && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                <Icon n="x" s={16} />{trackError}
              </div>
            )}
            {trackData && (
              <div className="adm-track">
                <div className="adm-track-head">
                  <span className="adm-track-title">Trackinginformationen</span>
                  {(() => { const [c, l] = trackStatusMeta(trackData.status); return <span className={`badge ${c}`}>{l}</span>; })()}
                </div>
                <dl className="adm-kv">
                  <div className="adm-kv-item"><dt>Tracking verfügbar</dt><dd>{yesNoText(trackData.available)}</dd></div>
                  <div className="adm-kv-item"><dt>Trackingnummer</dt><dd className="adm-mono">{dash(trackData.number)}</dd></div>
                  <div className="adm-kv-item"><dt>Carrier</dt><dd>{trackData.carrier ? resolveCarrierName(trackData.carrier) : "—"}</dd></div>
                  <div className="adm-kv-item"><dt>Quelle</dt><dd>{dash(trackData.source)}</dd></div>
                </dl>
                <div className="adm-track-link">
                  {trackData.link ? (
                    <a className="btn btn-outline btn-sm" href={trackData.link} target="_blank" rel="noopener noreferrer">
                      <Icon n="external" s={14} /> Beim Versanddienstleister öffnen
                    </a>
                  ) : (
                    <span className="adm-support-hint">Kein Carrier-Link vorhanden</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bestätigungsdialog — Download erst nach bewusster Bestätigung. */}
      {confirmLabel && (
        <div className="adm-modal-overlay" role="presentation" onClick={() => setConfirmLabel(false)}>
          <div
            className="adm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adm-label-title"
            aria-describedby="adm-label-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="adm-modal-icon" aria-hidden="true"><Icon n="download" s={22} /></div>
            <h2 id="adm-label-title" className="adm-modal-title">Label herunterladen</h2>
            <p id="adm-label-desc" className="adm-modal-text">
              Dieses Label enthält Absender- und Empfängeradressen. Der Download wird protokolliert.
            </p>
            <div className="adm-modal-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmLabel(false)}>Abbrechen</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmDownload}>
                <Icon n="download" s={14} /> Download bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
