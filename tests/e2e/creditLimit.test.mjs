// E2E: Paket F (Master-Implementierungsauftrag 2026-10-23) — der Buchungsrahmen in der Oberfläche.
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — keine Buchung, kein Konto, kein Anbieter.
//
//   A — Übersicht: der Rahmen steht unter den offenen Rechnungen (Betrag, Rahmen, belegt); ohne
//       Antwort des Servers (altes Backend, 404) steht nichts, und die Übersicht bleibt heil
//   B — Übersicht: ausgeschöpft steht als Wort und mit Erklärung
//   C — Admin-Kundendetail: Sektion mit Rahmen/offen/reserviert/verfügbar; ungültige Eingabe → Fehler
//       am Feld, kein Request; gültige Eingabe → Bestätigung → genau EIN PUT mit Zahl, Serverwert übernommen
//   D — Admin-Kundendetail: Adminkonto ohne Sektion; altes Backend ohne `credit` ohne Sektion
//   E — Adminliste: Rahmen in der Statuszelle und Filter „ausgeschöpft"
//   F — Verlauf: der Link der Sektion öffnet das Audit-Log vorgefiltert (Aktion + Konto); eine unbekannte Aktion
//       aus der Adresse wird ignoriert
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5296, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}
const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

const KUNDE = { id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030" };
const ADMIN = { id: 9, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress", name: "Anna Admin",
  role: "admin", status: "approved", country: "DE" };
const SHIPMENTS = [
  { id: 1, status: "booked", weight: 5, price_final: 22.19, selected_carrier: "dhl", created_at: "2026-08-05T10:00:00Z", order_number: "CE-1001" },
];
const INVOICES = [{ id: 1, invoice_number: "RE-2026-0001", status: "open", is_overdue: false, gross_amount: 450, currency: "EUR",
  issued_at: "2026-08-01T00:00:00Z", due_date: "2026-08-08", amount: 450 }];
const SUMMARY = { open_count: 1, open_amount: 450, overdue_count: 0, next_due_date: "2026-08-08", currency: "EUR" };
const FREI = { limit: 2000, open: 450, reserved: 100, available: 1450, exhausted: false, currency: "EUR" };
const VOLL = { limit: 2000, open: 1900, reserved: 150, available: 0, exhausted: true, currency: "EUR" };

let server, browser;

async function kundeRoutes(page, { credit = FREI, creditStatus = 200 } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: KUNDE });
    if (p.endsWith("/kunde/credit")) return creditStatus === 200 ? json({ credit }) : json({ error: "Nicht gefunden" }, creditStatus);
    if (p.endsWith("/kunde/shipments")) return json({ shipments: SHIPMENTS });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: INVOICES, summary: SUMMARY });
    if (p.includes("/kunde/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "2026-08-06T10:00:00Z" });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/support")) return json({ supportRequests: [] });
    if (p.includes("/api/kunde/")) return json({ items: [], drafts: [], nextCursor: null, pagination: { total: 0 } });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function adminRoutes(page, { credit = FREI, withCredit = true, putStatus = 200 } = {}) {
  const state = { puts: [], audit: [], credit: { ...credit } };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/users/7/credit-limit") && req.method() === "PUT") {
      state.puts.push(req.postDataJSON());
      if (putStatus !== 200) return json({ error: "Bitte einen Buchungsrahmen in Euro zwischen 0 und 1.000.000 angeben.", code: "CREDIT_LIMIT_INVALID", field: "creditLimit" }, putStatus);
      const neu = Number(state.puts.at(-1).creditLimit);
      state.credit = { ...state.credit, limit: neu, available: Math.max(0, neu - state.credit.open - state.credit.reserved), exhausted: neu - state.credit.open - state.credit.reserved <= 0 };
      return json({ message: "Buchungsrahmen aktualisiert", creditLimit: neu, previousCreditLimit: credit.limit, credit: state.credit });
    }
    if (p.endsWith("/admin/users/7")) {
      return json({ user: { id: 7, name: "Max Mustermann", email: "einkauf@muster-logistik.de", company_name: "Muster Logistik GmbH",
        role: "customer", status: "approved", country: "DE", customer_number: "CE-K-10031", payment_term: 7 },
        summary: { shipments_total: 3, invoices_total: 2, invoices_productive: 2, invoices_unpaid: 1, invoices_overdue: 0, open_amount: 450 },
        ...(withCredit ? { credit: state.credit } : {}) });
    }
    if (p.endsWith("/admin/users/8")) {
      return json({ user: { id: 8, name: "Zweiter Admin", email: "zwei@confidaraexpress.de", company_name: "ConfidaraExpress",
        role: "admin", status: "approved", country: "DE" }, summary: {}, credit: FREI });
    }
    if (p.endsWith("/admin/users") || p.includes("/admin/users?")) {
      return json({ users: [
        { id: 7, name: "Max Mustermann", email: "einkauf@muster-logistik.de", company_name: "Muster Logistik GmbH", role: "customer", status: "approved", customer_number: "CE-K-10031", credit: FREI },
        { id: 11, name: "Vera Voll", email: "voll@beispiel.de", company_name: "Voll Cargo GmbH", role: "customer", status: "approved", customer_number: "CE-K-10040", credit: VOLL },
        { id: 12, name: "Alt Konto", email: "alt@beispiel.de", company_name: "Alt Logistik", role: "customer", status: "approved", customer_number: null },
      ], pagination: { limit: 25, offset: 0, count: 3, total: 3 } });
    }
    if (p.includes("/admin/metrics")) return json({ total: 3 });
    if (p.endsWith("/admin/audit-logs")) { state.audit.push(new URL(req.url()).search); return json({ logs: [], pagination: { limit: 25, offset: 0, count: 0, total: 0 } }); }
    if (p.includes("/admin/users/7/")) return json({ pricing: null, declarations: null, verifications: [], attributions: [], supportRequests: [] });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return state;
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
  const deadline = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > deadline) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("A — Übersicht: der Rahmen steht unter den offenen Rechnungen; ohne Serverantwort steht nichts", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await kundeRoutes(page);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-credit", { timeout: 20000 });
  const text = norm(await page.locator("#ov-credit").innerText());
  assert.match(text, /Verfügbarer Buchungsrahmen/);
  assert.match(text, /1\.450,00 €/);
  assert.match(text, /von 2\.000,00 € · 550,00 € belegt/);
  assert.doesNotMatch(text, /ausgeschöpft/);
  assert.equal(await page.locator("#ov-credit .ov-credit-bar-fill").evaluate((el) => el.style.width), "28%");
  assert.ok(await page.locator(".ov-inv-amount").isVisible(), "die offenen Rechnungen fehlen");
  await page.close();

  const alt = await browser.newPage({ viewport: { width: 390, height: 844 } });
  alt.on("pageerror", (e) => fehler.push(String(e)));
  await kundeRoutes(alt, { creditStatus: 404 });
  await alt.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await alt.waitForSelector(".ov-mod-grid", { timeout: 20000 });
  await alt.waitForTimeout(400);
  assert.equal(await alt.locator("#ov-credit").count(), 0, "ohne Rahmen darf kein Block stehen");
  assert.ok(await alt.locator(".ov-inv-amount").isVisible(), "die Übersicht ist ohne Rahmen nicht heil");
  assert.equal(await alt.locator(".alert-error, .ov-error").count(), 0, "ein 404 des Rahmens darf kein Fehlerbanner erzeugen");
  assert.deepEqual(fehler, []);
  await alt.close();
});

