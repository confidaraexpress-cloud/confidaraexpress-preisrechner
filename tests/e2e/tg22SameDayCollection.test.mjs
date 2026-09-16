// E2E: TG22 Same-Day — die Abholung am selben Tag in der Oberfläche. Echter Dev-Server, echter Browser,
// gemocktes Backend (Optionen und Bindung über helpers/residentialPriceInputs.mjs).
//
// Gemessen wird, was eine Quelltextprüfung nicht erreicht:
//   A  Angebotsliste: Preis inkl. Zuschlag, Zuschlagszeile netto/brutto, „Abholung heute möglich bis 16:45 Uhr“,
//      Details; ein JUMiNGO-Tarif mit eigener Abholung heute bleibt ohne Zuschlagszeile
//   B  Nach dem Abholschluss: sichtbar mit Preis, nicht auswählbar, Grund am Knopf, Hinweis darunter
//   C  Buchung heute + Privatadresse + Absicherung: Zusammenfassungen, frische „bereit ab“-Zeit, Bestandteile,
//      /book-Körper ohne Same-Day-Angabe, Erfolg mit der gebuchten Abholzeit
//   B2 Grundvertrag: drei Gründe mit drei Sätzen und demselben Hinweis, TG23 identisch, keine „bereit ab“-Zeile
//      für eine gesperrte Abholung heute, ein späterer Abholtag mit „bereit ab 09:00 Uhr“, unbekannter Grund neutral
//   D  /book meldet SAME_DAY_COLLECTION_UNAVAILABLE: Hinweis statt Bestellknopf, Weg zur Neuberechnung — Satz je Art
//   E  Optionen melden SAME_DAY_COLLECTION_UNAVAILABLE: Fehlerfläche mit Neuberechnung, keine Auswahl — Satz je Art
//   F  Zurück zum Vergleich: gebundener Preis, Zuschlagszeile und frische Abholzeit bleiben — ohne Neuberechnung
//   G  1440 / 834 / 390 px: Karte, gesperrte Karte, Buchungsseite und Erfolg sichtbar, innerhalb der Fläche, ohne Überlauf
//   H  Regression JUMiNGO: keine Zuschlagsanfrage, keine Same-Day-Zeile, /book unverändert
//
// Kein echtes Backend, keine Bestellung, kein Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_PAKET } from "./helpers/newShipmentForm.mjs";
import {
  LIEFERADRESSE_ID, lieferadressZustand, mockeLieferadresse, waehleLieferadresse, bestandteile,
} from "./helpers/residentialPriceInputs.mjs";

const PORT = 5395, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 4995;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// Der Berliner Geschäftstag — ausschließlich als FIXTUREWERT des gemockten Servers. Die Oberfläche vergleicht
// ihn nie: ob heute abgeholt werden kann, sagt allein die Serverantwort.
const HEUTE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const HEUTE_DE = `${HEUTE.slice(8, 10)}.${HEUTE.slice(5, 7)}.${HEUTE.slice(0, 4)}`;
// Ein späterer Abholtag — ebenfalls nur Fixturewert.
const MORGEN = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(Date.now() + 36 * 60 * 60 * 1000));
const kennung = (kopf, fuss) => `${kopf}${fuss.padStart(32 - kopf.length, "0")}`;

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10995",
};

const COVER_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
};

// Serverbeträge (Fixturewerte, nie gerechnet):
//   B   ohne Zuschlag               12,34 / 2,34 / 14,68
//   S   Abholung heute              15,36 / 2,92 / 18,28   Zuschlag S − B   3,02 / 0,58 / 3,60
//   PS  heute + Privatadresse       18,54 / 3,52 / 22,06   Zuschlag PS − S  3,18 / 0,60 / 3,78
const B = { net: 12.34, vat: 2.34, gross: 14.68 };
const S = { net: 15.36, vat: 2.92, gross: 18.28 };
const PS = { net: 18.54, vat: 3.52, gross: 22.06 };
const SD = { net: 3.02, vat: 0.58, gross: 3.6 };
const RES = { net: 3.18, vat: 0.6, gross: 3.78 };

