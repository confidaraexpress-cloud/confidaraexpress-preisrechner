import React, { useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { DateField } from "./DateField";
import { LevelRulesEditor, RuleSetHistory, RuleSetView } from "./SalesPartnerLevelRules";
import { createAdminSalesPartnerLevelRules } from "../../api/adminApi";
import {
  adminActionErrorText,
  buildPartnerLevelRulesBody,
  emptyLevelRulesForm,
  formatTimestamp,
  localIsoDate,
} from "../../utils/adminSalesPartnerView.mjs";

const neuesFormular = () => ({ ...emptyLevelRulesForm(), mode: "" });

/* ── Level-Regeln eines Partners: global oder eigene ─────────────────────────
   Ohne eigene Version gelten die globalen Regeln. Eine Änderung ist eine neue
   Version mit Gültigkeitsbeginn — entweder „inherit" (zurück zu den globalen
   Regeln) oder eigene Regeln mit 5 + 5 Level und Mindestpaketen. Schwellen
   werden nie vorbelegt. */
export function SalesPartnerLevelRulesCard({ partnerId, levelRules, onChanged }) {
  const [form, setForm] = useState(neuesFormular);
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const inFlight = useRef(false);
  const heute = localIsoDate();

  const modus = levelRules?.mode === "custom" ? "Eigene Regeln" : levelRules?.mode === "global" ? "Globale Regeln" : "—";

  const pruefen = (e) => {
    e.preventDefault();
    setMessage(null);
    const gebaut = buildPartnerLevelRulesBody(form, { today: heute });
    if (!gebaut.ok) { setErrors(gebaut.errors); return; }
    setErrors({});
    setConfirm(gebaut.body);
  };

  const senden = async () => {
    if (!confirm || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await createAdminSalesPartnerLevelRules(partnerId, confirm);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        let body = null;
        try { body = await r.json(); } catch { body = null; }
        setMessage({ type: "error", text: adminActionErrorText(r.status, body) });
        setConfirm(null);
        return;
      }
      setConfirm(null);
      setForm(neuesFormular());
      setMessage({ type: "success", text: "Die neue Regelversion wurde angelegt." });
      onChanged?.();
    } catch {
      setMessage({ type: "error", text: "Die Regelversion wurde nicht angelegt. Bitte versuchen Sie es erneut." });
      setConfirm(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const fehler = (k) => (errors[k] ? <span className="field-error">{errors[k]}</span> : null);

  return (
    <div className="adm-card" id="adm-sp-levels-card">
      <div className="adm-card-head">Level-Regeln</div>
      <div className="adm-card-body">
        <dl className="adm-kv">
          <div className="adm-kv-item"><dt>Es gelten</dt><dd id="adm-sp-levels-mode">{modus}</dd></div>
        </dl>
        <RuleSetView ruleSet={levelRules?.current || null} caption="Aktuelle Level-Regeln des Partners" />

        <h3 className="adm-sp-subtitle">Historie</h3>
        <RuleSetHistory history={levelRules?.history || []} caption="Frühere Level-Regeln des Partners" />

        <h3 className="adm-sp-subtitle">Neue Version gültig ab</h3>
        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`} role={message.type === "success" ? "status" : "alert"}>
            {message.text}
          </div>
        )}
        <form onSubmit={pruefen} noValidate className="adm-sp-stack">
          <fieldset className="adm-sp-fieldset">
            <legend className="adm-edit-label">Welche Regeln sollen gelten?</legend>
            <label className="adm-sp-choice">
              <input type="radio" name="adm-sp-levels-mode" id="adm-sp-levels-inherit"
                checked={form.mode === "inherit"} onChange={() => setForm((f) => ({ ...f, mode: "inherit" }))} />
              Globale Regeln übernehmen
            </label>
            <label className="adm-sp-choice">
              <input type="radio" name="adm-sp-levels-mode" id="adm-sp-levels-custom"
                checked={form.mode === "custom"} onChange={() => setForm((f) => ({ ...f, mode: "custom" }))} />
              Eigene Regeln festlegen
            </label>
            {fehler("mode")}
          </fieldset>
          <div className="adm-sp-form">
            <div className="adm-sp-datefield">
              <DateField id="adm-sp-levels-from" label="Gültig ab" value={form.validFrom} min={heute}
                invalid={!!errors.validFrom} onChange={(v) => setForm((f) => ({ ...f, validFrom: v }))} />
              {fehler("validFrom")}
            </div>
            <div className="adm-edit-field adm-sp-form-wide">
              <label className="adm-edit-label" htmlFor="adm-sp-levels-reason">Begründung (optional)</label>
              <input id="adm-sp-levels-reason" className="field-input" type="text" maxLength={500}
                value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
              {fehler("reason")}
            </div>
          </div>
          {form.mode === "custom" && (
            <LevelRulesEditor value={form} onChange={(next) => setForm(next)} errors={errors} idPrefix="adm-sp-levels" />
          )}
          <div className="adm-sp-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" id="adm-sp-levels-submit">Neue Version anlegen</button>
          </div>
        </form>
      </div>

      {confirm && (
        <ConfirmDialog
          title="Neue Regelversion anlegen"
          text={confirm.mode === "inherit"
            ? `Ab ${formatTimestamp(confirm.validFrom)} gelten für diesen Partner die globalen Level-Regeln.`
            : `Ab ${formatTimestamp(confirm.validFrom)} gelten für diesen Partner eigene Level-Regeln (Mindestpakete ${confirm.minPackagesForActiveCustomer}).`}
          note="Bestehende Versionen bleiben unverändert. Die Aktion wird protokolliert."
          confirmLabel="Version anlegen"
          busy={busy}
          confirmId="adm-sp-levels-confirm"
          onCancel={() => { if (!busy) setConfirm(null); }}
          onConfirm={senden}
        />
      )}
    </div>
  );
}

export default SalesPartnerLevelRulesCard;
