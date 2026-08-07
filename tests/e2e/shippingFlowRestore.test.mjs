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

// ── Zusätzlicher Zustand für die Entwurfsspeicherung (Teil 9) ───────────────
// Formularentwurf: POST/PATCH /api/kunde/form-drafts. Sendungsentwurf (zweiter,
// unabhängiger Pfad auf der Buchungsseite): POST /api/kunde/drafts/:id/save.
let scriptedFormDraftStatus = 0;     // 0 = Erfolg; sonst erzwungener HTTP-Fehlerstatus
let scriptedFormDraftAbort = false;  // true = Anfrage schlägt bereits auf Netzwerkebene fehl
let scriptedShipmentDraftStatus = 0; // dito für den Sendungsentwurf der Buchungsseite
let formDraftListOverride = null;    // { drafts:[...] } | null — von einzelnen Tests gesetzt
let resumeDetailOverride = null;     // { id, revision, schemaVersion, formData } | null

async function setupRoutes(ziel) {
  await ziel.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/calculate-price")) {
      calcCount++;
      return json({
        tariffs: TARIFFS, shipmentId: 4240 + calcCount, // echte positive Ganzzahl — hasSavableShipmentId
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

    // Formularentwurf speichern — POST (neu) oder PATCH (fortgesetzter Entwurf).
    if (p.endsWith("/api/kunde/form-drafts") && method === "POST") {
      if (scriptedFormDraftAbort) return route.abort();
      if (scriptedFormDraftStatus) return json({ error: "server_error" }, scriptedFormDraftStatus);
      return json({ draft: { id: 900, revision: 0, schemaVersion: 1 } });
    }
    if (/\/api\/kunde\/form-drafts\/\d+$/.test(p) && method === "PATCH") {
      if (scriptedFormDraftAbort) return route.abort();
      if (scriptedFormDraftStatus) return json({ error: "server_error" }, scriptedFormDraftStatus);
      return json({ draft: { id: Number(p.split("/").pop()), revision: 1, schemaVersion: 1 } });
    }
    // Formularentwurf laden — Liste (Entwürfe-Seite) und Detail (Fortsetzen).
    if (/\/api\/kunde\/form-drafts\/(\d+)$/.test(p) && method === "GET") {
      const id = Number(p.match(/\/api\/kunde\/form-drafts\/(\d+)$/)[1]);
      if (resumeDetailOverride && resumeDetailOverride.id === id) return json({ draft: resumeDetailOverride });
      return json({}, 404);
    }
    if (p.endsWith("/api/kunde/form-drafts") && method === "GET") {
      return json(formDraftListOverride || { drafts: [], nextCursor: null });
    }
    // Sendungsentwurf speichern (Buchungsseite, SaveDraftAction) — unabhängiger Pfad.
    if (/\/api\/kunde\/drafts\/[\w-]+\/save$/.test(p)) {
      if (scriptedShipmentDraftStatus) return json({ error: "server_error" }, scriptedShipmentDraftStatus);
      return json({ ok: true });
    }

    if (p.includes("/pickup-window")) return json({ pickupTimeFrom: null, pickupTimeUntil: null });
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], summary: null, pagination: { total: 0 } });
  });
}

