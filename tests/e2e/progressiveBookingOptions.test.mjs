// E2E: Zusätzliche Optionen als Progressive Disclosure — echter Dev-Server.
//
// Referenznummer und Labelformat stehen im Grundzustand nur als Schalterzeile;
// die Detailfelder erscheinen erst nach dem Einschalten. Die beiden Optionen
// verhalten sich beim AUSSCHALTEN bewusst UNTERSCHIEDLICH:
//
//   • Referenznummer — die Eingabe bleibt stehen (versehentliches Ausschalten
//     vernichtet nichts), sie wird aber nicht gebucht.
//   • Labelformat — A4 ist ein aktiv gesendeter Wert. „Format ändern" aus
//     heißt deshalb, dass wirklich wieder A4 gilt.
//
// Geprüft wird, was eine Quelltextprüfung nicht erreicht: was tatsächlich
// sichtbar ist, was die Tastatur bewirkt und was am Ende wirklich im
// /book-Payload steht.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5246, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const TARIFF = {
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dhl", publicCarrierName: "DHL Express",
  publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
  netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19, transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-08-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-08-08T00:00:00Z",
};

const REF_TOGGLE   = "#booking-reference-toggle";
const FMT_TOGGLE   = "#booking-labelformat-toggle";
const REF_INPUT    = "#booking-reference";

let server, browser;

async function setupRoutes(page) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    // Legal-Buchungsschranke (Go-Live Paket 4-B): `enabled:false` ist die
    // Antwort eines Servers mit ABGESCHALTETER Schranke — der heutige
    // Produktivzustand. Ohne diese Antwort liefe der Mock in den Sammelfall
    // `200 {}`; `parseBookingContext` wertet das fail-closed als `error` und
    // sperrt die Bestellung. Das ist richtiges Produktverhalten und darf nicht
    // aufgeweicht werden — die Suite muss den Endpunkt schlicht beantworten.
    // Beide Zustände der Schranke prüft `legalBookingGate.test.mjs`.
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", tariffs: [TARIFF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

// Die Eingaben von Schalter und Auswahlkarten sind visuell versteckt (dasselbe
// Muster wie .labelfmt-card/.ins-card im übrigen Projekt) — bedient wird über
// ihr Label, genau wie ein Mensch es tut. Playwrights check() greift auf einer
// 0×0-Eingabe bewusst nicht.
async function schalte(page, sel, an) {
  const input = page.locator(sel);
  if ((await input.isChecked()) === an) return;
  await input.locator("xpath=ancestor::label[1]").click();
  assert.equal(await input.isChecked(), an, `Schalter ${sel} ließ sich nicht auf ${an} setzen`);
}

async function waehleFormat(page, name) {
  await page.locator(`.labelfmt-card:has-text("${name}")`).click();
  assert.match(await page.locator(".labelfmt-card--selected").innerText(), new RegExp(name));
}

// Bis Schritt 1 der Buchung (dort stehen die Zusätzlichen Optionen).
async function zurBuchung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(REF_TOGGLE, { timeout: 20000 });
}

// Buchung bis zum /book-Request durchspielen und dessen Payload zurückgeben.
async function bucheUndLiesPayload(page) {
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  let payload = null;
  await page.route("**/api/jumingo/book**", async (route) => {
    payload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ shipmentId: "s1", trackingNumber: "TRACK1", labelUrl: null }),
    });
  });
  // Die beiden Bestätigungen (AGB, Gefahrgut) sind echte Kontrollkästchen; die
  // Schalter tragen role="switch" und werden von dieser Rolle nicht erfasst.
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForTimeout(1200);
  assert.ok(payload, "der /book-Request muss abgesetzt worden sein");
  return payload;
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

/* ══════════ Szenario A — Grundzustand ══════════ */

test("1 — im Grundzustand sind beide Schalter aus und beide Detailbereiche verborgen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  // Der Bereichstitel bleibt bestehen.
  assert.match(await page.locator(".addopt-panel").innerText(), /Zusätzliche Optionen/);
  assert.equal(await page.locator(REF_TOGGLE).isChecked(), false, "der Referenzschalter muss aus sein");
  assert.equal(await page.locator(FMT_TOGGLE).isChecked(), false, "der Formatschalter muss aus sein");
  assert.equal(await page.locator(REF_INPUT).count(), 0, "das Referenzfeld darf nicht sichtbar sein");
  assert.equal(await page.locator(".labelfmt-card").count(), 0, "die A4/A6-Auswahl darf nicht sichtbar sein");
  // Und das aktive Format steht trotzdem dran — „aus" heißt nicht „kein Format".
  assert.match(await page.locator(".addopt-panel").innerText(), /Aktuell: DIN A4/);
  await page.close();
});

/* ══════════ Referenznummer ══════════ */

