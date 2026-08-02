// End-to-End-Regression: „Entwurf fortsetzen → EIN Klick → Angebote".
//
// Deckt den Fehler ab, den reine Utility-Tests nicht erreichen: das tatsächliche
// Nutzerverhalten im echten Anwendungspfad (Entwürfe → Fortsetzen → CTA-Klick),
// inklusive der real gesendeten Payload und der Anzahl der Preisrequests.
//
// Der Test startet den Vite-Dev-Server selbst und mockt JEDEN API-Aufruf im
// Browser (Playwright route interception). Es gibt keine echte Preisabfrage,
// keine Buchung und keinen Zugriff auf Produktionsdaten.
//
// Run: npm run test:e2e
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// Browserauflösung, ohne einen Pfad fest zu verdrahten:
//   1. PLAYWRIGHT_CHROMIUM_EXECUTABLE — explizite Vorgabe hat immer Vorrang.
//   2. Ein fertiger Build unter PLAYWRIGHT_BROWSERS_PATH/chromium. Container-
//      Images liefern Chromium oft vorinstalliert aus, dessen Build-Nummer nicht
//      zur installierten playwright-Version passt; die Standardauflösung würde
//      dann trotz vorhandenem Browser fehlschlagen.
//   3. Sonst Playwrights Standardauflösung (npx playwright install).
function chromiumExecutablePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root) {
    const candidate = path.join(root, "chromium");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const PORT = 5219;
const BASE = `http://127.0.0.1:${PORT}`;

// Vollständiger Entwurf MIT gespeichertem, ergebnisabhängigem Carrier-Filter.
// "ups" ist für die Route dieses Tests bewusst NICHT verfügbar — genau die
// Konstellation, in der die alte Fassung beim ersten Klick 0 Angebote lieferte.
const DRAFT_FORM_DATA = {
  sender: {
    company: "Muster GmbH", fullName: "Max Mustermann", streetAndNumber: "Hauptstrasse 1",
    addressAddition: "Haus 2", postalCode: "10115", city: "Berlin", country: "DE",
    phone: "+4930123456", email: "max@example.com",
  },
  recipient: {
    company: "Empfang AG", fullName: "Erika Empfaenger", streetAndNumber: "Bahnhofstrasse 9",
    addressAddition: "", postalCode: "80331", city: "Muenchen", country: "DE",
    phone: "+4989987654", email: "erika@example.com",
  },
  packages: { packageCount: 2, weight: 5.5, length: 40, width: 30, height: 20 },
  shippingOptions: {
    shippingDate: "2030-06-01", serviceFilter: "pickup", shippingModeFilter: "express",
    publicCarrierIds: ["ups"],
  },
};

// Route bietet DHL und TNT — kein UPS.
const TARIFFS = [
  { id: 1, shipper_tariff_id: 3307, publicCarrierId: "dhl", publicCarrierName: "DHL Express",
    publicServiceName: "Expressversand", serviceType: "pickup", netPrice: 18.65, vatAmount: 3.54,
    finalPrice: 22.19, currency: "EUR", transitDaysMin: 1, transitDaysMax: 1,
    trackingAvailable: true, printerRequired: false },
  { id: 2, shipper_tariff_id: 4001, publicCarrierId: "tnt", publicCarrierName: "TNT",
    publicServiceName: "Expressversand", serviceType: "pickup", netPrice: 24.10, vatAmount: 4.58,
    finalPrice: 28.68, currency: "EUR", transitDaysMin: 1, transitDaysMax: 2,
    trackingAvailable: true, printerRequired: false },
];

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", street: "Hauptstrasse 1", zip: "10115",
  city: "Berlin", country: "DE", phone: "+4930123456",
};

// Dev-Server und Browser werden EINMAL fuer die ganze Datei gestartet — pro Test
// zu starten wuerde denselben Port erneut belegen und den Lauf blockieren.
let server = null;
let browser = null;

