// E2E — Lieferscheine (Lager & Aufträge) mit gemocktem Backend.
//
// Geprüft wird im echten Browser: die Übersicht zeigt je Sendung den geltenden Lieferschein in
// Kundensprache (ConfidaraExpress, eigener — hochgeladen oder aus der Vorlage —, keiner), Filter
// und Suche gehen als Serverparameter hinaus, Hochladen mit Vorprüfung, Fehlertext und Erfolg,
// Verlauf mit Zurückziehen, die Briefpapier-Vorlage vom Upload bis „verwenden“, Tastatur,
// Telefonbreite (390/360) und die öffentliche Demo ohne einen einzigen API-Aufruf.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";

const PORT = 5681, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && existsSync(path.join(root, "chromium"))) return path.join(root, "chromium");
  for (const p of ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"]) if (existsSync(p)) return p;
  return undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
  delivery_note_mode: "confidara",
};
const EMPF = (company, city) => ({ company, fullName: "Erika Muster", city, country: "DE" });
const AKTIONEN = (o = {}) => ({ canUpload: true, canCreateConfidara: false, canCreateFromTemplate: true, hasItems: true, ...o });
const CE = (number) => ({ source: "confidara", origin: "confidara", version: null, number, date: "2026-10-28T09:05:00Z", createdVia: "booking" });
const EIGEN = (origin, version, number) => ({ source: "own", origin, version, number, date: "2026-10-28T11:00:00Z", createdVia: "customer" });

function zeilen() {
  return [
    { shipmentId: "301", status: "booked", bookedAt: "2026-10-28T09:00:00Z", orderConfirmationNumber: "CE-AB26-00301", orderNumber: "CE-AU26-00041",
      recipient: EMPF("Beispiel AG", "Frankfurt am Main"), externalDeliveryNoteNumber: null, effective: CE("CE-LS26-00012"),
      hasConfidara: true, confidaraNumber: "CE-LS26-00012", versionCount: 0, actions: AKTIONEN() },
    { shipmentId: "302", status: "delivered", bookedAt: "2026-10-27T09:00:00Z", orderConfirmationNumber: "CE-AB26-00302", orderNumber: null,
      recipient: EMPF("Nordhafen Technik GmbH", "Hamburg"), externalDeliveryNoteNumber: null, effective: EIGEN("upload", 2, "LS-4711-B"),
      hasConfidara: true, confidaraNumber: "CE-LS26-00011", versionCount: 2, actions: AKTIONEN() },
    { shipmentId: "303", status: "in_transit", bookedAt: "2026-10-26T09:00:00Z", orderConfirmationNumber: "CE-AB26-00303", orderNumber: null,
      recipient: EMPF("Alpen Handels GmbH", "Wien"), externalDeliveryNoteNumber: null, effective: EIGEN("template", 1, "CE-LS26-00010"),
      hasConfidara: true, confidaraNumber: "CE-LS26-00010", versionCount: 1, actions: AKTIONEN() },
    { shipmentId: "304", status: "booked", bookedAt: "2026-10-25T09:00:00Z", orderConfirmationNumber: "CE-AB26-00304", orderNumber: null,
      recipient: EMPF("Werkstatt Süd KG", "München"), externalDeliveryNoteNumber: null, effective: null,
      hasConfidara: false, confidaraNumber: null, versionCount: 0, actions: AKTIONEN({ canCreateFromTemplate: false, hasItems: false }) },
  ];
}

function verlauf302(sz) {
  const v2Zurueck = sz.zurueckgezogen.includes(2);
  return {
    shipment: { id: "302", status: "delivered", bookedAt: "2026-10-27T09:00:00Z", orderConfirmationNumber: "CE-AB26-00302", orderNumber: null,
      recipient: EMPF("Nordhafen Technik GmbH", "Hamburg"), externalDeliveryNoteNumber: null },
    effective: v2Zurueck ? EIGEN("upload", 1, "LS-4711") : EIGEN("upload", 2, "LS-4711-B"),
    confidara: { number: "CE-LS26-00011", issuedAt: "2026-10-27T09:05:00Z", createdVia: "booking", effective: false },
    versions: [
      { version: 2, origin: "upload", number: "LS-4711-B", createdAt: "2026-10-28T11:00:00Z", createdVia: "customer",
        withdrawnAt: v2Zurueck ? "2026-10-29T08:00:00Z" : null, available: true, pageCount: 1, sizeBytes: 88000, effective: !v2Zurueck },
      { version: 1, origin: "upload", number: "LS-4711", createdAt: "2026-10-27T15:00:00Z", createdVia: "customer",
        withdrawnAt: null, available: true, pageCount: 1, sizeBytes: 87000, effective: v2Zurueck },
    ],
    actions: AKTIONEN(),
    limits: { maxVersions: 20, maxBytes: 5 * 1024 * 1024, maxPages: 20, numberMaxLength: 64 },
  };
}

