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
//   4. Einstellungen: ohne globale Regeln ist das Formular mit den Startwerten
//      des Servers und „gültig ab heute“ vorbelegt (nur speichern); ohne
//      Startwerte bleibt es leer. Obergrenzen sind optional.
//   5. Kundendetail: Karte „Vertriebspartner-Zuordnung" lädt selbständig.
//   6. Login sperren/entsperren nach dem exakten Backendvertrag (loginStatus =
//      users.status: approved → sperren, blocked → entsperren, pending keine Aktion);
//      abgelehnter Antrag ohne Login-Aktion; Deaktivieren nennt die Folgen (UX-Paket 1).
//   7. Freigabe mit Startwerten: 10,00 / 5,00 / 2,50 vorbelegt, genau dieser Body.
//   8. Individuelle Obergrenze: Standardtext, neue Version mit partnerUserId;
//      die Bestätigung nennt die Wirkung der Grenze „aller Ebenen zusammen“.
//   9. Pre-Live: „TEST / PRE-LIVE“ in Liste und Detail; zurückliegende Daten
//      (Freigabe, Sätze, globale Regeln) nur mit Freigabe des Servers; Sätze erst
//      nach der Freigabe.
//  10. Pre-Live: Testkunde im Kundendetail als TEST gekennzeichnet; Zuordnung
//      Testkunde ↔ Testpartner mit zurückliegendem Datum; eine Mischung mit einem
//      echten Partner → fester Satz (409).
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

// Startwerte genau in der Form des Backendvertrags.
const BONI = ["2.50", "5.00", "7.50", "10.00", "12.50"];
const START = {
  basePercent: "10.00", level1Percent: "5.00", level2Percent: "2.50", minPackagesForActiveCustomer: 3,
  customerLevels: [3, 6, 10, 15, 25].map((threshold, i) => ({ level: i + 1, threshold, bonusPercent: BONI[i] })),
  packageLevels: [100, 250, 500, 1000, 2000].map((threshold, i) => ({ level: i + 1, threshold, bonusPercent: BONI[i] })),
};

// Pre-Live: ein aktiver Testpartner (Liste, Auswahl) und ein Testantrag (Detail).
const TESTZEILE = { id: 41, name: "Pia Test", email: "pia@test.example", companyName: "Test Vertrieb A", status: "active",
  loginStatus: "approved", activeSince: "2026-03-01", customersCount: 1, packagesLastMonth: 3, teamLevel1Count: 0,
  teamLevel2Count: 0, ownRatePercent: "10.00", createdAt: "2026-10-05T09:30:00Z", preliveTest: true };

let server, browser;

