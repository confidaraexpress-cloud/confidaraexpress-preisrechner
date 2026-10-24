// E2E: TG124-Paketshopkarte mit geprüften Kartenpositionen (P3) im gemeinsamen Finder — echter Dev-Server.
//
// Grundlage ist die Antwort, die das Backend mit eingeschalteten Kartenpositionen liefert
// (tests/fixtures/tg124ParcelShops63808Positions.mjs: Gebäudeschranke und Plausibilität des echten
// lib/parcelShopPositions.js). Geprüft wird, dass die TG124-Karte dieselbe Karte, dieselben nummerierten Marker,
// dieselbe Liste und dieselbe Bedienung zeigt wie die JUMiNGO-Orientierung — und dass nur das technisch Nötige
// abweicht: die verbindliche Auswahl, keine erfundenen Öffnungszeiten, keine wirkungslosen Filter.
//
// NIEMALS eine echte Bestellung: `/book` ist abgefangen. Kein Provider, keine Kartenkacheln (Testengine).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_ABSENDER } from "./helpers/newShipmentForm.mjs";
import { DPD_RESPONSE, FREITAG } from "../fixtures/accessPointsDpd.mjs";
import { MAP_TEST_ENGINE_SCRIPT } from "../fixtures/mapTestEngine.mjs";
import { TG124_SHOPS_63808 } from "../fixtures/tg124ParcelShops63808.mjs";
import { TG124_SHOPS_63808_POSITIONS } from "../fixtures/tg124ParcelShops63808Positions.mjs";

const PORT = 5578, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "63808", customer_number: "CE-K-10030",
};
const BASIS_TARIF = {
  publicCarrierId: "dpd", publicCarrierName: "DPD", serviceType: "dropoff", currency: "EUR",
  transitDaysMin: 1, transitDaysMax: 2, trackingAvailable: true, printerRequired: false,
  availableForDate: true, deliveryDate: "2026-08-10T00:00:00Z",
};
const TG124_TARIF = { ...BASIS_TARIF, id: 2, shipper_tariff_id: 2, offerId: "OF-TG124", publicServiceName: "Shop Verbindlich",
  netPrice: 4.47, vatAmount: 0.85, finalPrice: 5.32, parcelShopSearch: "server" };
const JUMINGO_TARIF = { ...BASIS_TARIF, id: 1, shipper_tariff_id: 1, offerId: "OF-JUM-DPD", publicServiceName: "Shop Orientierung",
  netPrice: 6.9, vatAmount: 1.31, finalPrice: 8.21 };
const ABSENDER = { zip: "63808", city: "Haibach", street: "Würzburger Straße 229" };

const MIT = TG124_SHOPS_63808_POSITIONS;
const POSITIONIERT = MIT.map((s, i) => (Number.isFinite(s.latitude) ? i : -1)).filter((i) => i >= 0);
const NUMMERN = POSITIONIERT.map((i) => String(i + 1));

let server, browser;

async function setupRoutes(page, { shops = MIT, status = 200 } = {}) {
  const portalSuchen = [];
  const jumingoSuchen = [];
  const buchungen = [];
  const fremdeHosts = new Set();
  page.on("request", (r) => { const h = new URL(r.url()).host; if (h !== `127.0.0.1:${PORT}` && h !== "api.confidaraexpress.de") fremdeHosts.add(h); });
  await page.addInitScript(MAP_TEST_ENGINE_SCRIPT);
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/api/dropoff/parcelshops")) {
      portalSuchen.push(Object.fromEntries(url.searchParams));
      if (status !== 200) return json({ error: "Fehler" }, status);
      return json({ shops });
    }
    if (p.includes("/api/jumingo/access-points-search")) { jumingoSuchen.push(1); return json(DPD_RESPONSE); }
    if (p.includes("/api/jumingo/book")) {
      buchungen.push(JSON.parse(req.postData() || "{}"));
      return json({ trackingNumber: "TRACK1", labelUrl: null });
    }
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      ceShipmentId: 4711, tariffs: [TG124_TARIF, JUMINGO_TARIF],
      availableShippingModes: ["standard"], publicCarriers: [{ id: "dpd", name: "DPD" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return { portalSuchen, jumingoSuchen, buchungen, fremdeHosts };
}

async function zuDenAngeboten(page) {
  await page.clock.setFixedTime(new Date(FREITAG));
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { absender: { ...STANDARD_ABSENDER, ...ABSENDER } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.waitForSelector(".ps-trigger", { timeout: 20000 });
}

const karte = (page, dienst) => page.locator(".offer-card").filter({ hasText: dienst });
async function finder(page, dienst = "Shop Verbindlich", { tippen = false } = {}) {
  const knopf = karte(page, dienst).first().locator(".ps-trigger");
  if (tippen) await knopf.tap(); else await knopf.click();
  await page.waitForSelector(".ap-modal", { timeout: 10000 });
  await page.waitForSelector(".ap-modal .ap-list-item", { timeout: 20000 });
}
const schliessen = async (page) => {
  await page.locator(".ap-modal-close").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
};
const keinUeberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const kartenAufrufe = (page) => page.evaluate(() => window.__CE_MAP_CALLS__);

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
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
  if (server) stopDevServer(server, "SIGKILL");
});

