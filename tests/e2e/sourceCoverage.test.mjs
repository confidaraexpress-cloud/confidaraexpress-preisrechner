// E2E: Quellenlage des Angebotsvergleichs (Auftrag 2 / P5, Analysebefund C6) — echter Dev-Server,
// echter Browser, gemocktes Backend.
//
// Der Server unterscheidet seit Auftrag 2 drei Lagen, die vorher alle wie „Keine Angebote" aussahen:
//   A  200 mit Angeboten und `sourceCoverage: "partial"` → die Angebote bleiben, darüber steht der
//      Hinweis, dass die Liste unvollständig sein kann (kein Quellenname)
//   B  503 QUOTE_SOURCES_UNAVAILABLE (eine Quelle ausgefallen, keine andere hatte etwas) → technische,
//      wiederholbare Störung — NICHT „Keine Angebote gefunden"
//   C  422 NO_RATES_FOUND mit `sourceCoverage: "complete"` → das fachliche Ergebnis wie bisher
//   D  200 mit `sourceCoverage: "complete"` → kein Hinweis; eine Antwort OHNE das Feld ebenso
// Dazu 390 px: der Hinweis bleibt im Bild, kein horizontaler Überlauf. Sichtnachweise unter
// qa-nachweise/tg-auftrag2-browser/ (nur lokal, nicht versioniert).
//
// Kein echtes Backend, keine Bestellung, kein Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const PORT = 5461, BASE = `http://127.0.0.1:${PORT}`;
const BILDER = path.join(os.homedir(), ".confidaraexpress", "qa-nachweise", "tg-auftrag2-browser");

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "kunde@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "70173", customer_number: "CE-K-10030",
};

const TARIFF = {
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dhl", publicCarrierName: "DHL Express",
  publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
  netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19, transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-11-05T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-11-06T00:00:00Z",
};

const ANTWORT = (zusatz) => ({
  ceShipmentId: 1, tariffs: [TARIFF], availableShippingModes: ["standard"],
  publicCarriers: [{ id: "dhl", name: "DHL Express" }],
  customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
  ...zusatz,
});

let server, browser;

async function setup(page, { antwort, status = 200 }) {
  const konsole = [];
  page.on("pageerror", (e) => konsole.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/calculate-price")) return json(antwort, status);
    return json({});
  });
  await page.addInitScript(() => { localStorage.setItem("ce_token", "e2e-token"); });
  return konsole;
}

async function vergleiche(page) {
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await page.fill("#calc-from-zip", "70173");
  await page.fill("#calc-from-city", "Stuttgart");
  await page.fill("#calc-to-zip", "10115");
  await page.fill("#calc-to-city", "Berlin");
  await page.fill("#calc-weight", "2");
  await page.fill("#calc-packageCount", "1");
  await page.fill("#calc-length", "30");
  await page.fill("#calc-width", "20");
  await page.fill("#calc-height", "15");
  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
}

const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

test.before(async () => {
  mkdirSync(BILDER, { recursive: true });
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

test("A — partial: die Angebote bleiben, darüber steht der Hinweis auf die unvollständige Liste (ohne Quellenname)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const konsole = await setup(page, { antwort: ANTWORT({ sourceCoverage: "partial" }) });
  await vergleiche(page);
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  const hinweis = page.locator("#offers-coverage-notice");
  assert.equal(await hinweis.count(), 1, "kein Hinweis auf die Quellenlage");
  const t = await text(hinweis);
  assert.match(t, /unvollständig/);
  assert.match(t, /erneute Berechnung/);
  assert.doesNotMatch(t, /jumingo|transglobal/i);
  assert.equal(await page.locator(".offer-card").count(), 1, "die gelieferten Angebote fehlen");
  assert.equal(await page.locator(".alert-error").count(), 0, "ein Teilausfall wurde als Fehler dargestellt");
  await hinweis.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(BILDER, "p5-partial-1440.png") });
  assert.deepEqual(konsole, []);
  await page.close();
});

test("B — 503 QUOTE_SOURCES_UNAVAILABLE: technische, wiederholbare Störung statt „Keine Angebote gefunden“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setup(page, { status: 503, antwort: {
    error: "Die Angebote konnten derzeit nicht vollständig abgerufen werden. Bitte versuchen Sie es in Kürze erneut.",
    code: "QUOTE_SOURCES_UNAVAILABLE", sourceCoverage: "partial",
  } });
  await vergleiche(page);
  await page.waitForSelector(".alert-error", { timeout: 20000 });
  const banner = await text(page.locator(".alert-error").first());
  assert.match(banner, /Angebote derzeit nicht abrufbar/);
  assert.match(banner, /erneut/);
  assert.doesNotMatch(banner, /Keine Angebote gefunden|Versandroute, Versanddatum/);
  assert.doesNotMatch(banner, /jumingo|transglobal/i);
  assert.equal(await page.locator(".offer-card").count(), 0);
  await page.screenshot({ path: path.join(BILDER, "p5-unavailable-1440.png") });
  await page.close();
});

test("C — 422 NO_RATES_FOUND (complete): das fachliche Ergebnis bleibt, wie es war", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setup(page, { status: 422, antwort: { error: "Keine Preise gefunden", code: "NO_RATES_FOUND", sourceCoverage: "complete" } });
  await vergleiche(page);
  await page.waitForSelector(".alert-error", { timeout: 20000 });
  const banner = await text(page.locator(".alert-error").first());
  assert.match(banner, /Keine Angebote gefunden/);
  assert.equal(await page.locator("#offers-coverage-notice").count(), 0);
  await page.close();
});

test("D — complete oder ohne das Feld: kein Hinweis", async () => {
  for (const zusatz of [{ sourceCoverage: "complete" }, {}]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await setup(page, { antwort: ANTWORT(zusatz) });
    await vergleiche(page);
    await page.waitForSelector(".offer-card", { timeout: 20000 });
    assert.equal(await page.locator("#offers-coverage-notice").count(), 0, JSON.stringify(zusatz));
    await page.close();
  }
});

test("E — 390 px: der Hinweis bleibt im Bild, kein horizontaler Überlauf", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setup(page, { antwort: ANTWORT({ sourceCoverage: "partial" }) });
  await vergleiche(page);
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  const hinweis = page.locator("#offers-coverage-notice");
  await hinweis.scrollIntoViewIfNeeded();
  const box = await hinweis.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `Hinweis ragt heraus: ${JSON.stringify(box)}`);
  const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(ueberlauf <= 0, `horizontaler Überlauf ${ueberlauf}px`);
  await page.screenshot({ path: path.join(BILDER, "p5-partial-390.png") });
  await page.close();
});
