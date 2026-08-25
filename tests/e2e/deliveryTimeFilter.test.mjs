// E2E: frühe Zustellzeit auf der Karte + optionale Uhrzeit im Lieferzeitfilter.
//
// Gemockt, gegen einen echten Dev-Server. Niemals eine echte Berechnung, niemals
// eine Bestellung, niemals ein echter Providerkontakt.
//
// Die beiden tragenden Messungen sind Szenario 5 und 6: dass eine Uhrzeitauswahl
// die Liste reduziert, OHNE dass ein weiterer /calculate-price-Request rausgeht,
// und dass Zurücksetzen die volle Liste zurückbringt — ebenfalls ohne Request.
// Ein Zähler misst das; es wird nicht behauptet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_ABSENDER } from "./helpers/newShipmentForm.mjs";
import { TARIFE_41 } from "../../src/utils/offersFilterFixture.mjs";

const PORT = 5345, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "97421", customer_number: "CE-K-10030",
};

const TARIFE = TARIFE_41.map((t, i) => ({
  ...t,
  shipper_tariff_id: t.id,
  publicCarrierId: "ups",
  publicCarrierName: "Carrier " + (i + 1),
  publicServiceName: t.shippingMode === "express" ? "Expressversand" : "Standardversand",
  currency: "EUR",
  vatAmount: Number((t.netPrice * 0.19).toFixed(2)),
  finalPrice: Number((t.netPrice * 1.19).toFixed(2)),
  transitDaysMin: 1, transitDaysMax: 1,
  trackingAvailable: true, printerRequired: true, availableForDate: true,
}));

const ABSENDER = { zip: "97421", city: "Schweinfurt", street: "Musterweg 1" };
let server, browser;

function setupRoutes(page, zaehler) {
  return (async () => {
    await page.route("**/api.confidaraexpress.de/**", async (route) => {
      const p = new URL(route.request().url()).pathname;
      const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
      if (p.endsWith("/kundenbereich")) return json({ user: USER });
      if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
      if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
      if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
      if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
      if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
      if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
      if (p.includes("/api/legal/booking-context")) return json({ enabled: false });
      if (p.includes("/api/jumingo/calculate-price")) {
        zaehler.n += 1;
        return json({
          shipmentId: "s_e2e", ceShipmentId: 4711, tariffs: TARIFE,
          availableShippingModes: ["express", "standard"],
          publicCarriers: [{ id: "ups", name: "UPS" }],
          customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
        });
      }
      return json({});
    });
    await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  })();
}

async function zeigeAngebote(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { absender: { ...STANDARD_ABSENDER, ...ABSENDER } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

const oeffneLieferzeit = (page) =>
  page.locator(".offers-filter-chip", { hasText: "Lieferung" }).click()
    .then(() => page.waitForSelector(".offers-delivery-dropdown", { timeout: 10000 }));

const anzahlKarten = (page) => page.locator(".offer-card").count();

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { detached: true, stdio: "ignore" });
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
  if (server) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

/* ── Szenario 1–3: Darstellung ───────────────────────────────────────────── */

test("1 — 41 Tarife werden geladen und jede Karte nennt eine Lieferzeit", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);
  assert.equal(await anzahlKarten(page), 41);

  // 22 Karten tragen eine frühe Zeit in der Hauptzeile, 19 den Tagesendwert in
  // der Unterzeile — zusammen 41: keine Karte verliert ihre Uhrzeit.
  const frueh = await page.locator(".offer-tl-time-early").count();
  const spaet = await page.locator(".offer-tl-node--end .offer-tl-sub").count();
  assert.equal(frueh, 22, "frühe Zustellzeiten");
  assert.equal(spaet, 19, "Tagesendwerte bleiben sichtbar");
  assert.equal(frueh + spaet, 41);
  await page.close();
});

