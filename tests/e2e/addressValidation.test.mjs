// E2E: Adressvorschläge und Adressprüfung — echter Dev-Server, gemocktes Backend.
//
// Der externe Adressdienst wird zu keinem Zeitpunkt angesprochen: alle /api/address/*-Routen
// sind abgefangen und antworten im CE-Vertrag (Backend lib/addressValidation, Geoapify-Adapter).
// Geprüft wird, was eine Quelltextprüfung nicht erreicht — was der Nutzer wirklich sieht, was
// eine Auswahl übernimmt (und was nicht), wann ein Ergebnis verfällt, wie sich Ausfall und
// fehlende Einrichtung anfühlen, und wie sich die Formulare auf 390 px und per Touch verhalten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
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
  role: "customer", status: "approved", country: "DE", zip: "73207", city: "Plochingen", street: "Weiherstraße 25",
  customer_number: "CE-K-10030",
};

// Vorschläge im CE-Vertrag: Straße, Hausnummer, PLZ, Ort (Region wird nie übernommen).
const ADRESSEN = [
  { street: "Schweinheimer Straße", houseNumber: "187", postalCode: "63743", city: "Aschaffenburg", region: "Bayern" },
  { street: "Schweinheimer Straße", houseNumber: "", postalCode: "63743", city: "Aschaffenburg", region: "Bayern" },
  { street: "Schweinheimer Höhe", houseNumber: "", postalCode: "63743", city: "Aschaffenburg", region: "Bayern" },
];
const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT",
            "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];

const S_STREET  = "#ns-s-street";
const S_CITY    = "#ns-s-city";
const S_ZIP     = "#ns-s-zip";
const S_COUNTRY = "#ns-s-country";
const S_FIRST   = "#ns-s-firstName";
const S_LAST    = "#ns-s-lastName";
const S_EMAIL   = "#ns-s-email";
const S_PHONE   = "#ns-s-phone";
const S_COMPANY = "#ns-s-company";
const S_ADD     = "#ns-s-addition";

let server, browser;

// `mode`: "ok" (Dienst eingerichtet), "down" (Ausfall), "off" (kein Schlüssel: not_configured).
// `streetDelay`: Verzögerung der Straßenantwort je Land in ms (z. B. { DE: 900 }) — damit lässt
// sich eine Antwort erzeugen, die erst NACH einem Landwechsel eintrifft.
// Jede Adressanfrage wird in `log` festgehalten (Pfad, Query, Authorization vorhanden?).
async function setupRoutes(page, { mode = "ok", angemeldet = true, streetDelay = {} } = {}) {
  const log = [];
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.startsWith("/api/address/")) {
      log.push({ p, q: Object.fromEntries(url.searchParams), auth: Boolean(req.headers().authorization) });
      if (mode === "down") return json({ error: "x" }, 502);
      if (mode === "off") return json({ status: "unsupported", reason: "not_configured", cities: [], streets: [] });
    }
    if (p === "/api/address/localities" || p === "/api/address/public/localities") {
      const cc = url.searchParams.get("country");
      if (!EU.includes(cc)) return json({ status: "unsupported", reason: "country_not_supported", cities: [] });
      const plz = url.searchParams.get("postalCode");
      if (plz === "63743") return json({ status: "confirmed", reason: null, cities: ["Aschaffenburg"] });
      if (plz === "17094") return json({ status: "confirmed", reason: null, cities: ["Beseritz", "Blankenhof", "Brunn"] });
      return json({ status: "unverified", reason: "postal_code_unknown", cities: [] });
    }
    if (p === "/api/address/streets" || p === "/api/address/public/streets") {
      const cc = url.searchParams.get("country");
      const warte = streetDelay[cc] || 0;
      if (warte) await new Promise((r) => setTimeout(r, warte));
      if (cc === "FR") {
        return json({ status: "confirmed", reason: null,
          streets: [{ street: "Rue de la Paix", houseNumber: "12", postalCode: "75002", city: "Paris", region: "Île-de-France" }] });
      }
      const q =(url.searchParams.get("street") || "").toLowerCase().replace(/str\b\.?/g, "straße");
      const name = q.replace(/\s*\d+\w*$/, "").trim();
      const hits = ADRESSEN.filter((a) => a.street.toLowerCase().startsWith(name.slice(0, 6)));
      // Wie das Backend: ohne Treffer `no_suggestions` — daraus zeigt das Feld den Leerzustand.
      return json({ status: hits.length ? "confirmed" : "unverified", reason: hits.length ? null : "no_suggestions", streets: hits });
    }
    if (p === "/api/address/validate") {
      const b = JSON.parse(req.postData() || "{}");
      if (b.postalCode === "63743" && b.city && b.city.toLowerCase() !== "aschaffenburg") {
        return json({ status: "unverified", reason: "postal_code_city_mismatch", citySuggestions: ["Aschaffenburg"],
                      streetSuggestions: [], normalized: null, houseNumberVerified: false });
      }
      if (/187$/.test(b.street || "")) {
        return json({ status: "confirmed", reason: null, citySuggestions: [], streetSuggestions: [],
                      normalized: { street: "Schweinheimer Straße 187", city: "Aschaffenburg" }, houseNumberVerified: true });
      }
      return json({ status: "unverified", reason: "house_number_unconfirmed", citySuggestions: [], streetSuggestions: [],
                    normalized: null, houseNumberVerified: false });
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
  if (angemeldet) await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return log;
}

