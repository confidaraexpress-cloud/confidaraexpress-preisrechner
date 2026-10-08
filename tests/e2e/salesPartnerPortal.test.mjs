// E2E: Partnerportal und Rollenweiche.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route). Der
// Kernvertrag: ein Vertriebspartner ruft keinen Kundenendpunkt (/kunde/*) auf —
// der Server antwortete dort mit 403, und das zentrale apiFetch meldete ab.
// Freigegeben sind laut Backendvertrag nur die Kontoendpunkte: PATCH
// /kunde/password und die E-Mail-Änderung. Abgefangen werden genau die Pfade,
// die der Client tatsächlich aufruft (/kunde/password, /kunde/email-change …);
// jeder andere Request auf /kunde/* wird mitgezählt und muss 0 bleiben.
//   1. Login als Partner → /partner, Kennzahlen sichtbar.
//   2. Partner öffnet /dashboard, /booking, /calculator, / und eine unbekannte
//      Adresse → jeweils /partner, ohne Abmeldung.
//   3. Bereiche: Kunden, Provisionen (Monatswechsel sendet den Monat), Team.
//   4. „Mein Team“ ist immer da (UX-Paket 1): ohne Einträge mit Leerzustand,
//      bei einem Ladefehler mit Fehlermeldung — nie unbemerkt verschwunden.
//   5. Ein Kunde auf /partner landet im Kundenbereich.
//   7. Konto: Passwortänderung (PATCH /kunde/password); ein 401 mit falschem
//      Passwort meldet nicht ab; kein anderer /kunde/*-Aufruf.
//   8. Pre-Live-Testkonto: dauerhafter Hinweis über allen Bereichen.
//   9. Login eines Testkontos bei abgeschaltetem Testmodus (403
//      ACCOUNT_PRELIVE_TEST_INACTIVE): der Text des Servers, kein Portal.
//  10. Link kopieren (UX-Paket 1): „Kopiert“ erst nach echtem Kopieren; scheitert
//      das Kopieren, steht eine verständliche Meldung da und der Link ist markiert.
//  11. Startseite (UX-Paket 3): Empfehlungslinks nur einsatzbereit, wenn sie wirken
//      (Kundenzuordnung aus, Registrierung geschlossen, Testkonto, inaktives Konto).
//  12. Startseite (UX-Paket 3): erster Besuch — die Links stehen vorn; ohne
//      Monatsbewertung Striche statt Nullen.
//  13. Startseite (UX-Paket 3): 390 px — alle sechs Bereiche ohne seitliches
//      Scrollen, Kundenlink früh erreichbar und in voller Breite.
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
  // Stimmig zur Zusammensetzung (UX-Paket 3): 15 + 5 + 7,5 = 27,5 ohne Obergrenze
  // (vorher 20 % Grundprovision bei 27,5 % ohne Obergrenze — ein Widerspruch im Testfall).
  rates: { basePercent: "15.00", level1Percent: "5.00", level2Percent: "2.50" },
  levels: { month: "2026-10", measuredMonth: "2026-09", activeCustomers: 12, shippedPackages: 1530,
    customerLevel: 2, customerBonusPercent: "5.00", packageLevel: 3, packageBonusPercent: "7.50",
    ownRatePercent: "27.50", capApplied: false },
  currentMonth: { month: "2026-10", commissionCents: 123456, payableCents: 45600, shipments: 80, packages: 95 },
  customers: { assigned: 14 },
};
// Öffentliche Konfiguration des Programms (wie salesPartnerRegistration.test.mjs):
// Registrierung produktiv offen, Kundenzuordnung eingeschaltet.
const CONFIG_OFFEN = {
  registrationEnabled: true, registrationMode: "production", referralsEnabled: true, referralRetentionDays: 30,
  agreementVersion: "2026-10",
  agreement: { version: "2026-10", effectiveFrom: "2026-10-01", effectiveTo: null,
    documentPath: "/api/legal/sales_partner_agreement/2026-10" },
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

// Antworten des Passwortendpunkts in Aufrufreihenfolge (Standard: Erfolg).
async function setup(page, { user = PARTNER, team = TEAM, token = true, passwordResponses = [], overview = OVERVIEW, login = null,
  config = CONFIG_OFFEN } = {}) {
  const state = { kunde: [], commissionMonths: [], partnerCalls: [], other: [], password: [], emailChange: [], configCalls: 0 };
  const pwAntworten = [...passwordResponses];
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    // Freigegebene Kontoendpunkte — exakt die Pfade des Clients (api/client.js,
    // PasswordChangeSection.jsx). Der Body wird nur strukturell geprüft.
    if (p.endsWith("/kunde/password") && req.method() === "PATCH") {
      state.password.push(Object.keys(req.postDataJSON() || {}).sort());
      const [status, body] = pwAntworten.shift() || [200, { message: "Passwort geändert" }];
      return json(body, status);
    }
    if (/\/kunde\/email-change(\/resend)?$/.test(p)) {
      state.emailChange.push(`${req.method()} ${p}`);
      return json({ ok: true });
    }
    if (p.includes("/kunde/") || p.endsWith("/kunde")) {
      state.kunde.push(p);
      // Wie der echte Server bei einem Partner: verboten.
      if (user.role === "sales_partner") return json({ error: "Nicht erlaubt", code: "ROLE_NOT_PERMITTED" }, 403);
      return json({});
    }
    if (p.endsWith("/login") && req.method() === "POST") return login ? json(login[1], login[0]) : json({ token: "e2e-partner-token" });
    if (p.endsWith("/kundenbereich")) {
      return json({ message: "OK", user, pendingEmailChange: null, companyLogo: null, billingCapabilities: null,
        ...(user.role === "sales_partner" ? { salesPartner: { status: "active" } } : {}) });
    }
    if (p.startsWith("/api/sales-partner/me/")) state.partnerCalls.push(p + url.search);
    if (p.endsWith("/api/sales-partner/me/overview")) return json(overview);
    if (p.endsWith("/api/sales-partner/me/team")) return team === "fehler" ? json({ error: "Fehler" }, 500) : json(team);
    if (p.endsWith("/api/sales-partner/me/customers")) return json(CUSTOMERS);
    if (p.endsWith("/api/sales-partner/me/commissions")) {
      const month = url.searchParams.get("month");
      state.commissionMonths.push(month);
      return json(commissions(month || "2026-10"));
    }
    // Öffentliche Programmkonfiguration (UX-Paket 3: ob die Links wirken).
    if (p.endsWith("/api/sales-partner/public-config")) {
      state.configCalls += 1;
      return config === "fehler" ? json({ error: "Fehler" }, 500) : json(config);
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
  assert.equal(await page.locator("#spp-prelive-banner").count(), 0, "kein Testhinweis für ein echtes Konto");
  assert.deepEqual(state.kunde, [], `Kundenendpunkte aufgerufen: ${state.kunde.join(", ")}`);

  // UX-Paket 3: genau vier Kennzahlen in fester Reihenfolge, jede mit ihrem Monat.
  assert.deepEqual(await page.locator(".spp-kpi").evaluateAll((els) => els.map((e) => e.dataset.kpi)),
    ["customers", "packages", "ownRate", "earned"]);
  const band = await page.locator(".spp-kpis").innerText();
  for (const t of ["Meine Kunden", "14", "aktuell zugeordnet", "Aktiv im September: 12", "Pakete im September", "1.530",
    "zählen für Ihr Paket-Level im Oktober", "Meine Provision", "Ihr Satz im Oktober", "Im Oktober verdient", "davon auszahlbar"]) {
    assert.ok(band.includes(t), `Kennzahlen ohne „${t}“`);
  }
  // Die Hauptaktion: Kundenlink (primär) und Partnerlink — mit Zusage erst, wenn die Konfiguration sie trägt.
  await page.locator("#spp-link-customer", { hasText: "werden Ihnen zugeordnet" }).waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-link-customer button.btn-primary", { hasText: "Kundenlink kopieren" }).count(), 1);
  assert.equal(await page.locator("#spp-link-partner button.btn-outline", { hasText: "Partnerlink kopieren" }).count(), 1);
  // Der technische Empfehlungscode steht nicht in der Übersicht (Betreiberentscheidung).
  assert.doesNotMatch(await page.locator("#spp-tabpanel").innerText(), /Empfehlungscode/);
  // Zusammensetzung: drei Bestandteile, der Satz vom Server, ohne Obergrenze kein Grenzhinweis.
  const teile = await page.locator("#spp-composition .spp-compose-row").evaluateAll((els) =>
    els.map((e) => [e.querySelector("dt").textContent.trim(), e.querySelector("dd").textContent.trim()]));
  assert.deepEqual(teile, [["Grundprovision", "15,00 %"], ["Kundenbonus · Level 2", "+5,00 %"],
    ["Paketbonus · Level 3", "+7,50 %"], ["Ihr Satz im Oktober", "27,50 %"]]);
  assert.equal(await page.locator("#spp-cap-note").count(), 0);
  // Geldbegriffe aufklappbar: vier getrennte Stufen.
  await page.locator("#spp-money-terms summary").click();
  assert.deepEqual(await page.locator("#spp-money-terms dt").allInnerTexts(), ["Verdient", "Auszahlbar", "Abgerechnet", "Ausgezahlt"]);
  // Reihenfolge: erst die Kennzahlen, direkt danach die Links.
  const [kpiTop, linksTop] = await page.evaluate(() => ["#spp-kpi-section", "#spp-links"]
    .map((s) => document.querySelector(s).getBoundingClientRect().top));
  assert.ok(kpiTop < linksTop, "die Links stehen nicht nach den Kennzahlen");
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

test("4 — „Mein Team“ ist immer da: ohne Einträge mit Leerzustand, bei einem Ladefehler mit Fehlermeldung", async () => {
  // Bewusste Ankeränderung (UX-Paket 1, Betreiberentscheidung): früher gab es ohne
  // Teameinträge keinen Teambereich, und ein Ladefehler ließ ihn still verschwinden.
  const page = await browser.newPage();
  await setup(page, { team: TEAM_LEER });
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-tab-overview").waitFor({ state: "visible" });
  assert.equal(await page.locator('[role="tab"]').count(), 6, "Übersicht, Kunden, Provisionen, Abrechnungen, Team, Konto");
  assert.equal(await page.locator("#spp-tab-credit-notes").count(), 1);
  assert.equal(await page.locator("#spp-tab-account").count(), 1);
  await page.locator("#spp-tab-team").click();
  await page.locator("#spp-team-1").waitFor({ state: "visible" });
  assert.match(await page.locator("#spp-tabpanel").innerText(), /Auf dieser Ebene gibt es noch keine Vertriebspartner\./);
  await page.close();

  const fehler = await browser.newPage();
  await setup(fehler, { team: "fehler" });
  await fehler.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await fehler.locator("#spp-tab-team").waitFor({ state: "visible" });
  await fehler.locator("#spp-tab-team").click();
  await fehler.locator("#spp-tabpanel [role=\"alert\"]").waitFor({ state: "visible" });
  assert.match(await fehler.locator("#spp-tabpanel").innerText(), /Ihr Team konnte nicht geladen werden\./);
  assert.equal(await fehler.locator("#spp-tabpanel button", { hasText: "Erneut versuchen" }).count(), 1);
  await fehler.close();
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

test("7 — Konto: Passwortänderung, ein falsches Passwort meldet nicht ab, keine andere Kundenroute", async () => {
  const page = await browser.newPage();
  const state = await setup(page, {
    passwordResponses: [
      [401, { error: "Das aktuelle Passwort ist falsch.", code: "CURRENT_PASSWORD_INVALID" }],
      [200, { message: "Passwort wurde geändert." }],
    ],
  });
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-tab-account").click();
  await page.locator("#spp-account").waitFor({ state: "visible" });
  const konto = await page.locator("#spp-account").innerText();
  assert.match(konto, /Petra Partner/);
  assert.match(konto, /Vertrieb Süd GmbH/);
  assert.match(konto, /petra@partner-vertrieb\.de/);
  assert.equal(await page.getByRole("button", { name: "E-Mail-Adresse ändern" }).count(), 1, "E-Mail-Änderung fehlt");

  // Formular öffnen: der Fokus liegt im ersten Feld (Verhalten der Kontoeinstellungen).
  await page.getByRole("button", { name: "Passwort ändern" }).click();
  await page.locator("#pf-pw-current").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => document.activeElement?.id), "pf-pw-current");

  // 1. Versuch: falsches aktuelles Passwort → Feldmeldung, KEINE Abmeldung.
  await page.fill("#pf-pw-current", "FalschesPasswort1");
  await page.fill("#pf-pw-new", "NeuesSicheresPasswort2026");
  await page.fill("#pf-pw-confirm", "NeuesSicheresPasswort2026");
  await page.locator(".profile-password-form .btn-primary").click();
  await page.locator(".profile-password-form").getByText("Das aktuelle Passwort ist nicht korrekt.").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), "e2e-partner-token", "der Partner wurde abgemeldet");
  assert.equal(pfad(page), "/partner");

  // 2. Versuch: korrekt → Quittung, Formular geschlossen.
  await page.fill("#pf-pw-current", "AltesPasswort2026");
  await page.locator(".profile-password-form .btn-primary").click();
  await page.getByText("Passwort erfolgreich geändert.").waitFor({ state: "visible" });
  assert.equal(await page.locator("#pf-pw-current").count(), 0, "das Formular bleibt nach dem Erfolg offen");

  assert.equal(state.password.length, 2);
  assert.deepEqual(state.password[1], ["currentPassword", "newPassword", "newPasswordConfirm"]);
  assert.deepEqual(state.kunde, [], `andere Kundenendpunkte aufgerufen: ${state.kunde.join(", ")}`);
  assert.deepEqual(state.emailChange, [], "ohne Nutzeraktion darf keine E-Mail-Änderung angestoßen werden");
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), "e2e-partner-token");
  await page.close();
});

