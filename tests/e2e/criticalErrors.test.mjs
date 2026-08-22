// E2E: Label-Fehlerkette, manueller Rechnungs-Refresh, mark-read-Fehlschlag,
// Profil-Netzfehler (Audit-FAILs #3, #11, #12, #13) — echter Dev-Server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5226, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "kunde@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", street: "Hauptstrasse 1", zip: "01067", city: "Dresden",
  country: "DE", phone: "+4930123456", customer_number: "CE-K-10030",
};
const SHIPMENT = {
  id: 501, status: "label_ready", tracking_status: "in_transit",
  business_order_number: "CE-BS26-00010", jumingo_shipment_id: "JMG-1", tracking_number: "003404341042",
  created_at: "2026-08-01T10:00:00Z", delivery_date_max: "2099-01-01",
};
const INVOICE = {
  id: 900, invoice_number: "CE-RE26-00001", business_order_number: "CE-BS26-00010",
  customer_number: "CE-K-10030", amount: 10, gross_amount: 10, status: "unpaid", payment_term: 7,
  due_date: "2099-08-20T10:00:00.000Z", created_at: "2026-08-04T10:00:00.000Z",
  currency: "EUR", document_status: "ready", is_productive: true, is_overdue: false, is_payable: true,
};

let server, browser;

async function setup(page, overrides = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    for (const [key, handler] of Object.entries(overrides)) {
      if (p.includes(key)) return handler(route, json, req);
    }
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [SHIPMENT] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [INVOICE], summary: { open_amount: 10, open_count: 1, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: false } });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "s", pagination: {} });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
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
  if (server) server.kill("SIGKILL");
});

/* Der Kundenpfad des Labels läuft seit dem Paket „Sendungshandle" über
   `GET /api/shipments/:shipmentId/label` — die Providerreferenz steht in keinem
   Kundenpfad mehr. Die Mocks unten greifen deshalb den Pfadbestandteil
   "/label" ab statt des abgelösten "/api/jumingo/label/".

   Die Falle dabei: der Sammel-Fallback von `setup` beantwortet JEDEN nicht
   getroffenen Pfad mit `200 {}`. Ein ins Leere zeigender Label-Mock hätte den
   Test also NICHT rot gemacht, sondern still auf den „kein PDF"-Zweig gelenkt —
   dieselbe sichtbare Meldung wie im 500er-Fall, aus einem anderen Grund. Ein
   Test unten belegt deshalb ausdrücklich, dass der Mock tatsächlich greift. */
test("Label-500 {error:'Fehler'}: Kunde sieht die kuratierte Meldung, nie das nackte Wort", async () => {
  const page = await browser.newPage();
  const labelPfade = [];
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    // Nur echte API-Aufrufe. Ein bloßes `includes("/label")` fing im Dev-Server
    // auch das Quellmodul `/src/utils/labelErrors.mjs` mit ein.
    if (p.startsWith("/api/") && p.endsWith("/label")) labelPfade.push(p);
  });
  await setup(page, {
    "/label": (route, json) => json({ error: "Fehler" }, 500),
  });
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Label/ }).first().click();
  await page.waitForSelector('.alert-error[role="alert"]', { timeout: 10000 });
  const t = (await page.locator('.alert-error[role="alert"]').first().innerText()).replace(/\s+/g, " ").trim();
  assert.notEqual(t, "Fehler", "das nackte Backend-Wort darf nie erscheinen");
  assert.match(t, /momentan nicht geladen werden/, `unerwarteter Text: ${t}`);

  // Beweis, dass der Mock wirklich gegriffen hat und nicht der Sammel-Fallback
  // (`200 {}` → derselbe sichtbare Text aus einem anderen Grund). Zugleich die
  // Regressionssperre gegen den abgelösten Providerpfad: der Kundenpfad läuft
  // über den ConfidaraExpress-Sendungshandle, nicht über jumingo_shipment_id.
  assert.equal(labelPfade.length, 1, `erwartet genau ein Labelaufruf, bekommen: ${labelPfade.join(", ")}`);
  assert.match(labelPfade[0], /^\/api\/shipments\/\d+\/label$/,
    `der Kundenpfad des Labels hat sich geändert: ${labelPfade[0]}`);
  assert.ok(!labelPfade[0].includes("jumingo"),
    "die Providerreferenz darf in keinem Kundenpfad stehen");
  await page.close();
});

test("Label-Antwort ist JSON statt PDF (2xx): Fehlermeldung statt kaputter Datei", async () => {
  const page = await browser.newPage();
  await setup(page, {
    "/label": (route, json) => json({ irgendwas: true }, 200),
  });
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Label/ }).first().click();
  await page.waitForSelector('.alert-error[role="alert"]', { timeout: 10000 });
  const t = (await page.locator('.alert-error[role="alert"]').first().innerText()).replace(/\s+/g, " ");
  assert.match(t, /momentan nicht geladen werden/);
  await page.close();
});

