// E2E — Artikel importieren (ProductImportDialog) mit gemocktem Backend.
//
// Geprüft wird der Ablauf im echten Browser: Datei lesen (CSV Windows-1252, XLSX mit
// Formelzelle), Spaltenerkennung, Einheiten, kanonisches Dokument im Upload, Vorschau
// mit Fehlertexten, ausdrückliche Bestätigungen (Fehlerzeilen, Wiederholung), Übernahme
// in Abschnitten, Netzabbruch und Fortsetzen, offener Vorgang, Demo, Tastatur, Telefon, Lagerliste.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { zipSync, strToU8 } from "fflate";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";

const PORT = 5671, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && existsSync(path.join(root, "chromium"))) return path.join(root, "chromium");
  for (const p of ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"]) if (existsSync(p)) return p;
  return undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};
const WAREHOUSE = { id: "10", name: "Hauptlager", code: null, status: "active", isDefault: true, notes: null, createdAt: "2026-08-01T10:00:00Z", updatedAt: "2026-08-01T10:00:00Z" };
const PRODUKT = {
  id: "100", sku: "ART-1", name: "Artikel A", description: null, ean: null, weightKg: 1.25, lengthCm: null, widthCm: null, heightCm: null,
  unitValue: 19.99, hsCode: null, countryOfOrigin: null, customsDescription: null, defaultWarehouseId: null, defaultLocationId: null,
  minStock: 10, status: "active", createdAt: "2026-08-01T10:00:00Z", updatedAt: "2026-08-01T10:00:00Z",
  stock: { onHand: 100, reserved: 5, blocked: 0, available: 95 },
};

function header(over = {}) {
  return {
    id: "77", status: "analyzed", stockMode: "counted", updateExisting: true, warehouseId: "10", warehouseName: "Hauptlager",
    source: { type: "csv", name: "artikel.csv", sheet: null }, columns: { sku: "Art.-Nr.", weightKg: "Gewicht (g)", stock: "Bestand" },
    totalRows: 3, counts: { create: 1, update: 1, unchanged: 0, skipped: 0, error: 1, stockChanges: 2, warnings: 0 },
    progress: { pending: 2, noop: 0, skipped: 0, error: 1, applied: 0, stale: 0, failed: 0, cancelled: 0, appliedCreated: 0, appliedUpdated: 0 },
    repeat: null, createdAt: "2026-10-29T10:00:00Z", expiresAt: "2026-10-30T10:00:00Z", confirmedAt: null, completedAt: null,
    ...over,
  };
}
const ZEILEN = [
  { rowNo: 2, sku: "A-1", action: "create", applyStatus: "pending", applyCode: null, issues: [], changes: [], stock: { value: 10, onHandBefore: 0, delta: 10 }, productId: null },
  { rowNo: 3, sku: "ART-1", action: "update", applyStatus: "pending", applyCode: null, issues: [], changes: [{ field: "weightKg", before: 1.25, after: 0.5 }], stock: { value: 98, onHandBefore: 100, delta: -2 }, productId: "100" },
  { rowNo: 4, sku: "B-2", action: "error", applyStatus: "error", applyCode: null, issues: [{ field: "weightKg", code: "ROW_FIELD_INVALID", severity: "error" }], changes: [], stock: null, productId: null },
];

let server, browser;

/** Zustandsbehaftetes Backend je Test. */
function neuesSzenario(opt = {}) {
  return {
    offen: opt.offen || null,
    analyse: opt.analyse || header(),
    applyFolge: opt.applyFolge || [],
    nachAbbruch: opt.nachAbbruch || null,
    uploads: [],
    applyBodies: [],
    zeilenAbfragen: [],
  };
}

