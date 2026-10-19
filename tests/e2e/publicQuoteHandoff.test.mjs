// E2E: Übernahme aus dem öffentlichen Preisrechner auf der Hauptdomain (/preisrechner-uebernahme).
// Echter Dev-Server, echter Browser, gemocktes Backend. Keine Buchung, kein Anbieter.
//
//   H  1440 und 390 px: Token im Fragment → sofort aus der Adresse entfernt → Anmeldung mit Hinweisband →
//      Prüfung beim Server → „Neue Sendung“ mit Route, Paket, Datum und Absicht vorbelegt → nach dem
//      Ergänzen neu berechnet → dasselbe Produkt (productKey) markiert, Preisvergleich mit Status sichtbar;
//      localStorage bleibt ["ce_token"]; nichts gebucht.
//   P  Ausstehende Freischaltung: 403 ACCOUNT_PENDING_APPROVAL unverändert, die Übernahme wartet weiter.
//   X  Abgelaufenes (410) und manipuliertes Token (Form → ohne Serveranfrage; Server 400): Hinweis, keine Vorbelegung.
//   A  Adminkonto: Hinweis und die eigene Startseite — keine Prüfung beim Server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleAdresse, fuelleSendungsangaben, STANDARD_SENDUNGSANGABEN } from "./helpers/newShipmentForm.mjs";

const PORT = 5565, BASE = `http://127.0.0.1:${PORT}`;
// Montag, 19.10.2026 — der Versandtag der Übergabe (Mi., 21.10.) liegt in der Zukunft.
const UHR = "2026-10-19T10:00:00+02:00";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const KUNDE = {
  id: 7, email: "einkauf@muster.example", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "70173", city: "Stuttgart", customer_number: "CE-K-11000",
};
const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress", name: "Anna Admin",
  role: "admin", status: "approved", country: "DE" };
const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const PK = `pk1_${"U".repeat(22)}`;
const TOKEN = `h1.${"T".repeat(120)}`;
const PRUEFUNG = {
  input: { from_country: "DE", from_zip: "70173", from_city: "Stuttgart", to_country: "DE", to_zip: "10115",
    to_city: "Berlin", packageCount: 1, weight: 2, length: 30, width: 20, height: 15, serviceFilter: "all",
    shippingModeFilter: "all", shippingDate: "2026-10-21", publicCarrierIds: [] },
  selection: { productKey: PK, publicCarrierId: "ups", publicServiceName: "Standard", priceStatus: "from",
    netPrice: 10.5, vatAmount: 2, finalPrice: 12.5, currency: "EUR" },
  issuedAt: "2026-10-19T07:55:00.000Z", expiresAt: "2026-10-19T08:55:00.000Z",
};
const kennung = (z) => z.repeat(32);
const tarif = (id, productKey, name, netto, extra = {}) => ({
  id, shipper_tariff_id: id, offerId: kennung(String(id).slice(-1)), productKey,
  availableWithShipmentDetails: true, recipientRequirement: null,
  publicCarrierId: "ups", publicCarrierName: "UPS", publicServiceName: name, serviceType: "pickup", shippingMode: "standard",
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1-2 Tage", trackingAvailable: true, printerRequired: false,
  pickupDate: "2026-10-21", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00", deliveryDate: "2026-10-22",
  deliveryDateMin: "2026-10-22", deliveryDateMax: "2026-10-22", bookable: true, unavailableReason: null,
  requiredPriceInputs: [], netPrice: netto, vatAmount: Number((netto * 0.19).toFixed(2)),
  finalPrice: Number((netto * 1.19).toFixed(2)), currency: "EUR", ...extra,
});
const NEUE_LISTE = [tarif(3264, PK, "Standard", 11.2), tarif(3265, `pk1_${"V".repeat(22)}`, "Express Saver", 18.4)];

let server, browser;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

