// E2E: Admin · Vertriebspartner · Pre-Live-Testmodus (/admin/partners/prelive).
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route); die Uhr
// steht auf dem 07.10.2026. Es wird kein Konto, keine Sendung, keine Mail und
// keine Löschung echt ausgelöst. Geprüft wird:
//   1. Eintrag in der Partnerverwaltung nur bei `enabled: true`; ohne Modus
//      zeigt die Seite nur den Hinweis und ruft keinen Testendpunkt auf.
//   2. Seite: Warnhinweis mit den Zusagen des Testbetriebs, Stand und Zählung
//      (technische Angaben eingeklappt), Testablauf in neun Schritten
//      (UX-Paket 5) mit dem öffentlichen Registrierungsweg als Hauptweg.
//   3. Testpartner anlegen (Vertragsbody, Link zur normalen Freigabe) und
//      Passwort-Link (einmal sichtbar, Kopierknopf, Hinweis, nie im Speicher).
//   4. Testkunde anlegen: Zuordnung über Testpartner mit zurückliegendem Datum,
//      über Empfehlungscode; ein unbekannter Code steht am Feld.
//   5. Testsendung anlegen (Euro → Cent, Basisvorschau), als bezahlt markieren
//      und Versand belegen (bestehende Versandnachweisroute).
//   6. Schnellszenarien: Vorgaben aus den Serverregeln mit Lage zur Schwelle,
//      Vertragsbody, Ergebnis; Team-Szenario mit Links; Feldfehler.
//   7. Provisionslauf: Zahlen und deutsche Gründe; „gerade aktiv“.
//   8. E-Mail-Vorschau ausschließlich im iframe mit leerem sandbox (srcdoc),
//      Skripte der Mail laufen nicht.
//   9. Bereinigung: Probelauf, Blockaden sperren, Bestätigungsdialog, Token im
//      Body; ein veralteter Stand lädt den Probelauf neu.
//  10. Registrierungsweg (UX-Paket 5): ist die öffentliche Registrierung
//      produktiv oder unbekannt, zeigt der erste Schritt keinen Link, sondern
//      warnt bzw. sagt es — der Weg kommt allein aus der Konfiguration.
//  11. „Testgutschrift prüfen“ führt zu den Gutschriften mit vorbelegtem
//      Pre-Live-Testlauf (scope=test an der Vorschau).
//
// Formulare und Zusatzwerkzeuge sind eingeklappt (UX-Paket 5): die Fälle öffnen
// sie wie ein Admin — über ihren Kopf oder über den Schritt des Testablaufs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5488, BASE = `http://127.0.0.1:${PORT}`;
const HEUTE = "2026-10-07T10:00:00";
const RESET_URL = "https://confidaraexpress.de/login?reset=e2e-einmal-token";

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

const PIA = { id: 41, name: "Pia Test", email: "pia@test.example", companyName: "Test Vertrieb A", status: "active",
  loginStatus: "approved", sponsorUserId: null, referralCode: "TESTAB23" };
const KUNDE = { id: 77, name: "Kai Kunde", companyName: "Testkunde GmbH", email: "kunde@test.example", partnerUserId: 41 };
const SENDUNG = { id: 9001, reference: "CE-TEST-9001", customerUserId: 77, customerCompanyName: "Testkunde GmbH", partnerUserId: 41,
  shipDate: "2026-09-15", packageCount: 3, customerNetCents: 2500, purchaseNetCents: 1840, basisCents: 660,
  evidence: null, paidAt: null, decision: null };

let server, browser;

// Öffentliche Konfiguration des Servers (UX-Paket 5): sie nennt den offenen
// Registrierungsweg. Standard: produktiv aus, Pre-Live-Testweg offen.
const KONFIG = {
  prelive_test: { registrationEnabled: false, registrationMode: "prelive_test", referralsEnabled: false,
    referralRetentionDays: 30, agreementVersion: null, agreement: null },
  production: { registrationEnabled: true, registrationMode: "production", referralsEnabled: true, referralRetentionDays: 30,
    agreementVersion: "1.0", agreement: { version: "1.0", title: "Vertriebspartnervereinbarung", effectiveFrom: "2026-10-01",
      documentPath: "/api/legal/sales_partner_agreement/1.0/document" } },
};

/** Zustandsbehafteter Backend-Mock. `antworten` überschreibt einzelne
 *  Endpunkte: Schlüssel → [status, body] oder Liste davon (der letzte bleibt).
 *  `registrierung`: "prelive_test" | "production" | "fehler" (500). */
