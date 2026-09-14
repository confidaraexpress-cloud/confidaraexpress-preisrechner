// E2E: TG22 Package A — das kuratierte Produktprofil im Detailbereich der Angebotskarte. Echter Dev-Server,
// echter Browser, gemocktes Backend (Optionen und Bindung über helpers/residentialPriceInputs.mjs).
//
// Gemessen wird, was eine Quelltextprüfung nicht erreicht:
//   A  S22-Karte, Details geöffnet: fünf Abschnitte in Reihenfolge mit genau den belegten Zeilen, die Laufzeit
//      genau einmal, keine Wiederholung von Drucker, Versandart und Sendungsverfolgung; Termin & Abholung und
//      Preisaufschlüsselung bleiben
//   B  Ausgeschlossene Aussagen: kein Access Point, keine Samstagszustellung, keine Länge und kein Gurtmaß,
//      kein Zustelldatum, keine Zustelluhrzeit, keine Zusage, kein Anbietername
//   C  Abholung am selben Tag: Zuschlagszeilen auf der Karte und in der Preisaufschlüsselung, Buchungsseite mit
//      Zuschlag — neben dem Profil
//   D  Privatadresse und Absicherung: Hinweis und vorläufiger Preis, Wahl der Lieferadresse, Transportabsicherung
//      mit Neubepreisung — unverändert
//   E  Regression JUMiNGO: bisheriger Detailbereich (Merkmalsraster, Einschränkungen, Tarif-ID), kein Profil
//   F  1440 / 834 / 390 px: alle Abschnitte sichtbar, jede Zeile innerhalb der Karte, kein horizontaler Überlauf;
//      auf 390 px steht die Beschriftung über dem Wert
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

const PORT = 5396, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 4996;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const tagIn = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ABHOLTAG = tagIn(7);
const deDatum = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
// Der Berliner Geschäftstag — ausschließlich als FIXTUREWERT des gemockten Servers.
const HEUTE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10996",
};

const COVER_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
};

// Serverbeträge (Fixturewerte, nie gerechnet):
//   B   Geschäftsadresse                12,74 / 2,42 / 15,16
//   P   Privatadresse                   15,92 / 3,02 / 18,94   Zuschlag P − B   3,18 / 0,60 / 3,78
//   S   Abholung heute                  15,36 / 2,92 / 18,28   Zuschlag         3,02 / 0,58 / 3,60 (Basis 12,34 / 2,34 / 14,68)
//   PS  heute + Privatadresse           18,54 / 3,52 / 22,06
const B = { net: 12.74, vat: 2.42, gross: 15.16 };
const P = { net: 15.92, vat: 3.02, gross: 18.94 };
const RES = { net: 3.18, vat: 0.6, gross: 3.78 };
const S_BASIS = { net: 12.34, vat: 2.34, gross: 14.68 };
const S = { net: 15.36, vat: 2.92, gross: 18.28 };
const PS = { net: 18.54, vat: 3.52, gross: 22.06 };
const SD = { net: 3.02, vat: 0.58, gross: 3.6 };

// Die Produktangaben des Servers — Codes und Zahlen, kein Text.
const PROFIL = {
  summaryKey: "economy_standard", volumetricDivisor: 5000, notAccepted: ["pallets", "suitcases"],
  basicCoverMaxGoodsValue: 50, maxCoverValue: 2500,
};

/* Das öffentliche TG22-Angebot seit Package A — ohne Tarif-ID, ohne ServiceID, ohne Einkaufsspur. */
const TG22 = (extra = {}) => ({
  offerId: "tg22-profil-00000000000000000000022", publicCarrierId: "ups", publicServiceName: "Standardversand",
  serviceType: "pickup", collectionDate: ABHOLTAG, collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  netPrice: B.net, vatAmount: B.vat, finalPrice: B.gross, currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: false, insuranceDetails: null, trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }, { operant: "weight", operator: "<=", value: 70 }],
  serviceDetails: PROFIL,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
  ...extra,
});
const TG = TG22();

