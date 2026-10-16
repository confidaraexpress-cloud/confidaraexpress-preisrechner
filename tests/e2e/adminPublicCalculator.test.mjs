// E2E: Admin „Öffentlicher Preisrechner“ (/admin/public-calculator) gegen ein gemocktes Backend.
//
//   M  1440 und 390 px: Karte der Übersicht → Seite; Anzeige 25,00 %, Status, letzte Änderung; Änderung in de-DE
//      mit Bestätigung (alter und neuer Wert, Wirkung) und der gelesenen Revision; ungültige und unveränderte
//      Werte erreichen den Server nicht; der Schalter hat eine eigene Bestätigung.
//   K  Konflikt (409): Hinweis, aktueller Stand sichtbar, nichts gespeichert, Neuladen.
//   S  Die Admin-Sidebar bleibt unverändert: kein neuer Eintrag, „Protokoll“ bleibt der letzte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5566, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress", name: "Anna Admin",
  role: "admin", status: "approved", country: "DE" };
const STAND = { markupPercent: 25, enabled: false, revision: 1, updatedAt: "2026-10-16T12:30:00.000Z", updatedBy: 3 };

let server, browser;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

async function setup(page, { konflikt = false } = {}) {
  const p = { stand: { ...STAND }, puts: [], gets: 0 };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (pfad === "/admin/public-calculator/settings") { p.gets += 1; return json(p.stand); }
    if (pfad === "/admin/public-calculator/markup" || pfad === "/admin/public-calculator/availability") {
      const body = req.postDataJSON();
      p.puts.push({ pfad, body });
      if (konflikt) {
        p.stand = { ...p.stand, markupPercent: 30, revision: 5, updatedBy: 2 };
        return json({ error: "geändert", code: "PUBLIC_CALCULATOR_REVISION_CONFLICT", current: p.stand }, 409);
      }
      if (body.expectedRevision !== p.stand.revision) return json({ code: "PUBLIC_CALCULATOR_REVISION_CONFLICT", current: p.stand }, 409);
      p.stand = pfad.endsWith("/markup")
        ? { ...p.stand, markupPercent: body.markupPercent, revision: p.stand.revision + 1, updatedAt: "2026-10-16T13:00:00.000Z", updatedBy: 1 }
        : { ...p.stand, enabled: body.enabled, revision: p.stand.revision + 1, updatedAt: "2026-10-16T13:05:00.000Z", updatedBy: 1 };
      return json(p.stand);
    }
    if (pfad.includes("/admin/metrics/customer-accounts")) return json({ count: 0 });
    if (pfad.includes("/admin/operations")) return json({ queues: [] });
    return json({ items: [], pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return p;
}

async function neueSeite(viewport) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await kurz(250);
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
});

