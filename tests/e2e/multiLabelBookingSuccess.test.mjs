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
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
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

// labelAntworten (Phase 1): Antworten des Labelabrufs der Reihe nach — "pdf", "notReady" (409 LABEL_NOT_READY) oder
// "fehler" (503); danach immer die letzte. Ohne Angabe liefert der Abruf sofort die Datei.
async function setupRoutes(page, { buchung = {}, protokoll, tarif = TARIFF, koerper, labelAntworten = null } = {}) {
  let labelAbruf = 0;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (protokoll) protokoll.push(p);

    if (labelAntworten && /^\/api\/shipments\/\d+\/label$/.test(p)) {
      const art = labelAntworten[Math.min(labelAbruf, labelAntworten.length - 1)];
      labelAbruf += 1;
      if (art === "notReady") return json({ error: "Label noch nicht bereit", code: "LABEL_NOT_READY" }, 409);
      if (art === "fehler") return json({ error: "Fehler" }, 503);
    }
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
  if (server) {
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits node
    // startet. Ein Signal an npx ließe den Enkel auf dem Port stehen.
    stopDevServer(server, "SIGKILL");
  }
});

test("1 — Mehrpaketsendung: vier Zeilen, jede lädt ihren eigenen Beleg; die erste ist die Hauptaktion", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const protokoll = [];
  await setupRoutes(page, { protokoll, buchung: { shippingDocuments: MEHRPAKET } });
  await bucheBisErfolg(page);

  const wrap = page.locator(".booking-success-wrap");
  // Phase 1 (Variante A): eine Dokumentliste — je Beleg eine Zeile mit Name, Stand und eigenem Knopf. Der sichtbare
  // Knopftext heißt „Herunterladen", der zugängliche Name nennt den Beleg (vom Server).
  const liste = wrap.locator(".bsx-dokliste");
  const knoepfe = liste.getByRole("button", { name: BELEG_KNOEPFE });
  await knoepfe.first().waitFor({ timeout: 15000 });
  assert.deepEqual(await knoepfe.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))), [
    "Versandlabel 1 von 3 herunterladen", "Versandlabel 2 von 3 herunterladen",
    "Versandlabel 3 von 3 herunterladen", "Abholetikett herunterladen",
  ]);
  assert.deepEqual((await liste.locator(".bsx-dok-name").allInnerTexts()).map((t) => t.trim()).slice(0, 4),
    ["Versandlabel 1 von 3", "Versandlabel 2 von 3", "Versandlabel 3 von 3", "Abholetikett"]);
  // Die Sendungsnummer des Carriers steht an ihrer Zeile.
  assert.match(await liste.locator(".bsx-dok").nth(1).innerText(), /Sendungsnummer\s+1Z999AA10000000002/);
  // Die Hauptaktion lädt das erste Label; daneben der Sprung zur Dokumentliste.
  assert.equal((await wrap.locator(".bsx-hauptaktion").innerText()).trim(), "Versandlabel 1 von 3 herunterladen");
  assert.equal((await wrap.locator(".bsx-nebenaktion").innerText()).trim(), "Alle Dokumente anzeigen");
  // Kein zusätzlicher Einzelknopf, der nur das erste Etikett über den Sammelpfad lädt.
  assert.equal(await wrap.getByRole("button", { name: "Label herunterladen" }).count(), 0);
  // Der Kunde erfährt, wo er die Belege dauerhaft findet.
  assert.match(await wrap.innerText(), /Meine Sendungen/);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    liste.getByRole("button", { name: "Versandlabel 2 von 3 herunterladen" }).click(),
  ]);
  assert.ok(protokoll.includes(`/api/shipments/${CE_SHIPMENT_ID}/provider-documents/LABEL/1`),
    `Abrufe: ${protokoll.join(", ")}`);
  assert.equal(download.suggestedFilename(), "versandlabel-2.pdf");

  const [abhol] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    liste.getByRole("button", { name: "Abholetikett herunterladen" }).click(),
  ]);
  assert.ok(protokoll.includes(`/api/shipments/${CE_SHIPMENT_ID}/provider-documents/COLLECTION_LABEL/0`));
  assert.equal(abhol.suggestedFilename(), "abholetikett-1.pdf");

  const [erstes] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    wrap.locator(".bsx-hauptaktion").click(),
  ]);
  assert.ok(protokoll.includes(`/api/shipments/${CE_SHIPMENT_ID}/provider-documents/LABEL/0`), "die Hauptaktion lädt nicht das erste Label");
  assert.equal(erstes.suggestedFilename(), "versandlabel-1.pdf");
  assert.ok(!protokoll.some((p) => /\/label$/.test(p)), "der Sammelpfad des ersten Etiketts wurde angesprochen");
  // Die Erfolgsmeldung steht unverändert, und nichts ist rot.
  assert.match(await page.locator(".booking-success-title").innerText(), /erfolgreich gebucht/);
  assert.equal(await wrap.locator(".alert-error, .bsx-dok--error").count(), 0);
  await page.close();
});

