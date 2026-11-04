// E2E: der Demo-Hinweis des öffentlichen Preisrechners (P2, Betreiberentscheidung 2026-11-04) im echten Browser gegen
// ein gemocktes Backend. Kein echter Request: die API ist eine Attrappe, Aufrufe der Hauptdomain (Demo, Impressum)
// beantwortet eine Platzhalterseite.
//
//   H1  1440 und 390 px: beim ersten Öffnen der Dialog — Titel als Name, zwei Aktionen, Fokus auf „Zum Preisrechner“,
//       Tab bleibt im Dialog; Desktop mittig und höchstens 480 px breit, Telefon als Blatt unten mit 16 px Rand;
//       Touch-Ziele ≥ 44 px, keine Animation, keine Verschiebung der Seite, kein Querscrollen.
//   H2  „Zum Preisrechner“: Dialog zu, Fokus auf dem Rechnertitel, Merker gesetzt; Reload und Zurück-Taste zeigen ihn
//       nicht erneut; ein neuer, unabhängiger Tab zeigt ihn wieder.
//   H3  Escape und ein Klick auf den Schleier wirken wie „Zum Preisrechner“; ein Klick ins Blatt und ein Ziehen aus
//       dem Blatt heraus schließen nicht.
//   H4  „Demo ansehen“ öffnet https://confidaraexpress.de/demo im selben Tab; zurück steht der Rechner ohne Dialog.
//   H5  Rückkehr aus der Demo (?von=demo): kein Dialog, die Adresse verliert den Parameter, ein Reload fragt nicht.
//   H6  Formular und Preisabfrage: nach dem Schließen dieselben Felder (kein Neuaufbau), Eingabe und Preisabfrage
//       wie ohne Dialog; der Dialog stellt keine eigene Anfrage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { DEMO_HINWEIS_SCHLUESSEL, ohneDemoHinweis } from "./helpers/demoHinweis.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5716, BASE = `http://127.0.0.1:${PORT}`;
const API = "https://api.confidaraexpress.de";
const HAUPT = "https://confidaraexpress.de";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const ANGEBOT = {
  productKey: `pk1_${"U".repeat(22)}`, publicCarrierId: "ups", publicServiceName: "Standard", serviceType: "pickup",
  pickupDate: "2026-11-05", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00", collectionDate: null,
  collectionReadyFrom: null, collectionDateAdjusted: false, deliveryDate: null, deliveryDateMin: null,
  deliveryDateMax: null, deliveryTimeUntil: null, deliveryTimeUntilMinutes: null, deliveryProjection: null,
  deliveryTime: null, transitDaysMin: 1, transitDaysMax: 2, netPrice: 10.5, vatAmount: 2, finalPrice: 12.5,
  currency: "EUR", priceCompleteness: "complete", priceStatus: "exact", unavailableReason: null,
  availableWithShipmentDetails: true, requiredPriceInputs: [], surchargeFreePriceInputs: [], recipientRequirement: null,
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
  insuranceAvailable: false, trackingAvailable: true, printerRequired: true, labelHandling: null,
  handoffToken: `h1.${"U".repeat(90)}`,
};
const TITEL = "Möchten Sie zuerst den Kundenbereich ansehen?";

