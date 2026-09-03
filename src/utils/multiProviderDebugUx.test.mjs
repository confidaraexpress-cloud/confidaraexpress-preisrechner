// Temporaerer Multi-Provider-Vergleichsmodus — die FRONTENDSEITE.
//
// Reine Quelltext- und Funktionspruefungen: kein Browser, kein Server, kein Netz.
// Die Browserseite (echte Farben, echte Karten, vier Breiten) prueft
// `tests/e2e/multiProviderDebugMode.test.mjs`.
//
// Vier Fragen:
//   1. Bleibt die Oberflaeche ohne Debugblock exakt die heutige?              (§A)
//   2. Faerbt sie richtig — und gewinnt Gruen?                                (§B)
//   3. Entscheidet das Frontend irgendetwas selbst?                           (§C)
//   4. Arbeiten Sortierung, Filter und Empfehlung auf dem ANGEZEIGTEN Preis?  (§D)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  offerDebugView, offerDebugCardClass,
  DEBUG_TONE_MATCH, DEBUG_TONE_JUMINGO, DEBUG_TONE_TRANSGLOBAL,
} from "./offerDebugView.mjs";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CSS_DEBUG   = lies("../styles/multi-provider-debug.css");
const CSS_VARS    = lies("../styles/variables.css");
const CSS_INDEX   = lies("../styles/index.css");
const OFFER_CARD  = lies("../components/offers/OfferCard.jsx");
const OFFER_LIST  = lies("../components/offers/OffersList.jsx");
const BADGES      = lies("./offerBadges.js");
const MODUL       = lies("./offerDebugView.mjs");

const angebot = (debug) => (debug === undefined ? { netPrice: 10 } : { netPrice: 10, debug });

/* ══════════ §A  OHNE DEBUGBLOCK AENDERT SICH NICHTS ═══════════════════════ */

test("A1 — ohne Debugblock gibt es weder Ansicht noch Zusatzklasse", () => {
  for (const t of [undefined, null, {}, { netPrice: 5 }, { debug: null }, { debug: "x" }, { debug: 42 }]) {
    assert.equal(offerDebugView(t), null, `${JSON.stringify(t)} haette keine Ansicht ergeben duerfen`);
    assert.equal(offerDebugCardClass(t), "", "es entsteht eine Zusatzklasse ohne Debugblock");
  }
});

test("A2 — eine unbekannte Quelle erfindet KEINE Farbe", () => {
  for (const p of ["fremd", "", null, 7, undefined, "JUMINGO", "Transglobal"]) {
    const v = offerDebugView(angebot({ provider: p, matchedAcrossProviders: true, matchGroup: "m1" }));
    assert.equal(v, null, `Quelle ${JSON.stringify(p)} haette keine Farbe bekommen duerfen`);
  }
});

