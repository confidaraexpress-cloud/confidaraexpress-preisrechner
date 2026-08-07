// E2E: Paketshop-Finder gegen echte JUMiNGO-Daten — echter Dev-Server.
//
// Grundlage ist ein im Browser mitgeschnittener DPD-Aufruf (siehe
// tests/fixtures/accessPointsDpd.mjs). Geprüft wird genau das, was eine
// Quelltextprüfung nicht erreicht:
//
//   • Was tatsächlich an die Suche geht — insbesondere `street` (der
//     Suchmittelpunkt) und `onlyOpen` als echter Boolean.
//   • Was tatsächlich im DOM steht — Reihenfolge, Entfernungen, Status und
//     Öffnungszeiten der Shops aus dem Mitschnitt.
//   • Dass die Auswahl derselben Menge entspricht wie JUMiNGOs eigene Liste:
//     die vier belegten „Geschlossen“-Einträge werden nicht angeboten, obwohl
//     zwei davon die NÄCHSTEN Treffer sind (0,579 km und 0,893 km).
//   • Dass ein unbekannter Statuswert NICHT ausblendet (fail-open) und kein
//     Rohwert sichtbar wird.
//   • Dass die Filterung NUR für den durch Messung verifizierten Carrier
//     (DPD) greift — bei jedem anderen Carrier (Test 11: UPS) bleibt dieselbe
//     Antwort vollständig sichtbar, weil dafür kein eigener Mitschnitt vorliegt.
//   • Dass die Zähler die verfügbare Menge meinen, nicht die Rohantwort.
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
  DPD_RESPONSE, DPD_ACCESS_POINTS, DPD_EXPECTED_USABLE, DPD_EXPECTED_UNAVAILABLE,
  DPD_EXPECTED_SUNDAY, DPD_EXPECTED_BEFORE_0730, DPD_EXPECTED_AFTER_2100, FREITAG,
} from "../fixtures/accessPointsDpd.mjs";

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
// `tariff` ist standardmäßig der DPD-Dropoff-Tarif; Test 11 (UPS) überschreibt
// ihn, um zu zeigen, dass die Carrier-Beschränkung tatsächlich am ausgelösten
// carrierCode hängt und nicht am Test-Setup.
async function setupRoutes(page, { accessPoints = DPD_RESPONSE, tariff = DROPOFF_TARIFF } = {}) {
  const suchen = [];
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
  await page.locator(".offer-details-link").first().click();
  await page.waitForSelector(".ap-finder", { timeout: 20000 });
}

async function suche(page) {
  await page.locator(".ap-finder-search-btn").first().click();
  await page.waitForSelector(".ap-result", { timeout: 20000 });
}

// Filter wählen und auf den fertigen Rerender warten. Ohne das Warten liest
// ein sofortiger allInnerTexts() gelegentlich in den Reconciliation-Moment
// hinein und bekommt eine leere Liste — ein Testartefakt, kein UI-Fehler.
async function waehleFilter(page, wert, erwarteteAnzahl) {
  await page.locator(".ap-finder-controls select").selectOption(wert);
  await page.waitForFunction(
    (n) => document.querySelectorAll(".ap-result").length === n,
    erwarteteAnzahl, { timeout: 10000 });
}

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

  // Die Straße kommt aus der bereits erfassten Absenderadresse — keine zweite
  // Adressquelle, kein neues Pflichtfeld.
  const strasse = page.locator('.ap-finder input[id^="ap-street"]');
  assert.equal(await strasse.count(), 1, "das Straßenfeld muss sichtbar sein");
  assert.equal(await strasse.inputValue(), ABSENDER.street, "die Straße muss vorbelegt sein");

  await suche(page);
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
  await page.locator('.ap-finder input[id^="ap-street"]').fill("");
  const btn = page.locator(".ap-finder-search-btn").first();
  assert.ok(await btn.isEnabled(), "ohne Straße muss die Suche bei DPD weiterhin möglich sein");
  await suche(page);
  assert.equal(suchen[0].street, "", "leer heißt leer — es wird nichts hinzuerfunden");
  assert.equal((await page.locator(".ap-result").count()) > 0, true);
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
  for (const wert of ["sunday", "before_0730", "after_2100", "all"]) {
    await page.selectOption(".ap-finder-controls select", wert);
    await page.waitForTimeout(120);
  }
  assert.equal(suchen.length, 1, "kein zusätzlicher Request beim Filterwechsel");

  // Wird doch erneut gesucht, ist onlyOpen weiterhin false.
  await page.locator(".ap-finder-search-btn").first().click();
  await page.waitForTimeout(300);
  assert.equal(suchen.length, 2);
  assert.equal(suchen[1].onlyOpen, false);
  await page.close();
});

