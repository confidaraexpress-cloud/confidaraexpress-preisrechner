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
    assert.match(q, /import \{ applyResultFilters \} from "\.\.\/utils\/offersFilterView\.mjs";/,
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

test("F3 — ohne verwertbare Uhrzeit fällt ein Tarif bei gesetzter Zeit heraus (fail-safe)", () => {
  const ohneZeit = [
    { id: "null", deliveryDateMax: "2026-08-31", deliveryTimeUntil: null },
    { id: "leer", deliveryDateMax: "2026-08-31", deliveryTimeUntil: "" },
    { id: "murks", deliveryDateMax: "2026-08-31", deliveryTimeUntil: "abc" },
    { id: "fehlt", deliveryDateMax: "2026-08-31" },
  ];
  // Es wird weder „Tagesende“ noch „erfüllt die Frist“ unterstellt.
  assert.deepEqual(
    applyResultFilters(ohneZeit, { latestDeliveryDate: "2026-08-31", latestDeliveryTime: "12:00" }), []);
  // Ohne gesetzte Uhrzeit bleiben genau dieselben Tarife sichtbar wie bisher.
  assert.equal(applyResultFilters(ohneZeit, { latestDeliveryDate: "2026-08-31" }).length, 4);
});

test("F3b — fehlt das Lieferdatum selbst, bleibt die bisherige Semantik unverändert", () => {
  const ohneDatum = [{ id: "x", deliveryTimeUntil: "17:00" }];
  assert.equal(applyResultFilters(ohneDatum, { latestDeliveryDate: "2026-08-31" }).length, 1);
  assert.equal(
    applyResultFilters(ohneDatum, { latestDeliveryDate: "2026-08-31", latestDeliveryTime: "12:00" }).length, 1,
    "diese Semantik wurde bewusst nicht nebenbei geändert");
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
