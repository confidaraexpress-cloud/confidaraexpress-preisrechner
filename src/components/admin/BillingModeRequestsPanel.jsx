import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAdminUserBillingModeRequests, approveAdminBillingModeRequest, rejectAdminBillingModeRequest,
} from "../../api/adminApi";
import {
  ADMIN_BILLING_REQUEST_TEXT as T, billingModeRequestStatusMeta, splitAccountRequests, validateRejectionReasonInput,
} from "../../utils/adminBillingModeRequests.mjs";
import { BILLING_MODE_REJECTION_REASON_MAX, formatTimestampDayDe, noteLength } from "../../utils/billingModeView.mjs";
import { ConfirmDialog } from "./ConfirmDialog";

// ───────────────────────────────────────────────────────────────
// Antrag auf Sammelrechnung im Admin-Kundendetail (P5, Canonical v2.111).
//
// Selbstladend wie die Unternehmerprüfung: ein Fehler hier blockiert die Seite nicht. Genehmigen läuft
// über den Bestätigungsdialog (Geldwirkung: Zahlungsaufschub bis zu sieben Tage), Ablehnen braucht einen
// Grund, den der Kunde sieht. Ob eine Entscheidung erlaubt ist, entscheidet ausschließlich der Server
// (Adminrolle, offener Status unter Sperre, Verfügbarkeit der Sammelabrechnung) — 409 zeigt den
// tatsächlichen Stand. Nach einer Genehmigung meldet `onModeChange` die neue Abrechnungsart an die Seite.
// ───────────────────────────────────────────────────────────────

export const BILLING_MODE_REQUESTS_PANEL_ID = "adm-billing-mode-requests";
const REASON_ID = "adm-bm-reject-reason";

function datum(v) {
  return formatTimestampDayDe(v) || "—";
}

function Verlaufszeile({ r }) {
  const [cls, label] = billingModeRequestStatusMeta(r.status);
  const wann = r.status === "withdrawn" ? r.withdrawnAt : (r.decidedAt || r.requestedAt);
  return (
    <li className="adm-bm-history-item">
      <span className={`badge ${cls}`}>{label}</span>{" "}
      <span>beantragt am {datum(r.requestedAt)}</span>
      {r.status !== "pending" && <span>, {r.status === "withdrawn" ? "zurückgezogen" : "entschieden"} am {datum(wann)}</span>}
      {r.decidedBy?.name && <span> {T.decidedBy(r.decidedBy.name)}</span>}
      {r.status === "rejected" && r.decisionNote && <p className="adm-bm-history-note">Grund: {r.decisionNote}</p>}
    </li>
  );
}

