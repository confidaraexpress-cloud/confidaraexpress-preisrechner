import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { getAdminSupportRequest, updateAdminSupportRequest } from "../../api/adminApi";
import {
  SUPPORT_CONFLICT_RELOAD,
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
      return { ...d[k], customer: d.customer ?? d[k].customer, notifications: d.notifications ?? d[k].notifications };
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
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("de-DE");
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
  const [conflict, setConflict] = useState(null); // null | { current: object|null }

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
        <div className="table-card"><div className="empty"><div className="empty-icon">🔎</div><div className="empty-title">Supportanfrage nicht gefunden</div></div></div>
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
      {back}

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

      {/* 1) Kopfbereich */}
      <div className="adm-card">
        <div className="adm-card-head adm-page-head-row">
          <div>
            <h1 className="adm-title">{supportLabel(req)}</h1>
            <p className="adm-sub">{req.categoryLabel || "—"}</p>
          </div>
          <span className={`badge ${statusCls}`}>{req.statusLabel || statusFallback}</span>
        </div>
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

      {/* 2) Kunde */}
      <div className="adm-card">
        <h2 className="adm-card-title">Kunde</h2>
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

      {/* 3) Anfrage — Betreff und Nachricht sind Kundeneingabe und werden als
          REINER Text gerendert (React escaped sie; kein dangerouslySetInnerHTML). */}
      <div className="adm-card">
        <h2 className="adm-card-title">Anfrage</h2>
        <KV items={[["Betreff", dash(req.subject)]]} />
        <p className="adm-sup-message">{req.message || "—"}</p>
      </div>

      {/* 3b) E-Mail-Zustellung — zwei UNABHÄNGIGE Vorgänge, strikt getrennt dargestellt.
          Ein Fehler der einen Mail sagt nichts über die andere aus. */}
      <div className="adm-card">
        <h2 className="adm-card-title">E-Mail-Zustellung</h2>
        <div className="adm-sup-mailrows">
          <MailRow label={SUPPORT_MAIL_LABELS.internal} state={req.notifications?.internal} />
          <MailRow label={SUPPORT_MAIL_LABELS.customerConfirmation} state={req.notifications?.customerConfirmation} />
        </div>
        <p className="adm-sup-hint">
          Beide E-Mails werden unabhängig voneinander versendet. Ein Fehler bei einer der beiden
          hat die Anfrage nicht verhindert — das Ticket besteht in jedem Fall.
        </p>
      </div>

      {/* 4) Bearbeitung */}
      <div className="adm-card">
        <h2 className="adm-card-title">Bearbeitung</h2>

        <label className="adm-label" htmlFor="sup-status">Status</label>
        {statusEditable && statusOptions.length > 0 ? (
          <select
            id="sup-status"
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
          className="adm-sup-note"
          rows={4}
          value={editNote}
          disabled={saving}
          placeholder="Nur intern sichtbar — der Kunde sieht diesen Text nicht."
          onChange={(e) => setEditNote(e.target.value)}
        />
        <p className="adm-sup-hint">
          Der Vermerk ist ausschließlich intern. Ein leeres Feld löscht einen vorhandenen Vermerk.
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
  );
}
