// E2E: Admin → Übersicht — Kennzahlen-Statusparameter und Partial-Success-
// Fehlertext (echter Dev-Server). Prüft, was eine Quelltextprüfung nicht
// erreicht: dass die fünf Kennzahlen-Requests exakt den realen
// Backend-Vertrag treffen (nicht nur irgendeine Querystring), dass ein
// einzelner Ausfall nicht mehr fälschlich "alle Kennzahlen" behauptet, und
// dass "Aktualisieren"/"Erneut versuchen" wirklich alle fünf neu laden.
//
// Die Mocks bilden den echten Backend-Vertrag nach (siehe routes/admin.js):
//   • GET /admin/cancellation-requests: status ∈ {pending,in_review,accepted,
//     rejected} — jeder andere Wert (auch "open") → 400 CANCELLATION_STATUS_
//     INVALID. Das ist der Grund, warum der frühere status:"open" dort nie
//     unbemerkt hätte funktionieren dürfen.
//   • GET /admin/invoices: status wird NUR bei "unpaid"/"paid" gefiltert;
//     jeder andere Wert wird vom Backend still IGNORIERT — die Antwort bleibt
//     200, liefert aber den ungefilterten Gesamtbestand statt der erwarteten
//     Teilmenge. Ein regressiertes status:"open" würde hier keinen Fehler
//     werfen, sondern eine falsche (zu hohe) Zahl anzeigen — deshalb prüft
//     dieser Test den KONKRETEN Wert, nicht nur den Response-Status.
//   • GET /admin/support-requests: status=open ist der echte Initialstatus.
//   • GET /admin/users: kennt keinen Statusfilter.
//
// Alle Backendantworten sind gemockt; es wird KEIN echter Server verändert.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5238, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = {
  id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE",
};

const CANCELLATION_VALID_STATUSES = new Set(["pending", "in_review", "accepted", "rejected"]);

// Feste, voneinander verschiedene Zähler je Filter — so beweist ein Test, dass
// eine Kennzahl tatsächlich den zu IHREM Filter gehörenden Wert zeigt und
// nicht zufällig einen benachbarten (z. B. den ungefilterten Rechnungsbestand).
const TOTALS = { users: 11, invoicesUnpaid: 6, invoicesOverdue: 2, invoicesUnfiltered: 19, cancellations: 4, support: 5 };

let server, browser;

// `state` ist mutierbar, damit ein Test zwischen Ladeversuchen (Retry) das
// Serververhalten ändern kann (z. B. cancellationsStatus 500 → 200).
async function setupRoutes(page, initial = {}) {
  const state = {
    cancellationsStatus: initial.cancellationsStatus ?? 200,
    invoicesStatus: initial.invoicesStatus ?? 200,
    calls: { users: [], invoices: [], cancellations: [], support: [] },
  };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (b, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });

    if (p.endsWith("/admin/users")) {
      state.calls.users.push(url.search);
      return json({ users: [], pagination: { total: TOTALS.users } });
    }

    if (p.endsWith("/admin/invoices")) {
      state.calls.invoices.push(url.search);
      if (state.invoicesStatus !== 200) return json({ error: "Serverfehler" }, state.invoicesStatus);
      const status = url.searchParams.get("status");
      const overdue = url.searchParams.get("overdue");
      if (status === "unpaid") return json({ invoices: [], pagination: { total: TOTALS.invoicesUnpaid } });
      if (overdue === "true") return json({ invoices: [], pagination: { total: TOTALS.invoicesOverdue } });
      // Unbekannter/fehlender Statusfilter: das echte Backend ignoriert ihn
      // still und liefert den UNGEFILTERTEN Bestand — kein Fehler, aber eine
      // andere Zahl. Genau daran erkennt der Test ein regressiertes "open".
      return json({ invoices: [], pagination: { total: TOTALS.invoicesUnfiltered } });
    }

    if (p.endsWith("/admin/cancellation-requests")) {
      state.calls.cancellations.push(url.search);
      if (state.cancellationsStatus !== 200) return json({ error: "Serverfehler" }, state.cancellationsStatus);
      const status = url.searchParams.get("status");
      if (!CANCELLATION_VALID_STATUSES.has(status)) {
        return json({ error: "Ungültiger Status.", code: "CANCELLATION_STATUS_INVALID" }, 400);
      }
      return json({ cancellationRequests: [], pagination: { total: TOTALS.cancellations } });
    }

    if (p.endsWith("/admin/support-requests")) {
      state.calls.support.push(url.search);
      return json({ supportRequests: [], pagination: { total: TOTALS.support } });
    }

    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return state;
}

