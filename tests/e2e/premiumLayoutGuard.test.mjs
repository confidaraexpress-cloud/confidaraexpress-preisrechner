// E2E: Layoutwächter des Premium-Redesigns (Etappe 1, Betreiberentscheidungen 2026-10-27).
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — keine Buchung, kein Konto, kein Anbieter.
//
// Kernseiten des Kundenbereichs und der Anmeldung in sieben Breiten (360 bis 1920 px). Je Seite und Breite:
//   • der Bereich ist gesetzt (data-ce-bereich) — sonst prüfte die Suite das alte Design,
//   • kein horizontaler Überlauf der Seite,
//   • kein abgeschnittener Text (overflow hidden/clip ohne gewollte Ellipse),
//   • kein Umbruch innerhalb eines zusammengehaltenen Werts (.ce-wert, utils/keepValuesTogether.mjs).
// Lange, realistische Angaben (Firma, E-Mail, Vorgangsnummern) belasten die Umbrüche wie im Betrieb.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5631, BASE = `http://127.0.0.1:${PORT}`;
const BREITEN = [360, 390, 430, 768, 1024, 1440, 1920];
const HOEHE = { 360: 780, 390: 844, 430: 932, 768: 1024, 1024: 768, 1440: 900, 1920: 1080 };

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const KUNDE = { id: 1, email: "einkauf.zentrallager@muster-praezisionsmechanik.example", name: "Dr. Maximiliane Schulze-Wolfenbüttel",
  company_name: "Muster Präzisionsmechanik und Industrieautomation GmbH & Co. KG", role: "customer", status: "approved",
  country: "DE", zip: "70173", city: "Stuttgart", customer_number: "CE-K-10030", payment_term: 7 };
const SHIPMENTS = [
  { id: 101, status: "delivered", weight: 5, price_final: 1234.56, selected_carrier: "dhl", created_at: "2026-10-20T10:00:00Z",
    order_number: "CE-1001", order_confirmation_number: "CE-AB26-00041", tracking_number: "00340434161094042557" },
  { id: 102, status: "in_transit", weight: 2, price_final: 12.5, selected_carrier: "ups", created_at: "2026-10-23T09:00:00Z",
    order_number: "CE-1002", order_confirmation_number: "CE-AB26-00042", tracking_number: "1Z999AA10123456784" },
  { id: 103, status: "booked", weight: 1.5, price_final: 9.4, selected_carrier: "gls", created_at: "2026-10-26T08:15:00Z",
    order_number: "CE-1003", order_confirmation_number: "CE-AB26-00043" },
];
const INVOICES = [
  { id: 1, invoice_number: "CE-RE26-00031", status: "open", is_overdue: true, gross_amount: 12345.67, amount: 12345.67, currency: "EUR",
    issued_at: "2026-10-05T00:00:00Z", due_date: "2026-10-12", document_status: "ready" },
  { id: 2, invoice_number: "CE-RE26-00034", status: "paid", is_overdue: false, gross_amount: 38.9, amount: 38.9, currency: "EUR",
    issued_at: "2026-10-24T00:00:00Z", due_date: "2026-10-31", paid_at: "2026-10-25T00:00:00Z", document_status: "ready" },
];
const SUMMARY = { open_count: 1, open_amount: 12345.67, overdue_count: 1, next_due_date: "2026-10-12", currency: "EUR" };
const CREDIT = { limit: 25000, open: 12345.67, reserved: 1234.5, available: 11419.83, exhausted: false, currency: "EUR" };
const STATS = { total: 3, active: 2, in_transit: 1, delivered_this_month: 1, delayed: 0 };