const VORLAGE_GRENZEN = {
  maxBytes: 3 * 1024 * 1024, maxPages: 2,
  areas: { topFirstMm: { min: 15, max: 140 }, topNextMm: { min: 15, max: 140 }, bottomMm: { min: 10, max: 80 } },
  defaults: { topFirstMm: 45, topNextMm: 30, bottomMm: 25 },
};
const VORLAGE_META = (areas, aktiv) => ({ pageCount: 2, sizeBytes: 180000, areas, createdAt: "2026-10-29T10:00:00Z",
  activatedAt: aktiv ? "2026-10-29T10:05:00Z" : null, available: true });

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");

let server, browser;

function neuesSzenario(opt = {}) {
  return {
    rows: zeilen(), listen: [], uploads: [], uploadFehler: opt.uploadFehler || null, zurueckgezogen: [],
    vorlage: { draft: null, active: null, limits: VORLAGE_GRENZEN }, vorlageBodies: [],
  };
}

async function setupRoutes(page, sz) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p === "/api/kunde/delivery-notes") {
      sz.listen.push(Object.fromEntries(url.searchParams));
      const quelle = url.searchParams.get("source");
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const items = sz.rows.filter((r) => (!quelle || (quelle === "none" ? !r.effective : r.effective && r.effective.source === quelle))
        && (!q || [r.orderConfirmationNumber, r.effective && r.effective.number].some((t) => t && t.toLowerCase().includes(q))));
      return json({ items, nextCursor: null, templateActive: true, limits: { maxVersions: 20, maxBytes: 5 * 1024 * 1024, maxPages: 20, numberMaxLength: 64 } });
    }
    if (p === "/api/shipments/302/delivery-notes") return json(verlauf302(sz));
    if (p === "/api/shipments/302/delivery-notes/versions/2/withdraw" && m === "POST") {
      sz.zurueckgezogen.push(2);
      sz.rows[1].effective = EIGEN("upload", 1, "LS-4711");
      return json({ withdrawn: true, effective: EIGEN("upload", 1, "LS-4711") });
    }
    if (p === "/api/shipments/304/delivery-notes/uploads" && m === "POST") {
      sz.uploads.push({ contentType: req.headers()["content-type"] || "", body: (req.postDataBuffer() || Buffer.alloc(0)).toString("latin1") });
      if (sz.uploadFehler) {
        const code = sz.uploadFehler;
        sz.uploadFehler = null;
        return json({ error: "Die PDF-Datei enthält aktive Inhalte (Skripte, Aktionen oder eingebettete Dateien).", code }, 400);
      }
      sz.rows[3] = { ...sz.rows[3], effective: EIGEN("upload", 1, "WS-2026-77"), versionCount: 1 };
      return json({ version: 1, created: true, effective: EIGEN("upload", 1, "WS-2026-77") }, 201);
    }
    if (/^\/api\/shipments\/\d+\/delivery-note$/.test(p)) {
      return route.fulfill({ status: 200, contentType: "application/pdf", body: PDF,
        headers: { "Content-Disposition": 'attachment; filename="Lieferschein_CE-LS26-00012_v1.pdf"' } });
    }
    if (p === "/api/kunde/delivery-note-template") {
      if (m === "GET") return json(sz.vorlage);
      sz.vorlageBodies.push({ art: "upload", contentType: req.headers()["content-type"] || "" });
      sz.vorlage = { ...sz.vorlage, draft: VORLAGE_META({ topFirstMm: 45, topNextMm: 30, bottomMm: 25 }, false) };
      return json({ draft: sz.vorlage.draft }, 201);
    }
    if (p === "/api/kunde/delivery-note-template/draft" && m === "PATCH") {
      const body = req.postDataJSON();
      sz.vorlageBodies.push({ art: "areas", body });
      sz.vorlage = { ...sz.vorlage, draft: { ...sz.vorlage.draft, areas: body } };
      return json({ draft: sz.vorlage.draft });
    }
    if (p === "/api/kunde/delivery-note-template/draft/activate" && m === "POST") {
      sz.vorlageBodies.push({ art: "activate" });
      sz.vorlage = { ...sz.vorlage, active: { ...sz.vorlage.draft, activatedAt: "2026-10-29T10:10:00Z" }, draft: null };
      return json({ active: sz.vorlage.active });
    }
    if (p.includes("/api/kunde/")) return json({ items: [], nextCursor: null, pagination: { total: 0 } });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function lieferscheinseite(sz, viewport = { width: 1440, height: 950 }) {
  const page = await browser.newPage({ viewport });
  await setupRoutes(page, sz);
  await page.goto(`${BASE}/dashboard?page=deliverynotes`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Lieferscheine", level: 1 }).waitFor();
  await page.locator(".inv-list-table--lieferscheine tbody tr, .inv-list-cards--lieferscheine li").first().waitFor({ state: "attached" });
  return page;
}

const tabelle = (page) => page.locator(".inv-list-table--lieferscheine");
const zeile = (page, ab) => tabelle(page).locator("tbody tr", { hasText: ab });
async function menue(page, ab, eintrag) {
  await zeile(page, ab).getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: eintrag }).click();
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

