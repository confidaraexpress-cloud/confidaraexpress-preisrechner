import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { listAdminSupportRequests } from "../../api/adminApi";
import {
  SUPPORT_LIST_ERROR,
  SUPPORT_STATUS_FILTER_OPTIONS,
  normalizeSupportRequest,
  supportCustomerCell,
  supportEmptyState,
  supportLabel,
  supportStatusMeta,
  toSupportApiFilters,
} from "../../utils/adminSupportView.mjs";

const PAGE_SIZE = 25;

const ERROR_MESSAGES = {
  400: "Ungültiger Filter. Bitte prüfen Sie Ihre Eingabe.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
};

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

// ── Response-Container defensiv lesen. Die Feld-Normalisierung der einzelnen
// Zeilen übernimmt zentral normalizeSupportRequest. ─────────────────────────
function selectRows(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of ["supportRequests", "support_requests", "requests", "data", "items", "results", "rows"]) {
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

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const t = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${d.toLocaleDateString("de-DE")}, ${t} Uhr`;
}

const detailPath = (id) => `/admin/support-requests/${encodeURIComponent(id)}`;

// ── Zellen ──────────────────────────────────────────────────────────────────
// Die Ticketnummer ist die fachliche Kennung und der Link; die technische ID
// bleibt sekundär und wird nie als eigene Spalte gezeigt.
function TicketCell({ row }) {
  return (
    <div>
      {row.id != null
        ? <Link className="adm-sup-ticket" to={detailPath(row.id)}>{supportLabel(row)}</Link>
        : <span className="adm-sup-ticket">{supportLabel(row)}</span>}
      {row.categoryLabel && <span className="adm-sup-sub">{row.categoryLabel}</span>}
    </div>
  );
}

// Firma primär, Ansprechpartner/Kundennummer sekundär — nie die user_id.
function CustomerCell({ row }) {
  const c = supportCustomerCell(row);
  const uid = row.customer?.id;
  return (
    <div className="adm-sup-cust">
      {uid != null && c.known
        ? <Link className="adm-sup-cust-name" to={`/admin/users/${encodeURIComponent(uid)}`}>{c.primary}</Link>
        : <span className={`adm-sup-cust-name${c.known ? "" : " adm-muted"}`}>{c.primary}</span>}
      {c.secondary && <span className="adm-sup-sub">{c.secondary}</span>}
    </div>
  );
}

// Der Betreff ist nutzergenerierter Freitext: als REINER Text gerendert (React
// escaped ihn, kein dangerouslySetInnerHTML) und in der Liste auf zwei Zeilen
// begrenzt. Den vollen Text und die Nachricht zeigt nur die Detailseite.
function SubjectCell({ row }) {
  const subject = typeof row.subject === "string" ? row.subject.replace(/\s+/g, " ").trim() : "";
  if (!subject) return <span className="adm-muted">—</span>;
  return <p className="adm-sup-subject">{subject}</p>;
}

function StatusBadge({ row }) {
  const [cls, fallback] = supportStatusMeta(row.status);
  return <span className={`badge ${cls}`}>{row.statusLabel || fallback}</span>;
}

// Kundenfilter aus der URL (?userId=…) — so verlinkt das Kundenprofil auf „alle
// Anfragen dieses Kunden", ohne einen zweiten Endpunkt oder eine zweite Seite. Nur
// eine positive Ganzzahl wird übernommen; alles andere wird ignoriert (der Server
// würde einen ungültigen Wert ohnehin mit 400 abweisen).
function parseUserIdParam(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!/^[0-9]+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export default function AdminSupportRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = parseUserIdParam(searchParams.get("userId"));

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
      const r = await listAdminSupportRequests({
        page, pageSize: PAGE_SIZE,
        ...toSupportApiFilters(appliedStatus),
        ...(userId != null ? { userId } : {}),
      });
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) setError(ERROR_MESSAGES[r.status] || SUPPORT_LIST_ERROR);
        setRows([]); setTotal(null); setHasMore(false);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const list = selectRows(d).map(normalizeSupportRequest).filter(Boolean);
      const t = selectTotal(d);
      setRows(list);
      setTotal(t);
      setHasMore(selectHasMore(d, list.length, page, PAGE_SIZE, t));
    } catch {
      setError(SUPPORT_LIST_ERROR);
      setRows([]); setTotal(null); setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [appliedStatus, page, userId]);

  useEffect(() => { load(); }, [load]);
  // Wechselt der Kundenfilter (Navigation aus einem anderen Kundenprofil), beginnt
  // die Liste wieder auf Seite 1 — sonst zeigte sie eine leere Folgeseite.
  useEffect(() => { setPage(1); }, [userId]);

  const clearUserFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("userId");
    setSearchParams(next, { replace: true });
  };

  const applyFilter = () => { setPage(1); setAppliedStatus(draftStatus); };
  const resetFilter = () => { setPage(1); setDraftStatus(""); setAppliedStatus(""); };
  const goPrev = () => { if (page > 1) setPage((p) => p - 1); };
  const goNext = () => { if (hasMore) setPage((p) => p + 1); };

  const showPagination = !error && (rows.length > 0 || page > 1);
  const emptyState = supportEmptyState({ count: rows.length, status: appliedStatus });
  const activeLabel = appliedStatus
    ? (SUPPORT_STATUS_FILTER_OPTIONS.find((o) => o.value === appliedStatus) || {}).label
    : "";

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-page-head-row">
        <div>
          <h1 className="adm-title">Supportanfragen</h1>
          <p className="adm-sub">
            Allgemeine Kundenanfragen aus dem Kundenbereich. Die Beantwortung erfolgt per
            E-Mail — das Bearbeiten hier verschickt keine Nachricht an den Kunden und ändert
            weder Sendungen noch Rechnungen.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          <Icon n="refresh" s={14} /> Aktualisieren
        </button>
      </header>

      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); applyFilter(); }}>
        <div className="adm-filter-field">
          <label htmlFor="f-sup-status">Status</label>
          <select
            id="f-sup-status" value={draftStatus} disabled={loading}
            onChange={(e) => setDraftStatus(e.target.value)}
          >
            {SUPPORT_STATUS_FILTER_OPTIONS.map((o) => (
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

      {(activeLabel || userId != null) && (
        <div className="adm-filter-chips">
          {activeLabel && <span className="adm-chip">Status: {activeLabel}</span>}
          {userId != null && (
            <>
              <span className="adm-chip">Kunde: #{userId}</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={clearUserFilter} disabled={loading}>
                Kundenfilter aufheben
              </button>
            </>
          )}
          {activeLabel && (
            <button type="button" className="btn btn-outline btn-sm" onClick={resetFilter} disabled={loading}>
              Statusfilter zurücksetzen
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="table-card">
          <div className="loading-center" role="status" aria-live="polite">
            <span className="spinner spinner-dark" /> Supportanfragen werden geladen…
          </div>
        </div>
      ) : error ? (
        // Ein Fehler ist KEIN Leerzustand: eigene Meldung plus echte Wiederholung.
        <div className="adm-loaderr">
          <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{error}</div>
          <div className="adm-loaderr-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={load}>
              <Icon n="refresh" s={14} /> Erneut versuchen
            </button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="table-card">
          <div className="empty">
            <div className="empty-icon">📭</div>
            <div className="empty-title">{emptyState.title}</div>
            <p className="empty-text">{emptyState.text}</p>
            {appliedStatus && (
              <button type="button" className="btn btn-outline btn-sm" onClick={resetFilter}>Filter zurücksetzen</button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Desktop: sechs Spalten mit relativen Breiten — kein horizontales Scrollen. */}
          <div className="table-card adm-sup-table">
            <table>
              <caption className="sr-only">
                Supportanfragen — Ticket, Kunde, Betreff, Status, Eingangszeitpunkt und Aktion.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Kunde</th>
                  <th scope="col">Betreff</th>
                  <th scope="col">Status</th>
                  <th scope="col">Eingegangen</th>
                  <th scope="col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id != null ? `sup-${row.id}` : `row-${i}`}>
                    <td><TicketCell row={row} /></td>
                    <td><CustomerCell row={row} /></td>
                    <td><SubjectCell row={row} /></td>
                    <td><StatusBadge row={row} /></td>
                    <td className="adm-sup-time">{fmtDateTime(row.createdAt)}</td>
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
          <ul className="adm-sup-cards">
            {rows.map((row, i) => (
              <li className="adm-scard" key={row.id != null ? `c-${row.id}` : `c-row-${i}`}>
                <div className="adm-scard-head">
                  <TicketCell row={row} />
                  <StatusBadge row={row} />
                </div>
                <dl className="adm-scard-kv">
                  <div><dt>Kunde</dt><dd><CustomerCell row={row} /></dd></div>
                  <div><dt>Betreff</dt><dd><SubjectCell row={row} /></dd></div>
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
