// Admin-Rechnungsverwaltung (Liste + Detail) — Tests.
//
// Zwei Ebenen (wie im Repo etabliert — es gibt bewusst keine React-Render-
// Testinfrastruktur):
//   A) Verhalten: die reine Logik aus utils/adminInvoiceView.mjs wird direkt
//      ausgeführt (Forderungsklassifizierung, Zahlungsstatus, Überfälligkeit,
//      Dokument-/E-Mail-Zustand, Zahlbarkeit, Snapshot vs. Live, Filter,
//      Leer-/Fehlerzustände).
//   B) Contract: der Quelltext der beteiligten Seiten/Styles wird geprüft —
//      überall dort, wo die Aussage am Rendering hängt.
// Ein Selbsttest am Ende stellt sicher, dass die Prüflogik greift.
//
// Run: node --test src/utils/adminInvoiceView.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  EMPTY_INVOICE_FILTERS,
  INVOICE_STATUS_FILTER_OPTIONS,
  NON_PRODUCTIVE_MAIL_NOTE,
  NON_PRODUCTIVE_PAY_NOTE,
  PAY_DIALOG,
  SHIPMENT_NO_ORDER_NUMBER,
  SNAPSHOT_MISSING_NOTE,
  SUCCESS_TEXT,
  activeInvoiceFilterChips,
  amountFields,
  currentAccount,
  customerCell,
  documentOutcomeMessage,
  documentState,
  emailOutcomeMessage,
  emailState,
  hasActiveInvoiceFilters,
  invoiceDetailError,
  invoiceEmptyState,
  invoiceMarkers,
  invoiceMode,
  invoiceModeMeta,
  isInvoiceOverdue,
  isProductiveInvoice,
  linkedShipment,
  payErrorMessage,
  payability,
  paymentStatus,
  snapshotRecipient,
  technicalCode,
  toInvoiceApiFilters,
  validateInvoiceFilters,
} from "./adminInvoiceView.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..");
const read = (rel) => readFileSync(join(SRC, rel), "utf8");
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const listSrc   = stripComments(read("pages/admin/AdminInvoicesPage.jsx"));
const detailSrc = stripComments(read("pages/admin/AdminInvoiceDetailPage.jsx"));
const dialogSrc = stripComments(read("components/admin/ConfirmDialog.jsx"));
const cssSrc    = read("styles/admin.css");
const viewSrc   = stripComments(read("utils/adminInvoiceView.mjs"));

// ── Beispielrechnungen — exakt nach Backendvertrag (routes/admin.js) ─────────
const PROD_OPEN = {
  id: 101, user_id: 2, shipment_id: 900, invoice_number: "CE-RE26-00002",
  status: "unpaid", due_date: "2099-01-01T00:00:00Z", paid_at: null, created_at: "2026-07-24T00:00:00Z",
  amount: "49.25", net_amount: "41.39", vat_rate: "19.00", vat_amount: "7.86", gross_amount: "49.25",
  currency: "EUR", payment_term: 7, shipping_vat_amount: null,
  document_status: "ready", is_test_document: false, document_mode: "production", document_mode_label: "production",
  email_status: "sent", email_sent_at: "2026-07-24T00:06:00Z", email_attempts: 1,
  is_productive: true, is_overdue: false, is_payable: true,
  customer_number: "CE-K-10031", snapshot_company: "Borner Spedition GmbH (historisch)",
  snapshot_name: "A. Muster", snapshot_email: "alt@example.com", snapshot_vat_id: "DE111",
  business_order_number: "CE-BS26-00042", jumingo_order_number: "JU-77",
  name: "Neuer Name", email: "neu@example.com", company_name: "Borner Spedition GmbH",
  current_customer_number: "CE-K-10031",
  shipment_status: "label_ready", shipment_carrier: "ups", shipment_from_country: "DE",
  shipment_to_country: "GB", shipment_package_count: 1,
};
const PROD_OVERDUE = { ...PROD_OPEN, id: 102, due_date: "2026-07-01T00:00:00Z", is_overdue: true };
const PROD_PAID = { ...PROD_OPEN, id: 103, status: "paid", paid_at: "2026-07-25T00:00:00Z", is_payable: false, is_overdue: false };
const TEST_INV = { ...PROD_OPEN, id: 104, invoice_number: "CE-TEST-RE26-00001",
  document_mode: "test", document_mode_label: "test", is_test_document: true,
  is_productive: false, is_overdue: false, is_payable: false, email_status: "pending",
  due_date: "2026-07-01T00:00:00Z" };
const PREVIEW_INV = { ...TEST_INV, id: 105, document_mode: "preview", document_mode_label: "preview" };
const LEGACY_INV = { ...PROD_OPEN, id: 107, invoice_number: "CE-1784413235576-AF896D",
  document_mode: null, document_mode_label: "unknown", is_test_document: null,
  is_productive: false, is_overdue: false, is_payable: false,
  customer_number: null, business_order_number: null, snapshot_company: null, snapshot_name: null,
  snapshot_email: null, snapshot_vat_id: null, shipment_id: null };

// ═══ A) Forderungsklassifizierung ════════════════════════════════════════════

