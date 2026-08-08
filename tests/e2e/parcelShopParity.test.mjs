// E2E: Paketshop-Finder gegen echte JUMiNGO-Daten — echter Dev-Server.
//
// Grundlage ist ein im Browser mitgeschnittener DPD-Aufruf (siehe
// tests/fixtures/accessPointsDpd.mjs). Geprüft wird genau das, was eine
// Quelltextprüfung nicht erreicht:
//
//   • Was tatsächlich an die Suche geht — insbesondere `street` (der
//     Suchmittelpunkt) und `onlyOpen` als echter Boolean (immer `false`).
//   • Was tatsächlich im DOM steht — Reihenfolge, Entfernungen, Status und
//     Öffnungszeiten der Shops aus dem Mitschnitt.
//
// WICHTIGE KORREKTUR (PR #306): Ein direkter 1:1-Vergleich mit JUMiNGOs eigener
// Oberfläche hat belegt, dass „Alle Öffnungszeiten“ dieselbe Menge zeigt wie
// die Rohantwort — NICHT die um workState „Geschlossen“ gekürzte Menge, wie
// eine frühere Fassung dieser Tests annahm. Diese Datei prüft deshalb das
// Gegenteil des früheren Verhaltens: Shops mit workState „Geschlossen“ bleiben
// sichtbar, mit Status und Öffnungszeiten.
//
// DARSTELLUNG: Die Treffer stehen seit dem Kartenfenster NICHT mehr unter dem
// Formular, sondern im großen Finder-Fenster (.ap-modal). Diese Datei prüft
// weiterhin die JUMiNGO-PARITÄT (Request, Menge, Reihenfolge, Filter); Aufbau,
// Karte und Bedienung des Fensters prüft parcelShopMapFinder.test.mjs.
//
//   • Dass ein unbekannter Statuswert NICHT ausblendet (fail-open) und kein
//     Rohwert sichtbar wird.
//   • Dass die Zähler die tatsächlich gelieferte Menge meinen, nicht eine aus
//     workState abgeleitete „Verfügbarkeit“.
//   • Dass „Schließt bald“ auch auf 360 px vollständig lesbar bleibt.
//
// Die Uhr wird auf einen Freitag gestellt: nur für diesen Wochentag belegt der
// Mitschnitt Öffnungszeiten, und erfundene Zeiten kommen hier nicht vor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  DPD_RESPONSE, DPD_ACCESS_POINTS, DPD_EXPECTED_SORTED, DPD_WORKSTATE_CLOSED,
  DPD_EXPECTED_SUNDAY, DPD_EXPECTED_BEFORE_0730, DPD_EXPECTED_AFTER_2100, FREITAG,
} from "../fixtures/accessPointsDpd.mjs";
import { MAP_TEST_ENGINE_SCRIPT } from "../fixtures/mapTestEngine.mjs";

const PORT = 5241, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

// Ein Dropoff-Tarif eines allowlisteten Carriers (DPD) — nur dann rendert der
// Finder überhaupt. Preis-, Tarif- und Buchungslogik bleiben unberührt.
const DROPOFF_TARIFF = {
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dpd", publicCarrierName: "DPD",
  publicServiceName: "Shopabgabe", serviceType: "dropoff", netPrice: 6.9, vatAmount: 1.31,
  finalPrice: 8.21, currency: "EUR", transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  deliveryDate: "2026-08-10T00:00:00Z",
};

// Absenderadresse aus dem Mitschnitt — dieselbe, mit der JUMiNGO befragt wurde.
const ABSENDER = { zip: "73207", city: "Plochingen", street: "Weiherstraße 25" };

let server, browser;

// Sammelt die Bodies aller Suchaufrufe, damit Tests sie prüfen können.
// `tariff` ist standardmäßig der DPD-Dropoff-Tarif; ein Test überschreibt ihn
// mit UPS, um zu zeigen, dass der Carrier die angezeigte Menge NICHT mehr
// beeinflusst (die frühere carrier-spezifische Eligibility ist entfallen).
async function setupRoutes(page, { accessPoints = DPD_RESPONSE, tariff = DROPOFF_TARIFF } = {}) {
  const suchen = [];
  // Karte als DOM-Attrappe: keine Kacheln aus dem Internet, kein WebGL.
  await page.addInitScript(MAP_TEST_ENGINE_SCRIPT);
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.includes("/api/jumingo/access-points-search")) {
      try { suchen.push(JSON.parse(req.postData() || "{}")); } catch { suchen.push(null); }
      return json(accessPoints);
    }
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", tariffs: [tariff], availableShippingModes: ["standard"],
      publicCarriers: [{ id: tariff.publicCarrierId, name: tariff.publicCarrierName }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return suchen;
}

