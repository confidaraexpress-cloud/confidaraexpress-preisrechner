/* Ladeoverlay des Angebotsvergleichs — Stufen, White-Label und Vertrag.
 *
 * Drei Dinge werden hier festgehalten:
 *   • die Stufenlogik selbst (reine Funktion, exakte Schwellen und Texte),
 *   • dass kein Kundentext einen Anbieter, eine Technikvokabel oder einen
 *     erfundenen Fortschritt nennt,
 *   • der Einbau: EIN Ladezustand (`loading`) steuert Overlay, inert und
 *     aria-busy in beiden Seiten; das Overlay ist eine Statusmeldung, kein
 *     Dialog; die Karten sparen Renderarbeit über content-visibility.
 * Das Verhalten im Browser (Overlay, Sperre, Fokus, Fehlerpfade, Breiten,
 * Stufenwechsel) prüft tests/e2e/offerComparisonLoading.test.mjs.
 *
 * Run: node --test src/utils/comparisonLoadingView.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pruefeImTestlauf, pruefeImE2eLauf, leseQuelle, schnitt } from "../../scripts/governance.mjs";
import {
  COMPARISON_LOADING_PHASES, comparisonLoadingView, msUntilNextComparisonPhase,
} from "./comparisonLoadingView.mjs";
import { revealOffers, focusOffersResult, OFFERS_RESULT_SELECTOR } from "./revealOffers.mjs";

// Gescannt wird CODE, nicht die Begründung darüber.
const nurCode = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SEITEN = [
  ["NewShipmentPage", leseQuelle("src/pages/NewShipmentPage.jsx")],
  ["CalculatorPage", leseQuelle("src/pages/CalculatorPage.jsx")],
];
const OVERLAY = leseQuelle("src/components/offers/OfferComparisonLoadingOverlay.jsx");
const HOOK = leseQuelle("src/hooks/useComparisonLoadingFocus.js");
const CSS = leseQuelle("src/styles/comparison-loading.css");

/* ── 1. Stufen ───────────────────────────────────────────────────────────── */

test("1 — genau vier Stufen mit den vorgegebenen Schwellen und Texten", () => {
  const titel = "Versandangebote werden verglichen";
  assert.deepEqual(
    COMPARISON_LOADING_PHASES.map((p) => [p.id, p.fromMs, p.title, p.text]),
    [
      ["start", 0, titel, "Wir gleichen die verfügbaren Versandtarife für Ihre Sendung ab."],
      ["weiter", 8000, titel, "Wir prüfen weiterhin die Versandtarife für Ihre Sendung. Das kann einen Moment dauern."],
      ["laenger", 20000, titel,
        "Der vollständige Vergleich läuft weiter. Einzelne Tarifanfragen benötigen gerade mehr Zeit. Bitte lassen Sie diese Seite geöffnet."],
      ["lang", 45000, "Der Vergleich dauert etwas länger",
        "Wir warten weiterhin auf den vollständigen Vergleich. Bitte lassen Sie diese Seite geöffnet."],
    ],
  );
});

test("2 — Stufenwahl an und um jede Schwelle", () => {
  for (const [ms, id] of [
    [0, "start"], [7999, "start"], [7999.9, "start"],
    [8000, "weiter"], [19999, "weiter"],
    [20000, "laenger"], [44999, "laenger"],
    [45000, "lang"], [75000, "lang"], [10 * 60 * 1000, "lang"],
  ]) {
    assert.equal(comparisonLoadingView(ms).id, id, `${ms} ms`);
  }
});

test("3 — unbrauchbare Zeitwerte gelten als „gerade begonnen“", () => {
  for (const ms of [-1, -8000, NaN, undefined, null, "20000", Infinity]) {
    assert.equal(comparisonLoadingView(ms).id, "start", String(ms));
  }
});

test("4 — bis zur nächsten Stufe: genau die Restzeit, nach der letzten nichts mehr", () => {
  for (const [ms, rest] of [
    [0, 8000], [1, 7999], [7999, 1], [8000, 12000], [19999, 1],
    [20000, 25000], [44999, 1], [45000, null], [600000, null], [-5, 8000], [NaN, 8000],
  ]) {
    assert.equal(msUntilNextComparisonPhase(ms), rest, `${ms} ms`);
  }
});

