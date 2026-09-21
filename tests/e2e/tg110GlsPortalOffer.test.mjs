// E2E: TG110 GLS Pick&Ship (Portal-Buchungsadapter) — das GLS-110-Angebot im GEMEINSAMEN Angebotsfluss.
// Echter Dev-Server, echter Browser, gemocktes Backend. Kein echtes Backend, keine Bestellung, kein Anbieter.
//
// GLS-110 ist eine FAHRERABHOLUNG (serviceType "pickup"), Carrier GLS, DE→DE, ohne Paketshop und ohne
// Adressartfrage (Backend priceInputs fixed_false → requiredPriceInputs leer, bookable:true). Es gibt bewusst
// KEINE eigene Oberflaeche: dasselbe Angebotsformat wie UPS 22/23/26, andere Serverwerte. Gemessen wird, dass der
// gemeinsame Flow genau das zeigt:
//   • die Karte erscheint als vollwertiges, buchbares Angebot (nicht gesperrt)
//   • Carrier „GLS" + Servicename „Pick&Ship", Uebergabe „Abholung an Ihrer Adresse"
//   • KEIN Paketshop-Finder (der ist Abgabe/dropoff vorbehalten)
//   • White Label: nirgends „Transglobal", keine ServiceID/QuoteID
// Alle Betraege sind Fixturewerte des gemockten Servers (Portalnachweis: netto 15,44 / brutto 18,37).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_ABSENDER, STANDARD_EMPFAENGER, berechneAngebote } from "./helpers/newShipmentForm.mjs";

const PORT = 5417, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 5110;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}
const kurzWarten = (ms) => new Promise((r) => setTimeout(r, ms));

// Ein kuenftiger Montag als Abholtag (nur zum Bauen der Fixture — die Oberflaeche rechnet nichts).
const HEUTE = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const utc = (t) => { const [j, m, d] = t.split("-").map(Number); return new Date(Date.UTC(j, m - 1, d)); };
const plus = (t, n) => { const d = utc(t); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let MONTAG = plus(HEUTE, 3); while (utc(MONTAG).getUTCDay() !== 1) MONTAG = plus(MONTAG, 1);

const USER = { id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann", role: "customer", status: "approved", country: "DE", zip: "63741", customer_number: "CE-K-10926" };
const ABSENDER = { ...STANDARD_ABSENDER, zip: "63741", city: "Aschaffenburg" };
const EMPFAENGER = { ...STANDARD_EMPFAENGER, zip: "10115", city: "Berlin" };
const EIN_PAKET = { packageCount: "1", weight: "2", length: "30", width: "20", height: "15" };

// Das GLS-110-Angebot, genau wie das Backend (publicOffer) es liefert: nur oeffentliche Felder, kein Provider.
const GLS110 = {
  offerId: "110mo000000000000000000000000110", publicCarrierId: "gls", publicCarrierName: "GLS", publicServiceName: "Pick&Ship",
  serviceType: "pickup", collectionDate: MONTAG, collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null, deliveryProjection: null,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage", currency: "EUR",
  netPrice: 15.44, vatAmount: 2.93, finalPrice: 18.37,
  bookable: true, priceCompleteness: "complete", requiredPriceInputs: [],
  labelFormats: ["PDF"], labelSizes: ["A4"], labelFormatOptions: [], insuranceAvailable: false, insuranceDetails: null,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
  chargeableWeight: 2, trackingAvailable: true, printerRequired: true, tariffLimits: [],
};

let server, browser;

async function setup(page) {
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
      return json({
        ceShipmentId: CE_ID, tariffs: [GLS110], availableShippingModes: ["standard"],
        publicCarriers: [{ id: "gls", name: "GLS" }], customsRequired: false,
        fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);

async function zuDenAngeboten(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { absender: ABSENDER, empfaenger: EMPFAENGER, paket: EIN_PAKET,
    sendungsangaben: { declaredContent: "Ersatzteile", declaredGoodsValue: "500" } });
  await berechneAngebote(page);
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore", detached: true });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await kurzWarten(250);
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("GLS-110: buchbare Fahrerabholung mit GLS-Carrier, ohne Paketshop, White Label", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await setup(page);
  await zuDenAngeboten(page);

  const karte = karteVon(page, GLS110);
  await karte.waitFor({ timeout: 20000 });
  const kartentext = norm(await karte.textContent());

  // Buchbar (nicht gesperrt) — vollwertiges Angebot, kein „Vorlaeufiger Preis"/Adressfrage.
  assert.doesNotMatch(await karte.getAttribute("class"), /offer-card--unavailable/, "GLS-110 wird als gesperrt dargestellt");

  // Carrier GLS + Servicename + Fahrerabholung.
  assert.match(kartentext, /GLS/, "Carriername GLS fehlt");
  assert.match(kartentext, /Pick&Ship|Pick&amp;Ship|Pick&Ship/, "Servicename Pick&Ship fehlt");
  assert.match(kartentext, /Abholung an Ihrer Adresse/, "Uebergabeart Abholung fehlt");
  // Preis sichtbar (netto 15,44 oder brutto 18,37 — die Oberflaeche rechnet nichts).
  assert.match(kartentext, /15,44|18,37/, "Preis fehlt");

  // KEIN Paketshop-Finder bei Abholung (ps-trigger ist der Abgabe vorbehalten).
  assert.equal(await karte.locator(".ps-trigger").count(), 0, "GLS-110 (Abholung) zeigt faelschlich einen Paketshop-Finder");

  // White Label: kein Einkaufsprovider, keine ServiceID/QuoteID irgendwo auf der Seite.
  const seite = norm(await page.evaluate(() => document.body.innerText));
  assert.doesNotMatch(seite, /transglobal/i, "Providername im sichtbaren Text");
  assert.doesNotMatch(seite, /\bQT-\d|quoteId|serviceId|\b110\b/i, "ServiceID/QuoteID im sichtbaren Text");

  assert.deepEqual(fehler, [], `Seitenfehler: ${fehler.join("; ")}`);
  await page.close();
});
