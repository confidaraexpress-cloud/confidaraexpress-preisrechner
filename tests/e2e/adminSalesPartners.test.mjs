// E2E: Admin-Vertriebspartnerverwaltung.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route). Es wird
// kein echter Partner freigegeben, keine echte Sendung entschieden und kein
// echter Server berührt. Geprüft wird:
//   1. Sidebar-Eintrag und Liste mit serverseitigem Status-/Suchfilter.
//   2. Detail eines Antrags: Freigabe mit Pflichtfeld Grundprovision über den
//      Bestätigungsdialog — exakt der Vertragsbody, danach der neue Stand.
//   3. Queue „Versandnachweis fehlt": Entscheidung „Versendet" verlangt Datum
//      und Nachweisart; der Body trägt genau die Vertragsfelder.
//   4. Einstellungen: Schwellen der Level-Regeln sind NICHT vorbelegt, die
//      Boni und Mindestpakete schon; Obergrenzen-Hinweis sichtbar.
//   5. Kundendetail: Karte „Vertriebspartner-Zuordnung" lädt selbständig.
//   6. Login sperren/entsperren nach dem exakten Backendvertrag (loginStatus =
//      users.status: approved → sperren, blocked → entsperren, pending keine Aktion).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5483, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE" };

const ZEILEN = [
  { id: 5, name: "Petra Partner", email: "petra@partner-vertrieb.de", companyName: "Vertrieb Süd GmbH", status: "pending",
    loginStatus: "pending", activeSince: null, customersCount: 0, packagesLastMonth: 0, teamLevel1Count: 0,
    teamLevel2Count: 0, ownRatePercent: null, createdAt: "2026-10-01T09:30:00Z" },
  { id: 6, name: "Sam Sponsor", email: "sam@vertrieb-nord.de", companyName: "Vertrieb Nord GmbH", status: "active",
    loginStatus: "approved", activeSince: "2026-03-01", customersCount: 12, packagesLastMonth: 1530, teamLevel1Count: 2,
    teamLevel2Count: 1, ownRatePercent: "27.50", createdAt: "2026-02-20T09:30:00Z" },
];

function detail(status) {
  return {
    partner: { id: 5, name: "Petra Partner", email: "petra@partner-vertrieb.de", companyName: "Vertrieb Süd GmbH",
      phone: null, status, loginStatus: status === "active" ? "approved" : "pending", referralCode: "ABCD2345",
      sponsor: { id: 6, name: "Sam Sponsor" }, sponsorCodeUsed: "WXYZ6789", agreementVersion: "2026-10",
      agreementAcceptedAt: "2026-10-01T09:30:00Z", createdAt: "2026-10-01T09:30:00Z",
      approvedAt: status === "active" ? "2026-10-06T10:00:00Z" : null, contractEndedOn: null, deactivationReason: null },
    rates: { current: status === "active" ? { id: 1, validFrom: "2026-10-06", basePercent: "20.00", level1Percent: "5.00",
      level2Percent: "2.50", reason: null, createdAt: "2026-10-06T10:00:00Z" } : null, history: [] },
    statusHistory: [{ status: "pending", effectiveDate: "2026-10-01", reason: null, createdAt: "2026-10-01T09:30:00Z" }],
    levelRules: { mode: "global", current: null, history: [] },
    team: { level1: [], level2: [] },
    customers: [],
    assessments: [],
  };
}

let server, browser;

