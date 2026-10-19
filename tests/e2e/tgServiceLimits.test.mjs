// E2E: Auftrag 2 / P4 (2026-10-17) — belegte Transglobal-Grenzen im Detailbereich der Angebotskarte.
// Echter Dev-Server, echter Browser, gemocktes Backend mit den Angebotsformen des Servers (Codes und Zahlen).
//
//   A  Profilkarte (UPS 22): „Größe & Gewicht“ mit Packstücken, Gewicht, längster Seite und Gurtmaß samt Formel
//   B  Karte ohne Profil (DPD PaketShop 124): „Einschränkungen“ mit den Grenzsätzen der Paketshop-Abgabe und den
//      Verpackungsregeln
//   C  Karte ohne belegte Maße (DHL 84): Paketgrenze, Ladehilfe und Palettenpflicht — keine erfundene Gewichts- oder Maßzeile
//   D  390 px: alles innerhalb der Karte, kein horizontaler Überlauf
//   E  GLS Pick&Ship 110: längste Seite, zweitlängste Seite und Gurtmaß (Carrier-Abschluss 2026-10-18)
//
// Kein echtes Backend, keine Bestellung, kein Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_PAKET } from "./helpers/newShipmentForm.mjs";

const PORT = 5283, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const tagIn = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ABHOLTAG = tagIn(7);
const USER = { id: 1, email: "kunde@example.com", company_name: "Testfirma", name: "Test Kunde", role: "customer",
               status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030" };

const BASIS = {
  serviceType: "pickup", collectionDate: ABHOLTAG, collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null, transitDaysMin: 1, transitDaysMax: 2,
  currency: "EUR", bookable: true, unavailableReason: null, priceCompleteness: "complete", requiredPriceInputs: [],
  labelFormats: ["PDF"], labelSizes: [], labelFormatOptions: [], insuranceAvailable: false, insuranceDetails: null,
  trackingAvailable: true, printerRequired: true, pickupToday: false, pickupTodayUntil: null,
  sameDaySurchargeNet: null, sameDaySurchargeGross: null, serviceDetails: null, packageRules: null,
};
const UPS22 = {
  ...BASIS, offerId: "tg-grenzen-ups22-000000000000000022", publicCarrierId: "ups", publicServiceName: "Standardversand",
  netPrice: 12.74, vatAmount: 2.42, finalPrice: 15.16, chargeableWeight: 2,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }, { operant: "weight", operator: "<=", value: 70 },
                 { operant: "first_length", operator: "<=", value: 270 }, { operant: "length_and_girth", operator: "<=", value: 400 }],
  serviceDetails: { summaryKey: "economy_standard", volumetricDivisor: 5000, notAccepted: ["pallets", "suitcases"],
                    basicCoverMaxGoodsValue: null, maxCoverValue: null },
};
const DPD124 = {
  ...BASIS, offerId: "tg-grenzen-dpd124-00000000000000124", publicCarrierId: "dpd", publicServiceName: "PaketShop",
  serviceType: "dropoff", collectionDate: null, collectionReadyFrom: null,
  netPrice: 6.08, vatAmount: 1.16, finalPrice: 7.24,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }, { operant: "weight", operator: "<=", value: 20 },
                 { operant: "first_length", operator: "<=", value: 100 }, { operant: "length_and_girth", operator: "<=", value: 250 }],
  packageRules: { notAccepted: ["pallets", "wooden_crates", "suitcases", "mailer_bags", "padded_envelopes"], handlingAidFromKg: null,
                  palletFromKg: null },
};
const DHL84 = {
  ...BASIS, offerId: "tg-grenzen-dhl84-000000000000000084", publicCarrierId: "dhl", publicServiceName: "Domestic Express",
  netPrice: 95.08, vatAmount: 18.07, finalPrice: 113.15,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 2 }],
  packageRules: { notAccepted: [], handlingAidFromKg: 30, palletFromKg: 70 },
};
const GLS110 = {
  ...BASIS, offerId: "tg-grenzen-gls110-00000000000000110", publicCarrierId: "gls", publicServiceName: "Pick&Ship",
  netPrice: 18.53, vatAmount: 3.52, finalPrice: 22.05, labelFormats: [], printerRequired: false,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }, { operant: "first_length", operator: "<=", value: 200 },
                 { operant: "second_length", operator: "<=", value: 80 }, { operant: "length_and_girth", operator: "<=", value: 300 }],
};

let server, browser;

