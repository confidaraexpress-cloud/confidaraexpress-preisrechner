// E2E: Betreiberentscheidungen E1/E2 (2026-11-10) — Grenzen der gestuften Zusatzversicherung.
// Echter Dev-Server, echter Browser, gemocktes Backend.
//
//   E1  Liegt der Warenwert über der Grenze des Tarifs, gibt es KEINE Zusatzversicherung — auch keine
//       teilweise. Der Versand bleibt ohne Zusatzversicherung buchbar.
//   E2  Der Versicherungswert ist nie höher als der Warenwert.
//
// Die Grenze nennt der Server je Stufe am Tarif (`insuranceCover`); die Oberfläche liest sie nur.
//
// Gemessen wird:
//   (1) über der Grenze: keine Stufenkarten, ein Hinweis mit der Grenze des Servers, KEINE Neubepreisung —
//       und „Kostenpflichtig buchen“ bucht ohne Zusatzversicherung,
//   (2) Versicherungswert über dem Warenwert: Fehler am Feld, Buchung gesperrt, keine Neubepreisung mit
//       diesem Wert; vorbelegt ist der Warenwert in ganzen Euro,
//   (3) Versicherungswert unter dem Warenwert: Hinweis auf die mögliche anteilige Kürzung; /book trägt den
//       gewählten Wert und den bestätigten Gesamtbetrag,
//   (4) nur die Stufe, die der Server anbietet, erscheint,
//   (5) 390 px: der Hinweis über der Grenze passt ohne waagerechtes Scrollen.
//
// Kein echtes Backend, keine Bestellung, keine Neubepreisung beim Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5781, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

// Der Warenwert des Formulars (helpers/newShipmentForm.mjs) ist 250 €.
const VERFUEGBAR = { state: "available", coverLimit: 20000, maxInsuredValue: 250 };
const UEBER_GRENZE = { state: "above_cover_limit", coverLimit: 20000, maxInsuredValue: null };

const TARIF = (insuranceCover) => ({
  id: 1, shipper_tariff_id: 1, offerId: "jum7e1e2000000000000000000000071",
  publicCarrierId: "dhl", publicCarrierName: "DHL Express", publicServiceName: "Standardversand",
  serviceType: "pickup", currency: "EUR", netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19,
  transitDaysMin: 1, transitDaysMax: 2, trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-08-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-08-08T00:00:00Z",
  insuranceAvailable: true,
  insuranceDetails: { isInsurable: true, extraInsurancePriceBruttoPreselect: 3.99, extraInsurancePremiumPriceBruttoPreselect: 7.49 },
  insuranceCover,
});

const VERSICHERT = {
  selectedInsurance: "standard",
  totals: { customerShippingNet: 18.65, shippingVat: 3.54, customerShippingGross: 22.19,
            insuranceGross: 3.99, customerTotalNet: 22.64, customerTotalGross: 26.18 },
};

let server, browser;

async function setupRoutes(page, tarif) {
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
      ceShipmentId: 4711, tariffs: [tarif], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/insurance/reprice")) {
      const body = JSON.parse(route.request().postData() || "{}");
      neubepreisungen.push(body);
      return json(body.insuranceType === "none"
        ? { selectedInsurance: "none", totals: { ...VERSICHERT.totals, insuranceGross: 0, customerTotalNet: 18.65, customerTotalGross: 22.19 } }
        : VERSICHERT);
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

async function zurBuchung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".booking-confirm-panel", { timeout: 20000 });
}

async function bestaetigeHinweise(page) {
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
}
const buchenKnopf = (page) => page.getByRole("button", { name: /Kostenpflichtig buchen/ });
const waehle = (page, name) => page.locator(`.ins-card:has-text("${name}")`).first().locator(".ins-card-name").click();
const flach = (s) => String(s || "").replace(/\s+/g, " ").trim();
async function warteAuf(page, bedingung, ms = 4000) {
  for (let i = 0; i < ms / 100 && !bedingung(); i++) await page.waitForTimeout(100);
  return bedingung();
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
  stopDevServer(server, "SIGKILL");
});

test("(1) E1: über der Grenze keine Stufe und keine Neubepreisung — gebucht wird ohne Zusatzversicherung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const mock = await setupRoutes(page, TARIF({ standard: UEBER_GRENZE, premium: UEBER_GRENZE }));
  await zurBuchung(page);
  assert.equal(await page.locator(".ins-cards").count(), 0, "über der Grenze erscheinen Stufenkarten");
  assert.equal(await page.locator("#ins-value").count(), 0, "über der Grenze erscheint ein Versicherungswert-Feld");
  const hinweis = page.locator('.booking-insurance-box[role="note"]');
  await hinweis.waitFor({ timeout: 10000 });
  assert.equal(flach(await hinweis.locator(".ins-head-title").textContent()), "Transportversicherung");
  assert.equal(flach(await hinweis.locator("#ins-cover-notice").textContent()),
    "Für diesen Warenwert ist keine Zusatzversicherung verfügbar. Eine Zusatzversicherung ist für diesen Tarif nur bis zu einem Warenwert von 20.000 € möglich.");
  assert.doesNotMatch(await page.locator(".booking-confirm-panel").innerText(), /Bitte wählen Sie einen Versicherungswert bis/);

  await bestaetigeHinweise(page);
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Kostenpflichtig buchen/.test(x.textContent || ""));
    return b && !b.disabled;
  }, null, { timeout: 10000 });
  await buchenKnopf(page).click();
  assert.ok(await warteAuf(page, () => mock.bookPayload() !== null), "der /book-Request fehlt");
  assert.deepEqual(mock.bookPayload().insuranceSelection, { type: "none" });
  assert.equal(mock.neubepreisungen.length, 0, "über der Grenze wurde eine Zusatzversicherung bepreist");
  await page.close();
});

