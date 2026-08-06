import React, { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { listAdminCancellationRequests } from "../../api/adminApi";
import { resolveCarrierName } from "../../utils/carrierMap";
import { selectListTotal, selectListHasMore } from "../../utils/adminOverview.mjs";
import {
  CANCELLATION_LIST_ERROR,
  CANCELLATION_STATUS_FILTER_OPTIONS,
  cancellationCustomerCell,
  cancellationEmptyState,
  cancellationLabel,
  cancellationShipmentCell,
  cancellationStatusMeta,
  normalizeCancellationRequest,
  toCancellationApiFilters,
} from "../../utils/adminCancellations.mjs";

const PAGE_SIZE = 25;

const ERROR_MESSAGES = {
  400: "Ungültiger Filter. Bitte prüfen Sie Ihre Eingabe.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
};

// ── Response-Container defensiv lesen. Die Feld-Normalisierung der einzelnen
// Zeilen übernimmt zentral normalizeCancellationRequest. ─────────────────────
// selectTotal/selectHasMore lagen bis Paket E in jeder Adminliste als eigene,
// fast wortgleiche Kopie. Sie stehen jetzt einmal in utils/adminOverview.mjs —
// gleiches Verhalten, eine Quelle.
function selectRows(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of ["cancellationRequests", "cancellation_requests", "requests", "data", "items", "results", "rows"]) {
      if (Array.isArray(d[k])) return d[k];
    }
  }
  return [];
}