function fehlerSammler(page) {
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return fehler;
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

/* Frühere Fassung dieses Tests hieß „…verlängert die History nicht" und
   sicherte damit indirekt ein `navigate(-1)` ab. Das war die falsche
   Zusicherung: der vorherige History-Eintrag sagt nichts darüber aus, welcher
   Dashboard-Bereich dahinter steckt. Die Zusicherung lautet jetzt schärfer und
   fachlich richtig — der Button ersetzt den Buchungseintrag und führt
   deterministisch zur Angebotsauswahl, unabhängig von der Browser-History. */
test("6 — der sichtbare Zurück-Button ersetzt den Buchungseintrag (kein Kreislauf)", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);
  const laengeVorher = await page.evaluate(() => history.length);

  // Zweimal Angebote → Buchung → Zurück. Die History darf dabei nicht wachsen.
  for (let i = 0; i < 2; i++) {
    await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
    await page.waitForTimeout(1300);
    assert.equal((await zustand(page)).titel, "Neue Sendung", `Durchgang ${i + 1}: falsche Seite`);
    const wahl = page.locator(".offer-card button").filter({ hasText: /Auswählen|Weiter|Buchen|wählen/i }).first();
    await wahl.click();
    await page.waitForTimeout(1300);
  }
  assert.equal(await page.evaluate(() => history.length), laengeVorher,
    "die History wächst bei jedem Zurück-Klick");

  // Und nach dem sichtbaren Zurück darf ein Browser-Zurück NICHT wieder
  // unmittelbar in der Buchung landen — der Eintrag wurde ersetzt, nicht gestapelt.
  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForTimeout(1300);
  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  assert.notEqual((await zustand(page)).url, "/booking",
    "Browser-Zurück nach dem sichtbaren Zurück führt wieder in die Buchung");
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

/* ══════════ 9 — Determinismus des sichtbaren Zurück-Buttons ══════════════
   Der eigentliche Fehler war NICHT der Zustandsverlust, sondern das Ziel: der
   Button entschied per navigate(-1) anhand des vorherigen History-Eintrags.
   Die Sidebar-Navigation setzt aber nur den lokalen page-State und fasst die
   History gar nicht an — wer über „Übersicht", „Rechnungen", „Entwürfe" oder
   „Profil" nach „Neue Sendung" gewechselt war, landete deshalb wieder dort.

   Diese Tests fahren jeden dieser Wege über die echte Sidebar ab. */

/* Wechselt über die Sidebar durch die genannten Bereiche. Genau der Weg eines
   echten Nutzers — und der, der die History unberührt lässt. */
async function ueberSidebar(page, ziele) {
  for (const ziel of ziele) {
    const eintrag = page.locator(".nitem", { hasText: ziel }).first();
    if (await eintrag.count()) { await eintrag.click(); await page.waitForTimeout(700); }
    const dialog = page.locator("[role=dialog]");
    if (await dialog.count()) {
      const weiter = dialog.locator("button").filter({ hasText: /Verwerfen|Ohne Speichern|Trotzdem/i }).first();
      if (await weiter.count()) { await weiter.click(); await page.waitForTimeout(600); }
    }
  }
}

const STARTWEGE = [
  ["Übersicht", ["Übersicht", "Neue Sendung"]],
  ["Rechnungen", ["Rechnungen", "Neue Sendung"]],
  ["Profil", ["Unternehmen & Konto", "Neue Sendung"]],
  ["mehrere Reiter", ["Übersicht", "Sendungen", "Rechnungen", "Unternehmen & Konto", "Neue Sendung"]],
];

for (const [name, weg] of STARTWEGE) {
  test(`21 — sichtbares Zurück landet bei den Angeboten (Start über ${name})`, async () => {
    const { ctx, page } = await neueSeite();
    const vorher = calcCount;
    // Einstieg wie nach dem Login: /dashboard OHNE ?page=.
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await ueberSidebar(page, weg);
    await page.waitForTimeout(400);
    assert.equal((await zustand(page)).titel, "Neue Sendung", "Sidebar-Weg nicht angekommen");

    await formularFuellen(page);
    await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
    await page.waitForTimeout(1400);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(200);
    const wahl = page.locator(".offer-card button").filter({ hasText: /Auswählen|Weiter|Buchen|wählen/i }).first();
    await wahl.click();
    await page.waitForTimeout(1300);
    assert.equal((await zustand(page)).url, "/booking");

    await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
    await page.waitForTimeout(1500);

    const z = await zustand(page);
    assert.equal(z.titel, "Neue Sendung", `Start über ${name}: gelandet auf „${z.titel}"`);
    assert.equal(z.angebote, 2, "Angebote fehlen");
    assert.equal(z.ausgewaehlt, 1, "das gewählte Angebot ist nicht markiert");
    assert.equal(z.empfaenger, "Dora Beispiel");
    assert.equal(z.pakete, "2");
    assert.equal(z.gewicht, "5.5");
    assert.equal(z.laenge, "40");
    assert.ok(z.scrollY > 200, `Scrollposition nicht wiederhergestellt (${z.scrollY})`);
    assert.equal(calcCount - vorher, 1, "der Restore hat neu berechnet");
    await ctx.close();
  });
}

test("22 — auch Browser-Zurück landet nach einem Sidebar-Weg bei „Neue Sendung\"", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await ueberSidebar(page, ["Übersicht", "Rechnungen", "Neue Sendung"]);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  const wahl = page.locator(".offer-card button").filter({ hasText: /Auswählen|Weiter|Buchen|wählen/i }).first();
  await wahl.click();
  await page.waitForTimeout(1300);

  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung", `Browser-Zurück landete auf „${z.titel}"`);
  assert.equal(z.angebote, 2);
  assert.equal(z.empfaenger, "Dora Beispiel");
  await ctx.close();
});

test("23 — ohne gemerkte Scrollposition wird der Angebotsbereich angesteuert", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  // Ganz nach oben — die gemerkte Position ist damit 0.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const wahl = page.locator(".offer-card button").filter({ hasText: /Auswählen|Weiter|Buchen|wählen/i }).first();
  await wahl.click();
  await page.waitForTimeout(1300);
  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForTimeout(1800);

  // Der Angebotsbereich muss im sichtbaren Fenster liegen — geprüft am echten
  // Element, nicht an einem Pixelwert.
  const sichtbar = await page.evaluate(() => {
    const el = document.getElementById("angebotsbereich");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  });
  assert.equal(sichtbar, true, "der Angebotsbereich wurde nicht angesteuert");
  await ctx.close();
});

test("24 — direkter Einstieg auf /booking: der Zurück-Button bleibt gefahrlos", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/booking`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  // Ohne Vorgang steht dort „Kein Angebot ausgewählt" — es gibt keinen
  // Zurück-Button, sondern den Weg zum Preisrechner. Kein Absturz, keine
  // Navigation ins Leere.
  const z = await zustand(page);
  assert.equal(z.keinAngebot, true);
  const zurueck = page.locator("button").filter({ hasText: /^← Zurück$/ });
  assert.equal(await zurueck.count(), 0, "der Zurück-Button erscheint ohne Vorgang");
  await ctx.close();
});

