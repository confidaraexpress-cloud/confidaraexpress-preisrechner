// E2E: Paritätsaudit 2026-10-15, Session 2 — Mehrlagerverwaltung, Lagerfilter, erster Wareneingang,
// Auftragsstorno (echter Dev-Server, echter Browser).
//
// Prüft, was Quelltextanker nicht erreichen:
//   • C/BI9: die Lagerübersicht verwaltet ALLE Lager — Seite für Seite über den Cursor, anlegen
//     (doppelter Name am Feld), Standard festlegen, deaktivieren mit dem Sperrgrund des Servers
//     samt Mengen; das Standardlager ist nicht deaktivierbar — bei 1440 und 390 px ohne Überlauf,
//   • BI11: scheitert die Lagerliste, steht der Fehler da — kein „Hauptlager anlegen",
//   • BI7: Bestand und Bewegungen filtern serverseitig nach Lager; gebucht wird nur in aktive Lager,
//   • BI3: ein neuer Artikel ohne Bestand bucht seinen ersten Wareneingang ins Standardlager,
//   • BI1: ein bereits versendeter Auftrag nennt seinen Grund im Stornodialog.
//
// Alle Backendantworten sind gemockt: kein echter Server, keine Buchung, kein Anbieter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5562, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};
const LAGER = (id, name, over = {}) => ({
  id, name, code: null, status: "active", isDefault: false, notes: null,
  createdAt: "2026-08-01T10:00:00Z", updatedAt: "2026-08-01T10:00:00Z", ...over,
});
const START_LAGER = () => [
  LAGER("10", "Hauptlager", { isDefault: true, code: "HL" }),
  LAGER("11", "Lager Nord", { notes: "Rampe 2, nur werktags" }),
  LAGER("12", "Altlager", { status: "inactive" }),
];
const PRODUKT = (over = {}) => ({
  id: "101", sku: "NEU-1", name: "Neuer Artikel", description: null, ean: null,
  weightKg: 1, lengthCm: null, widthCm: null, heightCm: null, unitValue: 10,
  hsCode: null, countryOfOrigin: null, customsDescription: null,
  defaultWarehouseId: null, defaultLocationId: null, minStock: null, status: "active",
  createdAt: "2026-08-01T10:00:00Z", updatedAt: "2026-08-01T10:00:00Z",
  stock: { onHand: 0, reserved: 0, blocked: 0, available: 0 }, ...over,
});
const AUFTRAG = {
  id: "500", orderNumber: "CE-AU26-00001", status: "open", warehouseId: "10", warehouseName: "Hauptlager",
  customerReference: "REF-1",
  recipient: { company: "Empfänger GmbH", fullName: "Erika Muster", streetAndNumber: "Zielweg 9", addressAddition: null, postalCode: "20095", city: "Hamburg", country: "DE", phone: null, email: null },
  notes: null, itemCount: 1, totalQuantity: 5, openQuantity: 5, shippedQuantity: 0,
  createdAt: "2026-08-10T10:00:00Z", updatedAt: "2026-08-10T10:00:00Z", cancelledAt: null,
};

let server, browser;

