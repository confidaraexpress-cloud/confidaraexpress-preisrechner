/* „Angebote vergleichen" muss bei wiederverwendeten Ergebnissen sichtbar reagieren.
 *
 * Vorgeschichte, gemessen im Browser gegen ein gemocktes Backend: Standen für
 * exakt dieselben preisbestimmenden Eingaben bereits Angebote auf der Seite,
 * endete `calculate()` in beiden Seiten mit einem nackten `return`. Ergebnis
 * eines Klicks: 0 Requests (richtig) UND 0 sichtbare Reaktion (falsch) —
 * kein Ladeindikator, kein Scroll, kein DOM-Update, keine Meldung. Der Knopf
 * wirkte tot; für den Nutzer war das ununterscheidbar von „lädt nicht".
 *
 * Diese Datei sichert BEIDE Hälften ab:
 *   • das Verhalten der Reaktion selbst (revealOffers/offersScrollBehavior),
 *   • dass der Wiederverwendungszweig beider Seiten nicht wieder zu einem
 *     stillen No-op wird — und dass er dabei weiterhin NICHT rechnet.
 *
 * Run: node --test src/utils/reuseOffersFeedback.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pruefeImTestlauf, ankerPosition } from "../../scripts/governance.mjs";

import { revealOffers, offersScrollBehavior } from "./revealOffers.mjs";

const lies = (p) => readFileSync(path.join(process.cwd(), p), "utf8");
const SEITEN = [
  ["NewShipmentPage", lies("src/pages/NewShipmentPage.jsx")],
  ["CalculatorPage",  lies("src/pages/CalculatorPage.jsx")],
];

/* Schneidet den Rumpf des Wiederverwendungszweigs aus einer Seite heraus —
 * über Klammerzählung, nicht über einen Substring: eine spätere Umformulierung
 * des Kommentars darf den Messpunkt nicht verschieben. */
function reuseZweig(quelltext) {
  const anker = quelltext.indexOf("lastCalcKeyRef.current === calcKeyRef.current");
  assert.notEqual(anker, -1, "Wiederverwendungs-Guard nicht gefunden");
  const start = quelltext.indexOf("{", quelltext.indexOf(")", anker));
  let tiefe = 0;
  for (let i = start; i < quelltext.length; i += 1) {
    if (quelltext[i] === "{") tiefe += 1;
    if (quelltext[i] === "}") { tiefe -= 1; if (tiefe === 0) return quelltext.slice(start + 1, i); }
  }
  throw new Error("Zweigende nicht gefunden");
}

/* Kommentare entfernen: gescannt wird der CODE, nicht die Begründung darüber.
 * Ohne das schlüge eine Erklärung, die `setLoading` erwähnt, falschen Alarm. */
const nurCode = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/* ── 1. Die Reaktion selbst ──────────────────────────────────────────────── */

test("1 — revealOffers scrollt den übergebenen Anker an den Anfang", () => {
  let arg = null;
  const el = { scrollIntoView: (o) => { arg = o; } };
  assert.equal(revealOffers(el, () => ({ matches: false })), true);
  assert.deepEqual(arg, { behavior: "smooth", block: "start" });
});

test("2 — ohne Anker passiert nichts und es wird nichts behauptet", () => {
  assert.equal(revealOffers(null, () => ({ matches: false })), false);
  assert.equal(revealOffers(undefined, null), false);
  assert.equal(revealOffers({}, null), false);          // Element ohne scrollIntoView
});

test("3 — prefers-reduced-motion: reduce erzwingt 'instant', nicht 'auto'", () => {
  // Der Kern dieser Prüfung: `html { scroll-behavior: smooth }` steht in
  // globals.css unbedingt. `behavior: "auto"` heißt laut Spezifikation „nimm
  // den CSS-Wert" — also weiterhin smooth. Wer hier auf "auto" zurückfällt,
  // ignoriert die Nutzereinstellung, ohne dass es im Code auffiele.
  assert.equal(offersScrollBehavior(() => ({ matches: true })), "instant");
  assert.notEqual(offersScrollBehavior(() => ({ matches: true })), "auto");

  let arg = null;
  revealOffers({ scrollIntoView: (o) => { arg = o; } }, () => ({ matches: true }));
  assert.equal(arg.behavior, "instant");
  assert.equal(arg.block, "start");
});

test("4 — ohne matchMedia bleibt es bei der Standardbewegung", () => {
  assert.equal(offersScrollBehavior(null), "smooth");
  assert.equal(offersScrollBehavior(undefined), "smooth");
  assert.equal(offersScrollBehavior(() => null), "smooth");
});

test("5 — die Abfrage lautet exakt auf prefers-reduced-motion", () => {
  const gefragt = [];
  offersScrollBehavior((q) => { gefragt.push(q); return { matches: false }; });
  assert.deepEqual(gefragt, ["(prefers-reduced-motion: reduce)"]);
});

