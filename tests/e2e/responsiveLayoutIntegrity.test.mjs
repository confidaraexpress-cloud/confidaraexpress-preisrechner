// E2E: Responsive-Qualität im echten Browser — tatsächliche Überschneidungen und abgeschnittene Inhalte, nicht nur
// waagerechtes Scrollen der Seite (Responsive-Prüfung 2026-10-28). Der Detektor steht in helpers/layoutIntegrity.mjs.
//
//   L0  Gegenprobe: Der Detektor erkennt jede Fehlerart auf einer absichtlich kaputten Seite — und meldet auf einer
//       sauberen Seite mit gewollten Mustern (sr-only, geschlossene Details, schmückende Zeichnung, Dialog, senkrechter
//       Scrollbereich) nichts.
//   L1  „Letzte Sendungen“ (Ausgangsfehler): Nummer, Empfänger, Status und Betrag überschneiden sich in keiner Breite,
//       besonders 1648 px — auch ohne Vorgangsnummer, mit altem langen Nummernformat und fünfstelligen Beträgen.
//   L2  Kundenseiten mit langen Inhalten (Übersicht, Sendungen, Rechnungen, Support, Lager, Artikel, Bestand, Aufträge,
//       Bewegungen, Auftrag, Artikeldetail, Entwürfe, Adressbuch, Konto) ohne Befund in den Prüfbreiten 320–2560 px;
//       jede Liste zeigt in jeder Breite genau eine Darstellung (Tabelle oder Einträge) mit ihren Zeilen.
//   L3  Demo: Angebote, Buchung Schritt 1 und 2, Dialoge (Adresse, Dokumente, PDF-Vorschau, Mitteilungen) und die
//       Navigationsschublade.
//   L4  Große Browserschrift (24 px) von 320 bis 1920 px auf Übersicht, Sendungen, Aufträgen, Auftrag, Artikeln,
//       Artikeldetail, Konto, Rechnungen, Entwürfen und Sendungsverfolgung; Zoom 200 % / 400 % auf Übersicht und
//       Sendungen.
//   L5  Anmeldung und Registrierung: Augenknopf neben dem Schreibbereich, kein Befund — auch mit 24 px Schrift auf dem
//       Telefon (direkt in 320 px geöffnet).
//
// Keine Anfrage verlässt den Browser: Die Demo hat keinen Server; die echte App bekommt die Antworten der Demo-Daten
// (src/demo/demoBackend.mjs), verlängert durch helpers/langeInhalte.mjs. Keine Buchung, keine E-Mail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { layoutBefunde } from "./helpers/layoutIntegrity.mjs";
import { verlaengere } from "./helpers/langeInhalte.mjs";
import { fuelleVersandformular, berechneAngebote } from "./helpers/newShipmentForm.mjs";
import { demoAntwort, demoZuruecksetzen } from "../../src/demo/demoBackend.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5661, BASE = `http://127.0.0.1:${PORT}`;
const API = "https://api.confidaraexpress.de";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// Prüfbreiten: Telefon bis Großbild, dazu die früheren Umschaltpunkte (720/721, 860/861, 1100/1101, 1120/1121, 1360)
// und 1648 px, die Breite des gemeldeten Ausgangsfehlers.
const BREITEN = [320, 360, 390, 430, 600, 721, 768, 860, 900, 1024, 1101, 1121, 1180, 1280, 1366, 1440, 1536, 1648, 1680, 1920, 2560];
const SCHMAL = BREITEN.filter((b) => b <= 860);
// Kernbreiten für die übrigen Seiten (die volle Reihe läuft für den Ausgangsfehler L1).
const KERN = [320, 390, 600, 768, 900, 1024, 1121, 1280, 1366, 1440, 1536, 1648, 1920, 2560];

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
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore", ...DEV_SERVER_SPAWN });
  await warteAufServer(BASE);
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
});

