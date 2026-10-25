// E2E: individuelle Mehrpaketsendungen in „Neue Sendung“ (Canonical v2.79, §15) — echter Dev-Server, echter
// Browser, gemocktes Backend. Keine Buchung, kein Anbieter, kein Providercall.
//
//   S1  Startansicht wie bisher: eine Zeile (ns-*), „Gleiche Pakete“, keine Überschrift/Zeilenaktionen,
//       „Paket hinzufügen“; eine Zeile sendet unverändert den flachen Vertrag.
//   S2  Nur Tastatur: hinzufügen per Enter, Fokus in die Anzahl der neuen Zeile, Summe und Ansage im
//       aria-live-Bereich, Enter in einem Feld fügt nichts hinzu, Volumengewicht nur bei einer Zeile.
//   S3  Kopieren (Menge 1, Fokus ins Gewicht), Entfernen (Fokus nächste Zeile bzw. „hinzufügen“), zurück zur
//       Startansicht.
//   S4  Fehler mit Zeilenbezug und Fokus, Summengrenze 99, Zeilengrenze 20.
//   S5  Unterschiedliche Pakete: `packageLines` in Formularreihenfolge, Satz über den Angeboten, zwei
//       Angebotsgründe, Serverfehler `packageLines[1].length` am Feld der Zeile 2.
//   S6  Kein Angebot übrig: Leerzustand mit „Weniger oder gleich große Pakete erweitern die Auswahl.“
//   S7  Buchung: „4 Pakete · 27 kg gesamt“ mit „Pakete anzeigen“, Zurück behält die Zeilen, /book ohne
//       Paketzeilen, Erfolgsseite mit dem Klebehinweis des Servers.
//   S8  Formularentwurf Fassung 2 speichern und fortsetzen — alle Zeilen kommen zurück.
//   S9  1440 und 768 px eine Reihe, 600 px zweizeilig, 375 px Karte; kein Querscrollen; Aktionen ≥ 44 px.
//   S10 „Meine Sendungen“: Summe in der Liste, Klebehinweis des Servers in der Belegübersicht.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, ueberSidebar } from "./helpers/newShipmentForm.mjs";

const PORT = 5621, BASE = `http://127.0.0.1:${PORT}`;
const CE_SHIPMENT_ID = 5810;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "70173", customer_number: "CE-K-10031",
};
const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const tarif = (id, name, netto, extra = {}) => ({
  id, shipper_tariff_id: id, offerId: `pl${String(id).padStart(30, "0")}`,
  publicCarrierId: "ups", publicCarrierName: "UPS", publicServiceName: name, serviceType: "pickup",
  shippingMode: "standard", transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1-2 Tage",
  trackingAvailable: true, printerRequired: true, availableForDate: true,
  pickupDate: "2026-10-27", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00", deliveryDate: "2026-10-28",
  bookable: true, unavailableReason: null, requiredPriceInputs: [],
  netPrice: netto, vatAmount: Number((netto * 0.19).toFixed(2)), finalPrice: Number((netto * 1.19).toFixed(2)), currency: "EUR",
  ...extra,
});
const BUCHBAR = tarif(23, "Express Saver", 31.4);
const UNBELEGT = tarif(41, "Express", 44.2, { bookable: false, unavailableReason: "package_combination_unverified" });
const ETIKETT = tarif(84, "Domestic Express", 39.9, { bookable: false, unavailableReason: "package_labels_indistinguishable" });

// Zwei Paketarten — die Werte der Zeilen 1 und 2 (Standardpaket der Helfer: 2 × 5,5 kg · 40 × 30 × 20 cm).
const ZEILE2 = { packageCount: "2", weight: "8", length: "30", width: "20", height: "15" };

let server, browser;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

