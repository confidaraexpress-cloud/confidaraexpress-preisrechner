// E2E: UPS-Vervollständigung — UPS · Express und UPS · Standardversand Mehrpaket im GEMEINSAMEN Angebots-, Buchungs- und
// Sendungsfluss. Echter Dev-Server, echter Browser, gemocktes Backend (Adressart über helpers/residentialPriceInputs.mjs).
//
// Es gibt keine eigene Oberfläche für diese Produkte: dasselbe Angebotsformat wie Standard- und Expressversand, andere
// Serverwerte. Gemessen wird, dass der gemeinsame Flow genau diese Werte zeigt — und nichts darüber hinaus:
//   A  Vergleich mit einem Packstück: Standard- und Expressversand auswählbar; Express und Standardversand Mehrpaket als
//      vollwertige Preisauskunft — gesperrt, Preis sichtbar, keine Adressfrage, kein Same-Day, keine Auszeichnung
//   B  Details UPS · Express: Express-Profil OHNE Volumengewichtsformel und OHNE Gewichtsgrenze, Prognose ohne Uhrzeit
//   C  Details UPS · Standardversand Mehrpaket: kein Profil — der bisherige Detailbereich, keine erfundene Grenze
//   D  Neue Sendung mit zwei Packstücken: Anzahl und Maße je Paket in der Anfrage; nur das Mehrpaketprodukt bleibt
//   E  Preisrechner mit zwei Packstücken: „Identische Pakete", Hinweis je Paket, Mehrpaketprodukt als Preisauskunft
//   F  Freigabe nur als Serverwert (hypothetisch): Paketzeile in Schritt 1 und 2, Buchung, vier Versandlabels + Abholetikett
//   G  Meine Sendungen: Mehrpaketsendung mit zwei Trackingnummern, zwei Etappen und Belegen „1 von 2"; Express mit einer Nummer
//   H  390 / 834 px: Vergleich, Erfolg und Sendungsliste ohne horizontalen Überlauf
// White Label wird auf jeder Fläche geprüft.
//
// Alle Beträge sind FIXTUREWERTE des gemockten Servers — die Oberfläche rechnet nichts. Die Freigabe in F ist keine
// Produktaussage: sie belegt nur, dass die Oberfläche für mehrere Packstücke, Labels und Trackingnummern keine Änderung
// braucht, sobald der Server ein solches Angebot freigibt.
//
// Kein echtes Backend, keine Bestellung, kein Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  fuelleVersandformular, STANDARD_ABSENDER, STANDARD_EMPFAENGER,
} from "./helpers/newShipmentForm.mjs";
import {
  LIEFERADRESSE_ID, lieferadressZustand, mockeLieferadresse, waehleLieferadresse, bestandteile,
} from "./helpers/residentialPriceInputs.mjs";

const PORT = 5399, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 5026;
const CE_ID_EXPRESS = 5029;
const AB = "CE-AB26-01026";
const AB_EXPRESS = "CE-AB26-01029";
const AWB_1 = "1Z26MULTI00000001";
const AWB_2 = "1Z26MULTI00000002";
const AWB_ABHOLUNG = "1Z26COLLECT0000001";
const AWB_EXPRESS = "1Z999AA10123456785";
const PDF = Buffer.from("%PDF-1.4\n% Testbeleg\n%%EOF\n", "utf8");

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

const HEUTE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const MONTAG = naechster(plusTage(HEUTE, 7), 1);
const DIENSTAG = plusTage(MONTAG, 1);
const MITTWOCH = plusTage(MONTAG, 2);

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10926",
};

// Route R2: 63741 Aschaffenburg → 10115 Berlin.
const ABSENDER = { ...STANDARD_ABSENDER, zip: "63741", city: "Aschaffenburg" };
const EMPFAENGER = { ...STANDARD_EMPFAENGER, zip: "10115", city: "Berlin" };
const EIN_PAKET = { packageCount: "1", weight: "2", length: "30", width: "20", height: "15" };
const ZWEI_PAKETE = { packageCount: "2", weight: "4", length: "40", width: "30", height: "20" };
const PAKETZEILE = "2 Pakete · je 4 kg · 40 × 30 × 20 cm";

/* ══════════ Die öffentlichen Angebote (Fixturewerte) ══════════ */

const angebot = (extra) => ({
  publicCarrierId: "ups", serviceType: "pickup", collectionDate: MONTAG, collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null, currency: "EUR",
  labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: false, insuranceDetails: null,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
  ...extra,
});

const STANDARD = angebot({
  offerId: "22mo0000000000000000000000000022", publicServiceName: "Standardversand",
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  deliveryProjection: { kind: "estimated", dateMin: DIENSTAG, dateMax: MITTWOCH },
  netPrice: 12.34, vatAmount: 2.34, finalPrice: 14.68,
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"], chargeableWeight: 2, trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }, { operant: "weight", operator: "<=", value: 70 }],
  serviceDetails: { summaryKey: "economy_standard", volumetricDivisor: 5000, notAccepted: ["pallets", "suitcases"],
                    basicCoverMaxGoodsValue: 50, maxCoverValue: 2500 },
});

const EXPRESSVERSAND = angebot({
  offerId: "23mo0000000000000000000000000023", publicServiceName: "Expressversand",
  transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
  deliveryProjection: { kind: "estimated", dateMin: DIENSTAG, dateMax: DIENSTAG },
  netPrice: 26.25, vatAmount: 4.99, finalPrice: 31.24,
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"], chargeableWeight: 2, trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }, { operant: "weight", operator: "<=", value: 70 }],
  serviceDetails: { summaryKey: "express_urgent", volumetricDivisor: 5000, notAccepted: ["pallets", "suitcases"],
                    basicCoverMaxGoodsValue: 50, maxCoverValue: 2500 },
});

