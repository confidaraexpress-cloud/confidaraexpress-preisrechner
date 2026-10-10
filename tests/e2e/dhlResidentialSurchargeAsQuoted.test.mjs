// E2E: DHL-Privatadresszuschlag (Betreiberentscheidung 2026-10-10) — die Art der Lieferadresse eines Angebots, dessen
// Zuschlag der Server je Sendung nennt: live 5,00 € Einkauf (Kundenzuschlag 6,50 netto / 7,74 brutto), auf Staging
// keiner (+ 0,00 €). Das Angebot ist NICHT zuschlagsfrei ausgewiesen (`surchargeFreePriceInputs: []`).
// Echter Dev-Server, echter Browser, gemocktes Backend (helpers/residentialPriceInputs.mjs); die Beträge sind die des
// Backends (tests/dhl-residential-surcharge-as-quoted.test.js, Produkt 84 DE→DE).
//
//   A  Angebotsliste: auswählbar, „Vorläufiger Preis", Zuschlagshinweis — keine Anfrage vor der Auswahl
//   B  Staging privat: „+ 0,00 €" bestätigt, gebunden ohne Zuschlagszeile, /book mit der Wahl, Erfolg
//   C  Live privat: „+ 6,50 € netto", gebunden mit Zuschlagszeile, /book, Erfolg
//   D  Live geschäftlich: Geschäftspreis, keine Zuschlagszeile, /book mit `false`
//   E  Preisänderung (anderer Zuschlag) bei /book: kein Übernahmeweg, neue Optionen, neue Wahl, Buchung
//   F  Zurück zu den Angeboten und wieder hinein: die Wahl ohne Zuschlag bleibt gebunden, keine neue Bindung
//
// Kein echtes Backend, keine Bestellung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_PAKET } from "./helpers/newShipmentForm.mjs";
import {
  LIEFERADRESSE_ID, lieferadressZustand, mockeLieferadresse, waehleLieferadresse, bestandteile,
  invalidiereLieferadresse,
} from "./helpers/residentialPriceInputs.mjs";

const PORT = 5490, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 4984;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ABHOLTAG = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10984",
};

/* Das DHL-Angebot, wie calculate-price es liefert: auswählbar, nicht buchbar, Zuschlag möglich (nicht zuschlagsfrei). */
const DHL = {
  offerId: "dh84000000000000000000000000a084", publicCarrierId: "dhl", publicServiceName: "Domestic Express",
  serviceType: "pickup", collectionDate: ABHOLTAG, collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
  netPrice: 31.75, vatAmount: 6.03, finalPrice: 37.78, currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"], surchargeFreePriceInputs: [],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: false, insuranceDetails: null, trackingAvailable: true, printerRequired: true,
};

// Live: Geschäftsadresse 31,75 / 6,03 / 37,78 — Privatadresse 38,25 / 7,27 / 45,52 (Zuschlag 6,50 / 1,24 / 7,74).
const LIVE = Object.freeze({ geschaeft: { net: 31.75, vat: 6.03, gross: 37.78 }, privat: { net: 38.25, vat: 7.27, gross: 45.52 },
                             zuschlag: { net: 6.5, vat: 1.24, gross: 7.74 } });
// Staging: kein Zuschlag — die Privatadresse trägt den Geschäftspreis.
const STAGING = Object.freeze({ geschaeft: { net: 31.75, vat: 6.03, gross: 37.78 }, privat: { net: 31.75, vat: 6.03, gross: 37.78 },
                                zuschlag: { net: 0, vat: 0, gross: 0 } });
const NEUE_OPTIONS_ID = "2c3d4e5f60718293a4b5c6d7e8f90a1b";

const buchungsAntwort = (body, lz) => ({
  message: "Sendung gebucht", ceShipmentId: CE_ID, invoiceNumber: "CE-RE26-00984",
  businessOrderNumber: "CE-BS26-00984", dueDate: null, amount: (lz.bound ? lz.privat : lz.geschaeft).gross,
  billingMode: "single", testBooking: false, voucherCode: null, deliveryNote: null,
  orderConfirmation: { number: "CE-AB26-00984", issuedAt: "2026-10-10T10:00:00Z" }, shippingDocuments: [],
  priceComponents: bestandteile(lz, lz.bound),
});

