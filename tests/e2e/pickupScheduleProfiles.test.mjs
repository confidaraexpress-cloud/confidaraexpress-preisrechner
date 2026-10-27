// E2E: Einheitlicher Abholtermin (2026-10-24) — EIN Abschnitt „Abholtermin" für jede Fahrerabholung, in genau
// der Genauigkeit, die das Angebot belegt. Echter Dev-Server, echter Browser, gemocktes Backend.
//
//   A  JUMiNGO verstellbar: Regler, Mindestdauer 120 Minuten, Tastatur (15-Minuten-Schritte), Speichern mit
//      Angebotsbezug, dieselbe Zeit in Abschnitt und Beleg (Live-Leiste; G6/M9)              Pflicht 1/3/13/14
//   B  JUMiNGO mit längerer Mindestdauer des Anbieters (180 Minuten): sie gilt                Pflicht 3
//   C  JUMiNGO ohne Wahl: fester Zeitraum, kein Regler, kein Entwurfsaufruf                   Pflicht 2
//   D  Entwurf wiederherstellen: gespeicherter Wunsch DIESES Angebots erscheint, auch nach Neuladen  Pflicht 4
//   E  PICKUP_WINDOW_CHANGED: Dialog mit neuem Fenster, „Neues Zeitfenster übernehmen" setzt zurück  Pflicht 5
//   F  GLS 110 und DPD 137: fester Zeitraum 09:00–17:00 auf Karte, Abschnitt und Zusammenfassung   Pflicht 6/7/14
//   G  Transglobal-Direktbuchung: „Sendung bereit ab 09:00 Uhr", kein Ende, kein Regler         Pflicht 8
//   H  fehlende Abholzeit: nur das Datum                                                       Pflicht 9
//   I  Paketshopabgabe (DPD 124): kein Abholtermin                                            Pflicht 10
//   J  Abholung heute: „bereit ab 11:45 Uhr" und „Abholung heute bei Buchung bis 16:45 Uhr"    Pflicht 11
//   K  Tarif- und Navigationswechsel: keine Übernahme eines Fensters, kein JUMiNGO-Aufruf bei TG  Pflicht 12
//   L  Tablet 768 px und Smartphone 390 px: kein Überlauf, Touch zieht den Griff, Ziele ≥ 44 px  Pflicht 13
//
// Kein echtes Backend, keine Bestellung, kein Providerkontakt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_PAKET, STANDARD_SENDUNGSANGABEN } from "./helpers/newShipmentForm.mjs";

const PORT = 5611, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 6411;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const tagIn = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ABHOLTAG = tagIn(7);
const HEUTE = new Date().toISOString().slice(0, 10);
const deDatum = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10822",
};

const BASIS = (extra) => ({
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage", currency: "EUR",
  bookable: true, unavailableReason: null, requiredPriceInputs: [], priceCompleteness: "complete",
  insuranceAvailable: false, insuranceDetails: null, trackingAvailable: true, printerRequired: true,
  labelFormats: ["PDF"], labelSizes: ["A4"], labelFormatOptions: [],
  ...extra,
});

// JUMiNGO-Tarife in der Form der calculate-price-Antwort (Fenster, Mindestdauer, Verstellbarkeit vom Server).
const J_A = BASIS({
  id: 17, shipper_tariff_id: 3708, offerId: "a1".repeat(16), publicCarrierId: "ups", publicServiceName: "Standardversand",
  serviceType: "pickup", netPrice: 12.9, vatAmount: 2.45, finalPrice: 15.35,
  pickupDate: `${ABHOLTAG}T00:00:00Z`, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  pickupWindowAdjustable: true, pickupWindowMinMinutes: 120,
});
const J_B = BASIS({
  id: 18, shipper_tariff_id: 3709, offerId: "b2".repeat(16), publicCarrierId: "dhl", publicServiceName: "Paket",
  serviceType: "pickup", netPrice: 11.9, vatAmount: 2.26, finalPrice: 14.16,
  pickupDate: `${ABHOLTAG}T00:00:00Z`, pickupTimeFrom: "10:00", pickupTimeUntil: "18:00",
  pickupWindowAdjustable: true, pickupWindowMinMinutes: 120,
});
const J_180 = BASIS({
  ...J_B, id: 19, shipper_tariff_id: 3710, offerId: "c3".repeat(16), publicServiceName: "Express",
  pickupWindowMinMinutes: 180,
});
const J_FEST = BASIS({
  id: 20, shipper_tariff_id: 3711, offerId: "d4".repeat(16), publicCarrierId: "gls", publicServiceName: "Business",
  serviceType: "pickup", netPrice: 10.9, vatAmount: 2.07, finalPrice: 12.97,
  pickupDate: `${ABHOLTAG}T00:00:00Z`, pickupTimeFrom: "08:00", pickupTimeUntil: "16:00",
  pickupWindowAdjustable: false, pickupWindowMinMinutes: null,
});

