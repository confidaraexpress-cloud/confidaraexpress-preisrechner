// E2E: Paket C (Go-Live) — Unternehmererklärung und AGB-Bestätigung bei der Registrierung.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route) — es entsteht zu keinem
// Zeitpunkt eine echte Registrierung. Vom Request-Body werden nur die Erklärungsfelder geprüft;
// das Passwort wird weder protokolliert noch verglichen.
//
//   A — ohne Erklärungen: CTA gesperrt, kein Request, Fehler an beiden Checkboxen; Enter in Schritt 2 führt nur weiter
//
// Seit Premium UX 4.0 (A3, 2026-11-22) stehen die Erklärungen im dritten Schritt „Prüfen“; die Suiten gehen über den
// gemeinsamen Bedienvertrag (helpers/registrierung.mjs) dorthin.
//   B — mit Fassung: AGB-Link auf die versionierte PDF, Stand im Text, Payload mit Setschlüssel
//   C — ohne abrufbare Fassung: Link auf /agb, Payload ohne Setschlüssel (Server speichert ohne Fassung)
//   D — 409 LEGAL_SET_CHANGED: Meldung, AGB-Bestätigung zurückgesetzt, neue Fassung geladen, KEIN Auto-Retry
//   E — der AGB-Link schaltet die Checkbox nicht um; Tastatur (Leertaste) schon; mobil ohne Überlauf
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import {
  SCHRITT, absendeKnopf, bisPruefen, erklaerungenAnhaken, fuelleUnternehmen, fuelleZugang, warteAufSchritt, weiter,
} from "./helpers/registrierung.mjs";
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
// Alle Pflichtfelder (Zugang und Unternehmen, samt USt-IdNr. und Versandvolumen) bis zum Schritt „Prüfen“.
const fuelleFelder = (page) => bisPruefen(page);
const cta = (page) => absendeKnopf(page);
// Die Erklärungen sind native Checkboxen (<input type="checkbox"> im Container #reg-…, AUD-012).
const angehakt = (page, sel) => page.locator(`${sel} input[type="checkbox"]`).isChecked();

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
  await fuelleZugang(page);
  await weiter(page);
  await fuelleUnternehmen(page);
  // Enter in einem Feld des zweiten Schritts: der einzige Absendeknopf ist „Weiter“ — es geht in den Schritt „Prüfen“,
  // eine Anfrage entsteht dabei nicht.
  await page.locator("#reg-company").press("Enter");
  await warteAufSchritt(page, SCHRITT.pruefen);
  await page.waitForTimeout(300);
  assert.equal(state.bodies.length, 0, "Enter im zweiten Schritt hat eine Anfrage ausgelöst");
  assert.equal(await cta(page).isDisabled(), true, "ohne Erklärungen absendbar");
  // Der gesperrte Knopf hat eine sichtbare Begründung direkt unter den Erklärungen.
  assert.match(await page.locator(".auth-declaration-hint").innerText(), /beiden Erklärungen/);
  // Absenden am gesperrten Knopf vorbei (requestSubmit, wie Enter ohne Sperre): die Prüfung hält an — kein Request,
  // die Fehler stehen an beiden Erklärungen.
  await page.locator("form.auth-reg").evaluate((f) => f.requestSubmit());
  await page.locator("#reg-business-error").waitFor({ timeout: 5000 });
  assert.equal(await page.locator("#reg-terms-error").count(), 1, "kein Fehler an der AGB-Bestätigung");
  await page.waitForTimeout(400);
  assert.equal(state.bodies.length, 0, "es ging ein Registrierungsrequest hinaus");
  // Nach beiden Häkchen verschwinden Hinweis und Fehler, der Knopf wird bedienbar.
  await erklaerungenAnhaken(page);
  assert.equal(await page.locator("#reg-business-error, #reg-terms-error").count(), 0, "ein Erklärungsfehler bleibt stehen");
  assert.equal(await page.locator(".auth-declaration-hint").count(), 0);
  assert.equal(await cta(page).isDisabled(), false);
  // Keine Einwilligungsbox für den Datenschutz, und der frühere Satz nach dem Knopf ist weg.
  const text = await page.locator("form").innerText();
  assert.ok(!/Mit der Registrierung akzeptieren Sie/.test(text));
  // Paket D: die Option „Keine USt-IdNr. vorhanden“ (#reg-vat-absent) ist ebenfalls eine Checkbox im Auth-Stil —
  // gezählt werden deshalb nur die Erklärungen im Erklärungsblock (keine Einwilligungsbox für den Datenschutz).
  // Seit AUD-012 sind die Erklärungen native Checkboxen (implizite Rolle), deshalb getByRole statt [role=…].
  assert.equal(await page.locator(".auth-declarations").getByRole("checkbox").count(), 2, "nicht genau zwei Erklärungen");
  // Im ganzen Formular genau drei Kästchen: die beiden Erklärungen und die USt-IdNr.-Option. Die Option steht im zweiten
  // Schritt, der jetzt verborgen ist — gezählt wird deshalb mit includeHidden.
  assert.equal(await page.getByRole("checkbox", { includeHidden: true }).count(), 3, "Erklärungen plus USt-IdNr.-Option");
  assert.equal(await page.getByRole("checkbox").count(), 2, "im Schritt „Prüfen“ sind nur die Erklärungen bedienbar");
  // Jede Erklärung ist eine echte Checkbox mit zugeordneter Beschriftung (klickbarer Text, Screenreader-Name).
  for (const id of ["reg-business", "reg-terms"]) {
    assert.equal(await page.locator(`#${id} input[type="checkbox"]`).count(), 1, `${id}: keine native Checkbox`);
    assert.equal(await page.locator(`#${id} label[for="${id}-input"]`).count(), 1, `${id}: Beschriftung nicht zugeordnet`);
  }
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
  await erklaerungenAnhaken(page);
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
  await erklaerungenAnhaken(page);
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
  await erklaerungenAnhaken(page);
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
  await fuelleFelder(page);
  // Der Link öffnet ein neues Fenster — das wird hier abgefangen; die Checkbox bleibt unberührt.
  const [neu] = await Promise.all([ctx.waitForEvent("page"), page.click("#reg-terms a")]);
  await neu.close();
  assert.equal(await angehakt(page, "#reg-terms"), false, "das Lesen der AGB hat die Bestätigung gesetzt");
  await page.focus("#reg-business-input");
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