async function setup(page, { enabled = true, antworten = {}, registrierung = "prelive_test" } = {}) {
  const state = {
    status: { enabled, mailAllowlistConfigured: false, backdatingGlobalAllowed: true,
      counts: enabled ? { partners: 1, customers: 1, shipments: 1, ledgerEntries: 0, creditNotes: 0 } : null },
    partners: [structuredClone(PIA)], customers: [structuredClone(KUNDE)], shipments: [structuredClone(SENDUNG)],
    posts: { partners: [], customers: [], shipments: [], paid: [], dispatch: [], scenarios: [], commission: 0, cleanup: [], pwlink: [] },
    statusCalls: 0, preliveCalls: [], mailQueries: [], shipmentQueries: [], cleanupGets: 0, other: [],
    configCalls: 0, previewQueries: [],
  };
  const warteschlange = Object.fromEntries(Object.entries(antworten).map(([k, v]) => [k, Array.isArray(v[0]) ? [...v] : [v]]));
  // Ein Eintrag mit Body null heißt: an dieser Stelle die Standardantwort des Mocks.
  const vorgabe = (key) => {
    const q = warteschlange[key];
    if (!q || q.length === 0) return null;
    const v = q.length > 1 ? q.shift() : q[0];
    return v && v[1] !== null ? v : null;
  };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const post = req.method() === "POST";
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/sales-partners") && !post) return json({ partners: [], total: 0, limit: 25, offset: 0 });
    if (p.endsWith("/admin/sales-partner-level-rules")) return json({ current: null, history: [], startDefaults: START });
    if (p.endsWith("/api/sales-partner/public-config")) {
      state.configCalls += 1;
      return registrierung === "fehler" ? json({ error: "Fehler" }, 500) : json(KONFIG[registrierung]);
    }
    // Gutschriften (Fall 11): die Vorschau des Testlaufs.
    if (p.endsWith("/admin/sales-partner-credit-notes/preview")) {
      state.previewQueries.push(url.search);
      return json({ month: "2026-09", cutoffAt: "2026-09-30T22:00:00.000Z", issuanceEnabled: true, globalBlockers: [], partners: [] });
    }

    if (p.includes("/admin/sales-partner-prelive/")) {
      const teil = p.split("/admin/sales-partner-prelive/")[1];
      state.preliveCalls.push(`${req.method()} ${teil}`);
      if (teil === "status") { state.statusCalls += 1; return json(state.status); }
      if (!state.status.enabled) return json({ error: "Pre-Live-Testmodus ist nicht aktiv.", code: "PRELIVE_TEST_MODE_DISABLED" }, 404);
      if (teil === "accounts") return json({ partners: state.partners, customers: state.customers });
      if (teil === "partners" && post) {
        const body = req.postDataJSON();
        state.posts.partners.push(body);
        const v = vorgabe("partners");
        if (v) return json(v[1], v[0]);
        const neu = { id: 42, name: body.name, email: body.email, companyName: body.companyName || null, status: "pending",
          loginStatus: "pending", sponsorUserId: body.sponsorUserId || null, referralCode: "TESTCD45" };
        state.partners.push(neu);
        return json({ partner: { id: 42, name: body.name, email: body.email, status: "pending", sponsorUserId: body.sponsorUserId || null } }, 201);
      }
      const link = teil.match(/^accounts\/(\d+)\/password-link$/);
      if (link && post) {
        state.posts.pwlink.push(Number(link[1]));
        return json({ resetUrl: RESET_URL, expiresAt: "2026-10-07T08:15:00.000Z" });
      }
      if (teil === "customers" && post) {
        const body = req.postDataJSON();
        state.posts.customers.push(body);
        const v = vorgabe("customers");
        if (v) return json(v[1], v[0]);
        const neu = { id: 78, name: body.name || null, companyName: body.companyName, email: body.email, partnerUserId: body.partnerUserId || (body.referralCode ? 41 : null) };
        state.customers.push(neu);
        const attribution = neu.partnerUserId ? { partnerUserId: neu.partnerUserId, validFrom: body.assignedSince || "2026-10-07" } : null;
        return json({ customer: { id: 78, companyName: body.companyName, email: body.email }, attribution }, 201);
      }
      if (teil === "shipments" && !post) {
        state.shipmentQueries.push(url.search);
        return json({ items: state.shipments, total: state.shipments.length });
      }
      if (teil === "shipments" && post) {
        const body = req.postDataJSON();
        state.posts.shipments.push(body);
        const neu = { id: 9002, reference: "CE-TEST-9002", customerUserId: body.customerUserId, customerCompanyName: "Testkunde GmbH",
          partnerUserId: 41, shipDate: body.shipDate, packageCount: body.packageCount, customerNetCents: body.customerNetCents,
          purchaseNetCents: body.purchaseNetCents, basisCents: body.customerNetCents - body.purchaseNetCents,
          evidence: body.dispatched ? { status: "dispatched", dispatchDate: body.shipDate } : null, paidAt: body.paidOn || null, decision: null };
        state.shipments.unshift(neu);
        return json({ shipment: neu }, 201);
      }
      const paid = teil.match(/^shipments\/(\d+)\/paid$/);
      if (paid && post) {
        const body = req.postDataJSON();
        state.posts.paid.push({ id: Number(paid[1]), ...body });
        const s = state.shipments.find((x) => x.id === Number(paid[1]));
        if (s) s.paidAt = body.paidOn;
        return json({ shipment: s });
      }
      if (teil === "scenarios" && post) {
        const body = req.postDataJSON();
        state.posts.scenarios.push(body);
        const v = vorgabe("scenarios");
        if (v) return json(v[1], v[0]);
        if (body.kind === "levels") return json({ created: { customers: body.activeCustomers, shipments: 12, packages: body.packages } }, 201);
        if (body.kind === "abc") return json({ partners: { a: 51, b: 52, c: 53 } }, 201);
        return json({ partnerIds: [61, 62] }, 201);
      }
      if (teil === "commission-run" && post) {
        state.posts.commission += 1;
        const v = vorgabe("commission");
        if (v) return json(v[1], v[0]);
        return json({ stats: { skippedTick: false, assessments: 2, decided: 5, accrued: 4, skipped: { assessment_not_due: 1, voellig_neu: 2 }, failed: 0 } });
      }
      if (teil === "mail-preview") {
        state.mailQueries.push(url.search);
        return json({ kind: url.searchParams.get("kind"), subject: "Willkommen als Vertriebspartner",
          recipient: "p***@test.example",
          html: "<!doctype html><html><body><h1 id=\"mail-h1\">Hallo Pia</h1><p>Ihr Zugang ist freigegeben.</p>"
            + "<script>document.body.setAttribute('data-skript', 'lief');</script>"
            + "<img src=\"x\" alt=\"\" onerror=\"document.body.setAttribute('data-onerror', 'lief')\"></body></html>" });
      }
      if (teil === "cleanup" && !post) {
        state.cleanupGets += 1;
        const v = vorgabe("cleanupGet");
        if (v) return json(v[1], v[0]);
        return json({ counts: { users: 6, shipments: 12, sales_partner_ledger: 7 }, blockers: [], confirmToken: `tok-${state.cleanupGets}`, nothingToDelete: false });
      }
      if (teil === "cleanup" && post) {
        const body = req.postDataJSON();
        state.posts.cleanup.push(body);
        const v = vorgabe("cleanupPost");
        if (v && v[0] !== 200) return json(v[1], v[0]);
        state.status.counts = { partners: 0, customers: 0, shipments: 0, ledgerEntries: 0, creditNotes: 0 };
        return json(v ? v[1] : { deleted: { users: 6, shipments: 12, sales_partner_ledger: 7 } });
      }
    }
    const ev = p.match(/\/admin\/shipments\/(\d+)\/dispatch-evidence$/);
    if (ev && post) {
      const body = req.postDataJSON();
      state.posts.dispatch.push({ id: Number(ev[1]), ...body });
      const s = state.shipments.find((x) => x.id === Number(ev[1]));
      if (s) s.evidence = { status: "dispatched", dispatchDate: body.dispatchDate };
      return json({ ok: true }, 201);
    }
    if (/\/admin\/sales-partners\/41\/credit-notes$/.test(p)) {
      return json({ creditNotes: [{ id: 8, number: "CE-TEST-PG26-0001", kind: "regular", periodMonth: "2026-09", issuedOn: "2026-10-01",
        netCents: 1000, taxCents: 0, grossCents: 1000, currency: "EUR", documentReady: true, payoutStatus: "open", isTest: true }] });
    }
    state.other.push(`${req.method()} ${p}`);
    return json({});
  });
  await page.clock.setFixedTime(new Date(HEUTE));
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return state;
}

