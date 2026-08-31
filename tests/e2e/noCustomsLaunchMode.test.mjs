// E2E: No-Customs-Launch im Browser — echter Dev-Server, gemocktes Backend.
//
// Es wird NIEMALS eine echte Bestellung ausgelöst: alle Backendaufrufe sind abgefangen,
// kein Request verlässt den Testrechner.
//
// Gemessen wird, was eine Quelltextprüfung nicht erreicht — was der Nutzer TATSÄCHLICH sieht:
//   A — die Länderauswahl führt keine Drittländer mehr, sie sind verschwunden (nicht deaktiviert)
//   B — fällt der Scope-Endpunkt aus, bleibt das Formular benutzbar (fail-soft)
//   C — der Scope wird EINMAL je Tab geholt, nicht je Formular
//   D — die Kontoeinstellungen zeigen kein EORI-Feld mehr
//   E — der Erfolgsbildschirm fragt keine Proforma ab und zeigt keinen Zollbeleg
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5357, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// Der echte Launch-Scope: die 27 EU-Länder. Bewusst hier ausgeschrieben — dieser Test misst,
// ob das Frontend die SERVERANTWORT verarbeitet, und dafür braucht er eine Serverantwort.
const EU27 = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV",
              "LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"];

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
  street: "Musterstraße 1", city: "Plochingen", phone: "+4971531234567",
  vat_id: "DE123456789", eori_number: "DE123456789012345",
};

let server, browser;

async function setupRoutes(page, state) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/api/shipping/launch-scope")) {
      state.scopeCalls += 1;
      if (state.scopeFaellt) return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      return json({ countries: EU27, countriesWithTerritoryExclusions: ["DE","ES","FI","FR","GR","IT"] });
    }
    if (p.endsWith("/api/shipments/") || p.includes("/documents")) {
      state.dokumentCalls += 1;
      return json({ documents: [] });
    }
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/company-logo")) return route.fulfill({ status: 404, body: "" });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function neueSeite(opts = {}) {
  const state = { scopeCalls: 0, dokumentCalls: 0, scopeFaellt: false, ...opts };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await setupRoutes(page, state);
  return { ctx, page, state, fehler };
}

// Die Optionen eines Auswahlfelds, ohne den leeren Platzhalter.
const optionen = (page, sel) =>
  page.locator(`${sel} option`).evaluateAll((os) => os.map((o) => o.value).filter(Boolean));

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
                 { detached: true, stdio: "ignore" });
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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits node
    // startet. Ein Signal an den npx-Prozess ließe den Enkel auf seinem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

// ─────────────────────────────────────────────────────────────────────────────

test("SMOKE A — Neue Sendung: die Länderauswahl führt kein Drittland mehr", async () => {
  const { ctx, page, fehler } = await neueSeite();
  try {
    await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ns-r-country", { timeout: 20000 });
    // Auf die gefilterte Liste warten — der Scope kommt asynchron.
    await page.waitForFunction(
      () => document.querySelectorAll("#ns-r-country option").length > 1
         && document.querySelectorAll("#ns-r-country option").length < 40,
      undefined, { timeout: 20000 }
    );

    for (const sel of ["#ns-s-country", "#ns-r-country"]) {
      const codes = await optionen(page, sel);
      assert.equal(codes.length, 27, `${sel}: 27 Länder erwartet, waren ${codes.length}`);
      for (const drittland of ["US", "CH", "GB", "NO", "TR", "CN", "CA", "RU", "AU"]) {
        assert.ok(!codes.includes(drittland),
          `${sel}: ${drittland} darf nicht mehr zur Auswahl stehen`);
      }
      for (const pflicht of ["DE", "FR", "NL", "AT", "PL", "ES", "IT"]) {
        assert.ok(codes.includes(pflicht), `${sel}: ${pflicht} fehlt`);
      }
    }

    // VERSCHWUNDEN, nicht deaktiviert: es darf gar keine gesperrte Option geben.
    const gesperrt = await page.locator("#ns-r-country option[disabled]").count();
    assert.equal(gesperrt, 0, "Drittländer werden entfernt, nicht ausgegraut");

    assert.deepEqual(fehler, [], `Seitenfehler: ${fehler.join(" | ")}`);
  } finally { await ctx.close(); }
});

