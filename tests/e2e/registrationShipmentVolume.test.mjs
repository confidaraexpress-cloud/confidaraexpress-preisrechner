// E2E: Phase 1 (Betreiberentscheidung 2026-11-06, Canonical v2.117) — voraussichtliches monatliches Versandvolumen bei
// der Registrierung; seit der Premium-UX-Nachbesserung (2026-11-06, Canonical v2.118) ein natives Auswahlfeld statt acht
// Optionsfeldern. Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — es entsteht keine echte Registrierung. Vom
// Request-Body wird nur das Versandvolumen festgehalten, nie das Passwort. Die verbindliche Prüfung misst Backend
// shipment-volume-pg (Registrierung, Empfehlungsweg, Profil, Admin, Anonymisierung).
//
//   A  acht Angaben im Wortlaut des Betreibers, keine Vorauswahl, Frage mit Pflichtstern und Hinweis, Platzhalter nicht wählbar
//   B  ohne Wahl: Registrierung gesperrt mit Grund; das Feld ohne Wahl verlassen → Fehler am Feld
//   C  Tastatur: Pfeiltasten wechseln die Wahl; genau eine Anfrage mit dem gewählten Schlüssel
//   D  der Server lehnt ab (SHIPMENT_VOLUME_REQUIRED mit Feld): Meldung am Feld, kein Banner
//   E  390 und 1440 px: geschlossen eine Feldzeile mit Pfeil (weit kompakter als die acht Karten), kein Überlauf
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
// Die acht Angaben — der Platzhalter (leerer Wert) ist keine Angabe.
const feld = (page) => page.locator("select#reg-volume");
const optionen = (page) => page.locator('select#reg-volume option:not([value=""])');
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
  assert.equal(norm(await page.locator('label[for="reg-volume"]').innerText()), "Voraussichtliches monatliches Versandvolumen *");
  assert.match(norm(await page.locator("#reg-volume-hint").innerText()), /später im Profil ändern/);
  assert.equal(await optionen(page).count(), 8);
  assert.deepEqual(await optionen(page).evaluateAll((els) => els.map((e) => e.value)), SCHLUESSEL);
  assert.deepEqual(await optionen(page).evaluateAll((els) => els.map((e) => e.textContent.trim())), TEXTE);
  assert.equal(await feld(page).inputValue(), "", "eine Vorauswahl");
  assert.equal(await feld(page).getAttribute("name"), "monthly_shipment_volume");
  assert.equal(await feld(page).evaluate((e) => e.required), true, "die Auswahl ist nicht als Pflicht gekennzeichnet");
  assert.match(await feld(page).getAttribute("aria-describedby"), /reg-volume-hint/);
  // Der Platzhalter ist die einzige weitere Option — leer, gesperrt und in der Liste verborgen: nie eine Angabe.
  const platzhalter = await page.locator('select#reg-volume option[value=""]')
    .evaluateAll((els) => els.map((e) => ({ text: e.textContent, disabled: e.disabled, hidden: e.hidden })));
  assert.deepEqual(platzhalter, [{ text: "Bitte wählen", disabled: true, hidden: true }]);
  // Die Auswahl steht im Abschnitt „Unternehmen", vor der Adresse.
  const lage = await page.evaluate(() => {
    const y = (s) => document.querySelector(s).getBoundingClientRect().top;
    return { firma: y("#reg-company"), volumen: y("#reg-volume"), land: y("#reg-country") };
  });
  assert.ok(lage.firma < lage.volumen && lage.volumen < lage.land, JSON.stringify(lage));
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — ohne Wahl gesperrt, mit Grund; das Feld ohne Wahl verlassen zeigt den Fehler am Feld", async () => {
  const { page, zustand } = await seite();
  await fuelleOhneVolumen(page);
  assert.equal(await cta(page).isDisabled(), true, "die Registrierung ist ohne Versandvolumen absendbar");
  assert.match(norm(await page.locator(".auth-declaration-hint").innerText()), /Bitte wählen Sie Ihr voraussichtliches monatliches Versandvolumen/);
  // Mit der Tastatur in das Feld und ohne Wahl wieder hinaus.
  await page.locator("#reg-vat").focus();
  await page.keyboard.press("Tab");
  let imFokus = await page.evaluate(() => document.activeElement?.name || document.activeElement?.id);
  for (let i = 0; i < 4 && imFokus !== "monthly_shipment_volume"; i++) {
    await page.keyboard.press("Tab");
    imFokus = await page.evaluate(() => document.activeElement?.name || document.activeElement?.id);
  }
  assert.equal(imFokus, "monthly_shipment_volume", "das Feld ist per Tabulator nicht erreichbar");
  await page.keyboard.press("Tab");
  await page.locator("#reg-volume-error").waitFor({ timeout: 5000 });
  assert.match(norm(await page.locator("#reg-volume-error").innerText()), /Bitte wählen Sie Ihr voraussichtliches monatliches Versandvolumen/);
  assert.equal(await feld(page).getAttribute("aria-invalid"), "true");
  assert.match(await feld(page).getAttribute("aria-describedby"), /reg-volume-error/);
  // Eine Wahl nimmt den Fehler weg und gibt die Registrierung frei.
  await feld(page).selectOption({ label: "251–500 Sendungen" });
  assert.equal(await page.locator("#reg-volume-error").count(), 0);
  assert.equal(await cta(page).isDisabled(), false, await formularLage(page));
  assert.equal(zustand.volumen.length, 0, "eine Anfrage vor dem Absenden");
  await page.close();
});

