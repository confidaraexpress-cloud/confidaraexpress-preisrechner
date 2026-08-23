// End-to-End-Glyphenregression: normale Null statt durchgestrichener Null.
//
// Reine Textvergleiche (node --test, keine DOM-Bibliothek) können nicht sehen,
// WELCHE Form ein Glyph tatsächlich zeichnet — nur ein echter Browser kann das.
// Dieser Test ist deshalb bewusst klein und deterministisch statt einer
// fragilen Screenshot-Gesamtabnahme:
//
//   1. Die tatsächlich ausgelieferte DM-Sans-Datei wird direkt (ohne Dev-Server)
//      im Browser geladen und ihr „0"-Glyph per Canvas-Pixel-Scanline auf eine
//      durchgestrichene/gepunktete Mitte geprüft — muss SAUBER sein.
//   2. Als Kontrollprobe wird eine SYNTHETISCHE „bekannte durchgestrichene Null"
//      (Oval + diagonale Linie, ohne externe Schriftdatei) mit demselben
//      Verfahren geprüft — sie MUSS als durchgestrichen erkannt werden. Das
//      bestätigt, dass der Test selbst eine echte Schrägstrich-Null erkennen
//      würde, statt nur zufällig „grün" zu sein (dieselbe Prüfung, die die
//      vorangegangene Analyse bereits an der echten, inzwischen entfernten
//      DM-Mono-Datei bestätigt hat).
//   3. Die tatsächlich im Browser gerenderte Schrittnummer „01" der Übersicht
//      (echter Dev-Server, echte Kaskade) wird auf denselben sauberen Befund
//      geprüft — end-to-end, nicht nur isoliert.
//
// Run: npm run test:e2e
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

function chromiumExecutablePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root) {
    const candidate = path.join(root, "chromium");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const PORT = 5223;
const BASE = `http://127.0.0.1:${PORT}`;
const REPO_ROOT = new URL("../..", import.meta.url).pathname;

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", street: "Hauptstrasse 1", zip: "10115",
  city: "Berlin", country: "DE",
};

let server = null;
let browser = null;

