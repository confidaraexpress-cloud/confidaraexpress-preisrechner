// E2E: Package C · C3 — Buchungsklärung und Betriebssicht im Adminbereich (echter Dev-Server).
//
// Prüft, was Quelltextanker nicht erreichen:
//   • die Buchungsklärung bleibt bei 1440, 834 und 390 px als Liste und Detail bedienbar,
//   • beide finalen Entscheidungen sind vor Ablauf der Wartezeit gesperrt, und die Wartezeit
//     läuft sichtbar herunter,
//   • eine Aktion wird erst NACH dem Bestätigungsdialog gesendet — Abbrechen sendet nichts,
//   • ein 409 (Konflikt, zu früh) wird sauber behandelt: Konfliktbanner mit Neuladen bzw.
//     die Wartezeit des Servers,
//   • die Übersicht zeigt die Betriebs-Queues als echte Serverzähler, ohne die Kennzahlen zu
//     verändern, und behauptet für „gesperrt ohne Versuch" keinen Beginn,
//   • die Betriebssicht des Sendungsdetails führt zur Buchungsklärung und zur Stornierungsanfrage,
//     deren Detail die Entscheidung ehrlich als „nicht erfasst" benennt.
//
// Alle Backendantworten sind gemockt: kein echter Server, kein Anbieter, keine Buchung, keine Mail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5391, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = {
  id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE",
};

const ATTEMPT = (over = {}) => ({
  bookingAttemptId: 501, shipmentId: 77, userId: 9, provider: "jumingo", attempt: 1, state: "ambiguous",
  ambiguousReason: "TimeoutError", createdAt: "2026-09-12T10:00:00Z", completedAt: null,
  yourReference: "CE-0123456789abcdef", providerBookingReference: null, providerFailReference: null,
  providerServiceId: "SVC-1", carrierPublicId: "dhl",
  customerGross: 28.56, customerNet: 24, customerVat: 4.56, currency: "EUR", pricingClass: "EXPRESS",
  revalidatedPurchaseNet: 20, snapshotComplete: true, hasCompletionInputs: true, legalFrozen: true,
  insuranceSelected: false, insuranceConfirmation: null, invoiceDrift: null,
  shipmentStatus: "booking", shipmentCarrier: "dhl", inventoryState: "not_applicable",
  hasBusinessOrderNumber: false, hasInvoice: false,
  isLatest: true, actionableAt: "2026-09-12T10:02:00Z", retryAfterSeconds: 0, actionable: true,
  resolution: null, resolvedAt: null, resolvedBy: null, lastReviewedAt: null,
  ...over,
});

const QUEUES = {
  generatedAt: "2026-09-13T08:00:00Z",
  thresholds: { reconciliationMinAgeSeconds: 120, bookingOverdueMinutes: 10, awbMissingAfterHours: 24, labelMissingAfterMinutes: 120 },
  queues: {
    reconciliation_open: { count: 3, oldestAt: "2026-09-13T07:00:00Z", oldestId: 41, target: "attempt", actionableCount: 2 },
    booking_overdue: { count: 1, oldestAt: "2026-09-13T07:00:00Z", oldestId: 41, target: "attempt" },
    booking_without_open_attempt: { count: 2, oldestAt: null, oldestId: 7, target: "shipment", startUnknown: true },
    invoice_drift_unreviewed: { count: 0, oldestAt: null, oldestId: null, target: "attempt" },
    awb_missing: { count: 4, oldestAt: "2026-09-10T09:00:00Z", oldestId: 90, target: "shipment" },
    label_missing: { count: 0, oldestAt: null, oldestId: null, target: "shipment" },
    cancellations_open: { count: 5, oldestAt: "2026-09-11T09:00:00Z", oldestId: 12, target: "cancellation" },
    additional_emails_failed: { count: 0, oldestAt: null, oldestId: null, target: "shipment" },
    invoice_mail_failed: { count: 1, oldestAt: "2026-09-12T09:00:00Z", oldestId: 3, target: "invoice" },
    order_confirmation_mail_failed: { count: 0, oldestAt: null, oldestId: null, target: "shipment" },
  },
  diagnostics: {
    superseded_unresolved: { count: 0, oldestAt: null, oldestId: null, target: "attempt" },
    orphaned_unresolved: { count: 0, oldestAt: null, oldestId: null, target: "attempt" },
    contradictory_evidence: { count: 1, oldestAt: "2026-09-12T11:00:00Z", oldestId: 55, target: "attempt" },
    booking_without_attempt: { count: 2, oldestAt: null, oldestId: 7, target: "shipment", startUnknown: true },
  },
};

