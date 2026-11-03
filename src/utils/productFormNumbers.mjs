/* ── Zahlen im Artikelformular (Eingabe-Audit A12, 2026-11-03) ───────────────────────────────────
   Bisher las das Formular jede Zahl mit `Number(s.replace(",", "."))`: „1.000“ im Mindestbestand wurde still 1,
   „1.234“ im Warenwert wurde 1,234 € und auf dem Server 1,23 €, „1e2“ wurde 100, „0x10“ wurde 16. Jetzt gilt je
   Feldart eine eindeutige Lesart — was nicht eindeutig ist, wird gemeldet statt geraten.
   Rückgabe jeweils `{ empty: true }`, `{ value }` oder `{ invalid: true }`. */

import { parseEuroCents } from "./manualInvoiceView.mjs";

const leer = (raw) => String(raw ?? "").trim() === "";

/** Gewicht und Maße: Ziffern mit höchstens einem Dezimaltrenner (Komma oder Punkt), „1.5“ wie „1,5“. */
export function parseMeasureInput(raw) {
  if (leer(raw)) return { empty: true };
  const s = String(raw).trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(s)) return { invalid: true };
  return { value: Number(s.replace(",", ".")) };
}

/** Warenwert in Euro: dieselbe Regel wie die manuelle Rechnung — „1.234,50“ und „1.234“ (Tausender), „12.5“. */
export function parseMoneyInput(raw) {
  if (leer(raw)) return { empty: true };
  const cent = parseEuroCents(raw);
  return cent === null ? { invalid: true } : { value: cent / 100 };
}

/** Ganze Zahl (Mindestbestand): „1000“ oder mit Tausenderpunkten „1.000“; eine Ganzzahl kennt keinen Dezimalpunkt. */
export function parseIntegerInput(raw) {
  if (leer(raw)) return { empty: true };
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return { value: Number(s) };
  if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) return { value: Number(s.replace(/\./g, "")) };
  return { invalid: true };
}
