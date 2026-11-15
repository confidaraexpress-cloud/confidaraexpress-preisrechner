// Navigationssymbole in Bewegung (Premium Control System 2.0, Betreiberauftrag 2026-11-14): Jedes Symbol der ersten
// Ebene bewegt sich beim Zeigen und beim Tastaturfokus auf seine Art. Diese Tests halten die Zusagen fest:
// dieselbe Geometrie wie <Icon>, die Bewegungen treffen nur vorhandene Teile, nur Transform und Deckkraft,
// Zeigen nur mit echtem Zeiger, nie bei reduzierter Bewegung.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const icon = lies("../ui/Icon.jsx");
const symbol = lies("./NavSymbol.jsx");
const sidebar = lies("./DashboardSidebar.jsx");
const css = lies("../../styles/premium-editorial.css");

const NAV = ["dashboard", "plus", "truck", "routeArrow", "idcard", "invoice", "package", "user"];
const pfad = (n) => icon.match(new RegExp(`\\b${n}:\\s*"([^"]+)"`))?.[1] ?? null;
// Dieselbe Zerlegung wie iconTeile() in Icon.jsx (dort per Anker geprüft, Test 1).
const teile = (d) => d.split(/(?=M)/).filter(Boolean);

const abschnitt = css.slice(css.indexOf("29 · NAVIGATIONSSYMBOLE IN BEWEGUNG"));

test("1 — iconTeile zerlegt genau an jedem absoluten M und ist die einzige Quelle der Teilpfade", () => {
  assert.match(icon, /return typeof d === "string" \? d\.split\(\/\(\?=M\)\/\)\.filter\(Boolean\) : \[\];/);
  assert.match(symbol, /const teile = n === "truck" \? \[\] : iconTeile\(n\);/);
  assert.doesNotMatch(symbol, /\sd="M/, "NavSymbol trägt eigene Pfaddaten");
});

test("2 — die acht Hauptpunkte tragen genau diese Symbole, und jedes außer dem Lieferwagen hat Pfaddaten", () => {
  const imCode = [...sidebar.matchAll(/icon: "([A-Za-z]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(imCode, [...NAV].sort());
  for (const n of NAV.filter((x) => x !== "truck")) {
    const d = pfad(n);
    assert.ok(d, `Pfad für ${n} fehlt in Icon.jsx`);
    // Jeder Teil beginnt mit einem absoluten M (der erste darf mit m beginnen: am Pfadanfang gilt es absolut).
    teile(d).forEach((t, i) => assert.ok(i === 0 ? /^[Mm]/.test(t) : /^M/.test(t), `${n}, Teil ${i + 1}: ${t}`));
    assert.equal(teile(d).join(""), d, `${n}: die Teile ergeben nicht wieder das ganze Symbol`);
  }
  // Die Übersicht besteht aus vier Kacheln mit absoluten M (vorher relativ „m11 0“ — nicht zerlegbar).
  assert.equal(teile(pfad("dashboard")).length, 4);
});

test("3 — die Bewegungen treffen nur vorhandene Teile", () => {
  for (const n of NAV.filter((x) => x !== "truck")) {
    const anzahl = teile(pfad(n)).length;
    const re = new RegExp(`\\.nav-sym--${n}[^{]*?\\.nav-sym-teil--(\\d+)`, "g");
    for (const m of abschnitt.matchAll(re)) {
      const sel = m[0];
      for (const k of sel.matchAll(/nav-sym-teil--(\d+)/g)) {
        assert.ok(Number(k[1]) <= anzahl, `${n}: Teil ${k[1]} angesprochen, das Symbol hat nur ${anzahl}`);
      }
    }
  }
});

test("4 — nur Transform und Deckkraft in den Bewegungen", () => {
  const keyframes = [...abschnitt.matchAll(/@keyframes (nav-sym-[a-z]+) \{([^\n]*)\}/g)];
  assert.ok(keyframes.length >= 9, `nur ${keyframes.length} Bewegungen gefunden`);
  for (const [, name, koerper] of keyframes) {
    for (const p of koerper.matchAll(/([a-z-]+)\s*:/g)) {
      assert.ok(["translate", "rotate", "scale", "transform", "opacity"].includes(p[1]), `${name}: ${p[1]} ist keine Transform-/Deckkrafteigenschaft`);
    }
  }
});

test("5 — Zeigen nur mit echtem Zeiger, Tastaturfokus immer, bei reduzierter Bewegung nichts", () => {
  const ende = abschnitt.indexOf("\n}\n", abschnitt.indexOf("@media (hover: hover) and (prefers-reduced-motion: no-preference)"));
  const teil = abschnitt.slice(0, ende);
  // Jede Animationsregel steht in einem der beiden Medienblöcke.
  const bloecke = [
    "@media (prefers-reduced-motion: no-preference) {",
    "@media (hover: hover) and (prefers-reduced-motion: no-preference) {",
  ];
  for (const b of bloecke) assert.ok(teil.includes(b), `Medienblock fehlt: ${b}`);
  const ausserhalb = teil.slice(0, teil.indexOf(bloecke[0]));
  assert.doesNotMatch(ausserhalb, /animation:/, "eine Bewegung läuft außerhalb der Medienblöcke");
  const fokus = teil.slice(teil.indexOf(bloecke[0]), teil.indexOf(bloecke[1]));
  const zeigen = teil.slice(teil.indexOf(bloecke[1]));
  assert.doesNotMatch(fokus, /:hover/, "Zeigen gehört in den (hover: hover)-Block");
  assert.doesNotMatch(zeigen, /:focus-visible/);
  // Beide Blöcke bewegen alle acht Symbole.
  for (const n of NAV) {
    assert.match(fokus, new RegExp(`\\.nav-sym--${n}\\b`), `${n}: keine Bewegung bei Tastaturfokus`);
    assert.match(zeigen, new RegExp(`\\.nav-sym--${n}\\b`), `${n}: keine Bewegung beim Zeigen`);
  }
  // Kein Dauerlauf: keine Wiederholung.
  assert.doesNotMatch(teil, /infinite/, "eine Bewegung läuft dauerhaft");
});

test("6 — das Symbol bleibt dekorativ und in Ruhe deckungsgleich", () => {
  assert.match(symbol, /aria-hidden="true"/);
  assert.match(symbol, /focusable="false"/);
  assert.match(symbol, /strokeWidth="1\.75"/, "dieselbe Strichstärke wie <Icon>");
  assert.match(icon, /strokeWidth="1\.75"/);
  // In Ruhe kein Versatz: die Teile bekommen ihre Verschiebung nur in den Keyframes, nie als Grundzustand.
  assert.doesNotMatch(abschnitt.slice(0, abschnitt.indexOf("@keyframes")), /(?<![-\w])(translate|rotate|scale)\s*:/,
    "ein Teil steht in Ruhe verschoben");
});
