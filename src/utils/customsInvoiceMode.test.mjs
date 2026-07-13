// Tests für den internen Zoll-Rechnungstyp (Proforma/Commercial) und die Gates.
//   node --test src/utils/customsInvoiceMode.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROFORMA, COMMERCIAL, isCommercialOnly, resolveInvoiceMode, canSelectProforma, commercialRequirementsMet,
  isCommercialInvoiceStatusResolved, customsInvoiceFieldsValid, commercialInvoiceMutationBusy,
} from "./customsInvoiceMode.mjs";

const NON_COMMERCIAL = ["Gift", "Sample", "Return", "Personal", "Claim", "Temporary", "Relocation"];

// ── isCommercialOnly / Exportgrundregel ──────────────────────────────────────
test("Gewerblich (Commercial) ist commercial-only", () => {
  assert.equal(isCommercialOnly("Commercial"), true);
});
test("alle anderen Exportgründe erlauben beide Modi", () => {
  for (const r of NON_COMMERCIAL) assert.equal(isCommercialOnly(r), false);
  assert.equal(isCommercialOnly(""), false);
});

// ── resolveInvoiceMode (Init/Wechsel) ────────────────────────────────────────
test("Gewerblich erzwingt commercial (unabhängig vom bisherigen Modus)", () => {
  assert.equal(resolveInvoiceMode("Commercial", PROFORMA), COMMERCIAL);
  assert.equal(resolveInvoiceMode("Commercial", COMMERCIAL), COMMERCIAL);
  assert.equal(resolveInvoiceMode("Commercial", undefined), COMMERCIAL);
});
test("initialer nicht gewerblicher Modus ohne Auswahl → proforma", () => {
  assert.equal(resolveInvoiceMode("Gift", undefined), PROFORMA);
  assert.equal(resolveInvoiceMode("", null), PROFORMA);
});
test("Wechsel zwischen nicht gewerblichen Gründen erhält gültige Auswahl", () => {
  assert.equal(resolveInvoiceMode("Gift", PROFORMA), PROFORMA);
  assert.equal(resolveInvoiceMode("Sample", COMMERCIAL), COMMERCIAL);
});
test("Wechsel Gewerblich → anderer Grund darf commercial beibehalten", () => {
  // Nutzer war gewerblich (commercial), wechselt zu Gift → commercial bleibt gültig/erlaubt.
  assert.equal(resolveInvoiceMode("Gift", COMMERCIAL), COMMERCIAL);
});

// ── canSelectProforma (H-Regel) ──────────────────────────────────────────────
test("Proforma nicht wählbar bei gewerblichem Exportgrund", () => {
  assert.equal(canSelectProforma("Commercial", "absent"), false);
});
test("Proforma nicht wählbar, während ein Dokument vorhanden/in Arbeit ist", () => {
  for (const s of ["present", "uploading", "deleting"]) assert.equal(canSelectProforma("Gift", s), false);
});
test("Proforma wählbar bei nicht gewerblich und ohne aktives Dokument", () => {
  for (const s of ["idle", "checking", "absent", "error"]) assert.equal(canSelectProforma("Gift", s), true);
});

// ── commercialRequirementsMet (Zusatz-Gate) ──────────────────────────────────
test("Proforma stellt keine Zusatzpflicht", () => {
  assert.equal(commercialRequirementsMet({ mode: PROFORMA, invoiceNumber: "", invoiceDateValid: false, docStatus: "absent" }), true);
});
test("Commercial: alle drei Pflichten erfüllt → true", () => {
  assert.equal(commercialRequirementsMet({ mode: COMMERCIAL, invoiceNumber: "RE-1", invoiceDateValid: true, docStatus: "present" }), true);
});
test("Commercial ohne Nummer → false", () => {
  assert.equal(commercialRequirementsMet({ mode: COMMERCIAL, invoiceNumber: "   ", invoiceDateValid: true, docStatus: "present" }), false);
});
test("Commercial ohne gültiges Datum → false", () => {
  assert.equal(commercialRequirementsMet({ mode: COMMERCIAL, invoiceNumber: "RE-1", invoiceDateValid: false, docStatus: "present" }), false);
});
test("Commercial ohne bestätigtes Dokument → false", () => {
  for (const s of ["absent", "checking", "uploading", "deleting", "error", "idle"])
    assert.equal(commercialRequirementsMet({ mode: COMMERCIAL, invoiceNumber: "RE-1", invoiceDateValid: true, docStatus: s }), false);
});

// ── isCommercialInvoiceStatusResolved (zentrale Regel) ───────────────────────
test("absent/present gelten als geklärt", () => {
  assert.equal(isCommercialInvoiceStatusResolved("absent"), true);
  assert.equal(isCommercialInvoiceStatusResolved("present"), true);
});
test("idle/checking/uploading/deleting/error sind NICHT geklärt", () => {
  for (const s of ["idle", "checking", "uploading", "deleting", "error"])
    assert.equal(isCommercialInvoiceStatusResolved(s), false);
});

