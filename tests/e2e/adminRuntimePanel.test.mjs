// E2E: Admin → Übersicht → „Betriebssicht der API“ (echter Dev-Server, alle Backendantworten gemockt).
//
// Prüft, was eine Quelltextprüfung nicht erreicht:
//   B1  Der Abschnitt ist eingeklappt und lädt NICHTS, bis er geöffnet wird — die Übersicht bleibt so schnell wie
//       zuvor. Beim Öffnen genau ein Abruf; die fünf Anzeigen tragen die Werte der jüngsten Messzeile.
//   B2  Auffälligkeiten stehen mit Kategorie, Kennzahl und Handlung da; die zugeklappte Zeile nennt ihre Zahl.
//   B3  „Testwarnung senden“ löst genau EINEN POST aus (ohne Körper), die Meldung nennt den echten Ausgang —
//       gesendet, abgeschaltet (409) oder gescheitert (502); die Schaltfläche ist danach wieder bedienbar.
//   B4  Ein gescheiterter Abruf sagt das; „Aktualisieren“ lädt neu, ein geladener Stand bleibt bei einem Fehler stehen.
//   B5  Smartphone 390 px: kein horizontaler Überlauf, die Schaltflächen sind erreichbar.
//
// Es wird KEIN echter Server berührt und keine Mail ausgelöst.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const PORT = 5811, BASE = `http://127.0.0.1:${PORT}`;
const BILDER = (process.env.CE_E2E_SCREENSHOT_DIR || "").trim();

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = {
  id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE",
};

// Eine Messzeile, wie die API sie liefert (Backend lib/opsMonitor.js).
const ZEILE = {
  t: "2026-11-24T15:36:18.654Z", start: "2026-11-24T15:33:17.378Z", laufzeitS: 181,
  anfragen: 1234, fehler5xx: 0, abbrueche: 0,
  laufend: { anfragenMax: 9, buchungenMax: 4, buchungenJetzt: 1 },
  db: { max: 12, belegtMax: 7, freiMin: 5, wartendMax: 0, warteSekunden: 0 },
  faden: { auslastung: 0.127, p99Ms: 21, maxMs: 23 },
  cpuPct: 12.5, rssMb: 142, heapMb: 48, heapAnteil: 0.022,
  http: { offen: 1, neu: 3, leerlaufSchluss: 0 },
};
const RUHIG = {
  instance: "api.confidaraexpress.de", alertMailEnabled: true, thresholds: {},
  samples: [{ ...ZEILE, t: "2026-11-24T15:35:18.654Z", anfragen: 7 }, ZEILE],
  findings: [], queuesReadAt: "2026-11-24T15:33:20.000Z", queuesError: null, lastAlert: null, pendingFindings: [],
};
const AUFFAELLIG = {
  ...RUHIG,
  samples: [{ ...ZEILE, fehler5xx: 14, db: { ...ZEILE.db, belegtMax: 12, warteSekunden: 31 } }],
  findings: [
    { key: "db_stau", category: "Datenbank ausgelastet", metric: "31 Sekunden Wartezeit auf eine freie Verbindung in der letzten Minute",
      affected: "alle Bereiche", action: "Lage beobachten; hält sie an, das Entwicklerteam informieren." },
    { key: "mail_liegt", category: "E-Mails liegen", metric: "3 Rechnungsmails seit längerer Zeit offen",
      affected: "Rechnungsversand", action: "Offene Vorgänge auf der Übersicht prüfen." },
  ],
  lastAlert: { am: "2026-11-24T15:35:18.000Z", befunde: ["mail_liegt"], beendet: [], ausgang: "gesendet" },
  pendingFindings: ["db_stau"],
};

let server, browser;

