// E2E: Zusatzoptionen im Entwurf — echter Dev-Server, gemocktes Backend.
//
// Was hier gemessen wird, und was eine Quelltextprüfung nicht erreicht:
//
//   • Was tatsächlich im Speicher-Request steht, wenn der Kunde alle vier Optionen
//     ausgefüllt hat — und was NICHT darin steht, wenn er einen Schalter wieder
//     ausschaltet, obwohl der Wert noch im Feld liegt.
//   • Dass ein gespeicherter Sendungsentwurf überhaupt wieder zu öffnen ist.
//   • Dass nach dem Fortsetzen jeder Schalter und jeder Wert 1:1 dort steht, wo der
//     Kunde ihn verlassen hat — einschließlich „Option an, Feld noch leer“, den der
//     Wert allein nicht ausdrücken kann.
//   • Dass die Buchung danach genau den wiederhergestellten Zustand bucht.
//
// NIEMALS eine echte Bestellung: /book wird abgefangen und beantwortet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5347, BASE = `http://127.0.0.1:${PORT}`;

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

// Der gespeicherte Sendungsentwurf, wie ihn GET /api/kunde/drafts/:id liefert.
const ENTWURF_ID = 4711;
const ENTWURF_LISTE = {
  id: ENTWURF_ID, jumingoShipmentId: "s_" + "a".repeat(32), status: "draft",
  weight: "5", length: "30", width: "20", height: "15", packageCount: 1,
  fromCountry: "DE", toCountry: "DE", fromPostalCode: "10115", toPostalCode: "80331",
  senderAddress:    { firstName: "Max", lastName: "Mustermann", email: "max@example.com", phone: "+49301234567",
                      streetAndNumber: "Musterweg 1", postalCode: "10115", city: "Berlin",  country: "DE" },
  recipientAddress: { firstName: "Erika", lastName: "Beispiel", email: "erika@example.com", phone: "+49891234567",
                      streetAndNumber: "Zielstraße 2", postalCode: "80331", city: "München", country: "DE" },
  requestedShippingDate: "2026-09-01", createdAt: "2026-08-20T10:00:00Z", updatedAt: "2026-08-20T12:00:00Z",
};
const ENTWURF_FORMDATA = {
  sender:    ENTWURF_LISTE.senderAddress,
  recipient: ENTWURF_LISTE.recipientAddress,
  packages:  { packageCount: 1, weight: 5, length: 30, width: 20, height: 15 },
  shippingOptions: { shippingDate: "2026-09-01", serviceFilter: "all", shippingModeFilter: "all", publicCarrierIds: [] },
};

const REF_TOGGLE   = "#booking-reference-toggle";
const FMT_TOGGLE   = "#booking-labelformat-toggle";
const TRACK_TOGGLE = "#booking-tracking-email-toggle";
const LABEL_TOGGLE = "#booking-label-email-toggle";
const REF_INPUT    = "#booking-reference";
const TRACK_INPUT  = "#booking-tracking-email-toggle-input";
const LABEL_INPUT  = "#booking-label-email-toggle-input";

let server, browser;

/**
 * @param {object} opts
 * @param {object|null} opts.bookingOptions  Entwurfszustand, den GET /drafts/:id liefert
 * @param {object}      opts.gespeichert     Ausgabeobjekt: nimmt den Body des Save-Requests auf
 */
