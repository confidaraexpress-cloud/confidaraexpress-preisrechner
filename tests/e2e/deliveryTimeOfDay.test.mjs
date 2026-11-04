// E2E: P4 Zustelluhrzeiten (Betreiberentscheidung 2026-11-04) — die Tageszeit der Zustellung auf der Tarifkarte, im
// Detailbereich und in den Fristgruppen; die Zeitleiste trägt die neue Zusatzzeile in jeder Breite. Echter Dev-Server,
// echter Browser, gemocktes Backend.
//
// Die Regel selbst prüft die Unit-Suite (src/utils/deliveryTimeOfDay.test.mjs: 15 Launchprodukte, UPS 29 und TNT 49
// mit und ohne Beleg, JUMiNGO, Filter, Demo). Die Buchungsleiste prüfen tg22DeliveryProjection (E) und
// tg23ExpressSaver, den öffentlichen Preisrechner publicCalculator (J2).
//
//   K  Karte: grünes Feld vor 15:00, graue Uhrzeit danach, „Zustellung im Tagesverlauf" ohne Uhrzeit, nichts neben
//      einer Uhrzeit im Namen (TNT 49) oder ohne Zustelltag
//   D  Detailbereich: dieselbe Aussage hinter „Zustellung" bzw. dem Datum der Prognose
//   F  Fristgruppen: „im Tagesverlauf" erfüllt keine Fristuhrzeit — die Karte bleibt in „Frist nicht bestätigt"
//   R  1440 / 1024 / 768 / 390 px: Daten und Zusatzzeilen auf einer Höhe, Textkanten an den Punkten, gleich hohe
//      Zeitleisten, kein waagerechter Überlauf
//
// Kein echtes Backend, keine Bestellung, kein Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_EMPFAENGER, STANDARD_PAKET } from "./helpers/newShipmentForm.mjs";
import { VERSANDZEITPUNKT, LIEFERFRIST_TAG } from "../../src/utils/offersFilterFixture.mjs";

const PORT = 5727, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "70173", customer_number: "CE-K-10997",
};
const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
              "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const kennung = (kopf, fuss) => `${kopf}${fuss.padStart(32 - kopf.length, "0")}`;
const preis = (netto) => ({ netPrice: netto, vatAmount: Number((netto * 0.19).toFixed(2)),
                            finalPrice: Number((netto * 1.19).toFixed(2)), currency: "EUR" });
const FRIST = `2026-08-${LIEFERFRIST_TAG}`;
const TAGESVERLAUF = "Zustellung im Tagesverlauf";

/* Ein JUMiNGO-Tarif mit Anbieterterminen — mit oder ohne Anbieteruhrzeit. */
const J = (id, carrier, name, netto, termin, zeit, extra = {}) => ({
  id, shipper_tariff_id: id, offerId: kennung("p4j", String(id)),
  publicCarrierId: carrier.id, publicCarrierName: carrier.name, publicServiceName: name, serviceType: "pickup",
  shippingMode: "express", transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
  deliveryDate: termin, deliveryDateMin: termin, deliveryDateMax: termin, deliveryTimeUntil: zeit,
  trackingAvailable: true, printerRequired: false, bookable: true, unavailableReason: null, requiredPriceInputs: [],
  ...preis(netto), ...extra,
});
/* Ein Transglobal-Angebot mit der Prognose des Servers (TG-L1) — oder ohne (`prognose: null`). */
const T = (sid, carrier, name, netto, prognose, extra = {}) => ({
  offerId: kennung("p4t", String(sid)), publicCarrierId: carrier, publicServiceName: name, serviceType: "pickup",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null, deliveryTimeUntil: null,
  transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
  deliveryProjection: prognose ? { kind: "estimated", timeUntil: null, ...prognose } : null,
  bookable: true, unavailableReason: null, requiredPriceInputs: [], ...preis(netto), ...extra,
});
const UPS = { id: "ups", name: "UPS" }, DHL = { id: "dhl", name: "DHL Express" }, DPD = { id: "dpd", name: "DPD" };
const TNT = { id: "tnt", name: "TNT" };

