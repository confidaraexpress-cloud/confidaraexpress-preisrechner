// E2E: Netto/Brutto-Anzeigevertrag (Betreiberentscheidung 2026-10-02). Echter Dev-Server, echter Browser,
// gemocktes Backend (Art der Lieferadresse über helpers/residentialPriceInputs.mjs).
//
// Der Vertrag: jede ECHTE neue Preisberechnung startet in Netto; der Umschalter ist reine Anzeige — kein Request,
// kein anderes Angebot, keine andere Revision, Bindung, Option oder /book-Nutzlast. In der Nettoanzeige steht netto
// vorn und der zahlbare Bruttobetrag bleibt erkennbar, in der Bruttoanzeige umgekehrt. Angezeigt werden
// ausschließlich Serverbeträge; der gebuchte Betrag der Erfolgsseite bleibt `booking.amount`.
//
// Gemessen wird, was eine Quelltextprüfung nicht erreicht:
//   N1  Neue Berechnung: Karte netto vorn, darunter der zahlbare Bruttobetrag; Details heben netto hervor
//   N2  Umschalten in der Liste: kein Request; Karte, Details und Zuschlagszeile wechseln gemeinsam
//   N3  Brutto + unveränderte Eingaben + „Angebote vergleichen“: kein Request — brutto bleibt
//   N4  Brutto + geänderte Eingabe + „Angebote vergleichen“: genau ein Request — wieder netto
//   N5  Versandkostenrechner: N1, N3 und N4 identisch
//   N6  Buchung netto ohne Absicherung: Live-Leiste, Sticky-Leiste, ausgewähltes Angebot, Aufstellung mit dem
//       Gesamtbetrag netto vor dem zahlbaren Gesamtbetrag brutto, Erfolg mit beiden
//   N7  Dieselbe Buchung mit Umschalten auf jeder Fläche: kein Request, identischer /book-Körper, Erfolg brutto
//   N8  Rückweg: der auf der Buchungsseite gewählte Modus gilt im Vergleich — ohne Neuberechnung
//   N9  Steuerfreie Absicherung: Gesamtbetrag netto = customerTotalNet, Absicherung steuerfrei, Umschalten
//       bepreist nicht neu; ohne customerTotalNet keine Nettozeile und kein erfundener Betrag
//   N10 Privatadresse + Abholung heute: Zuschlagskarten im Modus, Zuschlagshinweise unverändert brutto, keine
//       Options- oder Bindungsanfrage durch das Umschalten
//   N11 Fehlender Betrag: „—“ statt eines anderen Betrags; ein abweichender gebuchter Betrag steht allein
//   N12 390 px: Umschalter und beide Beträge sichtbar, innerhalb der Fläche, ohne Überlauf
//
// Kein echtes Backend, keine Bestellung, kein Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_PAKET, STANDARD_SENDUNGSANGABEN } from "./helpers/newShipmentForm.mjs";
import {
  LIEFERADRESSE_ID, lieferadressZustand, mockeLieferadresse, waehleLieferadresse,
} from "./helpers/residentialPriceInputs.mjs";

const PORT = 5444, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 4996;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// Berliner Geschäftstag — ausschließlich als FIXTUREWERT des gemockten Servers.
const berlin = (ms) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(ms));
const HEUTE = berlin(Date.now());
const MORGEN = berlin(Date.now() + 36 * 60 * 60 * 1000);
const kennung = (kopf, fuss) => `${kopf}${fuss.padStart(32 - kopf.length, "0")}`;

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10996",
};

const WARENWERT = Number(STANDARD_SENDUNGSANGABEN.declaredGoodsValue);
const COVER_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
  coverValueSource: "goods_value", coverState: "available", coverValue: WARENWERT,
  basicCoverMaxGoodsValue: 50, maxCoverValue: 2500,
};

/* Ein buchbares Angebot mit zusätzlicher Transportabsicherung. Serverbeträge 10,80 / 2,05 / 12,85 (nie gerechnet). */
const JM = {
  id: 11, shipper_tariff_id: 3307, offerId: kennung("vat", "11"),
  publicCarrierId: "dhl", publicCarrierName: "DHL Express", publicServiceName: "Standardversand",
  serviceType: "pickup", currency: "EUR", netPrice: 10.8, vatAmount: 2.05, finalPrice: 12.85,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage", availableForDate: true, bookable: true,
  pickupDate: `${MORGEN}T00:00:00Z`, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  trackingAvailable: true, printerRequired: false, requiredPriceInputs: [],
  insuranceAvailable: true, insuranceDetails: COVER_DETAILS,
};

/* Ein Angebot, dessen Bruttobetrag fehlt: die Anzeige darf ihn weder erfinden noch durch netto ersetzen. */
const OHNE_BRUTTO = {
  ...JM, id: 12, shipper_tariff_id: 3308, offerId: kennung("vat", "12"), publicServiceName: "Expressversand",
  netPrice: 9.99, vatAmount: null, finalPrice: null, bookable: false, unavailableReason: "quote_only",
  insuranceAvailable: false, insuranceDetails: null,
};

