// Tests für die reine Erfolgsscreen-Logik nach Buchung (Auftragsbestätigung ≠ Rechnungs-E-Mail,
// Rechnungs-Deep-Link, Modus-Ableitung + Hinweise). Läuft über `node --test` (npm test). Kein
// React-Render (das Repo hat keine Render-Testinfrastruktur) → Verhalten wird über reine Funktionen
// plus einen Quelltext-Vertrag auf BookingPage.jsx abgesichert.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buchungsFlaeche } from "../testing/quelltext.mjs";
import {
  INVOICE_DELIVERY_MODE, INVOICES_DASHBOARD_PAGE, INVOICES_DASHBOARD_TARGET, SHIPMENTS_DASHBOARD_TARGET,
  findInvoiceByNumber, resolveInvoiceDeliveryMode, isTerminalDeliveryMode, invoiceDeliveryHint,
  BOOKING_CONFIRMATION_LINE, INVOICE_AUTOCREATE_LINE, BOOKING_AMOUNT_MISSING_HINT,
  DOCUMENT_WORDING, resolveDocumentWording, bookingDocumentWording, hintAlertClass, bookingDocumentNotice,
} from "./bookingSuccessView.mjs";

// ── Trennung Auftragsbestätigung ↔ Rechnung ──────────────────────────────────
test("1 — Auftragsbestätigung und Rechnung werden getrennt und unterschiedlich formuliert", () => {
  assert.match(BOOKING_CONFIRMATION_LINE, /Auftragsbestätigung/);
  assert.match(BOOKING_CONFIRMATION_LINE, /versendet/);
  assert.match(INVOICE_AUTOCREATE_LINE, /Rechnung/);
  assert.match(INVOICE_AUTOCREATE_LINE, /Rechnungen/); // verweist auf den Reiter
  assert.notEqual(BOOKING_CONFIRMATION_LINE, INVOICE_AUTOCREATE_LINE);
  // die Auftragsbestätigungszeile behauptet NICHT, die Rechnung sei per E-Mail versendet worden
  assert.doesNotMatch(BOOKING_CONFIRMATION_LINE, /Rechnung/);
  // /book löst den Mailversand nur AN (triggerOrderConfirmationEmailAsync, fire-and-forget) und
  // wartet nicht auf eine bestätigte Zustellung — die Zeile darf deshalb nie das abgeschlossene
  // Perfekt "wurde ... versendet" behaupten, nur das laufende Präsens.
  assert.doesNotMatch(BOOKING_CONFIRMATION_LINE, /wurde[^.]*versendet/);
});

// ── Deep-Link „Zu meinen Rechnungen" ─────────────────────────────────────────
test("2 — Rechnungs-Deep-Link nutzt den bestehenden Dashboard-?page=-Mechanismus", () => {
  assert.equal(INVOICES_DASHBOARD_PAGE, "invoices");
  assert.equal(INVOICES_DASHBOARD_TARGET, "/dashboard?page=invoices");
  assert.equal(SHIPMENTS_DASHBOARD_TARGET, "/dashboard?page=shipments");
});

// ── Modus-Ableitung aus der Serverwahrheit ───────────────────────────────────
test("3 — resolveInvoiceDeliveryMode spiegelt is_test_document/document_status", () => {
  // produktiv: ready + is_test_document === false
  assert.equal(resolveInvoiceDeliveryMode({ document_status: "ready", is_test_document: false }), INVOICE_DELIVERY_MODE.PRODUCTION);
  // interne Vorschau: ready + is_test_document true ODER NULL (konservativ Test)
  assert.equal(resolveInvoiceDeliveryMode({ document_status: "ready", is_test_document: true }), INVOICE_DELIVERY_MODE.TEST);
  assert.equal(resolveInvoiceDeliveryMode({ document_status: "ready", is_test_document: null }), INVOICE_DELIVERY_MODE.TEST);
  // fehlgeschlagen
  assert.equal(resolveInvoiceDeliveryMode({ document_status: "document_failed" }), INVOICE_DELIVERY_MODE.FAILED);
  // noch in Arbeit / unbekannt / kein Datensatz → PENDING (nie irreführend)
  assert.equal(resolveInvoiceDeliveryMode({ document_status: "pending_document" }), INVOICE_DELIVERY_MODE.PENDING);
  assert.equal(resolveInvoiceDeliveryMode({ document_status: "generating" }), INVOICE_DELIVERY_MODE.PENDING);
  assert.equal(resolveInvoiceDeliveryMode(null), INVOICE_DELIVERY_MODE.PENDING);
  assert.equal(resolveInvoiceDeliveryMode({}), INVOICE_DELIVERY_MODE.PENDING);
});

