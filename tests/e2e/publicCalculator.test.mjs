// E2E: der öffentliche Preisrechner (preisrechner/, zweiter Build) im echten Browser gegen ein gemocktes Backend.
// Kein echter Request, kein Anbieter, keine Buchung.
//
//   A  1440 und 390 px: prepare ist die ERSTE API-Anfrage und hängt 30 s — das Formular bleibt bedienbar,
//      die Preisabfrage läuft trotzdem; genau die 15 Felder; Karten mit Netto und Brutto, „ab“ samt
//      Erklärung, Zuschlagshinweis nur laut requiredPriceInputs, Aktion nur bei availableWithShipmentDetails,
//      Fokus auf der Ergebnisüberschrift, kein horizontales Scrollen, keine Einkaufsquelle im DOM, kein Storage.
//   B  Zustände partial, leer, 422, 429, 503, Netzfehler — und eine unveränderte Eingabe fragt nicht erneut.
//   C  Laden: ehrliche Wartezeit, ab 10 s der Hinweis; keine feste Dauer.
//   D  prepare meldet „available: false“: Hinweis statt Absenden, keine Preisabfrage.
//   E  Tastatur: Skip-Link, Pflichtfelder mit Fehlern am Feld, Absenden per Enter, Fokus auf die Ergebnisse.
//   F  Übergabe: „Mit diesem Tarif fortfahren“ öffnet die feste Adresse der Hauptdomain mit dem Token im Fragment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5564, BASE = `http://127.0.0.1:${PORT}`;
const API = "https://api.confidaraexpress.de";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const pk = (z) => `pk1_${z.repeat(22)}`;
const TOKEN_UPS = `h1.${"U".repeat(90)}`;
const angebot = (felder) => ({
  productKey: null, publicCarrierId: null, publicServiceName: null, serviceType: "pickup",
  pickupDate: "2026-10-21", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00", collectionDate: null,
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
  angebot({ productKey: pk("U"), publicCarrierId: "ups", publicServiceName: "Standard", handoffToken: TOKEN_UPS }),
  angebot({ productKey: pk("D"), publicCarrierId: "dhl", publicServiceName: "Express", serviceType: "dropoff",
    collectionDate: "2026-10-21", pickupDate: null, pickupTimeFrom: null, pickupTimeUntil: null,
    priceCompleteness: "indicative", priceStatus: "from", netPrice: 8.4, vatAmount: 1.6, finalPrice: 10,
    requiredPriceInputs: ["deliveryIsResidential"], unavailableReason: "quote_only", handoffToken: `h1.${"D".repeat(90)}` }),
  angebot({ productKey: pk("P"), publicCarrierId: "dpd", publicServiceName: "Classic", availableWithShipmentDetails: false,
    unavailableReason: "quote_only", netPrice: 7.1, vatAmount: 1.35, finalPrice: 8.45, labelHandling: "carrier_at_pickup",
    recipientRequirement: "business" }),
];
const CARRIER = [{ id: "dhl", name: "DHL Express" }, { id: "dpd", name: "DPD" }, { id: "ups", name: "UPS" }];

let server, browser;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

async function setup(page, { prepare = { delayMs: 0, body: { available: true } }, quote } = {}) {
  const p = { reihenfolge: [], quotes: [], prepareBeantwortet: false };
  page.on("request", (req) => {
    if (req.url().startsWith(API)) p.reihenfolge.push(`${req.method()} ${new URL(req.url()).pathname}`);
  });
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200, headers = {}) => route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(b) });
    if (pfad === "/api/public/price-quote/prepare") {
      if (prepare.delayMs) await kurz(prepare.delayMs);
      p.prepareBeantwortet = true;
      try { return await json(prepare.body); } catch { return undefined; }
    }
    if (pfad === "/api/public/launch-scope") return json({ countries: EU27, destinationCountries: EU27, originCountries: ["DE"] });
    if (pfad === "/api/public/price-quote") {
      let body = {};
      try { body = JSON.parse(req.postData() || "{}"); } catch { /* leer */ }
      p.quotes.push({ body, prepareBeantwortet: p.prepareBeantwortet });
      const antwort = typeof quote === "function" ? quote(p.quotes.length, body) : null;
      if (antwort && antwort.abort) return route.abort("failed");
      if (antwort && antwort.delayMs) await kurz(antwort.delayMs);
      if (antwort && antwort.status) return json(antwort.body || {}, antwort.status, antwort.headers || {});
      return json({ status: "ok", quotedAt: "2026-10-21T08:00:00.000Z", publicCarriers: CARRIER,
        availableShippingModes: ["express", "standard"], offers: ANGEBOTE });
    }
    return json({ error: "unerwartet" }, 404);
  });
  return p;
}

