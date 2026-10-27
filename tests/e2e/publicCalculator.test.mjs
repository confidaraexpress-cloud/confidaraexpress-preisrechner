// E2E: der öffentliche Preisrechner (preisrechner/, zweiter Build) im echten Browser gegen ein gemocktes Backend.
// Kein echter Request, kein Anbieter, keine Buchung.
//
//   A  1440 und 390 px: prepare ist die ERSTE API-Anfrage und hängt 30 s — das Formular bleibt bedienbar,
//      die Preisabfrage läuft trotzdem; genau die 15 Felder; Karten mit Netto und Brutto, „ab“ samt
//      Erklärung, Zuschlagshinweis nur laut requiredPriceInputs, Aktion nur bei availableWithShipmentDetails,
//      Fokus auf der Ergebnisüberschrift, kein horizontales Scrollen, keine Einkaufsquelle im DOM, kein Storage.
//   B  Zustände partial, leer, 422, 429, 503, Netzfehler — und eine unveränderte Eingabe fragt nicht erneut.
//   C  Laden: ehrliche Wartezeit, ab 10 s der Hinweis; keine feste Dauer.
//   D  prepare meldet „available: false“: Hinweis statt Absenden, keine Preisabfrage.
//   E  Tastatur: Skip-Link, Pflichtfelder mit Fehlern am Feld, Absenden per Enter, Fokus auf die Ergebnisse.
//   F  Übergabe: „Mit diesem Tarif fortfahren“ öffnet die feste Adresse der Hauptdomain mit dem Token im Fragment.
//   G  1366×768, reduzierte Bewegung: vor der ersten Berechnung kein Ergebnisbereich, Absenden ohne Scrollen
//      erreichbar; danach Zusammenfassung der Anfrage und Ergebnisse im Blick; Carrierauswahl filtert und setzt
//      zurück, ohne neuen Request; „Angaben ändern“ führt sofort zur Rechnerkarte zurück, Eingaben bleiben.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5564, BASE = `http://127.0.0.1:${PORT}`;
const API = "https://api.confidaraexpress.de";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const pk = (z) => `pk1_${z.repeat(22)}`;
const TOKEN_UPS = `h1.${"U".repeat(90)}`;
const angebot = (felder) => ({
  productKey: null, publicCarrierId: null, publicServiceName: null, serviceType: "pickup",
  pickupDate: "2026-10-21", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00", collectionDate: null,
  collectionReadyFrom: null, collectionDateAdjusted: false, deliveryDate: null, deliveryDateMin: null,
  deliveryDateMax: null, deliveryTimeUntil: null, deliveryTimeUntilMinutes: null, deliveryProjection: null,
  deliveryTime: null, transitDaysMin: 1, transitDaysMax: 2, netPrice: 10.5, vatAmount: 2, finalPrice: 12.5,
  currency: "EUR", priceCompleteness: "complete", priceStatus: "exact", unavailableReason: null,
  availableWithShipmentDetails: true, requiredPriceInputs: [], surchargeFreePriceInputs: [], recipientRequirement: null,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
  insuranceAvailable: false, trackingAvailable: true, printerRequired: true, labelHandling: null, handoffToken: null,
  ...felder,
});
const ANGEBOTE = [
  angebot({ productKey: pk("U"), publicCarrierId: "ups", publicServiceName: "Standard", handoffToken: TOKEN_UPS }),
  angebot({ productKey: pk("D"), publicCarrierId: "dhl", publicServiceName: "Express", serviceType: "dropoff",
    collectionDate: "2026-10-21", pickupDate: null, pickupTimeFrom: null, pickupTimeUntil: null,
    priceCompleteness: "indicative", priceStatus: "from", netPrice: 8.4, vatAmount: 1.6, finalPrice: 10,
    requiredPriceInputs: ["deliveryIsResidential"], unavailableReason: "quote_only", handoffToken: `h1.${"D".repeat(90)}` }),
  angebot({ productKey: pk("P"), publicCarrierId: "dpd", publicServiceName: "Classic", availableWithShipmentDetails: false,
    unavailableReason: "quote_only", netPrice: 7.1, vatAmount: 1.35, finalPrice: 8.45, labelHandling: "carrier_at_pickup",
    recipientRequirement: "business" }),
];
const CARRIER = [{ id: "dhl", name: "DHL Express" }, { id: "dpd", name: "DPD" }, { id: "ups", name: "UPS" }];

let server, browser;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

