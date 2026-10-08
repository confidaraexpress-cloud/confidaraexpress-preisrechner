import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { SalesPartnerAdminNav } from "../../components/admin/SalesPartnerAdminNav";
import { usePreliveStatus } from "../../hooks/usePreliveStatus";
import { returnState } from "../../utils/adminBackLink.mjs";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { DateField } from "../../components/admin/DateField";
import {
  createAdminShipmentDispatchEvidence,
  getAdminShipmentDispatchEvidence,
  listAdminDispatchEvidenceQueue,
} from "../../api/adminApi";
import { selectListHasMore, selectListTotal } from "../../utils/adminOverview.mjs";
import { cancellationStatusMeta } from "../../utils/adminCancellations.mjs";
import { providerLabel } from "../../utils/adminReconciliation.mjs";
import { resolveCarrierName } from "../../utils/carrierMap";
import { formatCount } from "../../utils/salesPartnerView.mjs";
import {
  EVIDENCE_DECISION_OPTIONS,
  EVIDENCE_TYPE_OPTIONS,
  MAX_EVIDENCE_NOTE_LENGTH,
  buildDispatchEvidenceBody,
  dispatchEvidenceErrorOutcome,
  evidenceDecisionEffect,
  evidenceDecisionSummary,
  evidenceSourceLabel,
  evidenceStatusMeta,
  evidenceTrackingText,
  evidenceTypeLabel,
  formatTimestamp,
  localIsoDate,
  normalizeEvidence,
  normalizeQueueItem,
  normalizeVersioned,
} from "../../utils/adminSalesPartnerView.mjs";

const PAGE_SIZE = 25;
const LIST_ERROR = "Die Versandnachweise konnten nicht geladen werden.";
const LEER = { status: "", dispatchDate: "", evidenceType: "", note: "" };

function Badge({ meta }) {
  const [cls, label] = meta;
  return <span className={`badge ${cls}`}>{label}</span>;
}

const shipmentPath = (id) => `/admin/shipments/${encodeURIComponent(id)}`;
const anbieterText = (item) => `${providerLabel(item.provider)} · ${item.carrier ? resolveCarrierName(item.carrier) : "—"}`;

function TrackingCell({ item }) {
  return (
    <div className="adm-sp-partner">
      <span>{evidenceTrackingText(item)}</span>
      {item.lastTrackedAt && <span className="adm-sp-sub">{formatTimestamp(item.lastTrackedAt, { withTime: true })}</span>}
      {item.trackingReferences.length > 0 && <span className="adm-sp-sub adm-mono">{item.trackingReferences.join(", ")}</span>}
    </div>
  );
}

