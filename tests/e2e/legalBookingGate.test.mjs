// E2E: Legal-Buchungsschranke im Checkout (Go-Live Paket 4-B) — echter Dev-Server,
// gemocktes Backend.
//
// Es wird NIEMALS eine echte Bestellung ausgelöst: `/api/jumingo/book` ist abgefangen und
// antwortet mit einem Testergebnis; kein Request verlässt den Testrechner.
//
// Geprüft wird, was eine Quelltextprüfung nicht erreicht:
//   A — Schranke AUS: der heutige Checkout funktioniert unverändert, zwei Checkboxen, keine
//       neue Sperre, kein Legal-Feld im Payload.
//   B — Schranke AN: drei versionierte Dokumentlinks sichtbar, Datenschutz und
//       B2B-Vertragsinformationen OHNE Checkbox, Bestellung erst nach beiden Bestätigungen,
//       und der echte /book-Payload trägt setKey + genau zwei Flags.
//   C — Fassungswechsel: 409 LEGAL_SET_CHANGED zeigt die Meldung, lädt die neue Fassung,
//       leert beide Checkboxen — und löst KEINEN zweiten Buchungsversuch aus.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5253, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
  street: "Musterstraße 1", city: "Plochingen", phone: "+4971531234567",
};

const TARIFF = {
  id: 1, shipper_tariff_id: 1381, publicCarrierId: "ups", publicCarrierName: "UPS",
  publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
  netPrice: 10.69, vatAmount: 2.03, finalPrice: 12.72, transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-09-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-09-08T00:00:00Z", insuranceAvailable: false,
};

// Zwei Fassungen — C wechselt zwischen ihnen.
const SET = (stand) => ({
  enabled: true,
  setKey: `CE-B2B-${stand}`,
  documents: [
    { type: "terms", version: stand, label: "Allgemeine Geschäftsbedingungen", url: `/api/legal/terms/${stand}` },
    { type: "privacy", version: stand, label: "Datenschutzerklärung", url: `/api/legal/privacy/${stand}` },
    { type: "b2b_contract_information", version: stand, label: "B2B-Vertragsinformationen", url: `/api/legal/b2b_contract_information/${stand}` },
  ],
});

const DOCS      = ".booking-legal-docs";
const DOC_LINKS = ".booking-legal-docs-list a";
const AGB_BOX   = ".booking-agb-checkbox";
const BOOK_BTN  = ".booking-book-btn";

let server, browser;