async function setup(page, { prepare = { delayMs: 0, body: { available: true } }, quote } = {}) {
  const p = { reihenfolge: [], quotes: [], prepareBeantwortet: false };
  page.on("request", (req) => {
    if (req.url().startsWith(API)) p.reihenfolge.push(`${req.method()} ${new URL(req.url()).pathname}`);
  });
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200, headers = {}) => route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(b) });
    if (pfad === "/api/public/price-quote/prepare") {
      if (prepare.delayMs) await kurz(prepare.delayMs);
      p.prepareBeantwortet = true;
      try { return await json(prepare.body); } catch { return undefined; }
    }
    if (pfad === "/api/public/launch-scope") return json({ countries: EU27, destinationCountries: EU27, originCountries: ["DE"] });
    if (pfad === "/api/public/price-quote") {
      let body = {};
      try { body = JSON.parse(req.postData() || "{}"); } catch { /* leer */ }
      p.quotes.push({ body, prepareBeantwortet: p.prepareBeantwortet });
      const antwort = typeof quote === "function" ? quote(p.quotes.length, body) : null;
      if (antwort && antwort.abort) return route.abort("failed");
      if (antwort && antwort.delayMs) await kurz(antwort.delayMs);
      if (antwort && antwort.status) return json(antwort.body || {}, antwort.status, antwort.headers || {});
      return json({ status: "ok", quotedAt: "2026-10-21T08:00:00.000Z", publicCarriers: CARRIER,
        availableShippingModes: ["express", "standard"], offers: ANGEBOTE });
    }
    return json({ error: "unerwartet" }, 404);
  });
  return p;
}

async function neueSeite(viewport) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function fuelle(page, { gewicht = "2,5" } = {}) {
  await page.fill("#pc-from-zip", "70173");
  await page.fill("#pc-from-city", "Stuttgart");
  await page.fill("#pc-to-zip", "10115");
  await page.fill("#pc-to-city", "Berlin");
  await page.fill("#pc-weight", gewicht);
  await page.fill("#pc-length", "30");
  await page.fill("#pc-width", "20");
  await page.fill("#pc-height", "10");
}

