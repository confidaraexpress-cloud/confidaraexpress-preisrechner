// E2E: eine Angebotsantwort OHNE JUMiNGO-Referenz — echter Dev-Server, echter Browser,
// gemocktes Backend.
//
// ─── Der Vertrag ─────────────────────────────────────────────────────────────
//   ceShipmentId  shipments.id — die lokale Sendung und die EINZIGE Sendungskennung des
//                 Clients. Das Backend legt sie an, bevor ein Anbieter gefragt wird; jedes
//                 Angebot hängt an ihr.
//   shipmentId    existiert im Kundenvertrag seit TG22 Paket A nicht mehr: die JUMiNGO-Referenz
//                 löst ausschließlich der Server auf. Test 2 misst das am JUMiNGO-Weg
//                 (Buchung, Warenkorbvorschau, Abholzeitfenster).
//
// Gemessen wird, was eine Quelltextprüfung nicht erreicht:
//   • die Angebotskarte ist buchbar, obwohl keine JUMiNGO-Referenz existiert,
//   • die Buchungsseite wird aus dem laufenden Vorgang wiederhergestellt (ohne
//     `location.state`) — früher verlangte genau diese Wiederherstellung die JUMiNGO-Referenz,
//   • die zusätzliche Transportabsicherung wird über die Angebotskennung neu bepreist,
//   • die Buchung geht über die Angebotskennung hinaus — ohne JUMiNGO-Referenz, ohne
//     JUMiNGO-Tarifkennungen — und endet auf dem Erfolgsbildschirm,
//   • kein JUMiNGO-only-Endpunkt wird angesprochen, und kein Anbietername ist sichtbar.
//
// Kein echtes Backend, keine Bestellung, keine Neubepreisung beim Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_SENDUNGSANGABEN } from "./helpers/newShipmentForm.mjs";

const PORT = 5375, BASE = `http://127.0.0.1:${PORT}`;
const CE_SHIPMENT_ID = 4711;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const COVER_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
};
const OFFER_ID = "abcdef0123456789abcdef0123456789";

// Ein Angebot in der Form der Allowlist-Projektion des Backends: KEINE `id`, KEINE
// `shipper_tariff_id`, keine Abholzeiten des JUMiNGO-Entwurfs — nur die Angebotskennung.
const TARIF = {
  offerId: OFFER_ID, publicCarrierId: "ups", publicServiceName: "Express Saver",
  serviceType: "dropoff", currency: "EUR",
  netPrice: 10.8, vatAmount: 2.05, finalPrice: 12.85,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  collectionDate: null, collectionReadyFrom: null,
  bookable: true, unavailableReason: null, priceCompleteness: "complete", requiredPriceInputs: [],
  chargeableWeight: null, labelFormats: [], labelSizes: [],
  insuranceAvailable: true, insuranceDetails: COVER_DETAILS,
};

const REPRICE_OK = (body) => ({
  selectedInsurance: "transit_cover",
  insurance: { coverValue: body.coverValue, excessValue: 20, goodsAreNew: body.goodsAreNew,
               goodsAreFragile: body.goodsAreFragile, insuranceGross: 10 },
  totals: { customerShippingNet: 10.8, shippingVat: 2.05, customerShippingGross: 12.85,
            insuranceGross: 10, customerTotalGross: 22.85 },
  tariff: { insuranceAvailable: true, insuranceDetails: COVER_DETAILS },
});

// Endpunkte, die ausschließlich den JUMiNGO-Entwurf betreffen. Ein Angebot ohne
// JUMiNGO-Referenz darf keinen davon auslösen.
const JUMINGO_ONLY = [/\/pickup-window/, /\/cart-total/, /\/reprice-insurance/, /\/commercial-invoice/];

let server, browser;