async function setupRoutes(page, sz) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.endsWith("/api/kunde/warehouses")) {
      if (sz.lagerFehler > 0) { sz.lagerFehler--; return json({ error: "Interner Fehler" }, 500); }
      if (sz.lagerVerzoegerung) await new Promise((r) => setTimeout(r, sz.lagerVerzoegerung));
      return json({ warehouses: [WAREHOUSE], nextCursor: null });
    }
    if (p.endsWith("/api/kunde/products")) return json({ products: [PRODUKT], nextCursor: null });
    if (p.endsWith("/api/kunde/inventory/imports")) {
      if (req.method() === "GET") return json({ import: sz.offen });
      sz.uploads.push({ contentType: req.headers()["content-type"] || "", body: (req.postDataBuffer() || Buffer.alloc(0)).toString("utf8") });
      return json({ import: sz.analyse }, 201);
    }
    if (/\/api\/kunde\/inventory\/imports\/77\/rows$/.test(p)) {
      const filter = url.searchParams.get("filter") || "all";
      sz.zeilenAbfragen.push(filter);
      const passt = (z) => filter === "all" || (filter === "error" && z.applyStatus === "error")
        || (filter === "problems" && ["error", "stale", "failed"].includes(z.applyStatus)) || (filter === z.action);
      return json({ rows: ZEILEN.filter(passt), nextAfter: null });
    }
    if (/\/api\/kunde\/inventory\/imports\/77\/apply$/.test(p)) {
      sz.applyBodies.push(req.postDataJSON());
      const naechste = sz.applyFolge.shift();
      if (naechste === "abbruch") return route.abort("failed");
      return json(naechste || { import: header({ status: "completed", progress: { ...header().progress, pending: 0 } }), chunk: null, done: true });
    }
    if (/\/api\/kunde\/inventory\/imports\/77$/.test(p)) return json({ import: sz.nachAbbruch || sz.analyse });
    if (/\/api\/kunde\/inventory\/imports\/77\/discard$/.test(p)) return json({ import: { ...sz.analyse, status: "discarded" } });
    if (p.includes("/api/kunde/")) return json({ items: [], drafts: [], nextCursor: null, pagination: { total: 0 } });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function artikelseite(sz, viewport = { width: 1440, height: 950 }) {
  const page = await browser.newPage({ viewport });
  await setupRoutes(page, sz);
  await page.goto(`${BASE}/dashboard?page=products`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Artikel", level: 1 }).waitFor();
  return page;
}

const dialog = (page) => page.getByRole("dialog", { name: "Artikel importieren" });

// CSV wie aus Excel „CSV (Trennzeichen-getrennt)“ unter deutschem Windows: Windows-1252, Semikolon.
const CSV_1252 = Buffer.from("Art.-Nr.;Bezeichnung;Gewicht (g);Bestand\r\nA-1;Schraube Größe M6;250;10\r\nART-1;Artikel A;500;98\r\nB-2;Mutter;0,05;3\r\n", "latin1");

function xlsxDatei() {
  const ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const wb = '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Artikel" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const wbRels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
  const sheet = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    + '<row r="1"><c r="A1" t="inlineStr"><is><t>Nr</t></is></c><c r="B1" t="inlineStr"><is><t>Name</t></is></c><c r="C1" t="inlineStr"><is><t>Gewicht (kg)</t></is></c><c r="D1" t="inlineStr"><is><t>Menge</t></is></c></row>'
    + '<row r="2"><c r="A2" t="inlineStr"><is><t>X-1</t></is></c><c r="B2" t="inlineStr"><is><t>Winkel</t></is></c><c r="C2"><f>0.2*2</f><v>0.4</v></c><c r="D2"><v>5</v></c></row>'
    + "</sheetData></worksheet>";
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8(ct), "_rels/.rels": strToU8(rels), "xl/workbook.xml": strToU8(wb),
    "xl/_rels/workbook.xml.rels": strToU8(wbRels), "xl/worksheets/sheet1.xml": strToU8(sheet),
  }));
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