// ── customsInvoiceFieldsValid (fachliche Metadaten, dokument-UNABHÄNGIG) ──────
// Kern der „PDF-optional"-Regel: der Dokumentstatus ist NICHT mehr Teil der
// fachlichen Zollrechnungs-Gültigkeit. Nur Rechnungsart + Pflichtmetadaten zählen.
test("Proforma → fachlich gültig (keine Zusatzpflicht, PDF irrelevant)", () => {
  assert.equal(customsInvoiceFieldsValid({ mode: PROFORMA }), true);
  assert.equal(customsInvoiceFieldsValid({ mode: PROFORMA, invoiceNumber: "", invoiceDateValid: false }), true);
});
test("Commercial + Nummer + gültiges Datum → fachlich gültig (auch OHNE PDF)", () => {
  assert.equal(customsInvoiceFieldsValid({ mode: COMMERCIAL, invoiceNumber: "RE-1", invoiceDateValid: true }), true);
});
test("Commercial ohne Rechnungsnummer → NICHT gültig", () => {
  assert.equal(customsInvoiceFieldsValid({ mode: COMMERCIAL, invoiceNumber: "", invoiceDateValid: true }), false);
  assert.equal(customsInvoiceFieldsValid({ mode: COMMERCIAL, invoiceNumber: "   ", invoiceDateValid: true }), false);
});
test("Commercial ohne gültiges Rechnungsdatum → NICHT gültig", () => {
  assert.equal(customsInvoiceFieldsValid({ mode: COMMERCIAL, invoiceNumber: "RE-1", invoiceDateValid: false }), false);
});
test("Dokumentstatus hat KEINEN Einfluss auf die fachliche Gültigkeit", () => {
  // Die Funktion kennt den Dokumentstatus bewusst nicht → für jeden Status gleich.
  for (const _s of ["absent", "present", "error", "checking", "idle", "uploading", "deleting"]) {
    assert.equal(customsInvoiceFieldsValid({ mode: COMMERCIAL, invoiceNumber: "RE-1", invoiceDateValid: true }), true);
    assert.equal(customsInvoiceFieldsValid({ mode: COMMERCIAL, invoiceNumber: "", invoiceDateValid: true }), false);
  }
});

// ── commercialInvoiceMutationBusy (nur echte Upload-/Löschmutation) ───────────
test("Nur uploading/deleting gelten als laufende Dokument-Mutation", () => {
  assert.equal(commercialInvoiceMutationBusy("uploading"), true);
  assert.equal(commercialInvoiceMutationBusy("deleting"), true);
});
test("idle/checking/absent/present/error sind KEINE Mutation (blockieren nie)", () => {
  for (const s of ["idle", "checking", "absent", "present", "error"])
    assert.equal(commercialInvoiceMutationBusy(s), false);
});

// ── Kombinierte Buchbarkeit der Zollrechnungs-Dimension ──────────────────────
// Bildet die neue BookingPage-Regel nach: fachlich gültig UND keine laufende
// Mutation. (Warenpositionen/Exportgrund/HS-Code prüft BookingPage zusätzlich.)
const invoiceBookable = (mode, status, invoiceNumber = "RE-1", invoiceDateValid = true) =>
  customsInvoiceFieldsValid({ mode, invoiceNumber, invoiceDateValid }) && !commercialInvoiceMutationBusy(status);

test("Handelsrechnung, vollständige Metadaten, status=absent → buchbar (kein PDF nötig)", () => {
  assert.equal(invoiceBookable(COMMERCIAL, "absent"), true);
});
test("Handelsrechnung, vollständige Metadaten, status=present → buchbar", () => {
  assert.equal(invoiceBookable(COMMERCIAL, "present"), true);
});
test("Handelsrechnung, vollständige Metadaten, status=error → buchbar (nicht blockierend)", () => {
  assert.equal(invoiceBookable(COMMERCIAL, "error"), true);
});
test("Handelsrechnung, initialer status=checking/idle → buchbar (kein fachliches Blockieren)", () => {
  assert.equal(invoiceBookable(COMMERCIAL, "checking"), true);
  assert.equal(invoiceBookable(COMMERCIAL, "idle"), true);
});
test("Handelsrechnung, Rechnungsnummer fehlt → blockiert (unabhängig vom Status)", () => {
  for (const s of ["absent", "present", "error", "checking"])
    assert.equal(invoiceBookable(COMMERCIAL, s, "", true), false);
});
test("Handelsrechnung, Rechnungsdatum ungültig → blockiert", () => {
  assert.equal(invoiceBookable(COMMERCIAL, "absent", "RE-1", false), false);
});
test("Aktive Mutation (uploading/deleting) → kurzfristig gegen Race gesperrt", () => {
  assert.equal(invoiceBookable(COMMERCIAL, "uploading"), false);
  assert.equal(invoiceBookable(COMMERCIAL, "deleting"), false);
});
test("Proforma ohne PDF → jederzeit buchbar (kein Dokumentstatus blockiert)", () => {
  for (const s of ["absent", "checking", "idle", "error"])
    assert.equal(invoiceBookable(PROFORMA, s, "", false), true);
});