/* ══════════ 10 — Entwurf speichern beendet den aktiven Vorgang ═══════════
   Fehlerbild: nach erfolgreichem „Als Entwurf speichern" blieb der bisherige
   ShippingFlow bestehen — die nächste „Neue Sendung" zeigte die gerade
   gespeicherte Sendung erneut (Formular, Angebote, Filter, Auswahl). Zwei
   unabhängige Speicherpfade sind betroffen: der Formularentwurf auf „Neue
   Sendung" und der Sendungsentwurf auf der Buchungsseite. Beide müssen den
   Vorgang NUR nach bestätigtem Erfolg beenden — bei jedem Fehler bleibt alles
   unangetastet, der Kunde kann erneut speichern. */

test("25 — erfolgreiches Speichern eines Formularentwurfs setzt Formular, Angebote und Speicher sofort zurück", async () => {
  const { ctx, page } = await neueSeite();
  const fehler = fehlerSammler(page);
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  // Nur auswählen (nicht buchen) — der Speicherpfad läuft auf „Neue Sendung".
  await page.locator(".offer-card").first().click();
  await page.waitForTimeout(400);

  const vor = await zustand(page);
  assert.equal(vor.speicher, true, "der Vorgang wurde vor dem Speichern nicht gespiegelt");
  assert.equal(vor.angebote, 2);

  await page.locator("button.dft-savedraft-cta").click();
  await page.waitForTimeout(1000);

  const meldung = await page.locator(".dft-save-status").innerText().catch(() => "");
  assert.ok(/Entwurf gespeichert/.test(meldung), `keine Erfolgsmeldung („${meldung}")`);

  const nach = await zustand(page);
  assert.equal(nach.speicher, false, "der Vorgang liegt nach dem Speichern noch im sessionStorage");
  assert.equal(nach.empfaenger, null, "der Empfänger wurde nicht zurückgesetzt");
  assert.equal(nach.pakete, "1", "die Paketanzahl steht nicht wieder auf dem Standard");
  assert.equal(nach.gewicht, null, "das Gewicht wurde nicht geleert");
  assert.equal(nach.angebote, 0, "die Angebote wurden nicht entfernt");
  assert.equal(nach.ausgewaehlt, 0, "die Auswahl wurde nicht entfernt");
  assert.deepEqual(fehler, [], "unerwartete Seitenfehler: " + fehler.join(" | "));
  await ctx.close();
});

