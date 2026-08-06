// End-to-End: Benachrichtigungscenter und Support-Nachrichtenverlauf.
//
// Deckt die Flüsse ab, die reine Utility-/Strukturtests nicht erreichen: das
// tatsächliche Verhalten im echten Anwendungspfad — Badge, Panel, Erledigung
// nach PDF-Abruf, Ersetzung von „Neue Rechnung" durch „Rechnung überfällig",
// stilles Verschwinden nach Zahlungsverbuchung sowie der Supportverlauf inkl.
// Kundenantwort und der Nachweis, dass eine interne Notiz nie beim Kunden landet.
//
// Der Test startet den Vite-Dev-Server selbst und mockt JEDEN API-Aufruf im
// Browser (Playwright route interception). Es gibt keine echte Rechnung, keine
// echte Buchung, keine E-Mail und keinen Zugriff auf Produktionsdaten.
//
// Run: npm run test:e2e:notifications
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// Browserauflösung wie im bestehenden E2E-Test (Container liefern Chromium oft
// vorinstalliert aus, dessen Build-Nummer nicht zur playwright-Version passt).
function chromiumExecutablePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root) {
    const candidate = path.join(root, "chromium");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const PORT = 5221;
const BASE = `http://127.0.0.1:${PORT}`;

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", street: "Hauptstrasse 1", zip: "10115",
  city: "Berlin", country: "DE",
};

const INVOICE = {
  id: 501, shipment_id: 900, invoice_number: "CE-2026-000501", amount: 119.0,
  status: "unpaid", payment_term: 7, due_date: "2026-08-20T10:00:00.000Z",
  due_date_calendar: "2026-08-20", paid_at: null, created_at: "2026-08-04T10:00:00.000Z",
  issued_at: "2026-08-04T10:00:00.000Z", currency: "EUR", gross_amount: 119.0,
  document_status: "ready", pdf_generated_at: "2026-08-04T10:01:00.000Z",
  is_test_document: false, document_mode_label: "production", download_available: true,
  is_productive: true, is_overdue: false, is_payable: true, sent_by_email: true, email_status: "sent",
};

let server = null;
let browser = null;

