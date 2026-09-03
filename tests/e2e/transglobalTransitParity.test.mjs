// E2E: Transglobal-Angebote zeigen ihre Laufzeit — echter Dev-Server, echter Browser.
//
// Was eine Quelltextpruefung nicht erreicht und diese Suite deshalb misst:
//   • ob "Auf Anfrage" bei belastbarer Laufzeit tatsaechlich verschwindet,
//   • ob eine offene Laufzeit als offene Aussage erscheint (und nicht als Spanne),
//   • ob die Karte OHNE Laufzeit ihren ruhigen Rueckfall behaelt,
//   • ob die Paketshopabgabe erkennbar ist, OHNE eine Suche anzubieten, die es fuer
//     dieses Angebot nicht gibt,
//   • ob dieselbe Kartenkomponente beide Einkaufsquellen traegt,
//   • und ob die Karten auf vier Breiten layoutstabil bleiben.
//
// Bewusst gegen ein gemocktes Backend — niemals eine echte Berechnung, niemals eine
// Bestellung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_ABSENDER } from "./helpers/newShipmentForm.mjs";

const PORT = 5269, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = { id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
               role: "customer", status: "approved", country: "DE", zip: "97421", customer_number: "CE-K-10030" };

const preis = (n) => ({ netPrice: n, vatAmount: Number((n * 0.19).toFixed(2)), finalPrice: Number((n * 1.19).toFixed(2)) });

// Der Angebotsstrom, wie ihn die Route nach diesem Paket liefert: ein JUMiNGO-Tarif mit
// echten Kalenderdaten und vier Transglobal-Angebote mit den vier Laufzeitfaellen.
const TARIFE = [
  // JUMiNGO — unveraendert: Zahlen UND echte Daten.
  { id: 501, shipper_tariff_id: 3309, offerId: "o-j", publicCarrierId: "dpd", publicCarrierName: "DPD",
    publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
    transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1-2 Tage",
    deliveryDate: "2026-09-07", deliveryDateMin: "2026-09-07", deliveryDateMax: "2026-09-08",
    pickupDate: "2026-09-05", trackingAvailable: true, printerRequired: true,
    availableForDate: true, bookable: true, ...preis(24) },
  // TG geschlossen, eine Spanne.
  { offerId: "o-t-range", publicCarrierId: "ups", publicCarrierName: "UPS",
    publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
    transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
    deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
    bookable: false, unavailableReason: "quote_only", ...preis(14.4) },
  // TG geschlossen, genau ein Tag — und Paketshopabgabe.
  { offerId: "o-t-shop", publicCarrierId: "dpd", publicCarrierName: "DPD",
    publicServiceName: "Standardversand", serviceType: "dropoff", currency: "EUR",
    transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
    deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
    bookable: false, unavailableReason: "quote_only", ...preis(7.2) },
  // TG offen nach oben.
  { offerId: "o-t-open", publicCarrierId: "ups", publicCarrierName: "UPS",
    publicServiceName: "Expressversand", serviceType: "pickup", currency: "EUR",
    transitDaysMin: 1, transitDaysMax: null, deliveryTime: "ab 1 Tag",
    deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
    bookable: false, unavailableReason: "quote_only", ...preis(39) },
  // TG ohne jede Laufzeitangabe — der ruhige Rueckfall bleibt.
  { offerId: "o-t-none", publicCarrierId: "gls", publicCarrierName: "GLS",
    publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
    transitDaysMin: null, transitDaysMax: null, deliveryTime: null,
    deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
    bookable: false, unavailableReason: "quote_only", ...preis(9.6) },
];

const ABSENDER = { zip: "97421", city: "Schweinfurt", street: "Musterweg 1" };
let server, browser;

