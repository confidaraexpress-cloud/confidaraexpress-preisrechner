// E2E: TG22 Golden Offer Contract — eine Preisprojektion auf allen Kundenflächen, eine offene
// Preisänderung ohne Rückfall auf den alten Preis, Zustellung/Abholung/Label in einer Sprache.
// Echter Dev-Server, echter Browser, gemocktes Backend.
//
//   A  Angebotsliste: TG22 (Standardversand, Laufzeit, „bereit ab", PDF · DIN A4 / Thermodruck,
//      keine Tarif-ID) neben dem Vergleichsangebot (Zustellung mit Daten, Tarif-ID 3708) —
//      kein Einkaufsname im DOM                                               E2E-1/9/10/11/12/13
//   B  TG22 mit Transportabsicherung: 15,33 / 2,91 / 18,24 / 10,00 / 25,33 / 28,24 — Kopf,
//      Sticky, Aufstellung und (zurück in Schritt 1) ausgewähltes Angebot identisch; Labelhinweis;
//      Erfolgsbetrag vom Server                                                E2E-1/3/4/13/14
//   C  TG22 mit Warenwert ≤ 50 €: Grundabsicherung, keine Neubepreisung, Preis unverändert  E2E-2
//   D  TG-Preisänderung: Escape → gesperrt, erneut öffnen, übernehmen → alle Flächen ohne
//      Neuladen; ohne Absicherung neuer Versandpreis; Angebotsliste zeigt ihn          E2E-5/6
//   E  Vergleichsangebot versichert + Drift ohne Neubindung: nur „Angebote neu berechnen", alte
//      Angebote verworfen; Abholfenster-Regler; Zustellung mit Daten             E2E-7/8/11/12
//   F  Vergleichsangebot ohne Absicherung + Drift: Hintergrund schließt, alter Preis bleibt
//      gesperrt, kein zweiter Buchungsversuch                                      E2E-6/8
//   G  834 / 390 px: Angebote, Schritt 1/2, Dialog und Hinweis ohne Überlauf; Preislabels sichtbar
//
// Kein echtes Backend, keine Bestellung, keine Neubepreisung beim Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_PAKET, STANDARD_SENDUNGSANGABEN } from "./helpers/newShipmentForm.mjs";
import { mockeLieferadresse, lieferadressZustand, waehleLieferadresse } from "./helpers/residentialPriceInputs.mjs";

const PORT = 5393, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 4822;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const tagIn = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ABHOLTAG = tagIn(7);
const ZUSTELL_MIN = tagIn(8);
const ZUSTELL_MAX = tagIn(9);
const deDatum = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10822",
};

const COVER_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
};
const COVER_GRUNDABSICHERUNG = {
  isInsurable: false, selectionModel: "cover_value", coverState: "basic_cover_included",
  basicCoverMaxGoodsValue: 50, excessValue: 20,
};

/* Das öffentliche TG22-Angebot — ohne Tarif-ID, ohne ServiceID, ohne Einkaufsspur. */
const TG22 = (extra = {}) => ({
  offerId: "tg22-golden-000000000000000000022", publicCarrierId: "ups", publicServiceName: "Standardversand",
  serviceType: "pickup", collectionDate: ABHOLTAG, collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  netPrice: 15.33, vatAmount: 2.91, finalPrice: 18.24, currency: "EUR",
  // TG22 Residential: auswählbar, erst nach der Wahl der Lieferadresse buchbar und absicherbar.
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: false, insuranceDetails: null,
  trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }],
  ...extra,
});

/* Dieselbe Absicherungsfähigkeit OHNE Angabe nach der Auswahl — der Weg der ausdrücklichen
   Preisübernahme (TG22 Paket A, Tests D und G). Ein Angebot mit Art der Lieferadresse bekommt bei
   einer Preisänderung stattdessen eine Neubestätigung (tg22ResidentialPriceInputs.test.mjs). */
const TG22_KLASSISCH = (extra = {}) => TG22({
  bookable: true, unavailableReason: null, priceCompleteness: "complete", requiredPriceInputs: [],
  insuranceAvailable: true, insuranceDetails: COVER_DETAILS, ...extra,
});