const VERBOTEN = /transglobal|jumingo|quoteid|serviceid|residential surcharge/i;

let server, browser;

/* Das Szenario: `preise` (LIVE oder STAGING), `book(body, n, lz)` für eine abweichende /book-Antwort. */
async function setup(page, szenario = {}) {
  const preise = szenario.preise || LIVE;
  const p = { pfade: [], book: [], calc: [], anfragen: [] };
  const lz = lieferadressZustand({ offerId: DHL.offerId, ...preise });
  p.lz = lz;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    p.pfade.push(pfad);
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (pfad.includes("/api/jumingo/calculate-price")) {
      p.calc.push(req.postDataJSON());
      return json({
        ceShipmentId: CE_ID, tariffs: [DHL], availableShippingModes: ["standard", "express"],
        publicCarriers: [{ id: "dhl", name: "DHL Express" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
    }
    if (pfad.includes("/api/jumingo/book")) {
      const body = req.postDataJSON();
      p.book.push(body);
      const a = szenario.book ? szenario.book(body, p.book.length, lz) : null;
      if (a) return json(a.json, a.status || 200);
      return json(buchungsAntwort(body, lz));
    }
    return json({});
  });
  // NACH dem Sammel-Mock: Playwright prüft Routen in umgekehrter Reihenfolge.
  await mockeLieferadresse(page, lz, p.anfragen);
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const inhalt = async (loc) => norm(await loc.first().textContent());
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const buchenKnopf = (page) => page.getByRole("button", { name: /Kostenpflichtig buchen/ });

async function neueSeite(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function zuDenAngeboten(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { paket: { ...STANDARD_PAKET, packageCount: "1" } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

async function waehle(page, tarif) {
  await karteVon(page, tarif).locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await page.waitForSelector("#booking-reference-toggle", { timeout: 20000 });
}

async function zuSchritt2(page) {
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".booking-confirm-panel", { timeout: 20000 });
}

async function bestaetigen(page) {
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut
  await checks.nth(0).check();
  await checks.nth(1).check();
}

async function warteAufText(page, selektor, teil, timeout = 10000) {
  await page.waitForFunction(({ s, t }) => {
    const el = document.querySelector(s);
    return !!el && el.textContent.replace(/\s+/g, " ").includes(t);
  }, { s: selektor, t: teil }, { timeout });
}

async function keinAnbieter(page, wo) {
  const text = norm(await page.evaluate(() => document.body.innerText));
  const treffer = text.match(VERBOTEN) || text.match(/\bRES\b/);
  assert.equal(treffer, null, `${wo}: unzulässiger Text „${treffer && treffer[0]}“`);
}

async function keinZuschlagsfehler(page, wo) {
  assert.equal(await page.locator("#residential-options-error").count(), 0, `${wo}: der Abschnitt meldet einen Fehler`);
  const text = norm(await page.evaluate(() => document.body.innerText));
  assert.doesNotMatch(text, /Der Zuschlag konnte nicht berechnet werden/, `${wo}: die Bindung wurde verworfen`);
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", detached: true });
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
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("A — Angebotsliste: auswählbar, vorläufiger Preis und Zuschlagshinweis, keine Anfrage vor der Auswahl", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  const karte = karteVon(page, DHL);
  const text = await inhalt(karte);
  assert.match(text, /Vorläufiger Preis/);
  assert.match(text, /31,75 €/);
  assert.equal(await karte.locator("button.offer-cta-btn").isEnabled(), true, "der CTA ist gesperrt");
  await karte.locator("button.offer-details-link").click();
  await karte.locator(".offer-details-panel--open .offer-details-section--price").waitFor({ timeout: 10000 });
  assert.equal(await inhalt(karte.locator(".offer-details-section--price .offer-surcharge-hint")),
    "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.");
  assert.equal(p.anfragen.length, 0, "vor der Auswahl entstand eine Zuschlagsanfrage");
  await keinAnbieter(page, "Angebotsliste");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — Staging privat: „+ 0,00 €“ bestätigt, gebunden ohne Zuschlagszeile, /book mit der Wahl, Erfolg", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { preise: STAGING });
  await zuDenAngeboten(page);
  await waehle(page, DHL);
  const privatKarte = page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`);
  await privatKarte.waitFor({ timeout: 20000 });
  assert.match(await inhalt(privatKarte), /\+ 0,00 € netto/);
  assert.match(await inhalt(page.locator(`label[for="${LIEFERADRESSE_ID.geschaeft}"]`)), /\+ 0,00 € netto/);

  await waehleLieferadresse(page, true);
  assert.deepEqual(p.lz.bindCalls, [{
    offerId: DHL.offerId, offerRevision: 0, optionsId: p.lz.optionsId, deliveryIsResidential: true, expectedShippingGross: 37.78,
  }]);
  await warteAufText(page, ".blsum-price-gross", "37,78");
  assert.equal(await inhalt(page.locator(".blsum-price-label")), "Gesamt");
  assert.equal(await page.locator("#booking-live-surcharge-note").count(), 0, "ein Zuschlag ohne Zuschlag");
  await keinZuschlagsfehler(page, "Schritt 1");

  await zuSchritt2(page);
  assert.equal(await page.locator('[data-component="residential_delivery_surcharge"]').count(), 0);
  assert.match(await inhalt(page.locator(".booking-confirm-box")), /Gesamtbetrag brutto\s*37,78 €/);
  await bestaetigen(page);
  assert.equal(await buchenKnopf(page).isEnabled(), true, "die Buchung bleibt gesperrt");
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(p.book.length, 1);
  assert.deepEqual([p.book[0].offerId, p.book[0].offerRevision, p.book[0].priceInputs],
    [DHL.offerId, 1, { deliveryIsResidential: true }]);
  await keinAnbieter(page, "Erfolg");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — Live privat: „+ 6,50 € netto“, gebunden mit Zuschlagszeile, /book mit der Wahl, Erfolg", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { preise: LIVE });
  await zuDenAngeboten(page);
  await waehle(page, DHL);
  const privatKarte = page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`);
  await privatKarte.waitFor({ timeout: 20000 });
  const pr = await inhalt(privatKarte);
  assert.match(pr, /\+ 6,50 € netto/);
  assert.match(pr, /7,74 € brutto/);

  await waehleLieferadresse(page, true);
  assert.equal(p.lz.bindCalls[0].expectedShippingGross, 45.52);
  await warteAufText(page, ".blsum-price-gross", "45,52");
  assert.equal(await inhalt(page.locator("#booking-live-surcharge-note")), "inkl. Zuschlag Privatadresse 7,74 €");
  await keinZuschlagsfehler(page, "Schritt 1");

  await zuSchritt2(page);
  assert.match(await inhalt(page.locator('[data-component="shipping_base"]')), /Versand netto\s*31,75 €/);
  assert.match(await inhalt(page.locator('[data-component="residential_delivery_surcharge"]')), /Zuschlag Privatadresse netto\s*6,50 €/);
  assert.match(await inhalt(page.locator(".booking-confirm-box")), /Gesamtbetrag brutto\s*45,52 €/);
  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.deepEqual([p.book.length, p.book[0].offerRevision, p.book[0].priceInputs], [1, 1, { deliveryIsResidential: true }]);
  await keinAnbieter(page, "Erfolg");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — Live geschäftlich: Geschäftspreis ohne Zuschlagszeile, /book mit `false`", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { preise: LIVE });
  await zuDenAngeboten(page);
  await waehle(page, DHL);
  await waehleLieferadresse(page, false);
  assert.equal(p.lz.bindCalls[0].expectedShippingGross, 37.78);
  await warteAufText(page, ".blsum-price-gross", "37,78");
  assert.equal(await page.locator("#booking-live-surcharge-note").count(), 0);
  await zuSchritt2(page);
  assert.equal(await page.locator('[data-component="residential_delivery_surcharge"]').count(), 0);
  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.deepEqual(p.book[0].priceInputs, { deliveryIsResidential: false });
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — Preisänderung bei /book (Staging-Preis → Live-Zuschlag): kein Übernahmeweg, neue Optionen, neue Wahl, Buchung", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, {
    preise: STAGING,
    book: (_body, n, lz) => {
      if (n !== 1) return null;
      // Der Anbieter nennt jetzt einen Zuschlag: der Server verwirft den Stand und verlangt die Neuwahl.
      Object.assign(lz, { privat: { ...LIVE.privat }, zuschlag: { ...LIVE.zuschlag } });
      invalidiereLieferadresse(lz, NEUE_OPTIONS_ID);
      return { status: 409, json: { error: "Der Preis für dieses Angebot hat sich geändert.", code: "PRICE_CHANGED",
                                    priceInputsRebindRequired: true, offerRevision: lz.revision } };
    },
  });
  await zuDenAngeboten(page);
  await waehle(page, DHL);
  await waehleLieferadresse(page, true);
  await warteAufText(page, ".blsum-price-gross", "37,78");
  await zuSchritt2(page);
  await bestaetigen(page);
  await buchenKnopf(page).click();

  const hinweis = page.locator("#residential-options-notice");
  await hinweis.waitFor({ timeout: 20000 });
  assert.equal(await inhalt(hinweis), "Der Preis für dieses Angebot hat sich geändert. Bitte wählen Sie die Art der Lieferadresse erneut.");
  assert.equal(await page.locator("#price-drift-accept").count(), 0, "eine Neubestätigung bietet eine Übernahme an");
  const privatKarte = page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`);
  await privatKarte.waitFor({ timeout: 20000 });
  assert.equal(await page.locator('input[name="residential-delivery"]:checked').count(), 0, "die alte Wahl gilt still weiter");
  assert.match(await inhalt(privatKarte), /\+ 6,50 € netto/);

  await waehleLieferadresse(page, true);
  assert.deepEqual(p.lz.bindCalls.at(-1), {
    offerId: DHL.offerId, offerRevision: 2, optionsId: NEUE_OPTIONS_ID, deliveryIsResidential: true, expectedShippingGross: 45.52,
  });
  await warteAufText(page, ".blsum-price-gross", "45,52");
  await zuSchritt2(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(p.book.length, 2, "genau zwei bewusste Buchungsklicks");
  assert.deepEqual([p.book[1].offerRevision, p.book[1].priceInputs], [3, { deliveryIsResidential: true }]);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F — zurück zu den Angeboten und wieder hinein: die Privatwahl ohne Zuschlag bleibt gebunden, keine neue Bindung", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { preise: STAGING });
  await zuDenAngeboten(page);
  await waehle(page, DHL);
  await waehleLieferadresse(page, true);
  const berechnungen = p.calc.length;

  await page.getByRole("button", { name: "← Zurück", exact: true }).click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(p.calc.length, berechnungen, "der Rückweg hat neu berechnet");
  const karte = karteVon(page, DHL);
  assert.doesNotMatch(await inhalt(karte), /Vorläufiger Preis/);

  const optionsVorher = p.lz.optionsCalls.length;
  await karte.locator("button.offer-cta-btn").click();
  await page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`).waitFor({ timeout: 20000 });
  await page.waitForFunction((id) => document.getElementById(id)?.checked === true, LIEFERADRESSE_ID.privat, { timeout: 10000 });
  assert.equal(p.lz.optionsCalls.length, optionsVorher + 1);
  assert.equal(p.lz.bindCalls.length, 1, "die Rückkehr hat erneut gebunden");
  await warteAufText(page, ".blsum-price-gross", "37,78");
  await keinZuschlagsfehler(page, "Rückkehr");
  assert.deepEqual(fehler, []);
  await page.close();
});
