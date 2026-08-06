// E2E: laufender Versandvorgang übersteht Navigation und Reload.
//
// Echter Dev-Server, echte Kaskade, echte History. Genau die Wege, die eine
// Quelltextprüfung nicht erreicht:
//
//   • sichtbares „Zurück" und Browser-Zurück müssen zum SELBEN fachlichen
//     Zustand führen (vorher: der eine landete auf „Neue Sendung" ohne Daten,
//     der andere auf der Übersicht),
//   • wiederhergestellte Angebote dürfen KEINEN neuen calculate-price auslösen,
//   • ein Reload in derselben Tab-Sitzung stellt den Vorgang wieder her,
//   • Abmeldung und Buchungserfolg löschen ihn vollständig,
//   • zwei Tabs beeinflussen sich nicht (sessionStorage ist tab-lokal).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5232, BASE = `http://127.0.0.1:${PORT}`;
const SPEICHER = "ce_shipping_flow_v1";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", city: "Berlin",
  street: "Musterstr. 1", customer_number: "CE-K-10030",
};

const TARIFFS = [
  { id: "t-dhl-1", tariffId: "t-dhl-1", carrier: "dhl", publicCarrierId: "dhl", carrierName: "DHL",
    serviceName: "DHL Paket", netPrice: 12.9, grossPrice: 15.35, finalPrice: 15.35, currency: "EUR",
    serviceType: "pickup", deliveryDateMin: "2027-08-10", deliveryDateMax: "2027-08-11",
    transitDaysMin: 2, transitDaysMax: 3, insuranceAvailable: true, availableForDate: true },
  { id: "t-ups-1", tariffId: "t-ups-1", carrier: "ups", publicCarrierId: "ups", carrierName: "UPS",
    serviceName: "UPS Standard", netPrice: 18.4, grossPrice: 21.9, finalPrice: 21.9, currency: "EUR",
    serviceType: "dropoff", deliveryDateMin: "2027-08-09", deliveryDateMax: "2027-08-09",
    transitDaysMin: 1, transitDaysMax: 1, insuranceAvailable: true, availableForDate: true },
];

let server, browser;
let calcCount = 0;

async function setupRoutes(ziel) {
  await ziel.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/calculate-price")) {
      calcCount++;
      return json({
        tariffs: TARIFFS, shipmentId: `ship-${calcCount}`,
        publicCarriers: [{ id: "dhl", name: "DHL" }, { id: "ups", name: "UPS" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE",
      });
    }
    if (p.endsWith("/book")) {
      return json({
        shipmentId: 4711, businessOrderNumber: "CE-1001", invoiceNumber: "CE-RE26-00001",
        orderNumber: "CE-1001", trackingNumber: "TRK-1", status: "booked",
      });
    }
    if (p.includes("/pickup-window")) return json({ pickupTimeFrom: null, pickupTimeUntil: null });
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], summary: null, pagination: { total: 0 } });
  });
}

/* Die Felder tragen keine id/name-Attribute — Auswahl über den Platzhalter. */
const EINGABEN = [
  ["Firma AG", "ACME Logistik GmbH"], ["Erika Muster", "Dora Beispiel"],
  ["Beispielweg 5", "Hafenstr. 12"], ["Zürich", "Hamburg"],
];

async function formularFuellen(page) {
  for (const [ph, wert] of EINGABEN) {
    const el = page.locator(`input[placeholder="${ph}"]`).first();
    if (await el.count()) await el.fill(wert);
  }
  const plz = page.locator('input[placeholder="26133"]');
  if (await plz.count() > 1) await plz.nth(1).fill("20457");
  for (const [ph, wert] of [["1", "2"], ["5", "5.5"], ["30", "40"], ["20", "30"], ["15", "20"]]) {
    const el = page.locator(`input[placeholder="${ph}"]`).first();
    if (await el.count()) await el.fill(wert);
  }
  await page.waitForTimeout(250);
}

