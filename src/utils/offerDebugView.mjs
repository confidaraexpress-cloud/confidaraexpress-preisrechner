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
// ─── DIE KARTE BLEIBT SICHTBAR UNVERAENDERT ──────────────────────────────────────────
// Die Faerbung ist die EINZIGE sichtbare Aussage des Modus. Es entsteht kein Badge, kein
// Etikett, keine zusaetzliche Zeile und keine Zusatzhoehe — die Karte sieht in beiden
// Stellungen gleich aus, nur ihre Flaeche ist leicht getoent. Ein sichtbares technisches
// Etikett auf einer Angebotskarte ist Entwicklerinformation an einer Stelle, an der sonst
// ausschliesslich Kundeninformation steht.
//
// ─── FARBE IST TROTZDEM NICHT DIE EINZIGE MASCHINENLESBARE AUSSAGE ───────────────────
// Was der sehende Betrachter an der Faerbung ablesen kann, steht fuer Screenreader als
// unsichtbarer Text daneben (`.sr-only`, die vorhandene Projektkonvention) — additiv im
// Kartentext, ausdruecklich NICHT als `aria-label` an der Karte selbst: das wuerde den
// gesamten zugaenglichen Namen der Karte ERSETZEN und Carrier, Laufzeit und Preis
// verschlucken.
//
// ─── DIE GRUPPENKENNUNG WIRD NIRGENDS GERENDERT ──────────────────────────────────────
// `matchGroup` dient allein der internen Zuordnung und der Farbwahl. Sie erscheint in
// keinem sichtbaren Text, in keinem `title`, in keinem `data-`-Attribut und auch nicht in
// der Screenreader-Beschreibung — dort steht nur die TATSACHE, dass ein Gegenstueck
// existiert.

export const DEBUG_TONE_MATCH       = "match";
export const DEBUG_TONE_JUMINGO     = "jumingo";
export const DEBUG_TONE_TRANSGLOBAL = "transglobal";

// Die Namen der beiden Einkaufsquellen. Sie stehen NUR hier, erscheinen ausschliesslich in
// der unsichtbaren Screenreader-Beschreibung des Vergleichsmodus und erreichen im
// Produktionszustand ueberhaupt keine Oberflaeche.
const QUELLENNAME = {
  [DEBUG_TONE_JUMINGO]:     "JUMiNGO",
  [DEBUG_TONE_TRANSGLOBAL]: "Transglobal",
};

const istText = (w) => typeof w === "string" && w.trim() !== "";

/**
 * Liest den Debugblock eines Angebots.
 *
 * @returns {null | { tone, srText, matchGroup }}
 *          `null`, sobald der Block fehlt oder eine unbekannte Quelle nennt — es wird
 *          KEINE Farbe erfunden. `srText` ist ausschliesslich fuer Screenreader bestimmt
 *          und wird nie sichtbar gerendert; `matchGroup` verlaesst dieses Modul nur als
 *          interner Wert und erreicht das DOM in keiner Form.
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

  // Die Beschreibung fuer Screenreader — sie benennt GENAU das, was die Farbe kodiert:
  // die Einkaufsquelle und, sofern belegt, die Tatsache eines Gegenstuecks. Nicht mehr.
  // Die Preisgrundlage steht bewusst NICHT darin: sie ist keine Aussage der Faerbung, und
  // ein Wort wie "Einkauf" in einer Angebotskarte ist ohne den umgebenden Vergleich
  // irrefuehrend statt hilfreich.
  const srText = matchGroup !== null
    ? `Providerquelle: ${QUELLENNAME[quelle]}, identisches Angebot bei anderem Provider vorhanden`
    : `Providerquelle: ${QUELLENNAME[quelle]}`;

  return { tone, srText, matchGroup };
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
