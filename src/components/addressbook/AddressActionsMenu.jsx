import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { buildAddressMenuModel } from "../../utils/addressBookView.mjs";

// Zugängliches Verwaltungs-Aktionsmenü (Kebab-Dropdown) — geteilt zwischen
// Desktop-Zeile und Mobil-Karte. Enthält NUR Verwaltungsaktionen; „Sendung
// erstellen"/„Neue Sendung" ist bewusst KEIN Menüpunkt mehr, sondern ein
// direkt sichtbarer Zeilen-/Karten-Button (AddressCreateShipmentButton).
// Reihenfolge, Labels, Sichtbarkeit der Standard-Aktionen und der Trenner vor
// „Löschen" kommen aus buildAddressMenuModel (rein, getestet). „Löschen" ist
// eine echte, dauerhafte Löschung (Bestätigungsdialog im Aufrufer).
export function AddressActionsMenu({
  address, busy,
  onEdit, onDuplicate, onToggleFavorite, onSetDefaultSender, onSetDefaultRecipient,
  onDelete,
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

  const run = (fn) => () => {
    setOpen(false);
    // Fokus ZUERST zurück auf den Trigger, DANN die Aktion auslösen.
    //
    // Ein Dialog, den die Aktion öffnet, merkt sich beim Öffnen das gerade
    // fokussierte Element, um den Fokus beim Schließen dorthin zurückzugeben.
    // Ohne diese Zeile wäre das der eben angeklickte Menüeintrag — der mit dem
    // Menü verschwindet. Der Fokus landete nach „Abbrechen" auf <body>, und die
    // Tastaturposition in der Liste war verloren. (In Paket E im Adminportal
    // behoben und dort als identische Lücke im Kundenportal dokumentiert.)
    triggerRef.current?.focus();
    fn?.(address);
  };

  // key → konkreter Handler-Prop (die reine Modell-Logik kennt keine Handler).
  const handlers = {
    edit: onEdit,
    duplicate: onDuplicate,
    toggleFavorite: onToggleFavorite,
    setDefaultSender: onSetDefaultSender,
    setDefaultRecipient: onSetDefaultRecipient,
    delete: onDelete,
  };
  const items = buildAddressMenuModel(address);

  return (
    <div className="abk-actions" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="abk-actions-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Aktionen für ${address.label || address.company || address.contactName || "Adresse"}`}
        title="Aktionen"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
      >
        {busy ? <span className="spinner spinner-dark spinner-sm" /> : <Icon n="dots" s={16} />}
      </button>
      {open && (
        <div className="abk-actions-menu" role="menu">
          {items.map((item, i) => (
            <React.Fragment key={item.key}>
              {item.separatorBefore && <div className="abk-actions-divider" role="separator" />}
              <button
                ref={i === 0 ? firstItemRef : undefined}
                type="button"
                role="menuitem"
                className={`abk-actions-item${item.danger ? " abk-actions-item--danger" : ""}`}
                onClick={run(handlers[item.key])}
              >
                <Icon n={item.icon} s={15} /> {item.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
