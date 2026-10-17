// E2E: Auftrag 2 / P1 (2026-10-17) — manuell erstellte Rechnungen im Adminbereich.
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — es entsteht keine echte Rechnung, keine Nummer, keine E-Mail.
// Die Summen des Mocks sind bewusst „unrund" gewählt: die Seite muss die Serverzahlen zeigen, nicht eigene.
//
//   A  Rechnungsliste: „Neue Rechnung erstellen", offene Entwürfe, externe Firma mit „Manuell", „Storniert"
//   B  Neuer Entwurf (extern): Maschinenform im Request, Adresse wechselt auf den Entwurf, Serversummen
//   C  Unzulässige Eingabe: Fehler an der Position, kein Request
//   D  Ausstellen gesperrt: Gründe vom Server am Knopf; ungespeicherte Änderung sperrt Vorschau und Ausstellen
//   E  Ausstellen: Bestätigung, Doppelklick = EIN Request, Meldung „keine E-Mail", kein Versandaufruf
//   F  Bestehender Kunde: Suche, Auswahl belegt die Rechnungsanschrift vor, Request mit recipientUserId
//   G  Vorschau „Entwurf – keine Rechnung" mit Drucken
//   H  Rechnungsdetail: Stornovermerk mit Pflichtangaben, genau ein Request; Versanddialog nennt den Empfänger
//   I  390 px: kein horizontaler Überlauf im Editor
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5286, BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress", name: "Anna Admin",
  role: "admin", status: "approved", country: "DE" };
const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

let server, browser;

const SPERRE_SCHALTER = { code: "MANUAL_INVOICE_ISSUE_DISABLED", message: "Das Ausstellen manueller Rechnungen ist nicht freigeschaltet." };

function entwurf(id, ueber = {}) {
  return {
    id, status: "draft", revision: 1, recipientUserId: null, recipientKind: "external", recipientAccount: null,
    recipient: { company: "Elbufer Handel OHG", name: "Tom Krüger", email: "rechnung@elbufer-handel.example", vatId: null,
      street: "Elbchaussee 7", zip: "22763", city: "Hamburg", country: "DE" },
    positions: [{ description: "Beratung", details: null, unit: "Std.", quantity: "1.5", unitPriceNetCents: 8000, discountPercent: "0" }],
    serviceDateFrom: "2026-10-15", serviceDateTo: null, customerReference: null, paymentTermDays: 7,
    introText: null, closingText: null, paymentNote: null, taxCase: "domestic_standard",
    totals: { netCents: 12345, vatCents: 2346, grossCents: 14691, vatRatePercent: 19, lines: [{ netCents: 12345, vatCents: 2346, netBeforeDiscountCents: 12345, discountCents: 0 }] },
    issueBlockers: [SPERRE_SCHALTER],
    ...ueber,
  };
}

