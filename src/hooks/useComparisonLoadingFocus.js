import { useLayoutEffect, useRef } from "react";
import { focusFirstError } from "../utils/focusField";
import { revealOffers, focusOffersResult, offersScrollBehavior } from "../utils/revealOffers.mjs";

// Bewegungsregel wie beim Enthüllen: prefers-reduced-motion → sofort.
const nurBewegung = (q) => (typeof window.matchMedia === "function" ? window.matchMedia(q) : null);

/* Fokus nach dem Ende eines Angebotsvergleichs („Neue Sendung", Preisrechner).
 *
 * Solange `loading` gilt, ist der Seiteninhalt `inert` (Ladeoverlay). Der
 * Browser nimmt dem auslösenden Knopf dabei den Fokus, er landet auf <body>.
 * Ein Fokus, der noch WÄHREND des Ladens gesetzt würde — etwa focusFirstError
 * nach einem 422 mit Feld —, liefe ins Leere: das Ziel ist in diesem Moment
 * noch inert.
 *
 * calculate() meldet deshalb nur, WOHIN der Fokus nach dem Laden gehört:
 *   "angebote"  — Erfolg: Bereich sofort ins Bild (siehe revealOffers),
 *                 Fokus auf die Ergebniszeile
 *   "feld"      — Serverfehler mit Feld: das Feld (wie bisher focusFirstError)
 *   "ausloeser" — jeder andere Fehler: zurück auf „Angebote vergleichen",
 *                 Knopf und bestehende Meldung ins Bild
 * Gesetzt wird er im Commit, der `loading` beendet: dann ist das Overlay weg
 * und der Inhalt wieder bedienbar. Hat der Nutzer den Fokus inzwischen selbst
 * woandershin gesetzt (Seitenleiste, Dialog), bleibt er dort — nur ein durch
 * das Sperren verlorener Fokus wird zurückgegeben. Ohne Meldung (401/403,
 * verworfene Antwort) geschieht nichts. */
export function useComparisonLoadingFocus(loading, { offersRef, triggerRef }) {
  const zielRef = useRef(null);

  useLayoutEffect(() => {
    if (loading) return;
    const ziel = zielRef.current;
    zielRef.current = null;
    if (!ziel) return;
    const aktiv = document.activeElement;
    const fokusVerloren = !aktiv || aktiv === document.body;
    if (ziel.art === "angebote") {
      revealOffers(offersRef.current, undefined, { sofort: true });
      if (fokusVerloren) focusOffersResult(offersRef.current);
      return;
    }
    if (!fokusVerloren) return;
    if (ziel.art === "feld" && focusFirstError(ziel.feld)) return;
    const knopf = triggerRef.current;
    if (!knopf) return;
    // Knopf UND die Meldung darunter ins Bild — beide stehen im selben
    // CTA-Bereich; auf schmalen Geräten lag die Meldung sonst unter dem Rand.
    knopf.focus({ preventScroll: true });
    knopf.closest(".offers-calc-cta")?.scrollIntoView({ behavior: offersScrollBehavior(nurBewegung), block: "nearest" });
  }, [loading, offersRef, triggerRef]);

  return (art, feld = null) => { zielRef.current = { art, feld }; };
}
