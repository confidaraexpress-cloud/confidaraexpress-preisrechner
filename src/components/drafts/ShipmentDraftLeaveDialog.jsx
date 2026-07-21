import React, { useEffect, useRef } from "react";
import { Icon } from "../ui/Icon";

// Verlassen-Dialog: erscheint, wenn der Nutzer ConfidaraExpress-intern eine
// andere Seite öffnen möchte, während in „Neue Sendung" fachlich relevante,
// ungespeicherte Angaben vorliegen. Drei Aktionen: speichern / verwerfen /
// weiter bearbeiten. Fokusmanagement + Escape/Backdrop analog zum Löschdialog
// (DraftDeleteConfirmDialog); initialer Fokus liegt auf dem sicheren Button
// „Weiter bearbeiten". Reine Darstellung — alle Entscheidungen trifft der
// Aufrufer (NewShipmentPage).
const MODE_MESSAGES = {
  error: "Der Entwurf konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  conflict: "Dieser Entwurf wurde inzwischen an anderer Stelle geändert.",
  notFound: "Dieser Entwurf ist nicht mehr verfügbar. Du kannst die aktuellen Angaben als neuen Entwurf speichern.",
  rateLimited: "Zu viele Speicheranfragen. Bitte versuche es in Kürze erneut.",
};

export function ShipmentDraftLeaveDialog({ mode = "idle", busy = false, onSave, onReloadCurrent, onDiscard, onContinue }) {
  const cardRef = useRef(null);
  const continueRef = useRef(null);
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  useEffect(() => {
    continueRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) { e.preventDefault(); onContinue(); return; }
      if (e.key === "Tab" && cardRef.current) {
        const f = cardRef.current.querySelectorAll("button:not([disabled])");
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

  const message = MODE_MESSAGES[mode] || "";
  const isConflict = mode === "conflict";
  const primaryLabel = isConflict ? "Aktuelle Version laden"
    : (mode === "error" || mode === "rateLimited") ? "Erneut versuchen"
    : "Als Entwurf speichern";
  const onPrimary = isConflict ? onReloadCurrent : onSave;

  return (
    <div className="dft-dialog-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onContinue(); }}>
      <div ref={cardRef} className="dft-dialog-card" role="dialog" aria-modal="true" aria-labelledby="dft-leave-title" aria-describedby="dft-leave-desc">
        <div className="dft-dialog-icon dft-leave-icon" aria-hidden="true"><Icon n="form" s={20} /></div>
        <h2 id="dft-leave-title" className="dft-dialog-title">Sendung als Entwurf speichern?</h2>
        <p id="dft-leave-desc" className="dft-dialog-desc">
          Du hast bereits Angaben zu dieser Sendung gemacht. Möchtest du sie als Entwurf speichern, bevor du diesen Bereich verlässt?
        </p>

        {message && (
          <div className="dft-leave-alert" role="alert">
            <Icon n="info" s={14} c="currentColor" /><span>{message}</span>
          </div>
        )}

        <div className="dft-leave-actions">
          <button type="button" className="btn btn-primary" onClick={onPrimary} disabled={busy} aria-busy={busy || undefined}>
            {busy ? <><span className="spinner" /> Wird gespeichert …</> : primaryLabel}
          </button>
          <button type="button" className="btn btn-ghost dft-leave-discard" onClick={onDiscard} disabled={busy}>
            Verwerfen und verlassen
          </button>
          <button type="button" ref={continueRef} className="btn btn-outline" onClick={onContinue} disabled={busy}>
            Weiter bearbeiten
          </button>
        </div>
      </div>
    </div>
  );
}
