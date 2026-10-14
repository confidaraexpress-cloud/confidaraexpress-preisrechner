// tests/e2e/helpers/adressvorschlaege.test.mjs — die Synchronisation auf die entprellten Adressvorschläge.
//
// Anlass: vatDisplayContract N7 schlug auf Frontend-main b03e778 fehl. Die Orts- und Straßenvorschläge der
// Formulareingabe (entprellt, 300 ms nach der letzten Änderung) liefen erst NACH dem Klick auf den
// MwSt.-Umschalter, weil die Angebote schneller als die Entprellzeit erschienen — und wurden dem Umschalter
// zugeschrieben. `adressvorschlaegeAbgeschlossen` wartet auf genau diese Anfragen. Diese Suite prüft die
// Wartelogik ohne Browser: eine Attrappe der Seite sendet dieselben Ereignisse wie Playwright.
//
// Seit der Geoapify-Umstellung (2026-10-14) gehören dazu: Orte zur PLZ, Vorschläge zur vollständigen
// Straßeneingabe (mit Hausnummer) und je Adresse eine automatische Gesamtprüfung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  adressvorschlaegeAbgeschlossen, erwarteteAdressvorschlaege, STANDARD_ABSENDER, STANDARD_EMPFAENGER,
} from "./newShipmentForm.mjs";

const API = "https://api.confidaraexpress.de";
const anfrage = (pfad, werte) => {
  const u = new URL(API + pfad);
  for (const [k, v] of Object.entries(werte)) u.searchParams.set(k, v);
  return { url: () => u.toString() };
};
const orte = (a) => anfrage("/api/address/localities", { country: a.country, postalCode: a.zip });
// PLZ und Ort hängen am Tempo der Eingabe — die Wartelogik darf sie nicht verlangen.
const strassen = (a, street = a.street, mitKontext = true) => anfrage("/api/address/streets",
  mitKontext ? { country: a.country, postalCode: a.zip, city: a.city, street } : { country: a.country, street });
const pruefung = () => anfrage("/api/address/validate", {});
const seite = () => new EventEmitter();
const offen = (p) => p.listenerCount("requestfinished") + p.listenerCount("requestfailed");
const mikro = () => new Promise((r) => setImmediate(r));

const ALLE = () => [
  orte(STANDARD_ABSENDER), strassen(STANDARD_ABSENDER), pruefung(),
  orte(STANDARD_EMPFAENGER), strassen(STANDARD_EMPFAENGER, STANDARD_EMPFAENGER.street, false), pruefung(),
];

test("A1 — der Standardvorgang erwartet je Adresse Orte, Vorschläge (mit Hausnummer) und eine Prüfung", () => {
  assert.deepEqual(erwarteteAdressvorschlaege().map((e) => [e.pfad, e.werte]), [
    ["/api/address/localities", { country: "DE", postalCode: "70173" }],
    ["/api/address/streets", { country: "DE", street: "Hauptstrasse 1" }],
    ["/api/address/validate", {}],
    ["/api/address/localities", { country: "DE", postalCode: "80331" }],
    ["/api/address/streets", { country: "DE", street: "Bahnhofstrasse 9" }],
    ["/api/address/validate", {}],
  ]);
});

test("A2 — erfüllt erst, wenn alle sechs Abfragen abgeschlossen sind; Reihenfolge egal", async () => {
  const p = seite();
  let erfuellt = false;
  const warten = adressvorschlaegeAbgeschlossen(p).then(() => { erfuellt = true; });
  const [o1, s1, v1, o2, s2, v2] = ALLE();
  for (const r of [s2, o1, v1, o2, v2]) p.emit("requestfinished", r);
  await mikro();
  assert.equal(erfuellt, false, "erfüllt, obwohl die Vorschlagsabfrage des Absenders noch aussteht");
  p.emit("requestfinished", s1);
  await warten;
  assert.equal(erfuellt, true);
  assert.equal(offen(p), 0, "Ereignisbeobachter nicht entfernt");
});

test("A3 — Zwischenstände und fremde Requests zählen nicht", async () => {
  const p = seite();
  let erfuellt = false;
  const warten = adressvorschlaegeAbgeschlossen(p).then(() => { erfuellt = true; });
  p.emit("requestfinished", anfrage("/api/address/localities", { country: "DE", postalCode: "7017" }));
  p.emit("requestfinished", strassen(STANDARD_ABSENDER, "Haupt"));
  p.emit("requestfinished", anfrage("/api/jumingo/calculate-price", {}));
  p.emit("requestfinished", { url: () => "kein-url" });
  await mikro();
  assert.equal(erfuellt, false);
  for (const r of ALLE()) p.emit("requestfinished", r);
  await warten;
  assert.equal(erfuellt, true);
});

test("A4 — eine vom Formular abgebrochene Abfrage (requestfailed) gilt als abgeschlossen", async () => {
  const p = seite();
  const warten = adressvorschlaegeAbgeschlossen(p);
  ALLE().forEach((r, i) => p.emit(i % 2 ? "requestfinished" : "requestfailed", r));
  await warten;
  assert.equal(offen(p), 0);
});

test("A5 — ohne Land wird auf nichts gewartet; eine zu kurze PLZ verlangt weder Orte noch Prüfung", async () => {
  const p = seite();
  await adressvorschlaegeAbgeschlossen(p, {
    absender: { ...STANDARD_ABSENDER, country: "" },
    empfaenger: { ...STANDARD_EMPFAENGER, country: "" },
  });
  assert.equal(offen(p), 0);
  assert.deepEqual(
    erwarteteAdressvorschlaege({ absender: null, empfaenger: { ...STANDARD_EMPFAENGER, zip: "803" } }).map((e) => e.pfad),
    ["/api/address/streets"], "Vorschläge ja (die Straße genügt), Orte und Prüfung erst mit gültiger PLZ");
});

test("A6 — Zeitlimit: lehnt mit den fehlenden Abfragen ab und entfernt die Beobachter", async () => {
  const p = seite();
  const warten = adressvorschlaegeAbgeschlossen(p, { timeout: 30 });
  const [o1, s1, v1] = ALLE();
  for (const r of [o1, s1, v1]) p.emit("requestfinished", r);
  await assert.rejects(warten, /Empfänger: Orte zu 80331, Empfänger: Straßen zu 80331, Empfänger: Adressprüfung/);
  assert.equal(offen(p), 0);
});
