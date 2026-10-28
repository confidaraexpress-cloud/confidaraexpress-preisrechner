// E2E: Responsive-Qualität des öffentlichen Preisrechners (Responsive-Prüfung 2026-10-28) — tatsächliche
// Überschneidungen und abgeschnittene Inhalte im echten Browser (Detektor: helpers/layoutIntegrity.mjs).
//
//   P1  Startseite: kein Befund von 320 bis 2560 px, auch mit großer Browserschrift (24 px).
//   P2  Ergebnisse mit vier- und fünfstelligen Preisen („ab 12.345,67 €“): Preis und „Angebot auswählen“ überdecken
//       sich in keiner Breite — passt der Preis nicht neben den Knopf, steht der Knopf darunter.
//
// Eigener Vite-Server (je Suite genau einer), Backend als Attrappe; keine Anfrage verlässt den Browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { layoutBefunde } from "./helpers/layoutIntegrity.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5662, BASE = `http://127.0.0.1:${PORT}`;
const API = "https://api.confidaraexpress.de";
const BREITEN = [320, 360, 375, 390, 414, 430, 460, 520, 600, 768, 900, 1024, 1280, 1440, 1648, 1920, 2560];

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const pk = (z) => `pk1_${z.repeat(22)}`;
const angebot = (felder) => ({
  productKey: null, publicCarrierId: null, publicServiceName: null, serviceType: "pickup",
  pickupDate: "2026-10-29", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00", collectionDate: null,
  collectionReadyFrom: null, collectionDateAdjusted: false, deliveryDate: null, deliveryDateMin: null,
  deliveryDateMax: null, deliveryTimeUntil: null, deliveryTimeUntilMinutes: null, deliveryProjection: null,
  deliveryTime: null, transitDaysMin: 1, transitDaysMax: 2, netPrice: 10.5, vatAmount: 2, finalPrice: 12.5,
  currency: "EUR", priceCompleteness: "complete", priceStatus: "exact", unavailableReason: null,
  availableWithShipmentDetails: true, requiredPriceInputs: [], surchargeFreePriceInputs: [], recipientRequirement: null,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
  insuranceAvailable: false, trackingAvailable: true, printerRequired: true, labelHandling: null, handoffToken: null,
  ...felder,
});
// Schwere Sendungen: vier- und fünfstellige Nettopreise, ein „ab“-Preis, eine Preisauskunft ohne Übernahme.
const ANGEBOTE = [
  angebot({ productKey: pk("U"), publicCarrierId: "ups", publicServiceName: "Express Saver", netPrice: 1234.56, finalPrice: 1469.13,
    handoffToken: `h1.${"U".repeat(90)}` }),
  angebot({ productKey: pk("D"), publicCarrierId: "dhl", publicServiceName: "Domestic Express 12:00", serviceType: "dropoff",
    collectionDate: "2026-10-29", pickupDate: null, pickupTimeFrom: null, pickupTimeUntil: null, priceCompleteness: "indicative",
    priceStatus: "from", netPrice: 12345.67, finalPrice: 14691.35, requiredPriceInputs: ["deliveryIsResidential"],
    handoffToken: `h1.${"D".repeat(90)}` }),
  angebot({ productKey: pk("P"), publicCarrierId: "dpd", publicServiceName: "Classic", availableWithShipmentDetails: false,
    unavailableReason: "quote_only", netPrice: 7.1, finalPrice: 8.45, labelHandling: "carrier_at_pickup", recipientRequirement: "business" }),
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
  await warteAufServer(BASE);
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
});

async function seite({ schrift = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "de-DE", timezoneId: "Europe/Berlin",
    reducedMotion: "reduce", serviceWorkers: "block" });
  await ctx.route(`${API}/**`, (route) => {
    const pfad = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) }).catch(() => {});
    if (pfad === "/api/public/price-quote/prepare") return json({ available: true });
    if (pfad === "/api/public/launch-scope") return json({ countries: EU27, destinationCountries: EU27, originCountries: ["DE"] });
    if (pfad === "/api/public/price-quote") return json({ status: "ok", quotedAt: "2026-10-28T08:00:00.000Z",
      publicCarriers: [{ id: "dhl", name: "DHL Express" }, { id: "dpd", name: "DPD" }, { id: "ups", name: "UPS" }],
      availableShippingModes: ["express", "standard"], offers: ANGEBOTE });
    return json({ error: "unerwartet" }, 404);
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  if (schrift) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Page.enable");
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: schrift, fixed: Math.round(schrift * 0.8125) } });
  }
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pc-submit", { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page, fehler };
}

async function berechne(page) {
  await page.fill("#pc-from-zip", "70173");
  await page.fill("#pc-from-city", "Stuttgart");
  await page.fill("#pc-to-zip", "82467");
  await page.fill("#pc-to-city", "Garmisch-Partenkirchen");
  await page.fill("#pc-weight", "2,5");
  await page.fill("#pc-length", "30");
  await page.fill("#pc-width", "20");
  await page.fill("#pc-height", "10");
  await page.click("#pc-submit");
  await page.waitForSelector(".pc-offer-continue", { timeout: 30000 });
  await kurz(400);
}

async function pruefe(page, breiten, name) {
  const alle = [];
  for (const w of breiten) {
    await page.setViewportSize({ width: w, height: 900 });
    // Erst an den Seitenanfang, dann zwei Frames warten: Klebende Leisten melden ihren Zustand nach dem Scrollen.
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await kurz(60);
    const befunde = (await page.evaluate(layoutBefunde)).filter((b) => !b.fest && b.art !== "gekuerztMitTitel");
    for (const b of befunde) alle.push(`${w}px ${b.art} ${b.um}px „${b.text}“ @${b.bei}${b.mit ? ` ↔ „${b.mit}“ @${b.mitBei}` : ""}${b.zelle ? ` Zelle ${b.zelle}` : ""}`);
  }
  assert.deepEqual(alle, [], `${name}: ${alle.length} Befunde\n${alle.slice(0, 12).join("\n")}`);
}

test("P1 — Startseite ohne Befund, auch mit großer Browserschrift", async () => {
  for (const schrift of [0, 24]) {
    const { ctx, page, fehler } = await seite({ schrift });
    try {
      await pruefe(page, schrift ? [320, 390, 768, 1280, 1920] : BREITEN, `Start${schrift ? " (24 px)" : ""}`);
      assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
  }
});

test("P2 — Ergebnisse mit vier- und fünfstelligen Preisen: Preis und Knopf überdecken sich nie", async () => {
  for (const schrift of [0, 24]) {
    const { ctx, page, fehler } = await seite({ schrift });
    try {
      await berechne(page);
      await pruefe(page, schrift ? [320, 390, 768, 1280, 1920] : BREITEN, `Ergebnisse${schrift ? " (24 px)" : ""}`);
      if (!schrift) {
        // Bei 375 px steht der Knopf unter dem fünfstelligen Preis, in voller Breite der Karte.
        await page.setViewportSize({ width: 375, height: 900 });
        await kurz(150);
        const m = await page.evaluate(() => {
          const karte = [...document.querySelectorAll(".pc-offer")].find((k) => k.textContent.includes("12.345,67"));
          const preis = karte.querySelector(".pc-price-amount").getBoundingClientRect();
          const knopf = karte.querySelector(".pc-offer-continue").getBoundingClientRect();
          return { preisUnten: preis.bottom, knopfOben: knopf.top };
        });
        assert.ok(m.knopfOben >= m.preisUnten, `Knopf überdeckt den Preis (${JSON.stringify(m)})`);
      }
      assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
  }
});
