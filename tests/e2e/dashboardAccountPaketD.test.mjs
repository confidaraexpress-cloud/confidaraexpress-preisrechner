// E2E: Übersicht, Konto und Kommunikation (Paket D) — echter Dev-Server.
//
// Prüft das, was eine reine Quelltextprüfung nicht erreicht: dass die Übersicht
// bei vorhandenen Daten tatsächlich die operativen Module zeigt (und die
// Marketingabschnitte nicht), dass ein leeres Konto weiterhin geführt wird,
// dass die Initialen überall dasselbe Zeichen tragen, dass der Passwortbereich
// geschlossen startet und dass es in keiner Kombination zwei Glocken oder zwei
// Avatare gibt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5227, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};
const SHIPMENTS = [
  { id: 1, jumingo_shipment_id: "js1", status: "booked", weight: 5, price_final: 22.19, selected_carrier: "dhl", created_at: "2026-08-05T10:00:00Z", order_number: "CE-1001" },
  { id: 2, jumingo_shipment_id: "js2", status: "label_ready", weight: 2, price_final: 12.5, selected_carrier: "ups", created_at: "2026-08-06T09:00:00Z", order_number: "CE-1002" },
];
const INVOICES = [{ id: 1, invoice_number: "RE-2026-0001", status: "open", is_overdue: true, gross_amount: 42.5, currency: "EUR", issued_at: "2026-08-01T00:00:00Z", due_date: "2026-07-20", document_status: "ready", download_available: true }];
const SUMMARY = { open_count: 1, open_amount: 42.5, overdue_count: 1, next_due_date: "2026-07-20", currency: "EUR" };
const NTF = {
  notifications: [{ id: 11, type: "invoice_overdue", readAt: null, invoiceId: 1, invoiceNumber: "RE-2026-0001", createdAt: "2026-08-06T08:00:00Z", updatedAt: "2026-08-06T08:00:00Z" }],
  unreadCount: 1, snapshotAt: "2026-08-06T10:00:00Z", pagination: {},
};

let server, browser;

async function setupRoutes(page, { empty = false } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: empty ? [] : SHIPMENTS });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: empty ? [] : INVOICES, summary: empty ? null : SUMMARY });
    if (p.includes("/kunde/notifications/unread-count")) return json({ unreadCount: empty ? 0 : 1, snapshotAt: "2026-08-06T10:00:00Z" });
    if (p.includes("/kunde/notifications")) return json(empty ? { notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} } : NTF);
    if (p.includes("/support")) return json({ supportRequests: [] });
    if (p.includes("/api/kunde/")) return json({ items: [], drafts: [], nextCursor: null, pagination: { total: 0 } });
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

test("die Übersicht ist bei vorhandenen Daten eine operative Arbeitsfläche", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ov-mod-grid", { timeout: 20000 });

  // Die frühere Schnellaktionen-Sektion ist ersatzlos entfernt — dieselben
  // Ziele stehen bereits dauerhaft in der Sidebar.
  assert.equal(await page.locator(".ov-quick-card").count(), 0, "die Schnellaktionen sind zurück");
  assert.ok(await page.locator(".ov-list-row").first().isVisible(), "die letzten Sendungen fehlen");
  assert.ok(await page.locator(".ov-inv-amount").isVisible(), "die offenen Rechnungen fehlen");
  assert.match(await page.locator(".ov-inv-overdue .badge--overdue").innerText(), /überfällig/);

  // Die Marketingabschnitte bilden nicht mehr den Hauptteil …
  assert.equal(await page.locator(".pp-flow").count(), 0, "„Ablauf\" steht noch auf der Arbeitsfläche");
  assert.equal(await page.locator(".pp-bento").count(), 0, "„Vorteile\" steht noch auf der Arbeitsfläche");
  assert.equal(await page.locator(".pp-trust").count(), 0, "der Trust-Block steht noch auf der Arbeitsfläche");
  // … das Carrier-Netzwerk als Markenfläche bleibt.
  assert.ok(await page.locator(".pp-net").isVisible(), "das Carrier-Netzwerk fehlt");
  await page.close();
});

test("ein leeres Konto wird geführt statt mit leeren Tabellen begrüßt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { empty: true });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pp-flow", { timeout: 20000 });
  await page.waitForTimeout(400);

  assert.ok(await page.locator(".pp-flow").isVisible(), "das Onboarding fehlt");
  assert.ok(await page.locator(".pp-bento").isVisible(), "die Vorteile fehlen im Onboarding");
  assert.equal(await page.locator(".ov-list-row").count(), 0, "leere Sendungsliste statt Onboarding");
  // Auch im Onboarding gibt es keine Schnellaktionen mehr — ersatzlos entfernt
  // in beiden Zuständen, kein Platzhalter.
  assert.equal(await page.locator(".ov-quick-card").count(), 0, "die Schnellaktionen sind im Onboarding zurück");
  await page.close();
});

