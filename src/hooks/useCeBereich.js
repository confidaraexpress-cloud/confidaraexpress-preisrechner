import { useLayoutEffect } from "react";
import { bleibtImKundenbereich } from "../utils/kundenBereichPfad.mjs";

/* ── Bereichs-Scope (Premium-Redesign Etappe 1, 2026-10; Blue-Light-Familie 2026-11-16) ──
   Jede Ansicht trägt ihre Gestaltung über das Attribut am Wurzelelement:
   <html data-ce-bereich="kunde" | "admin" | "partner" | "oeffentlich" | "auth">.
   Die Token-Überschreibungen der Premium-Bereiche (variables.css, Block am Dateiende) und alle Regeln in
   premium-redesign.css hängen an "kunde" und "auth".

   Designfamilie Blue Light (Betreiberauftrag „Final Master Release“, 2026-11-16): Kundenbereich, Adminpanel,
   Partnerportal und öffentliche Seiten (Sendungsverfolgung, Rechtstexte) tragen zusätzlich
   data-ce-familie="blue-light". Daran hängen die gemeinsamen Farbrollen, Titel, Bedienelemente und Flächen
   (kunde-obsidian.css); was nur einen Bereich betrifft, hängt weiter an data-ce-bereich. Die Anmeldeseiten — auch
   die holografische Admin-Anmeldung — und der öffentliche Preisrechner gehören nicht zur Familie: sie behalten ihre
   Navy-Bühne.

   Warum am <html> und nicht an der Shell: Lieferzeit-Auswahl, Lade-Overlay des
   Vergleichs, Dialoge und Kartenpopups rendern als Portal außerhalb der Shell und
   müssen den Bereich trotzdem erben.

   useLayoutEffect setzt die Attribute vor dem ersten Zeichnen, es gibt also
   keinen sichtbaren Wechsel. Beim Verlassen des Bereichs werden sie entfernt,
   aber nur, wenn das Bereichsattribut noch diesem Bereich gehört. Beim direkten
   Wechsel zwischen zwei Bereichen räumt der alte nicht den neuen ab. Führt die
   Navigation auf einen anderen Pfad des Kundenbereichs, bleibt „kunde“ stehen —
   sonst läge zwischen alter und neuer Seite ein Bild ohne Bereich (Confidara
   Obsidian: ein heller Blitz; utils/kundenBereichPfad.mjs, bleibtImKundenbereich). */
export const BLUE_LIGHT_FAMILIE = Object.freeze(["kunde", "admin", "partner", "oeffentlich"]);

export function useCeBereich(bereich) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-ce-bereich", bereich);
    if (BLUE_LIGHT_FAMILIE.includes(bereich)) root.setAttribute("data-ce-familie", "blue-light");
    else root.removeAttribute("data-ce-familie");
    return () => {
      if (bleibtImKundenbereich(bereich, window.location.pathname)) return;
      if (root.getAttribute("data-ce-bereich") === bereich) {
        root.removeAttribute("data-ce-bereich");
        root.removeAttribute("data-ce-familie");
      }
    };
  }, [bereich]);
}
