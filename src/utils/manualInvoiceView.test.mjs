// Auftrag 2 / P1 (2026-10-17): manuell erstellte Rechnungen — Eingabeformen, Formular ⇄ Vertrag, Sperren, Fehler,
// Stornovermerk, Listen- und Kundensicht sowie die Quelltextverträge (keine Summenrechnung im Browser, keine E-Mail
// beim Ausstellen, Ausstellen nur über die Bestätigung).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseEuroCents, formatCentsInput, parseQuantity, parseDiscount, emptyDraftForm, draftToForm, formToPayload,
  applyCustomerToForm, formKeyOf, blockerText, manualInvoiceError, reversalPayload, reversalError,
  isManualInvoice, isCancelledInvoice, cancellationInfo, issuedNotice, countryOptions, MANUAL_INVOICE_TEXT,
  stornoPayload,
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

test("5 — Sperren in Klartext; Bezug, lockere Vorschau und Prüfbindung im Vertrag", () => {
  // Ausgestellt wird seit dem Rechnungseditor nur aus der Prüfansicht (reviewIssueState, manualInvoiceEditor.test.mjs).
  assert.equal(blockerText({ message: "Gesperrt.", missingFields: ["issuer.street"], placeholderFields: ["bank.name"] }),
    "Gesperrt. Fehlend: Straße. Noch Platzhalter: Bankname.");
  assert.match(blockerText({ message: "Die Ausstellerdaten sind unvollständig.", missingFields: ["issuer.street"], placeholderFields: ["bank.name"] }),
    /^Die Ausstellerdaten sind unvollständig\. Fehlend: .+\. Noch Platzhalter: .+\.$/);

  // Bezug (Sendung/Lagerauftrag) nur mit gewähltem Kunden; Vorgang und Art gehören zusammen.
  const basis = applyCustomerToForm(emptyDraftForm(), { id: 9, customerNumber: "CE-K-10009",
    recipient: { company: "Zweitkunde AG", street: "Weg 1", zip: "10115", city: "Berlin", country: "DE" } });
  basis.positions = [{ key: "a", description: "Nachberechnung Zoll", details: "", unit: "Stück", quantity: "1", unitPrice: "12,00", discount: "" }];
  const ohne = formToPayload(basis).payload;
  assert.deepEqual([ohne.sourceShipmentId, ohne.sourceOrderId, ohne.billingKind], [null, null, null]);
  const sendung = formToPayload({ ...basis, sourceKind: "shipment", sourceId: 77, sourceLabel: "CE-77", billingKind: "supplementary" }).payload;
  assert.deepEqual([sendung.sourceShipmentId, sendung.sourceOrderId, sendung.billingKind], [77, null, "supplementary"]);
  const auftrag = formToPayload({ ...basis, sourceKind: "order", sourceId: "12", billingKind: "primary" }).payload;
  assert.deepEqual([auftrag.sourceShipmentId, auftrag.sourceOrderId, auftrag.billingKind], [null, 12, "primary"]);
  assert.ok(formToPayload({ ...basis, sourceKind: "shipment", sourceId: null }).errors.source);
  assert.ok(formToPayload({ ...basis, sourceKind: "order", sourceId: 3, billingKind: "" }).errors.billingKind);
  // Externer Empfänger: kein Bezug, auch wenn noch Reste im Formular stehen.
  const extern = formToPayload({ ...basis, recipientKind: "external", recipientUserId: null, sourceKind: "shipment", sourceId: 77, billingKind: "primary" }).payload;
  assert.deepEqual([extern.recipientUserId, extern.sourceShipmentId, extern.billingKind], [null, null, null]);
  // Kundenwechsel setzt den Bezug zurück.
  const gewechselt = applyCustomerToForm({ ...basis, sourceKind: "shipment", sourceId: 77, sourceLabel: "CE-77", billingKind: "primary" }, { id: 10, recipient: {} });
  assert.deepEqual([gewechselt.sourceKind, gewechselt.sourceId, gewechselt.billingKind], ["none", null, ""]);

  // Lockere Fassung (Live-Vorschau): leerer Einzelpreis zählt als 0, ein noch nicht gewählter Kunde sperrt nicht;
  // gesendet wird dann ohne Kunde. Formfehler (Menge, Rabatt) bleiben Fehler.
  const halb = { ...emptyDraftForm(), recipientKind: "customer", recipientUserId: null };
  const locker = formToPayload(halb, { lenient: true });
  assert.equal(locker.ok, true);
  assert.deepEqual([locker.payload.recipientUserId, locker.payload.positions[0].unitPriceNetCents], [null, 0]);
  assert.equal(formToPayload(halb).ok, false, "streng (Speichern) bleibt die Kundenwahl Pflicht");
  assert.ok(formToPayload({ ...halb, positions: [{ ...halb.positions[0], quantity: "" }] }, { lenient: true }).errors["positions.0.quantity"]);

  // Prüfbindung: weicht der Beleg seit der Prüfansicht ab, heißt die Antwort „neu prüfen".
  const stale = manualInvoiceError(409, { code: "MANUAL_INVOICE_PREVIEW_STALE", error: "Bitte erneut prüfen." });
  assert.deepEqual([stale.stale, stale.text], [true, "Bitte erneut prüfen."]);
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

test("7b — Stornorechnung (Schritt 3): Pflichtangaben, Erstattungsbestätigung, Herkunft des Belegs", () => {
  assert.deepEqual(Object.keys(stornoPayload({}).errors).sort(), ["approvedBy", "reason"]);
  assert.deepEqual(stornoPayload({ reason: " Leistung entfallen ", approvedBy: " E. Nordmann " }).body,
    { reason: "Leistung entfallen", approvedBy: "E. Nordmann", acknowledgePaid: false });
  assert.ok(stornoPayload({ reason: "x", approvedBy: "y" }, { paid: true }).errors.acknowledgePaid);
  assert.equal(stornoPayload({ reason: "x", approvedBy: "y", acknowledgePaid: true }, { paid: true }).body.acknowledgePaid, true);
  const intern = cancellationInfo({ is_cancelled: true, cancellation_document_number: "CE-ST26-00001",
    cancellation_document_source: "internal", cancellation_document_available: true });
  assert.deepEqual([intern.internal, intern.documentAvailable, intern.documentNumber], [true, true, "CE-ST26-00001"]);
  const extern = cancellationInfo({ is_cancelled: true, cancellation_document_number: "ST-1", cancellation_document_source: "external" });
  assert.deepEqual([extern.internal, extern.documentAvailable], [false, false]);
  assert.equal(MANUAL_INVOICE_TEXT.stornoDone("CE-ST26-00001"), "Stornorechnung CE-ST26-00001 erstellt. Es wurde keine E-Mail versendet.");
  // Kein Freigabeschalter mehr: der Editor kennt ihn nicht.
  const editor = lies("../pages/admin/AdminManualInvoicePage.jsx");
  assert.ok(!/issueEnabled/.test(editor), "der Editor liest den entfallenen Schalter");
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

test("9 — Quelltextverträge: Route, A4-Einstieg, keine Summenrechnung, keine E-Mail, Ausstellen nur aus der Prüfansicht", () => {
  const app = ohneKommentare(lies("../App.jsx"));
  assert.match(app, /<Route path="\/admin\/invoices\/manual\/:draftId" element=\{<AdminManualInvoicePage \/>\} \/>/);
  assert.match(app, /const AdminManualInvoicePage = React\.lazy\(\(\) => import\("\.\/pages\/admin\/AdminManualInvoicePage"\)\);/);
  const liste = ohneKommentare(lies("../pages/admin/AdminInvoicesPage.jsx"));
  // Einstieg ist die kleine A4-Vorlage (Rechnungseditor 2026-11-21). Der Link ist der sichtbare Titel (Name =
  // Beschriftung, WCAG 2.5.3), seine Fläche deckt die ganze Kachel ab, die Zeile darunter beschreibt ihn.
  assert.match(liste, /<div className="adm-mi-entry">/);
  assert.match(liste, /<Link id="adm-new-invoice" className="adm-mi-entry-title" to="\/admin\/invoices\/manual\/new" aria-describedby="mi-entry-sub">/);
  assert.doesNotMatch(liste, /aria-labelledby="mi-entry-title"/);
  assert.match(liste, /<span className="adm-mi-mini" aria-hidden="true">/);
  const editor = ohneKommentare(lies("../pages/admin/AdminManualInvoicePage.jsx"));
  // Keine E-Mail aus dem Editor, kein Versandaufruf.
  assert.ok(!/sendAdminInvoiceEmail|resendAdminInvoiceEmail|send-email/.test(editor), "der Editor löst einen Versand aus");
  // Ausstellen ausschließlich aus der Prüfansicht — mit Fassung und Fingerabdruck des geprüften Belegs, gegen
  // Doppelklick gesperrt; weicht der Beleg inzwischen ab, wird neu geprüft.
  assert.equal((editor.match(/issueManualInvoiceDraft\(/g) || []).length, 1);
  const bestaetigung = editor.slice(editor.indexOf("const confirmIssue = async"), editor.indexOf("const confirmDiscard"));
  assert.match(bestaetigung, /if \(issueInFlight\.current \|\| !draft \|\| !review \|\| !review\.data \|\| checked !== true\) return;/);
  assert.match(bestaetigung, /issueManualInvoiceDraft\(draft\.id, review\.data\.revision, review\.data\.fingerprint\)/);
  assert.match(bestaetigung, /if \(e\.stale\) \{ ladePruefansicht\(draft\.id, e\.text\); return; \}/);
  assert.match(editor, /onIssue=\{confirmIssue\}/);
  // Vor der Prüfansicht wird gespeichert: geprüft und ausgestellt wird genau die gespeicherte Fassung.
  assert.match(editor, /if \(!aktuell \|\| dirty\) \{\s*aktuell = await persist\(\);\s*if \(!aktuell\) return;\s*\}\s*ladePruefansicht\(aktuell\.id\);/);
  const pruef = ohneKommentare(lies("../components/admin/ManualInvoiceReview.jsx"));
  assert.match(pruef, /onClick=\{\(\) => onIssue\(geprueft\)\}\s*disabled=\{!lage\.allowed \|\| busy\}/);
  assert.match(pruef, /useDialog\(\{ onClose: \(\) => \{ if \(!busy\) onClose\(\); \}, closeOnEscape: !busy \}\)/);
  // Summen nur vom Server: aus der jüngsten Live-Vorschau, sonst aus der gespeicherten Fassung — nie zusammengerechnet.
  assert.match(editor, /const totals = live && live\.totals \? live\.totals : draft && draft\.totals \? draft\.totals : null;/);
  assert.ok(!/\.reduce\(/.test(editor), "der Editor summiert selbst");
  assert.ok(!/unitPriceNetCents\s*\*|\*\s*unitPriceNetCents|quantity\s*\*/.test(editor), "der Editor rechnet Positionsbeträge");
  // Live-Vorschau: lockere Fassung der Felder, abbrechbar, nur die jüngste Antwort zählt.
  assert.match(editor, /const p = formToPayload\(form, \{ lenient: true \}\);/);
  assert.match(editor, /previewManualInvoice\(p\.payload, \{ signal: abbruch\.signal \}\)/);
  assert.match(editor, /if \(!gate\.current\.isLatest\(nr\)\) return;/);
  assert.match(editor, /id="mi-preview"[\s\S]{0,160}disabled=\{!live\}/);
  assert.match(editor, /id="mi-issue"[\s\S]{0,200}disabled=\{saving \|\| issueBusy\}/);
  // Fehlt zu einem Vorgang nur das PDF, führt der Editor zur Rechnungsseite — er erzeugt selbst keine Belege.
  assert.ok(!/backfillInvoiceDocument|generateInvoiceDocument|backfill-document|generate-document/.test(editor));
  for (const datei of ["../pages/admin/AdminManualInvoicePage.jsx", "../components/admin/InvoiceSheet.jsx", "../components/admin/ManualInvoiceReview.jsx"]) {
    assert.ok(!/dangerouslySetInnerHTML/.test(lies(datei)), `${datei}: rohes HTML`);
  }
  // Das Blatt selbst spricht nicht mit dem Server.
  assert.ok(!/api\/adminApi|fetch\(/.test(lies("../components/admin/InvoiceSheet.jsx")));
  // Detail: Drucken nur für manuelle Rechnungen, Stornovermerk nur dort, Versandtext nennt den Empfänger.
  const detail = ohneKommentare(lies("../pages/admin/AdminInvoiceDetailPage.jsx"));
  assert.match(detail, /printable=\{manual\}/);
  assert.match(detail, /\{manual && \(\s*<div className="adm-card" id="adm-inv-reversal">/);
  assert.match(detail, /note=\{manual \? MI\.documentNoteManual : DOCUMENT_GENERATE\.note\}/);
  // API: die vereinbarten Pfade, keine zweite Abstraktion.
  const api = lies("../api/adminApi.js");
  for (const pfad of ["/admin/manual-invoices/status", "/admin/manual-invoices/customers?q=", "/admin/manual-invoices/drafts",
    "/issue", "/admin/manual-invoices/preview", "/review", "/admin/manual-invoices/sources?", "/reversal-record", "/reversal-invoice"]) {
    assert.ok(api.includes(pfad), `Pfad fehlt im API-Vertrag: ${pfad}`);
  }
  assert.match(api, /JSON\.stringify\(\{ revision, fingerprint, confirm: true \}\)/);
});