async function setupRoutes(page, initial = {}) {
  const state = {
    runtimeStatus: initial.runtimeStatus ?? 200,
    runtimeBody: initial.runtimeBody ?? RUHIG,
    testStatus: initial.testStatus ?? 200,
    testBody: initial.testBody ?? { message: "Die Testmeldung wurde an die Betreiberadresse gesendet.", sentAt: "2026-11-24T15:40:00.000Z" },
    testHalten: null, testAbbruch: false,
    calls: { runtime: 0, test: [] },
  };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/operations/runtime")) {
      state.calls.runtime += 1;
      if (state.runtimeStatus !== 200) return json({ error: "Fehler" }, state.runtimeStatus);
      return json(state.runtimeBody);
    }
    if (p.endsWith("/admin/operations/alert-test")) {
      state.calls.test.push({ method: req.method(), body: req.postData() });
      if (state.testHalten) await state.testHalten;          // der Versand „dauert“
      if (state.testAbbruch) return route.abort("failed");   // keine Antwort: der Ausgang bleibt unbekannt
      return json(state.testBody, state.testStatus);
    }
    if (p.endsWith("/admin/operations/queues")) {
      return json({ generatedAt: "2026-11-24T15:36:00.000Z", thresholds: {}, queues: {}, diagnostics: {} });
    }
    if (p.endsWith("/admin/metrics/customer-accounts")) return json({ total: 9 });
    if (p.endsWith("/admin/invoices")) return json({ invoices: [], pagination: { total: 0 } });
    if (p.endsWith("/admin/cancellation-requests")) return json({ cancellationRequests: [], pagination: { total: 0 } });
    if (p.endsWith("/admin/support-requests")) return json({ supportRequests: [], pagination: { total: 0 } });
    if (p.endsWith("/admin/sales-partners")) return json({ partners: [], total: 0, limit: 1, offset: 0 });
    if (p.endsWith("/admin/dispatch-evidence/queue")) return json({ items: [], total: 0, limit: 1, offset: 0 });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return state;
}

async function neueSeite(viewport, initial) {
  const page = await browser.newPage({ viewport });
  const state = await setupRoutes(page, initial);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.locator("#adm-runtime").waitFor({ state: "attached" });
  return { page, state };
}

const oeffnen = async (page) => {
  await page.locator("#adm-runtime > summary").click();
  await page.locator("#adm-runtime[open]").waitFor({ state: "attached" });
};

const ohneUeberlauf = (page) => page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function bild(page, name) {
  if (!BILDER) return;
  mkdirSync(BILDER, { recursive: true });
  await page.locator("#adm-runtime").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(BILDER, name) });
  // Dazu der ganze Abschnitt — auch wenn er höher ist als das Bild.
  await page.locator("#adm-runtime").screenshot({ path: path.join(BILDER, name.replace(/\.png$/, "-abschnitt.png")) });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
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
  if (server) stopDevServer(server, "SIGKILL");
});

test("(B1) eingeklappt lädt der Abschnitt nichts; beim Öffnen genau ein Abruf und die Werte der jüngsten Messzeile", async () => {
  const { page, state } = await neueSeite({ width: 1440, height: 900 });
  try {
    assert.equal(await page.locator("#adm-runtime").getAttribute("open"), null, "der Abschnitt ist anfangs offen");
    assert.equal(state.calls.runtime, 0, "die Messwerte werden schon vor dem Öffnen geladen");
    assert.match(await page.locator("#adm-runtime > summary").innerText(), /Betriebssicht der API\s*·\s*wird beim Öffnen geladen/);

    await oeffnen(page);
    await page.locator('#adm-runtime [data-runtime="requests"] .adm-ops-count').waitFor({ state: "visible" });
    assert.equal(state.calls.runtime, 1);
    const werte = await page.locator("#adm-runtime [data-runtime] .adm-ops-count").allInnerTexts();
    assert.deepEqual(werte.map((w) => w.replace(/ /g, " ").trim()), ["1.234", "0 s", "13 %", "142 MB", "4"]);
    const namen = await page.locator("#adm-runtime [data-runtime] .adm-ops-label").allInnerTexts();
    assert.deepEqual(namen, ["Anfragen", "Warten auf die Datenbank", "Auslastung", "Arbeitsspeicher", "Buchungen gleichzeitig"]);
    assert.equal((await page.locator("#adm-runtime-ruhig").innerText()).trim(), "Keine Auffälligkeit.");
    assert.equal(await page.locator("#adm-runtime [data-finding]").count(), 0);
    assert.match(await page.locator("#adm-runtime-warnmail").innerText(), /Seit dem Start der API ist noch keine Warnmail hinausgegangen\./);
    assert.match(await page.locator("#adm-runtime .adm-runtime-stamp").innerText(), /Stand 24\.11\.2026, 16:36 Uhr · API läuft seit 24\.11\.2026, 16:33 Uhr/);
    assert.match(await page.locator("#adm-runtime > summary").innerText(), /·\s*keine Auffälligkeit/);
    // Zuklappen und erneut öffnen lädt nicht ein zweites Mal von selbst.
    await page.locator("#adm-runtime > summary").click();
    await page.locator("#adm-runtime > summary").click();
    await page.waitForTimeout(300);
    assert.equal(state.calls.runtime, 1);
    assert.equal(state.calls.test.length, 0, "ohne Klick ging eine Testwarnung hinaus");
    assert.ok(await ohneUeberlauf(page));
    await bild(page, "betriebssicht-ruhig-1440.png");
  } finally { await page.close(); }
});