test("4 — die nutzbaren Shops stehen aufsteigend nach Entfernung im DOM", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  // Kompakt fünf von zehn nutzbaren.
  const namen = await page.locator(".ap-result-name").allInnerTexts();
  assert.deepEqual(namen, DPD_EXPECTED_USABLE.slice(0, 5));
  assert.equal(namen[0], "DPD-Paketstation",
    "vorher standen hier die näheren, aber nicht nutzbaren 0,579 km und 0,893 km");

  const dist = await page.locator(".ap-result-dist").allInnerTexts();
  assert.deepEqual(dist, ["2,6 KM", "3,0 KM", "3,5 KM", "3,6 KM", "4,0 KM"]);

  await page.locator(".ap-more-btn").click();
  assert.deepEqual(await page.locator(".ap-result-name").allInnerTexts(), DPD_EXPECTED_USABLE);
  await page.close();
});

test("5 — die nicht nutzbaren Shops stehen nicht zur Auswahl", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  // Auch nach dem Ausklappen bleiben sie draußen — es gibt keinen Pfad, über
  // den ein „Geschlossen“-Shop doch noch in der Auswahl landet.
  await page.locator(".ap-more-btn").click();
  const namen = await page.locator(".ap-result-name").allInnerTexts();
  for (const n of DPD_EXPECTED_UNAVAILABLE) {
    if (DPD_EXPECTED_USABLE.includes(n)) continue; // „NKD Deutschland GmbH“ gibt es zweimal
    assert.ok(!namen.includes(n), `${n} darf nicht in der Auswahl stehen`);
  }
  const text = await page.locator(".ap-result-list").innerText();
  assert.ok(!text.includes("Geschlossen"), "kein Geschlossen-Badge in der Auswahl");
  await page.close();
});

test("6 — Status und Öffnungszeiten stehen sichtbar an jedem angebotenen Shop", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  const status = await page.locator(".ap-result-status").allInnerTexts();
  assert.deepEqual(status, ["Geöffnet", "Schließt bald", "Schließt bald", "Geöffnet", "Geöffnet"]);

  const rollen = await page.locator(".ap-result-status").evaluateAll((els) => els.map((e) => e.className));
  assert.ok(rollen[0].includes("badge--success"), "Geöffnet → Success");
  assert.ok(rollen[1].includes("badge--warning"), "Schließt bald → Warning");
  for (const k of rollen) assert.ok(/(^|\s)badge(\s|$)/.test(k), "Statusbadge trägt die Basisklasse (Punkt)");

  // Öffnungszeiten unverändert aus PR #303 — Freitag, wie die Uhr gepinnt ist.
  const zeiten = await page.locator(".ap-result-hours").allInnerTexts();
  assert.deepEqual(zeiten.map((z) => z.trim()), [
    "Heute: 00:01–23:59", "Heute: 08:30–19:30", "Heute: 10:00–19:30",
    "Heute: 00:01–23:59", "Heute: 09:00–20:00",
  ]);
  await page.close();
});

test("7 — ein unbekannter Status bleibt sichtbar (fail-open) und ohne Rohwert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const mitUnbekannt = {
    accessPoints: [
      ...DPD_RESPONSE.accessPoints,
      {
        name: "Testshop Unbekannt", street: "Teststr. 1", postCode: "73207", city: "Plochingen",
        countryCode: "DE", distance: 8.1, distanceCode: "km", workState: "temporarily_unavailable",
        hoursOfOperation: [{ dayName: "Freitag", workingHours: { unerwartet: true }, workingDay: true }],
      },
    ],
  };
  await setupRoutes(page, { accessPoints: mitUnbekannt });
  await oeffneFinder(page);
  await suche(page);
  await page.locator(".ap-more-btn").click();

  const namen = await page.locator(".ap-result-name").allInnerTexts();
  assert.ok(namen.includes("Testshop Unbekannt"),
    "ein neuer JUMiNGO-Statuswert darf keinen Shop verschwinden lassen");

  const text = await page.locator(".ap-finder").innerText();
  assert.ok(!text.includes("temporarily_unavailable"), "der Rohwert darf nicht sichtbar sein");
  assert.ok(!text.includes("[object Object]"), "kein durchgereichtes Objekt");
  assert.ok(text.includes("Öffnungsstatus nicht verfügbar"), "stattdessen ein verständlicher Hinweis");

  const titel = await page.locator('.ap-result-status[title]').first().getAttribute("title");
  assert.match(titel, /temporarily_unavailable/);
  await page.close();
});

