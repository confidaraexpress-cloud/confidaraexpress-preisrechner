import React, { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { listAdminShipments } from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";

const PAGE_SIZE = 25;

// ── Anzeige-Labels (reine Übersetzung, keine Logik) ──────────────────────────
// [badge-Klasse, Label]. Unbekannte Status → grau + Rohwert (harmlos).
const STATUS_META = {
  draft: ["badge-gray", "Entwurf"],
  booking: ["badge-yellow", "In Buchung"],
  booked: ["badge-blue", "Gebucht"],
  label_ready: ["badge-blue", "Label bereit"],
};

// Serviceart: nur die belegten Werte pickup/dropoff werden übersetzt, alles
// andere → „Unbekannt" (kein Raten, keine rohe Anzeige technischer Werte).
const SERVICE_LABELS = { pickup: "Abholung", dropoff: "Paketshop" };
const serviceLabel = (v) => {
  if (v === undefined || v === null || v === "") return "Unbekannt";
  return SERVICE_LABELS[String(v).toLowerCase()] || "Unbekannt";
};

const STATUS_OPTIONS = Object.keys(STATUS_META);

const EMPTY_FILTERS = {
  user_id: "",
  status: "",
  carrier: "",
  created_from: "",
  created_to: "",
  has_tracking: "all", // all | yes | no
};

const ERROR_MESSAGES = {
  400: "Ungültige Filter. Bitte prüfen Sie Ihre Eingaben.",
  404: "Sendungen sind derzeit nicht verfügbar.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Sendungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Sendungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

// ── Response defensiv lesen — keine Annahme über die exakte Backend-Struktur ──
function selectRows(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of ["shipments", "data", "items", "results", "rows"]) {
      if (Array.isArray(d[k])) return d[k];
    }
  }
  return [];
}

function selectTotal(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const pag = d.pagination && typeof d.pagination === "object" ? d.pagination : {};
  const t = firstDefined(pag.total, pag.count, pag.total_count, d.total, d.total_count, d.totalCount, d.count);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function selectHasMore(d, rowCount, page, size, total) {
  if (Number.isFinite(total)) return page * size < total;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const pag = d.pagination && typeof d.pagination === "object" ? d.pagination : {};
    if (typeof pag.has_more === "boolean") return pag.has_more;
    if (typeof d.has_more === "boolean") return d.has_more;
  }
  return rowCount >= size; // volle Seite ⇒ evtl. mehr
}

// ── Feld-Extraktion (nur erlaubte, PII-arme Felder; nie ganze Objekte) ───────
const idOf = (r) => firstDefined(r.id, r.shipment_id, r.shipmentId);
const userIdOf = (r) => firstDefined(r.user_id, r.userId, r.customer_id, r.customerId);
const dateOf = (r) => firstDefined(r.created_at, r.createdAt, r.created, r.date);
const carrierOf = (r) => firstDefined(r.carrier, r.selected_carrier, r.carrier_name, r.carrierName);
const statusOf = (r) => firstDefined(r.status, r.state);
const serviceOf = (r) => firstDefined(r.service_type, r.serviceType, r.service, r.shipment_type);
const fromOf = (r) => firstDefined(r.from_country, r.fromCountry, r.origin_country, r.destination_from);
const toOf = (r) => firstDefined(r.to_country, r.toCountry, r.destination_country, r.destination_to);
const priceOf = (r) => firstDefined(r.price_final, r.price_gross, r.priceGross, r.price);
const pkgOf = (r) => firstDefined(r.package_count, r.packageCount, r.packages, r.parcel_count);
const hasTrackingOf = (r) => firstDefined(r.has_tracking, r.hasTracking);
const labelAvailOf = (r) => firstDefined(r.label_available, r.labelAvailable);
const trackingOf = (r) =>
  firstDefined(r.tracking_number_masked, r.masked_tracking_number, r.tracking_number, r.trackingNumber, r.tracking);
const jumingoOf = (r) =>
  firstDefined(r.jumingo_shipment_id_masked, r.masked_jumingo_id, r.jumingo_shipment_id, r.jumingoShipmentId, r.jumingo_id);
const rowKeyOf = (r, i) => firstDefined(r.id, r.shipment_id, r.uuid) ?? `row-${i}`;

// Zeigt AUSSCHLIESSLICH die letzten 4 Zeichen — unabhängig davon, ob das
// Backend bereits maskiert oder (versehentlich) eine volle ID liefert. So kann
// nie eine vollständige tracking_number / jumingo_shipment_id ins DOM gelangen.
function maskTail(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return `••••${s.slice(-4)}`;
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}

function routeOf(r) {
  const from = fromOf(r);
  const to = toOf(r);
  if (!from && !to) return null;
  return `${(from ? String(from) : "?").toUpperCase()} → ${(to ? String(to) : "?").toUpperCase()}`;
}

// Filter-State → allowlisted API-Filter (has_tracking: all → nicht senden).
function toApiFilters(f) {
  const p = {};
  if (String(f.user_id).trim()) p.user_id = String(f.user_id).trim();
  if (f.status) p.status = f.status;
  if (String(f.carrier).trim()) p.carrier = String(f.carrier).trim();
  if (f.created_from) p.created_from = f.created_from;
  if (f.created_to) p.created_to = f.created_to;
  if (f.has_tracking === "yes") p.has_tracking = "true";
  else if (f.has_tracking === "no") p.has_tracking = "false";
  return p;
}

function StatusBadge({ status }) {
  const [cls, label] = STATUS_META[status] || ["badge-gray", status ?? "—"];
  return <span className={`badge ${cls}`}>{label}</span>;
}

