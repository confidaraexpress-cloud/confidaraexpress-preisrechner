import React, { useEffect, useRef } from "react";
import { Icon } from "../ui/Icon";

// Kleiner Bestätigungsdialog vor dem Abbrechen einer ausstehenden E-Mail-
// Änderung. Fokus geht beim Öffnen auf „Zurück" (nicht-destruktive Vorauswahl),
// Escape schließt (außer während des Requests), Fokus kehrt beim Schließen zum
// Auslöser zurück. Leichtgewichtige Fokusfalle (nur zwei Aktionen).
export function EmailChangeCancelDialog({ open, busy, error, onConfirm, onClose }) {
  const backRef = useRef(null);
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  // busy/onClose über Refs → Effekt läuft nur bei open-Wechsel (kein erneutes
  // Fokussieren, wenn während des Abbruch-Requests busy wechselt), liest aber
  // immer die aktuellen Werte.
  const busyRef = useRef(busy); busyRef.current = busy;
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    backRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { if (!busyRef.current) onCloseRef.current?.(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll("button:not([disabled])"));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      openerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="email-change-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div
        ref={dialogRef}
        className="email-change-modal email-change-modal--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ec-cancel-title"
        aria-describedby="ec-cancel-desc"
      >
        <div className="email-change-modal-head">
          <div className="email-change-modal-icon email-change-modal-icon--warn" aria-hidden="true"><Icon n="info" s={20} /></div>
          <h2 id="ec-cancel-title" className="email-change-modal-title">E-Mail-Änderung abbrechen?</h2>
        </div>
        <p id="ec-cancel-desc" className="email-change-modal-desc">
          Die neue E-Mail-Adresse wird nicht übernommen. Deine bisherige Login-E-Mail
          bleibt unverändert.
        </p>

        {error && (
          <div className="alert alert-error mb-16" role="alert">
            <Icon n="x" s={16} /><span>{error}</span>
          </div>
        )}

        <div className="email-change-modal-actions">
          <button type="button" ref={backRef} className="btn btn-outline" onClick={onClose} disabled={busy}>Zurück</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? <><span className="spinner" /> Wird abgebrochen …</> : "Änderung abbrechen"}
          </button>
        </div>
      </div>
    </div>
  );
}
