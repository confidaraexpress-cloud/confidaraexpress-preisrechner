// E2E: aktive Ergebnisfilter der Angebotsliste — echter Dev-Server.
//
// Der forensisch belegte Fehlerfall: eine echte Antwort lieferte 41 Tarife, der
// Kunde hatte im Formular „Späteste Lieferzeit = 31.08.2026" gesetzt, es
// standen 21 Karten — und die Überschrift meldete unverändert „41 Angebote
// gefunden". Es gab weder einen Chip noch einen Zurücksetzen-Knopf, und die
// Bedienung des Filters liegt weit oben im Formular, beim Lesen der Ergebnisse
// also außerhalb des Bildes.
//
// Geprüft wird hier, was eine Quelltextprüfung nicht erreicht:
//   • wie viele Karten tatsächlich im DOM stehen,
//   • welcher Satz in der Überschrift steht,
//   • ob der Lieferzeit-Chip sichtbar und als aktiv erkennbar ist,
//   • dass Zurücksetzen die volle Liste zurückbringt,
//   • und dass dabei KEIN neuer /calculate-price-Request rausgeht.
//
// Bewusst gegen ein gemocktes Backend — niemals eine echte Berechnung, niemals
// eine Bestellung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_ABSENDER } from "./helpers/newShipmentForm.mjs";
import { TARIFE_41 } from "../../src/utils/offersFilterFixture.mjs";

const PORT = 5343, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "97421", customer_number: "CE-K-10030",
};

// Die 41 Tarife der echten Antwort, angereichert um die Felder, welche die
// Angebotskarte zum Rendern braucht. Preise, IDs, Übergabeart, Versandart und
// die Lieferdaten stammen unverändert aus der Fixture.
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

// Zählt JEDEN /calculate-price-Aufruf, damit „kein neuer Request" messbar ist
// und nicht behauptet werden muss.
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

// Setzt die späteste Lieferzeit über den NEUEN Chip an der Ergebnisliste.
async function setzeLieferzeit(page, tag) {
  await page.locator(".offers-filter-chip", { hasText: "Lieferung" }).click();
  await page.waitForSelector(".offers-delivery-dropdown", { timeout: 10000 });
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: new RegExp(`^${tag}$`) }).first().click();
  await page.waitForSelector(".offers-delivery-dropdown", { state: "detached", timeout: 10000 });
}

const anzahlKarten = (page) => page.locator(".offer-card").count();
const ueberschrift  = (page) => page.locator(".offers-result-count").textContent();

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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das
    // seinerseits node startet. Ein Signal an den npx-Prozess ließe den Enkel
    // — den eigentlichen Dev-Server — auf seinem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — ohne Filter: 41 Karten, „41 Angebote“, kein aktiver Lieferzeit-Chip", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);

  assert.equal(await anzahlKarten(page), 41);
  assert.match(await ueberschrift(page), /^41 Angebote$/);
  const chip = page.locator(".offers-filter-chip", { hasText: "Lieferung" });
  assert.equal(await chip.count(), 1, "der Lieferzeit-Chip fehlt an der Ergebnisliste");
  assert.equal((await chip.textContent()).trim(), "Lieferung");
  assert.equal(await chip.evaluate(el => el.classList.contains("has-filter")), false);
  assert.equal(await page.locator(".offers-filter-reset-btn").count(), 0,
    "ohne Filter darf kein Zurücksetzen-Knopf stehen");
  await page.close();
});

test("2 — späteste Lieferzeit 31.08.: 21 Karten und „21 Angebote“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);
  const nachBerechnung = zaehler.n;

  await setzeLieferzeit(page, "31");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 21, null, { timeout: 10000 });

  assert.equal(await anzahlKarten(page), 21);
  assert.match(await ueberschrift(page), /^21 Angebote$/);
  // Die Überschrift bezieht sich nicht mehr auf die Gesamtzahl — der Filter
  // bleibt über Chip und Zurücksetzen sichtbar (Test 3 prüft beides).
  assert.doesNotMatch(await ueberschrift(page), /von 41|angezeigt|gefunden/);
  // Der günstigste Tarif (DPD Paketshop, 5,71 €) stellt erst am 02.09. zu und
  // MUSS verschwinden — das ist richtiges Verhalten, nicht der Fehler.
  const preise = await page.locator(".offer-price").allInnerTexts();
  assert.ok(!preise.some(p => p.includes("5,71")), "ein Tarif mit späterer Zustellung ist sichtbar geblieben");
  assert.ok(preise[0].includes("18,65"), `erste Karte unerwartet: ${preise[0]}`);
  // Ein Client-Filter darf keine neue Preisberechnung auslösen.
  assert.equal(zaehler.n, nachBerechnung, "der Lieferzeitfilter hat eine Preisberechnung ausgelöst");
  await page.close();
});

