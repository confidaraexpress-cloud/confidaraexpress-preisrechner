// E2E: beide Providerangebote bleiben sichtbar (Betreiberentscheidung 2026-10-02). Echter Dev-Server, echter Browser,
// gemocktes Backend.
//
// Bis 2026-10-02 blendete die Oberfläche die Kombination UPS · „Expressversand" · `quote_only` aus — genau die Karte,
// die neben einem gleichen, buchbaren JUMiNGO-Angebot steht. Ein Preisunterschied ist nie ein Grund, ein Angebot zu
// verbergen; „nicht buchbar" bleibt eine Kennzeichnung.
//
//   V1  Transglobal günstiger (die früher verborgene Preisauskunft) → BEIDE Karten, Preisauskunft gesperrt mit Grund
//   V2  Preis umgedreht → weiterhin BEIDE
//   V3  gleicher Preis → BEIDE
//   V4  beide buchbar, verschiedene Preise → BEIDE auswählbar; „Günstigste" sortiert nur um, entfernt nichts
//   V5  Versandkostenrechner → dieselbe Liste
//
// Kein echtes Backend, keine Bestellung, kein Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_PAKET } from "./helpers/newShipmentForm.mjs";

const PORT = 5445, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10997",
};
const kennung = (kopf, fuss) => `${kopf}${fuss.padStart(32 - kopf.length, "0")}`;
// Serverbeträge — Fixturewerte, nie gerechnet.
const preis = (netto, mwst, brutto) => ({ netPrice: netto, vatAmount: mwst, finalPrice: brutto, currency: "EUR" });

/* Das kuratierte Paar „UPS Express Saver": JUMiNGO buchbar, Transglobal als Preisauskunft — die früher verborgene Karte. */
const J_EXPRESS = (p) => ({
  id: 501, shipper_tariff_id: 3309, offerId: kennung("cvj", "501"),
  publicCarrierId: "ups", publicCarrierName: "UPS", publicServiceName: "Expressversand", serviceType: "pickup",
  transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag", trackingAvailable: true, printerRequired: false,
  bookable: true, unavailableReason: null, requiredPriceInputs: [], ...p,
});
const T_EXPRESS = (p) => ({
  offerId: kennung("cvt", "23"), publicCarrierId: "ups", publicServiceName: "Expressversand", serviceType: "pickup",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null, transitDaysMin: 1, transitDaysMax: 1,
  deliveryTime: "1 Tag", bookable: false, unavailableReason: "quote_only", requiredPriceInputs: [], ...p,
});
/* Zwei buchbare Angebote desselben Produkts aus beiden Quellen. */
const J_STANDARD = (p) => ({
  id: 502, shipper_tariff_id: 3310, offerId: kennung("cvj", "502"),
  publicCarrierId: "dhl", publicCarrierName: "DHL Express", publicServiceName: "Expressversand", serviceType: "pickup",
  transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag", trackingAvailable: true, printerRequired: false,
  bookable: true, unavailableReason: null, requiredPriceInputs: [], ...p,
});
const T_STANDARD = (p) => ({
  offerId: kennung("cvt", "84"), publicCarrierId: "dhl", publicServiceName: "Domestic Express", serviceType: "pickup",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null, transitDaysMin: 1, transitDaysMax: 1,
  deliveryTime: "1 Tag", bookable: true, unavailableReason: null, requiredPriceInputs: [], ...p,
});

let server, browser;

