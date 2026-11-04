// E2E: P5 (Betreiberentscheidung 2026-11-04, Canonical v2.111) — Anträge auf Sammelrechnung im Adminbereich.
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — keine Buchung, keine Rechnung, kein Sammellauf.
//
//   A1 — Kundendetail, Sammelrechnung nicht verfügbar: offener Antrag mit Begründung, Genehmigen gesperrt mit
//        Erklärung; Ablehnen ohne Grund → Feldfehler und KEIN Request; mit Grund → genau EIN POST nur mit dem Grund,
//        danach steht der Antrag als „Abgelehnt“ mit Grund im Verlauf
//   A2 — Kundendetail, verfügbar: Genehmigen öffnet erst den Bestätigungsdialog (Abbrechen sendet nichts); Bestätigen
//        sendet genau EIN POST ohne Body, die Abrechnungsart der Seite folgt der Serverantwort
//   A3 — bereits entschieden (zweiter Admin): 409 mit Servertext, kein falscher Erfolg, der tatsächliche Stand erscheint
//   A4 — Liste: offene Anträge, Weg ins Kundendetail, Filter „Alle“, Hinweis vor der Verfügbarkeit; 390 px als Karten
//        ohne Überlauf
//   A5 — Übersicht: „Sammelrechnungsanträge“ unter „Zu erledigen“ mit der Zahl der Betriebsqueue und dem Weg zur Liste
//   A6 — Protokoll: die neuen Aktionen tragen ihre Beschriftung
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5741, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}
const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

const ADMIN = { id: 9, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress", name: "Anna Admin",
  role: "admin", status: "approved", country: "DE" };
const KONTO = { id: 7, name: "Max Mustermann", email: "einkauf@muster-logistik.de", company_name: "Muster Logistik GmbH",
  role: "customer", status: "approved", country: "DE", customer_number: "CE-K-10031", payment_term: 7 };
const OFFEN = { id: 5, userId: 7, status: "pending", requestedMode: "consolidated_7d",
  customerNote: "Wir versenden etwa 40 Pakete pro Woche.", decisionNote: null,
  requestedAt: "2026-11-04T09:15:00.000Z", decidedAt: null, withdrawnAt: null, decidedBy: null };

let server, browser;

async function adminRoutes(page, opts = {}) {
  const state = {
    mode: "single", requests: [OFFEN], approvalAvailable: false, approves: [], rejects: [], listQueries: [],
    decisionStatus: 200, ...opts,
  };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });

    // P5 — zuerst die spezifischen Wege, dann die allgemeinen Unterpfade des Kontos.
    if (p.endsWith("/admin/users/7/billing-mode-requests")) {
      return json({ requests: state.requests, billingMode: state.mode, approvalAvailable: state.approvalAvailable });
    }
    const entscheidung = /\/admin\/billing-mode-requests\/(\d+)\/(approve|reject)$/.exec(p);
    if (entscheidung && req.method() === "POST") {
      const [, id, art] = entscheidung;
      const body = req.postData();
      (art === "approve" ? state.approves : state.rejects).push(body ? JSON.parse(body) : null);
      if (state.decisionStatus === 409) {
        const stand = { ...OFFEN, status: "approved", decidedAt: "2026-11-05T08:00:00.000Z", decidedBy: { id: 8, name: "Zweiter Admin" } };
        state.requests = [stand];
        state.mode = "consolidated_7d";
        return json({ error: "Über diesen Antrag wurde bereits entschieden.", code: "BILLING_MODE_REQUEST_NOT_PENDING", request: stand }, 409);
      }
      const jetzt = "2026-11-05T08:00:00.000Z";
      if (art === "approve") {
        state.mode = "consolidated_7d";
        state.requests = [{ ...OFFEN, id: Number(id), status: "approved", decidedAt: jetzt, decidedBy: { id: 9, name: "Anna Admin" } }];
        return json({ request: state.requests[0], billingMode: "consolidated_7d" });
      }
      const grund = JSON.parse(body || "{}").reason;
      state.requests = [{ ...OFFEN, id: Number(id), status: "rejected", decisionNote: grund, decidedAt: jetzt, decidedBy: { id: 9, name: "Anna Admin" } }];
      return json({ request: state.requests[0] });
    }
    if (p.endsWith("/admin/billing-mode-requests")) {
      state.listQueries.push(url.search);
      const status = url.searchParams.get("status");
      const zeilen = (status === "all" ? [OFFEN, { ...OFFEN, id: 3, status: "rejected", decisionNote: "nein" }] : [OFFEN])
        .map((r) => ({ ...r, customer: { id: 7, company: KONTO.company_name, contactName: KONTO.name, email: KONTO.email,
          customerNumber: KONTO.customer_number, billingMode: "single", status: "approved" } }));
      return json({ requests: zeilen, pagination: { limit: 25, offset: 0, count: zeilen.length, total: zeilen.length },
        approvalAvailable: state.approvalAvailable });
    }
    if (p.endsWith("/admin/operations/queues")) {
      return json({ generatedAt: "2026-11-05T08:00:00.000Z", thresholds: {},
        queues: { billing_mode_requests_pending: { count: 2, oldestAt: "2026-11-04T09:15:00.000Z", oldestId: 7, target: "user" },
          consolidated_uninvoiced_overdue: { count: 0, oldestAt: null, oldestId: null, target: "shipment" } },
        diagnostics: {} });
    }
    if (p.endsWith("/admin/users/7")) {
      return json({ user: { ...KONTO, billing_mode: state.mode },
        summary: { shipments_total: 3, invoices_total: 2, invoices_productive: 2, invoices_unpaid: 1, invoices_overdue: 0, open_amount: 0 },
        credit: { limit: 2000, open: 0, reserved: 0, available: 2000, exhausted: false, currency: "EUR" } });
    }
    if (p.endsWith("/admin/audit-logs")) {
      return json({ logs: [
        { id: 2, action: "billing_mode_request.approved", result: "success", created_at: "2026-11-05T08:00:00.000Z", actor: { id: 9, name: "Anna Admin" },
          target_user_id: 7, metadata: { billing_mode_request_id: 5, old_status: "pending", new_status: "approved" } },
        { id: 1, action: "billing_mode_request.rejected", result: "success", created_at: "2026-11-04T08:00:00.000Z", actor: { id: 9, name: "Anna Admin" },
          target_user_id: 7, metadata: { billing_mode_request_id: 4, old_status: "pending", new_status: "rejected" } },
      ], pagination: { limit: 25, offset: 0, count: 2, total: 2 } });
    }
    if (p.includes("/admin/users/7/")) return json({ pricing: null, declarations: null, verifications: [], attributions: [], supportRequests: [] });
    if (p.includes("/consolidated-invoices/run") || p.endsWith("/book")) return json({ error: "im Test nicht erlaubt" }, 500);
    return json({ pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return state;
}

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
  if (server) stopDevServer(server, "SIGKILL");
});

