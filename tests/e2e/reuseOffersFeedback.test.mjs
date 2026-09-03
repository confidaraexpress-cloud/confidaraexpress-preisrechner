// E2E: „Angebote vergleichen" reagiert sichtbar, wenn es NICHT neu rechnet.
//
// Gemockt, gegen einen echten Dev-Server. Niemals eine echte Berechnung,
// niemals eine Bestellung, niemals ein echter Providerkontakt.
//
// Die tragende Messung ist in jedem Szenario dieselbe Konjunktion:
//   • der Requestzähler bleibt stehen (der Wiederverwendungsschutz gilt weiter)
//   • UND der Angebotsbereich steht danach im sichtbaren Bereich.
// Vor diesem Paket war nur die erste Hälfte erfüllt — der Knopf wirkte tot.
// R5 ist die Gegenprobe: ein preisrelevantes Feld MUSS weiterhin neu rechnen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_ABSENDER } from "./helpers/newShipmentForm.mjs";
import { TARIFE_41, VERSANDZEITPUNKT, LIEFERFRIST_TAG }
  from "../../src/utils/offersFilterFixture.mjs";

const PORT = 5346, BASE = `http://127.0.0.1:${PORT}`;

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
    // Browserzeit auf den Messzeitpunkt der Fixture fixieren. Ohne das hängt der
    // Lieferdatum-Kalender am REALEN Kalendermonat, und der Tag, den diese Suite
    // anklickt, existiert nur in Monaten mit 31 Tagen (Begründung samt Vorfall in
    // `offersFilterFixture.mjs`). Der Aufruf steht ganz oben in dieser Funktion,
    // durch die JEDE navigierende Seite dieser Datei läuft — damit vor jeder
    // Navigation und vor der Routenregistrierung.
    await page.clock.setFixedTime(new Date(VERSANDZEITPUNKT));
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

// ── Der Messpunkt, und warum er so scharf sein muss ────────────────────────
//
// Ein erster Entwurf dieser Suite prüfte nur „steht der Angebotsbereich nach dem
// Klick im Sichtfeld?". Diese Fassung bestand die Gegenprobe NICHT: mit
// entferntem Fix liefen alle sechs Szenarien weiterhin grün. Grund ist
// Playwright selbst — `locator.click()` scrollt sein Ziel vorher in den
// sichtbaren Bereich, und der CTA sitzt unmittelbar über den Angeboten. Der
// Test maß damit sein eigenes Werkzeug, nicht das Produkt.
//
// Im Browser gemessen (1440 × 800, 41 Karten), Oberkante von
// `#angebotsbereich` relativ zum Viewport:
//
//     Seitenanfang                       top = 1483   (außer Sicht)
//     nur Playwrights Klick-Scroll       top =  456   (sichtbar, aber tief)
//     nach revealOffers (block:"start")  top =    0
//
// Gemessen wird deshalb `top ≈ 0` — die Aussage von `block: "start"` —, nicht
// bloße Sichtbarkeit. Und der Klick-Scroll wird VORHER selbst ausgeführt, damit
// er als Ausgangslage feststeht und nicht als Ergebnis durchgeht.
async function stelleAusgangslageHer(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 5000 });
  // Genau das, was `locator.click()` gleich ohnehin täte.
  await page.locator(".offers-calc-cta button").first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const t = window.__ce_y; window.__ce_y = window.scrollY;
    return t === window.scrollY;                    // zwei gleiche Messungen = Scroll steht
  }, null, { timeout: 5000, polling: 120 });
  return ankerGeometrie(page);
}

const ankerGeometrie = (page) => page.evaluate(() => {
  const el = document.getElementById("angebotsbereich");
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), imBild: r.top < window.innerHeight && r.bottom > 0,
           scrollY: Math.round(window.scrollY) };
});

// Wartet auf das ERGEBNIS des Scrolls, nicht auf eine Zeitspanne: die Oberkante
// des Angebotsbereichs liegt am Viewportanfang. 4 px Toleranz für Subpixel.
async function angeboteAmSeitenanfang(page) {
  await page.waitForFunction(() => {
    const el = document.getElementById("angebotsbereich");
    return el && Math.abs(el.getBoundingClientRect().top) <= 4;
  }, null, { timeout: 10000 });
  return ankerGeometrie(page);
}

const oeffneLieferzeit = (page) =>
  page.locator(".offers-filter-chip", { hasText: "Lieferung" }).click()
    .then(() => page.waitForSelector(".offers-delivery-dropdown", { timeout: 10000 }));

