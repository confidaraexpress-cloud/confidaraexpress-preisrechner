/* src/utils/shippingContact.test.mjs
 *
 * DER VERSANDKONTAKT IM FORMULAR — strukturiert, verpflichtend, nie geraten.
 *
 * Absender und Empfänger tragen Vorname, Nachname, E-Mail und Telefon. Die Regel ist
 * eine ConfidaraExpress-Produktregel und gilt providerneutral: kein Formularpfad kennt
 * einen Anbieter, und keine Beschriftung nennt einen.
 *
 * Die tragende Zusicherung ist dieselbe wie serverseitig — eine RICHTUNG:
 *
 *     firstName + lastName  →  fullName      erlaubt (Altbestandswert)
 *     fullName              →  firstName/…   verboten, ausnahmslos
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createEmptyShipmentForm, buildPartyPayload, shippingContactErrors,
  CONTACT_NAME_PART_MAX, CONTACT_FULL_NAME_MAX,
} from "./newShipmentForm.mjs";
import { validateAddressForm, addressToFormValues, emptyAddressForm } from "./addressForm.mjs";
import { mapAddressToShipmentFormPatch } from "./addressShipmentMapping.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HIER, "..");
const lies = (p) => fs.readFileSync(path.join(SRC, p), "utf8");
const ohneKommentare = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const VOLL = (p) => ({
  [`${p}_firstName`]: "Anna", [`${p}_lastName`]: "Muster",
  [`${p}_email`]: "anna@example.com", [`${p}_phone`]: "+49301234567",
});

/* ══════════ Pflichtfelder ═══════════════════════════════════════════════════ */

test("D1 — ein vollständiger Kontakt erzeugt keine Fehler", () => {
  assert.deepEqual(shippingContactErrors(VOLL("s"), "s"), {});
});

for (const feld of ["firstName", "lastName", "email", "phone"]) {
  test(`D2 — ${feld} fehlt → Fehler, für BEIDE Parteien`, () => {
    for (const p of ["s", "r"]) {
      const form = { ...VOLL(p), [`${p}_${feld}`]: "" };
      const e = shippingContactErrors(form, p);
      assert.ok(e[`${p}_${feld}`], `${p}_${feld} wurde nicht als Pflichtfeld geprüft`);
    }
  });
}

test("D3 — reiner Whitespace zählt als leer", () => {
  const e = shippingContactErrors({ ...VOLL("s"), s_firstName: "   " }, "s");
  assert.ok(e.s_firstName);
});

test("D4 — die Firma bleibt optional", () => {
  // Sie steht nicht im Kontaktvertrag und darf ihn auch nicht beeinflussen.
  assert.deepEqual(shippingContactErrors({ ...VOLL("s"), s_company: "" }, "s"), {});
});

/* ══════════ Längen ══════════════════════════════════════════════════════════ */

test("D5 — der ZUSAMMENGESETZTE Name trägt die Grenze, nicht die Hälfte", () => {
  assert.equal(CONTACT_FULL_NAME_MAX, 35);
  assert.equal(CONTACT_NAME_PART_MAX, 35);
  // 3 + 1 + 18 = 22 → gültig. Ein starres 17/17 hätte das grundlos abgelehnt.
  assert.deepEqual(
    shippingContactErrors({ ...VOLL("s"), s_firstName: "Ann", s_lastName: "Schmidt-Wellenkamp" }, "s"), {});
  // 18 + 1 + 17 = 36 → abgelehnt, und die Meldung nennt beide Felder.
  const e = shippingContactErrors(
    { ...VOLL("s"), s_firstName: "A".repeat(18), s_lastName: "B".repeat(17) }, "s");
  assert.match(e.s_lastName, /zusammen maximal 35/);
});

test("D6 — das Telefon wird nicht auf ein Format geprüft", () => {
  for (const nummer of ["+49 30 1234-567", "030/1234567", "(030) 1234567"]) {
    assert.deepEqual(shippingContactErrors({ ...VOLL("s"), s_phone: nummer }, "s"), {},
      `gültige Schreibweise abgelehnt: ${nummer}`);
  }
});

/* ══════════ Formularvertrag ═════════════════════════════════════════════════ */

test("D7 — das leere Formular führt die neuen Felder für beide Parteien", () => {
  const f = createEmptyShipmentForm();
  for (const p of ["s", "r"])
    for (const k of ["firstName", "lastName", "email", "phone"])
      assert.equal(f[`${p}_${k}`], "", `${p}_${k} fehlt im Ausgangszustand oder ist nicht leer`);
});

