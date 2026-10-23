// Ergebnisfilter der Angebotsliste — Zählung, Chip, Leerzustand, Zurücksetzen.
//
// Hintergrund (forensisch belegt): eine echte Antwort lieferte 41 Tarife, der
// Kunde hatte „Späteste Lieferzeit = 31.08.2026" gesetzt, es standen 21 Karten
// — und die Überschrift meldete unverändert „41 Angebote gefunden". Ursache
// war nicht die Filterregel (die ist korrekt), sondern die Zählung der aktiven
// Filter in OffersList, die ausschließlich `maxPrice` kannte.
//
// Die Tests decken beide Ebenen ab: die reine Auswertung (offersFilterView) und
// die Verdrahtung in den drei beteiligten Dateien. Die Verdrahtungstests sind
// nötig, weil die Filterregel selbst bewusst NICHT aus den Seiten herausgelöst
// wurde — ein reiner Modultest würde eine Kopie prüfen, nicht das Produkt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pruefeImTestlauf } from "../../scripts/governance.mjs";
import {
  activeResultFilterCount, hasActiveResultFilter, deliveryChipLabel,
  emptyFilterHint, applyResultFilters, offersCountLabel,
  deliveryDeadlineAssessment, deliveryDeadlineGroups, lateResultOffers, lateGroupToggleLabel,
  DEADLINE_GROUP_TEXT, DELIVERY_DEADLINE,
} from "./offersFilterView.mjs";
import { TARIFE_41 } from "./offersFilterFixture.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lies = (rel) => readFileSync(path.join(WURZEL, rel), "utf8");

const OFFERS_LIST = "src/components/offers/OffersList.jsx";
const SEITEN = ["src/pages/NewShipmentPage.jsx", "src/pages/CalculatorPage.jsx"];

// ── A) Kein Filter aktiv ─────────────────────────────────────────────────────

test("A1 — ohne Filter bleiben alle 41 Tarife sichtbar", () => {
  assert.equal(TARIFE_41.length, 41);
  const f = applyResultFilters(TARIFE_41, { maxPrice: "", latestDeliveryDate: "" });
  assert.equal(f.length, 41);
});

test("A2 — ohne Filter meldet die Zählung 0, die Überschrift zeigt die Gesamtzahl", () => {
  assert.equal(activeResultFilterCount({ maxPrice: "", latestDeliveryDate: "" }), 0);
  assert.equal(hasActiveResultFilter({ maxPrice: "", latestDeliveryDate: "" }), false);
  // Die Überschrift nennt jetzt ausschließlich die sichtbare Zahl.
  assert.match(lies(OFFERS_LIST), /offersCountLabel\(filtered\.length\)/);
});

test("A3 — ohne gesetztes Datum ist der Lieferzeit-Chip kein aktiver Filter", () => {
  assert.equal(deliveryChipLabel(""), "Lieferung");
  assert.equal(deliveryChipLabel(null), "Lieferung");
  assert.equal(deliveryChipLabel(undefined), "Lieferung");
  // „has-filter" hängt am Wert, nicht am Vorhandensein des Chips.
  assert.match(lies(OFFERS_LIST), /latestDeliveryDate \? " has-filter" : ""/);
});

// ── B) Nur Lieferzeitfilter — der belegte Produktionsfall ────────────────────

test("B1 — 41 Tarife, späteste Lieferzeit 31.08.2026 → genau 21 sichtbar", () => {
  const f = applyResultFilters(TARIFE_41, { latestDeliveryDate: "2026-08-31" });
  assert.equal(f.length, 21, "der im Audit gemessene Wert hat sich verändert");
});

test("B2 — die 21 sind exakt die im Screenshot sichtbaren, in derselben Reihenfolge", () => {
  const f = applyResultFilters(TARIFE_41, { latestDeliveryDate: "2026-08-31" });
  assert.deepEqual(f.slice(0, 14).map(t => t.id), [
    "3307", "3264", "3266", "3588", "3278", "3267", "4088",
    "3257", "3265", "3279", "3258", "4087", "3587", "3280",
  ]);
  assert.deepEqual(f.slice(0, 5).map(t => t.netPrice), [18.65, 25.72, 33.46, 35.46, 37.06]);
});

test("B3 — der günstigste Tarif fällt korrekt heraus und wird NICHT zurückgeholt", () => {
  // DPD Paketshop 5,71 € stellt laut Antwort erst am 02.09. zu. Bei einem
  // Filter auf den 31.08. MUSS er verschwinden — das ist richtiges Verhalten
  // und ausdrücklich nicht Gegenstand der Reparatur.
  const dpd = TARIFE_41.find(t => t.id === "s-2036");
  assert.equal(dpd.netPrice, 5.71);
  assert.equal(dpd.deliveryDateMax, "2026-09-02");
  const f = applyResultFilters(TARIFE_41, { latestDeliveryDate: "2026-08-31" });
  assert.equal(f.some(t => t.id === "s-2036"), false);
  // Sämtliche Shopabgabe-Tarife liefern später → keiner überlebt den Filter.
  assert.equal(f.some(t => t.serviceType === "dropoff"), false);
  assert.equal(TARIFE_41.filter(t => t.serviceType === "dropoff").length, 12);
});

test("B4 — der Lieferzeitfilter zählt jetzt als aktiver Filter und zeigt seinen Chip", () => {
  assert.equal(activeResultFilterCount({ maxPrice: "", latestDeliveryDate: "2026-08-31" }), 1);
  assert.equal(hasActiveResultFilter({ latestDeliveryDate: "2026-08-31" }), true);
  assert.equal(deliveryChipLabel("2026-08-31"), "Lieferung bis 31.08.2026");
});

test("B5 — die Überschrift lautet dann schlicht „21 Angebote“", () => {
  const f = applyResultFilters(TARIFE_41, { latestDeliveryDate: "2026-08-31" });
  assert.equal(offersCountLabel(f.length), "21 Angebote");
});

test("B6 — Singular: „1 Angebot“, nicht „1 Angebote“", () => {
  const f = applyResultFilters(TARIFE_41, { maxPrice: "19", latestDeliveryDate: "2026-08-31" });
  assert.equal(f.length, 1, "erwartet genau den DHL-Express-Tarif zu 18,65 €");
  assert.equal(f[0].id, "3307");
  assert.equal(offersCountLabel(f.length), "1 Angebot");
});

