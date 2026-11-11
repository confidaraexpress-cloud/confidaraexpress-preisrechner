// E2E: Admin-Anmeldung /admin/login (Canonical v2.130) — echter Dev-Server, Backend vollständig gemockt.
//
// Abgedeckt: Anmeldung über POST /auth/admin-login → /admin; Kunde ohne Adminzugang (kein Token); falsches Passwort;
// Schutzroute mit Rücksprung; Sitzungsende im Adminbereich → /admin/login mit Hinweis; Abmelden → /admin/login (Sitzung
// serverseitig widerrufen); angemeldeter Admin → /admin; „Passwort vergessen?“ neutral; Einmallink (Adresse bereinigt,
// Passwort selbst setzen); Passwort anzeigen/verbergen per Tastatur; Ladezustand; Kundenlogin verweist ab Stufe 2 auf
// die Admin-Anmeldung; Smartphone ohne Überlauf; reduzierte Bewegung; keine Konsolenfehler.
// Kein echtes Backend, keine Mail, keine echten Konten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5785, BASE = `http://127.0.0.1:${PORT}`;
const TOKEN_ADMIN = "e2e-admin-token";
const RESET = "ab".repeat(32);

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = { id: 7, email: "admin.eins@firma.test", name: "Admin Eins", company_name: "ConfidaraExpress", role: "admin", status: "approved" };

let server, browser;

// Mock-Backend. `aufrufe` sammelt jede Anfrage (Pfad, Methode, Body), `stand` steuert die Antworten je Test.
function backend(page, stand = {}) {
  const aufrufe = [];
  page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    let body = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    aufrufe.push({ p, methode: req.method(), body, auth: req.headers().authorization || null });
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/auth/admin-login")) {
      if (stand.adminLogin) return stand.adminLogin(route, json, body);
      return json({ message: "Erfolgreich angemeldet", token: TOKEN_ADMIN });
    }
    if (p.endsWith("/login")) {
      if (stand.login) return stand.login(route, json, body);
      return json({ error: "E-Mail oder Passwort falsch", code: "INVALID_CREDENTIALS" }, 401);
    }
    if (p.endsWith("/kundenbereich")) {
      if (stand.kundenbereich) return stand.kundenbereich(route, json);
      return json({ user: ADMIN });
    }
    if (p.endsWith("/auth/logout")) return json({ ok: true, revoked: true });
    if (p.endsWith("/auth/forgot-password")) return json({ message: "Falls ein Konto existiert, wurde eine E-Mail gesendet." });
    if (p.includes("/auth/validate-reset-token/")) return json(stand.resetGueltig === false ? { valid: false, code: "RESET_TOKEN_EXPIRED" } : { valid: true });
    if (p.endsWith("/auth/reset-password")) return json({ message: "Passwort erfolgreich zurückgesetzt" });
    if (stand.admin401 && p.includes("/admin/")) return json({ error: "Sitzung abgelaufen. Bitte melden Sie sich erneut an.", code: "SESSION_EXPIRED" }, 401);
    // Übersicht /admin: dieselben Antwortformen wie das echte Backend (siehe adminOverviewMetrics.test.mjs).
    if (p.endsWith("/admin/metrics/customer-accounts")) return json({ total: 0 });
    if (p.endsWith("/admin/users")) return json({ users: [], pagination: { total: 0 } });
    if (p.endsWith("/admin/invoices")) return json({ invoices: [], pagination: { total: 0 } });
    if (p.endsWith("/admin/cancellation-requests")) return json({ cancellationRequests: [], pagination: { total: 0 } });
    if (p.endsWith("/admin/support-requests")) return json({ supportRequests: [], pagination: { total: 0 } });
    if (p.endsWith("/admin/sales-partners")) return json({ partners: [], total: 0, limit: 5, offset: 0 });
    if (p.endsWith("/admin/dispatch-evidence/queue")) return json({ items: [], total: 0, limit: 5, offset: 0 });
    if (p.endsWith("/admin/users/5")) return json({ user: { id: 5, email: "x@firma.test", name: "X", company_name: "X GmbH", status: "approved", role: "customer" }, summary: {} });
    return json({});
  });
  return aufrufe;
}

