export const money = (v) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(v) || 0);

export const dateDE = (d) => (d ? new Date(d).toLocaleDateString("de-DE") : "—");

// Tracking-Tagesdatum: ISO "YYYY-MM-DD" (auch mit Zeitanteil) → "DD.MM.YYYY".
// Alle anderen Formate werden unverändert durchgereicht — kein Date-Parsing,
// damit unbekannte Werte nie zu "Invalid Date" werden.
export const isoDayDE = (v) => {
  const m = typeof v === "string" ? v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
};

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
