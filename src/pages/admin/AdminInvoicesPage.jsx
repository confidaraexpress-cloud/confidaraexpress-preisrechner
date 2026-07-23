import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { listAdminInvoices } from "../../api/adminApi";
import { money } from "../../utils/formatters";
import {
  invoiceDisplayMeta,
  isInvoiceOverdue,
  INVOICE_STATUS_FILTER_OPTIONS,
} from "../../utils/adminInvoices";
import { documentStatusMeta, isTestInvoiceDocument, emailDisplayMeta } from "../../utils/invoiceView.mjs";

const PAGE_SIZE = 25;

const EMPTY_FILTERS = {
  status: "",     // "" | unpaid | paid
  user_id: "",
  overdue: "all", // all | yes
};

const ERROR_MESSAGES = {
  400: "Ungültige Filter. Bitte prüfen Sie Ihre Eingaben.",
  404: "Rechnungen sind derzeit nicht verfügbar.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Rechnungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Rechnungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

// ── Response defensiv lesen — keine Annahme über die exakte Backend-Struktur ──
function selectRows(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of ["invoices", "data", "items", "results", "rows"]) {
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

// ── Feld-Getter: NUR erlaubte Felder. password/hash/token/secret werden bewusst
// NIE gelesen — kein Object.keys, kein Spread des ganzen Objekts. Keine Adressen,
// keine Label-/Trackingdaten. E-Mail ist bewusst erlaubt (Forderungsmanagement).
const idOf = (r) => firstDefined(r.id, r.invoice_id, r.invoiceId);
const userIdOf = (r) => firstDefined(r.user_id, r.userId, r.customer_id, r.customerId);
const shipmentIdOf = (r) => firstDefined(r.shipment_id, r.shipmentId);
const invoiceNoOf = (r) => firstDefined(r.invoice_number, r.invoiceNumber, r.number);
const amountOf = (r) => firstDefined(r.amount, r.total, r.amount_gross, r.amountGross);
const vatOf = (r) => firstDefined(r.shipping_vat_amount, r.shippingVatAmount);
const statusOf = (r) => firstDefined(r.status, r.state);
const dueOf = (r) => firstDefined(r.due_date, r.dueDate);
const paidAtOf = (r) => firstDefined(r.paid_at, r.paidAt);
const createdOf = (r) => firstDefined(r.created_at, r.createdAt, r.created);
const nameOf = (r) => firstDefined(r.name, r.customer_name, r.full_name, r.contact_name);
const emailOf = (r) => firstDefined(r.email, r.e_mail);
const companyOf = (r) => firstDefined(r.company_name, r.company, r.firma);
const docStatusOf = (r) => firstDefined(r.document_status, r.documentStatus);
const rowKeyOf = (r, i) => firstDefined(r.id, r.invoice_id, r.invoice_number, r.uuid) ?? `row-${i}`;

// E-Mail-Status-Zelle (Phase 4): Versandstatus; Testdokumente zeigen dauerhaft
// "Testdokument – kein Versand" (es wird nie versendet).
function EmailBadge({ row }) {
  const docStatus = docStatusOf(row);
  if (!docStatus) return <span className="adm-muted">—</span>;
  const [cls, label] = emailDisplayMeta({ document_status: docStatus, is_test_document: row.is_test_document, email_status: row.email_status });
  return <span className={`badge ${cls}`}>{label}</span>;
}

// Dokumentstatus-Zelle: Status-Badge + dauerhafte Testdokument-Kennzeichnung
// (persistiertes is_test_document; NULL bei fertigem Dokument gilt konservativ
// als Test — identisch zur Server-Policy). Keine Hashes/Storage-Daten.
function DocumentBadge({ row }) {
  const status = docStatusOf(row);
  if (!status) return <span className="adm-muted">—</span>;
  const [cls, label] = documentStatusMeta(status);
  const isTest = isTestInvoiceDocument({ document_status: status, is_test_document: row.is_test_document });
  return (
    <span className="adm-doc-badges">
      <span className={`badge ${cls}`}>{label}</span>
      {isTest && <span className="badge badge-yellow">Test</span>}
    </span>
  );
}

const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");
const moneyOrDash = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? money(v) : "—");

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}

