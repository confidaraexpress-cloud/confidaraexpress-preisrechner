// E2E: Lieferzeitfilter — ein Druck auf Scrollbalken, Innenabstand oder Rand der Uhrzeitliste schließt das
// Lieferungs-Dropdown NICHT (Fehleranalyse 2026-10-23, Befund H7). Echter Dev-Server, echter Browser, gemocktes Backend.
//
// Die Uhrzeitliste (DeliveryTimeSelect) hängt als Portal an document.body. Unten schloss der Außenklick der
// Filterzone (OffersList) bei jedem mousedown, dessen Ziel kein DOM-Nachfahre der Zone war — also auch auf dem
// Scrollbalken und dem Innenabstand der Liste. Optionen waren geschützt (sie wählen vorher selbst), diese Flächen
// nicht: das Dropdown verschwand, die Uhrzeit blieb ungesetzt. Oben (ShipmentFilterBar) gibt es keinen solchen
// Zonen-Listener; dort trat der Fehler nie auf. Bis hierher drückte keine Suite auf etwas anderes als eine Option,
// und Playwright zeichnet headless keine Scrollbalken (`--hide-scrollbars`) — der Weg war in CI unsichtbar.
//
//   P1  unten: Innenabstand und Rand der Liste → Dropdown und Liste bleiben; danach 18:00 → Chip, oben und Gruppen
//   P2  unten: Scrollbalken greifen und ziehen (Browser MIT Scrollbalken) → Liste scrollt, Dropdown bleibt; 18:00
//   P3  Versandkostenrechner: Innenabstand und Scrollbalken (dieselbe OffersList)
//   P4  Außenklick schließt weiterhin; Innenklick nicht; ein Druck neben die offene Liste schließt nur die Liste
//   P5  oben (Gegenprobe): Innenabstand und Scrollbalken halten die Liste offen, 18:00 wählbar
//   P6  Mausrad und Tastatur unten: Liste scrollt bzw. wird per Pfeiltasten bedient, die Wahl wirkt sofort
//   P7  Reihenfolge und schneller Wechsel: unten zuerst, oben, unten zurücksetzen — ein Zustand, keine Preisanfrage
//   P8  Touch 390 und 768: Wischen in der Liste schließt nichts, Tipp auf eine Uhrzeit wählt sie
//
// Bedienung der Portal-Liste per Koordinate, nachdem die Seite ruht: `locator.click()` scrollt mit
// `html { scroll-behavior: smooth }` erst NACH dem Klick sanft nach (gemessen 641 px), und die fixierte Liste folgt
// ihrem Auslöser — eine danach gemessene Klickstelle läge daneben. Kein `force`, nichts wird erzwungen.
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

const PORT = 5575, BASE = `http://127.0.0.1:${PORT}`;

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
const preis = (netto) => ({ netPrice: netto, vatAmount: Number((netto * 0.19).toFixed(2)),
                            finalPrice: Number((netto * 1.19).toFixed(2)), currency: "EUR" });
const FRIST = `2026-08-${LIEFERFRIST_TAG}`;
const FRIST_DE = `${LIEFERFRIST_TAG}.08.2026`;

/* Ein JUMiNGO-Tarif mit Anbieterterminen. */
const J = (id, carrier, name, netto, termin, zeit, extra = {}) => ({
  id, shipper_tariff_id: id, offerId: kennung("pkj", String(id)),
  publicCarrierId: carrier.id, publicCarrierName: carrier.name, publicServiceName: name, serviceType: "pickup",
  shippingMode: "express", transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
  deliveryDate: termin, deliveryDateMin: termin, deliveryDateMax: termin, deliveryTimeUntil: zeit,
  trackingAvailable: true, printerRequired: false, bookable: true, unavailableReason: null, requiredPriceInputs: [],
  ...preis(netto), ...extra,
});
/* Ein Transglobal-Angebot mit der Prognose des Servers (TG-L1). */
const T = (sid, carrier, name, netto, prognose, extra = {}) => ({
  offerId: kennung("pkt", String(sid)), publicCarrierId: carrier, publicServiceName: name, serviceType: "pickup",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null, deliveryTimeUntil: null,
  transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
  deliveryProjection: prognose ? { kind: "estimated", timeUntil: null, ...prognose } : null,
  bookable: true, unavailableReason: null, requiredPriceInputs: [], ...preis(netto), ...extra,
});
const UPS = { id: "ups", name: "UPS" }, DHL = { id: "dhl", name: "DHL Express" };