/* Das Vergleichsangebot: Tarif-ID, Abholfenster, Zustelldaten, A4/A6-Wahl, Stufenversicherung. */
const VERGLEICH = (extra = {}) => ({
  id: 17, shipper_tariff_id: 3708, offerId: "ju-golden-00000000000000000003708",
  publicCarrierId: "ups", publicServiceName: "Standardversand", serviceType: "pickup",
  netPrice: 12.9, vatAmount: 2.45, finalPrice: 15.35, currency: "EUR",
  transitDaysMin: 1, transitDaysMax: 2,
  pickupDate: `${ABHOLTAG}T00:00:00Z`, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  pickupWindowAdjustable: true, pickupWindowMinMinutes: 120,
  deliveryDateMin: `${ZUSTELL_MIN}T00:00:00Z`, deliveryDateMax: `${ZUSTELL_MAX}T00:00:00Z`,
  deliveryTimeUntil: "18:00",
  trackingAvailable: true, printerRequired: false, availableForDate: true, bookable: true,
  // TG22 Residential: das Vergleichsangebot kennt keine Angabe nach der Auswahl — die Liste ist leer.
  requiredPriceInputs: [],
  labelFormatOptions: ["A4", "A6"],
  insuranceAvailable: true,
  insuranceDetails: { isInsurable: true, insuranceValue: 500,
                      extraInsurancePriceBruttoPreselect: 3.99, extraInsurancePremiumPriceBruttoPreselect: 7.99 },
  ...extra,
});

/* Preisstände des Servers für TG22 mit Absicherung (10,00 €, steuerfrei). */
const STAND = [
  { netto: 15.33, mwst: 2.91, versand: 18.24, gesamtNetto: 25.33, gesamt: 28.24 },
  { netto: 17.01, mwst: 3.23, versand: 20.24, gesamtNetto: 27.01, gesamt: 30.24 },
];

const COVER_OK = (body, i, revision = i) => ({
  selectedInsurance: "transit_cover",
  insurance: { coverValue: body.coverValue, excessValue: 20, goodsAreNew: body.goodsAreNew,
               goodsAreFragile: body.goodsAreFragile, insuranceGross: 10 },
  totals: { customerShippingNet: STAND[i].netto, shippingVat: STAND[i].mwst, customerShippingGross: STAND[i].versand,
            insuranceGross: 10, customerTotalNet: STAND[i].gesamtNetto, customerTotalGross: STAND[i].gesamt },
  tariff: { insuranceAvailable: true, insuranceDetails: COVER_DETAILS },
  priceRevision: revision, priceChangeAccepted: revision > 0,
});

const STUFE_OK = (body) => ({
  selectedInsurance: body.insuranceType, includedInsuranceValue: 500,
  totals: { customerShippingNet: 12.9, shippingVat: 2.45, customerShippingGross: 15.35,
            insuranceGross: 4.49, customerTotalNet: 17.39, customerTotalGross: 19.84 },
  tariff: { id: 17, shipperTariffId: 3708, insuranceAvailable: true, insuranceDetails: VERGLEICH().insuranceDetails },
});

const BUCHUNG = (amount) => ({
  message: "Sendung gebucht", ceShipmentId: CE_ID, invoiceNumber: "CE-RE26-00822",
  businessOrderNumber: "CE-BS26-00822", dueDate: null, amount, billingMode: "single",
  testBooking: false, voucherCode: null, deliveryNote: null,
  orderConfirmation: { number: "CE-AB26-00822", issuedAt: "2026-09-13T10:00:00Z" }, shippingDocuments: [],
});

const VERBOTEN = /transglobal|jumingo|ServiceID|Service-ID|shipper_tariff_id/i;

let server, browser;

/* Das Szenario steuert die Antworten: `tarife`, `reprice(body, zustand)`, `book(body, n, zustand)`.
   Eine Antwort ist `{ status, json }`; ohne Antwort gilt der Normalfall. */
