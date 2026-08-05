// E2E: Auth-Fehlerdarstellung (echter Dev-Server, echte Kaskade).
//
// Deckt die Audit-FAILs des Auth-Bereichs ab: rohe Browsertexte, leere Banner,
// stiller Rückwurf nach Login, stiller Logout bei Netzfehler beim App-Start.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5225, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = { id: 1, email: "kunde@example.com", company_name: "Muster GmbH", name: "Max Mustermann", role: "customer", status: "approved", customer_number: "CE-K-10030" };

let server, browser;

// Standard-Routing: alles ok — einzelne Tests überschreiben gezielt.
async function setup(page, { onLogin, onKundenbereich, onForgot, onValidate, token } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/login")) {
      if (onLogin) return onLogin(route, json);
      return json({ message: "Erfolgreich angemeldet", token: "e2e-token" });
    }
    if (p.endsWith("/kundenbereich")) {
      if (onKundenbereich) return onKundenbereich(route, json);
      return json({ user: USER });
    }
    if (p.includes("/auth/forgot-password")) {
      if (onForgot) return onForgot(route, json);
      return json({ message: "Falls ein Konto existiert, wurde eine E-Mail gesendet." });
    }
    if (p.includes("/auth/validate-reset-token")) {
      if (onValidate) return onValidate(route, json);
      return json({ valid: true });
    }
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: { open_amount: 0, open_count: 0, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: false } });
    return json({});
  });
  if (token) await page.addInitScript((t) => localStorage.setItem("ce_token", t), token);
}

async function fillLogin(page) {
  await page.fill('input[type="email"]', "kunde@example.com");
  await page.fill('input[type="password"]', "geheim-123");
}

const bannerText = async (page) =>
  (await page.locator(".auth-alert-error").first().innerText()).replace(/\s+/g, " ").trim();

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
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
  if (server) server.kill("SIGKILL");
});

test("Login offline: Verbindungstext statt Failed to fetch, Eingaben bleiben", async () => {
  const page = await browser.newPage();
  await setup(page, { onLogin: (route) => route.abort("failed") });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await fillLogin(page);
  await page.getByRole("button", { name: /^Anmelden$/ }).last().click();
  await page.waitForSelector(".auth-alert-error", { timeout: 10000 });
  const t = await bannerText(page);
  assert.ok(!/Failed to fetch|TypeError/.test(t), `roher Browsertext sichtbar: ${t}`);
  assert.match(t, /Internetverbindung/);
  assert.equal(await page.inputValue('input[type="email"]'), "kunde@example.com", "Eingaben müssen erhalten bleiben");
  await page.close();
});

test("Login mit HTML-Fehlerseite (nicht lesbare Antwort): kein Parserfehler im Banner", async () => {
  const page = await browser.newPage();
  await setup(page, { onLogin: (route) => route.fulfill({ status: 502, contentType: "text/html", body: "<html>Bad Gateway</html>" }) });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await fillLogin(page);
  await page.getByRole("button", { name: /^Anmelden$/ }).last().click();
  await page.waitForSelector(".auth-alert-error", { timeout: 10000 });
  const t = await bannerText(page);
  assert.ok(!/Unexpected token|JSON/.test(t), `Parsertext sichtbar: ${t}`);
  assert.match(t, /momentan nicht möglich/);
  await page.close();
});

test("gesperrtes Konto zeigt den Sperrtext, pending den Freigabetext", async () => {
  for (const [code, erwartung] of [
    ["ACCOUNT_BLOCKED", /gesperrt.*Support/],
    ["ACCOUNT_PENDING_APPROVAL", /noch nicht freigeschaltet/],
  ]) {
    const page = await browser.newPage();
    await setup(page, { onLogin: (route, json) => json({ error: "x", code }, 403) });
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await fillLogin(page);
    await page.getByRole("button", { name: /^Anmelden$/ }).last().click();
    await page.waitForSelector(".auth-alert-error", { timeout: 10000 });
    assert.match(await bannerText(page), erwartung, `Code ${code}`);
    await page.close();
  }
});