const OPERATIONS = (over = {}) => ({
  provider: "jumingo", providerServiceId: "SVC-1", providerBookingReference: "ORD-77", trackingReferences: ["JJD000001"],
  bookedAt: "2026-09-12T10:00:00Z", latestAttemptId: 501, attemptsTotal: 1, attemptsLimited: false,
  legacyWithoutAttempt: false,
  reconciliation: { open: false, attemptId: null, provider: null, state: null, actionable: false, actionableAt: null,
    overdue: false, bookingWithoutOpenAttempt: false },
  bookingAttempts: [{
    id: 501, provider: "jumingo", attempt: 1, state: "ambiguous", createdAt: "2026-09-12T10:00:00Z",
    resolution: "confirmed_booked", resolvedAt: "2026-09-12T10:30:00Z", resolvedBy: 1, isLatest: true,
    invoiceDrift: { kind: "provider_charged_more", expectedNet: 20, actualNet: 22.52, deltaNet: 2.52,
      detectedAt: "2026-09-12T11:00:00Z", alertedAt: null, reviewedAt: null, reviewedBy: null },
  }],
  documents: { storedLabel: true, providerDocuments: [] },
  invoice: { id: 3, invoiceNumber: "CE-RE-1", documentStatus: "ready", emailStatus: "sent", emailAttempts: 1, emailSentAt: "2026-09-12T10:31:00Z" },
  orderConfirmation: { id: 8, confirmationNumber: "CE-AB26-00077", emailStatus: "failed", emailAttempts: 2, emailSentAt: null },
  emailDeliveries: [],
  cancellation: { id: 12, status: "accepted", createdAt: "2026-09-12T12:00:00Z", resolvedAt: null },
  ...over,
});

const SHIPMENT = (operations = OPERATIONS(), over = {}) => ({
  id: 77, user_id: 9, status: "booked", service_type: "standard", selected_carrier: "dhl",
  from_country: "DE", to_country: "AT", created_at: "2026-09-12T09:00:00Z",
  customer_company: "Muster GmbH", customer_number: "CE-K-1001", customer_name: "Max Muster",
  order_confirmation_number: "CE-AB26-00077", label_available: true, tracking_number: "JJD000001",
  email_deliveries: [], operations, ...over,
});

// Die Stornierungsanfrage, wie das Backend sie liefert: Sendung und Kunde NEBEN der Anfrage.
const CANCELLATION = {
  cancellationRequest: {
    id: 12, status: "accepted", reason: "Die Sendung wird nicht mehr benötigt.", adminNote: null, revision: 3,
    createdAt: "2026-09-12T12:00:00Z", updatedAt: "2026-09-12T13:00:00Z",
    reviewedAt: "2026-09-12T13:00:00Z", reviewedBy: { id: 1, name: "Anna Admin" }, resolvedAt: null, resolvedBy: null,
  },
  shipment: {
    id: 77, jumingoShipmentId: "s_intern", orderNumber: "ORD-77", orderConfirmationNumber: "CE-AB26-00077",
    status: "booked", carrier: "dhl", trackingNumber: "JJD000001", provider: "jumingo", providerBookingReference: "ORD-77",
    fromCountry: "DE", toCountry: "AT",
  },
  customer: { id: 9, company: "Muster GmbH", contactName: "Max Muster", email: "max@example.test" },
  invoice: null,
  notification: { sentAt: "2026-09-12T12:00:05Z", failed: false },
};

let server, browser;

