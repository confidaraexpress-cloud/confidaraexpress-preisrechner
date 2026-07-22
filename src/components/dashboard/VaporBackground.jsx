import React from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   VaporBackground — Hintergrund-Atmosphäre der „Vapor"-Übersicht (Handoff §5).
   Fixe Ebene HINTER dem Content (bleibt beim Scrollen stehen). Reihenfolge von
   hinten nach vorn: weicher Verlaufshimmel → drei sehr weiche Aurora-Lichtwolken
   → Soft-Bloom → breite, transluzente Flug-Routen → feines Rauschen (gegen
   Banding) → dezente Vignette. Erzeugt Tiefe, nie Aufmerksamkeit.

   Rein präsentational: aria-hidden, pointer-events:none. Farben/Blur/Bewegung in
   src/styles/vapor.css (.vp-bg …); Bewegung steht unter prefers-reduced-motion
   vollständig still.
   ═══════════════════════════════════════════════════════════════════════════ */
export function VaporBackground() {
  return (
    <div className="vp-bg" aria-hidden="true">
      <div className="vp-bg-grad" />
      <span className="vp-aur vp-aur-a" />
      <span className="vp-aur vp-aur-b" />
      <span className="vp-aur vp-aur-c" />
      <span className="vp-bloom" />
      <svg className="vp-routes" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <path d="M-60 250 C 260 140, 520 360, 860 250 S 1360 150, 1520 300" />
        <path d="M-40 560 C 300 470, 560 640, 900 540 S 1300 430, 1520 560" />
        <path d="M140 -40 C 300 220, 220 470, 480 640 S 770 900, 900 1000" />
        <path d="M1180 -40 C 1050 240, 1250 470, 1080 700 S 980 920, 1120 1020" />
      </svg>
      <div className="vp-noise" />
      <div className="vp-vig" />
    </div>
  );
}
