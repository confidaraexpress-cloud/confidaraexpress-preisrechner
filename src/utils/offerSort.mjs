/* offerSort — EINE Ordnung der Angebote für „Neue Sendung", den Kundenrechner, den öffentlichen Preisrechner und die
 * Auszeichnungen „Günstigste" / „Schnellste" (Masteranalyse Angebotskarten 2026-11-20, Betreiberentscheidung E3).
 *
 * Reine Funktionen: kein React, kein Netz, keine Uhr. Die Eingabe bleibt unverändert.
 *
 * ─── „SCHNELLSTE" ──────────────────────────────────────────────────────────────────────
 * Gelesen wird die Zustellangabe, die auch die Karte zeigt (deliveryContractView.mjs). Sie fällt in genau eine Gruppe:
 *
 *   0  datiert        Zustelltag oder geschlossener Zeitraum des Anbieters, oder eine geschlossene Prognose des Servers
 *   1  nur Laufzeit   etwa „1–2 Tage" — kein Kalendertag; die Rückfallgruppe, geordnet nach der Laufzeit
 *   2  offen          eine Prognose „ab …" ohne Ende
 *   3  unbekannt      keine Angabe
 *
 * Eine unvollständige Angabe bekommt keinen unbelegten Vorteil: sie steht nie vor einer datierten. In der datierten
 * Gruppe entscheidet das frühere ENDE des Zustellfensters, dann sein Anfang, dann eine belegte Uhrzeit am Tag (eine
 * fehlende Uhrzeit zählt als „irgendwann an diesem Tag", nie als Mitternacht), dann der Preis auf derselben Grundlage
 * (Nettopreis), zuletzt die Angebotsidentität als stabiler Schlüssel. Bei vergleichbarer Prognose steht also das
 * günstigere Angebot vorn.
 *
 * ─── AUSZEICHNUNG ──────────────────────────────────────────────────────────────────────
 * „Schnellste" folgt derselben Ordnung: höchstens EIN Gewinner der sichtbaren Gruppe, nur aus der datierten Gruppe und
 * nur, wenn mindestens zwei datierte Angebote verglichen werden. Der Gleichstand entscheidet sich wie in der Liste —
 * unabhängig von der gerade gewählten Sortierung.
 */

import { deliveryContractOf } from "./deliveryContractView.mjs";
import { offerKey } from "./offerIdentity.mjs";

export const OFFER_SORT_MODES = Object.freeze(["recommended", "cheapest", "fastest", "priciest"]);

export const DELIVERY_GROUP = Object.freeze({ DATED: 0, TRANSIT: 1, OPEN: 2, UNKNOWN: 3 });

const tag = (w) => (typeof w === "string" && /^\d{4}-\d{2}-\d{2}/.test(w) ? w.slice(0, 10) : null);
const zahl = (w) => (typeof w === "number" && Number.isFinite(w) ? w : null);

