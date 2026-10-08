// E2E: Admin-Vertriebspartnerverwaltung.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route). Es wird
// kein echter Partner freigegeben, keine echte Sendung entschieden und kein
// echter Server berührt. Geprüft wird:
//   1. Sidebar-Eintrag und Liste mit serverseitigem Status-/Suchfilter.
//   2. Detail eines Antrags: Freigabe mit Pflichtfeld Grundprovision über den
//      Bestätigungsdialog — exakt der Vertragsbody, danach der neue Stand.
//   3. Queue „Versandnachweis fehlt": Entscheidung „Versendet" verlangt Datum
//      und Nachweisart; der Body trägt genau die Vertragsfelder. UX-Paket 5: der
//      Dialog zeigt Sendung, vorhandene Nachweise (die geltende einmal, zuerst),
//      Versandstatus, die Wirkung jeder Entscheidung und vor dem Speichern die
//      Zusammenfassung; ein Fehler des Servers steht am betroffenen Feld.
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
//  11. UX-Paket 2: Teilnavigation statt Kopfbuttons; „Zurück" aus dem Detail führt
//      in dieselbe gefilterte Liste (Filter in der Adresse).
//  12. UX-Paket 2: 390 px — Teilnavigation bricht um (44-px-Ziele, kein seitliches
//      Scrollen); die Partnerkarte zeigt nur Status, Kunden, Pakete und die Aktion.
//  13. UX-Paket 4: „Antrag prüfen“ steht oben — Angaben (beim Testantrag der
//      TEST-Hinweis), Freigeben, Ablehnen; alles Weitere eingeklappt, kein Formular
//      sichtbar, und was der Server vor der Freigabe erlaubt, bleibt erreichbar.
//  14. UX-Paket 4: aktiver Partner — Überblick mit nächstem Schritt, Bereiche
//      eingeklappt mit Kurzfassung, Formular mit der aktuellen Version vorbelegt;
//      „Aktualisieren“ lädt Detail, Abrechnungsdaten, Gutschriften, Obergrenze und
//      Provisionen neu und zeigt den neuen Stand.
//  15. UX-Paket 4: 390 px — kein seitliches Scrollen, Tabellen als Karten mit
//      Spaltenbeschriftung, Bereichsköpfe und Teilbereiche mit 44-px-Ziel.
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

// UX-Paket 4: ein voll belegter aktiver Partner (6) — Kunden, Team, Bewertung,
// eingereichte Abrechnungsdaten, eine offene Gutschrift, eine Provisionsbuchung.
const VOLL6 = {
  statusHistory: [{ status: "active", effectiveDate: "2026-03-01", reason: null, createdAt: "2026-03-01T08:00:00Z" },
    { status: "pending", effectiveDate: "2026-02-20", reason: null, createdAt: "2026-02-20T09:30:00Z" }],
  customers: [
    { customerId: 7, companyName: "Muster Logistik GmbH", assignedSince: "2026-05-01", assignedUntil: null, source: "referral_link", referralCodeUsed: "WXYZ6789" },
    { customerId: 8, companyName: "Alt Kunde AG", assignedSince: "2026-01-01", assignedUntil: "2026-04-01", source: "admin", referralCodeUsed: null },
  ],
  team: { level1: [{ id: 5, name: "Petra Partner", status: "active", activeSince: "2026-10-06", relevant: true, rank: 1,
    commissionCurrentMonthCents: 125, commissionTotalCents: 125 }], level2: [] },
  assessments: [{ month: "2026-10", measuredMonth: "2026-09", activeCustomers: 1, shippedPackages: 120, customerLevel: 0,
    customerBonusPercent: "0.00", packageLevel: 1, packageBonusPercent: "2.50", minPackages: 3, ruleSetId: 1, version: 1,
    createdAt: "2026-10-01T02:00:00Z" }],
};
const ABRECHNUNG6 = { status: "submitted", missingFields: [], accountEmail: "sam@vertrieb-nord.de", billingDetails: {
  billingName: "Vertrieb Nord GmbH", street: "Hafenstraße 2", postalCode: "20095", city: "Hamburg", country: "DE",
  taxStatus: "with_vat", taxNumber: "22/123/45678", vatId: "DE987654321", accountHolder: "Vertrieb Nord GmbH",
  ibanMasked: "DE02 **** **** **** **20 51", iban: "DE02120300000000202051", bic: "BYLADEM1001",
  submittedAt: "2026-10-07T09:00:00.000Z", reviewedAt: null, reviewNote: null } };
const GUTSCHRIFT6 = { id: 31, number: "GS-2026-0031", kind: "regular", title: "Gutschrift", periodMonth: "2026-09",
  issuedAt: "2026-10-02T08:00:00.000Z", issuedOn: "2026-10-02", netCents: 10000, taxCents: 1900, grossCents: 11900,
  taxRatePercent: "19.00", currency: "EUR", documentReady: true, payoutStatus: "open", paidOn: null, cancelled: false,
  cancelledByNumber: null, correctsNumber: null, replacesNumber: null, documentStatus: "ready",
  notifiedAt: "2026-10-02T08:01:00.000Z", paidReference: null, issuedByName: "Anna Admin", cancellationReason: null };
