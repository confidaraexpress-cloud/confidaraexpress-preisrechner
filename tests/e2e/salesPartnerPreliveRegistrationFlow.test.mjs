// E2E: Pre-Live-Testbetrieb über den ECHTEN öffentlichen Partnerablauf.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route) mit einem
// gemeinsamen Zustand über alle Seiten — es entsteht kein echtes Konto, keine
// echte Freigabe, keine Mail, kein Request verlässt den Browser. Der Mock bildet
// den Backendvertrag nach: im Pre-Live-Testweg (registrationMode "prelive_test")
// legt der Server einen Testantrag an (pending, als TEST gekennzeichnet).
//
//   Registrieren → pending (Login gesperrt) → Adminbereich: TEST-Antrag sichtbar
//   → normale Freigabe (Startwerte vorbelegt) → Login mit dem eigenen Passwort
//   → /partner mit dem dauerhaften Pre-Live-Hinweis.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5489, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE" };
const BONI = ["2.50", "5.00", "7.50", "10.00", "12.50"];
const START = {
  basePercent: "10.00", level1Percent: "5.00", level2Percent: "2.50", minPackagesForActiveCustomer: 3,
  customerLevels: [3, 6, 10, 15, 25].map((threshold, i) => ({ level: i + 1, threshold, bonusPercent: BONI[i] })),
  packageLevels: [100, 250, 500, 1000, 2000].map((threshold, i) => ({ level: i + 1, threshold, bonusPercent: BONI[i] })),
};
const PW = "EinSicheresPasswort2026";
const ID = 77;

let server, browser;

// Gemeinsamer Zustand aller Seiten: der Antrag entsteht durch die Registrierung,
// die Freigabe ändert ihn, die Anmeldung liest ihn.
function neuerZustand() {
  return { antrag: null, registrierungen: [], freigaben: [], logins: [], kunde: [] };
}

function detail(a) {
  return {
    partner: { id: ID, name: a.name, email: a.email, companyName: a.companyName, phone: a.phone, status: a.status,
      loginStatus: a.status === "active" ? "approved" : "pending", referralCode: a.status === "active" ? "TINA2345" : null,
      sponsor: null, sponsorCodeUsed: null, agreementVersion: null, agreementAcceptedAt: null,
      agreementDocumentPath: null, createdAt: "2026-10-07T09:30:00Z",
      approvedAt: a.status === "active" ? "2026-10-07T10:00:00Z" : null, contractEndedOn: null, deactivationReason: null,
      preliveTest: true },
    startDefaults: START, datesBeforeTodayAllowed: true,
    rates: { current: a.status === "active" ? { id: 1, validFrom: "2026-10-07", basePercent: "10.00", level1Percent: "5.00",
      level2Percent: "2.50", reason: null, createdAt: "2026-10-07T10:00:00Z" } : null, history: [] },
    statusHistory: [], levelRules: { mode: "global", current: null, history: [] },
    team: { level1: [], level2: [] }, customers: [], assessments: [],
  };
}

const OVERVIEW = {
  partner: { name: "Tina Test", status: "active", activeSince: "2026-10-07" },
  links: { code: "TINA2345", customer: "https://confidaraexpress.de/register?ref=TINA2345",
    partner: "https://confidaraexpress.de/partner-registrieren?ref=TINA2345" },
  rates: { basePercent: "10.00", level1Percent: "5.00", level2Percent: "2.50" },
  levels: null,
  currentMonth: { month: "2026-10", commissionCents: 0, payableCents: 0, shipments: 0, packages: 0 },
  customers: { assigned: 0 },
  preliveTest: true,
};

