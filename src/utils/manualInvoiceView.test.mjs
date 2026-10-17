// Auftrag 2 / P1 (2026-10-17): manuell erstellte Rechnungen — Eingabeformen, Formular ⇄ Vertrag, Sperren, Fehler,
// Stornovermerk, Listen- und Kundensicht sowie die Quelltextverträge (keine Summenrechnung im Browser, keine E-Mail
// beim Ausstellen, Ausstellen nur über die Bestätigung).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseEuroCents, formatCentsInput, parseQuantity, parseDiscount, emptyDraftForm, draftToForm, formToPayload,
  applyCustomerToForm, formKeyOf, issueAvailability, blockerText, manualInvoiceError, reversalPayload, reversalError,
  isManualInvoice, isCancelledInvoice, cancellationInfo, issuedNotice, countryOptions, MANUAL_INVOICE_TEXT,
} from "./manualInvoiceView.mjs";
import { paymentStatus as adminPaymentStatus, customerCell, payability, invoiceSourceMeta } from "./adminInvoiceView.mjs";
import { paymentStatus as customerPaymentStatus, matchesInvoiceFilter } from "./customerInvoiceView.mjs";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("1 — Euro-Eingabe → Cent: deutsch, mit Tausenderpunkt, ohne Rundung, Unzulässiges = null", () => {
  for (const [ein, cent] of [["80,00", 8000], ["80", 8000], ["1.234,56", 123456], ["1234,5", 123450], ["12.5", 1250],
    ["1.234", 123400], ["0", 0], ["0,99", 99], [" 7,10 € ", 710], ["1.000.000,00", 100000000], ["12,", 1200]]) {
    assert.equal(parseEuroCents(ein), cent, ein);
  }
  for (const ein of ["", "abc", "-1", "1,234", "1.23.4", "1e3", "1,2,3"]) {
    assert.equal(parseEuroCents(ein), null, ein);
  }
  assert.equal(formatCentsInput(123456), "1.234,56");
  assert.equal(formatCentsInput(0), "0,00");
  assert.equal(parseEuroCents(formatCentsInput(987654321)), 987654321);
});

test("2 — Menge und Rabatt: deutsche Eingabe → Maschinenform, Formfehler = null", () => {
  assert.equal(parseQuantity("1,5"), "1.5");
  assert.equal(parseQuantity("0,333"), "0.333");
  assert.equal(parseQuantity("3"), "3");
  assert.equal(parseQuantity(""), "");
  assert.equal(parseQuantity("1,2345"), null);
  assert.equal(parseQuantity("-1"), null);
  assert.equal(parseDiscount("12,5"), "12.5");
  assert.equal(parseDiscount("10.55"), "10.55");
  assert.equal(parseDiscount("10,555"), null);
});

test("3 — Formular → Vertrag: Maschinenform, Kundenwahl Pflicht, Feldfehler je Position", () => {
  const f = emptyDraftForm();
  f.recipient = { ...f.recipient, company: "Elbufer Handel OHG", street: "Elbchaussee 7", zip: "22763", city: "Hamburg" };
  f.positions = [{ key: "a", description: "Beratung", details: "", unit: "Std.", quantity: "1,5", unitPrice: "80,00", discount: "10" }];
  f.serviceDateFrom = "2026-10-15";
  f.paymentTermDays = "14";
  const r = formToPayload(f);
  assert.equal(r.ok, true);
  assert.deepEqual(r.payload.positions, [{ description: "Beratung", details: "", unit: "Std.", quantity: "1.5", unitPriceNetCents: 8000, discountPercent: "10" }]);
  assert.deepEqual([r.payload.recipientUserId, r.payload.paymentTermDays, r.payload.serviceDateTo, r.payload.taxCase], [null, 14, null, "domestic_standard"]);
  // Nicht vorhandene Summenfelder: der Client schickt keinen Betrag außer den Einzelpreisen.
  assert.ok(!("netCents" in r.payload) && !("grossCents" in r.payload) && !("totals" in r.payload));

  const kunde = { ...f, recipientKind: "customer", recipientUserId: null };
  assert.ok(formToPayload(kunde).errors.recipientUserId);
  const falsch = { ...f, positions: [{ ...f.positions[0], unitPrice: "abc", quantity: "", discount: "1,234" }], paymentTermDays: "x" };
  assert.deepEqual(Object.keys(formToPayload(falsch).errors).sort(),
    ["paymentTermDays", "positions.0.discount", "positions.0.quantity", "positions.0.unitPrice"]);
});

