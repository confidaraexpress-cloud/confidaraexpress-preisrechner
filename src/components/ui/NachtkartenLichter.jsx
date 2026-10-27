import React from "react";
import { nachtkartenLichter } from "../../utils/nachtkarteLichter.mjs";

/* Die Lichter der Nachtkarte (Premium-Redesign, Konzept A, Betreiberentscheidung 2026-10-27): ausgewählte
   Städte leuchten abwechselnd leicht auf — auf der Anmeldung und im öffentlichen Preisrechner. Rein
   dekorativ (aria-hidden). Die Bewegung ist reine CSS-Animation auf Deckkraft und Größe
   (styles/nachtkarte.css); bei reduzierter Bewegung bleiben die Lichter aus, das Kartenbild trägt allein. */
const LICHTER = nachtkartenLichter();

export function NachtkartenLichter({ className = "" }) {
  return (
    <div className={`nk-lichter${className ? ` ${className}` : ""}`} aria-hidden="true">
      {LICHTER.map((l) => (
        <span
          key={l.key}
          className={`nk-licht${l.ton ? " nk-licht--hell" : ""}`}
          style={{
            left: `${l.left}%`,
            top: `${l.top}%`,
            "--nk-groesse": `${l.groesse}px`,
            "--nk-dauer": `${l.dauer}ms`,
            "--nk-einsatz": `${l.einsatz}ms`,
          }}
        />
      ))}
    </div>
  );
}

export default NachtkartenLichter;
