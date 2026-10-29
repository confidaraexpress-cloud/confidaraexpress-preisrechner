import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { InlineError, InlineSuccess } from "./InventoryShared";
import { Werte } from "../ui/Werte";
import {
  getDeliveryNoteTemplate, uploadDeliveryNoteTemplate, updateDeliveryNoteTemplateDraft, deleteDeliveryNoteTemplateDraft,
  activateDeliveryNoteTemplateDraft, draftDeliveryNoteTemplateFromActive, deactivateDeliveryNoteTemplate, deliveryNotePaths,
} from "../../api/deliveryNotesApi";
import {
  TEMPLATE_LIMITS, AREA_FIELDS, areaFieldErrors, checkPdfFile, deliveryNoteErrorText, formatBytes, dateDe,
  templateModeText, templateStateText, pagesText,
} from "../../utils/deliveryNoteView.mjs";

/* ── Briefpapier-Vorlage ─────────────────────────────────────────────────────
   Der Kunde lädt sein Briefpapier als PDF hoch; ConfidaraExpress setzt Nummer, Datum,
   Adressen und beliebig viele Positionen in einen freien Bereich darauf. Drei Abstände
   legen diesen Bereich fest — kein Layout-Editor. Die Vorschau zeigt das Ergebnis mit
   40 Beispielpositionen und dem Aufdruck MUSTER, bevor die Vorlage gilt.

   Lebenslauf: Entwurf (Abstände ändern, Vorschau, verwerfen) → „Diese Vorlage verwenden“.
   Eine aktive Vorlage ist eingefroren; „Abstände ändern“ legt einen Entwurf daraus an.
   Bereits erstellte Lieferscheine behalten ihre Fassung — eine neue Vorlage gilt nur für
   künftige. Was die Vorlage im Kontomodus bewirkt, erklärt ein Satz (templateModeText).

   Fokus: Verschwindet der benutzte Knopf (verwenden, verwerfen, abschalten), steht der Fokus
   danach auf dem Titel des Bereichs statt auf der Seite; die Rückfrage zum Abschalten öffnet
   mit dem Fokus auf „Abbrechen“, und Abbrechen bringt ihn zum Auslöser zurück. */
