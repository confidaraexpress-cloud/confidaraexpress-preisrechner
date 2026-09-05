// E2E: sieht eine nicht bestellbare Tarifkarte aus wie eine minderwertige?
//
// Gemessen wird am echten Dev-Server mit gemocktem Backend — KEINE Bestellung, KEIN
// Providercall. Der Vergleich ist der Kern dieser Datei: dieselbe Seite trägt ein
// vollständiges JUMiNGO-Angebot und zwei Transglobal-Angebote nebeneinander, und die
// Karten werden GEGENEINANDER gemessen, nicht gegen einen festen Wunschwert.
//
// Screenshots landen unter tests/e2e/screenshots/ — sie sind Beleg, nicht Prüfmittel:
// jede Zusicherung unten ist eine gemessene Zahl, kein Bildvergleich.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5272, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(process.cwd(), "tests", "e2e", "screenshots");

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

// Ein vollständiges JUMiNGO-Angebot: Kalenderdaten, Abholfenster, Tracking, Drucker.
const JUMINGO = {
  id: 1, shipper_tariff_id: 1, offerId: "d".repeat(32),
  publicCarrierId: "dhl", publicCarrierName: "DHL", publicServiceName: "DHL Paket",
  serviceType: "pickup", currency: "EUR",
  netPrice: 12.0, vatAmount: 2.28, finalPrice: 14.28,
  transitDaysMin: 1, transitDaysMax: 2, trackingAvailable: true, printerRequired: false,
  availableForDate: true, bookable: true, requiredPriceInputs: [],
  pickupDate: "2026-09-10T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-09-11T00:00:00Z",
};

// Zwei Transglobal-Angebote, wie sie heute wirklich ankommen: KEINE Kalenderdaten,
// kein Trackingflag, keine Druckerangabe, nicht bestellbar (Gate aus).
const TG_PICKUP = {
  offerId: "b".repeat(32), publicCarrierId: "ups", publicServiceName: "UPS Express Saver",
  serviceType: "pickup", currency: "EUR",
  netPrice: 18.5, vatAmount: 3.52, finalPrice: 22.02,
  transitDaysMin: 1, transitDaysMax: 1,
  bookable: false, unavailableReason: "quote_only",
  requiredPriceInputs: ["deliveryIsResidential", "collectionIsResidential"],
};
const TG_DROPOFF = {
  offerId: "a".repeat(32), publicCarrierId: "dpd", publicServiceName: "DPD PaketShop",
  serviceType: "dropoff", currency: "EUR",
  netPrice: 9.4, vatAmount: 1.79, finalPrice: 11.19,
  transitDaysMin: 1, transitDaysMax: 2,
  bookable: false, unavailableReason: "quote_only",
  requiredPriceInputs: ["deliveryIsResidential"],
};
// Nach oben offene Laufzeit — die Aussage steht im Providertext, keine Obergrenze.
const TG_OFFEN = {
  ...TG_DROPOFF, offerId: "c".repeat(32), publicCarrierId: "gls",
  publicServiceName: "GLS Pick&Ship", transitDaysMax: null, deliveryTime: "ab 1 Tag",
};

let server, browser;

