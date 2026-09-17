// E2E: UPS-Vervollständigung — UPS · Express und UPS · Standardversand Mehrpaket im GEMEINSAMEN Angebots-, Buchungs- und
// Sendungsfluss. Echter Dev-Server, echter Browser, gemocktes Backend (Adressart über helpers/residentialPriceInputs.mjs).
//
// Es gibt keine eigene Oberfläche für diese Produkte: dasselbe Angebotsformat wie Standard- und Expressversand, andere
// Serverwerte. Gemessen wird, dass der gemeinsame Flow genau diese Werte zeigt — und nichts darüber hinaus:
//   A  Vergleich mit einem Packstück: Standard- und Expressversand auswählbar; UPS · Express als vollwertige
//      Preisauskunft — gesperrt, Preis sichtbar, keine Adressfrage, kein Same-Day, keine Auszeichnung
//   B  Details UPS · Express: Express-Profil OHNE Volumengewichtsformel und OHNE Gewichtsgrenze, Prognose ohne Uhrzeit
//   C  Details UPS · Standardversand Mehrpaket (freigegeben, TG26): kein Profil — der bisherige Detailbereich mit
//      Sendungsverfolgung, Drucker und der Servergrenze von zwei Packstücken; keine Prognose, kein „nicht verfügbar"
//   D  Neue Sendung mit zwei Packstücken: Anzahl und Maße je Paket in der Anfrage; das Mehrpaketprodukt ist auswählbar
//      („Vorläufiger Preis", Zuschlagshinweis) — die Adressfrage entsteht erst auf der Buchungsseite
//   E  Preisrechner mit zwei Packstücken: „Identische Pakete", Hinweis je Paket, Mehrpaketprodukt auswählbar
//   F  Mehrpaketbuchung nach dem GEMESSENEN Fall: Paketzeile, Privatadresse, Absicherung 1:1, zwei Belege
//      („Versandlabel (A4)", „Versandlabel (Thermodruck)") mit einer Nummer, kein Abholetikett
//   G  Meine Sendungen: die Mehrpaketsendung mit einer Nummer und zwei Belegen; GENERISCH eine Sendung mit zwei Nummern,
//      zwei Etappen und Belegen „1 von 2"; UPS · Express mit einer Nummer
//   H  390 / 834 px: Vergleich, Buchung, Erfolg und Sendungsliste ohne horizontalen Überlauf
// White Label wird auf jeder Fläche geprüft.
//
// Alle Beträge sind FIXTUREWERTE des gemockten Servers nach dem gemessenen Staging-Fall — die Oberfläche rechnet nichts.
// Die Sendungsnummern sind synthetisch: eine Staging-Platzhalternummer ist kein Produktionsvertrag. Die Sendung mit
// mehreren Nummern ist bewusst GENERISCH — sie belegt, dass die Oberfläche jede Anzahl verschiedener Nummern ohne
// Änderung trägt, und sagt nichts darüber, wie viele Nummern eine Buchung trägt.
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
  lieferadressZustand, mockeLieferadresse, waehleLieferadresse, bestandteile,
} from "./helpers/residentialPriceInputs.mjs";

const PORT = 5399, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 5026;
const CE_ID_MEHRFACH = 5027;
const CE_ID_EXPRESS = 5029;
const AB = "CE-AB26-01026";
const AB_MEHRFACH = "CE-AB26-01027";
const AB_EXPRESS = "CE-AB26-01029";
// Gemessen ist die STRUKTUR: eine Nummer für beide Belege der Mehrpaketsendung. Die Nummer selbst ist synthetisch.
const AWB_MEHRPAKET = "1Z999AA10123456726";
// Generisch: je Paket eine eigene Nummer und ein Abholetikett.
const AWB_1 = "1Z999AA10123456731";
const AWB_2 = "1Z999AA10123456742";
const AWB_ABHOLUNG = "1Z999AA10123456753";
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
// Der gemessene Fall: zwei gleiche Packstücke je 2 kg, 30 × 20 × 15 cm.
const ZWEI_PAKETE = { packageCount: "2", weight: "2", length: "30", width: "20", height: "15" };
const PAKETZEILE = "2 Pakete · je 2 kg · 30 × 20 × 15 cm";

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

// UPS · Standardversand Mehrpaket, freigegeben (TG26): die Serverwerte des gemessenen Falls — vorläufiger Geschäftspreis
// bis zur Art der Lieferadresse; Grenze, Sendungsverfolgung und Drucker aus der Kuration; kein Profil, keine Prognose.
const MEHRPAKET = angebot({
  offerId: "26z20000000000000000000000000026", publicServiceName: "Standardversand Mehrpaket",
  transitDaysMin: 1, transitDaysMax: 5, deliveryTime: "1–5 Tage", deliveryProjection: null,
  netPrice: 31.93, vatAmount: 6.07, finalPrice: 38,
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"], chargeableWeight: 4, trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 2 }], serviceDetails: null,
});

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
  labelFormatOptions: ["A4", "A6"], labelSizes: ["A4", "A6"], chargeableWeight: 4, tariffLimits: [], insuranceAvailable: false,
};