async function setupRoutes(page, initial = {}) {
  const state = {
    attempt: initial.attempt || ATTEMPT(),
    list: initial.list || [
      ATTEMPT(),
      ATTEMPT({ bookingAttemptId: 502, shipmentId: 78, provider: "transglobal", state: "attempted", actionable: false, retryAfterSeconds: 90 }),
    ],
    actionResponse: initial.actionResponse || null,
    queues: initial.queues === undefined ? QUEUES : initial.queues,
    queuesStatus: initial.queuesStatus || 200,
    shipment: initial.shipment || SHIPMENT(),
    calls: { list: [], detail: 0, actions: [], queues: 0, shipment: 0, cancellation: 0 },
  };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/reconciliation/attempts") && req.method() === "GET") {
      state.calls.list.push(url.search);
      return json({ items: state.list, total: state.list.length, limit: 25, offset: 0 });
    }
    const m = p.match(/\/admin\/reconciliation\/attempts\/(\d+)(\/[a-z-]+)?$/);
    if (m && !m[2] && req.method() === "GET") {
      state.calls.detail += 1;
      return json(state.attempt);
    }
    if (m && m[2] && req.method() === "POST") {
      let body = null;
      try { body = req.postDataJSON(); } catch { body = null; }
      const aktion = m[2].slice(1);
      state.calls.actions.push({ action: aktion, body });
      const r = state.actionResponse ? state.actionResponse(aktion, body, state) : { status: 500, body: {} };
      return json(r.body, r.status);
    }
    if (p.endsWith("/admin/operations/queues")) {
      state.calls.queues += 1;
      return state.queuesStatus === 200 ? json(state.queues || {}) : json({ error: "Fehler" }, state.queuesStatus);
    }
    if (/\/admin\/shipments\/\d+$/.test(p)) {
      state.calls.shipment += 1;
      return json(state.shipment);
    }
    if (/\/admin\/cancellation-requests\/\d+$/.test(p)) {
      state.calls.cancellation += 1;
      return json(CANCELLATION);
    }
    if (p.endsWith("/admin/users")) return json({ users: [], pagination: { total: 11 } });
    if (p.endsWith("/admin/invoices")) return json({ invoices: [], pagination: { total: 2 } });
    if (p.endsWith("/admin/cancellation-requests")) return json({ cancellationRequests: [], pagination: { total: 5 } });
    if (p.endsWith("/admin/support-requests")) return json({ supportRequests: [], pagination: { total: 1 } });
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
    { stdio: "ignore", detached: true });
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
  if (server) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

console.log("\nBuchungsklärung — Liste und Detail in drei Breiten, Wartezeit sperrt beide Entscheidungen\n");

for (const [breite, hoehe] of [[1440, 900], [834, 1112], [390, 844]]) {
  test(`${breite}px: Liste und Detail — vor Ablauf der Wartezeit ist keine Entscheidung möglich`, async () => {
    const page = await browser.newPage({ viewport: { width: breite, height: hoehe } });
    const state = await setupRoutes(page, {
      attempt: ATTEMPT({ bookingAttemptId: 502, shipmentId: 78, provider: "transglobal", state: "attempted", actionable: false, retryAfterSeconds: 90 }),
    });
    await page.goto(`${BASE}/admin/reconciliation`, { waitUntil: "networkidle" });

    // Oberhalb von 1080px die Tabelle, darunter die Kartenansicht — nie beides.
    const breitGenug = breite > 1080;
    const liste = page.locator(breitGenug ? ".adm-recon-table" : ".adm-recon-cards");
    await liste.waitFor({ state: "visible" });
    assert.equal(await liste.locator("a.adm-recon-no").count(), 2);
    assert.equal(await page.locator(breitGenug ? ".adm-recon-cards" : ".adm-recon-table").isVisible(), false);
    assert.match(await liste.textContent(), /Transglobal/);
    assert.match(await liste.textContent(), /Wartezeit 1:30 min/);
    assert.ok(state.calls.list.length >= 1);
    await keinUeberlauf(page, `Liste ${breite}px`);

    await liste.getByRole("link", { name: "Versuch #502" }).click();
    await page.waitForURL(`${BASE}/admin/reconciliation/502`);
    const countdown = page.locator("#recon-countdown");
    await countdown.waitFor({ state: "visible" });
    const erster = await countdown.textContent();
    assert.match(erster, /Frühestens in 1:(30|29|28) min/);
    assert.equal(await page.locator("#recon-confirm-booked").isDisabled(), true, "„gebucht“ vor Ablauf freigegeben");
    assert.equal(await page.locator("#recon-confirm-not-booked").isDisabled(), true, "„nicht gebucht“ vor Ablauf freigegeben");
    // Die Wartezeit läuft sichtbar herunter — ohne dass etwas gesendet wird.
    await page.waitForTimeout(2300);
    assert.notEqual(await countdown.textContent(), erster, "die Wartezeit läuft nicht herunter");
    assert.equal(state.calls.actions.length, 0, "vor Ablauf der Wartezeit wurde eine Aktion gesendet");
    await keinUeberlauf(page, `Detail ${breite}px`);
    await page.close();
  });
}