async function setupRoutes(page) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    // Es gibt in dieser Suite keinen Buchungspfad — sie schaut nur auf Karten.
    if (p.endsWith("/api/jumingo/book")) return route.fulfill({ status: 500, body: "{}" });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      // EINE Liste fuer beide Einkaufsquellen — genau so liefert der Server sie
      // (routes/jumingo.js: `tariffs: [...publicTariffs, ...publicTransglobalOffers]`).
      // Das ist die gemeinsame Kartenarchitektur bereits im Vertrag: das Frontend
      // bekommt gar keine Gelegenheit, nach Provider zu trennen.
      shipmentId: "s1", tariffs: [JUMINGO, TG_PICKUP, TG_DROPOFF, TG_OFFEN],
      availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL" }, { id: "ups", name: "UPS" },
                       { id: "dpd", name: "DPD" }, { id: "gls", name: "GLS" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function zuDenAngeboten(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

/** Die gemessenen Eigenschaften EINER Karte — alles, woran „Wertigkeit" hängt. */
const karteMessen = (page, sel) => page.locator(sel).evaluate((el) => {
  const g = (n) => (n ? getComputedStyle(n) : null);
  const karte = g(el);
  const preis = g(el.querySelector(".offer-price"));
  const logo = g(el.querySelector(".offer-logo-tile img"));
  const r = el.getBoundingClientRect();
  return {
    opacity: karte.opacity,
    background: karte.backgroundColor,
    breite: Math.round(r.width), hoehe: Math.round(r.height),
    rechts: Math.round(r.right),
    preisGroesse: preis ? preis.fontSize : null,
    preisFarbe: preis ? preis.color : null,
    logoFilter: logo ? logo.filter : null,
    hatTimeline: !!el.querySelector(".offer-timeline"),
    hatHandover: !!el.querySelector(".offer-handover"),
    hatPreis: !!el.querySelector(".offer-price"),
    ctaGesperrt: el.querySelector(".offer-cta-btn")?.disabled === true,
    text: el.innerText,
  };
});

test.before(async () => {
  mkdirSync(SHOTS, { recursive: true });
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { detached: true, stdio: "ignore" });
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
  if (server) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

/* ══════════ 1 — GLEICHE WERTIGKEIT, GEMESSEN ══════════ */

test("1 — die TG-Karte ist nicht blasser, nicht grauer und nicht kleiner als die JUMiNGO-Karte", async () => {
  for (const breite of [1440, 834, 390]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 1400 } });
    await setupRoutes(page);
    await zuDenAngeboten(page);

    const j = await karteMessen(page, ".offer-card >> nth=0");
    const anzahl = await page.locator(".offer-card").count();
    assert.equal(anzahl, 4, `${breite}px: erwartet 4 Karten, gefunden ${anzahl}`);

    for (let i = 1; i < anzahl; i++) {
      const t = await karteMessen(page, `.offer-card >> nth=${i}`);
      assert.equal(t.opacity, j.opacity, `${breite}px Karte ${i}: Deckkraft ${t.opacity} statt ${j.opacity}`);
      assert.equal(t.background, j.background, `${breite}px Karte ${i}: andere Flaechenfarbe`);
      assert.equal(t.preisGroesse, j.preisGroesse, `${breite}px Karte ${i}: Preis ${t.preisGroesse} statt ${j.preisGroesse}`);
      assert.equal(t.preisFarbe, j.preisFarbe, `${breite}px Karte ${i}: Preis anders gefaerbt`);
      assert.ok(!t.logoFilter || t.logoFilter === "none",
        `${breite}px Karte ${i}: Carrierlogo gefiltert (${t.logoFilter})`);
      assert.equal(t.breite, j.breite, `${breite}px Karte ${i}: andere Breite`);
      // Gleiche Kartenhoehe. Ein sichtbar hoeherer Block neben gleichartigen Karten
      // liest sich als „hier stimmt etwas nicht" — auch wenn jede einzelne Zeile
      // korrekt ist. Toleranz 2px fuer Rundung.
      assert.ok(Math.abs(t.hoehe - j.hoehe) <= 2,
        `${breite}px Karte ${i}: ${t.hoehe}px hoch gegenueber ${j.hoehe}px (JUMiNGO)`);
    }
    await page.close();
  }
});

test("2 — jede Karte traegt Uebergabeart, Timeline und Preis", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  const n = await page.locator(".offer-card").count();
  for (let i = 0; i < n; i++) {
    const k = await karteMessen(page, `.offer-card >> nth=${i}`);
    assert.ok(k.hatHandover, `Karte ${i}: keine Uebergabeart`);
    assert.ok(k.hatTimeline, `Karte ${i}: keine Timeline`);
    assert.ok(k.hatPreis, `Karte ${i}: kein Preis`);
  }
  await page.close();
});

/* ══════════ 2 — EHRLICHER INHALT ══════════ */