async function setup(page) {
  const state = { list: [], approve: [], evidence: [], partnerStatus: "pending", other: [], login: [], login6: "approved" };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/sales-partners") && req.method() === "GET") {
      state.list.push(url.search);
      const status = url.searchParams.get("status");
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const partners = ZEILEN.filter((z) => (!status || z.status === status) && (!q || z.name.toLowerCase().includes(q)));
      return json({ partners, total: partners.length, limit: 25, offset: 0 });
    }
    if (p.endsWith("/admin/sales-partners/5") && req.method() === "GET") return json(detail(state.partnerStatus));
    if (p.endsWith("/admin/sales-partners/5/approve") && req.method() === "POST") {
      state.approve.push(req.postDataJSON());
      state.partnerStatus = "active";
      return json({ ok: true });
    }
    // Partner 6: aktiv; sein Login lässt sich sperren und entsperren.
    if (p.endsWith("/admin/sales-partners/6") && req.method() === "GET") {
      const d = detail("active");
      return json({ ...d, partner: { ...d.partner, id: 6, name: "Sam Sponsor", loginStatus: state.login6 } });
    }
    if (p.endsWith("/admin/sales-partners/6/login") && req.method() === "PUT") {
      const body = req.postDataJSON();
      state.login.push(body);
      state.login6 = body.enabled === true ? "approved" : "blocked";
      return json({ ok: true, loginStatus: state.login6 });
    }
    if (/\/admin\/sales-partners\/[56]\/commissions$/.test(p)) {
      return json({ month: "2026-10", totals: { accruedCents: 0, payableCents: 0 }, entries: [] });
    }
    if (p.endsWith("/admin/dispatch-evidence/queue")) {
      return json({ items: state.evidence.length ? [] : [
        { shipmentId: 77, provider: "transglobal", carrier: "ups", bookedAt: "2026-10-01T08:00:00Z", packageCount: 2,
          trackingReferences: ["1Z999AA10123456784"], lastTrackingStatus: "in_transit", lastTrackingText: "Unterwegs",
          lastTrackedAt: "2026-10-02T08:00:00Z", cancellationStatus: null, evidenceStatus: null },
      ], total: state.evidence.length ? 0 : 1, limit: 25, offset: 0 });
    }
    if (p.endsWith("/admin/shipments/77/dispatch-evidence")) {
      if (req.method() === "POST") { state.evidence.push(req.postDataJSON()); return json({ ok: true }); }
      return json({ current: null, history: [] });
    }
    if (p.endsWith("/admin/sales-partner-level-rules")) return json({ current: null, history: [] });
    if (p.endsWith("/admin/sales-partner-caps")) return json({ current: null, history: [] });
    if (p.endsWith("/admin/users/7")) {
      return json({ user: { id: 7, name: "Max Mustermann", email: "einkauf@muster-logistik.de", company_name: "Muster Logistik GmbH",
        role: "customer", status: "approved", country: "DE" }, summary: {} });
    }
    if (p.endsWith("/admin/users/7/sales-partner-attribution")) {
      return json({ current: { partnerId: 6, partnerName: "Sam Sponsor", validFrom: "2026-05-01", source: "referral_link",
        referralCodeUsed: "WXYZ6789" }, history: [] });
    }
    state.other.push(p);
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return state;
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

test("1 — Sidebar-Eintrag und Liste mit serverseitigem Status- und Suchfilter", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.locator(".adm-nav a", { hasText: "Vertriebspartner" }).click();
  await page.waitForURL(`${BASE}/admin/partners`);
  await page.locator(".adm-sp-table tbody tr").first().waitFor({ state: "visible" });
  assert.equal(await page.locator(".adm-sp-table tbody tr").count(), 2);
  const text = await page.locator(".adm-sp-table").innerText();
  assert.match(text, /In Prüfung/);
  assert.match(text, /27,50 %/);
  assert.doesNotMatch(text, /\bpending\b|\bactive\b/, "Rohstatus im sichtbaren Text");

  await page.selectOption("#sp-filter-status", "pending");
  await page.fill("#sp-filter-q", "petra");
  await page.locator("#sp-filter-apply").click();
  await page.waitForFunction(() => document.querySelectorAll(".adm-sp-table tbody tr").length === 1);
  const letzter = new URLSearchParams(state.list[state.list.length - 1]);
  assert.equal(letzter.get("status"), "pending");
  assert.equal(letzter.get("q"), "petra");
  assert.equal(letzter.get("limit"), "25");
  assert.equal(letzter.get("offset"), "0");
  assert.equal(await page.locator("#adm-sp-settings-link").getAttribute("href"), "/admin/partners/settings");
  assert.equal(await page.locator("#adm-sp-evidence-link").getAttribute("href"), "/admin/partners/dispatch-evidence");
  await page.close();
});

test("2 — Freigabe eines Antrags: Pflichtfeld Grundprovision, Vertragsbody, neuer Stand", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  await page.goto(`${BASE}/admin/partners`, { waitUntil: "networkidle" });
  await page.locator('.adm-sp-table tr[data-partner-id="5"] a', { hasText: "Details" }).click();
  await page.waitForURL(`${BASE}/admin/partners/5`);
  await page.locator("#adm-sp-approve").waitFor({ state: "visible" });
  assert.match(await page.locator("#adm-sp-codes-card").innerText(), /ABCD2345/);

  await page.locator("#adm-sp-approve").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  // Ohne Grundprovision kein Request — der Dialog nennt das Pflichtfeld.
  await page.locator("#adm-sp-dialog-confirm").click();
  await page.locator('[role="dialog"] .field-error').first().waitFor({ state: "visible" });
  assert.equal(state.approve.length, 0, "ohne Grundprovision darf kein Request hinausgehen");

  await page.fill("#adm-sp-base", "20");
  await page.locator("#adm-sp-dialog-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.approve, [{ basePercent: "20.00" }], "Ebenen ohne Angabe: Server-Default");
  await page.waitForFunction(() => document.querySelector("#adm-sp-status")?.textContent === "Aktiv");
  assert.equal(await page.locator("#adm-sp-approve").count(), 0);
  assert.match(await page.locator("#adm-sp-rates-card").innerText(), /20,00 %/);
  await page.close();
});