async function setupRoutes(page, { bookingOptions = null, gespeichert = {} } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });

    // Reihenfolge zählt: die spezifischeren Entwurfspfade VOR der Liste.
    if (/\/api\/kunde\/drafts\/\d+\/save$/.test(p)) {
      gespeichert.body = JSON.parse(route.request().postData() || "{}");
      return json(ENTWURF_LISTE);
    }
    if (/\/api\/kunde\/drafts\/\d+$/.test(p)) {
      return json({ draft: { ...ENTWURF_LISTE, formData: ENTWURF_FORMDATA, bookingOptions } });
    }
    if (p.includes("/api/kunde/drafts")) return json({ items: [ENTWURF_LISTE], nextCursor: null });

    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      // BEIDE IDs in ihrer ECHTEN Form: `shipmentId` ist die Providerreferenz,
      // `ceShipmentId` der interne Handle. Nur mit dem Handle erscheint
      // „Als Entwurf speichern“ überhaupt (hasSavableShipmentId lehnt die
      // Providerform korrekt ab).
      shipmentId: "s_" + "a".repeat(32), ceShipmentId: ENTWURF_ID,
      tariffs: [TARIFF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-09-01T09:00:00Z", availableUntil: "2026-09-01T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

// Die Schaltereingaben sind visuell versteckt — bedient wird über ihr Label,
// genau wie ein Mensch es tut.
async function schalte(page, sel, an) {
  const input = page.locator(sel);
  if ((await input.isChecked()) === an) return;
  await input.locator("xpath=ancestor::label[1]").click();
  assert.equal(await input.isChecked(), an, `Schalter ${sel} ließ sich nicht auf ${an} setzen`);
}

async function zurBuchung(page) {
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(REF_TOGGLE, { timeout: 20000 });
}

async function neueSendungZurBuchung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await zurBuchung(page);
}

/** Liest den Zustand aller vier Optionen so, wie ihn der Kunde sieht. */
async function lieseOptionen(page) {
  const wert = async (sel) => (await page.locator(sel).count()) ? await page.locator(sel).inputValue() : null;
  return {
    referenceEnabled:          await page.locator(REF_TOGGLE).isChecked(),
    reference:                 await wert(REF_INPUT),
    trackingEmailEnabled:      await page.locator(TRACK_TOGGLE).isChecked(),
    trackingEmail:             await wert(TRACK_INPUT),
    labelTrackingEmailEnabled: await page.locator(LABEL_TOGGLE).isChecked(),
    labelTrackingEmail:        await wert(LABEL_INPUT),
    labelFormatEnabled:        await page.locator(FMT_TOGGLE).isChecked(),
    labelFormat:               (await page.locator(FMT_TOGGLE).isChecked())
      ? await page.locator('input[name="labelFormat"]:checked').inputValue() : "A4",
  };
}

/** Buchung durchspielen und den echten /book-Payload zurückgeben. */
async function bucheUndLiesPayload(page) {
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForTimeout(400);
  let payload = null;
  await page.route("**/api/jumingo/book**", async (route) => {
    payload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ shipmentId: "s1", ceShipmentId: ENTWURF_ID, trackingNumber: "TRACK1", labelUrl: null }),
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

/* ══════════ Speichern ══════════ */

test("1 — alle vier Optionen landen vollständig im Speicher-Request", async () => {
  const gespeichert = {};
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { gespeichert });
  await neueSendungZurBuchung(page);

  await schalte(page, REF_TOGGLE, true);
  await page.locator(REF_INPUT).fill("CE-REF-4711");
  await schalte(page, TRACK_TOGGLE, true);
  await page.locator(TRACK_INPUT).fill("ops@example.com");
  await schalte(page, LABEL_TOGGLE, true);
  await page.locator(LABEL_INPUT).fill("logistik@example.com");
  await schalte(page, FMT_TOGGLE, true);
  await page.locator('input[name="labelFormat"][value="A6"]').locator("xpath=ancestor::label[1]").click();

  await page.getByRole("button", { name: /Als Entwurf speichern/ }).click();
  await page.waitForSelector(".bk-savedraft-done", { timeout: 15000 });

  assert.ok(gespeichert.body, "es wurde kein Speicher-Request abgesetzt");
  assert.deepEqual(gespeichert.body.bookingOptions, {
    reference:          { enabled: true, value: "CE-REF-4711" },
    trackingEmail:      { enabled: true, value: "ops@example.com" },
    labelTrackingEmail: { enabled: true, value: "logistik@example.com" },
    labelFormat:        { enabled: true, value: "A6" },
  });
  await page.close();
});

