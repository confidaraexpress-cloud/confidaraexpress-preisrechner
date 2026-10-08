import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { listAdminSalesPartners } from "../../api/adminApi";
import { usePreliveStatus } from "../../hooks/usePreliveStatus";
import { PreliveTestBadge } from "../../components/admin/PreliveTestBadge";
import { SalesPartnerAdminNav } from "../../components/admin/SalesPartnerAdminNav";
import { selectListHasMore, selectListTotal } from "../../utils/adminOverview.mjs";
import { returnState } from "../../utils/adminBackLink.mjs";
import { formatCount } from "../../utils/salesPartnerView.mjs";
import {
  SALES_PARTNER_STATUS_FILTER_OPTIONS,
  adminPartnerStatusMeta,
  formatTimestamp,
  listLoginNotice,
  partnerDisplayName,
  pendingApplicationsText,
  selectPartnerRows,
  toSalesPartnerApiFilters,
} from "../../utils/adminSalesPartnerView.mjs";

const PAGE_SIZE = 25;
const LIST_ERROR = "Die Vertriebspartner konnten nicht geladen werden.";
const ERROR_MESSAGES = {
  400: "Ungültiger Filter. Bitte prüfen Sie Ihre Eingabe.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
};

const detailPath = (id) => `/admin/partners/${encodeURIComponent(id)}`;

function Badge({ meta }) {
  const [cls, label] = meta;
  return <span className={`badge ${cls}`}>{label}</span>;
}

// Partner: Firma bzw. Name als Link ins Detail, darunter Name und E-Mail; ein
// Testpartner (Testkennzeichnung des Servers) trägt „TEST / PRE-LIVE".
function PartnerCell({ row, from }) {
  const titel = partnerDisplayName(row);
  return (
    <div className="adm-sp-partner">
      {row.id != null
        ? <Link className="adm-sp-name" to={detailPath(row.id)} state={from}>{titel}</Link>
        : <span className="adm-sp-name">{titel}</span>}
      {row.preliveTest && <PreliveTestBadge />}
      {row.companyName && row.name && <span className="adm-sp-sub">{row.name}</span>}
      {row.email && <span className="adm-sp-sub adm-sp-mail">{row.email}</span>}
    </div>
  );
}

// Status mit dem, was daneben zählt: beim Antrag das Antragsdatum, bei einem
// freigegebenen Partner ein gesperrter Login. Alles Weitere steht im Detail.
function StatusCell({ row }) {
  const login = listLoginNotice(row);
  return (
    <div className="adm-sp-status">
      <Badge meta={adminPartnerStatusMeta(row.status)} />
      {row.status === "pending" && <span className="adm-sp-sub">Antrag vom {formatTimestamp(row.createdAt)}</span>}
      {login && <Badge meta={login} />}
    </div>
  );
}

// Die wichtigste Aktion der Zeile: einen offenen Antrag prüfen, sonst das Detail.
function RowAction({ row, from }) {
  if (row.id == null) return <span className="adm-muted">—</span>;
  return row.status === "pending"
    ? <Link className="btn btn-primary btn-sm" to={detailPath(row.id)} state={from}>Antrag prüfen</Link>
    : <Link className="btn btn-outline btn-sm" to={detailPath(row.id)} state={from}>Details</Link>;
}

/* ── Admin · Vertriebspartner (Liste) ────────────────────────────────────────
   Statusfilter und Suche laufen serverseitig (GET /admin/sales-partners mit
   eigener Parameter-Allowlist). Kein Rohstatus im sichtbaren Text.

   UX-Paket 2: sichtbar nur Partner, Status, Kunden, Pakete (Vormonat) und die
   wichtigste Aktion — Login, Team, Eigenprovision und Daten stehen im Detail.
   Status und Suche stehen in der Adresse (?status=…&q=…): die Übersicht verlinkt
   direkt auf die offenen Anträge, und der Rückweg aus dem Detail landet in
   derselben gefilterten Liste. Der Statusfilter wirkt sofort. */
