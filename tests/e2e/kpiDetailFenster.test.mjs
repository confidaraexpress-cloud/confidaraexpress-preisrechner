// E2E: Kennzahl-Detailfenster (Betreiberentscheidung 2026-11-07) — echter Dev-Server, echter Browser.
//
// Geprüft wird, was Quelltextanker nicht erreichen: Ein Klick auf eine Kennzahlkarte öffnet ein Fenster an der Karte
// statt einer Seite (Telefon: Bottom-Sheet), es zeigt genau die Treffer des Serverfilters (Zahl und die fünf neuesten),
// höchstens ein Fenster und höchstens eine aufgeklappte Sendung, Schließen über Symbol, Escape und Klick daneben mit
// Fokusrückgabe, „Alle anzeigen“ führt in die bestehende gefilterte Liste (Zurück → Übersicht), überholte Antworten
// erreichen kein Fenster, Fehler bieten „Erneut versuchen“ und nie eine falsche 0, die Karten verschieben sich nicht.
//
// Alle Netzaufrufe sind gemockt; der Mock filtert über dieselben Zeilenkennzeichen, die der Server liefert. Es wird
// NIEMALS eine Buchung ausgelöst, kein Trackingabruf, keine Anfrage an einen Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5764, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const H = 3600e3;
const vor = (stunden) => new Date(Date.now() - stunden * H).toISOString();
const tag = (versatz) => new Date(Date.now() + versatz * 86400e3).toISOString().slice(0, 10);
const HAMBURG = { company: "Nordhafen Technik GmbH", postalCode: "20457", city: "Hamburg", country: "DE" };
function zeile(id, f = {}) {
  const { alter = 30, ...rest } = f;
  return {
    id, status: "label_ready", weight: 2, price_final: 14.28, selected_carrier: "dhl", applied_tariff_display_name: "Standard",
    created_at: vor(alter), order_confirmation_number: `CE-AB26-0${id}`, tracking_number: null, tracking_references: [],
    sender_address: { company: "Muster GmbH", postalCode: "73207", city: "Plochingen", country: "DE" }, recipient_address: HAMBURG,
    reference_number: null, cancellation_status: null, tracking_status: null, last_tracked_at: null, delivered_at: null,
    delivery_date_max: null, requested_shipping_date: null, customer_status: "label_ready", is_active: true, is_delayed: false,
    tracking_stale: false, is_test_booking: false, delivered_this_month: false, ...rest,
  };
}
function standardDaten() {
  return [
    zeile(2001, { alter: 30, customer_status: "in_transit", tracking_status: "in_transit", is_delayed: true, is_test_booking: true,
      tracking_number: "00340434161094041", tracking_references: ["00340434161094041"], delivery_date_max: tag(-3),
      last_tracked_at: vor(5), reference_number: "PO-2026-118" }),
    zeile(2002, { alter: 40, selected_carrier: "ups", applied_tariff_display_name: "Express", customer_status: "exception",
      tracking_status: "exception", is_delayed: true, tracking_number: "1Z999AA10123456784", tracking_references: ["1Z999AA10123456784"],
      delivery_date_max: tag(-2), last_tracked_at: vor(20), recipient_address: { company: "Alpen GmbH", postalCode: "1070", city: "Wien", country: "AT" } }),
    zeile(2003, { alter: 50, selected_carrier: "dpd", applied_tariff_display_name: "Classic", status: "booked", customer_status: "booked",
      is_delayed: true, delivery_date_max: tag(-1) }),
    ...[60, 70, 80, 90].map((alter, i) => zeile(2004 + i, { alter, is_delayed: true, delivery_date_max: tag(-4 - i),
      customer_status: i % 2 ? "in_transit" : "booked", tracking_status: i % 2 ? "in_transit" : null })),
    zeile(2101, { alter: 10, selected_carrier: "gls", customer_status: "in_transit", tracking_status: "in_transit",
      tracking_number: "7120034567", tracking_references: ["7120034567"], delivery_date_max: tag(1), last_tracked_at: vor(2) }),
    zeile(2102, { alter: 20, selected_carrier: "dhlexpress", customer_status: "in_transit", tracking_status: "in_transit",
      tracking_number: "4501234567", tracking_references: ["4501234567", "4501234568"], delivery_date_max: tag(2), last_tracked_at: vor(1) }),
    zeile(2201, { alter: 2, customer_status: "label_ready", requested_shipping_date: tag(1) }),
    zeile(2301, { alter: 100, customer_status: "delivered", tracking_status: "delivered", is_active: false, delivered_this_month: true,
      is_test_booking: true, delivered_at: vor(30), tracking_number: "00340434161090001", tracking_references: ["00340434161090001"] }),
    zeile(2302, { alter: 120, selected_carrier: "ups", customer_status: "delivered", tracking_status: "delivered", is_active: false,
      delivered_this_month: true, delivered_at: vor(70) }),
    zeile(2401, { alter: 1, status: "booking", customer_status: "booking", is_active: false, order_confirmation_number: null }),
  ];
}
const REGEL = {
  active: (s) => s.is_active === true,
  in_transit: (s) => s.is_active === true && s.customer_status === "in_transit",
  delivered_this_month: (s) => s.delivered_this_month === true,
  delayed: (s) => s.is_delayed === true,
};
function stats(z) {
  const n = (k) => z.filter(REGEL[k]).length;
  return {
    total: z.length, active: n("active"), in_transit: n("in_transit"), delivered_this_month: n("delivered_this_month"),
    delayed: n("delayed"), new_24h: z.filter((s) => REGEL.active(s) && Date.now() - Date.parse(s.created_at) < 24 * H).length,
    test_bookings: z.filter((s) => s.is_test_booking && (REGEL.active(s) || REGEL.delivered_this_month(s))).length,
  };
}
const sortiert = (z) => [...z].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