const VERGLEICH_EIN_PAKET = [STANDARD, EXPRESSVERSAND, EXPRESS, JM_EXPRESS];
const VERGLEICH_ZWEI_PAKETE = [MEHRPAKET, JM_MEHRPAKET];

/* ══════════ Art der Lieferadresse und Absicherung (Fixturewerte des gemessenen Falls) ══════════ */

// Die Absicherungsbeschreibung des gebundenen Angebots bei Warenwert 500 €.
const COVER_500 = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
  coverValueSource: "goods_value", coverState: "available", coverValue: 500,
  basicCoverMaxGoodsValue: 50, maxCoverValue: 2500,
};
const ABSICHERUNG_ZEILE = { type: "transport_insurance", taxable: false, net: 10, vat: 0, gross: 10 };
// Die Summen der Neubepreisung: der Versand wie gebunden, die Absicherung 1:1 und steuerfrei obenauf.
const ABSICHERUNG_SUMMEN = {
  false: { customerShippingNet: 31.93, shippingVat: 6.07, customerShippingGross: 38,
           insuranceGross: 10, customerTotalNet: 41.93, customerTotalGross: 48 },
  true: { customerShippingNet: 35.11, shippingVat: 6.67, customerShippingGross: 41.78,
          insuranceGross: 10, customerTotalNet: 45.11, customerTotalGross: 51.78 },
};

// Geschäftsadresse, Privatadresse und Zuschlag Privatadresse — mit Standardaufschlag und MwSt., wie der Server sie nennt.
// `absicherung: true` ist der gemessene Fall (Absicherungsextra im Quote, Warenwert 500 €).
const zustandMehrpaket = ({ absicherung = false } = {}) => lieferadressZustand({
  offerId: MEHRPAKET.offerId,
  geschaeft: { net: 31.93, vat: 6.07, gross: 38 },
  privat: { net: 35.11, vat: 6.67, gross: 41.78 },
  zuschlag: { net: 3.18, vat: 0.6, gross: 3.78 },
  ...(absicherung ? { insuranceAvailable: true, insuranceDetails: COVER_500 } : {}),
});

const absicherungsAntwort = (body, lz) => ({
  selectedInsurance: "transit_cover",
  insurance: { coverValue: body.coverValue, excessValue: 20, goodsAreNew: body.goodsAreNew,
               goodsAreFragile: body.goodsAreFragile, insuranceGross: 10 },
  totals: ABSICHERUNG_SUMMEN[String(lz.bound)],
  tariff: { insuranceAvailable: true, insuranceDetails: lz.insuranceDetails },
  components: [...bestandteile(lz, lz.bound), ABSICHERUNG_ZEILE],
  priceRevision: lz.revision, priceChangeAccepted: false,
});

/* ══════════ Belege und Sendungen ══════════ */

const BELEG = (id, type, ordinal, label, carrierReference, labelSize) => ({
  type, category: "SHIPPING", status: "ready", label, ordinal, carrierReference, labelSize,
  downloadPath: `/api/shipments/${id}/provider-documents/${type}/${ordinal}`,
});
// GEMESSEN: ein A4- und ein Thermodruck-PDF (je eine Seite je Paket) mit derselben Nummer — bewusst Thermodruck zuerst,
// die Reihenfolge der Oberfläche darf nicht an der Antwort hängen.
const MEHRPAKET_BELEGE = [
  BELEG(CE_ID, "LABEL", 1, "Versandlabel (Thermodruck)", AWB_MEHRPAKET, "THERMAL"),
  BELEG(CE_ID, "LABEL", 0, "Versandlabel (A4)", AWB_MEHRPAKET, "A4"),
];
const MEHRPAKET_KNOEPFE = ["Versandlabel (A4) herunterladen", "Versandlabel (Thermodruck) herunterladen"];
// GENERISCH — ebenfalls unsortiert.
const MEHRFACH_BELEGE = [
  BELEG(CE_ID_MEHRFACH, "COLLECTION_LABEL", 0, "Abholetikett (A4)", AWB_ABHOLUNG, "A4"),
  BELEG(CE_ID_MEHRFACH, "LABEL", 3, "Versandlabel 2 von 2 (Thermodruck)", AWB_2, "THERMAL"),
  BELEG(CE_ID_MEHRFACH, "LABEL", 0, "Versandlabel 1 von 2 (A4)", AWB_1, "A4"),
  BELEG(CE_ID_MEHRFACH, "LABEL", 2, "Versandlabel 2 von 2 (A4)", AWB_2, "A4"),
  BELEG(CE_ID_MEHRFACH, "LABEL", 1, "Versandlabel 1 von 2 (Thermodruck)", AWB_1, "THERMAL"),
];
const EXPRESS_BELEGE = [
  BELEG(CE_ID_EXPRESS, "LABEL", 1, "Versandlabel (Thermodruck)", AWB_EXPRESS, "THERMAL"),
  BELEG(CE_ID_EXPRESS, "LABEL", 0, "Versandlabel (A4)", AWB_EXPRESS, "A4"),
];
// Die Dateinamen, wie der Server sie bildet: eine Nummer → nur das Format; mehrere Nummern → Position und Format.
const DATEINAMEN = {
  [CE_ID]: { "LABEL/0": `Versandlabel-${AB}-A4.pdf`, "LABEL/1": `Versandlabel-${AB}-Thermodruck.pdf` },
  [CE_ID_MEHRFACH]: {
    "LABEL/0": `Versandlabel-${AB_MEHRFACH}-1-A4.pdf`, "LABEL/1": `Versandlabel-${AB_MEHRFACH}-1-Thermodruck.pdf`,
    "LABEL/2": `Versandlabel-${AB_MEHRFACH}-2-A4.pdf`, "LABEL/3": `Versandlabel-${AB_MEHRFACH}-2-Thermodruck.pdf`,
    "COLLECTION_LABEL/0": `Abholetikett-${AB_MEHRFACH}-A4.pdf`,
  },
};