// Formular ausfüllen → Angebote → Details des Dropoff-Tarifs → Finder sichtbar.
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
  // Der Einstieg sitzt seit der Integration in die Angebote direkt an der
  // Angebotskarte — es gibt kein Inline-Suchformular mehr aufzuklappen.
  await page.waitForSelector(".ps-trigger", { timeout: 20000 });
}

// Suche starten → das Fenster öffnet sich und zeigt die Treffer.
// Ein Klick auf den Einstieg öffnet das Fenster UND sucht bereits — der Kunde
// muss dort nicht noch einmal auf „Suchen" drücken.
async function suche(page) {
  await page.locator(".ps-trigger").first().click();
  await page.waitForSelector(".ap-modal .ap-list-item", { timeout: 20000 });
}

// Filter wählen und auf den fertigen Rerender warten. Ohne das Warten liest
// ein sofortiger allInnerTexts() gelegentlich in den Reconciliation-Moment
// hinein und bekommt eine leere Liste — ein Testartefakt, kein UI-Fehler.
async function waehleFilter(page, wert, erwarteteAnzahl) {
  await page.selectOption(".ap-modal #apm-opening", wert);
  await page.waitForFunction(
    (n) => document.querySelectorAll(".ap-modal .ap-list-item").length === n,
    erwarteteAnzahl, { timeout: 10000 });
}

const namen = (page) => page.locator(".ap-modal .ap-list-name").allInnerTexts();

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

test("1 — die Suche sendet die Straße mit, auch wenn der Carrier sie nicht verlangt (DPD)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const suchen = await setupRoutes(page);
  await oeffneFinder(page);

  await suche(page);

  // Die Straße kommt aus der bereits erfassten Absenderadresse — keine zweite
  // Adressquelle, kein neues Pflichtfeld, und der Kunde tippt sie NICHT erneut.
  // Sie steht im Fenster, wo sie auch korrigierbar ist.
  assert.equal(await page.locator(".ap-modal #apm-street").inputValue(), ABSENDER.street,
    "die Straße muss aus der Absenderadresse übernommen sein");
  assert.equal(suchen.length, 1);
  const body = suchen[0];
  assert.deepEqual(body.carrierCodes, ["dpd"]);
  assert.equal(body.countryCode, "DE");
  assert.equal(body.postCode, ABSENDER.zip);
  assert.equal(body.city, ABSENDER.city);
  assert.equal(body.street, ABSENDER.street, "ohne street sucht JUMiNGO um den PLZ-Mittelpunkt");
  assert.equal(body.radius, 10);
  assert.equal(body.onlyOpen, false);
  assert.strictEqual(typeof body.onlyOpen, "boolean", "onlyOpen muss ein echter Boolean sein");
  await page.close();
});

test("2 — ohne Straße läuft die Suche weiter (leeres Feld, kein Zwang, kein erfundener Wert)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const suchen = await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);
  // Im Fenster die Straße leeren und erneut suchen.
  await page.locator(".ap-modal #apm-street").fill("");
  const btn = page.locator(".ap-modal-search-btn");
  assert.ok(await btn.isEnabled(), "ohne Straße muss die Suche bei DPD weiterhin möglich sein");
  await btn.click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(400);
  assert.equal(suchen.at(-1).street, "", "leer heißt leer — es wird nichts hinzuerfunden");
  assert.equal((await page.locator(".ap-modal .ap-list-item").count()) > 0, true);
  await page.close();
});

test("3 — onlyOpen geht immer als false raus, auch beim Wechsel des Öffnungsfilters", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const suchen = await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  // Der frühere Haken „Nur aktuell geöffnete Shops“ ist ersatzlos entfallen —
  // sein `true` wird nicht weitergeschleppt. JUMiNGOs eigene Oberfläche sendet
  // in jeder aufgezeichneten Anfrage ebenfalls onlyOpen: false.
  assert.equal(suchen.length, 1);
  assert.equal(suchen[0].onlyOpen, false);
  assert.strictEqual(typeof suchen[0].onlyOpen, "boolean", "onlyOpen muss ein echter Boolean sein");

  // Und der Wechsel des Dropdowns löst KEINE neue Suche aus: der offizielle
  // Vertrag kennt für die Merkmale keinen Parameter, also wird lokal gefiltert.
  for (const [wert, anzahl] of [["sunday", 3], ["before_0730", 2], ["after_2100", 2], ["all", 20]]) {
    await waehleFilter(page, wert, anzahl);
  }
  assert.equal(suchen.length, 1, "kein zusätzlicher Request beim Filterwechsel");

  // Wird doch erneut gesucht, ist onlyOpen weiterhin false.
  await page.locator(".ap-modal-search-btn").click();
  await page.waitForTimeout(300);
  assert.equal(suchen.length, 2);
  assert.equal(suchen[1].onlyOpen, false);
  await page.close();
});