// UPS · Express bis zur Freigabe: dieselben Felder wie der Expressversand, aber Preisauskunft — ohne belegten Divisor
// und ohne Gewichtsgrenze.
const EXPRESS = angebot({
  offerId: "29mo0000000000000000000000000029", publicServiceName: "Express",
  transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
  deliveryProjection: { kind: "estimated", dateMin: DIENSTAG, dateMax: DIENSTAG },
  netPrice: 31.67, vatAmount: 6.02, finalPrice: 37.69,
  bookable: false, unavailableReason: "quote_only", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"], chargeableWeight: 2, trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }],
  serviceDetails: { summaryKey: "express_urgent", volumetricDivisor: null, notAccepted: ["pallets", "suitcases"],
                    basicCoverMaxGoodsValue: 50, maxCoverValue: 2500 },
});

// UPS · Standardversand Mehrpaket bis zur Evidenz: keine kuratierte Fähigkeit, kein Profil, keine Prognose, keine Grenze.
const mehrpaket = (extra) => angebot({
  publicServiceName: "Standardversand Mehrpaket",
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage", deliveryProjection: null,
  bookable: false, unavailableReason: "quote_only", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential", "collectionIsResidential"],
  trackingAvailable: null, printerRequired: null, tariffLimits: [], serviceDetails: null,
  ...extra,
});
const MEHRPAKET_EINS = mehrpaket({
  offerId: "26e10000000000000000000000000026", netPrice: 14.4, vatAmount: 2.74, finalPrice: 17.14, chargeableWeight: 2,
});
const MEHRPAKET_ZWEI = mehrpaket({
  offerId: "26z20000000000000000000000000026", netPrice: 24, vatAmount: 4.56, finalPrice: 28.56, chargeableWeight: 8,
});
// Hypothetische Freigabe — ausschließlich Serverwerte: auswählbar mit der Frage nach der Art der Lieferadresse.
const MEHRPAKET_FREI = { ...MEHRPAKET_ZWEI, offerId: "26fr0000000000000000000000000026",
  unavailableReason: "price_inputs_required", requiredPriceInputs: ["deliveryIsResidential"] };

// JUMiNGO daneben — unverändert: Anbieterdatum mit Uhrzeit, Tarif-ID, Formatwahl, kein Profil.
const JM_EXPRESS = {
  id: 21, shipper_tariff_id: 3264, offerId: "ju-es-000000000000000000000003264",
  publicCarrierId: "ups", publicCarrierName: "UPS", publicServiceName: "Expressversand", serviceType: "pickup",
  netPrice: 24.9, vatAmount: 4.73, finalPrice: 29.63, currency: "EUR", transitDaysMin: 1, transitDaysMax: 1,
  pickupDate: `${MONTAG}T00:00:00Z`, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: `${DIENSTAG}T00:00:00Z`, deliveryTimeUntil: "18:00",
  trackingAvailable: true, printerRequired: true, availableForDate: true, bookable: true, requiredPriceInputs: [],
  labelFormatOptions: ["A4", "A6"], labelSizes: ["A4", "A6"], chargeableWeight: 2,
  tariffLimits: [{ operant: "weight", operator: "<=", value: 70 }], insuranceAvailable: false,
};
const JM_MEHRPAKET = {
  id: 31, shipper_tariff_id: 4100, offerId: "ju-st-000000000000000000000004100",
  publicCarrierId: "dhl", publicCarrierName: "DHL", publicServiceName: "Standardversand", serviceType: "pickup",
  netPrice: 21.9, vatAmount: 4.16, finalPrice: 26.06, currency: "EUR", transitDaysMin: 1, transitDaysMax: 2,
  pickupDate: `${MONTAG}T00:00:00Z`, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: `${MITTWOCH}T00:00:00Z`,
  trackingAvailable: true, printerRequired: true, availableForDate: true, bookable: true, requiredPriceInputs: [],
  labelFormatOptions: ["A4", "A6"], labelSizes: ["A4", "A6"], chargeableWeight: 8, tariffLimits: [], insuranceAvailable: false,
};

const VERGLEICH_EIN_PAKET = [STANDARD, EXPRESSVERSAND, EXPRESS, MEHRPAKET_EINS, JM_EXPRESS];
const VERGLEICH_ZWEI_PAKETE = [MEHRPAKET_ZWEI, JM_MEHRPAKET];

// Die Art der Lieferadresse der hypothetisch freigegebenen Mehrpaketsendung (Fixturewerte).
const zustandMehrpaket = () => lieferadressZustand({
  offerId: MEHRPAKET_FREI.offerId,
  geschaeft: { net: 24, vat: 4.56, gross: 28.56 },
  privat: { net: 27.18, vat: 5.16, gross: 32.34 },
  zuschlag: { net: 3.18, vat: 0.6, gross: 3.78 },
});

/* ══════════ Belege und Sendungen ══════════ */

