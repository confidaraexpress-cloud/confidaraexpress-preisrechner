// E2E: providerneutrales Live-Tracking mit Transportabschnitten — echter Dev-Server.
//
// Geprüft wird, was eine Quelltextprüfung nicht erreicht: dass eine Sendung, deren
// Trackingantwort `trackingLegs` trägt, in der Live-Ansicht von „Meine Sendungen" UND auf der
// öffentlichen Trackingseite ihren Stand, alle Ereignisse, Orte und Zeitangaben zeigt — je
// Abschnitt, ohne erfundene Zeitzone, ohne erfundene Paketnummer und ohne Anbieternamen.
//
// Alle Netzaufrufe sind gemockt. Es wird NIEMALS eine Buchung ausgelöst.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5360, BASE = `http://127.0.0.1:${PORT}`;
const ID = 4720;
const A = "1ZF7TEST0000000001";
const B = "1ZF7TEST0000000002";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const SENDUNG = {
  id: ID, status: "booked", weight: 2, price_final: 12.23, selected_carrier: "ups",
  created_at: "2026-09-10T00:00:00Z", order_number: null, business_order_number: "CE-BS-2026-0100",
  order_confirmation_number: "CE-AB-2026-000100", cancellation_status: null,
  tracking_number: A, tracking_references: [A, B], tracking_status: "in_transit",
};

// Neutraler Kundenvertrag (TG22 Paket A): kein Eventcode, kein Rohdatum, keine Leg-Rolle.
const EV = (status, description, location, date, time) =>
  ({ status, description, location, dateTime: { date, time } });

// Angemeldete Antwort: zwei Abschnitte, alle Nummern. Paket B ist zugestellt, Paket A noch
// unterwegs — die Sendung ist damit unterwegs, nicht zugestellt (Stand vom Server).
const LIVE = {
  shipmentId: ID, tracking: null, trackingAvailable: true, trackingNumber: A, trackingReferences: [A, B],
  trackingStatus: "in_transit", trackingStatusText: "RFID Confirmed Pickup", carrier: "UPS", carrierTrackingPage: null,
  liveTracking: true, source: "live",
  trackingLegs: [
    { carrier: "UPS", trackingReference: A, status: "in_transit", carrierTrackingPage: null,
      events: [
        EV("pending", "Shipper created a label, UPS has not received the package yet.", "US", "2026-05-04", "21:57:37"),
        EV("in_transit", "RFID Confirmed Pickup", "Laurel, MD US", "2026-05-05", "17:33:15"),
      ] },
    { carrier: "UPS", trackingReference: B, status: "delivered",
      carrierTrackingPage: `https://wwwapps.ups.com/WebTracking/processInputRequest?tracknum=${B}`,
      events: [
        EV("in_transit", "Out For Delivery", "Castlegar, BC CA", "2026-05-12", "08:29:44"),
        EV("delivered", "DELIVERED", "GRAND FORKS RR2 CA", "2026-05-12", "14:46:53"),
      ] },
  ],
};

// Öffentliche Antwort für Nummer A: nur ihr Abschnitt, keine Kennung, keine Liste.
const OEFFENTLICH = {
  tracking: null, trackingAvailable: true, trackingNumber: A, trackingStatus: "in_transit",
  trackingStatusText: "RFID Confirmed Pickup", carrier: "UPS", carrierTrackingPage: null,
  liveTracking: true, source: "live",
  trackingLegs: [{ ...LIVE.trackingLegs[0] }],
};

const VERBOTEN = /transglobal|jumingo|UTC|GMT|MESZ|MEZ|CEST|undefined|Paket \d/i;

