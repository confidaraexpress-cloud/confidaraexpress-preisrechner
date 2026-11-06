// E2E: Kennzahlkarten als Filter (Betreiberentscheidungen E1–E4, 2026-11-06) — echter Dev-Server, echter Browser.
//
// Geprüft wird, was Quelltextanker nicht erreichen: dass jede der vier Karten ein bedienbarer Link ist (Maus,
// Tastatur, sichtbarer Fokus), dass ein Klick genau den Serverfilter der Karte anfragt und dessen Trefferzahl zeigt,
// dass „Weitere Sendungen laden“ im Filter bleibt, dass Zurück/Vor/Neuladen den Filter richtig behandeln, dass Leer-,
// Fehler- und Altbackend-Zustände nie eine falsche Liste oder 0 zeigen und dass jede Liste den Kundenstand samt
// TEST-Marke trägt.
//
// Alle Netzaufrufe sind gemockt; der Mock filtert über dieselben Zeilenkennzeichen, die der Server liefert
// (is_active, customer_status, is_delayed, delivered_this_month). Es wird NIEMALS eine Buchung ausgelöst.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5763, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const H = 3600e3;
function zeile(id, felder = {}) {
  const { alterStunden = 48 + id % 97, ...rest } = felder;
  return {
    id, status: "booked", weight: 2, price_final: 14.28, selected_carrier: "dhl",
    created_at: new Date(Date.now() - alterStunden * H - id * 1000).toISOString(),
    order_confirmation_number: `CE-AB-2026-${String(id).padStart(6, "0")}`, tracking_number: null, tracking_references: [],
    cancellation_status: null, customer_status: "booked", is_active: true, is_delayed: false, tracking_stale: false,
    is_test_booking: false, delivered_this_month: false, ...rest,
  };
}

// Ein Konto mit jedem Kundenstand und 54 verzögerten Sendungen (eine Seite = 50 → Nachladen im Filter).
function standardDaten() {
  const z = [
    zeile(9001, { status: "label_ready", customer_status: "delivered", is_active: false, delivered_this_month: true, is_test_booking: true, alterStunden: 30 }),
    zeile(9002, { status: "label_ready", customer_status: "label_ready", is_test_booking: true, alterStunden: 2 }),
    zeile(9003, { customer_status: "in_transit", tracking_number: "1ZE2EUNTERWEGS1", tracking_references: ["1ZE2EUNTERWEGS1"] }),
    zeile(9004, { customer_status: "exception", is_delayed: true }),
    zeile(9005, { customer_status: "cancelled", is_active: false, cancellation_status: "accepted" }),
    // Veraltet (Buchung außerhalb des Trackingfensters) — das Kennzeichen setzt der Server; hier auf Seite 1 gelegt.
    zeile(9006, { customer_status: "in_transit", is_active: false, tracking_stale: true, alterStunden: 150 }),
    zeile(9007, { status: "booking", customer_status: "booking", is_active: false, order_confirmation_number: null }),
    zeile(9008, { alterStunden: 1 }),
  ];
  for (let i = 0; i < 53; i++) {
    z.push(zeile(9100 + i, { customer_status: i % 2 ? "in_transit" : "booked", is_delayed: true, alterStunden: 200 + i }));
  }
  return z;
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

// modus: "normal" | "altBackend" (ignoriert ?kpi=) | "filterFehler" (500 nur für ?kpi=)
async function setupRoutes(page, { daten = standardDaten(), modus = "normal", protokoll = [] } = {}) {
  const sortiert = [...daten].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) {
      protokoll.push(url.search);
      const kpi = url.searchParams.get("kpi");
      const limit = Number(url.searchParams.get("limit")) || 50;
      const ab = url.searchParams.get("cursor") ? Number(Buffer.from(url.searchParams.get("cursor"), "base64url").toString()) : 0;
      if (kpi && modus === "filterFehler") return json({ error: "Fehler" }, 500);
      const filter = kpi && modus !== "altBackend";
      if (filter && !REGEL[kpi]) return json({ error: "kpi: unbekannter Filter", code: "SHIPMENTS_KPI_INVALID" }, 400);
      const menge = filter ? sortiert.filter(REGEL[kpi]) : sortiert;
      const seite = menge.slice(ab, ab + limit);
      const nextCursor = ab + limit < menge.length ? Buffer.from(String(ab + limit)).toString("base64url") : null;
      const body = { shipments: seite, nextCursor, stats: stats(daten) };
      if (filter) body.filter = { kpi, total: menge.length };
      return json(body);
    }
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null, nextCursor: null });
    if (p.includes("/kunde/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "2026-11-06T10:00:00Z" });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.endsWith("/kunde/carriers")) return json({ carriers: [] });
    if (p.endsWith("/kunde/credit")) return json({});
    if (p.includes("/api/kunde/")) return json({ items: [], drafts: [], addresses: [], nextCursor: null, pagination: { total: 0 } });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return protokoll;
}

const karte = (page, kpi) => page.locator(`a.ov-kpi[data-kpi="${kpi}"]`);
async function uebersicht(page) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("a.ov-kpi").length === 4
    && [...document.querySelectorAll(".ov-kpi-value")].every((e) => /^\d+$/.test(e.textContent.trim())), null, { timeout: 30000 });
}
const filterLeiste = (page) => page.locator(".ce-filterleiste");
async function sichtbareZeilen(page) {
  return page.$$eval(".shipment-table tbody tr:not(.shipment-detail-row)", (rows) => rows.filter((r) => r.offsetParent !== null).length);
}

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

