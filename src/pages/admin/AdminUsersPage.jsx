import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDialog } from "../../hooks/useDialog";
import { PageHeader } from "../../components/ui/PageHeader";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { listAdminUsers, setAdminUserStatus, getAdminCustomerPriceMarkup } from "../../api/adminApi";
import { useAuth } from "../../context/AuthContext";
import { userStatusMeta, userRoleMeta } from "../../utils/adminUsers";
import { missingB2BAccountFields } from "../../utils/b2bAccount.mjs";
import { CustomerRowActions } from "../../components/admin/CustomerRowActions";
import {
  BLOCK_DIALOG,
  DEFAULT_FILTERS,
  STATUS_FILTER_OPTIONS,
  activeFilterChips,
  customerDisplayName,
  customerFields,
  filterCustomerRows,
  hasActiveFilters,
  isAdminAccount,
  listEmptyState,
  statusActionNote,
  statusSuccessMessage,
} from "../../utils/adminCustomerView.mjs";
import {
  CODE_CONFIRMATION_REQUIRED,
  approvalError,
  approvalGate,
  approvalGateExplanation,
  confirmedMarkupLine,
  selectPriceMarkup,
} from "../../utils/customerMarkup.mjs";

const PAGE_SIZE = 25;

const ERROR_MESSAGES = {
  400: "Ungültige Anfrage.",
  404: "Kundenliste ist derzeit nicht verfügbar.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Die Kundenliste konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Die Kundenliste konnte nicht geladen werden. Bitte versuchen Sie es erneut.";

// Fehlertexte der Statusänderung. Sie beantworten immer: Was ist fehlgeschlagen
// und wurden Daten verändert? Keine Stacktraces, keine rohen Backendobjekte.
const STATUS_CHANGE_ERRORS = {
  400: "Der gewünschte Status ist ungültig. Es wurden keine Änderungen gespeichert.",
  404: "Der Kunde wurde nicht gefunden. Es wurden keine Änderungen gespeichert.",
  // 409 = B2B-Vollständigkeits-Guard des Backends. Die konkrete Meldung kommt
  // aus der Antwort (sie benennt die fehlenden Felder); das hier ist der Fallback.
  409: "Freischaltung nicht möglich: Die Firmendaten des Kontos sind unvollständig.",
  429: "Zu viele Adminaktionen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Der Status wurde nicht geändert. Es wurden keine Änderungen gespeichert.",
  default: "Der Status wurde nicht geändert. Es wurden keine Änderungen gespeichert.",
};

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

const rowKeyOf = (u, i) => customerFields(u).id ?? `row-${i}`;

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
}

function StatusBadge({ status }) {
  const [c, l] = userStatusMeta(status);
  return <span className={`badge ${c}`}>{l}</span>;
}

const detailPath = (id) => `/admin/users/${encodeURIComponent(id)}`;

// ── Zellinhalte (geteilt zwischen Tabelle und Mobilkarte) ────────────────────

// Spalte „Kunde": Firma primär, Ansprechpartner sekundär. Der Firmenname ist
// zugleich der Link ins Kundendetail — nie mehr die kleine technische ID.
function CustomerCell({ user }) {
  const f = customerFields(user);
  const admin = isAdminAccount(user);
  return (
    <div className="adm-cust">
      {f.id != null ? (
        <Link className="adm-cust-name" to={detailPath(f.id)}>
          {f.company || <span className="adm-b2b-missing">Firmenname fehlt</span>}
        </Link>
      ) : (
        <span className="adm-cust-name">{f.company || <span className="adm-b2b-missing">Firmenname fehlt</span>}</span>
      )}
      <span className="adm-cust-meta">
        {f.name || <span className="adm-b2b-missing">Ansprechpartner fehlt</span>}
        {/* Rolle nur bei Sonderkonten — normale Kunden tragen keine Rollenangabe. */}
        {admin && <span className={`badge ${userRoleMeta(f.role)[0]} adm-cust-role`}>{userRoleMeta(f.role)[1]}</span>}
      </span>
      {f.createdAt && <span className="adm-cust-since">Registriert {fmtDate(f.createdAt)}</span>}
    </div>
  );
}