async function zurSeite(page) {
  await page.goto(`${BASE}/admin/partners/prelive`, { waitUntil: "networkidle" });
  await page.locator("#adm-pl-warning").waitFor({ state: "visible" });
}

// Einen eingeklappten Bereich über seinen Kopf öffnen, wie ein Admin.
async function oeffnen(page, id) {
  const bereich = page.locator(`#${id}`);
  if (!(await bereich.evaluate((d) => d.open))) await page.locator(`#${id} > summary`).click();
  await page.waitForFunction((x) => document.getElementById(x)?.open === true, id);
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

test("1 — Eintrag nur bei enabled:true; ohne Modus nur der Hinweis, kein Testendpunkt", async () => {
  const aus = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const sAus = await setup(aus, { enabled: false });
  await aus.goto(`${BASE}/admin/partners`, { waitUntil: "networkidle" });
  await aus.locator("#adm-sp-credit-notes-link").waitFor({ state: "visible" });
  assert.ok(sAus.statusCalls >= 1, "der Stand wird abgefragt");
  assert.equal(await aus.locator("#adm-sp-prelive-link").count(), 0, "ohne Modus kein Eintrag");
  await aus.goto(`${BASE}/admin/partners/prelive`, { waitUntil: "networkidle" });
  await aus.locator("#adm-pl-disabled").waitFor({ state: "visible" });
  assert.match(await aus.locator("#adm-pl-disabled").innerText(), /nicht aktiv/);
  assert.equal(await aus.locator('[id^="adm-pl-"]:not(#adm-pl-disabled):not(#adm-pl-refresh)').count(), 0, "keine Testflächen ohne Modus");
  assert.deepEqual(sAus.preliveCalls.filter((c) => c !== "GET status"), [], "nur der Stand wird abgefragt");
  assert.equal(sAus.configCalls, 0, "ohne Modus auch kein Blick auf den Registrierungsweg");
  await aus.close();

  const an = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setup(an);
  await an.goto(`${BASE}/admin/partners`, { waitUntil: "networkidle" });
  await an.locator("#adm-sp-prelive-link").waitFor({ state: "visible" });
  await an.locator("#adm-sp-prelive-link").click();
  await an.waitForURL(`${BASE}/admin/partners/prelive`);
  await an.locator("#adm-pl-warning").waitFor({ state: "visible" });
  await an.close();
});

test("2 — Seite: Warnhinweis, Stand und Zählung; Testablauf mit dem öffentlichen Weg als Hauptweg", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await zurSeite(page);
  // Bewusste Ankeränderung (UX-Paket 5): der Hinweis nennt zusätzlich, was im Testbetrieb nie entsteht.
  assert.equal(await page.locator("#adm-pl-warning-title").innerText(),
    "Pre-Live-Testmodus aktiv – nur für interne Tests. Testdaten sind gekennzeichnet und werden vor dem Livegang bereinigt.");
  assert.equal(await page.locator("#adm-pl-safety").innerText(),
    "Es entsteht keine echte Buchung, Zahlung, Auszahlung oder steuerlich gültige Gutschrift. E-Mails an Testkonten werden zurückgehalten – außer an Adressen der internen Ausnahmeliste.");
  assert.match(await page.locator("#adm-pl-status-card").innerText(), /Testsendungen\s*1/);
  // Technische Angaben stehen eingeklappt in der Karte.
  assert.equal(await page.locator("#adm-pl-tech").evaluate((d) => d.open), false);
  await oeffnen(page, "adm-pl-tech");
  const stand = await page.locator("#adm-pl-status-card").innerText();
  assert.match(stand, /Aktiv/);
  assert.match(stand, /Nicht konfiguriert/);
  assert.match(stand, /Rückdatierung \(global\)\s*Erlaubt/);
  await page.locator("#adm-pl-partners").waitFor({ state: "visible" });
  assert.match(await page.locator("#adm-pl-partners").innerText(), /Test Vertrieb A/);
  assert.match(await page.locator("#adm-pl-customers").innerText(), /Testkunde GmbH[\s\S]*Test Vertrieb A/);
  // Bewusste Ankeränderung (UX-Paket 5): ein Testkunde meldet sich nie an — keine tote Aktion „Passwort-Link“.
  assert.equal(await page.locator("#adm-pl-customers button").count(), 0);
  assert.match(await page.locator("#adm-pl-customers-note").innerText(), /melden sich nicht an/);

  // Testablauf: neun Schritte in der Reihenfolge des Auftrags.
  const schritte = await page.locator("#adm-pl-flow .adm-pl-step-title").allInnerTexts();
  assert.deepEqual(schritte, ["Partner öffentlich registrieren", "Im Admin freigeben", "Als Partner anmelden", "Kundenlink benutzen",
    "Testkunden zuordnen", "Testsendung und Versandnachweis erzeugen", "Provisionen prüfen", "Testgutschrift prüfen",
    "Testdaten kontrolliert bereinigen"]);
  // Hauptweg: der Registrierungslink — nur, weil der Server den Testweg nennt.
  await page.locator('#adm-pl-register-state[data-mode="prelive_test"]').waitFor({ state: "visible" });
  assert.equal(state.configCalls, 1);
  assert.ok((await page.locator("#adm-pl-flow-register").innerText()).includes(`${BASE}/partner-registrieren`));
  assert.equal(await page.locator('#adm-pl-flow-register a[href*="partner-registrieren"]').count(), 0,
    "kein klickbarer Link im Adminfenster — er gehört in ein privates Fenster");
  assert.match(await page.locator("#adm-pl-flow-customerLink").innerText(), /ordnet einem Testpartner keinen Kunden zu/);
  assert.equal(await page.locator("#adm-pl-pending-none").innerText(), "Derzeit wartet kein Testantrag auf die Freigabe.");
  assert.equal(await page.getAttribute("#adm-pl-commission-partners a", "href"), "/admin/partners/41");
  // Formulare und Zusatzwerkzeuge sind eingeklappt.
  for (const id of ["adm-pl-customer-fold", "adm-pl-partner-fold", "adm-pl-shipment-fold", "adm-pl-scenarios-card", "adm-pl-mail-card"]) {
    assert.equal(await page.locator(`#${id}`).evaluate((d) => d.open), false, `${id} ist offen`);
  }
  // Jede Id genau einmal (Sprungziele und Beschriftungen hängen daran).
  const doppelt = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    return ids.filter((x, i) => ids.indexOf(x) !== i);
  });
  assert.deepEqual(doppelt, [], `doppelte Ids: ${doppelt.join(", ")}`);
  assert.deepEqual(state.other, [], `unerwartete Aufrufe: ${state.other.join(", ")}`);
  await page.close();
});

