// E2E: Zusatzempfänger für Versandinformationen — echter Dev-Server.
//
// Zwei neue Optionen im Bereich „Zusätzliche Optionen": Tracking-Link bzw.
// Versandlabel + Tracking-Link an eine weitere Adresse. Geprüft wird, was eine
// Quelltextprüfung nicht erreicht: was sichtbar ist, was die Validierung
// blockiert, was nach einer Rückkehr noch da ist — und vor allem, was am Ende
// tatsächlich im /book-Request steht.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5259, BASE = `http://127.0.0.1:${PORT}`;

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

const TRACK_TOGGLE = "#booking-tracking-email-toggle";
const LABEL_TOGGLE = "#booking-label-email-toggle";
const TRACK_INPUT  = "#booking-tracking-email-toggle-input";
const LABEL_INPUT  = "#booking-label-email-toggle-input";

let server, browser;

async function setupRoutes(page) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
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
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", tariffs: [TARIFF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

// Die Schaltereingaben sind visuell versteckt (Muster wie .labelfmt-card) —
// bedient wird über ihr Label, genau wie ein Mensch es tut.
async function schalte(page, sel, an) {
  const input = page.locator(sel);
  if ((await input.isChecked()) === an) return;
  await input.locator("xpath=ancestor::label[1]").click();
  assert.equal(await input.isChecked(), an, `Schalter ${sel} ließ sich nicht auf ${an} setzen`);
}

async function zurBuchung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(TRACK_TOGGLE, { timeout: 20000 });
}

// Buchung durchspielen und den echten /book-Payload zurückgeben.
async function bucheUndLiesPayload(page) {
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  let payload = null;
  await page.route("**/api/jumingo/book**", async (route) => {
    payload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ shipmentId: "s1", trackingNumber: "TRACK1", labelUrl: null }),
    });
  });
  const checks = page.getByRole("checkbox"); // AGB + Gefahrgut (die Schalter tragen role=switch)
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForTimeout(1200);
  return payload;
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

/* ══════════ Szenario 1 — Grundzustand ══════════ */

test("1 — beide Optionen sind aus, kein Feld im DOM", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  assert.equal(await page.locator(TRACK_TOGGLE).isChecked(), false);
  assert.equal(await page.locator(LABEL_TOGGLE).isChecked(), false);
  assert.equal(await page.locator(TRACK_INPUT).count(), 0, "kein Trackingfeld im Grundzustand");
  assert.equal(await page.locator(LABEL_INPUT).count(), 0, "kein Labelfeld im Grundzustand");
  // Die vier Optionen stehen in der vorgesehenen Reihenfolge.
  const texte = await page.locator(".addopt-panel .ce-switch-label").allInnerTexts();
  assert.deepEqual(texte, [
    "Eigene Referenznummer hinzufügen",
    "Tracking-Link an weitere E-Mail-Adresse senden",
    "Versandlabel & Tracking-Link an weitere E-Mail-Adresse senden",
    "Versandlabel-Format ändern",
  ]);
  await page.close();
});

test("2 — Szenario 1: ohne Zusatzoption bleibt der Buchungsvertrag unverändert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);
  const payload = await bucheUndLiesPayload(page);

  assert.ok(payload, "der /book-Request muss abgesetzt worden sein");
  assert.ok(!("trackingEmail" in payload), "ohne Option darf kein Feld mitgehen");
  assert.ok(!("labelTrackingEmail" in payload));
  // Die bestehenden Felder sind unberührt.
  assert.equal(payload.labelFormat, "A4");
  assert.equal(payload.shipmentId, "s1");
  await page.close();
});

/* ══════════ Sichtbarkeit und Werterhalt ══════════ */

test("3 — Einschalten zeigt das Feld, Ausschalten verbirgt es", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, TRACK_TOGGLE, true);
  await assert.ok(await page.locator(TRACK_INPUT).isVisible());
  assert.equal(await page.locator(TRACK_INPUT).getAttribute("type"), "email");
  assert.equal(await page.locator(TRACK_INPUT).getAttribute("placeholder"), "name@unternehmen.de");
  // Die zweite Option bleibt davon unberührt.
  assert.equal(await page.locator(LABEL_INPUT).count(), 0, "die Optionen sind unabhängig");

  await schalte(page, TRACK_TOGGLE, false);
  assert.equal(await page.locator(TRACK_INPUT).count(), 0);
  await page.close();
});

test("4 — der eingegebene Wert überlebt Aus- und Wiedereinschalten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, TRACK_TOGGLE, true);
  await page.locator(TRACK_INPUT).fill("logistik@example.de");
  await schalte(page, TRACK_TOGGLE, false);
  await schalte(page, TRACK_TOGGLE, true);
  assert.equal(await page.locator(TRACK_INPUT).inputValue(), "logistik@example.de");
  await page.close();
});

/* ══════════ Validierung ══════════ */