function YesNo({ value }) {
  if (value === undefined || value === null || value === "") return <span className="adm-muted">—</span>;
  const yes = value === true || value === 1 || value === "1" || value === "true" || value === "yes";
  return <span className={`badge ${yes ? "badge-green" : "badge-gray"}`}>{yes ? "Ja" : "Nein"}</span>;
}

export default function AdminShipmentsPage() {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await listAdminShipments({ page, pageSize: PAGE_SIZE, ...toApiFilters(applied) });
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) {
          setError(ERROR_MESSAGES[r.status] || GENERIC_ERROR);
        }
        setRows([]);
        setTotal(null);
        setHasMore(false);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const list = selectRows(d);
      const t = selectTotal(d);
      setRows(list);
      setTotal(t);
      setHasMore(selectHasMore(d, list.length, page, PAGE_SIZE, t));
    } catch {
      setError(GENERIC_ERROR);
      setRows([]);
      setTotal(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  const setField = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const applyFilters = () => { setPage(1); setApplied(draft); };
  const resetFilters = () => { setPage(1); setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); };
  const goPrev = () => { if (page > 1) setPage((p) => p - 1); };
  const goNext = () => { if (hasMore) setPage((p) => p + 1); };

  const showPagination = !error && (rows.length > 0 || page > 1);

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-page-head-row">
        <div>
          <h1 className="adm-title">Sendungen</h1>
          <p className="adm-sub">
            PII-arme Sendungsübersicht — nur Einsicht. Keine Adressen, keine Labeldaten, IDs maskiert.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          <Icon n="refresh" s={14} /> Aktualisieren
        </button>
      </header>

      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); applyFilters(); }}>
        <div className="adm-filter-field">
          <label htmlFor="f-user">User-ID</label>
          <input
            id="f-user" type="text" inputMode="numeric" placeholder="z. B. 42"
            value={draft.user_id} onChange={(e) => setField("user_id", e.target.value)}
          />
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={draft.status} onChange={(e) => setField("status", e.target.value)}>
            <option value="">Alle</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_META[s][1]}</option>)}
          </select>
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-carrier">Carrier</label>
          <input
            id="f-carrier" type="text" placeholder="z. B. UPS"
            value={draft.carrier} onChange={(e) => setField("carrier", e.target.value)}
          />
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-from">Von</label>
          <input id="f-from" type="date" value={draft.created_from} onChange={(e) => setField("created_from", e.target.value)} />
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-to">Bis</label>
          <input id="f-to" type="date" value={draft.created_to} onChange={(e) => setField("created_to", e.target.value)} />
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-track">Hat Tracking</label>
          <select id="f-track" value={draft.has_tracking} onChange={(e) => setField("has_tracking", e.target.value)}>
            <option value="all">Alle</option>
            <option value="yes">Ja</option>
            <option value="no">Nein</option>
          </select>
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary btn-sm">
            <Icon n="filter" s={14} /> Anwenden
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters}>
            Zurücksetzen
          </button>
        </div>
      </form>

      {loading ? (
        <div className="table-card">
          <div className="loading-center"><span className="spinner spinner-dark" /> Wird geladen…</div>
        </div>
      ) : error ? (
        <div className="alert alert-error"><Icon n="x" s={16} />{error}</div>
      ) : rows.length === 0 ? (
        <div className="table-card">
          <div className="empty">
            <div className="empty-icon">📦</div>
            <div className="empty-title">Keine Sendungen gefunden</div>
          </div>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Sendung-ID</th>
                  <th>User-ID</th>
                  <th>Carrier</th>
                  <th>Status</th>
                  <th>Serviceart</th>
                  <th>Route</th>
                  <th>Preis</th>
                  <th>Pakete</th>
                  <th>Tracking</th>
                  <th>Label</th>
                  <th>Tracking-Nr.</th>
                  <th>JUMiNGO-ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const price = priceOf(row);
                  const route = routeOf(row);
                  const track = maskTail(trackingOf(row));
                  const jum = maskTail(jumingoOf(row));
                  const pkg = pkgOf(row);
                  return (
                    <tr key={rowKeyOf(row, i)}>
                      <td className="adm-td-time">{fmtDate(dateOf(row))}</td>
                      <td className="adm-mono">{firstDefined(idOf(row)) ?? "—"}</td>
                      <td className="adm-mono">{firstDefined(userIdOf(row)) ?? "—"}</td>
                      <td>{carrierOf(row) ? resolveCarrierName(carrierOf(row)) : "—"}</td>
                      <td><StatusBadge status={statusOf(row)} /></td>
                      <td>{serviceLabel(serviceOf(row))}</td>
                      <td className="adm-nowrap">{route || <span className="adm-muted">—</span>}</td>
                      <td className="adm-num">{price != null ? money(price) : "—"}</td>
                      <td className="adm-num">{pkg != null ? pkg : "—"}</td>
                      <td><YesNo value={hasTrackingOf(row)} /></td>
                      <td><YesNo value={labelAvailOf(row)} /></td>
                      <td>{track ? <span className="adm-mask">{track}</span> : <span className="adm-muted">—</span>}</td>
                      <td>{jum ? <span className="adm-mask">{jum}</span> : <span className="adm-muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPagination && (
        <div className="adm-pagination">
          <button type="button" className="btn btn-outline btn-sm" onClick={goPrev} disabled={loading || page <= 1}>
            <Icon n="chevronLeft" s={14} /> Zurück
          </button>
          <span className="adm-page-ind">
            Seite {page}{Number.isFinite(total) ? ` · ${total} gesamt` : ""}
          </span>
          <button type="button" className="btn btn-outline btn-sm" onClick={goNext} disabled={loading || !hasMore}>
            Weiter <Icon n="chevronRight" s={14} />
          </button>
        </div>
      )}
    </div>
  );
}