const SEITEN = [
  { name: "Übersicht", pfad: "/dashboard", warte: ".ov-mod-grid", bereich: "kunde" },
  { name: "Sendungen", pfad: "/dashboard?page=shipments", warte: ".shipment-table", bereich: "kunde" },
  { name: "Rechnungen", pfad: "/dashboard?page=invoices", warte: ".inv-table", bereich: "kunde" },
  { name: "Anmeldung", pfad: "/login", warte: "#auth-email", bereich: "auth", gast: true },
  { name: "Registrierung", pfad: "/register", warte: "#reg-name", bereich: "auth", gast: true },
];

let server, browser;

async function routen(page, gast) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) }).catch(() => {});
    if (p.endsWith("/kundenbereich")) return gast ? json({ error: "Nicht angemeldet" }, 401) : json({ user: KUNDE });
    if (p.endsWith("/kunde/credit")) return json({ credit: CREDIT });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: SHIPMENTS, stats: STATS, nextCursor: null });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: INVOICES, summary: SUMMARY, nextCursor: null });
    if (p.includes("/kunde/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "2026-10-26T10:00:00Z" });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/support")) return json({ supportRequests: [] });
    if (p.includes("/legal/")) return json({});
    if (p.includes("/api/kunde/")) return json({ items: [], drafts: [], nextCursor: null, pagination: { total: 0 } });
    return json({});
  });
  if (!gast) await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

// Die Messung im Browser: Bereich, Querüberlauf, abgeschnittener Text, zerrissene Werte.
function messen() {
  const sichtbar = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const pfad = (el) => {
    const teile = [];
    for (let e = el; e && e !== document.body && teile.length < 4; e = e.parentElement) {
      teile.unshift(e.tagName.toLowerCase() + (e.id ? `#${e.id}` : "") + (e.classList.length ? `.${[...e.classList].slice(0, 2).join(".")}` : ""));
    }
    return teile.join(" > ");
  };
  const out = {
    bereich: document.documentElement.getAttribute("data-ce-bereich"),
    querUeberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    abgeschnitten: [],
    wertumbruch: [],
  };
  for (const el of document.querySelectorAll("body *")) {
    if (!sichtbar(el) || el.closest(".sr-only, .pc-sr-only, [aria-hidden='true']")) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
    const s = getComputedStyle(el);
    if (!/(hidden|clip)/.test(s.overflowX) || s.textOverflow === "ellipsis") continue;
    if (el.scrollWidth > el.clientWidth + 1) out.abgeschnitten.push(`${pfad(el)} „${el.textContent.trim().slice(0, 40)}“`);
  }
  for (const el of document.querySelectorAll(".ce-wert")) {
    if (sichtbar(el) && el.getClientRects().length > 1) out.wertumbruch.push(`${pfad(el)} „${el.textContent.trim()}“`);
  }
  return out;
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

for (const seite of SEITEN) {
  test(`${seite.name}: in sieben Breiten ohne Überlauf, ohne abgeschnittenen Text, ohne zerrissene Werte`, async () => {
    const befunde = [];
    for (const breite of BREITEN) {
      const ctx = await browser.newContext({ viewport: { width: breite, height: HOEHE[breite] }, locale: "de-DE", timezoneId: "Europe/Berlin" });
      const page = await ctx.newPage();
      await routen(page, seite.gast);
      await page.goto(`${BASE}${seite.pfad}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(seite.warte, { state: "attached", timeout: 30000 });
      await page.waitForTimeout(400);
      const m = await page.evaluate(messen);
      await ctx.close();
      if (m.bereich !== seite.bereich) befunde.push(`${breite} px: Bereich „${m.bereich}“ statt „${seite.bereich}“`);
      if (m.querUeberlauf > 0) befunde.push(`${breite} px: horizontaler Überlauf ${m.querUeberlauf} px`);
      for (const a of m.abgeschnitten) befunde.push(`${breite} px: abgeschnitten ${a}`);
      for (const w of m.wertumbruch) befunde.push(`${breite} px: Wert umgebrochen ${w}`);
    }
    assert.deepEqual(befunde, [], befunde.join("\n"));
  });
}