async function neueSeite({ viewport = { width: 1440, height: 900 }, mobil = false, token = null, reduce = false } = {}) {
  const ctx = await browser.newContext({ viewport, isMobile: mobil, hasTouch: mobil, deviceScaleFactor: mobil ? 2 : 1,
    locale: "de-DE", reducedMotion: reduce ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") fehler.push(`console: ${m.text()}`); });
  if (token) await page.addInitScript((t) => localStorage.setItem("ce_token", t), token);
  return { ctx, page, fehler };
}

const meldung = async (page, art) => (await page.locator(`.auth-admin-meldung--${art}`).first().innerText()).replace(/\s+/g, " ").trim();

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

test("A — Admin meldet sich über POST /auth/admin-login an und landet in /admin (ohne „Angemeldet bleiben“)", async () => {
  const { ctx, page, fehler } = await neueSeite();
  const aufrufe = backend(page);
  await page.goto(`${BASE}/admin/login`);
  await assert.doesNotReject(page.waitForSelector("h1.auth-admin-titel"));
  assert.equal((await page.locator("h1").innerText()).replace(/\s+/g, " ").trim(), "Adminbereich");
  assert.equal(await page.locator("h1 img").getAttribute("alt"), "ConfidaraExpress");
  assert.equal(await page.locator("text=Registrieren").count(), 0, "keine Registrierung");
  assert.equal(await page.locator("text=Angemeldet bleiben").count(), 0);
  await page.fill("input[type=email]", "admin.eins@firma.test");
  await page.fill("input[type=password]", "Admin-Passwort-2026!");
  await page.press("input[type=password]", "Enter");
  await page.waitForURL(`${BASE}/admin`);
  const anmeldung = aufrufe.find((a) => a.p.endsWith("/auth/admin-login"));
  assert.ok(anmeldung, "der Admin-Eingang wurde nicht aufgerufen");
  assert.deepEqual(anmeldung.body, { email: "admin.eins@firma.test", password: "Admin-Passwort-2026!" });
  assert.ok(!aufrufe.some((a) => a.p.endsWith("/login") && !a.p.endsWith("/admin-login")), "der Kundenlogin wurde benutzt");
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), TOKEN_ADMIN);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B — Kunde mit richtigem Passwort: Meldung, kein Token, bleibt auf /admin/login", async () => {
  const { ctx, page, fehler } = await neueSeite();
  backend(page, { adminLogin: (_r, json) => json({ error: "Für dieses Konto besteht kein Zugang zum Adminbereich.", code: "ADMIN_ACCESS_REQUIRED" }, 403) });
  await page.goto(`${BASE}/admin/login`);
  await page.fill("input[type=email]", "kunde@firma.test");
  await page.fill("input[type=password]", "Kunden-Passwort");
  await page.click(".auth-admin-cta");
  assert.equal(await meldung(page, "fehler"), "Für dieses Konto besteht kein Zugang zum Adminbereich.");
  assert.equal(new URL(page.url()).pathname, "/admin/login");
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), null);
  assert.deepEqual(fehler.filter((f) => !/403/.test(f)), []);
  await ctx.close();
});

test("C — falsches Passwort: wortgleiche Meldung wie unbekannte Adresse; leere Felder werden genannt", async () => {
  const { ctx, page } = await neueSeite();
  backend(page, { adminLogin: (_r, json) => json({ error: "E-Mail oder Passwort falsch", code: "INVALID_CREDENTIALS" }, 401) });
  await page.goto(`${BASE}/admin/login`);
  await page.click(".auth-admin-cta");
  assert.equal(await meldung(page, "fehler"), "Bitte geben Sie E-Mail-Adresse und Passwort ein.");
  await page.fill("input[type=email]", "niemand@firma.test");
  await page.fill("input[type=password]", "falsch-falsch");
  await page.click(".auth-admin-cta");
  await page.waitForFunction(() => /nicht korrekt/.test(document.querySelector(".auth-admin-meldung--fehler")?.textContent || ""));
  assert.equal(await meldung(page, "fehler"), "E-Mail-Adresse oder Passwort sind nicht korrekt.");
  await ctx.close();
});