const SENDUNG = (over) => ({
  status: "booked", selected_carrier: "ups", created_at: `${HEUTE}T10:00:00Z`, order_number: null,
  cancellation_status: null, ...over,
});
const SENDUNGEN = [
  SENDUNG({ id: CE_ID, weight: 4, price_final: 51.78, order_confirmation_number: AB, business_order_number: "CE-BS26-01026",
            tracking_number: AWB_MEHRPAKET, tracking_references: [AWB_MEHRPAKET] }),
  SENDUNG({ id: CE_ID_MEHRFACH, weight: 4, price_final: 38, order_confirmation_number: AB_MEHRFACH,
            business_order_number: "CE-BS26-01027", tracking_number: AWB_1, tracking_references: [AWB_1, AWB_2] }),
  SENDUNG({ id: CE_ID_EXPRESS, weight: 2, price_final: 37.69, order_confirmation_number: AB_EXPRESS,
            business_order_number: "CE-BS26-01029", tracking_number: AWB_EXPRESS, tracking_references: [AWB_EXPRESS] }),
];

const EV = (status, description, location, date, time) => ({ status, description, location, dateTime: { date, time } });
const EINZELNUMMER = (shipmentId, nummer) => ({
  shipmentId, tracking: null, trackingAvailable: true, trackingNumber: nummer,
  trackingReferences: [nummer], trackingStatus: null, carrier: "UPS", carrierTrackingPage: null, source: "local",
});
const TRACKING = {
  [CE_ID]: EINZELNUMMER(CE_ID, AWB_MEHRPAKET),
  [CE_ID_MEHRFACH]: {
    shipmentId: CE_ID_MEHRFACH, tracking: null, trackingAvailable: true, trackingNumber: AWB_1, trackingReferences: [AWB_1, AWB_2],
    trackingStatus: "in_transit", trackingStatusText: "Picked up", carrier: "UPS", carrierTrackingPage: null,
    liveTracking: true, source: "live",
    trackingLegs: [
      { carrier: "UPS", trackingReference: AWB_1, status: "in_transit", carrierTrackingPage: null,
        events: [EV("in_transit", "Picked up", "Aschaffenburg DE", MONTAG, "15:12:00")] },
      { carrier: "UPS", trackingReference: AWB_2, status: "in_transit", carrierTrackingPage: null,
        events: [EV("in_transit", "Picked up", "Aschaffenburg DE", MONTAG, "15:12:30")] },
    ],
  },
  [CE_ID_EXPRESS]: EINZELNUMMER(CE_ID_EXPRESS, AWB_EXPRESS),
};
const DOKUMENTE = { [CE_ID]: MEHRPAKET_BELEGE, [CE_ID_MEHRFACH]: MEHRFACH_BELEGE, [CE_ID_EXPRESS]: EXPRESS_BELEGE };

const buchungsAntwort = (body, lz) => {
  const versichert = !!body.insuranceSelection && body.insuranceSelection.type === "transit_cover";
  const versand = lz.bound ? lz.privat : lz.geschaeft;
  return {
    message: "Sendung gebucht", ceShipmentId: CE_ID, invoiceNumber: "CE-RE26-01026",
    businessOrderNumber: "CE-BS26-01026", dueDate: null,
    amount: versichert ? ABSICHERUNG_SUMMEN[String(lz.bound)].customerTotalGross : versand.gross,
    billingMode: "single", testBooking: false, voucherCode: null, deliveryNote: null,
    orderConfirmation: { number: AB, issuedAt: `${HEUTE}T10:00:00Z` },
    shippingDocuments: MEHRPAKET_BELEGE,
    priceComponents: [...bestandteile(lz, lz.bound), ...(versichert ? [ABSICHERUNG_ZEILE] : [])],
  };
};