before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore", detached: false,
  });
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) break;
    } catch { /* Server startet noch */ }
    if (Date.now() > deadline) throw new Error("Vite-Dev-Server ist nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

after(async () => {
  if (browser) await browser.close();
  if (server && !server.killed) server.kill("SIGKILL");
});

// Öffnet eine Seite mit vollständig gemockter API. `calls` sammelt jede
// Preisberechnungs-Payload; `latency` erlaubt das Testen paralleler Klicks.
async function openApp({ latency = 0, carrierAware = true } = {}) {
  const calls = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = req.url();
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("/kundenbereich")) return json({ user: USER });
    if (url.includes("/api/kunde/form-drafts/")) {
      return json({ draft: { id: 77, revision: 3, schemaVersion: 1, formData: DRAFT_FORM_DATA, updatedAt: "2030-01-01T10:00:00Z" } });
    }
    if (url.includes("/api/kunde/form-drafts")) {
      return json({ drafts: [{ id: 77, revision: 3, schemaVersion: 1, updatedAt: "2030-01-01T10:00:00Z", formData: DRAFT_FORM_DATA }], nextCursor: null });
    }
    if (url.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (url.includes("/api/jumingo/calculate-price")) {
      const body = JSON.parse(req.postData() || "{}");
      calls.push(body);
      if (latency) await new Promise((r) => setTimeout(r, latency));
      // Backend-treu: publicCarriers stammt aus der Menge VOR dem Carrier-Filter;
      // tariffs werden anschließend auf publicCarrierIds eingeschränkt.
      const ids = carrierAware && Array.isArray(body.publicCarrierIds) ? body.publicCarrierIds : [];
      const tariffs = ids.length > 0 ? TARIFFS.filter((t) => ids.includes(t.publicCarrierId)) : TARIFFS;
      const publicCarriers = TARIFFS.map((t) => ({ id: t.publicCarrierId, name: t.publicCarrierName }));
      return json({ shipmentId: 999, tariffs, availableShippingModes: ["express"], publicCarriers, formDraftTransition: { status: "consumed" } });
    }
    if (url.includes("/kunde/shipments")) return json({ shipments: [] });
    if (url.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    return json({});
  });

  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-test-token"));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  return { page, calls };
}

// Regulärer Fortsetzen-Pfad: Sidebar → Entwürfe → Fortsetzen.
async function resumeDraft(page) {
  await page.getByRole("button", { name: "Entwürfe" }).first().click();
  await page.waitForSelector("text=Fortsetzen", { timeout: 20_000 });
  await page.getByRole("button", { name: /Fortsetzen/ }).first().click();
  await page.waitForSelector("button:has-text('Angebote vergleichen')", { timeout: 20_000 });
}

const ctaOf = (page) => page.locator(".offers-calc-cta button.dft-cta-primary").first();
const formValues = (page) => page.evaluate(() =>
  [...document.querySelectorAll("input.field-input")].map((i) => i.value));