async function zumFormular(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
}

// Absender befüllen — Land zuerst (die PLZ-Regel hängt daran), dann Kontakt, dann Anschrift.
async function fuelleAbsender(page, { zip, city, street, country = "DE" } = {}) {
  await page.locator(S_COUNTRY).selectOption(country);
  await page.locator(S_FIRST).fill("Max");
  await page.locator(S_LAST).fill("Mustermann");
  await page.locator(S_EMAIL).fill("max@example.com");
  await page.locator(S_PHONE).fill("+49301234567");
  if (zip !== undefined) await page.locator(S_ZIP).fill(zip);
  if (city !== undefined) await page.locator(S_CITY).fill(city);
  if (street !== undefined) await page.locator(S_STREET).fill(street);
}

const statusText = (page) => page.locator(".offers-form-section .addr-status").first().innerText();

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
    stopDevServer(server, "SIGKILL");
  }
});

/* ══════════ Smoke 1 — PLZ → Ort ══════════ */

test("Smoke 1 — DE + 63743 ergänzt Aschaffenburg in ein leeres Feld", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743" });
  await page.waitForFunction(() => document.querySelector("#ns-s-city")?.value === "Aschaffenburg", { timeout: 10000 });
  await page.close();
});

test("Smoke 1b — mehrere Orte werden NICHT geraten, aber angeboten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "17094" });
  await page.waitForTimeout(1200);
  assert.equal(await page.locator(S_CITY).inputValue(), "", "bei mehreren Orten darf keiner eingesetzt werden");
  await page.locator(S_CITY).click();
  await page.waitForSelector('#ns-s-city-list [role="option"]', { timeout: 8000 });
  const opts = await page.locator('#ns-s-city-list [role="option"]').allInnerTexts();
  assert.ok(opts.join(" ").includes("Blankenhof"), `erwartete Ortsvorschläge, erhielt: ${opts.join(" | ")}`);
  await page.close();
});

/* ══════════ Smoke 2 — Gesamtprüfung läuft, Hinweis statt Sperre ══════════ */

test("Smoke 2 — 63743 + München: Hinweis mit Ortsvorschlag, keine Sperre, Korrektur per Klick", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const log = await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743", city: "München", street: "Schweinheimer Straße 187" });
  await page.waitForSelector(".addr-status--warning", { timeout: 10000 });
  assert.match(await statusText(page), /PLZ und Ort passen evtl\. nicht zusammen/);
  assert.ok(log.some((e) => e.p === "/api/address/validate"), "die Gesamtprüfung lief automatisch");
  assert.equal(await page.locator(".addr-status--error").count(), 0, "kein Fehlerton");
  assert.equal(await page.locator(S_CITY).isDisabled(), false);
  // Korrektur per Klick → neue Prüfung → gefunden.
  await page.locator(".addr-status-city", { hasText: "Aschaffenburg" }).click();
  assert.equal(await page.locator(S_CITY).inputValue(), "Aschaffenburg");
  await page.waitForSelector(".addr-status--success", { timeout: 10000 });
  assert.match(await statusText(page), /Adresse gefunden/);
  assert.ok(!/zustell/i.test(await statusText(page)));
  await page.close();
});

/* ══════════ Smoke 3 + 4 — Vorschläge und Übernahme ══════════ */