async function seite({ blockers = [SPERRE_SCHALTER], issueEnabled = false, viewport = { width: 1440, height: 1100 } } = {}) {
  const page = await browser.newPage({ viewport });
  const z = { creates: [], updates: [], issues: [], reversals: [], emails: 0, previews: 0, searches: [], reversalDone: false };
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/manual-invoices/status")) {
      return json({ issueEnabled, issuer: { ready: true, missingFields: [], placeholderFields: [] }, vatRate: { ok: true, ratePercent: 19 },
        taxCases: ["domestic_standard"], domesticCountry: "DE", limits: { paymentTermDefaultDays: 7, paymentTermMaxDays: 60 } });
    }
    if (p.endsWith("/admin/manual-invoices/customers")) {
      z.searches.push(url.searchParams.get("q"));
      return json({ customers: [{ id: 42, customerNumber: "CE-K-10042", status: "approved",
        recipient: { company: "Hafenkontor Weber KG", name: "Jana Weber", email: "login@hafenkontor.example", vatId: "DE123456789",
          street: "Kaistraße 4", zip: "20457", city: "Hamburg", country: "DE" } }] });
    }
    if (p.endsWith("/admin/manual-invoices/drafts") && m === "GET") {
      return json({ drafts: [{ id: 5, revision: 2, recipientUserId: null, recipientKind: "external", recipientCompany: "Alster Werkstatt GmbH",
        customerNumber: null, positionCount: 2, grossCents: 47600, createdAt: "2026-10-16T09:00:00Z", updatedAt: "2026-10-16T10:00:00Z" }],
        pagination: { total: 1 } });
    }
    if (p.endsWith("/admin/manual-invoices/drafts") && m === "POST") {
      z.creates.push(req.postDataJSON());
      return json({ draft: entwurf(11, { issueBlockers: blockers }) }, 201);
    }
    const d = /\/admin\/manual-invoices\/drafts\/(\d+)(\/(preview|issue))?$/.exec(p);
    if (d && d[3] === "preview") { z.previews++; return route.fulfill({ status: 200, contentType: "application/pdf", body: PDF }); }
    if (d && d[3] === "issue") {
      z.issues.push(req.postDataJSON());
      await new Promise((r) => setTimeout(r, 300));
      return json({ alreadyIssued: false, invoice: { id: 77, invoiceNumber: "CE-RE26-00042", grossCents: 14691, documentStatus: "ready" } }, 201);
    }
    if (d && m === "GET") return json({ draft: entwurf(Number(d[1]), { issueBlockers: blockers }) });
    if (d && m === "PUT") {
      z.updates.push(req.postDataJSON());
      return json({ draft: entwurf(Number(d[1]), { revision: 2, issueBlockers: blockers }) });
    }
    if (p.endsWith("/admin/invoices") && m === "GET") {
      return json({ invoices: [
        { id: 77, invoice_number: "CE-RE26-00042", user_id: null, invoice_source: "manual", recipient_company: "Elbufer Handel OHG",
          is_cancelled: false, amount: 146.91, gross_amount: 146.91, status: "unpaid", document_status: "ready", email_status: "pending",
          is_productive: true, is_overdue: false, is_payable: true, document_mode: "production", is_test_document: false,
          due_date: "2026-10-24T10:00:00", created_at: "2026-10-17T10:00:00Z" },
        { id: 78, invoice_number: "CE-RE26-00043", user_id: null, invoice_source: "manual", recipient_company: "Alster Werkstatt GmbH",
          is_cancelled: true, amount: 476, gross_amount: 476, status: "unpaid", document_status: "ready", email_status: "pending",
          is_productive: true, is_overdue: false, is_payable: false, document_mode: "production", is_test_document: false,
          due_date: "2026-10-24T10:00:00", created_at: "2026-10-17T09:00:00Z" },
      ], pagination: { total: 2, limit: 25, offset: 0, count: 2 } });
    }
    if (p.endsWith("/admin/invoices/77/reversal-record") && m === "POST") {
      z.reversals.push(req.postDataJSON());
      z.reversalDone = true;
      return json({ recorded: true, invoiceNumber: "CE-RE26-00042" }, 201);
    }
    if (p.endsWith("/admin/invoices/77/send-email") || p.endsWith("/admin/invoices/77/resend-email")) { z.emails++; return json({ outcome: "sent" }); }
    if (p.endsWith("/admin/invoices/77") && m === "GET") {
      return json({ invoice: {
        id: 77, invoice_number: "CE-RE26-00042", user_id: null, shipment_id: null, invoice_source: "manual",
        amount: 146.91, gross_amount: 146.91, net_amount: 123.45, vat_amount: 23.46, vat_rate: 0.19, currency: "EUR", payment_term: 7,
        status: "unpaid", document_status: "ready", email_status: "pending", is_productive: true, is_payable: !z.reversalDone,
        is_overdue: false, document_mode: "production", is_test_document: false, document_mode_label: "production",
        snapshot_company: "Elbufer Handel OHG", snapshot_name: "Tom Krüger", snapshot_email: "rechnung@elbufer-handel.example",
        due_date: "2026-10-24T10:00:00", issued_at: "2026-10-17T10:00:00Z", created_at: "2026-10-17T10:00:00Z",
        service_date: "2026-10-15", pdf_generated_at: "2026-10-17T10:00:01Z",
        is_cancelled: z.reversalDone, cancelled_at: z.reversalDone ? "2026-10-17T11:00:00Z" : null,
        cancellation_document_number: z.reversalDone ? "ST-2026-0001" : null, cancellation_date: z.reversalDone ? "2026-10-17" : null,
        cancellation_reason: z.reversalDone ? "Leistung entfallen" : null, cancellation_approved_by: z.reversalDone ? "Erika Nordmann" : null,
        cancellation_recorded_at: z.reversalDone ? "2026-10-17T11:00:00Z" : null,
      } });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return { page, z, fehler };
}

