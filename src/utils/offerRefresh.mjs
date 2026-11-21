/* offerRefresh — bis wann die Aussage eines Angebots gilt (Masteranalyse Angebotskarten 2026-11-20, P0-2, §5.3).
 *
 * Reine Funktionen: kein React, kein Netz; die Uhr kommt als Zahl herein.
 *
 * Der Server nennt je Angebot `refreshRequiredAt` (ISO, UTC): den nächsten Tagesbeginn (Europe/Berlin) nach dem Abruf,
 * bei einer Abholung heute früher deren Ende. Das ist eine AKTUALISIERUNGSPFLICHT, keine Annahmefrist — „buchbar bis"
 * nennt die Oberfläche nur mit einem belegten Buchungsschluss (`pickupTodayUntil`). Ist die Frist erreicht, zeigt die
 * Karte „Bitte Angebote aktualisieren"; sie ist nicht mehr auswählbar und trägt keine Auszeichnung. Ein Datum wird hier
 * nie verschoben, und die Prüfungen des Servers bleiben verbindlich.
 *
 * Geräteuhr: verglichen wird mit der SERVERZEIT. `quotedAt` (Serverzeit der Antwort) und der Eingang im Browser ergeben
 * die Abweichung der Geräteuhr; eine falsch gehende Uhr verlängert oder verkürzt so keine Frist.
 *
 * Alte Antworten ohne `refreshRequiredAt`: die Aussage gilt höchstens bis zum nächsten Tagesbeginn nach dem Eingang.
 */

import { businessTodayISO } from "./businessDate.mjs";
import { handoverMode, HANDOVER_PICKUP } from "./handoverMode.mjs";

export const OFFER_REFRESH_TEXT = Object.freeze({
  status: "Bitte Angebote aktualisieren",
  action: "Angebote aktualisieren",
  noticeAll: "Die Angebote sind nicht mehr aktuell. Bitte Angebote aktualisieren.",
  noticeSome: "Einige Angebote sind nicht mehr aktuell. Bitte Angebote aktualisieren.",
});

const STUNDE_MS = 3600000;
const zeitpunkt = (w) => {
  if (typeof w !== "string" || w.length > 40) return null;
  const ms = Date.parse(w);
  return Number.isFinite(ms) ? ms : null;
};

// Der Beginn eines Berliner Kalendertags als Zeitpunkt — Berlin liegt bei UTC+1 oder UTC+2.
function berlinerTagesbeginnMs(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  for (const stunden of [1, 2]) {
    const t = utc - stunden * STUNDE_MS;
    if (businessTodayISO(new Date(t)) === iso && businessTodayISO(new Date(t - 1)) !== iso) return t;
  }
  return null;
}

/** Der nächste Tagesbeginn (Europe/Berlin) nach dem Zeitpunkt — oder null. */
export function nextBusinessDayStartMs(ms) {
  if (!Number.isFinite(ms)) return null;
  const heute = businessTodayISO(new Date(ms));
  if (!heute) return null;
  const [y, m, d] = heute.split("-").map(Number);
  return berlinerTagesbeginnMs(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10));
}

/** Abweichung der Geräteuhr gegen den Server in ms (Serverzeit − Geräteuhr); ohne Beleg 0. */
export function serverClockOffsetMs(quotedAt, receivedAtMs) {
  const server = zeitpunkt(quotedAt);
  return server !== null && Number.isFinite(receivedAtMs) ? server - receivedAtMs : 0;
}

/** Die Uhr einer Angebotsliste: Abweichung der Geräteuhr und die Ersatzfrist für Angebote ohne eigene Frist. */
export function offerListClock({ quotedAt = null, receivedAtMs = null } = {}) {
  const offsetMs = serverClockOffsetMs(quotedAt, receivedAtMs);
  const eingang = Number.isFinite(receivedAtMs) ? receivedAtMs + offsetMs : null;
  return Object.freeze({ offsetMs, fallbackMs: eingang === null ? null : nextBusinessDayStartMs(eingang) });
}

/** Die Frist eines Angebots in ms (Serverzeit) — seine eigene, sonst die Ersatzfrist der Liste, sonst null. */
export function offerRefreshAtMs(offer, fallbackMs = null) {
  const eigene = offer && typeof offer === "object" ? zeitpunkt(offer.refreshRequiredAt) : null;
  if (eigene !== null) return eigene;
  return Number.isFinite(fallbackMs) ? fallbackMs : null;
}

/** Ist die Aussage des Angebots zum Serverzeitpunkt `serverNowMs` abgelaufen? Ohne Frist: nein. */
export function offerRefreshExpired(offer, serverNowMs, fallbackMs = null) {
  const frist = offerRefreshAtMs(offer, fallbackMs);
  return frist !== null && Number.isFinite(serverNowMs) && serverNowMs >= frist;
}

/** Die früheste noch nicht erreichte Frist der Liste (Serverzeit) — der EINE Zeitgeber wartet genau bis dahin. */
export function nextOfferRefreshAtMs(offers, serverNowMs, fallbackMs = null) {
  let naechste = null;
  for (const o of Array.isArray(offers) ? offers : []) {
    const frist = offerRefreshAtMs(o, fallbackMs);
    if (frist !== null && frist > serverNowMs && (naechste === null || frist < naechste)) naechste = frist;
  }
  return naechste;
}

/** Der heutige Berliner Geschäftstag nach der SERVERZEIT (`serverNowMs`) — oder null. */
export function serverTodayISO(serverNowMs) {
  return Number.isFinite(serverNowMs) ? businessTodayISO(new Date(serverNowMs)) : null;
}

/* Restprüfung Angebotskarten 2026-11-21 — darf der Tag eines Angebots „heute" heißen?
 *
 * Bisher allein nach dem Datum und der Geräteuhr: um 18:30 Uhr hieß ein heutiger Abholtag mit Fenster 09:00–17:00 noch
 * „Früheste Abholung heute", obwohl der Server `pickupToday: false` meldete und die Buchung mit 409 endete; eine
 * vorgehende Geräteuhr nahm einer echten Abholung heute ihr „heute".
 *
 *   immer      der Tag des Angebots ist der heutige Berliner Geschäftstag — nach der Serverzeit der Liste (`todayISO`,
 *              useOfferRefresh), nur ohne sie nach dem Gerät. Ein Kennzeichen macht nie einen anderen Tag zu „heute"
 *              (§5.1); eine abgelaufene Aussage (`expired`) heißt nie „heute".
 *   Abholung   zusätzlich die Serveraussage `pickupToday === true` (Abholung heute tatsächlich möglich — Transglobal bis
 *              zum wirksamen Abholschluss, JUMiNGO bis zum Fensterende). Ein heutiger Tag mit `pickupToday: false` ist
 *              keine Abholung heute.
 * Reine Beschriftung: auswählbar oder buchbar macht das nichts. */
export function offerDayIsToday(offer, day, { todayISO = null, expired = false } = {}) {
  const tag = typeof day === "string" ? day.split("T")[0] : "";
  if (!tag || expired === true) return false;
  const heute = typeof todayISO === "string" && todayISO ? todayISO : businessTodayISO();
  if (tag !== heute) return false;
  return handoverMode(offer) === HANDOVER_PICKUP ? !!offer && offer.pickupToday === true : true;
}
