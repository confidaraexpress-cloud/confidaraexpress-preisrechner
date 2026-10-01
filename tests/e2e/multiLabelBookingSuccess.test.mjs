// E2E: Versandbelege einer Mehrpaketsendung auf dem Buchungs-Erfolgsscreen (TG-F5) — echter Dev-Server.
//
// Geprüft wird, was eine Quelltextprüfung nicht erreicht: dass eine Buchungsantwort mit drei
// Etiketten und einem Abholetikett tatsächlich VIER Downloadknöpfe ergibt, dass jeder Klick
// genau seinen Serverpfad anspricht, dass eine Antwort ohne Belege beim bisherigen Labelknopf
// bleibt, dass ein unsicherer Pfad nie angesprochen wird — und dass auf 390 px nichts aus dem
// Bild läuft.
//
// Es wird NIEMALS eine echte Bestellung ausgelöst: /api/jumingo/book ist wie in allen
// Buchungssuiten gemockt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5358, BASE = `http://127.0.0.1:${PORT}`;
const CE_SHIPMENT_ID = 4711;
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

const BELEG = (type, ordinal, label, carrierReference) => ({
  type, category: "SHIPPING", status: "ready", label, ordinal, carrierReference,
  downloadPath: `/api/shipments/${CE_SHIPMENT_ID}/provider-documents/${type}/${ordinal}`,
});
// Bewusst unsortiert — die Reihenfolge der Knöpfe darf nicht an der Antwortreihenfolge hängen.
const MEHRPAKET = [
  BELEG("COLLECTION_LABEL", 0, "Abholetikett", "1Z999AA10000000004"),
  BELEG("LABEL", 1, "Versandlabel 2 von 3", "1Z999AA10000000002"),
  BELEG("LABEL", 0, "Versandlabel 1 von 3", "1Z999AA10000000001"),
  BELEG("LABEL", 2, "Versandlabel 3 von 3", "1Z999AA10000000003"),
];
const BELEG_KNOEPFE = /^(Versandlabel|Abholetikett).* herunterladen$/;

let server, browser;

async function setupRoutes(page, { buchung = {}, protokoll, tarif = TARIFF, koerper } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (protokoll) protokoll.push(p);

    if (/^\/api\/shipments\/\d+\/provider-documents\/[A-Z_]+\/\d+$/.test(p) || /^\/api\/shipments\/\d+\/label$/.test(p)) {
      return route.fulfill({ status: 200, headers: { "content-type": "application/pdf" }, body: PDF });
    }
    if (/^\/api\/shipments\/\d+\/documents$/.test(p)) return json({ shipmentId: CE_SHIPMENT_ID, documents: [] });

    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    // Legal-Buchungsschranke: `enabled:false` ist der heutige Produktivzustand (siehe
    // legalBookingGate) — ohne diese Antwort wäre die Bestellung fail-closed gesperrt.
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      ceShipmentId: CE_SHIPMENT_ID, tariffs: [tarif], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    if (p.includes("/api/jumingo/book")) {
      if (koerper) koerper.push(route.request().postData() || "");
      return json({
        message: "Sendung gebucht", ceShipmentId: CE_SHIPMENT_ID, trackingNumber: "TRACK1", labelUrl: null,
        invoiceNumber: "CE-RE-2026-000001", ...buchung,
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits node
    // startet. Ein Signal an npx ließe den Enkel auf dem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — Mehrpaketsendung: vier Knöpfe, jeder lädt seinen eigenen Beleg", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const protokoll = [];
  await setupRoutes(page, { protokoll, buchung: { shippingDocuments: MEHRPAKET } });
  await bucheBisErfolg(page);

  const wrap = page.locator(".booking-success-wrap");
  const knoepfe = wrap.getByRole("button", { name: BELEG_KNOEPFE });
  await knoepfe.first().waitFor({ timeout: 15000 });
  assert.deepEqual((await knoepfe.allTextContents()).map((t) => t.trim()), [
    "Versandlabel 1 von 3 herunterladen", "Versandlabel 2 von 3 herunterladen",
    "Versandlabel 3 von 3 herunterladen", "Abholetikett herunterladen",
  ]);
  // Kein zusätzlicher Einzelknopf, der nur das erste Etikett lädt.
  assert.equal(await wrap.getByRole("button", { name: "Label herunterladen" }).count(), 0);
  // Der Kunde erfährt, wo er die Belege dauerhaft findet.
  assert.match(await wrap.innerText(), /Meine Sendungen/);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    wrap.getByRole("button", { name: "Versandlabel 2 von 3 herunterladen" }).click(),
  ]);
  assert.ok(protokoll.includes(`/api/shipments/${CE_SHIPMENT_ID}/provider-documents/LABEL/1`),
    `Abrufe: ${protokoll.join(", ")}`);
  assert.equal(download.suggestedFilename(), "versandlabel-2.pdf");

  const [abhol] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    wrap.getByRole("button", { name: "Abholetikett herunterladen" }).click(),
  ]);
  assert.ok(protokoll.includes(`/api/shipments/${CE_SHIPMENT_ID}/provider-documents/COLLECTION_LABEL/0`));
  assert.equal(abhol.suggestedFilename(), "abholetikett-1.pdf");
  assert.ok(!protokoll.some((p) => /\/label$/.test(p)), "der Sammelpfad des ersten Etiketts wurde angesprochen");
  // Die Erfolgsmeldung steht unverändert, und nichts ist rot.
  assert.match(await page.locator(".booking-success-title").innerText(), /erfolgreich gebucht/);
  assert.equal(await wrap.locator(".alert-error").count(), 0);
  await page.close();
});