test("4 — bei „Alle Öffnungszeiten“ stehen ALLE 20 Shops aufsteigend nach Entfernung im DOM", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  // Das Fenster kürzt nicht mehr auf 5: die Liste scrollt selbst.
  assert.deepEqual(await namen(page), DPD_EXPECTED_SORTED);

  const distanzen = await page.locator(".ap-modal .ap-list-dist").allInnerTexts();
  assert.deepEqual(distanzen.slice(0, 5), ["0,6 KM", "0,9 KM", "2,6 KM", "2,7 KM", "2,9 KM"]);
  await page.close();
});

test("5 — Shops mit workState „Geschlossen“ stehen bei „Alle Öffnungszeiten“ in der Auswahl", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  // Der Kernnachweis der Korrektur aus PR #306: „Geschlossen“ blendet NICHT aus.
  const sichtbar = await namen(page);
  for (const name of DPD_WORKSTATE_CLOSED) {
    assert.ok(sichtbar.includes(name), `„${name}“ (workState Geschlossen) fehlt in der Liste`);
  }
  const status = await page.locator(".ap-modal .ap-list-status").allInnerTexts();
  assert.ok(status.some((s) => s.trim() === "Geschlossen"), "der Status muss sichtbar dabeistehen");
  await page.close();
});

test("6 — Status und Öffnungszeiten stehen sichtbar an jedem der ersten 5 Shops", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  const status = (await page.locator(".ap-modal .ap-list-status").allInnerTexts()).slice(0, 5).map((s) => s.trim());
  assert.deepEqual(status, ["Geschlossen", "Geschlossen", "Geöffnet", "Geschlossen", "Geschlossen"]);

  const zeiten = (await page.locator(".ap-modal .ap-list-hours").allInnerTexts()).slice(0, 5).map((s) => s.trim());
  assert.deepEqual(zeiten, [
    "Heute: 10:00–17:00",
    "Heute: 09:00–18:00 (Pause 13:00–15:00)",
    "Heute: 00:01–23:59",
    "Heute: 09:00–18:30",
    "Heute: 08:00–18:00 (Pause 12:30–14:00)",
  ]);
  await page.close();
});

test("7 — ein unbekannter Status bleibt sichtbar (fail-open) und ohne Rohwert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const fremd = {
    accessPoints: [
      { ...DPD_ACCESS_POINTS[0], name: "Fremder Status", workState: "UNBEKANNTER_SERVERWERT", distance: 0.1 },
      ...DPD_ACCESS_POINTS,
    ],
  };
  await setupRoutes(page, { accessPoints: fremd });
  await oeffneFinder(page);
  await suche(page);

  const alle = await namen(page);
  assert.equal(alle.length, 21, "der unbekannte Status darf niemanden ausblenden");
  assert.equal(alle[0], "Fremder Status", "und er steht an seiner Entfernungsposition");

  const text = await page.locator(".ap-modal").innerText();
  assert.ok(!text.includes("UNBEKANNTER_SERVERWERT"), "kein Rohwert im sichtbaren Text");
  assert.ok(text.includes("Öffnungsstatus nicht verfügbar"), "stattdessen der neutrale Satz");
  await page.close();
});

test("8 — die Zähler beschreiben die volle Antwortmenge (20), nicht eine aus workState abgeleitete Teilmenge", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  const zaehler = (await page.locator(".ap-modal-count").innerText()).trim();
  assert.equal(zaehler, "20 Paketshops");
  assert.ok(!/verfügbar|nutzbar/i.test(zaehler), `„verfügbar/nutzbar“ hat hier nichts zu suchen: ${zaehler}`);
  await page.close();
});

test("9 — auch wenn JEDER Shop workState „Geschlossen“ trägt, bleiben alle sichtbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const alleZu = { accessPoints: DPD_ACCESS_POINTS.map((s) => ({ ...s, workState: "Geschlossen" })) };
  await setupRoutes(page, { accessPoints: alleZu });
  await oeffneFinder(page);
  await suche(page);

  // Früher erzeugte genau dieser Fall einen Leerzustand. Das war der Fehler.
  assert.equal((await namen(page)).length, 20);
  assert.equal(await page.locator(".ap-modal .ap-finder-empty").count(), 0, "kein Leerzustand");
  assert.equal((await page.locator(".ap-modal-count").innerText()).trim(), "20 Paketshops");
  await page.close();
});

