// E2E: TG22 Package B — die voraussichtliche Lieferung als Prognose von ConfidaraExpress auf Karte, im Detailbereich und
// auf der Buchungsseite. Echter Dev-Server, echter Browser, gemocktes Backend: die Tage sind Fixturewerte des Servers —
// die Oberfläche rechnet sie nicht, sie zeigt sie.
//
//   A  Abholung Montag + 1–2 → „Voraussichtliche Lieferung · Di. – Mi."; die Laufzeit bleibt; Detailbereich mit Hinweis
//   B  Abholung Freitag + 1–2 → Montag–Dienstag, kein Wochenende
//   C  „1+" → „ab …" und „ab 1 Tag", keine erfundene Obergrenze
//   D  Abholung am selben Tag: Zuschlag, Abholschluss und Prognose nebeneinander
//   E  Privatadresse: Buchungsseite mit „Voraussichtliche Lieferung", Wahl der Lieferadresse unverändert
//   F  Regression JUMiNGO: Zustellung mit Anbieterdaten und Uhrzeit — keine Prognose
//   G  1440 / 834 / 390 px: Knoten und Detailzeile innerhalb der Karte, kein horizontaler Überlauf
//
// Kein echtes Backend, keine Bestellung, kein Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_PAKET } from "./helpers/newShipmentForm.mjs";
import { lieferadressZustand, mockeLieferadresse, waehleLieferadresse } from "./helpers/residentialPriceInputs.mjs";

const PORT = 5397, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 4997;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

/* ══════════ Kalendertage der Fixtures ══════════ */
// Nur zum Bauen der Serverantworten und der erwarteten Texte — die Oberfläche rechnet nichts davon.
const utc = (tag) => { const [j, m, t] = tag.split("-").map(Number); return new Date(Date.UTC(j, m - 1, t)); };
const plusTage = (tag, n) => { const d = utc(tag); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wochentag = (tag) => utc(tag).getUTCDay();
const naechster = (ab, wt) => { let t = ab; while (wochentag(t) !== wt) t = plusTage(t, 1); return t; };
const KURZ = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
const kurz = (tag) => `${KURZ[wochentag(tag)]}, ${tag.slice(8, 10)}.${tag.slice(5, 7)}.`;
const lang = (tag) => `${tag.slice(8, 10)}.${tag.slice(5, 7)}.${tag.slice(0, 4)}`;

const HEUTE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const MONTAG = naechster(plusTage(HEUTE, 7), 1);
const FREITAG = naechster(plusTage(HEUTE, 7), 5);
// Die Tage, die der Server nennt: Montag + 1–2 → Dienstag–Mittwoch · Freitag + 1–2 → Montag–Dienstag.
const MO_MIN = plusTage(MONTAG, 1), MO_MAX = plusTage(MONTAG, 2);
const FR_MIN = plusTage(FREITAG, 3), FR_MAX = plusTage(FREITAG, 4);
const naechsterVersandtag = (tag) => { let t = plusTage(tag, 1); while ([0, 6].includes(wochentag(t))) t = plusTage(t, 1); return t; };
const HEUTE_MIN = naechsterVersandtag(HEUTE), HEUTE_MAX = naechsterVersandtag(HEUTE_MIN);

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10997",
};

// Serverbeträge (Fixturewerte): Geschäftsadresse 12,74 / 2,42 / 15,16 · Privatadresse 15,92 / 3,02 / 18,94.
const B = { net: 12.74, vat: 2.42, gross: 15.16 };
const P = { net: 15.92, vat: 3.02, gross: 18.94 };
const RES = { net: 3.18, vat: 0.6, gross: 3.78 };

const PROFIL = {
  summaryKey: "economy_standard", volumetricDivisor: 5000, notAccepted: ["pallets", "suitcases"],
  basicCoverMaxGoodsValue: 50, maxCoverValue: 2500,
};

