// Tests für das zentrale Kunden-Rechnungs-View-Model (Phase 5). Läuft über
// `node --test`. Deckt ab: Zahlungsstatus-Priorität (inkl. fail-closed bei
// fehlenden Serverfeldern — NIE allein aus status === "unpaid" schließen),
// Dokumentmodus-Unterscheidung test/preview/unknown, Dokument-/E-Mail-Status,
// Zeitraum-Zelle (Leistungsdatum nur bei Abweichung, Fälligkeit nur bei
// produktiver offener/überfälliger Forderung), Filter, Zusammenfassungs-
// Zustände (serverseitige summary hat Vorrang) und einen Selbsttest.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TONE,
  isProductiveInvoice, isPayableInvoice, isOverdueInvoice,
  paymentStatus, documentModeMeta, documentModeHint,
  documentStatusMeta, emailStatusMeta,
  invoicePeriod, amountLabel, unavailableActionReason,
  INVOICE_FILTERS, matchesInvoiceFilter,
  FILTER_EMPTY_TEXT, LIST_EMPTY_TITLE, LIST_EMPTY_TEXT, LOADING_TEXT, LOAD_ERROR_TEXT,
  customerInvoiceSummary,
} from "./customerInvoiceView.mjs";

const inv = (over = {}) => ({
  id: 1, invoice_number: "CE-RE26-00001", amount: "49.25", gross_amount: "49.25", currency: "EUR",
  status: "unpaid", due_date: "2099-01-01", issued_at: "2026-07-19", created_at: "2026-07-19",
  service_date: null, document_status: "ready", email_status: "sent",
  is_test_document: false, document_mode_label: "production",
  is_productive: true, is_overdue: false, is_payable: true,
  download_available: true,
  ...over,
});

// ── Produktivität — fail-closed ─────────────────────────────────────────────
test("1 — isProductiveInvoice/isPayableInvoice/isOverdueInvoice: strikt true, sonst false", () => {
  assert.equal(isProductiveInvoice(inv({ is_productive: true })), true);
  assert.equal(isProductiveInvoice(inv({ is_productive: false })), false);
  assert.equal(isProductiveInvoice(inv({ is_productive: undefined })), false, "fehlendes Feld ⇒ NICHT produktiv");
  assert.equal(isProductiveInvoice(inv({ is_productive: null })), false);
  assert.equal(isProductiveInvoice(inv({ is_productive: "true" })), false, "kein String-Coercion");
  assert.equal(isProductiveInvoice(null), false);
  assert.equal(isPayableInvoice(inv({ is_payable: undefined })), false);
  assert.equal(isOverdueInvoice(inv({ is_overdue: undefined })), false);
});

// ── Zahlungsstatus-Priorität ─────────────────────────────────────────────────
test("2 — paymentStatus: nicht produktiv schlägt ALLES (auch status='paid')", () => {
  assert.deepEqual(paymentStatus(inv({ is_productive: false, status: "paid" })), [TONE.NEUTRAL, "Nicht zahlungswirksam"]);
  assert.deepEqual(paymentStatus(inv({ is_productive: false, status: "unpaid", is_overdue: true })), [TONE.NEUTRAL, "Nicht zahlungswirksam"]);
});
test("3 — paymentStatus: produktiv + paid → Bezahlt", () => {
  assert.deepEqual(paymentStatus(inv({ is_productive: true, status: "paid" })), [TONE.POSITIVE, "Bezahlt"]);
});
test("4 — paymentStatus: produktiv + unpaid + overdue → Überfällig", () => {
  assert.deepEqual(paymentStatus(inv({ is_productive: true, status: "unpaid", is_overdue: true })), [TONE.CRITICAL, "Überfällig"]);
});
test("5 — paymentStatus: produktiv + unpaid, nicht überfällig → Offen", () => {
  assert.deepEqual(paymentStatus(inv({ is_productive: true, status: "unpaid", is_overdue: false })), [TONE.ATTENTION, "Offen"]);
});
test("6 — paymentStatus: fehlendes is_productive ⇒ fail-closed, NIE 'Offen' aus status allein", () => {
  const withoutField = inv({ status: "unpaid" });
  delete withoutField.is_productive;
  assert.deepEqual(paymentStatus(withoutField), [TONE.NEUTRAL, "Nicht zahlungswirksam"],
    "ein fehlendes Serverfeld darf NIEMALS zu 'Offen' führen — genau das war der ursprüngliche Fehler");
});