console.log("\nBestätigung und 409 — nichts ohne Dialog, Konflikte werden sichtbar\n");

test("„Als nicht gebucht bestätigen“: erst der Dialog sendet; ein 409 zeigt den Konflikt und lädt auf Wunsch neu", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page, {
    actionResponse: (aktion) => (aktion === "confirm-not-booked"
      ? { status: 409, body: { error: "Der Vorgang konnte nicht abgeschlossen werden.", code: "already_resolved", resolution: "confirmed_booked" } }
      : { status: 500, body: {} }),
  });
  await page.goto(`${BASE}/admin/reconciliation/501`, { waitUntil: "networkidle" });
  const knopf = page.locator("#recon-confirm-not-booked");
  await knopf.waitFor({ state: "visible" });
  assert.equal(await knopf.isEnabled(), true);

  await knopf.click();
  let dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  assert.match(await dialog.textContent(), /Als nicht gebucht bestätigen\?/);
  assert.match(await dialog.textContent(), /nichts storniert und kein Anbieter kontaktiert/);
  assert.equal(state.calls.actions.length, 0, "vor der Bestätigung wurde gesendet");
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(state.calls.actions.length, 0, "Abbrechen hat gesendet");

  await knopf.click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Als nicht gebucht bestätigen" }).click();
  const konflikt = page.locator("#recon-conflict");
  await konflikt.waitFor({ state: "visible" });
  assert.match(await konflikt.textContent(), /bereits entschieden/);
  assert.match(await konflikt.textContent(), /nicht ausgeführt/);
  assert.deepEqual(state.calls.actions, [{ action: "confirm-not-booked", body: { confirm: true } }]);

  const vorher = state.calls.detail;
  await konflikt.getByRole("button", { name: /Aktuellen Stand laden/ }).click();
  await konflikt.waitFor({ state: "detached" });
  assert.equal(state.calls.detail, vorher + 1, "der aktuelle Stand wurde nicht neu geladen");
  await page.close();
});

test("„Als gebucht bestätigen“ verlangt eine gültige Anbieterreferenz; ein 409 „zu früh“ übernimmt die Wartezeit des Servers", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page, {
    actionResponse: (aktion) => (aktion === "confirm-booked"
      ? { status: 409, body: { error: "Der Vorgang konnte nicht abgeschlossen werden.", code: "attempt_too_recent", retryAfterSeconds: 45 } }
      : { status: 500, body: {} }),
  });
  await page.goto(`${BASE}/admin/reconciliation/501`, { waitUntil: "networkidle" });
  const gebucht = page.locator("#recon-confirm-booked");
  await gebucht.waitFor({ state: "visible" });
  assert.equal(await gebucht.isDisabled(), true, "ohne Anbieterreferenz ist „gebucht“ bestätigbar");
  await page.locator("#recon-provider-reference").fill("JO 4711");
  assert.equal(await gebucht.isDisabled(), true, "eine ungültige Referenz gibt „gebucht“ frei");
  await page.locator("#recon-provider-reference").fill("JO-4711");
  assert.equal(await gebucht.isEnabled(), true);

  await gebucht.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  assert.match(await dialog.textContent(), /Es wird kein Anbieter kontaktiert/);
  await dialog.getByRole("button", { name: "Als gebucht bestätigen" }).click();

  const countdown = page.locator("#recon-countdown");
  await countdown.waitFor({ state: "visible" });
  assert.match(await countdown.textContent(), /Frühestens in (45|44|43) s/);
  assert.equal(await gebucht.isDisabled(), true);
  assert.equal(await page.locator("#recon-confirm-not-booked").isDisabled(), true);
  assert.match(await page.locator("#recon-message").textContent(), /noch zu jung/);
  assert.deepEqual(state.calls.actions, [{ action: "confirm-booked", body: { confirm: true, providerReference: "JO-4711" } }]);
  await page.close();
});

