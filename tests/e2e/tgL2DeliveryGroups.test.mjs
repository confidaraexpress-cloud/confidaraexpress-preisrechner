// E2E: TG-L2 (Betreiberentscheidung 2026-10-23) — Lieferzeitfilter in Gruppen, beide Bedienflächen, Auswahl,
// Leerzustand, Shopabgabe und Breiten. Echter Dev-Server, echter Browser, gemocktes Backend.
//
// Die Regel selbst misst die Unit-Suite (src/utils/offersFilterView.test.mjs, Matrix der Analyse); hier wird gemessen,
// dass beide Bedienflächen denselben Zustand schreiben, dass sofort und ohne Preisanfrage gegliedert wird und dass die
// Oberfläche mit den Gruppen auf jeder Breite trägt.
//
//   O  oben (Formular „Späteste Lieferzeit") und unten (Chip „Lieferung") — derselbe Zustand, im Wechsel, Zurücksetzen
//   W  eine Auswahl, die durch eine neue Frist zu spät wird, wird gelöst; eine bewusste Wahl in „Zu spät" bleibt
//   L  kein Angebot hält die Frist: Satz, „Frist nicht bestätigt", Aufklapper und „Filter zurücksetzen"
//   S  Shopabgabe mit Prognose: der Startknoten nennt den Abgabetag, die Details den Abgabe-Hinweis
//   R  390 / 768 / 1440 / 1920 px mit aufgeklappter Gruppe „Zu spät": kein waagerechter Überlauf
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

const PORT = 5573, BASE = `http://127.0.0.1:${PORT}`;

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

/* Ein JUMiNGO-Tarif mit Anbieterterminen. */
const J = (id, carrier, name, netto, termin, zeit, extra = {}) => ({
  id, shipper_tariff_id: id, offerId: kennung("l2j", String(id)),
  publicCarrierId: carrier.id, publicCarrierName: carrier.name, publicServiceName: name, serviceType: "pickup",
  shippingMode: "express", transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
  deliveryDate: termin, deliveryDateMin: termin, deliveryDateMax: termin, deliveryTimeUntil: zeit,
  trackingAvailable: true, printerRequired: false, bookable: true, unavailableReason: null, requiredPriceInputs: [],
  ...preis(netto), ...extra,
});
/* Ein Transglobal-Angebot mit der Prognose des Servers (TG-L1) — oder ohne (`prognose: null`). */
const T = (sid, carrier, name, netto, prognose, extra = {}) => ({
  offerId: kennung("l2t", String(sid)), publicCarrierId: carrier, publicServiceName: name, serviceType: "pickup",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null, deliveryTimeUntil: null,
  transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
  deliveryProjection: prognose ? { kind: "estimated", timeUntil: null, ...prognose } : null,
  bookable: true, unavailableReason: null, requiredPriceInputs: [], ...preis(netto), ...extra,
});
const UPS = { id: "ups", name: "UPS" }, DHL = { id: "dhl", name: "DHL Express" }, DPD = { id: "dpd", name: "DPD" };

let server, browser;