test("(2) E2: Versicherungswert über dem Warenwert → Fehler, Buchung gesperrt, keine Neubepreisung damit", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const mock = await setupRoutes(page, TARIF({ standard: VERFUEGBAR, premium: VERFUEGBAR }));
  await zurBuchung(page);
  await bestaetigeHinweise(page);
  await waehle(page, "Standardversicherung");
  assert.ok(await warteAuf(page, () => mock.neubepreisungen.some((n) => n.insuranceType === "standard")), "keine Neubepreisung");
  const erste = mock.neubepreisungen.find((n) => n.insuranceType === "standard");
  assert.equal(erste.extraInsuranceValue, 250, "vorbelegt ist der Warenwert in ganzen Euro");

  await page.getByRole("button", { name: "Versicherungswert anpassen" }).click();
  const feld = page.locator("#ins-value");
  assert.equal(await feld.getAttribute("step"), "1");
  assert.equal(await feld.getAttribute("max"), "250");
  await feld.fill("300");
  await feld.blur();
  const fehler = page.locator(".ins-inputs .field-error");
  await fehler.waitFor({ timeout: 5000 });
  assert.equal(flach(await fehler.textContent()), "Der Versicherungswert darf den Warenwert nicht überschreiten.");
  await page.waitForTimeout(1200);   // länger als die Entprellung der Neubepreisung
  assert.ok(!mock.neubepreisungen.some((n) => n.extraInsuranceValue === 300), "der unzulässige Wert wurde bepreist");
  assert.equal(await buchenKnopf(page).isDisabled(), true, "mit Überversicherung ist die Buchung frei");
  await page.close();
});

test("(3) Unterversicherung: Hinweis auf anteilige Kürzung; /book trägt Wert und bestätigten Gesamtbetrag", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const mock = await setupRoutes(page, TARIF({ standard: VERFUEGBAR, premium: VERFUEGBAR }));
  await zurBuchung(page);
  await bestaetigeHinweise(page);
  await waehle(page, "Standardversicherung");
  await page.getByRole("button", { name: "Versicherungswert anpassen" }).click();
  await page.locator("#ins-value").fill("200");
  await page.locator("#ins-value").blur();
  const hinweis = page.locator("#ins-underinsurance");
  await hinweis.waitFor({ timeout: 5000 });
  assert.equal(flach(await hinweis.textContent()),
    "Der Versicherungswert liegt unter dem Warenwert. Im Schadensfall kann die Entschädigung anteilig gekürzt werden.");
  assert.ok(await warteAuf(page, () => mock.neubepreisungen.some((n) => n.extraInsuranceValue === 200), 5000), "keine Neubepreisung mit 200");
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Kostenpflichtig buchen/.test(x.textContent || ""));
    return b && !b.disabled;
  }, null, { timeout: 10000 });
  await buchenKnopf(page).click();
  assert.ok(await warteAuf(page, () => mock.bookPayload() !== null), "der /book-Request fehlt");
  const auswahl = mock.bookPayload().insuranceSelection;
  assert.equal(auswahl.type, "standard");
  assert.equal(auswahl.value, 200);
  assert.equal(mock.bookPayload().confirmedTotalGross, VERSICHERT.totals.customerTotalGross, "der bestätigte Gesamtbetrag fehlt");
  await page.close();
});

test("(4) nur die Stufe, die der Server für diesen Warenwert anbietet, erscheint", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, TARIF({ standard: VERFUEGBAR, premium: { state: "above_cover_limit", coverLimit: 200, maxInsuredValue: null } }));
  await zurBuchung(page);
  await page.waitForSelector(".ins-cards", { timeout: 10000 });
  const namen = (await page.locator(".ins-card .ins-card-name").allTextContents()).map(flach);
  assert.deepEqual(namen, ["Standardversicherung", "Keine zusätzliche Transportversicherung"]);
  await page.close();
});

test("(5) 390 px: der Hinweis über der Grenze passt ohne waagerechtes Scrollen", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(page, TARIF({ standard: UEBER_GRENZE, premium: UEBER_GRENZE }));
  await zurBuchung(page);
  const hinweis = page.locator('.booking-insurance-box[role="note"]');
  await hinweis.waitFor({ timeout: 10000 });
  assert.ok(await hinweis.isVisible());
  const box = await hinweis.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390 + 0.5, `der Hinweis ragt heraus: ${JSON.stringify(box)}`);
  const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(ueberlauf <= 0, `waagerechtes Scrollen um ${ueberlauf} px`);
  await page.close();
});