test("(B2) Auffälligkeiten stehen mit Kategorie, Kennzahl und Handlung da; die Kurzfassung nennt ihre Zahl", async () => {
  const { page, state } = await neueSeite({ width: 1440, height: 900 }, { runtimeBody: AUFFAELLIG });
  try {
    await oeffnen(page);
    await page.locator("#adm-runtime [data-finding]").first().waitFor({ state: "visible" });
    assert.equal(state.calls.runtime, 1);
    assert.match(await page.locator("#adm-runtime > summary").innerText(), /·\s*2 Auffälligkeiten/);
    const erste = (await page.locator('#adm-runtime [data-finding="db_stau"]').innerText()).replace(/\s+/g, " ");
    assert.match(erste, /^Datenbank ausgelastet — 31 Sekunden Wartezeit .* Was tun: Lage beobachten; hält sie an, das Entwicklerteam informieren\.$/);
    assert.equal(await page.locator("#adm-runtime [data-finding]").count(), 2);
    assert.equal(await page.locator("#adm-runtime-ruhig").count(), 0);
    const werte = await page.locator("#adm-runtime [data-runtime] .adm-ops-count").allInnerTexts();
    assert.equal(werte[1].replace(/ /g, " ").trim(), "31 s");
    assert.match(await page.locator('#adm-runtime [data-runtime="requests"] .adm-ops-hint').innerText(), /davon 14 mit Serverfehler/);
    const warnmail = await page.locator("#adm-runtime-warnmail").innerText();
    assert.match(warnmail, /Letzte Warnmail: 24\.11\.2026, 16:35 Uhr — gesendet\./);
    assert.match(warnmail, /Eine Auffälligkeit ist vorgemerkt und steht in der nächsten Warnmail\./);
    assert.ok(await ohneUeberlauf(page));
    await bild(page, "betriebssicht-auffaellig-1440.png");
  } finally { await page.close(); }
});

