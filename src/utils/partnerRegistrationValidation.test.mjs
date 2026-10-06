// Partnerregistrierung und Empfehlungscode in der Kundenregistrierung —
// additive Ergänzungen von registrationValidation.mjs.
//
// Run: node --test src/utils/partnerRegistrationValidation.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  PARTNER_REG_TEXTS,
  REG_PASSWORD_TEXTS,
  buildPartnerRegistrationPayload,
  buildRegistrationPayload,
  getPartnerRegErrors,
  getRegErrors,
  mapPartnerRegistrationError,
  withReferralCode,
} from "./registrationValidation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const VALID = {
  name: "Petra Partner",
  email: "petra@partner-vertrieb.de",
  password: "SicheresPasswort1",
  companyName: "",
  phone: "",
  agreementAccepted: true,
};
const REPEAT = VALID.password;

/* ══════════ Kundenregistrierung: referralCode nur additiv ═══════════════ */

test("1 — ohne gültigen Code bleibt der Kundenpayload exakt der bisherige", () => {
  const form = { name: "Max", email: "a@b.de", password: "x", company_name: "Acme", vat_id: "", street: "", zip: "", city: "", country: "DE" };
  const basis = buildRegistrationPayload(form);
  for (const code of [null, undefined, "", "kaputt", "ABCDEFG0"]) {
    assert.deepEqual(withReferralCode(basis, code), basis, `Code ${JSON.stringify(code)} verändert den Payload`);
    assert.equal("referralCode" in withReferralCode(basis, code), false);
  }
});

test("2 — ein gültiger Code kommt als eigenes Feld in Großbuchstaben hinzu", () => {
  const basis = buildRegistrationPayload({ name: "Max", email: "a@b.de", password: "x", company_name: "Acme" });
  const mit = withReferralCode(basis, "abcd2345");
  assert.equal(mit.referralCode, "ABCD2345");
  const { referralCode, ...rest } = mit;
  assert.deepEqual(rest, basis, "die übrigen Felder bleiben unverändert");
  assert.notEqual(mit, basis, "der Basispayload wird nicht verändert");
});

/* ══════════ Partnerregistrierung: Validierung ═══════════════════════════ */

test("3 — vollständiges Formular ist fehlerfrei; Firma und Telefon sind optional", () => {
  assert.deepEqual(getPartnerRegErrors(VALID, REPEAT), {});
  assert.deepEqual(getPartnerRegErrors({ ...VALID, companyName: "Vertrieb Süd GmbH", phone: "+49 (0)30 123-45 / 6" }, REPEAT), {});
});

test("4 — Name ist Pflicht (2–100, getrimmt)", () => {
  assert.equal(getPartnerRegErrors({ ...VALID, name: "  " }, REPEAT).name, "Name ist ein Pflichtfeld.");
  assert.match(getPartnerRegErrors({ ...VALID, name: "A" }, REPEAT).name, /mindestens 2/);
  assert.match(getPartnerRegErrors({ ...VALID, name: "X".repeat(101) }, REPEAT).name, /maximal 100/);
});

test("5 — E-Mail, Passwortlänge und Wiederholung folgen exakt den Kundenregeln", () => {
  for (const [form, repeat] of [
    [{ ...VALID, email: "" }, REPEAT],
    [{ ...VALID, email: "kein-mail" }, REPEAT],
    [{ ...VALID, password: "kurz" }, "kurz"],
    [{ ...VALID, password: "" }, ""],
    [{ ...VALID, password: "P".repeat(129) }, "P".repeat(129)],
    [VALID, "anders"],
  ]) {
    const partner = getPartnerRegErrors(form, repeat);
    const kunde = getRegErrors({ email: form.email, password: form.password }, repeat);
    for (const k of ["email", "password", "passwordRepeat"]) {
      assert.equal(partner[k], kunde[k], `${k} weicht von der Kundenregel ab`);
    }
  }
  assert.equal(getPartnerRegErrors({ ...VALID, password: "kurz" }, "kurz").password, REG_PASSWORD_TEXTS.tooShort);
  // Die B2B-Pflichtfelder der Kundenregistrierung gelten hier nicht.
  assert.equal("company_name" in getPartnerRegErrors(VALID, REPEAT), false);
});

test("6 — Zustimmung zur Partnervereinbarung ist Pflicht (nur ein echtes true)", () => {
  for (const wert of [false, undefined, "true", 1, null]) {
    assert.equal(getPartnerRegErrors({ ...VALID, agreementAccepted: wert }, REPEAT).agreement,
      PARTNER_REG_TEXTS.agreementRequired, `Zustimmung ${JSON.stringify(wert)} durchgelassen`);
  }
});

test("7 — Längen- und Zeichengrenzen der optionalen Felder", () => {
  assert.equal(getPartnerRegErrors({ ...VALID, companyName: "F".repeat(201) }, REPEAT).companyName, PARTNER_REG_TEXTS.companyTooLong);
  assert.equal(getPartnerRegErrors({ ...VALID, phone: "1".repeat(41) }, REPEAT).phone, PARTNER_REG_TEXTS.phoneTooLong);
  assert.equal(getPartnerRegErrors({ ...VALID, phone: "030<script>" }, REPEAT).phone, PARTNER_REG_TEXTS.phoneInvalid);
});