test("4 — isTerminalDeliveryMode: produktiv/Test/fehlgeschlagen sind endgültig, pending nicht", () => {
  assert.equal(isTerminalDeliveryMode(INVOICE_DELIVERY_MODE.PRODUCTION), true);
  assert.equal(isTerminalDeliveryMode(INVOICE_DELIVERY_MODE.TEST), true);
  assert.equal(isTerminalDeliveryMode(INVOICE_DELIVERY_MODE.FAILED), true);
  assert.equal(isTerminalDeliveryMode(INVOICE_DELIVERY_MODE.PENDING), false);
});

test("5 — findInvoiceByNumber findet exakt per invoice_number, tolerant bei leer/fehlt", () => {
  const list = [{ invoice_number: "2026-00001" }, { invoice_number: "2026-00002", is_test_document: false, document_status: "ready" }];
  assert.equal(findInvoiceByNumber(list, "2026-00002").document_status, "ready");
  assert.equal(findInvoiceByNumber(list, "2026-09999"), null);
  assert.equal(findInvoiceByNumber(null, "x"), null);
  assert.equal(findInvoiceByNumber(list, null), null);
  assert.equal(findInvoiceByNumber(list, ""), null);
});

// ── Modus-Hinweise (Produktiv- vs. Testmodus KORREKT) ────────────────────────
test("6 — Produktivmodus-Hinweis: Rechnung wird SEPARAT per E-Mail versendet", () => {
  const h = invoiceDeliveryHint(INVOICE_DELIVERY_MODE.PRODUCTION);
  assert.equal(h.tone, "success");
  assert.match(h.text, /E-Mail/);
  assert.match(h.text, /separat|zusätzlich/);
  assert.doesNotMatch(h.text, /keine Rechnungs-E-Mail/i);
});

test("7 — Testmodus-Hinweis: nur interne Vorschau, KEINE Rechnungs-E-Mail", () => {
  const h = invoiceDeliveryHint(INVOICE_DELIVERY_MODE.TEST);
  assert.match(h.text, /interne Vorschau/i);
  assert.match(h.text, /keine Rechnungs-E-Mail/i);
});

test("8 — Pending-/Failed-Hinweis ist neutral und nie irreführend", () => {
  const p = invoiceDeliveryHint(INVOICE_DELIVERY_MODE.PENDING);
  assert.match(p.text, /wird derzeit erstellt|Rechnungen/);
  assert.doesNotMatch(p.text, /per E-Mail versendet/); // behauptet noch keinen Versand
  const f = invoiceDeliveryHint(INVOICE_DELIVERY_MODE.FAILED);
  assert.match(f.text, /nicht erstellt/);
  assert.match(f.text, /Buchung ist davon unberührt|nachgereicht/);
});

test("9 — unbekannter Modus fällt sicher auf den neutralen PENDING-Hinweis zurück", () => {
  assert.deepEqual(invoiceDeliveryHint("irgendwas"), invoiceDeliveryHint(INVOICE_DELIVERY_MODE.PENDING));
});

