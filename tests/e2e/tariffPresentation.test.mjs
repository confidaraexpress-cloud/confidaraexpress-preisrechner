// E2E: Go-Live Block B (Betreiberentscheidungen K1–K4, 2026-10-02) — Tarifnamen, Economy, Lieferzeitfilter,
// Samstagszustellung. Echter Dev-Server, echter Browser, gemocktes Backend.
//
// Versandart und Abholung/Abgabe filtert der SERVER (dort gemessen: go-live-tariff-presentation im Backend).
// Hier wird gemessen, dass die Oberfläche die Auswahl sendet und die kuratierten Namen beider Quellen
// unverändert zeigt — und dass der rein clientseitige Lieferzeitfilter K2 einhält.
//
//   A  DE→DE, Versandart Express  → Anfrage „express"; JUMiNGO- und Transglobal-Expressangebote mit ihren Namen
//   B  DE→FR, Alle Versandarten   → drei Optionen ohne „Economy" (Gesamtauftrag F); Anfrage „all"; JUMiNGO
//                                    „Economy Express", TG „Economy Select"/„Economy Express" erscheinen darunter
//   C  Nur Abgabe                  → Anfrage „dropoff"; JUMiNGO-Shoptarif und TG 124 „PaketShop" als Shopabgabe
//   D  Späteste Lieferzeit (TG-L2) → Gruppen „Passend" / „Voraussichtlich passend" / „Frist nicht bestätigt",
//                                    „Zu spät" eingeklappt und aufklappbar; DHL 12:00 passt zu 12:00, nicht zu 10:00;
//                                    ohne Filter keine Gruppen; kein neuer Preisrequest
//   S  Samstagszustellung          → Detailzeile nur am Tarif mit Providerflag, Name trägt die Unterscheidung
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

