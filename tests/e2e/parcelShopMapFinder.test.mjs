// E2E: Das große Paketshop-Finder-Fenster mit Liste UND Karte — echter Dev-Server.
//
// Was hier geprüft wird und in parcelShopParity.test.mjs bewusst NICHT steht:
// Aufbau und Bedienung des Fensters, die Synchronisierung Liste ↔ Karte, die
// Wochenöffnungszeiten, die Statusfarben, das Verhalten bei Kartenausfall und
// die Aufteilung auf Desktop, Tablet und Mobil.
//
// Die Karte läuft über die Testengine aus tests/fixtures/mapTestEngine.mjs:
// keine Kacheln aus dem Internet, keine 970-kB-Bibliothek, kein WebGL. Sie
// bildet den Engine-Vertrag als echtes DOM ab, sodass Marker, Auswahl und
// fitBounds real geprüft werden und nicht an einer Attrappe vorbei.
//
// Die Uhr steht auf demselben Freitag wie im Mitschnitt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  DPD_RESPONSE, DPD_ACCESS_POINTS, DPD_EXPECTED_SORTED,
  DPD_EXPECTED_SUNDAY, FREITAG,
} from "../fixtures/accessPointsDpd.mjs";
import { MAP_TEST_ENGINE_SCRIPT, MAP_TEST_ENGINE_BROKEN_SCRIPT } from "../fixtures/mapTestEngine.mjs";

const PORT = 5243, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const DROPOFF_TARIFF = {
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dpd", publicCarrierName: "DPD",
  publicServiceName: "Shopabgabe", serviceType: "dropoff", netPrice: 6.9, vatAmount: 1.31,
  finalPrice: 8.21, currency: "EUR", transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  deliveryDate: "2026-08-10T00:00:00Z",
};

const ABSENDER = { zip: "73207", city: "Plochingen", street: "Weiherstraße 25" };

let server, browser;

async function setupRoutes(page, {
  accessPoints = DPD_RESPONSE, mapScript = MAP_TEST_ENGINE_SCRIPT, verzoegerung = null,
} = {}) {
  const suchen = [];
  await page.addInitScript(mapScript);
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.includes("/api/jumingo/access-points-search")) {
      let body = null;
      try { body = JSON.parse(req.postData() || "{}"); } catch { body = null; }
      suchen.push(body);
      // Erlaubt gezieltes Verzögern einzelner Antworten (Race-Test).
      const wartezeit = typeof verzoegerung === "function" ? verzoegerung(body, suchen.length) : 0;
      if (wartezeit) await new Promise((r) => setTimeout(r, wartezeit));
      return json(typeof accessPoints === "function" ? accessPoints(body, suchen.length) : accessPoints);
    }
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", tariffs: [DROPOFF_TARIFF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dpd", name: "DPD" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return suchen;
}

async function oeffneFinder(page) {
  await page.clock.setFixedTime(new Date(FREITAG));
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  const fill = async (ph, v) => page.getByPlaceholder(ph, { exact: true }).first().fill(String(v));
  for (const [ph, v] of [
    ["Max Mustermann", "Max Mustermann"], ["Musterstraße 1", ABSENDER.street], ["Stuttgart", ABSENDER.city],
    ["Firma AG", "Empfang AG"], ["Erika Muster", "Erika Empfaenger"], ["Beispielweg 5", "Bahnhofstrasse 9"],
  ]) await fill(ph, v);
  const abs = page.locator(".booking-addr-grid > div").nth(0).locator("input.field-input");
  await abs.nth(4).fill(ABSENDER.zip);
  const emp = page.locator(".booking-addr-grid > div").nth(1).locator("input.field-input");
  await emp.nth(4).fill("80331");
  await emp.nth(5).fill("Muenchen");
  for (const [ph, v] of [["1", "2"], ["5", "5.5"], ["30", "40"], ["20", "30"], ["15", "20"]]) await fill(ph, v);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-details-link").first().click();
  await page.waitForSelector(".ap-finder", { timeout: 20000 });
}