before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore", detached: true, cwd: REPO_ROOT,
  });
  const deadline = Date.now() + 90_000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* startet noch */ }
    if (Date.now() > deadline) throw new Error("Vite-Dev-Server ist nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

after(async () => {
  if (browser) await browser.close();
  if (server) {
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`,
    // das seinerseits node startet. Ein Signal an den npx-Prozess laesst
    // den Enkel — den eigentlichen Dev-Server — auf seinem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

// Objektive Glyphenprüfung per Pixel-Scanline (identisches Verfahren wie in der
// vorangegangenen Analyse, verifiziert per Checksummen-Gegenprobe): zwischen
// 25% und 75% der Glyphenhöhe wird gezählt, ob NEBEN den beiden Außenstrichen
// eines Ovals ein drittes, isoliertes Tintensegment existiert (= Schrägstrich
// oder Punkt in der Mitte).
async function scanZero(page, { fontFamily, weight = "400", size = 640, fromDataUri = null }) {
  return page.evaluate(async ({ fontFamily, weight, size, fromDataUri }) => {
    if (fromDataUri) {
      const face = new FontFace(fontFamily, `url(${fromDataUri})`, { weight });
      await face.load();
      document.fonts.add(face);
    }
    await document.fonts.load(`${weight} ${size}px "${fontFamily}"`);
    const c = document.createElement("canvas");
    c.width = size + 200; c.height = size + 200;
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#000"; x.textBaseline = "alphabetic";
    x.font = `${weight} ${size}px "${fontFamily}"`;
    x.fillText("0", 50, size);
    const img = x.getImageData(0, 0, c.width, c.height);
    const isDark = (px, py) => img.data[(py * c.width + px) * 4] < 128;
    let minX = c.width, maxX = 0, minY = c.height, maxY = 0;
    for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
      if (isDark(px, py)) { if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py; }
    }
    if (maxX < minX) return { empty: true };
    const h = maxY - minY;
    let middleRows = 0, total = 0;
    for (let frac = 0.25; frac <= 0.75; frac += 0.05) {
      total++;
      const py = Math.round(minY + h * frac);
      const runs = []; let inRun = false, runStart = 0;
      for (let px = minX; px <= maxX; px++) {
        const dark = isDark(px, py);
        if (dark && !inRun) { inRun = true; runStart = px; }
        if (!dark && inRun) { inRun = false; runs.push([runStart, px - 1]); }
      }
      if (inRun) runs.push([runStart, maxX]);
      if (runs.length >= 3) middleRows++;
    }
    return { middleRows, total };
  }, { fontFamily, weight, size, fromDataUri });
}

test("die tatsächlich ausgelieferte DM-Sans-Datei zeichnet eine normale, nicht durchgestrichene Null", async () => {
  const page = await browser.newPage();
  const dmSansPath = path.join(REPO_ROOT, "src/assets/fonts/dmsans-300.woff2");
  assert.ok(existsSync(dmSansPath), "die ausgelieferte DM-Sans-Datei fehlt");
  const b64 = readFileSync(dmSansPath).toString("base64");
  const dataUri = `data:font/woff2;base64,${b64}`;
  const result = await scanZero(page, { fontFamily: "AuditDMSans", weight: "400", fromDataUri: dataUri });
  assert.ok(!result.empty, "die Null wurde nicht gerendert");
  assert.equal(result.middleRows, 0,
    `DM Sans zeigt an ${result.middleRows}/${result.total} Zeilen ein zusätzliches Mittelsegment — das wäre eine durchgestrichene/gepunktete Null`);
  await page.close();
});

test("Kontrollprobe: eine synthetisch nachgebildete durchgestrichene Null wird vom selben Verfahren erkannt", async () => {
  const page = await browser.newPage();
  // Rein synthetisch — keine externe Schriftdatei nötig (die reale DM-Mono-
  // Datei ist bewusst entfernt). Bestätigt, dass das Scanline-Verfahren einen
  // echten Schrägstrich zuverlässig erkennt und der obige „sauber"-Befund kein
  // blinder Fleck des Tests ist.
  const result = await page.evaluate(() => {
    const size = 640;
    const c = document.createElement("canvas");
    c.width = size + 200; c.height = size + 200;
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = "#000"; x.lineWidth = 46; x.lineCap = "round";
    const cx = 220, cy = 320, rx = 150, ry = 300;
    x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.stroke();
    // Diagonale durch den Innenraum — das strukturelle Merkmal einer
    // durchgestrichenen Null.
    x.beginPath(); x.moveTo(cx - rx * 0.75, cy + ry * 0.75); x.lineTo(cx + rx * 0.75, cy - ry * 0.75); x.stroke();
    const img = x.getImageData(0, 0, c.width, c.height);
    const isDark = (px, py) => img.data[(py * c.width + px) * 4] < 128;
    let minX = c.width, maxX = 0, minY = c.height, maxY = 0;
    for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
      if (isDark(px, py)) { if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py; }
    }
    const h = maxY - minY;
    let middleRows = 0, total = 0;
    for (let frac = 0.25; frac <= 0.75; frac += 0.05) {
      total++;
      const py = Math.round(minY + h * frac);
      const runs = []; let inRun = false, runStart = 0;
      for (let px = minX; px <= maxX; px++) {
        const dark = isDark(px, py);
        if (dark && !inRun) { inRun = true; runStart = px; }
        if (!dark && inRun) { inRun = false; runs.push([runStart, px - 1]); }
      }
      if (inRun) runs.push([runStart, maxX]);
      if (runs.length >= 3) middleRows++;
    }
    return { middleRows, total };
  });
  assert.ok(result.middleRows >= result.total * 0.5,
    `die synthetische Kontrollprobe hätte an mehrheitlich Zeilen ein Mittelsegment zeigen müssen, zeigt aber nur ${result.middleRows}/${result.total} — das Erkennungsverfahren selbst wäre dann nicht aussagekräftig`);
  await page.close();
});

test("die live gerenderte Schrittnummer 01 der Übersicht zeigt eine normale Null (echter Dev-Server, echte Kaskade)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url()), p = url.pathname;
    if (url.port === String(PORT) && !p.startsWith("/kunde") && !p.startsWith("/admin") && !p.startsWith("/api")) return route.continue();
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json(USER);
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: {} });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    return json({});
  });
  await page.addInitScript(() => { localStorage.setItem("ce_token", "e2e-glyph-token"); });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pp-step-no");
  await page.evaluate(() => document.fonts.ready);

  const domInfo = await page.evaluate(() => {
    const el = document.querySelectorAll(".pp-step-no")[0];
    return { text: el.textContent, fontFamily: getComputedStyle(el).fontFamily };
  });
  assert.equal(domInfo.text, "01");
  assert.doesNotMatch(domInfo.fontFamily, /DM Mono/, "die Schrittnummer darf nicht mehr DM Mono referenzieren");
  assert.match(domInfo.fontFamily, /DM Sans/, "die Schrittnummer muss DM Sans referenzieren");

  const result = await page.evaluate(() => {
    const el = document.querySelectorAll(".pp-step-no")[0];
    const cs = getComputedStyle(el);
    const size = 640;
    const c = document.createElement("canvas");
    c.width = size + 200; c.height = size + 200;
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#000"; x.textBaseline = "alphabetic";
    x.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    x.fillText("0", 50, size);
    const img = x.getImageData(0, 0, c.width, c.height);
    const isDark = (px, py) => img.data[(py * c.width + px) * 4] < 128;
    let minX = c.width, maxX = 0, minY = c.height, maxY = 0;
    for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
      if (isDark(px, py)) { if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py; }
    }
    if (maxX < minX) return { empty: true };
    const h = maxY - minY;
    let middleRows = 0, total = 0;
    for (let frac = 0.25; frac <= 0.75; frac += 0.05) {
      total++;
      const py = Math.round(minY + h * frac);
      const runs = []; let inRun = false, runStart = 0;
      for (let px = minX; px <= maxX; px++) {
        const dark = isDark(px, py);
        if (dark && !inRun) { inRun = true; runStart = px; }
        if (!dark && inRun) { inRun = false; runs.push([runStart, px - 1]); }
      }
      if (inRun) runs.push([runStart, maxX]);
      if (runs.length >= 3) middleRows++;
    }
    return { middleRows, total };
  });
  assert.ok(!result.empty, "die Null im Live-Element wurde nicht gerendert");
  assert.equal(result.middleRows, 0,
    `die live gerenderte Schrittnummer zeigt an ${result.middleRows}/${result.total} Zeilen ein zusätzliches Mittelsegment`);
  assert.equal(consoleErrors.length, 0, `Konsolenfehler: ${consoleErrors.join("; ")}`);
  await page.close();
});