async function setup(page, { konto = KUNDE, eingeloggt = false, login, pruefung } = {}) {
  const p = { pruefungen: [], calc: [], pfade: [] };
  await page.clock.setFixedTime(new Date(UHR));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    p.pfade.push(`${req.method()} ${pfad}`);
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/login")) return login ? login(json) : json({ message: "Erfolgreich angemeldet", token: "e2e-token" });
    if (pfad.endsWith("/kundenbereich")) return json({ user: konto });
    if (pfad === "/api/price-quote/handoff/verify") {
      let body = {};
      try { body = JSON.parse(req.postData() || "{}"); } catch { /* leer */ }
      p.pruefungen.push({ body, auth: req.headers().authorization || null });
      return pruefung ? pruefung(json) : json(PRUEFUNG);
    }
    if (pfad.endsWith("/api/shipping/launch-scope")) return json({ countries: EU27, originCountries: ["DE"] });
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (pfad.includes("/api/jumingo/calculate-price")) {
      let body = {};
      try { body = JSON.parse(req.postData() || "{}"); } catch { /* leer */ }
      p.calc.push(body);
      return json({ ceShipmentId: 9001, tariffs: NEUE_LISTE, availableShippingModes: ["standard"],
        publicCarriers: [{ id: "ups", name: "UPS" }], customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE",
        exportDeclaration: null });
    }
    return json({});
  });
  if (eingeloggt) await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

async function neueSeite(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function anmelden(page) {
  await page.fill('input[type="email"]', "einkauf@muster.example");
  await page.fill('input[type="password"]', "geheim-123");
  await page.getByRole("button", { name: /^Anmelden$/ }).last().click();
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await kurz(250);
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
});