test("Smoke 3 — Vorschläge schon ohne PLZ und Ort, mit Hausnummer und Quellenangabe", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const log = await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, {});
  await page.locator(S_STREET).fill("Schweinheimer Str 187");
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 10000 });
  const opts = await page.locator('#ns-s-street-list [role="option"]').allInnerTexts();
  assert.ok(opts[0].includes("Schweinheimer Straße 187") && opts[0].includes("63743 Aschaffenburg"), opts.join(" | "));
  assert.ok(opts.length <= 8);
  const quelle = await page.locator(".addr-suggest-attr").first().innerText();
  assert.match(quelle, /© OpenStreetMap-Mitwirkende/);
  assert.match(quelle, /Powered by Geoapify/);
  const anfrage = log.find((e) => e.p === "/api/address/streets");
  assert.equal(anfrage.q.street, "Schweinheimer Str 187", "gesucht wird mit Hausnummer");
  assert.equal(anfrage.auth, true);
  await page.close();
});

test("Smoke 4 — Auswahl füllt Straße/Hausnummer, PLZ und Ort; Firma, Namen und Zusatz bleiben", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const log = await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, {});
  await page.locator(S_COMPANY).fill("Muster GmbH");
  await page.locator(S_ADD).fill("Etage 3");
  await page.locator(S_STREET).fill("schweinheimer str 187");
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 10000 });
  await page.locator(S_STREET).press("ArrowDown");
  await page.locator(S_STREET).press("Enter");
  await page.waitForTimeout(150);
  const vorAnzahl = log.filter((e) => e.p === "/api/address/streets").length;
  assert.equal(await page.locator(S_STREET).inputValue(), "Schweinheimer Straße 187");
  assert.equal(await page.locator(S_ZIP).inputValue(), "63743");
  assert.equal(await page.locator(S_CITY).inputValue(), "Aschaffenburg");
  assert.equal(await page.locator(S_COMPANY).inputValue(), "Muster GmbH");
  assert.equal(await page.locator(S_ADD).inputValue(), "Etage 3");
  assert.equal(await page.locator(S_FIRST).inputValue(), "Max");
  assert.equal(await page.locator(S_LAST).inputValue(), "Mustermann");
  await page.waitForTimeout(800);
  assert.equal(log.filter((e) => e.p === "/api/address/streets").length, vorAnzahl,
    "nach der Auswahl wird für denselben Wert nicht erneut gesucht");
  assert.equal(await page.locator('#ns-s-street-list [role="option"]').count(), 0, "die Liste ist zu");
  await page.waitForSelector(".addr-status--success", { timeout: 10000 });
  await page.close();
});

test("Smoke 4b — ein Vorschlag ohne Hausnummer behält die getippte", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, {});
  await page.locator(S_STREET).fill("schweinheimer str 42");
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 10000 });
  await page.locator('#ns-s-street-list [role="option"]', { hasText: /^Schweinheimer Straße\s*63743/ }).first()
    .dispatchEvent("mousedown");
  assert.equal(await page.locator(S_STREET).inputValue(), "Schweinheimer Straße 42");
  await page.close();
});

/* ══════════ Smoke 5 — Invalidierung durch die Hausnummer ══════════ */

test("Smoke 5 — eine geänderte Hausnummer verwirft „gefunden“ und prüft neu", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743", city: "Aschaffenburg", street: "Schweinheimer Straße 187" });
  await page.waitForSelector(".addr-status--success", { timeout: 10000 });
  await page.locator(S_STREET).fill("Schweinheimer Straße 42");
  assert.equal(await page.locator(".addr-status--success").count(), 0, "die alte Bestätigung verfällt sofort");
  await page.waitForSelector(".addr-status--warning", { timeout: 10000 });
  assert.match(await statusText(page), /Hausnummer nicht bestätigt/);
  await page.close();
});

/* ══════════ Smoke 6 + 7 — Ausfall und fehlende Einrichtung ══════════ */

test("Smoke 6 — bei Ausfall bleibt das Formular vollständig benutzbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { mode: "down" });
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743", city: "Aschaffenburg", street: "Schweinheimer Straße 187" });
  // Ein Ausfall ist neutral — er sagt nichts über die Eingabe des Kunden.
  await page.waitForSelector(".addr-status--neutral", { timeout: 10000 });
  assert.match(await statusText(page), /derzeit nicht verfügbar/);
  assert.equal(await page.locator(".addr-status--warning").count(), 0, "keine Warnung bei Ausfall");
  assert.equal(await page.locator(S_STREET).isDisabled(), false);
  assert.equal(await page.locator(S_STREET).inputValue(), "Schweinheimer Straße 187", "die Eingabe bleibt unangetastet");
  assert.equal(await page.locator(".addr-status--error").count(), 0);
  await page.close();
});

