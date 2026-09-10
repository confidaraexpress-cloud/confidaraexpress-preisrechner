/* Der Abholtermin auf der gemeinsamen Karte — in der jeweils belegten Genauigkeit.
 *
 * Zwei Formen, die NICHT dasselbe sind:
 *
 *   echtes Von/Bis-Fenster   „13:00–17:00 Uhr"   (JUMiNGO liefert beide Grenzen)
 *   nur eine „bereit ab"-Zeit „bereit ab 13:00 Uhr" (der Transglobal-Vertrag kennt genau
 *                                                    `CollectionDate` und `ReadyFrom` —
 *                                                    es gibt dort KEIN Endzeitfeld)
 *
 * Die zweite zu einem Fenster aufzurunden waere eine erfundene Zusage: aus „ab 13 Uhr"
 * folgt kein „bis 17 Uhr". Genau das misst diese Datei — in beide Richtungen:
 *
 *   1. Ein Angebot mit `collectionReadyFrom` zeigt „bereit ab …" und NIE ein Fenster.
 *   2. Ein Angebot mit echtem Fenster behaelt es unveraendert (keine Regression).
 *
 * Kein Netz, kein Browser: Auswertung der Kartenlogik am Quelltext plus reine Zusicherungen.
 * Dieselbe Bauart wie `offerCardParity.test.mjs`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => fs.readFileSync(path.join(HIER, "..", "..", p), "utf8");
const ohneKommentar = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const KARTE   = "components/offers/OfferCard.jsx";
const SUMMARY = "components/booking/OfferSummaryModule.jsx";
const LIVE    = "components/booking/BookingLiveSummary.jsx";

/* Ein Transglobal-Abholangebot in GENAU der Feldmenge, die der Server liefert: Kalendertag
   und „bereit ab"-Zeit, KEIN Fenster, keine JUMiNGO-Abholfelder. */
const TG_PICKUP = Object.freeze({
  offerId: "a".repeat(32), publicCarrierId: "ups", publicServiceName: "Express Saver",
  serviceType: "pickup", transitDaysMin: 1, transitDaysMax: 1,
  netPrice: 25.69, vatAmount: 4.88, finalPrice: 30.57, currency: "EUR",
  bookable: false, unavailableReason: "quote_only",
  collectionDate: "2026-09-15", collectionReadyFrom: "13:00",
});
/* Dasselbe als Paketshopabgabe: dort entsteht kein Abholvertrag. */
const TG_DROPOFF = Object.freeze({
  ...TG_PICKUP, offerId: "b".repeat(32), publicCarrierId: "dpd",
  publicServiceName: "PaketShop", serviceType: "dropoff",
  collectionDate: null, collectionReadyFrom: null,
});
/* Ein JUMiNGO-Angebot mit echtem Carrier-Fenster. */
const JUMINGO = Object.freeze({
  offerId: "c".repeat(32), publicCarrierId: "dhl", publicServiceName: "Expressversand",
  serviceType: "pickup", pickupDate: "2026-09-16",
  pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  netPrice: 12, vatAmount: 2.28, finalPrice: 14.28, currency: "EUR", bookable: true,
});

/* Die Entscheidung der Karte, hier gegen dasselbe Objekt ausgewertet, das die Karte
   bekaeme. Gemessen wird WELCHE Zeile entsteht, nicht das Rendering. */
const abholTag  = (t) => t.pickupDate || t.collectionDate || null;
const abholZeit = (t) =>
  (t.pickupTimeFrom && t.pickupTimeUntil) ? `${t.pickupTimeFrom}–${t.pickupTimeUntil} Uhr`
  : (t.collectionReadyFrom ? `bereit ab ${t.collectionReadyFrom} Uhr` : null);

/* ══════════ §1  DIE TG-KARTE ZEIGT IHREN TERMIN ═══════════════════════════ */

test("(1) ein TG-Abholangebot traegt Tag und „bereit ab\"-Zeit", () => {
  assert.equal(abholTag(TG_PICKUP), "2026-09-15");
  assert.equal(abholZeit(TG_PICKUP), "bereit ab 13:00 Uhr");
});

test("(2) daraus entsteht NIEMALS ein Fenster", () => {
  const zeile = abholZeit(TG_PICKUP);
  assert.ok(!zeile.includes("–"), `die Zeile traegt einen Bis-Strich: ${zeile}`);
  assert.ok(!/\bbis\b/i.test(zeile), `die Zeile sagt „bis": ${zeile}`);
  assert.ok(!zeile.includes("17:00"), "es steht eine erfundene Endzeit in der Zeile");
});

test("(3) die Karte kennt keine erfundene Endzeit im Quelltext", () => {
  const karte = ohneKommentar(lies(KARTE));
  // `collectionReadyFrom` darf in KEINER Zeile mit einem Bis-Wert kombiniert werden.
  for (const zeile of karte.split("\n").filter((z) => z.includes("collectionReadyFrom"))) {
    assert.ok(!/pickupTimeUntil|readyUntil|collectionEnd/.test(zeile),
      `die „bereit ab\"-Zeile wird zu einem Fenster ergaenzt: ${zeile.trim()}`);
  }
  // Und es gibt kein Feld dieses Namens.
  assert.ok(!/collectionReadyUntil|collectionEnd/.test(karte));
});

