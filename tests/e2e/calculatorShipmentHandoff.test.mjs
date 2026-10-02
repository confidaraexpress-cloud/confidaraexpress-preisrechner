// E2E: Preisrechner → „Neue Sendung" und das Datumslabel der Shopabgabe (Produktionsbefund 2026-10-02).
// Echter Dev-Server, echter Browser, gemocktes Backend. Keine Buchung, kein Anbieter.
//
//   P  Produktionsfall: DE→DE 97421 Schweinfurt → 10115 Berlin, 1 × 2 kg, 30×20×15, Versanddatum 09.10.2026,
//      UPS „Standard Samstagszustellung" (3588) im Preisrechner gewählt → „Neue Sendung" trägt Route, Paket,
//      Datum und die Absicht; Straße, Kontakt und Sendungsangaben fehlen und werden angefordert; Browser-
//      Zurück/Vorwärts erhält beide Seiten; nach dem Ergänzen rechnet „Neue Sendung" NEU und markiert genau
//      dasselbe Angebot mit dem neuen Serverpreis. Gebucht wird nichts.
//   U  Nach der Neuberechnung fehlt das Angebot → nichts markiert, ehrlicher Hinweis, kein ähnliches Angebot.
//   S  Shopabgabe (DPD Paketshop / DHL Economy Drop-off): „Shopabgabe", „Abgabestelle", „Abgabetermin" — kein
//      „Abholtermin", kein „Termin & Abholung" — in Preisrechner UND „Neue Sendung"; eine Abholung bleibt „Abholtermin".
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleAdresse, fuelleSendungsangaben, STANDARD_SENDUNGSANGABEN } from "./helpers/newShipmentForm.mjs";

const PORT = 5447, BASE = `http://127.0.0.1:${PORT}`;
// Montag, 05.10.2026 — damit der 09.10.2026 im Kalender wählbar ist und weder „Heute" noch „Morgen" heißt.
const UHR = "2026-10-05T10:00:00+02:00";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "97421", city: "Schweinfurt", customer_number: "CE-K-10999",
};
const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
              "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const kennung = (kopf, fuss) => `${kopf}${fuss.padStart(32 - kopf.length, "0")}`;
const preis = (netto) => ({ netPrice: netto, vatAmount: Number((netto * 0.19).toFixed(2)),
                            finalPrice: Number((netto * 1.19).toFixed(2)), currency: "EUR" });
const J = (id, lauf, carrier, name, netto, extra = {}) => ({
  id, shipper_tariff_id: typeof id === "number" ? id : Number(String(id).replace("s-", "")),
  offerId: kennung(`cs${lauf}`, String(id).replace("s-", "")),
  publicCarrierId: carrier.id, publicCarrierName: carrier.name, publicServiceName: name, serviceType: "pickup",
  shippingMode: "standard", transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1-2 Tage",
  trackingAvailable: true, printerRequired: false, deliveryOnSaturday: false,
  pickupDate: "2026-10-09", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-10-10", deliveryDateMin: "2026-10-10", deliveryDateMax: "2026-10-10",
  bookable: true, unavailableReason: null, requiredPriceInputs: [], ...preis(netto), ...extra,
});
const UPS = { id: "ups", name: "UPS" }, DPD = { id: "dpd", name: "DPD" }, DHL = { id: "dhl", name: "DHL Express" };
// Lauf „a" = Preisrechner, Lauf „b" = Neuberechnung in „Neue Sendung" (neue Angebotskennungen, neuer Preis).
const angebote = (lauf, { mit3588 = true, preis3588 = 14.2 } = {}) => [
  ...(mit3588 ? [J(3588, lauf, UPS, "Standard Samstagszustellung", preis3588, { deliveryOnSaturday: true })] : []),
  J(3264, lauf, UPS, "Standard", 11.1),
  J("s-2036", lauf, DPD, "Standard Paketshop", 5.71, { serviceType: "dropoff" }),
  J("s-3072", lauf, DHL, "Economy", 9.4, { serviceType: "dropoff", shippingMode: "economy" }),
];

let server, browser;