before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore", detached: false,
  });
  const deadline = Date.now() + 90_000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* startet noch */ }
    if (Date.now() > deadline) throw new Error("Vite-Dev-Server ist nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

after(async () => {
  if (browser) await browser.close();
  if (server && !server.killed) server.kill("SIGKILL");
});

// Öffnet die App mit vollständig gemockter API. `state` ist der serverseitige
// Zustand dieses Tests — er verhält sich wie das Backend: der PDF-Abruf erledigt
// die ready-Meldung, ein Viewed-Aufruf erledigt die Supportmeldung nur bis zur
// bestätigten Nachricht.
async function openApp({ notifications = [], invoices = [INVOICE], supportRequests = [], thread = null,
                         viewport = { width: 1440, height: 1100 } } = {}) {
  const state = {
    notifications: notifications.map((n) => ({ ...n })),
    invoices: invoices.map((i) => ({ ...i })),
    supportRequests: supportRequests.map((s) => ({ ...s })),
    thread: thread ? { ...thread, messages: thread.messages.map((m) => ({ ...m })) } : null,
    calls: [],
  };
  const active = () => state.notifications.filter((n) => n.resolvedAt == null);
  const unread = () => active().filter((n) => n.readAt == null).length;
  const snapshot = () => new Date().toISOString();

  const page = await browser.newPage({ viewport });
  page.on("console", () => {});

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const method = route.request().method();
    // Alles, was nicht die API ist, geht an den Dev-Server.
    if (url.port === String(PORT) && !p.startsWith("/kunde") && !p.startsWith("/admin") && !p.startsWith("/api")) {
      return route.continue();
    }
    state.calls.push(`${method} ${p}`);
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (p.endsWith("/kundenbereich")) return json(USER);
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });

    if (p.endsWith("/kunde/notifications")) {
      return json({
        notifications: active(),
        unreadCount: unread(),
        snapshotAt: snapshot(),
        pagination: { limit: 20, offset: 0, count: active().length, total: active().length },
      });
    }
    if (p.endsWith("/kunde/notifications/unread-count")) {
      return json({ unreadCount: unread(), snapshotAt: snapshot() });
    }
    if (p.endsWith("/kunde/notifications/mark-read") && method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      for (const n of active()) {
        if (n.readAt != null) continue;
        if (body.all === true || (Array.isArray(body.ids) && body.ids.includes(n.id))) n.readAt = "gelesen";
      }
      return json({ updated: 1, unreadCount: unread(), snapshotAt: snapshot() });
    }

    if (p.endsWith("/kunde/invoices")) {
      return json({
        invoices: state.invoices,
        summary: { open_amount: 119, open_count: 1, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: false },
      });
    }
    // Der PDF-Abruf erledigt serverseitig die „Neue Rechnung"-Meldung — genau wie
    // das Backend im 'finish'-Ereignis. Der Client entscheidet das NICHT.
    if (/\/kunde\/invoices\/\d+\/pdf$/.test(p)) {
      const id = Number(p.split("/")[3]);
      for (const n of state.notifications) {
        if (n.type === "invoice_ready" && n.invoiceId === id && n.resolvedAt == null) n.resolvedAt = "erledigt";
      }
      const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(900, 0x20), Buffer.from("\n%%EOF\n")]);
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="rechnung.pdf"',
        },
        body: pdf,
      });
    }

    if (p.endsWith("/kunde/support-requests") && method === "GET") {
      return json({ supportRequests: state.supportRequests });
    }
    if (/\/kunde\/support-requests\/\d+$/.test(p) && method === "GET") {
      if (!state.thread) return json({ error: "Nicht gefunden" }, 404);
      const msgs = state.thread.messages;
      const withId = msgs.filter((m) => m.id != null);
      return json({
        supportRequest: state.thread.supportRequest,
        messages: msgs,
        latestMessageId: withId.length ? withId[withId.length - 1].id : null,
      });
    }
    if (/\/kunde\/support-requests\/\d+\/viewed$/.test(p) && method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      const reqId = Number(p.split("/")[3]);
      let resolved = 0;
      for (const n of state.notifications) {
        if (n.type !== "support_reply" || n.supportRequestId !== reqId || n.resolvedAt != null) continue;
        // Race-Regel des Backends: nur erledigen, wenn keine neuere Antwort kam.
        if (n.lastSupportMessageId == null || n.lastSupportMessageId <= body.throughMessageId) {
          n.resolvedAt = "erledigt"; n.readAt = n.readAt || "gelesen"; resolved++;
        }
      }
      return json({ resolved });
    }
    if (/\/kunde\/support-requests\/\d+\/messages$/.test(p) && method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      const nextId = Math.max(0, ...state.thread.messages.map((m) => m.id || 0)) + 1;
      state.thread.messages.push({
        id: nextId, authorRole: "customer", message: body.message, createdAt: new Date().toISOString(), original: false,
      });
      const wasClosed = state.thread.supportRequest.status === "closed";
      if (wasClosed) { state.thread.supportRequest.status = "open"; state.thread.supportRequest.statusLabel = "Offen"; }
      return json({
        message: { id: nextId, authorRole: "customer", message: body.message, createdAt: new Date().toISOString() },
        status: state.thread.supportRequest.status,
        statusLabel: state.thread.supportRequest.statusLabel,
        reopened: wasClosed,
      }, 201);
    }

    return json({});
  });

  await page.addInitScript(() => { localStorage.setItem("ce_token", "e2e-test-token"); });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 20_000 });
  return { page, state };
}

// Auf Desktop ist die Glocke der mobilen Topbar per CSS ausgeblendet (< 860 px).
// Alle Interaktionen laufen deshalb über die tatsächlich sichtbare Instanz.
const visibleBell = (page) => page.locator(".ntf-bell").locator("visible=true").first();
const visibleBadge = (page) => page.locator(".ntf-badge").locator("visible=true");

const notification = (over) => ({
  id: 1, type: "invoice_ready", invoiceId: INVOICE.id, invoiceNumber: INVOICE.invoice_number,
  supportRequestId: null, ticketNumber: null, unseenCount: null,
  createdAt: "2026-08-04T10:01:00.000Z", updatedAt: "2026-08-04T10:01:00.000Z",
  readAt: null, resolvedAt: null, ...over,
});

// ═══════════════════════════════════════════════════════════════════════════════

