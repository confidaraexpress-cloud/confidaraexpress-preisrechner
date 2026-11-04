// Der Demo-Hinweis des öffentlichen Preisrechners (P2, Betreiberentscheidung 2026-11-04) erscheint beim ersten
// Aufruf je Tab als modaler Dialog. Suiten, die den Rechner selbst prüfen, öffnen die Seite wie ein Besucher, der den
// Hinweis in diesem Tab schon beantwortet hat: der Merker steht vor jedem Skript der Seite im sessionStorage. Den
// Hinweis selbst prüft tests/e2e/publicCalculatorDemoHinweis.test.mjs.
import { DEMO_HINWEIS_SCHLUESSEL } from "../../../src/public-calculator/demoHinweis.mjs";

export { DEMO_HINWEIS_SCHLUESSEL };

/** `ziel`: eine Seite oder ein Browserkontext (Playwright), vor dem ersten Aufruf. */
export async function ohneDemoHinweis(ziel) {
  await ziel.addInitScript((schluessel) => {
    try { sessionStorage.setItem(schluessel, "1"); } catch { /* ohne Speicher erschiene der Hinweis — die Suite merkt es */ }
  }, DEMO_HINWEIS_SCHLUESSEL);
}
