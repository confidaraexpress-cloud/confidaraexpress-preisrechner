// E2E: Dokumente-Drawer der Sendungsliste — echter Dev-Server.
//
// Geprüft wird, was eine Quelltextprüfung nicht erreicht: was der Kunde in der
// Liste sieht, WANN die Dokumentliste abgerufen wird (und wann eben nicht),
// welcher Pfad ein Klick tatsächlich anspricht, und ob das kurze Nachladen den
// Zustandswechsel mitbekommt.
//
// Alle Netzaufrufe sind gemockt. Es wird NIEMALS eine Buchung ausgelöst.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5354, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 4711;
const PDF = Buffer.from("%PDF-1.4\n% Testbeleg\n%%EOF\n", "utf8");

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

// Eine gebuchte, stornierbare Sendung — damit Tracking UND Storno sichtbar sind.
const SHIPMENT = {
  id: CE_ID, status: "booked", weight: 5, price_final: 22.19, selected_carrier: "dhl",
  created_at: "2026-08-01T00:00:00Z", order_number: "ORD-1",
  business_order_number: "CE-BS-2026-0042", order_confirmation_number: "CE-AB-2026-000001",
  tracking_number: "TRK-1", cancellation_status: null,
};

const DOK = (type, category, status, extra = {}) => ({
  type, category, status,
  label: { LABEL: "Versandlabel", DELIVERY_NOTE: "Lieferschein",
           PROFORMA: "Proforma-Rechnung", ORDER_CONFIRMATION: "Auftragsbestätigung" }[type],
  ...(status === "ready" ? { downloadPath: `/api/shipments/${CE_ID}/${{ LABEL: "label", DELIVERY_NOTE: "delivery-note", PROFORMA: "proforma", ORDER_CONFIRMATION: "order-confirmation" }[type]}` } : {}),
  ...extra,
});

const VIER = [
  DOK("LABEL", "SHIPPING", "ready"),
  DOK("DELIVERY_NOTE", "SHIPPING", "ready"),
  DOK("PROFORMA", "CUSTOMS", "ready", { number: "PF-2026-000042" }),
  DOK("ORDER_CONFIRMATION", "ORDER", "ready", { number: "CE-AB-2026-000001" }),
];

let server, browser;

async function setupRoutes(page, { dokumente, protokoll } = {}) {
  let aufrufe = 0;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (protokoll) protokoll.push(p);

    if (/^\/api\/shipments\/\d+\/documents$/.test(p)) {
      const antwort = dokumente ? dokumente(aufrufe++) : { body: { shipmentId: CE_ID, documents: [] } };
      return json(antwort.body ?? {}, antwort.status ?? 200);
    }
    // Jede PDF-Route liefert dasselbe Testdokument — geprüft wird, WELCHER Pfad
    // angesprochen wurde, nicht der Inhalt.
    if (/^\/api\/shipments\/\d+\/(label|delivery-note|order-confirmation|proforma)$/.test(p)) {
      return route.fulfill({ status: 200, headers: { "content-type": "application/pdf" }, body: PDF });
    }

    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [SHIPMENT], nextCursor: null });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function zurSendungsliste(page) {
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table tbody tr", { timeout: 20000 });
}
const dokumenteKnopf = (page) => page.getByRole("button", { name: "Dokumente" }).first();

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
    // seinerseits node startet. Ein Signal an npx ließe den Enkel auf dem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

/* ══════════ Smoke A — vier Dokumente, drei Gruppen, ein Download ══════════ */

test("A — Dokumente öffnen: drei Gruppen, Proforma ladbar, Serverpfad angesprochen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const protokoll = [];
  await setupRoutes(page, { protokoll, dokumente: () => ({ body: { shipmentId: CE_ID, documents: VIER } }) });
  await zurSendungsliste(page);

  await dokumenteKnopf(page).click();
  // Auf die GELADENE Liste warten, nicht auf die Drawerhülle: `.sdoc-drawer` steht
  // unbedingt im Markup, während der Rumpf noch das Skeleton zeigt. Lokal löst der
  // Abruf im selben Tick auf, auf einem ausgelasteten Runner nicht — dort las die
  // Gruppenzusage eine leere Liste und wurde rot. Gemessen: mit 600 ms Verzögerung
  // im Dokumentenabruf fällt die alte Wartestelle reproduzierbar aus, diese nicht.
  // Der Test weiter unten benutzt bereits dieselbe Stelle.
  await page.waitForSelector(".sdoc-group-title", { timeout: 15000 });

  // Der Abruf gilt GENAU dieser Sendung.
  assert.ok(protokoll.includes(`/api/shipments/${CE_ID}/documents`), `Abrufe: ${protokoll.join(", ")}`);

  // Drei Gruppen in stabiler Reihenfolge.
  // `allTextContents` statt `allInnerTexts`: die Überschriften tragen wie jede
  // Drawer-Sektion `text-transform: uppercase` — geprüft wird das Modell, nicht
  // die Schreibweise der Musterebene.
  assert.deepEqual(await page.locator(".sdoc-group-title").allTextContents(), ["Versand", "Zoll", "Geschäftsdokumente"]);
  assert.deepEqual(await page.locator(".sdoc-row-name").allTextContents(),
    ["Versandlabel", "Lieferschein", "Proforma-Rechnung", "Auftragsbestätigung"]);
  // Die servergelieferte Belegnummer steht unter dem Namen.
  const nummern = await page.locator(".sdoc-row-number").allTextContents();
  assert.deepEqual(nummern, ["PF-2026-000042", "CE-AB-2026-000001"]);

  // Vier ladbare Dokumente = vier Downloadaktionen.
  assert.equal(await page.getByRole("button", { name: /Herunterladen/ }).count(), 4);

  // Der Klick spricht EXAKT den servergelieferten Pfad an.
  const proformaZeile = page.locator(".sdoc-row", { hasText: "Proforma-Rechnung" });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    proformaZeile.getByRole("button", { name: /Herunterladen/ }).click(),
  ]);
  assert.ok(protokoll.includes(`/api/shipments/${CE_ID}/proforma`), "der Serverpfad wurde nicht angesprochen");
  // Ohne freigegebene Content-Disposition greift der neutrale Rückfallname je Typ.
  assert.equal(download.suggestedFilename(), "proforma-rechnung.pdf");
  await page.close();
});