/** Kontext: „demo“ (Beispieldaten, ohne Server) oder „lang“ (echte App, Attrappe aus Demo-Daten mit langen Werten). */
async function kontext(variante, { width = 1440, height = 900, schrift = 0, dpr = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, locale: "de-DE",
    timezoneId: "Europe/Berlin", reducedMotion: "reduce", serviceWorkers: "block" });
  const fremd = [];
  if (variante === "lang") {
    demoZuruecksetzen();
    await ctx.route(`${API}/**`, async (route) => {
      const u = new URL(route.request().url());
      const res = await demoAntwort(u.pathname + u.search, { method: route.request().method(), body: route.request().postData() || undefined });
      const typ = res.headers.get("content-type") || "";
      if (typ.includes("json")) {
        const daten = verlaengere(u.pathname, await res.json());
        await route.fulfill({ status: res.status, contentType: "application/json", body: JSON.stringify(daten) }).catch(() => {});
      } else {
        await route.fulfill({ status: res.status, contentType: typ || "application/octet-stream", body: Buffer.from(await res.arrayBuffer()) }).catch(() => {});
      }
    });
    await ctx.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  } else {
    // Die Demo erreicht den Server nie; jede Anfrage dorthin wäre ein Fehler.
    await ctx.route(`${API}/**`, (route) => { fremd.push(route.request().url()); return route.fulfill({ status: 503, body: "{}" }); });
  }
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  if (schrift) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Page.enable");
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: schrift, fixed: Math.round(schrift * 0.8125) } });
  }
  return { ctx, page, fehler, fremd };
}