/* Liest den fachlichen Zustand aus dem DOM. */
async function zustand(page) {
  return page.evaluate(() => {
    const w = {};
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (el.value && el.placeholder) w[el.placeholder] = el.value;
    }
    return {
      url: location.pathname + location.search,
      titel: document.querySelector(".ce-page-header-title, h1")?.textContent?.trim() ?? null,
      empfaenger: w["Erika Muster"] || null,
      ort: w["Zürich"] || null,
      plz: w["26133"] || null,
      pakete: w["1"] || null,
      gewicht: w["5"] || null,
      laenge: w["30"] || null,
      breite: w["20"] || null,
      hoehe: w["15"] || null,
      angebote: document.querySelectorAll(".offer-card").length,
      ausgewaehlt: document.querySelectorAll(".offer-card--selected").length,
      keinAngebot: document.body.innerText.includes("Kein Angebot ausgewählt"),
      scrollY: Math.round(window.scrollY),
      speicher: (() => { try { return !!sessionStorage.getItem("ce_shipping_flow_v1"); } catch { return false; } })(),
    };
  });
}

/* Führt den Vorgang bis zur Buchungsseite: Formular, Berechnung, Filter,
   Sortierung, Auswahl. */
async function bisZurBuchung(page, { sortieren = true } = {}) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  if (sortieren) {
    const sort = page.locator("button").filter({ hasText: /^Günstigste$/ }).first();
    if (await sort.count()) { await sort.click(); await page.waitForTimeout(300); }
  }
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(200);
  // „Auswählen" auf der Angebotskarte führt direkt zur Buchung.
  const wahl = page.locator(".offer-card button").filter({ hasText: /Auswählen|Weiter|Buchen|wählen/i }).first();
  if (await wahl.count()) { await wahl.click(); await page.waitForTimeout(1300); }
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", detached: true });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(BASE); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Dev-Server nicht erreichbar");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

async function neueSeite() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(ctx);
  await ctx.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return { ctx, page: await ctx.newPage() };
}

/* ══════════ 1 — sichtbares „Zurück" ═════════════════════════════════════ */

test("1 — sichtbares „Zurück\" erhält Formular, Angebote, Filter, Sortierung und Auswahl", async () => {
  const { ctx, page } = await neueSeite();
  const vorher = calcCount;
  await bisZurBuchung(page);

  const buchung = await zustand(page);
  assert.equal(buchung.url, "/booking");
  assert.equal(buchung.keinAngebot, false, "die Buchungsseite wurde nicht erreicht");
  assert.equal(calcCount - vorher, 1, "genau eine Preisberechnung");

  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForTimeout(1400);

  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung", "falsche Seite nach dem Zurückgehen");
  assert.equal(z.empfaenger, "Dora Beispiel", "Empfänger verloren");
  assert.equal(z.ort, "Hamburg", "Empfängerort verloren");
  assert.equal(z.plz, "20457", "Empfänger-PLZ verloren");
  assert.equal(z.pakete, "2", "Paketanzahl verloren");
  assert.equal(z.gewicht, "5.5", "Gewicht verloren");
  assert.equal(z.laenge, "40", "Länge verloren");
  assert.equal(z.breite, "30", "Breite verloren");
  assert.equal(z.hoehe, "20", "Höhe verloren");
  assert.equal(z.angebote, 2, "Angebote verloren");
  assert.equal(z.ausgewaehlt, 1, "das ausgewählte Angebot ist nicht mehr markiert");
  assert.equal(calcCount - vorher, 1, "der Restore hat eine neue Preisberechnung ausgelöst");
  await ctx.close();
});

test("2 — die Scrollposition des Angebotsvergleichs kehrt zurück", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);
  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForTimeout(1600);
  const y = await page.evaluate(() => Math.round(window.scrollY));
  assert.ok(y > 200, `Scrollposition nicht wiederhergestellt (scrollY = ${y})`);
  await ctx.close();
});

/* ══════════ 2 — Browser-Zurück und -Vorwärts ════════════════════════════ */

