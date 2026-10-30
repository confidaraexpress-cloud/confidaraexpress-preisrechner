// E2E: ConfidaraExpress-Betreuung im Admin-Kundendetail und in der Kundenliste (Canonical 1A, v2.90).
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend mit demselben Vertrag wie GET/PUT
// /admin/users/:id/account-manager (die Datenbankseite misst Backend account-manager-assignment-pg).
//
//   A  Wechsel: Zuordnung, Zeitpunkt, nächste Zuteilung; genau EIN PUT mit previousKey; Erfolgsmeldung; neu geladen
//   B  Konflikt (409): Meldung mit dem aktuellen Stand, die Karte zeigt ihn danach
//   C  noch nicht zugeordnet: „Noch nicht zugeordnet“, erster PUT mit previousKey null
//   D  anonymisiertes Konto: Grund statt Auswahl; Adminkonto: keine Karte
//   E  Ladefehler: Meldung und „Erneut laden“, die übrige Seite bleibt bedienbar
//   F  Kundenliste: „Betreuung: …“ nur bei Kundenkonten
//   G  390 px: die Karte ohne Querüberlauf
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5592, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress", name: "Anna Admin", role: "admin", status: "approved", country: "DE" };
const OPTIONEN = [{ key: "miguel", name: "Miguel Vance" }, { key: "patrick", name: "Patrick Werner" }];
const NAME = { miguel: "Miguel Vance", patrick: "Patrick Werner" };
const KONTEN = {
  7: { id: 7, name: "Max Mustermann", email: "einkauf@muster-logistik.de", company_name: "Muster Logistik GmbH", role: "customer", status: "approved", country: "DE", customer_number: "CE-K-10031" },
  8: { id: 8, name: "Zweiter Admin", email: "zwei@confidaraexpress.de", company_name: "ConfidaraExpress", role: "admin", status: "approved", country: "DE" },
  9: { id: 9, name: "Gelöschter Kunde", email: "anonymized+9@confidara.invalid", company_name: "Anonymisiert", role: "customer", status: "anonymized", country: "DE", anonymized_at: "2026-10-20T10:00:00Z" },
};

let server, browser;

async function setup(page, { start = "miguel", konflikt = false, ladefehler = false } = {}) {
  const state = { key: start, assignedAt: start ? "2026-10-30T09:00:00.000Z" : null, puts: [], gets: 0 };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    const m = /\/admin\/users\/(\d+)(\/account-manager)?$/.exec(p);
    if (m && !m[2]) return json({ user: KONTEN[m[1]], summary: {} });
    if (m && m[2] && req.method() === "GET") {
      state.gets += 1;
      if (ladefehler) return json({ error: "Fehler" }, 500);
      const anonym = m[1] === "9";
      return json({ userId: Number(m[1]), accountManager: {
        current: anonym || !state.key ? null : { key: state.key, name: NAME[state.key] },
        assignedAt: anonym ? null : state.assignedAt, applicable: !anonym, reason: anonym ? "anonymized" : null,
        options: OPTIONEN, nextAutomatic: { key: "patrick", name: "Patrick Werner" },
      } });
    }
    if (m && m[2] && req.method() === "PUT") {
      const body = req.postDataJSON();
      state.puts.push(body);
      if (konflikt) {
        state.key = "patrick";
        return json({ error: "Der Ansprechpartner wurde inzwischen geändert.", code: "ACCOUNT_MANAGER_CHANGED", current: { key: "patrick", name: "Patrick Werner" } }, 409);
      }
      const vorher = state.key;
      state.key = body.accountManagerKey;
      state.assignedAt = "2026-10-30T11:15:00.000Z";
      return json({ message: "Ansprechpartner geändert", noOp: false, accountManager: { current: { key: state.key, name: NAME[state.key] }, assignedAt: state.assignedAt, previous: vorher ? { key: vorher, name: NAME[vorher] } : null } });
    }
    if (p.endsWith("/admin/users")) {
      return json({ users: [
        { ...KONTEN[7], created_at: "2026-10-01T10:00:00Z", account_manager: { key: "miguel", name: "Miguel Vance" } },
        { id: 10, name: "Erika Beispiel", email: "erika@beispiel.example", company_name: "Beispiel AG", role: "customer", status: "approved", created_at: "2026-09-01T10:00:00Z", account_manager: null },
        { ...KONTEN[8], created_at: "2026-08-01T10:00:00Z", account_manager: null },
      ], pagination: { limit: 25, offset: 0, count: 3, total: 3 } });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return state;
}

const KARTE = "#adm-account-manager-section";
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

async function oeffne(page, id = 7) {
  await page.goto(`${BASE}/admin/users/${id}`, { waitUntil: "domcontentloaded" });
}

test("A — Wechsel: genau ein PUT mit dem gezeigten Stand, Erfolgsmeldung, neu geladene Zuordnung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await oeffne(page);
  await page.locator(`${KARTE} #adm-account-manager-select`).waitFor({ timeout: 30000 });
  const text = norm(await page.locator(KARTE).innerText());
  assert.match(text, /^ConfidaraExpress-Betreuung Miguel Vance Zugewiesener ConfidaraExpress-Ansprechpartner/);
  assert.match(text, /Zugeordnet seit 30\.10\.2026, 10:00/);
  assert.match(text, /Nächste automatische Zuteilung Patrick Werner/);
  assert.equal(await page.locator("#adm-account-manager-select").inputValue(), "miguel");
  assert.equal(await page.locator("#adm-account-manager-save").isDisabled(), true, "ohne Änderung nichts zu speichern");
  await page.locator("#adm-account-manager-select").selectOption("patrick");
  await page.locator("#adm-account-manager-save").click();
  await page.getByRole("status").filter({ hasText: "Ansprechpartner geändert: Patrick Werner." }).waitFor();
  assert.deepEqual(state.puts, [{ accountManagerKey: "patrick", previousKey: "miguel" }]);
  assert.match(norm(await page.locator(KARTE).innerText()), /Der Kunde sieht die Änderung beim nächsten Laden seines Kundenbereichs\./);
  assert.match(norm(await page.locator(`${KARTE} .adm-card-head`).innerText()), /Patrick Werner/);
  assert.match(norm(await page.locator(KARTE).innerText()), /Zugeordnet seit 30\.10\.2026, 12:15/);
  assert.equal(await page.locator("#adm-account-manager-save").isDisabled(), true);
  // Das Kundenfeld der Karte darüber heißt eindeutig „Ansprechpartner (Kunde)“.
  assert.match(norm(await page.locator(".adm-card").first().innerText()), /Ansprechpartner \(Kunde\) Max Mustermann/);
  await page.close();
});

