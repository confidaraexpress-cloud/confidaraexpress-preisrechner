// E2E: Buchungsantworten, bei denen NICHTS beauftragt wurde — die sichtbare Meldung und die angebotene nächste
// Handlung (TG-Abschluss, 2026-10-12). Echter Dev-Server, nachgebildeter Server, kein Anbieter, keine Bestellung.
//
//   E1  409 INSUFFICIENT_STOCK (Artikelname): Lagertext, „Bestand prüfen" + „Angebote neu berechnen",
//       kein „Zu meinen Sendungen", kein Bestellknopf, kein zweiter /book; der Korrekturweg führt zum Bestand
//   E2  409 RESERVATION_CLAIMED bei versicherter Buchung: „Aufträge prüfen", keine wirkungslose Neubepreisung
//   E3  400 PRICE_INPUTS_MISSING (Art der Lieferadresse) bei einem Angebot mit Adressart: zurück an die Auswahl,
//       Optionen neu geladen, keine Adressfehlerfläche
//   E4  400 PRICE_INPUTS_MISSING (andere Angabe): Neuberechnung mit benannter Ursache, keine Adressfehlerfläche
//   E5  503 LEGAL_DOCUMENTS_NOT_CONFIGURED: „Buchung derzeit nicht möglich", nichts beauftragt, Bestellknopf bleibt,
//       keine Klärung, kein automatisches Wiederholen — für beide Angebotsarten
//   E6  Gegenprobe: 503 OHNE Code bleibt ein offener Ausgang („Buchungsstatus wird geprüft", „Zu meinen Sendungen")
//   E7  Gegenprobe: 202 BOOKING_PENDING bleibt ein offener Ausgang
//   E8  Paket F: 409 CREDIT_LIMIT_EXCEEDED — Beträge aus der Antwort, „Zu meinen Rechnungen", kein Bestellknopf,
//       kein „Zu meinen Sendungen", keine Neuberechnung, kein zweiter /book
//   E9  Paket F: Vorab-Hinweis zum Rahmen (reine Anzeige) — der Bestellknopf bleibt; ohne Rahmen kein Hinweis
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  adressvorschlaegeAbgeschlossen, fuelleVersandformular, STANDARD_PAKET, STANDARD_SENDUNGSANGABEN,
} from "./helpers/newShipmentForm.mjs";
import { lieferadressZustand, mockeLieferadresse, waehleLieferadresse } from "./helpers/residentialPriceInputs.mjs";

const PORT = 5491, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 4991;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// Berliner Geschäftstag — ausschließlich als FIXTUREWERT des nachgebildeten Servers.
const berlin = (ms) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(ms));
const MORGEN = berlin(Date.now() + 36 * 60 * 60 * 1000);
const kennung = (kopf, fuss) => `${kopf}${fuss.padStart(32 - kopf.length, "0")}`;

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10991",
};

const WARENWERT = Number(STANDARD_SENDUNGSANGABEN.declaredGoodsValue);
const COVER_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
  coverValueSource: "goods_value", coverState: "available", coverValue: WARENWERT,
  basicCoverMaxGoodsValue: 50, maxCoverValue: 2500,
};

/* Ein direkt buchbares Angebot (Form eines JUMiNGO-Tarifs) mit kaufbarer Absicherung. Serverbeträge, nie gerechnet. */
const JM = {
  id: 21, shipper_tariff_id: 3321, offerId: kennung("erec", "21"),
  publicCarrierId: "dhl", publicCarrierName: "DHL Express", publicServiceName: "Standardversand",
  serviceType: "pickup", currency: "EUR", netPrice: 10.8, vatAmount: 2.05, finalPrice: 12.85,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage", availableForDate: true, bookable: true,
  pickupDate: `${MORGEN}T00:00:00Z`, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  trackingAvailable: true, printerRequired: false, requiredPriceInputs: [],
  insuranceAvailable: true, insuranceDetails: COVER_DETAILS,
};

