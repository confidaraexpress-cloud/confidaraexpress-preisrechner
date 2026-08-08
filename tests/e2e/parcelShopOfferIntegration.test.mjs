// E2E: Der Paketshop-Finder als Einstieg AM ANGEBOT — echter Dev-Server.
//
// Bis zu diesem Paket stand auf der Angebotsseite eine vollständige zweite
// Suchmaske: „Paketshop finden“ mit PLZ, Ort, Straße, Umkreis, Öffnungszeiten,
// Ergebniszähler und Suchknopf — eingeklappt in den Angebotsdetails, mit einer
// Adresse, die der Kunde im Formular darüber längst erfasst hatte.
//
// Diese Datei prüft die neue Aufteilung:
//   • Die große Inline-Sektion ist WEG — kein zweites Adressformular.
//   • Paketshopfähige Angebote tragen einen kleinen Einstieg.
//   • Nicht paketshopfähige Angebote tragen KEINEN (auch keinen deaktivierten).
//   • Der Klick übernimmt Carrier UND Adresse und sucht sofort.
//   • Es gibt genau EIN Fenster, nicht eines je Angebot.
//   • Ein Carrierwechsel zeigt nie die Treffer des vorherigen Carriers.
//   • Radius und Öffnungszeitenmerkmal überleben den Wechsel.
//   • Die Karte hat sichtbaren Innenabstand zum Fensterrand (echte Geometrie).
//
// Die Karte läuft über die DOM-Testengine — keine Kacheln, kein WebGL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { DPD_RESPONSE, DPD_ACCESS_POINTS, FREITAG } from "../fixtures/accessPointsDpd.mjs";
import { MAP_TEST_ENGINE_SCRIPT } from "../fixtures/mapTestEngine.mjs";

const PORT = 5244, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const BASIS = {
  netPrice: 6.9, vatAmount: 1.31, finalPrice: 8.21, currency: "EUR",
  transitDaysMin: 1, transitDaysMax: 2, trackingAvailable: true,
  printerRequired: false, availableForDate: true, deliveryDate: "2026-08-10T00:00:00Z",
};

// Vier Angebote, die die Sichtbarkeitsregel vollständig ausleuchten. Alles
// kommt aus strukturierten Feldern — serviceType und publicCarrierId. Die
// NAMEN sind bewusst irreführend gewählt (ein Pickup-Angebot heißt
// „Shopabgabe Express“, ein Angebot ohne Suchcode heißt „UPS“), damit eine
// Namensheuristik hier auffliegen würde.
const T_DPD_DROPOFF = {
  ...BASIS, id: 1, shipper_tariff_id: 1, publicCarrierId: "dpd", publicCarrierName: "DPD",
  publicServiceName: "Shopabgabe", serviceType: "dropoff",
};
const T_UPS_DROPOFF = {
  ...BASIS, id: 2, shipper_tariff_id: 2, publicCarrierId: "ups", publicCarrierName: "UPS",
  publicServiceName: "Standardversand", serviceType: "dropoff", netPrice: 7.9, finalPrice: 9.4,
};
const T_PICKUP = {
  ...BASIS, id: 3, shipper_tariff_id: 3, publicCarrierId: "dpd", publicCarrierName: "DPD",
  // Name suggeriert Shopabgabe — der serviceType sagt etwas anderes, und er zählt.
  publicServiceName: "Shopabgabe Express", serviceType: "pickup", netPrice: 10.9, finalPrice: 12.9,
};
const T_OHNE_SUCHCODE = {
  ...BASIS, id: 4, shipper_tariff_id: 4, publicCarrierId: "other",
  // Name sagt „UPS“ — die klassifizierte ID sagt „other“, und sie zählt.
  publicCarrierName: "UPS", publicServiceName: "Shopabgabe", serviceType: "dropoff",
  netPrice: 5.9, finalPrice: 7.0,
};

const ABSENDER = { zip: "73207", city: "Plochingen", street: "Weiherstraße 25" };

let server, browser;