// ── Dokumentmodus ────────────────────────────────────────────────────────────
test("7 — documentModeMeta: production zeigt KEIN Badge (null)", () => {
  assert.equal(documentModeMeta(inv({ document_mode_label: "production" })), null);
});
test("8 — documentModeMeta: test und preview sind UNTERSCHEIDBAR (verschiedene Labels)", () => {
  const t = documentModeMeta(inv({ document_mode_label: "test" }));
  const p = documentModeMeta(inv({ document_mode_label: "preview" }));
  assert.deepEqual(t, [TONE.NEUTRAL, "Testdokument"]);
  assert.deepEqual(p, [TONE.NEUTRAL, "Interne Vorschau"]);
  assert.notDeepEqual(t, p, "test und preview dürfen nicht mehr dasselbe Badge zeigen");
});
test("9 — documentModeMeta: unknown/fehlendes Label ⇒ konservativ nicht zahlungswirksam", () => {
  assert.deepEqual(documentModeMeta(inv({ document_mode_label: "unknown" })), [TONE.NEUTRAL, "Nicht zahlungswirksam"]);
  assert.deepEqual(documentModeMeta(inv({ document_mode_label: undefined })), [TONE.NEUTRAL, "Nicht zahlungswirksam"]);
});
test("10 — documentModeHint: nur außerhalb production, kein Fließtext-Zwang", () => {
  assert.equal(documentModeHint(inv({ document_mode_label: "production" })), null);
  assert.equal(typeof documentModeHint(inv({ document_mode_label: "preview" })), "string");
  assert.ok(documentModeHint(inv({ document_mode_label: "preview" })).length < 200, "Hinweis bleibt kompakt");
});

// ── Dokument-/E-Mail-Status ──────────────────────────────────────────────────
test("11 — documentStatusMeta: kompakte Labels ohne Fließtext", () => {
  assert.deepEqual(documentStatusMeta(inv({ document_status: "ready" })), [TONE.POSITIVE, "PDF bereit"]);
  assert.deepEqual(documentStatusMeta(inv({ document_status: "generating" })), [TONE.NEUTRAL, "PDF wird erstellt"]);
  assert.deepEqual(documentStatusMeta(inv({ document_status: "pending_document" })), [TONE.NEUTRAL, "PDF wird erstellt"]);
  assert.deepEqual(documentStatusMeta(inv({ document_status: "document_failed" })), [TONE.CRITICAL, "PDF-Erstellung fehlgeschlagen"]);
});
test("12 — emailStatusMeta: nicht produktiv ⇒ 'Kein Kundenversand', unabhängig vom Rohstatus", () => {
  assert.deepEqual(emailStatusMeta(inv({ is_productive: false, email_status: "pending" })), [TONE.NEUTRAL, "Kein Kundenversand"]);
  assert.deepEqual(emailStatusMeta(inv({ is_productive: false, email_status: "sent" })), [TONE.NEUTRAL, "Kein Kundenversand"],
    "Testdokumente werden NIE versendet — auch ein (fehlerhafter) 'sent'-Rohstatus darf das nicht zeigen");
});
test("13 — emailStatusMeta: produktiv ⇒ echter Rohstatus", () => {
  assert.deepEqual(emailStatusMeta(inv({ is_productive: true, email_status: "sent" })), [TONE.POSITIVE, "Versendet"]);
  assert.deepEqual(emailStatusMeta(inv({ is_productive: true, email_status: "failed" })), [TONE.CRITICAL, "Versand fehlgeschlagen"]);
  assert.deepEqual(emailStatusMeta(inv({ is_productive: true, email_status: "pending" })), [TONE.ATTENTION, "Versand ausstehend"]);
});

