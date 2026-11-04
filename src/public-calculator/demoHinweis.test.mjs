// Demo-Hinweis des öffentlichen Preisrechners (P2, Betreiberentscheidung 2026-11-04): die reine Entscheidung, der
// Herkunftsparameter und der Merker der Tab-Sitzung — ohne DOM. Das Verhalten im Browser (Fokus, Escape, Schleier,
// Reload, neuer Tab, Rückkehr aus der Demo) prüft tests/e2e/publicCalculatorDemoHinweis.test.mjs.
//
// Run: node --test src/public-calculator/demoHinweis.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_HINWEIS_SCHLUESSEL, HERKUNFT_DEMO, adresseOhneHerkunft, demoHinweisMerker, demoHinweisZeigen, kommtAusDemo,
} from "./demoHinweis.mjs";
import { DEMO_ZIELE } from "../demo/demoModus.mjs";

/** Ein sessionStorage-Ersatz, der mitzählt — oder wirft wie ein gesperrter Speicher. */
function speicher({ sperrt = false } = {}) {
  const werte = new Map();
  const zugriffe = [];
  const s = {
    getItem: (k) => { zugriffe.push(["get", k]); if (sperrt) throw new Error("SecurityError"); return werte.has(k) ? werte.get(k) : null; },
    setItem: (k, v) => { zugriffe.push(["set", k, v]); if (sperrt) throw new Error("QuotaExceededError"); werte.set(k, String(v)); },
  };
  return { s, werte, zugriffe };
}

test("1 — gefragt wird, solange in diesem Tab nicht entschieden ist und der Besuch nicht aus der Demo kommt", () => {
  assert.equal(demoHinweisZeigen({ entschieden: false, ausDemo: false }), true);
  assert.equal(demoHinweisZeigen({ entschieden: true, ausDemo: false }), false, "nach einer Entscheidung nie wieder");
  assert.equal(demoHinweisZeigen({ entschieden: false, ausDemo: true }), false, "nach der Demo nicht noch einmal");
  assert.equal(demoHinweisZeigen({ entschieden: true, ausDemo: true }), false);
  assert.equal(demoHinweisZeigen({}), true, "unbekannt heißt: nicht entschieden");
});

test("2 — Herkunft aus der Demo: genau ?von=demo, an jeder Stelle der Suche", () => {
  assert.deepEqual(HERKUNFT_DEMO, { name: "von", wert: "demo" });
  for (const s of ["?von=demo", "?a=1&von=demo", "?von=demo&b=2"]) assert.equal(kommtAusDemo(s), true, s);
  for (const s of ["", "?", "?von=Demo", "?von=demo2", "?von=", "?vom=demo", "?demo", undefined, null, 7]) {
    assert.equal(kommtAusDemo(s), false, String(s));
  }
  // Die Demo hängt den Parameter an jeden Rückweg zum Preisrechner (Demo-Leiste, Demo-Ende, Hinweis ohne Demo).
  const ziel = new URL(DEMO_ZIELE.preisrechner);
  assert.equal(`${ziel.origin}${ziel.pathname}`, "https://preisrechner.confidaraexpress.de/");
  assert.equal(kommtAusDemo(ziel.search), true);
});

test("3 — die Adresse verliert nur den Herkunftsparameter; Pfad, übrige Parameter und Anker bleiben, absolut", () => {
  const PR = "https://preisrechner.confidaraexpress.de";
  assert.equal(adresseOhneHerkunft(`${PR}/?von=demo`), `${PR}/`);
  assert.equal(adresseOhneHerkunft(`${PR}/?a=1&von=demo#pc-results`), `${PR}/?a=1#pc-results`);
  // „…de//?von=demo“ liefert nginx aus (Schrägstriche zusammengefasst); ein relatives „//“ wäre eine Adresse ohne
  // Host und ließe replaceState werfen — die absolute Adresse bleibt auf dieser Seite.
  for (const href of [`${PR}//?von=demo`, `${PR}//x/?von=demo#a`, `${PR}/?von=demo&von=demo`]) {
    const ohne = adresseOhneHerkunft(href);
    assert.equal(new URL(ohne).origin, PR, href);
    assert.equal(new URL(ohne).searchParams.has("von"), false, href);
    assert.doesNotThrow(() => new URL(ohne, href), href);
  }
  assert.equal(adresseOhneHerkunft(`${PR}/?a=1`), null, "nichts zu entfernen");
  assert.equal(adresseOhneHerkunft("kein Link"), null);
  assert.equal(adresseOhneHerkunft(undefined), null);
});

test("4 — der Merker: ein Schlüssel, „1“ heißt entschieden; ein anderer Wert zählt nicht", () => {
  assert.equal(DEMO_HINWEIS_SCHLUESSEL, "ce-preisrechner-demo-hinweis");
  const { s, werte, zugriffe } = speicher();
  const m = demoHinweisMerker(() => s);
  assert.equal(m.entschieden(), false);
  m.merken();
  assert.deepEqual([...werte], [[DEMO_HINWEIS_SCHLUESSEL, "1"]], "nur der eine Schlüssel, ohne weitere Daten");
  assert.equal(m.entschieden(), true);
  // Ein neuer Merker (Reload derselben Tab-Sitzung) liest den gespeicherten Stand.
  assert.equal(demoHinweisMerker(() => s).entschieden(), true);
  assert.ok(zugriffe.every(([, k]) => k === DEMO_HINWEIS_SCHLUESSEL));
  // Ein fremder Wert ist keine Entscheidung.
  const fremd = speicher();
  fremd.s.setItem(DEMO_HINWEIS_SCHLUESSEL, "ja");
  assert.equal(demoHinweisMerker(() => fremd.s).entschieden(), false);
  // Ein neuer Tab hat einen leeren Speicher: es wird wieder gefragt.
  assert.equal(demoHinweisMerker(() => speicher().s).entschieden(), false);
});

test("5 — gesperrter Speicher: nie ein Fehler, die Seite merkt sich die Entscheidung selbst", () => {
  for (const quelle of [() => speicher({ sperrt: true }).s, () => { throw new Error("SecurityError"); }, () => null]) {
    const m = demoHinweisMerker(quelle);
    assert.doesNotThrow(() => m.entschieden());
    assert.equal(m.entschieden(), false);
    assert.doesNotThrow(() => m.merken());
    assert.equal(m.entschieden(), true, "nach der Entscheidung fragt diese Seite nicht erneut");
  }
});
