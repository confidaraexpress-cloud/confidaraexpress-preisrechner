/* deliveryContractView — die Zustellangabe eines Angebots, providerneutral und in der jeweils
 * belegten Genauigkeit.
 *
 * Reine Funktionen: kein React, kein Netz, kein Datum, kein Zufall.
 *
 * ─── EINE BESCHRIFTUNG FUER KARTE UND BUCHUNG ─────────────────────────────────────────
 * Angebotskarte, ausgewähltes Angebot, Live-Leiste, Sticky-Leiste und Zusammenfassung zeigen
 * dieselbe Aussage. Bis hierher hiess sie je Flaeche anders („Lieferung", „Laufzeit",
 * „Zustellung") — fuer dieselben Daten. Die Regel steht deshalb HIER:
 *
 *   Zustelldaten des Anbieters (Zeitraum oder Tag)  → „Zustellung"
 *   Prognose des Servers (`deliveryProjection`)     → „Voraussichtliche Lieferung"   (TG22 Package B)
 *   nur eine Laufzeit (etwa „1–2 Tage")             → „Voraussichtliche Laufzeit"
 *   nichts davon                                     → „Zustellung" · „Auf Anfrage"
 *
 * Die Schreibweise (Wochentag auf der Karte, TT.MM.JJJJ in den Leisten) bleibt Sache der
 * jeweiligen Flaeche. Welche Aussage gilt und wie sie heisst, entscheidet nur diese Datei.
 *
 * ─── ES WIRD KEIN DATUM GERECHNET ─────────────────────────────────────────────────────
 * Aus einer Laufzeit entsteht hier kein Kalendertag. Eine voraussichtliche Lieferung rechnet
 * ausschliesslich der SERVER (aus Abholtag und Laufzeit, Montag bis Freitag, ohne Feiertage); sie
 * gilt nur ohne Zustelldaten des Anbieters, traegt nie eine Uhrzeit und ist keine Zusage.
 *
 * ─── ES WIRD NICHT NACH DER EINKAUFSQUELLE GEFRAGT ────────────────────────────────────
 * Entschieden wird an den FELDERN, die das Angebot traegt. Ein Angebot mit Zustelldaten behaelt
 * sie samt „bis"-Uhrzeit; ein Angebot mit reiner Laufzeit bekommt keine erfundenen Daten.
 */

import { fmtDelivery } from "./formatters.js";
import { readDeliveryProjection, DELIVERY_PROJECTION_TEXT } from "./deliveryProjectionView.mjs";

export const DELIVERY_LABEL = Object.freeze({
  DATED: "Zustellung",
  TRANSIT: "Voraussichtliche Laufzeit",
  ESTIMATED: DELIVERY_PROJECTION_TEXT.label,
});

export const DELIVERY_ON_REQUEST = "Auf Anfrage";

const text = (w) => (typeof w === "string" && w.trim() !== "" ? w.trim() : null);

// Fuer „derselbe Tag" zaehlt nur der Kalendertag: „2026-08-11T00:00:00Z" und „2026-08-11" sind einer.
const kalendertag = (w) => text(w)?.split("T")[0] ?? null;

/**
 * Die Zustellangabe eines Angebots in neutraler Form.
 *
 * Vorrang: echter Zeitraum → einzelner Tag → Prognose des Servers → Laufzeit → nichts. Ein Zeitraum
 * entsteht nur, wenn beide Grenzen vorliegen UND verschiedene Tage sind — sonst stuende dort
 * „11.08. – 11.08.". Eine Prognose gilt nur ohne Zustelldaten des Anbieters und nennt nie eine Uhrzeit.
 *
 * @param   {object} tarif  ein Angebot der calculate-price-Antwort
 * @returns {{kind: "range"|"date"|"estimate"|"transit"|"unknown", label: string, dayFrom: string|null,
 *            dayUntil: string|null, day: string|null, transit: string|null, until: string|null,
 *            estimate: {dateMin: string, dateMax: string|null}|null}}
 */
export function deliveryContractOf(tarif) {
  const t = tarif && typeof tarif === "object" ? tarif : {};
  const min = text(t.deliveryDateMin);
  const max = text(t.deliveryDateMax);
  const zeitraum = min !== null && max !== null && kalendertag(min) !== kalendertag(max);
  const tag = zeitraum ? null : (min || text(t.deliveryDate));
  const prognose = zeitraum || tag ? null : readDeliveryProjection(t);
  const laufzeit = zeitraum || tag ? null : text(fmtDelivery(t));
  const bis = text(t.deliveryTimeUntil);
  const kind = zeitraum ? "range" : tag ? "date" : prognose ? "estimate" : laufzeit ? "transit" : "unknown";
  return Object.freeze({
    kind,
    label: kind === "transit" ? DELIVERY_LABEL.TRANSIT : kind === "estimate" ? DELIVERY_LABEL.ESTIMATED : DELIVERY_LABEL.DATED,
    dayFrom: zeitraum ? min : null,
    dayUntil: zeitraum ? max : null,
    day: tag,
    transit: laufzeit,
    until: kind === "estimate" || bis === null ? null : (/^bis\b/i.test(bis) ? bis : `bis ${bis}`),
    estimate: prognose,
  });
}