test("(B3) „Testwarnung senden“: genau ein POST ohne Körper; die Meldung nennt den echten Ausgang", async () => {
  const { page, state } = await neueSeite({ width: 1440, height: 900 });
  try {
    await oeffnen(page);
    const knopf = page.locator("#adm-runtime-test");
    await knopf.waitFor({ state: "visible" });
    assert.equal((await knopf.innerText()).trim(), "Testwarnung senden");
    // Der Meldebereich steht dauerhaft im Dokument (ein Vorleseprogramm sagt den wechselnden Text an) — anfangs leer.
    const meldung = page.locator("#adm-runtime-test-result");
    assert.equal(await meldung.count(), 1);
    assert.deepEqual([await meldung.getAttribute("role"), await meldung.getAttribute("aria-live"), (await meldung.innerText()).trim()],
      ["status", "polite", ""]);

    // Während des Sendens: die Schaltfläche bleibt fokussiert und meldet ihren Zustand; ein zweiter Klick sendet nichts.
    let weiter;
    state.testHalten = new Promise((r) => { weiter = r; });
    await knopf.focus();
    await knopf.click();
    await page.waitForFunction(() => document.querySelector("#adm-runtime-test")?.getAttribute("aria-disabled") === "true");
    assert.equal((await knopf.innerText()).trim(), "Testwarnung wird gesendet …");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "adm-runtime-test", "die Schaltfläche hat den Fokus verloren");
    await knopf.click({ force: true });
    await knopf.click({ force: true });
    state.testHalten = null;
    weiter();
    await page.waitForFunction(() => /Testwarnung gesendet/.test(document.querySelector("#adm-runtime-test-result")?.textContent || ""));
    assert.deepEqual(state.calls.test, [{ method: "POST", body: null }], "ein Klick während des Sendens hat ein zweites Mal gesendet");
    assert.equal((await meldung.innerText()).trim(), "Testwarnung gesendet. Bitte das Postfach kontakt@confidaraexpress.de prüfen.");
    assert.equal(await meldung.getAttribute("data-kind"), "ok");
    assert.equal(await knopf.getAttribute("aria-disabled"), null);

    // Abgeschaltet (409): die Meldung sagt, dass nichts hinausging.
    state.testStatus = 409;
    state.testBody = { error: "…", code: "OPS_ALERT_DISABLED" };
    await knopf.click();
    await page.waitForFunction(() => /abgeschaltet/.test(document.querySelector("#adm-runtime-test-result")?.textContent || ""));
    assert.match(await meldung.innerText(), /abgeschaltet\. Es wurde nichts gesendet\.$/);
    assert.equal(await meldung.getAttribute("data-kind"), "error");
    assert.equal(state.calls.test.length, 2);

    // Gescheitert (502).
    state.testStatus = 502;
    state.testBody = { error: "…", code: "OPS_ALERT_SEND_FAILED" };
    await knopf.click();
    await page.waitForFunction(() => /Mailversand prüfen/.test(document.querySelector("#adm-runtime-test-result")?.textContent || ""));
    assert.equal(state.calls.test.length, 3);
    assert.doesNotMatch(await meldung.innerText(), /^Testwarnung gesendet/);

    // Keine Antwort: der Ausgang ist UNBEKANNT — die Meldung behauptet nicht, es sei nichts gesendet worden.
    state.testAbbruch = true;
    await knopf.click();
    await page.waitForFunction(() => /Ausgang der Testwarnung ist unbekannt/.test(document.querySelector("#adm-runtime-test-result")?.textContent || ""));
    assert.match(await meldung.innerText(), /Bitte zuerst das Postfach .* prüfen und erst danach erneut senden\.$/);
    assert.equal(state.calls.test.length, 4);
    state.testAbbruch = false;

    // Status 200 ohne Versandzeitpunkt ist kein Beleg für „gesendet“.
    state.testStatus = 200;
    state.testBody = { message: "ok" };
    await knopf.click();
    await page.waitForFunction(() => document.querySelector("#adm-runtime-test")?.getAttribute("aria-disabled") !== "true");
    assert.match(await meldung.innerText(), /^Der Ausgang der Testwarnung ist unbekannt\./);
    assert.equal(state.calls.test.length, 5);
    await bild(page, "betriebssicht-test-1440.png");
  } finally { await page.close(); }
});

