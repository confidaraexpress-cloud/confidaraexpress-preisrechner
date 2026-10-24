// E2E: Der gemeinsame Paketshop-Finder im Profil „Verbindliche Auswahl" (TG124) — echter Dev-Server.
//
// Grundlage ist die echte TG124-Antwort zu 63808 (genau ein freigegebener Staging-Suchlauf am 2026-10-24,
// durch den Backend-Parser: tests/fixtures/tg124ParcelShops63808.mjs). Die Portalsuche liefert Kennungen,
// Anschrift und Entfernung — keine Koordinaten, keine Öffnungszeiten, keinen Status. Geprüft wird, was der
// Kunde davon sieht und bedienen kann: nur wirksame Eingaben, der Pflichthinweis, keine leere Karte, die
// Entfernung in km, eine eindeutige und zugängliche Auswahl, die Auswahl bis in den /book-Payload, eine
// Wartefrist über 30 s, verständliche Fehler, der Wechsel zur JUMiNGO-Orientierung und vorbereitete Positionen.
//
// NIEMALS eine echte Bestellung: `/book` ist abgefangen. Kein Provider, kein Netz außer dem Dev-Server.
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

const PORT = 5249, BASE = `http://127.0.0.1:${PORT}`;

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
// Die serverseitige Portalsuche ist ein Vertragsfeld des Angebots — keine ServiceID im Frontend.
const TG124_TARIF = { ...BASIS_TARIF, id: 2, shipper_tariff_id: 2, offerId: "OF-TG124", publicServiceName: "Shop Verbindlich",
  netPrice: 4.47, vatAmount: 0.85, finalPrice: 5.32, parcelShopSearch: "server" };
const JUMINGO_TARIF = { ...BASIS_TARIF, id: 1, shipper_tariff_id: 1, offerId: "OF-JUM-DPD", publicServiceName: "Shop Orientierung",
  netPrice: 6.9, vatAmount: 1.31, finalPrice: 8.21 };

const ABSENDER = { zip: "63808", city: "Haibach", street: "Würzburger Straße 229" };
const BINDUNG = "Für diesen Versand müssen Sie vor der Buchung einen Paketshop auswählen.";
const ORIENTIERUNG = /verbindliche Auswahl eines Shops ist nicht erforderlich/;

let server, browser;

async function setupRoutes(page, { shops = TG124_SHOPS_63808, status = 200, verzoegerung = 0, mitJumingo = true } = {}) {
  const portalSuchen = [];
  const jumingoSuchen = [];
  const buchungen = [];
  await page.addInitScript(MAP_TEST_ENGINE_SCRIPT);
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/api/dropoff/parcelshops")) {
      portalSuchen.push(Object.fromEntries(url.searchParams));
      const warte = typeof verzoegerung === "function" ? verzoegerung(portalSuchen.length) : verzoegerung;
      if (warte) await new Promise((r) => setTimeout(r, warte));
      const st = typeof status === "function" ? status(portalSuchen.length) : status;
      if (st !== 200) return json({ error: "Fehler" }, st);
      return json({ shops: typeof shops === "function" ? shops(portalSuchen.length) : shops });
    }
    if (p.includes("/api/jumingo/access-points-search")) {
      let body = null;
      try { body = JSON.parse(req.postData() || "{}"); } catch { body = null; }
      jumingoSuchen.push(body);
      return json(DPD_RESPONSE);
    }
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
      ceShipmentId: 4711, tariffs: mitJumingo ? [TG124_TARIF, JUMINGO_TARIF] : [TG124_TARIF],
      availableShippingModes: ["standard"], publicCarriers: [{ id: "dpd", name: "DPD" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return { portalSuchen, jumingoSuchen, buchungen };
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
async function finder(page, dienst = "Shop Verbindlich", { warteAufListe = true } = {}) {
  await karte(page, dienst).first().locator(".ps-trigger").click();
  await page.waitForSelector(".ap-modal", { timeout: 10000 });
  if (warteAufListe) await page.waitForSelector(".ap-modal .ap-list-item", { timeout: 20000 });
}
const schliessen = async (page) => {
  await page.locator(".ap-modal-close").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
};
const namen = (page) => page.locator(".ap-modal .ap-list-name").allInnerTexts();
const keinUeberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

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

test("1 — TG124 öffnet das Profil „Verbindliche Auswahl“: nur die PLZ, der Pflichthinweis, eine Suche nur mit PLZ und Land", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const { portalSuchen } = await setupRoutes(page);
  await zuDenAngeboten(page);
  await finder(page);
  const fenster = page.locator(".ap-modal");
  assert.equal(await fenster.locator("#apm-zip").inputValue(), "63808");
  for (const feld of ["#apm-city", "#apm-street", "#apm-radius", "#apm-opening"]) {
    assert.equal(await fenster.locator(feld).count(), 0, `${feld} wäre ein Scheinfeld`);
  }
  const hinweis = await fenster.locator(".ap-modal-note").innerText();
  assert.equal(hinweis.trim(), BINDUNG);
  assert.doesNotMatch(await fenster.innerText(), ORIENTIERUNG, "die Orientierungsaussage erscheint bei TG124 nie");
  assert.match(await fenster.locator(".ap-modal-context-line").innerText(), /Paketshops zur PLZ 63808 · Entfernung jeweils zum Gebiet der PLZ/);
  assert.doesNotMatch(await fenster.locator(".ap-modal-context-line").innerText(), /Umkreis/);
  assert.deepEqual(portalSuchen, [{ postcode: "63808", countryCode: "DE" }]);
  await page.close();
});

test("2 — zehn Shops mit echten Zeichen und Entfernung in km, ohne Status- und Zeitenplatzhalter", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  await finder(page);
  assert.deepEqual((await namen(page)).slice(0, 4), ["Lotto Shop Lange", "Myflexbox - DPD Pickup Paketstation", "Landhotel Klingerhof GmbH", "Rosis-toys"]);
  const adressen = await page.locator(".ap-modal .ap-list-addr").allInnerTexts();
  assert.equal(adressen[0], "Würzburger Str. 116, 63808 Haibach");
  assert.equal(adressen[2], "Am Hügel 7, 63768 Hösbach");
  assert.deepEqual(await page.locator(".ap-modal .ap-list-dist").allInnerTexts(),
    ["0,1 km", "1,9 km", "2,1 km", "3,3 km", "3,6 km", "3,9 km", "3,9 km", "4,0 km", "4,3 km", "4,4 km"]);
  assert.equal(await page.locator(".ap-modal .ap-list-status").count(), 0, "kein „Öffnungsstatus nicht verfügbar“");
  assert.equal(await page.locator(".ap-modal .ap-list-toggle").count(), 0, "kein Ausklapper ohne Öffnungszeiten");
  assert.ok(!(await page.locator(".ap-modal").innerHTML()).includes("&amp;#"), "keine Zeichenreferenz im Fenster");
  assert.match(await page.locator(".ap-modal-count").innerText(), /10 Paketshops/);
  await page.close();
});

