// E2E: Individuelle Versandtarife im Admin-Kundendetail (Betreiberentscheidung 2026-11-10). Echter Dev-Server,
// echtes Chromium, GEMOCKTES Backend mit demselben Vertrag wie routes/admin/tariffMarkups.js (die Datenbankseite
// misst Backend customer-tariff-markups-pg, die Preisseite admin-tariff-comparison).
//
//   A  Laden: sieben Zeilen in Auftragsreihenfolge, individuelle und geerbte Sätze unterscheidbar, keine Änderungen
//   B  Tippen: Vorschau-Zeile „noch nicht gespeichert“, Zähler, kein Providerabruf (kein POST tariff-comparison);
//      „Standard verwenden“ zeigt sofort den geerbten Satz
//   C  Speichern: genau EIN PUT nur mit den geänderten Zeilen (null fürs Zurücksetzen), kein Providerabruf, Erfolg
//   D  Preise aktualisieren: genau EIN POST, Tabelle je Produkt mit fünf Paketen, Wortlaute günstiger/teurer/
//      nicht verfügbar/kein vergleichbares Angebot, Vorabkennzeichnung, Stand
//   E  Vorschau: Prozentänderung → genau ein Preview-POST (entprellt), neuer TG-Preis, kein zweiter Providerabruf
//   F  Ziellandwechsel invalidiert die Basis; veraltete Basis (409) → „Aktualisierung erforderlich“
//   G  Eigenes Paket: POST mit custom, eigene Tabelle; ungültige Eingabe → Fehler ohne POST
//   H  Kundenwechsel: Entwürfe und Basis beginnen leer
//   I  390 px: kein Querüberlauf, Speichern erreichbar
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5772, BASE = `http://127.0.0.1:${PORT}`;
function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress", name: "Anna Admin", role: "admin", status: "approved", country: "DE" };
const KONTEN = {
  7: { id: 7, name: "Max Mustermann", email: "einkauf@muster-logistik.de", company_name: "Muster Logistik GmbH", role: "customer", status: "approved", country: "DE", customer_number: "CE-K-10031" },
  8: { id: 8, name: "Erika Beispiel", email: "erika@beispiel.example", company_name: "Beispiel AG", role: "customer", status: "approved", country: "DE", customer_number: "CE-K-10032" },
};
const PRODUKTE = [
  [22, "UPS Standard", "UPS", "STANDARD"], [23, "UPS Express Saver", "UPS", "EXPRESS"], [29, "UPS Express", "UPS", "EXPRESS"],
  [84, "DHL Express Domestic", "DHL", "EXPRESS"], [85, "DHL Express 9:00", "DHL", "EXPRESS"], [86, "DHL Express 10:30", "DHL", "EXPRESS"], [87, "DHL Express 12:00", "DHL", "EXPRESS"],
];
const PAKETE = [
  { id: "p1", weightKg: 1, lengthCm: 20, widthCm: 15, heightCm: 10 }, { id: "p5", weightKg: 5, lengthCm: 30, widthCm: 20, heightCm: 20 },
  { id: "p15", weightKg: 15, lengthCm: 40, widthCm: 30, heightCm: 30 }, { id: "p20", weightKg: 20, lengthCm: 50, widthCm: 35, heightCm: 30 },
  { id: "p30", weightKg: 30, lengthCm: 50, widthCm: 40, heightCm: 35 },
];
// Einkauf je Produkt in Cent (nur im Mock-Server — der Browser sieht nur Kundenpreise).
const EINKAUF = { 22: 938, 23: 1528, 29: 2551, 84: 2442, 85: 8959, 86: 5235, 87: 3373 };
const REFERENZ = { 22: 1008, 23: 1690, 84: 2600, 85: 3900 }; // JUMiNGO-Kundenpreise; 29/86/87 ohne Referenz
// Nicht belastbare Referenzen (Servergrund REFERENCE_REASON): 30-kg-Paket von 84 mit abweichendem Abholtag, von 85 ohne belegte Zustellzusage.
const NICHT_BELASTBAR = { "84:p30": "collection_date_mismatch", "85:p30": "delivery_promise_unverified" };
const kundennetto = (cents, percent) => Math.round(cents * (100 + percent) / 100);
const DESTS = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];

let server, browser;

