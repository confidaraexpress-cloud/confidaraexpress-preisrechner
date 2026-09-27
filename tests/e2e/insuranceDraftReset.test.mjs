// E2E: JUM-06 — „keine Zusatzversicherung“ nach einer versicherten Neubepreisung.
// Echter Dev-Server, echter Browser, gemocktes Backend.
//
// Der Befund: die versicherte Neubepreisung (Stufenmodell) schreibt die Versicherung per PUT in den
// Anbieterentwurf. Wählte der Kunde danach wieder „keine“, bepreiste die Seite nichts neu — /book las
// beim Buchen den noch versicherten Einkauf und lehnte mit „Preis geändert“ ab.
//
// Gemessen wird:
//   (1) nach „Standard“ → „keine“ geht GENAU EINE Neubepreisung mit `insuranceType: "none"` hinaus,
//       und solange sie läuft, ist „Kostenpflichtig buchen“ gesperrt; danach ist es frei, und /book
//       trägt `insuranceSelection: { type: "none" }`,
//   (2) wer nie versichert bepreist hat, löst mit „keine“ KEINEN Aufruf aus (kein Mehraufwand).
//
// Kein echtes Backend, keine Bestellung, keine Neubepreisung beim Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5418, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const TARIF = {
  id: 1, shipper_tariff_id: 1, offerId: "jum60000000000000000000000000006",
  publicCarrierId: "dhl", publicCarrierName: "DHL Express", publicServiceName: "Standardversand",
  serviceType: "pickup", currency: "EUR", netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19,
  transitDaysMin: 1, transitDaysMax: 2, trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-08-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-08-08T00:00:00Z",
  insuranceAvailable: true,
  insuranceDetails: { isInsurable: true, extraInsurancePriceBruttoPreselect: 3.99, extraInsurancePremiumPriceBruttoPreselect: 7.49 },
};

const VERSICHERT = {
  selectedInsurance: "standard",
  totals: { customerShippingNet: 18.65, shippingVat: 3.54, customerShippingGross: 22.19,
            insuranceGross: 3.99, customerTotalNet: 22.64, customerTotalGross: 26.18 },
};
const UNVERSICHERT = {
  selectedInsurance: "none",
  totals: { customerShippingNet: 18.65, shippingVat: 3.54, customerShippingGross: 22.19,
            insuranceGross: 0, customerTotalNet: 18.65, customerTotalGross: 22.19 },
};

let server, browser;

async function setupRoutes(page, { noneVerzoegerungMs = 1500 } = {}) {
  const neubepreisungen = [];
  let bookPayload = null;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      ceShipmentId: 4711, tariffs: [TARIF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/insurance/reprice")) {
      const body = JSON.parse(route.request().postData() || "{}");
      neubepreisungen.push({ insuranceType: body.insuranceType, offerId: body.offerId, ceShipmentId: body.ceShipmentId });
      if (body.insuranceType === "none") {
        await new Promise((r) => setTimeout(r, noneVerzoegerungMs));
        return json(UNVERSICHERT);
      }
      return json(VERSICHERT);
    }
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    if (p.includes("/api/jumingo/book")) {
      bookPayload = JSON.parse(route.request().postData() || "{}");
      return json({ trackingNumber: "TRACK1", labelUrl: null });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return { neubepreisungen, bookPayload: () => bookPayload };
}

async function zurVersicherung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".ins-cards", { timeout: 20000 });
}

const waehle = async (page, name) => {
  await page.locator(`.ins-card:has-text("${name}")`).first().locator(".ins-card-name").click();
};
const buchenKnopf = (page) => page.getByRole("button", { name: /Kostenpflichtig buchen/ });

async function bestaetigeHinweise(page) {
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
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
  if (server?.pid) { try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ } }
});

test("(1) Standard → keine: der Entwurf wird ohne Versicherung neu bepreist, bis dahin ist die Buchung gesperrt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const mock = await setupRoutes(page, { noneVerzoegerungMs: 2500 });
  await zurVersicherung(page);
  await bestaetigeHinweise(page);

  await waehle(page, "Standardversicherung");
  for (let i = 0; i < 40 && !mock.neubepreisungen.some((n) => n.insuranceType === "standard"); i++) {
    await page.waitForTimeout(100);
  }
  assert.ok(mock.neubepreisungen.some((n) => n.insuranceType === "standard"), "die versicherte Neubepreisung fehlt");

  await waehle(page, "Keine zusätzliche Transportversicherung");
  for (let i = 0; i < 20 && !mock.neubepreisungen.some((n) => n.insuranceType === "none"); i++) {
    await page.waitForTimeout(100);
  }
  const ruecksetzungen = mock.neubepreisungen.filter((n) => n.insuranceType === "none");
  assert.equal(ruecksetzungen.length, 1, `genau eine Rücksetzung erwartet, waren ${JSON.stringify(mock.neubepreisungen)}`);
  assert.equal(ruecksetzungen[0].offerId, TARIF.offerId, "die Rücksetzung trägt die Angebotskennung");
  assert.equal(ruecksetzungen[0].ceShipmentId, 4711, "die Rücksetzung adressiert den CE-Sendungshandle");

  // Während die Rücksetzung läuft: gesperrt.
  assert.equal(await buchenKnopf(page).isDisabled(), true, "die Buchung ist während der Rücksetzung freigegeben");

  // Nach der bestätigten Rücksetzung: frei — und /book bucht ohne Versicherung.
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Kostenpflichtig buchen/.test(x.textContent || ""));
    return b && !b.disabled;
  }, null, { timeout: 10000 });
  await buchenKnopf(page).click();
  for (let i = 0; i < 30 && !mock.bookPayload(); i++) await page.waitForTimeout(100);
  const payload = mock.bookPayload();
  assert.ok(payload, "der /book-Request muss abgesetzt worden sein");
  assert.deepEqual(payload.insuranceSelection, { type: "none" });
  assert.equal(mock.neubepreisungen.filter((n) => n.insuranceType === "none").length, 1, "keine zweite Rücksetzung");
  await page.close();
});

test("(2) ohne vorherige versicherte Neubepreisung löst „keine“ keinen Aufruf aus", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const mock = await setupRoutes(page);
  await zurVersicherung(page);
  await bestaetigeHinweise(page);
  await waehle(page, "Keine zusätzliche Transportversicherung");
  await page.waitForTimeout(900);
  assert.equal(mock.neubepreisungen.length, 0, `unerwartete Neubepreisung: ${JSON.stringify(mock.neubepreisungen)}`);
  assert.equal(await buchenKnopf(page).isDisabled(), false, "die Buchung muss ohne Versicherung sofort frei sein");
  await page.close();
});
