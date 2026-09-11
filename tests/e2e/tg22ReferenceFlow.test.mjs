// E2E: der erste buchbare Referenzservice (TG-22) im gemeinsamen Kundenflow — echter
// Dev-Server, echter Browser, gemocktes Backend.
//
// ─── Die Angebotsform ────────────────────────────────────────────────────────
// Ein Abholangebot in genau der Feldmenge der Allowlist-Projektion des Backends: KEINE `id`,
// KEINE `shipper_tariff_id`, ein Abholvertrag aus Tag und „bereit ab"-Zeit (kein Fenster),
// Fähigkeiten `trackingAvailable`/`printerRequired`, Einschränkung „max. 1 Packstück",
// Labelformate A4/Thermal und die zusätzliche Transportabsicherung.
//
// Gemessen wird, was eine Quelltextprüfung nicht erreicht:
//   • die Karte zeigt Carrier, Service, Laufzeit, Abholung, Preis, Tracking, Drucker und Label
//     und ist buchbar — derselbe Abholvertrag in Timeline und Details,
//   • Buchung ohne und mit Transportabsicherung über die Angebotskennung, ohne Tarifkennung,
//     ohne JUMiNGO-only-Endpunkt und ohne Gutscheinfeld,
//   • der Erfolgsbildschirm bietet die zwei Formatvarianten mit Servernamen an — ohne „1 von 2",
//   • „Meine Sendungen" zeigt den gebuchten Service, und das Tracking kommt aus den Abschnitten,
//   • dasselbe Angebot auf einer Route, die nicht buchbar freigegeben ist, bleibt gesperrt,
//   • auf 390 px läuft nichts aus dem Bild, und nirgends steht eine Einkaufsquelle.
//
// Kein echtes Backend, keine Bestellung, keine Neubepreisung beim Anbieter, kein Tracking-Abruf.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  fuelleVersandformular, STANDARD_PAKET, STANDARD_EMPFAENGER, STANDARD_SENDUNGSANGABEN,
} from "./helpers/newShipmentForm.mjs";

const PORT = 5376, BASE = `http://127.0.0.1:${PORT}`;
const CE_SHIPMENT_ID = 4722;
const AB_NUMMER = "CE-AB26-00022";
const AWB = "1Z999AA10000000022";
const PDF = Buffer.from("%PDF-1.4\n% Testbeleg\n%%EOF\n", "utf8");

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// Ein Abholtag in der Zukunft — nie „heute": eine Abholung am selben Tag ist nicht buchbar freigegeben.
const ABHOLTAG = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const ABHOLTAG_DE = ABHOLTAG.split("-").reverse().join(".");

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const COVER_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
};
const OFFER_ID_DE = "22de0000000000000000000000000022";
const OFFER_ID_EU = "22eu0000000000000000000000000022";

const TARIF_22 = {
  offerId: OFFER_ID_DE, publicCarrierId: "ups", publicServiceName: "Standard",
  serviceType: "pickup", collectionDate: ABHOLTAG, collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  netPrice: 12.34, vatAmount: 2.34, finalPrice: 14.68, currency: "EUR",
  bookable: true, unavailableReason: null, priceCompleteness: "complete",
  requiredPriceInputs: ["deliveryIsResidential", "collectionIsResidential"],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"],
  insuranceAvailable: true, insuranceDetails: COVER_DETAILS,
  trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }],
};
// Derselbe Service auf einer Route, deren Buchung nicht freigegeben ist: gleiche Fähigkeiten,
// aber nur Preisauskunft.
const TARIF_22_EU = {
  ...TARIF_22, offerId: OFFER_ID_EU,
  bookable: false, unavailableReason: "quote_only", insuranceAvailable: false, insuranceDetails: null,
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
  downloadPath: `/api/shipments/${CE_SHIPMENT_ID}/provider-documents/LABEL/${ordinal}`,
});
// Bewusst Thermodruck zuerst — die Reihenfolge der Knöpfe darf nicht an der Antwort hängen.
const FORMATPAAR = [BELEG(1, "Versandlabel (Thermodruck)", "THERMAL"), BELEG(0, "Versandlabel (A4)", "A4")];
const DATEINAME = { 0: `Versandlabel-${AB_NUMMER}-A4.pdf`, 1: `Versandlabel-${AB_NUMMER}-Thermodruck.pdf` };

