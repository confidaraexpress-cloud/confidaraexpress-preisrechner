// E2E: Proforma-Rechnung auf dem Buchungs-Erfolgsscreen — echter Dev-Server.
//
// Geprüft wird, was eine Quelltextprüfung nicht erreichen kann: was der Kunde
// nach einer erfolgreichen Buchung tatsächlich sieht, WELCHEN Pfad ein Klick
// anspricht, ob das kurze Nachladen den Zustandswechsel wirklich mitbekommt —
// und vor allem, dass ein Ausfall der Dokument-API den Erfolgsscreen
// unangetastet lässt.
//
// Es wird NIEMALS eine echte Bestellung ausgelöst: /api/jumingo/book ist wie in
// allen Buchungssuiten gemockt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

// ── Launch-Modus: die positiven Zollfälle sind im Browser nicht erreichbar ───────────────────
// `CUSTOMS_UI_ENABLED` (src/config/launchMode.mjs) steht auf `false` und wird beim Build in das
// Bundle kompiliert — anders als beim Backend, wo `tests/helpers/customsV2Scope.js` den Zustand
// im Prozess herstellen kann, gibt es hier keinen Weg, die Zolloberfläche im Browser zu öffnen.
// Die betroffenen Fälle überspringen sich deshalb AUSDRÜCKLICH und mit Grund, statt rot zu
// stehen oder still zu verschwinden.
//
// Was weiterläuft: die NEGATIVEN Fälle. Sie sind in beiden Konfigurationen gültig und decken
// genau das ab, was der Launch behauptet. Die Logik selbst bleibt vollständig geprüft — durch
// `src/utils/eoriUx.test.mjs` und `src/utils/proformaSuccessDownload.test.mjs`.
//
// Wieder aktiv, sobald CUSTOMS_UI_ENABLED auf `true` steht (Customs V2). Kein Test wurde
// gelöscht, keine Zusage abgeschwächt.
import { CUSTOMS_UI_ENABLED } from "../../src/config/launchMode.mjs";
const ZOLL_UI_AUS = CUSTOMS_UI_ENABLED
  ? false
  : "Zolloberfläche im Launch-Modus abgeschaltet (CUSTOMS_UI_ENABLED=false)";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5353, BASE = `http://127.0.0.1:${PORT}`;
const CE_SHIPMENT_ID = 4711;
const PROFORMA_PFAD = `/api/shipments/${CE_SHIPMENT_ID}/proforma`;
const PDF = Buffer.from("%PDF-1.4\n% Testbeleg\n%%EOF\n", "utf8");

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const TARIFF = {
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dhl", publicCarrierName: "DHL Express",
  publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
  netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19, transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-08-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-08-08T00:00:00Z",
};

const proformaZeile = (status, extra = {}) => ({
  type: "PROFORMA", category: "CUSTOMS", status,
  label: "Proforma-Rechnung", number: "PF-2026-000042",
  ...(status === "ready" ? { downloadPath: PROFORMA_PFAD } : {}),
  ...extra,
});

let server, browser;

/**
 * `dokumente` ist eine Funktion (aufrufNr) → { status, body } und steuert damit
 * jeden einzelnen Abruf der Dokumentliste. `pdfKopfzeilen` steuert die Antwort
 * des Downloads. Alles andere ist der übliche Mock der Buchungssuiten.
 */
