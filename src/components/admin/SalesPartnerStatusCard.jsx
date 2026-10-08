import React, { useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { DateField } from "./DateField";
import { AdminSubDisclosure } from "./AdminDisclosureCard";
import { DETAIL_TEXTS, statusHistoryLabel } from "../../utils/adminPartnerDetailView.mjs";
import {
  approveAdminSalesPartner,
  deactivateAdminSalesPartner,
  reactivateAdminSalesPartner,
  rejectAdminSalesPartner,
  setAdminSalesPartnerLogin,
} from "../../api/adminApi";
import {
  DEACTIVATION_REASON_OPTIONS,
  RATE_TEXTS,
  adminActionErrorText,
  adminPartnerStatusMeta,
  approveFormFromDefaults,
  buildApproveBody,
  buildDeactivateBody,
  buildLoginBody,
  buildReactivateBody,
  buildRejectBody,
  deactivationReasonLabel,
  formatTimestamp,
  loginActionErrorText,
  loginEnabledState,
  loginStatusKnown,
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
  // Deaktivieren und Login sperren sind zwei getrennte Funktionen (Server:
  // routes/admin/salesPartners.js) — der Text nennt die tatsächlichen Folgen.
  // „{ab}“ ist der Wirksamkeitstag: heute, oder das gewählte Datum eines Testpartners.
  deactivate: {
    title: "Vertriebspartner deaktivieren",
    text: "{ab} entstehen für diesen Partner keine neuen Provisionen, und er zählt nicht mehr im Team seines Sponsors. Bisherige Provisionen und Kundenzuordnungen bleiben erhalten. Der Login bleibt aktiv – zum Aussperren zusätzlich „Login sperren“ verwenden. Eine Reaktivierung bleibt möglich.",
    confirm: "Deaktivieren",
    danger: true,
    success: "Der Vertriebspartner wurde deaktiviert. Sein Login ist unverändert.",
  },
  reactivate: {
    title: "Vertriebspartner reaktivieren",
    text: "{ab} entstehen wieder Provisionen. In der Platzreihenfolge im Team seines Sponsors zählt er als neu aktiviert. Der Login wird dadurch nicht verändert.",
    confirm: "Reaktivieren",
    success: "Der Vertriebspartner wurde reaktiviert.",
  },
  loginOff: {
    title: "Login sperren",
    text: "Der Partner kann sich nicht mehr anmelden, bis der Login wieder entsperrt wird. Status und Provisionen bleiben unverändert.",
    confirm: "Login sperren",
    danger: true,
    success: "Der Login wurde gesperrt.",
  },
  loginOn: {
    title: "Login entsperren",
    text: "Der Partner kann sich wieder anmelden. Status und Provisionen bleiben unverändert.",
    confirm: "Login entsperren",
    success: "Der Login wurde entsperrt.",
  },
});

// Wirksamkeitstag im Dialogtext: ohne Datumsfeld gilt heute.
const dialogText = (def, mitDatum) =>
  def.text.replace("{ab}", mitDatum ? "Ab dem gewählten Tag (ohne Angabe ab heute)" : "Ab heute");

// Den Login steuert der Server nur für freigegebene Partner (aktiv oder inaktiv);
// bei einem abgelehnten oder offenen Antrag gibt es keine Login-Aktion.
const LOGIN_STEUERBAR = Object.freeze(["active", "inactive"]);

const LEERE_FORMULARE = Object.freeze({
  reject: { reason: "" },
  deactivate: { reason: "", note: "", effectiveDate: "" },
  reactivate: { effectiveDate: "" },
});
// Aktionen, die bei einem Testpartner im Pre-Live-Testmodus ein
// (zurückliegendes) Wirksamkeitsdatum tragen dürfen.
const MIT_DATUM = Object.freeze(["approve", "deactivate", "reactivate"]);

/* ── Status und Zugang eines Vertriebspartners ───────────────────────────────
   Freigeben (Pflichtfeld Grundprovision, vorbelegt mit den Startsätzen des
   Servers), Ablehnen, Deaktivieren mit Grund, Reaktivieren, Login
   sperren/entsperren — jede Aktion über den zentralen Bestätigungsdialog,
   jeder Body über utils/adminSalesPartnerView.mjs. Welche Aktion angeboten
   wird, folgt dem Status des Servers; ein unbekannter Loginzustand bietet
   bewusst keine Login-Aktion an (fail-closed). Ein Wirksamkeitsdatum (auch
   zurückliegend) gibt es bei Freigabe, Deaktivierung und Reaktivierung NUR,
   wenn der Server `datesBeforeTodayAllowed` meldet (Testpartner im
   Pre-Live-Testmodus); sonst gilt sein Standard „heute".

   UX-Paket 4: Bei einem offenen Antrag trägt die Karte den Titel „Antrag
   prüfen" und die Angaben des Antrags (`intro`, von der Detailseite) vor
   Freigeben/Ablehnen — oben auf der Seite, ohne Suchen. Kennwerte erscheinen
   nur, wenn sie etwas sagen; der Statusverlauf ist eingeklappt. */