test("3 — ohne Kartenposition keine Karte: die Liste nimmt die Fläche ein (Desktop als Raster)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  await finder(page);
  assert.equal(await page.locator(".ap-modal .ap-map").count(), 0, "keine leere Deutschlandkarte");
  assert.equal(await page.locator(".ap-modal .ap-modal-mapcol").count(), 0);
  assert.equal(await page.locator(".ap-modal .ap-modal-split--listonly").count(), 1);
  assert.equal(await page.locator(".ap-modal .ap-modal-toggle").count(), 0);
  assert.equal(await page.locator(".ap-modal .ap-modal-attr").count(), 0, "ohne Positionen keine Quellenangabe des Adressdienstes");
  const [a, b] = await Promise.all([0, 1].map((i) => page.locator(".ap-modal .ap-list-item").nth(i).boundingBox()));
  assert.ok(Math.abs(a.y - b.y) < 2 && b.x > a.x + 100, "zwei Spalten nebeneinander statt einer schmalen Liste");
  assert.equal(await keinUeberlauf(page), true);
  await page.close();
});

test("4 — Auswahl: eindeutige zugängliche Namen, Wählen schließt, „Ausgewählt“ sichtbar und unterscheidbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  await finder(page);
  const knoepfe = page.locator(".ap-modal .ap-list-select");
  assert.equal(await knoepfe.count(), 10);
  const zugaenglich = await page.evaluate(() => [...document.querySelectorAll(".ap-modal .ap-list-select")].map((b) => b.textContent.trim()));
  assert.equal(new Set(zugaenglich).size, 10, "zehn unterscheidbare Namen");
  await page.getByRole("button", { name: /^Diesen Paketshop wählen – Landhotel Klingerhof GmbH, Am Hügel 7, 63768 Hösbach$/ }).click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  // Die Karte sagt nach dem Schließen, welcher Shop gilt — sichtbar und zugänglich.
  const einstieg = karte(page, "Shop Verbindlich").first().locator(".ps-trigger");
  assert.equal(await einstieg.locator(".ps-trigger-chosen").innerText(), "Gewählt: Landhotel Klingerhof GmbH");
  assert.equal(await einstieg.locator(".ps-trigger-change").innerText(), "ändern");
  assert.match(await einstieg.getAttribute("aria-label"), /^Gewählter Paketshop für DPD Shop Verbindlich: Landhotel Klingerhof GmbH, Am Hügel 7, 63768 Hösbach – ändern$/);
  assert.equal(await karte(page, "Shop Orientierung").first().locator(".ps-trigger").innerText(), "Paketshops suchen", "die andere Karte bleibt unberührt");
  await finder(page);
  const zeilen = page.locator(".ap-modal .ap-list-item");
  assert.equal(await zeilen.nth(2).getAttribute("class"), "ap-list-item ap-list-item--chosen");
  assert.equal((await zeilen.nth(2).locator(".ap-list-select").innerText()).split("–")[0].trim(), "Ausgewählt");
  assert.equal(await zeilen.nth(2).locator(".ap-list-select").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".ap-modal .ap-list-item--chosen").count(), 1);
  assert.equal(await page.locator(".ap-modal .ap-list-select[aria-pressed=\"true\"]").count(), 1);
  // Wechsel der Auswahl
  await zeilen.nth(4).locator(".ap-list-select").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  await finder(page);
  assert.equal(await page.locator(".ap-modal .ap-list-item").nth(4).getAttribute("class"), "ap-list-item ap-list-item--chosen");
  assert.equal(await page.locator(".ap-modal .ap-list-item--chosen").count(), 1);
  await page.close();
});