async function setup(page, state, { token = null } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const auth = req.headers().authorization || "";
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    const a = state.antrag;

    if (p.endsWith("/api/sales-partner/public-config")) {
      return json({ registrationEnabled: false, registrationMode: "prelive_test", referralsEnabled: false,
        referralRetentionDays: 30, agreementVersion: null, agreement: null });
    }
    if (p.endsWith("/api/sales-partner/register") && req.method() === "POST") {
      const body = req.postDataJSON();
      state.registrierungen.push(body);
      // Wie der Server: Testantrag, pending — die Einstufung kommt nie aus dem Request.
      state.antrag = { name: body.name, email: body.email, password: body.password, companyName: body.companyName || null,
        phone: body.phone || null, status: "pending" };
      return json({ message: "Antrag eingegangen" });
    }
    if (p.endsWith("/login") && req.method() === "POST") {
      const body = req.postDataJSON();
      state.logins.push(body.email);
      if (!a || body.email !== a.email || body.password !== a.password) {
        return json({ error: "E-Mail oder Passwort falsch", code: "INVALID_CREDENTIALS" }, 401);
      }
      if (a.status !== "active") return json({ error: "Konto wartet auf Freigabe durch Admin", code: "ACCOUNT_PENDING_APPROVAL" }, 403);
      return json({ message: "Erfolgreich angemeldet", token: "e2e-partner-token" });
    }
    if (p.endsWith("/kundenbereich")) {
      if (auth.endsWith("e2e-admin-token")) return json({ user: ADMIN });
      if (auth.endsWith("e2e-partner-token") && a) {
        return json({ message: "OK", user: { id: ID, name: a.name, email: a.email, status: "approved", role: "sales_partner",
          company_name: a.companyName }, pendingEmailChange: null, companyLogo: null, billingCapabilities: null,
          salesPartner: { status: "active" } });
      }
      return json({ error: "Token fehlt", code: "SESSION_EXPIRED" }, 401);
    }
    // ── Adminbereich ──
    if (p.endsWith("/admin/sales-partner-prelive/status")) {
      return json({ enabled: true, mailAllowlistConfigured: false, backdatingGlobalAllowed: true,
        counts: { partners: a ? 1 : 0, customers: 0, shipments: 0, ledgerEntries: 0, creditNotes: 0 } });
    }
    if (p.endsWith("/admin/sales-partners") && req.method() === "GET") {
      const zeilen = a ? [{ id: ID, name: a.name, email: a.email, companyName: a.companyName, status: a.status,
        loginStatus: a.status === "active" ? "approved" : "pending", activeSince: a.status === "active" ? "2026-10-07" : null,
        customersCount: 0, packagesLastMonth: null, teamLevel1Count: 0, teamLevel2Count: 0,
        ownRatePercent: a.status === "active" ? "10.00" : null, createdAt: "2026-10-07T09:30:00Z", preliveTest: true }] : [];
      const status = url.searchParams.get("status");
      const gefiltert = zeilen.filter((z) => !status || z.status === status);
      return json({ partners: gefiltert, total: gefiltert.length, limit: 25, offset: 0 });
    }
    if (p.endsWith(`/admin/sales-partners/${ID}`) && req.method() === "GET") return json(detail(a));
    if (p.endsWith(`/admin/sales-partners/${ID}/approve`) && req.method() === "POST") {
      state.freigaben.push(req.postDataJSON());
      a.status = "active";
      return json({ ok: true });
    }
    if (p.endsWith(`/admin/sales-partners/${ID}/commissions`)) return json({ month: "2026-10", totals: { accruedCents: 0, payableCents: 0 }, entries: [] });
    if (p.endsWith(`/admin/sales-partners/${ID}/credit-notes`)) return json({ creditNotes: [] });
    if (p.endsWith(`/admin/sales-partners/${ID}/billing-details`)) {
      return json({ status: "incomplete", billingDetails: null, missingFields: [], accountEmail: a ? a.email : null });
    }
    if (p.endsWith("/admin/sales-partner-caps")) return json({ current: null, history: [] });
    // ── Partnerportal ──
    if (p.includes("/kunde/") || p.endsWith("/kunde")) {
      state.kunde.push(p);
      return json({ error: "Nicht erlaubt", code: "ROLE_NOT_PERMITTED" }, 403);
    }
    if (p.endsWith("/api/sales-partner/me/overview")) return json(OVERVIEW);
    if (p.endsWith("/api/sales-partner/me/team")) return json({ limits: { level1: 10, level2: 10 }, level1: [], level2: [] });
    if (p.endsWith("/api/sales-partner/me/customers")) return json({ customers: [] });
    if (p.endsWith("/api/sales-partner/me/commissions")) {
      return json({ month: "2026-10", totals: { accruedCents: 0, payableCents: 0, byLevel: { 0: 0, 1: 0, 2: 0 } }, entries: [] });
    }
    if (p.endsWith("/api/sales-partner/me/agreement")) {
      return json({ preliveTest: true, acceptedVersion: null, acceptedAt: null, document: null });
    }
    if (p.endsWith("/api/sales-partner/me/credit-notes")) return json({ creditNotes: [], openSettlement: { readyNetCents: 0, readyEntryCount: 0, carriedForward: false } });
    return json({});
  });
  if (token) await page.addInitScript((t) => localStorage.setItem("ce_token", t), token);
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