test("B — Übersicht: ausgeschöpft steht als Wort und mit Erklärung", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await kundeRoutes(page, { credit: VOLL });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-credit", { timeout: 20000 });
  const text = norm(await page.locator("#ov-credit").innerText());
  assert.match(text, /ausgeschöpft/);
  assert.match(text, /0,00 €/);
  assert.match(text, /Ihr Buchungsrahmen ist derzeit ausgeschöpft/);
  assert.equal(await page.locator("#ov-credit .badge--warning").count(), 1, "ausgeschöpft steht nicht als Wort im Badge");
  const breit = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert.equal(breit, true, "horizontaler Überlauf auf dem Smartphone");
  await page.close();
});

test("C — Admin-Kundendetail: Werte, Eingangsprüfung ohne Request, gültige Änderung mit Bestätigung und genau einem PUT", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  const state = await adminRoutes(page);
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  const sektion = page.locator("#adm-credit-limit-section");
  await sektion.waitFor({ state: "visible", timeout: 20000 });
  const text = norm(await sektion.innerText());
  assert.match(text, /Buchungsrahmen/);
  assert.match(text, /Rahmen 2\.000,00 €/);
  assert.match(text, /Offene Belege 450,00 €/);
  assert.match(text, /Reserviert 100,00 €/);
  assert.match(text, /Verfügbar 1\.450,00 €/);
  assert.match(text, /1\.450,00 € verfügbar/, "der Kartenkopf nennt den Spielraum");
  const input = page.locator("#adm-credit-limit-input");
  assert.equal(await input.inputValue(), "2000,00");
  // Ungültig: Fehler am Feld, kein Dialog, kein Request.
  await input.fill("abc");
  await sektion.locator('button[type="submit"]').click();
  assert.match(norm(await page.locator("#adm-credit-limit-input-error").innerText()), /zwischen 0 und 1\.000\.000/);
  assert.equal(await page.locator(".adm-dialog, [role=\"dialog\"]").count(), 0, "ein Dialog trotz ungültiger Eingabe");
  assert.equal(state.puts.length, 0);
  // Unverändert: Hinweis, kein Request.
  await input.fill("2.000,00");
  await sektion.locator('button[type="submit"]').click();
  assert.match(norm(await page.locator("#adm-credit-limit-input-error").innerText()), /bereits auf diesen Wert/);
  assert.equal(state.puts.length, 0);
  // Gültig: Bestätigung, genau EIN PUT mit Zahl, Serverwert übernommen.
  await input.fill("3.500,50");
  await sektion.locator('button[type="submit"]').click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  assert.match(norm(await dialog.innerText()), /von 2\.000,00 € auf 3\.500,50 €/);
  await dialog.getByRole("button", { name: "Rahmen setzen", exact: true }).click();
  await page.waitForFunction(() => /3\.500,50/.test(document.querySelector("#adm-credit-limit-section")?.innerText || ""), null, { timeout: 10000 });
  assert.deepEqual(state.puts, [{ creditLimit: 3500.5 }]);
  const nach = norm(await sektion.innerText());
  assert.match(nach, /Rahmen 3\.500,50 €/);
  assert.match(nach, /Verfügbar 2\.950,50 €/);
  assert.match(nach, /Buchungsrahmen auf 3\.500,50 € gesetzt/);
  assert.equal(await input.inputValue(), "3500,50", "das Feld zeigt den Serverwert");
  assert.equal(await sektion.getByRole("link", { name: "Änderungsverlauf im Audit-Log" }).getAttribute("href"),
    "/admin/audit-logs?action=user.credit_limit_change&target_user_id=7");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — kein Rahmen für Adminkonten; altes Backend ohne `credit` zeigt keine Sektion", async () => {
  const page = await browser.newPage();
  await adminRoutes(page);
  await page.goto(`${BASE}/admin/users/8`, { waitUntil: "networkidle" });
  await page.waitForSelector(".adm-card", { timeout: 20000 });
  assert.equal(await page.locator("#adm-credit-limit-section").count(), 0, "ein Adminkonto hat keinen Rahmen");
  await page.close();
  const alt = await browser.newPage();
  await adminRoutes(alt, { withCredit: false });
  await alt.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  await alt.waitForSelector(".adm-card", { timeout: 20000 });
  assert.equal(await alt.locator("#adm-credit-limit-section").count(), 0, "ohne credit in der Antwort darf keine Sektion stehen");
  await alt.close();
});