// ── Quelltext-Vertrag: BookingPage.jsx verdrahtet die neue Erfolgslogik ───────
// (kompensiert das Fehlen einer React-Render-Testinfrastruktur)
test("10 — BookingPage verdrahtet Trennung, Deep-Link und Modus-Hinweis", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = buchungsFlaeche();
  // Der Zustellmodus-Poll lebt seit der Modularisierung im eigenen Hook.
  const hookSrc = fs.readFileSync(path.join(here, "../hooks/useInvoiceDeliveryMode.js"), "utf8");
  // Der Importpfad wird TIEFENUNABHÄNGIG geprüft. Die frühere Fassung verlangte wörtlich
  // `from "../utils/bookingSuccessView.mjs"` — also genau die Verschachtelungstiefe von
  // `pages/`. Seit der Erfolgsbildschirm in `components/booking/` liegt, lautet sein Import
  // `"../../utils/…"`; die Zusage bestand nur noch, weil in BookingPage.jsx eine TOTE
  // Importzeile aus der alten Tiefe stehen geblieben war. Sie maß damit die Dateiablage,
  // nicht die Verdrahtung.
  assert.match(src, /from "(?:\.\.\/)+utils\/bookingSuccessView\.mjs"/,
    "importiert die reine Erfolgslogik");
  // Auftrag 2 / P2: die Belegworte kommen aus `bookingDocumentWording` (Rechnung / Testdokument / neutral),
  // die Bestätigungszeile bleibt die feste, davon getrennte Zeile. Phase 1 (Variante A): Erstellungszeile und
  // Modus-Hinweis sind EIN Hinweis (`bookingDocumentNotice`, unten fachlich geprüft) — getrennt von der Bestätigungszeile.
  assert.ok(src.includes("BOOKING_CONFIRMATION_LINE") && src.includes("bookingDocumentNotice(booking, invoiceDeliveryMode)"),
    "zeigt Bestätigungszeile und Belegphasen-Hinweis getrennt");
  assert.ok(src.includes("bookingDocumentWording(booking, invoiceDeliveryMode)"), "leitet die Belegworte aus Buchung und Beleg ab");
  // Auf dem Erfolgsbildschirm selbst steht keine feste Rechnungszusage mehr — Nummernlabel, Belegphasen-Hinweis,
  // Betragsverweis und Knopf kommen aus der Belegart der Buchung.
  const erfolg = fs.readFileSync(path.join(here, "../components/booking/BookingSuccessStep.jsx"), "utf8");
  assert.ok(!erfolg.includes("INVOICE_AUTOCREATE_LINE") && !erfolg.includes("NUMBER_LABELS.invoice")
    && !/Zu meinen Rechnungen/.test(erfolg) && !erfolg.includes("{betrag.hint}"),
    "eine feste Rechnungszusage steht noch auf dem Erfolgsbildschirm");
  for (const stelle of ["wording.numberLabel", "{hinweis.text}", "wording.amountMissingHint", "wording.documentsButton"]) {
    assert.ok(erfolg.includes(stelle), `${stelle} wird nicht gerendert`);
  }
  // Der modus-spezifische Satz entsteht in der reinen Logik (Fehlschlag, interne Vorschau) — nie in der Oberfläche.
  const viewSrc = fs.readFileSync(path.join(here, "bookingSuccessView.mjs"), "utf8");
  assert.ok(viewSrc.includes("invoiceDeliveryHint(M.FAILED)") && viewSrc.includes("invoiceDeliveryHint(M.TEST)"),
    "der Belegphasen-Hinweis nutzt die modus-spezifischen Sätze nicht");
  assert.ok(src.includes("navigate(INVOICES_DASHBOARD_TARGET)"), "der Belegknopf oeffnet den Rechnungsbereich");
  assert.ok(/wording\.documentsButton/.test(src) && /onShipments=\{zuSendungen\}/.test(src), "beide Aktionen vorhanden");
  assert.ok(hookSrc.includes("resolveInvoiceDeliveryMode(findInvoiceByNumber"), "Modus aus Serverwahrheit der erzeugten Rechnung");
  // keine ambige Alt-Formulierung mehr, die Bestätigung und Rechnung vermischt
  assert.ok(!src.includes("Bestätigung wurde an") && !hookSrc.includes("Bestätigung wurde an"),
    "alte, verwechselbare Formulierung entfernt");
});

// ── Canonical v2.60: Testdokument der internen Testphase ──────────────────────────
test("TP — Testphase: eigener, endgültiger Modus mit wahrheitsgemäßem Hinweis (Belegmail wird versendet)", () => {
  const inv = { document_status: "ready", is_test_document: true, invoice_test_phase: true };
  assert.equal(resolveInvoiceDeliveryMode(inv), INVOICE_DELIVERY_MODE.TEST_PHASE);
  assert.equal(isTerminalDeliveryMode(INVOICE_DELIVERY_MODE.TEST_PHASE), true);
  const h = invoiceDeliveryHint(INVOICE_DELIVERY_MODE.TEST_PHASE);
  assert.equal(h.tone, "warning");
  assert.match(h.text, /Testdokument/);
  assert.match(h.text, /keine Rechnung/);
  assert.match(h.text, /keine Zahlungsforderung/);
  assert.match(h.text, /per E-Mail/);
  // Nur ein echtes true zählt; ohne Kennzeichen bleibt es die interne Vorschau.
  assert.equal(resolveInvoiceDeliveryMode({ ...inv, invoice_test_phase: "true" }), INVOICE_DELIVERY_MODE.TEST);
  // Eine produktive Rechnung bleibt produktiv, auch wenn das Feld (fälschlich) mitkäme.
  assert.equal(resolveInvoiceDeliveryMode({ document_status: "ready", is_test_document: false, invoice_test_phase: true }),
    INVOICE_DELIVERY_MODE.PRODUCTION);
});