test("1 — die TG124-Karte: Marker = Listennummern der geprüften Shops, lokaler Ausschnitt, Herkunft und Quellenangabe", async () => {
  assert.ok(POSITIONIERT.length > 0, "die Fixture trägt geprüfte Positionen");
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  await finder(page);
  assert.equal(await page.locator(".ap-modal .ap-modal-mapcol").count(), 1, "dieselbe Kartenspalte wie bei JUMiNGO");
  assert.equal(await page.locator(".ap-modal .ap-list-item").count(), 10, "die Liste zeigt alle Treffer");
  assert.deepEqual(await page.locator(".ap-modal .ap-map-marker").allInnerTexts(), NUMMERN, "Marker tragen die Nummer ihres Listeneintrags");
  const a = await kartenAufrufe(page);
  if (POSITIONIERT.length > 1) {
    const b = a.fitBounds.at(-1).bounds;
    assert.ok(b.north - b.south < 0.5 && b.east - b.west < 0.8, `lokaler Ausschnitt statt Deutschland: ${JSON.stringify(b)}`);
    for (const i of POSITIONIERT) {
      assert.ok(MIT[i].latitude >= b.south && MIT[i].latitude <= b.north && MIT[i].longitude >= b.west && MIT[i].longitude <= b.east);
    }
  } else {
    assert.equal(a.easeTo.at(-1).zoom, 15, "ein einzelner Marker wird nah angeflogen");
  }
  assert.match(await page.locator(".ap-modal-context-line").innerText(), /Kartenpositionen aus der Shopadresse ermittelt/);
  const quelle = await page.locator(".ap-modal .ap-modal-attr").innerText();
  assert.match(quelle, /OpenStreetMap/);
  assert.match(quelle, /Powered by Geoapify/);
  const abdeckung = POSITIONIERT.length < 10 ? `${POSITIONIERT.length} von 10 Paketshops haben eine Kartenposition.` : null;
  const zaehler = await page.locator(".ap-modal .ap-map-context").allInnerTexts();
  assert.deepEqual(zaehler, abdeckung ? [abdeckung] : [], "Abdeckungshinweis nur, wenn Positionen fehlen");
  // Keine erfundenen Öffnungszeiten, keine wirkungslosen Filter — auch mit Karte nicht.
  assert.equal(await page.locator(".ap-modal .ap-list-toggle").count(), 0);
  assert.equal(await page.locator(".ap-modal .ap-list-status, .ap-modal .ap-list-hours").count(), 0);
  assert.equal(await page.locator(".ap-modal select, .ap-modal input").count(), 1, "nur das PLZ-Feld");
  await page.close();
});

