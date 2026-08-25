// E2E: Bundesstaat im internationalen Versandformular — echter Dev-Server.
//
// Gezielter Smoke für den internationalen Formularfluss (KEINE vollständige Suite). Geprüft
// wird, was eine Quelltextprüfung nicht erreicht: dass das Feld für US/CA wirklich erscheint,
// für ein nationales Ziel wirklich NICHT existiert, dass es die Preisberechnung blockiert
// solange es leer ist — und dass der gewählte Code am Ende tatsächlich im Request steht.
//
// NIEMALS eine echte Bestellung: /calculate-price wird gemockt, /orders nie erreicht.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, angebotsCta } from "./helpers/newShipmentForm.mjs";

const PORT = 5348, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const US_EMPFAENGER = {
  country: "US", state: "OR", company: "Acme Inc", fullName: "Jane Doe",
  street: "100 West 33rd Street", zip: "97452", city: "Leaburg",
};

let server, browser;

/** Nimmt den zuletzt gesendeten /calculate-price-Body auf. */
async function setupRoutes(page, aufnahme = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) {
      aufnahme.body = JSON.parse(route.request().postData() || "{}");
      return json({
        shipmentId: "s_" + "a".repeat(32), ceShipmentId: 1,
        tariffs: [], availableShippingModes: [], publicCarriers: [],
        customsRequired: true, fromCountryCode: "DE", toCountryCode: "US", exportDeclaration: null,
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function neueSendung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ns-weight", { timeout: 20000 });
}

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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits node
    // startet. Ein Signal an den npx-Prozess liesse den Enkel auf seinem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — nationales Ziel: das Bundesstaatfeld existiert NICHT", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await neueSendung(page);
  await page.locator("#ns-r-country").selectOption("DE");
  assert.equal(await page.locator("#ns-r-state").count(), 0,
    "bei einem deutschen Ziel darf kein Bundesstaat abgefragt werden");
  assert.equal(await page.locator("#ns-s-state").count(), 0);
  await page.close();
});

test("2 — US-Ziel: das Feld erscheint als Auswahl mit 51 Einträgen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await neueSendung(page);
  await page.locator("#ns-r-country").selectOption("US");
  await page.waitForSelector("#ns-r-state", { timeout: 10000 });
  const feld = page.locator("#ns-r-state");
  assert.equal(await feld.evaluate((n) => n.tagName.toLowerCase()), "select",
    "Freitext wäre falsch — gesendet wird der zweistellige Code");
  // 51 Bundesstaaten (inkl. DC) + die Platzhalterzeile
  assert.equal(await feld.locator("option").count(), 52);
  await page.close();
});

test("3 — das Land wechselt, das Feld folgt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await neueSendung(page);
  await page.locator("#ns-r-country").selectOption("US");
  await page.waitForSelector("#ns-r-state");
  await page.locator("#ns-r-country").selectOption("CA");
  await page.waitForFunction(() => document.querySelectorAll("#ns-r-state option").length === 14);
  await page.locator("#ns-r-country").selectOption("DE");
  await page.waitForSelector("#ns-r-state", { state: "detached", timeout: 10000 });
  assert.equal(await page.locator("#ns-r-state").count(), 0, "zurück auf DE blendet das Feld aus");
  await page.close();
});

test("4 — ohne Bundesstaat bleibt die Preisberechnung gesperrt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await neueSendung(page);
  await fuelleVersandformular(page, { empfaenger: { ...US_EMPFAENGER, state: undefined } });
  await page.waitForSelector("#ns-r-state", { timeout: 10000 });
  assert.equal(await page.locator("#ns-r-state").inputValue(), "", "Vorbedingung: Feld ist leer");
  assert.equal(await angebotsCta(page).isDisabled(), true,
    "eine unvollständige US-Adresse darf keinen Tarif anfragen");
  await page.close();
});

test("5 — mit Bundesstaat läuft die Berechnung und der Code steht im Request", async () => {
  const aufnahme = {};
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, aufnahme);
  await neueSendung(page);
  await fuelleVersandformular(page, { empfaenger: US_EMPFAENGER });
  assert.equal(await angebotsCta(page).isDisabled(), false, "vollständige Adresse → CTA frei");
  await angebotsCta(page).click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(1500);

  assert.ok(aufnahme.body, "es wurde kein /calculate-price-Request abgesetzt");
  assert.equal(aufnahme.body.recipient.state, "OR", "der Bundesstaat fehlt im Request");
  assert.equal(aufnahme.body.recipient.country, "US");
  // Der deutsche Absender trägt keinen — das Feld entsteht dort gar nicht.
  assert.equal(aufnahme.body.sender.state, undefined,
    "ein Land ohne Bundesstaatpflicht darf das Feld nicht senden");
  await page.close();
});
