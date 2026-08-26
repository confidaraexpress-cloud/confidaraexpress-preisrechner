// E2E: der Wiederherstellungszweig der Stornierungsanfrage — echter Dev-Server.
//
// Der Fall: der Kunde stößt eine Stornierung an, und der Server meldet, dass sich
// der Zustand inzwischen geändert hat (409 — es gibt bereits eine Anfrage). Die
// Oberfläche schließt den Dialog, zeigt einen Hinweis und gleicht die Liste ab.
//
// Genau dieser Zweig übergab dem Abgleich eine Variable, die es nicht gibt
// (`jid`, ein Restname aus der Zeit der Providerreferenz). In einem ES-Modul ist
// das ein ReferenceError: er entstand INNERHALB des try, wurde vom äußeren catch
// gefangen — und der Abgleich fand nie statt. Ein Quelltexttest kann das
// erkennen; dass die Oberfläche danach WIRKLICH weiterarbeitet, zeigt nur der
// Browser.
//
// Alle Netzaufrufe sind gemockt. Es wird NIEMALS eine echte Stornierung gesendet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5355, BASE = `http://127.0.0.1:${PORT}`;
const CE_ID = 4711;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};
// Stornierbar: gebucht, ohne bestehende Anfrage, mit CE-Handle.
const SHIPMENT = {
  id: CE_ID, status: "booked", weight: 5, price_final: 22.19, selected_carrier: "dhl",
  created_at: "2026-08-01T00:00:00Z", order_number: "ORD-1",
  order_confirmation_number: "CE-AB-2026-000001", tracking_number: "TRK-1",
  cancellation_status: null,
};

let server, browser;

/**
 * `stornoAntwort` steuert die Antwort auf den Stornorequest. Die Sendungsliste
 * liefert IMMER dieselbe Zeile OHNE cancellation_status — damit ist ein sichtbares
 * Statusbadge ausschließlich durch den lokalen Abgleich erklärbar und nicht durch
 * frische Serverdaten.
 */