async function setupRoutes(page, opt = {}) {
  const state = {
    lager: START_LAGER(),
    listeFehler: opt.listeFehler === true,
    calls: { list: [], posts: [], patches: [], balances: [], movements: [], receipts: [], cancels: 0 },
  };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });

    if (p.endsWith("/api/kunde/warehouses") && req.method() === "GET") {
      state.calls.list.push(url.search);
      if (state.listeFehler) return json({ error: "Lager konnten nicht geladen werden", code: "WAREHOUSE_LIST_FAILED" }, 500);
      // Zwei Seiten: der Cursor des Servers führt zur zweiten.
      const cursor = url.searchParams.get("cursor");
      const limit = Number(url.searchParams.get("limit") || 25);
      const alle = state.lager;
      if (limit === 1) return json({ warehouses: alle.slice(0, 1), nextCursor: alle.length > 1 ? "c-eins" : null });
      if (!cursor) return json({ warehouses: alle.slice(0, 2), nextCursor: alle.length > 2 ? "c2" : null });
      if (cursor === "c2") return json({ warehouses: alle.slice(2), nextCursor: null });
      return json({ warehouses: [], nextCursor: null });
    }
    if (p.endsWith("/api/kunde/warehouses") && req.method() === "POST") {
      const body = req.postDataJSON();
      state.calls.posts.push(body);
      if (state.lager.some((w) => w.name.toLowerCase() === String(body.name || "").toLowerCase())) {
        return json({ error: "Ein Lager mit diesem Namen existiert bereits", code: "WAREHOUSE_DUPLICATE" }, 409);
      }
      if (body.isDefault === true) state.lager = state.lager.map((w) => ({ ...w, isDefault: false }));
      const neu = LAGER("13", body.name, { code: body.code ?? null, notes: body.notes ?? null, isDefault: body.isDefault === true });
      state.lager = [neu, ...state.lager];
      return json({ warehouse: neu }, 201);
    }
    const lm = p.match(/\/api\/kunde\/warehouses\/(\d+)$/);
    if (lm && req.method() === "PATCH") {
      const body = req.postDataJSON();
      state.calls.patches.push({ id: lm[1], body });
      if (body.status === "inactive" && lm[1] === "11") {
        return json({
          error: "Das Lager enthält noch Bestand, gesperrte Ware, Reservierungen oder offene Aufträge und kann deshalb nicht deaktiviert werden.",
          code: "WAREHOUSE_NOT_EMPTY", details: { onHand: 4, reserved: 2, blocked: 1, openReservations: 1, openOrders: 1 },
        }, 409);
      }
      if (body.isDefault === true) state.lager = state.lager.map((w) => ({ ...w, isDefault: w.id === lm[1] }));
      state.lager = state.lager.map((w) => (w.id === lm[1] ? { ...w, ...("status" in body ? { status: body.status } : {}) } : w));
      return json({ warehouse: state.lager.find((w) => w.id === lm[1]) });
    }
    if (p.endsWith("/api/kunde/inventory/overview")) {
      return json({ activeProducts: 1, activeWarehouses: 2, onHandUnits: 100, availableUnits: 95, reservedUnits: 5,
        lowStockCount: 0, openOrders: 1, shippedToday: 0 });
    }
    if (p.endsWith("/api/kunde/inventory/balances")) {
      state.calls.balances.push(url.search);
      return json({ balances: [{
        productId: "100", warehouseId: "10", sku: "ART-1", productName: "Artikel A", productStatus: "active",
        warehouseName: "Hauptlager", onHand: 100, reserved: 5, blocked: 0, available: 95, minStock: null,
        lowStock: false, updatedAt: "2026-08-10T10:00:00Z",
      }], nextCursor: null });
    }
    if (p.endsWith("/api/kunde/inventory/movements")) {
      state.calls.movements.push(url.search);
      return json({ movements: [], nextCursor: null });
    }
    if (p.endsWith("/api/kunde/inventory/receipt")) {
      state.calls.receipts.push(req.postDataJSON());
      return json({ balance: { onHand: 5, reserved: 0, blocked: 0, available: 5 }, movementId: "9" }, 201);
    }
    if (p.endsWith("/api/kunde/products")) return json({ products: [PRODUKT()], nextCursor: null });
    if (/\/api\/kunde\/products\/\d+$/.test(p)) return json({ product: PRODUKT(), balances: [], movements: [] });
    if (/\/api\/kunde\/orders\/500\/cancel$/.test(p) && req.method() === "POST") {
      state.calls.cancels += 1;
      return json({ error: "Auftrag ist bereits versendet", code: "ORDER_ALREADY_SHIPPED" }, 409);
    }
    if (/\/api\/kunde\/orders\/500$/.test(p)) {
      return json({ order: AUFTRAG, items: [{ id: "5", productId: "100", productStatus: "active", quantity: 5, sku: "ART-1", name: "Artikel A",
        unitWeightKg: 1.25, unitValue: 19.99, hsCode: null, countryOfOrigin: null, customsDescription: null,
        reservedQuantity: 5, shippedQuantity: 0, releasedQuantity: 0 }], shipments: [] });
    }
    if (p.includes("/api/kunde/")) return json({ items: [], drafts: [], nextCursor: null, pagination: { total: 0 } });
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
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
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
  if (server) stopDevServer(server, "SIGKILL");
});

console.log("\nUmfang C — Lagerverwaltung in zwei Breiten\n");