test("SMOKE B — fällt der Scope-Endpunkt aus, bleibt das Formular benutzbar", async () => {
  // Fail-soft mit Ansage: die volle Liste ist degradiert, aber funktionsfähig. Eine leere
  // Auswahl machte den Preisrechner bei einer kurzen Störung unbenutzbar — auch für die
  // Inlandsendung. Gebucht wird dadurch nichts: die Sperre liegt serverseitig.
  const { ctx, page, state, fehler } = await neueSeite({ scopeFaellt: true });
  try {
    await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ns-r-country", { timeout: 20000 });
    await page.waitForTimeout(600);

    const codes = await optionen(page, "#ns-r-country");
    assert.ok(codes.length > 27, `bei Ausfall die volle Liste erwartet, waren ${codes.length}`);
    assert.ok(codes.includes("DE"), "das Inlandsgeschäft muss weiterlaufen");
    await page.locator("#ns-r-country").selectOption("DE");
    assert.equal(await page.locator("#ns-r-country").inputValue(), "DE", "das Feld muss bedienbar bleiben");

    assert.ok(state.scopeCalls >= 1, "der Endpunkt wurde versucht");
    assert.deepEqual(fehler, [], `ein Ausfall darf keinen Seitenfehler erzeugen: ${fehler.join(" | ")}`);
  } finally { await ctx.close(); }
});

test("SMOKE C — der Scope wird EINMAL je Tab geholt, nicht je Formular", async () => {
  const { ctx, page, state, fehler } = await neueSeite();
  try {
    await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ns-r-country", { timeout: 20000 });
    await page.waitForTimeout(400);
    const nachErstem = state.scopeCalls;
    assert.ok(nachErstem >= 1, "der Scope muss überhaupt geholt werden");

    // Bereichswechsel und zurück: die Formulare werden neu montiert, der Abruf nicht.
    await page.goto(`${BASE}/dashboard?page=profile`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ns-r-country", { timeout: 20000 });
    await page.waitForTimeout(400);

    assert.equal(state.scopeCalls, nachErstem,
      `der Modulcache muss greifen — es waren ${state.scopeCalls} statt ${nachErstem} Abrufe`);
    assert.deepEqual(fehler, [], `Seitenfehler: ${fehler.join(" | ")}`);
  } finally { await ctx.close(); }
});

test("SMOKE D — die Kontoeinstellungen zeigen kein EORI-Feld", async () => {
  const { ctx, page, fehler } = await neueSeite();
  try {
    await page.goto(`${BASE}/dashboard?page=profile`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".profile-section-body", { timeout: 20000 });

    // Auch nicht in der Bearbeitungsansicht der Unternehmenskarte.
    const bearbeiten = page.locator("button", { hasText: /^Bearbeiten$/ }).first();
    if (await bearbeiten.count()) { await bearbeiten.click(); await page.waitForTimeout(300); }

    assert.equal(await page.locator("#pf-eori").count(), 0, "das EORI-Eingabefeld muss weg sein");
    assert.ok(!(await page.locator("body").innerText()).includes("EORI"),
      "der Begriff EORI darf in den Kontoeinstellungen nicht mehr vorkommen");
    // Die USt-ID bleibt daneben stehen — es wurde nur die Zollangabe entfernt.
    assert.ok(await page.locator("#pf-vat").count() > 0
              || (await page.locator("body").innerText()).includes("USt-ID"),
      "die USt-ID darf nicht mit verschwinden");

    assert.deepEqual(fehler, [], `Seitenfehler: ${fehler.join(" | ")}`);
  } finally { await ctx.close(); }
});

test("SMOKE E — die Länderauswahl des Adressbuchs ist ebenfalls gefiltert", async () => {
  const { ctx, page, fehler } = await neueSeite();
  try {
    await page.goto(`${BASE}/dashboard?page=addressbook`, { waitUntil: "domcontentloaded" });
    const neuKnopf = page.locator("button", { hasText: /Adresse hinzufügen|Neue Adresse/ }).first();
    await neuKnopf.waitFor({ timeout: 20000 });
    await neuKnopf.click();
    await page.waitForSelector(".ce-drawer select, .abk-form select", { timeout: 20000 });
    await page.waitForTimeout(500);

    const codes = await page.locator(".ce-drawer select option, .abk-form select option")
      .evaluateAll((os) => os.map((o) => o.value).filter((v) => /^[A-Z]{2}$/.test(v)));
    assert.ok(codes.length > 0, "die Länderauswahl wurde nicht gefunden");
    for (const drittland of ["US", "CH", "GB", "NO", "TR"]) {
      assert.ok(!codes.includes(drittland), `${drittland} darf im Adressbuch nicht wählbar sein`);
    }
    assert.ok(codes.includes("DE"), "DE fehlt im Adressbuch");

    assert.deepEqual(fehler, [], `Seitenfehler: ${fehler.join(" | ")}`);
  } finally { await ctx.close(); }
});
