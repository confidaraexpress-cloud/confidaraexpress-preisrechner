export function assignBadges(sorted) {
  if (!sorted || sorted.length === 0) return new Map();
  const map = new Map();

  if (sorted[0]) {
    map.set(sorted[0].id, { key: "top", label: "TOP EMPFEHLUNG", color: "blue" });
  }

  const withPrice   = sorted.filter(t => t.netPrice != null);
  const withTransit = sorted.filter(t => t.transitDaysMax != null);

  if (withPrice.length >= 2) {
    const cheapest = withPrice.reduce((a, b) => a.netPrice <= b.netPrice ? a : b);
    if (!map.has(cheapest.id)) {
      map.set(cheapest.id, { key: "cheapest", label: "GÜNSTIGSTE", color: "green" });
    }
  }

  if (withTransit.length >= 2) {
    const fastest = withTransit.reduce((a, b) => {
      if (a.transitDaysMax !== b.transitDaysMax) return a.transitDaysMax < b.transitDaysMax ? a : b;
      return (a.transitDaysMin ?? 999) < (b.transitDaysMin ?? 999) ? a : b;
    });
    if (!map.has(fastest.id)) {
      map.set(fastest.id, { key: "fastest", label: "SCHNELLSTE", color: "violet" });
    }
  }

  if (withPrice.length >= 2) {
    const priciest = withPrice.reduce((a, b) => a.netPrice >= b.netPrice ? a : b);
    if (!map.has(priciest.id)) {
      map.set(priciest.id, { key: "priciest", label: "TEUERSTE", color: "gray" });
    }
  }

  return map;
}
