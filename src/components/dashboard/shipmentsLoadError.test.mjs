// F5 (Premium-Redesign Etappe 1): Ein Ladefehler der Sendungsliste ist kein Leerzustand.
//
// Vorher standen bei einem Ladefehler das Fehlerband ohne Aktion UND „Noch keine Sendungen“ untereinander;
// der Kunde musste annehmen, es gebe keine Sendungen. Jetzt trägt die Liste den Fehlerzustand mit
// „Erneut versuchen“ (derselbe Weg wie bei den Rechnungen), und das Band erscheint dort nicht doppelt.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const hier = path.dirname(fileURLToPath(import.meta.url));
const code = (rel) => readFileSync(path.join(hier, rel), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const liste = code("./ShipmentsList.jsx");
const seite = code("../../pages/DashboardPage.jsx");

test("1 — ohne geladene Sendungen zeigt ein Ladefehler den Fehlerzustand statt „Noch keine Sendungen“", () => {
  const fehler = liste.indexOf("shipments.length === 0 && loadError ?");
  const leer = liste.indexOf('title="Noch keine Sendungen"');
  assert.ok(fehler > 0, "kein eigener Fehlerzweig");
  assert.ok(leer > fehler, "der Leerzustand wird vor dem Fehlerzweig geprüft");
  assert.match(liste, /<ErrorState\s+title=\{SHIPMENTS_LOAD_ERROR_TITLE\}\s+action=\{<button type="button" className="btn btn-primary btn-sm" id="shipments-retry" onClick=\{onRetry\}>Erneut versuchen<\/button>\}/);
  assert.match(liste, /const SHIPMENTS_LOAD_ERROR_TITLE = "Die Sendungen konnten nicht geladen werden\.";/);
});

test("1b — der Leerzustand nennt, was hier erscheint, und führt zur neuen Sendung (B8)", () => {
  assert.match(liste, /text="Gebuchte Sendungen erscheinen hier mit Status, Dokumenten und Sendungsverfolgung\."/);
  assert.match(liste, /id="shipments-empty-new" onClick=\{onNewShipment\}>Neue Sendung<\/button>/);
  assert.match(seite, /onNewShipment=\{\(\) => navigateTo\("new"\)\}/);
});

test("2 — DashboardPage reicht Fehler und Wiederholung durch, das Band steht dort nicht doppelt", () => {
  assert.match(seite, /<ShipmentsList\s+shipments=\{shipments\}\s+loading=\{loading\}\s+loadError=\{loadError\}\s+onRetry=\{fetchData\}/);
  assert.match(seite, /\{loadError && !\(page === "shipments" && shipments\.length === 0\) && \(/);
  // fetchData setzt den Fehler zu Beginn zurück; eine erfolgreiche Wiederholung räumt ihn ab.
  assert.match(seite, /const fetchData = useCallback\(\(\) => \{\s+setLoading\(true\);\s+setLoadError\(""\);/);
});