test("1 — Rechnung bereit → Glocke zeigt Badge → PDF-Abruf → Meldung verschwindet", async () => {
  const { page, state } = await openApp({ notifications: [notification({})] });

  // Badge sichtbar mit "1".
  const badge = visibleBadge(page).first();
  await badge.waitFor({ timeout: 10_000 });
  assert.equal((await badge.textContent()).trim(), "1");

  // Panel öffnen — das allein markiert NICHTS als gelesen.
  await visibleBell(page).click();
  await page.waitForSelector(".ntf-panel", { timeout: 10_000 });
  assert.match(await page.locator(".ntf-item-title").first().textContent(), /Neue Rechnung verfügbar/);
  assert.equal(state.notifications[0].readAt, null, "das Öffnen des Panels hat die Meldung als gelesen markiert");
  await page.keyboard.press("Escape");

  // PDF über den Rechnungsbereich abrufen — das erledigt die Meldung serverseitig.
  const download = page.waitForEvent("download").catch(() => null);
  await page.goto(`${BASE}/dashboard?page=invoices`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".inv-table, .inv-cards", { timeout: 15_000 });
  await page.getByRole("button", { name: /als PDF herunterladen/ }).first().click();
  await download;
  await page.waitForTimeout(400);

  assert.equal(state.notifications[0].resolvedAt !== null, true, "der PDF-Abruf hat die Meldung nicht erledigt");

  // Die Glocke zeigt die Meldung nicht mehr.
  await visibleBell(page).click();
  await page.waitForSelector(".ntf-panel", { timeout: 10_000 });
  await page.waitForSelector(".ntf-panel .ce-state-title", { timeout: 10_000 });
  assert.equal(await page.locator(".ntf-item").count(), 0, "die erledigte Meldung steht noch in der Glocke");
  await page.close();
});

test("2 — „Rechnung überfällig\" ersetzt „Neue Rechnung\" (nie beide gleichzeitig)", async () => {
  // Der Scheduler hat die ready-Meldung erledigt und die overdue-Meldung angelegt.
  const { page } = await openApp({
    notifications: [
      notification({ id: 1, type: "invoice_ready", resolvedAt: "ersetzt" }),
      notification({ id: 2, type: "invoice_overdue", updatedAt: "2026-08-21T00:05:00.000Z" }),
    ],
    invoices: [{ ...INVOICE, is_overdue: true }],
  });

  await visibleBell(page).click();
  await page.waitForSelector(".ntf-panel", { timeout: 10_000 });
  const titles = await page.locator(".ntf-item-title").allTextContents();
  assert.equal(titles.length, 1, `es stehen ${titles.length} Rechnungsmeldungen in der Glocke`);
  assert.match(titles[0], /Rechnung überfällig/);
  // Die Aktion ist „ansehen" — ein Download würde die Warnung nicht erledigen.
  assert.match(await page.locator(".ntf-item-action").first().textContent(), /Rechnung ansehen/);
  await page.close();
});

test("3 — die Überfälligkeitsmeldung bleibt nach einem PDF-Abruf bestehen", async () => {
  const { page, state } = await openApp({
    notifications: [notification({ id: 2, type: "invoice_overdue" })],
    invoices: [{ ...INVOICE, is_overdue: true }],
  });

  const download = page.waitForEvent("download").catch(() => null);
  await page.goto(`${BASE}/dashboard?page=invoices`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".inv-table, .inv-cards", { timeout: 15_000 });
  await page.getByRole("button", { name: /als PDF herunterladen/ }).first().click();
  await download;
  await page.waitForTimeout(400);

  assert.equal(state.notifications[0].resolvedAt, null,
    "der Download hat die Überfälligkeitswarnung erledigt — das darf erst die Zahlung");
  await page.close();
});

test("4 — Zahlungsverbuchung entfernt die Warnung still (keine neue Meldung)", async () => {
  // Der Admin hat als bezahlt verbucht: die Meldung ist serverseitig erledigt,
  // und es entsteht ausdrücklich KEINE „Zahlung eingegangen"-Meldung.
  const { page } = await openApp({
    notifications: [notification({ id: 2, type: "invoice_overdue", resolvedAt: "bezahlt" })],
    invoices: [{ ...INVOICE, status: "paid", is_overdue: false, is_payable: false }],
  });

  await page.waitForTimeout(600);
  assert.equal(await visibleBadge(page).count(), 0, "trotz erledigter Meldung wird ein Badge angezeigt");

  await visibleBell(page).click();
  await page.waitForSelector(".ntf-panel .ce-state-title", { timeout: 10_000 });
  const items = await page.locator(".ntf-item-title").allTextContents();
  assert.deepEqual(items, [], `es erschien eine Meldung: ${items.join(", ")}`);
  await page.close();
});

