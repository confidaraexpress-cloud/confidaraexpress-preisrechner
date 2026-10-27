import React from "react";
import { valueSegments } from "../../utils/keepValuesTogether.mjs";

// Ein Text, dessen Werte (Uhrzeit, Maße, Datum, Vorgangsnummer …) nicht mitten im Wert umbrechen
// (Premium-Redesign B9, utils/keepValuesTogether.mjs). Der Text bleibt Zeichen für Zeichen gleich;
// nur die Werte stehen in einem .ce-wert-Element. Alles andere als ein Text wird unverändert gezeigt.
//
// Mit Werten liefert die Komponente GENAU EIN umschließendes Element: viele Träger sind Flex-Container
// (Knöpfe, Hinweisfelder), in denen jeder Textteil sonst zu einem eigenen Flex-Element mit Abstand würde.
export function Werte({ children }) {
  if (typeof children !== "string") return children ?? null;
  const teile = valueSegments(children);
  if (!teile.some((s) => s.wert)) return children;
  return (
    <span>
      {teile.map((s, i) => (s.wert
        ? <span key={i} className="ce-wert">{s.text}</span>
        : <React.Fragment key={i}>{s.text}</React.Fragment>))}
    </span>
  );
}