test("D — Schutzroute: /admin/users/5 ohne Sitzung → /admin/login → nach der Anmeldung zurück", async () => {
  const { ctx, page } = await neueSeite();
  backend(page);
  await page.goto(`${BASE}/admin/users/5`);
  await page.waitForURL(`${BASE}/admin/login`);
  await page.fill("input[type=email]", "admin.eins@firma.test");
  await page.fill("input[type=password]", "Admin-Passwort-2026!");
  await page.click(".auth-admin-cta");
  await page.waitForURL(`${BASE}/admin/users/5`);
  await ctx.close();
});

test("E — Sitzungsende im Adminbereich → /admin/login mit Hinweis, Rücksprung bleibt", async () => {
  const { ctx, page } = await neueSeite({ token: TOKEN_ADMIN });
  backend(page, { admin401: true });
  await page.goto(`${BASE}/admin/users/5`);
  await page.waitForURL(`${BASE}/admin/login`);
  assert.equal(await meldung(page, "info"), "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.");
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), null, "das Token ist verworfen");
  await ctx.close();
});

test("F — Abmelden aus dem Adminpanel → /admin/login; die Sitzung wird serverseitig widerrufen", async () => {
  const { ctx, page } = await neueSeite({ token: TOKEN_ADMIN });
  const aufrufe = backend(page);
  await page.goto(`${BASE}/admin`);
  await page.locator("button", { hasText: "Abmelden" }).first().click();
  await page.waitForURL(`${BASE}/admin/login`);
  const logout = aufrufe.find((a) => a.p.endsWith("/auth/logout"));
  assert.ok(logout && logout.auth === `Bearer ${TOKEN_ADMIN}`, "kein serverseitiger Widerruf");
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), null);
  assert.equal(await page.locator(".auth-admin-meldung--info").count(), 0, "gewolltes Abmelden ist kein Sitzungsende");
  await ctx.close();
});

test("G — angemeldeter Admin öffnet /admin/login → direkt /admin", async () => {
  const { ctx, page } = await neueSeite({ token: TOKEN_ADMIN });
  backend(page);
  await page.goto(`${BASE}/admin/login`);
  await page.waitForURL(`${BASE}/admin`);
  await ctx.close();
});

test("G2 — Einmallink bei offener Sitzung (Einrichtung): Link-Schritt statt Adminpanel, nach dem Speichern endet die Sitzung", async () => {
  // Ablauf aus dem Runbook: der gemeinsame Zugang ist in diesem Browser angemeldet, Patrick öffnet SEINEN Link.
  const { ctx, page } = await neueSeite({ token: TOKEN_ADMIN });
  const aufrufe = backend(page);
  await page.goto(`${BASE}/admin/login?reset=${RESET}`);
  await page.waitForSelector("text=Neues Passwort festlegen");
  await page.waitForFunction(() => !location.search.includes("reset="));
  await page.waitForTimeout(500); // kein späterer Sprung ins Adminpanel der offenen Sitzung
  assert.equal(new URL(page.url()).pathname, "/admin/login");
  const felder = page.locator("input[autocomplete=new-password]");
  await felder.nth(0).fill("Patricks-eigenes-Passwort-2026");
  await felder.nth(1).fill("Patricks-eigenes-Passwort-2026");
  await page.click(".auth-admin-cta");
  assert.equal(await meldung(page, "erfolg"), "Ihr Passwort ist gespeichert. Sie können sich jetzt anmelden.");
  await page.waitForSelector("input[autocomplete=current-password]");
  const logout = aufrufe.find((a) => a.p.endsWith("/auth/logout"));
  assert.ok(logout && logout.auth === `Bearer ${TOKEN_ADMIN}`, "die offene Sitzung wurde nicht serverseitig beendet");
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), null);
  assert.equal(new URL(page.url()).pathname, "/admin/login", "kein Sprung in die alte Sitzung");
  await ctx.close();
});