export function SalesPartnerStatusCard({ partner, statusHistory = [], startDefaults = null, datesBeforeTodayAllowed = false, onChanged,
  title = DETAIL_TEXTS.statusTitle, intro = null }) {
  const [dialog, setDialog] = useState(null);       // { kind, form, errors, error }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);     // { type, text }
  const inFlight = useRef(false);

  const status = partner.status;
  const login = loginEnabledState(partner.loginStatus);
  // Vorbelegt wird nur mit den Startsätzen des Servers — ohne sie bleibt das
  // Formular leer (Grundprovision Pflicht, Ebenen optional).
  const vorbelegt = !!(startDefaults && (startDefaults.basePercent || startDefaults.level1Percent || startDefaults.level2Percent));
  const oeffnen = (kind) => {
    setMessage(null);
    const form = kind === "approve" ? { ...approveFormFromDefaults(startDefaults), effectiveDate: "" } : { ...(LEERE_FORMULARE[kind] || {}) };
    setDialog({ kind, form, errors: {}, error: "" });
  };
  const schliessen = () => { if (!busy) setDialog(null); };
  const setFeld = (k, v) => setDialog((d) => (d ? { ...d, form: { ...d.form, [k]: v }, errors: { ...d.errors, [k]: undefined } } : d));

  const mitDatum = datesBeforeTodayAllowed === true;
  const bestaetigen = async () => {
    if (!dialog || inFlight.current) return;
    const { kind, form } = dialog;
    const datum = { allowEffectiveDate: mitDatum };
    let gebaut = { ok: true, body: {} };
    if (kind === "approve") gebaut = buildApproveBody(form, datum);
    else if (kind === "reject") gebaut = buildRejectBody(form);
    else if (kind === "deactivate") gebaut = buildDeactivateBody(form, datum);
    else if (kind === "reactivate") gebaut = buildReactivateBody(form, datum);
    else if (kind === "loginOff" || kind === "loginOn") gebaut = buildLoginBody(kind === "loginOn");
    if (!gebaut.ok) { setDialog((d) => ({ ...d, errors: gebaut.errors })); return; }

    inFlight.current = true;
    setBusy(true);
    try {
      const id = partner.id;
      const r = kind === "approve" ? await approveAdminSalesPartner(id, gebaut.body)
        : kind === "reject" ? await rejectAdminSalesPartner(id, gebaut.body)
          : kind === "deactivate" ? await deactivateAdminSalesPartner(id, gebaut.body)
            : kind === "reactivate" ? await reactivateAdminSalesPartner(id, gebaut.body)
              : await setAdminSalesPartnerLogin(id, gebaut.body);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;     // zentraler Logout
        let body = null;
        try { body = await r.json(); } catch { body = null; }
        const text = kind === "loginOff" || kind === "loginOn"
          ? loginActionErrorText(r.status, body)
          : adminActionErrorText(r.status, body);
        setDialog((d) => (d ? { ...d, error: text } : d));
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
  // Wirksamkeitsdatum: nur mit Freigabe des Servers, ohne min (zurückliegend erlaubt).
  const datumsFeld = dialog && mitDatum && MIT_DATUM.includes(dialog.kind) ? (
    <div className="adm-sp-datefield">
      <DateField id={`adm-sp-${dialog.kind}-date`} label="Wirksam ab (optional, darf zurückliegen)" value={dialog.form.effectiveDate || ""}
        invalid={!!dialog.errors.effectiveDate} disabled={busy} onChange={(v) => setFeld("effectiveDate", v)} />
      <span className="adm-edit-hint">Ohne Angabe gilt heute. Nur für Testpartner im Pre-Live-Testmodus.</span>
      {fehler("effectiveDate")}
    </div>
  ) : null;

  // Nur belegte Kennwerte: ein Freigabetag gibt es erst nach der Freigabe,
  // Vertragsende und Deaktivierungsgrund nur, wenn der Server sie meldet.
  const freigegeben = LOGIN_STEUERBAR.includes(status);
  return (
    <div className="adm-card" id="adm-sp-status-card">
      <div className="adm-card-head">{title}</div>
      <div className="adm-card-body">
        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`} role="status">{message.text}</div>
        )}
        {intro}
        <dl className="adm-kv">
          <div className="adm-kv-item"><dt>Status</dt><dd><Badge meta={adminPartnerStatusMeta(status)} id="adm-sp-status" /></dd></div>
          <div className="adm-kv-item"><dt>Login</dt><dd><Badge meta={loginStatusMeta(partner.loginStatus)} id="adm-sp-login" /></dd></div>
          {freigegeben && <div className="adm-kv-item"><dt>Freigegeben am</dt><dd>{formatTimestamp(partner.approvedAt, { withTime: true })}</dd></div>}
          {partner.contractEndedOn && <div className="adm-kv-item"><dt>Vertrag beendet am</dt><dd>{formatTimestamp(partner.contractEndedOn)}</dd></div>}
          {partner.deactivationReason && <div className="adm-kv-item"><dt>Grund der Deaktivierung</dt><dd>{deactivationReasonLabel(partner.deactivationReason)}</dd></div>}
        </dl>

        <div className="adm-sp-actions">
          {status === "pending" && (
            <>
              <button type="button" id="adm-sp-approve" className="btn btn-primary" onClick={() => oeffnen("approve")}>Freigeben</button>
              <button type="button" id="adm-sp-reject" className="btn btn-outline" onClick={() => oeffnen("reject")}>Ablehnen</button>
            </>
          )}
          {status === "active" && (
            <button type="button" id="adm-sp-deactivate" className="btn btn-outline btn-sm" onClick={() => oeffnen("deactivate")}>Deaktivieren</button>
          )}
          {status === "inactive" && (
            <button type="button" id="adm-sp-reactivate" className="btn btn-primary btn-sm" onClick={() => oeffnen("reactivate")}>Reaktivieren</button>
          )}
          {login === true && LOGIN_STEUERBAR.includes(status) && (
            <button type="button" id="adm-sp-login-off" className="btn btn-outline btn-sm" onClick={() => oeffnen("loginOff")}>Login sperren</button>
          )}
          {login === false && LOGIN_STEUERBAR.includes(status) && (
            <button type="button" id="adm-sp-login-on" className="btn btn-outline btn-sm" onClick={() => oeffnen("loginOn")}>Login entsperren</button>
          )}
        </div>
        {/* „Noch kein Login" (pending) erklärt sich selbst; nur ein nicht
            zugeordneter Zustand (anonymisiert oder unbekannt) bekommt den Hinweis. */}
        {login === null && partner.loginStatus && !loginStatusKnown(partner.loginStatus) && (
          <p className="adm-support-hint" id="adm-sp-login-unknown">Der Loginzustand ist unbekannt — eine Login-Aktion wird deshalb nicht angeboten.</p>
        )}

        {statusHistory.length > 0 && (
          <div className="adm-sp-folds">
            <AdminSubDisclosure id="adm-sp-status-history" title={statusHistoryLabel(statusHistory.length)}>
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
            </AdminSubDisclosure>
          </div>
        )}
        <p className="adm-support-hint">Jede Änderung wird protokolliert.</p>
      </div>

      {dialog && def && (
        <ConfirmDialog
          title={def.title}
          subline={partnerDisplayName(partner)}
          text={dialogText(def, mitDatum)}
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
                <label className="adm-edit-label" htmlFor="adm-sp-l1">Teamprovision Ebene 1 in % (optional)</label>
                <input id="adm-sp-l1" className="field-input" type="text" inputMode="decimal" autoComplete="off"
                  value={dialog.form.level1Percent} onChange={(e) => setFeld("level1Percent", e.target.value)}
                  aria-invalid={dialog.errors.level1Percent ? "true" : undefined} disabled={busy} />
                {fehler("level1Percent")}
              </div>
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="adm-sp-l2">Teamprovision Ebene 2 in % (optional)</label>
                <input id="adm-sp-l2" className="field-input" type="text" inputMode="decimal" autoComplete="off"
                  value={dialog.form.level2Percent} onChange={(e) => setFeld("level2Percent", e.target.value)}
                  aria-invalid={dialog.errors.level2Percent ? "true" : undefined} disabled={busy} />
                {fehler("level2Percent")}
              </div>
              <p className="adm-edit-hint" id="adm-sp-approve-hint">
                {vorbelegt
                  ? `Vorbelegt mit den Startsätzen. Sie können die Werte vor der Freigabe ändern; ${RATE_TEXTS.teamDefaultInline}`
                  : RATE_TEXTS.teamDefault}
              </p>
              <p className="adm-edit-hint" id="adm-sp-approve-team-hint">{RATE_TEXTS.teamExplain}</p>
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
          {datumsFeld}
        </ConfirmDialog>
      )}
    </div>
  );
}

export default SalesPartnerStatusCard;