async function setupRoutes(page, protokoll, szenario = {}) {
  const zustand = { stand: 0 };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    protokoll.pfade.push(p);
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (p.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: `${ABHOLTAG}T09:00:00Z`, availableUntil: `${ABHOLTAG}T17:00:00Z`,
      minimumMinutes: 120, adjustable: true,
    });
    if (p.includes("/api/jumingo/calculate-price")) {
      protokoll.calc.push(req.postDataJSON());
      return json({
        ceShipmentId: CE_ID, tariffs: szenario.tarife || [TG22(), VERGLEICH()], availableShippingModes: ["standard"],
        publicCarriers: [{ id: "ups", name: "UPS" }], customsRequired: false,
        fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
    }
    if (p.includes("/api/insurance/reprice")) {
      const body = req.postDataJSON();
      protokoll.reprice.push(body);
      const a = szenario.reprice ? szenario.reprice(body, zustand) : null;
      if (a) return json(a.json, a.status || 200);
      if (body.insuranceType === "standard" || body.insuranceType === "premium") return json(STUFE_OK(body));
      return json(COVER_OK(body, zustand.stand));
    }
    if (p.includes("/api/jumingo/book")) {
      const body = req.postDataJSON();
      protokoll.book.push(body);
      const a = szenario.book ? szenario.book(body, protokoll.book.length, zustand) : null;
      if (a) return json(a.json, a.status || 200);
      return json(BUCHUNG(szenario.betrag ?? 18.24));
    }
    return json({});
  });
  // TG22 Residential — NACH dem Sammel-Mock: Playwright prüft Routen in umgekehrter Reihenfolge.
  // Geschäftsadresse = der Vergleichspreis; die Absicherung kommt mit der Bindung.
  const nachBindung = szenario.nachBindung || { insuranceAvailable: true, insuranceDetails: COVER_DETAILS };
  await mockeLieferadresse(page, lieferadressZustand({
    offerId: TG22().offerId,
    geschaeft: { net: 15.33, vat: 2.91, gross: 18.24 },
    privat: { net: 18.51, vat: 3.52, gross: 22.03 },
    zuschlag: { net: 3.18, vat: 0.61, gross: 3.79 },
    ...nachBindung,
  }), protokoll.lieferadresse);
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return zustand;
}

const neuesProtokoll = () => ({ pfade: [], reprice: [], book: [], calc: [], lieferadresse: [] });
const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const inhalt = async (loc) => norm(await loc.first().textContent());
const querUeberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const EIN_PAKET = { ...STANDARD_PAKET, packageCount: "1" };
const buchenKnopf = (page) => page.getByRole("button", { name: /Kostenpflichtig buchen/ });

async function neueSeite(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function zuDenAngeboten(page, sendungsangaben = STANDARD_SENDUNGSANGABEN) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { paket: EIN_PAKET, sendungsangaben });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

async function waehle(page, tarif) {
  await karteVon(page, tarif).locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await page.waitForSelector("#booking-reference-toggle", { timeout: 20000 });
  // TG22 Residential: ein Angebot mit Art der Lieferadresse wird erst mit der Wahl buchbar.
  if (Array.isArray(tarif.requiredPriceInputs) && tarif.requiredPriceInputs.includes("deliveryIsResidential")) {
    await waehleLieferadresse(page, false);
  }
}

async function zuSchritt2(page) {
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".booking-confirm-panel", { timeout: 20000 });
}

async function zuSchritt1(page) {
  await page.getByRole("button", { name: /Zurück zur Übersicht/ }).click();
  await page.waitForSelector(".offsum-price", { timeout: 20000 });
}

async function absichern(page) {
  await page.locator(`.ins-card:has(input[value="transit_cover"]) .ins-card-name`).click();
  await page.locator("#ins-goodsAreNew-ja").check();
  await page.locator("#ins-goodsAreFragile-nein").check();
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
}

async function bestaetigen(page) {
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut
  await checks.nth(0).check();
  await checks.nth(1).check();
}

async function warteAufText(page, selektor, teil, timeout = 10000) {
  await page.waitForFunction(({ s, t }) => {
    const el = document.querySelector(s);
    return !!el && el.textContent.replace(/ /g, " ").includes(t);
  }, { s: selektor, t: teil }, { timeout });
}

/* Die drei Preisflächen als Text: Label, Brutto, Netto. */
async function preisflaechen(page) {
  const lese = async (sel) => ((await page.locator(sel).count()) > 0 ? inhalt(page.locator(sel)) : null);
  return {
    kopf:    { label: await lese(".blsum-price-label"),  brutto: await lese(".blsum-price-gross"),  netto: await lese(".blsum-price-net") },
    sticky:  { label: await lese(".bsum-price-label"),   brutto: await lese(".bsum-price-gross"),   netto: await lese(".bsum-price-net") },
    auswahl: { label: await lese(".offsum-price-label"), brutto: await lese(".offsum-price-gross"), netto: await lese(".offsum-price-net") },
  };
}

