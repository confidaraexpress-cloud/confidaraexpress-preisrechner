// Individuelle Mehrpaketsendungen (Canonical v2.79, §15) — die Paketzeilen im Frontend.
//
// Abgesichert wird: eine Zeile bleibt bytegleich der bisherige flache Vertrag (Prüfung, Payload,
// Entwurf, Übergaben); unterschiedliche Pakete gehen als `packageLines` in Formularreihenfolge;
// Grenzen, Zeilenbezug der Fehler, Serverpfade, Entwurf Fassung 1/2, Sitzungszustand, Übergaben,
// öffentlicher Rechner, Anzeige (gleiches Format wie die Auftragsbestätigung des Backends).
// Run: node --test src/utils/packageLines.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  PACKAGE_FIELDS, PACKAGE_LINES_MAX, PACKAGE_COUNT_MAX, PACKAGE_LINES_KEY, EXTRA_PACKAGE_LINES_KEY,
  PACKAGE_LINES_LIMIT_TEXT, PACKAGE_TOTAL_LIMIT_TEXT, PACKAGE_LINE_ERROR_ORDER,
  emptyPackageLine, formPackageLines, formPatchFromPackageLines, hasExtraPackageLines, normalizeExtraPackageLines,
  addPackageLine, copyPackageLine, removePackageLine, updatePackageLine,
  packageLineFieldKey, packageLineFieldId, packageLinesFieldErrors, packageLinesTotalCount, packageLinesTotalExceeded,
  mapPackageLinesServerField, canonicalPackageLines, hasMixedPackageLines, packageLinesPayload,
  packageLinesSnapshot, packageLinesFromServer, formPatchFromServerPackageLines,
  packageLineText, packageLinesSummaryText, packageLinesTotalWeight, packageLinesKey, draftQuantity,
} from "./packageLines.mjs";
import {
  packageFieldError, packageErrors, packagePayload, packageSummaryLine, packageSummaryLineTexts,
  shipmentPackageErrors, shipmentPackagePayload, createEmptyShipmentForm,
} from "./newShipmentForm.mjs";
import { getShipmentFormSnapshot, formDraftSchemaVersion } from "./shipmentFormSnapshot.mjs";
import { buildResumeInitialState, formatFormPackage } from "./formDraftsView.mjs";
import { normalizeForm, formHasInput } from "./shippingFlowState.mjs";
import { calculatorSelectionToShipmentTransfer, publicQuoteToShipmentTransfer } from "./calculatorShipmentHandoff.mjs";
import { getCalculatorErrors, firstErrorField, CALCULATOR_FIELD_ORDER } from "./calculatorValidation.mjs";
import { buildPublicQuoteRequest, publicFormErrors, requestSummary, quoteOutcomeFromResponse, emptyPublicForm } from "./publicCalculatorView.mjs";
import { mapServerField, normalizeApiError } from "./apiError.mjs";
import { offerBlockedLabel, offerBlockedHint } from "./offerIdentity.mjs";
import { packageLabelHintText, PACKAGE_LABEL_HINT_TEXT } from "./packageLabelHint.mjs";
import { formatPackageSummary } from "./draftsView.mjs";
import { packageLabel } from "./adminShipmentView.mjs";
import { packageLineTextsOf, packageLinesWeightText } from "./adminShipmentDetailView.mjs";
import { voucherInvalidationKey, VOUCHER_PRICE_RELEVANT_KEYS } from "./voucherView.mjs";
import { missingFieldsHint } from "./newShipmentResume.mjs";

const EINS = { packageCount: "1", weight: "15", length: "20", width: "20", height: "20" };
const ZWEI = { key: "z2", packageCount: "2", weight: "8", length: "40", width: "30", height: "25" };
const gemischt = (extra = [ZWEI]) => ({ ...EINS, [EXTRA_PACKAGE_LINES_KEY]: extra });

