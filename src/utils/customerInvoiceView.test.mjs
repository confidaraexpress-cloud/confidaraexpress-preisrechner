// Tests für das zentrale Kunden-Rechnungs-View-Model (Go-live). Läuft über
// `node --test`. Deckt ab: die drei echten Zahlungszustände, Dokument-/E-Mail-
// Status, Zeitraum-Zelle (Leistungsdatum nur bei Abweichung, Fälligkeit nur
// solange offen), Filter, Zusammenfassungs-Zustände (serverseitige summary hat
// Vorrang) und — als Go-live-Kern — dass das Modul KEINE internen Test-,
// Vorschau- oder Modus-Zustände mehr kennt.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TONE,
  isOverdueInvoice,
  paymentStatus,
  documentStatusMeta, emailStatusMeta,
  invoicePeriod, unavailableActionReason,
  INVOICE_FILTERS, matchesInvoiceFilter,
  FILTER_EMPTY_TEXT, LIST_EMPTY_TITLE, LIST_EMPTY_TEXT, LOADING_TEXT, LOAD_ERROR_TEXT,
  customerInvoiceSummary,
} from "./customerInvoiceView.mjs";

import * as viewModule from "./customerInvoiceView.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const viewSrc = fs.readFileSync(path.join(HERE, "customerInvoiceView.mjs"), "utf8");
// Nur der ausführbare Code — Kommentare erklären die entfernten Begriffe bewusst
// beim Namen und dürfen die Begriffsprüfung nicht fälschlich auslösen.
const viewCode = viewSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// Eine produktive Kundenrechnung — der einzige Rechnungstyp, den der Kundenbereich
// seit dem Go-live überhaupt noch erhält.
const inv = (over = {}) => ({
  id: 1, invoice_number: "CE-RE26-00001", amount: "49.25", gross_amount: "49.25", currency: "EUR",
  status: "unpaid", due_date: "2099-01-01", issued_at: "2026-07-19", created_at: "2026-07-19",
  service_date: null, document_status: "ready", email_status: "sent",
  is_overdue: false, download_available: true,
  ...over,
});

// ── Überfälligkeit ───────────────────────────────────────────────────────────
test("1 — isOverdueInvoice: strikt das Serverfeld, kein eigener Datumsvergleich", () => {
  assert.equal(isOverdueInvoice(inv({ is_overdue: true })), true);
  assert.equal(isOverdueInvoice(inv({ is_overdue: false })), false);
  assert.equal(isOverdueInvoice(inv({ is_overdue: undefined })), false);
  assert.equal(isOverdueInvoice(null), false);
  // Ein längst vergangenes Fälligkeitsdatum macht die Rechnung NICHT überfällig,
  // solange der Server es nicht sagt — sonst liefen Anzeige und Kennzahlen an
  // Tagesrändern auseinander.
  assert.equal(isOverdueInvoice(inv({ due_date: "2000-01-01", is_overdue: false })), false);
});

// ── Zahlungsstatus: genau drei echte Kundenzustände ──────────────────────────
test("2 — paymentStatus: bezahlt → Bezahlt", () => {
  assert.deepEqual(paymentStatus(inv({ status: "paid" })), [TONE.POSITIVE, "Bezahlt"]);
});
test("3 — paymentStatus: offen + überfällig → Überfällig", () => {
  assert.deepEqual(paymentStatus(inv({ status: "unpaid", is_overdue: true })), [TONE.CRITICAL, "Überfällig"]);
});
test("4 — paymentStatus: offen, nicht überfällig → Offen", () => {
  assert.deepEqual(paymentStatus(inv({ status: "unpaid", is_overdue: false })), [TONE.ATTENTION, "Offen"]);
});
test("5 — paymentStatus: bezahlt schlägt überfällig (eine eindeutige Aussage)", () => {
  assert.deepEqual(paymentStatus(inv({ status: "paid", is_overdue: true })), [TONE.POSITIVE, "Bezahlt"]);
});
test("6 — GO-LIVE: es gibt NUR diese drei Zahlungszustände", () => {
  const labels = new Set();
  for (const status of ["paid", "unpaid", undefined, "irgendwas"]) {
    for (const overdue of [true, false, undefined]) {
      labels.add(paymentStatus(inv({ status, is_overdue: overdue }))[1]);
    }
  }
  assert.deepEqual([...labels].sort(), ["Bezahlt", "Offen", "Überfällig"],
    "kein weiterer Zahlungszustand - insbesondere kein Nicht-zahlungswirksam-Zustand");
});