async function setupRoutes(page, protokoll) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    protokoll.pfade.push(p);

    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    // Legal-Buchungsschranke abgeschaltet beantwortet — ohne Antwort sperrte der Sammelfall
    // die Bestellung fail closed (siehe legalBookingGate.test.mjs).
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (JUMINGO_ONLY.some((re) => re.test(p))) return json({ error: "nicht erwartet" }, 404);
    if (p.includes("/api/jumingo/calculate-price")) return json({
      ceShipmentId: CE_SHIPMENT_ID,
      tariffs: [TARIF], availableShippingModes: [],
      publicCarriers: [{ id: "ups", name: "UPS" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/insurance/reprice")) {
      const body = req.postDataJSON();
      protokoll.reprice.push(body);
      return json(REPRICE_OK(body));
    }
    if (/^\/api\/shipments\/\d+\/documents$/.test(p)) return json({ shipmentId: CE_SHIPMENT_ID, documents: [] });
    if (p.includes("/api/jumingo/book")) {
      protokoll.book.push(req.postDataJSON());
      // Die Erfolgsantwort eines Angebots ohne JUMiNGO-Entwurf: nur der CE-Handle.
      return json({
        message: "Sendung gebucht", ceShipmentId: CE_SHIPMENT_ID, invoiceNumber: null,
        businessOrderNumber: "CE-BS26-00001", dueDate: null, amount: 22.85, billingMode: "single",
        testBooking: false, voucherCode: null, deliveryNote: null,
        orderConfirmation: { number: "CE-AB26-00001", issuedAt: "2026-09-11T10:00:00Z" },
        shippingDocuments: [],
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

const karte = (page, id) => page.locator(`.ins-card:has(input[value="${id}"])`);

async function sichtbarerText(page) {
  return (await page.evaluate(() => document.body.innerText)).replace(/\u00a0/g, " ");
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", detached: true });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) {
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits node
    // startet. Ein Signal an npx ließe den Enkel auf dem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — Angebot ohne JUMiNGO-Referenz: Wiederherstellung, Absicherung und Buchung über die lokale Sendung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const protokoll = { pfade: [], reprice: [], book: [] };
  await setupRoutes(page, protokoll);

  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });

  // Die Karte ist buchbar, obwohl die Antwort keine JUMiNGO-Referenz trägt.
  const buchbar = page.locator(".offer-card:not(.offer-card--unavailable)");
  assert.equal(await buchbar.count(), 1, "das Angebot ohne JUMiNGO-Referenz ist nicht buchbar dargestellt");
  await buchbar.first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });

  // Wiederherstellung aus dem laufenden Vorgang: derselbe Pfad OHNE `location.state` —
  // genau der Zweig, der früher die JUMiNGO-Referenz verlangte.
  await page.evaluate(() => {
    window.history.pushState({}, "", "/booking");
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  });
  await page.waitForTimeout(800);
  assert.equal(new URL(page.url()).pathname, "/booking");
  assert.equal((await sichtbarerText(page)).includes("Kein Angebot ausgewählt"), false,
    "die Buchungsseite wurde ohne JUMiNGO-Referenz nicht wiederhergestellt");
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  assert.match(await sichtbarerText(page), /Express Saver/);

  // Schritt 2 — idempotent: steht der Absicherungsbereich schon, passiert nichts.
  if (await page.locator(".ins-cards").count() === 0) {
    await page.getByRole("button", { name: /^Weiter/ }).first().click();
  }
  await page.waitForSelector(".ins-cards", { timeout: 20000 });

  // Zusätzliche Transportabsicherung — neu bepreist über die Angebotskennung.
  await karte(page, "transit_cover").locator(".ins-card-name").click();
  await page.locator("#ins-goodsAreNew-ja").check();
  await page.locator("#ins-goodsAreFragile-nein").check();
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  assert.equal(protokoll.reprice.length >= 1, true, "die Absicherung wurde nicht neu bepreist");
  assert.deepEqual(protokoll.reprice.at(-1), {
    offerId: OFFER_ID,
    coverValue: Number(STANDARD_SENDUNGSANGABEN.declaredGoodsValue),
    goodsAreNew: true,
    goodsAreFragile: false,
  });

  // Buchen.
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.match(await page.locator(".booking-success-title").innerText(), /erfolgreich gebucht/);

  assert.equal(protokoll.book.length, 1, "genau eine Buchungsanfrage");
  const body = protokoll.book[0];
  assert.equal(body.offerId, OFFER_ID, "die Buchung trägt nicht die Angebotskennung");
  assert.ok(!("shipmentId" in body), "die Buchung sendet eine JUMiNGO-Referenz");
  assert.equal(body.ceShipmentId, CE_SHIPMENT_ID, "die Buchung trägt nicht den CE-Sendungshandle");
  assert.equal(body.tariffId ?? null, null, "die Buchung sendet eine JUMiNGO-Tarifkennung");
  assert.equal(body.shipperTariffId ?? null, null, "die Buchung sendet eine JUMiNGO-Tarifkennung");
  assert.equal(body.insuranceSelection && body.insuranceSelection.type, "transit_cover");
  assert.equal(body.confirmedTotalGross, 22.85);

  // Kein JUMiNGO-only-Endpunkt, kein Anbietername.
  const jumingoOnly = protokoll.pfade.filter((p) => JUMINGO_ONLY.some((re) => re.test(p)));
  assert.deepEqual(jumingoOnly, [], `JUMiNGO-only-Endpunkte angesprochen: ${jumingoOnly.join(", ")}`);
  const text = await sichtbarerText(page);
  for (const name of ["Transglobal", "TRANSGLOBAL", "JUMiNGO", "Jumingo"]) {
    assert.ok(!text.includes(name), `„${name}" ist sichtbar`);
  }
  await page.close();
});

/* ══════════ 2 — JUMiNGO-Angebot: der Client nennt ausschließlich den CE-Handle ══════════ */

// Ein JUMiNGO-Tarif mit Tarifkennungen und einstellbarem Abholzeitfenster — genau der Weg,
// der bis TG22 Paket A die Providerreferenz an /book, /cart-total und das Abholzeitfenster
// schickte.
const JUMINGO_TARIF = {
  id: 1, shipper_tariff_id: 1381, publicCarrierId: "ups", publicCarrierName: "UPS",
  publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
  netPrice: 10.69, vatAmount: 2.03, finalPrice: 12.72, transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-09-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  pickupWindowAdjustable: true, pickupWindowMinMinutes: 120,
  deliveryDate: "2026-09-08T00:00:00Z",
};
// Eine Providerreferenz in JEDER Schreibweise, in der sie je ausgeliefert wurde.
const PROVIDERREFERENZ = /\bs_[0-9a-z_]{3,}/i;

async function setupJumingoRoutes(page, protokoll) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    protokoll.anfragen.push({ methode: req.method(), pfad: p, query: url.search, body: req.postData() || "" });

    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      ceShipmentId: CE_SHIPMENT_ID, tariffs: [JUMINGO_TARIF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "ups", name: "UPS" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) {
      protokoll.abholfenster.push({
        methode: req.method(), query: Object.fromEntries(url.searchParams),
        body: req.method() === "POST" ? req.postDataJSON() : null,
      });
      return json({ pickupTimeFrom: null, pickupTimeUntil: null });
    }
    if (p.includes("/api/jumingo/cart-total")) {
      protokoll.warenkorb.push(req.postDataJSON());
      return json({ voucher: { applied: false, code: null, reason: "invalid" } });
    }
    if (/^\/api\/shipments\/\d+\/documents$/.test(p)) return json({ shipmentId: CE_SHIPMENT_ID, documents: [] });
    if (p.includes("/api/jumingo/book")) {
      protokoll.book.push(req.postDataJSON());
      return json({
        message: "Sendung gebucht", ceShipmentId: CE_SHIPMENT_ID, invoiceNumber: null,
        businessOrderNumber: "CE-BS26-00002", dueDate: null, amount: 12.72, billingMode: "single",
        testBooking: false, voucherCode: null, deliveryNote: null,
        orderConfirmation: { number: "CE-AB26-00002", issuedAt: "2026-09-11T10:00:00Z" },
        shippingDocuments: [],
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

test("2 — JUMiNGO-Angebot: Buchung, Warenkorbvorschau und Abholzeitfenster adressieren nur den CE-Handle", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const protokoll = { anfragen: [], abholfenster: [], warenkorb: [], book: [] };
  await setupJumingoRoutes(page, protokoll);

  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });

  // Abholzeitfenster: die Hydrierung beim Einstieg adressiert den Entwurf über den CE-Handle.
  const frist = Date.now() + 10000;
  while (protokoll.abholfenster.length === 0 && Date.now() < frist) await page.waitForTimeout(100);
  assert.ok(protokoll.abholfenster.length >= 1, "das Abholzeitfenster wurde nicht geladen");
  for (const a of protokoll.abholfenster) {
    const kennung = a.methode === "GET" ? a.query : a.body;
    assert.equal(String(kennung.ceShipmentId), String(CE_SHIPMENT_ID), `Abholzeitfenster (${a.methode}) ohne CE-Handle`);
    assert.ok(!("shipmentId" in kennung), `Abholzeitfenster (${a.methode}) trägt eine Providerreferenz`);
  }

  // Warenkorbvorschau: ein Gutscheinwunsch geht über den CE-Handle.
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".booking-voucher-input", { timeout: 20000 });
  await page.locator(".booking-voucher-input").fill("E2E-CODE");
  await page.locator(".booking-voucher-apply").click();
  const frist2 = Date.now() + 10000;
  while (protokoll.warenkorb.length === 0 && Date.now() < frist2) await page.waitForTimeout(100);
  assert.ok(protokoll.warenkorb.length >= 1, "die Warenkorbvorschau wurde nicht abgefragt");
  for (const w of protokoll.warenkorb) {
    assert.equal(w.ceShipmentId, CE_SHIPMENT_ID, "die Warenkorbvorschau trägt nicht den CE-Handle");
    assert.ok(!("shipmentId" in w), "die Warenkorbvorschau trägt eine Providerreferenz");
  }

  // Buchung.
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });

  assert.equal(protokoll.book.length, 1, "genau eine Buchungsanfrage");
  const body = protokoll.book[0];
  assert.equal(body.ceShipmentId, CE_SHIPMENT_ID, "die Buchung trägt nicht den CE-Handle");
  assert.ok(!("shipmentId" in body), "die Buchung sendet eine Providerreferenz");
  assert.equal(String(body.shipperTariffId), "1381", "der JUMiNGO-Weg verlor seine Tarifbestätigung");

  // Keine einzige Anfrage trägt eine Providerreferenz — weder im Pfad, in der Query noch im Body.
  for (const a of protokoll.anfragen) {
    const roh = `${a.pfad}${a.query} ${a.body}`;
    assert.ok(!PROVIDERREFERENZ.test(roh), `Providerreferenz in ${a.methode} ${a.pfad}: ${roh.slice(0, 160)}`);
    assert.ok(!/[?&]shipmentId=/.test(a.query), `Providerfeld in der Query von ${a.pfad}`);
    assert.ok(!/"shipmentId"\s*:/.test(a.body), `Providerfeld im Body von ${a.methode} ${a.pfad}`);
  }
  // Und kein Anbietername oder Referenzformat im sichtbaren Text.
  const text = await sichtbarerText(page);
  for (const name of ["Transglobal", "TRANSGLOBAL", "JUMiNGO", "Jumingo", "JUMINGO"]) {
    assert.ok(!text.includes(name), `„${name}" ist sichtbar`);
  }
  assert.ok(!PROVIDERREFERENZ.test(text), "eine Providerreferenz ist sichtbar");
  await page.close();
});
