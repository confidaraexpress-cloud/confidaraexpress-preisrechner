// Tests der EINEN Kontoidentitätsquelle (Paket D). Läuft über node --test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accountInitials, accountDisplayName, ACCOUNT_INITIAL_FALLBACK } from "./accountIdentity.mjs";

test("1 — die Initiale kommt aus dem Firmennamen (B2B-Identität)", () => {
  assert.equal(accountInitials({ company_name: "Muster GmbH", name: "Max Mustermann" }), "M");
  assert.equal(accountInitials({ company_name: "beispiel ag", name: "Erika" }), "B");
});

test("2 — ohne Firmennamen greift der Ansprechpartner", () => {
  assert.equal(accountInitials({ company_name: "", name: "Erika Empfänger" }), "E");
  assert.equal(accountInitials({ company_name: null, name: "Örtliche Spedition" }), "Ö");
});

test("3 — ohne verwertbaren Namen bleibt ein neutrales Zeichen, NIE ein Markenkürzel", () => {
  assert.equal(accountInitials({}), ACCOUNT_INITIAL_FALLBACK);
  assert.equal(accountInitials(null), ACCOUNT_INITIAL_FALLBACK);
  assert.equal(accountInitials({ company_name: "   " }), ACCOUNT_INITIAL_FALLBACK);
  assert.notEqual(accountInitials({}), "CE");
});

test("4 — führende Satzzeichen werden übersprungen, Ziffern zählen", () => {
  assert.equal(accountInitials({ company_name: "»Muster« GmbH" }), "M");
  assert.equal(accountInitials({ company_name: "(Beispiel) AG" }), "B");
  assert.equal(accountInitials({ company_name: "4YOU Logistik" }), "4");
});

test("5 — genau EIN Zeichen: die Rechtsform darf nie zur zweiten Initiale werden", () => {
  for (const firma of ["Muster GmbH", "Beispiel AG", "Test e. K.", "Confidara"]) {
    assert.equal(accountInitials({ company_name: firma }).length, 1, `${firma} ergibt mehr als ein Zeichen`);
  }
});

test("6 — der Anzeigename folgt derselben Vorrangregel wie die Initiale", () => {
  assert.equal(accountDisplayName({ company_name: "Muster GmbH", name: "Max" }), "Muster GmbH");
  assert.equal(accountDisplayName({ company_name: "  ", name: "Max" }), "Max");
  assert.equal(accountDisplayName({}), "Kunde");
  assert.equal(accountDisplayName({}, "Nicht angegeben"), "Nicht angegeben");
  // Name und Initiale stammen immer aus demselben Feld — sie können nicht
  // auseinanderlaufen (genau der Fehler des früheren fest verdrahteten „CE").
  const user = { company_name: "Zeta Logistik", name: "Anton Alpha" };
  assert.equal(accountDisplayName(user).charAt(0).toUpperCase(), accountInitials(user));
});
