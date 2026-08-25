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

/* ── Szenario C/D: Darstellung der Karte ─────────────────────────────────── */

test("1 — 41 Tarife: JEDE Karte zeigt ihre Uhrzeit neutral in der Unterzeile", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);
  assert.equal(await anzahlKarten(page), 41);

  // Die normale Lieferzeile ist für alle gleich — 41 Unterzeilen, keine
  // Sonderbehandlung mitten in der Datumszeile.
  assert.equal(await page.locator(".offer-tl-node--end .offer-tl-sub").count(), 41);
  assert.equal(await page.locator(".offer-tl-time-early").count(), 0,
    "die frühere Inline-Färbung darf nicht zurückkommen");
  // Das zusätzliche Hinweisfeld tragen nur die 22 frühen Tarife.
  assert.equal(await page.locator(".offer-early-note").count(), 22);
  await page.close();
});

test("2 — frühe Karte (10:30): neutrale Timeline PLUS eigenes grünes Feld", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);

  const note = page.locator(".offer-early-note", { hasText: "Lieferung bis 10:30 Uhr" }).first();
  assert.ok(await note.count() > 0, "kein Hinweisfeld für 10:30 gefunden");
  assert.ok(await note.isVisible());

  const karte = note.locator("xpath=ancestor::div[contains(@class,'offer-card')]");
  // Die normale Zeile ist neutral: Datum allein primär, Uhrzeit als Unterzeile.
  const primary = await karte.locator(".offer-tl-node--end .offer-tl-primary").textContent();
  const sub     = await karte.locator(".offer-tl-node--end .offer-tl-sub").textContent();
  assert.ok(!/bis /.test(primary), `die Datumszeile enthält die Uhrzeit: „${primary}"`);
  assert.match(primary.trim(), /\d{2}\.\d{2}\.$|Aug|Sep/);
  assert.equal(sub.trim(), "bis 10:30 Uhr");
  const primStil = await karte.locator(".offer-tl-node--end .offer-tl-primary").evaluate(
    (el) => getComputedStyle(el).color);
  assert.notEqual(primStil, "rgb(47, 107, 82)", "die Datumszeile darf nicht grün sein");

  // Das Feld selbst: Success-Fläche, Kontur, grüner Text, kleiner Radius.
  const stil = await note.evaluate((el) => {
    const s = getComputedStyle(el);
    return { farbe: s.color, flaeche: s.backgroundColor, rand: s.borderTopWidth,
             radius: s.borderTopLeftRadius, groesse: s.fontSize, schatten: s.boxShadow };
  });
  assert.equal(stil.farbe, "rgb(47, 107, 82)");
  assert.equal(stil.flaeche, "rgb(238, 244, 241)");
  assert.equal(stil.rand, "1px");
  assert.equal(stil.radius, "8px", "kleiner Radius, keine Pillenform");
  assert.equal(stil.groesse, "12px");
  assert.equal(stil.schatten, "none", "ein Statushinweis trägt keine Tiefe");
  await page.close();
});

test("3 — Tagesendkarte (17:00): Uhrzeit sichtbar, KEIN grünes Feld", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);

  const sub = page.locator(".offer-tl-node--end .offer-tl-sub", { hasText: "bis 17:00 Uhr" }).first();
  assert.ok(await sub.count() > 0, "der Tagesendwert wurde entfernt statt nur zurückgenommen");
  assert.ok(await sub.isVisible());
  const karte = sub.locator("xpath=ancestor::div[contains(@class,'offer-card')]");
  assert.equal(await karte.locator(".offer-early-note").count(), 0);
  await page.close();
});

/* ── Szenario A/B: Filter ────────────────────────────────────────────────── */

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

  // Das Uhrzeitfeld ist jetzt bedienbar — ein Feld, keine Pillenreihe.
  const feld = page.locator(".offers-time-select");
  assert.equal(await feld.count(), 1);
  assert.equal(await feld.isDisabled(), false);
  assert.equal(await page.locator(".offers-time-hint").count(), 0);
  await page.close();
});