// Transglobal-Angebote in der Form des öffentlichen Angebotsvertrags.
const TG = (extra) => BASIS({ serviceType: "pickup", collectionDate: ABHOLTAG, collectionReadyFrom: null,
  pickupTimeFrom: null, pickupTimeUntil: null, pickupToday: false, pickupTodayUntil: null,
  sameDaySurchargeNet: null, sameDaySurchargeGross: null, ...extra });
const TG110 = TG({ offerId: "e5".repeat(16), publicCarrierId: "gls", publicServiceName: "Pick&Ship",
  netPrice: 18.53, vatAmount: 3.52, finalPrice: 22.05, labelHandling: "carrier_at_pickup", labelFormats: [], labelSizes: [],
  printerRequired: false, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00" });
const TG137 = TG({ offerId: "f6".repeat(16), publicCarrierId: "dpd", publicServiceName: "Classic",
  netPrice: 7.5, vatAmount: 1.43, finalPrice: 8.93, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00" });
const TG22 = TG({ offerId: "a7".repeat(16), publicCarrierId: "ups", publicServiceName: "Standardversand",
  netPrice: 15.33, vatAmount: 2.91, finalPrice: 18.24, collectionReadyFrom: "09:00" });
const TG_HEUTE = TG({ offerId: "b8".repeat(16), publicCarrierId: "ups", publicServiceName: "Expressversand",
  netPrice: 19.0, vatAmount: 3.61, finalPrice: 22.61, collectionDate: HEUTE, collectionReadyFrom: "11:45",
  pickupToday: true, pickupTodayUntil: "16:45", sameDaySurchargeNet: 2.52, sameDaySurchargeGross: 3.0 });
const TG_OHNE_ZEIT = TG({ offerId: "c9".repeat(16), publicCarrierId: "dhl", publicServiceName: "Domestic Express",
  netPrice: 25.0, vatAmount: 4.75, finalPrice: 29.75, collectionDate: HEUTE, collectionReadyFrom: null });
const TG124 = TG({ offerId: "d0".repeat(16), publicCarrierId: "dpd", publicServiceName: "PaketShop", serviceType: "dropoff",
  netPrice: 6.08, vatAmount: 1.16, finalPrice: 7.24, collectionDate: null, parcelShopSearch: "server" });

const ALLE = [J_A, J_B, J_180, J_FEST, TG110, TG137, TG22, TG_HEUTE, TG_OHNE_ZEIT, TG124];

let server, browser;

/* Der Entwurfsmock bildet den Serververtrag nach: ein Wunsch ist an das Angebot gebunden, für das er gespeichert
   wurde, und erscheint nur dort (ein ungebundener Altbestand überall). */
async function setupRoutes(page, protokoll, szenario = {}) {
  const entwurf = { from: null, until: null, offerId: null, ...(szenario.entwurf || {}) };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    protokoll.pfade.push(p);
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (p.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/dropoff/parcelshops")) return json({ shops: [], parcelShops: [] });
    if (p.includes("/api/jumingo/draft/pickup-window")) {
      if (req.method() === "GET") {
        const offerId = url.searchParams.get("offerId");
        protokoll.fenster.push({ methode: "GET", offerId, ceShipmentId: url.searchParams.get("ceShipmentId") });
        const gilt = !entwurf.offerId || entwurf.offerId === offerId;
        return json({ pickupTimeFrom: gilt ? entwurf.from : null, pickupTimeUntil: gilt ? entwurf.until : null });
      }
      const body = req.postDataJSON();
      protokoll.fenster.push({ methode: "POST", ...body });
      entwurf.from = body.pickupTimeFrom || null;
      entwurf.until = body.pickupTimeUntil || null;
      entwurf.offerId = entwurf.from ? (body.offerId || null) : null;
      return json({ ok: true, pickupTimeFrom: entwurf.from, pickupTimeUntil: entwurf.until });
    }
    if (p.includes("/api/jumingo/calculate-price")) {
      return json({
        ceShipmentId: CE_ID, tariffs: szenario.tarife || ALLE, availableShippingModes: ["standard"],
        publicCarriers: [{ id: "ups", name: "UPS" }, { id: "dhl", name: "DHL" }, { id: "gls", name: "GLS" }, { id: "dpd", name: "DPD" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
    }
    if (p.includes("/api/jumingo/book")) {
      const body = req.postDataJSON();
      protokoll.book.push(body);
      if (szenario.book) { const a = szenario.book(body, protokoll.book.length); if (a) return json(a.json, a.status || 200); }
      return json({ message: "Sendung gebucht", ceShipmentId: CE_ID, invoiceNumber: "CE-RE26-00900",
        businessOrderNumber: "CE-BS26-00900", amount: 15.35, billingMode: "single", testBooking: false,
        orderConfirmation: { number: "CE-AB26-00900", issuedAt: "2026-10-24T10:00:00Z" }, shippingDocuments: [] });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return entwurf;
}

const neuesProtokoll = () => ({ pfade: [], fenster: [], book: [] });
const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const inhalt = async (loc) => norm(await loc.first().textContent());
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const querUeberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const abschnitt = (page) => page.locator("[data-pickup-profile]");
const EIN_PAKET = { ...STANDARD_PAKET, packageCount: "1" };

async function neueSeite(optionen = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "de-DE",
    timezoneId: "Europe/Berlin", ...optionen });
  const page = await context.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler, context };
}

async function zuDenAngeboten(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { paket: EIN_PAKET, sendungsangaben: STANDARD_SENDUNGSANGABEN });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

async function waehle(page, tarif) {
  await karteVon(page, tarif).locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await page.waitForSelector("#booking-reference-toggle", { timeout: 20000 });
}

async function zurueckZuDenAngeboten(page) {
  // Das sichtbare „Zurück" der Buchungsseite führt immer zum Angebotsvergleich (derselbe Vorgang).
  await page.getByRole("button", { name: "Zurück", exact: true }).click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

async function profilVon(page) {
  await abschnitt(page).first().waitFor({ timeout: 10000 });
  return abschnitt(page).first().getAttribute("data-pickup-profile");
}

async function warteBis(pruefung, timeout = 8000) {
  const ende = Date.now() + timeout;
  for (;;) {
    if (await pruefung()) return;
    if (Date.now() > ende) throw new Error("Bedingung nicht erfüllt");
    await kurz(100);
  }
}

// Ein Griff des Reglers per Touch ziehen (CDP-Touchfolge) — wie ein Finger auf dem Smartphone.
async function ziehePerTouch(page, selektor, deltaX) {
  const box = await page.locator(selektor).boundingBox();
  const wert = await page.locator(selektor).evaluate((el) => ({ v: +el.value, min: +el.min, max: +el.max }));
  const daumen = 26;
  const x = box.x + daumen / 2 + ((wert.v - wert.min) / (wert.max - wert.min)) * (box.width - daumen);
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (deltaX * i) / 8, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
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

test("A — JUMiNGO verstellbar: Regler mit 120 Minuten, Tastatur, Speichern für dieses Angebot, gleiche Zeit überall", async () => {
  const { page, fehler, context } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll);
  await zuDenAngeboten(page);
  await waehle(page, J_A);
  assert.equal(await profilVon(page), "window_adjustable");
  assert.equal(await inhalt(abschnitt(page).locator("h3")), "Gewünschter Abholtermin");
  assert.match(await inhalt(abschnitt(page).locator(".pw-caption")), /Verfügbar: 09:00–17:00 Uhr · Mindestdauer: 2 Std\./);
  // Die Hydrierung fragt den Wunsch FÜR DIESES Angebot ab.
  await warteBis(async () => protokoll.fenster.some((f) => f.methode === "GET"));
  assert.ok(protokoll.fenster.filter((f) => f.methode === "GET").every((f) => f.offerId === J_A.offerId), "GET ohne Angebotsbezug");

  // Tastatur: Beginn um vier 15-Minuten-Schritte nach rechts → 10:00.
  const vonGriff = abschnitt(page).locator(".pw-range--from");
  await vonGriff.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  // Ende so weit nach links wie möglich → die Mindestdauer hält es bei 12:00.
  const bisGriff = abschnitt(page).locator(".pw-range--until");
  await bisGriff.focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowLeft");
  assert.equal(await inhalt(abschnitt(page).locator(".pw-time-val")), "10:00–12:00 Uhr");
  // Gespeichert wird entprellt — mit dem Angebot, für das das Fenster gilt.
  await warteBis(async () => protokoll.fenster.some((f) => f.methode === "POST" && f.pickupTimeFrom === "10:00"));
  const post = protokoll.fenster.filter((f) => f.methode === "POST").pop();
  assert.deepEqual([post.offerId, post.pickupTimeFrom, post.pickupTimeUntil, String(post.ceShipmentId)],
    [J_A.offerId, "10:00", "12:00", String(CE_ID)]);
  await page.waitForSelector(".pw-saved", { timeout: 5000 });
  // Dieselbe Zeit im Beleg (Live-Leiste) — das ausgewählte Angebot wiederholt sie seit G6/M9 (2026-10-28) nicht.
  await warteBis(async () => (await inhalt(page.locator(".blsum-handover"))).includes("10:00–12:00 Uhr"));
  assert.match(await inhalt(page.locator(".blsum-handover")), /10:00–12:00 Uhr/);
  assert.deepEqual(fehler, []);
  await context.close();
});

test("B — längere Mindestdauer des Anbieters (180 Minuten) gilt", async () => {
  const { page, fehler, context } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll);
  await zuDenAngeboten(page);
  await waehle(page, J_180);
  assert.equal(await profilVon(page), "window_adjustable");
  assert.match(await inhalt(abschnitt(page).locator(".pw-caption")), /Mindestdauer: 3 Std\./);
  await abschnitt(page).locator(".pw-range--until").focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowLeft");
  assert.equal(await inhalt(abschnitt(page).locator(".pw-time-val")), "10:00–13:00 Uhr");
  assert.deepEqual(fehler, []);
  await context.close();
});

test("C — JUMiNGO ohne Wahl: fester Zeitraum, kein Regler, kein Entwurfsaufruf", async () => {
  const { page, fehler, context } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll);
  await zuDenAngeboten(page);
  await waehle(page, J_FEST);
  assert.equal(await profilVon(page), "window_fixed");
  assert.equal(await inhalt(abschnitt(page).locator("h3")), "Abholtermin");
  assert.equal(await inhalt(abschnitt(page).locator(".pw-fixed-val")), "08:00–16:00 Uhr");
  assert.match(await inhalt(abschnitt(page).locator(".pw-note")), /eine genaue Uhrzeit wird nicht zugesagt/);
  assert.equal(await abschnitt(page).locator(".pw-slider").count(), 0);
  await kurz(800);
  assert.equal(protokoll.fenster.length, 0, "ein Tarif ohne Wahl liest oder schreibt den Entwurf");
  assert.deepEqual(fehler, []);
  await context.close();
});

test("D — Entwurf wiederherstellen: der gespeicherte Wunsch DIESES Angebots erscheint, auch nach Neuladen", async () => {
  const { page, fehler, context } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, { entwurf: { from: "13:00", until: "15:00", offerId: J_A.offerId } });
  await zuDenAngeboten(page);
  await waehle(page, J_A);
  await warteBis(async () => (await abschnitt(page).locator(".pw-time-val").count()) > 0
    && (await inhalt(abschnitt(page).locator(".pw-time-val"))) === "13:00–15:00 Uhr");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-pickup-profile]", { timeout: 20000 });
  await warteBis(async () => (await abschnitt(page).locator(".pw-time-val").count()) > 0
    && (await inhalt(abschnitt(page).locator(".pw-time-val"))) === "13:00–15:00 Uhr");
  assert.ok(protokoll.fenster.filter((f) => f.methode === "GET").length >= 2, "nach dem Neuladen nicht erneut geladen");
  assert.deepEqual(fehler, []);
  await context.close();
});

test("E — PICKUP_WINDOW_CHANGED: Dialog mit neuem Fenster, „Neues Zeitfenster übernehmen“ setzt den Wunsch zurück", async () => {
  const { page, fehler, context } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, {
    entwurf: { from: "13:00", until: "15:00", offerId: J_A.offerId },
    book: (_, n) => (n === 1 ? { status: 409, json: { code: "PICKUP_WINDOW_CHANGED", message: "Das verfügbare Abholzeitfenster hat sich geändert.",
      availableFrom: "14:00", availableUntil: "18:00", minimumMinutes: 120, adjustable: true } } : null),
  });
  await zuDenAngeboten(page);
  await waehle(page, J_A);
  await warteBis(async () => (await abschnitt(page).locator(".pw-time-val").count()) > 0);
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".booking-confirm-panel", { timeout: 20000 });
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForSelector("#pickup-drift-title", { timeout: 10000 });
  assert.match(await inhalt(page.locator(".price-drift-card")), /14:00–18:00 Uhr/);
  assert.match(await inhalt(page.locator(".price-drift-card")), /Mindestdauer des Fensters: 2 Std\./);
  await page.getByRole("button", { name: /Neues Zeitfenster übernehmen/ }).click();
  await warteBis(async () => protokoll.fenster.some((f) => f.methode === "POST" && f.pickupTimeFrom === null));
  await page.waitForSelector("#pickup-drift-title", { state: "detached", timeout: 5000 });
  assert.equal(protokoll.book.length, 1, "nach dem Dialog wurde ungefragt erneut gebucht");
  assert.deepEqual(fehler, []);
  await context.close();
});

test("F — GLS 110 und DPD 137: fester Zeitraum 09:00–17:00 auf Karte, Abschnitt und Zusammenfassung", async () => {
  for (const tarif of [TG110, TG137]) {
    const { page, fehler, context } = await neueSeite();
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll);
    await zuDenAngeboten(page);
    assert.match(await inhalt(karteVon(page, tarif).locator(".offer-tl-node--start")), /09:00–17:00 Uhr/);
    assert.ok(!(await inhalt(karteVon(page, tarif).locator(".offer-tl-node--start"))).includes("bereit ab"));
    await waehle(page, tarif);
    assert.equal(await profilVon(page), "window_fixed", tarif.publicServiceName);
    assert.equal(await inhalt(abschnitt(page).locator("h3")), "Abholtermin");
    const tagZeile = abschnitt(page).locator(".summary-detail-row").first();
    assert.equal(await inhalt(tagZeile.locator(".summary-detail-key")), "Datum");
    assert.equal(await inhalt(tagZeile.locator(".summary-detail-val")), deDatum(ABHOLTAG));
    assert.equal(await inhalt(abschnitt(page).locator(".pw-fixed-val")), "09:00–17:00 Uhr");
    assert.equal(await abschnitt(page).locator(".pw-slider").count(), 0);
    assert.match(await inhalt(page.locator(".blsum-handover")), /09:00–17:00 Uhr/);
    await kurz(500);
    assert.equal(protokoll.fenster.length, 0, `${tarif.publicServiceName}: JUMiNGO-Entwurf angefragt`);
    assert.deepEqual(fehler, []);
    await context.close();
  }
});

test("G — Transglobal-Direktbuchung: „Sendung bereit ab 09:00 Uhr“, kein Ende, kein Regler", async () => {
  const { page, fehler, context } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll);
  await zuDenAngeboten(page);
  await waehle(page, TG22);
  assert.equal(await profilVon(page), "ready_from");
  assert.equal(await inhalt(abschnitt(page).locator("h3")), "Abholtermin");
  assert.equal(await inhalt(abschnitt(page).locator(".pw-ready-val")), "09:00 Uhr");
  const zeitZeile = abschnitt(page).locator(".summary-detail-row:has(.pw-ready-val)");
  assert.equal(await inhalt(zeitZeile.locator(".summary-detail-key")), "Sendung bereit ab");
  assert.match(await inhalt(abschnitt(page).locator(".pw-note")), /Ein festes Abholzeitfenster nennt der Versanddienstleister/);
  assert.ok(!/\d{2}:\d{2}–\d{2}:\d{2}/.test(await inhalt(abschnitt(page))), "ein Ende wurde erfunden");
  assert.equal(await abschnitt(page).locator(".pw-slider").count(), 0);
  assert.match(await inhalt(page.locator(".blsum-handover")), /bereit ab 09:00 Uhr/);
  assert.equal(protokoll.fenster.length, 0);
  assert.deepEqual(fehler, []);
  await context.close();
});

