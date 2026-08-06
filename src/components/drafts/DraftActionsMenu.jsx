import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";

// Verwaltungsaktionsmenü (Kebab-Dropdown) einer Entwurfszeile/-karte — dasselbe
// Muster wie AddressActionsMenu.jsx. „Löschen" ist damit kein dauerhaft
// sichtbarer, roter Button mehr, sondern ein bewusst aufgerufener, sekundärer
// Pfad. „Fortsetzen" (Formularentwürfe) bleibt als eigenständiger, direkt
// sichtbarer Button daneben — es ist die häufigere, wertschöpfende Aktion.
export function DraftActionsMenu({ draft, busy, disabled, onDelete }) {
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

  const runDelete = () => { setOpen(false); onDelete?.(draft); };

  return (
    <div className="dft-actions" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="dft-actions-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Aktionen für diesen Entwurf"
        title="Aktionen"
        onClick={() => setOpen((v) => !v)}
        disabled={busy || disabled}
      >
        {busy ? <span className="spinner spinner-dark" style={{ width: 14, height: 14 }} /> : <Icon n="settings" s={16} />}
      </button>
      {open && (
        <div className="dft-actions-menu" role="menu">
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            className="dft-actions-item dft-actions-item--danger"
            onClick={runDelete}
          >
            <Icon n="trash" s={15} /> Löschen
          </button>
        </div>
      )}
    </div>
  );
}