test("Smoke 7 — ohne eingerichteten Dienst: nichts sichtbar, keine weiteren Anfragen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const log = await setupRoutes(page, { mode: "off" });
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743", city: "Aschaffenburg", street: "Schweinheimer Straße 187" });
  await page.waitForTimeout(1800);
  const nachEingabe = log.length;
  await page.locator(S_STREET).fill("Schweinheimer Straße 18");
  await page.locator(S_ZIP).fill("63741");
  await page.waitForTimeout(1800);
  assert.equal(await page.locator(".addr-status").count(), 0, "keine Statuszeile");
  assert.equal(await page.locator('#ns-s-street-list [role="option"]').count(), 0);
  assert.ok(nachEingabe <= 3, `nur die ersten Anfragen, gemessen ${nachEingabe}`);
  assert.equal(log.length, nachEingabe, "nach „nicht eingerichtet“ fragt die Seite nicht weiter");
  await page.close();
});

/* ══════════ Smoke 8 — 390 px und Touch ══════════ */

test("Smoke 8 — 390 px mit Touch: kein Überlauf, Liste und Quellenangabe im Bild, Optionen ≥ 44 px", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 850 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743", city: "Aschaffenburg" });
  await page.locator(S_STREET).fill("Schweinh");
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 10000 });
  const scrollBreite = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(scrollBreite <= 391, `kein horizontaler Überlauf erwartet, gemessen ${scrollBreite}px`);
  const liste = await page.locator(".addr-suggest-list").first().boundingBox();
  const feld = await page.locator(S_STREET).boundingBox();
  assert.ok(liste.x >= -1 && liste.x + liste.width <= 391);
  assert.ok(Math.abs(liste.width - feld.width) < 2, "die Liste ist so breit wie das Feld");
  const quelle = await page.locator(".addr-suggest-attr").first().boundingBox();
  assert.ok(quelle.x + quelle.width <= 391 && Math.abs(quelle.width - feld.width) < 2);
  const hoehen = await page.locator('#ns-s-street-list [role="option"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  assert.ok(hoehen.every((h) => h >= 44), `Optionen unter 44 px: ${hoehen.join(", ")}`);
  // Sichtbarkeit: Feld und Fläche liegen unter der festen Kopfleiste und im Sichtbereich.
  const sicht = await page.evaluate(() => {
    const kopf = document.querySelector(".mobile-topbar");
    const kopfUnten = kopf && getComputedStyle(kopf).display !== "none" ? kopf.getBoundingClientRect().bottom : 0;
    const input = document.querySelector("#ns-s-street").getBoundingClientRect();
    const pop = document.querySelector(".addr-suggest-pop").getBoundingClientRect();
    return { kopfUnten, inputOben: input.top, popUnten: pop.bottom, hoehe: window.innerHeight };
  });
  assert.ok(sicht.inputOben >= sicht.kopfUnten - 1, `das Feld liegt unter der Kopfleiste: ${JSON.stringify(sicht)}`);
  assert.ok(sicht.popUnten <= sicht.hoehe + 1, `die Fläche ist vollständig sichtbar: ${JSON.stringify(sicht)}`);
  // Touch-Auswahl übernimmt den Vorschlag.
  await page.locator('#ns-s-street-list [role="option"]').first().tap();
  assert.equal(await page.locator(S_STREET).inputValue(), "Schweinheimer Straße 187");
  await ctx.close();
});

/* ══════════ Smoke 9–12 — weitere Formulare ══════════ */