/* Dasselbe Angebot mit Abholung heute: Preis inkl. Zuschlag, Abholschluss, Zuschlagsbeträge. */
const TG_HEUTE = TG22({
  offerId: "tg22-profil-heute-000000000000022", collectionDate: HEUTE, collectionReadyFrom: "11:30",
  netPrice: S.net, vatAmount: S.vat, finalPrice: S.gross,
  pickupToday: true, pickupTodayUntil: "16:45", sameDaySurchargeNet: SD.net, sameDaySurchargeGross: SD.gross,
});

/* Ein Tarif der anderen Einkaufsquelle — Tarif-ID, eigene Grenze, Formatwahl, kein Produktprofil. */
const JM = {
  id: 17, shipper_tariff_id: 3708, offerId: "ju-profil-0000000000000000000003708",
  publicCarrierId: "dhl", publicCarrierName: "DHL", publicServiceName: "Standardversand", serviceType: "pickup",
  netPrice: 12.9, vatAmount: 2.45, finalPrice: 15.35, currency: "EUR",
  transitDaysMin: 1, transitDaysMax: 2,
  pickupDate: `${ABHOLTAG}T00:00:00Z`, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  trackingAvailable: true, printerRequired: false, availableForDate: true, bookable: true, requiredPriceInputs: [],
  labelFormatOptions: ["A4", "A6"], labelSizes: ["A4", "A6"], chargeableWeight: 5.4,
  tariffLimits: [{ operant: "weight", operator: "<=", value: 31.5 }],
  insuranceAvailable: false,
};

const ABSICHERUNG_ZEILE = { type: "transport_insurance", taxable: false, net: 10, vat: 0, gross: 10 };
const absicherungsAntwort = (body, lz) => {
  const versand = lz.bound ? lz.privat : lz.geschaeft;
  return {
    selectedInsurance: "transit_cover",
    insurance: { coverValue: body.coverValue, excessValue: 20, goodsAreNew: body.goodsAreNew,
                 goodsAreFragile: body.goodsAreFragile, insuranceGross: 10 },
    totals: { customerShippingNet: versand.net, shippingVat: versand.vat, customerShippingGross: versand.gross,
              insuranceGross: 10, customerTotalNet: Math.round((versand.net + 10) * 100) / 100,
              customerTotalGross: Math.round((versand.gross + 10) * 100) / 100 },
    tariff: { insuranceAvailable: true, insuranceDetails: COVER_DETAILS },
    components: [...bestandteile(lz, lz.bound), ABSICHERUNG_ZEILE],
    priceRevision: lz.revision, priceChangeAccepted: false,
  };
};

const VERBOTEN = /transglobal|jumingo|ServiceID|Service-ID|shipper_tariff_id|UPS Standard Single/i;
// Was das Profil nie sagt: Access Point, Samstag, Maße, Datum, Uhrzeit, Zusage, statische Zuschlagspreise.
const NIE_IM_PROFIL = /access\s*point|paketshop|samstag|saturday|länge|gurtmaß|\d+\s*cm\b|garant|\d{1,2}:\d{2}|\d{1,2}\.\d{1,2}\.\d{4}|treibstoff|kraftstoff|fuel|entlegen|adresskorrektur/i;

let server, browser;

/* Das Szenario: `tariffs`, `lz` (Zustand der Lieferadresse), `insuranceAvailable`. */
async function setup(page, szenario = {}) {
  const p = { pfade: [], reprice: [], book: [], calc: [], anfragen: [] };
  const lz = szenario.lz || lieferadressZustand({
    offerId: TG.offerId, geschaeft: B, privat: P, zuschlag: RES,
    insuranceAvailable: szenario.insuranceAvailable === true,
    insuranceDetails: szenario.insuranceAvailable === true ? COVER_DETAILS : null,
  });
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
        publicCarriers: [{ id: "ups", name: "UPS" }, { id: "dhl", name: "DHL" }],
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
      p.book.push(req.postDataJSON());
      return json({ error: "In dieser Suite wird nicht gebucht.", code: "BOOKING_FAILED" }, 409);
    }
    return json({});
  });
  // NACH dem Sammel-Mock: Playwright prüft Routen in umgekehrter Reihenfolge.
  await mockeLieferadresse(page, lz, p.anfragen);
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const inhalt = async (loc) => norm(await loc.first().textContent());
const alleTexte = async (loc) => (await loc.allTextContents()).map(norm);
const querUeberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const panelVon = (page, t) => page.locator(`#offer-details-${t.offerId}`);
const abschnittVon = (panel, id) => panel.locator(`[data-profile-section="${id}"]`);