test("1 — der Modus kommt vom Backend und wird nur notfalls konservativ abgeleitet", () => {
  assert.equal(invoiceMode(PROD_OPEN), "production");
  assert.equal(invoiceMode(TEST_INV), "test");
  assert.equal(invoiceMode(PREVIEW_INV), "preview");
  assert.equal(invoiceMode(LEGACY_INV), "unknown");
  // Ohne document_mode_label (älteres Backend) wird aus den Rohfeldern abgeleitet —
  // fail-closed: ein Testdokument schlägt einen 'production'-Buchungsmodus.
  assert.equal(invoiceMode({ document_mode: "production", is_test_document: true }), "test");
  assert.equal(invoiceMode({ document_mode: "preview", is_test_document: true }), "preview");
  assert.equal(invoiceMode({ document_mode: "production", is_test_document: null }), "production");
  assert.equal(invoiceMode({}), "unknown");
  assert.equal(invoiceMode(undefined), "unknown");
  // Ein unbekanntes Label wird nicht blind übernommen.
  assert.equal(invoiceMode({ document_mode_label: "irgendwas" }), "unknown");
});

test("2 — produktive Forderung: Serverfeld hat Vorrang, sonst fail-closed", () => {
  assert.equal(isProductiveInvoice(PROD_OPEN), true);
  for (const row of [TEST_INV, PREVIEW_INV, LEGACY_INV]) assert.equal(isProductiveInvoice(row), false);
  // Ohne is_productive entscheidet der Modus — nur 'production' zählt.
  assert.equal(isProductiveInvoice({ document_mode: "production" }), true);
  assert.equal(isProductiveInvoice({ document_mode: "test" }), false);
  assert.equal(isProductiveInvoice({}), false, "unbekannt ⇒ nicht produktiv");
  assert.equal(isProductiveInvoice(undefined), false);
  // Das Frontend rechnet die Klassifizierung NICHT nach: es gibt keine eigene
  // snapshot_source-Auswertung und keine zweite Modusliste.
  assert.equal(/snapshot_source/.test(viewSrc), false, "das Frontend darf snapshot_source nicht selbst deuten");
});

test("3 — Test- und Vorschau-Rechnungen sind nie überfällig", () => {
  assert.equal(isInvoiceOverdue(PROD_OVERDUE), true);
  assert.equal(isInvoiceOverdue(PROD_OPEN), false);
  assert.equal(isInvoiceOverdue(PROD_PAID), false);
  // Trotz weit überschrittener Fälligkeit: keine Forderung ⇒ nie überfällig.
  for (const row of [TEST_INV, PREVIEW_INV, LEGACY_INV]) {
    assert.equal(isInvoiceOverdue(row), false, `${row.invoice_number} darf nicht überfällig sein`);
  }
  // Der Serverwert hat Vorrang vor jeder lokalen Datumsrechnung (keine konkurrierende Zeitzone) —
  // ABER nur innerhalb produktiver Forderungen.
  assert.equal(isInvoiceOverdue({ ...PROD_OPEN, is_overdue: true, due_date: "2099-01-01" }), true);
  assert.equal(isInvoiceOverdue({ ...PROD_OVERDUE, is_overdue: false }), false);
  // Defensiv: selbst wenn ein Backend fälschlich is_overdue=true meldet oder das Feld ganz
  // fehlt, darf eine Test-/Vorschau-/unklare Rechnung NIE überfällig erscheinen. Die
  // Produktivprüfung muss VOR der Flag-Auswertung greifen.
  for (const row of [TEST_INV, PREVIEW_INV, LEGACY_INV]) {
    assert.equal(isInvoiceOverdue({ ...row, is_overdue: true }), false,
      `${row.invoice_number}: ein fehlerhaftes Serverflag darf nicht durchschlagen`);
    const { is_overdue, ...withoutFlag } = row;
    assert.equal(isInvoiceOverdue({ ...withoutFlag, status: "unpaid", due_date: "2020-01-01" }, new Date("2026-07-29")), false,
      `${row.invoice_number}: ohne Serverflag darf die Datumsrechnung nicht greifen`);
  }
  // Fallback nur, wenn das Feld fehlt.
  const noFlag = { document_mode: "production", status: "unpaid", due_date: "2026-07-01T00:00:00Z" };
  assert.equal(isInvoiceOverdue(noFlag, new Date("2026-07-29T12:00:00Z")), true);
  assert.equal(isInvoiceOverdue({ ...noFlag, due_date: null }, new Date("2026-07-29T12:00:00Z")), false);
});

test("4 — der Zahlungsstatus unterscheidet Forderung und Nicht-Forderung", () => {
  assert.deepEqual(paymentStatus(PROD_OPEN), { cls: "badge-yellow", label: "Offen", kind: "open" });
  assert.deepEqual(paymentStatus(PROD_OVERDUE), { cls: "badge-red", label: "Überfällig", kind: "overdue" });
  assert.deepEqual(paymentStatus(PROD_PAID), { cls: "badge-green", label: "Bezahlt", kind: "paid" });
  for (const row of [TEST_INV, PREVIEW_INV, LEGACY_INV]) {
    const s = paymentStatus(row);
    assert.equal(s.kind, "none", `${row.invoice_number}: keine Forderung`);
    assert.equal(s.label, "Keine Forderung");
    // Insbesondere NIE gleichzeitig „Überfällig".
    assert.notEqual(s.label, "Überfällig");
  }
  assert.deepEqual(INVOICE_STATUS_FILTER_OPTIONS.map((o) => o.value), ["", "unpaid", "paid"]);
});