test("Entwurf fortsetzen: EIN Klick lädt Angebote, ohne veralteten Carrier-Filter", async () => {
  const { page, calls } = await openApp();
  await resumeDraft(page);

  // Alle echten Sendungsdaten sind wiederhergestellt.
  const werte = await formValues(page);
  for (const erwartet of ["Muster GmbH", "Max Mustermann", "10115", "Berlin",
                          "Empfang AG", "Erika Empfaenger", "80331", "Muenchen",
                          "2", "5.5", "40", "30", "20"]) {
    assert.ok(werte.includes(erwartet), `Entwurfswert fehlt im Formular: ${erwartet}`);
  }

  // GENAU EIN Klick.
  await ctaOf(page).click();
  await page.waitForSelector(".offer-card", { timeout: 20_000 });

  assert.equal(calls.length, 1, "es muss genau eine Preisberechnung ausgelöst werden");
  const payload = calls[0];

  // Kein ungeprüfter alter Ergebnisfilter.
  assert.deepEqual(payload.publicCarrierIds, [], "erste Payload darf keinen veralteten Carrier-Filter tragen");

  // Alle echten Sendungs-/Berechnungsdaten sind in der Payload.
  assert.equal(payload.packageCount, 2);
  assert.equal(payload.weight, 5.5);
  assert.equal(payload.length, 40);
  assert.equal(payload.width, 30);
  assert.equal(payload.height, 20);
  assert.equal(payload.shippingDate, "2030-06-01");
  assert.equal(payload.serviceFilter, "pickup");
  assert.equal(payload.shippingModeFilter, "express");
  assert.equal(payload.sender.postalCode, "10115");
  assert.equal(payload.sender.city, "Berlin");
  assert.equal(payload.sender.country, "DE");
  assert.equal(payload.recipient.postalCode, "80331");
  assert.equal(payload.recipient.city, "Muenchen");
  assert.equal(payload.recipient.country, "DE");
  assert.equal(payload.recipient.fullName, "Erika Empfaenger");
  assert.equal(payload.recipient.phone, "+4989987654");
  assert.equal(payload.recipient.email, "erika@example.com");
  // Die Entwurfsherkunft wird weiterhin genau einmal mitgesendet.
  assert.equal(payload.sourceFormDraftId, 77);
  assert.equal(payload.sourceFormDraftRevision, 3);

  // Angebote sind nach genau diesem ersten Klick sichtbar.
  assert.equal(await page.locator(".offer-card").count(), 2, "Angebote müssen nach dem ersten Klick erscheinen");

  // Kein automatischer Folge-Request.
  await page.waitForTimeout(1500);
  assert.equal(calls.length, 1, "es darf kein automatischer zweiter Request entstehen");
});

test("Entwurf fortsetzen: nach der Antwort ist der aktuelle Carrier-Filter wieder nutzbar", async () => {
  const { page, calls } = await openApp();
  await resumeDraft(page);
  await ctaOf(page).click();
  await page.waitForSelector(".offer-card", { timeout: 20_000 });

  // Die Auswahlliste stammt jetzt aus der echten Antwort.
  await page.locator("button.service-filter-trigger").filter({ hasText: "Versanddienst" }).first().click();
  const optionen = await page.locator(".carrier-dropdown .service-filter-option-label").allTextContents();
  assert.deepEqual(optionen, ["Alle Dienstleister", "DHL Express", "TNT"]);

  // Bewusste Auswahl des Nutzers wirkt bei der nächsten Berechnung.
  await page.locator(".carrier-dropdown .service-filter-option").filter({ hasText: "DHL Express" }).first().click();
  await page.keyboard.press("Escape");
  await ctaOf(page).click();
  await page.waitForSelector(".offer-card", { timeout: 20_000 });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].publicCarrierIds, ["dhl"], "bewusst gesetzter Filter muss gesendet werden");
  assert.equal(await page.locator(".offer-card").count(), 1);
});

test("Entwurf fortsetzen: schneller Doppelklick erzeugt nur einen Request", async () => {
  const { page, calls } = await openApp({ latency: 700 });
  await resumeDraft(page);

  // Drei Klicks im SELBEN Tick — ohne Render dazwischen. Ein Guard auf dem
  // loading-State griffe hier nicht, weil alle Closures denselben Wert lesen.
  await page.evaluate(() => {
    const btn = document.querySelector(".offers-calc-cta button.dft-cta-primary");
    btn.click(); btn.click(); btn.click();
  });
  await page.waitForSelector(".offer-card", { timeout: 20_000 });
  await page.waitForTimeout(1200);

  assert.equal(calls.length, 1, "parallele Klicks dürfen nur einen Request erzeugen");
  assert.equal(await page.locator(".offer-card").count(), 2);
});