test("2 — Einschalten zeigt das Feld, Ausschalten verbirgt es wieder", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, REF_TOGGLE, true);
  await assert.ok(await page.locator(REF_INPUT).isVisible(), "das Feld muss nach dem Einschalten erscheinen");
  // Grenzen und Texte unverändert.
  assert.equal(await page.locator(REF_INPUT).getAttribute("maxlength"), "35");
  assert.match(await page.locator(".addopt-panel").innerText(), /Max\. 35 Zeichen/);

  await schalte(page, REF_TOGGLE, false);
  assert.equal(await page.locator(REF_INPUT).count(), 0, "das Feld muss wieder verschwinden");
  await page.close();
});

test("3 — der eingegebene Wert überlebt Aus- und Wiedereinschalten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, REF_TOGGLE, true);
  await page.locator(REF_INPUT).fill("ABC-123");
  await schalte(page, REF_TOGGLE, false);
  await schalte(page, REF_TOGGLE, true);
  assert.equal(await page.locator(REF_INPUT).inputValue(), "ABC-123",
    "versehentliches Ausschalten darf die Eingabe nicht vernichten");
  await page.close();
});

test("4 — der Schalter ist per Tastatur bedienbar und zeigt einen sichtbaren Fokus", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  const schalter = page.locator(REF_TOGGLE);
  await schalter.focus();
  assert.ok(await schalter.evaluate((el) => el === document.activeElement), "der Schalter muss fokussierbar sein");
  // role=switch → Space schaltet, wie bei einem Kontrollkästchen.
  await page.keyboard.press(" ");
  assert.equal(await schalter.isChecked(), true, "Leertaste muss einschalten");
  await assert.ok(await page.locator(REF_INPUT).isVisible(), "der Detailbereich muss danach offen sein");
  await page.keyboard.press(" ");
  assert.equal(await schalter.isChecked(), false, "Leertaste muss wieder ausschalten");

  // Der Fokusring liegt auf der sichtbaren Spur (die Eingabe selbst ist versteckt).
  const umriss = await page.locator(`${REF_TOGGLE} ~ .ce-switch-track`)
    .evaluate((el) => getComputedStyle(el).outlineStyle);
  assert.equal(umriss, "solid", "der Fokus muss sichtbar sein");
  await page.close();
});

test("5 — der Klick auf den Text schaltet mit (Label ist Bedienfläche)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await page.getByText("Eigene Referenznummer hinzufügen").click();
  assert.equal(await page.locator(REF_TOGGLE).isChecked(), true);
  await page.close();
});

/* ══════════ Labelformat ══════════ */

test("6 — die Aktuell-Anzeige folgt der Auswahl", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, FMT_TOGGLE, true);
  assert.equal(await page.locator(".labelfmt-card").count(), 2, "beide Formate müssen erscheinen");
  assert.match(await page.locator(".addopt-panel").innerText(), /Aktuell: DIN A4/,
    "vor der Auswahl gilt weiterhin der Standard");

  await waehleFormat(page, "DIN A6");
  assert.match(await page.locator(".addopt-panel").innerText(), /Aktuell: DIN A6/,
    "die Anzeige muss der Auswahl sofort folgen");
  await page.close();
});

test("7 — Ausschalten setzt das Format zurück auf DIN A4 (Szenario D)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, FMT_TOGGLE, true);
  await waehleFormat(page, "DIN A6");
  await schalte(page, FMT_TOGGLE, false);

  assert.equal(await page.locator(".labelfmt-card").count(), 0, "die Auswahl muss verschwinden");
  assert.match(await page.locator(".addopt-panel").innerText(), /Aktuell: DIN A4/,
    "„Format ändern“ aus muss wieder den Standard bedeuten");
  // Und beim erneuten Aktivieren steht A4 vorausgewählt — kein verstecktes A6.
  await schalte(page, FMT_TOGGLE, true);
  const gewaehlt = await page.locator(".labelfmt-card--selected").innerText();
  assert.match(gewaehlt, /DIN A4/, "nach dem Zurücksetzen muss A4 die Auswahl sein");
  await page.close();
});

/* ══════════ Payload (Szenario B und C) ══════════ */

test("8 — beide Optionen aus: kein referenceNumber, labelFormat A4 (Szenario A)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);
  const payload = await bucheUndLiesPayload(page);

  assert.ok(!("referenceNumber" in payload), "ohne aktive Option darf kein Referenzfeld mitgehen");
  assert.equal(payload.labelFormat, "A4", "der Standard muss weiterhin gesendet werden");
  await page.close();
});

test("9 — beide Optionen an: Wert und A6 landen im Payload (Szenario B)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, REF_TOGGLE, true);
  await page.locator(REF_INPUT).fill("REF-123");
  await schalte(page, FMT_TOGGLE, true);
  await waehleFormat(page, "DIN A6");

  const payload = await bucheUndLiesPayload(page);
  assert.equal(payload.referenceNumber, "REF-123");
  assert.equal(payload.labelFormat, "A6");
  await page.close();
});

