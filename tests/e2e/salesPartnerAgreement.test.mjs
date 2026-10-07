// E2E: Vertriebspartnervereinbarung (/partnervereinbarung) und der Link aus der
// Partnerregistrierung.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (Routing am
// Browserkontext — es greift damit auch in einem neu geöffneten Tab). Kein
// Request verlässt den Browser; das registrierte Dokument selbst wird nie
// abgerufen, geprüft wird nur sein Link. Geprüft wird:
//   1. Veröffentlichte Fassung: Titel, „Fassung 1.0“, „Gültig ab …“, Knopf
//      „Dokument öffnen“ auf genau den Dokumentpfad des Servers am API-Host,
//      neuer Tab, keine Einbettung, öffentlicher Abruf ohne Token.
//   2. Gültigkeit mit Ende („bis …“).
//   3. Keine veröffentlichte Fassung: der neutrale Satz, kein Knopf.
//   4. Ladefehler: neutraler Hinweis, „Erneut versuchen“ lädt nach.
//   5. Partnerregistrierung: „Vertriebspartnervereinbarung lesen“ öffnet
//      /partnervereinbarung in einem neuen Tab; die Zustimmung nennt die Fassung.
//   6. Registrierung mit abweichender Fassung bleibt geschlossen (fail-closed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5484, BASE = `http://127.0.0.1:${PORT}`;
const API_HOST = "https://api.confidaraexpress.de";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const FASSUNG = {
  title: "Vertriebspartnervereinbarung", version: "1.0", effectiveFrom: "2026-10-01", effectiveTo: null,
  documentPath: "/api/legal/sales_partner_agreement/1.0",
};
const CONFIG = {
  registrationEnabled: true, referralsEnabled: false, referralRetentionDays: 30,
  agreementVersion: "1.0",
  agreement: { version: "1.0", effectiveFrom: "2026-10-01", effectiveTo: null, documentPath: FASSUNG.documentPath },
};

let server, browser;

// Backend-Mock am Kontext. `antworten` liefert je Aufruf von
// GET /api/sales-partner/agreement [status, body]; der letzte Eintrag bleibt stehen.
async function setup({ antworten = [[200, { agreement: FASSUNG }]], config = CONFIG } = {}) {
  const context = await browser.newContext();
  const calls = { agreement: [], config: 0, other: [], document: 0 };
  const liste = [...antworten];
  await context.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/api/sales-partner/agreement")) {
      calls.agreement.push({ authorization: req.headers().authorization || null });
      const [status, body] = liste.length > 1 ? liste.shift() : liste[0];
      return json(body, status);
    }
    if (p.endsWith("/api/sales-partner/public-config")) { calls.config += 1; return json(config); }
    if (p.startsWith("/api/legal/")) { calls.document += 1; return route.fulfill({ status: 404, body: "" }); }
    calls.other.push(p);
    return json({});
  });
  const page = await context.newPage();
  return { context, page, calls };
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
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — veröffentlichte Fassung: Fassung, Gültigkeit, Dokument im neuen Tab, öffentlich ohne Token", async () => {
  const { context, page, calls } = await setup();
  await page.goto(`${BASE}/partnervereinbarung`, { waitUntil: "networkidle" });
  await page.locator("#spa-version").waitFor({ state: "visible" });
  assert.equal(await page.locator("h1").innerText(), "Vertriebspartnervereinbarung");
  assert.equal(await page.locator("#spa-version").innerText(), "Fassung 1.0");
  assert.equal(await page.locator("#spa-validity").innerText(), "Gültig ab 01.10.2026");

  const link = page.locator("#spa-document");
  assert.match(await link.innerText(), /^Dokument öffnen/);
  assert.equal(await link.getAttribute("href"), `${API_HOST}/api/legal/sales_partner_agreement/1.0`,
    "genau der Dokumentpfad des Servers am API-Host");
  assert.equal(await link.getAttribute("target"), "_blank");
  assert.equal(await link.getAttribute("rel"), "noopener noreferrer");

  // Kein Vertragstext und keine Einbettung — das Dokument ist nur verlinkt.
  assert.equal(await page.locator("iframe, embed, object").count(), 0);
  assert.equal(calls.document, 0, "das Dokument wird beim Anzeigen der Seite nicht abgerufen");
  assert.ok(calls.agreement.length >= 1);
  assert.ok(calls.agreement.every((c) => c.authorization === null), "der Abruf ist öffentlich und trägt kein Token");
  assert.deepEqual(calls.other, [], `unerwartete Aufrufe: ${calls.other.join(", ")}`);
  await context.close();
});

