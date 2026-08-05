import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { listAdminShipments } from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { shipmentStatusMeta } from "../../utils/adminShipments";
import {
  EMPTY_SHIPMENT_FILTERS,
  HAS_TRACKING_OPTIONS,
  SHIPMENT_STATUS_FILTER_OPTIONS,
  activeShipmentFilterChips,
  customerIdentity,
  hasActiveShipmentFilters,
  priceDisplay,
  shipmentEmptyState,
  shipmentFields,
  shipmentIdentity,
  shipmentMarkers,
  shipmentRouteLine,
  shippingModeLabel,
  toShipmentApiFilters,
  validateShipmentFilters,
} from "../../utils/adminShipmentView.mjs";

const PAGE_SIZE = 25;

const ERROR_MESSAGES = {
  400: "Ungültige Filter. Bitte prüfen Sie Ihre Eingaben.",
  404: "Sendungen sind derzeit nicht verfügbar.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Die Sendungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Die Sendungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.";

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
  const t = firstDefined(pag.total, pag.count, pag.total_count, d.total, d.total_count, d.count);
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
  return rowCount >= size;
}

const rowKeyOf = (r, i) => shipmentFields(r).id ?? `row-${i}`;
const detailPath = (id) => `/admin/shipments/${encodeURIComponent(id)}`;

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
}