function setupRoutes(page) {
  return page.route("**/api.confidaraexpress.de/**", async (route) => {
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
    if (p.includes("/api/shipping/launch-scope")) return json({ countries: ["DE"], partialCountries: [] });
    if (p.includes("/api/jumingo/calculate-price")) {
      return json({ shipmentId: "s_e2e", ceShipmentId: 4711, tariffs: TARIFE,
        availableShippingModes: ["express", "standard"],
        publicCarriers: [{ id: "dpd", name: "DPD" }, { id: "ups", name: "UPS" }, { id: "gls", name: "GLS" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null });
    }
    return json({});
  });
}

async function angebote(page, viewport = { width: 1440, height: 1200 }) {
  await page.setViewportSize(viewport);
  await setupRoutes(page);
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { absender: { ...STANDARD_ABSENDER, ...ABSENDER } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

// Die Laufzeitzeile („ETA") jeder Karte, in Reihenfolge.
const etaZeilen = (page) => page.locator(".offer-card .offer-eta").allInnerTexts();

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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits
    // node startet. Ein Signal an den npx-Prozess liesse den Enkel auf seinem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — \"Auf Anfrage\" verschwindet, wo eine belastbare Laufzeit vorliegt", async () => {
  const page = await browser.newPage();
  await angebote(page);
  assert.equal(await page.locator(".offer-card").count(), 5);
  const eta = await etaZeilen(page);
  assert.deepEqual(eta, ["1–2 Tage", "1–2 Tage", "1 Tag", "ab 1 Tag", "Auf Anfrage"]);
  // Genau EINE Karte darf den Rueckfall zeigen — die ohne jede Angabe.
  assert.equal(eta.filter((t) => t === "Auf Anfrage").length, 1);
  await page.close();
});

test("2 — die offene Laufzeit erscheint als offene Aussage, nicht als Spanne", async () => {
  const page = await browser.newPage();
  await angebote(page);
  const karte = page.locator(".offer-card").nth(3);
  const text = await karte.innerText();
  assert.match(text, /ab 1 Tag/);
  // Ausdruecklich KEINE erfundene Obergrenze auf der Karte.
  for (const verboten of ["1–2 Tage", "1-2 Tage", "1–3", "2 Tage"]) {
    assert.ok(!text.includes(verboten), `die Karte behauptet "${verboten}"`);
  }
  await page.close();
});

test("3 — dieselbe Kartenkomponente traegt beide Einkaufsquellen", async () => {
  const page = await browser.newPage();
  await angebote(page);
  // Es gibt keine zweite Kartenklasse und keine Providerkarte.
  assert.equal(await page.locator(".offer-card").count(), 5);
  assert.equal(await page.locator("[class*='transglobal' i], [class*='tg-offer' i]").count(), 0);
  // Der JUMiNGO-Tarif zeigt sein echtes Datum, das TG-Angebot seine Laufzeit — beide in
  // derselben Zeitleiste derselben Karte.
  const jum = page.locator(".offer-card").nth(0);
  const tg  = page.locator(".offer-card").nth(1);
  assert.match(await jum.innerText(), /09\.|Sept|Mo\.|So\./);
  assert.match(await tg.innerText(), /1–2 Tage/);
  for (const k of [jum, tg]) {
    assert.ok(await k.locator(".offer-card-inner").count() === 1, "abweichender Kartenaufbau");
  }
  await page.close();
});

test("4 — Paketshopabgabe ist erkennbar, bietet aber KEINE Suche an", async () => {
  const page = await browser.newPage();
  await angebote(page);
  const shop = page.locator(".offer-card").nth(2);
  const text = await shop.innerText();
  assert.match(text, /Paketshop|Abgabe/i, "die Abgabeart ist nicht erkennbar");
  // Der Einstieg in den Paketshop-Finder darf auf DIESER Karte nicht erscheinen: fuer
  // Transglobal gibt es keine Access-Point-Suche, und ein Knopf, der nichts oeffnet,
  // waere schlechter als gar keiner.
  assert.equal(await shop.locator(".ps-trigger").count(), 0, "die Karte bietet eine Suche an, die es nicht gibt");
  // Auf der ganzen Liste erscheint sie ebenfalls nirgends — der JUMiNGO-Tarif ist pickup.
  assert.equal(await page.locator(".ps-trigger").count(), 0);
  await page.close();
});

test("5 — quote-only bleibt bestehen: kein TG-Angebot wird buchbar", async () => {
  const page = await browser.newPage();
  await angebote(page);
  const gesperrt = page.locator(".offer-card--unavailable");
  assert.equal(await gesperrt.count(), 4, "die TG-Angebote sind nicht mehr als quote-only erkennbar");
  assert.match(await gesperrt.first().innerText(), /nicht direkt buchbar/i);
  // Und die Laufzeit steht trotzdem auf der gesperrten Karte — Information ohne Buchbarkeit.
  assert.match(await gesperrt.first().innerText(), /1–2 Tage/);
  await page.close();
});

test("6 — vier Breiten: layoutstabil, kein Ueberlauf, Laufzeit ueberall sichtbar", async () => {
  for (const [name, width, height] of [["Desktop", 1440, 1000], ["Laptop", 1280, 800],
                                        ["Tablet", 834, 1112], ["Mobil", 390, 844]]) {
    const page = await browser.newPage();
    await angebote(page, { width, height });
    const eta = await etaZeilen(page);
    assert.deepEqual(eta, ["1–2 Tage", "1–2 Tage", "1 Tag", "ab 1 Tag", "Auf Anfrage"], `${name}: Laufzeiten`);

    const ueberlauf = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(ueberlauf <= 1, `${name}: die Seite scrollt waagerecht (${ueberlauf}px)`);

    // Keine ETA-Zeile laeuft aus ihrer Karte.
    const raus = await page.locator(".offer-card .offer-eta").evaluateAll((els) => els.filter((e) => {
      const k = e.closest(".offer-card");
      const a = e.getBoundingClientRect(), b = k.getBoundingClientRect();
      return a.right > b.right + 1 || a.left < b.left - 1 || a.height === 0;
    }).length);
    assert.equal(raus, 0, `${name}: eine Laufzeitzeile ragt aus ihrer Karte`);

    // Die Karte ohne Laufzeit ist nicht durch einen leeren Platzhalter aufgeblaeht:
    // sie darf nicht hoeher sein als eine gleichartige Karte MIT Laufzeit.
    const hoehen = await page.locator(".offer-card").evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().height)));
    assert.ok(hoehen[4] <= hoehen[1] + 1,
      `${name}: die Karte ohne Laufzeit ist hoeher (${hoehen[4]} vs ${hoehen[1]})`);
    await page.close();
  }
});
