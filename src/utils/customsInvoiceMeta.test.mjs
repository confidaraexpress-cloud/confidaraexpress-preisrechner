// Fokussierte Tests für buildCustomsInvoiceMeta (Payload-Regeln des Zollrechnungs-
// Metadaten-Slice). Reiner Unit-Test der ECHTEN Funktion (Import, kein Inline-Spiegel).
// Run: node --test src/utils/customsInvoiceMeta.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCustomsInvoiceMeta } from "./customsInvoiceMeta.mjs";

test("leer/undefined → keine Keys (kein leerer String, kein null, kein Array)", () => {
  assert.deepEqual(buildCustomsInvoiceMeta(), {});
  assert.deepEqual(buildCustomsInvoiceMeta({}), {});
  assert.deepEqual(buildCustomsInvoiceMeta({ invoiceNumber: "", invoiceDate: "", invoiceRemark: "" }), {});
  assert.deepEqual(buildCustomsInvoiceMeta({ invoiceNumber: "   ", invoiceDate: "  ", invoiceRemark: "\t\n" }), {});
});

test("invoiceNumber gefüllt → getrimmt als String", () => {
  const m = buildCustomsInvoiceMeta({ invoiceNumber: "  RE-2026-0042  " });
  assert.deepEqual(m, { invoiceNumber: "RE-2026-0042" });
});

test("invoiceDate gefüllt → getrimmt als String", () => {
  const m = buildCustomsInvoiceMeta({ invoiceDate: " 2026-07-09 " });
  assert.deepEqual(m, { invoiceDate: "2026-07-09" });
});

test("Rechnungshinweis → remarks als Array mit genau einem getrimmten Eintrag", () => {
  const m = buildCustomsInvoiceMeta({ invoiceRemark: "  Warensendung ohne Handelswert  " });
  assert.deepEqual(m, { remarks: ["Warensendung ohne Handelswert"] });
  assert.ok(Array.isArray(m.remarks));
  assert.equal(m.remarks.length, 1);
});

test("alle drei zusammen → additiv, nur vorhandene Keys", () => {
  const m = buildCustomsInvoiceMeta({ invoiceNumber: "INV-9", invoiceDate: "2026-01-15", invoiceRemark: "Hinweis" });
  assert.deepEqual(m, { invoiceNumber: "INV-9", invoiceDate: "2026-01-15", remarks: ["Hinweis"] });
});

test("nur teilweise gefüllt → nur die gefüllten Keys erscheinen", () => {
  assert.deepEqual(buildCustomsInvoiceMeta({ invoiceNumber: "A", invoiceDate: "", invoiceRemark: "  " }), { invoiceNumber: "A" });
  assert.deepEqual(buildCustomsInvoiceMeta({ invoiceRemark: "nur Hinweis" }), { remarks: ["nur Hinweis"] });
});

test("niemals ein invoiceMode/currency/document/upload-Key (Slice-Grenze)", () => {
  const m = buildCustomsInvoiceMeta({ invoiceNumber: "X", invoiceDate: "2026-07-09", invoiceRemark: "Y" });
  const keys = Object.keys(m);
  for (const forbidden of ["invoiceMode", "invoiceType", "currency", "document", "file", "upload"]) {
    assert.ok(!keys.includes(forbidden), `Key ${forbidden} darf nicht entstehen`);
  }
});

test("nicht-String-Eingaben werden ignoriert (kein Crash, keine Keys)", () => {
  assert.deepEqual(buildCustomsInvoiceMeta({ invoiceNumber: 42, invoiceDate: 20260709, invoiceRemark: {} }), {});
});
