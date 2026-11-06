// Phase 1 (Betreiberentscheidung 2026-11-06, Canonical v2.117): Rechnungsliste — Spalte „Datum" mit ausschließlich
// dem Ausstellungsdatum, Fälligkeit als zweite Zeile im Zahlungsstatus, Mobilkarte ohne Zusätze im Datumsfeld.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  invoiceDateDay, invoiceDueLine, INVOICE_DATE_COLUMN, INVOICE_DUE_PREFIX, paymentStatus,
} from "./customerInvoiceView.mjs";
import { isoDayDE } from "./formatters.js";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const listSrc = lies("../components/dashboard/InvoicesList.jsx");

const inv = (over = {}) => ({
  id: 1, invoice_number: "CE-RE26-00001", amount: "49.25", gross_amount: "49.25", currency: "EUR",
  status: "unpaid", due_date: "2026-11-13", issued_at: "2026-11-06T09:15:00.000Z", created_at: "2026-11-05T08:00:00.000Z",
  service_date: "2026-11-04", document_status: "ready", email_status: "sent", is_overdue: false, download_available: true,
  ...over,
});

// Alle Belegarten, die die Kundenliste tatsächlich zeigt.
const BELEGARTEN = {
  "Testdokument der Testphase": inv({ invoice_number: "CE-TEST-RE26-00038", invoice_test_phase: true, status: "unpaid" }),
  "Sandbox-Testrechnung": inv({ is_test_booking: true }),
  "reguläre Rechnung (offen)": inv(),
  "reguläre Rechnung (bezahlt)": inv({ status: "paid" }),
  "manuelle Rechnung": inv({ invoice_number: "CE-RE26-00042", source: "manual" }),
  "stornierte Rechnung": inv({ is_cancelled: true }),
  "Sammelrechnung": inv({ invoice_number: "CE-SR26-00003", billing_mode: "consolidated_7d", period_start: "2026-10-27", period_end: "2026-11-02" }),
};

test("1 — Spalte „Datum“: genau ein Datum, das Ausstellungsdatum (issued_at, sonst created_at), für jede Belegart", () => {
  assert.equal(INVOICE_DATE_COLUMN, "Datum");
  for (const [art, beleg] of Object.entries(BELEGARTEN)) {
    const tag = invoiceDateDay(beleg);
    assert.equal(tag, "2026-11-06", art);
    assert.match(isoDayDE(tag), /^\d{2}\.\d{2}\.\d{4}$/, `${art}: nur ein Datum im Format TT.MM.JJJJ`);
  }
  assert.equal(isoDayDE(invoiceDateDay(inv())), "06.11.2026");
  // Ohne issued_at gilt das bereits vorgesehene created_at.
  assert.equal(invoiceDateDay(inv({ issued_at: null })), "2026-11-05");
});

test("2 — der Kalendertag verschiebt sich in keiner Zeitzone des Browsers", () => {
  const original = process.env.TZ;
  try {
    for (const tz of ["UTC", "Europe/Berlin", "America/New_York", "Pacific/Auckland"]) {
      process.env.TZ = tz;
      // 23:30 UTC am 5.11. ist in Deutschland bereits der 6.11. — wie auf dem PDF.
      assert.equal(invoiceDateDay(inv({ issued_at: "2026-11-05T23:30:00.000Z" })), "2026-11-06", tz);
      assert.equal(invoiceDateDay(inv({ issued_at: "2026-11-06T09:15:00.000Z" })), "2026-11-06", tz);
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

test("3 — Fälligkeit nur bei offener oder überfälliger Forderung; nie bei bezahlt, storniert oder Testbeleg", () => {
  assert.deepEqual(invoiceDueLine(BELEGARTEN["reguläre Rechnung (offen)"]), { day: "2026-11-13", overdue: false });
  assert.deepEqual(invoiceDueLine(inv({ is_overdue: true, due_date: "2026-10-30" })), { day: "2026-10-30", overdue: true });
  assert.equal(paymentStatus(inv({ is_overdue: true }))[1], "Überfällig");
  for (const art of ["Testdokument der Testphase", "Sandbox-Testrechnung", "reguläre Rechnung (bezahlt)", "stornierte Rechnung"]) {
    assert.equal(invoiceDueLine(BELEGARTEN[art]), null, art);
  }
  assert.equal(invoiceDueLine(inv({ due_date: null })), null);
  assert.equal(INVOICE_DUE_PREFIX, "Fällig am");
});

test("4 — Liste: die Datumszelle trägt keinen Vorsatz, die Fälligkeit steht im Zahlungsstatus, die Karte ohne Leistung", () => {
  const datum = listSrc.slice(listSrc.indexOf("function DateCell"), listSrc.indexOf("function AmountBlock"));
  assert.match(datum, /return <span className="inv-date">\{isoDayDE\(invoiceDateDay\(inv\)\)\}<\/span>;/);
  const status = listSrc.slice(listSrc.indexOf("function PaymentStatusCell"), listSrc.indexOf("function DocumentInfo"));
  assert.match(status, /\{INVOICE_DUE_PREFIX\} \{isoDayDE\(faellig\.day\)\}/, "die Fälligkeit fehlt im Zahlungsstatus");
  const karte = listSrc.slice(listSrc.indexOf("function InvoiceCard"), listSrc.indexOf("export function InvoicesList"));
  assert.match(karte, /<dt>\{INVOICE_DATE_COLUMN\}<\/dt><dd>\{isoDayDE\(invoiceDateDay\(inv\)\)\}<\/dd>/);
  const code = listSrc.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const verboten of ["Rechnungsdatum", "Belegdatum", "<dt>Leistung</dt>", "PeriodBlock", "issuedLabel", "serviceDay"]) {
    assert.ok(!code.includes(verboten), `noch in der Rechnungsliste: ${verboten}`);
  }
  assert.match(listSrc, /<td><DateCell inv=\{inv\} \/><\/td>/);
});