// fehlerEinmal: die erste Anfrage mit ?kpi= antwortet 500 · halten: Kennzahlen, deren Antwort erst nach freigeben(kpi) kommt
async function setupRoutes(page, { daten = standardDaten(), fehlerEinmal = false, halten = [], protokoll = [] } = {}) {
  const zeilen = sortiert(daten);
  const freigaben = new Map(halten.map((k) => { let f; const p = new Promise((r) => { f = r; }); return [k, { p, f }]; }));
  let fehlerOffen = fehlerEinmal;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) }).catch(() => {});
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) {
      protokoll.push(url.search);
      const kpi = url.searchParams.get("kpi");
      const limit = Number(url.searchParams.get("limit")) || 50;
      if (kpi && fehlerOffen) { fehlerOffen = false; return json({ error: "Fehler" }, 500); }
      if (kpi && freigaben.has(kpi)) await freigaben.get(kpi).p;
      const menge = kpi ? zeilen.filter(REGEL[kpi]) : zeilen;
      const body = { shipments: menge.slice(0, limit), nextCursor: null, stats: stats(daten) };
      if (kpi) body.filter = { kpi, total: menge.length };
      return json(body);
    }
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null, nextCursor: null });
    if (p.includes("/kunde/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "2026-11-07T10:00:00Z" });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.endsWith("/kunde/carriers")) return json({ carriers: [] });
    if (p.endsWith("/kunde/credit")) return json({});
    if (p.includes("/api/kunde/")) return json({ items: [], drafts: [], addresses: [], nextCursor: null, pagination: { total: 0 } });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return { protokoll, freigeben: (kpi) => freigaben.get(kpi)?.f() };
}

const karte = (page, kpi) => page.locator(`.ov-kpi[data-kpi="${kpi}"]`);
const fenster = (page) => page.locator(".kpf");
async function ruhig(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => null))));
}
async function uebersicht(page) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll(".ov-kpi").length === 4
    && [...document.querySelectorAll(".ov-kpi-value")].every((e) => /^\d+$/.test(e.textContent.trim())), null, { timeout: 30000 });
  await ruhig(page);
}
async function oeffne(page, kpi, { tippen = false } = {}) {
  if (tippen) await karte(page, kpi).tap(); else await karte(page, kpi).click();
  await page.locator(`.kpf[data-kpi="${kpi}"][data-stand="ready"]`).waitFor({ timeout: 15000 });
  await ruhig(page);
}
const kpiAnfragen = (protokoll, kpi) => protokoll.filter((q) => q === `?kpi=${kpi}&limit=5`).length;
const kartenLage = (page) => page.$$eval(".ov-kpi", (as) => as.map((a) => [a.offsetLeft, a.offsetTop, a.offsetWidth, a.offsetHeight]));