// ── Zeitraum-Zelle ────────────────────────────────────────────────────────────
test("14 — invoicePeriod: Leistungsdatum nur, wenn vorhanden UND abweichend", () => {
  assert.equal(invoicePeriod(inv({ issued_at: "2026-07-19", service_date: "2026-07-19" })).serviceAt, null, "gleicher Tag ⇒ weggelassen");
  assert.equal(invoicePeriod(inv({ issued_at: "2026-07-19", service_date: "2026-07-20" })).serviceAt, "2026-07-20");
  assert.equal(invoicePeriod(inv({ issued_at: "2026-07-19", service_date: null })).serviceAt, null);
});
test("15 — invoicePeriod: Fälligkeit NUR bei produktiver, unbezahlter Forderung", () => {
  assert.equal(invoicePeriod(inv({ is_productive: true, status: "unpaid", due_date: "2099-01-01" })).dueAt, "2099-01-01");
  assert.equal(invoicePeriod(inv({ is_productive: true, status: "paid", due_date: "2099-01-01" })).dueAt, null, "bezahlt ⇒ keine Fälligkeit mehr relevant");
  assert.equal(invoicePeriod(inv({ is_productive: false, status: "unpaid", due_date: "2099-01-01" })).dueAt, null, "nicht produktiv ⇒ keine Fälligkeit");
});
test("16 — invoicePeriod: overdue-Flag nur zusammen mit sichtbarer Fälligkeit", () => {
  assert.equal(invoicePeriod(inv({ is_productive: true, status: "unpaid", is_overdue: true })).overdue, true);
  assert.equal(invoicePeriod(inv({ is_productive: true, status: "paid", is_overdue: true })).overdue, false, "bezahlt kann fachlich nicht überfällig sein");
});
test("17 — invoicePeriod: nonPayableNote spiegelt Produktivität", () => {
  assert.equal(invoicePeriod(inv({ is_productive: false })).nonPayableNote, true);
  assert.equal(invoicePeriod(inv({ is_productive: true })).nonPayableNote, false);
});

// ── Betrag-Label ──────────────────────────────────────────────────────────────
test("18 — amountLabel: 'Betrag' produktiv, 'Dokumentbetrag' sonst — keine Zahlungsaufforderung suggerieren", () => {
  assert.equal(amountLabel(inv({ is_productive: true })), "Betrag");
  assert.equal(amountLabel(inv({ is_productive: false })), "Dokumentbetrag");
});

// ── Nicht verfügbare Aktion ───────────────────────────────────────────────────
test("19 — unavailableActionReason: verfügbar ⇒ leer; sonst verständliche, EHRLICHE Begründung", () => {
  assert.equal(unavailableActionReason(inv({ download_available: true })), "");
  assert.equal(unavailableActionReason(inv({ download_available: false, is_productive: false })), "Nicht für den Kundenversand vorgesehen");
  assert.equal(unavailableActionReason(inv({ download_available: false, is_productive: true, document_status: "generating" })), "Rechnung wird erstellt");
  assert.equal(unavailableActionReason(inv({ download_available: false, is_productive: true, document_status: "document_failed" })), "Rechnung konnte noch nicht erstellt werden");
  // Produktiv + bereit, aber dennoch gesperrt (z. B. globale Testbetriebssperre) ⇒ ehrlich generisch,
  // KEINE erratene Ursache.
  assert.equal(unavailableActionReason(inv({ download_available: false, is_productive: true, document_status: "ready" })), "Derzeit nicht verfügbar");
});

// ── Filter ────────────────────────────────────────────────────────────────────
test("20 — INVOICE_FILTERS: fünf Filter in definierter Reihenfolge", () => {
  assert.deepEqual(INVOICE_FILTERS.map((f) => f.value), ["", "open", "overdue", "paid", "preview"]);
});
test("21 — matchesInvoiceFilter: 'Alle' zeigt alles, auch nicht produktive", () => {
  assert.equal(matchesInvoiceFilter(inv({ is_productive: false }), ""), true);
});
test("22 — matchesInvoiceFilter: 'preview' zeigt AUSSCHLIESSLICH nicht produktive", () => {
  assert.equal(matchesInvoiceFilter(inv({ is_productive: false }), "preview"), true);
  assert.equal(matchesInvoiceFilter(inv({ is_productive: true }), "preview"), false);
});
test("23 — matchesInvoiceFilter: 'open'/'overdue'/'paid' schließen nicht produktive IMMER aus", () => {
  for (const f of ["open", "overdue", "paid"]) {
    assert.equal(matchesInvoiceFilter(inv({ is_productive: false, status: "unpaid", is_overdue: true }), f), false, `Filter ${f} darf keine Test-/Preview-Rechnung zeigen`);
  }
});
test("24 — matchesInvoiceFilter: 'open' schließt überfällige produktive Rechnungen ein (Teilmenge)", () => {
  assert.equal(matchesInvoiceFilter(inv({ is_productive: true, status: "unpaid", is_overdue: true }), "open"), true);
  assert.equal(matchesInvoiceFilter(inv({ is_productive: true, status: "unpaid", is_overdue: true }), "overdue"), true);
  assert.equal(matchesInvoiceFilter(inv({ is_productive: true, status: "unpaid", is_overdue: false }), "overdue"), false);
});
test("25 — matchesInvoiceFilter: 'paid' zeigt nur produktiv bezahlte", () => {
  assert.equal(matchesInvoiceFilter(inv({ is_productive: true, status: "paid" }), "paid"), true);
  assert.equal(matchesInvoiceFilter(inv({ is_productive: true, status: "unpaid" }), "paid"), false);
});

