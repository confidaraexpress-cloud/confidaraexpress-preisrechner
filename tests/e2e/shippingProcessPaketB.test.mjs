// E2E: Premium-Versandprozess (Paket B) — echter Dev-Server, echte Kaskade.
//
// Prüft das, was eine reine Quelltextprüfung nicht erreicht: dass die Buchung
// tatsächlich mit sichtbarer Sidebar rendert, kein horizontaler Seitenüberlauf
// entsteht (Desktop UND Mobil), Auswahlkarten per Tastatur bedienbar sind und
// der Preisänderungsdialog eine echte Fokusfalle mit Fokusrückgabe hat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5254, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};

const TARIFF = {
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dhl", publicCarrierName: "DHL Express",
  publicServiceName: "Expressversand", serviceType: "pickup", netPrice: 18.65, vatAmount: 3.54,
  finalPrice: 22.19, currency: "EUR", transitDaysMin: 1, transitDaysMax: 1,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-08-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-08-08T00:00:00Z",
};

let server, browser;

async function setupRoutes(page) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    // Legal-Buchungsschranke (Go-Live Paket 4-B): `enabled:false` ist die
    // Antwort eines Servers mit ABGESCHALTETER Schranke — der heutige
    // Produktivzustand. Ohne diese Antwort liefe der Mock in den Sammelfall
    // `200 {}`; `parseBookingContext` wertet das fail-closed als `error` und
    // sperrt die Bestellung. Das ist richtiges Produktverhalten und darf nicht
    // aufgeweicht werden — die Suite muss den Endpunkt schlicht beantworten.
    // Beide Zustände der Schranke prüft `legalBookingGate.test.mjs`.
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", tariffs: [TARIFF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function fillNewShipmentAndReachOffers(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  // Absender- UND Empfängerfelder explizit setzen (es gibt kein Prefill aus
  // dem Nutzerprofil mehr — „Neue Sendung" startet vollständig leer, und
  // s_fullName/s_street/s_zip/s_city/s_country sind Pflichtfelder wie beim
  // Empfänger, siehe getErrors() in NewShipmentPage.jsx).
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
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

test("die Buchung rendert mit sichtbarer Sidebar in der App-Shell (Desktop)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await fillNewShipmentAndReachOffers(page);
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  assert.equal(page.url(), `${BASE}/booking`, "Buchung muss unter der Route /booking laufen");
  await assert.ok(await page.locator(".pp-side").isVisible(), "die Sidebar muss auf Desktop sichtbar sein");
  await assert.ok(await page.locator(".ce-page-header-title").isVisible(), "der gemeinsame PageHeader muss rendern");
  await assert.ok(!(await page.locator(".navbar").count()), "die öffentliche Navbar darf nicht rendern");
  await page.close();
});

test("kein horizontaler Überlauf bei Preisrechner, Angebote und Buchung (Desktop 1440 + Mobil 390)", async () => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await setupRoutes(page);
    await fillNewShipmentAndReachOffers(page);
    assert.ok(await noHorizontalOverflow(page), `Angebote überlaufen horizontal bei ${viewport.width}px`);
    await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
    await page.waitForSelector(".steps-bar", { timeout: 20000 });
    assert.ok(await noHorizontalOverflow(page), `Buchung Schritt 1 überläuft horizontal bei ${viewport.width}px`);
    await page.close();
  }
});

test("Auswahlkarten (Labelformat) sind vollständig per Tastatur bedienbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await fillNewShipmentAndReachOffers(page);
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  // Die Auswahlkarten liegen seit der Progressive-Disclosure-Umstellung hinter
  // dem Schalter „Versandlabel-Format ändern" — erst einschalten, dann prüfen.
  // Bedient über das Label — die Schaltereingabe ist wie .labelfmt-card visuell
  // versteckt und für einen direkten Klick bewusst nicht erreichbar.
  await page.waitForSelector("#booking-labelformat-toggle", { timeout: 20000 });
  await page.locator("#booking-labelformat-toggle").locator("xpath=ancestor::label[1]").click();
  await page.waitForSelector(".labelfmt-card", { timeout: 20000 });

  const a6 = page.locator('input[type="radio"][value="A6"], .labelfmt-card:has-text("DIN A6") input[type="radio"]').first();
  await a6.focus();
  await assert.ok(await a6.evaluate((el) => el === document.activeElement), "das A6-Radio muss fokussierbar sein");
  await page.keyboard.press(" ");
  await assert.ok(await a6.isChecked(), "Leertaste muss das fokussierte Radio auswählen");
  const selectedCard = page.locator(".labelfmt-card--selected");
  await assert.match(await selectedCard.innerText(), /DIN A6/);
});

test("der Preisänderungsdialog hat Fokusfalle, Fokusrückgabe und schließt per Escape", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await fillNewShipmentAndReachOffers(page);
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);

  await page.route("**/api/jumingo/book**", (r) => r.fulfill({
    status: 409, contentType: "application/json",
    body: JSON.stringify({ code: "PRICE_CHANGED", oldPrice: 22.19, newPrice: 24.49 }),
  }));
  const auslöser = page.getByRole("checkbox").nth(1);
  await page.getByRole("checkbox").nth(0).check();
  await auslöser.check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForSelector(".price-drift-card", { timeout: 20000 });

  // Fokusfalle: der Fokus muss beim Öffnen INNERHALB des Dialogs stehen.
  const fokusImDialog = await page.evaluate(() =>
    !!document.activeElement?.closest(".price-drift-card"));
  assert.ok(fokusImDialog, "der Fokus muss beim Öffnen im Dialog stehen");

  // Escape schließt den Dialog (neutral, ohne Buchung/Navigation auszulösen).
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".price-drift-card").count(), 0, "Escape muss den Dialog schließen");
  assert.equal(page.url(), `${BASE}/booking`, "Escape darf nicht navigieren");

  // Fokusrückgabe: der Fokus kehrt zum auslösenden Element zurück.
  const fokusZurueck = await page.evaluate(() =>
    document.activeElement?.textContent?.includes("Kostenpflichtig buchen"));
  assert.ok(fokusZurueck, "der Fokus muss auf den auslösenden Buchen-Button zurückkehren");
  await page.close();
});
