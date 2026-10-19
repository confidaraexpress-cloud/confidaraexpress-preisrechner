// Adressbuch — Korrekturen aus Auftrag 1 (P7, 2026-10-17).
//
// Abgesichert wird, was der Audit als Fehler belegt hat: ein Favoriten-Klick holte einen alten
// Standard zurück (volles Objekt statt Teil-Update), „Kopie von …" sprengte die Servergrenze des
// Labels, Fehler erschienen roh („Failed to fetch") oder mit dem falschen Vorgang, Serverfehler
// standen nicht am Feld, und Formulargrenzen lagen über denen des Servers. Das Verhalten im echten
// Browser prüft tests/e2e/addressBookFlows.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  emptyAddressForm, prepareDuplicateFormValues, validateAddressForm,
  ADDRESS_FIELD_MAXLEN, ADDRESS_OPERATIONS, addressFailureMessage, addressExceptionMessage,
  addressServerFieldErrors, firstAddressErrorField,
  applyAddressMutation, applyPromotedDefaultSender, addressActionTarget,
} from "./addressBookView.mjs";

const seite = readFileSync(new URL("../pages/AddressBookPage.jsx", import.meta.url), "utf8");

// Servergrenzen aus routes/addresses.js (STRING_MAXLEN, Backend). Das Formular darf nie darüber
// liegen — sonst lehnt der Server ab, was das Formular annimmt.
const SERVER_MAX = {
  label: 80, company: 255, contactName: 35, streetAndNumber: 255, addressAdd: 255, city: 255,
  state: 100, email: 255, phone: 40, firstName: 35, lastName: 35,
};

const gueltig = () => ({
  ...emptyAddressForm(),
  firstName: "Anna", lastName: "Berg", email: "anna@example.org", phone: "+49 30 1234567",
  streetAndNumber: "Hauptstraße 5", postalCode: "10115", city: "Berlin", country: "DE",
});

test("1 — keine Formulargrenze liegt über der Servergrenze", () => {
  for (const [feld, max] of Object.entries(SERVER_MAX)) {
    assert.ok(ADDRESS_FIELD_MAXLEN[feld] <= max, `${feld}: Formular ${ADDRESS_FIELD_MAXLEN[feld]} > Server ${max}`);
  }
  assert.equal(ADDRESS_FIELD_MAXLEN.label, 80);
  assert.equal(ADDRESS_FIELD_MAXLEN.phone, 40);
});

test("2 — zu lange Angaben stehen schon vor dem Absenden am Feld", () => {
  assert.deepEqual(validateAddressForm(gueltig()), {});
  const e = validateAddressForm({ ...gueltig(), label: "x".repeat(81), phone: "1".repeat(41) });
  assert.match(e.label, /maximal 80 Zeichen/);
  assert.match(e.phone, /maximal 40 Zeichen/);
  assert.equal(firstAddressErrorField(e), "label", "der Fokus geht nicht auf das oberste Fehlerfeld");
});

test("3 — Duplizieren hält die 80-Zeichen-Grenze des Labels", () => {
  assert.equal(prepareDuplicateFormValues({ label: "Lager Nord" }).label, "Kopie von Lager Nord");
  const lang = prepareDuplicateFormValues({ label: "L".repeat(80) });
  assert.ok(lang.label.length <= 80, `Label hat ${lang.label.length} Zeichen`);
  assert.ok(lang.label.startsWith("Kopie von ") && lang.label.endsWith("…"));
  assert.deepEqual(validateAddressForm({ ...gueltig(), label: lang.label }), {}, "die Kopie scheitert an der Grenze");
  // Ein Ersatzpaar (Emoji) wird beim Kürzen nie halbiert.
  const emoji = prepareDuplicateFormValues({ label: "😀".repeat(40) }).label;
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji), "ein Ersatzpaar wurde halbiert");
  // Standards und Favorit werden nie mitkopiert.
  const kopie = prepareDuplicateFormValues({ label: "A", favorite: true, isDefaultSender: true, isDefaultRecipient: true });
  assert.equal(kopie.favorite, false);
  assert.equal(kopie.isDefaultSender, false);
  assert.equal(kopie.isDefaultRecipient, false);
});

test("4 — nach einem Standardwechsel gibt es genau EINEN Standard je Rolle", () => {
  const liste = [
    { id: 1, isDefaultSender: true, isDefaultRecipient: false, favorite: false, role: "both" },
    { id: 2, isDefaultSender: false, isDefaultRecipient: true, favorite: false, role: "both" },
    { id: 3, isDefaultSender: false, isDefaultRecipient: false, favorite: false, role: "both" },
  ];
  const nachAbsender = applyAddressMutation(liste, { ...liste[2], isDefaultSender: true }, "defaultSender");
  assert.deepEqual(nachAbsender.filter(a => a.isDefaultSender).map(a => a.id), [3]);
  assert.deepEqual(nachAbsender.filter(a => a.isDefaultRecipient).map(a => a.id), [2], "der Empfänger-Standard ging verloren");
  const nachEmpfaenger = applyAddressMutation(nachAbsender, { ...nachAbsender[0], isDefaultRecipient: true }, "defaultRecipient");
  assert.deepEqual(nachEmpfaenger.filter(a => a.isDefaultRecipient).map(a => a.id), [1]);
  assert.deepEqual(nachEmpfaenger.filter(a => a.isDefaultSender).map(a => a.id), [3]);
});