test("H — fehlende Abholzeit: nur das Datum, keine erfundene Uhrzeit", async () => {
  const { page, fehler, context } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll);
  await zuDenAngeboten(page);
  await waehle(page, TG_OHNE_ZEIT);
  assert.equal(await profilVon(page), "date_only");
  assert.match(await inhalt(abschnitt(page).locator(".pw-note")), /Die Uhrzeit der Abholung legt der Versanddienstleister fest\./);
  assert.ok(!/\d{2}:\d{2}/.test(await inhalt(abschnitt(page))), "eine Uhrzeit wurde erfunden");
  assert.deepEqual(fehler, []);
  await context.close();
});

test("I — Paketshopabgabe (DPD 124): kein Abholtermin", async () => {
  const { page, fehler, context } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll);
  await zuDenAngeboten(page);
  await waehle(page, TG124);
  await kurz(800);
  assert.equal(await abschnitt(page).count(), 0, "eine Paketshopabgabe bekam einen Fahrer-Abholtermin");
  assert.equal(protokoll.fenster.length, 0);
  assert.deepEqual(fehler, []);
  await context.close();
});

test("J — Abholung heute: „bereit ab“ und der Buchungsschluss — auf Karte und Abschnitt derselbe Satz", async () => {
  const { page, fehler, context } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll);
  await zuDenAngeboten(page);
  await waehle(page, TG_HEUTE);
  assert.equal(await profilVon(page), "ready_from");
  assert.equal(await inhalt(abschnitt(page).locator(".pw-ready-val")), "11:45 Uhr");
  assert.equal(await inhalt(abschnitt(page).locator(".pw-sameday")), "Abholung heute bei Buchung bis 16:45 Uhr");
  // Ein späterer Abholtag trägt keinen Buchungsschluss.
  await zurueckZuDenAngeboten(page);
  await waehle(page, TG22);
  assert.equal(await abschnitt(page).locator(".pw-sameday").count(), 0);
  assert.deepEqual(fehler, []);
  await context.close();
});