test("1 — vier Karten sind Links mit Filter, neuen Bezeichnungen, „davon n neu (24 h)“ und Testhinweis", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "de-DE" });
  try {
    await setupRoutes(page);
    await uebersicht(page);
    const s = stats(standardDaten());
    const karten = await page.$$eval("a.ov-kpi", (as) => as.map((a) => ({
      kpi: a.dataset.kpi, href: a.getAttribute("href"), label: a.querySelector(".ov-kpi-label-text").textContent.trim(),
      wert: a.querySelector(".ov-kpi-value").textContent.trim(), kontext: a.querySelector(".ov-kpi-context").textContent.trim(),
      cursor: getComputedStyle(a).cursor,
    })));
    assert.deepEqual(karten.map((k) => [k.kpi, k.label]), [
      ["active", "Aktive Sendungen"], ["in_transit", "Unterwegs"], ["delivered_this_month", "Zugestellt"], ["delayed", "Verzögert"],
    ]);
    for (const k of karten) {
      assert.equal(k.href, `/dashboard?page=shipments&kpi=${k.kpi}`);
      assert.equal(k.cursor, "pointer");
      assert.equal(k.wert, String(s[k.kpi]), `${k.kpi}: Zahl`);
    }
    assert.match(karten[0].kontext, /^Gebucht, noch nicht zugestellt, davon\u00a02\u00a0neu \(24\u00a0h\)/);
    assert.match(karten[3].kontext, /^Voraussichtlicher Liefertermin überschritten/);
    assert.ok(!(await page.locator(".ov-kpis").innerText()).includes("In Zustellung"));
    // Zugänglicher Name: sichtbarer Text plus „Sendungen anzeigen“.
    await page.getByRole("link", { name: /Verzögert.*Sendungen anzeigen/ }).waitFor({ timeout: 5000 });
    // E1: Hinweis unter den Karten — ohne die Module zu verschieben.
    assert.equal((await page.locator(".ov-kpi-hinweis").innerText()).replace(/\s+/g, " ").trim(), "TEST Kennzahlen enthalten Testsendungen.");
    const lage = await page.evaluate(() => {
      const h = document.querySelector(".ov-kpi-hinweis").getBoundingClientRect();
      const k = document.querySelector(".ov-kpis").getBoundingClientRect();
      const m = document.querySelector(".ov-mod-grid").getBoundingClientRect();
      return { unterKarten: h.top >= k.bottom, vorModulen: h.bottom <= m.top };
    });
    assert.deepEqual(lage, { unterKarten: true, vorModulen: true }, "der Hinweis überlappt Karten oder Module");
    // „Letzte Sendungen“ zeigen den Kundenstand mit TEST-Marke.
    const letzte = await page.locator(".ov-list--sendungen").innerText();
    assert.match(letzte, /TEST/);
  } finally { await page.close(); }
});