/* Das TG22-Angebot mit Abholung heute, wie calculate-price es liefert: auswählbar, Preis inkl. Zuschlag. */
const TG = {
  offerId: "22sd0000000000000000000000000022", publicCarrierId: "ups", publicServiceName: "Standardversand",
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

/* Dasselbe Angebot nach dem Abholschluss: sichtbar, Preis ohne Zuschlag, nicht auswählbar — der Server nennt den
   Abholtag, aber keine „bereit ab"-Zeit mehr (Same-Day-Grundvertrag). */
const TG_VORBEI = {
  ...TG, netPrice: B.net, vatAmount: B.vat, finalPrice: B.gross,
  unavailableReason: "same_day_unavailable", collectionReadyFrom: null,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
};
/* Dieselbe Sperre mit den beiden anderen Gründen, TG23 (Expressversand) mit demselben Vertrag, ein unbekannter
   Grund und ein späterer Abholtag mit dem bestehenden Vertrag. */
const TG_UNBESTAETIGT = { ...TG_VORBEI, offerId: kennung("22sd", "122"), unavailableReason: "same_day_unconfirmed" };
const TG_UNPRUEFBAR = { ...TG_VORBEI, offerId: kennung("22sd", "222"), unavailableReason: "same_day_unverifiable" };
const TG23_UNBESTAETIGT = {
  ...TG_UNBESTAETIGT, offerId: kennung("23sd", "23"), publicServiceName: "Expressversand",
  netPrice: 26.25, vatAmount: 4.99, finalPrice: 31.24, transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
};
const TG_UNBEKANNT = { ...TG_VORBEI, offerId: kennung("22sd", "322"), unavailableReason: "same_day_kuenftiger_grund" };
const TG_MORGEN = {
  ...TG, offerId: kennung("22sd", "422"), collectionDate: MORGEN, collectionReadyFrom: "09:00",
  netPrice: B.net, vatAmount: B.vat, finalPrice: B.gross,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
};
const SATZ = {
  expired: "Abholung heute nicht mehr möglich.",
  unconfirmed: "Abholung heute für dieses Angebot nicht verfügbar.",
  unverifiable: "Abholung heute kann derzeit nicht bestätigt werden.",
};
const HINWEIS = "Bitte wählen Sie einen späteren Abholtag.";

/* Ein JUMiNGO-Tarif mit eigener Abholung heute — er trägt `pickupToday`, aber keinen Same-Day-Vertrag. */
const JM = {
  id: 11, shipper_tariff_id: 3307, offerId: "ju-sd-000000000000000000000000011",
  publicCarrierId: "dhl", publicCarrierName: "DHL Express", publicServiceName: "Expressversand",
  serviceType: "pickup", pickupToday: true, pickupDate: HEUTE,
  netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19, currency: "EUR",
  transitDaysMin: 1, transitDaysMax: 1, trackingAvailable: true, printerRequired: false,
  bookable: true, requiredPriceInputs: [], labelFormatOptions: ["A4", "A6"], labelSizes: ["A4", "A6"],
};

// Absicherung 10,00 € (steuerfrei) — Totals des Servers je gebundener Wahl.
const ABSICHERUNG_TOTALS = {
  false: { customerShippingNet: 15.36, shippingVat: 2.92, customerShippingGross: 18.28,
           insuranceGross: 10, customerTotalNet: 25.36, customerTotalGross: 28.28 },
  true: { customerShippingNet: 18.54, shippingVat: 3.52, customerShippingGross: 22.06,
          insuranceGross: 10, customerTotalNet: 28.54, customerTotalGross: 32.06 },
};
const ABSICHERUNG_ZEILE = { type: "transport_insurance", taxable: false, net: 10, vat: 0, gross: 10 };

const absicherungsAntwort = (body, lz) => ({
  selectedInsurance: "transit_cover",
  insurance: { coverValue: body.coverValue, excessValue: 20, goodsAreNew: body.goodsAreNew,
               goodsAreFragile: body.goodsAreFragile, insuranceGross: 10 },
  totals: ABSICHERUNG_TOTALS[String(lz.bound)],
  tariff: { insuranceAvailable: true, insuranceDetails: COVER_DETAILS },
  components: [...bestandteile(lz, lz.bound), ABSICHERUNG_ZEILE],
  priceRevision: lz.revision, priceChangeAccepted: false,
});

const buchungsAntwort = (body, lz) => {
  const tg = body.offerId === TG.offerId;
  const versichert = !!body.insuranceSelection && body.insuranceSelection.type === "transit_cover";
  const amount = !tg ? 22.19 : versichert ? ABSICHERUNG_TOTALS[String(lz.bound)].customerTotalGross
    : (lz.bound ? PS.gross : S.gross);
  return {
    message: "Sendung gebucht", ceShipmentId: CE_ID, invoiceNumber: "CE-RE26-00995",
    businessOrderNumber: "CE-BS26-00995", dueDate: null, amount, billingMode: "single",
    testBooking: false, voucherCode: null, deliveryNote: null,
    orderConfirmation: { number: "CE-AB26-00995", issuedAt: `${HEUTE}T10:00:00Z` }, shippingDocuments: [],
    priceComponents: tg ? [...bestandteile(lz, lz.bound), ...(versichert ? [ABSICHERUNG_ZEILE] : [])] : null,
    // Die beim Buchen TATSÄCHLICH gesendete Abholzeit — später als die des Vergleichs.
    ...(tg ? { sameDayCollection: { collectionDate: HEUTE, collectionReadyFrom: "12:00" } } : {}),
  };
};

const VERBOTEN = /transglobal|jumingo|colfee|same day collection fee|sameDayCollectionCutOffTime|quoteid|shipper_tariff_id|itemdescription/i;
const SAME_DAY_SATZ = "Abholung heute nicht mehr möglich. Bitte wählen Sie einen späteren Abholtag.";

let server, browser;

/* Das Szenario: `tariffs`, `insuranceAvailable`, `optionsReject`, `book(body, n, lz)`. */
async function setup(page, szenario = {}) {
  const p = { pfade: [], reprice: [], book: [], calc: [], anfragen: [] };
  const lz = lieferadressZustand({
    offerId: TG.offerId, geschaeft: S, privat: PS, zuschlag: RES,
    insuranceAvailable: szenario.insuranceAvailable === true,
    insuranceDetails: szenario.insuranceAvailable === true ? COVER_DETAILS : null,
    sameDay: { basis: B, zuschlag: SD, block: { pickupTodayUntil: "16:45", collectionDate: HEUTE, collectionReadyFrom: "11:45" } },
  });
  if (szenario.optionsReject) lz.optionsReject = szenario.optionsReject;
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
        ceShipmentId: CE_ID, tariffs: szenario.tariffs || [TG, JM], availableShippingModes: ["standard", "express"],
        publicCarriers: [{ id: "ups", name: "UPS" }, { id: "dhl", name: "DHL Express" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
    }
    if (pfad.includes("/api/insurance/reprice")) {
      const body = req.postDataJSON();
      p.reprice.push(body);
      if (lz.bound === null) {
        return json({ error: "Bitte wählen Sie zuerst die Art der Lieferadresse.", code: "PRICE_INPUTS_REQUIRED" }, 409);
      }
      lz.insuranceSelected = true;
      return json(absicherungsAntwort(body, lz));
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

const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const inhalt = async (loc) => norm(await loc.first().textContent());
const querUeberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const buchenKnopf = (page) => page.getByRole("button", { name: /Kostenpflichtig buchen/ });

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

async function keinAnbieter(page, wo) {
  const text = norm(await page.evaluate(() => document.body.innerText));
  const treffer = text.match(VERBOTEN);
  assert.equal(treffer, null, `${wo}: unzulässiger Text „${treffer && treffer[0]}“`);
}

/* Ein Element liegt seitlich vollständig in seiner Fläche — nichts ragt über den Rand. */
async function liegtInnerhalb(aussen, innen, wo) {
  const a = await aussen.boundingBox();
  const i = await innen.boundingBox();
  assert.ok(a && i, `${wo}: Element fehlt`);
  assert.ok(i.x >= a.x - 1 && i.x + i.width <= a.x + a.width + 1,
    `${wo}: ragt aus der Fläche (${Math.round(i.x)}..${Math.round(i.x + i.width)} statt ${Math.round(a.x)}..${Math.round(a.x + a.width)})`);
}

async function beleg(page, name) {
  const ordner = path.join(process.cwd(), "tests", "e2e", "screenshots");
  mkdirSync(ordner, { recursive: true });
  await page.screenshot({ path: path.join(ordner, `sameday-${name}.png`), fullPage: false });
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

test("A — Angebotsliste: Preis inkl. Zuschlag, Zuschlagszeile netto/brutto, Abholschluss, Details; JUMiNGO ohne Zuschlagszeile", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);

  const tg = karteVon(page, TG);
  assert.equal(await inhalt(tg.locator(".offer-price")), "15,36 €", "der Kartenpreis ist nicht der Serverpreis mit Zuschlag");
  assert.equal(await inhalt(tg.locator(".offer-sameday-surcharge")), "Zuschlag für Abholung am selben Tag: +3,02 €");
  assert.equal(await inhalt(tg.locator(".offer-sameday-until")), "Abholung heute möglich bis 16:45 Uhr");
  assert.equal(await inhalt(tg.locator(".offer-tl-node--start .offer-tl-title")), "Abholung heute");
  assert.match(await inhalt(tg.locator(".offer-tl-node--start")), /bereit ab 11:30 Uhr/);
  assert.equal(await tg.evaluate((el) => el.classList.contains("offer-card--unavailable")), false, "die Karte ist gesperrt");
  assert.equal(await tg.locator("button.offer-cta-btn").isEnabled(), true, "der CTA ist gesperrt");
  assert.equal(await tg.locator(".offer-badge").count(), 0, "ein vorläufiges Angebot trägt eine Auszeichnung");

  // Brutto: Preis UND Zeile wechseln gemeinsam — beide Werte vom Server.
  await page.getByRole("button", { name: "inkl. MwSt.", exact: true }).click();
  await warteBis(async () => (await inhalt(tg.locator(".offer-price"))) === "18,28 €", "Bruttopreis der Karte");
  assert.equal(await inhalt(tg.locator(".offer-sameday-surcharge")), "Zuschlag für Abholung am selben Tag: +3,60 €");

  // Details: der Zuschlag mit beiden Beträgen.
  await tg.locator("button.offer-details-link").click();
  const detail = page.locator(`#offer-details-${TG.offerId} .offer-detail-row:has(.offer-detail-label:text-is("Zuschlag für Abholung am selben Tag"))`);
  await detail.waitFor({ timeout: 10000 });
  assert.equal(await inhalt(detail.locator(".offer-detail-value")), "+3,02 € netto · +3,60 € brutto");

  // JUMiNGO mit eigener Abholung heute: der Titel bleibt, eine Zuschlagszeile entsteht nicht.
  const jm = karteVon(page, JM);
  assert.equal(await inhalt(jm.locator(".offer-tl-node--start .offer-tl-title")), "Abholung heute");
  assert.equal(await jm.locator(".offer-sameday-surcharge, .offer-sameday-until").count(), 0);
  assert.equal(p.anfragen.length, 0, "vor der Auswahl entstand eine Zuschlagsanfrage");
  await keinAnbieter(page, "Angebotsliste");
  await beleg(page, "angebotsliste");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — nach dem Abholschluss: sichtbar mit Preis, nicht auswählbar, Grund am Knopf, Hinweis darunter", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: [TG_VORBEI, JM] });
  await zuDenAngeboten(page);

  const tg = karteVon(page, TG_VORBEI);
  assert.equal(await tg.count(), 1, "die Karte ist verschwunden");
  assert.equal(await inhalt(tg.locator(".offer-price")), "12,34 €");
  const cta = tg.locator("button.offer-cta-btn");
  assert.equal(await cta.isDisabled(), true, "der CTA ist bedienbar");
  assert.equal(await inhalt(cta), "Abholung heute nicht mehr möglich.");
  assert.equal(await inhalt(tg.locator("p.offer-cta-hint")), "Bitte wählen Sie einen späteren Abholtag.");
  assert.equal(await tg.locator(".offer-sameday-surcharge, .offer-sameday-until").count(), 0);
  assert.equal(await tg.evaluate((el) => el.classList.contains("offer-card--unavailable")), true);
  // Der Abholtag bleibt, eine „bereit ab"-Zeit nicht: 09:00 wäre heute eine überholte Zusage.
  const start = await inhalt(tg.locator(".offer-tl-node--start"));
  assert.match(start, /Abholung/);
  assert.doesNotMatch(start, /bereit ab/, "eine gesperrte Abholung heute trägt eine „bereit ab“-Zeit");
  await tg.locator(".offer-carrier-name").click();
  await kurz(400);
  assert.equal(await page.locator(".steps-bar").count(), 0, "ein nicht auswählbares Angebot öffnete die Buchung");
  assert.equal(p.anfragen.length, 0);
  await keinAnbieter(page, "Angebotsliste nach dem Abholschluss");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B2 — Grundvertrag: drei Gründe, drei Sätze, ein Hinweis; TG23 identisch; keine „bereit ab“-Zeile; später 09:00", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: [TG_VORBEI, TG_UNBESTAETIGT, TG_UNPRUEFBAR, TG23_UNBESTAETIGT, TG_UNBEKANNT, TG_MORGEN, JM] });
  await zuDenAngeboten(page);

  for (const [t, satz] of [[TG_VORBEI, SATZ.expired], [TG_UNBESTAETIGT, SATZ.unconfirmed],
                           [TG_UNPRUEFBAR, SATZ.unverifiable], [TG23_UNBESTAETIGT, SATZ.unconfirmed]]) {
    const karte = karteVon(page, t);
    assert.equal(await karte.count(), 1, `${t.unavailableReason}: die Karte fehlt`);
    const cta = karte.locator("button.offer-cta-btn");
    assert.equal(await cta.isDisabled(), true, `${t.unavailableReason}: der CTA ist bedienbar`);
    assert.equal(await inhalt(cta), satz, t.unavailableReason);
    assert.equal(await inhalt(karte.locator("p.offer-cta-hint")), HINWEIS, t.unavailableReason);
    const start = await inhalt(karte.locator(".offer-tl-node--start"));
    assert.doesNotMatch(start, /bereit ab/, `${t.unavailableReason}: „bereit ab“ für eine gesperrte Abholung heute`);
    assert.equal(await karte.locator(".offer-sameday-surcharge, .offer-sameday-until").count(), 0);
  }
  // „nicht mehr möglich" steht genau einmal — beim zeitlichen Ablauf.
  assert.equal(await page.getByText("Abholung heute nicht mehr möglich.", { exact: true }).count(), 1);
  // TG23 zeigt denselben Satz wie TG22 — ohne eigene Karte, ohne ServiceID.
  assert.equal(await inhalt(karteVon(page, TG23_UNBESTAETIGT).locator("button.offer-cta-btn")),
    await inhalt(karteVon(page, TG_UNBESTAETIGT).locator("button.offer-cta-btn")));
  // Ein unbekannter Grund: der neutrale Satz, kein Hinweis.
  const unbekannt = karteVon(page, TG_UNBEKANNT);
  assert.equal(await inhalt(unbekannt.locator("button.offer-cta-btn")), "Derzeit nicht buchbar");
  assert.equal(await unbekannt.locator("p.offer-cta-hint").count(), 0);
  // Ein späterer Abholtag: der bestehende Vertrag „bereit ab 09:00 Uhr", auswählbar.
  const morgen = karteVon(page, TG_MORGEN);
  assert.match(await inhalt(morgen.locator(".offer-tl-node--start")), /bereit ab 09:00 Uhr/);
  assert.equal(await morgen.locator("button.offer-cta-btn").isEnabled(), true);
  // JUMiNGO bleibt mit eigener Abholung heute und bedienbar.
  const jm = karteVon(page, JM);
  assert.equal(await inhalt(jm.locator(".offer-tl-node--start .offer-tl-title")), "Abholung heute");
  assert.equal(await jm.locator("button.offer-cta-btn").isEnabled(), true);
  assert.equal(p.anfragen.length, 0);
  await keinAnbieter(page, "Angebotsliste Grundvertrag");
  await beleg(page, "grundvertrag");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — Buchung heute + Privatadresse + Absicherung: Zeilen auf allen Flächen, frische und gebuchte Abholzeit, /book", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { insuranceAvailable: true });
  await zuDenAngeboten(page);
  await waehle(page, TG);

  const geschaeftKarte = page.locator(`label[for="${LIEFERADRESSE_ID.geschaeft}"]`);
  const privatKarte = page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`);
  await privatKarte.waitFor({ timeout: 20000 });
  assert.match(await inhalt(geschaeftKarte), /\+ 0,00 € brutto/);
  assert.match(await inhalt(privatKarte), /\+ 3,78 € brutto/);
  assert.match(await inhalt(privatKarte), /3,18 € netto/);

  // Vorläufig: der Preis enthält den Zuschlag, die Zeilen stammen aus den Serverfeldern des Angebots.
  assert.equal(await inhalt(page.locator(".blsum-price-label")), "Vorläufiger Preis");
  assert.match(await inhalt(page.locator(".blsum-price-gross")), /18,28 €/);
  assert.equal(await inhalt(page.locator("#booking-live-sameday-note")), "inkl. Zuschlag für Abholung am selben Tag 3,60 €");
  assert.equal(await inhalt(page.locator("#offer-summary-sameday-note")), "inkl. Zuschlag für Abholung am selben Tag 3,60 €");
  assert.equal(await inhalt(page.locator("#offer-summary-sameday-until")), "Abholung heute möglich bis 16:45 Uhr");
  assert.match(await inhalt(page.locator(".offsum-facts")), /bereit ab 11:30 Uhr/);

  await waehleLieferadresse(page, true);
  await warteAufText(page, ".blsum-price-gross", "22,06");
  assert.equal(await inhalt(page.locator(".blsum-price-label")), "Gesamt");
  assert.equal(await inhalt(page.locator("#booking-live-surcharge-note")), "inkl. Zuschlag Privatadresse 3,78 €");
  assert.equal(await inhalt(page.locator("#booking-live-sameday-note")), "inkl. Zuschlag für Abholung am selben Tag 3,60 €");
  assert.equal(await inhalt(page.locator("#offer-summary-sameday-note")), "inkl. Zuschlag für Abholung am selben Tag 3,60 €");
  // Die Bindung nennt die „bereit ab"-Zeit, die JETZT gälte.
  await warteAufText(page, ".offsum-facts", "bereit ab 11:45 Uhr");

  await zuSchritt2(page);
  assert.match(await inhalt(page.locator('[data-component="shipping_base"]')), /Versand netto\s*12,34 €/);
  assert.match(await inhalt(page.locator('[data-component="same_day_collection_surcharge"]')),
    /Zuschlag für Abholung am selben Tag netto\s*3,02 €/);
  assert.match(await inhalt(page.locator('[data-component="residential_delivery_surcharge"]')), /Zuschlag Privatadresse netto\s*3,18 €/);
  const aufstellung = await inhalt(page.locator(".booking-confirm-box"));
  assert.match(aufstellung, /MwSt\. 19 %\s*3,52 €/);
  assert.match(aufstellung, /Gesamtbetrag brutto\s*22,06 €/);

  await absichern(page);
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  await warteAufText(page, ".blsum-price-gross", "32,06");
  assert.match(await inhalt(page.locator('[data-component="same_day_collection_surcharge"]')), /3,02 €/);
  assert.match(await inhalt(page.locator('[data-component="transport_insurance"]')),
    /Zusätzliche Transportabsicherung\s*steuerfrei\s*10,00 €/);
  assert.equal(await inhalt(page.locator("#booking-live-sameday-note")), "inkl. Zuschlag für Abholung am selben Tag 3,60 €");
  await keinAnbieter(page, "Schritt 2");

  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(p.book.length, 1);
  const body = p.book[0];
  assert.equal(body.offerId, TG.offerId);
  assert.equal(body.offerRevision, 1, "der Preisstand der Bindung reist nicht mit");
  assert.deepEqual(body.priceInputs, { deliveryIsResidential: true });
  assert.doesNotMatch(JSON.stringify(body), /pickupToday|sameDay|collectionReadyFrom|16:45/, "/book trägt eine Same-Day-Angabe");

  const recap = await inhalt(page.locator(".booking-success-recap"));
  assert.match(recap, /Zuschlag für Abholung am selben Tag netto\s*3,02 €/);
  assert.match(recap, /Gesamtbetrag brutto\s*32,06 €/);
  assert.equal(await inhalt(page.locator("#booking-success-pickup .summary-detail-val")), `${HEUTE_DE} · bereit ab 12:00 Uhr`);
  await keinAnbieter(page, "Erfolg");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — /book meldet SAME_DAY_COLLECTION_UNAVAILABLE: Hinweis statt Bestellknopf, Weg zur Neuberechnung", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, {
    book: () => ({ status: 409, json: { error: SAME_DAY_SATZ, code: "SAME_DAY_COLLECTION_UNAVAILABLE",
                                        sameDayUnavailableKind: "expired" } }),
  });
  await zuDenAngeboten(page);
  await waehle(page, TG);
  await waehleLieferadresse(page, false);
  await zuSchritt2(page);
  await bestaetigen(page);
  await buchenKnopf(page).click();

  const box = page.locator(".booking-conflict-box");
  await box.waitFor({ timeout: 20000 });
  assert.match(await inhalt(box), /Abholung heute nicht mehr möglich\. Bitte wählen Sie einen späteren Abholtag\./);
  assert.equal(await buchenKnopf(page).count(), 0, "der Bestellknopf steht neben dem Hinweis");
  assert.doesNotMatch(await inhalt(box), /erneut versuchen/i);
  await box.getByRole("button", { name: "Angebote neu berechnen" }).click();
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await kurz(400);
  assert.equal(await page.locator(".offer-card").count(), 0, "die Angebote von heute stehen noch da");
  assert.equal(p.book.length, 1, "der Hinweis hat erneut gebucht");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D2 — /book je Art: „nicht bestätigt“ und „nicht verifizierbar“ — nie „nicht mehr möglich“, kein Wiederholen", async () => {
  for (const [art, satz] of [["unconfirmed", SATZ.unconfirmed], ["unverifiable", SATZ.unverifiable]]) {
    const { page, fehler } = await neueSeite();
    const p = await setup(page, {
      // Der Servertext wird nie angezeigt — der Satz entsteht aus der Art.
      book: () => ({ status: 409, json: { error: "Rohtext des Servers", code: "SAME_DAY_COLLECTION_UNAVAILABLE",
                                          sameDayUnavailableKind: art } }),
    });
    await zuDenAngeboten(page);
    await waehle(page, TG);
    await waehleLieferadresse(page, false);
    await zuSchritt2(page);
    await bestaetigen(page);
    await buchenKnopf(page).click();
    const box = page.locator(".booking-conflict-box");
    await box.waitFor({ timeout: 20000 });
    const text = await inhalt(box);
    assert.ok(text.includes(`${satz} ${HINWEIS}`), `${art}: ${text}`);
    assert.doesNotMatch(text, /nicht mehr möglich|erneut versuchen|Rohtext/i, art);
    assert.equal(await buchenKnopf(page).count(), 0, `${art}: der Bestellknopf steht neben dem Hinweis`);
    assert.equal(await box.getByRole("button", { name: "Angebote neu berechnen" }).count(), 1, art);
    assert.equal(p.book.length, 1, art);
    await keinAnbieter(page, `Buchung ${art}`);
    assert.deepEqual(fehler, [], art);
    await page.close();
  }
});

test("E — Optionen melden SAME_DAY_COLLECTION_UNAVAILABLE: Fehlerfläche mit Neuberechnung, keine Auswahl", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, {
    optionsReject: { status: 409, body: { error: SAME_DAY_SATZ, code: "SAME_DAY_COLLECTION_UNAVAILABLE",
                                          sameDayUnavailableKind: "expired" } },
  });
  await zuDenAngeboten(page);
  await waehle(page, TG);
  const box = page.locator("#residential-options-error");
  await box.waitFor({ timeout: 20000 });
  assert.match(await inhalt(box), /Abholung heute nicht mehr möglich\. Bitte wählen Sie einen späteren Abholtag\./);
  assert.equal(await page.locator("#residential-options-recalculate").count(), 1, "der Weg zur Neuberechnung fehlt");
  assert.equal(await page.locator("#residential-options-retry").count(), 0, "„Erneut versuchen“ nach dem Abholschluss");
  assert.equal(await page.locator('input[name="residential-delivery"]').count(), 0, "neben dem Hinweis steht eine Auswahl");
  assert.equal(p.lz.bindCalls.length, 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E2 — Optionen je Art: „nicht bestätigt“ und — ohne Art — „nicht verifizierbar“, jeweils mit Neuberechnung", async () => {
  for (const [art, satz] of [["unconfirmed", SATZ.unconfirmed], [null, SATZ.unverifiable]]) {
    const { page, fehler } = await neueSeite();
    const body = { error: "Rohtext des Servers", code: "SAME_DAY_COLLECTION_UNAVAILABLE",
                   ...(art ? { sameDayUnavailableKind: art } : {}) };
    const p = await setup(page, { optionsReject: { status: 409, body } });
    await zuDenAngeboten(page);
    await waehle(page, TG);
    const box = page.locator("#residential-options-error");
    await box.waitFor({ timeout: 20000 });
    const text = await inhalt(box);
    assert.ok(text.includes(`${satz} ${HINWEIS}`), `${art}: ${text}`);
    assert.doesNotMatch(text, /nicht mehr möglich|Rohtext/, String(art));
    assert.equal(await page.locator("#residential-options-recalculate").count(), 1, `${art}: der Weg zur Neuberechnung fehlt`);
    assert.equal(await page.locator("#residential-options-retry").count(), 0, `${art}: „Erneut versuchen“`);
    assert.equal(await page.locator('input[name="residential-delivery"]').count(), 0, `${art}: Auswahl neben dem Hinweis`);
    assert.equal(p.lz.bindCalls.length, 0);
    assert.deepEqual(fehler, [], String(art));
    await page.close();
  }
});

test("F — Zurück zum Vergleich: gebundener Preis, Zuschlagszeile und frische Abholzeit bleiben — ohne Neuberechnung", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  await waehle(page, TG);
  await waehleLieferadresse(page, false);
  const berechnungen = p.calc.length;

  await page.getByRole("button", { name: "← Zurück", exact: true }).click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(p.calc.length, berechnungen, "der Rückweg hat neu berechnet");
  const karte = karteVon(page, TG);
  assert.equal(await inhalt(karte.locator(".offer-price")), "15,36 €");
  assert.equal(await inhalt(karte.locator(".offer-sameday-surcharge")), "Zuschlag für Abholung am selben Tag: +3,02 €");
  assert.equal(await inhalt(karte.locator(".offer-sameday-until")), "Abholung heute möglich bis 16:45 Uhr");
  assert.doesNotMatch(await inhalt(karte), /Vorläufiger Preis/);
  assert.match(await inhalt(karte.locator(".offer-tl-node--start")), /bereit ab 11:45 Uhr/,
    "die frische Abholzeit der Bindung fehlt in der Liste");
  assert.deepEqual(fehler, []);
  await page.close();
});

for (const breite of [1440, 834, 390]) {
  test(`G — ${breite} px: Karte, Buchungsseite und Erfolg sichtbar, innerhalb der Fläche, kein horizontaler Überlauf`, async () => {
    const { page, fehler } = await neueSeite({ width: breite, height: 900 });
    await setup(page, { insuranceAvailable: true, tariffs: [TG, TG_UNBESTAETIGT, JM] });
    await zuDenAngeboten(page);
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Angebotsliste mit horizontalem Überlauf`);
    const karte = karteVon(page, TG);
    for (const sel of [".offer-sameday-surcharge", ".offer-sameday-until"]) {
      const el = karte.locator(sel);
      await el.scrollIntoViewIfNeeded();
      assert.ok(await el.isVisible(), `${breite}px: ${sel} ist nicht sichtbar`);
      await liegtInnerhalb(karte, el, `${breite}px ${sel}`);
    }
    await karte.scrollIntoViewIfNeeded();
    await beleg(page, `karte-${breite}`);
    // Die gesperrte Abholung heute: Satz und Hinweis sichtbar und in der Karte, keine „bereit ab"-Zeile.
    const gesperrt = karteVon(page, TG_UNBESTAETIGT);
    for (const sel of ["button.offer-cta-btn", "p.offer-cta-hint"]) {
      const el = gesperrt.locator(sel);
      await el.scrollIntoViewIfNeeded();
      assert.ok(await el.isVisible(), `${breite}px: gesperrte Karte ${sel} ist nicht sichtbar`);
      await liegtInnerhalb(gesperrt, el, `${breite}px gesperrte Karte ${sel}`);
    }
    assert.equal(await inhalt(gesperrt.locator("button.offer-cta-btn")), SATZ.unconfirmed);
    assert.doesNotMatch(await inhalt(gesperrt.locator(".offer-tl-node--start")), /bereit ab/);
    await gesperrt.scrollIntoViewIfNeeded();
    await beleg(page, `gesperrt-${breite}`);

    await waehle(page, TG);
    await waehleLieferadresse(page, true);
    for (const sel of ["#booking-live-sameday-note", "#offer-summary-sameday-note", "#offer-summary-sameday-until"]) {
      assert.ok(await page.locator(sel).isVisible(), `${breite}px: ${sel} ist nicht sichtbar`);
    }
    await liegtInnerhalb(page.locator(".offsum-meta"), page.locator("#offer-summary-sameday-until"),
      `${breite}px Abholschluss im ausgewählten Angebot`);
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Schritt 1 mit horizontalem Überlauf`);

    await zuSchritt2(page);
    const zeile = page.locator('[data-component="same_day_collection_surcharge"]');
    await zeile.scrollIntoViewIfNeeded();
    assert.ok(await zeile.isVisible(), `${breite}px: die Bestandteilzeile ist nicht sichtbar`);
    await liegtInnerhalb(page.locator(".booking-confirm-box"), zeile, `${breite}px Bestandteilzeile`);
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Schritt 2 mit horizontalem Überlauf`);

    await bestaetigen(page);
    await buchenKnopf(page).click();
    await page.waitForSelector(".booking-success-title", { timeout: 20000 });
    const abholung = page.locator("#booking-success-pickup");
    assert.ok(await abholung.isVisible(), `${breite}px: die gebuchte Abholzeit fehlt`);
    await liegtInnerhalb(page.locator(".booking-success-recap"), abholung, `${breite}px gebuchte Abholzeit`);
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Erfolg mit horizontalem Überlauf`);
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

test("H — Regression JUMiNGO: keine Zuschlagsanfrage, keine Same-Day-Zeile, /book unverändert", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  await waehle(page, JM);
  await kurz(800);
  assert.equal(await page.locator("#residential-price-inputs").count(), 0, "ein Angebot ohne Angabe zeigt die Auswahl");
  assert.equal(await page.locator("#booking-live-sameday-note, #offer-summary-sameday-note, #offer-summary-sameday-until").count(), 0);
  await zuSchritt2(page);
  assert.equal(await page.locator('[data-component="same_day_collection_surcharge"]').count(), 0);
  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.deepEqual(p.anfragen, [], "für ein Angebot ohne Angabe entstand eine Zuschlagsanfrage");
  const body = p.book[0];
  assert.equal(body.offerId, JM.offerId);
  assert.equal(body.tariffId, JM.id);
  assert.ok(!("offerRevision" in body), "das Vergleichsangebot sendet einen Preisstand");
  assert.ok(!("priceInputs" in body), "das Vergleichsangebot sendet eine Adressart");
  assert.equal(await page.locator("#booking-success-pickup").count(), 0, "der Erfolg nennt eine Abholung am selben Tag");
  assert.deepEqual(fehler, []);
  await page.close();
});
