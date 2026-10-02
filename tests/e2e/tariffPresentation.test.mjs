// E2E: Go-Live Block B (Betreiberentscheidungen K1–K4, 2026-10-02) — Tarifnamen, Economy, Lieferzeitfilter,
// Samstagszustellung. Echter Dev-Server, echter Browser, gemocktes Backend.
//
// Versandart und Abholung/Abgabe filtert der SERVER (dort gemessen: go-live-tariff-presentation im Backend).
// Hier wird gemessen, dass die Oberfläche die Auswahl sendet und die kuratierten Namen beider Quellen
// unverändert zeigt — und dass der rein clientseitige Lieferzeitfilter K2 einhält.
//
//   A  DE→DE, Versandart Express  → Anfrage „express"; JUMiNGO- und Transglobal-Expressangebote mit ihren Namen
//   B  DE→FR, Versandart Economy  → Anfrage „economy"; JUMiNGO „Economy Express", TG „Economy Select"/„Economy Express"
//   C  Nur Abgabe                  → Anfrage „dropoff"; JUMiNGO-Shoptarif und TG 124 „PaketShop" als Shopabgabe
//   D  Späteste Lieferzeit         → belegt zu spät verschwindet; ohne vergleichbaren Anbietertermin sichtbar mit
//                                    „Zustelltermin nicht bewertbar"; ohne Filter kein Hinweis; kein neuer Preisrequest
//   S  Samstagszustellung          → Detailzeile nur am Tarif mit Providerflag, Name trägt die Unterscheidung
//
// Kein echtes Backend, keine Bestellung, kein Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_EMPFAENGER, STANDARD_PAKET } from "./helpers/newShipmentForm.mjs";
import { VERSANDZEITPUNKT, LIEFERFRIST_TAG } from "../../src/utils/offersFilterFixture.mjs";

const PORT = 5446, BASE = `http://127.0.0.1:${PORT}`;
const HINWEIS = "Zustelltermin nicht bewertbar";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "70173", customer_number: "CE-K-10998",
};
const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
              "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const kennung = (kopf, fuss) => `${kopf}${fuss.padStart(32 - kopf.length, "0")}`;
// Serverbeträge — Fixturewerte, nie gerechnet.
const preis = (netto) => ({ netPrice: netto, vatAmount: Number((netto * 0.19).toFixed(2)),
                            finalPrice: Number((netto * 1.19).toFixed(2)), currency: "EUR" });

/* Ein JUMiNGO-Tarif, wie die Route ihn ausliefert: kuratierter Name, Versandart, Anbietertermine. */
const J = (id, carrier, name, shippingMode, netto, extra = {}) => ({
  id, shipper_tariff_id: id, offerId: kennung("tpj", String(id)),
  publicCarrierId: carrier.id, publicCarrierName: carrier.name, publicServiceName: name, serviceType: "pickup",
  shippingMode, transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1-2 Tage",
  trackingAvailable: true, printerRequired: false, deliveryOnSaturday: false,
  bookable: true, unavailableReason: null, requiredPriceInputs: [], ...preis(netto), ...extra,
});
/* Ein Transglobal-Angebot: kein Anbieterdatum, keine Uhrzeit — die Zeit steht allenfalls im Namen. */
const T = (sid, carrier, name, netto, extra = {}) => ({
  offerId: kennung("tpt", String(sid)), publicCarrierId: carrier, publicServiceName: name, serviceType: "pickup",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null, transitDaysMin: 1, transitDaysMax: 2,
  deliveryTime: "1-2 Tage", bookable: true, unavailableReason: null, requiredPriceInputs: [], ...preis(netto), ...extra,
});
const UPS = { id: "ups", name: "UPS" }, DHL = { id: "dhl", name: "DHL Express" }, TNT = { id: "tnt", name: "TNT" },
      DPD = { id: "dpd", name: "DPD" };

let server, browser;