test("Smoke 9 — Adressbuch: Vorschlag füllt Straße, PLZ und Ort", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=addressbook`, { waitUntil: "domcontentloaded" });
  const neu = page.getByRole("button", { name: /Neue Adresse|Eigene Adresse anlegen|Empfänger anlegen/ }).first();
  await neu.waitFor({ timeout: 20000 });
  await neu.click();
  await page.waitForSelector("#abk-streetAndNumber", { timeout: 20000 });
  // Land zuerst — auch im Adressbuch (die Vorbelegung DE bleibt).
  assert.equal(await page.locator("#abk-country").inputValue(), "DE");
  assert.ok(await page.evaluate(() => document.querySelector("#abk-country").getBoundingClientRect().top
    < document.querySelector("#abk-streetAndNumber").getBoundingClientRect().top), "Land vor der Straße");
  await page.locator("#abk-country").selectOption("DE");
  await page.locator("#abk-streetAndNumber").fill("Schweinheimer Str 187");
  await page.waitForSelector('#abk-streetAndNumber-list [role="option"]', { timeout: 10000 });
  await page.locator('#abk-streetAndNumber-list [role="option"]').first().dispatchEvent("mousedown");
  assert.equal(await page.locator("#abk-streetAndNumber").inputValue(), "Schweinheimer Straße 187");
  assert.equal(await page.locator("#abk-postalCode").inputValue(), "63743");
  assert.equal(await page.locator("#abk-city").inputValue(), "Aschaffenburg");
  await page.close();
});

test("Smoke 10 — Firmenprofil: Vorschlag und Prüfung der Geschäftsanschrift", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard?page=profile`, { waitUntil: "domcontentloaded" });
  const bearbeiten = page.getByRole("button", { name: "Unternehmensdaten bearbeiten" });
  await bearbeiten.waitFor({ timeout: 20000 });
  await bearbeiten.click();
  await page.waitForSelector("#pf-street", { timeout: 10000 });
  await page.locator("#pf-street").fill("Schweinheimer Str 187");
  await page.waitForSelector('#pf-street-list [role="option"]', { timeout: 10000 });
  await page.locator('#pf-street-list [role="option"]').first().dispatchEvent("mousedown");
  assert.equal(await page.locator("#pf-street").inputValue(), "Schweinheimer Straße 187");
  assert.equal(await page.locator("#pf-zip").inputValue(), "63743");
  assert.equal(await page.locator("#pf-city").inputValue(), "Aschaffenburg");
  await page.waitForSelector(".addr-status--success", { timeout: 10000 });
  await page.close();
});

test("Smoke 11 — Registrierung: öffentliche Vorschläge ohne Anmeldung und ohne Prüfung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const log = await setupRoutes(page, { angemeldet: false });
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#reg-street", { timeout: 20000 });
  await page.locator("#reg-street").fill("Schweinheimer Str 187");
  await page.waitForSelector('#reg-street-list [role="option"]', { timeout: 10000 });
  await page.locator('#reg-street-list [role="option"]').first().dispatchEvent("mousedown");
  assert.equal(await page.locator("#reg-street").inputValue(), "Schweinheimer Straße 187");
  assert.equal(await page.locator("#reg-zip").inputValue(), "63743");
  assert.equal(await page.locator("#reg-city").inputValue(), "Aschaffenburg");
  await page.waitForTimeout(1500);
  assert.ok(log.length > 0 && log.every((e) => e.p.startsWith("/api/address/public/")), log.map((e) => e.p).join(", "));
  assert.ok(log.every((e) => e.auth === false), "keine Anmeldung mitgeschickt");
  assert.equal(await page.locator(".addr-status").count(), 0, "keine Gesamtprüfung bei der Registrierung");
  await page.close();
});

test("Smoke 12 — Preisrechner: Ort zur PLZ wird ergänzt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await page.locator("#calc-to-country").selectOption("DE");
  await page.locator("#calc-to-city").fill("");
  await page.locator("#calc-to-zip").fill("63743");
  await page.waitForFunction(() => document.querySelector("#calc-to-city")?.value === "Aschaffenburg", { timeout: 10000 });
  await page.close();
});

/* ══════════ Smoke 13–14 — Startzustand ohne Land (Live-Befund 2026-10-15) ══════════ */
// Bis hierher wählten alle Smokes das Land ZUERST — genau der Ablauf, den ein Kunde nicht
// zwingend nimmt. Live tippte man die Straße in das leere Formular und bekam nichts, weil
// ohne Land nicht gesucht wird und das Land unter der Straße stand.

