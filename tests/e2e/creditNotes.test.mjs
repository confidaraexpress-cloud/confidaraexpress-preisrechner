// Browser-Smokes: Storno-Abwicklung und Gutschrift.
//
// Echter Dev-Server, echte Kaskade, echte Requests — Backend vollständig gemockt.
// Genau die Wege, die eine Quelltextprüfung nicht erreicht:
//
//   Adminportal (A1–A9)
//     • ohne bestätigten Providerstorno ist der Gutschriftknopf gesperrt,
//     • die Karte sagt sichtbar, dass beim Dienstleister nichts ausgelöst wird,
//     • das Speichern des Providerstands sendet GENAU den Statuswert,
//     • ist er bestätigt, wird der Knopf bedienbar,
//     • ein Klick sendet KEINEN Body — kein Betrag verlässt den Browser,
//     • eine bestehende Gutschrift ersetzt den Knopf durch den Beleg,
//     • ohne angenommene Anfrage gibt es gar kein Auswahlfeld,
//     • ein Serverfehler erscheint als Klartext, nie als Rohcode,
//     • der Knopf ist mit der Tastatur erreichbar und bedienbar.
//
//   Kundenportal (K1–K7)
//     • ohne Gutschriften erscheint kein Abschnitt,
//     • mit Gutschriften erscheinen Nummer, Betrag und Erstattungsstand,
//     • eine gutgeschriebene Rechnung zeigt ihren UNVERÄNDERTEN Betrag plus die
//       Gutschriftzeile,
//     • ein noch nicht fertiger Beleg bekommt keinen Knopf ins Leere,
//     • eine vollständig gutgeschriebene Rechnung wird als solche benannt,
//     • ein Ladefehler der Gutschriften bricht die Rechnungsliste nicht,
//     • 390 px ohne horizontalen Überlauf.
//
// NIEMALS eine echte Bestellung, NIEMALS eine echte Stornierung, NIEMALS eine
// echte Gutschrift: alle Backendrufe sind abgefangen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5248, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = { id: 9, email: "admin@confidaraexpress.de", name: "Adminkonto", role: "admin", status: "approved" };
const KUNDE = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", city: "Berlin",
  street: "Musterstr. 1", customer_number: "CE-K-10030", payment_term: 7,
  delivery_note_mode: "none", billing_mode: "single",
};

const BASIS_DETAIL = {
  cancellationRequest: {
    id: 7, status: "accepted", reason: "Der Empfänger hat die Annahme vorab abgesagt.",
    adminNote: null, revision: 2, createdAt: "2026-09-10T08:00:00Z", updatedAt: "2026-09-11T08:00:00Z",
    reviewedAt: "2026-09-11T08:00:00Z", reviewedBy: { id: 9, name: "Adminkonto" },
  },
  shipment: {
    id: 501, jumingoShipmentId: "s_" + "a".repeat(32), orderNumber: "CE-BS26-00042",
    status: "booked", carrier: "DPD", trackingNumber: "TRK1", trackingStatus: null,
    fromCountry: "DE", toCountry: "AT", createdAt: "2026-09-04T08:00:00Z",
    senderAddress: null, recipientAddress: null,
  },
  customer: { id: 1, company: "Muster GmbH", contactName: "Max Mustermann", email: "max@example.com" },
  invoice: { id: 11, invoiceNumber: "CE-RE26-00042", status: "unpaid", amount: 28.8 },
  notification: { sentAt: null, failed: false },
  providerCancellation: { status: "pending", note: null, startedAt: "2026-09-11T09:00:00Z", confirmedAt: null, failedAt: null },
  creditNote: null,
};

let server, browser;

