// Tests für den internen Zoll-Rechnungstyp (Proforma/Commercial) und die Gates.
//   node --test src/utils/customsInvoiceMode.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROFORMA, COMMERCIAL, isCommercialOnly, resolveInvoiceMode, canSelectProforma, commercialRequirementsMet,
  isCommercialInvoiceStatusResolved, customsInvoiceReady,
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

// ── customsInvoiceReady (kombinierte Buchbarkeit) ────────────────────────────
test("Proforma + absent → bereit", () => {
  assert.equal(customsInvoiceReady({ mode: PROFORMA, docStatus: "absent" }), true);
});
test("Proforma + present → NICHT bereit (Dokument darf nicht verborgen sein)", () => {
  assert.equal(customsInvoiceReady({ mode: PROFORMA, docStatus: "present" }), false);
});
test("Proforma + ungeklärter Status → NICHT bereit", () => {
  for (const s of ["idle", "checking", "uploading", "deleting", "error"])
    assert.equal(customsInvoiceReady({ mode: PROFORMA, docStatus: s }), false);
});
test("Commercial + present + Nummer + Datum → bereit", () => {
  assert.equal(customsInvoiceReady({ mode: COMMERCIAL, docStatus: "present", invoiceNumber: "RE-1", invoiceDateValid: true }), true);
});
test("Commercial + absent/ungeklärt → NICHT bereit", () => {
  for (const s of ["absent", "idle", "checking", "uploading", "deleting", "error"])
    assert.equal(customsInvoiceReady({ mode: COMMERCIAL, docStatus: s, invoiceNumber: "RE-1", invoiceDateValid: true }), false);
});
test("Commercial + present ohne Nummer/ohne Datum → NICHT bereit", () => {
  assert.equal(customsInvoiceReady({ mode: COMMERCIAL, docStatus: "present", invoiceNumber: "  ", invoiceDateValid: true }), false);
  assert.equal(customsInvoiceReady({ mode: COMMERCIAL, docStatus: "present", invoiceNumber: "RE-1", invoiceDateValid: false }), false);
});