// TG22 mit Abholung heute und offener Art der Lieferadresse (Fixturewerte wie tg22SameDayCollection):
//   B   ohne Zuschlag               12,34 / 2,34 / 14,68
//   S   Abholung heute              15,36 / 2,92 / 18,28   Zuschlag S − B   3,02 / 0,58 / 3,60
//   PS  heute + Privatadresse       18,54 / 3,52 / 22,06   Zuschlag PS − S  3,18 / 0,60 / 3,78
const B = { net: 12.34, vat: 2.34, gross: 14.68 };
const S = { net: 15.36, vat: 2.92, gross: 18.28 };
const PS = { net: 18.54, vat: 3.52, gross: 22.06 };
const SD = { net: 3.02, vat: 0.58, gross: 3.6 };
const RES = { net: 3.18, vat: 0.6, gross: 3.78 };
const TG = {
  offerId: kennung("vat22", "22"), publicCarrierId: "ups", publicServiceName: "Standardversand",
  serviceType: "pickup", collectionDate: HEUTE, collectionReadyFrom: "11:30",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  netPrice: S.net, vatAmount: S.vat, finalPrice: S.gross, currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: false, insuranceDetails: null, trackingAvailable: true, printerRequired: false, tariffLimits: [],
  pickupToday: true, pickupTodayUntil: "16:45", sameDaySurchargeNet: SD.net, sameDaySurchargeGross: SD.gross,
};

// Steuerfreie Absicherung 10,00 € — Totals und Bestandteile des Servers. `customerTotalNet` ist DER Nettobetrag;
// ohne ihn (ältere Antwort) gibt es keinen.
const VERSAND_ZEILE = { type: "shipping_base", taxable: true, net: 10.8, vat: 2.05, gross: 12.85 };
const ABSICHERUNG_ZEILE = { type: "transport_insurance", taxable: false, net: 10, vat: 0, gross: 10 };
const absicherung = (body, { mitNetto = true } = {}) => ({
  selectedInsurance: "transit_cover",
  insurance: { coverValue: body.coverValue, excessValue: 20, goodsAreNew: body.goodsAreNew,
               goodsAreFragile: body.goodsAreFragile, insuranceGross: 10 },
  totals: { customerShippingNet: 10.8, shippingVat: 2.05, customerShippingGross: 12.85, insuranceGross: 10,
            ...(mitNetto ? { customerTotalNet: 20.8 } : {}), customerTotalGross: 22.85 },
  tariff: { insuranceAvailable: true, insuranceDetails: COVER_DETAILS },
  components: [VERSAND_ZEILE, ABSICHERUNG_ZEILE],
});

const buchungsAntwort = (betrag) => ({
  message: "Sendung gebucht", ceShipmentId: CE_ID, invoiceNumber: "CE-RE26-00996",
  businessOrderNumber: "CE-BS26-00996", dueDate: null, amount: betrag, billingMode: "single",
  testBooking: false, voucherCode: null, deliveryNote: null,
  orderConfirmation: { number: "CE-AB26-00996", issuedAt: `${HEUTE}T10:00:00Z` }, shippingDocuments: [],
});

let server, browser;

/* Szenario: `tariffs`, `reprice(body)`, `betrag(body)`. Jeder Request an das Backend landet in `p.api` — außer der
   Benachrichtigungsabfrage, die zeitgesteuert läuft und mit der Anzeige nichts zu tun hat. */
