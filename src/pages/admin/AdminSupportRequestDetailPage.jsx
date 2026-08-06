import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { getAdminSupportRequest, updateAdminSupportRequest, replyAdminSupportRequest } from "../../api/adminApi";
import { newIdempotencyKey } from "../../utils/idempotencyKey.mjs";
import {
  SUPPORT_CONFLICT_RELOAD,
  ADMIN_REPLY_ERROR,
  ADMIN_REPLY_PUBLIC_HINT,
  ADMIN_NOTE_INTERNAL_HINT,
  ADMIN_THREAD_EMPTY,
  ADMIN_REPLY_MAX,
  adminReplyState,
  supportReplyStateMeta,
  SUPPORT_MAIL_LABELS,
  SUPPORT_CONFLICT_TEXT,
  SUPPORT_DETAIL_ERROR,
  isSupportNoOpResponse,
  isSupportNoteDirty,
  isSupportStatusDirty,
  isSupportStatusEditable,
  normalizeSupportRequest,
  readSupportConflict,
  supportCustomerCell,
  supportLabel,
  supportStatusMeta,
  supportStatusOptions,
} from "../../utils/adminSupportView.mjs";

const ERROR_MESSAGES = {
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: SUPPORT_DETAIL_ERROR,
};

// Fehlertexte für das Speichern. 409 ist KEIN klassischer Fehler, sondern der
// Optimistic-Locking-Konflikt → eigener Banner (kein Text hier).
const SAVE_ERRORS = {
  400: "Die Änderung ist ungültig oder nicht erlaubt.",
  404: "Die Anfrage wurde nicht gefunden oder existiert nicht mehr.",
  409: "Dieser Statuswechsel ist nicht zulässig.",
  429: "Zu viele Admin-Aktionen. Bitte kurz warten.",
  500: "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  default: "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
};

// Response-Container defensiv entpacken; die Feld-Normalisierung übernimmt zentral
// normalizeSupportRequest. Kunden-/Benachrichtigungsdaten liegen im Detailvertrag
// NEBEN der Anfrage — sie werden hier mit hineingezogen, damit die Normalisierung
// eine vollständige kanonische Form erzeugt.
function selectRequest(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  for (const k of ["supportRequest", "support_request", "request", "data"]) {
    if (d[k] && typeof d[k] === "object" && !Array.isArray(d[k])) {
      return { ...d[k], customer: d.customer ?? d[k].customer, notifications: d.notifications ?? d[k].notifications, messages: d.messages ?? d[k].messages };
    }
  }
  return d;
}

const shipmentPath = (id) => `/admin/shipments/${encodeURIComponent(id)}`;
const invoicePath  = (id) => `/admin/invoices/${encodeURIComponent(id)}`;