async function openOverview(page) {
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.locator(".adm-metric").first().waitFor({ state: "visible" });
}

const metricValues = (page) => page.locator(".adm-metric-value").allTextContents();
const metricHints = (page) => page.locator(".adm-metric-hint").allTextContents();

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", detached: true });
  const deadline = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > deadline) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

console.log("\nAlle fünf Kennzahlen — korrekte Parameter, kein Fehlerbanner\n");

test("alle fünf Requests treffen den realen Vertrag; die Werte stammen aus der jeweils gefilterten Antwort", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page);
  await openOverview(page);

  const werte = (await metricValues(page)).map((w) => w.trim());
  // Reihenfolge laut ADMIN_METRICS: Kunden, offene Rechnungen, überfällige
  // Rechnungen, Stornierungen, Support.
  assert.deepEqual(werte, ["11", "6", "2", "4", "5"]);

  // Offene Rechnungen zeigt den GEFILTERTEN Bestand (6), nicht den
  // ungefilterten (19) — das beweist, dass status=unpaid tatsächlich ankam.
  assert.notEqual(werte[1], String(TOTALS.invoicesUnfiltered));

  // Kein Fehlerbanner und keine volle Fehlerkarte bei vollem Erfolg.
  assert.equal(await page.locator(".adm-inline-error").count(), 0);
  assert.equal(await page.locator(".ce-state--error").count(), 0);
  assert.equal(await page.locator(".adm-metrics").count(), 1, "die Kennzahlenliste fehlt");

  // Direkter Beweis, dass "open" bei keiner der drei betroffenen Kennzahlen
  // je wieder gesendet wird.
  assert.ok(state.calls.cancellations.every((qs) => !qs.includes("status=open")),
    `cancellations sendete status=open: ${state.calls.cancellations}`);
  assert.ok(state.calls.invoices.every((qs) => !qs.includes("status=open")),
    `invoices sendete status=open: ${state.calls.invoices}`);
  assert.ok(state.calls.cancellations.some((qs) => qs.includes("status=pending")),
    "cancellations sendete nie status=pending");
  assert.ok(state.calls.invoices.some((qs) => qs.includes("status=unpaid")),
    "invoices sendete nie status=unpaid");
  // Support bleibt bewusst bei "open" — das ist dort der korrekte Wert.
  assert.ok(state.calls.support.some((qs) => qs.includes("status=open")),
    "support sendete nie status=open");

  await page.close();
});

console.log("\nStornierungen — realer 400-Vertrag statt Blanko-Mock\n");

test("ein regressiertes status=open würde am echten Vertrag scheitern (400) — die App sendet es nicht mehr", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page);
  await openOverview(page);

  const werte = (await metricValues(page)).map((w) => w.trim());
  assert.equal(werte[3], "4", "Stornierungen zeigt nicht den echten Zähler — status wurde vom Mock abgelehnt (400)");
  assert.equal(state.calls.cancellations.length, 1);
  assert.match(state.calls.cancellations[0], /status=pending/);
  await page.close();
});

console.log("\nRechnungen — gefilterter statt ungefilterter Bestand\n");

test("„Offene Rechnungen“ zeigt den mit status=unpaid gefilterten Zähler, nicht den Gesamtbestand", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page);
  await openOverview(page);

  const werte = (await metricValues(page)).map((w) => w.trim());
  assert.equal(werte[1], String(TOTALS.invoicesUnpaid));
  assert.notEqual(werte[1], String(TOTALS.invoicesUnfiltered));
  // Zwei Requests an /admin/invoices (offene + überfällige), keiner mit "open".
  assert.equal(state.calls.invoices.length, 2);
  assert.ok(state.calls.invoices.every((qs) => !qs.includes("status=open")));
  await page.close();
});

console.log("\nPartial-Failure — nur die betroffene Kennzahl fehlt\n");