async function setup(page, antwort) {
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
      return json({ ceShipmentId: 4998, customsRequired: false, exportDeclaration: null,
                    availableShippingModes: ["express", "standard"], publicCarriers: [UPS, DHL, DPD],
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
const gruppenIds = (page, gruppe) => page.locator(`[data-offers-group="${gruppe}"] .offer-card button.offer-details-link`)
  .evaluateAll((knoepfe) => knoepfe.map((k) => k.getAttribute("aria-controls").replace("offer-details-", "")));
const ids = (liste) => liste.map((t) => t.offerId);
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

/* OBEN: das Formularfeld „Späteste Lieferzeit". */
const obenAusloeser = (page) => page.locator(".service-filter-trigger",
  { has: page.locator(".service-filter-trigger-title", { hasText: /^Späteste Lieferzeit$/ }) });
async function obenOeffnen(page) {
  if (await page.locator(".date-picker-body--latest").count() === 0) await obenAusloeser(page).click();
  await page.waitForSelector(".date-picker-body--latest", { timeout: 10000 });
}
async function obenTag(page, tag) {
  await obenOeffnen(page);
  await page.locator(".date-picker-body--latest .dc-day", { hasText: new RegExp(`^${tag}$`) }).first().click();
}
async function obenBeliebig(page) {
  await obenOeffnen(page);
  await page.locator(".date-picker-body--latest .date-quick-btn", { hasText: /^Beliebig$/ }).click();
}
const obenWert = async (page) => norm(await obenAusloeser(page).locator(".service-filter-trigger-val").textContent());

/* UNTEN: der Chip „Lieferung" an der Angebotsliste. */
async function untenOeffnen(page) {
  if (await page.locator(".offers-delivery-dropdown").count() === 0) {
    await page.locator(".offers-filter-chip", { hasText: "Lieferung" }).click();
  }
  await page.waitForSelector(".offers-delivery-dropdown", { timeout: 10000 });
}
async function untenUhrzeit(page, text) {
  await untenOeffnen(page);
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
const chipText = async (page) => norm(await page.locator(".offers-filter-chip", { hasText: "Lieferung" }).first().textContent());

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

// Gemeinsame Angebote: bestätigt, voraussichtlich (mit und ohne belegte Uhrzeit), nicht bestätigt, zu spät.
const j9 = J(3260, DHL, "Express National 9:00", 31, FRIST, "09:00");
const jSpaet = J(3257, UPS, "Standard", 12, "2026-09-02", "17:00", { shippingMode: "standard", transitDaysMax: 3 });
const t87 = T(87, "dhl", "Domestic Express 12:00", 25, { dateMin: FRIST, dateMax: FRIST, timeUntil: "12:00" });
const t84 = T(84, "dhl", "Domestic Express", 22, { dateMin: FRIST, dateMax: FRIST });
const t22 = T(22, "ups", "Standardversand", 9, { dateMin: FRIST, dateMax: "2026-09-01" },
  { transitDaysMax: 2, deliveryTime: "1–2 Tage" });
const t137 = T(137, "dpd", "Classic", 8, { dateMin: FRIST, dateMax: null }, { transitDaysMax: null, deliveryTime: "ab 1 Tag" });
const ALLE = [j9, jSpaet, t87, t84, t22, t137];

test("O — oben und unten: derselbe Zustand, im Wechsel, sofort und ohne neue Preisanfrage", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: ALLE });
  await zuDenAngeboten(page);
  assert.equal(await page.locator("[data-offers-group]").count(), 0);

  // Oben das Datum: unten erscheint derselbe Filter, die Liste gliedert sofort.
  await obenTag(page, LIEFERFRIST_TAG);
  await kartenZahl(page, 4);
  assert.equal(await chipText(page), `Lieferung bis ${LIEFERFRIST_TAG}.08.2026`);
  assert.deepEqual(await gruppenIds(page, "confirmed"), ids([j9]));
  assert.deepEqual(await gruppenIds(page, "projected"), ids([t87, t84]));
  assert.deepEqual(await gruppenIds(page, "unconfirmed"), ids([t137]));
  assert.equal(norm(await page.locator(".offers-late-toggle").textContent()), "2 Angebote stellen nach Ihrer Frist zu – anzeigen");

  // Unten die Uhrzeit 10:00: oben steht sie mit, die DHL 12:00 und die Prognose ohne Uhrzeit wechseln die Gruppe.
  await untenUhrzeit(page, "10:00 Uhr");
  await kartenZahl(page, 3);
  assert.match(await obenWert(page), /· 10:00$/);
  assert.deepEqual(await gruppenIds(page, "confirmed"), ids([j9]));
  assert.deepEqual(await gruppenIds(page, "projected"), []);
  assert.deepEqual(await gruppenIds(page, "unconfirmed"), ids([t84, t137]));
  assert.equal(norm(await page.locator(".offers-late-toggle").textContent()), "3 Angebote stellen nach Ihrer Frist zu – anzeigen");

  // Oben „Beliebig": unten ist der Filter fort, die Liste ist wieder ungegliedert.
  await obenBeliebig(page);
  await kartenZahl(page, 6);
  assert.equal(await chipText(page), "Lieferung");
  assert.equal(await page.locator("[data-offers-group]").count(), 0);
  assert.equal(await obenWert(page), "Beliebig");
  assert.equal(p.calc, 1, "ein Lieferzeitfilter hat eine Preisanfrage ausgelöst");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("W — die Auswahl wird gelöst, wenn sie durch eine neue Frist zu spät ist; eine bewusste Wahl dort bleibt", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: ALLE });
  await zuDenAngeboten(page);
  // Gewählt wird über die Karte selbst (nicht über den Knopf, der zur Buchung führt).
  await karteVon(page, jSpaet).locator(".offer-carrier-name").click();
  await page.waitForSelector(".offer-card--selected", { timeout: 10000 });
  assert.equal(await karteVon(page, jSpaet).evaluate((k) => k.classList.contains("offer-card--selected")), true);

  await untenOeffnen(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: new RegExp(`^${LIEFERFRIST_TAG}$`) }).first().click();
  await kartenZahl(page, 4);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".offer-card--selected").count(), 0, "eine eingeklappte Karte blieb gewählt");

  // Aufklappen und bewusst wählen: die Wahl bleibt — die Regel greift nur bei einer Änderung der Frist.
  await page.locator(".offers-late-toggle").click();
  await kartenZahl(page, 6);
  await karteVon(page, jSpaet).locator(".offer-carrier-name").click();
  await kurz(300);
  assert.equal(await karteVon(page, jSpaet).evaluate((k) => k.classList.contains("offer-card--selected")), true);
  // Eine gewählte, passende Karte bleibt auch über eine neue Frist gewählt.
  await karteVon(page, j9).locator(".offer-carrier-name").click();
  await untenUhrzeit(page, "10:00 Uhr");
  await kurz(300);
  assert.equal(await karteVon(page, j9).evaluate((k) => k.classList.contains("offer-card--selected")), true);
  assert.equal(p.calc, 1);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("L — kein Angebot hält die Frist: der Satz, „Frist nicht bestätigt“, der Aufklapper und „Filter zurücksetzen“", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: [jSpaet, t137, t22] });
  await zuDenAngeboten(page);
  await obenTag(page, LIEFERFRIST_TAG);
  await kartenZahl(page, 1);
  assert.equal(norm(await page.locator(".offers-group-none").textContent()),
    "Kein Angebot hält Ihre Frist nach den verfügbaren Daten ein.");
  assert.deepEqual(await gruppenIds(page, "unconfirmed"), ids([t137]));
  assert.equal(await page.locator('[data-offers-group="confirmed"], [data-offers-group="projected"]').count(), 0);
  assert.equal(norm(await page.locator(".offers-late-toggle").textContent()), "2 Angebote stellen nach Ihrer Frist zu – anzeigen");
  // Auszeichnungen gibt es hier nicht: keine Karte hält die Frist ein.
  assert.equal(await page.locator(".offer-badge").count(), 0);
  await page.locator(".offers-group-reset button", { hasText: "Filter zurücksetzen" }).click();
  await kartenZahl(page, 3);
  assert.equal(await page.locator("[data-offers-group]").count(), 0);
  assert.equal(p.calc, 1);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("S — Shopabgabe mit Prognose: der Startknoten nennt den Abgabetag, die Details den Abgabe-Hinweis", async () => {
  const { page, fehler } = await neueSeite();
  const t124 = T(124, "dpd", "PaketShop", 5, { dateMin: FRIST, dateMax: FRIST }, { serviceType: "dropoff" });
  const tOhne = T(1240, "dpd", "PaketShop ohne Prognose", 6, null, { serviceType: "dropoff" });
  await setup(page, { tariffs: [t124, tOhne] });
  await zuDenAngeboten(page);
  const start = karteVon(page, t124).locator(".offer-tl-node--start");
  assert.equal(norm(await start.locator(".offer-tl-title").textContent()), "Shopabgabe");
  assert.match(norm(await start.locator(".offer-tl-primary").textContent()), /^ab (Mo|Di|Mi|Do|Fr)\., \d{2}\.\d{2}\.$/);
  // Ohne Prognose kein erfundener Tag.
  assert.equal(await karteVon(page, tOhne).locator(".offer-tl-node--start .offer-tl-primary").count(), 0);
  const ende = karteVon(page, t124).locator(".offer-tl-node--end");
  assert.equal(norm(await ende.locator(".offer-tl-title").textContent()), "Voraussichtliche Zustellung");
  await karteVon(page, t124).locator("button.offer-details-link").click();
  const details = page.locator(`#offer-details-${t124.offerId}`);
  await details.waitFor({ state: "visible", timeout: 10000 });
  const text = norm(await details.textContent());
  assert.match(text, /Voraussichtliche Zustellung\s*31\.08\.2026/);
  assert.match(text, /Aus Abgabetag und Laufzeit berechnet/);
  assert.ok(!/garant/i.test(text));
  assert.deepEqual(fehler, []);
  await page.close();
});

