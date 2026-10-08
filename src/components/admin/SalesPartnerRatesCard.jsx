import React, { useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { DateField } from "./DateField";
import { AdminDisclosureCard, AdminSubDisclosure } from "./AdminDisclosureCard";
import { createAdminSalesPartnerRates } from "../../api/adminApi";
import { formatPercent } from "../../utils/salesPartnerView.mjs";
import {
  RATE_TEXTS,
  adminActionErrorText,
  buildRatesBody,
  formatTimestamp,
  localIsoDate,
  ratesEditable,
} from "../../utils/adminSalesPartnerView.mjs";
import { DETAIL_TEXTS, allVersionsLabel, ratesFormFromCurrent, ratesSummary } from "../../utils/adminPartnerDetailView.mjs";

/* ── Provisionssätze: aktuelle Version, Historie, neue Version ───────────────
   Eine Änderung ist immer eine NEUE Version mit Gültigkeitsbeginn (heute oder
   später; mit `allowPastDates` — Testpartner im Pre-Live-Testmodus — auch
   zurückliegend) — keine Version wird überschrieben. Die Prüfung vor dem
   Senden übernimmt buildRatesBody; verbindlich ist der Server. Eine neue
   Version gibt es nur für freigegebene Partner (`partnerStatus` aktiv oder
   inaktiv) — vorher lehnte der Server ab, deshalb erscheint das Formular erst
   dann (UX-Paket 1).

   UX-Paket 4: ein eingeklappter Bereich, dessen Kopf die aktuellen Sätze
   nennt; Versionsverlauf und Formular sind darin noch einmal eingeklappt. Das
   Formular übernimmt beim Öffnen die aktuell gültigen Sätze — „Gültig ab"
   wählt der Admin bewusst, gespeichert wird erst nach der Bestätigung. */
export function SalesPartnerRatesCard({ partnerId, rates, partnerStatus = null, allowPastDates = false, onChanged }) {
  const aktuell = rates?.current || null;
  const historie = rates?.history || [];
  const [form, setForm] = useState(() => ratesFormFromCurrent(aktuell));
  const [formOffen, setFormOffen] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);     // gebauter Body
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const inFlight = useRef(false);
  const heute = localIsoDate();

  const setFeld = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  // Jedes Öffnen beginnt mit den aktuell gültigen Sätzen; Schließen verwirft.
  const formular = (offen) => {
    if (offen) { setForm(ratesFormFromCurrent(aktuell)); setErrors({}); setMessage(null); }
    setFormOffen(offen);
  };

  const pruefen = (e) => {
    e.preventDefault();
    setMessage(null);
    const gebaut = buildRatesBody(form, { today: heute, allowPast: allowPastDates === true });
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
      setFormOffen(false);
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

  return (
    <>
      <AdminDisclosureCard id="adm-sp-rates-card" title="Provisionssätze" summary={ratesSummary(rates, partnerStatus)}>
        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`} role={message.type === "success" ? "status" : "alert"}>
            {message.text}
          </div>
        )}
        {aktuell ? (
          <dl className="adm-kv" id="adm-sp-rates-current">
            <div className="adm-kv-item"><dt>Grundprovision</dt><dd>{formatPercent(aktuell.basePercent)}</dd></div>
            <div className="adm-kv-item"><dt>Team Ebene 1</dt><dd>{formatPercent(aktuell.level1Percent)}</dd></div>
            <div className="adm-kv-item"><dt>Team Ebene 2</dt><dd>{formatPercent(aktuell.level2Percent)}</dd></div>
            <div className="adm-kv-item"><dt>Gültig ab</dt><dd>{formatTimestamp(aktuell.validFrom)}</dd></div>
            <div className="adm-kv-item"><dt>Begründung</dt><dd>{aktuell.reason || "—"}</dd></div>
          </dl>
        ) : (
          <p className="adm-support-hint" id="adm-sp-rates-none">
            {partnerStatus === "rejected" ? RATE_TEXTS.rejected : RATE_TEXTS.noneYet}
          </p>
        )}

        {(historie.length > 0 || ratesEditable(partnerStatus)) && (
          <div className="adm-sp-folds">
            {historie.length > 0 && (
              <AdminSubDisclosure id="adm-sp-rates-history" title={allVersionsLabel(historie.length)}>
                <div className="table-scroll adm-sp-mini-table adm-sp-cardtable">
                  <table>
                    <caption className="sr-only">Historie der Provisionssätze: gültig ab, Grundprovision, Ebene 1, Ebene 2, Begründung, angelegt.</caption>
                    <thead>
                      <tr>
                        <th scope="col">Gültig ab</th>
                        <th scope="col" className="adm-num">Grundprovision</th>
                        <th scope="col" className="adm-num">Ebene 1</th>
                        <th scope="col" className="adm-num">Ebene 2</th>
                        <th scope="col">Begründung</th>
                        <th scope="col">Angelegt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historie.map((v, i) => (
                        <tr key={v.id ?? i}>
                          <td data-label="Gültig ab">{formatTimestamp(v.validFrom)}</td>
                          <td data-label="Grundprovision" className="adm-num">{formatPercent(v.basePercent)}</td>
                          <td data-label="Ebene 1" className="adm-num">{formatPercent(v.level1Percent)}</td>
                          <td data-label="Ebene 2" className="adm-num">{formatPercent(v.level2Percent)}</td>
                          <td data-label="Begründung">{v.reason || "—"}</td>
                          <td data-label="Angelegt">{formatTimestamp(v.createdAt, { withTime: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AdminSubDisclosure>
            )}

            {ratesEditable(partnerStatus) && (
              <AdminSubDisclosure id="adm-sp-rates-new" title={DETAIL_TEXTS.newVersion} open={formOffen} onOpenChange={formular}>
                <form className="adm-sp-form" onSubmit={pruefen} noValidate>
                  <div className="adm-sp-datefield">
                    <DateField id="adm-sp-rates-from" label="Gültig ab (Pflicht)" value={form.validFrom} min={allowPastDates === true ? undefined : heute}
                      invalid={!!errors.validFrom} required onChange={(v) => setFeld("validFrom", v)} />
                    {allowPastDates === true && <span className="adm-edit-hint">Testpartner im Pre-Live-Testmodus: Das Datum darf zurückliegen.</span>}
                    {fehler("validFrom")}
                  </div>
                  {[["basePercent", "Grundprovision in % (Pflicht)", "adm-sp-rates-base"],
                    ["level1Percent", "Teamprovision Ebene 1 in % (Pflicht)", "adm-sp-rates-l1"],
                    ["level2Percent", "Teamprovision Ebene 2 in % (Pflicht)", "adm-sp-rates-l2"]].map(([k, label, id]) => (
                    <div className="adm-edit-field" key={k}>
                      <label className="adm-edit-label" htmlFor={id}>{label}</label>
                      <input id={id} className="field-input" type="text" inputMode="decimal" autoComplete="off"
                        value={form[k]} onChange={(e) => setFeld(k, e.target.value)}
                        aria-required="true" aria-invalid={errors[k] ? "true" : undefined} />
                      {fehler(k)}
                    </div>
                  ))}
                  <p className="adm-edit-hint adm-sp-form-wide" id="adm-sp-rates-team-hint">{RATE_TEXTS.teamExplain}</p>
                  <p className="adm-edit-hint adm-sp-form-wide" id="adm-sp-rates-effect">
                    {aktuell ? `${DETAIL_TEXTS.ratesPrefill} ${DETAIL_TEXTS.ratesEffect}` : DETAIL_TEXTS.ratesEffect}
                  </p>
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
              </AdminSubDisclosure>
            )}
          </div>
        )}
      </AdminDisclosureCard>

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
    </>
  );
}

export default SalesPartnerRatesCard;