export function BillingModeRequestsPanel({ userId, onModeChange }) {
  const [state, setState] = useState({ loading: true, error: "", requests: [], approvalAvailable: false });
  const [grund, setGrund] = useState("");
  const [grundFehler, setGrundFehler] = useState("");
  const [busy, setBusy] = useState("");          // "" | "approve" | "reject"
  const [bestaetigen, setBestaetigen] = useState(false);
  const [message, setMessage] = useState(null);  // { type, text }
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const laden = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await getAdminUserBillingModeRequests(userId);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!mounted.current) return;
      if (!r.ok || !d || !Array.isArray(d.requests)) {
        setState({ loading: false, error: T.loadError, requests: [], approvalAvailable: false });
        return;
      }
      setState({ loading: false, error: "", requests: d.requests, approvalAvailable: d.approvalAvailable === true });
    } catch {
      if (mounted.current) setState({ loading: false, error: T.loadError, requests: [], approvalAvailable: false });
    }
  }, [userId]);
  useEffect(() => { laden(); }, [laden]);

  const { pending, history } = splitAccountRequests(state.requests);

  const genehmigen = async () => {
    if (busy || !pending) return;
    setBestaetigen(false); setBusy("approve"); setMessage(null);
    try {
      const r = await approveAdminBillingModeRequest(pending.id);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!mounted.current) return;
      if (r.ok) {
        setMessage({ type: "success", text: T.approved });
        if (onModeChange && d && typeof d.billingMode === "string") onModeChange(d.billingMode);
      } else {
        setMessage({ type: "error", text: (d && typeof d.error === "string" && d.error) || T.decideError });
      }
      await laden();
    } catch {
      if (mounted.current) setMessage({ type: "error", text: T.decideError });
    } finally {
      if (mounted.current) setBusy("");
    }
  };

  const ablehnen = async (e) => {
    e.preventDefault();
    if (busy || !pending) return;
    const v = validateRejectionReasonInput(grund);
    if (!v.ok) { setGrundFehler(v.error); return; }
    setGrundFehler(""); setBusy("reject"); setMessage(null);
    try {
      const r = await rejectAdminBillingModeRequest(pending.id, v.reason);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!mounted.current) return;
      if (r.ok) {
        setGrund("");
        setMessage({ type: "success", text: T.rejected });
      } else if (r.status === 400 && d && d.field === "reason") {
        setGrundFehler(typeof d.error === "string" && d.error ? d.error : T.decideError);
      } else {
        setMessage({ type: "error", text: (d && typeof d.error === "string" && d.error) || T.decideError });
      }
      await laden();
    } catch {
      if (mounted.current) setMessage({ type: "error", text: T.decideError });
    } finally {
      if (mounted.current) setBusy("");
    }
  };

  return (
    <div className="adm-bm-requests mt-16" id={BILLING_MODE_REQUESTS_PANEL_ID}>
      <h3 className="adm-bm-requests-title">{T.sectionTitle}</h3>
      {state.loading && state.requests.length === 0 ? (
        <p className="adm-muted">Anträge werden geladen …</p>
      ) : state.error ? (
        <div className="adm-note adm-note--error" role="alert">
          <span>{state.error}</span>{" "}
          <button type="button" className="btn btn-link btn-sm" onClick={laden}>Erneut versuchen</button>
        </div>
      ) : (
        <>
          {!pending && history.length === 0 && <p className="adm-muted">{T.noRequests}</p>}
          {pending && (
            <div className="adm-bm-pending">
              <div className="adm-bm-pending-head">
                <span className={`badge ${billingModeRequestStatusMeta("pending")[0]}`}>{billingModeRequestStatusMeta("pending")[1]}</span>{" "}
                <span>{T.pendingSince(datum(pending.requestedAt))}</span>
              </div>
              <p className="field-label mt-8">{T.customerNote}</p>
              <p className="adm-bm-note">{pending.customerNote || <span className="adm-muted">{T.noCustomerNote}</span>}</p>

              {!state.approvalAvailable && (
                <div className="adm-note mt-8" id="adm-bm-approval-unavailable"><span>{T.approvalUnavailable}</span></div>
              )}
              <div className="adm-bm-actions mt-8">
                <button type="button" className="btn btn-primary btn-sm" id="adm-bm-approve"
                  disabled={!!busy || !state.approvalAvailable}
                  aria-describedby={!state.approvalAvailable ? "adm-bm-approval-unavailable" : undefined}
                  onClick={() => setBestaetigen(true)}>
                  {busy === "approve" ? T.approving : T.approve}
                </button>
              </div>

              <form className="adm-bm-reject mt-16" onSubmit={ablehnen} noValidate>
                <label className="field-label" htmlFor={REASON_ID}>{T.rejectLabel}</label>
                <textarea
                  id={REASON_ID}
                  className="adm-note-input"
                  rows={3}
                  maxLength={BILLING_MODE_REJECTION_REASON_MAX}
                  value={grund}
                  disabled={!!busy}
                  aria-invalid={grundFehler ? "true" : undefined}
                  aria-describedby={`${REASON_ID}-hint${grundFehler ? ` ${REASON_ID}-error` : ""}`}
                  onChange={(e) => { setGrund(e.target.value); if (grundFehler) setGrundFehler(""); }}
                />
                <p className="field-hint" id={`${REASON_ID}-hint`}>
                  {T.rejectHint} ({noteLength(grund)} / {BILLING_MODE_REJECTION_REASON_MAX})
                </p>
                {grundFehler && <p className="field-error" id={`${REASON_ID}-error`} role="alert">{grundFehler}</p>}
                <button type="submit" className="btn btn-outline btn-sm mt-8" id="adm-bm-reject" disabled={!!busy}>
                  {busy === "reject" ? T.rejecting : T.reject}
                </button>
              </form>
            </div>
          )}
          {history.length > 0 && (
            <div className="adm-bm-history mt-16">
              <p className="field-label">{T.history}</p>
              <ul className="adm-bm-history-list">
                {history.map((r) => <Verlaufszeile key={r.id} r={r} />)}
              </ul>
            </div>
          )}
          <div className="mt-8">
            <Link className="btn btn-link btn-sm adm-bm-audit"
              to={`/admin/audit-logs?target_user_id=${encodeURIComponent(userId)}`}>
              {T.auditLink}
            </Link>
          </div>
        </>
      )}
      {message && (
        message.type === "error"
          ? <div className="adm-note adm-note--error mt-8" role="alert"><span>{message.text}</span></div>
          : <p className="profile-saved mt-8" role="status">{message.text}</p>
      )}
      {bestaetigen && pending && (
        <ConfirmDialog
          title={T.approveConfirmTitle}
          text={T.approveConfirmText}
          confirmLabel={T.approveConfirmLabel}
          busy={busy === "approve"}
          onCancel={() => { if (!busy) setBestaetigen(false); }}
          onConfirm={genehmigen}
        />
      )}
    </div>
  );
}

export default BillingModeRequestsPanel;