// Die Wirtsfläche animiert beim Aufklappen 160 ms — erst danach steht der
// Auslöser still. Reine Testsynchronisation.
const ruhig = (page) => page.evaluate(() => Promise.all(
  (document.querySelector(".offers-delivery-dropdown")?.getAnimations() || [])
    .map((a) => a.finished.catch(() => {}))));

async function waehleDatum(page, tag) {
  await oeffneLieferzeit(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: new RegExp(`^${tag}$`) }).first().click();
}

async function waehleZeit(page, text) {
  await page.waitForFunction(() => {
    const t = document.querySelector(".offers-time-trigger");
    return t && !t.disabled;
  }, null, { timeout: 10000 });
  await ruhig(page);
  await page.locator(".offers-time-trigger").click();
  await page.waitForSelector(".offers-time-list", { timeout: 10000 });
  await page.locator(".offers-time-option", { hasText: text }).first().click();
  await page.waitForSelector(".offers-time-list", { state: "detached", timeout: 10000 });
}

const schliesseFlaeche = async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForSelector(".offers-delivery-dropdown", { state: "detached", timeout: 5000 }).catch(() => {});
};

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

test("R1 — unveränderte Eingaben: 0 neue Requests, Angebote rücken ins Bild", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const z = { n: 0 };
  await setupRoutes(page, z);
  await zeigeAngebote(page);
  assert.equal(await anzahlKarten(page), 41);
  assert.equal(z.n, 1, "erste Berechnung");

  const vorher = await stelleAusgangslageHer(page);
  assert.ok(vorher.top > 100, `Ausgangslage untauglich: Anker steht schon bei ${vorher.top}`);

  await page.locator(".offers-calc-cta button").first().click();
  const nachher = await angeboteAmSeitenanfang(page);
  assert.ok(Math.abs(nachher.top) <= 4, "keine sichtbare Reaktion — der Knopf wirkt tot");
  assert.ok(nachher.scrollY > vorher.scrollY, "die Seite hat sich gar nicht bewegt");
  assert.equal(z.n, 1, "es darf KEIN zweiter /calculate-price rausgehen");
  assert.equal(await anzahlKarten(page), 41, "die vorhandenen Angebote wurden verändert");
  await page.close();
});

test("R2 — Uhrzeitfilter geändert: clientseitig gefiltert, 0 Requests, sichtbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const z = { n: 0 };
  await setupRoutes(page, z);
  await zeigeAngebote(page);

  await waehleDatum(page, LIEFERFRIST_TAG);
  await waehleZeit(page, "12:00 Uhr");
  await schliesseFlaeche(page);
  const gefiltert = await anzahlKarten(page);
  assert.ok(gefiltert > 0 && gefiltert < 41, `Uhrzeitfilter hat nicht gefiltert (${gefiltert})`);
  assert.equal(z.n, 1, "eine Filteränderung darf nie einen Request auslösen");

  const vorher = await stelleAusgangslageHer(page);
  assert.ok(vorher.top > 100, `Ausgangslage untauglich: Anker steht schon bei ${vorher.top}`);
  await page.locator(".offers-calc-cta button").first().click();
  assert.ok(Math.abs((await angeboteAmSeitenanfang(page)).top) <= 4);
  assert.equal(z.n, 1, "Uhrzeit steht in FILTER_ONLY_FIELDS — kein neuer Request");
  assert.equal(await anzahlKarten(page), gefiltert, "der Filter wurde beim Klick verworfen");
  await page.close();
});

test("R3 — Lieferdatumfilter geändert: 0 Requests, sichtbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const z = { n: 0 };
  await setupRoutes(page, z);
  await zeigeAngebote(page);

  await waehleDatum(page, LIEFERFRIST_TAG);
  await schliesseFlaeche(page);
  const gefiltert = await anzahlKarten(page);
  assert.ok(gefiltert > 0 && gefiltert <= 41);
  assert.equal(z.n, 1);

  const vorher = await stelleAusgangslageHer(page);
  assert.ok(vorher.top > 100, `Ausgangslage untauglich: Anker steht schon bei ${vorher.top}`);
  await page.locator(".offers-calc-cta button").first().click();
  assert.ok(Math.abs((await angeboteAmSeitenanfang(page)).top) <= 4);
  assert.equal(z.n, 1, "latestDeliveryDate ist kein Preisschlüssel — kein neuer Request");
  assert.equal(await anzahlKarten(page), gefiltert);
  await page.close();
});