// Die Aussagen nebeneinander: Anbieterzeit früh und spät, Anbieterdatum ohne Zeit, belegte Zeitleistung (DHL 87),
// UPS Express 29 und UPS Standard 22 ohne Uhrzeit (Tag und Zeitraum), TNT 49 mit der Uhrzeit nur im Namen, eine reine
// Laufzeit ohne Prognose.
const j9 = J(3260, DHL, "Express National 9:00", 31, FRIST, "09:00");
const j18 = J(3257, UPS, "Standard", 12, FRIST, "18:00", { shippingMode: "standard" });
const jOhne = J(3271, DPD, "Classic", 10, FRIST, null, { shippingMode: "standard" });
const t87 = T(87, "dhl", "Domestic Express 12:00", 25, { dateMin: FRIST, dateMax: FRIST, timeUntil: "12:00" });
const t29 = T(29, "ups", "Express", 20, { dateMin: FRIST, dateMax: FRIST });
const t22 = T(22, "ups", "Standardversand", 9, { dateMin: FRIST, dateMax: "2026-09-01" },
  { transitDaysMax: 2, deliveryTime: "1–2 Tage" });
const t49 = T(49, "tnt", "Express 12:00", 19, { dateMin: FRIST, dateMax: FRIST });
const tLauf = T(23, "ups", "Expressversand", 11, null);
const ALLE = [j9, j18, jOhne, t87, t29, t22, t49, tLauf];

let server, browser;