test("3 — Testpartner anlegen (Link zur normalen Freigabe) und Passwort-Link einmalig zeigen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await zurSeite(page);
  // Zusätzliches Testwerkzeug, eingeklappt (UX-Paket 5).
  await oeffnen(page, "adm-pl-partner-fold");
  assert.match(await page.locator("#adm-pl-partner-tool-note").innerText(), /Ersetzt nicht die öffentliche Registrierung/);
  // Pflichtfelder fehlen → kein Request.
  await page.locator("#adm-pl-partner-submit").click();
  await page.locator("#adm-pl-partner-form .field-error").first().waitFor({ state: "visible" });
  assert.equal(state.posts.partners.length, 0);

  await page.fill("#adm-pl-partner-name", "Paul Test");
  await page.fill("#adm-pl-partner-email", "paul@test.example");
  await page.selectOption("#adm-pl-partner-sponsor", "41");
  await page.locator("#adm-pl-partner-submit").click();
  await page.locator("#adm-pl-partner-message").waitFor({ state: "visible" });
  assert.deepEqual(state.posts.partners, [{ name: "Paul Test", email: "paul@test.example", sponsorUserId: 41 }]);
  assert.match(await page.locator("#adm-pl-partner-message").innerText(), /Testpartner „Paul Test“ wurde angelegt \(In Prüfung\)/);
  assert.equal(await page.getAttribute("#adm-pl-partner-created-link", "href"), "/admin/partners/42");
  await page.waitForFunction(() => document.querySelector("#adm-pl-partners")?.innerText.includes("Paul Test"));
  // Der neue Antrag erscheint im Schritt „Im Admin freigeben“ — mit Weg zur normalen Freigabe.
  await page.locator("#adm-pl-pending a").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-pl-pending a").innerText(), "Paul Test");
  assert.equal(await page.getAttribute("#adm-pl-pending a", "href"), "/admin/partners/42");

  await page.locator("#adm-pl-pwlink-41").click();
  await page.locator("#adm-pl-pwlink-box").waitFor({ state: "visible" });
  assert.deepEqual(state.posts.pwlink, [41]);
  const box = await page.locator("#adm-pl-pwlink-box").innerText();
  assert.match(box, /Passwort-Link für Test Vertrieb A/);
  assert.ok(box.includes(RESET_URL), "der Link steht genau einmal im Kasten");
  assert.equal(await page.locator("#adm-pl-pwlink-hint").innerText(),
    "Link gilt 15 Minuten, einmalig. Öffnen Sie ihn in einem privaten Fenster, um das Passwort des Testkontos zu setzen.");
  assert.equal(await page.locator("#adm-pl-pwlink-box button", { hasText: "Kopieren" }).count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "adm-pl-pwlink-box", "Fokus auf dem Link");
  assert.equal(await page.locator(`a[href="${RESET_URL}"]`).count(), 0, "kein klickbarer Link im Adminfenster");
  const gespeichert = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  assert.ok(!gespeichert.includes("e2e-einmal-token"), "der Link landet nie im Speicher");
  await page.locator("#adm-pl-pwlink-hide").click();
  assert.equal(await page.locator("#adm-pl-pwlink-box").count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "adm-pl-pwlink-41", "Fokus zurück am Auslöser");
  assert.ok(!(await page.locator("body").innerText()).includes(RESET_URL), "ausgeblendet heißt weg");
  await page.close();
});

