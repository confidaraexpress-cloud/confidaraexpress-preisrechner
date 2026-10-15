// E2E: Paket C (Go-Live) — Unternehmererklärung und AGB-Bestätigung bei der Registrierung.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route) — es entsteht zu keinem
// Zeitpunkt eine echte Registrierung. Vom Request-Body werden nur die Erklärungsfelder geprüft;
// das Passwort wird weder protokolliert noch verglichen.
//
//   A — ohne Erklärungen: CTA gesperrt, kein Request, Fehler an beiden Checkboxen
//   B — mit Fassung: AGB-Link auf die versionierte PDF, Stand im Text, Payload mit Setschlüssel
//   C — ohne abrufbare Fassung: Link auf /agb, Payload ohne Setschlüssel (Server speichert ohne Fassung)
//   D — 409 LEGAL_SET_CHANGED: Meldung, AGB-Bestätigung zurückgesetzt, neue Fassung geladen, KEIN Auto-Retry
//   E — der AGB-Link schaltet die Checkbox nicht um; Tastatur (Leertaste) schon; mobil ohne Überlauf
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5492, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

let server, browser;

const FASSUNG = (stand) => ({
  setId: 3, setKey: `SET-${stand}`,
  documents: [
    { type: "terms", version: stand, label: "Allgemeine Geschäftsbedingungen", url: `/api/legal/terms/${stand}` },
    { type: "privacy", version: "2026-07", label: "Datenschutzerklärung", url: "/api/legal/privacy/2026-07" },
  ],
});

async function setup(page, opts = {}) {
  const state = { legalCalls: 0, bodies: [], stand: "2026-08", legal503: false, rejectOnce: false, ...opts };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/api/legal/current")) {
      state.legalCalls += 1;
      if (state.legal503) return json({ error: "Die Vertragsunterlagen sind derzeit nicht abrufbar.", code: "LEGAL_DOCUMENTS_NOT_CONFIGURED" }, 503);
      return json(FASSUNG(state.stand));
    }
    if (p.endsWith("/register")) {
      const b = JSON.parse(req.postData() || "{}");
      // Nur die Erklärungsfelder festhalten — nie das Passwort.
      state.bodies.push({
        businessCustomerConfirmed: b.businessCustomerConfirmed, termsAcknowledged: b.termsAcknowledged,
        legalSetKey: b.legalSetKey, hatLegalSetKey: "legalSetKey" in b,
      });
      if (state.rejectOnce && state.bodies.length === 1) {
        state.stand = "2026-11";
        return json({ error: "Die Vertragsunterlagen wurden aktualisiert.", code: "LEGAL_SET_CHANGED", field: "legalSetKey" }, 409);
      }
      return json({ message: "Registrierung erfolgreich" });
    }
    if (p.includes("/api/shipping/launch-scope")) return json({ countries: [{ code: "DE", name: "Deutschland" }] });
    return json({});
  });
  return state;
}

async function oeffnen(page) {
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.waitForSelector("#reg-name");
}
async function fuelleFelder(page) {
  await page.fill("#reg-name", "Max Mustermann");
  await page.fill("#reg-email", "einkauf@muster-logistik.de");
  await page.fill("#reg-company", "Muster Logistik GmbH");
  const pw = page.locator('.auth-input[type="password"]');
  await pw.nth(0).fill("EinSicheresPasswort2026");
  await pw.nth(1).fill("EinSicheresPasswort2026");
}
const cta = (page) => page.locator("button.auth-cta");
const angehakt = async (page, sel) => (await page.locator(sel).getAttribute("aria-checked")) === "true";

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
  if (server) {
    stopDevServer(server, "SIGKILL");
  }
});

test("A — ohne Erklärungen: CTA gesperrt mit sichtbarem Grund, kein Request", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  await oeffnen(page);
  // Solange noch andere Felder fehlen, steht der Erklärungshinweis nicht da (keine Fehlerwand).
  assert.equal(await page.locator(".auth-declaration-hint").count(), 0);
  await fuelleFelder(page);
  assert.equal(await cta(page).isDisabled(), true, "ohne Erklärungen absendbar");
  // Der gesperrte Knopf hat eine sichtbare Begründung direkt unter den Erklärungen.
  assert.match(await page.locator(".auth-declaration-hint").innerText(), /beiden Erklärungen/);
  // Enter im Formular: Chromium unterdrückt die Absendung bei gesperrtem Knopf — kein Request.
  await page.locator("#reg-name").press("Enter");
  await page.waitForTimeout(400);
  assert.equal(state.bodies.length, 0, "es ging ein Registrierungsrequest hinaus");
  // Nach beiden Häkchen verschwindet der Hinweis, der Knopf wird bedienbar.
  await page.click("#reg-business .auth-checkbox");
  await page.click("#reg-terms .auth-checkbox");
  assert.equal(await page.locator(".auth-declaration-hint").count(), 0);
  assert.equal(await cta(page).isDisabled(), false);
  // Keine Einwilligungsbox für den Datenschutz, und der frühere Satz nach dem Knopf ist weg.
  const text = await page.locator("form").innerText();
  assert.ok(!/Mit der Registrierung akzeptieren Sie/.test(text));
  assert.equal(await page.locator('[role="checkbox"]').count(), 2, "nicht genau zwei Erklärungen");
  await page.close();
});

