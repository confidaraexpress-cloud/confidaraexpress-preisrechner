// E2E: Premium-Redesign, Hauptanwendung — Anmeldung (Konzept A) und die öffentliche Kundenbereich-Demo im echten
// Browser. Die Demo braucht kein Backend: sie darf den Server nie erreichen, jede Anfrage dorthin lässt den Test
// scheitern. Keine Buchung, keine E-Mail.
//
//   V4  Anmeldung: Lichter auf der Karte, gleitende Reitermarke, kein Weg zum Preisrechner auf der Seite.
//   D1  Demo ohne Anmeldung: Übersicht, jeder Menüpunkt mit eigener Überschrift, Paketbühne in „Neue Sendung“,
//       keine einzige Anfrage an den Server, das echte Token dieses Browsers bleibt unsichtbar und unverändert.
//   D2  Demo: simulierte Buchung bis zur Bestätigung — eindeutig als Simulation gekennzeichnet, SIM-Nummern.
//   D3  Demo 390 px: kein Querscrollen, die Demo-Leiste verdeckt keinen Inhalt.
//   D4  Die Demo öffnet den echten Kundenbereich nicht: ohne Anmeldung führt /dashboard weiter zur Anmeldung.
//   D5  Kopfsuche (Vorschau A/B): Sendung, Rechnung und Adresse finden, per Tastatur und Maus öffnen, hervorgehoben.
//   D6  Die Kopfsuche erscheint erst ab 1024 px.
//   D7  Suche von einer Seite außerhalb des Dashboards: hervorgehoben, im Browserverlauf nur Art und Kennung.
//   D8  Menütaste „Weitere Aktionen“ (Entwürfe, Adressbuch, Bestand): rund, so hoch wie die Kapsel daneben und auf
//       ihrer Mitte, die Punkte ganz in der Fläche; auf dem Telefon 44 px.
//
// Der öffentliche Preisrechner steht in premiumParityPublic.test.mjs (je Suite genau ein Vite-Server).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { fuelleVersandformular, berechneAngebote } from "./helpers/newShipmentForm.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5642, BASE_APP = `http://127.0.0.1:${PORT}`;
const API = "https://api.confidaraexpress.de";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

let server, browser;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));

async function warteAufServer(basis) {
  const frist = Date.now() + 120000;
  for (;;) {
    try { const r = await fetch(`${basis}/`); if (r.ok) return; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error(`Vite-Dev-Server ${basis} nicht gestartet`);
    await kurz(250);
  }
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  await warteAufServer(BASE_APP);
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
});

const lichter = (page, auswahl) => page.$$eval(auswahl, (els) => els.map((e) => {
  const s = getComputedStyle(e);
  return { animation: s.animationName, opacity: Number(s.opacity) };
}));