// ── Dokument-/E-Mail-Status ──────────────────────────────────────────────────
test("7 — documentStatusMeta: kompakte Labels ohne Fließtext", () => {
  assert.deepEqual(documentStatusMeta(inv({ document_status: "ready" })), [TONE.POSITIVE, "PDF bereit"]);
  assert.deepEqual(documentStatusMeta(inv({ document_status: "generating" })), [TONE.NEUTRAL, "PDF wird erstellt"]);
  assert.deepEqual(documentStatusMeta(inv({ document_status: "pending_document" })), [TONE.NEUTRAL, "PDF wird erstellt"]);
  assert.deepEqual(documentStatusMeta(inv({ document_status: "document_failed" })), [TONE.CRITICAL, "PDF-Erstellung fehlgeschlagen"]);
});
test("8 — emailStatusMeta: nur echte Versandzustaende, kein Kein-Kundenversand-Label", () => {
  assert.deepEqual(emailStatusMeta(inv({ email_status: "sent" })), [TONE.POSITIVE, "Versendet"]);
  assert.deepEqual(emailStatusMeta(inv({ email_status: "pending" })), [TONE.ATTENTION, "Versand ausstehend"]);
  assert.deepEqual(emailStatusMeta(inv({ email_status: "sending" })), [TONE.NEUTRAL, "Wird versendet"]);
  assert.deepEqual(emailStatusMeta(inv({ email_status: "failed" })), [TONE.CRITICAL, "Versand fehlgeschlagen"]);
  const labels = ["sent", "pending", "sending", "failed"].map((s) => emailStatusMeta(inv({ email_status: s }))[1]);
  assert.equal(labels.includes("Kein Kundenversand"), false);
});

// ── Zeitraum-Zelle ────────────────────────────────────────────────────────────
test("9 — invoicePeriod: Leistungsdatum nur, wenn vorhanden UND abweichend", () => {
  assert.equal(invoicePeriod(inv({ issued_at: "2026-07-19", service_date: "2026-07-19" })).serviceAt, null);
  assert.equal(invoicePeriod(inv({ issued_at: "2026-07-19", service_date: "2026-07-20" })).serviceAt, "2026-07-20");
  assert.equal(invoicePeriod(inv({ issued_at: "2026-07-19", service_date: null })).serviceAt, null);
});
test("10 — invoicePeriod: Fälligkeit nur solange die Forderung offen ist", () => {
  assert.equal(invoicePeriod(inv({ status: "unpaid", due_date: "2099-01-01" })).dueAt, "2099-01-01");
  assert.equal(invoicePeriod(inv({ status: "paid", due_date: "2099-01-01" })).dueAt, null, "bezahlt ⇒ Fälligkeit erledigt");
});
test("11 — invoicePeriod: overdue-Flag nur zusammen mit sichtbarer Fälligkeit", () => {
  assert.equal(invoicePeriod(inv({ status: "unpaid", is_overdue: true })).overdue, true);
  assert.equal(invoicePeriod(inv({ status: "paid", is_overdue: true })).overdue, false);
});
test("12 — GO-LIVE: invoicePeriod liefert keinen nonPayableNote mehr", () => {
  assert.equal("nonPayableNote" in invoicePeriod(inv()), false);
});

// ── Aktionen ──────────────────────────────────────────────────────────────────
test("13 — unavailableActionReason: verfügbar ⇒ leer; sonst ehrliche Begründung ohne interne Begriffe", () => {
  assert.equal(unavailableActionReason(inv({ download_available: true })), "");
  assert.equal(unavailableActionReason(inv({ download_available: false, document_status: "generating" })), "Rechnung wird erstellt");
  assert.equal(unavailableActionReason(inv({ download_available: false, document_status: "document_failed" })), "Rechnung konnte noch nicht erstellt werden");
  assert.equal(unavailableActionReason(inv({ download_available: false, document_status: "ready" })), "Derzeit nicht verfügbar");
  for (const s of ["ready", "generating", "pending_document", "document_failed"]) {
    const reason = unavailableActionReason(inv({ download_available: false, document_status: s }));
    assert.doesNotMatch(reason, /Test|Vorschau|Kundenversand|zahlungswirksam/i, `interner Begriff in „${reason}"`);
  }
});

// ── Filter ────────────────────────────────────────────────────────────────────
test("14 — GO-LIVE: genau vier Filter, kein Test-und-Vorschau-Filter", () => {
  assert.deepEqual(INVOICE_FILTERS.map((f) => f.value), ["", "open", "overdue", "paid"]);
  assert.deepEqual(INVOICE_FILTERS.map((f) => f.label), ["Alle", "Offen", "Überfällig", "Bezahlt"]);
});
test("15 — matchesInvoiceFilter: Alle/Offen/Überfällig/Bezahlt", () => {
  const offen = inv({ status: "unpaid", is_overdue: false });
  const faellig = inv({ status: "unpaid", is_overdue: true });
  const bezahlt = inv({ status: "paid" });
  for (const i of [offen, faellig, bezahlt]) assert.equal(matchesInvoiceFilter(i, ""), true);
  assert.equal(matchesInvoiceFilter(offen, "open"), true);
  assert.equal(matchesInvoiceFilter(faellig, "open"), true, "überfällig ist Teilmenge von offen");
  assert.equal(matchesInvoiceFilter(bezahlt, "open"), false);
  assert.equal(matchesInvoiceFilter(faellig, "overdue"), true);
  assert.equal(matchesInvoiceFilter(offen, "overdue"), false);
  assert.equal(matchesInvoiceFilter(bezahlt, "paid"), true);
  assert.equal(matchesInvoiceFilter(offen, "paid"), false);
});