test("4 — Serverfassung → Formular → Vertrag: verlustfrei; Kundenwahl belegt die Rechnungsanschrift vor", () => {
  const draft = {
    id: 7, revision: 3, recipientUserId: 42, recipientAccount: { customerNumber: "CE-K-10042", status: "approved" },
    recipient: { company: "Hafenkontor Weber KG", name: "Jana Weber", email: "rechnung@hafenkontor.example", vatId: "DE123456789",
      street: "Kaistraße 4", zip: "20457", city: "Hamburg", country: "DE" },
    positions: [{ description: "Lagerlogistik", details: "Oktober", unit: "Std.", quantity: "1.5", unitPriceNetCents: 123456, discountPercent: "12.5" }],
    serviceDateFrom: "2026-10-01", serviceDateTo: "2026-10-31", customerReference: "PO-4711", paymentTermDays: 7,
    introText: "Einleitung", closingText: "Schluss", paymentNote: "Hinweis",
  };
  const form = draftToForm(draft);
  assert.equal(form.recipientKind, "customer");
  assert.equal(form.customerLabel, "Hafenkontor Weber KG · CE-K-10042");
  assert.deepEqual([form.positions[0].quantity, form.positions[0].unitPrice, form.positions[0].discount], ["1,5", "1.234,56", "12,5"]);
  const zurueck = formToPayload(form).payload;
  assert.deepEqual(zurueck.positions[0], { description: "Lagerlogistik", details: "Oktober", unit: "Std.", quantity: "1.5", unitPriceNetCents: 123456, discountPercent: "12.5" });
  assert.deepEqual([zurueck.recipientUserId, zurueck.serviceDateTo, zurueck.paymentTermDays], [42, "2026-10-31", 7]);

  const gewaehlt = applyCustomerToForm(emptyDraftForm(), { id: 9, customerNumber: "CE-K-10009",
    recipient: { company: "Zweitkunde AG", email: "login@zweitkunde.example", street: "Weg 1", zip: "10115", city: "Berlin", country: "DE" } });
  assert.deepEqual([gewaehlt.recipientKind, gewaehlt.recipientUserId, gewaehlt.recipient.email, gewaehlt.customerLabel],
    ["customer", 9, "login@zweitkunde.example", "Zweitkunde AG · CE-K-10009"]);
  // Freigegeben ist nur Deutschland; ein abweichendes Land bleibt sichtbar und als nicht freigegeben gekennzeichnet.
  assert.deepEqual(countryOptions("DE").map((o) => o.value), ["DE"]);
  assert.match(countryOptions("AT")[1].label, /nicht freigegeben/);
});

test("5 — Ausstellen nur aus der gespeicherten Fassung und ohne Serversperre", () => {
  assert.deepEqual(issueAvailability({ draft: null, dirty: false }), { allowed: false, reasons: [MANUAL_INVOICE_TEXT.issueNeedsSave] });
  assert.equal(issueAvailability({ draft: { id: 1, issueBlockers: [] }, dirty: true }).allowed, false);
  assert.deepEqual(issueAvailability({ draft: { id: 1, issueBlockers: [] }, dirty: false }), { allowed: true, reasons: [] });
  const gesperrt = issueAvailability({ draft: { id: 1, issueBlockers: [
    { code: "MANUAL_INVOICE_ISSUE_DISABLED", message: "Das Ausstellen manueller Rechnungen ist nicht freigeschaltet." },
    { code: "ISSUER_NOT_READY", message: "Die Ausstellerdaten sind unvollständig.", missingFields: ["issuer.street"], placeholderFields: ["bank.name"] },
  ] }, dirty: false });
  assert.equal(gesperrt.allowed, false);
  assert.equal(gesperrt.reasons.length, 2);
  assert.match(gesperrt.reasons[1], /^Die Ausstellerdaten sind unvollständig\. Fehlend: .+\. Noch Platzhalter: .+\.$/);
  // Feldnamen erscheinen in Klartext (dieselbe Beschriftung wie die Produktionsbereitschaft), nie als Schlüssel.
  assert.equal(blockerText({ message: "Gesperrt.", missingFields: ["issuer.street"], placeholderFields: ["bank.name"] }),
    "Gesperrt. Fehlend: Straße. Noch Platzhalter: Bankname.");
});

