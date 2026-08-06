import React, { useCallback, useEffect, useState } from "react";
import { statusFallback } from "../../utils/statusFallback.mjs";
import { PageHeader } from "../../components/ui/PageHeader";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { DateField, DATE_FORMAT_HINT } from "../../components/admin/DateField";
import { selectListTotal, selectListHasMore, selectListRows } from "../../utils/adminOverview.mjs";
import { listAuditLogs } from "../../api/adminApi";

const PAGE_SIZE = 25;

// ── Anzeige-Labels (reine Übersetzung, keine Logik) ──────────────────────────
const ACTION_LABELS = {
  "user.status_change": "Kundenstatus geändert",
  "invoice.mark_paid": "Rechnung als bezahlt markiert",
  "user.delete": "Kunde gelöscht",
  "user.delete_denied": "Löschung abgelehnt",
  "admin.user_anonymize": "Kunde anonymisiert",
  "admin.shipment.view": "Sendungsdetail eingesehen",
  "admin.shipment.label_download": "Label heruntergeladen",
  "admin.shipment.tracking_view": "Tracking eingesehen",
};

// [badge-Klasse, Label]. Unbekannte Werte → grau + Rohwert (harmlos).
const RESULT_META = {
  success: ["badge-green", "Erfolgreich"],
  no_op: ["badge-gray", "Keine Änderung"],
  denied: ["badge-red", "Abgelehnt"],
  failed: ["badge-red", "Fehlgeschlagen"],
};

const ACTION_OPTIONS = Object.keys(ACTION_LABELS);
const RESULT_OPTIONS = Object.keys(RESULT_META);

const EMPTY_FILTERS = {
  action: "",
  result: "",
  actor_user_id: "",
  target_user_id: "",
  from: "",
  to: "",
};

// HTTP-Status → admin-freundliche Meldung. Keine rohen Backend-Objekte.
const ERROR_MESSAGES = {
  400: "Ungültige Filter. Bitte prüfen Sie Ihre Eingaben.",
  404: "Audit-Logs sind derzeit nicht verfügbar.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Audit-Logs konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Audit-Logs konnten nicht geladen werden. Bitte versuchen Sie es erneut.";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

// Response defensiv lesen — die Selektoren liegen seit Paket E einmal zentral
// in utils/adminOverview.mjs (vorher in jeder Adminliste als eigene Kopie).
const selectRows = (d) => selectListRows(d, ["logs", "audit_logs"]);

// ── Feld-Extraktion (PII-sicher) ─────────────────────────────────────────────
// Es werden AUSSCHLIESSLICH id/name/type gelesen — niemals wird ein ganzes
// actor-/target-Objekt gerendert. Selbst wenn das Objekt E-Mail/IP enthielte,
// landet nichts davon im UI.
function partyOf(row, kind) {
  const o = row && typeof row[kind] === "object" && row[kind] ? row[kind] : null;
  const id = firstDefined(o?.id, o?.user_id, row?.[`${kind}_user_id`], row?.[`${kind}_id`]);
  const name = firstDefined(o?.name, o?.company_name, row?.[`${kind}_name`]);
  const type = firstDefined(row?.[`${kind}_type`], o?.type);
  return { id: id ?? null, name: name ?? null, type: type ?? null };
}

const timeOf = (row) => firstDefined(row?.created_at, row?.timestamp, row?.time, row?.ts, row?.occurred_at) ?? null;
const actionOf = (row) => firstDefined(row?.action, row?.action_type, row?.event) ?? null;
const resultOf = (row) => firstDefined(row?.result, row?.status, row?.outcome) ?? null;
const rowKey = (row, i) => firstDefined(row?.id, row?.uuid, row?.log_id) ?? `row-${i}`;
function metadataOf(row) {
  const m = firstDefined(row?.metadata, row?.meta, row?.details);
  return m && typeof m === "object" ? m : null;
}

// Zeit robust formatieren — nie „Invalid Date": unparsbare Werte werden roh,
// aber harmlos durchgereicht.
function fmtTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  // Ohne Sekunden — dieselbe Regel wie dtDE() im Kundenportal (Paket C). Der
  // Zeitpunkt bleibt identisch, nur die Darstellung ist ruhiger. Der
  // Rohwert-Fallback für unparsbare Werte bleibt unverändert.
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString("de-DE", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Metadata-Sanitizer (Datenschutz) ─────────────────────────────────────────
// Metadaten werden NUR als flache, kompakte Key/Value-Liste gezeigt. Sensible
// Schlüssel (E-Mail, IP, User-Agent, Passwörter, Tokens, Secrets, Hashes,
// Telefon) werden vollständig entfernt — nicht nur maskiert. Werte sind reiner
// Text (React-Escaping; niemals dangerouslySetInnerHTML), lange Werte werden
// gekürzt, verschachtelte Objekte NICHT rekursiv ausgerollt (kein Roh-JSON).
const SENSITIVE_TOKENS = new Set([
  "ip", "ipaddress", "ipaddr", "ips",
  "ua", "useragent", "agent",
  "email", "emails", "mail", "mails",
  "password", "passwort", "passwd", "pwd", "pass",
  "hash", "hashes", "salt", "digest",
  "token", "tokens", "jwt", "bearer", "apikey",
  "secret", "secrets",
  "authorization", "auth", "cookie", "cookies", "session",
  "phone", "tel", "telefon", "telephone", "mobile",
]);

// Wort-genaue Prüfung: „ship"/„zip"/„recipient" enthalten zwar „ip", werden aber
// NICHT gesperrt, weil nur ganze Token verglichen werden.
function isSensitiveKey(key) {
  const raw = String(key).toLowerCase();
  const tokens = raw.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((t) => SENSITIVE_TOKENS.has(t))) return true;
  const joined = tokens.join("");
  if (/(ipaddress|iphash|useragent|emailaddress|passwordhash|tokenhash|apikey)/.test(joined)) return true;
  if (raw.includes("mail")) return true; // email, e_mail, mail_address, …
  return false;
}

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

function safeValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "ja" : "nein";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    let s = v.trim();
    if (EMAIL_RE.test(s)) return "[ausgeblendet]"; // Wert-Ebene: E-Mails nie zeigen
    if (s.length > 120) s = `${s.slice(0, 120)}…`;
    return s || "—";
  }
  if (Array.isArray(v)) return `[${v.length} Einträge]`;
  if (typeof v === "object") return "{…}"; // nicht rekursiv ausrollen
  return "—";
}

