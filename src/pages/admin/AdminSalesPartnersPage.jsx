import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { listAdminSalesPartners } from "../../api/adminApi";
import { usePreliveStatus } from "../../hooks/usePreliveStatus";
import { preliveEnabled } from "../../utils/salesPartnerPrelive.mjs";
import { selectListHasMore, selectListTotal } from "../../utils/adminOverview.mjs";
import { formatCount, formatIsoDate, formatPercent } from "../../utils/salesPartnerView.mjs";
import {
  SALES_PARTNER_STATUS_FILTER_OPTIONS,
  adminPartnerStatusMeta,
  formatTimestamp,
  loginStatusMeta,
  partnerDisplayName,
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

// Partner: Firma bzw. Name als Link ins Detail, darunter Name und E-Mail.
function PartnerCell({ row }) {
  const titel = partnerDisplayName(row);
  return (
    <div className="adm-sp-partner">
      {row.id != null
        ? <Link className="adm-sp-name" to={detailPath(row.id)}>{titel}</Link>
        : <span className="adm-sp-name">{titel}</span>}
      {row.companyName && row.name && <span className="adm-sp-sub">{row.name}</span>}
      {row.email && <span className="adm-sp-sub adm-sp-mail">{row.email}</span>}
    </div>
  );
}

const team = (row) => `${formatCount(row.teamLevel1Count)} / ${formatCount(row.teamLevel2Count)}`;

/* ── Admin · Vertriebspartner (Liste) ────────────────────────────────────────
   Statusfilter und Suche laufen serverseitig (GET /admin/sales-partners mit
   eigener Parameter-Allowlist). Kein Rohstatus im sichtbaren Text. */
export default function AdminSalesPartnersPage() {
  const prelive = usePreliveStatus();
  const [draft, setDraft] = useState({ status: "", q: "" });
  const [applied, setApplied] = useState({ status: "", q: "" });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    } catch {
      setError(LIST_ERROR);
      setRows([]); setTotal(null); setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  const apply = () => { setPage(1); setApplied({ status: draft.status, q: draft.q.trim() }); };
  const reset = () => { setPage(1); setDraft({ status: "", q: "" }); setApplied({ status: "", q: "" }); };
  const filterAktiv = applied.status !== "" || applied.q !== "";
  const statusLabel = (SALES_PARTNER_STATUS_FILTER_OPTIONS.find((o) => o.value === applied.status) || {}).label;
  const showPagination = !error && (rows.length > 0 || page > 1);

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>Vertriebspartner</>}
        subtitle={<>Anträge prüfen, Partner freigeben und verwalten. Jede Änderung wird protokolliert.</>}
        actions={(
          <>
            <Link className="btn btn-outline btn-sm" to="/admin/partners/settings" id="adm-sp-settings-link">Einstellungen</Link>
            <Link className="btn btn-outline btn-sm" to="/admin/partners/dispatch-evidence" id="adm-sp-evidence-link">Versandnachweise</Link>
            <Link className="btn btn-outline btn-sm" to="/admin/partners/credit-notes" id="adm-sp-credit-notes-link">Abrechnungslauf</Link>
            {/* Nur wenn der Server den Pre-Live-Testmodus meldet (enabled: true). */}
            {preliveEnabled(prelive.status) && (
              <Link className="btn btn-outline btn-sm" to="/admin/partners/prelive" id="adm-sp-prelive-link">Pre-Live-Test</Link>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>Aktualisieren</button>
          </>
        )}
      />

      <form className="adm-filters" role="search" onSubmit={(e) => { e.preventDefault(); apply(); }}>
        <div className="adm-filter-field">
          <label htmlFor="sp-filter-status">Status</label>
          <select
            id="sp-filter-status"
            value={draft.status}
            disabled={loading}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
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
            value={draft.q}
            maxLength={100}
            onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
          />
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={loading} id="sp-filter-apply">Anwenden</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={reset} disabled={loading}>Zurücksetzen</button>
        </div>
      </form>

      {filterAktiv && (
        <div className="adm-filter-chips">
          <span className="adm-filter-chips-label">Aktive Filter:</span>
          {applied.status && <span className="adm-chip">Status: {statusLabel}</span>}
          {applied.q && <span className="adm-chip">Suche: {applied.q}</span>}
          <button type="button" className="btn btn-outline btn-sm" onClick={reset} disabled={loading}>Filter zurücksetzen</button>
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
            <div className="empty-title">{filterAktiv ? "Keine Treffer" : "Noch keine Vertriebspartner"}</div>
            <p className="empty-text">
              {filterAktiv
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
                Vertriebspartner, Seite {page}. Spalten: Partner, Status, Login, aktiv seit, Kunden, Pakete im Vormonat,
                Team Ebene 1 und 2, Eigensatz, registriert, Aktion.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Partner</th>
                  <th scope="col">Status</th>
                  <th scope="col">Login</th>
                  <th scope="col">Aktiv seit</th>
                  <th scope="col" className="adm-num">Kunden</th>
                  <th scope="col" className="adm-num">Pakete Vormonat</th>
                  <th scope="col" className="adm-num">Team E1 / E2</th>
                  <th scope="col" className="adm-num">Eigensatz</th>
                  <th scope="col">Registriert</th>
                  <th scope="col" className="adm-col-action">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id ?? `row-${i}`} data-partner-id={row.id ?? undefined}>
                    <td><PartnerCell row={row} /></td>
                    <td><Badge meta={adminPartnerStatusMeta(row.status)} /></td>
                    <td><Badge meta={loginStatusMeta(row.loginStatus)} /></td>
                    <td>{formatIsoDate(row.activeSince)}</td>
                    <td className="adm-num">{formatCount(row.customersCount)}</td>
                    <td className="adm-num">{formatCount(row.packagesLastMonth)}</td>
                    <td className="adm-num">{team(row)}</td>
                    <td className="adm-num">{formatPercent(row.ownRatePercent)}</td>
                    <td>{formatTimestamp(row.createdAt)}</td>
                    <td className="adm-col-action">
                      {row.id != null
                        ? <Link className="btn btn-outline btn-sm" to={detailPath(row.id)}>Details</Link>
                        : <span className="adm-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="adm-sp-cards">
            {rows.map((row, i) => (
              <li className="adm-scard" key={`c-${row.id ?? i}`}>
                <div className="adm-scard-head">
                  <PartnerCell row={row} />
                  <Badge meta={adminPartnerStatusMeta(row.status)} />
                </div>
                <dl className="adm-scard-kv">
                  <div><dt>Login</dt><dd><Badge meta={loginStatusMeta(row.loginStatus)} /></dd></div>
                  <div><dt>Aktiv seit</dt><dd>{formatIsoDate(row.activeSince)}</dd></div>
                  <div><dt>Kunden</dt><dd>{formatCount(row.customersCount)}</dd></div>
                  <div><dt>Pakete Vormonat</dt><dd>{formatCount(row.packagesLastMonth)}</dd></div>
                  <div><dt>Team E1 / E2</dt><dd>{team(row)}</dd></div>
                  <div><dt>Eigensatz</dt><dd>{formatPercent(row.ownRatePercent)}</dd></div>
                </dl>
                {row.id != null && (
                  <div className="adm-scard-actions">
                    <Link className="btn btn-outline btn-sm" to={detailPath(row.id)}>Details</Link>
                  </div>
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
