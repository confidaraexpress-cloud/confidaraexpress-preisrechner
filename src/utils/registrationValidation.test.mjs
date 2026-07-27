// Registrierungsvalidierung + B2B-Wording.
//
// Das Repo hat bewusst keine React-Render-Testinfrastruktur (devDependencies:
// nur playwright). Geprüft wird deshalb zweigleisig:
//   • die reine Logik aus registrationValidation.mjs direkt, und
//   • der Quelltext von RegisterForm.jsx/AuthPage.jsx als Contract-Test, damit
//     Pflichtfeld-Markierung, B2B-Hinweis und Feldnamen nicht unbemerkt wegfallen.
//
// Run: node --test src/utils/registrationValidation.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  B2B_REQUIRED_FIELDS,
  B2B_NOTICE,
  B2B_ACTIVATION_NOTE,
  b2bFieldError,
  getRegErrors,
  mapApiRegistrationError,
  buildRegistrationPayload,
} from "./registrationValidation.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => readFileSync(join(__dirname, rel), "utf8");
const registerFormSrc = readSrc("../components/auth/RegisterForm.jsx");
const authPageSrc     = readSrc("../pages/AuthPage.jsx");

const VALID = {
  name: "Max Mustermann",
  email: "einkauf@muster-logistik.de",
  password: "SicheresPasswort1",
  company_name: "Muster Logistik GmbH",
  vat_id: "", street: "", zip: "", city: "", country: "DE",
};
const REPEAT = VALID.password;

// ─── Pflichtfelder ────────────────────────────────────────────────────────────

test("1 — vollständiges B2B-Formular ist fehlerfrei", () => {
  assert.deepEqual(getRegErrors(VALID, REPEAT), {});
});

test("2 — Firmenname ist Pflichtfeld: fehlend, leer und Whitespace-only", () => {
  for (const value of [undefined, "", "   ", "\t\n "]) {
    const e = getRegErrors({ ...VALID, company_name: value }, REPEAT);
    assert.equal(e.company_name, "Firmenname ist ein Pflichtfeld.", `Wert: ${JSON.stringify(value)}`);
  }
});

test("3 — Ansprechpartner ist Pflichtfeld: fehlend, leer und Whitespace-only", () => {
  for (const value of [undefined, "", "   ", "\t\n "]) {
    const e = getRegErrors({ ...VALID, name: value }, REPEAT);
    assert.equal(e.name, "Ansprechpartner ist ein Pflichtfeld.", `Wert: ${JSON.stringify(value)}`);
  }
});

test("4 — Submit ohne Firmenname ist blockiert (regValid = false)", () => {
  const e = getRegErrors({ ...VALID, company_name: "" }, REPEAT);
  assert.equal(Object.keys(e).length > 0, true, "Formular darf nicht absendbar sein");
});

test("5 — Submit ohne Ansprechpartner ist blockiert (regValid = false)", () => {
  const e = getRegErrors({ ...VALID, name: "   " }, REPEAT);
  assert.equal(Object.keys(e).length > 0, true, "Formular darf nicht absendbar sein");
});

test("6 — Mindest-/Maximallängen entsprechen dem Backend (2/200 und 2/100)", () => {
  const company = B2B_REQUIRED_FIELDS.find((f) => f.apiField === "company_name");
  const contact = B2B_REQUIRED_FIELDS.find((f) => f.apiField === "name");
  assert.deepEqual([company.minLen, company.maxLen], [2, 200]);
  assert.deepEqual([contact.minLen, contact.maxLen], [2, 100]);

  assert.match(getRegErrors({ ...VALID, company_name: "A" }, REPEAT).company_name, /mindestens 2/);
  assert.match(getRegErrors({ ...VALID, company_name: "X".repeat(201) }, REPEAT).company_name, /maximal 200/);
  assert.match(getRegErrors({ ...VALID, name: "B" }, REPEAT).name, /mindestens 2/);
  assert.match(getRegErrors({ ...VALID, name: "Y".repeat(101) }, REPEAT).name, /maximal 100/);
});

test("7 — b2bFieldError trimmt vor der Längenprüfung", () => {
  const rule = B2B_REQUIRED_FIELDS[0];
  assert.equal(b2bFieldError(rule, "  GmbH  "), null, "getrimmt 4 Zeichen → gültig");
  assert.equal(b2bFieldError(rule, `  ${"X".repeat(200)}  `), null, "getrimmt exakt 200 → gültig");
  assert.match(b2bFieldError(rule, ` ${"X".repeat(201)} `), /maximal 200/);
});

