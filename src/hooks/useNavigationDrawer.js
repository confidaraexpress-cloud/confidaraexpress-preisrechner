import { useEffect, useRef } from "react";
import { useDialog } from "./useDialog";

/* ── Mobile Navigations-Drawer (Auftrag 1, P6, 2026-10-17) ───────────────────
   Unterhalb ihrer Schwelle sind die Seitenleisten (Kunde 860 px, Admin 900 px)
   Drawer. Geöffnet verhalten sie sich wie ein Dialog (useDialog): Fokus hinein,
   Tab bleibt im Drawer, Escape schließt, danach Fokus zurück auf den Menüknopf.

   Zusätzlich: Wird das Fenster bei geöffnetem Drawer breiter als die Schwelle
   (Tablet gedreht), schließt er — sonst bliebe die Fokusfalle auf der festen
   Spalte liegen. Der Hook fasst ausschließlich den Öffnungszustand an; er setzt
   keinen Klappzustand der Navigationsgruppen und lädt nichts. */
export function useNavigationDrawer({ open, onClose, drawerMaxPx }) {
  const ref = useDialog({ open: Boolean(open), onClose });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const breit = window.matchMedia(`(min-width: ${drawerMaxPx + 1}px)`);
    const beiWechsel = () => { if (breit.matches) onCloseRef.current?.(); };
    breit.addEventListener("change", beiWechsel);
    return () => breit.removeEventListener("change", beiWechsel);
  }, [open, drawerMaxPx]);

  return ref;
}