test("B — Konflikt: der Server meldet einen neueren Stand; Meldung nennt ihn, die Karte zeigt ihn danach", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { konflikt: true });
  await oeffne(page);
  await page.locator("#adm-account-manager-select").waitFor({ timeout: 30000 });
  await page.locator("#adm-account-manager-select").selectOption("patrick");
  await page.locator("#adm-account-manager-save").click();
  const alarm = page.locator(`${KARTE} [role="alert"]`);
  await alarm.waitFor();
  assert.match(norm(await alarm.innerText()), /inzwischen geändert \(jetzt: Patrick Werner\)/);
  assert.equal(state.puts.length, 1);
  await page.waitForFunction(() => document.querySelector("#adm-account-manager-select")?.value === "patrick");
  await page.close();
});

test("C — noch nicht zugeordnet: Platzhalter, erster PUT mit previousKey null", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { start: null });
  await oeffne(page);
  await page.locator("#adm-account-manager-select").waitFor({ timeout: 30000 });
  assert.equal(await page.locator("#adm-account-manager-select").inputValue(), "");
  assert.match(norm(await page.locator(KARTE).innerText()), /^ConfidaraExpress-Betreuung Noch nicht zugeordnet/);
  assert.match(norm(await page.locator(KARTE).innerText()), /Zugeordnet seit —/);
  await page.locator("#adm-account-manager-select").selectOption("miguel");
  await page.locator("#adm-account-manager-save").click();
  await page.getByRole("status").filter({ hasText: "Ansprechpartner geändert: Miguel Vance." }).waitFor();
  assert.deepEqual(state.puts, [{ accountManagerKey: "miguel", previousKey: null }]);
  await page.close();
});

test("D — anonymisiertes Konto: Grund statt Auswahl; Adminkonto: keine Karte", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setup(page);
  await oeffne(page, 9);
  await page.locator(KARTE).waitFor({ timeout: 30000 });
  await page.waitForFunction((sel) => !document.querySelector(`${sel} .loading-center`), KARTE);
  assert.match(norm(await page.locator(KARTE).innerText()), /Anonymisierte Konten haben keinen Ansprechpartner\./);
  assert.equal(await page.locator("#adm-account-manager-select").count(), 0);
  await oeffne(page, 8);
  await page.getByText("Zweiter Admin").first().waitFor({ timeout: 30000 });
  assert.equal(await page.locator(KARTE).count(), 0, "Adminkonten haben keine Betreuungskarte");
  await page.close();
});

test("E — Ladefehler: Meldung und „Erneut laden“, die übrige Seite bleibt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { ladefehler: true });
  await oeffne(page);
  await page.locator(`${KARTE} [role="alert"]`).waitFor({ timeout: 30000 });
  assert.match(norm(await page.locator(KARTE).innerText()), /Der Ansprechpartner konnte nicht geladen werden\./);
  const vorher = state.gets;
  await page.locator(KARTE).getByRole("button", { name: "Erneut laden" }).click();
  const frist = Date.now() + 5000;
  while (state.gets <= vorher && Date.now() < frist) await page.waitForTimeout(50);
  assert.ok(state.gets >= vorher + 1, "Erneut laden fragt erneut");
  assert.match(norm(await page.locator(".adm-card").first().innerText()), /Unternehmen und Kontakt/);
  await page.close();
});

test("F — Kundenliste: „Betreuung: …“ nur bei Kundenkonten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setup(page);
  await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
  await page.locator(".adm-users-table tbody tr").first().waitFor({ timeout: 30000 });
  const zeilen = await page.locator(".adm-users-table tbody tr").allInnerTexts();
  assert.match(norm(zeilen[0]), /Betreuung: Miguel Vance/);
  assert.match(norm(zeilen[1]), /Betreuung: nicht zugeordnet/);
  assert.doesNotMatch(norm(zeilen[2]), /Betreuung/);
  assert.equal(await page.locator(".adm-users-table thead th").count(), 5, "die Tabelle behält fünf Spalten");
  await page.close();
});

test("G — 390 px: die Betreuungskarte ohne Querüberlauf", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setup(page);
  await oeffne(page);
  await page.locator("#adm-account-manager-select").waitFor({ timeout: 30000 });
  const m = await page.evaluate((sel) => {
    const k = document.querySelector(sel);
    return { karte: k.scrollWidth - k.clientWidth, seite: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  }, KARTE);
  assert.deepEqual([m.karte <= 0, m.seite <= 0], [true, true], JSON.stringify(m));
  await page.close();
});
