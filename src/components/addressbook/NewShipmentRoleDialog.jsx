import React, { useEffect, useRef } from "react";
import { Icon } from "../ui/Icon";

// „Beides"-Adressen sind für „Neue Sendung" nicht eindeutig zuordenbar — vor
// der Navigation entscheidet der Nutzer bewusst, als welche Rolle die Adresse
// übernommen wird (Regel: „both" erfordert Auswahl sender/recipient).
export function NewShipmentRoleDialog({ address, onCancel, onChoose }) {
  const firstBtnRef = useRef(null);
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  useEffect(() => {
    if (!address) return;
    firstBtnRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  if (!address) return null;
  const name = address.label || address.company || address.contactName || "Diese Adresse";

  return (
    <div className="abk-dialog-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="abk-dialog-card" role="dialog" aria-modal="true" aria-labelledby="abk-role-title" aria-describedby="abk-role-desc">
        <div className="abk-dialog-icon abk-dialog-icon--info" aria-hidden="true"><Icon n="zap" s={20} /></div>
        <h2 id="abk-role-title" className="abk-dialog-title">Als was verwenden?</h2>
        <p id="abk-role-desc" className="abk-dialog-desc">
          „{name}" ist sowohl als Absender als auch als Empfänger hinterlegt. Wählen Sie,
          wie sie für die neue Sendung vorbelegt werden soll.
        </p>
        <div className="abk-dialog-actions abk-dialog-actions--stack">
          <button type="button" ref={firstBtnRef} className="btn btn-primary" onClick={() => onChoose("sender")}>
            Als Absender verwenden
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onChoose("recipient")}>
            Als Empfänger verwenden
          </button>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