test("5 — die Stufen steigen streng an, beginnen bei 0 und sind unveränderlich", () => {
  assert.equal(COMPARISON_LOADING_PHASES[0].fromMs, 0);
  for (let i = 1; i < COMPARISON_LOADING_PHASES.length; i += 1) {
    assert.ok(COMPARISON_LOADING_PHASES[i].fromMs > COMPARISON_LOADING_PHASES[i - 1].fromMs);
  }
  assert.equal(new Set(COMPARISON_LOADING_PHASES.map((p) => p.id)).size, COMPARISON_LOADING_PHASES.length);
  assert.ok(Object.isFrozen(COMPARISON_LOADING_PHASES));
  for (const p of COMPARISON_LOADING_PHASES) assert.ok(Object.isFrozen(p), p.id);
});

/* ── 2. White-Label ─────────────────────────────────────────────────────── */

const VERBOTEN = [
  "jumingo", "transglobal", "service id", "serviceid", "service-id", "provider",
  "upstream", "timeout", "time-out", "einkaufspreis", "providerstatus",
];

test("6 — kein Kundentext nennt Anbieter, Technik oder Einkauf", () => {
  for (const p of COMPARISON_LOADING_PHASES) {
    const t = `${p.title} ${p.text}`.toLowerCase();
    for (const wort of VERBOTEN) assert.ok(!t.includes(wort), `${p.id}: „${wort}“`);
  }
  // Auch die Komponente bringt keinen eigenen Text mit, der das umginge:
  // geprüft werden ihre Zeichenketten und JSX-Texte, nicht Bezeichner wie setTimeout.
  const code = nurCode(OVERLAY);
  const texte = [...code.matchAll(/"([^"]*)"/g), ...code.matchAll(/>([^<>{}]+)</g)]
    .map((m) => m[1].toLowerCase());
  for (const t of texte) {
    for (const wort of VERBOTEN) assert.ok(!t.includes(wort), `Overlay: „${wort}“ in „${t}“`);
  }
});

test("7 — kein erfundener Fortschritt: keine Zahl, kein Prozent", () => {
  for (const p of COMPARISON_LOADING_PHASES) {
    assert.doesNotMatch(`${p.title} ${p.text}`, /[0-9%]/, p.id);
  }
  assert.doesNotMatch(nurCode(OVERLAY), /<progress|role="progressbar"|aria-valuenow/);
});

/* ── 3. Das Overlay ─────────────────────────────────────────────────────── */