/* ══════════ Grenzen und Modell ══════════════════════════════════════════════════════════ */

test("A1 — Grenzen wie der Server: 20 Zeilen, 99 Pakete, dieselben fünf Felder", () => {
  assert.equal(PACKAGE_LINES_MAX, 20);
  assert.equal(PACKAGE_COUNT_MAX, 99);
  assert.deepEqual([...PACKAGE_FIELDS], ["packageCount", "weight", "length", "width", "height"]);
  assert.equal(PACKAGE_LINES_LIMIT_TEXT, "Höchstens 20 Paketzeilen");
  assert.equal(PACKAGE_TOTAL_LIMIT_TEXT, "Höchstens 99 Pakete je Sendung.");
});

test("A2 — Zeile 1 sind die flachen Felder; ein Formular ohne weitere Zeilen hat genau eine", () => {
  const leer = createEmptyShipmentForm();
  assert.equal(hasExtraPackageLines(leer), false, "das leere Formular trägt keine weiteren Zeilen");
  assert.ok(!(EXTRA_PACKAGE_LINES_KEY in leer), "der Ausgangszustand bleibt unverändert");
  const zeilen = formPackageLines({ ...leer, ...EINS });
  assert.equal(zeilen.length, 1);
  for (const f of PACKAGE_FIELDS) assert.equal(zeilen[0][f], EINS[f]);
  const patch = formPatchFromPackageLines(zeilen);
  assert.deepEqual(patch[EXTRA_PACKAGE_LINES_KEY], []);
  for (const f of PACKAGE_FIELDS) assert.equal(patch[f], EINS[f]);
});

test("A3 — Bearbeiten: hinzufügen (Menge 1), kopieren (Menge 1, direkt darunter), entfernen, Grenzen", () => {
  let zeilen = formPackageLines(EINS);
  zeilen = addPackageLine(zeilen);
  assert.equal(zeilen.length, 2);
  assert.deepEqual(PACKAGE_FIELDS.map((f) => zeilen[1][f]), ["1", "", "", "", ""], "eine neue Zeile ist leer mit Menge 1");
  zeilen = updatePackageLine(zeilen, 1, "weight", "8");
  zeilen = updatePackageLine(zeilen, 1, "packageCount", "3");
  const kopie = copyPackageLine(zeilen, 0);
  assert.equal(kopie.length, 3);
  assert.deepEqual(PACKAGE_FIELDS.map((f) => kopie[1][f]), ["1", "15", "20", "20", "20"], "Kopie: gleiche Werte, Menge 1");
  assert.equal(kopie[2].weight, "8", "die Kopie steht direkt unter dem Original");
  assert.notEqual(kopie[1].key, kopie[0].key, "jede Zeile hat ihren eigenen Schlüssel");
  assert.deepEqual(removePackageLine(kopie, 0).map((z) => z.weight), ["15", "8"]);
  assert.equal(removePackageLine([emptyPackageLine()], 0).length, 1, "die letzte Zeile bleibt stehen");
  let voll = [emptyPackageLine()];
  for (let i = 0; i < 30; i += 1) voll = addPackageLine(voll);
  assert.equal(voll.length, PACKAGE_LINES_MAX, "nie mehr als 20 Zeilen");
  assert.equal(copyPackageLine(voll, 0).length, PACKAGE_LINES_MAX, "Kopieren respektiert die Grenze");
  assert.equal(formPatchFromPackageLines([...voll, emptyPackageLine()])[EXTRA_PACKAGE_LINES_KEY].length, 19);
});