const BELEG = (id, type, ordinal, label, carrierReference, labelSize) => ({
  type, category: "SHIPPING", status: "ready", label, ordinal, carrierReference, labelSize,
  downloadPath: `/api/shipments/${id}/provider-documents/${type}/${ordinal}`,
});
// Bewusst unsortiert — die Reihenfolge der Oberfläche darf nicht an der Antwort hängen.
const MEHRPAKET_BELEGE = [
  BELEG(CE_ID, "COLLECTION_LABEL", 0, "Abholetikett (A4)", AWB_ABHOLUNG, "A4"),
  BELEG(CE_ID, "LABEL", 3, "Versandlabel 2 von 2 (Thermodruck)", AWB_2, "THERMAL"),
  BELEG(CE_ID, "LABEL", 0, "Versandlabel 1 von 2 (A4)", AWB_1, "A4"),
  BELEG(CE_ID, "LABEL", 2, "Versandlabel 2 von 2 (A4)", AWB_2, "A4"),
  BELEG(CE_ID, "LABEL", 1, "Versandlabel 1 von 2 (Thermodruck)", AWB_1, "THERMAL"),
];
const MEHRPAKET_KNOEPFE = [
  "Versandlabel 1 von 2 (A4) herunterladen", "Versandlabel 1 von 2 (Thermodruck) herunterladen",
  "Versandlabel 2 von 2 (A4) herunterladen", "Versandlabel 2 von 2 (Thermodruck) herunterladen",
  "Abholetikett (A4) herunterladen",
];
const EXPRESS_BELEGE = [
  BELEG(CE_ID_EXPRESS, "LABEL", 1, "Versandlabel (Thermodruck)", AWB_EXPRESS, "THERMAL"),
  BELEG(CE_ID_EXPRESS, "LABEL", 0, "Versandlabel (A4)", AWB_EXPRESS, "A4"),
];
// Die Dateinamen, wie der Server sie für eine Mehrpaketsendung bildet (Position und Format je Beleg).
const DATEINAME = {
  "LABEL/0": `Versandlabel-${AB}-1-A4.pdf`, "LABEL/1": `Versandlabel-${AB}-1-Thermodruck.pdf`,
  "LABEL/2": `Versandlabel-${AB}-2-A4.pdf`, "LABEL/3": `Versandlabel-${AB}-2-Thermodruck.pdf`,
  "COLLECTION_LABEL/0": `Abholetikett-${AB}-A4.pdf`,
};

const SENDUNG = (over) => ({
  status: "booked", selected_carrier: "ups", created_at: `${HEUTE}T10:00:00Z`, order_number: null,
  cancellation_status: null, ...over,
});
const SENDUNGEN = [
  SENDUNG({ id: CE_ID, weight: 8, price_final: 28.56, order_confirmation_number: AB, business_order_number: "CE-BS26-01026",
            tracking_number: AWB_1, tracking_references: [AWB_1, AWB_2] }),
  SENDUNG({ id: CE_ID_EXPRESS, weight: 2, price_final: 37.69, order_confirmation_number: AB_EXPRESS,
            business_order_number: "CE-BS26-01029", tracking_number: AWB_EXPRESS, tracking_references: [AWB_EXPRESS] }),
];

const EV = (status, description, location, date, time) => ({ status, description, location, dateTime: { date, time } });
const TRACKING = {
  [CE_ID]: {
    shipmentId: CE_ID, tracking: null, trackingAvailable: true, trackingNumber: AWB_1, trackingReferences: [AWB_1, AWB_2],
    trackingStatus: "in_transit", trackingStatusText: "Picked up", carrier: "UPS", carrierTrackingPage: null,
    liveTracking: true, source: "live",
    trackingLegs: [
      { carrier: "UPS", trackingReference: AWB_1, status: "in_transit", carrierTrackingPage: null,
        events: [EV("in_transit", "Picked up", "Aschaffenburg DE", MONTAG, "15:12:00")] },
      { carrier: "UPS", trackingReference: AWB_2, status: "in_transit", carrierTrackingPage: null,
        events: [EV("in_transit", "Picked up", "Aschaffenburg DE", MONTAG, "15:12:30")] },
    ],
  },
  [CE_ID_EXPRESS]: {
    shipmentId: CE_ID_EXPRESS, tracking: null, trackingAvailable: true, trackingNumber: AWB_EXPRESS,
    trackingReferences: [AWB_EXPRESS], trackingStatus: null, carrier: "UPS", carrierTrackingPage: null, source: "local",
  },
};
const DOKUMENTE = { [CE_ID]: MEHRPAKET_BELEGE, [CE_ID_EXPRESS]: EXPRESS_BELEGE };

/* ══════════ Prüfregeln ══════════ */

// Keine Einkaufsquelle, keine interne Kennung, kein Rohname des Anbieters — ohne Rücksicht auf Groß-/Kleinschreibung …
const VERBOTEN = /transglobal|jumingo|service[\s-]*id\b|quote[\s-]*id\b|UPS Express Saver|UPS Standard Multi|Standard Single|providerServiceRef|shipper_tariff_id|itemdescription|ce_projected|undefined|\bnull\b/i;
// … und Positions- und Servicecodes als eigene Wörter.
const VERBOTENE_CODES = /\bTG\b|\bS2[2369]\b|\bCOLFEE\b|\bRES\b|\bINS\b|\bFRT\b/;
// Der Name „Express" verspricht nichts: keine Uhrzeit, kein Vormittag, keine Garantie.
const KEINE_ZUSAGE = /10:30|12:00|vormittag|garantiert|garantie|tagesende|zustellung bis/i;
// Was das Profil der Preisauskunft nie sagt: belegfreie Grenzen und Formeln.
const KEINE_ERFUNDENE_GRENZE = /70 kg|5\.000|volumengewicht|gurtmaß|länge|max\. gewicht/i;
const JUMINGO_ONLY = [/\/pickup-window/, /\/cart-total/, /\/commercial-invoice/];

let server, browser;