function minutenAus(bis) {
  const m = typeof bis === "string" ? /(\d{1,2}):(\d{2})/.exec(bis) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/** Die Zustellangabe als Rang: Gruppe, Ende und Anfang (Kalendertage), belegte Uhrzeit in Minuten, Laufzeit. */
export function deliveryRankOf(offer) {
  const v = deliveryContractOf(offer);
  const leer = { start: null, end: null, minutes: null, transitMax: null, transitMin: null };
  if (v.kind === "range" && tag(v.dayFrom) && tag(v.dayUntil)) {
    return { ...leer, group: DELIVERY_GROUP.DATED, start: tag(v.dayFrom), end: tag(v.dayUntil), minutes: minutenAus(v.until) };
  }
  if (v.kind === "date" && tag(v.day)) {
    return { ...leer, group: DELIVERY_GROUP.DATED, start: tag(v.day), end: tag(v.day), minutes: minutenAus(v.until) };
  }
  if (v.kind === "estimate" && v.estimate && tag(v.estimate.dateMin)) {
    if (v.estimate.dateMax === null) return { ...leer, group: DELIVERY_GROUP.OPEN, start: tag(v.estimate.dateMin) };
    if (tag(v.estimate.dateMax)) {
      return { ...leer, group: DELIVERY_GROUP.DATED, start: tag(v.estimate.dateMin), end: tag(v.estimate.dateMax),
               minutes: minutenAus(v.until) };
    }
  }
  const o = offer && typeof offer === "object" ? offer : {};
  const transitMax = zahl(o.transitDaysMax);
  const transitMin = zahl(o.transitDaysMin);
  if (v.kind === "transit" && (transitMax !== null || transitMin !== null)) {
    return { ...leer, group: DELIVERY_GROUP.TRANSIT, transitMax: transitMax ?? transitMin, transitMin: transitMin ?? transitMax };
  }
  return { ...leer, group: DELIVERY_GROUP.UNKNOWN };
}

// Aufsteigend; ein fehlender Wert steht hinten.
const aufsteigend = (a, b) => {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return a < b ? -1 : 1;
};
const preis = (o) => zahl(o && o.netPrice);
const schluessel = (a, b) => aufsteigend(offerKey(a), offerKey(b));

function nachZustellung(a, b) {
  const ra = deliveryRankOf(a);
  const rb = deliveryRankOf(b);
  if (ra.group !== rb.group) return ra.group - rb.group;
  if (ra.group === DELIVERY_GROUP.DATED) {
    return aufsteigend(ra.end, rb.end) || aufsteigend(ra.start, rb.start) || aufsteigend(ra.minutes, rb.minutes);
  }
  if (ra.group === DELIVERY_GROUP.TRANSIT) {
    return aufsteigend(ra.transitMax, rb.transitMax) || aufsteigend(ra.transitMin, rb.transitMin);
  }
  if (ra.group === DELIVERY_GROUP.OPEN) return aufsteigend(ra.start, rb.start);
  return 0;
}

/** „Schnellste": Zustellung, dann Preis, dann stabiler Schlüssel. */
export function compareFastest(a, b) {
  return nachZustellung(a, b) || aufsteigend(preis(a), preis(b)) || schluessel(a, b);
}

/** „Günstigste": Preis, dann Zustellung, dann stabiler Schlüssel. */
export function compareCheapest(a, b) {
  return aufsteigend(preis(a), preis(b)) || nachZustellung(a, b) || schluessel(a, b);
}

/** „Teuerste": Preis absteigend (ohne Preis hinten), dann Zustellung, dann stabiler Schlüssel. */
export function comparePriciest(a, b) {
  const pa = preis(a);
  const pb = preis(b);
  const nachPreis = pa === pb ? 0 : pa === null ? 1 : pb === null ? -1 : pb - pa;
  return nachPreis || nachZustellung(a, b) || schluessel(a, b);
}

const VERGLEICH = Object.freeze({ cheapest: compareCheapest, fastest: compareFastest, priciest: comparePriciest });

/** Die Liste in der gewählten Ordnung — „recommended" (und Unbekanntes) behält die Reihenfolge des Servers. */
export function sortOffers(list, mode) {
  const liste = Array.isArray(list) ? list : [];
  const vergleich = VERGLEICH[mode];
  return vergleich ? [...liste].sort(vergleich) : liste;
}

/** Der Gewinner „Schnellste" unter den Kandidaten — nur datierte, mindestens zwei, sonst null. */
export function fastestOfferOf(candidates) {
  const datiert = (Array.isArray(candidates) ? candidates : [])
    .filter((o) => o && typeof o === "object" && deliveryRankOf(o).group === DELIVERY_GROUP.DATED);
  return datiert.length >= 2 ? [...datiert].sort(compareFastest)[0] : null;
}

/** Der Gewinner „Günstigste" unter den Kandidaten — nur mit Preis, mindestens zwei, sonst null. */
export function cheapestOfferOf(candidates) {
  const mitPreis = (Array.isArray(candidates) ? candidates : []).filter((o) => preis(o) !== null);
  return mitPreis.length >= 2 ? [...mitPreis].sort(compareCheapest)[0] : null;
}
