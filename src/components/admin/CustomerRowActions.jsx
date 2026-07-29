import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { buildCustomerMenuModel, customerDisplayName } from "../../utils/adminCustomerView.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Zugängliches Aktionsmenü einer Kundenzeile (Kebab-Dropdown).
//
// „Details" ist die primäre, direkt sichtbare Aktion der Zeile und liegt bewusst
// NICHT hier drin. In diesem Menü stehen nur die selteneren Statusaktionen —
// „Kunde blockieren" ist damit nicht mehr die visuell dominante Aktion jeder
// freigegebenen Zeile. Gefährliche Einträge sind durch Trenner und eigene Farbe
// von den normalen Aktionen getrennt.
//
// Reihenfolge, Beschriftung, Trenner und Sperrgründe kommen aus
// buildCustomerMenuModel (rein und getestet). Ein Statuswechsel wird nie direkt
// ausgelöst: jeder Menüpunkt öffnet einen Bestätigungsdialog im Aufrufer.
// Fokus: Escape schließt und gibt den Fokus zurück, Klick außerhalb schließt.
// ─────────────────────────────────────────────────────────────────────────────
export function CustomerRowActions({ user, currentAdminId, busy = false, onSelect }) {
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

  // „details" ist die sichtbare Zeilenaktion — im Menü bleiben die Statusaktionen.
  const items = buildCustomerMenuModel({ user, currentAdminId }).filter((i) => i.key !== "details");
  if (items.length === 0) return null;

  const run = (item) => () => {
    if (item.disabled) return;
    setOpen(false);
    onSelect?.(item.key, user);
  };

  return (
    <div className="adm-rowactions" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="adm-rowactions-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Statusaktionen für ${customerDisplayName(user)}`}
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
      >
        {busy
          ? <span className="spinner spinner-dark" style={{ width: 14, height: 14 }} />
          : <Icon n="settings" s={16} />}
      </button>
      {open && (
        <div className="adm-rowactions-menu" role="menu">
          {items.map((item, i) => (
            <React.Fragment key={item.key}>
              {item.separatorBefore && i > 0 && <div className="adm-rowactions-divider" role="separator" />}
              <button
                ref={i === 0 ? firstItemRef : undefined}
                type="button"
                role="menuitem"
                className={`adm-rowactions-item${item.danger ? " adm-rowactions-item--danger" : ""}`}
                onClick={run(item)}
                disabled={item.disabled}
                title={item.reason || undefined}
              >
                <Icon n={item.icon} s={15} /> {item.label}
              </button>
              {/* Ein gesperrter Eintrag bleibt sichtbar — mit Grund, nie kommentarlos. */}
              {item.disabled && item.reason && (
                <p className="adm-rowactions-reason">{item.reason}</p>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomerRowActions;
