import React from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   PremiumBackground — wiederverwendbare Premium-Atmosphäre (nur Präsentation)
   ───────────────────────────────────────────────────────────────────────────
   Aus der Übersicht („Highend Blue") extrahierte, reine Hintergrund-Architektur —
   jetzt VOLLSTÄNDIG STATISCH: fixe Ebene mit statischer Farbtiefe (radiale
   Verläufe im .pbg-grad statt Glow-Blobs), Punkt-Raster, feinen Routen-/
   Verbindungslinien, ruhigen Knoten (statischer Halo + Lichtpunkt-Kern),
   dezenten Glyphen und Vignette. Keine Animation, kein SMIL, keine großen
   Blur-Blobs, kein will-change.

   Struktur, SVG-Geometrie und Positionen sind für ALLE Varianten IDENTISCH —
   nur die Farben unterscheiden sich:
     • variant="dark"  → exakt die bisherige Übersicht (Farb-/Layer-Regeln unter
                         „.ce-dark .pbg*"; die dark-Palette hier = die alten
                         Inline-SVG-Werte 1:1 → pixelgleich).
     • variant="soft"  → dunklere, gesättigte Blautöne für Sendungen/Rechnungen
                         (Regeln unter „.pbg-soft"), damit deren bestehende helle
                         Soft-Premium-Farbwelt erhalten bleibt (keine Navy-Basis).
     • variant="neutral" → Slate-/Anthrazit-Töne für „Neue Sendung" & Preisrechner
                         (Regeln unter „.pbg-neutral") auf einer neutralen
                         #DCDCDC-Grundfarbe. Slate = Grau mit dezentem Navy-
                         Unterton (bleibt in der ConfidaraExpress-Farbfamilie).
     • variant="profile" → Blau/Violett auf Navy-Basis für „Mein Profil"
                         (Regeln unter „.pbg-profile"), abgeleitet aus den dort
                         bereits vorhandenen Tönen (#0f1438/#0b1030/#06081c Navy,
                         ~#473C8B Violett, ~#436EEE Blau) — bewusst NICHT die
                         Übersicht-Farben (kein .ce-dark-Bezug).

   Enthält KEINE Inhalte (keine KPIs/Hero/Widgets). aria-hidden,
   pointer-events:none. Styling: src/styles/dashboard-premium.css.
   ═══════════════════════════════════════════════════════════════════════════ */

// SVG-Farbpaletten je Variant. Diese Werte müssen im Inline-SVG gesetzt werden
// (CSS erreicht die Gradient-Stops/Fills nicht zuverlässig pro Seite). Alle
// CSS-basierten Layer (Blobs, Dots, Glyphen, Noise, Vignette) werden dagegen
// per Scope (.ce-dark .pbg* bzw. .pbg-soft) eingefärbt.
const PALETTES = {
  // „dark": exakt die bisherigen Übersicht-Werte (Overview.jsx, unverändert).
  dark: { node: ["#bcd6ff", "#5b8cff", "#2e5cff"], line: ["#4d8bff", "#6ea8ff", "#4d8bff"], lineMid: 0.85, core: "#eaf2ff", ring: "#7fb0ff", parcel: "#dbe8ff" },
  // „soft": dunklere Blautöne, damit die Atmosphäre auf hellem Grund liest.
  soft: { node: ["#60a5fa", "#2563eb", "#1d4ed8"], line: ["#2563eb", "#1d4ed8", "#2563eb"], lineMid: 0.55, core: "#1d4ed8", ring: "#2563eb", parcel: "#1d4ed8" },
  // „neutral": Slate-/Anthrazit-Töne (Grau mit dezentem Navy-Unterton), damit die
  // Atmosphäre auf der #DCDCDC-Grundfarbe sichtbar und hochwertig wirkt.
  neutral: { node: ["#94a3b8", "#64748b", "#475569"], line: ["#64748b", "#475569", "#64748b"], lineMid: 0.5, core: "#334155", ring: "#64748b", parcel: "#475569" },
  // „profile": aus den bereits vorhandenen Profil-Farben abgeleitet (NICHT die
  // Übersicht-Palette) — Violett #473C8B als äußerer Node-/Ring-Ton, Blau
  // #436EEE für Linien/Ring, ein helles Off-White/Lavendel (dezentes
  // „Champagner"-Licht) nur für den hellsten Node-Kern/-Innenstop, analog zu
  // „dark"s hellem Kern auf dunkler Navy-Basis.
  profile: { node: ["#e7e1fb", "#6f5fc9", "#473C8B"], line: ["#436EEE", "#7c93ff", "#436EEE"], lineMid: 0.7, core: "#f3eeff", ring: "#7c93ff", parcel: "#e7e1fb" },
  // „profileLight": Executive-Ivory — sehr dezente Blaugrau-/Slate-Töne für die
  // hellen Logistikmotive auf dem warmen Off-White von „Mein Profil". Bewusst
  // gedämpft (geringe lineMid) und in CSS zusätzlich stark heruntergedeckt
  // (.pbg-profileLight), damit die Motive ruhig und nicht dominant bleiben.
  profileLight: { node: ["#cdd6e6", "#a6b3cc", "#8194b3"], line: ["#93a3c2", "#aebbd6", "#93a3c2"], lineMid: 0.42, core: "#8194b3", ring: "#aebbd6", parcel: "#cdd6e6" },
};

// Hintergrund-Glyphen (§19-B3) — Line-Icons in dünnem Duktus (stroke 1.1).
// Unverändert aus Overview.jsx übernommen.
function Glyph({ n }) {
  const P = {
    parcel:   "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12",
    envelope: "M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9ZM4 7l8 6 8-6",
    pin:      "M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    plane:    "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
  };
  if (n === "truck") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="14" height="12" rx="1" /><path d="M15 8h4l3 3v5h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.3" /><circle cx="17.5" cy="18.5" r="2.3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      <path d={P[n]} />
    </svg>
  );
}

const GLYPHS = [
  { cls: "g-a", n: "parcel" }, { cls: "g-b", n: "envelope" }, { cls: "g-c", n: "pin" },
  { cls: "g-d", n: "plane" },  { cls: "g-e", n: "truck" },    { cls: "g-f", n: "parcel" },
];

function PremiumBackgroundBase({ variant = "dark" }) {
  const v = PALETTES[variant] || PALETTES.dark;
  const sfx = `-${variant}`; // eindeutige SVG-defs-IDs je Variant (keine Kollision)
  const nodes = [[120,760],[820,430],[1470,210],[180,300],[900,340],[1500,640],[300,880],[1120,820]];
  return (
    <div className={`pbg pbg${sfx}`} aria-hidden="true">
      <div className="pbg-grad" />
      <div className="pbg-dots" />
      <svg className="pbg-routes" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id={`pgNode${sfx}`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={v.node[0]} /><stop offset="0.5" stopColor={v.node[1]} /><stop offset="1" stopColor={v.node[2]} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`pgLine${sfx}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={v.line[0]} stopOpacity="0" /><stop offset="0.5" stopColor={v.line[1]} stopOpacity={v.lineMid} /><stop offset="1" stopColor={v.line[2]} stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="pbg-lines" fill="none" stroke={`url(#pgLine${sfx})`} strokeWidth="1.6" strokeDasharray="3 9" strokeLinecap="round">
          <path d="M120 760 C 360 560, 560 600, 820 430" />
          <path d="M820 430 C 1040 300, 1180 360, 1470 210" />
          <path d="M180 300 C 420 360, 620 260, 900 340" />
          <path d="M900 340 C 1160 410, 1280 620, 1500 640" />
          <path d="M300 880 C 620 820, 760 900, 1120 820" />
        </g>
        <g className="pbg-nodes">
          {nodes.map(([x, y], i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              <circle r="26" fill={`url(#pgNode${sfx})`} className="pbg-halo" />
              <circle r="3.4" fill={v.core} />
            </g>
          ))}
        </g>
      </svg>
      <div className="pbg-glyphs">
        {GLYPHS.map((g) => (
          <span className={`pbg-glyph ${g.cls}`} key={g.cls}><Glyph n={g.n} /></span>
        ))}
      </div>
      <div className="pbg-vig" />
    </div>
  );
}

// Rein präsentational, nur eine primitive `variant`-Prop, kein State/Context/
// Effekt → React.memo vermeidet die Reconciliation dieses großen SVG-/Layer-
// Baums bei jedem übergeordneten Render (z. B. Formulareingaben, Preis-Slider),
// solange sich `variant` nicht ändert. Der Baum ist rein statisch — keine
// Animation, kein SMIL, kein will-change; die öffentliche API (variant) bleibt.
export const PremiumBackground = React.memo(PremiumBackgroundBase);
