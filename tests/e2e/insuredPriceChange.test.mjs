// E2E: TG22 Paket A — die versicherte Preisänderung ist keine Sackgasse mehr. Echter Dev-Server,
// echter Browser, gemocktes Backend.
//
// Gemessen wird, was eine Quelltextprüfung nicht erreicht:
//   • /book antwortet mit PRICE_CHANGED und BEIDEN Serverbeträgen — der Dialog zeigt sie samt
//     Zusammensetzung (Versand geändert, Absicherung unverändert), ohne Anbietertext,
//   • „Neuen Preis übernehmen" sendet ausschließlich den gezeigten Gesamtbetrag als Bestätigung und
//     bucht NICHT: die Seite zeigt den neuen Stand, gebucht wird erst nach einem neuen Klick,
//   • der nächste /book trägt den neuen Gesamtbetrag und den Preisstand,
//   • eine zweite Preisänderung führt zurück in den Dialog — keine Schleife, keine stille Buchung,
//   • scheitert die Übernahme, bleibt der Dialog offen (erneut versuchen / neu berechnen),
//   • eine gewöhnliche Neubepreisung mit Preisänderung öffnet denselben Dialog,
//   • 1440 und 390 px ohne horizontalen Überlauf.
//
// Kein echtes Backend, keine Bestellung, keine Neubepreisung beim Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_PAKET } from "./helpers/newShipmentForm.mjs";

const PORT = 5377, BASE = `http://127.0.0.1:${PORT}`;
const CE_SHIPMENT_ID = 4733;
const OFFER_ID = "22pc0000000000000000000000000022";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ABHOLTAG = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};
const COVER_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
};
const TARIF = {
  offerId: OFFER_ID, publicCarrierId: "ups", publicServiceName: "Standard",
  serviceType: "pickup", collectionDate: ABHOLTAG, collectionReadyFrom: "09:00",
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  netPrice: 12.34, vatAmount: 2.34, finalPrice: 14.68, currency: "EUR",
  bookable: true, unavailableReason: null, priceCompleteness: "complete",
  requiredPriceInputs: ["deliveryIsResidential", "collectionIsResidential"],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"],
  insuranceAvailable: true, insuranceDetails: COVER_DETAILS,
  trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }],
};

// Die Preisstände des Servers: Versand brutto (Absicherung bleibt 10,00 €).
const STAENDE = [
  { versand: 14.68, netto: 12.34, mwst: 2.34 },
  { versand: 16.11, netto: 13.54, mwst: 2.57 },
  { versand: 17.54, netto: 14.74, mwst: 2.80 },
];
const gesamt = (i) => Math.round((STAENDE[i].versand + 10) * 100) / 100;

const REPRICE = (body, i, { revision, uebernommen }) => ({
  selectedInsurance: "transit_cover",
  insurance: { coverValue: body.coverValue, excessValue: 20, goodsAreNew: body.goodsAreNew,
               goodsAreFragile: body.goodsAreFragile, insuranceGross: 10 },
  totals: { customerShippingNet: STAENDE[i].netto, shippingVat: STAENDE[i].mwst,
            customerShippingGross: STAENDE[i].versand, insuranceGross: 10, customerTotalGross: gesamt(i) },
  tariff: { insuranceAvailable: true, insuranceDetails: COVER_DETAILS },
  priceRevision: revision, priceChangeAccepted: uebernommen,
});

const PREISAENDERUNG = (alt, neu, revision) => ({
  error: "Der Preis für dieses Angebot hat sich geändert. Bitte bestätigen Sie den neuen Preis.",
  code: "PRICE_CHANGED", price: gesamt(neu), oldPrice: gesamt(alt), newPrice: gesamt(neu),
  priceChange: { shipping: { oldGross: STAENDE[alt].versand, newGross: STAENDE[neu].versand },
                 insurance: { oldGross: 10, newGross: 10 } },
  offerRevision: revision,
});

const VERBOTEN = /transglobal|jumingo|Einkauf|QuoteID|purchase/i;

let server, browser;

/* Das Szenario steuert, was der Server auf jede Anfrage antwortet. `stand` ist der zuletzt
   gebundene Preisstand; `aktuell` der, den ein frischer Quote gerade ergäbe. */