// Bestätigt (09:00), zu spät (02.09., 17:00), voraussichtlich mit belegter Uhrzeit (12:00), Prognose ohne Uhrzeit.
// Die Uhrzeitliste trägt damit das Raster plus 17:00 — mehr Zeilen, als ohne eigenes Scrollen sichtbar sind.
const j9 = J(3260, DHL, "Express National 9:00", 31, FRIST, "09:00");
const jSpaet = J(3257, UPS, "Standard", 12, "2026-09-02", "17:00", { shippingMode: "standard", transitDaysMax: 3 });
const t87 = T(87, "dhl", "Domestic Express 12:00", 25, { dateMin: FRIST, dateMax: FRIST, timeUntil: "12:00" });
const t84 = T(84, "dhl", "Domestic Express", 22, { dateMin: FRIST, dateMax: FRIST });
const ALLE = [j9, jSpaet, t87, t84];

let server, browser, browserMitScrollbalken;

async function setup(page) {
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
      return json({ ceShipmentId: 5101, customsRequired: false, exportDeclaration: null,
                    availableShippingModes: ["express", "standard"], publicCarriers: [UPS, DHL],
                    fromCountryCode: "DE", toCountryCode: "DE", tariffs: ALLE });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function neueSeite(b, { viewport = { width: 1440, height: 1000 }, touch = false } = {}) {
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: "de-DE", timezoneId: "Europe/Berlin" });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  const p = await setup(page);
  return { ctx, page, fehler, p };
}

async function zuDenAngeboten(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { empfaenger: STANDARD_EMPFAENGER, paket: { ...STANDARD_PAKET, packageCount: "1" } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

async function zumRechner(page) {
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await page.fill("#calc-from-zip", "97421");
  await page.fill("#calc-to-zip", "63743");
  await page.fill("#calc-from-city", "Schweinfurt");
  await page.fill("#calc-to-city", "Aschaffenburg");
  await page.fill("#calc-weight", "3");
  await page.fill("#calc-packageCount", "1");
  await page.fill("#calc-length", "10");
  await page.fill("#calc-width", "10");
  await page.fill("#calc-height", "10");
  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

/* Wartet, bis keine Scrollfahrt mehr läuft und die Wirtsflächen ihre Öffnungsanimation beendet haben (nur endliche
   Animationen — eine endlose, etwa ein Ladeindikator, hätte nie ein `finished`). */
async function ruhe(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => { const t = a.effect && a.effect.getComputedTiming(); return t && Number.isFinite(t.endTime); })
    .map((a) => a.finished.catch(() => {}))));
  await page.evaluate(() => new Promise((fertig) => {
    let letzte = window.scrollY, ruhig = 0, n = 0;
    const tick = () => {
      if (window.scrollY === letzte) ruhig += 1;
      else { ruhig = 0; letzte = window.scrollY; }
      if (ruhig >= 5 || (n += 1) > 240) return fertig();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

/* Klick bzw. Tipp auf die Mitte eines Elements — nach Ruhe der Seite und mit Treffertest. */
async function betaetige(page, locator, touch = false) {
  await locator.waitFor({ state: "visible", timeout: 10000 });
  await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: "center", behavior: "instant" });
  });
  await ruhe(page);
  const p = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const t = document.elementFromPoint(x, y);
    return { x, y, ok: !!t && (t === el || el.contains(t)) };
  });
  assert.ok(p.ok, "das Ziel liegt an der Klickstelle nicht oben");
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

const dropdownUnten = (page) => page.locator(".offers-delivery-dropdown");
const liste = (page) => page.locator('.offers-time-list[role="listbox"]');
const chip = (page) => page.locator(".offers-filter-chip", { hasText: "Lieferung" }).first();
const chipText = async (page) => norm(await chip(page).textContent());
const obenAusloeser = (page) => page.locator(".service-filter-trigger",
  { has: page.locator(".service-filter-trigger-title", { hasText: /^Späteste Lieferzeit$/ }) });
