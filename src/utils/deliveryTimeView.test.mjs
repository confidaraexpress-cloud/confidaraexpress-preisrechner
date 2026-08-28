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
  LIEFERFRIST_RASTER, deliveryDeadlineOptions,
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
                       "src/components/offers/OffersList.jsx",
                       "src/components/offers/ShipmentFilterBar.jsx"]) {
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
                       "src/components/offers/ShipmentFilterBar.jsx",
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
  // … und die Unterzeile entfällt GENAU dann, wenn das grüne Feld erscheint.
  assert.match(karte, /if \(zeitText && !earlyNote\) secondary\.push\(zeitText\);/);
  // Entscheidend: derselbe Wert steuert beides — earlyNote wird hereingereicht,
  // nicht in buildEnd neu berechnet. Sonst könnten Feld und Unterdrückung
  // auseinanderlaufen.
  assert.match(karte, /function buildEnd\(t, etaLabel, earlyNote\)/);
  assert.match(karte, /const earlyNote = earlyDeliveryNote\(t\);\n\s*const end\s*= buildEnd\(t, etaLabel, earlyNote\);/);
  assert.ok(!/buildEnd\([\s\S]{0,40}isEarlyDelivery/.test(karte),
    "buildEnd darf die Frühzeit nicht zweitklassifizieren");
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
  assert.match(q, /\{!hasDate && <p className="offers-time-hint"/, "der Hinweis erscheint nur ohne Datum");
  assert.match(q, /if \(!hasDate && open\) setOpen\(false\)/,
    "fällt das Datum weg, muss eine offene Liste schließen");
});

test("U3 — die Optionen sind „Beliebig“ plus Fristenraster und Tarifzeiten", () => {
  const q = lies(TIME_SELECT);
  assert.match(q, /const werte = \["", \.\.\.\(options \|\| \[\]\)\];/);
  assert.ok(!/"[0-2]\d:[0-5]\d"/.test(q), "keine hartcodierte Uhrzeit im Bauteil");
  // An echten Daten: Raster und Tarifzeiten zusammen, dedupliziert und sortiert.
  const werte = ["", ...deliveryDeadlineOptions(TARIFE_41)];
  assert.deepEqual(werte,
    ["", "08:00", "09:00", "10:00", "10:30", "12:00", "13:00", "16:00", "17:00", "18:00"]);
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
  // Beide Seiten benutzen genau diesen einen Formatierer — seit der Modularisierung
  // über die EINE gemeinsame Filterleiste (das frühere 222-Zeilen-Duplikat je Seite).
  assert.match(lies("src/components/offers/ShipmentFilterBar.jsx"), /latestDeliveryFieldValue\(/,
    "die gemeinsame Filterleiste formatiert das Feld");
  for (const seite of ["src/pages/NewShipmentPage.jsx", "src/pages/CalculatorPage.jsx"]) {
    assert.match(lies(seite), /<ShipmentFilterBar/, `${seite}: nutzt die gemeinsame Filterleiste nicht`);
  }
});

test("U6 — „Beliebig“ setzt die Uhrzeit auf \"\" und lässt das Datum stehen", () => {
  const q = lies(TIME_SELECT);
  // Der Leerwert IST „Beliebig" — es gibt keinen zweiten Rücksetzweg im Bauteil.
  assert.match(q, /const werte = \["", \.\.\.\(options \|\| \[\]\)\];/);
  assert.match(q, /const waehle = \(v\) => \{\n\s*onChange\(v\);/);
  // Das Datum wird vom Uhrzeit-Handler der Seiten nicht angefasst.
  for (const seite of ["src/pages/NewShipmentPage.jsx", "src/pages/CalculatorPage.jsx"]) {
    const h = lies(seite).match(/const handleLatestDeliveryTimeChange = \(zeit\) => \{[\s\S]*?\n  \};/);
    assert.ok(h, `${seite}: Uhrzeit-Handler fehlt`);
    assert.ok(!/latestDeliveryDate/.test(h[0]), `${seite}: der Uhrzeit-Handler fasst das Datum an`);
  }
});

test("U7 — ein Auswahlfeld auf dem vorhandenen Primitive, keine Pillenreihe mehr", () => {
  const q = lies(TIME_SELECT);
  assert.match(q, /className=\{`field-select offers-time-trigger/,
    "der Auslöser muss weiterhin wie das forms.css-Primitive aussehen");
  assert.ok(!/role="radio"/.test(q), "die frühere Radiogruppe ist ersetzt");
  assert.ok(!/<select/.test(nurCode(q)), "das native Select ist ersetzt");
  // Die abgelöste Komponente ist entfernt, nicht nur abgehängt.
  assert.ok(!existsSync(path.join(WURZEL, "src/components/offers/DeliveryTimeChips.jsx")),
    "DeliveryTimeChips.jsx muss gelöscht sein — keine tote Komponente");
  for (const datei of ["src/components/offers/OffersList.jsx",
                       "src/components/offers/ShipmentFilterBar.jsx"]) {
    assert.ok(!/DeliveryTimeChips/.test(lies(datei)), `${datei}: Restreferenz`);
    assert.match(lies(datei), /DeliveryTimeSelect/, `${datei}: nutzt das neue Feld nicht`);
  }
  // Die Seiten erreichen das Feld über die gemeinsame Filterleiste — direkt
  // referenzieren sie es nicht mehr (und die abgelöste Pillenreihe nirgends).
  for (const datei of ["src/pages/NewShipmentPage.jsx", "src/pages/CalculatorPage.jsx"]) {
    assert.ok(!/DeliveryTimeChips/.test(lies(datei)), `${datei}: Restreferenz`);
    assert.match(lies(datei), /<ShipmentFilterBar/, `${datei}: nutzt die gemeinsame Filterleiste nicht`);
  }
});

/* ══════════ N) Keine doppelte Lieferzeit in der Hauptansicht ══════════════ */

// Spiegel der Kartenregel: die graue Unterzeile entfällt GENAU dann, wenn das
// grüne Feld erscheint. Beides aus EINEM Wert — so kann die Anzeige nicht
// auseinanderlaufen.
const kartenZeilen = (t) => {
  const note = earlyDeliveryNote(t);
  const zeit = deliveryTimeLabel(t);
  return { grau: note ? "" : zeit, gruen: note };
};

test("N1 — 12:00: nur das grüne Feld, keine zusätzliche graue Zeile", () => {
  const z = kartenZeilen({ deliveryTimeUntil: "12:00", deliveryTimeUntilMinutes: 720 });
  assert.equal(z.gruen, "Lieferung bis 12:00 Uhr");
  assert.equal(z.grau, "", "die graue Uhrzeit darf nicht zusätzlich erscheinen");
  // Der Zeitwert steht in der Hauptansicht genau EINMAL.
  const treffer = [z.grau, z.gruen].filter((x) => x.includes("12:00"));
  assert.equal(treffer.length, 1);
});

test("N2 — 10:30 und 09:00 verhalten sich identisch", () => {
  for (const [zeit, min] of [["10:30", 630], ["09:00", 540], ["08:00", 480]]) {
    const z = kartenZeilen({ deliveryTimeUntil: zeit, deliveryTimeUntilMinutes: min });
    assert.equal(z.gruen, `Lieferung bis ${zeit} Uhr`);
    assert.equal(z.grau, "", zeit);
  }
});

test("N3 — 17:00 und 18:00 behalten ihre graue Zeile und bekommen kein Feld", () => {
  for (const [zeit, min] of [["17:00", 1020], ["18:00", 1080]]) {
    const z = kartenZeilen({ deliveryTimeUntil: zeit, deliveryTimeUntilMinutes: min });
    assert.equal(z.grau, `bis ${zeit} Uhr`, "die neutrale Zeile muss bleiben");
    assert.equal(z.gruen, "", zeit);
  }
});

test("N4 — FedEx First: grünes Feld, KEINE graue Doppelzeile", () => {
  const z = kartenZeilen({ shippingMode: "standard", deliveryTimeUntil: "10:00", deliveryTimeUntilMinutes: 600 });
  assert.equal(z.gruen, "Lieferung bis 10:00 Uhr");
  assert.equal(z.grau, "");
});

test("N5 — UPS Express Saver: nur die normale graue 17:00-Zeile", () => {
  const z = kartenZeilen({ shippingMode: "express", deliveryTimeUntil: "17:00", deliveryTimeUntilMinutes: 1020 });
  assert.equal(z.grau, "bis 17:00 Uhr");
  assert.equal(z.gruen, "");
});

test("N6 — an der echten Antwort: 22 Karten mit Feld, 19 mit grauer Zeile, nie beides", () => {
  let mitFeld = 0, mitGrau = 0;
  for (const t of TARIFE_41) {
    const z = kartenZeilen(t);
    assert.ok(!(z.grau && z.gruen), `${t.id}: zeigt die Uhrzeit doppelt`);
    assert.ok(z.grau || z.gruen, `${t.id}: verliert die Uhrzeit ganz`);
    if (z.gruen) mitFeld += 1; else mitGrau += 1;
  }
  assert.equal(mitFeld, 22);
  assert.equal(mitGrau, 19);
  assert.equal(mitFeld + mitGrau, 41, "keine Karte ohne Zeitangabe");
});

/* ══════════ D) Dropdown — Öffnungsrichtung, Ebene, Tastatur ═══════════════ */

test("D1 — die Liste öffnet IMMER nach unten, ohne Flip", () => {
  const q = lies(TIME_SELECT);
  assert.match(q, /const top = t\.bottom \+ ABSTAND;/, "die Oberkante hängt am Auslöser");
  // Kein Zweig, der bei Platzmangel nach oben klappt (anders als der
  // AddressPickerButton, der genau das tut).
  assert.ok(!/t\.top - ABSTAND - hoehe/.test(q), "Upward-Flip-Formel gefunden");
  assert.ok(!/passtUnten/.test(nurCode(q)), "Flip-Entscheidung gefunden");
});

test("D2 — bei wenig Platz wird die Liste niedriger und scrollt intern", () => {
  const q = lies(TIME_SELECT);
  assert.match(q, /const platz = window\.innerHeight - top - RAND;/);
  assert.match(q, /maxHeight: Math\.max\(MIN_HOEHE, Math\.min\(MAX_HOEHE, platz\)\)/);
  const css = lies("src/styles/offers.css");
  const regel = css.match(/\.offers-time-list\s*\{([^}]*)\}/);
  assert.ok(regel, ".offers-time-list muss definiert sein");
  assert.match(regel[1], /overflow-y:\s*auto/);
});

test("D3 — Portal an document.body gegen Clipping und transformierte Vorfahren", () => {
  const q = lies(TIME_SELECT);
  assert.match(q, /createPortal\(/);
  assert.match(q, /document\.body,/);
  const css = lies("src/styles/offers.css");
  const regel = css.match(/\.offers-time-list\s*\{([^}]*)\}/)[1];
  assert.match(regel, /position:\s*fixed/);
});

test("D4 — die Liste liegt auf der vorhandenen Schwebe-Ebene, kein Fantasiewert", () => {
  const css = lies("src/styles/offers.css");
  const regel = css.match(/\.offers-time-list\s*\{([^}]*)\}/)[1];
  const z = regel.match(/z-index:\s*(\d+)/);
  assert.ok(z, "die Liste braucht eine Ebene");
  const ebene = Number(z[1]);
  // Über den beiden Wirtsflächen (40 = Angebots-Dropdown, 50 = Formularfilter),
  // unter Drawer (999) und Navigationsleiste (1000).
  assert.ok(ebene > 50, `zu niedrig: ${ebene}`);
  assert.ok(ebene < 999, `zu hoch — Navigation und Modals müssen darüber bleiben: ${ebene}`);
  const abk = lies("src/styles/addressbook.css").match(/\.abk-pick-pop\s*\{([^}]*)\}/)[1];
  assert.equal(ebene, Number(abk.match(/z-index:\s*(\d+)/)[1]),
    "dieselbe Ebene wie die vorhandene schwebende Adressauswahl");
});

test("D5 — Combobox-Semantik statt Dialog", () => {
  const q = lies(TIME_SELECT);
  for (const attr of ['role="combobox"', 'aria-haspopup="listbox"', "aria-expanded={open}",
                      'role="listbox"', 'role="option"', "aria-selected=", "aria-activedescendant="]) {
    assert.ok(q.includes(attr), `${attr} fehlt`);
  }
  assert.ok(!/role="dialog"/.test(q), "keine falsche Dialogsemantik");
});

test("D6 — Tastatur vollständig: öffnen, navigieren, wählen, schließen", () => {
  const q = lies(TIME_SELECT);
  for (const taste of ["Enter", "ArrowDown", "ArrowUp", "Home", "End", "Tab", "Escape"]) {
    assert.ok(q.includes(`"${taste}"`), `${taste} wird nicht behandelt`);
  }
  assert.ok(/" "|Spacebar/.test(q), "Leertaste wird nicht behandelt");
  // Escape nativ am Umschlag — sonst schließt zuerst die umgebende Fläche.
  assert.match(q, /knoten\.addEventListener\("keydown", beiEscape\)/);
  assert.match(q, /e\.stopPropagation\(\)/);
  // Fokus kehrt zum Auslöser zurück.
  assert.match(q, /setOpen\(false\);\n\s*triggerRef\.current\?\.focus\(\);/);
});

test("D7 — Außenklick berücksichtigt den Umschlag UND die portalierte Liste", () => {
  const q = lies(TIME_SELECT);
  // Die Liste ist kein DOM-Nachfahre des Umschlags — beide Knoten müssen
  // getrennt geprüft werden, sonst schließt der erste Klick in die Liste sie.
  assert.match(q, /const imWrap = wrapRef\.current\?\.contains\(e\.target\);/);
  assert.match(q, /const inListe = listRef\.current\?\.contains\(e\.target\);/);
  assert.match(q, /if \(!imWrap && !inListe\) setOpen\(false\);/);
});

/* ══════════ Q) Quelle: nie das UTC-Rohfeld ════════════════════════════════ */

test("Q1 — es wird ausschließlich das normalisierte CE-Feldpaar gelesen", () => {
  for (const datei of ["src/utils/deliveryTimeView.mjs", "src/utils/offersFilterView.mjs",
                       OFFER_CARD, "src/components/offers/OffersList.jsx",
                       "src/components/offers/DeliveryTimeSelect.jsx",
                       "src/components/offers/ShipmentFilterBar.jsx",
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
