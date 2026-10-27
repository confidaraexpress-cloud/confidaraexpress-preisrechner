import React from "react";
import { DEMO_TEXTE, DEMO_ZIELE } from "./demoModus.mjs";

/* Die Demo-Leiste: auf jeder Seite der Demo am unteren Rand. Sie sagt, was hier gilt (Beispieldaten, alles
   simuliert), und bietet die zwei Wege hinaus — registrieren oder die Demo beenden. Beide sind echte Links, also
   neue Seitenladungen: die Demo-Welt endet damit vollständig. */
export function DemoLeiste() {
  return (
    <aside className="demo-leiste" aria-label="Hinweis zur Demo" role="note">
      <div className="demo-leiste-innen">
        <p className="demo-leiste-text">
          <span className="demo-leiste-marke">{DEMO_TEXTE.leiste}</span>
          <span className="demo-leiste-zusatz">{DEMO_TEXTE.leisteZusatz}</span>
        </p>
        <div className="demo-leiste-aktionen">
          <a className="demo-leiste-knopf demo-leiste-knopf--primaer" href={DEMO_ZIELE.registrieren}>{DEMO_TEXTE.registrieren}</a>
          <a className="demo-leiste-knopf" href={DEMO_ZIELE.preisrechner}>{DEMO_TEXTE.beenden}</a>
        </div>
      </div>
    </aside>
  );
}

export default DemoLeiste;
