// E2E: Lagerartikel löschen (Betreiberentscheidungen 2026-10-30, Canonical v2.91 G1/G2). Echter Dev-Server, echtes
// Chromium, GEMOCKTES Backend — es wird nichts gelöscht.
//
//   A  Tabelle: „Bearbeiten · Versenden · Löschen“, Dialog prüft zuerst, Fokus nicht auf der Löschaktion,
//      Löschung ohne Bestand ohne Bestätigungsdaten, Liste aktualisiert, Erfolgsmeldung
//   B  Bestand (G1): Mengen je Lager, Löschen erst nach Häkchen, Bestätigung = angezeigte Mengen, Meldung mit Menge
//   C  reserviert (G2): keine Löschaktion, Weg zum Auftrag
//   D  gesperrt (G2): keine Löschaktion, Weg zur Artikelseite
//   E  Konflikt (STOCK_CHANGED): Dialog prüft neu, Häkchen zurückgesetzt, zweiter Versuch gelingt
//   F  Netzwerkfehler, danach „bereits gelöscht“ (404 des Artikels) — nie ein falscher Erfolg
//   G  Doppelklick: genau eine Löschanfrage
//   H  PRODUCT_BUSY: verständliche Meldung, Dialog bleibt
//   I  Telefon 390 px: drei Aktionen je Karte, Dialog im Fenster, kein Querüberlauf
//   J  bereits gelöscht beim Öffnen: Meldung, Liste neu geladen
//   K  Historie: Bewegung und Auftragsposition eines gelöschten Artikels ohne Link, mit „Artikel gelöscht“
//   L  öffentliche Demo: Prüfung aus Beispieldaten, Löschen „In der Demo nicht verfügbar.“, nichts verschwindet
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5691, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const KUNDE = {
  id: 7, email: "einkauf@musterkunde.example", name: "Anna Berger", company_name: "Musterkunde GmbH", role: "customer",
  status: "approved", country: "DE", zip: "70173", city: "Stuttgart", street: "Königstraße 1", vat_id: "DE123456789",
  customer_number: "CE-K-10031", payment_term: 14,
};
const artikel = (id, name, onHand = 0, reserved = 0, blocked = 0) => ({
  id, sku: `VT-${id}`, name, weightKg: 1.25, status: "active", minStock: null,
  stock: { onHand, reserved, blocked, available: onHand - reserved - blocked }, createdAt: "2026-10-30T08:00:00Z",
});
const LAGER = [{ warehouseId: "10", warehouseName: "Hauptlager" }, { warehouseId: "11", warehouseName: "Außenlager" }];
const pruefung = (a, state, o = {}) => ({
  deletion: {
    product: { id: a.id, sku: a.sku, name: a.name }, state,
    warehouses: LAGER.map((l, i) => ({ ...l, onHand: 0, reserved: 0, blocked: 0, ...(o.lager ? o.lager[i] : {}) })),
    onHand: 0, reserved: 0, blocked: 0, orders: [], shipments: 0, ...o.felder,
  },
});

let server, browser;

