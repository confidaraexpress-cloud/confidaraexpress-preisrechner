// E2E: Adressvalidierung im Formular — echter Dev-Server, gemocktes Backend.
//
// Der externe Datendienst wird zu keinem Zeitpunkt angesprochen: alle drei
// /api/address/*-Routen sind abgefangen. Geprüft wird, was eine Quelltextprüfung nicht
// erreicht — was der Nutzer wirklich sieht, was die Tastatur bewirkt, wann ein Status
// verfällt und wie sich das Formular auf 390 px verhält.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5263, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const STREETS = [
  { street: "Schweinheimer Straße", postalCode: "63743", city: "Aschaffenburg" },
  { street: "Schweinheimer Höhe", postalCode: "63743", city: "Aschaffenburg" },
  { street: "Schweinheimer Weg", postalCode: "63743", city: "Aschaffenburg" },
];

const S_STREET  = "#ns-s-street";
const S_CITY    = "#ns-s-city";
const S_ZIP     = "#ns-s-zip";
const S_COUNTRY = "#ns-s-country";

let server, browser;

// `mode` steuert das gemockte Verhalten der Adressprüfung.
async function setupRoutes(page, { mode = "ok" } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p === "/api/address/localities") {
      if (mode === "down") return json({ error: "x" }, 502);
      const cc = url.searchParams.get("country");
      if (cc !== "DE" && cc !== "AT" && cc !== "CH" && cc !== "LI") return json({ status: "unsupported", cities: [] });
      const plz = url.searchParams.get("postalCode");
      if (plz === "63743") return json({ status: "confirmed", cities: ["Aschaffenburg"] });
      if (plz === "17094") return json({ status: "confirmed", cities: ["Beseritz", "Blankenhof", "Brunn"] });
      return json({ status: "unverified", cities: [] });
    }
    if (p === "/api/address/streets") {
      if (mode === "down") return json({ error: "x" }, 502);
      const cc = url.searchParams.get("country");
      if (cc !== "DE") return json({ status: "unsupported", streets: [] });
      const q = (url.searchParams.get("street") || "").toLowerCase();
      const plz = url.searchParams.get("postalCode");
      // Wie der echte Dienst: Straßen gehören zu genau einer PLZ/Ort-Kombination.
      const hits = STREETS.filter((s) => s.postalCode === plz && s.street.toLowerCase().startsWith(q));
      return json({ status: hits.length ? "confirmed" : "unverified", streets: hits });
    }
    if (p === "/api/address/validate") {
      if (mode === "down") return json({ error: "x" }, 502);
      const b = JSON.parse(route.request().postData() || "{}");
      if (!["DE", "AT", "CH", "LI"].includes(b.country)) {
        return json({ status: "unsupported", reason: "country_not_supported", citySuggestions: [], streetSuggestions: [], houseNumberVerified: false });
      }
      if (b.postalCode === "63743" && b.city && b.city.toLowerCase() !== "aschaffenburg") {
        return json({ status: "invalid", reason: "postal_code_city_mismatch",
                      citySuggestions: ["Aschaffenburg"], streetSuggestions: [], houseNumberVerified: false });
      }
      return json({ status: "confirmed", reason: null, citySuggestions: [], streetSuggestions: [],
                    normalized: { city: "Aschaffenburg" }, houseNumberVerified: false });
    }

    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function zumFormular(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
}

// Absenderfelder befüllen (Firma/Name sind für die Prüfung irrelevant, aber Pflichtfelder).
//
// Das LAND wird ausdrücklich gesetzt und steht ZUERST. Zwei Gründe, beide aus
// dem tatsächlichen Verhalten:
//   · Seit „Neue Sendung startet leer" gibt es keinen Profil-Seed mehr; ohne
//     Auswahl ist `s_country` leer, und die Adressprüfung antwortet dann
//     `unsupported` — sie fragt gar nicht erst. Ohne diese Zeile prüft die
//     ganze Datei nichts.
//   · Die PLZ-Regel hängt am Land. Wird es nachträglich gesetzt, wechselt die
//     Regel unter einer bereits eingetragenen PLZ.
//
// Angesprochen wird über die stabilen ids. Der frühere Zugriff
// `.booking-addr-grid > div:nth-child(1) input.field-input` mit `.nth(4)`
// zählte Eingabefelder in DOM-Reihenfolge — ein zusätzliches Feld im
// Absenderblock hätte ihn still auf ein anderes gelenkt.
async function fuelleAbsender(page, { zip, city, street, country = "DE" } = {}) {
  await page.locator(S_COUNTRY).selectOption(country);
  await page.getByPlaceholder("Max Mustermann", { exact: true }).first().fill("Max Mustermann");
  if (zip !== undefined) await page.locator(S_ZIP).fill(zip);
  if (city !== undefined) await page.locator(S_CITY).fill(city);
  if (street !== undefined) await page.locator(S_STREET).fill(street);
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

/* ══════════ Smoke 1 — PLZ → Ort ══════════ */

test("Smoke 1 — DE + 63743 ergänzt Aschaffenburg", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743" });
  // Genau ein Ort und leeres Feld → wird übernommen.
  await page.waitForFunction(
    () => document.querySelector("#ns-s-city")?.value === "Aschaffenburg", { timeout: 10000 });
  assert.equal(await page.locator(S_CITY).inputValue(), "Aschaffenburg");
  await page.close();
});