async function oeffne(page, pfad, bereit = "h1") {
  await page.goto(`${BASE}${pfad}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(bereit, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await kurz(400);
}

/** Prüft die Seite in allen Breiten; feste Ebenen (Demo-Leiste) und bewusst gekürzte Texte mit title sind Hinweise. */
async function pruefe(page, breiten, name) {
  const alle = [];
  for (const w of breiten) {
    await page.setViewportSize({ width: w, height: 900 });
    // Erst an den Seitenanfang, dann zwei Frames warten: Klebende Leisten melden ihren Zustand nach dem Scrollen.
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await kurz(60);
    const befunde = (await page.evaluate(layoutBefunde)).filter((b) => !b.fest && b.art !== "gekuerztMitTitel");
    for (const b of befunde) alle.push(`${w}px ${b.art} ${b.um}px „${b.text}“ @${b.bei}${b.mit ? ` ↔ „${b.mit}“ @${b.mitBei}` : ""}${b.zelle ? ` Zelle ${b.zelle}` : ""}${b.container ? ` in ${b.container}` : ""}`);
  }
  assert.deepEqual(alle, [], `${name}: ${alle.length} Befunde\n${alle.slice(0, 12).join("\n")}`);
}

// Listen mit Tabelle und Einträgen: In jeder Breite steht genau eine der beiden Darstellungen mit ihren Zeilen — nie
// beide, nie keine (Informationsverlust erkennt der Überschneidungs-Detektor nicht).
const LISTEN = {
  shipments: [".shipment-table.ce-list-table tbody tr", ".shipment-cards > li"],
  invoices: [".inv-table tbody tr", ".inv-cards > li"],
  products: [".inv-list-table--artikel tbody tr", ".inv-list-cards--artikel > li"],
  stock: [".inv-list-table--bestand tbody tr", ".inv-list-cards--bestand > li"],
  orders: [".inv-list-table--auftraege tbody tr", ".inv-list-cards--auftraege > li"],
  movements: [".inv-list-table--bewegungen tbody tr", ".inv-list-cards--bewegungen > li"],
  drafts: [".dft-table-card tbody tr", ".dft-cards > li"],
  "/inventory/orders/501": [".inv-order-main .inv-detail-table--wide tbody tr", ".inv-order-main .inv-detail-cards > li"],
};
async function pruefeListe(page, breiten, name) {
  const [zeilen, eintraege] = LISTEN[name];
  const falsch = [];
  for (const w of breiten) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const [t, e] = await page.evaluate(([a, b]) => [a, b].map((sel) =>
      [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length > 0).length), [zeilen, eintraege]);
    if ((t > 0) === (e > 0)) falsch.push(`${w}px: Tabellenzeilen ${t}, Einträge ${e}`);
  }
  assert.deepEqual(falsch, [], `${name}: nicht genau eine Darstellung sichtbar\n${falsch.join("\n")}`);
}

test("L0 — Gegenprobe: jede Fehlerart wird erkannt, gewollte Muster nicht", async () => {
  const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
  try {
    await page.setContent(`<!doctype html><html lang="de"><body style="margin:0;font:16px/1.4 sans-serif">
      <div style="position:relative;height:40px"><span id="a" style="position:absolute;left:0">CE-AB-2026-000050</span><span style="position:absolute;left:60px">Spedition Müller</span></div>
      <div style="display:grid;grid-template-columns:60px 300px;column-gap:8px"><span style="white-space:nowrap">Ohne Vorgangsnummer</span><span style="padding-left:120px">Rest</span></div>
      <div style="width:90px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Abgeschnittener langer Text</div>
      <div style="width:40px;overflow-wrap:anywhere">28.10.2026</div>
      <div style="position:relative;height:50px"><button style="position:absolute;left:0;width:120px">Herunterladen</button><button style="position:absolute;left:60px;width:120px">Schließen</button></div>
      <div style="position:relative;height:40px"><button style="position:absolute;left:300px;width:160px;height:36px">Angebot auswählen</button><span style="position:absolute;left:250px;top:8px;font-size:20px">ab 12.345,67 €</span></div>
      <div style="width:120px;overflow-x:auto"><div style="width:400px">Inhalt einer breiten Tabelle</div></div>
      <div style="width:1200px">breiter Block</div>
    </body></html>`);
    const arten = new Set((await page.evaluate(layoutBefunde)).map((b) => b.art));
    for (const art of ["textUeberText", "ueberragtZelle", "abgeschnitten", "wertGebrochen", "steuerUeberSteuerung", "textUeberSteuerung", "querScroll", "seiteScrolltQuer"]) {
      assert.ok(arten.has(art), `nicht erkannt: ${art} (erkannt: ${[...arten].join(", ")})`);
    }

    await page.setContent(`<!doctype html><html lang="de"><body style="margin:0;font:16px/1.4 sans-serif">
      <h1>Versand- und Logistik&shy;management</h1>
      <p style="max-width:320px">Ich bestätige die <a href="#">Allgemeinen Geschäftsbedingungen</a> und die Hinweise zum Versand.</p>
      <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Nur für Screenreader, sehr langer Text</span>
      <details><summary>Frage</summary><p>Antwort, die nur geöffnet sichtbar ist</p></details>
      <details><summary>Zweite Frage</summary><p>Zweite Antwort</p></details>
      <svg aria-hidden="true" width="80" height="40"><g transform="matrix(1 0.5 -1 0.5 40 0)"><text x="2" y="10" font-size="9">Berlin</text><text x="2" y="14" font-size="9">Muenchen</text></g></svg>
      <button title="Zu meinem Profil: Maximilian-Alexander Schmidt-Hohenzollern"><span style="display:block;width:90px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Maximilian-Alexander Schmidt-Hohenzollern</span></button>
      <div style="overflow:hidden;height:120px;padding:16px 0;display:flex;flex-direction:column"><div style="flex:1 1 auto;min-height:0;overflow-y:auto"><p>Eintrag 1</p><p>Eintrag 2</p><p>Eintrag 3</p><p>Eintrag 4</p><p>Konto</p></div></div>
      <div style="position:relative;width:320px"><input id="pw" style="width:300px;height:40px;padding-right:44px;box-sizing:border-box" value="geheim"><button style="position:absolute;right:20px;top:4px;width:40px;height:32px">A</button></div>
    </body></html>`);
    const sauber = (await page.evaluate(layoutBefunde)).filter((b) => b.art !== "gekuerztMitTitel");
    assert.deepEqual(sauber, [], "die saubere Seite hat Befunde");
  } finally { await page.close(); }
});

test("L1 — „Letzte Sendungen“: keine Überschneidung von 320 bis 2560 px, mit Beispieldaten und langen Werten", async () => {
  for (const variante of ["demo", "lang"]) {
    const { ctx, page, fehler, fremd } = await kontext(variante);
    try {
      await oeffne(page, variante === "demo" ? "/demo/dashboard" : "/dashboard", ".ov-list--sendungen .ov-list-row");
      await pruefe(page, BREITEN, `Übersicht (${variante})`);
      if (variante === "lang") {
        // Die Nummer steht vollständig da, „Ohne Vorgangsnummer“ ist Text, der Betrag rechts.
        await page.setViewportSize({ width: 1648, height: 900 });
        await kurz(100);
        const zeilen = await page.$$eval(".ov-list--sendungen .ov-list-row", (els) => els.map((li) => li.querySelector(".ov-list-primary").textContent.trim()));
        assert.deepEqual(zeilen.slice(0, 3), ["Ohne Vorgangsnummer", "CE-AB-2026-000050", "CE-AB26-00001"]);
        // Der Inhaltsrahmen ist ein Größencontainer, aber kein Bezugsrahmen für feste Ebenen: Ein fest positioniertes
        // Element darin steht am Fenster (Dialoge, Menüs und Mitteilungen bleiben dort, wo sie hingehören).
        const lage = await page.evaluate(() => {
          const probe = document.createElement("div");
          probe.style.cssText = "position:fixed;top:0;left:0;width:10px;height:10px";
          document.querySelector(".page-body").appendChild(probe);
          const r = probe.getBoundingClientRect();
          probe.remove();
          return [r.left, r.top];
        });
        assert.deepEqual(lage, [0, 0], "eine feste Ebene im Inhaltsrahmen richtet sich nicht am Fenster aus");
      }
      assert.deepEqual(fehler, []);
      assert.deepEqual(fremd, [], "die Demo hat den Server angefragt");
    } finally { await ctx.close(); }
  }
});

test("L2 — Kundenseiten mit langen Inhalten: kein Befund in den Prüfbreiten", async () => {
  const { ctx, page, fehler } = await kontext("lang");
  try {
    for (const bereich of ["shipments", "invoices", "support", "inventory", "products", "stock", "orders", "movements", "drafts", "addressbook", "profile"]) {
      await oeffne(page, `/dashboard?page=${bereich}`);
      await kurz(600);
      await pruefe(page, KERN, bereich);
      if (LISTEN[bereich]) await pruefeListe(page, BREITEN, bereich);
    }
    for (const pfad of ["/inventory/orders/501", "/inventory/products/101"]) {
      await oeffne(page, pfad);
      await kurz(600);
      await pruefe(page, KERN, pfad);
      if (LISTEN[pfad]) await pruefeListe(page, BREITEN, pfad);
    }
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

test("L3 — Demo: Angebote, Buchung, Dialoge und Schublade ohne Befund", async () => {
  const { ctx, page, fehler, fremd } = await kontext("demo");
  try {
    await oeffne(page, "/demo/dashboard?page=new", "#ns-length");
    await fuelleVersandformular(page);
    await berechneAngebote(page);
    await page.waitForSelector(".offer-card", { timeout: 30000 });
    await pruefe(page, KERN, "Angebote");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
    await page.waitForURL(/\/demo\/booking/, { timeout: 20000 });
    await page.waitForSelector(".booking-blatt", { timeout: 20000 });
    await pruefe(page, KERN, "Buchung, Schritt 1");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: /^Weiter/ }).first().click();
    await page.waitForSelector(".booking-blatt--buchung", { timeout: 20000 });
    await pruefe(page, KERN, "Buchung, Schritt 2");

    await oeffne(page, "/demo/dashboard?page=invoices");
    await page.locator("button:visible", { hasText: "Ansehen" }).first().click();
    await page.waitForSelector("[role=dialog]", { timeout: 15000 });
    await pruefe(page, KERN, "PDF-Vorschau");

    await oeffne(page, "/demo/dashboard?page=shipments");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator(".stn-act--dokumente:visible").first().click();
    await page.waitForSelector("[role=dialog]", { timeout: 15000 });
    await pruefe(page, KERN, "Dokumente");

    await oeffne(page, "/demo/dashboard?page=addressbook");
    await page.locator("button", { hasText: "Neue Adresse" }).first().click();
    await page.waitForSelector("[role=dialog]", { timeout: 15000 });
    await pruefe(page, KERN, "Neue Adresse");

    await oeffne(page, "/demo/dashboard");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(".ntf-bell:visible").first().click();
    await page.waitForSelector(".ntf-panel", { timeout: 15000 });
    await pruefe(page, KERN.filter((b) => b > 860), "Mitteilungen");

    await page.setViewportSize({ width: 390, height: 900 });
    await oeffne(page, "/demo/dashboard");
    await page.locator(".hamburger-btn:visible").first().click();
    await kurz(500);
    await pruefe(page, SCHMAL, "Navigationsschublade");
    assert.deepEqual(fehler, []);
    assert.deepEqual(fremd, [], "die Demo hat den Server angefragt");
  } finally { await ctx.close(); }
});

test("L4 — große Browserschrift (24 px) und Zoom 200 % / 400 %: kein Befund", async () => {
  {
    const { ctx, page, fehler } = await kontext("lang", { schrift: 24 });
    try {
      // Bis 430 px greift der Block „sehr schmal“ (unter 20em): Silbentrennung, Kennungen nur nach einem Bindestrich.
      // Ab 1024 px die Desktop-Stufen: Tabellen, Konto und Verfolgung folgen der Breite in rem, nicht dem Fenster.
      for (const pfad of ["/dashboard", "/dashboard?page=shipments", "/dashboard?page=orders", "/inventory/orders/501",
        "/dashboard?page=products", "/inventory/products/101", "/dashboard?page=profile", "/dashboard?page=invoices",
        "/dashboard?page=drafts", "/dashboard?page=tracking"]) {
        await oeffne(page, pfad);
        await kurz(600);
        await pruefe(page, [320, 360, 390, 768, 1024, 1280, 1648, 1920], `${pfad} bei 24 px`);
      }
      assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
  }
  // Zoom eines 1648-px-Fensters: 200 % → 824 CSS-Pixel, 400 % → 412 CSS-Pixel (Gerätepixelverhältnis 2 bzw. 4).
  for (const [dpr, breite] of [[2, 824], [4, 412]]) {
    const { ctx, page, fehler } = await kontext("lang", { width: breite, dpr });
    try {
      for (const pfad of ["/dashboard", "/dashboard?page=shipments"]) {
        await oeffne(page, pfad);
        await kurz(600);
        await pruefe(page, [breite], `${pfad} bei ${dpr * 100} % Zoom`);
      }
      assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
  }
});

test("L5 — Anmeldung und Registrierung: kein Befund, Augenknopf neben dem Schreibbereich, auch mit großer Schrift", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "de-DE", reducedMotion: "reduce", serviceWorkers: "block" });
  await ctx.route(`${API}/**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  const page = await ctx.newPage();
  try {
    for (const pfad of ["/login", "/register"]) {
      await oeffne(page, pfad, "form input");
      await pruefe(page, BREITEN, pfad);
    }
  } finally { await ctx.close(); }

  // Telefon mit 24 px Browserschrift, direkt in dieser Breite geöffnet: Die Reiter stehen untereinander, die E-Mail des
  // Ansprechpartners bricht, keine Karte wird breiter als der Bildschirm.
  const klein = await browser.newContext({ viewport: { width: 320, height: 800 }, locale: "de-DE", reducedMotion: "reduce", serviceWorkers: "block" });
  await klein.route(`${API}/**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  const seite = await klein.newPage();
  try {
    const cdp = await klein.newCDPSession(seite);
    await cdp.send("Page.enable");
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 24, fixed: 20 } });
    for (const pfad of ["/login", "/register"]) {
      await oeffne(seite, pfad, "form input");
      await pruefe(seite, [320, 360, 390], `${pfad} bei 24 px`);
    }
  } finally { await klein.close(); }
});
