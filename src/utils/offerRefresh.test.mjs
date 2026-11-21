// offerRefresh — Gültigkeit einer Angebotsaussage (Masteranalyse Angebotskarten 2026-11-20, §5.3). Synthetische Daten.
import test from "node:test";
import assert from "node:assert/strict";
import {
  nextBusinessDayStartMs, serverClockOffsetMs, offerListClock, offerRefreshAtMs, offerRefreshExpired,
  nextOfferRefreshAtMs, OFFER_REFRESH_TEXT,
} from "./offerRefresh.mjs";

const ms = (iso) => Date.parse(iso);

test("(V1) nächster Tagesbeginn Europe/Berlin — Winter, Sommer und beide Zeitumstellungen", () => {
  assert.equal(nextBusinessDayStartMs(ms("2026-11-20T15:00:00Z")), ms("2026-11-20T23:00:00Z"));
  assert.equal(nextBusinessDayStartMs(ms("2026-07-15T08:00:00Z")), ms("2026-07-15T22:00:00Z"));
  // 23:30 Berlin (Winter) ist schon der Abend des 20.: der nächste Beginn ist Mitternacht zum 21.
  assert.equal(nextBusinessDayStartMs(ms("2026-11-20T22:30:00Z")), ms("2026-11-20T23:00:00Z"));
  // Zeitumstellungen 2026: 29.03. (Sommerzeit beginnt) und 25.10. (endet) — der Tagesbeginn danach stimmt.
  assert.equal(nextBusinessDayStartMs(ms("2026-03-29T10:00:00Z")), ms("2026-03-29T22:00:00Z"));
  assert.equal(nextBusinessDayStartMs(ms("2026-10-25T10:00:00Z")), ms("2026-10-25T23:00:00Z"));
  assert.equal(nextBusinessDayStartMs(Number.NaN), null);
});

test("(V2) Geräteuhr: verglichen wird mit der Serverzeit, ohne Beleg ohne Korrektur", () => {
  assert.equal(serverClockOffsetMs("2026-11-20T12:00:00.000Z", ms("2026-11-20T11:55:00Z")), 5 * 60000);
  assert.equal(serverClockOffsetMs(null, ms("2026-11-20T11:55:00Z")), 0);
  assert.equal(serverClockOffsetMs("kein Datum", ms("2026-11-20T11:55:00Z")), 0);
  // Die Geräteuhr geht 10 Minuten nach: eine Frist 15:45Z ist um 15:40 Geräteuhr (15:50 Server) schon erreicht.
  const uhr = offerListClock({ quotedAt: "2026-11-20T15:10:00.000Z", receivedAtMs: ms("2026-11-20T15:00:00Z") });
  const angebot = { refreshRequiredAt: "2026-11-20T15:45:00.000Z" };
  assert.equal(offerRefreshExpired(angebot, ms("2026-11-20T15:40:00Z") + uhr.offsetMs, uhr.fallbackMs), true);
  assert.equal(offerRefreshExpired(angebot, ms("2026-11-20T15:30:00Z") + uhr.offsetMs, uhr.fallbackMs), false);
});

test("(V3) eigene Frist vor Ersatzfrist; alte Antwort ohne Frist gilt bis zum nächsten Tagesbeginn nach dem Eingang", () => {
  const uhr = offerListClock({ quotedAt: null, receivedAtMs: ms("2026-11-20T21:00:00Z") });
  assert.equal(uhr.fallbackMs, ms("2026-11-20T23:00:00Z"));
  assert.equal(offerRefreshAtMs({ refreshRequiredAt: "2026-11-20T15:45:00.000Z" }, uhr.fallbackMs), ms("2026-11-20T15:45:00Z"));
  assert.equal(offerRefreshAtMs({}, uhr.fallbackMs), ms("2026-11-20T23:00:00Z"));
  assert.equal(offerRefreshAtMs({ refreshRequiredAt: 17 }, null), null);
  // Ohne jede Frist ist nichts abgelaufen — die Prüfungen des Servers bleiben verbindlich.
  assert.equal(offerRefreshExpired({}, ms("2030-01-01T00:00:00Z"), null), false);
  // Ein vergangener Tag zählt: eine Liste von gestern ist heute abgelaufen.
  assert.equal(offerRefreshExpired({}, ms("2026-11-21T08:00:00Z"), uhr.fallbackMs), true);
});

test("(V4) EIN Zeitgeber: die früheste noch offene Frist der Liste, abgelaufene zählen nicht mehr", () => {
  const liste = [
    { refreshRequiredAt: "2026-11-20T23:00:00.000Z" },
    { refreshRequiredAt: "2026-11-20T15:45:00.000Z" },
    { refreshRequiredAt: "2026-11-20T11:00:00.000Z" },
    {},
  ];
  assert.equal(nextOfferRefreshAtMs(liste, ms("2026-11-20T12:00:00Z"), null), ms("2026-11-20T15:45:00Z"));
  assert.equal(nextOfferRefreshAtMs(liste, ms("2026-11-20T16:00:00Z"), null), ms("2026-11-20T23:00:00Z"));
  assert.equal(nextOfferRefreshAtMs(liste, ms("2026-11-21T00:00:00Z"), null), null);
  assert.equal(nextOfferRefreshAtMs(null, 0, null), null);
});

