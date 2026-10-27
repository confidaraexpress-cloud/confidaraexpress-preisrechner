// E2E: Responsiver Rahmen (Gesamtauftrag D, Betreiberentscheidung 2026-10-24, Canonical v2.73).
// Echter Dev-Server, echter Browser, gemocktes Backend — keine Bestellung, kein Anbieter.
//
//   R1  Rahmenstufen: Kunden 1200 / 1440 / 1680, Admin 1440 / 1680 / 1920 — Kopf und Inhalt auf einer Kante
//   R2  Angebotssektion: im Grundrahmen 1080 px, ab 1680 px 1280 px, zentriert
//   R3  Buchung: unter 1440 px eine Spalte (unverändert), ab 1440 px Seitenspalte neben der Arbeitsspalte
//       (Premium-Redesign 2026-10-27: 1440–1599 px schmal mit 296 px, ab 1600 px 368 px), Titel auf der Kante,
//       Seitenspalte läuft beim Scrollen mit
//   R4  Lesemaß: die vier vormals überlangen Textstellen höchstens 90 Zeichen je Zeile
//   R5  Bedienziel „Vergessen?" mindestens 24 px hoch
//   R6  Kein waagerechter Überlauf in zehn Breiten (Übersicht, Angebote, Buchung)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_PAKET } from "./helpers/newShipmentForm.mjs";

const PORT = 5577, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const KUNDE = { id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann", role: "customer",
  status: "approved", country: "DE", zip: "70173", customer_number: "CE-K-10998" };
const ADMIN = { id: 2, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress", name: "Anna Admin", role: "admin",
  status: "approved", country: "DE" };
const kennung = (kopf, fuss) => `${kopf}${fuss.padStart(32 - kopf.length, "0")}`;
const TARIF = { id: 3309, shipper_tariff_id: 3309, offerId: kennung("rft", "3309"), publicCarrierId: "ups", publicCarrierName: "UPS",
  publicServiceName: "Standard", serviceType: "pickup", shippingMode: "standard", transitDaysMin: 1, transitDaysMax: 2,
  deliveryTime: "1-2 Tage", trackingAvailable: true, printerRequired: false, requiredPriceInputs: [], priceCompleteness: "complete",
  bookable: true, unavailableReason: null, recipientRequirement: null, senderRequirement: null,
  netPrice: 14, vatAmount: 2.66, finalPrice: 16.66, currency: "EUR" };
const ADMIN_ZEILE = { id: 701, user_id: 10, status: "booked", selected_carrier: "dhl-express", service_type: "pickup",
  from_country: "DE", to_country: "AT", price_final: 123.67, package_count: 3, created_at: "2026-08-09T10:00:00Z",
  customer_company: "Muster GmbH", customer_number: "CE-K-10001", business_order_number: "CE-BS26-00041",
  order_confirmation_number: "CE-AB26-00041", has_tracking: true, label_available: true };

let server, browser;

async function neueSeite({ width, height = 900, rolle = "kunde" }) {
  const page = await browser.newPage({ viewport: { width, height } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: rolle === "admin" ? ADMIN : KUNDE });
    if (p.endsWith("/api/shipping/launch-scope")) return json({ countries: ["DE", "AT", "FR"], originCountries: ["DE"] });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/admin/shipments")) return json({ shipments: [ADMIN_ZEILE], pagination: { limit: 25, offset: 0, count: 1, total: 1 }, deletableDraftTotal: 0 });
    if (p.includes("/api/jumingo/calculate-price")) return json({ ceShipmentId: 4711, customsRequired: false, exportDeclaration: null,
      tariffs: [TARIF], availableShippingModes: ["standard"], publicCarriers: [{ id: "ups", name: "UPS" }], fromCountryCode: "DE", toCountryCode: "DE" });
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], notifications: [], unreadCount: 0,
      summary: null, pagination: { total: 0 }, nextCursor: null });
  });
  if (rolle) await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return { page, fehler };
}

const rahmen = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s); if (!el) return null;
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  return { links: Math.round(r.left), breite: Math.round(r.width),
    innen: Math.round(r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) };
}, sel);
const ueberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const zeichenJeZeile = (page, sel) => page.evaluate((s) => {
  let max = 0;
  for (const el of document.querySelectorAll(s)) {
    if (!el.getBoundingClientRect().width) continue;
    const range = document.createRange(); range.selectNodeContents(el);
    const zeilen = new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size || 1;
    max = Math.max(max, Math.round((el.textContent || "").replace(/\s+/g, " ").trim().length / zeilen));
  }
  return max;
}, sel);

