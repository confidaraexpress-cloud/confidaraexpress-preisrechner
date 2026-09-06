// E2E: Gutscheinfeld im Buchungsschritt 2 — echter Dev-Server, gemocktes Backend.
//
// Es wird NIEMALS eine echte Bestellung ausgelöst: sowohl /api/jumingo/cart-total als auch
// /api/jumingo/book sind abgefangen; kein Request verlässt den Testrechner.
//
// Geprüft wird, was eine Quelltextprüfung nicht erreicht: die tatsächliche Position im Layout,
// was der Nutzer sieht, was nach dem Entfernen wieder dasteht, ob eine preisrelevante Änderung
// den Gutschein wirklich verwirft, wie sich das Feld auf 390 px verhält und was am Ende
// wirklich im /book-Payload steht.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
// Warum dieser Test zwischenzeitlich vollständig rot war — und niemand es bemerkt hat:
// Er stand NICHT in `npm run test:e2e` (package.json). Dadurch liefen zwei spätere Pakete
// an ihm vorbei: „Paketmaße sind Pflicht" stellte die Platzhalter auf „z. B. 5" um (die
// Selektoren trafen nichts mehr), und „Neue Sendung startet leer" entfernte den
// automatischen Profil-Seed (Absender und Empfängerland blieben leer, der CTA dauerhaft
// deaktiviert). Beides ist unten korrigiert; der Test ist jetzt registriert.

const PORT = 5260, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// Die Anschrift ist VOLLSTÄNDIG, damit die Komfortaktion „Eigene Adresse" den Absender
// wirklich füllen kann. Seit dem Paket „Neue Sendung startet leer" gibt es keinen
// automatischen Profil-Seed mehr — ohne vollständige Profildaten bliebe der Absender leer
// und der Preisrechner-CTA dauerhaft deaktiviert.
const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
  street: "Musterstraße 1", city: "Plochingen", phone: "+4971531234567",
};

// Beträge wie im Auftragsbeispiel: 8,91 € Einkauf netto → 10,69 € CE netto → 12,72 € CE brutto.
const TARIFF = {
  id: 1, shipper_tariff_id: 1381, publicCarrierId: "ups", publicCarrierName: "UPS",
  publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
  netPrice: 10.69, vatAmount: 2.03, finalPrice: 12.72, transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-09-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-09-08T00:00:00Z",
  // Versicherbar, damit Smoke 5 eine echte PREISRELEVANTE Auswahl zum Umschalten hat.
  insuranceAvailable: true,
  insuranceDetails: {
    isInsurable: true, insuranceValue: 500,
    extraInsurancePriceBruttoPreselect: 2.5, extraInsurancePremiumPriceBruttoPreselect: 4.9,
  },
};

// Die serverbestätigte Gutscheinantwort (Allowlist des Preview-Endpunkts).
const VOUCHER_OK = {
  shipmentId: "s1",
  voucher: { applied: true, code: "jumingo-sandbox", percent: 100, reason: null },
  totals: {
    subtotalNet: 10.69, subtotalVat: 2.03, subtotalGross: 12.72,
    discountGross: 12.72, finalNet: 0, finalVat: 0, finalGross: 0,
  },
  testBooking: true,
};
const VOUCHER_INVALID = { voucher: { applied: false, code: null, reason: "invalid" } };

const VOUCHER_INPUT  = ".booking-voucher-input";
const VOUCHER_APPLY  = ".booking-voucher-apply";
const VOUCHER_MSG    = ".booking-voucher-msg";
const VOUCHER_DONE   = ".booking-voucher--applied";

let server, browser;

// `voucherMode` steuert, was der gemockte Preview-Endpunkt antwortet.
async function setupRoutes(page, { voucherMode = "ok" } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    // Legal-Buchungsschranke (Go-Live Paket 4-B): `enabled:false` ist die
    // Antwort eines Servers mit ABGESCHALTETER Schranke — der heutige
    // Produktivzustand. Ohne diese Antwort liefe der Mock in den Sammelfall
    // `200 {}`; `parseBookingContext` wertet das fail-closed als `error` und
    // sperrt die Bestellung. Das ist richtiges Produktverhalten und darf nicht
    // aufgeweicht werden — die Suite muss den Endpunkt schlicht beantworten.
    // Beide Zustände der Schranke prüft `legalBookingGate.test.mjs`.
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/cart-total")) {
      if (voucherMode === "error") return json({ error: "Preisprüfung fehlgeschlagen" }, 502);
      if (voucherMode === "invalid") return json(VOUCHER_INVALID);
      return json(VOUCHER_OK);
    }
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