export default function AdminUsersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const currentAdminId = authUser?.id ?? null;

  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [confirm, setConfirm] = useState(null);        // { id, target, kind, name, status }
  const [actionBusy, setActionBusy] = useState(false); // Statusänderung läuft
  const [actionMsg, setActionMsg] = useState(null);    // { type, text }
  // Bestätigungsstatus des Kundenaufschlags — NUR für den geöffneten
  // Freischaltungsdialog, gezielt für genau diesen Kunden geladen. Die
  // Kundenliste selbst löst dafür keine Abfragen aus.
  const [confirmPricing, setConfirmPricing] = useState({ loading: false, error: false, data: null });

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

  // Flash nach Redirect (z. B. „Kunde gelöscht" aus dem Detail). Genau einmal
  // anzeigen, dann den Router-State löschen. Kein Storage — reiner In-Memory-State.
  useEffect(() => {
    const flash = location.state && location.state.flash;
    if (flash) {
      setActionMsg({ type: "success", text: String(flash) });
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const goPrev = () => { if (page > 1) setPage((p) => p - 1); };
  const goNext = () => { if (hasMore) setPage((p) => p + 1); };

  // Aufschlag für genau einen Kunden laden (Freischaltungsdialog). Solange das
  // läuft bzw. fehlschlägt, gilt der Bestätigungsstatus als unbekannt und die
  // Freischaltung wird NICHT als möglich dargestellt (fail-closed).
  const loadConfirmPricing = useCallback(async (userId) => {
    setConfirmPricing({ loading: true, error: false, data: null });
    try {
      const r = await getAdminCustomerPriceMarkup(userId);
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch.
        setConfirmPricing({ loading: false, error: true, data: null });
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const data = selectPriceMarkup(d);
      setConfirmPricing({ loading: false, error: !data, data });
    } catch {
      setConfirmPricing({ loading: false, error: true, data: null });
    }
  }, []);

  // Menüauswahl → Bestätigungsdialog. Es wird NIE direkt ein Status gesetzt.
  const openConfirm = (key, u) => {
    if (key !== "approve" && key !== "block") return;
    setActionMsg(null);
    const f = customerFields(u);
    const target = key === "approve" ? "approved" : "blocked";
    setConfirm({
      id: f.id,
      target,
      kind: key,
      status: f.status,
      name: customerDisplayName(u),
      // Nur für die Freischaltung relevant: fehlende B2B-Stammdaten eines Alt-Kontos.
      // Verbindlich bleibt der serverseitige Guard — dies ist reine Vorab-Information.
      missingB2B: target === "approved" ? missingB2BAccountFields(u) : [],
    });
    // Nur vor einer Freischaltung: Der Aufschlag muss bestätigt sein. Beim
    // Blockieren spielt er keine Rolle — dort wird nichts nachgeladen.
    if (target === "approved") loadConfirmPricing(f.id);
    else setConfirmPricing({ loading: false, error: false, data: null });
  };
  const closeConfirm = () => { if (!actionBusy) setConfirm(null); };

  // Freischaltungs-Gate für den gerade geöffneten Dialog. Beim Blockieren liefert
  // es „not_approval" und lässt den bestehenden Ablauf unverändert.
  const confirmGate = approvalGate({
    currentStatus: confirm?.status,
    targetStatus: confirm?.target,
    pricing: confirmPricing.data,
    loading: confirmPricing.loading,
    error: confirmPricing.error,
  });

  const confirmStatusChange = async () => {
    if (!confirm) return;
    if (actionBusy) return;              // Doppelübermittlung ausgeschlossen
    if (!confirmGate.allowed) return;    // ohne bestätigten Aufschlag kein Request
    const { id, target, status } = confirm;
    setActionBusy(true);
    setActionMsg(null);
    // Beim Aufschlags-Gate (409) bleibt der Dialog offen und lädt den
    // Bestätigungsstatus neu — der Admin sieht sofort, was fehlt.
    let keepOpen = false;
    try {
      const r = await setAdminUserStatus(id, target);
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) {
          let body = null;
          try { body = await r.json(); } catch { body = null; }
          let text = STATUS_CHANGE_ERRORS[r.status] || STATUS_CHANGE_ERRORS.default;
          if (r.status === 409) {
            const err = approvalError(409, body);
            if (err && err.code === CODE_CONFIRMATION_REQUIRED) {
              // Parallele Änderung: der Aufschlag ist (nicht mehr) bestätigt.
              text = err.text;
              keepOpen = true;
              loadConfirmPricing(id);
            } else if (body && typeof body.error === "string" && body.error.trim()) {
              // Bestehender B2B-Guard: das Backend benennt die fehlenden Felder —
              // diese Meldung ist aussagekräftiger als der generische Katalogtext.
              text = body.error.trim();
            }
          }
          setActionMsg({ type: "error", text });
        }
        return;
      }
      // Erfolgsmeldung erst nach erfolgreicher Antwort.
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const noOp = !!(d && (d.no_op === true || d.noop === true || d.changed === false || d.unchanged === true));
      setActionMsg({
        type: "success",
        text: noOp ? "Status war bereits gesetzt." : statusSuccessMessage(target, status),
      });
      load(); // Backend-Realität neu laden (kein optimistisches Raten)
    } catch {
      setActionMsg({ type: "error", text: STATUS_CHANGE_ERRORS.default });
    } finally {
      setActionBusy(false);
      if (!keepOpen) setConfirm(null);
    }
  };

  // Lokale Suche und Filter — ausschließlich auf der aktuell geladenen Seite.
  const filtered = useMemo(() => filterCustomerRows(rows, filters), [rows, filters]);
  const chips = activeFilterChips(filters);
  const emptyState = listEmptyState({ loadedCount: rows.length, filteredCount: filtered.length, filters });
  const showPagination = !error && !loading && (rows.length > 0 || page > 1);
  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>Kunden</>}
        subtitle={<>Übersicht aller Geschäftskunden. Statusänderungen werden protokolliert.</>}
        actions={(
          <><button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          <Icon n="refresh" s={14} /> Aktualisieren
        </button></>
        )}
      />

      {/* Suche und Filter — mit echten Labels und ehrlichem Geltungsbereich. */}
      <form className="adm-filters" onSubmit={(e) => e.preventDefault()} role="search">
        <div className="adm-filter-field adm-filter-search">
          <label htmlFor="u-search">Diese Seite durchsuchen</label>
          <input
            id="u-search"
            type="search"
            placeholder="Firma, Name, E-Mail oder USt-ID"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            aria-describedby="u-search-hint"
          />
        </div>
        <div className="adm-filter-field">
          <label htmlFor="u-status">Status</label>
          <select
            id="u-status"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <p id="u-search-hint" className="adm-support-hint adm-filter-hint">
          Durchsucht nur die aktuell angezeigte Seite ({rows.length} {rows.length === 1 ? "Eintrag" : "Einträge"}).
        </p>
      </form>

      {chips.length > 0 && (
        <div className="adm-filter-chips">
          <span className="adm-filter-chips-label">Aktive Filter:</span>
          {chips.map((c) => (
            <span key={c.key} className="adm-chip">{c.label}</span>
          ))}
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters}>
            <Icon n="x" s={13} /> Filter zurücksetzen
          </button>
        </div>
      )}

      {actionMsg && (
        <div
          className={`alert ${actionMsg.type === "success" ? "alert-success" : "alert-error"}`}
          role={actionMsg.type === "success" ? "status" : "alert"}
          aria-live="polite"
        >
          <Icon n={actionMsg.type === "success" ? "check" : "x"} s={16} />{actionMsg.text}
        </div>
      )}

      {loading ? (
        <div className="table-card">
          <div className="loading-center" role="status" aria-live="polite">
            <span className="spinner spinner-dark" /> Kunden werden geladen…
          </div>
        </div>
      ) : error ? (
        <div className="adm-loaderr">
          <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{error}</div>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>
            <Icon n="refresh" s={14} /> Erneut laden
          </button>
        </div>
      ) : emptyState.show ? (
        <div className="table-card">
          <div className="empty">
            <div className="empty-icon" aria-hidden="true"><Icon n={hasActiveFilters(filters) ? "search" : "admin"} s={24} /></div>
            <div className="empty-title">{emptyState.title}</div>
            <p className="empty-text">{emptyState.text}</p>
            {hasActiveFilters(filters) && (
              <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters}>
                <Icon n="x" s={13} /> Filter zurücksetzen
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Desktop: kompakte Tabelle mit fünf Spalten — kein horizontales Scrollen. */}
          <div className="table-card adm-users-table">
            <table>
              <caption className="sr-only">
                Kundenliste, Seite {page}. Spalten: Kunde, Kontakt, Kundennummer, Status, Aktion.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Kunde</th>
                  <th scope="col">Kontakt</th>
                  <th scope="col">Kundennummer</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="adm-col-action">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => {
                  const f = customerFields(u);
                  const note = statusActionNote(u);
                  return (
                    <tr key={rowKeyOf(u, i)}>
                      <td><CustomerCell user={u} /></td>
                      <td className="adm-col-contact">
                        <span className="adm-email" title={f.email}>{f.email || "—"}</span>
                      </td>
                      <td className="adm-mono adm-nowrap">{f.customerNumber || <span className="text-muted">—</span>}</td>
                      <td><StatusBadge status={f.status} /></td>
                      <td className="adm-col-action">
                        <div className="adm-row-actions-cell">
                          {f.id != null && (
                            <Link className="btn btn-outline btn-sm" to={detailPath(f.id)}>
                              Details
                            </Link>
                          )}
                          <CustomerRowActions
                            user={u}
                            currentAdminId={currentAdminId}
                            busy={actionBusy}
                            onSelect={openConfirm}
                          />
                          {note && <span className="sr-only">{note}</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobil: Karten statt Tabelle — kein horizontaler Seitenüberlauf. */}
          <ul className="adm-users-cards">
            {filtered.map((u, i) => {
              const f = customerFields(u);
              return (
                <li className="adm-ucard" key={`c-${rowKeyOf(u, i)}`}>
                  <div className="adm-ucard-head">
                    <CustomerCell user={u} />
                    <StatusBadge status={f.status} />
                  </div>
                  <dl className="adm-ucard-kv">
                    <div><dt>E-Mail</dt><dd className="adm-email">{f.email || "—"}</dd></div>
                    <div><dt>Kundennummer</dt><dd className="adm-mono">{f.customerNumber || "—"}</dd></div>
                  </dl>
                  <div className="adm-ucard-actions">
                    {f.id != null && (
                      <Link className="btn btn-outline btn-sm" to={detailPath(f.id)}>Details</Link>
                    )}
                    <CustomerRowActions
                      user={u}
                      currentAdminId={currentAdminId}
                      busy={actionBusy}
                      onSelect={openConfirm}
                    />
                  </div>
                </li>
              );
            })}
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

      {confirm && (() => {
        const danger = confirm.kind === "block";
        const reactivation = confirm.status === "blocked";
        // Blockieren: eigene, unmissverständliche Dialogtexte.
        const title = danger
          ? BLOCK_DIALOG.title
          : (reactivation ? "Kunde reaktivieren" : "Kunde freischalten");
        const text = danger
          ? BLOCK_DIALOG.text
          : "Der Kunde erhält Zugriff auf ConfidaraExpress. Die Aktion wird protokolliert.";
        const cta = danger ? BLOCK_DIALOG.confirm : (reactivation ? "Kunde reaktivieren" : "Kunde freischalten");
        // Freischaltung: ohne bestätigten Kundenaufschlag wird kein Request
        // abgesetzt. Der Grund steht im Dialog, der CTA springt in die
        // Aufschlagssektion der Kundendetailansicht (Router-State, kein
        // Query-Parameter — es landen keine Pricing-Daten in der URL).
        const gateInfo = approvalGateExplanation(confirmGate);
        const markupLine = confirm.target === "approved" ? confirmedMarkupLine(confirmPricing.data) : null;
        const jumpToMarkup = () => {
          setConfirm(null);
          navigate(detailPath(confirm.id), { state: { focusPricing: true } });
        };
        return (
          <StatusConfirmDialog
            title={title}
            text={text}
            cta={cta}
            danger={danger}
            name={confirm.name}
            busy={actionBusy}
            disabled={!confirmGate.allowed}
            missingB2B={confirm.missingB2B}
            checking={confirm.target === "approved" && confirmPricing.loading}
            markupLine={markupLine}
            gateInfo={!confirmGate.allowed ? gateInfo : null}
            onJumpToMarkup={jumpToMarkup}
            onCancel={closeConfirm}
            onConfirm={confirmStatusChange}
          />
        );
      })()}
    </div>
  );
}

// Bestätigungsdialog für Statusänderungen. Fokus beim Öffnen auf „Abbrechen",
// Escape schließt (außer während des Requests), der Fokus kehrt danach zum
// auslösenden Element zurück. Kein Statuswechsel durch einen einzigen Klick.
function StatusConfirmDialog({
  title, text, cta, danger, name, busy, disabled,
  missingB2B, checking, markupLine, gateInfo, onJumpToMarkup, onCancel, onConfirm,
}) {
  // Fokusfalle, Fokusrückgabe und Escape kommen seit Paket A, Phase 3 aus dem
  // gemeinsamen Hook; während eines laufenden Requests schließt Escape nicht.
  const dialogRef = useDialog({ onClose: onCancel, closeOnEscape: !busy });

  return (
    <div
      className="adm-modal-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div
        ref={dialogRef}
        className="adm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adm-status-title"
        aria-describedby="adm-status-desc"
      >
        <div className={`adm-modal-icon ${danger ? "adm-modal-icon-danger" : "adm-modal-icon-approve"}`} aria-hidden="true">
          <Icon n={danger ? "lock" : "check"} s={22} />
        </div>
        <h2 id="adm-status-title" className="adm-modal-title">{title}</h2>
        <p className="adm-modal-sub">{name}</p>
        <p id="adm-status-desc" className="adm-modal-text">{text}</p>

        {missingB2B?.length > 0 && (
          <div className="adm-b2b-warn" role="status">
            <Icon n="shield" s={16} />
            <span>
              <strong>{missingB2B.map((f) => f.missingText).join(" · ")}</strong>
              <span className="adm-b2b-warn-text">
                ConfidaraExpress ist eine reine Geschäftskundenplattform. Die Freischaltung wird
                serverseitig abgelehnt, solange diese Angaben fehlen.
              </span>
            </span>
          </div>
        )}

        {/* Kundenaufschlag prüfen (nur vor einer Freischaltung). Solange geladen
            wird, ist die Bestätigung unbekannt — der Dialog stellt die
            Freischaltung dann bewusst nicht als möglich dar. */}
        {checking && (
          <p className="adm-markup-check" role="status" aria-live="polite">
            <span className="spinner spinner-dark" /> Kundenaufschlag wird geprüft…
          </p>
        )}
        {markupLine && (
          <p className="adm-approve-markup"><Icon n="euro" s={15} /> {markupLine}</p>
        )}
        {gateInfo && gateInfo.title && (
          <div className="adm-b2b-warn" role="status">
            <Icon n="shield" s={16} />
            <span>
              <strong>{gateInfo.title}</strong>
              <span className="adm-b2b-warn-text">{gateInfo.text}</span>
              {gateInfo.cta && (
                <button type="button" className="btn btn-outline btn-sm adm-approve-jump" onClick={onJumpToMarkup}>
                  <Icon n="arrowRight" s={13} /> {gateInfo.cta}
                </button>
              )}
            </span>
          </div>
        )}

        <p className="adm-support-hint" style={{ marginTop: 0 }}>Statusänderungen werden protokolliert.</p>
        <div className="adm-modal-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={onCancel} disabled={busy}>
            {BLOCK_DIALOG.cancel}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${danger ? "adm-btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy || disabled}
            aria-busy={busy ? "true" : undefined}
          >
            {busy
              ? <><span className="spinner spinner-dark" /> Wird gespeichert…</>
              : <><Icon n={danger ? "lock" : "check"} s={14} /> {cta}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