async function suche(page) {
  await page.locator(".ap-finder-search-btn").first().click();
  await page.waitForSelector(".ap-modal .ap-list-item", { timeout: 20000 });
}

const namen = (page) => page.locator(".ap-modal .ap-list-name").allInnerTexts();
const markerTexte = (page) => page.locator(".ap-modal .ap-map-marker").allInnerTexts();

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

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

// ═══════════ Fenster: Öffnen, Rollen, Schließen ════════════════════════════

test("1 — „Paketshops suchen“ öffnet das Fenster als echten Dialog", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);

  assert.equal(await page.locator(".ap-modal").count(), 0, "vor dem Klick gibt es kein Fenster");
  await suche(page);

  const dialog = page.locator(".ap-modal");
  assert.equal(await dialog.getAttribute("role"), "dialog");
  assert.equal(await dialog.getAttribute("aria-modal"), "true");
  const labelId = await dialog.getAttribute("aria-labelledby");
  assert.ok(labelId, "aria-labelledby fehlt");
  assert.equal((await page.locator(`[id="${labelId}"]`).innerText()).trim(), "Paketshops in Ihrer Nähe");
  await page.close();
});

test("2 — während des Requests steht ein Ladezustand im Fenster, kein leeres Loch", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { verzoegerung: () => 700 });
  await oeffneFinder(page);
  await page.locator(".ap-finder-search-btn").first().click();

  // Das Fenster ist SOFORT da — nicht erst nach der Antwort.
  await page.waitForSelector(".ap-modal", { timeout: 3000 });
  await page.waitForSelector(".ap-modal-skeleton", { timeout: 3000 });
  assert.match(await page.locator(".ap-modal-count").innerText(), /werden gesucht/);

  await page.waitForSelector(".ap-modal .ap-list-item", { timeout: 20000 });
  assert.equal(await page.locator(".ap-modal-skeleton").count(), 0, "danach ist das Skelett weg");
  await page.close();
});

test("3 — auf der Hauptseite steht KEINE zweite Trefferliste mehr", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  // Im Fenster: 20 Einträge. Außerhalb: keiner.
  assert.equal(await page.locator(".ap-modal .ap-list-item").count(), 20);
  const draussen = await page.locator(".ap-list-item:not(.ap-modal .ap-list-item)").count();
  assert.equal(draussen, 0, "die Inline-Liste ist ersatzlos entfallen");
  assert.equal(await page.locator(".ap-result").count(), 0, "auch die alten .ap-result-Karten sind weg");

  // Nach dem Schließen bleibt nur eine knappe Quittung — keine Liste.
  await page.locator(".ap-modal-close").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  assert.equal(await page.locator(".ap-list-item").count(), 0);
  assert.match(await page.locator(".ap-finder-receipt").innerText(), /20 Paketshops/);
  await page.close();
});

test("4 — Close-Button und Escape schließen, der Fokus kehrt zum Suchbutton zurück", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);

  const fokusIstSuchbutton = () => page.evaluate(
    () => document.activeElement?.classList.contains("ap-finder-search-btn") === true);

  // 1) Close-Button
  await suche(page);
  await page.locator(".ap-modal-close").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  assert.ok(await fokusIstSuchbutton(), "nach dem Close-Button muss der Fokus zurückkommen");

  // 2) Escape
  await suche(page);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  assert.ok(await fokusIstSuchbutton(), "auch nach Escape");
  await page.close();
});

test("5 — der Close-Button trägt ein aria-label und ein title", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);
  const close = page.locator(".ap-modal-close");
  assert.ok((await close.getAttribute("aria-label"))?.length > 0);
  assert.ok((await close.getAttribute("title"))?.length > 0);
  await page.close();
});

test("6 — der Fokus bleibt im Fenster gefangen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const drin = await page.evaluate(() => !!document.activeElement?.closest(".ap-modal"));
    assert.ok(drin, `der Fokus ist nach ${i + 1} Tabs aus dem Fenster gelaufen`);
  }
  await page.close();
});

