// B2B-Profilintegrität im Kundenprofil.
//
// ConfidaraExpress ist ausschließlich B2B: Firmenname und Ansprechpartner dürfen im
// Profil geändert, aber nicht geleert werden. Bis hierher galt im Profilformular
// ausdrücklich „alle Felder optional" — leere Eingaben wurden abgesendet und vom
// Backend als NULL gespeichert.
//
// Geprüft wird die reine Logik aus profileView.mjs plus der Quelltext von
// Profile.jsx als Contract (das Repo hat bewusst keine React-Render-Infrastruktur).
//
// Run: node --test src/utils/profileB2bIntegrity.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  COMPANY_FIELDS,
  CONTACT_FIELDS,
  B2B_REQUIRED_PROFILE_FIELDS,
  isB2BRequiredField,
  validateCompanyForm,
  validateContactForm,
  isFormValid,
  canSaveCompany,
  canSaveContact,
  buildCompanyPatch,
  buildContactPatch,
  companyBaseline,
  contactBaseline,
  mapApiProfileError,
} from "./profileView.mjs";
import { B2B_REQUIRED_FIELDS } from "./registrationValidation.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const profileSrc = readFileSync(join(__dirname, "../components/dashboard/Profile.jsx"), "utf8");

const COMPANY_OK = {
  company_name: "Muster Logistik GmbH",
  vat_id: "DE123456789",
  street: "Musterstr. 1",
  zip: "10115",
  city: "Berlin",
  country: "DE",
};
const CONTACT_OK = { name: "Max Mustermann" };

// ─── Pflichtfelder ────────────────────────────────────────────────────────────

test("1 — Firmenname ist im Profil ein Pflichtfeld", () => {
  assert.equal(isB2BRequiredField("company_name"), true);
  assert.ok(B2B_REQUIRED_PROFILE_FIELDS.includes("company_name"));
  for (const value of ["", "   ", "\t\n ", undefined, null]) {
    const e = validateCompanyForm({ ...COMPANY_OK, company_name: value });
    assert.equal(e.company_name, "Firmenname ist ein Pflichtfeld.", `Wert: ${JSON.stringify(value)}`);
  }
});

test("2 — Ansprechpartner ist im Profil ein Pflichtfeld", () => {
  assert.equal(isB2BRequiredField("name"), true);
  assert.ok(B2B_REQUIRED_PROFILE_FIELDS.includes("name"));
  for (const value of ["", "   ", "\t", undefined, null]) {
    const e = validateContactForm({ name: value });
    assert.equal(e.name, "Ansprechpartner ist ein Pflichtfeld.", `Wert: ${JSON.stringify(value)}`);
  }
});

test("3 — leere Eingaben werden nicht abgesendet (Speichern gesperrt)", () => {
  const base = companyBaseline({ company_name: "Muster Logistik GmbH", country: "DE" });
  assert.equal(canSaveCompany({ ...COMPANY_OK, company_name: "" }, base, false), false);
  assert.equal(canSaveCompany({ ...COMPANY_OK, company_name: "   " }, base, false), false);

  const cbase = contactBaseline({ name: "Max Mustermann" });
  assert.equal(canSaveContact({ name: "" }, cbase, false), false);
  assert.equal(canSaveContact({ name: "  " }, cbase, false), false);
});

test("4 — Whitespace-only wird abgelehnt, auch wenn es eine echte Änderung wäre", () => {
  // "   " unterscheidet sich vom Baseline-Wert, ist also dirty — trotzdem ungültig.
  const base = companyBaseline({ company_name: "Alt GmbH", country: "DE" });
  const form = { ...COMPANY_OK, company_name: "   " };
  assert.equal(isFormValid(validateCompanyForm(form)), false);
  assert.equal(canSaveCompany(form, base, false), false, "dirty allein darf nicht zum Speichern reichen");
});

test("5 — gültige Änderungen bleiben möglich", () => {
  assert.deepEqual(validateCompanyForm(COMPANY_OK), {});
  assert.deepEqual(validateContactForm(CONTACT_OK), {});

  const base = companyBaseline({ company_name: "Alt GmbH", country: "DE" });
  assert.equal(canSaveCompany({ ...COMPANY_OK, company_name: "Neu GmbH" }, base, false), true);

  const cbase = contactBaseline({ name: "Alt Person" });
  assert.equal(canSaveContact({ name: "Neue Person" }, cbase, false), true);
});

test("6 — unvollständiges Alt-Konto kann die fehlenden Angaben ergänzen", () => {
  const base = companyBaseline({ company_name: "", country: "DE" });
  const form = { ...COMPANY_OK, company_name: "Alt Logistik GmbH" };
  assert.deepEqual(validateCompanyForm(form), {});
  assert.equal(canSaveCompany(form, base, false), true, "Ergänzen muss möglich sein");

  const cbase = contactBaseline({ name: null });
  assert.equal(canSaveContact({ name: "Erika Beispiel" }, cbase, false), true);
});