test("(V5) Texte: Aktualisierungspflicht, keine Annahmefrist — kein „buchbar bis“, kein Anbieter", () => {
  const alles = JSON.stringify(OFFER_REFRESH_TEXT);
  assert.match(OFFER_REFRESH_TEXT.status, /Bitte Angebote aktualisieren/);
  assert.ok(!/buchbar bis|JUMiNGO|Transglobal|garant/i.test(alles), alles);
});

// ── Restprüfung 2026-11-21: „heute“ auf Karte und öffentlichem Rechner (offerDayIsToday) ──────────────────────────
import { offerDayIsToday, serverTodayISO } from "./offerRefresh.mjs";
import { offerListClock as uhrDerListe } from "./offerRefresh.mjs";

const abholung = (tag, pickupToday) => ({ serviceType: "pickup", pickupDate: tag, pickupToday });
const abgabe = (tag) => ({ serviceType: "dropoff", pickupDate: tag });

test("(V6) 18:30 Uhr, heutiger Abholtag mit abgelaufenem Fenster 09:00–17:00: der Server sagt false — kein „heute“", () => {
  const heute = serverTodayISO(ms("2026-11-20T17:30:00Z"));                    // 18:30 Berlin
  assert.equal(heute, "2026-11-20");
  assert.equal(offerDayIsToday(abholung("2026-11-20", false), "2026-11-20", { todayISO: heute }), false);
  // Ohne Serveraussage ebenso nicht: ein Datum allein ist keine Abholung heute.
  assert.equal(offerDayIsToday(abholung("2026-11-20", undefined), "2026-11-20", { todayISO: heute }), false);
});

test("(V7) vor Ablauf „heute“; ab der Frist (Fensterende) nicht mehr; nach Mitternacht nie", () => {
  const vorher = serverTodayISO(ms("2026-11-20T15:59:00Z"));                   // 16:59 Berlin
  assert.equal(offerDayIsToday(abholung("2026-11-20", true), "2026-11-20", { todayISO: vorher }), true);
  // Die Liste meldet die Aussage am Fensterende als abgelaufen (refreshRequiredAt) — die Karte sagt dann nicht „heute“.
  const angebot = { ...abholung("2026-11-20", true), refreshRequiredAt: "2026-11-20T16:00:00.000Z" };
  assert.equal(offerRefreshExpired(angebot, ms("2026-11-20T16:00:00Z")), true);
  assert.equal(offerDayIsToday(angebot, "2026-11-20", { todayISO: vorher, expired: true }), false);
  // 00:30 Berlin am 21.: der Servertag ist ein anderer.
  const danach = serverTodayISO(ms("2026-11-20T23:30:00Z"));
  assert.equal(danach, "2026-11-21");
  assert.equal(offerDayIsToday(abholung("2026-11-20", true), "2026-11-20", { todayISO: danach }), false);
});

test("(V8) falsch gestellte Geräteuhr: der Servertag der Liste entscheidet, nicht das Gerät", () => {
  // Gerät geht 26 Stunden nach (zeigt noch den 19.), Server antwortet am 20. um 10:00 Berlin.
  const empfangen = ms("2026-11-19T07:00:00Z");
  const uhr = uhrDerListe({ quotedAt: "2026-11-20T09:00:00.000Z", receivedAtMs: empfangen });
  const servertag = serverTodayISO(empfangen + uhr.offsetMs);
  assert.equal(servertag, "2026-11-20");
  assert.equal(offerDayIsToday(abholung("2026-11-20", true), "2026-11-20", { todayISO: servertag }), true);
  assert.equal(offerDayIsToday(abgabe("2026-11-20"), "2026-11-20", { todayISO: servertag }), true);
  // Gerät geht vor (zeigt schon den 21.): eine echte Abholung heute bleibt „heute“.
  const vor = uhrDerListe({ quotedAt: "2026-11-20T09:00:00.000Z", receivedAtMs: ms("2026-11-21T09:00:00Z") });
  assert.equal(serverTodayISO(ms("2026-11-21T09:00:00Z") + vor.offsetMs), "2026-11-20");
  // Ein Kennzeichen macht nie einen anderen Tag zu „heute“.
  assert.equal(offerDayIsToday(abholung("2026-11-23", true), "2026-11-23", { todayISO: "2026-11-20" }), false);
  assert.equal(serverTodayISO(Number.NaN), null);
});

test("(V9) Abgabe: „heute“ nach dem Tag, abgelaufen nie; ohne Tag nichts", () => {
  assert.equal(offerDayIsToday(abgabe("2026-11-20"), "2026-11-20", { todayISO: "2026-11-20" }), true);
  assert.equal(offerDayIsToday(abgabe("2026-11-20"), "2026-11-20", { todayISO: "2026-11-20", expired: true }), false);
  assert.equal(offerDayIsToday(abgabe("2026-11-21"), "2026-11-21", { todayISO: "2026-11-20" }), false);
  assert.equal(offerDayIsToday(abgabe(null), null, { todayISO: "2026-11-20" }), false);
  assert.equal(offerDayIsToday(null, "2026-11-20", { todayISO: "2026-11-20" }), true, "ohne Übergabeart: nur der Tag");
});