test("4 — Testkunde: Zuordnung mit zurückliegendem Datum, über Code; unbekannter Code am Feld", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { antworten: { customers: [
    [201, null],
    [404, { error: "Code unbekannt", code: "REFERRAL_CODE_UNKNOWN" }],
  ] } });
  await zurSeite(page);
  // Der Schritt „Kundenlink benutzen“ öffnet das eingeklappte Formular und springt hin.
  await page.locator("#adm-pl-step-customer").click();
  await page.waitForFunction(() => document.getElementById("adm-pl-customer-fold")?.open === true);
  await page.waitForFunction(() => document.activeElement === document.querySelector("#adm-pl-customer-fold > summary"));
  assert.match(await page.locator("#adm-pl-customer-code-note").innerText(), /wie über seinen Kundenlink/);
  await page.fill("#adm-pl-customer-company", "Testkunde Zwei GmbH");
  await page.fill("#adm-pl-customer-email", "zwei@test.example");
  await page.locator("#adm-pl-customer-assign-partner").check();
  await page.selectOption("#adm-pl-customer-partner", "41");
  assert.equal(await page.getAttribute("#adm-pl-customer-since", "min"), null, "zurückliegende Daten erlaubt");
  await page.fill("#adm-pl-customer-since", "2026-03-01");
  await page.locator("#adm-pl-customer-submit").click();
  await page.locator("#adm-pl-customer-message").waitFor({ state: "visible" });
  assert.deepEqual(state.posts.customers[0], { companyName: "Testkunde Zwei GmbH", email: "zwei@test.example", partnerUserId: 41, assignedSince: "2026-03-01" });
  assert.equal(await page.locator("#adm-pl-customer-message").innerText(),
    "Testkunde „Testkunde Zwei GmbH“ wurde angelegt. Zugeordnet zu Test Vertrieb A ab 01.03.2026.");
  assert.equal(await page.getAttribute("#adm-pl-customer-created-link", "href"), "/admin/users/78");

  await page.fill("#adm-pl-customer-company", "Testkunde Drei GmbH");
  await page.fill("#adm-pl-customer-email", "drei@test.example");
  await page.locator("#adm-pl-customer-assign-code").check();
  await page.fill("#adm-pl-customer-code", "zzzz2345");
  await page.locator("#adm-pl-customer-submit").click();
  await page.waitForFunction(() => document.querySelector("#adm-pl-customer-message")?.innerText.includes("Empfehlungscode"));
  assert.deepEqual(state.posts.customers[1], { companyName: "Testkunde Drei GmbH", email: "drei@test.example", referralCode: "ZZZZ2345" });
  assert.equal(await page.getAttribute("#adm-pl-customer-code", "aria-invalid"), "true");
  assert.match(await page.locator("#adm-pl-customer-form").innerText(), /Zu diesem Empfehlungscode gibt es keinen Testpartner\./);
  assert.doesNotMatch(await page.locator("#adm-pl-accounts-card").innerText(), /REFERRAL_CODE_UNKNOWN/);
  await page.close();
});

