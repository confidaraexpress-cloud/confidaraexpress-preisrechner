import React, { useState } from "react";
import { Icon } from "../ui/Icon";

// Handelsrechnungs-Upload — REINE DARSTELLUNG. Status/Handler kommen aus dem
// Orchestrator (useCommercialInvoice). Nur im commercial-Modus gerendert. Kein
// Dateiname wird dauerhaft angezeigt/gespeichert (Datenschutz); der Datei-Input
// wird nach jeder Auswahl sofort zurückgesetzt. Entfernen erfolgt nur nach
// expliziter Bestätigung (kleines Inline-Muster, kein Modal).
export function CommercialInvoiceUpload({ status, message, messageType, onFileSelected, onRemove }) {
  const [confirming, setConfirming] = useState(false);

  const checking = status === "checking";
  const uploading = status === "uploading";
  const deleting = status === "deleting";
  const present = status === "present";
  const busy = checking || uploading || deleting;

  const handleChange = (e) => {
    const file = e.target.files && e.target.files[0];
    // Input SOFORT zurücksetzen: verhindert einen zweiten Upload durch Re-Render
    // und hält keinen Dateinamen im Input-State.
    e.target.value = "";
    if (file) onFileSelected(file);
  };

  return (
    <div className="ci-upload">
      {!present && (
        <div className="field">
          <label className="field-label" htmlFor="commercial-invoice-file">Handelsrechnung (PDF, optional)</label>
          <input
            id="commercial-invoice-file"
            className="field-input ci-upload-input"
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleChange}
            disabled={busy}
            aria-describedby="ci-upload-hint ci-upload-status"
          />
          <span id="ci-upload-hint" className="field-hint">Optional: genau eine PDF-Datei, maximal 10 MB. Die Datei wird sicher an unseren Versandpartner übergeben. Sie können auch ohne PDF fortfahren.</span>
          {status === "absent" && (
            <span className="field-hint ci-upload-optional">Keine Handelsrechnungs-PDF hinterlegt. Der Upload ist optional.</span>
          )}
        </div>
      )}

      {/* Checking/Error werden zentral von der Status-Region der Sektion angezeigt. */}
      <div id="ci-upload-status" className="ci-upload-status" aria-live="polite">
        {uploading && <span className="ci-status ci-status-busy"><span className="spinner spinner-dark" /> Handelsrechnung wird hochgeladen…</span>}
        {deleting && <span className="ci-status ci-status-busy"><span className="spinner spinner-dark" /> Handelsrechnung wird entfernt…</span>}
        {present && <span className="ci-status ci-status-ok"><Icon n="check" s={15} c="currentColor" /> Handelsrechnung erfolgreich hinterlegt</span>}
      </div>

      {/* Upload-spezifische Meldung (Vorprüfung/Info). Status-„error" behandelt die Sektion. */}
      {message && status !== "error" && status !== "checking" && (
        <span
          className={`ci-upload-msg ${messageType === "info" ? "ci-notice" : "field-error"}`}
          role={messageType === "error" ? "alert" : undefined}
        >
          {message}
        </span>
      )}

      {present && !confirming && (
        <button type="button" className="btn btn-outline btn-sm ci-remove-btn" onClick={() => setConfirming(true)} disabled={deleting}>
          <Icon n="trash" s={14} c="currentColor" /> Handelsrechnung entfernen
        </button>
      )}

      {present && confirming && (
        <div className="ci-remove-confirm" role="group" aria-label="Handelsrechnung entfernen bestätigen">
          <span className="ci-remove-confirm-text">Hinterlegte Handelsrechnung wirklich entfernen?</span>
          <div className="ci-remove-confirm-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirming(false)} disabled={deleting}>Abbrechen</button>
            <button
              type="button"
              className="btn btn-sm ci-remove-danger"
              onClick={() => { setConfirming(false); onRemove(); }}
              disabled={deleting}
            >
              <Icon n="trash" s={14} c="currentColor" /> Entfernen bestätigen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
