// Tests für die Rechnungs-Anzeigelogik (Overdue-Ableitung, Status-Meta).
// Läuft über Node's eingebauten Test-Runner:
//   node --test src/utils/adminInvoices.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  invoiceStatusMeta,
  invoiceDisplayMeta,
  isInvoiceOverdue,
  INVOICE_STATUS_FILTER_OPTIONS,
} from "./adminInvoices.mjs";

// Fixer „heute": Mittwoch, 8. Juli 2026, 12:00 lokal.
const NOW = new Date("2026-07-08T12:00:00");
const YESTERDAY = "2026-07-07";
const TODAY = "2026-07-08";
const TOMORROW = "2026-07-09";

// ── isInvoiceOverdue ─────────────────────────────────────────────────────────
test("unpaid + Fälligkeit gestern → überfällig", () => {
  assert.equal(isInvoiceOverdue(YESTERDAY, "unpaid", NOW), true);
});

test("unpaid + Fälligkeit heute → NICHT überfällig (Tagesgrenze inklusiv)", () => {
  assert.equal(isInvoiceOverdue(TODAY, "unpaid", NOW), false);
});

test("unpaid + Fälligkeit morgen → nicht überfällig", () => {
  assert.equal(isInvoiceOverdue(TOMORROW, "unpaid", NOW), false);
});

test("paid ist nie überfällig, auch bei Fälligkeit in der Vergangenheit", () => {
  assert.equal(isInvoiceOverdue(YESTERDAY, "paid", NOW), false);
});

test("cancelled ist nie überfällig", () => {
  assert.equal(isInvoiceOverdue(YESTERDAY, "cancelled", NOW), false);
});

test("fehlendes/ungültiges due_date → nicht überfällig (kein Invalid Date)", () => {
  assert.equal(isInvoiceOverdue(null, "unpaid", NOW), false);
  assert.equal(isInvoiceOverdue("", "unpaid", NOW), false);
  assert.equal(isInvoiceOverdue("kein-datum", "unpaid", NOW), false);
});

test("Zeitanteil am selben Tag ändert nichts (Tages-Granularität)", () => {
  assert.equal(isInvoiceOverdue("2026-07-08T23:59:00", "unpaid", NOW), false);
});

// ── invoiceDisplayMeta ───────────────────────────────────────────────────────
test("Anzeige: paid → gruen 'Bezahlt'", () => {
  assert.deepEqual(invoiceDisplayMeta("paid", YESTERDAY, NOW), ["badge-green", "Bezahlt"]);
});

test("Anzeige: unpaid + ueberfaellig → rot 'Überfällig'", () => {
  assert.deepEqual(invoiceDisplayMeta("unpaid", YESTERDAY, NOW), ["badge-red", "Überfällig"]);
});

test("Anzeige: unpaid + nicht faellig → gelb 'Offen'", () => {
  assert.deepEqual(invoiceDisplayMeta("unpaid", TOMORROW, NOW), ["badge-yellow", "Offen"]);
});

test("Anzeige-Fallback: unbekannter Status → grau + Rohwert", () => {
  assert.deepEqual(invoiceDisplayMeta("weird", TOMORROW, NOW), ["badge-gray", "weird"]);
});

// ── invoiceStatusMeta / Filteroptionen ───────────────────────────────────────
test("invoiceStatusMeta Fallback fuer null → grau + Strich", () => {
  assert.deepEqual(invoiceStatusMeta(null), ["badge-gray", "—"]);
});

test("Status-Filteroptionen: Alle/Offen/Bezahlt (kein Überfällig als Status)", () => {
  assert.deepEqual(
    INVOICE_STATUS_FILTER_OPTIONS.map((o) => o.value),
    ["", "unpaid", "paid"],
  );
});
