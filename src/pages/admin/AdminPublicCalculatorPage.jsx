import React, { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { AdminBackLink } from "../../components/admin/AdminBackLink";
import {
  getAdminPublicCalculatorSettings, updateAdminPublicCalculatorAvailability, updateAdminPublicCalculatorMarkup,
} from "../../api/adminApi";
import {
  PUBLIC_CALC_ADMIN_TEXT as T, availabilityConfirmation, markupConfirmation, markupUnchanged,
  parsePublicCalculatorSettings, parsePublicMarkupInput, publicCalculatorSaveOutcome, publicCalculatorSettingsView,
} from "../../utils/adminPublicCalculatorView.mjs";

// ── Admin: öffentlicher Preisrechner (/admin/public-calculator) ───────────────
// Erreichbar über die Karte der Adminübersicht — bewusst kein Sidebar-Eintrag
// (Höhenbudget der Admin-Sidebar). Zwei Werte des Servers:
//   • Aufschlag: Eingabe in de-DE, Bestätigung mit altem und neuem Wert samt Wirkung,
//   • Schalter: eigene Bestätigung je Richtung.
// Jede Änderung sendet die gelesene Revision. Ein Konflikt (409) zeigt den aktuellen
// Stand, speichert nichts und bietet das Neuladen an.

async function leseJson(antwort) {
  try { return await antwort.json(); } catch { return null; }
}

export default function AdminPublicCalculatorPage() {
  const [laden, setLaden] = useState({ status: "loading", settings: null });
  const [eingabe, setEingabe] = useState("");
  const [eingabeFehler, setEingabeFehler] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState(null);
  const [konflikt, setKonflikt] = useState(false);

  const uebernehme = useCallback((settings) => {
    setLaden({ status: "ready", settings });
    setEingabe(publicCalculatorSettingsView(settings).inputValue);
  }, []);

  const neuLaden = useCallback(async () => {
    setLaden((l) => ({ status: "loading", settings: l.settings }));
    setKonflikt(false);
    try {
      const r = await getAdminPublicCalculatorSettings();
      if (r.status === 401 || r.status === 403) return;
      const s = r.ok ? parsePublicCalculatorSettings(await leseJson(r)) : null;
      if (!s) { setLaden({ status: "error", settings: null }); return; }
      uebernehme(s);
    } catch {
      setLaden({ status: "error", settings: null });
    }
  }, [uebernehme]);

  useEffect(() => { neuLaden(); }, [neuLaden]);

  const settings = laden.settings;
  const view = settings ? publicCalculatorSettingsView(settings) : null;

  const aufschlagPruefen = (e) => {
    e.preventDefault();
    setMeldung(null);
    const p = parsePublicMarkupInput(eingabe);
    if (!p.ok) { setEingabeFehler(p.error); return; }
    setEingabeFehler(null);
    if (markupUnchanged(settings, p.value)) { setMeldung({ type: "info", text: T.markupUnchanged }); return; }
    setDialog({ art: "markup", wert: p.value, ...markupConfirmation(settings, p.value) });
  };

  const schalterPruefen = () => {
    setMeldung(null);
    setDialog({ art: "availability", ...availabilityConfirmation(settings) });
  };

  const speichern = async () => {
    if (!dialog || !settings) return;
    setBusy(true);
    let ausgang;
    try {
      const r = dialog.art === "markup"
        ? await updateAdminPublicCalculatorMarkup({ markupPercent: dialog.wert, expectedRevision: settings.revision })
        : await updateAdminPublicCalculatorAvailability({ enabled: dialog.next, expectedRevision: settings.revision });
      ausgang = publicCalculatorSaveOutcome(r.status, await leseJson(r));
    } catch {
      ausgang = { kind: "error", text: T.saveError };
    }
    setBusy(false);
    setDialog(null);
    if (ausgang.kind === "auth") return;
    if (ausgang.kind === "saved") {
      uebernehme(ausgang.settings);
      setMeldung({ type: "success", text: dialog.art === "markup"
        ? `Aufschlag gespeichert: ${publicCalculatorSettingsView(ausgang.settings).markupText}. Er gilt ab der nächsten Berechnung.`
        : `Preisrechner ${ausgang.settings.enabled ? "eingeschaltet" : "ausgeschaltet"}.` });
      return;
    }
    if (ausgang.kind === "conflict") {
      setKonflikt(true);
      if (ausgang.settings) setLaden({ status: "ready", settings: ausgang.settings });
      return;
    }
    if (ausgang.kind === "invalid") { setEingabeFehler(ausgang.text); return; }
    setMeldung({ type: "error", text: ausgang.text });
  };

  let inhalt;
  if (laden.status === "loading" && !settings) {
    inhalt = <ListSkeleton rows={3} label="Einstellungen werden geladen" />;
  } else if (laden.status === "error" || !view) {
    inhalt = <ErrorState title={T.loadError} text=""
      action={<button type="button" className="btn btn-primary btn-sm" onClick={neuLaden}>{T.retry}</button>} />;
  } else {
    inhalt = (
      <div className="adm-cards">
        <div className="adm-card" id="adm-pc-markup-card">
          <div className="adm-card-head">{T.markupCard}</div>
          <div className="adm-card-body">
            <dl className="adm-kv">
              <div className="adm-kv-item"><dt>{T.current}</dt><dd id="adm-pc-markup-value">{view.markupText}</dd></div>
              <div className="adm-kv-item"><dt>{T.lastChange}</dt><dd id="adm-pc-last-change">{view.lastChangeText}</dd></div>
            </dl>
            <p className="adm-edit-hint">{T.markupScope}</p>
            <form className="adm-sp-form" onSubmit={aufschlagPruefen} noValidate>
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="adm-pc-markup-input">{T.markupLabel}</label>
                <input id="adm-pc-markup-input" className={`field-input${eingabeFehler ? " field-input-error" : ""}`}
                  type="text" inputMode="decimal" autoComplete="off" value={eingabe}
                  aria-invalid={eingabeFehler ? "true" : undefined}
                  aria-describedby={eingabeFehler ? "adm-pc-markup-error" : "adm-pc-markup-hint"}
                  onChange={(e) => { setEingabe(e.target.value); setEingabeFehler(null); }} />
                {eingabeFehler
                  ? <span className="field-error" id="adm-pc-markup-error">{eingabeFehler}</span>
                  : <span className="adm-edit-hint" id="adm-pc-markup-hint">{T.markupHint}</span>}
              </div>
              <div className="adm-sp-form-actions">
                <button type="submit" className="btn btn-primary btn-sm" id="adm-pc-markup-submit">{T.markupSubmit}</button>
              </div>
            </form>
          </div>
        </div>

        <div className="adm-card" id="adm-pc-availability-card">
          <div className="adm-card-head">{T.availabilityCard}</div>
          <div className="adm-card-body">
            <dl className="adm-kv">
              <div className="adm-kv-item"><dt>{T.status}</dt><dd id="adm-pc-status">{view.statusText}</dd></div>
            </dl>
            <p className="adm-edit-hint">{view.statusDetail}</p>
            <div className="adm-sp-form-actions">
              <button type="button" className={settings.enabled ? "btn btn-outline btn-sm" : "btn btn-primary btn-sm"}
                id="adm-pc-availability-toggle" onClick={schalterPruefen}>
                {settings.enabled ? T.switchOff : T.switchOn}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        backLink={<AdminBackLink to="/admin" label="Zur Übersicht" />}
        title={<>{T.title}</>}
        subtitle={<>{T.subtitle}</>}
      />
      {konflikt && (
        <div className="adm-conflict" role="alert" id="adm-pc-conflict">
          <span>{T.conflict}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={neuLaden}>{T.reload}</button>
        </div>
      )}
      {meldung && (
        <div className={`alert ${meldung.type === "success" ? "alert-success" : meldung.type === "info" ? "alert-info" : "alert-error"}`}
          role={meldung.type === "error" ? "alert" : "status"} id="adm-pc-message">{meldung.text}</div>
      )}
      {inhalt}
      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          text={dialog.text}
          note={dialog.note}
          confirmLabel={dialog.confirmLabel}
          busy={busy}
          confirmId={dialog.art === "markup" ? "adm-pc-markup-confirm" : "adm-pc-availability-confirm"}
          onCancel={() => { if (!busy) setDialog(null); }}
          onConfirm={speichern}
        />
      )}
    </div>
  );
}
