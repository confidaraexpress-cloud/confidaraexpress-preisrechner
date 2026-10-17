// E2E: Auftrag 2 / P10 (2026-10-17) — die USt-IdNr. ist bei jeder Neuregistrierung Pflicht.
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — es entsteht keine echte Registrierung. Vom Request-Body wird
// nur die USt-IdNr. festgehalten, nie das Passwort. Die verbindliche Prüfung misst Backend register-vat-id-pg.
//
//   A  Feld „USt-IdNr.“ mit Pflichtstern, required, Hinweis — ohne Musterwert
//   B  leer verlassen: verständlicher Fehler am Feld, Registrierung gesperrt, keine Anfrage
//   C  falsches Format: Formatfehler am Feld; Korrektur nimmt ihn weg
//   D  der Server lehnt ab (VAT_ID_INVALID mit Feld): Meldung direkt am Feld, kein Banner
//   E  zulässige Nummer mit Leerzeichen: Anfrage mit normalisierter Nummer, Registrierung erfolgreich
//   F  nach Auswahl eines öffentlichen Versandangebots: Registrierung mit USt-IdNr. funktioniert; danach der bestehende
//      Hinweis, dass die Auswahl nach der Freischaltung neu berechnet wird
//   G  390 px: Feld, Hinweis und Fehler innerhalb des Formulars, kein horizontaler Überlauf
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5285, BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = `h1.${"T".repeat(120)}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

let server, browser;

async function seite({ serverLehntAb = false, viewport = { width: 1440, height: 1000 } } = {}) {
  const page = await browser.newPage({ viewport });
  const zustand = { ustIds: [] };
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/api/legal/current")) {
      return json({ setId: 3, setKey: "SET-2026-08", documents: [
        { type: "terms", version: "2026-08", label: "Allgemeine Geschäftsbedingungen", url: "/api/legal/terms/2026-08" },
        { type: "privacy", version: "2026-07", label: "Datenschutzerklärung", url: "/api/legal/privacy/2026-07" }] });
    }
    if (p.endsWith("/register")) {
      const b = JSON.parse(req.postData() || "{}");
      zustand.ustIds.push(b.vat_id);
      if (serverLehntAb) return json({ error: "Die USt-IdNr. hat kein gültiges Format. Sie beginnt mit dem Länderkürzel, für Deutschland DE und 9 Ziffern.", code: "VAT_ID_INVALID", field: "vat_id" }, 400);
      return json({ message: "Registrierung erfolgreich" });
    }
    if (p.includes("/api/shipping/launch-scope")) return json({ countries: [{ code: "DE", name: "Deutschland" }] });
    return json({});
  });
  return { page, zustand, fehler };
}

async function fuelle(page, ustId) {
  await page.fill("#reg-name", "Anna Berger");
  await page.fill("#reg-email", "einkauf@musterkunde.example");
  await page.fill("#reg-company", "Musterkunde GmbH");
  if (ustId !== undefined) await page.fill("#reg-vat", ustId);
  const pw = page.locator('.auth-input[type="password"]');
  await pw.nth(0).fill("EinSicheresPasswort2026");
  await pw.nth(1).fill("EinSicheresPasswort2026");
  await page.locator("#reg-business").click();
  await page.locator("#reg-terms").click();
}
const cta = (page) => page.locator("button.auth-cta");
const feldFehler = (page) => page.locator("#reg-vat").locator("xpath=ancestor::div[contains(@class,'auth-field')][1]").locator(".auth-field-error");
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

test("A — Feld „USt-IdNr.“: Pflichtstern, required, Hinweis, kein Musterwert", async () => {
  const { page, fehler } = await seite();
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.waitForSelector("#reg-vat");
  assert.equal(norm(await page.locator('label[for="reg-vat"]').innerText()), "USt-IdNr. *");
  assert.equal(await page.locator("#reg-vat").getAttribute("required"), "");
  assert.equal(await page.locator("#reg-vat").getAttribute("aria-required"), "true");
  assert.equal(await page.locator("#reg-vat").getAttribute("placeholder"), null);
  assert.match(norm(await page.locator("#reg-vat-hint").innerText()), /keine behördliche Bestätigung/);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — leer verlassen: Fehler am Feld, Registrierung gesperrt, keine Anfrage", async () => {
  const { page, zustand } = await seite();
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await fuelle(page);
  await page.locator("#reg-vat").focus();
  await page.locator("#reg-company").focus();
  assert.equal(norm(await feldFehler(page).innerText()), "Bitte geben Sie die USt-IdNr. Ihres Unternehmens an.");
  assert.equal(await page.locator("#reg-vat").getAttribute("aria-invalid"), "true");
  assert.equal(await cta(page).isDisabled(), true, "ohne USt-IdNr. absendbar");
  assert.equal(zustand.ustIds.length, 0);
  await page.close();
});

test("C — falsches Format: Formatfehler am Feld, Korrektur nimmt ihn weg", async () => {
  const { page, zustand } = await seite();
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await fuelle(page, "DE12345");
  await page.locator("#reg-vat").focus();
  await page.locator("#reg-company").focus();
  assert.match(norm(await feldFehler(page).innerText()), /kein gültiges Format/);
  assert.equal(await cta(page).isDisabled(), true);
  await page.fill("#reg-vat", "DE123456789");
  assert.equal(await feldFehler(page).count(), 0, "der Fehler bleibt nach der Korrektur stehen");
  assert.equal(await cta(page).isDisabled(), false);
  assert.equal(zustand.ustIds.length, 0);
  await page.close();
});

test("D — Ablehnung durch den Server: Meldung direkt am Feld, kein Banner", async () => {
  const { page, zustand } = await seite({ serverLehntAb: true });
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await fuelle(page, "DE123456789");
  await cta(page).click();
  await feldFehler(page).waitFor({ timeout: 10000 });
  assert.match(norm(await feldFehler(page).innerText()), /kein gültiges Format/);
  assert.equal(await page.locator(".auth-alert-error").count(), 0, "die Feldmeldung steht als Banner");
  assert.deepEqual(zustand.ustIds, ["DE123456789"]);
  await page.close();
});

test("E — zulässige Nummer mit Leerzeichen: normalisiert gesendet, Registrierung erfolgreich", async () => {
  const { page, zustand, fehler } = await seite();
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await fuelle(page, " de 123 456 789 ");
  await cta(page).click();
  await page.locator(".auth-alert-success").first().waitFor({ timeout: 10000 });
  assert.deepEqual(zustand.ustIds, ["DE123456789"]);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("F — nach Auswahl eines öffentlichen Versandangebots: Registrierung mit USt-IdNr. funktioniert", async () => {
  const { page, zustand, fehler } = await seite();
  await page.goto(`${BASE}/preisrechner-uebernahme#t=${TOKEN}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/register$/, { timeout: 30000 });
  await page.waitForSelector("#auth-handoff-pending", { timeout: 10000 });
  await fuelle(page, "ATU12345678");
  await cta(page).click();
  await page.locator(".auth-alert-success").first().waitFor({ timeout: 10000 });
  assert.deepEqual(zustand.ustIds, ["ATU12345678"]);
  // Bestehender Vertrag (Preisrechner-Go-Live): das neue Konto wartet auf die Freischaltung, die Übernahme entfällt mit
  // Hinweis — P10 ändert daran nichts.
  await page.locator("#auth-handoff-dropped").waitFor({ timeout: 10000 });
  assert.deepEqual(fehler, []);
  await page.close();
});

test("G — 390 px: Feld, Hinweis und Fehler innerhalb des Formulars, kein Überlauf", async () => {
  const { page } = await seite({ viewport: { width: 390, height: 900 } });
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.locator("#reg-vat").focus();
  await page.locator("#reg-company").focus();
  for (const sel of ["#reg-vat", "#reg-vat-hint"]) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b && b.x >= 0 && b.x + b.width <= 390, `${sel} ragt aus dem Bild`);
  }
  const f = await feldFehler(page).boundingBox();
  assert.ok(f && f.x + f.width <= 390, "der Fehler ragt aus dem Bild");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  await page.close();
});
