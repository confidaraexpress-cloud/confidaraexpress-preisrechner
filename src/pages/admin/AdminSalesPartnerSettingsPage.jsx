import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { DateField } from "../../components/admin/DateField";
import { LevelRulesEditor, RuleSetHistory, RuleSetView } from "../../components/admin/SalesPartnerLevelRules";
import {
  createAdminSalesPartnerCap,
  createAdminSalesPartnerGlobalLevelRules,
  getAdminSalesPartnerCaps,
  getAdminSalesPartnerLevelRules,
} from "../../api/adminApi";
import {
  CAP_TEXTS,
  adminActionErrorText,
  buildCapBody,
  buildGlobalLevelRulesBody,
  capLimitText,
  emptyLevelRulesForm,
  formatTimestamp,
  localIsoDate,
  normalizeCapsResponse,
  normalizeLevelRulesResponse,
  prefillGlobalLevelRulesForm,
} from "../../utils/adminSalesPartnerView.mjs";

const LEERE_GRENZE = { validFrom: "", maxOwnRatePercent: "", maxTotalRatePercent: "", reason: "" };
const grenzeText = capLimitText;

// Lädt eine versionierte Konfiguration ({ current, history, …}) selbständig;
// `normalize` liest die ganze Antwort.
function useVersioned(request, normalize, errorText) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await request();
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        setState({ loading: false, error: errorText, data: null });
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      setState({ loading: false, error: "", data: normalize(d) });
    } catch {
      setState({ loading: false, error: errorText, data: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function Lade({ state, children }) {
  if (state.loading && !state.data) {
    return <div className="loading-center" role="status"><span className="spinner spinner-dark" /> Wird geladen…</div>;
  }
  if (state.error || !state.data) {
    return (
      <>
        <div className="alert alert-error" role="alert">{state.error}</div>
        <button type="button" className="btn btn-outline btn-sm" onClick={state.reload}>Erneut versuchen</button>
      </>
    );
  }
  return children;
}

/* ── Admin · Vertriebspartner · Einstellungen ────────────────────────────────
   Globale Level-Regeln und Obergrenzen — jeweils aktuelle Version, Historie
   und das Formular für eine neue Version (gültig ab heute oder später). Das
   Regelformular ist mit der aktuellen Version vorbelegt; gibt es noch keine,
   mit den Startwerten des Servers samt „gültig ab heute" — dann muss nur noch
   gespeichert werden. Ohne beides bleibt es leer (nichts wird erfunden).
   Obergrenzen sind optional; ein Feld ohne Wert heißt „keine Grenze". */
export default function AdminSalesPartnerSettingsPage() {
  const regeln = useVersioned(getAdminSalesPartnerLevelRules, normalizeLevelRulesResponse, "Die Level-Regeln konnten nicht geladen werden.");
  const grenzen = useVersioned(getAdminSalesPartnerCaps, normalizeCapsResponse, "Die Obergrenzen konnten nicht geladen werden.");
  const heute = localIsoDate();

  const [regelForm, setRegelFormRoh] = useState(emptyLevelRulesForm);
  const [vorbelegung, setVorbelegung] = useState(null);   // "current" | "startDefaults" | null
  // Die Vorbelegung folgt dem geladenen Stand, solange niemand das Formular
  // angefasst hat — eine Eingabe wird nie durch ein Nachladen überschrieben.
  const regelFormBeruehrt = useRef(false);
  const setRegelForm = (next) => { regelFormBeruehrt.current = true; setRegelFormRoh(next); };
  useEffect(() => {
    if (!regeln.data || regelFormBeruehrt.current) return;
    const { form, source } = prefillGlobalLevelRulesForm({
      current: regeln.data.current, startDefaults: regeln.data.startDefaults, today: localIsoDate(),
    });
    setRegelFormRoh(form);
    setVorbelegung(source);
  }, [regeln.data]);
  const [regelErrors, setRegelErrors] = useState({});
  const [grenzForm, setGrenzForm] = useState(LEERE_GRENZE);
  const [grenzErrors, setGrenzErrors] = useState({});
  const [confirm, setConfirm] = useState(null);        // { kind: "rules"|"cap", body }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const inFlight = useRef(false);

  const regelPruefen = (e) => {
    e.preventDefault();
    setMessage(null);
    const gebaut = buildGlobalLevelRulesBody(regelForm, { today: heute });
    if (!gebaut.ok) { setRegelErrors(gebaut.errors); return; }
    setRegelErrors({});
    setConfirm({ kind: "rules", body: gebaut.body });
  };

  const grenzePruefen = (e) => {
    e.preventDefault();
    setMessage(null);
    const gebaut = buildCapBody(grenzForm, { today: heute });
    if (!gebaut.ok) { setGrenzErrors(gebaut.errors); return; }
    setGrenzErrors({});
    setConfirm({ kind: "cap", body: gebaut.body });
  };

  const senden = async () => {
    if (!confirm || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const { kind, body } = confirm;
    try {
      const r = kind === "rules" ? await createAdminSalesPartnerGlobalLevelRules(body) : await createAdminSalesPartnerCap(body);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        let antwort = null;
        try { antwort = await r.json(); } catch { antwort = null; }
        setMessage({ kind, type: "error", text: adminActionErrorText(r.status, antwort) });
        setConfirm(null);
        return;
      }
      setConfirm(null);
      if (kind === "rules") {
        // Nach dem Speichern belegt der neu geladene Stand das Formular wieder vor.
        regelFormBeruehrt.current = false;
        setRegelFormRoh(emptyLevelRulesForm());
        regeln.reload();
      } else { setGrenzForm(LEERE_GRENZE); grenzen.reload(); }
      setMessage({ kind, type: "success", text: kind === "rules" ? "Die neue Version der Level-Regeln wurde angelegt." : "Die neue Version der Obergrenzen wurde angelegt." });
    } catch {
      setMessage({ kind, type: "error", text: "Die Version wurde nicht angelegt. Bitte versuchen Sie es erneut." });
      setConfirm(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const meldung = (kind) => (message && message.kind === kind ? (
    <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`} role={message.type === "success" ? "status" : "alert"}>
      {message.text}
    </div>
  ) : null);
  const gFehler = (k) => (grenzErrors[k] ? <span className="field-error">{grenzErrors[k]}</span> : null);
  const rFehler = (k) => (regelErrors[k] ? <span className="field-error">{regelErrors[k]}</span> : null);

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        backLink={<Link to="/admin/partners" className="adm-back">Zurück zu den Vertriebspartnern</Link>}
        title={<>Einstellungen Vertriebspartner</>}
        subtitle={<>Globale Level-Regeln und Obergrenzen. Änderungen gelten als neue Version ab dem gewählten Tag und werden protokolliert.</>}
      />

      <div className="adm-cards">
        <div className="adm-card" id="adm-sp-global-rules-card">
          <div className="adm-card-head">Globale Level-Regeln</div>
          <div className="adm-card-body">
            <Lade state={regeln}>
              <RuleSetView ruleSet={regeln.data?.current || null} caption="Aktuelle globale Level-Regeln" />
              <h3 className="adm-sp-subtitle">Historie</h3>
              <RuleSetHistory history={regeln.data?.history || []} caption="Frühere globale Level-Regeln" />
            </Lade>

            <h3 className="adm-sp-subtitle">Neue Version gültig ab</h3>
            {meldung("rules")}
            <form onSubmit={regelPruefen} noValidate className="adm-sp-stack">
              <div className="adm-sp-form">
                <div className="adm-sp-datefield">
                  <DateField id="adm-sp-global-from" label="Gültig ab" value={regelForm.validFrom} min={heute}
                    invalid={!!regelErrors.validFrom} onChange={(v) => setRegelForm((f) => ({ ...f, validFrom: v }))} />
                  {rFehler("validFrom")}
                </div>
                <div className="adm-edit-field adm-sp-form-wide">
                  <label className="adm-edit-label" htmlFor="adm-sp-global-reason">Begründung (optional)</label>
                  <input id="adm-sp-global-reason" className="field-input" type="text" maxLength={500}
                    value={regelForm.reason} onChange={(e) => setRegelForm((f) => ({ ...f, reason: e.target.value }))} />
                  {rFehler("reason")}
                </div>
              </div>
              <LevelRulesEditor value={regelForm} onChange={setRegelForm} errors={regelErrors} idPrefix="adm-sp-global"
                prefillNote={vorbelegung === "startDefaults"
                  ? "Noch keine globalen Level-Regeln: das Formular ist mit den Startwerten des Programms und „gültig ab heute“ vorbelegt – prüfen und speichern."
                  : vorbelegung === "current" ? "Vorbelegt mit der aktuellen Version. Ändern Sie nur, was ab dem gewählten Tag anders gelten soll." : null} />
              <div className="adm-sp-form-actions">
                <button type="submit" className="btn btn-primary btn-sm" id="adm-sp-global-submit">Neue Version anlegen</button>
              </div>
            </form>
          </div>
        </div>

        <div className="adm-card" id="adm-sp-caps-card">
          <div className="adm-card-head">Obergrenzen</div>
          <div className="adm-card-body">
            <div className="adm-note adm-note--info" role="note" id="adm-sp-caps-note">
              <span>{CAP_TEXTS.globalNote}</span>
            </div>
            <Lade state={grenzen}>
              {grenzen.data?.current ? (
                <dl className="adm-kv">
                  <div className="adm-kv-item"><dt>Höchstsatz Eigenprovision</dt><dd>{grenzeText(grenzen.data.current.maxOwnRatePercent)}</dd></div>
                  <div className="adm-kv-item"><dt>Höchstsatz gesamt</dt><dd>{grenzeText(grenzen.data.current.maxTotalRatePercent)}</dd></div>
                  <div className="adm-kv-item"><dt>Gültig ab</dt><dd>{formatTimestamp(grenzen.data.current.validFrom)}</dd></div>
                  <div className="adm-kv-item"><dt>Begründung</dt><dd>{grenzen.data.current.reason || "—"}</dd></div>
                </dl>
              ) : (
                <p className="adm-support-hint" id="adm-sp-caps-none">{CAP_TEXTS.globalNone}</p>
              )}
              {(grenzen.data?.history || []).length > 0 && (
                <>
                  <h3 className="adm-sp-subtitle">Historie</h3>
                  <div className="table-scroll adm-sp-mini-table">
                    <table>
                      <caption className="sr-only">Historie der Obergrenzen: gültig ab, Höchstsatz Eigenprovision, Höchstsatz gesamt, Begründung, angelegt.</caption>
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
                        {grenzen.data.history.map((c, i) => (
                          <tr key={c.id ?? i}>
                            <td>{formatTimestamp(c.validFrom)}</td>
                            <td className="adm-num">{grenzeText(c.maxOwnRatePercent)}</td>
                            <td className="adm-num">{grenzeText(c.maxTotalRatePercent)}</td>
                            <td>{c.reason || "—"}</td>
                            <td>{formatTimestamp(c.createdAt, { withTime: true })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Lade>

            <h3 className="adm-sp-subtitle">Neue Version gültig ab</h3>
            {meldung("cap")}
            <form className="adm-sp-form" onSubmit={grenzePruefen} noValidate>
              <div className="adm-sp-datefield">
                <DateField id="adm-sp-cap-from" label="Gültig ab" value={grenzForm.validFrom} min={heute}
                  invalid={!!grenzErrors.validFrom} onChange={(v) => setGrenzForm((f) => ({ ...f, validFrom: v }))} />
                {gFehler("validFrom")}
              </div>
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="adm-sp-cap-own">Höchstsatz Eigenprovision in % (optional)</label>
                <input id="adm-sp-cap-own" className="field-input" type="text" inputMode="decimal" autoComplete="off"
                  value={grenzForm.maxOwnRatePercent} onChange={(e) => setGrenzForm((f) => ({ ...f, maxOwnRatePercent: e.target.value }))}
                  aria-invalid={grenzErrors.maxOwnRatePercent ? "true" : undefined} />
                {gFehler("maxOwnRatePercent")}
              </div>
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="adm-sp-cap-total">Höchstsatz gesamt in % (optional)</label>
                <input id="adm-sp-cap-total" className="field-input" type="text" inputMode="decimal" autoComplete="off"
                  value={grenzForm.maxTotalRatePercent} onChange={(e) => setGrenzForm((f) => ({ ...f, maxTotalRatePercent: e.target.value }))}
                  aria-invalid={grenzErrors.maxTotalRatePercent ? "true" : undefined} />
                {gFehler("maxTotalRatePercent")}
              </div>
              <div className="adm-edit-field adm-sp-form-wide">
                <label className="adm-edit-label" htmlFor="adm-sp-cap-reason">Begründung (optional)</label>
                <input id="adm-sp-cap-reason" className="field-input" type="text" maxLength={500}
                  value={grenzForm.reason} onChange={(e) => setGrenzForm((f) => ({ ...f, reason: e.target.value }))} />
                {gFehler("reason")}
              </div>
              <div className="adm-sp-form-actions">
                <button type="submit" className="btn btn-primary btn-sm" id="adm-sp-cap-submit">Neue Version anlegen</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "rules" ? "Neue Version der Level-Regeln" : "Neue Version der Obergrenzen"}
          text={confirm.kind === "rules"
            ? `Ab ${formatTimestamp(confirm.body.validFrom)} gelten die neuen globalen Level-Regeln für alle Partner ohne eigene Regeln.`
            : `Ab ${formatTimestamp(confirm.body.validFrom)} gelten: Eigenprovision höchstens ${grenzeText(confirm.body.maxOwnRatePercent)}, gesamt höchstens ${grenzeText(confirm.body.maxTotalRatePercent)}.`}
          note="Bestehende Versionen bleiben unverändert. Die Aktion wird protokolliert."
          confirmLabel="Version anlegen"
          busy={busy}
          confirmId="adm-sp-settings-confirm"
          onCancel={() => { if (!busy) setConfirm(null); }}
          onConfirm={senden}
        />
      )}
    </div>
  );
}