test("2 — ohne Versandbelege bleibt der bisherige Labelweg: „Versandlabel herunterladen“ über den Sendungshandle", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const protokoll = [];
  await setupRoutes(page, { protokoll });
  await bucheBisErfolg(page);

  const wrap = page.locator(".booking-success-wrap");
  const haupt = wrap.locator(".bsx-hauptaktion");
  await haupt.waitFor({ timeout: 15000 });
  assert.equal((await haupt.innerText()).trim(), "Versandlabel herunterladen");
  // Genau eine Labelzeile „Versandlabel", bereit, mit eigenem Knopf — kein Beleg der Ablage.
  const zeilen = wrap.locator(".bsx-dokliste .bsx-dok");
  assert.equal((await zeilen.first().locator(".bsx-dok-name").innerText()).trim(), "Versandlabel");
  assert.match(await zeilen.first().innerText(), /Bereit/);
  assert.ok(!/Meine Sendungen“ →/.test(await wrap.innerText()), "der Mehrbeleghinweis steht ohne Belege da");
  await Promise.all([page.waitForEvent("download", { timeout: 15000 }), haupt.click()]);
  assert.ok(protokoll.includes(`/api/shipments/${CE_SHIPMENT_ID}/label`), "der bisherige Labelweg wurde nicht genommen");
  assert.ok(!protokoll.some((p) => p.includes("/provider-documents/")), "ein Belegpfad wurde angesprochen");
  await page.close();
});

test("3 — ein unsicherer Pfad wird nicht angeboten und nie angesprochen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const protokoll = [];
  await setupRoutes(page, { protokoll, buchung: { shippingDocuments: [
    { ...BELEG("LABEL", 0, "Versandlabel", null), downloadPath: "https://evil.example/a.pdf" },
  ] } });
  let fremd = 0;
  await page.route("**evil.example/**", async (route) => { fremd += 1; await route.abort(); });
  await bucheBisErfolg(page);

  const wrap = page.locator(".booking-success-wrap");
  const haupt = wrap.locator(".bsx-hauptaktion");
  await haupt.waitFor({ timeout: 15000 });
  // Der Beleg mit fremdem Host fällt weg; es bleibt der bisherige Labelweg über den Sendungshandle.
  assert.equal(await wrap.locator(".bsx-dokliste .bsx-dok").filter({ hasText: "Versandlabel" }).count(), 1);
  await Promise.all([page.waitForEvent("download", { timeout: 15000 }), haupt.click()]);
  assert.ok(protokoll.includes(`/api/shipments/${CE_SHIPMENT_ID}/label`));
  assert.equal(fremd, 0, "der fremde Host wurde angesprochen");
  await page.close();
});