async function setup(page, { overrides = { 7: { 22: 35 }, 8: {} }, konto = { standardPercent: 20, expressPercent: 30 }, stale = false } = {}) {
  const state = { overrides: JSON.parse(JSON.stringify(overrides)), puts: [], refreshes: [], previews: [], gets: 0, runs: {}, naechste: 1, stale };
  const dto = (uid) => ({
    userId: uid, provider: "transglobal", account: { ...konto, standardSource: "customer_confirmed" },
    products: PRODUKTE.map(([key, label, carrier, klasse]) => {
      const inherited = klasse === "EXPRESS" ? konto.expressPercent ?? konto.standardPercent : konto.standardPercent;
      const ov = Object.prototype.hasOwnProperty.call(state.overrides[uid] || {}, key) ? state.overrides[uid][key] : null;
      return { productKey: key, label, carrier, pricingClass: klasse, inheritedPercent: inherited, inheritedSource: klasse === "EXPRESS" && konto.expressPercent != null ? "express" : "standard",
        overridePercent: ov, effectivePercent: ov === null ? inherited : ov, source: ov === null ? (klasse === "EXPRESS" && konto.expressPercent != null ? "express" : "standard") : "product",
        setAt: ov === null ? null : "2026-11-10T10:00:00.000Z", setBy: ov === null ? null : 1 };
    }),
    comparison: { destinations: DESTS.map((c) => ({ country: c, hasExampleAddress: true })), sender: { country: "DE", postalCode: "10115", city: "Berlin", street: "Invalidenstraße 43" },
      standardPackages: PAKETE, refreshLimit: { max: 10, windowMinutes: 15 }, maxAgeHours: 24 },
  });
  const satz = (uid, key, draft) => {
    if (draft && Object.prototype.hasOwnProperty.call(draft, key)) {
      if (draft[key] === null) return { percent: PRODUKTE.find((p) => p[0] === key)[3] === "EXPRESS" ? 30 : 20, source: PRODUKTE.find((p) => p[0] === key)[3] === "EXPRESS" ? "express" : "standard", draft: true };
      return { percent: draft[key], source: "draft", draft: true };
    }
    const ov = (state.overrides[uid] || {})[key];
    if (ov !== undefined && ov !== null) return { percent: ov, source: "product", draft: false };
    return PRODUKTE.find((p) => p[0] === key)[3] === "EXPRESS" ? { percent: 30, source: "express", draft: false } : { percent: 20, source: "standard", draft: false };
  };
  const projektion = (run, draft) => ({
    runId: run.id, kind: run.kind, createdAt: run.createdAt, expiresAt: "2099-01-01T00:00:00.000Z", destinationCountry: run.land, collectionDate: "2026-11-11",
    conditions: { sender: { country: "DE", postalCode: "10115", city: "Berlin", street: "Invalidenstraße 43" }, recipient: run.land === "DE" ? { country: "DE", postalCode: "80331", city: "München", street: "Marienplatz 8" } : { country: "AT", postalCode: "1010", city: "Wien", street: "Stephansplatz 1" },
      handover: "pickup", addressType: "business", packageCount: 1, extras: "none", transglobalPriceBasis: "preliminary_minimal_quote", priceType: "net" },
    accountMarkup: { standardPercent: konto.standardPercent, expressPercent: konto.expressPercent },
    scenarios: run.szenarien.map((s) => ({ id: s.id, package: { weightKg: s.weightKg, lengthCm: s.lengthCm, widthCm: s.widthCm, heightCm: s.heightCm }, status: "ok", providers: { transglobal: "success", jumingo: "success" } })),
    products: PRODUKTE.map(([key, label, carrier, klasse]) => {
      const m = satz(run.uid, key, draft);
      const inland = run.land === "DE";
      return { productKey: key, label, carrier, pricingClass: klasse, markup: m, rows: run.szenarien.map((s) => {
        const tgOk = inland || key < 80;
        const tg = tgOk ? kundennetto(EINKAUF[key], m.percent) : null;
        const grund = inland ? NICHT_BELASTBAR[`${key}:${s.id}`] || null : null;
        const ref = REFERENZ[key] && inland && !grund ? REFERENZ[key] : null;
        const diff = tgOk && ref ? { cents: ref - tg, percent: Math.round(Math.abs(ref - tg) / ref * 10000) / 100 * (ref - tg < 0 ? -1 : 1), verdict: ref - tg > 0 ? "cheaper" : ref - tg < 0 ? "more_expensive" : "equal" } : null;
        return { scenarioId: s.id, transglobal: { status: tgOk ? "ok" : "unavailable", customerNetCents: tg, collectionDate: "2026-11-11", availableWithShipmentDetails: tgOk },
          reference: grund ? { status: "not_comparable", reason: grund, customerNetCents: null, pickupDate: "2026-11-12" }
            : { status: ref ? "ok" : "no_reference", reason: null, customerNetCents: ref, pickupDate: ref ? "2026-11-11" : null }, difference: diff };
      }) };
    }),
    ageSeconds: 5,
  });
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    let m = /\/admin\/users\/(\d+)$/.exec(p);
    if (m) return json({ user: KONTEN[m[1]], summary: {} });
    if (/\/admin\/users\/\d+\/price-markup$/.test(p)) {
      return json({ userId: 7, priceMarkupPercent: konto.standardPercent, expressPriceMarkupPercent: konto.expressPercent, effectiveExpressPriceMarkupPercent: konto.expressPercent ?? konto.standardPercent, expressMarkupUsesFallback: konto.expressPercent == null, confirmed: true, confirmedAt: "2026-09-01T00:00:00.000Z", confirmedBy: 1, updatedAt: "2026-09-01T00:00:00.000Z" });
    }
    m = /\/admin\/users\/(\d+)\/tariff-markups$/.exec(p);
    if (m && req.method() === "GET") { state.gets += 1; return json(dto(Number(m[1]))); }
    if (m && req.method() === "PUT") {
      const body = req.postDataJSON(); state.puts.push({ uid: Number(m[1]), body });
      if (state.putStatus) return json({ error: "Interner Fehler." }, state.putStatus);
      const uid = Number(m[1]); state.overrides[uid] = state.overrides[uid] || {};
      for (const [k, v] of Object.entries(body.markups || {})) { if (v === null) delete state.overrides[uid][k]; else state.overrides[uid][k] = v; }
      return json(dto(uid));
    }
    m = /\/admin\/users\/(\d+)\/tariff-comparison$/.exec(p);
    if (m && req.method() === "POST") {
      const body = req.postDataJSON(); state.refreshes.push({ uid: Number(m[1]), body });
      if (state.refreshStatus === 429) return json({ error: "Zu viele Aktualisierungen.", code: "RATE_LIMITED" }, 429);
      if (state.refreshStatus) return json({ error: "Interner Fehler." }, state.refreshStatus);
      if (body.custom && !(Number(body.custom.weightKg) > 0)) return json({ error: "Bitte Gewicht, Länge, Breite und Höhe des Pakets gültig angeben.", code: "INVALID_CUSTOM_PACKAGE" }, 400);
      const run = { id: String(state.naechste++), uid: Number(m[1]), kind: body.custom ? "custom" : "standard", land: body.destinationCountry, createdAt: "2026-11-10T20:05:00.000Z",
        szenarien: body.custom ? [{ id: "custom", ...body.custom }] : PAKETE };
      state.runs[run.id] = run;
      return json(projektion(run, null));
    }
    m = /\/admin\/users\/(\d+)\/tariff-comparison\/(\d+)\/preview$/.exec(p);
    if (m && req.method() === "POST") {
      const body = req.postDataJSON(); state.previews.push({ uid: Number(m[1]), runId: m[2], body });
      if (state.previewStatus) return json({ error: "Interner Fehler." }, state.previewStatus);
      if (state.stale) return json({ error: "Der Kundenaufschlag hat sich seit der Aktualisierung geändert. Bitte die Preise aktualisieren.", code: "COMPARISON_STALE" }, 409);
      const run = state.runs[m[2]];
      if (!run || run.uid !== Number(m[1])) return json({ error: "abgelaufen", code: "COMPARISON_EXPIRED" }, 410);
      return json(projektion(run, body.markups));
    }
    if (p.endsWith("/launch-scope")) return json({ countries: DESTS, destinationCountries: DESTS, originCountries: ["DE"] });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    return json({ items: [], users: [], shipments: [], invoices: [], drafts: [], addresses: [], warehouses: [], summary: null, nextCursor: null, pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  return state;
}

const KARTE = "#adm-tariff-section";
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const ORT = Object.freeze({ timezoneId: "Europe/Berlin", locale: "de-DE" });

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

async function oeffne(page, id = 7) {
  await page.goto(`${BASE}/admin/users/${id}`, { waitUntil: "domcontentloaded" });
  await page.locator(`${KARTE} #adm-tarif-input-22`).waitFor({ timeout: 30000 });
}
const zeile = (page, key) => page.locator(`${KARTE} .adm-tarif-row[data-product="${key}"]`);
const wirksam = async (page, key) => norm(await page.locator(`#adm-tarif-eff-${key}`).innerText());

test("A — Laden: sieben Zeilen in Auftragsreihenfolge, individuell und geerbt unterscheidbar, keine Änderungen, kein Providerabruf", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, ...ORT });
  const state = await setup(page);
  await oeffne(page);
  const keys = await page.locator(`${KARTE} .adm-tarif-row`).evaluateAll((els) => els.map((e) => Number(e.dataset.product)));
  assert.deepEqual(keys, [22, 23, 29, 84, 85, 86, 87]);
  assert.equal(await page.locator("#adm-tarif-input-22").inputValue(), "35,00");
  assert.equal(await page.locator("#adm-tarif-input-23").inputValue(), "");
  assert.equal(await wirksam(page, 22), "35,00 % individuell");
  assert.equal(await wirksam(page, 23), "30,00 % Expressaufschlag des Kontos");
  assert.equal(await wirksam(page, 22), "35,00 % individuell");
  assert.match(norm(await page.locator(`${KARTE} .adm-card-head`).innerText()), /Individuelle Versandtarife 1 individuell/);
  assert.equal(norm(await page.locator("#adm-tarif-dirty").innerText()), "Keine Änderungen");
  assert.equal(await page.locator("#adm-tarif-save").isDisabled(), true);
  assert.equal(await page.locator("#adm-tarif-reset-23").isDisabled(), true, "ohne Wert nichts zurückzusetzen");
  assert.equal(await page.locator("#adm-tarif-destination").inputValue(), "DE");
  const erste = await page.locator("#adm-tarif-destination option").first().innerText();
  assert.equal(norm(erste), "Deutschland");
  assert.equal((await page.locator("#adm-tarif-destination option").count()), 27);
  assert.match(norm(await page.locator(KARTE).innerText()), /Vorläufiger Preisvergleich/);
  assert.equal(state.refreshes.length, 0, "kein Providerabruf beim Öffnen");
  assert.equal(state.previews.length, 0);
  await page.close();
});