test("3 — TG zeigt Laufzeit statt eines erfundenen Zustelldatums", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);

  const j = await karteMessen(page, ".offer-card >> nth=0");
  assert.match(j.text, /Lieferung/, "die JUMiNGO-Karte nennt kein Lieferdatum mehr");

  // Die drei TG-Karten: Laufzeit benannt als Laufzeit, in den drei Formen.
  const tgTexte = [];
  for (let i = 1; i < 4; i++) tgTexte.push((await karteMessen(page, `.offer-card >> nth=${i}`)).text);
  const alle = tgTexte.join("\n");
  assert.match(alle, /Voraussichtliche Laufzeit/, "die Laufzeit wird nicht als solche benannt");
  assert.match(alle, /1 Tag/);
  assert.match(alle, /1–2 Tage/);
  assert.match(alle, /ab 1 Tag/, "die nach oben offene Laufzeit fehlt");

  // Und KEIN Kalenderdatum auf einer Karte ohne Kalenderdaten.
  for (const t of tgTexte) {
    assert.ok(!/\d{2}\.\d{2}\.\d{4}/.test(t), `erfundenes Datum auf einer TG-Karte: ${t.slice(0, 120)}`);
    assert.ok(!/\b(Mo|Di|Mi|Do|Fr|Sa|So)\.,/.test(t), `erfundener Wochentag: ${t.slice(0, 120)}`);
  }
  await page.close();
});

test("4 — Abholung und Paketshopabgabe stehen prominent und unterscheidbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  const texte = [];
  for (let i = 0; i < 4; i++) texte.push((await karteMessen(page, `.offer-card >> nth=${i}`)).text);
  assert.match(texte.join("\n"), /Abholung an Ihrer Adresse/);
  assert.match(texte.join("\n"), /Paketshop/);
  await page.close();
});

test("5 — der gesperrte Knopf ist die EINZIGE Einschraenkung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  const j = await karteMessen(page, ".offer-card >> nth=0");
  assert.equal(j.ctaGesperrt, false, "das buchbare Angebot hat einen gesperrten Knopf");
  for (let i = 1; i < 4; i++) {
    const t = await karteMessen(page, `.offer-card >> nth=${i}`);
    assert.equal(t.ctaGesperrt, true, `Karte ${i}: der Knopf ist nicht gesperrt`);
    assert.match(t.text, /nicht direkt buchbar/i, `Karte ${i}: der Grund fehlt`);
  }
  await page.close();
});

/* ══════════ 3 — WHITE LABEL UND RESPONSIVE ══════════ */

test("6 — kein Providername und keine interne Referenz sichtbar", async () => {
  for (const breite of [1440, 834, 390]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 1400 } });
    await setupRoutes(page);
    await zuDenAngeboten(page);
    // Details ALLER Karten aufklappen — auch dort darf kein Providerbezug stehen.
    //
    // Aufgeklappt wird per DOM-Klick, nicht ueber Playwrights Actionability: das
    // Ausklappen der ersten Karte verschiebt die darunterliegenden, und der Test
    // wartet sonst auf eine Stabilitaet, die waehrend der Animation nicht eintritt.
    // Geprueft wird hier der TEXT — ob die Auslöser bedienbar sind, misst Test 5.
    await page.evaluate(() =>
      document.querySelectorAll(".offer-details-link").forEach((b) => b.click()));
    await page.waitForTimeout(600);
    const sichtbar = (await page.locator("body").innerText()).toLowerCase();
    for (const w of ["transglobal", "jumingo", "quoteid", "providerserviceid"]) {
      assert.ok(!sichtbar.includes(w), `${breite}px: "${w}" ist sichtbar`);
    }
    await page.close();
  }
});

test("7 — kein horizontaler Ueberlauf auf 1440, 834 und 390", async () => {
  for (const breite of [1440, 834, 390]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 1400 } });
    await setupRoutes(page);
    await zuDenAngeboten(page);
    const scrollt = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(scrollt, false, `${breite}px: die Seite scrollt horizontal`);
    for (let i = 0; i < 4; i++) {
      const k = await karteMessen(page, `.offer-card >> nth=${i}`);
      assert.ok(k.rechts <= breite + 1, `${breite}px Karte ${i}: ragt bis ${k.rechts} heraus`);
    }
    await page.close();
  }
});

/* ══════════ 4 — BELEGBILDER ══════════ */

test("8 — Screenshots aller drei Breiten ablegen", async () => {
  for (const [breite, name] of [[1440, "desktop"], [834, "tablet"], [390, "mobile"]]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 1400 } });
    await setupRoutes(page);
    await zuDenAngeboten(page);
    await page.waitForTimeout(400);
    const ziel = path.join(SHOTS, `offer-cards-${name}-${breite}.png`);
    await page.locator(".offers-list, .offers-results").first()
      .screenshot({ path: ziel }).catch(async () => { await page.screenshot({ path: ziel, fullPage: true }); });
    assert.ok(existsSync(ziel), `Screenshot fehlt: ${ziel}`);
    await page.close();
  }
});
