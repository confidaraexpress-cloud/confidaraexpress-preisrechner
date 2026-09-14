// E2E: TG22 Residential — die Art der Lieferadresse NACH der Angebotsauswahl. Echter Dev-Server,
// echter Browser, gemocktes Backend (helpers/residentialPriceInputs.mjs).
//
// Gemessen wird, was eine Quelltextprüfung nicht erreicht:
//   A  Angebotsliste: das TG22-Angebot ist auswählbar, zeigt „Vorläufiger Preis" und den
//      Zuschlagshinweis, trägt keine Auszeichnung; vor der Auswahl entsteht keine Anfrage
//   B  Buchungsseite: Laden, Serverbeträge (+ 0,00 / + 3,79 brutto), keine Vorauswahl, Sperre ohne
//      Wahl, Bindung Privatadresse, Preis und Bestandteile auf allen Flächen, /book-Körper, Erfolg
//   C  Optionen scheitern: Fehlertext und „Erneut versuchen", kein lokaler Ersatz
//   D  Doppelklick bindet genau einmal; Wechsel zur Geschäftsadresse bindet neu
//   E  Zurück zu den Angeboten und wieder hinein: Liste mit gebundenem Preis, Wahl bleibt
//   F  /book meldet eine Preisänderung mit Neubestätigung: kein Übernahmeknopf, neue Wahl, Buchung
//   G  Absicherung erst nach der Bindung; ein Wechsel setzt sie zurück
//   H  Neubepreisung meldet Neubestätigung: kein Dialog, zurück an die Auswahl
//   I  1440 / 834 / 390 px: Auswahl bedienbar, Trefferflächen, kein horizontaler Überlauf
//   J  Regression JUMiNGO: keine Frage, keine Anfrage, /book unverändert
//
// Kein echtes Backend, keine Bestellung, keine Neubepreisung beim Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_PAKET } from "./helpers/newShipmentForm.mjs";
import {
  LIEFERADRESSE_ID, lieferadressZustand, mockeLieferadresse, waehleLieferadresse, bestandteile,
  invalidiereLieferadresse,
} from "./helpers/residentialPriceInputs.mjs";

const PORT = 5394, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 4894;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ABHOLTAG = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10894",
};

const COVER_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
};

/* Das TG22-Angebot, wie calculate-price es nach diesem Paket liefert: auswählbar, nicht buchbar. */
const TG = {
  offerId: "22rs0000000000000000000000000022", publicCarrierId: "ups", publicServiceName: "Standardversand",
  serviceType: "pickup", collectionDate: ABHOLTAG, collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  netPrice: 12.34, vatAmount: 2.34, finalPrice: 14.68, currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: false, insuranceDetails: null,
  trackingAvailable: true, printerRequired: false,
};

/* Das Vergleichsangebot — unverändert: keine Angabe nach der Auswahl. */
const JM = {
  id: 11, shipper_tariff_id: 3307, offerId: "ju-rs-000000000000000000000000011",
  publicCarrierId: "dhl", publicCarrierName: "DHL Express", publicServiceName: "Expressversand",
  serviceType: "pickup", netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19, currency: "EUR",
  transitDaysMin: 1, transitDaysMax: 1, trackingAvailable: true, printerRequired: false,
  bookable: true, requiredPriceInputs: [], labelFormatOptions: ["A4", "A6"], labelSizes: ["A4", "A6"],
};

// Serverbeträge: Geschäftsadresse 12,34 / 2,34 / 14,68 — Privatadresse 15,52 / 2,95 / 18,47 (Zuschlag 3,18 / 0,61 / 3,79).
const GESCHAEFT = { net: 12.34, vat: 2.34, gross: 14.68 };
const PRIVAT = { net: 15.52, vat: 2.95, gross: 18.47 };
const ZUSCHLAG = { net: 3.18, vat: 0.61, gross: 3.79 };
const NEUE_OPTIONS_ID = "1b2c3d4e5f60718293a4b5c6d7e8f901";