test("5 — Szenario 6: leere Adresse bei aktiver Option blockiert die Buchung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, TRACK_TOGGLE, true);
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(300);

  assert.ok(await page.locator(TRACK_TOGGLE).isVisible(), "wir müssen auf Schritt 1 bleiben");
  assert.ok(await page.locator(".field-error").first().isVisible(), "der Feldfehler muss sichtbar sein");
  assert.equal(await page.locator(TRACK_INPUT).getAttribute("aria-invalid"), "true");
  await page.close();
});

test("6 — Szenario 6: ungültige Adresse blockiert, gültige lässt weiter", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, LABEL_TOGGLE, true);
  await page.locator(LABEL_INPUT).fill("kein-at-zeichen");
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(300);
  assert.ok(await page.locator(LABEL_TOGGLE).isVisible(), "ungültig darf nicht weiterlassen");
  assert.match(await page.locator(".field-error").first().innerText(), /gültige E-Mail-Adresse/);

  await page.locator(LABEL_INPUT).fill("lager@example.de");
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  assert.ok(await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).isVisible(),
    "mit gültiger Adresse muss Schritt 2 erscheinen");
  await page.close();
});

test("7 — ein ausgeschalteter, ungültiger Restwert blockiert NICHT", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, TRACK_TOGGLE, true);
  await page.locator(TRACK_INPUT).fill("voelliger-unsinn");
  await schalte(page, TRACK_TOGGLE, false);

  const payload = await bucheUndLiesPayload(page);
  assert.ok(payload, "die Buchung darf nicht blockiert werden");
  assert.ok(!("trackingEmail" in payload), "der ausgeschaltete Wert darf nicht gesendet werden");
  await page.close();
});

/* ══════════ Payload (Szenarien 2–5) ══════════ */

test("8 — Szenario 2: nur Tracking aktiviert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, TRACK_TOGGLE, true);
  await page.locator(TRACK_INPUT).fill("tracking@example.de");
  const payload = await bucheUndLiesPayload(page);

  assert.equal(payload.trackingEmail, "tracking@example.de");
  assert.ok(!("labelTrackingEmail" in payload));
  // Kein UI-Zustand im Vertrag.
  assert.ok(!Object.keys(payload).some(k => /Enabled$/.test(k)), Object.keys(payload).join(","));
  await page.close();
});

test("9 — Szenario 3: nur Label+Tracking aktiviert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, LABEL_TOGGLE, true);
  await page.locator(LABEL_INPUT).fill("lager@example.de");
  const payload = await bucheUndLiesPayload(page);

  assert.equal(payload.labelTrackingEmail, "lager@example.de");
  assert.ok(!("trackingEmail" in payload));
  await page.close();
});

test("10 — Szenario 4: beide mit verschiedenen Adressen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, TRACK_TOGGLE, true);
  await page.locator(TRACK_INPUT).fill("tracking@example.de");
  await schalte(page, LABEL_TOGGLE, true);
  await page.locator(LABEL_INPUT).fill("lager@example.de");
  const payload = await bucheUndLiesPayload(page);

  assert.equal(payload.trackingEmail, "tracking@example.de");
  assert.equal(payload.labelTrackingEmail, "lager@example.de");
  await page.close();
});

test("11 — Szenario 5: beide mit derselben Adresse (Dedup entscheidet serverseitig)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, TRACK_TOGGLE, true);
  await page.locator(TRACK_INPUT).fill("logistik@example.de");
  await schalte(page, LABEL_TOGGLE, true);
  await page.locator(LABEL_INPUT).fill("logistik@example.de");
  const payload = await bucheUndLiesPayload(page);

  // Das Frontend meldet beide Wünsche ehrlich; welche EINE Mail daraus wird,
  // entscheidet das Backend (planShipmentEmails) — nicht die Oberfläche.
  assert.equal(payload.trackingEmail, "logistik@example.de");
  assert.equal(payload.labelTrackingEmail, "logistik@example.de");
  await page.close();
});

/* ══════════ Szenario 7 — Wiederherstellung ══════════ */

test("12 — Szenario 7: Optionen und Werte überleben die Zurücknavigation", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, TRACK_TOGGLE, true);
  await page.locator(TRACK_INPUT).fill("tracking@example.de");
  await schalte(page, LABEL_TOGGLE, true);
  await page.locator(LABEL_INPUT).fill("lager@example.de");
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: /Zurück/ }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(TRACK_TOGGLE, { timeout: 20000 });

  assert.equal(await page.locator(TRACK_TOGGLE).isChecked(), true);
  assert.equal(await page.locator(TRACK_INPUT).inputValue(), "tracking@example.de");
  assert.equal(await page.locator(LABEL_TOGGLE).isChecked(), true);
  assert.equal(await page.locator(LABEL_INPUT).inputValue(), "lager@example.de");
  await page.close();
});

