import React from "react";
import { BrandLogo } from "../ui/BrandLogo";

/* Route-Fallback von React.lazy. Fläche, Marke und Ladepunkt kommen aus dem
   gemeinsamen System — vorher stand hier ein rohes #070f20 inline und ein
   nachgebautes Text-„CE".

   Das Signet steht hier bewusst DEKORATIV (alt=""): der Container ist eine
   Live-Region, ein alt-Text würde bei jedem Routenwechsel den Markennamen
   mit vorlesen. Die Statusmeldung darunter sagt bereits, was passiert.

   `dunkel`: auf den Anmeldeseiten mit statischem Gerüst (Navy-Bühne) derselbe dunkle Grund mit hellem Signet und
   Ladepunkt — kein heller Zwischenbildschirm, während ein gespeichertes Token geprüft wird (App.jsx).
   `kunde`: auf den Pfaden des Kundenbereichs (utils/kundenBereichPfad.mjs) dasselbe helle Signet auf dem Schwarz des
   Kundenbereichs (Confidara Obsidian, kunde-obsidian.css) — kein heller Zwischenbildschirm vor der dunklen Seite. */
export function LoadingScreen({ dunkel: dunklerGrund = false, kunde = false }) {
  // Dunkler Grund: das Navy der Anmeldegerüste oder das Schwarz des Kundenbereichs — in beiden Fällen Reverse.
  const dunkel = dunklerGrund || kunde;
  return (
    <div className={`loading-screen${dunkel ? " loading-screen--dunkel" : ""}${kunde ? " loading-screen--kunde" : ""}`} role="status" aria-live="polite">
      <div className="text-center">
        <BrandLogo variant="signet" tone={dunkel ? "reverse" : "standard"} alt="" className="loading-screen-mark" />
        <div className={dunkel ? "spinner" : "spinner spinner-dark"} />
        <span className="sr-only">Die Seite wird geladen …</span>
      </div>
    </div>
  );
}