async function setup(page, { calc = () => ({ tariffs: [BUCHBAR, UNBELEGT, ETIKETT] }), buchung = {} } = {}) {
  const p = { calc: [], book: [], entwuerfe: [], gespeichert: null, pfade: [] };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    p.pfade.push(`${req.method()} ${pfad}`);
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    const body = () => { try { return JSON.parse(req.postData() || "{}"); } catch { return {}; } };
    if (pfad.endsWith("/api/shipping/launch-scope")) return json({ countries: EU27, originCountries: ["DE"] });
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (/\/api\/kunde\/form-drafts\/\d+$/.test(pfad)) {
      return p.gespeichert ? json({ draft: p.gespeichert }) : json({ error: "nicht gefunden", code: "FORM_DRAFT_NOT_FOUND" }, 404);
    }
    if (pfad.endsWith("/api/kunde/form-drafts")) {
      if (req.method() === "POST") {
        const b = body();
        p.entwuerfe.push(b);
        const pk = b.formData && b.formData.packages;
        p.gespeichert = {
          id: 91, kind: "form", revision: 1, schemaVersion: b.schemaVersion, formData: b.formData,
          createdAt: "2026-10-26T09:00:00Z", updatedAt: "2026-10-26T09:00:00Z",
          summary: { sender: {}, recipient: {}, shippingDate: null,
            packages: { packageCount: pk.packageCount, weight: pk.weight, packageLineCount: pk.packageLines ? pk.packageLines.length : undefined,
              totalWeight: pk.packageLines ? pk.packageLines.reduce((s, z) => s + z.quantity * z.weight, 0) : undefined } },
        };
        return json({ draft: p.gespeichert }, 201);
      }
      return json({ drafts: p.gespeichert ? [p.gespeichert] : [], nextCursor: null });
    }
    if (pfad.includes("/api/jumingo/calculate-price")) {
      const b = body();
      p.calc.push(b);
      const a = calc(p.calc.length, b);
      if (a.status) return json(a.body || {}, a.status);
      return json({ ceShipmentId: CE_SHIPMENT_ID + p.calc.length, tariffs: a.tariffs, availableShippingModes: ["standard", "express"],
        publicCarriers: [{ id: "ups", name: "UPS" }], customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE",
        exportDeclaration: null });
    }
    if (pfad.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-10-27T07:00:00Z", availableUntil: "2026-10-27T15:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    if (pfad.includes("/api/jumingo/book")) {
      p.book.push(body());
      return json({ message: "Sendung gebucht", ceShipmentId: CE_SHIPMENT_ID, trackingNumber: "1Z999", labelUrl: null,
        invoiceNumber: "CE-RE-2026-000777", ...buchung });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

async function neueSeite(viewport = { width: 1440, height: 1100 }) {
  const page = await browser.newPage({ viewport });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function oeffneFormular(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section #ns-weight", { timeout: 20000 });
}

const addKnopf = (page) => page.getByRole("button", { name: "Paket hinzufügen" });
const zeilen = (page) => page.locator(".offers-form-section .pkg-line");
const fokusId = (page) => page.evaluate(() => document.activeElement && document.activeElement.id);
const wert = (page, id) => page.locator(`#${id}`).inputValue();

async function fuelleZeile(page, k, z) {
  for (const [feld, v] of Object.entries(z)) await page.fill(`#ns-${feld}-${k}`, v);
}

async function zweiZeilen(page) {
  await addKnopf(page).click();
  await page.waitForSelector("#ns-weight-2");
  await fuelleZeile(page, 2, ZEILE2);
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await kurz(250);
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits node startet.
  if (server) stopDevServer(server, "SIGKILL");
});

test("S1 — Startansicht wie bisher; eine Zeile sendet den flachen Vertrag", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await oeffneFormular(page);
  assert.equal(await wert(page, "ns-packageCount"), "1");
  assert.equal(norm(await page.locator("#ns-packageCount-hint").textContent()), "Gleiche Pakete");
  assert.equal(await page.locator(".pkg-line-title").count(), 0, "keine Überschrift „Paket 1“");
  assert.equal(await page.getByRole("button", { name: /kopieren|entfernen/ }).count(), 0, "keine Zeilenaktionen");
  assert.equal(await addKnopf(page).isEnabled(), true);
  assert.equal(await page.locator(".pkg-lines-sum").count(), 0, "keine Summe bei einer Zeile");
  await fuelleVersandformular(page);
  assert.equal(await page.locator(".vol-weight-box").isVisible(), true, "das Volumengewicht bleibt bei einer Zeile");
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  const b = p.calc[0];
  assert.deepEqual([b.packageCount, b.weight, b.length, b.width, b.height], [2, 5.5, 40, 30, 20]);
  assert.ok(!("packageLines" in b), "eine Zeile sendet keine packageLines");
  assert.equal(await page.locator("#offers-packages-note").count(), 0, "kein Mehrpaket-Satz bei gleichen Paketen");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("S2 — nur Tastatur: hinzufügen, Fokus, Summe und Ansage; Enter im Feld fügt nichts hinzu", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  await oeffneFormular(page);
  await fuelleVersandformular(page);
  await page.focus("#ns-height");
  await page.keyboard.press("Tab");
  assert.equal(norm(await page.evaluate(() => document.activeElement.textContent)), "Paket hinzufügen",
    "„Paket hinzufügen“ folgt in der Tab-Reihenfolge direkt auf die Paketfelder");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#ns-packageCount-2");
  assert.equal(await fokusId(page), "ns-packageCount-2", "der Fokus steht in der Anzahl der neuen Zeile");
  assert.equal(await page.evaluate(() => window.getSelection().toString() || document.activeElement.value), "1");
  await page.keyboard.type("2");
  assert.equal(await wert(page, "ns-packageCount-2"), "2", "die markierte Vorgabe wird überschrieben");
  for (const [feld, v] of [["weight", "8"], ["length", "30"], ["width", "20"], ["height", "15"]]) {
    await page.keyboard.press("Tab");
    assert.equal(await fokusId(page), `ns-${feld}-2`);
    await page.keyboard.type(v);
  }
  assert.deepEqual(await page.locator(".pkg-line-title").allTextContents(), ["Paket 1", "Paket 2"]);
  for (const name of ["Paket 1 kopieren", "Paket 1 entfernen", "Paket 2 kopieren", "Paket 2 entfernen"]) {
    assert.equal(await page.getByRole("button", { name }).count(), 1, `${name} fehlt`);
  }
  const summe = page.locator(".pkg-lines-sum");
  assert.equal(norm(await summe.textContent()), "4 Pakete · 27 kg gesamt");
  assert.equal(await summe.getAttribute("aria-live"), "polite");
  assert.equal(norm(await page.locator(".pkg-lines [role=status]").textContent()), "Paket 2 hinzugefügt.");
  assert.equal(await page.locator("#ns-packageCount-hint").count(), 0, "ab zwei Zeilen kein Anzahl-Hinweis");
  assert.equal(await page.locator(".vol-weight-box").count(), 0, "kein Volumengewicht bei mehreren Zeilen");
  // Enter in einem Feld löst kein „hinzufügen“ aus.
  await page.focus("#ns-weight-2");
  await page.keyboard.press("Enter");
  await kurz(150);
  assert.equal(await zeilen(page).count(), 2, "Enter hat eine Zeile hinzugefügt");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("S3 — Kopieren und Entfernen führen den Fokus; eine Zeile ist wieder die Startansicht", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  await oeffneFormular(page);
  await fuelleVersandformular(page);
  await zweiZeilen(page);
  await page.getByRole("button", { name: "Paket 1 kopieren" }).click();
  await page.waitForSelector("#ns-weight-3");
  assert.deepEqual([await wert(page, "ns-packageCount-2"), await wert(page, "ns-weight-2"), await wert(page, "ns-length-2")],
    ["1", "5.5", "40"], "die Kopie trägt dieselben Werte und Menge 1");
  assert.equal(await wert(page, "ns-weight-3"), "8", "die Kopie steht direkt unter dem Original");
  assert.equal(await fokusId(page), "ns-weight-2", "nach dem Kopieren steht der Fokus im Gewicht der Kopie");
  // Die letzte Zeile entfernen (Tastatur): der Fokus geht auf „Paket hinzufügen“.
  await page.getByRole("button", { name: "Paket 3 entfernen" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.getElementById("ns-weight-3"));
  assert.equal(norm(await page.evaluate(() => document.activeElement.textContent)), "Paket hinzufügen");
  // Die erste Zeile entfernen: der Fokus geht in die nächste (jetzt erste) Zeile.
  await page.getByRole("button", { name: "Paket 1 entfernen" }).click();
  await page.waitForFunction(() => !document.getElementById("ns-weight-2"));
  assert.equal(await fokusId(page), "ns-packageCount");
  assert.deepEqual([await wert(page, "ns-packageCount"), await wert(page, "ns-weight")], ["1", "5.5"],
    "die verbliebene Zeile ist die Kopie");
  assert.equal(await page.locator(".pkg-line-title").count(), 0, "zurück in der Startansicht");
  assert.equal(norm(await page.locator("#ns-packageCount-hint").textContent()), "Gleiche Pakete");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("S4 — Fehler mit Zeilenbezug und Fokus, Summengrenze 99, Zeilengrenze 20", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await oeffneFormular(page);
  await fuelleVersandformular(page);
  await addKnopf(page).click();
  await page.waitForSelector("#ns-weight-2");
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "ns-weight-2", null, { timeout: 5000 });
  assert.equal(p.calc.length, 0, "ohne vollständige Zeile 2 geht kein Request hinaus");
  assert.equal(norm(await page.locator("#ns-weight-2-err").textContent()), "Paket 2: Gewicht ist ein Pflichtfeld.");
  assert.equal(await page.locator("#ns-weight-2").getAttribute("aria-invalid"), "true");
  assert.equal(await page.locator("#ns-weight-err").count(), 0, "Zeile 1 ist gültig und unmarkiert");
  // Summengrenze: 2 + 98 = 100 Pakete.
  await fuelleZeile(page, 2, { ...ZEILE2, packageCount: "98" });
  assert.equal(norm(await page.locator(".pkg-lines-sum-error").textContent()), "Höchstens 99 Pakete je Sendung.");
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.dataset.field === "packageLines", null, { timeout: 5000 });
  assert.equal(p.calc.length, 0, "über 99 Pakete geht kein Request hinaus");
  await page.fill("#ns-packageCount-2", "97");
  assert.equal(await page.locator(".pkg-lines-sum-error").count(), 0, "2 + 97 = 99 ist erlaubt");
  // Zeilengrenze: höchstens 20.
  for (let i = 0; i < 25 && await addKnopf(page).isEnabled(); i += 1) await addKnopf(page).click();
  assert.equal(await zeilen(page).count(), 20);
  assert.equal(await addKnopf(page).isDisabled(), true);
  assert.equal(norm(await page.locator(".pkg-lines-limit").textContent()), "Höchstens 20 Paketzeilen");
  assert.equal(await page.getByRole("button", { name: "Paket 1 kopieren" }).isDisabled(), true, "Kopieren respektiert die Grenze");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("S5 — unterschiedliche Pakete: packageLines, Angebotsgründe, Serverfehler an Zeile 2", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, {
    calc: (n) => (n === 1 ? { tariffs: [BUCHBAR, UNBELEGT, ETIKETT] }
      : { status: 400, body: { error: "packageLines[1].length: Pflichtfeld", code: "DIMENSION_INVALID", field: "packageLines[1].length" } }),
  });
  await oeffneFormular(page);
  await fuelleVersandformular(page);
  await zweiZeilen(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  const b = p.calc[0];
  for (const k of ["packageCount", "weight", "length", "width", "height"]) assert.ok(!(k in b), `${k} neben packageLines`);
  assert.deepEqual(b.packageLines, [
    { quantity: 2, weight: 5.5, length: 40, width: 30, height: 20 },
    { quantity: 2, weight: 8, length: 30, width: 20, height: 15 },
  ]);
  assert.equal(norm(await page.locator("#offers-packages-note").textContent()),
    "Für unterschiedliche Pakete werden nur Versandarten angezeigt, die alle Pakete befördern können.");
  const karten = norm(await page.locator(".offers-body").textContent());
  assert.ok(karten.includes("Für unterschiedliche Pakete derzeit nicht direkt buchbar."), karten);
  assert.ok(karten.includes("Für diese Paketkombination nicht direkt buchbar."), karten);
  assert.ok(!/package_|TNT|Transglobal|JUMiNGO/.test(karten), "kein Rohgrund und kein Anbietername");
  // Der Knopf trägt nur den Grund — alle Karten einer Stufe bleiben gleich hoch (Betreiberentscheidung 2026-10-04);
  // die Begründung steht im Detailbereich.
  const hoehen = await page.locator(".offer-card").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  assert.equal(new Set(hoehen).size, 1, `ungleich hohe Karten: ${hoehen}`);
  const etikettKarte = page.locator(`.offer-card:has(button[aria-controls="offer-details-${ETIKETT.offerId}"])`);
  await etikettKarte.locator("button.offer-details-link").click();
  await page.locator(`#offer-details-${ETIKETT.offerId}`).waitFor({ state: "visible", timeout: 10000 });
  assert.equal(norm(await page.locator(`#offer-details-${ETIKETT.offerId} .offer-blocked-hint`).textContent()),
    "Die Versandlabels wären nicht eindeutig zuzuordnen.");
  // Eine Änderung verwirft die Angebote; die Neuberechnung meldet einen Fehler an Zeile 2.
  await page.fill("#ns-length-2", "31");
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForFunction(() => document.getElementById("ns-length-2")?.getAttribute("aria-invalid") === "true", null, { timeout: 10000 });
  assert.equal(p.calc.length, 2);
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "ns-length-2", null, { timeout: 5000 });
  assert.notEqual(await page.locator("#ns-length").getAttribute("aria-invalid"), "true", "nicht an Zeile 1");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("S6 — kein Angebot übrig: der Leerzustand nennt den Weg", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page, { calc: () => ({ tariffs: [] }) });
  await oeffneFormular(page);
  await fuelleVersandformular(page);
  await zweiZeilen(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offers-empty", { timeout: 20000 });
  assert.match(norm(await page.locator(".offers-empty").textContent()), /Weniger oder gleich große Pakete erweitern die Auswahl\.$/);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("S7 — Buchung: Summe mit „Pakete anzeigen“, Zurück behält die Zeilen, Klebehinweis auf der Erfolgsseite", async () => {
  const { page, fehler } = await neueSeite();
  // Die Erfolgsantwort wie bei einer gebuchten TG-Sendung mit zwei Etiketten (TG-F5) und dem Etikettenprofil.
  const beleg = (ordinal) => ({ type: "LABEL", category: "SHIPPING", status: "ready", ordinal, label: `Versandlabel ${ordinal + 1} von 2`,
    carrierReference: `1Z99900000000000${ordinal}`, downloadPath: `/api/shipments/${CE_SHIPMENT_ID}/provider-documents/LABEL/${ordinal}` });
  const p = await setup(page, { buchung: { packageLabelHint: "weight_and_dimensions", shippingDocuments: [beleg(0), beleg(1)] } });
  await oeffneFormular(page);
  await fuelleVersandformular(page);
  await zweiZeilen(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".shipment-summary-card", { timeout: 20000 });
  const zeile = page.locator('.shipment-summary-card .summary-detail-row:has(.summary-detail-key:text-is("Paket"))');
  assert.equal(norm(await zeile.locator(".summary-detail-val").textContent()), "4 Pakete · 27 kg gesamt");
  const knopf = zeile.locator(".pkg-disclosure-toggle");
  assert.equal(await knopf.getAttribute("aria-expanded"), "false");
  assert.equal(await zeile.locator(".pkg-disclosure-lines").isVisible(), false);
  await knopf.click();
  assert.equal(await knopf.getAttribute("aria-expanded"), "true");
  assert.equal(norm(await knopf.textContent()), "Pakete ausblenden");
  assert.deepEqual((await zeile.locator(".pkg-disclosure-lines li").allTextContents()).map(norm),
    ["2 × 5,5 kg · 40 × 30 × 20 cm", "2 × 8 kg · 30 × 20 × 15 cm"]);
  // Zurück: die Zeilen sind noch da, vorwärts wieder die Buchung.
  await page.goBack();
  await page.waitForSelector("#ns-weight-2", { timeout: 20000 });
  assert.deepEqual([await wert(page, "ns-packageCount-2"), await wert(page, "ns-weight-2")], ["2", "8"]);
  await page.goForward();
  await page.waitForSelector(".shipment-summary-card", { timeout: 20000 });
  // Buchen (gemockt): /book trägt keine Paketzeilen — der Server liest sie aus dem Entwurf.
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  const bestaetigung = norm(await page.locator('.booking-confirm-row:has(span:text-is("Paket"))').textContent());
  assert.match(bestaetigung, /4 Pakete · 27 kg gesamt/);
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(p.book.length, 1);
  assert.ok(!("packageLines" in p.book[0]) && !JSON.stringify(p.book[0]).includes("packageLines"), "der Client sendet keine Paketzeilen");
  assert.equal(await page.getByRole("button", { name: /^Versandlabel . von 2/ }).count(), 2, "je Paket ein Etikett");
  assert.equal(norm(await page.locator("#booking-label-hint").textContent()),
    "Jedes Versandlabel nennt Gewicht und Maße seines Pakets sowie „1 OF 2“. Bitte jedes Label auf das Paket mit diesen Angaben kleben.");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("S8 — Formularentwurf Fassung 2: speichern und fortsetzen mit allen Zeilen", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page);
  await oeffneFormular(page);
  await fuelleVersandformular(page);
  await zweiZeilen(page);
  await page.getByRole("button", { name: "Als Entwurf speichern" }).click();
  await page.waitForFunction(() => document.getElementById("ns-weight-2") === null, null, { timeout: 10000 });
  assert.equal(p.entwuerfe.length, 1);
  const e = p.entwuerfe[0];
  assert.equal(e.schemaVersion, 2);
  assert.deepEqual(e.formData.packages, {
    packageCount: 4, weight: null, length: null, width: null, height: null,
    packageLines: [
      { quantity: 2, weight: 5.5, length: 40, width: 30, height: 20 },
      { quantity: 2, weight: 8, length: 30, width: 20, height: 15 },
    ],
  });
  await ueberSidebar(page, "Entwürfe");
  await page.waitForSelector("text=Fortsetzen", { timeout: 20000 });
  assert.match(norm(await page.locator("body").textContent()), /4 Pakete/);
  await page.getByRole("button", { name: /Fortsetzen/ }).first().click();
  await page.waitForSelector("#ns-weight-2", { timeout: 20000 });
  assert.deepEqual([await wert(page, "ns-packageCount"), await wert(page, "ns-weight"), await wert(page, "ns-length")], ["2", "5.5", "40"]);
  assert.deepEqual([await wert(page, "ns-packageCount-2"), await wert(page, "ns-weight-2"), await wert(page, "ns-height-2")], ["2", "8", "15"]);
  assert.equal(norm(await page.locator(".pkg-lines-sum").textContent()), "4 Pakete · 27 kg gesamt");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("S9 — 1440/768 eine Reihe, 600 zweizeilig, 375 Karte; kein Querscrollen; Aktionen ≥ 44 px", async () => {
  // Die Stufen des Canonical: ab 721 px eine Reihe, 461–720 px zweizeilig, bis 460 px eine Karte je Zeile.
  for (const [breite, erwartung] of [[1440, "reihe"], [768, "reihe"], [600, "zweizeilig"], [375, "karte"]]) {
    const { page, fehler } = await neueSeite({ width: breite, height: 1000 });
    await setup(page);
    await oeffneFormular(page);
    await addKnopf(page).click();
    await page.waitForSelector("#ns-weight-2");
    const m = await page.evaluate(() => {
      const top = (id) => Math.round(document.getElementById(id).getBoundingClientRect().top);
      const zeile = document.querySelectorAll(".offers-form-section .pkg-line")[1];
      const stil = getComputedStyle(zeile);
      const knoepfe = [...document.querySelectorAll(".pkg-lines button")].map((b) => Math.round(b.getBoundingClientRect().height));
      return {
        quer: document.documentElement.scrollWidth > window.innerWidth,
        reihe: ["ns-packageCount-2", "ns-weight-2", "ns-length-2", "ns-width-2", "ns-height-2"].map(top),
        rand: stil.borderLeftWidth, knoepfe,
      };
    });
    assert.equal(m.quer, false, `${breite}: horizontales Scrollen`);
    const [a, , , d, e] = m.reihe;
    if (erwartung === "reihe") assert.ok(new Set(m.reihe).size === 1, `${breite}: nicht in einer Reihe ${m.reihe}`);
    if (erwartung === "zweizeilig") assert.ok(d > a && e === d, `${breite}: nicht zweizeilig ${m.reihe}`);
    if (erwartung === "karte") assert.equal(m.rand, "1px", `${breite}: keine Karte je Zeile`);
    for (const h of m.knoepfe) assert.ok(h >= 44, `${breite}: Aktion nur ${h} px hoch`);
    assert.deepEqual(fehler, []);
    await page.close();
  }
});

test("S10 — „Meine Sendungen“: Summe in der Liste, Klebehinweis des Servers in der Belegübersicht", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page);
  // Eine gebuchte Sendung mit unterschiedlichen Paketen — die Kunden-API liefert dann `package_lines`.
  const sendung = { id: CE_SHIPMENT_ID, status: "booked", weight: null, price_final: 46.55, selected_carrier: "dhl",
    created_at: "2026-10-26T09:00:00Z", order_number: "ORD-9", business_order_number: "CE-BS-2026-0077",
    order_confirmation_number: "CE-AB-2026-000077", tracking_number: "TRK-9", cancellation_status: null, package_count: 3,
    package_lines: [{ quantity: 1, weight: 15, length: 20, width: 20, height: 20 }, { quantity: 2, weight: 8, length: 40, width: 30, height: 25 }] };
  const etikett = (o) => ({ type: "LABEL", category: "SHIPPING", status: "ready", ordinal: o, label: `Versandlabel ${o + 1} von 2`,
    carrierReference: `JD01460000000000${o}`, downloadPath: `/api/shipments/${CE_SHIPMENT_ID}/provider-documents/LABEL/${o}` });
  const json = (b) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  // Später registrierte Routen haben Vorrang vor der allgemeinen Attrappe aus setup().
  await page.route(/\/kunde\/shipments(\?|$)/, (r) => r.fulfill(json({ shipments: [sendung], nextCursor: null })));
  await page.route(/\/api\/shipments\/\d+\/documents$/, (r) => r.fulfill(json({ shipmentId: CE_SHIPMENT_ID,
    documents: [etikett(0), etikett(1)], packageLabelHint: "weight" })));
  await page.goto(`${BASE}/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
  const dokumente = page.getByRole("button", { name: "Dokumente" }).first();
  await dokumente.waitFor({ timeout: 20000 });
  assert.match(norm(await page.locator(".shipment-weight").first().textContent()), /^3 Pakete · 31 kg gesamt$/);
  await dokumente.click();
  await page.waitForSelector("#sdoc-label-hint", { timeout: 20000 });
  assert.equal(norm(await page.locator("#sdoc-label-hint").textContent()),
    "Jedes Versandlabel nennt das Gewicht seines Pakets (z. B. „2.0/10.0 kg“) sowie „Piece 1/2“. Bitte jedes Label auf das Paket mit diesem Gewicht kleben. Die Seite „WAYBILL DOC“ erhält der Fahrer.");
  assert.deepEqual(fehler, []);
  await page.close();
});