test("8 — Pre-Live-Testkonto: dauerhafter Hinweis über allen Bereichen", async () => {
  const page = await browser.newPage();
  const state = await setup(page, { overview: { ...OVERVIEW, preliveTest: true } });
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-prelive-banner").waitFor({ state: "visible" });
  const text = "Pre-Live-Testkonto – keine echten Provisionen, Gutschriften oder Auszahlungen.";
  assert.equal(await page.locator("#spp-prelive-banner").innerText(), text);
  // Der Hinweis steht über den Bereichen und bleibt beim Wechsel stehen.
  const reihenfolge = await page.evaluate(() => {
    const hinweis = document.querySelector("#spp-prelive-banner");
    const tabs = document.querySelector('[role="tablist"]');
    return !!(hinweis.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  assert.equal(reihenfolge, true, "Hinweis vor den Bereichen");
  for (const bereich of ["customers", "commissions", "account"]) {
    await page.locator(`#spp-tab-${bereich}`).click();
    await page.locator(`#spp-tab-${bereich}[aria-selected="true"]`).waitFor();
    assert.equal(await page.locator("#spp-prelive-banner").innerText(), text, `Hinweis fehlt im Bereich ${bereich}`);
  }
  assert.deepEqual(state.kunde, []);
  await page.close();
});

test("9 — Login eines Testkontos bei abgeschaltetem Testmodus: Text des Servers, kein Portal", async () => {
  const page = await browser.newPage();
  await setup(page, { token: false,
    login: [403, { error: "Dieses Testkonto ist derzeit nicht aktiv.", code: "ACCOUNT_PRELIVE_TEST_INACTIVE" }] });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#auth-email", "pia@test.example");
  await page.fill("#auth-password", "EinSicheresPasswort2026");
  await page.locator("button.auth-cta").click();
  await page.locator(".auth-alert-error").waitFor({ state: "visible" });
  assert.equal(await page.locator(".auth-alert-error").innerText(), "Dieses Testkonto ist derzeit nicht aktiv.");
  assert.equal(pfad(page), "/login");
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), null);
  await page.close();
});

test("10 — Link kopieren: „Kopiert“ erst nach echtem Kopieren; Fehlschlag mit Meldung und markiertem Link", async () => {
  // Erfolg: mit Schreibrecht auf die Zwischenablage landet genau der Link dort.
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await setup(page);
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-link-customer button", { hasText: "Kopieren" }).click();
  await page.waitForFunction(() => document.querySelector('#spp-link-customer [role="status"]')?.textContent === "Kopiert");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), OVERVIEW.links.customer);
  await ctx.close();

  // Fehlschlag: Clipboard-API lehnt ab, der ältere Weg kopiert nicht — keine falsche Erfolgsmeldung.
  const fehler = await browser.newPage();
  await setup(fehler);
  await fehler.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("NotAllowedError")) },
    });
    document.execCommand = () => false;
  });
  await fehler.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await fehler.locator("#spp-link-partner button", { hasText: "Kopieren" }).click();
  const status = fehler.locator('#spp-link-partner [role="status"]');
  await fehler.waitForFunction(() => /Kopieren nicht möglich/.test(document.querySelector('#spp-link-partner [role="status"]')?.textContent || ""));
  assert.equal(await status.innerText(), "Kopieren nicht möglich – der Text ist markiert. Bitte manuell kopieren.");
  assert.doesNotMatch(await status.innerText(), /^Kopiert$/);
  assert.equal(await fehler.evaluate(() => String(window.getSelection())), OVERVIEW.links.partner, "der Link ist zum manuellen Kopieren markiert");
  await fehler.close();
});

