// E2E: zusätzliche Transportabsicherung (TG-F8) — seit TG22 Paket B deckt sie den Warenwert der
// Sendung. Echter Dev-Server, echter Browser, gemocktes Backend.
//
// Was eine Quelltextprüfung nicht erreicht und diese Suite deshalb misst:
//   • welche Karten und Texte ein Tarif mit `selectionModel: "cover_value"` WIRKLICH zeigt —
//     und dass kein Stufen-, Premium- oder Anbietertext durchrutscht,
//   • dass es KEIN eigenes Versicherungswert-Feld mehr gibt: der gesperrte Warenwert ist der
//     Versicherungswert, und genau er geht in die Neubepreisung,
//   • dass beide Pflichtfragen OHNE Vorbelegung erscheinen und die Neubepreisung erst nach
//     ihrer Beantwortung läuft,
//   • den exakten Körper der Neubepreisung (vier Felder, keine Preise),
//   • die Selbstbeteiligung und den Gesamtbetrag aus der Serverantwort,
//   • Warenwert bis 50 €: ein neutraler Hinweis auf die enthaltene Grundabsicherung statt eines
//     Fehlers — keine Karten, keine Neubepreisung, und der Tarif bleibt ohne Zusatz buchbar,
//   • Warenwert über 50 €, aber kein Preis für den Zusatz: fail closed mit neutralem Satz,
//   • die Validierung, den nicht versicherbaren Tarif und 390 px ohne Seitenüberlauf.
//
// Die Stufen (Standard/Premium) misst weiterhin tests/e2e/insuranceTerms.test.mjs.
// Kein echtes Backend, keine Bestellung, keine Neubepreisung beim Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_SENDUNGSANGABEN }
  from "./helpers/newShipmentForm.mjs";

const PORT = 5374, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

// Der Warenwert des Sendungsformulars — seit TG22 Paket B zugleich der Versicherungswert.
const WARENWERT = Number(STANDARD_SENDUNGSANGABEN.declaredGoodsValue);

// Die Beschreibung des Servers: Deckung = Warenwert, mit ihren Grenzen.
const COVER_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
  coverValueSource: "goods_value", coverState: "available", coverValue: WARENWERT,
  basicCoverMaxGoodsValue: 50, maxCoverValue: 2500,
};
const OFFER_ID = "0123456789abcdef0123456789abcdef";

const TARIF_COVER = {
  offerId: OFFER_ID, publicCarrierId: "ups", publicCarrierName: "UPS",
  publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
  netPrice: 10.8, vatAmount: 2.05, finalPrice: 12.85, transitDaysMin: 1, transitDaysMax: 2,
  deliveryTime: "1–2 Tage", availableForDate: true, bookable: true,
  pickupDate: "2026-09-15T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  insuranceAvailable: true, insuranceDetails: COVER_DETAILS,
};
const TARIF_OHNE = { ...TARIF_COVER, offerId: "f".repeat(32), insuranceAvailable: false, insuranceDetails: null };
// Warenwert bis 50 €: kein kaufbarer Zusatz — die Grundabsicherung ist bereits enthalten.
const TARIF_GRUNDSCHUTZ = {
  ...TARIF_COVER, offerId: "b".repeat(32), insuranceAvailable: false,
  insuranceDetails: { ...COVER_DETAILS, isInsurable: false, priceOnSelection: false,
                      coverState: "basic_cover_included", coverValue: null },
};
// Ein Tarif aus einer älteren Antwort, ohne Deckungsquelle: was gilt, sagt erst die Neubepreisung.
const TARIF_ALT = {
  ...TARIF_COVER, offerId: "a".repeat(32),
  insuranceDetails: { isInsurable: true, selectionModel: "cover_value", excessValue: 20,
                      requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true },
};

const GRUNDSCHUTZ_TEXT = "Bis zu einem Warenwert von 50 € ist bereits eine Grundabsicherung ohne Aufpreis enthalten.";
const NICHT_VERFUEGBAR_TEXT = "Für diesen Tarif ist derzeit keine zusätzliche Transportabsicherung verfügbar.";
const GRUNDSCHUTZ_ANGABEN = { ...STANDARD_SENDUNGSANGABEN, declaredGoodsValue: "50" };