// Absicherung 10,00 € (steuerfrei) — Totals des Servers je gebundener Wahl.
const ABSICHERUNG_TOTALS = {
  false: { customerShippingNet: 12.34, shippingVat: 2.34, customerShippingGross: 14.68,
           insuranceGross: 10, customerTotalNet: 22.34, customerTotalGross: 24.68 },
  true: { customerShippingNet: 15.52, shippingVat: 2.95, customerShippingGross: 18.47,
          insuranceGross: 10, customerTotalNet: 25.52, customerTotalGross: 28.47 },
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
  const amount = !tg ? 22.19 : versichert ? ABSICHERUNG_TOTALS[String(lz.bound)].customerTotalGross : (lz.bound ? 18.47 : 14.68);
  return {
    message: "Sendung gebucht", ceShipmentId: CE_ID, invoiceNumber: "CE-RE26-00894",
    businessOrderNumber: "CE-BS26-00894", dueDate: null, amount, billingMode: "single",
    testBooking: false, voucherCode: null, deliveryNote: null,
    orderConfirmation: { number: "CE-AB26-00894", issuedAt: "2026-09-14T10:00:00Z" }, shippingDocuments: [],
    priceComponents: tg ? [...bestandteile(lz, lz.bound), ...(versichert ? [ABSICHERUNG_ZEILE] : [])] : null,
  };
};

const VERBOTEN = /transglobal|jumingo|quoteid|shipper_tariff_id|itemdescription/i;

let server, browser;

/* Das Szenario: `insuranceAvailable`, `failOptions`, `optionsDelayMs`, `bindDelayMs`,
   `repriceRebind` (erste Neubepreisung verlangt eine Neubestätigung), `book(body, n, lz)`. */
async function setup(page, szenario = {}) {
  const p = { pfade: [], reprice: [], book: [], calc: [], anfragen: [] };
  const lz = lieferadressZustand({
    offerId: TG.offerId, geschaeft: GESCHAEFT, privat: PRIVAT, zuschlag: ZUSCHLAG,
    insuranceAvailable: szenario.insuranceAvailable === true,
    insuranceDetails: szenario.insuranceAvailable === true ? COVER_DETAILS : null,
  });
  lz.failOptions = szenario.failOptions ?? 0;
  lz.optionsDelayMs = szenario.optionsDelayMs ?? 0;
  lz.bindDelayMs = szenario.bindDelayMs ?? 0;
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
        ceShipmentId: CE_ID, tariffs: [TG, JM], availableShippingModes: ["standard", "express"],
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
      if (szenario.repriceRebind && !p.rebindGemeldet) {
        p.rebindGemeldet = true;
        invalidiereLieferadresse(lz, NEUE_OPTIONS_ID);
        return json({ error: "Der Preis für dieses Angebot hat sich geändert.", code: "PRICE_CHANGED",
                      priceInputsRebindRequired: true, offerRevision: lz.revision }, 409);
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

const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const inhalt = async (loc) => norm(await loc.first().textContent());
const querUeberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
const buchenKnopf = (page) => page.getByRole("button", { name: /Kostenpflichtig buchen/ });

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
    return !!el && el.textContent.replace(/ /g, " ").includes(t);
  }, { s: selektor, t: teil }, { timeout });
}

async function keinAnbieter(page, wo) {
  const text = norm(await page.evaluate(() => document.body.innerText));
  const treffer = text.match(VERBOTEN) || text.match(/\bRES\b/);
  assert.equal(treffer, null, `${wo}: unzulässiger Text „${treffer && treffer[0]}“`);
}

/* Die Fläche „Art der Lieferadresse" — gemessen: Innenmaß, sichtbarer Titel, nichts ragt über
   oder wird abgeschnitten, kein horizontaler Seitenüberlauf. Der Screenshot unter
   tests/e2e/screenshots/ ist Beleg, nicht Prüfmittel. */
