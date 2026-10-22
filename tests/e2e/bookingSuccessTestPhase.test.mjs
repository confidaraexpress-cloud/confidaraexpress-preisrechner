// E2E: Erfolgsseite in der internen Testphase (Auftrag 2 / P2, Analysebefund C2) — echter Dev-Server,
// echter Browser, gemocktes Backend.
//
// Canonical v2.60: der Versandauftrag ist echt, der Beleg ein Testdokument — keine Rechnung, keine
// Forderung. Bis Auftrag 2 stand daneben trotzdem „Rechnungsnummer", „Ihre Rechnung wird automatisch
// erstellt" und „Zu meinen Rechnungen". Gemessen wird:
//   A  Testphase (Server meldet `invoicingPhase: "test_phase"`, der Beleg ist ein Testdokument):
//      Testbelegnummer · Testdokument-Zeile · Hinweis „keine Rechnung" · „Zu meinen Belegen" — und
//      nirgends eine Rechnungszusage. Der Versandauftrag bleibt ausdrücklich echt (Erfolgstitel, Label).
//   B  reguläre Phase: die bisherigen Worte (Rechnungsnummer, Rechnung wird erstellt, Zu meinen Rechnungen).
//   C  390 px: Testphase ohne horizontalen Überlauf.
// Sichtnachweise unter qa-nachweise/tg-auftrag2-browser/ (nur lokal).
//
// Es wird NIEMALS eine echte Bestellung ausgelöst: /api/jumingo/book ist gemockt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5462, BASE = `http://127.0.0.1:${PORT}`;
const CE_SHIPMENT_ID = 4711;
const BILDER = path.join(os.homedir(), ".confidaraexpress", "qa-nachweise", "tg-auftrag2-browser");
const PDF = Buffer.from("%PDF-1.4\n% Testbeleg\n%%EOF\n", "utf8");

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const TARIFF = {
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dhl", publicCarrierName: "DHL Express",
  publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
  netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19, transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-11-05T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-11-06T00:00:00Z",
};

const TESTPHASE = {
  invoicingPhase: "test_phase", invoiceNumber: "CE-TEST-RE26-00007",
  invoice: { invoice_number: "CE-TEST-RE26-00007", document_status: "ready", is_test_document: true, invoice_test_phase: true, status: "open" },
};
const REGULAER = {
  invoicingPhase: "regular", invoiceNumber: "CE-RE26-00001",
  invoice: { invoice_number: "CE-RE26-00001", document_status: "ready", is_test_document: false, status: "open" },
};

let server, browser;

async function setupRoutes(page, phase) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (/^\/api\/shipments\/\d+\/label$/.test(p)) return route.fulfill({ status: 200, headers: { "content-type": "application/pdf" }, body: PDF });
    if (/^\/api\/shipments\/\d+\/documents$/.test(p)) return json({ shipmentId: CE_SHIPMENT_ID, documents: [] });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [phase.invoice], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      ceShipmentId: CE_SHIPMENT_ID, tariffs: [TARIFF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null, sourceCoverage: "complete",
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-11-05T09:00:00Z", availableUntil: "2026-11-05T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    if (p.includes("/api/jumingo/book")) return json({
      message: "Sendung gebucht", ceShipmentId: CE_SHIPMENT_ID, trackingNumber: "TRACK1", labelUrl: null,
      invoiceNumber: phase.invoiceNumber, invoicingPhase: phase.invoicingPhase, amount: 22.19, billingMode: "single",
      testBooking: false, labelStatus: "available", labelRetrievable: true,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function bucheBisErfolg(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
}

const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

async function erfolgsseite(page, hinweisMuster) {
  // Der endgültige Modus kommt aus dem gepollten Beleg — bis dahin steht der neutrale „wird erstellt"-Hinweis.
  // Gewartet wird auf den modus-spezifischen Hinweistext (utils/bookingSuccessView.mjs, invoiceDeliveryHint).
  await page.waitForFunction((muster) => new RegExp(muster).test(document.querySelector(".booking-success-delivery .alert")?.innerText || ""),
    hinweisMuster.source, { timeout: 20000 });
  return {
    titel: await text(page.locator(".booking-success-title")),
    nummernLabel: await text(page.locator("#booking-success-document-number-label")),
    zeile: await text(page.locator("#booking-success-document-line")),
    hinweis: await text(page.locator(".booking-success-delivery .alert")),
    knopf: await text(page.locator("#booking-success-documents-link")),
    seite: await text(page.locator(".booking-success-wrap")),
  };
}

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

test("A — Testphase: Testbelegnummer, Testdokument, Belege — keine Rechnungszusage neben „keine Rechnung“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, TESTPHASE);
  await bucheBisErfolg(page);
  const s = await erfolgsseite(page, /Interner Testbetrieb/);
  assert.match(s.titel, /Sendung erfolgreich gebucht/);
  assert.equal(s.nummernLabel, "Testbelegnummer");
  assert.match(s.zeile, /Testdokument/);
  assert.match(s.zeile, /keine Rechnung/);
  assert.match(s.hinweis, /keine Rechnung/);
  assert.equal(s.knopf, "Zu meinen Belegen");
  assert.ok(s.seite.includes("CE-TEST-RE26-00007"), "die Testbelegnummer fehlt");
  // Nirgends eine Rechnungszusage — weder Nummernlabel noch Erstellungszeile noch Knopf noch Betragsverweis.
  assert.doesNotMatch(s.seite, /Rechnungsnummer|Ihre Rechnung wird|Zu meinen Rechnungen|auf Ihrer Rechnung/);
  await page.screenshot({ path: path.join(BILDER, "p2-testphase-1440.png"), fullPage: true });
  await page.close();
});

test("B — reguläre Phase: die bisherigen Worte bleiben", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, REGULAER);
  await bucheBisErfolg(page);
  const s = await erfolgsseite(page, /zusätzlich separat als PDF/);
  assert.equal(s.nummernLabel, "Rechnungsnummer");
  assert.match(s.zeile, /Ihre Rechnung wird automatisch erstellt/);
  assert.equal(s.knopf, "Zu meinen Rechnungen");
  assert.doesNotMatch(s.seite, /Testdokument|Testbeleg/);
  await page.close();
});

test("C — 390 px: Testphase ohne horizontalen Überlauf, die Belegzeile im Bild", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(page, TESTPHASE);
  await bucheBisErfolg(page);
  const s = await erfolgsseite(page, /Interner Testbetrieb/);
  assert.equal(s.nummernLabel, "Testbelegnummer");
  const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(ueberlauf <= 0, `horizontaler Überlauf ${ueberlauf}px`);
  await page.screenshot({ path: path.join(BILDER, "p2-testphase-390.png"), fullPage: true });
  await page.close();
});