test("2 — eine 12:00-Karte zeigt die Uhrzeit prominent in der Hauptzeile", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);

  const zeit = page.locator(".offer-tl-time-early", { hasText: "bis 12:00 Uhr" }).first();
  assert.ok(await zeit.count() > 0, "keine Karte mit 12:00 gefunden");
  assert.ok(await zeit.isVisible());

  // Sie steht INNERHALB der Hauptzeile, neben dem Datum — nicht als Unterzeile.
  const info = await zeit.evaluate((el) => {
    const eltern = el.parentElement;
    const stil = getComputedStyle(el);
    return {
      elternKlasse: eltern.className,
      zeile: eltern.textContent.trim(),
      farbe: stil.color,
      gewicht: getComputedStyle(eltern).fontWeight,
    };
  });
  assert.equal(info.elternKlasse, "offer-tl-primary");
  assert.match(info.zeile, /,\s*bis 12:00 Uhr$/, "Datum und Uhrzeit stehen in EINER Zeile");
  // Das Datum trägt den Wochentag („Mo., 31.08.") und steht VOR der Uhrzeit.
  assert.match(info.zeile, /\d{2}\.\d{2}\.,\s*bis 12:00 Uhr$/);
  assert.ok(!info.zeile.startsWith("bis"), "die Uhrzeit darf das Datum nicht verdrängen");
  // Dezentes Confidara-Grün aus dem Foundation-Token (#2f6b52).
  assert.equal(info.farbe, "rgb(47, 107, 82)");
  assert.equal(info.gewicht, "600");
  await page.close();
});

test("3 — eine 17:00-Karte zeigt die Uhrzeit weiterhin, aber dezent", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);

  const sub = page.locator(".offer-tl-node--end .offer-tl-sub", { hasText: "bis 17:00 Uhr" }).first();
  assert.ok(await sub.count() > 0, "der Tagesendwert wurde entfernt statt nur zurückgenommen");
  assert.ok(await sub.isVisible());
  const stil = await sub.evaluate((el) => {
    const s = getComputedStyle(el);
    return { farbe: s.color, gewicht: s.fontWeight, groesse: s.fontSize };
  });
  assert.equal(stil.gewicht, "500", "der Tagesendwert bleibt auf der Unterzeilenstufe");
  assert.equal(stil.groesse, "13px");
  assert.notEqual(stil.farbe, "rgb(47, 107, 82)", "kein Grün für einen Tagesendwert");
  // Und keine dieser Karten trägt die Hervorhebung.
  const karte = sub.locator("xpath=ancestor::div[contains(@class,'offer-card')]");
  assert.equal(await karte.locator(".offer-tl-time-early").count(), 0);
  await page.close();
});

/* ── Szenario 4–6: Filter ────────────────────────────────────────────────── */

test("4 — Lieferdatum 31.08. filtert wie bisher auf 21 Karten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);
  assert.equal(zaehler.n, 1);

  await oeffneLieferzeit(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 21, null, { timeout: 10000 });

  assert.equal(await anzahlKarten(page), 21);
  assert.match(await page.locator(".offers-result-count").textContent(), /^21 Angebote$/);
  assert.equal(zaehler.n, 1, "der Datumsfilter darf keine Neuberechnung auslösen");

  // Die Fläche bleibt offen, damit die Uhrzeitzeile erreichbar ist.
  assert.equal(await page.locator(".offers-delivery-dropdown").count(), 1);
  assert.equal(await page.locator(".offers-time-chips").count(), 1, "die Uhrzeitzeile ist jetzt bedienbar");
  await page.close();
});

test("5 — Uhrzeit 12:00 reduziert die Liste weiter, ohne neuen Preisrequest", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);

  await oeffneLieferzeit(page);
  // Ohne Datum ist die Uhrzeit bewusst nicht wählbar.
  assert.equal(await page.locator(".offers-time-chips").count(), 0);
  assert.match(await page.locator(".offers-time-disabled").textContent(), /Erst ein Datum wählen/);

  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForSelector(".offers-time-chips", { timeout: 10000 });

  // Die Optionen kommen aus den geladenen Tarifen, nicht aus einer festen Liste.
  const optionen = await page.locator(".offers-time-chips [role=radio]").allTextContents();
  assert.deepEqual(optionen.map((s) => s.trim()),
    ["Beliebig", "08:00", "09:00", "10:00", "10:30", "12:00", "13:00", "17:00", "18:00"]);

  const vorher = await anzahlKarten(page);
  await page.locator(".offers-time-chips [role=radio]", { hasText: "12:00" }).click();
  await page.waitForSelector(".offers-delivery-dropdown", { state: "detached", timeout: 10000 });

  const nachher = await anzahlKarten(page);
  assert.ok(nachher < vorher, `Uhrzeit hat nicht gefiltert (${vorher} → ${nachher})`);
  assert.equal(zaehler.n, 1, "die Uhrzeitauswahl darf KEINEN /calculate-price-Request auslösen");

  // Der Chip nennt Datum und Uhrzeit.
  const chip = page.locator(".offers-filter-chip", { hasText: "Lieferung" });
  assert.match((await chip.textContent()).trim(), /^Lieferung bis 31\.08\.2026, 12:00$/);
  assert.equal(await chip.evaluate((el) => el.classList.contains("has-filter")), true);
  await page.close();
});

