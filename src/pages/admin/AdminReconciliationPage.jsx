import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Icon } from "../../components/ui/Icon";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { listAdminReconciliationAttempts } from "../../api/adminApi";
import { resolveCarrierName } from "../../utils/carrierMap";
import { selectListTotal, selectListHasMore } from "../../utils/adminOverview.mjs";
import {
  RECONCILIATION_LIST_ERROR,
  RECONCILIATION_PROVIDER_FILTER_OPTIONS,
  attemptLabel,
  finalActionAvailability,
  formatCountdown,
  providerLabel,
  reconciliationEmptyState,
  reconciliationStateMeta,
  selectReconciliationRows,
  toReconciliationApiFilters,
} from "../../utils/adminReconciliation.mjs";

// ── Buchungsklärung: die offenen Fälle ───────────────────────────────────────
// Ein Fall ist offen, wenn der NEUESTE Buchungsversuch einer gesperrten Sendung
// noch nicht entschieden ist — beider Anbieter, über die kanonische Route. Die
// Liste liest nur; entschieden wird auf der Detailseite. Kein Anbieterkontakt.

const PAGE_SIZE = 25;

const ERROR_MESSAGES = {
  400: "Ungültiger Filter. Bitte prüfen Sie Ihre Eingabe.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
};

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const t = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${d.toLocaleDateString("de-DE")}, ${t} Uhr`;
}

const detailPath = (id) => `/admin/reconciliation/${encodeURIComponent(id)}`;

function AttemptCell({ row }) {
  return <Link className="adm-recon-no" to={detailPath(row.id)}>{attemptLabel(row)}</Link>;
}

// Die interne Sendungskennung verlinkt ins Sendungsdetail; eine gelöschte Sendung
// wird ehrlich benannt statt geraten.
function ShipmentCell({ row }) {
  if (row.shipmentId == null) return <span className="adm-muted">Sendung nicht mehr vorhanden</span>;
  return (
    <div className="adm-recon-ship">
      <Link to={`/admin/shipments/${encodeURIComponent(row.shipmentId)}`}>Sendung #{row.shipmentId}</Link>
      {row.shipmentCarrier && <span className="adm-recon-sub">{resolveCarrierName(row.shipmentCarrier)}</span>}
    </div>
  );
}

function StateBadge({ state }) {
  const [cls, label, roh] = reconciliationStateMeta(state);
  return <span className={`badge ${cls}`} title={roh || undefined}>{label}</span>;
}

// Die Aktionsfähigkeit zum Ladezeitpunkt. Die Detailseite zählt die Wartezeit
// live herunter; der Server prüft beim Klick ohnehin erneut.
function DecisionCell({ row }) {
  const a = finalActionAvailability(row, 0);
  if (a.available) return <span className="badge badge-green">Entscheidbar</span>;
  if (a.reason === "too_early") {
    return <span className="badge badge-yellow">Wartezeit {formatCountdown(a.remainingSeconds)}</span>;
  }
  return <span className="badge badge-gray">Nicht entscheidbar</span>;
}

export default function AdminReconciliationPage() {
  const [draftProvider, setDraftProvider] = useState("");
  const [appliedProvider, setAppliedProvider] = useState("");
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
      const r = await listAdminReconciliationAttempts({
        page, pageSize: PAGE_SIZE, ...toReconciliationApiFilters(appliedProvider),
      });
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) {
          setError(ERROR_MESSAGES[r.status] || RECONCILIATION_LIST_ERROR);
        }
        setRows([]);
        setTotal(null);
        setHasMore(false);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const list = selectReconciliationRows(d);
      const t = selectListTotal(d);
      setRows(list);
      setTotal(t);
      setHasMore(selectListHasMore(d, list.length, page, PAGE_SIZE, t));
    } catch {
      setError(RECONCILIATION_LIST_ERROR);
      setRows([]);
      setTotal(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [appliedProvider, page]);

  useEffect(() => { load(); }, [load]);

  const applyFilter = () => { setPage(1); setAppliedProvider(draftProvider); };
  const resetFilter = () => { setPage(1); setDraftProvider(""); setAppliedProvider(""); };
  const goPrev = () => { if (page > 1) setPage((p) => p - 1); };
  const goNext = () => { if (hasMore) setPage((p) => p + 1); };

  const showPagination = !error && (rows.length > 0 || page > 1);
  const emptyState = reconciliationEmptyState({ count: rows.length, provider: appliedProvider });
  const activeLabel = appliedProvider
    ? (RECONCILIATION_PROVIDER_FILTER_OPTIONS.find((o) => o.value === appliedProvider) || {}).label
    : "";

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>Buchungsklärung</>}
        subtitle={<>Buchungsvorgänge, deren Ausgang beim Anbieter ungeklärt ist. Hier wird festgehalten,
            was beim Anbieter festgestellt wurde — es wird kein Anbieter kontaktiert und nichts storniert.</>}
        actions={(
          <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
            <Icon n="refresh" s={14} /> Aktualisieren
          </button>
        )}
      />

      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); applyFilter(); }}>
        <div className="adm-filter-field">
          <label htmlFor="f-recon-provider">Anbieter</label>
          <select
            id="f-recon-provider" value={draftProvider} disabled={loading}
            onChange={(e) => setDraftProvider(e.target.value)}
          >
            {RECONCILIATION_PROVIDER_FILTER_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
            <Icon n="filter" s={14} /> Anwenden
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilter} disabled={loading}>
            Zurücksetzen
          </button>
        </div>
      </form>

      {activeLabel && (
        <div className="adm-filter-chips">
          <span className="adm-chip">Anbieter: {activeLabel}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilter} disabled={loading}>
            Filter zurücksetzen
          </button>
        </div>
      )}

      {loading ? (
        <div className="table-card">
          <ListSkeleton rows={6} label="Buchungsklärungen werden geladen …" />
        </div>
      ) : error ? (
        // Ein Fehler ist KEIN Leerzustand: eigene Meldung plus echte Wiederholung.
        <div className="ce-card">
          <ErrorState
            title={error}
            action={(
              <button type="button" className="btn btn-primary btn-sm" onClick={load}>
                <Icon n="refresh" s={14} /> Erneut versuchen
              </button>
            )}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="table-card">
          <div className="empty">
            <div className="empty-icon" aria-hidden="true"><Icon n="shieldCheck" s={24} /></div>
            <div className="empty-title">{emptyState.title}</div>
            <p className="empty-text">{emptyState.text}</p>
            {appliedProvider && (
              <button type="button" className="btn btn-outline btn-sm" onClick={resetFilter}>Filter zurücksetzen</button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="table-card adm-recon-table">
            <table>
              <caption className="sr-only">
                Offene Buchungsklärungen — Vorgang, Anbieter, Sendung, Anbieterausgang, Beginn, Entscheidbarkeit und Aktion.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Vorgang</th>
                  <th scope="col">Anbieter</th>
                  <th scope="col">Sendung</th>
                  <th scope="col">Anbieterausgang</th>
                  <th scope="col">Begonnen</th>
                  <th scope="col">Entscheidung</th>
                  <th scope="col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`att-${row.id}`}>
                    <td><AttemptCell row={row} /></td>
                    <td>{providerLabel(row.provider)}</td>
                    <td><ShipmentCell row={row} /></td>
                    <td><StateBadge state={row.state} /></td>
                    <td className="adm-recon-time">{fmtDateTime(row.createdAt)}</td>
                    <td><DecisionCell row={row} /></td>
                    <td><Link className="btn btn-outline btn-sm" to={detailPath(row.id)}>Details</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="adm-recon-cards">
            {rows.map((row) => (
              <li className="adm-scard" key={`c-${row.id}`}>
                <div className="adm-scard-head">
                  <AttemptCell row={row} />
                  <StateBadge state={row.state} />
                </div>
                <dl className="adm-scard-kv">
                  <div><dt>Anbieter</dt><dd>{providerLabel(row.provider)}</dd></div>
                  <div><dt>Sendung</dt><dd><ShipmentCell row={row} /></dd></div>
                  <div><dt>Begonnen</dt><dd>{fmtDateTime(row.createdAt)}</dd></div>
                  <div><dt>Entscheidung</dt><dd><DecisionCell row={row} /></dd></div>
                </dl>
                <div className="adm-scard-actions">
                  <Link className="btn btn-outline btn-sm" to={detailPath(row.id)}>Details</Link>
                </div>
              </li>
            ))}
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