async function ohneEinkaufsspur(page, wo) {
  const html = await page.evaluate(() => document.body.outerHTML);
  const treffer = html.match(VERBOTEN);
  assert.equal(treffer, null, `${wo}: unzulässiger Text im DOM: ${treffer && treffer[0]}`);
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
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("A — Angebotsliste: TG22 und Vergleichsangebot in einer Sprache, Tarif-ID nur mit Tarifkennung", async () => {
  const { page, fehler } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll);
  await zuDenAngeboten(page);

  // TG22: Leistungsname, Laufzeit statt Datum, „bereit ab", Preis.
  const tg = karteVon(page, TG22());
  const tgText = await inhalt(tg);
  assert.match(tgText, /Standardversand/);
  assert.match(tgText, /UPS/);
  assert.match(tgText, /Voraussichtliche Laufzeit/);
  assert.match(tgText, /1–2 Tage/);
  assert.match(tgText, /bereit ab 09:00 Uhr/);
  assert.match(tgText, /15,33 €/);
  assert.doesNotMatch(tgText, /\bLieferung\b|\bZustellung\b/, "die Laufzeit ist wieder als Termin benannt");
  // TG22 Residential: vorläufiger Preis und Zuschlagshinweis — ohne „ab“-Betrag.
  assert.match(tgText, /Vorläufiger Preis/);
  assert.match(tgText, /Bei einer privaten Lieferadresse kann ein Zuschlag anfallen\./);
  assert.doesNotMatch(tgText, /ab \d+,\d{2} €/);
  await tg.locator(`button[aria-controls="offer-details-${TG22().offerId}"]`).click();
  await page.locator(`#offer-details-${TG22().offerId}`).waitFor({ timeout: 10000 });
  const tgDetails = await inhalt(page.locator(`#offer-details-${TG22().offerId}`));
  assert.match(tgDetails, /Verfügbare Labelformate\s*PDF · DIN A4 \/ Thermodruck/);
  assert.doesNotMatch(tgDetails, /Thermal|A4 \/ Thermal/);
  assert.doesNotMatch(tgDetails, /Tarif-ID/, "das TG22-Angebot zeigt eine Tarif- oder Servicekennung");

  // Vergleichsangebot: Zustellung mit echten Daten, Abholfenster, Tarif-ID 3708 — ohne Einkaufsnamen.
  const ju = karteVon(page, VERGLEICH());
  const juText = await inhalt(ju);
  assert.match(juText, /Zustellung/);
  assert.match(juText, /09:00–17:00 Uhr/);
  await ju.locator(`button[aria-controls="offer-details-${VERGLEICH().offerId}"]`).click();
  await page.locator(`#offer-details-${VERGLEICH().offerId}`).waitFor({ timeout: 10000 });
  const juDetails = await inhalt(page.locator(`#offer-details-${VERGLEICH().offerId}`));
  assert.match(juDetails, /Tarif-ID\s*3708/, "die Tarif-ID des Vergleichsangebots ist verschwunden");
  assert.match(juDetails, new RegExp(`Zustellzeitraum\\s*${deDatum(ZUSTELL_MIN)} – ${deDatum(ZUSTELL_MAX)}`));
  assert.match(juDetails, /Zustellung\s*bis 18:00 Uhr/);
  assert.match(juDetails, /Zeitfenster\s*09:00 – 17:00 Uhr/);
  assert.doesNotMatch(juDetails, /Lieferzeitraum|Liefertermin/);

  await ohneEinkaufsspur(page, "Angebotsliste");
  assert.ok(await querUeberlauf(page) <= 0, "Angebote: horizontaler Überlauf");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — TG22 mit Absicherung: eine Preisprojektion auf Kopf, Sticky, Aufstellung und ausgewähltem Angebot", async () => {
  const { page, fehler } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, { betrag: 28.24 });
  await zuDenAngeboten(page);
  await waehle(page, TG22());

  // Schritt 1, ohne Absicherung: „Gesamt 15,33 netto / 18,24 brutto" — überall derselbe Stand.
  let f = await preisflaechen(page);
  assert.deepEqual(f.auswahl, { label: "Gesamt", brutto: "18,24 € brutto", netto: "15,33 € netto" });
  assert.deepEqual(f.kopf, { label: "Gesamt", brutto: "18,24 € brutto", netto: "15,33 € netto" });
  assert.deepEqual(f.sticky, f.kopf, "die Sticky-Leiste weicht vom Kopf ab");

  // Zustellung, Abholung, Label — dieselben Worte wie auf der Karte.
  assert.equal(await inhalt(page.locator(".offsum-fact dt").first()), "Voraussichtliche Laufzeit");
  assert.equal(await inhalt(page.locator(".offsum-fact dd").first()), "1–2 Tage");
  assert.equal(await inhalt(page.locator(".blsum-delivery .blsum-label")), "Voraussichtliche Laufzeit");
  assert.equal(await inhalt(page.locator(".bsum-delivery-label")), "Voraussichtliche Laufzeit");
  assert.match(await inhalt(page.locator(".offsum-facts")), new RegExp(`Abholung\\s*${deDatum(ABHOLTAG)} · bereit ab 09:00 Uhr`));
  assert.match(await inhalt(page.locator(".blsum-handover")), /bereit ab 09:00 Uhr/);
  assert.equal(await page.locator(".pw-slider").count(), 0, "ein Angebot mit „bereit ab“ bekam einen Fensterregler");
  assert.equal(await page.locator("#booking-labelformat-toggle").count(), 0);
  assert.equal(await inhalt(page.locator("#booking-label-delivery-info")), "Versandlabel verfügbar als DIN A4 und Thermodruck");
  assert.match(await inhalt(page.locator(".offsum-service")), /Standardversand/);
  assert.ok(await querUeberlauf(page) <= 0, "Schritt 1: horizontaler Überlauf");

  // Schritt 2 mit Absicherung: 15,33 / 2,91 / 18,24 / 10,00 / 25,33 / 28,24.
  await zuSchritt2(page);
  await absichern(page);
  await warteAufText(page, ".blsum-price-gross", "28,24");
  f = await preisflaechen(page);
  assert.deepEqual(f.kopf, { label: "Gesamt", brutto: "28,24 € brutto", netto: "25,33 € netto" });
  assert.deepEqual(f.sticky, f.kopf, "die Sticky-Leiste weicht vom Kopf ab");
  const aufstellung = await inhalt(page.locator(".booking-confirm-box"));
  assert.match(aufstellung, /Versand netto\s*15,33 €/);
  assert.match(aufstellung, /MwSt\. 19 %\s*2,91 €/);
  assert.match(aufstellung, /Zusätzliche Transportabsicherung\s*steuerfrei\s*10,00 €/);
  assert.match(aufstellung, /Gesamtbetrag brutto\s*28,24 €/);
  assert.ok(await querUeberlauf(page) <= 0, "Schritt 2: horizontaler Überlauf");

  // Zurück in Schritt 1: das ausgewählte Angebot zeigt DENSELBEN Gesamtbetrag wie Kopf und Sticky.
  await zuSchritt1(page);
  f = await preisflaechen(page);
  assert.deepEqual(f.auswahl, { label: "Gesamt", brutto: "28,24 € brutto", netto: "25,33 € netto" });
  assert.deepEqual(f.kopf, f.auswahl);
  assert.deepEqual(f.sticky, f.auswahl);
  assert.equal(await inhalt(page.locator(".offsum-price-vat")), "inkl. 19 % MwSt. auf Versand");

  // Buchung: der Erfolgsbetrag kommt vom Server.
  await zuSchritt2(page);
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(protokoll.book.length, 1);
  assert.equal(protokoll.book[0].confirmedTotalGross, 28.24);
  assert.equal(protokoll.book[0].insuranceSelection.type, "transit_cover");
  assert.match(await inhalt(page.locator("body")), /Gesamtbetrag brutto\s*28,24 €/);
  await ohneEinkaufsspur(page, "Erfolg");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — TG22 mit Warenwert ≤ 50 €: Grundabsicherung ohne Neubepreisung, Preis unverändert", async () => {
  const { page, fehler } = await neueSeite();
  const protokoll = neuesProtokoll();
  // TG22 Residential: die Aussage zur Grundabsicherung kommt mit der Bindung der Lieferadresse.
  const tarif = TG22();
  await setupRoutes(page, protokoll, { tarife: [tarif], betrag: 18.24,
    nachBindung: { insuranceAvailable: false, insuranceDetails: COVER_GRUNDABSICHERUNG } });
  await zuDenAngeboten(page, { ...STANDARD_SENDUNGSANGABEN, declaredGoodsValue: "50" });
  await waehle(page, tarif);
  await zuSchritt2(page);
  await page.locator("#ins-cover-notice").waitFor({ timeout: 10000 });
  assert.match(await inhalt(page.locator("#ins-cover-notice")), /Grundabsicherung/);
  assert.equal(await page.locator(".ins-cards").count(), 0, "bei Grundabsicherung erscheint eine kaufbare Absicherung");
  const f = await preisflaechen(page);
  assert.deepEqual(f.kopf, { label: "Gesamt", brutto: "18,24 € brutto", netto: "15,33 € netto" });
  assert.deepEqual(f.sticky, f.kopf);
  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(protokoll.reprice.length, 0, "bei Grundabsicherung wurde neu bepreist");
  assert.deepEqual(protokoll.book[0].insuranceSelection, { type: "none" });
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — TG-Preisänderung: geschlossen bleibt gesperrt; übernommen aktualisiert alle Flächen und die Angebotsliste", async () => {
  const { page, fehler } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, {
    tarife: [TG22_KLASSISCH(), VERGLEICH()],
    reprice: (body, zustand) => {
      if (!body.acceptPriceChange) return null;
      if (body.acceptPriceChange.expectedTotalGross !== STAND[1].gesamt) return null;
      zustand.stand = 1;
      return { json: COVER_OK(body, 1) };
    },
    book: (body, n) => (n === 1
      ? { status: 409, json: { error: "Der Preis hat sich geändert.", code: "PRICE_CHANGED", price: STAND[1].gesamt } }
      : null),
    betrag: 20.24,
  });
  await zuDenAngeboten(page);
  await waehle(page, TG22_KLASSISCH());
  await zuSchritt2(page);
  await absichern(page);
  await bestaetigen(page);
  await buchenKnopf(page).click();

  // Der Dialog nennt beide Gesamtbeträge.
  const dialog = page.locator(".price-drift-card");
  await dialog.waitFor({ timeout: 10000 });
  const dialogText = await inhalt(dialog);
  assert.match(dialogText, /28,24 €/);
  assert.match(dialogText, /30,24 €/);
  assert.equal(protokoll.book.length, 1);

  // Escape: nur die Anzeige schließt — der alte Preis wird NICHT wieder buchbar.
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: 5000 });
  await page.locator("#booking-price-change-pending").waitFor({ timeout: 5000 });
  assert.equal(await buchenKnopf(page).count(), 0, "nach Escape ist der alte Preis wieder buchbar");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "booking-price-change-review");
  let f = await preisflaechen(page);
  assert.deepEqual(f.kopf, { label: "Preis geändert", brutto: "— brutto", netto: null });
  assert.deepEqual(f.sticky, f.kopf);
  assert.equal(await page.locator("#booking-price-changed-state").count(), 1);
  assert.doesNotMatch(await inhalt(page.locator(".booking-confirm-box")), /28,24|18,24|15,33/,
    "die Aufstellung nennt den alten Preis weiter");
  await kurz(400);
  assert.equal(protokoll.book.length, 1, "es wurde still erneut gebucht");

  // Erneut öffnen und übernehmen — ohne Neuladen.
  await page.evaluate(() => { window.__ohneNeuladen = true; });
  await page.locator("#booking-price-change-review").click();
  await dialog.waitFor({ timeout: 5000 });
  await page.locator("#price-drift-accept").click();
  await dialog.waitFor({ state: "detached", timeout: 10000 });
  await page.locator("#price-change-accepted").waitFor({ timeout: 10000 });
  assert.deepEqual(protokoll.reprice.at(-1).acceptPriceChange, { expectedTotalGross: 30.24 });
  assert.equal(await page.evaluate(() => window.__ohneNeuladen), true, "die Seite wurde neu geladen");
  assert.equal(page.url(), `${BASE}/booking`);
  assert.equal(protokoll.book.length, 1, "die Übernahme hat gebucht");
  await warteAufText(page, ".blsum-price-gross", "30,24");
  f = await preisflaechen(page);
  assert.deepEqual(f.kopf, { label: "Gesamt", brutto: "30,24 € brutto", netto: "27,01 € netto" });
  assert.deepEqual(f.sticky, f.kopf);
  const aufstellung = await inhalt(page.locator(".booking-confirm-box"));
  assert.match(aufstellung, /Versand netto\s*17,01 €/);
  assert.match(aufstellung, /MwSt\. 19 %\s*3,23 €/);
  assert.match(aufstellung, /Gesamtbetrag brutto\s*30,24 €/);
  assert.ok(await buchenKnopf(page).isVisible(), "nach der Übernahme fehlt der Bestellknopf");

  // Schritt 1: das ausgewählte Angebot zeigt den neuen Stand.
  await zuSchritt1(page);
  f = await preisflaechen(page);
  assert.deepEqual(f.auswahl, { label: "Gesamt", brutto: "30,24 € brutto", netto: "27,01 € netto" });

  // Ohne Absicherung gilt der NEUE Versandpreis — nicht der alte des Angebots.
  await zuSchritt2(page);
  await page.locator(`.ins-card:has(input[value="none"]) .ins-card-name`).click();
  await warteAufText(page, ".blsum-price-gross", "20,24");
  f = await preisflaechen(page);
  assert.deepEqual(f.kopf, { label: "Gesamt", brutto: "20,24 € brutto", netto: "17,01 € netto" });

  // Zurück zum Angebotsvergleich: die Karte trägt den übernommenen Versandpreis.
  const berechnungen = protokoll.calc.length;
  await zuSchritt1(page);
  await page.getByRole("button", { name: "← Zurück", exact: true }).click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  const karte = await inhalt(karteVon(page, TG22()));
  assert.equal(protokoll.calc.length, berechnungen, "der Rückweg hat neu berechnet");
  assert.match(karte, /17,01 €/, `die Angebotsliste zeigt den übernommenen Preis nicht: ${karte}`);
  assert.doesNotMatch(karte, /15,33 €/, "die Angebotsliste zeigt den alten Preis");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — Vergleichsangebot versichert + Drift ohne Neubindung: nur „Angebote neu berechnen“", async () => {
  const { page, fehler } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, {
    book: () => ({ status: 409, json: {
      code: "PRICE_CHANGED", recalculationRequired: true, price: 21.3,
      error: "Der Preis für dieses Angebot hat sich geändert. Bitte berechnen Sie die Angebote neu.",
    } }),
  });
  await zuDenAngeboten(page);
  await waehle(page, VERGLEICH());

  // Zustellung mit den Daten des Angebots, Abholfenster mit Regler.
  const zeitraum = `${deDatum(ZUSTELL_MIN)} – ${deDatum(ZUSTELL_MAX)}`;
  assert.equal(await inhalt(page.locator(".offsum-fact dt").first()), "Zustellung");
  assert.equal(await inhalt(page.locator(".offsum-fact dd").first()), `${zeitraum} · bis 18:00 Uhr`);
  assert.equal(await inhalt(page.locator(".blsum-delivery .blsum-label")), "Zustellung");
  assert.equal(await inhalt(page.locator(".blsum-delivery .blsum-val")), zeitraum);
  assert.equal(await inhalt(page.locator(".bsum-delivery-label")), "Zustellung");
  await page.locator(".pw-slider").waitFor({ timeout: 10000 });
  assert.match(await inhalt(page.locator(".offsum-facts")), /Abholung\s*\d{2}\.\d{2}\.\d{4} · \d{2}:\d{2}–\d{2}:\d{2} Uhr/);

  // Versichert: Gesamt 19,84 / 17,39 netto aus der Serverantwort.
  await zuSchritt2(page);
  await page.locator(`.ins-card:has(input[value="standard"]) .ins-card-name`).click();
  await warteAufText(page, ".blsum-price-gross", "19,84");
  let f = await preisflaechen(page);
  assert.deepEqual(f.kopf, { label: "Gesamt", brutto: "19,84 € brutto", netto: "17,39 € netto" });
  assert.deepEqual(f.sticky, f.kopf);

  await bestaetigen(page);
  await buchenKnopf(page).click();
  const dialog = page.locator(".price-drift-card");
  await dialog.waitFor({ timeout: 10000 });
  assert.equal(await page.locator("#price-drift-accept").count(), 0, "eine Drift ohne Neubindung bietet eine Bestätigung an");
  assert.match(await inhalt(dialog), /nicht mehr aktuell/);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: 5000 });
  const hinweis = page.locator("#booking-price-change-pending");
  await hinweis.waitFor({ timeout: 5000 });
  assert.equal(await page.locator("#booking-price-change-review").count(), 0);
  assert.equal(await buchenKnopf(page).count(), 0);
  f = await preisflaechen(page);
  assert.equal(f.kopf.label, "Preis geändert");
  assert.equal(protokoll.book.length, 1);

  // Neu berechnen: die alten Angebote sind verworfen, das Formular bleibt.
  await page.locator("#booking-price-change-recalculate").click();
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await kurz(600);
  // Das Dashboard übernimmt `?page=new` in seinen Zustand — geprüft wird die Seite, nicht die Query.
  assert.match(page.url(), /\/dashboard/);
  assert.equal(await page.locator(".offer-card").count(), 0, "die alten Angebote stehen wieder da");
  assert.equal(await page.locator("#ns-declaredGoodsValue").inputValue(), "250", "das Formular ging verloren");
  assert.equal(protokoll.book.length, 1, "es wurde erneut gebucht");
  await ohneEinkaufsspur(page, "Neuberechnung");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F — Vergleichsangebot ohne Absicherung + Drift: Hintergrund schließt, der alte Preis bleibt gesperrt", async () => {
  const { page, fehler } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, {
    book: () => ({ status: 409, json: {
      code: "PRICE_CHANGED", recalculationRequired: true, price: 16.1,
      error: "Der Preis für dieses Angebot hat sich geändert. Bitte berechnen Sie die Angebote neu.",
    } }),
  });
  await zuDenAngeboten(page);
  await waehle(page, VERGLEICH());
  await zuSchritt2(page);
  let f = await preisflaechen(page);
  assert.deepEqual(f.kopf, { label: "Gesamt", brutto: "15,35 € brutto", netto: "12,90 € netto" });
  await bestaetigen(page);
  await buchenKnopf(page).click();
  const dialog = page.locator(".price-drift-card");
  await dialog.waitFor({ timeout: 10000 });
  assert.equal(await page.locator("#price-drift-accept").count(), 0);
  await page.locator(".price-drift-overlay").click({ position: { x: 5, y: 5 } });
  await dialog.waitFor({ state: "detached", timeout: 5000 });
  await page.locator("#booking-price-change-pending").waitFor({ timeout: 5000 });
  assert.equal(await buchenKnopf(page).count(), 0, "der Hintergrund hat den alten Preis wieder freigegeben");
  f = await preisflaechen(page);
  assert.deepEqual(f.kopf, { label: "Preis geändert", brutto: "— brutto", netto: null });
  assert.deepEqual(f.sticky, f.kopf);
  assert.equal(await page.locator("#booking-price-changed-state").count(), 1);
  assert.match(await inhalt(page.locator(".booking-confirm-box")), /Versand netto\s*—/);
  await kurz(500);
  assert.equal(protokoll.book.length, 1, "es wurde still erneut gebucht");
  assert.deepEqual(fehler, []);
  await page.close();
});