async function setupRoutes(page, { stornoAntwort, protokoll } = {}) {
  let listenAufrufe = 0;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (protokoll) protokoll.push(`${route.request().method()} ${p}`);

    if (p.endsWith("/cancellation-request")) {
      const a = stornoAntwort ? stornoAntwort() : { body: {}, status: 200 };
      return json(a.body ?? {}, a.status ?? 200);
    }
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) {
      listenAufrufe += 1;
      // Erster Aufruf: die Sendung ohne Anfrage. Jeder weitere: mit — so wie der
      // Server nach einer registrierten Anfrage antwortet. Der zweite Aufruf ist
      // damit zugleich der Nachweis, DASS der Abgleich gelaufen ist: er entsteht
      // ausschließlich durch `onCancellationRequested` → `fetchData()`.
      const zeile = listenAufrufe === 1 ? SHIPMENT : { ...SHIPMENT, cancellation_status: "pending" };
      return json({ shipments: [zeile], nextCursor: null });
    }
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (/^\/api\/shipments\/\d+\/documents$/.test(p)) return json({ shipmentId: CE_ID, documents: [{
      type: "LABEL", category: "SHIPPING", status: "ready", label: "Versandlabel",
      downloadPath: `/api/shipments/${CE_ID}/label`,
    }] });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function stornoAbsenden(page) {
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table tbody tr", { timeout: 20000 });
  await page.getByRole("button", { name: "Stornieren" }).first().click();
  await page.waitForSelector(".stn-dialog-textarea", { timeout: 10000 });
  await page.locator(".stn-dialog-textarea").fill("Die Ware wird doch nicht mehr benötigt.");
  // Im DIALOG klicken, nicht in der Zeile dahinter: „Stornieren" heißt der
  // Auslöser der Liste, „Anfrage absenden" der Knopf des Dialogs.
  await page.locator(".stn-dialog-card").getByRole("button", { name: "Anfrage absenden" }).click();
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
    // seinerseits node startet. Ein Signal an npx ließe den Enkel auf dem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — geänderter Serverzustand: kein Laufzeitfehler, Abgleich läuft, Zeile wird markiert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e && e.message || e)));
  const protokoll = [];
  await setupRoutes(page, {
    protokoll,
    // Der Zustand hat sich geändert: es gibt bereits eine Anfrage.
    stornoAntwort: () => ({ status: 409, body: { error: "Bereits vorhanden", code: "CANCELLATION_REQUEST_ALREADY_EXISTS" } }),
  });
  await stornoAbsenden(page);

  // Der fachliche Hinweis erscheint, der Dialog schließt.
  await page.waitForSelector("text=Für diese Sendung wurde bereits eine Stornierungsanfrage gestellt", { timeout: 10000 });
  assert.equal(await page.locator(".stn-dialog-textarea").count(), 0, "der Dialog blieb offen");

  // DER KERN: kein ReferenceError. Vorher stand hier „jid is not defined".
  assert.deepEqual(fehler, [], `Laufzeitfehler: ${fehler.join(" | ")}`);

  // Der Abgleich lief: die Zeile trägt jetzt das Statusbadge.
  //
  // Gemessen wird bewusst das NACHLADEN, nicht die lokale Zwischenmarkierung:
  // `handleCancellationRequested` patcht die Zeile UND ruft sofort `fetchData()`,
  // das die Liste in den Ladezustand versetzt und danach vollständig ersetzt. Die
  // Zwischenmarkierung ist im Browser deshalb nicht stabil beobachtbar — der
  // zweite Listenabruf dagegen schon, und er ist der eigentliche Beweis: er
  // entsteht ausschließlich in `onCancellationRequested`. Vor dem Fix warf der
  // Aufruf, bevor er den Empfänger erreichte — es blieb bei EINEM Abruf, und die
  // Liste behielt ihren alten Zustand.
  await page.waitForSelector("text=Stornierung angefragt", { timeout: 10000 });

  // Genau EIN Stornorequest, mit dem CE-Sendungshandle adressiert.
  const stornos = protokoll.filter((e) => e.endsWith("/cancellation-request"));
  assert.equal(stornos.length, 1, `zweite Stornoanforderung: ${stornos.join(", ")}`);
  assert.equal(stornos[0], `POST /api/shipments/${CE_ID}/cancellation-request`, "falscher Pfad oder falsche ID");
  assert.ok(protokoll.filter((e) => e.endsWith("/kunde/shipments")).length >= 2,
    "die Liste wurde nach dem Abgleich nicht neu geladen");

  // Die Oberfläche bleibt bedienbar.
  await page.getByRole("button", { name: "Sendung verfolgen" }).first().waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Dokumente" }).first().waitFor({ timeout: 5000 });
  await page.close();
});

test("2 — die erfolgreiche Stornierung verhält sich unverändert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e && e.message || e)));
  await setupRoutes(page, {
    stornoAntwort: () => ({ status: 200, body: { cancellationRequest: { status: "pending", createdAt: "2026-08-26T10:00:00Z" } } }),
  });
  await stornoAbsenden(page);

  await page.waitForSelector("text=Ihre Stornierungsanfrage wird bearbeitet", { timeout: 10000 });
  await page.waitForSelector("text=Stornierung angefragt", { timeout: 10000 });
  assert.deepEqual(fehler, [], `Laufzeitfehler: ${fehler.join(" | ")}`);
  assert.equal(await page.locator(".stn-dialog-textarea").count(), 0, "der Dialog blieb offen");
  await page.close();
});

test("3 — der korrigierbare Fehlerfall lässt den Dialog offen (unverändert)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e && e.message || e)));
  await setupRoutes(page, {
    stornoAntwort: () => ({ status: 422, body: { error: "Grund zu kurz", code: "CANCELLATION_REASON_INVALID" } }),
  });
  await stornoAbsenden(page);

  // Dieser Zweig ruft den Abgleich gar nicht auf — er bleibt unberührt.
  await page.waitForSelector(".stn-dialog-alert, .stn-dialog-textarea", { timeout: 10000 });
  assert.equal(await page.locator(".stn-dialog-textarea").count(), 1, "der Dialog wurde geschlossen");
  assert.deepEqual(fehler, [], `Laufzeitfehler: ${fehler.join(" | ")}`);
  await page.close();
});
