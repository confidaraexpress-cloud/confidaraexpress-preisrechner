// E2E: Phase 1 (Betreiberentscheidung 2026-11-06, Canonical v2.117) — voraussichtliches monatliches Versandvolumen bei
// der Registrierung. Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — es entsteht keine echte Registrierung. Vom
// Request-Body wird nur das Versandvolumen festgehalten, nie das Passwort. Die verbindliche Prüfung misst Backend
// shipment-volume-pg (Registrierung, Empfehlungsweg, Profil, Admin, Anonymisierung).
//
//   A  acht Angaben im Wortlaut des Betreibers, keine Vorauswahl, Frage mit Pflichtstern und Hinweis
//   B  ohne Wahl: Registrierung gesperrt mit Grund; die Gruppe ohne Wahl verlassen → Fehler an der Gruppe
//   C  Tastatur: Pfeiltasten wechseln die Wahl; genau eine Anfrage mit dem gewählten Schlüssel
//   D  der Server lehnt ab (SHIPMENT_VOLUME_REQUIRED mit Feld): Meldung an der Gruppe, kein Banner
//   E  390 px: eine Spalte, kein horizontaler Überlauf; 1440 px: zwei Spalten
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5759, BASE = `http://127.0.0.1:${PORT}`;
const TEXTE = [
  "1–10 Sendungen", "11–50 Sendungen", "51–100 Sendungen", "101–250 Sendungen",
  "251–500 Sendungen", "501–1.000 Sendungen", "Mehr als 1.000 Sendungen", "Noch kein Versand / Neugründung",
];
const SCHLUESSEL = ["1_10", "11_50", "51_100", "101_250", "251_500", "501_1000", "over_1000", "none_yet"];

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

let server, browser;

async function seite({ serverLehntAb = false, viewport = { width: 1440, height: 1000 } } = {}) {
  const page = await browser.newPage({ viewport });
  const zustand = { volumen: [] };
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/register")) {
      const b = JSON.parse(req.postData() || "{}");
      zustand.volumen.push(b.monthly_shipment_volume);
      if (serverLehntAb) {
        return json({ error: "Bitte wählen Sie Ihr voraussichtliches monatliches Versandvolumen.", code: "SHIPMENT_VOLUME_REQUIRED", field: "monthly_shipment_volume" }, 400);
      }
      return json({ message: "Registrierung erfolgreich" });
    }
    if (p.endsWith("/api/legal/current")) return json({}, 503);
    if (p.includes("/api/shipping/launch-scope")) return json({ countries: [{ code: "DE", name: "Deutschland" }] });
    return json({});
  });
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.waitForSelector("#reg-name");
  return { page, zustand, fehler };
}

async function fuelleOhneVolumen(page) {
  await page.fill("#reg-name", "Anna Berger");
  await page.fill("#reg-email", "einkauf@musterkunde.example");
  await page.fill("#reg-company", "Musterkunde GmbH");
  await page.fill("#reg-vat", "DE123456789");
  const pw = page.locator('.auth-input[type="password"]');
  await pw.nth(0).fill("EinSicheresPasswort2026");
  await pw.nth(1).fill("EinSicheresPasswort2026");
  // Die Kästchen selbst anklicken: ein Klick auf den AGB-Link schaltet die Erklärung bewusst nicht um.
  await page.click("#reg-business .auth-checkbox");
  await page.click("#reg-terms .auth-checkbox");
}
// Für Meldungen bei einem gesperrten Knopf: was das Formular gerade sagt.
const formularLage = (page) => page.evaluate(() => [...document.querySelectorAll(".auth-field-error, .auth-declaration-hint")]
  .map((e) => e.innerText.trim()).join(" | "));
