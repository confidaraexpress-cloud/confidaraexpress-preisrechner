// E2E: unveränderte Preisberechnung wird wiederverwendet — echter Dev-Server.
//
// Ausgangslage (Produktions-HAR vom 25.08.2026): EIN Klick auf „Angebote
// vergleichen" kostet 2176,9 ms, davon 2049,7 ms reines Warten auf die
// Serverantwort. Wer denselben Klick bei unveränderten Eingaben wiederholte,
// zahlte diese Zeit ein zweites Mal — und erzeugte serverseitig ein zweites
// JUMiNGO-Shipment, obwohl das Ergebnis bereits auf dem Schirm stand.
//
// Diese Suite misst das, was eine Quelltextprüfung nicht erreichen kann: die
// TATSÄCHLICHE Zahl abgesetzter /calculate-price-Requests über eine Folge von
// Nutzeraktionen hinweg. Der Zähler ist die eigentliche Zusicherung.
//
// Gemocktes Backend — niemals eine echte Preisberechnung, niemals eine Buchung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_ABSENDER } from "./helpers/newShipmentForm.mjs";
import { TARIFE_41 } from "../../src/utils/offersFilterFixture.mjs";

const PORT = 5344, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "97421", customer_number: "CE-K-10030",
};

const TARIFE = TARIFE_41.map((t, i) => ({
  ...t,
  shipper_tariff_id: t.id,
  publicCarrierId: "ups",
  publicCarrierName: "Carrier " + (i + 1),
  publicServiceName: t.shippingMode === "express" ? "Expressversand" : "Standardversand",
  currency: "EUR",
  vatAmount: Number((t.netPrice * 0.19).toFixed(2)),
  finalPrice: Number((t.netPrice * 1.19).toFixed(2)),
  transitDaysMin: 1, transitDaysMax: 1,
  trackingAvailable: true, printerRequired: true, availableForDate: true,
}));

const ABSENDER = { zip: "97421", city: "Schweinfurt", street: "Musterweg 1" };

let server, browser;

// Zählt JEDEN abgesetzten /calculate-price-Request. Jede Antwort trägt eine
// eigene shipmentId, damit ein wiederverwendetes Ergebnis von einem neu
// berechneten unterscheidbar bleibt.
function setupRoutes(page, zaehler) {
  return (async () => {
    await page.route("**/api.confidaraexpress.de/**", async (route) => {
      const p = new URL(route.request().url()).pathname;
      const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
      if (p.endsWith("/kundenbereich")) return json({ user: USER });
      if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
      if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
      if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
      if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
      if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
      if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
      if (p.includes("/api/legal/booking-context")) return json({ enabled: false });
      if (p.includes("/api/jumingo/calculate-price")) {
        zaehler.n += 1;
        return json({
          shipmentId: `s_e2e_${zaehler.n}`, ceShipmentId: 4700 + zaehler.n, tariffs: TARIFE,
          availableShippingModes: ["express", "standard"],
          publicCarriers: [{ id: "ups", name: "UPS" }],
          customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
        });
      }
      return json({});
    });
    await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  })();
}

const cta = (page) => page.locator(".offers-calc-cta button").first();
const anzahlKarten = (page) => page.locator(".offer-card").count();
const ueberschrift = (page) => page.locator(".offers-result-count").textContent();

async function ersteBerechnung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { absender: { ...STANDARD_ABSENDER, ...ABSENDER } });
  await cta(page).click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

// Nach einem Klick genug Zeit lassen, dass ein Request tatsächlich abgesetzt
// WÜRDE — sonst bewiese ein unveränderter Zähler nur, dass zu früh gemessen wurde.
async function klickUndAbwarten(page) {
  await cta(page).click();
  await page.waitForTimeout(1200);
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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das
    // seinerseits node startet.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("P1 — unveränderte Eingaben: der zweite Klick erzeugt KEINEN neuen Request", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const z = { n: 0 };
  await setupRoutes(page, z);
  await ersteBerechnung(page);
  assert.equal(z.n, 1, "die erste Berechnung muss genau einen Request absetzen");
  assert.equal(await anzahlKarten(page), 41);

  await klickUndAbwarten(page);
  assert.equal(z.n, 1, "der wiederholte Klick hat erneut gerechnet");
  // Und die Angebote bleiben unverändert stehen — kein Flackern, kein Leerlauf.
  assert.equal(await anzahlKarten(page), 41, "die vorhandenen Angebote wurden verworfen");
  assert.equal(await page.locator(".offers-loading").count(), 0, "es lief ein Ladezustand ohne Request");
  await page.close();
});

