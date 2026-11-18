import { useEffect } from "react";

/* ── Zeigerwerte der Admin-Anmeldung (Leitstand 2.0, Betreiberauftrag 2026-11-17, Canonical v2.143) ────────────────
   Die Bühne der Admin-Anmeldung reagiert leise auf die Maus: Ebenen verschieben sich um ihre Tiefe, die Kamera des
   Hologramms folgt ein paar Grad, ein weiches Licht folgt dem Zeiger durch den Raum und über das Glas des Panels
   (styles/auth.css, Abschnitt „Admin-Anmeldung“). Dieser Hook liefert dafür nur Zahlen als CSS-Variablen am Wurzel-
   element der Seite:
     --auth-px, --auth-py   Lage des Zeigers, −1 … 1 (Mitte 0)
     --auth-zx, --auth-zy   Zeiger in px (Fenster)
     --auth-lx, --auth-ly   Zeiger in px relativ zum Panel
     --auth-licht           1, solange der Zeiger im Fenster ist, sonst 0
   Nur bei feinem Zeiger mit Hover und ohne Wunsch nach reduzierter Bewegung; auf Touch-Geräten und bei „reduce“
   bleibt alles in der Ruhelage (die des Seitengerüsts). Höchstens ein Schreibvorgang je Bild (requestAnimationFrame),
   passive Listener, keine Messung außerhalb des Bildtakts. Nur Darstellung: kein Zustand, keine Logik, keine Daten. */
const EIGENSCHAFTEN = ["--auth-px", "--auth-py", "--auth-zx", "--auth-zy", "--auth-lx", "--auth-ly", "--auth-licht"];

export function useLeitstandZeiger(wurzelRef) {
  useEffect(() => {
    const wurzel = wurzelRef.current;
    if (!wurzel || typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    let rahmen = 0;
    let x = 0;
    let y = 0;
    const zeichnen = () => {
      rahmen = 0;
      const breite = window.innerWidth || 1;
      const hoehe = window.innerHeight || 1;
      const panel = wurzel.querySelector(".auth-admin-panel");
      const r = panel ? panel.getBoundingClientRect() : null;
      const s = wurzel.style;
      s.setProperty("--auth-px", ((x / breite) * 2 - 1).toFixed(3));
      s.setProperty("--auth-py", ((y / hoehe) * 2 - 1).toFixed(3));
      s.setProperty("--auth-zx", `${Math.round(x)}px`);
      s.setProperty("--auth-zy", `${Math.round(y)}px`);
      if (r) {
        s.setProperty("--auth-lx", `${Math.round(x - r.left)}px`);
        s.setProperty("--auth-ly", `${Math.round(y - r.top)}px`);
      }
      s.setProperty("--auth-licht", "1");
    };
    const bewegen = (e) => {
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      x = e.clientX;
      y = e.clientY;
      if (!rahmen) rahmen = window.requestAnimationFrame(zeichnen);
    };
    // Verlässt der Zeiger das Fenster, kehrt alles in die Ruhelage zurück (die Übergänge im Stylesheet gleiten).
    const verlassen = () => {
      if (rahmen) { window.cancelAnimationFrame(rahmen); rahmen = 0; }
      const s = wurzel.style;
      s.setProperty("--auth-px", "0");
      s.setProperty("--auth-py", "0");
      s.setProperty("--auth-licht", "0");
    };

    window.addEventListener("pointermove", bewegen, { passive: true });
    document.documentElement.addEventListener("pointerleave", verlassen);
    window.addEventListener("blur", verlassen);
    return () => {
      if (rahmen) window.cancelAnimationFrame(rahmen);
      window.removeEventListener("pointermove", bewegen);
      document.documentElement.removeEventListener("pointerleave", verlassen);
      window.removeEventListener("blur", verlassen);
      for (const e of EIGENSCHAFTEN) wurzel.style.removeProperty(e);
    };
  }, [wurzelRef]);
}