test("2 — Klick auf „Verzögert“: Serverfilter, Trefferzahl, 50 + Nachladen im Filter, jede Zeile verzögert; Zurück/Vor", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "de-DE" });
  try {
    const protokoll = await setupRoutes(page);
    await uebersicht(page);
    const erwartet = stats(standardDaten()).delayed;
    await karte(page, "delayed").click();
    await filterLeiste(page).waitFor({ timeout: 15000 });
    await page.waitForFunction((n) => document.querySelector(".ce-filterleiste-anzahl")?.textContent.includes(`${n}`), erwartet, { timeout: 15000 });
    const leiste = (await filterLeiste(page).innerText()).replace(/\s+/g, " ");
    assert.match(leiste, new RegExp(`Filter: Verzögert · ${erwartet} Sendungen`));
    assert.match(leiste, /Voraussichtlicher Liefertermin überschritten/);
    assert.match(leiste, /Filter entfernen/);
    await page.waitForSelector(".shipment-table tbody tr", { timeout: 15000 });
    assert.equal(await sichtbareZeilen(page), 50);
    assert.ok(protokoll.includes("?kpi=delayed&limit=50"), `Filteranfrage fehlt: ${protokoll.join(" | ")}`);
    await page.getByRole("button", { name: "Weitere Sendungen laden" }).click();
    await page.waitForFunction((n) => document.querySelectorAll(".shipment-table tbody tr:not(.shipment-detail-row)").length === n, erwartet, { timeout: 15000 });
    assert.ok(protokoll.some((q) => q.startsWith("?kpi=delayed&limit=50&cursor=")), "das Nachladen hat den Filter verloren");
    assert.equal(await page.getByRole("button", { name: "Weitere Sendungen laden" }).count(), 0);
    const marken = await page.$$eval(".shipment-table tbody tr:not(.shipment-detail-row) .shipment-status", (z) => z.map((e) => e.innerText));
    assert.ok(marken.every((t) => t.includes("Verzögert")), "eine Zeile im Filter „Verzögert“ trägt keine Verzögerung");
    // Browser-Zurück → Übersicht; Vor → derselbe Filter.
    await page.goBack();
    await page.waitForSelector("a.ov-kpi", { timeout: 15000 });
    assert.equal(await filterLeiste(page).count(), 0);
    await page.goForward();
    await filterLeiste(page).waitFor({ timeout: 15000 });
    assert.match(await filterLeiste(page).innerText(), /Filter: Verzögert/);
  } finally { await page.close(); }
});

test("3 — Tastatur: Fokus sichtbar auf der Karte, Enter öffnet „Unterwegs“; Neuladen behält den Filter", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "de-DE" });
  try {
    await setupRoutes(page);
    await uebersicht(page);
    let fokus = null;
    for (let i = 0; i < 60 && fokus !== "in_transit"; i++) {
      await page.keyboard.press("Tab");
      fokus = await page.evaluate(() => document.activeElement?.dataset?.kpi || null);
    }
    assert.equal(fokus, "in_transit", "die Karte ist per Tab nicht erreichbar");
    const ring = await page.evaluate(() => {
      const a = document.activeElement;
      const st = getComputedStyle(a);
      return { stil: st.outlineStyle, breite: st.outlineWidth, sichtbar: a.matches(":focus-visible") };
    });
    assert.deepEqual(ring, { stil: "solid", breite: "2px", sichtbar: true });
    await page.keyboard.press("Enter");
    await filterLeiste(page).waitFor({ timeout: 15000 });
    assert.match(await filterLeiste(page).innerText(), /Filter: Unterwegs/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await filterLeiste(page).waitFor({ timeout: 20000 });
    assert.match(await filterLeiste(page).innerText(), /Filter: Unterwegs/, "Neuladen verlor den Filter");
    const zeilen = await page.$$eval(".shipment-table tbody tr:not(.shipment-detail-row) .shipment-status", (z) => z.map((e) => e.innerText));
    assert.ok(zeilen.length > 0 && zeilen.every((t) => t.includes("Unterwegs")), "jede Zeile im Filter „Unterwegs“ ist unterwegs");
  } finally { await page.close(); }
});

test("4 — Filter entfernen: volle Liste, Fokus auf der Überschrift, und nach Neuladen kehrt der Filter nicht zurück", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "de-DE" });
  try {
    await setupRoutes(page);
    await uebersicht(page);
    await karte(page, "active").click();
    await filterLeiste(page).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Filter entfernen" }).click();
    await page.waitForFunction(() => !document.querySelector(".ce-filterleiste"), null, { timeout: 15000 });
    await page.waitForFunction(() => document.activeElement?.classList.contains("ce-page-header-title"), null, { timeout: 5000 });
    assert.equal(await sichtbareZeilen(page), 50, "die ungefilterte erste Seite");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".shipment-table tbody tr", { timeout: 20000 });
    assert.equal(await filterLeiste(page).count(), 0, "ein entfernter Filter kam zurück");
    // Ungefilterte Liste: Kundenstand statt Buchungsstatus, TEST-Marke, veralteter Stand.
    const tabelle = (await page.locator(".shipment-table").innerText()).replace(/\s+/g, " ");
    for (const t of ["Zugestellt", "Zustellproblem", "Storniert", "Unterwegs", "Label bereit", "Buchungsstatus wird geprüft", "Trackingstand nicht mehr aktuell", "TEST"]) {
      assert.ok(tabelle.includes(t), `„${t}“ fehlt in der Liste`);
    }
  } finally { await page.close(); }
});