async function setupRoutes(page, { tariffs = [T_DPD_DROPOFF], accessPoints = DPD_RESPONSE, verzoegerung = null } = {}) {
  const suchen = [];
  await page.addInitScript(MAP_TEST_ENGINE_SCRIPT);
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.includes("/api/jumingo/access-points-search")) {
      let body = null;
      try { body = JSON.parse(req.postData() || "{}"); } catch { body = null; }
      suchen.push(body);
      const warte = typeof verzoegerung === "function" ? verzoegerung(body, suchen.length) : 0;
      if (warte) await new Promise((r) => setTimeout(r, warte));
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
      shipmentId: "s1", tariffs, availableShippingModes: ["standard"],
      publicCarriers: [...new Map(tariffs.map((t) => [t.publicCarrierId, { id: t.publicCarrierId, name: t.publicCarrierName }])).values()],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return suchen;
}

async function zeigeAngebote(page) {
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
}

// Der Einstieg einer bestimmten Angebotskarte (über den Carriernamen gefunden).
const triggerVon = (page, carrier) =>
  page.locator(".offer-card", { has: page.locator(".offer-carrier-name", { hasText: carrier }) })
    .locator(".ps-trigger");

async function oeffne(page, locator) {
  await locator.click();
  await page.waitForSelector(".ap-modal .ap-list-item", { timeout: 20000 });
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

// ═══════════ Die große Inline-Sektion ist weg ══════════════════════════════

test("1 — auf der Angebotsseite steht kein zweites Adressformular mehr", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zeigeAngebote(page);
  // Auch die Angebotsdetails aufklappen — dort saß die Sektion zuletzt.
  await page.locator(".offer-details-link").first().click();
  await page.waitForTimeout(400);

  const seite = await page.locator(".offers-section").innerText();
  assert.ok(!/PAKETSHOP FINDEN/i.test(seite), "die Überschrift der alten Sektion ist weg");

  // Kein PLZ-/Ort-/Straßen-/Umkreis-/Öffnungszeitenfeld des Finders außerhalb
  // des Fensters — und kein großer Inline-Suchknopf.
  for (const sel of [
    '.offers-section input[id^="ap-zip"]',
    '.offers-section input[id^="ap-city"]',
    '.offers-section input[id^="ap-street"]',
    '.offers-section select[id^="ap-radius"]',
    '.offers-section select[id^="ap-opening"]',
    ".offers-section .ap-finder-search-btn",
    ".offers-section .ap-finder-form",
    ".offers-section .ap-list-item",
    ".offers-section .ap-result",
  ]) {
    assert.equal(await page.locator(sel).count(), 0, `Rest der alten Inline-Sektion: ${sel}`);
  }
  await page.close();
});

// ═══════════ Wann der Einstieg erscheint ═══════════════════════════════════

test("2 — nur paketshopfähige Angebote tragen den Einstieg", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { tariffs: [T_DPD_DROPOFF, T_UPS_DROPOFF, T_PICKUP, T_OHNE_SUCHCODE] });
  await zeigeAngebote(page);
  await page.waitForSelector(".ps-trigger", { timeout: 10000 });

  assert.equal(await page.locator(".offer-card").count(), 4, "alle vier Angebote stehen da");
  // Genau zwei Einstiege: DPD-Dropoff und UPS-Dropoff.
  assert.equal(await page.locator(".ps-trigger").count(), 2);

  // Das Pickup-Angebot heißt „Shopabgabe Express“ — eine Namensheuristik würde
  // hier anschlagen. serviceType „pickup“ entscheidet, und der sagt nein.
  const pickupKarte = page.locator(".offer-card", { has: page.locator(".offer-service-type", { hasText: "Shopabgabe Express" }) });
  assert.equal(await pickupKarte.locator(".ps-trigger").count(), 0, "Pickup bekommt keinen Einstieg");

  // Das Angebot mit publicCarrierId „other“ heißt „UPS“ — auch das darf nicht
  // greifen; ohne auflösbaren Suchcode gäbe es nichts zu suchen.
  const ohneCode = page.locator(".offer-card").nth(3);
  assert.equal(await ohneCode.locator(".ps-trigger").count(), 0,
    "ohne auflösbaren Suchcode kein Einstieg");

  // Und nirgends ein deaktivierter Knopf oder ein „nicht verfügbar“-Text.
  assert.equal(await page.locator(".ps-trigger[disabled]").count(), 0);
  assert.ok(!/Paketshops nicht verfügbar/i.test(await page.locator(".offers-section").innerText()));
  await page.close();
});