test("10 — Referenz eingegeben und wieder ausgeschaltet: nicht gebucht (Szenario C)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, REF_TOGGLE, true);
  await page.locator(REF_INPUT).fill("REF-STORNO");
  await schalte(page, REF_TOGGLE, false);

  const payload = await bucheUndLiesPayload(page);
  assert.ok(!("referenceNumber" in payload),
    `der ausgeschaltete Wert darf nicht gebucht werden: ${JSON.stringify(payload.referenceNumber)}`);
  await page.close();
});

test("11 — an, aber leer gelassen: kein leeres Referenzfeld im Payload", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, REF_TOGGLE, true);     // eingeschaltet, nichts eingetragen
  const payload = await bucheUndLiesPayload(page);
  assert.ok(!("referenceNumber" in payload), "ein leeres Feld darf kein Payload-Feld erzeugen");
  await page.close();
});

test("12 — A6 gewählt, dann Schalter aus: es wird A4 gebucht (Szenario D)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, FMT_TOGGLE, true);
  await waehleFormat(page, "DIN A6");
  await schalte(page, FMT_TOGGLE, false);

  const payload = await bucheUndLiesPayload(page);
  assert.equal(payload.labelFormat, "A4", "ausgeschaltet darf kein A6 unsichtbar mitgebucht werden");
  await page.close();
});

/* ══════════ Wiederherstellung ══════════ */

test("13 — gespeicherte Werte öffnen ihren Bereich wieder (Zurücknavigation)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  // Beide Optionen setzen …
  await schalte(page, REF_TOGGLE, true);
  await page.locator(REF_INPUT).fill("REF-123");
  await schalte(page, FMT_TOGGLE, true);
  await waehleFormat(page, "DIN A6");
  await page.waitForTimeout(300);

  // … zurück zu den Angeboten und erneut in die Buchung (der Vorgang lebt in
  // sessionStorage; die Buchungsseite wird dabei wirklich neu gemountet).
  await page.getByRole("button", { name: /Zurück/ }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(REF_TOGGLE, { timeout: 20000 });

  assert.equal(await page.locator(REF_TOGGLE).isChecked(), true, "die gespeicherte Referenz muss ihren Schalter öffnen");
  assert.equal(await page.locator(REF_INPUT).inputValue(), "REF-123", "der Wert darf nicht unsichtbar verloren gehen");
  assert.equal(await page.locator(FMT_TOGGLE).isChecked(), true, "gespeichertes A6 muss seinen Schalter öffnen");
  assert.match(await page.locator(".labelfmt-card--selected").innerText(), /DIN A6/);
  assert.match(await page.locator(".addopt-panel").innerText(), /Aktuell: DIN A6/);
  await page.close();
});

test("14 — eine ausgeschaltete Referenz bleibt nach der Rückkehr ausgeschaltet", async () => {
  // Sonst stünde ein bewusst geschlossener Bereich wieder offen — und der Wert
  // wäre unbemerkt wieder buchbar.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, REF_TOGGLE, true);
  await page.locator(REF_INPUT).fill("REF-WEG");
  await schalte(page, REF_TOGGLE, false);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: /Zurück/ }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(REF_TOGGLE, { timeout: 20000 });

  assert.equal(await page.locator(REF_TOGGLE).isChecked(), false);
  assert.equal(await page.locator(REF_INPUT).count(), 0);
  await page.close();
});

/* ══════════ Responsive ══════════ */

test("15 — auf allen Zielbreiten ohne Überlauf und ohne Gedränge bedienbar", async () => {
  for (const [w, h] of [[1440, 1000], [1280, 900], [1024, 900], [768, 1024], [430, 932], [390, 844], [360, 800]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await setupRoutes(page);
    await zurBuchung(page);

    const keinUeberlauf = () => page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    assert.ok(await keinUeberlauf(), `horizontaler Überlauf im Grundzustand bei ${w}px`);

    // Trefferfläche: unter 860px muss die Zeile 44px hoch sein (WCAG 2.5.5).
    const zeile = await page.locator(REF_TOGGLE).locator("xpath=ancestor::label[1]").boundingBox();
    if (w <= 860) assert.ok(zeile.height >= 44, `Schalterzeile nur ${zeile.height}px hoch bei ${w}px`);

    // Aufgeklappt: beide Bereiche gleichzeitig, weiterhin kein Überlauf.
    await schalte(page, REF_TOGGLE, true);
    await schalte(page, FMT_TOGGLE, true);
    await page.locator(REF_INPUT).fill("REF-123456789");
    assert.ok(await keinUeberlauf(), `horizontaler Überlauf aufgeklappt bei ${w}px`);
    assert.ok(await page.locator(REF_INPUT).isVisible());
    assert.equal(await page.locator(".labelfmt-card").count(), 2);
    await page.close();
  }
});
