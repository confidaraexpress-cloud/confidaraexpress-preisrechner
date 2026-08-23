// E2E: UAT T-003 — ein 7-Zeichen-Passwort erzeugt kein ConfidaraExpress-Konto.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route) — es
// entsteht zu keinem Zeitpunkt eine echte Registrierung. Der Mock zählt jeden
// POST /register mit: der entscheidende Nachweis ist nicht der Buttonzustand,
// sondern dass gar kein Request hinausgeht, solange das Passwort zu kurz ist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5342, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

let server, browser;

// Registriert das Backend-Mock und liefert den Zähler der /register-Aufrufe.
async function setup(page, { onRegister } = {}) {
  const registerCalls = [];
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/register")) {
      // Der Body wird bewusst NICHT protokolliert — er enthält ein Passwort.
      registerCalls.push(p);
      if (onRegister) return onRegister(route, json);
      return json({ message: "Registrierung erfolgreich" });
    }
    return json({});
  });
  return registerCalls;
}

// Füllt alle Pflichtfelder außer den beiden Passwortfeldern.
async function fillPflichtfelder(page) {
  await page.fill("#reg-name", "Max Mustermann");
  await page.fill("#reg-email", "einkauf@muster-logistik.de");
  await page.fill("#reg-company", "Muster Logistik GmbH");
}

const pwFelder = (page) => page.locator('.auth-input[type="password"]');
async function fillPasswort(page, wert) {
  await pwFelder(page).nth(0).fill(wert);
  await pwFelder(page).nth(1).fill(wert);
}

const cta = (page) => page.locator("button.auth-cta");

async function openRegister(page) {
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.waitForSelector("#reg-name");
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { detached: true, stdio: "ignore" });
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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`,
    // das seinerseits node startet.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — 7 Zeichen: CTA gesperrt, kein Request, Feldfehler sichtbar", async () => {
  const page = await browser.newPage();
  const calls = await setup(page);
  await openRegister(page);
  await fillPflichtfelder(page);
  await fillPasswort(page, "Abc123!");           // exakt 7 Zeichen

  await assert.doesNotReject(cta(page).waitFor({ state: "visible" }));
  assert.equal(await cta(page).isDisabled(), true, "Der CTA ist bei 7 Zeichen bedienbar");

  // Absenden per Enter im Formular — das umgeht den deaktivierten Button.
  await page.locator("#reg-name").press("Enter");
  await page.waitForTimeout(400);
  assert.equal(calls.length, 0, "Es ging ein Registrierungsrequest hinaus");

  const fehler = await page.locator(".auth-field-error").allInnerTexts();
  assert.ok(fehler.some((t) => /mindestens 8 Zeichen/.test(t)), `Kein Längenhinweis: ${JSON.stringify(fehler)}`);
  await page.close();
});

test("2 — 8 Zeichen: Formular erreicht den gültigen Zustand", async () => {
  const page = await browser.newPage();
  await setup(page);
  await openRegister(page);
  await fillPflichtfelder(page);
  await fillPasswort(page, "Abc123!");
  assert.equal(await cta(page).isDisabled(), true);

  await fillPasswort(page, "Abcd1234");          // exakt 8 Zeichen
  await page.waitForTimeout(150);
  assert.equal(await cta(page).isDisabled(), false, "Der CTA bleibt bei 8 Zeichen gesperrt");
  const fehler = await page.locator(".auth-field-error").allInnerTexts();
  assert.ok(!fehler.some((t) => /mindestens 8 Zeichen/.test(t)), "Längenhinweis steht noch");
  await page.close();
});

test("3 — abweichende Wiederholung sperrt trotz gültiger Länge", async () => {
  const page = await browser.newPage();
  const calls = await setup(page);
  await openRegister(page);
  await fillPflichtfelder(page);
  await pwFelder(page).nth(0).fill("Abcd1234");
  await pwFelder(page).nth(1).fill("Abcd9999");
  await page.waitForTimeout(150);
  assert.equal(await cta(page).isDisabled(), true, "Der CTA ist trotz abweichender Wiederholung bedienbar");
  await page.locator("#reg-name").press("Enter");
  await page.waitForTimeout(300);
  assert.equal(calls.length, 0, "Es ging ein Registrierungsrequest hinaus");
  await page.close();
});

test("4 — gültige Eingaben senden genau EINEN Request", async () => {
  const page = await browser.newPage();
  const calls = await setup(page);
  await openRegister(page);
  await fillPflichtfelder(page);
  await fillPasswort(page, "EinSicheresPasswort2026");
  await cta(page).click();
  await page.waitForTimeout(500);
  assert.equal(calls.length, 1, `Erwartet 1 Request, gemessen ${calls.length}`);
  await page.close();
});

test("5 — ein serverseitiger Passwortfehler landet AM Passwortfeld", async () => {
  // Ein Client mit veraltetem Bundle käme hier an. Das Backend antwortet mit
  // { error, code, field:"password" } — der Text muss am Feld stehen, nicht nur
  // als Banner, sonst weiß der Kunde nicht, was er ändern soll.
  const page = await browser.newPage();
  await setup(page, {
    onRegister: (route, json) => json(
      { error: "Passwort muss mindestens 8 Zeichen haben", code: "PASSWORD_TOO_SHORT", field: "password" },
      400,
    ),
  });
  await openRegister(page);
  await fillPflichtfelder(page);
  await fillPasswort(page, "EinSicheresPasswort2026");
  await cta(page).click();
  await page.waitForSelector(".auth-field-error");
  const fehler = await page.locator(".auth-field-error").allInnerTexts();
  assert.ok(fehler.some((t) => /mindestens 8 Zeichen haben/.test(t)), `Serverfehler nicht am Feld: ${JSON.stringify(fehler)}`);
  await page.close();
});
