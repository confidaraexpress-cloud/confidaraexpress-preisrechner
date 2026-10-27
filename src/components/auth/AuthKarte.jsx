import React, { useEffect, useRef, useState } from "react";
import nachtkarte from "../../assets/illustrations/nachtkarte-eu.svg";
import { NachtkartenLichter } from "../ui/NachtkartenLichter";
import { AUTH_TEXT } from "../../utils/authSeitenText.mjs";

/* Die gerahmte Nachtkarte der Anmeldung (Betreiberentscheidung, Abschnitt 5, 2026-10-28) — dieselbe Karte wie im
   öffentlichen Preisrechner, unter dem Satz statt als maskierter Hintergrund („Sternenstaub“, Audit B.1).

   Das Kartenbild steht ab dem ersten Bild (statisches Seitengerüst, gleiche Maße). Die Lichter starten erst, wenn
   das Bild dekodiert ist: zuerst eine Lichtwelle von Stuttgart aus, danach leuchten die Städte einzeln und
   abwechselnd auf (NachtkartenLichter, styles/nachtkarte.css). Bei reduzierter Bewegung bleibt das Bild allein.
   Rein dekorativ (aria-hidden); die Legende ist Text. */
export function AuthKarte() {
  const bildRef = useRef(null);
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    const bild = bildRef.current;
    if (!bild) return undefined;
    let aus = false;
    const los = () => { if (!aus) setBereit(true); };
    // decode() wartet auf Laden UND Dekodieren; ältere Browser ohne decode() starten nach dem Laden.
    if (typeof bild.decode === "function") bild.decode().then(los, los);
    else if (bild.complete) los();
    else bild.addEventListener("load", los, { once: true });
    return () => { aus = true; };
  }, []);

  return (
    <figure className="auth-map">
      <div className="auth-map-frame">
        <div className="auth-map-canvas">
          <img ref={bildRef} className="auth-map-img" src={nachtkarte} alt="" width="536" height="497" decoding="async" />
          <NachtkartenLichter welle aktiv={bereit} />
        </div>
      </div>
      <figcaption className="auth-map-legend"><span className="auth-map-dot" aria-hidden="true" />{AUTH_TEXT.kartenLegende}</figcaption>
    </figure>
  );
}

export default AuthKarte;
