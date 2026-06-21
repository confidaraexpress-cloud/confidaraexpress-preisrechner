// Objektive Angebots-Labels für die Karten.
//
// Bewusst reduziert auf zwei neutrale, objektiv überprüfbare Aussagen:
//   • "Günstigste"  – niedrigster Netto-Preis
//   • "Schnellste"  – kürzeste Laufzeit
// Ist ein Angebot gleichzeitig günstigste UND schnellste Option, wird ein
// dezentes kombiniertes Label vergeben. Es gibt KEINE "Top Empfehlung",
// kein "Empfohlen" und kein "Teuerste"-Label mehr.
export function assignBadges(sorted) {
  if (!sorted || sorted.length === 0) return new Map();
  const map = new Map();

  const withPrice   = sorted.filter(t => t.netPrice != null);
  const withTransit = sorted.filter(t => t.transitDaysMax != null);

  let cheapestId = null;
  let fastestId  = null;

  // "Günstigste" nur sinnvoll, wenn mindestens zwei Preise vergleichbar sind.
  if (withPrice.length >= 2) {
    const cheapest = withPrice.reduce((a, b) => (a.netPrice <= b.netPrice ? a : b));
    cheapestId = cheapest.id;
  }

  // "Schnellste" nach kürzester Laufzeit (transitDaysMax, dann transitDaysMin).
  if (withTransit.length >= 2) {
    const fastest = withTransit.reduce((a, b) => {
      if (a.transitDaysMax !== b.transitDaysMax) return a.transitDaysMax < b.transitDaysMax ? a : b;
      return (a.transitDaysMin ?? 999) < (b.transitDaysMin ?? 999) ? a : b;
    });
    fastestId = fastest.id;
  }

  if (cheapestId != null && cheapestId === fastestId) {
    map.set(cheapestId, { key: "both", label: "Günstigste · Schnellste" });
  } else {
    if (cheapestId != null) map.set(cheapestId, { key: "cheapest", label: "Günstigste" });
    if (fastestId  != null) map.set(fastestId,  { key: "fastest",  label: "Schnellste" });
  }

  return map;
}
