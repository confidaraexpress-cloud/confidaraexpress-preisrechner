import React, { useEffect, useRef } from "react";
import { Icon } from "../ui/Icon";
import { formatRecipientDisplay, formatRoute } from "../../utils/draftsView.mjs";

// Bestätigungsdialog vor dem endgültigen Löschen eines Entwurfs. Identifiziert
// den Entwurf klar (Empfänger + Route), macht die Endgültigkeit unmissverständlich.
// Fokusmanagement: Fokus auf „Abbrechen" beim Öffnen, Escape schließt (außer
// während einer laufenden Löschung), Fokus kehrt zum auslösenden Element zurück.
export function DraftDeleteConfirmDialog({ draft, busy, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  useEffect(() => {
    if (!draft) return;
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  if (!draft) return null;

  return (
    <div className="dft-dialog-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="dft-dialog-card" role="dialog" aria-modal="true" aria-labelledby="dft-delete-title" aria-describedby="dft-delete-desc">
        <div className="dft-dialog-icon" aria-hidden="true"><Icon n="trash" s={20} /></div>
        <h2 id="dft-delete-title" className="dft-dialog-title">Entwurf wirklich löschen?</h2>
        <p id="dft-delete-desc" className="dft-dialog-desc">
          <span className="dft-dialog-target">{formatRecipientDisplay(draft)} · {formatRoute(draft)}</span><br />
          Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
        <div className="dft-dialog-actions">
          <button type="button" ref={cancelRef} className="btn btn-outline" onClick={onCancel} disabled={busy}>
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
