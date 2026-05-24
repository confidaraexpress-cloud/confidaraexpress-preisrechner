export const money = (v) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(v) || 0);

export const dateDE = (d) => (d ? new Date(d).toLocaleDateString("de-DE") : "—");

export const dtDE = (d) => (d ? new Date(d).toLocaleString("de-DE") : "—");