// `startDefaults`: Startwerte in Detail- und Regelantwort (null = älterer Server ohne Feld).
// `prelive`: Pre-Live-Testmodus an (Status, Testkonten, Testpartner, Rückdatierung).
async function setup(page, { startDefaults = null, prelive = false } = {}) {
  const state = { list: [], approve: [], evidence: [], partnerStatus: "pending", other: [], login: [], login6: "approved",
    rules: [], caps: [], capQueries: [], partnerCap: null, approve42: [], attribution: [], status42: "pending" };
  const mitStart = (d) => (startDefaults ? { ...d, startDefaults } : d);
  const zeilen = prelive ? [...ZEILEN, TESTZEILE] : ZEILEN;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/sales-partner-prelive/status")) {
      return json(prelive ? { enabled: true, mailAllowlistConfigured: false, backdatingGlobalAllowed: true,
        counts: { partners: 2, customers: 1, shipments: 0, ledgerEntries: 0, creditNotes: 0 } } : { enabled: false, counts: null });
    }
    if (p.endsWith("/admin/sales-partner-prelive/accounts")) {
      if (!prelive) return json({ error: "nicht aktiv", code: "PRELIVE_TEST_MODE_DISABLED" }, 404);
      return json({ partners: [{ id: 41, name: "Pia Test", email: "pia@test.example", companyName: "Test Vertrieb A", status: "active",
        loginStatus: "approved", sponsorUserId: null, referralCode: "TESTAB23" }, { id: 42, name: "Tom Test", email: "tom@test.example",
        companyName: null, status: state.status42, loginStatus: "pending", sponsorUserId: 41, referralCode: null }],
      customers: [{ id: 7, name: "Max Mustermann", companyName: "Muster Logistik GmbH", email: "einkauf@muster-logistik.de", partnerUserId: null }] });
    }
    // Testantrag 42: nur im Pre-Live-Testmodus, mit Freigabe für zurückliegende Daten.
    if (p.endsWith("/admin/sales-partners/42") && req.method() === "GET") {
      const d = detail(state.status42);
      return json(mitStart({ ...d, partner: { ...d.partner, id: 42, name: "Tom Test", companyName: null, email: "tom@test.example",
        sponsor: { id: 41, name: "Pia Test" }, agreementVersion: null, agreementAcceptedAt: null, preliveTest: true }, datesBeforeTodayAllowed: true }));
    }
    if (p.endsWith("/admin/sales-partners/42/approve") && req.method() === "POST") {
      state.approve42.push(req.postDataJSON());
      state.status42 = "active";
      return json({ ok: true });
    }
    if (/\/admin\/sales-partners\/42\/(commissions|credit-notes|billing-details)$/.test(p)) {
      if (p.endsWith("/commissions")) return json({ month: "2026-10", totals: { accruedCents: 0, payableCents: 0 }, entries: [] });
      if (p.endsWith("/credit-notes")) return json({ creditNotes: [] });
      return json({ status: "incomplete", billingDetails: null, missingFields: [], accountEmail: "tom@test.example" });
    }
    if (p.endsWith("/admin/sales-partners") && req.method() === "GET") {
      state.list.push(url.search);
      const status = url.searchParams.get("status");
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const partners = zeilen.filter((z) => (!status || z.status === status) && (!q || z.name.toLowerCase().includes(q)));
      return json({ partners, total: partners.length, limit: 25, offset: 0 });
    }
    if (p.endsWith("/admin/sales-partners/5") && req.method() === "GET") return json(mitStart(detail(state.partnerStatus)));
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
    // Partner 12: abgelehnter Antrag — der Server hat den Login dabei gesperrt.
    if (p.endsWith("/admin/sales-partners/12") && req.method() === "GET") {
      const d = detail("pending");
      return json({ ...d, partner: { ...d.partner, id: 12, name: "Rita Abgelehnt", status: "rejected", loginStatus: "blocked" } });
    }
    if (/\/admin\/sales-partners\/(5|6|12)\/commissions$/.test(p)) {
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
    if (p.endsWith("/admin/sales-partner-level-rules")) {
      if (req.method() === "POST") { state.rules.push(req.postDataJSON()); return json({ ok: true }, 201); }
      return json(mitStart({ current: null, history: [], ...(prelive ? { backdatingAllowed: true } : {}) }));
    }
    if (p.endsWith("/admin/sales-partner-caps")) {
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        state.caps.push(body);
        if (body.partnerUserId === 5) state.partnerCap = { id: 31, validFrom: body.validFrom, maxOwnRatePercent: body.maxOwnRatePercent,
          maxTotalRatePercent: body.maxTotalRatePercent, reason: body.reason || null, createdAt: "2026-10-07T10:00:00Z" };
        return json({ ok: true }, 201);
      }
      state.capQueries.push(url.search);
      if (url.searchParams.get("partnerUserId") === "5") return json({ current: state.partnerCap, history: [] });
      return json({ current: null, history: [] });
    }
    if (p.endsWith("/admin/users/7")) {
      // Im Pre-Live-Szenario ist Kunde 7 ein Testkunde — gekennzeichnet allein vom Server.
      return json({ user: { id: 7, name: "Max Mustermann", email: "einkauf@muster-logistik.de", company_name: "Muster Logistik GmbH",
        role: "customer", status: "approved", country: "DE", prelive_test: prelive === true }, summary: {} });
    }
    if (p.endsWith("/admin/users/7/sales-partner-attribution")) {
      if (req.method() === "PUT") {
        const body = req.postDataJSON();
        state.attribution.push(body);
        // Testkunde 7 mit einem echten Partner: der Server weist die Mischung zurück.
        if (prelive && body.partnerUserId === 6) {
          return json({ error: "Testkonten und echte Konten lassen sich nicht mischen.", code: "PRELIVE_TEST_MISMATCH" }, 409);
        }
        return json({ ok: true });
      }
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

test("4 — Einstellungen: Startwerte des Servers vorbelegt (nur speichern); ohne Startwerte leer; Obergrenze optional", async () => {
  const page = await browser.newPage();
  const state = await setup(page, { startDefaults: START });
  await page.clock.setFixedTime(new Date("2026-10-07T10:00:00"));
  await page.goto(`${BASE}/admin/partners/settings`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#adm-sp-global-min-packages")?.value === "3");
  const schwellen = async (art) => Promise.all([1, 2, 3, 4, 5].map((i) => page.inputValue(`#adm-sp-global-${art}-${i}-threshold`)));
  const boni = async (art) => Promise.all([1, 2, 3, 4, 5].map((i) => page.inputValue(`#adm-sp-global-${art}-${i}-bonus`)));
  assert.deepEqual(await schwellen("customer"), ["3", "6", "10", "15", "25"]);
  assert.deepEqual(await schwellen("package"), ["100", "250", "500", "1000", "2000"]);
  assert.deepEqual(await boni("customer"), ["2,50", "5,00", "7,50", "10,00", "12,50"]);
  assert.deepEqual(await boni("package"), ["2,50", "5,00", "7,50", "10,00", "12,50"]);
  assert.equal(await page.inputValue("#adm-sp-global-from"), "2026-10-07", "gültig ab heute vorbelegt");
  assert.match(await page.locator("#adm-sp-global-prefill-note").innerText(), /Startwerten des Programms/);

  // Nur speichern: genau die Startwerte im Vertragsformat.
  await page.locator("#adm-sp-global-submit").click();
  await page.locator("#adm-sp-settings-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.rules, [{ validFrom: "2026-10-07", minPackagesForActiveCustomer: 3,
    customerLevels: START.customerLevels, packageLevels: START.packageLevels }]);

  const caps = await page.locator("#adm-sp-caps-card").innerText();
  assert.match(caps, /Obergrenzen sind optional\. Ohne konfigurierte Version gilt keine Obergrenze/);
  assert.doesNotMatch(caps, /läuft keine Provision/);
  assert.equal(await page.locator("#adm-sp-caps-none").innerText(), "Keine Obergrenze konfiguriert – es gilt keine Grenze.");
  await page.close();

  // Älterer Server ohne Startwerte: nichts wird erfunden — alle Felder leer.
  const ohne = await browser.newPage();
  await setup(ohne);
  await ohne.goto(`${BASE}/admin/partners/settings`, { waitUntil: "networkidle" });
  await ohne.locator("#adm-sp-global-min-packages").waitFor({ state: "visible" });
  assert.equal(await ohne.inputValue("#adm-sp-global-min-packages"), "");
  for (let i = 1; i <= 5; i += 1) {
    assert.equal(await ohne.inputValue(`#adm-sp-global-customer-${i}-threshold`), "", `Kundenschwelle ${i} vorbelegt`);
    assert.equal(await ohne.inputValue(`#adm-sp-global-package-${i}-bonus`), "", `Paketbonus ${i} vorbelegt`);
  }
  assert.equal(await ohne.inputValue("#adm-sp-global-from"), "");
  assert.equal(await ohne.locator("#adm-sp-global-prefill-note").count(), 0);
  await ohne.close();
});

