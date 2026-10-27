// Lichter der Nachtkarte (Premium-Redesign, Konzept A): deterministisch, auf echten Stadtpositionen, nie im
// Gleichtakt, und die Einstiegswelle beginnt dort, wo das Stylesheet sie beginnen lässt (Stuttgart).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { nachtkartenLichter, wellenUrsprung, WELLE_DAUER_MS } from "./nachtkarteLichter.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(HIER, "..", "styles", "nachtkarte.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

test("1 — dieselbe Liste bei jedem Aufruf, eindeutige Orte, alle auf der Karte", () => {
  const a = nachtkartenLichter();
  assert.deepEqual(a, nachtkartenLichter());
  assert.ok(a.length >= 30 && a.length <= 70, `Anzahl ${a.length}`);
  assert.equal(new Set(a.map((l) => l.key)).size, a.length);
  for (const l of a) {
    assert.ok(l.left > 0 && l.left < 100 && l.top > 0 && l.top < 100, `${l.key} liegt außerhalb`);
  }
});

test("2 — kein Gleichtakt: eigene Perioden zwischen 6 und 11 s, Einsatz nach der Welle", () => {
  const a = nachtkartenLichter();
  const dauern = new Set(a.map((l) => l.dauer));
  assert.ok(dauern.size >= a.length * 0.8, "fast jede Periode ist eigen");
  for (const l of a) {
    assert.ok(l.dauer >= 6000 && l.dauer <= 11000, `${l.key} Dauer ${l.dauer}`);
    assert.ok(l.einsatz >= 0 && l.einsatz <= WELLE_DAUER_MS + l.dauer, `${l.key} Einsatz ${l.einsatz}`);
    assert.ok(l.groesse >= 14 && l.groesse <= 28, `${l.key} Größe ${l.groesse}`);
  }
});

test("3 — die Welle beginnt in Stuttgart, wie im Stylesheet", () => {
  const u = wellenUrsprung();
  assert.match(css, new RegExp(`circle at ${u.left}% ${u.top}%`), `Ursprung ${u.left}% / ${u.top}% fehlt in nachtkarte.css`);
  assert.match(css, new RegExp(`animation: nk-welle ${WELLE_DAUER_MS}ms`), "Dauer der Welle weicht ab");
});

test("4 — reduzierte Bewegung: keine Welle, keine Lichter", () => {
  const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(block, /\.nk-welle \{[^}]*animation: none/);
  assert.match(block, /\.nk-licht \{ animation: none; opacity: 0; \}/);
});
