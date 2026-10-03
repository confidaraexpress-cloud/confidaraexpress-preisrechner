import React, { useEffect, useRef, useState } from "react";

// Verwaltungsaktionsmenü einer Entwurfszeile/-karte — dasselbe Muster wie
// AddressActionsMenu.jsx: ein Textauslöser „Weitere Aktionen" (Redesign
// 2026-10: kein Kebab-Symbol) und Einträge ohne Symbole. „Löschen" ist damit kein dauerhaft
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

  const runDelete = () => {
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
    onDelete?.(draft);
  };

  return (
    <div className="dft-actions" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="dft-actions-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Weitere Aktionen für diesen Entwurf"
        onClick={() => setOpen((v) => !v)}
        disabled={busy || disabled}
      >
        {busy && <span className="spinner spinner-dark spinner-sm" />}
        <span>Weitere Aktionen</span>
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
            Löschen
          </button>
        </div>
      )}
    </div>
  );
}
