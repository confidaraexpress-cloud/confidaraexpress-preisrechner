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
 * DOM). Der Aufrufer darf daraus nie einen Ladezustand ableiten.
 *
 * `sofort`: nach einem Vergleich hinter dem Ladeoverlay springt der Bereich
 * ohne Fahrt ins Bild. Das Overlay hat die Seite ohnehin verdeckt — eine
 * zusätzliche Bewegung vom Formular zu den Angeboten trüge nichts bei. Und
 * content-visibility (offers.css) rendert so die sichtbaren Karten schon im
 * ersten Frame; bei einer weichen Fahrt lägen sie beim Einfügen noch
 * außerhalb des Bildes und blieben einige Frames ohne Inhalt (gemessen). */
export function revealOffers(element, mediaMatcher = standardMatcher(), { sofort = false } = {}) {
  if (!element || typeof element.scrollIntoView !== "function") return false;
  element.scrollIntoView({
    behavior: sofort ? "instant" : offersScrollBehavior(mediaMatcher),
    block: "start",
  });
  return true;
}

/* Nach einem ERFOLGREICHEN Vergleich rückt der Bereich über revealOffers() ins
 * Bild; zusätzlich landet der Fokus auf der Ergebniszeile („33 Angebote",
 * tabIndex=-1 in OffersList) — nicht auf einer einzelnen Karte. Ein
 * Screenreader hört damit, wie viele Angebote da sind, und die Tabulatortaste
 * geht von dort in Filter und Karten weiter.
 *
 * `preventScroll`, damit der Fokus die (ggf. weiche) Bewegung nicht mit einem
 * eigenen Sprung überschreibt. Liefert true, wenn der Fokus gesetzt wurde. */
export const OFFERS_RESULT_SELECTOR = "[data-offers-result]";

export function focusOffersResult(element) {
  const ziel = element && typeof element.querySelector === "function"
    ? element.querySelector(OFFERS_RESULT_SELECTOR)
    : null;
  if (!ziel || typeof ziel.focus !== "function") return false;
  try { ziel.focus({ preventScroll: true }); } catch { ziel.focus(); }
  return true;
}