test("R4 — gar keine Änderung: 0 Requests, trotzdem sichtbare Reaktion", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const z = { n: 0 };
  await setupRoutes(page, z);
  await zeigeAngebote(page);

  const vorher = await stelleAusgangslageHer(page);
  assert.ok(vorher.top > 100, `Ausgangslage untauglich: Anker steht schon bei ${vorher.top}`);
  await page.locator(".offers-calc-cta button").first().click();
  assert.ok(Math.abs((await angeboteAmSeitenanfang(page)).top) <= 4);
  assert.equal(z.n, 1);

  // Auch der zweite Klick bleibt stumm im Netz und sichtbar in der Oberfläche.
  await stelleAusgangslageHer(page);
  await page.locator(".offers-calc-cta button").first().click();
  assert.ok(Math.abs((await angeboteAmSeitenanfang(page)).top) <= 4);
  assert.equal(z.n, 1);
  await page.close();
});

test("R5 — Gegenprobe: preisrelevantes Feld rechnet weiterhin echt neu", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const z = { n: 0 };
  await setupRoutes(page, z);
  await zeigeAngebote(page);
  assert.equal(z.n, 1);

  await page.locator("#ns-weight").fill("7");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 0, null, { timeout: 5000 });

  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(z.n, 2, "geänderter Preisschlüssel MUSS neu rechnen — der Reuse-Scroll darf das nie ersetzen");
  assert.equal(await anzahlKarten(page), 41);
  await page.close();
});

test("R6 — prefers-reduced-motion: der Sprung ist sofort, nicht animiert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 }, reducedMotion: "reduce" });
  const z = { n: 0 };
  await setupRoutes(page, z);
  await zeigeAngebote(page);
  const vorher = await stelleAusgangslageHer(page);
  assert.ok(vorher.top > 100);

  await page.locator(".offers-calc-cta button").first().click();
  // Zwei Frames reichen, wenn wirklich „instant" gescrollt wird. Mit
  // `behavior: "auto"` griffe `html { scroll-behavior: smooth }` und der Anker
  // stünde nach zwei Frames noch weit unterhalb des Seitenanfangs.
  const sofort = await page.evaluate(() => new Promise((res) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      res(Math.round(document.getElementById("angebotsbereich").getBoundingClientRect().top));
    }));
  }));
  assert.ok(Math.abs(sofort) <= 4,
    `bei reduzierter Bewegung darf nicht animiert gescrollt werden (Anker bei ${sofort})`);
  assert.equal(z.n, 1);
  await page.close();
});

test("R7 — der Versandkostenrechner reagiert identisch", async () => {
  // Zweite Seite, gleiche Regel. Gemessen wird hier `.offers-section` — der
  // Rechner braucht keinen benannten Anker (niemand verlinkt dorthin), sein
  // Wrapper trägt nur die Referenz. Die Oberkanten von Wrapper und
  // `.offers-section` fallen zusammen: der Wrapper hat weder Rand noch Polster.
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const z = { n: 0 };
  await setupRoutes(page, z);
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  for (const [id, wert] of [
    ["calc-from-zip", "97421"], ["calc-to-zip", "63743"], ["calc-weight", "3"],
    // Ort beider Seiten ist Pflicht (siehe „Ort ist Pflicht"); das Testkonto
    // dieser Datei trägt keinen Ort im Profil.
    ["calc-from-city", "Schweinfurt"], ["calc-to-city", "Aschaffenburg"],
    ["calc-packageCount", "1"], ["calc-length", "10"], ["calc-width", "10"], ["calc-height", "10"],
  ]) await page.fill(`#${id}`, wert);

  const rechnerCta = page.getByRole("button", { name: /Angebote vergleichen/i }).first();
  await rechnerCta.click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(z.n, 1);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 5000 });
  await rechnerCta.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const t = window.__ce_y; window.__ce_y = window.scrollY;
    return t === window.scrollY;
  }, null, { timeout: 5000, polling: 120 });
  const vorher = await page.evaluate(() =>
    Math.round(document.querySelector(".offers-section").getBoundingClientRect().top));
  assert.ok(vorher > 100, `Ausgangslage untauglich: Angebote stehen schon bei ${vorher}`);

  await rechnerCta.click();
  await page.waitForFunction(() =>
    Math.abs(document.querySelector(".offers-section").getBoundingClientRect().top) <= 4,
  null, { timeout: 10000 });
  assert.equal(z.n, 1, "der Rechner hat bei unveränderten Eingaben neu gerechnet");
  assert.equal(await anzahlKarten(page), 41, "die vorhandenen Angebote wurden verändert");
  await page.close();
});
