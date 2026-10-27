import { useLayoutEffect } from "react";

/* ── Bereichs-Scope des Premium-Redesigns (Etappe 1, 2026-10) ─────────────────
   Der Kundenbereich und die Auth-Ansichten tragen ihre Gestaltung über EIN
   Attribut am Wurzelelement: <html data-ce-bereich="kunde" | "auth">.
   Alle Token-Überschreibungen (variables.css, Block am Dateiende) und alle
   Regeln in premium-redesign.css hängen an diesem Attribut.

   Warum am <html> und nicht an der Shell: Lieferzeit-Auswahl, Lade-Overlay des
   Vergleichs und Kartenpopups rendern als Portal außerhalb der Shell und
   müssen den Bereich trotzdem erben.

   Admin, Partnerportal und Partnerregistrierung rufen den Hook nie auf. Ihre
   Gestaltung bleibt dadurch pixelgleich, obwohl alle Stylesheets in einem
   gemeinsamen Bündel liegen.

   useLayoutEffect setzt das Attribut vor dem ersten Zeichnen, es gibt also
   keinen sichtbaren Wechsel. Beim Verlassen des Bereichs wird es entfernt,
   aber nur, wenn es noch diesem Bereich gehört. Beim direkten Wechsel zwischen
   zwei Bereichen räumt der alte nicht den neuen ab. */
export function useCeBereich(bereich) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-ce-bereich", bereich);
    return () => {
      if (root.getAttribute("data-ce-bereich") === bereich) root.removeAttribute("data-ce-bereich");
    };
  }, [bereich]);
}