// ── C) Nur Preisfilter ───────────────────────────────────────────────────────

test("C1 — nur Preisfilter: korrekte Anzahl, Filter gilt als aktiv", () => {
  const f = applyResultFilters(TARIFE_41, { maxPrice: "20" });
  assert.equal(f.length, TARIFE_41.filter(t => t.netPrice <= 20).length);
  assert.equal(f.length, 9);
  assert.equal(activeResultFilterCount({ maxPrice: "20", latestDeliveryDate: "" }), 1);
  assert.equal(hasActiveResultFilter({ maxPrice: "20" }), true);
});

test("C2 — der Preisfilter allein blendet den Lieferzeit-Chip nicht ein", () => {
  assert.equal(deliveryChipLabel(""), "Lieferung");
});

// ── D) Beide Filter ──────────────────────────────────────────────────────────

test("D1 — beide Filter wirken gemeinsam, activeFilterCount ist 2", () => {
  const nurPreis = applyResultFilters(TARIFE_41, { maxPrice: "50" });
  const nurDatum = applyResultFilters(TARIFE_41, { latestDeliveryDate: "2026-08-31" });
  const beide    = applyResultFilters(TARIFE_41, { maxPrice: "50", latestDeliveryDate: "2026-08-31" });
  assert.ok(beide.length < nurPreis.length && beide.length < nurDatum.length);
  assert.deepEqual(beide.map(t => t.id), nurPreis.filter(t => nurDatum.some(d => d.id === t.id)).map(t => t.id));
  assert.equal(activeResultFilterCount({ maxPrice: "50", latestDeliveryDate: "2026-08-31" }), 2);
});

test("D2 — die Reihenfolge der Filter ändert das Ergebnis nicht, nichts wird mutiert", () => {
  const kopie = JSON.parse(JSON.stringify(TARIFE_41));
  applyResultFilters(TARIFE_41, { maxPrice: "50", latestDeliveryDate: "2026-08-31" });
  assert.deepEqual(TARIFE_41, kopie, "die Tarifliste wurde mutiert");
});

// ── E) Zurücksetzen ──────────────────────────────────────────────────────────

test("E1 — clearFilters leert BEIDE Ergebnisfilter, auf beiden Seiten", () => {
  for (const seite of SEITEN) {
    const q = lies(seite);
    const block = q.match(/const clearFilters = \(\) => \{[\s\S]*?\n  \};/);
    assert.ok(block, `${seite}: clearFilters nicht gefunden`);
    assert.match(block[0], /upd\("max_price", ""\)/, seite);
    assert.match(block[0], /upd\("latestDeliveryDate", ""\)/, `${seite}: latestDeliveryDate wird nicht zurückgesetzt`);
  }
});