async function setupRoutes(page, state) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/api/legal/booking-context")) {
      state.contextCalls += 1;
      return json(state.context());
    }
    if (p.endsWith("/book")) {
      state.bookCalls.push(JSON.parse(req.postData() || "{}"));
      // Erster Versuch kann laut Szenario mit einem Fassungswechsel abgelehnt werden.
      if (state.bookRejectsOnce && state.bookCalls.length === 1) {
        state.stand = "2026-09";                       // ab jetzt gilt die neue Fassung
        return json({ error: "Die Vertragsunterlagen wurden aktualisiert. Bitte prüfen und bestätigen Sie die aktuelle Fassung erneut.", code: "LEGAL_SET_CHANGED" }, 409);
      }
      return json({ success: true, shipmentId: "s1", ceShipmentId: 4711, orderNumber: "CE-BS-2026-0001", trackingNumber: "TRK-1" });
    }
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/cart-total")) return json({ voucher: { applied: false, code: null, reason: "invalid" } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", tariffs: [TARIFF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "ups", name: "UPS" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-09-07T09:00:00Z", availableUntil: "2026-09-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function neueSeite(opts = {}) {
  const state = {
    contextCalls: 0, bookCalls: [], stand: "2026-08",
    bookRejectsOnce: false, gateAus: false, ...opts,
  };
  state.context = () => (state.gateAus ? { enabled: false } : SET(state.stand));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await setupRoutes(page, state);
  return { ctx, page, state, fehler };
}

// Bis Schritt 2 der Buchung (dort stehen Bestätigungen und Bestellknopf).
async function zurBestelluebersicht(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  const fill = async (ph, v) => page.getByPlaceholder(ph, { exact: true }).first().fill(String(v));
  await page.locator("button", { hasText: "Eigene Adresse" }).first().click();
  await page.waitForTimeout(150);
  await page.locator("#ns-r-country").selectOption("DE");
  for (const [ph, v] of [
    ["Firma AG", "Empfang AG"], ["Erika Muster", "Erika Empfaenger"], ["Beispielweg 5", "Bahnhofstrasse 9"],
  ]) await fill(ph, v);
  const emp = page.locator(".booking-addr-grid > div").nth(1).locator("input.field-input");
  await emp.nth(4).fill("80331");
  await emp.nth(5).fill("Muenchen");
  for (const [id, v] of [["ns-packageCount", "1"], ["ns-weight", "5.5"],
                         ["ns-length", "40"], ["ns-width", "30"], ["ns-height", "20"]]) {
    await page.locator(`#${id}`).fill(v);
  }
  await page.waitForTimeout(250);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector("#booking-reference-toggle", { timeout: 20000 });
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(BOOK_BTN, { timeout: 20000 });
}

async function bestaetigeBeide(page) {
  const boxen = page.locator(AGB_BOX);
  await boxen.nth(0).check();
  await boxen.nth(1).check();
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
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
  if (server) server.kill("SIGTERM");
});

// ─────────────────────────────────────────────────────────────────────────────