// ═══ B) Zahlbarkeit und Adminaktionen ════════════════════════════════════════

test("5 — nur produktive, unbezahlte Rechnungen sind als bezahlt markierbar", () => {
  assert.deepEqual(payability(PROD_OPEN), { payable: true, reason: "" });
  assert.deepEqual(payability(PROD_OVERDUE), { payable: true, reason: "" });
  assert.equal(payability(PROD_PAID).payable, false);
  assert.match(payability(PROD_PAID).reason, /bereits als bezahlt/);
  for (const row of [TEST_INV, PREVIEW_INV, LEGACY_INV]) {
    const p = payability(row);
    assert.equal(p.payable, false, `${row.invoice_number} darf nicht zahlbar sein`);
    assert.equal(p.reason, NON_PRODUCTIVE_PAY_NOTE);
  }
  // is_payable=false vom Server sperrt auch dann, wenn lokal alles produktiv aussieht.
  assert.equal(payability({ document_mode: "production", status: "unpaid", is_payable: false }).payable, false);
  // Defensiv in die andere Richtung: ein fehlendes oder fälschlich true gesetztes is_payable
  // darf eine Test-/Vorschau-/unklare Rechnung NIE zahlbar machen. Die Produktivprüfung muss
  // VOR der Flag-Auswertung greifen.
  for (const row of [TEST_INV, PREVIEW_INV, LEGACY_INV]) {
    assert.equal(payability({ ...row, is_payable: true }).payable, false,
      `${row.invoice_number}: ein fehlerhaftes Serverflag darf nicht durchschlagen`);
    const { is_payable, is_productive, ...bare } = row;
    assert.equal(payability(bare).payable, false,
      `${row.invoice_number}: ohne Serverflags bleibt die Sperre bestehen`);
    assert.equal(payability({ ...row, is_payable: true }).reason, NON_PRODUCTIVE_PAY_NOTE);
  }
});

test("6 — der Bestätigungsdialog benennt die Unwiderruflichkeit", () => {
  assert.equal(PAY_DIALOG.title, "Rechnung als bezahlt markieren?");
  assert.match(PAY_DIALOG.text, /Zahlungsdatum wird gespeichert/);
  assert.match(PAY_DIALOG.text, /kann nicht rückgängig gemacht werden/);
  assert.equal(PAY_DIALOG.confirm, "Als bezahlt markieren");
  // Es gibt bewusst KEINE Gegenaktion — das Backend kennt keinen Endpunkt dafür.
  assert.equal(/Als offen markieren|Zahlung zurücksetzen/.test(viewSrc + detailSrc + listSrc), false,
    "eine Gegenaktion darf nicht angeboten werden");
});

test("7 — Fehlermeldungen sind verständlich und nie der Rohcode", () => {
  assert.equal(payErrorMessage(409, "invoice_not_payable_test_document"), NON_PRODUCTIVE_PAY_NOTE);
  assert.match(payErrorMessage(404, null), /nicht gefunden/);
  assert.match(payErrorMessage(429, null), /Zu viele Admin-Aktionen/);
  assert.match(payErrorMessage(500, null), /konnte nicht als bezahlt markiert werden/);
  assert.equal(payErrorMessage(500, "irgendein_code").includes("irgendein_code"), false);
  // Technische Codes werden gekürzt und nie als Hauptmeldung verwendet.
  assert.equal(technicalCode("x".repeat(300)).length, 121);
  assert.equal(technicalCode(""), "");
  assert.equal(technicalCode(null), "");
});

// ═══ C) Dokument und E-Mail ══════════════════════════════════════════════════

test("8 — der Dokumentzustand ist verständlich benannt", () => {
  assert.equal(documentState({ document_status: "ready" }).label, "PDF bereit");
  assert.equal(documentState({ document_status: "pending_document" }).label, "PDF wird erstellt");
  assert.equal(documentState({ document_status: "generating" }).running, true);
  const failed = documentState({ document_status: "document_failed" });
  assert.equal(failed.label, "PDF-Erstellung fehlgeschlagen");
  assert.equal(failed.failed, true);
  // Unbekannt → grau + Rohwert (kein Raten), fehlend → Strich.
  assert.equal(documentState({ document_status: "cancelled" }).cls, "badge-gray");
  assert.equal(documentState({}).label, "—");
});

