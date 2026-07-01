export const money = (v) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(v) || 0);

// Kompakte Geldanzeige für KPI-Karten: garantiert kurze, in die Badge-Karte
// passende Breite (≤ ~7 Glyphen). ≥ 1 Mio → „x,x Mio. €“, ≥ 10.000 → „xxk €“,
// ≥ 1.000 → „x,xxk €“ (wie im Handoff), darunter gerundeter Euro-Betrag „xxx €“.
export const moneyCompact = (v) => {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const fmt = (x, frac) => x.toLocaleString("de-DE", { maximumFractionDigits: frac });
  if (abs >= 1_000_000) return `${fmt(n / 1_000_000, 1)} Mio. €`;
  if (abs >= 10_000)    return `${fmt(n / 1_000, 0)}k €`;
  if (abs >= 1_000)     return `${fmt(n / 1_000, 2)}k €`;
  return `${fmt(Math.round(n), 0)} €`;
};

export const dateDE = (d) => (d ? new Date(d).toLocaleDateString("de-DE") : "—");

export const dtDE = (d) => (d ? new Date(d).toLocaleString("de-DE") : "—");

export const fmtDelivery = (t) => {
  const { transitDaysMin, transitDaysMax, deliveryTime } = t;
  if (transitDaysMin != null && transitDaysMax != null) {
    if (transitDaysMin === transitDaysMax) {
      if (transitDaysMin === 0) return "Heute";
      return transitDaysMin === 1 ? "1 Tag" : `${transitDaysMin} Tage`;
    }
    return `${transitDaysMin}–${transitDaysMax} Tage`;
  }
  return deliveryTime || null;
};