test("2 — Gültigkeit mit Ende: „Gültig ab … bis …“", async () => {
  const { context, page } = await setup({ antworten: [[200, { agreement: { ...FASSUNG, effectiveTo: "2026-12-31" } }]] });
  await page.goto(`${BASE}/partnervereinbarung`, { waitUntil: "networkidle" });
  await page.locator("#spa-validity").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spa-validity").innerText(), "Gültig ab 01.10.2026 bis 31.12.2026");
  await context.close();
});

test("3 — ohne veröffentlichte Fassung: neutraler Satz, kein Dokumentknopf", async () => {
  const { context, page } = await setup({ antworten: [[200, { agreement: null }]] });
  await page.goto(`${BASE}/partnervereinbarung`, { waitUntil: "networkidle" });
  await page.locator("#spa-none").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spa-none").innerText(),
    "Derzeit ist keine Fassung der Vertriebspartnervereinbarung veröffentlicht.");
  assert.equal(await page.locator("#spa-document").count(), 0);
  assert.equal(await page.locator("#spa-version").count(), 0);
  await context.close();
});

test("4 — Ladefehler: neutraler Hinweis, „Erneut versuchen“ lädt die Fassung nach", async () => {
  const { context, page, calls } = await setup({
    antworten: [[500, { error: "TypeError: internal" }], [200, { agreement: FASSUNG }]],
  });
  await page.goto(`${BASE}/partnervereinbarung`, { waitUntil: "networkidle" });
  await page.locator("#spa-retry").waitFor({ state: "visible" });
  const text = await page.locator("#spa-sheet").innerText();
  assert.match(text, /Die Vertriebspartnervereinbarung konnte nicht geladen werden\./);
  assert.doesNotMatch(text, /TypeError|internal/, "kein Rohfehler des Servers");
  assert.doesNotMatch(text, /Derzeit ist keine Fassung/, "ein Fehler ist nicht „keine Fassung“");
  await page.locator("#spa-retry").click();
  await page.locator("#spa-version").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spa-version").innerText(), "Fassung 1.0");
  assert.equal(calls.agreement.length, 2);
  await context.close();
});

test("5 — Partnerregistrierung: der Vereinbarungslink öffnet /partnervereinbarung im neuen Tab", async () => {
  const { context, page, calls } = await setup();
  await page.goto(`${BASE}/partner-registrieren`, { waitUntil: "networkidle" });
  await page.locator("#sp-form").waitFor({ state: "visible" });
  assert.match(await page.locator("#sp-agreement").innerText(), /Vertriebspartnervereinbarung in der Fassung 1\.0\./);

  const link = page.locator("#sp-agreement-link");
  assert.equal(await link.getAttribute("href"), "/partnervereinbarung");
  assert.equal(await link.getAttribute("target"), "_blank");
  assert.equal(await link.getAttribute("rel"), "noopener noreferrer");

  // Der wahrscheinlichste Weg: erst lesen, dann ausfüllen. Das Namensfeld ist
  // automatisch fokussiert und noch leer — der ERSTE Klick muss den Tab öffnen
  // (gemessen: ohne Fokuserhalt schob der Fehler des verlassenen Felds den Link
  // zwischen Drücken und Loslassen weg, und der Klick ging ins Leere).
  assert.equal(await page.evaluate(() => document.activeElement?.id), "sp-name");
  const [tab] = await Promise.all([context.waitForEvent("page", { timeout: 10000 }), link.click()]);
  await tab.waitForLoadState("networkidle");
  await tab.locator("#spa-version").waitFor({ state: "visible" });
  assert.equal(new URL(tab.url()).pathname, "/partnervereinbarung");
  assert.equal(await tab.locator("#spa-version").innerText(), "Fassung 1.0");
  // Das Registrierungsformular bleibt im ursprünglichen Tab unverändert stehen.
  assert.equal(await page.locator("#sp-form").count(), 1);
  assert.equal(await page.locator("#sp-form .auth-field-error").count(), 0, "kein Feldfehler durch den Leseklick");
  assert.ok(calls.config >= 1);
  assert.equal(calls.document, 0);
  await context.close();
});

test("6 — abweichende Fassung in der Konfiguration: die Registrierung bleibt geschlossen", async () => {
  const { context, page } = await setup({ config: { ...CONFIG, agreementVersion: "0.9" } });
  await page.goto(`${BASE}/partner-registrieren`, { waitUntil: "networkidle" });
  await page.locator("#sp-state").waitFor({ state: "visible" });
  assert.match(await page.locator("#sp-state").innerText(), /nicht geöffnet/);
  assert.equal(await page.locator("#sp-form").count(), 0, "kein Formular für eine nicht registrierte Fassung");
  await context.close();
});
