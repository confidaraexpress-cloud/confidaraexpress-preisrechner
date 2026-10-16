// E2E: der Produktionsbuild des öffentlichen Preisrechners — Bündel, Größe und Leistung als Messkonzept.
//
//   B1  Im ganzen Build (JS, CSS, HTML, SVG, Texte) steht keine Einkaufsquelle — auch kein Diagnose-Token.
//   B2  Build-Bericht: gzip und brotli je Asset gegen die festgeschriebene Baseline
//       (tests/e2e/fixtures/public-calculator-build-baseline.json). Mehr als 10 Prozent Wachstum oder ein neues
//       Asset ohne aktualisierte Baseline schlagen an. Aktualisieren (bewusst, im selben Commit wie die Ursache):
//         PREISRECHNER_BASELINE_WRITE=1 node --test tests/e2e/publicCalculatorBuild.test.mjs
//   B3  Erstaufruf: der Preisrechner lädt weniger JS und CSS (komprimiert) als der heutige Erstaufruf der Domain
//       (Hauptanwendung, /login) — beide im echten Browser gezählt.
//   B4  Unter Drosselung (Slow 4G: 150 ms RTT, 1,6 Mbit/s; CPU 4×), je drei Läufe, Median: FCP, LCP, CLS und die
//       Zeit bis zum bedienbaren Formular. Kriterien: LCP nicht schlechter als die Login-Seite unter gleicher
//       Drosselung, CLS unter 0,1. Die Werte stehen im Testprotokoll.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const PORT = 5567, BASE = `http://127.0.0.1:${PORT}`;
const PORT_HAUPT = 5568, BASE_HAUPT = `http://127.0.0.1:${PORT_HAUPT}`;
const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = path.join(WURZEL, "tests", "e2e", "fixtures", "public-calculator-build-baseline.json");
const WACHSTUM = 1.10;
const DROSSEL = { latency: 150, downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8), uploadThroughput: Math.round((750 * 1024) / 8) };
const LAEUFE = 3;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

let server, hauptServer, browser, OUT, OUT_HAUPT;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));

function baue(args) {
  return new Promise((resolve, reject) => {
    const b = spawn("npx", ["vite", "build", ...args, "--emptyOutDir", "--logLevel", "error"], { stdio: "ignore", windowsHide: true, cwd: WURZEL });
    b.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`vite build beendet mit ${code}`))));
    b.on("error", reject);
  });
}

