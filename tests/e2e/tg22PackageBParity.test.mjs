// E2E: TG22 Paket B — Kundenfluss und Zusatzoptionen auf Augenhöhe. Echter Dev-Server, echter
// Browser, gemocktes Backend.
//
// Gemessen wird, was eine Quelltextprüfung nicht erreicht:
//   A    TG-Angebot auf 1440: keine Formatauswahl, neutraler Lieferhinweis, Referenz bereinigt,
//        beide Zusatzempfänger im Payload, kein labelFormat, Erfolg mit A4/Thermodruck-Belegen
//   C/D  834 und 390 px: Absicherungsfragen ≥ 44 px, lange E-Mail und Belegknöpfe ohne Überlauf
//   I    JUMiNGO-Angebot: A4/A6-Auswahl unverändert, A6 im Payload
//   J    gemischte Angebote: beide Anbieter, date_unavailable mit Hinweis, Carrierfilter serverseitig
//   K/L  Absicherung A → B startet neutral ohne Neubepreisung; zurück zu A stellt sie wieder her
//   M    Entwurf mit vergangenem Datum: kein Ersatzdatum, Hinweis, keine Berechnung bis zur Wahl
//   N    Sendungsverfolgung in der Mobilkarte (390/834)
//   O    öffentliche Sendungsverfolgung per Klick
//   P    Erfolgsbetrag ausschließlich vom Server
//   Q    offener Ausgang (Abbruch, 5xx ohne Code, unlesbarer Erfolg): kein Bestellknopf mehr
//   R    422 Unternehmensprofil (Buchung und Preisberechnung) ohne Abmeldung
//   S/T  versicherter 409 ohne Code bepreist neu; Vertragscodes führen zur richtigen Handlung
//
// Kein echtes Backend, keine Bestellung, keine Neubepreisung beim Anbieter, kein Tracking-Abruf.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  fuelleVersandformular, STANDARD_PAKET, ueberSidebar,
} from "./helpers/newShipmentForm.mjs";

const PORT = 5378, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 4790;
const AB = "CE-AB26-00790";
const AWB = "1Z999AA10000000790";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ABHOLTAG = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const LANGE_EMAIL = "sehr.lange.adresse.fuer.versandbestaetigungen@buchhaltung-muster-gmbh-international.example.com";

const USER = (email = "max@example.com") => ({
  id: 1, email, company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10790",
});

const COVER_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
};

const TG = (offerId, extra = {}) => ({
  offerId, publicCarrierId: "ups", publicServiceName: "Standard",
  serviceType: "pickup", collectionDate: ABHOLTAG, collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  netPrice: 12.34, vatAmount: 2.34, finalPrice: 14.68, currency: "EUR",
  bookable: true, unavailableReason: null, priceCompleteness: "complete",
  requiredPriceInputs: ["deliveryIsResidential", "collectionIsResidential"],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: true, insuranceDetails: COVER_DETAILS,
  trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }],
  ...extra,
});
const TG_A = TG("tg-a-0000000000000000000000000001");
const TG_B = TG("tg-b-0000000000000000000000000002", { netPrice: 13.36, vatAmount: 2.54, finalPrice: 15.9 });
const TG_DATUM = TG("tg-d-0000000000000000000000000003", { bookable: false, unavailableReason: "date_unavailable" });
const JU = {
  id: 11, shipper_tariff_id: 3307, offerId: "ju-0000000000000000000000000000011",
  publicCarrierId: "dhl", publicCarrierName: "DHL Express", publicServiceName: "Expressversand",
  serviceType: "pickup", netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19, currency: "EUR",
  transitDaysMin: 1, transitDaysMax: 1, trackingAvailable: true, printerRequired: false,
  labelFormatOptions: ["A4", "A6"], labelSizes: ["A4", "A6"],
};

const REPRICE_OK = (body) => ({
  selectedInsurance: "transit_cover",
  insurance: { coverValue: body.coverValue, excessValue: 20, goodsAreNew: body.goodsAreNew,
               goodsAreFragile: body.goodsAreFragile, insuranceGross: 10 },
  totals: { customerShippingNet: 12.34, shippingVat: 2.34, customerShippingGross: 14.68,
            insuranceGross: 10, customerTotalGross: 24.68 },
  tariff: { insuranceAvailable: true, insuranceDetails: COVER_DETAILS },
});

const BELEG = (ordinal, label, labelSize) => ({
  type: "LABEL", category: "SHIPPING", status: "ready", label, ordinal, carrierReference: AWB, labelSize,
  downloadPath: `/api/shipments/${CE_ID}/provider-documents/LABEL/${ordinal}`,
});
const FORMATPAAR = [BELEG(1, "Versandlabel (Thermodruck)", "THERMAL"), BELEG(0, "Versandlabel (A4)", "A4")];

