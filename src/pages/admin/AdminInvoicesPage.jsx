import React, { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Link } from "react-router-dom";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { listAdminInvoices, listManualInvoiceDrafts } from "../../api/adminApi";
import { MANUAL_INVOICE_TEXT, formatCents } from "../../utils/manualInvoiceView.mjs";
import { money } from "../../utils/formatters";
import { selectListTotal, selectListHasMore } from "../../utils/adminOverview.mjs";
import {
  EMPTY_INVOICE_FILTERS,
  INVOICE_LIST_ERROR,
  INVOICE_STATUS_FILTER_OPTIONS,
  activeInvoiceFilterChips,
  customerCell,
  hasActiveInvoiceFilters,
  invoiceEmptyState,
  invoiceMarkers,
  invoiceModeMeta,
  invoiceSourceMeta,
  isInvoiceOverdue,
  isProductiveInvoice,
  paymentStatus,
  toInvoiceApiFilters,
  validateInvoiceFilters,
} from "../../utils/adminInvoiceView.mjs";

const PAGE_SIZE = 25;

const ERROR_MESSAGES = {
  400: "Ungültige Filter. Bitte prüfen Sie Ihre Eingaben.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
};

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

// selectTotal/selectHasMore lagen bis Paket E in jeder Adminliste als eigene,
// fast wortgleiche Kopie. Sie stehen jetzt einmal in utils/adminOverview.mjs —
// gleiches Verhalten, eine Quelle.
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



// ── Feld-Getter: NUR erlaubte Felder. Kein Object.keys, kein Spread der ganzen
// Zeile. Die Kunden-E-Mail wird in der Liste bewusst NICHT mehr gelesen — für
// das Forderungsmanagement genügt Firma + Kundennummer; die Adresse steht im
// Detail. Auch user_id und shipment_id sind hier keine Anzeigewerte mehr.
const idOf = (r) => firstDefined(r.id, r.invoice_id, r.invoiceId);
const invoiceNoOf = (r) => firstDefined(r.invoice_number, r.invoiceNumber, r.number);
const amountOf = (r) => firstDefined(r.amount, r.gross_amount, r.total);
const dueOf = (r) => firstDefined(r.due_date, r.dueDate);
const paidAtOf = (r) => firstDefined(r.paid_at, r.paidAt);
const createdOf = (r) => firstDefined(r.created_at, r.createdAt, r.created);
const rowKeyOf = (r, i) => firstDefined(r.id, r.invoice_id, r.invoice_number, r.uuid) ?? `row-${i}`;

const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");
const moneyOrDash = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? money(v) : "—");

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}

const detailPath = (id) => `/admin/invoices/${encodeURIComponent(id)}`;

// ── Zellen ──────────────────────────────────────────────────────────────────
// Rechnungsnummer als Link + Erstelldatum + Modus-Badge. Die Nummer bricht
// kontrolliert (overflow-wrap) und bleibt vollständig markier-/kopierbar —
// sie wird NIE gekürzt, weil das ihre Eindeutigkeit zerstören würde.
function InvoiceCell({ row }) {
  const mode = invoiceModeMeta(row);
  const source = invoiceSourceMeta(row);
  const id = idOf(row);
  const number = dash(invoiceNoOf(row));
  return (
    <div className="adm-inv">
      {id != null
        ? <Link className="adm-inv-no" to={detailPath(id)}>{number}</Link>
        : <span className="adm-inv-no">{number}</span>}
      <span className="adm-inv-meta">
        {fmtDate(createdOf(row))}
        {mode.badge && <span className={`badge ${mode.badge}`}>{mode.short}</span>}
        {source.manual && <span className={`badge ${source.badge}`} title={source.label}>{source.short}</span>}
      </span>
    </div>
  );
}

function CustomerCell({ row }) {
  const c = customerCell(row);
  return (
    <div className="adm-inv-cust">
      <span className={`adm-inv-cust-name${c.known ? "" : " adm-muted"}`}>{c.primary}</span>
      {c.secondary && <span className="adm-inv-cust-no">{c.secondary}</span>}
    </div>
  );
}