async function zeilenVon(bereich) {
  const rows = bereich.locator(".offer-detail-row");
  const out = [];
  for (let i = 0; i < await rows.count(); i++) {
    out.push([norm(await rows.nth(i).locator(".offer-detail-label").textContent()),
              norm(await rows.nth(i).locator(".offer-detail-value").textContent())]);
  }
  return out;
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

async function oeffneDetails(page, tarif) {
  const karte = karteVon(page, tarif);
  await karte.locator("button.offer-details-link").click();
  const panel = panelVon(page, tarif);
  await panel.locator(".offer-details-section").first().waitFor({ timeout: 10000 });
  return panel;
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

async function warteAufText(page, selektor, teil, timeout = 10000) {
  await page.waitForFunction(({ s, t }) => {
    const el = document.querySelector(s);
    return !!el && el.textContent.replace(/ /g, " ").includes(t);
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
  await page.screenshot({ path: path.join(ordner, `product-details-${name}.png`), fullPage: false });
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

test("A — S22-Karte: fünf Abschnitte mit genau den belegten Zeilen; Termin & Abholung und Preisaufschlüsselung bleiben", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  await zuDenAngeboten(page);
  const panel = await oeffneDetails(page, TG);

  assert.deepEqual(await alleTexte(panel.locator(".offer-detail-section-title")),
    ["Hauptmerkmale", "Laufzeit", "Größe & Gewicht", "Transportabsicherung", "Einschränkungen",
     "Termin & Abholung", "Preisaufschlüsselung"]);

  const haupt = abschnittVon(panel, "main");
  assert.equal(await inhalt(haupt.locator(".offer-profile-summary")), "Wirtschaftlicher Standardversand für weniger eilige Sendungen.");
  assert.deepEqual(await alleTexte(haupt.locator(".offer-profile-feature-label")),
    ["Abholung an Ihrer Adresse", "Sendungsverfolgung inklusive", "Versandlabel zum Ausdrucken"]);
  assert.equal(await inhalt(haupt.locator('[data-profile-feature="label"] .offer-profile-feature-value')), "PDF · DIN A4 / Thermodruck");

  const laufzeit = abschnittVon(panel, "transit");
  assert.deepEqual(await zeilenVon(laufzeit), [["Voraussichtliche Laufzeit", "1–2 Tage"]]);
  assert.equal(await inhalt(laufzeit.locator(".offer-profile-note")),
    "Die Laufzeit ist eine Schätzung des Versanddienstleisters und keine Zustellzusage.");

  const groesse = abschnittVon(panel, "size");
  assert.deepEqual(await zeilenVon(groesse), [["Packstücke", "1 je Sendung"], ["Max. Gewicht", "70 kg"], ["Abrechnungsgewicht", "2,00 kg"]]);
  assert.deepEqual(await alleTexte(groesse.locator(".offer-profile-note")), [
    "Für die Abrechnung zählt das höhere Gewicht aus tatsächlichem Gewicht und Volumengewicht.",
    "Volumengewicht: L × B × H ÷ 5.000",
  ]);

  assert.deepEqual(await zeilenVon(abschnittVon(panel, "cover")),
    [["Grundabsicherung", "bis 50 € Warenwert"], ["Zusätzliche Transportabsicherung", "bis 2.500 € Warenwert"]]);
  assert.deepEqual(await zeilenVon(abschnittVon(panel, "restrictions")), [["Nicht zugelassen", "Paletten, Koffer"]]);

  // Keine Wiederholung im Detailbereich: eine Laufzeit, keine Drucker-, Versandart- oder Labelformatzeile.
  const text = norm(await panel.textContent());
  assert.equal((text.match(/Voraussichtliche Laufzeit/g) || []).length, 1, "die Laufzeit steht mehrfach in den Details");
  assert.equal((text.match(/Sendungsverfolgung/g) || []).length, 1, "die Sendungsverfolgung steht mehrfach in den Details");
  for (const doppelt of ["Drucker", "Versandart", "Verfügbare Labelformate", "Tarif-ID", "Versicherung"]) {
    assert.ok(!text.includes(doppelt), `„${doppelt}“ steht zusätzlich in den Details`);
  }
  assert.equal(await panel.locator(".offer-feature-grid, .offer-limit-list").count(), 0, "der bisherige Bereich steht daneben");

  // Termin & Abholung und Preisaufschlüsselung — unverändert.
  const termin = panel.locator(".offer-details-section:has(.offer-detail-section-title:text-is('Termin & Abholung'))");
  const terminZeilen = await zeilenVon(termin);
  assert.deepEqual(terminZeilen[0], ["Abholtermin", deDatum(ABHOLTAG)]);
  assert.match(terminZeilen[1].join(" "), /^Abholung bereit ab 09:00 Uhr$/);
  const preis = await zeilenVon(panel.locator(".offer-details-section--price"));
  assert.deepEqual(preis.slice(0, 3), [["Netto", "12,74 €"], ["MwSt.", "2,42 €"], ["Brutto", "15,16 €"]]);

  await keinAnbieter(page, "Angebotsliste mit Details");
  await beleg(page, "details-1440");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — ausgeschlossene Aussagen: kein Access Point, kein Samstag, keine Maße, kein Datum, keine Uhrzeit, keine Zusage", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  await zuDenAngeboten(page);
  const panel = await oeffneDetails(page, TG);
  const profil = norm((await panel.locator("[data-profile-section]").allTextContents()).join(" "));
  assert.ok(profil.length > 200, "das Profil ist leer");
  const treffer = profil.match(NIE_IM_PROFIL);
  assert.equal(treffer, null, `unzulässige Aussage im Profil: „${treffer && treffer[0]}“`);
  // „Zusage“ steht ausschließlich verneint.
  assert.equal((profil.match(/zusage/gi) || []).length, 1);
  const details = norm(await panel.textContent());
  assert.doesNotMatch(details, /Zustelltermin|Zustellzeitraum|Zustellung\s+\d|garantiert/i);
  assert.equal(await panel.locator("[data-profile-section] a").count(), 0, "das Profil verlinkt nach außen");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — Abholung am selben Tag: Zuschlag auf Karte, in der Preisaufschlüsselung und auf der Buchungsseite — neben dem Profil", async () => {
  const { page, fehler } = await neueSeite();
  const lz = lieferadressZustand({
    offerId: TG_HEUTE.offerId, geschaeft: S, privat: PS, zuschlag: RES,
    sameDay: { basis: S_BASIS, zuschlag: SD, block: { pickupTodayUntil: "16:45", collectionDate: HEUTE, collectionReadyFrom: "11:45" } },
  });
  const p = await setup(page, { tariffs: [TG_HEUTE, JM], lz });
  await zuDenAngeboten(page);
  const karte = karteVon(page, TG_HEUTE);
  assert.equal(await inhalt(karte.locator(".offer-sameday-surcharge")), "Zuschlag für Abholung am selben Tag: +3,02 €");
  assert.equal(await inhalt(karte.locator(".offer-sameday-until")), "Abholung heute möglich bis 16:45 Uhr");

  const panel = await oeffneDetails(page, TG_HEUTE);
  assert.equal(await abschnittVon(panel, "main").count(), 1, "das Profil fehlt neben der Abholung heute");
  const zuschlag = panel.locator('.offer-detail-row:has(.offer-detail-label:text-is("Zuschlag für Abholung am selben Tag"))');
  assert.equal(await inhalt(zuschlag.locator(".offer-detail-value")), "+3,02 € netto · +3,60 € brutto");

  await waehle(page, TG_HEUTE);
  await waehleLieferadresse(page, false);
  assert.equal(await inhalt(page.locator("#booking-live-sameday-note")), "inkl. Zuschlag für Abholung am selben Tag 3,60 €");
  assert.equal(p.lz.bindCalls.length, 1);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — Privatadresse und Absicherung unverändert: Hinweis, vorläufiger Preis, Wahl, Transportabsicherung mit Neubepreisung", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { insuranceAvailable: true });
  await zuDenAngeboten(page);
  const karte = karteVon(page, TG);
  assert.match(await inhalt(karte), /Vorläufiger Preis/);
  assert.equal(await inhalt(karte.locator(".offer-surcharge-hint")), "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.");

  await waehle(page, TG);
  const privatKarte = page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`);
  await privatKarte.waitFor({ timeout: 20000 });
  assert.match(await inhalt(privatKarte), /\+ 3,78 € brutto/);
  assert.equal(p.reprice.length, 0, "vor der Bindung wurde die Absicherung bepreist");
  await waehleLieferadresse(page, true);
  await warteAufText(page, ".blsum-price-gross", "18,94");

  await zuSchritt2(page);
  await absichern(page);
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  await warteAufText(page, ".blsum-price-gross", "28,94");
  assert.equal(p.reprice.at(-1).offerId, TG.offerId);
  assert.match(await inhalt(page.locator('[data-component="transport_insurance"]')), /Zusätzliche Transportabsicherung\s*steuerfrei\s*10,00 €/);
  await keinAnbieter(page, "Schritt 2");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — Regression JUMiNGO: bisheriger Detailbereich mit Merkmalsraster, Einschränkungen und Tarif-ID, kein Profil", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  await zuDenAngeboten(page);
  const panel = await oeffneDetails(page, JM);
  assert.equal(await panel.locator("[data-profile-section]").count(), 0, "das Vergleichsangebot zeigt ein Produktprofil");
  const titel = await alleTexte(panel.locator(".offer-detail-section-title"));
  assert.deepEqual(titel.slice(0, 2), ["Hauptmerkmale", "Einschränkungen"]);
  const merkmale = await alleTexte(panel.locator(".offer-feature-label"));
  for (const label of ["Voraussichtliche Laufzeit", "Drucker", "Sendungsverfolgung", "Versandart", "Abrechnungsgewicht", "Tarif-ID"]) {
    assert.ok(merkmale.includes(label), `„${label}“ fehlt im bisherigen Merkmalsraster`);
  }
  assert.deepEqual(await alleTexte(panel.locator(".offer-limit-item")), ["Packstücke dürfen max. 31.5 kg wiegen."]);
  assert.doesNotMatch(norm(await panel.textContent()), /Paletten|Koffer|Volumengewicht|Grundabsicherung/);
  assert.deepEqual(fehler, []);
  await page.close();
});

for (const breite of [1440, 834, 390]) {
  test(`F — ${breite} px: alle Abschnitte sichtbar, jede Zeile innerhalb der Karte, kein horizontaler Überlauf`, async () => {
    const { page, fehler } = await neueSeite({ width: breite, height: 900 });
    await setup(page);
    await zuDenAngeboten(page);
    const karte = karteVon(page, TG);
    const panel = await oeffneDetails(page, TG);
    for (const id of ["main", "transit", "size", "cover", "restrictions"]) {
      const bereich = abschnittVon(panel, id);
      await bereich.scrollIntoViewIfNeeded();
      assert.ok(await bereich.isVisible(), `${breite}px: Abschnitt ${id} ist nicht sichtbar`);
      await liegtInnerhalb(karte, bereich, `${breite}px Abschnitt ${id}`);
    }
    const werte = panel.locator(".offer-profile-row .offer-detail-value, .offer-profile-note, .offer-profile-feature-label, .offer-profile-summary");
    for (let i = 0; i < await werte.count(); i++) {
      await liegtInnerhalb(karte, werte.nth(i), `${breite}px Profilzeile ${i}`);
    }
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: horizontaler Überlauf`);
    if (breite === 390) {
      // Die Beschriftung steht über dem Wert — nicht daneben gequetscht.
      const zeile = abschnittVon(panel, "restrictions").locator(".offer-profile-row").first();
      const label = await zeile.locator(".offer-detail-label").boundingBox();
      const wert = await zeile.locator(".offer-detail-value").boundingBox();
      assert.ok(wert.y >= label.y + label.height - 1, "390px: Beschriftung und Wert stehen nebeneinander");
    }
    await abschnittVon(panel, "main").scrollIntoViewIfNeeded();
    await beleg(page, `profil-${breite}`);
    assert.deepEqual(fehler, []);
    await page.close();
  });
}
