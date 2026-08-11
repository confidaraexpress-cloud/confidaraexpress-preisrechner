import React from "react";
import signetStandard from "../../assets/brand/signet-standard.svg";
import signetReverse from "../../assets/brand/signet-reverse.svg";
import wordmarkStandard from "../../assets/brand/wordmark-standard.svg";
import wordmarkReverse from "../../assets/brand/wordmark-reverse.svg";
import lockupStandard from "../../assets/brand/lockup-standard.svg";
import lockupReverse from "../../assets/brand/lockup-reverse.svg";

/* Zentrale Markendarstellung des Produkts — die EINZIGE Stelle, an der die
   ConfidaraExpress-Marke im Web ausgewählt wird.

   Alle sechs Assets sind aus `assets/brand/confidara-master.svg` abgeleitet:
   die Subpaths sind daraus wörtlich übernommen, angepasst wurden ausschließlich
   der Ausschnitt (viewBox) und die Produktfarben. Es wird nichts nachgezeichnet,
   keine Schrift gesetzt und keine Komposition neu erfunden.

   Zwei Achsen, mehr braucht das Produkt nicht:

     variant  "signet" (nur C/E) | "wordmark" (nur Schriftzug) | "lockup"
              (Originalkomposition: Signet über Schriftzug, wie im Master)
     tone     "standard" (helle Flächen) | "reverse" (dunkle Flächen)

   "wordmark" ist die reine Textgeometrie (Band y 725–860 des Masters, 8,71:1)
   — für schmale horizontale Leisten, in denen die gestapelte Komposition zu
   hoch wäre. "lockup" trägt die volle Originalkomposition (1,92:1) und
   braucht deshalb Höhe statt Breite.

   KEIN Claim: „IHRE VERSANDVERMITTLUNG" steht im Master und bleibt dort
   unangetastet, wird aber in keines der produktiven Assets übernommen
   (Abstimmung mit den AGB steht aus).

   Barrierefreiheit: die Marke ist ein Bild ohne begleitenden Text und trägt
   deshalb den Markennamen als alt-Text. Aufrufer, die sie rein dekorativ
   einsetzen (Ladebildschirm, Wasserzeichen), überschreiben mit alt="". */

const ASSET = {
  signet: { standard: signetStandard, reverse: signetReverse },
  wordmark: { standard: wordmarkStandard, reverse: wordmarkReverse },
  lockup: { standard: lockupStandard, reverse: lockupReverse },
};

export function BrandLogo({
  variant = "lockup",
  tone = "standard",
  chip = false,
  sub = null,
  alt,
  className = "",
}) {
  const quelle = (ASSET[variant] || ASSET.lockup)[tone] || ASSET[variant].standard;
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