// ── Zusammenfassung ───────────────────────────────────────────────────────────
test("26 — customerInvoiceSummary: keine Rechnungen ⇒ 'empty'", () => {
  assert.deepEqual(customerInvoiceSummary([], null), { state: "empty" });
  assert.deepEqual(customerInvoiceSummary([], { open_count: 5 }), { state: "empty" }, "eine leere Liste bleibt 'empty', unabhängig von der Summary");
});
test("27 — customerInvoiceSummary: offene produktive Forderung ⇒ 'open' aus der Server-Summary", () => {
  const s = customerInvoiceSummary(
    [inv({ is_productive: true })],
    { open_amount: 49.25, open_count: 1, overdue_count: 0, next_due_date: "2026-08-06", currency: "EUR", mixed_currency: false }
  );
  assert.equal(s.state, "open");
  assert.equal(s.openAmount, 49.25);
  assert.equal(s.openCount, 1);
  assert.equal(s.overdueCount, 0);
  assert.equal(s.nextDueDate, "2026-08-06");
  assert.equal(s.currency, "EUR");
});
test("28 — customerInvoiceSummary: keine offene Forderung, aber Preview vorhanden ⇒ 'noOpen' mit previewCount", () => {
  const s = customerInvoiceSummary(
    [inv({ is_productive: false }), inv({ is_productive: true, status: "paid" })],
    { open_amount: 0, open_count: 0, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: false }
  );
  assert.equal(s.state, "noOpen");
  assert.equal(s.previewCount, 1);
});
test("29 — customerInvoiceSummary: fehlende/kaputte Server-Summary ⇒ fail-closed 'noOpen', NIE 'open' erraten", () => {
  assert.equal(customerInvoiceSummary([inv()], null).state, "noOpen");
  assert.equal(customerInvoiceSummary([inv()], undefined).state, "noOpen");
  assert.equal(customerInvoiceSummary([inv()], { open_count: "nicht-numerisch" }).state, "noOpen");
});
test("30 — customerInvoiceSummary: mixedCurrency wird durchgereicht", () => {
  const s = customerInvoiceSummary([inv()], { open_amount: 10, open_count: 1, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: true });
  assert.equal(s.mixedCurrency, true);
});

// ── Texte ─────────────────────────────────────────────────────────────────────
test("31 — Texte für Lade-/Fehler-/Leerzustände sind vorhanden und unterscheidbar", () => {
  for (const t of [FILTER_EMPTY_TEXT, LIST_EMPTY_TITLE, LIST_EMPTY_TEXT, LOADING_TEXT, LOAD_ERROR_TEXT]) {
    assert.equal(typeof t, "string");
    assert.ok(t.length > 5);
  }
  assert.notEqual(FILTER_EMPTY_TEXT, LIST_EMPTY_TITLE, "Filter-Leerzustand und globaler Leerzustand müssen sich unterscheiden");
});

// ── Selbsttest ────────────────────────────────────────────────────────────────
test("32 — Selbsttest: die Prüflogik greift tatsächlich", () => {
  // Eine bewusst falsche Erwartung MUSS scheitern — sonst prüfen die Tests nichts.
  assert.notDeepEqual(paymentStatus(inv({ is_productive: false })), [TONE.ATTENTION, "Offen"]);
  assert.notEqual(matchesInvoiceFilter(inv({ is_productive: false }), "open"), true);
  assert.ok(Object.values(TONE).length === 4 && new Set(Object.values(TONE)).size === 4, "vier unterscheidbare Statusfamilien");
});