async function setupRoutes(page, protokoll, szenario) {
  const zustand = { stand: 0, revision: 0, aktuell: szenario.startAktuell ?? 0, annahmeFehler: szenario.annahmeFehler ?? 0 };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    protokoll.pfade.push(p);
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      ceShipmentId: CE_SHIPMENT_ID, tariffs: [TARIF], availableShippingModes: [],
      publicCarriers: [{ id: "ups", name: "UPS" }], customsRequired: false,
      fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/insurance/reprice")) {
      const body = req.postDataJSON();
      protokoll.reprice.push(body);
      if (body.acceptPriceChange) {
        if (zustand.annahmeFehler > 0) {
          zustand.annahmeFehler--;
          return json({ error: "Rohtext Transglobal", code: "PRICE_UNCONFIRMED" }, 503);
        }
        // Gebunden wird nur, wenn der Bestätigungsbetrag exakt dem frischen Serverpreis entspricht.
        if (body.acceptPriceChange.expectedTotalGross !== gesamt(zustand.aktuell)) {
          return json(PREISAENDERUNG(zustand.stand, zustand.aktuell, zustand.revision), 409);
        }
        zustand.stand = zustand.aktuell; zustand.revision++;
        return json(REPRICE(body, zustand.stand, { revision: zustand.revision, uebernommen: true }));
      }
      if (zustand.aktuell !== zustand.stand) return json(PREISAENDERUNG(zustand.stand, zustand.aktuell, zustand.revision), 409);
      return json(REPRICE(body, zustand.stand, { revision: zustand.revision, uebernommen: false }));
    }
    if (p.includes("/api/jumingo/book")) {
      const body = req.postDataJSON();
      protokoll.book.push(body);
      // Vor jedem Buchungsversuch darf das Szenario den frischen Preis weiterschieben.
      const naechster = szenario.vorBuchung ? szenario.vorBuchung(protokoll.book.length, zustand) : null;
      if (naechster !== null && naechster !== undefined) zustand.aktuell = naechster;
      if (zustand.aktuell !== zustand.stand) return json(PREISAENDERUNG(zustand.stand, zustand.aktuell, zustand.revision), 409);
      return json({
        message: "Sendung gebucht", ceShipmentId: CE_SHIPMENT_ID, invoiceNumber: "CE-RE26-00033",
        businessOrderNumber: "CE-BS26-00033", dueDate: null, amount: gesamt(zustand.stand), billingMode: "single",
        testBooking: false, voucherCode: null, deliveryNote: null,
        orderConfirmation: { number: "CE-AB26-00033", issuedAt: "2026-09-11T10:00:00Z" }, shippingDocuments: [],
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return zustand;
}

const neuesProtokoll = () => ({ pfade: [], reprice: [], book: [] });
const text = async (loc) => (await loc.innerText()).replace(/ /g, " ");
const querUeberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function zurVersichertenBuchung(page, { warteAufBestaetigung = true } = {}) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { paket: { ...STANDARD_PAKET, packageCount: "1" } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  if (await page.locator(".ins-cards").count() === 0) await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".ins-cards", { timeout: 20000 });
  await page.locator(`.ins-card:has(input[value="transit_cover"]) .ins-card-name`).click();
  await page.locator("#ins-goodsAreNew-ja").check();
  await page.locator("#ins-goodsAreFragile-nein").check();
  if (warteAufBestaetigung) await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut
  await checks.nth(0).check();
  await checks.nth(1).check();
}

const buchenKlick = (page) => page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();

async function pruefeDialog(page, { alt, neu }) {
  const dialog = page.locator(".price-drift-card");
  await dialog.waitFor({ timeout: 10000 });
  const t = await text(dialog);
  assert.ok(t.includes(`${alt.toFixed(2).replace(".", ",")} €`), `alter Gesamtbetrag fehlt: ${t}`);
  assert.ok(t.includes(`${neu.toFixed(2).replace(".", ",")} €`), `neuer Gesamtbetrag fehlt: ${t}`);
  assert.match(t, /Versand/);
  assert.match(t, /Zusätzliche Transportabsicherung\s*10,00 € · unverändert/);
  assert.match(t, /Es wurde nichts gebucht/);
  assert.equal((await page.locator("#price-drift-accept").innerText()).trim(), "Neuen Preis übernehmen");
  assert.equal(t.match(VERBOTEN), null, `unzulässiger Text im Dialog: ${t}`);
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
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

for (const [name, viewport] of [["Desktop 1440", { width: 1440, height: 1000 }], ["Mobil 390", { width: 390, height: 844 }]]) {
  test(`A — ${name}: Preisänderung → Übernahme → erneute Änderung → Übernahme → Buchung zum neuen Preis`, async () => {
    const page = await browser.newPage({ viewport });
    const fehler = [];
    page.on("pageerror", (e) => fehler.push(String(e)));
    const protokoll = neuesProtokoll();
    // Vor der 1. Buchung steigt der Preis auf Stand 1, vor der 2. auf Stand 2; die 3. bucht.
    await setupRoutes(page, protokoll, { vorBuchung: (n) => (n === 1 ? 1 : n === 2 ? 2 : null) });
    await zurVersichertenBuchung(page);
    assert.match(await text(page.locator("body")), /24,68 €/);

    // 1. Buchung → Preisänderung. Kein zweiter /book, keine Neubepreisung im Hintergrund.
    const repriceVorher = protokoll.reprice.length;
    await buchenKlick(page);
    await pruefeDialog(page, { alt: 24.68, neu: 26.11 });
    assert.equal(protokoll.book.length, 1);
    assert.equal(protokoll.reprice.length, repriceVorher, "der Dialog hat selbst neu bepreist");
    if (viewport.width < 768) assert.ok(await querUeberlauf(page) <= 0, "Dialog: horizontaler Überlauf");

    // 2. Übernahme: genau der gezeigte Betrag als Bestätigung — und KEINE Buchung.
    await page.locator("#price-drift-accept").click();
    await page.locator(".price-drift-card").waitFor({ state: "detached", timeout: 10000 });
    const annahme1 = protokoll.reprice.at(-1);
    assert.deepEqual(annahme1.acceptPriceChange, { expectedTotalGross: 26.11 });
    assert.equal(annahme1.offerId, OFFER_ID);
    assert.ok(!("price" in annahme1) && !("customerPriceCents" in annahme1), "die Übernahme sendet einen Preis");
    await page.locator("#price-change-accepted").waitFor({ timeout: 5000 });
    assert.match(await text(page.locator("#price-change-accepted")), /Der neue Preis wurde übernommen/);
    assert.match(await text(page.locator("body")), /26,11 €/, "die Buchungsseite zeigt den neuen Gesamtbetrag nicht");
    assert.equal(protokoll.book.length, 1, "die Übernahme hat gebucht");

    // 3. Erneuter Klick: der Server hat den Preis inzwischen wieder geändert → zurück in den Dialog.
    await buchenKlick(page);
    await pruefeDialog(page, { alt: 26.11, neu: 27.54 });
    assert.equal(protokoll.book.length, 2);
    assert.equal(protokoll.book[1].confirmedTotalGross, 26.11);
    assert.equal(protokoll.book[1].offerRevision, 1, "der Preisstand der Übernahme reiste nicht mit");
    assert.equal(await page.locator("#price-change-accepted").count(), 0, "der alte Hinweis blieb stehen");

    // 4. Zweite Übernahme, danach die Buchung zum neuen Preis.
    await page.locator("#price-drift-accept").click();
    await page.locator(".price-drift-card").waitFor({ state: "detached", timeout: 10000 });
    assert.deepEqual(protokoll.reprice.at(-1).acceptPriceChange, { expectedTotalGross: 27.54 });
    await page.locator("#price-change-accepted").waitFor({ timeout: 5000 });
    assert.equal(protokoll.book.length, 2);
    await buchenKlick(page);
    await page.waitForSelector(".booking-success-title", { timeout: 20000 });
    assert.equal(protokoll.book.length, 3, "genau drei bewusste Buchungsklicks");
    assert.equal(protokoll.book[2].confirmedTotalGross, 27.54);
    assert.equal(protokoll.book[2].offerRevision, 2);
    assert.equal(protokoll.reprice.filter((b) => b.acceptPriceChange).length, 2, "genau zwei Übernahmen");
    assert.equal((await text(page.locator("body"))).match(VERBOTEN), null);
    if (viewport.width < 768) assert.ok(await querUeberlauf(page) <= 0, "Erfolg: horizontaler Überlauf");
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

test("B — scheitert die Übernahme, bleibt der Dialog offen; erneut versuchen übernimmt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, { vorBuchung: (n) => (n === 1 ? 1 : null), annahmeFehler: 1 });
  await zurVersichertenBuchung(page);
  await buchenKlick(page);
  await pruefeDialog(page, { alt: 24.68, neu: 26.11 });

  await page.locator("#price-drift-accept").click();
  const fehlerzeile = page.locator(".price-drift-error");
  await fehlerzeile.waitFor({ timeout: 10000 });
  const fehlertext = await text(fehlerzeile);
  assert.match(fehlertext, /nicht bestätigt/);
  assert.ok(!/Rohtext|Transglobal/.test(fehlertext), `Rohtext sichtbar: ${fehlertext}`);
  assert.equal(await page.locator(".price-drift-card").count(), 1, "der Dialog schloss nach einem Fehler");
  assert.equal(await page.locator("#price-drift-accept").isEnabled(), true);
  assert.equal(await page.locator("#price-drift-recalculate").isEnabled(), true);
  assert.equal(protokoll.book.length, 1);

  await page.locator("#price-drift-accept").click();
  await page.locator(".price-drift-card").waitFor({ state: "detached", timeout: 10000 });
  await page.locator("#price-change-accepted").waitFor({ timeout: 5000 });
  assert.equal(protokoll.book.length, 1, "nach der Übernahme wurde automatisch gebucht");
  await page.close();
});

test("C — eine gewöhnliche Neubepreisung mit Preisänderung öffnet denselben Dialog statt einer Sackgasse", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const protokoll = neuesProtokoll();
  const zustand = await setupRoutes(page, protokoll, { startAktuell: 1 });
  await zurVersichertenBuchung(page, { warteAufBestaetigung: false });
  await pruefeDialog(page, { alt: 24.68, neu: 26.11 });
  assert.equal(protokoll.book.length, 0);
  assert.equal(await page.locator(".booking-insurance-box .field-error").count(), 0, "statt des Dialogs erschien eine Fehlermeldung");

  await page.locator("#price-drift-accept").click();
  await page.locator(".price-drift-card").waitFor({ state: "detached", timeout: 10000 });
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  assert.equal(zustand.revision, 1);
  assert.equal(protokoll.book.length, 0, "die Übernahme hat gebucht");
  await buchenKlick(page);
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(protokoll.book.length, 1);
  assert.equal(protokoll.book[0].confirmedTotalGross, 26.11);
  await page.close();
});
