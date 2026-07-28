import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { listAdminUsers, setAdminUserStatus, getAdminCustomerPriceMarkup } from "../../api/adminApi";
import { userStatusMeta, userRoleMeta, paymentTermLabel } from "../../utils/adminUsers";
import { missingB2BAccountFields, isApprovalBlocked } from "../../utils/b2bAccount.mjs";
import { customerNumberOf } from "../../utils/businessNumbers.mjs";
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
  500: "Kunden konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Kunden konnten nicht geladen werden. Bitte versuchen Sie es erneut.";

// Statusaktion je aktuellem Status. „anonymized"/unbekannt → keine Aktion.
// Es wird NIE „anonymized" als Ziel erzeugt (nur approved/blocked).
function statusAction(status) {
  if (status === "pending" || status === "blocked") return { target: "approved", label: "Freischalten", kind: "approve" };
  if (status === "approved") return { target: "blocked", label: "Blockieren", kind: "block" };
  return null;
}

const CONFIRM_COPY = {
  approve: {
    title: "Kunde freischalten",
    text: "Dieser Kunde erhält Zugriff auf ConfidaraExpress. Die Aktion wird protokolliert.",
    cta: "Freischalten bestätigen",
  },
  block: {
    title: "Kunde blockieren",
    text: "Dieser Kunde kann sich danach nicht mehr normal anmelden. Die Aktion wird protokolliert.",
    cta: "Blockieren bestätigen",
  },
};