let server, browser;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ein Browserkontext (ein Browserprofil) mit gemockter API und Platzhaltern für die Hauptdomain. */
async function profil(viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "de-DE", timezoneId: "Europe/Berlin" });
  const anfragen = [];
  ctx.on("request", (r) => { anfragen.push(`${r.method()} ${r.url()}`); });
  await ctx.route(`${API}/**`, (route) => {
    const pfad = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad === "/api/public/price-quote/prepare") return json({ available: true });
    if (pfad === "/api/public/launch-scope") return json({ countries: EU27, destinationCountries: EU27, originCountries: ["DE"] });
    if (pfad === "/api/public/price-quote") {
      return json({ status: "ok", quotedAt: "2026-11-04T08:00:00.000Z", publicCarriers: [{ id: "ups", name: "UPS" }],
        availableShippingModes: ["standard"], offers: [ANGEBOT] });
    }
    return json({ error: "unerwartet" }, 404);
  });
  await ctx.route(`${HAUPT}/**`, (route) => route.fulfill({
    status: 200, contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Platzhalter</title></head><body><h1 id="platzhalter">${new URL(route.request().url()).pathname}</h1></body></html>`,
  }));
  return { ctx, anfragen };
}

async function tab(ctx) {
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

const dialog = (page) => page.locator("#pc-demo-hinweis");
const fokusId = (page) => page.evaluate(() => document.activeElement && document.activeElement.id);
const merker = (page) => page.evaluate((k) => sessionStorage.getItem(k), DEMO_HINWEIS_SCHLUESSEL);

/** Den Rechner öffnen und warten, bis die Insel steht (der Dialog entsteht im selben ersten Rendern). */
async function oeffne(page, pfad = "/") {
  await page.goto(`${BASE}${pfad}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pc-submit", { timeout: 30000 });
}

/** Steht kein Dialog — auch nicht kurz nach dem Rendern? */
async function keinDialog(page, wo) {
  await kurz(400);
  assert.equal(await dialog(page).count(), 0, `${wo}: der Dialog erscheint erneut`);
}

test.before(async () => {
  server = spawn("npx", ["vite", "--config", "vite.preisrechner.config.js", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await kurz(250);
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
});

for (const [breite, hoehe] of [[1440, 900], [390, 844]]) {
  test(`H1 ${breite}px — beim ersten Öffnen: Titel, zwei Aktionen, Fokus und Tab im Dialog, Blatt, keine Bewegung`, async () => {
    const { ctx } = await profil({ width: breite, height: hoehe });
    try {
      const { page, fehler } = await tab(ctx);
      await oeffne(page);
      await dialog(page).waitFor({ state: "visible", timeout: 10000 });
      assert.equal(await page.getByRole("dialog", { name: TITEL }).count(), 1, "der Dialog heißt wie seine Frage");
      assert.equal(await dialog(page).getAttribute("aria-modal"), "true");
      assert.match(await page.locator("#pc-demo-hinweis-text").innerText(), /Beispieldaten.*ohne Anmeldung — nichts wird gebucht\./s);
      assert.deepEqual(await dialog(page).locator("a, button").allInnerTexts(), ["Demo ansehen", "Zum Preisrechner"]);
      assert.equal(await page.locator("#pc-demo-hinweis-demo").getAttribute("href"), `${HAUPT}/demo`);

      // Tastatur: erster Fokus „Zum Preisrechner“, Tab und Umschalt+Tab laufen zwischen den zwei Aktionen um.
      assert.equal(await fokusId(page), "pc-demo-hinweis-rechner");
      for (const [taste, ziel] of [["Tab", "pc-demo-hinweis-demo"], ["Tab", "pc-demo-hinweis-rechner"],
        ["Shift+Tab", "pc-demo-hinweis-demo"], ["Shift+Tab", "pc-demo-hinweis-rechner"]]) {
        await page.keyboard.press(taste);
        assert.equal(await fokusId(page), ziel, `${taste} verlässt den Dialog`);
      }

      await kurz(500);
      const m = await page.evaluate(() => {
        const blatt = document.querySelector("#pc-demo-hinweis");
        const b = blatt.getBoundingClientRect();
        const knoepfe = [...blatt.querySelectorAll(".pc-button")].map((k) => k.getBoundingClientRect());
        const st = getComputedStyle(blatt);
        const schleier = getComputedStyle(document.querySelector(".pc-dialog-schleier"));
        return {
          links: b.left, rechts: window.innerWidth - b.right, oben: b.top, unten: window.innerHeight - b.bottom, breite: b.width,
          knoepfe: knoepfe.map((k) => ({ links: k.left, oben: k.top, breite: k.width, hoehe: k.height })),
          bewegung: [st.animationName, schleier.animationName, st.transitionDuration, schleier.transitionDuration],
          quer: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ueberSeite: document.elementFromPoint(4, 4)?.classList.contains("pc-dialog-schleier"),
        };
      });
      // Der Dialog verschiebt nichts: Seite und Rechnerkarte stehen wie in einem Tab ohne Dialog. (Eine CLS-Messung
      // taugt hier nicht — der Entwicklungsserver lädt das Stylesheet per Skript nach; gemessen wird sie am Build.)
      const lage = (p) => p.evaluate(() => {
        const k = document.querySelector("#pc-calculator-card").getBoundingClientRect();
        return { seite: document.documentElement.scrollHeight, links: k.left, oben: k.top, breite: k.width, hoehe: k.height };
      });
      const mitDialog = await lage(page);
      const ohne = await tab(ctx);
      await ohneDemoHinweis(ohne.page);
      await oeffne(ohne.page);
      await keinDialog(ohne.page, "Vergleichstab");
      const ohneDialog = await lage(ohne.page);
      const ort = `${breite}px`;
      if (breite >= 600) {
        assert.ok(m.breite <= 480.5, `${ort}: Blatt ${m.breite}px breit`);
        assert.ok(Math.abs(m.links - m.rechts) <= 1 && Math.abs(m.oben - m.unten) <= 1, `${ort}: Blatt nicht mittig`);
        const [a, b] = m.knoepfe;
        assert.ok(Math.abs(a.oben - b.oben) <= 0.5 && Math.abs(a.breite - b.breite) <= 1 && a.links < b.links,
          `${ort}: Aktionen nicht gleich breit nebeneinander`);
      } else {
        for (const [seite, wert] of [["links", m.links], ["rechts", m.rechts], ["unten", m.unten]]) {
          assert.ok(Math.abs(wert - 16) <= 0.5, `${ort}: Rand ${seite} ${wert}px statt 16px`);
        }
        const [a, b] = m.knoepfe;
        assert.ok(b.oben > a.oben + a.hoehe - 1 && Math.abs(a.breite - b.breite) <= 0.5, `${ort}: Aktionen nicht untereinander`);
      }
      for (const k of m.knoepfe) assert.ok(k.hoehe >= 44, `${ort}: Aktion ${k.hoehe}px hoch`);
      assert.deepEqual(m.bewegung, ["none", "none", "0s", "0s"], `${ort}: der Dialog bewegt sich`);
      assert.ok(m.quer <= 0, `${ort}: Querscrollen um ${m.quer}px`);
      assert.equal(m.ueberSeite, true, `${ort}: der Schleier deckt die Seite nicht`);
      for (const k of Object.keys(ohneDialog)) {
        assert.ok(Math.abs(mitDialog[k] - ohneDialog[k]) <= 1, `${ort}: ${k} ${mitDialog[k]} mit Dialog, ${ohneDialog[k]} ohne`);
      }
      assert.deepEqual([...fehler, ...ohne.fehler], []);
    } finally { await ctx.close(); }
  });
}

test("H2 — „Zum Preisrechner“: zu, Fokus auf dem Rechner, kein zweites Mal bei Reload und Zurück; ein neuer Tab fragt", async () => {
  const { ctx } = await profil();
  try {
    const { page, fehler } = await tab(ctx);
    await oeffne(page);
    await dialog(page).waitFor({ state: "visible", timeout: 10000 });
    await page.click("#pc-demo-hinweis-rechner");
    await dialog(page).waitFor({ state: "detached", timeout: 5000 });
    assert.equal(await fokusId(page), "pc-calculator-title", "der Fokus steht nicht auf dem Rechner");
    assert.equal(await merker(page), "1");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#pc-submit", { timeout: 30000 });
    await keinDialog(page, "Reload");

    await page.goto(`${HAUPT}/impressum`, { waitUntil: "domcontentloaded" });
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#pc-submit", { timeout: 30000 });
    await keinDialog(page, "Zurück-Taste");

    // Ein neuer, unabhängiger Tab desselben Browsers: neue Tab-Sitzung, der Dialog erscheint wieder.
    const zweiter = await tab(ctx);
    await oeffne(zweiter.page);
    await dialog(zweiter.page).waitFor({ state: "visible", timeout: 10000 });
    assert.equal(await merker(zweiter.page), "1", "gemerkt, sobald der Dialog erscheint");
    // Im ersten Tab bleibt es beim Rechner.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#pc-submit", { timeout: 30000 });
    await keinDialog(page, "erster Tab nach dem zweiten");
    assert.deepEqual([...fehler, ...zweiter.fehler], []);
  } finally { await ctx.close(); }
});

test("H3 — Escape und Schleier wirken wie „Zum Preisrechner“; Klick ins Blatt und Ziehen nach draußen schließen nicht", async () => {
  const { ctx } = await profil();
  try {
    const a = await tab(ctx);
    await oeffne(a.page);
    await dialog(a.page).waitFor({ state: "visible", timeout: 10000 });
    await a.page.keyboard.press("Escape");
    await dialog(a.page).waitFor({ state: "detached", timeout: 5000 });
    assert.equal(await fokusId(a.page), "pc-calculator-title");
    assert.equal(await merker(a.page), "1");

    const b = await tab(ctx);
    await oeffne(b.page);
    await dialog(b.page).waitFor({ state: "visible", timeout: 10000 });
    const blatt = await dialog(b.page).boundingBox();
    // Ein Klick auf den Text: der Dialog bleibt, und Escape wirkt danach weiter (der Fokus bleibt im Blatt).
    await b.page.click("#pc-demo-hinweis-text");
    assert.equal(await dialog(b.page).count(), 1, "ein Klick ins Blatt schließt");
    assert.equal(await b.page.evaluate(() => document.querySelector("#pc-demo-hinweis").contains(document.activeElement)), true);
    // Ziehen aus dem Blatt heraus (etwa beim Markieren von Text) schließt nicht.
    await b.page.mouse.move(blatt.x + 24, blatt.y + 40);
    await b.page.mouse.down();
    await b.page.mouse.move(8, 8, { steps: 4 });
    await b.page.mouse.up();
    assert.equal(await dialog(b.page).count(), 1, "ein Ziehen nach draußen schließt");
    // Ein Klick auf den Schleier schließt wie „Zum Preisrechner“.
    await b.page.mouse.click(8, 8);
    await dialog(b.page).waitFor({ state: "detached", timeout: 5000 });
    assert.equal(await fokusId(b.page), "pc-calculator-title");

    const c = await tab(ctx);
    await oeffne(c.page);
    await dialog(c.page).waitFor({ state: "visible", timeout: 10000 });
    await c.page.click("#pc-demo-hinweis-text");
    await c.page.keyboard.press("Escape");
    await dialog(c.page).waitFor({ state: "detached", timeout: 5000 });
    assert.deepEqual([...a.fehler, ...b.fehler, ...c.fehler], []);
  } finally { await ctx.close(); }
});

test("H4 — „Demo ansehen“ öffnet die Demo im selben Tab; zurück steht der Rechner ohne Dialog", async () => {
  const { ctx } = await profil();
  try {
    const { page, fehler } = await tab(ctx);
    await oeffne(page);
    await dialog(page).waitFor({ state: "visible", timeout: 10000 });
    await page.click("#pc-demo-hinweis-demo");
    await page.waitForURL(`${HAUPT}/demo`, { timeout: 10000 });
    assert.equal(await page.locator("#platzhalter").innerText(), "/demo");
    assert.equal(ctx.pages().length, 1, "die Demo öffnet sich im selben Tab");
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForURL(`${BASE}/`, { timeout: 10000 });
    await page.waitForSelector("#pc-submit", { timeout: 30000 });
    await keinDialog(page, "zurück aus der Demo");
    assert.equal(await merker(page), "1");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

test("H5 — Rückkehr aus der Demo (?von=demo): kein Dialog, Adresse ohne Parameter, ein Reload fragt nicht", async () => {
  const { ctx } = await profil();
  try {
    const { page, fehler } = await tab(ctx);
    await oeffne(page, "/?von=demo");
    await keinDialog(page, "?von=demo");
    assert.equal(page.url(), `${BASE}/`, "der Parameter bleibt in der Adresse");
    assert.equal(await merker(page), "1");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#pc-submit", { timeout: 30000 });
    await keinDialog(page, "Reload nach der Demo");
    // Übrige Parameter und Anker bleiben.
    const zweiter = await tab(ctx);
    await oeffne(zweiter.page, "/?quelle=x&von=demo#pc-calculator-title");
    await keinDialog(zweiter.page, "?von=demo mit weiteren Angaben");
    assert.equal(zweiter.page.url(), `${BASE}/?quelle=x#pc-calculator-title`);
    // „…//?von=demo“ liefert nginx aus (Schrägstriche zusammengefasst): der Rechner bleibt stehen, kein Dialog,
    // keine Fehleransicht — die bereinigte Adresse ist absolut und bleibt auf dieser Seite.
    const dritter = await tab(ctx);
    await oeffne(dritter.page, "//?von=demo");
    await keinDialog(dritter.page, "//?von=demo");
    assert.equal(await dritter.page.locator("#pc-submit").count(), 1, "der Rechner ist der Fehleransicht gewichen");
    assert.equal(new URL(dritter.page.url()).searchParams.has("von"), false);
    assert.deepEqual([...fehler, ...zweiter.fehler, ...dritter.fehler], []);
  } finally { await ctx.close(); }
});

test("H6 — nach dem Schließen dieselben Felder, Eingabe und Preisabfrage wie ohne Dialog; keine eigene Anfrage", async () => {
  // Zum Vergleich ein Tab, in dem schon entschieden ist: dieselben Anfragen beim Laden.
  const ohne = await profil();
  const mit = await profil();
  try {
    const vorher = await tab(ohne.ctx);
    await ohneDemoHinweis(vorher.page);
    await oeffne(vorher.page);
    await keinDialog(vorher.page, "entschieden");

    const { page, fehler } = await tab(mit.ctx);
    await oeffne(page);
    await dialog(page).waitFor({ state: "visible", timeout: 10000 });
    await kurz(400);
    const pfade = (liste) => [...new Set(liste.map((a) => a.replace(/\?.*$/, "").replace(/^(\w+) https?:\/\/[^/]+/, "$1 ")))].sort();
    assert.deepEqual(pfade(mit.anfragen), pfade(ohne.anfragen), "der Dialog stellt eine eigene Anfrage");
    assert.ok(!mit.anfragen.some((a) => a.includes(`${HAUPT}/demo`)), "die Demo wird vorab geladen");

    const feld = await page.$("#pc-from-zip");
    await page.click("#pc-demo-hinweis-rechner");
    await dialog(page).waitFor({ state: "detached", timeout: 5000 });
    assert.equal(await feld.evaluate((el) => el.isConnected), true, "das Formular wurde neu aufgebaut");
    await page.fill("#pc-from-zip", "70173");
    await page.fill("#pc-from-city", "Stuttgart");
    await page.fill("#pc-to-zip", "10115");
    await page.fill("#pc-to-city", "Berlin");
    await page.fill("#pc-weight", "2,5");
    await page.fill("#pc-length", "30");
    await page.fill("#pc-width", "20");
    await page.fill("#pc-height", "10");
    await page.click("#pc-submit");
    await page.waitForSelector("#pc-offers .pc-offer", { timeout: 20000 });
    assert.equal(await page.inputValue("#pc-from-zip"), "70173");
    assert.equal(await dialog(page).count(), 0);
    assert.equal(mit.anfragen.filter((a) => a.startsWith(`POST ${API}/api/public/price-quote`) && !a.includes("prepare")).length, 1);
    assert.deepEqual([...vorher.fehler, ...fehler], []);
  } finally { await ohne.ctx.close(); await mit.ctx.close(); }
});
