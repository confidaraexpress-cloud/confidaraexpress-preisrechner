/* Der Abholtermin auf der gemeinsamen Karte — in der jeweils belegten Genauigkeit.
 *
 * Zwei Formen, die NICHT dasselbe sind:
 *
 *   echtes Von/Bis-Fenster   „13:00–17:00 Uhr"   (beide Grenzen geliefert)
 *   nur eine „bereit ab"-Zeit „bereit ab 13:00 Uhr" (der Abholvertrag kennt genau Tag und
 *                                                    „bereit ab" — es gibt dort KEIN
 *                                                    Endzeitfeld)
 *
 * Die zweite zu einem Fenster aufzurunden waere eine erfundene Zusage: aus „ab 13 Uhr"
 * folgt kein „bis 17 Uhr". Genau das misst diese Datei — in beide Richtungen:
 *
 *   1. Ein Angebot mit `collectionReadyFrom` zeigt „bereit ab …" und NIE ein Fenster.
 *   2. Ein Angebot mit echtem Fenster behaelt es unveraendert (keine Regression).
 *
 * Seit TG-22 steht die Regel in EINEM Helfer (`utils/pickupContractView.mjs`), den der
 * Startknoten der Timeline UND der Detailbereich der Karte lesen. Gemessen wird deshalb der
 * Helfer selbst — und am Quelltext, dass beide Stellen der Karte ihn benutzen.
 *
 * Kein Netz, kein Browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  pickupContractOf, pickupTimeText, pickupWindowDetailText,
} from "../../utils/pickupContractView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => fs.readFileSync(path.join(HIER, "..", "..", p), "utf8");
const ohneKommentar = (s) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const KARTE   = "components/offers/OfferCard.jsx";
const HELFER  = "utils/pickupContractView.mjs";
const SUMMARY = "components/booking/OfferSummaryModule.jsx";
const LIVE    = "components/booking/BookingLiveSummary.jsx";

/* Ein Abholangebot in GENAU der Feldmenge, die der Server fuer einen Abholvertrag ohne Fenster
   liefert: Kalendertag und „bereit ab"-Zeit, KEIN Fenster. */
const TG_PICKUP = Object.freeze({
  offerId: "a".repeat(32), publicCarrierId: "ups", publicServiceName: "Standard",
  serviceType: "pickup", transitDaysMin: 1, transitDaysMax: 2,
  netPrice: 12.34, vatAmount: 2.34, finalPrice: 14.68, currency: "EUR",
  bookable: true, unavailableReason: null,
  collectionDate: "2026-09-15", collectionReadyFrom: "09:00",
});
/* Dasselbe als Paketshopabgabe: dort entsteht kein Abholvertrag. */
const TG_DROPOFF = Object.freeze({
  ...TG_PICKUP, offerId: "b".repeat(32), publicCarrierId: "dpd",
  publicServiceName: "PaketShop", serviceType: "dropoff",
  collectionDate: null, collectionReadyFrom: null,
});
/* Ein Angebot mit echtem Carrier-Fenster. */
const MIT_FENSTER = Object.freeze({
  offerId: "c".repeat(32), publicCarrierId: "dhl", publicServiceName: "Expressversand",
  serviceType: "pickup", pickupDate: "2026-09-16",
  pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  netPrice: 12, vatAmount: 2.28, finalPrice: 14.28, currency: "EUR", bookable: true,
});

/* ══════════ §1  EIN ABHOLANGEBOT OHNE FENSTER ZEIGT SEINEN TERMIN ════════════ */

test("(1) ein Abholangebot ohne Fenster traegt Tag und „bereit ab\"-Zeit", () => {
  const v = pickupContractOf(TG_PICKUP);
  assert.equal(v.day, "2026-09-15");
  assert.equal(pickupTimeText(v), "bereit ab 09:00 Uhr");
  assert.equal(v.readyFrom, "09:00");
  assert.equal(v.windowFrom, null);
  assert.equal(v.windowUntil, null);
  assert.equal(pickupWindowDetailText(v), null, "aus einer „bereit ab\"-Zeit entstand ein Fenster");
});

