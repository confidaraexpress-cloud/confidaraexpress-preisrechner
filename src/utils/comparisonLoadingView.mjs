/* Ladezustand des Angebotsvergleichs — reine Anzeige-Logik.
 *
 * Kein Request, kein Timer, kein DOM: das Modul beantwortet nur, welcher Text
 * nach welcher Wartezeit gilt. Die Zeit misst das Ladeoverlay selbst
 * (components/offers/OfferComparisonLoadingOverlay.jsx).
 *
 * Warum sich der Text überhaupt ändert: der Vergleich liefert ALLE Angebote in
 * EINER Antwort, und deren Dauer bestimmt fast vollständig die langsamste
 * Tarifquelle — gemessen meist 4–7 s, nach längerem Leerlauf 26–46 s. Ein
 * Text, der nach 40 s noch genauso klingt wie nach 2 s, wirkt wie ein
 * hängender Bildschirm. Die Stufen sagen deshalb ehrlich, dass weiter
 * verglichen wird, und bitten ab 20 s, die Seite offen zu lassen.
 *
 * Bewusst NICHT: Fortschrittsbalken, Prozentzahlen, erfundene Zwischenschritte
 * („3 von 5 Anbietern …"), Anbieternamen oder Technikbegriffe. Der Kunde
 * vergleicht Versandtarife — woher sie kommen, ist nicht sein Thema. Die
 * Schwellen (8/20/45 s) sind aus den gemessenen Laufzeiten abgeleitet und
 * sollen mit echter Produktionstelemetrie nachkalibriert werden. */

const TITEL_VERGLEICH = "Versandangebote werden verglichen";

export const COMPARISON_LOADING_PHASES = Object.freeze([
  Object.freeze({
    id: "start",
    fromMs: 0,
    title: TITEL_VERGLEICH,
    text: "Wir gleichen die verfügbaren Versandtarife für Ihre Sendung ab.",
  }),
  Object.freeze({
    id: "weiter",
    fromMs: 8000,
    title: TITEL_VERGLEICH,
    text: "Wir prüfen weiterhin die Versandtarife für Ihre Sendung. Das kann einen Moment dauern.",
  }),
  Object.freeze({
    id: "laenger",
    fromMs: 20000,
    title: TITEL_VERGLEICH,
    text: "Der vollständige Vergleich läuft weiter. Einzelne Tarifanfragen benötigen gerade mehr Zeit. Bitte lassen Sie diese Seite geöffnet.",
  }),
  Object.freeze({
    id: "lang",
    fromMs: 45000,
    title: "Der Vergleich dauert etwas länger",
    text: "Wir warten weiterhin auf den vollständigen Vergleich. Bitte lassen Sie diese Seite geöffnet.",
  }),
]);

// Negative, fehlende oder nicht endliche Werte zählen als „gerade begonnen".
function wartezeit(elapsedMs) {
  return Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
}

/* Die Stufe, die nach `elapsedMs` Millisekunden Wartezeit gilt. */
export function comparisonLoadingView(elapsedMs) {
  const ms = wartezeit(elapsedMs);
  let stufe = COMPARISON_LOADING_PHASES[0];
  for (const p of COMPARISON_LOADING_PHASES) {
    if (ms >= p.fromMs) stufe = p;
  }
  return stufe;
}

/* Millisekunden bis zur nächsten Stufe — oder null, wenn die letzte erreicht
 * ist. Damit braucht das Overlay nie mehr als EINEN laufenden Timer und
 * rendert nur dann neu, wenn sich der Text tatsächlich ändert. */
export function msUntilNextComparisonPhase(elapsedMs) {
  const ms = wartezeit(elapsedMs);
  const naechste = COMPARISON_LOADING_PHASES.find((p) => p.fromMs > ms);
  return naechste ? naechste.fromMs - ms : null;
}