test("2 — ohne Versandbelege in der Antwort bleibt der bisherige Labelknopf", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const protokoll = [];
  await setupRoutes(page, { protokoll });
  await bucheBisErfolg(page);

  const wrap = page.locator(".booking-success-wrap");
  const knopf = wrap.getByRole("button", { name: "Label herunterladen" });
  await knopf.waitFor({ timeout: 15000 });
  assert.equal(await wrap.getByRole("button", { name: BELEG_KNOEPFE }).count(), 0);
  assert.ok(!/Meine Sendungen“ →/.test(await wrap.innerText()), "der Mehrbeleghinweis steht ohne Belege da");
  await Promise.all([page.waitForEvent("download", { timeout: 15000 }), knopf.click()]);
  assert.ok(protokoll.includes(`/api/shipments/${CE_SHIPMENT_ID}/label`), "der bisherige Labelweg wurde nicht genommen");
  await page.close();
});

test("3 — ein unsicherer Pfad wird nicht angeboten und nie angesprochen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { buchung: { shippingDocuments: [
    { ...BELEG("LABEL", 0, "Versandlabel", null), downloadPath: "https://evil.example/a.pdf" },
  ] } });
  let fremd = 0;
  await page.route("**evil.example/**", async (route) => { fremd += 1; await route.abort(); });
  await bucheBisErfolg(page);

  const wrap = page.locator(".booking-success-wrap");
  await wrap.getByRole("button", { name: "Label herunterladen" }).waitFor({ timeout: 15000 });
  assert.equal(await wrap.getByRole("button", { name: BELEG_KNOEPFE }).count(), 0,
    "ein fremder Pfad wurde als Downloadaktion angeboten");
  assert.equal(fremd, 0, "der fremde Host wurde angesprochen");
  await page.close();
});

test("4 — auf 390 px stehen alle Belegknöpfe im Bild", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { buchung: { shippingDocuments: MEHRPAKET } });
  await bucheBisErfolg(page);
  await page.locator(".booking-success-wrap").getByRole("button", { name: BELEG_KNOEPFE }).first().waitFor({ timeout: 15000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const messung = await page.evaluate(() => {
    const knoepfe = [...document.querySelectorAll(".booking-success-wrap button")]
      .filter((b) => /^(Versandlabel|Abholetikett).* herunterladen$/.test(b.textContent.trim()));
    return {
      fenster: window.innerWidth,
      querUeberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      kanten: knoepfe.map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.right]; }),
    };
  });
  assert.equal(messung.kanten.length, 4, "nicht jeder Beleg hat seinen Knopf");
  for (const [links, rechts] of messung.kanten) {
    assert.ok(links >= 0 && rechts <= messung.fenster + 1, `Knopf außerhalb des Bildes: ${links}–${rechts}`);
  }
  assert.ok(messung.querUeberlauf <= 0, `horizontaler Überlauf: ${messung.querUeberlauf} px`);
  await page.close();
});

// Block C: der beim Buchen gebundene Abgabe-Paketshop steht auf der Erfolgsseite — ausschließlich aus der
// Buchungsantwort (`dropoffLocation`). Ohne das Serverfeld gibt es keine Zeile.
test("5 — der gebundene Abgabe-Paketshop kommt aus der Buchungsantwort, ohne sie gibt es keine Zeile", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { buchung: { dropoffLocation: {
    name: "Kiosk am Markt", street: "Bernhardstr. 19", postalCode: "63741", city: "Aschaffenburg", country: "DE",
  } } });
  await bucheBisErfolg(page);
  const zeile = page.locator("#booking-success-dropoff-location");
  await zeile.waitFor({ timeout: 15000 });
  const text = await zeile.innerText();
  assert.match(text, /Abgabe-Paketshop/);
  assert.match(text, /Kiosk am Markt, Bernhardstr\. 19, 63741 Aschaffenburg/);
  await page.close();

  const ohne = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(ohne);
  await bucheBisErfolg(ohne);
  assert.equal(await ohne.locator("#booking-success-dropoff-location").count(), 0, "eine Zeile ohne Serverfeld");
  await ohne.close();
});