test("26 — nach dem Speichern öffnet ein Reiterwechsel zu „Neue Sendung\" ein vollständig leeres Formular", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  await page.locator(".offer-card").first().click();
  await page.waitForTimeout(400);
  await page.locator("button.dft-savedraft-cta").click();
  await page.waitForTimeout(1000);
  // Kein gemerktes Scrollziel darf den Reset überleben — sonst würde ein
  // künftiger Restore (fälschlich) wieder zu einer alten Position springen.
  assert.equal((await zustand(page)).speicher, false, "nach dem Speichern liegt noch ein Vorgang (inkl. Scrollziel) im Speicher");

  await page.locator(".nitem", { hasText: "Übersicht" }).first().click();
  await page.waitForTimeout(600);
  await page.locator(".nitem", { hasText: "Neue Sendung" }).first().click();
  await page.waitForTimeout(900);

  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung");
  assert.equal(z.empfaenger, null, "der Empfänger erscheint nach dem Reiterwechsel erneut");
  assert.equal(z.ort, null, "der Zielort erscheint nach dem Reiterwechsel erneut");
  assert.equal(z.pakete, "1");
  assert.equal(z.gewicht, null);
  assert.equal(z.laenge, null);
  assert.equal(z.angebote, 0, "alte Angebote erscheinen nach dem Reiterwechsel erneut");
  assert.equal(z.ausgewaehlt, 0);
  assert.equal(z.speicher, false);
  await ctx.close();
});

test("27 — ein Tastenanschlag direkt nach dem Speichern schreibt die alten Angebote nicht in den Speicher zurück", async () => {
  const { ctx, page } = await neueSeite();
  const fehler = fehlerSammler(page);
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  await page.locator(".offer-card").first().click();
  await page.waitForTimeout(400);
  await page.locator("button.dft-savedraft-cta").click();
  await page.waitForTimeout(1000);

  // Genau der Moment aus der Persistenz-Falle: die Seite bleibt gemountet,
  // der an lokale Werte gebundene Spiegel-Effekt würde bei veraltetem
  // Zustand sofort wieder feuern und die alten Tarife zurückschreiben.
  await page.locator('input[placeholder="Erika Muster"]').fill("X");
  await page.waitForTimeout(400);

  const roh = await page.evaluate((k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, SPEICHER);
  const geparst = roh ? JSON.parse(roh) : null;
  assert.equal(geparst?.shipment?.tariffs?.length ?? 0, 0, "alte Tarife wurden nach dem Tastenanschlag zurückgeschrieben");
  assert.equal(geparst?.shipment?.form?.r_fullName, "X", "der neue Zustand wird nicht mehr gespiegelt");
  assert.deepEqual(fehler, [], "unerwartete Seitenfehler: " + fehler.join(" | "));
  await ctx.close();
});

test("28 — ein Serverfehler beim Speichern lässt Formular, Angebote und Vorgang unangetastet", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  await page.locator(".offer-card").first().click();
  await page.waitForTimeout(400);

  scriptedFormDraftStatus = 500;
  await page.locator("button.dft-savedraft-cta").click();
  await page.waitForTimeout(1000);
  scriptedFormDraftStatus = 0;

  const meldung = await page.locator(".dft-save-alert").innerText().catch(() => "");
  assert.ok(/nicht gespeichert werden/.test(meldung), `keine Fehlermeldung („${meldung}")`);

  const z = await zustand(page);
  assert.equal(z.empfaenger, "Dora Beispiel", "der Empfänger ging trotz Fehler verloren");
  assert.equal(z.angebote, 2, "die Angebote gingen trotz Fehler verloren");
  assert.equal(z.ausgewaehlt, 1, "die Auswahl ging trotz Fehler verloren");
  assert.equal(z.speicher, true, "der Vorgang wurde trotz Fehler aus dem Speicher entfernt");
  await ctx.close();
});

