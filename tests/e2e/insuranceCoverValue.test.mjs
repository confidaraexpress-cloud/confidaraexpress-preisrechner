// E2E: zusätzliche Transportabsicherung mit frei gewähltem Versicherungswert (TG-F8) —
// echter Dev-Server, echter Browser, gemocktes Backend.
//
// Was eine Quelltextprüfung nicht erreicht und diese Suite deshalb misst:
//   • welche Karten und Texte ein Tarif mit `selectionModel: "cover_value"` WIRKLICH zeigt —
//     und dass kein Stufen-, Premium- oder Anbietertext durchrutscht,
//   • dass beide Pflichtfragen OHNE Vorbelegung erscheinen und die Neubepreisung erst nach
//     ihrer Beantwortung läuft,
//   • den exakten Körper der Neubepreisung (vier Felder, keine Preise),
//   • die Selbstbeteiligung und den Gesamtbetrag aus der Serverantwort,
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

const COVER_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
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

const REPRICE_OK = (body) => ({
  selectedInsurance: "transit_cover",
  insurance: { coverValue: body.coverValue, excessValue: 20, goodsAreNew: body.goodsAreNew,
               goodsAreFragile: body.goodsAreFragile, insuranceGross: 10 },
  totals: { customerShippingNet: 10.8, shippingVat: 2.05, customerShippingGross: 12.85,
            insuranceGross: 10, customerTotalGross: 22.85 },
  tariff: { insuranceAvailable: true, insuranceDetails: COVER_DETAILS },
});

let server, browser;

async function setupRoutes(page, tariffs, protokoll) {
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
      return json(REPRICE_OK(body));
    }
    if (p.includes("/api/jumingo/reprice-insurance")) {
      protokoll.push({ veralteterEndpunkt: true });
      return json({}, 404);
    }
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-09-15T09:00:00Z", availableUntil: "2026-09-15T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function zurBuchung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
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

const VERBOTEN = ["Standardversicherung", "Premiumversicherung", "Premium", "Priorisierter Support",
                  "Status-Updates", "Transglobal", "TRANSGLOBAL", "JUMiNGO", "Jumingo"];
// Der 50-€-Betrag der Stufentexte — als eigener Betrag, nicht als Teilzeichenkette: ein
// gewählter Versicherungswert von 750,00 € enthält „50,00 €" und ist erlaubt.
const VERBOTENER_BETRAG = /(^|[^\d.])50,00 €/;

function pruefeKeinVerbotenerText(text) {
  for (const v of VERBOTEN) assert.ok(!text.includes(v), `„${v}" ist sichtbar`);
  assert.ok(!VERBOTENER_BETRAG.test(text), `„50,00 €" aus den Stufentexten ist sichtbar`);
}

async function sichtbarerText(page) {
  return (await page.evaluate(() => document.body.innerText)).replace(/\u00a0/g, " ");
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
  const kartenText = (await karte(page, "transit_cover").innerText()).replace(/\u00a0/g, " ");
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

test("2 — Fragen ohne Vorbelegung; Neubepreisung erst nach beiden Antworten, mit exaktem Körper", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const protokoll = [];
  await setupRoutes(page, [TARIF_COVER], protokoll);
  await zurBuchung(page);
  await waehle(page, "transit_cover");

  // Warenwert übernommen und gesperrt, Versicherungswert frei wählbar.
  const waren = page.locator("#ins-goods");
  assert.equal(await waren.getAttribute("readonly") !== null, true, "der Warenwert ist editierbar");
  const wert = page.locator("#ins-value");
  assert.equal(await wert.count(), 1, "das Feld für den Versicherungswert fehlt");
  assert.equal(await wert.isEditable(), true, "der Versicherungswert ist nicht wählbar");
  assert.equal(await wert.getAttribute("max"), null, "im Deckungsbetragsmodell gilt keine Stufengrenze");

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
    coverValue: Number(STANDARD_SENDUNGSANGABEN.declaredGoodsValue),
    goodsAreNew: true,
    goodsAreFragile: false,
  });
  assert.ok(!protokoll.some((b) => b.veralteterEndpunkt), "der alte Endpunkt wurde gerufen");
  assert.match(await page.locator(".ins-status-ok").innerText(), /Preis der Transportabsicherung bestätigt/);

  // Ein anderer Versicherungswert bepreist neu — mit genau diesem Wert.
  await wert.fill("750");
  await page.waitForTimeout(900);
  await page.waitForSelector(".ins-status-ok", { timeout: 5000 });
  assert.equal(protokoll.at(-1).coverValue, 750);

  // Preiszusammenfassung: Absicherung, versicherter Betrag, Selbstbeteiligung, Gesamt.
  const summe = (await page.locator(".booking-confirm-box").innerText()).replace(/\u00a0/g, " ");
  assert.match(summe, /Zusätzliche Transportabsicherung/);
  assert.match(summe, /10,00 €/);
  assert.match(summe, /Versicherter Betrag\s*750,00 €/);
  assert.match(summe, /Selbstbeteiligung\s*20,00 €/);
  assert.match(summe, /Gesamtbetrag brutto\s*22,85 €/);

  pruefeKeinVerbotenerText(await sichtbarerText(page));
  await page.close();
});

/* ── 3. Validierung ──────────────────────────────────────────────────────── */

test("3 — offene Fragen und ein ungültiger Versicherungswert werden benannt", async () => {
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

  // Versicherungswert 0 → benannter Fehler, keine Neubepreisung.
  await page.locator("#ins-goodsAreFragile-ja").check();
  await page.locator("#ins-value").fill("0");
  await page.locator("#ins-value").blur();
  await page.waitForTimeout(900);
  assert.match(await page.locator(".ins-inputs").innerText(), /größer als 0/);
  assert.ok(protokoll.every((b) => b.coverValue !== 0), "ein ungültiger Wert wurde bepreist");
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

/* ── 6. Responsive ──────────────────────────────────────────────────────── */

test("6 — 390 px: kein Seitenüberlauf mit eingeblendeten Fragen", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(page, [TARIF_COVER], []);
  await zurBuchung(page);
  await waehle(page, "transit_cover");
  await page.waitForSelector(".ins-goods-question", { timeout: 5000 });
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(150);
    const mass = await page.evaluate(() => {
      const de = document.documentElement;
      const box = document.querySelector(".booking-insurance-box");
      return {
        seite: de.scrollWidth - de.clientWidth,
        modul: box ? Math.round(box.scrollWidth - box.clientWidth) : 0,
      };
    });
    assert.ok(mass.seite <= 0, `@${width}: Seiten-Overflow ${mass.seite}px`);
    assert.ok(mass.modul <= 1, `@${width}: der Absicherungsblock läuft ${mass.modul}px über`);
  }
  await page.close();
});