test("5 — Uhrzeit 10:30 reduziert die Liste weiter, ohne neuen Preisrequest", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);

  await oeffneLieferzeit(page);
  // Ohne Datum ist das Feld deaktiviert und erklärt sich.
  assert.equal(await page.locator(".offers-time-select").isDisabled(), true);
  assert.match(await page.locator(".offers-time-hint").textContent(), /Erst ein Datum wählen/);

  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForFunction(
    () => document.querySelector(".offers-time-select") && !document.querySelector(".offers-time-select").disabled,
    null, { timeout: 10000 });

  // Die Optionen kommen aus den geladenen Tarifen, nicht aus einer festen Liste.
  const optionen = await page.locator(".offers-time-select option").allTextContents();
  assert.deepEqual(optionen.map((s) => s.trim()),
    ["Beliebig", "08:00 Uhr", "09:00 Uhr", "10:00 Uhr", "10:30 Uhr",
     "12:00 Uhr", "13:00 Uhr", "17:00 Uhr", "18:00 Uhr"]);

  const vorher = await anzahlKarten(page);
  await page.locator(".offers-time-select").selectOption("10:30");
  await page.waitForSelector(".offers-delivery-dropdown", { state: "detached", timeout: 10000 });

  const nachher = await anzahlKarten(page);
  assert.ok(nachher < vorher, `Uhrzeit hat nicht gefiltert (${vorher} → ${nachher})`);
  assert.equal(zaehler.n, 1, "die Uhrzeitauswahl darf KEINEN /calculate-price-Request auslösen");

  // Chip und Formularfeld nennen beides.
  const chip = page.locator(".offers-filter-chip", { hasText: "Lieferung" });
  assert.match((await chip.textContent()).trim(), /^Lieferung bis 31\.08\.2026, 10:30$/);
  const feldwert = await page.locator(".service-filter-trigger-val").last().textContent();
  assert.match(feldwert.trim(), /·\s*10:30$/, `Formularfeld zeigt „${feldwert}"`);
  await page.close();
});

test("6 — Zurücksetzen bringt alle 41 Karten zurück, ohne neuen Preisrequest", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);

  await oeffneLieferzeit(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForFunction(
    () => document.querySelector(".offers-time-select") && !document.querySelector(".offers-time-select").disabled,
    null, { timeout: 10000 });
  await page.locator(".offers-time-select").selectOption("10:30");
  await page.waitForSelector(".offers-delivery-dropdown", { state: "detached", timeout: 10000 });
  assert.ok(await anzahlKarten(page) < 41);

  await page.locator(".offers-filter-reset-btn").click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 41, null, { timeout: 10000 });

  assert.equal(await anzahlKarten(page), 41);
  assert.equal((await page.locator(".offers-filter-chip", { hasText: "Lieferung" }).textContent()).trim(), "Lieferung");
  // Auch die Uhrzeit ist weg — das Formularfeld steht wieder auf „Beliebig".
  const feldwert = await page.locator(".service-filter-trigger-val").last().textContent();
  assert.equal(feldwert.trim(), "Beliebig");
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

  // Das neue Hinweisfeld darf das Layout NICHT verziehen: eine Karte mit Feld
  // und eine ohne müssen dieselbe Timeline-Geometrie und dieselbe Preisspalte
  // haben. Gemessen, nicht angenommen.
  const versatz = await page.evaluate(() => {
    const karten = [...document.querySelectorAll(".offer-card")];
    const mit  = karten.find((k) => k.querySelector(".offer-early-note"));
    const ohne = karten.find((k) => !k.querySelector(".offer-early-note"));
    const geo = (k) => {
      const tl = k.querySelector(".offer-tl-labels").getBoundingClientRect();
      const zone3 = k.querySelector(".offer-zone-3").getBoundingClientRect();
      const ende = k.querySelector(".offer-tl-node--end").getBoundingClientRect();
      return { tlLinks: Math.round(tl.left), tlBreite: Math.round(tl.width),
               endeLinks: Math.round(ende.left), preisLinks: Math.round(zone3.left) };
    };
    return { mit: geo(mit), ohne: geo(ohne) };
  });
  assert.deepEqual(versatz.mit, versatz.ohne,
    "das Hinweisfeld verschiebt Timeline oder Preisspalte");
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

  // Das neue Hinweisfeld passt vollständig in die Karte, ohne Überlauf.
  const note = await page.evaluate(() => {
    const n = document.querySelector(".offer-early-note");
    if (!n) return null;
    const k = n.closest(".offer-card").getBoundingClientRect();
    const r = n.getBoundingClientRect();
    return { drin: r.left >= k.left - 1 && r.right <= k.right + 1,
             text: n.textContent.trim(), abgeschnitten: n.scrollWidth > n.clientWidth + 1 };
  });
  assert.ok(note, "kein Hinweisfeld auf Mobile gerendert");
  assert.equal(note.drin, true, "das Hinweisfeld ragt aus der Karte");
  assert.equal(note.abgeschnitten, false, "der Text ist abgeschnitten");
  assert.match(note.text, /^Lieferung bis \d{2}:\d{2} Uhr$/);

  // Und das Uhrzeitfeld ist auf Mobile bedienbar.
  await oeffneLieferzeit(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForFunction(
    () => document.querySelector(".offers-time-select") && !document.querySelector(".offers-time-select").disabled,
    null, { timeout: 10000 });
  const feld = await page.locator(".offers-time-select").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { hoehe: Math.round(r.height), inSicht: r.left >= 0 && r.right <= window.innerWidth };
  });
  assert.equal(feld.inSicht, true, "das Uhrzeitfeld läuft aus dem Bild");
  assert.ok(feld.hoehe >= 40, `Trefferfläche zu klein: ${feld.hoehe}px`);
  await page.close();
});