const PROVISIONEN6 = { month: "2026-10", totals: { accruedCents: 1125, payableCents: 0 }, entries: [{
  id: 501, decisionId: 77, shipmentId: 9001, entryDate: "2026-10-03", level: 0, type: "accrual", basisCents: 5000,
  ratePercent: "22.50", amountCents: 1125, payable: false, customerName: "Muster Logistik GmbH", note: null,
  decision: { dispatchDate: "2026-10-02", baseRatePercent: "20.00", customerLevel: 0, customerBonusPercent: "0.00", packageLevel: 1,
    packageBonusPercent: "2.50", ownRatePercent: "22.50", capApplied: false, purchaseNetCents: 4000, customerNetCents: 5000 } }] };

let server, browser;

// UX-Paket 4: Die Bereiche des Partnerdetails sind eingeklappt. Geöffnet wird wie
// von Hand — per Klick auf den Kopf (<summary>), nur wenn der Bereich noch zu ist.
async function bereich(page, id) {
  await page.locator(`#${id}`).waitFor({ state: "attached" });
  if (!(await page.locator(`#${id}`).evaluate((d) => d.open))) await page.locator(`#${id} > summary`).click();
  await page.waitForFunction((x) => document.getElementById(x)?.open === true, id);
}

// `startDefaults`: Startwerte in Detail- und Regelantwort (null = älterer Server ohne Feld).
// `prelive`: Pre-Live-Testmodus an (Status, Testkonten, Testpartner, Rückdatierung).
// `voll`: Partner 6 voll belegt (UX-Paket 4); `zugriffe` zählt die Abrufe seiner Bereiche.
async function setup(page, { startDefaults = null, prelive = false, voll = false } = {}) {
  const state = { list: [], approve: [], evidence: [], evidenceRejected: [], partnerStatus: "pending", other: [], login: [], login6: "approved",
    rules: [], caps: [], capQueries: [], partnerCap: null, approve42: [], attribution: [], status42: "pending",
    zugriffe: { detail6: 0, billing6: 0, credit6: 0, caps6: 0, commissions6: 0 }, rates6: null,
    billing6: structuredClone(ABRECHNUNG6), credit6: [structuredClone(GUTSCHRIFT6)] };
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
      state.zugriffe.detail6 += 1;
      const d = detail("active");
      const basis = { ...d, partner: { ...d.partner, id: 6, name: "Sam Sponsor", loginStatus: state.login6 } };
      return json(voll ? { ...basis, ...VOLL6, rates: { current: state.rates6 || d.rates.current, history: [] } } : basis);
    }
    // Bereiche von Partner 6 (UX-Paket 4): Abrechnungsdaten und Gutschriften.
    if (p.endsWith("/admin/sales-partners/6/billing-details") && req.method() === "GET") {
      state.zugriffe.billing6 += 1;
      return json(voll ? state.billing6 : { status: "incomplete", billingDetails: null, missingFields: [], accountEmail: "sam@vertrieb-nord.de" });
    }
    if (p.endsWith("/admin/sales-partners/6/credit-notes") && req.method() === "GET") {
      state.zugriffe.credit6 += 1;
      return json({ creditNotes: voll ? state.credit6 : [] });
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
      if (p.includes("/6/")) state.zugriffe.commissions6 += 1;
      if (voll && p.includes("/6/")) return json(PROVISIONEN6);
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
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        // Vertrag der Adminentscheidung: das Versanddatum liegt nicht vor der Buchung (01.10.2026).
        if (body.dispatchDate && body.dispatchDate < "2026-10-01") {
          state.evidenceRejected.push(body);
          return json({ error: "Das Versanddatum liegt vor der Buchung", code: "DISPATCH_DATE_BEFORE_BOOKING" }, 400);
        }
        state.evidence.push(body);
        return json({ ok: true });
      }
      // Bisherige Nachweise wie vom Server: die geltende Entscheidung steht auch in `history`.
      const geltend = { id: 12, status: "unclear", dispatchDate: null, source: "admin", evidenceType: "admin_decision",
        note: "Kunde meldet sich noch.", createdAt: "2026-10-03T09:00:00Z", superseded: false };
      const frueher = { id: 11, status: "unclear", dispatchDate: null, source: "carrier_tracking", evidenceType: "carrier_in_transit",
        note: null, createdAt: "2026-10-02T09:00:00Z", superseded: true };
      return json({ current: geltend, history: [geltend, frueher] });
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
      if (url.searchParams.get("partnerUserId") === "6") state.zugriffe.caps6 += 1;
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
  assert.match(text, /Antrag vom 01\.10\.2026/);
  assert.match(text, /1\.530/, "Pakete im Vormonat aus dem Serverwert");
  assert.doesNotMatch(text, /\bpending\b|\bactive\b/, "Rohstatus im sichtbaren Text");
  // UX-Paket 2: sichtbar nur Partner, Status, Kunden, Pakete und die wichtigste Aktion —
  // Login, Team, Eigenprovision und Daten stehen im Detail.
  assert.deepEqual((await page.locator(".adm-sp-table thead th").allInnerTexts()).map((t) => t.trim()),
    ["Partner", "Status", "Kunden", "Pakete Vormonat", "Aktion"]);
  assert.doesNotMatch(text, /27,50 %|Eigensatz|Team E1/);
  // Ein offener Antrag hat „Antrag prüfen" als Hauptaktion, ein aktiver Partner „Details".
  assert.equal(await page.locator('.adm-sp-table tr[data-partner-id="5"] a.btn', { hasText: "Antrag prüfen" }).count(), 1);
  assert.equal(await page.locator('.adm-sp-table tr[data-partner-id="6"] a.btn', { hasText: "Details" }).count(), 1);
  // Offene Anträge sind hervorgehoben — aus dem Serverzähler der Liste mit status=pending.
  assert.equal((await page.locator("#adm-sp-pending-note").innerText()).split("\n")[0].trim(), "1 Antrag wartet auf Prüfung.");
  assert.ok(state.list.some((qs) => { const q = new URLSearchParams(qs); return q.get("status") === "pending" && q.get("limit") === "1"; }));

  // Der Statusfilter wirkt sofort, die Suche mit „Suchen"; beide stehen in der Adresse.
  await page.selectOption("#sp-filter-status", "pending");
  await page.waitForURL(`${BASE}/admin/partners?status=pending`);
  await page.fill("#sp-filter-q", "petra");
  // Gewartet wird auf genau die Antwort mit der Suche — die Zeilenzahl ist schon nach dem
  // Statusfilter 1 und taugt deshalb nicht als Signal.
  const mitSuche = page.waitForResponse((r) => r.url().includes("/admin/sales-partners?") && r.url().includes("q=petra"));
  await page.locator("#sp-filter-apply").click();
  await mitSuche;
  await page.waitForURL(`${BASE}/admin/partners?status=pending&q=petra`);
  await page.waitForFunction(() => document.querySelectorAll(".adm-sp-table tbody tr").length === 1);
  const letzter = new URLSearchParams(state.list[state.list.length - 1]);
  assert.equal(letzter.get("status"), "pending");
  assert.equal(letzter.get("q"), "petra");
  assert.equal(letzter.get("limit"), "25");
  assert.equal(letzter.get("offset"), "0");
  // Bei gefilterten Anträgen braucht es keinen Hinweis mehr.
  assert.equal(await page.locator("#adm-sp-pending-note").count(), 0);
  // Die Unterseiten liegen in der Teilnavigation (dieselben Ids wie früher die Kopfbuttons).
  assert.equal(await page.locator("#adm-sp-settings-link").getAttribute("href"), "/admin/partners/settings");
  assert.equal(await page.locator("#adm-sp-evidence-link").getAttribute("href"), "/admin/partners/dispatch-evidence");
  assert.equal(await page.locator("#adm-sp-credit-notes-link").innerText(), "Gutschriften");
  await page.close();
});

