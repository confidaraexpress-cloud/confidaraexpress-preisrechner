// Der gemeinsame Paketeditor (Canonical v2.79, §15) — Quelltextvertrag der Komponente und ihrer
// drei Einbindungen. Das Verhalten im Browser prüfen die E2E-Suiten packageLinesShipment,
// packageLinesCalculator und publicCalculatorPackageLines.
// Run: node --test src/components/shipping/packageLinesEditor.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ohneKommentare = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");

const editor = ohneKommentare(lies("./PackageLinesEditor.jsx"));
const neueSendung = ohneKommentare(lies("../../pages/NewShipmentPage.jsx"));
const rechner = ohneKommentare(lies("../../pages/CalculatorPage.jsx"));
const oeffentlich = ohneKommentare(lies("../../public-calculator/PublicCalculatorApp.jsx"));
const appCss = lies("../../styles/calculator.css");
const pcCss = lies("../../styles/public-calculator.css");

test("1 — ein Editor auf drei Seiten, jede mit ihren bisherigen Feld-IDs", () => {
  assert.match(neueSendung, /<PackageLinesEditor\s+variant="app"\s+idBase="ns-"/);
  assert.match(rechner, /<PackageLinesEditor\s+variant="app"\s+idBase="calc-"/);
  assert.match(oeffentlich, /<PackageLinesEditor\s+variant="public"\s+idBase=\{FELD_ID\}/);
  for (const [name, src] of [["NewShipmentPage", neueSendung], ["CalculatorPage", rechner], ["PublicCalculatorApp", oeffentlich]]) {
    assert.doesNotMatch(src, /field-row-5|pc-row-fields--package/, `${name}: die Paketfelder stehen noch auf der Seite`);
    assert.match(src, /lines=\{formPackageLines\(form\)\}/, `${name}: die Zeilen kommen nicht aus dem Formular`);
  }
});

test("2 — Startansicht: eine Zeile ohne Überschrift und ohne Zeilenaktionen, Hinweis „Gleiche Pakete“", () => {
  assert.match(editor, /hint: "Gleiche Pakete"/);
  assert.match(editor, /hint=\{!mehrere \? hint : undefined\}/, "der Hinweis steht nur in der Startansicht");
  assert.match(editor, /mehrere \? \(\s*<div key=\{zeile\.key\} className="pkg-line" role="group" aria-labelledby=\{titelId\(index\)\}>/,
    "Überschrift und Aktionen erst ab zwei Zeilen");
  assert.match(editor, /<React\.Fragment key=\{zeile\.key\}>\{feldreihe\(zeile, index\)\}<\/React\.Fragment>/,
    "eine Zeile rendert nur ihre Feldreihe");
  assert.doesNotMatch(editor, /Identische Pakete/);
});

test("3 — Aktionen als Text mit zugänglichem Namen, nie Symbole, nie Absenden", () => {
  assert.doesNotMatch(editor, /from "\.\.\/ui\/Icon"|<Icon\b/, "keine dekorativen Icons (Designsystem)");
  assert.match(editor, />\s*Paket hinzufügen\s*</);
  assert.match(editor, />\s*Kopieren\s*</);
  assert.match(editor, />\s*Entfernen\s*</);
  assert.match(editor, /aria-label=\{`Paket \$\{index \+ 1\} kopieren`\}/);
  assert.match(editor, /aria-label=\{`Paket \$\{index \+ 1\} entfernen`\}/);
  const knoepfe = editor.match(/<button\b[^>]*>/g) || [];
  assert.equal(knoepfe.length, 3);
  for (const k of knoepfe) assert.match(k, /type="button"/, "Enter in einem Feld darf keine Aktion auslösen");
});

test("4 — Grenzen sichtbar: gesperrtes „Paket hinzufügen“ mit Hinweis, Summe mit Fehler", () => {
  assert.match(editor, /disabled=\{voll\}/);
  assert.match(editor, /\{voll && <span className="pkg-lines-limit" id=\{grenzeId\}>\{PACKAGE_LINES_LIMIT_TEXT\}<\/span>\}/);
  assert.match(editor, /aria-describedby=\{voll \? grenzeId : undefined\}/);
  assert.match(editor, /aria-live="polite"\s+data-field=\{PACKAGE_LINES_KEY\} tabIndex=\{-1\}/, "die Summe ist Ansage- und Sprungziel");
  assert.match(editor, /summenFehler && <p className="pkg-lines-sum-error field-error" id=\{summenFehlerId\}>/);
});

test("5 — Fokusführung nach dem Rendern: Anzahl der neuen Zeile, Gewicht der Kopie, nächste Zeile oder „hinzufügen“", () => {
  assert.match(editor, /setFokusZiel\(\{ id: feldId\(neu, "packageCount"\), select: true \}\)/);
  assert.match(editor, /setFokusZiel\(\{ id: feldId\(index \+ 1, "weight"\), select: true \}\)/);
  assert.match(editor, /setFokusZiel\(index < next\.length \? \{ id: feldId\(index, "packageCount"\) \} : "add"\)/);
  assert.match(editor, /useEffect\(\(\) => \{\s*if \(!fokusZiel\) return;/, "der Fokus wird in einem Effekt gesetzt");
  assert.match(editor, /role="status" aria-live="polite">\{ansage\}/);
  assert.match(editor, /`Paket \$\{neu \+ 1\} hinzugefügt\.`/);
});

test("6 — 44-px-Ziele und Layoutstufen ohne Querscrollen", () => {
  assert.match(appCss, /\.pkg-lines-add,\s*\.pkg-line-action \{ --ce-btn-height: var\(--ce-size-touch-target\); \}/);
  assert.match(appCss, /@media \(max-width: 460px\) \{\s*\.pkg-lines--multi \.pkg-line \{/, "bis 460 px eine Karte je Zeile");
  assert.match(appCss, /@media \(max-width: 720px\) \{\s*\.offers-form-section \.field-row-5 \{ grid-template-columns: repeat\(3, 1fr\); \}/,
    "461–720 px zweizeilig (unveränderte Rasterstufe)");
  assert.match(pcCss, /\.pc-line-action \{[^}]*min-height: 44px;/);
  assert.match(pcCss, /@container pc-form \(max-width: 459px\) \{\s*\.pc-page \.pkg-lines--multi \.pkg-line \{/);
});