/* ── 2. Der Zweig in beiden Seiten ───────────────────────────────────────── */

for (const [name, quelle] of SEITEN) {
  test(`6 — ${name}: der Wiederverwendungszweig ist kein stilles No-op mehr`, () => {
    const zweig = nurCode(reuseZweig(quelle));
    assert.match(zweig, /revealOffers\(\s*offersRef\.current\s*\)/,
      `${name}: der Zweig endet wieder ohne sichtbare Reaktion — genau der behobene Fehler`);
    assert.match(zweig, /\breturn;/, `${name}: der Zweig muss weiterhin abbrechen`);
  });

  test(`7 — ${name}: der Zweig löst KEINE Berechnung und keinen Ladezustand aus`, () => {
    const zweig = nurCode(reuseZweig(quelle));
    for (const verboten of [
      /apiFetch/, /calculate-price/, /setLoading/, /setTimeout/,
      /setTariffs/, /setHasResults/, /setSorted/, /setSelected/,
      /setSortMode/, /upd\(/, /invalidateResults/, /calcInFlight/,
    ]) {
      assert.doesNotMatch(zweig, verboten,
        `${name}: ${verboten} gehört nicht in den Wiederverwendungszweig — dort wird nichts gerechnet und nichts zurückgesetzt`);
    }
  });

  test(`8 — ${name}: die vier Guard-Bedingungen sind unverändert`, () => {
    // Fail-closed: beide Anker müssen existieren und in dieser Reihenfolge stehen —
    // sonst wüchse der Ausschnitt still über die halbe Datei und die vier
    // includes-Prüfungen wären vakuum-wahr.
    const inFlight = ankerPosition(quelle, "calcInFlight.current) return;", `${name}: In-Flight-Guard (8)`);
    const guardStart = quelle.indexOf("if (", inFlight);
    const guardEnde = ankerPosition(quelle, "lastCalcKeyRef.current === calcKeyRef.current", `${name}: Guard-Ende (8)`);
    assert.ok(guardStart !== -1 && guardStart < guardEnde, `${name}: Guard-Kopf nicht gefunden (8)`);
    const kopf = quelle.slice(guardStart, guardEnde + 60);
    for (const teil of [
      "hasResults", "tariffs.length > 0",
      'lastCalcKeyRef.current !== ""', "lastCalcKeyRef.current === calcKeyRef.current",
    ]) {
      assert.ok(kopf.includes(teil), `${name}: Guard-Bedingung ${teil} fehlt`);
    }
  });

  test(`9 — ${name}: es gibt genau EINEN Anker für die Angebote`, () => {
    assert.equal((quelle.match(/ref=\{offersRef\}/g) || []).length, 1,
      `${name}: zwei Angebotsanker — dann entscheidet die Renderreihenfolge, wohin gescrollt wird`);
    assert.match(quelle, /import \{ revealOffers \} from "\.\.\/utils\/revealOffers\.mjs";/);
  });

  test(`10 — ${name}: kein Toast und kein künstlicher Ladezustand daneben`, () => {
    const zweig = nurCode(reuseZweig(quelle));
    // „Angebote bereits aktuell" o. ä. wäre eine zweite Meldungsarchitektur für
    // einen Fall, den der Scroll bereits wahrheitsgemäß beantwortet.
    assert.doesNotMatch(zweig, /toast|Toast|notify|Snackbar/);
    // Der Zweig leert die bestehende Fehlermeldung — mehr Zustand fasst er nicht an.
    assert.match(zweig, /setError\((""|null)\)/, `${name}: setError-Zurücksetzung verloren`);
  });
}

/* ── 3. Beide Seiten teilen sich EINE Regel ──────────────────────────────── */

test("11 — keine Drift: beide Seiten rufen dieselbe Hilfsfunktion", () => {
  const rufe = SEITEN.map(([, q]) => (nurCode(reuseZweig(q)).match(/revealOffers\([^)]*\)/) || [])[0]);
  assert.equal(rufe[0], rufe[1], "die beiden Seiten reagieren unterschiedlich");
  assert.ok(rufe[0], "kein Aufruf gefunden");
});

test("12 — die Scrollregel steht an genau EINER Stelle", () => {
  const helfer = lies("src/utils/revealOffers.mjs");
  assert.match(helfer, /prefers-reduced-motion: reduce/);
  for (const [name, quelle] of SEITEN) {
    const zweig = nurCode(reuseZweig(quelle));
    assert.doesNotMatch(zweig, /scrollIntoView|prefers-reduced-motion|matchMedia/,
      `${name}: eigene Scrollregel im Zweig statt der gemeinsamen Funktion`);
  }
});

test("13 — diese Datei läuft im Unit-Testlauf tatsächlich mit", () => {
  pruefeImTestlauf("src/utils/reuseOffersFeedback.test.mjs");
});