const BUCHUNG = (body, extra = {}) => ({
  message: "Sendung gebucht", ceShipmentId: CE_ID, invoiceNumber: "CE-RE26-00790",
  businessOrderNumber: "CE-BS26-00790", dueDate: null,
  amount: body.insuranceSelection && body.insuranceSelection.type === "transit_cover" ? 24.68 : 14.68,
  billingMode: "single", testBooking: false, voucherCode: null, deliveryNote: null,
  orderConfirmation: { number: AB, issuedAt: "2026-09-11T10:00:00Z" },
  shippingDocuments: FORMATPAAR, ...extra,
});

const SENDUNG = {
  id: CE_ID, status: "booked", weight: 2, price_final: 14.68, selected_carrier: "UPS",
  created_at: "2026-09-11T10:00:00Z", order_number: null, business_order_number: "CE-BS26-00790",
  order_confirmation_number: AB, cancellation_status: null,
  tracking_number: AWB, tracking_references: [AWB], tracking_status: "in_transit",
  service_type: "pickup", requested_shipping_date: ABHOLTAG, applied_tariff_display_name: "Standard",
};
const EV = (status, description, location, date, time) => ({ status, description, location, dateTime: { date, time } });
const LEGS = [{
  carrier: "UPS", trackingReference: AWB, status: "in_transit", carrierTrackingPage: null,
  events: [
    EV("pending", "Versandlabel erstellt", "DE", ABHOLTAG, "08:15:00"),
    EV("in_transit", "Abholung bestätigt in einer sehr langen Ortsbezeichnung ohne Umbruchgelegenheit", "Aschaffenburg-Nilkheim Gewerbegebiet Nord, DE", ABHOLTAG, "10:42:10"),
  ],
}];
const TRACKING = {
  shipmentId: CE_ID, tracking: null, trackingAvailable: true, trackingNumber: AWB,
  trackingReferences: [AWB], trackingStatus: "in_transit", trackingStatusText: "Unterwegs",
  carrier: "UPS", carrierTrackingPage: null, liveTracking: true, source: "live", trackingLegs: LEGS,
};

const DRAFT_FORM_DATA = {
  sender: { company: "Muster GmbH", firstName: "Max", lastName: "Mustermann", streetAndNumber: "Hauptstrasse 1",
            addressAddition: "", postalCode: "10115", city: "Berlin", country: "DE", phone: "+4930123456", email: "max@example.com" },
  recipient: { company: "Empfang AG", firstName: "Erika", lastName: "Empfaenger", streetAndNumber: "Bahnhofstrasse 9",
               addressAddition: "", postalCode: "80331", city: "Muenchen", country: "DE", phone: "+4989987654", email: "erika@example.com" },
  packages: { packageCount: 1, weight: 2, length: 30, width: 20, height: 10 },
  shippingOptions: { shippingDate: "2020-01-02", serviceFilter: "all", shippingModeFilter: "all", publicCarrierIds: [] },
  declarations: { content: "Ersatzteile", goodsValue: 250, collectionIsResidential: false, deliveryIsResidential: true },
};

const VERBOTEN = /transglobal|jumingo|nächste[rn]? Werktag|\[object Object\]/i;

let server, browser;

/* Das Szenario steuert die Antworten: `tarife`, `book(body, n)`, `reprice(body, n)`, `calc(body)`,
   `email`. Eine Antwort ist `{ status, json }`, `{ status, raw }` oder "abort". */
