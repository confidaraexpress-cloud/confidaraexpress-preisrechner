// E2E: ConfidaraExpress als App — Service Worker, Cache-Invariante, Offline und
// Hinweise der Shell, gemessen am ECHTEN Produktionsbuild.
//
// Warum ein Produktionsbuild statt des Dev-Servers: Der Service Worker wird
// ausschließlich im Produktionsbuild registriert (import.meta.env.PROD). Die
// Suite baut deshalb in ein temporäres Verzeichnis und startet `vite preview`.
//
// Kernzusicherungen:
//   • Manifest und Icons werden ausgeliefert, vor und nach dem Login gleich.
//   • Der Service Worker kontrolliert die Seite (Scope "/").
//   • Cache Storage enthält nach echter Nutzung genau EINEN eigenen Cache
//     („ce-offline-v1") mit genau EINER Datei (/offline.html) — keine API-
//     Antwort in irgendeinem Cache; API-Antworten kommen nie vom Service Worker.
//   • Offline-Kaltstart zeigt die Offline-Seite, danach geht es online normal weiter.
//   • Neue Version → Hinweis mit „Neu laden", ohne automatisches Neuladen; im
//     Versandvorgang kein Hinweis. Offline → ruhiger Hinweis ohne Sperre.
//
// Backend vollständig gemockt. Keine echte Buchung, keine echte Mail, kein Provider.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 5441, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "nico.weber@weber-logistik.example.de", company_name: "Weber Logistik GmbH", name: "Nico Weber",
  role: "customer", status: "approved", country: "DE", zip: "10115", city: "Berlin", street: "Musterstraße 1",
  customer_number: "CE-K-10001", payment_term: 14,
};

let OUT, server, browser;

async function warteAufServer() {
  const deadline = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(BASE); if (r.ok || r.status < 500) return; } catch { /* noch nicht da */ }
    if (Date.now() > deadline) throw new Error("Preview-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function warteBisWeg() {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { await fetch(BASE); } catch { return; }
    if (Date.now() > deadline) throw new Error("Preview-Server läuft noch");
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function startePreview() {
  server = spawn("npx", ["vite", "preview", "--outDir", OUT, "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore", detached: true,
  });
  await warteAufServer();
}

function stoppePreview() {
  if (!server) return;
  // Die Prozessgruppe, nicht nur das Kind (npx → sh → node).
  try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
  try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  server = null;
}

// Jeder Backendaufruf wird beantwortet — nie durchgereicht.
async function mockApi(ctx, apiCalls) {
  await ctx.route("**/api.confidaraexpress.de/**", async (route) => {
    const url = new URL(route.request().url());
    apiCalls.push(url.pathname);
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    const p = url.pathname;
    if (p === "/kundenbereich") return json({ user: USER });
    if (p === "/kunde/notifications/unread-count") return json({ unreadCount: 0, snapshotAt: "2026-09-27T08:00:00.000Z" });
    if (p === "/kunde/notifications") return json({ notifications: [], unreadCount: 0, snapshotAt: "2026-09-27T08:00:00.000Z" });
    if (p === "/kunde/shipments") return json({ shipments: [], nextCursor: null });
    if (p === "/kunde/invoices") return json({ invoices: [], summary: { open_amount: 0, open_count: 0, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: false }, nextCursor: null });
    return json({ error: "nicht modelliert" }, 404);
  });
}

test.before(async () => {
  OUT = mkdtempSync(path.join(os.tmpdir(), "ce-pwa-core-"));
  await new Promise((resolve, reject) => {
    const b = spawn("npx", ["vite", "build", "--outDir", OUT, "--emptyOutDir", "--logLevel", "error"], { stdio: "ignore" });
    b.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`vite build beendet mit ${code}`))));
    b.on("error", reject);
  });
  await startePreview();
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  stoppePreview();
  if (OUT) rmSync(OUT, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────

test("P1 — Manifest und Icons werden ausgeliefert, vor und nach dem Login identisch verlinkt", async () => {
  const r = await fetch(`${BASE}/manifest.webmanifest`);
  assert.equal(r.status, 200);
  const m = await r.json();
  assert.equal(m.name, "ConfidaraExpress");
  assert.equal(m.start_url, "/dashboard");
  assert.equal(m.display, "standalone");
  assert.equal(m.icons.length, 4);
  for (const icon of m.icons) {
    const ir = await fetch(`${BASE}${icon.src}`);
    assert.equal(ir.status, 200, `${icon.src} fehlt im Build`);
    assert.match(ir.headers.get("content-type") || "", /image\/png/);
  }
  // Die Seite ist statisch: Login-Adresse und geschützte Adresse liefern dieselbe index.html.
  for (const adresse of ["/login", "/dashboard"]) {
    const html = await (await fetch(`${BASE}${adresse}`)).text();
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/, `${adresse}: Manifest-Link fehlt`);
  }
  for (const datei of ["/sw.js", "/offline.html"]) {
    assert.equal((await fetch(`${BASE}${datei}`)).status, 200, `${datei} fehlt im Build`);
  }
});