test("D8 — der Payload trägt die Pflichtfelder IMMER, auch leer", () => {
  // Auch leer: sonst rutscht ein fehlender Schlüssel still durch, statt dass die
  // serverseitige Prüfung greift.
  const p = buildPartyPayload(createEmptyShipmentForm(), "s");
  for (const k of ["firstName", "lastName", "email", "phone"])
    assert.ok(k in p, `${k} fehlt im Payload`);
  // `fullName` ist kein Eingabefeld mehr und erscheint nur mit Altbestandswert.
  assert.ok(!("fullName" in p), "ein leerer fullName wird mitgesendet");
  assert.equal("fullName" in buildPartyPayload({ s_fullName: "Müller GmbH" }, "s"), true);
});

/* ══════════ Die Richtung ════════════════════════════════════════════════════ */

test("D9 — eine ALTBESTANDSadresse füllt die Namensfelder NICHT", () => {
  const alt = { contactName: "Müller GmbH", streetAndNumber: "S 1", postalCode: "10115",
                city: "Berlin", country: "DE" };
  const patch = mapAddressToShipmentFormPatch(alt, "s");
  assert.equal(patch.s_firstName, "", "aus contactName wurde ein Vorname erzeugt");
  assert.equal(patch.s_lastName, "", "aus contactName wurde ein Nachname erzeugt");
  assert.equal(patch.s_fullName, "Müller GmbH", "der Altwert ging verloren");
});

test("D10 — dasselbe im Adressbuchformular", () => {
  const form = addressToFormValues({ contactName: "Müller GmbH" });
  assert.equal(form.firstName, "");
  assert.equal(form.lastName, "");
  assert.equal(form.contactName, "Müller GmbH");
  // Und sie ist damit nicht speicherbar, bis der Kontakt steht.
  const e = validateAddressForm({ ...form, streetAndNumber: "S 1", postalCode: "10115",
                                  city: "Berlin", country: "DE" });
  assert.ok(e.firstName && e.lastName && e.email && e.phone);
});

test("D11 — kein Formularmodul zerlegt einen Namen", () => {
  for (const datei of ["utils/newShipmentForm.mjs", "utils/addressForm.mjs",
                       "utils/addressShipmentMapping.mjs"]) {
    const code = ohneKommentare(lies(datei));
    for (const verboten of ["contactName.split", "fullName.split",
                            "contactName.indexOf(' ')", 'fullName.indexOf(" ")']) {
      assert.ok(!code.includes(verboten),
        `${datei} enthält "${verboten}" — die Rückrichtung ist verboten`);
    }
  }
});

/* ══════════ Providerneutralität ═════════════════════════════════════════════ */

test("D12 — keine Oberfläche nennt einen Anbieter oder verzweigt auf ihn", () => {
  for (const datei of ["pages/NewShipmentPage.jsx", "components/addressbook/AddressFormDrawer.jsx",
                       "utils/newShipmentForm.mjs", "utils/addressForm.mjs"]) {
    const code = ohneKommentare(lies(datei));
    for (const wort of ["transglobal", "Transglobal", "TRANSGLOBAL",
                        "Forename", "Surname", "GetQuote"]) {
      assert.ok(!code.includes(wort), `${datei} nennt "${wort}"`);
    }
  }
});

test("D13 — die sichtbaren Beschriftungen sind deutsch und fachlich", () => {
  const seite = lies("pages/NewShipmentPage.jsx");
  for (const label of ['"Vorname"', '"Nachname"', '"Telefon"', '"E-Mail"'])
    assert.ok(seite.includes(label), `die Beschriftung ${label} fehlt im Versandformular`);
  // Das frühere kombinierte Feld gibt es nicht mehr.
  assert.ok(!seite.includes('"Vor- und Nachname"'),
    "das kombinierte Namensfeld steht noch im Formular");
});

test("D14 — Telefon und E-Mail sind keine Zusatzangaben mehr", () => {
  const seite = ohneKommentare(lies("pages/NewShipmentPage.jsx"));
  for (const p of ["s", "r"])
    for (const feld of ["phone", "email"]) {
      const zeile = seite.split("\n").find((z) => z.includes(`addrField("${p}", "${feld}"`));
      assert.ok(zeile, `${p}_${feld} wird nicht mehr gerendert`);
      assert.ok(!/,\s*true\s*\)/.test(zeile),
        `${p}_${feld} ist noch als optional markiert: ${zeile.trim()}`);
    }
});
