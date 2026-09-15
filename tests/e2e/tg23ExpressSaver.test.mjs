// E2E: TG23 — UPS Expressversand im gemeinsamen Angebots- und Buchungsflow. Echter Dev-Server, echter Browser,
// gemocktes Backend (Optionen und Bindung über helpers/residentialPriceInputs.mjs).
//
// Es gibt KEINE eigene TG23-Oberfläche: dasselbe Angebotsformat wie der Referenzservice, andere Serverwerte. Gemessen
// wird, dass der gemeinsame Flow genau diese Werte zeigt — und nichts darüber hinaus:
//   A  Karte: UPS · Expressversand · 1 Tag · „Voraussichtliche Lieferung“ mit einem Tag, vorläufiger Preis;
//      keine Zustelluhrzeit, keine Zusage, keine Auszeichnung (A2: Abholung Freitag → Lieferung Montag)
//   B  Details: fünf Abschnitte mit dem Express-Profil (1 Packstück, 70 kg, ÷ 5.000, Tracking, A4/Thermodruck, Paletten/Koffer)
//   C  Art der Lieferadresse: vorläufiger Preis, Serverbeträge, Sperre ohne Wahl, Bindung, neuer Preis
//   D  Abholung am selben Tag: Zuschlag, wirksamer Abholschluss, frische und gebuchte „bereit ab“-Zeit
//   E  Privatadresse + Abholung heute: beide Bestandteile in Serverreihenfolge
//   F  Absicherung: 500 € mit 10,00 € (1:1, steuerfrei, ohne Aufschlag) · 50 € Grundabsicherung · über 2.500 € kein Zusatz
//   G  Buchungsseite: Identität, Lieferprognose TT.MM.JJJJ, Abholtag, Labelhinweis, Kundenreferenz, Buchungsschranke
//   H  Erfolg: UPS — Expressversand, Bestandteile, Labelbeleg A4/Thermodruck
//   I  JUMiNGO-Pendant „Expressversand“ daneben: beide sichtbar, JUMiNGO unverändert (Anbieterdatum, Buchungsweg)
//   J  White Label: keine Einkaufsquelle, keine ServiceID, keine Quote- oder Positionscodes — auf allen Flächen
//   K  1440 / 834 / 390 px: Karte, Details, Buchung und Erfolg ohne horizontalen Überlauf
//
// Beträge: Route R2 (63741 → 10115, 2 kg, 30 × 20 × 15 cm), Expressaufschlag 30 %, MwSt. 19 % — mit den
// Produktionspreisfunktionen des Backends gerechnet und hier als FIXTUREWERTE eingetragen. Die Oberfläche rechnet nichts.
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

const PORT = 5398, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 4998;
const AB = "CE-AB26-00998";
const AWB = "1Z999AA10000000998";
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
const lang = (tag) => `${tag.slice(8, 10)}.${tag.slice(5, 7)}.${tag.slice(0, 4)}`;
const naechsterVersandtag = (tag) => { let t = plusTage(tag, 1); while ([0, 6].includes(wochentag(t))) t = plusTage(t, 1); return t; };

// Der Berliner Geschäftstag — ausschließlich als FIXTUREWERT des gemockten Servers.
const HEUTE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const HEUTE_DE = lang(HEUTE);
// Laufzeit „1": Montag + 1 Versandtag → Dienstag · Freitag + 1 → Montag · heute + 1 → nächster Versandtag.
const MONTAG = naechster(plusTage(HEUTE, 7), 1);
const DIENSTAG = plusTage(MONTAG, 1);
const FREITAG = naechster(plusTage(HEUTE, 7), 5);
const FREITAG_PLUS_1 = plusTage(FREITAG, 3);
const HEUTE_PLUS_1 = naechsterVersandtag(HEUTE);

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10998",
};

// Route R2 des späteren Staging-Smokes: 63741 Aschaffenburg → 10115 Berlin, ein Packstück, 2 kg, 30 × 20 × 15 cm.
const ABSENDER = { ...STANDARD_ABSENDER, zip: "63741", city: "Aschaffenburg" };
const EMPFAENGER = { ...STANDARD_EMPFAENGER, zip: "10115", city: "Berlin" };
const PAKET_R2 = { packageCount: "1", weight: "2", length: "30", width: "20", height: "15" };

/* ══════════ Serverbeträge (Fixturewerte, nie gerechnet) ══════════
 * Einkauf: Fracht 20,19 · Zuschlag Privatadresse 2,65 · Gebühr Abholung heute 2,52 · Absicherung 10,00 (Warenwert 500).
 * Expressaufschlag 30 % und MwSt. 19 % über die zentrale Preisfunktion; Zuschläge als Szenariodifferenz in ganzen Cent.
 *   B   künftiger Abholtag, Geschäftsadresse   26,25 / 4,99 / 31,24
 *   P   künftiger Abholtag, Privatadresse      29,69 / 5,64 / 35,33   Zuschlag P − B    3,44 / 0,65 / 4,09
 *   S   Abholung heute, Geschäftsadresse       29,52 / 5,61 / 35,13   Zuschlag S − B    3,27 / 0,62 / 3,89
 *   PS  Abholung heute, Privatadresse          32,97 / 6,26 / 39,23   Zuschlag PS − S   3,45 / 0,65 / 4,10
 * Die Absicherung ist steuerfrei und ohne Aufschlag: 10,00 € Einkauf = 10,00 € Kundenpreis. */
const B = { net: 26.25, vat: 4.99, gross: 31.24 };
const P = { net: 29.69, vat: 5.64, gross: 35.33 };
const RES_KUENFTIG = { net: 3.44, vat: 0.65, gross: 4.09 };
const S = { net: 29.52, vat: 5.61, gross: 35.13 };
const SD = { net: 3.27, vat: 0.62, gross: 3.89 };
const PS = { net: 32.97, vat: 6.26, gross: 39.23 };
const RES_HEUTE = { net: 3.45, vat: 0.65, gross: 4.1 };
const ABSICHERUNG_EINKAUF = 10;

const ABSICHERUNG_TOTALS = {
  kuenftig: {
    false: { customerShippingNet: 26.25, shippingVat: 4.99, customerShippingGross: 31.24,
             insuranceGross: 10, customerTotalNet: 36.25, customerTotalGross: 41.24 },
    true: { customerShippingNet: 29.69, shippingVat: 5.64, customerShippingGross: 35.33,
            insuranceGross: 10, customerTotalNet: 39.69, customerTotalGross: 45.33 },
  },
  heute: {
    false: { customerShippingNet: 29.52, shippingVat: 5.61, customerShippingGross: 35.13,
             insuranceGross: 10, customerTotalNet: 39.52, customerTotalGross: 45.13 },
    true: { customerShippingNet: 32.97, shippingVat: 6.26, customerShippingGross: 39.23,
            insuranceGross: 10, customerTotalNet: 42.97, customerTotalGross: 49.23 },
  },
};
const ABSICHERUNG_ZEILE = { type: "transport_insurance", taxable: false, net: 10, vat: 0, gross: 10 };

// Die Produktangaben des Servers — Codes und Zahlen, kein Text.
const PROFIL = {
  summaryKey: "express_urgent", volumetricDivisor: 5000, notAccepted: ["pallets", "suitcases"],
  basicCoverMaxGoodsValue: 50, maxCoverValue: 2500,
};

// Die Absicherungsbeschreibung des gebundenen Angebots — je Warenwert.
const COVER_BASIS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
  coverValueSource: "goods_value", basicCoverMaxGoodsValue: 50, maxCoverValue: 2500,
};
const COVER_500 = { ...COVER_BASIS, coverState: "available", coverValue: 500 };
const COVER_GRUNDSCHUTZ = { ...COVER_BASIS, isInsurable: false, priceOnSelection: false, coverState: "basic_cover_included", coverValue: null };
const COVER_UEBER_HOECHSTDECKUNG = { ...COVER_BASIS, isInsurable: false, priceOnSelection: false, coverState: "above_cover_limit", coverValue: null };