// ═══════════ Suchkontext und Nachsuchen im Fenster ═════════════════════════

test("7 — Suchparameter stehen sichtbar im Fenster und sind änderbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const suchen = await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  assert.equal(await page.locator(".ap-modal #apm-zip").inputValue(), ABSENDER.zip);
  assert.equal(await page.locator(".ap-modal #apm-city").inputValue(), ABSENDER.city);
  assert.equal(await page.locator(".ap-modal #apm-street").inputValue(), ABSENDER.street);
  assert.equal(await page.locator(".ap-modal #apm-radius").inputValue(), "10");
  assert.equal(await page.locator(".ap-modal #apm-opening").inputValue(), "all");

  // Radius im Fenster ändern und erneut suchen — ohne es zu schließen.
  await page.selectOption(".ap-modal #apm-radius", "25");
  await page.locator(".ap-modal-search-btn").click();
  await page.waitForFunction(() => window.__CE_SUCHEN__ === undefined || true);
  await page.waitForTimeout(500);

  assert.equal(suchen.length, 2, "die zweite Suche muss rausgegangen sein");
  assert.equal(suchen[1].radius, 25, "mit dem neuen Radius");
  assert.equal(await page.locator(".ap-modal").count(), 1, "das Fenster bleibt offen");
  await page.close();
});

test("8 — die fachliche Grenze steht auch im Fenster", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  const hinweis = await page.locator(".ap-modal-note").innerText();
  assert.match(hinweis, /Orientierung/);
  assert.match(hinweis, /verbindliche Auswahl eines Shops ist nicht erforderlich/);

  // Und nirgends darf eine Buchungs-/Auswahlaktion auftauchen.
  const text = await page.locator(".ap-modal").innerText();
  assert.ok(!/\bBuchen\b|\bShop auswählen\b|\bAuswählen\b/.test(text),
    "keine Aktion, die eine verbindliche Auswahl behauptet");
  await page.close();
});

test("9 — eine überholte Antwort überschreibt die neuere Suche nicht", async () => {
  // Erste Suche antwortet langsam und mit NUR EINEM Shop, zweite schnell mit
  // allen 20. Ohne Lauf-Guard träfe die alte Antwort zuletzt ein und setzte
  // die Liste auf 1 zurück.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, {
    verzoegerung: (_b, n) => (n === 1 ? 1500 : 0),
    accessPoints: (_b, n) => (n === 1 ? { accessPoints: [DPD_ACCESS_POINTS[0]] } : DPD_RESPONSE),
  });
  await oeffneFinder(page);

  await page.locator(".ap-finder-search-btn").first().click();
  await page.waitForSelector(".ap-modal", { timeout: 5000 });
  await page.selectOption(".ap-modal #apm-radius", "25");
  await page.locator(".ap-modal-search-btn").click();

  await page.waitForSelector(".ap-modal .ap-list-item", { timeout: 20000 });
  // Lange genug warten, dass die verzögerte erste Antwort sicher da war.
  await page.waitForTimeout(2000);
  assert.equal((await namen(page)).length, 20, "die alte Antwort darf die neue nicht überschreiben");
  await page.close();
});

// ═══════════ Liste: Inhalt und Wochenöffnungszeiten ════════════════════════

test("10 — jeder Listeneintrag zeigt Name, Adresse, Entfernung, Status und heute", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  const ersteKarte = page.locator(".ap-modal .ap-list-item").first();
  assert.equal((await ersteKarte.locator(".ap-list-name").innerText()).trim(), "Kopier und Werbestudio");
  const adresse = (await ersteKarte.locator(".ap-list-addr").innerText()).trim();
  assert.match(adresse, /Marktstr\. 4-6/, "Straße");
  assert.match(adresse, /73207/, "PLZ");
  assert.match(adresse, /Plochingen/, "Stadt");
  assert.equal((await ersteKarte.locator(".ap-list-dist").innerText()).trim(), "0,6 KM");
  assert.equal((await ersteKarte.locator(".ap-list-status").innerText()).trim(), "Geschlossen");
  assert.equal((await ersteKarte.locator(".ap-list-hours").innerText()).trim(), "Heute: 10:00–17:00");

  // Die Nummer entspricht der Listenposition.
  assert.equal((await ersteKarte.locator(".ap-list-num").innerText()).trim(), "1");
  await page.close();
});

