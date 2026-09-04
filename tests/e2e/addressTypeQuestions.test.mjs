// E2E: die Angaben zur Art der Adresse im Buchungsschritt.
//
// Gemessen wird am echten Dev-Server mit gemocktem Backend — NIEMALS eine echte
// Bestellung. Der `/book`-Aufruf wird abgefangen und sein Körper geprüft, statt ihn
// durchzulassen.
//
// Die drei Fragen dieser Datei:
//   1. Wird bei einer Paketshopabgabe wirklich NICHT nach der Abholadresse gefragt?
//   2. Überlebt ein bewusstes „Nein" die Navigation — oder wird daraus „unbeantwortet"?
//   3. Steht irgendwo ein Providername?
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5271, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const basisTarif = (uebergabe) => ({
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dhl", publicCarrierName: "DHL Express",
  publicServiceName: "Standardversand", serviceType: uebergabe, currency: "EUR",
  netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19, transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  // Die providerneutrale Angebotskennung, wie sie /calculate-price liefert.
  offerId: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
  pickupDate: "2026-08-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-08-08T00:00:00Z",
});

const FELD_LIEFER = "deliveryIsResidential";
const FELD_ABHOL  = "collectionIsResidential";

let server, browser;

async function setupRoutes(page, { uebergabe = "pickup", onBook } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });

    // Der Buchungsaufruf wird ABGEFANGEN — es entsteht nie eine Bestellung.
    if (p.endsWith("/api/jumingo/book")) {
      if (onBook) onBook(JSON.parse(req.postData() || "{}"));
      await page.evaluate(() => { window.__ceBookCalls = (window.__ceBookCalls || 0) + 1; }).catch(() => {});
      return json({ success: true, shipmentId: "s1", ceShipmentId: 1, trackingNumber: "X" });
    }
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", tariffs: [basisTarif(uebergabe)], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    return json({});
  });
  await page.addInitScript(() => { localStorage.setItem("ce_token", "e2e-token"); window.__ceBookCalls = 0; });
}

async function zurBuchung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".adr-typ-group", { timeout: 20000 });
}

const waehle = (page, feld, ja) => page.locator(`#${feld}-${ja ? "ja" : "nein"}`).click();

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { detached: true, stdio: "ignore" });
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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits
    // node startet. Ein Signal an npx liesse den Enkel auf seinem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

/* ══════════ 1 — WELCHE FRAGE ERSCHEINT ══════════ */

test("1 — Abholung fragt nach BEIDEN Adressen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "pickup" });
  await zurBuchung(page);
  assert.equal(await page.locator(`#${FELD_ABHOL}-ja`).count(), 1, "die Abholfrage fehlt");
  assert.equal(await page.locator(`#${FELD_LIEFER}-ja`).count(), 1, "die Lieferfrage fehlt");
  await page.close();
});

test("2 — Paketshopabgabe fragt NICHT nach der Abholadresse", async () => {
  // Dorthin faehrt niemand. Eine Pflichtfrage ohne Preiswirkung ist genau die Art
  // Formularfeld, die Leute zum Abbrechen bringt.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "dropoff" });
  await zurBuchung(page);
  assert.equal(await page.locator(`#${FELD_ABHOL}-ja`).count(), 0,
    "bei Paketshopabgabe wurde nach der Abholadresse gefragt");
  assert.equal(await page.locator(`#${FELD_LIEFER}-ja`).count(), 1);
  await page.close();
});

/* ══════════ 2 — DAS NEIN BLEIBT EIN NEIN ══════════ */

test("3 — ein bewusstes „Nein\" ueberlebt Zurueck und Vor", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "pickup" });
  await zurBuchung(page);

  await waehle(page, FELD_ABHOL, false);
  await waehle(page, FELD_LIEFER, false);
  assert.equal(await page.locator(`#${FELD_ABHOL}-nein`).isChecked(), true);

  // Zurueck zu den Angeboten und wieder hinein.
  await page.locator("button.btn-outline", { hasText: "Zurück" }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".adr-typ-group", { timeout: 20000 });

  assert.equal(await page.locator(`#${FELD_ABHOL}-nein`).isChecked(), true,
    "das Nein zur Abholadresse ist verlorengegangen");
  assert.equal(await page.locator(`#${FELD_LIEFER}-nein`).isChecked(), true,
    "das Nein zur Lieferadresse ist verlorengegangen");
  // Und es wurde NICHT still zu „unbeantwortet": die Ja-Option ist weiterhin leer.
  assert.equal(await page.locator(`#${FELD_ABHOL}-ja`).isChecked(), false);
  await page.close();
});

test("4 — ohne Antwort ist keine der beiden Optionen markiert", async () => {
  // Ein Schalter stuende hier auf „aus" und behauptete eine Antwort. Zwei Radios
  // ohne Vorauswahl sagen die Wahrheit.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "pickup" });
  await zurBuchung(page);
  for (const feld of [FELD_ABHOL, FELD_LIEFER]) {
    assert.equal(await page.locator(`#${feld}-ja`).isChecked(), false, `${feld}: Ja war vorausgewaehlt`);
    assert.equal(await page.locator(`#${feld}-nein`).isChecked(), false, `${feld}: Nein war vorausgewaehlt`);
  }
  await page.close();
});

