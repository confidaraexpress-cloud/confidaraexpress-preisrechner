// E2E: Premium-Redesign, öffentlicher Preisrechner — die interaktiven Merkmale der freigegebenen Vorschau
// (Konzept A) im echten Browser gegen ein gemocktes Backend. Kein echter Request, kein Anbieter, keine Buchung.
//
//   V1  Nachtkarte mit funkelnden Lichtern und Einstiegswelle; das Paket nimmt Länge, Breite, Höhe und Anzahl auf;
//       die Strecke zeichnet sich zwischen den Orten und folgt dem Zielland; ein Lichtpunkt läuft die Linie entlang.
//   V2  Tarifkarte — der Markenstreifen am unteren Rand erscheint bei Fokus, ohne Fokus nicht.
//   V3  Reduzierte Bewegung: keine Lichter, kein Lichtpunkt, keine Paketübergänge — die Inhalte bleiben.
//
// Der Kundenbereich und die Demo stehen in premiumParityApp.test.mjs: zwei Vite-Server gleichzeitig teilen sich den
// Abhängigkeits-Cache und machen sich gegenseitig ungültig — je Suite deshalb genau ein Server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5641, BASE_PC = `http://127.0.0.1:${PORT}`;
const API = "https://api.confidaraexpress.de";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const angebot = (felder) => ({
  productKey: null, publicCarrierId: null, publicServiceName: null, serviceType: "pickup",
  pickupDate: "2026-10-28", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00", collectionDate: null,
  collectionReadyFrom: null, collectionDateAdjusted: false, deliveryDate: null, deliveryDateMin: null,
  deliveryDateMax: null, deliveryTimeUntil: null, deliveryTimeUntilMinutes: null, deliveryProjection: null,
  deliveryTime: null, transitDaysMin: 1, transitDaysMax: 2, netPrice: 10.5, vatAmount: 2, finalPrice: 12.5,
  currency: "EUR", priceCompleteness: "complete", priceStatus: "exact", unavailableReason: null,
  availableWithShipmentDetails: true, requiredPriceInputs: [], surchargeFreePriceInputs: [], recipientRequirement: null,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
  insuranceAvailable: false, trackingAvailable: true, printerRequired: true, labelHandling: null, handoffToken: null,
  ...felder,
});
const ANGEBOTE = [
  angebot({ productKey: `pk1_${"U".repeat(22)}`, publicCarrierId: "ups", publicServiceName: "Standard", handoffToken: `h1.${"U".repeat(90)}` }),
  angebot({ productKey: `pk1_${"D".repeat(22)}`, publicCarrierId: "dhl", publicServiceName: "Paket", netPrice: 8.4, vatAmount: 1.6, finalPrice: 10,
    handoffToken: `h1.${"D".repeat(90)}` }),
];

let server, browser;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));