async function setupRoutes(page, { dokumente, pdfKopfzeilen = {}, protokoll } = {}) {
  let dokumentAufrufe = 0;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p === PROFORMA_PFAD) {
      if (protokoll) protokoll.push(p);
      return route.fulfill({
        status: 200,
        headers: { "content-type": "application/pdf", ...pdfKopfzeilen },
        body: PDF,
      });
    }
    if (/^\/api\/shipments\/\d+\/documents$/.test(p)) {
      if (protokoll) protokoll.push(p);
      const antwort = dokumente ? dokumente(dokumentAufrufe++) : { status: 200, body: { shipmentId: CE_SHIPMENT_ID, documents: [] } };
      return json(antwort.body ?? {}, antwort.status ?? 200);
    }

    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    // Legal-Buchungsschranke: `enabled:false` ist der heutige Produktivzustand.
    // Ohne diese Antwort liefe der Mock in den Sammelfall `200 {}`, den
    // `parseBookingContext` fail-closed als Fehler wertet — die Bestellung wäre
    // gesperrt. Das ist richtiges Produktverhalten (siehe legalBookingGate).
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", ceShipmentId: CE_SHIPMENT_ID, tariffs: [TARIFF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    if (p.includes("/api/jumingo/book")) return json({
      shipmentId: "s1", ceShipmentId: CE_SHIPMENT_ID, trackingNumber: "TRACK1", labelUrl: null,
      invoiceNumber: "CE-RE-2026-000001",
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

// Bewusst eine INLANDSBUCHUNG (DE → DE, `customsRequired: false`): erscheint die
// Proforma trotzdem, sobald die Dokument-API sie meldet, ist bewiesen, dass die
// Oberfläche sie NICHT aus Zielland oder Zollpflicht ableitet.
async function bucheBisErfolg(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
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

/* ══════════ 1 — fertiger Beleg: Knopf, Serverpfad, Download ══════════ */

test("1 — `ready` zeigt den Knopf und lädt über den SERVERPFAD", { skip: ZOLL_UI_AUS }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const protokoll = [];
  await setupRoutes(page, { protokoll, dokumente: () => ({ body: { shipmentId: CE_SHIPMENT_ID, documents: [proformaZeile("ready")] } }) });
  await bucheBisErfolg(page);

  const knopf = page.getByRole("button", { name: /Proforma-Rechnung .* herunterladen/ });
  await knopf.waitFor({ timeout: 15000 });
  // Die servergelieferte Nummer steht in der Beschriftung — sie wird nicht erfunden.
  assert.match(await knopf.innerText(), /PF-2026-000042/);

  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), knopf.click()]);
  // Angesprochen wurde exakt der Pfad aus der Dokumentliste.
  assert.ok(protokoll.includes(PROFORMA_PFAD), `Downloadpfad nicht angesprochen: ${protokoll.join(", ")}`);
  // Ohne freigegebenen Content-Disposition-Header (heutige Produktivlage: die
  // CORS-Konfiguration setzt kein `exposedHeaders`) greift der neutrale
  // Rückfallname — KEIN im Client erfundener Belegname.
  assert.equal(download.suggestedFilename(), "proforma-rechnung.pdf");
  // Die Erfolgsmeldung steht unverändert.
  assert.match(await page.locator(".booking-success-title").innerText(), /erfolgreich gebucht/);
  await page.close();
});

test("2 — ist der Header freigegeben, gewinnt der SERVERDATEINAME", { skip: ZOLL_UI_AUS }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await setupRoutes(page, {
    dokumente: () => ({ body: { shipmentId: CE_SHIPMENT_ID, documents: [proformaZeile("ready")] } }),
    pdfKopfzeilen: {
      "content-disposition": 'attachment; filename="Proforma-PF-2026-000042.pdf"',
      "access-control-expose-headers": "Content-Disposition",
    },
  });
  await bucheBisErfolg(page);
  const knopf = page.getByRole("button", { name: /Proforma-Rechnung .* herunterladen/ });
  await knopf.waitFor({ timeout: 15000 });
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), knopf.click()]);
  assert.equal(download.suggestedFilename(), "Proforma-PF-2026-000042.pdf");
  await page.close();
});

/* ══════════ 2 — der Beleg entsteht noch ══════════ */

