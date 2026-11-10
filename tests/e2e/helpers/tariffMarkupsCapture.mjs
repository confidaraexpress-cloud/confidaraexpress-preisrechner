// Sichtprüfung „Individuelle Versandtarife“ (Admin-Kundendetail): Standbilder der Karte bei 1280 und 390 px
// gegen den Dev-Server mit demselben gemockten Backend wie tests/e2e/adminTariffMarkups.test.mjs.
// Headless, ohne Fenster (DEV_SERVER_SPAWN), ein Browserprozess, Viewports nacheinander.
//
//   node tests/e2e/helpers/tariffMarkupsCapture.mjs --out <ordner> [--port 5773]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { DEV_SERVER_SPAWN, stopDevServer } from "./devServer.mjs";

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const OUT = path.resolve(arg("--out", ".visual-qa/tarifadmin"));
const PORT = Number(arg("--port", "5773"));
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress", name: "Anna Admin", role: "admin", status: "approved", country: "DE" };
const KUNDE = { id: 7, name: "Max Mustermann", email: "einkauf@muster-logistik.de", company_name: "Muster Logistik GmbH", role: "customer", status: "approved", country: "DE", customer_number: "CE-K-10031" };
const PRODUKTE = [[22, "UPS Standard", "UPS", "STANDARD"], [23, "UPS Express Saver", "UPS", "EXPRESS"], [29, "UPS Express", "UPS", "EXPRESS"], [84, "DHL Express Domestic", "DHL", "EXPRESS"], [85, "DHL Express 9:00", "DHL", "EXPRESS"], [86, "DHL Express 10:30", "DHL", "EXPRESS"], [87, "DHL Express 12:00", "DHL", "EXPRESS"]];
const PAKETE = [{ id: "p1", weightKg: 1, lengthCm: 20, widthCm: 15, heightCm: 10 }, { id: "p5", weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 20 }, { id: "p15", weightKg: 15, lengthCm: 40, widthCm: 30, heightCm: 30 }, { id: "p20", weightKg: 20, lengthCm: 50, widthCm: 35, heightCm: 30 }, { id: "p30", weightKg: 30, lengthCm: 50, widthCm: 40, heightCm: 35 }];
const EINKAUF = { 22: 938, 23: 1528, 29: 2551, 84: 2442, 85: 8959, 86: 5235, 87: 3373 };
const REFERENZ = { 22: 1008, 23: 1690, 84: 2600, 85: 3900 };
// Zellzustände wie das Backend sie liefert: nicht belastbare Referenzen mit Servergrund, ein nicht verfügbarer Tarif.
const NICHT_BELASTBAR = { "84:p30": "collection_date_mismatch", "85:p30": "delivery_promise_unverified" };
const NICHT_VERFUEGBAR = new Set(["86:p30"]);
// Fehler- und Ladezustände werden über diese Schalter im Mock ausgelöst (nur Mocks, kein Providerkontakt).
const modus = { put: 0, refresh: 0, preview: 0, verzoegerungMs: 0 };
const DESTS = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
const kn = (c, p) => Math.round(c * (100 + p) / 100);
const overrides = { 22: 35 };

