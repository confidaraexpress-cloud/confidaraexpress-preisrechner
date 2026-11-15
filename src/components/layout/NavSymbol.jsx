import React from "react";
import { Icon, ICON_SIZE, iconTeile } from "../ui/Icon";

/* Navigationssymbol der Seitenleiste (Premium Control System 2.0, Betreiberauftrag 2026-11-14).
 *
 * Jedes Symbol der ersten Ebene hat beim Zeigen und beim Tastaturfokus eine eigene kurze Bewegung, die seine Sache
 * zeigt: Kacheln rücken auseinander (Übersicht), das Plus dreht sich (Neue Sendung), der Lieferwagen fährt an
 * (Sendungen), die Wegpunkte leuchten nacheinander auf (Versand), die Karte klappt auf (Adressbuch), das Blatt hebt
 * sich und seine Zeilen leuchten auf (Rechnungen), das Paket kippt räumlich (Lager & Aufträge), hinter der Person
 * pulsiert ein blaues Licht (Konto). Die Bewegungen stehen in premium-editorial.css (Abschnitt 29) — nur Transform
 * und Deckkraft, rund 300 ms, nur mit echtem Zeiger bzw. Tastaturfokus und nie bei reduzierter Bewegung.
 *
 * GEOMETRIE: dieselbe wie <Icon> — die Teilpfade kommen aus iconTeile(), dieselbe Quelle. In Ruhe liegen alle Teile
 * deckungsgleich auf dem bisherigen Symbol. Der Lieferwagen hat eigenes Markup in <Icon> und bewegt sich als Ganzes.
 * Rein dekorativ: aria-hidden, den Namen trägt der Text daneben. */
export function NavSymbol({ n, s = ICON_SIZE.md }) {
  const teile = n === "truck" ? [] : iconTeile(n);
  if (teile.length === 0) {
    return <span className={`nav-sym nav-sym--${n}`}><Icon n={n} s={s} /></span>;
  }
  return (
    <svg
      className={`nav-sym nav-sym--${n}`}
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {n === "user" && <circle className="nav-sym-licht" cx="12" cy="7" r="4" />}
      {teile.map((d, i) => <path key={i} className={`nav-sym-teil nav-sym-teil--${i + 1}`} d={d} />)}
    </svg>
  );
}
