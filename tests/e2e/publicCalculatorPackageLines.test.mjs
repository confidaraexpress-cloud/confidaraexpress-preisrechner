// E2E: individuelle Mehrpaketsendungen im öffentlichen Preisrechner (preisrechner/, zweiter Build; Canonical v2.79,
// §15) — echter Browser, gemocktes Backend. Kein echter Request, kein Anbieter, keine Buchung.
//
//   Q1  Startansicht: eine Zeile mit „Paket hinzufügen“, ohne Überschrift; eine Zeile sendet exakt die
//       15 Felder wie bisher.
//   Q2  Zwei Paketarten per Tastatur: `packageLines` (Dezimalkomma je Zeile), Zusammenfassung der Anfrage mit
//       Summe, Satz über den Angeboten, Angebotsgrund ohne Anbieterregel, „Weiter“ nur mit Token.
//   Q3  Serverfehler `packageLines[1].weight` steht an Zeile 2; Leerzustand mit Zusatz.
//   Q4  1440 und 375 px: kein Querscrollen, schmale Karte je Zeile, Aktionen ≥ 44 px.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5623, BASE = `http://127.0.0.1:${PORT}`;
const API = "https://api.confidaraexpress.de";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const angebot = (felder) => ({
  productKey: null, publicCarrierId: "ups", publicServiceName: "Express Saver", serviceType: "pickup",
  pickupDate: "2026-10-26", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00", collectionDate: null,
  collectionReadyFrom: null, collectionDateAdjusted: false, deliveryDate: null, deliveryDateMin: null,
  deliveryDateMax: null, deliveryTimeUntil: null, deliveryTimeUntilMinutes: null, deliveryProjection: null,
  deliveryTime: null, transitDaysMin: 1, transitDaysMax: 1, netPrice: 31.4, vatAmount: 5.97, finalPrice: 37.37,
  currency: "EUR", priceCompleteness: "indicative", priceStatus: "from", unavailableReason: null,
  availableWithShipmentDetails: true, requiredPriceInputs: [], surchargeFreePriceInputs: [], recipientRequirement: null,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
  insuranceAvailable: false, trackingAvailable: true, printerRequired: true, labelHandling: null, handoffToken: null,
  ...felder,
});
const ANGEBOTE = [
  angebot({ productKey: `pk1_${"U".repeat(22)}`, handoffToken: `h1.${"U".repeat(90)}` }),
  angebot({ productKey: `pk1_${"T".repeat(22)}`, publicCarrierId: "tnt", publicServiceName: "Express", netPrice: 44.2,
    vatAmount: 8.4, finalPrice: 52.6, availableWithShipmentDetails: false, unavailableReason: "package_combination_unverified" }),
];

let server, browser;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

async function setup(page, { quote } = {}) {
  const p = { quotes: [] };
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad === "/api/public/price-quote/prepare") return json({ available: true });
    if (pfad === "/api/public/launch-scope") return json({ countries: EU27, destinationCountries: EU27, originCountries: ["DE"] });
    if (pfad === "/api/public/price-quote") {
      let body = {};
      try { body = JSON.parse(req.postData() || "{}"); } catch { /* leer */ }
      p.quotes.push(body);
      const a = typeof quote === "function" ? quote(p.quotes.length, body) : null;
      if (a && a.status) return json(a.body || {}, a.status);
      return json({ status: "ok", quotedAt: "2026-10-26T08:00:00.000Z", publicCarriers: [{ id: "tnt", name: "TNT" }, { id: "ups", name: "UPS" }],
        availableShippingModes: ["express"], offers: a && a.offers ? a.offers : ANGEBOTE });
    }
    return json({ error: "unerwartet" }, 404);
  });
  return p;
}

async function neueSeite(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function oeffne(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pc-submit", { timeout: 30000 });
  await page.fill("#pc-from-zip", "70173");
  await page.fill("#pc-from-city", "Stuttgart");
  await page.fill("#pc-to-zip", "10115");
  await page.fill("#pc-to-city", "Berlin");
  await page.fill("#pc-weight", "15");
  await page.fill("#pc-length", "20");
  await page.fill("#pc-width", "20");
  await page.fill("#pc-height", "20");
}

const addKnopf = (page) => page.getByRole("button", { name: "Paket hinzufügen" });

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
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("Q1 — Startansicht mit „Paket hinzufügen“; eine Zeile sendet exakt die 15 Felder", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await oeffne(page);
  assert.equal(await addKnopf(page).isVisible(), true);
  assert.equal(await page.locator(".pkg-line-title").count(), 0);
  assert.equal(norm(await page.locator("#pc-package-hint").textContent()), "Gewicht und Maße je Paket.");
  await page.click("#pc-submit");
  await page.waitForSelector(".pc-offer, #pc-results-title", { timeout: 20000 });
  assert.equal(Object.keys(p.quotes[0]).length, 15);
  assert.ok(!("packageLines" in p.quotes[0]));
  assert.deepEqual(fehler, []);
  await page.close();
});