for (const [breite, hoehe] of [[1440, 900], [390, 844]]) {
  test(`M ${breite}px — Karte der Übersicht, Anzeige, Änderung mit Bestätigung und Revision, Schalter mit eigener Bestätigung`, async () => {
    const { page, fehler } = await neueSeite({ width: breite, height: hoehe });
    const p = await setup(page);
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    const kachel = page.locator('a.adm-tile[href="/admin/public-calculator"]');
    await kachel.waitFor({ state: "visible", timeout: 30000 });
    await kachel.click();
    await page.waitForSelector("#adm-pc-markup-value", { timeout: 20000 });
    assert.equal(norm(await page.locator("#adm-pc-markup-value").innerText()), "25,00 %");
    assert.equal(norm(await page.locator("#adm-pc-status").innerText()), "Ausgeschaltet");
    assert.match(norm(await page.locator("#adm-pc-last-change").innerText()), /\d{2}\.\d{2}\.2026, \d{2}:\d{2} Uhr · Admin #3/);
    assert.equal(await page.locator("#adm-pc-markup-input").inputValue(), "25,00");

    // Ungültig und unverändert: nie ein Request.
    await page.fill("#adm-pc-markup-input", "25,555");
    await page.click("#adm-pc-markup-submit");
    assert.match(norm(await page.locator("#adm-pc-markup-error").innerText()), /höchstens zwei Nachkommastellen/);
    await page.fill("#adm-pc-markup-input", "25");
    await page.click("#adm-pc-markup-submit");
    assert.match(norm(await page.locator("#adm-pc-message").innerText()), /keine Änderung nötig/);
    assert.equal(p.puts.length, 0);

    // Änderung in de-DE: Bestätigung mit altem und neuem Wert samt Wirkung, dann mit der gelesenen Revision.
    await page.fill("#adm-pc-markup-input", "22,5");
    await page.click("#adm-pc-markup-submit");
    const dialog = page.locator(".adm-modal");
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    const dialogText = norm(await dialog.innerText());
    assert.match(dialogText, /Bisher 25,00 %, neu 22,50 %\./);
    assert.match(dialogText, /Wirkung: Ab der nächsten Berechnung/);
    assert.equal(p.puts.length, 0, "vor der Bestätigung wird nichts gesendet");
    await page.click("#adm-pc-markup-confirm");
    await page.waitForSelector("#adm-pc-message.alert-success", { timeout: 10000 });
    assert.deepEqual(p.puts[0], { pfad: "/admin/public-calculator/markup", body: { markupPercent: 22.5, expectedRevision: 1 } });
    assert.equal(norm(await page.locator("#adm-pc-markup-value").innerText()), "22,50 %");

    // Schalter: eigene Bestätigung, mit der neuen Revision.
    await page.click("#adm-pc-availability-toggle");
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    assert.match(norm(await dialog.innerText()), /Preisrechner einschalten/);
    await page.click("#adm-pc-availability-confirm");
    await page.waitForFunction(() => document.querySelector("#adm-pc-status")?.textContent.trim() === "Eingeschaltet", null, { timeout: 10000 });
    assert.deepEqual(p.puts[1], { pfad: "/admin/public-calculator/availability", body: { enabled: true, expectedRevision: 2 } });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Querscrollen");
    assert.deepEqual(fehler, []);
    await page.close();
  });
}

test("K — Konflikt: Hinweis, aktueller Stand sichtbar, nichts gespeichert, Neuladen", async () => {
  const { page, fehler } = await neueSeite({ width: 1440, height: 900 });
  const p = await setup(page, { konflikt: true });
  await page.goto(`${BASE}/admin/public-calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#adm-pc-markup-input", { timeout: 30000 });
  await page.fill("#adm-pc-markup-input", "20");
  await page.click("#adm-pc-markup-submit");
  await page.click("#adm-pc-markup-confirm");
  await page.waitForSelector("#adm-pc-conflict", { timeout: 10000 });
  assert.match(norm(await page.locator("#adm-pc-conflict").innerText()), /nicht gespeichert/);
  assert.equal(norm(await page.locator("#adm-pc-markup-value").innerText()), "30,00 %", "der aktuelle Stand des Servers");
  const vorher = p.gets;
  await page.locator("#adm-pc-conflict").getByRole("button", { name: "Aktuellen Stand laden" }).click();
  await page.waitForFunction(() => !document.querySelector("#adm-pc-conflict"), null, { timeout: 10000 });
  assert.equal(p.gets, vorher + 1);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("S — die Admin-Sidebar bleibt unverändert: kein Eintrag für den Preisrechner, „Protokoll“ bleibt der letzte", async () => {
  const { page, fehler } = await neueSeite({ width: 1440, height: 900 });
  await setup(page);
  await page.goto(`${BASE}/admin/public-calculator`, { waitUntil: "domcontentloaded" });
  await page.locator(".adm-nav").waitFor({ state: "visible", timeout: 30000 });
  const links = await page.locator(".adm-nav a").evaluateAll((as) => as.map((a) => [a.getAttribute("href"), a.textContent.trim()]));
  assert.ok(!links.some(([href]) => href === "/admin/public-calculator"), "neuer Sidebar-Eintrag");
  assert.equal(links.at(-1)[1], "Protokoll");
  const m = await page.locator(".adm-nav").evaluate((nav) => ({ scroll: nav.scrollHeight, client: nav.clientHeight }));
  assert.ok(m.scroll <= m.client, "die Navigation scrollt");
  assert.deepEqual(fehler, []);
  await page.close();
});