test("2 — Marker und Liste bedienen sich gegenseitig wie bei JUMiNGO: Marker hebt den Eintrag hervor, Eintrag aktiviert den Marker", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  await finder(page);
  const i = POSITIONIERT.at(-1);
  await page.locator(".ap-modal .ap-map-marker", { hasText: new RegExp(`^${i + 1}$`) }).click();
  const zeile = page.locator(".ap-modal .ap-list-item").nth(i);
  assert.equal(await zeile.locator(".ap-list-hit").getAttribute("aria-pressed"), "true", "der Eintrag zum Marker ist hervorgehoben");
  assert.match(await page.locator(".ap-map-popup-name").innerText(), new RegExp(MIT[i].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const flug = (await kartenAufrufe(page)).easeTo.at(-1);
  assert.ok(Math.abs(flug.lat - MIT[i].latitude) < 1e-9 && Math.abs(flug.lng - MIT[i].longitude) < 1e-9, "die Karte fliegt den Shop an");
  const j = POSITIONIERT[0];
  await page.locator(".ap-modal .ap-list-item").nth(j).locator(".ap-list-hit").click();
  assert.equal(await page.locator(".ap-modal .ap-map-marker--active").innerText(), String(j + 1), "der Listeneintrag aktiviert seinen Marker");
  await page.close();
});

test("3 — Auswahl im Popup, Wechsel in der Liste, Übernahme auf die Buchungsseite; /book ohne Koordinaten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const { buchungen } = await setupRoutes(page);
  await zuDenAngeboten(page);
  await finder(page);
  const erst = POSITIONIERT[0];
  await page.locator(".ap-modal .ap-map-marker", { hasText: new RegExp(`^${erst + 1}$`) }).click();
  await page.locator(".ap-map-popup-card .ap-map-popup-select").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  assert.equal(await karte(page, "Shop Verbindlich").first().locator(".ps-trigger-chosen").innerText(), `Gewählt: ${MIT[erst].name}`);
  await finder(page);
  const zweit = (erst + 3) % 10;
  await page.locator(".ap-modal .ap-list-item").nth(zweit).locator(".ap-list-select").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  await finder(page);
  assert.equal(await page.locator(".ap-modal .ap-list-item--chosen").count(), 1);
  assert.equal(await page.locator(".ap-modal .ap-list-item").nth(zweit).getAttribute("class"), "ap-list-item ap-list-item--chosen");
  await schliessen(page);
  await karte(page, "Shop Verbindlich").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  assert.equal(await page.locator(".dropoff-selected-name").innerText(), MIT[zweit].name);
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  for (let k = 0; k < 40 && buchungen.length === 0; k++) await page.waitForTimeout(100);
  assert.equal(buchungen.length, 1, "genau ein /book-Request");
  const shop = buchungen[0].dropoffParcelShop;
  assert.equal(shop.pickupLocationCode, MIT[zweit].pickupLocationCode);
  assert.equal(shop.parcelShopId, MIT[zweit].parcelShopId);
  assert.equal(shop.searchPostcode, "63808");
  for (const feld of ["latitude", "longitude", "positionSource", "distanceKm"]) {
    assert.ok(!(feld in shop), `${feld} gehört nicht in die Buchung — eine Position ist nie Kennung`);
  }
  await page.close();
});

test("4 — Anbieterwechsel: JUMiNGO-Orientierung mit eigener Karte; zurück zu TG124 ohne neue Suche, Auswahl erhalten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const { portalSuchen, jumingoSuchen } = await setupRoutes(page);
  await zuDenAngeboten(page);
  await finder(page);
  const gewaehlt = POSITIONIERT[0];
  await page.locator(".ap-modal .ap-list-item").nth(gewaehlt).locator(".ap-list-select").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  await finder(page, "Shop Orientierung");
  assert.ok(await page.locator(".ap-modal").getByLabel(/^Ort/).count() >= 1, "Orientierung: alle Suchfelder");
  assert.equal(await page.locator(".ap-modal .ap-list-select").count(), 0, "keine verbindliche Auswahl bei JUMiNGO");
  assert.ok(await page.locator(".ap-modal .ap-map-marker").count() > 0, "JUMiNGO-Karte mit eigenen Markern");
  assert.equal(await page.locator(".ap-modal .ap-modal-attr").count(), 0, "keine Geoapify-Quellenangabe bei JUMiNGO");
  await schliessen(page);
  await finder(page, "Shop Verbindlich");
  assert.equal(portalSuchen.length, 1, "TG124 sucht nicht erneut");
  assert.equal(jumingoSuchen.length, 1);
  assert.equal(await page.locator(".ap-modal .ap-list-item").nth(gewaehlt).getAttribute("class"), "ap-list-item ap-list-item--chosen");
  assert.deepEqual(await page.locator(".ap-modal .ap-map-marker").allInnerTexts(), NUMMERN);
  await page.close();
});

test("5 — Mobil 390 und Tablet 768: dieselbe Aufteilung wie JUMiNGO, Kartenansicht mit Markern, Auswahl per Touch", async () => {
  for (const [w, h] of [[390, 844], [768, 1024]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 768 });
    const page = await ctx.newPage();
    await setupRoutes(page);
    await zuDenAngeboten(page);
    await finder(page, "Shop Orientierung", { tippen: true });
    const jum = { toggle: await page.locator(".ap-modal .ap-modal-toggle").count(), spalte: await page.locator(".ap-modal .ap-modal-mapcol").count() };
    await schliessen(page);
    await finder(page, "Shop Verbindlich", { tippen: true });
    const tg = { toggle: await page.locator(".ap-modal .ap-modal-toggle").count(), spalte: await page.locator(".ap-modal .ap-modal-mapcol").count() };
    assert.deepEqual(tg, jum, `${w}px: dieselbe Aufteilung wie JUMiNGO`);
    if (tg.toggle) {
      await page.locator(".ap-modal .ap-modal-toggle-btn", { hasText: "Karte" }).tap();
      assert.ok(await page.locator(".ap-modal .ap-map-marker").first().isVisible(), `${w}px: Marker in der Kartenansicht`);
    }
    const i = POSITIONIERT[0];
    await page.locator(".ap-modal .ap-map-marker", { hasText: new RegExp(`^${i + 1}$`) }).tap();
    await page.locator(".ap-map-popup-card .ap-map-popup-select").tap();
    await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
    assert.equal(await karte(page, "Shop Verbindlich").first().locator(".ps-trigger-chosen").innerText(), `Gewählt: ${MIT[i].name}`);
    assert.equal(await keinUeberlauf(page), true, `${w}px ohne Überlauf`);
    await ctx.close();
  }
});

