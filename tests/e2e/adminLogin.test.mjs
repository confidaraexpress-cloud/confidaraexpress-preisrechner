// E2E: Admin-Anmeldung /admin/login (Canonical v2.130) — echter Dev-Server, Backend vollständig gemockt.
//
// Abgedeckt: Anmeldung über POST /auth/admin-login → /admin; Kunde ohne Adminzugang (kein Token); falsches Passwort;
// Schutzroute mit Rücksprung; Sitzungsende im Adminbereich → /admin/login mit Hinweis; Abmelden → /admin/login (Sitzung
// serverseitig widerrufen); angemeldeter Admin → /admin; „Passwort vergessen?“ neutral; Einmallink (Adresse bereinigt,
// Passwort selbst setzen); Passwort anzeigen/verbergen per Tastatur; Ladezustand; Kundenlogin verweist ab Stufe 2 auf
// die Admin-Anmeldung; Smartphone ohne Überlauf; reduzierte Bewegung (Hologramm als Standbild); Komposition in 1440,
// 768 und 390 px (Hologramm-Paket ganz im Bild, verdeckt weder Panel noch Bedienelemente; Canonical v2.131); keine
// Konsolenfehler; Typografie unverändert gegenüber dem Stand vor der Confidara Signature Typography (Test Q).
// Kein echtes Backend, keine Mail, keine echten Konten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { adminAnmeldungTypografie } from "./helpers/adminAnmeldungTypografie.mjs";
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
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

test("O — reduzierte Bewegung: das Hologramm steht still und bleibt sichtbar, das Formular bleibt bedienbar", async () => {
  const { ctx, page } = await neueSeite({ reduce: true });
  backend(page);
  await page.goto(`${BASE}/admin/login`);
  await page.waitForSelector(".auth-admin-panel");
  const m = await page.evaluate(() => {
    const stil = (k) => getComputedStyle(document.querySelector(`.${k}`));
    return {
      anim: ["auth-admin-holo-paket", "auth-admin-holo-schwebe", "auth-admin-holo-scan", "auth-admin-holo-impuls", "auth-admin-holo-orbit-lauf", "auth-admin-panel"]
        .map((k) => stil(k).animationName),
      glanz: getComputedStyle(document.querySelector(".auth-admin-glanz"), "::before").animationName,
      // Standbild, nicht leer: das Paket ist da, Scanlinie und Impulse stehen sichtbar.
      holo: stil("auth-admin-holo").display, scan: Number(stil("auth-admin-holo-scan").opacity), impuls: Number(stil("auth-admin-holo-impuls").opacity),
    };
  });
  assert.deepEqual(m.anim, ["none", "none", "none", "none", "none", "none"]);
  assert.equal(m.glanz, "none");
  assert.notEqual(m.holo, "none");
  assert.ok(m.scan > 0.5 && m.impuls > 0.5, `Standbild leer: Scan ${m.scan}, Impuls ${m.impuls}`);
  assert.equal(await page.locator(".auth-admin-cta").isEnabled(), true);
  await ctx.close();
});

