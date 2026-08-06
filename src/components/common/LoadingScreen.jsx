import React from "react";
import markPrimary from "../../assets/brand/mark-primary.svg";

/* Route-Fallback von React.lazy. Fläche, Marke und Ladepunkt kommen aus dem
   gemeinsamen System — vorher stand hier ein rohes #070f20 inline und ein
   nachgebautes Text-„CE". */
export function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="text-center">
        <img
          className="loading-screen-mark"
          src={markPrimary}
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        <div className="spinner spinner-dark" />
        <span className="sr-only">Die Seite wird geladen …</span>
      </div>
    </div>
  );
}
