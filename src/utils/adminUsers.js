// Gemeinsame, reine Anzeige-Helfer für die Admin-Kundenansichten (Liste + Detail).
// Kein JSX, kein State, kein Fetch — die Badge-Darstellung bleibt in den Komponenten.

// [badge-Klasse, Label] für Kundenstatus. Fallback → neutral „Unbekannt".
const USER_STATUS_META = {
  pending: ["badge-yellow", "Wartet"],
  approved: ["badge-green", "Freigegeben"],
  blocked: ["badge-red", "Blockiert"],
  anonymized: ["badge-gray", "Anonymisiert"],
};
export const userStatusMeta = (s) => USER_STATUS_META[s] || ["badge-gray", "Unbekannt"];

// [badge-Klasse, Label] für Rolle. Fallback → neutraler Badge mit Rohwert (bzw. „—").
const USER_ROLE_META = {
  admin: ["badge-blue", "Admin"],
  customer: ["badge-gray", "Kunde"],
};
export const userRoleMeta = (r) => USER_ROLE_META[r] || ["badge-gray", r ? String(r) : "—"];

// Zahlungsziel anzeigen; leer → Default „7 Tage" (nur Anzeige, KEINE Logik/Änderung).
export function paymentTermLabel(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `${n} Tage` : "7 Tage";
}