let server, browser;

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
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
  if (server) stopDevServer(server, "SIGKILL");
});

test("A — jede Karte öffnet ihr Fenster an der Karte: keine Navigation, Zahl = Karte = Serverfilter, die fünf neuesten Treffer", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  try {
    const { protokoll } = await setupRoutes(page);
    await uebersicht(page);
    assert.ok(!protokoll.some((q) => q.includes("kpi=")), "die Übersicht fragt beim Laden keine Kennzahlliste an");
    const daten = sortiert(standardDaten());
    const s = stats(standardDaten());
    for (const kpi of ["active", "in_transit", "delivered_this_month", "delayed"]) {
      const vorher = new URL(page.url());
      await oeffne(page, kpi);
      assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, vorher.pathname + vorher.search, `${kpi}: Seitenwechsel`);
      assert.equal(await page.locator(".ov-kpis").isVisible(), true);
      assert.equal(await fenster(page).count(), 1);
      assert.equal(await karte(page, kpi).getAttribute("aria-expanded"), "true");
      const zahl = (await page.locator(".kpf-zahl").innerText()).trim();
      assert.equal(zahl, String(s[kpi]), `${kpi}: Trefferzahl`);
      assert.equal((await karte(page, kpi).locator(".ov-kpi-value").innerText()).trim(), zahl, `${kpi}: Karte und Fenster gleich`);
      const erwartet = daten.filter(REGEL[kpi]).slice(0, 5).map((z) => z.order_confirmation_number || "Ohne Vorgangsnummer");
      const gezeigt = await page.$$eval(".kpf-zeile .kpf-nummer", (n) => n.map((e) => e.textContent.trim()));
      assert.deepEqual(gezeigt, erwartet, `${kpi}: genau die neuesten Treffer`);
      const umfang = s[kpi] > 5 ? `Die 5 neuesten von ${s[kpi]}` : null;
      assert.equal(await page.locator(".kpf-umfang").count(), umfang ? 1 : 0);
      if (umfang) assert.equal((await page.locator(".kpf-umfang").innerText()).trim(), umfang);
      assert.equal(kpiAnfragen(protokoll, kpi), 1, `${kpi}: genau eine Anfrage mit limit=5`);
      // Im Bild und mit dem Pfeil über der Karte.
      const lage = await page.evaluate((k) => {
        const f = document.querySelector(".kpf").getBoundingClientRect();
        const c = document.querySelector(`.ov-kpi[data-kpi="${k}"]`).getBoundingClientRect();
        const pfeil = parseFloat(getComputedStyle(document.querySelector(".kpf")).getPropertyValue("--kpf-pfeil"));
        return { imBild: f.left >= 0 && f.top >= 0 && f.right <= document.documentElement.clientWidth && f.bottom <= innerHeight,
          pfeilAufKarte: f.left + pfeil >= c.left && f.left + pfeil <= c.right, unterKarte: f.top >= c.bottom, breite: Math.round(f.width) };
      }, kpi);
      assert.deepEqual(lage, { imBild: true, pfeilAufKarte: true, unterKarte: true, breite: 440 }, `${kpi}: Lage`);
      await page.keyboard.press("Escape");
      await fenster(page).waitFor({ state: "detached", timeout: 5000 });
    }
    // TEST-Marke in der Zeile einer Testbuchung.
    await oeffne(page, "delayed");
    assert.match(await page.locator(".kpf-zeile").first().innerText(), /TEST/);
    assert.equal(kpiAnfragen(protokoll, "delayed"), 1, "erneutes Öffnen derselben Kennzahl nutzt den frischen Stand");
  } finally { await page.close(); }
});