async function setupRoutes(page, protokoll, szenario = {}) {
  const tarife = szenario.tarife || [TG_A];
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    const antwort = (a, fallback) => {
      if (a === "abort") return route.abort("timedout");
      if (a && a.raw !== undefined) return route.fulfill({ status: a.status || 200, contentType: "text/html", body: a.raw });
      if (a) return json(a.json, a.status || 200);
      return fallback();
    };
    protokoll.pfade.push(p);
    if (p.endsWith("/kundenbereich")) return json({ user: USER(szenario.email) });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: szenario.sendungen || [], nextCursor: null });
    if (p.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts/")) {
      return json({ draft: { id: 77, revision: 3, schemaVersion: 1, formData: DRAFT_FORM_DATA, updatedAt: "2026-09-01T10:00:00Z" } });
    }
    if (p.includes("/api/kunde/form-drafts")) {
      const drafts = szenario.entwurf
        ? [{ id: 77, revision: 3, schemaVersion: 1, formData: DRAFT_FORM_DATA, updatedAt: "2026-09-01T10:00:00Z" }] : [];
      return json({ drafts, nextCursor: null });
    }
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/tracking/public/")) {
      protokoll.oeffentlich.push(p);
      return json({ trackingNumber: AWB, trackingStatus: "in_transit", carrier: "UPS", trackingLegs: LEGS });
    }
    if (p.includes("/api/jumingo/calculate-price")) {
      const body = req.postDataJSON();
      protokoll.calc.push(body);
      return antwort(szenario.calc ? szenario.calc(body, protokoll.calc.length) : null, () => {
        const ids = Array.isArray(body.publicCarrierIds) ? body.publicCarrierIds : [];
        return json({
          ceShipmentId: CE_ID,
          tariffs: ids.length > 0 ? tarife.filter((t) => ids.includes(t.publicCarrierId)) : tarife,
          availableShippingModes: ["standard", "express"],
          publicCarriers: [...new Map(tarife.map((t) => [t.publicCarrierId, { id: t.publicCarrierId, name: t.publicCarrierId === "ups" ? "UPS" : "DHL Express" }])).values()],
          customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
        });
      });
    }
    if (p.includes("/api/insurance/reprice")) {
      const body = req.postDataJSON();
      protokoll.reprice.push(body);
      return antwort(szenario.reprice ? szenario.reprice(body, protokoll.reprice.length) : null, () => json(REPRICE_OK(body)));
    }
    if (p === `/api/shipments/${CE_ID}/documents`) return json({ shipmentId: CE_ID, documents: FORMATPAAR });
    if (p === `/api/shipments/${CE_ID}/tracking`) return json(TRACKING);
    if (p.includes("/api/jumingo/book")) {
      const body = req.postDataJSON();
      protokoll.book.push(body);
      return antwort(szenario.book ? szenario.book(body, protokoll.book.length) : null, () => json(BUCHUNG(body)));
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

const neuesProtokoll = () => ({ pfade: [], reprice: [], book: [], calc: [], oeffentlich: [] });
// Beträge stehen mit geschütztem Leerzeichen vor dem Euro-Zeichen — für Vergleiche normalisiert.
const NBSP = new RegExp(String.fromCharCode(160), "g");
const text = async (loc) => (await loc.innerText()).replace(NBSP, " ");
const querUeberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const schalter = (page, id) => page.locator(`#${id}`).locator("xpath=ancestor::label[1]");
const EIN_PAKET = { ...STANDARD_PAKET, packageCount: "1" };

async function neueSeite(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport, acceptDownloads: true });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function zuDenAngeboten(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { paket: EIN_PAKET });
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

async function bestaetigen(page) {
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut
  await checks.nth(0).check();
  await checks.nth(1).check();
}

const buchenKnopf = (page) => page.getByRole("button", { name: /Kostenpflichtig buchen/ });

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

/* ══════════ A — TG-Angebot, Zusatzoptionen, Belege ══════════ */

test("A — 1440: keine Formatauswahl, Lieferhinweis, bereinigte Referenz, Zusatzempfänger, kein labelFormat, A4/Thermodruck", async () => {
  const { page, fehler } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll);
  await zuDenAngeboten(page);
  await waehle(page, TG_A);

  assert.equal(await page.locator("#booking-labelformat-toggle").count(), 0, "ein TG-Angebot bietet eine Formatauswahl an");
  assert.equal(await page.locator('input[name="labelFormat"]').count(), 0);
  assert.equal((await text(page.locator("#booking-label-delivery-info"))).trim(), "Versandlabel verfügbar als DIN A4 und Thermodruck");

  // Referenz mit spitzen Klammern, Richtungs- und Steuerzeichen.
  const z = (n) => String.fromCharCode(n);
  await schalter(page, "booking-reference-toggle").click();
  await page.locator("#booking-reference").fill(`AB<C>${z(0x202e)}D${z(0x200f)}E${z(0x07)}F`);
  assert.equal(await page.locator("#booking-reference").inputValue(), "ABCDEF");

  await schalter(page, "booking-tracking-email-toggle").click();
  await page.locator("#booking-tracking-email-toggle-input").fill("lager@example.com");
  await schalter(page, "booking-label-email-toggle").click();
  await page.locator("#booking-label-email-toggle-input").fill("versand@example.com");

  await zuSchritt2(page);
  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });

  assert.equal(protokoll.book.length, 1);
  const body = protokoll.book[0];
  assert.ok(!("labelFormat" in body), `ein Angebot ohne Formatwahl sendet labelFormat: ${body.labelFormat}`);
  assert.equal(body.referenceNumber, "ABCDEF");
  assert.equal(body.trackingEmail, "lager@example.com");
  assert.equal(body.labelTrackingEmail, "versand@example.com");
  assert.equal(body.offerId, TG_A.offerId);

  const wrap = page.locator(".booking-success-wrap");
  const knoepfe = wrap.getByRole("button", { name: /^Versandlabel.* herunterladen$/ });
  await knoepfe.first().waitFor({ timeout: 15000 });
  assert.deepEqual((await knoepfe.allTextContents()).map((t) => t.trim()),
    ["Versandlabel (A4) herunterladen", "Versandlabel (Thermodruck) herunterladen"]);
  // Gebuchter Betrag = bestätigte Aufstellung → die Aufstellung steht da.
  const recap = await text(page.locator(".booking-success-recap"));
  assert.match(recap, /Gesamtbetrag brutto\s*14,68 €/);
  assert.match(recap, /Versand netto/);
  assert.equal((await text(page.locator("body"))).match(VERBOTEN), null);
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ C/D — 834 und 390 ══════════ */

