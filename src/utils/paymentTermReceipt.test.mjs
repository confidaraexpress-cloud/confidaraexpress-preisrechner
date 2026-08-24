// Phase 3 — Zahlungsziel „7 Tage rein netto nach RECHNUNGSERHALT" (Frontendseite).
//
// Was hier bewiesen wird:
//   • Es gibt EINEN Wortlaut für das ganze Portal (utils/paymentTerm.mjs) — vorher stand
//     derselbe Satz in fünf Dateien in fünf Fassungen.
//   • Jede sichtbare Stelle nennt den Bezugspunkt: Rechnungserhalt, nicht Rechnungsdatum.
//   • Das Frontend RECHNET kein Fälligkeitsdatum — es zeigt nur, was der Server liefert.
//   • Die AGB werden von diesem Paket ausdrücklich NICHT angefasst.
//
// Kein Netz, kein Storage, kein React. Run: node --test src/utils/paymentTermReceipt.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  PAYMENT_TERM_DAYS,
  PAYMENT_TERM_RECEIPT_REFERENCE,
  IMMEDIATE_PAYMENT_TERM_TEXT,
  resolvePaymentTermDays,
  paymentTermLabel,
  paymentTermSentence,
} from "./paymentTerm.mjs";
import { paymentTermValue } from "./profileView.mjs";
import { PAYMENT_TERM_TEXT } from "./adminCustomerView.mjs";
import { BILLING_MODE_TEXT } from "./billingModeView.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(SRC, p), "utf8");
// Kommentare entfernen: eine Erklärung darf eine Zusicherung weder erfüllen noch auslösen.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── A. Der Wortlaut ─────────────────────────────────────────────────────────

test("(A1) der Bezugspunkt ist der Rechnungserhalt", () => {
  assert.equal(PAYMENT_TERM_RECEIPT_REFERENCE, "nach Rechnungserhalt");
  assert.equal(paymentTermSentence(7), "Zahlbar innerhalb von 7 Tagen rein netto nach Rechnungserhalt");
  assert.equal(paymentTermLabel(7), "7 Tage nach Rechnungserhalt");
});

test("(A2) nirgends bleibt ein „nach Rechnungsdatum“ stehen", () => {
  for (const tage of [1, 7, 14, 30]) {
    assert.ok(!/Rechnungsdatum/.test(paymentTermSentence(tage)), `Satz bei ${tage}`);
    assert.ok(!/Rechnungsdatum/.test(paymentTermLabel(tage)), `Kurzform bei ${tage}`);
  }
});

test("(A3) Singular und Plural stimmen", () => {
  assert.equal(paymentTermSentence(1), "Zahlbar innerhalb von 1 Tag rein netto nach Rechnungserhalt");
  assert.equal(paymentTermLabel(1), "1 Tag nach Rechnungserhalt");
});

test("(A4) 0 heißt „Sofort fällig“, nicht „0 Tage nach Rechnungserhalt“", () => {
  // Sammelrechnungen tragen Zahlungsziel 0. Ein Fristbeginn ohne Frist wäre dort sinnlos.
  assert.equal(paymentTermSentence(0), IMMEDIATE_PAYMENT_TERM_TEXT);
  assert.equal(paymentTermLabel(0), IMMEDIATE_PAYMENT_TERM_TEXT);
  assert.ok(!/Rechnungserhalt/.test(paymentTermLabel(0)));
});

test("(A5) fehlend/kaputt fällt auf die Regel zurück, nie auf 0", () => {
  // „0" und „fehlt" sind zwei verschiedene Aussagen. Eine Altrechnung ohne gespeichertes
  // Zahlungsziel darf nie als sofort fällig erscheinen.
  for (const wert of [null, undefined, "", "   ", "unsinn", NaN, true, false, -1, 2.5, {}, []]) {
    assert.equal(resolvePaymentTermDays(wert), PAYMENT_TERM_DAYS, `Wert ${JSON.stringify(wert)}`);
  }
  assert.equal(resolvePaymentTermDays(0), 0);
  assert.equal(resolvePaymentTermDays("0"), 0);
  assert.equal(resolvePaymentTermDays(14), 14);
});

// ── B. Eine Quelle, keine zweite Fassung ────────────────────────────────────

