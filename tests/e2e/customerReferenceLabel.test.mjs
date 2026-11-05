// E2E: Kundenreferenz am Buchungsfeld — Referenzauftrag 2026-11-05 (B3, B4, B5) — echter Dev-Server.
//
//   B3  Am Referenzfeld steht genau der Satz, den das GEWÄHLTE Angebot trägt (`referenceOnLabel`):
//       auf dem Label belegt / übermittelt, Druck offen / erscheint nicht auf dem Label.
//   B5  Keine stille Kürzung: 40 Zeichen bleiben 40, der Zähler zeigt 40/35, die Meldung steht am Feld,
//       und solange die Referenz nicht passt, entsteht KEIN /book-Request.
//   B4  „Versand vorbereiten" aus einem Lagerauftrag schlägt dessen Kundenreferenz als Buchungsreferenz vor —
//       ungekürzt und änderbar; gebucht wird, was im Feld steht.
//
// Geprüft wird, was eine Quelltextprüfung nicht erreicht: was sichtbar ist und was im Request steht.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, berechneAngebote } from "./helpers/newShipmentForm.mjs";

const PORT = 5742, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const BASIS = {
  serviceType: "pickup", currency: "EUR", transitDaysMin: 1, transitDaysMax: 2,
  labelFormatOptions: ["A4", "A6"], trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-08-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-08-08T00:00:00Z",
};
// Drei Angebote, je eine Referenzaussage — in fester Reihenfolge, damit die Karte eindeutig ist.
const ANGEBOTE = [
  { ...BASIS, id: 1, shipper_tariff_id: 1, publicCarrierId: "ups", publicCarrierName: "UPS",
    publicServiceName: "Expressversand", netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19,
    referenceOnLabel: "printed", referenceLabelVerifiedLength: 17 },
  { ...BASIS, id: 2, shipper_tariff_id: 2, publicCarrierId: "tnt", publicCarrierName: "TNT",
    publicServiceName: "Express", netPrice: 19.65, vatAmount: 3.73, finalPrice: 23.38,
    referenceOnLabel: "transmitted", referenceLabelVerifiedLength: null },
  { ...BASIS, id: 3, shipper_tariff_id: 3, publicCarrierId: "dpd", publicCarrierName: "DPD",
    publicServiceName: "Classic", netPrice: 20.65, vatAmount: 3.92, finalPrice: 24.57,
    referenceOnLabel: "not_supported", referenceLabelVerifiedLength: null },
];

const AUFTRAG = (customerReference) => ({
  id: "500", orderNumber: "CE-AU26-01005", status: "open", warehouseId: "10", warehouseName: "Hauptlager",
  customerReference,
  recipient: { company: "Empfänger GmbH", fullName: "Erika Muster", streetAndNumber: "Zielweg 9", addressAddition: null,
               postalCode: "20095", city: "Hamburg", country: "DE", phone: null, email: null },
  notes: null, itemCount: 1, totalQuantity: 5, openQuantity: 5, shippedQuantity: 0,
  createdAt: "2026-08-10T10:00:00Z", updatedAt: "2026-08-10T10:00:00Z", cancelledAt: null,
});

const REF_TOGGLE = "#booking-reference-toggle";
const REF_INPUT = "#booking-reference";
const REF_COUNT = "#booking-reference-count";
const REF_LABEL = "#booking-reference-label";
const REF_ERROR = "#booking-reference-error";

let server, browser;