test("P2 — Service Worker kontrolliert die Seite; der Cache enthält nach echter Nutzung nur /offline.html", async () => {
  const apiCalls = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await mockApi(ctx, apiCalls);
  await ctx.addInitScript(() => { try { localStorage.setItem("ce_token", "e2e-pwa-token"); } catch { /* egal */ } });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  const vomServiceWorker = [];
  page.on("response", (res) => {
    if (res.url().includes("api.confidaraexpress.de") && res.fromServiceWorker()) vomServiceWorker.push(res.url());
  });

  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, script: r.active && r.active.scriptURL };
  });
  assert.equal(reg.scope, `${BASE}/`);
  assert.equal(reg.script, `${BASE}/sw.js`);

  // Nach dem Neuladen kontrolliert er die Seite; danach echte Nutzung mehrerer Bereiche.
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true, "Seite nicht kontrolliert");
  for (const bereich of ["overview", "invoices", "profile", "shipments"]) {
    await page.goto(`${BASE}/dashboard?page=${bereich}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app-shell");
  }
  assert.ok(apiCalls.length > 0, "es fand keine Backendnutzung statt — die Prüfung wäre wertlos");

  const caches = await page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      out[name] = (await c.keys()).map((req) => req.url);
    }
    return out;
  });
  const eigene = Object.keys(caches).filter((n) => n.startsWith("ce-"));
  assert.deepEqual(eigene, ["ce-offline-v1"], `unerwartete eigene Caches: ${JSON.stringify(Object.keys(caches))}`);
  assert.deepEqual(caches["ce-offline-v1"], [`${BASE}/offline.html`]);
  for (const [name, urls] of Object.entries(caches)) {
    for (const u of urls) {
      assert.doesNotMatch(u, /api\.confidaraexpress\.de|\/kunde\/|\/api\//, `${name} enthält eine API-Antwort: ${u}`);
    }
  }
  assert.deepEqual(vomServiceWorker, [], "API-Antworten dürfen nie vom Service Worker kommen");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("P3 — Offline-Kaltstart zeigt die Offline-Seite, danach funktioniert es online wieder", async () => {
  const apiCalls = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockApi(ctx, apiCalls);
  await ctx.addInitScript(() => { try { localStorage.setItem("ce_token", "e2e-pwa-token"); } catch { /* egal */ } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);

  // Netz weg: der Server ist nicht mehr erreichbar.
  stoppePreview();
  await warteBisWeg();
  await page.goto(`${BASE}/dashboard?page=invoices`, { waitUntil: "domcontentloaded" });
  assert.equal((await page.textContent("h1"))?.trim(), "Keine Internetverbindung");
  const text = await page.textContent("body");
  assert.ok(text.includes("Für aktuelle Versandpreise, Buchungen und Dokumente benötigt ConfidaraExpress eine Internetverbindung."));
  assert.equal(await page.locator(".app-shell").count(), 0, "keine App-Oberfläche mit alten Daten");
  assert.equal(await page.locator("a.retry").getAttribute("href"), "");

  // Netz wieder da: dieselbe Adresse lädt die Anwendung.
  await startePreview();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForSelector(".app-shell", { timeout: 20000 });
  await ctx.close();
});

test("P4 — neue Version: Hinweis mit „Neu laden“, kein automatisches Neuladen, nicht im Versandvorgang", async () => {
  const apiCalls = [];
  // Service Worker hier bewusst blockiert: geprüft wird allein der Versionshinweis,
  // und die Umleitung der index.html soll ohne Zwischenschicht greifen.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  await mockApi(ctx, apiCalls);
  await ctx.addInitScript(() => {
    try { localStorage.setItem("ce_token", "e2e-pwa-token"); } catch { /* egal */ }
    // Nur die Uhr der Seite verstellen, keine Timer: so lässt sich „15 Minuten später" prüfen.
    const echt = Date.now.bind(Date);
    window.__ceVersatzMs = 0;
    Date.now = () => echt() + window.__ceVersatzMs;
  });
  await ctx.route(`${BASE}/index.html`, async (route) => {
    const html = await (await fetch(`${BASE}/index.html`)).text();
    await route.fulfill({
      status: 200, contentType: "text/html",
      body: html.replace(/\/assets\/index-[A-Za-z0-9_-]+\.js/, "/assets/index-NEUEVERSION1.js"),
    });
  });
  const page = await ctx.newPage();
  const spaeter = async () => page.evaluate(() => {
    window.__ceVersatzMs += 16 * 60 * 1000;
    window.dispatchEvent(new Event("focus"));
  });

  await page.goto(`${BASE}/dashboard?page=invoices`, { waitUntil: "networkidle" });
  await page.evaluate(() => { window.__ceMarker = "unverändert"; });
  await spaeter();
  const hinweis = page.getByText("Eine neue Version von ConfidaraExpress ist verfügbar.");
  await hinweis.waitFor({ timeout: 10000 });
  assert.equal(await page.getByRole("button", { name: "Neu laden" }).count(), 1);
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => window.__ceMarker), "unverändert", "die Seite hat sich selbst neu geladen");

  // Im Versandvorgang kein Versionshinweis — weder auf der Buchungsseite noch in „Neue Sendung".
  for (const adresse of ["/booking", "/dashboard?page=new"]) {
    await page.goto(`${BASE}${adresse}`, { waitUntil: "networkidle" });
    await spaeter();
    await page.waitForTimeout(1500);
    assert.equal(await page.getByText("Eine neue Version von ConfidaraExpress ist verfügbar.").count(), 0,
      `${adresse}: Versionshinweis im laufenden Versandvorgang`);
  }

  // Offline: ruhiger Hinweis, keine Sperre — und er verschwindet wieder.
  await page.goto(`${BASE}/dashboard?page=invoices`, { waitUntil: "networkidle" });
  await ctx.setOffline(true);
  const offline = page.getByText("Keine Internetverbindung. Aktuelle Preise und Buchungen sind erst wieder verfügbar, wenn die Verbindung besteht.");
  await offline.waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[aria-modal="true"]').count(), 0, "kein Modal");
  await ctx.setOffline(false);
  await offline.waitFor({ state: "detached", timeout: 10000 });
  await ctx.close();
});
