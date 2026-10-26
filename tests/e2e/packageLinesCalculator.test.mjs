// E2E: individuelle Mehrpaketsendungen im angemeldeten Preisrechner und in der Übernahme aus dem öffentlichen
// Rechner (Canonical v2.79, §15) — echter Dev-Server, echter Browser, gemocktes Backend. Keine Buchung.
//
//   C1  Startansicht wie bisher (calc-*, „Gleiche Pakete“, „Paket hinzufügen“); eine Zeile sendet exakt die
//       bisherigen Felder in der bisherigen Reihenfolge.
//   C2  Zwei Paketarten: `packageLines` an /calculate-price, Satz über den Angeboten; die Übergabe nach
//       „Neue Sendung“ trägt beide Zeilen und die Summe; Browser-Zurück findet den Rechner mit beiden Zeilen.
//   C3  Prüfung je Zeile mit den Rechnertexten und Banner, Fokus auf das erste fehlerhafte Feld.
//   C4  Übernahme aus dem öffentlichen Rechner: geprüfte Eingaben mit `packageLines` werden zu Zeilen in
//       „Neue Sendung“.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5622, BASE = `http://127.0.0.1:${PORT}`;
// Montag, 26.10.2026 — ein Werktag.
const UHR = "2026-10-26T10:00:00+01:00";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "97421", city: "Schweinfurt", customer_number: "CE-K-10032",
};
const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const TARIF = {
  id: 23, shipper_tariff_id: 23, offerId: `cr${"0".repeat(28)}23`, publicCarrierId: "ups", publicCarrierName: "UPS",
  publicServiceName: "Express Saver", serviceType: "pickup", shippingMode: "express", transitDaysMin: 1, transitDaysMax: 1,
  deliveryTime: "1 Tag", trackingAvailable: true, printerRequired: true, pickupDate: "2026-10-26", pickupTimeFrom: "09:00",
  pickupTimeUntil: "17:00", deliveryDate: "2026-10-27", bookable: true, unavailableReason: null, requiredPriceInputs: [],
  netPrice: 31.4, vatAmount: 5.97, finalPrice: 37.37, currency: "EUR",
};
const PRUEFUNG = {
  input: { from_country: "DE", from_zip: "70173", from_city: "Stuttgart", to_country: "DE", to_zip: "10115", to_city: "Berlin",
    packageLines: [{ quantity: 1, weight: 15, length: 20, width: 20, height: 20 }, { quantity: 2, weight: 8, length: 40, width: 30, height: 25 }],
    serviceFilter: "all", shippingModeFilter: "all", shippingDate: "2026-10-26", publicCarrierIds: [] },
  selection: { productKey: `pk1_${"U".repeat(22)}`, publicCarrierId: "ups", publicServiceName: "Express Saver", priceStatus: "from",
    netPrice: 31.4, vatAmount: 5.97, finalPrice: 37.37, currency: "EUR" },
  issuedAt: "2026-10-26T08:55:00.000Z", expiresAt: "2026-10-26T09:55:00.000Z",
};

let server, browser;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const wert = (page, id) => page.locator(`#${id}`).inputValue();