test("5 — ein Favoriten-Klick sendet NUR die Änderung und holt keinen alten Standard zurück", () => {
  // Bis 2026-10 ging das volle Objekt aus dem lokalen Stand mit; trug die Zeile noch das alte
  // isDefaultSender: true, machte der Klick sie still wieder zum Standard.
  assert.match(seite, /const r = await updateAddress\(address\.id, patch\);/);
  assert.doesNotMatch(seite, /normalizeAddressForm\(\{ \.\.\.addressToFormValues\(address\), \.\.\.patch \}\)/);
  assert.match(seite, /quickUpdate\(address, \{ favorite: !address\.favorite \}, "favorite"/);
  assert.match(seite, /quickUpdate\(address, \{ isDefaultSender: true \}, "defaultSender"/);
  assert.match(seite, /quickUpdate\(address, \{ isDefaultRecipient: true \}, "defaultRecipient"/);
});

test("6 — Löschen mit Nachrücken: die Liste folgt lokal, ohne auf Seite 1 zu springen", () => {
  const liste = [{ id: 1, isDefaultSender: true }, { id: 2, isDefaultSender: false }, { id: 3, isDefaultSender: false }];
  const ohne1 = applyAddressMutation(liste, { id: 1 }, "delete");
  assert.deepEqual(applyPromotedDefaultSender(ohne1, 3).filter(a => a.isDefaultSender).map(a => a.id), [3]);
  assert.deepEqual(applyPromotedDefaultSender(ohne1, null), ohne1, "ohne Nachrücker ändert sich nichts");
  assert.doesNotMatch(seite, /if \(d\?\.newDefaultSenderId != null\) load\(\);/, "das Neuladen auf Seite 1 ist zurück");
});

test("7 — „Nur Favoriten“: eine entfernte Favoritin verschwindet aus der Ansicht", () => {
  const liste = [{ id: 1, favorite: true, role: "sender" }, { id: 2, favorite: true, role: "sender" }];
  const neu = applyAddressMutation(liste, { id: 1, favorite: false, role: "sender" }, "favorite", { favoritesOnly: true });
  assert.deepEqual(neu.map(a => a.id), [2]);
});

test("8 — Fehlertexte nennen den Vorgang, nie den Rohtext des Browsers", () => {
  const roh = new TypeError("Failed to fetch");
  for (const op of Object.values(ADDRESS_OPERATIONS)) {
    const text = addressExceptionMessage(op, roh);
    assert.doesNotMatch(text, /Failed to fetch|TypeError/);
    assert.match(text, /keine Verbindung/);
  }
  assert.match(addressFailureMessage(ADDRESS_OPERATIONS.LOAD, { status: 500 }), /nicht geladen/);
  assert.doesNotMatch(addressFailureMessage(ADDRESS_OPERATIONS.LOAD, { status: 500 }), /gespeichert/,
    "ein Ladefehler heißt nie „nicht gespeichert“");
  assert.match(addressFailureMessage(ADDRESS_OPERATIONS.DELETE, { status: 500 }), /nicht gelöscht/);
  assert.match(addressFailureMessage(ADDRESS_OPERATIONS.UPDATE, { status: 429 }), /Zu viele Änderungen/);
  // Ein Zeitlimit beim Schreiben sagt ehrlich, dass der Ausgang offen ist.
  const zeit = Object.assign(new Error("timeout"), { name: "ApiTimeoutError" });
  assert.match(addressExceptionMessage(ADDRESS_OPERATIONS.SAVE, zeit), /offen/);
  assert.doesNotMatch(addressExceptionMessage(ADDRESS_OPERATIONS.LOAD, zeit), /offen/);
  // Die Seite gibt nie e.message weiter.
  assert.doesNotMatch(seite, /e\?\.message/);
});

test("9 — Serverfehler mit Feldbezug stehen am Feld", () => {
  assert.deepEqual(addressServerFieldErrors({ code: "ADDRESS_INVALID", field: "label" }),
    { label: "Anzeigename wurde nicht angenommen — bitte Länge (höchstens 80 Zeichen) und Format prüfen." });
  assert.deepEqual(addressServerFieldErrors({ code: "INVALID_POSTAL_CODE_FORMAT" }), { postalCode: "PLZ passt nicht zum Landesformat." });
  assert.deepEqual(addressServerFieldErrors({ code: "ADDRESS_INVALID", field: "geheim" }), {}, "unbekannte Felder erfinden keinen Feldfehler");
  assert.match(seite, /fieldErrors: addressServerFieldErrors\(f\)/);
});

test("10 — jede Zeilenaktion trägt einen eigenen zugänglichen Namen", () => {
  assert.equal(addressActionTarget({ label: "Lager", company: "Firma" }), "Lager");
  assert.equal(addressActionTarget({ company: "Firma" }), "Firma");
  assert.equal(addressActionTarget({}), "Adresse");
});
