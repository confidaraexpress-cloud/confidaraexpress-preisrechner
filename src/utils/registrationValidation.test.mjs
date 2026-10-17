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
  REG_DECLARATION_TEXTS,
  emptyRegistrationDeclarations,
  getRegDeclarationErrors,
  parseRegistrationLegalContext,
  withRegistrationDeclarations,
  isRegistrationSetChanged,
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
  // Auftrag 2 / P10 (2026-10-17): die USt-IdNr. ist Pflicht.
  vat_id: "DE123456789", street: "", zip: "", city: "", country: "DE",
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

test("9 — die Adresse bleibt optional (nur Längen), die USt-IdNr. ist Pflicht mit Formatprüfung", () => {
  assert.deepEqual(getRegErrors({ ...VALID, street: "", zip: "", city: "" }, REPEAT), {});
  const e = getRegErrors({ ...VALID, vat_id: "X".repeat(31), zip: "1".repeat(11) }, REPEAT);
  assert.match(e.vat_id, /kein gültiges Format/);
  assert.match(e.zip, /maximal 10/);
  // Auftrag 2 / P10: leer ist nicht mehr erlaubt — es gibt keine alternative Steuernummer.
  assert.equal(getRegErrors({ ...VALID, vat_id: "" }, REPEAT).vat_id, "Bitte geben Sie die USt-IdNr. Ihres Unternehmens an.");
  assert.equal(getRegErrors({ ...VALID, vat_id: " de 123 456 789 " }, REPEAT).vat_id, undefined, "Leerzeichen und Kleinschreibung");
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
  // Straße und Ort sind Vorschlagsfelder: ihr Token setzt AddressSuggestInput zentral
  // (Auftrag 1, P5, 2026-10-17 — vorher street-address, das Chromes Popup über die Liste legte).
  assert.doesNotMatch(registerFormSrc, /autoComplete="street-address"|autoComplete="address-level2"/);
  assert.match(registerFormSrc, /autoComplete="postal-code"/);
  const newPw = registerFormSrc.match(/autoComplete="new-password"/g) || [];
  assert.equal(newPw.length >= 2, true, "beide Passwortfelder nutzen new-password");
});