/* ══════════ Prüfregeln ══════════ */

// Keine Einkaufsquelle, keine interne Kennung, kein Rohname des Anbieters — ohne Rücksicht auf Groß-/Kleinschreibung …
const VERBOTEN = /transglobal|jumingo|service[\s-]*id\b|quote[\s-]*id\b|UPS Express Saver|UPS Standard Multi|Standard Single|providerServiceRef|shipper_tariff_id|itemdescription|ce_projected|undefined|\bnull\b/i;
// … und Positions- und Servicecodes als eigene Wörter.
const VERBOTENE_CODES = /\bTG\b|\bS2[2369]\b|\bCOLFEE\b|\bRES\b|\bINS\b|\bFRT\b/;
// Der Name „Express" verspricht nichts: keine Uhrzeit, kein Vormittag, keine Garantie.
const KEINE_ZUSAGE = /10:30|12:00|vormittag|garantiert|garantie|tagesende|zustellung bis/i;
// Was ein Angebot ohne belegte Angabe nie sagt: belegfreie Grenzen und Formeln.
const KEINE_ERFUNDENE_GRENZE = /70 kg|5\.000|volumengewicht|gurtmaß|länge|max\. gewicht/i;
const JUMINGO_ONLY = [/\/pickup-window/, /\/cart-total/, /\/commercial-invoice/];

let server, browser;