async function setup(page, antwort = { tariffs: ALLE }) {
  const p = { calc: 0 };
  await page.clock.setFixedTime(new Date(VERSANDZEITPUNKT));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const pfad = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/api/shipping/launch-scope")) return json({ countries: EU27, originCountries: ["DE"] });
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (pfad.includes("/api/jumingo/calculate-price")) {
      p.calc++;
      return json({ ceShipmentId: 4997, customsRequired: false, exportDeclaration: null,
                    availableShippingModes: ["express", "standard"], publicCarriers: [UPS, DHL, DPD, TNT],
                    fromCountryCode: "DE", toCountryCode: "DE", ...antwort });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const texte = async (loc) => (await loc.allTextContents()).map(norm);
const gruppenIds = (page, gruppe) => page.locator(`[data-offers-group="${gruppe}"] .offer-card button.offer-details-link`)
  .evaluateAll((knoepfe) => knoepfe.map((k) => k.getAttribute("aria-controls").replace("offer-details-", "")));
const kartenZahl = (page, n) => page.waitForFunction((z) => document.querySelectorAll(".offer-card").length === z, n,
  { timeout: 10000 });

async function neueSeite(viewport = { width: 1440, height: 1100 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function zuDenAngeboten(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { empfaenger: STANDARD_EMPFAENGER, paket: { ...STANDARD_PAKET, packageCount: "1" } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

async function scrollBeruhigt(page) {
  await page.evaluate(() => new Promise((fertig) => {
    let letzte = window.scrollY, ruhig = 0, frames = 0;
    const tick = () => {
      if (window.scrollY === letzte) ruhig += 1;
      else { ruhig = 0; letzte = window.scrollY; }
      if (ruhig >= 5 || (frames += 1) > 180) return fertig();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

/* Lieferfrist: oben das Datum, unten die Uhrzeit — dieselben Bedienflächen wie tgL2DeliveryGroups. */
const obenAusloeser = (page) => page.locator(".service-filter-trigger",
  { has: page.locator(".service-filter-trigger-title", { hasText: /^Späteste Lieferzeit$/ }) });
async function obenTag(page, tag) {
  if (await page.locator(".date-picker-body--latest").count() === 0) await obenAusloeser(page).click();
  await page.waitForSelector(".date-picker-body--latest", { timeout: 10000 });
  await page.locator(".date-picker-body--latest .dc-day", { hasText: new RegExp(`^${tag}$`) }).first().click();
}
async function untenUhrzeit(page, text) {
  if (await page.locator(".offers-delivery-dropdown").count() === 0) {
    await page.locator(".offers-filter-chip", { hasText: "Lieferung" }).click();
  }
  await page.waitForSelector(".offers-delivery-dropdown", { timeout: 10000 });
  await page.waitForFunction(
    () => document.querySelector(".offers-delivery-dropdown .offers-time-trigger")
      && !document.querySelector(".offers-delivery-dropdown .offers-time-trigger").disabled, null, { timeout: 10000 });
  await page.evaluate(() => Promise.all(
    (document.querySelector(".offers-delivery-dropdown")?.getAnimations() || []).map((a) => a.finished.catch(() => {}))));
  await scrollBeruhigt(page);
  await page.locator(".offers-delivery-dropdown .offers-time-trigger").click();
  await page.waitForSelector(".offers-time-list", { timeout: 10000 });
  await scrollBeruhigt(page);
  await page.locator(".offers-time-option", { hasText: text }).first().click();
  await page.waitForSelector(".offers-time-list", { state: "detached", timeout: 10000 });
}

async function oeffneDetails(page, t) {
  const karte = karteVon(page, t);
  await karte.locator("button.offer-details-link").click();
  const panel = page.locator(`#offer-details-${t.offerId}`);
  await panel.waitFor({ state: "visible", timeout: 10000 });
  return panel;
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

test("K — Karte: Uhrzeit grün oder grau, „Zustellung im Tagesverlauf“ ohne Uhrzeit, nichts neben „Express 12:00“", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  await zuDenAngeboten(page);
  await kartenZahl(page, ALLE.length);
  const ende = (t) => karteVon(page, t).locator(".offer-tl-node--end");
  const erwartet = [
    [j9, [], "Lieferung bis 09:00 Uhr"], [j18, ["bis 18:00 Uhr"], null], [jOhne, [TAGESVERLAUF], null],
    [t87, [], "Lieferung bis 12:00 Uhr"], [t29, [TAGESVERLAUF], null], [t22, [TAGESVERLAUF], null],
    [t49, [], null], [tLauf, [], null],
  ];
  for (const [t, grau, gruen] of erwartet) {
    await karteVon(page, t).scrollIntoViewIfNeeded();
    assert.deepEqual(await texte(ende(t).locator(".offer-tl-sub")), grau, `${t.publicServiceName}: Unterzeile`);
    assert.deepEqual(await texte(ende(t).locator(".offer-early-note")), gruen ? [gruen] : [], `${t.publicServiceName}: Feld`);
  }
  // TNT 49: der Name bleibt die einzige Uhrzeitangabe — grün im Namen, keine Zeit und kein Tagesverlauf darunter.
  assert.equal(norm(await karteVon(page, t49).locator(".offer-service-time").textContent()), "12:00");
  assert.doesNotMatch(norm(await ende(t49).textContent()), /Uhr|Tagesverlauf/);
  // UPS Express 29: keine Uhrzeit ohne Carrierbeleg (weder 10:30 noch 12:00) und kein Garantiewort.
  assert.doesNotMatch(norm(await ende(t29).textContent()), /garantiert|\d{1,2}:\d{2}/i);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — Detailbereich: „Zustellung · im Tagesverlauf“ bei Anbieterdatum, „…, im Tagesverlauf“ hinter der Prognose", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  await zuDenAngeboten(page);
  const zeile = (panel, label) => panel.locator(`.offer-detail-row:has(.offer-detail-label:text-is("${label}")) .offer-detail-value`);
  const jPanel = await oeffneDetails(page, jOhne);
  assert.equal(norm(await zeile(jPanel, "Zustellung").textContent()), "im Tagesverlauf");
  const j18Panel = await oeffneDetails(page, j18);
  assert.equal(norm(await zeile(j18Panel, "Zustellung").textContent()), "bis 18:00 Uhr");
  const tPanel = await oeffneDetails(page, t29);
  assert.match(norm(await zeile(tPanel, "Voraussichtliche Zustellung").textContent()), /^\d{2}\.\d{2}\.\d{4}, im Tagesverlauf$/);
  const t49Panel = await oeffneDetails(page, t49);
  assert.match(norm(await zeile(t49Panel, "Voraussichtliche Zustellung").textContent()), /^\d{2}\.\d{2}\.\d{4}$/,
    "neben „Express 12:00“ steht eine Tageszeit");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F — Fristgruppen: „im Tagesverlauf“ erfüllt keine Fristuhrzeit, die belegte 12:00 schon", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  await obenTag(page, LIEFERFRIST_TAG);
  await untenUhrzeit(page, "12:00 Uhr");
  await page.waitForSelector('[data-offers-group="unconfirmed"]', { timeout: 10000 });
  assert.deepEqual((await gruppenIds(page, "confirmed")).sort(), [j9.offerId].sort());
  assert.deepEqual(await gruppenIds(page, "projected"), [t87.offerId]);
  const offen = await gruppenIds(page, "unconfirmed");
  for (const t of [jOhne, t29, t49]) assert.ok(offen.includes(t.offerId), `${t.publicServiceName} ist nicht „Frist nicht bestätigt“`);
  // Die Karten behalten ihre Aussage in der Gruppe — der Tagesverlauf wird nicht zur Uhrzeit.
  assert.deepEqual(await texte(karteVon(page, t29).locator(".offer-tl-node--end .offer-tl-sub")), [TAGESVERLAUF]);
  assert.equal(p.calc, 1, "ein Lieferzeitfilter hat eine Preisanfrage ausgelöst");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("R — 1440 / 1024 / 768 / 390 px: die Zeitleiste trägt die Tageszeit ohne Versatz, Überdeckung oder Überlauf", async () => {
  for (const breite of [1440, 1024, 768, 390]) {
    const { page, fehler } = await neueSeite({ width: breite, height: 1400 });
    await setup(page);
    await zuDenAngeboten(page);
    await kartenZahl(page, ALLE.length);
    const m = await page.evaluate(() => [...document.querySelectorAll(".offer-card")].map((k) => {
      k.style.contentVisibility = "visible";
      const r = (e) => e.getBoundingClientRect();
      const start = k.querySelector(".offer-tl-node--start"), ende = k.querySelector(".offer-tl-node--end");
      const ds = start.querySelector(".offer-tl-primary"), dz = ende.querySelector(".offer-tl-primary");
      const zs = start.querySelector(".offer-tl-sub"), zz = ende.querySelector(".offer-tl-sub, .offer-early-note");
      const labels = k.querySelector(".offer-tl-labels");
      const kinder = [...start.children, ...ende.children];
      return {
        datum: ds && dz ? Math.abs(r(ds).top - r(dz).top) : 0,
        zusatz: zs && zz ? Math.abs(r(zs).top - r(zz).top) : 0,
        links: Math.abs(Math.min(...[...start.children].map((c) => r(c).left)) - r(k.querySelector(".offer-tl-dot--start")).left),
        rechts: Math.abs(Math.max(...[...ende.children].map((c) => r(c).right)) - r(k.querySelector(".offer-tl-dot--end")).right),
        ueber: Math.max(0, ...kinder.map((c) => r(c).bottom - r(labels).bottom)),
        ueberlappt: [...ende.children].some((a, i, alle) => alle.slice(i + 1).some((b) => r(a).bottom - r(b).top > 1)),
        hoehe: r(labels).height,
      };
    }));
    m.forEach((k, i) => {
      assert.ok(k.datum <= 1, `${breite}px Karte ${i}: Start- und Zieldatum ${k.datum.toFixed(1)} px versetzt`);
      assert.ok(k.zusatz <= 1, `${breite}px Karte ${i}: die Zusatzzeilen stehen ${k.zusatz.toFixed(1)} px versetzt`);
      assert.ok(k.links <= 1, `${breite}px Karte ${i}: Textkante ${k.links.toFixed(1)} px neben dem Startpunkt`);
      assert.ok(k.rechts <= 1, `${breite}px Karte ${i}: Textkante ${k.rechts.toFixed(1)} px neben dem Zielpunkt`);
      assert.ok(k.ueber <= 1, `${breite}px Karte ${i}: eine Zeile ragt ${k.ueber.toFixed(1)} px aus der Zeitleiste`);
      assert.ok(!k.ueberlappt, `${breite}px Karte ${i}: Zeilen im Zielknoten überdecken sich`);
    });
    const hoehen = m.map((k) => k.hoehe);
    assert.ok(Math.max(...hoehen) - Math.min(...hoehen) <= 1,
      `${breite}px: ungleiche Zeitleisten (${hoehen.map((h) => h.toFixed(1)).join(" / ")} px)`);
    const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(ueberlauf <= 0, `${breite}px: waagerechter Überlauf ${ueberlauf} px`);
    assert.deepEqual(fehler, []);
    await page.close();
  }
});