test("Login ok, /kundenbereich 500: sichtbare Meldung statt stillem Rückwurf", async () => {
  const page = await browser.newPage();
  await setup(page, { onKundenbereich: (route, json) => json({ error: "Fehler" }, 500) });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await fillLogin(page);
  await page.getByRole("button", { name: /^Anmelden$/ }).last().click();
  await page.waitForSelector(".auth-alert-error", { timeout: 10000 });
  const t = await bannerText(page);
  assert.match(t, /Anmeldung war erfolgreich/, "der Kunde muss erfahren, dass NICHT das Passwort das Problem ist");
  assert.match(page.url(), /\/login/, "keine Navigation ins Dashboard");
  await page.close();
});

test("Sitzung beim Mount: Netzwerkfehler löscht das Token NICHT und bietet Retry", async () => {
  const page = await browser.newPage();
  let fail = true;
  await setup(page, {
    token: "vorhandenes-token",
    onKundenbereich: (route, json) => (fail ? route.abort("failed") : json({ user: USER })),
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('text=Verbindung zum Kundenbereich fehlgeschlagen', { timeout: 10000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), "vorhandenes-token", "das Token darf bei Netzfehlern nicht gelöscht werden");
  // Retry mit wiederhergestellter Verbindung führt in den Kundenbereich.
  fail = false;
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await page.waitForSelector(".pp-step-no", { timeout: 15000 });
  assert.match(page.url(), /\/dashboard/);
  await page.close();
});

test("Sitzung beim Mount: echter 401 löscht das Token und erklärt es auf dem Login", async () => {
  const page = await browser.newPage();
  await setup(page, {
    token: "abgelaufenes-token",
    onKundenbereich: (route, json) => json({ error: "Sitzung abgelaufen. Bitte melden Sie sich erneut an.", code: "SESSION_EXPIRED" }, 401),
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".auth-alert-info", { timeout: 10000 });
  assert.match((await page.locator(".auth-alert-info").innerText()), /Sitzung ist abgelaufen/);
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), null, "ein echter Auth-Fehler muss das Token entfernen");
  await page.close();
});

test("Passwort vergessen: leerer Fehlerbody erzeugt einen sichtbaren, nichtleeren Banner", async () => {
  const page = await browser.newPage();
  await setup(page, { onForgot: (route, json) => json({}, 400) });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Vergessen?" }).click();
  await page.fill('input[type="email"]', "kunde@example.com");
  await page.getByRole("button", { name: "Reset-Link senden" }).click();
  await page.waitForSelector(".auth-alert-error", { timeout: 10000 });
  const t = await bannerText(page);
  assert.ok(t.length > 10, "Banner darf nicht leer sein");
  assert.match(t, /momentan nicht verarbeitet/);
  await page.close();
});

test("ungültiger Reset-Link: klare Erklärung statt kommentarlosem Login", async () => {
  const page = await browser.newPage();
  await setup(page, { onValidate: (route, json) => json({ valid: false, code: "INVALID_RESET_TOKEN" }) });
  await page.goto(`${BASE}/login?reset=kaputt`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".auth-alert-error", { timeout: 10000 });
  assert.match(await bannerText(page), /ungültig oder wurde bereits verwendet/);
  await page.close();
});

test("Reset-Link-Prüfung offline: Nutzer bleibt auf dem Reset-Schritt und kann erneut prüfen", async () => {
  const page = await browser.newPage();
  let fail = true;
  await setup(page, { onValidate: (route, json) => (fail ? route.abort("failed") : json({ valid: true })) });
  await page.goto(`${BASE}/login?reset=token123`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".auth-alert-error", { timeout: 10000 });
  assert.match(await bannerText(page), /konnte nicht geprüft werden/);
  const retry = page.getByRole("button", { name: "Link erneut prüfen" });
  assert.equal(await retry.count(), 1, "der Retry-Button muss angeboten werden");
  fail = false;
  await retry.click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".auth-alert-error").count(), 0, "nach erfolgreicher Prüfung verschwindet die Meldung");
  assert.equal(await page.getByRole("button", { name: "Link erneut prüfen" }).count(), 0);
  await page.close();
});

test("Regression: erfolgreicher Login führt unverändert ins Dashboard", async () => {
  const page = await browser.newPage();
  await setup(page, {});
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await fillLogin(page);
  await page.getByRole("button", { name: /^Anmelden$/ }).last().click();
  await page.waitForSelector(".pp-step-no", { timeout: 15000 });
  assert.match(page.url(), /\/dashboard/);
  await page.close();
});