test("5 — die Auswahl erreicht den /book-Payload: Kennungen, echte Zeichen, die gesuchte PLZ", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const { buchungen } = await setupRoutes(page, { mitJumingo: false });
  await zuDenAngeboten(page);
  await finder(page);
  await page.getByRole("button", { name: /^Diesen Paketshop wählen – Rosis-toys/ }).click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  await karte(page, "Shop Verbindlich").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  assert.equal(await page.locator(".dropoff-selected-name").innerText(), "Rosis-toys");
  assert.equal(await page.locator(".calc-panel .ps-trigger").innerText(), "Paketshop ändern");
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  for (let i = 0; i < 40 && buchungen.length === 0; i++) await page.waitForTimeout(100);
  assert.equal(buchungen.length, 1, "genau ein /book-Request");
  assert.deepEqual(buchungen[0].dropoffParcelShop, {
    parcelShopId: "577910", pickupLocationCode: "DE49106", name: "Rosis-toys", postcode: "63856", city: "Bessenbach",
    street: "Würzburger Str.", houseNumber: "25", town: "Straßbessenbach", countryCode: "DE", searchPostcode: "63808",
  });
  await page.close();
});

test("6 — eine Suche über 30 s endet mit der Liste, nicht mit „nicht verfügbar“; der Ladehinweis sagt die Wartezeit", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { verzoegerung: 31500 });
  await zuDenAngeboten(page);
  await finder(page, "Shop Verbindlich", { warteAufListe: false });
  await page.waitForSelector(".ap-modal-skeleton", { timeout: 5000 });
  assert.match(await page.locator(".ap-modal-count").innerText(), /werden gesucht … Die Suche kann bis zu einer Minute dauern\./);
  await page.waitForSelector(".ap-modal .ap-list-item", { timeout: 45000 });
  assert.equal(await page.locator(".ap-modal .ap-finder-error").count(), 0);
  assert.equal(await page.locator(".ap-modal .ap-list-item").count(), 10);
  await page.close();
});

test("7 — Fehler sind verständlich und werden nicht automatisch wiederholt", async () => {
  for (const [status, text] of [[429, /Zu viele Suchanfragen in kurzer Zeit/], [400, /gültige fünfstellige Postleitzahl/], [502, /momentan nicht verfügbar/]]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const { portalSuchen } = await setupRoutes(page, { status });
    await zuDenAngeboten(page);
    await finder(page, "Shop Verbindlich", { warteAufListe: false });
    await page.waitForSelector(".ap-modal .ap-finder-error", { timeout: 10000 });
    assert.match(await page.locator(".ap-modal .ap-finder-error").innerText(), text, String(status));
    await page.waitForTimeout(800);
    assert.equal(portalSuchen.length, 1, `kein Neuversuch bei ${status}`);
    await page.close();
  }
});

test("8 — PLZ ändern sucht genau einmal neu; ungültige PLZ sperrt „Suchen“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const { portalSuchen } = await setupRoutes(page);
  await zuDenAngeboten(page);
  await finder(page);
  const plz = page.locator("#apm-zip");
  await plz.fill("6373");
  assert.equal(await page.locator(".ap-modal-search-btn").isDisabled(), true);
  await plz.fill("63739");
  await page.locator(".ap-modal-search-btn").click();
  await page.waitForFunction(() => /PLZ 63739/.test(document.querySelector(".ap-modal-context-line")?.textContent || ""), null, { timeout: 10000 });
  assert.deepEqual(portalSuchen.map((q) => q.postcode), ["63808", "63739"]);
  await page.close();
});

