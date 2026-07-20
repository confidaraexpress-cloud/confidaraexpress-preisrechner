import React, { useEffect, useRef } from "react";
import { Icon } from "../ui/Icon";

// Bestätigungsdialog vor dem Archivieren — erklärt ausdrücklich, dass
// historische Sendungen unverändert bleiben und die Adresse wiederherstellbar
// ist (Regel #5). Fokusmanagement: Fokus geht beim Öffnen auf „Abbrechen",
// Escape schließt (außer während einer laufenden Mutation), Fokus kehrt beim
// Schließen zum auslösenden Element zurück.
export function AddressArchiveConfirmDialog({ address, busy, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  useEffect(() => {
    if (!address) return;
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  if (!address) return null;
  const name = address.label || address.company || address.contactName || "diese Adresse";

  return (
    <div className="abk-dialog-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="abk-dialog-card" role="dialog" aria-modal="true" aria-labelledby="abk-archive-title" aria-describedby="abk-archive-desc">
        <div className="abk-dialog-icon abk-dialog-icon--warn" aria-hidden="true"><Icon n="trash" s={20} /></div>
        <h2 id="abk-archive-title" className="abk-dialog-title">Adresse archivieren?</h2>
        <p id="abk-archive-desc" className="abk-dialog-desc">
          „{name}" wird archiviert und erscheint nicht mehr in der aktiven Liste.
          Bereits gebuchte Sendungen bleiben davon vollständig unberührt — historische
          Daten werden nicht verändert. Sie können die Adresse jederzeit wiederherstellen.
        </p>
        <div className="abk-dialog-actions">
          <button type="button" ref={cancelRef} className="btn btn-outline" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? <><span className="spinner" /> Wird archiviert …</> : "Archivieren"}
          </button>
        </div>
      </div>
    </div>
  );
}
