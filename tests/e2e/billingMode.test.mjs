// Browser-Smokes: Abrechnungsart & Sammelrechnung (Paket 4).
//
// Echter Dev-Server, echte Kaskade, echte Requests — Backend vollständig gemockt.
// Genau die Wege, die eine Quelltextprüfung nicht erreicht:
//
//   • die Profilkarte zeigt den gespeicherten Modus und stellt ihn um,
//   • ein Einzelrechnungskonto fragt den Sammelzeitraum GAR NICHT ab,
//   • ein Sammelkonto zeigt Zeitraum, Anzahl, Betrag und den Vorschau-Vorbehalt,
//   • ein Ausfall der Vorschau bricht die Karte nicht,
//   • die Adminkarte stellt die Abrechnungsart um,
//   • 390 px ohne horizontalen Überlauf.
//
// NIEMALS eine echte Bestellung und NIE ein echter Sammelrechnungslauf: alle
// Backendrufe sind abgefangen, und der Adminlauf-Endpunkt wird hier nicht aufgerufen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5247, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const BASE_USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", city: "Berlin",
  street: "Musterstr. 1", customer_number: "CE-K-10030", payment_term: 7,
  delivery_note_mode: "none",
};

const PERIOD_OK = {
  billingMode: "consolidated_7d",
  period: { start: "2026-09-03", end: "2026-09-09", invoiceDate: "2026-09-10" },
  periodComplete: false,
  shipmentCount: 3,
  grossAmount: 46.65,
  shipmentsInEarlierPeriods: 0,
  shipments: [],
};

let server, browser;

async function setupRoutes(ziel, opts) {
  const state = opts.state;
  await ziel.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: { ...BASE_USER, billing_mode: state.mode } });

    if (p.endsWith("/kunde/profil") && method === "PATCH") {
      const body = JSON.parse(req.postData() || "{}");
      state.patches.push(body);
      if (typeof body.billing_mode === "string") state.mode = body.billing_mode;
      return json({ user: { ...BASE_USER, billing_mode: state.mode } });
    }

    if (p.endsWith("/kunde/consolidated-invoice/current")) {
      state.periodCalls += 1;
      if (state.periodFails) return json({ error: "Fehler" }, 500);
      return json(state.periodBody || PERIOD_OK);
    }

    // Es darf in diesem Lauf NIE eine Bestellung und NIE ein Sammellauf entstehen.
    if (p.endsWith("/book")) return json({ error: "im Smoke nicht erlaubt" }, 500);
    if (p.includes("/consolidated-invoices/run")) return json({ error: "im Smoke nicht erlaubt" }, 500);

    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    if (p.includes("/company-logo")) return json({ error: "kein Logo" }, 404);
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], summary: null, pagination: { total: 0 } });
  });
}

async function neueSeite(mode, extra = {}, viewport = { width: 1280, height: 1000 }) {
  const state = { mode, patches: [], periodCalls: 0, periodFails: false, periodBody: null, ...extra };
  const ctx = await browser.newContext({ viewport });
  await setupRoutes(ctx, { state });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.addInitScript(() => { localStorage.setItem("ce_token", "test-token"); });
  return { ctx, page, fehler, state };
}

async function zumProfil(page) {
  await page.goto(`${BASE}/dashboard?page=profile`, { waitUntil: "networkidle" });
  await page.waitForSelector("#bm-mode-single", { timeout: 15000 });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore", detached: false,
  });
  const deadline = Date.now() + 60000;
  for (;;) {
    try { const r = await fetch(BASE); if (r.ok || r.status < 500) break; } catch { /* noch nicht da */ }
    if (Date.now() > deadline) throw new Error("Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 300));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.kill("SIGTERM");
});

// ─────────────────────────────────────────────────────────────────────────────