test("SMOKE A — Schranke AUS: der heutige Checkout bleibt unverändert", async () => {
  const { ctx, page, state, fehler } = await neueSeite({ gateAus: true });
  await zurBestelluebersicht(page);

  // Genau zwei Checkboxen, kein Block „Vertragsunterlagen", keine neue Sperre.
  assert.equal(await page.locator(AGB_BOX).count(), 2, "es sind nicht genau zwei Bestätigungen");
  assert.equal(await page.locator(DOCS).count(), 0, "der Dokumentblock erscheint trotz ausgeschalteter Schranke");
  assert.equal(await page.locator(".booking-legal-error").count(), 0, "es steht ein Legal-Fehler da");

  await bestaetigeBeide(page);
  assert.equal(await page.locator(BOOK_BTN).isEnabled(), true, "der Bestellknopf bleibt gesperrt");

  await page.locator(BOOK_BTN).click();
  await page.waitForTimeout(1200);
  assert.equal(state.bookCalls.length, 1, "die Buchung wurde nicht abgesendet");
  // Der Payload trägt KEIN Legal-Feld — bei ausgeschalteter Schranke entsteht kein Nachweis.
  const payload = state.bookCalls[0];
  for (const feld of ["legalSetKey", "termsAccepted", "prohibitedGoodsAccepted"]) {
    assert.equal(feld in payload, false, `„${feld}" im Payload trotz ausgeschalteter Schranke`);
  }
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("SMOKE B — Schranke AN: drei versionierte Links, zwei Checkboxen, Payload", async () => {
  const { ctx, page, state, fehler } = await neueSeite();
  await zurBestelluebersicht(page);
  await page.waitForSelector(DOCS, { timeout: 15000 });

  // Drei Dokumente, jedes mit Fassung und eigener Adresse.
  const links = page.locator(DOC_LINKS);
  assert.equal(await links.count(), 3, "es werden nicht drei Dokumente angezeigt");
  const texte = await links.allInnerTexts();
  assert.deepEqual(texte, ["Allgemeine Geschäftsbedingungen", "Datenschutzerklärung", "B2B-Vertragsinformationen"]);
  const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  for (const [i, teil] of ["/api/legal/terms/2026-08", "/api/legal/privacy/2026-08",
    "/api/legal/b2b_contract_information/2026-08"].entries()) {
    assert.ok(String(hrefs[i]).endsWith(teil), `Link ${i} zeigt auf ${hrefs[i]}`);
  }
  const blockText = await page.locator(DOCS).innerText();
  assert.match(blockText, /Stand 2026-08/, "die Fassung wird nicht angezeigt");

  // IMMER NOCH genau zwei Checkboxen — Datenschutz und B2B bekommen keine.
  assert.equal(await page.locator(AGB_BOX).count(), 2,
    "Datenschutz oder B2B-Information hat eine Zustimmungscheckbox bekommen");

  // Ohne beide Bestätigungen ist der Bestellknopf gesperrt.
  assert.equal(await page.locator(BOOK_BTN).isEnabled(), false, "ohne Bestätigung bestellbar");
  await bestaetigeBeide(page);
  assert.equal(await page.locator(BOOK_BTN).isEnabled(), true);

  await page.locator(BOOK_BTN).click();
  await page.waitForTimeout(1200);
  assert.equal(state.bookCalls.length, 1);
  const payload = state.bookCalls[0];
  assert.equal(payload.legalSetKey, "CE-B2B-2026-08", "der gesehene Setschlüssel fehlt");
  assert.equal(payload.termsAccepted, true);
  assert.equal(payload.prohibitedGoodsAccepted, true);
  // Weder Zeitpunkt noch Dokument-ID: beides bestimmt der Server.
  for (const feld of ["acceptedAt", "legalSetId", "legalDocumentIds", "privacyAccepted"]) {
    assert.equal(feld in payload, false, `„${feld}" gehört nicht in den Payload`);
  }
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("SMOKE C — 409 LEGAL_SET_CHANGED: neue Fassung, leere Checkboxen, KEIN Auto-Retry", async () => {
  const { ctx, page, state, fehler } = await neueSeite({ bookRejectsOnce: true });
  await zurBestelluebersicht(page);
  await page.waitForSelector(DOCS, { timeout: 15000 });
  assert.match(await page.locator(DOCS).innerText(), /Stand 2026-08/);

  await bestaetigeBeide(page);
  const vorherContextCalls = state.contextCalls;
  await page.locator(BOOK_BTN).click();

  // Die neue Fassung erscheint — der Kontext wurde nachgeladen.
  await page.waitForFunction(
    () => document.querySelector(".booking-legal-docs")?.innerText.includes("2026-09"),
    undefined, { timeout: 15000 });
  assert.ok(state.contextCalls > vorherContextCalls, "der Kontext wurde nicht neu geladen");

  // Beide Bestätigungen sind zurückgesetzt — eine Zustimmung zu A gilt nicht für B.
  const boxen = page.locator(AGB_BOX);
  assert.equal(await boxen.nth(0).isChecked(), false, "die AGB-Bestätigung blieb gesetzt");
  assert.equal(await boxen.nth(1).isChecked(), false, "die Güterbestätigung blieb gesetzt");
  assert.equal(await page.locator(BOOK_BTN).isEnabled(), false,
    "nach dem Fassungswechsel ist die Bestellung weiterhin möglich");

  // Die Meldung nennt die Handlung, nicht den Fehlercode.
  const seite = await page.locator(".booking-panel, .calc-panel").first().innerText();
  assert.match(seite, /Vertragsunterlagen wurden aktualisiert/, "die Meldung fehlt");
  assert.ok(!/LEGAL_SET_CHANGED|409/.test(seite), "der technische Code steht in der Oberfläche");

  // Und der entscheidende Punkt: es gab KEINEN zweiten Buchungsversuch von allein.
  await page.waitForTimeout(1500);
  assert.equal(state.bookCalls.length, 1,
    `automatischer Wiederholungsversuch: ${state.bookCalls.length} Buchungsaufrufe`);
  assert.deepEqual(fehler, []);
  await ctx.close();
});