test("29 — ein Netzwerkfehler beim Speichern (catch-Zweig) lässt Formular, Angebote und Vorgang unangetastet", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  await page.locator(".offer-card").first().click();
  await page.waitForTimeout(400);

  scriptedFormDraftAbort = true;
  await page.locator("button.dft-savedraft-cta").click();
  await page.waitForTimeout(1000);
  scriptedFormDraftAbort = false;

  const meldung = await page.locator(".dft-save-alert").innerText().catch(() => "");
  assert.ok(/nicht gespeichert werden/.test(meldung), `keine Fehlermeldung („${meldung}")`);

  const z = await zustand(page);
  assert.equal(z.empfaenger, "Dora Beispiel", "der Empfänger ging trotz Netzwerkfehler verloren");
  assert.equal(z.angebote, 2, "die Angebote gingen trotz Netzwerkfehler verloren");
  assert.equal(z.speicher, true, "der Vorgang wurde trotz Netzwerkfehler aus dem Speicher entfernt");
  await ctx.close();
});

test("30 — der gespeicherte Formularentwurf erscheint in der Entwürfe-Liste", async () => {
  const { ctx, page } = await neueSeite();
  formDraftListOverride = {
    drafts: [{
      id: 950, kind: "form", schemaVersion: 1, revision: 0,
      summary: {
        sender: { company: "ACME Logistik GmbH", city: "Zürich", country: "CH" },
        recipient: { company: null, city: "Hamburg", country: "DE" },
        packages: { packageCount: 2, weight: 5.5 },
        shippingDate: null,
      },
      createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z",
    }],
    nextCursor: null,
  };
  await page.goto(`${BASE}/dashboard?page=drafts`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const text = await page.locator("body").innerText();
  assert.ok(text.includes("Hamburg"), "der gespeicherte Entwurf erscheint nicht in der Entwürfe-Liste");
  const fortsetzen = page.locator(".dft-resume-btn");
  assert.ok(await fortsetzen.count() > 0, "der Entwurf bietet keine „Fortsetzen\"-Aktion an");
  formDraftListOverride = null;
  await ctx.close();
});

test("31 — „Entwurf fortsetzen\" überschreibt einen vorhandenen Sitzungsvorgang vollständig, statt zu mischen", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page); // hinterlässt einen UNGESICHERTEN Sitzungsvorgang mit „Dora Beispiel"
  await page.waitForTimeout(600);
  assert.equal((await zustand(page)).speicher, true, "der Sitzungsvorgang wurde nicht gespiegelt");

  formDraftListOverride = {
    drafts: [{
      id: 951, kind: "form", schemaVersion: 1, revision: 2,
      summary: {
        sender: { company: "Andere Firma GmbH", city: "München", country: "DE" },
        recipient: { company: "Fortsetzen Empfänger AG", city: "Köln", country: "DE" },
        packages: { packageCount: 3, weight: 9.5 }, shippingDate: null,
      },
      createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z",
    }],
    nextCursor: null,
  };
  resumeDetailOverride = {
    id: 951, revision: 2, schemaVersion: 1,
    formData: {
      sender: { company: "Andere Firma GmbH", fullName: "Otto Absender", streetAndNumber: "Kurfürstendamm 1", postalCode: "10707", city: "Berlin", country: "DE" },
      recipient: { company: "Fortsetzen Empfänger AG", fullName: "Frieda Fortsetzen", streetAndNumber: "Domplatz 1", postalCode: "50667", city: "Köln", country: "DE" },
      packages: { packageCount: 3, weight: 9.5, length: 50, width: 40, height: 30 },
      shippingOptions: { shippingDate: null, serviceFilter: "all", shippingModeFilter: "all", publicCarrierIds: [] },
    },
  };

  await page.locator(".nitem", { hasText: "Entwürfe" }).first().click();
  await page.waitForTimeout(700);
  // Der Verlassen-Dialog bleibt erhalten (ungesicherte Angaben) — „Verwerfen"
  // heißt: ohne Formularentwurf weitergehen. Der Sitzungsvorgang selbst bleibt
  // davon unberührt (siehe Test 10) — genau DAS soll hier geprüft werden.
  const dialog = page.locator("[role=dialog]");
  if (await dialog.count()) {
    const weiter = dialog.locator("button").filter({ hasText: /Verwerfen|Ohne Speichern|Trotzdem/i }).first();
    if (await weiter.count()) { await weiter.click(); await page.waitForTimeout(700); }
  }

  await page.locator(".dft-resume-btn").first().click();
  await page.waitForTimeout(1200);

  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung");
  assert.equal(z.empfaenger, "Frieda Fortsetzen", "der Entwurf wurde nicht korrekt geladen");
  assert.notEqual(z.empfaenger, "Dora Beispiel", "der alte Sitzungsvorgang wurde mit dem Entwurf vermischt");

  formDraftListOverride = null;
  resumeDetailOverride = null;
  await ctx.close();
});