async function warteAufServer(basis) {
  const frist = Date.now() + 120000;
  for (;;) {
    try { const r = await fetch(`${basis}/`); if (r.ok) return; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error(`Vite-Dev-Server ${basis} nicht gestartet`);
    await kurz(250);
  }
}

test.before(async () => {
  server = spawn("npx", ["vite", "--config", "vite.preisrechner.config.js", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  await warteAufServer(BASE_PC);
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
});

/** Preisrechner mit gemocktem öffentlichem Backend. */
async function preisrechner({ viewport = { width: 1440, height: 900 }, reducedMotion = "no-preference" } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion, locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.route(`${API}/**`, async (route) => {
    const pfad = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad === "/api/public/price-quote/prepare") return json({ available: true });
    if (pfad === "/api/public/launch-scope") return json({ countries: EU27, destinationCountries: EU27, originCountries: ["DE"] });
    if (pfad === "/api/public/price-quote") {
      return json({ status: "ok", quotedAt: "2026-10-27T08:00:00.000Z", publicCarriers: [{ id: "dhl", name: "DHL" }, { id: "ups", name: "UPS" }],
        availableShippingModes: ["standard"], offers: ANGEBOTE });
    }
    return json({ error: "unerwartet" }, 404);
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.goto(`${BASE_PC}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pc-submit", { timeout: 60000 });
  return { ctx, page, fehler };
}

const paket = (page) => page.$eval(".ce-paket--public", (f) => ({
  zustand: f.dataset.paketZustand,
  titel: f.querySelector(".ce-paket-titel").textContent.replace(/\s+/g, " "),
  oben: f.querySelector(".ce-paket-oben").style.transform,
  kartons: f.querySelectorAll(".ce-paket-karton").length,
}));
const lichter = (page, auswahl) => page.$$eval(auswahl, (els) => els.map((e) => {
  const s = getComputedStyle(e);
  return { animation: s.animationName, opacity: Number(s.opacity) };
}));

test("V1 — Preisrechner: Nachtkarte mit Lichtern, Paket aus L × B × H, Strecke zwischen den Orten", async () => {
  const { ctx, page, fehler } = await preisrechner();
  try {
    assert.equal(await page.locator("#pc-hero-map-canvas.nk-welle").count(), 1, "Einstiegswelle auf der Karte");
    const l = await lichter(page, ".pc-karte-lichter .nk-licht");
    assert.ok(l.length >= 20, `zu wenige Lichter: ${l.length}`);
    assert.ok(l.every((x) => x.animation === "nk-funkeln"), "jedes Licht funkelt in seinem eigenen Takt");

    const vorher = await paket(page);
    assert.equal(vorher.zustand, "beispiel");
    await page.fill("#pc-length", "30");
    await page.fill("#pc-width", "20");
    await page.fill("#pc-height", "10");
    await kurz(600);
    const flach = await paket(page);
    assert.equal(flach.zustand, "vollstaendig");
    assert.match(flach.titel, /30 × 20 × 10 cm/);
    await page.fill("#pc-length", "60");
    await kurz(600);
    const lang = await paket(page);
    assert.notEqual(lang.oben, flach.oben, "die Deckfläche folgt der Länge");
    assert.match(lang.titel, /60 × 20 × 10 cm/);
    await page.fill("#pc-package-count", "3");
    await kurz(600);
    const mehrere = await paket(page);
    assert.ok(mehrere.kartons >= 2, "mehrere Pakete stehen als Stapel");
    assert.match(mehrere.titel, /^3 Pakete/);

    assert.equal(await page.locator(".pc-route-overlay").count(), 0, "ohne Orte keine Strecke");
    await page.fill("#pc-from-zip", "70173");
    await page.fill("#pc-to-zip", "10115");
    await page.waitForSelector(".pc-route-overlay .pc-route-line", { timeout: 5000 });
    const inland = await page.getAttribute(".pc-route-overlay .pc-route-line", "d");
    assert.equal(await page.$eval(".pc-route-licht", (g) => getComputedStyle(g).animationName), "pc-route-licht");
    await page.selectOption("#pc-to-country", "FR");
    await page.fill("#pc-to-zip", "75001");
    await kurz(300);
    const ausland = await page.getAttribute(".pc-route-overlay .pc-route-line", "d");
    assert.notEqual(ausland, inland, "die Strecke folgt dem Zielland");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

test("V2 — Tarifkarte: der Markenstreifen erscheint mit dem Fokus, ohne Fokus nicht", async () => {
  const { ctx, page, fehler } = await preisrechner();
  try {
    await page.fill("#pc-from-zip", "70173");
    await page.fill("#pc-from-city", "Stuttgart");
    await page.fill("#pc-to-zip", "10115");
    await page.fill("#pc-to-city", "Berlin");
    await page.fill("#pc-weight", "2,5");
    await page.fill("#pc-length", "30");
    await page.fill("#pc-width", "20");
    await page.fill("#pc-height", "10");
    await page.click("#pc-submit");
    await page.waitForSelector(".pc-offer:not(.pc-offer--skeleton) button, .pc-offer:not(.pc-offer--skeleton) a", { timeout: 20000 });
    await page.mouse.move(1, 1);
    const karte = page.locator(".pc-offer:not(.pc-offer--quiet):not(.pc-offer--skeleton)").first();
    await kurz(400);
    assert.equal(await karte.evaluate((k) => getComputedStyle(k).backgroundSize), "0% 3px");
    await karte.locator("button, a").first().focus();
    await kurz(400);
    assert.equal(await karte.evaluate((k) => getComputedStyle(k).backgroundSize), "100% 3px");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

test("V3 — reduzierte Bewegung: keine Lichter, kein Lichtpunkt, keine Übergänge — die Inhalte bleiben", async () => {
  const { ctx, page, fehler } = await preisrechner({ reducedMotion: "reduce" });
  try {
    const l = await lichter(page, ".pc-karte-lichter .nk-licht");
    assert.ok(l.length >= 20);
    assert.ok(l.every((x) => x.animation === "none" && x.opacity === 0), "Lichter ruhen");
    assert.equal(await page.$eval("#pc-hero-map-canvas", (k) => getComputedStyle(k).animationName), "none");
    await page.fill("#pc-length", "30");
    await page.fill("#pc-width", "20");
    await page.fill("#pc-height", "10");
    assert.equal(await page.$eval(".ce-paket--public .ce-paket-oben", (p) => getComputedStyle(p).transitionDuration), "0s");
    assert.equal((await paket(page)).zustand, "vollstaendig", "das Paket steht trotzdem");
    await page.fill("#pc-from-zip", "70173");
    await page.fill("#pc-to-zip", "10115");
    await page.waitForSelector(".pc-route-overlay .pc-route-line", { timeout: 5000 });
    assert.equal(await page.$eval(".pc-route-licht", (g) => getComputedStyle(g).display), "none");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