const REPRICE_OK = (body) => ({
  selectedInsurance: "transit_cover",
  insurance: { coverValue: body.coverValue, excessValue: 20, goodsAreNew: body.goodsAreNew,
               goodsAreFragile: body.goodsAreFragile, insuranceGross: 10 },
  totals: { customerShippingNet: 10.8, shippingVat: 2.05, customerShippingGross: 12.85,
            insuranceGross: 10, customerTotalGross: 22.85 },
  tariff: { insuranceAvailable: true, insuranceDetails: COVER_DETAILS },
});

const BUCHUNG_OK = {
  message: "Sendung gebucht", ceShipmentId: 4711, invoiceNumber: "CE-RE26-00074",
  businessOrderNumber: "CE-BS26-00074", dueDate: null, amount: 12.85, billingMode: "single",
  testBooking: false, voucherCode: null, deliveryNote: null,
  orderConfirmation: { number: "CE-AB26-00074", issuedAt: "2026-09-12T10:00:00Z" }, shippingDocuments: [],
};

let server, browser;

/* `reprice` ersetzt die Antwort der Neubepreisung ({ status, body }); `buchungen` fängt /book ab —
   es entsteht nie eine Bestellung. */
async function setupRoutes(page, tariffs, protokoll, { reprice = null, buchungen = null } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    // Legal-Buchungsschranke ausgeschaltet beantwortet — ohne Antwort sperrte der Sammelfall
    // die Bestellung fail closed (siehe insuranceTerms.test.mjs).
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/shipping/launch-scope")) return json({ countries: ["DE"], partialCountries: [] });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      ceShipmentId: 4711, tariffs, availableShippingModes: ["standard"],
      publicCarriers: [{ id: "ups", name: "UPS" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/insurance/reprice")) {
      const body = route.request().postDataJSON();
      protokoll.push(body);
      if (reprice) {
        const antwort = reprice(body);
        return json(antwort.body, antwort.status);
      }
      return json(REPRICE_OK(body));
    }
    if (p.includes("/api/jumingo/reprice-insurance")) {
      protokoll.push({ veralteterEndpunkt: true });
      return json({}, 404);
    }
    if (p.includes("/api/jumingo/book")) {
      if (buchungen) buchungen.push(route.request().postDataJSON());
      return json(BUCHUNG_OK);
    }
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-09-15T09:00:00Z", availableUntil: "2026-09-15T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function zurBuchung(page, sendungsangaben = STANDARD_SENDUNGSANGABEN) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { sendungsangaben });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".booking-confirm-panel", { timeout: 20000 });
}

// Karten über den Wert ihres Radios — `:has-text` wäre hier mehrdeutig, weil
// „Keine zusätzliche Transportabsicherung" den Namen der anderen Karte enthält.
const karte = (page, id) => page.locator(`.ins-card:has(input[value="${id}"])`);
const waehle = async (page, id) => { await karte(page, id).locator(".ins-card-name").click(); await page.waitForTimeout(150); };

// AGB und Gefahrgut bestätigen; zurück kommt der Bestellknopf.
async function bestellbereit(page) {
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  return page.getByRole("button", { name: /Kostenpflichtig buchen/ });
}

async function warteAufBuchung(page, buchungen) {
  for (let i = 0; i < 100 && buchungen.length === 0; i++) await page.waitForTimeout(100);
  assert.equal(buchungen.length, 1, "es wurde nicht gebucht");
  return buchungen[0];
}

const VERBOTEN = ["Standardversicherung", "Premiumversicherung", "Premium", "Priorisierter Support",
                  "Status-Updates", "Transglobal", "TRANSGLOBAL", "JUMiNGO", "Jumingo"];
// Der 50-€-Betrag der Stufentexte — als eigener Betrag, nicht als Teilzeichenkette: ein
// Versicherungswert von 250,00 € enthält „50,00 €" und ist erlaubt.
const VERBOTENER_BETRAG = /(^|[^\d.])50,00 €/;

function pruefeKeinVerbotenerText(text) {
  for (const v of VERBOTEN) assert.ok(!text.includes(v), `„${v}" ist sichtbar`);
  assert.ok(!VERBOTENER_BETRAG.test(text), `„50,00 €" aus den Stufentexten ist sichtbar`);
}

const flach = (s) => s.replace(/ /g, " ");

async function sichtbarerText(page) {
  return flach(await page.evaluate(() => document.body.innerText));
}

test.before(async () => {
  server = spawn("npm", ["run", "dev", "--", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(), stdio: "ignore", detached: true,
  });
  const start = Date.now();
  while (Date.now() - start < 60000) {
    try { const r = await fetch(BASE); if (r.ok) break; } catch { /* noch nicht da */ }
    await new Promise(r => setTimeout(r, 400));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch { /* schon beendet */ } }
});