test("A4 — IDs und Feldschlüssel: Zeile 1 unverändert (ns-weight), ab Zeile 2 nummeriert", () => {
  assert.equal(packageLineFieldId("ns-", 0, "packageCount"), "ns-packageCount");
  assert.equal(packageLineFieldId("ns-", 0, "height"), "ns-height");
  assert.equal(packageLineFieldId("ns-", 1, "weight"), "ns-weight-2");
  assert.equal(packageLineFieldId("calc-", 19, "length"), "calc-length-20");
  assert.equal(packageLineFieldKey(0, "weight"), "weight");
  assert.equal(packageLineFieldKey(1, "weight"), "packageLines.1.weight");
  assert.equal(PACKAGE_LINE_ERROR_ORDER[0], "packageCount");
  assert.equal(PACKAGE_LINE_ERROR_ORDER[5], "packageLines.1.packageCount");
  assert.equal(PACKAGE_LINE_ERROR_ORDER.at(-1), PACKAGE_LINES_KEY, "die Summe zuletzt");
  assert.equal(PACKAGE_LINE_ERROR_ORDER.length, PACKAGE_LINES_MAX * 5 + 1);
});

/* ══════════ Prüfung ═════════════════════════════════════════════════════════════════════ */

test("B1 — eine Zeile: exakt die bisherigen Fehler (Schlüssel und Texte)", () => {
  for (const form of [{}, EINS, { ...EINS, weight: "0" }, { ...EINS, packageCount: "100", length: "" }]) {
    assert.deepEqual(shipmentPackageErrors(form), packageErrors(form), JSON.stringify(form));
  }
});

test("B2 — ab zwei Zeilen: „Paket k: “ vor jedem Text, Zeilenschlüssel, Summengrenze", () => {
  const e = shipmentPackageErrors(gemischt([{ ...ZWEI, weight: "", length: "301" }]));
  assert.equal(e["packageLines.1.weight"], `Paket 2: ${packageFieldError("weight", "")}`);
  assert.equal(e["packageLines.1.length"], `Paket 2: ${packageFieldError("length", "301")}`);
  assert.equal(e.weight, undefined, "Zeile 1 ist gültig");
  const zuViele = shipmentPackageErrors(gemischt([{ ...ZWEI, packageCount: "99" }]));
  assert.equal(zuViele[PACKAGE_LINES_KEY], PACKAGE_TOTAL_LIMIT_TEXT, "1 + 99 > 99");
  assert.equal(packageLinesTotalExceeded(formPackageLines(gemischt([{ ...ZWEI, packageCount: "98" }]))), false, "1 + 98 = 99 ist erlaubt");
  const ersteZeile = shipmentPackageErrors({ ...gemischt(), weight: "" });
  assert.equal(ersteZeile.weight, `Paket 1: ${packageFieldError("weight", "")}`, "auch Zeile 1 nennt ab zwei Zeilen ihren Bezug");
});

test("B3 — Preisrechner: dieselbe Zeilenregel mit den Rechnertexten, Banner mit Zeilenbezug, Fokusreihenfolge", () => {
  const route = { from_country: "DE", from_zip: "10115", from_city: "Berlin", to_country: "DE", to_zip: "80331", to_city: "München" };
  const { fieldErrors, banner } = getCalculatorErrors({ ...route, ...gemischt([{ ...ZWEI, weight: "" }]) });
  assert.equal(fieldErrors["packageLines.1.weight"], "Paket 2: Bitte geben Sie das Gewicht des Pakets ein.");
  assert.equal(banner.message, "Paket 2: Bitte geben Sie das Gewicht des Pakets ein.");
  assert.deepEqual(getCalculatorErrors({ ...route, ...EINS }).fieldErrors, {}, "eine gültige Zeile bleibt fehlerfrei");
  assert.equal(firstErrorField({ "packageLines.1.weight": "x", height: "y" }), "height", "Zeile 1 vor Zeile 2");
  assert.ok(CALCULATOR_FIELD_ORDER.includes("packageLines.19.height") && CALCULATOR_FIELD_ORDER.at(-1) === PACKAGE_LINES_KEY);
});

