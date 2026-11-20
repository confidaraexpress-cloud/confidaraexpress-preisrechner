// offerSort — die EINE Ordnung der Angebote (Betreiberentscheidung E3, Masteranalyse Angebotskarten 2026-11-20).
// Synthetische Angebote: keine echten Preise, keine Providerdaten.
import test from "node:test";
import assert from "node:assert/strict";
import {
  sortOffers, compareFastest, deliveryRankOf, fastestOfferOf, cheapestOfferOf, DELIVERY_GROUP,
} from "./offerSort.mjs";
import { assignBadges } from "./offerBadges.js";

const angebot = (id, over = {}) => ({ offerId: id.padEnd(32, "0"), netPrice: 10, ...over });
const ids = (liste) => liste.map((o) => o.offerId.replace(/0+$/, ""));

// Die Masteranalyse: T5 kommt Mo. 23.11. an, J3/T2 erst Di. 24.11. — bei kürzerer Laufzeit stand J3 trotzdem vorn.
const T5 = angebot("t5", { transitDaysMin: 2, transitDaysMax: 2,
  deliveryProjection: { kind: "estimated", dateMin: "2026-11-23", dateMax: "2026-11-23", timeUntil: null } });
const J3 = angebot("j3", { transitDaysMin: 1, transitDaysMax: 1, deliveryDateMin: "2026-11-24", deliveryDateMax: "2026-11-24" });
const T2 = angebot("t2", { transitDaysMin: 1, transitDaysMax: 1,
  deliveryProjection: { kind: "estimated", dateMin: "2026-11-24", dateMax: "2026-11-24", timeUntil: null } });

test("(S1) Montag vor Dienstag — der Zustelltag entscheidet, nicht die Laufzeit", () => {
  assert.deepEqual(ids(sortOffers([J3, T2, T5], "fastest")), ["t5", "j3", "t2"]);
  assert.deepEqual(ids(sortOffers([T2, T5, J3], "fastest")), ["t5", "j3", "t2"], "die Eingabereihenfolge entscheidet nichts");
});

test("(S2) gleicher Tag: früheres Fensterende, dann früherer Anfang, dann belegte Uhrzeit — fehlende Uhrzeit ist nie Mitternacht", () => {
  const zeitraum = angebot("r", { deliveryDateMin: "2026-11-23", deliveryDateMax: "2026-11-24" });
  const tag = angebot("d", { deliveryDateMin: "2026-11-24", deliveryDateMax: "2026-11-24" });
  const mitUhrzeit = angebot("u", { deliveryDateMin: "2026-11-24", deliveryDateMax: "2026-11-24", deliveryTimeUntil: "10:30" });
  const ohneUhrzeit = angebot("o", { deliveryDateMin: "2026-11-24", deliveryDateMax: "2026-11-24", netPrice: 5 });
  // Gleiches Ende: der frühere Anfang (Zeitraum 23.–24.) steht vor dem Einzeltag 24.
  assert.deepEqual(ids(sortOffers([tag, zeitraum], "fastest")), ["r", "d"]);
  // Gleicher Tag: „bis 10:30" steht vor „irgendwann am Tag" — obwohl das zweite günstiger ist.
  assert.deepEqual(ids(sortOffers([ohneUhrzeit, mitUhrzeit], "fastest")), ["u", "o"]);
  assert.equal(deliveryRankOf(ohneUhrzeit).minutes, null);
  assert.equal(deliveryRankOf(mitUhrzeit).minutes, 630);
});

test("(S3) vergleichbare Prognose: günstiger zuerst, dann der stabile Schlüssel", () => {
  const a = angebot("a", { deliveryDateMin: "2026-11-23", netPrice: 12 });
  const b = angebot("b", { deliveryDateMin: "2026-11-23", netPrice: 9 });
  const c = angebot("c", { deliveryDateMin: "2026-11-23", netPrice: 9 });
  assert.deepEqual(ids(sortOffers([a, c, b], "fastest")), ["b", "c", "a"]);
  assert.deepEqual(ids(sortOffers([c, a, b], "fastest")), ["b", "c", "a"]);
});

