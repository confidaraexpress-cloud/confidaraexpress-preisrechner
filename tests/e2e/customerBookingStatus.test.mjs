// E2E: eine Sendung in Buchungsklärung in „Meine Sendungen" (Package C · C4) — echter Dev-Server.
//
// Geprüft wird, was ein Quelltextanker nicht erreicht: dass die Zeile im Browser tatsächlich den
// neutralen Status und den beruhigenden Satz trägt, dass sie in Tabelle UND Karte keinen einzigen
// Knopf anbietet, dass die gebuchte Nachbarzeile ihre Aktionen behält, dass für die Klärung kein
// Sendungsendpunkt gerufen wird, dass kein Anbieterwert sichtbar wird und dass die Übersicht
// denselben Status zeigt.
//
// Alle Netzaufrufe sind gemockt. Es wird NIEMALS eine Buchung ausgelöst.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5392, BASE = `http://127.0.0.1:${PORT}`;
const PRUEFUNG_ID = 5102, GEBUCHT_ID = 5101;
const STATUS_TEXT = "Buchungsstatus wird geprüft";
const HINWEIS_TEXT = "Sie müssen aktuell nichts tun.";
const ANBIETERWERTE = /transglobal|jumingo|TG-REF-E2E-1|TG-SVC-9|TG-FAIL-E2E|YourReference|ServiceID/i;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const SHIPMENTS = [
  {
    id: PRUEFUNG_ID, status: "booking", weight: 3, price_final: 18.5, selected_carrier: "dhl",
    created_at: "2026-09-12T08:00:00Z", business_order_number: "CE-BS-2026-0051",
    order_confirmation_number: null, tracking_number: null, tracking_references: [], cancellation_status: null,
    // Der Server liefert KEINE Anbieterfelder (Backend: package-c-customer-privacy-pg, K1). Sie stehen
    // hier trotzdem, damit messbar wird, dass die Oberfläche solche Werte nie anzeigt.
    provider: "transglobal", provider_booking_reference: "TG-REF-E2E-1", provider_service_id: "TG-SVC-9",
    provider_fail_reference: "TG-FAIL-E2E",
  },
  {
    id: GEBUCHT_ID, status: "booked", weight: 5, price_final: 22.19, selected_carrier: "ups",
    created_at: "2026-09-11T08:00:00Z", business_order_number: "CE-BS-2026-0050",
    order_confirmation_number: "CE-AB-2026-000050", tracking_number: "1ZE2EBOOKED01",
    tracking_references: ["1ZE2EBOOKED01"], cancellation_status: null,
  },
];

let server, browser;

async function setupRoutes(page, { protokoll } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (protokoll) protokoll.push(p);

    if (p === `/api/shipments/${GEBUCHT_ID}/tracking`) return json({
      shipmentId: GEBUCHT_ID, tracking: null, trackingAvailable: true, trackingNumber: "1ZE2EBOOKED01",
      trackingReferences: ["1ZE2EBOOKED01"], trackingStatus: null, carrier: "UPS", carrierTrackingPage: null, source: "local",
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

test("1 — Tabelle: die Buchungsklärung ist neutral und ohne Aktion; die gebuchte Sendung behält ihre Aktionen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const protokoll = [];
  await setupRoutes(page, { protokoll });
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table tbody tr", { timeout: 20000 });

  const pruefung = page.locator("table tbody tr", { hasText: STATUS_TEXT }).first();
  await pruefung.waitFor({ timeout: 10000 });
  assert.equal((await pruefung.locator(".badge").first().innerText()).trim(), STATUS_TEXT);
  assert.ok((await pruefung.innerText()).includes(HINWEIS_TEXT), "der beruhigende Satz fehlt");
  assert.equal(await pruefung.getByRole("button").count(), 0, "die Buchungsklärung bietet eine Aktion an");

  const gebucht = page.locator("table tbody tr", { hasText: "CE-AB-2026-000050" }).first();
  for (const name of ["Sendung verfolgen", "Dokumente", "Stornieren"]) {
    assert.equal(await gebucht.getByRole("button", { name }).count(), 1, `die gebuchte Sendung verliert „${name}"`);
  }
  assert.ok(!(await gebucht.innerText()).includes(HINWEIS_TEXT), "der Satz steht an der gebuchten Sendung");

  const tabelle = await page.locator(".ce-list-table").innerText();
  assert.ok(!ANBIETERWERTE.test(tabelle), "ein Anbieterwert ist sichtbar");
  assert.ok(!/erneut buchen|nochmal buchen|noch einmal buchen|fehlgeschlagen|Fehler/i.test(tabelle), "technischer Fehler oder erneutes Buchen sichtbar");
  assert.ok(!(await page.content()).includes("TG-REF-E2E-1"), "die Anbieterreferenz steht im DOM");

  // Die gebuchte Sendung funktioniert unverändert — und für die Klärung wird nichts abgerufen.
  await gebucht.getByRole("button", { name: "Sendung verfolgen" }).click();
  await page.waitForSelector(".ce-list-table .shipment-track-number", { timeout: 15000 });
  assert.ok(protokoll.includes(`/api/shipments/${GEBUCHT_ID}/tracking`));
  assert.ok(!protokoll.some((p) => p.includes(`/shipments/${PRUEFUNG_ID}`)), "für die Buchungsklärung wurde ein Sendungsendpunkt gerufen");
  await page.close();
});

test("2 — auf 390 px: dieselbe Aussage in der Karte, ohne Knopf und ohne Querüberlauf", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ce-list-card", { timeout: 20000 });

  const karte = page.locator(".ce-list-card", { hasText: STATUS_TEXT }).first();
  assert.equal((await karte.locator(".badge").first().innerText()).trim(), STATUS_TEXT);
  assert.ok((await karte.innerText()).includes(HINWEIS_TEXT), "der beruhigende Satz fehlt in der Karte");
  assert.equal(await karte.getByRole("button").count(), 0, "die Karte der Buchungsklärung bietet eine Aktion an");
  const gebucht = page.locator(".ce-list-card", { hasText: "CE-AB-2026-000050" }).first();
  assert.equal(await gebucht.getByRole("button", { name: "Sendung verfolgen" }).count(), 1);

  assert.ok(!ANBIETERWERTE.test(await page.locator(".ce-list-cards").innerText()), "ein Anbieterwert ist sichtbar");
  const messung = await page.evaluate(() => ({
    querUeberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.ok(messung.querUeberlauf <= 0, `horizontaler Überlauf: ${messung.querUeberlauf} px`);
  await page.close();
});

test("3 — Übersicht: „Letzte Sendungen“ zeigt denselben neutralen Status", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const zeile = page.locator(".ov-list-row", { hasText: STATUS_TEXT }).first();
  await zeile.waitFor({ timeout: 20000 });
  assert.equal((await zeile.locator(".badge").first().innerText()).trim(), STATUS_TEXT);
  assert.ok(!ANBIETERWERTE.test(await zeile.innerText()), "ein Anbieterwert ist sichtbar");
  await page.close();
});