const obenWert = async (page) => norm(await obenAusloeser(page).locator(".service-filter-trigger-val").textContent());
const gruppenIds = (page, gruppe) => page.locator(`[data-offers-group="${gruppe}"] .offer-card button.offer-details-link`)
  .evaluateAll((knoepfe) => knoepfe.map((k) => k.getAttribute("aria-controls").replace("offer-details-", "")));

async function untenOeffnen(page, touch = false) {
  if (await dropdownUnten(page).count() === 0) await betaetige(page, chip(page), touch);
  await dropdownUnten(page).waitFor({ state: "visible", timeout: 10000 });
}
async function untenFristtag(page, touch = false) {
  await untenOeffnen(page, touch);
  await betaetige(page, dropdownUnten(page).locator(".dc-day", { hasText: new RegExp(`^${LIEFERFRIST_TAG}$`) }).first(), touch);
  await page.waitForFunction((t) => document.querySelector(".offers-filter-chip")
    && [...document.querySelectorAll(".offers-filter-chip")].some((c) => c.textContent.includes(t)), FRIST_DE, { timeout: 10000 });
}
async function obenOeffnen(page) {
  if (await page.locator(".date-picker-body--latest").count() === 0) await betaetige(page, obenAusloeser(page));
  await page.locator(".date-picker-body--latest").waitFor({ state: "visible", timeout: 10000 });
}
async function obenFristtag(page) {
  await obenOeffnen(page);
  await betaetige(page, page.locator(".date-picker-body--latest .dc-day", { hasText: new RegExp(`^${LIEFERFRIST_TAG}$`) }).first());
}

/* Öffnet die Uhrzeitliste über ihren Auslöser (stabile id) und wartet, bis Seite und Liste ruhen. */
async function listeOeffnen(page, ausloeserId, touch = false) {
  const ausloeser = page.locator(`#${ausloeserId}`);
  await page.waitForFunction((id) => document.getElementById(id) && !document.getElementById(id).disabled, ausloeserId,
    { timeout: 10000 });
  await betaetige(page, ausloeser, touch);
  await liste(page).waitFor({ state: "visible", timeout: 10000 });
  await ruhe(page);
  await frames(page);
}

/* Lage der offenen Liste: Rechteck, Scrollbalkenbreite (ohne den 1-px-Rand je Seite), Scrollmaße. */
const listenMass = (page) => liste(page).evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
           scrollbalken: el.offsetWidth - el.clientWidth - 2, scrollTop: el.scrollTop,
           eigenesScrollen: el.scrollHeight > el.clientHeight };
});
/* Was liegt an einer Stelle oben? „UL" heißt: die Liste selbst, keine Option. */
const zielAn = (page, x, y) => page.evaluate(([px, py]) => {
  const t = document.elementFromPoint(px, py);
  if (!t) return null;
  if (t.closest(".offers-time-option")) return "Option";
  return t.matches(".offers-time-list") ? "UL" : `${t.tagName}.${String(t.className).split(" ")[0]}`;
}, [x, y]);

async function druecke(page, x, y, { touch = false, ziehenUm = 0 } = {}) {
  if (touch) return page.touchscreen.tap(x, y);
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (ziehenUm) await page.mouse.move(x, y + ziehenUm, { steps: 6 });
  await page.mouse.up();
}

/* Wählt eine Option wie ein Mensch: liegt sie außerhalb des sichtbaren Ausschnitts, scrollt die LISTE (nicht die
   Seite), dann Klick bzw. Tipp auf ihre Mitte. Wartet, bis sich die Liste nach der Wahl geschlossen hat. */
async function optionWaehlen(page, beschriftung, touch = false) {
  const option = liste(page).locator('[role="option"]', { hasText: new RegExp(`^${beschriftung}$`) });
  await option.evaluate((el) => {
    const l = el.closest(".offers-time-list");
    const rl = l.getBoundingClientRect(), ro = el.getBoundingClientRect();
    if (ro.top < rl.top + 4) l.scrollTop -= rl.top + 4 - ro.top;
    else if (ro.bottom > rl.bottom - 4) l.scrollTop += ro.bottom - (rl.bottom - 4);
  });
  await frames(page);
  const p = await option.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const t = document.elementFromPoint(x, y);
    return { x, y, ok: !!t && (t === el || el.contains(t)) };
  });
  assert.ok(p.ok, `Option „${beschriftung}" liegt nicht oben`);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await liste(page).waitFor({ state: "detached", timeout: 10000 });
}

