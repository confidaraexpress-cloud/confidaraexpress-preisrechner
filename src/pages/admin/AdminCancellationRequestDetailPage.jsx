import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { getAdminCancellationRequest, updateAdminCancellationRequest } from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { serviceLabel, shipmentStatusMeta } from "../../utils/adminShipments";
import {
  cancellationStatusMeta,
  cancellationStatusOptions,
  isCancellationStatusEditable,
  isTerminalCancellationStatus,
  isStatusDirty,
  isNoteDirty,
  isNoOpResponse,
  normalizeCancellationRequest,
  readCancellationConflict,
  applyConflictState,
  cancellationCustomerCell,
  cancellationShipmentCell,
  cancellationLabel,
  CANCELLATION_CONFLICT_TEXT,
  CANCELLATION_CONFLICT_RELOAD,
  CANCELLATION_DECISION_DIALOG,
} from "../../utils/adminCancellations.mjs";

const ERROR_MESSAGES = {
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Die Stornierungsanfrage konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Die Stornierungsanfrage konnte nicht geladen werden. Bitte versuchen Sie es erneut.";

// Fehlertexte für das Speichern (Status/Notiz). 409 ist KEIN klassischer Fehler,
// sondern der Optimistic-Locking-Konflikt → eigener Banner (kein Text hier).
const SAVE_ERRORS = {
  400: "Die Änderung ist ungültig oder nicht erlaubt.",
  404: "Die Anfrage wurde nicht gefunden oder existiert nicht mehr.",
  422: "Die Änderung ist ungültig oder nicht erlaubt.",
  429: "Zu viele Admin-Aktionen. Bitte kurz warten.",
  500: "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  default: "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
};

// Response-Container defensiv entpacken; die Feld-Normalisierung übernimmt
// zentral normalizeCancellationRequest.
function selectRequest(d) {
  if (d && typeof d === "object" && !Array.isArray(d)) {
    for (const k of ["cancellation_request", "cancellationRequest", "request", "data"]) {
      if (d[k] && typeof d[k] === "object" && !Array.isArray(d[k])) return d[k];
    }
    return d;
  }
  return null;
}

const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");
const moneyOrDash = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? money(v) : "—");

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