/* ── 1. Karten und Texte ─────────────────────────────────────────────────── */

test("1 — zwei neutrale Karten, Selbstbeteiligung 20,00 €, kein Stufen- oder Anbietertext", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const protokoll = [];
  await setupRoutes(page, [TARIF_COVER], protokoll);
  await zurBuchung(page);

  const modul = page.locator(".booking-insurance-box");
  assert.equal(await page.locator(".ins-card").count(), 2, "erwartet genau zwei Karten");
  assert.match(await karte(page, "transit_cover").innerText(), /Zusätzliche Transportabsicherung/);
  assert.match(await karte(page, "none").innerText(), /Keine zusätzliche Transportabsicherung/);
  const kartenText = flach(await karte(page, "transit_cover").innerText());
  assert.match(kartenText, /Selbstbeteiligung: 20,00 €/);
  assert.match(kartenText, /Preis nach Ihren Angaben/, "vor der Neubepreisung darf kein Preis erscheinen");
  assert.equal(await modul.locator(".ins-card-details-btn").count(), 0, "der Stufendialog hat hier keinen Auslöser");

  pruefeKeinVerbotenerText(await sichtbarerText(page));
  // Standard ist „keine Absicherung": keine Wertfelder, keine Fragen, kein Request.
  assert.match(await page.locator(".ins-card--selected .ins-card-name").innerText(), /Keine zusätzliche Transportabsicherung/);
  assert.equal(await page.locator("#ins-value").count(), 0);
  assert.equal(await page.locator(".ins-goods-question").count(), 0);
  assert.equal(protokoll.length, 0);
  await page.close();
});

/* ── 2. Auswahl, Pflichtfragen, Neubepreisung ────────────────────────────── */

test("2 — der Warenwert IST der Versicherungswert; Neubepreisung erst nach beiden Antworten, mit exaktem Körper", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const protokoll = [];
  await setupRoutes(page, [TARIF_COVER], protokoll);
  await zurBuchung(page);
  await waehle(page, "transit_cover");

  // Warenwert übernommen und gesperrt — und KEIN eigenes Feld für den Versicherungswert.
  const waren = page.locator("#ins-goods");
  assert.equal(await waren.getAttribute("readonly") !== null, true, "der Warenwert ist editierbar");
  assert.equal(await waren.isEditable(), false, "der Warenwert lässt sich überschreiben");
  assert.equal(Number(await waren.inputValue()), WARENWERT);
  assert.equal(await page.locator("#ins-value").count(), 0, "es gibt wieder ein frei wählbares Versicherungswert-Feld");
  assert.equal(await page.locator(".ins-adjust-btn").count(), 0, "„Versicherungswert anpassen“ ist sichtbar");
  assert.match(flach(await page.locator(".ins-inputs").innerText()),
    /Die zusätzliche Transportabsicherung gilt bis zu diesem Warenwert\./);

  // Beide Fragen, vier Radios, KEINES ausgewählt.
  assert.equal(await page.locator(".ins-goods-question").count(), 2);
  assert.match(await page.locator(".ins-goods-question").nth(0).innerText(), /Ist die Ware neu\?/);
  assert.match(await page.locator(".ins-goods-question").nth(1).innerText(), /Ist die Ware zerbrechlich\?/);
  const gewaehlt = await page.locator(".ins-goods-question input[type=radio]:checked").count();
  assert.equal(gewaehlt, 0, "eine Pflichtfrage ist vorbelegt");

  // Ohne Antworten keine Neubepreisung — auch nach dem Debounce nicht.
  await page.waitForTimeout(900);
  assert.equal(protokoll.length, 0, "die Neubepreisung lief ohne Antworten");

  await page.locator("#ins-goodsAreNew-ja").check();
  await page.waitForTimeout(900);
  assert.equal(protokoll.length, 0, "die Neubepreisung lief mit nur einer Antwort");
  await page.locator("#ins-goodsAreFragile-nein").check();
  await page.waitForSelector(".ins-status-ok", { timeout: 5000 });

  assert.equal(protokoll.length, 1, `erwartet genau eine Neubepreisung, gesehen: ${protokoll.length}`);
  assert.deepEqual(protokoll[0], {
    offerId: OFFER_ID,
    coverValue: WARENWERT,
    goodsAreNew: true,
    goodsAreFragile: false,
  });
  assert.ok(!protokoll.some((b) => b.veralteterEndpunkt), "der alte Endpunkt wurde gerufen");
  assert.match(await page.locator(".ins-status-ok").innerText(), /Preis der Transportabsicherung bestätigt/);

  // Preiszusammenfassung: Absicherung, versicherter Betrag = Warenwert, Selbstbeteiligung, Gesamt.
  const summe = flach(await page.locator(".booking-confirm-box").innerText());
  assert.match(summe, /Zusätzliche Transportabsicherung/);
  assert.match(summe, /10,00 €/);
  assert.match(summe, /Versicherter Betrag\s*250,00 €/);
  assert.match(summe, /Selbstbeteiligung\s*20,00 €/);
  assert.match(summe, /Gesamtbetrag brutto\s*22,85 €/);

  pruefeKeinVerbotenerText(await sichtbarerText(page));
  await page.close();
});