const SENDUNG = {
  id: CE_SHIPMENT_ID, status: "booked", weight: 2, price_final: 14.68, selected_carrier: "UPS",
  created_at: "2026-09-11T10:00:00Z", order_number: null, business_order_number: "CE-BS26-00022",
  order_confirmation_number: AB_NUMMER, cancellation_status: null,
  tracking_number: AWB, tracking_references: [AWB], tracking_status: "in_transit",
  service_type: "pickup", requested_shipping_date: ABHOLTAG, applied_tariff_display_name: "Standard",
};

// Neutraler Kundenvertrag (TG22 Paket A): kein Eventcode, kein Rohdatum, keine Leg-Rolle.
const EV = (status, description, location, date, time) =>
  ({ status, description, location, dateTime: { date, time } });
const TRACKING = {
  shipmentId: CE_SHIPMENT_ID, tracking: null, trackingAvailable: true, trackingNumber: AWB,
  trackingReferences: [AWB], trackingStatus: "in_transit", trackingStatusText: "Abholung bestätigt",
  carrier: "UPS", carrierTrackingPage: null, liveTracking: true, source: "live",
  trackingLegs: [{
    carrier: "UPS", trackingReference: AWB, status: "in_transit",
    carrierTrackingPage: null,
    events: [
      EV("pending", "Versandlabel erstellt", "DE", ABHOLTAG, "08:15:00"),
      EV("in_transit", "Abholung bestätigt", "Aschaffenburg, DE", ABHOLTAG, "10:42:10"),
    ],
  }],
};

// Endpunkte, die ausschließlich den JUMiNGO-Entwurf betreffen. Dieses Angebot darf keinen davon auslösen.
const JUMINGO_ONLY = [/\/pickup-window/, /\/cart-total/, /\/commercial-invoice/];
// Keine Einkaufsquelle, keine Providerreferenz, kein Anbieterrechnungstext, keine erfundene Zählung.
const VERBOTEN = /transglobal|jumingo|DE005\d{4}|INV-\d{5}|Enhanced Transit Liability|\d von 2/i;

let server, browser;