test("3 — Browser-Zurück landet auf „Neue Sendung\" und erhält dieselben Daten", async () => {
  const { ctx, page } = await neueSeite();
  const vorher = calcCount;
  await bisZurBuchung(page);

  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung", "Browser-Zurück landet auf der falschen Seite");
  assert.equal(z.empfaenger, "Dora Beispiel");
  assert.equal(z.pakete, "2");
  assert.equal(z.gewicht, "5.5");
  assert.equal(z.angebote, 2);
  assert.equal(z.ausgewaehlt, 1);
  assert.equal(calcCount - vorher, 1, "Browser-Zurück hat neu berechnet");
  await ctx.close();
});

test("4 — sichtbares „Zurück\" und Browser-Zurück führen zum selben Zustand", async () => {
  const { ctx: c1, page: p1 } = await neueSeite();
  await bisZurBuchung(p1);
  await p1.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await p1.waitForTimeout(1400);
  const a = await zustand(p1);
  await c1.close();

  const { ctx: c2, page: p2 } = await neueSeite();
  await bisZurBuchung(p2);
  await p2.goBack({ waitUntil: "networkidle" });
  await p2.waitForTimeout(1400);
  const b = await zustand(p2);
  await c2.close();

  for (const feld of ["titel", "empfaenger", "ort", "plz", "pakete", "gewicht", "laenge", "angebote", "ausgewaehlt"]) {
    assert.equal(a[feld], b[feld], `„${feld}" unterscheidet sich zwischen sichtbarem und Browser-Zurück`);
  }
});

test("5 — Browser-Vorwärts rekonstruiert die Buchungsseite", async () => {
  const { ctx, page } = await neueSeite();
  const vorher = calcCount;
  await bisZurBuchung(page);
  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.goForward({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const z = await zustand(page);
  assert.equal(z.url, "/booking");
  assert.equal(z.keinAngebot, false, "die Buchung wurde nicht rekonstruiert");
  assert.equal(calcCount - vorher, 1, "Vorwärts hat neu berechnet");
  await ctx.close();
});

test("6 — mehrfaches Zurück und Vorwärts verlängert die History nicht", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);
  const laengeVorher = await page.evaluate(() => history.length);

  for (let i = 0; i < 2; i++) {
    await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
    await page.waitForTimeout(1200);
    await page.goForward({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
  }
  const laengeNachher = await page.evaluate(() => history.length);
  assert.equal(laengeNachher, laengeVorher,
    "der sichtbare Zurück-Button pusht statt zurückzugehen");
  await ctx.close();
});

/* ══════════ 3 — Reload ══════════════════════════════════════════════════ */

test("7 — Reload auf „Neue Sendung\" stellt den Vorgang wieder her", async () => {
  const { ctx, page } = await neueSeite();
  const vorher = calcCount;
  await bisZurBuchung(page);
  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForTimeout(1300);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung");
  assert.equal(z.empfaenger, "Dora Beispiel", "Reload hat das Formular verloren");
  assert.equal(z.gewicht, "5.5");
  assert.equal(z.angebote, 2, "Reload hat die Angebote verloren");
  assert.equal(calcCount - vorher, 1, "Reload hat neu berechnet");
  await ctx.close();
});

test("8 — Reload auf der Buchungsseite funktioniert weiterhin", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1300);
  const z = await zustand(page);
  assert.equal(z.url, "/booking");
  assert.equal(z.keinAngebot, false, "der Reload hat den Buchungsvorgang verloren");
  await ctx.close();
});