test("5 — Testsendung: Euro → Cent, Basisvorschau; bezahlt markieren; Versand belegen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await zurSeite(page);
  // Bewusste Ankeränderung (UX-Paket 1): „Versanddienstleister“ statt „Provider“.
  assert.equal(await page.locator("#adm-pl-shipment-note").innerText(), "Testsendung: keine Buchung beim Versanddienstleister, kein Label.");
  await page.locator("#adm-pl-shipments").waitFor({ state: "visible" });
  assert.match(await page.locator('#adm-pl-shipments tr[data-shipment-id="9001"]').innerText(), /CE-TEST-9001[\s\S]*6,60\s€[\s\S]*Nachweis fehlt[\s\S]*Offen/);

  // Der Schritt „Testsendung und Versandnachweis erzeugen“ öffnet das Formular.
  await page.locator("#adm-pl-step-shipment").click();
  await page.waitForFunction(() => document.getElementById("adm-pl-shipment-fold")?.open === true);
  await page.selectOption("#adm-pl-shipment-customer", "77");
  await page.fill("#adm-pl-shipment-date", "2026-09-20");
  await page.fill("#adm-pl-shipment-packages", "4");
  await page.fill("#adm-pl-shipment-customer-net", "15");
  await page.fill("#adm-pl-shipment-purchase-net", "10,50");
  assert.match(await page.locator("#adm-pl-shipment-basis").innerText(), /^4,50\s€$/);
  await page.locator("#adm-pl-shipment-dispatched").check();
  await page.locator("#adm-pl-shipment-submit").click();
  await page.locator("#adm-pl-shipment-message").waitFor({ state: "visible" });
  assert.deepEqual(state.posts.shipments, [{ customerUserId: 77, shipDate: "2026-09-20", packageCount: 4,
    customerNetCents: 1500, purchaseNetCents: 1050, dispatched: true }]);
  assert.equal(await page.locator("#adm-pl-shipment-message").innerText(), "Testsendung CE-TEST-9002 wurde angelegt.");
  await page.locator('#adm-pl-shipments tr[data-shipment-id="9002"]').waitFor({ state: "visible" });

  await page.locator("#adm-pl-paid-9001").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  await page.fill("#adm-pl-paid-date", "2026-09-25");
  await page.locator("#adm-pl-paid-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.posts.paid, [{ id: 9001, paidOn: "2026-09-25" }]);
  await page.waitForFunction(() => document.querySelector('#adm-pl-shipments tr[data-shipment-id="9001"]')?.innerText.includes("Bezahlt am 25.09.2026"));

  await page.locator("#adm-pl-dispatch-9001").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  assert.equal(await page.inputValue("#adm-pl-dispatch-date"), "2026-09-15", "vorbelegt mit dem Versandtag");
  await page.locator("#adm-pl-dispatch-confirm").click();
  await page.locator('[role="dialog"]').waitFor({ state: "detached" });
  assert.deepEqual(state.posts.dispatch, [{ id: 9001, status: "dispatched", dispatchDate: "2026-09-15", evidenceType: "other", note: "Pre-Live-Test" }]);
  await page.waitForFunction(() => !document.querySelector("#adm-pl-dispatch-9001"));
  assert.deepEqual(state.other, [], `unerwartete Aufrufe: ${state.other.join(", ")}`);
  await page.close();
});

test("6 — Schnellszenarien: Vorgaben mit Lage zur Schwelle, Vertragsbody, Ergebnis; Feldfehler", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { antworten: { scenarios: [
    [201, null],
    [400, { error: "Höchstens 50 Teampartner je Lauf.", code: "SCENARIO_INVALID", field: "count" }],
    [201, null],
  ] } });
  await zurSeite(page);
  await oeffnen(page, "adm-pl-scenarios-card");
  await page.locator("#adm-pl-presets").waitFor({ state: "visible" });
  await page.selectOption("#adm-pl-levels-partner", "41");
  await page.selectOption("#adm-pl-levels-month", "2026-09");
  await page.locator("#adm-pl-offset-minus").check();
  await page.locator("#adm-pl-preset-customer-3").click();
  assert.equal(await page.inputValue("#adm-pl-levels-active"), "9", "Kunden-Level 3 (10) knapp darunter");
  await page.locator("#adm-pl-offset-plus").check();
  await page.locator("#adm-pl-preset-package-5").click();
  assert.equal(await page.inputValue("#adm-pl-levels-packages"), "2001", "Paket-Level 5 (2000) knapp darüber");
  await page.locator("#adm-pl-offset-exact").check();
  await page.locator("#adm-pl-preset-customer-1").click();
  assert.equal(await page.inputValue("#adm-pl-levels-active"), "3");
  await page.locator("#adm-pl-levels-submit").click();
  await page.locator("#adm-pl-levels-result").waitFor({ state: "visible" });
  assert.deepEqual(state.posts.scenarios[0], { kind: "levels", partnerUserId: 41, month: "2026-09", activeCustomers: 3, packages: 2001 });
  assert.equal(await page.locator("#adm-pl-levels-result").innerText(), "Angelegt: 3 Kunden, 12 Sendungen, 2.001 Pakete.");

  await page.selectOption("#adm-pl-team-sponsor", "41");
  await page.fill("#adm-pl-team-count", "80");
  await page.fill("#adm-pl-team-since", "2026-05-01");
  await page.locator("#adm-pl-team-submit").click();
  await page.locator("#adm-pl-team-result").waitFor({ state: "visible" });
  assert.equal(await page.getAttribute("#adm-pl-team-count", "aria-invalid"), "true", "der Fehler steht am Feld des Servers");
  assert.match(await page.locator("#adm-pl-team-result").innerText(), /Höchstens 50 Teampartner je Lauf\./);
  await page.fill("#adm-pl-team-count", "2");
  await page.locator("#adm-pl-team-submit").click();
  await page.waitForFunction(() => document.querySelector("#adm-pl-team-result")?.innerText.includes("Angelegt: 2 Teampartner."));
  assert.deepEqual(state.posts.scenarios.at(-1), { kind: "team", sponsorUserId: 41, count: 2, activeSince: "2026-05-01" });
  assert.equal(await page.getAttribute("#adm-pl-team-result a >> nth=0", "href"), "/admin/partners/61");
  await page.close();
});