async function warte(basis) {
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${basis}/`); if (r.ok) return; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error(`Preview-Server ${basis} nicht gestartet`);
    await kurz(250);
  }
}

function dateien(ordner, rel = "") {
  const out = [];
  for (const e of readdirSync(path.join(ordner, rel))) {
    const r = rel ? `${rel}/${e}` : e;
    if (statSync(path.join(ordner, r)).isDirectory()) out.push(...dateien(ordner, r));
    else out.push(r);
  }
  return out.sort();
}

// „assets/index-BHFh33nh.js" → „assets/index.js": der Bericht vergleicht Assets, nicht Hashes.
const ohneHash = (rel) => rel.replace(/-[A-Za-z0-9_-]{8}(?=\.[a-z0-9]+$)/, "");
const groessen = (buf) => ({
  raw: buf.length,
  gzip: zlib.gzipSync(buf, { level: 9 }).length,
  brotli: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
});

const API_MOCK = async (route) => {
  const pfad = new URL(route.request().url()).pathname;
  const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (pfad === "/api/public/price-quote/prepare") return json({ available: true });
  if (pfad === "/api/public/launch-scope") return json({ destinationCountries: ["DE", "AT"], originCountries: ["DE"] });
  return json({});
};

test.before(async () => {
  OUT = mkdtempSync(path.join(os.tmpdir(), "ce-preisrechner-build-"));
  OUT_HAUPT = mkdtempSync(path.join(os.tmpdir(), "ce-haupt-build-"));
  await baue(["--config", "vite.preisrechner.config.js", "--outDir", OUT]);
  await baue(["--outDir", OUT_HAUPT]);
  server = spawn("npx", ["vite", "preview", "--config", "vite.preisrechner.config.js", "--outDir", OUT, "--host", "127.0.0.1",
    "--port", String(PORT), "--strictPort"], { stdio: "ignore", ...DEV_SERVER_SPAWN });
  hauptServer = spawn("npx", ["vite", "preview", "--outDir", OUT_HAUPT, "--host", "127.0.0.1", "--port", String(PORT_HAUPT),
    "--strictPort"], { stdio: "ignore", ...DEV_SERVER_SPAWN });
  await warte(BASE);
  await warte(BASE_HAUPT);
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
  if (hauptServer) stopDevServer(hauptServer, "SIGKILL");
  for (const o of [OUT, OUT_HAUPT]) if (o) rmSync(o, { recursive: true, force: true });
});

test("B1 — im ganzen Build steht keine Einkaufsquelle, auch kein Diagnose-Token", () => {
  const text = /\.(js|css|html|svg|txt|json|webmanifest)$/;
  const treffer = [];
  for (const rel of dateien(OUT).filter((d) => text.test(d))) {
    const inhalt = readFileSync(path.join(OUT, rel), "utf8");
    if (/jumingo|transglobal|debug-provider/i.test(inhalt)) treffer.push(rel);
  }
  assert.deepEqual(treffer, []);
  assert.ok(!dateien(OUT).some((d) => /jumingo/i.test(d)), "ein Asset trägt den Namen der Einkaufsquelle");
  assert.ok(existsSync(path.join(OUT, "sw.js")) && existsSync(path.join(OUT, "robots.txt")) && existsSync(path.join(OUT, "favicon-v2.svg")));
});

test("B2 — Build-Bericht: gzip und brotli je Asset gegen die festgeschriebene Baseline (höchstens +10 %)", () => {
  const bericht = {};
  for (const rel of dateien(OUT)) bericht[ohneHash(rel)] = groessen(readFileSync(path.join(OUT, rel)));
  const summe = (b, k) => Object.values(b).reduce((n, g) => n + g[k], 0);
  console.log("\n  Build-Bericht dist-preisrechner (Bytes: roh / gzip / brotli)");
  for (const [name, g] of Object.entries(bericht)) console.log(`    ${name.padEnd(48)} ${String(g.raw).padStart(8)} ${String(g.gzip).padStart(8)} ${String(g.brotli).padStart(8)}`);
  console.log(`    ${"Summe".padEnd(48)} ${String(summe(bericht, "raw")).padStart(8)} ${String(summe(bericht, "gzip")).padStart(8)} ${String(summe(bericht, "brotli")).padStart(8)}`);
  if (process.env.PREISRECHNER_BASELINE_WRITE === "1") {
    writeFileSync(BASELINE, `${JSON.stringify({
      hinweis: "Komprimierte Größen je Asset des Preisrechner-Builds (gzip Stufe 9, brotli Stufe 11). Bewusst aktualisieren: PREISRECHNER_BASELINE_WRITE=1 node --test tests/e2e/publicCalculatorBuild.test.mjs",
      assets: bericht,
    }, null, 2)}\n`);
    return;
  }
  const basis = JSON.parse(readFileSync(BASELINE, "utf8")).assets;
  const verstoesse = [];
  for (const [name, g] of Object.entries(bericht)) {
    const b = basis[name];
    if (!b) { verstoesse.push(`${name}: neues Asset ohne Baseline`); continue; }
    for (const k of ["gzip", "brotli"]) {
      if (g[k] > Math.ceil(b[k] * WACHSTUM)) verstoesse.push(`${name}: ${k} ${g[k]} > ${b[k]} + 10 %`);
    }
  }
  for (const k of ["gzip", "brotli"]) {
    if (summe(bericht, k) > Math.ceil(summe(basis, k) * WACHSTUM)) verstoesse.push(`Summe ${k}: ${summe(bericht, k)} > ${summe(basis, k)} + 10 %`);
  }
  assert.deepEqual(verstoesse, [], "Baseline überschritten — Ursache prüfen oder die Baseline bewusst aktualisieren");
});

// Was eine Seite beim ersten Aufruf an JS und CSS tatsächlich lädt — im Browser gezählt, komprimiert gerechnet.
async function erstaufruf(basis, pfad, ordner) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route("**/api.confidaraexpress.de/**", API_MOCK);
  const page = await ctx.newPage();
  const geladen = new Set();
  page.on("response", (r) => {
    const t = r.request().resourceType();
    if ((t === "script" || t === "stylesheet") && r.url().startsWith(basis)) geladen.add(new URL(r.url()).pathname);
  });
  await page.goto(`${basis}${pfad}`, { waitUntil: "networkidle" });
  await kurz(500);
  await ctx.close();
  let gzip = 0;
  for (const p of geladen) {
    const datei = path.join(ordner, p.replace(/^\//, ""));
    if (existsSync(datei)) gzip += groessen(readFileSync(datei)).gzip;
  }
  return { gzip, dateien: [...geladen].sort() };
}

test("B3 — Erstaufruf: weniger JS und CSS als der heutige Erstaufruf der Domain", async () => {
  const preisrechner = await erstaufruf(BASE, "/", OUT);
  const haupt = await erstaufruf(BASE_HAUPT, "/login", OUT_HAUPT);
  console.log(`\n  Erstaufruf JS+CSS (gzip): Preisrechner ${preisrechner.gzip} B (${preisrechner.dateien.length} Dateien) · Hauptdomain /login ${haupt.gzip} B (${haupt.dateien.length} Dateien)`);
  assert.ok(preisrechner.gzip > 0 && haupt.gzip > 0);
  assert.ok(preisrechner.gzip < haupt.gzip, `Preisrechner ${preisrechner.gzip} B ≥ Hauptdomain ${haupt.gzip} B`);
});

async function messe(url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route("**/api.confidaraexpress.de/**", API_MOCK);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...DROSSEL });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.__ceMessung = { lcp: 0, cls: 0 };
    new PerformanceObserver((liste) => {
      for (const e of liste.getEntries()) window.__ceMessung.lcp = e.renderTime || e.loadTime || e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((liste) => {
      for (const e of liste.getEntries()) if (!e.hadRecentInput) window.__ceMessung.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
  await kurz(1000);
  const m = await page.evaluate(() => ({
    fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
    lcp: window.__ceMessung.lcp,
    cls: window.__ceMessung.cls,
    bedienbar: performance.getEntriesByName("pc-form-interactive")[0]?.startTime ?? null,
  }));
  await ctx.close();
  return m;
}

const median = (werte) => {
  const s = werte.filter((w) => typeof w === "number").sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

test("B4 — gedrosselt (Slow 4G, CPU 4×): FCP, LCP, CLS, bedienbares Formular; LCP nicht schlechter als /login, CLS < 0,1", async () => {
  const pc = [], login = [];
  for (let i = 0; i < LAEUFE; i++) {
    pc.push(await messe(`${BASE}/`));
    login.push(await messe(`${BASE_HAUPT}/login`));
  }
  const auswertung = (reihe) => ({
    fcp: median(reihe.map((m) => m.fcp)), lcp: median(reihe.map((m) => m.lcp)),
    cls: Math.max(...reihe.map((m) => m.cls)), bedienbar: median(reihe.map((m) => m.bedienbar)),
  });
  const a = auswertung(pc), b = auswertung(login);
  const ms = (w) => (w === null ? "—" : `${Math.round(w)} ms`);
  console.log(`\n  Gedrosselt (Median aus ${LAEUFE}): Preisrechner FCP ${ms(a.fcp)} · LCP ${ms(a.lcp)} · CLS ${a.cls.toFixed(4)} · Formular bedienbar ${ms(a.bedienbar)}`);
  console.log(`                              /login       FCP ${ms(b.fcp)} · LCP ${ms(b.lcp)} · CLS ${b.cls.toFixed(4)}`);
  assert.ok(a.lcp > 0 && b.lcp > 0, "LCP nicht gemessen");
  assert.ok(a.bedienbar !== null, "die Insel hat ihr Formular nie gemeldet");
  assert.ok(a.lcp <= b.lcp, `LCP Preisrechner ${Math.round(a.lcp)} ms > /login ${Math.round(b.lcp)} ms`);
  assert.ok(a.cls < 0.1, `CLS ${a.cls}`);
});