test("3 — der Einstieg ist ein echter Button mit sprechendem Namen und Tastaturfokus", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { tariffs: [T_DPD_DROPOFF, T_UPS_DROPOFF] });
  await zeigeAngebote(page);
  await page.waitForSelector(".ps-trigger", { timeout: 10000 });

  const ups = triggerVon(page, "UPS");
  assert.equal(await ups.evaluate((el) => el.tagName), "BUTTON");
  assert.equal(await ups.getAttribute("type"), "button");
  // Vier gleichlautende „Paketshops suchen“ auf einer Seite wären für einen
  // Screenreader nicht unterscheidbar — der Name nennt Carrier und Service.
  const label = await ups.getAttribute("aria-label");
  assert.match(label, /UPS/);
  assert.match(label, /Standardversand/);

  // Per Tastatur erreichbar und auslösbar.
  await ups.focus();
  assert.ok(await ups.evaluate((el) => el === document.activeElement), "nicht fokussierbar");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".ap-modal", { timeout: 10000 });
  await page.close();
});

test("4 — der Einstieg wählt das Angebot NICHT aus", async () => {
  // Die Angebotskarte ist selbst klickbar. Ein Klick auf den Einstieg darf
  // nicht zusätzlich das Angebot auswählen.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { tariffs: [T_DPD_DROPOFF, T_UPS_DROPOFF] });
  await zeigeAngebote(page);
  await page.waitForSelector(".ps-trigger", { timeout: 10000 });

  const vorher = await page.locator(".offer-card--selected").count();
  await oeffne(page, triggerVon(page, "UPS"));
  await page.locator(".ap-modal-close").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  assert.equal(await page.locator(".offer-card--selected").count(), vorher,
    "die Auswahl der Angebote ist unberührt");
  await page.close();
});

// ═══════════ Kontextübernahme ══════════════════════════════════════════════

test("5 — Klick übernimmt Adresse und Carrier und sucht sofort", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const suchen = await setupRoutes(page, { tariffs: [T_DPD_DROPOFF] });
  await zeigeAngebote(page);
  await oeffne(page, triggerVon(page, "DPD"));

  // Genau ein Request — ohne dass jemand „Suchen“ geklickt hätte.
  assert.equal(suchen.length, 1, "der Klick sucht bereits");
  assert.deepEqual(suchen[0].carrierCodes, ["dpd"]);
  assert.equal(suchen[0].postCode, ABSENDER.zip);
  assert.equal(suchen[0].city, ABSENDER.city);
  assert.equal(suchen[0].street, ABSENDER.street);
  assert.equal(suchen[0].onlyOpen, false);

  // Und die Adresse steht sichtbar im Fenster — änderbar, aber nicht erneut
  // einzugeben.
  assert.equal(await page.locator(".ap-modal #apm-zip").inputValue(), ABSENDER.zip);
  assert.equal(await page.locator(".ap-modal #apm-city").inputValue(), ABSENDER.city);
  assert.equal(await page.locator(".ap-modal #apm-street").inputValue(), ABSENDER.street);
  await page.close();
});

test("6 — jeder Carrier geht als sein eigener Suchcode raus", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const suchen = await setupRoutes(page, { tariffs: [T_DPD_DROPOFF, T_UPS_DROPOFF] });
  await zeigeAngebote(page);

  await oeffne(page, triggerVon(page, "DPD"));
  assert.deepEqual(suchen.at(-1).carrierCodes, ["dpd"]);
  await page.locator(".ap-modal-close").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });

  await oeffne(page, triggerVon(page, "UPS"));
  assert.deepEqual(suchen.at(-1).carrierCodes, ["ups"], "kein Carrier-Mix");
  await page.close();
});

// ═══════════ Genau EIN Fenster ═════════════════════════════════════════════

test("7 — es gibt genau ein Fenster, nicht eines je Angebot", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { tariffs: [T_DPD_DROPOFF, T_UPS_DROPOFF] });
  await zeigeAngebote(page);
  await page.waitForSelector(".ps-trigger", { timeout: 10000 });

  // Vor dem Klick existiert gar keines — auch nicht verborgen.
  assert.equal(await page.locator(".ap-modal").count(), 0);
  await oeffne(page, triggerVon(page, "DPD"));
  assert.equal(await page.locator(".ap-modal").count(), 1);
  assert.equal(await page.locator(".ap-map").count(), 1, "auch nur EINE Karte");
  await page.close();
});

// ═══════════ Carrierwechsel ════════════════════════════════════════════════