test("9 — E-Mail: Test/Vorschau ohne Aktion, sonst statusabhängig", () => {
  const test1 = emailState(TEST_INV);
  assert.equal(test1.action, null, "Test-/Vorschau-Rechnung darf keine Versandaktion anbieten");
  assert.equal(test1.sendable, false);
  assert.equal(test1.blockedReason, NON_PRODUCTIVE_MAIL_NOTE);
  assert.equal(emailState(PREVIEW_INV).action, null);
  // Produktiv: pending → senden, failed → erneut versuchen, sent → resend.
  assert.deepEqual(emailState({ ...PROD_OPEN, email_status: "pending" }).action,
    { kind: "send", label: "Rechnung per E-Mail senden" });
  assert.deepEqual(emailState({ ...PROD_OPEN, email_status: "failed" }).action,
    { kind: "send", label: "Versand erneut versuchen" });
  assert.deepEqual(emailState({ ...PROD_OPEN, email_status: "sent" }).action,
    { kind: "resend", label: "Rechnung erneut senden" });
  // Laufender Versand: keine Aktion, aber als laufend erkennbar.
  const sending = emailState({ ...PROD_OPEN, email_status: "sending" });
  assert.equal(sending.action, null);
  assert.equal(sending.running, true);
  // Ohne fertiges Dokument kein Versand — und ein ehrlicher Text statt „ausstehend".
  const noDoc = emailState({ ...PROD_OPEN, document_status: "pending_document", email_status: "pending" });
  assert.equal(noDoc.action, null);
  assert.equal(noDoc.label, "Versand nach Dokumenterstellung");
  assert.match(noDoc.blockedReason, /erst nach erfolgreicher Dokumenterstellung/);
});