// Filter-State → allowlisted API-Filter (all → nicht senden).
function toApiFilters(f) {
  const p = {};
  if (f.status) p.status = f.status;
  if (String(f.user_id).trim()) p.user_id = String(f.user_id).trim();
  if (f.overdue === "yes") p.overdue = "true";
  return p;
}

function StatusBadge({ status, due, now }) {
  const [cls, label] = invoiceDisplayMeta(status, due, now);
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function AdminInvoicesPage() {
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
      const r = await listAdminInvoices({ page, pageSize: PAGE_SIZE, ...toApiFilters(applied) });
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
  const now = new Date(); // „heute" für die Überfälligkeits-Anzeige (nur Anzeige)

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-page-head-row">
        <div>
          <h1 className="adm-title">Rechnungen</h1>
          <p className="adm-sub">
            Read-only Forderungsübersicht — Zahlungsstatus, Fälligkeiten und Beträge. Keine Zahlungsaktion in diesem Schritt.
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
            {INVOICE_STATUS_FILTER_OPTIONS.map((o) => <option key={o.value || "all"} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-user">User-ID</label>
          <input
            id="f-user" type="text" inputMode="numeric" placeholder="z. B. 42"
            value={draft.user_id} onChange={(e) => setField("user_id", e.target.value)}
          />
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-overdue">Überfällig</label>
          <select id="f-overdue" value={draft.overdue} onChange={(e) => setField("overdue", e.target.value)}>
            <option value="all">Alle</option>
            <option value="yes">Ja</option>
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
            <div className="empty-icon">🧾</div>
            <div className="empty-title">Keine Rechnungen gefunden</div>
          </div>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Erstellt am</th>
                  <th>Rechnung-Nr.</th>
                  <th>User-ID</th>
                  <th>Kunde / Firma</th>
                  <th>E-Mail</th>
                  <th>Betrag</th>
                  <th>MwSt Versand</th>
                  <th>Status</th>
                  <th>Dokument</th>
                  <th>E-Mail</th>
                  <th>Fällig am</th>
                  <th>Bezahlt am</th>
                  <th>Shipment-ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const overdue = isInvoiceOverdue(dueOf(row), statusOf(row), now);
                  const company = companyOf(row);
                  const name = nameOf(row);
                  const vat = vatOf(row);
                  return (
                    <tr key={rowKeyOf(row, i)}>
                      <td className="adm-td-time">{fmtDate(createdOf(row))}</td>
                      <td className="adm-mono">
                        {idOf(row) != null
                          ? <Link className="adm-idlink" to={`/admin/invoices/${encodeURIComponent(idOf(row))}`}>{dash(invoiceNoOf(row))}</Link>
                          : dash(invoiceNoOf(row))}
                      </td>
                      <td className="adm-mono">{firstDefined(userIdOf(row)) ?? "—"}</td>
                      <td>
                        <div>{dash(company || name)}</div>
                        {company && name ? <div className="adm-muted adm-cell-sub">{name}</div> : null}
                      </td>
                      <td className="adm-nowrap">{dash(emailOf(row))}</td>
                      <td className="adm-num">{moneyOrDash(amountOf(row))}</td>
                      <td className="adm-num">{vat != null && vat !== "" ? moneyOrDash(vat) : <span className="adm-muted">—</span>}</td>
                      <td><StatusBadge status={statusOf(row)} due={dueOf(row)} now={now} /></td>
                      <td><DocumentBadge row={row} /></td>
                      <td><EmailBadge row={row} /></td>
                      <td className={`adm-nowrap${overdue ? " adm-overdue" : ""}`}>
                        {fmtDate(dueOf(row))}
                        {overdue ? <span className="adm-overdue-tag"> · überfällig</span> : null}
                      </td>
                      <td className="adm-nowrap">{fmtDate(paidAtOf(row))}</td>
                      <td className="adm-mono">{dash(shipmentIdOf(row))}</td>
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
