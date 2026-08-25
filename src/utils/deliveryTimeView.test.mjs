// ─── Lieferzeit-Darstellung: Hervorhebung, Texte, Uhrzeitoptionen ────────────
//
// Der Kern dieser Datei sind T3 und T4: sie beweisen, dass die Hervorhebung
// AUSSCHLIESSLICH an der Uhrzeit hängt und nicht an `shippingMode`. Beide Fälle
// stammen aus einer echten Antwort und widersprechen der Klassifizierung —
// genau deshalb sind sie hier festgehalten.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pruefeImTestlauf } from "../../scripts/governance.mjs";
import {
  FRUEHZUSTELLUNG_GRENZE_MINUTEN, normalizeDeliveryTime, deliveryTimeMinutes,
  isEarlyDelivery, deliveryTimeLabel, deliveryTimeOptions,
  deliveryTimeOptionLabel, latestDeliveryFieldValue, earlyDeliveryNote,
} from "./deliveryTimeView.mjs";
import { TARIFE_41 } from "./offersFilterFixture.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lies = (rel) => readFileSync(path.join(WURZEL, rel), "utf8");

// Kommentare weg, bevor gescannt wird: die Begründungen erklären genau die
// Begriffe, die im CODE verboten sind („delivery_time_until", „garantiert").
// Ein Scan über den Rohtext würde die Erklärung mit dem Verstoß verwechseln.
const nurCode = (q) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const OFFER_CARD = "src/components/offers/OfferCard.jsx";
const TIME_SELECT = "src/components/offers/DeliveryTimeSelect.jsx";

/* ══════════ T) Hervorhebung — datenbasiert, nie über shippingMode ══════════ */

test("T1 — 12:00 (720 Minuten) gilt als frühe Zustellzeit und wird hervorgehoben", () => {
  const t = { deliveryTimeUntil: "12:00", deliveryTimeUntilMinutes: 720 };
  assert.equal(isEarlyDelivery(t), true);
  assert.equal(deliveryTimeLabel(t), "bis 12:00 Uhr");
});

test("T2 — 17:00 (1020 Minuten) bleibt sichtbar, gilt aber NICHT als frühe Zeit", () => {
  const t = { deliveryTimeUntil: "17:00", deliveryTimeUntilMinutes: 1020 };
  assert.equal(isEarlyDelivery(t), false);
  // Ausdrücklich: der Tagesendwert wird nicht entfernt, nur nicht betont.
  assert.equal(deliveryTimeLabel(t), "bis 17:00 Uhr");
});

test("T3 — FedEx First: shippingMode „standard“, aber 10:00 → MUSS hervorgehoben werden", () => {
  // Belegter Fall aus der Antwort: `FEDEX FIRST®` enthält weder „express“ noch
  // „overnight“, der serverseitige Namens-Regex stuft ihn deshalb als
  // „standard“ ein — er stellt trotzdem bis 10:00 zu.
  const t = { shippingMode: "standard", deliveryTimeUntil: "10:00", deliveryTimeUntilMinutes: 600 };
  assert.equal(isEarlyDelivery(t), true, "shippingMode darf die Hervorhebung nicht verhindern");
});

test("T4 — UPS Express Saver: shippingMode „express“, aber 17:00 → KEINE frühe Zeit", () => {
  const t = { shippingMode: "express", deliveryTimeUntil: "17:00", deliveryTimeUntilMinutes: 1020 };
  assert.equal(isEarlyDelivery(t), false, "„express“ allein ist keine Zeitzusage");
});

test("T5 — die Hervorhebung liest shippingMode nirgends, auch nicht im Kartencode", () => {
  const modul = lies("src/utils/deliveryTimeView.mjs");
  const code = nurCode(modul);
  assert.ok(!/shippingMode/.test(code), "deliveryTimeView darf shippingMode nicht auswerten");
  // Und in der Karte hängt das Hinweisfeld an earlyDeliveryNote, nicht am Modus.
  const karte = lies(OFFER_CARD);
  assert.match(karte, /const earlyNote = earlyDeliveryNote\(t\);/);
  assert.ok(!/earlyNote[\s\S]{0,200}shippingMode/.test(karte));
});