test("10 — Dokument- und Versandmarker bleiben fachlich getrennt", () => {
  const m = invoiceMarkers(PROD_OPEN).map((x) => x.key);
  assert.deepEqual(m, ["document", "email"], "Dokument und Versand sind zwei Marker");
  const test1 = invoiceMarkers(TEST_INV);
  // Im kompakten Listenmarker die kurze, in der Detailkarte die ausführliche Fassung —
  // gleiche Aussage, platzgerecht.
  assert.equal(test1.find((x) => x.key === "email").label, "Kein Kundenversand");
  assert.equal(emailState(TEST_INV).label, "Kein Versand bei Test-/Vorschau-Rechnung");
  assert.ok(invoiceMarkers(TEST_INV).every((m) => m.label.length <= 30), "Listenmarker müssen kompakt bleiben");
  // Die Liste hat dafür KEINE zwei breiten Spalten mehr.
  const headers = (listSrc.match(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g) || [])
    .map((h) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  assert.equal(headers.filter((h) => /E-Mail/i.test(h)).length, 0, "keine eigene E-Mail-Spalte mehr");
});

test("11 — Outcome-Meldungen sind einheitlich und nie vor dem Backend-Erfolg", () => {
  assert.deepEqual(documentOutcomeMessage("generated"), { type: "success", text: SUCCESS_TEXT.documentReady });
  assert.equal(documentOutcomeMessage("in_progress").type, "info");
  assert.equal(documentOutcomeMessage("failed").type, "error");
  assert.equal(documentOutcomeMessage(undefined).type, "error", "unbekanntes Outcome ist kein Erfolg");
  assert.deepEqual(emailOutcomeMessage("sent", "resend"), { type: "success", text: SUCCESS_TEXT.emailResent });
  assert.deepEqual(emailOutcomeMessage("sent", "send"), { type: "success", text: SUCCESS_TEXT.emailStarted });
  assert.equal(emailOutcomeMessage("already_sent").type, "info");
  assert.equal(emailOutcomeMessage(null).type, "error");
  // Die Seite setzt die Erfolgsmeldung erst NACH der Antwort und lädt danach neu.
  // Geprüft wird die REIHENFOLGE im Funktionsrumpf, nicht ein Zeichenabstand: in jeder
  // mutierenden Aktion muss der await-Aufruf VOR jeder Erfolgs-/Infomeldung stehen.
  for (const [fn, call] of [
    ["const confirmPay = async () =>", "await markAdminInvoicePaid(id)"],
    ["const confirmGenerate = async () =>", "await generateAdminInvoiceDocument(id)"],
    ["const confirmMail = async () =>", "await resendAdminInvoiceEmail(id)"],
  ]) {
    const start = detailSrc.indexOf(fn);
    assert.ok(start > -1, `${fn} nicht gefunden`);
    const body = detailSrc.slice(start, detailSrc.indexOf("\n  };", start));
    const awaitAt = body.indexOf(call);
    assert.ok(awaitAt > -1, `${call} fehlt`);
    const setterAt = body.search(/set(Pay|Doc|Mail)Msg\(\s*(\{[^)]*type: "(success|info)"|documentOutcomeMessage|emailOutcomeMessage)/);
    assert.ok(setterAt === -1 || setterAt > awaitAt,
      `${fn}: eine Erfolgs-/Infomeldung steht VOR dem Backendrequest`);
    assert.ok(body.includes("load();"), `${fn}: kein Refetch nach der Aktion`);
  }
});

// ═══ D) Historische Konsistenz ═══════════════════════════════════════════════

test("12 — Rechnungsempfänger stammt aus dem Snapshot, nicht aus den Live-Daten", () => {
  const r = snapshotRecipient(PROD_OPEN);
  assert.equal(r.known, true);
  assert.equal(r.company, "Borner Spedition GmbH (historisch)");
  assert.equal(r.customerNumber, "CE-K-10031");
  // Der Live-Firmenname ist bewusst ein ANDERER — er darf hier nicht auftauchen.
  assert.notEqual(r.company, PROD_OPEN.company_name);
  assert.equal(r.email, "alt@example.com");
  assert.notEqual(r.email, PROD_OPEN.email);
  // Ohne Snapshot wird das ehrlich benannt statt still auf Live-Daten auszuweichen.
  const legacy = snapshotRecipient(LEGACY_INV);
  assert.equal(legacy.known, false);
  assert.equal(legacy.company, "");
  assert.match(SNAPSHOT_MISSING_NOTE, /keine eingefrorenen Empfängerdaten/);
  // snapshotRecipient liest NIE die Live-Felder.
  const fn = viewSrc.slice(viewSrc.indexOf("export function snapshotRecipient"), viewSrc.indexOf("export const SNAPSHOT_MISSING_NOTE"));
  assert.equal(/r\.company_name|r\.name\b|firstDefined\(r\.email\)/.test(fn), false,
    "der Snapshot-Empfänger darf keine aktuellen Stammdaten lesen");
});

test("13 — das aktuelle Kundenkonto ist ein getrennter Bereich", () => {
  const a = currentAccount(PROD_OPEN);
  assert.equal(a.company, "Borner Spedition GmbH");
  assert.equal(a.customerNumber, "CE-K-10031");
  assert.equal(a.linkable, true);
  assert.equal(currentAccount({}).linkable, false);
  // Die Seite trennt beide Karten sichtbar und beschriftet sie eindeutig.
  assert.match(detailSrc, /Rechnungsempfänger zum Zeitpunkt der Rechnung/);
  assert.match(detailSrc, /Aktuelles Kundenkonto/);
  assert.match(detailSrc, /Firma \(aktuell\)/);
  assert.match(detailSrc, /Aktuelles Kundenkonto öffnen/);
  // Die historische Karte wird NICHT aus account.* gespeist.
  const block = detailSrc.slice(detailSrc.indexOf("Rechnungsempfänger zum Zeitpunkt"), detailSrc.indexOf("Aktuelles Kundenkonto<"));
  assert.equal(/account\./.test(block), false, "die historische Karte darf keine Live-Daten zeigen");
});

test("14 — Beträge werden nur angezeigt, nie berechnet", () => {
  const a = amountFields(PROD_OPEN);
  assert.equal(a.net, 41.39);
  assert.equal(a.vat, 7.86);
  assert.equal(a.gross, 49.25);
  assert.equal(a.currency, "EUR");
  assert.equal(a.paymentTerm, 7);
  assert.equal(amountFields({}).currency, "EUR", "Währung fällt auf EUR zurück");
  assert.equal(amountFields({}).net, null);
  // Nirgends wird gerechnet.
  assert.equal(/(net|gross|vat)[^\n]*[*/+-]\s*\d|\*\s*1\.19|\/\s*1\.19/i.test(viewSrc), false, "keine Betragsberechnung");
  assert.equal(/(net|gross|vat)[^\n]*[*/]\s*\d/i.test(detailSrc), false, "keine Betragsberechnung auf der Seite");
});

test("15 — die Sendungsverknüpfung erfindet keine Nummer", () => {
  const s = linkedShipment(PROD_OPEN);
  assert.equal(s.linked, true);
  assert.equal(s.orderNumber, "CE-BS26-00042");
  assert.equal(s.orderNumberKnown, true);
  assert.equal(s.carrier, "ups");
  assert.equal(s.route, "DE → GB");
  assert.equal(s.status, "label_ready");
  // Bestandsrechnung: kein Wert, ehrlicher Text, NIE aus einer ID gebildet.
  const legacy = linkedShipment(LEGACY_INV);
  assert.equal(legacy.linked, false);
  assert.equal(legacy.orderNumberKnown, false);
  assert.equal(SHIPMENT_NO_ORDER_NUMBER, "Bestandsrechnung ohne Bestellnummer");
  assert.equal(SHIPMENT_NO_ORDER_NUMBER.includes("107"), false);
  assert.equal(linkedShipment({ shipment_id: 900 }).orderNumber, "", "ohne Nummer wird keine erfunden");
});

// ═══ E) Liste: Spalten, Kunde, Filter, Responsive ════════════════════════════

test("16 — die Tabelle zeigt genau die sechs Übersichtsspalten", () => {
  const headers = (listSrc.match(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g) || [])
    .map((h) => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim());
  assert.deepEqual(headers, ["Rechnung", "Kunde", "Betrag & Fälligkeit", "Zahlungsstatus", "Dokument & Versand", "Aktion"]);
  // Eindeutige Überschriften — insbesondere nicht zweimal „E-Mail".
  assert.equal(new Set(headers).size, headers.length, "Spaltenüberschriften müssen eindeutig sein");
  const body = listSrc.slice(listSrc.indexOf("<tbody>"), listSrc.indexOf("</tbody>"));
  assert.equal((body.match(/<td[\s>]/g) || []).length, 6, "Zellen müssen zu den Spaltenköpfen passen");
  // Entfernte technische Felder.
  for (const gone of ["User-ID", "Shipment-ID", "MwSt Versand"]) {
    assert.equal(headers.includes(gone), false, `Spalte „${gone}" muss entfallen sein`);
  }
  assert.equal(/adm-idlink/.test(listSrc), false, "der alte ID-Link ist entfallen");
});

test("17 — der Kunde erscheint fachlich, nie als user_id", () => {
  assert.deepEqual(customerCell(PROD_OPEN), { primary: "Borner Spedition GmbH", secondary: "CE-K-10031", known: true });
  assert.deepEqual(customerCell({ name: "A. Muster" }), { primary: "A. Muster", secondary: "", known: true });
  assert.deepEqual(customerCell({ customer_number: "CE-K-9" }), { primary: "CE-K-9", secondary: "", known: true });
  const unknown = customerCell({ user_id: 42 });
  assert.equal(unknown.known, false);
  assert.equal(unknown.primary.includes("42"), false, "die user_id darf nicht als Identität dienen");
  // Die Kunden-E-Mail ist keine Listenspalte mehr (Datenminimierung).
  assert.equal(/emailOf|r\.email\b/.test(listSrc), false, "die Kunden-E-Mail gehört nicht in die Liste");
});

test("18 — nur belegte Backend-Filter; keine erfundene Suche", () => {
  assert.deepEqual(toInvoiceApiFilters(EMPTY_INVOICE_FILTERS), {});
  assert.deepEqual(toInvoiceApiFilters({ status: "unpaid", user_id: " 42 ", overdue: true }),
    { status: "unpaid", user_id: "42", overdue: "true" });
  assert.deepEqual(toInvoiceApiFilters({ overdue: false }), {}, "overdue=false wird nicht gesendet");
  const allowed = new Set(["status", "user_id", "overdue"]);
  for (const k of Object.keys(toInvoiceApiFilters({ status: "paid", user_id: "1", overdue: true }))) {
    assert.ok(allowed.has(k), `unerwarteter Query-Parameter: ${k}`);
  }
  assert.equal(/\b(q|search|query|term)\s*[:=]/.test(viewSrc), false, "keine erfundene Suchschnittstelle");
  assert.match(listSrc, /Es gibt keine Freitextsuche/, "das Fehlen der Suche wird ehrlich benannt");
  // Kunden-ID: numerisch, und als technischer Filter nachgeordnet.
  assert.equal(validateInvoiceFilters({ user_id: "abc" }).valid, false);
  assert.equal(validateInvoiceFilters({ user_id: "42" }).valid, true);
  assert.match(listSrc, /<details className="adm-filter-adv">/);
  assert.match(listSrc, /Technischer Filter/);
});

test("19 — aktive Filter sind sichtbar und zurücksetzbar; kein Doppel-Request", () => {
  assert.equal(hasActiveInvoiceFilters(EMPTY_INVOICE_FILTERS), false);
  assert.equal(hasActiveInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, overdue: true }), true);
  const chips = activeInvoiceFilterChips({ status: "unpaid", overdue: true, user_id: "42" });
  assert.deepEqual(chips.map((c) => c.key), ["status", "overdue", "user_id"]);
  assert.equal(chips[1].label, "Nur überfällige Forderungen");
  assert.match(listSrc, /const v = validateInvoiceFilters\(draft\);\s*if \(!v\.valid\) \{ setFilterError\(v\.error\); return; \}/);
  assert.match(listSrc, /setPage\(1\);\s*setApplied\(draft\);/);
  assert.match(listSrc, /className="btn btn-primary btn-sm" disabled=\{loading\}/);
  assert.match(listSrc, /Filter zurücksetzen/);
});