// Bisherige Entscheidungen zu einer Sendung — read-only im Dialog, die geltende zuerst.
function EvidenceHistory({ state }) {
  if (state.loading) return <p className="adm-support-hint" role="status">Bisherige Nachweise werden geladen …</p>;
  if (state.error) return <p className="adm-support-hint">{state.error}</p>;
  const aktuell = state.data?.current || null;
  const liste = [aktuell, ...(state.data?.history || []).filter((e) => !aktuell || e.id !== aktuell.id)].filter(Boolean);
  if (liste.length === 0) return <p className="adm-support-hint" id="adm-sp-evidence-none">Bisher kein Nachweis erfasst.</p>;
  return (
    <ul className="adm-sp-history" id="adm-sp-evidence-history">
      {liste.map((e, i) => (
        <li key={e.id ?? i} className="adm-sp-history-line">
          <Badge meta={evidenceStatusMeta(e.status)} />
          {e === aktuell && <span className="adm-sp-sub">gilt derzeit</span>}
          {e.dispatchDate && <span>Versanddatum {formatTimestamp(e.dispatchDate)}</span>}
          <span className="adm-sp-sub">{evidenceSourceLabel(e.source)}</span>
          {e.evidenceType && e.evidenceType !== "admin_decision" && <span className="adm-sp-sub">{evidenceTypeLabel(e.evidenceType)}</span>}
          {e.note && <span className="adm-sp-sub">{e.note}</span>}
          <span className="adm-sp-sub">{formatTimestamp(e.createdAt, { withTime: true })}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Admin · Versandnachweise ────────────────────────────────────────────────
   Queue „Versandnachweis fehlt": gebuchte Sendungen von Kunden mit
   Partnerzuordnung ohne belegten Versand. Je Sendung eine Entscheidung per
   Dialog — „Versendet" (Pflicht: Datum, nicht in der Zukunft, und
   Nachweisart), „Nicht versendet" oder „Ungeklärt", jeweils mit Begründung.
   Kein Anbieterkontakt; die Seite hält nur fest, was ein Mensch festgestellt
   hat.

   Der Dialog folgt dem Ablauf (UX-Paket 5): betroffene Sendung, vorhandene
   Nachweise, Versandstatus, Entscheidung mit ihrer Wirkung, Begründung und vor dem
   Speichern die Zusammenfassung dessen, was festgehalten wird. Fehler des
   Servers stehen am betroffenen Feld; hat sich der Stand bewegt (Sendung nicht
   mehr gebucht, Provisionsentscheidung vorhanden), lädt die Liste neu. */
export default function AdminDispatchEvidencePage() {
  // Nur für den Eintrag „Pre-Live-Test" der Teilnavigation (fail-closed).
  const prelive = usePreliveStatus();
  // Herkunft für das Sendungsdetail: „Zurück" führt wieder hierher.
  const from = returnState(useLocation());
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null);      // { item, form, errors, error }
  const [historie, setHistorie] = useState({ loading: false, error: "", data: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);    // { type, text }
  const inFlight = useRef(false);
  const heute = localIsoDate();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await listAdminDispatchEvidenceQueue({ page, pageSize: PAGE_SIZE });
      if (!r.ok) {
        if (r.status !== 401 && r.status !== 403) setError(LIST_ERROR);
        setRows([]); setTotal(null); setHasMore(false);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const list = (Array.isArray(d?.items) ? d.items : []).map(normalizeQueueItem).filter(Boolean);
      const t = selectListTotal(d);
      setRows(list);
      setTotal(t);
      setHasMore(selectListHasMore(d, list.length, page, PAGE_SIZE, t));
    } catch {
      setError(LIST_ERROR);
      setRows([]); setTotal(null); setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const oeffnen = async (item) => {
    setMessage(null);
    setDialog({ item, form: { ...LEER }, errors: {}, error: "" });
    setHistorie({ loading: true, error: "", data: null });
    try {
      const r = await getAdminShipmentDispatchEvidence(item.shipmentId);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        setHistorie({ loading: false, error: "Bisherige Nachweise konnten nicht geladen werden.", data: null });
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      setHistorie({ loading: false, error: "", data: normalizeVersioned(d, normalizeEvidence) });
    } catch {
      setHistorie({ loading: false, error: "Bisherige Nachweise konnten nicht geladen werden.", data: null });
    }
  };

  const setFeld = (k, v) => setDialog((d) => (d ? { ...d, form: { ...d.form, [k]: v }, errors: { ...d.errors, [k]: undefined } } : d));

  const senden = async () => {
    if (!dialog || inFlight.current) return;
    const gebaut = buildDispatchEvidenceBody(dialog.form, { today: heute });
    if (!gebaut.ok) { setDialog((d) => ({ ...d, errors: gebaut.errors })); return; }
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await createAdminShipmentDispatchEvidence(dialog.item.shipmentId, gebaut.body);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        let body = null;
        try { body = await r.json(); } catch { body = null; }
        const folge = dispatchEvidenceErrorOutcome(r.status, body);
        if (folge.reload) {
          setDialog(null);
          setMessage({ type: "error", text: folge.text });
          load();
          return;
        }
        setDialog((d) => (d ? { ...d, error: folge.text, errors: folge.field ? { ...d.errors, [folge.field]: folge.text } : d.errors } : d));
        return;
      }
      const sendung = dialog.item.shipmentId;
      setDialog(null);
      setMessage({ type: "success", text: `Die Entscheidung zu Sendung #${sendung} wurde gespeichert.` });
      load();
    } catch {
      setDialog((d) => (d ? { ...d, error: "Die Entscheidung wurde nicht gespeichert. Bitte versuchen Sie es erneut." } : d));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const fehlerId = (k) => `adm-sp-evidence-${k}-error`;
  const fehler = (k) => (dialog?.errors?.[k] ? <span className="field-error" id={fehlerId(k)}>{dialog.errors[k]}</span> : null);
  const beschrieben = (k, hinweis) => [dialog?.errors?.[k] ? fehlerId(k) : null, hinweis].filter(Boolean).join(" ") || undefined;
  const showPagination = !error && (rows.length > 0 || page > 1);
  const zusammenfassung = dialog ? evidenceDecisionSummary(dialog.form) : null;

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>Versandnachweise</>}
        subtitle={<>Gebuchte Sendungen von Kunden mit Partnerzuordnung, deren Versand noch nicht belegt ist. Ohne den Nachweis „Versendet“ entsteht keine Provision.</>}
        actions={<button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>Aktualisieren</button>}
      />
      <SalesPartnerAdminNav prelive={prelive} />

      {message && (
        <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}
          role={message.type === "success" ? "status" : "alert"} id="adm-sp-evidence-message">
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="table-card"><ListSkeleton rows={6} label="Versandnachweise werden geladen …" /></div>
      ) : error ? (
        <div className="ce-card">
          <ErrorState title={error} action={<button type="button" className="btn btn-primary btn-sm" onClick={load}>Erneut versuchen</button>} />
        </div>
      ) : rows.length === 0 ? (
        <div className="table-card">
          <div className="empty">
            <div className="empty-title">Keine offenen Versandnachweise</div>
            <p className="empty-text">Für alle gebuchten Sendungen liegt ein Versandnachweis vor.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-card adm-sp-evidence-table">
            <table>
              <caption className="sr-only">
                Versandnachweis fehlt, Seite {page}. Spalten: Sendung, Anbieter und Carrier, gebucht, Pakete, letzter Trackingstand, Storno, Nachweis, Aktion.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Sendung</th>
                  <th scope="col">Anbieter · Carrier</th>
                  <th scope="col">Gebucht</th>
                  <th scope="col" className="adm-num">Pakete</th>
                  <th scope="col">Letzter Trackingstand</th>
                  <th scope="col">Storno</th>
                  <th scope="col">Nachweis</th>
                  <th scope="col" className="adm-col-action">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.shipmentId} data-shipment-id={item.shipmentId}>
                    <td><Link className="adm-sp-name" to={shipmentPath(item.shipmentId)} state={from}>Sendung #{item.shipmentId}</Link></td>
                    <td>{anbieterText(item)}</td>
                    <td>{formatTimestamp(item.bookedAt, { withTime: true })}</td>
                    <td className="adm-num">{formatCount(item.packageCount)}</td>
                    <td><TrackingCell item={item} /></td>
                    <td>{item.cancellationStatus ? <Badge meta={cancellationStatusMeta(item.cancellationStatus)} /> : "—"}</td>
                    <td><Badge meta={evidenceStatusMeta(item.evidenceStatus)} /></td>
                    <td className="adm-col-action">
                      <button type="button" className="btn btn-outline btn-sm" id={`adm-sp-evidence-${item.shipmentId}`} onClick={() => oeffnen(item)}
                        aria-label={`Versand entscheiden: Sendung #${item.shipmentId}`}>
                        Entscheiden
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="adm-sp-evidence-cards">
            {rows.map((item) => (
              <li className="adm-scard" key={`c-${item.shipmentId}`}>
                <div className="adm-scard-head">
                  <Link className="adm-sp-name" to={shipmentPath(item.shipmentId)} state={from}>Sendung #{item.shipmentId}</Link>
                  <Badge meta={evidenceStatusMeta(item.evidenceStatus)} />
                </div>
                <dl className="adm-scard-kv">
                  <div><dt>Anbieter · Carrier</dt><dd>{anbieterText(item)}</dd></div>
                  <div><dt>Gebucht</dt><dd>{formatTimestamp(item.bookedAt, { withTime: true })}</dd></div>
                  <div><dt>Pakete</dt><dd>{formatCount(item.packageCount)}</dd></div>
                  <div><dt>Letzter Trackingstand</dt><dd><TrackingCell item={item} /></dd></div>
                  <div><dt>Storno</dt><dd>{item.cancellationStatus ? <Badge meta={cancellationStatusMeta(item.cancellationStatus)} /> : "—"}</dd></div>
                </dl>
                <div className="adm-scard-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => oeffnen(item)}
                    aria-label={`Versand entscheiden: Sendung #${item.shipmentId}`}>Entscheiden</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {showPagination && (
        <div className="adm-pagination">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={loading || page <= 1}>Zurück</button>
          <span className="adm-page-ind">Seite {page}{Number.isFinite(total) ? ` · ${total} gesamt` : ""}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPage((p) => p + 1)} disabled={loading || !hasMore}>Weiter</button>
        </div>
      )}

      {dialog && (
        <ConfirmDialog
          title="Versand entscheiden"
          subline={`Sendung #${dialog.item.shipmentId}`}
          text="Prüfen Sie Sendung und vorhandene Nachweise und halten Sie dann fest, was Sie zum Versand festgestellt haben."
          confirmLabel="Entscheidung speichern"
          busy={busy}
          confirmId="adm-sp-evidence-confirm"
          onCancel={() => { if (!busy) setDialog(null); }}
          onConfirm={senden}
        >
          {dialog.error && <div className="alert alert-error" role="alert" id="adm-sp-evidence-error">{dialog.error}</div>}

          <section className="adm-ev-section" aria-labelledby="adm-sp-evidence-shipment-title">
            <h3 className="adm-ev-title" id="adm-sp-evidence-shipment-title">Sendung</h3>
            <dl className="adm-kv adm-ev-kv" id="adm-sp-evidence-shipment">
              <div className="adm-kv-item"><dt>Anbieter · Carrier</dt><dd>{anbieterText(dialog.item)}</dd></div>
              <div className="adm-kv-item"><dt>Gebucht</dt><dd>{formatTimestamp(dialog.item.bookedAt, { withTime: true })}</dd></div>
              <div className="adm-kv-item"><dt>Pakete</dt><dd>{formatCount(dialog.item.packageCount)}</dd></div>
              {dialog.item.trackingReferences.length > 0 && (
                <div className="adm-kv-item"><dt>Sendungsnummern</dt><dd className="adm-mono">{dialog.item.trackingReferences.join(", ")}</dd></div>
              )}
            </dl>
          </section>

          <section className="adm-ev-section" aria-labelledby="adm-sp-evidence-history-title">
            <h3 className="adm-ev-title" id="adm-sp-evidence-history-title">Vorhandene Nachweise</h3>
            <EvidenceHistory state={historie} />
          </section>

          <section className="adm-ev-section" aria-labelledby="adm-sp-evidence-status-title">
            <h3 className="adm-ev-title" id="adm-sp-evidence-status-title">Versandstatus</h3>
            <dl className="adm-kv adm-ev-kv" id="adm-sp-evidence-tracking">
              <div className="adm-kv-item">
                <dt>Letzter Trackingstand</dt>
                <dd>
                  {evidenceTrackingText(dialog.item)}
                  {dialog.item.lastTrackedAt && <span className="adm-sp-sub adm-sp-block">{formatTimestamp(dialog.item.lastTrackedAt, { withTime: true })}</span>}
                </dd>
              </div>
              {dialog.item.cancellationStatus && (
                <div className="adm-kv-item"><dt>Storno</dt><dd><Badge meta={cancellationStatusMeta(dialog.item.cancellationStatus)} /></dd></div>
              )}
            </dl>
          </section>

          <fieldset className="adm-sp-fieldset" aria-describedby={dialog.errors.status ? fehlerId("status") : undefined}>
            <legend className="adm-edit-label">Entscheidung (Pflicht)</legend>
            {EVIDENCE_DECISION_OPTIONS.map((o) => (
              <label className="adm-sp-choice adm-ev-choice" key={o.value}>
                <input type="radio" name="adm-sp-evidence-status" id={`adm-sp-evidence-status-${o.value}`}
                  checked={dialog.form.status === o.value} disabled={busy}
                  aria-describedby={`adm-sp-evidence-effect-${o.value}`}
                  onChange={() => setFeld("status", o.value)} />
                <span className="adm-ev-choice-text">
                  <span>{o.label}</span>
                  <span className="adm-edit-hint" id={`adm-sp-evidence-effect-${o.value}`}>{evidenceDecisionEffect(o.value)}</span>
                </span>
              </label>
            ))}
            {fehler("status")}
          </fieldset>
          {dialog.form.status === "dispatched" && (
            <>
              <div className="adm-sp-datefield">
                <DateField id="adm-sp-evidence-date" label="Versanddatum (Pflicht)" value={dialog.form.dispatchDate} max={heute} required
                  invalid={!!dialog.errors.dispatchDate} disabled={busy} onChange={(v) => setFeld("dispatchDate", v)} />
                {fehler("dispatchDate")}
              </div>
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="adm-sp-evidence-type">Nachweisart (Pflicht)</label>
                <select id="adm-sp-evidence-type" className="field-select adm-edit-select" value={dialog.form.evidenceType}
                  disabled={busy} onChange={(e) => setFeld("evidenceType", e.target.value)} aria-required="true"
                  aria-invalid={dialog.errors.evidenceType ? "true" : undefined} aria-describedby={beschrieben("evidenceType")}>
                  <option value="">Bitte wählen</option>
                  {EVIDENCE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {fehler("evidenceType")}
              </div>
            </>
          )}
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-sp-evidence-note">Begründung (Pflicht)</label>
            <textarea id="adm-sp-evidence-note" className="adm-note-input" maxLength={MAX_EVIDENCE_NOTE_LENGTH} disabled={busy}
              value={dialog.form.note} onChange={(e) => setFeld("note", e.target.value)} aria-required="true"
              aria-invalid={dialog.errors.note ? "true" : undefined} aria-describedby={beschrieben("note", "adm-sp-evidence-note-hint")} />
            <span className="adm-edit-hint" id="adm-sp-evidence-note-hint">{`Höchstens ${MAX_EVIDENCE_NOTE_LENGTH} Zeichen.`}</span>
            {fehler("note")}
          </div>

          {zusammenfassung && <p className="adm-ev-summary" id="adm-sp-evidence-summary" aria-live="polite">{zusammenfassung}</p>}
          <p className="adm-support-hint adm-ev-note">Die Entscheidung wird protokolliert. Ein Versanddienstleister wird nicht kontaktiert.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