async function setup(page, { neueListe }) {
  const p = { calc: [], pfade: [] };
  await page.clock.setFixedTime(new Date(UHR));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const pfad = new URL(route.request().url()).pathname;
    p.pfade.push(pfad);
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/api/shipping/launch-scope")) return json({ countries: EU27, originCountries: ["DE"] });
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (pfad.includes("/api/jumingo/calculate-price")) {
      let body = {};
      try { body = JSON.parse(route.request().postData() || "{}"); } catch { /* leer */ }
      p.calc.push(body);
      const tariffs = p.calc.length === 1 ? angebote("a") : neueListe();
      return json({ ceShipmentId: 5000 + p.calc.length, tariffs, availableShippingModes: ["economy", "standard"],
                    publicCarriers: [DHL, DPD, UPS], customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE",
                    exportDeclaration: null });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const karteVon = (page, offerId) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${offerId}"])`);
const wert = (page, id) => page.locator(`#${id}`).inputValue();

async function neueSeite(viewport = { width: 1440, height: 1100 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

/* Preisrechner: Produktionsfall eingeben, 09.10.2026 wählen, Angebote berechnen. */
async function rechnerProduktionsfall(page) {
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await page.fill("#calc-from-zip", "97421");
  await page.fill("#calc-from-city", "Schweinfurt");
  await page.fill("#calc-to-zip", "10115");
  await page.fill("#calc-to-city", "Berlin");
  await page.fill("#calc-packageCount", "1");
  await page.fill("#calc-weight", "2");
  await page.fill("#calc-length", "30");
  await page.fill("#calc-width", "20");
  await page.fill("#calc-height", "15");
  await page.locator(".service-filter-trigger", { hasText: "Versanddatum" }).click();
  await page.locator(".date-picker-body:not(.date-picker-body--latest) .dc-day", { hasText: /^9$/ }).first().click();
  assert.match(norm(await page.locator(".service-filter-trigger", { hasText: "Versanddatum" }).textContent()), /09\.10\.2026/);
  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

async function zuNeueSendung(page) {
  await karteVon(page, kennung("csa", "3588")).locator("button.offer-cta-btn").click();
  await page.waitForSelector(".offers-form-section #ns-weight", { timeout: 20000 });
  await page.waitForSelector(".ns-calculator-intent", { timeout: 20000 });
}

/* Die vom Preisrechner nicht erhobenen Angaben — genau das, was „Neue Sendung" anfordert. */
async function ergaenzeFehlendes(page) {
  await fuelleAdresse(page, "s", { company: "Muster GmbH", firstName: "Max", lastName: "Mustermann",
    email: "max@example.com", phone: "+49301234567", street: "Hauptstrasse 1" });
  await fuelleAdresse(page, "r", { company: "Empfang AG", firstName: "Erika", lastName: "Empfaenger",
    email: "erika@example.com", phone: "+49891234567", street: "Bahnhofstrasse 9" });
  await fuelleSendungsangaben(page, STANDARD_SENDUNGSANGABEN);
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

test("P — Produktionsfall: Route, Paket, Datum und Angebotsabsicht kommen an; Neuberechnung markiert dasselbe Angebot", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { neueListe: () => angebote("b", { preis3588: 15.1 }) });
  await rechnerProduktionsfall(page);
  assert.equal(p.calc.length, 1);
  assert.equal(p.calc[0].shippingDate, "2026-10-09");
  await zuNeueSendung(page);

  // Route, Paket und Datum sind übernommen — nichts springt auf heute.
  assert.deepEqual([await wert(page, "ns-s-country"), await wert(page, "ns-s-zip"), await wert(page, "ns-s-city")],
    ["DE", "97421", "Schweinfurt"]);
  assert.deepEqual([await wert(page, "ns-r-country"), await wert(page, "ns-r-zip"), await wert(page, "ns-r-city")],
    ["DE", "10115", "Berlin"]);
  assert.deepEqual([await wert(page, "ns-packageCount"), await wert(page, "ns-weight"), await wert(page, "ns-length"),
                    await wert(page, "ns-width"), await wert(page, "ns-height")], ["1", "2", "30", "20", "15"]);
  assert.match(norm(await page.locator(".service-filter-trigger", { hasText: "Versanddatum" }).textContent()), /09\.10\.2026/);
  // Die Absicht ist sichtbar — ohne Preis.
  const hinweis = norm(await page.locator(".ns-calculator-intent").textContent());
  assert.match(hinweis, /Ihr Angebot aus dem Preisrechner: UPS · Standard Samstagszustellung\./);
  assert.ok(!/€/.test(hinweis), "der Hinweis nennt einen Preisrechner-Preis");
  // Nichts erfunden: Straße, Kontakt und Sendungsangaben sind leer und werden angefordert.
  for (const id of ["ns-s-street", "ns-s-email", "ns-s-phone", "ns-r-street", "ns-r-firstName", "ns-r-email",
                    "ns-declaredContent", "ns-declaredGoodsValue"]) {
    assert.equal(await wert(page, id), "", `${id} wurde erfunden`);
  }
  assert.equal(await page.locator("#ns-r-street").getAttribute("aria-invalid"), "true", "die fehlende Straße wird nicht angefordert");
  assert.notEqual(await page.locator("#ns-r-zip").getAttribute("aria-invalid"), "true", "die übernommene PLZ gilt als fehlerhaft");
  const cta = page.locator(".offers-calc-cta button").first();
  assert.equal(await cta.isDisabled(), true);
  assert.match(norm(await page.locator(".offers-calc-cta .dft-save-status").first().textContent()), /Angaben|prüfen Sie/,
    "der gesperrte CTA erklärt nicht, was fehlt");
  assert.equal(p.calc.length, 1, "„Neue Sendung“ hat ohne vollständige Angaben gerechnet");
  assert.equal(await page.locator(".offer-card").count(), 0, "ein Preisrechner-Angebot steht in „Neue Sendung“");

  // Browser-Zurück: der Preisrechner steht wie verlassen da; Vorwärts: die Übergabe ist noch da.
  await page.goBack();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(await karteVon(page, kennung("csa", "3588")).evaluate((el) => el.classList.contains("offer-card--selected")), true);
  assert.equal(p.calc.length, 1, "das Zurück hat neu gerechnet");
  await page.goForward();
  await page.waitForSelector(".ns-calculator-intent", { timeout: 20000 });
  assert.equal(await wert(page, "ns-r-zip"), "10115");

  // Ergänzen und NEU berechnen: dieselbe Identität, neuer Serverpreis, ausgewählt — nicht gebucht.
  await ergaenzeFehlendes(page);
  await cta.click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(p.calc.length, 2);
  const neu = p.calc[1];
  assert.equal(neu.shippingDate, "2026-10-09");
  assert.deepEqual([neu.sender.postalCode, neu.sender.city, neu.recipient.postalCode, neu.recipient.city],
    ["97421", "Schweinfurt", "10115", "Berlin"]);
  assert.deepEqual([neu.packageCount, neu.weight, neu.length, neu.width, neu.height], [1, 2, 30, 20, 15]);
  const markiert = karteVon(page, kennung("csb", "3588"));
  await page.waitForFunction((sel) => document.querySelector(sel)?.classList.contains("offer-card--selected"),
    `.offer-card:has(button[aria-controls="offer-details-${kennung("csb", "3588")}"])`, { timeout: 10000 });
  assert.equal(await page.locator(".offer-card--selected").count(), 1);
  assert.match(norm(await markiert.locator(".offer-price").textContent()), /15,10/, "nicht der neue Serverpreis");
  assert.match(norm(await page.locator(".ns-calculator-intent").textContent()), /ist ausgewählt: UPS · Standard Samstagszustellung/);
  // Keine Buchung, kein Buchungsschritt.
  assert.ok(!p.pfade.some((x) => /\/book\b|\/booking/.test(x)), `gebucht: ${p.pfade.filter((x) => /book/.test(x))}`);
  assert.ok(!page.url().includes("/booking"));
  assert.deepEqual(fehler, []);
  await page.close();
});

test("U — Angebot nach der Neuberechnung nicht mehr da: nichts markiert, ehrlicher Hinweis", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { neueListe: () => angebote("b", { mit3588: false }) });
  await rechnerProduktionsfall(page);
  await zuNeueSendung(page);
  await ergaenzeFehlendes(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  assert.equal(p.calc.length, 2);
  await kurz(300);
  assert.equal(await page.locator(".offer-card--selected").count(), 0, "ein ähnliches Angebot wurde gewählt");
  assert.match(norm(await page.locator(".ns-calculator-intent").textContent()),
    /Das im Preisrechner gewählte Angebot \(UPS · Standard Samstagszustellung\) lässt sich nach der neuen Berechnung nicht eindeutig zuordnen/);
  assert.deepEqual(fehler, []);
  await page.close();
});

/* ── Bug 2: Shopabgabe heißt Abgabetermin ─────────────────────────────────────── */

async function terminAbschnitt(page, offerId) {
  const karte = karteVon(page, offerId);
  await karte.locator("button.offer-details-link").click();
  const panel = page.locator(`#offer-details-${offerId}`);
  await panel.waitFor({ state: "visible", timeout: 10000 });
  return { karte, panel };
}

test("S — Shopabgabe: „Shopabgabe“, „Abgabestelle“, „Abgabetermin“ — nie „Abholtermin“; Abholung unverändert", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page, { neueListe: () => angebote("b") });
  await rechnerProduktionsfall(page);
  for (const [id, stelle] of [["2036", "DPD Paketshop"], ["3072", "DHL Express Paketshop"]]) {
    const { karte, panel } = await terminAbschnitt(page, kennung("csa", id));
    const text = norm(await panel.textContent());
    assert.match(norm(await karte.locator(".offer-tl-node--start .offer-tl-title").textContent()), /^Shopabgabe$/);
    assert.ok(text.includes("Termin & Abgabe"), `${id}: Abschnittstitel fehlt`);
    assert.ok(text.includes(`Abgabestelle${stelle}`), `${id}: Abgabestelle fehlt: ${text}`);
    assert.match(text, /Abgabetermin09\.10\.2026/);
    assert.ok(!/Abholtermin|Termin & Abholung/.test(text), `${id}: Abholung behauptet: ${text}`);
  }
  // Eine Abholung bleibt, wie sie war.
  const { panel } = await terminAbschnitt(page, kennung("csa", "3264"));
  const abholung = norm(await panel.textContent());
  assert.ok(abholung.includes("Termin & Abholung") && /Abholtermin09\.10\.2026/.test(abholung), abholung);
  assert.ok(!/Abgabetermin/.test(abholung));
  assert.deepEqual(fehler, []);
  await page.close();
});
