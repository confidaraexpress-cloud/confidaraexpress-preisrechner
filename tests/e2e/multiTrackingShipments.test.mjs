// E2E: Mehrere Trackingnummern in „Meine Sendungen" (TG-F6) — echter Dev-Server.
//
// Geprüft wird, was eine Quelltextprüfung nicht erreicht: dass eine Sendung mit drei
// Trackingnummern in der engen Tabellenzelle kompakt erscheint, im Sendungsdetail und in der
// Live-Trackingansicht aber VOLLSTÄNDIG — dass eine Sendung mit einer Nummer exakt bleibt,
// wie sie war — dass der Zustand nach einem Reload aus der API kommt — und dass auf 390 px
// jede Nummer lesbar im Bild steht.
//
// Alle Netzaufrufe sind gemockt. Es wird NIEMALS eine Buchung ausgelöst.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5359, BASE = `http://127.0.0.1:${PORT}`;
const MULTI_ID = 4711, EINZEL_ID = 4712;
const DREI = ["1Z999AA10000000001", "1Z999AA10000000002", "1Z999AA10000000003"];

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const SENDUNG = (over) => ({
  status: "booked", weight: 5, price_final: 22.19, selected_carrier: "ups",
  created_at: "2026-09-01T00:00:00Z", order_number: null,
  business_order_number: "CE-BS-2026-0042", cancellation_status: null, ...over,
});
const SHIPMENTS = [
  SENDUNG({ id: MULTI_ID, order_confirmation_number: "CE-AB-2026-000001",
            tracking_number: DREI[0], tracking_references: DREI }),
  SENDUNG({ id: EINZEL_ID, order_confirmation_number: "CE-AB-2026-000002",
            tracking_number: "1ZEINZEL0001", tracking_references: ["1ZEINZEL0001"] }),
];

let server, browser;

async function setupRoutes(page, { protokoll } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (protokoll) protokoll.push(p);

    if (p === `/api/shipments/${MULTI_ID}/tracking`) return json({
      shipmentId: MULTI_ID, tracking: null, trackingAvailable: true, trackingNumber: DREI[0],
      trackingReferences: DREI, trackingStatus: null, carrier: "UPS", carrierTrackingPage: null, source: "local",
    });
    if (p === `/api/shipments/${EINZEL_ID}/tracking`) return json({
      shipmentId: EINZEL_ID, tracking: null, trackingAvailable: true, trackingNumber: "1ZEINZEL0001",
      trackingReferences: ["1ZEINZEL0001"], trackingStatus: null, carrier: "UPS", carrierTrackingPage: null, source: "local",
    });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: SHIPMENTS, nextCursor: null });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { detached: true, stdio: "ignore" });
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
  if (server) {
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits node
    // startet. Ein Signal an npx ließe den Enkel auf dem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — Tabelle kompakt, Detail und Live-Ansicht vollständig, Einzelsendung unverändert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const protokoll = [];
  await setupRoutes(page, { protokoll });
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table tbody tr", { timeout: 20000 });

  const multiZeile = page.locator("table tbody tr", { hasText: "CE-AB-2026-000001" }).first();
  const einzelZeile = page.locator("table tbody tr", { hasText: "CE-AB-2026-000002" }).first();
  // In der engen Zelle nur die Anzahl — und keine abgeschnittene erste Nummer, die Vollständigkeit vortäuscht.
  assert.match(await multiZeile.innerText(), /3 Trackingnummern/);
  assert.ok(!(await multiZeile.innerText()).includes(DREI[0]), "die Zelle zeigt nur die erste Nummer");
  // Die Einzelsendung bleibt exakt, wie sie war.
  assert.match(await einzelZeile.innerText(), /Trackingnummer: 1ZEINZEL0001/);
  assert.ok(!/Trackingnummern/.test(await einzelZeile.innerText()));

  await multiZeile.getByRole("button", { name: "Sendung verfolgen" }).click();
  await page.waitForSelector(".shipment-tracking-references li", { timeout: 15000 });
  assert.deepEqual((await page.locator(".shipment-tracking-references li").allTextContents()).map((t) => t.trim()), DREI);
  await page.waitForSelector(".ce-list-table .shipment-track-number", { timeout: 15000 });
  assert.equal((await page.locator(".ce-list-table .shipment-track-number").innerText()).trim(), `Trackingnummern: ${DREI.join(", ")}`);
  assert.ok(protokoll.includes(`/api/shipments/${MULTI_ID}/tracking`), "die Live-Ansicht kommt nicht vom Server");

  const detail = await page.locator(".shipment-detail-card").innerText();
  assert.ok(!/undefined|null|Paket \d|transglobal/i.test(detail), `unzulässiger Text im Detail: ${detail}`);

  // Die Einzelsendung: eine Nummer, keine Liste.
  await multiZeile.getByRole("button", { name: "Sendung verfolgen" }).click(); // einklappen
  await einzelZeile.getByRole("button", { name: "Sendung verfolgen" }).click();
  await page.waitForSelector(".ce-list-table .shipment-track-number", { timeout: 15000 });
  assert.equal((await page.locator(".ce-list-table .shipment-track-number").innerText()).trim(), "Trackingnummer: 1ZEINZEL0001");
  assert.equal(await page.locator(".shipment-tracking-references").count(), 0);
  await page.close();
});

test("2 — nach einem Reload kommt die vollständige Liste wieder aus der API", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const protokoll = [];
  await setupRoutes(page, { protokoll });
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table tbody tr", { timeout: 20000 });
  const vorher = protokoll.filter((p) => p.endsWith("/kunde/shipments")).length;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("table tbody tr", { timeout: 20000 });
  assert.ok(protokoll.filter((p) => p.endsWith("/kunde/shipments")).length > vorher, "die Liste wurde nicht neu geladen");
  const multiZeile = page.locator("table tbody tr", { hasText: "CE-AB-2026-000001" }).first();
  assert.match(await multiZeile.innerText(), /3 Trackingnummern/);
  await page.close();
});

test("3 — auf 390 px steht jede Nummer lesbar in der Karte, ohne Querüberlauf", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ce-list-card", { timeout: 20000 });

  const karte = page.locator(".ce-list-card", { hasText: "CE-AB-2026-000001" }).first();
  assert.match(await karte.innerText(), /3 Trackingnummern/);
  const nummern = karte.locator(".ce-list-card-val.mono span");
  assert.deepEqual((await nummern.allTextContents()).map((t) => t.trim()), DREI);
  const einzel = page.locator(".ce-list-card", { hasText: "CE-AB-2026-000002" }).first();
  assert.match(await einzel.innerText(), /Trackingnummer: 1ZEINZEL0001/);

  const messung = await page.evaluate(() => {
    const spans = [...document.querySelectorAll(".ce-list-card .ce-list-card-val.mono span")];
    return {
      fenster: window.innerWidth,
      querUeberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rechts: spans.map((s) => s.getBoundingClientRect().right),
    };
  });
  assert.ok(messung.querUeberlauf <= 0, `horizontaler Überlauf: ${messung.querUeberlauf} px`);
  for (const r of messung.rechts) assert.ok(r <= messung.fenster + 1, `eine Nummer ragt aus dem Bild: ${r}`);
  await page.close();
});