test("R — 390 / 768 / 1440 / 1920 px: Gruppen und aufgeklapptes „Zu spät“ ohne waagerechten Überlauf", async () => {
  for (const width of [390, 768, 1440, 1920]) {
    const { page, fehler } = await neueSeite({ width, height: 1000 });
    await setup(page, { tariffs: ALLE });
    await zuDenAngeboten(page);
    await untenOeffnen(page);
    await page.locator(".offers-delivery-dropdown .dc-day", { hasText: new RegExp(`^${LIEFERFRIST_TAG}$`) }).first().click();
    await kartenZahl(page, 4);
    await page.keyboard.press("Escape");
    await page.locator(".offers-late-toggle").click();
    await kartenZahl(page, 6);
    const mass = await page.evaluate(() => ({
      breite: document.documentElement.scrollWidth, fenster: window.innerWidth,
      koepfe: [...document.querySelectorAll(".offers-group-title")].map((k) => k.getBoundingClientRect().width > 0),
      aufklapper: document.querySelector(".offers-late-toggle").getBoundingClientRect().height,
    }));
    assert.ok(mass.breite <= mass.fenster, `${width}px: waagerechter Überlauf (${mass.breite} > ${mass.fenster})`);
    assert.ok(mass.koepfe.length >= 3 && mass.koepfe.every(Boolean), `${width}px: Gruppenkopf unsichtbar`);
    assert.ok(mass.aufklapper >= 32, `${width}px: Aufklapper zu niedrig (${mass.aufklapper})`);
    assert.deepEqual(fehler, [], `${width}px`);
    await page.close();
  }
});