async function setup(page, szenario = {}) {
  const p = { api: [], calc: [], reprice: [], book: [], anfragen: [] };
  const lz = lieferadressZustand({
    offerId: TG.offerId, geschaeft: S, privat: PS, zuschlag: RES,
    sameDay: { basis: B, zuschlag: SD, block: { pickupTodayUntil: "16:45", collectionDate: HEUTE, collectionReadyFrom: "11:45" } },
  });
  p.lz = lz;
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname === "api.confidaraexpress.de" && !u.pathname.includes("/kunde/notifications")) {
      p.api.push(`${r.method()} ${u.pathname}`);
    }
  });
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (pfad.includes("/api/shipping/launch-scope")) return json({ countries: ["DE"], partialCountries: [] });
    if (pfad.includes("/api/jumingo/calculate-price")) {
      p.calc.push(req.postDataJSON());
      return json({
        ceShipmentId: CE_ID, tariffs: szenario.tariffs || [JM], availableShippingModes: ["standard", "express"],
        publicCarriers: [{ id: "dhl", name: "DHL Express" }, { id: "ups", name: "UPS" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
    }
    if (pfad.includes("/api/insurance/reprice")) {
      const body = req.postDataJSON();
      p.reprice.push(body);
      return json(szenario.reprice ? szenario.reprice(body) : absicherung(body));
    }
    if (pfad.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: `${MORGEN}T09:00:00Z`, availableUntil: `${MORGEN}T17:00:00Z`,
      minimumMinutes: 120, adjustable: true,
    });
    if (pfad.includes("/api/jumingo/book")) {
      const body = req.postDataJSON();
      p.book.push(body);
      const versichert = !!body.insuranceSelection && body.insuranceSelection.type === "transit_cover";
      return json(buchungsAntwort(szenario.betrag ? szenario.betrag(body) : versichert ? 22.85 : 12.85));
    }
    return json({});
  });
  // NACH dem Sammel-Mock: Playwright prüft Routen in umgekehrter Reihenfolge.
  await mockeLieferadresse(page, lz, p.anfragen);
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const inhalt = async (loc) => norm(await loc.first().textContent());
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const querUeberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const buchenKnopf = (page) => page.getByRole("button", { name: /Kostenpflichtig buchen/ });
const umschalter = (page, name) => page.getByRole("button", { name, exact: true });
const NETTO = "exkl. MwSt.", BRUTTO = "inkl. MwSt.";

async function gedrueckt(page, name) {
  return (await umschalter(page, name).first().getAttribute("aria-pressed")) === "true";
}

/* Steht `a` im Dokument vor `b`? Beide müssen existieren. */
function steht(page, a, b) {
  return page.evaluate(([x, y]) => {
    const ea = document.querySelector(x), eb = document.querySelector(y);
    return !!ea && !!eb && !!(ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING);
  }, [a, b]);
}

/* Der Umschalter ist reine Anzeige: nach dem Klick entsteht KEIN Request — auch kein entprellter. */
async function schalte(page, p, name, wo) {
  const vorher = p.api.length;
  await umschalter(page, name).first().click();
  await kurz(900);
  assert.deepEqual(p.api.slice(vorher), [], `${wo}: „${name}“ hat einen Request ausgelöst`);
  assert.equal(await gedrueckt(page, name), true, `${wo}: „${name}“ ist nicht gewählt`);
}

async function warteBis(pruefe, wo, timeout = 10000) {
  const ende = Date.now() + timeout;
  for (;;) {
    if (await pruefe()) return;
    if (Date.now() > ende) throw new Error(`Zeitlimit: ${wo}`);
    await kurz(100);
  }
}

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

async function absichern(page) {
  await page.locator(`.ins-card:has(input[value="transit_cover"]) .ins-card-name`).click();
  await page.locator("#ins-goodsAreNew-ja").check();
  await page.locator("#ins-goodsAreFragile-nein").check();
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
}

async function bucheUndWarte(page, p) {
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut
  await checks.nth(0).check();
  await checks.nth(1).check();
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(p.book.length, 1, "es wurde nicht genau einmal gebucht");
  return p.book[0];
}

/* Die drei Preisflächen der Buchungsseite, wie der Kunde sie liest. */
async function flaechen(page) {
  const lese = async (s) => ((await page.locator(s).count()) ? inhalt(page.locator(s)) : null);
  return {
    kopf: { netto: await lese(".blsum-price-net"), brutto: await lese(".blsum-price-gross"),
            nettoVorn: (await page.locator(".blsum-price-box--net").count()) === 1 },
    sticky: { netto: await lese(".bsum-price-net"), brutto: await lese(".bsum-price-gross"),
              nettoVorn: (await page.locator(".bsum-price--net").count()) === 1 },
    auswahl: { netto: await lese(".offsum-price-net"), brutto: await lese(".offsum-price-gross"),
               bruttoVorn: (await page.locator(".offsum-price--gross").count()) === 1 },
  };
}

async function beleg(page, name) {
  const ordner = path.join(process.cwd(), "tests", "e2e", "screenshots");
  mkdirSync(ordner, { recursive: true });
  await page.screenshot({ path: path.join(ordner, `vat-${name}.png`), fullPage: false });
}

/* Ein Element liegt seitlich vollständig in seiner Fläche — nichts ragt über den Rand. */
async function liegtInnerhalb(aussen, innen, wo) {
  const a = await aussen.boundingBox();
  const i = await innen.boundingBox();
  assert.ok(a && i, `${wo}: Element fehlt`);
  assert.ok(i.x >= a.x - 1 && i.x + i.width <= a.x + a.width + 1,
    `${wo}: ragt aus der Fläche (${Math.round(i.x)}..${Math.round(i.x + i.width)} statt ${Math.round(a.x)}..${Math.round(a.x + a.width)})`);
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

test("N1 — neue Berechnung: Karte netto vorn, darunter der zahlbare Bruttobetrag; Details heben netto hervor", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  assert.equal(p.calc.length, 1);
  assert.equal(await gedrueckt(page, NETTO), true, "eine neue Berechnung startet nicht in Netto");
  assert.equal(await gedrueckt(page, BRUTTO), false);

  const karte = karteVon(page, JM);
  assert.equal(await inhalt(karte.locator(".offer-price")), "10,80 €");
  assert.equal(await inhalt(karte.locator(".offer-price-sub")), "exkl. MwSt.");
  assert.equal(await inhalt(karte.locator(".offer-price-alt")), "12,85 € inkl. MwSt.", "der zahlbare Bruttobetrag fehlt");

  await karte.locator("button.offer-details-link").click();
  const details = page.locator(`#offer-details-${JM.offerId}`);
  await details.waitFor({ timeout: 10000 });
  assert.equal(await inhalt(details.locator(".offer-detail-row--strong .offer-detail-label")), "Netto");
  assert.equal(await details.locator(".offer-detail-row--strong").count(), 1);
  await beleg(page, "liste-netto");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N2 — Umschalten in der Liste: kein Request; Karte, Details und Zuschlagszeile wechseln gemeinsam", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: [JM, TG] });
  await zuDenAngeboten(page);
  const jm = karteVon(page, JM), tg = karteVon(page, TG);
  const reihenfolge = async () => page.locator(".offer-card button.offer-details-link").evaluateAll(
    (knoepfe) => knoepfe.map((k) => k.getAttribute("aria-controls")));
  const vorher = await reihenfolge();
  await jm.locator("button.offer-details-link").click();
  const details = page.locator(`#offer-details-${JM.offerId}`);
  await details.waitFor({ timeout: 10000 });
  assert.equal(await inhalt(tg.locator(".offer-sameday-surcharge")), "Zuschlag für Abholung am selben Tag: +3,02 €");

  await schalte(page, p, BRUTTO, "Liste");
  assert.equal(await inhalt(jm.locator(".offer-price")), "12,85 €");
  assert.equal(await inhalt(jm.locator(".offer-price-sub")), "inkl. MwSt.");
  assert.equal(await inhalt(jm.locator(".offer-price-alt")), "10,80 € exkl. MwSt.");
  assert.equal(await inhalt(details.locator(".offer-detail-row--strong .offer-detail-label")), "Brutto");
  assert.equal(await inhalt(tg.locator(".offer-price")), "18,28 €");
  assert.equal(await inhalt(tg.locator(".offer-price-alt")), "15,36 € exkl. MwSt.");
  assert.equal(await inhalt(tg.locator(".offer-sameday-surcharge")), "Zuschlag für Abholung am selben Tag: +3,60 €");
  assert.deepEqual(await reihenfolge(), vorher, "das Umschalten hat die Liste umsortiert");
  await beleg(page, "liste-brutto");

  await schalte(page, p, NETTO, "Liste");
  assert.equal(await inhalt(jm.locator(".offer-price")), "10,80 €");
  assert.equal(await inhalt(jm.locator(".offer-price-alt")), "12,85 € inkl. MwSt.");
  assert.equal(await inhalt(details.locator(".offer-detail-row--strong .offer-detail-label")), "Netto");
  assert.equal(p.calc.length, 1, "das Umschalten hat neu berechnet");
  assert.equal(p.anfragen.length, 0, "das Umschalten hat eine Zuschlagsanfrage ausgelöst");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N3 — Brutto + unveränderte Eingaben + „Angebote vergleichen“: kein Request — brutto bleibt", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  await schalte(page, p, BRUTTO, "Liste");
  const vorher = p.api.length;
  await page.locator(".offers-calc-cta button").first().click();
  await kurz(1200);
  assert.deepEqual(p.api.slice(vorher), [], "das Einblenden hat einen Request ausgelöst");
  assert.equal(p.calc.length, 1);
  assert.equal(await gedrueckt(page, BRUTTO), true, "das Einblenden hat die Wahl des Kunden verworfen");
  assert.equal(await inhalt(karteVon(page, JM).locator(".offer-price")), "12,85 €");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N4 — Brutto + geänderte Eingabe + „Angebote vergleichen“: genau ein Request — wieder netto", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  await schalte(page, p, BRUTTO, "Liste");
  await page.fill("#ns-weight", "6");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 0, null, { timeout: 10000 });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(p.calc.length, 2, "die geänderte Sendung wurde nicht neu berechnet");
  assert.equal(await gedrueckt(page, NETTO), true, "eine echte Neuberechnung startet nicht in Netto");
  assert.equal(await inhalt(karteVon(page, JM).locator(".offer-price")), "10,80 €");
  assert.equal(await inhalt(karteVon(page, JM).locator(".offer-price-alt")), "12,85 € inkl. MwSt.");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N5 — Versandkostenrechner: neue Berechnung netto, Einblenden behält brutto, Neuberechnung wieder netto", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await page.fill("#calc-from-zip", "70173");
  await page.fill("#calc-to-zip", "10115");
  await page.fill("#calc-from-city", "Stuttgart");
  await page.fill("#calc-to-city", "Berlin");
  await page.fill("#calc-weight", "2");
  await page.fill("#calc-packageCount", "1");
  await page.fill("#calc-length", "30");
  await page.fill("#calc-width", "20");
  await page.fill("#calc-height", "15");
  const cta = page.getByRole("button", { name: /Angebote vergleichen/i }).first();
  await cta.click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(p.calc.length, 1);
  const karte = karteVon(page, JM);
  assert.equal(await gedrueckt(page, NETTO), true, "der Rechner startet nicht in Netto");
  assert.equal(await inhalt(karte.locator(".offer-price")), "10,80 €");
  assert.equal(await inhalt(karte.locator(".offer-price-alt")), "12,85 € inkl. MwSt.");

  await schalte(page, p, BRUTTO, "Rechner");
  assert.equal(await inhalt(karte.locator(".offer-price")), "12,85 €");
  await cta.click();
  await kurz(1200);
  assert.equal(p.calc.length, 1, "der Rechner hat bei unveränderten Eingaben neu gerechnet");
  assert.equal(await gedrueckt(page, BRUTTO), true, "das Einblenden hat die Wahl des Kunden verworfen");

  await page.fill("#calc-weight", "3");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 0, null, { timeout: 10000 });
  await cta.click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(p.calc.length, 2);
  assert.equal(await gedrueckt(page, NETTO), true, "eine echte Neuberechnung im Rechner startet nicht in Netto");
  assert.equal(await inhalt(karteVon(page, JM).locator(".offer-price")), "10,80 €");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N6 — Buchung netto ohne Absicherung: Leisten, ausgewähltes Angebot, Aufstellung und Erfolg mit beiden Gesamtbeträgen", async () => {
  const { page, fehler } = await neueSeite({ width: 1440, height: 640 });
  const p = await setup(page);
  await zuDenAngeboten(page);
  await waehle(page, JM);

  assert.equal(await gedrueckt(page, NETTO), true, "die Buchungsseite übernimmt den Modus nicht");
  assert.equal(await inhalt(page.locator(".booking-vat-label")), "Preisanzeige");
  assert.equal(await inhalt(page.locator(".blsum-price-label")), "Gesamt");
  assert.deepEqual(await flaechen(page), {
    kopf: { netto: "10,80 € netto", brutto: "12,85 € brutto", nettoVorn: true },
    sticky: { netto: "10,80 € netto", brutto: "12,85 € brutto", nettoVorn: true },
    auswahl: { netto: "10,80 € netto", brutto: "12,85 € brutto", bruttoVorn: false },
  });
  assert.equal(await inhalt(page.locator(".blsum-price-payable")), "· zahlbar");
  assert.equal(await steht(page, ".blsum-price-net", ".blsum-price-gross"), true, "netto steht nicht vorn");
  assert.equal(await steht(page, ".bsum-price-net", ".bsum-price-gross"), true);
  assert.equal(await steht(page, ".offsum-price-net", ".offsum-price-gross"), true);
  await beleg(page, "buchung-netto");

  // Die Sticky-Leiste erscheint erst, wenn die große Leiste herausgescrollt ist — dann netto vorn. Der Layer selbst
  // nimmt keinen Platz im Fluss ein (wie tg22GoldenOfferContract): gewartet wird auf Zustand, Deckkraft und Betrag.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForSelector(".booking-sticky-layer.is-stuck", { state: "attached", timeout: 10000 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".booking-sticky-layer")).opacity === "1",
    null, { timeout: 5000 });
  await page.locator(".bsum-price-net").waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await page.locator(".bsum-price-net").isVisible(), true, "der Nettobetrag der Sticky-Leiste ist unsichtbar");
  assert.equal(await page.locator(".bsum-price-gross").isVisible(), true, "der Bruttobetrag der Sticky-Leiste ist unsichtbar");
  await beleg(page, "sticky-netto");
  await page.evaluate(() => window.scrollTo(0, 0));

  await zuSchritt2(page);
  const box = page.locator(".booking-confirm-box");
  assert.match(await inhalt(box.locator('[data-vat-total="net"]')), /^Gesamtbetrag netto\s*10,80 €$/);
  assert.match(await inhalt(box), /Gesamtbetrag brutto\s*12,85 €/);
  assert.equal(await steht(page, '.booking-confirm-box [data-vat-total="net"]', ".booking-confirm-box .booking-total-row:not([data-vat-total])"),
    true, "der Gesamtbetrag netto steht nicht vor dem zahlbaren Gesamtbetrag brutto");

  const body = await bucheUndWarte(page, p);
  assert.equal(body.offerId, JM.offerId);
  assert.doesNotMatch(JSON.stringify(body), /vatMode|netto|brutto/i, "/book trägt die Anzeigewahl");
  const recap = page.locator(".booking-success-recap");
  assert.match(await inhalt(recap.locator('[data-vat-total="net"]')), /^Gesamtbetrag netto\s*10,80 €$/);
  assert.match(await inhalt(recap), /Gesamtbetrag brutto\s*12,85 €/);
  assert.equal(await page.locator(".booking-vat-row").count(), 0, "der Erfolg trägt einen Umschalter");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N7 — dieselbe Buchung mit Umschalten auf jeder Fläche: kein Request, identischer /book-Körper, Erfolg brutto", async () => {
  // Bezugslauf ohne jedes Umschalten.
  const bezug = await neueSeite();
  const p0 = await setup(bezug.page);
  await zuDenAngeboten(bezug.page);
  await waehle(bezug.page, JM);
  await zuSchritt2(bezug.page);
  const ohne = await bucheUndWarte(bezug.page, p0);
  assert.deepEqual(bezug.fehler, []);
  await bezug.page.close();

  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  await schalte(page, p, BRUTTO, "Liste");
  await waehle(page, JM);
  assert.equal(await gedrueckt(page, BRUTTO), true, "die Buchungsseite übernimmt den Modus der Liste nicht");
  assert.deepEqual(await flaechen(page), {
    kopf: { netto: "10,80 € netto", brutto: "12,85 € brutto", nettoVorn: false },
    sticky: { netto: "10,80 € netto", brutto: "12,85 € brutto", nettoVorn: false },
    auswahl: { netto: "10,80 € netto", brutto: "12,85 € brutto", bruttoVorn: true },
  });
  assert.equal(await steht(page, ".blsum-price-gross", ".blsum-price-net"), true, "brutto steht nicht vorn");
  assert.equal(await steht(page, ".offsum-price-gross", ".offsum-price-net"), true);
  assert.equal(await page.locator(".blsum-price-payable").count(), 0);
  await beleg(page, "buchung-brutto");

  await schalte(page, p, NETTO, "Schritt 1");
  assert.equal((await flaechen(page)).kopf.nettoVorn, true);
  await schalte(page, p, BRUTTO, "Schritt 1");
  await zuSchritt2(page);
  assert.equal(await page.locator('.booking-confirm-box [data-vat-total="net"]').count(), 0, "brutto zeigt eine Nettozeile");
  assert.match(await inhalt(page.locator(".booking-confirm-box")), /Gesamtbetrag brutto\s*12,85 €/);
  await schalte(page, p, NETTO, "Schritt 2");
  assert.match(await inhalt(page.locator('.booking-confirm-box [data-vat-total="net"]')), /Gesamtbetrag netto\s*10,80 €/);
  await schalte(page, p, BRUTTO, "Schritt 2");
  assert.equal(p.calc.length, 1);
  assert.equal(p.reprice.length, 0, "das Umschalten hat neu bepreist");

  const mit = await bucheUndWarte(page, p);
  assert.deepEqual(mit, ohne, "das Umschalten hat den /book-Körper verändert");
  const recap = page.locator(".booking-success-recap");
  assert.equal(await recap.locator('[data-vat-total="net"]').count(), 0, "der Erfolg zeigt in Brutto eine Nettozeile");
  assert.match(await inhalt(recap), /Gesamtbetrag brutto\s*12,85 €/);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N8 — Rückweg: der auf der Buchungsseite gewählte Modus gilt im Vergleich — ohne Neuberechnung", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  await waehle(page, JM);
  await schalte(page, p, BRUTTO, "Schritt 1");
  await page.getByRole("button", { name: "← Zurück", exact: true }).click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(p.calc.length, 1, "der Rückweg hat neu berechnet");
  assert.equal(await gedrueckt(page, BRUTTO), true, "der Vergleich hat die Wahl der Buchungsseite verloren");
  assert.equal(await inhalt(karteVon(page, JM).locator(".offer-price")), "12,85 €");

  // Wieder hinein: derselbe Modus.
  await waehle(page, JM);
  assert.equal(await gedrueckt(page, BRUTTO), true);
  assert.equal((await flaechen(page)).auswahl.bruttoVorn, true);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N9 — steuerfreie Absicherung: Gesamtbetrag netto vom Server, Absicherung steuerfrei, Umschalten bepreist nicht neu", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  await waehle(page, JM);
  await zuSchritt2(page);
  await absichern(page);
  await warteBis(async () => (await inhalt(page.locator(".blsum-price-net"))) === "20,80 € netto", "Nettobetrag mit Absicherung");
  const bepreist = p.reprice.length;
  assert.equal(await inhalt(page.locator(".blsum-price-gross")), "22,85 € brutto");
  const box = page.locator(".booking-confirm-box");
  assert.match(await inhalt(box.locator('[data-component="transport_insurance"]')), /Zusätzliche Transportabsicherung\s*steuerfrei\s*10,00 €/);
  assert.match(await inhalt(box.locator('[data-vat-total="net"]')), /^Gesamtbetrag netto\s*20,80 €$/);
  assert.match(await inhalt(box), /Gesamtbetrag brutto\s*22,85 €/);

  await schalte(page, p, BRUTTO, "Schritt 2 mit Absicherung");
  assert.equal(p.reprice.length, bepreist, "das Umschalten hat die Absicherung neu bepreist");
  assert.equal(await page.locator('.ins-card input[value="transit_cover"]').isChecked(), true, "die Absicherung ist abgewählt");
  assert.equal(await page.locator("#ins-goodsAreNew-ja").isChecked(), true);
  assert.equal(await page.locator(".ins-status-ok").count(), 1);
  assert.equal(await box.locator('[data-vat-total="net"]').count(), 0);
  assert.match(await inhalt(box.locator('[data-component="transport_insurance"]')), /steuerfrei\s*10,00 €/);
  assert.match(await inhalt(box), /Gesamtbetrag brutto\s*22,85 €/);
  assert.equal((await flaechen(page)).kopf.nettoVorn, false);
  await schalte(page, p, NETTO, "Schritt 2 mit Absicherung");
  assert.equal(p.reprice.length, bepreist);

  const body = await bucheUndWarte(page, p);
  assert.equal(body.insuranceSelection.type, "transit_cover");
  const recap = page.locator(".booking-success-recap");
  assert.match(await inhalt(recap.locator('[data-vat-total="net"]')), /^Gesamtbetrag netto\s*20,80 €$/);
  assert.match(await inhalt(recap), /steuerfrei\s*10,00 €/);
  assert.match(await inhalt(recap), /Gesamtbetrag brutto\s*22,85 €/);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N9b — Absicherung ohne customerTotalNet: keine Nettozeile, kein erfundener Nettobetrag, brutto vorn", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { reprice: (body) => absicherung(body, { mitNetto: false }) });
  await zuDenAngeboten(page);
  await waehle(page, JM);
  await zuSchritt2(page);
  await absichern(page);
  await warteAufBrutto(page, "22,85 € brutto");
  assert.equal(await gedrueckt(page, NETTO), true);
  assert.equal(await page.locator(".booking-confirm-box [data-vat-total='net']").count(), 0, "eine Nettozeile ohne Serverbetrag");
  assert.equal(await page.locator(".blsum-price-net").count(), 0, "die Live-Leiste nennt einen Nettobetrag ohne Serverwert");
  assert.equal((await flaechen(page)).kopf.nettoVorn, false);
  assert.doesNotMatch(await inhalt(page.locator(".booking-confirm-box")), /20,80/, "ein selbst gebildeter Nettobetrag erscheint");
  assert.match(await inhalt(page.locator(".booking-confirm-box")), /Gesamtbetrag brutto\s*22,85 €/);
  assert.ok(p.reprice.length >= 1);
  assert.deepEqual(fehler, []);
  await page.close();
});

