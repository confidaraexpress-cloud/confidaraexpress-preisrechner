// E2E: Übergabeart auf den Angebotskarten — echter Dev-Server.
//
// Die Karte beantwortet jetzt in einer Zeile über der Prozesslinie, wie die
// Sendung den Absender verlässt: „ABHOLUNG AN IHRER ADRESSE" oder „ABGABE IM
// PAKETSHOP". Vorher stand das nur implizit im Knotentitel („Abholung" /
// „Shopabgabe") und im Servicenamen — beides leicht zu überlesen und im
// Servicenamen sogar irreführend („Standardversand" bei einer Shopabgabe).
//
// Geprüft wird, was eine Quelltextprüfung nicht erreicht:
//   • Welcher Satz tatsächlich auf welcher Karte steht.
//   • Dass irreführende Carrier-/Servicenamen daran nichts ändern.
//   • Dass bei gemischten Listen keine Karte den Typ ihrer Nachbarin zeigt.
//   • Dass Preis, Hauptaktion und Datumsangaben unberührt bleiben.
//   • Dass die Zeile die Karte nur minimal höher macht.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5245, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const BASIS = {
  currency: "EUR", transitDaysMin: 1, transitDaysMax: 2, trackingAvailable: true,
  printerRequired: false, availableForDate: true, deliveryDate: "2026-08-10T00:00:00Z",
};

// Die NAMEN sind bewusst gegen die Wahrheit gesetzt: Der Abholtarif heißt
// „Shopabgabe Express", der Shopabgabetarif „Standardversand". Eine
// Namensheuristik würde hier sofort das falsche Ergebnis liefern.
const T_DROPOFF = {
  ...BASIS, id: 1, shipper_tariff_id: 1, publicCarrierId: "ups", publicCarrierName: "UPS",
  publicServiceName: "Standardversand", serviceType: "dropoff",
  netPrice: 6.9, vatAmount: 1.31, finalPrice: 8.21,
};
const T_PICKUP = {
  ...BASIS, id: 2, shipper_tariff_id: 2, publicCarrierId: "gls", publicCarrierName: "GLS",
  publicServiceName: "Shopabgabe Express", serviceType: "pickup",
  netPrice: 10.9, vatAmount: 2.07, finalPrice: 12.97,
  pickupDate: "2026-08-10T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
};
// Ohne klassifizierte Übergabeart wird keine behauptet.
const T_UNBEKANNT = {
  ...BASIS, id: 3, shipper_tariff_id: 3, publicCarrierId: "other", publicCarrierName: "Spedition X",
  publicServiceName: "Sonderfahrt", serviceType: "express",
  netPrice: 40.0, vatAmount: 7.6, finalPrice: 47.6,
};

const ABSENDER = { zip: "73207", city: "Plochingen", street: "Weiherstraße 25" };

const PICKUP_TEXT = "Abholung an Ihrer Adresse";
const DROPOFF_TEXT = "Abgabe im Paketshop";

let server, browser;

async function setupRoutes(page, { tariffs = [T_DROPOFF, T_PICKUP] } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", tariffs, availableShippingModes: ["standard"],
      publicCarriers: [...new Map(tariffs.map((t) => [t.publicCarrierId, { id: t.publicCarrierId, name: t.publicCarrierName }])).values()],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function zeigeAngebote(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  const fill = async (ph, v) => page.getByPlaceholder(ph, { exact: true }).first().fill(String(v));
  for (const [ph, v] of [
    ["Max Mustermann", "Max Mustermann"], ["Musterstraße 1", ABSENDER.street], ["Stuttgart", ABSENDER.city],
    ["Firma AG", "Empfang AG"], ["Erika Muster", "Erika Empfaenger"], ["Beispielweg 5", "Bahnhofstrasse 9"],
  ]) await fill(ph, v);
  await page.locator(".booking-addr-grid > div").nth(0).locator("input.field-input").nth(4).fill(ABSENDER.zip);
  const emp = page.locator(".booking-addr-grid > div").nth(1).locator("input.field-input");
  await emp.nth(4).fill("80331");
  await emp.nth(5).fill("Muenchen");
  for (const [ph, v] of [["1", "2"], ["5", "5.5"], ["30", "40"], ["20", "30"], ["15", "20"]]) await fill(ph, v);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

// Die Karte eines Carriers.
const karteVon = (page, carrier) =>
  page.locator(".offer-card", { has: page.locator(".offer-carrier-name", { hasText: carrier }) });

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  const deadline = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > deadline) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.kill("SIGKILL");
});

test("1 — das Shopabgabe-Angebot nennt die Abgabe im Paketshop", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zeigeAngebote(page);

  const ups = karteVon(page, "UPS");
  const zeile = ups.locator(".offer-handover");
  assert.equal(await zeile.count(), 1);
  // textContent = die Quellschreibung; innerText wäre bereits versalisiert.
  assert.equal((await zeile.textContent()).trim(), DROPOFF_TEXT);
  // Und der Prozessknoten passt dazu.
  assert.equal((await ups.locator(".offer-tl-node--start .offer-tl-title").textContent()).trim(), "Shopabgabe");
  await page.close();
});