test("B4 — der Hinweis am Knopf nennt weitere Zeilen und die Summe", () => {
  assert.equal(missingFieldsHint({ "packageLines.1.weight": "x" }), "Bitte prüfen Sie Paket 2 – Gewicht, um Angebote zu vergleichen.");
  assert.match(missingFieldsHint({ packageLines: "x" }), /Anzahl Pakete gesamt/);
});

/* ══════════ Payload ═════════════════════════════════════════════════════════════════════ */

test("C1 — eine Zeile: bytegleich der bisherige flache Payload", () => {
  for (const form of [EINS, { ...EINS, packageCount: "3", weight: "2.5" }, { ...EINS, packageCount: "99" }]) {
    assert.equal(JSON.stringify(shipmentPackagePayload(form)), JSON.stringify(packagePayload(form)));
  }
  assert.equal(shipmentPackagePayload({ ...EINS, height: "" }), null, "unvollständig: kein Payload");
});

test("C2 — gleiche Zeilen sind eine Paketart: flach mit der Summe der Mengen", () => {
  const p = shipmentPackagePayload(gemischt([{ ...EINS, key: "x", packageCount: "2" }]));
  assert.deepEqual(p, { packageCount: 3, weight: 15, length: 20, width: 20, height: 20 });
});

test("C3 — unterschiedliche Pakete: packageLines in Formularreihenfolge, ohne flache Felder", () => {
  const p = shipmentPackagePayload(gemischt([ZWEI, { ...EINS, key: "y", packageCount: "4" }]));
  assert.deepEqual(Object.keys(p), [PACKAGE_LINES_KEY]);
  assert.deepEqual(p.packageLines, [
    { quantity: 1, weight: 15, length: 20, width: 20, height: 20 },
    { quantity: 2, weight: 8, length: 40, width: 30, height: 25 },
    { quantity: 4, weight: 15, length: 20, width: 20, height: 20 },
  ], "nicht zusammengefasst — so zeigt ein Serverfehler packageLines[i] auf Zeile i");
  assert.equal(shipmentPackagePayload(gemischt([{ ...ZWEI, packageCount: "99" }])), null, "über 99 Pakete: kein Payload");
});

test("C4 — Kanonisierung: Zusammenfassen in Reihenfolge des ersten Auftretens, unvollständig ⇒ null", () => {
  const z = formPackageLines(gemischt([ZWEI, { ...EINS, key: "y", packageCount: "2" }]));
  assert.deepEqual(canonicalPackageLines(z).map((l) => l.quantity), [3, 2]);
  assert.equal(canonicalPackageLines(formPackageLines({ ...EINS, weight: "" })), null);
  assert.equal(hasMixedPackageLines(z), true);
  assert.equal(hasMixedPackageLines(formPackageLines(EINS)), false);
  assert.equal(packageLinesTotalCount(z), 5);
});

test("C5 — Serverpfade: packageLines[i].<feld> an Zeile i, quantity an der Anzahl, sonst null", () => {
  assert.equal(mapPackageLinesServerField("packageLines[0].weight"), "weight");
  assert.equal(mapPackageLinesServerField("packageLines[1].quantity"), "packageLines.1.packageCount");
  assert.equal(mapPackageLinesServerField("packageLines[2]"), "packageLines.2.packageCount");
  assert.equal(mapPackageLinesServerField("packageLines"), PACKAGE_LINES_KEY);
  assert.equal(mapPackageLinesServerField("packages.packageLines[3].height"), "packageLines.3.height", "Entwurfsroute");
  assert.equal(mapPackageLinesServerField("packageLines[25].weight"), PACKAGE_LINES_KEY, "außerhalb der Zeilen: die Summe");
  assert.equal(mapPackageLinesServerField("recipient.postalCode"), null);
  // Die zentrale Zuordnung fällt nicht mehr auf das flache `weight` der ersten Zeile zurück.
  assert.equal(mapServerField("packageLines[1].weight", { weight: "weight" }), "packageLines.1.weight");
  assert.equal(mapServerField("recipient.postalCode", { postalCode: "r_zip" }), "r_zip", "andere Pfade unverändert");
  const norm = normalizeApiError({ status: 400, body: { error: "x", code: "PACKAGE_QUANTITY_INVALID", field: "packageLines[1].quantity" }, fieldMap: {} });
  assert.equal(norm.field, "packageLines.1.packageCount");
  assert.equal(norm.fieldMessage, "Anzahl muss zwischen 1 und 99 liegen.", "kein technischer Servertext am Feld");
  const kombi = normalizeApiError({ status: 422, body: { error: "x", code: "PACKAGE_COMBINATION_UNAVAILABLE" }, fieldMap: {} });
  assert.match(kombi.message, /Weniger oder gleich große Pakete erweitern die Auswahl\./);
});