test("P2 — preisrelevante Änderung (Gewicht): der Zähler steigt um exakt 1", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const z = { n: 0 };
  await setupRoutes(page, z);
  await ersteBerechnung(page);
  assert.equal(z.n, 1);

  await page.fill("#ns-weight", "7");
  // Ein preisrelevantes Feld verwirft die Angebote sofort (invalidateResults).
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 0, null, { timeout: 10000 });
  await cta(page).click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(z.n, 2, "die geänderte Sendung wurde nicht neu berechnet");
  await page.close();
});

test("P3 — reine Anzeigefilter lösen KEINE Preisberechnung aus", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const z = { n: 0 };
  await setupRoutes(page, z);
  await ersteBerechnung(page);
  const nachErster = z.n;

  // Späteste Lieferzeit über den Chip setzen …
  await page.locator(".offers-filter-chip", { hasText: "Lieferung" }).click();
  await page.waitForSelector(".offers-delivery-dropdown", { timeout: 10000 });
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 21, null, { timeout: 10000 });
  assert.equal(z.n, nachErster, "der Lieferzeitfilter hat eine Preisberechnung ausgelöst");

  // … und wieder zurücksetzen.
  await page.locator(".offers-filter-reset-btn").click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 41, null, { timeout: 10000 });
  assert.equal(z.n, nachErster, "das Zurücksetzen hat eine Preisberechnung ausgelöst");

  // Und danach gilt der Vorgang weiterhin als berechnet: kein Nachzügler-Request.
  await klickUndAbwarten(page);
  assert.equal(z.n, nachErster, "nach reinem Filtern wurde doch neu gerechnet");
  await page.close();
});

test("P4 — Doppelklick erzeugt genau EINEN Request", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const z = { n: 0 };
  await setupRoutes(page, z);
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { absender: { ...STANDARD_ABSENDER, ...ABSENDER } });

  // Zwei Klicks im selben Tick — beide Closures sehen denselben (alten) State.
  await cta(page).click({ clickCount: 2, delay: 10 });
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.waitForTimeout(1200);
  assert.equal(z.n, 1, "ein Doppelklick hat zwei Provideraufrufe erzeugt");
  await page.close();
});

test("P5 — die Überschrift nennt nur die sichtbare Zahl", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await ersteBerechnung(page);
  assert.match((await ueberschrift(page)).trim(), /^41 Angebote$/);

  await page.locator(".offers-filter-chip", { hasText: "Lieferung" }).click();
  await page.waitForSelector(".offers-delivery-dropdown", { timeout: 10000 });
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 21, null, { timeout: 10000 });

  const t = (await ueberschrift(page)).trim();
  assert.match(t, /^21 Angebote$/);
  assert.ok(!/von 41/.test(t) && !/angezeigt/.test(t) && !/gefunden/.test(t), `alte Formulierung: ${t}`);
  // Der Filter bleibt über Chip und Zurücksetzen sichtbar.
  assert.match((await page.locator(".offers-filter-chip", { hasText: "Lieferung" }).textContent()).trim(), /^Lieferung bis 31\.08\.2026$/);
  assert.equal(await page.locator(".offers-filter-reset-btn").count(), 1);
  await page.close();
});

test("P6 — der Versandkostenrechner verhält sich identisch", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const z = { n: 0 };
  await setupRoutes(page, z);
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await page.fill("#calc-from-zip", "97421");
  await page.fill("#calc-to-zip", "63743");
  await page.fill("#calc-weight", "3");
  await page.fill("#calc-packageCount", "1");
  await page.fill("#calc-length", "10");
  await page.fill("#calc-width", "10");
  await page.fill("#calc-height", "10");
  const rechnerCta = page.getByRole("button", { name: /Angebote vergleichen/i }).first();
  await rechnerCta.click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(z.n, 1);
  assert.match((await ueberschrift(page)).trim(), /^41 Angebote$/);

  await rechnerCta.click();
  await page.waitForTimeout(1200);
  assert.equal(z.n, 1, "der Rechner hat bei unveränderten Eingaben neu gerechnet");
  assert.equal(await anzahlKarten(page), 41);

  await page.fill("#calc-weight", "9");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 0, null, { timeout: 10000 });
  await rechnerCta.click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(z.n, 2, "die geänderte Sendung wurde nicht neu berechnet");
  await page.close();
});
