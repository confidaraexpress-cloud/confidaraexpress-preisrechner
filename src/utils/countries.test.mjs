// Tests für die Länderliste: vollständig alphabetisch (deutscher Anzeigename),
// vollständige Menge, unveränderte ISO-Codes. Node-Test-Runner:
//   node --test src/utils/countries.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import { countries } from "./countries.js";

test("Liste ist vollständig alphabetisch nach deutschem Namen (localeCompare de)", () => {
  for (let i = 1; i < countries.length; i++) {
    const prev = countries[i - 1].name;
    const cur = countries[i].name;
    assert.ok(
      prev.localeCompare(cur, "de") <= 0,
      `Nicht sortiert: "${prev}" steht vor "${cur}"`,
    );
  }
});

test("Umlaute/ß korrekt einsortiert (Ägypten vor Albanien; Weißrussland vor Zypern)", () => {
  const names = countries.map((c) => c.name);
  assert.ok(names.indexOf("Ägypten") < names.indexOf("Albanien"), "Ägypten vor Albanien");
  assert.ok(names.indexOf("Österreich") < names.indexOf("Polen"), "Österreich vor Polen");
  assert.ok(names.indexOf("Weißrussland") < names.indexOf("Zypern"), "Weißrussland vor Zypern");
  assert.equal(names[0], "Ägypten", "erster Eintrag ist Ägypten");
});

test("Deutschland ist enthalten (Standardland) und korrekt benannt", () => {
  const de = countries.find((c) => c.code === "DE");
  assert.ok(de, "DE vorhanden");
  assert.equal(de.name, "Deutschland");
});

test("Vollständige Menge: 74 Einträge, eindeutige Codes, keine Namensdubletten", () => {
  assert.equal(countries.length, 74);
  const codes = countries.map((c) => c.code);
  assert.equal(new Set(codes).size, 74, "alle Codes eindeutig");
  const names = countries.map((c) => c.name);
  assert.equal(new Set(names).size, 74, "alle Namen eindeutig");
});

test("ISO-Codes unverändert (Stichprobe kritischer Zuordnungen)", () => {
  const byCode = Object.fromEntries(countries.map((c) => [c.code, c.name]));
  assert.equal(byCode.DE, "Deutschland");
  assert.equal(byCode.AT, "Österreich");
  assert.equal(byCode.CH, "Schweiz");
  assert.equal(byCode.US, "USA");
  assert.equal(byCode.GB, "Großbritannien");
  assert.equal(byCode.EG, "Ägypten"); // Code EG bleibt Ägypten (nicht mit Algerien/DZ verwechselt)
  assert.equal(byCode.DZ, "Algerien");
});
