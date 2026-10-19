// E2E: Paket C (Go-Live) — Unternehmerprüfung im Admin-Kundendetail.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — keine echte Prüfung, kein Konto.
//
//   A — Erklärungen der Registrierung und „noch nicht dokumentiert" werden angezeigt
//   B — Eingangsprüfung im Browser: ohne Art bzw. sonstiger Nachweis ohne Notiz → kein Request
//   C — gültige Prüfung: genau EIN Request mit Art und Notiz, danach neu geladen und angezeigt
//   D — Bestandskonto ohne Erklärungen: ehrlich „nicht erfasst"; Adminkonto: keine Sektion
//   E — ein Ladefehler blockiert die Kundendetailseite nicht
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5493, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress", name: "Anna Admin",
  role: "admin", status: "approved", country: "DE" };

let server, browser;

async function setup(page, { evidenceStatus = 200, alt = false } = {}) {
  const state = { posts: [], gets: 0, verifications: [] };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/users/7")) {
      return json({ user: { id: 7, name: "Max Mustermann", email: "einkauf@muster-logistik.de", company_name: "Muster Logistik GmbH",
        role: "customer", status: "pending", country: "DE" }, summary: {} });
    }
    if (p.endsWith("/admin/users/8")) {
      return json({ user: { id: 8, name: "Zweiter Admin", email: "zwei@confidaraexpress.de", company_name: "ConfidaraExpress",
        role: "admin", status: "approved", country: "DE" }, summary: {} });
    }
    if (p.endsWith("/admin/users/7/business-evidence")) {
      state.gets += 1;
      if (evidenceStatus !== 200) return json({ error: "Fehler" }, evidenceStatus);
      return json({
        userId: 7,
        declarations: alt ? { businessCustomer: null, terms: null } : {
          businessCustomer: { declaredAt: "2026-10-14T08:15:00Z" },
          terms: { acknowledgedAt: "2026-10-14T08:15:00Z", version: "2026-08" },
        },
        verifications: state.verifications,
      });
    }
    if (p.endsWith("/admin/users/7/business-verifications") && req.method() === "POST") {
      const body = req.postDataJSON();
      state.posts.push(body);
      state.verifications.unshift({ id: state.posts.length, method: body.method, methodLabel: "Gewerbeanmeldung geprüft",
        note: body.note || null, verifiedAt: "2026-10-14T10:00:00Z", verifiedBy: { id: 1, name: "Anna Admin" } });
      return json({ verification: state.verifications[0] }, 201);
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return state;
}

const SEKTION = "#adm-business-evidence";

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

test("A — Erklärungen der Registrierung und „noch nicht dokumentiert\"", async () => {
  const page = await browser.newPage();
  await setup(page);
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  await page.waitForSelector(SEKTION);
  const text = await page.locator(SEKTION).innerText();
  assert.match(text, /Unternehmerprüfung/);
  assert.match(text, /Abgegeben am 14\.10\.2026/);
  assert.match(text, /Bestätigt am 14\.10\.2026.*\(Fassung 2026-08\)/);
  assert.match(text, /Noch nicht dokumentiert/);
  assert.match(text, /Freischaltung hängt nicht von diesem Vermerk ab/);
  await page.close();
});

test("B — ohne Art bzw. sonstiger Nachweis ohne Notiz: Fehler am Feld, kein Request", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  await page.waitForSelector(SEKTION);
  await page.locator(`${SEKTION} button[type="submit"]`).click();
  assert.match(await page.locator("#adm-evidence-method-error").innerText(), /Art des Nachweises/);
  await page.selectOption("#adm-evidence-method", "other_document");
  await page.locator(`${SEKTION} button[type="submit"]`).click();
  assert.match(await page.locator("#adm-evidence-note-error").innerText(), /welcher Nachweis/);
  assert.equal(await page.locator("#adm-evidence-note").getAttribute("aria-invalid"), "true");
  await page.waitForTimeout(300);
  assert.equal(state.posts.length, 0, "trotz Fehler ging ein Request hinaus");
  await page.close();
});

test("C — gültige Prüfung: EIN Request, danach neu geladen und angezeigt", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  await page.waitForSelector(SEKTION);
  const vorher = state.gets;
  await page.selectOption("#adm-evidence-method", "trade_registration");
  await page.fill("#adm-evidence-note", "Gewerbeanmeldung vom 01.03.2026");
  await page.locator(`${SEKTION} button[type="submit"]`).click();
  await page.waitForFunction(() => document.querySelector("#adm-business-evidence")?.innerText.includes("durch Anna Admin"));
  assert.deepEqual(state.posts, [{ method: "trade_registration", note: "Gewerbeanmeldung vom 01.03.2026" }]);
  assert.ok(state.gets > vorher, "die Nachweise wurden nach dem Speichern nicht neu geladen");
  const text = await page.locator(SEKTION).innerText();
  assert.match(text, /Gewerbeanmeldung geprüft, 14\.10\.2026/);
  assert.match(text, /Die Prüfung wurde festgehalten\./);
  assert.equal(await page.locator("#adm-evidence-method").inputValue(), "", "das Formular wurde nicht geleert");
  await page.close();
});

test("D — Bestandskonto: „nicht erfasst\"; Adminkonto: keine Sektion", async () => {
  const page = await browser.newPage();
  await setup(page, { alt: true });
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  await page.waitForSelector(SEKTION);
  const text = await page.locator(SEKTION).innerText();
  assert.equal((text.match(/Nicht erfasst/g) || []).length, 2, "fehlende Erklärungen werden nicht ehrlich angezeigt");
  await page.goto(`${BASE}/admin/users/8`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  assert.equal(await page.locator(SEKTION).count(), 0, "ein Adminkonto zeigt die Unternehmerprüfung");
  await page.close();
});

test("E — Ladefehler: Hinweis mit Neuladen, die Kundendetailseite bleibt bedienbar", async () => {
  const page = await browser.newPage();
  await setup(page, { evidenceStatus: 500 });
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  await page.waitForSelector(`${SEKTION} .alert-error`);
  assert.match(await page.locator(`${SEKTION} .alert-error`).innerText(), /konnten nicht geladen werden/);
  assert.ok(await page.getByText("Unternehmen und Kontakt").first().isVisible(), "die Kundendetailseite ist blockiert");
  await page.close();
});
