/* ── Lager & Aufträge — Zahlen-, Mengen- und Datumsformate ───────────────────
   Herausgelöst aus inventoryView.mjs (Modularisierungs-Audit): das Blattmodul
   der Lager-Anzeigemodelle. Enthält AUSSCHLIESSLICH seiteneffektfreie
   Formatierung — keine API, kein React, kein Zustand, keine Fachentscheidung.

   `zahlOderNull` ist hier bewusst EXPORTIERT, weil die Fachmodule daneben
   (Bestand, Aufträge, Übersicht) dieselbe Regel brauchen — es bleibt aber ein
   INTERNER Baustein: die Fassade inventoryView.mjs reicht ihn ausdrücklich
   NICHT weiter, die öffentliche API des Lager-Anzeigemodells ist unverändert. */

// Fehlender Wert → null. Bewusst VOR jedem Number()-Aufruf: Number(null) und
// Number("") sind beide 0. Ohne diese Prüfung erschiene ein fehlender Bestand als
// „0" — nicht unterscheidbar von einem echten Nullbestand, und damit eine stille
// Falschaussage über Ware.
export function zahlOderNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Vorzeichenbehaftete Menge mit explizitem Plus — im Ledger trägt das Vorzeichen Bedeutung. */
export function signedQuantity(value) {
  const n = zahlOderNull(value);
  if (n === null) return "—";
  return n > 0 ? `+${n}` : String(n);
}

/** Ganze Stückzahl in deutscher Schreibweise; nie „NaN" und nie ein Rohwert. */
export function formatUnits(value) {
  const n = zahlOderNull(value);
  if (n === null) return "—";
  return n.toLocaleString("de-DE");
}

/** Gewicht in kg, höchstens drei Nachkommastellen, ohne unnötige Nullen. */
export function formatKg(value) {
  const n = zahlOderNull(value);
  if (n === null) return "—";
  return `${n.toLocaleString("de-DE", { maximumFractionDigits: 3 })} kg`;
}

/** „1 Position" / „3 Positionen" — nie „1 Positionen". */
export function positionLabel(count) {
  const n = zahlOderNull(count);
  if (n === null) return "—";
  return `${n.toLocaleString("de-DE")} ${n === 1 ? "Position" : "Positionen"}`;
}

/** „1 Einheit" / „5 Einheiten" — nie „1 Einheiten". */
export function unitLabel(count) {
  const n = zahlOderNull(count);
  if (n === null) return "—";
  return `${n.toLocaleString("de-DE")} ${n === 1 ? "Einheit" : "Einheiten"}`;
}

/**
 * Datum ohne Uhrzeit, zweistellig: „18.08.2026".
 *
 * `toLocaleDateString("de-DE")` allein liefert „18.8.2026" — im selben Modul
 * steht daneben dateTimeShort() mit zweistelligen Feldern, und beide Formen
 * nebeneinander sehen nach Zufall aus.
 */
export function dateShort(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Kurzer Zeitpunkt ohne Sekunden — dieselbe Regel wie dtDE() bei den Entwürfen. */
export function dateTimeShort(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