function StatusBadge({ status }) {
  const [cls, label] = shipmentStatusMeta(status);
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ── Zellinhalte (geteilt zwischen Tabelle und Mobilkarte) ────────────────────

// Spalte „Sendung": Bestellnummer primär (Link), Datum sekundär. Die interne
// Sendungs-ID ist bewusst NICHT mehr die Navigation.
function ShipmentCell({ row }) {
  const f = shipmentFields(row);
  const ident = shipmentIdentity(row);
  const muted = ident.kind !== "order_number";
  return (
    <div className="adm-ship">
      {f.id != null ? (
        <Link className={`adm-ship-no${muted ? " adm-ship-no-muted" : ""}`} to={detailPath(f.id)}>
          {ident.primary}
        </Link>
      ) : (
        <span className="adm-ship-no">{ident.primary}</span>
      )}
      {f.createdAt && <span className="adm-ship-date">{fmtDate(f.createdAt)}</span>}
    </div>
  );
}

// Spalte „Kunde": Firma primär, Kundennummer sekundär — nie die user_id.
function CustomerCell({ row }) {
  const f = shipmentFields(row);
  const c = customerIdentity(row);
  return (
    <div className="adm-ship-cust">
      {c.known && f.userId != null ? (
        <Link className="adm-ship-cust-name" to={`/admin/users/${encodeURIComponent(f.userId)}`}>
          {c.primary}
        </Link>
      ) : (
        <span className={`adm-ship-cust-name${c.known ? "" : " adm-muted"}`}>{c.primary}</span>
      )}
      {c.secondary && <span className="adm-ship-cust-no">{c.secondary}</span>}
    </div>
  );
}

// Spalte „Versand": Carrier + Versandart, darunter Route + Paketanzahl.
function ShippingCell({ row }) {
  const f = shipmentFields(row);
  const line = shipmentRouteLine(row);
  return (
    <div className="adm-ship-way">
      <span className="adm-ship-carrier">
        {f.carrier ? resolveCarrierName(f.carrier) : "Carrier noch nicht gewählt"}
        <span className="adm-ship-mode"> · {shippingModeLabel(row)}</span>
      </span>
      {line && <span className="adm-ship-route">{line}</span>}
    </div>
  );
}

// Status + kompakte Tracking-/Label-Marker (statt zweier breiter Ja/Nein-Spalten).
function StatusCell({ row }) {
  const markers = shipmentMarkers(row);
  return (
    <div className="adm-ship-status">
      <StatusBadge status={shipmentFields(row).status} />
      {markers.length > 0 && (
        <span className="adm-ship-markers">
          {markers.map((m) => (
            <span key={m.key} className="adm-ship-marker">
              <Icon n={m.key === "tracking" ? "mapPin" : "invoice"} s={12} /> {m.label}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function PriceCell({ row }) {
  const p = priceDisplay(row);
  if (p.known) return <span className="adm-num">{money(p.value)}</span>;
  return <span className="adm-muted adm-ship-noprice">{p.text}</span>;
}

export default function AdminShipmentsPage() {
  const [draft, setDraft] = useState(EMPTY_SHIPMENT_FILTERS);
  const [applied, setApplied] = useState(EMPTY_SHIPMENT_FILTERS);
  const [filterError, setFilterError] = useState("");
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
      const r = await listAdminShipments({ page, pageSize: PAGE_SIZE, ...toShipmentApiFilters(applied) });
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) setError(ERROR_MESSAGES[r.status] || GENERIC_ERROR);
        setRows([]); setTotal(null); setHasMore(false);
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
      setRows([]); setTotal(null); setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  const setField = (k, v) => setDraft((p) => ({ ...p, [k]: v }));

  // Filter anwenden: erst validieren, dann Pagination zurücksetzen. Während ein
  // Request läuft, ist der Button gesperrt — kein Doppel-Request durch Doppelklick.
  const applyFilters = () => {
    const v = validateShipmentFilters(draft);
    if (!v.valid) { setFilterError(v.error); return; }
    setFilterError("");
    setPage(1);
    setApplied(draft);
  };
  const resetFilters = () => {
    setFilterError("");
    setPage(1);
    setDraft(EMPTY_SHIPMENT_FILTERS);
    setApplied(EMPTY_SHIPMENT_FILTERS);
  };

  const goPrev = () => { if (page > 1) setPage((p) => p - 1); };
  const goNext = () => { if (hasMore) setPage((p) => p + 1); };

  const chips = useMemo(() => activeShipmentFilterChips(applied), [applied]);
  const emptyState = shipmentEmptyState({ count: rows.length, filters: applied });
  const showPagination = !error && !loading && (rows.length > 0 || page > 1);

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-page-head-row">
        <div>
          <h1 className="adm-title">Sendungen</h1>
          <p className="adm-sub">
            Sendungsübersicht — nur Einsicht. Keine Adressen, keine Labeldaten, Kennungen maskiert.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          <Icon n="refresh" s={14} /> Aktualisieren
        </button>
      </header>

      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); applyFilters(); }}>
        <div className="adm-filter-field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={draft.status} onChange={(e) => setField("status", e.target.value)}>
            {SHIPMENT_STATUS_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-carrier">Carrier</label>
          <input
            id="f-carrier" type="text" placeholder="z. B. ups"
            value={draft.carrier} onChange={(e) => setField("carrier", e.target.value)}
          />
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-from">Zeitraum von</label>
          <input id="f-from" type="date" value={draft.created_from} onChange={(e) => setField("created_from", e.target.value)} />
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-to">Zeitraum bis</label>
          <input id="f-to" type="date" value={draft.created_to} onChange={(e) => setField("created_to", e.target.value)} />
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-track">Tracking</label>
          <select id="f-track" value={draft.has_tracking} onChange={(e) => setField("has_tracking", e.target.value)}>
            {HAS_TRACKING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-user">Kunden-ID</label>
          <input
            id="f-user" type="text" inputMode="numeric" placeholder="optional"
            value={draft.user_id} onChange={(e) => setField("user_id", e.target.value)}
            aria-describedby={filterError ? "f-error" : undefined}
            aria-invalid={filterError ? "true" : undefined}
          />
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
            <Icon n="filter" s={14} /> Anwenden
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters} disabled={loading}>
            Zurücksetzen
          </button>
        </div>
        {/* Das Backend bietet für Sendungen keine Freitextsuche — das wird hier
            ehrlich benannt statt eine globale Suche vorzutäuschen. */}
        <p className="adm-support-hint adm-filter-hint">
          Es gibt keine Freitextsuche über Kunde oder Bestellnummer — filtern Sie über Status,
          Carrier, Zeitraum, Tracking oder die Kunden-ID.
        </p>
        {filterError && <p id="f-error" className="field-error adm-filter-error" role="alert">{filterError}</p>}
      </form>

      {chips.length > 0 && (
        <div className="adm-filter-chips">
          <span className="adm-filter-chips-label">Aktive Filter:</span>
          {chips.map((c) => <span key={c.key} className="adm-chip">{c.label}</span>)}
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters} disabled={loading}>
            <Icon n="x" s={13} /> Filter zurücksetzen
          </button>
        </div>
      )}

      {loading ? (
        <div className="table-card">
          <div className="loading-center" role="status" aria-live="polite">
            <span className="spinner spinner-dark" /> Sendungen werden geladen…
          </div>
        </div>
      ) : error ? (
        <div className="adm-loaderr">
          <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{error}</div>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>
            <Icon n="refresh" s={14} /> Erneut versuchen
          </button>
        </div>
      ) : emptyState.show ? (
        <div className="table-card">
          <div className="empty">
            <div className="empty-icon">{hasActiveShipmentFilters(applied) ? "🔎" : "📦"}</div>
            <div className="empty-title">{emptyState.title}</div>
            <p className="empty-text">{emptyState.text}</p>
            {hasActiveShipmentFilters(applied) && (
              <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters}>
                <Icon n="x" s={13} /> Filter zurücksetzen
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Desktop: sechs Spalten — kein horizontales Scrollen mehr. */}
          <div className="table-card adm-ships-table">
            <table>
              <caption className="sr-only">
                Sendungsliste, Seite {page}. Spalten: Sendung, Kunde, Versand, Status, Preis, Aktion.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Sendung</th>
                  <th scope="col">Kunde</th>
                  <th scope="col">Versand</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="adm-num">Preis</th>
                  <th scope="col" className="adm-col-action">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const f = shipmentFields(row);
                  return (
                    <tr key={rowKeyOf(row, i)}>
                      <td><ShipmentCell row={row} /></td>
                      <td><CustomerCell row={row} /></td>
                      <td><ShippingCell row={row} /></td>
                      <td><StatusCell row={row} /></td>
                      <td className="adm-num"><PriceCell row={row} /></td>
                      <td className="adm-col-action">
                        {f.id != null && (
                          <Link className="btn btn-outline btn-sm" to={detailPath(f.id)}>Details</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobil: Karten statt Tabelle — kein horizontaler Seitenüberlauf. */}
          <ul className="adm-ships-cards">
            {rows.map((row, i) => {
              const f = shipmentFields(row);
              return (
                <li className="adm-scard" key={`c-${rowKeyOf(row, i)}`}>
                  <div className="adm-scard-head">
                    <ShipmentCell row={row} />
                    <StatusCell row={row} />
                  </div>
                  <dl className="adm-scard-kv">
                    <div><dt>Kunde</dt><dd><CustomerCell row={row} /></dd></div>
                    <div><dt>Versand</dt><dd><ShippingCell row={row} /></dd></div>
                    <div><dt>Preis</dt><dd><PriceCell row={row} /></dd></div>
                  </dl>
                  <div className="adm-scard-actions">
                    {f.id != null && (
                      <Link className="btn btn-outline btn-sm" to={detailPath(f.id)}>Details</Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
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