test("Rechnungsabweichung: Dialog, Vermerk, neu geladen — danach nicht erneut auslösbar", async () => {
  const page = await browser.newPage({ viewport: { width: 834, height: 1112 } });
  const drift = (geprueft) => ({ kind: "provider_charged_more", expectedNet: 20, actualNet: 22.52, deltaNet: 2.52,
    detectedAt: "2026-09-12T10:05:00Z", alertedAt: null,
    reviewedAt: geprueft ? "2026-09-13T08:00:00Z" : null, reviewedBy: geprueft ? 1 : null });
  const gebucht = (geprueft) => ATTEMPT({ state: "booked", shipmentStatus: "booked", actionable: false,
    providerBookingReference: "ORD-77", invoiceDrift: drift(geprueft) });
  const state = await setupRoutes(page, {
    attempt: gebucht(false),
    actionResponse: (aktion, body, s) => {
      if (aktion !== "invoice-drift-review") return { status: 500, body: {} };
      s.attempt = gebucht(true);
      return { status: 200, body: { status: "reviewed", invoiceDriftReviewedAt: "2026-09-13T08:00:00Z", invoiceDriftReviewedBy: 1 } };
    },
  });
  await page.goto(`${BASE}/admin/reconciliation/501`, { waitUntil: "networkidle" });
  // Eine gebuchte Sendung ist nicht mehr zu klären — die Entscheidung ist nicht angeboten.
  await page.locator("#recon-unavailable").waitFor({ state: "visible" });
  assert.equal(await page.locator("#recon-confirm-booked").count(), 0);

  const pruefen = page.locator("#recon-drift-review");
  assert.equal(await pruefen.isEnabled(), true);
  await pruefen.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  assert.match(await dialog.textContent(), /unverändert erhalten/);
  await dialog.getByRole("button", { name: "Als geprüft markieren" }).click();

  await page.locator("#recon-message").waitFor({ state: "visible" });
  assert.match(await page.locator("#recon-message").textContent(), /als geprüft vermerkt/);
  await page.waitForFunction(() => document.querySelector("#recon-drift-review")?.disabled === true);
  assert.match(await pruefen.textContent(), /Bereits als geprüft vermerkt/);
  assert.deepEqual(state.calls.actions.map((a) => a.action), ["invoice-drift-review"]);
  await keinUeberlauf(page, "Driftprüfung 834px");
  await page.close();
});

console.log("\nÜbersicht — Betriebs-Queues als echte Serverzähler\n");

for (const [breite, hoehe] of [[1440, 900], [390, 844]]) {
  test(`${breite}px: die Queues zeigen die Serverzähler, verlinken den ältesten Fall — Kennzahlen unverändert`, async () => {
    const page = await browser.newPage({ viewport: { width: breite, height: hoehe } });
    const state = await setupRoutes(page);
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    const offen = page.locator('.adm-ops-item[data-queue="reconciliation_open"]');
    await offen.locator(".adm-ops-count").filter({ hasText: "3" }).waitFor({ state: "visible" });
    assert.equal(await offen.getByRole("link", { name: "Ältesten Fall öffnen" }).getAttribute("href"), "/admin/reconciliation/41");
    assert.equal((await page.locator('.adm-ops-item[data-queue="awb_missing"] .adm-ops-count').textContent()).trim(), "4");
    assert.equal((await page.locator('.adm-ops-item[data-queue="cancellations_open"] .adm-ops-count').textContent()).trim(), "5");
    const ohneVersuch = page.locator('.adm-ops-item[data-queue="booking_without_open_attempt"]');
    assert.match(await ohneVersuch.textContent(), /Beginn unbekannt/);
    assert.doesNotMatch(await ohneVersuch.textContent(), /Ältester Fall:/);
    assert.match(await page.locator('.adm-ops-item[data-queue="contradictory_evidence"]').textContent(), /Ältester Fall:/);
    // Die Kennzahlenreihe bleibt genau fünf Werte — die Queues sind keine Kennzahlen.
    assert.equal(await page.locator(".adm-metric-value").count(), 5);
    assert.equal(await page.locator(".adm-ops-error").count(), 0);
    assert.equal(state.calls.queues, 1);
    await keinUeberlauf(page, `Übersicht ${breite}px`);

    await offen.getByRole("link", { name: "Zur Liste" }).click();
    await page.waitForURL(`${BASE}/admin/reconciliation`);
    await page.close();
  });
}