test("2 — ein ausgeschalteter Schalter speichert seinen Wert NICHT mit", async () => {
  // Der Kern der Regel „ein deaktivierter Schalter darf niemals einen versteckten Wert
  // wirksam werden lassen“ — hier am echten Request gemessen, nicht am Quelltext.
  // Die Referenznummer bleibt dabei bewusst IM FORMULAR stehen (versehentliches
  // Ausschalten vernichtet nichts) — sie darf nur nicht mitgespeichert werden.
  const gespeichert = {};
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { gespeichert });
  await neueSendungZurBuchung(page);

  await schalte(page, REF_TOGGLE, true);
  await page.locator(REF_INPUT).fill("GEHEIM-4711");
  await schalte(page, TRACK_TOGGLE, true);
  await page.locator(TRACK_INPUT).fill("fremd@example.com");
  await schalte(page, FMT_TOGGLE, true);
  await page.locator('input[name="labelFormat"][value="A6"]').locator("xpath=ancestor::label[1]").click();
  // …und alles wieder aus.
  await schalte(page, REF_TOGGLE, false);
  await schalte(page, TRACK_TOGGLE, false);
  await schalte(page, FMT_TOGGLE, false);

  await page.getByRole("button", { name: /Als Entwurf speichern/ }).click();
  await page.waitForSelector(".bk-savedraft-done", { timeout: 15000 });

  const o = gespeichert.body.bookingOptions;
  assert.equal(o.reference.value, "", "die Referenz wurde hinter dem Schalter mitgespeichert");
  assert.equal(o.trackingEmail.value, "", "eine fremde Adresse wurde mitgespeichert");
  assert.equal(o.labelFormat.value, "A4", "A6 überlebte das Ausschalten");
  for (const leck of ["GEHEIM-4711", "fremd@example.com", "A6"]) {
    assert.ok(!JSON.stringify(gespeichert.body).includes(leck), `${leck} steht im gespeicherten Entwurf`);
  }
  await page.close();
});

/* ══════════ Fortsetzen ══════════ */

test("3 — ein gespeicherter Sendungsentwurf ist in der Liste fortsetzbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=drafts`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dft-table", { timeout: 20000 });

  const zeile = page.locator(".dft-table tbody tr").first();
  await assert.doesNotReject(zeile.locator("button.dft-resume-btn").waitFor({ timeout: 5000 }),
    "der Sendungsentwurf bietet kein „Fortsetzen“");
  // Löschen bleibt sekundär im Kebab — die Hierarchie ändert sich nicht.
  assert.equal(await zeile.locator(".dft-actions-menu, button[aria-haspopup]").count() > 0, true,
    "das Kebab-Menü fehlt");

  await zeile.locator("button.dft-resume-btn").click();
  // Fortsetzen führt zurück nach „Neue Sendung“, NICHT in die Buchung.
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  assert.equal(await page.locator("#ns-r-zip").inputValue(), "80331", "der Empfänger wurde nicht übernommen");
  assert.equal(await page.locator("#ns-s-zip").inputValue(), "10115", "der Absender wurde nicht übernommen");
  await page.close();
});

test("4 — nach dem Fortsetzen stehen alle vier Optionen exakt wie verlassen", async () => {
  // Einschließlich der beiden Fälle, die der WERT allein nicht ausdrücken kann:
  // „Referenz an, Feld leer“ und „Format ändern an, A4 gewählt“.
  const bookingOptions = {
    reference:          { enabled: true,  value: "" },
    trackingEmail:      { enabled: true,  value: "ops@example.com" },
    labelTrackingEmail: { enabled: false, value: "" },
    labelFormat:        { enabled: true,  value: "A4" },
  };
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { bookingOptions });
  await page.goto(`${BASE}/dashboard?page=drafts`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dft-table", { timeout: 20000 });
  await page.locator(".dft-table tbody tr").first().locator("button.dft-resume-btn").click();
  await zurBuchung(page);

  assert.deepEqual(await lieseOptionen(page), {
    referenceEnabled: true,          reference: "",
    trackingEmailEnabled: true,      trackingEmail: "ops@example.com",
    labelTrackingEmailEnabled: false, labelTrackingEmail: null,
    labelFormatEnabled: true,        labelFormat: "A4",
  });
  await page.close();
});