test("8 — bestehende Prüfungen bleiben erhalten (E-Mail, Passwort, Wiederholung)", () => {
  assert.equal(getRegErrors({ ...VALID, email: "" }, REPEAT).email, "E-Mail ist ein Pflichtfeld.");
  assert.match(getRegErrors({ ...VALID, email: "keine-mail" }, REPEAT).email, /gültige geschäftliche E-Mail/);
  assert.equal(getRegErrors({ ...VALID, password: "" }, "").password, "Passwort ist ein Pflichtfeld.");
  assert.match(getRegErrors({ ...VALID, password: "kurz" }, "kurz").password, /mindestens 8/);
  assert.match(getRegErrors(VALID, "anderes").passwordRepeat, /stimmen nicht überein/);
});

test("9 — optionale Felder bleiben optional, nur Längen werden geprüft", () => {
  assert.deepEqual(getRegErrors({ ...VALID, vat_id: "", street: "", zip: "", city: "" }, REPEAT), {});
  const e = getRegErrors({ ...VALID, vat_id: "X".repeat(31), zip: "1".repeat(11) }, REPEAT);
  assert.match(e.vat_id, /maximal 30/);
  assert.match(e.zip, /maximal 10/);
});

// ─── API-Feldvertrag ──────────────────────────────────────────────────────────

test("10 — Payload nutzt die bestehenden snake_case-Feldnamen und trimmt Pflichtfelder", () => {
  const payload = buildRegistrationPayload({
    ...VALID,
    company_name: "  Muster Logistik GmbH  ",
    name: "  Max Mustermann  ",
    email: "  einkauf@muster-logistik.de  ",
  });
  assert.equal(payload.company_name, "Muster Logistik GmbH");
  assert.equal(payload.name, "Max Mustermann");
  assert.equal(payload.email, "einkauf@muster-logistik.de");
  // Keine parallelen Varianten einführen.
  assert.equal("company"     in payload, false, "kein paralleles Feld `company`");
  assert.equal("companyName" in payload, false, "kein paralleles Feld `companyName`");
  assert.equal("contactName" in payload, false, "kein paralleles Feld `contactName`");
  assert.deepEqual(
    Object.keys(payload).sort(),
    ["city", "company_name", "country", "email", "name", "password", "street", "vat_id", "zip"],
  );
});

// ─── Backend-Feldfehler ───────────────────────────────────────────────────────

test("11 — Backend-Feldfehler wird dem richtigen Eingabefeld zugeordnet", () => {
  const r = mapApiRegistrationError({
    error: "Firmenname ist ein Pflichtfeld.",
    code: "B2B_REGISTRATION_FIELD_REQUIRED",
    field: "company_name",
  });
  assert.deepEqual(r.fieldErrors, { company_name: "Firmenname ist ein Pflichtfeld." });
  assert.equal(r.generalError, "");
});

test("12 — Backend-Feldfehler für den Ansprechpartner landet am name-Feld", () => {
  const r = mapApiRegistrationError({ error: "Ansprechpartner ist ein Pflichtfeld.", field: "name" });
  assert.deepEqual(r.fieldErrors, { name: "Ansprechpartner ist ein Pflichtfeld." });
  assert.equal(r.generalError, "");
});

test("13 — Fehler ohne/mit unbekanntem Feld bleibt allgemeine Meldung", () => {
  const noField = mapApiRegistrationError({ error: "E-Mail bereits registriert" });
  assert.deepEqual(noField.fieldErrors, {});
  assert.equal(noField.generalError, "E-Mail bereits registriert");

  const unknown = mapApiRegistrationError({ error: "Kaputt", field: "irgendwas" });
  assert.deepEqual(unknown.fieldErrors, {});
  assert.equal(unknown.generalError, "Kaputt");

  const empty = mapApiRegistrationError(null);
  assert.equal(empty.generalError, "Registrierung fehlgeschlagen");
});

// ─── Quelltext-Contract: Formular ─────────────────────────────────────────────

test("14 — B2B-Hinweis steht im Registrierungsformular", () => {
  assert.equal(
    B2B_NOTICE,
    "ConfidaraExpress richtet sich ausschließlich an Unternehmen und Geschäftskunden.",
  );
  assert.match(B2B_ACTIVATION_NOTE, /Firmenkonto/);
  assert.match(registerFormSrc, /B2B_NOTICE/, "Hinweistext muss gerendert werden");
  assert.match(registerFormSrc, /B2B_ACTIVATION_NOTE/);
  assert.match(registerFormSrc, /auth-b2b-notice/, "Hinweis nutzt die vorgesehene Hinweis-Optik");
});