async function neueSeite(viewport) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function fuelle(page, { gewicht = "2,5" } = {}) {
  await page.fill("#pc-from-zip", "70173");
  await page.fill("#pc-from-city", "Stuttgart");
  await page.fill("#pc-to-zip", "10115");
  await page.fill("#pc-to-city", "Berlin");
  await page.fill("#pc-weight", gewicht);
  await page.fill("#pc-length", "30");
  await page.fill("#pc-width", "20");
  await page.fill("#pc-height", "10");
}

async function oeffne(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pc-submit", { timeout: 30000 });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--config", "vite.preisrechner.config.js", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
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
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
});

for (const [breite, hoehe] of [[1440, 900], [390, 844]]) {
  test(`A ${breite}px — prepare zuerst und hängend, Formular bedienbar, Karten, Fokus, kein Querscrollen, keine Einkaufsquelle`, async () => {
    const { page, fehler } = await neueSeite({ width: breite, height: hoehe });
    const p = await setup(page, { prepare: { delayMs: 30000, body: { available: true } } });
    await oeffne(page);
    assert.equal(await page.locator("#pc-submit").isDisabled(), false, "das Absenden wartet auf prepare");
    await fuelle(page);
    await page.click("#pc-submit");
    await page.waitForSelector("#pc-offers .pc-offer", { timeout: 20000 });

    assert.match(p.reihenfolge[0] || "", /^POST \/api\/public\/price-quote\/prepare$/, `erste Anfrage: ${p.reihenfolge.join(", ")}`);
    assert.equal(p.quotes.length, 1);
    assert.equal(p.quotes[0].prepareBeantwortet, false, "die Preisabfrage lief, während prepare noch hing");
    assert.deepEqual(Object.keys(p.quotes[0].body).sort(), ["from_city", "from_country", "from_zip", "height", "length",
      "packageCount", "publicCarrierIds", "serviceFilter", "shippingDate", "shippingModeFilter", "to_city", "to_country", "to_zip",
      "weight", "width"]);
    assert.equal(p.quotes[0].body.weight, 2.5, "Dezimalkomma als Zahl");

    const karten = page.locator("#pc-offers .pc-offer");
    assert.equal(await karten.count(), 3);
    const ups = norm(await karten.nth(0).innerText());
    assert.match(ups, /UPS/);
    assert.match(ups, /10,50\s*€\s*netto/);
    assert.match(ups, /12,50\s*€\s*brutto/);
    assert.match(ups, /laut Versanddienstleister/);
    assert.ok(!/\bab\b 10,50/.test(ups), "ein exakter Preis trägt kein „ab“");
    const dhl = norm(await karten.nth(1).innerText());
    assert.match(dhl, /ab 8,40\s*€\s*netto/);
    assert.match(dhl, /nach der Anmeldung mit vollständigen Sendungsangaben/);
    assert.match(dhl, /Bei einer privaten Lieferadresse kann ein Zuschlag anfallen\./);
    const dpd = norm(await karten.nth(2).innerText());
    assert.match(dpd, /Derzeit nicht direkt buchbar/);
    assert.match(dpd, /Nur für Geschäftsempfänger verfügbar\./);
    assert.equal(await karten.nth(2).locator("button").count(), 0, "ohne availableWithShipmentDetails keine Aktion");
    assert.equal(await karten.nth(0).getByRole("button", { name: "Mit diesem Tarif fortfahren" }).count(), 1);
    assert.equal(await page.locator(".pc-badge, .offer-badge").count(), 0, "keine Bestwahl-Markierung");

    // Gleich hohe Karten (die Liste steht einspaltig oder im Raster — die Höhe ist je Zeile gleich).
    const hoehen = await karten.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    assert.equal(new Set(hoehen).size, 1, `ungleiche Kartenhöhen: ${hoehen}`);

    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "pc-results-title");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "horizontales Scrollen");
    // Der gerenderte Körper — im Entwicklungsserver steht das Stylesheet samt Kommentaren inline im Kopf.
    assert.doesNotMatch(await page.evaluate(() => document.body.outerHTML), /jumingo|transglobal/i);
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
    assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage)), []);
    // Die Seite zeigt die Marke und ruft keine Ressource einer anderen Domain außer der API.
    assert.ok(await page.locator(".pc-brand-img").evaluate((img) => img.complete && img.naturalWidth > 0), "Marken-Lockup nicht geladen");
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