const cta = (page) => page.locator("button.auth-cta");
const optionen = (page) => page.locator('input[name="monthly_shipment_volume"]');
const gruppe = (page) => page.locator("fieldset.auth-volume");
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("A — acht Angaben im Wortlaut des Betreibers, keine Vorauswahl, Frage mit Pflichtstern und Hinweis", async () => {
  const { page, fehler } = await seite();
  assert.equal(norm(await gruppe(page).locator("legend").innerText()), "Voraussichtliches monatliches Versandvolumen *");
  assert.match(norm(await page.locator("#reg-volume-hint").innerText()), /später im Profil ändern/);
  assert.equal(await optionen(page).count(), 8);
  assert.deepEqual(await optionen(page).evaluateAll((els) => els.map((e) => e.value)), SCHLUESSEL);
  assert.deepEqual((await gruppe(page).locator(".auth-volume-text").allInnerTexts()).map(norm), TEXTE);
  assert.deepEqual(await optionen(page).evaluateAll((els) => els.filter((e) => e.checked).length), 0, "eine Vorauswahl");
  assert.ok(await optionen(page).evaluateAll((els) => els.every((e) => e.required)), "die Auswahl ist nicht als Pflicht gekennzeichnet");
  // Die Auswahl steht im Abschnitt „Unternehmen", vor der Adresse.
  const lage = await page.evaluate(() => {
    const y = (s) => document.querySelector(s).getBoundingClientRect().top;
    return { firma: y("#reg-company"), volumen: y("fieldset.auth-volume"), land: y("#reg-country") };
  });
  assert.ok(lage.firma < lage.volumen && lage.volumen < lage.land, JSON.stringify(lage));
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — ohne Wahl gesperrt, mit Grund; die Gruppe ohne Wahl verlassen zeigt den Fehler an der Gruppe", async () => {
  const { page, zustand } = await seite();
  await fuelleOhneVolumen(page);
  assert.equal(await cta(page).isDisabled(), true, "die Registrierung ist ohne Versandvolumen absendbar");
  assert.match(norm(await page.locator(".auth-declaration-hint").innerText()), /Bitte wählen Sie Ihr voraussichtliches monatliches Versandvolumen/);
  // Mit der Tastatur in die Gruppe und ohne Wahl wieder hinaus.
  await page.locator("#reg-vat").focus();
  await page.keyboard.press("Tab");
  let imFokus = await page.evaluate(() => document.activeElement?.name || document.activeElement?.id);
  for (let i = 0; i < 4 && imFokus !== "monthly_shipment_volume"; i++) {
    await page.keyboard.press("Tab");
    imFokus = await page.evaluate(() => document.activeElement?.name || document.activeElement?.id);
  }
  assert.equal(imFokus, "monthly_shipment_volume", "die Gruppe ist per Tabulator nicht erreichbar");
  await page.keyboard.press("Tab");
  await page.locator("#reg-volume-error").waitFor({ timeout: 5000 });
  assert.match(norm(await page.locator("#reg-volume-error").innerText()), /Bitte wählen Sie Ihr voraussichtliches monatliches Versandvolumen/);
  assert.equal(await optionen(page).first().getAttribute("aria-invalid"), "true");
  assert.match(await optionen(page).first().getAttribute("aria-describedby"), /reg-volume-error/);
  // Eine Wahl nimmt den Fehler weg und gibt die Registrierung frei.
  await gruppe(page).locator("label", { hasText: "251–500 Sendungen" }).click();
  assert.equal(await page.locator("#reg-volume-error").count(), 0);
  assert.equal(await cta(page).isDisabled(), false, await formularLage(page));
  assert.equal(zustand.volumen.length, 0, "eine Anfrage vor dem Absenden");
  await page.close();
});

test("C — Tastatur: Pfeiltasten wechseln die Wahl; genau eine Anfrage mit dem gewählten Schlüssel", async () => {
  const { page, zustand } = await seite();
  await fuelleOhneVolumen(page);
  await optionen(page).nth(0).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  assert.deepEqual(await optionen(page).evaluateAll((els) => els.filter((e) => e.checked).map((e) => e.value)), ["51_100"]);
  assert.equal(await gruppe(page).locator(".auth-volume-option.is-selected").count(), 1);
  await cta(page).click();
  await page.waitForFunction(() => /Firmenkonto beantragt/.test(document.body.innerText), null, { timeout: 10000 });
  assert.deepEqual(zustand.volumen, ["51_100"]);
  await page.close();
});

test("D — lehnt der Server ab, steht seine Meldung an der Gruppe statt als Banner", async () => {
  const { page } = await seite({ serverLehntAb: true });
  await fuelleOhneVolumen(page);
  await gruppe(page).locator("label", { hasText: "Noch kein Versand / Neugründung" }).click();
  await cta(page).click();
  await page.locator("#reg-volume-error").waitFor({ timeout: 10000 });
  assert.match(norm(await page.locator("#reg-volume-error").innerText()), /Bitte wählen Sie Ihr voraussichtliches monatliches Versandvolumen/);
  assert.equal(await page.locator(".auth-alert-error").count(), 0, "die Feldmeldung erscheint als Banner");
  await page.close();
});

test("E — 390 px eine Spalte ohne Überlauf, 1440 px zwei Spalten", async () => {
  const breit = await seite();
  const spaltenBreit = await breit.page.evaluate(() => getComputedStyle(document.querySelector(".auth-volume-options")).gridTemplateColumns.split(" ").length);
  assert.equal(spaltenBreit, 2, "auf breiten Bildschirmen zwei Spalten");
  await breit.page.close();
  const { page } = await seite({ viewport: { width: 390, height: 844 } });
  const m = await page.evaluate(() => {
    const opts = [...document.querySelectorAll(".auth-volume-option")].map((o) => { const r = o.getBoundingClientRect(); return [r.left, r.right, r.height]; });
    return {
      spalten: getComputedStyle(document.querySelector(".auth-volume-options")).gridTemplateColumns.split(" ").length,
      opts, fenster: window.innerWidth,
      quer: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert.equal(m.spalten, 1);
  for (const [l, r, h] of m.opts) {
    assert.ok(l >= 0 && r <= m.fenster + 1, `Option außerhalb des Bildes: ${l}–${r}`);
    assert.ok(h >= 44, `Trefferfläche unter 44 px: ${h}`);
  }
  assert.ok(m.quer <= 0, `horizontaler Überlauf ${m.quer}px`);
  await page.close();
});