test("5 — Kundendetail: die Zuordnungskarte lädt selbständig", async () => {
  const page = await browser.newPage();
  await setup(page);
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-attribution-current").waitFor({ state: "visible" });
  assert.match(await page.locator("#adm-sp-attribution").innerText(), /Sam Sponsor/);
  assert.match(await page.locator("#adm-sp-attribution").innerText(), /Empfehlungslink/);
  assert.equal(await page.locator("#adm-user-test-badge").count(), 0, "ein echter Kunde trägt kein Testkennzeichen");
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

  // Abgelehnter Antrag (UX-Paket 1): der Login ist gesperrt, aber „Login entsperren“
  // gibt es nicht — der Server steuert den Login nur für freigegebene Partner.
  await page.goto(`${BASE}/admin/partners/12`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-login").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-sp-login").innerText(), "Login gesperrt");
  assert.equal(await page.locator("#adm-sp-login-off, #adm-sp-login-on").count(), 0);
  assert.equal(await page.locator("#adm-sp-rates-none").innerText(), "Für einen abgelehnten Antrag gibt es keine Provisionssätze.");
  assert.equal(await page.locator("#adm-sp-rates-from").count(), 0);

  // Aktiver Partner (approved): sperren → PUT { enabled:false } → „Login gesperrt“.
  await page.goto(`${BASE}/admin/partners/6`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-login").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-sp-login").innerText(), "Login aktiv");
  // Deaktivieren nennt die echten Folgen — es sperrt den Login nicht (UX-Paket 1).
  await page.locator("#adm-sp-deactivate").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  const deaktivieren = await page.locator('[role="dialog"]').innerText();
  assert.match(deaktivieren, /Ab heute entstehen für diesen Partner keine neuen Provisionen/);
  assert.match(deaktivieren, /Der Login bleibt aktiv – zum Aussperren zusätzlich „Login sperren“ verwenden\./);
  await page.locator('[role="dialog"] button', { hasText: "Abbrechen" }).click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
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

