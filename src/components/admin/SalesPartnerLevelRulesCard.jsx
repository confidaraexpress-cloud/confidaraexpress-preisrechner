import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "./ConfirmDialog";
import { DateField } from "./DateField";
import { AdminDisclosureCard, AdminSubDisclosure } from "./AdminDisclosureCard";
import { LevelRulesEditor, RuleSetHistory, RuleSetView } from "./SalesPartnerLevelRules";
import { createAdminSalesPartnerLevelRules } from "../../api/adminApi";
import {
  adminActionErrorText,
  buildPartnerLevelRulesBody,
  formatTimestamp,
  localIsoDate,
} from "../../utils/adminSalesPartnerView.mjs";
import {
  DETAIL_TEXTS,
  allVersionsLabel,
  levelRulesPrefillNote,
  levelRulesSummary,
  partnerLevelRulesPrefill,
} from "../../utils/adminPartnerDetailView.mjs";

/* ── Level-Regeln eines Partners: global oder eigene ─────────────────────────
   Ohne eigene Version gelten die globalen Regeln. Eine Änderung ist eine neue
   Version mit Gültigkeitsbeginn — entweder „inherit" (zurück zu den globalen
   Regeln) oder eigene Regeln mit 5 + 5 Level und Mindestpaketen.

   UX-Paket 4: ein eingeklappter Bereich, dessen Kopf sagt, welche Regeln
   gelten; Versionsverlauf und Formular sind darin noch einmal eingeklappt. Das
   Formular übernimmt beim Öffnen die aktuell geltenden eigenen Regeln des
   Partners, sonst die Startwerte des Servers (ohne beide leer und Pflicht). */
export function SalesPartnerLevelRulesCard({ partnerId, levelRules, startDefaults = null, allowPastDates = false, onChanged }) {
  const [form, setForm] = useState(() => partnerLevelRulesPrefill({ levelRules, startDefaults }).form);
  const [quelle, setQuelle] = useState(null);
  const [formOffen, setFormOffen] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const inFlight = useRef(false);
  const heute = localIsoDate();

  const modus = levelRules?.mode === "custom" ? "Eigene Regeln" : levelRules?.mode === "global" ? "Globale Regeln" : "—";
  const historie = levelRules?.history || [];

  // Jedes Öffnen beginnt mit der aktuellen Vorbelegung; Schließen verwirft.
  const formular = (offen) => {
    if (offen) {
      const v = partnerLevelRulesPrefill({ levelRules, startDefaults });
      setForm(v.form);
      setQuelle(v.source);
      setErrors({});
      setMessage(null);
    }
    setFormOffen(offen);
  };

  const pruefen = (e) => {
    e.preventDefault();
    setMessage(null);
    const gebaut = buildPartnerLevelRulesBody(form, { today: heute, allowPast: allowPastDates === true });
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
      setFormOffen(false);
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
    <>
      <AdminDisclosureCard id="adm-sp-levels-card" title="Level-Regeln" summary={levelRulesSummary(levelRules)}>
        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`} role={message.type === "success" ? "status" : "alert"}>
            {message.text}
          </div>
        )}
        <dl className="adm-kv">
          <div className="adm-kv-item"><dt>Es gelten</dt><dd id="adm-sp-levels-mode">{modus}</dd></div>
        </dl>
        {levelRules?.mode === "global" && !levelRules?.current ? (
          <p className="adm-support-hint" id="adm-sp-levels-global">
            Es gelten die globalen Level-Regeln aus den <Link to="/admin/partners/settings">Einstellungen</Link>.
          </p>
        ) : (
          <RuleSetView ruleSet={levelRules?.current || null} caption="Aktuelle Level-Regeln des Partners" />
        )}

        <div className="adm-sp-folds">
          {historie.length > 0 && (
            <AdminSubDisclosure id="adm-sp-levels-history" title={allVersionsLabel(historie.length)}>
              <RuleSetHistory history={historie} caption="Frühere Level-Regeln des Partners" />
            </AdminSubDisclosure>
          )}
          <AdminSubDisclosure id="adm-sp-levels-new" title={DETAIL_TEXTS.newVersion} open={formOffen} onOpenChange={formular}>
            <form onSubmit={pruefen} noValidate className="adm-sp-stack">
              <fieldset className="adm-sp-fieldset">
                <legend className="adm-edit-label">Welche Regeln sollen gelten? (Pflicht)</legend>
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
              <p className="adm-edit-hint" id="adm-sp-levels-effect">{DETAIL_TEXTS.levelsEffect}</p>
              <div className="adm-sp-form">
                <div className="adm-sp-datefield">
                  <DateField id="adm-sp-levels-from" label="Gültig ab (Pflicht)" value={form.validFrom} min={allowPastDates === true ? undefined : heute}
                    invalid={!!errors.validFrom} required onChange={(v) => setForm((f) => ({ ...f, validFrom: v }))} />
                  {allowPastDates === true && <span className="adm-edit-hint">Testpartner im Pre-Live-Testmodus: Das Datum darf zurückliegen.</span>}
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
                <>
                  <p className="adm-edit-hint" id="adm-sp-levels-required">{DETAIL_TEXTS.levelsAllRequired}</p>
                  <LevelRulesEditor value={form} onChange={(next) => setForm(next)} errors={errors} idPrefix="adm-sp-levels"
                    prefillNote={levelRulesPrefillNote(quelle)} />
                </>
              )}
              <div className="adm-sp-form-actions">
                <button type="submit" className="btn btn-primary btn-sm" id="adm-sp-levels-submit">Neue Version anlegen</button>
              </div>
            </form>
          </AdminSubDisclosure>
        </div>
      </AdminDisclosureCard>

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
    </>
  );
}

export default SalesPartnerLevelRulesCard;