/* Ein Angebot mit Art der Lieferadresse nach der Auswahl (Form eines Transglobal-Angebots). */
const G = { net: 11.26, vat: 2.14, gross: 13.4 };
const P = { net: 13.36, vat: 2.54, gross: 15.9 };
const RES = { net: 2.1, vat: 0.4, gross: 2.5 };
const TG = {
  offerId: kennung("erec22", "22"), publicCarrierId: "ups", publicServiceName: "Standardversand",
  serviceType: "pickup", collectionDate: MORGEN, collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  netPrice: G.net, vatAmount: G.vat, finalPrice: G.gross, currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: false, insuranceDetails: null, trackingAvailable: true, printerRequired: true, tariffLimits: [],
};

const absicherung = (body) => ({
  selectedInsurance: "transit_cover",
  insurance: { coverValue: body.coverValue, excessValue: 20, goodsAreNew: body.goodsAreNew,
               goodsAreFragile: body.goodsAreFragile, insuranceGross: 10 },
  totals: { customerShippingNet: 10.8, shippingVat: 2.05, customerShippingGross: 12.85, insuranceGross: 10,
            customerTotalNet: 20.8, customerTotalGross: 22.85 },
  tariff: { insuranceAvailable: true, insuranceDetails: COVER_DETAILS },
  components: [
    { type: "shipping_base", taxable: true, net: 10.8, vat: 2.05, gross: 12.85 },
    { type: "transport_insurance", taxable: false, net: 10, vat: 0, gross: 10 },
  ],
});

let server, browser;

/* Szenario: `buchung(body)` → `{ status, body }` der /book-Antwort. Jeder /book-Request landet in `p.book`. */
async function setup(page, szenario) {
  const p = { book: [], reprice: [], anfragen: [] };
  const lz = lieferadressZustand({ offerId: TG.offerId, geschaeft: G, privat: P, zuschlag: RES });
  p.lz = lz;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad.endsWith("/kunde/credit")) return szenario.kredit ? json({ credit: szenario.kredit }) : json({ error: "Nicht gefunden" }, 404);
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (pfad.includes("/api/shipping/launch-scope")) return json({ countries: ["DE"], partialCountries: [] });
    if (pfad.includes("/api/jumingo/calculate-price")) {
      return json({
        ceShipmentId: CE_ID, tariffs: [JM, TG], availableShippingModes: ["standard", "express"],
        publicCarriers: [{ id: "dhl", name: "DHL Express" }, { id: "ups", name: "UPS" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
    }
    if (pfad.includes("/api/insurance/reprice")) {
      const body = req.postDataJSON();
      p.reprice.push(body);
      return json(absicherung(body));
    }
    if (pfad.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: `${MORGEN}T09:00:00Z`, availableUntil: `${MORGEN}T17:00:00Z`,
      minimumMinutes: 120, adjustable: true,
    });
    if (pfad.includes("/api/jumingo/book")) {
      const body = req.postDataJSON();
      p.book.push(body);
      const a = szenario.buchung(body);
      return json(a.body, a.status);
    }
    return json({});
  });
  // NACH dem Sammel-Mock: Playwright prüft Routen in umgekehrter Reihenfolge.
  await mockeLieferadresse(page, lz, p.anfragen);
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const knopf = (page, name) => page.getByRole("button", { name, exact: true });
const buchenKnopf = (page) => page.getByRole("button", { name: "Kostenpflichtig buchen" });

async function neueSeite() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function zurBuchungsseite(page, tarif) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  const adressen = adressvorschlaegeAbgeschlossen(page);
  await fuelleVersandformular(page, { paket: { ...STANDARD_PAKET, packageCount: "1" } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await adressen;
  await karteVon(page, tarif).locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await page.waitForSelector("#booking-reference-toggle", { timeout: 20000 });
  if (tarif === TG) await waehleLieferadresse(page, false);
}

async function absichern(page) {
  await page.locator(`.ins-card:has(input[value="transit_cover"]) .ins-card-name`).click();
  await page.locator("#ins-goodsAreNew-ja").check();
  await page.locator("#ins-goodsAreFragile-nein").check();
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
}

async function zuSchritt2(page) {
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".booking-confirm-panel", { timeout: 20000 });
}

async function bucheEinmal(page, p) {
  if ((await page.locator(".booking-confirm-panel").count()) === 0) await zuSchritt2(page);
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut
  await checks.nth(0).check();
  await checks.nth(1).check();
  await buchenKnopf(page).click();
  await warteBis(async () => p.book.length === 1, "der /book-Request");
}

async function warteBis(pruefe, wo, timeout = 10000) {
  const ende = Date.now() + timeout;
  for (;;) {
    if (await pruefe()) return;
    if (Date.now() > ende) throw new Error(`Zeitlimit: ${wo}`);
    await kurz(100);
  }
}

/* Weder ein offener Ausgang noch die Adressfehlerfläche — und kein zweiter /book, auch nicht verzögert. */
async function keinOffenerAusgangKeinZweiterVersuch(page, p) {
  assert.equal(await knopf(page, "Zu meinen Sendungen").count(), 0, "„Zu meinen Sendungen“ für einen Vorgang ohne Auftrag");
  assert.equal(await page.getByText("Buchungsstatus wird geprüft").count(), 0, "eine laufende Prüfung wird behauptet");
  assert.equal(await page.getByText("NICHT erneut ab").count(), 0);
  assert.equal(await knopf(page, "Adressen vervollständigen & neu berechnen").count(), 0, "falsche Ursache: Adresse");
  await kurz(1200);
  assert.equal(p.book.length, 1, "ein zweiter /book-Request ist entstanden");
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
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
    stopDevServer(server, "SIGKILL");
  }
});

