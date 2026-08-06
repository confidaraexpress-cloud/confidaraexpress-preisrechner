import React from "react";
import { useDialog } from "../../hooks/useDialog";
import { Icon } from "../ui/Icon";

// Bestätigungsdialog vor dem endgültigen Löschen einer Adressbuchzeile. Macht
// ausdrücklich klar, dass die Löschung dauerhaft und nicht wiederherstellbar ist
// und dass bereits gebuchte Sendungen unverändert bleiben (serverseitiger
// Snapshot, keine Referenz). Fokusmanagement: Fokus geht beim Öffnen auf
// „Abbrechen", Escape schließt (außer während einer laufenden Löschung), Fokus
// kehrt beim Schließen zum auslösenden Element zurück. Keine Type-to-confirm-
// Eingabe (eine Adresse lässt sich jederzeit neu anlegen).
export function AddressDeleteConfirmDialog({ address, busy, error, onCancel, onConfirm }) {
  // Fokusfalle, Fokusrückgabe und Escape kommen seit Paket A, Phase 3 aus dem
  // gemeinsamen Hook. Während einer laufenden Löschung schließt Escape nicht.
  const dialogRef = useDialog({ open: !!address, onClose: onCancel, closeOnEscape: !busy });

  if (!address) return null;
  const name = address.label || address.company || address.contactName || "diese Adresse";

  return (
    <div className="abk-dialog-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="abk-dialog-card" role="dialog" aria-modal="true" aria-labelledby="abk-delete-title" aria-describedby="abk-delete-desc" ref={dialogRef}>
        <div className="abk-dialog-icon abk-dialog-icon--warn" aria-hidden="true"><Icon n="trash" s={20} /></div>
        <h2 id="abk-delete-title" className="abk-dialog-title">Adresse endgültig löschen?</h2>
        <p id="abk-delete-desc" className="abk-dialog-desc">
          „{name}" wird dauerhaft aus dem Adressbuch entfernt und kann nicht
          wiederhergestellt werden. Bereits gebuchte Sendungen bleiben unverändert.
        </p>
        {address.isDefaultSender && (
          <p className="abk-dialog-note">Diese Adresse ist aktuell als Standard-Absender festgelegt.</p>
        )}
        {error && <p className="abk-dialog-error" role="alert">{error}</p>}
        <div className="abk-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? <><span className="spinner" /> Wird gelöscht …</> : "Adresse löschen"}
          </button>
        </div>
      </div>
    </div>
  );
}
