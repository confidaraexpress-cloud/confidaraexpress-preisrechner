import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { listAdminCancellationRequests } from "../../api/adminApi";
import {
  cancellationStatusMeta,
  CANCELLATION_STATUS_FILTER_OPTIONS,
  normalizeCancellationRequest,
} from "../../utils/adminCancellations.mjs";

const PAGE_SIZE = 25;

const ERROR_MESSAGES = {
  400: "Ungültiger Filter. Bitte prüfen Sie Ihre Eingabe.",
  404: "Stornierungsanfragen sind derzeit nicht verfügbar.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Stornierungsanfragen konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Stornierungsanfragen konnten nicht geladen werden. Bitte versuchen Sie es erneut.";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

// ── Response-Container defensiv lesen (Liste). Die Feld-Normalisierung der
// einzelnen Zeilen übernimmt zentral normalizeCancellationRequest. ───────────
function selectRows(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of ["cancellation_requests", "cancellationRequests", "requests", "data", "items", "results", "rows"]) {
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

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}

// Grund kompakt für die Tabelle kürzen (voller Text steht im Detail). Reiner
// Text — React escaped ihn; niemals als HTML rendern.
function reasonPreview(v, max = 90) {
  if (v === undefined || v === null) return "";
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function StatusBadge({ status }) {
  const [cls, label] = cancellationStatusMeta(status);
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function AdminCancellationRequestsPage() {
  const [draftStatus, setDraftStatus] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("");
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
      const params = { page, pageSize: PAGE_SIZE };
      if (appliedStatus) params.status = appliedStatus;
      const r = await listAdminCancellationRequests(params);
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
      const raw = selectRows(d);
      // Zentrale kanonische Normalisierung — Komponenten arbeiten nur mit den
      // kanonischen Feldern (id/status/reason/createdAt/shipment/customer).
      const list = raw.map(normalizeCancellationRequest).filter(Boolean);
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
  }, [appliedStatus, page]);

  useEffect(() => { load(); }, [load]);

  const applyFilter = () => { setPage(1); setAppliedStatus(draftStatus); };
  const resetFilter = () => { setPage(1); setDraftStatus(""); setAppliedStatus(""); };
  const goPrev = () => { if (page > 1) setPage((p) => p - 1); };
  const goNext = () => { if (hasMore) setPage((p) => p + 1); };

  const showPagination = !error && (rows.length > 0 || page > 1);

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-page-head-row">
        <div>
          <h1 className="adm-title">Stornierungsanfragen</h1>
          <p className="adm-sub">
            Interne Prüfung von Kunden-Stornowünschen. Dies ist ein Verwaltungsvorgang —
            das Bearbeiten löst KEINE Carrier-/JUMiNGO-Stornierung und keine Erstattung aus.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          <Icon n="refresh" s={14} /> Aktualisieren
        </button>
      </header>

      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); applyFilter(); }}>
        <div className="adm-filter-field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)}>
            {CANCELLATION_STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary btn-sm">
            <Icon n="filter" s={14} /> Anwenden
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilter}>
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
            <div className="empty-icon">📭</div>
            <div className="empty-title">Keine Stornierungsanfragen gefunden</div>
          </div>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Eingegangen</th>
                  <th>Anfrage-ID</th>
                  <th>Sendung-ID</th>
                  <th>User-ID</th>
                  <th>Status</th>
                  <th>Grund (Auszug)</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const cid = row.id;
                  const sid = row.shipment?.id;
                  const uid = row.customer?.id;
                  const reason = reasonPreview(row.reason);
                  return (
                    <tr key={cid != null ? `req-${cid}` : `row-${i}`}>
                      <td className="adm-td-time">{fmtDate(row.createdAt)}</td>
                      <td className="adm-mono">
                        {cid != null
                          ? <Link className="adm-idlink" to={`/admin/cancellation-requests/${encodeURIComponent(cid)}`}>{cid}</Link>
                          : "—"}
                      </td>
                      <td className="adm-mono">
                        {sid != null && String(sid).trim() !== ""
                          ? <Link className="adm-idlink" to={`/admin/shipments/${encodeURIComponent(sid)}`}>{sid}</Link>
                          : "—"}
                      </td>
                      <td className="adm-mono">{uid != null && String(uid).trim() !== "" ? uid : "—"}</td>
                      <td><StatusBadge status={row.status} /></td>
                      <td>{reason ? <span className="adm-reason-cell">{reason}</span> : <span className="adm-muted">—</span>}</td>
                      <td>
                        {cid != null && (
                          <Link className="btn btn-ghost btn-sm" to={`/admin/cancellation-requests/${encodeURIComponent(cid)}`}>
                            Details <Icon n="chevronRight" s={13} />
                          </Link>
                        )}
                      </td>
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