// Geändert mit Paket C (Go-Live, Rechtsanalyse vom 14.10.2026, P1-1): Die Unternehmer-
// eigenschaft wird jetzt AUSDRÜCKLICH erklärt und mit dem Konto gespeichert — eine Pflicht-
// Checkbox statt eines Satzes nach dem Absendeknopf. Was weiterhin verboten bleibt, ist der
// eigentliche Zweck dieses Falls: ein Kontotyp-Schalter privat/geschäftlich. Die Erklärung ist
// kein Schalter — ohne sie gibt es kein Konto, und es gibt keine Privatvariante.
test("17 — kein Kontotyp-Schalter; genau zwei Pflichterklärungen (Unternehmer, AGB)", () => {
  for (const forbidden of [/Privatkunde/i, /Privatperson/i, /Geschäftskunde\s*\//i, /Ich bin Unternehmer/i]) {
    assert.equal(forbidden.test(registerFormSrc), false, `unerwünscht: ${forbidden}`);
  }
  const boxen = registerFormSrc.match(/<Erklaerung\b/g) || [];
  assert.equal(boxen.length, 2, `${boxen.length} Erklärungen statt 2`);
  assert.match(registerFormSrc, /id="reg-business"/);
  assert.match(registerFormSrc, /id="reg-terms"/);
  // Keine Einwilligungsbox für den Datenschutz — die Erklärung wird nur verlinkt.
  assert.equal(/akzeptiere die Datenschutz|Datenschutzerklärung zu\b/i.test(registerFormSrc), false);
  // Der frühere Satz NACH dem Absendeknopf behauptete eine Zustimmung, die nie erfasst wurde.
  assert.equal(/Mit der Registrierung akzeptieren Sie/.test(registerFormSrc), false);
});

test("18 — mobile Struktur bleibt erhalten (bestehende Grid-Klassen unverändert)", () => {
  const rows2 = registerFormSrc.match(/field-row field-row-2/g) || [];
  const rows3 = registerFormSrc.match(/field-row field-row-3/g) || [];
  // Seit „Land zuerst“ (2026-10-15) steht das Land einzeln VOR der Straße; PLZ und Stadt
  // bilden die dritte zweispaltige Reihe statt einer dreispaltigen PLZ/Stadt/Land.
  assert.equal(rows2.length, 3, "drei zweispaltige Reihen (Kontakt, Unternehmen, PLZ/Stadt)");
  assert.equal(rows3.length, 0, "keine dreispaltige Reihe mehr");
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

// ─── Paket C: Erklärungen bei der Registrierung ───────────────────────────────

test("22 — beide Erklärungen sind Pflicht, nur der Wert true zählt", () => {
  assert.deepEqual(Object.keys(getRegDeclarationErrors(emptyRegistrationDeclarations())),
    ["businessCustomerConfirmed", "termsAcknowledged"]);
  assert.deepEqual(getRegDeclarationErrors({ businessCustomerConfirmed: true, termsAcknowledged: true }), {});
  for (const halb of [{ businessCustomerConfirmed: true }, { termsAcknowledged: true },
    { businessCustomerConfirmed: "true", termsAcknowledged: true }, { businessCustomerConfirmed: 1, termsAcknowledged: 1 }]) {
    assert.ok(Object.keys(getRegDeclarationErrors(halb)).length > 0, JSON.stringify(halb));
  }
  assert.match(REG_DECLARATION_TEXTS.business, /§ 14 BGB/);
});

test("23 — angezeigte AGB-Fassung nur aus einer vollständigen Serverantwort", () => {
  const antwort = { setId: 2, setKey: "SET-2026-08", documents: [
    { type: "terms", version: "2026-08", url: "/api/legal/terms/2026-08", labelSuffix: " einschließlich der ADSp 2017 (Anlage 1) " },
    { type: "privacy", version: "2026-07", url: "/api/legal/privacy/2026-07" },
  ] };
  assert.deepEqual(parseRegistrationLegalContext(200, antwort), {
    setKey: "SET-2026-08",
    terms: { version: "2026-08", url: "/api/legal/terms/2026-08", labelSuffix: "einschließlich der ADSp 2017 (Anlage 1)" },
    privacy: { version: "2026-07", url: "/api/legal/privacy/2026-07", labelSuffix: null },
  });
  assert.equal(parseRegistrationLegalContext(503, antwort), null);
  assert.equal(parseRegistrationLegalContext(200, { ...antwort, setKey: "" }), null);
  assert.equal(parseRegistrationLegalContext(200, { ...antwort, documents: [antwort.documents[1]] }), null);
  assert.equal(parseRegistrationLegalContext(200, null), null);
});

test("24 — Payload: Erklärungen nur bei beiden Häkchen, Setschlüssel nur bei angezeigter Fassung", () => {
  const basis = { email: "a@b.de", name: "Max" };
  assert.deepEqual(withRegistrationDeclarations(basis, { businessCustomerConfirmed: true }), basis);
  const ctx = { setKey: "SET-2026-08", terms: { version: "2026-08", url: "/x" } };
  assert.deepEqual(withRegistrationDeclarations(basis, { businessCustomerConfirmed: true, termsAcknowledged: true }, ctx),
    { ...basis, businessCustomerConfirmed: true, termsAcknowledged: true, legalSetKey: "SET-2026-08" });
  assert.deepEqual(withRegistrationDeclarations(basis, { businessCustomerConfirmed: true, termsAcknowledged: true }, null),
    { ...basis, businessCustomerConfirmed: true, termsAcknowledged: true });
  assert.equal(isRegistrationSetChanged(409, { code: "LEGAL_SET_CHANGED" }), true);
  assert.equal(isRegistrationSetChanged(409, { code: "EMAIL_TAKEN" }), false);
  // Ein Feldfehler des Servers landet an der jeweiligen Checkbox.
  assert.deepEqual(mapApiRegistrationError({ error: "x", field: "termsAcknowledged" }).fieldErrors, { termsAcknowledged: "x" });
});

test("25 — AuthPage: Erklärungen gehören zur Gültigkeit, Fassungswechsel setzt nur die AGB-Bestätigung zurück", () => {
  assert.match(authPageSrc, /&& Object\.keys\(getRegDeclarationErrors\(regDeclarations\)\)\.length === 0/);
  assert.match(authPageSrc, /withRegistrationDeclarations\(\s*withReferralCode\(buildRegistrationPayload\(regForm\)/);
  const idx = authPageSrc.indexOf("isRegistrationSetChanged(r.status, d)");
  assert.ok(idx > -1, "der Fassungswechsel wird nicht behandelt");
  const zweig = authPageSrc.slice(idx, idx + 600);
  assert.match(zweig, /termsAcknowledged: false/);
  assert.match(zweig, /setRegLegalLoad/);
  assert.ok(!/businessCustomerConfirmed: false/.test(zweig), "die Unternehmererklärung wird unnötig zurückgesetzt");
  assert.match(authPageSrc, /getCurrentLegalSet\(\{ signal: ac\.signal \}\)/);
});