test("6 — Zurücksetzen bringt alle 41 Karten zurück, ohne neuen Preisrequest", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);

  await oeffneLieferzeit(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForSelector(".offers-time-chips", { timeout: 10000 });
  await page.locator(".offers-time-chips [role=radio]", { hasText: "12:00" }).click();
  await page.waitForSelector(".offers-delivery-dropdown", { state: "detached", timeout: 10000 });
  assert.ok(await anzahlKarten(page) < 41);

  await page.locator(".offers-filter-reset-btn").click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 41, null, { timeout: 10000 });

  assert.equal(await anzahlKarten(page), 41);
  assert.equal((await page.locator(".offers-filter-chip", { hasText: "Lieferung" }).textContent()).trim(), "Lieferung");
  assert.equal(zaehler.n, 1, "Zurücksetzen darf KEINEN /calculate-price-Request auslösen");
  await page.close();
});

/* ── Szenario 7–8: Layout ────────────────────────────────────────────────── */

test("7 — auf breitem Desktop ist die Angebotssektion schmaler und zentriert", async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);

  const mass = await page.evaluate(() => {
    const sek = document.querySelector(".offers-section");
    const karte = document.querySelector(".offer-card");
    const haupt = document.querySelector(".main-content") || document.body;
    const s = sek.getBoundingClientRect(), h = haupt.getBoundingClientRect();
    return {
      sektion: Math.round(s.width), karte: Math.round(karte.getBoundingClientRect().width),
      linksAussen: Math.round(s.left - h.left), rechtsAussen: Math.round(h.right - s.right),
      radius: getComputedStyle(karte).borderTopLeftRadius,
      schatten: getComputedStyle(karte).boxShadow,
    };
  });
  assert.equal(mass.sektion, 1080, "die Sektionsbreite hat sich verschoben");
  assert.equal(mass.karte, 1022, "gemessene Kartenbreite (vorher 1126)");
  // Zentriert: gleich viel Luft links wie rechts (Rundung erlaubt 1px).
  assert.ok(Math.abs(mass.linksAussen - mass.rechtsAussen) <= 1,
    `nicht zentriert: ${mass.linksAussen} vs ${mass.rechtsAussen}`);
  assert.ok(mass.linksAussen > 40, "es entsteht sichtbarer Weißraum");
  assert.equal(mass.radius, "12px", "etwas rechteckiger");
  assert.notEqual(mass.schatten, "none", "die Karte trägt einen Ruheschatten");
  await page.close();
});

test("8 — auf Mobile bleibt die Karte voll breit, ohne waagerechte Scrollfläche", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);

  const mass = await page.evaluate(() => {
    const sek = document.querySelector(".offers-section");
    const karte = document.querySelector(".offer-card");
    const preis = karte.querySelector(".offer-price");
    const cta = karte.querySelector(".offer-cta-btn");
    const k = karte.getBoundingClientRect();
    return {
      sektion: Math.round(sek.getBoundingClientRect().width),
      karte: Math.round(k.width),
      scrollUeberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      karteScroll: karte.scrollWidth - karte.clientWidth,
      preisSichtbar: preis && preis.getBoundingClientRect().right <= k.right + 1,
      ctaSichtbar: cta && cta.getBoundingClientRect().right <= k.right + 1,
    };
  });
  assert.ok(mass.sektion < 1080, "unter 1080px darf die Begrenzung nicht greifen");
  assert.ok(mass.sektion > 340, `die Sektion ist zusammengefallen (${mass.sektion}px)`);
  assert.equal(mass.scrollUeberlauf, 0, "waagerechte Scrollfläche auf der Seite");
  assert.equal(mass.karteScroll, 0, "waagerechte Scrollfläche in der Karte");
  assert.equal(mass.preisSichtbar, true, "der Preis ist abgeschnitten");
  assert.equal(mass.ctaSichtbar, true, "die Hauptaktion ist abgeschnitten");
  await page.close();
});
