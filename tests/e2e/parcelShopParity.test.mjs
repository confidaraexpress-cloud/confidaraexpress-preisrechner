// E2E: Paketshop-Finder gegen echte JUMiNGO-Daten — echter Dev-Server.
//
// Grundlage ist ein im Browser mitgeschnittener DPD-Aufruf (siehe
// tests/fixtures/accessPointsDpd.mjs). Geprüft wird genau das, was eine
// Quelltextprüfung nicht erreicht:
//
//   • Was tatsächlich an die Suche geht — insbesondere `street` (der
//     Suchmittelpunkt) und `onlyOpen` als echter Boolean.
//   • Was tatsächlich im DOM steht — Reihenfolge, Entfernungen, Status und
//     Öffnungszeiten der drei Shops aus dem Mitschnitt.
//   • Dass kein Rohwert („schließt bald“, „Status: …“) sichtbar wird und kein
//     Shop lokal verschwindet.
//   • Dass „Schließt bald“ auch auf 360 px vollständig lesbar bleibt.
//
// Die Uhr wird auf einen Freitag gestellt: nur für diesen Wochentag belegt der
// Mitschnitt Öffnungszeiten, und erfundene Zeiten kommen hier nicht vor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { DPD_RESPONSE, DPD_EXPECTED_ORDER, FREITAG } from "../fixtures/accessPointsDpd.mjs";

const PORT = 5241, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

// Ein Dropoff-Tarif eines allowlisteten Carriers (DPD) — nur dann rendert der
// Finder überhaupt. Preis-, Tarif- und Buchungslogik bleiben unberührt.
const DROPOFF_TARIFF = {
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dpd", publicCarrierName: "DPD",
  publicServiceName: "Shopabgabe", serviceType: "dropoff", netPrice: 6.9, vatAmount: 1.31,
  finalPrice: 8.21, currency: "EUR", transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  deliveryDate: "2026-08-10T00:00:00Z",
};

// Absenderadresse aus dem Mitschnitt — dieselbe, mit der JUMiNGO befragt wurde.
const ABSENDER = { zip: "73207", city: "Plochingen", street: "Weiherstraße 25" };

let server, browser;

// Sammelt die Bodies aller Suchaufrufe, damit Tests sie prüfen können.
async function setupRoutes(page, { accessPoints = DPD_RESPONSE } = {}) {
  const suchen = [];
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.includes("/api/jumingo/access-points-search")) {
      try { suchen.push(JSON.parse(req.postData() || "{}")); } catch { suchen.push(null); }
      return json(accessPoints);
    }
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", tariffs: [DROPOFF_TARIFF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dpd", name: "DPD" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return suchen;
}

// Formular ausfüllen → Angebote → Details des Dropoff-Tarifs → Finder sichtbar.
async function oeffneFinder(page) {
  await page.clock.setFixedTime(new Date(FREITAG));
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  const fill = async (ph, v) => page.getByPlaceholder(ph, { exact: true }).first().fill(String(v));
  for (const [ph, v] of [
    ["Max Mustermann", "Max Mustermann"], ["Musterstraße 1", ABSENDER.street], ["Stuttgart", ABSENDER.city],
    ["Firma AG", "Empfang AG"], ["Erika Muster", "Erika Empfaenger"], ["Beispielweg 5", "Bahnhofstrasse 9"],
  ]) await fill(ph, v);
  const abs = page.locator(".booking-addr-grid > div").nth(0).locator("input.field-input");
  await abs.nth(4).fill(ABSENDER.zip);
  const emp = page.locator(".booking-addr-grid > div").nth(1).locator("input.field-input");
  await emp.nth(4).fill("80331");
  await emp.nth(5).fill("Muenchen");
  for (const [ph, v] of [["1", "2"], ["5", "5.5"], ["30", "40"], ["20", "30"], ["15", "20"]]) await fill(ph, v);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-details-link").first().click();
  await page.waitForSelector(".ap-finder", { timeout: 20000 });
}

async function suche(page) {
  await page.locator(".ap-finder-search-btn").first().click();
  await page.waitForSelector(".ap-result", { timeout: 20000 });
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
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
  if (server) server.kill("SIGKILL");
});

