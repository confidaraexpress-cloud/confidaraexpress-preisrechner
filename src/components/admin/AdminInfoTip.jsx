import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";

/* ── Hilfesymbol des Adminbereichs (Admin-Vereinfachung 2026-11-10) ───────────
   Ein Info-Knopf, der einen kurzen Hilfetext auf- und zuklappt (Toggletip).
   Für Erklärungen, die nicht ständig sichtbar sein müssen — nie für Warnungen,
   Preise, Zahlungsbedingungen oder Folgen einer Aktion: die stehen weiter
   sichtbar im Text.

   Bedienung: Klick, Enter oder Leertaste öffnet und schließt; Escape und ein
   Klick daneben schließen, der Fokus bleibt auf dem Knopf. Der Text hängt am
   Knopf (aria-controls, aria-expanded) und steht geöffnet direkt dahinter in der
   Lesereihenfolge. Die Lage richtet sich nach dem Fenster: der Text bleibt immer ganz
   sichtbar, auch bei 320 px Breite. */
const RAND_PX = 12;

export function AdminInfoTip({ label, children, className = "" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const id = useId();
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const place = useCallback(() => {
    const btn = btnRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const r = btn.getBoundingClientRect();
    const breite = Math.min(pop.offsetWidth, window.innerWidth - 2 * RAND_PX);
    const links = Math.min(Math.max(RAND_PX, r.left + r.width / 2 - breite / 2), window.innerWidth - RAND_PX - breite);
    const unten = r.bottom + 8;
    const passtUnten = unten + pop.offsetHeight <= window.innerHeight - RAND_PX;
    setPos({ left: Math.round(links), top: Math.round(passtUnten ? unten : Math.max(RAND_PX, r.top - 8 - pop.offsetHeight)) });
  }, []);

  useLayoutEffect(() => { if (open) place(); else setPos(null); }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); } };
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, place]);

  return (
    <span className={`adm-tip${className ? ` ${className}` : ""}`}>
      <button
        ref={btnRef}
        type="button"
        className="adm-tip-btn"
        aria-label={`Hilfe: ${label}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon n="info" s={16} />
      </button>
      {/* Nur geöffnet im DOM, direkt hinter dem Knopf (Lesereihenfolge) — keine dauerhafte, leere
          Statusregion auf jeder Seite. Bis zur ersten Messung unsichtbar, damit nichts an (0, 0) aufblitzt. */}
      {open && (
        <span
          ref={popRef}
          id={id}
          className="adm-tip-pop adm-tip-pop-open"
          style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
        >
          {children}
        </span>
      )}
    </span>
  );
}

export default AdminInfoTip;