/* ══════════ 3 — DER ECHTE PAYLOAD ══════════ */

test("5 — der /book-Koerper traegt false als false und nur die noetigen Felder", async () => {
  const koerper = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "dropoff", onBook: (b) => koerper.push(b) });
  await zurBuchung(page);

  await waehle(page, FELD_LIEFER, false);
  await page.locator("button.btn-primary", { hasText: "Weiter" }).first().click();
  // Der Bestellknopf traegt eine eigene Klasse — `.btn-primary` allein trifft auch
  // andere Knoepfe der Seite und waere je nach Reihenfolge der falsche.
  // Die beiden Pflichtbestaetigungen (AGB, ausgeschlossene Gegenstaende) — ohne sie
  // bleibt der Bestellknopf zu Recht gesperrt. Sie sind NICHT Gegenstand dieser Suite,
  // aber ohne sie kaeme kein Request zustande, den man pruefen koennte.
  const bestellen = page.locator("button.booking-book-btn");
  await bestellen.waitFor({ state: "visible", timeout: 20000 });
  for (const cb of await page.locator(".booking-terms input[type=checkbox], .booking-agb-checkbox").all()) {
    if (!(await cb.isChecked())) await cb.check();
  }
  await page.waitForFunction(
    () => { const b = document.querySelector("button.booking-book-btn"); return b && !b.disabled; },
    null, { timeout: 20000 });
  await bestellen.click();
  await page.waitForFunction(() => window.__ceBookCalls > 0, null, { timeout: 20000 })
    .catch(() => { /* die Zusicherung unten meldet es praeziser */ });

  assert.equal(koerper.length, 1, `es wurde ${koerper.length}-mal gebucht`);
  const b = koerper[0];
  assert.equal(b.priceInputs[FELD_LIEFER], false, "aus dem Nein wurde etwas anderes");
  assert.ok(!(FELD_ABHOL in b.priceInputs),
    "bei Paketshopabgabe wurde eine Abholangabe mitgesendet, die niemand braucht");
  assert.equal(b.offerId, "a1b2c3d4e5f60718293a4b5c6d7e8f90", "die Angebotskennung fehlt");
  await page.close();
});

test("6 — ohne Antwort kommt gar kein Buchungsrequest zustande", async () => {
  const koerper = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "pickup", onBook: (b) => koerper.push(b) });
  await zurBuchung(page);

  await page.locator("button.btn-primary", { hasText: "Weiter" }).first().click();
  await new Promise((r) => setTimeout(r, 1000));
  // Die Seite bleibt auf Schritt 1, und es wurde nichts gebucht.
  assert.equal(await page.locator(".adr-typ-group").count() > 0, true,
    "die Seite ist trotz fehlender Angabe weitergegangen");
  assert.equal(koerper.length, 0, "es wurde ohne Adressangabe gebucht");
  await page.close();
});

/* ══════════ 4 — BREITEN UND WHITE LABEL ══════════ */

test("7 — auf 1440, 834 und 390 ist alles bedienbar und nichts laeuft ueber", async () => {
  for (const breite of [1440, 834, 390]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 900 } });
    await setupRoutes(page, { uebergabe: "pickup" });
    await zurBuchung(page);

    for (const feld of [FELD_ABHOL, FELD_LIEFER]) {
      const box = await page.locator(`#${feld}-ja`).locator("xpath=ancestor::label[1]").boundingBox();
      assert.ok(box, `${breite}px: ${feld} nicht sichtbar`);
      assert.ok(box.x >= 0 && box.x + box.width <= breite + 1,
        `${breite}px: ${feld} laeuft aus dem Bild (${box.x}..${box.x + box.width})`);
      // Auf Touchbreiten muss die Trefferflaeche 44 px erreichen (WCAG 2.5.5).
      if (breite <= 860) {
        assert.ok(box.height >= 44, `${breite}px: ${feld} nur ${box.height}px hoch`);
      }
    }
    // Und die Auswahl funktioniert auch schmal.
    await waehle(page, FELD_LIEFER, true);
    assert.equal(await page.locator(`#${FELD_LIEFER}-ja`).isChecked(), true,
      `${breite}px: die Auswahl liess sich nicht setzen`);
    await page.close();
  }
});

test("8 — kein Providername irgendwo auf der Buchungsseite", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "pickup" });
  await zurBuchung(page);
  const sichtbar = (await page.locator("body").innerText()).toLowerCase();
  for (const w of ["transglobal", "jumingo"]) {
    assert.ok(!sichtbar.includes(w), `"${w}" steht sichtbar auf der Buchungsseite`);
  }
  await page.close();
});