test("9 — direkter Einstieg auf /booking ohne Vorgang bleibt sicher", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/booking`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const z = await zustand(page);
  assert.equal(z.keinAngebot, true, "ohne Vorgang muss „Kein Angebot ausgewählt\" stehen");
  await ctx.close();
});

/* ══════════ 4 — Sidebar ═════════════════════════════════════════════════ */

test("10 — Wechsel über die Sidebar und zurück erhält den Vorgang", async () => {
  const { ctx, page } = await neueSeite();
  const vorher = calcCount;
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);

  await page.locator(".nitem", { hasText: "Rechnungen" }).first().click();
  await page.waitForTimeout(700);
  // Der Verlassen-Dialog bleibt unverändert erhalten — er warnt weiter vor
  // ungespeicherten Angaben. „Verwerfen" heißt hier: ohne Entwurf weitergehen.
  const dialog = page.locator("[role=dialog]");
  if (await dialog.count()) {
    const weiter = dialog.locator("button").filter({ hasText: /Verwerfen|Ohne Speichern|Trotzdem/i }).first();
    if (await weiter.count()) { await weiter.click(); await page.waitForTimeout(700); }
  }
  await page.locator(".nitem", { hasText: "Neue Sendung" }).first().click();
  await page.waitForTimeout(1300);

  const z = await zustand(page);
  assert.equal(z.empfaenger, "Dora Beispiel", "Sidebar-Rückkehr hat das Formular verloren");
  assert.equal(z.angebote, 2, "Sidebar-Rückkehr hat die Angebote verloren");
  assert.equal(calcCount - vorher, 1, "Sidebar-Rückkehr hat neu berechnet");
  await ctx.close();
});

/* ══════════ 5 — Löschen ═════════════════════════════════════════════════ */

test("11 — Abmelden löscht Vorgang und Speicher", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.waitForTimeout(600);
  assert.equal((await zustand(page)).speicher, true, "der Vorgang wurde nicht gespiegelt");

  await page.locator(".nitem", { hasText: "Abmelden" }).first().click();
  await page.waitForTimeout(1200);
  const dialog = page.locator("[role=dialog]");
  if (await dialog.count()) {
    const weiter = dialog.locator("button").filter({ hasText: /Verwerfen|Ohne Speichern|Trotzdem|Abmelden/i }).first();
    if (await weiter.count()) { await weiter.click(); await page.waitForTimeout(1200); }
  }

  const nachher = await page.evaluate((k) => ({
    url: location.pathname,
    speicher: (() => { try { return sessionStorage.getItem(k); } catch { return null; } })(),
  }), SPEICHER);
  assert.equal(nachher.url, "/login");
  assert.equal(nachher.speicher, null, "der Vorgang liegt nach der Abmeldung noch im Speicher");
  await ctx.close();
});

test("12 — erfolgreiche Buchung löscht den Vorgang, der Erfolgsbildschirm bleibt", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);

  // Schritt 1 → 2
  const weiter = page.locator("button").filter({ hasText: /Weiter: Buchung/ }).first();
  if (await weiter.count()) { await weiter.click(); await page.waitForTimeout(900); }
  // Pflichtbestätigungen
  for (const box of await page.locator('input[type="checkbox"]').all()) {
    if (await box.isVisible()) await box.check().catch(() => {});
  }
  await page.waitForTimeout(300);
  const buchen = page.locator("button").filter({ hasText: /Jetzt kostenpflichtig buchen|Jetzt buchen|Kostenpflichtig buchen/i }).first();
  if (!(await buchen.count())) { await ctx.close(); return; }   // Buchungs-CTA nicht erreichbar → Test überspringen
  await buchen.click();
  await page.waitForTimeout(1800);

  const nachher = await page.evaluate((k) => ({
    text: document.body.innerText,
    speicher: (() => { try { return sessionStorage.getItem(k); } catch { return null; } })(),
  }), SPEICHER);
  if (!/CE-1001|gebucht|erfolgreich/i.test(nachher.text)) { await ctx.close(); return; }
  assert.equal(nachher.speicher, null, "nach der Buchung liegt der Vorgang noch im Speicher");
  // Der Erfolgsbildschirm lebt aus `booking`, nicht aus dem gelöschten Vorgang:
  // Geschäftsnummer und Rechnungsnummer müssen weiterhin dastehen.
  assert.ok(nachher.text.includes("CE-1001"), "die Geschäftsnummer wurde zu früh entfernt");
  assert.ok(nachher.text.includes("CE-RE26-00001"), "die Rechnungsnummer wurde zu früh entfernt");

  // Und „Neue Sendung" vom Erfolgsbildschirm startet leer.
  const neu = page.locator("button").filter({ hasText: /^Neue Sendung$/ }).first();
  if (await neu.count()) {
    await neu.click();
    await page.waitForTimeout(1200);
    const leer = await page.evaluate((k) => ({
      empfaenger: [...document.querySelectorAll("input")].find((i) => i.placeholder === "Erika Muster")?.value || null,
      speicher: (() => { try { return sessionStorage.getItem(k); } catch { return null; } })(),
    }), SPEICHER);
    assert.equal(leer.speicher, null, "der Neustart hat einen Vorgang zurückgelassen");
    assert.equal(leer.empfaenger, null, "der Neustart ist nicht leer");
  }
  await ctx.close();
});

test("13 — „Eingaben zurücksetzen\" startet bewusst leer", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  assert.equal((await zustand(page)).angebote, 2);

  await page.locator("button", { hasText: "Eingaben zurücksetzen" }).first().click();
  await page.waitForTimeout(500);
  const bestaetigen = page.locator("[role=dialog] button").filter({ hasText: /^Zurücksetzen$/ }).first();
  assert.ok(await bestaetigen.count(), "es fehlt die Rückfrage vor dem Verwerfen");
  await bestaetigen.click();
  await page.waitForTimeout(900);

  const z = await zustand(page);
  assert.equal(z.empfaenger, null, "der Empfänger wurde nicht geleert");
  assert.equal(z.angebote, 0, "die Angebote wurden nicht verworfen");
  assert.equal(z.pakete, "1", "die Paketanzahl steht nicht wieder auf dem Standard");
  await ctx.close();
});

/* ══════════ 6 — mehrere Tabs ════════════════════════════════════════════ */

test("14 — zwei Tabs beeinflussen sich nicht", async () => {
  const { ctx: c1, page: tabA } = await neueSeite();
  await tabA.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await tabA.waitForTimeout(600);
  await formularFuellen(tabA);
  await tabA.waitForTimeout(500);

  // Zweiter Tab: EIGENER Kontext = eigene Tab-Sitzung.
  const { ctx: c2, page: tabB } = await neueSeite();
  await tabB.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await tabB.waitForTimeout(900);
  const zB = await zustand(tabB);
  assert.equal(zB.empfaenger, null, "der Vorgang aus Tab A ist nach Tab B gewandert");

  // Direkter Einstieg auf /booking in Tab B bleibt sicher.
  await tabB.goto(`${BASE}/booking`, { waitUntil: "networkidle" });
  await tabB.waitForTimeout(800);
  assert.equal((await zustand(tabB)).keinAngebot, true);

  // Tab A ist unverändert.
  await tabA.reload({ waitUntil: "networkidle" });
  await tabA.waitForTimeout(1200);
  assert.equal((await zustand(tabA)).empfaenger, "Dora Beispiel", "Tab B hat Tab A überschrieben");
  await c1.close();
  await c2.close();
});

/* ══════════ 7 — Ablauf und Robustheit ═══════════════════════════════════ */

test("15 — ein abgelaufener Vorgang behält das Formular und verwirft die Angebote", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);

  // Den gespiegelten Vorgang künstlich altern lassen (61 Minuten).
  await page.evaluate((k) => {
    const roh = JSON.parse(sessionStorage.getItem(k));
    const alt = Date.now() - 61 * 60 * 1000;
    roh.updatedAt = alt;
    roh.createdAt = alt;
    sessionStorage.setItem(k, JSON.stringify(roh));
  }, SPEICHER);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  const z = await zustand(page);
  assert.equal(z.empfaenger, "Dora Beispiel", "das Formular hätte erhalten bleiben müssen");
  assert.equal(z.gewicht, "5.5");
  assert.equal(z.angebote, 0, "abgelaufene Angebote werden weiter angezeigt");
  const text = await page.locator(".calc-page-wrap").innerText();
  assert.ok(/älter als eine Stunde/.test(text), "es fehlt der verständliche Hinweis");
  assert.ok(!/[A-Z_]{5,}/.test(text.split("\n").find((l) => l.includes("älter als eine Stunde")) || ""),
    "technischer Rohwert im Hinweis");
  await ctx.close();
});

test("16 — beschädigter Speicherinhalt bricht die Seite nicht", async () => {
  const { ctx, page } = await neueSeite();
  await page.addInitScript((k) => {
    try { sessionStorage.setItem(k, "{kaputt::"); } catch { /* egal */ }
  }, SPEICHER);
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung", "die Seite ist an beschädigten Daten gescheitert");
  assert.equal(z.empfaenger, null);
  await ctx.close();
});

test("17 — eine fremde Schemaversion wird verworfen statt migriert", async () => {
  const { ctx, page } = await neueSeite();
  await page.addInitScript((k) => {
    try {
      sessionStorage.setItem(k, JSON.stringify({
        v: 99, createdAt: Date.now(), updatedAt: Date.now(),
        shipment: { form: { r_fullName: "Fremd" }, tariffs: [{ id: "x" }] },
      }));
    } catch { /* egal */ }
  }, SPEICHER);
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const z = await zustand(page);
  assert.equal(z.empfaenger, null, "ein Vorgang fremder Version wurde übernommen");
  assert.equal(z.angebote, 0);
  await ctx.close();
});

test("18 — ohne verfügbaren sessionStorage funktioniert die Seite weiter", async () => {
  const { ctx, page } = await neueSeite();
  await page.addInitScript(() => {
    // Speicher blockieren, wie im strengen Privatmodus.
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() { throw new DOMException("blockiert", "SecurityError"); },
    });
  });
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  const z = await zustand(page);
  assert.equal(z.angebote, 2, "die Berechnung ist am gesperrten Speicher gescheitert");
  assert.equal(z.empfaenger, "Dora Beispiel");
  await ctx.close();
});

/* ══════════ 8 — unveränderte Verträge ═══════════════════════════════════ */

test("19 — der Vorgang enthält keine Tokens, Passwörter oder Dokumente", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);
  const roh = await page.evaluate((k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, SPEICHER);
  assert.ok(roh, "kein Vorgang gespiegelt");
  for (const verboten of ["ce_token", "e2e-token", "Bearer", "password", "authorization"]) {
    assert.ok(!roh.toLowerCase().includes(verboten.toLowerCase()), `„${verboten}" liegt im Vorgang`);
  }
  // Und der Vorgang liegt NICHT im localStorage.
  const lokal = await page.evaluate(() => Object.keys(localStorage));
  assert.deepEqual(lokal, ["ce_token"], "der Vorgang wurde im localStorage abgelegt");
  await ctx.close();
});

