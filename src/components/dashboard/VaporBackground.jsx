import React from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   VaporBackground — Hintergrund-Atmosphäre der „Vapor"-Übersicht (Handoff §5).
   Fixe Ebene HINTER dem Content (bleibt beim Scrollen stehen). Reihenfolge von
   hinten nach vorn: weicher Verlaufshimmel → drei sehr weiche Aurora-Lichtwolken
   → Soft-Bloom → dezentes, gerades Logistik-Netz (Linien + Knoten, responsiv
   ausgedünnt) → feines Rauschen (gegen Banding) → dezente Vignette. Erzeugt
   Tiefe, nie Aufmerksamkeit.

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
      {/* Subtle Logistics Network: ein einziges statisches SVG mit geraden
          Segmenten und wenigen Knoten. Responsiv in Ebenen ausgedünnt (Farben,
          Strichstärke und Sichtbarkeit je Breakpoint in vapor.css): vpn-lg nur
          Desktop, vpn-md/vpn-base ab Tablet, vpn-mobile eine minimale zentrale
          Konstellation für schmale Viewports. Keine Animation, keine Filter. */}
      <svg className="vp-net" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
        <g className="vpn-lg">
          <line x1="1180" y1="90" x2="1090" y2="190" className="vpn-line" />
          <line x1="1090" y1="190" x2="1230" y2="250" className="vpn-line" />
          <line x1="1180" y1="90" x2="1230" y2="250" className="vpn-line" />
          <line x1="1090" y1="190" x2="1300" y2="150" className="vpn-line" />
          <line x1="1180" y1="90" x2="1400" y2="90" className="vpn-line" />
          <line x1="1290" y1="780" x2="1370" y2="700" className="vpn-line" />
          <line x1="1290" y1="780" x2="1180" y2="860" className="vpn-line" />
          <line x1="1370" y1="700" x2="1180" y2="860" className="vpn-line" />
          <circle cx="120" cy="120" r="1.7" className="vpn-node" />
          <circle cx="1180" cy="90" r="1.7" className="vpn-node" />
          <circle cx="1230" cy="250" r="1.7" className="vpn-node" />
          <circle cx="1090" cy="190" r="1.7" className="vpn-node" />
          <circle cx="1370" cy="700" r="1.7" className="vpn-node" />
          <circle cx="300" cy="800" r="1.7" className="vpn-node" />
          <circle cx="258" cy="178" r="2.3" className="vpn-glow" />
        </g>
        <g className="vpn-md">
          <line x1="120" y1="120" x2="250" y2="190" className="vpn-line" />
          <line x1="1180" y1="90" x2="1300" y2="150" className="vpn-line" />
          <line x1="1300" y1="150" x2="1400" y2="90" className="vpn-line" />
          <line x1="1300" y1="150" x2="1230" y2="250" className="vpn-line vpn-line--strong" />
          <line x1="1230" y1="250" x2="1380" y2="460" className="vpn-line" />
          <line x1="1380" y1="460" x2="1240" y2="540" className="vpn-line vpn-line--strong" />
          <line x1="1240" y1="540" x2="1140" y2="740" className="vpn-line" />
          <line x1="1140" y1="740" x2="1290" y2="780" className="vpn-line" />
          <line x1="1380" y1="460" x2="1370" y2="700" className="vpn-line" />
          <line x1="1240" y1="540" x2="1290" y2="780" className="vpn-line" />
          <circle cx="250" cy="190" r="1.7" className="vpn-node" />
          <circle cx="1300" cy="150" r="8" className="vpn-halo" /><circle cx="1300" cy="150" r="2.9" className="vpn-node vpn-node--main" />
          <circle cx="1400" cy="90" r="1.7" className="vpn-node" />
          <circle cx="1380" cy="460" r="1.7" className="vpn-node" />
          <circle cx="1240" cy="540" r="8" className="vpn-halo" /><circle cx="1240" cy="540" r="2.9" className="vpn-node vpn-node--main" />
          <circle cx="1140" cy="740" r="8" className="vpn-halo" /><circle cx="1140" cy="740" r="2.9" className="vpn-node vpn-node--main" />
          <circle cx="1290" cy="780" r="1.7" className="vpn-node" />
          <circle cx="1372" cy="452" r="2.3" className="vpn-glow" />
          <circle cx="1360" cy="690" r="2.3" className="vpn-glow" />
        </g>
        <g className="vpn-base">
          <line x1="250" y1="190" x2="80" y2="430" className="vpn-line" />
          <line x1="80" y1="430" x2="160" y2="730" className="vpn-line" />
          <line x1="160" y1="730" x2="300" y2="800" className="vpn-line" />
          <line x1="300" y1="800" x2="720" y2="860" className="vpn-line" />
          <line x1="720" y1="860" x2="1180" y2="860" className="vpn-line" />
          <line x1="1180" y1="860" x2="1140" y2="740" className="vpn-line" />
          <circle cx="80" cy="430" r="8" className="vpn-halo" /><circle cx="80" cy="430" r="2.9" className="vpn-node vpn-node--main" />
          <circle cx="160" cy="730" r="1.7" className="vpn-node" />
          <circle cx="720" cy="860" r="1.7" className="vpn-node" />
          <circle cx="1180" cy="860" r="1.7" className="vpn-node" />
          <circle cx="178" cy="715" r="2.3" className="vpn-glow" />
        </g>
        <g className="vpn-mobile">
          <line x1="560" y1="86" x2="720" y2="58" className="vpn-line" />
          <line x1="720" y1="58" x2="884" y2="92" className="vpn-line vpn-line--strong" />
          <line x1="560" y1="86" x2="654" y2="150" className="vpn-line" />
          <line x1="720" y1="58" x2="654" y2="150" className="vpn-line" />
          <line x1="884" y1="92" x2="812" y2="156" className="vpn-line" />
          <line x1="720" y1="58" x2="812" y2="156" className="vpn-line" />
          <circle cx="720" cy="58" r="8" className="vpn-halo" /><circle cx="720" cy="58" r="2.9" className="vpn-node vpn-node--main" />
          <circle cx="654" cy="150" r="1.7" className="vpn-node" />
          <circle cx="812" cy="156" r="1.7" className="vpn-node" />
          <circle cx="722" cy="60" r="2.3" className="vpn-glow" />
        </g>
      </svg>
      <div className="vp-noise" />
      <div className="vp-vig" />
    </div>
  );
}