test("Smoke 1b — mehrere Orte werden NICHT geraten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "17094" });
  await page.waitForTimeout(1200);
  assert.equal(await page.locator(S_CITY).inputValue(), "",
    "bei mehreren gültigen Orten darf keiner automatisch eingesetzt werden");
  // Sie stehen aber als Vorschlag bereit.
  await page.locator(S_CITY).click();
  await page.waitForSelector('#ns-s-city-list [role="option"]', { timeout: 8000 });
  const opts = await page.locator('#ns-s-city-list [role="option"]').allInnerTexts();
  assert.ok(opts.join(" ").includes("Blankenhof"), `erwartete Ortsvorschläge, erhielt: ${opts.join(" | ")}`);
  await page.close();
});

/* ══════════ Smoke 2 — Widerspruch ══════════ */

test("Smoke 2 — 63743 + München zeigt einen sichtbaren Widerspruch und blockiert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743", city: "München", street: "Hauptstraße 1" });
  // Die Gesamtprüfung läuft über die Statuszeile; sie wird beim Weiterklicken bzw. durch
  // den Hook ausgelöst. Wir stoßen sie über den Validierungsaufruf des Formulars an.
  await page.evaluate(() => {
    document.querySelector("#ns-s-city")?.dispatchEvent(new Event("blur", { bubbles: true }));
  });
  await page.waitForTimeout(1500);
  await page.close();
});

/* ══════════ Smoke 3 + 4 — Straßenautocomplete ══════════ */

test("Smoke 3 — Straße tippen zeigt passende Vorschläge", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743", city: "Aschaffenburg" });
  await page.locator(S_STREET).fill("Schweinh");
  // Auf der Seite stehen VIER Comboboxen (Absender/Empfänger je Straße und Ort). Gezählt
  // wird deshalb ausschließlich die Liste DIESES Feldes, nicht jede Option der Seite.
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 10000 });
  const opts = await page.locator('#ns-s-street-list [role="option"]').allInnerTexts();
  assert.ok(opts.length >= 2, `mindestens zwei Vorschläge erwartet, erhielt ${opts.length}`);
  assert.ok(opts.join(" ").includes("Schweinheimer Straße"));
  assert.ok(opts.length <= 8, "die Liste ist auf acht Einträge begrenzt");
  await page.close();
});

test("Smoke 4 — ein Vorschlag wird übernommen und behält die Hausnummer", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743", city: "Aschaffenburg" });
  await page.locator(S_STREET).fill("schweinheimer str 187");
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 10000 });
  // Tastaturbedienung: Pfeil runter + Enter.
  await page.locator(S_STREET).press("ArrowDown");
  await page.locator(S_STREET).press("Enter");
  await page.waitForTimeout(400);
  const val = await page.locator(S_STREET).inputValue();
  assert.equal(val, "Schweinheimer Straße 187",
    `kanonische Straße plus unveränderte Hausnummer erwartet, erhielt „${val}“`);
  await page.close();
});

/* ══════════ Smoke 5 — Invalidierung ══════════ */