async function setup(page, antwort, { uhr = null } = {}) {
  const p = { calc: 0, bodies: [] };
  if (uhr) await page.clock.setFixedTime(new Date(uhr));
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
      try { p.bodies.push(JSON.parse(route.request().postData() || "{}")); } catch { p.bodies.push({}); }
      return json({ ceShipmentId: 4998, customsRequired: false, exportDeclaration: null, ...antwort });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const kartenIds = (page) => page.locator(".offer-card button.offer-details-link").evaluateAll(
  (knoepfe) => knoepfe.map((k) => k.getAttribute("aria-controls").replace("offer-details-", "")));
const namen = async (page) => (await page.locator(".offer-card .offer-service-type").allTextContents()).map(norm).sort();

async function neueSeite(viewport = { width: 1440, height: 1100 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

/* Ein Formularfilter (Abholung/Abgabe, Versandart) über sein sichtbares Bedienelement — vor der Berechnung. */
async function waehleFormularfilter(page, titel, option) {
  const ausloeser = page.locator(".service-filter-trigger",
    { has: page.locator(".service-filter-trigger-title", { hasText: new RegExp(`^${titel}$`) }) });
  await ausloeser.click();
  const gruppe = page.locator(`[role="radiogroup"][aria-label="${titel}"]`);
  await gruppe.waitFor({ state: "visible", timeout: 10000 });
  await gruppe.locator(".service-filter-option",
    { has: page.locator(".service-filter-option-label", { hasText: new RegExp(`^${option}$`) }) }).click();
  await gruppe.waitFor({ state: "detached", timeout: 10000 });
}

async function zuDenAngeboten(page, { empfaenger = STANDARD_EMPFAENGER, filter = [] } = {}) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { empfaenger, paket: { ...STANDARD_PAKET, packageCount: "1" } });
  for (const [titel, option] of filter) await waehleFormularfilter(page, titel, option);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

/* Lieferzeitfilter: dieselbe Bedienung wie deliveryTimeFilter (Chip → Kalendertag → Uhrzeitliste). */
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
const oeffneLieferzeit = (page) =>
  page.locator(".offers-filter-chip", { hasText: "Lieferung" }).click()
    .then(() => page.waitForSelector(".offers-delivery-dropdown", { timeout: 10000 }));
async function waehleUhrzeit(page, text) {
  await page.evaluate(() => Promise.all(
    (document.querySelector(".offers-delivery-dropdown")?.getAnimations() || []).map((a) => a.finished.catch(() => {}))));
  await scrollBeruhigt(page);
  await page.locator(".offers-time-trigger").click();
  await page.waitForSelector(".offers-time-list", { timeout: 10000 });
  await scrollBeruhigt(page);
  await page.locator(".offers-time-option", { hasText: text }).first().click();
  await page.waitForSelector(".offers-time-list", { state: "detached", timeout: 10000 });
}
const hinweisKarten = async (page) => page.locator(".offer-card:has(.offer-deadline-note)")
  .evaluateAll((karten) => karten.map((k) => k.querySelector("button.offer-details-link").getAttribute("aria-controls")
    .replace("offer-details-", "")).sort());

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", detached: true });
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
  if (server) {
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits node startet.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("A — DE→DE, Versandart Express: Anfrage „express“, kuratierte Namen beider Quellen", async () => {
  const { page, fehler } = await neueSeite();
  const tarife = [
    J(3263, UPS, "Express 12:00", "express", 24), J(3260, DHL, "Express National 9:00", "express", 29),
    T(85, "dhl", "Domestic Express 9:00", 27), T(49, "tnt", "Express 12:00", 26),
  ];
  const p = await setup(page, { tariffs: tarife, availableShippingModes: ["express", "standard"],
    publicCarriers: [UPS, DHL, TNT], fromCountryCode: "DE", toCountryCode: "DE" });
  await zuDenAngeboten(page, { filter: [["Versandart", "Express"]] });
  assert.equal(p.bodies[0].shippingModeFilter, "express", "die Versandart wurde nicht gesendet");
  assert.deepEqual((await kartenIds(page)).sort(), tarife.map((t) => t.offerId).sort());
  assert.deepEqual(await namen(page), ["Domestic Express 9:00", "Express 12:00", "Express 12:00", "Express National 9:00"]);
  // Kein Klassenname: die kuratierten Namen ersetzen „Expressversand“.
  assert.equal(await page.locator(".offer-service-type", { hasText: /^Expressversand$/ }).count(), 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — DE→FR, Versandart Economy: JUMiNGO 3144 und TG 107/41 als Economy", async () => {
  const { page, fehler } = await neueSeite();
  const tarife = [
    J(3144, TNT, "Economy Express", "economy", 21), J(3072, DHL, "Economy", "economy", 19, { serviceType: "dropoff" }),
    T(107, "dhl", "Economy Select", 20), T(41, "tnt", "Economy Express", 22),
  ];
  const p = await setup(page, { tariffs: tarife, availableShippingModes: ["economy", "express", "standard"],
    publicCarriers: [DHL, TNT], fromCountryCode: "DE", toCountryCode: "FR" });
  const empfaenger = { ...STANDARD_EMPFAENGER, country: "FR", zip: "75001", city: "Paris", street: "Rue de Rivoli 1",
                       phone: "+33140000000" };
  await zuDenAngeboten(page, { empfaenger, filter: [["Versandart", "Economy"]] });
  assert.equal(p.bodies[0].shippingModeFilter, "economy", "die Versandart wurde nicht gesendet");
  assert.equal(p.bodies[0].recipient && p.bodies[0].recipient.country, "FR");
  assert.deepEqual((await kartenIds(page)).sort(), tarife.map((t) => t.offerId).sort());
  assert.deepEqual(await namen(page), ["Economy", "Economy Express", "Economy Express", "Economy Select"]);
  assert.equal(norm(await karteVon(page, tarife[0]).locator(".offer-carrier-name").textContent()), "TNT");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — Nur Abgabe: Anfrage „dropoff“, JUMiNGO-Shoptarif und TG 124 als Shopabgabe", async () => {
  const { page, fehler } = await neueSeite();
  const tarife = [
    J(3205, DPD, "Standard Paketshop", "standard", 6, { serviceType: "dropoff" }),
    T(124, "dpd", "PaketShop", 5, { serviceType: "dropoff" }),
  ];
  const p = await setup(page, { tariffs: tarife, availableShippingModes: ["standard"], publicCarriers: [DPD],
    fromCountryCode: "DE", toCountryCode: "DE" });
  await zuDenAngeboten(page, { filter: [["Abholung / Shopabgabe", "Nur Abgabe"]] });
  assert.equal(p.bodies[0].serviceFilter, "dropoff", "der Abgabefilter wurde nicht gesendet");
  assert.deepEqual((await kartenIds(page)).sort(), tarife.map((t) => t.offerId).sort());
  const uebergaben = (await page.locator(".offer-card .offer-handover").allTextContents()).map(norm);
  assert.equal(uebergaben.length, 2);
  assert.equal(new Set(uebergaben).size, 1, `verschiedene Übergabearten: ${uebergaben.join(" / ")}`);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — Späteste Lieferzeit: zu spät verschwindet, ohne Anbietertermin sichtbar mit Hinweis (K2)", async () => {
  const { page, fehler } = await neueSeite();
  const FRIST = `2026-08-${LIEFERFRIST_TAG}`;
  const j12 = J(3263, UPS, "Express 12:00", "express", 24, { deliveryDate: FRIST, deliveryDateMin: FRIST, deliveryDateMax: FRIST, deliveryTimeUntil: "12:00" });
  const jSpaet = J(3257, UPS, "Standard", "standard", 12, { deliveryDate: "2026-09-02", deliveryDateMin: "2026-09-02", deliveryDateMax: "2026-09-02", deliveryTimeUntil: "17:00" });
  const jOhneZeit = J(3256, DHL, "Express National", "express", 28, { deliveryDate: FRIST, deliveryDateMin: FRIST, deliveryDateMax: FRIST, deliveryTimeUntil: null });
  const j9 = J(3260, DHL, "Express National 9:00", "express", 31, { deliveryDate: FRIST, deliveryDateMin: FRIST, deliveryDateMax: FRIST, deliveryTimeUntil: "09:00" });
  const t85 = T(85, "dhl", "Domestic Express 9:00", 27);
  const t47 = T(47, "tnt", "Express 9:00", 30, { bookable: false, unavailableReason: "quote_only" });
  const alle = [j12, jSpaet, jOhneZeit, j9, t85, t47];
  const p = await setup(page, { tariffs: alle, availableShippingModes: ["express", "standard"],
    publicCarriers: [UPS, DHL, TNT], fromCountryCode: "DE", toCountryCode: "DE" }, { uhr: VERSANDZEITPUNKT });
  await zuDenAngeboten(page);

  // Ohne Filter: alle sechs, KEIN Hinweis — auch nicht an den Angeboten ohne Termin.
  assert.equal((await kartenIds(page)).length, 6);
  assert.equal(await page.locator(".offer-deadline-note").count(), 0, "Hinweis ohne gesetzten Filter");

  // Nur Datum: der nachweislich spätere Tarif fällt; die Transglobal-Angebote bleiben MIT Hinweis.
  await oeffneLieferzeit(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: new RegExp(`^${LIEFERFRIST_TAG}$`) }).first().click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 5, null, { timeout: 10000 });
  assert.deepEqual((await kartenIds(page)).sort(), [j12, jOhneZeit, j9, t85, t47].map((t) => t.offerId).sort());
  assert.deepEqual(await hinweisKarten(page), [t85.offerId, t47.offerId].sort());
  for (const text of await page.locator(".offer-deadline-note").allTextContents()) assert.equal(norm(text), HINWEIS);

  // Datum + 10:00: „bis 12:00“ ist belegt zu spät und fällt; ohne Uhrzeit am Stichtag → sichtbar mit Hinweis.
  await page.waitForFunction(
    () => document.querySelector(".offers-time-trigger") && !document.querySelector(".offers-time-trigger").disabled,
    null, { timeout: 10000 });
  await waehleUhrzeit(page, "10:00 Uhr");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 4, null, { timeout: 10000 });
  assert.deepEqual((await kartenIds(page)).sort(), [jOhneZeit, j9, t85, t47].map((t) => t.offerId).sort());
  assert.deepEqual(await hinweisKarten(page), [jOhneZeit, t85, t47].map((t) => t.offerId).sort());
  // Kein erfundener Termin: die Transglobal-Karte nennt weiterhin kein Lieferdatum aus Name oder Rechnung.
  assert.ok(!/09:00 Uhr|9:00 Uhr/.test(norm(await karteVon(page, t85).locator(".offer-tl-node--end").textContent())),
    "eine Uhrzeit aus dem Tarifnamen erscheint als Zustelltermin");

  // Zurücksetzen: alle sechs zurück, kein Hinweis — und nie ein neuer Preisrequest.
  await page.locator(".offers-filter-reset-btn").click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 6, null, { timeout: 10000 });
  assert.equal(await page.locator(".offer-deadline-note").count(), 0);
  assert.equal(p.calc, 1, "der Lieferzeitfilter hat neu berechnet");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("S — Samstagszustellung: Detailzeile nur am Tarif mit Providerflag, Name trägt die Unterscheidung", async () => {
  const { page, fehler } = await neueSeite();
  const samstag = J(3588, UPS, "Standard Samstagszustellung", "standard", 15, { deliveryOnSaturday: true });
  const normal = J(3264, UPS, "Standard", "standard", 11);
  await setup(page, { tariffs: [samstag, normal], availableShippingModes: ["standard"], publicCarriers: [UPS],
    fromCountryCode: "DE", toCountryCode: "DE" });
  await zuDenAngeboten(page);
  const zeileVon = async (t) => {
    const karte = karteVon(page, t);
    await karte.locator("button.offer-details-link").click();
    await page.locator(`#offer-details-${t.offerId}`).waitFor({ state: "visible", timeout: 10000 });
    return karte.locator(".offer-feature", { has: page.locator(".offer-feature-label", { hasText: /^Samstagszustellung$/ }) });
  };
  const ja = await zeileVon(samstag);
  assert.equal(await ja.count(), 1, "die Samstagszeile fehlt");
  assert.equal(norm(await ja.locator(".offer-feature-value").textContent()), "Ja");
  assert.equal(await (await zeileVon(normal)).count(), 0, "Samstagszeile ohne Providerflag");
  // Auf der Kartenfläche steht die Zusage genau einmal: im Namen.
  assert.equal(norm(await karteVon(page, samstag).locator(".offer-service-type").textContent()), "Standard Samstagszustellung");
  assert.deepEqual(fehler, []);
  await page.close();
});