test("T6 — die Grenze ist eine benannte Konstante, keine verstreute Magic Number", () => {
  assert.equal(FRUEHZUSTELLUNG_GRENZE_MINUTEN, 900, "900 Minuten = 15:00 Uhr");
  const karte = lies(OFFER_CARD);
  assert.ok(!/\b900\b/.test(karte), "die Schwelle darf nicht in der Karte stehen");
  for (const seite of ["src/pages/NewShipmentPage.jsx", "src/pages/CalculatorPage.jsx",
                       "src/components/offers/OffersList.jsx"]) {
    assert.ok(!/FRUEHZUSTELLUNG_GRENZE_MINUTEN\s*=/.test(lies(seite)), `${seite}: zweite Definition`);
  }
  // Sie ist ausdrücklich eine Darstellungsheuristik — der Kommentar sagt das.
  const modul = lies("src/utils/deliveryTimeView.mjs");
  assert.match(modul, /DARSTELLUNGSHEURISTIK/);
  assert.match(modul, /KEINE\s*\n?\s*\*?\s*Geschäftsregel|keine Carrierzusage/i);
});

test("T7 — die Schwelle trennt die gemessene Verteilung sauber: 22 früh, 19 Tagesende", () => {
  const frueh = TARIFE_41.filter(isEarlyDelivery);
  assert.equal(frueh.length, 22);
  assert.equal(TARIFE_41.length - frueh.length, 19);
  // Zwischen 13:00 (780) und 17:00 (1020) liegt kein einziger gemessener Wert —
  // die Grenze 900 fällt damit in eine echte Lücke, nicht mitten in die Daten.
  const werte = [...new Set(TARIFE_41.map(deliveryTimeMinutes))].sort((a, b) => a - b);
  assert.deepEqual(werte, [480, 540, 600, 630, 720, 780, 1020, 1080]);
  assert.ok(werte.every((w) => w <= 780 || w >= 1020));
});

/* ══════════ N) Normalisierung — der Filter vergleicht Strings ══════════════ */

test("N1 — „HH:MM“ bleibt, eine einstellige Stunde wird gepolstert", () => {
  assert.equal(normalizeDeliveryTime("12:00"), "12:00");
  assert.equal(normalizeDeliveryTime("9:00"), "09:00");
  assert.equal(normalizeDeliveryTime("08:30"), "08:30");
});

test("N2 — Unparsbares ergibt einen Leerstring und wird nie geraten", () => {
  for (const v of [null, undefined, "", "  ", "abc", "25:00", "12:75", 12, {}, []]) {
    assert.equal(normalizeDeliveryTime(v), "", String(v));
  }
});

test("N3 — 0 Minuten (Mitternacht) ist ein gültiger Wert, keine Falsy-Falle", () => {
  assert.equal(deliveryTimeMinutes({ deliveryTimeUntilMinutes: 0 }), 0);
  assert.equal(isEarlyDelivery({ deliveryTimeUntilMinutes: 0 }), true);
});

test("N4 — fehlt die Zahl, wird sie aus „HH:MM“ abgeleitet; fehlt beides, ist es null", () => {
  assert.equal(deliveryTimeMinutes({ deliveryTimeUntil: "10:30" }), 630);
  assert.equal(deliveryTimeMinutes({}), null);
  assert.equal(isEarlyDelivery({}), false, "ohne Zeitangabe wird nichts behauptet");
  assert.equal(deliveryTimeLabel({}), "");
});

/* ══════════ O) Uhrzeitoptionen — abgeleitet, nie hartcodiert ═══════════════ */

test("O1 — Optionen sind dedupliziert und aufsteigend sortiert", () => {
  const o = deliveryTimeOptions([
    { deliveryTimeUntil: "12:00" }, { deliveryTimeUntil: "10:30" },
    { deliveryTimeUntil: "12:00" }, { deliveryTimeUntil: "17:00" },
    { deliveryTimeUntil: "09:00" },
  ]);
  assert.deepEqual(o, ["09:00", "10:30", "12:00", "17:00"]);
});

