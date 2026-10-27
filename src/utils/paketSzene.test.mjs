// Paketbühne (Premium-Redesign, Konzept B): die Zeichnung folgt den eingegebenen Maßen — proportional, mit einem
// gemeinsamen Faktor, in der Bühne, ohne Maßstabsbehauptung. Geprüft an den Matrizen, die das Stylesheet als
// CSS-Transform übernimmt.
import test from "node:test";
import assert from "node:assert/strict";
import { PAKET_BUEHNE, BEISPIEL_MASSE, matrixText, paketBeschriftung, paketSzene, paketZahl } from "./paketSzene.mjs";

const zeile = (length, width, height, weight = "", packageCount = "1") => ({ key: "z", packageCount, weight, length, width, height });
const werte = (m) => m.replace(/^matrix\(|\)$/g, "").split(",").map(Number);
const laenge = (a, b) => Math.hypot(a, b);
const nbsp = String.fromCharCode(0xa0);

test("1 — Zahlen wie im Formular: Komma, nur positive Werte", () => {
  assert.equal(paketZahl("2,5"), 2.5);
  assert.equal(paketZahl(" 40 "), 40);
  assert.equal(paketZahl(12), 12);
  for (const leer of ["", "  ", "0", "-3", "abc", null, undefined]) assert.equal(paketZahl(leer), null, String(leer));
});

test("2 — ohne Maße steht das Beispielpaket, ohne Kantenmaße", () => {
  const s = paketSzene([zeile("", "", "")]);
  assert.equal(s.beispiel, true);
  assert.equal(s.vollstaendig, false);
  assert.equal(s.kartons.length, 1);
  assert.deepEqual(s.masse, []);
  const [a, b, c, d] = werte(s.kartons[0].oben);
  assert.ok(Math.abs(laenge(a, b) / laenge(c, d) - BEISPIEL_MASSE.laenge / BEISPIEL_MASSE.breite) < 0.02);
  assert.equal(paketBeschriftung([zeile("", "", "")]).titel, "Maße eingeben – das Paket nimmt Form an");
});

test("3 — proportional: die Kanten stehen im Verhältnis der Maße, mit einem gemeinsamen Faktor", () => {
  const s = paketSzene([zeile("60", "20", "30")]);
  const [a, b, c, d] = werte(s.kartons[0].oben);
  const [, , , dr] = werte(s.kartons[0].rechts);
  const L = laenge(a, b), B = laenge(c, d), H = Math.abs(dr);
  assert.ok(Math.abs(L / B - 3) < 0.02, `L:B ${L / B}`);
  assert.ok(Math.abs(H / B - 1.5) < 0.02, `H:B ${H / B}`);
  assert.ok(Math.abs(L / s.faktor - 60) < 0.2, "derselbe Faktor für die Länge");
  assert.ok(Math.abs(H / s.faktor - 30) < 0.2, "derselbe Faktor für die Höhe");
});

test("4 — jede Änderung eines Maßes ändert die Geometrie sichtbar", () => {
  const basis = paketSzene([zeile("40", "30", "20")]).kartons[0];
  const laenger = paketSzene([zeile("80", "30", "20")]).kartons[0];
  const breiter = paketSzene([zeile("40", "60", "20")]).kartons[0];
  const hoeher = paketSzene([zeile("40", "30", "45")]).kartons[0];
  for (const [name, k] of [["Länge", laenger], ["Breite", breiter], ["Höhe", hoeher]]) {
    assert.notEqual(k.oben + k.rechts + k.links, basis.oben + basis.rechts + basis.links, `${name} ändert nichts`);
  }
  // Höhe ändert die senkrechte Kante, nicht das Verhältnis der Grundfläche.
  const g = (k) => { const [a, b, c, d] = werte(k.oben); return laenge(a, b) / laenge(c, d); };
  assert.ok(Math.abs(g(hoeher) - g(basis)) < 0.01);
  assert.ok(g(laenger) > g(basis) && g(breiter) < g(basis));
});

test("5 — Orientierung: jede Flächenmatrix hat eine positive Determinante (stabile Interpolation)", () => {
  for (const masse of [["40", "30", "20"], ["300", "10", "5"], ["5", "5", "120"], ["", "", ""]]) {
    const s = paketSzene([zeile(...masse)]);
    for (const k of s.kartons) {
      for (const f of ["oben", "rechts", "links", "bandOben", "bandSeite", "etikett"]) {
        if (!k[f]) continue;
        const [a, b, c, d] = werte(k[f]);
        assert.ok(a * d - b * c > 0, `${masse.join("×")} ${f}`);
      }
    }
  }
});