/* ── 3. Validierung ──────────────────────────────────────────────────────── */

test("3 — offene Fragen werden benannt; beantwortet wird genau mit dem Warenwert bepreist", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const protokoll = [];
  await setupRoutes(page, [TARIF_COVER], protokoll);
  await zurBuchung(page);
  await waehle(page, "transit_cover");

  // Beim ersten Einblenden noch keine Fehlerwand.
  assert.equal(await page.locator(".ins-goods-question .field-error").count(), 0);

  // Der Versuch weiterzugehen deckt die offenen Fragen auf.
  await page.getByRole("button", { name: /Zurück zur Übersicht/ }).click();
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".booking-insurance-box", { timeout: 10000 });
  const fehler = page.locator(".ins-goods-question .field-error");
  assert.equal(await fehler.count(), 2, "beide offenen Pflichtfragen müssen benannt werden");
  assert.match(await fehler.first().innerText(), /Bitte beantworten Sie diese Frage\./);

  await page.locator("#ins-goodsAreNew-nein").check();
  assert.equal(await fehler.count(), 1, "eine beantwortete Frage bleibt als Fehler markiert");

  await page.locator("#ins-goodsAreFragile-ja").check();
  await page.waitForSelector(".ins-status-ok", { timeout: 5000 });
  assert.ok(protokoll.length >= 1, "die Neubepreisung lief nicht");
  assert.ok(protokoll.every((b) => b.coverValue === WARENWERT), "bepreist wurde nicht der Warenwert");
  assert.equal(await page.locator("#ins-value").count(), 0);
  await page.close();
});

test("3b — Warenwert über 50 €, aber kein Preis für den Zusatz: fail closed mit neutralem Satz, ohne Zusatz buchbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const protokoll = [], buchungen = [];
  await setupRoutes(page, [TARIF_COVER], protokoll, {
    buchungen,
    reprice: () => ({ status: 409, body: { error: "Rohtext insurance_cost_not_positive Transglobal", code: "INSURANCE_UNAVAILABLE" } }),
  });
  await zurBuchung(page);
  await waehle(page, "transit_cover");
  await page.locator("#ins-goodsAreNew-ja").check();
  await page.locator("#ins-goodsAreFragile-nein").check();

  const status = page.locator(".ins-status-error");
  await status.waitFor({ timeout: 5000 });
  assert.equal(flach(await status.innerText()).trim(), NICHT_VERFUEGBAR_TEXT);
  assert.equal(protokoll.length, 1);
  assert.equal(protokoll[0].coverValue, WARENWERT);
  assert.equal(await page.locator(".ins-status-ok").count(), 0, "ein Preis wurde bestätigt");
  assert.equal(await page.locator("#ins-reprice-notice").count(), 0, "die Nichtverfügbarkeit erscheint als Hinweis");
  const text = await sichtbarerText(page);
  for (const v of ["insurance_cost", "Rohtext", "Transglobal"]) assert.ok(!text.includes(v), `„${v}" ist sichtbar`);

  // Mit Zusatz, aber ohne bestätigten Preis wird nicht gebucht.
  const knopf = await bestellbereit(page);
  assert.equal(await knopf.isDisabled(), true, "ohne bestätigten Preis der Absicherung ist die Buchung möglich");

  // Ohne Zusatz bleibt der Tarif buchbar — ohne jeden Versicherungswert.
  await waehle(page, "none");
  await page.waitForTimeout(300);
  assert.equal(await knopf.isEnabled(), true, "ohne Zusatz ist der Tarif nicht mehr buchbar");
  await knopf.click();
  const body = await warteAufBuchung(page, buchungen);
  assert.deepEqual(body.insuranceSelection, { type: "none" });
  assert.ok(!JSON.stringify(body).includes("coverValue"), "die Buchung ohne Zusatz trägt einen Versicherungswert");
  await page.close();
});