// Betrag mit Fälligkeit darunter. Bei nicht produktiven Rechnungen erscheint
// KEIN Fälligkeits-/Überfälligkeitsalarm — sie sind keine Forderung.
function AmountCell({ row, now }) {
  const productive = isProductiveInvoice(row);
  const overdue = isInvoiceOverdue(row, now);
  return (
    <div className="adm-inv-amount">
      <span className="adm-inv-sum">{moneyOrDash(amountOf(row))}</span>
      {productive ? (
        <span className={`adm-inv-due${overdue ? " adm-overdue" : ""}`}>
          {dueOf(row) ? `Fällig am ${fmtDate(dueOf(row))}` : "Ohne Fälligkeit"}
        </span>
      ) : (
        <span className="adm-inv-due adm-muted">Nicht zahlungswirksam</span>
      )}
    </div>
  );
}

function StatusCell({ row, now }) {
  const s = paymentStatus(row, now);
  return (
    <span className="adm-inv-status">
      <span className={`badge ${s.cls}`}>{s.label}</span>
      {s.kind === "paid" && paidAtOf(row) && <span className="adm-inv-paid">seit {fmtDate(paidAtOf(row))}</span>}
    </span>
  );
}

// Dokument- und Versandzustand fachlich getrennt, aber kompakt als Marker —
// nicht als zwei breite Ja/Nein-Spalten.
function MarkerCell({ row }) {
  const markers = invoiceMarkers(row);
  if (!markers.length) return <span className="adm-muted">—</span>;
  return (
    <span className="adm-inv-markers">
      {markers.map((m) => <span key={m.key} className={`badge ${m.cls}`}>{m.label}</span>)}
    </span>
  );
}