test("8 — die Zähler beziehen sich auf die verfügbare Menge (20 roh / 10 nutzbar)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Die echte Antwort trägt die Verteilung selbst: 20 Access Points,
  // 10 nutzbar, 10 × „Geschlossen“.
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);

  assert.equal(await page.locator(".ap-result").count(), 5, "kompakt fünf von zehn");
  assert.equal((await page.locator(".ap-result-count").innerText()).trim(),
    "5 von 10 verfügbaren Paketshops · 10 weitere Paketshops derzeit nicht verfügbar");

  const mehr = page.locator(".ap-more-btn");
  assert.equal((await mehr.innerText()).trim(), "Weitere 5 Paketshops anzeigen");
  await mehr.click();
  assert.equal(await page.locator(".ap-result").count(), 10, "nie mehr als die nutzbaren");
  assert.equal((await page.locator(".ap-result-count").innerText()).trim(),
    "10 verfügbare Paketshops · 10 weitere Paketshops derzeit nicht verfügbar");
  await page.close();
});

test("9 — sind alle Treffer nicht verfügbar, sagt die Seite genau das", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const alleZu = {
    accessPoints: DPD_RESPONSE.accessPoints.map((ap) => ({ ...ap, workState: "Geschlossen" })),
  };
  await setupRoutes(page, { accessPoints: alleZu });
  await oeffneFinder(page);
  await page.locator(".ap-finder-search-btn").first().click();
  await page.waitForSelector(".ap-finder-empty", { timeout: 20000 });

  const text = (await page.locator(".ap-finder-empty").innerText()).trim();
  assert.match(text, /kein Paketshop verfügbar/);
  assert.match(text, /20 weitere Paketshops derzeit nicht verfügbar/);
  assert.ok(!/Keine Paketshops gefunden/.test(text),
    "gefunden wurden welche — nur keiner davon ist nutzbar");
  assert.equal(await page.locator(".ap-result").count(), 0);
  await page.close();
});

test("10 — kein horizontaler Überlauf und lesbare Status auf allen Zielbreiten", async () => {
  for (const breite of [1440, 1024, 768, 430, 390, 360]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 900 } });
    await setupRoutes(page);
    await oeffneFinder(page);
    await suche(page);

    assert.ok(await noHorizontalOverflow(page), `horizontaler Überlauf bei ${breite}px`);

    // „Schließt bald“ muss vollständig lesbar sein — nicht abgeschnitten, nicht
    // mit Ellipse, und innerhalb der Kartenbreite.
    const badge = page.locator(".ap-result-status").nth(1);
    assert.equal((await badge.innerText()).trim(), "Schließt bald", `Statustext bei ${breite}px`);
    const mass = await badge.evaluate((el) => {
      const karte = el.closest(".ap-result").getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return {
        clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
        drin: b.left >= karte.left - 1 && b.right <= karte.right + 1,
        ellipsis: getComputedStyle(el).textOverflow,
        hoehe: b.height,
      };
    });
    assert.ok(!mass.clipped, `Statustext ist bei ${breite}px abgeschnitten`);
    assert.ok(mass.drin, `Statusbadge ragt bei ${breite}px aus der Karte`);
    assert.notEqual(mass.ellipsis, "ellipsis", `Statustext wird bei ${breite}px gekürzt`);
    assert.ok(mass.hoehe >= 20, `Statusbadge zu flach bei ${breite}px`);

    // Die Ergebniszeile darf auf schmalen Geräten ebenfalls nicht überlaufen.
    const zeile = await page.locator(".ap-result-count").evaluate((el) => ({
      clipped: el.scrollWidth > el.clientWidth + 1,
      text: el.innerText.trim(),
    }));
    assert.ok(!zeile.clipped, `die Ergebniszeile läuft bei ${breite}px über`);
    assert.match(zeile.text, /verfügbare/, `Ergebniszeile bei ${breite}px`);
    await page.close();
  }
});