test("4 — auf 390 px stehen Bestätigung, Hauptaktion und alle Belegknöpfe im Bild", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { buchung: { shippingDocuments: MEHRPAKET } });
  await bucheBisErfolg(page);
  await page.locator(".bsx-dokliste").getByRole("button", { name: BELEG_KNOEPFE }).first().waitFor({ timeout: 15000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const messung = await page.evaluate(() => {
    const kante = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; };
    return {
      fenster: window.innerWidth,
      hoehe: window.innerHeight,
      querUeberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      knoepfe: [...document.querySelectorAll(".bsx-dokliste button")].map(kante),
      titel: kante(document.querySelector(".booking-success-title")),
      haupt: kante(document.querySelector(".bsx-hauptaktion")),
    };
  });
  assert.equal(messung.knoepfe.length, 4, "nicht jeder Beleg hat seinen Knopf");
  for (const [links, rechts] of messung.knoepfe) {
    assert.ok(links >= 0 && rechts <= messung.fenster + 1, `Knopf außerhalb des Bildes: ${links}–${rechts}`);
  }
  // Erster Bildschirm: Bestätigung und Hauptaktion.
  assert.ok(messung.titel[3] <= messung.hoehe && messung.haupt[3] <= messung.hoehe, `nicht im ersten Bildschirm: ${JSON.stringify(messung)}`);
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
  // Gleich hohe Karten (2026-10-04): Drucker- und Labelangabe stehen in den Details der Karte.
  const angebot = page.locator(".offer-card:not(.offer-card--unavailable)").first();
  await angebot.locator("button.offer-details-link").click();
  const panel = angebot.locator(".offer-details-panel--open");
  await panel.waitFor({ timeout: 10000 });
  const karte = await panel.innerText();
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

// ══════════ Phase 1 (Betreiberentscheidung 2026-11-06, Canonical v2.117): Variante A und Labelhinweis ══════════
// Der allgemeine Hinweis „Ihr Versandlabel wird erstellt …" entfällt in jedem Zustand; der Stand steht kurz an der
// Labelzeile. Premium-UX-Nachbesserung (Canonical v2.118): ein beim Anbieter abrufbares Label heißt sofort
// „Versandlabel herunterladen" — derselbe Klick lädt das PDF. Warten und Fehler stehen unter der Hauptaktion und an
// der Labelzeile; neben der Hauptaktion steht kein zweiter Knopf.

test("7 — JUMiNGO abrufbar: sofort „Versandlabel herunterladen“; ein Klick lädt das PDF, danach steht die Zeile auf „Bereit“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const protokoll = [];
  await setupRoutes(page, { protokoll, buchung: { labelStatus: "pending", labelRetrievable: true } });
  await bucheBisErfolg(page);
  const wrap = page.locator(".booking-success-wrap");
  const haupt = wrap.locator(".bsx-hauptaktion");
  await haupt.waitFor({ timeout: 15000 });
  assert.equal((await haupt.innerText()).trim(), "Versandlabel herunterladen");
  // Vor dem Klick verspricht die Zeile kein „Bereit“ und nennt keinen internen Abruf.
  assert.equal((await page.locator("#booking-label-status").innerText()).trim(), "PDF zum Ausdrucken");
  assert.doesNotMatch(await wrap.innerText(), /abrufen|abrufbar|abgerufen/i, "der interne Abruf steht im Kundentext");
  assert.doesNotMatch(await wrap.innerText(), /Ihr Versandlabel wird erstellt|Sobald es verfügbar ist/, "der allgemeine Labelhinweis steht noch da");
  assert.equal(await page.locator("#booking-label-retrieve").count(), 0, "ein eigener Abrufknopf");
  // Die Zeile bietet denselben Download ruhig an — kein zweiter gefüllter Knopf neben der Hauptaktion.
  assert.equal(await wrap.locator(".bsx-dokliste").getByRole("button", { name: "Versandlabel herunterladen" }).count(), 1);
  assert.equal(await wrap.locator(".bsx-nebenaktion").count(), 0);
  assert.equal(await wrap.locator(".btn-primary").count(), 1, "mehr als ein gefüllter Knopf");
  await Promise.all([page.waitForEvent("download", { timeout: 15000 }), haupt.click()]);
  assert.ok(protokoll.includes(`/api/shipments/${CE_SHIPMENT_ID}/label`));
  await page.waitForFunction(() => /Bereit/.test(document.querySelector(".bsx-dokliste .bsx-dok")?.innerText || ""), null, { timeout: 10000 });
  assert.equal((await haupt.innerText()).trim(), "Versandlabel herunterladen");
  assert.equal(await wrap.locator(".bsx-aktion-meldung").count(), 0, "nach dem Download steht eine Meldung unter der Hauptaktion");
  await page.close();
});

