import React from "react";
import { createPortal } from "react-dom";
import { KARTE_VB, kartenStrecke } from "../utils/nachtkarteRoute.mjs";

// ── Die Strecke auf der Nachtkarte (Konzept A) ───────────────────────────────
// Sobald Absender und Empfänger je eine PLZ oder einen Ort tragen, zeichnet sich zwischen ihnen ein Bogen auf
// der Karte des Seitengerüsts (#pc-hero-map-canvas). Rein dekorativ (aria-hidden): die Angaben stehen im
// Formular. Ein Ortsname erscheint nur bei genau bekanntem Ort (utils/nachtkarteRoute.mjs). Eine neue Strecke
// zeichnet sich einmal neu (Schlüssel), unveränderte Eingaben lassen sie stehen.
const VIEWBOX = `${KARTE_VB.x} ${KARTE_VB.y} ${KARTE_VB.w} ${KARTE_VB.h}`;
const lage = (p) => ({ left: `${p.left}%`, top: `${p.top}%` });

export function NachtkartenRoute({ host, form }) {
  if (!host) return null;
  const strecke = kartenStrecke(form);
  if (!strecke) return createPortal(null, host);
  const vonLinks = strecke.von.left <= strecke.nach.left;
  return createPortal(
    <div className="pc-route-overlay" key={strecke.schluessel} aria-hidden="true">
      <svg className="pc-route-svg" viewBox={VIEWBOX} focusable="false">
        <path className="pc-route-halo" d={strecke.pfad} pathLength="1" />
        <path className="pc-route-line" d={strecke.pfad} pathLength="1" />
      </svg>
      <span className="pc-route-dot pc-route-dot--start" style={lage(strecke.von)} />
      <span className="pc-route-dot pc-route-dot--ziel" style={lage(strecke.nach)} />
      {strecke.von.name && (
        <span className={`pc-route-name${vonLinks ? " pc-route-name--links" : ""}`} style={lage(strecke.von)}>{strecke.von.name}</span>
      )}
      {strecke.nach.name && (
        <span className={`pc-route-name${vonLinks ? "" : " pc-route-name--links"}`} style={lage(strecke.nach)}>{strecke.nach.name}</span>
      )}
    </div>,
    host,
  );
}
