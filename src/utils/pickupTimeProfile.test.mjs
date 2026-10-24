/* Einheitlicher Abholtermin (2026-10-24) — welche Variante des Abschnitts „Abholtermin" ein Angebot bekommt.
 *
 *   window_adjustable  Regler (JUMiNGO, wenn der Server `pickupWindowAdjustable: true` UND ein Fenster nennt)
 *   window_fixed       fester Zeitraum (JUMiNGO ohne Wahl, Portalzeitraum GLS 110 / DPD 137)
 *   ready_from         „Sendung bereit ab …" (Transglobal-Direktbuchung; kein Ende im Anbietervertrag)
 *   date_only          nur der Abholtag (keine belastbare Uhrzeit)
 *   none               Paketshopabgabe oder nichts zu zeigen
 *
 * Gemessen werden der reine Helfer und — am Quelltext —, dass Modul, Buchungsseite und Client ihn ohne
 * Provider- oder ServiceID-Weiche benutzen. Kein Netz, kein Browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickupTimeProfileOf, pickupSummaryOf, PICKUP_PROFILE, PICKUP_SECTION_TEXT } from "./pickupContractView.mjs";
import { sameDayBookByText, sameDayUntilText } from "./sameDayCollectionView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => fs.readFileSync(path.join(HIER, "..", p), "utf8");
const ohneKommentar = (s) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// Die Angebotsformen der calculate-price-Antwort — Feldnamen wie im Serververtrag.
const J_VERSTELLBAR = Object.freeze({
  offerId: "a".repeat(32), serviceType: "pickup", pickupDate: "2026-10-27T00:00:00Z",
  pickupTimeFrom: "09:00", pickupTimeUntil: "17:00", pickupWindowAdjustable: true, pickupWindowMinMinutes: 120,
});
const J_FEST = Object.freeze({ ...J_VERSTELLBAR, pickupWindowAdjustable: false, pickupWindowMinMinutes: null });
const TG_PORTAL = Object.freeze({
  offerId: "b".repeat(32), serviceType: "pickup", collectionDate: "2026-10-27", collectionReadyFrom: null,
  pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
});
const TG_V2 = Object.freeze({
  offerId: "c".repeat(32), serviceType: "pickup", collectionDate: "2026-10-27", collectionReadyFrom: "09:00",
  pickupTimeFrom: null, pickupTimeUntil: null,
});
const TG_HEUTE = Object.freeze({ ...TG_V2, collectionDate: "2026-10-26", collectionReadyFrom: "11:45",
  pickupToday: true, pickupTodayUntil: "16:45" });
const TG_HEUTE_GESPERRT = Object.freeze({ ...TG_V2, collectionDate: "2026-10-26", collectionReadyFrom: null });
const TG_ABGABE = Object.freeze({ offerId: "d".repeat(32), serviceType: "dropoff", collectionDate: null,
  collectionReadyFrom: null, pickupTimeFrom: null, pickupTimeUntil: null, parcelShopSearch: "server" });
const J_ABGABE = Object.freeze({ offerId: "e".repeat(32), serviceType: "dropoff", pickupDate: "2026-10-27",
  pickupTimeFrom: "09:00", pickupTimeUntil: "18:00" });

test("P1 — JUMiNGO verstellbar: Regler mit der Mindestdauer des Servers", () => {
  const p = pickupTimeProfileOf(J_VERSTELLBAR);
  assert.equal(p.kind, PICKUP_PROFILE.ADJUSTABLE);
  assert.deepEqual([p.day, p.from, p.until, p.minMinutes], ["2026-10-27T00:00:00Z", "09:00", "17:00", 120]);
  assert.equal(p.readyFrom, null);
});

test("P2 — JUMiNGO ohne Wahl: fester Zeitraum, keine Mindestdauer", () => {
  const p = pickupTimeProfileOf(J_FEST);
  assert.equal(p.kind, PICKUP_PROFILE.FIXED);
  assert.deepEqual([p.from, p.until, p.minMinutes], ["09:00", "17:00", null]);
  // Ein Kennzeichen ohne echtes Fenster ist ebenfalls keine Wahl.
  assert.equal(pickupTimeProfileOf({ ...J_VERSTELLBAR, pickupTimeUntil: "08:00" }).kind, PICKUP_PROFILE.FIXED);
});

test("P3 — Portalzeitraum (GLS 110, DPD 137): fester Zeitraum am Abholtag des Angebots", () => {
  const p = pickupTimeProfileOf(TG_PORTAL);
  assert.equal(p.kind, PICKUP_PROFILE.FIXED);
  assert.deepEqual([p.day, p.from, p.until, p.readyFrom], ["2026-10-27", "09:00", "17:00", null]);
});

test("P4 — Transglobal-Direktbuchung: „Sendung bereit ab“ ohne Ende", () => {
  const p = pickupTimeProfileOf(TG_V2);
  assert.equal(p.kind, PICKUP_PROFILE.READY_FROM);
  assert.deepEqual([p.day, p.readyFrom, p.from, p.until, p.sameDayBookBy], ["2026-10-27", "09:00", null, null, null]);
});

test("P5 — Abholung heute: „bereit ab“ plus der Buchungsschluss des Servers — kein Abholende", () => {
  const p = pickupTimeProfileOf(TG_HEUTE);
  assert.equal(p.kind, PICKUP_PROFILE.READY_FROM);
  assert.deepEqual([p.readyFrom, p.sameDayBookBy], ["11:45", "16:45"]);
  assert.equal(sameDayBookByText(p.sameDayBookBy), "Abholung heute bei Buchung bis 16:45 Uhr");
  assert.equal(pickupTimeProfileOf({ ...TG_HEUTE, pickupTodayUntil: "16:45 Uhr" }).sameDayBookBy, null);
  assert.equal(pickupTimeProfileOf({ ...TG_HEUTE, pickupToday: false }).sameDayBookBy, null);
});

test("P6 — fehlende Abholzeit: nur das Datum, keine erfundene Uhrzeit", () => {
  const p = pickupTimeProfileOf(TG_HEUTE_GESPERRT);
  assert.equal(p.kind, PICKUP_PROFILE.DATE_ONLY);
  assert.deepEqual([p.day, p.from, p.until, p.readyFrom], ["2026-10-26", null, null, null]);
});

test("P7 — Paketshopabgabe (auch mit Fensterfeldern) und unbelegte Übergabe: kein Abholtermin", () => {
  for (const t of [TG_ABGABE, J_ABGABE, { ...TG_V2, serviceType: undefined }, null, undefined, {}]) {
    assert.equal(pickupTimeProfileOf(t).kind, PICKUP_PROFILE.NONE, JSON.stringify(t));
  }
  // Eine Abholung ohne Tag und ohne jede Uhrzeit hat nichts zu zeigen.
  assert.equal(pickupTimeProfileOf({ serviceType: "pickup" }).kind, PICKUP_PROFILE.NONE);
  // Ein Fenster ohne Tag bleibt sichtbar (wie bisher).
  assert.equal(pickupTimeProfileOf({ ...J_FEST, pickupDate: undefined }).kind, PICKUP_PROFILE.FIXED);
});

test("P8 — Zusammenfassung: eine Auswahl gilt nur am verstellbaren Fenster, nie am festen Zeitraum", () => {
  const wahl = { from: "13:00", until: "15:00" };
  assert.equal(pickupSummaryOf(J_VERSTELLBAR, wahl).time, "13:00–15:00 Uhr");
  assert.equal(pickupSummaryOf(J_FEST, wahl).time, "09:00–17:00 Uhr");
  assert.equal(pickupSummaryOf(TG_PORTAL, wahl).time, "09:00–17:00 Uhr", "ein Portalzeitraum übernahm eine fremde Auswahl");
  assert.equal(pickupSummaryOf(TG_V2, wahl).time, "bereit ab 09:00 Uhr");
  assert.equal(pickupSummaryOf(TG_HEUTE_GESPERRT, wahl).time, null);
});

test("P9 — Same-Day-Satz an EINER Stelle: Karte, Zusammenfassung und Abschnitt sagen dasselbe", () => {
  const karte = { ...TG_HEUTE, sameDaySurchargeNet: 2.52, sameDaySurchargeGross: 3.0 };
  assert.equal(sameDayUntilText(karte), "Abholung heute bei Buchung bis 16:45 Uhr");
  assert.equal(sameDayBookByText("16:45"), sameDayUntilText(karte));
  for (const kaputt of [null, "", "16:45 Uhr", "25:00", 1645]) assert.equal(sameDayBookByText(kaputt), null);
});

test("P10 — Texte des Abschnitts: Titel nur mit Wahl „Gewünschter …“; keine Garantiezusage", () => {
  assert.equal(PICKUP_SECTION_TEXT.titleChoice, "Gewünschter Abholtermin");
  assert.equal(PICKUP_SECTION_TEXT.title, "Abholtermin");
  for (const satz of [PICKUP_SECTION_TEXT.fixedNote, PICKUP_SECTION_TEXT.readyFromNote, PICKUP_SECTION_TEXT.dateOnlyNote]) {
    assert.ok(!/garantiert|pünktlich|verbindlich zugesagt/i.test(satz), `Zusage im Text: ${satz}`);
  }
  assert.match(PICKUP_SECTION_TEXT.fixedNote, /keine genaue Uhrzeit|eine genaue Uhrzeit wird nicht zugesagt/);
});

test("Q1 — Modul ohne Provider- und ServiceID-Weiche, Varianten nur aus dem Profil", () => {
  const modul = ohneKommentar(lies("components/booking/PickupWindowModule.jsx"));
  assert.ok(modul.includes("pickupTimeProfileOf(tariff)"), "das Modul liest das Profil nicht");
  for (const weiche of [/serviceId/i, /provider_service/i, /jumingo/i, /transglobal/i, /\b(110|137|124)\b/, /publicCarrierId/]) {
    assert.ok(!weiche.test(modul), `Weiche im Modul: ${weiche}`);
  }
  // Der Entwurf wird nur bei einer Wahl gelesen oder beschrieben — mit dem Angebotsbezug.
  assert.ok(modul.includes("getDraftPickupWindow(ceShipmentId, offerId)"));
  assert.ok(modul.includes("saveDraftPickupWindow({ ceShipmentId, offerId, pickupTimeFrom, pickupTimeUntil })"));
  assert.ok(/if \(!adjustable\) \{[\s\S]{0,400}change\.current && change\.current\(null\);[\s\S]{0,40}return;/.test(modul),
    "ohne Wahl wird eine alte Auswahl nicht verworfen");
});

test("Q2 — Buchungsseite: der Abschnitt steht bei JEDER Fahrerabholung, nicht nur bei einem Fenster", () => {
  const seite = ohneKommentar(lies("pages/BookingPage.jsx"));
  assert.ok(/\{tariff\.serviceType === "pickup" && \(\s*<PickupWindowModule/.test(seite), "Renderbedingung verändert");
  assert.ok(!/tariff\.pickupTimeFrom && tariff\.pickupTimeUntil && \(\s*<PickupWindowModule/.test(seite),
    "der Abschnitt hängt wieder am JUMiNGO-Fenster");
});

test("Q3 — Client: Lesen und Speichern tragen das Angebot, ohne leeren Parameter", () => {
  const client = ohneKommentar(lies("api/client.js"));
  assert.ok(client.includes("export function getDraftPickupWindow(ceShipmentId, offerId)"));
  assert.ok(client.includes("const zusatz = angebot ? `&offerId=${encodeURIComponent(angebot)}` : \"\";"));
  assert.ok(client.includes("export function saveDraftPickupWindow({ ceShipmentId, offerId, pickupTimeFrom, pickupTimeUntil })"));
  assert.ok(client.includes("...(angebot ? { offerId: angebot } : {})"));
});