test("7 — Grenzwerte entsprechen Registrierung und Backend (2/200 und 2/100)", () => {
  const company = B2B_REQUIRED_FIELDS.find((f) => f.apiField === "company_name");
  const contact = B2B_REQUIRED_FIELDS.find((f) => f.apiField === "name");
  assert.deepEqual([company.minLen, company.maxLen], [2, 200]);
  assert.deepEqual([contact.minLen, contact.maxLen], [2, 100]);

  assert.match(validateCompanyForm({ ...COMPANY_OK, company_name: "A" }).company_name, /mindestens 2/);
  assert.match(validateCompanyForm({ ...COMPANY_OK, company_name: "X".repeat(201) }).company_name, /maximal 200/);
  assert.match(validateContactForm({ name: "B" }).name, /mindestens 2/);
  assert.match(validateContactForm({ name: "Y".repeat(101) }).name, /maximal 100/);
});

// ─── Optionale Felder bleiben optional ────────────────────────────────────────

test("8 — die übrigen Profilfelder bleiben leerbar", () => {
  const e = validateCompanyForm({ company_name: "Muster GmbH", vat_id: "", street: "", zip: "", city: "", country: "DE" });
  assert.deepEqual(e, {}, "USt-ID, Straße, PLZ und Stadt dürfen weiterhin leer sein");
  assert.equal(B2B_REQUIRED_PROFILE_FIELDS.includes("vat_id"), false);
  assert.equal(B2B_REQUIRED_PROFILE_FIELDS.includes("street"), false);
  assert.equal(isB2BRequiredField("country"), false);
});

test("9 — Länderprüfung und Längengrenzen der Optionalfelder unverändert", () => {
  assert.match(validateCompanyForm({ ...COMPANY_OK, country: "XYZ" }).country, /gültiges Land/);
  assert.match(validateCompanyForm({ ...COMPANY_OK, vat_id: "X".repeat(31) }).vat_id, /Maximal 30/);
  assert.match(validateCompanyForm({ ...COMPANY_OK, zip: "1".repeat(11) }).zip, /Maximal 10/);
});

// ─── Payload und Feldvertrag ──────────────────────────────────────────────────

test("10 — Patch-Struktur und Feldnamen unverändert (snake_case, keine Varianten)", () => {
  const company = buildCompanyPatch(COMPANY_OK);
  assert.deepEqual(Object.keys(company).sort(), [...COMPANY_FIELDS].sort());
  assert.equal("companyName" in company, false);
  assert.equal("company" in company, false);

  const contact = buildContactPatch(CONTACT_OK);
  assert.deepEqual(Object.keys(contact), CONTACT_FIELDS);
  // Pflichtfelder werden getrimmt gesendet.
  assert.equal(buildCompanyPatch({ ...COMPANY_OK, company_name: "  Muster GmbH  " }).company_name, "Muster GmbH");
  assert.equal(buildContactPatch({ name: "  Max Mustermann  " }).name, "Max Mustermann");
});

// ─── Backend-Feldfehler ───────────────────────────────────────────────────────

test("11 — API-Feldfehler erscheint am richtigen Feld", () => {
  const company = mapApiProfileError({
    error: "Firmenname ist ein Pflichtfeld.",
    code: "B2B_PROFILE_FIELD_REQUIRED",
    field: "company_name",
  });
  assert.deepEqual(company.fieldErrors, { company_name: "Firmenname ist ein Pflichtfeld." });
  assert.equal(company.generalError, "");

  const contact = mapApiProfileError({ error: "Ansprechpartner ist ein Pflichtfeld.", field: "name" });
  assert.deepEqual(contact.fieldErrors, { name: "Ansprechpartner ist ein Pflichtfeld." });
});

test("12 — Fehler ohne/mit unbekanntem Feld bleibt allgemeine Meldung", () => {
  const noField = mapApiProfileError({ error: "Fehler" });
  assert.deepEqual(noField.fieldErrors, {});
  assert.equal(noField.generalError, "Fehler");

  const unknown = mapApiProfileError({ error: "Kaputt", field: "payment_term" });
  assert.deepEqual(unknown.fieldErrors, {}, "Nicht-Formularfelder dürfen keinen unsichtbaren Fehler erzeugen");
  assert.equal(unknown.generalError, "Kaputt");

  assert.match(mapApiProfileError(null).generalError, /Speichern fehlgeschlagen/);
});

// ─── Quelltext-Contract: Profile.jsx ──────────────────────────────────────────

