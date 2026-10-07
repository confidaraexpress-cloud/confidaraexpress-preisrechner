// Abrechnungsdaten der Vertriebspartner — Status, Steuerstatus, IBAN-Prüfung und
// -Maske, Normalisierung (Partner nie mit vollständiger IBAN), PUT-Body,
// Fehlerabbildung und Verdrahtung der Kontofläche.
//
// Run: node --test src/utils/salesPartnerBilling.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  BILLING_FIELDS,
  BILLING_TEXTS,
  TAX_STATUS_OPTIONS,
  billingAddressLine,
  billingCountryOptions,
  billingFieldLabel,
  billingFormFrom,
  billingSaveMessage,
  billingStatusMeta,
  billingStatusText,
  buildBillingDetailsPayload,
  changedFieldsText,
  emptyBillingForm,
  formatIbanGroups,
  hasStoredIban,
  isValidIban,
  mapBillingDetailsSaveError,
  maskIbanForDisplay,
  normalizeBillingDetails,
  normalizeBillingResponse,
  normalizeIbanInput,
  partnerBillingRows,
  taxStatusLabel,
} from "./salesPartnerBilling.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const IBAN = "DE89370400440532013000";
const DETAILS = {
  billingName: "Vertrieb Süd GmbH", street: "Musterweg 1", postalCode: "10115", city: "Berlin", country: "DE",
  taxStatus: "with_vat", taxNumber: "12/345/67890", vatId: "DE123456789", accountHolder: "Vertrieb Süd GmbH",
  ibanMasked: "DE89 **** **** **** **30 00", bic: "COBADEFFXXX", submittedAt: "2026-10-05T08:00:00.000Z",
  reviewedAt: null, reviewNote: null,
};
const FORM = {
  billingName: " Vertrieb Süd GmbH ", street: "Musterweg 1", postalCode: "10115", city: "Berlin", country: "de",
  taxStatus: "with_vat", taxNumber: "12/345/67890", vatId: "de 123 456 789", accountHolder: "Vertrieb Süd GmbH",
  iban: "de89 3704 0044 0532 0130 00", bic: "cobadeffxxx",
};

/* ══════════ Status und Steuerstatus ═════════════════════════════════════ */

test("1 — Status: deutsche Labels und Erklärungen, Unbekanntes nie roh", () => {
  assert.deepEqual(billingStatusMeta("incomplete"), ["badge-yellow", "Unvollständig"]);
  assert.deepEqual(billingStatusMeta("submitted"), ["badge-blue", "In Prüfung"]);
  assert.deepEqual(billingStatusMeta("confirmed"), ["badge-green", "Bestätigt"]);
  assert.deepEqual(billingStatusMeta("rejected"), ["badge-red", "Abgelehnt"]);
  assert.equal(billingStatusText("incomplete"),
    "Bitte hinterlegen Sie Ihre Abrechnungsdaten. Sie werden vor der ersten Gutschrift geprüft.");
  for (const s of ["submitted", "confirmed", "rejected"]) assert.ok(billingStatusText(s), `${s} ohne Erklärung`);
  for (const roh of ["approved", "constructor", "__proto__", "toString"]) {
    assert.equal(billingStatusMeta(roh)[1], "Unbekannter Status");
    assert.equal(billingStatusText(roh), null, `${roh}: kein geratener Satz`);
  }
  assert.equal(billingStatusMeta(null)[1], "—");
  assert.equal(BILLING_TEXTS.futureOnly, "Änderungen gelten nur für künftige Gutschriften und werden vorher geprüft.");
});

test("2 — Steuerstatus: genau die beiden Vertragswerte mit ihren Labels", () => {
  assert.deepEqual(TAX_STATUS_OPTIONS.map((o) => [o.value, o.label]), [
    ["with_vat", "Mit Umsatzsteuerausweis"],
    ["without_vat", "Ohne Umsatzsteuerausweis (Sonderstatus)"],
  ]);
  assert.equal(taxStatusLabel("without_vat"), "Ohne Umsatzsteuerausweis (Sonderstatus)");
  assert.equal(taxStatusLabel("reverse_charge"), "Unbekannter Steuerstatus");
  assert.equal(taxStatusLabel(null), "—");
  assert.equal(billingFieldLabel("postalCode"), "PLZ");
  assert.equal(billingFieldLabel("hasOwnProperty"), "Weitere Angabe", "kein Schlüssel erscheint roh");
});

/* ══════════ IBAN ════════════════════════════════════════════════════════ */

