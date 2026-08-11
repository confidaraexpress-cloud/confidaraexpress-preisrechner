import React from "react";
import signetStandard from "../../assets/brand/signet-standard.svg";
import signetReverse from "../../assets/brand/signet-reverse.svg";
import wordmarkStandard from "../../assets/brand/wordmark-standard.svg";
import wordmarkReverse from "../../assets/brand/wordmark-reverse.svg";

/* Zentrale Markendarstellung des Produkts — die EINZIGE Stelle, an der die
   ConfidaraExpress-Marke im Web ausgewählt wird.

   Alle vier Assets sind aus `assets/brand/confidara-master.svg` abgeleitet:
   die Subpaths sind daraus wörtlich übernommen, angepasst wurden ausschließlich
   der Ausschnitt (viewBox) und die Produktfarben. Es wird nichts nachgezeichnet,
   keine Schrift gesetzt und keine Komposition neu erfunden — insbesondere ist
   die Wortmarke KEIN HTML-Text mehr, sondern die originale Vektorgeometrie.

   Zwei Achsen, mehr braucht das Produkt nicht:

     variant  "wordmark" (Originalkomposition: Signet über Wortmarke) | "signet"
     tone     "standard" (helle Flächen) | "reverse" (dunkle Flächen)

   Die Wortmarke trägt die Originalkomposition des Masters — Signet ÜBER der
   Wortmarke, mit dem dortigen Abstand und Größenverhältnis. Sie braucht deshalb
   Höhe und passt nicht in jede Fläche: wo eine Leiste zu flach ist (öffentliche
   Navigation 64px, mobile Topbar 44px), steht das Signet. Die Grenze ist
   gemessen, nicht geschätzt — in einer 64px-Leiste liefe die Wortmarke auf
   9,7px hinaus und damit unter die 11px-Untergrenze der Typografieskala.

   KEIN Claim: „IHRE VERSANDVERMITTLUNG" steht im Master und bleibt dort
   unangetastet, wird aber in keines der produktiven Assets übernommen
   (Abstimmung mit den AGB steht aus).

   Barrierefreiheit: die Marke ist jetzt durchgehend ein Bild ohne begleitenden
   Text und trägt deshalb den Markennamen als alt-Text. Aufrufer, die sie rein
   dekorativ einsetzen (Ladebildschirm, Wasserzeichen), überschreiben mit alt="". */

const ASSET = {
  signet: { standard: signetStandard, reverse: signetReverse },
  wordmark: { standard: wordmarkStandard, reverse: wordmarkReverse },
};

export function BrandLogo({
  variant = "wordmark",
  tone = "standard",
  chip = false,
  sub = null,
  alt,
  className = "",
}) {
  const quelle = (ASSET[variant] || ASSET.wordmark)[tone] || ASSET[variant].standard;
  const altText = alt !== undefined ? alt : "ConfidaraExpress";
  const decorative = altText === "";

  const image = (
    <img
      className="ce-brandmark-img"
      src={quelle}
      alt={altText}
      {...(decorative ? { "aria-hidden": "true" } : {})}
      draggable="false"
    />
  );

  return (
    <span className={`ce-brand ce-brand--${tone} ce-brand--${variant}${className ? ` ${className}` : ""}`}>
      {chip ? <span className="ce-brandmark">{image}</span> : image}
      {sub}
    </span>
  );
}
