// Selbsttest der fail-closed Quelltext-Helfer in scripts/governance.mjs.
//
// leseQuelle/ankerPosition/schnitt existieren, damit Quelltext-Scans bei einer
// Codeverschiebung LAUT scheitern statt still grün zu bleiben (indexOf → -1 →
// slice(-1) → leerer/falscher Ausschnitt). Beide Richtungen sind hier belegt.
import test from "node:test";
import assert from "node:assert/strict";
import { leseQuelle, ankerPosition, schnitt, pruefeImTestlauf } from "../../scripts/governance.mjs";

test("Selbstprüfung: dieser Test läuft im Unit-Lauf mit", () => {
  pruefeImTestlauf("src/utils/governanceHelpers.test.mjs");
});

test("leseQuelle liest projektrelativ und wirft bei fehlender Datei", () => {
  assert.ok(leseQuelle("package.json").includes('"vite"'));
  assert.throws(() => leseQuelle("src/diese-datei-gibt-es-nicht.jsx"), /Quelldatei fehlt/);
});

test("ankerPosition findet Anker und wirft bei -1 mit Anker und Kontext in der Meldung", () => {
  assert.equal(ankerPosition("aaa NADEL bbb", "NADEL"), 4);
  assert.throws(() => ankerPosition("aaa", "NADEL", "Kontexttext"), /Anker nicht gefunden.*Kontexttext.*NADEL/s);
});

test("schnitt liefert exakt den Bereich, wirft bei fehlendem End-Anker, sucht das Ende NACH dem Start", () => {
  assert.equal(schnitt("vorher START mitte ENDE rest", "START", "ENDE"), "START mitte ");
  assert.throws(() => schnitt("vorher START mitte", "START", "ENDE"), /End-Anker nicht gefunden/);
  // "ENDE" vor dem Start darf nicht zählen — sonst entstünde ein Rückwärts-Slice.
  assert.equal(schnitt("ENDE vorab START mitte ENDE rest", "START", "ENDE"), "START mitte ");
  // Ohne bis: ausdrücklich bis zum Dateiende.
  assert.equal(schnitt("abc NADEL xyz", "NADEL"), "NADEL xyz");
});