test("C — Tastatur: Pfeiltasten wechseln die Wahl; genau eine Anfrage mit dem gewählten Schlüssel", async () => {
  const { page, zustand } = await seite();
  await fuelleOhneVolumen(page);
  // Geschlossenes Feld: jede Pfeiltaste wählt die nächste Angabe; der Platzhalter wird übersprungen.
  await feld(page).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  assert.equal(await feld(page).inputValue(), "51_100");
  assert.equal(await feld(page).evaluate((e) => e.options[e.selectedIndex].textContent), "51–100 Sendungen");
  await cta(page).click();
  await page.waitForFunction(() => /Firmenkonto beantragt/.test(document.body.innerText), null, { timeout: 10000 });
  assert.deepEqual(zustand.volumen, ["51_100"]);
  await page.close();
});

test("D — lehnt der Server ab, steht seine Meldung am Feld statt als Banner", async () => {
  const { page } = await seite({ serverLehntAb: true });
  await fuelleOhneVolumen(page);
  await feld(page).selectOption("none_yet");
  await cta(page).click();
  await page.locator("#reg-volume-error").waitFor({ timeout: 10000 });
  assert.match(norm(await page.locator("#reg-volume-error").innerText()), /Bitte wählen Sie Ihr voraussichtliches monatliches Versandvolumen/);
  assert.equal(await page.locator(".auth-alert-error").count(), 0, "die Feldmeldung erscheint als Banner");
  await page.close();
});

test("E — geschlossen eine Feldzeile mit Pfeil, weit kompakter als die acht Karten; 390 px ohne Überlauf", async () => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const { page } = await seite({ viewport });
    const m = await page.evaluate(() => {
      const f = document.querySelector("#reg-volume");
      const r = f.getBoundingClientRect();
      const b = document.querySelector(".auth-volume").getBoundingClientRect();
      const pfeil = getComputedStyle(f.parentElement, "::after");
      return {
        feld: [r.left, r.right, r.height], block: b.height, fenster: window.innerWidth,
        pfeil: pfeil.content !== "none" && pfeil.content !== "normal" && parseFloat(pfeil.width) > 0,
        textfarbe: getComputedStyle(f).color,
        platzhalterfarbe: getComputedStyle(document.querySelector("#reg-name"), "::placeholder").color,
        quer: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    const [l, r, h] = m.feld;
    assert.ok(l >= 0 && r <= m.fenster + 1, `Feld außerhalb des Bildes: ${l}–${r}`);
    assert.ok(h >= 44, `Trefferfläche unter 44 px: ${h}`);
    // Vorher standen die acht Karten 274 px (1440) bzw. 502 px (390) hoch: Frage, Feld und Hinweis brauchen höchstens 140 px.
    assert.ok(m.block <= 140, `Versandvolumen braucht ${m.block} px`);
    assert.equal(m.pfeil, true, "das geschlossene Feld zeigt keinen Pfeil zum Öffnen");
    assert.equal(m.textfarbe, m.platzhalterfarbe, "der leere Zustand steht nicht im Platzhalterton");
    assert.ok(m.quer <= 0, `horizontaler Überlauf ${m.quer}px`);
    // Gewählt steht die Angabe im Feld — in der Textfarbe, nicht mehr im Platzhalterton.
    await page.locator("#reg-volume").selectOption("over_1000");
    assert.equal(await page.locator("#reg-volume").evaluate((e) => e.options[e.selectedIndex].textContent), "Mehr als 1.000 Sendungen");
    assert.notEqual(await page.locator("#reg-volume").evaluate((e) => getComputedStyle(e).color), m.platzhalterfarbe);
    await page.close();
  }
});