test("5 — Supportantwort → Glocke → Verlauf öffnen → Kunde antwortet", async () => {
  const { page, state } = await openApp({
    notifications: [notification({
      id: 3, type: "support_reply", invoiceId: null, invoiceNumber: null,
      supportRequestId: 77, ticketNumber: "CE-SUP26-00077", lastSupportMessageId: 2,
    })],
    supportRequests: [{
      id: 77, ticketNumber: "CE-SUP26-00077", category: "invoice", subject: "Frage zur Rechnung",
      status: "open", statusLabel: "Offen", createdAt: "2026-08-04T09:00:00.000Z", updatedAt: "2026-08-04T11:00:00.000Z",
    }],
    thread: {
      supportRequest: {
        id: 77, ticketNumber: "CE-SUP26-00077", category: "invoice", categoryLabel: "Rechnung",
        subject: "Frage zur Rechnung", status: "open", statusLabel: "Offen",
        createdAt: "2026-08-04T09:00:00.000Z", updatedAt: "2026-08-04T11:00:00.000Z", closedAt: null,
      },
      messages: [
        { id: null, authorRole: "customer", message: "Bitte prüfen Sie meine Rechnung.", createdAt: "2026-08-04T09:00:00.000Z", original: true },
        { id: 2, authorRole: "admin", message: "Wir haben das geprüft und melden uns.", createdAt: "2026-08-04T11:00:00.000Z", original: false },
      ],
    },
  });

  // Über die Glocke in den Vorgang navigieren.
  await visibleBell(page).click();
  await page.waitForSelector(".ntf-panel", { timeout: 10_000 });
  assert.match(await page.locator(".ntf-item-title").first().textContent(), /Neue Antwort vom Support/);
  await page.locator(".ntf-item").first().click();

  // Der Verlauf zeigt beide Beiträge, beginnend mit der Erstanfrage.
  await page.waitForSelector(".sup-msgs", { timeout: 15_000 });
  const bodies = await page.locator(".sup-msg-body").allTextContents();
  assert.equal(bodies.length, 2);
  assert.match(bodies[0], /Bitte prüfen Sie meine Rechnung/);
  assert.match(bodies[1], /Wir haben das geprüft/);

  // Das Öffnen des Verlaufs hat die Meldung race-sicher erledigt.
  await page.waitForTimeout(400);
  assert.equal(state.notifications[0].resolvedAt !== null, true,
    "das Öffnen des Verlaufs hat die Supportmeldung nicht erledigt");

  // Der Kunde antwortet — die Antwort erscheint im Verlauf.
  await page.locator("#sup-reply-field").fill("Danke");
  await page.getByRole("button", { name: /Antwort senden/ }).click();
  await page.waitForFunction(() => document.querySelectorAll(".sup-msg-body").length === 3, null, { timeout: 15_000 });
  const after = await page.locator(".sup-msg-body").allTextContents();
  assert.match(after[2], /^Danke$/);
  await page.close();
});