async function setupRoutes(page, protokoll, { tarif = TARIF_22 } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    protokoll.pfade.push(p);

    const beleg = /^\/api\/shipments\/\d+\/provider-documents\/LABEL\/(\d)$/.exec(p);
    if (beleg) {
      return route.fulfill({ status: 200, body: PDF, headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${DATEINAME[beleg[1]]}"`,
        "access-control-expose-headers": "Content-Disposition",
      } });
    }
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    // Legal-Buchungsschranke abgeschaltet beantwortet — ohne Antwort sperrte der Sammelfall
    // die Bestellung fail closed (siehe legalBookingGate.test.mjs).
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: protokoll.book.length > 0 ? [SENDUNG] : [], nextCursor: null });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (JUMINGO_ONLY.some((re) => re.test(p))) return json({ error: "nicht erwartet" }, 404);
    if (p.includes("/api/jumingo/calculate-price")) return json({
      ceShipmentId: CE_SHIPMENT_ID,
      tariffs: [tarif], availableShippingModes: [],
      publicCarriers: [{ id: "ups", name: "UPS" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: tarif === TARIF_22 ? "DE" : "AT",
      exportDeclaration: null,
    });
    if (p.includes("/api/insurance/reprice")) {
      const body = req.postDataJSON();
      protokoll.reprice.push(body);
      return json(REPRICE_OK(body));
    }
    if (p === `/api/shipments/${CE_SHIPMENT_ID}/documents`) {
      return json({ shipmentId: CE_SHIPMENT_ID, documents: FORMATPAAR });
    }
    if (p === `/api/shipments/${CE_SHIPMENT_ID}/tracking`) return json(TRACKING);
    if (p.includes("/api/jumingo/book")) {
      const body = req.postDataJSON();
      protokoll.book.push(body);
      return json({
        message: "Sendung gebucht", ceShipmentId: CE_SHIPMENT_ID, invoiceNumber: "CE-RE26-00022",
        businessOrderNumber: "CE-BS26-00022", dueDate: null,
        amount: body.insuranceSelection ? 24.68 : 14.68, billingMode: "single",
        testBooking: false, voucherCode: null, deliveryNote: null,
        orderConfirmation: { number: AB_NUMMER, issuedAt: "2026-09-11T10:00:00Z" },
        shippingDocuments: FORMATPAAR,
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

const neuesProtokoll = () => ({ pfade: [], reprice: [], book: [] });
const karte = (page, id) => page.locator(`.ins-card:has(input[value="${id}"])`);

async function sichtbarerText(page) {
  return (await page.evaluate(() => document.body.innerText)).replace(/ /g, " ");
}

async function querUeberlauf(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// Ein Packstück — der Referenzservice ist ein Einzelstücktarif.
const EIN_PAKET = { ...STANDARD_PAKET, packageCount: "1" };

async function zuDenAngeboten(page, { empfaenger = STANDARD_EMPFAENGER } = {}) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { paket: EIN_PAKET, empfaenger });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

async function zurBuchungsseite(page) {
  const buchbar = page.locator(".offer-card:not(.offer-card--unavailable)");
  assert.equal(await buchbar.count(), 1, "das Referenzangebot ist nicht buchbar dargestellt");
  await buchbar.first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  if (await page.locator(".ins-cards").count() === 0) {
    await page.getByRole("button", { name: /^Weiter/ }).first().click();
  }
  await page.waitForSelector(".ins-cards", { timeout: 20000 });
}

async function buchen(page) {
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
}

async function pruefeErfolgsbelege(page, protokoll) {
  const wrap = page.locator(".booking-success-wrap");
  const knoepfe = wrap.getByRole("button", { name: /^Versandlabel.* herunterladen$/ });
  await knoepfe.first().waitFor({ timeout: 15000 });
  assert.deepEqual((await knoepfe.allTextContents()).map((t) => t.trim()),
    ["Versandlabel (A4) herunterladen", "Versandlabel (Thermodruck) herunterladen"]);
  assert.equal(await wrap.getByRole("button", { name: "Label herunterladen" }).count(), 0,
    "zusätzlich steht der Einzelknopf des ersten Labels da");
  assert.match(await wrap.innerText(), /UPS — Standard/);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    wrap.getByRole("button", { name: "Versandlabel (Thermodruck) herunterladen" }).click(),
  ]);
  assert.ok(protokoll.pfade.includes(`/api/shipments/${CE_SHIPMENT_ID}/provider-documents/LABEL/1`),
    "der Thermodruck-Beleg wurde nicht über seinen Serverpfad geladen");
  assert.equal(download.suggestedFilename(), DATEINAME[1]);
  assert.ok(!protokoll.pfade.some((p) => /\/label$/.test(p)), "der Sammelpfad des ersten Labels wurde angesprochen");
}

async function keineEinkaufsquelle(page, wo) {
  const text = await sichtbarerText(page);
  const treffer = text.match(VERBOTEN);
  assert.equal(treffer, null, `${wo}: unzulässiger Text „${treffer && treffer[0]}"`);
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

for (const [name, viewport] of [["Desktop 1440", { width: 1440, height: 1000 }], ["Mobil 390", { width: 390, height: 844 }]]) {
  test(`A — ${name}: Karte, Buchung ohne Absicherung, beide Labelformate, Sendungen`, async () => {
    const mobil = viewport.width < 768;
    const page = await browser.newPage({ viewport, acceptDownloads: true });
    const fehler = [];
    page.on("pageerror", (e) => fehler.push(String(e)));
    const protokoll = neuesProtokoll();
    await setupRoutes(page, protokoll);

    await zuDenAngeboten(page);
    const angebot = page.locator(".offer-card").first();
    const kartentext = (await angebot.innerText()).replace(/ /g, " ");
    // Der Preis steht in der Standardansicht netto — derselbe Umschalter wie für jedes Angebot.
    for (const erwartet of ["UPS", "Standard", "1–2 Tage", "Abholung", "bereit ab 09:00 Uhr",
                            "12,34 €", "exkl. MwSt.", "Sendungsverfolgung", "Drucker erforderlich"]) {
      assert.ok(kartentext.includes(erwartet), `die Karte zeigt „${erwartet}" nicht: ${kartentext}`);
    }
    assert.equal(await angebot.locator("button.offer-cta-btn").isEnabled(), true, "der CTA ist gesperrt");
    assert.equal(await angebot.locator(".ps-trigger").count(), 0, "ein Abholangebot bietet die Paketshop-Suche an");
    if (mobil) assert.ok(await querUeberlauf(page) <= 0, "Angebotsliste: horizontaler Überlauf");

    // Details: derselbe Abholvertrag wie in der Timeline, dazu Label, Einschränkung, Absicherung.
    await angebot.locator(".offer-details-link").click();
    const details = angebot.locator(".offer-details-panel--open");
    await details.waitFor({ timeout: 10000 });
    const detailtext = (await details.innerText()).replace(/ /g, " ");
    // Abschnittsüberschriften setzt das Stylesheet in Versalien — verglichen wird deshalb ohne
    // Rücksicht auf Groß-/Kleinschreibung.
    const detailKlein = detailtext.toLowerCase();
    for (const erwartet of ["Termin & Abholung", "Abholtermin", ABHOLTAG_DE, "bereit ab 09:00 Uhr",
                            "Verfügbare Labelformate", "PDF · A4 / Thermal",
                            "Mit diesem Versandtarif kann max. 1 Packstück pro Sendung verschickt werden.",
                            "Zusätzliche Transportabsicherung"]) {
      assert.ok(detailKlein.includes(erwartet.toLowerCase()), `die Details zeigen „${erwartet}" nicht: ${detailtext}`);
    }
    const terminAbschnitt = detailKlein.slice(detailKlein.indexOf("termin & abholung"));
    assert.ok(terminAbschnitt.includes("bereit ab 09:00 uhr"), "der Detailbereich zeigt die bereit-ab-Zeit nicht");
    assert.ok(!/\bbis\b|–/.test(terminAbschnitt.slice(0, terminAbschnitt.indexOf("preisaufschlüsselung"))),
      "aus der bereit-ab-Zeit wurde ein Zeitfenster");

    await zurBuchungsseite(page);
    const buchungstext = await sichtbarerText(page);
    assert.ok(buchungstext.includes("Standard"), "die Buchungsseite nennt den Service nicht");
    assert.ok(buchungstext.includes("bereit ab 09:00 Uhr"), "die Buchungsseite nennt die Abholzeit nicht");
    assert.equal(await page.locator(".booking-voucher").count(), 0,
      "ein Gutscheinfeld steht an einem Angebot ohne Tarifkennung");
    if (mobil) assert.ok(await querUeberlauf(page) <= 0, "Buchungsseite: horizontaler Überlauf");

    await buchen(page);
    assert.equal(protokoll.book.length, 1, "genau eine Buchungsanfrage");
    const body = protokoll.book[0];
    assert.equal(body.offerId, OFFER_ID_DE);
    assert.ok(!("shipmentId" in body), "die Buchung sendet eine JUMiNGO-Referenz");
    assert.equal(body.ceShipmentId, CE_SHIPMENT_ID, "die Buchung trägt nicht den CE-Sendungshandle");
    assert.equal(body.tariffId ?? null, null, "die Buchung sendet eine Tarifkennung");
    assert.equal(body.shipperTariffId ?? null, null, "die Buchung sendet eine Tarifkennung");
    // Ohne Wahl sendet das Cover-Modell ausdrücklich „keine Absicherung" — nie eine Deckung.
    assert.ok(!body.insuranceSelection || body.insuranceSelection.type === "none",
      `ohne Wahl wurde eine Absicherung gesendet: ${JSON.stringify(body.insuranceSelection)}`);
    assert.equal(body.voucherCode ?? null, null);
    assert.equal(body.priceInputs.collectionIsResidential, STANDARD_SENDUNGSANGABEN.collectionIsResidential);
    assert.equal(body.priceInputs.deliveryIsResidential, STANDARD_SENDUNGSANGABEN.deliveryIsResidential);

    await pruefeErfolgsbelege(page, protokoll);
    await keineEinkaufsquelle(page, "Erfolgsbildschirm");
    if (mobil) assert.ok(await querUeberlauf(page) <= 0, "Erfolgsbildschirm: horizontaler Überlauf");

    // „Meine Sendungen": der gebuchte Service, und am Desktop das Tracking aus den Abschnitten.
    await page.locator(".booking-success-wrap").getByRole("button", { name: /Zu meinen Sendungen/ }).click();
    if (mobil) {
      const karteMobil = page.locator(".ce-list-card", { hasText: AB_NUMMER }).first();
      await karteMobil.waitFor({ timeout: 20000 });
      const text = await karteMobil.innerText();
      assert.match(text, /Service\s*Standard/, `die mobile Karte zeigt den Service nicht: ${text}`);
      assert.ok(await querUeberlauf(page) <= 0, "Sendungen: horizontaler Überlauf");
    } else {
      const zeile = page.locator("table tbody tr", { hasText: AB_NUMMER }).first();
      await zeile.waitFor({ timeout: 20000 });
      await zeile.getByRole("button", { name: "Sendung verfolgen" }).click();
      await page.waitForSelector(".shipment-track-detail .track-event", { timeout: 15000 });
      assert.ok(protokoll.pfade.includes(`/api/shipments/${CE_SHIPMENT_ID}/tracking`),
        "das Tracking kommt nicht über den CE-Sendungshandle");
      const detail = page.locator(".shipment-detail-card").first();
      const text = await detail.innerText();
      assert.match(text, /Service\s*Standard/, `die Detailzeile zeigt den Service nicht: ${text}`);
      assert.deepEqual((await detail.locator(".track-title").allTextContents()).map((t) => t.trim()),
        ["Versandlabel erstellt", "Abholung bestätigt"]);
      assert.equal(await detail.locator("a[href*='transglobal']").count(), 0);
    }
    await keineEinkaufsquelle(page, "Sendungen");

    const jumingoOnly = protokoll.pfade.filter((p) => JUMINGO_ONLY.some((re) => re.test(p)));
    assert.deepEqual(jumingoOnly, [], `JUMiNGO-only-Endpunkte angesprochen: ${jumingoOnly.join(", ")}`);
    assert.deepEqual(protokoll.reprice, [], "ohne Wahl wurde eine Absicherung neu bepreist");
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

test("B — mit zusätzlicher Transportabsicherung: Neubepreisung über die Angebotskennung, Buchung, Belege", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll);

  await zuDenAngeboten(page);
  await zurBuchungsseite(page);

  await karte(page, "transit_cover").locator(".ins-card-name").click();
  await page.locator("#ins-goodsAreNew-ja").check();
  await page.locator("#ins-goodsAreFragile-nein").check();
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  assert.ok(protokoll.reprice.length >= 1, "die Absicherung wurde nicht neu bepreist");
  assert.deepEqual(protokoll.reprice.at(-1), {
    offerId: OFFER_ID_DE,
    coverValue: Number(STANDARD_SENDUNGSANGABEN.declaredGoodsValue),
    goodsAreNew: true,
    goodsAreFragile: false,
  });
  assert.match((await sichtbarerText(page)), /24,68 €/, "der bestätigte Gesamtbetrag steht nicht da");

  await buchen(page);
  assert.equal(protokoll.book.length, 1);
  const body = protokoll.book[0];
  assert.equal(body.offerId, OFFER_ID_DE);
  assert.equal(body.shipperTariffId ?? null, null);
  assert.equal(body.tariffId ?? null, null);
  assert.equal(body.insuranceSelection && body.insuranceSelection.type, "transit_cover");
  assert.equal(body.confirmedTotalGross, 24.68);

  await pruefeErfolgsbelege(page, protokoll);
  await keineEinkaufsquelle(page, "Erfolgsbildschirm mit Absicherung");
  const jumingoOnly = protokoll.pfade.filter((p) => JUMINGO_ONLY.some((re) => re.test(p)));
  assert.deepEqual(jumingoOnly, [], `JUMiNGO-only-Endpunkte angesprochen: ${jumingoOnly.join(", ")}`);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — 390 px: derselbe Service auf einer nicht freigegebenen Route bleibt Preisauskunft", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const protokoll = neuesProtokoll();
  await setupRoutes(page, protokoll, { tarif: TARIF_22_EU });

  await zuDenAngeboten(page, { empfaenger: {
    ...STANDARD_EMPFAENGER, country: "AT", zip: "1010", city: "Wien", street: "Ring 1", phone: "+4311234567",
  } });
  const angebot = page.locator(".offer-card").first();
  assert.equal(await page.locator(".offer-card--unavailable").count(), 1, "das Angebot ist nicht als gesperrt dargestellt");
  const cta = angebot.locator("button.offer-cta-btn");
  assert.equal(await cta.isDisabled(), true, "der CTA ist bedienbar");
  assert.match(await cta.innerText(), /Derzeit nicht direkt buchbar/);
  // Die Preisauskunft bleibt vollständig lesbar.
  const text = (await angebot.innerText()).replace(/ /g, " ");
  for (const erwartet of ["UPS", "Standard", "12,34 €"]) assert.ok(text.includes(erwartet), erwartet);
  assert.equal(await angebot.locator(".ps-trigger").count(), 0);
  assert.ok(await querUeberlauf(page) <= 0, "Angebotsliste: horizontaler Überlauf");
  assert.equal(protokoll.book.length, 0, "eine gesperrte Preisauskunft hat eine Buchung ausgelöst");
  await keineEinkaufsquelle(page, "gesperrte Preisauskunft");
  await page.close();
});