test("11 — Empfehlungslinks nur einsatzbereit, wenn sie wirken (UX-Paket 3)", async () => {
  // Kundenzuordnung aus: kein Kopierknopf, keine Adresse, ein klarer Satz.
  let page = await browser.newPage();
  let state = await setup(page, { config: { ...CONFIG_OFFEN, referralsEnabled: false } });
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-link-customer", { hasText: "Die Zuordnung neuer Kunden über Empfehlungslinks ist derzeit nicht aktiv." })
    .waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-link-customer button").count(), 0, "Knopf für einen Link, der nicht wirkt");
  assert.doesNotMatch(await page.locator("#spp-link-customer").innerText(), /register\?ref=/);
  assert.equal(await page.locator("#spp-link-partner button", { hasText: "Partnerlink kopieren" }).count(), 1);
  assert.equal(state.configCalls, 1, "die Konfiguration wird einmal je Seite geladen");
  await page.close();

  // Registrierung geschlossen: kein Partnerlink zum Kopieren.
  page = await browser.newPage();
  await setup(page, { config: { ...CONFIG_OFFEN, registrationEnabled: false, registrationMode: "closed", agreementVersion: null, agreement: null } });
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-link-partner", { hasText: "Die Registrierung für neue Vertriebspartner ist derzeit nicht geöffnet." })
    .waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-link-partner button").count(), 0);
  assert.equal(await page.locator("#spp-link-customer button", { hasText: "Kundenlink kopieren" }).count(), 1);
  await page.close();

  // Konfiguration nicht ladbar: Links bleiben nutzbar, aber ohne Zusage.
  page = await browser.newPage();
  await setup(page, { config: "fehler" });
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-link-customer button", { hasText: "Kundenlink kopieren" }).waitFor({ state: "visible" });
  assert.doesNotMatch(await page.locator("#spp-links").innerText(), /werden Ihnen zugeordnet|nach der Freigabe/);
  await page.close();

  // Inaktives Konto: Folgen im Hinweis, ein Satz statt der Links.
  page = await browser.newPage();
  await setup(page, { overview: { ...OVERVIEW, partner: { ...OVERVIEW.partner, status: "inactive" },
    links: { code: null, customer: null, partner: null } } });
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-links-notice").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-links-notice").innerText(), "Ihre Empfehlungslinks gelten nur bei aktivem Partnerkonto.");
  assert.equal(await page.locator("#spp-links button").count(), 0);
  assert.match(await page.locator(".spp-notice", { hasText: "inaktiv" }).innerText(), /keine neuen Provisionen/);
  await page.close();

  // Testkonto: der Kundenlink ordnet nie zu; der Partnerlink wirkt nur im (hier geschlossenen) Testweg.
  page = await browser.newPage();
  await setup(page, { overview: { ...OVERVIEW, preliveTest: true } });
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-link-customer", { hasText: "Testkonto: Über den Kundenlink werden keine Kunden zugeordnet." })
    .waitFor({ state: "visible" });
  assert.match(await page.locator("#spp-link-partner").innerText(), /Pre-Live-Testweg/);
  assert.equal(await page.locator("#spp-links button").count(), 0);
  await page.close();
});

