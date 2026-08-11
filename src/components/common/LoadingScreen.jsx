import React from "react";
import { BrandLogo } from "../ui/BrandLogo";

/* Route-Fallback von React.lazy. Fläche, Marke und Ladepunkt kommen aus dem
   gemeinsamen System — vorher stand hier ein rohes #070f20 inline und ein
   nachgebautes Text-„CE".

   Das Signet steht hier bewusst DEKORATIV (alt=""): der Container ist eine
   Live-Region, ein alt-Text würde bei jedem Routenwechsel den Markennamen
   mit vorlesen. Die Statusmeldung darunter sagt bereits, was passiert. */
export function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="text-center">
        <BrandLogo variant="signet" tone="standard" alt="" className="loading-screen-mark" />
        <div className="spinner spinner-dark" />
        <span className="sr-only">Die Seite wird geladen …</span>
      </div>
    </div>
  );
}