test("1 — CSV (Windows-1252, Gramm) bis zum Ergebnis: Dokument im Upload, Fehlerbestätigung, Abschnitte", async () => {
  const sz = neuesSzenario({
    applyFolge: [
      { import: header({ status: "applying", progress: { ...header().progress, pending: 1, applied: 1, appliedCreated: 1 } }), chunk: { applied: 1, conflicts: 0 }, done: false },
      { import: header({ status: "completed", progress: { ...header().progress, pending: 0, applied: 2, appliedCreated: 1, appliedUpdated: 1 } }), chunk: { applied: 1, conflicts: 0 }, done: true },
    ],
  });
  const page = await artikelseite(sz);
  try {
    await page.getByRole("button", { name: "Artikel importieren" }).click();
    const d = dialog(page);
    await d.getByRole("heading", { name: "Datei auswählen" }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.textContent), "Datei auswählen");
    await d.locator("#inv-import-file").setInputFiles({ name: "artikel.csv", mimeType: "text/csv", buffer: CSV_1252 });
    await d.getByRole("heading", { name: "Spalten prüfen" }).waitFor();
    assert.match(await d.innerText(), /Zeichensatz Windows-1252 erkannt/);
    assert.equal(await d.locator(".inv-import-column").count(), 4);
    assert.equal(await d.getByText("erkannt", { exact: true }).count(), 4);
    assert.equal(await d.getByRole("radio", { name: "Gramm (g)" }).isChecked(), true);
    assert.equal(await d.getByRole("radio", { name: /Bestand übernehmen/ }).isChecked(), true);
    // Nichts liegt über dem Fuß des Dialogs (Regression: unsichtbare Auswahlradios über den Knöpfen).
    const obenauf = await page.evaluate(() => {
      const b = [...document.querySelectorAll(".ce-dialog-actions button")].find((x) => x.textContent === "Datei prüfen lassen");
      const r = b.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b;
    });
    assert.equal(obenauf, true, "ein Element verdeckt „Datei prüfen lassen“");

    await d.getByRole("button", { name: "Datei prüfen lassen" }).click();
    await d.getByRole("heading", { name: "Vorschau" }).waitFor();
    const up = sz.uploads[0];
    assert.match(up.contentType, /^multipart\/form-data; boundary=/);
    assert.match(up.body, /name="document"; filename="import\.json"\r\nContent-Type: application\/json/);
    const doc = JSON.parse(up.body.slice(up.body.indexOf("{"), up.body.lastIndexOf("}") + 1));
    assert.deepEqual(doc.options, { stockMode: "counted", updateExisting: true, warehouseId: "10" });
    assert.deepEqual(doc.rows[0], { row: 2, values: { sku: "A-1", name: "Schraube Größe M6", weightKg: 0.25, stock: 10 } });
    assert.deepEqual(doc.rows[2].values.weightKg, 0.00005);

    assert.match(await d.innerText(), /Gewicht \(g\): bitte zwischen 0,1 und 1\.000 kg angeben\./);
    const uebernehmen = d.getByRole("button", { name: "2 Zeilen übernehmen" });
    assert.equal(await uebernehmen.isDisabled(), true, "ohne Bestätigung der Fehlerzeilen keine Übernahme");
    // Einzahl bei einer Zeile: „1 fehlerhafte Zeile“, nicht „1 fehlerhafte Zeilen“.
    await d.getByLabel(/^1 fehlerhafte Zeile überspringen/).check();
    await uebernehmen.click();
    await d.getByText("Der Import ist abgeschlossen.").waitFor();
    assert.deepEqual(sz.applyBodies[0], { confirm: true, skipInvalidRows: true, confirmRepeat: false });
    assert.equal(sz.applyBodies.length, 2);
    const ergebnis = await d.locator(".inv-import-result").innerText();
    assert.match(ergebnis, /Neu angelegt\s+1/);
    assert.match(ergebnis, /Aktualisiert\s+1/);
    assert.match(ergebnis, /Fehlerhaft\s+1/);
    await d.getByRole("button", { name: "Fertig" }).click();
    await page.getByText("Import abgeschlossen: 2 Artikel übernommen.").waitFor();
  } finally {
    await page.close();
  }
});

test("2 — Netzabbruch während der Übernahme: unterbrochen, sicher fortsetzbar", async () => {
  const laufend = header({ status: "applying", counts: { ...header().counts, error: 0 }, progress: { ...header().progress, error: 0, pending: 1, applied: 1 } });
  const sz = neuesSzenario({
    analyse: header({ counts: { ...header().counts, error: 0 }, progress: { ...header().progress, error: 0 } }),
    applyFolge: ["abbruch", { import: header({ status: "completed", progress: { ...header().progress, error: 0, pending: 0, applied: 2, appliedCreated: 1, appliedUpdated: 1 } }), chunk: { applied: 1, conflicts: 0 }, done: true }],
    nachAbbruch: laufend,
  });
  const page = await artikelseite(sz);
  try {
    await page.getByRole("button", { name: "Artikel importieren" }).click();
    const d = dialog(page);
    await d.locator("#inv-import-file").setInputFiles({ name: "artikel.csv", mimeType: "text/csv", buffer: CSV_1252 });
    await d.getByRole("button", { name: "Datei prüfen lassen" }).click();
    await d.getByRole("button", { name: "2 Zeilen übernehmen" }).click();
    await d.getByText(/Übernahme unterbrochen/).waitFor();
    assert.match(await d.innerText(), /keine Zeile wird doppelt gebucht/);
    await d.getByRole("button", { name: "Übernahme fortsetzen" }).click();
    await d.getByText("Der Import ist abgeschlossen.").waitFor();
  } finally {
    await page.close();
  }
});