async function zurBuchung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { paket: { ...STANDARD_PAKET, packageCount: "1" } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("R1 — Rahmenstufen: Kunden 1200/1440/1680, Admin 1440/1680/1920 — Kopf und Inhalt auf einer Kante", async () => {
  for (const [w, kunde, admin] of [[1440, 1200, 1440], [1920, 1440, 1680], [2560, 1680, 1920]]) {
    const k = await neueSeite({ width: w });
    await k.page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await k.page.waitForSelector(".page-body", { timeout: 20000 });
    const inhalt = await rahmen(k.page, ".page-body"), kopf = await rahmen(k.page, ".ce-page-header");
    const verfuegbar = w - 248 - 64;
    assert.equal(inhalt.innen, Math.min(kunde, verfuegbar), `${w}: Kundenrahmen`);
    assert.equal(kopf.links, inhalt.links, `${w}: Kopf und Inhalt auf verschiedenen Kanten`);
    assert.deepEqual(k.fehler, []);
    await k.page.close();
    const a = await neueSeite({ width: w, rolle: "admin" });
    await a.page.goto(`${BASE}/admin/shipments`, { waitUntil: "domcontentloaded" });
    await a.page.waitForSelector("main h1, main .adm-page-title, main", { timeout: 20000 });
    await a.page.waitForTimeout(400);
    const breiteste = await a.page.evaluate(() => Math.max(...[...document.querySelectorAll("main *")]
      .filter((el) => getComputedStyle(el).maxWidth.endsWith("px"))
      .map((el) => Math.round(el.getBoundingClientRect().width))));
    assert.ok(breiteste <= admin + 64 + 1, `${w}: Adminrahmen breiter als ${admin} px (${breiteste})`);
    assert.ok(breiteste >= Math.min(admin, w - 248 - 64) - 1, `${w}: Adminrahmen schmaler als erwartet (${breiteste})`);
    await a.page.close();
  }
});

test("R2 — Angebotssektion: im Grundrahmen 1080 px, ab 1680 px 1280 px, zentriert", async () => {
  for (const [w, soll] of [[1600, 1080], [1920, 1280], [2560, 1280]]) {
    const { page, fehler } = await neueSeite({ width: w });
    await zurBuchung(page);
    const s = await rahmen(page, ".offers-section"), h = await rahmen(page, ".page-body");
    assert.equal(s.breite, soll, `${w}: Sektionsbreite`);
    const links = s.links - h.links, rechts = (h.links + h.breite) - (s.links + s.breite);
    assert.ok(Math.abs(links - rechts) <= 1, `${w}: nicht zentriert (${links} vs ${rechts})`);
    assert.deepEqual(fehler, []);
    await page.close();
  }
});

test("R3 — Buchung: unter 1440 px eine Spalte, ab 1440 px Seitenspalte neben der Arbeitsspalte, die beim Scrollen mitläuft", async () => {
  for (const w of [1366, 1440, 1600, 1920]) {
    const { page, fehler } = await neueSeite({ width: w, height: 800 });
    await zurBuchung(page);
    await page.locator("button.offer-cta-btn").first().click();
    await page.waitForSelector(".booking-side", { timeout: 20000 });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { seite: r(".booking-side-inner"), schritte: r(".steps-bar"), modul: r(".booking-wrap > div:not(.booking-side):not(.steps-bar)"),
        titel: r(".ce-page-header--booking .ce-page-header-main"), position: getComputedStyle(document.querySelector(".booking-side")).position };
    });
    if (w < 1440) {
      assert.equal(m.position, "static", `${w}: unter 1440 px keine Seitenspalte`);
      assert.ok(m.seite.top < m.modul.top, `${w}: die Zusammenfassung steht nicht über den Modulen`);
    } else {
      assert.equal(m.position, "absolute", `${w}: keine Seitenspalte`);
      assert.equal(Math.round(m.seite.left), Math.round(m.schritte.left + 800 + 32), `${w}: Seitenspalte nicht neben der Arbeitsspalte`);
      assert.equal(Math.round(m.seite.width), w < 1600 ? 296 : 368, `${w}: Breite der Seitenspalte`);
      assert.equal(Math.round(m.titel.left), Math.round(m.schritte.left), `${w}: Titel nicht auf der Kante der Arbeitsspalte`);
      const vorher = Math.round(m.seite.top);
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForTimeout(300);
      const nachher = await page.evaluate(() => Math.round(document.querySelector(".booking-side-inner").getBoundingClientRect().top));
      assert.ok(nachher >= 0 && nachher < vorher, `${w}: die Seitenspalte läuft nicht mit (${vorher} → ${nachher})`);
    }
    assert.equal(await ueberlauf(page), 0, `${w}: waagerechter Überlauf`);
    assert.deepEqual(fehler, []);
    await page.close();
  }
});

test("R4 — Lesemaß: die vier vormals überlangen Textstellen höchstens 90 Zeichen je Zeile", async () => {
  const faelle = [
    ["/login", null, ".auth-sub-2", 1440],
    ["/dashboard?page=profile", "kunde", ".pwa-card-text", 1920],
    ["/admin", "admin", ".adm-todo-line", 1920],
    ["/admin/shipments", "admin", ".adm-support-hint", 1920],
  ];
  for (const [url, rolle, sel, w] of faelle) {
    const { page } = await neueSeite({ width: w, rolle });
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(sel, { timeout: 20000 });
    await page.waitForTimeout(300);
    const n = await zeichenJeZeile(page, sel);
    assert.ok(n > 0 && n <= 90, `${sel} @${w}: ${n} Zeichen je Zeile`);
    await page.close();
  }
});

test("R5 — Bedienziel „Vergessen?“ mindestens 24 px hoch", async () => {
  const { page } = await neueSeite({ width: 390, height: 844, rolle: null });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const knopf = page.locator(".auth-field-link", { hasText: "Vergessen?" });
  await knopf.waitFor({ timeout: 20000 });
  const box = await knopf.boundingBox();
  assert.ok(box.height >= 24, `Trefferhöhe ${box.height}px`);
  await page.close();
});

test("R6 — kein waagerechter Überlauf in zehn Breiten (Übersicht, Angebote, Buchung)", async () => {
  for (const w of [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920, 2560]) {
    const { page, fehler } = await neueSeite({ width: w, height: 900 });
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".page-body", { timeout: 20000 });
    assert.equal(await ueberlauf(page), 0, `Übersicht @${w}`);
    await zurBuchung(page);
    assert.equal(await ueberlauf(page), 0, `Angebote @${w}`);
    await page.locator("button.offer-cta-btn").first().click();
    await page.waitForSelector(".booking-wrap", { timeout: 20000 });
    await page.waitForTimeout(200);
    assert.equal(await ueberlauf(page), 0, `Buchung @${w}`);
    assert.deepEqual(fehler, [], `Skriptfehler @${w}`);
    await page.close();
  }
});
