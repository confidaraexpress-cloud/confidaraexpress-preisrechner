// Tests für die Handelsrechnungs-Vorprüfung + Fehlercode-Mapping.
//   node --test src/utils/commercialInvoice.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCommercialInvoiceFile, commercialInvoiceErrorMessage, pickErrorCode, MAX_COMMERCIAL_INVOICE_BYTES,
} from "./commercialInvoice.mjs";

const pdf = (over = {}) => ({ name: "rechnung.pdf", type: "application/pdf", size: 1024, ...over });

// ── Client-Vorprüfung ────────────────────────────────────────────────────────
test("gültige PDF → ok", () => {
  assert.deepEqual(validateCommercialInvoiceFile(pdf()), { ok: true, code: null });
});
test("keine Datei → FILE_REQUIRED", () => {
  assert.equal(validateCommercialInvoiceFile(null).code, "FILE_REQUIRED");
});
test("falsche Endung → INVALID_EXTENSION", () => {
  assert.equal(validateCommercialInvoiceFile(pdf({ name: "rechnung.png" })).code, "INVALID_EXTENSION");
});
test("Endung case-insensitiv (.PDF) → ok", () => {
  assert.equal(validateCommercialInvoiceFile(pdf({ name: "R.PDF" })).ok, true);
});
test("falscher MIME (wenn geliefert) → INVALID_MIME_TYPE", () => {
  assert.equal(validateCommercialInvoiceFile(pdf({ type: "image/png" })).code, "INVALID_MIME_TYPE");
});
test("leerer MIME wird toleriert (manche Browser liefern keinen)", () => {
  assert.equal(validateCommercialInvoiceFile(pdf({ type: "" })).ok, true);
});
test("leere Datei → EMPTY_FILE", () => {
  assert.equal(validateCommercialInvoiceFile(pdf({ size: 0 })).code, "EMPTY_FILE");
});
test("über 10 MiB → FILE_TOO_LARGE", () => {
  assert.equal(validateCommercialInvoiceFile(pdf({ size: MAX_COMMERCIAL_INVOICE_BYTES + 1 })).code, "FILE_TOO_LARGE");
});
test("genau 10 MiB → ok (Grenze inklusiv)", () => {
  assert.equal(validateCommercialInvoiceFile(pdf({ size: MAX_COMMERCIAL_INVOICE_BYTES })).ok, true);
});

// ── Fehlercode-Mapping ───────────────────────────────────────────────────────
test("FILE_TOO_LARGE → 10-MB-Meldung", () => {
  assert.match(commercialInvoiceErrorMessage("FILE_TOO_LARGE"), /maximal 10 MB/);
});
test("COMMERCIAL_INVOICE_EXISTS → bereits hinterlegt", () => {
  assert.match(commercialInvoiceErrorMessage("COMMERCIAL_INVOICE_EXISTS"), /bereits eine Handelsrechnung/);
});
test("COMMERCIAL_INVOICE_LOCKED → wird verarbeitet", () => {
  assert.match(commercialInvoiceErrorMessage("COMMERCIAL_INVOICE_LOCKED"), /gerade verarbeitet/);
});
test("UPSTREAM_ERROR → Versandpartner nicht bestätigt", () => {
  assert.match(commercialInvoiceErrorMessage("UPSTREAM_ERROR"), /Versandpartner nicht bestätigt/);
});
test("unbekannter/leerer Code → neutrale Default-Meldung", () => {
  assert.match(commercialInvoiceErrorMessage(null), /nicht verarbeitet werden/);
  assert.match(commercialInvoiceErrorMessage("XYZ_UNBEKANNT"), /nicht verarbeitet werden/);
});
test("pickErrorCode liest nur { code:string }", () => {
  assert.equal(pickErrorCode({ code: "FILE_TOO_LARGE" }), "FILE_TOO_LARGE");
  assert.equal(pickErrorCode({}), null);
  assert.equal(pickErrorCode(null), null);
  assert.equal(pickErrorCode({ code: 5 }), null);
});