test("20 — kein horizontales Scrollen: relative Spaltenbreiten, kein min-width", () => {
  assert.match(cssSrc, /\.adm-inv-table table \{ min-width: 0; table-layout: fixed; \}/);
  const widths = cssSrc.match(/\.adm-inv-table th:nth-child\(\d\)[^{]*\{ width: (\d+)%; \}/g) || [];
  assert.equal(widths.length, 6, "alle sechs Spalten haben relative Breiten");
  const sum = widths.map((w) => Number(w.match(/(\d+)%/)[1])).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100, `Spaltenbreiten müssen 100 % ergeben, sind ${sum}`);
  // Kein Scroll-Wrapper mehr um die Rechnungstabelle.
  assert.equal(/adm-inv-table[\s\S]{0,120}table-scroll/.test(listSrc), false);
  // Lange Rechnungsnummern brechen kontrolliert und werden NIE gekürzt.
  assert.match(cssSrc, /\.adm-inv-no \{[^}]*overflow-wrap: anywhere;/);
  assert.equal(/slice\(0,\s*\d+\)|substring\(|…["`]/.test(listSrc), false, "die Rechnungsnummer darf nicht gekürzt werden");
});

test("21 — mobile Kartenansicht ersetzt die Tabelle", () => {
  assert.match(listSrc, /<ul className="adm-inv-cards">/);
  for (const m of [/<dt>Kunde<\/dt>/, /<dt>Betrag &amp; Fälligkeit<\/dt>/, /<dt>Dokument &amp; Versand<\/dt>/]) {
    assert.match(listSrc, m);
  }
  assert.match(listSrc, /<div className="adm-scard-head">\s*<InvoiceCell row=\{row\} \/>\s*<StatusCell row=\{row\} now=\{now\} \/>/);
  assert.match(cssSrc, /@media \(max-width: 900px\) \{[\s\S]*?\.adm-inv-table \{ display: none; \}/);
  assert.match(cssSrc, /\.adm-inv-cards \{ display: none;/);
});

// ═══ F) Detailseite ══════════════════════════════════════════════════════════

test("22 — der Kopfbereich hat ein echtes <h1> und genau eine Statusanzeige", () => {
  assert.match(detailSrc, /<h1 className="adm-detail-id">Rechnung \{number\}<\/h1>/);
  // Genau EIN Zahlungsstatus-Badge auf der Seite (kein doppeltes wie zuvor).
  assert.equal((detailSrc.match(/\{status\.label\}/g) || []).length, 1, "der Zahlungsstatus darf nur einmal erscheinen");
  assert.match(detailSrc, /\{mode\.label\}/);
  // Nicht produktive Rechnungen tragen den Hinweis im Kopf.
  assert.match(detailSrc, /\{!productive && \(/);
  assert.match(detailSrc, /NON_PRODUCTIVE_NOTE/);
});

test("23 — die Zahlungsaktion ist bei Test/Vorschau gesperrt und begründet", () => {
  assert.match(detailSrc, /\{pay\.payable \? \(/);
  assert.match(detailSrc, /disabled\s*\n?\s*aria-describedby="adm-pay-blocked"/);
  assert.match(detailSrc, /<p className="adm-support-hint" id="adm-pay-blocked">\{pay\.reason\}<\/p>/);
  assert.match(detailSrc, /PAY_DIALOG\.title/);
  assert.match(detailSrc, /PAY_DIALOG\.text/);
});

test("24 — technische Informationen liegen eingeklappt in einem nativen <details>", () => {
  assert.match(detailSrc, /<details className="adm-card adm-tech">/);
  for (const k of ["Rechnungs-ID (intern)", "Kunden-ID (intern)", "Sendungs-ID (intern)",
                   "document_mode (roh)", "is_test_document", "Provider-Message-ID"]) {
    assert.ok(detailSrc.includes(k), `technisches Feld „${k}" fehlt`);
  }
  // Rohe Fehlertexte erscheinen NUR gekürzt und nur hier.
  assert.match(detailSrc, /technicalCode\(docLastErrorOf\(inv\)\)/);
  assert.match(detailSrc, /technicalCode\(emailLastErrorOf\(inv\)\)/);
  const tech = detailSrc.slice(detailSrc.indexOf("adm-tech-summary"));
  const beforeTech = detailSrc.slice(0, detailSrc.indexOf("adm-tech-summary"));
  assert.equal(/emailLastErrorOf\(inv\)/.test(beforeTech), false, "der rohe Versandfehler gehört nicht in den Normalbereich");
  assert.ok(tech.includes("emailLastErrorOf(inv)"));
});

test("25 — Lade-, Fehler-, Leer- und 404-Zustände sind eindeutig und wiederholbar", () => {
  // Liste
  assert.match(listSrc, /Rechnungen werden geladen…/);
  assert.match(listSrc, /<div className="loading-center" role="status" aria-live="polite">/);
  assert.match(listSrc, /<div className="alert alert-error" role="alert">/);
  assert.match(listSrc, /Erneut versuchen/);
  const none = invoiceEmptyState({ count: 0, filters: EMPTY_INVOICE_FILTERS });
  assert.equal(none.title, "Noch keine Rechnungen vorhanden.");
  const noHit = invoiceEmptyState({ count: 0, filters: { ...EMPTY_INVOICE_FILTERS, overdue: true } });
  assert.equal(noHit.title, "Für diese Filter wurden keine Rechnungen gefunden.");
  assert.equal(invoiceEmptyState({ count: 3 }).show, false);
  // Detail
  const nf = invoiceDetailError(404);
  assert.equal(nf.notFound, true);
  assert.equal(nf.text, "Die Rechnung wurde nicht gefunden.");
  assert.equal(invoiceDetailError(500).retryable, true);
  assert.equal(invoiceDetailError(401), null);
  assert.equal(invoiceDetailError(403), null);
  assert.match(detailSrc, /Erneut versuchen/);
  assert.match(detailSrc, /<Link className="btn btn-outline btn-sm" to="\/admin\/invoices">Zurück zur Rechnungsliste<\/Link>/);
  assert.equal(/\.stack|JSON\.stringify\(\s*(err|error)\b/.test(detailSrc), false, "keine technischen Details an den Nutzer");
});

// ═══ G) Dialog, Sicherheit, Regression, Selbsttest ═══════════════════════════

test("26 — der zentrale ConfirmDialog erfüllt Fokus, Escape und Doppelklickschutz", () => {
  assert.match(dialogSrc, /cancelRef\.current\?\.focus\(\)/, "Fokus beim Öffnen auf Abbrechen");
  assert.match(dialogSrc, /e\.key === "Escape" && !busy/, "Escape schließt, außer während des Requests");
  assert.match(dialogSrc, /openerRef\.current\?\.focus\?\.\(\)/, "Fokus kehrt zum Auslöser zurück");
  assert.match(dialogSrc, /role="dialog"/);
  assert.match(dialogSrc, /aria-modal="true"/);
  assert.match(dialogSrc, /aria-labelledby=\{titleId\}/);
  assert.match(dialogSrc, /aria-describedby=\{descId\}/);
  assert.equal((dialogSrc.match(/disabled=\{busy\}/g) || []).length, 2, "beide Buttons sind während des Requests gesperrt");
  // Alle drei mutierenden Aktionen der Detailseite nutzen diesen einen Dialog.
  assert.equal((detailSrc.match(/<ConfirmDialog\b/g) || []).length, 3, "Zahlung, Dokument und E-Mail nutzen den zentralen Dialog");
  assert.equal(/adm-modal-overlay/.test(detailSrc), false, "kein handgebautes Modal mehr auf der Seite");
});

test("27 — kein Logging, kein Tokenzugriff, keine rohen Backendobjekte", () => {
  const stripAllComments = (src) => stripComments(src).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const rel of ["utils/adminInvoiceView.mjs", "pages/admin/AdminInvoicesPage.jsx",
                     "pages/admin/AdminInvoiceDetailPage.jsx", "components/admin/ConfirmDialog.jsx"]) {
    const code = stripAllComments(read(rel));
    assert.equal(/console\.(log|info|warn|error|debug|table|dir)\s*\(/.test(code), false, `${rel}: kein Logging`);
    for (const bad of ["ce_token", "localStorage", "sessionStorage", "document.cookie", "dangerouslySetInnerHTML"]) {
      assert.equal(code.includes(bad), false, `${rel}: ${bad} darf nicht vorkommen`);
    }
    assert.equal(/JSON\.stringify\(\s*(err|error|d|inv|row)\b/.test(code), false, `${rel}: kein rohes Objekt im DOM`);
  }
});

test("28 — andere Adminmodule und Verträge bleiben unberührt", () => {
  for (const rel of [
    "pages/admin/AdminUsersPage.jsx", "pages/admin/AdminUserDetailPage.jsx",
    "pages/admin/AdminShipmentsPage.jsx", "pages/admin/AdminShipmentDetailPage.jsx",
    "pages/admin/AdminCancellationRequestsPage.jsx", "pages/admin/AdminBackfillPage.jsx",
    "components/dashboard/InvoicesList.jsx",
  ]) {
    assert.equal(/adminInvoiceView/.test(read(rel)), false, `${rel} darf davon nichts wissen`);
  }
  const api = stripComments(read("api/adminApi.js"));
  assert.match(api, /export function listAdminInvoices/);
  assert.match(api, /export function getAdminInvoice\(id\)/);
  assert.match(api, /apiFetch\(`\/admin\/invoices\/\$\{encodeURIComponent\(id\)\}\/paid`/);
  assert.equal(/["'`]\/api\/admin\//.test(api), false, "kein /api-Präfix");
  // Der Kunden-Downloadpfad bleibt unverändert.
  assert.match(stripComments(read("utils/downloadInvoicePdf.js")), /export async function downloadAdminInvoicePdf/);
});

test("29 — Selbsttest: die Prüflogik greift tatsächlich", () => {
  for (const [label, src] of [["liste", listSrc], ["detail", detailSrc], ["modul", viewSrc], ["dialog", dialogSrc]]) {
    assert.ok(src.length > 800, `${label}: Quelle wirkt leer (${src.length} Zeichen)`);
  }
  assert.ok(cssSrc.length > 5000, "Stylesheet wirkt leer");
  assert.match(stripComments('const a = 1; // Offen\nconst b = "Offen";'), /const b = "Offen"/);
  const stripAll = (src) => stripComments(src).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.equal(/localStorage/.test(stripAll('setX(false); // kein Merken (localStorage)')), false);
  assert.match(stripAll('const u = "https://example.com/x";'), /https:\/\/example\.com/);
  // Kernaussagen sind keine Tautologien: produktiv und nicht produktiv verhalten sich verschieden.
  assert.notEqual(paymentStatus(PROD_OPEN).label, paymentStatus(TEST_INV).label);
  assert.notEqual(payability(PROD_OPEN).payable, payability(TEST_INV).payable);
  assert.notEqual(isInvoiceOverdue(PROD_OVERDUE), isInvoiceOverdue({ ...TEST_INV, due_date: "2020-01-01" }));
  assert.notEqual(invoiceMode(TEST_INV), invoiceMode(PREVIEW_INV));
  assert.notEqual(snapshotRecipient(PROD_OPEN).company, currentAccount(PROD_OPEN).company);
  assert.equal(('<th scope="col">A</th><th scope="col">B</th>'.match(/<th scope="col"/g) || []).length, 2);
});
