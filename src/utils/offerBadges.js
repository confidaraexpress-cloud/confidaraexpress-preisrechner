// Objektive Auszeichnungen für Angebotskarten.
// Bewusst nur faktische Labels: "Günstigste" und "Schnellste".
// Kein "Top Empfehlung"/Ribbon und kein "Teuerste" mehr — diese werteten
// Angebote subjektiv bzw. negativ und erzeugten visuelle Unruhe.
export function assignBadges(sorted) {
  const map = new Map();
  if (!sorted || sorted.length === 0) return map;

  const withPrice   = sorted.filter(t => t.netPrice != null);
  const withTransit = sorted.filter(t => t.transitDaysMax != null);

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
  if (cheapest && fastest && cheapest.id === fastest.id) {
    map.set(cheapest.id, { key: "best", label: "Günstigste · Schnellste", color: "blue" });
    return map;
  }

  if (cheapest) map.set(cheapest.id, { key: "cheapest", label: "Günstigste", color: "green"  });
  if (fastest)  map.set(fastest.id,  { key: "fastest",  label: "Schnellste", color: "violet" });

  return map;
}
