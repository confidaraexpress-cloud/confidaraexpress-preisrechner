import React, { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { listAdminSupportRequests } from "../../api/adminApi";
import { selectListTotal, selectListHasMore } from "../../utils/adminOverview.mjs";
import {
  supportReplyStateMeta,
  SUPPORT_CATEGORY_FILTER_OPTIONS,
  SUPPORT_LIST_ERROR,
  SUPPORT_SEARCH_MAX,
  SUPPORT_SORT_DEFAULT,
  SUPPORT_STATUS_FILTER_OPTIONS,
  normalizeSupportQuery,
  normalizeSupportRequest,
  supportCustomerCell,
  supportEmptyState,
  supportLabel,
  supportMailProblems,
  supportStatusMeta,
  toSupportApiFilters,
} from "../../utils/adminSupportView.mjs";

const PAGE_SIZE = 25;

const ERROR_MESSAGES = {
  400: "Ungültiger Filter. Bitte prüfen Sie Ihre Eingabe.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
};

// ── Response-Container defensiv lesen. Die Feld-Normalisierung der einzelnen
// Zeilen übernimmt zentral normalizeSupportRequest. ─────────────────────────
// selectTotal/selectHasMore lagen bis Paket E in jeder Adminliste als eigene,
// fast wortgleiche Kopie. Sie stehen jetzt einmal in utils/adminOverview.mjs —
// gleiches Verhalten, eine Quelle.
function selectRows(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of ["supportRequests", "support_requests", "requests", "data", "items", "results", "rows"]) {
      if (Array.isArray(d[k])) return d[k];
    }
  }
  return [];
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

// Antwortbedarf — serverseitig abgeleitet, zusätzlich zum Status. Ohne eigene
// Adminglocke ist das der Weg, auf dem neue Kundenantworten sichtbar werden.
function ReplyStateBadge({ row }) {
  const meta = supportReplyStateMeta(row);
  if (!meta) return null;
  return <span className={`badge ${meta[0]} adm-sup-replybadge`}>{meta[1]}</span>;
}