test("2 — Freigabe eines Antrags: Pflichtfeld Grundprovision, Vertragsbody, neuer Stand", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  await page.goto(`${BASE}/admin/partners`, { waitUntil: "networkidle" });
  // UX-Paket 2: ein offener Antrag hat „Antrag prüfen" statt „Details" als Zeilenaktion.
  await page.locator('.adm-sp-table tr[data-partner-id="5"] a', { hasText: "Antrag prüfen" }).click();
  await page.waitForURL(`${BASE}/admin/partners/5`);
  await page.locator("#adm-sp-approve").waitFor({ state: "visible" });
  // UX-Paket 4: „Codes und Links“ ist eingeklappt; der Code steht im Kopf, ausgeklappt mit Kopierfeld.
  assert.match(await page.locator("#adm-sp-codes-card > summary").innerText(), /Empfehlungscode ABCD2345/);
  await bereich(page, "adm-sp-codes-card");
  assert.match(await page.locator("#adm-sp-codes-card .adm-kv").innerText(), /ABCD2345/);

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
  // Die Meldung der Freigabe bleibt stehen (dieselbe Statuskarte), der Überblick nennt die Sätze.
  assert.equal(await page.locator('#adm-sp-status-card [role="status"]').innerText(), "Der Vertriebspartner wurde freigegeben.");
  assert.match(await page.locator("#adm-sp-rates-card > summary").innerText(), /Grundprovision 20,00\s%/);
  assert.equal((await page.locator("#adm-sp-overview-rates").innerText()).replace(/\s+/g, " "), "Grundprovision 20,00 % · Ebene 1: 5,00 % · Ebene 2: 2,50 %");
  await page.close();
});