async function pruefeFlaeche(page, breite, zustand) {
  const m = await page.evaluate(() => {
    const panel = document.getElementById("residential-price-inputs");
    if (!panel) return null;
    const r = panel.getBoundingClientRect();
    const titel = panel.querySelector(".calc-section-title");
    const t = titel ? titel.getBoundingClientRect() : null;
    let ueberstand = 0;
    for (const el of panel.querySelectorAll("*")) {
      const st = getComputedStyle(el);
      const e = el.getBoundingClientRect();
      if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") continue;
      if (e.width === 0 || e.height === 0) continue;
      ueberstand = Math.max(ueberstand, e.right - r.right, r.left - e.left, e.bottom - r.bottom);
    }
    return {
      oben: r.top + window.scrollY, hoehe: r.height, links: r.left, rechts: r.right,
      hatKoerper: panel.querySelector(":scope > .calc-panel-body") !== null,
      titel: t ? { sichtbar: t.width > 0 && t.height > 0, abstandOben: t.top - r.top, abstandLinks: t.left - r.left } : null,
      abschnittX: panel.scrollWidth - panel.clientWidth,
      ueberstand,
      seitenUeberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  const wo = `${breite}px (${zustand})`;
  assert.ok(m, `${wo}: die Fläche „Art der Lieferadresse“ fehlt`);
  assert.ok(m.hatKoerper, `${wo}: der Inhalt steht nicht in .calc-panel-body`);
  assert.ok(m.titel && m.titel.sichtbar, `${wo}: der Titel ist nicht sichtbar`);
  assert.ok(m.titel.abstandOben >= 12 && m.titel.abstandLinks >= 12, `${wo}: der Titel klebt am Rand`);
  assert.ok(m.links >= 0 && m.rechts <= breite + 1, `${wo}: die Fläche liegt außerhalb (${m.links}..${m.rechts})`);
  assert.ok(m.abschnittX <= 1, `${wo}: der Inhalt wird abgeschnitten (${m.abschnittX}px)`);
  assert.ok(m.ueberstand <= 1, `${wo}: ein Element ragt ${m.ueberstand}px aus der Fläche`);
  assert.ok(m.seitenUeberlauf <= 0, `${wo}: horizontaler Seitenüberlauf ${m.seitenUeberlauf}px`);
  const ordner = path.join(process.cwd(), "tests", "e2e", "screenshots");
  mkdirSync(ordner, { recursive: true });
  await page.screenshot({
    path: path.join(ordner, `residential-${zustand}-${breite}.png`),
    fullPage: true,
    clip: { x: 0, y: Math.max(0, m.oben - 24), width: breite, height: Math.round(m.hoehe + 48) },
  });
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

test("A — Angebotsliste: auswählbar mit vorläufigem Preis und Zuschlagshinweis, keine Auszeichnung, keine Anfrage", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);

  const tg = karteVon(page, TG);
  const text = await inhalt(tg);
  assert.match(text, /Vorläufiger Preis/);
  assert.match(text, /12,34 €/);
  assert.doesNotMatch(text, /ab \d+,\d{2} €/, "die Karte zeigt einen „ab“-Betrag");
  assert.equal(await inhalt(tg.locator(".offer-surcharge-hint")), "Bei einer privaten Lieferadresse kann ein Zuschlag anfallen.");
  assert.equal(await tg.evaluate((el) => el.classList.contains("offer-card--unavailable")), false, "die Karte ist gesperrt");
  const cta = tg.locator("button.offer-cta-btn");
  assert.equal(await cta.isEnabled(), true, "der CTA ist gesperrt");
  assert.match(await inhalt(cta), /Angebot auswählen/);
  assert.equal(await tg.locator(".offer-badge").count(), 0, "ein vorläufiges Angebot trägt eine Auszeichnung");
  assert.equal(await karteVon(page, JM).locator(".offer-surcharge-hint").count(), 0, "das Vergleichsangebot trägt den Hinweis");
  assert.equal(p.anfragen.length, 0, "vor der Auswahl entstand eine Zuschlagsanfrage");
  await keinAnbieter(page, "Angebotsliste");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — Buchungsseite: Laden, Serverbeträge, Sperre ohne Wahl, Privatadresse gebunden, Bestandteile, /book, Erfolg", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { optionsDelayMs: 800, insuranceAvailable: true });
  await zuDenAngeboten(page);
  await karteVon(page, TG).locator("button.offer-cta-btn").click();

  const laden = page.locator("#residential-options-loading");
  await laden.waitFor({ timeout: 20000 });
  assert.equal(await inhalt(laden), "Zuschlag wird berechnet …");
  const geschaeftKarte = page.locator(`label[for="${LIEFERADRESSE_ID.geschaeft}"]`);
  const privatKarte = page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`);
  await privatKarte.waitFor({ timeout: 20000 });
  assert.deepEqual(p.lz.optionsCalls, [{ offerId: TG.offerId, offerRevision: 0 }]);
  assert.equal(await inhalt(page.locator("#residential-price-inputs-title")), "Art der Lieferadresse");
  const g = await inhalt(geschaeftKarte);
  assert.match(g, /Geschäftsadresse/);
  assert.match(g, /\+ 0,00 € brutto/);
  assert.match(g, /0,00 € netto/);
  const pr = await inhalt(privatKarte);
  assert.match(pr, /Privatadresse/);
  assert.match(pr, /\+ 3,79 € brutto/);
  assert.match(pr, /3,18 € netto/);
  assert.doesNotMatch(`${g} ${pr}`, /MwSt/);
  assert.equal(await page.locator('input[name="residential-delivery"]:checked').count(), 0, "eine Art ist vorausgewählt");

  // Ohne Wahl: vorläufiger Preis, keine Neubepreisung, kein Schritt 2.
  assert.equal(await inhalt(page.locator(".blsum-price-label")), "Vorläufiger Preis");
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await warteAufText(page, ".alert-error", "Bitte wählen Sie zuerst die Art der Lieferadresse.");
  assert.equal(await page.locator(".booking-confirm-panel").count(), 0, "ohne Wahl ging es zu Schritt 2");
  assert.equal(p.reprice.length, 0, "vor der Bindung wurde die Absicherung bepreist");

  await waehleLieferadresse(page, true);
  assert.deepEqual(p.lz.bindCalls, [{
    offerId: TG.offerId, offerRevision: 0, optionsId: p.lz.optionsId, deliveryIsResidential: true, expectedShippingGross: 18.47,
  }]);
  await warteAufText(page, ".blsum-price-gross", "18,47");
  assert.equal(await inhalt(page.locator(".blsum-price-label")), "Gesamt");
  assert.equal(await inhalt(page.locator("#booking-live-surcharge-note")), "inkl. Zuschlag Privatadresse 3,79 €");
  assert.equal(await inhalt(page.locator("#offer-summary-surcharge-note")), "inkl. Zuschlag Privatadresse 3,79 €");
  assert.equal(await inhalt(page.locator(".offsum-price-gross")), "18,47 € brutto");
  assert.equal(await page.locator(".alert-error").count(), 0, "der Hinweis blieb nach der Wahl stehen");

  await zuSchritt2(page);
  assert.match(await inhalt(page.locator('[data-component="shipping_base"]')), /Versand netto\s*12,34 €/);
  assert.match(await inhalt(page.locator('[data-component="residential_delivery_surcharge"]')), /Zuschlag Privatadresse netto\s*3,18 €/);
  const aufstellung = await inhalt(page.locator(".booking-confirm-box"));
  assert.match(aufstellung, /MwSt\. 19 %\s*2,95 €/);
  assert.match(aufstellung, /Gesamtbetrag brutto\s*18,47 €/);
  await keinAnbieter(page, "Schritt 2");

  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(p.book.length, 1);
  const body = p.book[0];
  assert.equal(body.offerId, TG.offerId);
  assert.equal(body.offerRevision, 1, "der Preisstand der Bindung reist nicht mit");
  assert.deepEqual(body.priceInputs, { deliveryIsResidential: true });
  assert.ok(!("content" in body), "ein Angebot mit Preisangaben sendet eine eigene Inhaltsangabe");
  assert.ok(!JSON.stringify(body).includes("collectionIsResidential"), "es wurde eine Abholadressart gesendet");
  assert.deepEqual(body.insuranceSelection, { type: "none" });

  const recap = await inhalt(page.locator(".booking-success-recap"));
  assert.match(recap, /Zuschlag Privatadresse netto\s*3,18 €/);
  assert.match(recap, /Gesamtbetrag brutto\s*18,47 €/);
  await keinAnbieter(page, "Erfolg");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — Optionen scheitern: Fehlertext und „Erneut versuchen“, danach wählbar", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { failOptions: 1 });
  await zuDenAngeboten(page);
  await waehle(page, TG);
  const box = page.locator("#residential-options-error");
  await box.waitFor({ timeout: 20000 });
  assert.match(await inhalt(box), /Der Zuschlag konnte nicht berechnet werden\./);
  assert.equal(await page.locator('input[name="residential-delivery"]').count(), 0, "neben dem Fehler steht eine Option");
  assert.equal(await inhalt(page.locator("#residential-options-retry")), "Erneut versuchen");
  await page.locator("#residential-options-retry").click();
  await page.locator(`label[for="${LIEFERADRESSE_ID.geschaeft}"]`).waitFor({ timeout: 20000 });
  assert.equal(p.lz.optionsCalls.length, 2);
  assert.equal(p.lz.bindCalls.length, 0);
  assert.equal(await page.locator("#residential-options-error").count(), 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — Doppelklick bindet genau einmal; der Wechsel zur Geschäftsadresse bindet neu", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { bindDelayMs: 900 });
  await zuDenAngeboten(page);
  await waehle(page, TG);
  const privatKarte = page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`);
  await privatKarte.waitFor({ timeout: 20000 });
  await privatKarte.click();
  // Während der Bindung sind beide Karten gesperrt — der zweite Klick erreicht keine Bindung.
  await page.waitForFunction((id) => document.getElementById(id)?.disabled === true, LIEFERADRESSE_ID.geschaeft, { timeout: 5000 });
  await privatKarte.click();
  await page.waitForFunction((id) => { const el = document.getElementById(id); return !!el && el.checked && !el.disabled; },
    LIEFERADRESSE_ID.privat, { timeout: 10000 });
  await kurz(300);
  assert.equal(p.lz.bindCalls.length, 1, "ein Doppelklick band zweimal");

  await waehleLieferadresse(page, false);
  assert.equal(p.lz.bindCalls.length, 2);
  assert.deepEqual(p.lz.bindCalls[1], {
    offerId: TG.offerId, offerRevision: 1, optionsId: p.lz.optionsId, deliveryIsResidential: false, expectedShippingGross: 14.68,
  });
  await warteAufText(page, ".blsum-price-gross", "14,68");
  assert.equal(await page.locator("#booking-live-surcharge-note").count(), 0, "nach dem Wechsel steht der Zuschlag weiter da");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — Zurück zu den Angeboten und wieder hinein: gebundener Preis in der Liste, die Wahl bleibt ohne neue Bindung", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  await waehle(page, TG);
  await waehleLieferadresse(page, true);
  const berechnungen = p.calc.length;

  await page.getByRole("button", { name: "← Zurück", exact: true }).click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(p.calc.length, berechnungen, "der Rückweg hat neu berechnet");
  const karte = karteVon(page, TG);
  const text = await inhalt(karte);
  assert.match(text, /15,52 €/, `die Liste zeigt den gebundenen Preis nicht: ${text}`);
  assert.doesNotMatch(text, /Vorläufiger Preis/);
  assert.equal(await karte.locator(".offer-surcharge-hint").count(), 0);

  const optionsVorher = p.lz.optionsCalls.length;
  await karte.locator("button.offer-cta-btn").click();
  await page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`).waitFor({ timeout: 20000 });
  await page.waitForFunction((id) => document.getElementById(id)?.checked === true, LIEFERADRESSE_ID.privat, { timeout: 10000 });
  assert.equal(p.lz.optionsCalls.length, optionsVorher + 1);
  assert.deepEqual(p.lz.optionsCalls.at(-1), { offerId: TG.offerId, offerRevision: 1 });
  assert.equal(p.lz.bindCalls.length, 1, "die Rückkehr hat erneut gebunden");
  await warteAufText(page, ".blsum-price-gross", "18,47");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F — /book meldet eine Preisänderung mit Neubestätigung: kein Übernahmeknopf, neue Wahl, dann Buchung", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, {
    book: (_body, n, lz) => {
      if (n !== 1) return null;
      invalidiereLieferadresse(lz, NEUE_OPTIONS_ID);
      return { status: 409, json: { error: "Der Preis für dieses Angebot hat sich geändert.", code: "PRICE_CHANGED",
                                    priceInputsRebindRequired: true, offerRevision: lz.revision } };
    },
  });
  await zuDenAngeboten(page);
  await waehle(page, TG);
  await waehleLieferadresse(page, true);
  await zuSchritt2(page);
  await bestaetigen(page);
  await buchenKnopf(page).click();

  const hinweis = page.locator("#residential-options-notice");
  await hinweis.waitFor({ timeout: 20000 });
  assert.equal(await inhalt(hinweis), "Der Preis für dieses Angebot hat sich geändert. Bitte wählen Sie die Art der Lieferadresse erneut.");
  assert.equal(await page.locator("#price-drift-accept").count(), 0, "eine Neubestätigung bietet eine Übernahme an");
  assert.equal(await page.locator(".price-drift-card").count(), 0, "eine Neubestätigung öffnet den Preisdialog");
  await page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`).waitFor({ timeout: 20000 });
  assert.equal(await page.locator('input[name="residential-delivery"]:checked').count(), 0, "die alte Wahl gilt still weiter");
  assert.equal(await inhalt(page.locator(".blsum-price-label")), "Vorläufiger Preis");

  await waehleLieferadresse(page, true);
  assert.deepEqual(p.lz.bindCalls.at(-1), {
    offerId: TG.offerId, offerRevision: 2, optionsId: NEUE_OPTIONS_ID, deliveryIsResidential: true, expectedShippingGross: 18.47,
  });
  await zuSchritt2(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(p.book.length, 2, "genau zwei bewusste Buchungsklicks");
  assert.equal(p.book[1].offerRevision, 3);
  assert.deepEqual(p.book[1].priceInputs, { deliveryIsResidential: true });
  assert.deepEqual(fehler, []);
  await page.close();
});

test("G — Absicherung erst nach der Bindung; ein Wechsel der Lieferadresse setzt sie zurück", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { insuranceAvailable: true });
  await zuDenAngeboten(page);
  await waehle(page, TG);
  await page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`).waitFor({ timeout: 20000 });
  assert.equal(p.reprice.length, 0, "vor der Bindung wurde bepreist");

  await waehleLieferadresse(page, true);
  await zuSchritt2(page);
  await absichern(page);
  await page.waitForSelector(".ins-status-ok", { timeout: 10000 });
  assert.equal(p.reprice.at(-1).offerId, TG.offerId);
  await warteAufText(page, ".blsum-price-gross", "28,47");
  assert.match(await inhalt(page.locator('[data-component="transport_insurance"]')),
    /Zusätzliche Transportabsicherung\s*steuerfrei\s*10,00 €/);

  await page.getByRole("button", { name: /Zurück zur Übersicht/ }).click();
  await waehleLieferadresse(page, false);
  await warteAufText(page, "#residential-options-notice", "Die Art der Lieferadresse wurde geändert.");
  await zuSchritt2(page);
  assert.equal(await page.locator('.ins-card input[value="none"]').isChecked(), true, "die Absicherung blieb nach dem Wechsel gewählt");
  assert.equal(await page.locator("#ins-goodsAreNew-ja").count(), 0, "die alten Antworten stehen noch da");
  await warteAufText(page, ".blsum-price-gross", "14,68");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("H — Neubepreisung verlangt eine Neubestätigung: kein Dialog, keine Übernahme, zurück an die Auswahl", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { insuranceAvailable: true, repriceRebind: true });
  await zuDenAngeboten(page);
  await waehle(page, TG);
  await waehleLieferadresse(page, true);
  await zuSchritt2(page);
  await absichern(page);

  const hinweis = page.locator("#residential-options-notice");
  await hinweis.waitFor({ timeout: 20000 });
  assert.equal(await inhalt(hinweis), "Der Preis für dieses Angebot hat sich geändert. Bitte wählen Sie die Art der Lieferadresse erneut.");
  assert.equal(await page.locator(".price-drift-card").count(), 0, "eine Neubestätigung öffnet den Preisdialog");
  assert.equal(await page.locator(".booking-confirm-panel").count(), 0, "die Seite blieb in Schritt 2");
  assert.ok(p.reprice.every((b) => !b.acceptPriceChange), "es wurde eine Übernahme gesendet");
  await page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`).waitFor({ timeout: 20000 });
  assert.equal(await page.locator('input[name="residential-delivery"]:checked').count(), 0);
  assert.equal(p.book.length, 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

for (const breite of [1440, 834, 390]) {
  test(`I — ${breite} px: Auswahl bedienbar, Trefferflächen, kein horizontaler Überlauf`, async () => {
    const { page, fehler } = await neueSeite({ width: breite, height: 900 });
    await setup(page);
    await zuDenAngeboten(page);
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Angebote mit horizontalem Überlauf`);
    await waehle(page, TG);
    await page.locator(`label[for="${LIEFERADRESSE_ID.privat}"]`).waitFor({ timeout: 20000 });
    await pruefeFlaeche(page, breite, "offen");
    for (const id of Object.values(LIEFERADRESSE_ID)) {
      const box = await page.locator(`label[for="${id}"]`).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= breite + 1, `${breite}px: ${id} liegt außerhalb`);
      assert.ok(box.height >= 44, `${breite}px: ${id} nur ${box.height}px hoch`);
    }
    await waehleLieferadresse(page, true);
    await pruefeFlaeche(page, breite, "gebunden");
    await zuSchritt2(page);
    assert.ok(await querUeberlauf(page) <= 0, `${breite}px: Schritt 2 mit horizontalem Überlauf`);
    assert.ok(await page.locator('[data-component="residential_delivery_surcharge"]').isVisible());
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

test("J — Regression JUMiNGO: keine Frage, keine Zuschlagsanfrage, /book unverändert", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await zuDenAngeboten(page);
  await waehle(page, JM);
  await kurz(800);
  assert.equal(await page.locator("#residential-price-inputs").count(), 0, "ein Angebot ohne Angabe zeigt die Auswahl");
  await zuSchritt2(page);
  await bestaetigen(page);
  await buchenKnopf(page).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.deepEqual(p.anfragen, [], "für ein Angebot ohne Angabe entstand eine Zuschlagsanfrage");
  const body = p.book[0];
  assert.equal(body.offerId, JM.offerId);
  assert.equal(body.tariffId, JM.id);
  assert.ok(!("offerRevision" in body), "das Vergleichsangebot sendet einen Preisstand");
  assert.ok(!("priceInputs" in body), "das Vergleichsangebot sendet eine Adressart");
  assert.equal(body.content, "", "der bestehende Buchungskörper hat sich verändert");
  assert.deepEqual(fehler, []);
  await page.close();
});