async function setup(page, tariffs) {
  const p = { calc: 0 };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const pfad = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (pfad.includes("/api/jumingo/calculate-price")) {
      p.calc++;
      return json({
        ceShipmentId: 4997, tariffs, availableShippingModes: ["express"],
        publicCarriers: [{ id: "ups", name: "UPS" }, { id: "dhl", name: "DHL Express" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const inhalt = async (loc) => norm(await loc.first().textContent());
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const kartenIds = (page) => page.locator(".offer-card button.offer-details-link").evaluateAll(
  (knoepfe) => knoepfe.map((k) => k.getAttribute("aria-controls").replace("offer-details-", "")));

async function neueSeite(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function zuDenAngeboten(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { paket: { ...STANDARD_PAKET, packageCount: "1" } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

/* Beide Karten des Paars stehen da; die Preisauskunft ist gesperrt und nennt ihren Grund, JUMiNGO ist auswählbar. */
async function beidePaarkarten(page, j, t) {
  assert.deepEqual((await kartenIds(page)).sort(), [j.offerId, t.offerId].sort(), "eine Karte des Paars fehlt");
  assert.equal(await inhalt(page.locator(".offers-result-count")), "2 Angebote");
  const tg = karteVon(page, t), jm = karteVon(page, j);
  assert.equal(await tg.evaluate((el) => el.classList.contains("offer-card--unavailable")), true);
  assert.equal(await tg.locator("button.offer-cta-btn").isDisabled(), true);
  assert.equal(await inhalt(tg.locator("button.offer-cta-btn")), "Derzeit nicht direkt buchbar");
  assert.equal(await jm.locator("button.offer-cta-btn").isEnabled(), true);
  return { tg, jm };
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", detached: true });
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
  if (server) {
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits node startet.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("V1 — Transglobal günstiger (früher verborgen): BEIDE Karten, die Preisauskunft gesperrt mit Grund", async () => {
  const { page, fehler } = await neueSeite();
  const j = J_EXPRESS(preis(24, 4.56, 28.56)), t = T_EXPRESS(preis(20, 3.8, 23.8));
  await setup(page, [j, t]);
  await zuDenAngeboten(page);
  const { tg, jm } = await beidePaarkarten(page, j, t);
  assert.equal(await inhalt(tg.locator(".offer-price")), "20,00 €");
  assert.equal(await inhalt(jm.locator(".offer-price")), "24,00 €");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("V2 — Preis umgedreht: JUMiNGO günstiger → weiterhin BEIDE", async () => {
  const { page, fehler } = await neueSeite();
  const j = J_EXPRESS(preis(20, 3.8, 23.8)), t = T_EXPRESS(preis(24, 4.56, 28.56));
  await setup(page, [j, t]);
  await zuDenAngeboten(page);
  await beidePaarkarten(page, j, t);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("V3 — gleicher Preis → BEIDE", async () => {
  const { page, fehler } = await neueSeite();
  const j = J_EXPRESS(preis(22, 4.18, 26.18)), t = T_EXPRESS(preis(22, 4.18, 26.18));
  await setup(page, [j, t]);
  await zuDenAngeboten(page);
  const { tg, jm } = await beidePaarkarten(page, j, t);
  assert.equal(await inhalt(tg.locator(".offer-price")), await inhalt(jm.locator(".offer-price")));
  assert.deepEqual(fehler, []);
  await page.close();
});

test("V4 — beide buchbar, verschiedene Preise: BEIDE auswählbar; „Günstigste“ sortiert nur um", async () => {
  const { page, fehler } = await neueSeite();
  const j = J_STANDARD(preis(31, 5.89, 36.89)), t = T_STANDARD(preis(27, 5.13, 32.13));
  const p = await setup(page, [j, t]);
  await zuDenAngeboten(page);
  for (const x of [j, t]) {
    const karte = karteVon(page, x);
    assert.equal(await karte.count(), 1, `${x.offerId}: die Karte fehlt`);
    assert.equal(await karte.locator("button.offer-cta-btn").isEnabled(), true, `${x.offerId}: nicht auswählbar`);
  }
  await page.getByRole("button", { name: "Günstigste", exact: true }).click();
  await kurz(400);
  assert.deepEqual(await kartenIds(page), [t.offerId, j.offerId], "„Günstigste“ hat entfernt statt sortiert");
  assert.equal(p.calc, 1, "das Sortieren hat neu berechnet");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("V5 — Versandkostenrechner: dieselbe Liste, beide Karten des Paars", async () => {
  const { page, fehler } = await neueSeite();
  const j = J_EXPRESS(preis(24, 4.56, 28.56)), t = T_EXPRESS(preis(20, 3.8, 23.8));
  await setup(page, [j, t]);
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await page.fill("#calc-from-zip", "70173");
  await page.fill("#calc-to-zip", "10115");
  await page.fill("#calc-from-city", "Stuttgart");
  await page.fill("#calc-to-city", "Berlin");
  await page.fill("#calc-weight", "2");
  await page.fill("#calc-packageCount", "1");
  await page.fill("#calc-length", "30");
  await page.fill("#calc-width", "20");
  await page.fill("#calc-height", "15");
  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await beidePaarkarten(page, j, t);
  assert.deepEqual(fehler, []);
  await page.close();
});