test("H — Passwort vergessen: neutrale Meldung, Adresse übernommen, zurück zur Anmeldung", async () => {
  const { ctx, page } = await neueSeite();
  const aufrufe = backend(page);
  await page.goto(`${BASE}/admin/login`);
  await page.fill("input[type=email]", "admin.zwei@firma.test");
  await page.click("text=Passwort vergessen?");
  assert.equal(await page.inputValue("input[type=email]"), "admin.zwei@firma.test", "die Adresse wird übernommen");
  await page.click(".auth-admin-cta");
  assert.match(await meldung(page, "erfolg"), /^Falls zu dieser E-Mail-Adresse ein Konto besteht/);
  assert.deepEqual(aufrufe.find((a) => a.p.endsWith("/auth/forgot-password")).body, { email: "admin.zwei@firma.test" });
  await page.click("text=Zurück zur Anmeldung");
  await page.waitForSelector("input[type=password]");
  await ctx.close();
});

test("I — Einmallink: Adresse bereinigt, Passwort selbst setzen, danach Anmeldung", async () => {
  const { ctx, page } = await neueSeite();
  const aufrufe = backend(page);
  await page.goto(`${BASE}/admin/login?reset=${RESET}`);
  await page.waitForSelector("text=Neues Passwort festlegen");
  await page.waitForFunction(() => !location.search.includes("reset="));
  const felder = page.locator("input[autocomplete=new-password]");
  await felder.first().waitFor();
  assert.equal(await felder.count(), 2);
  await felder.nth(0).fill("Neues-Admin-Passwort-2026");
  await felder.nth(1).fill("Abweichend-2026");
  await page.click(".auth-admin-cta");
  assert.equal(await meldung(page, "fehler"), "Die Passwörter stimmen nicht überein.");
  await felder.nth(1).fill("Neues-Admin-Passwort-2026");
  await page.click(".auth-admin-cta");
  assert.equal(await meldung(page, "erfolg"), "Ihr Passwort ist gespeichert. Sie können sich jetzt anmelden.");
  await page.waitForSelector("input[type=email]");
  const setzen = aufrufe.find((a) => a.p.endsWith("/auth/reset-password"));
  assert.deepEqual(setzen.body, { token: RESET, password: "Neues-Admin-Passwort-2026" });
  await ctx.close();
});

test("J — abgelaufener Einmallink: Erklärung und direkt der Weg zu einem neuen Link", async () => {
  const { ctx, page } = await neueSeite();
  backend(page, { resetGueltig: false });
  await page.goto(`${BASE}/admin/login?reset=${RESET}`);
  await page.waitForSelector("text=Passwort zurücksetzen");
  assert.match(await meldung(page, "fehler"), /abgelaufen/);
  await ctx.close();
});

test("K — Passwort anzeigen/verbergen per Tastatur; Reihenfolge E-Mail → Passwort → Auge → vergessen → Anmelden", async () => {
  const { ctx, page } = await neueSeite();
  backend(page);
  await page.goto(`${BASE}/admin/login`);
  await page.focus("input[type=email]");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("autocomplete")), "current-password");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Passwort anzeigen");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("input[autocomplete=current-password]").getAttribute("type"), "text");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-pressed")), "true");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Passwort vergessen?");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.className), "auth-admin-cta");
  // Sichtbarer Fokus am Knopf.
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.notEqual(outline, "none");
  await ctx.close();
});

