// Browser-Smokes: Hamburger, Glocke und Navigations-Drawer (Auftrag 1, P6, 2026-10-17).
//
// Betreiberentscheidung: auf mobilen Ansichten links oben wieder das Hamburger-Symbol, rechts oben
// die Glocke mit dem kleinen Zähler (vorher die Textknöpfe „Menü" und „Mitteilungen"). Zugleich
// behoben: Escape schließt den Drawer, der Fokus wandert hinein und kehrt zurück, ein geschlossener
// Drawer ist per Tab nicht erreichbar, aria-expanded und aria-controls sind verdrahtet.
// Der Desktop behält die Textnavigation und den Knopf „Mitteilungen".
//
// Echter Dev-Server und Chromium; alle Backendrufe abgefangen, kontrollierte Testdaten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5278, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const KUNDE = {
  id: 1, email: "kunde@example.com", company_name: "Testfirma", name: "Test Kunde",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};
const ADMIN = { ...KUNDE, id: 2, email: "admin@example.com", name: "Test Admin", role: "admin" };

let server, browser;

async function neueSeite(pfad, { user = KUNDE, breite = 390, ungelesen = 3, touch = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: 800 }, hasTouch: touch, isMobile: touch });
  await ctx.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user });
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: ungelesen, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: ungelesen, snapshotAt: "", pagination: {} });
    return json({ items: [], users: [], shipments: [], invoices: [], drafts: [], addresses: [], summary: null, pagination: { total: 0 } });
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await page.goto(`${BASE}${pfad}`, { waitUntil: "networkidle" });
  return { ctx, page, fehler };
}

// visibilityProperty: ein geschlossener Drawer ist per `visibility: hidden` verborgen — ohne die
// Option meldet checkVisibility() ihn als sichtbar.
const sichtbar = (page, sel) => page.locator(sel).first().evaluate((el) => el.checkVisibility({ visibilityProperty: true }));
const aktivImDrawer = (page, drawerId) => page.evaluate((id) => {
  const d = document.getElementById(id);
  return !!d && d.contains(document.activeElement);
}, drawerId);

test.before(async () => {
  server = spawn("npm", ["run", "dev", "--", "--port", String(PORT), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], ...DEV_SERVER_SPAWN });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("Dev-Server startet nicht")), 60000);
    server.stdout.on("data", (d) => { if (String(d).includes("ready in") || String(d).includes("Local:")) { clearTimeout(t); setTimeout(res, 900); } });
  });
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  stopDevServer(server, "SIGTERM");
});

test("1 — Kunde 390 px: Hamburger links, Glocke rechts, Zähler an der Glocke, Namen unverändert", async () => {
  const { ctx, page, fehler } = await neueSeite("/dashboard");
  const menue = page.locator('.mobile-topbar button[aria-label="Menü – Navigation öffnen"]');
  const glocke = page.locator('.mobile-topbar button[aria-label^="Mitteilungen"]');
  await menue.waitFor({ state: "visible", timeout: 20000 });
  assert.equal((await menue.innerText()).trim(), "", "der Menüknopf zeigt Text statt des Symbols");
  assert.equal(await menue.locator("svg").count(), 1, "kein Hamburger-Symbol");
  assert.equal(await glocke.getAttribute("aria-label"), "Mitteilungen, 3 ungelesen");
  assert.equal(await glocke.locator("svg").count(), 1, "keine Glocke");
  assert.equal((await glocke.locator(".ntf-badge").innerText()).trim(), "3", "der Zähler fehlt");
  const lage = await page.evaluate(() => {
    const m = document.querySelector(".mobile-topbar .hamburger-btn").getBoundingClientRect();
    const g = document.querySelector(".mobile-topbar .ntf-bell").getBoundingClientRect();
    const z = document.querySelector(".mobile-topbar .ntf-badge").getBoundingClientRect();
    return { mLinks: m.left, gRechts: window.innerWidth - g.right, mW: m.width, mH: m.height, gW: g.width, gH: g.height,
             zImKnopf: z.left >= g.left - 1 && z.right <= g.right + 1 && z.top >= g.top - 1 };
  });
  assert.ok(lage.mLinks < 60 && lage.gRechts < 60, "Menü und Glocke stehen nicht in den Ecken");
  for (const [n, w] of [["Menü", lage.mW], ["Menü", lage.mH], ["Glocke", lage.gW], ["Glocke", lage.gH]]) assert.ok(w >= 44, `${n}: ${w} px`);
  assert.ok(lage.zImKnopf, "der Zähler sitzt nicht an der Glocke");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("2 — Kunde: Drawer mit aria-expanded/aria-controls, Fokus hinein, Escape schließt, Fokus zurück", async () => {
  const { ctx, page } = await neueSeite("/dashboard");
  const menue = page.locator('.mobile-topbar button[aria-label="Menü – Navigation öffnen"]');
  await menue.waitFor({ state: "visible", timeout: 20000 });
  const ziel = await menue.getAttribute("aria-controls");
  assert.equal(ziel, "ce-kundennavigation");
  assert.equal(await menue.getAttribute("aria-expanded"), "false");
  // Geschlossen: der Drawer ist unsichtbar und per Tab nicht erreichbar.
  assert.equal(await sichtbar(page, `#${ziel}`), false, "der geschlossene Drawer ist sichtbar");
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    assert.equal(await aktivImDrawer(page, ziel), false, "Tab erreicht den geschlossenen Drawer");
  }
  await menue.click();
  await page.waitForFunction((id) => document.getElementById(id).contains(document.activeElement), ziel, { timeout: 3000 });
  assert.equal(await menue.getAttribute("aria-expanded"), "true");
  // Tab bleibt im geöffneten Drawer.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    assert.equal(await aktivImDrawer(page, ziel), true, "der Fokus verlässt den geöffneten Drawer");
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.classList.contains("hamburger-btn"), null, { timeout: 3000 });
  assert.equal(await menue.getAttribute("aria-expanded"), "false");
  await page.waitForTimeout(500);
  assert.equal(await sichtbar(page, `#${ziel}`), false, "Escape schließt den Drawer nicht");
  await ctx.close();
});