// ── Auftrag 2 / P1: offene Entwürfe manueller Rechnungen ────────────────────────────────────────────
// Erscheint nur, wenn es Entwürfe gibt — ein Entwurf ist keine Rechnung und steht deshalb NICHT in der
// Forderungsliste darunter. Betrag = Serverrechnung der gespeicherten Fassung.
function ManualInvoiceDrafts() {
  const [drafts, setDrafts] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let aus = false;
    (async () => {
      try {
        const r = await listManualInvoiceDrafts();
        if (!r.ok) { if (!aus && r.status !== 401 && r.status !== 403) setError(MANUAL_INVOICE_TEXT.draftsError); return; }
        const d = await r.json().catch(() => ({}));
        if (!aus) setDrafts(Array.isArray(d.drafts) ? d.drafts : []);
      } catch { if (!aus) setError(MANUAL_INVOICE_TEXT.draftsError); }
    })();
    return () => { aus = true; };
  }, []);
  if (error) return <p className="adm-support-hint" role="alert">{error}</p>;
  if (!drafts || drafts.length === 0) return null;
  return (
    <section className="adm-card adm-mi-drafts" aria-labelledby="mi-drafts-h" id="mi-drafts">
      <h2 className="adm-card-title" id="mi-drafts-h">{MANUAL_INVOICE_TEXT.draftsTitle}</h2>
      <ul className="adm-mi-draft-list">
        {drafts.map((d) => (
          <li key={d.id} className="adm-mi-draft" data-draft={d.id}>
            <div className="adm-mi-draft-main">
              <span className="adm-inv-cust-name">{d.recipientCompany || "Ohne Empfänger"}</span>
              <span className="adm-inv-cust-no">
                {d.recipientKind === "external" ? MANUAL_INVOICE_TEXT.externalRecipient : (d.customerNumber || "")}
              </span>
            </div>
            <div className="adm-mi-draft-facts">
              <span>{d.positionCount === 1 ? "1 Position" : `${d.positionCount} Positionen`}</span>
              <span className="adm-mi-draft-sum">{Number.isFinite(d.grossCents) ? formatCents(d.grossCents) : "—"}</span>
              <span>geändert {fmtDate(d.updatedAt)}</span>
            </div>
            <Link className="btn btn-outline btn-sm" to={`/admin/invoices/manual/${encodeURIComponent(d.id)}`}>Bearbeiten</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AdminInvoicesPage() {
  const [draft, setDraft] = useState(EMPTY_INVOICE_FILTERS);
  const [applied, setApplied] = useState(EMPTY_INVOICE_FILTERS);
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
      const r = await listAdminInvoices({ page, pageSize: PAGE_SIZE, ...toInvoiceApiFilters(applied) });
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) {
          setError(ERROR_MESSAGES[r.status] || INVOICE_LIST_ERROR);
        }
        setRows([]);
        setTotal(null);
        setHasMore(false);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const list = selectRows(d);
      const t = selectListTotal(d);
      setRows(list);
      setTotal(t);
      setHasMore(selectListHasMore(d, list.length, page, PAGE_SIZE, t));
    } catch {
      setError(INVOICE_LIST_ERROR);
      setRows([]);
      setTotal(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  const setField = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const applyFilters = () => {
    const v = validateInvoiceFilters(draft);
    if (!v.valid) { setFilterError(v.error); return; }
    setFilterError("");
    setPage(1);
    setApplied(draft);
  };
  const resetFilters = () => { setFilterError(""); setPage(1); setDraft(EMPTY_INVOICE_FILTERS); setApplied(EMPTY_INVOICE_FILTERS); };
  const goPrev = () => { if (page > 1) setPage((p) => p - 1); };
  const goNext = () => { if (hasMore) setPage((p) => p + 1); };

  const showPagination = !error && (rows.length > 0 || page > 1);
  const now = new Date();
  const emptyState = invoiceEmptyState({ count: rows.length, filters: applied });
  const chips = activeInvoiceFilterChips(applied);

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>Rechnungen</>}
        subtitle={<>Forderungsübersicht — Zahlungsstatus, Fälligkeiten und Beträge. Test- und Vorschau-Rechnungen
            sind gekennzeichnet und zählen nicht als Kundenforderung.</>}
        actions={(
          <><button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          Aktualisieren
        </button>
          <Link id="adm-new-invoice" className="btn btn-primary btn-sm" to="/admin/invoices/manual/new">
            {MANUAL_INVOICE_TEXT.newButton}
          </Link></>
        )}
      />

      <ManualInvoiceDrafts />

      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); applyFilters(); }}>
        <div className="adm-filter-field">
          <label htmlFor="f-status">Zahlungsstatus</label>
          <select id="f-status" value={draft.status} onChange={(e) => setField("status", e.target.value)}>
            {INVOICE_STATUS_FILTER_OPTIONS.map((o) => <option key={o.value || "all"} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="adm-filter-check">
          <input
            id="f-overdue" type="checkbox" checked={draft.overdue === true}
            onChange={(e) => setField("overdue", e.target.checked)}
          />
          <label htmlFor="f-overdue">Nur überfällige Forderungen</label>
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
            Anwenden
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters} disabled={loading}>
            Zurücksetzen
          </button>
        </div>
        {/* Technischer Filter — bewusst nachgeordnet und eingeklappt: die interne
            Kunden-ID ist kein Arbeitsmittel des Forderungsmanagements. Eine
            Freitextsuche über Firma/Kundennummer bietet das Backend nicht an;
            sie wird deshalb auch nicht vorgetäuscht. */}
        <details className="adm-filter-adv">
          <summary><span className="adm-tech-caret" aria-hidden="true" /> Technischer Filter</summary>
          <div className="adm-filter-adv-body">
            <div className="adm-filter-field">
              <label htmlFor="f-user">Kunden-ID (intern)</label>
              <input
                id="f-user" type="text" inputMode="numeric" placeholder="z. B. 42"
                value={draft.user_id} onChange={(e) => setField("user_id", e.target.value)}
                aria-invalid={filterError ? "true" : undefined}
                aria-describedby={filterError ? "f-user-err" : undefined}
              />
            </div>
            <p className="adm-support-hint">
              Es gibt keine Freitextsuche über Firma, Kundennummer oder Rechnungsnummer — das Backend
              bietet dafür keinen Filter an.
            </p>
          </div>
        </details>
        {filterError && <p className="adm-filter-error" id="f-user-err" role="alert">{filterError}</p>}
      </form>

      {chips.length > 0 && (
        <div className="adm-filter-chips">
          {chips.map((c) => <span key={c.key} className="adm-chip">{c.label}</span>)}
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters} disabled={loading}>
            Filter zurücksetzen
          </button>
        </div>
      )}

      {loading ? (
        <div className="table-card">
          <ListSkeleton rows={6} label="Rechnungen werden geladen …" />
        </div>
      ) : error ? (
        <div className="ce-card">
          <ErrorState
            title={error}
            action={(
              <button type="button" className="btn btn-primary btn-sm" onClick={load}>
                Erneut versuchen
              </button>
            )}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="table-card">
          <div className="empty">
            <div className="empty-title">{emptyState.title}</div>
            <p className="empty-text">{emptyState.text}</p>
            {hasActiveInvoiceFilters(applied) && (
              <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters}>Filter zurücksetzen</button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Desktop: sechs Spalten mit relativen Breiten — kein horizontales Scrollen. */}
          <div className="table-card adm-inv-table">
            <table>
              <caption className="sr-only">
                Rechnungen — Rechnungsnummer, Kunde, Betrag und Fälligkeit, Zahlungsstatus,
                Dokument- und Versandzustand sowie Aktion.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Rechnung</th>
                  <th scope="col">Kunde</th>
                  <th scope="col" className="adm-num">Betrag &amp; Fälligkeit</th>
                  <th scope="col">Zahlungsstatus</th>
                  <th scope="col">Dokument &amp; Versand</th>
                  <th scope="col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={rowKeyOf(row, i)}>
                    <td><InvoiceCell row={row} /></td>
                    <td><CustomerCell row={row} /></td>
                    <td className="adm-num"><AmountCell row={row} now={now} /></td>
                    <td><StatusCell row={row} now={now} /></td>
                    <td><MarkerCell row={row} /></td>
                    <td>
                      {idOf(row) != null
                        ? <Link className="btn btn-outline btn-sm" to={detailPath(idOf(row))}>Details</Link>
                        : <span className="adm-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobil: Kartenansicht statt Tabelle. */}
          <ul className="adm-inv-cards">
            {rows.map((row, i) => (
              <li className="adm-scard" key={`c-${rowKeyOf(row, i)}`}>
                <div className="adm-scard-head">
                  <InvoiceCell row={row} />
                  <StatusCell row={row} now={now} />
                </div>
                <dl className="adm-scard-kv">
                  <div><dt>Kunde</dt><dd><CustomerCell row={row} /></dd></div>
                  <div><dt>Betrag &amp; Fälligkeit</dt><dd><AmountCell row={row} now={now} /></dd></div>
                  <div><dt>Dokument &amp; Versand</dt><dd><MarkerCell row={row} /></dd></div>
                </dl>
                {idOf(row) != null && (
                  <div className="adm-scard-actions">
                    <Link className="btn btn-outline btn-sm" to={detailPath(idOf(row))}>Details</Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {showPagination && (
        <div className="adm-pagination">
          <button type="button" className="btn btn-outline btn-sm" onClick={goPrev} disabled={loading || page <= 1}>
            Zurück
          </button>
          <span className="adm-page-ind">
            Seite {page}{Number.isFinite(total) ? ` · ${total} gesamt` : ""}
          </span>
          <button type="button" className="btn btn-outline btn-sm" onClick={goNext} disabled={loading || !hasMore}>
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}
