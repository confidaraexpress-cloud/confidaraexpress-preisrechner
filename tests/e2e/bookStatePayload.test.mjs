// E2E: Der Bundesstaat im FINALEN /book-Request — echter Dev-Server, echter Browser.
//
// ─── Der Live-Fehler, den diese Suite künftig verhindert ─────────────────────
// DE→USA, 350 5th Ave, 10118 New York, Bundesstaat New York:
//   Oberfläche zeigte „Bundesstaat * → New York"
//   /calculate-price sendete   state: "NY"   ✓
//   /book erhielt              KEIN state    ✗  → HTTP 400
//     { "errors": ["recipient.state fehlt (für US ist der Bundesstaat erforderlich)"] }
//
// Ursache: `BookingPage.buildParty` führte eine EIGENE Adress-Feldliste ohne `state`.
// Der bisherige Smoke (`customsStateField.test.mjs`) prüfte Formular und
// /calculate-price — aber NIE den Buchungspayload. Genau diese Lücke schließt diese Datei.
//
// ─── Warum hier customsRequired:false steht (bewusst, nicht aus Bequemlichkeit) ──
// Das Bundesstaatfeld und sein Weg in den Payload hängen ausschließlich am LAND (US/CA),
// nicht am Zoll. Ein zollpflichtiger Mock würde zusätzlich das Zollmodul erzwingen, dessen
// Positionsfelder KEINE stabilen ids tragen — es bliebe nur der Zugriff über Platzhaltertext,
// und genau das ist im Projekt als Anti-Muster dokumentiert (ein Platzhalter ist
// Beschriftungstext, kein Selektor). Der Zollweg ist durch die Backend-Suiten gedeckt;
// diese Datei misst den Bundesstaat.
//
// NIEMALS eine echte Bestellung: `/book` ist abgefangen, `/orders` wird nie erreicht.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5352, BASE = `http://127.0.0.1:${PORT}`;

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
  pickupDate: "2026-08-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-08-08T00:00:00Z",
};

// Genau die Adresse aus dem Live-Mitschnitt.
const US_EMPFAENGER = Object.freeze({
  country: "US", state: "NY", fullName: "John Doe",
  street: "350 5th Ave", zip: "10118", city: "New York",
});

let server, browser;
let letzterCalcPayload = null;

async function setupRoutes(page) {
  letzterCalcPayload = null;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    // Abgeschaltete Legal-Schranke = heutiger Produktivzustand. Ohne diese Antwort
    // greift der Sammelfall `200 {}` und die Bestellung wäre fail-closed gesperrt.
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) {
      letzterCalcPayload = JSON.parse(route.request().postData() || "{}");
      return json({
        shipmentId: "s1", tariffs: [TARIFF], availableShippingModes: ["standard"],
        publicCarriers: [{ id: "dhl", name: "DHL Express" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "US", exportDeclaration: null,
      });
    }
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function bisZurBuchung(page, empfaenger) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { empfaenger });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
}

// Buchung bis zum /book-Request durchspielen und dessen Payload zurückgeben.
async function bucheUndLiesPayload(page) {
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  let payload = null;
  await page.route("**/api/jumingo/book**", async (route) => {
    payload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ shipmentId: "s1", trackingNumber: "TRACK1", labelUrl: null }),
    });
  });
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForTimeout(1200);
  assert.ok(payload, "der /book-Request muss abgesetzt worden sein");
  return payload;
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
    // Die Prozessgruppe, nicht nur das Kind — npx startet `sh -c vite`, das node startet.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — DE→USA: der finale /book-Payload trägt recipient.state === \"NY\"", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await bisZurBuchung(page, US_EMPFAENGER);

  // Die Sichtbarkeit des Feldes prueft `customsStateField.test.mjs` auf der FORMULARseite;
  // hier stehen wir bereits auf der Buchungsseite und messen nur den Payload.
  const payload = await bucheUndLiesPayload(page);
  assert.equal(payload.recipient?.country, "US");
  assert.equal(payload.recipient?.state, "NY",
    "GENAU HIER ging der Bundesstaat live verloren — /book erhielt kein state");
  assert.notEqual(payload.recipient?.state, "New York", "gesendet wird der Code, nie der Anzeigename");
  // Die übrige Adresse ist unverändert:
  assert.equal(payload.recipient?.postalCode, "10118");
  assert.equal(payload.recipient?.city, "New York");
  await page.close();
});

test("2 — derselbe Wert steht schon im /calculate-price-Payload (die Kette ist lückenlos)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await bisZurBuchung(page, US_EMPFAENGER);
  assert.ok(letzterCalcPayload, "der Preisrechner muss angefragt worden sein");
  assert.equal(letzterCalcPayload.recipient?.state, "NY",
    "der Preisrechner trug den Bundesstaat schon immer — der Verlust lag danach");
  const payload = await bucheUndLiesPayload(page);
  assert.deepEqual(payload.recipient, letzterCalcPayload.recipient,
    "beide Payloads müssen dieselbe Empfängeradresse tragen");
  await page.close();
});

test("3 — DE→DE: kein state im /book-Payload, Verhalten unverändert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await bisZurBuchung(page, { country: "DE", fullName: "Erika Muster", street: "Hauptstr. 1", zip: "10115", city: "Berlin" });
  const payload = await bucheUndLiesPayload(page);
  assert.equal(payload.recipient?.country, "DE");
  assert.ok(!("state" in (payload.recipient || {})), "für DE darf kein state-Feld entstehen");
  await page.close();
});