// Adminsicht: gebuchte Sendung OHNE JUMiNGO-Sendungs-ID, für die das Backend die Live-Abfrage
// ausdrücklich zulässt. Die Trackingantwort trägt — wie die echte Adminroute — zusätzlich Hinweise
// je Abschnitt und den Anbieter als Datenfeld; angezeigt werden darf er nicht.
const ADMIN = {
  id: 1, email: "admin@example.com", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE",
};
const ADMIN_DETAIL = {
  id: ID, user_id: 42, status: "booked", service_type: "pickup", selected_carrier: "ups",
  from_country: "DE", to_country: "CA", package_count: 2, created_at: "2026-09-10T00:00:00Z",
  business_order_number: "CE-BS-2026-0100", order_confirmation_number: "CE-AB-2026-000100",
  tracking_number: A, order_number: null, tracking_status: "in_transit",
  tracking_lookup_available: true, label_available: false,
  customer_company: "Muster GmbH", customer_number: "CE-K-10030", customer_name: "Max Mustermann",
  invoice: null, email_deliveries: [],
};
const ADMIN_TRACKING = {
  source: "live", provider: "transglobal", trackingAvailable: true, trackingNumber: A,
  trackingStatus: "in_transit", trackingStatusText: "RFID Confirmed Pickup", carrier: "UPS",
  carrierTrackingPage: null, trackingReferences: [A, B],
  trackingLegs: [
    { ...LIVE.trackingLegs[0], errorMessages: [] },
    { ...LIVE.trackingLegs[1], errorMessages: ["Address incomplete"] },
  ],
};

let server, browser;