// Bis Schritt 2 der Buchung (dort steht die Bestellübersicht mit dem Gutscheinfeld).
async function zurBestelluebersicht(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });

  // ABSENDER über die sichtbare Komfortaktion — genau den Weg nimmt auch der Kunde,
  // seit „Neue Sendung" leer startet und es keinen automatischen Profil-Seed mehr gibt.
  const eigene = page.locator("button", { hasText: "Eigene Adresse" }).first();
  await eigene.click();
  await page.waitForTimeout(150);

  // EMPFÄNGER: das Land startet ebenfalls leer und muss ausdrücklich gewählt werden.
  await page.locator("#ns-r-country").selectOption("DE");
  // Ueber die STABILEN ids statt ueber Platzhalter und Feldpositionen. Beide Zugriffe
  // sind mit dem Versandkontaktvertrag gebrochen: der Platzhalter des Namensfeldes gibt
  // es nicht mehr (aus einem Feld wurden zwei), und `nth(4)`/`nth(5)` zaehlten Eingaben
  // in DOM-Reihenfolge — zwei zusaetzliche Felder haben sie still verschoben.
  for (const [id, v] of [
    ["ns-r-company",   "Empfang AG"],
    ["ns-r-firstName", "Erika"], ["ns-r-lastName", "Empfaenger"],
    ["ns-r-email",     "erika@example.com"], ["ns-r-phone", "+49891234567"],
    ["ns-r-street",    "Bahnhofstrasse 9"],
    ["ns-r-zip",       "80331"], ["ns-r-city", "Muenchen"],
  ]) await page.locator(`#${id}`).fill(v);
  // Der Profil-Seed („Eigene Adresse") traegt Firma, Anschrift und E-Mail des Kontos —
  // aber keine getrennte Kontaktperson und keine Telefonnummer: das Konto fuehrt einen
  // einzelnen Ansprechpartnernamen, und der wird nicht zerlegt. Beides wird deshalb
  // ausdruecklich ergaenzt, so wie es auch ein Kunde tun muss.
  for (const [id, v] of [
    ["ns-s-firstName", "Max"], ["ns-s-lastName", "Mustermann"],
    ["ns-s-phone",     "+49301234567"], ["ns-s-email", "max@example.com"],
  ]) await page.locator(`#${id}`).fill(v);

  // Paketfelder über ihre ids. Die Platzhalter tragen seit dem Paket „Paketmaße sind
  // Pflicht" ein „z. B." davor und taugen nicht mehr als Selektor; die ids sind stabil.
  // Alle fünf Felder sind Pflicht, sonst bleibt der CTA deaktiviert.
  for (const [id, v] of [["ns-packageCount", "2"], ["ns-weight", "5.5"],
                         ["ns-length", "40"], ["ns-width", "30"], ["ns-height", "20"]]) {
    await page.locator(`#${id}`).fill(v);
  }
  await page.waitForTimeout(250);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector("#booking-reference-toggle", { timeout: 20000 });
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(VOUCHER_INPUT, { timeout: 20000 });
}