for (const [breite, hoehe] of [[1440, 1000], [390, 844]]) {
  test(`H ${breite}px — Übergabe → Anmeldung → „Neue Sendung“ vorbelegt → Neuberechnung → Markierung und Preisvergleich`, async () => {
    const { page, fehler } = await neueSeite({ width: breite, height: hoehe });
    const p = await setup(page);
    await page.goto(`${BASE}/preisrechner-uebernahme#t=${TOKEN}`, { waitUntil: "domcontentloaded" });
    // Ohne Anmeldung direkt in die Registrierung (Betreiberentscheidung 2026-10-16).
    await page.waitForURL(/\/register$/, { timeout: 30000 });
    assert.ok(!page.url().includes("#"), "das Token steht noch in der Adresse");
    await page.waitForSelector("#auth-handoff-pending", { timeout: 10000 });
    assert.match(norm(await page.locator(".auth-tab.active").innerText()), /Registrieren/);
    assert.match(norm(await page.locator("#auth-handoff-pending").innerText()),
      /Tarifauswahl aus dem Preisrechner wartet\. Registrieren Sie hier Ihr Geschäftskonto/);
    // Ein bestehendes Konto wechselt zur Anmeldung — die Übernahme wartet weiter.
    await page.locator(".auth-tab", { hasText: "Anmelden" }).click();
    assert.match(norm(await page.locator("#auth-handoff-pending").innerText()), /Nach der Anmeldung übernehmen wir sie/);
    assert.equal(p.pruefungen.length, 0, "vor der Anmeldung wird nichts geprüft");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Querscrollen auf der Anmeldung");

    await anmelden(page);
    await page.waitForURL(/\/dashboard\?page=new$/, { timeout: 30000 });
    assert.equal(p.pruefungen.length, 1);
    assert.deepEqual(p.pruefungen[0].body, { token: TOKEN });
    assert.equal(p.pruefungen[0].auth, "Bearer e2e-token");
    await page.waitForSelector(".ns-calculator-intent", { timeout: 20000 });
    const wert = (id) => page.locator(`#${id}`).inputValue();
    assert.deepEqual([await wert("ns-s-zip"), await wert("ns-s-city"), await wert("ns-r-zip"), await wert("ns-r-city")],
      ["70173", "Stuttgart", "10115", "Berlin"]);
    assert.deepEqual([await wert("ns-packageCount"), await wert("ns-weight"), await wert("ns-length"), await wert("ns-width"),
      await wert("ns-height")], ["1", "2", "30", "20", "15"]);
    assert.match(norm(await page.locator(".ns-calculator-intent").innerText()), /Ihr Angebot aus dem Preisrechner: UPS · Standard\./);
    assert.equal(p.calc.length, 0, "vor dem Ergänzen wird nicht gerechnet");

    await fuelleAdresse(page, "s", { company: "Muster GmbH", firstName: "Max", lastName: "Mustermann",
      email: "einkauf@muster.example", phone: "+49711123456", street: "Königstrasse 1" });
    await fuelleAdresse(page, "r", { company: "Empfang AG", firstName: "Erika", lastName: "Empfaenger",
      email: "erika@example.com", phone: "+49301234567", street: "Friedrichstrasse 9" });
    await fuelleSendungsangaben(page, STANDARD_SENDUNGSANGABEN);
    await page.locator(".offers-calc-cta button").first().click();
    await page.waitForSelector(".offer-card", { timeout: 20000 });
    assert.equal(p.calc.length, 1);
    assert.equal(p.calc[0].shippingDate, "2026-10-21");

    await page.waitForSelector("#ns-public-price-compare", { timeout: 10000 });
    assert.equal(await page.locator(".offer-card--selected").count(), 1, "genau dasselbe Produkt ist markiert");
    const vergleich = norm(await page.locator("#ns-public-price-compare").innerText());
    assert.match(vergleich, /Preis im Preisrechner: ab 10,50\s*€ netto · ab 12,50\s*€ brutto/);
    assert.match(vergleich, /Ihr Preis jetzt: 11,20\s*€ netto · 13,33\s*€ brutto/);
    assert.match(vergleich, /weicht vom Preis im Preisrechner ab/);
    assert.equal(await page.locator("#ns-public-price-compare").getAttribute("data-changed"), "true");
    assert.match(norm(await page.locator(".offer-card--selected .offer-price").innerText()), /11,20|13,33/, "nicht der neue Kundenpreis");

    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), ["ce_token"]);
    assert.ok(!p.pfade.some((x) => /\/book\b|\/booking/.test(x)), `gebucht: ${p.pfade.filter((x) => /book/.test(x))}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Querscrollen in „Neue Sendung“");
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

test("P — ausstehende Freischaltung: Meldung unverändert, die Übernahme wartet weiter", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { login: (json) => json({ error: "Konto noch nicht freigeschaltet", code: "ACCOUNT_PENDING_APPROVAL" }, 403) });
  await page.goto(`${BASE}/preisrechner-uebernahme#t=${TOKEN}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/register$/, { timeout: 30000 });
  await page.locator(".auth-tab", { hasText: "Anmelden" }).click();
  await anmelden(page);
  await page.waitForSelector(".auth-alert-error", { timeout: 10000 });
  assert.match(norm(await page.locator(".auth-alert-error").innerText()), /noch nicht freigeschaltet/);
  assert.equal(await page.locator("#auth-handoff-pending").count(), 1);
  assert.match(page.url(), /\/register$/);
  assert.equal(p.pruefungen.length, 0);
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("X — abgelaufen (410) und manipuliert (Form, Server 400): Hinweis ohne Vorbelegung", async () => {
  for (const [fragment, antwort, zustand, text, pruefungen] of [
    [`#t=${TOKEN}`, (json) => json({ error: "abgelaufen", code: "HANDOFF_EXPIRED" }, 410), "expired", /abgelaufen/, 1],
    [`#t=${TOKEN}`, (json) => json({ error: "ungültig", code: "HANDOFF_INVALID" }, 400), "invalid", /nicht übernommen werden/, 1],
    ["#t=h1.kaputt%3Cscript%3E", null, "invalid", /nicht übernommen werden/, 0],
  ]) {
    const { page, fehler } = await neueSeite();
    const p = await setup(page, { eingeloggt: true, pruefung: antwort || undefined });
    await page.goto(`${BASE}/preisrechner-uebernahme${fragment}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`#handoff-page[data-state="${zustand}"]`, { timeout: 30000 });
    assert.ok(!page.url().includes("#"), "das Fragment steht noch in der Adresse");
    assert.match(norm(await page.locator("#handoff-page").innerText()), text);
    assert.equal(p.pruefungen.length, pruefungen);
    assert.match(page.url(), /\/preisrechner-uebernahme$/, "keine Vorbelegung, keine Weiterleitung");
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), ["ce_token"]);
    assert.deepEqual(fehler, []);
    await page.close();
  }
});

test("A — Adminkonto: Hinweis und die eigene Startseite, keine Prüfung beim Server", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, { konto: ADMIN, eingeloggt: true });
  await page.goto(`${BASE}/preisrechner-uebernahme#t=${TOKEN}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('#handoff-page[data-state="role"]', { timeout: 30000 });
  assert.match(norm(await page.locator("#handoff-page").innerText()), /Nur für Kundenkonten/);
  assert.equal(await page.locator("#handoff-own-home").getAttribute("href"), "/admin");
  assert.equal(p.pruefungen.length, 0);
  assert.deepEqual(fehler, []);
  await page.close();
});