test("scheitern die Queues, zeigt die Übersicht eine eigene Fehlerzeile — die Kennzahlen bleiben vollständig", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page, { queuesStatus: 500 });
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const fehler = page.locator(".adm-ops-error");
  await fehler.waitFor({ state: "visible" });
  assert.match(await fehler.textContent(), /Die Betriebs-Queues konnten nicht geladen werden\./);
  assert.equal(await page.locator(".adm-metric-value").count(), 5);
  assert.equal(await page.locator(".adm-inline-error").count(), 0, "der Queuefehler färbt die Kennzahlen ein");
  const werte = await page.locator('.adm-ops-item[data-queue="reconciliation_open"] .adm-ops-count').textContent();
  assert.equal(werte.trim(), "—", "ohne Serverwert wird keine Zahl behauptet");

  state.queuesStatus = 200;
  await fehler.getByRole("button", { name: /Erneut versuchen/ }).click();
  await fehler.waitFor({ state: "detached" });
  assert.equal((await page.locator('.adm-ops-item[data-queue="reconciliation_open"] .adm-ops-count').textContent()).trim(), "3");
  await page.close();
});

console.log("\nSendungsdetail — Betriebssicht, Buchungsversuche und Weg zur Stornierung\n");

test("die Betriebssicht zeigt Anbieter, Versuch und Abweichung — und führt zur Stornierungsanfrage „nicht erfasst“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page);
  await page.goto(`${BASE}/admin/shipments/77`, { waitUntil: "networkidle" });
  const karte = page.locator("#adm-ship-ops");
  await karte.waitFor({ state: "visible" });
  const text = await karte.textContent();
  for (const erwartet of ["JUMiNGO", "ORD-77", "Versuch #501", "Als gebucht bestätigt", "Rechnungsabweichung ungeprüft", "Anfrage #12"]) {
    assert.ok(text.includes(erwartet), `Betriebssicht zeigt „${erwartet}“ nicht`);
  }
  assert.equal(await karte.getByRole("link", { name: "Versuch #501" }).getAttribute("href"), "/admin/reconciliation/501");

  await page.locator("#adm-ship-ops-cancellation").click();
  await page.waitForURL(`${BASE}/admin/cancellation-requests/12`);
  await page.getByText("Entschieden am").waitFor({ state: "visible" });
  const detail = await page.locator(".adm-cards").textContent();
  assert.ok(detail.includes("nicht erfasst"), "eine Entscheidung ohne resolvedAt ist nicht als „nicht erfasst“ benannt");
  assert.ok(detail.includes("CE-AB26-00077"), "die Vorgangsnummer der Sendung fehlt");
  assert.ok(detail.includes("JUMiNGO") && detail.includes("ORD-77"), "Anbieter und Buchungsreferenz fehlen adminintern");
  assert.equal(state.calls.cancellation, 1);
  await page.close();
});

test("390px: gesperrt ohne offenen Versuch und Altbestand — Hinweise ohne Freigabe, ohne Überlauf", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(page, {
    shipment: SHIPMENT(OPERATIONS({
      provider: null, providerBookingReference: null, latestAttemptId: null, attemptsTotal: 0, bookingAttempts: [],
      legacyWithoutAttempt: true, cancellation: null, invoice: null, orderConfirmation: null, trackingReferences: [],
      documents: { storedLabel: false, providerDocuments: [] },
      reconciliation: { open: false, attemptId: null, provider: null, state: null, actionable: false, actionableAt: null,
        overdue: false, bookingWithoutOpenAttempt: true },
    }), { status: "booking", label_available: false, tracking_number: null }),
  });
  await page.goto(`${BASE}/admin/shipments/77`, { waitUntil: "networkidle" });
  const karte = page.locator("#adm-ship-ops");
  await karte.waitFor({ state: "visible" });
  const text = await karte.textContent();
  assert.match(text, /Beginn des Buchungsaufrufs ist unbekannt/);
  assert.match(text, /Altbestand – kein Booking Attempt vorhanden\./);
  assert.match(text, /Noch kein gebuchter Anbieter/);
  assert.equal(await karte.getByRole("link", { name: "Zur Buchungsklärung" }).count(), 0, "ohne offenen Versuch gibt es nichts zu entscheiden");
  await keinUeberlauf(page, "Sendungsdetail 390px");
  await page.close();
});