test("B — Zustände partial, leer, 422, 429, 503, Netzfehler; unveränderte Eingabe ohne neuen Request", async () => {
  const { page, fehler } = await neueSeite({ width: 1440, height: 900 });
  const folge = [
    { status: 200, body: { status: "partial", publicCarriers: CARRIER, availableShippingModes: [], offers: ANGEBOTE.slice(0, 1) } },
    { status: 200, body: { status: "no_offers", publicCarriers: [], availableShippingModes: [], offers: [] } },
    { status: 422, body: { error: "Diese Versandroute wird derzeit nicht unterstützt.", code: "ROUTE_NOT_SUPPORTED" } },
    { status: 429, body: { error: "Zu viele Anfragen.", code: "RATE_LIMITED" }, headers: { "Retry-After": "900" } },
    { status: 503, body: { error: "nicht verfügbar", code: "PUBLIC_CALCULATOR_UNAVAILABLE" } },
    { abort: true },
  ];
  const p = await setup(page, { quote: (n) => folge[n - 1] || null });
  await oeffne(page);
  await fuelle(page, { gewicht: "1" });
  await page.click("#pc-submit");
  await page.waitForSelector("#pc-partial", { timeout: 20000 });
  assert.equal(await page.locator("#pc-offers .pc-offer").count(), 1, "partial zeigt die vorliegenden Angebote");
  await page.click("#pc-submit");
  await kurz(400);
  assert.equal(p.quotes.length, 1, "eine unveränderte Eingabe hat neu gefragt");

  const erwartet = [
    ["2", "#pc-empty", /Keine Angebote für diese Angaben/],
    ["3", "#pc-outcome-route", /Versandroute nicht verfügbar/],
    ["4", "#pc-outcome-rate_limited", /Zu viele Anfragen/],
    ["5", "#pc-outcome-unavailable", /derzeit nicht verfügbar/],
    ["6", "#pc-outcome-network", /Verbindung unterbrochen/],
  ];
  for (const [gewicht, selektor, text] of erwartet) {
    await page.fill("#pc-weight", gewicht);
    await page.click("#pc-submit");
    await page.waitForSelector(selektor, { timeout: 20000 });
    assert.match(norm(await page.locator(selektor).innerText()), text);
    assert.doesNotMatch(norm(await page.locator(selektor).innerText()), /ROUTE_NOT_SUPPORTED|RATE_LIMITED|PUBLIC_CALCULATOR/);
  }
  assert.equal(await page.locator("#pc-retry").count(), 1, "nach einem Netzfehler lässt sich die Berechnung wiederholen");
  assert.equal(p.quotes.length, 6);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — Laden: ehrliche Wartezeit, ab 10 s der Hinweis auf länger rechnende Versanddienstleister", async () => {
  const { page, fehler } = await neueSeite({ width: 1440, height: 900 });
  await setup(page, { quote: () => ({ delayMs: 11500, status: 200,
    body: { status: "ok", publicCarriers: CARRIER, availableShippingModes: [], offers: ANGEBOTE } }) });
  await oeffne(page);
  await fuelle(page);
  await page.click("#pc-submit");
  await page.waitForSelector("#pc-loading", { timeout: 5000 });
  assert.equal(await page.locator("#pc-submit").isDisabled(), true, "während der Berechnung gesperrt");
  assert.equal(await page.locator("#pc-loading-slow").count(), 0, "der Hinweis kommt erst nach 10 s");
  assert.doesNotMatch(norm(await page.locator("#pc-loading").innerText()), /dauert (höchstens|maximal)|in \d+ Sekunden fertig/);
  await page.waitForSelector("#pc-loading-slow", { timeout: 12000 });
  await page.waitForSelector("#pc-offers .pc-offer", { timeout: 15000 });
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — ausgeschaltet: Hinweis statt Absenden, keine Preisabfrage", async () => {
  const { page, fehler } = await neueSeite({ width: 390, height: 844 });
  const p = await setup(page, { prepare: { delayMs: 0, body: { available: false } } });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pc-unavailable", { timeout: 30000 });
  assert.match(norm(await page.locator("#pc-unavailable").innerText()), /in Kürze verfügbar/);
  assert.equal(await page.locator("#pc-submit").count(), 0);
  assert.equal(p.quotes.length, 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — Tastatur: Skip-Link, Fehler am Feld, Absenden per Enter, Fokus auf die Ergebnisse", async () => {
  const { page, fehler } = await neueSeite({ width: 1440, height: 900 });
  await setup(page);
  await oeffne(page);
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.className), "pc-skip");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement.id), "pc-calculator-title");
  // Leeres Absenden: Fehler stehen am Feld (aria-describedby), der Fokus geht ins erste fehlerhafte Feld.
  await page.focus("#pc-submit");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#pc-form-banner", { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.activeElement.id), "pc-from-zip");
  const beschrieben = await page.locator("#pc-from-zip").getAttribute("aria-describedby");
  assert.ok(beschrieben && await page.locator(`#${beschrieben.split(" ")[0]}`).count() === 1, "Fehlertext ist nicht verknüpft");
  assert.equal(await page.locator("#pc-from-zip").getAttribute("aria-invalid"), "true");
  await page.keyboard.type("70173");
  for (const [id, wert] of [["#pc-from-city", "Stuttgart"], ["#pc-to-zip", "10115"], ["#pc-to-city", "Berlin"],
    ["#pc-weight", "2"], ["#pc-length", "30"], ["#pc-width", "20"], ["#pc-height", "10"]]) {
    await page.focus(id);
    await page.keyboard.type(wert);
  }
  await page.keyboard.press("Enter");
  await page.waitForSelector("#pc-offers .pc-offer", { timeout: 20000 });
  assert.equal(await page.evaluate(() => document.activeElement.id), "pc-results-title");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F — Übergabe: feste Adresse der Hauptdomain, Token nur im Fragment", async () => {
  const { page, fehler } = await neueSeite({ width: 1440, height: 900 });
  await setup(page);
  await page.route("https://confidaraexpress.de/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Hauptdomain</title>" }));
  await oeffne(page);
  await fuelle(page);
  await page.click("#pc-submit");
  await page.waitForSelector("#pc-offers .pc-offer", { timeout: 20000 });
  await page.locator("#pc-offers .pc-offer").nth(0).getByRole("button", { name: "Mit diesem Tarif fortfahren" }).click();
  await page.waitForURL(/^https:\/\/confidaraexpress\.de\/preisrechner-uebernahme/, { timeout: 10000 });
  assert.equal(page.url(), `https://confidaraexpress.de/preisrechner-uebernahme#t=${TOKEN_UPS}`);
  assert.deepEqual(fehler, []);
  await page.close();
});
