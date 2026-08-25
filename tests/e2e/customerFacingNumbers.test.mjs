// E2E: Nummernarchitektur — CE-AB ist sichtbar, CE-BS ist es nirgends mehr.
//
// Eine Quelltextprüfung kann belegen, welches FELD eine Komponente liest. Sie kann
// nicht belegen, was am Ende tatsächlich auf dem Bildschirm steht: eine Zelle, die
// `orderConfirmationNumber` liest, könnte daneben trotzdem die interne Bestellnummer
// rendern, und eine Legacy-Sendung könnte still auf eine Providerreferenz zurückfallen.
//
// Diese Suite misst deshalb den GERENDERTEN Text. Jeder Mock liefert bewusst ALLE
// Nummern gleichzeitig — CE-AB, CE-BS, JUMiNGO-Ordernummer, Providerreferenz und
// interne ID. Nur dann ist ein Rückfall überhaupt sichtbar; mit einem Mock, der CE-BS
// gar nicht erst enthält, würde die Prüfung nichts beweisen.
//
// Kein echtes Backend, keine Bestellung, keine E-Mail: alles über page.route gemockt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5264, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// Werte, die NIRGENDS kundensichtbar auftauchen dürfen.
const CE_BS = "CE-BS26-00042";
const JUMINGO_ORDER = "JU-77-EXTERN";
const JUMINGO_SHIPMENT = "s_5f3a9c2b1d4e6f8a0b2c4d6e8f0a1b2c";
// Und der Wert, der stattdessen stehen muss.
const CE_AB = "CE-AB26-00087";
const TRACKING = "1Z999AA10123456784";

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};

// Eine Sendung MIT Auftragsbestätigung — und mit allen Altwerten daneben.
const SHIPMENT = {
  id: 4711, jumingo_shipment_id: JUMINGO_SHIPMENT, order_number: JUMINGO_ORDER,
  business_order_number: CE_BS, order_confirmation_number: CE_AB,
  tracking_number: TRACKING, reference_number: "PO-4711",
  status: "booked", weight: 5, price_final: 15.14, selected_carrier: "dpd",
  created_at: "2026-08-21T00:00:00Z",
};
// Eine Sendung OHNE Auftragsbestätigung (aus der Zeit davor) — sie trägt CE-BS und
// die Providerwerte. Genau hier wäre ein stiller Rückfall am wahrscheinlichsten.
const LEGACY_SHIPMENT = {
  id: 4712, jumingo_shipment_id: JUMINGO_SHIPMENT, order_number: JUMINGO_ORDER,
  business_order_number: CE_BS, order_confirmation_number: null,
  tracking_number: null, reference_number: null,
  status: "booked", weight: 2, price_final: 9.9, selected_carrier: "dpd",
  created_at: "2026-07-01T00:00:00Z",
};

let server, browser;