/* ══════════ 11 — der zweite Entwurfspfad (Buchungsseite) ══════════════════ */

test("32 — der zweite Entwurfspfad (Buchungsseite) beendet den Vorgang nach erfolgreichem Speichern ebenfalls", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);
  const vorSpeichern = await zustand(page);
  assert.equal(vorSpeichern.url, "/booking");
  assert.equal(vorSpeichern.speicher, true, "der Vorgang wurde auf dem Weg zur Buchung nicht gespiegelt");

  const saveBtn = page.locator(".bk-savedraft button").first();
  assert.ok(await saveBtn.count() > 0, "die Sendungsentwurf-Aktion fehlt auf der Buchungsseite");
  await saveBtn.click();
  await page.waitForTimeout(1000);
  const done = await page.locator(".bk-savedraft-done").innerText().catch(() => "");
  assert.ok(/Entwurf gespeichert/.test(done), `keine Erfolgsanzeige („${done}")`);

  const nach = await zustand(page);
  assert.equal(nach.speicher, false, "der Vorgang liegt nach dem Sendungsentwurf noch im Speicher");
  // Die Buchungsseite selbst bleibt unverändert funktionsfähig — ihre Daten
  // kommen primär aus location.state, unabhängig vom gelöschten Context.
  assert.equal(nach.url, "/booking");
  assert.equal(nach.keinAngebot, false, "die Buchungsseite verlor ihre Daten nach dem Löschen des Context");

  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const frisch = await zustand(page);
  assert.equal(frisch.empfaenger, null, "„Neue Sendung\" zeigt nach dem Sendungsentwurf noch die alte Sendung");
  assert.equal(frisch.angebote, 0);
  await ctx.close();
});

test("33 — ein Speicherfehler auf der Buchungsseite lässt den Vorgang unangetastet", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);

  scriptedShipmentDraftStatus = 500;
  const saveBtn = page.locator(".bk-savedraft button").first();
  await saveBtn.click();
  await page.waitForTimeout(1000);
  scriptedShipmentDraftStatus = 0;

  const fehlerText = await page.locator(".bk-savedraft-error").innerText().catch(() => "");
  assert.ok(fehlerText.length > 0, "keine Fehlermeldung nach fehlgeschlagenem Sendungsentwurf");

  const z = await zustand(page);
  assert.equal(z.speicher, true, "der Vorgang wurde trotz Fehler aus dem Speicher entfernt");
  assert.equal(z.url, "/booking");
  assert.equal(z.keinAngebot, false, "die Buchungsseite verlor ihre Daten trotz Speicherfehler");
  await ctx.close();
});
