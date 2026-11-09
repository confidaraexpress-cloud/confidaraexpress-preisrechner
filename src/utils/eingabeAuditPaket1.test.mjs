// Eingabe-Audit 2026-11-03, Paket 1 — die Korrekturen im Frontend (A1, A4, A6, A7, A9, A10, A11, A12, A13).
// Reine Funktionen, kein Netz. Die gemeinsamen Falltabellen (Telefon, Kontaktdaten, USt-IdNr.) prüfen ihre eigenen Tests.
import { test } from "node:test";
import assert from "node:assert/strict";

import { stripInvisibleFormatChars, normalizeFreeText } from "./textInput.mjs";
import { validatePostalCode } from "./postalCode.mjs";
import { parsePhoneNumber, phoneTransmission, PHONE_TARGET } from "./phoneNumber.mjs";
import { parseStockAmount } from "./inventoryStockView.mjs";
import { bookingAddressErrorText, mapBookRestError, BOOKING_ADDRESS_INVALID_CODE } from "./bookingErrors.mjs";
import { inventoryErrorText, inventoryFieldError } from "./inventoryErrors.mjs";
import { parseIntegerInput, parseMeasureInput, parseMoneyInput } from "./productFormNumbers.mjs";
import { parseQuantity } from "./manualInvoiceView.mjs";
import { providerContentDescription, contentLengthHint } from "./shipmentDeclarations.mjs";
import { getRegErrors, getPartnerRegErrors } from "./registrationValidation.mjs";
import { validateCompanyForm } from "./profileView.mjs";
import { validateOptionalVatId } from "./vatId.mjs";
import { ADDRESS_FIELD_MAXLEN } from "./addressForm.mjs";
import { buildImportDocument } from "./inventoryImportDocument.mjs";
import { issueText } from "./inventoryImportText.mjs";

const ZWSP = String.fromCharCode(0x200b);
const NFD_MUELLER = "Mu" + String.fromCharCode(0x308) + "ller";

test("A9 — unsichtbare Zeichen und zerlegte Umlaute", () => {
  assert.equal(stripInvisibleFormatChars(ZWSP + "70794"), "70794");
  assert.equal(normalizeFreeText(NFD_MUELLER), "Müller");
  assert.equal(validatePostalCode("DE", ZWSP + "70794").normalizedValue, "70794");
  assert.equal(validatePostalCode("NL", "1234 ab").normalizedValue, "1234 AB", "A13: Großbuchstaben für jedes Land");
  assert.equal(parsePhoneNumber("+49 30 1234567" + ZWSP).ok, true);
});

test("A8 — Gruppenschreibweise verliert im kompakten Feld keine Ziffern mehr", () => {
  const p = parsePhoneNumber("+49 1512-3456-7890");
  assert.equal(p.extension, null);
  assert.equal(phoneTransmission(p, PHONE_TARGET.COMPACT).value, "+49151234567890");
  const d = parsePhoneNumber("0711-123456-78");
  assert.equal(d.extension, "78", "eine echte Durchwahl bleibt eine");
});

test("A1 — eine leere Menge ist keine 0", () => {
  assert.deepEqual(parseStockAmount("", { allowZero: true }).ok, false);
  assert.deepEqual(parseStockAmount("   ", { allowZero: true }).ok, false);
  assert.deepEqual(parseStockAmount("12,5", { allowZero: true }).ok, false);
  assert.deepEqual(parseStockAmount("0", { allowZero: true }), { ok: true, value: 0 }, "eine gezählte 0 bleibt möglich");
  assert.equal(parseStockAmount("0").ok, false, "Einbuchen verlangt mindestens 1");
  assert.deepEqual(parseStockAmount(" 7 "), { ok: true, value: 7 });
});

