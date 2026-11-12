// E2E: der Ladeweg der Kunden-Anmeldung (Komplettabschluss, Abschnitt 5, 2026-10-27) — im Produktionsbuild.
//
//   A1  Erstes Bild = Endlayout: ohne JavaScript zeigt /login bzw. /register das statische Seitengerüst (Navy-Bühne,
//       Satz, gerahmte Nachtkarte, Blatt). Mit JavaScript stehen Überschrift, Karte und Blatt an DERSELBEN Stelle
//       (±2 px) — React ersetzt nur das Blatt. In 1440 und 390 px.
//   A2  Kein weißer Ladebildschirm, kein Sprung: während des ganzen Ladens erscheint `.loading-screen` nie, die
//       Bereichsfarbe steht ab dem ersten Dokument fest, CLS < 0,01. Die Lichter starten erst nach dem Bild.
//   A3  Mit gespeichertem Token wartet die Anwendung auf die Sitzungsprüfung (keine Anmeldung neben einer offenen
//       Prüfung) — auf dem dunklen Grund des Gerüsts, nie auf hellem; ein abgelaufenes Token wird verworfen.
//   A4  Ein Einstieg: index.html lädt genau ein /assets/index-<hash>.js (die Versionsprüfung liest es), und die
//       Gerüste laden dieselben Dateien — kein zweiter JavaScript-Einstieg.
//   A5  Admin-Anmeldung (Canonical v2.131): ohne JavaScript zeigt /admin/login Leitstand, ruhendes Hologramm und ein
//       nicht bedienbares Panel; mit JavaScript stehen Hologramm, Panel, Titel, Feld, Knopf und Fuß an derselben Stelle
//       (±2 px), CLS < 0,01, danach bewegt sich das Hologramm. In 1440, 768 und 390 px.
//
// Kein echtes Backend: jede Anfrage außerhalb des Vorschauservers wird mit 404 beantwortet (die Seite braucht für die
// Darstellung keine Serverantwort; die Registrierung zeigt dann ihre Rückfälle).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 5583, BASE = `http://127.0.0.1:${PORT}`;
let server, browser, OUT;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));

function baue() {
  return new Promise((res, rej) => {
    const b = spawn("npx", ["vite", "build", "--outDir", OUT, "--emptyOutDir", "--logLevel", "error"],
      { stdio: "ignore", windowsHide: true, cwd: WURZEL });
    b.on("exit", (code) => (code === 0 ? res() : rej(new Error(`Build endete mit ${code}`))));
    b.on("error", rej);
  });
}

test.before(async () => {
  OUT = mkdtempSync(path.join(os.tmpdir(), "ce-auth-build-"));
  await baue();
  server = spawn("npx", ["vite", "preview", "--outDir", OUT, "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", cwd: WURZEL, ...DEV_SERVER_SPAWN });
  const frist = Date.now() + 60000;
  for (;;) {
    try { const r = await fetch(`${BASE}/login`, { headers: { Accept: "text/html" } }); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vorschauserver nicht gestartet");
    await kurz(250);
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
  if (OUT) rmSync(OUT, { recursive: true, force: true });
});

async function neuerKontext({ viewport, js = true }) {
  const ctx = await browser.newContext({ viewport, javaScriptEnabled: js, locale: "de-DE", reducedMotion: "no-preference" });
  await ctx.route((url) => !url.href.startsWith(BASE), (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "nicht verfügbar" }) }));
  return ctx;
}

const lage = (page) => page.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
  };
  return { titel: box(".auth-title"), karte: box(".auth-map-img"), blatt: box(".auth-card") };
});