// ── Auftrag 2 / P2 (Analysebefund C2): keine Rechnungszusage neben „keine Rechnung“ ──────────
test("P2a — Testphase aus der eingefrorenen Buchungsphase: Testbelegnummer, Testdokument, Belege — sofort, noch ohne Beleg", () => {
  const w = bookingDocumentWording({ invoicingPhase: "test_phase" }, INVOICE_DELIVERY_MODE.PENDING);
  assert.equal(resolveDocumentWording({ invoicingPhase: "test_phase" }, INVOICE_DELIVERY_MODE.PENDING), DOCUMENT_WORDING.TEST_PHASE);
  assert.equal(w.numberLabel, "Testbelegnummer");
  assert.match(w.autocreateLine, /Testdokument/);
  assert.match(w.autocreateLine, /keine Rechnung/);
  assert.doesNotMatch(w.autocreateLine, /Ihre Rechnung/);
  assert.match(w.amountMissingHint, /Testdokument/);
  assert.doesNotMatch(w.amountMissingHint, /Rechnung\./);
  assert.equal(w.documentsButton, "Zu meinen Belegen");
});

test("P2b — Testphase aus dem erzeugten Beleg (älterer Server ohne Phase in der Antwort): dieselben Worte", () => {
  const w = bookingDocumentWording({ invoiceNumber: "CE-TEST-RE26-00007" }, INVOICE_DELIVERY_MODE.TEST_PHASE);
  assert.equal(w.numberLabel, "Testbelegnummer");
  assert.equal(w.documentsButton, "Zu meinen Belegen");
});

test("P2c — reguläre Rechnung: unveränderte Worte (Rechnungsnummer, Rechnung wird erstellt, Zu meinen Rechnungen)", () => {
  for (const [booking, mode] of [
    [{ invoicingPhase: "regular" }, INVOICE_DELIVERY_MODE.PENDING],
    [{ invoicingPhase: "regular" }, INVOICE_DELIVERY_MODE.PRODUCTION],
    [{}, INVOICE_DELIVERY_MODE.PRODUCTION],
    [{}, INVOICE_DELIVERY_MODE.TEST], // Sandbox-Vorschau: der Hinweis sagt „Vorschau“, die Belegart bleibt Rechnung
  ]) {
    const w = bookingDocumentWording(booking, mode);
    assert.equal(w.numberLabel, "Rechnungsnummer", JSON.stringify([booking, mode]));
    assert.equal(w.autocreateLine, INVOICE_AUTOCREATE_LINE);
    assert.equal(w.amountMissingHint, BOOKING_AMOUNT_MISSING_HINT);
    assert.equal(w.documentsButton, "Zu meinen Rechnungen");
  }
});

test("P2d — ohne Phase und ohne Beleg bleibt die Seite neutral: „Beleg“, weder Rechnung noch Testdokument versprochen", () => {
  for (const [booking, mode] of [[{}, INVOICE_DELIVERY_MODE.PENDING], [null, undefined], [{ invoicingPhase: "unbekannt" }, INVOICE_DELIVERY_MODE.FAILED]]) {
    const w = bookingDocumentWording(booking, mode);
    assert.equal(w.numberLabel, "Belegnummer", JSON.stringify([booking, mode]));
    assert.doesNotMatch(w.autocreateLine, /Rechnung wird|Testdokument/);
    assert.match(w.autocreateLine, /Beleg/);
    assert.equal(w.documentsButton, "Zu meinen Belegen");
  }
});