test("A3 — jede Regel des Debugblatts haengt an .offer-card--debug", () => {
  // Ohne Debugblock traegt keine Karte diese Klasse — also greift ohne Server
  // keine einzige Zeile dieser Datei. Das ist der Grund, warum die Datei
  // gefahrlos ausgeliefert werden kann.
  const selektoren = [...ohneKommentare(CSS_DEBUG).matchAll(/^([^@\s][^{]*)\{/gm)].map((m) => m[1].trim());
  assert.ok(selektoren.length >= 6, `zu wenige Regeln gefunden: ${selektoren.length}`);
  for (const s of selektoren) {
    assert.ok(/\.offer-card--debug|\.offer-debug-/.test(s), `Regel ausserhalb des Debug-Scopes: ${s}`);
  }
});

test("A4 — die Zustandsklassen der Karte bleiben unveraendert bestehen", () => {
  // Additiv, nicht ersetzend: die Zusatzklasse wird ANGEHAENGT.
  assert.match(OFFER_CARD, /offer-card--selected/);
  assert.match(OFFER_CARD, /offer-card--unavailable/);
  assert.match(OFFER_CARD, /\$\{offerDebugCardClass\(t\)\}`\}/,
    "die Debugklasse wird nicht an die bestehende Klassenliste angehaengt");
  // Und das Debugblatt dreht keinen Zustand zurueck.
  for (const verboten of ["offer-card--selected", "offer-card:hover", "outline: none"]) {
    assert.ok(!CSS_DEBUG.includes(verboten), `das Debugblatt fasst ${verboten} an`);
  }
});

/* ══════════ §B  FAERBUNG ═════════════════════════════════════════════════ */

test("B1 — Blau nur JUMiNGO, Orange nur Transglobal", () => {
  const j = offerDebugView(angebot({ provider: "jumingo", priceBasis: "customer_price",
                                     matchedAcrossProviders: false, matchGroup: null }));
  assert.equal(j.tone, DEBUG_TONE_JUMINGO);
  assert.equal(j.text, "JUMiNGO");
  assert.equal(offerDebugCardClass(angebot({ provider: "jumingo" })), " offer-card--debug offer-card--debug-jumingo");

  const t = offerDebugView(angebot({ provider: "transglobal", priceBasis: "provider_net",
                                     matchedAcrossProviders: false, matchGroup: null }));
  assert.equal(t.tone, DEBUG_TONE_TRANSGLOBAL);
  assert.match(t.text, /^Transglobal · Einkauf$/, "der Einkaufshinweis fehlt");
});

test("B2 — GRUEN GEWINNT: beide Karten eines Paares tragen denselben Ton", () => {
  const gruppe = { matchedAcrossProviders: true, matchGroup: "m1" };
  const j = offerDebugView(angebot({ provider: "jumingo",     priceBasis: "customer_price", ...gruppe }));
  const t = offerDebugView(angebot({ provider: "transglobal", priceBasis: "provider_net",  ...gruppe }));
  assert.equal(j.tone, DEBUG_TONE_MATCH);
  assert.equal(t.tone, DEBUG_TONE_MATCH);
  assert.equal(j.matchGroup, t.matchGroup);
  // Die Herkunft bleibt trotzdem lesbar — die Farbe ersetzt sie nicht.
  assert.match(j.text, /JUMiNGO/);
  assert.match(t.text, /Transglobal/);
  assert.match(j.text, /gleich m1/);
});

test("B3 — eine Markierung OHNE Kennung ist keine Gruppe", () => {
  for (const g of [null, "", "   ", 1, {}, undefined]) {
    const v = offerDebugView(angebot({ provider: "jumingo", matchedAcrossProviders: true, matchGroup: g }));
    assert.equal(v.tone, DEBUG_TONE_JUMINGO, `Kennung ${JSON.stringify(g)} haette keine Gruppe ergeben duerfen`);
    assert.equal(v.matchGroup, null);
  }
  // Und umgekehrt: eine Kennung ohne ausdrueckliche Markierung ebenfalls nicht.
  const v = offerDebugView(angebot({ provider: "jumingo", matchedAcrossProviders: false, matchGroup: "m1" }));
  assert.equal(v.tone, DEBUG_TONE_JUMINGO);
});

test("B4 — die Faerbung traegt IMMER einen lesbaren Text und einen Punkt", () => {
  assert.match(OFFER_CARD, /offer-debug-dot/, "der Farbpunkt fehlt in der Karte");
  assert.match(OFFER_CARD, /debugAnsicht\.text/, "der lesbare Text fehlt in der Karte");
  for (const p of ["jumingo", "transglobal"]) {
    const v = offerDebugView(angebot({ provider: p, matchedAcrossProviders: false, matchGroup: null }));
    assert.ok(v.text.trim().length >= 6, `Text zu kurz: ${v.text}`);
  }
});

test("B5 — die drei Toene stehen als Tokens in variables.css, nicht als Literal im Blatt", () => {
  for (const ton of ["jumingo", "transglobal", "match"]) {
    for (const rolle of ["bg", "border", "fg"]) {
      const name = `--ce-debug-provider-${ton}-${rolle}`;
      assert.ok(CSS_VARS.includes(`${name}:`), `${name} ist nicht definiert`);
      assert.ok(CSS_DEBUG.includes(`var(${name})`), `${name} wird nicht benutzt`);
    }
  }
  // Kein Farbliteral im Bereichsblatt — dieselbe Disziplin wie im Adminportal.
  const ohne = ohneKommentare(CSS_DEBUG);
  const literale = [...ohne.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)].map((m) => m[0]);
  assert.deepEqual(literale, [], `Farbliterale im Debugblatt: ${literale.join(", ")}`);
  // Und das Blatt wird tatsaechlich geladen — vor der Musterebene, wie jedes
  // Bereichsblatt. GEMESSEN WIRD DIE IMPORTREIHENFOLGE, nicht das Vorkommen des
  // Dateinamens: eine Begruendung im Kommentar nennt den Nachbarn zwangslaeufig
  // und stuende sonst VOR ihm. Dieselbe Falle, die das Projekt an gezaehlten
  // Bezeichnern in Kommentaren schon zweimal bezahlt hat.
  const importe = [...CSS_INDEX.matchAll(/@import\s+'\.\/([\w.-]+)';/g)].map((m) => m[1]);
  const iDebug  = importe.indexOf("multi-provider-debug.css");
  const iMuster = importe.indexOf("patterns.css");
  assert.ok(iDebug >= 0, "das Debugblatt wird nicht importiert");
  assert.ok(iMuster >= 0, "die Musterebene wird nicht importiert");
  assert.ok(iDebug < iMuster, "das Debugblatt steht nicht vor der Musterebene");
});

/* ══════════ §C  DAS FRONTEND ENTSCHEIDET NICHTS ══════════════════════════ */

test("C1 — die Karte kennt weder Quelle noch Schalter, sie fragt das Modul", () => {
  const quelle = ohneKommentare(OFFER_CARD);
  // Die Karte darf die Herkunft nicht selbst bestimmen — sonst gaebe es zwei Stellen,
  // die ueber Farbe entscheiden, und eine davon wuerde beim Abbau vergessen.
  for (const verboten of ['"transglobal"', '"jumingo"', "import.meta.env",
                          "localStorage", "sessionStorage", "MULTI_PROVIDER"]) {
    assert.ok(!quelle.includes(verboten), `die Karte entscheidet selbst (${verboten})`);
  }
  // Sie ruft ausschliesslich die beiden Helfer auf.
  assert.match(quelle, /offerDebugView\(t\)/);
  assert.match(quelle, /offerDebugCardClass\(t\)/);
});

test("C2 — kein eigener Gleichheitsvergleich im Frontend", () => {
  const quelle = ohneKommentare(MODUL);
  // Weder Provider-, Preis-, Namens- noch Laufzeitvergleich: die Gleichheit kommt
  // ausschliesslich aus dem Serverfeld.
  for (const verboten of ["netPrice", "finalPrice", "publicCarrierId", "publicServiceName",
                          "transitDays", "carrier", "toLowerCase", "includes(", "levensh"]) {
    assert.ok(!quelle.includes(verboten), `das Frontend leitet Gleichheit selbst ab (${verboten})`);
  }
  // Und es liest keinen eigenen Schalter: der Modus kommt allein aus der Antwort.
  for (const verboten of ["import.meta.env", "localStorage", "sessionStorage", "process.env", "fetch("]) {
    assert.ok(!quelle.includes(verboten), `das Frontend traegt einen zweiten Schalter (${verboten})`);
  }
});

test("C3 — es wird NICHT dedupliziert: beide Karten eines Paares bleiben in der Liste", () => {
  const quelle = ohneKommentare(OFFER_LIST);
  for (const verboten of ["matchGroup", "matchedAcrossProviders", "debug."]) {
    assert.ok(!quelle.includes(verboten),
      `die Liste wertet ${verboten} aus — eine Gruppe darf die Liste nicht kuerzen`);
  }
});

/* ══════════ §D  PREIS, SORTIERUNG, FILTER ════════════════════════════════ */

test("D1 — Sortierung, Preisfilter und Empfehlung lesen dieselben Preisfelder wie die Karte", () => {
  // Der Server schreibt den Debugpreis GENAU in `netPrice`/`vatAmount`/`finalPrice`.
  // Solange Sortierung, Filter und Badges auf denselben Feldern arbeiten, koennen sie
  // strukturell nicht auf einem anderen Wert rechnen als die Karte anzeigt.
  assert.match(BADGES, /a\.netPrice <= b\.netPrice/, "die Empfehlung liest nicht netPrice");
  assert.match(OFFER_LIST, /\.map\(t => t\.netPrice\)/, "der Preisfilter liest nicht netPrice");
  // Und keine dieser Stellen kennt ein eigenes Debugfeld.
  assert.ok(!ohneKommentare(BADGES).includes("debug"), "die Empfehlung wertet Debugfelder aus");
});

test("D2 — der Vergleichsmodus schreibt keinen Preis im Frontend", () => {
  const quelle = ohneKommentare(MODUL);
  for (const verboten of ["1.19", "vatRate", "VAT", "* 1.", "toFixed", "Math."]) {
    assert.ok(!quelle.includes(verboten), `das Frontend rechnet einen Preis (${verboten})`);
  }
});