function routeOf(from, to) {
  if (!from && !to) return null;
  return `${(from ? String(from) : "?").toUpperCase()} → ${(to ? String(to) : "?").toUpperCase()}`;
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

export default function AdminCancellationRequestDetailPage() {
  const { id } = useParams();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [req, setReq] = useState(null); // kanonische Form
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  // Editier-State (nur Anzeige-Formular; Backend bleibt maßgeblich).
  const [editStatus, setEditStatus] = useState("");
  const [editNote, setEditNote] = useState("");
  const [baseline, setBaseline] = useState({ status: "", adminNote: null, revision: undefined });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // { type, text }
  // Konflikt: der Server liefert bei 409 additiv den aktuellen Bearbeitungsstand
  // mit. Er wird NIE automatisch übernommen — der Admin entscheidet bewusst.
  const [conflict, setConflict] = useState(null); // null | { current: object|null }
  // Bestätigungsdialog für terminale Entscheidungen (accepted/rejected).
  const [decision, setDecision] = useState(null); // null | "accepted" | "rejected"

  // Übernimmt eine kanonische Anfrage in State + Formular-Baseline.
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
      const r = await getAdminCancellationRequest(id);
      if (!mountedRef.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        if (r.status === 404) { setNotFound(true); setReq(null); return; }
        setError(ERROR_MESSAGES[r.status] || GENERIC_ERROR);
        setReq(null);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!mountedRef.current) return;
      const canonical = normalizeCancellationRequest(selectRequest(d));
      if (canonical) { adopt(canonical); } else { setReq(null); setError(GENERIC_ERROR); }
    } catch {
      if (mountedRef.current) { setError(GENERIC_ERROR); setReq(null); }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [id, adopt]);

  useEffect(() => { load(); }, [load]);

  // Beim Wechsel auf eine andere Anfrage Meldung/Konflikt lösen.
  useEffect(() => { setSaveMsg(null); setConflict(null); setDecision(null); }, [id]);

  // „Aktuelle Version laden" nach Konflikt: Backend-Realität neu holen, Formular
  // bewusst auf den Serverstand zurücksetzen (kein Merge, kein stilles
  // Overwrite; der Admin entscheidet neu). Ersetzt bewusst die lokale Eingabe.
  const reloadCurrent = useCallback(async () => {
    setConflict(null);
    setSaveMsg(null);
    await load();
  }, [load]);

  const back = (
    <Link to="/admin/cancellation-requests" className="adm-back">
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
        <div className="table-card"><div className="empty"><div className="empty-icon" aria-hidden="true"><Icon n="search" s={24} /></div><div className="empty-title">Stornierungsanfrage nicht gefunden</div></div></div>
      </div>
    );
  }
  if (error || !req) {
    return (
      <div className="adm-page">
        {back}
        <div className="adm-loaderr">
          <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{error || GENERIC_ERROR}</div>
          <div className="adm-loaderr-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={load}>
              <Icon n="refresh" s={14} /> Erneut versuchen
            </button>
            <Link className="btn btn-outline btn-sm" to="/admin/cancellation-requests">Zurück zur Übersicht</Link>
          </div>
        </div>
      </div>
    );
  }

  const currentStatus = req.status;
  const [statusCls, statusLabel] = cancellationStatusMeta(currentStatus);
  const statusEditable = isCancellationStatusEditable(currentStatus);
  const terminal = isTerminalCancellationStatus(currentStatus);
  const statusOptions = cancellationStatusOptions(currentStatus);
  const sid = req.shipment?.id;
  const route = routeOf(req.shipment?.fromCountry, req.shipment?.toCountry);
  const revision = baseline.revision;
  const cust = cancellationCustomerCell(req);
  const ship = cancellationShipmentCell(req);
  // reviewedBy ist { id, name } — nie direkt rendern.
  const reviewerName = req.reviewedBy && typeof req.reviewedBy === "object"
    ? (req.reviewedBy.name || (req.reviewedBy.id != null ? `Admin #${req.reviewedBy.id}` : "—"))
    : dash(req.reviewedBy);

  // Getrennter Dirty-State: Status (nur nicht-terminal) und Notiz (immer).
  const statusDirty = isStatusDirty(baseline.status, editStatus);
  const noteDirty = isNoteDirty(baseline.adminNote, editNote);
  const dirty = statusDirty || noteDirty;
  const missingRevision = revision === undefined;
  // Speichern nur bei echter Änderung, ohne offenen Konflikt, mit bekannter
  // Revision und wenn gerade nichts läuft.
  const canSave = dirty && !conflict && !saving && !missingRevision;
  // Eine terminale Entscheidung (Angenommen/Abgelehnt) wird erst nach bewusster
  // Bestätigung ausgeführt; ein reiner Notiz- oder Zwischenstatuswechsel nicht.
  const pendingDecision = statusDirty && (editStatus === "accepted" || editStatus === "rejected")
    ? editStatus : null;
  const requestSave = () => {
    if (!canSave) return;
    if (pendingDecision) { setDecision(pendingDecision); return; }
    save();
  };

  const save = async () => {
    if (!canSave) return;
    setDecision(null);
    setSaving(true);
    setSaveMsg(null);
    setConflict(false);
    try {
      const payload = { revision };
      if (statusDirty) payload.status = editStatus;
      if (noteDirty) payload.adminNote = editNote; // "" = bewusst leeren
      const resp = await updateAdminCancellationRequest(id, payload);
      if (!mountedRef.current) return;
      if (resp.ok) {
        let d = {};
        try { d = await resp.json(); } catch { d = {}; }
        if (isNoOpResponse(d)) {
          // No-op: Response übernehmen, Revision NICHT erfinden, Dirty→false.
          setEditStatus(baseline.status);
          setEditNote(baseline.adminNote ?? "");
          setSaveMsg({ type: "info", text: "Keine Änderung notwendig." });
          return;
        }
        const canonical = normalizeCancellationRequest(selectRequest(d));
        if (canonical && canonical.revision !== undefined) {
          adopt(canonical); // frische Revision/Status/Notiz aus der Response
        } else {
          await load(); // Response ohne verwertbare Ressource → Serverstand neu holen
        }
        if (mountedRef.current) setSaveMsg({ type: "success", text: "Änderung gespeichert." });
        return;
      }
      if (resp.status === 401 || resp.status === 403) return; // zentraler Redirect
      if (resp.status === 409) {
        // Optimistic-Locking-Konflikt: lokale Eingabe BEHALTEN, nichts automatisch
        // überschreiben, lokale Revision NICHT erhöhen. Der vom Server mitgelieferte
        // aktuelle Stand wird nur angezeigt — übernommen wird er erst auf Klick.
        let body = {};
        try { body = await resp.json(); } catch { body = {}; }
        const c = readCancellationConflict(409, body);
        setConflict({ current: c.current });
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
      {/* 1) Kopfbereich — derselbe Seitenkopf wie in den Adminlisten. Er steht
          jetzt VOR dem Scope-Hinweis und dem Konfliktbanner: erst weiß man,
          welchen Vorgang man ansieht, dann was für ihn gilt. */}
      <PageHeader
        variant="admin"
        eyebrow="Verwaltung"
        backLink={back}
        title={`Stornierungsanfrage ${cancellationLabel(req).replace("Anfrage ", "")}`}
        subtitle={(
          <span className="adm-detail-sub">
            <span>{cust.primary}</span>
            {ship.known && <span>{ship.primary}</span>}
          </span>
        )}
        meta={(
          <>
            <span className={`badge ${statusCls}`}>{statusLabel}</span>
            <span className="adm-chip"><Icon n="calendar" s={13} /> Eingegangen {fmtDateTime(req.createdAt)}</span>
            <span className="adm-chip"><Icon n="clock" s={13} /> Zuletzt geändert {fmtDateTime(req.updatedAt)}</span>
          </>
        )}
      />

      {/* Scope-Trennung: unmissverständlich, dass dies KEINE echte Stornierung
          beim Carrier/JUMiNGO ist und keine Erstattung/Gutschrift auslöst. */}
      <div className="adm-scope-note" role="note">
        <Icon n="info" s={18} />
        <div>
          <strong>Interner Verwaltungsvorgang.</strong> Das Bearbeiten dieser Anfrage ändert nur ihren
          internen Bearbeitungsstatus bzw. Vermerk. Es wird <strong>keine</strong> Stornierung beim
          Carrier/JUMiNGO ausgelöst und <strong>keine</strong> Erstattung, Gutschrift oder
          Rechnungskorrektur vorgenommen.
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
              {CANCELLATION_CONFLICT_TEXT} Ihre Änderung wurde <strong>nicht</strong> gespeichert.
              {conflict.current && (
                <> Aktueller Stand: <strong>{cancellationStatusMeta(conflict.current.status)[1]}</strong>
                  {" "}(Revision {String(conflict.current.revision)})
                  {conflict.current.adminNote ? ", interner Vermerk vorhanden" : ""}.</>
              )}
            </span>
          </div>
          <div className="adm-conflict-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={reloadCurrent} disabled={saving}>
              <Icon n="refresh" s={14} /> {CANCELLATION_CONFLICT_RELOAD}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setConflict(null)} disabled={saving}>
              Abbrechen
            </button>
          </div>
        </div>
      )}


      <div className="adm-cards">
        {/* 2) Kundenwunsch / Grund (voller Text, read-only) */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="mail" s={17} /> Kundenwunsch</div>
          <div className="adm-card-body">
            {req.reason && String(req.reason).trim() !== ""
              ? <p className="adm-reason">{String(req.reason)}</p>
              : <p className="adm-addr-note">Kein Grund angegeben.</p>}
          </div>
        </div>

        {/* 3) Sendungsdaten (read-only, aus dem Join) */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="package" s={17} /> Sendung</div>
          <div className="adm-card-body">
            <KV items={[
              ["Bestellnummer", ship.known
                ? <span className="adm-mono">{ship.primary}</span>
                : <span className="adm-muted">{ship.primary}</span>],
              ["Carrier", req.shipment?.carrier ? resolveCarrierName(req.shipment.carrier) : "—"],
              ["Serviceart", serviceLabel(req.shipment?.serviceType)],
              ["Sendungsstatus", (() => {
                const sv = req.shipment?.status;
                if (sv == null || String(sv).trim() === "") return "—";
                const [cls, label] = shipmentStatusMeta(sv);
                return <span className={`badge ${cls}`}>{label}</span>;
              })()],
              ["Route", route || "—"],
              ["Preis", moneyOrDash(req.shipment?.price)],
            ]} />
            {sid != null && String(sid).trim() !== "" && (
              <div className="adm-track-link">
                <Link className="btn btn-outline btn-sm" to={`/admin/shipments/${encodeURIComponent(sid)}`}>
                  <Icon n="arrowRight" s={14} /> Sendung öffnen
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* 4) Kundendaten (read-only, aus dem Join) */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="idcard" s={17} /> Kunde</div>
          <div className="adm-card-body">
            <KV items={[
              ["Firma", cust.known ? cust.primary : <span className="adm-muted">{cust.primary}</span>],
              ["Ansprechpartner", dash(req.customer?.name)],
              ["Kundennummer", dash(req.customer?.customerNumber)],
              ["E-Mail", dash(req.customer?.email)],
            ]} />
            {req.customer?.id != null && (
              <div className="adm-track-link">
                <Link className="btn btn-outline btn-sm" to={`/admin/users/${encodeURIComponent(req.customer.id)}`}>
                  <Icon n="arrowRight" s={14} /> Kundenkonto öffnen
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* 5) Interne Bearbeitung — Status (nur nicht-terminal) + Notiz (immer) */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="shieldCheck" s={17} /> Interne Bearbeitung</div>
          <div className="adm-card-body">
            {/* Statusbereich */}
            {statusEditable ? (
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="cx-status">Status</label>
                <select
                  id="cx-status"
                  className="adm-edit-select"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  disabled={saving}
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <span className="adm-edit-hint">Angenommen/Abgelehnt sind endgültig (kein Reopen).</span>
              </div>
            ) : (
              <div className="adm-edit-field">
                <span className="adm-edit-label">Status</span>
                <div><span className={`badge ${statusCls}`}>{statusLabel}</span></div>
                <span className="adm-edit-hint">
                  {terminal
                    ? "Der Bearbeitungsstatus ist abgeschlossen. Interne Notizen können weiterhin ergänzt werden."
                    : "Für diesen Status ist kein Wechsel vorgesehen. Interne Notizen können weiterhin ergänzt werden."}
                </span>
              </div>
            )}

            {/* Notizbereich — IMMER bearbeitbar (auch bei accepted/rejected) */}
            <div className="adm-edit-field" style={{ marginTop: 16 }}>
              <label className="adm-edit-label" htmlFor="cx-note">Interner Vermerk</label>
              <textarea
                id="cx-note"
                className="adm-note-input"
                rows={4}
                placeholder="Interne Notiz zur Bearbeitung (nur für Admins sichtbar)…"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                disabled={saving}
              />
              <span className="adm-edit-hint">Nur intern sichtbar. Wird nicht an den Kunden übermittelt. Leeren ist möglich.</span>
            </div>

            <div className="adm-support" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={requestSave} disabled={!canSave}>
                {saving
                  ? <><span className="spinner spinner-dark" /> Wird gespeichert…</>
                  : <><Icon n="check" s={14} /> Änderung speichern</>}
              </button>
              {!dirty && !saving && (
                <span className="adm-support-hint" style={{ marginTop: 0, alignSelf: "center" }}>
                  Keine ungespeicherten Änderungen.
                </span>
              )}
              {missingRevision && dirty && !saving && (
                <span className="adm-support-hint" style={{ marginTop: 0, alignSelf: "center" }}>
                  Speichern nicht möglich: keine Revision vom Server erhalten.
                </span>
              )}
            </div>
            <p className="adm-support-hint">Änderungen werden im Admin-Audit protokolliert.</p>
          </div>
        </div>

        {/* 6) Verlauf */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="clock" s={17} /> Verlauf</div>
          <div className="adm-card-body">
            <KV items={[
              ["Eingegangen am", fmtDateTime(req.createdAt)],
              ["Zuletzt geändert", fmtDateTime(req.updatedAt)],
              ["Entschieden am", fmtDateTime(req.reviewedAt)],
              // reviewedBy ist im Backendvertrag ein OBJEKT { id, name } — vorher wurde
              // es direkt gerendert und erschien als "[object Object]".
              ["Entschieden von", reviewerName],
            ]} />
          </div>
        </div>

        {/* 7) Technische Informationen — eingeklappt, natives <details>. */}
        <details className="adm-card adm-tech">
          <summary className="adm-card-head adm-tech-summary">
            <Icon n="settings" s={17} /> Technische Informationen
            <span className="adm-tech-caret" aria-hidden="true"><Icon n="chevron" s={16} /></span>
          </summary>
          <div className="adm-card-body">
            <KV items={[
              ["Anfrage-ID (intern)", <span className="adm-mono">{dash(req.id)}</span>],
              ["Kunden-ID (intern)", <span className="adm-mono">{dash(req.customer?.id)}</span>],
              ["Sendungs-ID (intern)", <span className="adm-mono">{dash(sid)}</span>],
              ["Revision", <span className="adm-mono">{dash(revision)}</span>],
              ["Support-Benachrichtigung", req.notification
                ? (req.notification.failed ? "Fehlgeschlagen" : (req.notification.sentAt ? `Versendet ${fmtDateTime(req.notification.sentAt)}` : "Ausstehend"))
                : "—"],
            ]} />
          </div>
        </details>
      </div>

      {/* Bestätigungsdialog für terminale Entscheidungen — benennt ausdrücklich,
          dass KEINE Carrier-/JUMiNGO-Stornierung ausgelöst wird. */}
      {decision && (
        <ConfirmDialog
          icon={decision === "accepted" ? "check" : "x"}
          danger={decision === "rejected"}
          title={CANCELLATION_DECISION_DIALOG[decision].title}
          text={CANCELLATION_DECISION_DIALOG[decision].text}
          subline={`${cancellationLabel(req)} · ${cust.primary}`}
          note="Die Entscheidung wird im Admin-Audit protokolliert."
          confirmLabel={CANCELLATION_DECISION_DIALOG[decision].confirm}
          confirmIcon={decision === "accepted" ? "check" : "x"}
          busy={saving}
          busyLabel="Wird gespeichert…"
          onCancel={() => { if (!saving) setDecision(null); }}
          onConfirm={save}
        />
      )}
    </div>
  );
}