test("13 — eine ausgeschaltete Option bleibt nach der Rückkehr ausgeschaltet", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  await schalte(page, TRACK_TOGGLE, true);
  await page.locator(TRACK_INPUT).fill("weg@example.de");
  await schalte(page, TRACK_TOGGLE, false);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: /Zurück/ }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(TRACK_TOGGLE, { timeout: 20000 });

  assert.equal(await page.locator(TRACK_TOGGLE).isChecked(), false,
    "ein bewusst geschlossener Bereich darf nicht wieder offen stehen");
  assert.equal(await page.locator(TRACK_INPUT).count(), 0);
  await page.close();
});

/* ══════════ Bedienbarkeit ══════════ */

test("14 — beide Schalter sind per Tastatur und per Labelklick bedienbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await zurBuchung(page);

  for (const sel of [TRACK_TOGGLE, LABEL_TOGGLE]) {
    const schalter = page.locator(sel);
    assert.equal(await schalter.getAttribute("role"), "switch");
    await schalter.focus();
    await page.keyboard.press(" ");
    assert.equal(await schalter.isChecked(), true, `${sel}: Leertaste muss schalten`);
    await page.keyboard.press(" ");
    assert.equal(await schalter.isChecked(), false);
    // Fokus sichtbar auf der Spur (die Eingabe selbst ist versteckt).
    assert.equal(await page.locator(`${sel} ~ .ce-switch-track`).evaluate(el => getComputedStyle(el).outlineStyle), "solid");
  }
  // exact: true ist nötig — „Versandlabel & Tracking-Link an weitere E-Mail-Adresse
  // senden" enthält den kürzeren Text vollständig.
  await page.getByText("Tracking-Link an weitere E-Mail-Adresse senden", { exact: true }).click();
  assert.equal(await page.locator(TRACK_TOGGLE).isChecked(), true, "Labelklick muss schalten");
  await page.close();
});

/* ══════════ Trackinglink der Mail ══════════ */

test("15 — der Trackinglink aus der Mail sucht direkt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  let angefragt = null;
  await page.route("**/api/tracking/public/**", async (route) => {
    angefragt = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop());
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ shipmentId: "s1", tracking: { data: { tracking_number: "1Z999", status: "delivered", steps: [] } } }),
    });
  });
  await page.goto(`${BASE}/tracking?nummer=1Z999AA10123456784`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  assert.equal(angefragt, "1Z999AA10123456784", "der Deep-Link muss die Nummer direkt suchen");
  assert.equal(await page.locator('input[type="text"], .field-input').first().inputValue(), "1Z999AA10123456784",
    "die Nummer muss im Feld stehen");
  await page.close();
});

test("16 — ohne Parameter bleibt die Trackingseite unverändert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  let angefragt = false;
  await page.route("**/api/tracking/public/**", async (route) => { angefragt = true; await route.fulfill({ status: 200, body: "{}" }); });
  await page.goto(`${BASE}/tracking`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  assert.equal(angefragt, false, "ohne Nummer darf nichts gesucht werden");
  await page.close();
});

/* ══════════ Responsive ══════════ */

test("17 — lange Texte brechen sauber um, 44px Trefferfläche, kein Überlauf", async () => {
  for (const [w, h] of [[1440, 1100], [430, 932], [390, 844], [360, 800]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await setupRoutes(page);
    await zurBuchung(page);

    const keinUeberlauf = () => page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    assert.ok(await keinUeberlauf(), `Überlauf im Grundzustand bei ${w}px`);

    // Die längste Zeile darf nicht abgeschnitten werden und der Schalter nicht schrumpfen.
    const zeile = page.locator(LABEL_TOGGLE).locator("xpath=ancestor::label[1]");
    const box = await zeile.boundingBox();
    if (w <= 860) assert.ok(box.height >= 44, `Schalterzeile nur ${box.height}px bei ${w}px`);
    // Der Schalter ist bewusst klein (32×18). Geprüft wird, dass er auf keiner
    // Breite darunter gedrückt wird — die Trefferfläche liefert die Zeile.
    const spur = await page.locator(`${LABEL_TOGGLE} ~ .ce-switch-track`).boundingBox();
    assert.ok(spur.width >= 32, `Schalter gequetscht bei ${w}px: ${spur.width}px`);
    assert.ok(spur.height >= 18, `Schalter gequetscht bei ${w}px: ${spur.height}px`);
    const abgeschnitten = await page.locator(`${LABEL_TOGGLE} ~ .ce-switch-text`).evaluate(
      el => el.scrollWidth > el.clientWidth + 1);
    assert.ok(!abgeschnitten, `Text abgeschnitten bei ${w}px`);

    await schalte(page, TRACK_TOGGLE, true);
    await schalte(page, LABEL_TOGGLE, true);
    await page.locator(TRACK_INPUT).fill("sehr.lange.adresse@beispielunternehmen-logistik.de");
    assert.ok(await keinUeberlauf(), `Überlauf aufgeklappt bei ${w}px`);
    await page.close();
  }
});
