// E2E: Go-Live Paket G — Schaden oder Verlust über den Supportdialog.
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route) — es entsteht keine echte
// Anfrage. Vom Request-Body werden nur Kategorie und Sendungsbezug geprüft.
//
//   A — andere Kategorie: keine Sendungsauswahl, kein Hinweis, Body ohne Sendungsbezug, keine Listenabfrage
//   B — Schaden oder Verlust: Auswahl der EIGENEN Sendungen (AB-Nummer, Datum, Carrier) + Hinweis;
//       ohne Auswahl kein Absenden
//   C — gewählte Sendung: genau EIN Request mit ihrer internen ID, nie eine AB-Nummer im Body
//   D — Serverantwort „Sendung nicht im Konto“: Meldung im Dialog, Auswahl bleibt erhalten
//   E — Liste nicht ladbar: Hinweis + „Erneut laden“, danach Auswahl; mobil ohne Überlauf
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5496, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};
const SENDUNGEN = [
  { id: 42, status: "booked", order_confirmation_number: "CE-AB26-00042", created_at: "2026-10-14T08:00:00Z", selected_carrier: "dhl" },
  { id: 7, status: "delivered", order_confirmation_number: null, created_at: "2026-10-01T08:00:00Z", selected_carrier: "ups" },
];

let server, browser;

// Die Dashboardseite lädt die Sendungsliste selbst schon beim Öffnen. Gezählt bzw. zum Scheitern
// gebracht wird deshalb erst, was NACH dem Öffnen des Dialogs kommt (state.failNextList).
async function setup(page, { postStatus = 201, postBody = null } = {}) {
  const state = { posts: [], listCalls: 0, failNextList: false };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/support-requests") && req.method() === "POST") {
      const b = req.postDataJSON();
      state.posts.push({ category: b.category, shipmentId: b.shipmentId, keys: Object.keys(b).sort() });
      if (postStatus !== 201) return json(postBody || {}, postStatus);
      return json({ supportRequest: { id: 5, ticketNumber: "CE-SUP26-00005", category: b.category, status: "open" },
        message: "ok" }, 201);
    }
    if (p.endsWith("/kunde/shipments")) {
      state.listCalls += 1;
      if (state.failNextList) { state.failNextList = false; return json({ error: "Fehler" }, 500); }
      return json({ shipments: SENDUNGEN });
    }
    if (p.includes("/kunde/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "2026-10-14T10:00:00Z" });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/support")) return json({ supportRequests: [] });
    return json({ items: [], drafts: [], invoices: [], nextCursor: null, pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return state;
}

async function dialogOeffnen(page) {
  await page.goto(`${BASE}/dashboard?page=support`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ce-state, .sup-list-item", { timeout: 20000 });
  await page.getByRole("button", { name: /Neue Anfrage/ }).first().click();
  await page.waitForSelector(".sup-dialog-card", { timeout: 10000 });
}
const kategorie = (page) => page.locator(".sup-dialog-card select").first();
const sendung = (page) => page.getByLabel("Betroffene Sendung");
const betreff = (page) => page.locator('.sup-dialog-card input[placeholder="Worum geht es?"]');
const nachricht = (page) => page.locator(".sup-dialog-card textarea");
const senden = (page) => page.locator('.sup-dialog-card button[type="submit"]');

async function ausfuellen(page, kat) {
  await kategorie(page).selectOption(kat);
  await betreff(page).fill("Paket beschädigt angekommen");
  await nachricht(page).fill("Der Karton war eingedrückt, die Ware ist zerbrochen.");
}
async function optionenGeladen(page) {
  await page.waitForFunction(() => {
    const s = [...document.querySelectorAll(".sup-dialog-card select")][1];
    return s && !s.disabled && s.options.length > 1;
  }, undefined, { timeout: 10000 });
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

test("A — andere Kategorie: keine Auswahl, kein Hinweis, Body ohne Sendungsbezug, keine Listenabfrage", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await dialogOeffnen(page);
  const vorher = state.listCalls;
  await ausfuellen(page, "booking");
  assert.equal(await page.locator(".sup-dialog-card select").count(), 1, "Sendungsauswahl bei anderer Kategorie");
  assert.equal(await page.locator(".sup-dialog-damage-hint").count(), 0);
  await senden(page).click();
  await page.waitForSelector(".sup-dialog-success", { timeout: 10000 });
  assert.deepEqual(state.posts, [{ category: "booking", shipmentId: undefined, keys: ["category", "message", "subject"] }]);
  assert.equal(state.listCalls, vorher, "der Dialog lud die Sendungsliste ohne Schadenskategorie");
  await page.close();
});

test("B — Schaden oder Verlust: Auswahl der eigenen Sendungen + Hinweis; ohne Auswahl kein Absenden", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await dialogOeffnen(page);
  await ausfuellen(page, "damage");
  await optionenGeladen(page);
  assert.match(await page.locator(".sup-dialog-damage-hint").innerText(), /so schnell wie möglich/);
  const optionen = await sendung(page).locator("option").allInnerTexts();
  assert.deepEqual(optionen.map((t) => t.trim()), [
    "Bitte Sendung wählen", "CE-AB26-00042 · 14.10.2026 · DHL", "Sendung ohne Vorgangsnummer · 01.10.2026 · UPS",
  ]);
  assert.equal(await senden(page).isDisabled(), true, "ohne Sendung absendbar");
  await nachricht(page).press("Enter");
  await page.waitForTimeout(300);
  assert.equal(state.posts.length, 0, "es ging ein Request hinaus");
  await page.close();
});

test("C — gewählte Sendung: genau EIN Request mit ihrer internen ID, keine AB-Nummer im Body", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setup(page);
  await dialogOeffnen(page);
  await ausfuellen(page, "damage");
  await optionenGeladen(page);
  await sendung(page).selectOption("42");
  assert.equal(await senden(page).isDisabled(), false);
  await senden(page).click();
  await page.waitForSelector(".sup-dialog-success", { timeout: 10000 });
  assert.deepEqual(state.posts, [{ category: "damage", shipmentId: 42, keys: ["category", "message", "shipmentId", "subject"] }]);
  await page.close();
});