test("1 — die Suche sendet die Straße mit, auch wenn der Carrier sie nicht verlangt (DPD)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const suchen = await setupRoutes(page);
  await oeffneFinder(page);

  // Die Straße kommt aus der bereits erfassten Absenderadresse — keine zweite
  // Adressquelle, kein neues Pflichtfeld.
  const strasse = page.locator('.ap-finder input[id^="ap-street"]');
  assert.equal(await strasse.count(), 1, "das Straßenfeld muss sichtbar sein");
  assert.equal(await strasse.inputValue(), ABSENDER.street, "die Straße muss vorbelegt sein");

  await suche(page);
  assert.equal(suchen.length, 1);
  const body = suchen[0];
  assert.deepEqual(body.carrierCodes, ["dpd"]);
  assert.equal(body.countryCode, "DE");
  assert.equal(body.postCode, ABSENDER.zip);
  assert.equal(body.city, ABSENDER.city);
  assert.equal(body.street, ABSENDER.street, "ohne street sucht JUMiNGO um den PLZ-Mittelpunkt");
  assert.equal(body.radius, 10);
  assert.equal(body.onlyOpen, false);
  assert.strictEqual(typeof body.onlyOpen, "boolean", "onlyOpen muss ein echter Boolean sein");
  await page.close();
});

test("2 — ohne Straße läuft die Suche weiter (leeres Feld, kein Zwang, kein erfundener Wert)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const suchen = await setupRoutes(page);
  await oeffneFinder(page);
  await page.locator('.ap-finder input[id^="ap-street"]').fill("");
  const btn = page.locator(".ap-finder-search-btn").first();
  assert.ok(await btn.isEnabled(), "ohne Straße muss die Suche bei DPD weiterhin möglich sein");
  await suche(page);
  assert.equal(suchen[0].street, "", "leer heißt leer — es wird nichts hinzuerfunden");
  assert.equal((await page.locator(".ap-result").count()) > 0, true);
  await page.close();
});

test("3 — onlyOpen wird exakt so gesendet, wie die Checkbox steht", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const suchen = await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);
  assert.equal(suchen[0].onlyOpen, false);

  await page.locator(".ap-finder-check input[type=checkbox]").check();
  await page.locator(".ap-finder-search-btn").first().click();
  await page.waitForFunction((n) => document.querySelectorAll(".ap-result").length > 0 && n, 1, { timeout: 20000 });
  await page.waitForTimeout(200);
  assert.equal(suchen.length, 2);
  assert.equal(suchen[1].onlyOpen, true);
  assert.strictEqual(typeof suchen[1].onlyOpen, "boolean");

  // Die Filterung selbst bleibt bei JUMiNGO: das Frontend entfernt nichts, auch
  // nicht „schließt bald“. Die Antwort ist unverändert → alle drei bleiben da.
  assert.equal(await page.locator(".ap-result").count(), 3, "kein lokaler Filter");
  await page.close();
});

test("4 — die drei echten Shops stehen aufsteigend nach Entfernung im DOM", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  const namen = await page.locator(".ap-result-name").allInnerTexts();
  assert.deepEqual(namen, DPD_EXPECTED_ORDER, "JUMiNGO liefert unsortiert — die Liste muss sortieren");

  const dist = await page.locator(".ap-result-dist").allInnerTexts();
  assert.deepEqual(dist, ["2,6 km", "3,0 km", "3,5 km"]);
  await page.close();
});

test("5 — Status und Öffnungszeiten stehen sichtbar an jedem Shop", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  const status = await page.locator(".ap-result-status").allInnerTexts();
  assert.deepEqual(status, ["Geöffnet", "Schließt bald", "Schließt bald"]);

  const rollen = await page.locator(".ap-result-status").evaluateAll((els) => els.map((e) => e.className));
  assert.ok(rollen[0].includes("badge--success"), "Geöffnet → Success");
  assert.ok(rollen[1].includes("badge--warning"), "Schließt bald → Warning");
  assert.ok(rollen[2].includes("badge--warning"));
  for (const k of rollen) assert.ok(/(^|\s)badge(\s|$)/.test(k), "Statusbadge trägt die Basisklasse (Punkt)");

  const zeiten = await page.locator(".ap-result-hours").allInnerTexts();
  assert.deepEqual(zeiten.map((z) => z.trim()), [
    "Heute: 00:01–23:59", "Heute: 08:30–19:30", "Heute: 10:00–19:30",
  ]);
  await page.close();
});