const PORT = 5446, BASE = `http://127.0.0.1:${PORT}`;

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
// Die Angebote einer Fristgruppe (TG-L2) in der Reihenfolge der Liste.
const gruppenIds = (page, gruppe) => page.locator(`[data-offers-group="${gruppe}"] .offer-card button.offer-details-link`)
  .evaluateAll((knoepfe) => knoepfe.map((k) => k.getAttribute("aria-controls").replace("offer-details-", "")));

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
  if (server) {
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits node startet.
    stopDevServer(server, "SIGKILL");
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

test("B — DE→FR, Alle Versandarten: keine Economy-Option, JUMiNGO 3144 und TG 107/41 erscheinen unter „Alle“", async () => {
  const { page, fehler } = await neueSeite();
  const tarife = [
    J(3144, TNT, "Economy Express", "economy", 21), J(3072, DHL, "Economy", "economy", 19, { serviceType: "dropoff" }),
    T(107, "dhl", "Economy Select", 20), T(41, "tnt", "Economy Express", 22),
  ];
  const p = await setup(page, { tariffs: tarife, availableShippingModes: ["economy", "express", "standard"],
    publicCarriers: [DHL, TNT], fromCountryCode: "DE", toCountryCode: "FR" });
  const empfaenger = { ...STANDARD_EMPFAENGER, country: "FR", zip: "75001", city: "Paris", street: "Rue de Rivoli 1",
                       phone: "+33140000000" };
  // Gesamtauftrag F (2026-10-24): die Versandart kennt nur noch drei Optionen. Die Economy-Produkte bleiben
  // angeboten — sie erscheinen unter „Alle Versandarten" (die Tarifklassifizierung ist unverändert).
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { empfaenger, paket: { ...STANDARD_PAKET, packageCount: "1" } });
  await page.locator(".service-filter-trigger",
    { has: page.locator(".service-filter-trigger-title", { hasText: /^Versandart$/ }) }).click();
  const optionen = page.locator('[role="radiogroup"][aria-label="Versandart"]');
  await optionen.waitFor({ state: "visible", timeout: 10000 });
  assert.deepEqual((await optionen.locator(".service-filter-option-label").allTextContents()).map(norm),
    ["Alle Versandarten", "Standard", "Express"], "die Versandart bietet noch eine Economy-Option an");
  await optionen.locator(".service-filter-option",
    { has: page.locator(".service-filter-option-label", { hasText: /^Alle Versandarten$/ }) }).click();
  await optionen.waitFor({ state: "detached", timeout: 10000 });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(p.bodies[0].shippingModeFilter, "all", "die Versandart wurde nicht als „all“ gesendet");
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

test("D — Späteste Lieferzeit (TG-L2): vier Gruppen, „Zu spät“ eingeklappt; DHL 12:00 passt zu 12:00, nicht zu 10:00", async () => {
  const { page, fehler } = await neueSeite();
  const FRIST = `2026-08-${LIEFERFRIST_TAG}`;
  const j12 = J(3263, UPS, "Express 12:00", "express", 24, { deliveryDate: FRIST, deliveryDateMin: FRIST, deliveryDateMax: FRIST, deliveryTimeUntil: "12:00" });
  const jSpaet = J(3257, UPS, "Standard", "standard", 12, { deliveryDate: "2026-09-02", deliveryDateMin: "2026-09-02", deliveryDateMax: "2026-09-02", deliveryTimeUntil: "17:00" });
  const jOhneZeit = J(3256, DHL, "Express National", "express", 28, { deliveryDate: FRIST, deliveryDateMin: FRIST, deliveryDateMax: FRIST, deliveryTimeUntil: null });
  const j9 = J(3260, DHL, "Express National 9:00", "express", 31, { deliveryDate: FRIST, deliveryDateMin: FRIST, deliveryDateMax: FRIST, deliveryTimeUntil: "09:00" });
  // Transglobal mit Prognose des Servers (TG-L1): ein Tag, die belegte Zeitleistung in `timeUntil`.
  const t85 = T(85, "dhl", "Domestic Express 9:00", 27, { transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
    deliveryProjection: { kind: "estimated", dateMin: FRIST, dateMax: FRIST, timeUntil: "09:00" } });
  const t87 = T(87, "dhl", "Domestic Express 12:00", 25, { transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
    deliveryProjection: { kind: "estimated", dateMin: FRIST, dateMax: FRIST, timeUntil: "12:00" } });
  // Ohne Prognose und ohne Anbieterdatum: die Frist ist nicht bestätigt — sichtbar, getrennt.
  const t47 = T(47, "tnt", "Express 9:00", 30, { bookable: false, unavailableReason: "quote_only" });
  const alle = [j12, jSpaet, jOhneZeit, j9, t85, t87, t47];
  const ids = (liste) => liste.map((t) => t.offerId);
  const p = await setup(page, { tariffs: alle, availableShippingModes: ["express", "standard"],
    publicCarriers: [UPS, DHL, TNT], fromCountryCode: "DE", toCountryCode: "DE" }, { uhr: VERSANDZEITPUNKT });
  await zuDenAngeboten(page);

  // Ohne Filter: alle sieben in einer Liste, keine Gruppen. Die Prognose heißt „Voraussichtliche Zustellung", die
  // belegte Uhrzeit steht im grünen Feld — dieselbe Karte wie bei der Anbieterzeit.
  assert.equal((await kartenIds(page)).length, 7);
  assert.equal(await page.locator("[data-offers-group]").count(), 0, "Gruppen ohne gesetzten Filter");
  const ende85 = karteVon(page, t85).locator(".offer-tl-node--end");
  assert.equal(norm(await ende85.locator(".offer-tl-title").textContent()), "Voraussichtliche Zustellung");
  assert.equal(norm(await ende85.locator(".offer-early-note").textContent()), "Lieferung bis 09:00 Uhr");
  assert.equal(norm(await karteVon(page, j9).locator(".offer-tl-node--end .offer-early-note").textContent()),
    "Lieferung bis 09:00 Uhr");

  // Nur Datum: bestätigt / voraussichtlich / nicht bestätigt; der belegt spätere Tarif eingeklappt unter „Zu spät".
  await oeffneLieferzeit(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: new RegExp(`^${LIEFERFRIST_TAG}$`) }).first().click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 6, null, { timeout: 10000 });
  assert.deepEqual(await gruppenIds(page, "confirmed"), ids([j12, jOhneZeit, j9]));
  assert.deepEqual(await gruppenIds(page, "projected"), ids([t85, t87]));
  assert.deepEqual(await gruppenIds(page, "unconfirmed"), ids([t47]));
  assert.deepEqual(await gruppenIds(page, "late"), [], "„Zu spät“ ist nicht eingeklappt");
  const aufklapper = page.locator(".offers-late-toggle");
  assert.equal(norm(await aufklapper.textContent()), "1 Angebot stellt nach Ihrer Frist zu – anzeigen");
  assert.equal(await aufklapper.getAttribute("aria-expanded"), "false");
  assert.deepEqual((await page.locator(".offers-group-title .offers-group-name").allTextContents()).map(norm),
    ["Passend", "Voraussichtlich passend", "Frist nicht bestätigt"]);

  // Datum + 10:00: „bis 12:00" ist zu spät — beim Anbieter (UPS) wie bei der belegten Zeitleistung (DHL 87); die
  // 09:00-Produkte passen; ohne Uhrzeit am Stichtag nicht bestätigt.
  await page.waitForFunction(
    () => document.querySelector(".offers-time-trigger") && !document.querySelector(".offers-time-trigger").disabled,
    null, { timeout: 10000 });
  await waehleUhrzeit(page, "10:00 Uhr");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 4, null, { timeout: 10000 });
  assert.deepEqual(await gruppenIds(page, "confirmed"), ids([j9]));
  assert.deepEqual(await gruppenIds(page, "projected"), ids([t85]));
  assert.deepEqual(await gruppenIds(page, "unconfirmed"), ids([jOhneZeit, t47]));
  assert.equal(norm(await aufklapper.textContent()), "3 Angebote stellen nach Ihrer Frist zu – anzeigen");
  // Aufklappen: die zu späten Angebote in eigener Gruppe, in der Reihenfolge der Liste; zuklappen.
  await aufklapper.click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 7, null, { timeout: 10000 });
  assert.equal(await aufklapper.getAttribute("aria-expanded"), "true");
  assert.deepEqual(await gruppenIds(page, "late"), ids([j12, jSpaet, t87]));
  assert.equal(norm(await aufklapper.textContent()), "Zu späte Angebote ausblenden");
  await aufklapper.click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 4, null, { timeout: 10000 });

  // 12:00: die DHL 12:00 passt jetzt (voraussichtlich), „Zu spät" ist mit der neuen Frist wieder eingeklappt.
  await oeffneLieferzeit(page);
  await waehleUhrzeit(page, "12:00 Uhr");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 6, null, { timeout: 10000 });
  assert.deepEqual(await gruppenIds(page, "confirmed"), ids([j12, j9]));
  assert.deepEqual(await gruppenIds(page, "projected"), ids([t85, t87]));
  assert.equal(await aufklapper.getAttribute("aria-expanded"), "false");

  // Zurücksetzen: alle sieben zurück, keine Gruppen — und nie ein neuer Preisrequest.
  await page.locator(".offers-filter-reset-btn").click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 7, null, { timeout: 10000 });
  assert.equal(await page.locator("[data-offers-group]").count(), 0);
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