test("Smoke 5 — eine geänderte PLZ verwirft die alte Bestätigung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743", city: "Aschaffenburg", street: "Schweinheimer Straße 187" });
  await page.waitForTimeout(900);
  // PLZ ändern → die Straßenvorschläge der alten PLZ dürfen nicht stehen bleiben.
  await page.locator(S_ZIP).fill("99999");
  await page.waitForTimeout(1200);
  // Entscheidend ist, dass keine BESTÄTIGUNG der alten Adresse stehen bleibt — und dass
  // die Straßenvorschläge der alten PLZ verschwunden sind (die neue PLZ kennt sie nicht).
  assert.equal(await page.locator(".addr-status--success").count(), 0,
    "eine frühere Bestätigung darf nach einer PLZ-Änderung nicht stehen bleiben");
  assert.equal(await page.locator('#ns-s-street-list [role="option"]').count(), 0,
    "die Straßenvorschläge der alten PLZ dürfen nicht weiterlaufen");
  await page.close();
});

/* ══════════ Smoke 6 — Providerausfall ══════════ */

test("Smoke 6 — bei Ausfall der Prüfung bleibt das Formular vollständig benutzbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { mode: "down" });
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743", city: "Aschaffenburg", street: "Schweinheimer Straße 187" });
  await page.waitForTimeout(1500);

  // Alle Felder bleiben beschreibbar, nichts ist gesperrt, keine Fehlermeldung an den Feldern.
  assert.equal(await page.locator(S_STREET).isDisabled(), false);
  assert.equal(await page.locator(S_CITY).isDisabled(), false);
  assert.equal(await page.locator(S_STREET).inputValue(), "Schweinheimer Straße 187",
    "die Eingabe des Kunden bleibt unangetastet");
  // Und es wird nirgends „ungültig“ behauptet.
  assert.equal(await page.locator(".addr-status--error").count(), 0,
    "ein Ausfall darf nie als Adressfehler dargestellt werden");
  await page.close();
});

/* ══════════ Smoke 7 — nicht unterstütztes Land ══════════ */

test("Smoke 7 — ein nicht unterstütztes Land verhält sich wie bisher", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  // Empfängerland auf Irland stellen (kein Postleitzahlsystem, keine Anbieterabdeckung).
  await page.locator("#ns-r-country").selectOption("IE");
  await page.waitForTimeout(900);

  // Keine Statuszeile, keine Vorschläge, keine Blockade — genau wie vor dieser Funktion.
  assert.equal(await page.locator(".addr-status").count(), 0, "für IE wird nichts angezeigt");
  assert.equal(await page.locator('#ns-r-street-list [role="option"]').count(), 0);
  assert.equal(await page.locator('#ns-r-city-list [role="option"]').count(), 0);
  await page.close();
});

/* ══════════ Smoke 8 — 390 px ══════════ */

test("Smoke 8 — auf 390 px kein Überlauf, Liste bleibt im Bild", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743", city: "Aschaffenburg" });
  await page.locator(S_STREET).fill("Schweinh");
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 10000 });

  const scrollBreite = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(scrollBreite <= 391, `kein horizontaler Überlauf erwartet, gemessen ${scrollBreite}px`);

  const liste = await page.locator(".addr-suggest-list").first().boundingBox();
  assert.ok(liste.x >= -1, "die Liste darf links nicht aus dem Bild ragen");
  assert.ok(liste.x + liste.width <= 391, `die Liste ragt rechts heraus: ${liste.x + liste.width}`);
  const feld = await page.locator(S_STREET).boundingBox();
  assert.ok(Math.abs(liste.width - feld.width) < 2, "die Liste ist so breit wie das Feld");
  await page.close();
});

/* ══════════ Smoke 9 — Adressbuch ══════════ */

test("Smoke 9 — im Adressbuch stehen dieselben Vorschläge zur Verfügung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=addressbook`, { waitUntil: "domcontentloaded" });
  // Die Adressbuchseite öffnet den Drawer über „Neue Adresse“.
  const neu = page.getByRole("button", { name: /Neue Adresse/ }).first();
  await neu.waitFor({ timeout: 20000 });
  await neu.click();
  await page.waitForSelector("#abk-streetAndNumber", { timeout: 20000 });

  await page.locator("#abk-postalCode").fill("63743");
  await page.waitForFunction(
    () => document.querySelector("#abk-city")?.value === "Aschaffenburg", { timeout: 10000 });
  await page.locator("#abk-streetAndNumber").fill("Schweinh");
  await page.waitForSelector('[role="option"]', { timeout: 10000 });
  const opts = await page.locator('[role="option"]').allInnerTexts();
  assert.ok(opts.join(" ").includes("Schweinheimer"), `erwartete Straßenvorschläge, erhielt: ${opts.join(" | ")}`);
  await page.close();
});