test("Smoke 13 — ohne Land: Hinweis, Straße bleibt, die Landwahl startet die Suche selbst", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const log = await setupRoutes(page);
  await zumFormular(page);
  assert.equal(await page.locator(S_COUNTRY).inputValue(), "", "das Formular startet weiterhin ohne Land");
  // Das Land steht in beiden Adressen VOR der Straße.
  const reihenfolge = await page.evaluate(() => ["s", "r"].map((p) => {
    const land = document.querySelector(`#ns-${p}-country`), strasse = document.querySelector(`#ns-${p}-street`);
    return Boolean(land.compareDocumentPosition(strasse) & Node.DOCUMENT_POSITION_FOLLOWING)
      && land.getBoundingClientRect().top < strasse.getBoundingClientRect().top;
  }));
  assert.deepEqual(reihenfolge, [true, true]);
  // Ohne Land: sichtbarer Hinweis, keine Anfrage — die getippte Straße bleibt stehen.
  assert.equal((await page.locator("#ns-s-street-hint").innerText()).trim(), "Bitte zuerst das Land auswählen.");
  assert.equal((await page.locator("#ns-r-street-hint").innerText()).trim(), "Bitte zuerst das Land auswählen.");
  await page.locator(S_STREET).click();
  await page.keyboard.type("Schweinheimer Str 187", { delay: 20 });
  await page.waitForTimeout(900);
  assert.equal(log.filter((e) => e.p === "/api/address/streets").length, 0, "ohne Land darf nicht gesucht werden");
  // Land wählen → die Suche startet mit der bereits getippten Straße, der Hinweis verschwindet.
  await page.locator(S_COUNTRY).selectOption("DE");
  await page.waitForFunction(() => !document.querySelector("#ns-s-street-hint")
    || !/Land auswählen/.test(document.querySelector("#ns-s-street-hint").textContent), null, { timeout: 5000 });
  await page.waitForTimeout(800);
  const suche = log.filter((e) => e.p === "/api/address/streets");
  assert.equal(suche.length, 1, "genau eine Suche nach der Landwahl");
  assert.deepEqual([suche[0].q.country, suche[0].q.street], ["DE", "Schweinheimer Str 187"]);
  assert.equal(await page.locator(S_STREET).inputValue(), "Schweinheimer Str 187", "die Eingabe bleibt erhalten");
  // Zurück ins Straßenfeld: die Vorschläge sind da, die Auswahl übernimmt wie bisher.
  await page.locator(S_STREET).click();
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 5000 });
  await page.locator('#ns-s-street-list [role="option"]').first().dispatchEvent("mousedown");
  assert.equal(await page.locator(S_STREET).inputValue(), "Schweinheimer Straße 187");
  assert.equal(await page.locator(S_ZIP).inputValue(), "63743");
  assert.equal(await page.locator(S_CITY).inputValue(), "Aschaffenburg");
  await page.close();
});

test("Smoke 14 — Empfänger: Land wählen, per Tab weiter — die Liste öffnet, sobald Vorschläge da sind", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await page.locator("#ns-r-street").fill("Schweinheimer Str 9");
  await page.locator("#ns-r-country").selectOption("DE");
  await page.locator("#ns-r-country").focus();
  await page.keyboard.press("Tab");
  // Zwischen Land und Straße kann der Bundesstaat stehen (nur US/CA) — für DE nicht.
  assert.equal(await page.evaluate(() => document.activeElement?.id), "ns-r-street", "nach dem Land kommt die Straße");
  await page.waitForSelector('#ns-r-street-list [role="option"]', { timeout: 5000 });
  assert.ok(await page.locator('#ns-r-street-list [role="option"]').count() > 0);
  await page.close();
});

/* ══════════ Smoke 15–19 — Premium-Durchgang (2026-10-15) ══════════ */