test("A4 — Adressfehler der Buchung nennen Feld, Partei und Grenze", () => {
  const body = {
    error: "Adressvalidierung fehlgeschlagen", code: BOOKING_ADDRESS_INVALID_CODE,
    errors: ["recipient.streetAndNumber: max. 35 Zeichen"],
    fieldErrors: [
      { party: "recipient", field: "streetAndNumber", reason: "max. 35 Zeichen" },
      { party: "sender", field: "city", reason: "fehlt" },
    ],
  };
  const text = bookingAddressErrorText(body);
  assert.match(text, /Straße und Hausnummer \(Empfänger\): höchstens 35 Zeichen für diesen Versanddienst/);
  assert.match(text, /Ort \(Absender\): fehlt/);
  const fehler = mapBookRestError(400, body);
  assert.equal(fehler.title, "Adressangaben prüfen");
  assert.equal(fehler.message, text);
  assert.ok(!fehler.message.includes("streetAndNumber"), "kein technischer Feldname im Kundentext");
  // Ohne Feldliste (älterer Server) bleibt der bisherige Weg.
  assert.equal(bookingAddressErrorText({ code: BOOKING_ADDRESS_INVALID_CODE }), null);
});

test("A6 — Feldfehler im Lagerbereich zeigen Feld und Grund statt eines Sammelsatzes", () => {
  assert.equal(inventoryErrorText({ code: "INVALID_QUANTITY", error: "recipient.streetAndNumber: max. 35 Zeichen" }),
    "Straße und Hausnummer (Empfänger): höchstens 35 Zeichen");
  assert.equal(inventoryErrorText({ code: "INVALID_QUANTITY", error: "weightKg: muss zwischen 0.001 und 1000 liegen" }),
    "Gewicht: muss zwischen 0,001 und 1000 liegen");
  assert.equal(inventoryErrorText({ code: "INVALID_QUANTITY", error: "minStock: ganze Zahl zwischen 0 und 1.000.000" }),
    "Mindestbestand: ganze Zahl zwischen 0 und 1.000.000", "Tausenderpunkte bleiben");
  assert.equal(inventoryFieldError({ code: "INVALID_QUANTITY", error: "geheimesFeld: kaputt" }), null);
  assert.equal(inventoryErrorText({ code: "INVALID_QUANTITY", error: "geheimesFeld: kaputt" }), "Bitte prüfen Sie Ihre Eingabe.");
  assert.equal(inventoryErrorText({ code: "INSUFFICIENT_STOCK" }), "Dafür ist nicht genügend Bestand verfügbar.");
});

test("A12 — Zahlen im Artikelformular werden eindeutig gelesen", () => {
  assert.deepEqual(parseIntegerInput("1.000"), { value: 1000 });
  assert.deepEqual(parseIntegerInput("1000"), { value: 1000 });
  assert.deepEqual(parseIntegerInput("1,5"), { invalid: true });
  assert.deepEqual(parseMoneyInput("1.234"), { value: 1234 });
  assert.deepEqual(parseMoneyInput("1.234,50"), { value: 1234.5 });
  assert.deepEqual(parseMoneyInput("12.5"), { value: 12.5 });
  assert.deepEqual(parseMoneyInput("1,234"), { invalid: true }, "drei Nachkommastellen gibt es bei Euro nicht");
  assert.deepEqual(parseMeasureInput("0,02"), { value: 0.02 });
  assert.deepEqual(parseMeasureInput("1e2"), { invalid: true });
  assert.deepEqual(parseMeasureInput("0x10"), { invalid: true });
  assert.deepEqual(parseMeasureInput(""), { empty: true });
});

test("A12 — manuelle Rechnung: eine Menge „1.000“ ist mehrdeutig und wird gemeldet", () => {
  assert.equal(parseQuantity("1.000"), null);
  assert.equal(parseQuantity("1000"), "1000");
  assert.equal(parseQuantity("1,5"), "1.5");
  assert.equal(parseQuantity("1.25"), "1.25");
});