test("8 — nach dem Wechsel stehen nie die Treffer des vorherigen Carriers", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  // UPS liefert absichtlich eine ANDERE, langsamere Antwort als DPD.
  const upsAntwort = { accessPoints: [{ ...DPD_ACCESS_POINTS[0], name: "UPS Access Point Solo" }] };
  const suchen = await setupRoutes(page, {
    tariffs: [T_DPD_DROPOFF, T_UPS_DROPOFF],
    accessPoints: (body) => (body?.carrierCodes?.[0] === "ups" ? upsAntwort : DPD_RESPONSE),
    verzoegerung: (body) => (body?.carrierCodes?.[0] === "ups" ? 1200 : 0),
  });
  await zeigeAngebote(page);

  // 1) UPS öffnen — die Antwort lässt auf sich warten.
  await page.locator(".ps-trigger").nth(1).click();
  await page.waitForSelector(".ap-modal", { timeout: 5000 });
  // 2) noch während des Ladens schließen und DPD öffnen.
  await page.locator(".ap-modal-close").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });
  await oeffne(page, triggerVon(page, "DPD"));

  // 3) Lange genug warten, dass die verspätete UPS-Antwort sicher eingetroffen ist.
  await page.waitForTimeout(1800);
  const namen = await page.locator(".ap-modal .ap-list-name").allInnerTexts();
  assert.equal(namen.length, 20, "die DPD-Treffer stehen vollständig");
  assert.ok(!namen.includes("UPS Access Point Solo"),
    "die verspätete UPS-Antwort darf die DPD-Ergebnisse nicht überschreiben");
  assert.deepEqual(suchen.at(-1).carrierCodes, ["dpd"]);
  await page.close();
});

test("9 — Radius und Öffnungszeitenmerkmal überleben den Wechsel des Angebots", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const suchen = await setupRoutes(page, { tariffs: [T_DPD_DROPOFF, T_UPS_DROPOFF] });
  await zeigeAngebote(page);

  // Bei DPD die persönliche Suchpräferenz setzen.
  await oeffne(page, triggerVon(page, "DPD"));
  await page.selectOption(".ap-modal #apm-radius", "25");
  await page.selectOption(".ap-modal #apm-opening", "sunday");
  await page.waitForTimeout(200);
  await page.locator(".ap-modal-close").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });

  // Bei UPS öffnen — die Präferenz steht noch, die Adresse ebenfalls.
  await page.locator(".ps-trigger").nth(1).click();
  await page.waitForSelector(".ap-modal", { timeout: 10000 });
  await page.waitForTimeout(600);
  assert.equal(await page.locator(".ap-modal #apm-radius").inputValue(), "25",
    "der Radius soll nicht bei jedem Carrier neu gewählt werden müssen");
  assert.equal(await page.locator(".ap-modal #apm-opening").inputValue(), "sunday",
    "das Öffnungszeitenmerkmal ist eine persönliche Präferenz");
  // Und der neue Request nutzt genau diesen Radius.
  assert.equal(suchen.at(-1).radius, 25);
  assert.deepEqual(suchen.at(-1).carrierCodes, ["ups"]);
  await page.close();
});

test("10 — dasselbe Angebot erneut zu öffnen löst keine zweite Suche aus", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const suchen = await setupRoutes(page, { tariffs: [T_DPD_DROPOFF] });
  await zeigeAngebote(page);

  await oeffne(page, triggerVon(page, "DPD"));
  assert.equal(suchen.length, 1);
  await page.locator(".ap-modal-close").click();
  await page.waitForSelector(".ap-modal", { state: "detached", timeout: 5000 });

  await oeffne(page, triggerVon(page, "DPD"));
  await page.waitForTimeout(500);
  assert.equal(suchen.length, 1, "identische Suche → keine Wiederholung");
  assert.equal((await page.locator(".ap-modal .ap-list-name").allInnerTexts()).length, 20);
  await page.close();
});

// ═══════════ Karten-Innenabstand (echte Geometrie) ═════════════════════════

