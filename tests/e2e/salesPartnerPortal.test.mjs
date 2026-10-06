// E2E: Partnerportal und Rollenweiche.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route). Der
// Kernvertrag: ein Vertriebspartner ruft NIE einen Kundenendpunkt (/kunde/*)
// auf — der Server antwortete dort mit 403, und das zentrale apiFetch meldete
// ab. Jeder Request auf /kunde/* wird deshalb mitgezählt und muss 0 bleiben.
//   1. Login als Partner → /partner, Kennzahlen sichtbar.
//   2. Partner öffnet /dashboard, /booking, /calculator, / und eine unbekannte
//      Adresse → jeweils /partner, ohne Abmeldung.
//   3. Bereiche: Kunden, Provisionen (Monatswechsel sendet den Monat), Team.
//   4. Ohne Teameinträge gibt es keinen Teambereich.
//   5. Ein Kunde auf /partner landet im Kundenbereich.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5481, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const PARTNER = { id: 42, name: "Petra Partner", email: "petra@partner-vertrieb.de", status: "approved",
  role: "sales_partner", company_name: "Vertrieb Süd GmbH" };
const KUNDE = { id: 7, name: "Max Mustermann", email: "einkauf@muster-logistik.de", status: "approved",
  role: "customer", company_name: "Muster Logistik GmbH", country: "DE" };

const OVERVIEW = {
  partner: { name: "Petra Partner", status: "active", activeSince: "2026-03-01" },
  links: { code: "ABCD2345", customer: "https://confidaraexpress.de/register?ref=ABCD2345",
    partner: "https://confidaraexpress.de/partner-registrieren?ref=ABCD2345" },
  rates: { basePercent: "20.00", level1Percent: "5.00", level2Percent: "2.50" },
  levels: { month: "2026-10", measuredMonth: "2026-09", activeCustomers: 12, shippedPackages: 1530,
    customerLevel: 2, customerBonusPercent: "5.00", packageLevel: 3, packageBonusPercent: "7.50",
    ownRatePercent: "27.50", capApplied: false },
  currentMonth: { month: "2026-10", commissionCents: 123456, payableCents: 45600, shipments: 80, packages: 95 },
  customers: { assigned: 14 },
};
const CUSTOMERS = { customers: [
  { ref: "K-1", companyName: "Acme GmbH", assignedSince: "2026-05-02", accountStatus: "active",
    currentMonth: { shipments: 3, packages: 4 }, previousMonth: { shipments: 5, packages: 6, active: true } },
] };
const commissions = (month) => ({
  month,
  totals: { accruedCents: 5000, payableCents: 2000, byLevel: { 0: 4000, 1: 800, 2: 200 } },
  entries: [
    { id: 1, reference: "CE-AB-1001", entryDate: `${month}-02`, level: 0, type: "accrual", basisCents: 10000,
      ratePercent: "27.50", amountCents: 2750, payable: true, customerName: "Acme GmbH", teamMemberName: null, note: null },
    { id: 2, reference: "CE-AB-1001", entryDate: `${month}-03`, level: 0, type: "reversal", basisCents: 10000,
      ratePercent: "27.50", amountCents: -2750, payable: false, customerName: "Acme GmbH", teamMemberName: null, note: "Storniert" },
  ],
});
const TEAM = { limits: { level1: 10, level2: 10 },
  level1: [{ name: "Tom Team", status: "active", activeSince: "2026-06-01", relevant: true, rank: 1,
    commissionCurrentMonthCents: 500, commissionTotalCents: 9000 }],
  level2: [] };
const TEAM_LEER = { limits: { level1: 10, level2: 10 }, level1: [], level2: [] };

let server, browser;

async function setup(page, { user = PARTNER, team = TEAM, token = true } = {}) {
  const state = { kunde: [], commissionMonths: [], partnerCalls: [], other: [] };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.includes("/kunde/") || p.endsWith("/kunde")) {
      state.kunde.push(p);
      // Wie der echte Server bei einem Partner: verboten.
      if (user.role === "sales_partner") return json({ error: "Nicht erlaubt", code: "ROLE_NOT_PERMITTED" }, 403);
      return json({});
    }
    if (p.endsWith("/login") && req.method() === "POST") return json({ token: "e2e-partner-token" });
    if (p.endsWith("/kundenbereich")) {
      return json({ message: "OK", user, pendingEmailChange: null, companyLogo: null, billingCapabilities: null,
        ...(user.role === "sales_partner" ? { salesPartner: { status: "active" } } : {}) });
    }
    if (p.startsWith("/api/sales-partner/me/")) state.partnerCalls.push(p + url.search);
    if (p.endsWith("/api/sales-partner/me/overview")) return json(OVERVIEW);
    if (p.endsWith("/api/sales-partner/me/team")) return json(team);
    if (p.endsWith("/api/sales-partner/me/customers")) return json(CUSTOMERS);
    if (p.endsWith("/api/sales-partner/me/commissions")) {
      const month = url.searchParams.get("month");
      state.commissionMonths.push(month);
      return json(commissions(month || "2026-10"));
    }
    state.other.push(p);
    return json({});
  });
  if (token) await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-partner-token"));
  return state;
}

