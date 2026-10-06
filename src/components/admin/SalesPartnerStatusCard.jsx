import React, { useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  approveAdminSalesPartner,
  deactivateAdminSalesPartner,
  reactivateAdminSalesPartner,
  rejectAdminSalesPartner,
  setAdminSalesPartnerLogin,
} from "../../api/adminApi";
import {
  DEACTIVATION_REASON_OPTIONS,
  adminActionErrorText,
  adminPartnerStatusMeta,
  buildApproveBody,
  buildDeactivateBody,
  buildLoginBody,
  buildRejectBody,
  deactivationReasonLabel,
  formatTimestamp,
  loginEnabledState,
  loginStatusMeta,
  partnerDisplayName,
} from "../../utils/adminSalesPartnerView.mjs";

// Grund eines Statuswechsels: ein bekannter Deaktivierungsgrund als Label,
// sonst der Freitext des Servers (Adminbereich).
const statusReasonText = (reason) => {
  const label = deactivationReasonLabel(reason);
  return label === "Unbekannter Grund" ? reason : label;
};

function Badge({ meta, id }) {
  const [cls, label] = meta;
  return <span className={`badge ${cls}`} id={id}>{label}</span>;
}

// Dialogtexte je Aktion — die Stufe (danger) trägt die bestätigende Schaltfläche.
const AKTIONEN = Object.freeze({
  approve: {
    title: "Vertriebspartner freigeben",
    text: "Der Partner erhält Zugang zum Partnerportal; seine Provisionssätze gelten ab der Freigabe.",
    confirm: "Freigeben",
    success: "Der Vertriebspartner wurde freigegeben.",
  },
  reject: {
    title: "Antrag ablehnen",
    text: "Der Antrag wird abgelehnt. Der Partner erhält keinen Zugang zum Partnerportal.",
    confirm: "Ablehnen",
    danger: true,
    success: "Der Antrag wurde abgelehnt.",
  },
  deactivate: {
    title: "Vertriebspartner deaktivieren",
    text: "Der Partner wird deaktiviert. Eine spätere Reaktivierung bleibt möglich.",
    confirm: "Deaktivieren",
    danger: true,
    success: "Der Vertriebspartner wurde deaktiviert.",
  },
  reactivate: {
    title: "Vertriebspartner reaktivieren",
    text: "Der Partner wird wieder aktiv geschaltet.",
    confirm: "Reaktivieren",
    success: "Der Vertriebspartner wurde reaktiviert.",
  },
  loginOff: {
    title: "Login sperren",
    text: "Der Partner kann sich nicht mehr anmelden, bis der Login wieder entsperrt wird.",
    confirm: "Login sperren",
    danger: true,
    success: "Der Login wurde gesperrt.",
  },
  loginOn: {
    title: "Login entsperren",
    text: "Der Partner kann sich wieder anmelden.",
    confirm: "Login entsperren",
    success: "Der Login wurde entsperrt.",
  },
});

const LEERE_FORMULARE = Object.freeze({
  approve: { basePercent: "", level1Percent: "", level2Percent: "" },
  reject: { reason: "" },
  deactivate: { reason: "", note: "" },
});

/* ── Status und Zugang eines Vertriebspartners ───────────────────────────────
   Freigeben (Pflichtfeld Grundprovision), Ablehnen, Deaktivieren mit Grund,
   Reaktivieren, Login sperren/entsperren — jede Aktion über den zentralen
   Bestätigungsdialog, jeder Body über utils/adminSalesPartnerView.mjs. Welche
   Aktion angeboten wird, folgt dem Status des Servers; ein unbekannter
   Loginzustand bietet bewusst keine Login-Aktion an (fail-closed). */