async function fuelleExtern(page) {
  await page.fill("#mi-recipient-company", "Elbufer Handel OHG");
  await page.fill("#mi-recipient-email", "rechnung@elbufer-handel.example");
  await page.fill("#mi-recipient-street", "Elbchaussee 7");
  await page.fill("#mi-recipient-zip", "22763");
  await page.fill("#mi-recipient-city", "Hamburg");
  await page.fill("#mi-service-from", "2026-10-15");
  await page.fill("#mi-pos-0-description", "Beratung");
  await page.fill("#mi-pos-0-unit", "Std.");
  await page.fill("#mi-pos-0-quantity", "1,5");
  await page.fill("#mi-pos-0-price", "80,00");
}
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("A — Rechnungsliste: Knopf, offene Entwürfe, externe Firma mit „Manuell“, „Storniert“", async () => {
  const { page, fehler } = await seite();
  await page.goto(`${BASE}/admin/invoices`, { waitUntil: "networkidle" });
  await page.locator("#adm-new-invoice").waitFor({ timeout: 15000 });
  assert.equal(norm(await page.locator("#adm-new-invoice").innerText()), "Neue Rechnung erstellen");
  assert.equal(await page.locator("#adm-new-invoice").getAttribute("href"), "/admin/invoices/manual/new");
  const draftRow = page.locator('#mi-drafts [data-draft="5"]');
  await draftRow.waitFor({ timeout: 10000 });
  assert.match(norm(await draftRow.innerText()), /Alster Werkstatt GmbH.*Externer Empfänger.*2 Positionen.*476,00/);
  const tabelle = page.locator(".adm-inv-table");
  assert.match(norm(await tabelle.innerText()), /CE-RE26-00042.*Manuell.*Elbufer Handel OHG.*Externer Empfänger/);
  assert.match(norm(await tabelle.locator("tr", { hasText: "CE-RE26-00043" }).innerText()), /Storniert/);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — neuer Entwurf (extern): Maschinenform, Adresse des Entwurfs, Serversummen", async () => {
  const { page, z, fehler } = await seite();
  await page.goto(`${BASE}/admin/invoices/manual/new`, { waitUntil: "networkidle" });
  await page.locator("#mi-recipient-company").waitFor({ timeout: 15000 });
  await fuelleExtern(page);
  await page.fill("#mi-pos-0-discount", "10");
  await page.click("#mi-save");
  await page.waitForURL(/\/admin\/invoices\/manual\/11$/, { timeout: 10000 });
  assert.equal(z.creates.length, 1);
  const b = z.creates[0];
  assert.deepEqual(b.positions, [{ description: "Beratung", details: "", unit: "Std.", quantity: "1.5", unitPriceNetCents: 8000, discountPercent: "10" }]);
  assert.deepEqual([b.recipientUserId, b.recipient.country, b.serviceDateFrom, b.taxCase], [null, "DE", "2026-10-15", "domestic_standard"]);
  assert.ok(!("totals" in b) && !("grossCents" in b), "der Browser schickt keine Summe");
  // Die Serverzahlen erscheinen — nicht eine eigene Rechnung (1,5 × 80 € − 10 % wären 108,00 €).
  await page.locator("#mi-totals").waitFor({ timeout: 10000 });
  assert.match(norm(await page.locator("#mi-totals").innerText()), /Netto 123,45 €.*Umsatzsteuer 19 % 23,46 €.*Brutto 146,91 €/);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — unzulässige Eingabe: Fehler an der Position, kein Request", async () => {
  const { page, z } = await seite();
  await page.goto(`${BASE}/admin/invoices/manual/new`, { waitUntil: "networkidle" });
  await page.locator("#mi-recipient-company").waitFor({ timeout: 15000 });
  await fuelleExtern(page);
  await page.fill("#mi-pos-0-price", "achtzig");
  await page.click("#mi-save");
  await page.locator("#mi-pos-0-price-err").waitFor({ timeout: 5000 });
  assert.match(norm(await page.locator("#mi-pos-0-price-err").innerText()), /Einzelpreis in Euro/);
  assert.equal(await page.locator("#mi-pos-0-price").getAttribute("aria-invalid"), "true");
  assert.equal(z.creates.length, 0);
  await page.close();
});

