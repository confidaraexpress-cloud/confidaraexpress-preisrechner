// Browser-Smokes: der Trackinglink der ZUSÄTZLICHEN Versand-E-Mails (Go-Live Paket 3).
//
// ─── Warum es diesen Smoke gibt ─────────────────────────────────────────────────────────────
// Paket 3 verschickt an eine zusätzliche E-Mail-Adresse einen Link der Form
//
//     https://confidaraexpress.de/tracking?nummer=<Carrier-Trackingnummer>
//
// Diese Adresse kann einer Person gehören, die KEIN ConfidaraExpress-Konto hat — einem
// Logistikdienstleister, einem Lager, einem Kunden des Kunden. Ein Link, der beim Öffnen
// auf die Anmeldung führt, wäre für genau diesen Empfänger wertlos.
//
// Eine Zusicherung wie `expect(url).toContain("/tracking?nummer=")` beweist das NICHT: sie
// prüft die Zeichenkette, nicht die Erreichbarkeit. Deshalb wird hier ohne Anmeldung ein
// echter Browser auf einen echten Dev-Server geschickt.
//
// Backend vollständig gemockt. Keine echte Buchung, keine echte Mail, kein echter Provider.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5261, BASE = `http://127.0.0.1:${PORT}`;
const NUMMER = "07350000123456";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// Antwort der ÖFFENTLICHEN Trackingroute (GET /api/tracking/public/:key). Sie liefert
// ausschließlich das Trackingteilobjekt — keine Adressen, keine Preise, keine Kontodaten.
const TRACKING_OK = {
  shipmentId: "s_72313e",
  trackingAvailable: true,
  trackingNumber: NUMMER,
  trackingStatus: "in_transit",
  carrierTrackingPage: "https://carrier.example/track/07350000123456",
  tracking: {
    carrierTrackingPage: "https://carrier.example/track/07350000123456",
    data: {
      tracking_number: NUMMER,
      status: "in_transit",
      events: [
        { date: "2026-08-20T09:15:00Z", status: "picked_up", location: { country: "DE" } },
        { date: "2026-08-21T07:40:00Z", status: "in_transit", location: { country: "AT" } },
      ],
    },
  },
};

let server, browser;

// Alles, was ein zusätzlicher Empfänger NIE sehen darf. Die Begriffe stammen aus den
// Feldern, die andere (authentifizierte) Endpunkte führen.
const VERBOTEN = [
  "Musterstr", "Max Mustermann", "Muster GmbH",       // Absender-/Empfänger-PII
  "EUR", "Rechnung", "Betrag", "Netto", "MwSt",       // Preis-/Belegdaten
  "CE-BS", "CE-RE", "CE-AB",                          // interne Belegnummern
  "@example.de", "@unternehmen.de",                   // E-Mail-Adressen
  "JUMiNGO", "JUMINGO", "jumingo",                    // Providerinterna
];

async function neueSeite(opts = {}) {
  const state = { publicCalls: [], authCalls: [], ...opts };
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 1000 } });
  await ctx.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.startsWith("/api/tracking/public/")) {
      state.publicCalls.push({ path: p, auth: req.headers()["authorization"] || null });
      if (state.publicFails) return json({ error: "Sendung nicht gefunden" }, 404);
      return json(state.publicBody || TRACKING_OK);
    }
    // Jeder ANDERE Backendruf wird protokolliert: eine öffentliche Seite darf keinen
    // authentifizierten Endpunkt brauchen.
    state.authCalls.push(p);
    return json({ error: "unauthorized" }, 401);
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { ctx, page, fehler, state };
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore", detached: false,
  });
  const deadline = Date.now() + 60000;
  for (;;) {
    try { const r = await fetch(BASE); if (r.ok || r.status < 500) break; } catch { /* noch nicht da */ }
    if (Date.now() > deadline) throw new Error("Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 300));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.kill("SIGTERM");
});

// ─────────────────────────────────────────────────────────────────────────────