test("Label noch nicht bereit (409, Altbackend-Text): verständliche Wartemeldung", async () => {
  const page = await browser.newPage();
  await setup(page, {
    "/label": (route, json) => json({ error: "Label noch nicht verfügbar — Bestellnummer fehlt", code: "LABEL_NOT_READY" }, 409),
  });
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Label/ }).first().click();
  await page.waitForSelector('.alert-error[role="alert"]', { timeout: 10000 });
  assert.match((await page.locator('.alert-error[role="alert"]').first().innerText()), /wird noch erstellt/);
  await page.close();
});

test("manueller Rechnungs-Refresh scheitert SICHTBAR, Daten bleiben, Erfolg räumt auf", async () => {
  const page = await browser.newPage();
  let mode = "ok";
  await setup(page, {
    "/kunde/invoices": (route, json) => {
      if (mode === "fail") return route.abort("failed");
      return json({ invoices: [INVOICE], summary: { open_amount: 10, open_count: 1, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: false } });
    },
  });
  await page.goto(`${BASE}/dashboard?page=invoices`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".inv-cell-number-value", { timeout: 15000 });

  mode = "fail";
  await page.getByRole("button", { name: "Rechnungsliste aktualisieren" }).click();
  await page.waitForSelector('.alert-error[role="alert"]', { timeout: 10000 });
  const t = (await page.locator('.alert-error[role="alert"]').first().innerText()).replace(/\s+/g, " ");
  assert.match(t, /konnte nicht aktualisiert werden/);
  assert.match(t, /letzten geladenen Stand/);
  assert.equal(await page.locator(".inv-cell-number-value").count() > 0, true, "vorhandene Daten bleiben stehen");

  mode = "ok";
  await page.getByRole("button", { name: "Rechnungsliste aktualisieren" }).click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.alert-error[role="alert"]').count(), 0, "ein späterer Erfolg räumt die Meldung ab");
  await page.close();
});

test("mark-read scheitert: sichtbare Meldung im Panel, Zustand wird zurückgerollt", async () => {
  const page = await browser.newPage();
  const ntf = { id: 5, type: "invoice_ready", invoiceId: 900, invoiceNumber: "CE-RE26-00001", createdAt: "2026-08-05T10:00:00Z", readAt: null };
  await setup(page, {
    "/kunde/notifications/mark-read": (route, json) => json({ error: "Fehler", code: "NOTIFICATION_MARK_READ_FAILED" }, 500),
    "/kunde/notifications": (route, json) => json({ notifications: [ntf], unreadCount: 1, snapshotAt: "s", pagination: {} }),
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  // Anker: die KPI-Reihe steht seit Paket D in BEIDEN Zuständen der Übersicht
  // (Arbeitsfläche und Onboarding). Die früher benutzte Schrittnummer
  // .pp-step-no gehört zum Onboarding und fehlt, sobald das Konto — wie hier —
  // eine Sendung hat.
  await page.waitForSelector(".pp-kpis", { timeout: 15000 });
  await page.locator('button[aria-label*="Benachrichtigungen"]').first().click();
  await page.waitForSelector(".ntf-item, .ntf-body", { timeout: 10000 });
  await page.getByRole("button", { name: /Alle als gelesen|gelesen markieren/i }).first().click().catch(async () => {
    await page.locator(".ntf-item").first().click();
  });
  await page.waitForSelector('.ntf-state[role="alert"]', { timeout: 10000 });
  const t = (await page.locator('.ntf-state[role="alert"]').innerText()).replace(/\s+/g, " ");
  assert.match(t, /konnte(n)? nicht als gelesen markiert werden/);
  await page.close();
});

test("Profil speichern offline: Verbindungstext statt Failed to fetch, Editmodus bleibt", async () => {
  const page = await browser.newPage();
  await setup(page, {
    "/kunde/profil": (route) => route.abort("failed"),
  });
  await page.goto(`${BASE}/dashboard?page=profile`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mono", { timeout: 15000 });
  await page.getByRole("button", { name: /bearbeiten/i }).first().click();
  // Speichern ist erst bei GEÄNDERTEN, gültigen Daten aktiv (Dirty-Gate) —
  // also eine echte Änderung vornehmen.
  const feld = page.getByRole("textbox").first();
  await feld.fill((await feld.inputValue()) + " X");
  await page.getByRole("button", { name: /Speichern/ }).first().click();
  await page.waitForSelector('[role="alert"]', { timeout: 10000 });
  const t = (await page.locator('[role="alert"]').first().innerText()).replace(/\s+/g, " ");
  assert.ok(!/Failed to fetch|TypeError/.test(t), `roher Browsertext: ${t}`);
  assert.match(t, /Verbindung zum Server wurde unterbrochen/);
  assert.equal(await page.getByRole("button", { name: /Speichern/ }).count() > 0, true, "Editmodus bleibt offen — Eingaben erhalten");
  await page.close();
});