test("11 — die Wochenöffnungszeiten sind ausklappbar und zeigen echte Daten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  // Intermarkt (Position 2) hat Pausen — der interessantere Fall.
  const karte = page.locator(".ap-modal .ap-list-item").nth(1);
  const toggle = karte.locator(".ap-list-toggle");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false", "standardmäßig zu — die Liste bleibt scanbar");
  assert.equal(await karte.locator(".ap-week").count(), 0);

  await toggle.click();
  await karte.locator(".ap-week").waitFor({ timeout: 5000 });
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");

  const tage = await karte.locator(".ap-week-day").allInnerTexts();
  assert.deepEqual(tage.map((t) => t.trim()),
    ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]);
  const zeiten = (await karte.locator(".ap-week-time").allInnerTexts()).map((t) => t.trim());
  assert.match(zeiten[0], /09:00–18:00/);
  assert.match(zeiten[0], /Pause 13:00–15:00/);
  assert.equal(zeiten[6], "Geschlossen", "Sonntag ist im Mitschnitt geschlossen");

  await toggle.click();
  assert.equal(await karte.locator(".ap-week").count(), 0, "wieder einklappbar");
  await page.close();
});

test("12 — fehlende Öffnungszeiten führen zu einem ehrlichen Satz, nicht zum Absturz", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const ohneZeiten = {
    accessPoints: [{ ...DPD_ACCESS_POINTS[0], hoursOfOperation: [] }, ...DPD_ACCESS_POINTS.slice(1)],
  };
  await setupRoutes(page, { accessPoints: ohneZeiten });
  await oeffneFinder(page);
  await suche(page);

  const karte = page.locator(".ap-modal .ap-list-item").first();
  await karte.locator(".ap-list-toggle").click();
  assert.equal((await karte.locator(".ap-week-plain").innerText()).trim(), "Öffnungszeiten nicht verfügbar");
  assert.equal((await namen(page)).length, 20, "der Shop bleibt vollständig in der Liste");
  await page.close();
});

// ═══════════ Statusfarben ══════════════════════════════════════════════════

test("13 — Geöffnet grün, Geschlossen rot, Schließt bald amber, Unbekannt neutral", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const mitUnbekannt = {
    accessPoints: [
      { ...DPD_ACCESS_POINTS[0], name: "Ohne Status", workState: "WAS_AUCH_IMMER", distance: 0.05 },
      ...DPD_ACCESS_POINTS,
    ],
  };
  await setupRoutes(page, { accessPoints: mitUnbekannt });
  await oeffneFinder(page);
  await suche(page);

  const klasseVon = async (text) => page
    .locator(".ap-modal .ap-list-status", { hasText: text }).first().getAttribute("class");

  assert.match(await klasseVon("Geöffnet"), /badge--success/);
  assert.match(await klasseVon("Geschlossen"), /badge--error/);
  assert.match(await klasseVon("Schließt bald"), /badge--warning/);
  assert.match(await klasseVon("Öffnungsstatus nicht verfügbar"), /badge--neutral/);

  // Der Zustand steht NIE allein in der Farbe: jedes Badge trägt Text.
  for (const t of await page.locator(".ap-modal .ap-list-status").allInnerTexts()) {
    assert.ok(t.trim().length > 0, "ein Badge ohne Text wäre nur farbig codiert");
  }
  await page.close();
});

// ═══════════ Karte: Marker, Synchronisierung, Ausfall ══════════════════════

