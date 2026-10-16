// Admin „Öffentlicher Preisrechner": Eingabe in de-DE, Anzeige 25,00 %, Bestätigung mit altem und neuem
// Wert samt Wirkung, eigene Bestätigung des Schalters, Konflikt mit aktuellem Stand.
//
// Run: node --test src/utils/adminPublicCalculatorView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  PUBLIC_CALC_ADMIN_TEXT, availabilityConfirmation, markupConfirmation, markupUnchanged, parsePublicCalculatorSettings,
  parsePublicMarkupInput, publicCalculatorSaveOutcome, publicCalculatorSettingsView,
} from "./adminPublicCalculatorView.mjs";

const STAND = { markupPercent: 25, enabled: false, revision: 1, updatedAt: "2026-10-16T12:30:00.000Z", updatedBy: 3 };

test("(1) Eingabe in de-DE: Komma und Punkt, höchstens zwei Nachkommastellen, 0 bis 100", () => {
  assert.equal(parsePublicMarkupInput("22,5").value, 22.5);
  assert.equal(parsePublicMarkupInput("22.50").value, 22.5);
  assert.equal(parsePublicMarkupInput("0").value, 0);
  assert.equal(parsePublicMarkupInput("100").value, 100);
  for (const [roh, code] of [["", "empty"], ["abc", "format"], ["-1", "range"], ["100,01", "range"], ["25,555", "decimals"], ["25 %", "format"]]) {
    const p = parsePublicMarkupInput(roh);
    assert.equal(p.ok, false, roh);
    assert.equal(p.code, code, roh);
    assert.doesNotMatch(p.error, /Kundenaufschlag/, "der Text nennt diesen Aufschlag, nicht den eines Kunden");
  }
});

test("(2) Anzeige: Wert als 25,00 %, Status, letzte Änderung; Eingabefeld in de-DE", () => {
  const s = parsePublicCalculatorSettings(STAND);
  const v = publicCalculatorSettingsView(s);
  assert.equal(v.markupText, "25,00 %");
  assert.equal(v.statusText, PUBLIC_CALC_ADMIN_TEXT.disabled);
  assert.match(v.lastChangeText, /^\d{2}\.\d{2}\.2026, \d{2}:\d{2} Uhr · Admin #3$/);
  assert.equal(v.inputValue, "25,00");
  assert.equal(parsePublicCalculatorSettings({ ...STAND, revision: 0 }), null);
  assert.equal(parsePublicCalculatorSettings({ ...STAND, enabled: "true" }), null, "der Schalter ist strikt boolesch");
  assert.equal(parsePublicCalculatorSettings({ ...STAND, markupPercent: "25.00" }), null);
});

test("(3) Bestätigung: alter und neuer Wert samt Wirkung; unveränderter Wert ist keine Änderung", () => {
  const s = parsePublicCalculatorSettings(STAND);
  const d = markupConfirmation(s, 22.5);
  assert.equal(d.text, "Bisher 25,00 %, neu 22,50 %.");
  assert.match(d.note, /^Wirkung: Ab der nächsten Berechnung/);
  assert.match(d.note, /auch für Express/);
  assert.match(d.note, /Kundenaufschläge und gespeicherte Angebote bleiben unverändert/);
  assert.equal(markupUnchanged(s, 25), true);
  assert.equal(markupUnchanged(s, 25.001), true, "auf zwei Nachkommastellen verglichen");
  assert.equal(markupUnchanged(s, 24.99), false);
});

test("(4) Schalter: eigene Bestätigung je Richtung, nennt die Wirkung", () => {
  const aus = availabilityConfirmation(parsePublicCalculatorSettings(STAND));
  assert.deepEqual([aus.title, aus.confirmLabel, aus.next], ["Preisrechner einschalten", PUBLIC_CALC_ADMIN_TEXT.switchOn, true]);
  assert.match(aus.note, /25,00/);
  const an = availabilityConfirmation(parsePublicCalculatorSettings({ ...STAND, enabled: true }));
  assert.deepEqual([an.title, an.next], ["Preisrechner ausschalten", false]);
});

test("(5) Antwort: gespeichert, Konflikt mit aktuellem Stand, ungültig, Fehler; 401/403 bleiben beim zentralen Handler", () => {
  assert.equal(publicCalculatorSaveOutcome(200, { ...STAND, revision: 2 }).settings.revision, 2);
  const konflikt = publicCalculatorSaveOutcome(409, { code: "PUBLIC_CALCULATOR_REVISION_CONFLICT", current: { ...STAND, markupPercent: 30, revision: 5 } });
  assert.deepEqual([konflikt.kind, konflikt.settings.markupPercent, konflikt.settings.revision], ["conflict", 30, 5]);
  assert.equal(publicCalculatorSaveOutcome(400, { code: "PUBLIC_CALCULATOR_REVISION_INVALID" }).kind, "conflict");
  assert.equal(publicCalculatorSaveOutcome(400, { code: "MARKUP_INVALID" }).kind, "invalid");
  assert.equal(publicCalculatorSaveOutcome(403, {}).kind, "auth");
  assert.equal(publicCalculatorSaveOutcome(429, {}).text, PUBLIC_CALC_ADMIN_TEXT.rateLimited);
  assert.equal(publicCalculatorSaveOutcome(500, {}).kind, "error");
});