test("O2 — Tarife ohne verwertbare Zeit werden übergangen, nicht ergänzt", () => {
  const o = deliveryTimeOptions([
    { deliveryTimeUntil: "12:00" }, { deliveryTimeUntil: null },
    {}, { deliveryTimeUntil: "" }, { deliveryTimeUntil: "kaputt" },
  ]);
  assert.deepEqual(o, ["12:00"]);
});

test("O3 — ohne Tarife gibt es keine Optionen (keine Rückfallliste)", () => {
  for (const v of [[], null, undefined, "nichts"]) assert.deepEqual(deliveryTimeOptions(v), []);
});

test("O4 — an der echten Antwort entstehen genau die vorkommenden acht Uhrzeiten", () => {
  assert.deepEqual(deliveryTimeOptions(TARIFE_41),
    ["08:00", "09:00", "10:00", "10:30", "12:00", "13:00", "17:00", "18:00"]);
  // Jede angebotene Option hat mindestens einen realen Tarif — eine Option mit
  // garantiert null Treffern behauptete eine Funktion, die es nicht gibt.
  for (const z of deliveryTimeOptions(TARIFE_41)) {
    assert.ok(TARIFE_41.some((t) => t.deliveryTimeUntil === z), z);
  }
});

test("O5 — keine feste Uhrzeitliste im Produktivcode", () => {
  for (const datei of ["src/components/offers/DeliveryTimeSelect.jsx",
                       "src/components/offers/OffersList.jsx",
                       "src/pages/NewShipmentPage.jsx", "src/pages/CalculatorPage.jsx"]) {
    const q = lies(datei);
    // Zeitliterale wie "14:00" dürften nur aus den Daten kommen.
    const treffer = (q.match(/"[0-2]\d:[0-5]\d"/g) || []).filter((x) => x !== '""');
    assert.deepEqual(treffer, [], `${datei}: hartcodierte Uhrzeit ${treffer.join(", ")}`);
  }
});

/* ══════════ C) Tarifkarte — neutrale Zeile + eigenes Hinweisfeld ══════════ */

test("C1 — frühe Zeit: neutrale Timeline UND zusätzliches Hinweisfeld", () => {
  const t = { deliveryTimeUntil: "10:30", deliveryTimeUntilMinutes: 630 };
  // Die normale Zeile nennt die Uhrzeit unverändert und neutral …
  assert.equal(deliveryTimeLabel(t), "bis 10:30 Uhr");
  // … und daneben entsteht die eigenständige Zusatzaussage.
  assert.equal(earlyDeliveryNote(t), "Lieferung bis 10:30 Uhr");
});

test("C2 — Tagesendwert: Uhrzeit sichtbar, aber KEIN Hinweisfeld", () => {
  for (const [zeit, min] of [["17:00", 1020], ["18:00", 1080]]) {
    const t = { deliveryTimeUntil: zeit, deliveryTimeUntilMinutes: min };
    assert.equal(deliveryTimeLabel(t), `bis ${zeit} Uhr`, "die Information bleibt erhalten");
    assert.equal(earlyDeliveryNote(t), "", `${zeit} darf kein Hinweisfeld erzeugen`);
  }
});

test("C3 — FedEx First: shippingMode „standard“, 10:00 → Hinweisfeld JA", () => {
  const t = { shippingMode: "standard", deliveryTimeUntil: "10:00", deliveryTimeUntilMinutes: 600 };
  assert.equal(earlyDeliveryNote(t), "Lieferung bis 10:00 Uhr");
});

test("C4 — UPS Express Saver: shippingMode „express“, 17:00 → Hinweisfeld NEIN", () => {
  const t = { shippingMode: "express", deliveryTimeUntil: "17:00", deliveryTimeUntilMinutes: 1020 };
  assert.equal(earlyDeliveryNote(t), "");
});

test("C5 — die normale Datumszeile trägt den früheren Inline-Stil nicht mehr", () => {
  const karte = lies(OFFER_CARD);
  assert.ok(!/offer-tl-time-early/.test(karte));
  // Datum ist wieder allein die primäre Information …
  assert.match(karte, /\{end\.primary && <span className="offer-tl-primary">\{end\.primary\}<\/span>\}/);
  // … und die Uhrzeit läuft für JEDEN Tarif über dieselbe Unterzeile.
  assert.match(karte, /if \(zeitText\) secondary\.push\(zeitText\);/);
  assert.ok(!/secondary\.push\(zeitText\)[\s\S]{0,80}frueh/.test(karte),
    "die Unterzeile darf nicht mehr von der Frühzeit abhängen");
});

