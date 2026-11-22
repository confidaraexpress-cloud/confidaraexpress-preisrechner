// E2E: UAT T-003 — ein 7-Zeichen-Passwort erzeugt kein ConfidaraExpress-Konto.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route) — es
// entsteht zu keinem Zeitpunkt eine echte Registrierung. Der Mock zählt jeden
// POST /register mit: der entscheidende Nachweis ist nicht der Buttonzustand,
// sondern dass gar kein Request hinausgeht, solange das Passwort zu kurz ist.
//
// Seit Premium UX 4.0 (A3, 2026-11-22) stehen die Passwortfelder im ersten Schritt „Ansprechpartner und Zugang“:
// „Weiter“ prüft den Schritt im Browser und sendet nichts; erst „Konto beantragen“ im dritten Schritt sendet. Die Suite
// geht über den gemeinsamen Bedienvertrag (helpers/registrierung.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import {
  SCHRITT, absendeKnopf, aktuellerSchritt, erklaerungenAnhaken, fuelleUnternehmen, weiter, weiterKnopf,
} from "./helpers/registrierung.mjs";
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

// Füllt im ersten Schritt Ansprechpartner und E-Mail — die beiden Passwortfelder füllt jeder Fall selbst.
async function fillZugangOhnePasswort(page) {
  await page.fill("#reg-name", "Max Mustermann");
  await page.fill("#reg-email", "einkauf@muster-logistik.de");
}
// Vom ersten Schritt bis vor das Absenden: weiter, Unternehmen (Firma, USt-IdNr. — Pflicht seit Auftrag 2 / P10 —,
// Versandvolumen — Pflicht seit Phase 1), weiter, beide Pflichterklärungen (Unternehmer, AGB; seit Paket C).
async function bisZumAbsenden(page) {
  await weiter(page);
  await fuelleUnternehmen(page);
  await weiter(page);
  await erklaerungenAnhaken(page);
}

const pwFelder = (page) => page.locator('.auth-input[type="password"]');
async function fillPasswort(page, wert) {
  await pwFelder(page).nth(0).fill(wert);
  await pwFelder(page).nth(1).fill(wert);
}

const cta = (page) => absendeKnopf(page);
const imFokus = (page) => page.evaluate(() => document.activeElement?.id || "");

async function openRegister(page) {
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.waitForSelector("#reg-name");
}

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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`,
    // das seinerseits node startet.
    stopDevServer(server, "SIGKILL");
  }
});

test("1 — 7 Zeichen: „Weiter“ hält an, kein Request, Feldfehler sichtbar", async () => {
  const page = await browser.newPage();
  const calls = await setup(page);
  await openRegister(page);
  await fillZugangOhnePasswort(page);
  await fillPasswort(page, "Abc123!");           // exakt 7 Zeichen

  // „Weiter“ prüft den Schritt: das Formular bleibt im ersten Schritt, der Fokus geht an das Passwortfeld.
  await weiterKnopf(page).click();
  await page.waitForTimeout(300);
  assert.equal(await aktuellerSchritt(page), SCHRITT.zugang, "Mit 7 Zeichen ging es in den nächsten Schritt");
  assert.equal(await imFokus(page), "reg-password", "Der Fokus steht nicht am Passwortfeld");

  // Enter im Formular wirkt wie „Weiter“: wieder kein Schritt weiter und kein Request.
  await page.locator("#reg-name").press("Enter");
  await page.waitForTimeout(400);
  assert.equal(await aktuellerSchritt(page), SCHRITT.zugang);
  assert.equal(calls.length, 0, "Es ging ein Registrierungsrequest hinaus");

  const fehler = await page.locator(".auth-field-error").allInnerTexts();
  assert.ok(fehler.some((t) => /mindestens 8 Zeichen/.test(t)), `Kein Längenhinweis: ${JSON.stringify(fehler)}`);
  await page.close();
});

test("2 — 8 Zeichen: Formular erreicht den gültigen Zustand", async () => {
  const page = await browser.newPage();
  await setup(page);
  await openRegister(page);
  await fillZugangOhnePasswort(page);
  await fillPasswort(page, "Abc123!");
  await weiterKnopf(page).click();
  await page.waitForTimeout(300);
  assert.equal(await aktuellerSchritt(page), SCHRITT.zugang);

  await fillPasswort(page, "Abcd1234");          // exakt 8 Zeichen
  await page.waitForTimeout(150);
  const fehler = await page.locator(".auth-field-error").allInnerTexts();
  assert.ok(!fehler.some((t) => /mindestens 8 Zeichen/.test(t)), "Längenhinweis steht noch");
  await bisZumAbsenden(page);
  assert.equal(await cta(page).isDisabled(), false, "Der CTA bleibt bei 8 Zeichen gesperrt");
  await page.close();
});

test("3 — abweichende Wiederholung hält trotz gültiger Länge an", async () => {
  const page = await browser.newPage();
  const calls = await setup(page);
  await openRegister(page);
  await fillZugangOhnePasswort(page);
  await pwFelder(page).nth(0).fill("Abcd1234");
  await pwFelder(page).nth(1).fill("Abcd9999");
  await page.waitForTimeout(150);
  await weiterKnopf(page).click();
  await page.waitForTimeout(300);
  assert.equal(await aktuellerSchritt(page), SCHRITT.zugang, "Trotz abweichender Wiederholung ging es weiter");
  assert.equal(await imFokus(page), "reg-password-repeat", "Der Fokus steht nicht an der Wiederholung");
  await page.locator("#reg-name").press("Enter");
  await page.waitForTimeout(300);
  assert.equal(calls.length, 0, "Es ging ein Registrierungsrequest hinaus");
  await page.close();
});

test("4 — gültige Eingaben senden genau EINEN Request, auch bei Doppelklick", async () => {
  const page = await browser.newPage();
  const calls = await setup(page);
  await openRegister(page);
  await fillZugangOhnePasswort(page);
  await fillPasswort(page, "EinSicheresPasswort2026");
  await bisZumAbsenden(page);
  // Ein Doppelklick auf „Konto beantragen“ sendet den Antrag einmal (keine doppelte Registrierung).
  await cta(page).dblclick();
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
  await fillZugangOhnePasswort(page);
  await fillPasswort(page, "EinSicheresPasswort2026");
  await bisZumAbsenden(page);
  await cta(page).click();
  // Der Fehler führt zurück in den ersten Schritt — an das Passwortfeld.
  await page.waitForSelector(".auth-field-error");
  const fehler = await page.locator(".auth-field-error").allInnerTexts();
  assert.ok(fehler.some((t) => /mindestens 8 Zeichen haben/.test(t)), `Serverfehler nicht am Feld: ${JSON.stringify(fehler)}`);
  assert.equal(await aktuellerSchritt(page), SCHRITT.zugang, "Der Fehler steht nicht im Schritt des Passworts");
  assert.equal(await imFokus(page), "reg-password", "Der Fokus steht nicht am Passwortfeld");
  await page.close();
});