const pfad = (page) => new URL(page.url()).pathname;

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

test("1 — Login als Vertriebspartner führt ins Partnerportal, nie in den Kundenbereich", async () => {
  const page = await browser.newPage();
  const state = await setup(page, { token: false });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#auth-email", "petra@partner-vertrieb.de");
  await page.fill("#auth-password", "EinSicheresPasswort2026");
  await page.locator("button.auth-cta").click();
  await page.waitForURL(`${BASE}/partner`);
  await page.locator('[data-kpi="ownRate"]').waitFor({ state: "visible" });
  assert.match(await page.locator('[data-kpi="ownRate"]').innerText(), /27,50 %/);
  assert.match(await page.locator("#spp-month-amount").innerText(), /1\.234,56/);
  assert.match(await page.locator("#spp-payable-note").innerText(), /Provision wird nach Zahlungseingang des Kunden auszahlbar\./);
  assert.match(await page.locator("#spp-link-customer").innerText(), /register\?ref=ABCD2345/);
  assert.equal(await page.locator("#spp-link-partner button", { hasText: "Kopieren" }).count(), 1);
  assert.deepEqual(state.kunde, [], `Kundenendpunkte aufgerufen: ${state.kunde.join(", ")}`);
  await page.close();
});

test("2 — Partner auf Kundenrouten, Startseite und unbekannter Adresse → /partner, ohne Abmeldung", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  for (const ziel of ["/dashboard", "/dashboard?page=invoices", "/booking", "/calculator", "/inventory/products/5", "/", "/gibt-es-nicht"]) {
    await page.goto(`${BASE}${ziel}`, { waitUntil: "networkidle" });
    await page.locator("#spp-tab-overview").waitFor({ state: "visible" });
    assert.equal(pfad(page), "/partner", `${ziel} führte nach ${page.url()}`);
  }
  assert.deepEqual(state.kunde, [], `Kundenendpunkte aufgerufen: ${state.kunde.join(", ")}`);
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), "e2e-partner-token", "der Partner wurde abgemeldet");
  await page.close();
});

test("3 — Bereiche: Kunden, Provisionen mit Monatswechsel, Team; Rücknahme erkennbar", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });

  await page.locator("#spp-tab-customers").click();
  await page.locator("text=Acme GmbH").first().waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-tab-customers").getAttribute("aria-selected"), "true");

  await page.locator("#spp-tab-commissions").click();
  await page.locator("#spp-commission-totals").waitFor({ state: "visible" });
  assert.match(await page.locator("#spp-tabpanel").innerText(), /Rücknahme/);
  assert.match(await page.locator("#spp-tabpanel").innerText(), /Provisionsfähige Basis/);
  assert.doesNotMatch(await page.locator("#spp-tabpanel").innerText(), /Gewinn/);
  await page.selectOption("#spp-month", "2026-09");
  await page.waitForFunction(() => document.querySelector("#spp-tabpanel")?.innerText.includes("02.09.2026"));
  assert.ok(state.commissionMonths.includes("2026-09"), `Monat nicht gesendet: ${JSON.stringify(state.commissionMonths)}`);

  await page.locator("#spp-tab-team").click();
  await page.locator("#spp-team-1").waitFor({ state: "visible" });
  assert.match(await page.locator("#spp-team-1").innerText(), /Ja \(Rang 1\)/);
  assert.match(await page.locator("#spp-team-1").innerText(), /Ebene 1 · 1 von 10/);
  assert.deepEqual(state.kunde, []);
  await page.close();
});

test("4 — ohne Teameinträge gibt es keinen Bereich „Mein Team“", async () => {
  const page = await browser.newPage();
  await setup(page, { team: TEAM_LEER });
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-tab-overview").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-tab-team").count(), 0);
  assert.equal(await page.locator('[role="tab"]').count(), 3);
  await page.close();
});

test("5 — Abmelden aus dem Portal führt zur Anmeldung und entfernt das Token", async () => {
  const page = await browser.newPage();
  await setup(page);
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-logout").click();
  await page.waitForURL(`${BASE}/login`);
  await page.waitForFunction(() => localStorage.getItem("ce_token") === null);
  await page.close();
});

test("6 — ein Kunde auf /partner landet im Kundenbereich", async () => {
  const page = await browser.newPage();
  const state = await setup(page, { user: KUNDE });
  await page.goto(`${BASE}/partner`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((u) => u.pathname === "/dashboard");
  assert.deepEqual(state.partnerCalls, [], "ein Kunde darf keine Partnerendpunkte aufrufen");
  await page.close();
});