test("6 — Fehlerabbildung: Feldfehler an der richtigen Eingabe, Konflikt, Sperren, Ausgestellt", () => {
  assert.equal(formKeyOf("positions[2].unitPriceNetCents"), "positions.2.unitPrice");
  assert.equal(formKeyOf("positions[0].discountPercent"), "positions.0.discount");
  assert.equal(formKeyOf("recipient.zip"), "recipient.zip");
  const feld = manualInvoiceError(400, { error: "x", errors: [{ field: "positions[1].quantity", message: "Menge falsch" }, { field: "recipient.zip", message: "PLZ falsch" }] });
  assert.deepEqual(feld.fieldErrors, { "positions.1.quantity": "Menge falsch", "recipient.zip": "PLZ falsch" });
  assert.equal(manualInvoiceError(409, { code: "MANUAL_INVOICE_DRAFT_CONFLICT" }).conflict, true);
  assert.equal(manualInvoiceError(409, { code: "MANUAL_INVOICE_DRAFT_ISSUED", invoiceId: 5 }).issuedInvoiceId, 5);
  assert.deepEqual(manualInvoiceError(409, { code: "MANUAL_INVOICE_ISSUE_BLOCKED", blockers: [{ message: "Sperre A" }] }).blockers, ["Sperre A"]);
  assert.equal(manualInvoiceError(500, { error: "intern: stack" }).text, MANUAL_INVOICE_TEXT.failed, "ein Serverrohtext erscheint nie");
  assert.equal(issuedNotice("CE-RE26-00042"), "Rechnung CE-RE26-00042 ausgestellt. Es wurde keine E-Mail versendet.");
  assert.match(issuedNotice("CE-RE26-00042", true), /keine zweite Rechnung/);
});

test("7 — Stornovermerk: Pflichtangaben, Bestätigung bei bezahlter Rechnung, feste Fehlertexte", () => {
  const leer = reversalPayload({});
  assert.deepEqual(Object.keys(leer.errors).sort(), ["approvedBy", "cancellationDate", "externalDocumentNumber", "reason"]);
  const ok = reversalPayload({ externalDocumentNumber: " ST-1 ", cancellationDate: "2026-10-17", reason: " Leistung entfallen ", approvedBy: "E. Nordmann" });
  assert.deepEqual(ok.body, { externalDocumentNumber: "ST-1", cancellationDate: "2026-10-17", reason: "Leistung entfallen", approvedBy: "E. Nordmann", acknowledgePaid: false });
  const bezahlt = reversalPayload({ externalDocumentNumber: "ST-1", cancellationDate: "2026-10-17", reason: "x", approvedBy: "y" }, { paid: true });
  assert.ok(bezahlt.errors.acknowledgePaid);
  assert.deepEqual(reversalError(409, { code: "REVERSAL_NUMBER_TAKEN" }).fieldErrors, { externalDocumentNumber: "Diese Stornobelegnummer ist bereits vermerkt." });
  assert.match(reversalError(409, { code: "INVOICE_ALREADY_CANCELLED" }).text, /bereits ein Storno/);
});

test("8 — Listen- und Kundensicht: Herkunft, externer Empfänger, Storniert ohne Zahlungsaktion", () => {
  const manuellExtern = { invoice_source: "manual", user_id: null, recipient_company: "Elbufer Handel OHG", is_test_document: false, document_mode: "production" };
  assert.deepEqual(customerCell(manuellExtern), { primary: "Elbufer Handel OHG", secondary: "Externer Empfänger", known: true });
  assert.deepEqual(invoiceSourceMeta(manuellExtern), { manual: true, badge: "badge-blue", short: "Manuell", label: "Manuell erstellt" });
  assert.equal(invoiceSourceMeta({}).manual, false);
  const storniert = { ...manuellExtern, status: "unpaid", is_cancelled: true, is_payable: false };
  assert.equal(adminPaymentStatus(storniert).kind, "cancelled");
  assert.equal(adminPaymentStatus(storniert).label, "Storniert");
  assert.equal(payability(storniert).payable, false);
  assert.match(payability(storniert).reason, /Storno/);
  assert.equal(isManualInvoice(manuellExtern), true);
  assert.equal(isCancelledInvoice(storniert), true);
  assert.deepEqual(cancellationInfo({ is_cancelled: true, cancellation_document_number: "ST-1", cancellation_date: "2026-10-17",
    cancellation_reason: "x", cancellation_approved_by: "y", cancellation_recorded_at: "2026-10-17T10:00:00Z" }).documentNumber, "ST-1");
  assert.equal(cancellationInfo({ is_cancelled: false }), null);
  // Kundenportal: „Storniert" statt „Offen", nicht unter dem Filter „Offen".
  assert.deepEqual(customerPaymentStatus({ status: "unpaid", is_cancelled: true }).slice(1), ["Storniert"]);
  assert.equal(matchesInvoiceFilter({ status: "unpaid", is_cancelled: true }, "open"), false);
  assert.equal(matchesInvoiceFilter({ status: "unpaid" }, "open"), true);
});