test("3 — IBAN: Format und Prüfziffern (Modulo 97) als Vorabprüfung", () => {
  for (const gut of [IBAN, "DE89 3704 0044 0532 0130 00", "GB82WEST12345698765432", "AT611904300234573201",
                     "CH9300762011623852957", "de89370400440532013000"]) {
    assert.equal(isValidIban(gut), true, `${gut} abgelehnt`);
  }
  for (const schlecht of ["DE89370400440532013001", "DE00370400440532013000", "DE8937040044", "1234567890123456",
                          "DE89-3704-0044-0532-0130-00", "", null, 42]) {
    assert.equal(isValidIban(schlecht), false, `${JSON.stringify(schlecht)} durchgelassen`);
  }
  assert.equal(normalizeIbanInput(" de89 3704\t0044 "), "DE8937040044");
});

test("4 — IBAN-Anzeige: nur maskiert; eine ungemaskte IBAN wird hier maskiert", () => {
  assert.equal(maskIbanForDisplay("DE89 **** **** **** **30 00"), "DE89 **** **** **** **30 00");
  assert.equal(maskIbanForDisplay("DE89••••3000"), "DE89••••3000");
  // Schickt der Server (fehlerhaft) die vollständige IBAN, zeigt die Oberfläche sie trotzdem nicht.
  assert.equal(maskIbanForDisplay(IBAN), "DE89 •••• 3000");
  assert.equal(maskIbanForDisplay("DE89 3704 0044 0532 0130 00"), "DE89 •••• 3000");
  assert.ok(!maskIbanForDisplay(IBAN).includes("370400440532"));
  for (const leer of [null, "", "   ", "DE89", 7]) assert.equal(maskIbanForDisplay(leer), null);
  // Vollständig nur im Adminbereich, in Vierergruppen.
  assert.equal(formatIbanGroups(IBAN), "DE89 3704 0044 0532 0130 00");
  assert.equal(formatIbanGroups(""), null);
});

/* ══════════ Normalisierung ══════════════════════════════════════════════ */

test("5 — Partnerportal: eine vollständige IBAN gelangt nie in den Zustand", () => {
  const partner = normalizeBillingDetails({ ...DETAILS, iban: IBAN });
  assert.equal("iban" in partner, false, "das Feld iban wird im Partnerportal verworfen");
  assert.ok(!JSON.stringify(partner).includes(IBAN));
  assert.equal(partner.ibanMasked, "DE89 **** **** **** **30 00");
  const admin = normalizeBillingDetails({ ...DETAILS, iban: "de89 3704 0044 0532 0130 00" }, { admin: true });
  assert.equal(admin.iban, IBAN, "der Admin braucht sie für die Überweisung");

  const antwort = normalizeBillingResponse({ status: "submitted", billingDetails: DETAILS, accountEmail: "p@x.de",
    missingFields: ["iban"] });
  assert.equal(antwort.status, "submitted");
  assert.deepEqual(antwort.missingFields, [], "fehlende Felder liest nur der Adminbereich");
  assert.deepEqual(normalizeBillingResponse({ missingFields: ["iban", "iban", " street ", 3] }, { admin: true }).missingFields,
    ["iban", "street"]);
  const leer = normalizeBillingResponse({ status: "incomplete", billingDetails: null });
  assert.equal(leer.billingDetails, null);
  assert.equal(hasStoredIban(leer.billingDetails), false);
  assert.equal(hasStoredIban(partner), true);
  assert.equal(normalizeBillingResponse(null).status, null);
});

test("6 — Anzeige: Anschrift in einer Zeile, IBAN maskiert, Fehlendes benannt", () => {
  const d = normalizeBillingDetails(DETAILS);
  assert.equal(billingAddressLine(d), "Musterweg 1, 10115 Berlin, Deutschland");
  const zeilen = Object.fromEntries(partnerBillingRows(d).map((z) => [z.key, z]));
  assert.equal(zeilen.iban.v, "DE89 **** **** **** **30 00");
  assert.equal(zeilen.taxStatus.v, "Mit Umsatzsteuerausweis");
  assert.ok(zeilen.submittedAt, "Eingereicht am");
  assert.equal(zeilen.reviewedAt, undefined, "ohne Prüfung keine Zeile");
  const ohne = Object.fromEntries(partnerBillingRows(normalizeBillingDetails({ ...DETAILS, bic: null, vatId: "" }))
    .map((z) => [z.key, z]));
  assert.deepEqual([ohne.bic.v, ohne.bic.empty], ["Nicht angegeben", true]);
  assert.deepEqual([ohne.vatId.v, ohne.vatId.empty], ["Nicht angegeben", true]);
  assert.deepEqual(partnerBillingRows(null), []);
});

/* ══════════ Formular und Body ═══════════════════════════════════════════ */