test("14 — die Marker entsprechen den sichtbaren Shops, in derselben Reihenfolge", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  const marker = await markerTexte(page);
  assert.equal(marker.length, 20, "alle 20 haben Koordinaten");
  assert.deepEqual(marker.map((m) => m.trim()), Array.from({ length: 20 }, (_, i) => String(i + 1)));

  // Marker 1 gehört zum nächstgelegenen Shop — dieselbe Sortierung wie die Liste.
  const ersterLabel = await page.locator(".ap-modal .ap-map-marker").first().getAttribute("aria-label");
  assert.equal(ersterLabel, `1. ${DPD_EXPECTED_SORTED[0]}`);
  await page.close();
});

test("15 — die Karte passt den Ausschnitt auf alle sichtbaren Marker ein", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  const calls = await page.evaluate(() => window.__CE_MAP_CALLS__);
  assert.ok(calls.fitBounds.length > 0, "fitBounds muss aufgerufen worden sein");
  const b = calls.fitBounds.at(-1).bounds;
  // Der Ausschnitt muss jeden echten Marker einschließen.
  const positionen = await page.locator(".ap-modal .ap-map-marker").evaluateAll(
    (els) => els.map((e) => ({ lat: Number(e.dataset.lat), lng: Number(e.dataset.lng) })));
  for (const p of positionen) {
    assert.ok(p.lat >= b.south && p.lat <= b.north, `Marker außerhalb (Breite): ${p.lat}`);
    assert.ok(p.lng >= b.west && p.lng <= b.east, `Marker außerhalb (Länge): ${p.lng}`);
  }
  assert.ok(calls.fitBounds.at(-1).opts?.padding > 0, "mit Rand, damit kein Marker an der Kante klebt");
  await page.close();
});

test("16 — Klick auf einen Listeneintrag hebt den Marker hervor und zeigt das Popup", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  const dritter = page.locator(".ap-modal .ap-list-item").nth(2);
  await dritter.locator(".ap-list-hit").click();

  await page.waitForSelector(".ap-modal .ap-map-marker--active", { timeout: 5000 });
  const aktiv = page.locator(".ap-modal .ap-map-marker--active");
  assert.equal(await aktiv.count(), 1, "genau ein Marker ist aktiv");
  assert.equal((await aktiv.innerText()).trim(), "3", "und zwar der zum dritten Listeneintrag");

  assert.ok(await dritter.evaluate((el) => el.classList.contains("ap-list-item--focused")),
    "der Listeneintrag ist hervorgehoben");
  assert.equal(await dritter.locator(".ap-list-hit").getAttribute("aria-pressed"), "true");

  // Popup mit den Kerndaten — ohne Buchen/Auswählen.
  const popup = page.locator(".ap-map-popup-card");
  await popup.waitFor({ timeout: 5000 });
  assert.match(await popup.innerText(), /DPD-Paketstation/);
  assert.match(await popup.innerText(), /2,6 KM/);
  assert.match(await popup.innerText(), /Geöffnet/);
  await page.close();
});

test("17 — Klick auf einen Marker hebt den zugehörigen Listeneintrag hervor", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  await page.locator(".ap-modal .ap-map-marker").nth(4).click();
  await page.waitForSelector(".ap-modal .ap-list-item--focused", { timeout: 5000 });

  const hervorgehoben = page.locator(".ap-modal .ap-list-item--focused");
  assert.equal(await hervorgehoben.count(), 1);
  assert.equal((await hervorgehoben.locator(".ap-list-name").innerText()).trim(), DPD_EXPECTED_SORTED[4]);
  assert.equal((await hervorgehoben.locator(".ap-list-num").innerText()).trim(), "5");
  await page.close();
});

test("18 — der Öffnungszeitenfilter reduziert Marker und Ausschnitt und stellt sie wieder her", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);
  assert.equal((await markerTexte(page)).length, 20);

  await page.selectOption(".ap-modal #apm-opening", "sunday");
  await page.waitForFunction(
    (n) => document.querySelectorAll(".ap-modal .ap-map-marker").length === n,
    DPD_EXPECTED_SUNDAY.length, { timeout: 10000 });
  assert.deepEqual(await namen(page), DPD_EXPECTED_SUNDAY);
  // Der Ausschnitt folgt der neuen, kleineren Menge.
  const nachFilter = await page.evaluate(() => window.__CE_MAP_CALLS__.fitBounds.at(-1).bounds);
  assert.ok(nachFilter.north - nachFilter.south >= 0);

  await page.selectOption(".ap-modal #apm-opening", "all");
  await page.waitForFunction(
    () => document.querySelectorAll(".ap-modal .ap-map-marker").length === 20, null, { timeout: 10000 });
  assert.equal((await namen(page)).length, 20, "zurück auf „Alle Öffnungszeiten“ → alles wieder da");
  await page.close();
});

