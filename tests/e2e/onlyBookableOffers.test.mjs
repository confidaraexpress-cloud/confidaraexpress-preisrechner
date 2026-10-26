// E2E: Nur buchbare Tarife sichtbar (Betreiberentscheidung 2026-10-26) — echter Dev-Server, echter Browser,
// gemocktes Backend. Keine Buchung, kein Anbieter, kein Providercall.
//
// Der Server liefert nur noch buchbare und kundenlösbare Angebote (lib/offers/customerOfferVisibility.js im Backend);
// die Oberfläche filtert nichts selbst. Diese Suite misst, was die Oberfläche daraus macht:
//
//   B1  „Neue Sendung“ ohne buchbaren Tarif: der Leerzustand „Keine direkt buchbaren Tarife“ — 1440/768/375 px.
//   B2  Eine zu lange Adressangabe ist kundenlösbar: die Karte ist auswählbar (keine graue Karte) und nennt die Notiz;
//       die Auswahl führt zum Telefonfeld des Empfängers mit dem genauen Hinweis; das geänderte Feld startet GENAU
//       EINEN neuen Vergleich, und das danach buchbare Angebot ist gewählt.
//   B3  Angemeldeter Preisrechner (vor den Sendungsangaben): ein Preis, der erst mit Sendungsangaben buchbar wird
//       (`availableWithShipmentDetails`), ist auswählbar und führt nach „Neue Sendung“ — statt grau zu bleiben.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, angebotsCta } from "./helpers/newShipmentForm.mjs";

const PORT = 5624, BASE = `http://127.0.0.1:${PORT}`;
const CE_SHIPMENT_ID = 5910;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "70173", customer_number: "CE-K-10031",
};
const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const tarif = (id, name, netto, extra = {}) => ({
  id, shipper_tariff_id: id, offerId: `ob${String(id).padStart(30, "0")}`, productKey: `pk1_${String(id).padStart(22, "K")}`,
  publicCarrierId: "gls", publicCarrierName: "GLS", publicServiceName: name, serviceType: "pickup",
  shippingMode: "standard", transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1-2 Tage",
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-10-27", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00", deliveryDate: "2026-10-28",
  bookable: true, unavailableReason: null, requiredPriceInputs: [], availableWithShipmentDetails: true,
  netPrice: netto, vatAmount: Number((netto * 0.19).toFixed(2)), finalPrice: Number((netto * 1.19).toFixed(2)), currency: "EUR",
  ...extra,
});
const ZU_LANG = tarif(110, "Pick&Ship", 18.53, { bookable: false, unavailableReason: "address_details_too_long",
  unavailableDetail: { party: "recipient", field: "phone", max: 15 } });
const DANACH_BUCHBAR = tarif(110, "Pick&Ship", 18.53);
const NUR_MIT_ANGABEN = tarif(23, "Expressversand", 31.4, { publicCarrierId: "ups", publicCarrierName: "UPS",
  bookable: false, unavailableReason: "quote_only", priceCompleteness: "indicative" });

let server, browser;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