test("B1 — die Karte zeigt den GESPEICHERTEN Modus, nicht einen Standard", async () => {
  const { ctx, page, fehler } = await neueSeite("consolidated_7d");
  await zumProfil(page);
  assert.equal(await page.locator("#bm-mode-consolidated_7d").isChecked(), true);
  assert.equal(await page.locator("#bm-mode-single").isChecked(), false);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B2 — ein Einzelrechnungskonto fragt den Sammelzeitraum GAR NICHT ab", async () => {
  // Ein Request, den ein Konto nie braucht, ist kein harmloser Zusatzaufruf: er
  // stünde in jedem Profilaufruf jedes Bestandskunden.
  const { ctx, page, state, fehler } = await neueSeite("single");
  await zumProfil(page);
  await page.waitForTimeout(600);
  assert.equal(state.periodCalls, 0, "kein Abruf des Sammelzeitraums erwartet");
  assert.equal(await page.locator(".bm-period").count(), 0, "kein Zeitraumblock bei Einzelabrechnung");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B3 — ein Sammelkonto zeigt Zeitraum, Anzahl, Betrag und den Vorbehalt", async () => {
  const { ctx, page, state, fehler } = await neueSeite("consolidated_7d");
  await zumProfil(page);
  await page.waitForSelector(".bm-period", { timeout: 15000 });
  const text = await page.locator(".bm-period").innerText();
  assert.ok(state.periodCalls >= 1, "der Zeitraum muss geholt werden");
  assert.match(text, /03\.09\.2026 – 09\.09\.2026/);
  assert.match(text, /10\.09\.2026/, "das voraussichtliche Rechnungsdatum fehlt");
  assert.match(text, /46,65/, "der voraussichtliche Betrag fehlt");
  assert.match(text, /Vorschau auf den laufenden Zeitraum/,
    "ohne Vorbehalt sähe der Betrag wie eine feststehende Rechnungssumme aus");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B4 — 0 Sendungen ergeben den leeren Zustand, keine leere Fläche", async () => {
  const { ctx, page, fehler } = await neueSeite("consolidated_7d", {
    periodBody: { billingMode: "consolidated_7d", period: null, shipmentCount: 0, grossAmount: 0, shipments: [] },
  });
  await zumProfil(page);
  await page.waitForSelector(".bm-period", { timeout: 15000 });
  assert.match(await page.locator(".bm-period").innerText(), /noch keine Sendung gebucht/);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B5 — ein Ausfall der Vorschau bricht die Karte nicht", async () => {
  const { ctx, page, fehler } = await neueSeite("consolidated_7d", { periodFails: true });
  await zumProfil(page);
  await page.waitForSelector(".bm-period", { timeout: 15000 });
  // Die Auswahl bleibt bedienbar, es steht nur eine ruhige Hinweiszeile darüber.
  assert.equal(await page.locator("#bm-mode-consolidated_7d").isChecked(), true);
  assert.match(await page.locator(".bm-period").innerText(), /konnte nicht geladen werden/);
  assert.deepEqual(fehler, [], "ein Ladefehler darf keinen Renderfehler erzeugen");
  await ctx.close();
});

test("B6 — die Umstellung sendet GENAU einen Schlüssel über den Profil-PATCH", async () => {
  const { ctx, page, state, fehler } = await neueSeite("single");
  await zumProfil(page);
  await page.locator("#bm-mode-consolidated_7d").click();
  await page.waitForSelector(".profile-saved", { timeout: 15000 });
  assert.equal(state.patches.length, 1, "genau ein PATCH");
  assert.deepEqual(state.patches[0], { billing_mode: "consolidated_7d" },
    "der Body darf ausschließlich die Abrechnungsart tragen");
  // Und die Serverwahrheit übernimmt: der Zeitraum wird daraufhin geholt.
  await page.waitForSelector(".bm-period", { timeout: 15000 });
  assert.ok(state.periodCalls >= 1);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B7 — ein erneuter Klick auf denselben Modus sendet nichts", async () => {
  const { ctx, page, state, fehler } = await neueSeite("consolidated_7d");
  await zumProfil(page);
  await page.locator("#bm-mode-consolidated_7d").click({ force: true });
  await page.waitForTimeout(500);
  assert.equal(state.patches.length, 0, "ein No-Op darf keinen Request erzeugen");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B8 — 390 px: kein horizontaler Überlauf", async () => {
  const { ctx, page, fehler } = await neueSeite("consolidated_7d", {}, { width: 390, height: 900 });
  await zumProfil(page);
  await page.waitForSelector(".bm-period", { timeout: 15000 });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `horizontaler Überlauf: ${overflow}px`);
  assert.deepEqual(fehler, []);
  await ctx.close();
});