test("8 — Statusmeldung im Portal, kein Dialog, keine Fokusübernahme", () => {
  const code = nurCode(OVERLAY);
  assert.match(code, /createPortal\(/);
  assert.match(code, /document\.body/);
  assert.match(code, /role="status" aria-live="polite" aria-atomic="true"/);
  for (const verboten of [/role="dialog"/, /aria-modal/, /\.focus\(/, /autoFocus/, /tabIndex/, /useDialog/]) {
    assert.doesNotMatch(code, verboten, `Overlay: ${verboten}`);
  }
  // Redesign 2026-10: keine Bildmarke mehr in der Statusmeldung — die frühere
  // Signet-Grafik (alte Marke) ist entfallen; der Ladebogen bleibt Dekor und vor
  // Screenreadern verborgen, damit die Region nur Titel und Satz vorliest.
  assert.doesNotMatch(code, /<BrandLogo|<Icon|<img/, "das Overlay zeigt keine Bildmarke");
  assert.match(code, /className="cmp-loading-mark" aria-hidden="true"/);
});

test("9 — nichts zu bedienen: kein Abbrechen, keine Anfrage, kein eigener Ladezustand", () => {
  const code = nurCode(OVERLAY);
  for (const verboten of [
    /<button/, /onClick/, /Abbrechen/, /apiFetch/, /\bfetch\(/, /calculate-price/, /AbortController/,
    /(?<![-\w])loading(?![-\w])/,   // der Ladezustand gehört der Seite (CSS-Klassen cmp-loading-* ausgenommen)
  ]) {
    assert.doesNotMatch(code, verboten, `Overlay: ${verboten}`);
  }
  assert.match(code, /export function OfferComparisonLoadingOverlay\(\{ active \}\)/);
  assert.match(code, /\{active && <Ladeanzeige \/>\}/);
});

test("10 — höchstens ein Timer, stufengenau geweckt und beim Abbau gelöscht", () => {
  const code = nurCode(OVERLAY);
  assert.doesNotMatch(code, /setInterval/, "kein Sekundentakt");
  assert.equal((code.match(/setTimeout\(/g) || []).length, 1);
  assert.match(code, /msUntilNextComparisonPhase\(ms\)/);
  assert.match(code, /return \(\) => clearTimeout\(timer\);/);
  assert.match(code, /useEffect\(\(\) => \{[\s\S]*?\}, \[\]\);/, "der Timer startet je Montage genau einmal");
});

/* ── 4. Stylesheet ──────────────────────────────────────────────────────── */

test("11 — eingebunden vor der Musterebene", () => {
  const index = leseQuelle("src/styles/index.css");
  const eigen = index.indexOf("@import './comparison-loading.css';");
  assert.ok(eigen !== -1, "comparison-loading.css ist nicht eingebunden");
  assert.ok(eigen < index.indexOf("@import './patterns.css';"), "muss VOR patterns.css stehen");
});

test("12 — nur Foundation-Tokens, der eine Overlayton, kein Blur", () => {
  const code = nurCode(CSS);
  assert.doesNotMatch(code, /#[0-9a-f]{3,8}\b/i, "Farbliteral");
  assert.doesNotMatch(code, /rgba?\(|hsla?\(/, "Farbliteral");
  assert.doesNotMatch(code, /blur\(/);
  for (const [, name] of code.matchAll(/var\((--[\w-]+)/g)) {
    assert.ok(name.startsWith("--ce-"), `${name} ist kein Foundation-Token`);
  }
  const overlay = code.match(/\.cmp-loading-overlay \{([^}]*)\}/)?.[1] ?? "";
  assert.match(overlay, /position: fixed;/);
  assert.match(overlay, /inset: 0;/);
  assert.match(overlay, /z-index: var\(--ce-z-overlay\);/);
  assert.match(overlay, /background: var\(--ce-color-overlay\);/);
  assert.match(overlay, /backdrop-filter: none;/);
  const karte = code.match(/\.cmp-loading-card \{([^}]*)\}/)?.[1] ?? "";
  for (const regel of [
    /max-width: var\(--ce-size-dialog-sm\);/, /padding: var\(--ce-space-7\);/,
    /background: var\(--ce-color-surface\);/, /border: 1px solid var\(--ce-color-border-subtle\);/,
    /border-radius: var\(--ce-radius-xl\);/, /box-shadow: var\(--ce-elevation-3\);/, /margin: auto;/,
  ]) {
    assert.match(karte, regel, `Karte: ${regel}`);
  }
  assert.match(code, /@media \(max-width: 480px\) \{[^@]*\.cmp-loading-card \{ padding: var\(--ce-space-6\); \}/);
});

test("13 — der Bogen dreht ruhig und steht bei reduzierter Bewegung", () => {
  const code = nurCode(CSS);
  assert.match(code.match(/\.cmp-loading-ring \{([^}]*)\}/)?.[1] ?? "", /animation: spin 2\.4s linear infinite;/);
  const rm = code.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(rm, /\.cmp-loading-ring \{ animation: none; \}/);
  assert.match(rm, /\.cmp-loading-overlay \{ animation: none; \}/);
  // Redesign 2026-10: es gibt keine Bildmarke mehr, die sich (nicht) bewegen könnte.
  assert.doesNotMatch(code, /\.cmp-loading-signet/, "keine Regeln für eine entfallene Bildmarke");
});

/* ── 5. content-visibility der Karten ───────────────────────────────────── */

test("14 — Karten außerhalb des Bildes sparen Renderarbeit, mit gemessenem Platzhalter", () => {
  const offers = nurCode(leseQuelle("src/styles/offers.css"));
  // Genau EINE Regel schaltet content-visibility ein — auf .offer-card selbst.
  assert.equal((offers.match(/content-visibility: auto/g) || []).length, 1);
  // Feinschliff 2026-10: die Karte richtet sich nach ihrer eigenen Breite (Container `offers`);
  // die Platzhalter stehen deshalb in denselben Container-Stufen und tragen die neu gemessenen Höhen.
  // Seit 2026-10-04 sind alle Karten einer Stufe gleich hoch (Hinweise in den Details) — neu gemessen,
  // dazu die schmale Stufe bis 320 px Kartenbreite.
  assert.match(offers, /\n\.offer-card \{\s*content-visibility: auto;\s*contain-intrinsic-size: auto 190px;\s*\}/);
  assert.match(offers, /\.offers-body \{ container-type: inline-size; container-name: offers; \}/);
  assert.match(schnitt(offers, "@container offers (max-width: 949px)", "@container offers (max-width: 639px)"),
    /\.offer-card \{ contain-intrinsic-size: auto 294px; \}/);
  assert.match(schnitt(offers, "@container offers (max-width: 639px)", "@container offers (max-width: 354px)"),
    /\.offer-card \{ contain-intrinsic-size: auto 381px; \}/);
  assert.match(schnitt(offers, "@container offers (max-width: 320px)", "@supports not (container-type: inline-size)"),
    /\.offer-card \{ contain-intrinsic-size: auto 473px; \}/);
  // Kein Ausblenden, keine Virtualisierung.
  assert.doesNotMatch(offers, /content-visibility: hidden/);
  const pkg = leseQuelle("package.json");
  assert.doesNotMatch(pkg, /react-window|react-virtualized|react-virtuoso|@tanstack\/react-virtual/);
});

test("14b — Rückkehr auf eine gemerkte Position: bis zum Sprung liegen alle Karten im Layout", () => {
  const offers = nurCode(leseQuelle("src/styles/offers.css"));
  assert.match(offers, /\.offers-cv-voll \.offer-card \{ content-visibility: visible; \}/);
  const seite = nurCode(SEITEN[0][1]);
  assert.match(seite, /useState\(\(\) => \(flowInit\?\.scrollY \?\? 0\) > 0\)/);
  assert.match(seite, /<div ref=\{offersRef\} id="angebotsbereich" className=\{kartenVollLayouten \? "offers-cv-voll" : undefined\}>/);
  const restore = schnitt(seite, "if (scrollWiederhergestelltRef.current) return;", "}, [flowInit, hasResults]);");
  // Die Klasse fällt erst NACH dem Sprung: setState wirkt nach dem Rückruf.
  assert.match(restore, /setKartenVollLayouten\(false\);\s*if \(ziel > 0\) \{ window\.scrollTo\(0, ziel\); return; \}/);
  assert.match(restore, /return \(\) => \{ cancelAnimationFrame\(id\); setKartenVollLayouten\(false\); \};/);
});

/* ── 6. Einbau in beiden Seiten ─────────────────────────────────────────── */

for (const [name, quelle] of SEITEN) {
  const code = nurCode(quelle);

  test(`15 — ${name}: EIN Ladezustand steuert Overlay, inert und aria-busy`, () => {
    assert.equal((code.match(/<OfferComparisonLoadingOverlay active=\{loading\} \/>/g) || []).length, 1);
    // Redesign 2026-10: der Rahmen darf eine Breitenvariante tragen
    // (`calc-page-wrap--calculator`) — geprüft wird weiterhin, dass GENAU dieser
    // Rahmen inert und aria-busy am Ladezustand trägt.
    assert.equal(
      (code.match(/<div className="calc-page-wrap(?: [\w-]+)*" inert=\{loading\} aria-busy=\{loading \|\| undefined\}>/g) || []).length, 1,
      `${name}: der Seiteninhalt wird während des Vergleichs nicht gesperrt`,
    );
    // Keine zweite Wahrheit neben `loading`: genau ein setLoading(true), und
    // kein eigener Overlay-/Vergleichszustand.
    assert.equal((code.match(/setLoading\(true\)/g) || []).length, 1, `${name}: setLoading(true)`);
    assert.doesNotMatch(code, /\bset(Overlay|ComparisonLoading|Vergleichs?)\w*\(/);
  });

  test(`16 — ${name}: der Fokus nach dem Laden läuft über den gemeinsamen Hook`, () => {
    assert.match(code, /useComparisonLoadingFocus\(loading, \{ offersRef, triggerRef: calcCtaRef \}\)/);
    assert.match(code, /ref=\{calcCtaRef\}/);
    const calc = schnitt(code, "const calculate = async", "\n  };\n", `${name}: calculate`);
    assert.match(calc, /fokusNachVergleich\("angebote"\)/);
    assert.match(calc, /fokusNachVergleich\(norm\.field \? "feld" : "ausloeser", norm\.field\)/);
    assert.match(calc, /fokusNachVergleich\("ausloeser"\)/);
    // Ein Serverfeld wird NICHT mehr während des Ladens fokussiert — es wäre inert.
    assert.doesNotMatch(calc, /focusFirstError\(norm\.field\)/);
    // Der Erfolg meldet sein Ziel VOR dem Ende des Ladens.
    const erfolg = calc.indexOf('fokusNachVergleich("angebote")');
    assert.ok(erfolg !== -1 && erfolg < calc.indexOf("setHasResults(true)", erfolg), `${name}: Reihenfolge`);
  });
}

test("17 — Neue Sendung: die Fehlermeldung am CTA wird vorgelesen", () => {
  assert.match(nurCode(SEITEN[0][1]), /\{error && <div className="alert alert-error mt-16" role="alert">/);
});

test("18 — die Ergebniszeile ist das Fokusziel, per Skript statt per Tab", () => {
  const liste = nurCode(leseQuelle("src/components/offers/OffersList.jsx"));
  assert.equal((liste.match(/<div className="offers-result-count" tabIndex=\{-1\} data-offers-result>/g) || []).length, 1);
  assert.equal(OFFERS_RESULT_SELECTOR, "[data-offers-result]");
});

test("19 — der Hook fokussiert erst nach dem Laden und nur einen verlorenen Fokus", () => {
  const code = nurCode(HOOK);
  assert.match(code, /useLayoutEffect\(\(\) => \{\s*if \(loading\) return;/);
  assert.match(code, /const fokusVerloren = !aktiv \|\| aktiv === document\.body;/);
  assert.match(code, /revealOffers\(offersRef\.current, undefined, \{ sofort: true \}\);\s*if \(fokusVerloren\) focusOffersResult\(offersRef\.current\);/);
  assert.match(code, /if \(!fokusVerloren\) return;/);
  assert.match(code, /focusFirstError\(ziel\.feld\)/);
  assert.match(code, /knopf\.focus\(\{ preventScroll: true \}\);/);
  // Die bestehende Meldung steht im selben CTA-Bereich und kommt mit ins Bild.
  assert.match(code, /knopf\.closest\("\.offers-calc-cta"\)\?\.scrollIntoView\(\{ behavior: offersScrollBehavior\(nurBewegung\), block: "nearest" \}\);/);
  for (const [name, quelle] of SEITEN) {
    assert.match(nurCode(quelle), /<div className="offers-calc-cta">[\s\S]*?ref=\{calcCtaRef\}/, `${name}: CTA liegt nicht im CTA-Bereich`);
  }
});

/* ── 7. Enthüllen und Fokus ─────────────────────────────────────────────── */

test("19b — nach einem Vergleich springt der Bereich sofort ins Bild, sonst bleibt es bei der Bewegungsregel", () => {
  const aufrufe = [];
  const el = { scrollIntoView: (o) => aufrufe.push(o) };
  const weich = () => ({ matches: false });
  assert.equal(revealOffers(el, weich, { sofort: true }), true);
  assert.equal(revealOffers(el, weich), true);
  assert.deepEqual(aufrufe, [{ behavior: "instant", block: "start" }, { behavior: "smooth", block: "start" }]);
});

test("20 — focusOffersResult: Ergebniszeile fokussieren, ohne selbst zu scrollen", () => {
  let gefragt = null, optionen = null;
  const ziel = { focus: (o) => { optionen = o; } };
  const bereich = { querySelector: (s) => { gefragt = s; return ziel; } };
  assert.equal(focusOffersResult(bereich), true);
  assert.equal(gefragt, "[data-offers-result]");
  assert.deepEqual(optionen, { preventScroll: true });
});

test("21 — focusOffersResult: ohne Bereich oder Ziel passiert nichts", () => {
  assert.equal(focusOffersResult(null), false);
  assert.equal(focusOffersResult({}), false);
  assert.equal(focusOffersResult({ querySelector: () => null }), false);
  assert.equal(focusOffersResult({ querySelector: () => ({}) }), false);
});

test("22 — focusOffersResult: ältere focus()-Signatur ohne Optionen", () => {
  let aufrufe = 0;
  const ziel = { focus: (o) => { aufrufe += 1; if (o) throw new TypeError("keine Optionen"); } };
  assert.equal(focusOffersResult({ querySelector: () => ziel }), true);
  assert.equal(aufrufe, 2);
});

/* ── 8. Läuft mit ───────────────────────────────────────────────────────── */

test("23 — Unit- und Browserprüfung laufen tatsächlich mit", () => {
  pruefeImTestlauf("src/utils/comparisonLoadingView.test.mjs");
  pruefeImE2eLauf("tests/e2e/offerComparisonLoading.test.mjs");
});
