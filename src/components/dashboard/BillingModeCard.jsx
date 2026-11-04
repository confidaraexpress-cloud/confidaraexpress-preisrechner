import React, { useState, useEffect } from "react";
import { FormAlert } from "../ui/FormAlert";
import {
  apiFetch, getCurrentConsolidatedPeriod, getBillingModeRequest, createBillingModeRequest, withdrawBillingModeRequest,
} from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { normalizeThrownError } from "../../utils/apiError.mjs";
import { money } from "../../utils/formatters";
import {
  BILLING_MODES, BILLING_MODE_TEXT, billingMode, buildBillingModePatch,
  consolidatedPeriodView, billingModeOptionSelectable, consolidatedBillingAvailable,
  BILLING_MODE_REQUEST_TEXT, BILLING_MODE_REQUEST_NOTE_MAX, billingModeRequestView, noteLength,
} from "../../utils/billingModeView.mjs";
import { SettingsSection } from "./ProfileCardHead";

// Abrechnungsart der Kontoseite. Dasselbe Muster wie die Lieferscheineinstellung: eine
// Auswahl aus zwei Optionen ohne Bearbeiten-Modus, gespeichert über denselben PATCH
// /kunde/profil. Keine zweite Speicherstrecke.
//
// P5 (Canonical v2.111): Die Sammelrechnung wird BEANTRAGT, nicht gewählt — ConfidaraExpress
// entscheidet. Die Auswahl zeigt deshalb, was gilt: die Einzelrechnung bleibt wählbar (Rückweg),
// die Sammelrechnung nur, wenn das Konto sie bereits führt. Darunter stehen Antrag, Status und
// Rücknahme bzw. die aktive Sammelrechnung.
export function BillingModeCard({ user }) {
  const { updateUser } = useAuth();

  const [bmMode, setBmMode] = useState(() => billingMode(user));
  const [bmSaving, setBmSaving] = useState(false);
  const [bmError, setBmError] = useState("");
  const [bmSaved, setBmSaved] = useState(false);
  const serverBmMode = billingMode(user);
  useEffect(() => { setBmMode(serverBmMode); }, [serverBmMode]);

  // Vorschau auf den laufenden Sammelzeitraum. Sie wird NUR bei Sammelabrechnung geholt —
  // ein Einzelrechnungskonto stellt die Anfrage gar nicht erst. Der Abruf verändert
  // serverseitig nichts (read-only) und darf die Karte bei einem Ausfall nicht brechen:
  // ein Fehler ergibt eine ruhige Hinweiszeile, keine leere Fläche.
  const [periodData, setPeriodData] = useState(null);
  const [periodError, setPeriodError] = useState("");
  useEffect(() => {
    if (serverBmMode !== "consolidated_7d") { setPeriodData(null); setPeriodError(""); return undefined; }
    let alive = true;
    (async () => {
      try {
        const r = await getCurrentConsolidatedPeriod();
        if (!alive) return;
        if (!r.ok) { setPeriodError(BILLING_MODE_TEXT.periodLoadError); return; }
        setPeriodError(""); setPeriodData(r.data);
      } catch {
        if (alive) setPeriodError(BILLING_MODE_TEXT.periodLoadError);
      }
    })();
    return () => { alive = false; };
  }, [serverBmMode]);

  // P5: Stand des Antrags. Gelesen beim Öffnen und nach jedem Wechsel der Abrechnungsart. Die Antwort
  // trägt auch Abrechnungsart und Verfügbarkeit — weichen sie vom geladenen Konto ab (eine Genehmigung
  // seit dem Anmelden), gewinnt die Serverwahrheit. Ohne gelesenen Stand kein Antragsformular.
  const [antrag, setAntrag] = useState(null);
  const [antragGeladen, setAntragGeladen] = useState(false);
  const [antragFehler, setAntragFehler] = useState(false);
  const [notiz, setNotiz] = useState("");
  const [antragBusy, setAntragBusy] = useState(false);
  const [antragError, setAntragError] = useState("");
  const [antragErfolg, setAntragErfolg] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getBillingModeRequest();
        if (!alive) return;
        if (!r.ok) { setAntragFehler(true); setAntragGeladen(false); return; }
        setAntrag(r.data?.request ?? null); setAntragFehler(false); setAntragGeladen(true);
        const frisch = {};
        if (BILLING_MODES.includes(r.data?.billingMode) && r.data.billingMode !== serverBmMode) frisch.billing_mode = r.data.billingMode;
        const faehig = r.data?.billingCapabilities;
        if (faehig && typeof faehig === "object" && consolidatedBillingAvailable(user) !== (faehig.consolidated7dAvailable === true)) {
          frisch.billingCapabilities = faehig;
        }
        if (Object.keys(frisch).length > 0) updateUser(frisch);
      } catch {
        if (alive) { setAntragFehler(true); setAntragGeladen(false); }
      }
    })();
    return () => { alive = false; };
    // Bewusst nur am Modus: die Fähigkeit allein löst keinen neuen Abruf aus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverBmMode]);

  // Speichert die Abrechnungsart über denselben Profil-PATCH — seit P5 nur noch den Rückweg auf die
  // Einzelrechnung (die Sammelrechnung ist nicht direkt wählbar). Optimistische Anzeige mit Rückfall auf
  // die Serverwahrheit bei einem Fehler — es bleibt nie eine Auswahl stehen, die nicht gespeichert wurde.
  const saveBillingMode = async (mode) => {
    // Eine nicht wählbare Option wird gar nicht erst gesendet (Serverschranke bleibt die Wahrheit).
    if (bmSaving || mode === serverBmMode || !billingModeOptionSelectable(user, mode)) return;
    setBmMode(mode);
    setBmSaving(true); setBmError(""); setBmSaved(false); setAntragErfolg("");
    try {
      const r = await apiFetch(`/kunde/profil`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(buildBillingModePatch(mode)),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setBmMode(serverBmMode);
        setBmError(d?.error || "Die Einstellung konnte nicht gespeichert werden.");
        setBmSaving(false);
        return;
      }
      if (d.user) updateUser(d.user);
      setBmSaved(true);
    } catch (e) {
      setBmMode(serverBmMode);
      setBmError(normalizeThrownError(e).message);
    }
    setBmSaving(false);
  };

  // P5: Sammelrechnung beantragen — gesendet wird nur die Begründung. Die Antwort ist der neue Stand.
  const beantragen = async (e) => {
    e.preventDefault();
    if (antragBusy) return;
    setAntragBusy(true); setAntragError(""); setAntragErfolg(""); setBmSaved(false);
    try {
      const r = await createBillingModeRequest(notiz.trim());
      if (!r.ok) {
        // Ein schon offener Antrag (Doppelklick, zweiter Tab) wird angezeigt statt verschwiegen.
        if (r.data?.request) setAntrag(r.data.request);
        setAntragError(r.data?.error || BILLING_MODE_REQUEST_TEXT.submitError);
      } else {
        setAntrag(r.data?.request ?? null);
        setNotiz("");
        setAntragErfolg(BILLING_MODE_REQUEST_TEXT.submitted);
      }
    } catch (err) {
      setAntragError(normalizeThrownError(err).message || BILLING_MODE_REQUEST_TEXT.submitError);
    }
    setAntragBusy(false);
  };

  const zurueckziehen = async () => {
    if (antragBusy) return;
    setAntragBusy(true); setAntragError(""); setAntragErfolg(""); setBmSaved(false);
    try {
      const r = await withdrawBillingModeRequest();
      if (!r.ok) {
        // Bereits entschieden: den tatsächlichen Stand zeigen.
        if (r.data?.request) setAntrag(r.data.request);
        setAntragError(r.data?.error || BILLING_MODE_REQUEST_TEXT.withdrawError);
      } else {
        setAntrag(r.data?.request ?? null);
        setAntragErfolg(BILLING_MODE_REQUEST_TEXT.withdrawn);
      }
    } catch (err) {
      setAntragError(normalizeThrownError(err).message || BILLING_MODE_REQUEST_TEXT.withdrawError);
    }
    setAntragBusy(false);
  };

  // Dieselben nativen Radios wie die Lieferscheinauswahl — kein zweites
  // Auswahlbauteil. `ce-wahl` zeigt sie im Kundenbereich als Navy-Wahl
  // (premium-editorial.css, Abschnitt 21); Wert, Sperre und Speichern bleiben.
  // Während des Speicherns sind nur die übrigen Optionen gesperrt — die gewählte
  // behält den Tastaturfokus (wie DeliveryNoteCard; tests/e2e/billingMode.test.mjs, B12).
  const period = periodData ? consolidatedPeriodView(periodData) : null;
  const verfuegbar = consolidatedBillingAvailable(user);
  const ansicht = billingModeRequestView({
    mode: serverBmMode, request: antrag, available: verfuegbar, loaded: antragGeladen, failed: antragFehler,
  });
  const T = BILLING_MODE_REQUEST_TEXT;
  const zeichen = noteLength(notiz);
  return (
    <SettingsSection title={BILLING_MODE_TEXT.title} subtitle={BILLING_MODE_TEXT.subtitle}>
      <div className="profile-section-body">
        <fieldset className="dn-mode-fieldset">
          <legend className="field-label">{BILLING_MODE_TEXT.fieldLabel}</legend>
          {BILLING_MODES.map((mode) => {
            const opt = BILLING_MODE_TEXT.options[mode];
            const id = `bm-mode-${mode}`;
            // Die Sammelrechnung ist nur gewählt, wenn das Konto sie führt — sonst wird sie beantragt.
            const selectable = billingModeOptionSelectable(user, mode);
            return (
              <label key={mode} className={`dn-mode-option ce-wahl${bmMode === mode ? " selected" : ""}`} htmlFor={id}>
                <input
                  id={id}
                  type="radio"
                  name="billingMode"
                  value={mode}
                  checked={bmMode === mode}
                  disabled={!selectable || (bmSaving && bmMode !== mode)}
                  onChange={() => saveBillingMode(mode)}
                />
                <span className="dn-mode-text">
                  <span className="dn-mode-label">{opt.label}</span>
                  <span className="field-hint">{opt.hint}</span>
                  {!selectable && <span className="field-hint">{BILLING_MODE_TEXT.consolidatedByRequest}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
        {serverBmMode === "consolidated_7d" && !verfuegbar && (
          <p className="field-hint mt-8">{BILLING_MODE_TEXT.consolidatedKeptNote}</p>
        )}
        {serverBmMode === "consolidated_7d" && (
          <p className="field-hint mt-8" id="bm-switch-back-note">{BILLING_MODE_TEXT.switchBackNote}</p>
        )}
        <p className="field-hint mt-8">{BILLING_MODE_TEXT.changeNote}</p>
        {bmError && <FormAlert tone="error" message={bmError} className="mt-16" />}
        {bmSaved && !bmError && (
          <p className="profile-saved" role="status">
            Einstellung gespeichert
          </p>
        )}

        {/* P5: Stand der Sammelrechnung — aktiv (Konto führt sie) oder Antrag mit Status. Der Status steht als
            Wort im Titel, nie allein farblich. */}
        {ansicht.box && (
          <div className={`alert ${ansicht.box.tone === "success" ? "alert-success" : "alert-info"} form-alert bm-request-status mt-16`}
            id="bm-request-status">
            <div className="form-alert-body">
              <strong className="form-alert-title">{ansicht.box.title}</strong>
              {ansicht.box.lines.map((zeile) => (
                <span key={zeile} className="form-alert-text">{zeile}</span>
              ))}
            </div>
          </div>
        )}
        {ansicht.kind === "error" && (
          <p className="field-hint mt-16" id="bm-request-load-error">{T.loadError}</p>
        )}
        {ansicht.kind === "request" && (
          <div className="bm-request mt-16" id="bm-request">
            {ansicht.canWithdraw && (
              <>
                {ansicht.showNotAvailable && <p className="field-hint">{T.notAvailablePending}</p>}
                <button type="button" className="btn btn-outline mt-8" id="bm-request-withdraw"
                  onClick={zurueckziehen} disabled={antragBusy}>
                  {antragBusy ? T.withdrawing : T.withdraw}
                </button>
              </>
            )}
            {ansicht.showForm && (
              <form className="bm-request-form" onSubmit={beantragen} noValidate aria-labelledby="bm-request-title">
                <h4 className="field-label" id="bm-request-title">{T.title}</h4>
                <p className="field-hint">{T.intro}</p>
                {ansicht.showNotAvailable && <p className="field-hint mt-8" id="bm-request-not-available">{T.notAvailable}</p>}
                <label className="field-label mt-16" htmlFor="bm-request-note">{T.noteLabel}</label>
                <textarea
                  id="bm-request-note"
                  className="field-textarea"
                  rows={3}
                  maxLength={BILLING_MODE_REQUEST_NOTE_MAX}
                  value={notiz}
                  disabled={antragBusy}
                  aria-describedby="bm-request-note-hint bm-request-note-count"
                  onChange={(e) => setNotiz(e.target.value)}
                />
                <div className="bm-request-meta">
                  <span className="field-hint" id="bm-request-note-hint">{T.noteHint}</span>
                  <span className="field-hint bm-request-count" id="bm-request-note-count">
                    {zeichen} / {BILLING_MODE_REQUEST_NOTE_MAX}
                  </span>
                </div>
                <button type="submit" className="btn btn-primary mt-8" id="bm-request-submit" disabled={antragBusy}>
                  {antragBusy ? T.submitting : T.submit}
                </button>
              </form>
            )}
          </div>
        )}
        {antragError && <FormAlert tone="error" message={antragError} className="mt-16" id="bm-request-error" />}
        {antragErfolg && !antragError && (
          <p className="profile-saved" role="status" id="bm-request-done">{antragErfolg}</p>
        )}

        {/* Laufender Zeitraum — ausschließlich Serverwerte, nichts wird gerechnet.
            Erscheint nur bei Sammelabrechnung und nur, wenn der Server tatsächlich
            einen Zeitraum liefert; sonst steht dort der leere Zustand. */}
        {serverBmMode === "consolidated_7d" && (
          <div className="bm-period mt-16">
            <h4 className="field-label">{BILLING_MODE_TEXT.periodTitle}</h4>
            {periodError && <FormAlert tone="error" message={periodError} className="mt-8" />}
            {!periodError && (!period || !period.hasPeriod) && (
              <p className="field-hint">{BILLING_MODE_TEXT.periodEmpty}</p>
            )}
            {!periodError && period && period.hasPeriod && (
              <>
                <div className="summary-detail-row summary-detail-row-border">
                  <span className="text-sm text-muted summary-detail-key">Zeitraum</span>
                  <span className="text-sm font-bold summary-detail-val">{period.rangeLabel}</span>
                </div>
                <div className="summary-detail-row summary-detail-row-border">
                  <span className="text-sm text-muted summary-detail-key">{BILLING_MODE_TEXT.periodCountLabel}</span>
                  <span className="text-sm font-bold summary-detail-val">{period.shipmentCount}</span>
                </div>
                <div className="summary-detail-row summary-detail-row-border">
                  <span className="text-sm text-muted summary-detail-key">{BILLING_MODE_TEXT.periodAmountLabel}</span>
                  <span className="text-sm font-bold summary-detail-val">{money(period.grossAmount)}</span>
                </div>
                {period.invoiceDateLabel && (
                  <div className="summary-detail-row summary-detail-row-border">
                    <span className="text-sm text-muted summary-detail-key">{BILLING_MODE_TEXT.periodInvoiceDateLabel}</span>
                    <span className="text-sm font-bold summary-detail-val">{period.invoiceDateLabel}</span>
                  </div>
                )}
                <p className="field-hint mt-8">{BILLING_MODE_TEXT.periodPreviewNote}</p>
                {period.earlierCount > 0 && (
                  <p className="field-hint">
                    {period.earlierCount === 1
                      ? "1 weitere Sendung aus einem früheren Zeitraum wartet noch auf ihre Rechnung."
                      : `${period.earlierCount} weitere Sendungen aus früheren Zeiträumen warten noch auf ihre Rechnung.`}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
