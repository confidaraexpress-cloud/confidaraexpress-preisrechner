// E2E: Paritätsaudit 2026-10-15, Session 2 — Adminbereich (echter Dev-Server, echter Browser).
//
// Prüft, was Quelltextanker nicht erreichen:
//   • B1: die Auftragsbestätigung lässt sich aus der Sendung senden und bewusst erneut senden —
//     erst nach dem Dialog, Abbrechen sendet nichts, die Rückmeldung folgt der Serverantwort und
//     bleibt nach dem Neuladen stehen; ein gesperrter Versand nennt den Grund, nie den Code,
//   • B4: Testbuchung als Marker in Liste und Kopf, Gutschein nur mit Code,
//   • B3: „Erneut versuchen" einer Zusatzmail meldet `not_ready` als Hinweis, nicht als Erfolg,
//   • B2: das Protokoll blättert über limit/offset (nie page/page_size), B14: Labels statt Rohwert,
//   • alles bei 1440 und 390 px ohne horizontalen Überlauf.
//
// Alle Backendantworten sind gemockt: kein echter Server, kein Anbieter, keine Buchung, keine Mail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5561, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = {
  id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE",
};

const OPERATIONS = (ocStatus) => ({
  provider: "jumingo", providerServiceId: "SVC-1", providerBookingReference: "ORD-77", trackingReferences: ["JJD000001"],
  bookedAt: "2026-09-12T10:00:00Z", latestAttemptId: 501, attemptsTotal: 1, attemptsLimited: false,
  legacyWithoutAttempt: false,
  reconciliation: { open: false, attemptId: null, provider: null, state: null, actionable: false, actionableAt: null,
    overdue: false, bookingWithoutOpenAttempt: false },
  bookingAttempts: [],
  documents: { storedLabel: true, providerDocuments: [] },
  invoice: { id: 3, invoiceNumber: "CE-RE-1", documentStatus: "ready", emailStatus: "sent", emailAttempts: 1, emailSentAt: "2026-09-12T10:31:00Z" },
  orderConfirmation: { id: 8, confirmationNumber: "CE-AB26-00077", emailStatus: ocStatus, emailAttempts: 2,
    emailSentAt: ocStatus === "sent" ? "2026-09-12T10:05:00Z" : null },
  emailDeliveries: [],
  cancellation: null,
});

const SHIPMENT = (ocStatus, over = {}) => ({
  id: 77, user_id: 9, status: "booked", service_type: "standard", selected_carrier: "dhl",
  from_country: "DE", to_country: "AT", created_at: "2026-09-12T09:00:00Z",
  customer_company: "Muster GmbH", customer_number: "CE-K-1001", customer_name: "Max Muster",
  order_confirmation_number: "CE-AB26-00077", label_available: true, tracking_number: "JJD000001",
  price_original: 20, price_netto: 24, price_vat: 4.56, price_final: 28.56,
  is_test_booking: true, voucher_code: "WELCOME10", voucher_discount_gross: "11.90",
  email_deliveries: [{
    id: 31, notification_type: "label", recipient_email: "lager@example.test", status: "failed", attempt_number: 1,
    action_type: "automatic", provider_message_id: null, error_code: "send_failed", error_message: null,
    next_attempt_at: null, created_at: "2026-09-12T10:00:00Z", updated_at: "2026-09-12T10:00:00Z", sent_at: null,
  }],
  operations: OPERATIONS(ocStatus), ...over,
});

const LISTENZEILE = (id, test) => ({
  id, user_id: 9, status: "booked", service_type: "standard", selected_carrier: "dhl", from_country: "DE", to_country: "AT",
  price_final: 28.56, package_count: 1, created_at: "2026-09-12T09:00:00Z", has_tracking: true, label_available: true,
  order_confirmation_number: `CE-AB26-000${id}`, customer_company: "Muster GmbH", customer_number: "CE-K-1001",
  is_test_booking: test,
});