test("3 — der gesetzte Filter ist an der Ergebnisliste sichtbar und benannt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);
  await setzeLieferzeit(page, "31");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 21, null, { timeout: 10000 });

  const chip = page.locator(".offers-filter-chip", { hasText: "Lieferung" });
  assert.match((await chip.textContent()).trim(), /^Lieferung bis 31\.08\.2026$/);
  assert.equal(await chip.evaluate(el => el.classList.contains("has-filter")), true,
    "der Chip weist den Filter nicht als aktiv aus");
  assert.equal(await page.locator(".offers-filter-reset-btn").count(), 1,
    "der Zurücksetzen-Knopf fehlt, obwohl ein Filter aktiv ist");
  // Der Chip steht im sichtbaren Bereich der Ergebnisliste, nicht im Formular.
  assert.equal(await page.locator(".offers-filter-zone .offers-filter-chip", { hasText: "Lieferung" }).count(), 1);
  await page.close();
});

test("4 — Zurücksetzen bringt alle 41 Karten zurück, ohne neue Preisberechnung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);
  await setzeLieferzeit(page, "31");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 21, null, { timeout: 10000 });
  const vorReset = zaehler.n;

  await page.locator(".offers-filter-reset-btn").click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 41, null, { timeout: 10000 });

  assert.equal(await anzahlKarten(page), 41);
  assert.match(await ueberschrift(page), /^41 Angebote$/);
  assert.equal((await page.locator(".offers-filter-chip", { hasText: "Lieferung" }).textContent()).trim(), "Lieferung");
  assert.equal(await page.locator(".offers-filter-reset-btn").count(), 0);
  assert.equal(zaehler.n, vorReset, "das Zurücksetzen hat eine Preisberechnung ausgelöst");
  await page.close();
});

test("5 — der Filter des Formulars und der Chip zeigen denselben Wert", async () => {
  // EIN Zustand, zwei Bedienstellen — kein zweiter, paralleler Filterzustand.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);
  await setzeLieferzeit(page, "31");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 21, null, { timeout: 10000 });

  const werte = await page.locator(".service-filter-trigger-val").allInnerTexts();
  assert.ok(werte.some(v => /31\. Aug\./.test(v)),
    `der Formularfilter zeigt den Wert nicht an: ${JSON.stringify(werte)}`);
  await page.close();
});

test("6 — der Versandkostenrechner verhält sich identisch (dieselbe OffersList)", async () => {
  // /calculator ist die zweite Einstiegsseite. Sie bringt ein eigenes Formular
  // mit, teilt sich mit „Neue Sendung" aber Filterregel UND OffersList — hier
  // wird belegt, dass die Reparatur nicht nur auf einer der beiden greift.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await page.fill("#calc-from-zip", "97421");
  await page.fill("#calc-to-zip", "63743");
  await page.fill("#calc-weight", "3");
  await page.fill("#calc-packageCount", "1");
  await page.fill("#calc-length", "10");
  await page.fill("#calc-width", "10");
  await page.fill("#calc-height", "10");
  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });

  assert.equal(await anzahlKarten(page), 41);
  assert.match(await ueberschrift(page), /^41 Angebote$/);
  const nachBerechnung = zaehler.n;

  await setzeLieferzeit(page, "31");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 21, null, { timeout: 10000 });
  assert.match(await ueberschrift(page), /^21 Angebote$/);
  assert.match((await page.locator(".offers-filter-chip", { hasText: "Lieferung" }).textContent()).trim(),
    /^Lieferung bis 31\.08\.2026$/);

  await page.locator(".offers-filter-reset-btn").click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 41, null, { timeout: 10000 });
  assert.match(await ueberschrift(page), /^41 Angebote$/);
  assert.equal(zaehler.n, nachBerechnung, "Filtern/Zurücksetzen hat eine Preisberechnung ausgelöst");
  await page.close();
});