/* ══════════ Entwürfe und Sitzungszustand ════════════════════════════════════════════════ */

test("D1 — Formularentwurf: eine Paketart Fassung 1 (bytegleich), unterschiedliche Pakete Fassung 2", () => {
  const flach = getShipmentFormSnapshot({ form: EINS });
  assert.deepEqual(flach.packages, { packageCount: 1, weight: 15, length: 20, width: 20, height: 20 });
  assert.equal(formDraftSchemaVersion(flach), 1);
  const gleich = getShipmentFormSnapshot({ form: gemischt([{ ...EINS, key: "x", packageCount: "2" }]) });
  assert.deepEqual(gleich.packages, { packageCount: 3, weight: 15, length: 20, width: 20, height: 20 });
  assert.equal(formDraftSchemaVersion(gleich), 1);
  const zwei = getShipmentFormSnapshot({ form: gemischt() });
  assert.equal(formDraftSchemaVersion(zwei), 2);
  assert.deepEqual(zwei.packages, {
    packageCount: 3, weight: null, length: null, width: null, height: null,
    packageLines: [
      { quantity: 1, weight: 15, length: 20, width: 20, height: 20 },
      { quantity: 2, weight: 8, length: 40, width: 30, height: 25 },
    ],
  }, "genau die Form, die der Server speichert");
  const halb = packageLinesSnapshot(formPackageLines(gemischt([{ key: "n", packageCount: "", weight: "", length: "", width: "", height: "" }])));
  assert.deepEqual(halb[1], { quantity: 1, weight: null, length: null, width: null, height: null }, "ein halb ausgefülltes Formular wird gespeichert, wie es ist");
  assert.equal(draftQuantity("150"), 150, "Grenzen prüft der Server — dieselbe Lesart wie Zeile 1");
});

test("D2 — Fortsetzen: Fassung 2 bringt alle Zeilen zurück, Fassung 1 eine; Listen nennen die Summe", () => {
  const zwei = getShipmentFormSnapshot({ form: gemischt() });
  const { form } = buildResumeInitialState(zwei);
  assert.deepEqual(PACKAGE_FIELDS.map((f) => form[f]), ["1", "15", "20", "20", "20"]);
  assert.equal(form[EXTRA_PACKAGE_LINES_KEY].length, 1);
  assert.deepEqual(PACKAGE_FIELDS.map((f) => form[EXTRA_PACKAGE_LINES_KEY][0][f]), ["2", "8", "40", "30", "25"]);
  assert.ok(form[EXTRA_PACKAGE_LINES_KEY][0].key, "die Zeile bekommt einen stabilen Schlüssel");
  assert.equal(JSON.stringify(getShipmentFormSnapshot({ form }).packages), JSON.stringify(zwei.packages), "Rundweg ohne Verlust");
  const eins = buildResumeInitialState(getShipmentFormSnapshot({ form: EINS })).form;
  assert.ok(!(EXTRA_PACKAGE_LINES_KEY in eins), "Fassung 1 bleibt eine Zeile");
  assert.equal(buildResumeInitialState({ packages: { packageCount: 3, packageLines: "kaputt" } }).form[EXTRA_PACKAGE_LINES_KEY], undefined);
  assert.deepEqual(formatFormPackage({ summary: { packages: { packageCount: 3, weight: null, packageLineCount: 2, totalWeight: 31 } } }),
    { countLabel: "3 Pakete", weightLabel: "31 kg gesamt" });
  assert.deepEqual(formatPackageSummary({ packageCount: 3, packageLines: zwei.packages.packageLines }),
    { countLine: "3 Pakete · 31 kg gesamt", dimsLine: null });
});

