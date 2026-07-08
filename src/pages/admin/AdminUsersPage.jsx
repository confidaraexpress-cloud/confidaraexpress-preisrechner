import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import { listAdminUsers } from "../../api/adminApi";
import { money } from "../../utils/formatters";

const PAGE_SIZE = 25;

// ── Anzeige-Labels (reine Übersetzung) ───────────────────────────────────────
const USER_STATUS_META = {
  pending: ["badge-yellow", "Wartet"],
  approved: ["badge-green", "Freigegeben"],
  blocked: ["badge-red", "Blockiert"],
  anonymized: ["badge-gray", "Anonymisiert"],
};
const userStatusMeta = (s) => USER_STATUS_META[s] || ["badge-gray", "Unbekannt"];

const USER_ROLE_META = {
  admin: ["badge-blue", "Admin"],
  customer: ["badge-gray", "Kunde"],
};
const userRoleMeta = (r) => USER_ROLE_META[r] || ["badge-gray", r ? String(r) : "—"];

const ERROR_MESSAGES = {
  400: "Ungültige Anfrage.",
  404: "Kundenliste ist derzeit nicht verfügbar.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Kunden konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Kunden konnten nicht geladen werden. Bitte versuchen Sie es erneut.";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

// ── Response defensiv lesen ──────────────────────────────────────────────────
function selectRows(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of ["users", "data", "items", "results", "rows"]) {
      if (Array.isArray(d[k])) return d[k];
    }
  }
  return [];
}
function selectTotal(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const pag = d.pagination && typeof d.pagination === "object" ? d.pagination : {};
  const t = firstDefined(pag.total, pag.count, pag.total_count, d.total, d.total_count, d.count);
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
  return rowCount >= size;
}

// ── Feld-Getter: NUR erlaubte Felder. password/password_hash/token/secret werden
// bewusst NIE gelesen — selbst wenn das Backend sie versehentlich liefert, landen
// sie nicht im DOM. Kein Object.keys, kein Spread des ganzen Objekts.
const idOf = (u) => firstDefined(u.id, u.user_id, u.uuid);
const nameOf = (u) => firstDefined(u.name, u.full_name, u.contact_name);
const emailOf = (u) => firstDefined(u.email, u.e_mail);
const companyOf = (u) => firstDefined(u.company_name, u.company, u.firma);
const statusOf = (u) => firstDefined(u.status, u.state);
const roleOf = (u) => firstDefined(u.role);
const vatOf = (u) => firstDefined(u.vat_id, u.vatId, u.ust_id);
const paymentTermOf = (u) => firstDefined(u.payment_term, u.paymentTerm);
const creditUsedOf = (u) => firstDefined(u.credit_used, u.creditUsed);
const creditLimitOf = (u) => firstDefined(u.credit_limit, u.creditLimit);
const createdOf = (u) => firstDefined(u.created_at, u.createdAt, u.created);
const rowKeyOf = (u, i) => firstDefined(u.id, u.user_id, u.uuid) ?? `row-${i}`;

const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");
function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}
// Zahlungsziel anzeigen; leer → Default "7 Tage" (nur Anzeige, KEINE Logik/Änderung).
function paymentTermLabel(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `${n} Tage` : "7 Tage";
}
const moneyOrDash = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? money(v) : "—");

function StatusBadge({ status }) {
  const [c, l] = userStatusMeta(status);
  return <span className={`badge ${c}`}>{l}</span>;
}
function RoleBadge({ role }) {
  const [c, l] = userRoleMeta(role);
  return <span className={`badge ${c}`}>{l}</span>;
}

// Clientseitige Suche NUR auf der aktuell geladenen Seite (Backend hat keine Filter).
function matchUser(u, q) {
  const hay = [nameOf(u), companyOf(u), emailOf(u), vatOf(u)].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await listAdminUsers({ page, pageSize: PAGE_SIZE });
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) setError(ERROR_MESSAGES[r.status] || GENERIC_ERROR);
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
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const goPrev = () => { if (page > 1) setPage((p) => p - 1); };
  const goNext = () => { if (hasMore) setPage((p) => p + 1); };

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? rows.filter((u) => matchUser(u, q)) : rows), [rows, q]);
  const showPagination = !error && (rows.length > 0 || page > 1);

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-page-head-row">
        <div>
          <h1 className="adm-title">Kunden</h1>
          <p className="adm-sub">Read-only Kundenübersicht — nur Einsicht, noch keine Änderungen.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          <Icon n="refresh" s={14} /> Aktualisieren
        </button>
      </header>

      <form className="adm-filters" onSubmit={(e) => e.preventDefault()}>
        <div className="adm-filter-field" style={{ flex: 1, minWidth: 240 }}>
          <label htmlFor="u-search">Suche (aktuelle Seite)</label>
          <input
            id="u-search"
            type="search"
            placeholder="Name, Firma, E-Mail oder USt-ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="adm-support-hint" style={{ marginTop: 0, alignSelf: "flex-end" }}>
          Die Suche wirkt nur auf die aktuell geladene Seite ({rows.length} Einträge). Das Backend bietet noch keine serverseitige Suche.
        </p>
      </form>

      {loading ? (
        <div className="table-card">
          <div className="loading-center"><span className="spinner spinner-dark" /> Wird geladen…</div>
        </div>
      ) : error ? (
        <div className="alert alert-error"><Icon n="x" s={16} />{error}</div>
      ) : rows.length === 0 ? (
        <div className="table-card">
          <div className="empty"><div className="empty-icon">👥</div><div className="empty-title">Keine Kunden gefunden</div></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="table-card">
          <div className="empty"><div className="empty-icon">🔎</div><div className="empty-title">Keine Treffer auf dieser Seite</div></div>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Registriert am</th>
                  <th>ID</th>
                  <th>Firma</th>
                  <th>Name</th>
                  <th>E-Mail</th>
                  <th>Status</th>
                  <th>Rolle</th>
                  <th>USt-ID</th>
                  <th>Zahlungsziel</th>
                  <th>Kredit genutzt</th>
                  <th>Kreditlimit</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={rowKeyOf(u, i)}>
                    <td className="adm-td-time">{fmtDate(createdOf(u))}</td>
                    <td className="adm-mono">{dash(idOf(u))}</td>
                    <td>{dash(companyOf(u))}</td>
                    <td>{dash(nameOf(u))}</td>
                    <td className="adm-nowrap">{dash(emailOf(u))}</td>
                    <td><StatusBadge status={statusOf(u)} /></td>
                    <td><RoleBadge role={roleOf(u)} /></td>
                    <td className="adm-mono">{dash(vatOf(u))}</td>
                    <td className="adm-nowrap">{paymentTermLabel(paymentTermOf(u))}</td>
                    <td className="adm-num">{moneyOrDash(creditUsedOf(u))}</td>
                    <td className="adm-num">{moneyOrDash(creditLimitOf(u))}</td>
                    <td><span className="adm-muted">Details folgt</span></td>
                  </tr>
                ))}
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