test("E — Adminliste: Rahmen in der Statuszelle und der Filter „ausgeschöpft“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await adminRoutes(page);
  await page.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr", { timeout: 20000 });
  assert.equal(await page.locator("table thead th").count(), 5, "die Tabelle behält ihre fünf Spalten");
  const zeilen = page.locator("table tbody tr");
  assert.equal(await zeilen.count(), 3);
  assert.match(norm(await zeilen.nth(0).innerText()), /1\.450,00 € frei/);
  assert.match(norm(await zeilen.nth(1).innerText()), /ausgeschöpft/);
  assert.equal(await zeilen.nth(1).locator(".badge--warning").count(), 1);
  assert.match(norm(await zeilen.nth(2).innerText()), /—/);
  await page.selectOption("#u-credit", "exhausted");
  await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length === 1, null, { timeout: 10000 });
  assert.match(norm(await page.locator("table tbody tr").first().innerText()), /Voll Cargo GmbH/);
  assert.match(norm(await page.locator(".adm-filter-chips").innerText()), /Buchungsrahmen: Ausgeschöpft/);
  await page.selectOption("#u-credit", "all");
  await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length === 3, null, { timeout: 10000 });
  await page.close();
});

test("F — Verlauf: das Audit-Log übernimmt Aktion und Konto aus der Adresse, ignoriert Unbekanntes", async () => {
  const page = await browser.newPage();
  const state = await adminRoutes(page);
  await page.goto(`${BASE}/admin/audit-logs?action=user.credit_limit_change&target_user_id=7`, { waitUntil: "networkidle" });
  await page.waitForSelector("#f-action", { timeout: 20000 });
  assert.equal(await page.locator("#f-action").inputValue(), "user.credit_limit_change");
  assert.ok(state.audit.some((q) => q.includes("action=user.credit_limit_change") && q.includes("target_user_id=7")),
    `die Abfrage trägt die Vorbelegung nicht: ${state.audit.join(" | ")}`);
  await page.close();
  const fremd = await browser.newPage();
  const st2 = await adminRoutes(fremd);
  await fremd.goto(`${BASE}/admin/audit-logs?action=evil%27&target_user_id=7%20OR%201`, { waitUntil: "networkidle" });
  await fremd.waitForSelector("#f-action", { timeout: 20000 });
  assert.equal(await fremd.locator("#f-action").inputValue(), "", "eine unbekannte Aktion wurde übernommen");
  assert.ok(st2.audit.length > 0 && st2.audit.every((q) => !q.includes("action=") && !q.includes("target_user_id=")),
    `unbekannte Werte erreichten die Abfrage: ${st2.audit.join(" | ")}`);
  await fremd.close();
});