/* ── 4. Nicht versicherbarer Tarif ───────────────────────────────────────── */

test("4 — ein Tarif ohne Absicherung zeigt kein Modul und bepreist nichts", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const protokoll = [];
  await setupRoutes(page, [TARIF_OHNE], protokoll);
  await zurBuchung(page);
  assert.equal(await page.locator(".ins-cards").count(), 0, "ein nicht versicherbarer Tarif zeigt Versicherungskarten");
  assert.equal(await page.locator(".booking-ins-unavailable").count(), 1);
  assert.equal(await page.locator("#ins-cover-notice").count(), 0, "ohne Aussage des Servers erscheint ein Hinweis");
  await page.waitForTimeout(700);
  assert.equal(protokoll.length, 0);
  await page.close();
});

/* ── 5. Angebotskarte ───────────────────────────────────────────────────── */

test("5 — die Angebotskarte nennt die wählbare Absicherung ohne Preis und ohne „nicht online auswählbar“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIF_COVER], []);
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  // Details aufklappen — derselbe Weg wie in offerCardParity.
  await page.evaluate(() => document.querySelectorAll(".offer-details-link").forEach((b) => b.click()));
  await page.waitForTimeout(300);
  const text = await sichtbarerText(page);
  assert.ok(!/nicht online auswählbar/.test(text), "der veraltete Hinweis ist sichtbar");
  assert.match(text, /Zusätzliche Transportabsicherung\s*Wählbar/);
  assert.match(text, /Selbstbeteiligung\s*20,00 €/);
  assert.match(text, /Der Preis wird bei der Buchung anhand Ihrer Angaben berechnet\./);
  for (const v of ["Transglobal", "Premium", "Standardversicherung"]) {
    assert.ok(!text.includes(v), `„${v}" ist auf der Angebotskarte sichtbar`);
  }
  await page.close();
});

test("5b — die Angebotskarte nennt die enthaltene Grundabsicherung als Hinweis, nicht als „nicht verfügbar“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIF_GRUNDSCHUTZ], []);
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { sendungsangaben: GRUNDSCHUTZ_ANGABEN });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.evaluate(() => document.querySelectorAll(".offer-details-link").forEach((b) => b.click()));
  await page.waitForTimeout(300);
  const text = await sichtbarerText(page);
  assert.ok(text.includes(GRUNDSCHUTZ_TEXT), "der Hinweis auf die Grundabsicherung fehlt auf der Angebotskarte");
  assert.ok(!/Keine Zusatzversicherung verfügbar/.test(text), "die Grundabsicherung wird als „nicht verfügbar“ gezeigt");
  assert.ok(!/Zusätzliche Transportabsicherung\s*Wählbar/.test(text), "ein nicht kaufbarer Zusatz wird als wählbar gezeigt");
  for (const v of ["Transglobal", "Premium", "Standardversicherung"]) {
    assert.ok(!text.includes(v), `„${v}" ist auf der Angebotskarte sichtbar`);
  }
  await page.close();
});

/* ── 6. Responsive ──────────────────────────────────────────────────────── */

