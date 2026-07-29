import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import {
  MARKUP_TEXTS,
  formatConfirmedBy,
  formatMarkupDateTime,
  formatMarkupPercent,
  markupActionBusyLabel,
  markupActionLabel,
  markupBadge,
  markupInputValue,
  isMarkupConfirmed,
  markupHasChange,
  parseMarkupInput,
  NO_CHANGE_HINT,
} from "../../utils/customerMarkup.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Sektion „Individueller Kundenaufschlag" in der Admin-Kundendetailansicht.
//
// Zeigt den aktuell hinterlegten Aufschlag, seinen Bestätigungsstatus und die
// Auditzeitpunkte; erlaubt die ausdrückliche Bestätigung bzw. Aktualisierung.
// Rein darstellend: Laden und Speichern liegen in der Seite (ein Request-Pfad,
// ein Zustand). Es werden ausschließlich Kundenaufschlagswerte angezeigt — keine
// internen Rechenraten, keine Lieferantenpreise, keine Margenquellen.
//
// Der Prozentvertrag ist in utils/customerMarkup.mjs zentral: 20 = 20 %,
// 0,20 = 0,20 %. Diese Komponente rechnet selbst nichts um.
// ─────────────────────────────────────────────────────────────────────────────

export const MARKUP_INPUT_ID = "adm-markup-input";
export const MARKUP_SECTION_ID = "adm-markup-section";