test("11 — die Karte klebt nicht am Fensterrand", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  await zeigeAngebote(page);
  await oeffne(page, triggerVon(page, "DPD"));

  const mass = await page.evaluate(() => {
    const modal = document.querySelector(".ap-modal").getBoundingClientRect();
    const spalte = document.querySelector(".ap-modal-mapcol").getBoundingClientRect();
    const karte = document.querySelector(".ap-map").getBoundingClientRect();
    const liste = document.querySelector(".ap-modal-listcol").getBoundingClientRect();
    const canvas = document.querySelector(".ap-map-canvas");
    const mapEl = document.querySelector(".ap-map");
    return {
      rechts: modal.right - karte.right,
      unten: modal.bottom - karte.bottom,
      oben: karte.top - spalte.top,
      zurListe: karte.left - liste.right,
      // clientWidth/-Height statt der Randbox: .ap-map trägt eine 1-px-Border,
      // die zur Randbox zählt, aber nicht zur Zeichenfläche darin. Verglichen
      // wird deshalb Inhaltsbox mit Inhaltsbox.
      karte: [mapEl.clientWidth, mapEl.clientHeight],
      canvas: [canvas.clientWidth, canvas.clientHeight],
      ueberlauf: karte.right > spalte.right + 1 || karte.bottom > spalte.bottom + 1,
    };
  });

  // Sichtbarer weißer Innenabstand auf allen relevanten Seiten.
  assert.ok(mass.rechts >= 12, `zu wenig Luft rechts: ${mass.rechts}px`);
  assert.ok(mass.unten >= 12, `zu wenig Luft unten: ${mass.unten}px`);
  assert.ok(mass.oben >= 12, `zu wenig Luft oben: ${mass.oben}px`);
  assert.ok(mass.zurListe >= 12, `zu wenig Luft zur Liste: ${mass.zurListe}px`);
  assert.ok(!mass.ueberlauf, "die Karte läuft über ihre Spalte hinaus");

  // Und der Zeichenbereich füllt den Kartencontainer weiterhin vollständig —
  // kein Rückfall auf die 300-px-Vorgabe der Bibliothek.
  assert.deepEqual(mass.canvas, mass.karte,
    `Canvas ${mass.canvas} füllt den Container ${mass.karte} nicht`);
  assert.ok(mass.canvas[1] > 300, "der Canvas hängt wieder auf der 300-px-Vorgabe");
  await page.close();
});

test("12 — auf Mobil bleibt der Karte genug Fläche", async () => {
  for (const [w, h] of [[390, 844], [360, 800]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await setupRoutes(page);
    await zeigeAngebote(page);
    await oeffne(page, triggerVon(page, "DPD"));
    await page.locator(".ap-modal-toggle-btn", { hasText: "Karte" }).click();
    await page.waitForTimeout(300);

    const mass = await page.evaluate(() => {
      const karte = document.querySelector(".ap-map").getBoundingClientRect();
      const canvas = document.querySelector(".ap-map-canvas");
      const mapEl = document.querySelector(".ap-map");
      return { breite: karte.width, canvas: [canvas.clientWidth, canvas.clientHeight],
               karte: [mapEl.clientWidth, mapEl.clientHeight] };
    });
    // Der Innenabstand darf die Karte auf schmalen Geräten nicht schrumpfen:
    // mindestens 90 % der Fensterbreite bleiben Karte.
    assert.ok(mass.breite >= w * 0.9, `Karte bei ${w}px nur ${Math.round(mass.breite)}px breit`);
    assert.deepEqual(mass.canvas, mass.karte, `Canvas füllt bei ${w}px nicht`);
    await page.close();
  }
});

// ═══════════ Das Angebotslayout bleibt ruhig ═══════════════════════════════

test("13 — der Einstieg verdrängt weder Preis noch Hauptaktion", async () => {
  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800], [1024, 768], [768, 1024], [430, 932], [390, 844], [360, 800]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await setupRoutes(page, { tariffs: [T_DPD_DROPOFF, T_UPS_DROPOFF, T_PICKUP] });
    await zeigeAngebote(page);
    await page.waitForSelector(".ps-trigger", { timeout: 10000 });

    assert.ok(await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      `horizontaler Überlauf bei ${w}px`);

    // Preis und Hauptaktion sind sichtbar und bleiben größer als der Einstieg.
    const karte = page.locator(".offer-card").first();
    assert.ok(await karte.locator(".offer-price").first().isVisible(), `Preis unsichtbar bei ${w}px`);
    const cta = karte.locator(".offer-cta-btn, .offer-select-btn, button").last();
    const [tBox, cBox] = [await karte.locator(".ps-trigger").boundingBox(), await cta.boundingBox()];
    assert.ok(tBox.height <= cBox.height, `der Einstieg (${tBox.height}px) ist nicht kleiner als die Hauptaktion (${cBox.height}px) bei ${w}px`);
    await page.close();
  }
});