test("Smoke 15 — Landwechsel DE → FR: alte Liste sofort weg, verspätete DE-Antwort wird verworfen, Eingaben bleiben", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Die DE-Antwort trifft erst nach dem Landwechsel ein.
  const log = await setupRoutes(page, { streetDelay: { DE: 1200 } });
  await zumFormular(page);
  await fuelleAbsender(page, { zip: "63743", city: "Aschaffenburg" });
  await page.locator(S_STREET).fill("Schweinheimer Str 187");
  // Erst eine DE-Liste sichtbar machen (die erste Antwort kommt verzögert).
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 10000 });
  // Jetzt erneut tippen: die neue DE-Anfrage läuft, die Antwort hängt 1,2 s.
  await page.locator(S_STREET).fill("Schweinheimer Str 18");
  await page.waitForTimeout(450);
  assert.ok(log.filter((e) => e.p === "/api/address/streets" && e.q.country === "DE").length >= 2, "zweite DE-Suche läuft");
  await page.locator(S_COUNTRY).selectOption("FR");
  // Sofort: keine DE-Vorschläge mehr, keine Prüfung, alle Eingaben unverändert.
  assert.equal(await page.locator('#ns-s-street-list [role="option"]').count(), 0, "die alte Liste ist sofort weg");
  assert.equal(await page.locator(".addr-status--success").count(), 0);
  assert.equal(await page.locator(S_STREET).inputValue(), "Schweinheimer Str 18");
  assert.equal(await page.locator(S_ZIP).inputValue(), "63743", "die PLZ wird nicht still geändert");
  assert.equal(await page.locator(S_CITY).inputValue(), "Aschaffenburg", "der Ort wird nicht still geändert");
  // Die FR-Liste kommt; die verspätete DE-Antwort landet danach nie in der Liste.
  await page.locator(S_STREET).focus();
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 5000 });
  await page.waitForTimeout(1500);
  const opts = await page.locator('#ns-s-street-list [role="option"]').allInnerTexts();
  assert.ok(opts.length > 0 && opts.every((t) => t.includes("Paris")), `nur FR-Vorschläge erwartet: ${opts.join(" | ")}`);
  const fr = log.filter((e) => e.p === "/api/address/streets" && e.q.country === "FR");
  assert.equal(fr.length, 1, "genau eine Suche für das neue Land");
  // Auswahl übernimmt die FR-Anschrift in Landesreihenfolge — nur Straße, PLZ, Ort.
  await page.locator('#ns-s-street-list [role="option"]').first().dispatchEvent("mousedown");
  assert.equal(await page.locator(S_STREET).inputValue(), "12 Rue de la Paix");
  assert.equal(await page.locator(S_ZIP).inputValue(), "75002");
  assert.equal(await page.locator(S_CITY).inputValue(), "Paris");
  assert.equal(await page.locator(S_FIRST).inputValue(), "Max");
  await page.close();
});

test("Smoke 16 — ruhige Statuszeile: kein Layoutsprung, kein Prüf-Flackern, „gefunden“ tritt zurück", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, {});
  const telefonOben = () => page.evaluate(() => document.querySelector("#ns-s-phone").getBoundingClientRect().top + window.scrollY);
  const vorher = await telefonOben();
  // Zustände protokollieren, die die Zeile annimmt.
  await page.evaluate(() => {
    window.__statusKlassen = [];
    const slot = document.querySelectorAll(".addr-status-slot")[0];
    new MutationObserver(() => {
      const el = slot.querySelector(".addr-status");
      window.__statusKlassen.push(el ? el.className : "leer");
    }).observe(slot, { subtree: true, childList: true, attributes: true });
  });
  await page.locator(S_ZIP).fill("63743");
  await page.locator(S_CITY).fill("Aschaffenburg");
  await page.locator(S_STREET).fill("Schweinheimer Straße 187");
  await page.waitForSelector(".addr-status--success", { timeout: 10000 });
  assert.equal(await telefonOben(), vorher, "„gefunden“ verschiebt nichts");
  await page.locator(S_STREET).fill("Schweinheimer Straße 42");
  assert.equal(await page.locator(".addr-status--success").count(), 0, "keine alte Bestätigung neben neuer Adresse");
  assert.equal(await telefonOben(), vorher, "das Zurücksetzen verschiebt nichts");
  await page.waitForSelector(".addr-status--warning", { timeout: 10000 });
  assert.equal(await telefonOben(), vorher, "der Hinweis verschiebt nichts");
  const klassen = await page.evaluate(() => window.__statusKlassen);
  assert.ok(!klassen.some((k) => /checking/.test(k)), `schnelle Prüfung ohne Zwischenzustand: ${klassen.join(" → ")}`);
  // „Adresse gefunden“ tritt nach kurzer Zeit zurück — das Häkchen bleibt, Platz bleibt.
  await page.locator(S_STREET).fill("Schweinheimer Straße 187");
  await page.waitForSelector(".addr-status--success .addr-status-icon", { timeout: 10000 });
  assert.equal(await page.locator(".addr-status--success .addr-status-text--quiet").count(), 0, "zuerst sichtbar");
  await page.waitForSelector(".addr-status--success .addr-status-text--quiet", { timeout: 6000 });
  assert.equal(await telefonOben(), vorher);
  await page.close();
});