test("B — ein Fenster: eine andere Karte wechselt, dieselbe schließt; Escape, Symbol und Klick daneben schließen, Fokus zurück", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  try {
    await setupRoutes(page);
    await uebersicht(page);
    await oeffne(page, "active");
    await oeffne(page, "in_transit");
    assert.equal(await fenster(page).count(), 1, "höchstens ein Fenster");
    assert.equal(await fenster(page).getAttribute("data-kpi"), "in_transit");
    assert.equal(await karte(page, "active").getAttribute("aria-expanded"), "false");
    await karte(page, "in_transit").click();
    await fenster(page).waitFor({ state: "detached", timeout: 5000 });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.kpi), "in_transit");
    // Escape: Fokus zurück auf die Karte.
    await oeffne(page, "delayed");
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest(".kpf"))), true, "der Fokus liegt im Fenster");
    await page.keyboard.press("Escape");
    await fenster(page).waitFor({ state: "detached", timeout: 5000 });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.kpi), "delayed");
    // Schließen-Symbol.
    await oeffne(page, "delayed");
    await page.getByRole("button", { name: "Schließen" }).click();
    await fenster(page).waitFor({ state: "detached", timeout: 5000 });
    // Klick daneben (auf die Begrüßung).
    await oeffne(page, "delayed");
    await page.locator(".ce-page-header-title").first().click();
    await fenster(page).waitFor({ state: "detached", timeout: 5000 });
    assert.equal(await page.locator(".ov-kpi[aria-expanded='true']").count(), 0);
  } finally { await page.close(); }
});

test("C — Sendungen aufklappen: höchstens eine offen, aria-expanded/-controls, Angaben je Kennzahl, Hinweis ohne Trackingnummer, Tastatur", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  try {
    await setupRoutes(page);
    await uebersicht(page);
    await oeffne(page, "delayed");
    const knoepfe = page.locator(".kpf-zeile-knopf");
    const zustand = () => knoepfe.evaluateAll((k) => k.map((x) => x.getAttribute("aria-expanded")));
    assert.deepEqual(await zustand(), ["false", "false", "false", "false", "false"]);
    const erste = await knoepfe.first().getAttribute("aria-controls");
    assert.ok(erste && (await page.locator(`[id="${erste}"]`).count()) === 1, "aria-controls zeigt auf den Detailbereich");
    await knoepfe.first().click();
    assert.deepEqual(await zustand(), ["true", "false", "false", "false", "false"]);
    const details = (await page.locator(`[id="${erste}"]`).innerText()).replace(/\s+/g, " ");
    for (const t of ["Letzter Trackingstand", "Unterwegs", "Trackingstand vom", "Von", "73207 Plochingen, DE", "Nach", "20457 Hamburg, DE",
      "Trackingnummer", "00340434161094041", "Buchungsdatum", "Ihre Referenz", "PO-2026-118"]) {
      assert.ok(details.includes(t), `„${t}“ fehlt in den Angaben`);
    }
    assert.match((await page.locator(".kpf-zeile").first().innerText()).replace(/\s+/g, " "), /Liefertermin \d{2}\.\d{2}\.\d{4} überschritten/);
    // Die zweite schließt die erste; die dritte (ohne Trackingnummer) nennt das sachlich.
    await knoepfe.nth(1).click();
    assert.deepEqual(await zustand(), ["false", "true", "false", "false", "false"]);
    await knoepfe.nth(2).click();
    assert.match(await page.locator(".kpf-zeile").nth(2).innerText(), /Für diese Sendung liegt noch keine Trackingnummer vor\./);
    await knoepfe.nth(2).click();
    assert.deepEqual(await zustand(), ["false", "false", "false", "false", "false"]);
    // Tastatur: Enter öffnet, Leertaste schließt.
    await knoepfe.first().focus();
    await page.keyboard.press("Enter");
    assert.equal(await knoepfe.first().getAttribute("aria-expanded"), "true");
    await page.keyboard.press(" ");
    assert.equal(await knoepfe.first().getAttribute("aria-expanded"), "false");
    // Aktive Sendungen: der nächste Schritt aus dem Kundenstand.
    await page.keyboard.press("Escape");
    await oeffne(page, "active");
    await page.locator(".kpf-zeile-knopf").first().click();
    assert.match(await page.locator(".kpf-zeile").first().innerText(), /Nächster Schritt\s+Paket mit dem Versandlabel übergeben/);
  } finally { await page.close(); }
});

