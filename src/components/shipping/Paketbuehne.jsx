import React, { useId, useMemo } from "react";
import { PAKET_BUEHNE, paketBeschriftung, paketSzene } from "../../utils/paketSzene.mjs";
import { Werte } from "../ui/Werte";

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Die Paketbühne (Premium-Redesign, Konzept B, Betreiberentscheidung 2026-10-27): ein Karton aus
   Kraftpapier mit Klebeband und Versandetikett, der die eingegebenen Maße annimmt — im öffentlichen
   Preisrechner, in „Neue Sendung“ und im Versandkostenrechner.

   Rein darstellend und für Hilfstechnik verborgen: die Werte stehen in den Feldern. Die Zeichnung ist
   proportional, nicht maßstabsgetreu, und sagt das. Die Geometrie kommt fertig aus
   utils/paketSzene.mjs; jede Fläche ist ein Einheitsquadrat mit einer CSS-Matrix, der Übergang
   zwischen zwei Maßen ist eine CSS-Transition (styles/paketbuehne.css), bei reduzierter Bewegung
   ohne Übergang. Der Schlüssel jeder Fläche bleibt gleich, solange die Zeile bleibt — nur so kann
   der Browser zwischen zwei Zuständen überblenden.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

const QUADRAT = "M0 0H1V1H0Z";
// Etikett in cm (16 × 11), gezeichnet im eigenen Koordinatensystem des Etiketts.
const STRICHE = Array.from({ length: 15 }, (_, i) => ({ x: Math.round((1.2 + i * 0.62) * 100) / 100, b: i % 3 === 0 ? 0.36 : 0.18 }));
const kurz = (text) => {
  const t = String(text || "").trim();
  return t.length > 16 ? `${t.slice(0, 15)}…` : t;
};

/**
 * @param {object} p
 * @param {Array} p.lines       Paketzeilen (utils/packageLines.mjs, formPackageLines)
 * @param {string} [p.von]      Ort des Absenders (nur für das Etikett)
 * @param {string} [p.nach]     Ort des Empfängers (nur für das Etikett)
 * @param {"app"|"public"} [p.variant]
 * @param {string} [p.className]
 */
export function Paketbuehne({ lines, von = "", nach = "", variant = "app", className = "" }) {
  const szene = useMemo(() => paketSzene(lines), [lines]);
  const text = useMemo(() => paketBeschriftung(lines), [lines]);
  const schattenId = `ce-paket-schatten-${useId().replace(/:/g, "")}`;
  const { breite, hoehe } = PAKET_BUEHNE;
  const vonText = kurz(von);
  const nachText = kurz(nach);
  const zustand = szene.beispiel ? "beispiel" : szene.vollstaendig ? "vollstaendig" : "teilweise";

  return (
    <figure
      className={`ce-paket ce-paket--${variant}${className ? ` ${className}` : ""}`}
      data-paket-zustand={zustand}
      aria-hidden="true"
    >
      <svg className="ce-paket-svg" viewBox={`0 0 ${breite} ${hoehe}`} focusable="false">
        <defs>
          <filter id={schattenId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
        <g className="ce-paket-schatten" filter={`url(#${schattenId})`}>
          {szene.schatten.map((s) => (
            <path key={s.id} d={QUADRAT} className="ce-paket-form" style={{ transform: s.matrix }} />
          ))}
        </g>
        {szene.kartons.map((k) => (
          <g key={k.id} className="ce-paket-karton" data-karton={k.id}>
            <path d={QUADRAT} className="ce-paket-form ce-paket-links" style={{ transform: k.links }} />
            <path d={QUADRAT} className="ce-paket-form ce-paket-rechts" style={{ transform: k.rechts }} />
            <path d={QUADRAT} className="ce-paket-form ce-paket-oben" style={{ transform: k.oben }} />
            <path d={QUADRAT} className="ce-paket-form ce-paket-band" style={{ transform: k.bandOben }} />
            <path d={QUADRAT} className="ce-paket-form ce-paket-band ce-paket-band--seite" style={{ transform: k.bandSeite }} />
            {k.etikett && (
              <g className="ce-paket-form ce-paket-etikett" style={{ transform: k.etikett }}>
                <rect className="ce-paket-etikett-grund" x="0" y="0" width="16" height="11" rx="0.5" />
                <rect className="ce-paket-etikett-kopf" x="0" y="0" width="16" height="2.1" rx="0.5" />
                {/* Schriftgrößen in cm des Etiketts (Zeichnung, keine Seitentypografie). */}
                <text className="ce-paket-etikett-klein" x="1.2" y="4.6" fontSize="1.1">VON</text>
                {vonText
                  ? <text className="ce-paket-etikett-ort" x="4.4" y="4.7" fontSize="1.5">{vonText}</text>
                  : <rect className="ce-paket-etikett-leer" x="4.4" y="3.5" width="6.4" height="1.1" rx="0.4" />}
                <text className="ce-paket-etikett-klein" x="1.2" y="7.1" fontSize="1.1">NACH</text>
                {nachText
                  ? <text className="ce-paket-etikett-ort" x="4.4" y="7.2" fontSize="1.5">{nachText}</text>
                  : <rect className="ce-paket-etikett-leer" x="4.4" y="6" width="8.2" height="1.1" rx="0.4" />}
                <g className="ce-paket-etikett-code">
                  {STRICHE.map((s) => <rect key={s.x} x={s.x} y="8.3" width={s.b} height="1.9" />)}
                </g>
              </g>
            )}
          </g>
        ))}
        {szene.masse.map((m) => (
          <text key={m.id} className="ce-paket-mass" data-mass={m.id} textAnchor={m.anker} fontSize="19" style={{ transform: m.matrix }}>
            {m.text}
          </text>
        ))}
      </svg>
      <figcaption className="ce-paket-text">
        <span className="ce-paket-titel"><Werte>{text.titel}</Werte></span>
        <span className="ce-paket-hinweis">
          {szene.beispiel ? "Beispielpaket" : "Darstellung im Verhältnis Ihrer Maße, nicht maßstabsgetreu"}
          {text.details ? ` · ${text.details}` : ""}
        </span>
      </figcaption>
    </figure>
  );
}

export default Paketbuehne;