test("1 — Übersicht: jede Art in Kundensprache, Hauptaktion je Zeile, Navigation unter „Lager & Aufträge“", async () => {
  const sz = neuesSzenario();
  const page = await lieferscheinseite(sz);
  try {
    assert.equal(await tabelle(page).isVisible(), true, "bei 1440 px steht die Tabelle");
    assert.equal(await page.locator(".inv-list-cards--lieferscheine").isVisible(), false);
    assert.match(await zeile(page, "CE-AB26-00301").innerText(), /ConfidaraExpress[\s\S]*CE-LS26-00012/);
    assert.match(await zeile(page, "CE-AB26-00302").innerText(), /Eigener Lieferschein[\s\S]*LS-4711-B[\s\S]*PDF hochgeladen/);
    assert.match(await zeile(page, "CE-AB26-00303").innerText(), /Eigener Lieferschein[\s\S]*Aus eigener Vorlage/);
    assert.match(await zeile(page, "CE-AB26-00304").innerText(), /Kein Lieferschein/);
    for (const ab of ["CE-AB26-00301", "CE-AB26-00302", "CE-AB26-00303"]) {
      assert.equal(await zeile(page, ab).getByRole("button", { name: "Herunterladen" }).count(), 1, ab);
    }
    assert.equal(await zeile(page, "CE-AB26-00304").getByRole("button", { name: "Hochladen" }).count(), 1);
    const text = await page.locator("main, .page-body").first().innerText();
    assert.doesNotMatch(text, /DELIVERY_NOTE|PDF_[A-Z]|\bown\b|\bupload\b|\btemplate\b/, "keine Serverwerte im sichtbaren Text");
    // Der Sidebar-Eintrag führt hierher, auch aus einem anderen Bereich.
    await page.goto(`${BASE}/dashboard?page=orders`, { waitUntil: "networkidle" });
    await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: "Lieferscheine" }).click();
    await page.getByRole("heading", { name: "Lieferscheine", level: 1 }).waitFor();
  } finally {
    await page.close();
  }
});

test("2 — Filter und Suche gehen als Serverparameter hinaus; ohne Treffer ein Weg zurück", async () => {
  const sz = neuesSzenario();
  const page = await lieferscheinseite(sz);
  try {
    await page.getByLabel("Lieferschein", { exact: true }).selectOption("own");
    await page.waitForFunction(() => document.querySelectorAll(".inv-list-table--lieferscheine tbody tr").length === 2);
    assert.equal(sz.listen.at(-1).source, "own");
    await page.getByLabel("Lieferscheine durchsuchen").fill("LS-4711");
    await page.waitForFunction(() => document.querySelectorAll(".inv-list-table--lieferscheine tbody tr").length === 1);
    assert.deepEqual([sz.listen.at(-1).q, sz.listen.at(-1).source], ["LS-4711", "own"]);
    await page.getByLabel("Lieferscheine durchsuchen").fill("gibt es nicht");
    await page.getByText("Keine Sendungen gefunden").waitFor();
    await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
    await page.waitForFunction(() => document.querySelectorAll(".inv-list-table--lieferscheine tbody tr").length === 4);
  } finally {
    await page.close();
  }
});