/* Das Szenario: `tariffs` (Vergleich), `lz` (Zustand der Lieferadresse), `sendungen` (Meine Sendungen). */
async function setup(page, szenario = {}) {
  const p = { pfade: [], calc: [], book: [], anfragen: [] };
  const lz = szenario.lz || zustandMehrpaket();
  p.lz = lz;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    p.pfade.push(pfad);
    const beleg = /^\/api\/shipments\/(\d+)\/provider-documents\/([A-Z_]+)\/(\d)$/.exec(pfad);
    if (beleg) {
      const name = Number(beleg[1]) === CE_ID ? DATEINAME[`${beleg[2]}/${beleg[3]}`] : null;
      return route.fulfill({ status: 200, body: PDF, headers: {
        "content-type": "application/pdf",
        ...(name ? { "content-disposition": `attachment; filename="${name}"`,
                     "access-control-expose-headers": "Content-Disposition" } : {}),
      } });
    }
    const dokumente = /^\/api\/shipments\/(\d+)\/documents$/.exec(pfad);
    if (dokumente) return json({ shipmentId: Number(dokumente[1]), documents: DOKUMENTE[dokumente[1]] || [] });
    const tracking = /^\/api\/shipments\/(\d+)\/tracking$/.exec(pfad);
    if (tracking) return json(TRACKING[tracking[1]] || {});
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: szenario.sendungen || [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (pfad.includes("/pickup-window")) {
      return json({ pickupWindow: null, availableFrom: `${MONTAG}T09:00:00Z`, availableUntil: `${MONTAG}T17:00:00Z`,
                    minimumMinutes: 120, adjustable: true });
    }
    if (pfad.includes("/api/jumingo/calculate-price")) {
      p.calc.push(req.postDataJSON());
      return json({
        ceShipmentId: CE_ID, tariffs: szenario.tariffs || VERGLEICH_EIN_PAKET, availableShippingModes: ["standard", "express"],
        publicCarriers: [{ id: "ups", name: "UPS" }, { id: "dhl", name: "DHL" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
    }
    if (pfad.includes("/api/insurance/reprice")) {
      return json({ error: "Die Zusatzabsicherung ist für dieses Angebot nicht verfügbar.", code: "INSURANCE_UNAVAILABLE" }, 409);
    }
    if (pfad.includes("/api/jumingo/book")) {
      const body = req.postDataJSON();
      p.book.push(body);
      return json({
        message: "Sendung gebucht", ceShipmentId: CE_ID, invoiceNumber: "CE-RE26-01026",
        businessOrderNumber: "CE-BS26-01026", dueDate: null, amount: 28.56, billingMode: "single",
        testBooking: false, voucherCode: null, deliveryNote: null,
        orderConfirmation: { number: AB, issuedAt: `${HEUTE}T10:00:00Z` },
        shippingDocuments: MEHRPAKET_BELEGE,
        priceComponents: bestandteile(lz, lz.bound),
      });
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
const buchenKnopf = (page) => page.getByRole("button", { name: /Kostenpflichtig buchen/ });
const belegKnoepfe = (page) => page.locator(".booking-success-wrap")
  .getByRole("button", { name: /^(Versandlabel|Abholetikett).* herunterladen$/ });
const zeileVon = (page, ab) => page.locator("table tbody tr", { hasText: ab }).first();

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
  const page = await browser.newPage({ viewport, acceptDownloads: true });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function zuDenAngeboten(page, { paket = EIN_PAKET } = {}) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, {
    absender: ABSENDER, empfaenger: EMPFAENGER, paket,
    sendungsangaben: { declaredContent: "Ersatzteile", declaredGoodsValue: "500" },
  });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

async function oeffneDetails(page, tarif) {
  await karteVon(page, tarif).locator("button.offer-details-link").click();
  const panel = panelVon(page, tarif);
  await panel.locator(".offer-details-section").first().waitFor({ timeout: 10000 });
  return panel;
}

async function zurSendungsliste(page) {
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
}

async function keinAnbieter(page, wo) {
  const text = norm(await page.evaluate(() => document.body.innerText));
  const treffer = text.match(VERBOTEN) || text.match(VERBOTENE_CODES);
  assert.equal(treffer, null, `${wo}: unzulässiger Text „${treffer && treffer[0]}“`);
}

/* Eine gesperrte Preisauskunft: Preis sichtbar, Knopf gesperrt mit dem neutralen Satz, keine Folgeschritte. */
async function istPreisauskunft(karte, name) {
  assert.match(await karte.getAttribute("class"), /offer-card--unavailable/, `${name}: nicht als gesperrt dargestellt`);
  const cta = karte.locator("button.offer-cta-btn");
  assert.equal(await cta.isDisabled(), true, `${name}: der CTA ist bedienbar`);
  assert.equal(await inhalt(cta), "Derzeit nicht direkt buchbar", name);
  assert.equal(await karte.locator(".offer-cta-hint").count(), 0, `${name}: Hinweis, Adressfrage oder Same-Day an einer Preisauskunft`);
  assert.equal(await karte.locator(".offer-sameday-surcharge").count(), 0, name);
  assert.equal(await karte.locator(".offer-badge").count(), 0, `${name}: eine Preisauskunft trägt eine Auszeichnung`);
  // Gesperrt ist allein der CTA: die Details einer Preisauskunft bleiben bedienbar — auch für Screenreader.
  assert.equal(await karte.getAttribute("aria-disabled"), null, `${name}: die Karte sperrt ihre Kinder`);
  assert.equal(await karte.locator("button.offer-details-link").isEnabled(), true, `${name}: „Details anzeigen“ ist gesperrt`);
}

async function beleg(page, name) {
  const ordner = path.join(process.cwd(), "tests", "e2e", "screenshots");
  mkdirSync(ordner, { recursive: true });
  await page.screenshot({ path: path.join(ordner, `ups-family-${name}.png`), fullPage: false });
}

async function bucheMehrpaket(page) {
  const p = await setup(page, { tariffs: [MEHRPAKET_FREI, JM_MEHRPAKET] });
  await zuDenAngeboten(page, { paket: ZWEI_PAKETE });
  await karteVon(page, MEHRPAKET_FREI).locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await waehleLieferadresse(page, false);
  return p;
}

async function bestaetigenUndBuchen(page) {
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".booking-confirm-panel", { timeout: 20000 });
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut
  await checks.nth(0).check();
  await checks.nth(1).check();
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  await belegKnoepfe(page).first().waitFor({ timeout: 15000 });
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

/* ══════════ A — Vergleich mit einem Packstück ══════════ */

test("A — Vergleich: Standard- und Expressversand auswählbar; UPS · Express und UPS · Standardversand Mehrpaket als Preisauskunft", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  assert.equal(await page.locator(".offer-card").count(), 5, "nicht alle Angebote stehen im Vergleich");
  assert.equal(await page.locator(".offer-card--unavailable").count(), 2);

  for (const [t, name] of [[STANDARD, "Standardversand"], [EXPRESSVERSAND, "Expressversand"]]) {
    const karte = karteVon(page, t);
    assert.equal(await inhalt(karte.locator(".offer-service-type")), name);
    assert.equal(await karte.locator("button.offer-cta-btn").isEnabled(), true, `${name}: nicht mehr auswählbar`);
    assert.equal(await inhalt(karte.locator(".offer-surcharge-hint")), "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.");
  }

  const express = karteVon(page, EXPRESS);
  assert.equal(await inhalt(express.locator(".offer-carrier-name")), "UPS");
  assert.equal(await inhalt(express.locator(".offer-service-type")), "Express");
  assert.equal(await inhalt(express.locator(".offer-eta")), "1 Tag");
  assert.equal(await inhalt(express.locator(".offer-price")), "31,67 €", "der Preis der Preisauskunft fehlt");
  const ende = express.locator(".offer-tl-node--end");
  assert.equal(await inhalt(ende.locator(".offer-tl-title")), "Voraussichtliche Lieferung");
  assert.equal(await inhalt(ende.locator(".offer-tl-primary")), kurz(DIENSTAG));
  assert.equal(await ende.locator(".offer-tl-sub").count(), 0, "unter der Prognose steht eine Uhrzeit");
  await istPreisauskunft(express, "UPS · Express");
  assert.doesNotMatch(await inhalt(express), KEINE_ZUSAGE, "Zeit- oder Garantieaussage an UPS · Express");

  const mehrpaket = karteVon(page, MEHRPAKET_EINS);
  assert.equal(await inhalt(mehrpaket.locator(".offer-carrier-name")), "UPS");
  assert.equal(await inhalt(mehrpaket.locator(".offer-service-type")), "Standardversand Mehrpaket");
  assert.equal(await inhalt(mehrpaket.locator(".offer-eta")), "1–2 Tage");
  assert.equal(await inhalt(mehrpaket.locator(".offer-price")), "14,40 €");
  assert.notEqual(await inhalt(mehrpaket.locator(".offer-tl-node--end .offer-tl-title")), "Voraussichtliche Lieferung",
    "ohne kuratierte Prognose erscheint eine voraussichtliche Lieferung");
  await istPreisauskunft(mehrpaket, "UPS · Standardversand Mehrpaket");

  // Brutto: derselbe Umschalter wie für jedes Angebot, der Betrag vom Server.
  await page.getByRole("button", { name: "inkl. MwSt.", exact: true }).click();
  await page.waitForFunction((s) => (document.querySelector(s)?.textContent || "").replace(/ /g, " ").includes("37,69"),
    `.offer-card:has(button[aria-controls="offer-details-${EXPRESS.offerId}"]) .offer-price`, { timeout: 10000 });
  assert.equal(await inhalt(mehrpaket.locator(".offer-price")), "17,14 €");

  // Ein Klick auf eine Preisauskunft führt nirgendwohin und fragt nichts an.
  await express.click({ position: { x: 20, y: 20 } });
  await kurzWarten(500);
  assert.equal(await page.locator(".steps-bar").count(), 0, "eine Preisauskunft führte zur Buchung");
  assert.deepEqual(p.anfragen, [], "für eine Preisauskunft entstand eine Zuschlagsanfrage");

  // JUMiNGO daneben: unverändert buchbar, mit Anbieterdatum und Uhrzeit.
  const jm = karteVon(page, JM_EXPRESS);
  assert.equal(await jm.locator("button.offer-cta-btn").isEnabled(), true);
  assert.match(await inhalt(jm.locator(".offer-tl-node--end")), /18:00/);
  await keinAnbieter(page, "Vergleich");
  await beleg(page, "vergleich-1440");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ B — Details UPS · Express ══════════ */

test("B — Details UPS · Express: Express-Profil ohne Volumengewichtsformel und ohne Gewichtsgrenze", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  await zuDenAngeboten(page);
  const panel = await oeffneDetails(page, EXPRESS);

  assert.deepEqual(await alleTexte(panel.locator(".offer-detail-section-title")),
    ["Hauptmerkmale", "Laufzeit", "Größe & Gewicht", "Transportabsicherung", "Einschränkungen",
     "Termin & Abholung", "Preisaufschlüsselung"]);
  const abschnitt = (id) => panel.locator(`[data-profile-section="${id}"]`);
  assert.equal(await inhalt(abschnitt("main").locator(".offer-profile-summary")), "Schneller Expressversand für eilige Sendungen.");
  assert.deepEqual(await zeilenVon(abschnitt("transit")), [
    ["Voraussichtliche Laufzeit", "1 Tag"], ["Voraussichtliche Lieferung", kurz(DIENSTAG)],
  ]);
  // Größe & Gewicht: nur die CE-Grenze von einem Packstück und das Abrechnungsgewicht des Servers.
  assert.deepEqual(await zeilenVon(abschnitt("size")), [["Packstücke", "1 je Sendung"], ["Abrechnungsgewicht", "2,00 kg"]]);
  assert.equal(await abschnitt("size").locator(".offer-profile-note").count(), 0, "ein nicht belegter Divisor wird erklärt");
  assert.deepEqual(await zeilenVon(abschnitt("restrictions")), [["Nicht zugelassen", "Paletten, Koffer"]]);

  const profil = norm((await panel.locator("[data-profile-section]").allTextContents()).join(" "));
  assert.ok(profil.length > 150, "das Profil ist leer");
  const erfunden = profil.match(KEINE_ERFUNDENE_GRENZE);
  assert.equal(erfunden, null, `belegfreie Angabe im Profil: „${erfunden && erfunden[0]}“`);
  assert.doesNotMatch(norm(await panel.textContent()), KEINE_ZUSAGE);
  await keinAnbieter(page, "Details UPS · Express");
  await beleg(page, "express-details-1440");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ C — Details UPS · Standardversand Mehrpaket ══════════ */

test("C — Details UPS · Standardversand Mehrpaket: kein Profil, bisheriger Detailbereich, keine erfundene Grenze", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  await zuDenAngeboten(page);
  const panel = await oeffneDetails(page, MEHRPAKET_EINS);

  assert.equal(await panel.locator("[data-profile-section]").count(), 0, "ohne kuratiertes Profil erscheint ein Profil");
  const titel = await alleTexte(panel.locator(".offer-detail-section-title"));
  for (const t of ["Hauptmerkmale", "Termin & Abholung", "Preisaufschlüsselung"]) assert.ok(titel.includes(t), `${t} fehlt: ${titel}`);
  assert.ok(!titel.includes("Einschränkungen"), "ohne Servergrenze erscheint ein Einschränkungsabschnitt");
  const merkmale = await alleTexte(panel.locator(".offer-feature-label"));
  assert.ok(merkmale.includes("Voraussichtliche Laufzeit"), merkmale.join(" | "));
  assert.ok(!merkmale.includes("Sendungsverfolgung") && !merkmale.includes("Drucker"),
    `eine nicht kuratierte Fähigkeit wird behauptet: ${merkmale.join(" | ")}`);
  const text = norm(await panel.textContent());
  const erfunden = text.match(KEINE_ERFUNDENE_GRENZE);
  assert.equal(erfunden, null, `belegfreie Angabe: „${erfunden && erfunden[0]}“`);
  assert.doesNotMatch(text, /Voraussichtliche Lieferung/);
  await keinAnbieter(page, "Details UPS · Standardversand Mehrpaket");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ D — Neue Sendung mit zwei Packstücken ══════════ */

test("D — Neue Sendung, zwei Packstücke: Anzahl und Maße je Paket in der Anfrage; nur das Mehrpaketprodukt bleibt", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: VERGLEICH_ZWEI_PAKETE });
  await zuDenAngeboten(page, { paket: ZWEI_PAKETE });

  assert.equal(p.calc.length, 1);
  const anfrage = p.calc[0];
  assert.deepEqual([anfrage.packageCount, anfrage.weight, anfrage.length, anfrage.width, anfrage.height], [2, 4, 40, 30, 20],
    "die Anfrage trägt nicht die Angaben je Paket");
  assert.ok(!("packages" in anfrage), "die Oberfläche baut selbst eine Paketliste");
  assert.equal(await page.locator(".offer-card").count(), 2);
  const karte = karteVon(page, MEHRPAKET_ZWEI);
  assert.equal(await inhalt(karte.locator(".offer-service-type")), "Standardversand Mehrpaket");
  assert.equal(await inhalt(karte.locator(".offer-price")), "24,00 €");
  await istPreisauskunft(karte, "UPS · Standardversand Mehrpaket (2 Pakete)");
  const panel = await oeffneDetails(page, MEHRPAKET_ZWEI);
  assert.ok((await alleTexte(panel.locator(".offer-feature-value"))).includes("8,00 kg"),
    "das Abrechnungsgewicht des Servers fehlt");
  assert.equal(await karteVon(page, JM_MEHRPAKET).locator("button.offer-cta-btn").isEnabled(), true);
  await keinAnbieter(page, "Vergleich mit zwei Packstücken");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ E — Preisrechner mit zwei Packstücken ══════════ */

test("E — Preisrechner, zwei Packstücke: „Identische Pakete“, Hinweis je Paket, Mehrpaketprodukt als Preisauskunft", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: VERGLEICH_ZWEI_PAKETE });
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await page.fill("#calc-from-zip", "63741");
  await page.fill("#calc-from-city", "Aschaffenburg");
  await page.fill("#calc-to-zip", "10115");
  await page.fill("#calc-to-city", "Berlin");
  await page.fill("#calc-packageCount", "2");
  await page.fill("#calc-weight", "4");
  await page.fill("#calc-length", "40");
  await page.fill("#calc-width", "30");
  await page.fill("#calc-height", "20");
  const feld = page.locator(".field:has(#calc-packageCount)");
  assert.equal(await inhalt(feld.locator(".field-hint")), "Identische Pakete");
  assert.equal(await inhalt(page.locator(".pkg-count-note")), "Gewicht und Maße gelten je Paket. Der Preis gilt für alle Pakete zusammen.");

  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.deepEqual([p.calc[0].packageCount, p.calc[0].weight, p.calc[0].length], [2, 4, 40]);
  const karte = karteVon(page, MEHRPAKET_ZWEI);
  assert.equal(await inhalt(karte.locator(".offer-service-type")), "Standardversand Mehrpaket");
  await istPreisauskunft(karte, "Preisrechner: UPS · Standardversand Mehrpaket");
  await keinAnbieter(page, "Preisrechner");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ F — Freigabe als Serverwert: Buchungsseite und Erfolg ══════════ */

test("F — Mehrpaketbuchung (Freigabe nur als Serverwert): Paketzeile, Bindung, vier Versandlabels und Abholetikett", async () => {
  const { page, fehler } = await neueSeite();
  const p = await bucheMehrpaket(page);

  // Schritt 1: Identität und die Paketzeile — Gewicht und Maße JE Paket.
  assert.equal(await inhalt(page.locator(".blsum-carrier")), "UPS");
  assert.equal(await inhalt(page.locator(".blsum-service")), "Standardversand Mehrpaket");
  const paket = page.locator('.shipment-summary-card .summary-detail-row:has(.summary-detail-key:text-is("Paket")) .summary-detail-val');
  assert.equal(await inhalt(paket), PAKETZEILE);
  assert.equal(await page.locator("#booking-labelformat-toggle").count(), 0, "ein Angebot ohne Formatwahl bietet eine an");
  assert.deepEqual(p.lz.bindCalls.map((b) => b.deliveryIsResidential), [false]);
  await keinAnbieter(page, "Schritt 1 Mehrpaket");

  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".booking-confirm-panel", { timeout: 20000 });
  assert.equal(await inhalt(page.locator('.booking-confirm-row:has(span:text-is("Paket")) .booking-confirm-val')), PAKETZEILE);
  assert.match(await inhalt(page.locator(".booking-confirm-box")), /Gesamtbetrag brutto\s*28,56 €/);
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });

  assert.equal(p.book.length, 1);
  const body = p.book[0];
  assert.equal(body.offerId, MEHRPAKET_FREI.offerId);
  assert.equal(body.ceShipmentId, CE_ID);
  assert.deepEqual(body.priceInputs, { deliveryIsResidential: false });
  assert.ok(!("labelFormat" in body), "ein Angebot ohne Formatwahl sendet ein Labelformat");
  assert.equal(body.tariffId ?? null, null);
  assert.deepEqual(body.insuranceSelection, { type: "none" });

  // Erfolg: je Beleg ein Knopf mit dem Servernamen — sortiert, ohne Dublette, das Abholetikett zuletzt.
  const knoepfe = belegKnoepfe(page);
  await knoepfe.first().waitFor({ timeout: 15000 });
  assert.deepEqual((await knoepfe.allTextContents()).map((t) => t.trim()), MEHRPAKET_KNOEPFE);
  assert.equal(await page.locator(".booking-success-wrap").getByRole("button", { name: "Label herunterladen" }).count(), 0);
  assert.match(await inhalt(page.locator(".booking-success-recap")), /Carrier\s*UPS — Standardversand Mehrpaket/);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator(".booking-success-wrap").getByRole("button", { name: "Versandlabel 2 von 2 (Thermodruck) herunterladen" }).click(),
  ]);
  assert.ok(p.pfade.includes(`/api/shipments/${CE_ID}/provider-documents/LABEL/3`), "das zweite Thermodrucklabel kam nicht über seinen Pfad");
  assert.equal(download.suggestedFilename(), DATEINAME["LABEL/3"]);
  assert.ok(!p.pfade.some((x) => /\/label$/.test(x)), "der Sammelpfad des ersten Labels wurde angesprochen");
  const jumingoOnly = p.pfade.filter((x) => JUMINGO_ONLY.some((re) => re.test(x)));
  assert.deepEqual(jumingoOnly, [], `JUMiNGO-only-Endpunkte angesprochen: ${jumingoOnly.join(", ")}`);
  for (const anfrage of [...p.book, ...p.calc, ...p.anfragen.map((a) => a.body)]) {
    assert.doesNotMatch(JSON.stringify(anfrage), /transglobal|serviceId|providerServiceRef|quoteId/i);
  }
  await keinAnbieter(page, "Erfolg Mehrpaket");
  await beleg(page, "mehrpaket-erfolg-1440");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ G — Meine Sendungen ══════════ */

test("G — Meine Sendungen: Mehrpaketsendung mit zwei Nummern, zwei Etappen und Belegen „1 von 2“; UPS · Express mit einer Nummer", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { sendungen: SENDUNGEN });
  await zurSendungsliste(page);
  await page.waitForSelector("table tbody tr", { timeout: 20000 });

  const mehr = zeileVon(page, AB);
  const einzel = zeileVon(page, AB_EXPRESS);
  assert.match(await mehr.innerText(), /2 Trackingnummern/);
  assert.match(await einzel.innerText(), new RegExp(`Trackingnummer: ${AWB_EXPRESS}`));
  assert.doesNotMatch(await einzel.innerText(), /Trackingnummern/);

  await mehr.getByRole("button", { name: "Sendung verfolgen" }).click();
  await page.waitForSelector(".ce-list-table .shipment-track-detail .track-event", { timeout: 15000 });
  const detail = page.locator(".ce-list-table .shipment-track-detail");
  assert.equal(norm(await page.locator(".ce-list-table .shipment-track-number").innerText()), `Trackingnummern: ${AWB_1}, ${AWB_2}`);
  assert.deepEqual(await alleTexte(detail.locator(".shipment-track-leg")), [`UPS · ${AWB_1}`, `UPS · ${AWB_2}`]);
  assert.doesNotMatch(norm(await detail.innerText()), /Paket \d|transglobal|UTC|GMT/i);
  await mehr.getByRole("button", { name: "Sendung verfolgen" }).click(); // einklappen

  await mehr.getByRole("button", { name: "Dokumente" }).click();
  await page.waitForSelector(".sdoc-group-title", { timeout: 15000 });
  const versand = page.locator(".sdoc-group").first();
  assert.deepEqual(await alleTexte(versand.locator(".sdoc-row-name")), [
    "Versandlabel 1 von 2 (A4)", "Versandlabel 1 von 2 (Thermodruck)", "Versandlabel 2 von 2 (A4)",
    "Versandlabel 2 von 2 (Thermodruck)", "Abholetikett (A4)",
  ]);
  assert.deepEqual(await alleTexte(versand.locator(".sdoc-row-number")), [AWB_1, AWB_1, AWB_2, AWB_2, AWB_ABHOLUNG]);
  assert.equal(await versand.getByRole("button", { name: /Herunterladen/ }).count(), 5);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    versand.locator(".sdoc-row", { hasText: "Versandlabel 2 von 2 (A4)" }).getByRole("button", { name: /Herunterladen/ }).click(),
  ]);
  assert.ok(p.pfade.includes(`/api/shipments/${CE_ID}/provider-documents/LABEL/2`));
  assert.equal(download.suggestedFilename(), DATEINAME["LABEL/2"]);
  await keinAnbieter(page, "Dokumente Mehrpaket");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".sdoc-drawer", { state: "detached", timeout: 10000 }).catch(() => {});

  // UPS · Express: eine Nummer, zwei Formate desselben Labels.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("table tbody tr", { timeout: 20000 });
  await zeileVon(page, AB_EXPRESS).getByRole("button", { name: "Dokumente" }).click();
  await page.waitForSelector(".sdoc-group-title", { timeout: 15000 });
  assert.deepEqual(await alleTexte(page.locator(".sdoc-group").first().locator(".sdoc-row-name")),
    ["Versandlabel (A4)", "Versandlabel (Thermodruck)"]);
  await keinAnbieter(page, "Dokumente UPS · Express");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ H — Responsive ══════════ */

for (const breite of [834, 390]) {
  test(`H — ${breite} px: Preisauskünfte, Mehrpaketerfolg und Sendungsliste ohne horizontalen Überlauf`, async () => {
    const vergleich = await neueSeite({ width: breite, height: 900 });
    await setup(vergleich.page);
    await zuDenAngeboten(vergleich.page);
    for (const t of [EXPRESS, MEHRPAKET_EINS]) {
      const karte = karteVon(vergleich.page, t);
      for (const sel of [".offer-service-type", ".offer-price", "button.offer-cta-btn"]) {
        const el = karte.locator(sel);
        await el.scrollIntoViewIfNeeded();
        assert.ok(await el.isVisible(), `${breite}px ${t.publicServiceName}: ${sel} ist nicht sichtbar`);
        const a = await karte.boundingBox();
        const i = await el.boundingBox();
        assert.ok(i.x >= a.x - 1 && i.x + i.width <= a.x + a.width + 1, `${breite}px ${t.publicServiceName}: ${sel} ragt aus der Karte`);
      }
    }
    await oeffneDetails(vergleich.page, EXPRESS);
    assert.ok(await querUeberlauf(vergleich.page) <= 0, `${breite}px: Vergleich mit horizontalem Überlauf`);
    await beleg(vergleich.page, `vergleich-${breite}`);
    assert.deepEqual(vergleich.fehler, []);
    await vergleich.page.close();

    const buchung = await neueSeite({ width: breite, height: 900 });
    await bucheMehrpaket(buchung.page);
    assert.ok(await buchung.page.locator(".shipment-summary-card").isVisible());
    assert.ok(await querUeberlauf(buchung.page) <= 0, `${breite}px: Schritt 1 mit horizontalem Überlauf`);
    await bestaetigenUndBuchen(buchung.page);
    const kanten = await belegKnoepfe(buchung.page).evaluateAll((els) => els.map((b) => {
      const r = b.getBoundingClientRect();
      return [r.left, r.right];
    }));
    assert.equal(kanten.length, 5, `${breite}px: nicht jeder Beleg hat seinen Knopf`);
    for (const [links, rechts] of kanten) {
      assert.ok(links >= 0 && rechts <= breite + 1, `${breite}px: ein Belegknopf läuft aus dem Bild (${links}–${rechts})`);
    }
    assert.ok(await querUeberlauf(buchung.page) <= 0, `${breite}px: Erfolg mit horizontalem Überlauf`);
    await beleg(buchung.page, `mehrpaket-erfolg-${breite}`);
    assert.deepEqual(buchung.fehler, []);
    await buchung.page.close();

    const liste = await neueSeite({ width: breite, height: 900 });
    await setup(liste.page, { sendungen: SENDUNGEN });
    await zurSendungsliste(liste.page);
    // Bis 1100 px zeigt die Liste Karten statt der Tabelle (patterns.css) — jede Nummer steht lesbar in der Karte.
    await liste.page.waitForSelector(".ce-list-card", { timeout: 20000 });
    const karte = liste.page.locator(".ce-list-card", { hasText: AB }).first();
    assert.match(await karte.innerText(), /2 Trackingnummern/);
    assert.deepEqual(await alleTexte(karte.locator(".ce-list-card-val.mono span")), [AWB_1, AWB_2]);
    const rechts = await karte.locator(".ce-list-card-val.mono span").evaluateAll((els) => els.map((s) => s.getBoundingClientRect().right));
    for (const r of rechts) assert.ok(r <= breite + 1, `${breite}px: eine Trackingnummer ragt aus dem Bild (${r})`);
    assert.match(await liste.page.locator(".ce-list-card", { hasText: AB_EXPRESS }).first().innerText(),
      new RegExp(`Trackingnummer: ${AWB_EXPRESS}`));
    assert.ok(await querUeberlauf(liste.page) <= 0, `${breite}px: Sendungsliste mit horizontalem Überlauf`);
    await beleg(liste.page, `sendungen-${breite}`);
    assert.deepEqual(liste.fehler, []);
    await liste.page.close();
  });
}