for (const [name, viewport] of [["834", { width: 834, height: 1112 }], ["390", { width: 390, height: 844 }]]) {
  test(`${name === "834" ? "C" : "D"} — ${name} px: Trefferflächen der Warenfragen, lange E-Mail und Belegknöpfe ohne Überlauf`, async () => {
    const { page, fehler } = await neueSeite(viewport);
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll, { email: LANGE_EMAIL });
    await zuDenAngeboten(page);
    assert.ok(await querUeberlauf(page) <= 0, "Angebote: horizontaler Überlauf");
    await waehle(page, TG_A);
    await zuSchritt2(page);
    await page.locator(`.ins-card:has(input[value="transit_cover"]) .ins-card-name`).click();
    const zeilen = page.locator(".ins-goods-question .ci-mode-option");
    await zeilen.first().waitFor({ timeout: 10000 });
    assert.equal(await zeilen.count(), 4);
    for (let i = 0; i < 4; i++) {
      const box = await zeilen.nth(i).boundingBox();
      assert.ok(box && box.height >= 44, `Warenfrage ${i}: ${box && box.height} px hoch`);
    }
    await page.locator("#ins-goodsAreNew-ja").check();
    await page.locator("#ins-goodsAreFragile-nein").check();
    await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
    assert.ok(await querUeberlauf(page) <= 0, "Buchung: horizontaler Überlauf");
    await bestaetigen(page);
    await buchenKnopf(page).click();
    await page.waitForSelector(".booking-success-title", { timeout: 20000 });
    await page.locator(".booking-success-wrap").getByRole("button", { name: /^Versandlabel.* herunterladen$/ }).first().waitFor({ timeout: 15000 });

    assert.ok(await querUeberlauf(page) <= 0, "Erfolg: horizontaler Überlauf");
    const breite = viewport.width;
    const knoepfe = page.locator(".booking-success-wrap button");
    for (let i = 0; i < await knoepfe.count(); i++) {
      const box = await knoepfe.nth(i).boundingBox();
      if (box) assert.ok(box.x >= 0 && box.x + box.width <= breite + 1, `Knopf ${i} läuft aus dem Bild (${box.x + box.width} > ${breite})`);
    }
    const mailZeileLaeuftAus = await page.evaluate(() =>
      [...document.querySelectorAll(".booking-success-delivery p")].some((p) => p.scrollWidth > p.clientWidth + 1));
    assert.equal(mailZeileLaeuftAus, false, "die lange E-Mail-Adresse läuft aus ihrer Zeile");
    assert.match(await text(page.locator(".booking-success-delivery")), /sehr\.lange\.adresse/);
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

/* ══════════ I — JUMiNGO unverändert ══════════ */

test("I — JUMiNGO-Angebot: A4/A6-Auswahl wie bisher, A6 im Payload, kein Lieferhinweis", async () => {
  const { page, fehler } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, { tarife: [JU] });
  await zuDenAngeboten(page);
  await waehle(page, JU);
  assert.equal(await page.locator("#booking-label-delivery-info").count(), 0);
  await schalter(page, "booking-labelformat-toggle").click();
  const formate = page.locator('input[name="labelFormat"]');
  // Die Radioeingaben sind optisch ersetzt (eigene Auswahlkarte) — vorhanden, nicht sichtbar.
  await formate.first().waitFor({ state: "attached", timeout: 10000 });
  assert.deepEqual(await formate.evaluateAll((els) => els.map((e) => e.value)), ["A4", "A6"]);
  await page.locator('input[name="labelFormat"][value="A6"]').locator("xpath=ancestor::label[1]").click();
  await zuSchritt2(page);
  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(protokoll.book[0].labelFormat, "A6");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ J — gemischte Angebote ══════════ */

test("J — gemischt: beide Anbieter, Abholdatum als Sperrgrund mit Hinweis, Carrierfilter geht an den Server", async () => {
  const { page, fehler } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, { tarife: [TG_A, JU, TG_DATUM] });
  await zuDenAngeboten(page);
  assert.equal(await page.locator(".offer-card").count(), 3);
  const datumKarte = karteVon(page, TG_DATUM);
  const cta = datumKarte.locator("button.offer-cta-btn");
  assert.equal(await cta.isDisabled(), true);
  assert.equal((await cta.innerText()).trim(), "Für dieses Abholdatum nicht verfügbar.");
  assert.equal((await datumKarte.locator(".offer-cta-hint").innerText()).trim(), "Bitte wählen Sie einen anderen Abholtermin.");
  assert.equal(await karteVon(page, JU).locator(".offer-cta-hint").count(), 0);
  assert.equal((await text(page.locator("body"))).match(VERBOTEN), null);

  await page.locator(".service-filter-trigger", { hasText: "Versanddienst" }).click();
  await page.locator(".carrier-dropdown").getByRole("checkbox", { name: "UPS" }).click();
  await page.keyboard.press("Escape");
  const anzahlVorher = protokoll.calc.length;
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForFunction((n) => document.querySelectorAll(".offer-card").length === n, 2, { timeout: 20000 });
  assert.ok(protokoll.calc.length > anzahlVorher);
  assert.deepEqual(protokoll.calc.at(-1).publicCarrierIds, ["ups"]);
  assert.equal(await karteVon(page, JU).count(), 0, "der Carrierfilter ließ ein fremdes Angebot stehen");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ K/L — Absicherung gehört zu einem Angebot ══════════ */

test("K/L — Absicherung an A; B startet neutral ohne Neubepreisung; zurück zu A stellt sie wieder her", async () => {
  const { page, fehler } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, { tarife: [TG_A, TG_B] });
  await zuDenAngeboten(page);
  await waehle(page, TG_A);
  await zuSchritt2(page);
  await absichern(page);
  assert.ok(protokoll.reprice.length >= 1);
  assert.equal(protokoll.reprice.at(-1).offerId, TG_A.offerId);

  // Zurück zum Vergleich, Angebot B.
  await page.getByRole("button", { name: "← Zurück zur Übersicht" }).click();
  await page.getByRole("button", { name: "← Zurück", exact: true }).click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await waehle(page, TG_B);
  const nachB = protokoll.reprice.length;
  assert.equal(await page.locator(".ins-cards").count(), 0, "B startet nicht bei Schritt 1");
  await zuSchritt2(page);
  await kurz(1200);
  assert.equal(await page.locator('.ins-card input[value="none"]').isChecked(), true, "B übernimmt die Absicherung von A");
  assert.equal(await page.locator('.ins-card input[value="transit_cover"]').isChecked(), false);
  assert.equal(await page.locator("#ins-goodsAreNew-ja").count(), 0, "die Antworten von A stehen an B");
  assert.equal(protokoll.reprice.length, nachB, "B hat beim Öffnen neu bepreist");

  // Zurück zu A: derselbe Stand, und ein autoritativer Preis vor der Buchung.
  await page.getByRole("button", { name: "← Zurück zur Übersicht" }).click();
  await page.getByRole("button", { name: "← Zurück", exact: true }).click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await waehle(page, TG_A);
  await zuSchritt2(page);
  // Kein erneutes Absichern: B war zuletzt gespiegelt, A trägt deshalb keinen passenden Schlüssel mehr.
  // Genau das ist die Regel — der Schlüssel des ZULETZT gespiegelten Angebots entscheidet.
  assert.equal(await page.locator('.ins-card input[value="none"]').isChecked(), true);
  await absichern(page);
  await page.getByRole("button", { name: "← Zurück zur Übersicht" }).click();
  await page.getByRole("button", { name: "← Zurück", exact: true }).click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  const vorRueckkehr = protokoll.reprice.length;
  await waehle(page, TG_A);
  await zuSchritt2(page);
  assert.equal(await page.locator('.ins-card input[value="transit_cover"]').isChecked(), true, "dasselbe Angebot verlor seine Absicherung");
  assert.equal(await page.locator("#ins-goodsAreNew-ja").isChecked(), true);
  assert.equal(await page.locator("#ins-goodsAreFragile-nein").isChecked(), true);
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  assert.ok(protokoll.reprice.length > vorRueckkehr, "der wiederhergestellte Stand wurde nicht autoritativ bepreist");
  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(protokoll.book.at(-1).insuranceSelection.type, "transit_cover");
  assert.equal(protokoll.book.at(-1).offerId, TG_A.offerId);
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ M — Entwurf mit vergangenem Datum ══════════ */

test("M — Entwurf mit vergangenem Datum: leer, erklärt, keine Berechnung bis zur bewussten Wahl", async () => {
  const { page, fehler } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, { entwurf: true });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await ueberSidebar(page, "Entwürfe");
  await page.waitForSelector("text=Fortsetzen", { timeout: 20000 });
  await page.getByRole("button", { name: /Fortsetzen/ }).first().click();
  await page.waitForSelector("button:has-text('Angebote vergleichen')", { timeout: 20000 });

  const trigger = page.locator(".service-filter-trigger", { hasText: "Versanddatum" });
  assert.match(await text(trigger), /Bitte Datum wählen/);
  assert.match(await text(page.locator("body")), /Versanddatum liegt in der Vergangenheit/);
  await page.locator("#ns-date-missing").waitFor({ timeout: 5000 });
  const cta = page.locator(".offers-calc-cta button").first();
  assert.equal(await cta.isDisabled(), true, "ohne Datum ist der CTA bedienbar");
  assert.equal(protokoll.calc.length, 0);

  await trigger.click();
  // `exact`: „Morgen" steckt auch in „Übermorgen".
  await page.locator(".date-picker-body").getByRole("button", { name: "Morgen", exact: true }).click();
  const morgen = await page.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  assert.equal(await page.locator("#ns-date-missing").count(), 0);
  assert.equal(await cta.isDisabled(), false);
  await cta.click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(protokoll.calc.length, 1);
  assert.equal(protokoll.calc[0].shippingDate, morgen);
  assert.notEqual(protokoll.calc[0].shippingDate, "2020-01-02");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ N — Mobile Sendungsverfolgung ══════════ */

for (const [name, viewport] of [["390", { width: 390, height: 844 }], ["834", { width: 834, height: 1112 }]]) {
  test(`N — ${name} px: „Sendung verfolgen" zeigt den Stand in der Karte`, async () => {
    const { page, fehler } = await neueSeite(viewport);
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll, { sendungen: [SENDUNG] });
    await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
    const karte = page.locator(".ce-list-card", { hasText: AB }).first();
    await karte.waitFor({ timeout: 20000 });
    const knopf = karte.getByRole("button", { name: "Sendung verfolgen" });
    assert.equal(await knopf.getAttribute("aria-expanded"), "false");
    await knopf.click();
    await karte.locator(".shipment-card-tracking .track-event").first().waitFor({ timeout: 15000 });
    assert.equal(await knopf.getAttribute("aria-expanded"), "true");
    assert.ok(protokoll.pfade.includes(`/api/shipments/${CE_ID}/tracking`));
    assert.deepEqual((await karte.locator(".track-title").allTextContents()).map((t) => t.trim()),
      ["Versandlabel erstellt", LEGS[0].events[1].description]);
    assert.match(await text(karte.locator(".shipment-track-number")), new RegExp(AWB));
    assert.ok(await querUeberlauf(page) <= 0, "Sendungen: horizontaler Überlauf");
    const laeuftAus = await karte.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    assert.equal(laeuftAus, false, "die Trackingansicht läuft aus der Karte");
    await knopf.click();
    assert.equal(await karte.locator(".shipment-card-tracking").count(), 0);
    assert.equal(await knopf.getAttribute("aria-expanded"), "false");
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

/* ══════════ O — öffentliche Sendungsverfolgung ══════════ */

test("O — öffentliche Sendungsverfolgung: der Klick sucht die eingegebene Nummer", async () => {
  const { page, fehler } = await neueSeite({ width: 1280, height: 900 });
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll);
  await page.goto(`${BASE}/tracking`, { waitUntil: "domcontentloaded" });
  const feld = page.locator(".tracking-page-wrap input.field-input");
  await feld.waitFor({ timeout: 20000 });
  await feld.fill(AWB);
  await page.getByRole("button", { name: /Verfolgen/ }).click();
  await page.waitForSelector(".track-event", { timeout: 15000 });
  assert.deepEqual(protokoll.oeffentlich, [`/api/tracking/public/${AWB}`]);
  assert.equal((await text(page.locator("body"))).match(VERBOTEN), null);
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ P — Erfolgsbetrag vom Server ══════════ */

test("P — Erfolg: abweichender Serverbetrag ohne Aufstellung; fehlender Betrag nur mit Hinweis", async () => {
  for (const [fall, extra] of [["abweichend", { amount: 16.11 }], ["fehlt", { amount: null }]]) {
    const { page, fehler } = await neueSeite();
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll, { book: (body) => ({ json: BUCHUNG(body, extra) }) });
    await zuDenAngeboten(page);
    await waehle(page, TG_A);
    await zuSchritt2(page);
    await bestaetigen(page);
    await buchenKnopf(page).click();
    await page.waitForSelector(".booking-success-title", { timeout: 20000 });
    const recap = await text(page.locator(".booking-success-recap"));
    assert.ok(!/Versand netto/.test(recap), `${fall}: die Aufstellung der Buchungsseite steht da: ${recap}`);
    assert.ok(!/14,68 €/.test(recap), `${fall}: der Angebotspreis steht als Betrag da`);
    if (fall === "abweichend") {
      assert.match(await text(page.locator("#booking-success-amount")), /Gesamtbetrag brutto\s*16,11 €/);
    } else {
      assert.equal(await page.locator("#booking-success-amount").count(), 0);
      assert.match(await text(page.locator("#booking-success-amount-hint")), /Auftragsbestätigung/);
      assert.ok(!/€/.test(recap), `ohne Serverbetrag steht ein Betrag da: ${recap}`);
    }
    assert.deepEqual(fehler, []);
    await page.close();
  }
});

/* ══════════ Q — offener Ausgang ══════════ */

test("Q — Abbruch, 5xx ohne Code und unlesbarer Erfolg: offener Ausgang, kein Bestellknopf, Weg in die Sendungen", async () => {
  const faelle = [
    ["Zeitlimit/Abbruch", () => "abort"],
    ["504 ohne Code", () => ({ status: 504, raw: "<html>Gateway Timeout</html>" })],
    ["500 ohne Code", () => ({ status: 500, json: { error: "Interner Fehler" } })],
    ["200 unlesbar", () => ({ status: 200, raw: "<html>ok</html>" })],
  ];
  for (const [name, book] of faelle) {
    const { page, fehler } = await neueSeite();
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll, { book });
    await zuDenAngeboten(page);
    await waehle(page, TG_A);
    await zuSchritt2(page);
    await bestaetigen(page);
    await buchenKnopf(page).click();
    const box = page.locator(".booking-conflict-box");
    await box.waitFor({ timeout: 20000 });
    const t = await text(box);
    assert.match(t, /NICHT erneut/, `${name}: ${t}`);
    assert.ok(!/versuchen Sie (es|die Buchung) erneut/i.test(t), `${name}: Wiederholungsaufforderung`);
    assert.equal(await buchenKnopf(page).count(), 0, `${name}: der Bestellknopf steht noch da`);
    assert.equal(await box.getByRole("button", { name: "Zu meinen Sendungen" }).count(), 1);
    assert.equal(await page.locator(".booking-success-title").count(), 0);
    assert.equal(protokoll.book.length, 1, `${name}: es wurde erneut gebucht`);
    assert.deepEqual(fehler, []);
    await page.close();
  }
});

/* ══════════ R — Unternehmensprofil unvollständig ══════════ */

test("R — 422 BUSINESS_PROFILE_INCOMPLETE bei Buchung und Preisberechnung: Profilweg, keine Abmeldung", async () => {
  const PROFIL = { status: 422, json: { error: "Profil unvollständig", code: "BUSINESS_PROFILE_INCOMPLETE" } };
  {
    const { page, fehler } = await neueSeite();
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll, { book: () => PROFIL });
    await zuDenAngeboten(page);
    await waehle(page, TG_A);
    await zuSchritt2(page);
    await bestaetigen(page);
    await buchenKnopf(page).click();
    const hinweis = page.locator("#booking-profile-incomplete");
    await hinweis.waitFor({ timeout: 20000 });
    assert.match(await text(hinweis), /Unternehmensprofil/);
    assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), "e2e-token", "der Kunde wurde abgemeldet");
    assert.equal(await buchenKnopf(page).count(), 1, "der Bestellknopf verschwand");
    assert.ok(!/login|anmelden/i.test(page.url()));
    await hinweis.getByRole("button", { name: "Unternehmensprofil vervollständigen" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), "e2e-token");
    assert.deepEqual(fehler, []);
    await page.close();
  }
  {
    const { page, fehler } = await neueSeite();
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll, { calc: () => PROFIL });
    await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".offers-form-section", { timeout: 20000 });
    await fuelleVersandformular(page, { paket: EIN_PAKET });
    await page.locator(".offers-calc-cta button").first().click();
    const hinweis = page.locator("#ns-profile-incomplete");
    await hinweis.waitFor({ timeout: 20000 });
    assert.match(await text(page.locator(".offers-calc-cta")), /Unternehmensprofil/);
    assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), "e2e-token", "der Kunde wurde abgemeldet");
    assert.equal(await page.locator(".offer-card").count(), 0);
    assert.deepEqual(fehler, []);
    await page.close();
  }
});