test("D3 — Sitzungszustand: weitere Zeilen überstehen „Buchung → Zurück“, der Altstand bleibt eine Zeile", () => {
  const roh = { ...EINS, [EXTRA_PACKAGE_LINES_KEY]: [ZWEI, "kaputt", { packageCount: 3, weight: 2 }] };
  const n = normalizeForm(roh, "shipment");
  assert.equal(n[EXTRA_PACKAGE_LINES_KEY].length, 2, "nur Objekte");
  assert.deepEqual(PACKAGE_FIELDS.map((f) => n[EXTRA_PACKAGE_LINES_KEY][1][f]), ["3", "2", "", "", ""], "nur Text");
  assert.equal(n[EXTRA_PACKAGE_LINES_KEY][0].key, "z2", "der Schlüssel bleibt — keine neu gemountete Zeile");
  assert.ok(!(EXTRA_PACKAGE_LINES_KEY in normalizeForm(EINS, "shipment")), "ohne weitere Zeilen kein Schlüssel");
  assert.equal(normalizeExtraPackageLines(Array.from({ length: 40 }, () => ZWEI)).length, 19);
  assert.equal(normalizeForm(roh, "calculator")[EXTRA_PACKAGE_LINES_KEY].length, 2, "auch im Preisrechner");
  assert.equal(formHasInput({ packageCount: "1", [EXTRA_PACKAGE_LINES_KEY]: [ZWEI] }, "shipment"), true);
});

/* ══════════ Übergaben ═══════════════════════════════════════════════════════════════════ */

test("E1 — Preisrechner → „Neue Sendung“ übernimmt alle Zeilen; eine Zeile unverändert", () => {
  const rechner = { from_country: "DE", from_zip: "10115", to_country: "DE", to_zip: "80331", ...gemischt() };
  const patch = calculatorSelectionToShipmentTransfer({ calculator: { form: rechner }, tariff: {}, label: "X" });
  assert.deepEqual(PACKAGE_FIELDS.map((f) => patch.form[f]), ["1", "15", "20", "20", "20"]);
  assert.equal(patch.form[EXTRA_PACKAGE_LINES_KEY][0].weight, "8");
  const flach = calculatorSelectionToShipmentTransfer({ calculator: { form: { ...rechner, [EXTRA_PACKAGE_LINES_KEY]: [] } }, tariff: {}, label: "X" });
  assert.ok(!(EXTRA_PACKAGE_LINES_KEY in flach.form), "eine Zeile: die Übergabe ist die bisherige");
});

test("E2 — öffentlicher Rechner → Übernahme: packageLines (Zahlen) werden zu Formularzeilen", () => {
  const input = {
    from_country: "DE", from_zip: "10115", from_city: "Berlin", to_country: "DE", to_zip: "80331", to_city: "München",
    packageLines: [{ quantity: 1, weight: 15, length: 20, width: 20, height: 20 }, { quantity: 2, weight: 8, length: 40, width: 30, height: 25 }],
    serviceFilter: "all", shippingModeFilter: "all", shippingDate: "2026-10-26",
  };
  const patch = publicQuoteToShipmentTransfer({ input, selection: { productKey: "p" }, label: "X" });
  assert.equal(patch.form.packageCount, "1");
  assert.equal(patch.form.weight, "15");
  assert.deepEqual(PACKAGE_FIELDS.map((f) => patch.form[EXTRA_PACKAGE_LINES_KEY][0][f]), ["2", "8", "40", "30", "25"]);
  assert.equal(formPatchFromServerPackageLines([{ quantity: 0, weight: 1, length: 1, width: 1, height: 1 }, {}]), null, "unlesbar: nichts ersetzt");
  assert.equal(packageLinesFromServer([{ quantity: 1, weight: 1, length: 1, width: 1, height: 1 }]), null, "eine Zeile ist der flache Weg");
});

