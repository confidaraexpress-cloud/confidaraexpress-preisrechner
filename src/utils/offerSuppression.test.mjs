/* Was die Oberfläche ausblendet — und vor allem: was sie NICHT ausblendet.
   Der gefährliche Fehler dieser Datei ist die zu weite Regel: eine fehlende Karte
   fällt niemandem auf. Deshalb messen die meisten Fälle hier das Gegenteil. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  offerHidden, visibleOffers,
  HIDDEN_PUBLIC_CARRIER_ID, HIDDEN_PUBLIC_SERVICE_NAME, HIDDEN_UNAVAILABLE_REASON,
} from "./offerSuppression.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));

/** Die eine Karte, die verschwinden soll. */
const VERBORGEN = Object.freeze({
  offerId: "a".repeat(32),
  publicCarrierId: "ups",
  publicServiceName: "Expressversand",
  unavailableReason: "quote_only",
  bookable: false,
  netPrice: 31.74,
});

const mit = (over) => ({ ...VERBORGEN, ...over });

test("(1) genau diese Kombination verschwindet", () => {
  assert.equal(offerHidden(VERBORGEN), true);
  assert.deepEqual(visibleOffers([VERBORGEN]), []);
  // Und die drei Merkmale stehen als benannte Werte da, nicht als Literale im Code.
  assert.equal(HIDDEN_PUBLIC_CARRIER_ID, "ups");
  assert.equal(HIDDEN_PUBLIC_SERVICE_NAME, "Expressversand");
  assert.equal(HIDDEN_UNAVAILABLE_REASON, "quote_only");
});

test("(2) JEDES einzelne abweichende Merkmal lässt die Karte stehen", () => {
  const abweichungen = [
    { publicCarrierId: "dhl" },
    { publicCarrierId: "dpd" },
    { publicCarrierId: "other" },
    { publicServiceName: "Standardversand" },
    { publicServiceName: "Express" },                    // der Name der 29
    { publicServiceName: "Standardversand Mehrpaket" },
    { unavailableReason: "price_inputs_required" },
    { unavailableReason: "date_unavailable" },
    { unavailableReason: "same_day_unavailable" },
    { unavailableReason: "business_recipient_required" },
    { unavailableReason: null },                          // ein buchbares Angebot
  ];
  for (const a of abweichungen) {
    const t = mit(a);
    assert.equal(offerHidden(t), false, `ausgeblendet: ${JSON.stringify(a)}`);
    assert.deepEqual(visibleOffers([t]), [t], JSON.stringify(a));
  }
});

test("(3) der Vergleich ist strikt — keine Teilzeichenkette, keine Schreibvariante", () => {
  for (const name of ["expressversand", "EXPRESSVERSAND", "Expressversand ", " Expressversand",
                      "Expressversand Mehrpaket", "Express"]) {
    assert.equal(offerHidden(mit({ publicServiceName: name })), false, name);
  }
  for (const carrier of ["UPS", "Ups", "ups-express", "upsx"]) {
    assert.equal(offerHidden(mit({ publicCarrierId: carrier })), false, carrier);
  }
  for (const grund of ["quote_only ", "QUOTE_ONLY", "quote", "quote_only_x"]) {
    assert.equal(offerHidden(mit({ unavailableReason: grund })), false, grund);
  }
});

test("(4) ein fehlendes Feld blendet NICHTS aus — Ausblenden braucht drei Treffer", () => {
  for (const fehlt of ["publicCarrierId", "publicServiceName", "unavailableReason"]) {
    const t = { ...VERBORGEN };
    delete t[fehlt];
    assert.equal(offerHidden(t), false, `ohne ${fehlt} ausgeblendet`);
  }
  assert.equal(offerHidden({}), false);
  assert.equal(offerHidden(null), false);
  assert.equal(offerHidden(undefined), false);
  assert.equal(offerHidden("Expressversand"), false);
  assert.equal(offerHidden(42), false);
});

test("(5) die übrige Liste bleibt in Reihenfolge und Identität unberührt", () => {
  const a = { offerId: "1", publicCarrierId: "ups", publicServiceName: "Standardversand",
              unavailableReason: "price_inputs_required" };
  const b = { offerId: "2", publicCarrierId: "dhl", publicServiceName: "Expressversand",
              unavailableReason: null };
  const c = { offerId: "3", publicCarrierId: "ups", publicServiceName: "Expressversand",
              unavailableReason: null };
  const liste = [a, VERBORGEN, b, VERBORGEN, c];
  const sichtbar = visibleOffers(liste);
  assert.deepEqual(sichtbar.map((t) => t.offerId), ["1", "2", "3"]);
  // Dieselben Objekte, nicht Kopien: die Auswahl vergleicht Identitäten.
  assert.equal(sichtbar[0], a);
  assert.equal(sichtbar[1], b);
  assert.equal(sichtbar[2], c);
  // Und die Eingabe wird nicht verändert.
  assert.equal(liste.length, 5);
});

test("(6) eine unbrauchbare Eingabe ergibt eine leere Liste — wie der bisherige Rückfall", () => {
  for (const w of [null, undefined, {}, "", 0, { tariffs: [] }]) {
    assert.deepEqual(visibleOffers(w), [], JSON.stringify(w));
  }
  assert.deepEqual(visibleOffers([]), []);
});

test("(7) die Ausblendung steht an GENAU EINER Stelle — und vor Sortierung und Filtern", () => {
  // Wäre sie erst in der Kartenkomponente, bliebe die Karte in Zählern, Sortierung und
  // Auswahl bestehen. Gemessen wird deshalb, WO sie angewandt wird.
  const seiten = ["../pages/CalculatorPage.jsx", "../pages/NewShipmentPage.jsx"];
  for (const rel of seiten) {
    const quelle = fs.readFileSync(path.join(HIER, rel), "utf8");
    assert.match(quelle, /setTariffs\(visibleOffers\(d\.tariffs\)\)/,
      `${rel}: die Antwort wird nicht gefiltert`);
    assert.doesNotMatch(quelle, /setTariffs\(d\.tariffs\s*\|\|\s*\[\]\)/,
      `${rel}: ungefilterter Pfad noch vorhanden`);
  }
  // Kein zweiter Ort im Produktionsbaum kennt die Merkmalskombination.
  const nutzer = [];
  const lauf = (verz) => {
    for (const e of fs.readdirSync(verz, { withFileTypes: true })) {
      const p = path.join(verz, e.name);
      if (e.isDirectory()) { lauf(p); continue; }
      if (!/\.(jsx?|mjs)$/.test(e.name) || /\.test\.mjs$/.test(e.name)) continue;
      if (p.endsWith("offerSuppression.mjs")) continue;
      const code = fs.readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (code.includes('"quote_only"') && code.includes('"Expressversand"')) nutzer.push(p);
    }
  };
  lauf(path.join(HIER, ".."));
  assert.deepEqual(nutzer, [], `zweite Stelle mit derselben Regel: ${nutzer.join(", ")}`);
});