/* ══════════ S/T — versicherter 409 ohne Code und Vertragscodes ══════════ */

test("S — versicherter 409 ohne Code: dieselbe Neubepreisung läuft, keine zweite Buchung", async () => {
  const { page, fehler } = await neueSeite();
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, {
    book: (_b, n) => (n === 1 ? { status: 409, json: { error: "Der Preis hat sich geändert." } } : null),
  });
  await zuDenAngeboten(page);
  await waehle(page, TG_A);
  await zuSchritt2(page);
  await absichern(page);
  await bestaetigen(page);
  const vorher = protokoll.reprice.length;
  await buchenKnopf(page).click();
  const frist = Date.now() + 10000;
  while (protokoll.reprice.length === vorher && Date.now() < frist) await kurz(100);
  assert.ok(protokoll.reprice.length > vorher, "der 409 ohne Code bepreiste nicht neu");
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  assert.equal(protokoll.book.length, 1, "es wurde automatisch erneut gebucht");
  assert.equal(await buchenKnopf(page).isEnabled(), true, "nach der Neubepreisung bleibt der Knopf gesperrt");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("T — Vertragscodes: Abholtag fehlt, Format unbekannt, Referenz ungültig, Angebot verbraucht", async () => {
  // COLLECTION_DATE_MISSING bei versicherter Buchung: Neuberechnung, keine Neubepreisungsschleife.
  {
    const { page, fehler } = await neueSeite();
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll, { book: () => ({ status: 409, json: { error: "x", code: "COLLECTION_DATE_MISSING" } }) });
    await zuDenAngeboten(page);
    await waehle(page, TG_A);
    await zuSchritt2(page);
    await absichern(page);
    await bestaetigen(page);
    const vorher = protokoll.reprice.length;
    await buchenKnopf(page).click();
    const box = page.locator(".booking-conflict-box");
    await box.waitFor({ timeout: 20000 });
    assert.equal(await box.getByRole("button", { name: "Angebote neu berechnen" }).count(), 1);
    await kurz(1200);
    assert.equal(protokoll.reprice.length, vorher, "COLLECTION_DATE_MISSING löste eine Neubepreisung aus");
    assert.deepEqual(fehler, []);
    await page.close();
  }
  // LABEL_FORMAT_NOT_SUPPORTED (JUMiNGO): neutrale Neuberechnung ohne Formatnamen.
  {
    const { page, fehler } = await neueSeite();
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll, { tarife: [JU],
      book: () => ({ status: 400, json: { error: "labelFormat not supported", code: "LABEL_FORMAT_NOT_SUPPORTED", field: "labelFormat" } }) });
    await zuDenAngeboten(page);
    await waehle(page, JU);
    await zuSchritt2(page);
    await bestaetigen(page);
    await buchenKnopf(page).click();
    const box = page.locator(".booking-conflict-box");
    await box.waitFor({ timeout: 20000 });
    const t = await text(box);
    assert.match(t, /neu berechnen/);
    assert.ok(!/labelFormat|not supported/i.test(t), t);
    assert.deepEqual(fehler, []);
    await page.close();
  }
  // INVALID_REFERENCE_NUMBER: Feldfehler an der Referenz, zurück zu Schritt 1.
  {
    const { page, fehler } = await neueSeite();
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll, {
      book: () => ({ status: 400, json: { error: "referenceNumber invalid", code: "INVALID_REFERENCE_NUMBER", field: "referenceNumber" } }) });
    await zuDenAngeboten(page);
    await waehle(page, TG_A);
    await schalter(page, "booking-reference-toggle").click();
    await page.locator("#booking-reference").fill("REF-4711");
    await zuSchritt2(page);
    await bestaetigen(page);
    await buchenKnopf(page).click();
    await page.locator("#booking-reference-error").waitFor({ timeout: 20000 });
    assert.equal(await page.locator("#booking-reference").getAttribute("aria-invalid"), "true");
    assert.ok(!/referenceNumber invalid/.test(await text(page.locator("body"))));
    assert.deepEqual(fehler, []);
    await page.close();
  }
  // OFFER_ALREADY_USED bei der Neubepreisung: Konflikt mit Weg in die Sendungen, keine Buchung.
  {
    const { page, fehler } = await neueSeite();
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll, { reprice: () => ({ status: 409, json: { error: "x", code: "OFFER_ALREADY_USED" } }) });
    await zuDenAngeboten(page);
    await waehle(page, TG_A);
    await zuSchritt2(page);
    await page.locator(`.ins-card:has(input[value="transit_cover"]) .ins-card-name`).click();
    await page.locator("#ins-goodsAreNew-ja").check();
    await page.locator("#ins-goodsAreFragile-nein").check();
    const box = page.locator(".booking-conflict-box");
    await box.waitFor({ timeout: 20000 });
    assert.match(await text(box), /Dieses Angebot wurde bereits verwendet\. Bitte prüfen Sie Ihre Sendungen\./);
    assert.equal(await box.getByRole("button", { name: "Zu meinen Sendungen" }).count(), 1);
    assert.equal(await buchenKnopf(page).count(), 0);
    assert.equal(protokoll.book.length, 0);
    assert.deepEqual(fehler, []);
    await page.close();
  }
});