test("13 — beide Felder sind im Formular als Pflicht ausgezeichnet", () => {
  for (const id of ["pf-company-name", "pf-name"]) {
    const block = profileSrc.slice(profileSrc.indexOf(`id="${id}"`));
    const input = block.slice(0, block.indexOf("/>"));
    assert.match(input, /requiredProps\(/, `${id}: required-Props fehlen`);
  }
  assert.match(profileSrc, /required: true,\s*\n\s*"aria-required": "true"/, "required + aria-required");
  assert.match(profileSrc, /htmlFor="pf-company-name">Firmenname \{req\}/);
  assert.match(profileSrc, /htmlFor="pf-name">Name \{req\}/);
});

test("14 — Feldfehler werden am Eingabefeld gerendert", () => {
  assert.match(profileSrc, /mapApiProfileError/, "Backendfehler müssen gemappt werden");
  assert.match(profileSrc, /fieldErr\("company_name"\)/);
  assert.match(profileSrc, /fieldErr\("name"\)/);
  assert.match(profileSrc, /profile-field-error/);
  assert.match(profileSrc, /"aria-invalid": fieldErrors\[k\] \? "true" : undefined/);
});

test("15 — Submit bei ungültigen Pflichtfeldern wird verhindert", () => {
  // Der Guard muss VOR dem Netzwerkaufruf stehen und aus dem Handler zurückkehren.
  const handler = profileSrc.slice(profileSrc.indexOf("const saveCard = async"));
  const body = handler.slice(0, handler.indexOf("\n  const updPw"));
  const idxGuard = body.indexOf("if (!isFormValid(errors))");
  const idxFetch = body.indexOf("apiFetch(");
  assert.ok(idxGuard > -1, "Gültigkeits-Guard fehlt");
  assert.ok(idxFetch > idxGuard, "Guard muss vor dem apiFetch stehen");
  assert.match(body.slice(idxGuard, idxGuard + 160), /setFieldErrors\(errors\)/, "Feldfehler müssen gesetzt werden");
  assert.match(body.slice(idxGuard, idxGuard + 160), /return;/, "ungültige Formulare dürfen nicht abgesendet werden");
  assert.match(profileSrc, /canSaveCompany\(companyForm, companyBase, saving\)/);
  assert.match(profileSrc, /canSaveContact\(contactForm, contactBase, saving\)/);
});

test("16 — Lade- und Doppelklick-Sperre bleibt erhalten", () => {
  assert.match(profileSrc, /if \(saving\) return;/, "Mehrfachversand-Guard");
  assert.match(profileSrc, /disabled=\{!canSave\}/, "Speichern-Button bleibt an canSave gebunden");
  assert.match(profileSrc, /disabled=\{saving\}/, "Abbrechen bleibt während des Speicherns gesperrt");
  assert.match(profileSrc, /setSaving\(true\)/);
});

test("17 — Pflichthinweis ist sichtbar und nennt den B2B-Grund", () => {
  assert.match(profileSrc, /profile-required-hint/);
  assert.match(profileSrc, /Firmenname ist eine Pflichtangabe/);
  assert.match(profileSrc, /Ansprechpartner ist eine Pflichtangabe/);
  assert.match(profileSrc, /reine Geschäftskundenplattform/);
});

test("18 — mobile Struktur bleibt erhalten (bestehende Feldklassen unverändert)", () => {
  // Die Karten nutzen weiterhin dieselben Container- und Grid-Klassen; ergänzt
  // wurden nur reine Zusatzklassen ohne eigene Breiten-/Höhenangaben.
  assert.match(profileSrc, /className="profile-form-body profile-inline-form"/);
  assert.equal((profileSrc.match(/className="field-row field-row-3"/g) || []).length, 1);
  assert.equal((profileSrc.match(/className="field"/g) || []).length >= 5, true);
  for (const cls of ["profile-req", "profile-field-error", "profile-required-hint"]) {
    assert.equal(new RegExp(`${cls}[^"]*"[^>]*style=`).test(profileSrc), false, `${cls} darf kein Inline-Layout setzen`);
  }
});

test("19 — kein B2C-/Privatkunden-Wording im Profil", () => {
  for (const term of [/Privatkunde/i, /Privatperson/i, /Verbraucher/i, /\bB2C\b/i]) {
    assert.equal(term.test(profileSrc), false, `unerwünschtes Wording ${term}`);
  }
});

test("20 — Profil führt keine eigene abweichende B2B-Regel (eine Quelle)", () => {
  const viewSrc = readFileSync(join(__dirname, "profileView.mjs"), "utf8");
  assert.match(viewSrc, /from "\.\/registrationValidation\.mjs"/, "Regeln kommen aus dem zentralen Modul");
  assert.equal(/minLen\s*[:=]\s*\d/.test(viewSrc), false, "keine eigenen Mindestlängen im Profilmodul");
  // Der alte Kommentar „Alle Felder optional" darf nicht stehen bleiben.
  assert.equal(/Alle Felder optional/.test(viewSrc), false);
});