test("C6 — das Hinweisfeld steht am Lieferende, nicht beim Preis oder Carrier", () => {
  const karte = lies(OFFER_CARD);
  const i = karte.indexOf("offer-early-note");
  assert.ok(i > 0, "das Hinweisfeld fehlt in der Karte");
  const zone3 = karte.indexOf("offer-zone-3");
  assert.ok(i < zone3, "es darf nicht in der Preis-/Aktionszone stehen");
  // Semantische Nähe: es steht innerhalb der Timeline, direkt nach den Knoten.
  const labels = karte.indexOf("offer-tl-labels");
  assert.ok(labels > 0 && labels < i, "es muss NACH den Timeline-Knoten stehen");
  // Aber NICHT im Endknoten selbst — dessen 1fr-Rasterspur würde sich sonst
  // verziehen und die Preisspalte verschieben.
  const endeKnoten = karte.indexOf('offer-tl-node--end');
  const knotenEndeSchluss = karte.indexOf("</div>", karte.indexOf("offer-tl-sub", endeKnoten));
  assert.ok(i > knotenEndeSchluss, "das Feld darf kein Kind des Endknotens sein");
});

/* ══════════ U) Uhrzeitauswahl — ein Feld statt vieler Pillen ══════════════ */

test("U1 — ohne Datum ist das Feld deaktiviert und nennt den Grund", () => {
  const q = lies(TIME_SELECT);
  assert.match(q, /disabled=\{!hasDate\}/);
  assert.match(q, /Erst ein Datum wählen/);
  // Der Grund ist für Screenreader mit dem Feld verbunden.
  assert.match(q, /aria-describedby=\{hasDate \? undefined : hinweisId\}/);
});