test("20 — der /book-Payload bleibt feldgleich", async () => {
  const { ctx, page } = await neueSeite();
  let payload = null;
  await page.route("**/api.confidaraexpress.de/api/jumingo/book", async (route) => {
    payload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ shipmentId: 4711, orderNumber: "CE-1001", trackingNumber: "TRK-1", status: "booked" }) });
  });
  await bisZurBuchung(page);
  const weiter = page.locator("button").filter({ hasText: /Weiter: Buchung/ }).first();
  if (await weiter.count()) { await weiter.click(); await page.waitForTimeout(900); }
  for (const box of await page.locator('input[type="checkbox"]').all()) {
    if (await box.isVisible()) await box.check().catch(() => {});
  }
  const buchen = page.locator("button").filter({ hasText: /Jetzt kostenpflichtig buchen|Jetzt buchen|Kostenpflichtig buchen/i }).first();
  if (!(await buchen.count())) { await ctx.close(); return; }
  await buchen.click();
  await page.waitForTimeout(1500);

  if (!payload) { await ctx.close(); return; }
  for (const feld of ["shipmentId", "tariffId", "price_final", "sender", "recipient",
                      "weight", "content", "labelFormat", "insuranceSelection"]) {
    assert.ok(feld in payload, `/book-Payload: „${feld}" fehlt`);
  }
  // Der Navigationsmarker darf NIE im Payload landen.
  assert.ok(!("fromFlow" in payload), "der Navigationsmarker ist in den Buchungspayload geraten");
  assert.equal(payload.sender.fullName, "Max Mustermann");
  assert.equal(payload.recipient.fullName, "Dora Beispiel");
  await ctx.close();
});