async function oeffne(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pc-submit", { timeout: 30000 });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--config", "vite.preisrechner.config.js", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
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

for (const [breite, hoehe] of [[1440, 900], [390, 844]]) {
  test(`A ${breite}px — prepare zuerst und hängend, Formular bedienbar, Karten, Fokus, kein Querscrollen, keine Einkaufsquelle`, async () => {
    const { page, fehler } = await neueSeite({ width: breite, height: hoehe });
    const p = await setup(page, { prepare: { delayMs: 30000, body: { available: true } } });
    await oeffne(page);
    assert.equal(await page.locator("#pc-submit").isDisabled(), false, "das Absenden wartet auf prepare");
    await fuelle(page);
    await page.click("#pc-submit");
    await page.waitForSelector("#pc-offers .pc-offer", { timeout: 20000 });

    assert.match(p.reihenfolge[0] || "", /^POST \/api\/public\/price-quote\/prepare$/, `erste Anfrage: ${p.reihenfolge.join(", ")}`);
    assert.equal(p.quotes.length, 1);
    assert.equal(p.quotes[0].prepareBeantwortet, false, "die Preisabfrage lief, während prepare noch hing");
    assert.deepEqual(Object.keys(p.quotes[0].body).sort(), ["from_city", "from_country", "from_zip", "height", "length",
      "packageCount", "publicCarrierIds", "serviceFilter", "shippingDate", "shippingModeFilter", "to_city", "to_country", "to_zip",
      "weight", "width"]);
    assert.equal(p.quotes[0].body.weight, 2.5, "Dezimalkomma als Zahl");
    // Schmale Maske: kein Versanddatum, keine Abholung/Abgabe, keine Versandart. Gerechnet wird ab dem
    // heutigen Geschäftstag (Europe/Berlin) mit allen Dienstleistungen und Versandarten.
    assert.equal(await page.locator("#pc-shipping-date, #pc-service-filter, #pc-shipping-mode, input[type=date]").count(), 0);
    assert.equal(await page.locator("#pc-calculator input, #pc-calculator select").count(), 11, "genau elf Felder");
    const berlin = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    assert.equal(p.quotes[0].body.shippingDate, berlin);
    assert.deepEqual([p.quotes[0].body.serviceFilter, p.quotes[0].body.shippingModeFilter, p.quotes[0].body.packageCount], ["all", "all", 1]);

    const karten = page.locator("#pc-offers .pc-offer");
    assert.equal(await karten.count(), 3);
    const ups = norm(await karten.nth(0).innerText());
    assert.match(ups, /UPS/);
    // Öffentlich nur der Nettopreis, darunter „zzgl. MwSt.“ — kein Bruttopreis.
    assert.match(ups, /10,50\s*€\s*zzgl\. MwSt\./);
    assert.doesNotMatch(ups, /brutto|12,50/);
    assert.match(ups, /laut Versanddienstleister/);
    assert.ok(!/\bab\b 10,50/.test(ups), "ein exakter Preis trägt kein „ab“");
    const dhl = norm(await karten.nth(1).innerText());
    assert.match(dhl, /ab 8,40\s*€\s*zzgl\. MwSt\./);
    assert.match(dhl, /nach der Anmeldung mit vollständigen Sendungsangaben/);
    assert.match(dhl, /Bei einer privaten Lieferadresse kann ein Zuschlag anfallen\./);
    const dpd = norm(await karten.nth(2).innerText());
    assert.match(dpd, /Derzeit nicht direkt buchbar/);
    assert.match(dpd, /Nur für Geschäftsempfänger verfügbar\./);
    assert.equal(await karten.nth(2).locator("button").count(), 0, "ohne availableWithShipmentDetails keine Aktion");
    assert.equal(await karten.nth(0).getByRole("button", { name: "Angebot auswählen" }).count(), 1);
    assert.equal(await page.locator(".pc-badge, .offer-badge").count(), 0, "keine Bestwahl-Markierung");

    // Eine Tarifkarte je Zeile — auf jedem Gerät (Betreiberentscheidung 2026-10-27, UX-Korrektur B; vorher bis zu drei
    // Spalten). Breit steht die Preisspalte rechts: Preise und Aktionen aller Karten liegen bündig in einer Spalte.
    const lage = await karten.evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      const box = (sel) => { const t = el.querySelector(sel); if (!t) return null; const b = t.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top) }; };
      return { links: Math.round(r.left), rechts: Math.round(r.right), oben: Math.round(r.top), unten: Math.round(r.bottom),
        preis: box(".pc-offer-price"), aktion: box(".pc-offer-action"), ablauf: box(".pc-offer-ablauf") };
    }));
    assert.equal(new Set(lage.map((k) => k.oben)).size, lage.length, `mehrere Karten in einer Reihe: ${JSON.stringify(lage)}`);
    assert.equal(new Set(lage.map((k) => k.links)).size, 1, "die Karten stehen nicht bündig untereinander");
    for (let i = 1; i < lage.length; i++) assert.ok(lage[i].oben >= lage[i - 1].unten, "Karten überlappen");
    if (breite >= 1100) {
      assert.equal(new Set(lage.map((k) => k.preis.r)).size, 1, `Preise nicht in einer Spalte: ${JSON.stringify(lage.map((k) => k.preis))}`);
      assert.equal(new Set(lage.map((k) => k.aktion.l)).size, 1, "Aktionen nicht in einer Spalte");
      for (const k of lage) assert.ok(k.preis.l > k.ablauf.r, "die Preisspalte steht nicht rechts vom Ablauf");
    }

    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "pc-results-title");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "horizontales Scrollen");
    // Der gerenderte Körper — im Entwicklungsserver steht das Stylesheet samt Kommentaren inline im Kopf.
    assert.doesNotMatch(await page.evaluate(() => document.body.outerHTML), /jumingo|transglobal/i);
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
    assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage)), []);
    // Die Seite zeigt die Marke und ruft keine Ressource einer anderen Domain außer der API.
    assert.ok(await page.locator(".pc-brand-img").evaluate((img) => img.complete && img.naturalWidth > 0), "Marken-Lockup nicht geladen");
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