async function adminRoutes(ziel, state) {
  await ziel.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const m = req.method();
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (/\/admin\/cancellation-requests\/\d+\/provider-cancellation$/.test(p) && m === "PUT") {
      state.providerCalls.push(JSON.parse(req.postData() || "{}"));
      state.detail = { ...state.detail, providerCancellation: { ...state.detail.providerCancellation, status: JSON.parse(req.postData() || "{}").providerStatus } };
      return json({ providerCancellation: state.detail.providerCancellation, creditNoteAvailable: state.detail.providerCancellation.status === "confirmed" });
    }
    if (/\/admin\/cancellation-requests\/\d+\/credit-note$/.test(p) && m === "POST") {
      // Der Body MUSS leer sein — kein Betrag verlässt den Browser.
      state.creditCalls.push(req.postData() || "");
      state.detail = { ...state.detail, creditNote: {
        id: 33, creditNoteNumber: "CE-GU26-00001", invoiceId: 11, invoiceNumber: "CE-RE26-00042",
        grossAmount: 28.8, currency: "EUR", creditDate: "2026-09-15", refundStatus: "open", documentStatus: "ready",
      } };
      return json({ creditNote: state.detail.creditNote }, 201);
    }
    if (/\/admin\/cancellation-requests\/\d+$/.test(p) && m === "GET") return json(state.detail);
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    if (p.includes("/company-logo")) return json({ error: "kein Logo" }, 404);
    return json({ items: [], cancellationRequests: [], pagination: { total: 0 } });
  });
}

async function kundeRoutes(ziel, state) {
  await ziel.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: KUNDE });
    if (p.endsWith("/kunde/credit-notes")) { state.creditNoteCalls += 1; return json({ creditNotes: state.creditNotes }); }
    if (p.endsWith("/kunde/invoices")) return json({ invoices: state.invoices, summary: state.summary });
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    if (p.includes("/company-logo")) return json({ error: "kein Logo" }, 404);
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], summary: null, pagination: { total: 0 } });
  });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore", detached: false,
  });
  const deadline = Date.now() + 60000;
  for (;;) {
    try { const r = await fetch(BASE); if (r.ok || r.status < 500) break; } catch { /* noch nicht da */ }
    if (Date.now() > deadline) throw new Error("Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 300));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.kill("SIGTERM");
});

async function adminSeite(detail, viewport = { width: 1280, height: 1000 }) {
  const state = { detail, providerCalls: [], creditCalls: [] };
  const ctx = await browser.newContext({ viewport });
  await adminRoutes(ctx, state);
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.addInitScript(() => { localStorage.setItem("ce_token", "test-token"); });
  await page.goto(`${BASE}/admin/cancellation-requests/7`, { waitUntil: "networkidle" });
  await page.waitForSelector("#adm-cancellation-settlement", { timeout: 15000 });
  return { ctx, page, state, fehler };
}

async function kundeSeite(extra = {}, viewport = { width: 1280, height: 1000 }) {
  const state = {
    creditNotes: [], creditNoteCalls: 0,
    invoices: [], summary: { open_amount: 0, open_count: 0, overdue_count: 0, currency: "EUR" },
    ...extra,
  };
  const ctx = await browser.newContext({ viewport });
  await kundeRoutes(ctx, state);
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.addInitScript(() => { localStorage.setItem("ce_token", "test-token"); });
  await page.goto(`${BASE}/dashboard?page=invoices`, { waitUntil: "networkidle" });
  return { ctx, page, state, fehler };
}

const RECHNUNG = {
  id: 11, invoice_number: "CE-RE26-00042", amount: "28.80", gross_amount: "28.80", currency: "EUR",
  status: "unpaid", due_date: "2026-09-17T00:00:00Z", created_at: "2026-09-10T08:00:00Z",
  issued_at: "2026-09-10T08:00:00Z", document_status: "ready", is_productive: true,
  is_overdue: false, is_payable: true, download_available: true,
};

// ═══ Adminportal ════════════════════════════════════════════════════════════