test("3 — Versandnachweis: „Versendet“ verlangt Datum und Nachweisart; Vertragsbody", async () => {
  const page = await browser.newPage();
  const state = await setup(page);
  await page.goto(`${BASE}/admin/partners/dispatch-evidence`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-evidence-77").click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: "visible" });
  // UX-Paket 5: der Dialog folgt dem Ablauf — Sendung, vorhandene Nachweise, Versandstatus, Entscheidung.
  await page.locator("#adm-sp-evidence-history").waitFor({ state: "visible" });
  const text = await dialog.innerText();
  const stelle = (t) => text.indexOf(t);
  for (const [vor, nach] of [["Sendung", "Vorhandene Nachweise"], ["Vorhandene Nachweise", "Versandstatus"],
    ["Versandstatus", "Entscheidung (Pflicht)"], ["Entscheidung (Pflicht)", "Begründung (Pflicht)"]]) {
    assert.ok(stelle(vor) >= 0 && stelle(vor) < stelle(nach), `„${vor}“ steht nicht vor „${nach}“`);
  }
  assert.match(await page.locator("#adm-sp-evidence-shipment").innerText(), /1Z999AA10123456784/);
  assert.match(await page.locator("#adm-sp-evidence-tracking").innerText(), /Unterwegs/);
  // Die geltende Entscheidung steht genau einmal und zuerst; automatische Arten sind lesbar.
  const nachweise = await page.locator("#adm-sp-evidence-history li").allInnerTexts();
  assert.equal(nachweise.length, 2, `doppelt geführt: ${nachweise.join(" | ")}`);
  assert.match(nachweise[0], /gilt derzeit[\s\S]*Kunde meldet sich noch\./);
  assert.match(nachweise[1], /Carrier meldet: unterwegs/);
  assert.doesNotMatch(nachweise.join(" "), /Unbekannte Nachweisart|carrier_in_transit|admin_decision/);
  // Jede Entscheidung nennt ihre Wirkung.
  assert.match(await page.locator("#adm-sp-evidence-effect-not_dispatched").innerText(), /keine Provision/);

  await page.locator("#adm-sp-evidence-status-dispatched").check();
  await page.fill("#adm-sp-evidence-note", "Im Carrier-Portal als übergeben ausgewiesen.");
  assert.equal(await page.getAttribute("#adm-sp-evidence-note", "maxlength"), "500", "wie der Vertrag: höchstens 500 Zeichen");
  await page.locator("#adm-sp-evidence-confirm").click();
  await page.locator('[role="dialog"] .field-error').first().waitFor({ state: "visible" });
  assert.equal(state.evidence.length + state.evidenceRejected.length, 0, "ohne Datum und Nachweisart kein Request");

  // Ein Fehler des Servers steht am Feld; der Dialog bleibt offen.
  await page.fill("#adm-sp-evidence-date", "2026-09-30");
  await page.selectOption("#adm-sp-evidence-type", "carrier_portal");
  await page.locator("#adm-sp-evidence-confirm").click();
  await page.locator("#adm-sp-evidence-dispatchDate-error").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-sp-evidence-dispatchDate-error").innerText(),
    "Das Versanddatum darf nicht vor der Buchung der Sendung liegen.");
  assert.doesNotMatch(await dialog.innerText(), /DISPATCH_DATE_BEFORE_BOOKING/);
  assert.equal(state.evidenceRejected.length, 1);

  await page.fill("#adm-sp-evidence-date", "2026-10-02");
  assert.equal(await page.locator("#adm-sp-evidence-summary").innerText(), "Gespeichert wird: Versendet am 02.10.2026 · Carrier-Portal.");
  await page.locator("#adm-sp-evidence-confirm").click();
  await dialog.waitFor({ state: "detached" });
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
  await bereich(page, "adm-sp-rates-card");   // UX-Paket 4: eingeklappt
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

  // Eigene Level-Regeln des Partners starten ebenfalls mit den Startwerten — das
  // Formular steht eingeklappt unter „Neue Version anlegen“ (UX-Paket 4).
  await bereich(page, "adm-sp-levels-card");
  await bereich(page, "adm-sp-levels-new");
  await page.locator("#adm-sp-levels-custom").check();
  assert.equal(await page.locator("#adm-sp-levels-prefill-note").innerText(),
    "Vorbelegt mit den Startwerten des Programms. Passen Sie die Werte für diesen Partner an.");
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
  // UX-Paket 4: eingeklappt, der Kopf nennt den Stand; das Formular ist ein eigener Teil.
  await page.waitForFunction(() => /Keine individuelle Obergrenze/.test(document.querySelector("#adm-sp-partner-cap-card > summary")?.textContent || ""));
  await bereich(page, "adm-sp-partner-cap-card");
  await page.locator("#adm-sp-pcap-none").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-sp-pcap-none").innerText(),
    "Keine individuelle Obergrenze – es gilt die globale Einstellung (standardmäßig keine Obergrenze).");
  assert.ok(state.capQueries.includes("?partnerUserId=5"), `Abfrage ohne Partner: ${JSON.stringify(state.capQueries)}`);

  // Ohne Datum kein Request.
  await bereich(page, "adm-sp-pcap-new");
  assert.equal(await page.inputValue("#adm-sp-pcap-total"), "", "ohne Version nichts vorbelegt");
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
  // Nach dem Speichern schließt das Formular; geöffnet trägt es die neue Version (UX-Paket 4) —
  // „Gültig ab“ bleibt leer, die leere Grenze bleibt leer.
  assert.equal(await page.locator("#adm-sp-pcap-new").evaluate((d) => d.open), false);
  assert.match(await page.locator("#adm-sp-partner-cap-card > summary").innerText(), /Eigenprovision ohne Grenze · alle Ebenen höchstens 30,00\s%/);
  await bereich(page, "adm-sp-pcap-new");
  assert.deepEqual(await Promise.all(["#adm-sp-pcap-from", "#adm-sp-pcap-own", "#adm-sp-pcap-total"].map((s) => page.inputValue(s))), ["", "", "30,00"]);
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
  await bereich(page, "adm-sp-rates-card");   // UX-Paket 4: Bereiche eingeklappt
  assert.equal(await page.locator("#adm-sp-rates-none").innerText(), "Noch keine Provisionssätze – sie werden bei der Freigabe festgelegt.");
  await bereich(page, "adm-sp-partner-cap-card");
  await bereich(page, "adm-sp-pcap-new");
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
  await bereich(page, "adm-sp-rates-new");
  await page.locator("#adm-sp-rates-from").waitFor({ state: "visible" });
  assert.equal(await page.getAttribute("#adm-sp-rates-from", "min"), null, "Sätze: zurückliegend erlaubt");

  // Echter freigegebener Partner: Sätze weiterhin „nicht vor heute“.
  await page.goto(`${BASE}/admin/partners/6`, { waitUntil: "networkidle" });
  await bereich(page, "adm-sp-rates-card");
  await bereich(page, "adm-sp-rates-new");
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

test("11 — Teilnavigation und Rückweg (UX-Paket 2): gefilterte Liste bleibt erhalten, Unterseiten ohne Kopfbuttons", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setup(page, { prelive: true });

  // Aus der gefilterten Liste ins Detail — „Zurück" führt in dieselbe gefilterte Liste.
  await page.goto(`${BASE}/admin/partners?status=pending`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("#sp-filter-status").inputValue(), "pending", "der Filter aus der Adresse greift nicht");
  await page.locator('.adm-sp-table tr[data-partner-id="5"] a', { hasText: "Antrag prüfen" }).click();
  await page.waitForURL(`${BASE}/admin/partners/5`);
  const zurueck = page.locator(".adm-back");
  await zurueck.waitFor({ state: "visible" });
  assert.equal((await zurueck.innerText()).trim(), "Zurück zu den Vertriebspartnern");
  assert.equal(await zurueck.getAttribute("href"), "/admin/partners?status=pending");
  await zurueck.click();
  await page.waitForURL(`${BASE}/admin/partners?status=pending`);
  assert.equal(await page.locator("#sp-filter-status").inputValue(), "pending");

  // Teilnavigation: genau ein aktiver Eintrag, Pre-Live nur bei aktivem Modus, kein Kopfbutton-Block.
  const navi = page.locator('nav[aria-label="Bereiche des Partnerprogramms"]');
  await page.locator("#adm-sp-prelive-link").waitFor({ state: "visible" });
  assert.deepEqual((await navi.locator("a").allInnerTexts()).map((t) => t.trim()),
    ["Partner", "Versandnachweise", "Gutschriften", "Einstellungen", "Pre-Live-Test"]);
  assert.equal(await navi.locator('a[aria-current="page"]').innerText(), "Partner");
  assert.equal(await page.locator(".ce-page-header-actions a").count(), 0, "Unterseiten wieder als Kopfbuttons");

  // Die Unterseiten tragen dieselbe Teilnavigation statt eines Zurück-Links.
  for (const [id, ziel, titel] of [
    ["#adm-sp-evidence-link", "/admin/partners/dispatch-evidence", "Versandnachweise"],
    ["#adm-sp-settings-link", "/admin/partners/settings", "Einstellungen Vertriebspartner"],
  ]) {
    await page.locator(id).click();
    await page.waitForURL(`${BASE}${ziel}`);
    await page.locator(".ce-page-header-title", { hasText: titel }).waitFor({ state: "visible" });
    assert.equal(await page.locator(`${id}[aria-current="page"]`).count(), 1, `${ziel}: Eintrag nicht aktiv`);
    assert.equal(await page.locator(".adm-back").count(), 0, `${ziel}: Zurück-Link neben der Teilnavigation`);
    // Pre-Live erscheint auch hier, sobald der Server den Modus meldet (fail-closed bis dahin).
    await page.locator("#adm-sp-prelive-link").waitFor({ state: "visible" });
  }
  await page.close();
});

