// Objektive Auszeichnungen für Angebotskarten.
// Bewusst nur faktische Labels: "Günstigste" und "Schnellste".
// Kein "Top Empfehlung"/Ribbon und kein "Teuerste" mehr — diese werteten
// Angebote subjektiv bzw. negativ und erzeugten visuelle Unruhe.
import { offerKey, offerBlocked, sameOffer } from "./offerIdentity.mjs";

export function assignBadges(sorted) {
  const map = new Map();
  if (!sorted || sorted.length === 0) return map;

  // Nicht verfügbare/nicht buchbare Angebote sind für beide Auszeichnungen
  // von vornherein raus (Paket B) — "Günstigste"/"Schnellste" darf nie auf
  // einer Karte stehen, die der Kunde ohnehin nicht buchen kann.
  // Gesperrt ist gesperrt — egal aus welchem Grund. `offerBlocked` fasst beide
  // ausdrücklichen Backendaussagen zusammen (`bookable === false` und
  // `availableForDate === false`); ein FEHLENDES Feld sperrt weiterhin nichts.
  const bookable    = sorted.filter(t => !offerBlocked(t));
  const withPrice   = bookable.filter(t => t.netPrice != null);
  const withTransit = bookable.filter(t => t.transitDaysMax != null);

  // Günstigste — nur sinnvoll ab 2 vergleichbaren Preisen
  let cheapest = null;
  if (withPrice.length >= 2) {
    cheapest = withPrice.reduce((a, b) => (a.netPrice <= b.netPrice ? a : b));
  }

  // Schnellste — nach max. Laufzeit, bei Gleichstand nach min. Laufzeit
  let fastest = null;
  if (withTransit.length >= 2) {
    fastest = withTransit.reduce((a, b) => {
      if (a.transitDaysMax !== b.transitDaysMax) return a.transitDaysMax < b.transitDaysMax ? a : b;
      return (a.transitDaysMin ?? 999) < (b.transitDaysMin ?? 999) ? a : b;
    });
  }

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