// Zustellprobleme kompakt und getrennt benennen — NIE der technische Fehlertext.
// Den vollen Hinweis zeigt ausschließlich die Detailseite.
function MailProblemCell({ row }) {
  const problems = supportMailProblems(row);
  if (problems.length === 0) return null;
  return (
    <span className="adm-sup-mailwarn" title={`Zustellproblem: ${problems.join(", ")}`}>
      <Icon n="info" s={13} c="currentColor" />
      {problems.length === 2 ? "Beide E-Mails" : problems[0]}
    </span>
  );
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

  // Entwurfszustand (im Formular) vs. angewendeter Zustand (an die API gesendet).
  // Die Suche wird bewusst NICHT bei jedem Tastendruck gesendet, sondern erst beim
  // Absenden des Filterformulars — dasselbe Muster wie die übrigen Adminlisten.
  const [draftStatus, setDraftStatus] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [appliedCategory, setAppliedCategory] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
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
        // sort ist bei der zentralen Liste immer 'queue' (Arbeitsreihenfolge des Supports).
        // 'recent' nutzt ausschließlich der Abschnitt im Kundenprofil.
        ...toSupportApiFilters({
          status: appliedStatus, category: appliedCategory, q: appliedQuery, sort: SUPPORT_SORT_DEFAULT,
        }),
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
      const t = selectListTotal(d);
      setRows(list);
      setTotal(t);
      setHasMore(selectListHasMore(d, list.length, page, PAGE_SIZE, t));
    } catch {
      setError(SUPPORT_LIST_ERROR);
      setRows([]); setTotal(null); setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [appliedStatus, appliedCategory, appliedQuery, page, userId]);

  useEffect(() => { load(); }, [load]);
  // Wechselt der Kundenfilter (Navigation aus einem anderen Kundenprofil), beginnt
  // die Liste wieder auf Seite 1 — sonst zeigte sie eine leere Folgeseite.
  useEffect(() => { setPage(1); }, [userId]);

  const clearUserFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("userId");
    setSearchParams(next, { replace: true });
  };

  // Alle drei Filter werden GEMEINSAM angewendet — sonst zeigt die Liste einen Zustand,
  // der nicht dem entspricht, was im Formular steht.
  const applyFilter = () => {
    setPage(1);
    setAppliedStatus(draftStatus);
    setAppliedCategory(draftCategory);
    setAppliedQuery(normalizeSupportQuery(draftQuery));
  };
  const resetFilter = () => {
    setPage(1);
    setDraftStatus(""); setAppliedStatus("");
    setDraftCategory(""); setAppliedCategory("");
    setDraftQuery(""); setAppliedQuery("");
  };
  const goPrev = () => { if (page > 1) setPage((p) => p - 1); };
  const goNext = () => { if (hasMore) setPage((p) => p + 1); };

  const showPagination = !error && (rows.length > 0 || page > 1);
  // Der Leerzustand unterscheidet „nichts vorhanden" von „Filter liefert nichts" —
  // maßgeblich ist, ob IRGENDEIN Filter aktiv ist, nicht nur der Status.
  const activeLabel = appliedStatus
    ? (SUPPORT_STATUS_FILTER_OPTIONS.find((o) => o.value === appliedStatus) || {}).label
    : "";
  const activeCategoryLabel = appliedCategory
    ? (SUPPORT_CATEGORY_FILTER_OPTIONS.find((o) => o.value === appliedCategory) || {}).label
    : "";
  const hasAnyFilter = !!(appliedStatus || appliedCategory || appliedQuery);
  const emptyState = supportEmptyState({ count: rows.length, status: hasAnyFilter ? "aktiv" : "" });

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>Supportanfragen</>}
        subtitle={<>Allgemeine Kundenanfragen aus dem Kundenbereich. Die Beantwortung erfolgt per
            E-Mail — das Bearbeiten hier verschickt keine Nachricht an den Kunden und ändert
            weder Sendungen noch Rechnungen.</>}
        actions={(
          <><button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          <Icon n="refresh" s={14} /> Aktualisieren
        </button></>
        )}
      />

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
        <div className="adm-filter-field">
          <label htmlFor="f-sup-category">Kategorie</label>
          <select
            id="f-sup-category" value={draftCategory} disabled={loading}
            onChange={(e) => setDraftCategory(e.target.value)}
          >
            {SUPPORT_CATEGORY_FILTER_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {/* Die Suche wird erst beim Absenden gesendet (type="search" im Formular löst
            Enter ohnehin aus) — kein Request je Tastendruck. */}
        <div className="adm-filter-field">
          <label htmlFor="f-sup-q">Ticketnummer oder Betreff</label>
          <input
            id="f-sup-q" type="search" value={draftQuery} disabled={loading}
            maxLength={SUPPORT_SEARCH_MAX}
            placeholder="z. B. CE-SUP26-00001"
            onChange={(e) => setDraftQuery(e.target.value)}
          />
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

      {(hasAnyFilter || userId != null) && (
        <div className="adm-filter-chips">
          {activeLabel && <span className="adm-chip">Status: {activeLabel}</span>}
          {activeCategoryLabel && <span className="adm-chip">Kategorie: {activeCategoryLabel}</span>}
          {appliedQuery && <span className="adm-chip">Suche: {appliedQuery}</span>}
          {userId != null && (
            <>
              <span className="adm-chip">Kunde: #{userId}</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={clearUserFilter} disabled={loading}>
                Kundenfilter aufheben
              </button>
            </>
          )}
          {hasAnyFilter && (
            <button type="button" className="btn btn-outline btn-sm" onClick={resetFilter} disabled={loading}>
              Filter zurücksetzen
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="table-card">
          <ListSkeleton rows={6} label="Supportanfragen werden geladen …" />
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
            {hasAnyFilter && (
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
                    <td><StatusBadge row={row} /><ReplyStateBadge row={row} /><MailProblemCell row={row} /></td>
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
                  <div><StatusBadge row={row} /><ReplyStateBadge row={row} /><MailProblemCell row={row} /></div>
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