export function CustomerMarkupSection({
  pricing,
  loading = false,
  loadError = "",
  busy = false,
  saveError = null,      // { field, text } | null
  notice = null,         // { headline, text } — Einordnung bei „noch nicht bestätigt"
  successText = "",
  onSave,
  onReload,
  onApproveNow,          // optional: „Kunde jetzt freischalten" nach Bestätigung
  inputRef,
  sectionRef,
}) {
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);
  // Wert, mit dem zuletzt abgesendet wurde. Ein Feldfehler des Backends (400)
  // gehört genau zu diesem Wert — sobald der Admin etwas anderes eintippt,
  // verschwindet er wieder (statt als veraltete Fehlermeldung stehen zu bleiben).
  const submittedRef = useRef(null);

  // Vorbelegung aus dem gespeicherten Wert. Der Schlüssel wechselt nur, wenn sich
  // die Backend-Daten tatsächlich ändern (Laden, erfolgreiche Bestätigung) — eine
  // laufende Eingabe wird dadurch nie mitten im Tippen überschrieben.
  const syncKey = pricing
    ? `${pricing.priceMarkupPercent}|${pricing.confirmed}|${pricing.updatedAt}|${pricing.confirmedAt}`
    : "none";
  useEffect(() => {
    setDraft(markupInputValue(pricing?.priceMarkupPercent));
    setTouched(false);
  }, [syncKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => parseMarkupInput(draft), [draft]);
  const confirmed = isMarkupConfirmed(pricing);
  // Ein bereits bestätigter, unveränderter Wert löst bewusst keinen Request aus.
  const hasChange = useMemo(() => markupHasChange(pricing, draft), [pricing, draft]);
  const noChange = parsed.ok && !hasChange;
  const [badgeCls, badgeLabel] = markupBadge(pricing);

  // Fehler am Feld: eigene Validierung (erst nach Berührung) oder die 400-Antwort
  // des Backends. Beides ist programmatisch mit dem Feld verbunden.
  const serverFieldError = saveError && saveError.field && draft === submittedRef.current ? saveError.text : "";
  const fieldError = (touched && !parsed.ok ? parsed.error : "") || serverFieldError;
  const describedBy = ["adm-markup-help", fieldError ? "adm-markup-error" : null]
    .filter(Boolean).join(" ");


  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    // Doppelübermittlung ausgeschlossen: während eines laufenden Requests wird
    // weder abgesendet noch der Button bedienbar gehalten.
    if (busy || !parsed.ok || !hasChange || typeof onSave !== "function") return;
    submittedRef.current = draft;
    onSave(parsed.value);
  };

  return (
    <div className="adm-card adm-markup" id={MARKUP_SECTION_ID} ref={sectionRef}>
      <div className="adm-card-head">
        <Icon n="euro" s={17} /> {MARKUP_TEXTS.sectionTitle}
        {!loading && !loadError && (
          <span className={`badge ${badgeCls} adm-card-head-action`}>{badgeLabel}</span>
        )}
      </div>

      <div className="adm-card-body">
        {loading ? (
          <div className="loading-center" role="status" aria-live="polite">
            <span className="spinner spinner-dark" /> {MARKUP_TEXTS.loadingPricing}
          </div>
        ) : loadError ? (
          <div className="adm-markup-loaderr">
            <div className="alert alert-error" role="alert">
              <Icon n="x" s={16} />{loadError}
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={onReload}>
              <Icon n="refresh" s={14} /> Erneut laden
            </button>
          </div>
        ) : (
          <>
            {/* Aktueller Stand — Status wird über Text UND Badge vermittelt, nie
                allein über Farbe. */}
            <dl className="adm-kv adm-markup-kv">
              <div className="adm-kv-item">
                <dt>Aktueller Aufschlag</dt>
                <dd className="adm-markup-value">{formatMarkupPercent(pricing?.priceMarkupPercent)}</dd>
              </div>
              <div className="adm-kv-item">
                <dt>Bestätigungsstatus</dt>
                <dd><span className={`badge ${badgeCls}`}>{badgeLabel}</span></dd>
              </div>
              <div className="adm-kv-item">
                <dt>Zuletzt bestätigt</dt>
                <dd>{formatMarkupDateTime(pricing?.confirmedAt)}</dd>
              </div>
              <div className="adm-kv-item">
                <dt>Zuletzt geändert</dt>
                <dd>{formatMarkupDateTime(pricing?.updatedAt)}</dd>
              </div>
              <div className="adm-kv-item">
                <dt>Bestätigt von</dt>
                <dd>{formatConfirmedBy(pricing?.confirmedBy)}</dd>
              </div>
            </dl>

            {/* Unbestätigt: der gespeicherte Standardwert ist ausdrücklich KEINE
                individuelle Bestätigung — der Hinweis sagt, was als Nächstes fehlt.
                Bei bereits freigeschalteten Bestandskunden steht dort stattdessen
                die sachliche Einordnung (kein Warnzustand, keine Störung). */}
            {!confirmed && (
              <p className="adm-markup-note" role="status">
                <Icon n="info" s={15} />
                <span>
                  {notice?.headline && <strong className="adm-markup-note-head">{notice.headline}</strong>}
                  {notice?.text || MARKUP_TEXTS.confirmRequired}
                </span>
              </p>
            )}

            {successText && (
              <div className="alert alert-success adm-markup-success" role="status">
                <Icon n="check" s={16} />
                <span className="adm-markup-success-body">
                  <span>{successText}</span>
                  {typeof onApproveNow === "function" && (
                    <button type="button" className="btn btn-primary btn-sm adm-markup-approve-now" onClick={onApproveNow}>
                      <Icon n="check" s={13} /> Kunde jetzt freischalten
                    </button>
                  )}
                </span>
              </div>
            )}

            {saveError && !saveError.field && (
              <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{saveError.text}</div>
            )}

            {/* Bearbeitung — echtes Label, sichtbares %-Suffix, Hilfetext direkt
                am Feld (die Verwechslung Rate/Prozent wird damit praktisch
                ausgeschlossen). */}
            <form className="adm-markup-form" onSubmit={submit} noValidate>
              <div className="adm-markup-field">
                <label className="adm-edit-label" htmlFor={MARKUP_INPUT_ID}>{MARKUP_TEXTS.fieldLabel}</label>
                <div className={`adm-markup-input-wrap${fieldError ? " adm-markup-input-invalid" : ""}`}>
                  <input
                    id={MARKUP_INPUT_ID}
                    ref={inputRef}
                    className="adm-markup-input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => setTouched(true)}
                    disabled={busy}
                    aria-invalid={fieldError ? "true" : undefined}
                    aria-describedby={describedBy}
                  />
                  <span className="adm-markup-suffix" aria-hidden="true">%</span>
                </div>
                <p id="adm-markup-help" className="adm-markup-help">{MARKUP_TEXTS.inputHelp}</p>
                {fieldError && (
                  <p id="adm-markup-error" className="field-error" role="alert">{fieldError}</p>
                )}
                {!fieldError && noChange && (
                  <p id="adm-markup-nochange" className="adm-markup-nochange">{NO_CHANGE_HINT}</p>
                )}
              </div>

              <div className="adm-markup-actions">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !parsed.ok || !hasChange}
                  aria-busy={busy ? "true" : undefined}
                  aria-describedby={noChange ? "adm-markup-nochange" : undefined}
                >
                  {busy
                    ? <><span className="spinner spinner-dark" /> {markupActionBusyLabel(pricing)}</>
                    : <><Icon n="check" s={14} /> {markupActionLabel(pricing)}</>}
                </button>
              </div>
            </form>

            <p className="adm-support-hint">{MARKUP_TEXTS.effectHint}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default CustomerMarkupSection;