test("7 — Startwerte: das IBAN-Feld bleibt immer leer; Unbekanntes wird nicht vorbelegt", () => {
  const f = billingFormFrom(normalizeBillingDetails({ ...DETAILS, iban: IBAN }, { admin: true }));
  assert.equal(f.iban, "", "die vollständige IBAN steht nie im Formular");
  assert.equal(f.billingName, "Vertrieb Süd GmbH");
  assert.equal(f.taxStatus, "with_vat");
  assert.equal(billingFormFrom(normalizeBillingDetails({ ...DETAILS, taxStatus: "reverse_charge" })).taxStatus, "");
  assert.deepEqual(billingFormFrom(null), emptyBillingForm());
  assert.equal(emptyBillingForm().country, "", "kein geratenes Land");
});

test("8 — PUT-Body: genau die Vertragsfelder, normalisiert", () => {
  const r = buildBillingDetailsPayload({ ...FORM, fremd: "x" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.body, {
    billingName: "Vertrieb Süd GmbH", street: "Musterweg 1", postalCode: "10115", city: "Berlin", country: "DE",
    taxStatus: "with_vat", accountHolder: "Vertrieb Süd GmbH", taxNumber: "12/345/67890", vatId: "DE123456789",
    iban: IBAN, bic: "COBADEFFXXX",
  });
  for (const k of Object.keys(r.body)) assert.ok(BILLING_FIELDS.includes(k), `${k} ist kein Vertragsfeld`);
  // Optionale Felder gehen nur mit Wert hinaus.
  const knapp = buildBillingDetailsPayload({ ...FORM, vatId: "", bic: " " });
  assert.equal(knapp.ok, true);
  assert.equal("vatId" in knapp.body, false);
  assert.equal("bic" in knapp.body, false);
});

test("9 — IBAN leer: nur mit hinterlegter IBAN erlaubt (Feld weggelassen = behalten)", () => {
  const ohne = buildBillingDetailsPayload({ ...FORM, iban: "" });
  assert.equal(ohne.ok, false);
  assert.equal(ohne.errors.iban, BILLING_TEXTS.ibanRequired, "bei Erstanlage ist die IBAN Pflicht");
  const behalten = buildBillingDetailsPayload({ ...FORM, iban: "  " }, { hasStoredIban: true });
  assert.equal(behalten.ok, true);
  assert.equal("iban" in behalten.body, false, "leer heißt: hinterlegte IBAN behalten");
  const falsch = buildBillingDetailsPayload({ ...FORM, iban: "DE89370400440532013001" }, { hasStoredIban: true });
  assert.equal(falsch.errors.iban, BILLING_TEXTS.ibanInvalid);
});

test("10 — Pflichtangaben, Steuernummer ODER USt-IdNr., Land und Steuerstatus aus der Liste", () => {
  const leer = buildBillingDetailsPayload(emptyBillingForm());
  assert.equal(leer.ok, false);
  for (const k of ["billingName", "street", "postalCode", "city", "accountHolder"]) {
    assert.equal(leer.errors[k], BILLING_TEXTS.required, `${k} ist Pflicht`);
  }
  assert.equal(leer.errors.country, BILLING_TEXTS.countryRequired);
  assert.equal(leer.errors.taxStatus, BILLING_TEXTS.taxStatusRequired);
  assert.equal(leer.errors.taxIds, BILLING_TEXTS.taxIdRequired);
  assert.equal(buildBillingDetailsPayload({ ...FORM, taxNumber: "", vatId: "" }).errors.taxIds, BILLING_TEXTS.taxIdRequired);
  assert.equal(buildBillingDetailsPayload({ ...FORM, taxNumber: "" }).ok, true, "die USt-IdNr. allein genügt");
  assert.equal(buildBillingDetailsPayload({ ...FORM, vatId: "" }).ok, true, "die Steuernummer allein genügt");
  assert.equal(buildBillingDetailsPayload({ ...FORM, country: "Deutschland" }).errors.country, BILLING_TEXTS.countryRequired);
  assert.equal(buildBillingDetailsPayload({ ...FORM, taxStatus: "reverse_charge" }).errors.taxStatus, BILLING_TEXTS.taxStatusRequired);
  assert.equal(buildBillingDetailsPayload({ ...FORM, bic: "COBADE" }).errors.bic, BILLING_TEXTS.bicInvalid);
});

/* ══════════ Fehler und Rückmeldung ══════════════════════════════════════ */

test("11 — 400 BILLING_DETAILS_INVALID landet am Feld; kein Rohwert bei Serverfehlern", () => {
  const feld = mapBillingDetailsSaveError(400, { error: "Die Postleitzahl ist ungültig.", code: "BILLING_DETAILS_INVALID", field: "postalCode" });
  assert.deepEqual(feld.fieldErrors, { postalCode: "Die Postleitzahl ist ungültig." });
  assert.equal(feld.generalError, BILLING_TEXTS.checkMarked);
  const unbekannt = mapBillingDetailsSaveError(400, { error: "Ungültig", code: "BILLING_DETAILS_INVALID", field: "constructor" });
  assert.deepEqual(unbekannt.fieldErrors, {});
  assert.equal(unbekannt.generalError, "Ungültig");
  assert.equal(mapBillingDetailsSaveError(429, {}).generalError, BILLING_TEXTS.rateLimited);
  const fuenf = mapBillingDetailsSaveError(500, { error: "TypeError: x is undefined" });
  assert.equal(fuenf.generalError, BILLING_TEXTS.saveFailed);
});

test("12 — Rückmeldung nach dem Speichern: unverändert oder eingereicht mit geänderten Feldern", () => {
  assert.equal(billingSaveMessage({ unchanged: true, changedFields: [] }), BILLING_TEXTS.unchanged);
  assert.equal(billingSaveMessage({ unchanged: false, changedFields: ["postalCode", "iban", "foo", "iban"] }),
    `${BILLING_TEXTS.submitted} Geändert: PLZ, IBAN.`);
  assert.equal(billingSaveMessage({ unchanged: false }), BILLING_TEXTS.submitted);
  assert.equal(changedFieldsText(["foo"]), null);
});

test("13 — Länderauswahl: ein unbekannter gespeicherter Code wird ergänzt, nie umgestellt", () => {
  const optionen = billingCountryOptions("XY");
  assert.deepEqual(optionen[0], { value: "XY", label: "XY" });
  assert.ok(billingCountryOptions("DE").some((o) => o.value === "DE" && o.label === "Deutschland"));
  assert.equal(billingCountryOptions("DE").some((o) => o.value === "XY"), false);
});

/* ══════════ Verdrahtung ═════════════════════════════════════════════════ */

test("14 — die Kontofläche spricht nur den Partnerendpunkt an; Steuer- und Bankdaten nirgends sonst", () => {
  const flaeche = ohneKommentare(read("components/partner/PartnerBillingDetailsSection.jsx"));
  assert.match(flaeche, /buildBillingDetailsPayload\(form, \{ hasStoredIban: hasStoredIban\(details\) \}\)/);
  assert.match(flaeche, /savePartnerBillingDetails\(gebaut\.body\)/);
  assert.match(flaeche, /mapBillingDetailsSaveError\(r\.status, d\)/);
  assert.doesNotMatch(flaeche, /apiFetch|\bfetch\(|\/kunde\/|dangerouslySetInnerHTML/);
  // Das IBAN-Feld zeigt nur, was der Nutzer tippt; der Hinweis nennt die Maske.
  assert.match(flaeche, /id="spp-billing-iban"[\s\S]{0,200}value=\{form\.iban\}/);
  assert.match(flaeche, /Hinterlegt: \$\{details\.ibanMasked/);
  assert.doesNotMatch(flaeche, /details\.iban\b/, "die vollständige IBAN wird nie gelesen");

  const api = ohneKommentare(read("api/partnerApi.js"));
  const put = api.slice(api.indexOf("export function savePartnerBillingDetails"));
  assert.match(put.slice(0, put.indexOf("\n}")), /apiFetch\("\/api\/sales-partner\/me\/billing-details", \{\s*method: "PUT",\s*auth: true,/);

  // Steuer- und Bankdaten stehen ausschließlich in der Abrechnungsfläche.
  const andere = readdirSync(path.join(SRC, "components/partner"))
    .filter((f) => f !== "PartnerBillingDetailsSection.jsx")
    .map((f) => `components/partner/${f}`)
    .concat(["pages/PartnerPortalPage.jsx", "components/layout/PartnerLayout.jsx"]);
  for (const datei of andere) {
    assert.doesNotMatch(ohneKommentare(read(datei)), /iban|taxNumber|vatId|accountHolder|getPartnerBillingDetails/i,
      `${datei}: Steuer- oder Bankdaten außerhalb der Abrechnungsfläche`);
  }
  // Im Konto steht die Fläche zwischen Kontodaten und Sicherheit.
  const konto = ohneKommentare(read("components/partner/PartnerAccountPanel.jsx"));
  assert.match(konto, /<PartnerBillingDetailsSection \/>[\s\S]*<PartnerAgreementSection \/>[\s\S]*title="Sicherheit"/);
});