test("B — mit Fassung: versionierter AGB-Link, Stand im Text, Payload mit Setschlüssel", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  await oeffnen(page);
  await page.waitForFunction(() => document.querySelector("#reg-terms")?.innerText.includes("Stand 2026-08"));
  const href = await page.locator("#reg-terms a").getAttribute("href");
  assert.ok(String(href).endsWith("/api/legal/terms/2026-08"), `AGB-Link zeigt auf ${href}`);
  await fuelleFelder(page);
  await page.click("#reg-business .auth-checkbox");
  await page.click("#reg-terms .auth-checkbox");
  assert.equal(await cta(page).isDisabled(), false);
  await cta(page).click();
  await page.waitForTimeout(600);
  assert.equal(state.bodies.length, 1);
  assert.deepEqual(state.bodies[0], { businessCustomerConfirmed: true, termsAcknowledged: true, legalSetKey: "SET-2026-08", hatLegalSetKey: true });
  await page.close();
});

test("C — ohne abrufbare Fassung: Link auf /agb, kein Setschlüssel im Payload", async () => {
  const page = await browser.newPage();
  const state = await setup(page, { legal503: true });
  await oeffnen(page);
  await page.waitForTimeout(400);
  const href = await page.locator("#reg-terms a").getAttribute("href");
  assert.equal(href, "/agb");
  assert.ok(!/Stand/.test(await page.locator("#reg-terms").innerText()), "eine Fassung wird angezeigt, die nicht geladen ist");
  await fuelleFelder(page);
  await page.click("#reg-business .auth-checkbox");
  await page.click("#reg-terms .auth-checkbox");
  await cta(page).click();
  await page.waitForTimeout(600);
  assert.equal(state.bodies.length, 1);
  assert.deepEqual(state.bodies[0], { businessCustomerConfirmed: true, termsAcknowledged: true, legalSetKey: undefined, hatLegalSetKey: false });
  await page.close();
});

test("D — 409 LEGAL_SET_CHANGED: Meldung, AGB-Bestätigung zurückgesetzt, neue Fassung, kein Auto-Retry", async () => {
  const page = await browser.newPage();
  const state = await setup(page, { rejectOnce: true });
  await oeffnen(page);
  await page.waitForFunction(() => document.querySelector("#reg-terms")?.innerText.includes("Stand 2026-08"));
  await fuelleFelder(page);
  await page.click("#reg-business .auth-checkbox");
  await page.click("#reg-terms .auth-checkbox");
  const vorher = state.legalCalls;
  await cta(page).click();
  await page.waitForFunction(() => document.querySelector("#reg-terms")?.innerText.includes("Stand 2026-11"), undefined, { timeout: 15000 });
  assert.ok(state.legalCalls > vorher, "die Fassung wurde nicht neu geladen");
  assert.equal(await angehakt(page, "#reg-terms"), false, "die AGB-Bestätigung blieb gesetzt");
  assert.equal(await angehakt(page, "#reg-business"), true, "die Unternehmererklärung wurde unnötig zurückgesetzt");
  assert.match(await page.locator(".auth-alert-error").innerText(), /aktualisiert/);
  await page.waitForTimeout(800);
  assert.equal(state.bodies.length, 1, `automatischer Wiederholungsversuch: ${state.bodies.length}`);
  await page.close();
});

test("E — Link schaltet nicht um, Leertaste schon; mobil ohne Überlauf", async () => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await ctx.newPage();
  await setup(page);
  await oeffnen(page);
  await page.waitForFunction(() => document.querySelector("#reg-terms")?.innerText.includes("Stand 2026-08"));
  // Der Link öffnet ein neues Fenster — das wird hier abgefangen; die Checkbox bleibt unberührt.
  const [neu] = await Promise.all([ctx.waitForEvent("page"), page.click("#reg-terms a")]);
  await neu.close();
  assert.equal(await angehakt(page, "#reg-terms"), false, "das Lesen der AGB hat die Bestätigung gesetzt");
  await page.focus("#reg-business");
  await page.keyboard.press(" ");
  assert.equal(await angehakt(page, "#reg-business"), true, "die Leertaste schaltet die Erklärung nicht um");
  const mass = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth, breite: window.innerWidth,
    rechts: Math.max(...[...document.querySelectorAll(".auth-declaration")].map((e) => e.getBoundingClientRect().right)),
  }));
  assert.ok(mass.scroll <= mass.breite, `waagrechter Überlauf: ${JSON.stringify(mass)}`);
  assert.ok(mass.rechts <= mass.breite, `Erklärung ragt aus der Breite: ${JSON.stringify(mass)}`);
  await ctx.close();
});