test("A1 — ohne bestätigten Providerstorno ist der Gutschriftknopf gesperrt", async () => {
  const { ctx, page, fehler } = await adminSeite(structuredClone(BASIS_DETAIL));
  const btn = page.locator("#adm-create-credit-note");
  assert.equal(await btn.isDisabled(), true, "ohne bestätigten Storno darf nichts erstellbar sein");
  const text = await page.locator("#adm-cancellation-settlement").innerText();
  assert.match(text, /Versanddienstleister bestätigt/);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("A2 — die Karte sagt sichtbar, dass beim Dienstleister nichts ausgelöst wird", async () => {
  const { ctx, page, fehler } = await adminSeite(structuredClone(BASIS_DETAIL));
  const text = await page.locator("#adm-cancellation-settlement").innerText();
  assert.match(text, /außerhalb dieses Portals/);
  assert.match(text, /nichts beim Dienstleister ausgelöst/);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("A3 — das Speichern sendet GENAU den Statuswert", async () => {
  const { ctx, page, state, fehler } = await adminSeite(structuredClone(BASIS_DETAIL));
  await page.selectOption("#adm-provider-status", "confirmed");
  await page.locator("#adm-cancellation-settlement button.btn-primary").first().click();
  await page.waitForTimeout(600);
  assert.equal(state.providerCalls.length, 1, "genau ein Request");
  assert.equal(state.providerCalls[0].providerStatus, "confirmed");
  // Kein Betrag, kein Kundenfeld, keine Rechnungsdaten im Body.
  assert.deepEqual(Object.keys(state.providerCalls[0]).sort(), ["note", "providerStatus"]);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("A4 — mit bestätigtem Providerstorno wird der Knopf bedienbar", async () => {
  const detail = structuredClone(BASIS_DETAIL);
  detail.providerCancellation.status = "confirmed";
  detail.providerCancellation.confirmedAt = "2026-09-12T09:00:00Z";
  const { ctx, page, fehler } = await adminSeite(detail);
  assert.equal(await page.locator("#adm-create-credit-note").isDisabled(), false);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("A5 — der Klick sendet KEINEN Body — kein Betrag verlässt den Browser", async () => {
  const detail = structuredClone(BASIS_DETAIL);
  detail.providerCancellation.status = "confirmed";
  const { ctx, page, state, fehler } = await adminSeite(detail);
  await page.locator("#adm-create-credit-note").click();
  await page.waitForTimeout(800);
  assert.equal(state.creditCalls.length, 1);
  assert.ok(!state.creditCalls[0], `unerwarteter Body: ${state.creditCalls[0]}`);
  // Danach steht der Beleg da, nicht mehr der Knopf.
  const text = await page.locator("#adm-cancellation-settlement").innerText();
  assert.match(text, /CE-GU26-00001/);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("A6 — eine bestehende Gutschrift ersetzt den Knopf durch den Beleg", async () => {
  const detail = structuredClone(BASIS_DETAIL);
  detail.providerCancellation.status = "confirmed";
  detail.creditNote = { id: 33, creditNoteNumber: "CE-GU26-00001", invoiceNumber: "CE-RE26-00042",
    grossAmount: 28.8, currency: "EUR", creditDate: "2026-09-15", refundStatus: "open", documentStatus: "ready" };
  const { ctx, page, fehler } = await adminSeite(detail);
  assert.equal(await page.locator("#adm-create-credit-note").count(), 0, "kein zweiter Erstellknopf");
  const text = await page.locator("#adm-cancellation-settlement").innerText();
  assert.match(text, /CE-GU26-00001/);
  assert.match(text, /bleibt unverändert bestehen/, "die Rechnung bleibt — das muss dastehen");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("A7 — ohne angenommene Anfrage gibt es gar kein Auswahlfeld", async () => {
  // Sonst stünde am Vorgang, der Carrier habe storniert, während die Sendung
  // fachlich weiterläuft und weiter fakturiert wird.
  const detail = structuredClone(BASIS_DETAIL);
  detail.cancellationRequest.status = "in_review";
  detail.providerCancellation.status = "not_started";
  const { ctx, page, fehler } = await adminSeite(detail);
  assert.equal(await page.locator("#adm-provider-status").count(), 0);
  assert.equal(await page.locator("#adm-create-credit-note").isDisabled(), true);
  assert.match(await page.locator("#adm-cancellation-settlement").innerText(), /angenommen/);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("A8 — ein Serverfehler erscheint als Klartext, nie als Rohcode", async () => {
  const detail = structuredClone(BASIS_DETAIL);
  detail.providerCancellation.status = "confirmed";
  const state = { detail, providerCalls: [], creditCalls: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const m = route.request().method();
    const json = (b, st = 200) => route.fulfill({ status: st, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (/\/credit-note$/.test(p) && m === "POST")
      return json({ error: "…", code: "CREDIT_NOTE_NO_INVOICE" }, 409);
    if (/\/admin\/cancellation-requests\/\d+$/.test(p)) return json(state.detail);
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    if (p.includes("/company-logo")) return json({ error: "kein Logo" }, 404);
    return json({ items: [], pagination: { total: 0 } });
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.addInitScript(() => { localStorage.setItem("ce_token", "test-token"); });
  await page.goto(`${BASE}/admin/cancellation-requests/7`, { waitUntil: "networkidle" });
  await page.waitForSelector("#adm-create-credit-note", { timeout: 15000 });
  await page.locator("#adm-create-credit-note").click();
  await page.waitForSelector("#adm-cancellation-settlement [role=alert]", { timeout: 15000 });
  const text = await page.locator("#adm-cancellation-settlement [role=alert]").innerText();
  assert.match(text, /keine Rechnung/);
  assert.ok(!/CREDIT_NOTE_NO_INVOICE/.test(text), "kein Rohcode in der Oberfläche");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("A9 — der Gutschriftknopf ist mit der Tastatur erreichbar und bedienbar", async () => {
  const detail = structuredClone(BASIS_DETAIL);
  detail.providerCancellation.status = "confirmed";
  const { ctx, page, state, fehler } = await adminSeite(detail);
  await page.locator("#adm-create-credit-note").focus();
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id),
    "adm-create-credit-note");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  assert.equal(state.creditCalls.length, 1, "Enter löst dieselbe Aktion aus wie der Klick");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

// ═══ Kundenportal ═══════════════════════════════════════════════════════════

test("K1 — ohne Gutschriften erscheint gar kein Abschnitt", async () => {
  const { ctx, page, state, fehler } = await kundeSeite({ invoices: [RECHNUNG] });
  await page.waitForSelector(".inv-table", { timeout: 15000 });
  await page.waitForTimeout(500);
  assert.ok(state.creditNoteCalls >= 1, "die Liste wird geholt");
  assert.equal(await page.locator("#kunde-credit-notes").count(), 0,
    "ein leerer Abschnitt wäre für die meisten Konten eine dauerhafte Fläche ohne Aussage");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("K2 — mit Gutschriften erscheinen Nummer, Betrag und Erstattungsstand", async () => {
  const { ctx, page, fehler } = await kundeSeite({
    invoices: [RECHNUNG],
    creditNotes: [{ id: 33, creditNoteNumber: "CE-GU26-00001", invoiceNumber: "CE-RE26-00042",
      grossAmount: 28.8, currency: "EUR", creditDate: "2026-09-15", refundStatus: "open",
      documentStatus: "ready", downloadAvailable: true }],
  });
  await page.waitForSelector("#kunde-credit-notes", { timeout: 15000 });
  const text = await page.locator("#kunde-credit-notes").innerText();
  assert.match(text, /CE-GU26-00001/);
  assert.match(text, /28,80/);
  assert.match(text, /Erstattung offen/);
  assert.match(text, /Rechnung bleibt unverändert bestehen/);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("K3 — die gutgeschriebene Rechnung zeigt ihren UNVERÄNDERTEN Betrag", async () => {
  const { ctx, page, fehler } = await kundeSeite({
    invoices: [{ ...RECHNUNG, credited_amount: "11.90", effective_amount: "16.90" }],
    creditNotes: [{ id: 33, creditNoteNumber: "CE-GU26-00001", grossAmount: 11.9, currency: "EUR",
      refundStatus: "open", documentStatus: "ready", downloadAvailable: true }],
  });
  await page.waitForSelector(".inv-table", { timeout: 15000 });
  const zelle = await page.locator(".inv-table tbody tr").first().innerText();
  assert.match(zelle, /28,80/, "der ausgestellte Rechnungsbetrag bleibt stehen — er ist der Beleg");
  assert.match(zelle, /11,90/, "die Gutschrift wird ausgewiesen");
  assert.match(zelle, /16,90/, "und der noch offene Betrag");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("K4 — ein noch nicht fertiger Beleg bekommt keinen Knopf ins Leere", async () => {
  const { ctx, page, fehler } = await kundeSeite({
    invoices: [RECHNUNG],
    creditNotes: [{ id: 34, creditNoteNumber: "CE-GU26-00002", grossAmount: 11.9, currency: "EUR",
      refundStatus: "open", documentStatus: "pending_document", downloadAvailable: false }],
  });
  await page.waitForSelector("#kunde-credit-notes", { timeout: 15000 });
  const text = await page.locator("#kunde-credit-notes").innerText();
  assert.match(text, /Beleg wird erstellt/);
  assert.equal(await page.locator('#kunde-credit-notes button:has-text("PDF")').count(), 0);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("K5 — 390 px: kein horizontaler Überlauf", async () => {
  const { ctx, page, fehler } = await kundeSeite({
    invoices: [{ ...RECHNUNG, credited_amount: "11.90", effective_amount: "16.90" }],
    creditNotes: [{ id: 33, creditNoteNumber: "CE-GU26-00001", invoiceNumber: "CE-RE26-00042",
      grossAmount: 28.8, currency: "EUR", creditDate: "2026-09-15", refundStatus: "refunded",
      documentStatus: "ready", downloadAvailable: true }],
  }, { width: 390, height: 900 });
  await page.waitForSelector("#kunde-credit-notes", { timeout: 15000 });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `horizontaler Überlauf: ${overflow}px`);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("K6 — eine vollständig gutgeschriebene Rechnung wird als solche benannt", async () => {
  const { ctx, page, fehler } = await kundeSeite({
    invoices: [{ ...RECHNUNG, credited_amount: "28.80", effective_amount: "0.00" }],
    creditNotes: [{ id: 33, creditNoteNumber: "CE-GU26-00001", grossAmount: 28.8, currency: "EUR",
      refundStatus: "refunded", documentStatus: "ready", downloadAvailable: true }],
  });
  await page.waitForSelector(".inv-table", { timeout: 15000 });
  const zelle = await page.locator(".inv-table tbody tr").first().innerText();
  assert.match(zelle, /Vollständig gutgeschrieben/);
  assert.match(zelle, /28,80/, "der ausgestellte Betrag steht weiterhin da — er ist der Beleg");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("K7 — ein Ladefehler der Gutschriften bricht die Rechnungsliste nicht", async () => {
  // Bereits geladene Rechnungen bleiben vollständig bedienbar; der Fehler steht
  // darunter als eigener Zustand.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, st = 200) => route.fulfill({ status: st, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: KUNDE });
    if (p.endsWith("/kunde/credit-notes")) return json({ error: "Fehler" }, 500);
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [RECHNUNG], summary: { open_amount: 28.8, open_count: 1, overdue_count: 0, currency: "EUR" } });
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    if (p.includes("/company-logo")) return json({ error: "kein Logo" }, 404);
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], summary: null, pagination: { total: 0 } });
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.addInitScript(() => { localStorage.setItem("ce_token", "test-token"); });
  await page.goto(`${BASE}/dashboard?page=invoices`, { waitUntil: "networkidle" });
  await page.waitForSelector(".inv-table", { timeout: 15000 });
  assert.match(await page.locator(".inv-table").innerText(), /CE-RE26-00042/,
    "die Rechnungsliste bleibt vollständig sichtbar");
  await page.waitForSelector("#kunde-credit-notes", { timeout: 15000 });
  assert.match(await page.locator("#kunde-credit-notes").innerText(), /konnten nicht geladen werden/);
  assert.deepEqual(fehler, [], "ein Ladefehler darf keinen Renderfehler erzeugen");
  await ctx.close();
});