for (const [name, viewport] of [["Tablet 834", { width: 834, height: 1112 }], ["Mobil 390", { width: 390, height: 844 }]]) {
  test(`G — ${name}: Angebote, Buchung, Dialog und Hinweis ohne Überlauf; Preislabels sichtbar`, async () => {
    const { page, fehler } = await neueSeite(viewport);
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll, {
      tarife: [TG22_KLASSISCH(), VERGLEICH()],
      book: () => ({ status: 409, json: { error: "Der Preis hat sich geändert.", code: "PRICE_CHANGED", price: STAND[1].gesamt } }),
    });
    await zuDenAngeboten(page);
    assert.ok(await querUeberlauf(page) <= 0, "Angebote: horizontaler Überlauf");
    await waehle(page, TG22_KLASSISCH());
    assert.ok(await querUeberlauf(page) <= 0, "Schritt 1: horizontaler Überlauf");
    assert.ok(await page.locator(".offsum-price-label").isVisible(), "das Preislabel des ausgewählten Angebots fehlt");
    await zuSchritt2(page);
    await absichern(page);
    await warteAufText(page, ".blsum-price-gross", "28,24");
    assert.ok(await querUeberlauf(page) <= 0, "Schritt 2: horizontaler Überlauf");

    // Sticky-Leiste eingeblendet: das Preislabel steht im Sichtbereich. Der Layer selbst nimmt
    // keinen Platz im Fluss ein — gewartet wird deshalb auf den eingeblendeten Zustand und das Label.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForSelector(".booking-sticky-layer.is-stuck", { state: "attached", timeout: 10000 });
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".booking-sticky-layer")).opacity === "1",
      null, { timeout: 5000 });
    await page.locator(".bsum-price-label").waitFor({ state: "visible", timeout: 5000 });
    const label = await page.locator(".bsum-price-label").boundingBox();
    assert.ok(label && label.width > 0 && label.x >= 0 && label.x + label.width <= viewport.width,
      `das Sticky-Preislabel liegt außerhalb des Sichtbereichs: ${JSON.stringify(label)}`);
    assert.equal(await inhalt(page.locator(".bsum-price-label")), "Gesamt");
    assert.ok(await querUeberlauf(page) <= 0, "Sticky: horizontaler Überlauf");

    await bestaetigen(page);
    await buchenKnopf(page).click();
    await page.locator(".price-drift-card").waitFor({ timeout: 10000 });
    assert.ok(await querUeberlauf(page) <= 0, "Dialog: horizontaler Überlauf");
    await page.keyboard.press("Escape");
    await page.locator("#booking-price-change-pending").waitFor({ timeout: 5000 });
    assert.ok(await querUeberlauf(page) <= 0, "Hinweis: horizontaler Überlauf");
    const knopf = await page.locator("#booking-price-change-review").boundingBox();
    assert.ok(knopf && knopf.height >= 40, `„Preisänderung ansehen“ ist zu klein: ${JSON.stringify(knopf)}`);
    assert.equal(await inhalt(page.locator(".blsum-price-label")), "Preis geändert");
    assert.deepEqual(fehler, []);
    await page.close();
  });
}