async function setupRoutes(page, rec, { auftragsReferenz = null } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.endsWith("/api/kunde/orders")) return json({ orders: [AUFTRAG(auftragsReferenz)], nextCursor: null });
    if (/\/api\/kunde\/orders\/\d+\/shipping-prefill$/.test(p)) {
      return json({
        order: { id: "500", orderNumber: "CE-AU26-01005", customerReference: auftragsReferenz },
        recipient: AUFTRAG(auftragsReferenz).recipient, warehouseId: "10",
        suggestedWeightKg: 6.25, weightComplete: true,
        items: [{ orderItemId: "5", productId: "100", quantity: 5, sku: "ART-1", name: "Artikel A", unitWeightKg: 1.25 }],
      });
    }
    if (p.endsWith("/api/kunde/warehouses")) return json({ warehouses: [{ id: "10", name: "Hauptlager", status: "active", isDefault: true }], nextCursor: null });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      ceShipmentId: 4711, tariffs: ANGEBOTE, availableShippingModes: ["standard", "express"],
      publicCarriers: [{ id: "ups", name: "UPS" }, { id: "tnt", name: "TNT" }, { id: "dpd", name: "DPD" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    if (p.includes("/api/jumingo/book")) {
      rec.book.push(JSON.parse(req.postData() || "{}"));
      return json({ trackingNumber: "TRACK1", labelUrl: null });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function schalte(page, sel, an) {
  const input = page.locator(sel);
  if ((await input.isChecked()) === an) return;
  await input.locator("xpath=ancestor::label[1]").click();
  assert.equal(await input.isChecked(), an, `Schalter ${sel} ließ sich nicht auf ${an} setzen`);
}

// Formular → Angebote → das Angebot an Position `index` → Buchung, Schritt 1.
async function zurBuchungMit(page, index) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await fuelleVersandformular(page);
  await berechneAngebote(page);
  await page.locator(".offer-card:not(.offer-card--unavailable)").nth(index).locator("button.offer-cta-btn").click();
  await page.waitForSelector(REF_TOGGLE, { timeout: 20000 });
}

async function neueSeite(rec, opt, viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  await setupRoutes(page, rec, opt);
  return page;
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
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
  if (server) stopDevServer(server, "SIGKILL");
});

/* ══════════ B3 — der Satz folgt dem gewählten Angebot ══════════ */

test("1 — belegter Druck: „wird auf dem Versandlabel angegeben“, über der belegten Länge mit Zusatz", async () => {
  const rec = { book: [] };
  const page = await neueSeite(rec);
  await zurBuchungMit(page, 0);
  await schalte(page, REF_TOGGLE, true);
  await page.locator(REF_INPUT).fill("BESTELLUNG-4711");
  const satz = page.locator(REF_LABEL);
  assert.equal(await satz.getAttribute("data-reference-on-label"), "printed");
  assert.match(await satz.innerText(), /^Ihre Referenz wird auf dem Versandlabel angegeben\.$/);
  await page.locator(REF_INPUT).fill("BESTELLUNG-2026-0042-XY");
  assert.match(await satz.innerText(), /belegt ist der Druck bis 17 Zeichen/);
  await page.close();
});

test("2 — übermittelt, Druck offen: keine Zusage für das Label", async () => {
  const page = await neueSeite({ book: [] });
  await zurBuchungMit(page, 1);
  await schalte(page, REF_TOGGLE, true);
  const text = await page.locator(REF_LABEL).innerText();
  assert.match(text, /an den Versanddienstleister übermittelt/);
  assert.match(text, /nicht bestätigt/);
  assert.doesNotMatch(text, /wird auf dem Versandlabel angegeben/);
  await page.close();
});

test("3 — nicht unterstützt: „erscheint nicht auf dem Versandlabel“ — und gebucht wird trotzdem", async () => {
  const rec = { book: [] };
  const page = await neueSeite(rec);
  await zurBuchungMit(page, 2);
  await schalte(page, REF_TOGGLE, true);
  await page.locator(REF_INPUT).fill("PO-4711");
  assert.equal(await page.locator(REF_LABEL).innerText(),
    "Bei diesem Tarif erscheint Ihre Referenz nicht auf dem Versandlabel. Sie bleibt in Ihren ConfidaraExpress-Dokumenten erhalten.");
  // Keine Buchungssperre: weiter zur Bestätigung und buchen.
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForTimeout(1200);
  assert.equal(rec.book.length, 1, "die Buchung wurde blockiert");
  assert.equal(rec.book[0].referenceNumber, "PO-4711");
  await page.close();
});

/* ══════════ B5 — keine stille Kürzung ══════════ */

test("4 — 40 Zeichen bleiben 40: Zähler 40/35, Meldung am Feld, kein Weiter und kein /book", async () => {
  const rec = { book: [] };
  const page = await neueSeite(rec);
  await zurBuchungMit(page, 0);
  await schalte(page, REF_TOGGLE, true);
  const vierzig = "Bestellung 0042/Ä-Ö ü ß é KST-12 Z9 2026";
  assert.equal(vierzig.length, 40);
  await page.locator(REF_INPUT).fill(vierzig);
  assert.equal(await page.locator(REF_INPUT).inputValue(), vierzig, "die Eingabe wurde still verändert");
  assert.equal(await page.locator(REF_INPUT).getAttribute("maxlength"), null);
  assert.equal(await page.locator(REF_COUNT).innerText(), "40/35 Zeichen");
  assert.match(await page.locator(REF_COUNT).getAttribute("class"), /is-over/);
  assert.match(await page.locator(REF_ERROR).innerText(), /40 Zeichen – erlaubt sind höchstens 35/);
  assert.equal(await page.locator(REF_INPUT).getAttribute("aria-invalid"), "true");

  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  assert.ok(await page.locator(REF_INPUT).isVisible(), "trotz zu langer Referenz ging es weiter");
  assert.equal(rec.book.length, 0);

  // Gekürzt durch den KUNDEN: die Meldung verschwindet, und es geht weiter.
  await page.locator(REF_INPUT).fill(vierzig.slice(0, 35));
  assert.equal(await page.locator(REF_ERROR).count(), 0, "die Meldung bleibt stehen");
  assert.equal(await page.locator(REF_COUNT).innerText(), "35/35 Zeichen");
  await page.close();
});

test("5 — < und > bleiben sichtbar und werden gemeldet, statt still zu verschwinden", async () => {
  const page = await neueSeite({ book: [] });
  await zurBuchungMit(page, 1);
  await schalte(page, REF_TOGGLE, true);
  await page.locator(REF_INPUT).fill("<4711>");
  assert.equal(await page.locator(REF_INPUT).inputValue(), "<4711>");
  assert.match(await page.locator(REF_ERROR).innerText(), /Zeichen < und > sind in der Referenz nicht zulässig/);
  await page.close();
});

/* ══════════ B4 — die Auftragsreferenz als Vorschlag ══════════ */

async function vomAuftragZurBuchung(page) {
  await page.goto(`${BASE}/dashboard?page=orders`, { waitUntil: "networkidle" });
  await page.locator("button", { hasText: "Versand vorbereiten" }).first().click();
  await page.waitForSelector("#ns-weight", { timeout: 20000 });
  await fuelleVersandformular(page);
  await berechneAngebote(page);
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(REF_TOGGLE, { timeout: 20000 });
}

test("6 — die Auftragsreferenz steht eingeschaltet im Feld und wird gebucht", async () => {
  const rec = { book: [] };
  const page = await neueSeite(rec, { auftragsReferenz: "AUFTRAG-REF-1" });
  await vomAuftragZurBuchung(page);
  assert.equal(await page.locator(REF_TOGGLE).isChecked(), true, "der Vorschlag ist nicht eingeschaltet");
  assert.equal(await page.locator(REF_INPUT).inputValue(), "AUFTRAG-REF-1");
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForTimeout(1200);
  assert.equal(rec.book.length, 1);
  assert.equal(rec.book[0].referenceNumber, "AUFTRAG-REF-1");
  await page.close();
});

test("7 — eine lange Auftragsreferenz kommt ungekürzt an und wird gemeldet; geändert wird sie im Feld", async () => {
  const lang = "AUFTRAG-".padEnd(60, "X");
  const page = await neueSeite({ book: [] }, { auftragsReferenz: lang });
  await vomAuftragZurBuchung(page);
  assert.equal(await page.locator(REF_INPUT).inputValue(), lang, "die Auftragsreferenz wurde still gekürzt");
  assert.equal(await page.locator(REF_COUNT).innerText(), "60/35 Zeichen");
  assert.ok(await page.locator(REF_ERROR).isVisible());
  await page.locator(REF_INPUT).fill("AUFTRAG-KURZ");
  assert.equal(await page.locator(REF_ERROR).count(), 0);
  await page.close();
});

test("8 — ohne Auftragsreferenz bleibt die Option aus", async () => {
  const page = await neueSeite({ book: [] }, { auftragsReferenz: null });
  await vomAuftragZurBuchung(page);
  assert.equal(await page.locator(REF_TOGGLE).isChecked(), false);
  assert.equal(await page.locator(REF_INPUT).count(), 0);
  await page.close();
});

/* ══════════ Responsive ══════════ */

test("9 — Meldung, Zähler und Satz brechen auf 390 px ohne Überlauf um", async () => {
  const page = await neueSeite({ book: [] }, {}, { width: 390, height: 844 });
  await zurBuchungMit(page, 0);
  await schalte(page, REF_TOGGLE, true);
  await page.locator(REF_INPUT).fill("Bestellung 0042/Ä-Ö ü ß é KST-12 Z9 2026");
  const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  assert.equal(ueberlauf, false, "horizontaler Überlauf bei 390 px");
  for (const sel of [REF_COUNT, REF_ERROR, REF_LABEL]) assert.ok(await page.locator(sel).isVisible(), `${sel} nicht sichtbar`);
  await page.close();
});