test("(2) daraus entsteht NIEMALS ein Fenster", () => {
  const zeile = pickupTimeText(pickupContractOf(TG_PICKUP));
  assert.ok(!zeile.includes("–"), `die Zeile traegt einen Bis-Strich: ${zeile}`);
  assert.ok(!/\bbis\b/i.test(zeile), `die Zeile sagt „bis": ${zeile}`);
  assert.ok(!zeile.includes("17:00"), "es steht eine erfundene Endzeit in der Zeile");
});

test("(3) weder Helfer noch Karte kennen eine erfundene Endzeit im Quelltext", () => {
  for (const datei of [HELFER, KARTE]) {
    const code = ohneKommentar(lies(datei));
    // `collectionReadyFrom` darf in KEINER Zeile mit einem Bis-Wert kombiniert werden.
    for (const zeile of code.split("\n").filter((z) => z.includes("collectionReadyFrom"))) {
      assert.ok(!/pickupTimeUntil|readyUntil|collectionEnd/.test(zeile),
        `${datei}: die „bereit ab\"-Zeile wird zu einem Fenster ergaenzt: ${zeile.trim()}`);
    }
    // Und es gibt kein Feld dieses Namens.
    assert.ok(!/collectionReadyUntil|collectionEnd/.test(code), datei);
  }
});

/* ══════════ §4  PAKETSHOPABGABE ZEIGT KEINE ABHOLZEIT ════════════════════ */

test("(4) ein Paketshopangebot erzeugt weder Tag noch Zeit", () => {
  const v = pickupContractOf(TG_DROPOFF);
  assert.equal(v.day, null);
  assert.equal(pickupTimeText(v), null);
  assert.equal(pickupWindowDetailText(v), null);
});

/* ══════════ §5  FEHLENDE DATEN ERZEUGEN KEINE KAPUTTE ZEILE ══════════════ */

test("(5) fehlende Abholdaten ergeben keine Zeile, kein „undefined\", kein Trennzeichen", () => {
  for (const t of [null, undefined, {}, { serviceType: "pickup" },
                   { serviceType: "pickup", collectionDate: null, collectionReadyFrom: null },
                   { serviceType: "pickup", collectionDate: "2026-09-15" },
                   { serviceType: "pickup", collectionDate: "  ", collectionReadyFrom: "" },
                   { pickupTimeFrom: "09:00" }, { pickupTimeUntil: "17:00" }]) {
    const v = pickupContractOf(t);
    const tag = v.day, zeit = pickupTimeText(v), fenster = pickupWindowDetailText(v);
    for (const w of [tag, zeit, fenster]) {
      if (w === null) continue;
      assert.equal(typeof w, "string");
      assert.notEqual(w.trim(), "");
      for (const unfug of ["undefined", "null", "NaN"]) {
        assert.ok(!w.includes(unfug), `„${unfug}" in einer Abholzeile: ${w}`);
      }
    }
    // Ein halbes Fenster ist kein Fenster.
    if (t && (t.pickupTimeFrom || t.pickupTimeUntil) && !(t.pickupTimeFrom && t.pickupTimeUntil)) {
      assert.equal(fenster, null);
      assert.equal(zeit, null);
    }
  }
});

/* ══════════ §6  EIN ECHTES FENSTER BLEIBT UNVERAENDERT ═══════════════════ */

test("(6) ein Angebot mit echtem Fenster behaelt es — in beiden Schreibweisen", () => {
  const v = pickupContractOf(MIT_FENSTER);
  assert.equal(v.day, "2026-09-16");
  assert.equal(pickupTimeText(v), "09:00–17:00 Uhr");
  assert.equal(pickupWindowDetailText(v), "09:00 – 17:00 Uhr");
  assert.equal(v.readyFrom, null);
});