test("6 — unvollständige Koordinaten, keine Koordinaten, Ladefehler: nie eine irreführende Karte", async () => {
  // a) nur ein Teil mit Position
  const teil = MIT.map((s, i) => (i === POSITIONIERT[0] ? s : { ...TG124_SHOPS_63808[i] }));
  let page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { shops: teil });
  await zuDenAngeboten(page);
  await finder(page);
  assert.deepEqual(await page.locator(".ap-modal .ap-map-marker").allInnerTexts(), [String(POSITIONIERT[0] + 1)]);
  assert.deepEqual(await page.locator(".ap-modal .ap-map-context").allInnerTexts(), ["1 von 10 Paketshops haben eine Kartenposition."]);
  await page.close();
  // b) keine Position: keine Karte, keine Quellenangabe
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { shops: TG124_SHOPS_63808 });
  await zuDenAngeboten(page);
  await finder(page);
  assert.equal(await page.locator(".ap-modal .ap-map").count(), 0);
  assert.equal(await page.locator(".ap-modal .ap-modal-attr").count(), 0);
  await page.close();
  // c) Ladefehler: verständlich, keine Karte
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { status: 502 });
  await zuDenAngeboten(page);
  await karte(page, "Shop Verbindlich").first().locator(".ps-trigger").click();
  await page.waitForSelector(".ap-modal", { timeout: 10000 });
  await page.getByText(/Die Paketshop-Suche ist momentan nicht verfügbar/).waitFor({ timeout: 15000 });
  assert.equal(await page.locator(".ap-modal .ap-map").count(), 0);
  await page.close();
});

test("7 — keine ungewollten Anfragen: eine Portalsuche je PLZ, keine Anfrage an fremde Hosts", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const r = await setupRoutes(page);
  await zuDenAngeboten(page);
  await finder(page);
  await page.locator(".ap-modal .ap-map-marker").first().click();
  await schliessen(page);
  await finder(page);
  await page.locator(".ap-modal .ap-list-select").first().click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  await finder(page);
  await schliessen(page);
  assert.equal(r.portalSuchen.length, 1, "Wiederöffnen, Markerklick und Auswahl suchen nicht erneut");
  assert.deepEqual(r.portalSuchen[0], { postcode: "63808", countryCode: "DE" });
  assert.equal(r.jumingoSuchen.length, 0, "ohne JUMiNGO-Fenster keine JUMiNGO-Suche");
  assert.deepEqual([...r.fremdeHosts], [], "keine Anfrage an Adressdienst, Kartenkacheln oder Dritte");
  await page.close();
});

test("8 — dieselbe Gestaltung: Liste, Nummer, Name, Anschrift, Entfernung und Marker mit denselben Stilen wie JUMiNGO", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  const stile = () => page.evaluate(() => {
    const p = ["font-family", "font-size", "font-weight", "line-height", "color", "background-color", "border-radius",
      "padding-top", "padding-left", "width", "height"];
    const lies = (sel) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); return Object.fromEntries(p.map((k) => [k, c.getPropertyValue(k)])); };
    const ohneMasse = (o) => (o ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== "width" && k !== "height")) : null);
    return {
      item: ohneMasse(lies(".ap-modal .ap-list-item:not(.ap-list-item--chosen)")),
      num: lies(".ap-modal .ap-list-num"),
      name: ohneMasse(lies(".ap-modal .ap-list-name")),
      addr: ohneMasse(lies(".ap-modal .ap-list-addr")),
      dist: ohneMasse(lies(".ap-modal .ap-list-dist")),
      marker: lies(".ap-modal .ap-map-marker:not(.ap-map-marker--active)"),
      mapcol: ohneMasse(lies(".ap-modal .ap-modal-mapcol")),
    };
  });
  await finder(page, "Shop Orientierung");
  const jum = await stile();
  await schliessen(page);
  await finder(page, "Shop Verbindlich");
  const tg = await stile();
  for (const teil of Object.keys(jum)) assert.deepEqual(tg[teil], jum[teil], `${teil} weicht ab`);
  await page.close();
});