test("Neue Sendung: Ablauf unverändert, bewusste Carrier-Auswahl bleibt erhalten", async () => {
  const { page, calls } = await openApp();
  await page.getByRole("button", { name: "Neue Sendung" }).first().click();
  await page.waitForSelector("button:has-text('Angebote vergleichen')", { timeout: 20_000 });

  // Vor der ersten Berechnung gibt es fachlich noch keine Carrier-Auswahl:
  // die Auswahlliste entsteht erst aus der Antwort. Das ist der bestehende,
  // bewusste Ablauf — hier dokumentiert und geprüft.
  await page.locator("button.service-filter-trigger").filter({ hasText: "Versanddienst" }).first().click();
  assert.equal(await page.locator(".carrier-empty-hint").count(), 1,
    "vor der ersten Berechnung darf es keine wählbaren Carrier geben");
  await page.keyboard.press("Escape");

  const cta = ctaOf(page);
  assert.equal(await cta.isDisabled(), true, "leeres Formular muss den CTA weiterhin sperren");

  const fill = async (ph, v) => await page.getByPlaceholder(ph, { exact: true }).first().fill(String(v));
  for (const [ph, v] of [["Firma AG", "Empfang AG"], ["Erika Muster", "Erika Empfaenger"], ["Beispielweg 5", "Bahnhofstrasse 9"]]) await fill(ph, v);
  const empfaenger = page.locator(".booking-addr-grid > div").nth(1).locator("input.field-input");
  await empfaenger.nth(4).fill("80331");
  await empfaenger.nth(5).fill("Muenchen");
  for (const [ph, v] of [["1", "2"], ["5", "5.5"], ["30", "40"], ["20", "30"], ["15", "20"]]) await fill(ph, v);

  assert.equal(await cta.isDisabled(), false);
  await cta.click();
  await page.waitForSelector(".offer-card", { timeout: 20_000 });

  assert.equal(calls.length, 1, "neue Sendung: genau ein Request");
  assert.deepEqual(calls[0].publicCarrierIds, []);
  assert.equal(await page.locator(".offer-card").count(), 2);

  // Bewusste Auswahl nach der Berechnung bleibt erhalten und wirkt.
  await page.locator("button.service-filter-trigger").filter({ hasText: "Versanddienst" }).first().click();
  await page.locator(".carrier-dropdown .service-filter-option").filter({ hasText: "TNT" }).first().click();
  await page.keyboard.press("Escape");
  await ctaOf(page).click();
  await page.waitForSelector(".offer-card", { timeout: 20_000 });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].publicCarrierIds, ["tnt"]);
});

test("Unvollständiger Entwurf: keine Anfrage, Feld markiert, Hinweis sichtbar", async () => {
  const luecke = JSON.parse(JSON.stringify(DRAFT_FORM_DATA));
  luecke.recipient.city = "";
  const { page, calls } = await openApp();
  await page.route("**/api/kunde/form-drafts**", async (route) => {
    const url = route.request().url();
    const body = url.includes("/form-drafts/")
      ? { draft: { id: 77, revision: 3, schemaVersion: 1, formData: luecke, updatedAt: "2030-01-01T10:00:00Z" } }
      : { drafts: [{ id: 77, revision: 3, schemaVersion: 1, updatedAt: "2030-01-01T10:00:00Z", formData: luecke }], nextCursor: null };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await resumeDraft(page);

  assert.equal(await ctaOf(page).isDisabled(), true, "unvollständiger Entwurf darf nicht absendbar sein");
  assert.equal(await page.locator(".field-error").count(), 1, "fehlendes Feld muss sofort markiert sein");
  const hinweis = await page.locator(".dft-save-status").first().textContent();
  assert.match(hinweis.trim(), /Empfänger – Stadt/, "Hinweis muss das fehlende Feld benennen");
  assert.equal(calls.length, 0, "ungültige Daten dürfen keine Anfrage auslösen");

  // Nach der Korrektur reicht EIN Klick.
  await page.locator(".booking-addr-grid > div").nth(1).locator("input.field-input").nth(5).fill("Muenchen");
  assert.equal(await ctaOf(page).isDisabled(), false);
  await ctaOf(page).click();
  await page.waitForSelector(".offer-card", { timeout: 20_000 });
  assert.equal(calls.length, 1);
  assert.equal(await page.locator(".offer-card").count(), 2);
});