export function SalesPartnerStatusCard({ partner, statusHistory = [], onChanged }) {
  const [dialog, setDialog] = useState(null);       // { kind, form, errors, error }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);     // { type, text }
  const inFlight = useRef(false);

  const status = partner.status;
  const login = loginEnabledState(partner.loginStatus);
  const oeffnen = (kind) => {
    setMessage(null);
    setDialog({ kind, form: { ...(LEERE_FORMULARE[kind] || {}) }, errors: {}, error: "" });
  };
  const schliessen = () => { if (!busy) setDialog(null); };
  const setFeld = (k, v) => setDialog((d) => (d ? { ...d, form: { ...d.form, [k]: v }, errors: { ...d.errors, [k]: undefined } } : d));

  const bestaetigen = async () => {
    if (!dialog || inFlight.current) return;
    const { kind, form } = dialog;
    let gebaut = { ok: true, body: {} };
    if (kind === "approve") gebaut = buildApproveBody(form);
    else if (kind === "reject") gebaut = buildRejectBody(form);
    else if (kind === "deactivate") gebaut = buildDeactivateBody(form);
    else if (kind === "loginOff" || kind === "loginOn") gebaut = buildLoginBody(kind === "loginOn");
    if (!gebaut.ok) { setDialog((d) => ({ ...d, errors: gebaut.errors })); return; }

    inFlight.current = true;
    setBusy(true);
    try {
      const id = partner.id;
      const r = kind === "approve" ? await approveAdminSalesPartner(id, gebaut.body)
        : kind === "reject" ? await rejectAdminSalesPartner(id, gebaut.body)
          : kind === "deactivate" ? await deactivateAdminSalesPartner(id, gebaut.body)
            : kind === "reactivate" ? await reactivateAdminSalesPartner(id)
              : await setAdminSalesPartnerLogin(id, gebaut.body);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;     // zentraler Logout
        let body = null;
        try { body = await r.json(); } catch { body = null; }
        setDialog((d) => (d ? { ...d, error: adminActionErrorText(r.status, body) } : d));
        return;
      }
      setDialog(null);
      setMessage({ type: "success", text: AKTIONEN[kind].success });
      onChanged?.();
    } catch {
      setDialog((d) => (d ? { ...d, error: "Die Aktion wurde nicht ausgeführt. Bitte versuchen Sie es erneut." } : d));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const fehler = (k) => (dialog?.errors?.[k] ? <span className="field-error">{dialog.errors[k]}</span> : null);
  const def = dialog ? AKTIONEN[dialog.kind] : null;

  return (
    <div className="adm-card" id="adm-sp-status-card">
      <div className="adm-card-head">Status und Zugang</div>
      <div className="adm-card-body">
        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`} role="status">{message.text}</div>
        )}
        <dl className="adm-kv">
          <div className="adm-kv-item"><dt>Status</dt><dd><Badge meta={adminPartnerStatusMeta(status)} id="adm-sp-status" /></dd></div>
          <div className="adm-kv-item"><dt>Login</dt><dd><Badge meta={loginStatusMeta(partner.loginStatus)} id="adm-sp-login" /></dd></div>
          <div className="adm-kv-item"><dt>Freigegeben am</dt><dd>{formatTimestamp(partner.approvedAt, { withTime: true })}</dd></div>
          <div className="adm-kv-item"><dt>Vertrag beendet am</dt><dd>{formatTimestamp(partner.contractEndedOn)}</dd></div>
          <div className="adm-kv-item"><dt>Grund der Deaktivierung</dt><dd>{deactivationReasonLabel(partner.deactivationReason)}</dd></div>
        </dl>

        <div className="adm-sp-actions">
          {status === "pending" && (
            <>
              <button type="button" id="adm-sp-approve" className="btn btn-primary btn-sm" onClick={() => oeffnen("approve")}>Freigeben</button>
              <button type="button" id="adm-sp-reject" className="btn btn-outline btn-sm" onClick={() => oeffnen("reject")}>Ablehnen</button>
            </>
          )}
          {status === "active" && (
            <button type="button" id="adm-sp-deactivate" className="btn btn-outline btn-sm" onClick={() => oeffnen("deactivate")}>Deaktivieren</button>
          )}
          {status === "inactive" && (
            <button type="button" id="adm-sp-reactivate" className="btn btn-primary btn-sm" onClick={() => oeffnen("reactivate")}>Reaktivieren</button>
          )}
          {login === true && (
            <button type="button" id="adm-sp-login-off" className="btn btn-outline btn-sm" onClick={() => oeffnen("loginOff")}>Login sperren</button>
          )}
          {login === false && (
            <button type="button" id="adm-sp-login-on" className="btn btn-outline btn-sm" onClick={() => oeffnen("loginOn")}>Login entsperren</button>
          )}
        </div>
        {login === null && partner.loginStatus && (
          <p className="adm-support-hint">Der Loginzustand ist unbekannt — eine Login-Aktion wird deshalb nicht angeboten.</p>
        )}

        {statusHistory.length > 0 && (
          <>
            <h3 className="adm-sp-subtitle">Statusverlauf</h3>
            <ul className="adm-sp-history">
              {statusHistory.map((s, i) => (
                <li key={i} className="adm-sp-history-line">
                  <Badge meta={adminPartnerStatusMeta(s.status)} />
                  <span>ab {formatTimestamp(s.effectiveDate)}</span>
                  {s.reason && <span className="adm-sp-sub">{statusReasonText(s.reason)}</span>}
                  <span className="adm-sp-sub">erfasst {formatTimestamp(s.createdAt, { withTime: true })}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="adm-support-hint">Jede Änderung wird protokolliert.</p>
      </div>

      {dialog && def && (
        <ConfirmDialog
          title={def.title}
          subline={partnerDisplayName(partner)}
          text={def.text}
          note="Die Aktion wird protokolliert."
          confirmLabel={def.confirm}
          danger={def.danger === true}
          busy={busy}
          confirmId="adm-sp-dialog-confirm"
          onCancel={schliessen}
          onConfirm={bestaetigen}
        >
          {dialog.error && <div className="alert alert-error" role="alert">{dialog.error}</div>}
          {dialog.kind === "approve" && (
            <>
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="adm-sp-base">Grundprovision in % (Pflicht)</label>
                <input id="adm-sp-base" className="field-input" type="text" inputMode="decimal" autoComplete="off"
                  value={dialog.form.basePercent} onChange={(e) => setFeld("basePercent", e.target.value)}
                  aria-required="true" aria-invalid={dialog.errors.basePercent ? "true" : undefined} disabled={busy} />
                {fehler("basePercent")}
              </div>
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="adm-sp-l1">Team Ebene 1 in % (optional)</label>
                <input id="adm-sp-l1" className="field-input" type="text" inputMode="decimal" autoComplete="off"
                  value={dialog.form.level1Percent} onChange={(e) => setFeld("level1Percent", e.target.value)}
                  aria-invalid={dialog.errors.level1Percent ? "true" : undefined} disabled={busy} />
                {fehler("level1Percent")}
              </div>
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="adm-sp-l2">Team Ebene 2 in % (optional)</label>
                <input id="adm-sp-l2" className="field-input" type="text" inputMode="decimal" autoComplete="off"
                  value={dialog.form.level2Percent} onChange={(e) => setFeld("level2Percent", e.target.value)}
                  aria-invalid={dialog.errors.level2Percent ? "true" : undefined} disabled={busy} />
                {fehler("level2Percent")}
              </div>
              <p className="adm-edit-hint">Ohne Angabe gelten für die Teamebenen die Standardsätze des Servers.</p>
            </>
          )}
          {dialog.kind === "reject" && (
            <div className="adm-edit-field">
              <label className="adm-edit-label" htmlFor="adm-sp-reject-reason">Begründung (optional)</label>
              <textarea id="adm-sp-reject-reason" className="adm-note-input" maxLength={500}
                value={dialog.form.reason} onChange={(e) => setFeld("reason", e.target.value)} disabled={busy} />
              {fehler("reason")}
            </div>
          )}
          {dialog.kind === "deactivate" && (
            <>
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="adm-sp-deactivate-reason">Grund (Pflicht)</label>
                <select id="adm-sp-deactivate-reason" className="field-select adm-edit-select"
                  value={dialog.form.reason} onChange={(e) => setFeld("reason", e.target.value)}
                  aria-required="true" aria-invalid={dialog.errors.reason ? "true" : undefined} disabled={busy}>
                  <option value="">Bitte wählen</option>
                  {DEACTIVATION_REASON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {fehler("reason")}
              </div>
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="adm-sp-deactivate-note">Notiz (optional)</label>
                <textarea id="adm-sp-deactivate-note" className="adm-note-input" maxLength={1000}
                  value={dialog.form.note} onChange={(e) => setFeld("note", e.target.value)} disabled={busy} />
                {fehler("note")}
              </div>
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

export default SalesPartnerStatusCard;
