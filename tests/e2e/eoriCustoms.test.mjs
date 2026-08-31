// E2E: EORI-Nummer — Kontoeinstellungen und zollpflichtige Buchung. Echter Dev-Server,
// gemocktes Backend.
//
// Geprüft wird, was eine Quelltextprüfung nicht erreichen kann: was der Kunde sieht,
// WELCHEN Request ein Klick tatsächlich auslöst, und vor allem, dass der laufende
// Versandvorgang beim Nachtragen der EORI erhalten bleibt — Formular, Angebote und
// Auswahl leben nur im Arbeitsspeicher, eine Navigation in die Kontoeinstellungen
// würde sie vernichten.
//
// Es wird NIEMALS eine echte Bestellung ausgelöst: /api/jumingo/book ist gemockt.
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
import { fuelleVersandformular, STANDARD_EMPFAENGER } from "./helpers/newShipmentForm.mjs";

const PORT = 5356, BASE = `http://127.0.0.1:${PORT}`;
const EORI = "DE123456789012345";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const basisUser = (extra = {}) => ({
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", street: "Hauptstr. 1",
  city: "Berlin", vat_id: "DE999999999", customer_number: "CE-K-10030", ...extra,
});

const TARIFF = {
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dhl", publicCarrierName: "DHL Express",
  publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
  netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19, transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-08-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-08-08T00:00:00Z",
};

let server, browser;

/**
 * `zustand.user` ist der jeweils aktuelle Kontodatensatz — der PATCH schreibt hinein,
 * damit die Oberfläche wie in Wirklichkeit die Serverwahrheit zurückbekommt.
 * `zustand.protokoll` sammelt jeden angesprochenen Pfad samt Methode und Body.
 */
async function setupRoutes(page, zustand) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    zustand.protokoll.push({ methode: req.method(), pfad: p, body: req.postData() || "" });

    if (p.endsWith("/kunde/profil") && req.method() === "PATCH") {
      const body = JSON.parse(req.postData() || "{}");
      // Serverseitige Normalisierung nachbilden: gespeichert wird die kanonische Form.
      if (typeof body.eori_number === "string") {
        const kanonisch = body.eori_number.replace(/[\s-]/g, "").trim().toUpperCase();
        if (kanonisch !== "" && !/^[A-Z]{2}[A-Z0-9]{1,15}$/.test(kanonisch)) {
          return json({ error: "Format der EORI-Nummer ist ungültig.", code: "INVALID_EORI_FORMAT", field: "eori_number" }, 400);
        }
        zustand.user = { ...zustand.user, eori_number: kanonisch || null };
      }
      Object.assign(zustand.user, Object.fromEntries(
        Object.entries(body).filter(([k]) => k !== "eori_number")));
      return json({ message: "Profil aktualisiert", user: zustand.user });
    }

    if (p.endsWith("/kundenbereich")) return json({ user: zustand.user });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/kunde/support")) return json({ requests: [], pagination: {} });
    if (p.includes("/api/kunde/company-logo")) return json({}, 404);
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/address/")) return json({ status: "unsupported" });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", ceShipmentId: 4711, tariffs: [TARIFF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      // Zollpflicht kommt IMMER vom Server — die Oberfläche leitet sie nie selbst ab.
      customsRequired: zustand.customsRequired === true,
      fromCountryCode: "DE", toCountryCode: zustand.customsRequired ? "CH" : "DE",
      exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    if (p.includes("/api/shipments/") && p.endsWith("/documents")) return json({ shipmentId: 4711, documents: [] });
    if (p.includes("/api/jumingo/book")) {
      // Das Backend ist die einzige Instanz, die über die EORI-Pflicht entscheidet.
      if (zustand.customsRequired && !zustand.user.eori_number) {
        return json({
          code: "EORI_REQUIRED", field: "eori_number",
          error: "Für zollpflichtige Sendungen wird die EORI-Nummer Ihres Unternehmens benötigt. Bitte hinterlegen Sie sie in den Kontoeinstellungen.",
        }, 422);
      }
      zustand.gebucht = true;
      return json({ shipmentId: "s1", ceShipmentId: 4711, trackingNumber: "TRACK1", labelUrl: null, invoiceNumber: "CE-RE-2026-000001" });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

// Der Zollabschnitt ist Pflicht, bevor eine zollpflichtige Sendung Schritt 2 erreicht.
// Ausgefüllt werden ausschließlich sichtbare Felder — nichts wird erzwungen oder umgangen.
async function fuelleZollangaben(page) {
  await page.locator("#customs-reason").selectOption("Gift");
  const grid = page.locator(".customs-grid").first();
  await grid.locator('input.field-input').nth(0).fill("Baumwoll-T-Shirts");   // Warenbeschreibung
  await grid.locator('input.field-input').nth(1).fill("40");                  // Warenwert
  await grid.locator('input.field-input').nth(2).fill("2");                   // Menge
  await grid.locator('input.field-input').nth(3).fill("0.5");                 // Nettogewicht
  await grid.locator("select.field-select").last().selectOption("DE");        // Ursprungsland
}

async function bisAngebote(page, { empfaenger } = {}) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, empfaenger ? { empfaenger } : {});
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits
    // node startet. Ein Signal an npx ließe den Enkel auf dem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

/* ══════════ 1 — Kontoeinstellungen: EORI speichern ══════════ */

test("1 — die EORI lässt sich in den Kontoeinstellungen speichern und wird normalisiert", { skip: ZOLL_UI_AUS }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const zustand = { user: basisUser({ eori_number: null }), protokoll: [] };
  await setupRoutes(page, zustand);

  await page.goto(`${BASE}/dashboard?page=profile`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".profile-card", { timeout: 20000 });
  // Vor dem Bearbeiten steht die Anzeigezeile.
  assert.match(await page.locator(".profile-card").first().innerText(), /EORI-Nummer/);

  await page.getByRole("button", { name: /Unternehmensdaten bearbeiten/ }).click();
  const feld = page.locator("#pf-eori");
  await feld.waitFor({ timeout: 10000 });
  // Optional: kein Pflichtsternchen am Label.
  const label = page.locator('label[for="pf-eori"]');
  assert.equal((await label.innerText()).includes("*"), false, "die EORI trägt ein Pflichtsternchen");

  // Bewusst in der gruppierten Schreibweise eines Zollbescheids.
  await feld.fill(" de 1234-5678-9012345 ");
  await page.getByRole("button", { name: /^Speichern$/ }).first().click();
  await page.waitForTimeout(800);

  const patch = zustand.protokoll.filter((r) => r.methode === "PATCH" && r.pfad.endsWith("/kunde/profil"));
  assert.equal(patch.length, 1, "es muss genau EIN Profil-PATCH sein");
  // Gesendet wird die kanonische Form — nicht die Schreibweise des Kunden.
  assert.equal(JSON.parse(patch[0].body).eori_number, EORI);
  assert.equal(zustand.user.eori_number, EORI);
  await page.close();
});