async function seite(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const pfad = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/jumingo/calculate-price")) {
      return json({ ceShipmentId: 4997, tariffs: [UPS22, DPD124, DHL84, GLS110], availableShippingModes: ["standard", "express"],
        publicCarriers: [{ id: "ups", name: "UPS" }, { id: "dpd", name: "DPD" }, { id: "dhl", name: "DHL" }, { id: "gls", name: "GLS" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null });
    }
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], nextCursor: null, pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { paket: { ...STANDARD_PAKET, packageCount: "1" } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  return { page, fehler };
}

const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const karteVon = (page, t) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${t.offerId}"])`);
async function oeffne(page, t) {
  await karteVon(page, t).locator("button.offer-details-link").click();
  const panel = page.locator(`#offer-details-${t.offerId}`);
  await panel.locator(".offer-details-section").first().waitFor({ timeout: 10000 });
  return panel;
}
async function zeilen(bereich) {
  const rows = bereich.locator(".offer-detail-row");
  const out = [];
  for (let i = 0; i < await rows.count(); i++) {
    out.push([norm(await rows.nth(i).locator(".offer-detail-label").textContent()),
              norm(await rows.nth(i).locator(".offer-detail-value").textContent())]);
  }
  return out;
}
const einschraenkungen = async (panel) => (await panel.locator(".offer-limit-item").allTextContents()).map(norm);

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore", ...DEV_SERVER_SPAWN });
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
  if (server) stopDevServer(server, "SIGKILL");
});

test("A — Profilkarte: längste Seite und Gurtmaß in „Größe & Gewicht“, mit Formel; keine zweite Einschränkungsliste", async () => {
  const { page, fehler } = await seite();
  const panel = await oeffne(page, UPS22);
  const groesse = panel.locator('[data-profile-section="size"]');
  assert.deepEqual((await zeilen(groesse)).filter(([l]) => l !== "Abrechnungsgewicht"),
    [["Packstücke", "1 je Sendung"], ["Max. Gewicht", "70 kg"], ["Max. längste Seite", "270 cm"], ["Max. Gurtmaß", "400 cm"]]);
  assert.equal(norm(await groesse.locator('[data-profile-note="girth"]').textContent()), "Gurtmaß = längste Seite + 2 × die beiden anderen Seiten.");
  assert.equal(await panel.locator(".offer-limit-item").count(), 0, "das Profil wiederholt die Grenzen als Liste");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — PaketShop ohne Profil: Grenzsätze und Verpackungsregeln unter „Einschränkungen“", async () => {
  const { page, fehler } = await seite();
  const panel = await oeffne(page, DPD124);
  assert.deepEqual(await einschraenkungen(panel), [
    "Packstücke dürfen max. 20 kg wiegen.",
    "Die längste Seite eines Packstücks darf max. 100 cm lang sein.",
    "Das Gurtmaß eines Packstücks (längste Seite + 2 × die beiden anderen Seiten) darf max. 250 cm betragen.",
    "Mit diesem Versandtarif kann max. 1 Packstück pro Sendung verschickt werden.",
    "Nicht zugelassen: Paletten, Holzkisten, Koffer, Versandtaschen, Luftpolsterumschläge.",
  ]);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — DHL ohne belegte Maße: Paketgrenze, Ladehilfe und Palettenpflicht, keine erfundene Gewichts- oder Maßzeile", async () => {
  const { page, fehler } = await seite();
  const panel = await oeffne(page, DHL84);
  assert.deepEqual(await einschraenkungen(panel), [
    "Mit diesem Versandtarif können max. 2 Packstücke pro Sendung verschickt werden.",
    "Packstücke ab 30 kg müssen auf einer Ladehilfe stehen, etwa einer Palette oder einem rollbaren Untersatz.",
    "Packstücke ab 70 kg müssen auf einer Palette (Euro- oder Einwegpalette) eingeliefert werden.",
  ]);
  const text = norm(await panel.textContent());
  // Die 70 kg stehen nur in der Palettenpflicht — keine Gewichtsgrenze („dürfen max."), keine Maßzeile.
  assert.ok(!/\d+\s*cm|Gurtmaß|längste Seite|dürfen max\./.test(text), `erfundene Grenze: ${text}`);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — 390 px: Grenzen und Regeln innerhalb der Karte, kein horizontaler Überlauf", async () => {
  const { page, fehler } = await seite({ width: 390, height: 900 });
  for (const t of [UPS22, DPD124, GLS110]) {
    const panel = await oeffne(page, t);
    const karte = await karteVon(page, t).boundingBox();
    for (const el of await panel.locator(".offer-limit-item, .offer-detail-row, .offer-profile-note").all()) {
      const b = await el.boundingBox();
      if (!b) continue;
      assert.ok(b.x >= karte.x - 1 && b.x + b.width <= karte.x + karte.width + 1, `${t.publicServiceName}: Zeile ragt aus der Karte`);
    }
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — GLS Pick&Ship: längste Seite, zweitlängste Seite und Gurtmaß als eigene Sätze", async () => {
  const { page, fehler } = await seite();
  const panel = await oeffne(page, GLS110);
  assert.deepEqual(await einschraenkungen(panel), [
    "Die längste Seite eines Packstücks darf max. 200 cm lang sein.",
    "Die zweitlängste Seite eines Packstücks darf max. 80 cm lang sein.",
    "Das Gurtmaß eines Packstücks (längste Seite + 2 × die beiden anderen Seiten) darf max. 300 cm betragen.",
    "Mit diesem Versandtarif kann max. 1 Packstück pro Sendung verschickt werden.",
  ]);
  // Kein Gewicht: GLS 110 traegt keine Gewichtsgrenze, und es wird keine ergaenzt.
  assert.ok(!/kg/.test(norm(await panel.textContent())), "erfundene Gewichtsgrenze");
  assert.deepEqual(fehler, []);
  await page.close();
});