test("B — Tippen: Entwurf sichtbar und gezählt, kein Providerabruf; „Standard verwenden“ zeigt sofort den geerbten Satz", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, ...ORT });
  const state = await setup(page);
  await oeffne(page);
  await page.locator("#adm-tarif-input-85").fill("50");
  assert.equal(await wirksam(page, 85), "50,00 % individuell (Entwurf) — noch nicht gespeichert");
  assert.equal(norm(await page.locator("#adm-tarif-dirty").innerText()), "● Ungespeicherte Änderung (1)");
  assert.equal(await page.locator("#adm-tarif-save").isDisabled(), false);
  await page.locator("#adm-tarif-reset-22").click();
  assert.equal(await page.locator("#adm-tarif-input-22").inputValue(), "");
  assert.equal(await wirksam(page, 22), "20,00 % Standardaufschlag des Kontos (Entwurf) — noch nicht gespeichert");
  assert.equal(norm(await page.locator("#adm-tarif-dirty").innerText()), "● Ungespeicherte Änderungen (2)");
  // Ungültig: Hinweis am Feld, Speichern gesperrt.
  await page.locator("#adm-tarif-input-23").fill("120");
  await page.locator("#adm-tarif-input-23").blur();
  assert.match(norm(await page.locator("#adm-tarif-error-23").innerText()), /zwischen 0 und 100/);
  assert.equal(await page.locator("#adm-tarif-save").isDisabled(), true);
  await page.locator("#adm-tarif-input-23").fill("");
  await page.waitForTimeout(500);
  assert.equal(state.refreshes.length, 0, "Tippen ruft keinen Provider");
  assert.equal(state.previews.length, 0, "ohne Vergleichsbasis keine Vorschau-Anfrage");
  assert.equal(state.puts.length, 0);
  await page.close();
});

