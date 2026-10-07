import React, { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { DateField } from "./DateField";
import { createAdminSalesPartnerCap, getAdminSalesPartnerCaps } from "../../api/adminApi";
import {
  CAP_TEXTS,
  adminActionErrorText,
  buildCapBody,
  capLimitText,
  formatTimestamp,
  localIsoDate,
  normalizeCapsResponse,
} from "../../utils/adminSalesPartnerView.mjs";

const FEHLER = "Die individuelle Obergrenze konnte nicht geladen werden.";
const LEER = { validFrom: "", maxOwnRatePercent: "", maxTotalRatePercent: "", reason: "" };

/* ── Individuelle Obergrenze eines Vertriebspartners ─────────────────────────
   Lädt selbständig GET /admin/sales-partner-caps?partnerUserId=… (aktuelle
   Version + Historie) — ein Fehler hier blockiert das Partnerdetail nie. Eine
   Obergrenze ist optional: ohne individuelle Version gilt die globale
   Einstellung (standardmäßig keine Obergrenze). Eine Änderung ist eine NEUE
   Version mit Gültigkeitsbeginn; beide Höchstsätze sind optional (leer heißt
   „keine Grenze"). Der Body entsteht über buildCapBody mit partnerUserId;
   verbindlich ist der Server. */
export function SalesPartnerCapCard({ partnerId }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [form, setForm] = useState(LEER);
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);     // gebauter Body
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const inFlight = useRef(false);
  const lauf = useRef(0);
  const heute = localIsoDate();

  const load = useCallback(async () => {
    const meinLauf = ++lauf.current;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await getAdminSalesPartnerCaps(partnerId);
      if (meinLauf !== lauf.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        setState({ loading: false, error: FEHLER, data: null });
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (meinLauf !== lauf.current) return;
      setState({ loading: false, error: "", data: normalizeCapsResponse(d) });
    } catch {
      if (meinLauf === lauf.current) setState({ loading: false, error: FEHLER, data: null });
    }
  }, [partnerId]);

  useEffect(() => { load(); return () => { lauf.current += 1; }; }, [load]);

  const setFeld = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const pruefen = (e) => {
    e.preventDefault();
    setMessage(null);
    const gebaut = buildCapBody(form, { today: heute, partnerUserId: partnerId });
    if (!gebaut.ok) { setErrors(gebaut.errors); return; }
    setErrors({});
    setConfirm(gebaut.body);
  };

  const senden = async () => {
    if (!confirm || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await createAdminSalesPartnerCap(confirm);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        let body = null;
        try { body = await r.json(); } catch { body = null; }
        setMessage({ type: "error", text: adminActionErrorText(r.status, body) });
        setConfirm(null);
        return;
      }
      setConfirm(null);
      setForm(LEER);
      setMessage({ type: "success", text: "Die neue Version der individuellen Obergrenze wurde angelegt." });
      load();
    } catch {
      setMessage({ type: "error", text: "Die Version wurde nicht angelegt. Bitte versuchen Sie es erneut." });
      setConfirm(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const fehler = (k) => (errors[k] ? <span className="field-error">{errors[k]}</span> : null);
  const aktuell = state.data?.current || null;
  const historie = state.data?.history || [];

  let inhalt;
  if (state.loading && !state.data) {
    inhalt = <div className="loading-center" role="status"><span className="spinner spinner-dark" /> Wird geladen…</div>;
  } else if (state.error || !state.data) {
    inhalt = (
      <>
        <div className="alert alert-error" role="alert">{state.error || FEHLER}</div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>Erneut versuchen</button>
      </>
    );
  } else {
    inhalt = (
      <>
        {aktuell ? (
          <dl className="adm-kv" id="adm-sp-pcap-current">
            <div className="adm-kv-item"><dt>Höchstsatz Eigenprovision</dt><dd>{capLimitText(aktuell.maxOwnRatePercent)}</dd></div>
            <div className="adm-kv-item"><dt>Höchstsatz gesamt</dt><dd>{capLimitText(aktuell.maxTotalRatePercent)}</dd></div>
            <div className="adm-kv-item"><dt>Gültig ab</dt><dd>{formatTimestamp(aktuell.validFrom)}</dd></div>
            <div className="adm-kv-item"><dt>Begründung</dt><dd>{aktuell.reason || "—"}</dd></div>
          </dl>
        ) : (
          <p className="adm-support-hint" id="adm-sp-pcap-none">{CAP_TEXTS.partnerNone}</p>
        )}
        {historie.length > 0 && (
          <>
            <h3 className="adm-sp-subtitle">Historie</h3>
            <div className="table-scroll adm-sp-mini-table">
              <table>
                <caption className="sr-only">Historie der individuellen Obergrenze: gültig ab, Höchstsatz Eigenprovision, Höchstsatz gesamt, Begründung, angelegt.</caption>
                <thead>
                  <tr>
                    <th scope="col">Gültig ab</th>
                    <th scope="col" className="adm-num">Eigenprovision</th>
                    <th scope="col" className="adm-num">Gesamt</th>
                    <th scope="col">Begründung</th>
                    <th scope="col">Angelegt</th>
                  </tr>
                </thead>
                <tbody>
                  {historie.map((c, i) => (
                    <tr key={c.id ?? i}>
                      <td>{formatTimestamp(c.validFrom)}</td>
                      <td className="adm-num">{capLimitText(c.maxOwnRatePercent)}</td>
                      <td className="adm-num">{capLimitText(c.maxTotalRatePercent)}</td>
                      <td>{c.reason || "—"}</td>
                      <td>{formatTimestamp(c.createdAt, { withTime: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div className="adm-card" id="adm-sp-partner-cap-card">
      <div className="adm-card-head">Individuelle Obergrenze</div>
      <div className="adm-card-body">
        {inhalt}

        <h3 className="adm-sp-subtitle">Neue Version gültig ab</h3>
        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}
            role={message.type === "success" ? "status" : "alert"} id="adm-sp-pcap-message">
            {message.text}
          </div>
        )}
        <form className="adm-sp-form" onSubmit={pruefen} noValidate>
          <div className="adm-sp-datefield">
            <DateField id="adm-sp-pcap-from" label="Gültig ab" value={form.validFrom} min={heute}
              invalid={!!errors.validFrom} onChange={(v) => setFeld("validFrom", v)} />
            {fehler("validFrom")}
          </div>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-sp-pcap-own">Höchstsatz Eigenprovision in % (optional)</label>
            <input id="adm-sp-pcap-own" className="field-input" type="text" inputMode="decimal" autoComplete="off"
              value={form.maxOwnRatePercent} onChange={(e) => setFeld("maxOwnRatePercent", e.target.value)}
              aria-invalid={errors.maxOwnRatePercent ? "true" : undefined} />
            {fehler("maxOwnRatePercent")}
          </div>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-sp-pcap-total">Höchstsatz gesamt in % (optional)</label>
            <input id="adm-sp-pcap-total" className="field-input" type="text" inputMode="decimal" autoComplete="off"
              value={form.maxTotalRatePercent} onChange={(e) => setFeld("maxTotalRatePercent", e.target.value)}
              aria-invalid={errors.maxTotalRatePercent ? "true" : undefined} />
            {fehler("maxTotalRatePercent")}
          </div>
          <div className="adm-edit-field adm-sp-form-wide">
            <label className="adm-edit-label" htmlFor="adm-sp-pcap-reason">Begründung (optional)</label>
            <input id="adm-sp-pcap-reason" className="field-input" type="text" maxLength={500}
              value={form.reason} onChange={(e) => setFeld("reason", e.target.value)} />
            {fehler("reason")}
          </div>
          {fehler("partnerUserId")}
          <p className="adm-edit-hint adm-sp-form-wide">{CAP_TEXTS.partnerHint}</p>
          <div className="adm-sp-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" id="adm-sp-pcap-submit">Neue Version anlegen</button>
          </div>
        </form>
      </div>

      {confirm && (
        <ConfirmDialog
          title="Individuelle Obergrenze anlegen"
          text={`Ab ${formatTimestamp(confirm.validFrom)} gelten für diesen Vertriebspartner: Eigenprovision höchstens ${capLimitText(confirm.maxOwnRatePercent)}, gesamt höchstens ${capLimitText(confirm.maxTotalRatePercent)}.`}
          note="Bestehende Versionen bleiben unverändert. Die Aktion wird protokolliert."
          confirmLabel="Version anlegen"
          busy={busy}
          confirmId="adm-sp-pcap-confirm"
          onCancel={() => { if (!busy) setConfirm(null); }}
          onConfirm={senden}
        />
      )}
    </div>
  );
}

export default SalesPartnerCapCard;