test("2 — das Abholangebot nennt die Abholung an der eigenen Adresse", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zeigeAngebote(page);

  const gls = karteVon(page, "GLS");
  assert.equal((await gls.locator(".offer-handover").textContent()).trim(), PICKUP_TEXT);
  assert.equal((await gls.locator(".offer-tl-node--start .offer-tl-title").textContent()).trim(), "Abholung");
  await page.close();
});

test("3 — keine Karte zeigt den Text der anderen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zeigeAngebote(page);

  const ups = await karteVon(page, "UPS").innerText();
  const gls = await karteVon(page, "GLS").innerText();
  assert.ok(!/ABHOLUNG AN IHRER ADRESSE/i.test(ups), "Shopabgabe-Karte behauptet eine Abholung");
  assert.ok(!/ABGABE IM PAKETSHOP/i.test(gls), "Abholkarte behauptet eine Shopabgabe");
  await page.close();
});

test("4 — irreführende Carrier- und Servicenamen ändern nichts", async () => {
  // UPS heißt hier „Standardversand" und ist eine Shopabgabe;
  // GLS heißt „Shopabgabe Express" und ist eine Abholung.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zeigeAngebote(page);

  const ups = karteVon(page, "UPS");
  const gls = karteVon(page, "GLS");
  assert.equal((await ups.locator(".offer-service-type").textContent()).trim(), "Standardversand");
  assert.equal((await ups.locator(".offer-handover").textContent()).trim(), DROPOFF_TEXT);
  assert.equal((await gls.locator(".offer-service-type").textContent()).trim(), "Shopabgabe Express");
  assert.equal((await gls.locator(".offer-handover").textContent()).trim(), PICKUP_TEXT,
    "der Name „Shopabgabe Express“ darf die Abholung nicht überschreiben");
  await page.close();
});

test("5 — ohne klassifizierte Übergabeart wird keine behauptet", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { tariffs: [T_DROPOFF, T_UNBEKANNT] });
  await zeigeAngebote(page);

  assert.equal(await karteVon(page, "Spedition X").locator(".offer-handover").count(), 0,
    "lieber keine Aussage als eine geratene");
  // Die Karte selbst rendert normal weiter.
  assert.ok(await karteVon(page, "Spedition X").locator(".offer-price").first().isVisible());
  assert.equal(await page.locator(".offer-handover").count(), 1, "nur das klassifizierte Angebot trägt die Zeile");
  await page.close();
});

test("6 — gemischte Liste: jede Karte trägt ihren eigenen Typ", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  // Abwechselnd, damit eine Verwechslung zwischen benachbarten Karten auffiele.
  const tarife = [
    { ...T_DROPOFF, id: 1, shipper_tariff_id: 1, netPrice: 6.9, finalPrice: 8.21 },
    { ...T_PICKUP, id: 2, shipper_tariff_id: 2, publicCarrierId: "dpd", publicCarrierName: "DPD", netPrice: 7.9, finalPrice: 9.4 },
    { ...T_DROPOFF, id: 3, shipper_tariff_id: 3, publicCarrierId: "dpd", publicCarrierName: "DPD", publicServiceName: "Shopabgabe", netPrice: 8.9, finalPrice: 10.6 },
    { ...T_PICKUP, id: 4, shipper_tariff_id: 4, netPrice: 10.9, finalPrice: 12.97 },
  ];
  await setupRoutes(page, { tariffs: tarife });
  await zeigeAngebote(page);
  await page.waitForSelector(".offer-handover", { timeout: 10000 });

  // Karten in Anzeigereihenfolge (nach Preis sortiert) einsammeln und je Karte
  // Übergabetext gegen Knotentitel prüfen — sie müssen paarweise passen.
  const paare = await page.locator(".offer-card").evaluateAll((karten) => karten.map((k) => ({
    handover: k.querySelector(".offer-handover")?.textContent.trim() ?? null,
    knoten: k.querySelector(".offer-tl-node--start .offer-tl-title")?.textContent.trim() ?? null,
  })));
  assert.equal(paare.length, 4);
  for (const { handover, knoten } of paare) {
    if (handover === "Abgabe im Paketshop") assert.equal(knoten, "Shopabgabe", JSON.stringify(paare));
    else if (handover === "Abholung an Ihrer Adresse") assert.equal(knoten, "Abholung", JSON.stringify(paare));
    else assert.fail(`unerwarteter Übergabetext: ${handover}`);
  }
  // Beide Typen kommen wirklich vor — sonst prüfte der Test nichts.
  const typen = new Set(paare.map((p) => p.handover));
  assert.equal(typen.size, 2, `beide Typen müssen vorkommen: ${[...typen].join(" | ")}`);
  await page.close();
});