const LOG = (id, action) => ({
  id, created_at: "2026-10-10T10:00:00Z", actor_user_id: 1, actor: { id: 1, name: "Anna Admin" },
  target_user_id: 9, target_user: { id: 9, name: "Muster GmbH" }, target_invoice_id: 3, target_shipment_id: null,
  action, result: "success", metadata: {},
});

let server, browser;

async function setupRoutes(page, opt = {}) {
  const state = {
    ocStatus: opt.ocStatus || "failed",
    ocAntwort: opt.ocAntwort || (() => ({ status: 200, body: { shipmentId: 77, confirmationNumber: "CE-AB26-00077", outcome: "sent", emailStatus: "sent" } })),
    retryAntwort: opt.retryAntwort || (() => ({ status: 200, body: { deliveryId: 31, outcome: "not_ready", status: "pending" } })),
    calls: { send: [], resend: [], retry: 0, audit: [] },
  };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (/\/admin\/shipments\/77\/order-confirmation-email\/(send|resend)$/.test(p) && req.method() === "POST") {
      const art = p.endsWith("/resend") ? "resend" : "send";
      state.calls[art].push(req.postData() || "");
      const r = state.ocAntwort(art, state);
      if (r.status === 200 && r.body.outcome === "sent") state.ocStatus = "sent";
      return json(r.body, r.status);
    }
    if (/\/admin\/shipments\/77\/email-deliveries\/31\/retry$/.test(p) && req.method() === "POST") {
      state.calls.retry += 1;
      const r = state.retryAntwort(state);
      return json(r.body, r.status);
    }
    if (/\/admin\/shipments\/77$/.test(p)) return json(SHIPMENT(state.ocStatus));
    if (p.endsWith("/admin/shipments")) {
      return json({ shipments: [LISTENZEILE(77, true), LISTENZEILE(78, false)], pagination: { total: 2, limit: 25, offset: 0 } });
    }
    if (p.endsWith("/admin/audit-logs")) {
      state.calls.audit.push(url.search);
      const offset = Number(url.searchParams.get("offset") || 0);
      const logs = offset === 0
        ? Array.from({ length: 25 }, (_, i) => LOG(100 - i, i === 0 ? "invoice.generate_document" : "invoice.mark_paid"))
        : [LOG(10, "invoice.retry_document"), LOG(9, "user.business_verification")];
      return json({ logs, pagination: { limit: 25, offset, count: logs.length, total: 27 } });
    }
    if (p.endsWith("/admin/operations/queues")) return json({ generatedAt: "", queues: {}, diagnostics: {} });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return state;
}

async function keinUeberlauf(page, kontext) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw + 1, `${kontext}: horizontaler Überlauf (${sw}px > ${iw}px)`);
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const deadline = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > deadline) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
});

console.log("\nB1 — Auftragsbestätigung aus der Sendung senden und bewusst erneut senden\n");

