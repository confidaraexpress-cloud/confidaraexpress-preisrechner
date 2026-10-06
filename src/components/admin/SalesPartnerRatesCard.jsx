import React, { useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { DateField } from "./DateField";
import { createAdminSalesPartnerRates } from "../../api/adminApi";
import { formatPercent } from "../../utils/salesPartnerView.mjs";
import {
  adminActionErrorText,
  buildRatesBody,
  formatTimestamp,
  localIsoDate,
} from "../../utils/adminSalesPartnerView.mjs";

const LEER = { validFrom: "", basePercent: "", level1Percent: "", level2Percent: "", reason: "" };

/* ── Provisionssätze: aktuelle Version, Historie, neue Version ───────────────
   Eine Änderung ist immer eine NEUE Version mit Gültigkeitsbeginn (heute oder
   später) — keine Version wird überschrieben. Die Prüfung vor dem Senden
   übernimmt buildRatesBody; verbindlich ist der Server. */
export function SalesPartnerRatesCard({ partnerId, rates, onChanged }) {
  const [form, setForm] = useState(LEER);
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);     // gebauter Body
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const inFlight = useRef(false);
  const heute = localIsoDate();

  const setFeld = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const pruefen = (e) => {
    e.preventDefault();
    setMessage(null);
    const gebaut = buildRatesBody(form, { today: heute });
    if (!gebaut.ok) { setErrors(gebaut.errors); return; }
    setErrors({});
    setConfirm(gebaut.body);
  };

  const senden = async () => {
    if (!confirm || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await createAdminSalesPartnerRates(partnerId, confirm);
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
      setMessage({ type: "success", text: "Die neue Satzversion wurde angelegt." });
      onChanged?.();
    } catch {
      setMessage({ type: "error", text: "Die Satzversion wurde nicht angelegt. Bitte versuchen Sie es erneut." });
      setConfirm(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const fehler = (k) => (errors[k] ? <span className="field-error">{errors[k]}</span> : null);
  const aktuell = rates?.current || null;
  const historie = rates?.history || [];

  return (
    <div className="adm-card" id="adm-sp-rates-card">
      <div className="adm-card-head">Provisionssätze</div>
      <div className="adm-card-body">
        {aktuell ? (
          <dl className="adm-kv">
            <div className="adm-kv-item"><dt>Grundprovision</dt><dd>{formatPercent(aktuell.basePercent)}</dd></div>
            <div className="adm-kv-item"><dt>Team Ebene 1</dt><dd>{formatPercent(aktuell.level1Percent)}</dd></div>
            <div className="adm-kv-item"><dt>Team Ebene 2</dt><dd>{formatPercent(aktuell.level2Percent)}</dd></div>
            <div className="adm-kv-item"><dt>Gültig ab</dt><dd>{formatTimestamp(aktuell.validFrom)}</dd></div>
            <div className="adm-kv-item"><dt>Begründung</dt><dd>{aktuell.reason || "—"}</dd></div>
          </dl>
        ) : (
          <p className="adm-support-hint">Noch keine Satzversion — Sätze entstehen mit der Freigabe.</p>
        )}

        {historie.length > 0 && (
          <>
            <h3 className="adm-sp-subtitle">Historie</h3>
            <div className="table-scroll adm-sp-mini-table">
              <table>
                <caption className="sr-only">Historie der Provisionssätze: gültig ab, Grundprovision, Ebene 1, Ebene 2, Begründung, angelegt.</caption>
                <thead>
                  <tr>
                    <th scope="col">Gültig ab</th>
                    <th scope="col" className="adm-num">Grund</th>
                    <th scope="col" className="adm-num">Ebene 1</th>
                    <th scope="col" className="adm-num">Ebene 2</th>
                    <th scope="col">Begründung</th>
                    <th scope="col">Angelegt</th>
                  </tr>
                </thead>
                <tbody>
                  {historie.map((v, i) => (
                    <tr key={v.id ?? i}>
                      <td>{formatTimestamp(v.validFrom)}</td>
                      <td className="adm-num">{formatPercent(v.basePercent)}</td>
                      <td className="adm-num">{formatPercent(v.level1Percent)}</td>
                      <td className="adm-num">{formatPercent(v.level2Percent)}</td>
                      <td>{v.reason || "—"}</td>
                      <td>{formatTimestamp(v.createdAt, { withTime: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h3 className="adm-sp-subtitle">Neue Version gültig ab</h3>
        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`} role={message.type === "success" ? "status" : "alert"}>
            {message.text}
          </div>
        )}
        <form className="adm-sp-form" onSubmit={pruefen} noValidate>
          <div className="adm-sp-datefield">
            <DateField id="adm-sp-rates-from" label="Gültig ab" value={form.validFrom} min={heute}
              invalid={!!errors.validFrom} onChange={(v) => setFeld("validFrom", v)} />
            {fehler("validFrom")}
          </div>
          {[["basePercent", "Grundprovision in %", "adm-sp-rates-base"],
            ["level1Percent", "Team Ebene 1 in %", "adm-sp-rates-l1"],
            ["level2Percent", "Team Ebene 2 in %", "adm-sp-rates-l2"]].map(([k, label, id]) => (
            <div className="adm-edit-field" key={k}>
              <label className="adm-edit-label" htmlFor={id}>{label}</label>
              <input id={id} className="field-input" type="text" inputMode="decimal" autoComplete="off"
                value={form[k]} onChange={(e) => setFeld(k, e.target.value)}
                aria-invalid={errors[k] ? "true" : undefined} />
              {fehler(k)}
            </div>
          ))}
          <div className="adm-edit-field adm-sp-form-wide">
            <label className="adm-edit-label" htmlFor="adm-sp-rates-reason">Begründung (optional)</label>
            <input id="adm-sp-rates-reason" className="field-input" type="text" maxLength={500}
              value={form.reason} onChange={(e) => setFeld("reason", e.target.value)} />
            {fehler("reason")}
          </div>
          <div className="adm-sp-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" id="adm-sp-rates-submit">Neue Version anlegen</button>
          </div>
        </form>
      </div>

      {confirm && (
        <ConfirmDialog
          title="Neue Satzversion anlegen"
          text={`Ab ${formatTimestamp(confirm.validFrom)} gelten: Grundprovision ${formatPercent(confirm.basePercent)}, Team Ebene 1 ${formatPercent(confirm.level1Percent)}, Team Ebene 2 ${formatPercent(confirm.level2Percent)}.`}
          note="Bestehende Versionen bleiben unverändert. Die Aktion wird protokolliert."
          confirmLabel="Version anlegen"
          busy={busy}
          confirmId="adm-sp-rates-confirm"
          onCancel={() => { if (!busy) setConfirm(null); }}
          onConfirm={senden}
        />
      )}
    </div>
  );
}

export default SalesPartnerRatesCard;