test("7 — Provisionen berechnen: Zahlen, deutsche Gründe; „gerade aktiv“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { antworten: { commission: [
    [200, { stats: { skippedTick: false, assessments: 2, decided: 5, accrued: 4, skipped: { assessment_not_due: 1, voellig_neu: 2 }, failed: 0 } }],
    [200, { stats: { skippedTick: true, assessments: 0, decided: 0, accrued: 0, skipped: {}, failed: 0 } }],
  ] } });
  await zurSeite(page);
  // Bewusste Ankeränderung (UX-Paket 5): „Lauf“ heißt im Programm schon das Ausstellen der Gutschriften.
  assert.equal(await page.locator("#adm-pl-commission-run").innerText(), "Provisionen jetzt berechnen (nur Testdaten)");
  await page.locator("#adm-pl-commission-run").click();
  await page.locator("#adm-pl-commission-result").waitFor({ state: "visible" });
  const text = await page.locator("#adm-pl-commission-result").innerText();
  assert.match(text, /Provisionsentscheidungen\s*5/);
  assert.match(text, /davon gutgeschrieben\s*4/);
  assert.match(text, /Monatsbewertung noch nicht fällig/);
  assert.match(text, /Sonstiger Grund/);
  assert.doesNotMatch(text, /assessment_not_due|voellig_neu/, "kein Rohcode");
  await page.locator("#adm-pl-commission-run").click();
  await page.locator("#adm-pl-commission-busy").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-pl-commission-busy").innerText(), "Ein Lauf ist gerade aktiv – bitte erneut versuchen");
  assert.equal(state.posts.commission, 2);
  await page.close();
});

test("8 — E-Mail-Vorschau nur im iframe mit leerem sandbox; Skripte der Mail laufen nicht", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await zurSeite(page);
  await oeffnen(page, "adm-pl-mail-card");
  assert.equal(await page.locator("#adm-pl-mail-note").innerText(), "Vorschau – es wird keine E-Mail versendet.");
  const titel = await page.title();
  await page.selectOption("#adm-pl-mail-kind", "partner_approved");
  await page.selectOption("#adm-pl-mail-partner", "41");
  await page.locator("#adm-pl-mail-load").click();
  await page.locator("#adm-pl-mail-frame").waitFor({ state: "attached" });
  assert.deepEqual(state.mailQueries, ["?kind=partner_approved&partnerUserId=41"]);
  assert.equal(await page.locator("#adm-pl-mail-subject").innerText(), "Willkommen als Vertriebspartner");
  assert.equal(await page.locator("#adm-pl-mail-recipient").innerText(), "p***@test.example");
  assert.equal(await page.getAttribute("#adm-pl-mail-frame", "sandbox"), "", "leeres sandbox: keine Skripte, keine Formulare");
  assert.match(await page.getAttribute("#adm-pl-mail-frame", "srcdoc"), /Hallo Pia/);
  assert.equal(await page.getAttribute("#adm-pl-mail-frame", "src"), null, "nie aus einer Adresse");
  await page.frameLocator("#adm-pl-mail-frame").locator("#mail-h1").waitFor({ state: "visible" });
  assert.equal(await page.frameLocator("#adm-pl-mail-frame").locator("#mail-h1").innerText(), "Hallo Pia");
  // Das HTML steht nie im Dokument der Adminseite selbst.
  assert.equal(await page.locator("#mail-h1").count(), 0);
  await page.waitForTimeout(300);
  const rahmen = page.frameLocator("#adm-pl-mail-frame");
  assert.equal(await rahmen.locator("body[data-skript]").count(), 0, "das Skript der Mail lief nicht");
  assert.equal(await rahmen.locator("body[data-onerror]").count(), 0, "kein Ereignishandler der Mail lief");
  assert.equal(await page.title(), titel);

  // „Neue Gutschrift verfügbar“: Auswahl der Testgutschrift des Partners.
  await page.selectOption("#adm-pl-mail-kind", "credit_note_available");
  await page.locator("#adm-pl-mail-credit-note option[value='8']").waitFor({ state: "attached" });
  await page.selectOption("#adm-pl-mail-credit-note", "8");
  await page.locator("#adm-pl-mail-load").click();
  for (let i = 0; i < 50 && state.mailQueries.length < 2; i += 1) await page.waitForTimeout(100);
  assert.equal(state.mailQueries.at(-1), "?kind=credit_note_available&creditNoteId=8");
  await page.close();
});