/* ══════════ 2 — Formatfehler bleibt am Feld ══════════ */

test("2 — ein Formatfehler wird am Feld gemeldet und nichts gespeichert", { skip: ZOLL_UI_AUS }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const zustand = { user: basisUser({ eori_number: null }), protokoll: [] };
  await setupRoutes(page, zustand);

  await page.goto(`${BASE}/dashboard?page=profile`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Unternehmensdaten bearbeiten/ }).click();
  await page.locator("#pf-eori").waitFor({ timeout: 10000 });
  await page.locator("#pf-eori").fill("12345");
  await page.waitForTimeout(300);

  // Der Speichern-Knopf bleibt gesperrt — der Fehler steht am Feld.
  const speichern = page.getByRole("button", { name: /^Speichern$/ }).first();
  assert.equal(await speichern.isDisabled(), true, "ein ungültiges Format darf nicht speicherbar sein");
  assert.match(await page.locator(".profile-card").first().innerText(), /Format der EORI-Nummer/);
  assert.equal(zustand.protokoll.filter((r) => r.methode === "PATCH").length, 0, "es darf nichts gesendet worden sein");
  assert.equal(zustand.user.eori_number, null);
  await page.close();
});

/* ══════════ 3 — Zollflow ohne EORI: Inline-Erfassung, Vorgang bleibt ══════════ */

test("3 — fehlende EORI: Inline-Hinweis, Speichern im Zollabschnitt, Vorgang bleibt bestehen", { skip: ZOLL_UI_AUS }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const zustand = {
    user: basisUser({ eori_number: null }), protokoll: [], customsRequired: true, gebucht: false,
  };
  await setupRoutes(page, zustand);

  await bisAngebote(page, { empfaenger: { ...STANDARD_EMPFAENGER, country: "CH", zip: "8001", city: "Zuerich" } });

  // Der Zollabschnitt zeigt die Erfassungsfläche, weil das Konto keine EORI trägt.
  const flaeche = page.locator('[data-testid="customs-eori-required"]');
  await flaeche.waitFor({ timeout: 20000 });
  assert.match(await flaeche.innerText(), /EORI-Nummer erforderlich/);

  // Der Versandvorgang steht dabei unverändert: der Empfänger ist noch gefüllt.
  // (Gemessen über den Schritt-1-Zustand der Buchungsseite.)
  const vorher = await page.locator(".steps-bar").innerText();

  await page.locator("#customs-eori").fill(EORI);
  await page.getByRole("button", { name: /EORI speichern/ }).click();
  await page.waitForTimeout(800);

  const patch = zustand.protokoll.filter((r) => r.methode === "PATCH" && r.pfad.endsWith("/kunde/profil"));
  assert.equal(patch.length, 1, "gespeichert wird über die BESTEHENDE Profil-API, genau einmal");
  // GENAU EIN Schlüssel im Body — die Sektion überschreibt keine anderen Profilfelder.
  assert.deepEqual(Object.keys(JSON.parse(patch[0].body)), ["eori_number"]);
  assert.equal(zustand.user.eori_number, EORI);

  // Danach steht die ruhige Bestätigungszeile, und der Vorgang ist NICHT verloren:
  // dieselbe Buchungsseite, derselbe Schritt, keine Navigation.
  await page.locator('[data-testid="customs-eori-ok"]').waitFor({ timeout: 10000 });
  assert.equal(await page.locator(".steps-bar").innerText(), vorher, "der Buchungsschritt hat sich verschoben");
  assert.ok(page.url().includes("/booking"), `die Seite hat navigiert: ${page.url()}`);
  await page.close();
});