test("10 — kein horizontaler Überlauf und lesbare Status auf allen Zielbreiten", async () => {
  for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024], [430, 932], [390, 844], [360, 800]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await setupRoutes(page);
    await oeffneFinder(page);
    await suche(page);

    assert.ok(await noHorizontalOverflow(page), `horizontaler Überlauf bei ${w}px`);

    // „Schließt bald“ ist der längste Statustext — er darf nirgends abgeschnitten
    // werden. Geprüft wird der erste Shop mit genau diesem Status.
    const badge = page.locator(".ap-modal .ap-list-status", { hasText: "Schließt bald" }).first();
    if (await badge.count()) {
      const abgeschnitten = await badge.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      assert.ok(!abgeschnitten, `„Schließt bald“ abgeschnitten bei ${w}px`);
    }
    assert.equal((await page.locator(".ap-modal-count").innerText()).trim(), "20 Paketshops");
    await page.close();
  }
});

test("11 — UPS zeigt dieselbe Menge wie DPD: kein Carrier-Sonderfall mehr", async () => {
  // Vor PR #306 galt die Eligibility-Kürzung nur für DPD — UPS zeigte dadurch
  // mehr Shops als DPD bei identischer Antwort. Beide müssen jetzt gleich sein.
  const ups = { ...DROPOFF_TARIFF, publicCarrierId: "ups", publicCarrierName: "UPS" };
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const suchen = await setupRoutes(page, { tariff: ups });
  await oeffneFinder(page);
  await suche(page);

  assert.deepEqual(suchen[0].carrierCodes, ["ups"], "der Carrier geht korrekt raus");
  assert.equal((await page.locator(".ap-modal-count").innerText()).trim(), "20 Paketshops");
  assert.deepEqual(await namen(page), DPD_EXPECTED_SORTED);
  await page.close();
});

test("12 — das Dropdown ersetzt die Checkbox vollständig", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);

  await suche(page);
  assert.equal(await page.locator('.ap-modal input[type="checkbox"]').count(), 0,
    "der frühere Haken „Nur aktuell geöffnete Shops“ darf nicht zurückkommen");

  const optionen = await page.locator(".ap-modal #apm-opening option").allInnerTexts();
  assert.deepEqual(optionen.map((o) => o.trim()),
    ["Alle Öffnungszeiten", "Sonntags geöffnet", "Offen vor 7:30 Uhr", "Offen nach 21:00 Uhr"]);
  await page.close();
});

test("13 — die vier Optionen filtern die geladene Liste wie erwartet (auf der vollen 20er-Menge)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  await waehleFilter(page, "sunday", DPD_EXPECTED_SUNDAY.length);
  assert.deepEqual(await namen(page), DPD_EXPECTED_SUNDAY);
  assert.match(await page.locator(".ap-modal-count").innerText(), /17 weitere Paketshops/);

  await waehleFilter(page, "before_0730", DPD_EXPECTED_BEFORE_0730.length);
  assert.deepEqual(await namen(page), DPD_EXPECTED_BEFORE_0730);
  assert.match(await page.locator(".ap-modal-count").innerText(), /18 weitere Paketshops/);

  await waehleFilter(page, "after_2100", DPD_EXPECTED_AFTER_2100.length);
  assert.deepEqual(await namen(page), DPD_EXPECTED_AFTER_2100);

  await waehleFilter(page, "all", 20);
  assert.equal((await page.locator(".ap-modal-count").innerText()).trim(), "20 Paketshops");
  await page.close();
});

test("14 — „gaumenfreuden“ öffnet um exakt 07:30 und zählt damit NICHT als „vor 7:30“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  assert.ok((await namen(page)).includes("gaumenfreuden"), "ungefiltert ist der Shop da");
  await waehleFilter(page, "before_0730", DPD_EXPECTED_BEFORE_0730.length);
  assert.ok(!(await namen(page)).includes("gaumenfreuden"),
    "07:30 ist nicht VOR 07:30 — der reale Grenzfall aus dem Mitschnitt");
  await page.close();
});

test("15 — passt kein Shop zum Filter, sagt der Leerzustand genau das", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Sonntag bei allen 20 Einträgen schließen — die Antwort selbst bleibt voll.
  const ohneSonntag = {
    accessPoints: DPD_ACCESS_POINTS.map((s) => ({
      ...s,
      hoursOfOperation: s.hoursOfOperation.map((t) =>
        t.dayName === "Sonntag" ? { ...t, workingHours: "Geschlossen", workingDay: false } : t),
    })),
  };
  await setupRoutes(page, { accessPoints: ohneSonntag });
  await oeffneFinder(page);
  await suche(page);

  await page.selectOption(".ap-modal #apm-opening", "sunday");
  await page.waitForSelector(".ap-modal .ap-finder-empty", { timeout: 10000 });
  const leer = await page.locator(".ap-modal .ap-finder-empty").innerText();
  assert.match(leer, /Sonntags geöffnet/);
  assert.match(leer, /20 Paketshops/, "die Antwort war nicht leer — das muss der Text sagen");
  assert.ok(!/Keine Paketshops gefunden/.test(leer), "„gefunden“ wurden sie ja");
  await page.close();
});
