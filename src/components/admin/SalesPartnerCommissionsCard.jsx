import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  createAdminSalesPartnerAdjustment,
  listAdminSalesPartnerCommissions,
  reverseAdminSalesPartnerDecision,
} from "../../api/adminApi";
import {
  PARTNER_TEXTS,
  commissionCounterpart,
  commissionLevelLabel,
  commissionTypeMeta,
  formatCents,
  formatMonth,
  formatPercent,
  levelText,
  monthOptions,
  payableLabel,
} from "../../utils/salesPartnerView.mjs";
import {
  adminActionErrorText,
  buildAdjustmentBody,
  buildReverseBody,
  canReverseEntry,
  currentLocalMonth,
  formatTimestamp,
  normalizeAdminCommissions,
  reversedDecisionIds,
} from "../../utils/adminSalesPartnerView.mjs";

const FEHLER = "Die Provisionen konnten nicht geladen werden.";
const MONATE = 24;

function TypeBadge({ type }) {
  const [cls, label] = commissionTypeMeta(type);
  return <span className={`badge ${cls}`}>{label}</span>;
}

// Berechnungsgrundlage einer Entscheidung — ausschließlich Serverwerte.
function DecisionDetails({ entry }) {
  const d = entry.decision;
  return (
    <dl className="adm-kv adm-sp-decision">
      <div className="adm-kv-item"><dt>Versanddatum</dt><dd>{formatTimestamp(d?.dispatchDate)}</dd></div>
      <div className="adm-kv-item"><dt>Grundprovision</dt><dd>{formatPercent(d?.baseRatePercent)}</dd></div>
      <div className="adm-kv-item"><dt>Kunden-Level</dt><dd>{d ? `${levelText(d.customerLevel)} · ${formatPercent(d.customerBonusPercent)}` : "—"}</dd></div>
      <div className="adm-kv-item"><dt>Paket-Level</dt><dd>{d ? `${levelText(d.packageLevel)} · ${formatPercent(d.packageBonusPercent)}` : "—"}</dd></div>
      <div className="adm-kv-item"><dt>Eigenprovision</dt><dd>{formatPercent(d?.ownRatePercent)}{d?.capApplied ? " (Obergrenze angewendet)" : ""}</dd></div>
      <div className="adm-kv-item"><dt>Einkauf netto</dt><dd>{formatCents(d?.purchaseNetCents)}</dd></div>
      <div className="adm-kv-item"><dt>Kundenpreis netto</dt><dd>{formatCents(d?.customerNetCents)}</dd></div>
      <div className="adm-kv-item"><dt>Sendung</dt><dd>
        {entry.shipmentId != null
          ? <Link to={`/admin/shipments/${encodeURIComponent(entry.shipmentId)}`}>Sendung #{entry.shipmentId}</Link>
          : "—"}
      </dd></div>
      {/* Keine Zeile „Technischer Grund": der Rohwert (accrual/reversal/adjustment)
          steht bereits verständlich als Badge in der Spalte „Art". */}
    </dl>
  );
}

const LEERE_KORREKTUR = { amount: "", reason: "", shipmentId: "" };

/* ── Provisionen eines Partners (Admin) ──────────────────────────────────────
   Monatsfilter (der Monat kommt vom Server, keine Uhr), Summen, alle Buchungen
   mit Berechnungsgrundlage, Rücknahme einer Entscheidung (Begründung Pflicht,
   optional neu berechnen) und eine manuelle Korrekturbuchung. Beträge sind die
   des Servers; die Oberfläche addiert nichts. */
