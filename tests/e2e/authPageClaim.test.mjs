// Browser-Smokes: der neue Text der Anmeldeseite (Auftrag 1, P3, 2026-10-17).
//
// Überschrift „Europa verbinden. Versand vereinfachen.", Unterzeile „Vergleichen. Buchen.
// Persönlich betreut." und die Beschreibung „Versand ab Deutschland in die Länder der EU – mit
// persönlichem Service und direkten Ansprechpartnern." Geprüft werden Wortlaut, Umbrüche und
// Lesbarkeit auf Smartphone und Desktop — und dass Anmeldung und Registrierung unverändert
// erreichbar sind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5279, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

let server, browser;

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

const norm = (s) => s.replace(/\s+/g, " ").trim();

for (const [name, viewport, touch] of [["390 px", { width: 390, height: 844 }, true], ["320 px", { width: 320, height: 700 }, true], ["1440 px", { width: 1440, height: 900 }, false]]) {
  test(`${name}: neuer Wortlaut, saubere Umbrüche, Anmeldung und Registrierung erreichbar`, async () => {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    await ctx.route("**/api.confidaraexpress.de/**", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "nicht angemeldet" }) }));
    const page = await ctx.newPage();
    const fehler = [];
    page.on("pageerror", (e) => fehler.push(String(e)));
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.waitForSelector(".auth-title", { timeout: 20000 });

    assert.equal(norm(await page.locator(".auth-title").innerText()), "Europa verbinden. Versand vereinfachen.");
    assert.equal(norm(await page.locator(".auth-sub-1").innerText()), "Vergleichen. Buchen. Persönlich betreut.");
    assert.equal(norm(await page.locator(".auth-sub-2").innerText()),
      "Versand ab Deutschland in die Länder der EU – mit persönlichem Service und direkten Ansprechpartnern.");
    const seite = norm(await page.locator("body").innerText());
    assert.doesNotMatch(seite, /Wir verbinden Welten|Sie erreichen mehr|Exzellenz|Schnell\./, "der alte Claim ist noch sichtbar");

    const mass = await page.evaluate(() => {
      const zeilen = (el) => {
        const r = document.createRange(); r.selectNodeContents(el);
        const tops = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
        return tops.size;
      };
      const h1 = document.querySelector(".auth-title");
      const besch = document.querySelector(".auth-sub-2");
      const hr = h1.getBoundingClientRect(), br = besch.getBoundingClientRect();
      return {
        ueberlauf: document.scrollingElement.scrollWidth - window.innerWidth,
        h1Zeilen: zeilen(h1), beschZeilen: zeilen(besch),
        h1Innen: hr.left >= 0 && hr.right <= window.innerWidth,
        beschInnen: br.left >= 0 && br.right <= window.innerWidth,
      };
    });
    assert.ok(mass.ueberlauf <= 0, `${mass.ueberlauf} px waagrechter Überlauf`);
    assert.ok(mass.h1Innen && mass.beschInnen, "Text ragt aus dem Bild");
    // Zwei Zeilen dank Umbruch nach „verbinden."; auf schmalen Geräten darf „vereinfachen."
    // eine dritte Zeile bekommen — mehr nicht.
    assert.ok(mass.h1Zeilen >= 2 && mass.h1Zeilen <= 3, `Überschrift in ${mass.h1Zeilen} Zeilen`);
    assert.ok(mass.beschZeilen <= 4, `Beschreibung in ${mass.beschZeilen} Zeilen`);

    // Anmelden und Registrieren sind unverändert bedienbar.
    await page.getByRole("button", { name: "Registrieren" }).first().click();
    await page.getByRole("button", { name: "Anmelden" }).first().click();
    assert.ok(await page.locator('input[type="password"]').first().isVisible(), "das Anmeldeformular fehlt");
    assert.deepEqual(fehler, []);
    await ctx.close();
  });
}