test("12 — erster Besuch: die Links stehen vorn; ohne Monatsbewertung Striche statt Nullen (UX-Paket 3)", async () => {
  const page = await browser.newPage();
  await setup(page, { overview: { ...OVERVIEW, levels: null, customers: { assigned: 0 },
    currentMonth: { month: "2026-10", commissionCents: 0, payableCents: 0, shipments: 0, packages: 0 } } });
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-start-hint").waitFor({ state: "visible" });
  assert.equal(await page.locator("#spp-start-hint").innerText(), "So starten Sie: Teilen Sie Ihren Kundenlink mit Geschäftskunden.");
  const [linksTop, kpiTop] = await page.evaluate(() => ["#spp-links", "#spp-kpi-section"]
    .map((s) => document.querySelector(s).getBoundingClientRect().top));
  assert.ok(linksTop < kpiTop, "beim ersten Besuch stehen die Links nicht vorn");
  // Echte Nullen bleiben 0; Unbekanntes ist ein Strich mit Hinweis.
  const wert = (k) => page.locator(`[data-kpi="${k}"] .spp-kpi-value`).innerText();
  assert.equal(await wert("customers"), "0");
  assert.equal(await wert("packages"), "—");
  assert.equal(await wert("ownRate"), "—");
  assert.match(await wert("earned"), /^0,00\s€$/);
  assert.match(await page.locator('[data-kpi="packages"]').innerText(), /Noch keine Monatsbewertung/);
  assert.match(await page.locator("#spp-level-basis").innerText(), /^Noch keine Monatsbewertung/);
  await page.close();
});