test("3 — Hochladen: Ziel und bereinigte Fassung genannt, Vorprüfung, Fehler in Kundensprache, dann Erfolg", async () => {
  const sz = neuesSzenario({ uploadFehler: "PDF_ACTIVE_CONTENT" });
  const page = await lieferscheinseite(sz);
  try {
    await zeile(page, "CE-AB26-00304").getByRole("button", { name: "Hochladen" }).click();
    const d = page.getByRole("dialog", { name: "Eigenen Lieferschein hochladen" });
    await d.waitFor();
    assert.match(await d.innerText(), /CE-AB26-00304[\s\S]*Werkstatt Süd KG, München/);
    assert.match(await d.innerText(), /Gespeichert wird eine bereinigte Fassung/);
    const senden = d.getByRole("button", { name: "Hochladen und verwenden" });
    assert.equal(await senden.isDisabled(), true);
    assert.equal(await d.getByRole("button", { name: "PDF-Datei Datei auswählen" }).count(), 1, "sichtbare Dateiauswahl als Knopf");
    // Vorprüfung im Browser: eine Nicht-PDF fällt sofort auf, der Server sieht sie nie.
    await d.locator("input[type=file]").setInputFiles({ name: "lieferschein.docx", mimeType: "application/msword", buffer: Buffer.from("x") });
    await d.getByText("Bitte wählen Sie eine PDF-Datei aus.").waitFor();
    assert.equal(await senden.isDisabled(), true);
    assert.equal(sz.uploads.length, 0);
    await d.locator("input[type=file]").setInputFiles({ name: "LS 2026-77.pdf", mimeType: "application/pdf", buffer: PDF });
    await d.getByLabel("Lieferscheinnummer (optional)").fill("WS-2026-77");
    await senden.click();
    await d.getByText(/enthält aktive Inhalte wie Skripte/).waitFor();
    assert.doesNotMatch(await d.innerText(), /PDF_ACTIVE_CONTENT/);
    await senden.click();
    await d.waitFor({ state: "detached" });
    await page.getByText("Ihr Lieferschein gilt ab sofort für Sendung CE-AB26-00304. Der bisherige bleibt im Verlauf.").waitFor();
    assert.equal(sz.uploads.length, 2);
    const teil = sz.uploads[1];
    assert.match(teil.contentType, /^multipart\/form-data/);
    assert.match(teil.body, /name="file"; filename="[^"]+"/);
    assert.match(teil.body, /name="documentNumber"\r\n\r\nWS-2026-77/);
    assert.match(await zeile(page, "CE-AB26-00304").innerText(), /Eigener Lieferschein[\s\S]*WS-2026-77/);
  } finally {
    await page.close();
  }
});