/* Das Szenario: `tariffs` (Vergleich), `lz` (Zustand der Lieferadresse), `sendungen` (Meine Sendungen). */
async function setup(page, szenario = {}) {
  const p = { pfade: [], calc: [], book: [], reprice: [], anfragen: [] };
  const lz = szenario.lz || zustandMehrpaket();
  p.lz = lz;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    p.pfade.push(pfad);
    const beleg = /^\/api\/shipments\/(\d+)\/provider-documents\/([A-Z_]+)\/(\d)$/.exec(pfad);
    if (beleg) {
      const name = (DATEINAMEN[beleg[1]] || {})[`${beleg[2]}/${beleg[3]}`] || null;
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
      const body = req.postDataJSON();
      p.reprice.push(body);
      if (lz.bound === null) {
        return json({ error: "Bitte wählen Sie zuerst die Art der Lieferadresse.", code: "PRICE_INPUTS_REQUIRED" }, 409);
      }
      if (lz.insuranceAvailable !== true) {
        return json({ error: "Die Zusatzabsicherung ist für dieses Angebot nicht verfügbar.", code: "INSURANCE_UNAVAILABLE" }, 409);
      }
      lz.insuranceSelected = true;
      return json(absicherungsAntwort(body, lz));
    }
    if (pfad.includes("/api/jumingo/book")) {
      const body = req.postDataJSON();
      p.book.push(body);
      return json(buchungsAntwort(body, lz));
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

async function warteAufText(page, selektor, teil, timeout = 10000) {
  await page.waitForFunction(({ s, t }) => {
    const el = document.querySelector(s);
    return !!el && el.textContent.replace(/ /g, " ").includes(t);
  }, { s: selektor, t: teil }, { timeout });
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

/* Ein Angebot, das nur noch auf die Art der Lieferadresse wartet: auswählbar, vorläufiger Preis, Zuschlagshinweis — keine
   Auszeichnung, keine Abholung heute, keine Prognose. Sendungsverfolgung und Drucker kommen aus den Serverfeldern. */
async function istAuswaehlbar(karte, name) {
  assert.doesNotMatch(await karte.getAttribute("class"), /offer-card--unavailable/, `${name}: als gesperrt dargestellt`);
  const cta = karte.locator("button.offer-cta-btn");
  assert.equal(await cta.isEnabled(), true, `${name}: der CTA ist gesperrt`);
  assert.match(await inhalt(cta), /Angebot auswählen/, name);
  const text = await inhalt(karte);
  for (const erwartet of ["Vorläufiger Preis", "Sendungsverfolgung", "Drucker erforderlich"]) {
    assert.ok(text.includes(erwartet), `${name}: „${erwartet}“ fehlt: ${text}`);
  }
  assert.equal(await inhalt(karte.locator(".offer-surcharge-hint")), "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.", name);
  assert.doesNotMatch(text, /ab \d+,\d{2} €/, `${name}: „ab“-Betrag`);
  assert.equal(await karte.locator(".offer-sameday-surcharge, .offer-sameday-until").count(), 0, `${name}: Abholung heute`);
  assert.equal(await karte.locator(".offer-badge").count(), 0, `${name}: ein vorläufiges Angebot trägt eine Auszeichnung`);
  assert.notEqual(await inhalt(karte.locator(".offer-tl-node--end .offer-tl-title")), "Voraussichtliche Lieferung",
    `${name}: ohne kuratierte Prognose erscheint eine voraussichtliche Lieferung`);
}

/* Die Teile einer Karte liegen seitlich vollständig in ihr. */
async function liegtInKarte(karte, selektoren, wo) {
  for (const sel of selektoren) {
    const el = karte.locator(sel);
    await el.scrollIntoViewIfNeeded();
    assert.ok(await el.isVisible(), `${wo}: ${sel} ist nicht sichtbar`);
    const a = await karte.boundingBox();
    const i = await el.boundingBox();
    assert.ok(i.x >= a.x - 1 && i.x + i.width <= a.x + a.width + 1, `${wo}: ${sel} ragt aus der Karte`);
  }
}

async function beleg(page, name) {
  const ordner = path.join(process.cwd(), "tests", "e2e", "screenshots");
  mkdirSync(ordner, { recursive: true });
  await page.screenshot({ path: path.join(ordner, `ups-family-${name}.png`), fullPage: false });
}

/* Neue Sendung mit zwei Packstücken bis zur gebundenen Art der Lieferadresse. `vorDerAuswahl` prüft den Vergleich. */
async function bucheMehrpaket(page, { privat = false, lz, vorDerAuswahl } = {}) {
  const p = await setup(page, { tariffs: VERGLEICH_ZWEI_PAKETE, lz });
  await zuDenAngeboten(page, { paket: ZWEI_PAKETE });
  if (vorDerAuswahl) await vorDerAuswahl(page);
  await karteVon(page, MEHRPAKET).locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await waehleLieferadresse(page, privat);
  return p;
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

async function bestaetigenUndBuchen(page) {
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

test("A — Vergleich: Standard- und Expressversand auswählbar; UPS · Express als Preisauskunft", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  assert.equal(await page.locator(".offer-card").count(), 4, "nicht alle Angebote stehen im Vergleich");
  assert.equal(await page.locator(".offer-card--unavailable").count(), 1);

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

  // Brutto: derselbe Umschalter wie für jedes Angebot, der Betrag vom Server.
  await page.getByRole("button", { name: "inkl. MwSt.", exact: true }).click();
  await page.waitForFunction((s) => (document.querySelector(s)?.textContent || "").replace(/ /g, " ").includes("37,69"),
    `.offer-card:has(button[aria-controls="offer-details-${EXPRESS.offerId}"]) .offer-price`, { timeout: 10000 });
  assert.equal(await inhalt(express.locator(".offer-price")), "37,69 €");

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

test("C — Details UPS · Standardversand Mehrpaket: bisheriger Detailbereich mit Serverfähigkeiten und Servergrenze — kein Profil", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page, { tariffs: VERGLEICH_ZWEI_PAKETE });
  await zuDenAngeboten(page, { paket: ZWEI_PAKETE });
  const panel = await oeffneDetails(page, MEHRPAKET);

  assert.equal(await panel.locator("[data-profile-section]").count(), 0, "ohne kuratiertes Profil erscheint ein Profil");
  // Vor der Bindung sagt der Server nichts über die Absicherung — deshalb kein Versicherungsabschnitt.
  assert.deepEqual(await alleTexte(panel.locator(".offer-detail-section-title")),
    ["Hauptmerkmale", "Einschränkungen", "Termin & Abholung", "Preisaufschlüsselung"]);
  const merkmale = await alleTexte(panel.locator(".offer-feature-label"));
  const werte = await alleTexte(panel.locator(".offer-feature-value"));
  const merkmal = (name) => werte[merkmale.indexOf(name)];
  assert.equal(merkmal("Voraussichtliche Laufzeit"), "1–5 Tage");
  assert.equal(merkmal("Sendungsverfolgung"), "Inklusive");
  assert.equal(merkmal("Drucker"), "Erforderlich");
  assert.ok(werte.includes("4,00 kg"), `das Abrechnungsgewicht des Servers fehlt: ${werte.join(" | ")}`);
  // Die einzige Grenze ist die des Servers: zwei Packstücke. Kein Gewicht, keine Maße, keine Formel.
  assert.deepEqual(await alleTexte(panel.locator(".offer-limit-item")),
    ["Mit diesem Versandtarif können max. 2 Packstücke pro Sendung verschickt werden."]);
  const text = norm(await panel.textContent());
  const erfunden = text.match(KEINE_ERFUNDENE_GRENZE);
  assert.equal(erfunden, null, `belegfreie Angabe: „${erfunden && erfunden[0]}“`);
  assert.doesNotMatch(text, /Voraussichtliche Lieferung/);
  assert.doesNotMatch(text, /Keine Zusatzversicherung verfügbar/, "vor der Bindung wird die Absicherung verneint");
  await keinAnbieter(page, "Details UPS · Standardversand Mehrpaket");
  await beleg(page, "mehrpaket-details-1440");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ D — Neue Sendung mit zwei Packstücken ══════════ */

test("D — Neue Sendung, zwei Packstücke: Anzahl und Maße je Paket in der Anfrage; das Mehrpaketprodukt ist auswählbar", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: VERGLEICH_ZWEI_PAKETE });
  await zuDenAngeboten(page, { paket: ZWEI_PAKETE });

  assert.equal(p.calc.length, 1);
  const anfrage = p.calc[0];
  assert.deepEqual([anfrage.packageCount, anfrage.weight, anfrage.length, anfrage.width, anfrage.height], [2, 2, 30, 20, 15],
    "die Anfrage trägt nicht die Angaben je Paket");
  assert.ok(!("packages" in anfrage), "die Oberfläche baut selbst eine Paketliste");
  assert.equal(await page.locator(".offer-card").count(), 2);
  const karte = karteVon(page, MEHRPAKET);
  assert.equal(await inhalt(karte.locator(".offer-carrier-name")), "UPS");
  assert.equal(await inhalt(karte.locator(".offer-service-type")), "Standardversand Mehrpaket");
  assert.equal(await inhalt(karte.locator(".offer-eta")), "1–5 Tage");
  assert.equal(await inhalt(karte.locator(".offer-price")), "31,93 €");
  await istAuswaehlbar(karte, "UPS · Standardversand Mehrpaket (2 Pakete)");
  // Die Adressfrage entsteht erst auf der Buchungsseite — der Vergleich fragt nichts an.
  assert.deepEqual(p.anfragen, [], "der Vergleich stellte eine Zuschlagsanfrage");

  await page.getByRole("button", { name: "inkl. MwSt.", exact: true }).click();
  await page.waitForFunction((s) => (document.querySelector(s)?.textContent || "").replace(/ /g, " ").includes("38,00"),
    `.offer-card:has(button[aria-controls="offer-details-${MEHRPAKET.offerId}"]) .offer-price`, { timeout: 10000 });
  assert.equal(await inhalt(karte.locator(".offer-price")), "38,00 €");
  assert.equal(await karteVon(page, JM_MEHRPAKET).locator("button.offer-cta-btn").isEnabled(), true);
  await keinAnbieter(page, "Vergleich mit zwei Packstücken");
  await beleg(page, "mehrpaket-vergleich-1440");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ E — Preisrechner mit zwei Packstücken ══════════ */

test("E — Preisrechner, zwei Packstücke: „Identische Pakete“, Hinweis je Paket, Mehrpaketprodukt auswählbar", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: VERGLEICH_ZWEI_PAKETE });
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await page.fill("#calc-from-zip", "63741");
  await page.fill("#calc-from-city", "Aschaffenburg");
  await page.fill("#calc-to-zip", "10115");
  await page.fill("#calc-to-city", "Berlin");
  await page.fill("#calc-packageCount", "2");
  await page.fill("#calc-weight", "2");
  await page.fill("#calc-length", "30");
  await page.fill("#calc-width", "20");
  await page.fill("#calc-height", "15");
  const feld = page.locator(".field:has(#calc-packageCount)");
  assert.equal(await inhalt(feld.locator(".field-hint")), "Identische Pakete");
  assert.equal(await inhalt(page.locator(".pkg-count-note")), "Gewicht und Maße gelten je Paket. Der Preis gilt für alle Pakete zusammen.");

  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.deepEqual([p.calc[0].packageCount, p.calc[0].weight, p.calc[0].length, p.calc[0].width, p.calc[0].height],
    [2, 2, 30, 20, 15]);
  const karte = karteVon(page, MEHRPAKET);
  assert.equal(await inhalt(karte.locator(".offer-service-type")), "Standardversand Mehrpaket");
  await istAuswaehlbar(karte, "Preisrechner: UPS · Standardversand Mehrpaket");
  await keinAnbieter(page, "Preisrechner");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ F — Mehrpaketbuchung nach dem gemessenen Fall ══════════ */

test("F — Mehrpaketbuchung (gemessen): Paketzeile, Privatadresse, Absicherung 10,00 €, zwei Belege mit einer Nummer", async () => {
  const { page, fehler } = await neueSeite();
  const p = await bucheMehrpaket(page, { privat: true, lz: zustandMehrpaket({ absicherung: true }) });

  // Schritt 1: Identität, Paketzeile — Gewicht und Maße JE Paket — und die gebundene Privatadresse.
  assert.equal(await inhalt(page.locator(".blsum-carrier")), "UPS");
  assert.equal(await inhalt(page.locator(".blsum-service")), "Standardversand Mehrpaket");
  const paket = page.locator('.shipment-summary-card .summary-detail-row:has(.summary-detail-key:text-is("Paket")) .summary-detail-val');
  assert.equal(await inhalt(paket), PAKETZEILE);
  assert.equal(await page.locator("#booking-labelformat-toggle").count(), 0, "ein Angebot ohne Formatwahl bietet eine an");
  assert.deepEqual(p.lz.bindCalls.map((b) => [b.deliveryIsResidential, b.expectedShippingGross]), [[true, 41.78]]);
  assert.equal(p.reprice.length, 0, "vor Schritt 2 wurde die Absicherung bepreist");
  await keinAnbieter(page, "Schritt 1 Mehrpaket");

  // Schritt 2: dieselbe Paketzeile; die Absicherung nach Warenwert — 1:1 und steuerfrei, kein Aufschlag.
  await zuSchritt2(page);
  assert.equal(await inhalt(page.locator('.booking-confirm-row:has(span:text-is("Paket")) .booking-confirm-val')), PAKETZEILE);
  await absichern(page);
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  assert.deepEqual(p.reprice.at(-1), { offerId: MEHRPAKET.offerId, coverValue: 500, goodsAreNew: true, goodsAreFragile: false });
  await warteAufText(page, ".blsum-price-gross", "51,78");
  assert.match(await inhalt(page.locator('[data-component="transport_insurance"]')),
    /Zusätzliche Transportabsicherung\s*steuerfrei\s*10,00 €/);
  const summe = await inhalt(page.locator(".booking-confirm-box"));
  assert.match(summe, /Versicherter Betrag\s*500,00 €/);
  assert.match(summe, /Selbstbeteiligung\s*20,00 €/);
  assert.match(summe, /MwSt\. 19 %\s*6,67 €/);
  assert.match(summe, /Gesamtbetrag brutto\s*51,78 €/);

  await bestaetigenUndBuchen(page);
  assert.equal(p.book.length, 1);
  const body = p.book[0];
  assert.equal(body.offerId, MEHRPAKET.offerId);
  assert.equal(body.ceShipmentId, CE_ID);
  assert.deepEqual(body.priceInputs, { deliveryIsResidential: true });
  assert.equal(body.insuranceSelection && body.insuranceSelection.type, "transit_cover");
  assert.equal(body.confirmedTotalGross, 51.78);
  assert.ok(!("labelFormat" in body), "ein Angebot ohne Formatwahl sendet ein Labelformat");
  assert.equal(body.tariffId ?? null, null);

  // Erfolg: die Bestandteile des Servers — Versand, EIN Zuschlag Privatadresse, Absicherung.
  const recap = await inhalt(page.locator(".booking-success-recap"));
  assert.match(recap, /Carrier\s*UPS — Standardversand Mehrpaket/);
  assert.match(recap, /Versand netto\s*31,93 €/);
  assert.match(recap, /Zuschlag Privatadresse netto\s*3,18 €/);
  assert.match(recap, /Zusätzliche Transportabsicherung/);
  assert.match(recap, /Gesamtbetrag brutto\s*51,78 €/);
  // Zwei Belege mit den Servernamen — ein Versandlabel in zwei Formaten, kein „1 von 2", kein Abholetikett.
  const knoepfe = belegKnoepfe(page);
  assert.deepEqual((await knoepfe.allTextContents()).map((t) => t.trim()), MEHRPAKET_KNOEPFE);
  assert.equal(await page.locator(".booking-success-wrap").getByRole("button", { name: "Label herunterladen" }).count(), 0);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator(".booking-success-wrap").getByRole("button", { name: "Versandlabel (Thermodruck) herunterladen" }).click(),
  ]);
  assert.ok(p.pfade.includes(`/api/shipments/${CE_ID}/provider-documents/LABEL/1`), "der Thermodruckbeleg kam nicht über seinen Pfad");
  assert.equal(download.suggestedFilename(), DATEINAMEN[CE_ID]["LABEL/1"]);
  assert.ok(!p.pfade.some((x) => /\/label$/.test(x)), "der Sammelpfad des ersten Labels wurde angesprochen");
  const jumingoOnly = p.pfade.filter((x) => JUMINGO_ONLY.some((re) => re.test(x)));
  assert.deepEqual(jumingoOnly, [], `JUMiNGO-only-Endpunkte angesprochen: ${jumingoOnly.join(", ")}`);
  for (const anfrage of [...p.book, ...p.calc, ...p.reprice, ...p.anfragen.map((a) => a.body)]) {
    assert.doesNotMatch(JSON.stringify(anfrage), /transglobal|serviceId|providerServiceRef|quoteId/i);
  }
  await keinAnbieter(page, "Erfolg Mehrpaket");
  await beleg(page, "mehrpaket-erfolg-1440");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ G — Meine Sendungen ══════════ */

test("G — Meine Sendungen: Mehrpaketsendung mit einer Nummer und zwei Belegen; generisch zwei Nummern; UPS · Express", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { sendungen: SENDUNGEN });
  await zurSendungsliste(page);
  await page.waitForSelector("table tbody tr", { timeout: 20000 });

  // Gemessen: eine Nummer für beide Pakete — die bisherige Einzelanzeige. Generisch: mehrere Nummern werden gezählt.
  const mehrpaket = zeileVon(page, AB);
  assert.match(await mehrpaket.innerText(), new RegExp(`Trackingnummer: ${AWB_MEHRPAKET}`));
  assert.doesNotMatch(await mehrpaket.innerText(), /Trackingnummern/);
  assert.match(await zeileVon(page, AB_MEHRFACH).innerText(), /2 Trackingnummern/);
  const einzel = zeileVon(page, AB_EXPRESS);
  assert.match(await einzel.innerText(), new RegExp(`Trackingnummer: ${AWB_EXPRESS}`));
  assert.doesNotMatch(await einzel.innerText(), /Trackingnummern/);

  // Die Belege der Mehrpaketsendung: ein Versandlabel in zwei Formaten, dieselbe Nummer, kein Abholetikett.
  await mehrpaket.getByRole("button", { name: "Dokumente" }).click();
  await page.waitForSelector(".sdoc-group-title", { timeout: 15000 });
  const belege = page.locator(".sdoc-group").first();
  assert.deepEqual(await alleTexte(belege.locator(".sdoc-row-name")), ["Versandlabel (A4)", "Versandlabel (Thermodruck)"]);
  assert.deepEqual(await alleTexte(belege.locator(".sdoc-row-number")), [AWB_MEHRPAKET, AWB_MEHRPAKET]);
  assert.equal(await belege.getByRole("button", { name: /Herunterladen/ }).count(), 2);
  assert.doesNotMatch(norm(await belege.innerText()), /Abholetikett|von 2/);
  const [thermo] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    belege.locator(".sdoc-row", { hasText: "Versandlabel (Thermodruck)" }).getByRole("button", { name: /Herunterladen/ }).click(),
  ]);
  assert.ok(p.pfade.includes(`/api/shipments/${CE_ID}/provider-documents/LABEL/1`));
  assert.equal(thermo.suggestedFilename(), DATEINAMEN[CE_ID]["LABEL/1"]);
  await keinAnbieter(page, "Dokumente Mehrpaket");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".sdoc-drawer", { state: "detached", timeout: 10000 }).catch(() => {});

  // GENERISCH: zwei Nummern — Tracking vollständig und je Etappe, Belege „1 von 2", das Abholetikett zuletzt.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("table tbody tr", { timeout: 20000 });
  const mehr = zeileVon(page, AB_MEHRFACH);
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
  assert.ok(p.pfade.includes(`/api/shipments/${CE_ID_MEHRFACH}/provider-documents/LABEL/2`));
  assert.equal(download.suggestedFilename(), DATEINAMEN[CE_ID_MEHRFACH]["LABEL/2"]);
  await keinAnbieter(page, "Dokumente mit mehreren Nummern");
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
  test(`H — ${breite} px: Preisauskunft, Mehrpaketbuchung, Erfolg und Sendungsliste ohne horizontalen Überlauf`, async () => {
    const vergleich = await neueSeite({ width: breite, height: 900 });
    await setup(vergleich.page);
    await zuDenAngeboten(vergleich.page);
    await liegtInKarte(karteVon(vergleich.page, EXPRESS), [".offer-service-type", ".offer-price", "button.offer-cta-btn"],
      `${breite}px UPS · Express`);
    await oeffneDetails(vergleich.page, EXPRESS);
    assert.ok(await querUeberlauf(vergleich.page) <= 0, `${breite}px: Vergleich mit horizontalem Überlauf`);
    await beleg(vergleich.page, `vergleich-${breite}`);
    assert.deepEqual(vergleich.fehler, []);
    await vergleich.page.close();

    const buchung = await neueSeite({ width: breite, height: 900 });
    await bucheMehrpaket(buchung.page, {
      vorDerAuswahl: async (page) => {
        await liegtInKarte(karteVon(page, MEHRPAKET),
          [".offer-service-type", ".offer-price", "button.offer-cta-btn", ".offer-surcharge-hint"],
          `${breite}px UPS · Standardversand Mehrpaket`);
        assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Vergleich mit zwei Packstücken mit horizontalem Überlauf`);
      },
    });
    assert.ok(await buchung.page.locator(".shipment-summary-card").isVisible());
    assert.ok(await querUeberlauf(buchung.page) <= 0, `${breite}px: Schritt 1 mit horizontalem Überlauf`);
    await zuSchritt2(buchung.page);
    await bestaetigenUndBuchen(buchung.page);
    const kanten = await belegKnoepfe(buchung.page).evaluateAll((els) => els.map((b) => {
      const r = b.getBoundingClientRect();
      return [r.left, r.right];
    }));
    assert.equal(kanten.length, 2, `${breite}px: nicht jeder Beleg hat seinen Knopf`);
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
    assert.match(await liste.page.locator(".ce-list-card", { hasText: AB }).first().innerText(),
      new RegExp(`Trackingnummer: ${AWB_MEHRPAKET}`));
    const karte = liste.page.locator(".ce-list-card", { hasText: AB_MEHRFACH }).first();
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