test("(B4) ein gescheiterter Abruf sagt das; „Aktualisieren“ lädt neu, ein geladener Stand bleibt bei einem Fehler stehen", async () => {
  const { page, state } = await neueSeite({ width: 1440, height: 900 }, { runtimeStatus: 500 });
  try {
    await oeffnen(page);
    await page.locator("#adm-runtime [role='alert']").waitFor({ state: "visible" });
    assert.match(await page.locator("#adm-runtime [role='alert']").innerText(), /Die Messwerte sind gerade nicht abrufbar\./);
    assert.match(await page.locator("#adm-runtime > summary").innerText(), /·\s*nicht verfügbar/);
    assert.equal(await page.locator("#adm-runtime [data-runtime]").count(), 0, "ohne Antwort stehen Zahlen da");

    state.runtimeStatus = 200;
    await page.locator("#adm-runtime-refresh").click();
    await page.locator('#adm-runtime [data-runtime="requests"] .adm-ops-count').waitFor({ state: "visible" });
    assert.equal(state.calls.runtime, 2);
    assert.equal(await page.locator("#adm-runtime [role='alert']").count(), 0);

    // Fällt der nächste Abruf aus, bleiben die geladenen Werte stehen — mit dem Hinweis, dass sie nicht aktuell sind.
    state.runtimeStatus = 500;
    await page.locator("#adm-runtime-refresh").click();
    await page.locator("#adm-runtime [role='alert']").waitFor({ state: "visible" });
    assert.equal(state.calls.runtime, 3);
    assert.equal(await page.locator("#adm-runtime [data-runtime]").count(), 5);
    assert.match(await page.locator("#adm-runtime [role='alert']").innerText(), /ließen sich nicht aktualisieren\. Unten steht der zuletzt geladene Stand\./);
    // Die Kurzfassung meldet keine Ruhe aus altem Stand.
    assert.match(await page.locator("#adm-runtime > summary").innerText(), /·\s*nicht aktualisiert/);
    assert.equal(await page.locator("#adm-runtime-refresh").isEnabled(), true);

    // Eine Antwort ohne ihre Listen ist kein Beleg — auch nicht für „keine Auffälligkeit“.
    state.runtimeStatus = 200;
    state.runtimeBody = { instance: "api.confidaraexpress.de" };
    await page.locator("#adm-runtime-refresh").click();
    await page.waitForFunction(() => /nicht aktualisiert/.test(document.querySelector("#adm-runtime > summary")?.textContent || ""));
    assert.equal(state.calls.runtime, 4);
    assert.match(await page.locator("#adm-runtime > summary").innerText(), /·\s*nicht aktualisiert/);
  } finally { await page.close(); }
});

test("(B6) eine Antwort ohne ihre Listen zeigt keine Ruhemeldung — „nicht verfügbar“ statt „keine Auffälligkeit“", async () => {
  const { page, state } = await neueSeite({ width: 1440, height: 900 }, { runtimeBody: {} });
  try {
    await oeffnen(page);
    await page.locator("#adm-runtime [role='alert']").waitFor({ state: "visible" });
    assert.equal(state.calls.runtime, 1);
    assert.match(await page.locator("#adm-runtime [role='alert']").innerText(), /Die Messwerte sind gerade nicht abrufbar\./);
    assert.match(await page.locator("#adm-runtime > summary").innerText(), /·\s*nicht verfügbar/);
    assert.equal(await page.locator("#adm-runtime-ruhig").count(), 0, "ohne Beleg steht „Keine Auffälligkeit.“ da");
    assert.equal(await page.locator("#adm-runtime-warnmail").count(), 0);
  } finally { await page.close(); }
});

test("(B5) Smartphone 390 px: kein horizontaler Überlauf, beide Schaltflächen erreichbar", async () => {
  const { page } = await neueSeite({ width: 390, height: 844 }, { runtimeBody: AUFFAELLIG });
  try {
    await oeffnen(page);
    await page.locator("#adm-runtime [data-finding]").first().waitFor({ state: "visible" });
    assert.ok(await ohneUeberlauf(page), "horizontaler Überlauf bei 390 px");
    for (const id of ["#adm-runtime-refresh", "#adm-runtime-test"]) {
      const kasten = await page.locator(id).boundingBox();
      assert.ok(kasten && kasten.x >= 0 && kasten.x + kasten.width <= 390, `${id} ragt aus dem Bild`);
      assert.ok(kasten.height >= 24, `${id} ist als Touch-Ziel zu klein`);
    }
    await bild(page, "betriebssicht-auffaellig-390.png");
    // 360 px: derselbe Aufbau ohne Überlauf.
    await page.setViewportSize({ width: 360, height: 800 });
    assert.ok(await ohneUeberlauf(page), "horizontaler Überlauf bei 360 px");
  } finally { await page.close(); }
});