test("3 — ein unterbrochener Vorgang wird beim Öffnen zur Fortsetzung angeboten", async () => {
  const sz = neuesSzenario({ offen: header({ status: "applying", progress: { ...header().progress, pending: 1, applied: 1 } }) });
  const page = await artikelseite(sz);
  try {
    await page.getByRole("button", { name: "Artikel importieren" }).click();
    const d = dialog(page);
    await d.getByRole("button", { name: "Übernahme fortsetzen" }).waitFor();
    assert.match(await d.innerText(), /Übernahme unterbrochen/);
    assert.ok(sz.zeilenAbfragen.includes("problems"));
  } finally {
    await page.close();
  }
});

test("4 — XLSX: Formelzelle wird markiert, mehrdeutige Spalten tragen „bitte prüfen“", async () => {
  const sz = neuesSzenario();
  const page = await artikelseite(sz);
  try {
    await page.getByRole("button", { name: "Artikel importieren" }).click();
    const d = dialog(page);
    await d.locator("#inv-import-file").setInputFiles({ name: "artikel.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: xlsxDatei() });
    await d.getByRole("heading", { name: "Spalten prüfen" }).waitFor();
    assert.match(await d.locator(".inv-import-lead").first().innerText(), /· 1 Zeile unter der Kopfzeile/);
    assert.equal(await d.getByText("bitte prüfen", { exact: true }).count(), 2);
    assert.equal(await d.getByLabel("Übernehmen als (Spalte Nr)").inputValue(), "sku");
    assert.equal(await d.getByLabel("Übernehmen als (Spalte Menge)").inputValue(), "stock");
    await d.getByRole("button", { name: "Datei prüfen lassen" }).click();
    await d.getByRole("heading", { name: "Vorschau" }).waitFor();
    const body = sz.uploads[0].body;
    const doc = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
    assert.deepEqual(doc.source, { type: "xlsx", name: "artikel.xlsx", sheet: "Artikel" });
    assert.deepEqual(doc.rows[0], { row: 2, values: { sku: "X-1", name: "Winkel", stock: 5 }, issues: [{ field: "weightKg", code: "FORMULA" }] });
  } finally {
    await page.close();
  }
});

test("5 — erkannte Wiederholung eines Wareneingangs verlangt die ausdrückliche Bestätigung", async () => {
  const sz = neuesSzenario({
    analyse: header({
      stockMode: "receipt", counts: { ...header().counts, error: 0 }, progress: { ...header().progress, error: 0 },
      repeat: { importId: "70", createdAt: "2026-10-28T09:00:00Z", sourceName: "lieferung.csv", matches: 2, total: 2, identical: true, confirmed: false },
    }),
  });
  const page = await artikelseite(sz);
  try {
    await page.getByRole("button", { name: "Artikel importieren" }).click();
    const d = dialog(page);
    await d.locator("#inv-import-file").setInputFiles({ name: "artikel.csv", mimeType: "text/csv", buffer: CSV_1252 });
    await d.getByRole("radio", { name: /Wareneingang buchen/ }).check();
    await d.getByRole("button", { name: "Datei prüfen lassen" }).click();
    await d.getByText(/Diese Wareneingänge wurden bereits gebucht/).waitFor();
    const knopf = d.getByRole("button", { name: "2 Zeilen übernehmen" });
    assert.equal(await knopf.isDisabled(), true);
    await d.getByLabel("Es ist eine neue Lieferung — erneut buchen").check();
    await knopf.click();
    await d.getByText("Der Import ist abgeschlossen.").waitFor();
    assert.deepEqual(sz.applyBodies[0], { confirm: true, skipInvalidRows: false, confirmRepeat: true });
    const doc = JSON.parse(sz.uploads[0].body.slice(sz.uploads[0].body.indexOf("{"), sz.uploads[0].body.lastIndexOf("}") + 1));
    assert.equal(doc.options.stockMode, "receipt");
  } finally {
    await page.close();
  }
});

test("6 — Demo: die Datei wird gelesen, der Serverschritt meldet „In der Demo nicht verfügbar.“", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  try {
    await page.goto(`${BASE}/demo/dashboard?page=products`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Artikel importieren" }).first().click();
    const d = dialog(page);
    await d.locator("#inv-import-file").setInputFiles({ name: "artikel.csv", mimeType: "text/csv", buffer: CSV_1252 });
    await d.getByRole("button", { name: "Datei prüfen lassen" }).click();
    await d.getByText("In der Demo nicht verfügbar.").waitFor();
    assert.deepEqual(fehler, []);
  } finally {
    await ctx.close();
  }
});

test("7 — Tastatur und Telefonbreite: Fokus im Dialog, Escape schließt, nichts läuft quer aus dem Bild", async () => {
  const sz = neuesSzenario();
  const page = await artikelseite(sz, { width: 390, height: 844 });
  try {
    await page.getByRole("button", { name: "Artikel importieren" }).focus();
    await page.keyboard.press("Enter");
    const d = dialog(page);
    await d.getByRole("heading", { name: "Datei auswählen" }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.textContent), "Datei auswählen");
    await d.locator("#inv-import-file").setInputFiles({ name: "artikel.csv", mimeType: "text/csv", buffer: CSV_1252 });
    await d.getByRole("heading", { name: "Spalten prüfen" }).waitFor();
    const quer = await page.evaluate(() => {
      const el = document.querySelector(".ce-dialog");
      const body = document.querySelector(".ce-dialog .ce-dialog-body");
      return { dialog: el.scrollWidth - el.clientWidth, body: body.scrollWidth - body.clientWidth, seite: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.ok(quer.dialog <= 1 && quer.body <= 1 && quer.seite <= 1, `querlaufend: ${JSON.stringify(quer)}`);
    await page.keyboard.press("Escape");
    await d.waitFor({ state: "detached" });
  } finally {
    await page.close();
  }
});

test("8 — Lager: der Dialog lädt sie selbst; langsame Antwort und Ladefehler bieten kein zweites Hauptlager an", async () => {
  const sz = neuesSzenario();
  const page = await artikelseite(sz);
  try {
    // Langsame Lagerliste: Prüfen bleibt gesperrt, bis sie da ist — kein „Hauptlager anlegen“ dazwischen.
    sz.lagerVerzoegerung = 1500;
    await page.getByRole("button", { name: "Artikel importieren" }).click();
    const d = dialog(page);
    await d.locator("#inv-import-file").setInputFiles({ name: "artikel.csv", mimeType: "text/csv", buffer: CSV_1252 });
    await d.getByRole("heading", { name: "Spalten prüfen" }).waitFor();
    const pruefen = d.getByRole("button", { name: "Datei prüfen lassen" });
    await d.getByText("Die Lager werden noch geladen.").waitFor();
    assert.equal(await pruefen.isDisabled(), true);
    assert.equal(await d.getByRole("button", { name: "Hauptlager anlegen" }).count(), 0);
    await d.getByRole("button", { name: "Datei prüfen lassen", disabled: false }).waitFor();
    assert.equal(await d.getByText("Die Lager werden noch geladen.").count(), 0);
    assert.equal(await d.getByLabel("Lager", { exact: true }).count(), 0, "ein einziges Lager braucht keine Auswahl");
    await page.keyboard.press("Escape");
    await d.waitFor({ state: "detached" });

    // Ladefehler: erneutes Laden statt „Hauptlager anlegen“.
    sz.lagerVerzoegerung = 0;
    sz.lagerFehler = 1;
    await page.getByRole("button", { name: "Artikel importieren" }).click();
    await d.locator("#inv-import-file").setInputFiles({ name: "artikel.csv", mimeType: "text/csv", buffer: CSV_1252 });
    await d.getByText("Die Lager konnten nicht geladen werden.").waitFor();
    assert.equal(await d.getByRole("button", { name: "Hauptlager anlegen" }).count(), 0);
    assert.equal(await pruefen.isDisabled(), true);
    await d.getByRole("button", { name: "Lager erneut laden" }).click();
    // Erneutes Laden geht über „werden geladen“ — erst die freigegebene Prüfung ist das Ende.
    await d.getByRole("button", { name: "Datei prüfen lassen", disabled: false }).waitFor();
    assert.equal(await d.getByText("Die Lager konnten nicht geladen werden.").count(), 0);
    assert.equal(await d.getByRole("button", { name: "Lager erneut laden" }).count(), 0);
  } finally {
    await page.close();
  }
});