for (const [name, viewport, mobil] of [["1440", { width: 1440, height: 900 }, false], ["768", { width: 768, height: 1024 }, true], ["390", { width: 390, height: 844 }, true]]) {
  test(`P — Komposition ${name} px: Hologramm gut sichtbar, verdeckt nichts, das Formular bleibt vorn und bedienbar`, async () => {
    const { ctx, page, fehler } = await neueSeite({ viewport, mobil });
    backend(page);
    await page.goto(`${BASE}/admin/login`);
    await page.waitForSelector(".auth-admin-panel input");
    const m = await page.evaluate(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, u: b.bottom, b: b.width, h: b.height }; };
      const flaechen = [...document.querySelectorAll(".auth-admin-holo-flaeche")].map((e) => e.getBoundingClientRect());
      const paket = { l: Math.min(...flaechen.map((f) => f.left)), t: Math.min(...flaechen.map((f) => f.top)),
        r: Math.max(...flaechen.map((f) => f.right)), u: Math.max(...flaechen.map((f) => f.bottom)) };
      const panel = r(document.querySelector(".auth-admin-panel"));
      // Was liegt in der Mitte jedes Bedienelements obenauf? Muss das Element selbst (oder ein Kind) sein.
      const vorn = [...document.querySelectorAll(".auth-admin-panel input, .auth-admin-auge, .auth-admin-link, .auth-admin-cta")].map((e) => {
        const b = e.getBoundingClientRect();
        const oben = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return e === oben || e.contains(oben);
      });
      return { paket, panel, vorn, fenster: [innerWidth, innerHeight], scrollW: document.documentElement.scrollWidth,
        holoKlicks: getComputedStyle(document.querySelector(".auth-admin-holo")).pointerEvents };
    });
    const [w] = m.fenster;
    assert.ok(m.scrollW <= w, `horizontaler Überlauf ${m.scrollW} > ${w}`);
    // Das Paket ist ganz im Bild und groß genug, um als Motiv zu tragen.
    assert.ok(m.paket.l >= 0 && m.paket.r <= w && m.paket.t >= 0, `Paket außerhalb des Bildes ${JSON.stringify(m.paket)}`);
    const paketBreite = m.paket.r - m.paket.l;
    assert.ok(paketBreite >= (w >= 960 ? 280 : 150), `Paket zu klein: ${Math.round(paketBreite)} px`);
    // Kein Überdecken: Paket und Panel überschneiden sich nicht; ab 60em steht das Hologramm links neben dem Panel.
    const ueberschneidung = m.paket.l < m.panel.r && m.paket.r > m.panel.l && m.paket.t < m.panel.u && m.paket.u > m.panel.t;
    assert.equal(ueberschneidung, false, `Paket überdeckt das Panel ${JSON.stringify({ paket: m.paket, panel: m.panel })}`);
    if (w >= 960) assert.ok(m.paket.r <= m.panel.l, "das Hologramm steht links neben dem Panel");
    else assert.ok(m.paket.u <= m.panel.t, "das Hologramm steht über dem Panel");
    assert.ok(m.panel.l >= 0 && m.panel.r <= w, "das Panel liegt ganz im Bild");
    assert.deepEqual(m.vorn, m.vorn.map(() => true), "ein Bedienelement liegt unter einer anderen Ebene");
    assert.equal(m.holoKlicks, "none", "das Hologramm darf keine Klicks abfangen");
    assert.deepEqual(fehler, []);
    await ctx.close();
  });
}

// Confidara Signature Typography (2026-11-13): Schrift, Gewichte und Textfarben der Plattform ändern sich, die
// Admin-Anmeldung ausdrücklich nicht. Verglichen wird die berechnete Typografie jedes Text- und Bedienelements mit dem
// Stand davor (tests/e2e/fixtures/admin-anmeldung-typografie.json), dazu die Maße von Panel, Hauptaktion und Titel.
// Einzige belegte Ausnahme: Der Augen-Knopf (nur Symbol, kein Text) erbt seitdem die Markenschrift statt der
// Browserschrift Arial (globals.css) — ohne sichtbare Wirkung, der Pixelvergleich des Panels ergab 0,000 % Abweichung.
const TYPOGRAFIE_AUSNAHMEN = [{ el: "button.auth-admin-auge", eigenschaft: "font-family" }];
const TYPOGRAFIE_BASIS = JSON.parse(readFileSync(new URL("./fixtures/admin-anmeldung-typografie.json", import.meta.url), "utf8"));
for (const [name, viewport, mobil] of [["1440", { width: 1440, height: 900 }, false], ["390", { width: 390, height: 844 }, true]]) {
  test(`Q — Typografie ${name} px unverändert gegenüber dem Stand vor der Signature Typography`, async () => {
    const { ctx, page, fehler } = await neueSeite({ viewport, mobil, reduce: true });
    backend(page);
    await page.goto(`${BASE}/admin/login`);
    await page.waitForSelector(".auth-admin-panel input");
    await page.evaluate(() => document.fonts.ready);
    const ist = await adminAnmeldungTypografie(page);
    const soll = TYPOGRAFIE_BASIS[name];
    assert.ok(ist, "keine Admin-Anmeldung gefunden");
    assert.deepEqual(ist.elemente.map((e) => e.el), soll.elemente.map((e) => e.el), "andere Elementfolge");
    const abweichungen = [];
    ist.elemente.forEach((e, i) => {
      for (const [k, wert] of Object.entries(soll.elemente[i])) {
        if (TYPOGRAFIE_AUSNAHMEN.some((a) => a.el === e.el && a.eigenschaft === k)) continue;
        if (JSON.stringify(e[k]) !== JSON.stringify(wert)) abweichungen.push(`#${i} ${e.el} (${soll.texte[i]}): ${k} ${JSON.stringify(wert)} → ${JSON.stringify(e[k])}`);
      }
    });
    assert.deepEqual(abweichungen, [], `Typografie der Admin-Anmeldung verändert:\n  ${abweichungen.join("\n  ")}`);
    assert.deepEqual(ist.masse, soll.masse, "Maße von Panel, Hauptaktion oder Titel verändert");
    // Die Ausnahme bleibt eng: der Knopf trägt weiterhin keinen Text.
    assert.equal((await page.locator(".auth-admin-auge").innerText()).trim(), "");
    assert.deepEqual(fehler, []);
    await ctx.close();
  });
}