/* Das öffentliche TG23-Angebot — ohne Tarif-ID, ohne ServiceID, ohne Einkaufsspur. */
const TG23 = (extra = {}) => ({
  offerId: "23mo0000000000000000000000000023", publicCarrierId: "ups", publicServiceName: "Expressversand",
  serviceType: "pickup", collectionDate: MONTAG, collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 1, deliveryTime: "1 Tag",
  deliveryProjection: { kind: "estimated", dateMin: DIENSTAG, dateMax: DIENSTAG },
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
const TG_MO = TG23();
const TG_FR = TG23({
  offerId: "23fr0000000000000000000000000023", collectionDate: FREITAG,
  deliveryProjection: { kind: "estimated", dateMin: FREITAG_PLUS_1, dateMax: FREITAG_PLUS_1 },
});
/* Dasselbe Angebot mit Abholung heute: Preis inkl. Zuschlag, wirksamer Abholschluss, Zuschlagsbeträge. */
const TG_HEUTE = TG23({
  offerId: "23sd0000000000000000000000000023", collectionDate: HEUTE, collectionReadyFrom: "11:30",
  netPrice: S.net, vatAmount: S.vat, finalPrice: S.gross,
  pickupToday: true, pickupTodayUntil: "16:45", sameDaySurchargeNet: SD.net, sameDaySurchargeGross: SD.gross,
  deliveryProjection: { kind: "estimated", dateMin: HEUTE_PLUS_1, dateMax: HEUTE_PLUS_1 },
});

/* Das JUMiNGO-Pendant (EXPRESS SAVER ®) — eigene Anbieterdaten mit Uhrzeit, Tarif-ID, Formatwahl, kein Profil. */
const JM = {
  id: 21, shipper_tariff_id: 3264, offerId: "ju-es-000000000000000000000003264",
  publicCarrierId: "ups", publicCarrierName: "UPS", publicServiceName: "Expressversand", serviceType: "pickup",
  netPrice: 24.9, vatAmount: 4.73, finalPrice: 29.63, currency: "EUR",
  transitDaysMin: 1, transitDaysMax: 1,
  pickupDate: `${MONTAG}T00:00:00Z`, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: `${DIENSTAG}T00:00:00Z`, deliveryTimeUntil: "18:00",
  trackingAvailable: true, printerRequired: true, availableForDate: true, bookable: true, requiredPriceInputs: [],
  labelFormatOptions: ["A4", "A6"], labelSizes: ["A4", "A6"], chargeableWeight: 2,
  tariffLimits: [{ operant: "weight", operator: "<=", value: 70 }],
  insuranceAvailable: false,
};

/* Die Serverzustände der Art der Lieferadresse — je Angebot. */
const zustandKuenftig = (tarif = TG_MO, absicherung = {}) => lieferadressZustand({
  offerId: tarif.offerId, geschaeft: B, privat: P, zuschlag: RES_KUENFTIG,
  insuranceAvailable: absicherung.insuranceAvailable === true, insuranceDetails: absicherung.insuranceDetails ?? null,
});
const zustandHeute = (absicherung = {}) => lieferadressZustand({
  offerId: TG_HEUTE.offerId, geschaeft: S, privat: PS, zuschlag: RES_HEUTE,
  insuranceAvailable: absicherung.insuranceAvailable === true, insuranceDetails: absicherung.insuranceDetails ?? null,
  sameDay: { basis: B, zuschlag: SD, block: { pickupTodayUntil: "16:45", collectionDate: HEUTE, collectionReadyFrom: "11:45" } },
});

const BELEG = (ordinal, label, labelSize) => ({
  type: "LABEL", category: "SHIPPING", status: "ready", label, ordinal, carrierReference: AWB, labelSize,
  downloadPath: `/api/shipments/${CE_ID}/provider-documents/LABEL/${ordinal}`,
});
// Bewusst Thermodruck zuerst — die Reihenfolge der Knöpfe darf nicht an der Antwort hängen.
const FORMATPAAR = [BELEG(1, "Versandlabel (Thermodruck)", "THERMAL"), BELEG(0, "Versandlabel (A4)", "A4")];
const DATEINAME = { 0: `Versandlabel-${AB}-A4.pdf`, 1: `Versandlabel-${AB}-Thermodruck.pdf` };

const absicherungsAntwort = (body, lz) => ({
  selectedInsurance: "transit_cover",
  insurance: { coverValue: body.coverValue, excessValue: 20, goodsAreNew: body.goodsAreNew,
               goodsAreFragile: body.goodsAreFragile, insuranceGross: ABSICHERUNG_EINKAUF },
  totals: ABSICHERUNG_TOTALS[lz.sameDay ? "heute" : "kuenftig"][String(lz.bound)],
  tariff: { insuranceAvailable: true, insuranceDetails: lz.insuranceDetails },
  components: [...bestandteile(lz, lz.bound), ABSICHERUNG_ZEILE],
  priceRevision: lz.revision, priceChangeAccepted: false,
});

const buchungsAntwort = (body, lz) => {
  const tg = body.offerId === lz.offerId;
  const versichert = !!body.insuranceSelection && body.insuranceSelection.type === "transit_cover";
  const versand = lz.bound ? lz.privat : lz.geschaeft;
  const amount = !tg ? JM.finalPrice
    : versichert ? ABSICHERUNG_TOTALS[lz.sameDay ? "heute" : "kuenftig"][String(lz.bound)].customerTotalGross
    : versand.gross;
  return {
    message: "Sendung gebucht", ceShipmentId: CE_ID, invoiceNumber: "CE-RE26-00998",
    businessOrderNumber: "CE-BS26-00998", dueDate: null, amount, billingMode: "single",
    testBooking: false, voucherCode: null, deliveryNote: null,
    orderConfirmation: { number: AB, issuedAt: `${HEUTE}T10:00:00Z` },
    shippingDocuments: tg ? FORMATPAAR : [],
    priceComponents: tg ? [...bestandteile(lz, lz.bound), ...(versichert ? [ABSICHERUNG_ZEILE] : [])] : null,
    // Die beim Buchen TATSÄCHLICH gesendete Abholzeit — später als die des Vergleichs.
    ...(tg && lz.sameDay ? { sameDayCollection: { collectionDate: HEUTE, collectionReadyFrom: "12:00" } } : {}),
  };
};

// Endpunkte, die ausschließlich den JUMiNGO-Entwurf betreffen. Ein TG23-Angebot darf keinen davon auslösen.
const JUMINGO_ONLY = [/\/pickup-window/, /\/cart-total/, /\/commercial-invoice/];
// Keine Einkaufsquelle, keine interne Kennung, kein Rohtext des Anbieters — ohne Rücksicht auf Groß-/Kleinschreibung …
const VERBOTEN = /transglobal|jumingo|service[\s-]*id\b|quote[\s-]*id\b|service\s*23\b|UPS Express Saver|providerServiceRef|shipper_tariff_id|same day collection fee|itemdescription|ce_projected/i;
// … und die Positionscodes des Anbieters als eigene Wörter (groß geschrieben; „ins" ist ein deutsches Wort).
const VERBOTENE_CODES = /\bTG\b|\bS23\b|\bCOLFEE\b|\bRES\b|\bINS\b|\bFRT\b/;
// Was das Produktprofil nie sagt: Access Point, Samstag, Maße, Uhrzeit, Zusage, statische Zuschlagspreise.
const NIE_IM_PROFIL = /access\s*point|paketshop|samstag|saturday|länge|gurtmaß|\d+\s*cm\b|garant|\d{1,2}:\d{2}|\d{1,2}\.\d{1,2}\.\d{4}|tagesende|treibstoff|kraftstoff|fuel|entlegen|adresskorrektur/i;
// Keine Zustelluhrzeit und keine Zusage auf der TG23-Karte.
const KEINE_ZUSAGE = /garantiert|garantie|bis 12|bis 18|12:00|18:00|tagesende|zustellung bis/i;
const PROGNOSE_HINWEIS = "Aus Abholtag und Laufzeit berechnet; Wochenenden sind nicht mitgezählt. Feiertage können die Zustellung verschieben.";
const GRUNDSCHUTZ_TEXT = "Bis zu einem Warenwert von 50 € ist bereits eine Grundabsicherung ohne Aufpreis enthalten.";
const HOECHSTDECKUNG_TEXT = "Eine zusätzliche Transportabsicherung ist für diesen Tarif nur bis zu einem Warenwert von 2.500 € möglich.";

let server, browser;

/* Das Szenario: `tariffs`, `lz` (Zustand der Lieferadresse des TG23-Angebots), `book(body, n, lz)`. */
async function setup(page, szenario = {}) {
  const p = { pfade: [], reprice: [], book: [], calc: [], anfragen: [] };
  const lz = szenario.lz || zustandKuenftig();
  p.lz = lz;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    p.pfade.push(pfad);
    const beleg = /^\/api\/shipments\/\d+\/provider-documents\/LABEL\/(\d)$/.exec(pfad);
    if (beleg) {
      return route.fulfill({ status: 200, body: PDF, headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${DATEINAME[beleg[1]]}"`,
        "access-control-expose-headers": "Content-Disposition",
      } });
    }
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    // Nur der JUMiNGO-Entwurf kennt ein Abholzeitfenster.
    if (pfad.includes("/pickup-window")) {
      return json({ pickupWindow: null, availableFrom: `${MONTAG}T09:00:00Z`, availableUntil: `${MONTAG}T17:00:00Z`,
                    minimumMinutes: 120, adjustable: true });
    }
    if (pfad.includes("/api/jumingo/calculate-price")) {
      p.calc.push(req.postDataJSON());
      return json({
        ceShipmentId: CE_ID, tariffs: szenario.tariffs || [TG_MO, JM], availableShippingModes: ["standard", "express"],
        publicCarriers: [{ id: "ups", name: "UPS" }],
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
    if (pfad === `/api/shipments/${CE_ID}/documents`) return json({ shipmentId: CE_ID, documents: FORMATPAAR });
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
const alleTexte = async (loc) => (await loc.allTextContents()).map(norm);
const querUeberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const kurzWarten = (ms) => new Promise((r) => setTimeout(r, ms));
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const panelVon = (page, t) => page.locator(`#offer-details-${t.offerId}`);
const abschnittVon = (panel, id) => panel.locator(`[data-profile-section="${id}"]`);
const buchenKnopf = (page) => page.getByRole("button", { name: /Kostenpflichtig buchen/ });
const schalter = (page, id) => page.locator(`#${id}`).locator("xpath=ancestor::label[1]");

async function zeilenVon(bereich) {
  const rows = bereich.locator(".offer-detail-row");
  const out = [];
  for (let i = 0; i < await rows.count(); i++) {
    out.push([norm(await rows.nth(i).locator(".offer-detail-label").textContent()),
              norm(await rows.nth(i).locator(".offer-detail-value").textContent())]);
  }
  return out;
}

async function warteBis(pruefe, wo, timeout = 10000) {
  const ende = Date.now() + timeout;
  for (;;) {
    if (await pruefe()) return;
    if (Date.now() > ende) throw new Error(`Zeitlimit: ${wo}`);
    await kurzWarten(100);
  }
}

async function neueSeite(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport, acceptDownloads: true });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function zuDenAngeboten(page, { warenwert = 500 } = {}) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, {
    absender: ABSENDER, empfaenger: EMPFAENGER, paket: PAKET_R2,
    sendungsangaben: { declaredContent: "Ersatzteile", declaredGoodsValue: String(warenwert) },
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
  const treffer = text.match(VERBOTEN) || text.match(VERBOTENE_CODES);
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
  await page.screenshot({ path: path.join(ordner, `tg23-${name}.png`), fullPage: false });
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

/* ══════════ A — Karte ══════════ */

test("A — TG23-Karte: UPS · Expressversand · 1 Tag · voraussichtliche Lieferung · vorläufiger Preis — ohne Uhrzeit, Zusage und Auszeichnung", async () => {
  assert.equal(wochentag(DIENSTAG), 2, "Fixture: Montag + 1 Versandtag ist ein Dienstag");
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);

  const karte = karteVon(page, TG_MO);
  assert.equal(await inhalt(karte.locator(".offer-carrier-name")), "UPS");
  assert.equal(await inhalt(karte.locator(".offer-service-type")), "Expressversand");
  assert.equal(await inhalt(karte.locator(".offer-eta")), "1 Tag");
  const ende = karte.locator(".offer-tl-node--end");
  assert.equal(await inhalt(ende.locator(".offer-tl-title")), "Voraussichtliche Lieferung");
  assert.equal(await inhalt(ende.locator(".offer-tl-primary")), kurz(DIENSTAG));
  assert.equal(await ende.locator(".offer-tl-sub").count(), 0, "unter der Prognose steht eine Uhrzeit");
  assert.doesNotMatch(await inhalt(ende), /\d{1,2}:\d{2}|\bUhr\b|–/, "Uhrzeit oder Zeitraum an einer eintägigen Prognose");
  assert.match(await inhalt(karte.locator(".offer-tl-node--start")), /bereit ab 09:00 Uhr/);

  assert.equal(await inhalt(karte.locator(".offer-price")), "26,25 €", "der Kartenpreis ist nicht der Serverpreis");
  const text = await inhalt(karte);
  for (const erwartet of ["Vorläufiger Preis", "Abholung", "Sendungsverfolgung", "Drucker erforderlich"]) {
    assert.ok(text.includes(erwartet), `die Karte zeigt „${erwartet}“ nicht: ${text}`);
  }
  assert.equal(await inhalt(karte.locator(".offer-surcharge-hint")), "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.");
  assert.doesNotMatch(text, /ab \d+,\d{2} €/, "die Karte zeigt einen „ab“-Betrag");
  assert.equal(await karte.locator(".offer-sameday-surcharge, .offer-sameday-until").count(), 0);
  assert.doesNotMatch(text, KEINE_ZUSAGE, "Zustelluhrzeit oder Zusage auf der TG23-Karte");
  assert.equal(await karte.locator(".offer-badge").count(), 0, "ein vorläufiges Angebot trägt eine Auszeichnung");
  assert.deepEqual((await alleTexte(page.locator(".offer-badge"))).filter((b) => /express/i.test(b)), [],
    "es gibt eine Express-Auszeichnung");
  const cta = karte.locator("button.offer-cta-btn");
  assert.equal(await cta.isEnabled(), true, "der CTA ist gesperrt");
  assert.match(await inhalt(cta), /Angebot auswählen/);

  // Brutto: derselbe Umschalter wie für jedes Angebot, der Betrag vom Server.
  await page.getByRole("button", { name: "inkl. MwSt.", exact: true }).click();
  await warteBis(async () => (await inhalt(karte.locator(".offer-price"))) === "31,24 €", "Bruttopreis der Karte");

  // Vor der Auswahl: keine Adressfrage im Vergleich, keine Zuschlags- und keine Absicherungsanfrage.
  assert.equal(p.calc.length, 1);
  assert.doesNotMatch(JSON.stringify(p.calc[0]), /IsResidential|deliveryIsResidential|collectionIsResidential/);
  assert.equal(p.anfragen.length, 0, "vor der Auswahl entstand eine Zuschlagsanfrage");
  assert.equal(p.reprice.length, 0);
  await keinAnbieter(page, "Angebotsliste");
  await beleg(page, "karte-1440");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("A2 — Abholung Freitag, Laufzeit 1 Tag: voraussichtliche Lieferung am Montag — kein Wochenendtag", async () => {
  assert.deepEqual([wochentag(FREITAG), wochentag(FREITAG_PLUS_1)], [5, 1], "Fixture: Freitag + 1 Versandtag ist ein Montag");
  const { page, fehler } = await neueSeite();
  await setup(page, { tariffs: [TG_FR, JM], lz: zustandKuenftig(TG_FR) });
  await zuDenAngeboten(page);
  const ende = karteVon(page, TG_FR).locator(".offer-tl-node--end");
  assert.equal(await inhalt(ende.locator(".offer-tl-title")), "Voraussichtliche Lieferung");
  assert.equal(await inhalt(ende.locator(".offer-tl-primary")), kurz(FREITAG_PLUS_1));
  assert.match(await inhalt(ende.locator(".offer-tl-primary")), /^Mo\., /);
  assert.doesNotMatch(await inhalt(ende), /\bSa\.|\bSo\./, "ein Wochenendtag in der Prognose");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ B — Details ══════════ */

test("B — Details: fünf Abschnitte mit dem Express-Profil; Termin & Abholung und Preisaufschlüsselung bleiben", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  await zuDenAngeboten(page);
  const panel = await oeffneDetails(page, TG_MO);

  assert.deepEqual(await alleTexte(panel.locator(".offer-detail-section-title")),
    ["Hauptmerkmale", "Laufzeit", "Größe & Gewicht", "Transportabsicherung", "Einschränkungen",
     "Termin & Abholung", "Preisaufschlüsselung"]);

  const haupt = abschnittVon(panel, "main");
  assert.equal(await inhalt(haupt.locator(".offer-profile-summary")), "Schneller Expressversand für eilige Sendungen.");
  assert.deepEqual(await alleTexte(haupt.locator(".offer-profile-feature-label")),
    ["Abholung an Ihrer Adresse", "Sendungsverfolgung inklusive", "Versandlabel zum Ausdrucken"]);
  assert.equal(await inhalt(haupt.locator('[data-profile-feature="label"] .offer-profile-feature-value')), "PDF · DIN A4 / Thermodruck");

  const laufzeit = abschnittVon(panel, "transit");
  assert.deepEqual(await zeilenVon(laufzeit), [
    ["Voraussichtliche Laufzeit", "1 Tag"],
    ["Voraussichtliche Lieferung", kurz(DIENSTAG)],
  ]);
  assert.deepEqual(await alleTexte(laufzeit.locator(".offer-profile-note")), [
    "Die Laufzeit ist eine Schätzung des Versanddienstleisters und keine Zustellzusage.",
    PROGNOSE_HINWEIS,
  ]);

  const groesse = abschnittVon(panel, "size");
  assert.deepEqual(await zeilenVon(groesse), [["Packstücke", "1 je Sendung"], ["Max. Gewicht", "70 kg"], ["Abrechnungsgewicht", "2,00 kg"]]);
  assert.deepEqual(await alleTexte(groesse.locator(".offer-profile-note")), [
    "Für die Abrechnung zählt das höhere Gewicht aus tatsächlichem Gewicht und Volumengewicht.",
    "Volumengewicht: L × B × H ÷ 5.000",
  ]);
  assert.deepEqual(await zeilenVon(abschnittVon(panel, "cover")),
    [["Grundabsicherung", "bis 50 € Warenwert"], ["Zusätzliche Transportabsicherung", "bis 2.500 € Warenwert"]]);
  assert.deepEqual(await zeilenVon(abschnittVon(panel, "restrictions")), [["Nicht zugelassen", "Paletten, Koffer"]]);

  // Nichts, was das Profil nie sagt — keine Uhrzeit, keine Zusage, keine Maße, kein Access Point, kein Samstag.
  const profil = norm((await panel.locator("[data-profile-section]").allTextContents()).join(" "));
  assert.ok(profil.length > 200, "das Profil ist leer");
  const treffer = profil.match(NIE_IM_PROFIL);
  assert.equal(treffer, null, `unzulässige Aussage im Profil: „${treffer && treffer[0]}“`);
  assert.equal((profil.match(/zusage/gi) || []).length, 1, "„Zusage“ steht nicht genau einmal verneint");

  // Keine Wiederholung im Detailbereich und kein bisheriges Merkmalsraster daneben.
  const text = norm(await panel.textContent());
  for (const [wort, anzahl] of [["Voraussichtliche Laufzeit", 1], ["Voraussichtliche Lieferung", 1], ["Sendungsverfolgung", 1]]) {
    assert.equal((text.match(new RegExp(wort, "g")) || []).length, anzahl, `„${wort}“ steht nicht genau ${anzahl}-mal in den Details`);
  }
  assert.equal(await panel.locator(".offer-feature-grid, .offer-limit-list").count(), 0, "der bisherige Bereich steht daneben");
  assert.doesNotMatch(text, KEINE_ZUSAGE);

  const termin = panel.locator(".offer-details-section:has(.offer-detail-section-title:text-is('Termin & Abholung'))");
  const terminZeilen = await zeilenVon(termin);
  assert.deepEqual(terminZeilen[0], ["Abholtermin", lang(MONTAG)]);
  assert.match(terminZeilen[1].join(" "), /^Abholung bereit ab 09:00 Uhr$/);
  const preis = await zeilenVon(panel.locator(".offer-details-section--price"));
  assert.deepEqual(preis.slice(0, 3), [["Netto", "26,25 €"], ["MwSt.", "4,99 €"], ["Brutto", "31,24 €"]]);

  await keinAnbieter(page, "Details");
  await beleg(page, "details-1440");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ C — Art der Lieferadresse ══════════ */

test("C — Art der Lieferadresse: vorläufiger Preis, Serverbeträge, Sperre ohne Wahl, Bindung Privatadresse, neuer Preis", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  assert.match(await inhalt(karteVon(page, TG_MO)), /Vorläufiger Preis/);
  await waehle(page, TG_MO);

  const geschaeftKarte = page.locator(`label[for="${LIEFERADRESSE_ID.geschaeft}"]`);
  const privatKarte = page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`);
  await privatKarte.waitFor({ timeout: 20000 });
  assert.deepEqual(p.lz.optionsCalls, [{ offerId: TG_MO.offerId, offerRevision: 0 }]);
  assert.equal(await inhalt(page.locator("#residential-price-inputs-title")), "Art der Lieferadresse");
  const g = await inhalt(geschaeftKarte);
  assert.match(g, /Geschäftsadresse/);
  assert.match(g, /\+ 0,00 € brutto/);
  const pr = await inhalt(privatKarte);
  assert.match(pr, /Privatadresse/);
  assert.match(pr, /\+ 4,09 € brutto/);
  assert.match(pr, /3,44 € netto/);
  assert.equal(await page.locator('input[name="residential-delivery"]:checked').count(), 0, "eine Art ist vorausgewählt");

  // Ohne Wahl: vorläufiger Preis, keine Absicherung, kein Schritt 2.
  assert.equal(await inhalt(page.locator(".blsum-price-label")), "Vorläufiger Preis");
  assert.match(await inhalt(page.locator(".blsum-price-gross")), /31,24 €/);
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await warteAufText(page, ".alert-error", "Bitte wählen Sie zuerst die Art der Lieferadresse.");
  assert.equal(await page.locator(".booking-confirm-panel").count(), 0, "ohne Wahl ging es zu Schritt 2");
  assert.equal(p.reprice.length, 0, "vor der Bindung wurde die Absicherung bepreist");

  await waehleLieferadresse(page, true);
  assert.deepEqual(p.lz.bindCalls, [{
    offerId: TG_MO.offerId, offerRevision: 0, optionsId: p.lz.optionsId, deliveryIsResidential: true, expectedShippingGross: 35.33,
  }]);
  await warteAufText(page, ".blsum-price-gross", "35,33");
  assert.equal(await inhalt(page.locator(".blsum-price-label")), "Gesamt");
  assert.equal(await inhalt(page.locator("#booking-live-surcharge-note")), "inkl. Zuschlag Privatadresse 4,09 €");
  assert.equal(await inhalt(page.locator("#offer-summary-surcharge-note")), "inkl. Zuschlag Privatadresse 4,09 €");
  assert.equal(await inhalt(page.locator(".offsum-price-gross")), "35,33 € brutto");
  await keinAnbieter(page, "Buchungsseite nach der Bindung");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ D — Abholung am selben Tag ══════════ */

test("D — Abholung am selben Tag: Zuschlag, wirksamer Abholschluss, frische und gebuchte „bereit ab“-Zeit", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: [TG_HEUTE, JM], lz: zustandHeute() });
  await zuDenAngeboten(page);

  const karte = karteVon(page, TG_HEUTE);
  assert.equal(await inhalt(karte.locator(".offer-price")), "29,52 €", "der Kartenpreis enthält den Zuschlag nicht");
  assert.equal(await inhalt(karte.locator(".offer-sameday-surcharge")), "Zuschlag für Abholung am selben Tag: +3,27 €");
  assert.equal(await inhalt(karte.locator(".offer-sameday-until")), "Abholung heute möglich bis 16:45 Uhr");
  assert.equal(await inhalt(karte.locator(".offer-tl-node--start .offer-tl-title")), "Abholung heute");
  assert.match(await inhalt(karte.locator(".offer-tl-node--start")), /bereit ab 11:30 Uhr/);
  assert.equal(await inhalt(karte.locator(".offer-tl-node--end .offer-tl-primary")), kurz(HEUTE_PLUS_1));
  // Der Abholschluss des Anbieters bleibt intern — sichtbar ist nur der wirksame.
  assert.doesNotMatch(await inhalt(karte), /17:00/, "der Abholschluss des Anbieters ist sichtbar");

  await page.getByRole("button", { name: "inkl. MwSt.", exact: true }).click();
  await warteBis(async () => (await inhalt(karte.locator(".offer-price"))) === "35,13 €", "Bruttopreis der Karte");
  assert.equal(await inhalt(karte.locator(".offer-sameday-surcharge")), "Zuschlag für Abholung am selben Tag: +3,89 €");
  await karte.locator("button.offer-details-link").click();
  const detail = page.locator(`#offer-details-${TG_HEUTE.offerId} .offer-detail-row:has(.offer-detail-label:text-is("Zuschlag für Abholung am selben Tag"))`);
  await detail.waitFor({ timeout: 10000 });
  assert.equal(await inhalt(detail.locator(".offer-detail-value")), "+3,27 € netto · +3,89 € brutto");

  await waehle(page, TG_HEUTE);
  const privatKarte = page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`);
  await privatKarte.waitFor({ timeout: 20000 });
  assert.match(await inhalt(privatKarte), /\+ 4,10 € brutto/);
  assert.match(await inhalt(privatKarte), /3,45 € netto/);
  assert.equal(await inhalt(page.locator("#booking-live-sameday-note")), "inkl. Zuschlag für Abholung am selben Tag 3,89 €");
  assert.equal(await inhalt(page.locator("#offer-summary-sameday-until")), "Abholung heute möglich bis 16:45 Uhr");
  assert.match(await inhalt(page.locator(".offsum-facts")), /bereit ab 11:30 Uhr/);

  await waehleLieferadresse(page, false);
  await warteAufText(page, ".blsum-price-gross", "35,13");
  // Die Bindung nennt die „bereit ab"-Zeit, die JETZT gälte.
  await warteAufText(page, ".offsum-facts", "bereit ab 11:45 Uhr");
  assert.equal(await inhalt(page.locator("#booking-live-sameday-note")), "inkl. Zuschlag für Abholung am selben Tag 3,89 €");
  for (const sel of [".booking-livesum", ".offsum-meta", "#residential-price-inputs"]) {
    assert.doesNotMatch(await inhalt(page.locator(sel)), /17:00/, `${sel}: der Abholschluss des Anbieters ist sichtbar`);
  }

  await zuSchritt2(page);
  assert.match(await inhalt(page.locator('[data-component="shipping_base"]')), /Versand netto\s*26,25 €/);
  assert.match(await inhalt(page.locator('[data-component="same_day_collection_surcharge"]')),
    /Zuschlag für Abholung am selben Tag netto\s*3,27 €/);
  assert.equal(await page.locator('[data-component="residential_delivery_surcharge"]').count(), 0);
  const aufstellung = await inhalt(page.locator(".booking-confirm-box"));
  assert.match(aufstellung, /MwSt\. 19 %\s*5,61 €/);
  assert.match(aufstellung, /Gesamtbetrag brutto\s*35,13 €/);

  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(p.book.length, 1);
  const body = p.book[0];
  assert.equal(body.offerId, TG_HEUTE.offerId);
  assert.equal(body.offerRevision, 1, "der Preisstand der Bindung reist nicht mit");
  assert.deepEqual(body.priceInputs, { deliveryIsResidential: false });
  assert.doesNotMatch(JSON.stringify(body), /pickupToday|sameDay|collectionReadyFrom|16:45|17:00/, "/book trägt eine Same-Day-Angabe");

  const recap = await inhalt(page.locator(".booking-success-recap"));
  assert.match(recap, /Zuschlag für Abholung am selben Tag netto\s*3,27 €/);
  assert.match(recap, /Gesamtbetrag brutto\s*35,13 €/);
  assert.equal(await inhalt(page.locator("#booking-success-pickup .summary-detail-val")), `${HEUTE_DE} · bereit ab 12:00 Uhr`);
  assert.doesNotMatch(recap, /17:00/);
  await keinAnbieter(page, "Erfolg Abholung heute");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ E — Privatadresse + Abholung heute ══════════ */

test("E — Privatadresse + Abholung heute: beide Bestandteile in Serverreihenfolge, Summen vom Server", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { tariffs: [TG_HEUTE, JM], lz: zustandHeute() });
  await zuDenAngeboten(page);
  await waehle(page, TG_HEUTE);
  await waehleLieferadresse(page, true);
  await warteAufText(page, ".blsum-price-gross", "39,23");
  assert.equal(await inhalt(page.locator(".blsum-price-label")), "Gesamt");
  assert.equal(await inhalt(page.locator("#booking-live-surcharge-note")), "inkl. Zuschlag Privatadresse 4,10 €");
  assert.equal(await inhalt(page.locator("#booking-live-sameday-note")), "inkl. Zuschlag für Abholung am selben Tag 3,89 €");

  await zuSchritt2(page);
  const box = page.locator(".booking-confirm-box");
  const typen = await box.locator("[data-component]").evaluateAll((els) => els.map((e) => e.getAttribute("data-component")));
  assert.deepEqual(typen.filter((t) => t !== "transport_insurance"),
    ["shipping_base", "same_day_collection_surcharge", "residential_delivery_surcharge"]);
  assert.match(await inhalt(page.locator('[data-component="shipping_base"]')), /Versand netto\s*26,25 €/);
  assert.match(await inhalt(page.locator('[data-component="same_day_collection_surcharge"]')),
    /Zuschlag für Abholung am selben Tag netto\s*3,27 €/);
  assert.match(await inhalt(page.locator('[data-component="residential_delivery_surcharge"]')), /Zuschlag Privatadresse netto\s*3,45 €/);
  const aufstellung = await inhalt(box);
  assert.match(aufstellung, /MwSt\. 19 %\s*6,26 €/);
  assert.match(aufstellung, /Gesamtbetrag brutto\s*39,23 €/);

  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.deepEqual(p.book[0].priceInputs, { deliveryIsResidential: true });
  const recap = await inhalt(page.locator(".booking-success-recap"));
  assert.match(recap, /Zuschlag für Abholung am selben Tag netto\s*3,27 €/);
  assert.match(recap, /Zuschlag Privatadresse netto\s*3,45 €/);
  assert.match(recap, /Gesamtbetrag brutto\s*39,23 €/);
  await keinAnbieter(page, "Erfolg Privatadresse + Abholung heute");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ F — Absicherung ══════════ */

test("F — Warenwert 500 €: Zusatzabsicherung 10,00 € — 1:1, steuerfrei, ohne Aufschlag auf die Absicherung", async () => {
  const { page, fehler } = await neueSeite();
  const lz = zustandKuenftig(TG_MO, { insuranceAvailable: true, insuranceDetails: COVER_500 });
  const p = await setup(page, { lz });
  await zuDenAngeboten(page, { warenwert: 500 });
  await waehle(page, TG_MO);
  await waehleLieferadresse(page, false);
  assert.equal(p.reprice.length, 0, "vor Schritt 2 wurde die Absicherung bepreist");

  await zuSchritt2(page);
  await absichern(page);
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  assert.deepEqual(p.reprice.at(-1), { offerId: TG_MO.offerId, coverValue: 500, goodsAreNew: true, goodsAreFragile: false });
  await warteAufText(page, ".blsum-price-gross", "41,24");
  assert.match(await inhalt(page.locator('[data-component="transport_insurance"]')),
    /Zusätzliche Transportabsicherung\s*steuerfrei\s*10,00 €/);
  const summe = await inhalt(page.locator(".booking-confirm-box"));
  assert.match(summe, /Versicherter Betrag\s*500,00 €/);
  assert.match(summe, /Selbstbeteiligung\s*20,00 €/);
  // Die MwSt. betrifft ausschließlich den Versand — die Absicherung ist steuerfrei.
  assert.match(summe, /MwSt\. 19 %\s*4,99 €/);
  assert.match(summe, /Gesamtbetrag brutto\s*41,24 €/);
  // Kein Aufschlag auf die Absicherung: Gesamt − Versand ist genau der Einkauf der Absicherung.
  const versand = ABSICHERUNG_TOTALS.kuenftig.false.customerShippingGross;
  const gesamt = ABSICHERUNG_TOTALS.kuenftig.false.customerTotalGross;
  assert.equal(Math.round((gesamt - versand) * 100), ABSICHERUNG_EINKAUF * 100, "die Absicherung trägt einen Aufschlag");
  // 13,00 € wäre der Expressaufschlag, 11,90 € die MwSt. und 15,47 € beides auf der Absicherung.
  assert.doesNotMatch(summe, /13,00 €|11,90 €|15,47 €/, "ein aufgeschlagener oder versteuerter Absicherungsbetrag ist sichtbar");

  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  const body = p.book[0];
  assert.equal(body.insuranceSelection && body.insuranceSelection.type, "transit_cover");
  assert.equal(body.confirmedTotalGross, 41.24);
  const recap = await inhalt(page.locator(".booking-success-recap"));
  assert.match(recap, /Zusätzliche Transportabsicherung/);
  assert.match(recap, /Gesamtbetrag brutto\s*41,24 €/);
  await keinAnbieter(page, "Erfolg mit Absicherung");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F2 — Warenwert 50 €: Grundabsicherung · über 2.500 €: keine bezahlte Zusatzabsicherung — Hinweis, keine Karten, keine Neubepreisung", async () => {
  for (const [warenwert, details, erwartet] of [
    [50, COVER_GRUNDSCHUTZ, GRUNDSCHUTZ_TEXT],
    [3000, COVER_UEBER_HOECHSTDECKUNG, HOECHSTDECKUNG_TEXT],
  ]) {
    const { page, fehler } = await neueSeite();
    const lz = zustandKuenftig(TG_MO, { insuranceAvailable: false, insuranceDetails: details });
    const p = await setup(page, { lz });
    await zuDenAngeboten(page, { warenwert });
    await waehle(page, TG_MO);
    await waehleLieferadresse(page, false);
    await zuSchritt2(page);
    const hinweis = page.locator("#ins-cover-notice");
    await hinweis.waitFor({ timeout: 10000 });
    assert.equal(await inhalt(hinweis), erwartet, `${warenwert} €`);
    assert.equal(await page.locator(".ins-cards").count(), 0, `${warenwert} €: ohne kaufbaren Zusatz erscheinen Karten`);
    assert.equal(await page.locator(".booking-ins-unavailable").count(), 0, `${warenwert} €: als „nicht verfügbar“ gezeigt`);
    await kurzWarten(900);
    assert.equal(p.reprice.length, 0, `${warenwert} €: ohne kaufbaren Zusatz wurde neu bepreist`);

    await bestaetigen(page);
    await buchenKnopf(page).click();
    await page.waitForSelector(".booking-success-title", { timeout: 20000 });
    const body = p.book[0];
    assert.deepEqual(body.insuranceSelection, { type: "none" }, `${warenwert} €`);
    assert.ok(!JSON.stringify(body).includes("coverValue"), `${warenwert} €: die Buchung trägt einen Versicherungswert`);
    assert.match(await inhalt(page.locator(".booking-success-recap")), /Gesamtbetrag brutto\s*31,24 €/);
    assert.deepEqual(fehler, [], `${warenwert} €`);
    await page.close();
  }
});

/* ══════════ G — Buchungsseite ══════════ */

test("G — Buchungsseite: UPS · Expressversand, Lieferprognose, Abholtag, Labelhinweis, Kundenreferenz, Buchungsschranke, Bestandteile", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  await waehle(page, TG_MO);

  // Identität — dieselbe auf Live-Leiste und ausgewähltem Angebot.
  assert.equal(await inhalt(page.locator(".blsum-carrier")), "UPS");
  assert.equal(await inhalt(page.locator(".blsum-service")), "Expressversand");
  assert.equal(await inhalt(page.locator(".booking-carrier-name")), "UPS");
  assert.equal(await inhalt(page.locator(".offsum-service-name")), "Expressversand");

  // Lieferprognose des Servers als TT.MM.JJJJ — ein Tag, ohne Uhrzeit.
  assert.equal(await inhalt(page.locator(".blsum-delivery .blsum-label")), "Voraussichtliche Lieferung");
  assert.equal(await inhalt(page.locator(".blsum-delivery .blsum-val")), lang(DIENSTAG));
  assert.equal(await page.locator(".blsum-delivery .blsum-sub").count(), 0, "eine Uhrzeit an der Prognose");
  const fakten = page.locator(".offsum-fact");
  assert.equal(await inhalt(fakten.nth(0).locator("dt")), "Voraussichtliche Lieferung");
  assert.equal(await inhalt(fakten.nth(0).locator("dd")), lang(DIENSTAG));

  // Abholtag und „bereit ab"-Zeit — kein Zeitfenster.
  assert.equal(await inhalt(fakten.nth(1).locator("dt")), "Abholung");
  assert.equal(await inhalt(fakten.nth(1).locator("dd")), `${lang(MONTAG)} · bereit ab 09:00 Uhr`);
  const uebergabe = await inhalt(page.locator(".blsum-handover"));
  assert.ok(uebergabe.includes(lang(MONTAG)), `die Live-Leiste nennt den Abholtag nicht: ${uebergabe}`);
  assert.doesNotMatch(uebergabe, /\bbis\b|–/, "aus der bereit-ab-Zeit wurde ein Zeitfenster");
  assert.match(await inhalt(page.locator(".offsum-meta")), /Drucker erforderlich/);

  // Label: keine Formatwahl, neutraler Hinweis auf beide gelieferten Formate.
  assert.equal(await page.locator("#booking-labelformat-toggle").count(), 0, "ein TG23-Angebot bietet eine Formatauswahl an");
  assert.equal(await inhalt(page.locator("#booking-label-delivery-info")), "Versandlabel verfügbar als DIN A4 und Thermodruck");

  // Kundenreferenz — der bestehende Weg.
  await schalter(page, "booking-reference-toggle").click();
  await page.locator("#booking-reference").fill("PO-2026-0923");

  // Buchungsschranke: ohne gebundene Lieferadresse kein Schritt 2.
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await warteAufText(page, ".alert-error", "Bitte wählen Sie zuerst die Art der Lieferadresse.");
  assert.equal(await page.locator(".booking-confirm-panel").count(), 0);
  await waehleLieferadresse(page, true);

  await zuSchritt2(page);
  assert.match(await inhalt(page.locator('[data-component="shipping_base"]')), /Versand netto\s*26,25 €/);
  assert.match(await inhalt(page.locator('[data-component="residential_delivery_surcharge"]')), /Zuschlag Privatadresse netto\s*3,44 €/);
  assert.equal(await page.locator('[data-component="same_day_collection_surcharge"]').count(), 0);
  const aufstellung = await inhalt(page.locator(".booking-confirm-box"));
  assert.match(aufstellung, /MwSt\. 19 %\s*5,64 €/);
  assert.match(aufstellung, /Gesamtbetrag brutto\s*35,33 €/);
  assert.equal(await inhalt(page.locator(".blsum-delivery .blsum-val")), lang(DIENSTAG), "die Prognose ging in Schritt 2 verloren");
  await keinAnbieter(page, "Schritt 2");

  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(p.book.length, 1);
  const body = p.book[0];
  assert.equal(body.offerId, TG_MO.offerId);
  assert.equal(body.ceShipmentId, CE_ID, "die Buchung trägt nicht den CE-Sendungshandle");
  assert.equal(body.offerRevision, 1);
  assert.deepEqual(body.priceInputs, { deliveryIsResidential: true });
  assert.equal(body.referenceNumber, "PO-2026-0923");
  assert.ok(!("labelFormat" in body), `ein Angebot ohne Formatwahl sendet labelFormat: ${body.labelFormat}`);
  assert.equal(body.tariffId ?? null, null, "die Buchung sendet eine Tarifkennung");
  assert.ok(!JSON.stringify(body).includes("collectionIsResidential"), "es wurde eine Abholadressart gesendet");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ H — Erfolg ══════════ */

test("H — Erfolg: UPS — Expressversand, Bestandteile, Gesamtbetrag vom Server, Labelbeleg A4/Thermodruck", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  await waehle(page, TG_MO);
  await waehleLieferadresse(page, true);
  await zuSchritt2(page);
  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });

  const recap = await inhalt(page.locator(".booking-success-recap"));
  assert.match(recap, /Carrier\s*UPS — Expressversand/);
  assert.match(recap, /Route\s*Aschaffenburg → Berlin/);
  assert.match(recap, /Serviceart\s*Abholung/);
  assert.match(recap, /Versand netto\s*26,25 €/);
  assert.match(recap, /Zuschlag Privatadresse netto\s*3,44 €/);
  assert.match(recap, /Gesamtbetrag brutto\s*35,33 €/);
  assert.equal(await page.locator("#booking-success-pickup").count(), 0, "der Erfolg nennt eine Abholung am selben Tag");

  const wrap = page.locator(".booking-success-wrap");
  assert.ok((await inhalt(wrap)).includes(AB), "die Auftragsbestätigungsnummer fehlt");
  const knoepfe = wrap.getByRole("button", { name: /^Versandlabel.* herunterladen$/ });
  await knoepfe.first().waitFor({ timeout: 15000 });
  assert.deepEqual((await knoepfe.allTextContents()).map((t) => t.trim()),
    ["Versandlabel (A4) herunterladen", "Versandlabel (Thermodruck) herunterladen"]);
  assert.equal(await wrap.getByRole("button", { name: "Label herunterladen" }).count(), 0,
    "zusätzlich steht der Einzelknopf des ersten Labels da");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    wrap.getByRole("button", { name: "Versandlabel (Thermodruck) herunterladen" }).click(),
  ]);
  assert.ok(p.pfade.includes(`/api/shipments/${CE_ID}/provider-documents/LABEL/1`),
    "der Thermodruck-Beleg wurde nicht über seinen Serverpfad geladen");
  assert.equal(download.suggestedFilename(), DATEINAME[1]);
  assert.match(await inhalt(wrap.locator(".booking-tracking-note")), /Tracking wird vorbereitet/);

  const body = p.book[0];
  assert.deepEqual(body.insuranceSelection, { type: "none" });
  const jumingoOnly = p.pfade.filter((x) => JUMINGO_ONLY.some((re) => re.test(x)));
  assert.deepEqual(jumingoOnly, [], `JUMiNGO-only-Endpunkte angesprochen: ${jumingoOnly.join(", ")}`);
  await keinAnbieter(page, "Erfolg");
  await beleg(page, "erfolg-1440");
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ I — JUMiNGO-Pendant ══════════ */

test("I — JUMiNGO-Pendant „Expressversand“ daneben: beide sichtbar, JUMiNGO unverändert (Anbieterdatum, kein Profil, Buchungsweg)", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  assert.equal(await page.locator(".offer-card").count(), 2, "nicht beide Angebote stehen im Vergleich");

  const tg = karteVon(page, TG_MO), jm = karteVon(page, JM);
  for (const [name, karte] of [["TG23", tg], ["JUMiNGO", jm]]) {
    assert.ok(await karte.isVisible(), `${name}: die Karte ist nicht sichtbar`);
    assert.equal(await inhalt(karte.locator(".offer-carrier-name")), "UPS", name);
    assert.equal(await inhalt(karte.locator(".offer-service-type")), "Expressversand", name);
    assert.equal(await inhalt(karte.locator(".offer-eta")), "1 Tag", name);
  }
  assert.equal(await inhalt(tg.locator(".offer-tl-node--end .offer-tl-title")), "Voraussichtliche Lieferung");
  const jmEnde = jm.locator(".offer-tl-node--end");
  assert.equal(await inhalt(jmEnde.locator(".offer-tl-title")), "Zustellung");
  assert.ok((await inhalt(jmEnde.locator(".offer-tl-primary"))).includes(`${DIENSTAG.slice(8, 10)}.${DIENSTAG.slice(5, 7)}.`),
    "das Anbieterdatum fehlt");
  assert.match(await inhalt(jmEnde), /18:00/, "die Zustelluhrzeit des Anbieters fehlt");

  // JUMiNGO bleibt, wie es ist: buchbar, kein vorläufiger Preis, kein Zuschlagshinweis, kein Produktprofil.
  assert.equal(await inhalt(jm.locator(".offer-price")), "24,90 €");
  assert.doesNotMatch(await inhalt(jm), /Vorläufiger Preis/);
  assert.equal(await jm.locator(".offer-surcharge-hint, .offer-sameday-surcharge").count(), 0);
  assert.equal(await jm.locator("button.offer-cta-btn").isEnabled(), true);
  const panel = await oeffneDetails(page, JM);
  assert.equal(await panel.locator("[data-profile-section]").count(), 0, "das JUMiNGO-Pendant zeigt ein Produktprofil");
  const merkmale = await alleTexte(panel.locator(".offer-feature-label"));
  for (const label of ["Voraussichtliche Laufzeit", "Sendungsverfolgung", "Tarif-ID"]) {
    assert.ok(merkmale.includes(label), `„${label}“ fehlt im bisherigen Merkmalsraster`);
  }
  assert.doesNotMatch(norm(await panel.textContent()), /Voraussichtliche Lieferung|Expressversand für eilige|Volumengewicht/,
    "das JUMiNGO-Pendant zeigt TG23-Angaben");

  await waehle(page, JM);
  await kurzWarten(800);
  assert.equal(await page.locator("#residential-price-inputs").count(), 0, "das JUMiNGO-Pendant zeigt die Adressfrage");
  await zuSchritt2(page);
  assert.equal(await page.locator('[data-component="same_day_collection_surcharge"], [data-component="residential_delivery_surcharge"]').count(), 0);
  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.deepEqual(p.anfragen, [], "für das JUMiNGO-Pendant entstand eine Zuschlagsanfrage");
  const body = p.book[0];
  assert.equal(body.offerId, JM.offerId);
  assert.equal(body.tariffId, JM.id);
  assert.ok(!("offerRevision" in body), "das JUMiNGO-Pendant sendet einen Preisstand");
  assert.ok(!("priceInputs" in body), "das JUMiNGO-Pendant sendet eine Adressart");
  assert.match(await inhalt(page.locator(".booking-success-recap")), /Carrier\s*UPS — Expressversand/);
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ J — White Label ══════════ */

test("J — White Label: keine Einkaufsquelle, keine ServiceID, keine Quote- oder Positionscodes auf Karte, Details, Buchung und Erfolg", async () => {
  const { page, fehler } = await neueSeite();
  const lz = zustandHeute({ insuranceAvailable: true, insuranceDetails: COVER_500 });
  const p = await setup(page, { tariffs: [TG_HEUTE, JM], lz });
  await zuDenAngeboten(page, { warenwert: 500 });
  // Alle Details öffnen — auch dort darf kein Anbieterbezug stehen (DOM-Klick wie offerCardParity).
  await page.evaluate(() => document.querySelectorAll(".offer-details-link").forEach((b) => b.click()));
  await page.waitForTimeout(600);
  await keinAnbieter(page, "Angebotsliste mit Details");

  await waehle(page, TG_HEUTE);
  await page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`).waitFor({ timeout: 20000 });
  await keinAnbieter(page, "Art der Lieferadresse");
  await waehleLieferadresse(page, true);
  await zuSchritt2(page);
  await absichern(page);
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  await warteAufText(page, ".blsum-price-gross", "49,23");
  await keinAnbieter(page, "Schritt 2 mit Absicherung");

  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  await page.locator(".booking-success-wrap").getByRole("button", { name: /^Versandlabel.* herunterladen$/ }).first()
    .waitFor({ timeout: 15000 });
  await keinAnbieter(page, "Erfolg");

  // Auch die Anfragen des Clients kennen keine Einkaufsquelle und keine Anbieterkennung.
  for (const anfrage of [...p.book, ...p.reprice, ...p.anfragen.map((a) => a.body), ...p.calc]) {
    assert.doesNotMatch(JSON.stringify(anfrage), /transglobal|jumingo|serviceId|providerServiceRef|quoteId|COLFEE/i);
  }
  assert.ok(!p.pfade.some((x) => /transglobal/i.test(x)), "ein Pfad nennt die Einkaufsquelle");
  const jumingoOnly = p.pfade.filter((x) => JUMINGO_ONLY.some((re) => re.test(x)));
  assert.deepEqual(jumingoOnly, [], `JUMiNGO-only-Endpunkte angesprochen: ${jumingoOnly.join(", ")}`);
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ══════════ K — Responsive ══════════ */

for (const breite of [1440, 834, 390]) {
  test(`K — ${breite} px: Karte, Details, Buchung und Erfolg innerhalb der Fläche, kein horizontaler Überlauf`, async () => {
    const { page, fehler } = await neueSeite({ width: breite, height: 900 });
    const lz = zustandHeute({ insuranceAvailable: true, insuranceDetails: COVER_500 });
    await setup(page, { tariffs: [TG_HEUTE, JM], lz });
    await zuDenAngeboten(page, { warenwert: 500 });
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Angebotsliste mit horizontalem Überlauf`);

    const karte = karteVon(page, TG_HEUTE);
    for (const sel of [".offer-service-type", ".offer-tl-node--end", ".offer-sameday-surcharge", ".offer-sameday-until"]) {
      const el = karte.locator(sel);
      await el.scrollIntoViewIfNeeded();
      assert.ok(await el.isVisible(), `${breite}px: ${sel} ist nicht sichtbar`);
      await liegtInnerhalb(karte, el, `${breite}px ${sel}`);
    }
    const panel = await oeffneDetails(page, TG_HEUTE);
    for (const id of ["main", "transit", "size", "cover", "restrictions"]) {
      const bereich = abschnittVon(panel, id);
      await bereich.scrollIntoViewIfNeeded();
      assert.ok(await bereich.isVisible(), `${breite}px: Abschnitt ${id} ist nicht sichtbar`);
      await liegtInnerhalb(karte, bereich, `${breite}px Abschnitt ${id}`);
    }
    const werte = panel.locator(".offer-profile-row .offer-detail-value, .offer-profile-note, .offer-profile-summary");
    for (let i = 0; i < await werte.count(); i++) {
      await liegtInnerhalb(karte, werte.nth(i), `${breite}px Profilzeile ${i}`);
    }
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Details mit horizontalem Überlauf`);
    await abschnittVon(panel, "main").scrollIntoViewIfNeeded();
    await beleg(page, `details-${breite}`);

    await waehle(page, TG_HEUTE);
    await waehleLieferadresse(page, true);
    for (const id of Object.values(LIEFERADRESSE_ID)) {
      const box = await page.locator(`label[for="${id}"]`).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= breite + 1, `${breite}px: ${id} liegt außerhalb`);
    }
    for (const sel of ["#booking-live-sameday-note", "#offer-summary-sameday-until", ".blsum-delivery"]) {
      assert.ok(await page.locator(sel).isVisible(), `${breite}px: ${sel} ist nicht sichtbar`);
    }
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Schritt 1 mit horizontalem Überlauf`);

    await zuSchritt2(page);
    await absichern(page);
    await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
    for (const typ of ["shipping_base", "same_day_collection_surcharge", "residential_delivery_surcharge", "transport_insurance"]) {
      const zeile = page.locator(`[data-component="${typ}"]`);
      await zeile.scrollIntoViewIfNeeded();
      assert.ok(await zeile.isVisible(), `${breite}px: ${typ} ist nicht sichtbar`);
      await liegtInnerhalb(page.locator(".booking-confirm-box"), zeile, `${breite}px ${typ}`);
    }
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Schritt 2 mit horizontalem Überlauf`);

    await bestaetigen(page);
    await buchenKnopf(page).click();
    await page.waitForSelector(".booking-success-title", { timeout: 20000 });
    const abholung = page.locator("#booking-success-pickup");
    assert.ok(await abholung.isVisible(), `${breite}px: die gebuchte Abholzeit fehlt`);
    await liegtInnerhalb(page.locator(".booking-success-recap"), abholung, `${breite}px gebuchte Abholzeit`);
    const knoepfe = page.locator(".booking-success-wrap").getByRole("button", { name: /^Versandlabel.* herunterladen$/ });
    await knoepfe.first().waitFor({ timeout: 15000 });
    for (let i = 0; i < await knoepfe.count(); i++) {
      const box = await knoepfe.nth(i).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= breite + 1, `${breite}px: Labelknopf ${i} läuft aus dem Bild`);
    }
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Erfolg mit horizontalem Überlauf`);
    await beleg(page, `erfolg-${breite}`);
    assert.deepEqual(fehler, []);
    await page.close();
  });
}