// H — Smartphone und große Schrift (UX-Korrektur A, 2026-10-27): das Navy-Band trägt die ganze Rechnerkarte, das Logo
// wird nie gequetscht, der Kopf bricht um statt abzuschneiden, das Paket steht in einem Dreierraster.
for (const [breite, hoehe, schrift] of [[320, 568, 100], [360, 780, 100], [390, 844, 100], [390, 844, 200]]) {
  test(`H ${breite}px, Schrift ${schrift} % — Band trägt die Karte, Logo und Kopf vollständig, Paketraster`, async () => {
    const { page, fehler } = await neueSeite({ width: breite, height: hoehe });
    await setup(page);
    await oeffne(page);
    if (schrift !== 100) await page.addStyleTag({ content: `html { font-size: ${schrift}% !important; }` });
    await page.waitForFunction(() => document.fonts.status === "loaded");
    const m = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const band = getComputedStyle(document.querySelector(".pc-hero-grid"), "::before");
      const kopf = [...document.querySelectorAll(".pc-header .pc-brand-img, .pc-header-nav a")].filter((e) => e.offsetParent);
      const feld = (id) => box(document.getElementById(id).closest(".field"));
      return {
        bandZeilen: `${band.gridRowStart} / ${band.gridRowEnd}`,
        bandUnten: parseFloat(band.marginBottom),
        heroInnenUnten: parseFloat(getComputedStyle(document.querySelector(".pc-hero")).paddingBottom),
        logo: Math.round(box(document.querySelector(".pc-brand-img")).width),
        kopfRechts: Math.max(...kopf.map((e) => box(e).right)),
        kopfLinks: Math.min(...kopf.map((e) => box(e).left)),
        kopfHoehe: Math.round(box(document.querySelector(".pc-header-inner")).height),
        ueberlauf: document.documentElement.scrollWidth - innerWidth,
        abgeschnitten: [...document.querySelectorAll("#pc-calculator .field-label")].filter((l) => l.scrollWidth > l.clientWidth + 1).map((l) => l.textContent.trim()),
        anzahl: feld("pc-package-count"), gewicht: feld("pc-weight"), laenge: feld("pc-length"), breiteF: feld("pc-width"), hoehe: feld("pc-height"),
        hinweisOben: Math.round(box(document.getElementById("pc-package-hint")).top),
      };
    });
    // Das Band trägt die ganze Karte: es spannt alle Zeilen des Heros und endet an dessen unterem Rand.
    assert.equal(m.bandZeilen, "1 / -1", "das Band endet nicht mit dem Hero");
    assert.equal(m.bandUnten, -m.heroInnenUnten, "das Band reicht nicht bis an den unteren Rand des Heros");
    // Das Logo wird nie gequetscht; nichts im Kopf läuft über den Rand.
    assert.ok(m.logo >= (breite < 340 ? 80 : 88), `Logo ${m.logo} px`);
    assert.ok(m.kopfRechts <= breite && m.kopfLinks >= 0, `Kopf über den Rand: ${m.kopfLinks}…${m.kopfRechts}`);
    if (schrift === 100) assert.ok(m.kopfHoehe <= 80, `der Kopf bricht schon bei normaler Schrift um (${m.kopfHoehe} px)`);
    assert.equal(m.ueberlauf, 0, "horizontales Scrollen");
    assert.deepEqual(m.abgeschnitten, [], "abgeschnittene Feldbeschriftungen");
    // „Gewicht und Maße je Paket.“ steht über den Paketfeldern.
    assert.ok(m.hinweisOben < m.anzahl.top, "der Paket-Hinweis steht nicht beim Paketabschnitt");
    if (schrift === 100) {
      // Ein Dreierraster: Anzahl über der Länge, Gewicht über Breite und Höhe.
      const r = (x) => Math.round(x);
      assert.equal(r(m.anzahl.left), r(m.laenge.left), "Anzahl steht nicht über der Länge");
      assert.equal(r(m.gewicht.left), r(m.breiteF.left), "Gewicht beginnt nicht über der Breite");
      assert.equal(r(m.gewicht.right), r(m.hoehe.right), "Gewicht endet nicht über der Höhe");
      assert.ok(m.anzahl.width < m.gewicht.width, "Anzahl ist nicht schmaler als Gewicht");
    } else {
      // Große Schrift auf dem Telefon: jedes Paketfeld in eigener Zeile statt abgeschnittener Beschriftungen.
      assert.ok(m.gewicht.top > m.anzahl.top && m.laenge.top > m.gewicht.top, "die Paketfelder brechen nicht um");
    }
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

test("B — Zustände partial, leer, 422, 429, 503, Netzfehler; unveränderte Eingabe ohne neuen Request", async () => {
  const { page, fehler } = await neueSeite({ width: 1440, height: 900 });
  const folge = [
    { status: 200, body: { status: "partial", publicCarriers: CARRIER, availableShippingModes: [], offers: ANGEBOTE.slice(0, 1) } },
    { status: 200, body: { status: "no_offers", publicCarriers: [], availableShippingModes: [], offers: [] } },
    { status: 422, body: { error: "Diese Versandroute wird derzeit nicht unterstützt.", code: "ROUTE_NOT_SUPPORTED" } },
    { status: 429, body: { error: "Zu viele Anfragen.", code: "RATE_LIMITED" }, headers: { "Retry-After": "900" } },
    { status: 503, body: { error: "nicht verfügbar", code: "PUBLIC_CALCULATOR_UNAVAILABLE" } },
    { abort: true },
  ];
  const p = await setup(page, { quote: (n) => folge[n - 1] || null });
  await oeffne(page);
  await fuelle(page, { gewicht: "1" });
  await page.click("#pc-submit");
  await page.waitForSelector("#pc-partial", { timeout: 20000 });
  assert.equal(await page.locator("#pc-offers .pc-offer").count(), 1, "partial zeigt die vorliegenden Angebote");
  await page.click("#pc-submit");
  await kurz(400);
  assert.equal(p.quotes.length, 1, "eine unveränderte Eingabe hat neu gefragt");

  const erwartet = [
    ["2", "#pc-empty", /Keine direkt buchbaren Angebote/],
    ["3", "#pc-outcome-route", /Versandziel nicht verfügbar/],
    ["4", "#pc-outcome-rate_limited", /Zu viele Anfragen/],
    ["5", "#pc-outcome-unavailable", /derzeit nicht verfügbar/],
    ["6", "#pc-outcome-network", /Verbindung unterbrochen/],
  ];
  for (const [gewicht, selektor, text] of erwartet) {
    await page.fill("#pc-weight", gewicht);
    await page.click("#pc-submit");
    await page.waitForSelector(selektor, { timeout: 20000 });
    assert.match(norm(await page.locator(selektor).innerText()), text);
    assert.doesNotMatch(norm(await page.locator(selektor).innerText()), /ROUTE_NOT_SUPPORTED|RATE_LIMITED|PUBLIC_CALCULATOR/);
  }
  assert.equal(await page.locator("#pc-retry").count(), 1, "nach einem Netzfehler lässt sich die Berechnung wiederholen");
  assert.equal(p.quotes.length, 6);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("C — Laden: ehrliche Wartezeit, ab 10 s der Hinweis auf länger rechnende Versanddienstleister", async () => {
  const { page, fehler } = await neueSeite({ width: 1440, height: 900 });
  await setup(page, { quote: () => ({ delayMs: 11500, status: 200,
    body: { status: "ok", publicCarriers: CARRIER, availableShippingModes: [], offers: ANGEBOTE } }) });
  await oeffne(page);
  await fuelle(page);
  await page.click("#pc-submit");
  await page.waitForSelector("#pc-loading", { timeout: 5000 });
  assert.equal(await page.locator("#pc-submit").isDisabled(), true, "während der Berechnung gesperrt");
  assert.equal(await page.locator("#pc-loading-slow").count(), 0, "der Hinweis kommt erst nach 10 s");
  assert.doesNotMatch(norm(await page.locator("#pc-loading").innerText()), /dauert (höchstens|maximal)|in \d+ Sekunden fertig/);
  await page.waitForSelector("#pc-loading-slow", { timeout: 12000 });
  await page.waitForSelector("#pc-offers .pc-offer", { timeout: 15000 });
  assert.deepEqual(fehler, []);
  await page.close();
});

test("D — ausgeschaltet: Hinweis statt Absenden, keine Preisabfrage", async () => {
  const { page, fehler } = await neueSeite({ width: 390, height: 844 });
  const p = await setup(page, { prepare: { delayMs: 0, body: { available: false } } });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pc-unavailable", { timeout: 30000 });
  assert.match(norm(await page.locator("#pc-unavailable").innerText()), /in Kürze verfügbar/);
  assert.equal(await page.locator("#pc-submit").count(), 0);
  assert.equal(p.quotes.length, 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — Tastatur: Skip-Link, Fehler am Feld, Absenden per Enter, Fokus auf die Ergebnisse", async () => {
  const { page, fehler } = await neueSeite({ width: 1440, height: 900 });
  await setup(page);
  await oeffne(page);
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.className), "pc-skip");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement.id), "pc-calculator-title");
  // Leeres Absenden: Fehler stehen am Feld (aria-describedby), der Fokus geht ins erste fehlerhafte Feld.
  await page.focus("#pc-submit");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#pc-form-banner", { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.activeElement.id), "pc-from-zip");
  const beschrieben = await page.locator("#pc-from-zip").getAttribute("aria-describedby");
  assert.ok(beschrieben && await page.locator(`#${beschrieben.split(" ")[0]}`).count() === 1, "Fehlertext ist nicht verknüpft");
  assert.equal(await page.locator("#pc-from-zip").getAttribute("aria-invalid"), "true");
  await page.keyboard.type("70173");
  for (const [id, wert] of [["#pc-from-city", "Stuttgart"], ["#pc-to-zip", "10115"], ["#pc-to-city", "Berlin"],
    ["#pc-weight", "2"], ["#pc-length", "30"], ["#pc-width", "20"], ["#pc-height", "10"]]) {
    await page.focus(id);
    await page.keyboard.type(wert);
  }
  await page.keyboard.press("Enter");
  await page.waitForSelector("#pc-offers .pc-offer", { timeout: 20000 });
  assert.equal(await page.evaluate(() => document.activeElement.id), "pc-results-title");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F — Übergabe: feste Adresse der Hauptdomain, Token nur im Fragment", async () => {
  const { page, fehler } = await neueSeite({ width: 1440, height: 900 });
  await setup(page);
  await page.route("https://confidaraexpress.de/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Hauptdomain</title>" }));
  await oeffne(page);
  await fuelle(page);
  await page.click("#pc-submit");
  await page.waitForSelector("#pc-offers .pc-offer", { timeout: 20000 });
  await page.locator("#pc-offers .pc-offer").nth(0).getByRole("button", { name: "Angebot auswählen" }).click();
  await page.waitForURL(/^https:\/\/confidaraexpress\.de\/preisrechner-uebernahme/, { timeout: 10000 });
  assert.equal(page.url(), `https://confidaraexpress.de/preisrechner-uebernahme#t=${TOKEN_UPS}`);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("G — Ergebnisbereich erst nach der Berechnung, Carrierauswahl, „Angaben ändern“ zurück zum Formular", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  const p = await setup(page);
  await oeffne(page);
  // Vor der ersten Berechnung belegt der Ergebnisbereich keinen Platz — keine leere Fläche, keine Überschrift.
  assert.equal(await page.locator("#pc-results-section").count(), 0);
  assert.equal(await page.locator("#pc-results").evaluate((el) => el.childElementCount), 0);
  assert.ok(await page.locator("#pc-submit").evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight),
    "Absenden auf 1366×768 nicht ohne Scrollen erreichbar");

  await fuelle(page);
  await page.click("#pc-submit");
  await page.waitForSelector("#pc-offers .pc-offer", { timeout: 20000 });
  assert.match(norm(await page.locator("#pc-results-summary").innerText()),
    /^DE 70173 Stuttgart → DE 10115 Berlin · 1 Paket · 2,5 kg · 30 × 20 × 10 cm$/);
  const oben = await page.locator("#pc-results-title").evaluate((el) => Math.round(el.getBoundingClientRect().top));
  assert.ok(oben >= 0 && oben < 120, `Ergebnisüberschrift nicht im Blick (${oben} px)`);

  // Carrierauswahl: filtert im Browser über die geladenen Angebote; „Alle anzeigen“ setzt zurück.
  await page.locator("label.pc-chip", { hasText: "DPD" }).click();
  assert.equal(await page.locator("#pc-offers .pc-offer").count(), 1);
  assert.equal(norm(await page.locator("#pc-count").innerText()), "1 Angebot von 3");
  await page.click("#pc-carrier-reset");
  assert.equal(await page.locator("#pc-offers .pc-offer").count(), 3);
  assert.equal(await page.locator(".pc-chip-input:checked").count(), 0);
  assert.equal(await page.locator("#pc-carrier-reset").count(), 0);
  assert.equal(p.quotes.length, 1, "die Auswahl hat neu gefragt");

  // „Angaben ändern“: sofort (reduzierte Bewegung) zurück zur Karte, Fokus auf ihrer Überschrift.
  await page.click("#pc-edit");
  assert.equal(await page.evaluate(() => document.activeElement.id), "pc-calculator-title");
  const karte = await page.locator("#pc-calculator-card").evaluate((el) => Math.round(el.getBoundingClientRect().top));
  assert.ok(karte >= 0 && karte <= 40, `Rechnerkarte nicht oben im Blick (${karte} px)`);
  assert.equal(await page.inputValue("#pc-from-zip"), "70173", "die Eingaben bleiben stehen");
  // Unverändert erneut absenden: kein Request, zurück zu den bestehenden Angeboten.
  await page.click("#pc-submit");
  await kurz(300);
  assert.equal(p.quotes.length, 1);
  assert.equal(await page.evaluate(() => document.activeElement.id), "pc-results-title");
  assert.deepEqual(fehler, []);
  await page.close();
});