test("D — „Sendung nicht im Konto“: Meldung im Dialog, Auswahl bleibt erhalten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setup(page, { postStatus: 400, postBody: { code: "SUPPORT_SHIPMENT_NOT_FOUND", error: "Rohtext", field: "shipmentId" } });
  await dialogOeffnen(page);
  await ausfuellen(page, "damage");
  await optionenGeladen(page);
  await sendung(page).selectOption("7");
  await senden(page).click();
  await page.waitForSelector(".sup-dialog-error", { timeout: 10000 });
  assert.match(await page.locator(".sup-dialog-error").innerText(), /in Ihrem Konto nicht/);
  assert.ok(!/Rohtext/.test(await page.locator(".sup-dialog-error").innerText()), "Servertext roh angezeigt");
  assert.equal(await sendung(page).inputValue(), "7", "die Auswahl ging verloren");
  await page.close();
});

test("E — Liste nicht ladbar: Hinweis und „Erneut laden“; mobil (375 px) ohne Überlauf", async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  const state = await setup(page);
  await dialogOeffnen(page);
  const vorher = state.listCalls;
  state.failNextList = true;
  await kategorie(page).selectOption("damage");
  await page.getByRole("button", { name: "Erneut laden" }).waitFor({ timeout: 10000 });
  assert.match(await page.locator(".sup-dialog-card").innerText(), /konnten nicht geladen werden/);
  assert.equal(await sendung(page).isDisabled(), true, "Auswahl ohne geladene Liste bedienbar");
  await page.getByRole("button", { name: "Erneut laden" }).click();
  await optionenGeladen(page);
  assert.equal(state.listCalls, vorher + 2, "erneutes Laden fragte die Liste nicht neu ab");
  const m = await page.evaluate(() => {
    const karte = document.querySelector(".sup-dialog-card").getBoundingClientRect();
    const hinweis = document.querySelector(".sup-dialog-damage-hint").getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, w: window.innerWidth, karteRechts: karte.right, hinweisRechts: hinweis.right };
  });
  assert.ok(m.sw <= m.w, `waagrechter Überlauf: ${JSON.stringify(m)}`);
  assert.ok(m.hinweisRechts <= m.karteRechts + 0.5, `Hinweis ragt aus der Karte: ${JSON.stringify(m)}`);
  await page.close();
});