test("6 — 390 px: kein Seitenüberlauf mit eingeblendeten Fragen und mit dem Hinweis auf die Grundabsicherung", async () => {
  const mass = (page) => page.evaluate(() => {
    const de = document.documentElement;
    const box = document.querySelector(".booking-insurance-box");
    return {
      seite: de.scrollWidth - de.clientWidth,
      modul: box ? Math.round(box.scrollWidth - box.clientWidth) : 0,
    };
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(page, [TARIF_COVER], []);
  await zurBuchung(page);
  await waehle(page, "transit_cover");
  await page.waitForSelector(".ins-goods-question", { timeout: 5000 });
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(150);
    const m = await mass(page);
    assert.ok(m.seite <= 0, `@${width}: Seiten-Overflow ${m.seite}px`);
    assert.ok(m.modul <= 1, `@${width}: der Absicherungsblock läuft ${m.modul}px über`);
  }
  await page.close();

  const hinweis = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(hinweis, [TARIF_GRUNDSCHUTZ], []);
  await zurBuchung(hinweis, GRUNDSCHUTZ_ANGABEN);
  await hinweis.waitForSelector("#ins-cover-notice", { timeout: 5000 });
  const m = await mass(hinweis);
  assert.ok(m.seite <= 0, `@390 Hinweis: Seiten-Overflow ${m.seite}px`);
  assert.ok(m.modul <= 1, `@390 Hinweis: der Absicherungsblock läuft ${m.modul}px über`);
  await hinweis.close();
});

/* ── 7. Warenwert bis 50 € ──────────────────────────────────────────────── */

test("7 — Warenwert bis 50 €: Hinweis auf die Grundabsicherung statt Fehler, keine Neubepreisung, ohne Zusatz buchbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const protokoll = [], buchungen = [];
  await setupRoutes(page, [TARIF_GRUNDSCHUTZ], protokoll, { buchungen });
  await zurBuchung(page, GRUNDSCHUTZ_ANGABEN);

  const hinweis = page.locator("#ins-cover-notice");
  assert.equal(await hinweis.count(), 1, "der Hinweis auf die Grundabsicherung fehlt");
  assert.equal(flach(await hinweis.innerText()).trim(), GRUNDSCHUTZ_TEXT);
  assert.equal(await page.locator(".ins-cards").count(), 0, "ohne kaufbaren Zusatz erscheinen Karten");
  assert.equal(await page.locator(".booking-ins-unavailable").count(), 0, "die Grundabsicherung wird als „nicht verfügbar“ gezeigt");
  assert.equal(await page.locator(".booking-insurance-box .ins-status-error, .booking-insurance-box .field-error").count(), 0);
  assert.equal(await page.locator(".booking-insurance-box input").count(), 0, "der Hinweis trägt ein Bedienelement");
  const text = await sichtbarerText(page);
  for (const v of ["nicht verfügbar", "nicht bestätigt", "Preis konnte", "Transglobal", "TRANSGLOBAL", "JUMiNGO"]) {
    assert.ok(!text.includes(v), `„${v}" ist sichtbar`);
  }
  await page.waitForTimeout(900);
  assert.equal(protokoll.length, 0, "ohne kaufbaren Zusatz wurde neu bepreist");

  const knopf = await bestellbereit(page);
  assert.equal(await knopf.isEnabled(), true, "der Tarif ist ohne Zusatz nicht buchbar");
  await knopf.click();
  const body = await warteAufBuchung(page, buchungen);
  assert.deepEqual(body.insuranceSelection, { type: "none" });
  assert.equal(body.offerId, TARIF_GRUNDSCHUTZ.offerId);
  assert.ok(!JSON.stringify(body).includes("coverValue"), "die Buchung trägt einen Versicherungswert");
  assert.ok(!("confirmedTotalGross" in body), "die Buchung ohne Zusatz trägt einen Absicherungsbetrag");
  await page.close();
});

/* ── 8. Aussage erst bei der Neubepreisung ──────────────────────────────── */

test("8 — sagt erst die Neubepreisung „Grundabsicherung enthalten“, erscheint ein Hinweis — kein Fehler, kein Dauerladen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const protokoll = [];
  await setupRoutes(page, [TARIF_ALT], protokoll, {
    reprice: () => ({ status: 409, body: { error: "Rohtext", code: "INSURANCE_BASIC_COVER_INCLUDED", basicCoverMaxGoodsValue: 50 } }),
  });
  await zurBuchung(page);
  await waehle(page, "transit_cover");
  await page.locator("#ins-goodsAreNew-nein").check();
  await page.locator("#ins-goodsAreFragile-nein").check();

  const hinweis = page.locator("#ins-reprice-notice");
  await hinweis.waitFor({ timeout: 5000 });
  assert.equal(flach(await hinweis.innerText()).trim(), GRUNDSCHUTZ_TEXT);
  assert.equal(await page.locator(".ins-status-error").count(), 0, "die Aussage erscheint als Fehler");
  await page.waitForTimeout(900);
  assert.equal(await page.locator(".ins-status-loading, .ins-card-calc").count(), 0, "der Status bleibt auf „wird aktualisiert“ stehen");
  assert.equal(protokoll.length, 1, "der Hinweis löst eine erneute Neubepreisung aus");
  // Ein älterer Tarif nennt keinen Serverwert — der eingefrorene Warenwert reist als Konsistenzwächter mit.
  assert.deepEqual(protokoll[0], { offerId: TARIF_ALT.offerId, coverValue: WARENWERT, goodsAreNew: false, goodsAreFragile: false });
  assert.ok(!(await sichtbarerText(page)).includes("Rohtext"), "der Rohtext des Servers ist sichtbar");
  await page.close();
});