function dto() {
  return { userId: 7, provider: "transglobal", account: { standardPercent: 20, expressPercent: 30, standardSource: "customer_confirmed" },
    products: PRODUKTE.map(([key, label, carrier, klasse]) => { const inh = klasse === "EXPRESS" ? 30 : 20; const ov = Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : null;
      return { productKey: key, label, carrier, pricingClass: klasse, inheritedPercent: inh, inheritedSource: klasse === "EXPRESS" ? "express" : "standard", overridePercent: ov, effectivePercent: ov === null ? inh : ov, source: ov === null ? (klasse === "EXPRESS" ? "express" : "standard") : "product", setAt: ov === null ? null : "2026-11-10T10:00:00.000Z", setBy: ov === null ? null : 1 }; }),
    comparison: { destinations: DESTS.map((c) => ({ country: c, hasExampleAddress: true })), sender: { country: "DE", postalCode: "10115", city: "Berlin", street: "Invalidenstraße 43" }, standardPackages: PAKETE, refreshLimit: { max: 10, windowMinutes: 15 }, maxAgeHours: 24 } };
}
function satz(key, draft) {
  const klasse = PRODUKTE.find((p) => p[0] === key)[3];
  if (draft && Object.prototype.hasOwnProperty.call(draft, key)) return draft[key] === null ? { percent: klasse === "EXPRESS" ? 30 : 20, source: klasse === "EXPRESS" ? "express" : "standard", draft: true } : { percent: draft[key], source: "draft", draft: true };
  const ov = overrides[key]; if (ov !== undefined) return { percent: ov, source: "product", draft: false };
  return klasse === "EXPRESS" ? { percent: 30, source: "express", draft: false } : { percent: 20, source: "standard", draft: false };
}
function projektion(run, draft) {
  return { runId: run.id, kind: run.kind, createdAt: "2026-11-10T20:05:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", destinationCountry: run.land, collectionDate: "2026-11-11",
    conditions: { sender: { country: "DE", postalCode: "10115", city: "Berlin", street: "Invalidenstraße 43" }, recipient: { country: "DE", postalCode: "80331", city: "München", street: "Marienplatz 8" }, handover: "pickup", addressType: "business", packageCount: 1, extras: "none", transglobalPriceBasis: "preliminary_minimal_quote", priceType: "net" },
    accountMarkup: { standardPercent: 20, expressPercent: 30 },
    scenarios: run.szenarien.map((s) => ({ id: s.id, package: { weightKg: s.weightKg, lengthCm: s.lengthCm, widthCm: s.widthCm, heightCm: s.heightCm }, status: "ok", providers: { transglobal: "success", jumingo: "success" } })),
    products: PRODUKTE.map(([key, label, carrier, klasse]) => { const m = satz(key, draft); return { productKey: key, label, carrier, pricingClass: klasse, markup: m, rows: run.szenarien.map((s) => {
      const tgOk = !NICHT_VERFUEGBAR.has(`${key}:${s.id}`);
      const grund = NICHT_BELASTBAR[`${key}:${s.id}`] || null;
      const tg = tgOk ? kn(EINKAUF[key], m.percent) : null; const ref = grund ? null : REFERENZ[key] || null;
      const diff = tgOk && ref ? { cents: ref - tg, percent: Math.round(Math.abs(ref - tg) / ref * 10000) / 100 * (ref - tg < 0 ? -1 : 1), verdict: ref - tg > 0 ? "cheaper" : ref - tg < 0 ? "more_expensive" : "equal" } : null;
      return { scenarioId: s.id, transglobal: { status: tgOk ? "ok" : "unavailable", customerNetCents: tg, collectionDate: "2026-11-11", availableWithShipmentDetails: tgOk },
        reference: grund ? { status: "not_comparable", reason: grund, customerNetCents: null, pickupDate: "2026-11-12" } : { status: ref ? "ok" : "no_reference", reason: null, customerNetCents: ref, pickupDate: ref ? "2026-11-11" : null }, difference: diff }; }) }; }),
    ageSeconds: 5 };
}