export function SalesPartnerCommissionsCard({ partnerId }) {
  // Startwert: der laufende Monat aus Sicht des Admins — die Detailantwort
  // nennt keinen Servermonat. Maßgeblich bleibt der Monat der Antwort.
  const [anker] = useState(() => currentLocalMonth());
  const [month, setMonth] = useState(anker);
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [offen, setOffen] = useState(() => new Set());
  const [reverse, setReverse] = useState(null);        // { entry, reason, reprocess, errors, error }
  const [korrektur, setKorrektur] = useState(LEERE_KORREKTUR);
  const [korrekturErrors, setKorrekturErrors] = useState({});
  const [korrekturConfirm, setKorrekturConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const inFlight = useRef(false);
  const lauf = useRef(0);

  const load = useCallback(async () => {
    const meinLauf = ++lauf.current;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await listAdminSalesPartnerCommissions(partnerId, month);
      if (meinLauf !== lauf.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        setState({ loading: false, error: FEHLER, data: null });
        return;
      }
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (meinLauf !== lauf.current) return;
      const data = normalizeAdminCommissions(d);
      setState({ loading: false, error: "", data });
    } catch {
      if (meinLauf === lauf.current) setState({ loading: false, error: FEHLER, data: null });
    }
  }, [partnerId, month]);

  useEffect(() => { load(); return () => { lauf.current += 1; }; }, [load]);

  const data = state.data;
  const zurueck = reversedDecisionIds(data?.entries || []);
  const optionen = monthOptions(anker, MONATE);
  const gewaehlt = month || data?.month || "";

  const umschalten = (key) => setOffen((alt) => {
    const neu = new Set(alt);
    if (neu.has(key)) neu.delete(key); else neu.add(key);
    return neu;
  });

  const ruecknahmeSenden = async () => {
    if (!reverse || inFlight.current) return;
    const gebaut = buildReverseBody({ reason: reverse.reason, reprocess: reverse.reprocess });
    if (!gebaut.ok) { setReverse((x) => ({ ...x, errors: gebaut.errors })); return; }
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await reverseAdminSalesPartnerDecision(reverse.entry.decisionId, gebaut.body);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        let body = null;
        try { body = await r.json(); } catch { body = null; }
        setReverse((x) => (x ? { ...x, error: adminActionErrorText(r.status, body) } : x));
        return;
      }
      setReverse(null);
      setMessage({ type: "success", text: "Die Entscheidung wurde zurückgenommen." });
      load();
    } catch {
      setReverse((x) => (x ? { ...x, error: "Die Rücknahme wurde nicht ausgeführt. Bitte versuchen Sie es erneut." } : x));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const korrekturPruefen = (e) => {
    e.preventDefault();
    setMessage(null);
    const gebaut = buildAdjustmentBody({ ...korrektur, partnerUserId: partnerId });
    if (!gebaut.ok) { setKorrekturErrors(gebaut.errors); return; }
    setKorrekturErrors({});
    setKorrekturConfirm(gebaut.body);
  };

  const korrekturSenden = async () => {
    if (!korrekturConfirm || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await createAdminSalesPartnerAdjustment(korrekturConfirm);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        let body = null;
        try { body = await r.json(); } catch { body = null; }
        setMessage({ type: "error", text: adminActionErrorText(r.status, body) });
        setKorrekturConfirm(null);
        return;
      }
      setKorrekturConfirm(null);
      setKorrektur(LEERE_KORREKTUR);
      setMessage({ type: "success", text: "Die Korrekturbuchung wurde angelegt." });
      load();
    } catch {
      setMessage({ type: "error", text: "Die Korrekturbuchung wurde nicht angelegt. Bitte versuchen Sie es erneut." });
      setKorrekturConfirm(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const kFehler = (k) => (korrekturErrors[k] ? <span className="field-error">{korrekturErrors[k]}</span> : null);

  return (
    <div className="adm-card" id="adm-sp-commissions-card">
      <div className="adm-card-head">Provisionen</div>
      <div className="adm-card-body">
        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`} role={message.type === "success" ? "status" : "alert"}>
            {message.text}
          </div>
        )}

        <div className="adm-sp-toolbar">
          {optionen.length > 0 && (
            <div className="adm-filter-field">
              <label htmlFor="adm-sp-commission-month">Monat</label>
              <select id="adm-sp-commission-month" value={gewaehlt} disabled={state.loading}
                onChange={(e) => setMonth(e.target.value)}>
                {optionen.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {data && (
            <dl className="adm-kv adm-sp-totals">
              <div className="adm-kv-item"><dt>Provision gesamt</dt><dd>{formatCents(data.totals.accruedCents)}</dd></div>
              <div className="adm-kv-item"><dt>Davon auszahlbar</dt><dd>{formatCents(data.totals.payableCents)}</dd></div>
            </dl>
          )}
        </div>

        {state.loading && !data ? (
          <div className="loading-center" role="status"><span className="spinner spinner-dark" /> Wird geladen…</div>
        ) : state.error || !data ? (
          <>
            <div className="alert alert-error" role="alert">{state.error || FEHLER}</div>
            <button type="button" className="btn btn-outline btn-sm" onClick={load}>Erneut versuchen</button>
          </>
        ) : data.entries.length === 0 ? (
          <p className="adm-support-hint">Für {formatMonth(data.month)} liegen keine Buchungen vor.</p>
        ) : (
          <div className="table-scroll adm-sp-mini-table">
            <table>
              <caption className="sr-only">
                Provisionsbuchungen {formatMonth(data.month)}: Datum, Ebene, Art, Kunde bzw. Teammitglied, {PARTNER_TEXTS.basisLabel}, Satz, Betrag, auszahlbar, Aktion.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Ebene</th>
                  <th scope="col">Art</th>
                  <th scope="col">Kunde bzw. Teammitglied</th>
                  <th scope="col" className="adm-num">{PARTNER_TEXTS.basisLabel}</th>
                  <th scope="col" className="adm-num">Satz</th>
                  <th scope="col" className="adm-num">Betrag</th>
                  <th scope="col">Auszahlbar</th>
                  <th scope="col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e, i) => {
                  const key = String(e.id ?? `i${i}`);
                  return (
                    <React.Fragment key={key}>
                      <tr className={e.type === "accrual" ? undefined : "adm-sp-row-correction"}>
                        <td>{formatTimestamp(e.entryDate)}</td>
                        <td>{commissionLevelLabel(e.level)}</td>
                        <td><TypeBadge type={e.type} />{e.note && <span className="adm-sp-sub adm-sp-block">{e.note}</span>}</td>
                        <td>{commissionCounterpart(e)}</td>
                        <td className="adm-num">{formatCents(e.basisCents)}</td>
                        <td className="adm-num">{formatPercent(e.ratePercent)}</td>
                        <td className="adm-num">{formatCents(e.amountCents)}</td>
                        <td>{payableLabel(e)}</td>
                        <td>
                          <div className="adm-sp-row-actions">
                            {(e.decision || e.shipmentId != null) && (
                              <button type="button" className="btn btn-ghost btn-sm" aria-expanded={offen.has(key)}
                                onClick={() => umschalten(key)}>
                                {offen.has(key) ? "Grundlage ausblenden" : "Grundlage"}
                              </button>
                            )}
                            {canReverseEntry(e, zurueck) && (
                              <button type="button" className="btn btn-outline btn-sm" id={`adm-sp-reverse-${key}`}
                                onClick={() => { setMessage(null); setReverse({ entry: e, reason: "", reprocess: false, errors: {}, error: "" }); }}>
                                Rücknahme
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {offen.has(key) && (
                        <tr className="adm-sp-decision-row">
                          <td colSpan={9}><DecisionDetails entry={e} /></td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="adm-sp-subtitle">Korrekturbuchung</h3>
        <form className="adm-sp-form" onSubmit={korrekturPruefen} noValidate>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-sp-adjust-amount">Betrag in € (negativ für Abzug)</label>
            <input id="adm-sp-adjust-amount" className="field-input" type="text" inputMode="decimal" autoComplete="off"
              value={korrektur.amount} onChange={(e) => setKorrektur((k) => ({ ...k, amount: e.target.value }))}
              aria-invalid={korrekturErrors.amount ? "true" : undefined} />
            {kFehler("amount")}
          </div>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-sp-adjust-shipment">Sendung (optional)</label>
            <input id="adm-sp-adjust-shipment" className="field-input" type="text" inputMode="numeric" autoComplete="off"
              value={korrektur.shipmentId} onChange={(e) => setKorrektur((k) => ({ ...k, shipmentId: e.target.value }))}
              aria-invalid={korrekturErrors.shipmentId ? "true" : undefined} />
            {kFehler("shipmentId")}
          </div>
          <div className="adm-edit-field adm-sp-form-wide">
            <label className="adm-edit-label" htmlFor="adm-sp-adjust-reason">Begründung (Pflicht)</label>
            <input id="adm-sp-adjust-reason" className="field-input" type="text" maxLength={500}
              value={korrektur.reason} onChange={(e) => setKorrektur((k) => ({ ...k, reason: e.target.value }))}
              aria-invalid={korrekturErrors.reason ? "true" : undefined} />
            {kFehler("reason")}
          </div>
          {kFehler("partnerUserId")}
          <div className="adm-sp-form-actions">
            <button type="submit" className="btn btn-outline btn-sm" id="adm-sp-adjust-submit">Korrektur buchen</button>
          </div>
        </form>
      </div>

      {reverse && (
        <ConfirmDialog
          title="Entscheidung zurücknehmen"
          subline={`Buchung vom ${formatTimestamp(reverse.entry.entryDate)} · ${formatCents(reverse.entry.amountCents)}`}
          text="Die Provisionsentscheidung zu dieser Buchung wird zurückgenommen. Auf Wunsch wird sie anschließend neu berechnet."
          note="Die Aktion wird protokolliert."
          confirmLabel="Zurücknehmen"
          irreversible
          busy={busy}
          confirmId="adm-sp-reverse-confirm"
          onCancel={() => { if (!busy) setReverse(null); }}
          onConfirm={ruecknahmeSenden}
        >
          {reverse.error && <div className="alert alert-error" role="alert">{reverse.error}</div>}
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-sp-reverse-reason">Begründung (Pflicht)</label>
            <textarea id="adm-sp-reverse-reason" className="adm-note-input" maxLength={500}
              value={reverse.reason} disabled={busy}
              onChange={(e) => setReverse((x) => ({ ...x, reason: e.target.value, errors: {} }))}
              aria-invalid={reverse.errors?.reason ? "true" : undefined} />
            {reverse.errors?.reason && <span className="field-error">{reverse.errors.reason}</span>}
          </div>
          <label className="adm-sp-choice">
            <input type="checkbox" id="adm-sp-reverse-reprocess" checked={reverse.reprocess === true} disabled={busy}
              onChange={(e) => setReverse((x) => ({ ...x, reprocess: e.target.checked }))} />
            Anschließend neu berechnen
          </label>
        </ConfirmDialog>
      )}

      {korrekturConfirm && (
        <ConfirmDialog
          title="Korrekturbuchung anlegen"
          text={`Es wird eine Korrektur über ${formatCents(korrekturConfirm.amountCents)} gebucht.`}
          note="Die Aktion wird protokolliert."
          confirmLabel="Korrektur buchen"
          irreversible
          busy={busy}
          confirmId="adm-sp-adjust-confirm"
          onCancel={() => { if (!busy) setKorrekturConfirm(null); }}
          onConfirm={korrekturSenden}
        />
      )}
    </div>
  );
}

export default SalesPartnerCommissionsCard;
