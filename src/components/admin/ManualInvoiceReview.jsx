import React, { useCallback, useEffect, useId, useState } from "react";
import { useDialog } from "../../hooks/useDialog";
import { InvoiceSheet } from "./InvoiceSheet";
import { InvoicePdfPreviewModal } from "../dashboard/InvoicePdfPreviewModal";
import { blockerText } from "../../utils/manualInvoiceView.mjs";
import { EDITOR_TEXT as E, reviewFacts, reviewIssueState } from "../../utils/manualInvoiceEditor.mjs";

// Rechnungseditor (2026-11-21): Prüfansicht vor dem Ausstellen. Gezeigt wird genau der Beleg, der ausgestellt würde
// (GET …/drafts/:id/review — gespeicherte Fassung, echtes PDF), dazu Kurzfakten aus Serverwerten und die
// Serversperren. „Rechnung ausstellen" sendet die geprüfte Fassung mit ihrem Fingerabdruck; weicht der Beleg
// inzwischen ab, lehnt der Server ab und die Ansicht lädt neu. Die Entscheidung trifft immer der Server.
export function ManualInvoiceReview({
  state,            // { loading, data, error, notice }
  recipient,
  subline,
  busy = false,
  onIssue,          // (checked) => void
  onClose,
}) {
  const uid = useId();
  const titelId = `mi-review-title-${uid}`;
  const [geprueft, setGeprueft] = useState(false);
  const [pdfOffen, setPdfOffen] = useState(false);
  // Escape im PDF-Fenster erreicht diesen Dialog nicht (eigener Knoten, eigener Tastenhandler).
  const ref = useDialog({ onClose: () => { if (!busy) onClose(); }, closeOnEscape: !busy });
  const daten = state && state.data ? state.data : null;
  // Neuer Beleg (anderer Fingerabdruck, z. B. nach „seit der Prüfung geändert") = neue Prüfung: das Häkchen fällt.
  const fingerabdruck = daten ? String(daten.fingerprint || "") : "";
  useEffect(() => { setGeprueft(false); }, [fingerabdruck]);
  // Stabiler Abrufer: das PDF-Fenster lädt nur neu, wenn sich der Beleg ändert.
  const bytes = daten && daten.sheet ? daten.sheet.bytes : null;
  const holePdf = useCallback(
    () => Promise.resolve({ blob: new Blob([bytes], { type: "application/pdf" }), filename: "Rechnungsentwurf.pdf" }),
    [bytes],
  );
  const fakten = daten ? reviewFacts(daten, recipient) : [];
  const lage = reviewIssueState(daten, { checked: geprueft });
  const sperren = daten && Array.isArray(daten.issueBlockers) ? daten.issueBlockers : [];

  return (
    <>
      <div
        className="adm-modal-overlay"
        role="presentation"
        onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      >
        <div className="adm-modal ce-dialog--xl adm-mi-review" role="dialog" aria-modal="true" aria-labelledby={titelId} ref={ref} id="mi-review">
          <div className="adm-mi-review-head">
            <div>
              <h2 id={titelId} className="adm-modal-title">{E.reviewTitle}</h2>
              {subline && <p className="adm-modal-sub">{subline}</p>}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy} id="mi-review-close">
              {E.reviewClose}
            </button>
          </div>

          <div className="adm-mi-review-body">
            <div className="adm-mi-review-facts">
              <p className="adm-modal-text">{E.reviewIntro}</p>
              {state && state.notice && (
                <div className="alert alert-info adm-mi-notice" role="status" id="mi-review-notice"><span>{state.notice}</span></div>
              )}
              {state && state.error && (
                <div className="alert alert-error adm-mi-notice" role="alert" id="mi-review-message">
                  <span>{state.error}</span>
                  {Array.isArray(state.blockers) && state.blockers.length > 0 && (
                    <ul className="adm-mi-list">{state.blockers.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  )}
                </div>
              )}
              {daten && (
                <dl className="adm-mi-review-list" id="mi-review-facts">
                  {fakten.map((f) => (
                    <div key={f.label} className={[f.strong && "adm-mi-review-strong", f.wide && "adm-mi-review-wide"].filter(Boolean).join(" ") || undefined}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {daten && sperren.length > 0 && (
                <div className="adm-mi-blocked" id="mi-review-blocked">
                  <p>{E.reviewBlocked}</p>
                  <ul className="adm-mi-blockers">{sperren.map((b, i) => <li key={i}>{blockerText(b)}</li>)}</ul>
                </div>
              )}
              {daten && sperren.length === 0 && (
                <label className="adm-mi-check" htmlFor="mi-review-checked">
                  <input
                    type="checkbox" id="mi-review-checked" checked={geprueft} disabled={busy}
                    onChange={(e) => setGeprueft(e.target.checked)}
                  />
                  <span>{E.reviewChecked}</span>
                </label>
              )}
              <p className="adm-support-hint">{E.reviewNoEmail}</p>
              <div className="adm-modal-actions adm-mi-review-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setPdfOffen(true)} disabled={!daten || busy} id="mi-review-pdf">
                  {E.sheetOpenPdf}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm adm-irreversible-action"
                  id="mi-issue-confirm"
                  onClick={() => onIssue(geprueft)}
                  disabled={!lage.allowed || busy}
                  aria-busy={busy ? "true" : undefined}
                >
                  {busy ? <><span className="spinner spinner-dark" /> Wird ausgestellt …</> : E.reviewIssue}
                </button>
              </div>
            </div>

            <div className="adm-mi-review-sheet">
              {state && state.loading && <p className="adm-mi-sheet-wait" role="status">{E.reviewLoading}</p>}
              {daten && <InvoiceSheet sheet={daten.sheet} idPrefix="mi-review-sheet" onOpenPdf={() => setPdfOffen(true)} />}
            </div>
          </div>
        </div>
      </div>
      {pdfOffen && daten && (
        <InvoicePdfPreviewModal
          title="Prüfansicht — Entwurf, keine Rechnung"
          fetchPdf={holePdf}
          onClose={() => setPdfOffen(false)}
          printable
        />
      )}
    </>
  );
}

export default ManualInvoiceReview;