test("6 — kein Rohwert und kein Objekt erreichen die Oberfläche", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Ein unbekannter Serverwert und eine unlesbare Zeitangabe zusätzlich zu den
  // echten Daten — beides darf sichtbar nichts kaputt machen.
  const mitUnbekannt = {
    accessPoints: [
      ...DPD_RESPONSE.accessPoints,
      {
        name: "Testshop Unbekannt", street: "Teststr. 1", postCode: "73207", city: "Plochingen",
        countryCode: "DE", distance: 8.1, distanceCode: "km", workState: "temporarily_unavailable",
        hoursOfOperation: [{ dayName: "Freitag", workingHours: { unerwartet: true }, workingDay: true }],
      },
    ],
  };
  await setupRoutes(page, { accessPoints: mitUnbekannt });
  await oeffneFinder(page);
  await suche(page);

  const text = await page.locator(".ap-finder").innerText();
  assert.ok(!text.includes("temporarily_unavailable"), "der Rohwert darf nicht sichtbar sein");
  assert.ok(!text.includes("[object Object]"), "kein durchgereichtes Objekt");
  assert.ok(!text.includes("Status:"), "kein Status-Präfix mit Rohtext mehr");
  assert.ok(text.includes("Öffnungsstatus nicht verfügbar"), "stattdessen ein verständlicher Hinweis");

  // Der Rohwert bleibt für den Support im title — sichtbar wird er nicht.
  const titel = await page.locator('.ap-result-status[title]').first().getAttribute("title");
  assert.match(titel, /temporarily_unavailable/);

  // Und der vierte Shop ist trotzdem da (nichts wird weggefiltert).
  assert.equal(await page.locator(".ap-result").count(), 4);
  await page.close();
});

test("7 — die Liste sagt, wie viel von wie viel sie zeigt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Acht Shops → die kompakte Ansicht zeigt fünf davon.
  const viele = {
    accessPoints: [
      ...DPD_RESPONSE.accessPoints,
      ...Array.from({ length: 5 }, (_, i) => ({
        name: `Weiterer Shop ${i + 1}`, street: `Teststr. ${i + 1}`, postCode: "73207", city: "Plochingen",
        countryCode: "DE", distance: 5 + i, distanceCode: "km", workState: "Geöffnet",
        hoursOfOperation: [{ dayName: "Freitag", workingHours: "09:00-18:00", workingDay: true }],
      })),
    ],
  };
  await setupRoutes(page, { accessPoints: viele });
  await oeffneFinder(page);
  await suche(page);

  assert.equal(await page.locator(".ap-result").count(), 5);
  assert.equal((await page.locator(".ap-result-count").innerText()).trim(), "5 von 8 Paketshops");
  const mehr = page.locator(".ap-more-btn");
  assert.equal((await mehr.innerText()).trim(), "Weitere 3 Paketshops anzeigen");

  await mehr.click();
  assert.equal(await page.locator(".ap-result").count(), 8);
  assert.equal((await page.locator(".ap-result-count").innerText()).trim(), "8 Paketshops");
  assert.equal((await mehr.innerText()).trim(), "Weniger anzeigen");
  await page.close();
});

test("8 — kein horizontaler Überlauf und lesbare Status auf allen Zielbreiten", async () => {
  for (const breite of [1440, 1024, 768, 430, 390, 360]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 900 } });
    await setupRoutes(page);
    await oeffneFinder(page);
    await suche(page);

    assert.ok(await noHorizontalOverflow(page), `horizontaler Überlauf bei ${breite}px`);

    // „Schließt bald“ muss vollständig lesbar sein — nicht abgeschnitten, nicht
    // mit Ellipse, und innerhalb der Kartenbreite.
    const badge = page.locator(".ap-result-status").nth(1);
    assert.equal((await badge.innerText()).trim(), "Schließt bald", `Statustext bei ${breite}px`);
    const mass = await badge.evaluate((el) => {
      const karte = el.closest(".ap-result").getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return {
        clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
        drin: b.left >= karte.left - 1 && b.right <= karte.right + 1,
        ellipsis: getComputedStyle(el).textOverflow,
        hoehe: b.height,
      };
    });
    assert.ok(!mass.clipped, `Statustext ist bei ${breite}px abgeschnitten`);
    assert.ok(mass.drin, `Statusbadge ragt bei ${breite}px aus der Karte`);
    assert.notEqual(mass.ellipsis, "ellipsis", `Statustext wird bei ${breite}px gekürzt`);
    assert.ok(mass.hoehe >= 20, `Statusbadge zu flach bei ${breite}px`);
    await page.close();
  }
});