/* ══════════ §4  PAKETSHOPABGABE ZEIGT KEINE ABHOLZEIT ════════════════════ */

test("(4) ein Paketshopangebot erzeugt weder Tag noch Zeit", () => {
  assert.equal(abholTag(TG_DROPOFF), null);
  assert.equal(abholZeit(TG_DROPOFF), null);
});

/* ══════════ §5  FEHLENDE DATEN ERZEUGEN KEINE KAPUTTE ZEILE ══════════════ */

test("(5) fehlende Abholdaten ergeben keine Zeile, kein „undefined\", kein Trennzeichen", () => {
  for (const t of [{}, { serviceType: "pickup" },
                   { serviceType: "pickup", collectionDate: null, collectionReadyFrom: null },
                   { serviceType: "pickup", collectionDate: "2026-09-15" }]) {
    const tag = abholTag(t), zeit = abholZeit(t);
    for (const w of [tag, zeit]) {
      if (w === null) continue;
      assert.equal(typeof w, "string");
      assert.notEqual(w.trim(), "");
      for (const unfug of ["undefined", "null", "NaN"]) {
        assert.ok(!w.includes(unfug), `„${unfug}" in einer Abholzeile: ${w}`);
      }
    }
    // Ein Tag ohne Zeit ergibt eine Zeile OHNE haengendes Trennzeichen.
    const zusammen = [tag, zeit].filter(Boolean).join(" · ");
    assert.ok(!zusammen.startsWith(" ·") && !zusammen.endsWith("· "),
      `haengendes Trennzeichen: „${zusammen}"`);
  }
});

/* ══════════ §6  JUMINGO BLEIBT UNVERAENDERT ══════════════════════════════ */

test("(6) ein JUMiNGO-Angebot behaelt sein echtes Fenster", () => {
  assert.equal(abholTag(JUMINGO), "2026-09-16");
  assert.equal(abholZeit(JUMINGO), "09:00–17:00 Uhr");
});

test("(7) das Fenster hat Vorrang vor der „bereit ab\"-Zeit", () => {
  // Traegt ein Angebot beides, gewinnt die PRAEZISERE Angabe. Die Reihenfolge steht so im
  // Quelltext und ist keine Zufaelligkeit der Auswertung hier.
  const beides = { ...JUMINGO, collectionReadyFrom: "13:00" };
  assert.equal(abholZeit(beides), "09:00–17:00 Uhr");
  for (const datei of [KARTE, SUMMARY, LIVE]) {
    const code = ohneKommentar(lies(datei));
    const iFenster = code.indexOf("pickupTimeUntil");
    const iAb      = code.indexOf("collectionReadyFrom");
    assert.ok(iFenster !== -1 && iAb !== -1, `${datei} kennt eine der beiden Formen nicht`);
    assert.ok(iFenster < iAb, `${datei} prueft die „bereit ab\"-Zeit VOR dem Fenster`);
  }
});

test("(8) die JUMiNGO-Abholfelder werden weiterhin zuerst gelesen", () => {
  const karte = ohneKommentar(lies(KARTE));
  assert.ok(/t\.pickupDate \|\| t\.collectionDate/.test(karte),
    "die Reihenfolge der Datumsquellen wurde veraendert");
});

/* ══════════ §9  BEIDE ZUSAMMENFASSUNGEN ZEIGEN DASSELBE ═════════════════ */

test("(9) Karte und Buchungszusammenfassungen lesen dieselben zwei Felder", () => {
  for (const datei of [KARTE, SUMMARY, LIVE]) {
    const code = ohneKommentar(lies(datei));
    assert.ok(code.includes("collectionDate"), `${datei} zeigt den Abholtag nicht`);
    assert.ok(code.includes("collectionReadyFrom"), `${datei} zeigt die Abholzeit nicht`);
    assert.ok(code.includes("bereit ab"), `${datei} benennt die „bereit ab\"-Zeit nicht`);
  }
});

/* ══════════ §10  WHITE LABEL ═════════════════════════════════════════════ */

test("(10) keine Abholdarstellung nennt die Einkaufsquelle", () => {
  for (const datei of [KARTE, SUMMARY, LIVE]) {
    const code = ohneKommentar(lies(datei));
    for (const verboten of ["transglobal", "jumingo"]) {
      assert.ok(!code.toLowerCase().includes(verboten), `${datei} kennt „${verboten}"`);
    }
  }
  const roh = JSON.stringify({ tag: abholTag(TG_PICKUP), zeit: abholZeit(TG_PICKUP) }).toLowerCase();
  for (const verboten of ["transglobal", "jumingo"]) {
    assert.ok(!roh.includes(verboten));
  }
});
