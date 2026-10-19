// E2E: Auftrag 2 / P8 (2026-10-17) — Kontakt-E-Mail und Telefon des Ansprechpartners.
// Echter Dev-Server, echter Browser; das Backend ist ein In-Memory-Mock mit demselben Vertrag wie
// PATCH /kunde/profil und GET /kundenbereich (die Datenbankseite misst Backend contact-details-pg).
//
//   A  eintragen, speichern, neu laden: dieselben Werte; die Login-E-Mail bleibt unverändert
//   B  ungültige Angaben: Fehler direkt am Feld, es geht keine Anfrage hinaus
//   C  ein Backend, das die Felder still ignoriert: kein „Gespeichert“, die Karte bleibt offen
//   D  Admin-Kundendetail: Kontakt-E-Mail und Kontakt-Telefon getrennt von der Login-E-Mail
//   E  390 px: Felder innerhalb der Karte, kein horizontaler Überlauf
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5284, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const LOGIN = "login@musterkunde.example";
const KUNDE = () => ({
  id: 7, email: LOGIN, name: "Anna Berger", company_name: "Musterkunde GmbH", role: "customer", status: "approved",
  country: "DE", zip: "70173", city: "Stuttgart", street: "Königstraße 1", vat_id: "DE123456789",
  customer_number: "CE-K-10031", payment_term: 14, contact_email: null, contact_phone: null,
});
const ADMIN = { id: 1, email: "admin@example.com", name: "Admin", role: "admin", status: "approved", country: "DE" };

let server, browser;

async function seite({ als = "kunde", ignoriereFelder = false, viewport = { width: 1440, height: 1000 } } = {}) {
  const page = await browser.newPage({ viewport });
  const zustand = { kunde: KUNDE(), patches: [] };
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/kundenbereich")) return json({ user: als === "admin" ? ADMIN : zustand.kunde, pendingEmailChange: null });
    if (pfad.endsWith("/kunde/profil") && req.method() === "PATCH") {
      const body = req.postDataJSON();
      zustand.patches.push(body);
      const neu = { ...zustand.kunde, name: body.name ?? zustand.kunde.name };
      if (!ignoriereFelder) {
        for (const k of ["contact_email", "contact_phone"]) {
          if (k in body) neu[k] = String(body[k]).replace(/\s+/g, " ").trim() || null;
        }
      }
      zustand.kunde = neu;
      // Ein altes Backend kennt die Spalten nicht: die Antwortzeile trägt sie dann gar nicht.
      const antwort = { ...neu };
      if (ignoriereFelder) { delete antwort.contact_email; delete antwort.contact_phone; }
      return json({ message: "OK", user: antwort, bookingProfile: null });
    }
    if (pfad.endsWith("/admin/users/7")) {
      return json({ user: { ...zustand.kunde, contact_email: "anna.berger@musterkunde.example", contact_phone: "+49 711 123456" },
                    summary: { shipments_total: 0, invoices_total: 0, invoices_productive: 0, invoices_unpaid: 0, invoices_overdue: 0, open_amount: 0 } });
    }
    if (pfad.includes("/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    return json({ items: [], users: [], shipments: [], invoices: [], drafts: [], addresses: [], summary: null, nextCursor: null, pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return { page, zustand, fehler };
}

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

async function zumProfil(page) {
  await page.goto(`${BASE}/dashboard?page=profile`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Ansprechpartner bearbeiten" }).waitFor({ timeout: 20000 });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("A — eintragen, speichern, neu laden: dieselben Werte; die Login-E-Mail bleibt", async () => {
  const { page, zustand, fehler } = await seite();
  await zumProfil(page);
  await page.getByRole("button", { name: "Ansprechpartner bearbeiten" }).click();
  await page.locator("#pf-contact-email").fill("anna.berger@musterkunde.example");
  await page.locator("#pf-contact-phone").fill("+49  711 123456");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.locator("#pf-contact-email").waitFor({ state: "detached", timeout: 10000 });
  assert.deepEqual(zustand.patches.at(-1), { name: "Anna Berger", contact_email: "anna.berger@musterkunde.example", contact_phone: "+49 711 123456" });
  assert.ok(!("email" in zustand.patches.at(-1)), "die Login-E-Mail im PATCH");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Ansprechpartner bearbeiten" }).waitFor({ timeout: 20000 });
  const text = norm(await page.locator("body").innerText());
  assert.ok(text.includes("E-Mail für Rückfragen anna.berger@musterkunde.example"), text.slice(0, 400));
  assert.ok(text.includes("Telefon +49 711 123456"));
  assert.ok(text.includes(LOGIN), "die Login-E-Mail fehlt");
  assert.equal(zustand.kunde.email, LOGIN);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B — ungültige Angaben: Fehler direkt am Feld, keine Anfrage", async () => {
  const { page, zustand } = await seite();
  await zumProfil(page);
  await page.getByRole("button", { name: "Ansprechpartner bearbeiten" }).click();
  await page.locator("#pf-contact-email").fill("anna@firma");
  await page.locator("#pf-contact-phone").fill("12345");
  const speichern = page.getByRole("button", { name: "Speichern" });
  // Ungültig heißt: nicht speicherbar — der Knopf sperrt, und es geht nichts hinaus.
  assert.equal(await speichern.isDisabled(), true, "ungültige Kontaktdaten sind speicherbar");
  assert.equal(zustand.patches.length, 0);
  await page.locator("#pf-contact-email").fill("anna@firma.de");
  await page.locator("#pf-contact-phone").fill("0711 123456");
  assert.equal(await speichern.isDisabled(), false);
  await page.close();
});

test("C — Backend ignoriert die Felder: kein „Gespeichert“, die Karte bleibt mit Hinweis offen", async () => {
  const { page, zustand } = await seite({ ignoriereFelder: true });
  await zumProfil(page);
  await page.getByRole("button", { name: "Ansprechpartner bearbeiten" }).click();
  await page.locator("#pf-contact-email").fill("anna@firma.de");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.getByText("Ihre Kontaktdaten wurden nicht übernommen.", { exact: false }).waitFor({ timeout: 10000 });
  assert.equal(await page.locator("#pf-contact-email").inputValue(), "anna@firma.de", "die Eingabe ging verloren");
  assert.equal(zustand.patches.length, 1);
  await page.close();
});

test("D — Admin-Kundendetail: Kontakt-E-Mail und Kontakt-Telefon getrennt von der Login-E-Mail", async () => {
  const { page, fehler } = await seite({ als: "admin" });
  await page.goto(`${BASE}/admin/users/7`, { waitUntil: "domcontentloaded" });
  await page.getByText("Kontakt-Telefon").waitFor({ timeout: 20000 });
  const text = norm(await page.locator("body").innerText());
  for (const teil of ["Kontakt-E-Mail anna.berger@musterkunde.example", "Kontakt-Telefon +49 711 123456", `Login-E-Mail ${LOGIN}`]) {
    assert.ok(text.includes(teil), `fehlt: ${teil}`);
  }
  assert.deepEqual(fehler, []);
  await page.close();
});

test("E — 390 px: Felder innerhalb der Karte, kein horizontaler Überlauf", async () => {
  const { page } = await seite({ viewport: { width: 390, height: 900 } });
  await zumProfil(page);
  await page.getByRole("button", { name: "Ansprechpartner bearbeiten" }).click();
  for (const id of ["#pf-name", "#pf-contact-email", "#pf-contact-phone"]) {
    const b = await page.locator(id).boundingBox();
    assert.ok(b && b.x >= 0 && b.x + b.width <= 390, `${id} ragt aus dem Bild`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  await page.close();
});