test("1 — Registrieren → pending → TEST-Antrag im Adminbereich → Freigabe → Login → /partner", async () => {
  const state = neuerZustand();

  // 1. Öffentliche Registrierung im Pre-Live-Testweg.
  const bewerber = await browser.newPage();
  await setup(bewerber, state);
  await bewerber.goto(`${BASE}/partner-registrieren`, { waitUntil: "networkidle" });
  await bewerber.waitForSelector("#sp-form");
  await bewerber.locator("#sp-prelive-notice").waitFor({ state: "visible" });
  assert.equal(await bewerber.locator("#sp-agreement").count(), 0);
  await bewerber.fill("#sp-name", "Tina Test");
  await bewerber.fill("#sp-email", "tina@intern.example");
  await bewerber.fill("#sp-password", PW);
  await bewerber.fill("#sp-password-repeat", PW);
  await bewerber.fill("#sp-company", "Test Vertrieb GmbH");
  await bewerber.locator("#sp-submit").click();
  await bewerber.waitForSelector("#sp-state");
  assert.match(await bewerber.locator("#sp-state").innerText(), /Antrag eingegangen/);
  assert.equal(state.registrierungen.length, 1);
  assert.equal("acceptedAgreementVersion" in state.registrierungen[0], false);

  // 2. Vor der Freigabe: kein Zugang.
  await bewerber.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await bewerber.fill("#auth-email", "tina@intern.example");
  await bewerber.fill("#auth-password", PW);
  await bewerber.locator("button.auth-cta").click();
  await bewerber.locator(".auth-alert-error").waitFor({ state: "visible" });
  assert.equal(new URL(bewerber.url()).pathname, "/login");
  assert.equal(await bewerber.evaluate(() => localStorage.getItem("ce_token")), null, "pending meldet nicht an");
  await bewerber.close();

  // 3. Adminbereich: der Antrag erscheint als TEST, Freigabe über den normalen Weg.
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setup(admin, state, { token: "e2e-admin-token" });
  await admin.goto(`${BASE}/admin/partners`, { waitUntil: "networkidle" });
  const zeile = admin.locator(`.adm-sp-table tr[data-partner-id="${ID}"]`);
  await zeile.waitFor({ state: "visible" });
  assert.equal(await zeile.getAttribute("data-prelive"), "true");
  assert.match(await zeile.innerText(), /TEST \/ PRE-LIVE/);
  assert.match(await zeile.innerText(), /Tina Test/);
  await admin.goto(`${BASE}/admin/partners/${ID}`, { waitUntil: "networkidle" });
  await admin.locator("#adm-sp-prelive-badge").waitFor({ state: "visible" });
  await admin.locator("#adm-sp-approve").click();
  await admin.locator('[role="dialog"]').waitFor({ state: "visible" });
  assert.equal(await admin.inputValue("#adm-sp-base"), "10,00");
  await admin.locator("#adm-sp-dialog-confirm").click();
  await admin.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.freigaben, [{ basePercent: "10.00", level1Percent: "5.00", level2Percent: "2.50" }]);
  await admin.waitForFunction(() => document.querySelector("#adm-sp-status")?.textContent === "Aktiv");
  await admin.close();

  // 4. Anmeldung mit den bei der Registrierung gewählten Zugangsdaten → Partnerportal.
  const partner = await browser.newPage();
  await setup(partner, state);
  await partner.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await partner.fill("#auth-email", "tina@intern.example");
  await partner.fill("#auth-password", PW);
  await partner.locator("button.auth-cta").click();
  await partner.waitForURL(`${BASE}/partner`);
  await partner.locator("#spp-prelive-banner").waitFor({ state: "visible" });
  assert.equal(await partner.locator("#spp-prelive-banner").innerText(),
    "Pre-Live-Testkonto – keine echten Provisionen, Gutschriften oder Auszahlungen.");
  assert.deepEqual(state.kunde, [], `Kundenendpunkte aufgerufen: ${state.kunde.join(", ")}`);
  await partner.close();
});
