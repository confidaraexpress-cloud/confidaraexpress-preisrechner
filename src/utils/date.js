// ─── Zentrale Datums-Helfer ──────────────────────────────────────────────────
// Bewusst LOKAL (nicht UTC): `new Date().toISOString()` liefert UTC und kann in
// DE (UTC+1/+2) nahe Mitternacht „heute" um einen Tag verschieben. Alle Helfer
// arbeiten mit lokalen Date-Feldern. UI-Format: DD.MM.YYYY · API-Format: YYYY-MM-DD.

// Lokales Date → "YYYY-MM-DD" (keine Zeitzonen-Verschiebung).
export const toISODateLocal = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// "YYYY-MM-DD" → lokales Date (lokale Mitternacht) · null bei ungültig.
export const parseISODateLocal = (iso) => {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

// Heute als lokales "YYYY-MM-DD".
export const todayISO = () => toISODateLocal(new Date());

// Heute + n Tage als lokales "YYYY-MM-DD".
export const addDaysISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toISODateLocal(d);
};

// "YYYY-MM-DD" → "DD.MM.YYYY" (rein string-basiert, keine Zeitzone).
export const fmtDE = (iso) => {
  if (!iso) return "";
  const date = String(iso).split("T")[0];
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return "";
  return `${d}.${m}.${y}`;
};

// Trigger-Label: „Heute, …" / „Morgen, …" / sonst „DD.MM.YYYY".
export const labelForDate = (iso) => {
  if (iso === todayISO())    return `Heute, ${fmtDE(iso)}`;
  if (iso === addDaysISO(1)) return `Morgen, ${fmtDE(iso)}`;
  return fmtDE(iso);
};