test("3 — Glocke: öffnet das Mitteilungsfenster mit aria-controls, Escape schließt", async () => {
  const { ctx, page } = await neueSeite("/dashboard");
  const glocke = page.locator('.mobile-topbar button[aria-label^="Mitteilungen"]');
  await glocke.waitFor({ state: "visible", timeout: 20000 });
  assert.equal(await glocke.getAttribute("aria-expanded"), "false");
  await glocke.click();
  const panelId = await glocke.getAttribute("aria-controls");
  assert.ok(panelId, "aria-controls fehlt am geöffneten Knopf");
  assert.equal(await page.locator(`#${panelId}[role="dialog"]`).count(), 1, "aria-controls zeigt nicht auf das Fenster");
  assert.equal(await glocke.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Escape");
  await page.waitForFunction((id) => !document.getElementById(id), panelId, { timeout: 3000 });
  await ctx.close();
});

test("4 — Admin 390 px: Hamburger mit Zustand, Drawer schließt per Escape und gibt den Fokus zurück", async () => {
  const { ctx, page, fehler } = await neueSeite("/admin", { user: ADMIN });
  const menue = page.locator('.adm-topbar button[aria-label="Menü öffnen"]');
  await menue.waitFor({ state: "visible", timeout: 20000 });
  assert.equal((await menue.innerText()).trim(), "");
  assert.equal(await menue.locator("svg").count(), 1, "kein Hamburger-Symbol");
  assert.equal(await menue.getAttribute("aria-controls"), "ce-adminnavigation");
  assert.equal(await sichtbar(page, "#ce-adminnavigation"), false, "die geschlossene Adminsidebar ist sichtbar");
  await menue.click();
  await page.waitForFunction(() => document.getElementById("ce-adminnavigation").contains(document.activeElement), null, { timeout: 3000 });
  assert.equal(await menue.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.classList.contains("adm-topbar-burger"), null, { timeout: 3000 });
  assert.equal(await menue.getAttribute("aria-expanded"), "false");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("5 — Desktop 1440 px: Textnavigation und Knopf „Mitteilungen“ bleiben, kein Hamburger", async () => {
  const { ctx, page } = await neueSeite("/dashboard?page=shipments", { breite: 1440, touch: false });
  await page.waitForSelector("#ce-kundennavigation", { timeout: 20000 });
  assert.equal(await sichtbar(page, "#ce-kundennavigation"), true, "die Sidebar ist auf dem Desktop unsichtbar");
  assert.equal(await sichtbar(page, ".mobile-topbar .hamburger-btn"), false, "der Hamburger erscheint auf dem Desktop");
  const desktopGlocke = page.locator('button.ntf-bell:not(.ntf-bell-topbar)').first();
  await desktopGlocke.waitFor({ state: "visible", timeout: 10000 });
  assert.match(await desktopGlocke.innerText(), /Mitteilungen/, "der Desktop zeigt nicht mehr das Wort „Mitteilungen“");
  await ctx.close();
});