test("D — Ausstellen gesperrt: Gründe vom Server; ungespeicherte Änderung sperrt Vorschau und Ausstellen", async () => {
  const { page, z } = await seite();
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await page.locator("#mi-issue").waitFor({ timeout: 15000 });
  assert.equal(await page.locator("#mi-issue").isDisabled(), true);
  assert.match(norm(await page.locator("#mi-issue-blocked").innerText()), /nicht freigeschaltet/);
  assert.match(norm(await page.locator("#mi-issue-status").innerText()), /nicht freigeschaltet/);
  assert.equal(await page.locator("#mi-preview").isDisabled(), false);
  await page.fill("#mi-pos-0-description", "Beratung geändert");
  assert.equal(await page.locator("#mi-preview").isDisabled(), true, "die Vorschau zeigte eine ungespeicherte Fassung");
  assert.match(norm(await page.locator("#mi-issue-blocked").innerText()), /zuerst speichern/);
  await page.locator("#mi-unsaved").waitFor();
  assert.equal(z.issues.length, 0);
  await page.close();
});

test("E — Ausstellen: Bestätigung, Doppelklick = ein Request, Meldung ohne E-Mail, kein Versandaufruf", async () => {
  const { page, z, fehler } = await seite({ blockers: [], issueEnabled: true });
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await page.locator("#mi-issue").waitFor({ timeout: 15000 });
  assert.equal(await page.locator("#mi-issue").isDisabled(), false);
  await page.click("#mi-issue");
  const ja = page.locator("#mi-issue-confirm");
  await ja.waitFor({ timeout: 5000 });
  assert.match(norm(await page.locator(".adm-modal").innerText()), /unveränderlich.*keine E-Mail versendet/);
  // Doppelklick auf die Bestätigung: der zweite Klick trifft den Knopf, bevor React ihn sperrt — die Seite muss selbst
  // dafür sorgen, dass nur EIN Request hinausgeht.
  await ja.dblclick();
  await page.waitForURL(/\/admin\/invoices\/77$/, { timeout: 10000 });
  assert.equal(z.issues.length, 1, "der Doppelklick hat zwei Ausstellungen ausgelöst");
  assert.deepEqual(z.issues[0], { revision: 1, confirm: true });
  await page.getByText("Rechnung CE-RE26-00042 ausgestellt. Es wurde keine E-Mail versendet.").waitFor({ timeout: 10000 });
  assert.equal(z.emails, 0, "beim Ausstellen ging ein Versandaufruf hinaus");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F — bestehender Kunde: Suche, Auswahl belegt die Rechnungsanschrift vor, Request mit recipientUserId", async () => {
  const { page, z } = await seite();
  await page.goto(`${BASE}/admin/invoices/manual/new`, { waitUntil: "networkidle" });
  await page.locator("#mi-kind-customer").waitFor({ timeout: 15000 });
  await page.check("#mi-kind-customer");
  await page.fill("#mi-customer-search", "Hafen");
  const treffer = page.locator('[data-customer="42"]');
  await treffer.waitFor({ timeout: 5000 });
  await treffer.click();
  await page.locator("#mi-customer-chosen").waitFor();
  assert.match(norm(await page.locator("#mi-customer-chosen").innerText()), /Hafenkontor Weber KG · CE-K-10042/);
  assert.equal(await page.inputValue("#mi-recipient-street"), "Kaistraße 4");
  assert.equal(await page.inputValue("#mi-recipient-email"), "login@hafenkontor.example");
  await page.fill("#mi-service-from", "2026-10-15");
  await page.fill("#mi-pos-0-description", "Lagerlogistik");
  await page.fill("#mi-pos-0-price", "1.234,56");
  await page.click("#mi-save");
  await page.waitForURL(/\/admin\/invoices\/manual\/11$/, { timeout: 10000 });
  assert.equal(z.creates[0].recipientUserId, 42);
  assert.equal(z.creates[0].positions[0].unitPriceNetCents, 123456);
  assert.ok(z.searches.includes("Hafen"));
  await page.close();
});