async function setupRoutes(page) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (url.pathname.endsWith("/kundenbereich")) return json({ user: USER });
    if (url.pathname.endsWith("/kunde/shipments")) return json({ shipments: [SHIPMENT, LEGACY_SHIPMENT] });
    if (url.pathname.endsWith("/kunde/invoices")) return json({
      invoices: [{
        id: 1, invoice_number: "CE-RE26-00001", status: "open", is_overdue: false,
        gross_amount: 15.14, currency: "EUR", issued_at: "2026-08-21T00:00:00Z", due_date: "2026-08-28",
        document_status: "ready", download_available: true,
        // Beide Nummern im Snapshot — die Liste darf nur die eine zeigen.
        business_order_number: CE_BS, order_confirmation_number: CE_AB,
      }],
      summary: { open_count: 1, open_amount: 15.14, overdue_count: 0, next_due_date: "2026-08-28", currency: "EUR" },
    });
    if (url.pathname.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (url.pathname.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (url.pathname.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (url.pathname.includes("/api/kunde/addresses")) return json({ items: [], pagination: { total: 0 }, nextCursor: null });
    // Auftragsdetail: der Endpunkt ist /api/kunde/orders/:id (nicht die Route
    // /inventory/orders/:id — das ist die Adresse im Browser, nicht die der API).
    if (/\/kunde\/orders\/\d+$/.test(url.pathname)) return json({
      order: { id: 3, orderNumber: "CE-AU26-00003", status: "open", createdAt: "2026-08-21T00:00:00Z",
        recipient: { fullName: "Empfänger AG", streetAndNumber: "Zielweg 3", postalCode: "80331", city: "München", country: "DE" },
        items: [{ id: 1, productId: 10, sku: "ART-1", name: "Testartikel", quantity: 2 }] },
      shipments: [{ id: 4711, businessOrderNumber: CE_BS, orderConfirmationNumber: CE_AB,
        orderNumber: JUMINGO_ORDER, trackingNumber: TRACKING, carrier: "dpd", status: "booked",
        createdAt: "2026-08-21T00:00:00Z" }],
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

// Der sichtbare Text der Seite — ohne Attribute, ohne Kommentare, ohne Skriptinhalt.
const sichtbarerText = (page) => page.evaluate(() => document.body.innerText);

async function keineAltnummer(page, wo) {
  const text = await sichtbarerText(page);
  for (const [name, wert] of [["die interne Bestellnummer", CE_BS],
    ["die JUMiNGO-Ordernummer", JUMINGO_ORDER], ["die JUMiNGO-Shipment-ID", JUMINGO_SHIPMENT]]) {
    assert.ok(!text.includes(wert), `${wo}: ${name} (${wert}) steht im sichtbaren Text`);
  }
  // „Sendungsnummer" war die frühere Beschriftung von CE-BS und darf nirgends
  // mehr als Feld- oder Spaltenname auftauchen. Case-insensitiv, weil Tabellen-
  // köpfe per CSS in Versalien rendern und im innerText auch so ankommen.
  assert.ok(!/sendungsnummer/i.test(text), `${wo}: die Beschriftung Sendungsnummer lebt noch`);
  return text;
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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das
    // seinerseits node startet. Ein Signal an npx ließe den Enkel — den
    // eigentlichen Dev-Server — auf seinem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("(1) Sendungsliste: CE-AB steht in der Tabelle, keine Altnummer irgendwo", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table", { timeout: 20000 });

  // Tabellenköpfe rendern per CSS in Versalien; verglichen wird deshalb der
  // klein geschriebene Text — die SCHREIBWEISE ist Darstellung, nicht Inhalt.
  const kopf = await page.locator("thead th").first().innerText();
  assert.equal(kopf.trim().toLocaleLowerCase("de"), "auftragsbestätigung",
    "die erste Spalte muss die Auftragsbestätigung sein");

  const text = await keineAltnummer(page, "Sendungsliste");
  assert.ok(text.includes(CE_AB), "die Auftragsbestätigungsnummer fehlt in der Liste");
  assert.ok(text.includes(TRACKING), "die Trackingnummer muss getrennt daneben stehen");
  // Und die Sendung OHNE CE-AB zeigt den neutralen Hinweis statt einer Ersatznummer.
  assert.ok(text.includes("Ohne Vorgangsnummer"),
    "eine Sendung ohne Auftragsbestätigung braucht den neutralen Hinweis");
  await page.close();
});

test("(2) Sendungsdetail: Vorgangs- und Trackingnummer getrennt beschriftet", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table", { timeout: 20000 });

  await page.getByRole("button", { name: /verfolgen|tracking/i }).first().click();
  await page.waitForSelector(".shipment-detail-numbers", { timeout: 10000 });

  const labels = await page.locator(".shipment-detail-label").allInnerTexts();
  assert.ok(labels.includes("Auftragsbestätigung"), "die Auftragsbestätigung fehlt im Detail");
  assert.ok(labels.includes("Trackingnummer"), "die Trackingnummer fehlt im Detail");
  assert.equal(labels.filter((l) => /Sendungsnummer|Bestellnummer/.test(l)).length, 0,
    "eine Altbeschriftung steht im Sendungsdetail");
  await keineAltnummer(page, "Sendungsdetail");
  await page.close();
});

test("(3) Rechnungsliste: nur die Rechnungsnummer, kein CE-AB und kein CE-BS", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=invoices`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".inv-cell-number", { timeout: 20000 });

  const zelle = await page.locator(".inv-cell-number").first().innerText();
  assert.ok(zelle.includes("CE-RE26-00001"), "die Rechnungsnummer fehlt");
  assert.ok(!zelle.includes(CE_AB), "die Auftragsbestätigungsnummer ist kundenseitig aus der Rechnungsliste entfallen");
  await keineAltnummer(page, "Rechnungsliste");
  await page.close();
});

test("(4) Übersicht: Letzte Sendungen zeigt CE-AB, keine Altnummer", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=overview`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ov-list-row", { timeout: 20000 });

  const ersteZeile = await page.locator(".ov-list-primary").first().innerText();
  assert.equal(ersteZeile.trim(), CE_AB, "die Übersicht zeigt nicht die Auftragsbestätigungsnummer");
  await keineAltnummer(page, "Übersicht");
  await page.close();
});

test("(5) Stornodialog benennt die Sendung ohne Providerreferenz und ohne CE-BS", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table", { timeout: 20000 });

  await page.getByRole("button", { name: /storn/i }).first().click();
  await page.waitForSelector("[role=dialog]", { timeout: 10000 });
  const dialogText = await page.locator("[role=dialog]").innerText();
  // Die EIGENE Referenz des Kunden gewinnt — sie erkennt er am schnellsten.
  assert.ok(dialogText.includes("PO-4711"), "der Dialog nennt die Sendung nicht");
  for (const wert of [CE_BS, JUMINGO_ORDER, JUMINGO_SHIPMENT]) {
    assert.ok(!dialogText.includes(wert), `Altwert ${wert} im Stornodialog`);
  }
  await page.close();
});

test("(6) Auftragsdetail: Spalte und Zelle tragen die Auftragsbestätigung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/inventory/orders/3`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table", { timeout: 20000 });

  const text = await keineAltnummer(page, "Auftragsdetail");
  // Versalien kommen aus dem CSS der Tabellenköpfe — verglichen wird der Inhalt.
  assert.ok(/auftragsbestätigung/i.test(text), "die Spaltenüberschrift fehlt");
  assert.ok(text.includes(CE_AB), "die Auftragsbestätigungsnummer fehlt in der Sendungszeile");
  assert.ok(text.includes(TRACKING), "die Trackingnummer muss getrennt stehen");
  // Die LAGERauftragsnummer bleibt unverändert — sie ist ein anderer Nummernkreis.
  assert.ok(text.includes("CE-AU26-00003"), "die Auftragsnummer des Lagerauftrags fehlt");
  await page.close();
});