test("(7) das Fenster hat Vorrang vor der „bereit ab\"-Zeit", () => {
  // Traegt ein Angebot beides, gewinnt die PRAEZISERE Angabe. Die Reihenfolge steht so im
  // Quelltext und ist keine Zufaelligkeit der Auswertung hier.
  const beides = pickupContractOf({ ...MIT_FENSTER, collectionReadyFrom: "13:00" });
  assert.equal(pickupTimeText(beides), "09:00–17:00 Uhr");
  assert.equal(beides.readyFrom, null);
  for (const datei of [HELFER, SUMMARY, LIVE]) {
    const code = ohneKommentar(lies(datei));
    const iFenster = code.indexOf("pickupTimeUntil");
    const iAb      = code.indexOf("collectionReadyFrom");
    assert.ok(iFenster !== -1 && iAb !== -1, `${datei} kennt eine der beiden Formen nicht`);
    assert.ok(iFenster < iAb, `${datei} prueft die „bereit ab\"-Zeit VOR dem Fenster`);
  }
});

test("(8) das Abholdatum wird weiterhin zuerst aus `pickupDate` gelesen", () => {
  const helfer = ohneKommentar(lies(HELFER));
  assert.ok(/text\(t\.pickupDate\) \|\| text\(t\.collectionDate\)/.test(helfer),
    "die Reihenfolge der Datumsquellen wurde veraendert");
  assert.equal(pickupContractOf({ pickupDate: "2026-09-16", collectionDate: "2026-09-15" }).day, "2026-09-16");
});

/* ══════════ §9  TIMELINE, DETAILS UND ZUSAMMENFASSUNGEN ZEIGEN DASSELBE ══ */

test("(9) Timeline UND Detailbereich der Karte lesen denselben Helfer", () => {
  const karte = ohneKommentar(lies(KARTE));
  assert.ok(/from "\.\.\/\.\.\/utils\/pickupContractView\.mjs"/.test(karte), "die Karte importiert den Helfer nicht");
  const aufrufe = karte.match(/pickupContractOf\(t\)/g) || [];
  assert.ok(aufrufe.length >= 2, `die Karte liest den Abholvertrag nur an ${aufrufe.length} Stelle(n)`);
  // Die Karte bildet die beiden Abholzeilen nicht mehr selbst.
  assert.ok(!/t\.collectionReadyFrom|t\.pickupTimeFrom|t\.collectionDate/.test(karte),
    "die Karte liest Abholfelder wieder direkt statt ueber den Helfer");
  const start = karte.slice(karte.indexOf("function buildStart"), karte.indexOf("function buildEnd"));
  assert.ok(start.includes("pickupContractOf(t)") && start.includes("pickupTimeText("), "Timeline ohne Helfer");
  const details = karte.slice(karte.indexOf("function DetailsPanel"), karte.indexOf("function OfferCardBase"));
  assert.ok(details.includes("pickupContractOf(t)"), "Detailbereich ohne Helfer");
  assert.ok(details.includes("abholung.readyFrom &&"), "der Detailbereich zeigt die „bereit ab\"-Zeit nicht");
  for (const zeile of ['label="Abholtermin"', 'label="Zeitfenster"', 'label="Abholung"']) {
    assert.ok(details.includes(zeile), `Detailzeile ${zeile} fehlt`);
  }

  for (const datei of [HELFER, SUMMARY, LIVE]) {
    const code = ohneKommentar(lies(datei));
    assert.ok(code.includes("collectionDate"), `${datei} zeigt den Abholtag nicht`);
    assert.ok(code.includes("collectionReadyFrom"), `${datei} zeigt die Abholzeit nicht`);
    assert.ok(code.includes("bereit ab"), `${datei} benennt die „bereit ab\"-Zeit nicht`);
  }
});

/* ══════════ §10  WHITE LABEL ═════════════════════════════════════════════ */

test("(10) keine Abholdarstellung nennt die Einkaufsquelle", () => {
  for (const datei of [KARTE, HELFER, SUMMARY, LIVE]) {
    const code = ohneKommentar(lies(datei));
    for (const verboten of ["transglobal", "jumingo"]) {
      assert.ok(!code.toLowerCase().includes(verboten), `${datei} kennt „${verboten}"`);
    }
  }
  const v = pickupContractOf(TG_PICKUP);
  const roh = JSON.stringify({ tag: v.day, zeit: pickupTimeText(v) }).toLowerCase();
  for (const verboten of ["transglobal", "jumingo"]) {
    assert.ok(!roh.includes(verboten));
  }
});