for (const [breite, hoehe] of [[1440, 900], [390, 844]]) {
  test(`${breite}px: alle Lager über den Cursor, anlegen mit Feldfehler, Standard und Sperrgrund — ohne Überlauf`, async () => {
    const page = await browser.newPage({ viewport: { width: breite, height: hoehe } });
    const state = await setupRoutes(page);
    await page.goto(`${BASE}/dashboard?page=inventory`, { waitUntil: "networkidle" });
    const liste = page.locator("#inv-warehouse-list");
    await liste.waitFor({ state: "visible" });
    assert.match(await liste.textContent(), /Hauptlager/);
    assert.match(await liste.textContent(), /Lager Nord/);
    assert.doesNotMatch(await liste.textContent(), /Altlager/, "die zweite Seite ist noch nicht geladen");
    await keinUeberlauf(page, `Übersicht ${breite}px`);

    // Weitere Seite über den Cursor des Servers.
    await page.locator("#inv-warehouse-more").click();
    await page.locator('#inv-warehouse-list [data-warehouse-id="12"]').waitFor({ state: "visible" });
    assert.match(await page.locator('[data-warehouse-id="12"]').textContent(), /Inaktiv/);
    assert.ok(state.calls.list.some((q) => new URLSearchParams(q).get("cursor") === "c2"), "kein Cursor gesendet");
    assert.ok(state.calls.list.some((q) => new URLSearchParams(q).get("limit") === "25"));
    assert.equal(await page.locator("#inv-warehouse-more").count(), 0, "nach der letzten Seite kein „Weitere“");

    // Deaktivieren eines nicht leeren Lagers: der Dialog nennt die Mengen des Servers.
    const nord = page.locator('[data-warehouse-id="11"]');
    await nord.getByRole("button", { name: "Weitere Aktionen für Lager Nord" }).click();
    await page.getByRole("menuitem", { name: /Deaktivieren/ }).click();
    const aktion = page.getByRole("dialog");
    await aktion.waitFor({ state: "visible" });
    await page.locator("#inv-warehouse-action-confirm").click();
    await aktion.getByText(/Noch vorhanden: 4 Einheiten Bestand \(davon 1 gesperrt, 2 reserviert\), 1 offener Auftrag\./).waitFor({ state: "visible" });
    assert.ok(!(await aktion.textContent()).includes("WAREHOUSE_NOT_EMPTY"), "Rohcode sichtbar");
    assert.deepEqual(state.calls.patches[state.calls.patches.length - 1], { id: "11", body: { status: "inactive" } });
    await aktion.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await aktion.waitFor({ state: "detached" });

    // Standard festlegen: genau das eine Feld.
    await nord.getByRole("button", { name: "Weitere Aktionen für Lager Nord" }).click();
    await page.getByRole("menuitem", { name: /Als Standard festlegen/ }).click();
    await page.locator("#inv-warehouse-action-confirm").click();
    await page.getByText("Das Standardlager wurde geändert.").waitFor({ state: "visible" });
    assert.deepEqual(state.calls.patches[state.calls.patches.length - 1], { id: "11", body: { isDefault: true } });
    await page.waitForFunction(() => /Standard/.test(document.querySelector('[data-warehouse-id="11"]')?.textContent || ""));

    // Anlegen: doppelter Name steht am Feld; danach mit Standard angelegt.
    await page.locator("#inv-warehouse-create").click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    await page.locator("#inv-wh-name").fill("hauptlager");
    await page.locator("#inv-warehouse-save").click();
    await page.locator("#inv-wh-name-error").waitFor({ state: "visible" });
    assert.match(await page.locator("#inv-wh-name-error").textContent(), /gibt es bereits/);
    assert.equal(await page.locator("#inv-wh-name").getAttribute("aria-invalid"), "true");
    await keinUeberlauf(page, `Dialog ${breite}px`);
    await page.locator("#inv-wh-name").fill("Lager Süd");
    await page.locator("#inv-wh-code").fill("S1");
    await page.locator("#inv-wh-default").check();
    await page.locator("#inv-warehouse-save").click();
    await dialog.waitFor({ state: "detached" });
    await page.getByText("Das Lager wurde angelegt.").waitFor({ state: "visible" });
    assert.deepEqual(state.calls.posts[state.calls.posts.length - 1], { name: "Lager Süd", code: "S1", isDefault: true });
    const sued = page.locator('[data-warehouse-id="13"]');
    await sued.waitFor({ state: "visible" });
    assert.match(await sued.textContent(), /Standard/);

    // Das (neue) Standardlager ist nicht deaktivierbar — der Grund steht im Menü.
    await sued.getByRole("button", { name: "Weitere Aktionen für Lager Süd" }).click();
    const deaktivieren = page.getByRole("menuitem", { name: /Deaktivieren/ });
    assert.equal(await deaktivieren.isDisabled(), true);
    assert.match(await deaktivieren.textContent(), /Standardlager kann nicht deaktiviert werden/);
    await page.keyboard.press("Escape");

    await keinUeberlauf(page, `Übersicht nach Änderungen ${breite}px`);
    await page.close();
  });
}