test("Q2 — zwei Paketarten per Tastatur: packageLines, Summe, Satz über den Angeboten, Grund ohne Anbieterregel", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await oeffne(page);
  await page.focus("#pc-height");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#pc-package-count-2");
  assert.equal(await page.evaluate(() => document.activeElement.id), "pc-package-count-2");
  await page.keyboard.type("2");
  for (const v of ["8,5", "40", "30", "25"]) { await page.keyboard.press("Tab"); await page.keyboard.type(v); }
  assert.deepEqual(await page.locator(".pkg-line-title").allTextContents(), ["Paket 1", "Paket 2"]);
  assert.equal(norm(await page.locator(".pkg-lines-sum").textContent()), "3 Pakete · 32 kg gesamt");
  await page.click("#pc-submit");
  await page.waitForSelector("#pc-packages-note", { timeout: 20000 });
  const b = p.quotes[0];
  assert.deepEqual(b.packageLines, [
    { quantity: 1, weight: 15, length: 20, width: 20, height: 20 },
    { quantity: 2, weight: 8.5, length: 40, width: 30, height: 25 },
  ]);
  assert.ok(!("packageCount" in b), "flache Felder neben packageLines");
  assert.equal(norm(await page.locator("#pc-results-summary").textContent()), "DE 70173 Stuttgart → DE 10115 Berlin · 3 Pakete · 32 kg gesamt");
  assert.equal(norm(await page.locator("#pc-packages-note").textContent()),
    "Für unterschiedliche Pakete werden nur Versandarten angezeigt, die alle Pakete befördern können.");
  const ergebnis = norm(await page.locator("#pc-results-section").textContent());
  assert.ok(ergebnis.includes("Für unterschiedliche Pakete derzeit nicht direkt buchbar."), ergebnis);
  assert.ok(!/package_|höchstens \d+ Pakete/.test(ergebnis), "Rohgrund oder Stückgrenze als Anbieterregel");
  assert.equal(await page.locator("#pc-results-section .pc-offer-continue").count(), 1, "„Weiter“ nur beim Angebot mit Token");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("Q3 — Serverfehler an Zeile 2; Leerzustand mit Zusatz, auch für die Paketkombination ohne Angebot (422)", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { quote: (n) => {
    if (n === 1) return { status: 400, body: { error: "packageLines[1].weight: Pflichtfeld", code: "WEIGHT_INVALID", field: "packageLines[1].weight" } };
    if (n === 3) return { status: 422, body: { code: "PACKAGE_COMBINATION_UNAVAILABLE",
      error: "Für diese Paketkombination sind derzeit keine Angebote verfügbar. Bitte prüfen Sie die Paketangaben." } };
    return { offers: [] };
  } });
  await oeffne(page);
  await addKnopf(page).click();
  for (const [feld, v] of [["package-count", "2"], ["weight", "8"], ["length", "40"], ["width", "30"], ["height", "25"]])
    await page.fill(`#pc-${feld}-2`, v);
  await page.click("#pc-submit");
  await page.waitForFunction(() => document.getElementById("pc-weight-2")?.getAttribute("aria-invalid") === "true", null, { timeout: 20000 });
  assert.notEqual(await page.locator("#pc-weight").getAttribute("aria-invalid"), "true", "nicht an Zeile 1");
  await page.fill("#pc-weight-2", "9");
  await page.click("#pc-submit");
  await page.waitForSelector("#pc-empty", { timeout: 20000 });
  assert.match(norm(await page.locator("#pc-empty").textContent()), /Weniger oder gleich große Pakete erweitern die Auswahl\.$/);
  // Die echte Serverantwort für eine Paketkombination ohne Angebot ist 422 PACKAGE_COMBINATION_UNAVAILABLE:
  // derselbe Leerzustand, kein „Angaben prüfen“ ohne markiertes Feld.
  await page.fill("#pc-package-count-2", "5");
  await page.click("#pc-submit");
  await page.waitForFunction(() => /6 Pakete/.test(document.getElementById("pc-results-summary")?.textContent || ""), null, { timeout: 20000 });
  await page.waitForSelector("#pc-empty", { timeout: 20000 });
  assert.equal(p.quotes.length, 3);
  assert.match(norm(await page.locator("#pc-empty").textContent()), /^Keine direkt buchbaren Angebote.*Weniger oder gleich große Pakete erweitern die Auswahl\.$/);
  assert.equal(await page.locator("#pc-outcome-invalid").count(), 0, "kein Eingabefehler ohne markiertes Feld");
  assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("Q4 — 1440 und 375 px: kein Querscrollen, schmale Karte je Zeile, Aktionen ≥ 44 px", async () => {
  for (const breite of [1440, 375]) {
    const { page, fehler } = await neueSeite({ width: breite, height: 900 });
    await setup(page);
    await oeffne(page);
    await addKnopf(page).click();
    await page.waitForSelector("#pc-weight-2");
    const m = await page.evaluate(() => ({
      quer: document.documentElement.scrollWidth > window.innerWidth,
      rand: getComputedStyle(document.querySelectorAll(".pkg-line")[1]).borderLeftWidth,
      knoepfe: [...document.querySelectorAll(".pkg-lines button")].map((b) => Math.round(b.getBoundingClientRect().height)),
    }));
    assert.equal(m.quer, false, `${breite}: horizontales Scrollen`);
    if (breite === 375) assert.equal(m.rand, "1px", "375: keine Karte je Zeile");
    for (const h of m.knoepfe) assert.ok(h >= 44, `${breite}: Aktion nur ${h} px hoch`);
    assert.deepEqual(fehler, []);
    await page.close();
  }
});
