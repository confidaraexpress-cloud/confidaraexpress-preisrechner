import React, { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import {
  cancellationReasonState,
  CANCELLATION_REASON_MAX,
  CANCELLATION_REASON_MIN,
  shipmentDialogLabel,
} from "../../utils/customerCancellation.mjs";

// Dialog zur Eingabe eines Stornierungsgrunds. Reine Darstellung + lokale
// Eingabe/Validierung; das Absenden und die Fehlerbehandlung liegen beim
// Aufrufer (ShipmentsList). Fokusmanagement, Escape/Backdrop (blockiert während
// busy) und Fokus-Restore analog zu den bestehenden Dialogen. `error` (String)
// wird bei korrigierbaren Fehlern gesetzt; die Eingabe bleibt dabei erhalten,
// weil der Dialog gemountet bleibt.
export function CancellationRequestDialog({ shipment, busy = false, error = "", onSubmit, onClose }) {
  const [reason, setReason] = useState("");
  const cardRef = useRef(null);
  const textareaRef = useRef(null);
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);
  const uid = useId();
  const titleId = `stn-title-${uid}`;
  const descId = `stn-desc-${uid}`;
  const counterId = `stn-counter-${uid}`;
  const errorId = `stn-error-${uid}`;

  const rs = cancellationReasonState(reason);
  const canSubmit = rs.valid && !busy;

  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) { e.preventDefault(); onClose(); return; }
      if (e.key === "Tab" && cardRef.current) {
        const f = cardRef.current.querySelectorAll(
          'button:not([disabled]), textarea:not([disabled]), [href], input:not([disabled])'
        );
        if (f.length === 0) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const sendLabel = shipmentDialogLabel(shipment);

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;   // Doppelklick-/Invalid-Schutz zusätzlich zum disabled-Button
    onSubmit(reason);
  };

  return (
    <div
      className="stn-dialog-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <form
        ref={cardRef}
        className="stn-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onSubmit={submit}
      >
        <div className="stn-dialog-icon" aria-hidden="true"><Icon n="ban" s={20} /></div>
        <h2 id={titleId} className="stn-dialog-title">Stornierung anfragen</h2>
        <p id={descId} className="stn-dialog-desc">
          Bitte teile uns kurz mit, warum du diese Sendung stornieren möchtest. Wir prüfen deine
          Anfrage und melden uns persönlich bei dir.
        </p>

        <div className="stn-dialog-hint" role="note">
          <Icon n="info" s={14} c="currentColor" />
          <span>Eine Stornierung kann je nach Versandstatus möglicherweise nicht mehr oder nur gegen Gebühren möglich sein.</span>
        </div>

        {sendLabel && (
          <p className="stn-dialog-target">Sendung: <strong>{sendLabel}</strong></p>
        )}

        <label className="stn-dialog-label" htmlFor={`stn-reason-${uid}`}>Stornierungsgrund</label>
        <textarea
          id={`stn-reason-${uid}`}
          ref={textareaRef}
          className="stn-dialog-textarea"
          rows={4}
          maxLength={CANCELLATION_REASON_MAX}
          placeholder="Bitte beschreibe kurz den Grund für deine Anfrage."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          aria-describedby={`${counterId}${error ? ` ${errorId}` : ""}`}
          aria-invalid={error ? true : undefined}
        />
        <div className="stn-dialog-meta">
          <span id={counterId} className="stn-dialog-counter" aria-live="polite">
            {rs.length} / {CANCELLATION_REASON_MAX}
          </span>
          {rs.tooShort && !rs.empty && (
            <span className="stn-dialog-min">Mindestens {CANCELLATION_REASON_MIN} Zeichen</span>
          )}
        </div>

        {error && (
          <div id={errorId} className="stn-dialog-alert" role="alert">
            <Icon n="x" s={14} c="currentColor" /><span>{error}</span>
          </div>
        )}

        <div className="stn-dialog-actions">
          <button type="submit" className="btn btn-primary" disabled={!canSubmit} aria-busy={busy || undefined}>
            {busy ? <><span className="spinner" /> Wird gesendet …</> : "Anfrage absenden"}
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