test("3 — `processing` zeigt einen ruhigen Hinweis und wird beim Fertigwerden abgelöst", { skip: ZOLL_UI_AUS }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  // Erster Abruf: noch in Arbeit. Ab dem zweiten: fertig.
  await setupRoutes(page, {
    dokumente: (n) => ({ body: { shipmentId: CE_SHIPMENT_ID, documents: [proformaZeile(n === 0 ? "processing" : "ready")] } }),
  });
  await bucheBisErfolg(page);

  await page.waitForSelector("text=Proforma-Rechnung wird erstellt", { timeout: 15000 });
  // Im Wartezustand gibt es KEINEN Downloadknopf — nichts zum Klicken, das es
  // noch nicht gibt.
  assert.equal(await page.getByRole("button", { name: /Proforma-Rechnung .* herunterladen/ }).count(), 0);
  // Das kurze Nachladen bekommt den Zustandswechsel mit (Takt 2 s).
  await page.getByRole("button", { name: /Proforma-Rechnung .* herunterladen/ }).waitFor({ timeout: 15000 });
  assert.equal(await page.locator("text=Proforma-Rechnung wird erstellt").count(), 0, "der Hinweis weicht dem Knopf");
  await page.close();
});

/* ══════════ 3 — die Buchung bleibt erfolgreich ══════════ */

test("4 — `failed` ist neutral, ohne Rot, ohne Wiederholen — und ohne Zweifel an der Buchung", { skip: ZOLL_UI_AUS }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { dokumente: () => ({ body: { shipmentId: CE_SHIPMENT_ID, documents: [proformaZeile("failed")] } }) });
  await bucheBisErfolg(page);

  const hinweis = page.locator("text=Proforma-Rechnung ist derzeit nicht verfügbar");
  await hinweis.waitFor({ timeout: 15000 });
  const text = await page.locator(".booking-success-wrap").innerText();
  assert.match(text, /Ihre Buchung ist davon nicht betroffen/);
  assert.match(await page.locator(".booking-success-title").innerText(), /erfolgreich gebucht/);
  // Kein roter Streifen, kein Wiederholen, kein Fehlercode, kein Codepunkt.
  assert.equal(await page.locator(".booking-success-wrap .alert-error").count(), 0, "keine Fehlerfläche");
  assert.equal(await page.getByRole("button", { name: /Proforma/ }).count(), 0, "kein Knopf im Fehlerfall");
  assert.ok(!/PROFORMA_|U\+[0-9A-F]/.test(text), "kein Interna im sichtbaren Text");
  // Die übrigen Erfolgsaktionen sind unberührt.
  await page.getByRole("button", { name: "Label herunterladen" }).waitFor({ timeout: 5000 });
  await page.close();
});

test("5 — fällt die Dokument-API aus, bleibt der Erfolgsscreen exakt wie zuvor", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { dokumente: () => ({ status: 500, body: { error: "Fehler" } }) });
  await bucheBisErfolg(page);
  await page.waitForTimeout(3000); // zwei Takte des Nachladens abwarten

  const text = await page.locator(".booking-success-wrap").innerText();
  assert.match(text, /erfolgreich gebucht/);
  assert.ok(!/Proforma/i.test(text), "ohne verwertbare Antwort wird nichts behauptet");
  assert.equal(await page.locator(".booking-success-wrap .alert-error").count(), 0, "kein Fehlerbanner");
  await page.getByRole("button", { name: "Label herunterladen" }).waitFor({ timeout: 5000 });
  await page.close();
});

test("6 — ohne Proformazeile bleibt der Bildschirm unverändert, und es wird nicht weiter gefragt", { skip: ZOLL_UI_AUS }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const protokoll = [];
  await setupRoutes(page, {
    protokoll,
    dokumente: () => ({ body: { shipmentId: CE_SHIPMENT_ID, documents: [{ type: "LABEL", category: "SHIPPING", status: "ready", label: "Versandlabel" }] } }),
  });
  await bucheBisErfolg(page);
  await page.waitForTimeout(5000); // deutlich mehr als zwei Takte

  const text = await page.locator(".booking-success-wrap").innerText();
  assert.ok(!/Proforma/i.test(text), "keine Proforma → keine Zeile, kein Hinweis");
  // Genau EIN Abruf: „keine Proforma" ist ein Endzustand, kein Wartezustand.
  const abrufe = protokoll.filter((p) => p.endsWith("/documents")).length;
  assert.equal(abrufe, 1, `es darf nicht weiter gefragt werden (Abrufe: ${abrufe})`);
  await page.close();
});
