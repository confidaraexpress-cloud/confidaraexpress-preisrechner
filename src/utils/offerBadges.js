// Objektive Auszeichnungen für Angebotskarten.
// Bewusst nur faktische Labels: "Günstigste" und "Schnellste".
// Kein "Top Empfehlung"/Ribbon und kein "Teuerste" mehr — diese werteten
// Angebote subjektiv bzw. negativ und erzeugten visuelle Unruhe.
//
// Betreiberentscheidung E3 (Masteranalyse Angebotskarten 2026-11-20): beide Auszeichnungen folgen der EINEN Ordnung aus
// utils/offerSort.mjs — „Schnellste" nach der frühesten voraussichtlichen Zustellung, nur unter datierten Angeboten,
// höchstens ein Gewinner; der Gleichstand entscheidet sich wie in der Liste (günstiger, dann stabiler Schlüssel) und nicht
// mehr nach der Kartenposition. Eine reine Laufzeit („1–2 Tage") belegt keinen Zustelltag und gewinnt deshalb nie.
import { offerKey, offerBlocked, sameOffer } from "./offerIdentity.mjs";
import { cheapestOfferOf, fastestOfferOf } from "./offerSort.mjs";

/**
 * @param {Array<object>} sorted   die sichtbare Gruppe (Reihenfolge egal)
 * @param {{isExpired?: (offer: object) => boolean}} [optionen]  eine abgelaufene Angebotsaussage trägt keine Auszeichnung
 */
export function assignBadges(sorted, optionen) {
  const map = new Map();
  if (!sorted || sorted.length === 0) return map;
  const abgelaufen = optionen && typeof optionen.isExpired === "function" ? optionen.isExpired : () => false;

  // Nicht verfügbare/nicht buchbare Angebote sind für beide Auszeichnungen
  // von vornherein raus (Paket B) — "Günstigste"/"Schnellste" darf nie auf
  // einer Karte stehen, die der Kunde ohnehin nicht buchen kann.
  // Gesperrt ist gesperrt — egal aus welchem Grund. `offerBlocked` fasst beide
  // ausdrücklichen Backendaussagen zusammen (`bookable === false` und
  // `availableForDate === false`); ein FEHLENDES Feld sperrt weiterhin nichts.
  // Ebenso raus: eine Karte, deren Aussage abgelaufen ist („Bitte Angebote aktualisieren").
  const kandidaten = sorted.filter((t) => t && !offerBlocked(t) && !abgelaufen(t));

  // Günstigste — nur sinnvoll ab 2 vergleichbaren Preisen
  const cheapest = cheapestOfferOf(kandidaten);
  // Schnellste — früheste voraussichtliche Zustellung, nur ab 2 datierten Angeboten
  const fastest = fastestOfferOf(kandidaten);

  // Ist dasselbe Angebot günstigste UND schnellste Option → dezentes kombiniertes Label.
  // Verglichen und geschlüsselt wird über die Angebotsidentität, nicht über `id`.
  // Zwei Angebote OHNE `id` waren dort `undefined === undefined` → true: sie galten als
  // dasselbe Angebot, bekamen fälschlich das kombinierte Label, und alle Karten ohne `id`
  // lasen anschließend denselben Kartenschlüssel `undefined` zurück.
  if (cheapest && fastest && sameOffer(cheapest, fastest)) {
    map.set(offerKey(cheapest), { key: "best", label: "Günstigste · Schnellste", color: "blue" });
    return map;
  }

  if (cheapest) map.set(offerKey(cheapest), { key: "cheapest", label: "Günstigste", color: "green"  });
  if (fastest)  map.set(offerKey(fastest),  { key: "fastest",  label: "Schnellste", color: "violet" });

  return map;
}
