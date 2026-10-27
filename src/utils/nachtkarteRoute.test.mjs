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

test("6 — der Lichtpunkt läuft auf dem Bogen, mit der Kurve der Linie, von Start bis Ziel", async () => {
  const { lichtpunktStuetzen, kubischeKurve, LICHTPUNKT_STUETZEN } = await import("./nachtkarteRoute.mjs");
  const a = { x: -32.4, y: 20.7 }, b = { x: 50.8, y: 29.8 };
  const p = lichtpunktStuetzen(a, b);
  assert.equal(p.length, LICHTPUNKT_STUETZEN);
  assert.deepEqual(p[0], { x: -32.4, y: 20.7 });
  assert.deepEqual(p[p.length - 1], { x: 50.8, y: 29.8 });
  // Nach Norden gewölbt: der Bogen verläuft nördlich (kleineres y) der Verbindungslinie.
  assert.ok(Math.min(...p.map((q) => q.y)) < Math.min(a.y, b.y));
  // Gleiche Zeitabstände, aber früh große Schritte: nach einem Viertel der Zeit ist mehr als die Hälfte geschafft.
  const weg = (q) => Math.hypot(q.x - a.x, q.y - a.y);
  assert.ok(weg(p[3]) > weg(b) * 0.4);
  // Die Kurve der Linie (cubic-bezier(0.2, 0.7, 0.3, 1)): früh schnell, dann ausrollend.
  const kurve = kubischeKurve(0.2, 0.7, 0.3, 1);
  assert.equal(kurve(0), 0);
  assert.equal(kurve(1), 1);
  assert.ok(kurve(0.25) > 0.5, "die Linie hat nach einem Viertel der Zeit mehr als die Hälfte erreicht");
  assert.deepEqual(lichtpunktStuetzen(a, a), []);
  // Die Strecke trägt die Stützpunkte, und das Stylesheet hat genau so viele Schlüsselbilder.
  const s = kartenStrecke({ from_country: "DE", from_city: "Stuttgart", to_country: "AT", to_city: "Wien" });
  assert.equal(s.licht.length, LICHTPUNKT_STUETZEN);
  const css = readFileSync(path.join(hier, "../styles/public-calculator.css"), "utf8");
  const stuetzen = [...css.matchAll(/translate\(var\(--pc-l(\d+)x, 0px\), var\(--pc-l\1y, 0px\)\)/g)].map((m) => Number(m[1]));
  assert.deepEqual(stuetzen, Array.from({ length: LICHTPUNKT_STUETZEN }, (_, i) => i));
});
