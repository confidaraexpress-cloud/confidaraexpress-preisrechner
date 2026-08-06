import React from "react";
import { useDialog } from "../../hooks/useDialog";
import { Icon } from "../ui/Icon";

// Rückfrage vor dem bewussten Zurücksetzen der Sendungseingaben.
//
// Der temporäre Versandvorgang bleibt bei Sidebar-Wechsel, „Zurück", „Vorwärts"
// und Reload absichtlich stehen. Genau deshalb braucht es EINEN sichtbaren,
// bewussten Weg, ihn zu beenden — und der bekommt eine Rückfrage, sobald
// tatsächlich Angaben oder berechnete Angebote verloren gingen.
//
// Bewusst KEINE Danger-Optik: es wird nichts gelöscht, was der Nutzer nicht
// gerade selbst eingegeben hat, und ein gespeicherter Entwurf ist davon nicht
// betroffen. Fokusfalle, Fokusrückgabe und Escape kommen aus useDialog.
export function ShipmentResetConfirmDialog({ open, hasOffers, onCancel, onConfirm }) {
  const dialogRef = useDialog({ open, onClose: onCancel });

  if (!open) return null;

  return (
    <div className="ce-dialog-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div
        className="ce-dialog ce-dialog--sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ns-reset-title"
        aria-describedby="ns-reset-desc"
        ref={dialogRef}
      >
        <div className="ce-dialog-head">
          <span className="ce-dialog-icon" aria-hidden="true"><Icon n="refresh" s={20} /></span>
          <div className="ce-dialog-body">
            <h2 id="ns-reset-title" className="ce-dialog-title">Eingaben zurücksetzen?</h2>
            <p id="ns-reset-desc" className="ce-dialog-desc">
              {hasOffers
                ? "Ihre Sendungsangaben und die berechneten Angebote werden verworfen. Gespeicherte Entwürfe bleiben davon unberührt."
                : "Ihre Sendungsangaben werden verworfen. Gespeicherte Entwürfe bleiben davon unberührt."}
            </p>
          </div>
        </div>
        <div className="ce-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel}>Abbrechen</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>Zurücksetzen</button>
        </div>
      </div>
    </div>
  );
}