test("12 — 390 px: Teilnavigation bricht um statt seitlich zu scrollen, die Partnerkarten zeigen nur das Nötige", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setup(page, { prelive: true });
  await page.goto(`${BASE}/admin/partners`, { waitUntil: "networkidle" });
  await page.locator('.adm-sp-cards li[data-partner-id="5"]').waitFor({ state: "visible" });
  await page.locator("#adm-sp-prelive-link").waitFor({ state: "visible" });

  const navi = page.locator('nav[aria-label="Bereiche des Partnerprogramms"]');
  const masse = await navi.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth,
    links: [...el.querySelectorAll("a")].map((a) => { const r = a.getBoundingClientRect(); return { h: r.height, rechts: r.right }; }) }));
  assert.ok(masse.scroll <= masse.client + 1, `Teilnavigation scrollt seitlich: ${masse.scroll} > ${masse.client}`);
  assert.ok(masse.links.every((l) => l.h >= 44), `Touch-Ziel unter 44 px: ${JSON.stringify(masse.links)}`);
  assert.ok(masse.links.every((l) => l.rechts <= 390), "ein Eintrag liegt außerhalb des Bildschirms");
  const seite = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(seite <= 390, `die Seite scrollt seitlich: ${seite}`);

  const karte = await page.locator('.adm-sp-cards li[data-partner-id="5"]').innerText();
  assert.match(karte, /In Prüfung/);
  assert.match(karte, /Antrag vom 01\.10\.2026/);
  assert.match(karte, /Antrag prüfen/);
  assert.doesNotMatch(karte, /Eigensatz|Team E1|Aktiv seit|Login/);

  // Einstellungen: die unsichtbaren Feldbeschriftungen der Level-Tabelle verbreiterten
  // die Seite (gemessen 541 px); der Scrollcontainer ist jetzt ihr Bezugspunkt.
  await page.locator("#adm-sp-settings-link").click();
  await page.waitForURL(`${BASE}/admin/partners/settings`);
  await page.locator(".adm-sp-levels input").first().waitFor({ state: "visible" });
  const einstellungen = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(einstellungen <= 390, `die Einstellungen scrollen seitlich: ${einstellungen}`);
  await page.close();
});