test("7 — Freigabe mit Startwerten: 10,00 / 5,00 / 2,50 vorbelegt und genau so gesendet", async () => {
  const page = await browser.newPage();
  const state = await setup(page, { startDefaults: START });
  await page.goto(`${BASE}/admin/partners/5`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-approve").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  assert.equal(await page.inputValue("#adm-sp-base"), "10,00");
  assert.equal(await page.inputValue("#adm-sp-l1"), "5,00");
  assert.equal(await page.inputValue("#adm-sp-l2"), "2,50");
  assert.match(await page.locator("#adm-sp-approve-hint").innerText(), /Vorbelegt mit den Startsätzen/);
  // Ohne Freigabe für Rückdatierung gibt es kein Datumsfeld.
  assert.equal(await page.locator("#adm-sp-approve-date").count(), 0);
  await page.locator("#adm-sp-dialog-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.approve, [{ basePercent: "10.00", level1Percent: "5.00", level2Percent: "2.50" }]);
  await page.waitForFunction(() => document.querySelector("#adm-sp-status")?.textContent === "Aktiv");

  // Eigene Level-Regeln des Partners starten ebenfalls mit den Startwerten.
  await page.locator("#adm-sp-levels-custom").check();
  assert.equal(await page.inputValue("#adm-sp-levels-customer-1-threshold"), "3");
  assert.equal(await page.inputValue("#adm-sp-levels-package-5-threshold"), "2000");
  assert.equal(await page.inputValue("#adm-sp-levels-min-packages"), "3");
  await page.close();
});

test("8 — individuelle Obergrenze: Standardtext, neue Version mit partnerUserId, danach der neue Stand", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  await page.clock.setFixedTime(new Date("2026-10-07T10:00:00"));
  await page.goto(`${BASE}/admin/partners/5`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-pcap-none").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-sp-pcap-none").innerText(),
    "Keine individuelle Obergrenze – es gilt die globale Einstellung (standardmäßig keine Obergrenze).");
  assert.ok(state.capQueries.includes("?partnerUserId=5"), `Abfrage ohne Partner: ${JSON.stringify(state.capQueries)}`);

  // Ohne Datum kein Request.
  await page.locator("#adm-sp-pcap-submit").click();
  await page.locator("#adm-sp-partner-cap-card .field-error").first().waitFor({ state: "visible" });
  assert.equal(state.caps.length, 0);

  await page.fill("#adm-sp-pcap-from", "2026-10-08");
  await page.fill("#adm-sp-pcap-total", "30");
  await page.locator("#adm-sp-pcap-submit").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  // Bewusste Ankeränderung (UX-Paket 1): „aller Ebenen zusammen“ statt „gesamt“, und die
  // Bestätigung nennt die Wirkung einer überschrittenen Gesamtgrenze.
  const capDialog = await page.locator('[role="dialog"]').innerText();
  assert.match(capDialog, /Eigenprovision ohne Grenze, alle Ebenen zusammen höchstens 30,00 %\./);
  assert.match(capDialog, /Wird der Wert überschritten, entsteht für diese Sendung keine automatische Provision\./);
  await page.locator("#adm-sp-pcap-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.caps, [{ validFrom: "2026-10-08", maxOwnRatePercent: null, maxTotalRatePercent: "30.00", partnerUserId: 5 }]);
  await page.locator("#adm-sp-pcap-current").waitFor({ state: "visible" });
  const karte = await page.locator("#adm-sp-pcap-current").innerText();
  assert.match(karte, /30,00 %/);
  assert.match(karte, /08\.10\.2026/);
  assert.match(karte, /Keine Grenze/);
  await page.close();
});

test("9 — Pre-Live: Kennzeichnung in Liste und Detail; zurückliegende Daten nur mit Freigabe des Servers", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.clock.setFixedTime(new Date("2026-10-07T10:00:00"));
  const state = await setup(page, { prelive: true, startDefaults: START });
  await page.goto(`${BASE}/admin/partners`, { waitUntil: "networkidle" });
  const testzeile = page.locator('.adm-sp-table tr[data-partner-id="41"]');
  await testzeile.waitFor({ state: "visible" });
  assert.equal(await testzeile.getAttribute("data-prelive"), "true");
  assert.match(await testzeile.innerText(), /TEST \/ PRE-LIVE/);
  assert.doesNotMatch(await page.locator('.adm-sp-table tr[data-partner-id="5"]').innerText(), /TEST/, "echte Partner ohne Kennzeichnung");
  assert.equal(await page.locator("#adm-sp-prelive-link").count(), 1);

  // Testantrag: Kennzeichnung, Freigabe mit zurückliegendem Wirksamkeitsdatum.
  await page.goto(`${BASE}/admin/partners/42`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-prelive-badge").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-sp-prelive-badge").innerText(), "TEST / PRE-LIVE");
  // Bewusste Ankeränderung (UX-Paket 1): vor der Freigabe gibt es kein Satzformular —
  // der Server lehnt neue Sätze für einen Antrag ohnehin ab.
  assert.equal(await page.locator("#adm-sp-rates-from").count(), 0);
  assert.equal(await page.locator("#adm-sp-rates-none").innerText(), "Noch keine Provisionssätze – sie werden bei der Freigabe festgelegt.");
  assert.equal(await page.getAttribute("#adm-sp-pcap-from", "min"), null, "Obergrenze: zurückliegend erlaubt");
  await page.locator("#adm-sp-approve").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  assert.equal(await page.inputValue("#adm-sp-base"), "10,00");
  assert.equal(await page.getAttribute("#adm-sp-approve-date", "min"), null);
  await page.fill("#adm-sp-approve-date", "2026-03-01");
  await page.locator("#adm-sp-dialog-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.approve42, [{ basePercent: "10.00", level1Percent: "5.00", level2Percent: "2.50", effectiveDate: "2026-03-01" }]);
  // Nach der Freigabe: Satzformular da, für den Testpartner zurückliegend erlaubt.
  await page.locator("#adm-sp-rates-from").waitFor({ state: "visible" });
  assert.equal(await page.getAttribute("#adm-sp-rates-from", "min"), null, "Sätze: zurückliegend erlaubt");

  // Echter freigegebener Partner: Sätze weiterhin „nicht vor heute“.
  await page.goto(`${BASE}/admin/partners/6`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-rates-from").waitFor({ state: "visible" });
  assert.equal(await page.getAttribute("#adm-sp-rates-from", "min"), "2026-10-07");
  // Echter Antrag: kein Testkennzeichen, kein Datumsfeld bei der Freigabe.
  await page.goto(`${BASE}/admin/partners/5`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-approve").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-sp-prelive-badge").count(), 0);
  await page.locator("#adm-sp-approve").click();
  assert.equal(await page.locator("#adm-sp-approve-date").count(), 0);
  await page.locator('[role="dialog"] button', { hasText: "Abbrechen" }).click();

  // Globale Regeln: der Server erlaubt die Rückdatierung (backdatingAllowed).
  await page.goto(`${BASE}/admin/partners/settings`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-global-backdating").waitFor({ state: "visible" });
  assert.equal(await page.getAttribute("#adm-sp-global-from", "min"), null);
  assert.equal(await page.getAttribute("#adm-sp-cap-from", "min"), "2026-10-07", "Obergrenzen ohne eigene Freigabe bleiben ab heute");
  await page.close();
});

test("10 — Pre-Live: Zuordnung Testkunde ↔ Testpartner zurückliegend; Mischung mit echtem Partner → fester Satz", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.clock.setFixedTime(new Date("2026-10-07T10:00:00"));
  const state = await setup(page, { prelive: true });
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  // Testkunde (UX-Paket 1): das Kundendetail wirkt nicht wie ein echtes Konto.
  await page.locator("#adm-user-test-badge").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-user-test-badge").innerText(), "TEST / PRE-LIVE");
  await page.locator("#adm-sp-attribution-change").click();
  await page.locator('#adm-sp-attribution-partner option[value="41"]').waitFor({ state: "attached" });
  assert.match(await page.locator('#adm-sp-attribution-partner option[value="41"]').innerText(), /Test Vertrieb A – Test/);
  assert.equal(await page.getAttribute("#adm-sp-attribution-date", "min"), "2026-10-07", "ohne Auswahl gilt ab heute");
  await page.selectOption("#adm-sp-attribution-partner", "41");
  await page.locator("#adm-sp-attribution-backdating").waitFor({ state: "visible" });
  assert.equal(await page.getAttribute("#adm-sp-attribution-date", "min"), null);
  await page.fill("#adm-sp-attribution-date", "2026-03-01");
  await page.fill("#adm-sp-attribution-reason", "Pre-Live-Test");
  await page.locator("#adm-sp-attribution-submit").click();
  await page.locator("#adm-sp-attribution-confirm").click();
  await page.locator('#adm-sp-attribution [role="status"]').waitFor({ state: "visible" });
  assert.deepEqual(state.attribution, [{ partnerUserId: 41, effectiveDate: "2026-03-01", reason: "Pre-Live-Test" }]);

  // Testkunde mit echtem Partner: ab heute, und der Server weist die Mischung zurück.
  await page.locator("#adm-sp-attribution-change").click();
  await page.locator('#adm-sp-attribution-partner option[value="6"]').waitFor({ state: "attached" });
  await page.selectOption("#adm-sp-attribution-partner", "6");
  assert.equal(await page.locator("#adm-sp-attribution-backdating").count(), 0);
  assert.equal(await page.getAttribute("#adm-sp-attribution-date", "min"), "2026-10-07");
  await page.fill("#adm-sp-attribution-date", "2026-10-07");
  await page.fill("#adm-sp-attribution-reason", "Wechsel");
  await page.locator("#adm-sp-attribution-submit").click();
  await page.locator("#adm-sp-attribution-confirm").click();
  await page.locator('#adm-sp-attribution [role="alert"]').waitFor({ state: "visible" });
  assert.equal(await page.locator('#adm-sp-attribution [role="alert"]').innerText(),
    "Testkunden lassen sich nur Testpartnern zuordnen und echte Kunden nur echten Vertriebspartnern. Es wurde nichts geändert.");
  assert.doesNotMatch(await page.locator("#adm-sp-attribution").innerText(), /PRELIVE_TEST_MISMATCH/);
  await page.close();
});