test("E1 — 409 INSUFFICIENT_STOCK: Lagertext mit Artikel, Korrekturweg und Neuberechnung statt Sendungsliste", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { buchung: () => ({ status: 409, body: {
    error: "Nicht genügend verfügbarer Bestand für Ersatzteil A.", code: "INSUFFICIENT_STOCK",
    details: { productId: "7", sku: "ET-A", name: "Ersatzteil A", required: 3 },
  } }) });
  await zurBuchungsseite(page, JM);
  await bucheEinmal(page, p);
  const flaeche = page.locator("#booking-inventory-conflict");
  await flaeche.waitFor({ state: "visible", timeout: 10000 });
  assert.equal(norm(await flaeche.locator(".booking-conflict-text").textContent()),
    "Für „Ersatzteil A“ ist nicht genügend Bestand verfügbar. Es wurde nichts beauftragt und nichts berechnet. "
    + "Bitte prüfen Sie den Bestand und berechnen Sie die Angebote danach neu.");
  assert.equal(await flaeche.getByRole("button", { name: "Bestand prüfen", exact: true }).count(), 1);
  assert.equal(await flaeche.getByRole("button", { name: "Angebote neu berechnen", exact: true }).count(), 1);
  assert.equal(await buchenKnopf(page).count(), 0, "der Bestellknopf steht noch");
  await keinOffenerAusgangKeinZweiterVersuch(page, p);
  await flaeche.getByRole("button", { name: "Bestand prüfen", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("page") === "stock", { timeout: 10000 });
  assert.equal(p.book.length, 1);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E2 — 409 RESERVATION_CLAIMED bei versicherter Buchung: Weg zu den Aufträgen, keine wirkungslose Neubepreisung", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { buchung: () => ({ status: 409, body: {
    error: "Diese Auftragsmenge wird bereits für eine andere Sendung verwendet. Bitte aktualisieren Sie den Auftrag.",
    code: "RESERVATION_CLAIMED", details: { productId: "7", sku: "ET-A", name: "Ersatzteil A" },
  } }) });
  await zurBuchungsseite(page, JM);
  await zuSchritt2(page);
  await absichern(page);
  await warteBis(async () => p.reprice.length > 0, "die Neubepreisung der Absicherung");
  const neubepreisungenVorher = p.reprice.length;
  await bucheEinmal(page, p);
  const flaeche = page.locator("#booking-inventory-conflict");
  await flaeche.waitFor({ state: "visible", timeout: 10000 });
  assert.match(norm(await flaeche.textContent()), /^Diese Auftragsmenge wird bereits für eine andere Sendung verwendet\. Es wurde nichts beauftragt/);
  assert.equal(await flaeche.getByRole("button", { name: "Aufträge prüfen", exact: true }).count(), 1);
  assert.equal(await flaeche.getByRole("button", { name: "Angebote neu berechnen", exact: true }).count(), 1);
  await keinOffenerAusgangKeinZweiterVersuch(page, p);
  assert.equal(p.reprice.length, neubepreisungenVorher, "der Lagerkonflikt hat eine Neubepreisung ausgelöst");
  await flaeche.getByRole("button", { name: "Aufträge prüfen", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("page") === "orders", { timeout: 10000 });
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E3 — 400 PRICE_INPUTS_MISSING (Art der Lieferadresse): zurück an die Auswahl, Optionen neu, keine Adressfläche", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { buchung: () => ({ status: 400, body: {
    error: "Für dieses Angebot fehlen noch Angaben zur Zustelladresse.", code: "PRICE_INPUTS_MISSING",
    fields: ["deliveryIsResidential"],
  } }) });
  await zurBuchungsseite(page, TG);
  const optionenVorher = p.lz.optionsCalls.length;
  await bucheEinmal(page, p);
  await page.getByText("Bitte wählen Sie zuerst die Art der Lieferadresse.").first().waitFor({ state: "visible", timeout: 10000 });
  await warteBis(async () => p.lz.optionsCalls.length > optionenVorher, "die Optionen werden neu geladen");
  assert.equal(await page.locator(".booking-confirm-panel").count(), 0, "die Seite steht nicht wieder an der Auswahl");
  await keinOffenerAusgangKeinZweiterVersuch(page, p);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E4 — 400 PRICE_INPUTS_MISSING (andere Angabe): Neuberechnung mit benannter Ursache, keine Adressfläche", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { buchung: () => ({ status: 400, body: {
    error: "Für dieses Angebot fehlen noch Angaben zur Zustelladresse.", code: "PRICE_INPUTS_MISSING",
    fields: ["collectionIsResidential"],
  } }) });
  await zurBuchungsseite(page, TG);
  await bucheEinmal(page, p);
  const text = page.getByText("Für dieses Angebot fehlen preisrelevante Angaben. Es wurde nichts beauftragt und nichts berechnet.");
  await text.first().waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await knopf(page, "Angebote neu berechnen").count(), 1);
  assert.equal(await buchenKnopf(page).count(), 0);
  await keinOffenerAusgangKeinZweiterVersuch(page, p);
  assert.deepEqual(fehler, []);
  await page.close();
});