test("T1 — der Link aus der Mail öffnet OHNE Anmeldung die Trackingseite", async () => {
  const { ctx, page, fehler, state } = await neueSeite();
  // Ausdrücklich KEIN Token: genau der Zustand des zusätzlichen Empfängers.
  await page.goto(`${BASE}/tracking?nummer=${NUMMER}`, { waitUntil: "networkidle" });

  // Kein Redirect auf die Anmeldung.
  assert.equal(new URL(page.url()).pathname, "/tracking", `umgeleitet auf ${page.url()}`);
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), null,
    "der Smoke lief versehentlich angemeldet");

  // Die Seite hat die Nummer aus dem Queryparameter selbst abgefragt.
  assert.equal(state.publicCalls.length, 1, `erwartet 1 öffentlicher Trackingruf, war ${state.publicCalls.length}`);
  assert.ok(state.publicCalls[0].path.endsWith(`/api/tracking/public/${NUMMER}`),
    `falscher Pfad: ${state.publicCalls[0].path}`);
  assert.equal(state.publicCalls[0].auth, null, "der öffentliche Abruf sendet einen Authorization-Header");

  // Und es wurde KEIN authentifizierter Endpunkt gebraucht.
  assert.deepEqual(state.authCalls, [], `öffentliche Seite ruft geschützte Endpunkte: ${state.authCalls.join(", ")}`);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("T2 — die Sendung ist tatsächlich sichtbar, nicht nur die leere Suchmaske", async () => {
  const { ctx, page, fehler } = await neueSeite();
  await page.goto(`${BASE}/tracking?nummer=${NUMMER}`, { waitUntil: "networkidle" });

  const text = await page.locator("body").innerText();
  assert.ok(text.includes(NUMMER), "die Trackingnummer steht nicht auf der Seite");
  // Das Suchfeld trägt die Nummer bereits — der Empfänger muss nichts abtippen.
  const feldwert = await page.locator('input[type="text"], input:not([type])').first().inputValue();
  assert.equal(feldwert, NUMMER, `das Suchfeld ist nicht vorbelegt (war: "${feldwert}")`);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("T3 — es werden KEINE privaten Kunden- oder Belegdaten angezeigt", async () => {
  const { ctx, page, fehler } = await neueSeite();
  await page.goto(`${BASE}/tracking?nummer=${NUMMER}`, { waitUntil: "networkidle" });

  const text = await page.locator("body").innerText();
  for (const wort of VERBOTEN) {
    assert.ok(!text.includes(wort), `„${wort}" steht auf der öffentlichen Trackingseite`);
  }
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("T4 — eine unbekannte Nummer ergibt eine ruhige Meldung, keinen Absturz", async () => {
  const { ctx, page, fehler } = await neueSeite({ publicFails: true });
  await page.goto(`${BASE}/tracking?nummer=UNBEKANNT999`, { waitUntil: "networkidle" });

  const text = await page.locator("body").innerText();
  assert.ok(/nicht gefunden|nicht verfügbar|prüf/i.test(text), `keine verständliche Meldung: ${text.slice(0, 200)}`);
  // Auch der Fehlerfall verrät nichts über andere Sendungen.
  for (const wort of VERBOTEN) assert.ok(!text.includes(wort), `„${wort}" im Fehlerfall sichtbar`);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("T5 — auch auf einem Telefon ohne horizontalen Überlauf bedienbar", async () => {
  const { ctx, page, fehler } = await neueSeite({ viewport: { width: 390, height: 780 } });
  await page.goto(`${BASE}/tracking?nummer=${NUMMER}`, { waitUntil: "networkidle" });

  const ueberlauf = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(ueberlauf <= 0, `horizontaler Überlauf: ${ueberlauf}px`);
  assert.ok((await page.locator("body").innerText()).includes(NUMMER), "die Sendung fehlt auf 390 px");
  assert.deepEqual(fehler, []);
  await ctx.close();
});