test("11 — UPS: „Geschlossen“ ist nicht verifiziert und bleibt sichtbar (Carrier-Scope)", async () => {
  // Dieselben neun Access Points wie im DPD-Referenzfall, aber die Suche läuft
  // über einen UPS-Tarif — der carrierCode, den AccessPointFinder selbst aus
  // publicCarrierId ableitet, ist damit "ups", nicht "dpd". Für UPS liegt kein
  // eigener Mitschnitt vor: die Eligibility-Stufe darf hier NICHTS entfernen,
  // die vier „Geschlossen“-Shops müssen alle da sein.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const upsTarif = {
    ...DROPOFF_TARIFF, publicCarrierId: "ups", publicCarrierName: "UPS Access Point",
  };
  const suchen = await setupRoutes(page, { tariff: upsTarif });
  await oeffneFinder(page);
  await suche(page);

  assert.deepEqual(suchen[0].carrierCodes, ["ups"],
    "die Eligibility muss denselben carrierCode sehen wie der tatsächliche Request");

  // Kompakt zunächst 5 von 9 — „von 9“, nicht „von 5“: bei UPS ist niemand
  // als nicht verfügbar aussortiert, die volle Menge ist die Auswahlmenge.
  assert.equal((await page.locator(".ap-result-count").innerText()).trim(),
    `5 von ${DPD_ACCESS_POINTS.length} verfügbaren Paketshops`);
  await page.locator(".ap-more-btn").click();
  assert.equal(await page.locator(".ap-result").count(), DPD_ACCESS_POINTS.length,
    "bei UPS bleibt die volle Menge sichtbar — keine lokale workState-Filterung");

  const namen = await page.locator(".ap-result-name").allInnerTexts();
  for (const n of DPD_EXPECTED_UNAVAILABLE) {
    assert.ok(namen.includes(n), `${n} muss bei UPS sichtbar bleiben (bei DPD wäre er es nicht)`);
  }

  // Auch die Ergebniszeile behauptet dann korrekt keine Einschränkung.
  const zeile = (await page.locator(".ap-result-count").innerText()).trim();
  assert.ok(!zeile.includes("nicht verfügbar"), "bei UPS gibt es keine als nicht verfügbar markierte Restmenge");
  await page.close();
});

test("12 — das Dropdown ersetzt die Checkbox vollständig", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);

  // Die alte Checkbox existiert nicht mehr — weder als Element noch als Text.
  assert.equal(await page.locator(".ap-finder-check").count(), 0, "keine .ap-finder-check mehr");
  assert.equal(await page.locator('.ap-finder input[type="checkbox"]').count(), 0);
  const finderText = await page.locator(".ap-finder").innerText();
  assert.ok(!finderText.includes("Nur aktuell geöffnete Shops"), "der alte Text ist verschwunden");
  assert.ok(!/aktuell geöffnet/i.test(finderText));

  // Stattdessen ein Select mit exakt vier Optionen und dem Label „Öffnungszeiten“.
  const select = page.locator(".ap-finder-controls select");
  assert.equal(await select.count(), 1);
  assert.deepEqual(await select.locator("option").allInnerTexts(), [
    "Alle Öffnungszeiten", "Sonntags geöffnet", "Offen vor 7:30 Uhr", "Offen nach 21:00 Uhr",
  ]);
  assert.equal(await select.inputValue(), "all", "Standard ist „Alle Öffnungszeiten“");
  const labelFor = await select.getAttribute("id");
  assert.equal((await page.locator(`label[for="${labelFor}"]`).innerText()).trim(), "Öffnungszeiten");
  await page.close();
});

