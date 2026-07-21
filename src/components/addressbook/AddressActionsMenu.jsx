import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { canSetDefaultSender, canSetDefaultRecipient } from "../../utils/addressBookView.mjs";

// Zugängliches Aktionsmenü (Kebab-Dropdown) — geteilt zwischen Desktop-Zeile
// und Mobil-Karte. Sichtbarkeit von „Standard-Absender/-Empfänger" richtet sich
// nach der Rolle der Adresse (siehe addressBookView.mjs). „Löschen" ist eine
// echte, dauerhafte Löschung (Bestätigungsdialog im Aufrufer).
export function AddressActionsMenu({
  address, busy,
  onEdit, onDuplicate, onToggleFavorite, onSetDefaultSender, onSetDefaultRecipient,
  onNewShipment, onDelete,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const firstItemRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn) => () => { setOpen(false); fn?.(address); };

  return (
    <div className="abk-actions" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="abk-actions-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Aktionen für ${address.label || address.company || address.contactName || "Adresse"}`}
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
      >
        {busy ? <span className="spinner spinner-dark" style={{ width: 14, height: 14 }} /> : <Icon n="settings" s={16} />}
      </button>
      {open && (
        <div className="abk-actions-menu" role="menu">
          <button ref={firstItemRef} type="button" role="menuitem" className="abk-actions-item" onClick={run(onEdit)}>
            <Icon n="form" s={15} /> Bearbeiten
          </button>
          <button type="button" role="menuitem" className="abk-actions-item" onClick={run(onDuplicate)}>
            <Icon n="copy" s={15} /> Duplizieren
          </button>
          <button type="button" role="menuitem" className="abk-actions-item" onClick={run(onToggleFavorite)}>
            <Icon n="star" s={15} /> {address.favorite ? "Favorit entfernen" : "Als Favorit markieren"}
          </button>
          {canSetDefaultSender(address) && !address.isDefaultSender && (
            <button type="button" role="menuitem" className="abk-actions-item" onClick={run(onSetDefaultSender)}>
              <Icon n="shieldCheck" s={15} /> Als Standard-Absender setzen
            </button>
          )}
          {canSetDefaultRecipient(address) && !address.isDefaultRecipient && (
            <button type="button" role="menuitem" className="abk-actions-item" onClick={run(onSetDefaultRecipient)}>
              <Icon n="shieldCheck" s={15} /> Als Standard-Empfänger setzen
            </button>
          )}
          <div className="abk-actions-divider" role="separator" />
          <button type="button" role="menuitem" className="abk-actions-item" onClick={run(onNewShipment)}>
            <Icon n="zap" s={15} /> Neue Sendung
          </button>
          <div className="abk-actions-divider" role="separator" />
          <button type="button" role="menuitem" className="abk-actions-item abk-actions-item--danger" onClick={run(onDelete)}>
            <Icon n="trash" s={15} /> Löschen
          </button>
        </div>
      )}
    </div>
  );
}