test("3 — Versandnachweis: „Versendet“ verlangt Datum und Nachweisart; Vertragsbody", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  await page.goto(`${BASE}/admin/partners/dispatch-evidence`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-evidence-77").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  await page.locator("#adm-sp-evidence-status-dispatched").check();
  await page.fill("#adm-sp-evidence-note", "Im Carrier-Portal als übergeben ausgewiesen.");
  await page.locator("#adm-sp-evidence-confirm").click();
  await page.locator('[role="dialog"] .field-error').first().waitFor({ state: "visible" });
  assert.equal(state.evidence.length, 0, "ohne Datum und Nachweisart kein Request");

  await page.fill("#adm-sp-evidence-date", "2026-10-02");
  await page.selectOption("#adm-sp-evidence-type", "carrier_portal");
  await page.locator("#adm-sp-evidence-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.evidence, [{
    status: "dispatched", note: "Im Carrier-Portal als übergeben ausgewiesen.",
    dispatchDate: "2026-10-02", evidenceType: "carrier_portal",
  }]);
  await page.locator(".alert-success").waitFor({ state: "visible" });
  await page.close();
});

test("4 — Einstellungen: Schwellen leer, Boni und Mindestpakete vorbelegt, Obergrenzen-Hinweis", async () => {
  const page = await browser.newPage();
  await setup(page);
  await page.goto(`${BASE}/admin/partners/settings`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-global-min-packages").waitFor({ state: "visible" });
  assert.equal(await page.inputValue("#adm-sp-global-min-packages"), "3");
  for (let i = 1; i <= 5; i += 1) {
    assert.equal(await page.inputValue(`#adm-sp-global-customer-${i}-threshold`), "", `Kundenschwelle ${i} vorbelegt`);
    assert.equal(await page.inputValue(`#adm-sp-global-package-${i}-threshold`), "", `Paketschwelle ${i} vorbelegt`);
  }
  assert.equal(await page.inputValue("#adm-sp-global-customer-1-bonus"), "2,50");
  assert.equal(await page.inputValue("#adm-sp-global-package-5-bonus"), "12,50");
  assert.match(await page.locator("#adm-sp-caps-card").innerText(), /Ohne konfigurierte Version läuft keine Provision\./);
  await page.close();
});

test("5 — Kundendetail: die Zuordnungskarte lädt selbständig", async () => {
  const page = await browser.newPage();
  await setup(page);
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-attribution-current").waitFor({ state: "visible" });
  assert.match(await page.locator("#adm-sp-attribution").innerText(), /Sam Sponsor/);
  assert.match(await page.locator("#adm-sp-attribution").innerText(), /Empfehlungslink/);
  await page.close();
});

test("6 — Login sperren und entsperren nach dem exakten Backendvertrag", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  // Antrag (pending): „Noch kein Login“, keine Login-Aktion, kein Unbekannt-Hinweis.
  await page.goto(`${BASE}/admin/partners/5`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-login").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-sp-login").innerText(), "Noch kein Login");
  assert.equal(await page.locator("#adm-sp-login-off, #adm-sp-login-on").count(), 0);
  assert.equal(await page.locator("#adm-sp-login-unknown").count(), 0);

  // Aktiver Partner (approved): sperren → PUT { enabled:false } → „Login gesperrt“.
  await page.goto(`${BASE}/admin/partners/6`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-login").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-sp-login").innerText(), "Login aktiv");
  await page.locator("#adm-sp-login-off").click();
  await page.locator("#adm-sp-dialog-confirm").click();
  await page.waitForFunction(() => document.querySelector("#adm-sp-login")?.textContent === "Login gesperrt");
  assert.equal(await page.locator("#adm-sp-login-off").count(), 0);

  // Entsperren → PUT { enabled:true } → wieder „Login aktiv“.
  await page.locator("#adm-sp-login-on").click();
  await page.locator("#adm-sp-dialog-confirm").click();
  await page.waitForFunction(() => document.querySelector("#adm-sp-login")?.textContent === "Login aktiv");
  assert.deepEqual(state.login, [{ enabled: false }, { enabled: true }]);
  await page.close();
});