test("13 — die vier Optionen filtern die geladene Liste wie erwartet", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);
  const select = page.locator(".ap-finder-controls select");
  const namen = async () => page.locator(".ap-result-name").allInnerTexts();
  const zeile = async () => (await page.locator(".ap-result-count").innerText()).trim();

  // Sonntags geöffnet → genau die drei Shops mit echtem Sonntagseintrag.
  await waehleFilter(page, "sunday", 3);
  assert.deepEqual(await namen(), DPD_EXPECTED_SUNDAY);
  assert.equal(await zeile(),
    "3 Paketshops mit passenden Öffnungszeiten · 7 weitere Paketshops haben andere Öffnungszeiten");
  assert.equal(await page.locator(".ap-more-btn").count(), 0, "drei passen in die kompakte Ansicht");

  // Offen vor 7:30 Uhr → nur die beiden Paketstationen (00:01).
  await waehleFilter(page, "before_0730", 2);
  assert.deepEqual(await namen(), DPD_EXPECTED_BEFORE_0730);
  assert.equal(await zeile(),
    "2 Paketshops mit passenden Öffnungszeiten · 8 weitere Paketshops haben andere Öffnungszeiten");

  // Offen nach 21:00 Uhr → dieselben beiden (23:59).
  await waehleFilter(page, "after_2100", 2);
  assert.deepEqual(await namen(), DPD_EXPECTED_AFTER_2100);

  // Zurück auf „Alle Öffnungszeiten“ — die vollständige Liste kehrt ohne
  // Neuladen und ohne neuen Request zurück.
  await waehleFilter(page, "all", 5);
  assert.deepEqual(await namen(), DPD_EXPECTED_USABLE.slice(0, 5));
  assert.equal(await zeile(),
    "5 von 10 verfügbaren Paketshops · 10 weitere Paketshops derzeit nicht verfügbar");
  await page.locator(".ap-more-btn").click();
  assert.deepEqual(await namen(), DPD_EXPECTED_USABLE, "kein Shop wurde dauerhaft gelöscht");
  await page.close();
});

test("14 — der Filterwechsel setzt die Ausklappung zurück und mischt nichts", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await oeffneFinder(page);
  await suche(page);
  const select = page.locator(".ap-finder-controls select");

  await page.locator(".ap-more-btn").click();
  assert.equal(await page.locator(".ap-result").count(), 10, "ausgeklappt");

  await waehleFilter(page, "sunday", 3);
  await waehleFilter(page, "all", 5);
  assert.equal(await page.locator(".ap-result").count(), 5,
    "nach dem Wechsel wieder kompakt — keine Reste der vorherigen Ansicht");

  // Kein Ergebnis eines anderen Filters bleibt hängen.
  await waehleFilter(page, "before_0730", 2);
  const namen = await page.locator(".ap-result-name").allInnerTexts();
  assert.equal(namen.length, 2);
  assert.ok(!namen.includes("Sonnenstudio Soleil"), "kein Rest aus dem Sonntagsfilter");
  await page.close();
});

test("15 — passt kein Shop zum Filter, sagt die Seite genau das", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Nur nutzbare Shops, aber keiner davon sonntags geöffnet.
  const ohneSonntag = {
    accessPoints: DPD_RESPONSE.accessPoints
      .filter((ap) => ap.workState !== "Geschlossen")
      .map((ap) => ({
        ...ap,
        hoursOfOperation: ap.hoursOfOperation.map((h) =>
          h.dayName === "Sonntag" ? { ...h, workingHours: "Geschlossen", workingDay: false } : h),
      })),
  };
  await setupRoutes(page, { accessPoints: ohneSonntag });
  await oeffneFinder(page);
  await suche(page);
  await waehleFilter(page, "sunday", 0);
  await page.waitForSelector(".ap-finder-empty", { timeout: 20000 });
  const text = (await page.locator(".ap-finder-empty").innerText()).trim();
  assert.match(text, /Sonntags geöffnet/, "der gewählte Filter wird benannt");
  assert.ok(!/Keine Paketshops gefunden/.test(text), "gefunden wurden welche — sie passen nur nicht");
  assert.match(text, /Alle Öffnungszeiten/, "der Weg zurück steht dabei");
  assert.equal(await page.locator(".ap-result").count(), 0);

  // Und zurück auf „Alle“ ist alles wieder da.
  await waehleFilter(page, "all", 5);
  assert.equal(await page.locator(".ap-result").count(), 5);
  await page.close();
});