test("C — Speichern: genau ein PUT nur mit den geänderten Zeilen (null = zurücksetzen), kein Providerabruf, Erfolgsmeldung", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, ...ORT });
  const state = await setup(page);
  await oeffne(page);
  await page.locator("#adm-tarif-input-85").fill("50");
  await page.locator("#adm-tarif-reset-22").click();
  await page.locator("#adm-tarif-input-29").fill("0");
  await page.locator("#adm-tarif-save").click();
  await page.locator(`${KARTE} .alert-success`).waitFor({ timeout: 10000 });
  assert.equal(state.puts.length, 1);
  assert.deepEqual(state.puts[0].body, { markups: { 22: null, 29: 0, 85: 50 } });
  assert.equal(state.refreshes.length, 0, "Speichern ruft keinen Provider");
  assert.equal(await wirksam(page, 85), "50,00 % individuell");
  assert.equal(await wirksam(page, 22), "20,00 % Standardaufschlag des Kontos");
  assert.equal(await wirksam(page, 29), "0,00 % individuell");
  assert.equal(norm(await page.locator("#adm-tarif-dirty").innerText()), "Keine Änderungen");
  assert.match(norm(await page.locator(`${KARTE} .adm-card-head`).innerText()), /2 individuell/);
  await page.close();
});