async function setup(page) {
  const p = { calc: [], pfade: [] };
  await page.clock.setFixedTime(new Date(UHR));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    p.pfade.push(`${req.method()} ${pfad}`);
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/api/shipping/launch-scope")) return json({ countries: EU27, originCountries: ["DE"] });
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad === "/api/price-quote/handoff/verify") return json(PRUEFUNG);
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (pfad.includes("/api/jumingo/calculate-price")) {
      try { p.calc.push(JSON.parse(req.postData() || "{}")); } catch { p.calc.push({}); }
      return json({ ceShipmentId: 6100 + p.calc.length, tariffs: [TARIF], availableShippingModes: ["express"],
        publicCarriers: [{ id: "ups", name: "UPS" }], customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE",
        exportDeclaration: null });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

async function neueSeite(viewport = { width: 1440, height: 1100 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function oeffneRechner(page) {
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await page.fill("#calc-from-zip", "97421");
  await page.fill("#calc-from-city", "Schweinfurt");
  await page.fill("#calc-to-zip", "10115");
  await page.fill("#calc-to-city", "Berlin");
  for (const [feld, v] of [["packageCount", "1"], ["weight", "15"], ["length", "20"], ["width", "20"], ["height", "20"]])
    await page.fill(`#calc-${feld}`, v);
}

async function zweiteZeile(page, werte = { packageCount: "2", weight: "8", length: "40", width: "30", height: "25" }) {
  await page.getByRole("button", { name: "Paket hinzufügen" }).click();
  await page.waitForSelector("#calc-weight-2");
  for (const [feld, v] of Object.entries(werte)) await page.fill(`#calc-${feld}-2`, v);
}

const vergleiche = (page) => page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await kurz(250);
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("C1 — Startansicht wie bisher; eine Zeile sendet exakt die bisherigen Felder", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await oeffneRechner(page);
  assert.equal(norm(await page.locator("#calc-packageCount-hint").textContent()), "Gleiche Pakete");
  assert.equal(await page.locator(".pkg-line-title").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Paket hinzufügen" }).isVisible(), true);
  await vergleiche(page);
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.deepEqual(Object.keys(p.calc[0]), ["from_country", "from_zip", "from_city", "to_country", "to_zip", "to_city",
    "packageCount", "weight", "length", "width", "height", "serviceFilter", "shippingModeFilter", "shippingDate", "publicCarrierIds"]);
  assert.deepEqual([p.calc[0].packageCount, p.calc[0].weight, p.calc[0].length], [1, 15, 20]);
  assert.equal(await page.locator("#offers-packages-note").count(), 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C2 — zwei Paketarten: packageLines, Satz über den Angeboten, Übergabe mit allen Zeilen, Zurück erhält sie", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await oeffneRechner(page);
  await zweiteZeile(page);
  assert.equal(norm(await page.locator(".pkg-lines-sum").textContent()), "3 Pakete · 31 kg gesamt");
  await vergleiche(page);
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  const b = p.calc[0];
  assert.ok(!("packageCount" in b) && !("weight" in b), "flache Felder neben packageLines");
  assert.deepEqual(b.packageLines, [
    { quantity: 1, weight: 15, length: 20, width: 20, height: 20 },
    { quantity: 2, weight: 8, length: 40, width: 30, height: 25 },
  ]);
  assert.match(norm(await page.locator("#offers-packages-note").textContent()), /^Für unterschiedliche Pakete werden nur Versandarten angezeigt/);
  // Übergabe nach „Neue Sendung“.
  await page.locator(".offer-card button.offer-cta-btn").first().click();
  await page.waitForSelector(".offers-form-section #ns-weight-2", { timeout: 20000 });
  assert.deepEqual([await wert(page, "ns-packageCount"), await wert(page, "ns-weight"), await wert(page, "ns-height")], ["1", "15", "20"]);
  assert.deepEqual([await wert(page, "ns-packageCount-2"), await wert(page, "ns-weight-2"), await wert(page, "ns-length-2")], ["2", "8", "40"]);
  assert.equal(norm(await page.locator(".pkg-lines-sum").textContent()), "3 Pakete · 31 kg gesamt");
  // Zurück: der Rechner steht mit beiden Zeilen da, ohne neu zu rechnen.
  await page.goBack();
  await page.waitForSelector("#calc-weight-2", { timeout: 20000 });
  assert.equal(await wert(page, "calc-weight-2"), "8");
  assert.equal(p.calc.length, 1, "das Zurück hat neu gerechnet");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C3 — Prüfung je Zeile mit den Rechnertexten, Banner und Fokus auf das erste fehlerhafte Feld", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await oeffneRechner(page);
  await zweiteZeile(page, { packageCount: "2", weight: "", length: "40", width: "30", height: "25" });
  await vergleiche(page);
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "calc-weight-2", null, { timeout: 5000 });
  assert.equal(p.calc.length, 0, "ungültige Zeile: kein Request");
  assert.equal(norm(await page.locator("#calc-weight-2-err").textContent()), "Paket 2: Bitte geben Sie das Gewicht des Pakets ein.");
  assert.match(norm(await page.locator(".offers-form-section").textContent()), /Gewicht fehlt/);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C4 — Übernahme aus dem öffentlichen Rechner: packageLines werden zu Zeilen in „Neue Sendung“", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  await page.goto(`${BASE}/preisrechner-uebernahme#t=h1.${"T".repeat(120)}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section #ns-weight-2", { timeout: 30000 });
  assert.deepEqual([await wert(page, "ns-packageCount"), await wert(page, "ns-weight"), await wert(page, "ns-length")], ["1", "15", "20"]);
  assert.deepEqual([await wert(page, "ns-packageCount-2"), await wert(page, "ns-weight-2"), await wert(page, "ns-height-2")], ["2", "8", "25"]);
  assert.equal(norm(await page.locator(".pkg-lines-sum").textContent()), "3 Pakete · 31 kg gesamt");
  assert.deepEqual(fehler, []);
  await page.close();
});