test("4 — Verlauf: welche gilt, ersetzt und zurückgezogen; Zurückziehen mit Bestätigung", async () => {
  const sz = neuesSzenario();
  const page = await lieferscheinseite(sz);
  try {
    await menue(page, "CE-AB26-00302", "Verlauf anzeigen");
    const d = page.getByRole("dialog", { name: "Verlauf des Lieferscheins" });
    await d.getByText("Eigener Lieferschein, Fassung 2").waitFor();
    const eintraege = d.locator(".dn-verlauf-eintrag");
    assert.equal(await eintraege.count(), 3);
    assert.match(await eintraege.nth(0).innerText(), /Fassung 2[\s\S]*Gilt/);
    assert.match(await d.locator(".dn-verlauf-eintrag", { hasText: "ConfidaraExpress-Lieferschein" }).innerText(), /Ersetzt/);
    const aktiv = () => page.evaluate(() => {
      const a = document.activeElement;
      return a ? (a.getAttribute("data-dn-zurueck") ? `zurueck:${a.getAttribute("data-dn-zurueck")}` : (a.textContent || "").trim()) : null;
    });
    // Der benutzte Knopf verschwindet: die Rückfrage öffnet mit dem Fokus auf „Abbrechen“, Abbrechen bringt ihn zurück.
    await eintraege.nth(0).getByRole("button", { name: "Zurückziehen" }).click();
    await d.getByRole("group", { name: "Fassung 2 zurückziehen" }).waitFor();
    assert.equal(await aktiv(), "Abbrechen");
    await page.keyboard.press("Enter");
    await d.getByRole("group", { name: "Fassung 2 zurückziehen" }).waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement && document.activeElement.getAttribute("data-dn-zurueck") === "v2");
    await page.keyboard.press("Enter");
    await d.getByRole("button", { name: "Ja, zurückziehen" }).click();
    await d.getByText("Fassung 2 zurückgezogen. Es gilt jetzt: Eigener Lieferschein LS-4711.").waitFor();
    await page.waitForFunction(() => document.activeElement && document.activeElement.getAttribute("role") === "status",
      null, { timeout: 5000 });
    assert.match(await d.locator(".dn-verlauf-eintrag", { hasText: "Fassung 2" }).innerText(), /Zurückgezogen am/);
    assert.match(await d.locator(".dn-verlauf-eintrag", { hasText: "Fassung 1" }).innerText(), /Gilt/);
    await page.keyboard.press("Escape");
    await d.waitFor({ state: "detached" });
    await page.waitForFunction(() => /LS-4711(?!-B)/.test(document.querySelector(".inv-list-table--lieferscheine tbody tr:nth-child(2)")?.innerText || ""));
  } finally {
    await page.close();
  }
});

test("5 — Briefpapier-Vorlage: hochladen, Abstände prüfen und speichern, verwenden", async () => {
  const sz = neuesSzenario();
  const page = await lieferscheinseite(sz);
  try {
    await page.getByRole("tab", { name: "Briefpapier-Vorlage" }).click();
    await page.getByText("Keine Vorlage eingerichtet").waitFor();
    assert.match(await page.getByRole("tabpanel").innerText(), /Neue Sendungen mit Artikeln erhalten ihren Lieferschein automatisch/);
    // Sichtbar ist der Knopf (Systemmuster wie Artikelimport); das native Feld bleibt unsichtbar.
    const auswahl = page.getByRole("button", { name: "PDF-Datei mit Ihrem Briefpapier Datei auswählen" });
    await auswahl.waitFor();
    await page.getByRole("tabpanel").locator("input[type=file]").setInputFiles({ name: "briefpapier.pdf", mimeType: "application/pdf", buffer: PDF });
    await page.getByRole("button", { name: "PDF-Datei mit Ihrem Briefpapier Andere Datei auswählen" }).waitFor();
    assert.match(await page.getByRole("tabpanel").innerText(), /briefpapier\.pdf/);
    await page.getByRole("button", { name: "Briefpapier hochladen" }).click();
    await page.getByText("Ihr Briefpapier ist als Entwurf gespeichert.", { exact: false }).waitFor();
    const oben = page.getByLabel("Abstand oben auf der ersten Seite");
    await oben.fill("9");
    await page.getByRole("button", { name: "Abstände speichern" }).click();
    await page.getByText("Bitte 15 bis 140 mm angeben.").waitFor();
    assert.equal(sz.vorlageBodies.filter((b) => b.art === "areas").length, 0, "ungültige Abstände gehen nicht hinaus");
    assert.equal(await page.getByRole("button", { name: "Diese Vorlage verwenden" }).isDisabled(), true, "erst speichern, dann verwenden");
    await oben.fill("50");
    await page.getByRole("button", { name: "Abstände speichern" }).click();
    await page.getByText("Die Abstände sind gespeichert.").waitFor();
    assert.deepEqual(sz.vorlageBodies.find((b) => b.art === "areas").body, { topFirstMm: 50, topNextMm: 30, bottomMm: 25 });
    await page.getByRole("button", { name: "Diese Vorlage verwenden" }).click();
    await page.getByText("Die Vorlage gilt jetzt für neue Lieferscheine.").waitFor();
    await page.getByRole("heading", { name: "Aktive Vorlage" }).waitFor();
    // Der benutzte Knopf ist mit dem Entwurf verschwunden — der Fokus steht auf dem Titel, nicht auf der Seite.
    await page.waitForFunction(() => document.activeElement && document.activeElement.textContent === "Ihr Briefpapier als Vorlage",
      null, { timeout: 5000 });
    // Zahl und Einheit stehen mit geschütztem Leerzeichen zusammen (\s trifft auch U+00A0).
    assert.match(await page.getByRole("tabpanel").innerText(), /oben 50\smm, auf Folgeseiten 30\smm, unten 25\smm/);
  } finally {
    await page.close();
  }
});