for (const [pfad, feld] of [["/login", "#auth-email"], ["/register", "#reg-name"]]) {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`A1 — ${pfad} ${viewport.width} px: Seitengerüst und fertige Seite stehen an derselben Stelle`, async () => {
      const ohneJs = await neuerKontext({ viewport, js: false });
      const p1 = await ohneJs.newPage();
      await p1.goto(`${BASE}${pfad}`, { waitUntil: "load" });
      assert.equal(await p1.getAttribute("html", "data-ce-bereich"), "auth", "das Gerüst trägt den Bereich nicht");
      assert.equal(await p1.locator(".auth-geruest").count(), 1, "kein Seitengerüst ohne JavaScript");
      assert.ok(await p1.locator(".auth-map-img").evaluate((img) => img.complete && img.naturalWidth > 0), "das Kartenbild fehlt im Gerüst");
      const gerueest = await lage(p1);
      await ohneJs.close();

      const mitJs = await neuerKontext({ viewport });
      const p2 = await mitJs.newPage();
      const fehler = [];
      p2.on("pageerror", (e) => fehler.push(String(e)));
      await p2.goto(`${BASE}${pfad}`, { waitUntil: "load" });
      await p2.waitForSelector(feld, { timeout: 20000 });
      assert.equal(await p2.locator(".auth-geruest").count(), 0, "React hat das Gerüst nicht ersetzt");
      const fertig = await lage(p2);
      for (const teil of ["titel", "karte", "blatt"]) {
        const a = gerueest[teil], b = fertig[teil];
        assert.ok(a && b, `${teil} fehlt (${JSON.stringify({ a, b })})`);
        for (const k of ["x", "y", "w"]) {
          assert.ok(Math.abs(a[k] - b[k]) <= 2, `${pfad} ${viewport.width}px: ${teil}.${k} springt von ${a[k]} auf ${b[k]}`);
        }
      }
      assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "horizontaler Überlauf");
      assert.deepEqual(fehler, []);
      await mitJs.close();
    });
  }
}

// Admin-Anmeldung (Canonical v2.131): das Gerüst zeigt Leitstand, Hologramm (ruhend) und Panel ab dem ersten Bild;
// React ersetzt es an derselben Stelle, danach bewegt sich das Hologramm.
const ADMIN_TEILE = { holo: ".auth-admin-holo", panel: ".auth-admin-panel", titel: ".auth-admin-titel-text",
  feld: ".auth-admin-eingabe", knopf: ".auth-admin-cta", recht: ".auth-admin-recht" };
const adminLage = (page) => page.evaluate((teile) => Object.fromEntries(Object.entries(teile).map(([k, sel]) => {
  const el = document.querySelector(sel);
  if (!el) return [k, null];
  const r = el.getBoundingClientRect();
  return [k, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }];
})), ADMIN_TEILE);

for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`A5 — /admin/login ${viewport.width} px: Gerüst mit Hologramm und Panel, fertige Seite an derselben Stelle`, async () => {
    const ohneJs = await neuerKontext({ viewport, js: false });
    const p1 = await ohneJs.newPage();
    await p1.goto(`${BASE}/admin/login`, { waitUntil: "load" });
    assert.equal(await p1.getAttribute("html", "data-ce-bereich"), "auth");
    assert.equal(await p1.locator(".auth-admin-geruest").count(), 1, "kein Seitengerüst ohne JavaScript");
    assert.equal(await p1.locator(".auth-admin-holo-flaeche").count(), 6, "das Hologramm fehlt im Gerüst");
    assert.equal(await p1.locator(".auth-admin-holo-paket").evaluate((e) => getComputedStyle(e).animationName), "none", "im Gerüst ruht das Hologramm");
    assert.ok(await p1.locator(".auth-admin-marke img").evaluate((img) => img.complete && img.naturalWidth > 0), "die Marke fehlt im Gerüst");
    assert.equal(await p1.locator("input, button, form").count(), 0, "das Gerüst ist nicht bedienbar");
    const geruest = await adminLage(p1);
    await ohneJs.close();

    const mitJs = await neuerKontext({ viewport });
    await mitJs.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((liste) => { for (const e of liste.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
        .observe({ type: "layout-shift", buffered: true });
    });
    const p2 = await mitJs.newPage();
    const fehler = [];
    p2.on("pageerror", (e) => fehler.push(String(e)));
    await p2.goto(`${BASE}/admin/login`, { waitUntil: "load" });
    await p2.waitForSelector(".auth-admin-panel input[autocomplete=username]", { timeout: 20000 });
    assert.equal(await p2.locator(".auth-admin-geruest").count(), 0, "React hat das Gerüst nicht ersetzt");
    const fertig = await adminLage(p2);
    for (const teil of Object.keys(ADMIN_TEILE)) {
      const a = geruest[teil], b = fertig[teil];
      assert.ok(a && b, `${teil} fehlt (${JSON.stringify({ a, b })})`);
      for (const k of ["x", "y", "w", "h"]) {
        assert.ok(Math.abs(a[k] - b[k]) <= 2, `${viewport.width}px: ${teil}.${k} springt von ${a[k]} auf ${b[k]}`);
      }
    }
    assert.notEqual(await p2.locator(".auth-admin-holo-paket").evaluate((e) => getComputedStyle(e).animationName), "none", "das Hologramm bewegt sich nach der Übernahme");
    await kurz(600);
    assert.ok(await p2.evaluate(() => window.__cls < 0.01), "Layoutsprung beim Laden (CLS ≥ 0,01)");
    assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "horizontaler Überlauf");
    assert.deepEqual(fehler, []);
    await mitJs.close();
  });
}