test("G — Vorschau „Entwurf – keine Rechnung“ mit Drucken", async () => {
  const { page, z } = await seite();
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await page.locator("#mi-preview").waitFor({ timeout: 15000 });
  await page.click("#mi-preview");
  await page.locator(".pdfview-modal").waitFor({ timeout: 10000 });
  assert.match(norm(await page.locator(".pdfview-title").innerText()), /Entwurf, keine Rechnung/);
  await page.getByRole("button", { name: "Drucken" }).waitFor({ timeout: 10000 });
  assert.equal(z.previews, 1);
  await page.close();
});

test("H — Rechnungsdetail: Stornovermerk mit Pflichtangaben, genau ein Request; Versanddialog nennt den Empfänger", async () => {
  const { page, z, fehler } = await seite();
  await page.goto(`${BASE}/admin/invoices/77`, { waitUntil: "networkidle" });
  await page.locator("#adm-inv-reversal-open").waitFor({ timeout: 15000 });
  assert.match(norm(await page.locator("body").innerText()), /Manuell erstellt/);
  assert.match(norm(await page.locator("body").innerText()), /Keine Sendung — manuell erstellte Rechnung\./);
  // Versanddialog: nennt die Empfänger-E-Mail des Snapshots; Abbrechen sendet nichts.
  await page.locator(".adm-card", { hasText: "E-Mail-Versand" }).locator("button.btn-primary").click();
  await page.locator(".adm-modal").waitFor({ timeout: 5000 });
  assert.match(norm(await page.locator(".adm-modal").innerText()), /an rechnung@elbufer-handel\.example\./);
  await page.locator(".adm-modal").getByRole("button", { name: "Abbrechen" }).click();
  await page.locator(".adm-modal").waitFor({ state: "detached", timeout: 5000 });
  assert.equal(z.emails, 0, "der Versanddialog hat ohne Bestätigung gesendet");
  await page.click("#adm-inv-reversal-open");
  await page.locator("#adm-inv-reversal-confirm").waitFor();
  await page.fill("#adm-rev-number", "");
  await page.click("#adm-inv-reversal-confirm");
  await page.locator("#adm-rev-number-err").waitFor({ timeout: 5000 });
  assert.equal(z.reversals.length, 0, "ohne Pflichtangaben ging ein Request hinaus");
  await page.fill("#adm-rev-number", "ST-2026-0001");
  await page.fill("#adm-rev-reason", "Leistung entfallen");
  await page.fill("#adm-rev-approved", "Erika Nordmann");
  await page.click("#adm-inv-reversal-confirm");
  await page.getByText("Storno vermerkt.", { exact: true }).waitFor({ timeout: 10000 });
  assert.equal(z.reversals.length, 1);
  assert.deepEqual(Object.keys(z.reversals[0]).sort(), ["acknowledgePaid", "approvedBy", "cancellationDate", "confirm", "externalDocumentNumber", "reason"]);
  assert.equal(z.reversals[0].externalDocumentNumber, "ST-2026-0001");
  await page.locator("#adm-inv-cancelled-note").waitFor({ timeout: 10000 });
  assert.match(norm(await page.locator("#adm-inv-reversal").innerText()), /ST-2026-0001.*Leistung entfallen.*Erika Nordmann/);
  assert.equal(z.emails, 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("I — 390 px: kein horizontaler Überlauf im Editor", async () => {
  const { page } = await seite({ viewport: { width: 390, height: 900 } });
  await page.goto(`${BASE}/admin/invoices/manual/11`, { waitUntil: "networkidle" });
  await page.locator("#mi-pos-0-price").waitFor({ timeout: 15000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  for (const sel of ["#mi-recipient-company", "#mi-pos-0-description", "#mi-pos-0-price", "#mi-save", "#mi-issue"]) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b && b.x >= 0 && b.x + b.width <= 390, `${sel} ragt aus dem Bild`);
  }
  await page.close();
});