test("V4 — Anmeldung: Lichter auf der Karte, gleitende Reitermarke, kein Weg zum Preisrechner", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  await ctx.route(`${API}/**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  try {
    await page.goto(`${BASE_APP}/login`, { waitUntil: "domcontentloaded" });
    // Seit dem statischen Seitengerüst (Komplettabschluss, Abschnitt 5) steht die Reitermarke schon vor React im Bild:
    // gewartet wird auf die gerenderte Seite (erst dort trägt das Formularfeld seine id) und auf ihre Lichter.
    await page.waitForSelector("#auth-email", { timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll(".nk-lichter .nk-licht").length >= 20, null, { timeout: 10000 })
      .catch(() => {});
    const l = await lichter(page, ".nk-lichter .nk-licht");
    assert.ok(l.length >= 20, `zu wenige Lichter: ${l.length}`);
    // Seit Abschnitt 5 (2026-10-27) läuft auf der Anmeldung zuerst eine Lichtwelle (nk-aufglimmen), danach funkeln
    // die Städte einzeln weiter (nk-funkeln) — beide Animationen stehen in der Liste.
    assert.ok(l.every((x) => x.animation.split(/,\s*/).includes("nk-funkeln")), "nicht jedes Licht funkelt");
    // Die Karte steht ab dem ersten Bild (statisches Seitengerüst): EIN Kartenbild, keine nachgeladene Wellenmaske
    // (img.nk-welle entfiel mit Abschnitt 5) — die Welle laufen die Lichter selbst.
    assert.equal(await page.locator(".auth-map img.auth-map-img").count(), 1);
    assert.equal(await page.locator("img.nk-welle").count(), 0, "die nachgeladene Wellenmaske ist zurück");
    assert.equal(await page.locator(".auth-map .nk-lichter--welle").count(), 1, "die Lichtwelle startet nicht");
    const links = await page.$eval(".auth-tabs-marke", (m) => m.getBoundingClientRect().left);
    await page.locator(".auth-tabs button").nth(1).click();
    await kurz(450);
    const rechts = await page.$eval(".auth-tabs-marke", (m) => m.getBoundingClientRect().left);
    assert.ok(rechts > links + 20, "die Marke gleitet zum gewählten Reiter");
    assert.equal(await page.getByRole("link", { name: /Preisrechner/i }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /Preisrechner/i }).count(), 0);
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

/**
 * Ein Browser mit einer ECHTEN Sitzung: Token und laufender Versandvorgang liegen im Speicher. Jede Anfrage an den
 * Server wird abgelehnt und gezählt — während die Seite in der Demo ist, darf es keine geben.
 */
async function demoBrowser(viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem("e2e-vorbelegt")) {
      localStorage.setItem("ce_token", "ECHTES-TOKEN");
      sessionStorage.setItem("e2e-vorbelegt", "1");
    }
  });
  const ausDerDemo = [];
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const ziel = new URL(req.url());
    const serverziel = ziel.origin === API || /^\/(api|kunde|kundenbereich|login|register|auth)(\/|$)/.test(ziel.pathname) && req.resourceType() === "fetch";
    if (!serverziel) return route.continue();
    let seite = "";
    try { seite = new URL(req.frame().url()).pathname; } catch { /* ohne Rahmen */ }
    if (/^\/demo(\/|$)/.test(seite)) ausDerDemo.push(`${req.method()} ${ziel.pathname}`);
    // Die Buchungsseite fragt den Rechtskontext; in der Demo beantwortet ihn die Demo-Datenquelle — hier nie.
    if (ziel.pathname === "/api/legal/booking-context") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false }) });
    return route.abort();
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { ctx, page, fehler, ausDerDemo };
}

const MENUE = [
  ["shipments", "Sendungen"], ["invoices", "Rechnungen"], ["addressbook", "Adressbuch"], ["drafts", "Entwürfe"],
  ["tracking", "Sendung verfolgen"], ["inventory", "Lagerübersicht"], ["products", "Artikel"], ["stock", "Bestand"],
  ["orders", "Aufträge"], ["deliverynotes", "Lieferscheine"], ["movements", "Bewegungen"], ["profile", "Kontoeinstellungen"],
  ["support", "Supportanfragen"],
  ["new", "Neue Sendung"],
];

test("D1 — Demo ohne Anmeldung: jeder Menüpunkt, Paketbühne, keine Anfrage an den Server, echtes Token unsichtbar", async () => {
  const { ctx, page, fehler, ausDerDemo } = await demoBrowser();
  try {
    await page.goto(`${BASE_APP}/demo`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/demo\/dashboard$/, { timeout: 60000 });
    await page.waitForSelector("h1", { timeout: 30000 });
    assert.match(await page.locator("h1").first().innerText(), /Max Mustermann/);
    assert.equal(await page.locator("html[data-ce-demo]").count(), 1);
    assert.match(await page.locator(".demo-leiste").innerText(), /Demo mit Beispieldaten/);
    assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), "demo", "die Demo sieht das echte Token nicht");
    assert.match(await page.title(), /^Demo · /);
    assert.equal(await page.locator('meta[name="robots"][content="noindex"]').count(), 1);

    for (const [bereich, titel] of MENUE) {
      await page.goto(`${BASE_APP}/demo/dashboard?page=${bereich}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction((t) => [...document.querySelectorAll("h1")].some((h) => h.textContent.trim() === t), titel, { timeout: 20000 });
      assert.equal(new URL(page.url()).pathname, "/demo/dashboard", `${bereich}: bleibt in der Demo`);
    }
    // Navigation innerhalb der Demo über die Seitenleiste: die Router-Basis bleibt /demo.
    await page.locator(".nitem", { hasText: "Rechnungen" }).first().click();
    await page.waitForFunction(() => [...document.querySelectorAll("h1")].some((h) => h.textContent.trim() === "Rechnungen"), null, { timeout: 20000 });
    assert.match(new URL(page.url()).pathname, /^\/demo\//);

    // „Neue Sendung“: die Paketbühne nimmt die Maße auf.
    await page.goto(`${BASE_APP}/demo/dashboard?page=new`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ns-length", { timeout: 20000 });
    const stufe = () => page.$eval(".ce-paket--app", (f) => ({ zustand: f.dataset.paketZustand, oben: f.querySelector(".ce-paket-oben").style.transform }));
    await page.fill("#ns-length", "40");
    await page.fill("#ns-width", "30");
    await page.fill("#ns-height", "20");
    await kurz(600);
    const a = await stufe();
    assert.equal(a.zustand, "vollstaendig");
    await page.fill("#ns-length", "80");
    await kurz(600);
    assert.notEqual((await stufe()).oben, a.oben);

    assert.deepEqual(ausDerDemo, [], "die Demo hat den Server angefragt");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

test("D2 — Demo: simulierte Buchung bis zur Bestätigung, eindeutig als Simulation gekennzeichnet", async () => {
  const { ctx, page, fehler, ausDerDemo } = await demoBrowser();
  try {
    await page.goto(`${BASE_APP}/demo/dashboard?page=new`, { waitUntil: "domcontentloaded" });
    await fuelleVersandformular(page);
    await berechneAngebote(page);
    assert.ok(await page.locator(".offer-card").count() >= 3, "Beispielangebote mehrerer Versanddienstleister");
    await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
    await page.waitForURL(/\/demo\/booking/, { timeout: 20000 });
    await page.getByRole("button", { name: /^Weiter/ }).first().click();
    await page.waitForSelector(".booking-blatt--buchung", { timeout: 20000 });
    for (const feld of await page.locator(".booking-blatt input[type=checkbox]").all()) {
      if (!(await feld.isChecked())) await feld.check();
    }
    await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
    await page.waitForSelector(".booking-success-title", { timeout: 20000 });
    assert.equal(await page.locator(".booking-success-title").innerText(), "Simulierte Buchung abgeschlossen");
    assert.equal(await page.locator(".bsx-status").innerText(), "Simulation");
    assert.match(await page.locator(".bsx-demo-hinweis").innerText(), /nicht beauftragt.*keine Kosten.*keine E-Mail/s);
    const text = await page.locator(".booking-success-wrap").innerText();
    assert.match(text, /SIM-AB26-/);
    assert.doesNotMatch(text, /wird per E-Mail versendet/, "keine falsche Zusage einer E-Mail");

    // Die simulierte Sendung steht in dieser Seitenladung in den Sendungen.
    await page.getByRole("button", { name: "Zu meinen Sendungen" }).click();
    await page.waitForFunction(() => document.body.innerText.includes("SIM-AB26-"), null, { timeout: 20000 });

    assert.deepEqual(ausDerDemo, [], "die Demo hat den Server angefragt");
    // Nach dem Verlassen ist die echte Sitzung unverändert.
    await page.goto(`${BASE_APP}/impressum`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), "ECHTES-TOKEN");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

test("D3 — Demo 390 px: kein Querscrollen, die Demo-Leiste verdeckt keinen Inhalt", async () => {
  const { ctx, page, fehler, ausDerDemo } = await demoBrowser({ width: 390, height: 844 });
  try {
    for (const bereich of ["overview", "shipments", "new"]) {
      await page.goto(`${BASE_APP}/demo/dashboard?page=${bereich}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".demo-leiste", { timeout: 60000 });
      await page.waitForSelector("h1", { timeout: 20000 });
      await kurz(500);
      const masse = await page.evaluate(() => {
        const leiste = document.querySelector(".demo-leiste").getBoundingClientRect();
        return {
          quer: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          leisteHoehe: leiste.height,
          abstand: parseFloat(getComputedStyle(document.body).paddingBottom),
          sichtbar: leiste.top < window.innerHeight && leiste.bottom <= window.innerHeight + 1,
        };
      });
      assert.ok(masse.quer <= 0, `${bereich}: horizontales Scrollen um ${masse.quer}px`);
      assert.ok(masse.sichtbar, `${bereich}: Demo-Leiste nicht im Bild`);
      assert.ok(masse.abstand >= masse.leisteHoehe - 1, `${bereich}: Leiste ${masse.leisteHoehe}px, Abstand ${masse.abstand}px`);
    }
    assert.deepEqual(ausDerDemo, []);
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

test("D4 — die Demo öffnet den echten Kundenbereich nicht: ohne Anmeldung führt /dashboard zur Anmeldung", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await ctx.route(`${API}/**`, (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE_APP}/demo`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/demo\/dashboard$/, { timeout: 60000 });
    await page.goto(`${BASE_APP}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/login$/, { timeout: 30000 });
    assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), null, "die Demo hinterlässt kein Token");
    assert.equal(await page.locator("html[data-ce-demo]").count(), 0);
  } finally { await ctx.close(); }
});

test("D5 — Kopfsuche (Vorschau A/B): Sendung, Rechnung und Adresse finden und im Bereich hervorgehoben öffnen", async () => {
  const { ctx, page, fehler, ausDerDemo } = await demoBrowser();
  try {
    await page.goto(`${BASE_APP}/demo/dashboard`, { waitUntil: "domcontentloaded" });
    const feld = page.getByRole("combobox", { name: "Sendungen, Rechnungen und Adressen suchen" });
    await feld.waitFor({ timeout: 60000 });
    // Empfängerort: Sendungen (aus der Sendungsliste) und die Adresse (aus der Adressbuchsuche).
    await feld.fill("wien");
    await page.waitForSelector(".ce-suche-treffer", { timeout: 15000 });
    const treffer = await page.locator(".ce-suche-treffer").allInnerTexts();
    assert.ok(treffer.some((t) => /^Sendung\s+SIM-AB26-\d+\s+Alpen Handels GmbH, Wien$/.test(t.replace(/\s+/g, " ").trim())), JSON.stringify(treffer));
    assert.ok(treffer.some((t) => /^Adresse\s+Alpen Handels GmbH/.test(t.replace(/\s+/g, " ").trim())), JSON.stringify(treffer));
    assert.equal(await feld.getAttribute("aria-expanded"), "true");
    // Tastatur: Pfeil wählt (aria-activedescendant), Enter öffnet die Sendungen mit hervorgehobener Zeile.
    await feld.press("ArrowDown");
    const aktiv = await feld.getAttribute("aria-activedescendant");
    assert.ok(aktiv && (await page.locator(`#${aktiv}`).getAttribute("aria-selected")) === "true");
    await feld.press("Enter");
    await page.waitForSelector("tr.ce-suche-fokus", { timeout: 15000 });
    assert.match(await page.locator("h1").first().innerText(), /^Sendungen$/);
    assert.match(await page.locator("tr.ce-suche-fokus").innerText(), /SIM-AB26-\d+/);
    // Rechnung über ihre Nummer, per Mausklick.
    await feld.fill("SIM-RE26-00046");
    await page.locator(".ce-suche-treffer", { hasText: "SIM-RE26-00046" }).click();
    await page.waitForSelector("tr.ce-suche-fokus", { timeout: 15000 });
    assert.match(await page.locator("h1").first().innerText(), /^Rechnungen$/);
    assert.match(await page.locator("tr.ce-suche-fokus").innerText(), /SIM-RE26-00046/);
    // Adresse: das Adressbuch öffnet im Reiter der Rolle mit der Firma als Suche.
    await feld.fill("nordhafen");
    await page.locator(".ce-suche-treffer", { hasText: "Adresse" }).first().click();
    await page.waitForFunction(() => document.querySelector("h1")?.textContent.trim() === "Adressbuch", null, { timeout: 15000 });
    assert.equal(await page.inputValue("#abk-search-input"), "Nordhafen Technik GmbH");
    // Kein Treffer: ein klarer Satz statt einer leeren Liste; Escape schließt.
    await feld.fill("gibtesnicht");
    // Zuerst steht „Suche wird vorbereitet …“ (neues Feld auf der Adressbuchseite), dann das Ergebnis.
    await page.waitForFunction(() => /^Keine Treffer/.test(document.querySelector(".ce-suche-status")?.textContent || ""), null, { timeout: 15000 });
    assert.match(await page.locator(".ce-suche-status").innerText(), /^Keine Treffer für „gibtesnicht“$/);
    await feld.press("Escape");
    assert.equal(await feld.getAttribute("aria-expanded"), "false");
    assert.deepEqual(ausDerDemo, [], "die Demo hat den Server angefragt");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

test("D6 — Kopfsuche nur ab 1024 px; schmaler trägt die Kopfzeile nur Mitteilungen", async () => {
  const { ctx, page } = await demoBrowser({ width: 900, height: 900 });
  try {
    await page.goto(`${BASE_APP}/demo/dashboard?page=shipments`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1", { timeout: 60000 });
    assert.equal(await page.locator(".ce-suche").first().isVisible(), false);
  } finally { await ctx.close(); }
});

test("D7 — Kopfsuche von einer Seite außerhalb des Dashboards: Treffer hervorgehoben, im Browserverlauf nur der Verweis", async () => {
  const { ctx, page, fehler, ausDerDemo } = await demoBrowser();
  try {
    await page.goto(`${BASE_APP}/demo/calculator`, { waitUntil: "domcontentloaded" });
    const feld = page.getByRole("combobox", { name: "Sendungen, Rechnungen und Adressen suchen" });
    await feld.waitFor({ timeout: 60000 });
    await feld.fill("wien");
    await page.waitForSelector(".ce-suche-treffer", { timeout: 15000 });
    await feld.press("Enter");
    await page.waitForSelector("tr.ce-suche-fokus", { timeout: 15000 });
    assert.equal(new URL(page.url()).pathname, "/demo/dashboard");
    assert.match(await page.locator("h1").first().innerText(), /^Sendungen$/);
    const verlauf = await page.evaluate(() => JSON.stringify(window.history.state));
    assert.doesNotMatch(verlauf, /Alpen Handels|Wien|recipient/, "im Browserverlauf steht keine Anschrift");
    assert.match(verlauf, /"sucheFokus":\{"art":"sendung","id":\d+\}/);
    // Zurück und wieder vor: der Verweis findet kein Objekt mehr — keine Hervorhebung aus dem Verlauf.
    await page.goBack();
    await page.waitForURL(/\/demo\/calculator$/, { timeout: 15000 });
    await page.goForward();
    await page.waitForSelector("h1", { timeout: 15000 });
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".ce-suche-fokus").count(), 0);
    assert.deepEqual(ausDerDemo, [], "die Demo hat den Server angefragt");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

test("D8 — Menütaste „Weitere Aktionen“: rund, so hoch wie die Kapsel daneben und auf ihrer Mitte, Telefon 44 px", async () => {
  // Betreiberentscheidung 2026-10-29: Entwurfstabelle neben „Fortsetzen“ (40 px), Adressbuch und Bestand neben der
  // kleinen Kapsel (32 px); auf dem Telefon alle 44 px. Vorher saß die Taste in den Entwürfen 3 px über „Fortsetzen“,
  // in Adressbuch und Lager war sie 40 px neben 32 px hohen Kapseln.
  const FAELLE = [
    ["drafts", ".dft-actions-trigger", ".dft-cell-actions, .dft-card-actions"],
    ["addressbook", ".abk-actions-trigger", ".abk-row-actions, .abk-card-actions"],
    ["stock", ".inv-actions-trigger", ".inv-row-actions, .inv-card-actions"],
  ];
  for (const [viewport, telefon] of [[{ width: 1648, height: 1000 }, false], [{ width: 390, height: 844 }, true]]) {
    const { ctx, page, fehler, ausDerDemo } = await demoBrowser(viewport);
    try {
      for (const [bereich, taste, reihe] of FAELLE) {
        await page.goto(`${BASE_APP}/demo/dashboard?page=${bereich}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(`${taste}:visible`, { timeout: 60000 });
        await kurz(300);
        const m = await page.evaluate(([t, r]) => {
          const knopf = [...document.querySelectorAll(t)].find((e) => e.getClientRects().length);
          const nachbar = [...knopf.closest(r).querySelectorAll(".btn")].find((b) => b !== knopf && b.getClientRects().length);
          const a = knopf.getBoundingClientRect(), b = nachbar.getBoundingClientRect();
          return {
            breite: a.width, hoehe: a.height, mitte: a.top + a.height / 2, nachbarHoehe: b.height, nachbarMitte: b.top + b.height / 2,
            punkte: parseFloat(getComputedStyle(knopf, "::before").width), innen: knopf.clientWidth,
          };
        }, [taste, reihe]);
        const ort = `${bereich} @${viewport.width}`;
        assert.equal(m.breite, m.hoehe, `${ort}: Menütaste nicht rund (${m.breite}×${m.hoehe})`);
        assert.ok(Math.abs(m.hoehe - m.nachbarHoehe) < 0.5, `${ort}: Menütaste ${m.hoehe}px, Kapsel daneben ${m.nachbarHoehe}px`);
        assert.ok(Math.abs(m.mitte - m.nachbarMitte) < 0.5, `${ort}: Mitte um ${(m.mitte - m.nachbarMitte).toFixed(1)}px versetzt`);
        if (telefon) assert.equal(m.hoehe, 44, `${ort}: auf dem Telefon ${m.hoehe}px statt 44px`);
        assert.ok(m.punkte + 4 <= m.innen, `${ort}: die Punkte (${m.punkte}px) reichen an den Rand (${m.innen}px)`);
      }
      assert.deepEqual(ausDerDemo, [], "die Demo hat den Server angefragt");
      assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
  }
});