async function setup(page, { calc = () => ({ tariffs: [] }) } = {}) {
  const p = { calc: [] };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    const body = () => { try { return JSON.parse(req.postData() || "{}"); } catch { return {}; } };
    if (pfad.endsWith("/api/shipping/launch-scope")) return json({ countries: EU27, originCountries: ["DE"] });
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (pfad.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (pfad.includes("/api/jumingo/calculate-price")) {
      p.calc.push(body());
      const a = calc(p.calc.length);
      return json({ ceShipmentId: CE_SHIPMENT_ID + p.calc.length, tariffs: a.tariffs, availableShippingModes: ["standard", "express"],
        publicCarriers: [...new Map(a.tariffs.map((t) => [t.publicCarrierId, { id: t.publicCarrierId, name: t.publicCarrierName }])).values()],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

async function neueSeite(viewport = { width: 1440, height: 1100 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function vergleicheNeueSendung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section #ns-weight", { timeout: 20000 });
  await fuelleVersandformular(page);
  await angebotsCta(page).click();
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
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

test("B1 — „Neue Sendung“ ohne buchbaren Tarif: der Leerzustand nennt es so — 1440/768/375 px, ohne Querscrollen", async () => {
  for (const width of [1440, 768, 375]) {
    const { page, fehler } = await neueSeite({ width, height: 1000 });
    await setup(page);
    await vergleicheNeueSendung(page);
    await page.waitForSelector(".offers-empty", { timeout: 20000 });
    assert.equal(norm(await page.locator(".offers-empty-title").textContent()), "Keine direkt buchbaren Tarife", String(width));
    assert.match(norm(await page.locator(".offers-empty-sub").first().textContent()),
      /^Für diese Sendung ist derzeit kein Tarif direkt buchbar\. Ändern Sie das Datum oder wählen Sie „Alle Dienstleistungen"\./);
    assert.equal(await page.locator(".offer-card").count(), 0);
    const quer = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(quer <= 0, `${width}: ${quer} px Querscrollen`);
    assert.deepEqual(fehler, []);
    await page.close();
  }
});

test("B2 — zu lange Adressangabe: auswählbar, Feldführung mit genauem Hinweis, genau ein neuer Vergleich, danach gewählt", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { calc: (n) => ({ tariffs: [n === 1 ? ZU_LANG : DANACH_BUCHBAR] }) });
  await vergleicheNeueSendung(page);
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  const karte = page.locator(".offer-card").first();
  assert.equal(await karte.evaluate((el) => el.classList.contains("offer-card--unavailable")), false, "graue Karte");
  const knopf = karte.locator(".offer-cta-btn");
  assert.equal(await knopf.isEnabled(), true);
  assert.equal(norm(await knopf.textContent()), "Angebot auswählen");
  assert.equal(norm(await karte.locator(".offer-correction-note").textContent()), "Nur mit gekürzter Adressangabe buchbar.");
  await knopf.click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "ns-r-phone", null, { timeout: 5000 });
  const fehlerText = norm(await page.locator(".field-error").filter({ hasText: "Telefonnummer" }).first().textContent());
  assert.equal(fehlerText,
    "Die Telefonnummer des Empfängers ist für dieses Angebot zu lang (höchstens 15 Zeichen). Bitte kürzen Sie sie, etwa ohne Durchwahl oder Landesvorwahl.");
  assert.equal(p.calc.length, 1, "die Auswahl allein vergleicht nicht neu");
  // Feld verlassen OHNE Änderung: kein neuer Vergleich.
  await page.locator("#ns-r-phone").blur();
  await kurz(400);
  assert.equal(p.calc.length, 1, "ohne Änderung kein neuer Vergleich");
  // Kürzen und verlassen: genau EIN neuer Vergleich; danach ist dasselbe Produkt gewählt und buchbar.
  await page.fill("#ns-r-phone", "+4989123456");
  await page.locator("#ns-r-phone").blur();
  await page.waitForFunction(() => document.querySelector(".offer-card--selected"), null, { timeout: 20000 });
  assert.equal(p.calc.length, 2, "genau ein neuer Vergleich");
  assert.equal(await page.locator(".offer-correction-note").count(), 0, "die Notiz ist nach der Korrektur weg");
  await page.locator("#ns-s-city").focus();
  await page.locator("#ns-s-city").blur();
  await kurz(400);
  assert.equal(p.calc.length, 2, "ein anderes Feld startet keinen weiteren Vergleich");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B3 — Preisrechner: ein Preis, der mit Sendungsangaben buchbar wird, ist auswählbar und führt nach „Neue Sendung“", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { calc: () => ({ tariffs: [NUR_MIT_ANGABEN] }) });
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  for (const [id, v] of [["calc-from-zip", "70173"], ["calc-from-city", "Stuttgart"], ["calc-to-zip", "10115"], ["calc-to-city", "Berlin"],
    ["calc-packageCount", "1"], ["calc-weight", "5"], ["calc-length", "30"], ["calc-width", "20"], ["calc-height", "15"]]) await page.fill(`#${id}`, v);
  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  const karte = page.locator(".offer-card").first();
  assert.equal(await karte.evaluate((el) => el.classList.contains("offer-card--unavailable")), false, "graue Karte im Preisrechner");
  const knopf = karte.locator(".offer-cta-btn");
  assert.equal(await knopf.isEnabled(), true);
  assert.equal(norm(await knopf.textContent()), "Angebot auswählen");
  await knopf.click();
  await page.waitForURL(/\/dashboard\?page=new/, { timeout: 20000 });
  await page.waitForSelector(".offers-form-section #ns-weight", { timeout: 20000 });
  assert.equal(await page.locator("#ns-r-zip").inputValue(), "10115", "die Übergabe trägt die Route");
  assert.equal(p.calc.length, 1, "der Preisrechner bucht nicht und vergleicht nicht erneut von selbst");
  assert.deepEqual(fehler, []);
  await page.close();
});