test("9 — Quelltextverträge: Route, Knopf, keine Summenrechnung, keine E-Mail, Ausstellen nur nach Bestätigung", () => {
  const app = ohneKommentare(lies("../App.jsx"));
  assert.match(app, /<Route path="\/admin\/invoices\/manual\/:draftId" element=\{<AdminManualInvoicePage \/>\} \/>/);
  assert.match(app, /const AdminManualInvoicePage = React\.lazy\(\(\) => import\("\.\/pages\/admin\/AdminManualInvoicePage"\)\);/);
  const liste = ohneKommentare(lies("../pages/admin/AdminInvoicesPage.jsx"));
  assert.match(liste, /<Link id="adm-new-invoice" className="btn btn-primary btn-sm" to="\/admin\/invoices\/manual\/new">/);
  const editor = ohneKommentare(lies("../pages/admin/AdminManualInvoicePage.jsx"));
  // Keine E-Mail aus dem Editor, kein Versandaufruf.
  assert.ok(!/sendAdminInvoiceEmail|resendAdminInvoiceEmail|send-email/.test(editor), "der Editor löst einen Versand aus");
  // Ausstellen ausschließlich in der Bestätigung, gegen Doppelklick gesperrt.
  assert.equal((editor.match(/issueManualInvoiceDraft\(/g) || []).length, 1);
  const bestaetigung = editor.slice(editor.indexOf("const confirmIssue = async"), editor.indexOf("const confirmDiscard"));
  assert.match(bestaetigung, /if \(issueInFlight\.current \|\| !draft\) return;/);
  assert.match(bestaetigung, /issueManualInvoiceDraft\(draft\.id, draft\.revision\)/);
  assert.match(editor, /onConfirm=\{confirmIssue\}/);
  // Summen nur vom Server: der Editor liest totals aus der Serverfassung und rechnet keinen Betrag zusammen.
  assert.match(editor, /const totals = draft && draft\.totals \? draft\.totals : null;/);
  assert.ok(!/\.reduce\(/.test(editor), "der Editor summiert selbst");
  assert.ok(!/unitPriceNetCents\s*\*|\*\s*unitPriceNetCents|quantity\s*\*/.test(editor), "der Editor rechnet Positionsbeträge");
  // Vorschau und Ausstellen zeigen die gespeicherte Fassung — mit ungespeicherten Änderungen gesperrt.
  assert.match(editor, /id="mi-preview"[\s\S]{0,160}disabled=\{!draft \|\| dirty\}/);
  assert.match(editor, /id="mi-issue"[\s\S]{0,200}disabled=\{!availability\.allowed \|\| issueBusy\}/);
  // Detail: Drucken nur für manuelle Rechnungen, Stornovermerk nur dort, Versandtext nennt den Empfänger.
  const detail = ohneKommentare(lies("../pages/admin/AdminInvoiceDetailPage.jsx"));
  assert.match(detail, /printable=\{manual\}/);
  assert.match(detail, /\{manual && \(\s*<div className="adm-card" id="adm-inv-reversal">/);
  assert.match(detail, /note=\{manual \? MI\.documentNoteManual : DOCUMENT_GENERATE\.note\}/);
  // API: die vereinbarten Pfade, keine zweite Abstraktion.
  const api = lies("../api/adminApi.js");
  for (const pfad of ["/admin/manual-invoices/status", "/admin/manual-invoices/customers?q=", "/admin/manual-invoices/drafts",
    "/issue", "/preview", "/reversal-record"]) {
    assert.ok(api.includes(pfad), `Pfad fehlt im API-Vertrag: ${pfad}`);
  }
  assert.match(api, /JSON\.stringify\(\{ revision, confirm: true \}\)/);
});