test("7 — der Paketshop-Einstieg bleibt und wird nicht dupliziert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zeigeAngebote(page);

  const ups = karteVon(page, "UPS");
  const gls = karteVon(page, "GLS");
  // Die Kennzeichnung ERSETZT den Einstieg nicht — beide erfüllen verschiedene
  // Zwecke (erklären vs. öffnen).
  assert.equal(await ups.locator(".ps-trigger").count(), 1, "der Einstieg fehlt bei der Shopabgabe");
  assert.equal(await ups.locator(".offer-handover").count(), 1);
  // Und die Abholkarte bekommt weiterhin keinen Einstieg.
  assert.equal(await gls.locator(".ps-trigger").count(), 0, "Abholung braucht keinen Paketshop-Einstieg");
  await page.close();
});

test("8 — Preis, Hauptaktion und Datumsangaben sind unberührt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zeigeAngebote(page);

  const ups = karteVon(page, "UPS");
  // toLocaleString setzt vor das Währungszeichen ein geschütztes Leerzeichen —
  // beim Vergleich normalisieren, sonst scheitert ein optisch identischer Text.
  const preis = (await ups.locator(".offer-price").first().textContent()).replace(/\u00a0/g, " ").trim();
  assert.equal(preis, "6,90 €");
  assert.ok(await ups.getByRole("button", { name: /Angebot auswählen/ }).first().isVisible());

  // Die Abholkarte trägt weiterhin ihr Datum und ihr Zeitfenster.
  const gls = karteVon(page, "GLS");
  const start = await gls.locator(".offer-tl-node--start").innerText();
  assert.match(start, /Mo\., 10\.08\./, "das Abholdatum fehlt");
  assert.match(start, /09:00–17:00 Uhr/, "das Abholzeitfenster fehlt");
  assert.match(await gls.locator(".offer-tl-node--end").innerText(), /Mo\., 10\.08\./);
  await page.close();
});

test("9 — die Zeile ist visuell sekundär und kostet kaum Höhe", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zeigeAngebote(page);

  const mass = await karteVon(page, "UPS").evaluate((karte) => {
    const h = karte.querySelector(".offer-handover");
    const rail = karte.querySelector(".offer-tl-rail");
    const preis = karte.querySelector(".offer-price");
    const carrier = karte.querySelector(".offer-carrier-name");
    const cs = getComputedStyle(h);
    const px = (v) => parseFloat(v);
    const hBox = h.getBoundingClientRect();
    return {
      hoehe: hBox.height,
      groesse: px(cs.fontSize), gewicht: cs.fontWeight,
      transform: cs.textTransform, spacing: cs.letterSpacing, align: cs.textAlign,
      preisGroesse: px(getComputedStyle(preis).fontSize),
      carrierGroesse: px(getComputedStyle(carrier).fontSize),
      abstandZurLinie: rail.getBoundingClientRect().top - hBox.bottom,
    };
  });

  // Typografie: Label-Stufe (12 px / 600), Satzschrift ohne künstliche Laufweite.
  assert.equal(mass.groesse, 12);
  assert.equal(mass.gewicht, "600");
  assert.equal(mass.transform, "none", "die Zeile darf nicht mehr versalisiert werden");
  assert.equal(mass.spacing, "normal", "die Laufweite muss auf normal zurückgesetzt sein");
  assert.equal(mass.align, "center");
  // Hierarchie: deutlich kleiner als Preis und Carriername — die dunklere
  // Navy-Farbe macht sie kräftiger, ohne sie größer zu machen.
  assert.ok(mass.groesse < mass.preisGroesse, "die Zeile konkurriert mit dem Preis");
  assert.ok(mass.groesse < mass.carrierGroesse, "die Zeile konkurriert mit dem Carriernamen");
  // Höhenbedarf klein halten, aber sichtbarer Abstand zur Prozesslinie.
  assert.ok(mass.hoehe <= 20, `die Zeile ist ${mass.hoehe}px hoch`);
  assert.ok(mass.abstandZurLinie >= 6 && mass.abstandZurLinie <= 8,
    `Abstand zur Prozesslinie außerhalb 6–8px: ${mass.abstandZurLinie}px`);
  await page.close();
});

test("10 — auf allen Zielbreiten lesbar, ohne Überlauf und ohne Abschneiden", async () => {
  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800], [1024, 768], [768, 1024], [430, 932], [390, 844], [360, 800]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await setupRoutes(page);
    await zeigeAngebote(page);
    await page.waitForSelector(".offer-handover", { timeout: 10000 });

    assert.ok(await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      `horizontaler Überlauf bei ${w}px`);

    // Beide Zeilen sind sichtbar und werden nicht abgeschnitten.
    const zeilen = await page.locator(".offer-handover").evaluateAll((els) => els.map((el) => ({
      text: el.textContent.trim(),
      sichtbar: el.getBoundingClientRect().height > 0,
      abgeschnitten: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
    })));
    assert.equal(zeilen.length, 2, `bei ${w}px fehlen Kennzeichnungen`);
    for (const z of zeilen) {
      assert.ok(z.sichtbar, `bei ${w}px unsichtbar: ${z.text}`);
      assert.ok(!z.abgeschnitten, `bei ${w}px abgeschnitten: ${z.text}`);
    }
    await page.close();
  }
});