async function seite(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

test("A1 — nicht verfügbar: Genehmigen gesperrt mit Erklärung; Ablehnen nur mit Grund, genau EIN POST mit dem Grund", async () => {
  const { page, fehler } = await seite();
  const state = await adminRoutes(page);
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  await page.waitForSelector("#adm-billing-mode-requests .adm-bm-pending", { timeout: 20000 });
  const panel = norm(await page.locator("#adm-billing-mode-requests").innerText());
  assert.match(panel, /Antrag auf Sammelrechnung/);
  assert.match(panel, /Offen beantragt am 04\.11\.2026/);
  assert.match(panel, /Wir versenden etwa 40 Pakete pro Woche\./);
  assert.equal(await page.locator("#adm-bm-approve").isDisabled(), true, "Genehmigen muss vor der Verfügbarkeit gesperrt sein");
  assert.match(norm(await page.locator("#adm-bm-approval-unavailable").innerText()), /Sammelrechnungslauf und reguläre Rechnungsstellung/);

  await page.locator("#adm-bm-reject").click();
  await page.locator("#adm-bm-reject-reason-error").waitFor({ timeout: 10000 });
  assert.equal(state.rejects.length, 0, "ohne Grund darf kein Request hinausgehen");
  await page.locator("#adm-bm-reject-reason").fill("Für Ihr Konto ist derzeit nur die Einzelrechnung möglich.");
  await page.locator("#adm-bm-reject").click();
  await page.locator("#adm-billing-mode-requests .profile-saved", { hasText: "Antrag abgelehnt." }).waitFor({ timeout: 15000 });
  assert.deepEqual(state.rejects, [{ reason: "Für Ihr Konto ist derzeit nur die Einzelrechnung möglich." }]);
  assert.equal(state.approves.length, 0);
  const verlauf = norm(await page.locator(".adm-bm-history").innerText());
  assert.match(verlauf, /Abgelehnt/);
  assert.match(verlauf, /Grund: Für Ihr Konto ist derzeit nur die Einzelrechnung möglich\./);
  assert.match(verlauf, /von Anna Admin/);
  assert.equal(await page.locator("#adm-bm-approve").count(), 0, "nach der Entscheidung gibt es nichts mehr zu genehmigen");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("A2 — verfügbar: Genehmigen nur über den Bestätigungsdialog; genau EIN POST ohne Body; die Seite übernimmt den Servermodus", async () => {
  const { page, fehler } = await seite();
  const state = await adminRoutes(page, { approvalAvailable: true });
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  await page.waitForSelector("#adm-bm-approve:not([disabled])", { timeout: 20000 });
  await page.locator("#adm-bm-approve").click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 10000 });
  assert.match(norm(await dialog.innerText()), /Es wird keine Rechnung ausgestellt/);
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  await page.waitForTimeout(300);
  assert.equal(state.approves.length, 0, "Abbrechen darf nichts senden");

  await page.locator("#adm-bm-approve").click();
  await page.getByRole("dialog").getByRole("button", { name: "Genehmigen" }).click();
  await page.locator("#adm-billing-mode-requests .profile-saved", { hasText: "Antrag genehmigt." }).waitFor({ timeout: 15000 });
  assert.deepEqual(state.approves, [null], "die Genehmigung trägt keinen Body");
  assert.match(norm(await page.locator("#adm-billing-mode-section .adm-card-head").innerText()), /Sammelrechnung alle 7 Tage/,
    "die Abrechnungsart der Seite folgt der Serverantwort");
  assert.match(norm(await page.locator(".adm-bm-history").innerText()), /Genehmigt/);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("A3 — schon entschieden (zweiter Admin): 409 mit Servertext, kein falscher Erfolg, der tatsächliche Stand erscheint", async () => {
  const { page, fehler } = await seite();
  const state = await adminRoutes(page, { approvalAvailable: true, decisionStatus: 409 });
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "networkidle" });
  await page.waitForSelector("#adm-bm-approve:not([disabled])", { timeout: 20000 });
  await page.locator("#adm-bm-approve").click();
  await page.getByRole("dialog").getByRole("button", { name: "Genehmigen" }).click();
  await page.locator("#adm-billing-mode-requests .adm-note--error", { hasText: "Über diesen Antrag wurde bereits entschieden." })
    .waitFor({ timeout: 15000 });
  assert.equal(state.approves.length, 1);
  assert.equal(await page.locator("#adm-billing-mode-requests .profile-saved").count(), 0, "keine Erfolgsmeldung");
  assert.match(norm(await page.locator(".adm-bm-history").innerText()), /Genehmigt.*von Zweiter Admin/);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("A4 — Liste: offene Anträge mit Weg ins Kundendetail, Filter „Alle“, Hinweis vor der Verfügbarkeit; 390 px als Karten", async () => {
  const { page, fehler } = await seite();
  const state = await adminRoutes(page);
  await page.goto(`${BASE}/admin/billing-mode-requests`, { waitUntil: "networkidle" });
  await page.waitForSelector(".adm-bmr-table tbody tr", { timeout: 20000 });
  assert.match(state.listQueries[0], /status=pending/);
  const zeile = norm(await page.locator(".adm-bmr-table tbody tr").first().innerText());
  assert.match(zeile, /Muster Logistik GmbH/);
  assert.match(zeile, /CE-K-10031/);
  assert.match(zeile, /Offen/);
  assert.match(zeile, /04\.11\.2026/);
  assert.match(norm(await page.locator("#adm-bmr-approval-unavailable").innerText()), /erst möglich/);
  assert.equal(await page.locator(".adm-bmr-table").getByRole("link", { name: "Prüfen" }).first().getAttribute("href"), "/admin/users/7");
  await page.locator("#f-bmr-status").selectOption("all");
  await page.waitForFunction(() => document.querySelectorAll(".adm-bmr-table tbody tr").length === 2, null, { timeout: 15000 });
  assert.match(state.listQueries.at(-1), /status=all/);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForSelector(".adm-bmr-cards .adm-scard", { timeout: 10000 });
  assert.equal(await page.locator(".adm-bmr-table").isVisible(), false, "mobil steht die Tabelle nicht");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `horizontaler Überlauf: ${overflow}px`);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("A5 — Übersicht: „Sammelrechnungsanträge“ unter „Zu erledigen“ mit Zahl und Weg zur Liste", async () => {
  const { page, fehler } = await seite();
  await adminRoutes(page);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const eintrag = page.locator("#adm-todo li", { hasText: "Sammelrechnungsanträge" });
  await eintrag.waitFor({ timeout: 20000 });
  assert.match(norm(await eintrag.innerText()), /2/);
  // Der Eintrag führt zur Liste und — wie jede Queue mit ältestem Fall — direkt zum Konto, auf dem entschieden wird.
  const ziele = await eintrag.getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  assert.ok(ziele.includes("/admin/billing-mode-requests"), JSON.stringify(ziele));
  assert.ok(ziele.includes("/admin/users/7"), JSON.stringify(ziele));
  // Die Bereichskachel führt ebenfalls zur Liste (kein Sidebar-Eintrag — Höhenbudget).
  assert.ok(await page.locator('a[href="/admin/billing-mode-requests"]').count() >= 2);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("A6 — Protokoll: Genehmigung und Ablehnung tragen ihre Beschriftung (der Rohwert steht nur als Zweitzeile)", async () => {
  const { page, fehler } = await seite();
  await adminRoutes(page);
  await page.goto(`${BASE}/admin/audit-logs?target_user_id=7`, { waitUntil: "networkidle" });
  await page.waitForSelector(".adm-audit-table tbody tr", { timeout: 20000 });
  const tabelle = norm(await page.locator(".adm-audit-table").innerText());
  assert.match(tabelle, /Sammelrechnungsantrag genehmigt/);
  assert.match(tabelle, /Sammelrechnungsantrag abgelehnt/);
  // Unbekannte Aktionen stünden nur als Rohwert da; hier steht die Beschriftung vor dem Code.
  assert.match(tabelle, /Sammelrechnungsantrag genehmigt billing_mode_request\.approved/);
  assert.deepEqual(fehler, []);
  await page.close();
});
