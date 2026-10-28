import React from "react";
import { valueSegments } from "../../utils/keepValuesTogether.mjs";

// Ein Text, dessen Werte (Uhrzeit, Maße, Datum, Vorgangsnummer …) nicht mitten im Wert umbrechen
// (Premium-Redesign B9, utils/keepValuesTogether.mjs). Der Text bleibt Zeichen für Zeichen gleich;
// nur die Werte stehen in einem .ce-wert-Element. Alles andere als ein Text wird unverändert gezeigt.
//
// Mit Werten liefert die Komponente GENAU EIN umschließendes Element: viele Träger sind Flex-Container
// (Knöpfe, Hinweisfelder), in denen jeder Textteil sonst zu einem eigenen Flex-Element mit Abstand würde.
//
// Lange Kennungen (ab 12 Zeichen) mit Ziffer und Bindestrich (ML-ELEKTRONIK-2026-000101) tragen nach jedem Bindestrich eine unsichtbare
// Bruchstelle (<wbr>). Im Normalfall wirkt sie nicht — .ce-wert hält den Wert zusammen; nur wenn das Fenster im
// Verhältnis zur Schrift extrem schmal ist (unter 20em, große Browserschrift auf dem Telefon), bricht die Kennung dort
// statt über den Rand zu laufen (.ce-wert--kennung). Ein Datum (2026-10-28) bleibt ganz. Der Text bleibt Zeichen für
// Zeichen gleich.
const istKennung = (text) => text.length >= 12 && text.includes("-") && /\d/.test(text);
function mitFugen(text) {
  const stuecke = text.split("-");
  return stuecke.map((stueck, i) => (i < stuecke.length - 1
    ? <React.Fragment key={i}>{stueck}-<wbr /></React.Fragment>
    : <React.Fragment key={i}>{stueck}</React.Fragment>));
}
export function Werte({ children }) {
  if (typeof children !== "string") return children ?? null;
  const teile = valueSegments(children);
  if (!teile.some((s) => s.wert)) return children;
  return (
    <span>
      {teile.map((s, i) => (s.wert
        ? (istKennung(s.text)
          ? <span key={i} className="ce-wert ce-wert--kennung">{mitFugen(s.text)}</span>
          : <span key={i} className="ce-wert">{s.text}</span>)
        : <React.Fragment key={i}>{s.text}</React.Fragment>))}
    </span>
  );
}