test("A11 — Inhaltsangabe: Wortgrenze und sichtbarer Hinweis", () => {
  assert.equal(providerContentDescription("Ersatzteile für Hydraulikpumpen und Dichtungssätze"), "Ersatzteile für Hydraulikpumpen und");
  assert.equal(providerContentDescription("Ersatzteile für Hydraulikpumpen, Dichtungen"), "Ersatzteile für Hydraulikpumpen");
  assert.equal(contentLengthHint("Bücher"), null);
  assert.match(contentLengthHint("Ersatzteile für Hydraulikpumpen und Dichtungssätze"), /Übertragen wird dann: „Ersatzteile für Hydraulikpumpen und“/);
});

test("A13 — Registrierung: E-Mail höchstens 254 Zeichen, PLZ nach Landesregel, Partnertelefon nach Telefonvertrag", () => {
  const basis = { email: "anna@example.de", password: "Sicher-123!", name: "Anna Muster", company_name: "Muster GmbH", vat_id: "DE123456789", country: "DE" };
  assert.ok(getRegErrors({ ...basis, email: "a".repeat(245) + "@example.de" }, "Sicher-123!").email);
  assert.ok(getRegErrors({ ...basis, zip: "1234" }, "Sicher-123!").zip);
  assert.equal(getRegErrors({ ...basis, zip: "70794" }, "Sicher-123!").zip, undefined);
  assert.equal(getRegErrors({ ...basis, zip: "" }, "Sicher-123!").zip, undefined, "leer bleibt erlaubt");
  const partner = { name: "Paul Partner", email: "paul@example.de", password: "Sicher-123!" };
  assert.ok(getPartnerRegErrors({ ...partner, phone: "123" }, "Sicher-123!", { requireAgreement: false }).phone);
  assert.equal(getPartnerRegErrors({ ...partner, phone: "+49 711 123456 Durchwahl 3" }, "Sicher-123!", { requireAgreement: false }).phone, undefined);
});

test("A13 — Profil: neue USt-IdNr. und PLZ nach Regel, unveränderte Altwerte sperren nicht", () => {
  const form = { company_name: "Muster GmbH", vat_id: "x", eori_number: "", street: "", zip: "123", city: "", country: "DE" };
  assert.deepEqual(validateCompanyForm(form, { ...form }), {}, "unveränderter Altwert");
  assert.ok(validateCompanyForm({ ...form, vat_id: "DE12" }, form).vat_id, "neuer, ungültiger Wert");
  assert.equal(validateCompanyForm({ ...form, vat_id: "DE123456789" }, form).vat_id, undefined);
  assert.ok(validateCompanyForm({ ...form, zip: "1234" }, form).zip, "geänderte PLZ wird geprüft");
  assert.ok(validateCompanyForm({ ...form, country: "AT" }, form).zip, "neues Land prüft die PLZ neu");
  assert.deepEqual(validateOptionalVatId(""), { ok: true, value: null });
});

test("A13 — Adressbuch-Notiz: dieselben 2000 Zeichen wie der Server", () => {
  assert.equal(ADDRESS_FIELD_MAXLEN.notes, 2000);
});

test("A10 — XLSX: eine EAN als Zahl bekommt einen sichtbaren Hinweis", () => {
  const { document } = buildImportDocument({
    rows: [["Artikelnummer", "EAN", "Gewicht"], ["A-1", 12345678905, 1]],
    headerIndex: 0, mapping: { sku: 0, ean: 1, weightKg: 2 },
    labels: { sku: "Artikelnummer", ean: "EAN", weightKg: "Gewicht (kg)" }, units: { weightKg: "kg" },
    numberFormat: "de", source: { type: "xlsx", name: "a.xlsx", sheet: "Artikel" },
    options: { stockMode: "none", updateExisting: true, warehouseId: null },
  });
  assert.deepEqual(document.rows[0].issues, [{ field: "ean", code: "EAN_NUMERIC" }]);
  assert.equal(document.rows[0].values.ean, "12345678905");
  assert.match(issueText({ field: "ean", code: "EAN_NUMERIC" }, {}), /führende Nullen/);
});