test("6 — Tastatur: Reiter, Zeilenmenü mit Fokus auf dem ersten Eintrag, Escape zurück zum Auslöser", async () => {
  const sz = neuesSzenario();
  const page = await lieferscheinseite(sz);
  try {
    const ausloeser = zeile(page, "CE-AB26-00301").getByRole("button", { name: "Weitere Aktionen" });
    await ausloeser.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menu").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("role")), "menuitem");
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-label")), "Weitere Aktionen");
    // Reiter: mit Tab erreichbar, mit Enter gewechselt — und zurück.
    await page.getByRole("tab", { name: "Übersicht" }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.textContent), "Briefpapier-Vorlage");
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Ihr Briefpapier als Vorlage" }).waitFor();
    assert.equal(await page.getByRole("tab", { name: "Briefpapier-Vorlage" }).getAttribute("aria-selected"), "true");
    await page.getByRole("tab", { name: "Übersicht" }).focus();
    await page.keyboard.press("Enter");
    await zeile(page, "CE-AB26-00301").waitFor();
  } finally {
    await page.close();
  }
});

for (const breite of [390, 360]) {
  test(`7 — ${breite} px: Einträge statt Tabelle, alle Aktionen erreichbar, nichts läuft quer`, async () => {
    const sz = neuesSzenario();
    const page = await lieferscheinseite(sz, { width: breite, height: 844 });
    try {
      const karten = page.locator(".inv-list-cards--lieferscheine");
      assert.equal(await karten.isVisible(), true);
      assert.equal(await tabelle(page).isVisible(), false);
      assert.equal(await karten.locator("li").count(), 4);
      const quer = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      assert.ok(quer <= 0, `waagerechter Überlauf ${quer} px`);
      const karte = karten.locator("li", { hasText: "CE-AB26-00302" });
      await karte.getByRole("button", { name: "Weitere Aktionen" }).click();
      const m = page.getByRole("menu");
      await m.waitFor();
      const r = await m.boundingBox();
      assert.ok(r.x >= 0 && r.x + r.width <= breite, "das Menü bleibt im Bild");
      await page.keyboard.press("Escape");
      await karten.locator("li", { hasText: "CE-AB26-00304" }).getByRole("button", { name: "Hochladen" }).click();
      const d = page.getByRole("dialog", { name: "Eigenen Lieferschein hochladen" });
      await d.waitFor();
      const box = await d.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= breite + 0.5, "der Dialog passt in die Breite");
    } finally {
      await page.close();
    }
  });
}

test("8 — Demo: Beispielzustände ohne API-Zugriff; Hochladen meldet „In der Demo nicht verfügbar.“", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const fehler = [];
  let apiAufrufe = 0;
  page.on("pageerror", (e) => fehler.push(e.message));
  await page.route("**/api.confidaraexpress.de/**", (route) => { apiAufrufe++; return route.abort(); });
  try {
    await page.goto(`${BASE}/demo/dashboard?page=deliverynotes`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Lieferscheine", level: 1 }).waitFor();
    const t = tabelle(page);
    await t.locator("tbody tr").first().waitFor();
    const text = await t.innerText();
    for (const art of ["ConfidaraExpress", "PDF hochgeladen", "Aus eigener Vorlage", "Kein Lieferschein"]) assert.ok(text.includes(art), art);
    await t.locator("tbody tr", { hasText: "Kein Lieferschein" }).first().getByRole("button", { name: "Hochladen" }).click();
    const d = page.getByRole("dialog", { name: "Eigenen Lieferschein hochladen" });
    await d.locator("input[type=file]").setInputFiles({ name: "lieferschein.pdf", mimeType: "application/pdf", buffer: PDF });
    await d.getByRole("button", { name: "Hochladen und verwenden" }).click();
    await d.getByText("In der Demo nicht verfügbar.").waitFor();
    assert.equal(apiAufrufe, 0, "die Demo fragt nie die echte API");
    assert.deepEqual(fehler, []);
  } finally {
    await ctx.close();
  }
});