test("D — Preise aktualisieren: genau ein POST, je Produkt fünf Pakete, Wortlaute, Vorabkennzeichnung, Stand", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, ...ORT });
  const state = await setup(page);
  await oeffne(page);
  await page.locator("#adm-tarif-refresh").click();
  await page.locator(`${KARTE} .adm-tarif-table`).first().waitFor({ timeout: 10000 });
  assert.equal(state.refreshes.length, 1);
  assert.deepEqual(state.refreshes[0].body, { destinationCountry: "DE" });
  // Der erste Produktvergleich öffnet sich; die Tabelle zeigt fünf Pakete.
  const z22 = zeile(page, 22);
  assert.equal(await z22.locator("tbody tr").count(), 5);
  const zeilen = await z22.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").trim())));
  assert.equal(zeilen[0][0], "1 kg · 20 × 15 × 10 cm");
  assert.equal(zeilen[0][1], "12,66 €", "9,38 × 1,35 (gespeicherter Produktsatz)");
  assert.equal(zeilen[0][2], "10,08 €");
  assert.equal(zeilen[0][3], "2,58 € (25,60 %) teurer");
  assert.equal(zeilen[4][0], "30 kg · 50 × 40 × 35 cm");
  assert.match(norm(await z22.innerText()), /Beispielpreise: 35,00 %/);
  // Ein Produkt ohne Referenz und ein Satz aus dem Konto (nur ein Vergleich gleichzeitig offen).
  await page.locator(`#adm-tarif-cmp-29 > summary`).click();
  assert.equal(await page.locator("#adm-tarif-cmp-22").evaluate((d) => d.open), false, "der vorige Vergleich klappt zu");
  assert.equal(await page.locator("#adm-tarif-cmp-29").evaluate((d) => d.open), true);
  const z29 = await zeile(page, 29).locator("tbody tr").first().evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim())));
  assert.equal(z29[0][1], "33,16 €");
  assert.equal(z29[0][2], "Kein vergleichbares Angebot");
  assert.equal(z29[0][3], "Kein vergleichbares Angebot");
  const text = norm(await page.locator(KARTE).innerText());
  assert.match(text, /Vorabpreise der Preisauskunft/);
  assert.match(text, /Stand: 10\.11\.2026, 21:05 Uhr/);
  assert.match(text, /Beispielpreise: 30,00 %/);
  assert.match(text, /netto/);
  assert.doesNotMatch(text, /purchase|Einkauf/i);
  // Vergleichsdetails nennen die Bedingungen.
  await page.locator("#adm-tarif-details > summary").click();
  const details = norm(await page.locator("#adm-tarif-details").innerText());
  assert.match(details, /Invalidenstraße 43, 10115 Berlin/);
  assert.match(details, /Marienplatz 8, 80331 München/);
  assert.match(details, /11\.11\.2026/);
  assert.match(details, /Fahrerabholung/);
  assert.match(details, /Geschäftsadressen/);
  await page.close();
});

test("E — Vorschau: Prozentänderung → genau ein Preview-POST (entprellt), neuer TG-Preis, kein zweiter Providerabruf; Speichern ebenfalls ohne", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, ...ORT });
  const state = await setup(page);
  await oeffne(page);
  await page.locator("#adm-tarif-refresh").click();
  await page.locator(`${KARTE} .adm-tarif-table`).first().waitFor({ timeout: 10000 });
  await page.locator("#adm-tarif-input-22").fill("50");
  await page.waitForFunction(() => document.querySelector('.adm-tarif-row[data-product="22"] tbody tr td:nth-child(2)')?.innerText.trim() === "14,07 €", null, { timeout: 5000 });
  await page.waitForTimeout(700);
  assert.equal(state.previews.length, 1, "eine entprellte Vorschau-Anfrage");
  assert.deepEqual(state.previews[0].body, { markups: { 22: 50 } });
  assert.equal(state.refreshes.length, 1, "kein zweiter Providerabruf");
  assert.match(norm(await zeile(page, 22).innerText()), /Beispielpreise: 50,00 % — Vorschau mit den eingegebenen Sätzen — noch nicht gespeichert/);
  // Zurücksetzen im Entwurf: sofort der geerbte Satz in der Vorschau.
  await page.locator("#adm-tarif-reset-22").click();
  await page.waitForFunction(() => document.querySelector('.adm-tarif-row[data-product="22"] tbody tr td:nth-child(2)')?.innerText.trim() === "11,26 €", null, { timeout: 5000 });
  assert.deepEqual(state.previews[state.previews.length - 1].body, { markups: { 22: null } });
  await page.locator("#adm-tarif-save").click();
  await page.locator(`${KARTE} .alert-success`).waitFor({ timeout: 10000 });
  assert.equal(state.refreshes.length, 1, "Speichern ruft keinen Provider");
  assert.equal(state.puts.length, 1);
  await page.close();
});