test("BI11: scheitert die Lagerliste, steht der Fehler da — kein Onboarding „Hauptlager anlegen“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page, { listeFehler: true });
  await page.goto(`${BASE}/dashboard?page=inventory`, { waitUntil: "networkidle" });
  const fehler = page.locator(".inv-inline-error", { hasText: /Lager konnten nicht geladen werden/ });
  await fehler.first().waitFor({ state: "visible" });
  assert.equal(await fehler.first().getByRole("button", { name: "Erneut versuchen" }).count(), 1, "keine Wiederholung angeboten");
  assert.equal(await page.getByRole("button", { name: "Hauptlager anlegen" }).count(), 0, "Onboarding trotz Ladefehler");
  assert.equal(await page.getByText("Noch kein Lager angelegt").count(), 0);
  await page.close();
});

console.log("\nBI7 und BI3 — Lagerfilter und erster Wareneingang\n");

test("BI7: Bestand und Bewegungen filtern nach Lager; gebucht wird nur in aktive Lager", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=stock`, { waitUntil: "networkidle" });
  const filter = page.locator("#inv-stock-filter-wh");
  await filter.waitFor({ state: "visible" });
  assert.deepEqual(await filter.locator("option").allTextContents(), ["Alle Lager", "Hauptlager (Standard)", "Lager Nord", "Altlager (inaktiv)"]);
  await Promise.all([
    page.waitForResponse((q) => q.url().includes("/inventory/balances") && new URL(q.url()).searchParams.get("warehouseId") === "11"),
    filter.selectOption("11"),
  ]);
  assert.ok(state.calls.balances.some((q) => new URLSearchParams(q).get("warehouseId") === "11"));
  // Buchungsdialog: nur aktive Lager, das Standardlager vorgewählt.
  await page.getByRole("button", { name: "Bestand einbuchen" }).first().click();
  const lagerwahl = page.locator("#inv-stock-wh");
  await lagerwahl.waitFor({ state: "visible" });
  assert.deepEqual(await lagerwahl.locator("option").allTextContents(), ["Hauptlager (Standard)", "Lager Nord"]);
  assert.equal(await lagerwahl.inputValue(), "10");
  await page.keyboard.press("Escape");

  await page.goto(`${BASE}/dashboard?page=movements`, { waitUntil: "networkidle" });
  const mv = page.locator("#inv-mv-warehouse");
  await mv.waitFor({ state: "visible" });
  await Promise.all([
    page.waitForResponse((q) => q.url().includes("/inventory/movements") && new URL(q.url()).searchParams.get("warehouseId") === "12"),
    mv.selectOption("12"),
  ]);
  assert.ok(state.calls.movements.some((q) => new URLSearchParams(q).get("warehouseId") === "12"));
  await page.close();
});

for (const [breite, hoehe] of [[1440, 900], [390, 844]]) {
  test(`${breite}px BI3: neuer Artikel ohne Bestand — erster Wareneingang ins Standardlager`, async () => {
    const page = await browser.newPage({ viewport: { width: breite, height: hoehe } });
    const state = await setupRoutes(page);
    await page.goto(`${BASE}/inventory/products/101`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Bestand einbuchen" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    const lagerwahl = page.locator("#inv-stock-warehouse");
    await lagerwahl.waitFor({ state: "visible" });
    assert.equal(await lagerwahl.inputValue(), "10", "das Standardlager ist nicht vorgewählt");
    assert.equal(await dialog.getByText("noch kein Lager hinterlegt").count(), 0);
    await page.locator("#inv-stock-qty").fill("5");
    await dialog.getByRole("button", { name: "Bestand einbuchen", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual(state.calls.receipts, [{ productId: "101", warehouseId: "10", quantity: 5 }]);
    await keinUeberlauf(page, `Artikel ${breite}px`);
    await page.close();
  });
}

console.log("\nBI1 — Storno eines bereits versendeten Auftrags\n");

test("BI1: der Stornodialog nennt den Grund des Servers, nie den Code", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page);
  await page.goto(`${BASE}/inventory/orders/500`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Auftrag stornieren" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Auftrag stornieren", exact: true }).click();
  await dialog.getByText("Dieser Auftrag ist bereits vollständig versendet und kann nicht mehr storniert werden.").waitFor({ state: "visible" });
  assert.ok(!(await dialog.textContent()).includes("ORDER_ALREADY_SHIPPED"));
  assert.equal(state.calls.cancels, 1);
  await page.close();
});
