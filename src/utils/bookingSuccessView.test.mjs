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
  BOOKING_CONFIRMATION_LINE, INVOICE_AUTOCREATE_LINE,
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
  assert.ok(src.includes('from "../utils/bookingSuccessView.mjs"'), "importiert die reine Erfolgslogik");
  assert.ok(src.includes("BOOKING_CONFIRMATION_LINE") && src.includes("INVOICE_AUTOCREATE_LINE"), "zeigt beide getrennten Zeilen");
  assert.ok(src.includes("invoiceDeliveryHint(invoiceDeliveryMode)"), "rendert den modus-spezifischen Hinweis");
  assert.ok(src.includes("navigate(INVOICES_DASHBOARD_TARGET)"), "Zu-meinen-Rechnungen oeffnet den Rechnungsbereich");
  assert.ok(/Zu meinen Rechnungen/.test(src) && /Zu meinen Sendungen/.test(src), "beide Aktionen vorhanden");
  assert.ok(hookSrc.includes("resolveInvoiceDeliveryMode(findInvoiceByNumber"), "Modus aus Serverwahrheit der erzeugten Rechnung");
  // keine ambige Alt-Formulierung mehr, die Bestätigung und Rechnung vermischt
  assert.ok(!src.includes("Bestätigung wurde an") && !hookSrc.includes("Bestätigung wurde an"),
    "alte, verwechselbare Formulierung entfernt");
});