async function setupRoutes(page, { protokoll, admin = false } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (protokoll) protokoll.push(p);
    if (p === `/api/shipments/${ID}/tracking`) return json(LIVE);
    if (p === `/api/tracking/public/${A}`) return json(OEFFENTLICH);
    if (p.startsWith("/api/tracking/public/")) return json({ error: "Sendung nicht gefunden" }, 404);
    if (admin && p.endsWith(`/admin/shipments/${ID}/tracking`)) return json(ADMIN_TRACKING);
    if (admin && p.endsWith(`/admin/shipments/${ID}`)) return json(ADMIN_DETAIL);
    if (p.endsWith("/kundenbereich")) return json({ user: admin ? ADMIN : USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [SENDUNG], nextCursor: null });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    return json({});
  });
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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits node
    // startet. Ein Signal an npx ließe den Enkel auf dem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — angemeldet: Stand, alle Ereignisse, Abschnitte mit Carrier und Nummer, keine Zone", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  const protokoll = [];
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await setupRoutes(page, { protokoll });
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table tbody tr", { timeout: 20000 });

  const zeile = page.locator("table tbody tr", { hasText: "CE-AB-2026-000100" }).first();
  await zeile.getByRole("button", { name: "Sendung verfolgen" }).click();
  await page.waitForSelector(".shipment-track-detail .track-event", { timeout: 15000 });
  assert.ok(protokoll.includes(`/api/shipments/${ID}/tracking`), "die Live-Ansicht kommt nicht vom Server");

  // TG22 Paket B: dieselbe Trackingansicht steht jetzt auch in der (hier ausgeblendeten)
  // Mobilkarte — gemessen wird die Detailzeile der Tabelle.
  const detail = page.locator(".ce-list-table .shipment-track-detail");
  // Ein zugestelltes Paket stellt die Sendung nicht zu: der Stand kommt vom Server.
  assert.equal((await detail.locator(".shipment-track-head .badge").innerText()).trim(), "Unterwegs");
  assert.equal((await page.locator(".ce-list-table .shipment-track-number").innerText()).trim(), `Trackingnummern: ${A}, ${B}`);
  assert.deepEqual((await detail.locator(".shipment-track-leg").allTextContents()).map((t) => t.trim()),
    [`UPS · ${A}`, `UPS · ${B}`]);
  const titel = (await detail.locator(".track-title").allTextContents()).map((t) => t.trim());
  assert.deepEqual(titel, ["Shipper created a label, UPS has not received the package yet.", "RFID Confirmed Pickup",
    "Out For Delivery", "DELIVERED"]);
  const zeiten = (await detail.locator(".track-time").allTextContents()).join(" | ");
  assert.ok(zeiten.includes("12.05.2026 · 14:46:53"), zeiten);
  assert.ok(zeiten.includes("GRAND FORKS RR2 CA"), zeiten);
  // Der Carrierlink steht beim Abschnitt, zu dem er gehört.
  const links = detail.locator(".tracking-timeline a.shipment-track-link");
  assert.equal(await links.count(), 1);
  assert.ok((await links.first().getAttribute("href")).includes(B));

  const text = await detail.innerText();
  assert.ok(!VERBOTEN.test(text), `unzulässiger Text in der Live-Ansicht: ${text}`);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("2 — öffentlich: Stand, Ereignisse und Zeitangaben der gesuchten Nummer — keine Schwesternummer", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await setupRoutes(page);
  await page.goto(`${BASE}/tracking?nummer=${A}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".track-event", { timeout: 15000 });

  assert.equal((await page.locator(".tracking-hero-status").innerText()).trim(), "Unterwegs");
  assert.equal((await page.locator(".tracking-hero-when").innerText()).trim(), "05.05.2026 · 17:33:15 Uhr");
  const titel = (await page.locator(".track-title").allTextContents()).map((t) => t.trim());
  assert.deepEqual(titel, ["Shipper created a label, UPS has not received the package yet.", "RFID Confirmed Pickup"]);
  const tage = (await page.locator(".tracking-day-label").allTextContents()).map((t) => t.trim());
  assert.deepEqual(tage, ["04.05.2026", "05.05.2026"], "ein einzelner Abschnitt bekommt keine Abschnittsüberschrift");
  const zeiten = (await page.locator(".track-time").allTextContents()).join(" | ");
  assert.ok(zeiten.includes("17:33:15 Uhr") && zeiten.includes("Laurel, MD US"), zeiten);

  const text = await page.locator("body").innerText();
  assert.ok(!text.includes(B), "die Schwesternummer steht auf der öffentlichen Seite");
  assert.ok(!VERBOTEN.test(text), `unzulässiger Text auf der öffentlichen Seite: ${text.slice(0, 400)}`);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("3 — öffentlich auf 390 px: lesbar, ohne Querüberlauf", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/tracking?nummer=${A}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".track-event", { timeout: 15000 });
  const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(ueberlauf <= 0, `horizontaler Überlauf: ${ueberlauf} px`);
  assert.ok((await page.locator("body").innerText()).includes("RFID Confirmed Pickup"));
  await page.close();
});

test("4 — Admin-Detail: Abfrage ohne Sendungs-ID möglich; je Abschnitt Carrier, Stand, Hinweise und Ereignisse", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  const protokoll = [];
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await setupRoutes(page, { protokoll, admin: true });
  await page.goto(`${BASE}/admin/shipments/${ID}`, { waitUntil: "domcontentloaded" });

  const knopf = page.getByRole("button", { name: "Live-Tracking abfragen" });
  await knopf.waitFor({ timeout: 20000 });
  assert.equal(await knopf.isEnabled(), true, "die Live-Abfrage ist trotz Backendfreigabe gesperrt");
  await knopf.click();
  await page.waitForSelector(".adm-track-leg", { timeout: 15000 });
  assert.ok(protokoll.some((p) => p.endsWith(`/admin/shipments/${ID}/tracking`)), "die Abschnitte kommen nicht vom Server");

  const legs = page.locator(".adm-track-leg");
  assert.equal(await legs.count(), 2);
  const titel = (await legs.locator(".adm-track-title").allTextContents()).map((t) => t.trim());
  assert.ok(titel.every((t) => t.startsWith("UPS")), titel.join(" | "));
  assert.deepEqual((await legs.locator(".adm-track-head .badge").allTextContents()).map((t) => t.trim()),
    ["in_transit", "delivered"], "der Stand je Abschnitt fehlt");

  const erste = (await legs.nth(0).locator(".adm-track-events .adm-kv-item").allTextContents()).join(" | ");
  assert.ok(erste.includes("RFID Confirmed Pickup · Laurel, MD US") && erste.includes("05.05.2026") && erste.includes("17:33:15"), erste);
  const zweite = (await legs.nth(1).locator(".adm-track-events .adm-kv-item").allTextContents()).join(" | ");
  assert.ok(zweite.includes("DELIVERED · GRAND FORKS RR2 CA") && zweite.includes("12.05.2026") && zweite.includes("14:46:53"), zweite);
  assert.ok(zweite.includes("Out For Delivery · Castlegar, BC CA"), zweite);

  assert.equal(await legs.nth(0).locator(".adm-track-leg-errors").count(), 0);
  assert.ok((await legs.nth(1).locator(".adm-track-leg-errors").innerText()).includes("Address incomplete"));

  const block = await page.locator(".adm-track").first().innerText();
  assert.ok(!VERBOTEN.test(block), `unzulässiger Text im Admin-Trackingblock: ${block}`);
  assert.ok(!block.includes(A) && !block.includes(B), "eine Trackingnummer steht unmaskiert im Trackingblock");
  assert.equal(await legs.locator("a").count(), 0, "ein Abschnitt verlinkt nach aussen");
  assert.deepEqual(fehler, []);
  await page.close();
});
