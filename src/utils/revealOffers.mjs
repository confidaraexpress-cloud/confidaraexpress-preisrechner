/* Sichtbare Reaktion, wenn „Angebote vergleichen" NICHT neu rechnet.
 *
 * Preisrechner und „Neue Sendung" verhindern bewusst einen zweiten
 * /calculate-price, solange sich keine preisbestimmende Eingabe geändert hat
 * (`lastCalcKeyRef === calcKeyRef`). Das ist richtig — es spart einen
 * Providerumlauf UND ein zweites Shipment beim Anbieter.
 *
 * Falsch war nur, dass dieser Zweig mit einem nackten `return` endete: gemessen
 * blieb danach ALLES unverändert — keine Anfrage, kein Ladeindikator, kein
 * Scroll, kein DOM-Update, keine Meldung. Der Knopf wirkte tot, obwohl das
 * Ergebnis bereits vollständig auf der Seite stand.
 *
 * Die ehrliche Reaktion ist deshalb keine erfundene Aktivität, sondern das
 * Sichtbarmachen dessen, was gilt: der Angebotsbereich rückt ins Bild. Es wird
 * nichts neu geladen, nichts sortiert, nichts zurückgesetzt.
 */

/* `behavior: "auto"` wäre hier falsch: `html { scroll-behavior: smooth }`
 * (globals.css) ist unbedingt gesetzt, und „auto" heißt laut Spezifikation
 * „nimm den CSS-Wert" — also weiterhin smooth. Nur `"instant"` erzwingt den
 * sprunghaften Wechsel, den `prefers-reduced-motion: reduce` verlangt.
 * Im Browser gemessen. */
export function offersScrollBehavior(mediaMatcher) {
  const treffer = typeof mediaMatcher === "function"
    ? mediaMatcher("(prefers-reduced-motion: reduce)")
    : null;
  return treffer && treffer.matches ? "instant" : "smooth";
}

const standardMatcher = () =>
  (typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? (q) => window.matchMedia(q)
    : null);

/* Liefert true, wenn tatsächlich gescrollt wurde — sonst false (kein Anker im
 * DOM). Der Aufrufer darf daraus nie einen Ladezustand ableiten. */
export function revealOffers(element, mediaMatcher = standardMatcher()) {
  if (!element || typeof element.scrollIntoView !== "function") return false;
  element.scrollIntoView({
    behavior: offersScrollBehavior(mediaMatcher),
    block: "start",
  });
  return true;
}