async function mock(page) {
  let naechste = 1; const runs = {};
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (/\/admin\/users\/7$/.test(p)) return json({ user: KUNDE, summary: {} });
    if (/\/price-markup$/.test(p)) return json({ userId: 7, priceMarkupPercent: 20, expressPriceMarkupPercent: 30, effectiveExpressPriceMarkupPercent: 30, expressMarkupUsesFallback: false, confirmed: true, confirmedAt: "2026-09-01T00:00:00.000Z", confirmedBy: 1, updatedAt: "2026-09-01T00:00:00.000Z" });
    if (/\/tariff-markups$/.test(p) && req.method() === "PUT" && modus.put) return json({ error: "Interner Fehler." }, modus.put);
    if (/\/tariff-markups$/.test(p)) return json(dto());
    if (/\/tariff-comparison$/.test(p)) {
      if (modus.verzoegerungMs) await new Promise((r) => setTimeout(r, modus.verzoegerungMs));
      if (modus.refresh === 429) return json({ error: "Zu viele Anfragen. Bitte später erneut versuchen.", code: "RATE_LIMITED" }, 429);
      if (modus.refresh) return json({ error: "Interner Fehler." }, modus.refresh);
      const b = req.postDataJSON(); const run = { id: String(naechste++), kind: b.custom ? "custom" : "standard", land: b.destinationCountry, szenarien: b.custom ? [{ id: "custom", ...b.custom }] : PAKETE }; runs[run.id] = run; return json(projektion(run, null));
    }
    const m = /\/tariff-comparison\/(\d+)\/preview$/.exec(p);
    if (m && modus.preview === 409) return json({ error: "Der Kundenaufschlag hat sich seit der Aktualisierung geändert. Bitte die Preise aktualisieren.", code: "COMPARISON_STALE" }, 409);
    if (m && modus.preview) return json({ error: "Interner Fehler." }, modus.preview);
    if (m) return json(projektion(runs[m[1]], req.postDataJSON().markups));
    if (p.endsWith("/launch-scope")) return json({ countries: DESTS, destinationCountries: DESTS, originCountries: ["DE"] });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    return json({ items: [], users: [], shipments: [], invoices: [], drafts: [], addresses: [], warehouses: [], summary: null, nextCursor: null, pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
}

const server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
const bericht = { out: OUT, bilder: [], masse: {} };
try {
  const frist = Date.now() + 90000;
  for (;;) { try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* warten */ } if (Date.now() > frist) throw new Error("Dev-Server nicht gestartet"); await new Promise((r) => setTimeout(r, 250)); }
  const browser = await chromium.launch();
  for (const [name, viewport] of [["desktop-1280", { width: 1280, height: 1000 }], ["mobil-390", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, timezoneId: "Europe/Berlin", locale: "de-DE" });
    await mock(page);
    await page.goto(`${BASE}/admin/users/7`, { waitUntil: "domcontentloaded" });
    const karte = page.locator("#adm-tariff-section");
    // Seit der Admin-Vereinfachung (2026-11-10) eingeklappt — per Klick auf den Kopf öffnen.
    await karte.locator(":scope > summary").waitFor({ timeout: 30000 });
    if (!(await karte.evaluate((d) => d.open))) await karte.locator(":scope > summary").click();
    await karte.locator("#adm-tarif-input-22").waitFor({ timeout: 30000 });
    await page.waitForTimeout(400);
    const schuss = async (tag) => { const f = path.join(OUT, `${name}-${tag}.png`); await karte.screenshot({ path: f }); bericht.bilder.push(path.basename(f)); };
    await schuss("1-geladen");
    await page.locator("#adm-tarif-input-85").fill("50");
    await page.locator("#adm-tarif-reset-22").click();
    await page.waitForTimeout(200);
    await schuss("2-entwurf");
    await page.locator("#adm-tarif-refresh").click();
    await karte.locator(".adm-tarif-table").first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    await schuss("3-vergleich");
    await page.locator("#adm-tarif-custom > summary").click();
    await page.locator("#adm-tarif-custom-weight").fill("2,5"); await page.locator("#adm-tarif-custom-length").fill("25"); await page.locator("#adm-tarif-custom-width").fill("20"); await page.locator("#adm-tarif-custom-height").fill("15");
    await page.locator("#adm-tarif-compare").click();
    await page.locator("#adm-tarif-custom .adm-tarif-table").waitFor({ timeout: 10000 });
    await page.locator("#adm-tarif-details > summary").click();
    await page.waitForTimeout(300);
    await schuss("4-eigenes-paket-details");
    // Zellzustände: nicht belastbare Referenz mit Grund (84), nicht verfügbarer Tarif (86).
    await page.locator("#adm-tarif-details > summary").click();
    await page.locator("#adm-tarif-cmp-84 > summary").click();
    await page.waitForTimeout(250);
    await schuss("5-nicht-belastbar");
    await page.locator("#adm-tarif-cmp-86 > summary").click();
    await page.waitForTimeout(250);
    await schuss("6-nicht-verfuegbar");
    // Fehler beim Speichern (500): Meldung, Entwurf bleibt.
    modus.put = 500;
    await page.locator("#adm-tarif-save").click();
    await karte.locator(".alert-error").waitFor({ timeout: 5000 });
    await page.waitForTimeout(150);
    await schuss("7-speichern-fehler");
    modus.put = 0;
    // Vorschau abgelehnt (409 COMPARISON_STALE): „Aktualisierung erforderlich“, keine alten Preise.
    modus.preview = 409;
    await page.locator("#adm-tarif-input-23").fill("25");
    await karte.locator(".adm-tarif-cmp .adm-tarif-note--warn").waitFor({ timeout: 5000 });
    await page.waitForTimeout(150);
    await schuss("8-vorschau-veraltet");
    modus.preview = 0;
    // Ladezustand: verzögerte Antwort, Knopf beschäftigt.
    modus.verzoegerungMs = 2500;
    await page.locator("#adm-tarif-refresh").click();
    await page.locator('#adm-tarif-refresh[aria-busy="true"]').waitFor({ timeout: 3000 });
    await page.waitForTimeout(300);
    await schuss("9-laden");
    // Offen ist weiterhin der Vergleich von 86 – die erste Tabelle im DOM (22) bleibt eingeklappt und damit unsichtbar.
    await karte.locator("#adm-tarif-cmp-86 .adm-tarif-table").waitFor({ timeout: 15000 });
    modus.verzoegerungMs = 0;
    // Fehler beim Preisabruf (500) und Limit (429).
    modus.refresh = 500;
    await page.locator("#adm-tarif-refresh").click();
    await karte.locator('[role="alert"]', { hasText: "Preise konnten nicht abgerufen werden" }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(150);
    await schuss("10-abruf-fehler");
    modus.refresh = 429;
    await page.locator("#adm-tarif-refresh").click();
    await karte.locator('[role="alert"]', { hasText: "Zu viele Aktualisierungen" }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(150);
    await schuss("11-abruf-limit");
    modus.refresh = 0;
    bericht.masse[name] = await page.evaluate(() => {
      const el = document.querySelector("#adm-tariff-section");
      const r = el.getBoundingClientRect();
      const klein = [...el.querySelectorAll("button, input, select, summary")].filter((b) => { const bb = b.getBoundingClientRect(); return bb.width > 0 && (bb.height < 24 || bb.width < 24); }).map((b) => (b.id || b.className || b.tagName) + ` ${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)}`);
      return { kartenbreite: Math.round(r.width), kartenhoehe: Math.round(r.height), scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, kleineZiele: klein };
    });
    await page.close();
  }
  await browser.close();
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(bericht, null, 2));
  console.log(JSON.stringify(bericht, null, 2));
} finally {
  stopDevServer(server, "SIGKILL");
}
