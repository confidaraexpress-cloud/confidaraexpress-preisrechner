import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { listAdminBillingModeRequests } from "../../api/adminApi";
import { selectListTotal, selectListHasMore } from "../../utils/adminOverview.mjs";
import { formatTimestampDayDe } from "../../utils/billingModeView.mjs";
import {
  ADMIN_BILLING_REQUEST_TEXT as T, BILLING_MODE_REQUEST_FILTER_OPTIONS, billingModeRequestCustomerCell,
  billingModeRequestEmptyState, billingModeRequestStatusMeta, normalizeAdminBillingModeRequest,
} from "../../utils/adminBillingModeRequests.mjs";

// Anträge auf Sammelrechnung (P5, Canonical v2.111). Die Liste zeigt und führt zum Kundendetail; entschieden
// wird dort — mit Kontodaten, Buchungsrahmen und Verlauf vor Augen. Offene Anträge stehen als Arbeitsliste
// mit dem ältesten zuerst; jeder Filter liest denselben Serverendpunkt.
const PAGE_SIZE = 25;
const ERROR_MESSAGES = {
  400: "Ungültiger Filter. Bitte prüfen Sie Ihre Eingabe.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
};
const kontoPfad = (id) => `/admin/users/${encodeURIComponent(id)}`;

function CustomerCell({ row }) {
  const c = billingModeRequestCustomerCell(row);
  const uid = row.customer?.id ?? row.userId;
  return (
    <div className="adm-bmr-cust">
      {uid != null && c.known
        ? <Link className="adm-bmr-cust-name" to={kontoPfad(uid)}>{c.primary}</Link>
        : <span className={`adm-bmr-cust-name${c.known ? "" : " adm-muted"}`}>{c.primary}</span>}
      {c.secondary && <span className="adm-bmr-sub">{c.secondary}</span>}
    </div>
  );
}

// Die Begründung ist Freitext des Kunden: als reiner Text gerendert (React escaped) und in der Liste gekürzt.
function NoteCell({ row }) {
  const text = row.customerNote ? row.customerNote.replace(/\s+/g, " ").trim() : "";
  return text ? <p className="adm-bmr-note">{text}</p> : <span className="adm-muted">—</span>;
}

function StatusBadge({ status }) {
  const [cls, label] = billingModeRequestStatusMeta(status);
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function AdminBillingModeRequestsPage() {
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [approvalAvailable, setApprovalAvailable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await listAdminBillingModeRequests({ status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) setError(ERROR_MESSAGES[r.status] || T.listError);
        setRows([]); setTotal(null); setHasMore(false);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const list = (Array.isArray(d.requests) ? d.requests : []).map(normalizeAdminBillingModeRequest).filter(Boolean);
      const t = selectListTotal(d);
      setRows(list);
      setTotal(t);
      setHasMore(selectListHasMore(d, list.length, page, PAGE_SIZE, t));
      setApprovalAvailable(d.approvalAvailable === true);
    } catch {
      setError(T.listError);
      setRows([]); setTotal(null); setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  const leer = billingModeRequestEmptyState(status);
  const showPagination = !error && (rows.length > 0 || page > 1);

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>{T.pageTitle}</>}
        subtitle={<>{T.pageSubtitle}</>}
        actions={(
          <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
            Aktualisieren
          </button>
        )}
      />

      <div className="adm-filters">
        <div className="adm-filter-field">
          <label htmlFor="f-bmr-status">Status</label>
          <select id="f-bmr-status" value={status} disabled={loading}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            {BILLING_MODE_REQUEST_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {approvalAvailable === false && (
        <div className="adm-note mt-8 adm-bmr-hint" id="adm-bmr-approval-unavailable"><span>{T.approvalUnavailable}</span></div>
      )}

      {loading ? (
        <div className="table-card">
          <ListSkeleton rows={4} label="Anträge werden geladen …" />
        </div>
      ) : error ? (
        <div className="ce-card">
          <ErrorState
            title={error}
            action={<button type="button" className="btn btn-primary btn-sm" onClick={load}>Erneut versuchen</button>}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="table-card">
          <div className="empty">
            <div className="empty-title">{leer.title}</div>
            <p className="empty-text">{leer.text}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-card adm-bmr-table">
            <table>
              <caption className="sr-only">Anträge auf Sammelrechnung — Kunde, Begründung, Status, beantragt am und Aktion.</caption>
              <thead>
                <tr>
                  <th scope="col">Kunde</th>
                  <th scope="col">Begründung</th>
                  <th scope="col">Status</th>
                  <th scope="col">Beantragt am</th>
                  <th scope="col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`bmr-${row.id}`}>
                    <td><CustomerCell row={row} /></td>
                    <td><NoteCell row={row} /></td>
                    <td><StatusBadge status={row.status} /></td>
                    <td className="adm-bmr-time">{formatTimestampDayDe(row.requestedAt) || "—"}</td>
                    <td>
                      {row.userId != null
                        ? <Link className="btn btn-outline btn-sm" to={kontoPfad(row.userId)}>{T.review}</Link>
                        : <span className="adm-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="adm-bmr-cards">
            {rows.map((row) => (
              <li className="adm-scard" key={`bmr-c-${row.id}`}>
                <div className="adm-scard-head">
                  <CustomerCell row={row} />
                  <StatusBadge status={row.status} />
                </div>
                <dl className="adm-scard-kv">
                  <div><dt>Begründung</dt><dd><NoteCell row={row} /></dd></div>
                  <div><dt>Beantragt am</dt><dd>{formatTimestampDayDe(row.requestedAt) || "—"}</dd></div>
                </dl>
                {row.userId != null && (
                  <div className="adm-scard-actions">
                    <Link className="btn btn-outline btn-sm" to={kontoPfad(row.userId)}>{T.review}</Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {showPagination && (
        <div className="adm-pagination">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}>Zurück</button>
          <span className="adm-page-ind">Seite {page}{Number.isFinite(total) ? ` · ${total} gesamt` : ""}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPage((p) => p + 1)}
            disabled={loading || !hasMore}>Weiter</button>
        </div>
      )}
    </div>
  );
}