test("6 — alles liegt in der Bühne, auch bei extremen Maßen", () => {
  const { breite, boden } = PAKET_BUEHNE;
  for (const masse of [["300", "300", "300"], ["300", "10", "5"], ["5", "5", "300"], ["1", "1", "1"], ["120", "80", "60"]]) {
    const s = paketSzene([zeile(...masse, "", "2")]);
    for (const k of s.kartons) {
      for (const f of ["oben", "rechts", "links"]) {
        const [a, b, c, d, e, g] = werte(k[f]);
        for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const x = a * u + c * v + e, y = b * u + d * v + g;
          assert.ok(x >= -0.5 && x <= breite + 0.5, `${masse} ${f} x=${x}`);
          assert.ok(y >= -0.5 && y <= boden + 0.5, `${masse} ${f} y=${y}`);
        }
      }
    }
  }
});

test("7 — Menge: höchstens zwei Kartons gestapelt; höchstens drei Größen nebeneinander", () => {
  assert.equal(paketSzene([zeile("40", "30", "20", "2", "1")]).kartons.length, 1);
  assert.equal(paketSzene([zeile("40", "30", "20", "2", "2")]).kartons.length, 2);
  assert.equal(paketSzene([zeile("40", "30", "20", "2", "99")]).kartons.length, 2);
  const vier = [zeile("40", "30", "20"), zeile("30", "20", "10"), zeile("20", "20", "20"), zeile("50", "40", "30")];
  const s = paketSzene(vier);
  assert.equal(new Set(s.kartons.map((k) => k.zeile)).size, 3);
  assert.equal(s.zeilenGesamt, 4);
  assert.match(paketBeschriftung(vier).details, /ersten 3 Größen/);
});

test("8 — Kantenmaße nur für eingegebene Werte und nur bei einer Größe", () => {
  assert.deepEqual(paketSzene([zeile("40", "", "")]).masse.map((m) => m.id), ["laenge"]);
  assert.deepEqual(paketSzene([zeile("40", "30", "20")]).masse.map((m) => m.text), ["40 cm", "30 cm", "20 cm"]);
  assert.deepEqual(paketSzene([zeile("40", "30", "20"), zeile("20", "20", "20")]).masse, []);
  assert.equal(paketSzene([zeile("40", "", "")]).vollstaendig, false);
});

test("9 — kleine Pakete bleiben kleiner als große (Bezugsgröße), sehr kleine bleiben sichtbar", () => {
  const klein = paketSzene([zeile("20", "15", "10")]);
  const mittel = paketSzene([zeile("40", "30", "20")]);
  const breiteVon = (s) => { const [a, b] = werte(s.kartons[0].oben); return laenge(a, b); };
  assert.ok(breiteVon(klein) < breiteVon(mittel), "ein kleineres Paket wird kleiner gezeichnet");
  const winzig = paketSzene([zeile("2", "2", "2")]);
  const [a, , c] = werte(winzig.kartons[0].oben);
  assert.ok(Math.abs(a) + Math.abs(c) >= 0.3 * PAKET_BUEHNE.breite - 1, "mindestens 30 % der Bühnenbreite");
});

test("10 — Etikett nur, wenn es auf die Vorderseite passt", () => {
  assert.ok(paketSzene([zeile("40", "30", "20")]).kartons[0].etikett);
  assert.equal(paketSzene([zeile("15", "30", "20")]).kartons[0].etikett, null);
  assert.equal(paketSzene([zeile("40", "30", "10")]).kartons[0].etikett, null);
});

test("11 — Beschriftung: Werte mit geschützten Leerzeichen, Gewicht je Paket, Summen", () => {
  assert.equal(paketBeschriftung([zeile("40", "30", "24", "2,5")]).titel, `1${nbsp}Paket · 40${nbsp}×${nbsp}30${nbsp}×${nbsp}24${nbsp}cm · 2,5${nbsp}kg`);
  assert.equal(paketBeschriftung([zeile("40", "", "24")]).titel, `1${nbsp}Paket · 40${nbsp}×${nbsp}–${nbsp}×${nbsp}24${nbsp}cm`);
  assert.match(paketBeschriftung([zeile("40", "30", "24", "2", "3")]).titel, /3.Pakete .* 2.kg je Paket/);
  assert.equal(paketBeschriftung([zeile("40", "30", "24", "2", "2"), zeile("20", "20", "20", "1,5")]).titel, `3${nbsp}Pakete · 5,5${nbsp}kg gesamt`);
  assert.equal(paketBeschriftung([zeile("40", "30", "24", "", "2"), zeile("20", "20", "20", "1,5")]).titel, `3${nbsp}Pakete in 2 Größen`);
});

test("12 — Matrizen sind kurz und deterministisch", () => {
  assert.equal(matrixText([1, 0.333333, -2.555555, 4, 10.004, 20]), "matrix(1, 0.33, -2.56, 4, 10, 20)");
  assert.deepEqual(paketSzene([zeile("40", "30", "20")]), paketSzene([zeile("40", "30", "20")]));
});
