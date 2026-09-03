// src/utils/offerDebugView.mjs — DIE ANZEIGE DES TEMPORAEREN VERGLEICHSMODUS.
//
// Reine Funktionen: kein Zustand, kein Netz, kein Speicher, kein Zeitbezug. Sie lesen
// ausschliesslich den Block, den der Server einem Angebot beilegt.
//
// ─── DAS FRONTEND ENTSCHEIDET HIER NICHTS ────────────────────────────────────────────
// Weder ob der Modus an ist, noch welches Angebot aus welcher Quelle stammt, noch welche
// Angebote dasselbe Produkt sind. Alle drei Aussagen kommen fertig vom Server. Es gibt in
// diesem Modul deshalb KEINEN Providernamensvergleich, KEINEN Preisvergleich, KEINEN
// Laufzeitvergleich und keine Aehnlichkeitsregel — jede davon waere eine zweite Wahrheit
// neben der kuratierten Gleichheitsregistry, und sie waere genau die Quelle der falschen
// Gruenmarkierungen, die dieser Modus vermeiden muss.
//
// ─── FEHLT DER BLOCK, AENDERT SICH NICHTS ────────────────────────────────────────────
// Im Produktionszustand liefert der Server keinen `debug`-Block. Dann gibt `offerDebugView`
// `null` zurueck, die Karte bekommt keine Zusatzklasse und keinen Zusatztext — die
// Oberflaeche ist dieselbe wie vorher. Das ist der Grund, warum dieser Modus im Frontend
// KEINEN eigenen Schalter hat: ein zweiter Schalter koennte gegen den Server stehen.
//
// ─── FARBE IST NIE DIE EINZIGE AUSSAGE ───────────────────────────────────────────────
// Zu jeder Einfaerbung gehoert ein LESBARER Text. Dieselbe Regel, die das Projekt fuer
// Statusbadges festhaelt ("immer mit Punkt UND Text") — eine rein farbige Kodierung waere
// fuer farbfehlsichtige Betrachter und in Screenshots ohne Legende bedeutungslos.

export const DEBUG_TONE_MATCH       = "match";
export const DEBUG_TONE_JUMINGO     = "jumingo";
export const DEBUG_TONE_TRANSGLOBAL = "transglobal";

// Die Anzeigenamen der beiden Einkaufsquellen. Sie stehen NUR hier und werden nur im
// Vergleichsmodus gerendert; im Produktionszustand erreicht dieser Text keine Oberflaeche.
const QUELLENNAME = {
  [DEBUG_TONE_JUMINGO]:     "JUMiNGO",
  [DEBUG_TONE_TRANSGLOBAL]: "Transglobal",
};

const istText = (w) => typeof w === "string" && w.trim() !== "";

/**
 * Liest den Debugblock eines Angebots.
 *
 * @returns {null | { tone, providerLabel, text, matchGroup, isProviderNet }}
 *          `null`, sobald der Block fehlt oder eine unbekannte Quelle nennt — es wird
 *          KEINE Farbe erfunden.
 */
export function offerDebugView(tariff) {
  const d = tariff && typeof tariff === "object" ? tariff.debug : null;
  if (!d || typeof d !== "object") return null;

  const quelle = d.provider === DEBUG_TONE_JUMINGO || d.provider === DEBUG_TONE_TRANSGLOBAL ? d.provider : null;
  if (quelle === null) return null;

  // Eine Gruppe zaehlt nur, wenn der Server BEIDE Aussagen macht: die Markierung UND die
  // Kennung. Eine Markierung ohne Kennung liesse sich keiner zweiten Karte zuordnen — sie
  // waere eine gruene Karte ohne Gegenstueck.
  const matchGroup = d.matchedAcrossProviders === true && istText(d.matchGroup) ? d.matchGroup.trim() : null;

  // GRUEN GEWINNT: die Gleichheit ist die interessantere Aussage als die Herkunft, und
  // beide Karten des Paares sollen dieselbe Farbe tragen — sonst waere ein Paar an zwei
  // verschiedenen Faerbungen zu erkennen und die Gruppe optisch gerade nicht eine.
  const tone = matchGroup !== null ? DEBUG_TONE_MATCH : quelle;

  const providerLabel = QUELLENNAME[quelle];
  const isProviderNet = d.priceBasis === "provider_net";

  // Der sichtbare Text sagt in dieser Reihenfolge: woher · welcher Betrag · welches Paar.
  // "Einkauf" steht dort, weil ein Einkaufsnetto neben einem Kundenpreis sonst als
  // sensationell guenstiges Angebot missverstanden wird.
  const teile = [providerLabel];
  if (isProviderNet)        teile.push("Einkauf");
  if (matchGroup !== null)  teile.push(`gleich ${matchGroup}`);

  return { tone, providerLabel, text: teile.join(" · "), matchGroup, isProviderNet };
}

/**
 * Die Zusatzklasse der Angebotskarte — leer, solange kein Debugblock vorliegt.
 * Bewusst ein ZUSATZ: die bestehenden Zustandsklassen (ausgewaehlt, nicht verfuegbar)
 * bleiben unveraendert stehen und behalten ihre Wirkung.
 */
export function offerDebugCardClass(tariff) {
  const v = offerDebugView(tariff);
  return v === null ? "" : ` offer-card--debug offer-card--debug-${v.tone}`;
}