test("Stornierungen scheitert (500), die anderen vier bleiben real sichtbar — Banner exakt „Einige Kennzahlen konnten nicht geladen werden.“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page, { cancellationsStatus: 500 });
  await openOverview(page);

  const werte = (await metricValues(page)).map((w) => w.trim());
  assert.deepEqual(werte, ["11", "6", "2", "—", "5"]);

  const hinweise = await metricHints(page);
  assert.ok(hinweise[3].includes("Anzahl nicht verfügbar"), `Stornierungen zeigt keinen Unavailable-Hinweis: ${hinweise[3]}`);

  // Die Kennzahlenliste bleibt vollständig sichtbar — keine volle Fehlerkarte.
  assert.equal(await page.locator(".adm-metrics").count(), 1);
  assert.equal(await page.locator(".ce-state--error").count(), 0, "die volle Fehlerkarte ersetzt fälschlich die Kennzahlenliste");

  const banner = page.locator(".adm-inline-error");
  await banner.waitFor({ state: "visible" });
  assert.equal((await banner.locator("span").first().textContent()).trim(),
    "Einige Kennzahlen konnten nicht geladen werden.");
  await page.close();
});

console.log("\nVollständiger Fehlerfall — unverändertes Verhalten\n");

test("scheitern alle fünf, zeigt die volle Fehlerkarte exakt „Die Kennzahlen konnten nicht geladen werden.“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Vollständiger Ausfall: ALLE Kennzahlen-Endpunkte antworten 500 (nur die
  // Identitätsprüfung bleibt erreichbar, sonst käme man gar nicht auf die Seite).
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith("/kundenbereich")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: ADMIN }) });
    }
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Serverfehler" }) });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });

  const fehlerkarte = page.locator(".ce-state--error");
  await fehlerkarte.waitFor({ state: "visible" });
  assert.equal((await page.locator(".ce-state--error .ce-state-title").textContent()).trim(),
    "Die Kennzahlen konnten nicht geladen werden.");
  // Bei voll ausgefallener Kennzahlenreihe ersetzt die Fehlerkarte die Liste.
  assert.equal(await page.locator(".adm-metrics").count(), 0);
  // Die Bereiche darunter bleiben trotzdem erreichbar.
  assert.ok(await page.locator(".adm-tile").count() >= 6);
  await page.close();
});

console.log("\nRetry — lädt wirklich alle fünf neu, nicht nur die gescheiterte\n");

test("„Erneut versuchen“ lädt alle fünf Kennzahlen neu; nach Erfolg verschwindet der Banner vollständig", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page, { cancellationsStatus: 500 });
  await openOverview(page);

  const banner = page.locator(".adm-inline-error");
  await banner.waitFor({ state: "visible" });
  assert.equal(state.calls.users.length, 1);
  assert.equal(state.calls.invoices.length, 2);
  assert.equal(state.calls.cancellations.length, 1);
  assert.equal(state.calls.support.length, 1);

  // Stornierungen erholt sich — der nächste Ladeversuch muss das zeigen.
  state.cancellationsStatus = 200;
  await banner.getByRole("button", { name: /Erneut versuchen/ }).click();
  await page.waitForTimeout(400);

  // Alle vier übrigen Endpunkte wurden ERNEUT aufgerufen, nicht nur der
  // vorher gescheiterte — der Retry lädt bewusst die volle Kennzahlenreihe.
  assert.equal(state.calls.users.length, 2, "Kunden wurde beim Retry nicht neu geladen");
  assert.equal(state.calls.invoices.length, 4, "Rechnungen wurden beim Retry nicht neu geladen");
  assert.equal(state.calls.cancellations.length, 2, "Stornierungen wurde beim Retry nicht neu geladen");
  assert.equal(state.calls.support.length, 2, "Support wurde beim Retry nicht neu geladen");

  await page.waitForSelector(".adm-inline-error", { state: "detached", timeout: 5000 });
  assert.equal(await page.locator(".adm-inline-error").count(), 0, "der Banner blieb nach vollständigem Erfolg stehen");
  assert.equal(await page.locator(".ce-state--error").count(), 0);

  const werte = (await metricValues(page)).map((w) => w.trim());
  assert.deepEqual(werte, ["11", "6", "2", "4", "5"]);
  await page.close();
});

test("„Aktualisieren“ im Seitenkopf löst denselben vollständigen Ladevorgang aus", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setupRoutes(page);
  await openOverview(page);
  assert.equal(state.calls.users.length, 1);

  await page.getByRole("button", { name: /Aktualisieren/ }).click();
  await page.waitForTimeout(400);
  assert.equal(state.calls.users.length, 2, "Aktualisieren lud die Kunden-Kennzahl nicht neu");
  assert.equal(state.calls.cancellations.length, 2, "Aktualisieren lud die Stornierungen nicht neu");
  await page.close();
});