test("D — Fehler: sachlicher Zustand mit „Erneut versuchen“, nie eine 0; der zweite Versuch zeigt die Treffer", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  try {
    const { protokoll } = await setupRoutes(page, { fehlerEinmal: true });
    await uebersicht(page);
    await karte(page, "delayed").click();
    await page.locator('.kpf[data-stand="fehler"]').waitFor({ timeout: 15000 });
    const text = await fenster(page).innerText();
    assert.match(text, /Die Sendungen konnten nicht geladen werden\./);
    assert.equal((await page.locator(".kpf-zahl").innerText()).trim(), "—", "keine falsche 0");
    assert.equal(await page.locator(".kpf-zeile").count(), 0);
    await page.getByRole("button", { name: "Erneut versuchen" }).click();
    await page.locator('.kpf[data-stand="ready"]').waitFor({ timeout: 15000 });
    assert.equal((await page.locator(".kpf-zahl").innerText()).trim(), String(stats(standardDaten()).delayed));
    assert.equal(kpiAnfragen(protokoll, "delayed"), 2);
  } finally { await page.close(); }
});

test("E — überholte Antworten: Wechsel während des Ladens und Schließen während des Ladens zeigen nie einen alten Stand", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  try {
    const m = await setupRoutes(page, { halten: ["delayed", "in_transit"] });
    await uebersicht(page);
    await karte(page, "delayed").click();
    await page.locator('.kpf[data-kpi="delayed"][data-stand="laden"]').waitFor({ timeout: 10000 });
    assert.equal((await page.locator(".kpf-zahl").innerText()).trim(), "—", "beim Laden keine Zahl");
    await oeffne(page, "active");
    m.freigeben("delayed");
    await page.waitForTimeout(600);
    assert.equal(await fenster(page).getAttribute("data-kpi"), "active", "die verspätete Antwort wechselt das Fenster nicht");
    assert.equal((await page.locator(".kpf-zahl").innerText()).trim(), String(stats(standardDaten()).active));
    assert.ok(!(await page.$$eval(".kpf-zeile .kpf-nummer", (n) => n.map((e) => e.textContent))).includes("CE-AB26-02003"));
    // Schließen während des Ladens: die spätere Antwort öffnet nichts.
    await page.keyboard.press("Escape");
    await karte(page, "in_transit").click();
    await page.locator('.kpf[data-kpi="in_transit"][data-stand="laden"]').waitFor({ timeout: 10000 });
    await page.keyboard.press("Escape");
    await fenster(page).waitFor({ state: "detached", timeout: 5000 });
    m.freigeben("in_transit");
    await page.waitForTimeout(600);
    assert.equal(await fenster(page).count(), 0, "ein geschlossenes Fenster erscheint nicht wieder");
  } finally { await page.close(); }
});

test("F — „Alle anzeigen“ führt in die bestehende gefilterte Liste; Zurück führt auf die Übersicht ohne Fenster", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  try {
    const { protokoll } = await setupRoutes(page);
    await uebersicht(page);
    await oeffne(page, "delayed");
    const alle = page.locator(".kpf-alle");
    assert.equal(await alle.getAttribute("href"), "/dashboard?page=shipments&kpi=delayed", "derselbe Deep-Link wie bisher");
    await alle.click();
    await page.locator(".ce-filterleiste").waitFor({ timeout: 15000 });
    // Die Trefferzahl kommt mit der Antwort der Liste — erst dann ist die Leiste vollständig.
    await page.waitForFunction((n) => document.querySelector(".ce-filterleiste-anzahl")?.textContent.includes(`${n}`),
      stats(standardDaten()).delayed, { timeout: 15000 });
    const leiste = (await page.locator(".ce-filterleiste").innerText()).replace(/\s+/g, " ");
    assert.match(leiste, new RegExp(`Filter: Verzögert · ${stats(standardDaten()).delayed} Sendungen`));
    assert.ok(protokoll.includes("?kpi=delayed&limit=50"), "die Liste lädt wie bisher seitenweise");
    assert.equal(await fenster(page).count(), 0);
    await page.goBack();
    await page.waitForSelector(".ov-kpi", { timeout: 15000 });
    assert.equal(await page.locator(".ce-filterleiste").count(), 0);
    assert.equal(await fenster(page).count(), 0);
  } finally { await page.close(); }
});