test("19 — ein Shop ohne Koordinaten verliert seinen Marker, nicht seinen Listenplatz", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Dem zweitnächsten Shop die Position nehmen.
  const ohnePos = {
    accessPoints: DPD_ACCESS_POINTS.map((s) =>
      s.name === "Intermarkt" ? { ...s, latitude: null, longitude: null } : s),
  };
  await setupRoutes(page, { accessPoints: ohnePos });
  await oeffneFinder(page);
  await suche(page);

  assert.deepEqual(await namen(page), DPD_EXPECTED_SORTED, "die Liste ist vollständig");
  const marker = (await markerTexte(page)).map((m) => m.trim());
  assert.equal(marker.length, 19, "ein Marker weniger");
  // Die Nummerierung folgt der LISTE: die 2 fehlt, die 3 bleibt die 3.
  assert.ok(!marker.includes("2"), "die Nummer des positionslosen Shops wird übersprungen");
  assert.ok(marker.includes("3"), "die übrigen behalten ihre Listennummer");

  // Und der ehrliche Hinweis dazu.
  assert.match(await page.locator(".ap-map-context").innerText(), /19 von 20 Paketshops/);
  await page.close();
});

test("20 — fällt die Karte aus, bleibt die Liste vollständig und der Hinweis ruhig", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { mapScript: MAP_TEST_ENGINE_BROKEN_SCRIPT });
  await oeffneFinder(page);
  await suche(page);

  await page.waitForSelector(".ap-map--error", { timeout: 10000 });
  assert.deepEqual(await namen(page), DPD_EXPECTED_SORTED, "kein einziger Shop geht verloren");
  assert.equal((await page.locator(".ap-modal-count").innerText()).trim(), "20 Paketshops");

  const fehler = await page.locator(".ap-map--error").innerText();
  assert.match(fehler, /Karte konnte nicht geladen werden/);
  assert.ok(!/WebGL|Error|undefined|stack/i.test(fehler), `keine technische Rohmeldung: ${fehler}`);
  await page.close();
});

// ═══════════ Aufteilung: Desktop, Tablet, Mobil ════════════════════════════

test("21 — Desktop zeigt Liste UND Karte nebeneinander", async () => {
  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800], [1024, 768]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await setupRoutes(page);
    await oeffneFinder(page);
    await suche(page);

    const liste = await page.locator(".ap-modal-listcol").boundingBox();
    const karte = await page.locator(".ap-modal-mapcol").boundingBox();
    assert.ok(liste && karte, `Spalten fehlen bei ${w}px`);
    assert.ok(liste.width > 0 && karte.width > 0, `eine Spalte ist unsichtbar bei ${w}px`);
    assert.ok(karte.x >= liste.x + liste.width - 2, `die Karte steht nicht rechts der Liste (${w}px)`);
    assert.ok(await noHorizontalOverflow(page), `horizontaler Überlauf bei ${w}px`);
    assert.equal(await page.locator(".ap-modal-toggle").count(), 0, `kein Umschalter auf ${w}px nötig`);
    await page.close();
  }
});

test("22 — die Liste scrollt eigenständig, die Karte scrollt nicht mit", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  const spalte = page.locator(".ap-modal-listcol");
  assert.ok(await spalte.evaluate((el) => el.scrollHeight > el.clientHeight + 1),
    "20 Einträge müssen die Spalte überlaufen — sonst prüft das hier nichts");

  const karteVorher = await page.locator(".ap-modal-mapcol").boundingBox();
  await spalte.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(200);
  assert.ok(await spalte.evaluate((el) => el.scrollTop > 0), "die Liste hat gescrollt");
  const karteNachher = await page.locator(".ap-modal-mapcol").boundingBox();
  assert.equal(Math.round(karteVorher.y), Math.round(karteNachher.y), "die Karte ist stehen geblieben");
  await page.close();
});

