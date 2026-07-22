import React from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   VaporBackground — ruhige Hintergrund-Atmosphäre der „Vapor"-Übersicht.
   Fixe Ebene HINTER dem Content (bleibt beim Scrollen stehen). Reihenfolge von
   hinten nach vorn: weicher, entsättigter Verlaufshimmel → zwei sehr weiche
   Aurora-Flächen + eine faint Lavendel-Nuance → dezenter Soft-Bloom → wenige,
   sehr feine, transluzente Netzwerklinien (fast Wasserzeichen; bewusst außerhalb
   des zentralen Lesebereichs) → feines Rauschen (gegen Banding) → dezente
   Vignette. Erzeugt Tiefe, nie Aufmerksamkeit.

   Rein präsentational: aria-hidden, pointer-events:none. Farben/Blur/Bewegung in
   src/styles/vapor.css (.vp-bg …); Bewegung steht unter prefers-reduced-motion
   vollständig still, mobil sind Linien/Bloom komplett ausgeblendet.
   ═══════════════════════════════════════════════════════════════════════════ */
export function VaporBackground() {
  return (
    <div className="vp-bg" aria-hidden="true">
      <div className="vp-bg-grad" />
      <span className="vp-aur vp-aur-a" />
      <span className="vp-aur vp-aur-b" />
      <span className="vp-aur vp-aur-c" />
      <span className="vp-bloom" />
      {/* Drei zurückhaltende Linien: oberer Streifen, obere rechte Ecke, unterer
          Streifen — jeweils dünn und transluzent, ohne durch KPI-Karten oder
          Texte im Zentrum zu verlaufen. */}
      <svg className="vp-routes" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <path d="M360 120 C 660 60, 980 190, 1520 96" />
        <path d="M1120 -40 C 1280 200, 1180 420, 1540 560" />
        <path d="M300 860 C 720 790, 1060 900, 1540 812" />
      </svg>
      <div className="vp-noise" />
      <div className="vp-vig" />
    </div>
  );
}