test("E2 — Zurücksetzen erzeugt KEINEN neuen /calculate-price-Request", () => {
  for (const seite of SEITEN) {
    const q = lies(seite);
    // `upd` invalidiert nur für Felder AUSSERHALB von FILTER_ONLY_FIELDS.
    assert.match(q, /if \(!FILTER_ONLY_FIELDS\.has\(k\)\) invalidateResults\(\);/, seite);
    const set = q.match(/const FILTER_ONLY_FIELDS = new Set\(\[([^\]]*)\]\)/);
    assert.ok(set, `${seite}: FILTER_ONLY_FIELDS nicht gefunden`);
    assert.match(set[1], /"max_price"/, seite);
    assert.match(set[1], /"latestDeliveryDate"/, `${seite}: latestDeliveryDate fehlt → Zurücksetzen würde neu berechnen`);
    // clearFilters darf weder direkt berechnen noch invalidieren.
    const block = q.match(/const clearFilters = \(\) => \{[\s\S]*?\n  \};/)[0];
    assert.doesNotMatch(block, /calculate\(|invalidateResults\(|fetch\(/, seite);
  }
});

test("E3 — nach dem Zurücksetzen ist wieder die vollständige Tarifliste sichtbar", () => {
  const gefiltert = applyResultFilters(TARIFE_41, { maxPrice: "20", latestDeliveryDate: "2026-08-31" });
  assert.ok(gefiltert.length < 41);
  const zurueck = applyResultFilters(TARIFE_41, { maxPrice: "", latestDeliveryDate: "" });
  assert.deepEqual(zurueck.map(t => t.id), TARIFE_41.map(t => t.id));
});

test("E4 — der Zurücksetzen-Knopf hängt an hasFilter, nicht am Preisfilter", () => {
  const q = lies(OFFERS_LIST);
  assert.match(q, /\{hasFilter && \(\s*<button className="offers-filter-reset-btn"/);
});

// ── F) Leerzustand ───────────────────────────────────────────────────────────

test("F1 — nur Preisfilter: der Text nennt den Preis", () => {
  const t = emptyFilterHint({ maxPrice: "5", latestDeliveryDate: "" });
  assert.match(t, /Preislimit/);
  assert.doesNotMatch(t, /Lieferzeit|zustellt|stellt/);
});

test("F2 — nur Lieferzeitfilter: der Text nennt die Lieferzeit MIT Datum, nie den Preis", () => {
  const t = emptyFilterHint({ maxPrice: "", latestDeliveryDate: "2026-08-31" });
  assert.match(t, /31\.08\.2026/);
  assert.match(t, /spätere Lieferzeit/);
  assert.doesNotMatch(t, /Preis/, "der alte Text nannte fälschlich den Preisfilter");
});

test("F3 — beide Filter: ein allgemeiner Hinweis ohne technische Sprache", () => {
  const t = emptyFilterHint({ maxPrice: "5", latestDeliveryDate: "2026-08-31" });
  assert.equal(t, "Keine Angebote entsprechen den aktuell gesetzten Filtern.");
});

test("F4 — ohne Filter bleibt ein neutraler Satz, nie eine leere Fläche", () => {
  assert.ok(emptyFilterHint({}).length > 0);
  assert.ok(emptyFilterHint().length > 0);
});

test("F5 — der Leerzustand bietet „Filter zurücksetzen“ an", () => {
  const q = lies(OFFERS_LIST);
  const block = q.match(/filtered\.length === 0 && \([\s\S]*?\n        \)\}/);
  assert.ok(block, "Leerzustand-Block nicht gefunden");
  assert.match(block[0], /\{emptyFilterHint\}/, "der Leerzustand nutzt den abgeleiteten Text nicht");
  assert.match(block[0], /Filter zurücksetzen/);
  assert.match(block[0], /onClick=\{onClearFilters\}/);
  assert.doesNotMatch(block[0], /Erhöhen Sie das Preislimit oder entfernen Sie den Filter\./,
    "der pauschale Preis-Text steht noch im Leerzustand");
});

// ── G) Beide Einstiegsseiten ─────────────────────────────────────────────────

test("G1 — beide Seiten reichen den Lieferzeitfilter an OffersList durch", () => {
  for (const seite of SEITEN) {
    const q = lies(seite);
    assert.match(q, /latestDeliveryDate=\{form\.latestDeliveryDate\}/, seite);
    assert.match(q, /onLatestDeliveryChange=\{handleLatestDeliveryChange\}/, seite);
    assert.match(q, /latestDeliveryTime=\{form\.latestDeliveryTime\}/, seite);
    assert.match(q, /onLatestDeliveryTimeChange=\{handleLatestDeliveryTimeChange\}/, seite);
    assert.match(q, /deliveryTimeOptions=\{zeitOptionen\}/, seite);
    assert.match(q, /shippingDate=\{shippingDate\}/, `${seite}: minDate für den Kalender fehlt`);
  }
});

test("G2 — es gibt nur noch EINE Filterregel, und beide Seiten importieren sie", () => {
  // Vorher stand die Regel dreimal im Repository (zwei Seiten + Testspiegel) und
  // ein Zeichenvergleich hielt sie zusammen. Mit der Uhrzeit als zweiter
  // Dimension ist Zentralisierung die belastbarere Zusicherung: die Seiten
  // dürfen GAR KEINE eigene Regel mehr enthalten.
  for (const seite of SEITEN) {
    const q = lies(seite);
    assert.match(q, /import \{ applyResultFilters, lateResultOffers, deliveryDeadlineAssessment, DELIVERY_DEADLINE \}\s*from "\.\.\/utils\/offersFilterView\.mjs";/,
      `${seite}: die zentrale Filterregel wird nicht importiert`);
    assert.match(q, /applyResultFilters\(tariffs, \{/,
      `${seite}: die zentrale Filterregel wird nicht aufgerufen`);
    assert.ok(!/f = f\.filter\(t => \{[\s\S]*?deliveryDateMax/.test(q),
      `${seite}: enthält wieder eine eigene Kopie der Lieferzeitregel`);
    assert.ok(!/t\.netPrice <= Number\(/.test(q),
      `${seite}: enthält wieder eine eigene Kopie der Preisregel`);
  }
});

test("G3 — die Uhrzeit ist ein reiner Anzeigefilter und löst nie eine Neuberechnung aus", () => {
  for (const seite of SEITEN) {
    const q = lies(seite);
    const menge = q.match(/const FILTER_ONLY_FIELDS = new Set\(\[([^\]]*)\]\)/);
    assert.ok(menge, `${seite}: FILTER_ONLY_FIELDS fehlt`);
    assert.match(menge[1], /"latestDeliveryTime"/,
      `${seite}: ohne diesen Eintrag ruft upd() invalidateResults() und verwirft die Tarife`);
    assert.match(menge[1], /"latestDeliveryDate"/, seite);
    assert.match(menge[1], /"max_price"/, seite);
    // Der Recalc-Schlüssel beschreibt die PAYLOAD — kein Anzeigefilter darin.
    const key = q.match(/calcKeyRef\.current = JSON\.stringify\(\{[\s\S]*?\n  \}\);/);
    assert.ok(key, `${seite}: calcKeyRef nicht gefunden`);
    assert.ok(!/latestDelivery/.test(key[0]), `${seite}: Anzeigefilter im Recalc-Schlüssel`);
    assert.ok(!/max_price/.test(key[0]), `${seite}: Preisfilter im Recalc-Schlüssel`);
  }
});

/* ══════════ F) Uhrzeitfilter — Datum UND Uhrzeit ═══════════════════════════ */

test("F1 — nur Datum: unverändertes Verhalten, die Uhrzeit ändert nichts", () => {
  const ohne = applyResultFilters(TARIFE_41, { latestDeliveryDate: "2026-08-31" });
  const leer = applyResultFilters(TARIFE_41, { latestDeliveryDate: "2026-08-31", latestDeliveryTime: "" });
  assert.equal(ohne.length, 21, "der im Audit gemessene Wert hat sich verändert");
  assert.deepEqual(leer.map((t) => t.id), ohne.map((t) => t.id));
  for (const v of [null, undefined, "kaputt"]) {
    assert.deepEqual(
      applyResultFilters(TARIFE_41, { latestDeliveryDate: "2026-08-31", latestDeliveryTime: v }).map((t) => t.id),
      ohne.map((t) => t.id), String(v));
  }
});

// Die fünf fachlichen Fälle des Paarvergleichs, jeder einzeln benannt.
const ZEITFAELLE = [
  { id: "a", deliveryDateMax: "2026-08-31", deliveryTimeUntil: "10:00", sichtbar: true,
    warum: "früher am Stichtag" },
  { id: "b", deliveryDateMax: "2026-08-31", deliveryTimeUntil: "12:00", sichtbar: true,
    warum: "exakt zur Frist — die Grenze ist einschließend" },
  { id: "c", deliveryDateMax: "2026-08-31", deliveryTimeUntil: "13:00", sichtbar: false,
    warum: "später am Stichtag" },
  { id: "d", deliveryDateMax: "2026-09-01", deliveryTimeUntil: "09:00", sichtbar: false,
    warum: "früh, aber einen Tag zu spät" },
  { id: "e", deliveryDateMax: "2026-08-30", deliveryTimeUntil: "17:00", sichtbar: true,
    warum: "Tagesendwert, aber einen Tag früher — schlägt die Frist nachweislich" },
];

test("F2 — Datum + 12:00 vergleicht das PAAR (Tag, Uhrzeit)", () => {
  const f = applyResultFilters(ZEITFAELLE, {
    latestDeliveryDate: "2026-08-31", latestDeliveryTime: "12:00",
  });
  const sichtbar = f.map((t) => t.id);
  for (const fall of ZEITFAELLE) {
    assert.equal(sichtbar.includes(fall.id), fall.sichtbar, `${fall.id}: ${fall.warum}`);
  }
  assert.deepEqual(sichtbar, ["a", "b", "e"]);
});

test("F3 — ohne verwertbare Uhrzeit am Stichtag: SICHTBAR und nicht bewertbar (K2), nie „erfüllt“", () => {
  // Betreiberentscheidung K2 (2026-10-02): fehlende Evidenz ist kein Ausschlussgrund. Bis Block B fielen diese
  // Tarife heraus (fail-safe); jetzt bleiben sie stehen und tragen den neutralen Hinweis. Es wird weiterhin
  // weder „Tagesende“ noch „erfüllt die Frist“ unterstellt — die Bewertung lautet ausdrücklich „not_assessable“.
  const ohneZeit = [
    { id: "null", deliveryDateMax: "2026-08-31", deliveryTimeUntil: null },
    { id: "leer", deliveryDateMax: "2026-08-31", deliveryTimeUntil: "" },
    { id: "murks", deliveryDateMax: "2026-08-31", deliveryTimeUntil: "abc" },
    { id: "fehlt", deliveryDateMax: "2026-08-31" },
  ];
  const frist = { latestDeliveryDate: "2026-08-31", latestDeliveryTime: "12:00" };
  assert.deepEqual(applyResultFilters(ohneZeit, frist).map((t) => t.id), ["null", "leer", "murks", "fehlt"]);
  for (const t of ohneZeit) assert.equal(deliveryDeadlineAssessment(t, frist), "not_assessable", t.id);
  // Ohne gesetzte Uhrzeit sind sie bewertbar — der Tag genügt — und bleiben wie bisher sichtbar.
  assert.equal(applyResultFilters(ohneZeit, { latestDeliveryDate: "2026-08-31" }).length, 4);
  for (const t of ohneZeit) assert.equal(deliveryDeadlineAssessment(t, { latestDeliveryDate: "2026-08-31" }), "met", t.id);
});

test("F3a — ohne Uhrzeit, aber an einem anderen Tag: der Tag allein entscheidet nachweislich", () => {
  const frist = { latestDeliveryDate: "2026-08-31", latestDeliveryTime: "12:00" };
  const frueher = { id: "frueher", deliveryDateMax: "2026-08-30", deliveryTimeUntil: null };
  const spaeter = { id: "spaeter", deliveryDateMax: "2026-09-01", deliveryTimeUntil: null };
  assert.equal(deliveryDeadlineAssessment(frueher, frist), "met", "einen Tag früher hält jede Uhrzeit ein");
  assert.equal(deliveryDeadlineAssessment(spaeter, frist), "too_late", "einen Tag später ist nachweislich zu spät");
  assert.deepEqual(applyResultFilters([frueher, spaeter], frist).map((t) => t.id), ["frueher"]);
});

test("F3b — fehlt das Lieferdatum selbst: sichtbar wie bisher, jetzt ausdrücklich nicht bewertbar", () => {
  const ohneDatum = [{ id: "x", deliveryTimeUntil: "17:00" }];
  assert.equal(applyResultFilters(ohneDatum, { latestDeliveryDate: "2026-08-31" }).length, 1);
  assert.equal(
    applyResultFilters(ohneDatum, { latestDeliveryDate: "2026-08-31", latestDeliveryTime: "12:00" }).length, 1,
    "ein Tarif ohne Anbieterdatum fällt nie heraus");
  for (const zeit of [undefined, "12:00"]) {
    assert.equal(deliveryDeadlineAssessment(ohneDatum[0], { latestDeliveryDate: "2026-08-31", latestDeliveryTime: zeit }),
      "not_assessable", String(zeit));
  }
});

/* ══════════ K) Fehlende Evidenz — seit TG-L2 die Gruppe „Frist nicht bestätigt" ═════ */

test("K1 — ohne Lieferzeitfilter: keine Bewertung, keine Gruppen — auch nicht bei fehlenden Daten", () => {
  const ohneDaten = { id: "tg", deliveryDate: null, deliveryDateMax: null, deliveryTimeUntil: null };
  for (const filter of [{}, { latestDeliveryDate: "" }, { latestDeliveryDate: null }, { latestDeliveryTime: "12:00" }]) {
    assert.equal(deliveryDeadlineAssessment(ohneDaten, filter), null, JSON.stringify(filter));
    assert.equal(deliveryDeadlineGroups([ohneDaten], filter), null, JSON.stringify(filter));
    assert.deepEqual(lateResultOffers([ohneDaten], filter), [], JSON.stringify(filter));
  }
  // Der frühere Kartenhinweis ist entfallen — die Gruppe „Frist nicht bestätigt" trägt die Aussage.
  for (const datei of ["src/utils/offersFilterView.mjs", OFFERS_LIST, "src/components/offers/OfferCard.jsx",
                       "src/styles/offers.css", ...SEITEN]) {
    const ohneKommentar = lies(datei).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/offer-deadline-note|DELIVERY_NOT_ASSESSABLE_TEXT|deliveryDeadlineNotAssessable/.test(ohneKommentar), datei);
  }
});

test("K2 — Transglobal-Zeitprodukte: eine Prognose zählt als „voraussichtlich“; keine Uhrzeit aus dem Namen", () => {
  // Der Tarifname nennt eine Uhrzeit — sie zählt nie. Zählt, was der Server liefert: die Prognose (Tage, eine belegte
  // Uhrzeit nur in `timeUntil`). Ohne Prognose und ohne Anbieterdatum ist die Frist nicht bestätigt.
  const tg = [
    { offerId: "tg85", publicServiceName: "Domestic Express 9:00", deliveryDate: null, deliveryDateMax: null,
      deliveryProjection: { kind: "estimated", dateMin: "2026-08-25", dateMax: "2026-08-25", timeUntil: null } },
    { offerId: "tg87", publicServiceName: "Domestic Express 12:00", deliveryDate: null, deliveryDateMax: null },
    { offerId: "tg48", publicServiceName: "Express 10:00", deliveryDate: null, deliveryDateMax: null, deliveryTimeUntil: null },
  ];
  const erwartet = [
    [{ latestDeliveryDate: "2026-08-25" }, { tg85: "projected", tg87: "not_assessable", tg48: "not_assessable" }],
    [{ latestDeliveryDate: "2026-08-25", latestDeliveryTime: "10:00" },
      { tg85: "not_assessable", tg87: "not_assessable", tg48: "not_assessable" }],
    [{ latestDeliveryDate: "2026-08-20", latestDeliveryTime: "08:00" },
      { tg85: "too_late", tg87: "not_assessable", tg48: "not_assessable" }],
  ];
  for (const [frist, je] of erwartet) {
    for (const t of tg) assert.equal(deliveryDeadlineAssessment(t, frist), je[t.offerId], `${t.offerId} ${JSON.stringify(frist)}`);
    assert.deepEqual(applyResultFilters(tg, frist).map((t) => t.offerId),
      tg.filter((t) => je[t.offerId] !== "too_late").map((t) => t.offerId), JSON.stringify(frist));
  }
});

test("K3 — belegte Anbieterdaten filtern wie bisher; nur „too_late“ fällt heraus", () => {
  const frist = { latestDeliveryDate: "2026-08-31", latestDeliveryTime: "12:00" };
  const erwartet = { a: "met", b: "met", c: "too_late", d: "too_late", e: "met" };
  for (const fall of ZEITFAELLE) assert.equal(deliveryDeadlineAssessment(fall, frist), erwartet[fall.id], fall.warum);
  // Ein unbrauchbarer Liefertag ist keine vergleichbare Zusage — sichtbar mit Hinweis statt Zeichenvergleich.
  for (const dd of ["31.08.2026", "2026-8-31", "morgen", 42]) {
    assert.equal(deliveryDeadlineAssessment({ deliveryDateMax: dd, deliveryTimeUntil: "10:00" }, frist), "not_assessable", String(dd));
  }
  // `deliveryDateMax` vor `deliveryDate` — derselbe späteste Liefertag wie bisher.
  assert.equal(deliveryDeadlineAssessment({ deliveryDate: "2026-08-29", deliveryDateMax: "2026-09-02" },
    { latestDeliveryDate: "2026-08-31" }), "too_late");
});

test("K4 — der Filter mutiert nichts und erfindet kein Tariffeld", () => {
  const tarife = [
    { id: 1, deliveryDateMax: "2026-08-31", deliveryTimeUntil: null },
    { id: 2, deliveryDateMax: null },
    { id: 3, deliveryDateMax: "2026-09-02", deliveryTimeUntil: "12:00" },
  ];
  const vorher = JSON.stringify(tarife);
  const f = applyResultFilters(tarife, { latestDeliveryDate: "2026-08-31", latestDeliveryTime: "12:00" });
  assert.equal(JSON.stringify(tarife), vorher, "die Eingabe wurde verändert");
  assert.deepEqual(f.map((t) => t.id), [1, 2]);
  assert.ok(f.every((t) => tarife.includes(t)), "der Filter gibt Kopien statt der Tarife zurück");
});

test("K5 — die Liste gliedert über die EINE Regel; Gruppentexte stehen nur im Modul", () => {
  const liste = lies(OFFERS_LIST);
  assert.match(liste, /deliveryDeadlineGroups\(sorted, \{ latestDeliveryDate, latestDeliveryTime \}\)/);
  assert.match(liste, /const FRISTGRUPPEN = Object\.freeze\(\["confirmed", "projected", "unconfirmed"\]\);/);
  // Auszeichnungen nur unter den Angeboten, die die Frist einhalten (bestätigt oder voraussichtlich).
  assert.match(liste, /gruppen \? \[\.\.\.gruppen\.confirmed, \.\.\.gruppen\.projected\] : sorted/);
  assert.match(liste, /assignBadges\(auszeichnungsBasis\)/);
  // „Zu spät": eingeklappt, mit aria-expanded, und mit jeder neuen Frist wieder zu.
  assert.match(liste, /const \[spaetOffen, setSpaetOffen\] = useState\(false\);/);
  assert.match(liste, /useEffect\(\(\) => \{ setSpaetOffen\(false\); \}, \[latestDeliveryDate, latestDeliveryTime\]\);/);
  assert.match(liste, /aria-expanded=\{spaetOffen\}/);
  assert.match(liste, /\{spaetOffen && gruppenAbschnitt\("late", spaetListe, `\$\{gruppenId\}-late`\)\}/);
  // Kein Gruppentext als Literal im Code von Liste oder Karte — alles aus DEADLINE_GROUP_TEXT (Kommentare zählen nicht).
  const ohneKommentar = (q) => q.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const code = ohneKommentar(liste) + ohneKommentar(lies("src/components/offers/OfferCard.jsx"));
  for (const text of ["Voraussichtlich passend", "Frist nicht bestätigt", "stellen nach Ihrer Frist zu"]) {
    assert.ok(!code.includes(text), `„${text}" steht als Literal in Liste oder Karte`);
  }
});

/* ══════════ T) TG-L2 — vier Ausgänge, eine Regel für beide Provider ══════════════ */

// Die Prüfwerte der Analyse (Abschnitt D, Abholung Mo. 26.10.2026), dazu die Zeitprodukte der Korrektur K.
const anbieter = (id, max, zeit = null, min = max) => ({ id, deliveryDateMin: min, deliveryDateMax: max, deliveryDate: min,
                                                        deliveryTimeUntil: zeit });
const prognose = (id, dateMin, dateMax, timeUntil = null, extra = {}) => ({
  id, deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null, deliveryTimeUntil: null,
  deliveryProjection: { kind: "estimated", dateMin, dateMax, timeUntil }, ...extra });
const MATRIX_ANGEBOTE = [
  anbieter("J1", "2026-10-27", "09:00"),
  anbieter("J2", "2026-10-28", "18:00", "2026-10-27"),
  anbieter("J3", "2026-10-27"),
  prognose("T1", "2026-10-27", "2026-10-27"),        // „1"
  prognose("T2", "2026-10-27", "2026-10-28"),        // „1-2"
  prognose("T3", "2026-10-27", "2026-11-02"),        // „1-5" (über das Wochenende)
  prognose("T4", "2026-10-28", null),                // „2+"
  prognose("T5", "2026-10-27", null),                // „1+"
  { id: "T6", deliveryDate: null, deliveryDateMax: null, deliveryProjection: null, transitDaysMin: 1, transitDaysMax: 2 },
  prognose("T7", "2026-10-27", "2026-10-27", null, { serviceType: "dropoff" }), // Abgabe „1"
];
const A = "met", B = "projected", C = "not_assessable", D = "too_late";
const MATRIX = [
  [["2026-10-27", ""],      [A, D, A, B, D, D, D, C, C, B]],
  [["2026-10-27", "10:00"], [A, D, C, C, D, D, D, C, C, C]],
  [["2026-10-28", ""],      [A, A, A, B, B, D, C, C, C, B]],
  [["2026-10-28", "10:00"], [A, D, A, B, C, D, C, C, C, B]],
  [["2026-11-02", ""],      [A, A, A, B, B, B, C, C, C, B]],
  [["2026-10-26", "10:00"], [D, D, D, D, D, D, D, D, C, D]],
];

test("T1 — die Matrix der Analyse: jede Zeile, jede Spalte", () => {
  for (const [[tag, zeit], erwartet] of MATRIX) {
    const frist = { latestDeliveryDate: tag, latestDeliveryTime: zeit };
    MATRIX_ANGEBOTE.forEach((t, i) => {
      assert.equal(deliveryDeadlineAssessment(t, frist), erwartet[i], `${t.id} gegen ${tag} ${zeit || "(ohne Uhrzeit)"}`);
    });
  }
});

test("T2 — belegte Zustelluhrzeiten (Korrektur K): DHL 12:00 passt zu 12:00, nicht zu 10:00 — ohne Uhrzeit nicht bestätigt", () => {
  const am = "2026-10-27";
  const angebote = [
    prognose("87", am, am, "12:00"), prognose("86", am, am, "10:30"), prognose("85", am, am, "09:00"),
    prognose("49", am, am), prognose("84", am, am), prognose("29", am, am),
    anbieter("JU-1200", am, "12:00"),
  ];
  const erwartet = {
    "12:00": { 87: B, 86: B, 85: B, 49: C, 84: C, 29: C, "JU-1200": A },
    "10:00": { 87: D, 86: D, 85: B, 49: C, 84: C, 29: C, "JU-1200": D },
    "":      { 87: B, 86: B, 85: B, 49: B, 84: B, 29: B, "JU-1200": A },
  };
  for (const [zeit, je] of Object.entries(erwartet)) {
    for (const t of angebote) {
      assert.equal(deliveryDeadlineAssessment(t, { latestDeliveryDate: am, latestDeliveryTime: zeit }), je[t.id], `${t.id} ${zeit}`);
    }
  }
  // Am Tag vor dem Prognosetag ist jede Prognose zu spät, am Tag danach jede passend — mit oder ohne Uhrzeit.
  for (const zeit of ["", "08:00"]) {
    for (const t of angebote.slice(0, 6)) {
      assert.equal(deliveryDeadlineAssessment(t, { latestDeliveryDate: "2026-10-26", latestDeliveryTime: zeit }), D, t.id);
      assert.equal(deliveryDeadlineAssessment(t, { latestDeliveryDate: "2026-10-28", latestDeliveryTime: zeit }), B, t.id);
    }
  }
});

test("T3 — Wochenende und Feiertag: verglichen werden die Tage des Servers, die Oberfläche zählt nichts", () => {
  // Abholung Fr. 30.10., Laufzeit „1" → Mo. 02.11. (Server): eine Frist Sa. 31.10. hält sie nicht.
  const freitag = prognose("FR", "2026-11-02", "2026-11-02");
  assert.equal(deliveryDeadlineAssessment(freitag, { latestDeliveryDate: "2026-10-31" }), D);
  assert.equal(deliveryDeadlineAssessment(freitag, { latestDeliveryDate: "2026-11-02" }), B);
  // Abholung Mi. 23.12.2026, Laufzeit „2" → Mo. 28.12. (25./26.12. bundesweit frei).
  const weihnachten = prognose("XM", "2026-12-28", "2026-12-28");
  assert.equal(deliveryDeadlineAssessment(weihnachten, { latestDeliveryDate: "2026-12-24" }), D);
  assert.equal(deliveryDeadlineAssessment(weihnachten, { latestDeliveryDate: "2026-12-28", latestDeliveryTime: "12:00" }), C);
  assert.equal(deliveryDeadlineAssessment(weihnachten, { latestDeliveryDate: "2026-12-29", latestDeliveryTime: "08:00" }), B);
  // Eine unbrauchbare Prognose ist keine — nicht bestätigt, nie passend.
  for (const kaputt of [{ kind: "guaranteed", dateMin: "2026-10-27", dateMax: "2026-10-27" },
                        { kind: "estimated", dateMin: "27.10.2026", dateMax: null },
                        { kind: "estimated", dateMin: "2026-10-28", dateMax: "2026-10-27" }]) {
    assert.equal(deliveryDeadlineAssessment({ deliveryProjection: kaputt }, { latestDeliveryDate: "2026-11-30" }), C,
      JSON.stringify(kaputt));
  }
});

test("T4 — Anbieterdaten haben Vorrang vor einer (vertragswidrig) mitgelieferten Prognose", () => {
  const beides = { ...anbieter("JX", "2026-10-29", "18:00"), deliveryProjection: { kind: "estimated", dateMin: "2026-10-27",
                                                                                    dateMax: "2026-10-27", timeUntil: "09:00" } };
  assert.equal(deliveryDeadlineAssessment(beides, { latestDeliveryDate: "2026-10-28" }), D);
  assert.equal(deliveryDeadlineAssessment(beides, { latestDeliveryDate: "2026-10-29" }), A);
});

test("T5 — Gruppen: Reihenfolge der Sortierung, jede sichtbare Karte genau einmal, „Zu spät“ getrennt und im Preis", () => {
  const frist = { latestDeliveryDate: "2026-10-28" };
  const sichtbar = applyResultFilters(MATRIX_ANGEBOTE, frist);
  const g = deliveryDeadlineGroups(sichtbar, frist);
  assert.deepEqual(g.confirmed.map((t) => t.id), ["J1", "J2", "J3"]);
  assert.deepEqual(g.projected.map((t) => t.id), ["T1", "T2", "T7"]);
  assert.deepEqual(g.unconfirmed.map((t) => t.id), ["T4", "T5", "T6"]);
  assert.equal(g.confirmed.length + g.projected.length + g.unconfirmed.length, sichtbar.length);
  assert.deepEqual(lateResultOffers(MATRIX_ANGEBOTE, frist).map((t) => t.id), ["T3"]);
  // Umgekehrte Eingabe → umgekehrte Reihenfolge in jeder Gruppe: die Liste sortiert, die Gruppe übernimmt.
  const umgekehrt = deliveryDeadlineGroups([...sichtbar].reverse(), frist);
  assert.deepEqual(umgekehrt.projected.map((t) => t.id), ["T7", "T2", "T1"]);
  // Die Preisgrenze gilt auch für „Zu spät" — dieselbe Regel wie für die sichtbare Liste.
  const mitPreis = [{ ...MATRIX_ANGEBOTE[5], netPrice: 30 }, { ...MATRIX_ANGEBOTE[5], id: "T3b", netPrice: 10 }];
  assert.deepEqual(lateResultOffers(mitPreis, { ...frist, maxPrice: "20" }).map((t) => t.id), ["T3b"]);
  assert.deepEqual(lateResultOffers(mitPreis, { ...frist, maxPrice: "" }).map((t) => t.id), ["T3", "T3b"]);
  // Nichts mutiert.
  const vorher = JSON.stringify(MATRIX_ANGEBOTE);
  deliveryDeadlineGroups(MATRIX_ANGEBOTE, frist); lateResultOffers(MATRIX_ANGEBOTE, frist);
  assert.equal(JSON.stringify(MATRIX_ANGEBOTE), vorher);
});

test("T6 — Wortlaut: Gruppen, Aufklapper, kein Angebot in der Frist — ohne Zusage und ohne Quelle", () => {
  assert.deepEqual(Object.keys(DEADLINE_GROUP_TEXT), ["confirmed", "projected", "unconfirmed", "late", "noneFitting"]);
  assert.deepEqual(["confirmed", "projected", "unconfirmed", "late"].map((k) => DEADLINE_GROUP_TEXT[k].title),
    ["Passend", "Voraussichtlich passend", "Frist nicht bestätigt", "Zu spät"]);
  assert.equal(lateGroupToggleLabel(1, false), "1 Angebot stellt nach Ihrer Frist zu – anzeigen");
  assert.equal(lateGroupToggleLabel(3, false), "3 Angebote stellen nach Ihrer Frist zu – anzeigen");
  assert.equal(lateGroupToggleLabel(3, true), "Zu späte Angebote ausblenden");
  assert.equal(lateGroupToggleLabel(NaN, false), "0 Angebote stellen nach Ihrer Frist zu – anzeigen");
  const alles = JSON.stringify(DEADLINE_GROUP_TEXT);
  assert.ok(!/garant|zugesichert|pünktlich|JUMiNGO|Transglobal/i.test(alles), alles);
  assert.equal(DELIVERY_DEADLINE.PROJECTED, "projected");
});

test("T7 — beide Seiten: „Zu spät“ sortiert wie die Liste, die Auswahl wird bei einer Friständerung gelöst", () => {
  for (const seite of SEITEN) {
    const q = lies(seite);
    assert.match(q, /const sorted = React\.useMemo\(\(\) => sortiereAngebote\(filtered, sortMode\), \[filtered, sortMode\]\);/, seite);
    assert.match(q, /sortiereAngebote\(lateResultOffers\(tariffs, \{/, seite);
    assert.match(q, /lateOffers=\{spaet\}/, seite);
    // Gelöst wird nur, was durch die neue Frist zu spät ist — ausgelöst von der Frist, nicht von der Auswahl.
    assert.match(q, /deliveryDeadlineAssessment\(vorher, frist\) === DELIVERY_DEADLINE\.TOO_LATE/, seite);
    assert.match(q, /\}, \[form\.latestDeliveryDate, form\.latestDeliveryTime\]\);/, seite);
  }
});

test("F4 — die Uhrzeit steht in FILTER_ONLY_FIELDS: kein /calculate-price-Request", () => {
  for (const seite of SEITEN) {
    const q = lies(seite);
    const menge = q.match(/const FILTER_ONLY_FIELDS = new Set\(\[([^\]]*)\]\)/);
    assert.ok(menge, `${seite}: FILTER_ONLY_FIELDS fehlt`);
    assert.match(menge[1], /"latestDeliveryTime"/, seite);
    assert.match(q, /if \(!FILTER_ONLY_FIELDS\.has\(k\)\) invalidateResults\(\);/, seite);
  }
});

test("F5 — wird das Datum geleert, verschwindet die Uhrzeit mit", () => {
  for (const seite of SEITEN) {
    const q = lies(seite);
    const h = q.match(/const handleLatestDeliveryChange = \(iso\) => \{[\s\S]*?\n  \};/);
    assert.ok(h, `${seite}: handleLatestDeliveryChange fehlt`);
    assert.match(h[0], /if \(!iso\) \{[\s\S]*?upd\("latestDeliveryTime", ""\)/,
      `${seite}: eine verwaiste Uhrzeit ohne Datum bliebe stehen`);
    assert.match(q, /upd\("latestDeliveryDate", ""\);\s*\n\s*upd\("latestDeliveryTime", ""\);/, seite);
  }
});

test("F6 — Zurücksetzen leert Preis, Datum UND Uhrzeit, ohne neuen Preisrequest", () => {
  for (const seite of SEITEN) {
    const q = lies(seite);
    const c = q.match(/const clearFilters = \(\) => \{[\s\S]*?\n  \};/);
    assert.ok(c, `${seite}: clearFilters fehlt`);
    for (const k of ["max_price", "latestDeliveryDate", "latestDeliveryTime"]) {
      assert.match(c[0], new RegExp(`upd\\("${k}", ""\\)`), `${seite}: ${k} wird nicht geleert`);
    }
    assert.ok(!/calculate|fetch|setTariffs\(\[\]\)/.test(c[0]),
      `${seite}: Zurücksetzen darf weder rechnen noch Tarife verwerfen`);
  }
  assert.equal(applyResultFilters(TARIFE_41,
    { maxPrice: "", latestDeliveryDate: "", latestDeliveryTime: "" }).length, 41);
});

test("F7 — an der echten Antwort reduziert 31.08. + 12:00 weiter als das Datum allein", () => {
  const nurDatum = applyResultFilters(TARIFE_41, { latestDeliveryDate: "2026-08-31" });
  const mitZeit  = applyResultFilters(TARIFE_41, { latestDeliveryDate: "2026-08-31", latestDeliveryTime: "12:00" });
  assert.equal(nurDatum.length, 21);
  assert.ok(mitZeit.length < nurDatum.length);
  for (const t of mitZeit) {
    assert.ok(`${t.deliveryDateMax} ${t.deliveryTimeUntil}` <= "2026-08-31 12:00",
      `${t.id} erfüllt die Frist nicht`);
  }
  const raus = nurDatum.filter((t) => !mitZeit.some((m) => m.id === t.id));
  for (const t of raus) {
    assert.ok(`${t.deliveryDateMax} ${t.deliveryTimeUntil}` > "2026-08-31 12:00", `${t.id}`);
  }
});

/* ══════════ Z) Sichtbare Texte ════════════════════════════════════════════ */

test("Z1 — der Chip nennt Datum und Uhrzeit, kompakt und ohne „Uhr“", () => {
  assert.equal(deliveryChipLabel("", ""), "Lieferung");
  assert.equal(deliveryChipLabel("2026-08-31", ""), "Lieferung bis 31.08.2026");
  assert.equal(deliveryChipLabel("2026-08-31", "12:00"), "Lieferung bis 31.08.2026, 12:00");
  // Eine Uhrzeit ohne Datum ergibt keinen Zeitpunkt — der Chip behauptet keinen.
  assert.equal(deliveryChipLabel("", "12:00"), "Lieferung");
});

test("Z2 — der Leerzustand nennt bei gesetzter Uhrzeit Datum UND Uhrzeit", () => {
  const t = emptyFilterHint({ latestDeliveryDate: "2026-08-31", latestDeliveryTime: "12:00" });
  assert.match(t, /31\.08\.2026/);
  assert.match(t, /12:00/);
  assert.ok(!/garantiert|zugesichert/i.test(t));
  assert.equal(emptyFilterHint({ latestDeliveryDate: "2026-08-31" }),
    emptyFilterHint({ latestDeliveryDate: "2026-08-31", latestDeliveryTime: "" }));
});

// ── Regression / Governance ──────────────────────────────────────────────────

test("H1 — OffersList zählt NICHT mehr nur den Preisfilter", () => {
  const q = lies(OFFERS_LIST);
  assert.doesNotMatch(q, /\[maxPrice\]\.filter\(Boolean\)/,
    "die alte Zählung (nur maxPrice) ist zurück — genau dieser Ausdruck war die Ursache");
  assert.match(q, /activeResultFilterCount\(\{ maxPrice, latestDeliveryDate \}\)/);
});

test("H2 — es gibt genau EINE Zählquelle, kein zweiter paralleler Filterzustand", () => {
  const q = lies(OFFERS_LIST);
  // Ein einziger Dropdown-Zustand für beide Chips (höchstens eines offen).
  assert.equal((q.match(/useState\(null\)/g) || []).length, 1);
  assert.match(q, /openFilter === "delivery"/);
  assert.match(q, /openFilter === "price"/);
  assert.doesNotMatch(q, /ce-dialog|role="dialog"[\s\S]{0,40}modal/, "es wurde ein zweites Overlaymuster eingeführt");
});

test("H3 — der Chip nutzt die vorhandenen Filter-Primitives, kein Eigenmaterial", () => {
  const q = lies(OFFERS_LIST);
  // Vom öffnenden <button> bis zum schließenden Tag — der className steht VOR
  // dem onClick, ein Ausschnitt ab onClick würde ihn verfehlen.
  const chip = q.match(/<button\n\s+className=\{`offers-sort-btn offers-filter-chip\$\{latestDeliveryDate[\s\S]*?<\/button>/)[0];
  assert.match(chip, /offers-sort-btn offers-filter-chip/);
  assert.match(chip, /offers-filter-chip-caret/);
  assert.match(chip, /aria-expanded=/);
});

test("H4 — diese Testdatei läuft im Unit-Testlauf mit", () => {
  pruefeImTestlauf("src/utils/offersFilterView.test.mjs");
});

/* ══════════ Ü) Ergebnisüberschrift ═══════════════════════════════════════ */

test("Ü1 — die Überschrift nennt nur die sichtbare Zahl", () => {
  assert.equal(offersCountLabel(41), "41 Angebote");
  assert.equal(offersCountLabel(21), "21 Angebote");
  assert.equal(offersCountLabel(1), "1 Angebot");
  assert.equal(offersCountLabel(0), "0 Angebote");
});

test("Ü2 — kein „von“, kein „angezeigt“, kein „gefunden“", () => {
  for (const n of [0, 1, 2, 21, 41, 999]) {
    const t = offersCountLabel(n);
    assert.doesNotMatch(t, / von /, t);
    assert.doesNotMatch(t, /angezeigt/, t);
    assert.doesNotMatch(t, /gefunden/, t);
  }
});

test("Ü3 — die alten Formulierungen stehen nicht mehr im Quelltext", () => {
  const q = lies(OFFERS_LIST);
  assert.doesNotMatch(q, /Angeboten angezeigt/, "„x von y Angeboten angezeigt“ ist zurück");
  assert.doesNotMatch(q, /Angebote? gefunden/, "„x Angebote gefunden“ ist zurück");
  assert.doesNotMatch(q, /von \$\{tariffs\.length\}/, "der Bezug auf die Gesamtzahl ist zurück");
});

test("Ü4 — ein kaputter Zählwert erzeugt keine „NaN Angebote“", () => {
  // Der Wert kommt aus `filtered.length` und ist immer eine Zahl; die Absicherung
  // steht trotzdem, damit hier nie ein Rohwert in der Überschrift landet.
  assert.equal(offersCountLabel(undefined), "0 Angebote");
  assert.equal(offersCountLabel(NaN), "0 Angebote");
  assert.equal(offersCountLabel(null), "0 Angebote");
});

test("Ü5 — der Filterzustand bleibt über Chip und Zurücksetzen sichtbar", () => {
  // Die Überschrift erklärt den Filter nicht mehr — deshalb MÜSSEN die beiden
  // anderen Anzeiger bleiben. Ohne sie wäre die Reduktion unerklärt.
  const q = lies(OFFERS_LIST);
  assert.match(q, /deliveryChipLabel\(latestDeliveryDate, latestDeliveryTime\)/);
  assert.match(q, /\{hasFilter && \(\s*<button className="offers-filter-reset-btn"/);
});