test("G — 390 px: Bottom-Sheet über dem Schleier, Fokus darin, innen scrollbar, 44-px-Ziele, Antippen daneben schließt", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "de-DE", hasTouch: true, isMobile: true });
  try {
    await setupRoutes(page);
    await uebersicht(page);
    await oeffne(page, "delayed", { tippen: true });
    const sheet = await page.evaluate(() => {
      const f = document.querySelector(".kpf");
      const r = f.getBoundingClientRect();
      const zu = document.querySelector(".kpf-schliessen").getBoundingClientRect();
      const alle = document.querySelector(".kpf-alle").getBoundingClientRect();
      return { klasse: f.classList.contains("kpf--sheet"), links: Math.round(r.left), breite: Math.round(r.width),
        unten: Math.round(innerHeight - r.bottom), oben: r.top > 0, schleier: Boolean(document.querySelector(".kpf-schleier")),
        fokusDrin: Boolean(document.activeElement?.closest(".kpf")), ziel: [Math.round(zu.width), Math.round(zu.height), Math.round(alle.height)],
        quer: document.scrollingElement.scrollWidth - innerWidth };
    });
    assert.deepEqual(sheet, { klasse: true, links: 0, breite: 390, unten: 0, oben: true, schleier: true, fokusDrin: true, ziel: [44, 44, 44], quer: 0 });
    await page.locator(".kpf-zeile-knopf").first().tap();
    const innen = await page.evaluate(() => {
      const i = document.querySelector(".kpf-inhalt");
      return { scrollt: i.scrollHeight > i.clientHeight, quer: i.scrollWidth - i.clientWidth };
    });
    assert.deepEqual(innen, { scrollt: true, quer: 0 }, "die Liste scrollt innen, nie quer");
    await page.mouse.click(195, 40);
    await fenster(page).waitFor({ state: "detached", timeout: 5000 });
  } finally { await page.close(); }
});

test("H — die Karten verschieben sich beim Öffnen nicht; das Fenster bleibt in 1440, 1024 und 768 px im Bild", async () => {
  for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, locale: "de-DE" });
    try {
      await setupRoutes(page);
      await uebersicht(page);
      const vorher = await kartenLage(page);
      await oeffne(page, "delayed");
      assert.deepEqual(await kartenLage(page), vorher, `${w}: die Karten sind gesprungen`);
      const mass = await page.evaluate(() => {
        const r = document.querySelector(".kpf").getBoundingClientRect();
        const i = document.querySelector(".kpf-inhalt");
        return { imBild: r.left >= 0 && r.top >= 0 && r.right <= document.documentElement.clientWidth && r.bottom <= innerHeight + 1,
          quer: document.scrollingElement.scrollWidth - innerWidth, innenQuer: i.scrollWidth - i.clientWidth };
      });
      assert.deepEqual(mass, { imBild: true, quer: 0, innenQuer: 0 }, `${w}: Fenster`);
    } finally { await page.close(); }
  }
});

test("I — Demo: dieselben Fenster mit den Beispieldaten, ohne Serververbindung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  const extern = [];
  page.on("request", (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) extern.push(r.url()); });
  try {
    await page.goto(`${BASE}/demo/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelectorAll(".ov-kpi").length === 4
      && [...document.querySelectorAll(".ov-kpi-value")].every((e) => /^\d+$/.test(e.textContent.trim())), null, { timeout: 30000 });
    await oeffne(page, "delayed");
    assert.equal((await page.locator(".kpf-zahl").innerText()).trim(), (await karte(page, "delayed").locator(".ov-kpi-value").innerText()).trim());
    assert.ok((await page.locator(".kpf-zeile").count()) >= 1);
    await page.locator(".kpf-zeile-knopf").first().click();
    assert.match(await page.locator(".kpf-zeile").first().innerText(), /Von\s+70173 Stuttgart, DE/);
    assert.deepEqual(extern.filter((u) => /confidaraexpress\.de\/(api|kunde)|api\.confidaraexpress/.test(u)), [], "keine Anfrage an die API");
  } finally { await page.close(); }
});