test("6 — zwei parallele Adminantworten: keine geht ungesehen verloren", async () => {
  // Der Kunde hat den Verlauf bis Nachricht 2 geladen; parallel kam Nachricht 3.
  // Die Meldung trägt bereits 3 — die Bestätigung über 2 darf sie NICHT erledigen.
  const { page, state } = await openApp({
    notifications: [notification({
      id: 3, type: "support_reply", invoiceId: null, invoiceNumber: null,
      supportRequestId: 77, ticketNumber: "CE-SUP26-00077", unseenCount: 2, lastSupportMessageId: 3,
    })],
    thread: {
      supportRequest: {
        id: 77, ticketNumber: "CE-SUP26-00077", category: "invoice", categoryLabel: "Rechnung",
        subject: "Frage zur Rechnung", status: "open", statusLabel: "Offen",
        createdAt: "2026-08-04T09:00:00.000Z", updatedAt: "2026-08-04T11:00:00.000Z", closedAt: null,
      },
      // Der Client kennt nur bis Nachricht 2.
      messages: [
        { id: null, authorRole: "customer", message: "Erstanfrage", createdAt: "2026-08-04T09:00:00.000Z", original: true },
        { id: 2, authorRole: "admin", message: "Erste Antwort", createdAt: "2026-08-04T11:00:00.000Z", original: false },
      ],
    },
  });

  await page.goto(`${BASE}/dashboard?page=support&ticket=77`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sup-msgs", { timeout: 15_000 });
  await page.waitForTimeout(600);

  assert.equal(state.notifications[0].resolvedAt, null,
    "die Meldung für die neuere Antwort wurde miterledigt — sie ginge ungesehen verloren");
  assert.equal(state.notifications[0].readAt, null, "die neuere Antwort gilt fälschlich als gelesen");
  await page.close();
});

test("7 — eine interne Adminnotiz erreicht den Kundenbereich nie", async () => {
  const GEHEIM = "INTERNER VERMERK NUR FUER DEN BETRIEB";
  const { page } = await openApp({
    notifications: [],
    supportRequests: [{
      id: 77, ticketNumber: "CE-SUP26-00077", category: "invoice", subject: "Frage zur Rechnung",
      status: "open", statusLabel: "Offen", createdAt: "2026-08-04T09:00:00.000Z", updatedAt: "2026-08-04T11:00:00.000Z",
      // Selbst wenn ein fehlerhafter Server das Feld mitschickte, darf es nirgends erscheinen.
      adminNote: GEHEIM,
    }],
    thread: {
      supportRequest: {
        id: 77, ticketNumber: "CE-SUP26-00077", category: "invoice", categoryLabel: "Rechnung",
        subject: "Frage zur Rechnung", status: "open", statusLabel: "Offen",
        createdAt: "2026-08-04T09:00:00.000Z", updatedAt: "2026-08-04T11:00:00.000Z", closedAt: null,
        adminNote: GEHEIM,
      },
      messages: [
        { id: null, authorRole: "customer", message: "Erstanfrage", createdAt: "2026-08-04T09:00:00.000Z", original: true },
        { id: 2, authorRole: "admin", message: "Öffentliche Antwort", createdAt: "2026-08-04T11:00:00.000Z", original: false },
      ],
    },
  });

  await page.goto(`${BASE}/dashboard?page=support`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sup-list", { timeout: 15_000 });
  assert.ok(!(await page.content()).includes(GEHEIM), "der interne Vermerk erscheint in der Kundenliste");

  await page.locator(".sup-list-item").first().click();
  await page.waitForSelector(".sup-msgs", { timeout: 15_000 });
  assert.ok(!(await page.content()).includes(GEHEIM), "der interne Vermerk erscheint im Kundenverlauf");
  const bodies = await page.locator(".sup-msg-body").allTextContents();
  assert.deepEqual(bodies.map((b) => b.trim()), ["Erstanfrage", "Öffentliche Antwort"]);
  await page.close();
});

// Genau EINE sichtbare Glocke — in JEDER Kombination aus Seite und Viewport.
//
// Regression: die Glocke wird an drei Stellen montiert (Kopfzeile der Übersicht,
// mobile Topbar, Seiten-Mount der Unterseiten). Welche davon sichtbar ist,
// entscheidet teils JSX (`page !== "overview"`), teils CSS (860-px-Schwelle) —
// beides zusammen wurde vorher nirgends geprüft. Ergebnis: unterhalb von 860 px
// standen auf der Übersicht ZWEI Glocken (Topbar + Kopfzeile) und auf jeder
// Unterseite ebenfalls ZWEI (Topbar + Seiten-Mount). Ein reiner Strukturtest
// findet das nicht, weil beide Elemente im DOM stehen und nur die Media Query
// über die Sichtbarkeit entscheidet.
for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 780 }]) {
  for (const [seite, erwartet] of [
    ["overview", "ntf-bell-overview"],
    ["invoices", viewport.width <= 860 ? "ntf-bell-topbar" : "ntf-bell-page"],
    ["shipments", viewport.width <= 860 ? "ntf-bell-topbar" : "ntf-bell-page"],
    ["profile", viewport.width <= 860 ? "ntf-bell-topbar" : "ntf-bell-page"],
  ]) {
    test(`8 — ${seite} bei ${viewport.width} px zeigt genau eine Glocke (${erwartet})`, async () => {
      const { page } = await openApp({ notifications: [notification({})], viewport });
      await page.goto(`${BASE}/dashboard?page=${seite}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".app-shell", { timeout: 20_000 });
      await visibleBell(page).waitFor({ timeout: 20_000 });
      const klassen = await page.locator(".ntf-bell").locator("visible=true").evaluateAll(
        (els) => els.map((e) => e.className.replace("ntf-bell ", "").trim()));
      assert.deepEqual(klassen, [erwartet],
        `auf „${seite}" bei ${viewport.width} px muss genau EINE Glocke sichtbar sein, sichtbar war: ${JSON.stringify(klassen)}`);
      await page.close();
    });
  }
}