test("A2 — kein weißer Ladebildschirm, kein Sprung, die Lichter nach dem Bild", async () => {
  const ctx = await neuerKontext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    window.__ladebildschirm = false;
    window.__cls = 0;
    new MutationObserver(() => {
      if (document.querySelector(".loading-screen")) window.__ladebildschirm = true;
    }).observe(document, { childList: true, subtree: true });
    new PerformanceObserver((liste) => {
      for (const e of liste.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.waitForSelector("#auth-email", { timeout: 20000 });
  await kurz(1500);
  const m = await page.evaluate(() => ({
    ladebildschirm: window.__ladebildschirm,
    cls: window.__cls,
    bereich: document.documentElement.getAttribute("data-ce-bereich"),
    grund: getComputedStyle(document.body).backgroundColor,
    buehne: getComputedStyle(document.querySelector(".auth-page")).backgroundImage,
    lichter: document.querySelectorAll(".auth-map .nk-licht").length,
    wartet: !!document.querySelector(".auth-map .nk-lichter--wartet"),
  }));
  assert.equal(m.ladebildschirm, false, "der weiße Ladebildschirm erschien während des Ladens");
  assert.equal(m.bereich, "auth");
  assert.ok(m.cls < 0.01, `CLS ${m.cls.toFixed(4)}`);
  assert.equal(m.grund, "rgb(7, 15, 40)", "die Seite steht nicht auf Navy (--ce-pr-navy-950)");
  assert.match(m.buehne, /gradient/, "die Navy-Bühne fehlt");
  assert.ok(m.lichter > 0, "die Städte leuchten nicht");
  assert.equal(m.wartet, false, "die Lichter warten nach dem Laden noch auf das Bild");
  await ctx.close();
});

test("A4 — ein Einstieg: alle drei Seiten laden dasselbe /assets/index-<hash>.js (Versionsprüfung)", () => {
  const tags = (datei) => readFileSync(path.join(OUT, datei), "utf8")
    .match(/<script type="module"[^>]*>|<link rel="modulepreload"[^>]*>|<link rel="stylesheet"[^>]*>/g) || [];
  const index = tags("index.html");
  const skripte = index.filter((t) => t.startsWith("<script"));
  assert.equal(skripte.length, 1, `index.html lädt ${skripte.length} Modulskripte statt eines Einstiegs`);
  assert.match(skripte[0], /src="\/assets\/index-[A-Za-z0-9_-]+\.js"/, "der Einstieg heißt nicht index-<hash>.js — die Versionsprüfung bliebe still");
  assert.ok(index.some((t) => /rel="modulepreload"/.test(t)), "die modulepreloads fehlen");
  for (const geruest of ["login.html", "register.html"]) {
    assert.deepEqual(tags(geruest), index, `${geruest} lädt andere Dateien als index.html`);
    assert.doesNotMatch(readFileSync(path.join(OUT, geruest), "utf8"), /\/src\//, `${geruest} verweist noch auf Quelldateien`);
  }
});

test("A3 — mit gespeichertem Token: Sitzungsprüfung auf dunklem Grund, danach die Anmeldung", async () => {
  const ctx = await neuerKontext({ viewport: { width: 1440, height: 900 } });
  // Später registriert, hat Vorrang vor der Sammelantwort: ein abgelaufenes Token, langsam beantwortet.
  await ctx.route((url) => url.pathname.endsWith("/kundenbereich"), async (route) => {
    await kurz(800);
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "abgelaufen" }) });
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("ce_token", "e2e-abgelaufen");
    window.__ladebildschirme = [];
    new MutationObserver(() => {
      const el = document.querySelector(".loading-screen");
      if (el && !window.__ladebildschirme.includes(el.className)) {
        window.__ladebildschirme.push(el.className);
        window.__ladegrund = getComputedStyle(el).backgroundColor;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.waitForSelector("#auth-email", { timeout: 20000 });
  const m = await page.evaluate(() => ({
    klassen: window.__ladebildschirme,
    grund: window.__ladegrund,
    token: localStorage.getItem("ce_token"),
  }));
  assert.deepEqual(m.klassen, ["loading-screen loading-screen--dunkel"], "die Prüfung lief ohne Ladebildschirm oder auf hellem Grund");
  assert.equal(m.grund, "rgb(7, 15, 40)", "der Ladebildschirm steht nicht auf Navy");
  assert.equal(m.token, null, "das abgelaufene Token blieb liegen");
  await ctx.close();
});