async function wendeAn(page, code) {
  await page.locator(VOUCHER_INPUT).fill(code);
  await page.locator(VOUCHER_APPLY).click();
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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`,
    // das seinerseits node startet. Ein Signal an den npx-Prozess laesst
    // den Enkel — den eigentlichen Dev-Server — auf seinem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

/* ══════════ Smoke 1 — Position ══════════ */

test("Smoke 1 — das Gutscheinfeld steht unter der Preisübersicht und vor Bestätigungen/Bestellknopf", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBestelluebersicht(page);

  const y = async (sel) => (await page.locator(sel).first().boundingBox()).y;
  const preisY   = await y(".booking-payment-note");   // letzte Zeile der Preisaufstellung
  const gutY     = await y(".booking-voucher");
  const agbY     = await y(".booking-agb-label");
  const buchenY  = await y(".booking-book-btn");

  assert.ok(gutY > preisY, `Gutschein (${gutY}) muss UNTER der Preisübersicht (${preisY}) stehen`);
  assert.ok(gutY < agbY,   `Gutschein (${gutY}) muss ÜBER den Bestätigungen (${agbY}) stehen`);
  assert.ok(gutY < buchenY, `Gutschein (${gutY}) muss ÜBER dem Bestellknopf (${buchenY}) stehen`);
  await page.close();
});

/* ══════════ Smoke 2 — gültiger Sandbox-Gutschein ══════════ */

test("Smoke 2 — bestätigter Gutschein zeigt 100 %, Rabatt und 0,00 € zu zahlen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { voucherMode: "ok" });
  await zurBestelluebersicht(page);

  // Vorher: der normale Gesamtbetrag.
  const vorher = await page.locator(".booking-confirm-box").innerText();
  assert.match(vorher, /Gesamtbetrag brutto/);
  assert.match(vorher, /12,72/);

  await wendeAn(page, "jumingo-sandbox");
  await page.waitForSelector(VOUCHER_DONE, { timeout: 10000 });

  const angewendet = await page.locator(VOUCHER_DONE).innerText();
  assert.match(angewendet, /Gutschein angewendet/);
  assert.match(angewendet, /jumingo-sandbox/);
  assert.match(angewendet, /100 %/);

  const karte = await page.locator(".booking-confirm-box").innerText();
  assert.match(karte, /Zwischensumme/, "Zwischensumme muss erscheinen");
  assert.match(karte, /12,72/,        "der ursprüngliche Betrag bleibt sichtbar");
  assert.match(karte, /−\s?12,72|-\s?12,72/, "die Rabattzeile muss den Abzug zeigen");
  assert.match(karte, /Zu zahlen/,    "„Zu zahlen“ muss erscheinen");
  assert.match(karte, /0,00\s?€/,     "0,00 € muss ausgewiesen sein");
  assert.ok(!/Gesamtbetrag brutto/.test(karte), "der alte Gesamtbetrag darf nicht danebenstehen");

  // 0 darf nirgends als leeres Feld, „—“ oder NaN erscheinen.
  assert.ok(!/NaN/.test(karte), "kein NaN");
  assert.ok(!/Zu zahlen\s*\n?\s*—/.test(karte), "kein Gedankenstrich statt 0,00 €");

  // Testlabel-Warnung muss erscheinen.
  const seite = await page.locator(".booking-confirm-box, .booking-test-note").allInnerTexts();
  assert.ok(seite.join(" ").includes("Testlabel"), "der Testlabel-Hinweis muss sichtbar sein");
  await page.close();
});

/* ══════════ Smoke 3 — ungültiger Code ══════════ */

test("Smoke 3 — ungültiger Code: verständliche Meldung, Preis bleibt unverändert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { voucherMode: "invalid" });
  await zurBestelluebersicht(page);

  await wendeAn(page, "ce-invalid-voucher-probe-0000");
  await page.waitForSelector(VOUCHER_MSG, { timeout: 10000 });

  const msg = await page.locator(VOUCHER_MSG).innerText();
  assert.match(msg, /konnte nicht angewendet werden/);
  // Keine Interna in der Meldung.
  for (const verboten of ["JUMiNGO", "jumingo", "500", "502", "Tarif", "admin", "Rolle", "shipment"]) {
    assert.ok(!msg.includes(verboten), `Meldung darf „${verboten}“ nicht nennen: ${msg}`);
  }
  const karte = await page.locator(".booking-confirm-box").innerText();
  assert.match(karte, /Gesamtbetrag brutto/, "der normale Gesamtbetrag muss stehen bleiben");
  assert.match(karte, /12,72/);
  assert.ok(!/Zu zahlen/.test(karte), "keine Rabattdarstellung ohne Bestätigung");

  // Der Bestellknopf bleibt bedienbar — ohne Gutschein weiterbuchen muss möglich sein.
  assert.equal(await page.locator(".booking-book-btn").isDisabled(), true,
    "ohne Bestätigungen ist der Knopf erwartungsgemäß noch gesperrt");
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  assert.equal(await page.locator(".booking-book-btn").isDisabled(), false,
    "nach den Bestätigungen muss ohne Gutschein normal buchbar sein");
  await page.close();
});

/* ══════════ Smoke 4 — Entfernen ══════════ */

test("Smoke 4 — Entfernen stellt die normale Preisübersicht vollständig wieder her", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { voucherMode: "ok" });
  await zurBestelluebersicht(page);

  await wendeAn(page, "jumingo-sandbox");
  await page.waitForSelector(VOUCHER_DONE, { timeout: 10000 });
  await page.locator(".booking-voucher-remove").click();
  await page.waitForSelector(VOUCHER_INPUT, { timeout: 10000 });

  const karte = await page.locator(".booking-confirm-box").innerText();
  assert.match(karte, /Gesamtbetrag brutto/, "der Gesamtbetrag muss zurück sein");
  assert.match(karte, /12,72/);
  assert.ok(!/Zu zahlen/.test(karte),   "keine „Zu zahlen“-Zeile mehr");
  assert.ok(!/Zwischensumme/.test(karte), "keine Zwischensumme mehr");
  assert.ok(!/0,00\s?€/.test(karte),    "kein 0,00 € mehr");
  assert.equal(await page.locator(".booking-test-note").count(), 0, "kein Testlabel-Hinweis mehr");
  assert.equal(await page.locator(VOUCHER_INPUT).inputValue(), "", "das Eingabefeld muss geleert sein");
  await page.close();
});

/* ══════════ Smoke 5 — Invalidierung unterscheidet richtig ══════════ */

// Zwei Richtungen in einem Lauf — beide sind wichtig:
//   (a) Eine NICHT preisrelevante Eingabe (Referenznummer) darf den Gutschein NICHT verwerfen.
//       Ein überschießender Verfall wäre für den Nutzer genauso störend wie ein fehlender.
//   (b) Eine PREISRELEVANTE Änderung (Paketgewicht → neue Preisberechnung) verwirft ihn.
// Die feldweise Regel selbst ist in src/utils/voucherUx.test.mjs über ALLE Schlüssel geprüft;
// hier geht es um das tatsächlich sichtbare Verhalten im Browser.
test("Smoke 5 — Referenznummer behält den Gutschein, eine Preisänderung verwirft ihn", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { voucherMode: "ok" });
  await zurBestelluebersicht(page);

  await wendeAn(page, "jumingo-sandbox");
  await page.waitForSelector(VOUCHER_DONE, { timeout: 10000 });

  // (a) Zurück zu Schritt 1, Referenznummer einschalten und befüllen — NICHT preisrelevant.
  await page.getByRole("button", { name: /Zurück zur Übersicht/ }).click();
  await page.waitForSelector("#booking-reference-toggle", { timeout: 20000 });
  const toggle = page.locator("#booking-reference-toggle");
  if (!(await toggle.isChecked())) await toggle.locator("xpath=ancestor::label[1]").click();
  await page.locator("#booking-reference").fill("Bestellung 4711");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(VOUCHER_DONE).count(), 1,
    "eine Referenznummer darf den Gutschein NICHT verwerfen");
  assert.match(await page.locator(".booking-confirm-box").innerText(), /Zu zahlen/);

  // (b) Preisrelevante Änderung: zurück in „Neue Sendung", Gewicht ändern, neu berechnen.
  //
  // Der Weg zurück läuft über den SICHTBAREN „← Zurück"-Button, NICHT über page.goto().
  // Seit „Neue Sendung startet leer" lebt der Vorgang ausschließlich im Arbeitsspeicher:
  // ein vollständiger Seitenaufbau (goto/Reload) verwirft ihn samt Formular, und der Test
  // hätte danach ein leeres Formular vor sich statt einer preisrelevanten ÄNDERUNG.
  // Die SPA-Navigation erhält den Vorgang — genau wie beim echten Nutzer.
  await page.getByRole("button", { name: /Zurück zur Übersicht/ }).click();
  await page.waitForSelector("#booking-reference-toggle", { timeout: 20000 });
  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await page.locator("#ns-weight").fill("9.5");
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector("#booking-reference-toggle", { timeout: 20000 });
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(VOUCHER_INPUT, { timeout: 20000 });

  assert.equal(await page.locator(VOUCHER_DONE).count(), 0,
    "nach einer preisrelevanten Änderung darf kein bestätigter Gutschein mehr stehen");
  const karte = await page.locator(".booking-confirm-box").innerText();
  assert.match(karte, /Gesamtbetrag brutto/, "der reguläre Gesamtbetrag muss wieder dastehen");
  assert.ok(!/Zu zahlen/.test(karte), "keine Rabattdarstellung mehr");
  assert.equal(await page.locator(".booking-test-note").count(), 0, "kein Testlabel-Hinweis mehr");
  await page.close();
});

/* ══════════ Smoke 6 — 390 px ══════════ */

test("Smoke 6 — auf 390 px kein Überlauf, Eingabe und Knopf bleiben bedienbar", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await setupRoutes(page, { voucherMode: "ok" });
  await zurBestelluebersicht(page);

  const scrollBreite = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(scrollBreite <= 390 + 1, `kein horizontaler Überlauf erwartet, gemessen ${scrollBreite}px`);

  const eingabe = await page.locator(VOUCHER_INPUT).boundingBox();
  const knopf   = await page.locator(VOUCHER_APPLY).boundingBox();
  assert.ok(eingabe.x >= -1 && eingabe.x + eingabe.width <= 391, "die Eingabe muss im Bild liegen");
  assert.ok(knopf.x >= -1 && knopf.x + knopf.width <= 391, "der Knopf muss im Bild liegen");
  assert.ok(knopf.height >= 40, `Trefferfläche zu klein: ${knopf.height}px`);

  await wendeAn(page, "jumingo-sandbox");
  await page.waitForSelector(VOUCHER_DONE, { timeout: 10000 });
  const nachher = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(nachher <= 390 + 1, `nach dem Anwenden kein Überlauf erwartet, gemessen ${nachher}px`);

  // Die Preiszeilen bleiben lesbar (nichts abgeschnitten).
  const karte = await page.locator(".booking-confirm-box").innerText();
  assert.match(karte, /Zu zahlen/);
  assert.match(karte, /0,00\s?€/);
  await page.close();
});

/* ══════════ Smoke 7 — /book-Payload ══════════ */

test("Smoke 7 — der /book-Payload trägt NUR den Code, keine selbst berechneten Beträge", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { voucherMode: "ok" });
  await zurBestelluebersicht(page);

  await wendeAn(page, "jumingo-sandbox");
  await page.waitForSelector(VOUCHER_DONE, { timeout: 10000 });

  let payload = null;
  await page.route("**/api/jumingo/book**", async (route) => {
    payload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ shipmentId: "s1", ceShipmentId: 7, trackingNumber: "TRACK1",
                             amount: 0, testBooking: true, voucherCode: "jumingo-sandbox" }),
    });
  });
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForTimeout(1500);

  assert.ok(payload, "der /book-Request muss abgesetzt worden sein");
  assert.equal(payload.voucherCode, "jumingo-sandbox", "der Code muss mitgehen");
  for (const verboten of ["discount", "discountGross", "voucherPercent", "voucherValue",
                          "finalGross", "subtotalGross", "gross", "net", "vat", "testBooking"]) {
    assert.ok(!(verboten in payload), `${verboten} darf NICHT im Payload stehen (gefunden: ${payload[verboten]})`);
  }
  // price_final bleibt das bestehende Drift-Gate und ist KEIN Rabattwert.
  assert.equal(payload.price_final, 12.72,
    "price_final bleibt der reguläre Anzeigepreis (Drift-Gate), nicht 0");
  await page.close();
});

/* ══════════ Smoke 8 — kein Rabatt ohne Serverbestätigung ══════════ */

test("Smoke 8 — bei Serverfehler entsteht KEIN 0-Euro-Zustand", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { voucherMode: "error" });
  await zurBestelluebersicht(page);

  await wendeAn(page, "jumingo-sandbox");
  await page.waitForSelector(VOUCHER_MSG, { timeout: 10000 });

  const karte = await page.locator(".booking-confirm-box").innerText();
  assert.match(karte, /Gesamtbetrag brutto/, "der reguläre Preis muss bestehen bleiben");
  assert.match(karte, /12,72/);
  assert.ok(!/0,00\s?€/.test(karte), "ohne Serverbestätigung darf nirgends 0,00 € stehen");
  assert.equal(await page.locator(VOUCHER_DONE).count(), 0, "kein „angewendet“-Zustand");
  assert.equal(await page.locator(".booking-test-note").count(), 0, "kein Testlabel-Hinweis");
  await page.close();
});