test("5 — ein Entwurf ohne Zusatzoptionen öffnet den Bereich im Grundzustand", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { bookingOptions: null });   // Entwurf aus der Zeit vor dieser Funktion
  await page.goto(`${BASE}/dashboard?page=drafts`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dft-table", { timeout: 20000 });
  await page.locator(".dft-table tbody tr").first().locator("button.dft-resume-btn").click();
  await zurBuchung(page);

  assert.deepEqual(await lieseOptionen(page), {
    referenceEnabled: false,          reference: null,
    trackingEmailEnabled: false,      trackingEmail: null,
    labelTrackingEmailEnabled: false, labelTrackingEmail: null,
    labelFormatEnabled: false,        labelFormat: "A4",
  });
  await page.close();
});

test("6 — die Buchung bucht danach genau den wiederhergestellten Zustand", async () => {
  const bookingOptions = {
    reference:          { enabled: true,  value: "CE-REF-9" },
    trackingEmail:      { enabled: true,  value: "ops@example.com" },
    labelTrackingEmail: { enabled: false, value: "" },
    labelFormat:        { enabled: true,  value: "A6" },
  };
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page, { bookingOptions });
  await page.goto(`${BASE}/dashboard?page=drafts`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dft-table", { timeout: 20000 });
  await page.locator(".dft-table tbody tr").first().locator("button.dft-resume-btn").click();
  await zurBuchung(page);
  const payload = await bucheUndLiesPayload(page);

  assert.ok(payload, "der /book-Request muss abgesetzt worden sein");
  assert.equal(payload.referenceNumber, "CE-REF-9");
  assert.equal(payload.trackingEmail, "ops@example.com");
  assert.ok(!("labelTrackingEmail" in payload), "die ausgeschaltete Option wurde mitgebucht");
  assert.equal(payload.labelFormat, "A6");
  // Der Schalterzustand selbst gehört NIE in den Buchungsvertrag.
  for (const k of Object.keys(payload)) {
    assert.ok(!/Enabled$/.test(k), `${k} steht im /book-Payload`);
  }
  await page.close();
});

test("7 — ein Reload der Buchungsseite verliert die vier Optionen nicht", async () => {
  // Der Vorgang lebt im Arbeitsspeicher; ein Reload baut den React-Baum neu auf. Geprüft wird
  // deshalb der Weg, den ein Kunde tatsächlich geht: zurück zu den Angeboten und wieder hinein.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await setupRoutes(page);
  await neueSendungZurBuchung(page);

  await schalte(page, REF_TOGGLE, true);          // an, Feld bewusst LEER
  await schalte(page, FMT_TOGGLE, true);          // an, bewusst A4
  await schalte(page, TRACK_TOGGLE, true);
  await page.locator(TRACK_INPUT).fill("ops@example.com");

  await page.getByRole("button", { name: /Zurück/ }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(REF_TOGGLE, { timeout: 20000 });

  const o = await lieseOptionen(page);
  assert.equal(o.referenceEnabled, true, "„an, aber leer“ ging verloren — genau die Lücke dieses Pakets");
  assert.equal(o.labelFormatEnabled, true, "„Format ändern an, A4“ ging verloren");
  assert.equal(o.trackingEmailEnabled, true);
  assert.equal(o.trackingEmail, "ops@example.com");
  await page.close();
});
