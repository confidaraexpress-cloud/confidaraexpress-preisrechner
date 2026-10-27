// Konzept A (öffentlicher Preisrechner): die Strecke auf der Nachtkarte — rein darstellend, ohne erfundenen Ort.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { kartenPunkt, kartenStrecke, routenBogen, KARTE_VB } from "./nachtkarteRoute.mjs";

const hier = path.dirname(fileURLToPath(import.meta.url));

test("1 — bekannte Orte liegen genau, mit Namen; Schreibweisen und Umlaute werden erkannt", () => {
  const s = kartenPunkt("DE", "70173", "Stuttgart");
  assert.equal(s.genau, true);
  assert.equal(s.name, "Stuttgart");
  assert.equal(kartenPunkt("DE", "", "muenchen").name, "München");
  assert.equal(kartenPunkt("AT", "1010", "Vienna").name, "Wien");
  assert.equal(kartenPunkt("PL", "", "Kraków").name, "Krakau");
});

test("2 — unbekannter Ort: Leitzone der PLZ bzw. Hauptstadt, aber ohne Namen", () => {
  const zone = kartenPunkt("DE", "72622", "Nürtingen-Hardt");
  assert.equal(zone.genau, false);
  assert.equal(zone.name, null);
  assert.deepEqual([zone.x, zone.y], [kartenPunkt("DE", "", "Stuttgart").x, kartenPunkt("DE", "", "Stuttgart").y]);
  const haupt = kartenPunkt("FR", "", "Petit Village");
  assert.equal(haupt.name, null);
  assert.equal(haupt.x, kartenPunkt("FR", "", "Paris").x);
  // Ein Ort, der in einem anderen Land liegt, gilt nicht als bekannt.
  assert.equal(kartenPunkt("AT", "", "Berlin").name, null);
});

test("3 — Länder ohne eigenen Punkt bekommen keine Strecke (keine Behauptung über einen falschen Ort)", () => {
  assert.equal(kartenPunkt("CY", "", "Nikosia"), null);
  assert.equal(kartenPunkt("", "", ""), null);
  assert.equal(kartenStrecke({ from_country: "DE", from_zip: "70173", to_country: "CY", to_city: "Nikosia" }), null);
});

test("4 — Strecke erst mit beiden Seiten; gleiche Punkte ergeben keinen Bogen", () => {
  assert.equal(kartenStrecke({ from_country: "DE", from_zip: "70173", to_country: "AT" }), null);
  assert.equal(kartenStrecke({ from_country: "DE", from_city: "Stuttgart", to_country: "DE", to_city: "Stuttgart" }), null);
  const s = kartenStrecke({ from_country: "DE", from_zip: "70173", from_city: "Stuttgart", to_country: "AT", to_zip: "1070", to_city: "Wien" });
  assert.match(s.pfad, /^M-?\d+(\.\d)?,-?\d+(\.\d)? Q-?\d+(\.\d)?,-?\d+(\.\d)? -?\d+(\.\d)?,-?\d+(\.\d)?$/);
  for (const p of [s.von, s.nach]) {
    assert.ok(p.left > 0 && p.left < 100 && p.top > 0 && p.top < 100, `Lage außerhalb des Bilds: ${JSON.stringify(p)}`);
  }
  assert.equal(s.von.name, "Stuttgart");
  assert.equal(s.nach.name, "Wien");
});

test("5 — der Bogen wölbt sich nach Norden (kleinere y) und hat den Ausschnitt des Kartenbilds", () => {
  const a = { x: 0, y: 0 }, b = { x: 100, y: 0 };
  const q = routenBogen(a, b).match(/Q(-?[\d.]+),(-?[\d.]+)/);
  assert.ok(Number(q[2]) < 0, "der Kontrollpunkt liegt nicht nördlich");
  assert.equal(routenBogen(a, a), null);
  const svg = readFileSync(path.join(hier, "../assets/illustrations/nachtkarte-eu.svg"), "utf8");
  assert.ok(svg.includes(`viewBox="${KARTE_VB.x} ${KARTE_VB.y} ${KARTE_VB.w} ${KARTE_VB.h}"`),
    "Kartenbild und Ortsdaten haben nicht denselben Ausschnitt");
});