// ── Zusammenfassung ───────────────────────────────────────────────────────────
test("16 — customerInvoiceSummary: keine Rechnungen ⇒ 'empty'", () => {
  assert.deepEqual(customerInvoiceSummary([], null), { state: "empty" });
  assert.deepEqual(customerInvoiceSummary([], { open_count: 5 }), { state: "empty" });
});
test("17 — customerInvoiceSummary: offene Forderung ⇒ 'open' aus der Server-Summary", () => {
  const s = customerInvoiceSummary([inv()], { open_amount: 49.25, open_count: 1, overdue_count: 0, next_due_date: "2026-08-06", currency: "EUR", mixed_currency: false });
  assert.equal(s.state, "open");
  assert.equal(s.openAmount, 49.25);
  assert.equal(s.openCount, 1);
  assert.equal(s.nextDueDate, "2026-08-06");
});
test("18 — customerInvoiceSummary: alles bezahlt ⇒ 'noOpen', ohne Preview-Zusatz", () => {
  const s = customerInvoiceSummary([inv({ status: "paid" })], { open_amount: 0, open_count: 0, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: false });
  assert.equal(s.state, "noOpen");
  assert.equal("previewCount" in s, false, "GO-LIVE: kein Zähler für interne Dokumente mehr");
});
test("19 — customerInvoiceSummary: fehlende Server-Summary ⇒ fail-closed 'noOpen'", () => {
  assert.equal(customerInvoiceSummary([inv()], null).state, "noOpen");
  assert.equal(customerInvoiceSummary([inv()], { open_count: "nicht-numerisch" }).state, "noOpen");
});
test("20 — customerInvoiceSummary: mixedCurrency wird durchgereicht", () => {
  const s = customerInvoiceSummary([inv()], { open_amount: 10, open_count: 1, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: true });
  assert.equal(s.mixedCurrency, true);
});

// ── Texte ─────────────────────────────────────────────────────────────────────
test("21 — Leerzustand nennt weder Test noch Vorschau und erklärt die Entstehung", () => {
  assert.equal(LIST_EMPTY_TITLE, "Noch keine Rechnungen vorhanden");
  assert.equal(LIST_EMPTY_TEXT, "Sobald eine Rechnung für eine gebuchte Sendung erstellt wurde, erscheint sie hier automatisch.");
  for (const t of [FILTER_EMPTY_TEXT, LIST_EMPTY_TITLE, LIST_EMPTY_TEXT, LOADING_TEXT, LOAD_ERROR_TEXT]) {
    assert.doesNotMatch(t, /Test|Vorschau|zahlungswirksam/i, `interner Begriff in „${t}"`);
  }
});

// ── GO-LIVE: das Modul kennt interne Zustände nicht mehr ─────────────────────
test("22 — GO-LIVE: die modus-/testbezogenen Exporte existieren nicht mehr", () => {
  for (const gone of ["documentModeMeta", "documentModeHint", "amountLabel", "isProductiveInvoice", "isPayableInvoice"]) {
    assert.equal(gone in viewModule, false, `${gone} darf im Kunden-View-Model nicht mehr existieren`);
  }
});

test("23 — GO-LIVE: kein interner Begriff und keine Produktivitätsheuristik im ausführbaren Code", () => {
  for (const term of ["Interne Vorschau", "Testdokument", "Dokumentbetrag", "zahlungswirksam", "Kein Kundenversand", "Test & Vorschau"]) {
    assert.equal(viewCode.includes(term), false, `interner Begriff „${term}" steht noch im Code`);
  }
  // Keine Frontend-Heuristik: die Produktivität wird serverseitig entschieden, hier
  // nicht rekonstruiert — weder über is_productive noch über document_mode_label.
  assert.equal(/is_productive|document_mode_label|is_test_document/.test(viewCode), false,
    "das View-Model darf die serverseitige Klassifizierung nicht erneut auswerten");
});

test("24 — Selbsttest: die Prüflogik greift tatsächlich", () => {
  // Die Begriffsprüfung ist nicht leerlaufend: derselbe Test findet einen Begriff,
  // der wirklich im Code steht.
  assert.equal(viewCode.includes("Überfällig"), true, "Selbsttest: Begriffssuche funktioniert");
  // Und die Exportprüfung erkennt einen vorhandenen Export.
  assert.equal("paymentStatus" in viewModule, true);
  assert.ok(Object.values(TONE).length === 4 && new Set(Object.values(TONE)).size === 4);
});