test("B1: erst der Dialog sendet; Erfolg bleibt nach dem Neuladen stehen; Resend nennt einen Sperrgrund ohne Code", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page, {
    ocAntwort: (art) => (art === "resend"
      ? { status: 409, body: { error: "order_confirmation_email_recipient_anonymized", message: "Das Kundenkonto ist anonymisiert — es wird keine E-Mail versendet." } }
      : { status: 200, body: { shipmentId: 77, confirmationNumber: "CE-AB26-00077", outcome: "sent", emailStatus: "sent" } }),
  });
  await page.goto(`${BASE}/admin/shipments/77`, { waitUntil: "networkidle" });
  const knopf = page.locator("#adm-ship-oc-mail-action");
  await knopf.waitFor({ state: "visible" });
  assert.equal((await knopf.textContent()).trim(), "Auftragsbestätigung erneut versuchen");

  // Abbrechen sendet nichts.
  await knopf.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  assert.match(await dialog.textContent(), /Auftragsbestätigung per E-Mail senden\?/);
  assert.match(await dialog.textContent(), /CE-AB26-00077/);
  await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(state.calls.send.length, 0, "Abbrechen hat gesendet");

  // Senden: genau ein Request ohne Body; die Erfolgsmeldung überlebt das Neuladen.
  await knopf.click();
  await page.getByRole("dialog").getByRole("button", { name: "Senden", exact: true }).click();
  const meldung = page.locator("#adm-ship-oc-mail-msg");
  await meldung.waitFor({ state: "visible" });
  assert.equal((await meldung.textContent()).trim(), "Die Auftragsbestätigung wurde versendet.");
  assert.match(await meldung.getAttribute("class"), /alert-success/);
  assert.deepEqual(state.calls.send, [""], "genau ein Versand ohne Body");
  await page.waitForFunction(() => document.querySelector("#adm-ship-oc-mail-action")?.textContent.trim() === "Auftragsbestätigung erneut senden");
  assert.equal((await meldung.textContent()).trim(), "Die Auftragsbestätigung wurde versendet.", "die Meldung ging beim Neuladen verloren");

  // Bewusster zweiter Versand: eigener Dialog, eigene Route; die Sperre nennt den Grund, nie den Code.
  await page.locator("#adm-ship-oc-mail-action").click();
  const zweiter = page.getByRole("dialog");
  assert.match(await zweiter.textContent(), /bereits versendet/);
  await zweiter.getByRole("button", { name: "Erneut senden", exact: true }).click();
  await page.waitForFunction(() => /anonymisiert/.test(document.querySelector("#adm-ship-oc-mail-msg")?.textContent || ""));
  const fehler = await meldung.textContent();
  assert.equal(fehler.trim(), "Das Kundenkonto ist anonymisiert. Es wurde nichts versendet.");
  assert.ok(!fehler.includes("order_confirmation_email"), "Rohcode sichtbar");
  assert.match(await meldung.getAttribute("class"), /alert-error/);
  assert.equal(state.calls.resend.length, 1);
  assert.equal(state.calls.send.length, 1, "der Resend lief über /send");
  await page.close();
});

test("B1: ein hängender Versand wird nur mit Prüfhinweis übernommen; `in_progress` ist ein Hinweis, kein Erfolg", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page, {
    ocStatus: "sending",
    ocAntwort: () => ({ status: 200, body: { shipmentId: 77, confirmationNumber: "CE-AB26-00077", outcome: "in_progress", emailStatus: "sending" } }),
  });
  await page.goto(`${BASE}/admin/shipments/77`, { waitUntil: "networkidle" });
  await page.locator("#adm-ship-oc-mail-hint").waitFor({ state: "visible" });
  assert.match(await page.locator("#adm-ship-oc-mail-hint").textContent(), /zehn Minuten/);
  await page.locator("#adm-ship-oc-mail-action").click();
  await page.getByRole("dialog").getByRole("button", { name: "Versand übernehmen", exact: true }).click();
  const meldung = page.locator("#adm-ship-oc-mail-msg");
  await meldung.waitFor({ state: "visible" });
  assert.match(await meldung.textContent(), /läuft bereits/);
  assert.match(await meldung.getAttribute("class"), /alert-info/);
  assert.equal(state.calls.send.length, 1);
  await page.close();
});

console.log("\nB4 und B3 — Testbuchung, Gutschein und Rückmeldung der Zusatzmail\n");

