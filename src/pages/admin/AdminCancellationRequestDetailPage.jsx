import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { getAdminCancellationRequest, updateAdminCancellationRequest } from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { serviceLabel, shipmentStatusMeta } from "../../utils/adminShipments";
import {
  cancellationStatusMeta,
  cancellationStatusOptions,
  isCancellationEditable,
  isTerminalCancellationStatus,
  hasCancellationEdit,
  normalizeNote,
} from "../../utils/adminCancellations.mjs";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

const ERROR_MESSAGES = {
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Die Stornierungsanfrage konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Die Stornierungsanfrage konnte nicht geladen werden. Bitte versuchen Sie es erneut.";

// Fehlertexte für das Speichern (Status/Vermerk). 409 ist KEIN Fehler im
// klassischen Sinn, sondern der Optimistic-Locking-Konflikt → eigener Banner.
const SAVE_ERRORS = {
  400: "Die Änderung ist ungültig oder nicht erlaubt.",
  404: "Die Anfrage wurde nicht gefunden oder existiert nicht mehr.",
  422: "Die Änderung ist ungültig oder nicht erlaubt.",
  429: "Zu viele Admin-Aktionen. Bitte kurz warten.",
  500: "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  default: "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
};

// Backend-Vertrag: { cancellation_request: {...} } (o. ä.). Defensiv entpacken.
function selectRequest(d) {
  if (d && typeof d === "object" && !Array.isArray(d)) {
    for (const k of ["cancellation_request", "cancellationRequest", "request", "data"]) {
      if (d[k] && typeof d[k] === "object" && !Array.isArray(d[k])) return d[k];
    }
    return d;
  }
  return null;
}

// Verschachtelte Sendungs-/Kundendaten (falls das Backend sie mitliefert) oder
// {} — die Getter fallen dann auf Top-Level-Felder zurück.
function selectShipment(r) {
  return r && typeof r.shipment === "object" && r.shipment ? r.shipment : {};
}
function selectCustomer(r) {
  if (r && typeof r.user === "object" && r.user) return r.user;
  if (r && typeof r.customer === "object" && r.customer) return r.customer;
  return {};
}

// ── Feld-Getter: NUR erlaubte Felder. Nie password/hash/token/secret, nie das
// ganze Objekt spreaden. ──────────────────────────────────────────────────────
const idOf = (r) => firstDefined(r.id, r.cancellation_request_id, r.request_id, r.requestId);
const statusOf = (r) => firstDefined(r.status, r.state);
const requestedAtOf = (r) =>
  firstDefined(r.cancellation_requested_at, r.requested_at, r.requestedAt, r.created_at, r.createdAt, r.created);
const updatedAtOf = (r) => firstDefined(r.updated_at, r.updatedAt);
const reasonOf = (r) =>
  firstDefined(r.reason, r.customer_reason, r.customerReason, r.cancellation_reason, r.message);
const internalNoteOf = (r) => firstDefined(r.internal_note, r.internalNote, r.admin_note, r.adminNote);
// `revision` ist der Optimistic-Locking-Zähler (Backend-Vertrag). Defensiv auch
// rev/version prüfen; 0 ist ein gültiger Wert (daher nicht über firstDefined,
// das leere Strings/0 nicht verwirft — 0 ist hier explizit erlaubt).
function revisionOf(r) {
  for (const v of [r?.revision, r?.rev, r?.version]) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

const shipmentIdOf = (r, s) => firstDefined(r.shipment_id, r.shipmentId, s.id, s.shipment_id, s.shipmentId);
const carrierOf = (r, s) => firstDefined(r.carrier, s.carrier, s.selected_carrier, s.carrier_name);
const serviceOf = (r, s) => firstDefined(r.service_type, s.service_type, s.serviceType, s.service);
const shipmentStatusOf = (r, s) => firstDefined(s.status, s.state, r.shipment_status);
const priceOf = (r, s) => firstDefined(s.price_final, s.price_gross, s.priceGross, s.price);
const fromOf = (r, s) => firstDefined(s.from_country, s.fromCountry, s.origin_country);
const toOf = (r, s) => firstDefined(s.to_country, s.toCountry, s.destination_country);

const userIdOf = (r, c) => firstDefined(r.user_id, r.userId, r.customer_id, c.id, c.user_id, c.userId);
const companyOf = (r, c) => firstDefined(r.company_name, c.company_name, c.company, c.firma);
const nameOf = (r, c) => firstDefined(r.name, c.name, c.full_name, c.contact_name);
const emailOf = (r, c) => firstDefined(r.email, c.email, c.e_mail);

const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");
const moneyOrDash = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? money(v) : "—");

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("de-DE");
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

  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  // Editier-State (nur Anzeige-Formular; Backend bleibt maßgeblich).
  const [editStatus, setEditStatus] = useState("");
  const [editNote, setEditNote] = useState("");
  const [baseline, setBaseline] = useState({ status: "", note: "", revision: undefined });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // { type, text }
  const [conflict, setConflict] = useState(false);

  const applyLoaded = useCallback((r) => {
    const status = statusOf(r) ?? "";
    const note = internalNoteOf(r) ?? "";
    const revision = revisionOf(r);
    setBaseline({ status, note, revision });
    setEditStatus(status);
    setEditNote(note);
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
      const record = selectRequest(d);
      setReq(record);
      if (record) applyLoaded(record);
    } catch {
      if (mountedRef.current) { setError(GENERIC_ERROR); setReq(null); }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [id, applyLoaded]);

  useEffect(() => { load(); }, [load]);

  // Beim Wechsel auf eine andere Anfrage die Bearbeitungsmeldung/Konflikt lösen.
  useEffect(() => { setSaveMsg(null); setConflict(false); }, [id]);

  // „Aktuelle Version laden" nach einem Konflikt: Backend-Realität neu holen,
  // Formular auf den frischen Stand zurücksetzen (kein stilles Overwrite, kein
  // Zusammenführen — der Admin entscheidet auf Basis des aktuellen Standes neu).
  const reloadCurrent = useCallback(async () => {
    setConflict(false);
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
        <div className="table-card"><div className="empty"><div className="empty-icon">🔎</div><div className="empty-title">Stornierungsanfrage nicht gefunden</div></div></div>
      </div>
    );
  }
  if (error || !req) {
    return (
      <div className="adm-page">
        {back}
        <div className="alert alert-error"><Icon n="x" s={16} />{error || GENERIC_ERROR}</div>
      </div>
    );
  }

  const r = req;
  const s = selectShipment(r);
  const c = selectCustomer(r);
  const currentStatus = statusOf(r);
  const [statusCls, statusLabel] = cancellationStatusMeta(currentStatus);
  const editable = isCancellationEditable(currentStatus);
  const terminal = isTerminalCancellationStatus(currentStatus);
  const statusOptions = cancellationStatusOptions(currentStatus);
  const sid = shipmentIdOf(r, s);
  const route = routeOf(fromOf(r, s), toOf(r, s));
  const reason = reasonOf(r);
  const revision = baseline.revision;

  const dirty = hasCancellationEdit({
    currentStatus: baseline.status,
    nextStatus: editStatus,
    currentNote: baseline.note,
    nextNote: editNote,
  });
  // Speichern nur, wenn bearbeitbar, eine Änderung vorliegt, keine offene
  // Konfliktsperre besteht, eine Revision bekannt ist und gerade nichts läuft.
  const canSave = editable && dirty && !conflict && !saving && revision !== undefined;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveMsg(null);
    setConflict(false);
    try {
      const payload = { revision };
      if (editStatus && editStatus !== baseline.status) payload.status = editStatus;
      if (normalizeNote(editNote) !== normalizeNote(baseline.note)) payload.internal_note = editNote;
      const resp = await updateAdminCancellationRequest(id, payload);
      if (!mountedRef.current) return;
      if (resp.ok) {
        setSaveMsg({ type: "success", text: "Änderung gespeichert." });
        await load(); // Backend-Realität neu laden (frische Revision/Status/Notiz)
        return;
      }
      if (resp.status === 401 || resp.status === 403) return; // zentraler Redirect
      if (resp.status === 409) {
        // Optimistic-Locking-Konflikt: NICHT automatisch überschreiben.
        setConflict(true);
        return;
      }
      setSaveMsg({ type: "error", text: SAVE_ERRORS[resp.status] || SAVE_ERRORS.default });
    } catch {
      if (mountedRef.current) setSaveMsg({ type: "error", text: SAVE_ERRORS.default });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <div className="adm-page">
      {back}

      {/* Scope-Trennung: unmissverständlich, dass dies KEINE echte Stornierung
          beim Carrier/JUMiNGO ist und keine Erstattung/Gutschrift auslöst. */}
      <div className="adm-scope-note" role="note">
        <Icon n="info" s={18} />
        <div>
          <strong>Interner Verwaltungsvorgang.</strong> Das Bearbeiten dieser Anfrage ändert nur ihren
          internen Bearbeitungsstatus. Es wird <strong>keine</strong> Stornierung beim Carrier/JUMiNGO
          ausgelöst und <strong>keine</strong> Erstattung, Gutschrift oder Rechnungskorrektur vorgenommen.
        </div>
      </div>

      {saveMsg && (
        <div className={`alert ${saveMsg.type === "success" ? "alert-success" : "alert-error"}`}>
          <Icon n={saveMsg.type === "success" ? "check" : "x"} s={16} />{saveMsg.text}
        </div>
      )}

      {conflict && (
        <div className="adm-conflict" role="alert">
          <div className="adm-conflict-text">
            <Icon n="refresh" s={16} />
            <span>
              Diese Anfrage wurde inzwischen an anderer Stelle geändert. Ihre Änderung wurde nicht
              gespeichert. Bitte laden Sie die aktuelle Version und prüfen Sie erneut.
            </span>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={reloadCurrent} disabled={saving}>
            <Icon n="refresh" s={14} /> Aktuelle Version laden
          </button>
        </div>
      )}

      {/* 1) Kopfbereich */}
      <div className="adm-card">
        <div className="adm-card-body">
          <div className="adm-detail-head">
            <span className="adm-detail-id">Stornierungsanfrage #{dash(idOf(r))}</span>
            <span className="adm-detail-badges">
              <span className={`badge ${statusCls}`}>{statusLabel}</span>
              <span className="adm-chip"><Icon n="calendar" s={13} /> Eingegangen {fmtDateTime(requestedAtOf(r))}</span>
              {sid != null && String(sid).trim() !== "" && (
                <span className="adm-chip"><Icon n="package" s={13} /> Sendung #{String(sid)}</span>
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="adm-cards">
        {/* 2) Kundenwunsch / Grund (voller Text) */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="mail" s={17} /> Kundenwunsch</div>
          <div className="adm-card-body">
            {reason && String(reason).trim() !== ""
              ? <p className="adm-reason">{String(reason)}</p>
              : <p className="adm-addr-note">Kein Grund angegeben.</p>}
          </div>
        </div>

        {/* 3) Sendungsdaten (aus dem Anfrage-Join; kein zusätzlicher Request) */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="package" s={17} /> Sendung</div>
          <div className="adm-card-body">
            <KV items={[
              ["Sendung-ID", sid != null && String(sid).trim() !== ""
                ? <Link className="adm-idlink" to={`/admin/shipments/${encodeURIComponent(sid)}`}>{String(sid)}</Link>
                : "—"],
              ["Carrier", carrierOf(r, s) ? resolveCarrierName(carrierOf(r, s)) : "—"],
              ["Serviceart", serviceLabel(serviceOf(r, s))],
              ["Sendungsstatus", (() => {
                const sv = shipmentStatusOf(r, s);
                if (sv == null || String(sv).trim() === "") return "—";
                const [cls, label] = shipmentStatusMeta(sv);
                return <span className={`badge ${cls}`}>{label}</span>;
              })()],
              ["Route", route || "—"],
              ["Preis", moneyOrDash(priceOf(r, s))],
            ]} />
          </div>
        </div>

        {/* 4) Kundendaten (aus dem Anfrage-Join) */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="idcard" s={17} /> Kunde</div>
          <div className="adm-card-body">
            <KV items={[
              ["User-ID", <span className="adm-mono">{dash(userIdOf(r, c))}</span>],
              ["Firma", dash(companyOf(r, c))],
              ["Name", dash(nameOf(r, c))],
              ["E-Mail", dash(emailOf(r, c))],
            ]} />
          </div>
        </div>

        {/* 5) Interne Bearbeitung — Status + Vermerk (mutierend, auditiert) */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="shieldCheck" s={17} /> Interne Bearbeitung</div>
          <div className="adm-card-body">
            {terminal ? (
              <>
                <p className="adm-support-hint" style={{ marginTop: 0 }}>
                  Diese Anfrage ist abgeschlossen (<strong>{statusLabel}</strong>) und kann nicht wieder
                  geöffnet werden. Änderungen am Status oder Vermerk sind nicht mehr möglich.
                </p>
                <div className="adm-edit-field" style={{ marginTop: 14 }}>
                  <span className="adm-edit-label">Interner Vermerk</span>
                  {baseline.note && baseline.note.trim() !== ""
                    ? <p className="adm-reason">{baseline.note}</p>
                    : <p className="adm-addr-note">Kein interner Vermerk hinterlegt.</p>}
                </div>
              </>
            ) : !editable ? (
              <p className="adm-support-hint" style={{ marginTop: 0 }}>
                Der aktuelle Status („{dash(currentStatus)}") wird nicht unterstützt. Eine Bearbeitung ist
                hier nicht möglich.
              </p>
            ) : (
              <>
                <div className="adm-edit-grid">
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
                </div>

                <div className="adm-edit-field" style={{ marginTop: 14 }}>
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
                  <span className="adm-edit-hint">Nur intern sichtbar. Wird nicht an den Kunden übermittelt.</span>
                </div>

                <div className="adm-support" style={{ marginTop: 14 }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!canSave}>
                    {saving
                      ? <><span className="spinner spinner-dark" /> Wird gespeichert…</>
                      : <><Icon n="check" s={14} /> Änderung speichern</>}
                  </button>
                  {!dirty && !saving && (
                    <span className="adm-support-hint" style={{ marginTop: 0, alignSelf: "center" }}>
                      Keine ungespeicherten Änderungen.
                    </span>
                  )}
                </div>
                <p className="adm-support-hint">Änderungen werden im Admin-Audit protokolliert.</p>
              </>
            )}
          </div>
        </div>

        {/* 6) Metadaten */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="clock" s={17} /> Verlauf</div>
          <div className="adm-card-body">
            <KV items={[
              ["Eingegangen am", fmtDateTime(requestedAtOf(r))],
              ["Zuletzt geändert", fmtDateTime(updatedAtOf(r))],
            ]} />
          </div>
        </div>
      </div>
    </div>
  );
}