/* ══════════ Smoke B — processing wird abgelöst ══════════ */

test("B — der Wartezustand weicht dem Downloadknopf, sobald der Server fertig meldet", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, {
    dokumente: (n) => ({ body: { shipmentId: CE_ID, documents: [
      DOK("LABEL", "SHIPPING", "ready"),
      n === 0 ? DOK("PROFORMA", "CUSTOMS", "processing", { number: "PF-2026-000042" })
              : DOK("PROFORMA", "CUSTOMS", "ready", { number: "PF-2026-000042" }),
    ] } }),
  });
  await zurSendungsliste(page);
  await dokumenteKnopf(page).click();

  await page.waitForSelector("text=Wird erstellt", { timeout: 15000 });
  const proformaZeile = page.locator(".sdoc-row", { hasText: "Proforma-Rechnung" });
  assert.equal(await proformaZeile.getByRole("button", { name: /Herunterladen/ }).count(), 0,
    "im Wartezustand gibt es nichts zu klicken");

  // Das kurze Nachladen bekommt den Zustandswechsel mit (Takt 2 s).
  await proformaZeile.getByRole("button", { name: /Herunterladen/ }).waitFor({ timeout: 15000 });
  assert.equal(await page.locator("text=Wird erstellt").count(), 0, "der Hinweis weicht dem Knopf");
  await page.close();
});

/* ══════════ Smoke C — Tracking und Stornierung bleiben ══════════ */

test("C — Tracking und Stornierung bleiben eigenständige Aktionen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { dokumente: () => ({ body: { shipmentId: CE_ID, documents: VIER } }) });
  await zurSendungsliste(page);

  const zeile = page.locator("table tbody tr").first();
  await zeile.getByRole("button", { name: "Sendung verfolgen" }).waitFor({ timeout: 10000 });
  await zeile.getByRole("button", { name: "Stornieren" }).waitFor({ timeout: 10000 });
  await zeile.getByRole("button", { name: "Dokumente" }).waitFor({ timeout: 10000 });
  // Die beiden früheren Einzelaktionen sind aus der Liste verschwunden.
  assert.equal(await zeile.getByRole("button", { name: "Label" }).count(), 0);
  assert.equal(await zeile.getByRole("button", { name: "Auftragsbestätigung" }).count(), 0);
  await page.close();
});

/* ══════════ Smoke D — kein Vorabfetch ══════════ */

test("D — beim Laden der Liste wird KEINE Dokumentliste geholt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const protokoll = [];
  await setupRoutes(page, { protokoll, dokumente: () => ({ body: { shipmentId: CE_ID, documents: VIER } }) });
  await zurSendungsliste(page);
  await page.waitForTimeout(1500);

  assert.equal(protokoll.filter((p) => p.endsWith("/documents")).length, 0,
    `die Liste hat vorab geladen: ${protokoll.join(", ")}`);
  // Erst der Klick löst genau EINEN Abruf aus.
  await dokumenteKnopf(page).click();
  await page.waitForSelector(".sdoc-drawer", { timeout: 15000 });
  await page.waitForTimeout(1000);
  assert.equal(protokoll.filter((p) => p.endsWith("/documents")).length, 1,
    `Abrufe nach dem Klick: ${protokoll.filter((p) => p.endsWith("/documents")).length}`);
  await page.close();
});

/* ══════════ Smoke E — leere Liste und Ladefehler ══════════ */

test("E — leere Dokumentliste zeigt einen ruhigen Zustand, kein Fehler", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { dokumente: () => ({ body: { shipmentId: CE_ID, documents: [] } }) });
  await zurSendungsliste(page);
  await dokumenteKnopf(page).click();

  await page.waitForSelector("text=Für diese Sendung sind derzeit keine Dokumente verfügbar", { timeout: 15000 });
  assert.equal(await page.locator(".sdoc-drawer .alert-error").count(), 0, "eine leere Liste ist kein Fehler");
  assert.equal(await page.locator(".sdoc-group-title").count(), 0, "leere Gruppen erscheinen");
  await page.close();
});