test("Benutzerchip und Profilhero zeigen dieselbe Initiale", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=profile`, { waitUntil: "domcontentloaded" });
  // Auf den Profilhero eingegrenzt. `.profile-avatar-lg` allein trifft seit dem
  // Firmenlogo-Paket ZWEI Elemente: den Hero und die Initialenfläche der Karte
  // „Unternehmenslogo" (CompanyLogoPreview zeigt sie, solange kein Logo
  // hinterlegt ist — hier der Fall, der Mock liefert keines). Beide zeigen
  // dieselbe Initiale aus derselben Quelle; gemeint ist hier der Hero.
  const heroAvatar = page.locator(".profile-account-identity .profile-avatar-lg");
  await heroAvatar.waitFor({ state: "visible", timeout: 20000 });

  const profil = (await heroAvatar.innerText()).trim();
  const chip = (await page.locator(".ce-comark text").evaluate((el) => el.textContent)).trim();
  assert.equal(profil, "M", "die Initiale stammt nicht aus dem Firmennamen „Muster GmbH“");
  assert.equal(chip, profil, "Benutzerchip und Profil zeigen verschiedene Initialen");

  // Die frühere Firmenkarte in der Sidebar (Avatar + Firmenname + E-Mail) ist
  // ersatzlos entfernt — kein Aufruf, kein Platzhalter.
  assert.equal(await page.locator(".pp-identity").count(), 0, "die Firmenkarte ist in der Sidebar zurück");
  await page.close();
});

test("der Passwortbereich startet geschlossen und stellt sich per Abbrechen wieder her", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=profile`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".profile-password-section", { timeout: 20000 });

  assert.equal(await page.locator("#pf-pw-current").count(), 0, "das Formular steht offen");
  await page.getByRole("button", { name: /Passwort ändern/ }).click();
  await page.waitForSelector("#pf-pw-current", { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.activeElement?.id), "pf-pw-current",
    "der Fokus landet nicht im ersten Feld");

  await page.getByRole("button", { name: "Abbrechen" }).click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator("#pf-pw-current").count(), 0, "Abbrechen stellt den geschlossenen Zustand nicht her");
  await page.close();
});

test("der Supportdialog nutzt das globale Dialogsystem, fängt den Fokus und schließt per Escape", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=support`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ce-state, .sup-list-item", { timeout: 20000 });

  await page.getByRole("button", { name: /Neue Anfrage/ }).first().click();
  await page.waitForSelector(".sup-dialog-card", { timeout: 10000 });
  assert.equal(await page.locator(".sup-dialog-card .field-input").count(), 3,
    "der Dialog nutzt nicht die globalen Formularfelder");
  assert.ok(await page.evaluate(() => !!document.activeElement?.closest(".sup-dialog-card")),
    "der Fokus steht beim Öffnen nicht im Dialog");
  const aktionen = await page.locator(".sup-dialog-actions button").allInnerTexts();
  assert.deepEqual(aktionen.map((t) => t.trim()), ["Abbrechen", "Anfrage senden"],
    "die bestätigende Aktion steht nicht rechts außen");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".sup-dialog-card").count(), 0, "Escape schließt den Dialog nicht");
  await page.close();
});

test("in jeder Kombination aus Seite und Viewport gibt es genau EINE Glocke und EINEN Avatar", async () => {
  for (const [breite, seite] of [[1440, "/dashboard"], [1440, "/dashboard?page=shipments"], [390, "/dashboard"], [390, "/dashboard?page=shipments"]]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 900 } });
    await setupRoutes(page);
    await page.goto(`${BASE}${seite}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".main-content", { timeout: 20000 });
    await page.waitForTimeout(400);
    const glocken = await page.locator(".ntf-bell:visible").count();
    const avatare = await page.locator(".pp-uchip:visible").count();
    assert.equal(glocken, 1, `${breite}px ${seite}: ${glocken} Glocken statt einer`);
    assert.ok(avatare <= 1, `${breite}px ${seite}: ${avatare} Benutzerchips`);
    await page.close();
  }
});

test("kein horizontaler Überlauf auf Übersicht, Profil und Support (Mobil 390px)", async () => {
  for (const url of ["/dashboard", "/dashboard?page=profile", "/dashboard?page=support"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await setupRoutes(page);
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".main-content", { timeout: 20000 });
    await page.waitForTimeout(300);
    const scrollbar = await page.evaluate(() => {
      const before = window.scrollX;
      window.scrollTo(9999, 0);
      const after = window.scrollX;
      window.scrollTo(before, 0);
      return after > 0;
    });
    assert.equal(scrollbar, false, `${url} lässt sich horizontal scrollen`);
    await page.close();
  }
});