/* ══════════ 4 — Backend-EORI_REQUIRED öffnet denselben Weg ══════════ */

test("4 — EORI_REQUIRED aus dem Backend führt zurück an den Zollabschnitt, nicht in den Preiszweig", { skip: ZOLL_UI_AUS }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  // Das Konto TRÄGT eine EORI — die Oberfläche zeigt deshalb zunächst keine Fläche.
  // Erst die Serverantwort löst sie aus; genau das ist der Fall „EORI zwischenzeitlich
  // entfernt" beziehungsweise „serverseitig strenger als der Client".
  const zustand = { user: basisUser({ eori_number: EORI }), protokoll: [], customsRequired: true, gebucht: false };
  await setupRoutes(page, zustand);

  await bisAngebote(page, { empfaenger: { ...STANDARD_EMPFAENGER, country: "CH", zip: "8001", city: "Zuerich" } });
  await page.locator('[data-testid="customs-eori-ok"]').waitFor({ timeout: 20000 });

  // Konto serverseitig leeren, dann buchen → 422 EORI_REQUIRED.
  zustand.user = { ...zustand.user, eori_number: null };
  await fuelleZollangaben(page);
  await page.getByRole("button", { name: /^Weiter: Buchung/ }).first().click();
  await page.waitForTimeout(400);
  // ALLE Bestätigungen — eine zollpflichtige Buchung kann mehr tragen als eine
  // Inlandssendung, und ein nicht gesetztes Häkchen bricht `doBook` still ab.
  for (const cb of await page.getByRole("checkbox").all()) await cb.check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();

  // Zurück an Schritt 1 mit der Inline-Fläche — keine Bestellung, kein Preisdialog.
  await page.locator('[data-testid="customs-eori-required"]').waitFor({ timeout: 20000 });
  assert.equal(zustand.gebucht, false, "es darf keine Buchung entstanden sein");
  const text = await page.locator("body").innerText();
  assert.ok(!/Preis(e)? .*neu berechnen|Preis hat sich geändert/.test(text),
    "EORI_REQUIRED darf nicht im Preisdrift-Zweig landen");

  // Nachtragen und unmittelbar erneut buchen — ohne den Vorgang zu verlieren.
  await page.locator("#customs-eori").fill(EORI);
  await page.getByRole("button", { name: /EORI speichern/ }).click();
  await page.locator('[data-testid="customs-eori-ok"]').waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: /^Weiter: Buchung/ }).first().click();
  await page.waitForTimeout(400);
  // ALLE Bestätigungen — eine zollpflichtige Buchung kann mehr tragen als eine
  // Inlandssendung, und ein nicht gesetztes Häkchen bricht `doBook` still ab.
  for (const cb of await page.getByRole("checkbox").all()) await cb.check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(zustand.gebucht, true);
  await page.close();
});

/* ══════════ 5 — nicht zollpflichtig: keine EORI-Fläche, kein Zwang ══════════ */

test("5 — eine Inlandssendung verlangt keine EORI und zeigt keine Fläche", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const zustand = { user: basisUser({ eori_number: null }), protokoll: [], customsRequired: false, gebucht: false };
  await setupRoutes(page, zustand);

  await bisAngebote(page);
  await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-testid="customs-eori-required"]').count(), 0,
    "eine Inlandssendung darf keine EORI verlangen");
  assert.equal(await page.locator('[data-testid="customs-eori-ok"]').count(), 0);

  // Und sie ist ohne EORI vollständig buchbar.
  await page.getByRole("button", { name: /^Weiter: Buchung/ }).first().click();
  await page.waitForTimeout(400);
  // ALLE Bestätigungen — eine zollpflichtige Buchung kann mehr tragen als eine
  // Inlandssendung, und ein nicht gesetztes Häkchen bricht `doBook` still ab.
  for (const cb of await page.getByRole("checkbox").all()) await cb.check();
  await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
  await page.waitForSelector(".booking-success-title", { timeout: 20000 });
  assert.equal(zustand.gebucht, true);
  await page.close();
});