test("Smoke 17 — Ladezeile nur bei spürbarer Wartezeit, verständlicher Leerzustand", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { streetDelay: { DE: 1000 } });
  await zumFormular(page);
  await fuelleAbsender(page, {});
  await page.locator(S_STREET).fill("Schweinheimer");
  await page.waitForSelector(".addr-suggest-state", { timeout: 5000 });
  assert.match(await page.locator(".addr-suggest-state").innerText(), /Suche läuft/);
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 5000 });
  assert.equal(await page.locator(".addr-suggest-state").count(), 0, "die Ladezeile weicht der Liste");
  await page.locator(S_STREET).fill("Xyzqwe");
  await page.waitForSelector(".addr-suggest-state >> text=Keine Vorschläge gefunden", { timeout: 6000 });
  assert.match(await page.locator(".addr-suggest-state").innerText(), /frei eingeben/);
  assert.equal(await page.locator(S_STREET).inputValue(), "Xyzqwe", "freie Eingabe bleibt möglich");
  // Fokus weg → die Leerzeile verschwindet, nichts bleibt stehen.
  await page.locator(S_FIRST).click();
  assert.equal(await page.locator(".addr-suggest-state").count(), 0);
  await page.close();
});

test("Smoke 18 — eine Fläche mit Quellenangabe, getippte Wortanfänge hervorgehoben, Tastatur und Escape", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, {});
  await page.locator(S_STREET).fill("Schweinheimer Str 187");
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 10000 });
  const geo = await page.evaluate(() => {
    const pop = document.querySelector(".addr-suggest-pop");
    const liste = pop.querySelector(".addr-suggest-list"), quelle = pop.querySelector(".addr-suggest-attr");
    const input = document.querySelector("#ns-s-street").getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    return { liste: Boolean(liste), quelle: Boolean(quelle), breite: Math.abs(p.width - input.width),
             hits: [...pop.querySelectorAll('[role="option"]')[0].querySelectorAll(".addr-suggest-hit")].map((e) => e.textContent) };
  });
  assert.equal(geo.liste && geo.quelle, true, "Liste und Quellenangabe in derselben Fläche");
  assert.ok(geo.breite < 1.5, "die Fläche ist so breit wie das Feld");
  assert.deepEqual(geo.hits, ["Schweinheimer", "Str", "187"]);
  await page.locator(S_STREET).press("ArrowDown");
  assert.equal(await page.locator(".addr-suggest-opt--active").count(), 1);
  await page.locator(S_STREET).press("Escape");
  assert.equal(await page.locator(".addr-suggest-pop").count(), 0, "Escape schließt");
  assert.equal(await page.locator(S_STREET).inputValue(), "Schweinheimer Str 187", "Escape ändert nichts an der Eingabe");
  await page.close();
});

test("Smoke 19 — Gesamtablauf: Land → Suche → Auswahl → Korrektur → Formular bleibt nutzbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await zumFormular(page);
  await fuelleAbsender(page, {});
  await page.locator(S_COMPANY).fill("Muster GmbH");
  await page.locator(S_STREET).fill("Schweinheimer Str 187");
  await page.waitForSelector('#ns-s-street-list [role="option"]', { timeout: 10000 });
  await page.locator('#ns-s-street-list [role="option"]').first().click();
  await page.waitForSelector(".addr-status--success", { timeout: 10000 });
  // Korrektur der Hausnummer durch den Kunden: Bestätigung verfällt, neue Prüfung, Hinweis.
  await page.locator(S_STREET).fill("Schweinheimer Straße 189");
  await page.waitForSelector(".addr-status--warning", { timeout: 10000 });
  // Weiterarbeiten: Empfänger erreichbar, Firmenname und Übernahme stehen.
  await page.locator("#ns-r-country").selectOption("FR");
  await page.locator("#ns-r-street").fill("12 rue de la p");
  await page.waitForSelector('#ns-r-street-list [role="option"]', { timeout: 10000 });
  await page.locator('#ns-r-street-list [role="option"]').first().click();
  assert.equal(await page.locator("#ns-r-street").inputValue(), "12 Rue de la Paix");
  assert.equal(await page.locator(S_STREET).inputValue(), "Schweinheimer Straße 189", "die Korrektur des Kunden bleibt");
  assert.equal(await page.locator(S_COMPANY).inputValue(), "Muster GmbH");
  assert.equal(await page.locator(S_ZIP).inputValue(), "63743");
  await page.close();
});