test("8 — „noch nicht bereit“ ist ein ruhiger Wartezustand, kein Fehler; der spätere Abruf gelingt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await setupRoutes(page, { buchung: { labelStatus: "pending", labelRetrievable: true }, labelAntworten: ["notReady", "pdf"] });
  await bucheBisErfolg(page);
  const wrap = page.locator(".booking-success-wrap");
  await wrap.locator(".bsx-hauptaktion").click();
  const status = page.locator("#booking-label-status");
  await page.waitForFunction(() => /Noch nicht bereit/.test(document.querySelector("#booking-label-status")?.innerText || ""), null, { timeout: 10000 });
  assert.match(await status.innerText(), /Noch nicht bereit – bitte in einigen Minuten erneut versuchen/);
  // Ruhig: keine rote Fläche, keine Alarmansage, die Buchung bleibt bestätigt.
  assert.equal(await wrap.locator(".alert-error, .bsx-dok--error, [role='alert']").count(), 0, "ein Wartezustand erscheint als Fehler");
  assert.match(await page.locator(".booking-success-title").innerText(), /erfolgreich gebucht/);
  // Die Hauptaktion behält ihren Namen; darunter steht der Wartezustand ruhig (nicht im Fehlerton), an der Zeile
  // „Erneut versuchen". Kein zweiter Knopf daneben.
  assert.equal((await wrap.locator(".bsx-hauptaktion").innerText()).trim(), "Versandlabel herunterladen");
  assert.match(await wrap.locator(".bsx-aktion-meldung").innerText(), /Noch nicht bereit – bitte in einigen Minuten erneut versuchen/);
  assert.equal(await wrap.locator(".bsx-aktion-meldung--fehler").count(), 0, "der Wartezustand steht im Fehlerton");
  assert.equal(await wrap.locator(".bsx-nebenaktion").count(), 0);
  assert.match(await wrap.locator(".bsx-dokliste .bsx-dok").first().locator("button").innerText(), /Erneut versuchen/);
  await Promise.all([page.waitForEvent("download", { timeout: 15000 }), wrap.locator(".bsx-hauptaktion").click()]);
  await page.waitForFunction(() => /Bereit/.test(document.querySelector(".bsx-dokliste .bsx-dok")?.innerText || ""), null, { timeout: 10000 });
  assert.equal(await wrap.locator(".bsx-aktion-meldung").count(), 0, "der Wartezustand bleibt nach dem Download stehen");
  await page.close();
});

test("9 — ein echter Abruffehler bleibt als Fehler erkennbar — an der Labelzeile, mit „Erneut versuchen“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { buchung: { labelStatus: "pending", labelRetrievable: true }, labelAntworten: ["fehler"] });
  await bucheBisErfolg(page);
  const wrap = page.locator(".booking-success-wrap");
  await wrap.locator(".bsx-hauptaktion").click();
  const fehlerZeile = wrap.locator(".bsx-dok--error");
  await fehlerZeile.waitFor({ timeout: 10000 });
  assert.equal(await fehlerZeile.locator("[role='alert']").count(), 1, "der Fehler wird nicht angesagt");
  assert.match(await fehlerZeile.innerText(), /später erneut/);
  assert.match(await fehlerZeile.locator("button").innerText(), /Erneut versuchen/);
  assert.doesNotMatch(await fehlerZeile.innerText(), /Fehler$/, "Server-Freitext im Kundentext");
  // Unter der Hauptaktion steht derselbe Fehler sichtbar im Fehlerton; die Buchung bleibt bestätigt.
  assert.match(await wrap.locator(".bsx-aktion-meldung--fehler").innerText(), /später erneut/);
  assert.match(await page.locator(".booking-success-title").innerText(), /erfolgreich gebucht/);
  await page.close();
});