test("(B1) alle sichtbaren Stellen nennen denselben Bezugspunkt", () => {
  assert.equal(paymentTermValue({ payment_term: 7 }), "7 Tage nach Rechnungserhalt");
  assert.equal(PAYMENT_TERM_TEXT, "7 Tage nach Rechnungserhalt");
  assert.ok(/nach Rechnungserhalt/.test(BILLING_MODE_TEXT.options.single.hint));
  assert.ok(/Rechnungserhalt/.test(BILLING_MODE_TEXT.options.consolidated_7d.hint));
});

test("(B2) keine Datei formuliert das Zahlungsziel noch selbst", () => {
  // Der Satz und die Kurzform entstehen ausschließlich in paymentTerm.mjs. Ein Literal
  // anderswo wäre genau die Drift, die dieses Paket beseitigt hat.
  const dateien = [
    "utils/profileView.mjs",
    "utils/adminCustomerView.mjs",
    "utils/billingModeView.mjs",
    "pages/admin/AdminInvoiceDetailPage.jsx",
    "components/booking/PriceSummaryModule.jsx",
  ];
  for (const f of dateien) {
    const code = strip(read(f));
    assert.ok(!/Zahlbar innerhalb von \d/.test(code), `${f}: eigener Zahlungszielsatz`);
    assert.ok(!/\d+ Kalendertage/.test(code), `${f}: eigene Zahlungsziel-Kurzform`);
    assert.ok(/paymentTerm\.mjs/.test(code), `${f}: nutzt die zentrale Quelle nicht`);
  }
});

test("(B3) das Modul rechnet KEIN Fälligkeitsdatum", () => {
  // Das Fälligkeitsdatum ist eine Serverangabe (invoices.due_date). Würde das Frontend es
  // selbst ableiten, könnte es dem Beleg widersprechen — es kennt den Bereitstellungs-
  // zeitpunkt nicht.
  const code = strip(read("utils/paymentTerm.mjs"));
  assert.ok(!/new Date\(/.test(code), "das Modul erzeugt ein Datum");
  assert.ok(!/setDate\(|getTime\(|addDays/.test(code), "das Modul rechnet mit Daten");
  assert.ok(!/dueDate|due_date/.test(code), "das Modul kennt ein Fälligkeitsdatum");
});

// ── C. Was NICHT angefasst wurde ────────────────────────────────────────────

test("(C1) die AGB-Zahlungsklausel deckt sich mit der Geschäftsregel", () => {
  // In Phase 3 stand hier das Gegenteil: die Klausel MUSSTE unverändert bleiben, weil ein
  // Rechtstext nicht nebenbei umgeschrieben wird. Phase 4 hat die Angleichung ausdrücklich
  // beauftragt — geändert wurde ausschließlich der Zahlungsparameter (28 → 7 Tage,
  // Rechnungsdatum → Rechnungserhalt), keine andere Klausel.
  const agb = read("pages/AGBPage.jsx").replace(/\s+/g, " ");
  assert.ok(/7 Tagen<\/strong> rein netto nach Rechnungserhalt/.test(agb),
    "die AGB-Klausel nennt nicht die geltende Zahlungsregel");
  assert.ok(!/28 Tagen/.test(agb), "die alte 28-Tage-Regel steht noch in den AGB");
  assert.ok(!/nach Rechnungsdatum ohne Abzug/.test(agb), "der alte Fristbeginn steht noch in den AGB");
  // Ein Rechtstext ist versionierter STATISCHER Text, kein UI-Formatter: er darf sich nie aus
  // der Anzeigequelle speisen, sonst änderte eine UI-Anpassung stillschweigend die AGB.
  assert.ok(!/paymentTerm\.mjs/.test(agb), "die AGB dürfen nicht aus der UI-Quelle gespeist werden");
});

test("(C2) die Zahlungsziel-DAUER ist unverändert 7 Tage", () => {
  // Geändert hat sich der Bezugspunkt, nicht die Frist. Und die Zahlungsart bleibt Rechnung.
  assert.equal(PAYMENT_TERM_DAYS, 7);
  assert.ok(/Zahlung auf Rechnung/.test(read("components/booking/PriceSummaryModule.jsx")));
});