/* ══════════ Partnerregistrierung: Payload ═══════════════════════════════ */

test("8 — Payload: Pflichtfelder getrimmt, Optionales nur mit Wert, Vertragsfeldnamen", () => {
  const p = buildPartnerRegistrationPayload(
    { ...VALID, name: "  Petra Partner ", email: " petra@partner-vertrieb.de ", companyName: "  ", phone: "" },
    { sponsorCode: null, agreementVersion: "2026-10" },
  );
  assert.deepEqual(p, {
    name: "Petra Partner",
    email: "petra@partner-vertrieb.de",
    password: "SicheresPasswort1",
    acceptedAgreementVersion: "2026-10",
  });
});

test("9 — sponsorCode nur formal gültig; Vereinbarung nur bei Zustimmung", () => {
  const mit = buildPartnerRegistrationPayload(
    { ...VALID, companyName: " Vertrieb Süd GmbH ", phone: " 030 123 " },
    { sponsorCode: "wxyz6789", agreementVersion: " 2026-10 " },
  );
  assert.equal(mit.sponsorCode, "WXYZ6789");
  assert.equal(mit.companyName, "Vertrieb Süd GmbH");
  assert.equal(mit.phone, "030 123");
  assert.equal(mit.acceptedAgreementVersion, "2026-10");
  const ohne = buildPartnerRegistrationPayload({ ...VALID, agreementAccepted: false }, { sponsorCode: "kaputt", agreementVersion: "2026-10" });
  assert.equal("sponsorCode" in ohne, false);
  assert.equal("acceptedAgreementVersion" in ohne, false);
  assert.equal("referralCode" in mit, false, "kein Kundenfeld im Partnerpayload");
  assert.equal("agreementAccepted" in mit, false, "kein Formularzustand im Payload");
});

/* ══════════ Partnerregistrierung: Fehlerantworten ═══════════════════════ */

test("10 — 404 (abgeschaltet oder nicht vorhanden) ergibt den geschlossenen Zustand", () => {
  assert.equal(mapPartnerRegistrationError(404, { code: "SALES_PARTNER_REGISTRATION_DISABLED" }).disabled, true);
  assert.equal(mapPartnerRegistrationError(404, null).disabled, true);
});

test("11 — Feld- und Vereinbarungsfehler landen am Feld", () => {
  assert.deepEqual(mapPartnerRegistrationError(400, { code: "AGREEMENT_REQUIRED", error: "x" }).fieldErrors,
    { agreement: PARTNER_REG_TEXTS.agreementRequired });
  assert.deepEqual(mapPartnerRegistrationError(400, { error: "Passwort zu kurz", code: "PASSWORD_TOO_SHORT", field: "password" }).fieldErrors,
    { password: "Passwort zu kurz" });
  assert.deepEqual(mapPartnerRegistrationError(400, { error: "Firma zu lang", field: "companyName" }).fieldErrors,
    { companyName: "Firma zu lang" });
  const unbekannt = mapPartnerRegistrationError(400, { error: "Ungültig", field: "irgendwas" });
  assert.deepEqual(unbekannt.fieldErrors, {});
  assert.equal(unbekannt.generalError, "Ungültig");
});

test("12 — 409, 429 und Serverfehler: verständliche Texte, kein Rohwert bei 5xx", () => {
  assert.deepEqual(mapPartnerRegistrationError(409, { error: "E-Mail bereits registriert" }).fieldErrors,
    { email: "E-Mail bereits registriert" });
  assert.deepEqual(mapPartnerRegistrationError(409, {}).fieldErrors, { email: PARTNER_REG_TEXTS.emailTaken });
  assert.equal(mapPartnerRegistrationError(429, { error: "slow down" }).generalError, PARTNER_REG_TEXTS.rateLimited);
  const fuenf = mapPartnerRegistrationError(500, { error: "TypeError: x is undefined" });
  assert.equal(fuenf.generalError, PARTNER_REG_TEXTS.generic);
  assert.equal(fuenf.disabled, false);
});

/* ══════════ Verdrahtung ═════════════════════════════════════════════════ */

test("13 — die Partnerseite nutzt die zentrale Validierung, keine eigene Fassung", () => {
  const seite = ohneKommentare(read("pages/PartnerRegisterPage.jsx"));
  assert.match(seite, /from "\.\.\/utils\/registrationValidation\.mjs"/);
  assert.match(seite, /getPartnerRegErrors\(form, passwordRepeat\)/);
  assert.match(seite, /buildPartnerRegistrationPayload\(form, \{/);
  assert.match(seite, /mapPartnerRegistrationError\(/);
  assert.doesNotMatch(seite, /function getPartnerRegErrors|EMAIL_RE\s*=/, "zweite Validierungsfassung in der Seite");
  // Kein Login nach der Registrierung — der Antrag wird erst geprüft.
  assert.doesNotMatch(seite, /ce_token|login\(/);
  // Kein erfundener Rechtstext: der Link erscheint nur mit agreementUrl.
  assert.match(seite, /agreementHref \?/);
});