async function warteAufBrutto(page, text) {
  await warteBis(async () => (await page.locator(".blsum-price-gross").count())
    && (await inhalt(page.locator(".blsum-price-gross"))) === text, `Live-Leiste ${text}`);
}

test("N10 — Privatadresse + Abholung heute: Zuschlagskarten im Modus, Hinweise brutto, keine Options- oder Bindungsanfrage", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: [TG, JM] });
  await zuDenAngeboten(page);
  await waehle(page, TG);
  const geschaeft = page.locator(`label[for="${LIEFERADRESSE_ID.geschaeft}"]`);
  const privat = page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`);
  await privat.waitFor({ timeout: 20000 });
  assert.equal(await inhalt(geschaeft.locator(".res-card-price-val")), "+ 0,00 € netto");
  assert.equal(await inhalt(geschaeft.locator(".res-card-price-sub")), "0,00 € brutto");
  assert.equal(await inhalt(privat.locator(".res-card-price-val")), "+ 3,18 € netto");
  assert.equal(await inhalt(privat.locator(".res-card-price-sub")), "3,78 € brutto");
  assert.equal(await inhalt(page.locator(".blsum-price-label")), "Vorläufiger Preis");
  assert.equal(await inhalt(page.locator(".blsum-price-net")), "15,36 € netto");
  assert.equal(await inhalt(page.locator(".blsum-price-gross")), "18,28 € brutto");
  assert.equal(await inhalt(page.locator("#booking-live-sameday-note")), "inkl. Zuschlag für Abholung am selben Tag 3,60 €");

  const optionen = p.lz.optionsCalls.length;
  await schalte(page, p, BRUTTO, "Art der Lieferadresse");
  assert.equal(await inhalt(privat.locator(".res-card-price-val")), "+ 3,78 € brutto");
  assert.equal(await inhalt(privat.locator(".res-card-price-sub")), "3,18 € netto");
  assert.equal(await inhalt(geschaeft.locator(".res-card-price-val")), "+ 0,00 € brutto");
  assert.equal((await flaechen(page)).kopf.nettoVorn, false);
  assert.equal(await inhalt(page.locator("#booking-live-sameday-note")), "inkl. Zuschlag für Abholung am selben Tag 3,60 €");
  assert.equal(p.lz.optionsCalls.length, optionen, "das Umschalten hat die Optionen neu geladen");
  assert.equal(p.lz.bindCalls.length, 0, "das Umschalten hat eine Art gebunden");
  assert.equal(await page.locator('input[name="residential-delivery"]:checked').count(), 0);
  await beleg(page, "lieferadresse-brutto");

  await schalte(page, p, NETTO, "Art der Lieferadresse");
  await waehleLieferadresse(page, true);
  assert.equal(p.lz.bindCalls.length, 1);
  await warteBis(async () => (await inhalt(page.locator(".blsum-price-net"))) === "18,54 € netto", "gebundener Nettopreis");
  assert.equal(await inhalt(page.locator(".blsum-price-label")), "Gesamt");
  assert.equal(await inhalt(page.locator(".blsum-price-gross")), "22,06 € brutto");
  assert.equal(await inhalt(page.locator("#booking-live-surcharge-note")), "inkl. Zuschlag Privatadresse 3,78 €");
  const revision = p.lz.revision;

  await schalte(page, p, BRUTTO, "gebundene Privatadresse");
  assert.equal(p.lz.bindCalls.length, 1, "das Umschalten hat neu gebunden");
  assert.equal(p.lz.optionsCalls.length, optionen);
  assert.equal(p.lz.revision, revision, "das Umschalten hat die Revision verändert");
  assert.equal(await page.locator(`#${LIEFERADRESSE_ID.privat}`).isChecked(), true);
  assert.equal(await inhalt(page.locator("#booking-live-surcharge-note")), "inkl. Zuschlag Privatadresse 3,78 €");
  await schalte(page, p, NETTO, "gebundene Privatadresse");

  await zuSchritt2(page);
  const box = page.locator(".booking-confirm-box");
  assert.match(await inhalt(box.locator('[data-component="residential_delivery_surcharge"]')), /Zuschlag Privatadresse netto\s*3,18 €/);
  assert.match(await inhalt(box.locator('[data-component="same_day_collection_surcharge"]')), /Zuschlag für Abholung am selben Tag netto\s*3,02 €/);
  assert.match(await inhalt(box.locator('[data-vat-total="net"]')), /^Gesamtbetrag netto\s*18,54 €$/);
  assert.match(await inhalt(box), /Gesamtbetrag brutto\s*22,06 €/);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N11 — fehlender Betrag: „—“ statt eines anderen Betrags; ein abweichender gebuchter Betrag steht allein", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: [JM, OHNE_BRUTTO], betrag: () => 13 });
  await zuDenAngeboten(page);
  const ohne = karteVon(page, OHNE_BRUTTO);
  assert.equal(await inhalt(ohne.locator(".offer-price")), "9,99 €");
  assert.equal(await inhalt(ohne.locator(".offer-price-sub")), "exkl. MwSt.");
  assert.equal(await ohne.locator(".offer-price-alt").count(), 0, "ein fehlender Bruttobetrag erscheint als Zahl");

  await schalte(page, p, BRUTTO, "Liste");
  assert.equal(await inhalt(ohne.locator(".offer-price")), "—", "der Nettobetrag steht als Bruttobetrag da");
  assert.equal(await inhalt(ohne.locator(".offer-price-sub")), "inkl. MwSt.");
  assert.equal(await inhalt(ohne.locator(".offer-price-alt")), "9,99 € exkl. MwSt.");
  await ohne.locator("button.offer-details-link").click();
  const details = page.locator(`#offer-details-${OHNE_BRUTTO.offerId}`);
  await details.waitFor({ timeout: 10000 });
  assert.equal(await details.locator(".offer-detail-row--strong").count(), 0, "eine fehlende Bruttozeile ist hervorgehoben");
  await schalte(page, p, NETTO, "Liste");

  // Der gebuchte Betrag weicht von der Aufstellung ab: er allein gilt — ohne Aufstellung, ohne Nettozeile.
  await waehle(page, JM);
  await zuSchritt2(page);
  await bucheUndWarte(page, p);
  assert.match(await inhalt(page.locator("#booking-success-amount")), /^Gesamtbetrag brutto\s*13,00 €$/);
  assert.equal(await page.locator('[data-vat-total="net"]').count(), 0, "zum abweichenden gebuchten Betrag erscheint ein Nettobetrag");
  assert.doesNotMatch(await inhalt(page.locator(".booking-success-recap")), /12,85|10,80/, "der Erfolg nennt den Betrag der Aufstellung");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("N12 — 390 px: Umschalter und beide Beträge sichtbar, innerhalb der Fläche, ohne Überlauf", async () => {
  const { page, fehler } = await neueSeite({ width: 390, height: 844 });
  const p = await setup(page);
  await zuDenAngeboten(page);
  const karte = karteVon(page, JM);
  await karte.locator(".offer-price-alt").scrollIntoViewIfNeeded();
  assert.equal(await karte.locator(".offer-price-alt").isVisible(), true);
  await liegtInnerhalb(karte, karte.locator(".offer-price-alt"), "Karte 390 px");
  assert.ok((await querUeberlauf(page)) <= 0, "die Angebotsliste läuft seitlich über");

  await waehle(page, JM);
  const zeile = page.locator(".booking-vat-row");
  await zeile.scrollIntoViewIfNeeded();
  assert.equal(await umschalter(page, BRUTTO).isVisible(), true);
  assert.equal(await umschalter(page, NETTO).isVisible(), true);
  await liegtInnerhalb(page.locator(".booking-livesum"), page.locator(".blsum-price-net"), "Live-Leiste netto 390 px");
  await liegtInnerhalb(page.locator(".booking-livesum"), page.locator(".blsum-price-gross"), "Live-Leiste brutto 390 px");
  const breite = await page.evaluate(() => document.documentElement.clientWidth);
  const z = await zeile.boundingBox();
  assert.ok(z && z.x >= 0 && z.x + z.width <= breite + 1, "der Umschalter ragt aus der Seite");
  assert.ok((await querUeberlauf(page)) <= 0, "die Buchungsseite läuft seitlich über");
  await beleg(page, "buchung-390-netto");
  await schalte(page, p, BRUTTO, "390 px");
  assert.ok((await querUeberlauf(page)) <= 0, "die Buchungsseite läuft in Brutto seitlich über");
  await beleg(page, "buchung-390-brutto");
  assert.deepEqual(fehler, []);
  await page.close();
});