/* Das öffentliche TG22-Angebot seit Package B — mit Prognose, ohne Anbieter-Zustelldaten. */
const TG22 = (extra = {}) => ({
  offerId: "tg22-prognose-mo-000000000000000022", publicCarrierId: "ups", publicServiceName: "Standardversand",
  serviceType: "pickup", collectionDate: MONTAG, collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  deliveryProjection: { kind: "estimated", dateMin: MO_MIN, dateMax: MO_MAX },
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
const TG_MO = TG22();
const TG_FR = TG22({
  offerId: "tg22-prognose-fr-000000000000000022", collectionDate: FREITAG,
  deliveryProjection: { kind: "estimated", dateMin: FR_MIN, dateMax: FR_MAX },
});
const TG_OFFEN = TG22({
  offerId: "tg22-prognose-offen-0000000000000022", transitDaysMax: null, deliveryTime: "ab 1 Tag",
  deliveryProjection: { kind: "estimated", dateMin: MO_MIN, dateMax: null },
});
const TG_HEUTE = TG22({
  offerId: "tg22-prognose-heute-0000000000000022", collectionDate: HEUTE, collectionReadyFrom: "11:30",
  netPrice: 15.36, vatAmount: 2.92, finalPrice: 18.28,
  pickupToday: true, pickupTodayUntil: "16:45", sameDaySurchargeNet: 3.02, sameDaySurchargeGross: 3.6,
  deliveryProjection: { kind: "estimated", dateMin: HEUTE_MIN, dateMax: HEUTE_MAX },
});

/* Ein Tarif der anderen Einkaufsquelle mit eigenen Zustelldaten und Uhrzeit — ohne Prognose. */
const JM_MIN = plusTage(MONTAG, 2), JM_MAX = plusTage(MONTAG, 3);
const JM = {
  id: 17, shipper_tariff_id: 3708, offerId: "ju-prognose-000000000000000003708",
  publicCarrierId: "dhl", publicCarrierName: "DHL", publicServiceName: "Standardversand", serviceType: "pickup",
  netPrice: 12.9, vatAmount: 2.45, finalPrice: 15.35, currency: "EUR",
  transitDaysMin: 1, transitDaysMax: 2,
  pickupDate: `${MONTAG}T00:00:00Z`, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDateMin: `${JM_MIN}T00:00:00Z`, deliveryDateMax: `${JM_MAX}T00:00:00Z`, deliveryTimeUntil: "18:00",
  trackingAvailable: true, printerRequired: false, availableForDate: true, bookable: true, requiredPriceInputs: [],
  labelFormatOptions: ["A4", "A6"],
};

const VERBOTEN = /transglobal|jumingo|ServiceID|shipper_tariff_id|ce_projected|estimated|garantiert/i;
const PROGNOSE_HINWEIS = "Aus Abholtag und Laufzeit berechnet; Wochenenden sind nicht mitgezählt. Feiertage können die Zustellung verschieben.";

let server, browser;

async function setup(page, szenario = {}) {
  const p = { pfade: [], calc: [], book: [], anfragen: [] };
  const lz = lieferadressZustand({ offerId: (szenario.lzOffer || TG_MO).offerId, geschaeft: B, privat: P, zuschlag: RES });
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
        ceShipmentId: CE_ID, tariffs: szenario.tariffs || [TG_MO, JM], availableShippingModes: ["standard", "express"],
        publicCarriers: [{ id: "ups", name: "UPS" }, { id: "dhl", name: "DHL" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
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
const kurzWarten = (ms) => new Promise((r) => setTimeout(r, ms));
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const panelVon = (page, t) => page.locator(`#offer-details-${t.offerId}`);

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
  await karteVon(page, tarif).locator("button.offer-details-link").click();
  const panel = panelVon(page, tarif);
  await panel.locator(".offer-details-section").first().waitFor({ timeout: 10000 });
  return panel;
}

async function waehle(page, tarif) {
  await karteVon(page, tarif).locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await page.waitForSelector("#booking-reference-toggle", { timeout: 20000 });
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
  await page.screenshot({ path: path.join(ordner, `delivery-projection-${name}.png`), fullPage: false });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", detached: true });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await kurzWarten(250);
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

test("A — Abholung Montag, Laufzeit 1–2: „Voraussichtliche Lieferung Di. – Mi.“; die Laufzeit bleibt", async () => {
  assert.deepEqual([wochentag(MO_MIN), wochentag(MO_MAX)], [2, 3], "Fixture: Dienstag und Mittwoch");
  const { page, fehler } = await neueSeite();
  await setup(page);
  await zuDenAngeboten(page);
  const karte = karteVon(page, TG_MO);
  assert.equal(await inhalt(karte.locator(".offer-eta")), "1–2 Tage", "die Laufzeit des Anbieters ist verschwunden");
  const ende = karte.locator(".offer-tl-node--end");
  assert.equal(await inhalt(ende.locator(".offer-tl-title")), "Voraussichtliche Lieferung");
  assert.equal(await inhalt(ende.locator(".offer-tl-primary")), `${kurz(MO_MIN)} – ${kurz(MO_MAX)}`);
  assert.equal(await ende.locator(".offer-tl-sub").count(), 0, "unter der Prognose steht eine Uhrzeit");

  const panel = await oeffneDetails(page, TG_MO);
  const laufzeit = panel.locator('[data-profile-section="transit"]');
  assert.deepEqual(await zeilenVon(laufzeit), [
    ["Voraussichtliche Laufzeit", "1–2 Tage"],
    ["Voraussichtliche Lieferung", `${kurz(MO_MIN)} – ${kurz(MO_MAX)}`],
  ]);
  assert.deepEqual(await alleTexte(laufzeit.locator(".offer-profile-note")), [
    "Die Laufzeit ist eine Schätzung des Versanddienstleisters und keine Zustellzusage.",
    PROGNOSE_HINWEIS,
  ]);
  assert.deepEqual(await alleTexte(panel.locator(".offer-detail-section-title")),
    ["Hauptmerkmale", "Laufzeit", "Größe & Gewicht", "Transportabsicherung", "Einschränkungen",
     "Termin & Abholung", "Preisaufschlüsselung"]);
  const text = norm(await panel.textContent());
  assert.equal((text.match(/Voraussichtliche Lieferung/g) || []).length, 1, "die Prognose steht mehrfach in den Details");
  assert.doesNotMatch(text, /Zustellzeitraum|Zustelltermin/, "die Prognose erscheint als Anbieterdatum");
  assert.doesNotMatch(norm(await laufzeit.textContent()), /\d{1,2}:\d{2}|\bUhr\b/, "Uhrzeit im Laufzeitblock");
  await keinAnbieter(page, "Angebotsliste mit Prognose");
  await beleg(page, "montag-1440");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — Abholung Freitag, Laufzeit 1–2: Montag–Dienstag — kein Samstag, kein Sonntag", async () => {
  assert.deepEqual([wochentag(FR_MIN), wochentag(FR_MAX)], [1, 2], "Fixture: Montag und Dienstag");
  const { page, fehler } = await neueSeite();
  await setup(page, { tariffs: [TG_FR, JM], lzOffer: TG_FR });
  await zuDenAngeboten(page);
  const ende = karteVon(page, TG_FR).locator(".offer-tl-node--end");
  assert.equal(await inhalt(ende.locator(".offer-tl-title")), "Voraussichtliche Lieferung");
  assert.equal(await inhalt(ende.locator(".offer-tl-primary")), `${kurz(FR_MIN)} – ${kurz(FR_MAX)}`);
  assert.doesNotMatch(await inhalt(ende), /\bSa\.|\bSo\./, "ein Wochenendtag in der Prognose");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — Laufzeit „1+“: „ab …“ und „ab 1 Tag“ — keine erfundene Obergrenze", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page, { tariffs: [TG_OFFEN, JM], lzOffer: TG_OFFEN });
  await zuDenAngeboten(page);
  const karte = karteVon(page, TG_OFFEN);
  assert.equal(await inhalt(karte.locator(".offer-eta")), "ab 1 Tag");
  assert.equal(await inhalt(karte.locator(".offer-tl-node--end .offer-tl-primary")), `ab ${kurz(MO_MIN)}`);
  const panel = await oeffneDetails(page, TG_OFFEN);
  assert.deepEqual(await zeilenVon(panel.locator('[data-profile-section="transit"]')), [
    ["Voraussichtliche Laufzeit", "ab 1 Tag"],
    ["Voraussichtliche Lieferung", `ab ${kurz(MO_MIN)}`],
  ]);
  assert.doesNotMatch(await inhalt(karte.locator(".offer-tl-node--end")), /–/, "eine Obergrenze wurde erfunden");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — Abholung am selben Tag: Zuschlag, Abholschluss und Prognose nebeneinander", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page, { tariffs: [TG_HEUTE, JM], lzOffer: TG_HEUTE });
  await zuDenAngeboten(page);
  const karte = karteVon(page, TG_HEUTE);
  assert.equal(await inhalt(karte.locator(".offer-sameday-surcharge")), "Zuschlag für Abholung am selben Tag: +3,02 €");
  assert.equal(await inhalt(karte.locator(".offer-sameday-until")), "Abholung heute möglich bis 16:45 Uhr");
  assert.equal(await inhalt(karte.locator(".offer-tl-node--start .offer-tl-title")), "Abholung heute");
  const ende = karte.locator(".offer-tl-node--end");
  assert.equal(await inhalt(ende.locator(".offer-tl-title")), "Voraussichtliche Lieferung");
  assert.equal(await inhalt(ende.locator(".offer-tl-primary")), `${kurz(HEUTE_MIN)} – ${kurz(HEUTE_MAX)}`);
  const panel = await oeffneDetails(page, TG_HEUTE);
  const zuschlag = panel.locator('.offer-detail-row:has(.offer-detail-label:text-is("Zuschlag für Abholung am selben Tag"))');
  assert.equal(await inhalt(zuschlag.locator(".offer-detail-value")), "+3,02 € netto · +3,60 € brutto");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — Privatadresse: die Buchungsseite zeigt die Prognose; Wahl der Lieferadresse unverändert", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  assert.match(await inhalt(karteVon(page, TG_MO)), /Vorläufiger Preis/);
  await waehle(page, TG_MO);
  assert.equal(await inhalt(page.locator(".blsum-delivery .blsum-label")), "Voraussichtliche Lieferung");
  assert.equal(await inhalt(page.locator(".blsum-delivery .blsum-val")), `${lang(MO_MIN)} – ${lang(MO_MAX)}`);
  assert.equal(await page.locator(".blsum-delivery .blsum-sub").count(), 0, "eine Uhrzeit auf der Buchungsseite");
  assert.equal(await inhalt(page.locator(".offsum-fact dt").first()), "Voraussichtliche Lieferung");
  assert.equal(await inhalt(page.locator(".offsum-fact dd").first()), `${lang(MO_MIN)} – ${lang(MO_MAX)}`);
  await waehleLieferadresse(page, true);
  await warteAufText(page, ".blsum-price-gross", "18,94");
  assert.equal(await inhalt(page.locator(".blsum-delivery .blsum-val")), `${lang(MO_MIN)} – ${lang(MO_MAX)}`,
    "die Bindung der Lieferadresse hat die Prognose verloren");
  assert.equal(p.lz.bindCalls.length, 1);
  await keinAnbieter(page, "Buchungsseite");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F — Regression JUMiNGO: Zustellung mit Anbieterdaten und Uhrzeit — keine Prognose", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  await zuDenAngeboten(page);
  const karte = karteVon(page, JM);
  const ende = karte.locator(".offer-tl-node--end");
  assert.equal(await inhalt(ende.locator(".offer-tl-title")), "Zustellung");
  const primaer = await inhalt(ende.locator(".offer-tl-primary"));
  for (const tag of [JM_MIN, JM_MAX]) {
    assert.ok(primaer.includes(`${tag.slice(8, 10)}.${tag.slice(5, 7)}.`), `der Anbieterzeitraum fehlt: ${primaer}`);
  }
  assert.match(await inhalt(ende), /18:00/, "die Zustelluhrzeit des Anbieters fehlt");
  const panel = await oeffneDetails(page, JM);
  assert.equal(await panel.locator("[data-profile-section]").count(), 0);
  const text = norm(await panel.textContent());
  assert.match(text, /Zustellzeitraum/);
  assert.match(text, /Zustellung\s*bis 18:00 Uhr/);
  assert.doesNotMatch(text, /Voraussichtliche Lieferung/, "JUMiNGO zeigt eine Prognose");
  assert.deepEqual(fehler, []);
  await page.close();
});

for (const breite of [1440, 834, 390]) {
  test(`G — ${breite} px: Knoten und Detailzeile innerhalb der Karte, kein horizontaler Überlauf`, async () => {
    const { page, fehler } = await neueSeite({ width: breite, height: 900 });
    await setup(page);
    await zuDenAngeboten(page);
    const karte = karteVon(page, TG_MO);
    const ende = karte.locator(".offer-tl-node--end");
    await ende.scrollIntoViewIfNeeded();
    assert.ok(await ende.isVisible(), `${breite}px: der Lieferknoten ist nicht sichtbar`);
    await liegtInnerhalb(karte, ende, `${breite}px Lieferknoten`);
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Angebotsliste mit horizontalem Überlauf`);
    const panel = await oeffneDetails(page, TG_MO);
    const zeile = panel.locator('[data-profile-row="projection"]');
    await zeile.scrollIntoViewIfNeeded();
    assert.ok(await zeile.isVisible(), `${breite}px: die Prognosezeile ist nicht sichtbar`);
    await liegtInnerhalb(karte, zeile.locator(".offer-detail-value"), `${breite}px Prognosewert`);
    await liegtInnerhalb(karte, panel.locator('[data-profile-note="projection"]'), `${breite}px Prognosehinweis`);
    if (breite === 390) {
      const label = await zeile.locator(".offer-detail-label").boundingBox();
      const wert = await zeile.locator(".offer-detail-value").boundingBox();
      assert.ok(wert.y >= label.y + label.height - 1, "390px: Beschriftung und Wert stehen nebeneinander");
    }
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Detailbereich mit horizontalem Überlauf`);
    await beleg(page, `details-${breite}`);
    assert.deepEqual(fehler, []);
    await page.close();
  });
}