test("K — Tarif- und Navigationswechsel: kein übernommenes Fenster, kein Entwurfsaufruf bei Transglobal", async () => {
  const { page, fehler, context } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll);
  await zuDenAngeboten(page);
  await waehle(page, J_A);
  await warteBis(async () => (await abschnitt(page).locator(".pw-time-val").count()) > 0);
  await abschnitt(page).locator(".pw-range--from").focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
  await warteBis(async () => protokoll.fenster.some((f) => f.methode === "POST" && f.pickupTimeFrom === "11:00"));

  // Wechsel zu GLS 110: fester Zeitraum, nichts vom eingestellten Fenster, kein Entwurfsaufruf.
  await zurueckZuDenAngeboten(page);
  const vorher = protokoll.fenster.length;
  await waehle(page, TG110);
  assert.equal(await profilVon(page), "window_fixed");
  assert.equal(await inhalt(abschnitt(page).locator(".pw-fixed-val")), "09:00–17:00 Uhr");
  assert.ok(!(await inhalt(page.locator(".blsum-handover"))).includes("11:00"), "das Fenster des JUMiNGO-Tarifs wanderte mit");
  await kurz(500);
  assert.equal(protokoll.fenster.length, vorher, "ein Transglobal-Angebot fragte den JUMiNGO-Entwurf an");

  // Wechsel zu einem anderen JUMiNGO-Tarif: der Wunsch von J_A gehört nicht zu J_B — volles Fenster.
  await zurueckZuDenAngeboten(page);
  await waehle(page, J_B);
  await warteBis(async () => (await abschnitt(page).locator(".pw-time-val").count()) > 0);
  assert.equal(await inhalt(abschnitt(page).locator(".pw-time-val")), "10:00–18:00 Uhr");
  const get = protokoll.fenster.filter((f) => f.methode === "GET").pop();
  assert.equal(get.offerId, J_B.offerId);

  // Zurück zu J_A: dort steht der eigene Wunsch wieder.
  await zurueckZuDenAngeboten(page);
  await waehle(page, J_A);
  await warteBis(async () => (await abschnitt(page).locator(".pw-time-val").count()) > 0
    && (await inhalt(abschnitt(page).locator(".pw-time-val"))) === "11:00–17:00 Uhr");
  assert.deepEqual(fehler, []);
  await context.close();
});

