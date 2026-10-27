import React from "react";
import { nachtkartenLichter } from "../../utils/nachtkarteLichter.mjs";

/* Die Lichter der Nachtkarte (Premium-Redesign, Konzept A, Betreiberentscheidung 2026-10-27): ausgewählte
   Städte leuchten abwechselnd leicht auf — auf der Anmeldung und im öffentlichen Preisrechner. Rein
   dekorativ (aria-hidden). Die Bewegung ist reine CSS-Animation auf Deckkraft und Größe
   (styles/nachtkarte.css); bei reduzierter Bewegung bleiben die Lichter aus, das Kartenbild trägt allein. */
const LICHTER = nachtkartenLichter();

/* welle  — zuerst eine Lichtwelle von Stuttgart aus (jedes Licht glimmt einmal auf, wenn die Welle es erreicht),
             danach das freie Funkeln (Anmeldung, 2026-10-28).
   aktiv  — false hält alle Lichter an, bis das Kartenbild dekodiert ist (AuthKarte); ohne Angabe laufen sie sofort. */
export function NachtkartenLichter({ className = "", welle = false, aktiv = true }) {
  const klassen = ["nk-lichter", welle ? "nk-lichter--welle" : "", aktiv ? "" : "nk-lichter--wartet", className].filter(Boolean).join(" ");
  return (
    <div className={klassen} aria-hidden="true">
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
            "--nk-welle-ms": `${l.welle}ms`,
          }}
        />
      ))}
    </div>
  );
}

export default NachtkartenLichter;