for (const [kennzeichen, tarif] of [["direkt buchbares Angebot", JM], ["Angebot mit Adressart", TG]]) {
  test(`E5 — 503 LEGAL_DOCUMENTS_NOT_CONFIGURED (${kennzeichen}): derzeit nicht möglich, nichts beauftragt, Knopf bleibt`, async () => {
    const { page, fehler } = await neueSeite();
    const p = await setup(page, { buchung: () => ({ status: 503, body: {
      error: "Die Vertragsunterlagen sind derzeit nicht abrufbar.", code: "LEGAL_DOCUMENTS_NOT_CONFIGURED",
    } }) });
    await zurBuchungsseite(page, tarif);
    await bucheEinmal(page, p);
    // Der Hinweis der Buchungsaktion (der Seitenkopf zeigt denselben Fehler zusätzlich als FormAlert).
    const banner = page.locator(".alert.alert-error[role=alert]:not(.form-alert)");
    await banner.waitFor({ state: "visible", timeout: 10000 });
    const inhalt = norm(await banner.textContent());
    assert.ok(inhalt.startsWith("Buchung derzeit nicht möglich"), inhalt);
    assert.ok(inhalt.includes("Es wurde nichts beauftragt und nichts berechnet."), inhalt);
    assert.equal(await buchenKnopf(page).count(), 1, "der Bestellknopf fehlt");
    await keinOffenerAusgangKeinZweiterVersuch(page, p);
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

test("E6 — Gegenprobe: 503 OHNE Code bleibt ein offener Ausgang — kein neuer Versuch, Weg in die Sendungen", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { buchung: () => ({ status: 503, body: { error: "Service Unavailable" } }) });
  await zurBuchungsseite(page, JM);
  await bucheEinmal(page, p);
  await knopf(page, "Zu meinen Sendungen").waitFor({ state: "visible", timeout: 10000 });
  assert.ok(norm(await page.locator(".booking-conflict-text").first().textContent()).includes("NICHT erneut ab"));
  assert.equal(await buchenKnopf(page).count(), 0);
  assert.equal(await page.locator("#booking-inventory-conflict").count(), 0);
  await kurz(1200);
  assert.equal(p.book.length, 1);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E7 — Gegenprobe: 202 BOOKING_PENDING bleibt ein offener Ausgang", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { buchung: () => ({ status: 202, body: {
    status: "pending", code: "BOOKING_PENDING", error: "Der Ausgang der Buchung wird geprüft.",
  } }) });
  await zurBuchungsseite(page, TG);
  await bucheEinmal(page, p);
  await knopf(page, "Zu meinen Sendungen").waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await buchenKnopf(page).count(), 0);
  await kurz(1200);
  assert.equal(p.book.length, 1);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E8 — Paket F: 409 CREDIT_LIMIT_EXCEEDED: Beträge aus der Antwort, Weg zu den Rechnungen, nichts beauftragt, kein zweiter Versuch", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { buchung: () => ({ status: 409, body: {
    error: "SERVERTEXT", code: "CREDIT_LIMIT_EXCEEDED",
    creditLimit: { limit: 2000, open: 1500, reserved: 300, available: 200, amount: 12.85, currency: "EUR" },
  } }) });
  await zurBuchungsseite(page, JM);
  await bucheEinmal(page, p);
  const flaeche = page.locator("#booking-credit-limit");
  await flaeche.waitFor({ state: "visible", timeout: 10000 });
  const text = norm(await flaeche.locator(".booking-conflict-text").textContent()).replace(/[  ]/g, " ");
  assert.equal(text,
    "Diese Buchung (12,85 €) überschreitet Ihren verfügbaren Buchungsrahmen (200,00 € von 2.000,00 €). "
    + "Es wurde nichts beauftragt. Bitte begleichen Sie offene Rechnungen oder wenden Sie sich an uns, wenn Sie einen höheren Rahmen benötigen.");
  assert.doesNotMatch(text, /SERVERTEXT/);
  assert.equal(await flaeche.getByRole("button", { name: "Zu meinen Rechnungen", exact: true }).count(), 1);
  assert.equal(await buchenKnopf(page).count(), 0, "der Bestellknopf steht noch");
  assert.equal(await knopf(page, "Angebote neu berechnen").count(), 0, "eine Neuberechnung repariert den Rahmen nicht");
  await keinOffenerAusgangKeinZweiterVersuch(page, p);
  await flaeche.getByRole("button", { name: "Zu meinen Rechnungen", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("page") === "invoices", { timeout: 10000 });
  assert.equal(p.book.length, 1);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E9 — Paket F: Vorab-Hinweis zum Buchungsrahmen ist reine Anzeige — der Bestellknopf bleibt; ohne Rahmen kein Hinweis", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page, { buchung: () => ({ status: 200, body: {} }),
    kredit: { limit: 2000, open: 1990, reserved: 0, available: 10, exhausted: false, currency: "EUR" } });
  await zurBuchungsseite(page, JM);
  await zuSchritt2(page);
  const hinweis = page.locator("#booking-credit-hint");
  await hinweis.waitFor({ state: "visible", timeout: 10000 });
  const text = norm(await hinweis.textContent()).replace(/[  ]/g, " ");
  assert.equal(text, "Hinweis: Diese Buchung (12,85 €) übersteigt Ihren verfügbaren Buchungsrahmen (10,00 €). Der Rahmen wird beim Buchen erneut geprüft.");
  assert.equal(await buchenKnopf(page).count(), 1, "der Bestellknopf muss trotz Hinweis stehen bleiben");
  assert.deepEqual(fehler, []);
  await page.close();

  const ohne = await neueSeite();
  await setup(ohne.page, { buchung: () => ({ status: 200, body: {} }) });
  await zurBuchungsseite(ohne.page, JM);
  await zuSchritt2(ohne.page);
  await kurz(400);
  assert.equal(await ohne.page.locator("#booking-credit-hint").count(), 0, "ohne Rahmen (altes Backend) darf kein Hinweis stehen");
  assert.deepEqual(ohne.fehler, []);
  await ohne.page.close();
});