/* Nach „Datum + 18:00": Chip, oberes Feld und Gruppen — die Wahl wirkt sofort und an beiden Stellen. */
async function pruefeFrist1800(page) {
  await page.waitForFunction((t) => [...document.querySelectorAll(".offers-filter-chip")].some((c) => c.textContent.includes(t)),
    `${FRIST_DE}, 18:00`, { timeout: 10000 });
  assert.equal(await chipText(page), `Lieferung bis ${FRIST_DE}, 18:00`);
  assert.match(await obenWert(page), /· 18:00$/);
  assert.deepEqual(await gruppenIds(page, "confirmed"), [j9.offerId]);
  assert.deepEqual(await gruppenIds(page, "projected"), [t87.offerId]);
  assert.deepEqual(await gruppenIds(page, "unconfirmed"), [t84.offerId]);
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
  // Zweiter Browser MIT Scrollbalken: Playwright startet Chromium headless sonst mit `--hide-scrollbars`.
  browserMitScrollbalken = await chromium.launch({ executablePath: chromiumExecutablePath(),
                                                   ignoreDefaultArgs: ["--hide-scrollbars"] });
});

test.after(async () => {
  if (browser) await browser.close();
  if (browserMitScrollbalken) await browserMitScrollbalken.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("P1 — unten: Innenabstand und Rand der Uhrzeitliste schließen das Dropdown nicht; danach wirkt 18:00 sofort", async () => {
  const { ctx, page, fehler, p } = await neueSeite(browser);
  await zuDenAngeboten(page);
  await untenFristtag(page);
  await listeOeffnen(page, "offers-dd-zeit");
  const m = await listenMass(page);
  for (const [stelle, x, y] of [
    ["Innenabstand oben", m.left + m.width / 2, m.top + 2.5],
    ["Innenabstand links", m.left + 2.5, m.top + m.height / 2],
    ["Rand links", m.left + 0.5, m.top + m.height / 2],
  ]) {
    assert.equal(await zielAn(page, x, y), "UL", `${stelle}: dort liegt keine Listenfläche`);
    await druecke(page, x, y);
    await frames(page);
    assert.equal(await dropdownUnten(page).count(), 1, `${stelle}: das Lieferungs-Dropdown hat sich geschlossen`);
    assert.equal(await liste(page).count(), 1, `${stelle}: die Uhrzeitliste hat sich geschlossen`);
    assert.equal(norm(await page.locator("#offers-dd-zeit").textContent()), "Beliebig", `${stelle}: Uhrzeit verändert`);
  }
  await optionWaehlen(page, "18:00 Uhr");
  await pruefeFrist1800(page);
  assert.equal(p.calc, 1, "die Bedienung des Lieferzeitfilters hat eine Preisanfrage ausgelöst");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("P2 — unten, echter Scrollbalken: Daumen ziehen scrollt die Liste, das Dropdown bleibt, 18:00 wirkt", async () => {
  const { ctx, page, fehler, p } = await neueSeite(browserMitScrollbalken);
  await zuDenAngeboten(page);
  await untenFristtag(page);
  await listeOeffnen(page, "offers-dd-zeit");
  const m = await listenMass(page);
  assert.ok(m.eigenesScrollen, "Vorbedingung: die Liste braucht eigenes Scrollen");
  assert.ok(m.scrollbalken >= 8, `Vorbedingung: der Prüfbrowser zeichnet einen Scrollbalken (${m.scrollbalken} px)`);
  const x = m.right - 1 - m.scrollbalken / 2, y = m.top + 30;
  assert.equal(await zielAn(page, x, y), "UL", "auf dem Scrollbalken liegt die Liste selbst");
  await druecke(page, x, y, { ziehenUm: 60 });
  await frames(page);
  assert.equal(await dropdownUnten(page).count(), 1, "der Scrollbalken hat das Lieferungs-Dropdown geschlossen");
  assert.equal(await liste(page).count(), 1, "der Scrollbalken hat die Uhrzeitliste geschlossen");
  assert.ok((await listenMass(page)).scrollTop > 0, "die Liste hat sich über den Scrollbalken nicht bewegt");
  assert.equal(norm(await page.locator("#offers-dd-zeit").textContent()), "Beliebig");
  await optionWaehlen(page, "18:00 Uhr");
  await pruefeFrist1800(page);
  assert.equal(p.calc, 1);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("P3 — Versandkostenrechner: Innenabstand und Scrollbalken schließen das Dropdown nicht (dieselbe OffersList)", async () => {
  const { ctx, page, fehler, p } = await neueSeite(browserMitScrollbalken);
  await zumRechner(page);
  await untenFristtag(page);
  await listeOeffnen(page, "offers-dd-zeit");
  let m = await listenMass(page);
  await druecke(page, m.left + m.width / 2, m.top + 2.5);
  await frames(page);
  assert.equal(await dropdownUnten(page).count(), 1, "Innenabstand: Dropdown geschlossen");
  assert.equal(await liste(page).count(), 1, "Innenabstand: Liste geschlossen");
  m = await listenMass(page);
  assert.ok(m.scrollbalken >= 8, `Vorbedingung: Scrollbalken gezeichnet (${m.scrollbalken} px)`);
  await druecke(page, m.right - 1 - m.scrollbalken / 2, m.top + 30, { ziehenUm: 60 });
  await frames(page);
  assert.equal(await dropdownUnten(page).count(), 1, "Scrollbalken: Dropdown geschlossen");
  assert.equal(await liste(page).count(), 1, "Scrollbalken: Liste geschlossen");
  await optionWaehlen(page, "18:00 Uhr");
  await page.waitForFunction((t) => [...document.querySelectorAll(".offers-filter-chip")].some((c) => c.textContent.includes(t)),
    `${FRIST_DE}, 18:00`, { timeout: 10000 });
  assert.equal(await chipText(page), `Lieferung bis ${FRIST_DE}, 18:00`);
  assert.equal(p.calc, 1);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("P4 — Außenklick schließt weiterhin, Innenklick nicht; neben der offenen Liste schließt nur die Liste", async () => {
  const { ctx, page, fehler } = await neueSeite(browser);
  await zuDenAngeboten(page);
  await untenFristtag(page);
  // Innen: Titel des Dropdowns und Kalendertitel.
  for (const sel of [".offers-filter-dd-title", ".dc-title"]) {
    await betaetige(page, dropdownUnten(page).locator(sel).first());
    await frames(page);
    assert.equal(await dropdownUnten(page).count(), 1, `Innenklick auf ${sel} hat geschlossen`);
  }
  // Uhrzeitliste offen, Druck daneben im Dropdown: nur die Liste schließt.
  await listeOeffnen(page, "offers-dd-zeit");
  await betaetige(page, dropdownUnten(page).locator(".offers-filter-dd-title"));
  await liste(page).waitFor({ state: "detached", timeout: 5000 });
  assert.equal(await dropdownUnten(page).count(), 1, "der Druck neben die Liste hat das Dropdown geschlossen");
  // Außen: Kopf der Ergebnisliste, danach eine Gruppenüberschrift.
  await betaetige(page, page.locator(".offers-result-count"));
  await dropdownUnten(page).waitFor({ state: "detached", timeout: 5000 });
  await untenOeffnen(page);
  await betaetige(page, page.locator(".offers-group-name").first());
  await dropdownUnten(page).waitFor({ state: "detached", timeout: 5000 });
  // Außen mit offener Liste: Liste und Dropdown schließen gemeinsam, die Frist bleibt.
  await untenOeffnen(page);
  await listeOeffnen(page, "offers-dd-zeit");
  await betaetige(page, page.locator(".offers-result-count"));
  await dropdownUnten(page).waitFor({ state: "detached", timeout: 5000 });
  assert.equal(await liste(page).count(), 0);
  assert.equal(await chipText(page), `Lieferung bis ${FRIST_DE}`);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("P5 — oben (Gegenprobe): Innenabstand und Scrollbalken halten die Liste offen, 18:00 wirkt unten mit", async () => {
  const { ctx, page, fehler, p } = await neueSeite(browserMitScrollbalken);
  await zuDenAngeboten(page);
  await obenFristtag(page);
  await listeOeffnen(page, "ns-form-zeit");
  let m = await listenMass(page);
  await druecke(page, m.left + m.width / 2, m.top + 2.5);
  await frames(page);
  assert.equal(await liste(page).count(), 1, "oben: Innenabstand hat die Liste geschlossen");
  m = await listenMass(page);
  assert.ok(m.scrollbalken >= 8, `Vorbedingung: Scrollbalken gezeichnet (${m.scrollbalken} px)`);
  await druecke(page, m.right - 1 - m.scrollbalken / 2, m.top + 30, { ziehenUm: 60 });
  await frames(page);
  assert.equal(await liste(page).count(), 1, "oben: Scrollbalken hat die Liste geschlossen");
  assert.equal(await page.locator(".date-picker-body--latest").count(), 1, "oben: Popover geschlossen");
  await optionWaehlen(page, "18:00 Uhr");
  await pruefeFrist1800(page);
  assert.equal(p.calc, 1);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("P6 — unten Mausrad und Tastatur: die Liste scrollt bzw. wird mit Pfeiltasten bedient, die Wahl wirkt sofort", async () => {
  const { ctx, page, fehler, p } = await neueSeite(browser);
  await zuDenAngeboten(page);
  await untenFristtag(page);
  // Mausrad über der Liste: die Liste scrollt, Dropdown und Liste bleiben.
  await listeOeffnen(page, "offers-dd-zeit");
  const m = await listenMass(page);
  await page.mouse.move(m.left + m.width / 2, m.top + m.height / 2);
  await page.mouse.wheel(0, 240);
  await page.waitForFunction(() => (document.querySelector(".offers-time-list")?.scrollTop ?? 0) > 0, null, { timeout: 5000 });
  assert.equal(await dropdownUnten(page).count(), 1, "Mausrad: Dropdown geschlossen");
  await optionWaehlen(page, "18:00 Uhr");
  await pruefeFrist1800(page);
  // Tastatur: Fokus auf den Auslöser, Enter öffnet, Pfeil hoch bis 10:00, Enter wählt.
  await untenOeffnen(page);
  const ausloeser = page.locator("#offers-dd-zeit");
  await ausloeser.focus();
  await ausloeser.press("Enter");
  await liste(page).waitFor({ state: "visible", timeout: 10000 });
  const optionen = (await liste(page).locator('[role="option"]').allTextContents()).map(norm);
  const ziel = optionen.indexOf("10:00 Uhr"), start = optionen.indexOf("18:00 Uhr");
  assert.ok(ziel > 0 && start > ziel, `Optionen unerwartet: ${optionen.join(", ")}`);
  for (let i = 0; i < start - ziel; i++) await ausloeser.press("ArrowUp");
  await ausloeser.press("Enter");
  await liste(page).waitFor({ state: "detached", timeout: 10000 });
  await page.waitForFunction((t) => [...document.querySelectorAll(".offers-filter-chip")].some((c) => c.textContent.includes(t)),
    `${FRIST_DE}, 10:00`, { timeout: 10000 });
  assert.match(await obenWert(page), /· 10:00$/);
  assert.equal(p.calc, 1);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("P7 — Reihenfolge und schneller Wechsel: ein Zustand für oben und unten, ohne Preisanfrage", async () => {
  const { ctx, page, fehler, p } = await neueSeite(browser);
  await zuDenAngeboten(page);
  // Unten zuerst — oben steht dasselbe.
  await untenFristtag(page);
  await listeOeffnen(page, "offers-dd-zeit");
  await optionWaehlen(page, "10:00 Uhr");
  await page.waitForFunction((t) => [...document.querySelectorAll(".offers-filter-chip")].some((c) => c.textContent.includes(t)),
    `${FRIST_DE}, 10:00`, { timeout: 10000 });
  assert.match(await obenWert(page), /· 10:00$/);
  // Oben ändern — unten steht dasselbe.
  await obenOeffnen(page);
  await listeOeffnen(page, "ns-form-zeit");
  await optionWaehlen(page, "12:00 Uhr");
  await page.waitForFunction((t) => [...document.querySelectorAll(".offers-filter-chip")].some((c) => c.textContent.includes(t)),
    `${FRIST_DE}, 12:00`, { timeout: 10000 });
  assert.match(await obenWert(page), /· 12:00$/);
  // Schneller Wechsel ohne Pause zwischen den Bedienungen: unten, oben, unten, oben.
  for (const [stelle, zeit] of [["unten", "16:00"], ["oben", "13:00"], ["unten", "18:00"], ["oben", "09:00"]]) {
    if (stelle === "unten") { await untenOeffnen(page); await listeOeffnen(page, "offers-dd-zeit"); }
    else { await obenOeffnen(page); await listeOeffnen(page, "ns-form-zeit"); }
    await optionWaehlen(page, `${zeit} Uhr`);
  }
  await page.waitForFunction((t) => [...document.querySelectorAll(".offers-filter-chip")].some((c) => c.textContent.includes(t)),
    `${FRIST_DE}, 09:00`, { timeout: 10000 });
  assert.match(await obenWert(page), /· 09:00$/);
  // Unten zurücksetzen — oben steht wieder „Beliebig", die Liste ist ungegliedert.
  await untenOeffnen(page);
  await betaetige(page, dropdownUnten(page).locator(".offers-filter-dd-clear"));
  await page.waitForFunction(() => document.querySelectorAll("[data-offers-group]").length === 0, null, { timeout: 10000 });
  assert.equal(await chipText(page), "Lieferung");
  assert.equal(await obenWert(page), "Beliebig");
  assert.equal(p.calc, 1, "der Lieferzeitfilter hat eine Preisanfrage ausgelöst");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

// Touch: Ein Tipp auf den 4-px-Innenabstand ist hier nicht nachstellbar — Chromium ordnet einen Tipp so dicht an
// einer Option per Touch-Zielanpassung dieser Option zu (gemessen: Ziel LI statt UL, die Option wird gewählt).
// Geprüft wird deshalb, was ein Mensch auf dem Telefon tut: in der Liste wischen (echte Touch-Scrollgeste) und eine
// Uhrzeit antippen.
test("P8 — Touch 390 und 768: Wischen in der Liste schließt nichts, Tipp auf eine Uhrzeit wählt sie", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    const { ctx, page, fehler, p } = await neueSeite(browser, { viewport, touch: true });
    await zuDenAngeboten(page);
    await untenFristtag(page, true);
    await listeOeffnen(page, "offers-dd-zeit", true);
    const m = await listenMass(page);
    assert.ok(m.eigenesScrollen, `${viewport.width}px: Vorbedingung — die Liste braucht eigenes Scrollen`);
    // Wischen nach oben über rohe Touch-Ereignisse (headless kennt `Input.synthesizeScrollGesture` nicht) — langsam
    // und mit ruhendem Finger vor dem Loslassen, also ohne Schwung: ein Tipp in einen laufenden Schwung stoppt ihn nur
    // und wird vom Browser bewusst nicht als Tipp gewertet (gemessen: erster Tipp ohne mousedown).
    const cdp = await ctx.newCDPSession(page);
    const x = Math.round(m.left + m.width / 2), y = Math.round(m.top + m.height * 0.7);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 15 }] });
      await kurz(16);
    }
    await kurz(150);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await page.waitForFunction(() => (document.querySelector(".offers-time-list")?.scrollTop ?? 0) > 0, null, { timeout: 5000 });
    // Der Schwung (Fling) des Wischens muss auslaufen: ein Tipp in einen laufenden Schwung stoppt ihn nur und wird
    // vom Browser bewusst nicht als Tipp gewertet — so wie auf dem Telefon.
    await page.evaluate(() => new Promise((fertig) => {
      const l = document.querySelector(".offers-time-list");
      let letzte = l.scrollTop, ruhig = 0, n = 0;
      const tick = () => {
        if (l.scrollTop === letzte) ruhig += 1;
        else { ruhig = 0; letzte = l.scrollTop; }
        if (ruhig >= 10 || (n += 1) > 600) return fertig();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    assert.equal(await dropdownUnten(page).count(), 1, `${viewport.width}px: Wischen in der Liste schloss das Dropdown`);
    assert.equal(await liste(page).count(), 1, `${viewport.width}px: Wischen in der Liste schloss die Liste`);
    await optionWaehlen(page, "18:00 Uhr", true);
    await pruefeFrist1800(page);
    assert.equal(p.calc, 1);
    assert.deepEqual(fehler, [], `${viewport.width}px`);
    await ctx.close();
  }
});