const STATUS_CHANGE_ERRORS = {
  400: "Der gewünschte Status ist ungültig.",
  404: "Kunde wurde nicht gefunden.",
  // 409 = B2B-Vollständigkeits-Guard des Backends. Die konkrete Meldung kommt
  // aus der Antwort (sie benennt die fehlenden Felder); das hier ist der Fallback.
  409: "Freischaltung nicht möglich: Firmendaten des Kontos sind unvollständig.",
  429: "Zu viele Adminaktionen. Bitte später erneut versuchen.",
  500: "Status konnte nicht geändert werden.",
  default: "Status konnte nicht geändert werden.",
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
const createdOf = (u) => firstDefined(u.created_at, u.createdAt, u.created);
const rowKeyOf = (u, i) => firstDefined(u.id, u.user_id, u.uuid) ?? `row-${i}`;

const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");
function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}

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
  const location = useLocation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState(null);       // { id, target, kind, name }
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

  // Flash nach Redirect (z. B. „Kunde wurde gelöscht." aus dem Detail). Genau
  // einmal anzeigen, dann den Router-State löschen, damit ein Reload/Zurück den
  // Hinweis nicht wiederholt. Kein Storage — reiner In-Memory-Router-State.
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

  const openConfirm = (u, action) => {
    setActionMsg(null);
    const userId = idOf(u);
    setConfirm({
      id: userId,
      target: action.target,
      kind: action.kind,
      status: statusOf(u),
      name: companyOf(u) || nameOf(u) || `#${dash(userId)}`,
      // Nur für die Freischaltung relevant: fehlende B2B-Stammdaten eines Alt-Kontos.
      // Verbindlich bleibt der serverseitige Guard — dies ist reine Vorab-Information.
      missingB2B: action.target === "approved" ? missingB2BAccountFields(u) : [],
    });
    // Nur vor einer Freischaltung: Der Aufschlag muss bestätigt sein. Beim
    // Blockieren spielt er keine Rolle — dort wird nichts nachgeladen.
    if (action.target === "approved") loadConfirmPricing(userId);
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
    const { id, target } = confirm;
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
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const noOp = !!(d && (d.no_op === true || d.noop === true || d.changed === false || d.unchanged === true));
      setActionMsg({
        type: "success",
        text: noOp ? "Status war bereits gesetzt." : (target === "approved" ? "Kunde wurde freigeschaltet." : "Kunde wurde blockiert."),
      });
      load(); // Backend-Realität neu laden (kein optimistisches Raten)
    } catch {
      setActionMsg({ type: "error", text: STATUS_CHANGE_ERRORS.default });
    } finally {
      setActionBusy(false);
      if (!keepOpen) setConfirm(null);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? rows.filter((u) => matchUser(u, q)) : rows), [rows, q]);
  const showPagination = !error && (rows.length > 0 || page > 1);

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-page-head-row">
        <div>
          <h1 className="adm-title">Kunden</h1>
          <p className="adm-sub">Kundenübersicht mit Freischalten/Blockieren. Statusänderungen werden protokolliert.</p>
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

      {actionMsg && (
        <div className={`alert ${actionMsg.type === "success" ? "alert-success" : "alert-error"}`}>
          <Icon n={actionMsg.type === "success" ? "check" : "x"} s={16} />{actionMsg.text}
        </div>
      )}

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
                  <th>Kundennummer</th>
                  <th>ID</th>
                  <th>Firma</th>
                  <th>Name</th>
                  <th>E-Mail</th>
                  <th>Status</th>
                  <th>Rolle</th>
                  <th>USt-ID</th>
                  <th>Zahlungsziel</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={rowKeyOf(u, i)}>
                    <td className="adm-td-time">{fmtDate(createdOf(u))}</td>
                    {/* Kundennummer = organisatorische Kundenkennung (CE-K-…). Die interne ID
                        daneben bleibt der rein technische Schlüssel (Detail-Link). */}
                    <td className="adm-mono">{customerNumberOf(u) || <span className="text-muted">—</span>}</td>
                    <td className="adm-mono">
                      {idOf(u) != null
                        ? <Link className="adm-idlink" to={`/admin/users/${encodeURIComponent(idOf(u))}`}>{idOf(u)}</Link>
                        : "—"}
                    </td>
                    <td>{companyOf(u) ? companyOf(u) : <span className="adm-b2b-missing">Firmenname fehlt</span>}</td>
                    <td>{nameOf(u) ? nameOf(u) : <span className="adm-b2b-missing">Ansprechpartner fehlt</span>}</td>
                    <td className="adm-nowrap">{dash(emailOf(u))}</td>
                    <td><StatusBadge status={statusOf(u)} /></td>
                    <td><RoleBadge role={roleOf(u)} /></td>
                    <td className="adm-mono">{dash(vatOf(u))}</td>
                    <td className="adm-nowrap">{paymentTermLabel(paymentTermOf(u))}</td>
                    <td>
                      {(() => {
                        const st = statusOf(u);
                        const action = statusAction(st);
                        if (action) {
                          // Freischalten bei unvollständigen B2B-Stammdaten: der Server
                          // lehnt es ohnehin ab (409) — hier wird es vorab kenntlich
                          // gemacht. Sperren bleibt immer möglich.
                          const blocked = action.target === "approved" && isApprovalBlocked(u);
                          return (
                            <button
                              type="button"
                              className={`btn btn-sm ${action.kind === "block" ? "adm-btn-danger" : "btn-outline"}`}
                              onClick={() => openConfirm(u, action)}
                              disabled={actionBusy || blocked}
                              title={blocked ? "Firmendaten unvollständig — bitte im Kundendetail ergänzen." : undefined}
                            >
                              <Icon n={action.kind === "block" ? "lock" : "check"} s={13} /> {action.label}
                            </button>
                          );
                        }
                        if (st === "anonymized") return <span className="adm-muted">Keine Statusänderung möglich</span>;
                        return <span className="adm-muted">—</span>;
                      })()}
                    </td>
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

      {confirm && (() => {
        const copy = CONFIRM_COPY[confirm.kind];
        const danger = confirm.kind === "block";
        // Freischaltung: ohne bestätigten Kundenaufschlag wird kein Request
        // abgesetzt. Der Grund steht im Dialog, der CTA springt in die
        // Aufschlagssektion der Kundendetailansicht (Router-State, kein
        // Query-Parameter — es landen keine Pricing-Daten in der URL).
        const gateInfo = approvalGateExplanation(confirmGate);
        const markupLine = confirm.target === "approved" ? confirmedMarkupLine(confirmPricing.data) : null;
        const jumpToMarkup = () => {
          setConfirm(null);
          navigate(`/admin/users/${encodeURIComponent(confirm.id)}`, { state: { focusPricing: true } });
        };
        return (
          <div className="adm-modal-overlay" role="presentation" onClick={closeConfirm}>
            <div
              className="adm-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="adm-status-title"
              aria-describedby="adm-status-desc"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`adm-modal-icon ${danger ? "adm-modal-icon-danger" : "adm-modal-icon-approve"}`} aria-hidden="true">
                <Icon n={danger ? "lock" : "check"} s={22} />
              </div>
              <h2 id="adm-status-title" className="adm-modal-title">{copy.title}</h2>
              <p className="adm-modal-sub">{confirm.name}</p>
              <p id="adm-status-desc" className="adm-modal-text">{copy.text}</p>
              {confirm.missingB2B?.length > 0 && (
                <div className="adm-b2b-warn" role="status">
                  <Icon n="shield" s={16} />
                  <span>
                    <strong>{confirm.missingB2B.map((f) => f.missingText).join(" · ")}</strong>
                    <span className="adm-b2b-warn-text">
                      ConfidaraExpress ist eine reine Geschäftskundenplattform. Die Freischaltung wird
                      serverseitig abgelehnt, solange diese Angaben fehlen.
                    </span>
                  </span>
                </div>
              )}
              {/* Kundenaufschlag prüfen (nur vor einer Freischaltung). Solange
                  geladen wird, ist die Bestätigung unbekannt — der Dialog stellt
                  die Freischaltung dann bewusst nicht als möglich dar. */}
              {confirm.target === "approved" && confirmPricing.loading && (
                <p className="adm-markup-check" role="status" aria-live="polite">
                  <span className="spinner spinner-dark" /> Kundenaufschlag wird geprüft…
                </p>
              )}
              {markupLine && (
                <p className="adm-approve-markup"><Icon n="euro" s={15} /> {markupLine}</p>
              )}
              {!confirmGate.allowed && gateInfo.title && (
                <div className="adm-b2b-warn" role="status">
                  <Icon n="shield" s={16} />
                  <span>
                    <strong>{gateInfo.title}</strong>
                    <span className="adm-b2b-warn-text">{gateInfo.text}</span>
                    {gateInfo.cta && (
                      <button type="button" className="btn btn-outline btn-sm adm-approve-jump" onClick={jumpToMarkup}>
                        <Icon n="arrowRight" s={13} /> {gateInfo.cta}
                      </button>
                    )}
                  </span>
                </div>
              )}
              <p className="adm-support-hint" style={{ marginTop: 0 }}>Statusänderungen werden protokolliert.</p>
              <div className="adm-modal-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={closeConfirm} disabled={actionBusy}>Abbrechen</button>
                <button
                  type="button"
                  className={`btn btn-sm ${danger ? "adm-btn-danger" : "btn-primary"}`}
                  onClick={confirmStatusChange}
                  disabled={actionBusy || !confirmGate.allowed}
                  aria-busy={actionBusy ? "true" : undefined}
                >
                  {actionBusy
                    ? <><span className="spinner spinner-dark" /> Wird gespeichert…</>
                    : <><Icon n={danger ? "lock" : "check"} s={14} /> {copy.cta}</>}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
