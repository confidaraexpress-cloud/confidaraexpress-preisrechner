import React from "react";
import { useDialog } from "../../hooks/useDialog";
import { Icon } from "../ui/Icon";
import { formatRecipientDisplay, formatRoute } from "../../utils/draftsView.mjs";
import { FORM_DRAFT_KIND, formatFormRecipient, formatFormRoute } from "../../utils/formDraftsView.mjs";

// Identifiziert den Entwurf kind-abhängig: Formularentwürfe tragen ihre Daten
// unter `summary`, berechnete Shipment-Drafts unter recipientAddress/fromCountry.
function draftIdentity(draft) {
  if (draft?.kind === FORM_DRAFT_KIND) return `${formatFormRecipient(draft)} · ${formatFormRoute(draft)}`;
  return `${formatRecipientDisplay(draft)} · ${formatRoute(draft)}`;
}

// Bestätigungsdialog vor dem endgültigen Löschen eines Entwurfs. Identifiziert
// den Entwurf klar (Empfänger + Route), macht die Endgültigkeit unmissverständlich.
// Fokusmanagement: Fokus auf „Abbrechen" beim Öffnen, Escape schließt (außer
// während einer laufenden Löschung), Fokus kehrt zum auslösenden Element zurück.
export function DraftDeleteConfirmDialog({ draft, busy, onCancel, onConfirm }) {
  // Fokusfalle, Fokusrückgabe und Escape kommen seit Paket A, Phase 3 aus dem
  // gemeinsamen Hook. Während einer laufenden Löschung schließt Escape nicht.
  const dialogRef = useDialog({ open: !!draft, onClose: onCancel, closeOnEscape: !busy });

  if (!draft) return null;

  return (
    <div className="dft-dialog-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="dft-dialog-card" role="dialog" aria-modal="true" aria-labelledby="dft-delete-title" aria-describedby="dft-delete-desc" ref={dialogRef}>
        <div className="dft-dialog-icon" aria-hidden="true"><Icon n="trash" s={20} /></div>
        <h2 id="dft-delete-title" className="dft-dialog-title">Entwurf wirklich löschen?</h2>
        <p id="dft-delete-desc" className="dft-dialog-desc">
          <span className="dft-dialog-target">{draftIdentity(draft)}</span><br />
          Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
        <div className="dft-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button type="button" className="dft-delete-confirm-btn" onClick={onConfirm} disabled={busy}>
            {busy ? <><span className="spinner" /> Wird gelöscht …</> : "Löschen"}
          </button>
        </div>
      </div>
    </div>
  );
}