test("9 — Wechsel zur JUMiNGO-Abgabe: Orientierung mit allen Feldern und Karte; eine späte Portalantwort schreibt nicht hinein", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Die ERSTE Portalsuche antwortet erst nach 3 s.
  const { portalSuchen, jumingoSuchen } = await setupRoutes(page, { verzoegerung: (n) => (n === 1 ? 3000 : 0) });
  await zuDenAngeboten(page);
  await finder(page, "Shop Verbindlich", { warteAufListe: false });
  await page.locator(".ap-modal-close").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  await finder(page, "Shop Orientierung");
  await page.waitForTimeout(3500); // die späte Portalantwort ist jetzt da
  assert.equal(await page.locator(".ap-modal .ap-list-select").count(), 0, "keine Portalliste im Orientierungsfenster");
  assert.equal(await page.locator(".ap-modal .ap-list-item").count(), DPD_RESPONSE.accessPoints.length);
  for (const feld of ["#apm-city", "#apm-street", "#apm-radius", "#apm-opening"]) assert.equal(await page.locator(feld).count(), 1, feld);
  assert.match(await page.locator(".ap-modal-note").innerText(), ORIENTIERUNG);
  assert.ok(await page.locator(".ap-modal .ap-map-marker").count() > 0, "JUMiNGO behält seine Marker");
  assert.match((await page.locator(".ap-modal .ap-list-dist").first().innerText()).trim(), /^\d+,\d km$/, "km statt KM");
  await schliessen(page);
  // Zurück zu TG124: das verbindliche Profil mit seiner eigenen, frischen Suche.
  await finder(page, "Shop Verbindlich");
  assert.equal(await page.locator(".ap-modal .ap-list-select").count(), 10);
  assert.equal(await page.locator("#apm-city").count(), 0);
  assert.equal(jumingoSuchen.length, 1);
  assert.equal(portalSuchen.length, 2);
  await page.close();
});

test("10 — vorbereitete, geprüfte Positionen (P3): Karte mit Markern = Listennummern, Hinweis zur Herkunft, Auswahl im Popup", async () => {
  const mitPosition = TG124_SHOPS_63808.map((s, i) => (i < 3 ? { ...s, latitude: 49.96 + i / 100, longitude: 9.2 + i / 100, positionSource: "address" } : s));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { shops: mitPosition });
  await zuDenAngeboten(page);
  await finder(page);
  assert.equal(await page.locator(".ap-modal .ap-modal-mapcol").count(), 1);
  assert.deepEqual(await page.locator(".ap-modal .ap-map-marker").allInnerTexts(), ["1", "2", "3"]);
  assert.match(await page.locator(".ap-modal-context-line").innerText(), /Kartenpositionen aus der Shopadresse ermittelt/);
  const quelle = await page.locator(".ap-modal .ap-modal-attr").innerText();
  assert.match(quelle, /OpenStreetMap/);
  assert.match(quelle, /Powered by Geoapify/);
  await page.locator(".ap-modal .ap-map-marker").nth(1).click();
  await page.getByRole("button", { name: /^Diesen Paketshop wählen – Myflexbox/ }).last().click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  await finder(page);
  assert.equal(await page.locator(".ap-modal .ap-list-item").nth(1).getAttribute("class"), "ap-list-item ap-list-item--chosen");
  await page.close();
});

test("11 — Mobil 390 und 360: kein Kartenumschalter, erster Treffer im ersten Bildschirm, Auswahl per Touch", async () => {
  for (const [w, h] of [[390, 844], [360, 640]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await setupRoutes(page);
    await zuDenAngeboten(page);
    await finder(page);
    assert.equal(await page.locator(".ap-modal .ap-modal-toggle").count(), 0, `${w}: kein Kartenumschalter`);
    const erste = await page.locator(".ap-modal .ap-list-item").first().boundingBox();
    assert.ok(erste.y < h, `${w}: erster Treffer beginnt bei ${Math.round(erste.y)} px`);
    const box = await page.locator(".ap-modal .ap-list-select").first().boundingBox();
    assert.ok(box.height >= 44, `${w}: Auswahlknopf ${Math.round(box.height)} px`);
    assert.equal(await keinUeberlauf(page), true);
    await page.locator(".ap-modal .ap-list-select").first().tap();
    await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
    await ctx.close();
  }
});

test("12 — Tastatur: Tab erreicht die Auswahl, Enter wählt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  await finder(page);
  await page.locator(".ap-modal .ap-list-select").first().focus();
  assert.match(await page.evaluate(() => document.activeElement?.textContent || ""), /Diesen Paketshop wählen\s*–\s*Lotto Shop Lange/);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  await page.close();
});
