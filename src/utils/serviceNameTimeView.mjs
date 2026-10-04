// ─── Uhrzeit im sichtbaren Servicenamen — reine Darstellung ──────────────────
//
// Betreiberentscheidung 2026-10-03: steht eine Uhrzeit BEREITS im sichtbaren
// Servicenamen („Express 9:00“, „Domestic Express 12:00“), darf sie rein
// optisch grün hervorgehoben werden — in derselben Grünfamilie wie das
// Frühzeit-Hinweisfeld der Tarifkarte.
//
// Das ist ausschließlich Textgestaltung:
//   • Der Name bleibt Zeichen für Zeichen derselbe. Die Segmente ergeben
//     zusammengesetzt genau den Eingabetext; es wird nichts ergänzt, gekürzt
//     oder umformatiert („9:00“ bleibt „9:00“, kein „Uhr“, kein „bis“).
//   • Daraus entsteht KEINE Zustellzeit und keine Zusage: kein
//     `deliveryTimeUntil`, keine Wirkung auf Lieferzeitfilter (K2),
//     Sortierung, Auszeichnungen, Preis oder Buchung — keiner dieser Wege
//     liest dieses Modul. Die Uhrzeit im Produktnamen bleibt eine Identität.
//   • Keine ServiceID, kein Carrier, keine Einkaufsquelle: entschieden wird
//     allein am sichtbaren Text.
//
// Hervorgehoben wird nur eine frühe Uhrzeit — dieselbe Darstellungsgrenze wie
// beim Frühzeit-Hinweisfeld (`FRUEHZUSTELLUNG_GRENZE_MINUTEN`). Eine
// Tagesendzeit im Namen bliebe neutral, genau wie in der Timeline.

import { FRUEHZUSTELLUNG_GRENZE_MINUTEN } from "./deliveryTimeView.mjs";

// „H:MM“ oder „HH:MM“. Die Grenzen (keine Ziffer, kein Doppelpunkt direkt
// davor oder danach) prüft die Schleife — bewusst ohne Lookbehind, den ältere
// Safari-Versionen nicht parsen.
const UHRZEIT = /(\d{1,2}):(\d{2})/g;
const GRENZZEICHEN = /[\d:]/;

/** Zerlegt einen sichtbaren Servicenamen in Anzeigesegmente
 *  `{ text, time }` — `time: true` genau für eine frühe Uhrzeit im Text.
 *
 *  Kein Name → `[]`. Ohne Uhrzeit → ein einziges Segment mit dem ganzen Text.
 *  Die Verkettung aller `text`-Werte ist immer der unveränderte Eingabetext. */
export function serviceNameSegments(name) {
  const text = typeof name === "string" ? name : "";
  if (!text) return [];
  const segmente = [];
  let rest = 0;
  for (const m of text.matchAll(UHRZEIT)) {
    const start = m.index;
    const ende = start + m[0].length;
    const davor = start > 0 ? text[start - 1] : "";
    const danach = ende < text.length ? text[ende] : "";
    if (GRENZZEICHEN.test(davor) || GRENZZEICHEN.test(danach)) continue;
    const stunde = Number(m[1]);
    const minute = Number(m[2]);
    if (stunde > 23 || minute > 59) continue;
    if (stunde * 60 + minute >= FRUEHZUSTELLUNG_GRENZE_MINUTEN) continue;
    if (start > rest) segmente.push({ text: text.slice(rest, start), time: false });
    segmente.push({ text: m[0], time: true });
    rest = ende;
  }
  if (rest < text.length) segmente.push({ text: text.slice(rest), time: false });
  return segmente;
}
