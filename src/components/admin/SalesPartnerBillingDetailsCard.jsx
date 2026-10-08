import React, { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { AdminDisclosureCard } from "./AdminDisclosureCard";
import { billingSummary, sectionSummary } from "../../utils/adminPartnerDetailView.mjs";
import {
  confirmAdminSalesPartnerBillingDetails,
  getAdminSalesPartnerBillingDetails,
  rejectAdminSalesPartnerBillingDetails,
} from "../../api/adminApi";
import { billingStatusMeta } from "../../utils/salesPartnerBilling.mjs";
import { formatTimestamp } from "../../utils/adminSalesPartnerView.mjs";
import {
  MAX_BILLING_REJECT_NOTE,
  SETTLEMENT_TEXTS,
  adminBillingRows,
  billingReviewOutcome,
  billingReviewSuccessText,
  billingReviewable,
  buildBillingConfirmBody,
  buildBillingRejectBody,
  missingFieldsText,
  normalizeAdminBilling,
} from "../../utils/adminSalesPartnerSettlementView.mjs";

const FEHLER = "Die Abrechnungsdaten konnten nicht geladen werden.";

// Wert einer Angabe: fehlend markiert, IBAN und BIC als Kennung abgesetzt.
function Wert({ zeile }) {
  if (zeile.value) return zeile.mono ? <span className="adm-mono">{zeile.value}</span> : zeile.value;
  return zeile.missing ? <span className="adm-sp-missing">{SETTLEMENT_TEXTS.missing}</span> : "—";
}

/* ── Admin · Abrechnungsdaten eines Vertriebspartners ────────────────────────
   Status, Einreichung und Prüfung, alle Angaben einzeln — mit der vollständigen
   IBAN, die der Admin für die manuelle Überweisung braucht (sie erscheint nur
   hier). Was der Server als fehlend meldet, ist markiert. Bestätigen und
   Ablehnen gibt es nur für eine eingereichte Fassung; beide senden deren
   Einreichungszeitpunkt als Token mit. Hat der Partner inzwischen neu
   eingereicht (409), wird der neue Stand geladen statt geraten.

   UX-Paket 4: eingeklappt, der Kopf nennt den Status; wartet eine eingereichte
   Fassung auf die Prüfung, öffnet sich der Bereich von selbst. `refreshKey`
   lädt neu („Aktualisieren" der Seite), `onState` meldet den Ladezustand an
   die Übersicht (kein zweiter Abruf, die IBAN bleibt nur hier). */
export function SalesPartnerBillingDetailsCard({ partnerId, partnerName, refreshKey = 0, onState }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [dialog, setDialog] = useState(null);          // { kind, note, errors, error }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);        // { type, text }
  const inFlight = useRef(false);
  const lauf = useRef(0);

  const load = useCallback(async () => {
    const meinLauf = ++lauf.current;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await getAdminSalesPartnerBillingDetails(partnerId);
      if (meinLauf !== lauf.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;   // zentraler Logout
        setState({ loading: false, error: FEHLER, data: null });
        return;
      }
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (meinLauf !== lauf.current) return;
      setState({ loading: false, error: "", data: normalizeAdminBilling(d) });
    } catch {
      if (meinLauf === lauf.current) setState({ loading: false, error: FEHLER, data: null });
    }
  }, [partnerId]);

  useEffect(() => { load(); return () => { lauf.current += 1; }; }, [load, refreshKey]);
  useEffect(() => { onState?.(state); }, [state, onState]);

  const data = state.data;
  const details = data?.billingDetails || null;

  const oeffnen = (kind) => {
    setMessage(null);
    setDialog({ kind, note: "", errors: {}, error: "" });
  };
  const schliessen = () => { if (!busy) setDialog(null); };

  const senden = async () => {
    if (!dialog || !data || inFlight.current) return;
    const kind = dialog.kind;
    const gebaut = kind === "confirm" ? buildBillingConfirmBody(data) : buildBillingRejectBody(data, { note: dialog.note });
    if (!gebaut.ok) {
      setDialog((x) => (x ? { ...x, errors: gebaut.errors, error: gebaut.errors.submittedAt || "" } : x));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const r = kind === "confirm"
        ? await confirmAdminSalesPartnerBillingDetails(partnerId, gebaut.body)
        : await rejectAdminSalesPartnerBillingDetails(partnerId, gebaut.body);
      let body = null;
      try { body = await r.json(); } catch { body = null; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const folge = billingReviewOutcome(r.status, body);
        if (folge.reload) {
          setDialog(null);
          setMessage({ type: "error", text: folge.text });
          load();
          return;
        }
        setDialog((x) => (x ? { ...x, errors: { ...x.errors, ...folge.fieldErrors }, error: folge.text } : x));
        return;
      }
      setDialog(null);
      setMessage({ type: "success", text: billingReviewSuccessText(kind, body) });
      load();
    } catch {
      setDialog((x) => (x ? { ...x, error: "Die Aktion wurde nicht ausgeführt. Bitte laden Sie den Stand neu und versuchen Sie es erneut." } : x));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  let inhalt;
  if (state.loading && !data) {
    inhalt = <div className="loading-center" role="status"><span className="spinner spinner-dark" /> Wird geladen…</div>;
  } else if (state.error || !data) {
    inhalt = (
      <>
        <div className="alert alert-error" role="alert">{state.error || FEHLER}</div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>Erneut versuchen</button>
      </>
    );
  } else {
    const [cls, label] = billingStatusMeta(data.status);
    const fehlend = missingFieldsText(data.missingFields);
    inhalt = (
      <>
        <dl className="adm-kv">
          <div className="adm-kv-item"><dt>Status</dt><dd><span className={`badge ${cls}`} id="adm-sp-billing-status">{label}</span></dd></div>
          <div className="adm-kv-item"><dt>Eingereicht am</dt><dd>{formatTimestamp(details?.submittedAt, { withTime: true })}</dd></div>
          <div className="adm-kv-item"><dt>Geprüft am</dt><dd>{formatTimestamp(details?.reviewedAt, { withTime: true })}</dd></div>
          <div className="adm-kv-item"><dt>Login-E-Mail</dt><dd>{data.accountEmail || "—"}</dd></div>
          {details?.reviewNote && (
            <div className="adm-kv-item"><dt>Begründung der Ablehnung</dt><dd id="adm-sp-billing-review-note">{details.reviewNote}</dd></div>
          )}
        </dl>

        {fehlend && <div className="adm-note adm-note--warning adm-sp-note" role="note" id="adm-sp-billing-missing">{fehlend}</div>}

        {details ? (
          <>
            <h3 className="adm-sp-subtitle">Angaben</h3>
            <dl className="adm-kv" id="adm-sp-billing-fields">
              {adminBillingRows(data).map((z) => (
                <div className="adm-kv-item" key={z.key} data-field={z.key} data-missing={z.missing ? "true" : undefined}>
                  <dt>{z.label}</dt>
                  <dd><Wert zeile={z} /></dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="adm-support-hint" id="adm-sp-billing-none">{SETTLEMENT_TEXTS.billingNone}</p>
        )}

        {billingReviewable(data) && (
          <div className="adm-sp-actions">
            <button type="button" id="adm-sp-billing-confirm" className="btn btn-primary btn-sm" onClick={() => oeffnen("confirm")}>
              Bestätigen
            </button>
            <button type="button" id="adm-sp-billing-reject" className="btn btn-outline btn-sm" onClick={() => oeffnen("reject")}>
              Ablehnen
            </button>
          </div>
        )}
        <p className="adm-support-hint">Die vollständige Bankverbindung steht ausschließlich hier.</p>
      </>
    );
  }

  const eingereicht = formatTimestamp(details?.submittedAt, { withTime: true });

  return (
    <>
      <AdminDisclosureCard id="adm-sp-billing-card" title="Abrechnungsdaten" summary={sectionSummary(state, billingSummary)}
        attention={billingReviewable(data)}>
        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}
            role={message.type === "success" ? "status" : "alert"} id="adm-sp-billing-message">
            {message.text}
          </div>
        )}
        {inhalt}
      </AdminDisclosureCard>

      {dialog && (
        <ConfirmDialog
          title={dialog.kind === "confirm" ? "Abrechnungsdaten bestätigen" : "Abrechnungsdaten ablehnen"}
          subline={partnerName || undefined}
          text={dialog.kind === "confirm"
            ? `Die am ${eingereicht} eingereichten Angaben werden als geprüft bestätigt. Künftige Gutschriften verwenden diese Angaben.`
            : "Die eingereichten Angaben werden abgelehnt. Der Vertriebspartner sieht die Begründung und kann seine Angaben korrigieren oder erneut einreichen."}
          confirmLabel={dialog.kind === "confirm" ? "Bestätigen" : "Ablehnen"}
          danger={dialog.kind === "reject"}
          busy={busy}
          confirmId="adm-sp-billing-dialog-confirm"
          onCancel={schliessen}
          onConfirm={senden}
        >
          {dialog.error && <div className="alert alert-error" role="alert">{dialog.error}</div>}
          {dialog.kind === "reject" && (
            <div className="adm-edit-field">
              <label className="adm-edit-label" htmlFor="adm-sp-billing-note">Begründung (Pflicht, sichtbar für den Vertriebspartner)</label>
              <textarea id="adm-sp-billing-note" className="adm-note-input" maxLength={MAX_BILLING_REJECT_NOTE}
                value={dialog.note} disabled={busy} aria-required="true"
                aria-invalid={dialog.errors?.note ? "true" : undefined}
                onChange={(e) => setDialog((x) => (x ? { ...x, note: e.target.value, errors: { ...x.errors, note: undefined } } : x))} />
              {dialog.errors?.note && <span className="field-error">{dialog.errors.note}</span>}
            </div>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

export default SalesPartnerBillingDetailsCard;