test("23 — Mobil ist Vollbild mit Umschalter Liste/Karte, ohne Nebeneinander", async () => {
  for (const [w, h] of [[768, 1024], [430, 932], [390, 844], [360, 800]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await setupRoutes(page);
    await oeffneFinder(page);
    await suche(page);

    // Vollbild: das Fenster füllt den Viewport.
    const box = await page.locator(".ap-modal").boundingBox();
    assert.ok(Math.abs(box.width - w) <= 1, `nicht vollbreit bei ${w}px (${box.width})`);

    // Standard ist die Liste; die Karte ist nicht daneben sichtbar.
    const toggle = page.locator(".ap-modal-toggle");
    assert.equal(await toggle.count(), 1, `Umschalter fehlt bei ${w}px`);
    assert.ok(await page.locator(".ap-modal-listcol").isVisible(), `Liste unsichtbar bei ${w}px`);
    assert.ok(!(await page.locator(".ap-modal-mapcol").isVisible()), `Karte darf bei ${w}px nicht danebenstehen`);

    // Umschalten auf Karte.
    await page.locator(".ap-modal-toggle-btn", { hasText: "Karte" }).click();
    await page.waitForTimeout(150);
    assert.ok(await page.locator(".ap-modal-mapcol").isVisible(), `Karte nicht sichtbar bei ${w}px`);
    assert.ok(!(await page.locator(".ap-modal-listcol").isVisible()), `Liste muss dann weichen (${w}px)`);

    assert.ok(await noHorizontalOverflow(page), `horizontaler Überlauf bei ${w}px`);
    await page.close();
  }
});

test("24 — die aktive Hervorhebung überlebt den Wechsel Liste ↔ Karte", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  await page.locator(".ap-modal .ap-list-item").nth(2).locator(".ap-list-hit").click();
  await page.waitForTimeout(150);

  await page.locator(".ap-modal-toggle-btn", { hasText: "Karte" }).click();
  await page.waitForTimeout(200);
  const aktiv = page.locator(".ap-modal .ap-map-marker--active");
  assert.equal(await aktiv.count(), 1, "die Auswahl ist mitgekommen");
  assert.equal((await aktiv.innerText()).trim(), "3");

  await page.locator(".ap-modal-toggle-btn", { hasText: "Liste" }).click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".ap-modal .ap-list-item--focused").count(), 1, "und wieder zurück");
  await page.close();
});

test("25 — Bedienelemente erreichen auf Mobil 44 px", async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  const ziele = [".ap-modal-close", ".ap-modal-search-btn", ".ap-modal-toggle-btn"];
  for (const sel of ziele) {
    const box = await page.locator(sel).first().boundingBox();
    assert.ok(box.height >= 43.5, `${sel} ist nur ${box.height}px hoch`);
  }
  const toggleBox = await page.locator(".ap-modal .ap-list-toggle").first().boundingBox();
  assert.ok(toggleBox.height >= 43.5, `Öffnungszeiten-Umschalter nur ${toggleBox.height}px hoch`);
  await page.close();
});

test("26 — das Schließen ändert weder Formular noch Angebot", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);

  const vorher = await page.locator(".offer-card").count();
  await suche(page);
  await page.locator(".ap-modal-close").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });

  assert.equal(await page.locator(".offer-card").count(), vorher, "die Angebote sind unverändert");
  // Die Suchparameter bleiben stehen — der Kunde soll nicht neu tippen.
  assert.equal(await page.locator('.ap-finder input[id^="ap-zip"]').inputValue(), ABSENDER.zip);
  assert.equal(await page.locator('.ap-finder input[id^="ap-street"]').inputValue(), ABSENDER.street);
  await page.close();
});