test("13 — UX-Paket 4: „Antrag prüfen“ oben — Angaben, Freigeben, Ablehnen; alles Weitere eingeklappt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setup(page, { prelive: true });
  await page.goto(`${BASE}/admin/partners/5`, { waitUntil: "networkidle" });
  const antrag = page.locator("#adm-sp-status-card");
  await antrag.waitFor({ state: "visible" });
  assert.equal((await antrag.locator(".adm-card-head").innerText()).trim(), "Antrag prüfen");
  // Die Antragskarte ist die erste Karte; Freigeben und Ablehnen stehen ohne Scrollen im Bild.
  assert.equal(await page.evaluate(() => document.querySelector(".adm-page .adm-card")?.id), "adm-sp-status-card");
  for (const id of ["#adm-sp-approve", "#adm-sp-reject"]) {
    const box = await page.locator(id).boundingBox();
    assert.ok(box && box.y + box.height <= 900, `${id} liegt unterhalb des sichtbaren Bereichs: ${JSON.stringify(box)}`);
  }
  const angaben = await page.locator("#adm-sp-application-facts").innerText();
  for (const t of ["Petra Partner", "Vertrieb Süd GmbH", "petra@partner-vertrieb.de", "Sam Sponsor", "Fassung 2026-10"]) {
    assert.ok(angaben.includes(t), `Angabe fehlt: ${t}`);
  }
  assert.equal(await page.locator('#adm-sp-application-facts a[href="/admin/partners/6"]').count(), 1, "Sponsor verlinkt");
  // Kein Überblick, keine zweite Stammdatenkarte; jeder Bereich eingeklappt, kein Formular sichtbar.
  assert.equal(await page.locator("#adm-sp-overview-card, #adm-sp-master-card").count(), 0);
  const offen = await page.$$eval("details.adm-disclosure", (ds) => ds.filter((d) => d.open).map((d) => d.id));
  assert.deepEqual(offen, [], `offene Bereiche: ${offen.join(", ")}`);
  assert.equal(await page.locator("form:visible").count(), 0, "ein Formular ist dauerhaft sichtbar");
  assert.equal(await page.locator("#adm-sp-rates-from").count(), 0, "vor der Freigabe kein Satzformular");
  assert.match(await page.locator("#adm-sp-rates-card > summary").innerText(), /Noch keine Sätze/);
  // Was der Server vor der Freigabe erlaubt (Level-Regeln, Obergrenze, Korrekturbuchung), bleibt erreichbar.
  for (const id of ["adm-sp-levels-new", "adm-sp-pcap-new", "adm-sp-adjust-section"]) {
    assert.equal(await page.locator(`#${id}`).count(), 1, `${id} fehlt`);
  }
  assert.match(await page.locator("#adm-sp-codes-card > summary").innerText(), /Empfehlungscode ABCD2345/);
  await bereich(page, "adm-sp-codes-card");
  assert.equal(await page.locator("#adm-sp-links-inactive").innerText(), "Die Empfehlungslinks wirken nur bei aktivem Partnerkonto.");

  // Testantrag: der Vertragsstand nennt das Testkonto — allein aus der Kennzeichnung des Servers.
  await page.goto(`${BASE}/admin/partners/42`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-application-facts").waitFor({ state: "visible" });
  assert.match(await page.locator("#adm-sp-application-facts").innerText(), /Testkonto \(TEST \/ PRE-LIVE\) – ohne Partnervereinbarung/);
  await page.close();
});

