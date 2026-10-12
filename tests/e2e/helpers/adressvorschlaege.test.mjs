// tests/e2e/helpers/adressvorschlaege.test.mjs — die Synchronisation auf die entprellten Adressvorschläge.
//
// Anlass: vatDisplayContract N7 schlug auf Frontend-main b03e778 fehl. Die Orts- und Straßenvorschläge der
// Formulareingabe (entprellt, 300 ms nach der letzten Änderung) liefen erst NACH dem Klick auf den
// MwSt.-Umschalter, weil die Angebote schneller als die Entprellzeit erschienen — und wurden dem Umschalter
// zugeschrieben. `adressvorschlaegeAbgeschlossen` wartet auf genau diese Anfragen. Diese Suite prüft die
// Wartelogik ohne Browser: eine Attrappe der Seite sendet dieselben Ereignisse wie Playwright.
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
const strassen = (a, street) => anfrage("/api/address/streets",
  { country: a.country, postalCode: a.zip, city: a.city, street });
const seite = () => new EventEmitter();
const offen = (p) => p.listenerCount("requestfinished") + p.listenerCount("requestfailed");
const mikro = () => new Promise((r) => setImmediate(r));

test("A1 — der Standardvorgang erwartet je Adresse Orte und Straßen, Straßenname ohne Hausnummer", () => {
  assert.deepEqual(erwarteteAdressvorschlaege().map((e) => [e.pfad, e.werte]), [
    ["/api/address/localities", { country: "DE", postalCode: "70173" }],
    ["/api/address/streets", { country: "DE", postalCode: "70173", city: "Berlin", street: "Hauptstrasse" }],
    ["/api/address/localities", { country: "DE", postalCode: "80331" }],
    ["/api/address/streets", { country: "DE", postalCode: "80331", city: "Muenchen", street: "Bahnhofstrasse" }],
  ]);
});

test("A2 — erfüllt erst, wenn alle vier Abfragen abgeschlossen sind; Reihenfolge egal", async () => {
  const p = seite();
  let erfuellt = false;
  const warten = adressvorschlaegeAbgeschlossen(p).then(() => { erfuellt = true; });
  p.emit("requestfinished", strassen(STANDARD_EMPFAENGER, "Bahnhofstrasse"));
  p.emit("requestfinished", orte(STANDARD_ABSENDER));
  p.emit("requestfinished", orte(STANDARD_EMPFAENGER));
  await mikro();
  assert.equal(erfuellt, false, "erfüllt, obwohl die Straßenabfrage des Absenders noch aussteht");
  p.emit("requestfinished", strassen(STANDARD_ABSENDER, "Hauptstrasse"));
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
  for (const r of [orte(STANDARD_ABSENDER), strassen(STANDARD_ABSENDER, "Hauptstrasse"),
                   orte(STANDARD_EMPFAENGER), strassen(STANDARD_EMPFAENGER, "Bahnhofstrasse")]) {
    p.emit("requestfinished", r);
  }
  await warten;
  assert.equal(erfuellt, true);
});

test("A4 — eine vom Formular abgebrochene Abfrage (requestfailed) gilt als abgeschlossen", async () => {
  const p = seite();
  const warten = adressvorschlaegeAbgeschlossen(p);
  p.emit("requestfailed", orte(STANDARD_ABSENDER));
  p.emit("requestfinished", strassen(STANDARD_ABSENDER, "Hauptstrasse"));
  p.emit("requestfailed", orte(STANDARD_EMPFAENGER));
  p.emit("requestfinished", strassen(STANDARD_EMPFAENGER, "Bahnhofstrasse"));
  await warten;
  assert.equal(offen(p), 0);
});

test("A5 — ohne abfragbare Adresse (Land ohne Prüfung, PLZ zu kurz) wird auf nichts gewartet", async () => {
  const p = seite();
  await adressvorschlaegeAbgeschlossen(p, {
    absender: { ...STANDARD_ABSENDER, country: "FR" },
    empfaenger: { ...STANDARD_EMPFAENGER, zip: "803" },
  });
  assert.equal(offen(p), 0);
});

test("A6 — Zeitlimit: lehnt mit den fehlenden Abfragen ab und entfernt die Beobachter", async () => {
  const p = seite();
  const warten = adressvorschlaegeAbgeschlossen(p, { timeout: 30 });
  p.emit("requestfinished", orte(STANDARD_ABSENDER));
  p.emit("requestfinished", strassen(STANDARD_ABSENDER, "Hauptstrasse"));
  await assert.rejects(warten, /Empfänger: Orte zu 80331, Empfänger: Straßen zu 80331/);
  assert.equal(offen(p), 0);
});