test("5 — Wert 0 ist anklickbar: Leerzustand mit „Alle Sendungen anzeigen“; Fehler und Altbackend zeigen nie eine falsche Liste", async () => {
  const ohneZustellung = standardDaten().filter((s) => !s.delivered_this_month);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "de-DE" });
  try {
    await setupRoutes(page, { daten: ohneZustellung });
    await uebersicht(page);
    assert.equal((await karte(page, "delivered_this_month").locator(".ov-kpi-value").innerText()).trim(), "0");
    await karte(page, "delivered_this_month").click();
    await page.getByText("In diesem Monat wurde noch keine Sendung zugestellt.").waitFor({ timeout: 15000 });
    assert.match((await filterLeiste(page).innerText()).replace(/\s+/g, " "), /Zugestellt im aktuellen Monat · 0 Sendungen/);
    await page.getByRole("button", { name: "Alle Sendungen anzeigen" }).click();
    await page.waitForSelector(".shipment-table tbody tr", { timeout: 15000 });
    assert.equal(await filterLeiste(page).count(), 0);
  } finally { await page.close(); }

  for (const [modus, text] of [["filterFehler", "Die gefilterten Sendungen konnten nicht geladen werden."], ["altBackend", "Dieser Filter ist derzeit nicht verfügbar."]]) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "de-DE" });
    try {
      await setupRoutes(p, { modus });
      await p.goto(`${BASE}/dashboard?page=shipments&kpi=delayed`, { waitUntil: "domcontentloaded" });
      await p.getByText(text).waitFor({ timeout: 20000 });
      assert.equal(await sichtbareZeilen(p), 0, `${modus}: eine Liste unter dem Filtertitel`);
      assert.ok(!/0 Sendungen/.test(await filterLeiste(p).innerText()), `${modus}: falsche 0`);
      assert.equal(await p.getByRole("button", { name: "Alle Sendungen anzeigen" }).count(), 1);
    } finally { await p.close(); }
  }
});

test("6 — Deep-Link in neuem Tab filtert direkt; ein unbekannter Filter zeigt alle Sendungen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "de-DE" });
  try {
    const protokoll = await setupRoutes(page);
    await page.goto(`${BASE}/dashboard?page=shipments&kpi=active`, { waitUntil: "domcontentloaded" });
    await filterLeiste(page).waitFor({ timeout: 20000 });
    assert.match(await filterLeiste(page).innerText(), /Filter: Aktive Sendungen/);
    assert.ok(protokoll.includes("?kpi=active&limit=50"));
    assert.equal(new URL(page.url()).search, "", "die Adresse wird wie bisher bereinigt");
    await page.goto(`${BASE}/dashboard?page=shipments&kpi=xyz`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".shipment-table tbody tr", { timeout: 20000 });
    assert.equal(await filterLeiste(page).count(), 0);
    assert.ok(!protokoll.some((q) => q.includes("kpi=xyz")), "ein unbekannter Filter erreichte den Server");
  } finally { await page.close(); }
});

test("7 — 390 px: Karten 2 × 2 und antippbar, Filterleiste bricht um, kein Querüberlauf", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "de-DE", hasTouch: true, isMobile: true });
  try {
    await setupRoutes(page);
    await uebersicht(page);
    // Lage per offsetTop/offsetLeft — nicht während der Einstiegsanimation über getBoundingClientRect.
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
    const raster = await page.$$eval("a.ov-kpi", (as) => as.map((a) => [a.offsetLeft, a.offsetTop, a.offsetWidth, a.offsetHeight]));
    assert.equal(new Set(raster.map((r) => r[1])).size, 2, "zwei Reihen");
    assert.ok(raster.every((r) => r[2] >= 44 && r[3] >= 44), "Ziel kleiner als 44 × 44 px");
    await karte(page, "delayed").tap();
    await filterLeiste(page).waitFor({ timeout: 15000 });
    await page.waitForSelector(".shipment-cards .ce-list-card", { timeout: 15000 });
    const ueberlauf = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    assert.ok(ueberlauf <= 0, `Querüberlauf ${ueberlauf}px`);
    const karteText = await page.locator(".shipment-cards .ce-list-card").first().innerText();
    assert.match(karteText, /Verzögert/);
  } finally { await page.close(); }
});