test("14 — UX-Paket 4: aktiver Partner — Überblick, eingeklappte Bereiche, Vorbelegung, „Aktualisieren“ lädt alles neu", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.clock.setFixedTime(new Date("2026-10-07T10:00:00"));
  const state = await setup(page, { voll: true });
  await page.goto(`${BASE}/admin/partners/6`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-overview-card").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => document.querySelector(".adm-page .adm-card")?.id), "adm-sp-overview-card");
  const text = async (id) => (await page.locator(`#${id}`).innerText()).replace(/\s+/g, " ").trim();
  await page.waitForFunction(() => document.querySelector("#adm-sp-next-step")?.dataset.step === "billing");
  assert.match(await text("adm-sp-next-step"), /Der Partner hat seine Abrechnungsdaten zur Prüfung eingereicht\./);
  assert.equal(await text("adm-sp-overview-rates"), "Grundprovision 20,00 % · Ebene 1: 5,00 % · Ebene 2: 2,50 %");
  assert.equal(await text("adm-sp-overview-levels"), "Globale Regeln");
  assert.equal(await text("adm-sp-overview-cap"), "Keine individuelle Obergrenze");
  assert.equal(await text("adm-sp-overview-customers"), "1 aktuell zugeordnet · 2 Zuordnungen insgesamt");
  assert.equal(await text("adm-sp-overview-team"), "Ebene 1: 1 · Ebene 2: 0");
  assert.equal(await text("adm-sp-overview-billing"), "In Prüfung");
  assert.equal(await text("adm-sp-overview-credit-notes"), "1 Gutschrift · 1 noch nicht als ausgezahlt vermerkt");
  assert.equal(await text("adm-sp-overview-status"), "Aktiv seit 01.03.2026");
  // Die IBAN steht nur in der Karte „Abrechnungsdaten“, nie im Überblick.
  assert.doesNotMatch((await text("adm-sp-overview-card")).replace(/\s/g, ""), /DE02120300000000202051|DE02\*/);

  // Nur die eingereichten Abrechnungsdaten sind von selbst offen; jeder andere Bereich zeigt seine Kurzfassung.
  const offen = await page.$$eval("details.adm-disclosure", (ds) => ds.filter((d) => d.open).map((d) => d.id));
  assert.deepEqual(offen, ["adm-sp-billing-card"]);
  assert.equal(await page.locator("form:visible").count(), 0, "ein Formular ist dauerhaft sichtbar");
  const kopf = async (id) => (await page.locator(`#${id} > summary`).innerText()).replace(/\s+/g, " ").trim();
  assert.equal(await kopf("adm-sp-rates-card"), "Provisionssätze Grundprovision 20,00 % · Ebene 1: 5,00 % · Ebene 2: 2,50 %");
  assert.equal(await kopf("adm-sp-levels-card"), "Level-Regeln Globale Regeln");
  assert.equal(await kopf("adm-sp-customers-card"), "Kunden 1 aktuell zugeordnet · 2 Zuordnungen insgesamt");
  assert.equal(await kopf("adm-sp-team-card"), "Team Ebene 1: 1 · Ebene 2: 0");
  assert.equal(await kopf("adm-sp-assessments-card"), "Monatsbewertungen Oktober 2026: Kunden-Level 0 · Paket-Level 1");
  assert.equal(await kopf("adm-sp-commissions-card"), "Provisionen Oktober 2026: 11,25 € · davon auszahlbar 0,00 €");
  assert.equal(await kopf("adm-sp-credit-notes-card"), "Gutschriften 1 Gutschrift · 1 noch nicht als ausgezahlt vermerkt");
  assert.equal(await kopf("adm-sp-master-card"), "Stammdaten Partnervereinbarung Fassung 2026-10");
  assert.equal(await kopf("adm-sp-codes-card"), "Codes und Links Empfehlungscode ABCD2345");
  assert.equal(await page.locator("#adm-sp-links-inactive").count(), 0, "aktive Links ohne Einschränkungshinweis");

  // „Nächster Schritt“ öffnet den Bereich und setzt den Fokus auf seinen Kopf.
  await page.locator("#adm-sp-billing-card > summary").click();
  await page.waitForFunction(() => document.getElementById("adm-sp-billing-card")?.open === false);
  await page.locator("#adm-sp-next-action").click();
  await page.waitForFunction(() => document.getElementById("adm-sp-billing-card")?.open === true);
  assert.equal(await page.evaluate(() => document.activeElement?.parentElement?.id), "adm-sp-billing-card");

  // Formular: eingeklappt, beim Öffnen mit der aktuell gültigen Version vorbelegt — „Gültig ab“ bewusst leer.
  await bereich(page, "adm-sp-rates-card");
  assert.equal(await page.locator("#adm-sp-rates-base").isVisible(), false, "Satzformular ohne Öffnen sichtbar");
  await bereich(page, "adm-sp-rates-new");
  assert.deepEqual(await Promise.all(["#adm-sp-rates-base", "#adm-sp-rates-l1", "#adm-sp-rates-l2", "#adm-sp-rates-from"].map((s) => page.inputValue(s))),
    ["20,00", "5,00", "2,50", ""]);
  assert.match(await page.locator("#adm-sp-rates-effect").innerText(), /^Vorbelegt mit den aktuell gültigen Sätzen\. Die neue Version gilt ab dem gewählten Tag\./);
  // Ohne bewusst gewähltes Datum kein Dialog und kein Request.
  await page.locator("#adm-sp-rates-submit").click();
  await page.locator("#adm-sp-rates-card .field-error").first().waitFor({ state: "visible" });
  assert.equal(await page.locator('[role="dialog"]').count(), 0);

  // „Aktualisieren“: Detail und jeder selbst ladende Bereich werden neu geladen — kein veralteter Stand bleibt stehen.
  const vorher = { ...state.zugriffe };
  state.rates6 = { id: 2, validFrom: "2026-10-07", basePercent: "22.00", level1Percent: "5.00", level2Percent: "2.50", reason: null, createdAt: "2026-10-07T09:00:00Z" };
  state.billing6 = { ...state.billing6, status: "confirmed", billingDetails: { ...state.billing6.billingDetails, reviewedAt: "2026-10-07T09:30:00.000Z" } };
  state.credit6 = state.credit6.map((c) => ({ ...c, payoutStatus: "paid", paidOn: "2026-10-06" }));
  await page.locator("#adm-sp-refresh").click();
  await page.waitForFunction(() => document.querySelector("#adm-sp-overview-billing")?.textContent === "Bestätigt");
  await page.waitForFunction(() => document.querySelector("#adm-sp-next-step")?.dataset.step === "none");
  await page.waitForFunction(() => /22,00/.test(document.querySelector("#adm-sp-overview-rates")?.textContent || ""));
  for (const k of Object.keys(vorher)) assert.ok(state.zugriffe[k] > vorher[k], `${k} wurde nicht neu geladen (${vorher[k]} → ${state.zugriffe[k]})`);
  assert.equal(await text("adm-sp-overview-rates"), "Grundprovision 22,00 % · Ebene 1: 5,00 % · Ebene 2: 2,50 %");
  assert.equal(await text("adm-sp-overview-credit-notes"), "1 Gutschrift");
  assert.match(await text("adm-sp-next-step"), /Derzeit ist nichts zu erledigen\./);
  assert.equal(await page.locator("#adm-sp-billing-status").innerText(), "Bestätigt");
  assert.equal(await page.locator("#adm-sp-billing-confirm").count(), 0, "keine Prüfaktion für bestätigte Daten");
  await page.close();
});