test("L — Ladezustand: Knopf gesperrt mit „Anmeldung läuft …“, kein Doppelversand", async () => {
  const { ctx, page } = await neueSeite();
  let freigeben;
  const halt = new Promise((r) => { freigeben = r; });
  const aufrufe = backend(page, { adminLogin: async (_r, json) => { await halt; return json({ message: "ok", token: TOKEN_ADMIN }); } });
  await page.goto(`${BASE}/admin/login`);
  await page.fill("input[type=email]", "admin.eins@firma.test");
  await page.fill("input[type=password]", "Admin-Passwort-2026!");
  await page.click(".auth-admin-cta");
  await page.waitForSelector(".auth-admin-cta[aria-busy=true]");
  assert.match(await page.locator(".auth-admin-cta").innerText(), /Anmeldung läuft/);
  assert.equal(await page.locator(".auth-admin-cta").isDisabled(), true);
  await page.press("input[type=password]", "Enter");
  freigeben();
  await page.waitForURL(`${BASE}/admin`);
  assert.equal(aufrufe.filter((a) => a.p.endsWith("/auth/admin-login")).length, 1, "kein Doppelversand");
  await ctx.close();
});

test("M — Kundenlogin (Stufe 2): ein Adminkonto bekommt den Weg zur Admin-Anmeldung", async () => {
  const { ctx, page } = await neueSeite();
  backend(page, { login: (_r, json) => json({ error: "Administratoren melden sich über die Admin-Anmeldung an.", code: "ADMIN_LOGIN_REQUIRED" }, 403) });
  await page.goto(`${BASE}/login`);
  await page.fill("input[type=email]", "admin.eins@firma.test");
  await page.fill("input[type=password]", "Admin-Passwort-2026!");
  await page.click("button[type=submit]");
  await page.waitForSelector("#auth-admin-weg a");
  assert.equal(await page.locator("#auth-admin-weg a").getAttribute("href"), "/admin/login");
  await page.click("#auth-admin-weg a");
  await page.waitForURL(`${BASE}/admin/login`);
  await ctx.close();
});

test("N — Smartphone 390 px: kein Überlauf, große Bedienelemente, kein Autofokus beim Öffnen", async () => {
  const { ctx, page, fehler } = await neueSeite({ viewport: { width: 390, height: 844 }, mobil: true });
  backend(page);
  await page.goto(`${BASE}/admin/login`);
  await page.waitForSelector(".auth-admin-panel");
  const masse = await page.evaluate(() => ({
    breite: document.documentElement.scrollWidth, fenster: window.innerWidth,
    panel: document.querySelector(".auth-admin-panel").getBoundingClientRect().width,
    // Gleiche Ränder links und rechts: eine zu breite Spalte verdeckte overflow-x: clip früher nur rechts.
    raender: (() => { const b = document.querySelector(".auth-admin-panel").getBoundingClientRect(); return [b.left, window.innerWidth - b.right]; })(),
    knopf: document.querySelector(".auth-admin-cta").getBoundingClientRect().height,
    feld: document.querySelector(".auth-admin-eingabe").getBoundingClientRect().height,
    fokus: document.activeElement?.tagName,
  }));
  assert.ok(masse.breite <= masse.fenster, `horizontaler Überlauf ${masse.breite} > ${masse.fenster}`);
  assert.ok(masse.panel <= 390 - 32 + 1, `Panel ${masse.panel}`);
  assert.ok(Math.abs(masse.raender[0] - masse.raender[1]) < 1, `Ränder ungleich ${masse.raender.join(" / ")}`);
  assert.ok(masse.knopf >= 44 && masse.feld >= 44);
  assert.notEqual(masse.fokus, "INPUT", "kein Autofokus auf Touch-Geräten (Tastatur verdeckte die Seite)");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("O — reduzierte Bewegung: die Bühne steht still, das Formular bleibt bedienbar", async () => {
  const { ctx, page } = await neueSeite({ reduce: true });
  backend(page);
  await page.goto(`${BASE}/admin/login`);
  await page.waitForSelector(".auth-admin-panel");
  const anim = await page.evaluate(() => ["auth-admin-band--1", "auth-admin-impuls", "auth-admin-form--kugel", "auth-admin-panel"]
    .map((k) => getComputedStyle(document.querySelector(`.${k}`)).animationName));
  assert.deepEqual(anim, ["none", "none", "none", "none"]);
  assert.equal(await page.locator(".auth-admin-cta").isEnabled(), true);
  await ctx.close();
});