test("15 — Firmenname und Ansprechpartner sind als Pflichtfelder ausgezeichnet", () => {
  for (const id of ["reg-company", "reg-name"]) {
    const block = registerFormSrc.slice(registerFormSrc.indexOf(`id="${id}"`));
    const input = block.slice(0, block.indexOf("/>"));
    assert.match(input, /\brequired\b/, `${id}: required fehlt`);
    assert.match(input, /aria-required="true"/, `${id}: aria-required fehlt`);
  }
  assert.match(registerFormSrc, /htmlFor="reg-company">Firmenname <Req \/>/);
  assert.match(registerFormSrc, /htmlFor="reg-name">Ansprechpartner <Req \/>/);
});

test("16 — Browser-Autocomplete ist sinnvoll gesetzt", () => {
  assert.match(registerFormSrc, /autoComplete="organization"/,  "Firmenname → organization");
  assert.match(registerFormSrc, /autoComplete="name"/,          "Ansprechpartner → name");
  assert.match(registerFormSrc, /autoComplete="email"/,         "E-Mail → email");
  assert.match(registerFormSrc, /autoComplete="street-address"/);
  assert.match(registerFormSrc, /autoComplete="postal-code"/);
  const newPw = registerFormSrc.match(/autoComplete="new-password"/g) || [];
  assert.equal(newPw.length >= 2, true, "beide Passwortfelder nutzen new-password");
});

test("17 — kein Kontotyp-Schalter und keine Unternehmer-Checkbox im Formular", () => {
  for (const forbidden of [/Privatkunde/i, /Privatperson/i, /Geschäftskunde\s*\//i, /Ich bin Unternehmer/i, /auth-checkbox/]) {
    assert.equal(forbidden.test(registerFormSrc), false, `unerwünscht: ${forbidden}`);
  }
});

test("18 — mobile Struktur bleibt erhalten (bestehende Grid-Klassen unverändert)", () => {
  const rows2 = registerFormSrc.match(/field-row field-row-2/g) || [];
  const rows3 = registerFormSrc.match(/field-row field-row-3/g) || [];
  assert.equal(rows2.length, 2, "zwei zweispaltige Reihen wie bisher");
  assert.equal(rows3.length, 1, "eine dreispaltige Reihe (PLZ/Stadt/Land) wie bisher");
  // Der Hinweis ist ein normales Blockelement ohne feste Höhe/Breite.
  assert.equal(/auth-b2b-notice[^"]*"[\s\S]{0,200}(width:|height:)/.test(registerFormSrc), false);
});

// ─── Quelltext-Contract: AuthPage ─────────────────────────────────────────────

test("19 — AuthPage nutzt die zentrale Validierung und das Feldfehler-Mapping", () => {
  assert.match(authPageSrc, /from "\.\.\/utils\/registrationValidation\.mjs"/);
  assert.match(authPageSrc, /mapApiRegistrationError/);
  assert.match(authPageSrc, /buildRegistrationPayload\(regForm\)/);
  // Keine zweite, abweichende Validierungskopie in der Seite.
  assert.equal(/function getRegErrors/.test(authPageSrc), false, "getRegErrors darf nicht dupliziert sein");
});

test("20 — Submit ist an regValid gebunden und der Doppelklick-Schutz bleibt", () => {
  assert.match(authPageSrc, /const regValid = Object\.keys\(getRegErrors\(regForm, regPasswordRepeat\)\)\.length === 0/);
  assert.match(authPageSrc, /if \(loading\) return;/, "Mehrfachversand-Guard fehlt");
  assert.match(registerFormSrc, /disabled=\{loading \|\| !regValid\}/, "CTA muss bei ungültigem Formular gesperrt sein");
});

test("21 — Registrierungserfolg bleibt korrekt und ohne B2C-Wording", () => {
  const m = authPageSrc.match(/setSuccess\("([^"]+)"\);\s*\n\s*setTab\("login"\)/);
  assert.ok(m, "Erfolgsmeldung nach Registrierung nicht gefunden");
  const message = m[1];
  assert.match(message, /Firmenkonto/, "Erfolgsmeldung benennt das Firmenkonto");
  assert.match(message, /E-Mail/, "Hinweis auf die Benachrichtigung bleibt erhalten");
  assert.equal(/Privat|Verbraucher|B2C/i.test(message), false, "kein Privatkunden-Wording");
  assert.match(authPageSrc, /setTab\("login"\)/, "nach Erfolg zurück auf den Login-Tab");
});