test("U2 — mit Datum ist das Feld bedienbar", () => {
  const q = lies(TIME_SELECT);
  assert.match(q, /\{!hasDate && \(/, "der Hinweis erscheint nur ohne Datum");
});

test("U3 — die Optionen sind „Beliebig“ plus die echten Tarifzeiten", () => {
  const q = lies(TIME_SELECT);
  assert.match(q, /const werte = \["", \.\.\.\(options \|\| \[\]\)\];/);
  assert.ok(!/"[0-2]\d:[0-5]\d"/.test(q), "keine hartcodierte Uhrzeit im Bauteil");
  // An echten Daten: genau die vorkommenden Zeiten, dedupliziert und sortiert.
  const werte = ["", ...deliveryTimeOptions(TARIFE_41)];
  assert.deepEqual(werte,
    ["", "08:00", "09:00", "10:00", "10:30", "12:00", "13:00", "17:00", "18:00"]);
});

test("U4 — der gewählte Wert erscheint als „10:30 Uhr“, gespeichert bleibt „10:30“", () => {
  assert.equal(deliveryTimeOptionLabel("10:30"), "10:30 Uhr");
  assert.equal(deliveryTimeOptionLabel(""), "Beliebig");
  // „Uhr“ ist reine Darstellung und steht nie im Datenwert.
  assert.equal(normalizeDeliveryTime("10:30"), "10:30");
});

test("U5 — das Formularfeld fasst Datum und Uhrzeit kompakt zusammen", () => {
  assert.equal(latestDeliveryFieldValue("Mi., 26. Aug.", "10:30"), "Mi., 26. Aug. · 10:30");
  assert.equal(latestDeliveryFieldValue("Mi., 26. Aug.", ""), "Mi., 26. Aug.");
  assert.equal(latestDeliveryFieldValue("", ""), "Beliebig");
  // Ohne Datum ist auch eine gesetzte Uhrzeit bedeutungslos.
  assert.equal(latestDeliveryFieldValue("", "10:30"), "Beliebig");
  // Beide Seiten benutzen genau diesen einen Formatierer.
  for (const seite of ["src/pages/NewShipmentPage.jsx", "src/pages/CalculatorPage.jsx"]) {
    assert.match(lies(seite), /latestDeliveryFieldValue\(/, seite);
  }
});

test("U6 — „Beliebig“ setzt die Uhrzeit auf \"\" und lässt das Datum stehen", () => {
  const q = lies(TIME_SELECT);
  // Der Leerwert IST „Beliebig" — es gibt keinen zweiten Rücksetzweg im Bauteil.
  assert.match(q, /onChange\(e\.target\.value\)/);
  assert.match(q, /value=\{v\}/);
  // Das Datum wird vom Uhrzeit-Handler der Seiten nicht angefasst.
  for (const seite of ["src/pages/NewShipmentPage.jsx", "src/pages/CalculatorPage.jsx"]) {
    const h = lies(seite).match(/const handleLatestDeliveryTimeChange = \(zeit\) => \{[\s\S]*?\n  \};/);
    assert.ok(h, `${seite}: Uhrzeit-Handler fehlt`);
    assert.ok(!/latestDeliveryDate/.test(h[0]), `${seite}: der Uhrzeit-Handler fasst das Datum an`);
  }
});

test("U7 — ein Auswahlfeld auf dem vorhandenen Primitive, keine Pillenreihe mehr", () => {
  const q = lies(TIME_SELECT);
  assert.match(q, /className="field-select offers-time-select"/,
    "das Feld muss das vorhandene forms.css-Primitive nutzen");
  assert.ok(!/role="radio"/.test(q), "die frühere Radiogruppe ist ersetzt");
  // Die abgelöste Komponente ist entfernt, nicht nur abgehängt.
  assert.ok(!existsSync(path.join(WURZEL, "src/components/offers/DeliveryTimeChips.jsx")),
    "DeliveryTimeChips.jsx muss gelöscht sein — keine tote Komponente");
  for (const datei of ["src/components/offers/OffersList.jsx",
                       "src/pages/NewShipmentPage.jsx", "src/pages/CalculatorPage.jsx"]) {
    assert.ok(!/DeliveryTimeChips/.test(lies(datei)), `${datei}: Restreferenz`);
    assert.match(lies(datei), /DeliveryTimeSelect/, `${datei}: nutzt das neue Feld nicht`);
  }
});

/* ══════════ Q) Quelle: nie das UTC-Rohfeld ════════════════════════════════ */

test("Q1 — es wird ausschließlich das normalisierte CE-Feldpaar gelesen", () => {
  for (const datei of ["src/utils/deliveryTimeView.mjs", "src/utils/offersFilterView.mjs",
                       OFFER_CARD, "src/components/offers/OffersList.jsx",
                       "src/components/offers/DeliveryTimeSelect.jsx",
                       "src/pages/NewShipmentPage.jsx", "src/pages/CalculatorPage.jsx"]) {
    const q = nurCode(lies(datei));
    assert.ok(!/delivery_time_until/.test(q),
      `${datei}: das JUMiNGO-Rohfeld liegt 120 Minuten daneben (UTC) und darf nie gelesen werden`);
    assert.ok(!/deliveryTimeUntilInMinutes/.test(q), `${datei}: Rohfeldname statt CE-Feld`);
  }
});

test("Q2 — kein Zusagewort in der sichtbaren Lieferzeit-Copy", () => {
  for (const datei of ["src/utils/deliveryTimeView.mjs", "src/utils/offersFilterView.mjs",
                       OFFER_CARD, "src/components/offers/OffersList.jsx",
                       "src/components/offers/DeliveryTimeSelect.jsx"]) {
    const q = nurCode(lies(datei));
    for (const wort of ["garantiert", "zugesichert", "Zusicherung zum", "fix bis"]) {
      // Erlaubt bleibt die Begründung IM Kommentar („niemals als Zusage“), nicht
      // aber ein solcher Begriff in einem Textliteral.
      const literale = q.match(/"[^"\n]*"|`[^`\n]*`/g) || [];
      assert.ok(!literale.some((l) => l.toLowerCase().includes(wort.toLowerCase())),
        `${datei}: „${wort}“ steht in einem Textliteral`);
    }
  }
});

test("Q3 — diese Testdatei läuft im Unit-Testlauf mit", () => {
  pruefeImTestlauf("src/utils/deliveryTimeView.test.mjs");
});
