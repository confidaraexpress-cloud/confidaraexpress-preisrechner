// E2E: Abholtermin — der Wechsel auf „Schritt 2" darf die Buchung nicht dauerhaft sperren. Echter Dev-Server,
// echter Browser, gemocktes Backend.
//
// Bei einem verstellbaren Abholfenster lädt der Abschnitt „Abholtermin" (Schritt 1) das gespeicherte Fenster;
// solange es lädt, ist „Kostenpflichtig buchen" gesperrt. „Weiter" baut den Abschnitt ab. Kam die Antwort erst
// danach, wurde sie verworfen, und die Sperre blieb ohne Hinweis stehen (premiumParityApp D2 war deshalb
// sporadisch rot: die Demo antwortet nach 120 ms, der Test klickt „Weiter" sofort).
//
// Gemessen wird deterministisch: die Antwort des Abholfensters wird zurückgehalten, bis der Test sie freigibt.
//   • A — Antwort nach „Weiter": bis dahin gesperrt, danach frei; die Buchung geht genau einmal hinaus.
//   • B — ein gespeichertes Fenster, das erst nach „Weiter" eintrifft, steht danach in der Zusammenfassung.
//   • C — ein Ladefehler nach „Weiter" hält die Sperre (fail-closed), es wird nicht gebucht.
//
// Kein echtes Backend, keine Bestellung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_PAKET } from "./helpers/newShipmentForm.mjs";

const PORT = 5693, BASE = `http://127.0.0.1:${PORT}`;
const CE_SHIPMENT_ID = 4734;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ABHOLTAG = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};
// Ein verstellbares Abholfenster: genau dann lädt der Abschnitt das gespeicherte Fenster.
const TARIF = {
  offerId: "a1b2c3d4e5f60718293a4b5c6d7e8f90", publicCarrierId: "dhl", publicServiceName: "Paket",
  serviceType: "pickup", pickupDate: `${ABHOLTAG}T00:00:00Z`, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  pickupWindowAdjustable: true, pickupWindowMinMinutes: 120,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  netPrice: 9.31, vatAmount: 1.77, finalPrice: 11.08, currency: "EUR",
  bookable: true, unavailableReason: null, priceCompleteness: "complete", requiredPriceInputs: [],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4"],
  insuranceAvailable: false, trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }],
};

let server, browser;

/** Die Antwort des Abholfensters wartet, bis der Test sie freigibt. */
async function setupRoutes(page, antwortAbholfenster) {
  const protokoll = { abholGet: 0, book: [] };
  let freigeben;
  const freigabe = new Promise((r) => { freigeben = r; });
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      ceShipmentId: CE_SHIPMENT_ID, tariffs: [TARIF], availableShippingModes: [],
      publicCarriers: [{ id: "dhl", name: "DHL" }], customsRequired: false,
      fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window") && req.method() === "GET") {
      protokoll.abholGet++;
      await freigabe;
      return json(antwortAbholfenster.body, antwortAbholfenster.status ?? 200);
    }
    if (p.includes("/api/jumingo/book")) {
      protokoll.book.push(req.postDataJSON());
      return json({
        message: "Sendung gebucht", ceShipmentId: CE_SHIPMENT_ID, invoiceNumber: "CE-RE26-00034",
        businessOrderNumber: "CE-BS26-00034", dueDate: null, amount: 11.08, billingMode: "single",
        testBooking: false, voucherCode: null, deliveryNote: null,
        orderConfirmation: { number: "CE-AB26-00034", issuedAt: "2026-09-11T10:00:00Z" }, shippingDocuments: [],
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return { protokoll, freigeben };
}

/** Bis Schritt 2 mit beiden Bestätigungen — „Weiter" kommt, während das Abholfenster noch lädt. */
async function weiterVorDerAntwort(page, protokoll) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { paket: { ...STANDARD_PAKET, packageCount: "1" } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  for (let i = 0; i < 100 && protokoll.abholGet === 0; i++) await page.waitForTimeout(50);
  assert.equal(protokoll.abholGet, 1, "Schritt 1 hat das gespeicherte Abholfenster nicht angefragt");
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".booking-blatt--buchung", { timeout: 20000 });
  for (const feld of await page.locator(".booking-blatt input[type=checkbox]").all()) {
    if (!(await feld.isChecked())) await feld.check();
  }
}

const buchenKnopf = (page) => page.locator(".booking-book-btn");
const wirdFrei = (page) => page.waitForFunction(() => document.querySelector(".booking-book-btn")?.disabled === false, null, { timeout: 10000 });

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) {
    stopDevServer(server, "SIGKILL");
  }
});

test("A — Antwort nach „Weiter“: bis dahin gesperrt, danach frei; genau eine Buchung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  const { protokoll, freigeben } = await setupRoutes(page, {
    body: { pickupWindow: null, availableFrom: `${ABHOLTAG}T09:00:00`, availableUntil: `${ABHOLTAG}T17:00:00`, minimumMinutes: 120, adjustable: true },
  });
  await weiterVorDerAntwort(page, protokoll);
  assert.equal(await buchenKnopf(page).isDisabled(), true, "solange das Abholfenster lädt, darf nicht gebucht werden");

  freigeben();
  await wirdFrei(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(protokoll.book.length, 1);
  assert.equal(protokoll.abholGet, 1, "das Abholfenster wurde erneut angefragt");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — ein gespeichertes Fenster, das erst nach „Weiter“ eintrifft, steht danach in der Zusammenfassung", async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const { protokoll, freigeben } = await setupRoutes(page, {
    body: { pickupTimeFrom: "10:00:00", pickupTimeUntil: "14:00:00", adjustable: true },
  });
  await weiterVorDerAntwort(page, protokoll);
  const seite = page.locator(".booking-side");
  assert.ok(!(await seite.innerText()).includes("10:00–14:00"), "das gespeicherte Fenster stand vor der Antwort da");

  freigeben();
  await wirdFrei(page);
  await page.waitForFunction(() => document.querySelector(".booking-side")?.innerText.includes("10:00–14:00"), null, { timeout: 5000 });
  assert.equal(protokoll.book.length, 0);
  await page.close();
});

test("C — ein Ladefehler nach „Weiter“ hält die Sperre: es wird nicht gebucht", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { protokoll, freigeben } = await setupRoutes(page, { status: 503, body: { error: "nicht verfügbar" } });
  await weiterVorDerAntwort(page, protokoll);
  freigeben();
  await page.waitForTimeout(1500);
  assert.equal(await buchenKnopf(page).isDisabled(), true, "nach einem Ladefehler ist die Buchung freigegeben");
  assert.equal(protokoll.book.length, 0);
  await page.close();
});
