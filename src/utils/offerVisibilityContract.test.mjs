/* Beide Providerangebote bleiben sichtbar (Betreiberentscheidung 2026-10-02).
   Kein Netz, kein Browser, keine Buchung.

   Ein Angebot wird NIE wegen eines konkurrierenden Providerpreises verborgen. Bis 2026-10-02 blendete die
   Oberfläche die Kombination UPS · „Expressversand" · `quote_only` aus (utils/offerSuppression.mjs, 2026-09-23);
   diese historische Sonderunterdrückung ist entfernt. Was angeboten wird, entscheidet der Server — die Oberfläche
   zeigt jedes gelieferte Angebot und KENNZEICHNET ein nicht buchbares („Derzeit nicht direkt buchbar"), statt es
   zu verbergen. Kundenfilter (Versandart, Carrier, Preis, Lieferung) bleiben unberührt.

   Gemessen auf kommentarfreiem Code: die Begründungen an den Stellen nennen die alten Namen. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { offerBlocked, offerBlockedLabel, offerSelectable } from "./offerIdentity.mjs";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => fs.readFileSync(path.join(wurzel, p), "utf8");
const ohneKommentar = (q) => q
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((z) => z.replace(/(^|\s)\/\/.*$/, "")).join("\n");

/* Alle Produktionsquellen unter src/ — relativ, mit „/" (auch unter Windows). */
function quellen(ordner = wurzel) {
  const liste = [];
  for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
    const voll = path.join(ordner, e.name);
    if (e.isDirectory()) liste.push(...quellen(voll));
    else if (/\.(m?js|jsx)$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) {
      liste.push(path.relative(wurzel, voll).split(path.sep).join("/"));
    }
  }
  return liste;
}

test("1 — die historische Sonderunterdrückung ist entfernt, und keine Quelle blendet wieder aus", () => {
  assert.equal(fs.existsSync(path.join(wurzel, "utils", "offerSuppression.mjs")), false,
    "utils/offerSuppression.mjs existiert wieder");
  const alle = quellen();
  assert.ok(alle.includes("pages/NewShipmentPage.jsx") && alle.length > 50, "die Quellsuche fand nichts");
  for (const datei of alle) {
    const code = ohneKommentar(lies(datei));
    assert.ok(!/offerSuppression|visibleOffers|offerHidden|HIDDEN_PUBLIC_/.test(code), `${datei} blendet wieder Angebote aus`);
  }
});

test("2 — beide Berechnungen übernehmen die Serverliste unverändert", () => {
  for (const seite of ["pages/NewShipmentPage.jsx", "pages/CalculatorPage.jsx"]) {
    const code = ohneKommentar(lies(seite));
    assert.equal((code.match(/setTariffs\(Array\.isArray\(d\.tariffs\) \? d\.tariffs : \[\]\);/g) || []).length, 1,
      `${seite}: die Serverliste wird nicht mehr unverändert übernommen`);
    assert.ok(!/d\.tariffs\)?\s*\.filter\(/.test(code), `${seite} filtert die Serverliste`);
  }
});

test("3 — `quote_only` ist eine Kennzeichnung, keine Ausblendung", () => {
  // Genau eine Produktionsquelle kennt den Grund: die Übersetzung in einen Kundensatz.
  const kenner = quellen().filter((d) => ohneKommentar(lies(d)).includes("quote_only"));
  assert.deepEqual(kenner, ["utils/offerIdentity.mjs"]);
  // Das früher verborgene Angebot ist sichtbar gesperrt — mit Grund, nicht auswählbar, nicht verschwunden.
  const frueherVerborgen = { offerId: "e".repeat(32), publicCarrierId: "ups", publicServiceName: "Expressversand",
                             netPrice: 20, vatAmount: 3.8, finalPrice: 23.8, bookable: false, unavailableReason: "quote_only" };
  assert.equal(offerBlocked(frueherVerborgen), true);
  assert.equal(offerSelectable(frueherVerborgen), false);
  assert.equal(offerBlockedLabel(frueherVerborgen), "Derzeit nicht direkt buchbar");
});