export function DeliveryNoteTemplatePanel({ mode, onNavigate, onPreview }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState("");
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [areas, setAreas] = useState(null);
  const [areaErrors, setAreaErrors] = useState({});
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const ids = useId();
  const titelRef = useRef(null);
  const abschaltenRef = useRef(null);
  const dateiRef = useRef(null);
  const nachDemZeichnen = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
  const fokusHalten = () => nachDemZeichnen(() => {
    const a = document.activeElement;
    if ((!a || a === document.body || !document.contains(a)) && titelRef.current) titelRef.current.focus();
  });

  const limits = (state && state.limits) || TEMPLATE_LIMITS;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await getDeliveryNoteTemplate();
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(deliveryNoteErrorText(body, "Die Vorlage konnte nicht geladen werden.")); return; }
      setState(body);
      setAreas(body && body.draft ? { ...body.draft.areas } : null);
      setAreaErrors({});
    } catch {
      setError("Die Vorlage konnte nicht geladen werden. Bitte prüfen Sie Ihre Verbindung.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const melde = (text) => { setSuccess(text); setError(""); };

  // Eine Aktion zur Zeit; jede endet mit dem frischen Serverzustand.
  const fuehreAus = async (name, aufruf, erfolg, fehltext) => {
    setBusy(name); setError(""); setSuccess("");
    try {
      const res = await aufruf();
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(deliveryNoteErrorText(body, fehltext)); return false; }
      await load();
      if (erfolg) melde(erfolg);
      fokusHalten();
      return true;
    } catch {
      setError(`${fehltext} Bitte prüfen Sie Ihre Verbindung.`);
      return false;
    } finally {
      setBusy("");
    }
  };

  const waehle = (e) => {
    const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    const fehler = checkPdfFile(f, { maxBytes: limits.maxBytes });
    setFile(fehler ? null : f);
    setFileError(fehler || "");
  };

  const hochladen = async (e) => {
    e.preventDefault();
    if (!file) return;
    const ok = await fuehreAus("upload", () => uploadDeliveryNoteTemplate(file),
      "Ihr Briefpapier ist als Entwurf gespeichert. Prüfen Sie die Abstände in der Vorschau und verwenden Sie es dann.",
      "Das Briefpapier konnte nicht hochgeladen werden.");
    if (ok) { setFile(null); e.target.reset(); }
  };

  const abstaendeSpeichern = async (e) => {
    e.preventDefault();
    const fehler = areaFieldErrors(areas, limits.areas);
    setAreaErrors(fehler);
    if (Object.keys(fehler).length) return;
    const werte = Object.fromEntries(AREA_FIELDS.map((f) => [f.key, Number(String(areas[f.key]).trim())]));
    await fuehreAus("areas", () => updateDeliveryNoteTemplateDraft(werte), "Die Abstände sind gespeichert.",
      "Die Abstände konnten nicht gespeichert werden.");
  };

  const draft = state && state.draft;
  const active = state && state.active;
  const istGeaendert = draft && areas && AREA_FIELDS.some((f) => String(areas[f.key]) !== String(draft.areas[f.key]));

  return (
    <section className="dn-vorlage" aria-labelledby={`${ids}-titel`}>
      <div className="dn-vorlage-kopf">
        <h2 className="dn-vorlage-titel" id={`${ids}-titel`} tabIndex={-1} ref={titelRef}>Ihr Briefpapier als Vorlage</h2>
        <p className="dn-vorlage-status" aria-live="polite">{loading && !state ? "Wird geladen …" : templateStateText(state)}</p>
      </div>
      <p className="dn-vorlage-text">
        Laden Sie Ihr leeres Briefpapier als PDF hoch. ConfidaraExpress setzt Lieferscheinnummer, Datum, Absender, Empfänger
        und alle Positionen in den freien Bereich — bei vielen Positionen auf Folgeseiten.
      </p>
      <ul className="dn-vorlage-regeln">
        <li>DIN A4 im Hochformat, ohne Beschnittzugabe</li>
        <li>eine Seite für alle Seiten, oder zwei: Erstseite und Folgeseite</li>
        <li>höchstens {formatBytes(limits.maxBytes)}, ohne Formularfelder und ohne bereits eingetragene Lieferscheindaten</li>
      </ul>
      <div className="dn-vorlage-modus">
        <p>{templateModeText(mode)}</p>
        {onNavigate && (
          <button type="button" className="btn btn-link btn-sm" onClick={() => onNavigate("profile")}>Lieferschein-Einstellung im Konto ansehen</button>
        )}
      </div>

      <InlineSuccess text={success} />
      <InlineError text={error} onRetry={!state ? load : undefined} />

      {active && (
        <div className="dn-vorlage-block" aria-labelledby={`${ids}-aktiv`}>
          <h3 className="dn-vorlage-blocktitel" id={`${ids}-aktiv`}>Aktive Vorlage</h3>
          <dl className="dn-fakten">
            <div><dt>Seiten</dt><dd>{pagesText(active.pageCount)}</dd></div>
            <div><dt>Freier Bereich</dt><dd>oben {active.areas.topFirstMm}&nbsp;mm, auf Folgeseiten {active.areas.topNextMm}&nbsp;mm, unten {active.areas.bottomMm}&nbsp;mm</dd></div>
            <div><dt>Aktiv seit</dt><dd>{dateDe(active.activatedAt)}</dd></div>
          </dl>
          {!active.available && <p className="dn-hinweis">Diese Vorlage ist nicht mehr verfügbar.</p>}
          {confirmDeactivate ? (
            <div className="dn-verlauf-bestaetigen" role="group" aria-label="Vorlage nicht mehr verwenden">
              <p>Neue Lieferscheine entstehen danach wieder in der Gestaltung von ConfidaraExpress. Bereits erstellte bleiben, wie sie sind.</p>
              <div className="dn-verlauf-aktionen">
                <button type="button" className="btn btn-sm btn-primary" disabled={Boolean(busy)}
                        onClick={async () => { if (await fuehreAus("deactivate", deactivateDeliveryNoteTemplate, "Die Vorlage wird nicht mehr verwendet.", "Die Vorlage konnte nicht abgeschaltet werden.")) setConfirmDeactivate(false); }}>
                  {busy === "deactivate" ? "Wird abgeschaltet …" : "Ja, nicht mehr verwenden"}
                </button>
                <button type="button" className="btn btn-sm btn-outline" autoFocus disabled={Boolean(busy)}
                        onClick={() => { setConfirmDeactivate(false); nachDemZeichnen(() => abschaltenRef.current && abschaltenRef.current.focus()); }}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <div className="dn-vorlage-aktionen">
              <button type="button" className="btn btn-outline" onClick={() => onPreview && onPreview(deliveryNotePaths.templatePreview("active"), "Vorschau der aktiven Vorlage")}
                      disabled={Boolean(busy) || !active.available}>
                Vorschau mit Beispieldaten
              </button>
              {!draft && (
                <button type="button" className="btn btn-outline" disabled={Boolean(busy) || !active.available}
                        onClick={() => fuehreAus("fromActive", draftDeliveryNoteTemplateFromActive, "Ein Entwurf aus der aktiven Vorlage ist angelegt. Ändern Sie die Abstände und verwenden Sie ihn dann.", "Der Entwurf konnte nicht angelegt werden.")}>
                  {busy === "fromActive" ? "Wird angelegt …" : "Abstände ändern"}
                </button>
              )}
              <button type="button" className="btn btn-ghost" ref={abschaltenRef} onClick={() => setConfirmDeactivate(true)} disabled={Boolean(busy)}>
                Keine Vorlage mehr verwenden
              </button>
            </div>
          )}
        </div>
      )}

      {draft && areas && (
        <form className="dn-vorlage-block" aria-labelledby={`${ids}-entwurf`} onSubmit={abstaendeSpeichern} noValidate>
          <h3 className="dn-vorlage-blocktitel" id={`${ids}-entwurf`}>Entwurf</h3>
          <dl className="dn-fakten">
            <div><dt>Seiten</dt><dd>{pagesText(draft.pageCount)}</dd></div>
            <div><dt>Hochgeladen</dt><dd>{dateDe(draft.createdAt)}</dd></div>
          </dl>
          <fieldset className="dn-abstaende">
            <legend className="field-label">Freier Bereich für den Lieferschein</legend>
            {AREA_FIELDS.map((f) => {
              const l = limits.areas[f.key];
              const id = `${ids}-${f.key}`;
              return (
                <div key={f.key} className="dn-abstand">
                  <label className="field-label" htmlFor={id}>{f.label}</label>
                  <div className="dn-abstand-eingabe">
                    <input id={id} className="field-input" type="number" inputMode="numeric" min={l.min} max={l.max} step="1"
                           value={areas[f.key]} disabled={Boolean(busy)}
                           aria-describedby={`${id}-hint`} aria-invalid={areaErrors[f.key] ? "true" : undefined}
                           onChange={(e) => setAreas((cur) => ({ ...cur, [f.key]: e.target.value }))} />
                    <span className="dn-einheit" aria-hidden="true">mm</span>
                  </div>
                  <p className="field-hint" id={`${id}-hint`}>{f.hint} {l.min} bis {l.max}&nbsp;mm.</p>
                  {areaErrors[f.key] && <p className="field-error" role="alert">{areaErrors[f.key]}</p>}
                </div>
              );
            })}
          </fieldset>
          <div className="dn-vorlage-aktionen">
            <button type="submit" className="btn btn-outline" disabled={Boolean(busy) || !istGeaendert}>
              {busy === "areas" ? "Wird gespeichert …" : "Abstände speichern"}
            </button>
            <button type="button" className="btn btn-outline" disabled={Boolean(busy) || istGeaendert}
                    onClick={() => onPreview && onPreview(deliveryNotePaths.templatePreview("draft"), "Vorschau des Entwurfs")}>
              Vorschau mit Beispieldaten
            </button>
            <button type="button" className="btn btn-primary" disabled={Boolean(busy) || istGeaendert}
                    onClick={() => fuehreAus("activate", activateDeliveryNoteTemplateDraft, "Die Vorlage gilt jetzt für neue Lieferscheine.", "Die Vorlage konnte nicht verwendet werden.")}>
              {busy === "activate" ? "Wird übernommen …" : "Diese Vorlage verwenden"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={Boolean(busy)}
                    onClick={() => fuehreAus("discard", deleteDeliveryNoteTemplateDraft, "Der Entwurf ist verworfen.", "Der Entwurf konnte nicht verworfen werden.")}>
              Entwurf verwerfen
            </button>
          </div>
          {istGeaendert && <p className="field-hint">Speichern Sie die Abstände, bevor Sie die Vorschau öffnen oder die Vorlage verwenden.</p>}
        </form>
      )}

      {state && (
        <form className="dn-vorlage-block" aria-labelledby={`${ids}-upload`} onSubmit={hochladen} noValidate>
          <h3 className="dn-vorlage-blocktitel" id={`${ids}-upload`}>{draft || active ? "Anderes Briefpapier hochladen" : "Briefpapier hochladen"}</h3>
          <span className="field-label" id={`${ids}-datei-label`}>PDF-Datei mit Ihrem Briefpapier</span>
          {/* Wie Artikelimport und Firmenlogo: das native Dateifeld bleibt unsichtbar, ein Knopf löst es aus. */}
          <input ref={dateiRef} id={`${ids}-datei`} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={waehle}
                 disabled={Boolean(busy)} tabIndex={-1} aria-hidden="true" />
          <div className="dn-datei-wahl">
            <button type="button" className="btn btn-outline" disabled={Boolean(busy)} id={`${ids}-datei-knopf`}
                    aria-labelledby={`${ids}-datei-label ${ids}-datei-knopf`}
                    onClick={() => dateiRef.current && dateiRef.current.click()}>
              {file ? "Andere Datei auswählen" : "Datei auswählen"}
            </button>
            {file && (
              <span className="dn-datei-info">
                <span className="dn-datei-name"><Werte>{file.name}</Werte></span>
                <span className="dn-datei-groesse">{formatBytes(file.size)}</span>
              </span>
            )}
          </div>
          {fileError && <p className="field-error" role="alert">{fileError}</p>}
          {draft && <p className="field-hint">Ein neues Briefpapier ersetzt den Entwurf. Die aktive Vorlage bleibt, bis Sie den neuen Entwurf verwenden.</p>}
          <div className="dn-vorlage-aktionen">
            <button type="submit" className="btn btn-primary" disabled={!file || Boolean(busy)}>
              {busy === "upload" ? "Wird geprüft …" : "Briefpapier hochladen"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