test("9 — Bereinigung: Probelauf, Blockade sperrt, Bestätigung, Token; veralteter Stand lädt neu", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page, { antworten: {
    cleanupGet: [
      [200, { counts: { users: 6, invoices: 1 }, blockers: [{ table: "invoices", column: "user_id", count: 1 }], confirmToken: "tok-a", nothingToDelete: false }],
      [200, { counts: { users: 6, shipments: 12 }, blockers: [], confirmToken: "tok-b", nothingToDelete: false }],
      [200, { counts: { users: 6, shipments: 13 }, blockers: [], confirmToken: "tok-c", nothingToDelete: false }],
    ],
    cleanupPost: [
      [409, { error: "Stand veraltet", code: "CLEANUP_STALE" }],
      [200, { deleted: { users: 6, shipments: 13 } }],
    ],
  } });
  await zurSeite(page);
  assert.equal(await page.locator("#adm-pl-cleanup-delete").isDisabled(), true, "ohne Probelauf kein Löschen");
  assert.equal(state.cleanupGets, 0, "der Probelauf läuft erst auf Anforderung");

  await page.locator("#adm-pl-cleanup-check").click();
  await page.locator("#adm-pl-cleanup-blockers").waitFor({ state: "visible" });
  assert.match(await page.locator("#adm-pl-cleanup-blockers").innerText(), /Tabelle invoices, Spalte user_id: 1 Verweis/);
  assert.equal(await page.locator("#adm-pl-cleanup-delete").isDisabled(), true, "Blockaden sperren das Löschen");

  await page.locator("#adm-pl-cleanup-check").click();
  await page.waitForFunction(() => !document.querySelector("#adm-pl-cleanup-blockers") && !!document.querySelector("#adm-pl-cleanup-counts"));
  assert.match(await page.locator("#adm-pl-cleanup-counts").innerText(), /shipments\s*12/);
  // UX-Paket 5: der verständliche Name steht vor dem technischen.
  assert.match(await page.locator('#adm-pl-cleanup-counts tr[data-table="shipments"]').innerText(), /Testsendungen\s*shipments\s*12/);
  assert.match(await page.locator('#adm-pl-cleanup-counts tr[data-table="users"]').innerText(), /Testkonten\s*users\s*6/);
  await page.locator("#adm-pl-cleanup-delete").click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible" });
  assert.match(await page.locator('[role="dialog"]').innerText(), /Alle Pre-Live-Testdaten endgültig löschen\?/);
  assert.equal(state.posts.cleanup.length, 0, "erst die Bestätigung löscht");
  await page.locator("#adm-pl-cleanup-confirm").click();
  await page.locator("#adm-pl-cleanup-result").waitFor({ state: "visible" });
  assert.deepEqual(state.posts.cleanup, [{ confirmToken: "tok-b" }]);
  assert.match(await page.locator("#adm-pl-cleanup-result").innerText(), /hat sich seit dem Probelauf geändert/);
  await page.waitForFunction(() => document.querySelector("#adm-pl-cleanup-counts")?.innerText.includes("13"));

  await page.locator("#adm-pl-cleanup-delete").click();
  await page.locator("#adm-pl-cleanup-confirm").click();
  await page.waitForFunction(() => document.querySelector("#adm-pl-cleanup-result")?.innerText.includes("wurden gelöscht"));
  assert.deepEqual(state.posts.cleanup.at(-1), { confirmToken: "tok-c" });
  assert.match(await page.locator("#adm-pl-cleanup-deleted").innerText(), /shipments\s*13/);
  assert.equal(await page.locator("#adm-pl-cleanup-delete").isDisabled(), true, "ein neuer Löschvorgang braucht einen neuen Probelauf");
  await page.waitForFunction(() => document.querySelector("#adm-pl-status-card")?.innerText.match(/Testsendungen\s*0/));
  await page.close();
});

test("10 — Registrierungsweg: produktiv heißt Warnung statt Link, unbekannt heißt keine Aussage", async () => {
  // Produktiv: ein Antrag über die öffentliche Registrierung wäre echt — kein Link, sondern die Warnung.
  const produktiv = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const sP = await setup(produktiv, { registrierung: "production" });
  await zurSeite(produktiv);
  await produktiv.locator('#adm-pl-register-state[data-mode="production"]').waitFor({ state: "visible" });
  assert.match(await produktiv.locator("#adm-pl-register-state").innerText(), /echt, kein Test/);
  assert.equal(await produktiv.locator("#adm-pl-flow-register .ce-copynum").count(), 0, "kein Registrierungslink");
  assert.ok(!(await produktiv.locator("#adm-pl-flow").innerText()).includes("/partner-registrieren"));
  // Der Ausweg ist das zusätzliche Werkzeug: der Schritt öffnet „Testpartner anlegen“.
  await produktiv.locator("#adm-pl-step-partner-tool").click();
  await produktiv.waitForFunction(() => document.getElementById("adm-pl-partner-fold")?.open === true);
  assert.equal(sP.configCalls, 1);
  assert.deepEqual(sP.other, [], `unerwartete Aufrufe: ${sP.other.join(", ")}`);
  await produktiv.close();

  // Konfiguration nicht lesbar: fail-closed — keine Zusage, kein Link.
  const unklar = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setup(unklar, { registrierung: "fehler" });
  await zurSeite(unklar);
  await unklar.locator('#adm-pl-register-state[data-mode="unknown"]').waitFor({ state: "visible" });
  assert.match(await unklar.locator("#adm-pl-register-state").innerText(), /ließ sich nicht prüfen/);
  assert.equal(await unklar.locator("#adm-pl-flow-register .ce-copynum").count(), 0);
  await unklar.close();
});

test("11 — „Testgutschrift prüfen“ öffnet die Gutschriften mit vorbelegtem Pre-Live-Testlauf", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await zurSeite(page);
  assert.equal(await page.getAttribute("#adm-pl-step-credit-notes", "href"), "/admin/partners/credit-notes");
  await page.locator("#adm-pl-step-credit-notes").click();
  await page.waitForURL(`${BASE}/admin/partners/credit-notes`);
  await page.locator("#adm-cn-scope-test").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-cn-scope-test").isChecked(), true, "der Testlauf ist vorbelegt");
  await page.locator("#adm-cn-test-note").waitFor({ state: "visible" });
  await page.locator("#adm-cn-preview").click();
  await page.locator("#adm-cn-summary").waitFor({ state: "visible" });
  assert.deepEqual(state.previewQueries, ["?month=2026-09&scope=test"]);
  assert.equal(await page.locator("#adm-cn-scope").innerText(), "Pre-Live-Testlauf");
  // Über die Teilnavigation (ohne Sprungziel) ist nichts vorbelegt.
  await page.locator("#adm-sp-list-link").click();
  await page.waitForURL(`${BASE}/admin/partners`);
  await page.locator("#adm-sp-credit-notes-link").click();
  await page.waitForURL(`${BASE}/admin/partners/credit-notes`);
  await page.locator("#adm-cn-scope-test").waitFor({ state: "visible" });
  assert.equal(await page.locator("#adm-cn-scope-test").isChecked(), false);
  await page.close();
});