test("13 — 390 px: alle sechs Bereiche ohne seitliches Scrollen, Kundenlink früh und in voller Breite (UX-Paket 3)", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setup(page);
  await page.goto(`${BASE}/partner`, { waitUntil: "networkidle" });
  await page.locator("#spp-link-customer button").waitFor({ state: "visible" });
  const tabs = await page.locator('[role="tab"]').evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { text: e.textContent.trim(), links: r.left, rechts: r.right, hoehe: r.height };
  }));
  assert.equal(tabs.length, 6);
  for (const t of tabs) {
    assert.ok(t.links >= 0 && t.rechts <= 390, `„${t.text}“ liegt außerhalb des Bildschirms (${t.links}–${t.rechts})`);
    assert.ok(t.hoehe >= 44, `„${t.text}“ ist kleiner als 44 px`);
  }
  const leiste = await page.locator('[role="tablist"]').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  assert.ok(leiste.scroll <= leiste.client + 1, `die Tabzeile scrollt seitlich (${leiste.scroll} > ${leiste.client})`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, "die Seite scrollt seitlich");
  // Kennzahlen 2 × 2, die Hauptaktion in voller Breite und früh erreichbar.
  const kpi = await page.locator(".spp-kpi").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  assert.equal(kpi[0], kpi[1], "die Kennzahlen stehen nicht zu zweit nebeneinander");
  const knopf = await page.locator("#spp-link-customer button").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const karte = el.closest(".spp-card").getBoundingClientRect();
    return { breite: r.width, karte: karte.width, oben: r.top + window.scrollY, hoehe: r.height };
  });
  assert.ok(knopf.breite >= knopf.karte - 64, `der Kopierknopf ist nicht in voller Breite (${knopf.breite} von ${knopf.karte})`);
  assert.ok(knopf.hoehe >= 44, "der Kopierknopf ist kleiner als 44 px");
  assert.ok(knopf.oben < 844 * 1.5, `der Kundenlink liegt zu tief (${Math.round(knopf.oben)} px)`);
  await page.close();
});