test("10 — Portal (DPD 124/137) ohne Abruf: Stand „Wird vom Versanddienstleister erstellt“, kein Download, kein Abruf", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { buchung: { labelStatus: "pending", labelRetrievable: false } });
  await bucheBisErfolg(page);
  const wrap = page.locator(".booking-success-wrap");
  await page.locator("#booking-label-status").waitFor({ timeout: 15000 });
  assert.match(await page.locator("#booking-label-status").innerText(), /Wird vom Versanddienstleister erstellt/);
  assert.equal(await wrap.locator(".bsx-dokliste .bsx-dok").first().locator("button").count(), 0, "die Labelzeile bietet eine Aktion an");
  assert.equal(await page.locator("#booking-label-retrieve").count(), 0);
  assert.equal((await wrap.locator(".bsx-hauptaktion").innerText()).trim(), "Zu meinen Sendungen");
  assert.doesNotMatch(await wrap.innerText(), /Ihr Versandlabel wird erstellt|Sobald es verfügbar ist/);
  await page.close();
});

test("11 — Rahmen: keine Schrittleiste, genau eine h1, kein Seitentitel daneben; Neuladen zeigt „Buchung abgeschlossen“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { buchung: { orderConfirmation: { number: "CE-AB26-01004" } } });
  await bucheBisErfolg(page);
  assert.equal(await page.locator(".steps-bar").count(), 0, "die Schrittleiste steht auf der Erfolgsseite");
  const h1 = await page.locator("h1").allInnerTexts();
  assert.deepEqual(h1.map((t) => t.trim()), ["Sendung erfolgreich gebucht!"], `h1: ${JSON.stringify(h1)}`);
  assert.equal(await page.locator(".ce-page-header-title").count(), 0, "der Seitentitel „Sendung buchen“ konkurriert");
  // Die Auftragsbestätigungsnummer steht oben mit Kopieren.
  assert.match(await page.locator(".bsx-vorgang").innerText(), /Auftragsbestätigung[\s\S]*CE-AB26-01004/);
  // Details sind aufklappbar und anfangs geschlossen.
  const knopf = page.locator(".bsx-details-knopf");
  assert.equal(await knopf.getAttribute("aria-expanded"), "false");
  assert.equal(await page.locator("#bsx-details-inhalt").isVisible(), false);
  await knopf.click();
  assert.equal(await knopf.getAttribute("aria-expanded"), "true");
  assert.match(await page.locator("#bsx-details-inhalt").innerText(), /Absender[\s\S]*Empfänger/);
  // Neuladen: kein „Kein Angebot ausgewählt", sondern die ruhige Bestätigung — ohne erneute Buchung.
  let buchungen = 0;
  page.on("request", (r) => { if (r.url().includes("/api/jumingo/book")) buchungen += 1; });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".booking-abgeschlossen").waitFor({ timeout: 15000 });
  const text = await page.locator(".booking-abgeschlossen").innerText();
  assert.match(text, /Buchung abgeschlossen/);
  assert.match(text, /CE-AB26-01004/);
  assert.doesNotMatch(await page.locator("body").innerText(), /Kein Angebot ausgewählt/);
  assert.equal(buchungen, 0, "das Neuladen hat erneut gebucht");
  // Der Vermerk lebt nur im Verlaufseintrag (kein Web-Speicher) und trägt weder Angebot noch Anschrift noch Namen.
  const lage = await page.evaluate(() => ({
    verlauf: JSON.stringify(window.history.state),
    sitzung: Object.keys(sessionStorage).filter((k) => /buchung|booking/i.test(k)),
    lokal: Object.keys(localStorage).filter((k) => /buchung|booking/i.test(k)),
  }));
  assert.match(lage.verlauf, /buchungAbgeschlossen/);
  assert.doesNotMatch(lage.verlauf, /tariff|Muster|Straße|max@example|Standardversand/, `Verlauf: ${lage.verlauf}`);
  assert.deepEqual([lage.sitzung, lage.lokal], [[], []], "der Vermerk liegt in einem Browserspeicher");
  await page.close();
});