test("F — ein Ladefehler lässt den Drawer offen und bietet erneutes Laden", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let n = 0;
  await setupRoutes(page, {
    dokumente: () => (n++ === 0
      ? { status: 500, body: { error: "Fehler" } }
      : { body: { shipmentId: CE_ID, documents: VIER } }),
  });
  await zurSendungsliste(page);
  await dokumenteKnopf(page).click();

  await page.waitForSelector("text=Dokumente konnten derzeit nicht geladen werden", { timeout: 15000 });
  assert.equal(await page.locator(".sdoc-drawer").count(), 1, "der Drawer hat sich geschlossen");
  // Die Sendungsliste dahinter ist unbeschädigt.
  assert.ok(await page.locator("table tbody tr").count() > 0, "die Sendungsdaten sind verloren");
  // „Erneut versuchen" lädt dieselbe Sendung neu — es ist ein reiner GET.
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await page.waitForSelector(".sdoc-group-title", { timeout: 15000 });
  // `allTextContents` statt `allInnerTexts`: die Überschriften tragen wie jede
  // Drawer-Sektion `text-transform: uppercase` — geprüft wird das Modell, nicht
  // die Schreibweise der Musterebene.
  assert.deepEqual(await page.locator(".sdoc-group-title").allTextContents(), ["Versand", "Zoll", "Geschäftsdokumente"]);
  await page.close();
});

/* ══════════ Smoke G — ein fremder Pfad wird nie aufgerufen ══════════ */

test("G — ein fremder downloadPath erzeugt keine Aktion und keinen Abruf", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const protokoll = [];
  await setupRoutes(page, {
    protokoll,
    dokumente: () => ({ body: { shipmentId: CE_ID, documents: [
      { type: "PROFORMA", category: "CUSTOMS", status: "ready", label: "Proforma-Rechnung",
        downloadPath: "https://evil.example/a.pdf" },
    ] } }),
  });
  let fremd = 0;
  await page.route("**evil.example/**", async (route) => { fremd += 1; await route.abort(); });

  await zurSendungsliste(page);
  await dokumenteKnopf(page).click();
  await page.waitForSelector(".sdoc-row", { timeout: 15000 });
  await page.waitForTimeout(800);

  // Ein „ready" mit fremdem Pfad ist nichts zum Klicken — und der Host wird nie
  // berührt (apiFetch hängt den Bearer-Token auch an absolute URLs).
  assert.equal(await page.getByRole("button", { name: /Herunterladen/ }).count(), 0,
    "ein fremder Pfad wurde als Downloadaktion angeboten");
  assert.equal(fremd, 0, "der fremde Host wurde angesprochen");
  await page.close();
});

/* ══════════ Smoke H — schmaler Viewport ══════════ */

test("H — auf 390 px läuft nichts aus dem Bild, auch mit langer Belegnummer", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  await setupRoutes(page, {
    dokumente: () => ({ body: { shipmentId: CE_ID, documents: [
      DOK("LABEL", "SHIPPING", "ready"),
      DOK("PROFORMA", "CUSTOMS", "ready", { number: "PF-2026-000042-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }),
    ] } }),
  });
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  // Unter 768 px zeigt die Liste Karten statt der Tabelle — dieselbe Aktion.
  await page.waitForSelector(".ce-list-card", { timeout: 20000 });
  await dokumenteKnopf(page).click();
  await page.waitForSelector(".sdoc-drawer", { timeout: 15000 });
  // Gemessen wird erst, wenn die ZEILEN da sind: der Drawer-Rahmen erscheint vor
  // der geladenen Dokumentliste, und auf einem langsamen Runner war `.sdoc-row`
  // beim evaluate noch null (CI-Lauf 33269152931, Job E2E 4/4 — lokal grün).
  // Der tiefste gemessene Knoten ist die Wartebedingung; die Messung selbst
  // bleibt unverändert.
  await page.waitForSelector(".sdoc-row-action .btn", { timeout: 15000 });

  // Der Drawer nimmt die volle Breite und erzeugt keine Querleiste.
  const messung = await page.evaluate(() => {
    const d = document.querySelector(".sdoc-drawer");
    const zeile = document.querySelector(".sdoc-row");
    const knopf = document.querySelector(".sdoc-row-action .btn");
    return {
      drawerBreite: d.getBoundingClientRect().width,
      fensterBreite: window.innerWidth,
      querUeberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      zeileRechts: zeile.getBoundingClientRect().right,
      knopfRechts: knopf.getBoundingClientRect().right,
    };
  });
  assert.ok(messung.drawerBreite <= messung.fensterBreite,
    `Drawer ${messung.drawerBreite} px auf ${messung.fensterBreite} px`);
  assert.ok(messung.querUeberlauf <= 0, `horizontaler Überlauf: ${messung.querUeberlauf} px`);
  assert.ok(messung.knopfRechts <= messung.zeileRechts + 1,
    "die lange Belegnummer schiebt den Knopf aus der Zeile");
  await page.close();
});