/* ══════════ Öffentlicher Rechner ════════════════════════════════════════════════════════ */

test("F1 — Anfrage: eine Zeile bytegleich, unterschiedliche Pakete als packageLines; Komma-Regel je Zeile", () => {
  const ort = { ...emptyPublicForm(), from_zip: "70173", from_city: "Stuttgart", to_zip: "10115", to_city: "Berlin" };
  const flach = buildPublicQuoteRequest({ ...ort, ...EINS, weight: "2,5" }, { shippingDate: "2026-10-26" });
  assert.deepEqual(Object.keys(flach), ["from_country", "from_zip", "from_city", "to_country", "to_zip", "to_city",
    "packageCount", "weight", "length", "width", "height", "serviceFilter", "shippingModeFilter", "shippingDate", "publicCarrierIds"]);
  assert.equal(flach.weight, 2.5);
  const zwei = buildPublicQuoteRequest({ ...ort, ...gemischt([{ ...ZWEI, weight: "8,5" }]) }, { shippingDate: "2026-10-26" });
  assert.deepEqual(zwei.packageLines[1], { quantity: 2, weight: 8.5, length: 40, width: 30, height: 25 });
  assert.equal(zwei.packageCount, undefined, "keine flachen Felder neben packageLines");
  assert.equal(requestSummary(zwei), "DE 70173 Stuttgart → DE 10115 Berlin · 3 Pakete · 32 kg gesamt");
  assert.deepEqual(publicFormErrors({ ...ort, ...gemischt([{ ...ZWEI, weight: "8,5" }]) }).fieldErrors, {}, "Dezimalkomma auch in Zeile 2");
  const fehler = quoteOutcomeFromResponse(400, { error: "x", field: "packageLines[1].weight" });
  assert.equal(fehler.field, "packageLines.1.weight", "Serverfehler an der Zeile");
});

/* ══════════ Anzeige ═════════════════════════════════════════════════════════════════════ */

test("G1 — Zeilentext und Summe im Format der Auftragsbestätigung", () => {
  assert.equal(packageLineText({ quantity: 1, weight: 15, length: 20, width: 20, height: 20 }), "1 × 15 kg · 20 × 20 × 20 cm");
  assert.equal(packageLineText(ZWEI), "2 × 8 kg · 40 × 30 × 25 cm");
  assert.equal(packageLineText({ quantity: 2, weight: 7.25, length: 30.5, width: 20, height: 10 }), "2 × 7,25 kg · 30,5 × 20 × 10 cm");
  assert.equal(packageLinesSummaryText(formPackageLines(gemischt())), "3 Pakete · 31 kg gesamt");
  assert.equal(packageLinesSummaryText([{ quantity: 1, weight: 0.1 }, { quantity: 1, weight: 0.2 }]), "2 Pakete · 0,3 kg gesamt", "auf Gramm gerundet");
  assert.equal(packageLinesSummaryText(formPackageLines(gemischt([{ ...ZWEI, weight: "" }]))), "3 Pakete", "ohne Gewicht keine Summe");
  assert.equal(packageLinesTotalWeight([]), null);
});