async function seite({ liste, pruefungen = {}, loeschen = null, viewport = { width: 1440, height: 900 }, kontext = {}, ziel = "/dashboard?page=products", extra = null } = {}) {
  const context = await browser.newContext({ viewport, timezoneId: "Europe/Berlin", locale: "de-DE", ...kontext });
  const page = await context.newPage();
  const zustand = { liste: [...(liste || [])], loeschAnfragen: [], pruefAnfragen: [], fehler: [] };
  page.on("pageerror", (e) => zustand.fehler.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/kundenbereich")) return json({ user: KUNDE, pendingEmailChange: null, companyLogo: null, accountManager: null });
    if (extra) { const r = extra(pfad, req, json); if (r) return r; }
    if (pfad.endsWith("/api/kunde/products") && req.method() === "GET") return json({ products: zustand.liste, nextCursor: null });
    const check = pfad.match(/\/api\/kunde\/products\/(\d+)\/deletion-check$/);
    if (check) {
      zustand.pruefAnfragen.push(check[1]);
      const p = pruefungen[check[1]];
      const antwort = typeof p === "function" ? p(zustand) : p;
      return antwort ? json(antwort.body || antwort, antwort.status || 200) : json({ error: "Artikel nicht gefunden", code: "PRODUCT_NOT_FOUND" }, 404);
    }
    const del = pfad.match(/\/api\/kunde\/products\/(\d+)$/);
    if (del && req.method() === "DELETE") {
      const koerper = req.postData();
      zustand.loeschAnfragen.push({ id: del[1], body: koerper ? JSON.parse(koerper) : null });
      if (!loeschen) return json({ error: "Artikel nicht gefunden", code: "PRODUCT_NOT_FOUND" }, 404);
      return loeschen(del[1], koerper ? JSON.parse(koerper) : null, zustand, route, json);
    }
    if (pfad.includes("/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    return json({ items: [], warehouses: [], shipments: [], invoices: [], drafts: [], addresses: [], movements: [], summary: null, nextCursor: null, pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await page.goto(`${BASE}${ziel}`, { waitUntil: "domcontentloaded" });
  return { context, page, zustand };
}

const erfolgreich = (id, body, zustand, route, json) => {
  const a = zustand.liste.find((x) => x.id === id);
  zustand.liste = zustand.liste.filter((x) => x.id !== id);
  const writtenOff = body && body.writeOff ? body.writeOff.map((w) => ({ warehouseId: w.warehouseId, warehouseName: "Lager", quantity: w.onHand })) : [];
  return json({ deleted: { id, sku: a.sku, name: a.name }, writtenOff });
};

const zeile = (page, name) => page.locator(".inv-list-table--artikel tbody tr").filter({ hasText: name });
const dialog = (page) => page.getByRole("dialog", { name: "Artikel löschen" });

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("A — Tabelle: drei Aktionen, Prüfung zuerst, Fokus nicht auf der Löschaktion, Löschung, Liste und Meldung", async () => {
  const a = artikel("201", "Dichtungssatz Klein"), b = artikel("202", "Dichtungssatz Groß");
  const { context, page, zustand } = await seite({ liste: [a, b], pruefungen: { 201: pruefung(a, "free") }, loeschen: erfolgreich });
  const z = zeile(page, a.name);
  await z.waitFor({ timeout: 30000 });
  const namen = await z.locator(".inv-row-actions button").evaluateAll((bs) => bs.map((x) => [x.textContent.trim(), x.getAttribute("aria-label")]));
  assert.deepEqual(namen, [["Bearbeiten", null], ["Versenden", null], ["Löschen", `Löschen: ${a.name}`]]);
  await z.getByRole("button", { name: `Löschen: ${a.name}` }).click();
  const d = dialog(page);
  await d.getByText("Der Artikel wird endgültig gelöscht").waitFor();
  assert.ok((await d.innerText()).includes(a.sku));
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "Schließen", "Fokus nicht auf der Löschaktion");
  assert.deepEqual(zustand.pruefAnfragen, ["201"]);
  await d.getByRole("button", { name: "Artikel löschen" }).click();
  await page.getByText(`Artikel „${a.name}“ gelöscht.`).waitFor();
  assert.deepEqual(zustand.loeschAnfragen, [{ id: "201", body: null }], "ohne Bestand keine Bestätigungsdaten");
  assert.equal(await dialog(page).count(), 0);
  assert.equal(await zeile(page, a.name).count(), 0, "Artikel aus der Liste entfernt");
  assert.equal(await zeile(page, b.name).count(), 1);
  assert.deepEqual(zustand.fehler, []);
  await context.close();
});

test("B — Bestand: Mengen je Lager, Löschen erst nach Häkchen, Bestätigung genau der angezeigten Mengen", async () => {
  const a = artikel("211", "Kugellager 6204", 8);
  const { context, page, zustand } = await seite({
    liste: [a], loeschen: erfolgreich,
    pruefungen: { 211: pruefung(a, "stock", { lager: [{ onHand: 5 }, { onHand: 3 }], felder: { onHand: 8 } }) },
  });
  await zeile(page, a.name).getByRole("button", { name: /^Löschen/ }).click();
  const d = dialog(page);
  await d.getByText("Vor dem Löschen wird er ausgebucht").waitFor();
  const liste = await d.locator(".inv-loeschen-liste li").evaluateAll((li) => li.map((x) => x.innerText.replace(/\s+/g, " ").trim()));
  assert.deepEqual(liste, ["Hauptlager 5 Einheiten", "Außenlager 3 Einheiten"]);
  const knopf = d.getByRole("button", { name: "Ausbuchen und löschen" });
  assert.equal(await knopf.isDisabled(), true, "ohne Häkchen gesperrt");
  await d.getByRole("checkbox", { name: "8 Einheiten ausbuchen und den Artikel endgültig löschen" }).check();
  assert.equal(await knopf.isDisabled(), false);
  await knopf.click();
  await page.getByText(`Artikel „${a.name}“ gelöscht. 8 Einheiten ausgebucht.`).waitFor();
  assert.deepEqual(zustand.loeschAnfragen[0].body, { writeOff: [{ warehouseId: "10", onHand: 5 }, { warehouseId: "11", onHand: 3 }] });
  await context.close();
});

test("C — reserviert: keine Löschaktion, Weg zum Auftrag", async () => {
  const a = artikel("221", "Schlauchschelle 20 mm", 10, 4);
  const { context, page, zustand } = await seite({
    liste: [a],
    pruefungen: { 221: pruefung(a, "in_use", { felder: { onHand: 10, reserved: 4, orders: [{ orderId: "7", orderNumber: "CE-AU26-01003", quantity: 4 }] } }) },
  });
  await zeile(page, a.name).getByRole("button", { name: /^Löschen/ }).click();
  const d = dialog(page);
  await d.getByText("Er ist für offene Vorgänge reserviert").waitFor();
  assert.equal(await d.getByRole("button", { name: /löschen/i }).count(), 0, "keine Löschaktion");
  await d.getByRole("button", { name: "CE-AU26-01003" }).click();
  await page.waitForURL(/\/inventory\/orders\/7$/);
  assert.deepEqual(zustand.loeschAnfragen, []);
  await context.close();
});

test("D — gesperrt: keine Löschaktion, Weg zur Artikelseite", async () => {
  const a = artikel("231", "Filtereinsatz", 5, 0, 2);
  const { context, page, zustand } = await seite({
    liste: [a],
    pruefungen: { 231: pruefung(a, "blocked", { lager: [{ onHand: 5, blocked: 2 }], felder: { onHand: 5, blocked: 2 } }) },
  });
  await zeile(page, a.name).getByRole("button", { name: /^Löschen/ }).click();
  const d = dialog(page);
  await d.getByText("Ein Teil des Bestands ist gesperrt").waitFor();
  assert.ok((await d.innerText()).includes("2 Einheiten gesperrt"));
  assert.equal(await d.getByRole("button", { name: /löschen/i }).count(), 0);
  await d.getByRole("button", { name: "Zur Artikelseite" }).click();
  await page.waitForURL(/\/inventory\/products\/231$/);
  assert.deepEqual(zustand.loeschAnfragen, []);
  await context.close();
});

test("E — Konflikt: der Server meldet geänderten Bestand, der Dialog prüft neu, der zweite Versuch gelingt", async () => {
  const a = artikel("241", "Zahnriemen HTD", 5);
  let stand = 5;
  const { context, page, zustand } = await seite({
    liste: [a],
    pruefungen: { 241: () => pruefung(a, "stock", { lager: [{ onHand: stand }], felder: { onHand: stand } }) },
    loeschen: (id, body, z, route, json) => {
      if (z.loeschAnfragen.length === 1) { stand = 7; return json({ error: "x", code: "STOCK_CHANGED", details: { warehouseId: "10", expected: 5, current: 7 } }, 409); }
      return erfolgreich(id, body, z, route, json);
    },
  });
  await zeile(page, a.name).getByRole("button", { name: /^Löschen/ }).click();
  const d = dialog(page);
  await d.getByRole("checkbox").check();
  await d.getByRole("button", { name: "Ausbuchen und löschen" }).click();
  await d.getByText("haben sich inzwischen geändert").waitFor();
  assert.equal(await d.getByRole("checkbox").isChecked(), false, "neu bestätigen");
  assert.ok((await d.innerText()).includes("7 Einheiten"));
  await d.getByRole("checkbox").check();
  await d.getByRole("button", { name: "Ausbuchen und löschen" }).click();
  await page.getByText(`Artikel „${a.name}“ gelöscht. 7 Einheiten ausgebucht.`).waitFor();
  assert.deepEqual(zustand.loeschAnfragen.map((x) => x.body.writeOff[0].onHand), [5, 7]);
  assert.equal(zustand.pruefAnfragen.length, 2);
  await context.close();
});

test("F — Netzwerkfehler, danach „bereits gelöscht“: nie ein falscher Erfolg, Liste neu geladen", async () => {
  const a = artikel("251", "Druckfeder 12 mm");
  const { context, page, zustand } = await seite({
    liste: [a], pruefungen: { 251: pruefung(a, "free") },
    loeschen: (id, body, z, route, json) => {
      if (z.loeschAnfragen.length === 1) { z.liste = []; return route.abort("failed"); }
      return json({ error: "Artikel nicht gefunden", code: "PRODUCT_NOT_FOUND" }, 404);
    },
  });
  await zeile(page, a.name).getByRole("button", { name: /^Löschen/ }).click();
  const d = dialog(page);
  await d.getByRole("button", { name: "Artikel löschen" }).click();
  await d.getByText("Keine Verbindung zum Server").waitFor();
  assert.equal(await page.getByText(`Artikel „${a.name}“ gelöscht.`).count(), 0, "kein Erfolg ohne Antwort");
  await d.getByRole("button", { name: "Artikel löschen" }).click();
  await page.getByText("Der Artikel war bereits gelöscht.").waitFor();
  assert.equal(await zeile(page, a.name).count(), 0);
  await context.close();
});

test("G — Doppelklick: genau eine Löschanfrage", async () => {
  const a = artikel("261", "Sicherungsring");
  const { context, page, zustand } = await seite({
    liste: [a], pruefungen: { 261: pruefung(a, "free") },
    loeschen: async (id, body, z, route, json) => { await new Promise((r) => setTimeout(r, 600)); return erfolgreich(id, body, z, route, json); },
  });
  await zeile(page, a.name).getByRole("button", { name: /^Löschen/ }).click();
  await dialog(page).getByRole("button", { name: "Artikel löschen" }).dblclick();
  await page.getByText(`Artikel „${a.name}“ gelöscht.`).waitFor();
  assert.equal(zustand.loeschAnfragen.length, 1);
  await context.close();
});

test("H — PRODUCT_BUSY: verständliche Meldung, Dialog bleibt offen", async () => {
  const a = artikel("271", "Passfeder");
  const { context, page } = await seite({
    liste: [a], pruefungen: { 271: pruefung(a, "free") },
    loeschen: (id, body, z, route, json) => json({ error: "x", code: "PRODUCT_BUSY" }, 409),
  });
  await zeile(page, a.name).getByRole("button", { name: /^Löschen/ }).click();
  const d = dialog(page);
  await d.getByRole("button", { name: "Artikel löschen" }).click();
  await d.getByText("wird gerade von einem anderen Vorgang verwendet").waitFor();
  assert.equal(await d.getByRole("button", { name: "Artikel löschen" }).isDisabled(), false, "erneut versuchbar");
  assert.equal(await zeile(page, a.name).count(), 1);
  await context.close();
});

test("I — Telefon 390 px: drei Aktionen je Karte, Dialog im Fenster, kein Querüberlauf", async () => {
  const a = artikel("281", "Edelstahl-Winkelverbinder mit sehr langem Artikelnamen für die Kartenansicht", 3);
  const { context, page } = await seite({
    liste: [a], viewport: { width: 390, height: 844 }, kontext: { hasTouch: true, isMobile: true },
    pruefungen: { 281: pruefung(a, "stock", { lager: [{ onHand: 3 }], felder: { onHand: 3 } }) },
  });
  const karte = page.locator(".inv-list-cards--artikel li").filter({ hasText: "Winkelverbinder" });
  await karte.waitFor({ timeout: 30000 });
  const namen = await karte.locator(".inv-card-actions button").evaluateAll((bs) => bs.map((x) => x.textContent.trim().split(":")[0]));
  assert.deepEqual(namen, ["Bearbeiten", "Versenden", "Löschen"]);
  await karte.getByRole("button", { name: /^Löschen/ }).tap();
  const d = dialog(page);
  await d.getByRole("checkbox").waitFor();
  const masse = await page.evaluate(() => {
    const r = document.querySelector('[role="dialog"]').getBoundingClientRect();
    return { l: r.left, r: r.right, w: window.innerWidth, ueber: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  assert.ok(masse.l >= 0 && masse.r <= masse.w && masse.ueber <= 0, JSON.stringify(masse));
  await context.close();
});

test("J — bereits gelöscht beim Öffnen: Meldung, Liste neu geladen", async () => {
  const a = artikel("291", "Gewindestange M8");
  const { context, page, zustand } = await seite({ liste: [a], pruefungen: { 291: (z) => { z.liste = []; return null; } } });
  await zeile(page, a.name).getByRole("button", { name: /^Löschen/ }).click();
  await page.getByText("Der Artikel war bereits gelöscht.").waitFor();
  assert.equal(await zeile(page, a.name).count(), 0);
  assert.deepEqual(zustand.loeschAnfragen, []);
  await context.close();
});

test("K — Historie: Bewegung und Auftragsposition eines gelöschten Artikels ohne Link, mit „Artikel gelöscht“", async () => {
  const bewegung = {
    id: "9100", type: "ADJUSTMENT_OUT", quantity: -5, onHandAfter: 0, productId: null, productDeleted: true, sku: "VT-301", productName: "Lagerbock alt",
    warehouseId: "10", warehouseName: "Hauptlager", referenceType: null, referenceId: null, referenceNumber: null, note: "Ausbuchung beim Löschen des Artikels",
    reason: "product_deleted", createdBy: "7", createdByName: "Anna Berger", createdAt: "2026-10-30T09:00:00Z",
  };
  const auftrag = {
    order: { id: "8", orderNumber: "CE-AU26-01004", status: "shipped", warehouseId: "10", warehouseName: "Hauptlager", customerReference: null,
      recipient: { fullName: "Max Muster", streetAndNumber: "Musterweg 1", postalCode: "10115", city: "Berlin", country: "DE" },
      notes: null, createdAt: "2026-10-29T09:00:00Z", updatedAt: "2026-10-30T09:00:00Z", cancelledAt: null },
    items: [{ id: "81", productId: null, productDeleted: true, productStatus: null, quantity: 2, sku: "VT-301", name: "Lagerbock alt",
      unitWeightKg: 1.25, unitValue: null, reservedQuantity: 0, shippedQuantity: 2 }],
    shipments: [],
  };
  const extra = (pfad, req, json) => {
    if (pfad.endsWith("/api/kunde/inventory/movements")) return json({ movements: [bewegung], nextCursor: null });
    if (pfad.endsWith("/api/kunde/orders/8")) return json(auftrag);
    return null;
  };
  let { context, page } = await seite({ ziel: "/dashboard?page=movements", extra });
  const geloescht = page.locator(".inv-artikel-geloescht").filter({ hasText: "Lagerbock alt" }).first();
  await geloescht.waitFor({ timeout: 30000 });
  assert.ok((await geloescht.innerText()).includes("Artikel gelöscht"));
  assert.equal(await page.getByRole("button", { name: "Lagerbock alt" }).count(), 0, "kein Link ins Leere");
  assert.ok((await page.locator("body").innerText()).includes("Artikel gelöscht"), "Grund der Ausbuchung sichtbar");
  await context.close();
  ({ context, page } = await seite({ ziel: "/inventory/orders/8", extra }));
  const pos = page.locator(".inv-artikel-geloescht").filter({ hasText: "Lagerbock alt" }).first();
  await pos.waitFor({ timeout: 30000 });
  assert.equal(await page.getByRole("button", { name: "Lagerbock alt" }).count(), 0);
  await context.close();
});

test("L — öffentliche Demo: Prüfung aus Beispieldaten, Löschen „In der Demo nicht verfügbar.“, nichts verschwindet", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const fremd = [];
  page.on("request", (r) => { if (r.url().includes("api.confidaraexpress.de")) fremd.push(r.url()); });
  await page.goto(`${BASE}/demo/dashboard?page=products`, { waitUntil: "domcontentloaded" });
  const z = page.locator(".inv-list-table--artikel tbody tr").filter({ hasText: "Versandkarton M" });
  await z.waitFor({ timeout: 30000 });
  await z.getByRole("button", { name: /^Löschen/ }).click();
  const d = dialog(page);
  await d.getByRole("checkbox", { name: "48 Einheiten ausbuchen und den Artikel endgültig löschen" }).check();
  await d.getByRole("button", { name: "Ausbuchen und löschen" }).click();
  await d.getByText("In der Demo nicht verfügbar.").waitFor();
  assert.equal(await page.getByText(/gelöscht\./).count(), 0, "kein stiller Erfolg");
  await d.getByRole("button", { name: "Abbrechen" }).click();
  assert.equal(await page.locator(".inv-list-table--artikel tbody tr").filter({ hasText: "Versandkarton M" }).count(), 1);
  assert.deepEqual(fremd, [], "die Demo erreicht den Server nie");
  await context.close();
});