const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  // Ohne Sekunden — dieselbe Regel wie dtDE() im Kundenportal (Paket C). Der
  // Zeitpunkt bleibt identisch, nur die Darstellung ist ruhiger. Der
  // Rohwert-Fallback für unparsbare Werte bleibt unverändert.
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString("de-DE", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Eine Zeile je Mailvorgang. Der technische Providerhinweis wird nur angezeigt, wenn er
// vorhanden ist — als reiner Text (React escaped ihn), nie als Markup.
function MailRow({ label, state }) {
  const s = state || { sentAt: null, failed: false, error: null };
  const text = s.failed
    ? "Zustellung fehlgeschlagen"
    : s.sentAt
      ? `Versendet am ${fmtDateTime(s.sentAt)}`
      : "Noch nicht bestätigt";
  return (
    <div className={`adm-sup-mailrow${s.failed ? " adm-sup-mailrow-fail" : ""}`}>
      <span className="adm-sup-mailrow-name">{label}</span>
      <span className="adm-sup-mailrow-state">{text}</span>
      {s.failed && s.error && <span className="adm-sup-mailrow-err">{s.error}</span>}
    </div>
  );
}

function KV({ items }) {
  return (
    <dl className="adm-kv">
      {items.map(([k, v]) => (
        <div className="adm-kv-item" key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminSupportRequestDetailPage() {
  const { id } = useParams();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [req, setReq] = useState(null); // kanonische Form
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [editStatus, setEditStatus] = useState("");
  const [editNote, setEditNote] = useState("");
  const [baseline, setBaseline] = useState({ status: "", adminNote: null, revision: undefined });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // { type, text }
  // Konflikt: der Server liefert bei 409 additiv den aktuellen Stand mit. Er wird NIE
  // automatisch übernommen — der Admin entscheidet bewusst.
  const [conflict, setConflict] = useState(null);
  // Öffentliche Antwort — bewusst getrennt vom Status-/Vermerk-Formular, damit
  // eine interne Notiz nie versehentlich als Kundenantwort gespeichert wird.
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState("");
  const replyInFlight = useRef(false);
  // Schlüssel der laufenden Absendeaktion — überlebt Fehlversuche, damit eine
  // Wiederholung nach verlorenem Response keine zweite Kundenantwort erzeugt.
  const replyIdemKey = useRef(null);

  const adopt = useCallback((canonical) => {
    setReq(canonical);
    const status = canonical.status ?? "";
    const adminNote = canonical.adminNote ?? null;
    setBaseline({ status, adminNote, revision: canonical.revision });
    setEditStatus(status);
    setEditNote(adminNote ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      const r = await getAdminSupportRequest(id);
      if (!mountedRef.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        if (r.status === 404) { setNotFound(true); setReq(null); return; }
        setError(ERROR_MESSAGES[r.status] || SUPPORT_DETAIL_ERROR);
        setReq(null);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!mountedRef.current) return;
      const canonical = normalizeSupportRequest(selectRequest(d));
      if (canonical) adopt(canonical);
      else { setReq(null); setError(SUPPORT_DETAIL_ERROR); }
    } catch {
      if (mountedRef.current) { setError(SUPPORT_DETAIL_ERROR); setReq(null); }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [id, adopt]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSaveMsg(null); setConflict(null); }, [id]);

  // „Aktuellen Stand laden" nach Konflikt: Serverrealität neu holen und das Formular
  // bewusst darauf zurücksetzen (kein Merge, kein stilles Overwrite).
  const reloadCurrent = useCallback(async () => {
    setConflict(null);
    setSaveMsg(null);
    await load();
  }, [load]);

  const back = (
    <Link to="/admin/support-requests" className="adm-back">
      <Icon n="chevronLeft" s={16} /> Zurück zur Übersicht
    </Link>
  );

  // Öffentliche Antwort senden. Doppelklickschutz über eine Ref (kein State —
  // sonst könnte ein zweiter Klick vor dem Re-Render durchrutschen). Nach Erfolg
  // wird der Vorgang neu geladen, damit Verlauf und Antwortbedarf stimmen.
  const submitReply = async (e) => {
    e.preventDefault();
    const state = adminReplyState(reply);
    if (!state.valid || replyInFlight.current) return;
    replyInFlight.current = true;
    setReplying(true);
    setReplyError("");
    // Einmal je bewusster Absendeaktion erzeugt; bei einem Netzwerkfehler bleibt
    // derselbe Schlüssel bestehen, weil dann unklar ist, ob die Antwort bereits
    // gespeichert (und die Kundenbenachrichtigung ausgelöst) wurde.
    if (!replyIdemKey.current) replyIdemKey.current = newIdempotencyKey();
    try {
      const r = await replyAdminSupportRequest(id, reply.trim(), replyIdemKey.current);
      if (!r.ok) {
        if (r.status !== 401 && r.status !== 403) setReplyError(ADMIN_REPLY_ERROR);
        return;
      }
      replyIdemKey.current = null;
      setReply("");
      await reloadCurrent();
    } catch {
      setReplyError(ADMIN_REPLY_ERROR);
    } finally {
      replyInFlight.current = false;
      setReplying(false);
    }
  };

  if (loading) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card"><div className="loading-center"><span className="spinner spinner-dark" /> Wird geladen…</div></div>
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card"><div className="empty"><div className="empty-icon" aria-hidden="true"><Icon n="search" s={24} /></div><div className="empty-title">Supportanfrage nicht gefunden</div></div></div>
      </div>
    );
  }
  if (error || !req) {
    return (
      <div className="adm-page">
        {back}
        <div className="adm-loaderr">
          <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{error || SUPPORT_DETAIL_ERROR}</div>
          <div className="adm-loaderr-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={load}>
              <Icon n="refresh" s={14} /> Erneut versuchen
            </button>
            <Link className="btn btn-outline btn-sm" to="/admin/support-requests">Zurück zur Übersicht</Link>
          </div>
        </div>
      </div>
    );
  }

  const currentStatus = req.status;
  const [statusCls, statusFallback] = supportStatusMeta(currentStatus);
  const statusEditable = isSupportStatusEditable(currentStatus);
  const statusOptions = supportStatusOptions(currentStatus);
  const revision = baseline.revision;
  const cust = supportCustomerCell(req);
  const uid = req.customer?.id;
  // handledBy ist { id, name } — nie direkt rendern.
  const handlerName = req.handledBy && typeof req.handledBy === "object"
    ? (req.handledBy.name || (req.handledBy.id != null ? `Admin #${req.handledBy.id}` : "—"))
    : dash(req.handledBy);

  const statusDirty = isSupportStatusDirty(baseline.status, editStatus);
  const noteDirty = isSupportNoteDirty(baseline.adminNote, editNote);
  const dirty = statusDirty || noteDirty;
  const missingRevision = revision === undefined;
  const canSave = dirty && !conflict && !saving && !missingRevision;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveMsg(null);
    setConflict(null);
    try {
      const payload = { revision };
      if (statusDirty) payload.status = editStatus;
      if (noteDirty) payload.adminNote = editNote; // "" = bewusst leeren
      const resp = await updateAdminSupportRequest(id, payload);
      if (!mountedRef.current) return;
      if (resp.ok) {
        let d = {};
        try { d = await resp.json(); } catch { d = {}; }
        if (isSupportNoOpResponse(d)) {
          // No-op: Revision NICHT erfinden, Formular auf die Baseline zurück.
          setEditStatus(baseline.status);
          setEditNote(baseline.adminNote ?? "");
          setSaveMsg({ type: "info", text: "Keine Änderung notwendig." });
          return;
        }
        const canonical = normalizeSupportRequest(selectRequest(d));
        if (canonical && canonical.revision !== undefined) adopt(canonical);
        else await load(); // Response ohne verwertbare Ressource → Serverstand neu holen
        if (mountedRef.current) setSaveMsg({ type: "success", text: "Änderung gespeichert." });
        return;
      }
      if (resp.status === 401 || resp.status === 403) return; // zentraler Redirect
      if (resp.status === 409) {
        // Zwei verschiedene 409: Optimistic-Locking-Konflikt ODER unzulässiger
        // Statuswechsel. Nur der erste liefert `current` und bekommt den Banner.
        let body = {};
        try { body = await resp.json(); } catch { body = {}; }
        const c = readSupportConflict(409, body);
        if (c.conflict) {
          // Lokale Eingabe BEHALTEN, nichts automatisch überschreiben, lokale
          // Revision NICHT erhöhen. Der Serverstand wird nur angezeigt.
          setConflict({ current: c.current });
          return;
        }
        setSaveMsg({ type: "error", text: SAVE_ERRORS[409] });
        return;
      }
      setSaveMsg({ type: "error", text: SAVE_ERRORS[resp.status] || SAVE_ERRORS.default });
    } catch {
      if (mountedRef.current) setSaveMsg({ type: "error", text: SAVE_ERRORS.default });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const alertClass = saveMsg
    ? (saveMsg.type === "success" ? "alert-success" : saveMsg.type === "info" ? "alert-info" : "alert-error")
    : "";
  const alertIcon = saveMsg ? (saveMsg.type === "success" ? "check" : saveMsg.type === "info" ? "info" : "x") : "x";

  return (
    <div className="adm-page">
      {/* Kopfbereich — derselbe Seitenkopf wie in den Adminlisten. Der
          Antwortbedarf wird serverseitig aus dem öffentlichen Verlauf
          abgeleitet, nicht aus updated_at (das auch ein interner Vermerk
          verändert). */}
      <PageHeader
        variant="admin"
        eyebrow="Konto & Support"
        backLink={back}
        title={supportLabel(req)}
        subtitle={req.categoryLabel || "—"}
        meta={(
          <>
            <span className={`badge ${statusCls}`}>{req.statusLabel || statusFallback}</span>
            {supportReplyStateMeta(req) && (
              <span className={`badge ${supportReplyStateMeta(req)[0]}`}>
                {supportReplyStateMeta(req)[1]}
              </span>
            )}
          </>
        )}
      />

      {/* Scope-Trennung: unmissverständlich, dass das Bearbeiten hier NICHTS an die
          Kundschaft sendet und nichts an Sendung, Rechnung oder Zahlung ändert. */}
      <div className="adm-scope-note" role="note">
        <Icon n="info" s={18} />
        <div>
          <strong>Interner Bearbeitungsstand.</strong> Status und Vermerk sind rein organisatorisch.
          Es wird <strong>keine</strong> Nachricht an den Kunden versendet und <strong>nichts</strong> an
          Sendungen, Rechnungen oder Zahlungen verändert. Die Antwort an den Kunden erfolgt per E-Mail
          an die unten genannte Adresse.
        </div>
      </div>

      {saveMsg && (
        <div className={`alert ${alertClass}`}>
          <Icon n={alertIcon} s={16} />{saveMsg.text}
        </div>
      )}

      {conflict && (
        <div className="adm-conflict" role="alert" aria-live="assertive">
          <div className="adm-conflict-text">
            <Icon n="refresh" s={16} />
            <span>
              {SUPPORT_CONFLICT_TEXT} Ihre Änderung wurde <strong>nicht</strong> gespeichert.
              {conflict.current && (
                <> Aktueller Stand: <strong>{conflict.current.statusLabel || supportStatusMeta(conflict.current.status)[1]}</strong>
                  {" "}(Revision {String(conflict.current.revision)})
                  {conflict.current.adminNote ? ", interner Vermerk vorhanden" : ""}.</>
              )}
            </span>
          </div>
          <div className="adm-conflict-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={reloadCurrent} disabled={saving}>
              <Icon n="refresh" s={14} /> {SUPPORT_CONFLICT_RELOAD}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setConflict(null)} disabled={saving}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="adm-cards">
        {/* 1) Metadaten des Vorgangs. Titel, Kategorie, Status und Antwortbedarf
            stehen seit Paket E im gemeinsamen Seitenkopf (oben) — hier stand
            zuvor ein zweiter Seitentitel mitten auf der Seite. */}
        <div className="adm-card">
          <div className="adm-card-body">
            <KV items={[
              ["Eingegangen", fmtDateTime(req.createdAt)],
              ["Zuletzt geändert", fmtDateTime(req.updatedAt)],
              ["Zuletzt bearbeitet von", handlerName],
              ["Bearbeitet am", fmtDateTime(req.handledAt)],
              // Nur bei tatsächlich geschlossenen Anfragen — sonst keine leere Zeile erzwingen.
              ...(req.closedAt ? [["Geschlossen am", fmtDateTime(req.closedAt)]] : []),
              ["Revision", missingRevision ? "—" : String(revision)],
              // Optionale, vorbereitete Zuordnungen: erscheinen ausschließlich, wenn gesetzt.
              // Es wird keine Platzhalterkarte und keine leere Zeile erzeugt.
              ...(req.shipmentId != null
                ? [["Sendung", <Link to={shipmentPath(req.shipmentId)}>Sendung #{req.shipmentId}</Link>]]
                : []),
              ...(req.invoiceId != null
                ? [["Rechnung", <Link to={invoicePath(req.invoiceId)}>Rechnung #{req.invoiceId}</Link>]]
                : []),
            ]} />
          </div>
        </div>

        {/* 2) Kunde */}
        <div className="adm-card">
          <h2 className="adm-card-title">Kunde</h2>
          <div className="adm-card-body">
            <KV items={[
              ["Unternehmen", uid != null && cust.known
                ? <Link to={`/admin/users/${encodeURIComponent(uid)}`}>{cust.primary}</Link>
                : cust.primary],
              ["Ansprechpartner", dash(req.customer?.name)],
              ["Kundennummer", dash(req.customer?.customerNumber)],
              ["E-Mail", req.customer?.email
                ? <a href={`mailto:${req.customer.email}`}>{req.customer.email}</a>
                : "—"],
            ]} />
          </div>
        </div>

        {/* 3) Anfrage — Betreff und Nachricht sind Kundeneingabe und werden als
            REINER Text gerendert (React escaped sie; kein dangerouslySetInnerHTML). */}
        <div className="adm-card">
          <h2 className="adm-card-title">Anfrage</h2>
          <div className="adm-card-body">
            <KV items={[["Betreff", dash(req.subject)]]} />
            <p className="adm-sup-message">{req.message || "—"}</p>
          </div>
        </div>

        {/* 3a) Öffentlicher Nachrichtenverlauf — GENAU das, was der Kunde sieht.
            Interne Vermerke erscheinen hier nie: der Server liefert ausschließlich
            Nachrichten mit visibility='public' aus. Alle Texte sind Freitext und
            werden als reiner Text gerendert (kein dangerouslySetInnerHTML). */}
        <div className="adm-card">
          <h2 className="adm-card-title">Nachrichtenverlauf</h2>
          <div className="adm-card-body">
            {Array.isArray(req.messages) && req.messages.length > 0 ? (
              <ol className="adm-sup-thread">
                {req.messages.map((m, i) => (
                  <li
                    key={m.id != null ? `m${m.id}` : `original-${i}`}
                    className={`adm-sup-msg adm-sup-msg-${m.authorRole === "admin" ? "admin" : "customer"}`}
                  >
                    <div className="adm-sup-msg-head">
                      <span className="adm-sup-msg-author">
                        {m.authorRole === "admin" ? "ConfidaraExpress Support" : "Kunde"}
                      </span>
                      <span className="adm-sup-msg-time">{fmtDateTime(m.createdAt)}</span>
                    </div>
                    <p className="adm-sup-msg-body">{m.message}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="adm-sup-hint">{ADMIN_THREAD_EMPTY}</p>
            )}

            {/* Öffentliche Antwort — eigener Endpunkt, klar als kundensichtbar
                gekennzeichnet. Bewusst getrennt vom internen Vermerk weiter unten. */}
            <form className="adm-sup-replyform" onSubmit={submitReply}>
              <label className="adm-label" htmlFor="sup-reply">Öffentlich antworten</label>
              <textarea
                id="sup-reply"
                className="field-input field-textarea adm-sup-note"
                rows={4}
                value={reply}
                maxLength={ADMIN_REPLY_MAX}
                disabled={replying}
                placeholder="Ihre Antwort an den Kunden …"
                onChange={(e) => {
                  // Geänderter Text = andere Absendeaktion → neuer Schlüssel.
                  if (replyIdemKey.current) replyIdemKey.current = null;
                  setReply(e.target.value);
                }}
              />
              <p className="adm-sup-hint adm-sup-public">
                <Icon n="mail" s={13} /> {ADMIN_REPLY_PUBLIC_HINT}
              </p>
              {replyError && (
                <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{replyError}</div>
              )}
              <div className="adm-sup-actions">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={!adminReplyState(reply).valid || replying}
                >
                  {replying ? <><span className="spinner" /> Wird gesendet …</> : <>Antwort an Kunden senden</>}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* 3b) E-Mail-Zustellung — zwei UNABHÄNGIGE Vorgänge, strikt getrennt dargestellt.
            Ein Fehler der einen Mail sagt nichts über die andere aus. */}
        <div className="adm-card">
          <h2 className="adm-card-title">E-Mail-Zustellung</h2>
          <div className="adm-card-body">
            <div className="adm-sup-mailrows">
              <MailRow label={SUPPORT_MAIL_LABELS.internal} state={req.notifications?.internal} />
              <MailRow label={SUPPORT_MAIL_LABELS.customerConfirmation} state={req.notifications?.customerConfirmation} />
            </div>
            <p className="adm-sup-hint">
              Beide E-Mails werden unabhängig voneinander versendet. Ein Fehler bei einer der beiden
              hat die Anfrage nicht verhindert — das Ticket besteht in jedem Fall.
            </p>
          </div>
        </div>

        {/* 4) Bearbeitung */}
        <div className="adm-card">
          <h2 className="adm-card-title">Bearbeitung</h2>
          <div className="adm-card-body">

            <label className="adm-label" htmlFor="sup-status">Status</label>
            {statusEditable && statusOptions.length > 0 ? (
              <select
                id="sup-status"
                className="field-select adm-edit-select"
                value={editStatus}
                disabled={saving}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <p className="adm-sup-hint">
                Für diesen Status ist kein Wechsel hinterlegt. Der interne Vermerk bleibt bearbeitbar.
              </p>
            )}

            <label className="adm-label" htmlFor="sup-note">Interner Vermerk</label>
            <textarea
              id="sup-note"
              className="field-input field-textarea adm-sup-note"
              rows={4}
              value={editNote}
              disabled={saving}
              placeholder="Nur intern sichtbar — der Kunde sieht diesen Text nicht."
              onChange={(e) => setEditNote(e.target.value)}
            />
            <p className="adm-sup-hint adm-sup-internal">
              <Icon n="lock" s={13} /> {ADMIN_NOTE_INTERNAL_HINT} Ein leeres Feld löscht einen
              vorhandenen Vermerk.
            </p>

            {missingRevision && (
              <div className="alert alert-error" role="alert">
                <Icon n="x" s={16} />
                Der Bearbeitungsstand ist unvollständig geladen. Bitte laden Sie die Anfrage neu,
                bevor Sie speichern.
              </div>
            )}

            <div className="adm-sup-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!canSave} aria-busy={saving || undefined}>
                {saving ? <><span className="spinner" /> Wird gespeichert …</> : "Änderung speichern"}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!dirty || saving}
                onClick={() => { setEditStatus(baseline.status); setEditNote(baseline.adminNote ?? ""); setSaveMsg(null); }}
              >
                Verwerfen
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