export default function AdminSalesPartnersPage() {
  const prelive = usePreliveStatus();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get("status") || "";
  const qParam = params.get("q") || "";
  // Nur bekannte Werte aus der Adresse — derselbe Filter wie für die Abfrage.
  const applied = useMemo(() => {
    const f = toSalesPartnerApiFilters({ status: statusParam, q: qParam });
    return { status: f.status || "", q: f.q || "" };
  }, [statusParam, qParam]);
  const [draftQ, setDraftQ] = useState(applied.q);
  // Ändert sich die Adresse von außen (Teilnavigation, Zurück), folgt das Suchfeld ihr.
  useEffect(() => { setDraftQ(applied.q); }, [applied.q]);
  // Die Seite gehört zu genau einem Filter: ein neuer Filter beginnt auf Seite 1,
  // ohne einen zusätzlichen Abruf mit der alten Seitenzahl.
  const filterKey = `${applied.status}|${applied.q}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (fn) => setPageState({ key: filterKey, page: fn(page) });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Offene Anträge: Gesamtzähler der Liste mit status=pending (pageSize 1) — nie geschätzt.
  const [pendingCount, setPendingCount] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await listAdminSalesPartners({ page, pageSize: PAGE_SIZE, ...toSalesPartnerApiFilters(applied) });
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) setError(ERROR_MESSAGES[r.status] || LIST_ERROR);
        setRows([]); setTotal(null); setHasMore(false);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const list = selectPartnerRows(d);
      const t = selectListTotal(d);
      setRows(list);
      setTotal(t);
      setHasMore(selectListHasMore(d, list.length, page, PAGE_SIZE, t));
      // Die Liste der offenen Anträge selbst liefert deren Zähler — kein zweiter Abruf.
      if (applied.status === "pending" && !applied.q) setPendingCount(t);
    } catch {
      setError(LIST_ERROR);
      setRows([]); setTotal(null); setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  const loadPending = useCallback(async () => {
    try {
      const r = await listAdminSalesPartners({ status: "pending", page: 1, pageSize: 1 });
      if (!r.ok) { setPendingCount(null); return; }
      const d = await r.json().catch(() => null);
      setPendingCount(selectListTotal(d));
    } catch {
      setPendingCount(null);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Der Zähler kostet einen Abruf aus demselben Ratenbudget wie die Liste: nur beim
  // Öffnen und nur, wenn nicht ohnehin die offenen Anträge angezeigt werden.
  const mitAntraegenGeoeffnet = useRef(applied.status === "pending");
  useEffect(() => { if (!mitAntraegenGeoeffnet.current) loadPending(); }, [loadPending]);

  const setFilter = (next) => {
    const p = new URLSearchParams();
    if (next.status) p.set("status", next.status);
    if (next.q) p.set("q", next.q);
    setParams(p, { replace: true });
  };
  const applySearch = () => setFilter({ status: applied.status, q: draftQ.trim() });
  const reset = () => { setDraftQ(""); setFilter({ status: "", q: "" }); };
  const showApplications = () => { setDraftQ(""); setFilter({ status: "pending", q: "" }); };
  const refresh = () => { load(); if (applied.status !== "pending") loadPending(); };

  const filterAktiv = applied.status !== "" || applied.q !== "";
  const statusLabel = (SALES_PARTNER_STATUS_FILTER_OPTIONS.find((o) => o.value === applied.status) || {}).label;
  const showPagination = !error && (rows.length > 0 || page > 1);
  const from = returnState(location);
  const antragsHinweis = applied.status !== "pending" ? pendingApplicationsText(pendingCount) : null;

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>Vertriebspartner</>}
        actions={<button type="button" className="btn btn-outline btn-sm" onClick={refresh} disabled={loading}>Aktualisieren</button>}
      />
      <SalesPartnerAdminNav prelive={prelive} />

      {antragsHinweis && (
        <div className="adm-note adm-note--info adm-sp-pending" id="adm-sp-pending-note">
          <span>{antragsHinweis}</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={showApplications} id="adm-sp-pending-show">
            Anträge anzeigen
          </button>
        </div>
      )}

      <form className="adm-filters" role="search" onSubmit={(e) => { e.preventDefault(); applySearch(); }}>
        <div className="adm-filter-field">
          <label htmlFor="sp-filter-status">Status</label>
          <select
            id="sp-filter-status"
            value={applied.status}
            disabled={loading}
            onChange={(e) => setFilter({ status: e.target.value, q: applied.q })}
          >
            {SALES_PARTNER_STATUS_FILTER_OPTIONS.map((o) => <option key={o.value || "all"} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="adm-filter-field adm-filter-search">
          <label htmlFor="sp-filter-q">Suche</label>
          <input
            id="sp-filter-q"
            type="search"
            placeholder="Name, Firma oder E-Mail"
            value={draftQ}
            maxLength={100}
            onChange={(e) => setDraftQ(e.target.value)}
          />
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-outline btn-sm" disabled={loading} id="sp-filter-apply">Suchen</button>
          {filterAktiv && <button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={loading}>Zurücksetzen</button>}
        </div>
      </form>

      {filterAktiv && (
        <div className="adm-filter-chips">
          <span className="adm-filter-chips-label">Aktive Filter:</span>
          {applied.status && <span className="adm-chip">Status: {statusLabel}</span>}
          {applied.q && <span className="adm-chip">Suche: {applied.q}</span>}
        </div>
      )}

      {loading ? (
        <div className="table-card"><ListSkeleton rows={6} label="Vertriebspartner werden geladen …" /></div>
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
            <div className="empty-title">
              {applied.status === "pending" && !applied.q ? "Keine offenen Anträge" : filterAktiv ? "Keine Treffer" : "Noch keine Vertriebspartner"}
            </div>
            <p className="empty-text">
              {applied.status === "pending" && !applied.q
                ? "Neue Anträge erscheinen hier, sobald sich jemand als Vertriebspartner registriert."
                : filterAktiv
                  ? "Für diese Filter gibt es keine Vertriebspartner."
                  : "Sobald sich Vertriebspartner registrieren, erscheinen ihre Anträge hier."}
            </p>
            {filterAktiv && <button type="button" className="btn btn-outline btn-sm" onClick={reset}>Filter zurücksetzen</button>}
          </div>
        </div>
      ) : (
        <>
          <div className="table-card adm-sp-table">
            <table>
              <caption className="sr-only">
                Vertriebspartner, Seite {page}. Spalten: Partner, Status, Kunden, Pakete im Vormonat, Aktion.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Partner</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="adm-num">Kunden</th>
                  <th scope="col" className="adm-num">Pakete Vormonat</th>
                  <th scope="col" className="adm-col-action">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id ?? `row-${i}`} data-partner-id={row.id ?? undefined}
                    data-status={row.status || undefined} data-prelive={row.preliveTest ? "true" : undefined}>
                    <td><PartnerCell row={row} from={from} /></td>
                    <td><StatusCell row={row} /></td>
                    <td className="adm-num">{formatCount(row.customersCount)}</td>
                    <td className="adm-num">{formatCount(row.packagesLastMonth)}</td>
                    <td className="adm-col-action"><RowAction row={row} from={from} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="adm-sp-cards">
            {rows.map((row, i) => (
              <li className="adm-scard" key={`c-${row.id ?? i}`} data-partner-id={row.id ?? undefined} data-status={row.status || undefined}>
                <div className="adm-scard-head">
                  <PartnerCell row={row} from={from} />
                  <StatusCell row={row} />
                </div>
                <dl className="adm-scard-kv">
                  <div><dt>Kunden</dt><dd>{formatCount(row.customersCount)}</dd></div>
                  <div><dt>Pakete Vormonat</dt><dd>{formatCount(row.packagesLastMonth)}</dd></div>
                </dl>
                {row.id != null && (
                  <div className="adm-scard-actions"><RowAction row={row} from={from} /></div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {showPagination && (
        <div className="adm-pagination">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={loading || page <= 1}>
            Zurück
          </button>
          <span className="adm-page-ind">Seite {page}{Number.isFinite(total) ? ` · ${total} gesamt` : ""}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPage((p) => p + 1)} disabled={loading || !hasMore}>
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}
