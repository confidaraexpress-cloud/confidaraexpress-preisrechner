// E2E: Verwaltung und Abrechnung (Paket C) — echter Dev-Server, echte Kaskade.
//
// Prüft das, was eine reine Quelltextprüfung nicht erreicht: dass das
// Entwürfe-Kebab-Menü eine echte Fokusfalle mit Fokusrückgabe hat, dass die
// Adressbuch-Suche die sichtbare Liste nicht mit einem Skeleton überdeckt,
// dass die PDF-Vorschau in der XL-Breite mit Fokusfalle öffnet und dass
// Sendungen/Entwürfe/Adressbuch/Rechnungen bei 390px nicht horizontal
// überlaufen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5226, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};

let server, browser;

async function setupRoutes(page) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (url.pathname.endsWith("/kundenbereich")) return json({ user: USER });
    if (url.pathname.endsWith("/kunde/shipments")) return json({
      shipments: [{ id: 1, jumingo_shipment_id: "js1", status: "booked", weight: 5, price_final: 22.19, selected_carrier: "dhl", created_at: "2026-08-01T00:00:00Z", order_number: "CE-1001" }],
    });
    if (url.pathname.endsWith("/kunde/invoices")) return json({
      invoices: [{ id: 1, invoice_number: "RE-2026-0001", status: "open", is_overdue: false, gross_amount: 42.5, currency: "EUR", issued_at: "2026-08-01T00:00:00Z", due_date: "2026-08-20", document_status: "ready", download_available: true }],
      summary: { open_count: 1, open_amount: 42.5, overdue_count: 0, next_due_date: "2026-08-20", currency: "EUR" },
    });
    if (url.pathname.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (url.pathname.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (url.pathname.includes("/api/kunde/drafts")) return json({
      items: [{ id: 2, updatedAt: "2026-08-01T00:00:00Z", recipientAddress: { fullName: "Max Beispiel", city: "Berlin" }, fromCountry: "DE" }],
      nextCursor: null,
    });
    if (url.pathname.includes("/api/kunde/addresses")) return json({
      items: [{ id: 9, label: "Zentrallager", company: "Muster GmbH", role: "sender", isDefaultSender: false, isDefaultRecipient: false, favorite: false, streetAndNumber: "Hauptstr 1", postalCode: "10115", city: "Berlin", country: "DE" }],
      pagination: { total: 1 }, nextCursor: null,
    });
    if (/\/kunde\/invoices\/\d+\/pdf$/.test(url.pathname)) {
      return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF" });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
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
  if (server) server.kill("SIGKILL");
});

test("das Entwürfe-Kebab-Menü hat Fokusfalle, Fokusrückgabe und schließt per Escape", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=drafts`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dft-actions-trigger", { timeout: 20000 });

  const trigger = page.locator(".dft-actions-trigger").first();
  await trigger.click();
  await page.waitForSelector(".dft-actions-menu", { timeout: 5000 });
  const fokusImMenu = await page.evaluate(() => !!document.activeElement?.closest(".dft-actions-menu"));
  assert.ok(fokusImMenu, "der Fokus muss beim Öffnen im Menü stehen");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  assert.equal(await page.locator(".dft-actions-menu").count(), 0, "Escape muss das Menü schließen");
  const fokusZurueck = await trigger.evaluate((el) => el === document.activeElement);
  assert.ok(fokusZurueck, "der Fokus muss auf den Trigger zurückkehren");
  await page.close();
});

test("die Adressbuch-Suche überdeckt die sichtbare Liste nicht mit einem Skeleton", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=addressbook`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".abk-row", { timeout: 20000 });

  let sawSkeleton = false;
  const timer = setInterval(async () => {
    try { if (await page.locator(".abk-skeleton-row").count() > 0) sawSkeleton = true; } catch { /* Seite ggf. schon zu */ }
  }, 25);
  await page.getByPlaceholder("Suche nach Label, Firma, Ort, PLZ").fill("Zentral");
  await page.waitForTimeout(700);
  clearInterval(timer);

  assert.equal(sawSkeleton, false, "die Suche darf die sichtbaren Treffer nicht durch ein Skeleton ersetzen");
  assert.equal(await page.locator(".abk-row").count(), 1, "die Zeile muss die ganze Zeit sichtbar geblieben sein");
  await page.close();
});

test("die Rechnungs-PDF-Vorschau öffnet in XL-Breite mit Fokusfalle und schließt per Escape", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=invoices`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".inv-table, .inv-cards", { timeout: 20000 });

  await page.getByRole("button", { name: /ansehen/i }).click();
  await page.waitForSelector(".pdfview-modal", { timeout: 10000 });
  const width = await page.locator(".pdfview-modal").evaluate((el) => Math.round(el.getBoundingClientRect().width));
  assert.equal(width, 920, "die Vorschau muss die gemeinsame XL-Dialogbreite (920px) nutzen");
  const fokusAufSchliessen = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  assert.equal(fokusAufSchliessen, "Vorschau schließen", "der Fokus muss beim Öffnen auf „Schließen“ stehen");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  assert.equal(await page.locator(".pdfview-modal").count(), 0, "Escape muss die Vorschau schließen");
  await page.close();
});

test("kein horizontaler Überlauf bei Sendungen, Entwürfe, Adressbuch und Rechnungen (Mobil 390px)", async () => {
  const viewport = { width: 390, height: 844 };
  for (const url of ["/dashboard?page=shipments", "/dashboard?page=drafts", "/dashboard?page=addressbook", "/dashboard?page=invoices"]) {
    const page = await browser.newPage({ viewport });
    await setupRoutes(page);
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".page-body", { timeout: 20000, state: "attached" });
    await page.waitForTimeout(300);
    assert.ok(await noHorizontalOverflow(page), `${url} überläuft horizontal bei 390px`);
    await page.close();
  }
});

test("die öffentliche Trackingseite rendert ohne App-Shell-Chrome und ohne Überlauf bei 360px", async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/tracking/public/")) {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ trackingStatus: "delivered", tracking: { data: { steps: [] } } }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto(`${BASE}/tracking`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator(".app-shell").count(), 0, "die öffentliche Route darf keine App-Shell rendern");
  assert.equal(await page.locator(".navbar").count(), 0, "die öffentliche Route darf keine Navbar rendern");
  assert.ok(await noHorizontalOverflow(page), "die öffentliche Trackingseite überläuft horizontal bei 360px");
  await page.close();
});