test("F — Ziellandwechsel invalidiert die Basis ohne Abruf; veraltete Basis (409) → „Aktualisierung erforderlich“", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, ...ORT });
  const state = await setup(page);
  await oeffne(page);
  await page.locator("#adm-tarif-refresh").click();
  await page.locator(`${KARTE} .adm-tarif-table`).first().waitFor({ timeout: 10000 });
  await page.locator("#adm-tarif-destination").selectOption("AT");
  await page.waitForTimeout(300);
  assert.equal(await page.locator(`${KARTE} .adm-tarif-table`).count(), 0, "alte Preise verschwinden");
  assert.equal(state.refreshes.length, 1, "kein automatischer Abruf nach dem Wechsel");
  await page.locator("#adm-tarif-refresh").click();
  await page.locator(`${KARTE} .adm-tarif-table`).first().waitFor({ timeout: 10000 });
  assert.equal(state.refreshes[1].body.destinationCountry, "AT");
  await page.locator("#adm-tarif-cmp-85 > summary").click();
  const z85 = await zeile(page, 85).locator("tbody tr").first().evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim())));
  assert.equal(z85[0][1], "Tarif nicht verfügbar");
  assert.equal(z85[0][3], "—");
  // Veraltete Basis: der Server lehnt die Vorschau ab → Hinweis, kein erfundener Preis.
  state.stale = true;
  await page.locator("#adm-tarif-input-22").fill("40");
  await page.locator(`${KARTE} .adm-tarif-cmp .adm-tarif-note--warn`).waitFor({ timeout: 5000 });
  assert.match(norm(await page.locator(`${KARTE} .adm-tarif-cmp`).innerText()), /Aktualisierung erforderlich/);
  assert.equal(await page.locator(`${KARTE} .adm-tarif-table:visible`).count(), 0, "keine alten Preise mehr sichtbar");
  assert.equal(state.refreshes.length, 2, "auch jetzt kein automatischer Abruf");
  await page.close();
});

test("G — Eigenes Paket: POST mit custom, eigene Tabelle; ungültige Eingabe → Hinweis ohne POST", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, ...ORT });
  const state = await setup(page);
  await oeffne(page);
  await page.locator("#adm-tarif-custom > summary").click();
  await page.locator("#adm-tarif-compare").click();
  assert.match(norm(await page.locator("#adm-tarif-custom").innerText()), /gültig angeben/);
  assert.equal(state.refreshes.length, 0);
  await page.locator("#adm-tarif-custom-weight").fill("2,5");
  await page.locator("#adm-tarif-custom-length").fill("25");
  await page.locator("#adm-tarif-custom-width").fill("20");
  await page.locator("#adm-tarif-custom-height").fill("15");
  await page.locator("#adm-tarif-compare").click();
  await page.locator("#adm-tarif-custom .adm-tarif-table").waitFor({ timeout: 10000 });
  assert.equal(state.refreshes.length, 1);
  assert.deepEqual(state.refreshes[0].body, { destinationCountry: "DE", custom: { weightKg: 2.5, lengthCm: 25, widthCm: 20, heightCm: 15 } });
  assert.equal(await page.locator("#adm-tarif-custom tbody tr").count(), 7, "ein Paket, sieben Produkte");
  assert.match(norm(await page.locator("#adm-tarif-custom").innerText()), /2,5 kg · 25 × 20 × 15 cm/);
  await page.close();
});