// TG110 Final Closure: der Labelvertrag `carrier_at_pickup` (der Carrier bringt das Label bei der Abholung an).
// Die Oberfläche liest ausschließlich die Serverfelder `labelHandling` (Tarif) und `labelStatus` (Buchungsantwort) —
// kein Provider- oder ServiceID-Wissen. Geprüft: Zusatzoptionen ohne PDF-Label-Mail (Tracking-only bleibt), kein
// Label-Mail-Feld im Buchungsrequest, Erfolgsseite ohne Download- und Abrufknopf und ohne „wird erstellt“ — auch auf 390 px.
test("6 — carrier_at_pickup: keine Label-Mail, Tracking-only bleibt; Erfolgsseite ohne Download/Abruf, auch auf 390 px", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const koerper = [];
  await setupRoutes(page, {
    tarif: { ...TARIFF, printerRequired: false, labelHandling: "carrier_at_pickup" },
    buchung: { labelStatus: "carrier_at_pickup" },
    koerper,
  });
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  const karte = await page.locator(".offer-card:not(.offer-card--unavailable)").first().innerText();
  assert.match(karte, /Kein Drucker nötig|Nicht erforderlich/, "die Karte verlangt einen Drucker");
  assert.match(karte, /Wird bei der Abholung angebracht/, "der Carrier-Label-Hinweis fehlt auf der Karte");
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();

  // Zusatzoptionen (erster Buchungsschritt, VOR „Weiter"): der Hinweis statt der PDF-Label-Mail — die reine
  // Tracking-Mail bleibt angeboten. Erst warten, bis das Modul gerendert ist (`count()` wartet nicht).
  await page.waitForSelector("#booking-tracking-email-toggle", { state: "attached", timeout: 20000 });
  assert.equal(await page.locator("#booking-label-email-toggle").count(), 0, "die Label-Mail wird angeboten");
  assert.equal(await page.locator("#booking-label-carrier-info").count(), 1, "der Carrier-Label-Hinweis fehlt");
  assert.match(await page.locator("#booking-label-carrier-info").innerText(),
    /bei der Abholung am Paket angebracht\. Sie müssen kein Versandlabel ausdrucken/);
  assert.equal(await page.locator("#booking-tracking-email-toggle").count(), 1, "die Tracking-Mail wurde mit abgeschaltet");

  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });

  // Der Request trägt keine Label-Mail — ein alter Schalter könnte keine Buchungswirkung entwickeln.
  assert.equal(koerper.length, 1, "nicht genau eine Buchung");
  const body = JSON.parse(koerper[0] || "{}");
  assert.ok(!body.labelTrackingEmail, `Label-Mail im Buchungsrequest: ${JSON.stringify(body.labelTrackingEmail)}`);

  // Erfolgsseite: der Hinweis — kein Download, kein Abruf, kein „wird erstellt“.
  const status = page.locator("#booking-label-status");
  await status.waitFor({ timeout: 15000 });
  assert.match(await status.innerText(), /bei der Abholung am Paket angebracht\. Sie müssen kein Versandlabel ausdrucken/);
  assert.equal(await page.getByRole("button", { name: /Label herunterladen/ }).count(), 0, "ein Downloadknopf");
  assert.equal(await page.locator("#booking-label-retrieve").count(), 0, "ein Abrufknopf");
  assert.doesNotMatch(await page.locator("body").innerText(), /wird erstellt|sobald verfügbar/i, "eine Pending-Zusage");

  // 390 px: der Hinweis steht im Bild, kein horizontaler Überlauf.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const messung = await page.evaluate(() => {
    const r = document.querySelector("#booking-label-status").getBoundingClientRect();
    return { links: r.left, rechts: r.right, fenster: window.innerWidth,
      querUeberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  assert.ok(messung.links >= 0 && messung.rechts <= messung.fenster + 1, `Hinweis außerhalb des Bildes: ${JSON.stringify(messung)}`);
  assert.ok(messung.querUeberlauf <= 0, `horizontaler Überlauf: ${messung.querUeberlauf} px`);
  await page.close();
});