test("(S4) Gruppen: datiert, dann reine Laufzeit (Rückfall), dann offen „ab …“, dann unbekannt — Unvollständiges nie vorn", () => {
  const datiert = angebot("dat", { deliveryDateMin: "2026-11-30", netPrice: 99 });
  const laufzeit = angebot("lz", { transitDaysMin: 1, transitDaysMax: 1, netPrice: 1 });
  const offen = angebot("off", { netPrice: 1,
    deliveryProjection: { kind: "estimated", dateMin: "2026-11-21", dateMax: null, timeUntil: null } });
  const unbekannt = angebot("unb", { netPrice: 1 });
  assert.deepEqual(ids(sortOffers([unbekannt, offen, laufzeit, datiert], "fastest")), ["dat", "lz", "off", "unb"]);
  assert.deepEqual([datiert, laufzeit, offen, unbekannt].map((o) => deliveryRankOf(o).group),
    [DELIVERY_GROUP.DATED, DELIVERY_GROUP.TRANSIT, DELIVERY_GROUP.OPEN, DELIVERY_GROUP.UNKNOWN]);
});

test("(S5) Preisordnungen: ohne Preis hinten, Gleichstand nach Zustellung; „recommended“ bleibt die Serverreihenfolge", () => {
  const spaet = angebot("sp", { netPrice: 9, deliveryDateMin: "2026-11-25" });
  const frueh = angebot("fr", { netPrice: 9, deliveryDateMin: "2026-11-23" });
  const ohne = angebot("oh", { netPrice: null, deliveryDateMin: "2026-11-20" });
  const teuer = angebot("te", { netPrice: 30, deliveryDateMin: "2026-11-24" });
  const liste = [spaet, ohne, teuer, frueh];
  const kopie = JSON.stringify(liste);
  assert.deepEqual(ids(sortOffers(liste, "cheapest")), ["fr", "sp", "te", "oh"]);
  assert.deepEqual(ids(sortOffers(liste, "priciest")), ["te", "fr", "sp", "oh"]);
  assert.equal(sortOffers(liste, "recommended"), liste);
  assert.equal(sortOffers(liste, "unbekannt"), liste);
  assert.equal(JSON.stringify(liste), kopie, "die Eingabe wurde verändert");
});

test("(S6) „Schnellste“: höchstens EIN Gewinner, nur aus datierten Angeboten, unabhängig von der Anzeigereihenfolge", () => {
  assert.equal(fastestOfferOf([J3, T2, T5]), T5);
  assert.equal(fastestOfferOf([T5]), null, "ein einzelnes datiertes Angebot ist kein Vergleich");
  const laufzeit = angebot("lz", { transitDaysMin: 1, transitDaysMax: 1 });
  assert.equal(fastestOfferOf([laufzeit, angebot("lz2", { transitDaysMin: 2, transitDaysMax: 2 })]), null);
  assert.equal(fastestOfferOf([laufzeit, T5, J3]), T5, "eine reine Laufzeit gewinnt nie gegen einen Zustelltag");
  assert.equal(cheapestOfferOf([angebot("x", { netPrice: null }), angebot("y")]), null);
  for (const reihe of [[J3, T2, T5], [T5, J3, T2], [T2, T5, J3]]) {
    const badges = assignBadges(reihe);
    assert.equal(badges.get(T5.offerId)?.label.includes("Schnellste"), true);
    assert.equal([...badges.values()].filter((b) => b.label.includes("Schnellste")).length, 1);
  }
});

test("(S7) keine Auszeichnung auf einer abgelaufenen oder gesperrten Karte", () => {
  const abgelaufen = new Set([T5.offerId]);
  const badges = assignBadges([J3, T2, T5], { isExpired: (o) => abgelaufen.has(o.offerId) });
  assert.equal(badges.has(T5.offerId), false);
  assert.equal(badges.get(J3.offerId)?.label.includes("Schnellste"), true, "der nächste Gewinner nach derselben Ordnung");
  const gesperrt = assignBadges([{ ...T5, bookable: false }, J3, T2]);
  assert.equal(gesperrt.has(T5.offerId), false);
  assert.equal(compareFastest(J3, T2) < 0, true, "gleicher Tag und Preis: der stabile Schlüssel entscheidet");
});
