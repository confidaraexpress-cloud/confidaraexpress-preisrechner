export const money = (v) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(v) || 0);

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
