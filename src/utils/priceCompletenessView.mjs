// src/utils/priceCompletenessView.mjs — IST DIESER PREIS VORLÄUFIG?
//
// Reine Funktionen: kein Zustand, kein Netz, kein Speicher, kein Zeitbezug. Sie lesen
// ausschließlich ein Feld, das der Server dem Angebot beilegt.
//
// ─── DAS FRONTEND ENTSCHEIDET HIER NICHTS ────────────────────────────────────────────
// Weder welcher Anbieter hinter einem Angebot steht, noch aus welchem Quote-Endpunkt sein
// Preis stammt, noch ob eine Angabe fehlte. Diese Datei kennt keinen Providernamen, keinen
// Quote-Modus und keine Providerreferenz — sie kann sie gar nicht kennen, weil das
// öffentliche Angebot sie bewusst nicht trägt.
//
// Sie liest genau eine providerneutrale Aussage: `priceCompleteness`.
//
//   "complete"    Der Preis wurde mit den für diesen Angebotsweg vollständigen
//                 preisrelevanten Sendungsangaben berechnet.
//   "indicative"  Er beruht noch nicht auf allen preisrelevanten Angaben.
//
// ─── WARUM NICHT AUS DEN VORHANDENEN FELDERN ABGELEITET ──────────────────────────────
// Der Audit hat es gemessen: `requiredPriceInputs`, `bookable` und `unavailableReason`
// tragen bei einem vorläufigen und einem vollständig berechneten Preis DESSELBEN Angebots
// identische Werte. Sie beschreiben, welche Angaben für den Service preisrelevant sind
// und ob man buchen kann — nicht, ob der Betrag vollständig gerechnet wurde. Wer eines
// davon als Signal benutzt, markiert vollständig berechnete Angebote mit.
//
// ─── STRIKT, NIE TRUTHY ──────────────────────────────────────────────────────────────
// Nur die exakte Zeichenkette zählt. `"INDICATIVE"`, `"Indicative"`, `true`, `1`,
// `"true"`, `"maybe"`, `null` und ein fehlendes Feld ergeben alle `false`.
//
// Das ist zugleich der Rückwärtsvertrag: ein Angebot von einem Server OHNE dieses Feld
// bekommt KEINEN Hinweis und verhält sich exakt wie vorher. Ausdrücklich nicht umgekehrt —
// „fehlt = vorläufig" würde jedes bestehende Angebot falsch markieren.

const INDICATIVE = "indicative";

/**
 * Ist der Preis dieses Angebots ausdrücklich als vorläufig ausgewiesen?
 *
 * @param {object} offer  ein öffentliches Angebot, wie der Server es liefert
 * @returns {boolean}
 */
export function isIndicativePrice(offer) {
  const o = offer && typeof offer === "object" ? offer : {};
  return o.priceCompleteness === INDICATIVE;
}

// ─── DIE TEXTE ───────────────────────────────────────────────────────────────────────
// Sie stehen hier und nicht in der Karte, damit ein Test sie prüfen kann, ohne die
// Oberfläche zu rendern — dieselbe Trennung wie bei den übrigen `*View`-Modulen.
//
// ─── KEIN „AB" ───────────────────────────────────────────────────────────────────────
// „ab 10,62 €" wäre eine Zusage nach unten: der endgültige Betrag könne diesen nie
// unterschreiten. Belegt ist nur, dass er HÖHER ausfallen kann (gemessen 10,62 → 13,27).
// Dass er niemals niedriger ausfällt, ist NICHT belegt — die Preisrevalidierung vergleicht
// ausdrücklich richtungsoffen, und der Anbieter rechnet bei der Bestellung neu. „Vorläufig"
// sagt genau so viel, wie belegt ist, und keinen Halbsatz mehr.
//
// ─── KEIN ANBIETERBEZUG ──────────────────────────────────────────────────────────────
// Kein Providername, kein „wird beim Anbieter bestätigt", kein Quote-Begriff. Der Kunde
// erfährt etwas über SEINEN Preis, nicht über unseren Einkaufsweg.
export const INDICATIVE_PRICE_LABEL = "Vorläufiger Preis";

/** Die Erklärung für den Detailbereich — ein Satz, ohne Richtungsaussage. */
export const INDICATIVE_PRICE_EXPLANATION =
  "Der endgültige Preis wird nach vollständigen Sendungsangaben berechnet.";