function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== "object") return [];
  const out = [];
  for (const [k, v] of Object.entries(meta)) {
    if (isSensitiveKey(k)) continue; // sensible Felder komplett entfernen
    out.push([k, safeValue(v)]);
    if (out.length >= 12) break; // Deckel gegen riesige Flächen
  }
  return out;
}

// Aktive Filter → für die Anzeige „N aktiv" zählen.
const countActive = (f) => Object.values(f).filter((v) => String(v).trim() !== "").length;

function Party({ party }) {
  if (!party || (party.id == null && !party.name)) return <span className="adm-muted">—</span>;
  return (
    <span className="adm-party">
      {party.name ? <span className="adm-party-name">{party.name}</span> : null}
      {party.id != null ? <span className="adm-party-id">#{party.id}</span> : null}
      {party.type ? <span className="adm-party-type">{party.type}</span> : null}
    </span>
  );
}

export default function AuditLogPage() {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await listAuditLogs({ ...applied, page, page_size: PAGE_SIZE });
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) {
          setError(ERROR_MESSAGES[r.status] || GENERIC_ERROR);
        }
        setRows([]);
        setHasMore(false);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const list = selectRows(d);
      setRows(list);
      setHasMore(selectListHasMore(d, list.length, page, PAGE_SIZE, selectListTotal(d)));
    } catch {
      setError(GENERIC_ERROR);
      setRows([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  const setField = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const applyFilters = () => { setExpanded(null); setPage(1); setApplied(draft); };
  const resetFilters = () => { setExpanded(null); setPage(1); setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); };
  const goPrev = () => { if (page > 1) { setExpanded(null); setPage((p) => p - 1); } };
  const goNext = () => { if (hasMore) { setExpanded(null); setPage((p) => p + 1); } };
  const toggleExpand = (key) => setExpanded((cur) => (cur === key ? null : key));

  const activeCount = countActive(applied);
  const showPagination = !error && (rows.length > 0 || page > 1);

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>Audit-Logs</>}
        subtitle={<>Protokollierte Administrationsvorgänge. Nur Einsicht — keine Änderungen.</>}
        actions={(
          <><button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          <Icon n="refresh" s={14} /> Aktualisieren
        </button></>
        )}
      />

      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); applyFilters(); }}>
        <div className="adm-filter-field">
          <label htmlFor="f-action">Aktion</label>
          <select id="f-action" value={draft.action} onChange={(e) => setField("action", e.target.value)}>
            <option value="">Alle</option>
            {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
          </select>
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-result">Ergebnis</label>
          <select id="f-result" value={draft.result} onChange={(e) => setField("result", e.target.value)}>
            <option value="">Alle</option>
            {RESULT_OPTIONS.map((res) => <option key={res} value={res}>{RESULT_META[res][1]}</option>)}
          </select>
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-actor">Actor-ID</label>
          <input
            id="f-actor" type="text" inputMode="numeric" placeholder="z. B. 42"
            value={draft.actor_user_id} onChange={(e) => setField("actor_user_id", e.target.value)}
          />
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-target">Target-ID</label>
          <input
            id="f-target" type="text" inputMode="numeric" placeholder="z. B. 128"
            value={draft.target_user_id} onChange={(e) => setField("target_user_id", e.target.value)}
          />
        </div>
        <DateField id="f-from" label="Von" value={draft.from} onChange={(v) => setField("from", v)} />
        <DateField id="f-to" label="Bis" value={draft.to} onChange={(v) => setField("to", v)} />
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary btn-sm">
            <Icon n="filter" s={14} /> Anwenden
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters} disabled={loading && activeCount === 0}>
            Zurücksetzen
          </button>
        </div>
      </form>

      {loading ? (
        <div className="table-card">
          <ListSkeleton rows={6} label="Audit-Logs werden geladen …" />
        </div>
      ) : error ? (
        <div className="ce-card">
          <ErrorState
            title={error}
            action={(
              <button type="button" className="btn btn-outline btn-sm" onClick={load}>
                <Icon n="refresh" s={14} /> Erneut versuchen
              </button>
            )}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="ce-card">
          <EmptyState
            icon="layers"
            title={activeCount > 0 ? "Keine Treffer für diese Filter" : "Noch keine Audit-Logs"}
            text={activeCount > 0
              ? "Passen Sie die Filter an oder setzen Sie sie zurück."
              : "Sobald Administrationsvorgänge stattfinden, erscheinen sie hier."}
            action={activeCount > 0 ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters}>
                Filter zurücksetzen
              </button>
            ) : null}
          />
        </div>
      ) : (
        <>
          <div className="table-card adm-audit-table">
            <div className="table-scroll">
              <table>
                <caption className="sr-only">Protokollierte Administrationsvorgänge</caption>
                <thead>
                  <tr>
                    <th scope="col">Zeit</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Aktion</th>
                    <th scope="col">Target</th>
                    <th scope="col">Ergebnis</th>
                    <th scope="col" className="adm-col-action">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const key = rowKey(row, i);
                    const action = actionOf(row);
                    const result = resultOf(row);
                    const meta = sanitizeMetadata(metadataOf(row));
                    const knownAction = ACTION_LABELS[action];
                    const [resCls, resLabel] = RESULT_META[result] || statusFallback(result);
                    const isOpen = expanded === key;
                    return (
                      <React.Fragment key={key}>
                        <tr>
                          <td className="adm-td-time">{fmtTime(timeOf(row))}</td>
                          <td><Party party={partyOf(row, "actor")} /></td>
                          <td>
                            <span className="adm-action">{knownAction || action || "—"}</span>
                            {knownAction && <span className="adm-action-raw">{action}</span>}
                          </td>
                          <td><Party party={partyOf(row, "target")} /></td>
                          <td><span className={`badge ${resCls}`}>{resLabel}</span></td>
                          <td className="adm-col-action">
                            {meta.length > 0 ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => toggleExpand(key)}
                                aria-expanded={isOpen}
                              >
                                <Icon n={isOpen ? "chevron" : "chevronRight"} s={14} />
                                {isOpen ? "Verbergen" : "Details"}
                              </button>
                            ) : (
                              <span className="adm-muted">—</span>
                            )}
                          </td>
                        </tr>
                        {isOpen && meta.length > 0 && (
                          <tr className="adm-meta-row">
                            <td colSpan={6}>
                              <dl className="adm-meta-list">
                                {meta.map(([k, v]) => (
                                  <div className="adm-meta-item" key={k}>
                                    <dt>{k}</dt>
                                    <dd>{v}</dd>
                                  </div>
                                ))}
                              </dl>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobil: dieselben Angaben als Karten statt als gequetschte
              Sechs-Spalten-Tabelle. Metadaten öffnen dort direkt in der Karte. */}
          <ul className="adm-audit-cards">
            {rows.map((row, i) => {
              const key = rowKey(row, i);
              const action = actionOf(row);
              const result = resultOf(row);
              const meta = sanitizeMetadata(metadataOf(row));
              const knownAction = ACTION_LABELS[action];
              const [resCls, resLabel] = RESULT_META[result] || statusFallback(result);
              const isOpen = expanded === key;
              return (
                <li className="adm-scard" key={`card-${key}`}>
                  <div className="adm-scard-head">
                    <span className="adm-action">{knownAction || action || "—"}</span>
                    <span className={`badge ${resCls}`}>{resLabel}</span>
                  </div>
                  {knownAction && <span className="adm-action-raw">{action}</span>}
                  <dl className="adm-scard-kv">
                    <div><dt>Zeit</dt><dd className="adm-td-time">{fmtTime(timeOf(row))}</dd></div>
                    <div><dt>Actor</dt><dd><Party party={partyOf(row, "actor")} /></dd></div>
                    <div><dt>Target</dt><dd><Party party={partyOf(row, "target")} /></dd></div>
                  </dl>
                  {meta.length > 0 && (
                    <>
                      <div className="adm-scard-actions">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => toggleExpand(key)}
                          aria-expanded={isOpen}
                        >
                          <Icon n={isOpen ? "chevron" : "chevronRight"} s={14} />
                          {isOpen ? "Metadata verbergen" : "Metadata anzeigen"}
                        </button>
                      </div>
                      {isOpen && (
                        <dl className="adm-meta-list adm-meta-list-card">
                          {meta.map(([k, v]) => (
                            <div className="adm-meta-item" key={k}>
                              <dt>{k}</dt>
                              <dd>{v}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </>
                  )}
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
          <span className="adm-page-ind">Seite {page}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={goNext} disabled={loading || !hasMore}>
            Weiter <Icon n="chevronRight" s={14} />
          </button>
        </div>
      )}
    </div>
  );
}