test("15 — UX-Paket 4: 390 px — kein seitliches Scrollen, Tabellen als Karten, 44-px-Ziele", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.clock.setFixedTime(new Date("2026-10-07T10:00:00"));
  await setup(page, { voll: true });
  await page.goto(`${BASE}/admin/partners/6`, { waitUntil: "networkidle" });
  await page.locator("#adm-sp-overview-card").waitFor({ state: "visible" });
  for (const id of ["adm-sp-customers-card", "adm-sp-team-card", "adm-sp-assessments-card", "adm-sp-commissions-card",
    "adm-sp-credit-notes-card", "adm-sp-rates-card"]) {
    await bereich(page, id);
  }
  await page.locator("#adm-sp-cn-table").waitFor({ state: "visible" });
  const breite = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(breite <= 390, `die Seite scrollt seitlich: ${breite}`);

  // Sichtbar heißt checkVisibility(): der Inhalt eines geschlossenen <details> hat in
  // Chromium Layout (offsetParent und Maße), ist aber nicht zu sehen.
  const tabellen = await page.$$eval(".adm-sp-cardtable", (ts) => ts.filter((t) => t.checkVisibility()).map((t) => {
    const tr = t.querySelector("tbody tr");
    const td = tr ? tr.querySelector("td[data-label]") : null;
    // Diagnose für den Fehlerfall: welche Elemente über den rechten Rand ragen.
    const rand = t.getBoundingClientRect().right;
    const zuBreit = [...t.querySelectorAll("tbody *")].filter((e) => e.getBoundingClientRect().right > rand + 1)
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}+${Math.round(e.getBoundingClientRect().right - rand)}`).slice(0, 6);
    return { id: t.closest("details")?.id, quer: t.scrollWidth - t.clientWidth, zeile: tr ? getComputedStyle(tr).display : null,
      kopf: getComputedStyle(t.querySelector("thead")).position, zuBreit,
      label: td ? getComputedStyle(td, "::before").content : null, erwartet: td ? JSON.stringify(td.dataset.label) : null };
  }));
  assert.equal(tabellen.length, 5, `sichtbare Tabellen: ${JSON.stringify(tabellen.map((t) => t.id))}`);
  for (const t of tabellen) {
    assert.ok(t.quer <= 1, `${t.id}: Tabelle scrollt seitlich (${t.quer} px): ${t.zuBreit.join(", ")}`);
    assert.equal(t.zeile, "block", `${t.id}: die Zeile ist keine Karte`);
    assert.equal(t.kopf, "absolute", `${t.id}: der Tabellenkopf steht sichtbar über den Karten`);
    assert.equal(t.label, t.erwartet, `${t.id}: die Zelle trägt ihre Spaltenbeschriftung nicht`);
  }
  // Die Aktionen der Kartenzeilen bleiben erreichbar und groß genug.
  const aktion = await page.locator("#adm-sp-cn-payout-31").boundingBox();
  assert.ok(aktion && aktion.height >= 44 && aktion.x >= 0 && aktion.x + aktion.width <= 390, `Auszahlungsknopf: ${JSON.stringify(aktion)}`);
  // Bereichsköpfe und eingeklappte Teile sind 44-px-Ziele.
  const ziele = await page.$$eval("details.adm-disclosure > summary, details.adm-sp-fold > summary", (ss) =>
    ss.filter((s) => s.checkVisibility()).map((s) => ({ text: s.textContent.trim().slice(0, 40), h: Math.round(s.getBoundingClientRect().height) })));
  assert.ok(ziele.length >= 10, `zu wenige Ziele gemessen: ${ziele.length}`);
  for (const z of ziele) assert.ok(z.h >= 44, `Touch-Ziel unter 44 px: ${z.text} (${z.h} px)`);
  await page.close();
});