test("H — Kundenwechsel: Entwürfe und Vergleichsbasis beginnen leer, keine Vermischung", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, ...ORT });
  const state = await setup(page);
  await oeffne(page);
  await page.locator("#adm-tarif-refresh").click();
  await page.locator(`${KARTE} .adm-tarif-table`).first().waitFor({ timeout: 10000 });
  await page.locator("#adm-tarif-input-85").fill("50");
  await page.goto(`${BASE}/admin/users/8`, { waitUntil: "domcontentloaded" });
  await page.locator(`${KARTE} #adm-tarif-input-22`).waitFor({ timeout: 30000 });
  assert.equal(await page.locator("#adm-tarif-input-22").inputValue(), "", "Kunde 8 hat keinen Produktsatz");
  assert.equal(await page.locator("#adm-tarif-input-85").inputValue(), "", "der Entwurf von Kunde 7 ist nicht mitgewandert");
  assert.equal(norm(await page.locator("#adm-tarif-dirty").innerText()), "Keine Änderungen");
  assert.equal(await page.locator(`${KARTE} .adm-tarif-table`).count(), 0, "keine fremde Vergleichsbasis");
  assert.equal(state.refreshes.length, 1);
  assert.ok(state.gets >= 2);
  await page.close();
});

test("I — 390 px: kein Querüberlauf, Speichern und Aktualisieren erreichbar, Tabelle scrollt in ihrem Rahmen", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, ...ORT });
  await setup(page);
  await oeffne(page);
  await page.locator("#adm-tarif-refresh").click();
  await page.locator(`${KARTE} .adm-tarif-table`).first().waitFor({ timeout: 10000 });
  const mass = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  assert.ok(mass.scroll <= mass.client + 1, `Querüberlauf ${mass.scroll} > ${mass.client}`);
  // Die offene Vergleichstabelle bleibt innerhalb der Karte: kein Abschneiden der Zeile 22 (Knopf) und der Tabelle.
  const innen = await page.evaluate(() => {
    const karte = document.querySelector("#adm-tariff-section").getBoundingClientRect();
    const reset = document.querySelector("#adm-tarif-reset-22").getBoundingClientRect();
    const tabelle = document.querySelector('.adm-tarif-row[data-product="22"] .adm-tarif-table').getBoundingClientRect();
    const zellen = [...document.querySelectorAll('.adm-tarif-row[data-product="22"] tbody tr:first-child td')].map((td) => td.getBoundingClientRect().right);
    return { karteRechts: karte.right, resetRechts: reset.right, tabelleRechts: tabelle.right, zellenRechts: Math.max(...zellen) };
  });
  assert.ok(innen.resetRechts <= innen.karteRechts + 1, `„Standard verwenden“ abgeschnitten: ${innen.resetRechts} > ${innen.karteRechts}`);
  assert.ok(innen.tabelleRechts <= innen.karteRechts + 1, `Tabelle abgeschnitten: ${innen.tabelleRechts} > ${innen.karteRechts}`);
  assert.ok(innen.zellenRechts <= innen.karteRechts + 1, `Zelle abgeschnitten: ${innen.zellenRechts} > ${innen.karteRechts}`);
  // Gestapelt: jede Zelle trägt ihre Beschriftung als ::before (innerText enthält Pseudo-Inhalte nicht), die Werte stehen sichtbar.
  const gestapelt = await page.evaluate(() => {
    const tds = [...document.querySelectorAll('.adm-tarif-row[data-product="22"] tbody tr:first-child td')];
    return tds.map((td) => ({ label: getComputedStyle(td, "::before").content.replace(/"/g, ""), text: td.innerText.trim(), display: getComputedStyle(td).display, sichtbar: td.getBoundingClientRect().width > 0 }));
  });
  assert.deepEqual(gestapelt.map((z) => z.text), ["1 kg · 20 × 15 × 10 cm", "12,66 €", "10,08 €", "2,58 € (25,60 %) teurer"]);
  assert.deepEqual(gestapelt.slice(1).map((z) => z.label), ["CE über TG", "CE über JUMiNGO", "Unterschied"]);
  assert.ok(gestapelt.every((z) => z.display === "flex" && z.sichtbar), "gestapelte Zellen");
  const btn = await page.locator("#adm-tarif-save").boundingBox();
  assert.ok(btn && btn.width >= 44 && btn.height >= 44, "Speichern als Touchziel");
  const r = await page.locator("#adm-tarif-refresh").boundingBox();
  assert.ok(r && r.height >= 40);
  await page.close();
});

test("J — Fehlerpfade: Speichern 500 → Meldung, Entwurf bleibt; Abruf 500/429 → Wortlaut ohne Tabelle; nicht belastbare Referenz nennt den Grund ohne Preis; Vorschau-Fehler ohne erfundenen Preis", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, ...ORT });
  const state = await setup(page);
  await oeffne(page);
  // Speichern scheitert: genau ein PUT, Fehlermeldung, der Entwurf bleibt erhalten.
  await page.locator("#adm-tarif-input-23").fill("25");
  state.putStatus = 500;
  await page.locator("#adm-tarif-save").click();
  await page.locator(`${KARTE} .alert-error`).waitFor({ timeout: 5000 });
  assert.equal(state.puts.length, 1);
  assert.match(norm(await page.locator(`${KARTE} .alert-error`).innerText()), /Die Tarifaufschläge konnten nicht gespeichert werden/);
  assert.equal(await page.locator("#adm-tarif-input-23").inputValue(), "25", "der Entwurf bleibt erhalten");
  assert.equal(norm(await page.locator("#adm-tarif-dirty").innerText()), "● Ungespeicherte Änderung (1)");
  assert.equal(state.refreshes.length, 0, "kein Providerabruf durch den Fehler");
  state.putStatus = 0;
  // Preisabruf scheitert: 500 → allgemeiner Wortlaut, 429 → Limitwortlaut; nie eine Tabelle, nie ein Preis.
  state.refreshStatus = 500;
  await page.locator("#adm-tarif-refresh").click();
  await page.locator(`${KARTE} [role="alert"]`, { hasText: "Preise konnten nicht abgerufen werden. Bitte erneut versuchen." }).waitFor({ timeout: 5000 });
  assert.equal(await page.locator(`${KARTE} .adm-tarif-table`).count(), 0);
  assert.equal(await page.locator("#adm-tarif-refresh").getAttribute("aria-busy"), null, "Knopf wieder frei");
  state.refreshStatus = 429;
  await page.locator("#adm-tarif-refresh").click();
  await page.locator(`${KARTE} [role="alert"]`, { hasText: "Zu viele Aktualisierungen in kurzer Zeit." }).waitFor({ timeout: 5000 });
  assert.equal(await page.locator(`${KARTE} .adm-tarif-table`).count(), 0);
  assert.equal(state.refreshes.length, 2);
  // Danach gelingt der Abruf; die Fehlermeldung verschwindet.
  state.refreshStatus = 0;
  await page.locator("#adm-tarif-refresh").click();
  await page.locator(`${KARTE} .adm-tarif-table`).first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator(`${KARTE} .alert-error`).count(), 0, "keine alte Fehlermeldung");
  // Nicht belastbare Referenzen nennen den Servergrund – ohne Referenzpreis und ohne Unterschied.
  const zellen = async (key) => zeile(page, key).locator("tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").trim())));
  await page.locator("#adm-tarif-cmp-84 > summary").click();
  const z84 = await zellen(84);
  assert.equal(z84[0][2], "26,00 €", "die ersten Pakete haben eine Referenz");
  assert.equal(z84[4][0], "30 kg · 50 × 40 × 35 cm");
  assert.equal(z84[4][2], "Abweichender Abholtag", "die JUMiNGO-Spalte nennt den Grund – nie einen Preis");
  assert.equal(z84[4][3], "Kein belastbarer Vergleich");
  await page.locator("#adm-tarif-cmp-85 > summary").click();
  const z85 = await zellen(85);
  assert.equal(z85[4][2], "Zustellzusage nicht belegt");
  assert.equal(z85[4][3], "Kein belastbarer Vergleich");
  // Vorschau scheitert (500): Fehlermeldung, die Tabelle zeigt weiter die gespeicherten Sätze, kein erfundener Vorschaupreis.
  state.previewStatus = 500;
  await page.locator("#adm-tarif-cmp-22 > summary").click();
  await page.locator("#adm-tarif-input-22").fill("40");
  await page.locator(`${KARTE} [role="alert"]`, { hasText: "Preise konnten nicht abgerufen werden. Bitte erneut versuchen." }).waitFor({ timeout: 5000 });
  assert.ok(state.previews.length >= 1, "die Vorschau wurde angefragt");
  const z22 = await zellen(22);
  assert.equal(z22[0][1], "12,66 €", "gespeicherter Satz 35 %, kein Vorschaupreis mit 40 %");
  assert.doesNotMatch(norm(await zeile(page, 22).innerText()), /Vorschau mit den eingegebenen Sätzen/);
  assert.equal(state.refreshes.length, 3, "kein Providerabruf durch den Vorschaufehler");
  await page.close();
});