test("L — Tablet 768 px und Smartphone 390 px: kein Überlauf, Touch zieht den Griff, Trefferflächen ≥ 44 px", async () => {
  for (const geraet of [
    { name: "Tablet", viewport: { width: 768, height: 1024 }, hasTouch: true },
    { name: "Smartphone", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  ]) {
    const { page, fehler, context } = await neueSeite({ viewport: geraet.viewport, hasTouch: geraet.hasTouch,
      isMobile: geraet.isMobile, deviceScaleFactor: geraet.deviceScaleFactor });
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll);
    await zuDenAngeboten(page);
    await waehle(page, J_A);
    await warteBis(async () => (await abschnitt(page).locator(".pw-time-val").count()) > 0);
    await abschnitt(page).scrollIntoViewIfNeeded();
    const slider = await abschnitt(page).locator(".pw-slider").boundingBox();
    assert.ok(slider.height >= 44, `${geraet.name}: Trefferfläche ${slider.height} px`);
    // Touch: den Ende-Griff um ein Drittel der Schiene nach links ziehen.
    await ziehePerTouch(page, "[data-pickup-profile] .pw-range--until", -(slider.width / 3));
    await warteBis(async () => (await inhalt(abschnitt(page).locator(".pw-time-val"))) !== "09:00–17:00 Uhr");
    const zeit = await inhalt(abschnitt(page).locator(".pw-time-val"));
    assert.match(zeit, /^09:00–1[0-6]:[0-5]\d Uhr$/, `${geraet.name}: Touch ergab ${zeit}`);
    assert.equal(await querUeberlauf(page), 0, `${geraet.name}: waagerechter Überlauf`);
    // Und die festen Varianten passen ebenso.
    await zurueckZuDenAngeboten(page);
    await waehle(page, TG110);
    assert.equal(await profilVon(page), "window_fixed");
    assert.equal(await querUeberlauf(page), 0, `${geraet.name}: Überlauf beim festen Zeitraum`);
    assert.deepEqual(fehler, []);
    await context.close();
  }
});