for (const [breite, hoehe] of [[1440, 900], [390, 844]]) {
  test(`${breite}px: Testbuchung im Kopf, Gutscheinzeilen, Retry-Hinweis bleibt stehen — ohne Überlauf`, async () => {
    const page = await browser.newPage({ viewport: { width: breite, height: hoehe } });
    const state = await setupRoutes(page);
    await page.goto(`${BASE}/admin/shipments/77`, { waitUntil: "networkidle" });
    await page.locator("#adm-ship-test-badge").waitFor({ state: "visible" });
    assert.equal((await page.locator("#adm-ship-test-badge").textContent()).trim(), "Testbuchung");
    assert.equal((await page.locator("#adm-ship-voucher-code").textContent()).trim(), "WELCOME10");
    assert.match(await page.locator(".adm-kv-item", { hasText: "Gutscheinnachlass (brutto)" }).textContent(), /11,90/);
    await keinUeberlauf(page, `Sendungsdetail ${breite}px`);

    // B3: „not_ready" ist kein Erfolg — Hinweis mit Grund, und er bleibt nach dem Neuladen stehen.
    await page.getByRole("button", { name: /Erneut versuchen/ }).first().click();
    const msg = page.locator("#adm-ship-retry-msg");
    await msg.waitFor({ state: "visible" });
    assert.match(await msg.textContent(), /Trackingnummer oder Versandlabel fehlen/);
    assert.match(await msg.getAttribute("class"), /alert-info/);
    assert.equal(state.calls.retry, 1);
    await page.waitForLoadState("networkidle");
    assert.match(await msg.textContent(), /Trackingnummer oder Versandlabel fehlen/, "die Rückmeldung verschwand beim Neuladen");
    await keinUeberlauf(page, `Sendungsdetail nach Retry ${breite}px`);
    await page.close();
  });
}

test("B4: die Sendungsliste markiert nur die Testbuchung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/admin/shipments`, { waitUntil: "networkidle" });
  // Tabelle und Kartenansicht stehen beide im DOM — gezählt wird, was sichtbar ist.
  const marker = page.locator(".badge.badge-yellow", { hasText: "Testbuchung" }).filter({ visible: true });
  await marker.first().waitFor({ state: "visible" });
  assert.equal(await marker.count(), 1, "genau die eine Testbuchung trägt den Marker");
  await page.close();
});

console.log("\nB2 und B14 — Protokoll blättert über limit/offset, Labels statt Rohwert\n");

for (const [breite, hoehe] of [[1440, 900], [390, 844]]) {
  test(`${breite}px: Seite 2 fragt offset=25 an; neue Aktionen tragen Labels`, async () => {
    const page = await browser.newPage({ viewport: { width: breite, height: hoehe } });
    const state = await setupRoutes(page);
    await page.goto(`${BASE}/admin/audit-logs`, { waitUntil: "networkidle" });
    // Die Labels stehen auch im (verborgenen) Aktionsfilter — geprüft wird die sichtbare Zeile.
    const aktion = (text) => page.locator(".adm-action", { hasText: text }).filter({ visible: true }).first();
    await aktion("Rechnungsdokument erzeugt").waitFor({ state: "visible" });
    const erste = new URLSearchParams(state.calls.audit[0]);
    assert.equal(erste.get("limit"), "25");
    assert.equal(erste.get("offset"), "0");
    assert.equal(erste.has("page") || erste.has("page_size"), false, "page/page_size gesendet");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await aktion("Rechnungsdokument erneut erzeugt").waitFor({ state: "visible" });
    const zweite = new URLSearchParams(state.calls.audit[state.calls.audit.length - 1]);
    assert.equal(zweite.get("offset"), "25", "Seite 2 wurde nicht über offset angefragt");
    assert.ok(await aktion("Unternehmerprüfung erfasst").isVisible());
    // Der technische Name steht bewusst klein unter dem Label (.adm-action-raw) — nie als Label selbst.
    const labels = await page.locator(".adm-action").filter({ visible: true }).allTextContents();
    assert.ok(!labels.some((t) => /^[a-z_]+\.[a-z_.]+$/.test(t.trim())), `Rohwert als Label: ${labels.join(" | ")}`);
    await keinUeberlauf(page, `Protokoll ${breite}px`);
    await page.close();
  });
}