function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  // Geschütztes Leerzeichen vor „Uhr": Der vollständige Zeitstempel ist breiter
  // als die Spalte (gemessen 152px gegenüber 98px Zelleninhalt) und bricht daher
  // ohnehin um. Ohne das nbsp landet „Uhr" allein in der zweiten Zeile; so
  // bricht jede Zeile identisch nach dem Datum.
  const t = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${d.toLocaleDateString("de-DE")}, ${t}\u00A0Uhr`;
}

const detailPath = (id) => `/admin/cancellation-requests/${encodeURIComponent(id)}`;

// ── Zellen ──────────────────────────────────────────────────────────────────
// Fachliche Kennung („Anfrage #123") als Link; die technische ID ist damit
// eingebettet statt als eigene, dominante Spalte.
function RequestCell({ row }) {
  return (
    <div className="adm-canc-req">
      {row.id != null
        ? <Link className="adm-canc-no" to={detailPath(row.id)}>{cancellationLabel(row)}</Link>
        : <span className="adm-canc-no">{cancellationLabel(row)}</span>}
    </div>
  );
}

// Firma primär, Ansprechpartner/Kundennummer sekundär — nie die user_id.
function CustomerCell({ row }) {
  const c = cancellationCustomerCell(row);
  const uid = row.customer?.id;
  return (
    <div className="adm-canc-cust">
      {uid != null && c.known
        ? <Link className="adm-canc-cust-name" to={`/admin/users/${encodeURIComponent(uid)}`}>{c.primary}</Link>
        : <span className={`adm-canc-cust-name${c.known ? "" : " adm-muted"}`}>{c.primary}</span>}
      {c.secondary && <span className="adm-canc-sub">{c.secondary}</span>}
    </div>
  );
}

// Geschäftliche Sendungsnummer primär, Carrier + Route sekundär. Fehlt die
// Nummer, wird das ehrlich benannt — nie aus der internen ID konstruiert.
function ShipmentCell({ row }) {
  const s = cancellationShipmentCell(row);
  const carrier = row.shipment?.carrier;
  const secondary = s.secondary && carrier
    ? s.secondary.replace(carrier, resolveCarrierName(carrier))
    : s.secondary;
  return (
    <div className="adm-canc-ship">
      {s.id != null
        ? <Link className={`adm-canc-ship-no${s.known ? "" : " adm-canc-ship-no-muted"}`} to={`/admin/shipments/${encodeURIComponent(s.id)}`}>{s.primary}</Link>
        : <span className={`adm-canc-ship-no${s.known ? "" : " adm-canc-ship-no-muted"}`}>{s.primary}</span>}
      {secondary && <span className="adm-canc-sub">{secondary}</span>}
    </div>
  );
}

// Der Grund ist nutzergenerierter Freitext: als REINER Text gerendert (React
// escaped ihn, kein dangerouslySetInnerHTML) und in der Liste auf wenige Zeilen
// begrenzt. Den vollen Text zeigt ausschließlich die Detailseite.
function ReasonCell({ row }) {
  const reason = typeof row.reason === "string" ? row.reason.replace(/\s+/g, " ").trim() : "";
  if (!reason) return <span className="adm-muted">—</span>;
  return <p className="adm-canc-reason">{reason}</p>;
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
      // Der Retry nutzt exakt denselben aktuell angewendeten Filter. „Alle" sendet
      // keinen Status — ein ungültiger Wert würde serverseitig 400 auslösen.
      const r = await listAdminCancellationRequests({
        page, pageSize: PAGE_SIZE, ...toCancellationApiFilters(appliedStatus),
      });
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) {
          setError(ERROR_MESSAGES[r.status] || CANCELLATION_LIST_ERROR);
        }
        setRows([]);
        setTotal(null);
        setHasMore(false);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const list = selectRows(d).map(normalizeCancellationRequest).filter(Boolean);
      const t = selectListTotal(d);
      setRows(list);
      setTotal(t);
      setHasMore(selectListHasMore(d, list.length, page, PAGE_SIZE, t));
    } catch {
      setError(CANCELLATION_LIST_ERROR);
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
  const emptyState = cancellationEmptyState({ count: rows.length, status: appliedStatus });
  const activeLabel = appliedStatus
    ? (CANCELLATION_STATUS_FILTER_OPTIONS.find((o) => o.value === appliedStatus) || {}).label
    : "";

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>Stornierungsanfragen</>}
        subtitle={<>Interne Prüfung von Kunden-Stornowünschen. Dies ist ein Verwaltungsvorgang —
            das Bearbeiten löst KEINE Carrier-/JUMiNGO-Stornierung und keine Erstattung aus.</>}
        actions={(
          <><button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          <Icon n="refresh" s={14} /> Aktualisieren
        </button></>
        )}
      />

      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); applyFilter(); }}>
        <div className="adm-filter-field">
          <label htmlFor="f-canc-status">Status</label>
          <select
            id="f-canc-status" value={draftStatus} disabled={loading}
            onChange={(e) => setDraftStatus(e.target.value)}
          >
            {CANCELLATION_STATUS_FILTER_OPTIONS.map((o) => (
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
          <span className="adm-chip">Status: {activeLabel}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilter} disabled={loading}>
            Filter zurücksetzen
          </button>
        </div>
      )}

      {loading ? (
        <div className="table-card">
          <ListSkeleton rows={6} label="Stornierungsanfragen werden geladen …" />
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
            <div className="empty-icon" aria-hidden="true"><Icon n="mail" s={24} /></div>
            <div className="empty-title">{emptyState.title}</div>
            <p className="empty-text">{emptyState.text}</p>
            {appliedStatus && (
              <button type="button" className="btn btn-outline btn-sm" onClick={resetFilter}>Filter zurücksetzen</button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Desktop: sieben Spalten mit relativen Breiten — kein horizontales Scrollen. */}
          <div className="table-card adm-canc-table">
            <table>
              <caption className="sr-only">
                Stornierungsanfragen — Anfrage, Kunde, Sendung, Grund, Status, Eingangszeitpunkt und Aktion.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Anfrage</th>
                  <th scope="col">Kunde</th>
                  <th scope="col">Sendung</th>
                  <th scope="col">Grund</th>
                  <th scope="col">Status</th>
                  <th scope="col">Eingegangen</th>
                  <th scope="col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id != null ? `req-${row.id}` : `row-${i}`}>
                    <td><RequestCell row={row} /></td>
                    <td><CustomerCell row={row} /></td>
                    <td><ShipmentCell row={row} /></td>
                    <td><ReasonCell row={row} /></td>
                    <td><StatusBadge status={row.status} /></td>
                    <td className="adm-canc-time">{fmtDateTime(row.createdAt)}</td>
                    <td>
                      {row.id != null
                        ? <Link className="btn btn-outline btn-sm" to={detailPath(row.id)}>Details</Link>
                        : <span className="adm-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobil: Kartenansicht statt Tabelle. */}
          <ul className="adm-canc-cards">
            {rows.map((row, i) => (
              <li className="adm-scard" key={row.id != null ? `c-${row.id}` : `c-row-${i}`}>
                <div className="adm-scard-head">
                  <RequestCell row={row} />
                  <StatusBadge status={row.status} />
                </div>
                <dl className="adm-scard-kv">
                  <div><dt>Kunde</dt><dd><CustomerCell row={row} /></dd></div>
                  <div><dt>Sendung</dt><dd><ShipmentCell row={row} /></dd></div>
                  <div><dt>Grund</dt><dd><ReasonCell row={row} /></dd></div>
                  <div><dt>Eingegangen</dt><dd>{fmtDateTime(row.createdAt)}</dd></div>
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