test("G2 — Buchungsübersicht: Summe und Zeilen; gleiche Pakete behalten den kanonischen Text", () => {
  assert.equal(packageSummaryLine(gemischt()), "3 Pakete · 31 kg gesamt");
  assert.deepEqual(packageSummaryLineTexts(gemischt()), ["1 × 15 kg · 20 × 20 × 20 cm", "2 × 8 kg · 40 × 30 × 25 cm"]);
  const gleich = gemischt([{ ...EINS, key: "x", packageCount: "1" }]);
  assert.equal(packageSummaryLine(gleich), "2 Pakete · je 15 kg · 20 × 20 × 20 cm");
  assert.equal(packageSummaryLineTexts(gleich), null);
  assert.equal(packageSummaryLine({ packageCount: "2", weight: "2", length: "30", width: "20", height: "15" }),
    "2 Pakete · je 2 kg · 30 × 20 × 15 cm", "eine Zeile unverändert");
});

test("G3 — Angebotsgründe, Klebehinweise, Listen und Admin ohne Anbieternamen", () => {
  assert.equal(offerBlockedLabel({ bookable: false, unavailableReason: "package_combination_unverified" }),
    "Für unterschiedliche Pakete derzeit nicht direkt buchbar.");
  // Der Knopf trägt nur den Grund, die Begründung steht im Detailbereich (gleich hohe Karten).
  assert.equal(offerBlockedLabel({ bookable: false, unavailableReason: "package_labels_indistinguishable" }),
    "Für diese Paketkombination nicht direkt buchbar.");
  assert.equal(offerBlockedHint({ bookable: false, unavailableReason: "package_labels_indistinguishable" }),
    "Die Versandlabels wären nicht eindeutig zuzuordnen.");
  assert.equal(offerBlockedHint({ bookable: false, unavailableReason: "package_combination_unverified" }), null,
    "kein erfundener Ausweg für unbelegte Kombinationen");
  assert.equal(packageLabelHintText("weight_and_dimensions"), PACKAGE_LABEL_HINT_TEXT.weight_and_dimensions);
  assert.match(packageLabelHintText("weight"), /„Piece 1\/2“.*„WAYBILL DOC“/);
  assert.equal(packageLabelHintText("unbekannt"), null);
  assert.equal(packageLabelHintText(undefined), null, "ohne Hinweis kein Satz");
  const zeilen = [{ quantity: 1, weight: 15, length: 20, width: 20, height: 20 }, { quantity: 2, weight: 8, length: 40, width: 30, height: 25 }];
  assert.equal(packageLabel({ package_count: 3, package_lines: zeilen }), "3 Pakete · 31 kg gesamt");
  assert.equal(packageLabel({ package_count: 2 }), "2 Pakete", "Admin-Liste unverändert ohne Zeilen");
  assert.deepEqual(packageLineTextsOf({ package_lines: zeilen }), ["1 × 15 kg · 20 × 20 × 20 cm", "2 × 8 kg · 40 × 30 × 25 cm"]);
  assert.equal(packageLinesWeightText({ package_lines: zeilen }), "31 kg gesamt");
  assert.equal(packageLineTextsOf({ package_count: 1 }), null);
});

test("G4 — Gutschein und Neuberechnung kennen die weiteren Zeilen", () => {
  assert.ok(VOUCHER_PRICE_RELEVANT_KEYS.includes("packageLines"));
  const a = voucherInvalidationKey({ packageLines: packageLinesKey(gemischt()) });
  const b = voucherInvalidationKey({ packageLines: packageLinesKey(gemischt([{ ...ZWEI, weight: "9" }])) });
  assert.notEqual(a, b, "eine geänderte Zeile lässt den Gutschein verfallen");
  assert.notEqual(packageLinesKey(gemischt()), packageLinesKey(EINS));
  assert.equal(packageLinesKey(gemischt()), packageLinesKey({ ...gemischt(), [EXTRA_PACKAGE_LINES_KEY]: [{ ...ZWEI, key: "anders" }] }),
    "der React-Schlüssel ist kein Wert");
});