// F3 (Premium-Redesign Etappe 1): Jeder Ton des Hinweises hat seine eigene Meldungsklasse; der Warnton der
// Testphase erscheint als Warnung statt als Info.
test("F3 — hintAlertClass: Warnton als Warnung, unbekannter Ton ruhig als Info", () => {
  assert.equal(hintAlertClass("success"), "alert-success");
  assert.equal(hintAlertClass("warning"), "alert-warning");
  assert.equal(hintAlertClass("error"), "alert-error");
  assert.equal(hintAlertClass("info"), "alert-info");
  assert.equal(hintAlertClass("unbekannt"), "alert-info");
  assert.equal(hintAlertClass(undefined), "alert-info");
  for (const mode of Object.values(INVOICE_DELIVERY_MODE)) {
    const { tone } = invoiceDeliveryHint(mode);
    if (tone !== "info") assert.notEqual(hintAlertClass(tone), "alert-info", `Ton ${tone} fällt auf Info zurück`);
  }
  const hier = path.dirname(fileURLToPath(import.meta.url));
  const erfolg = fs.readFileSync(path.join(hier, "../components/booking/BookingSuccessStep.jsx"), "utf8");
  assert.match(erfolg, /className=\{`alert \$\{hintAlertClass\(hinweis\.tone\)\}`\}/, "der Erfolg nutzt die Tonzuordnung nicht");
});

// ── Phase 1 (Variante A, Canonical v2.117): EIN Hinweis zur Belegphase ─────────────────────────────────────────────
test("P1 — bookingDocumentNotice: ein Satz je Belegphase, alle rechtlich nötigen Aussagen bleiben", () => {
  const M = INVOICE_DELIVERY_MODE;
  // Testphase: „Testdokument – keine Rechnung" UND „keine Zahlungsforderung" in demselben Satz, warm (Warnton).
  for (const mode of [M.PENDING, M.TEST_PHASE]) {
    const h = bookingDocumentNotice({ invoicingPhase: "test_phase" }, mode);
    assert.equal(h.tone, "warning");
    assert.match(h.text, /Interner Testbetrieb/);
    assert.match(h.text, /Testdokument – keine Rechnung/);
    assert.match(h.text, /keine Zahlungsforderung/);
    assert.doesNotMatch(h.text, /Rechnungsnummer|Ihre Rechnung wird|auf Ihrer Rechnung/);
  }
  const tpFehler = bookingDocumentNotice({ invoicingPhase: "test_phase" }, M.FAILED);
  assert.match(tpFehler.text, /Testdokument – keine Rechnung/);
  assert.match(tpFehler.text, /Ihre Buchung ist davon unberührt/);
  // Regulär: Erstellung und PDF-Mail in einem Satz; vor dem Beleg die neutrale Erstellungszeile.
  const regulaer = bookingDocumentNotice({ invoicingPhase: "regular" }, M.PRODUCTION);
  assert.equal(regulaer.tone, "success");
  assert.match(regulaer.text, /Ihre Rechnung wird automatisch erstellt/);
  assert.match(regulaer.text, /zusätzlich separat als PDF/);
  assert.equal(bookingDocumentNotice({ invoicingPhase: "regular" }, M.PENDING).text, bookingDocumentWording({ invoicingPhase: "regular" }).autocreateLine);
  assert.deepEqual(bookingDocumentNotice({ invoicingPhase: "regular" }, M.TEST), invoiceDeliveryHint(M.TEST));
  assert.equal(bookingDocumentNotice({ invoicingPhase: "regular" }, M.FAILED).text, invoiceDeliveryHint(M.FAILED).text);
  // Sammelabrechnung: ihr Satz, keine Belegnummer, keine Rechnungszusage für DIESE Sendung.
  const sammel = bookingDocumentNotice({ billingMode: "consolidated_7d", invoicingPhase: "regular" }, M.PENDING);
  assert.match(sammel.text, /Sammelrechnung/);
  // Älterer Server ohne Phase und ohne Beleg: neutral, weder Rechnung noch Testdokument behauptet.
  const neutral = bookingDocumentNotice({}, M.PENDING);
  assert.doesNotMatch(neutral.text, /Rechnung wird|Testdokument/);
  assert.match(bookingDocumentNotice({}, M.FAILED).text, /Ihre Buchung ist davon unberührt/);
});

test("P2e — der Beleg entscheidet gegen eine widersprüchliche Phase nie zugunsten einer Rechnungszusage", () => {
  // Phase „regular“ in der Antwort, Beleg aber Testdokument der Testphase: das Testdokument gewinnt.
  const w = bookingDocumentWording({ invoicingPhase: "regular" }, INVOICE_DELIVERY_MODE.TEST_PHASE);
  assert.equal(w.numberLabel, "Testbelegnummer");
});
