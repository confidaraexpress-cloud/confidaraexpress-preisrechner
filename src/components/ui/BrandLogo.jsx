import React from "react";
import markStandard from "../../assets/brand/mark-primary.svg";
import markReverse from "../../assets/brand/mark-reverse.svg";

/* Zentrale Markendarstellung des Produkts — die EINZIGE Stelle, an der die
   ConfidaraExpress-Marke im Web zusammengesetzt wird. Vorher stand die Marke an
   sechs Orten in jeweils eigenem Markup, davon drei als nachgebaute „CE"-Kachel
   (öffentliche Navigation zweimal, Favicon einmal).

   Zwei Achsen, mehr braucht das Produkt nicht:

     variant  "wordmark" (Bildmarke + ausgeschriebene Wortmarke) | "signet"
     tone     "standard" (helle Flächen) | "reverse" (dunkle Flächen)

   Die Wortmarke ist bewusst ECHTER TEXT und kein Pfad-SVG: sie bleibt damit
   vorlesbar, skaliert mit der Systemschrift und braucht keine eingebetteten
   Buchstabenkonturen. Die Zweifarbigkeit („Confidara" Navy, „Express" Blau)
   trägt das <b> — dieselbe Struktur wie bisher in der Kunden-Sidebar.

   KEIN Claim. „IHRE VERSANDVERMITTLUNG" wird in diesem Paket bewusst nicht
   produktiv integriert (Abstimmung mit den AGB steht aus).

   Barrierefreiheit: steht die Wortmarke sichtbar daneben, ist die Bildmarke
   dekorativ (alt="") — sonst läse ein Screenreader den Markennamen doppelt.
   Steht sie allein, trägt sie den Markennamen als alt-Text. Aufrufer, die ein
   rein dekoratives Signet einsetzen, überschreiben das mit alt="". */

const ASSET = { standard: markStandard, reverse: markReverse };

export function BrandLogo({
  variant = "wordmark",
  tone = "standard",
  chip = false,
  sub = null,
  alt,
  className = "",
}) {
  const isWordmark = variant === "wordmark";
  // Wortmarke sichtbar → Bild dekorativ. Signet allein → Bild trägt den Namen.
  const altText = alt !== undefined ? alt : (isWordmark ? "" : "ConfidaraExpress");
  const decorative = altText === "";

  const image = (
    <img
      className="ce-brandmark-img"
      src={ASSET[tone] || ASSET.standard}
      alt={altText}
      {...(decorative ? { "aria-hidden": "true" } : {})}
      draggable="false"
    />
  );

  return (
    <span className={`ce-brand ce-brand--${tone}${className ? ` ${className}` : ""}`}>
      {chip ? <span className="ce-brandmark">{image}</span> : image}
      {isWordmark && (
        <span className="ce-brand-text">
          <span className="ce-brand-word">Confidara<b>Express</b></span>
          {sub}
        </span>
      )}
    </span>
  );
}
