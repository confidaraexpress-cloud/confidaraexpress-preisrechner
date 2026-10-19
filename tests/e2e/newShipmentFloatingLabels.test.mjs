// Browser-Smokes: schwebende Beschriftungen und Fehlerführung in „Neue Sendung" und im
// angemeldeten Preisrechner.
//
// Betreiberentscheidung Auftrag 1, P11 (2026-10-17): beide Versandformulare tragen wieder
// schwebende Beschriftungen (das Redesign 2026-10 hatte sie zurückgenommen). Die Beschriftung
// steht bei leerem Feld IM Rahmen und wandert bei Fokus oder Eingabe nach oben; Musterplatzhalter
// gibt es nicht mehr. „Angebote vergleichen" ist auch bei fehlenden Angaben bedienbar: ein Klick
// markiert alle fehlenden Pflichtfelder, springt nach dem Rendern zum ersten und sendet nichts.
// Beim Verlassen wird nur das verlassene Feld geprüft.
//
// Echter Dev-Server, echtes Rendering, echte Kaskade. Gemessen wird mit getBoundingClientRect
// und getComputedStyle — nicht anhand von Screenshots und nicht anhand des Quelltexts.
//
// Grenze dieser Suite: echtes Browser-Autofill lässt sich headless nicht auslösen. Geprüft wird
// nur, dass die CSS-Regel für die Autofill-Vorschau geladen ist; die Abnahme auf echten Geräten
// (Chrome, Edge, Android Chrome, iPhone Safari) steht im Abschlussbericht.
//
// NIEMALS eine echte Bestellung: alle Backendrufe sind abgefangen, /book antwortet mit 500.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { PACKAGE_COUNT_DEFAULT, DEFAULT_ORIGIN_COUNTRY } from "../../src/utils/newShipmentForm.mjs";

const PORT = 5262, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// Kontrollierte Testdaten — kein echtes Konto.
const USER = {
  id: 1, email: "kunde@example.com", company_name: "Testfirma", name: "Test Kunde",
  role: "customer", status: "approved", country: "DE", zip: "70173", city: "Stuttgart",
  street: "Teststraße 1", phone: "0711 123456", customer_number: "CE-K-10030",
};

let server, browser;
let calcAnfragen = 0;

async function setupRoutes(ziel) {
  await ziel.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/book")) return json({ error: "im Smoke nicht erlaubt" }, 500);
    if (p.endsWith("/calculate-price")) {
      calcAnfragen++;
      return json({ tariffs: [], ceShipmentId: 4242, publicCarriers: [], customsRequired: false,
                    fromCountryCode: "DE", toCountryCode: "DE" });
    }
    if (p.endsWith("/api/address/localities")) return json({ cities: ["Stuttgart", "Stuttgart-Mitte"] });
    if (p.endsWith("/api/address/streets"))
      return json({ streets: [{ street: "Königstraße", postalCode: "70173", city: "Stuttgart" }] });
    if (p.endsWith("/api/address/validate")) return json({ status: "unverified" });
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [],
                  summary: null, pagination: { total: 0 } });
  });
}

async function neueSeite(pfad, warteAuf, viewport = { width: 1440, height: 900 }, opts = {}) {
  const ctx = await browser.newContext({ viewport, ...opts });
  await setupRoutes(ctx);
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.addInitScript(() => { localStorage.setItem("ce_token", "test-token"); });
  await page.goto(`${BASE}${pfad}`, { waitUntil: "networkidle" });
  await page.waitForSelector(warteAuf, { timeout: 20000 });
  return { ctx, page, fehler };
}
const neueSendung = (viewport, opts) => neueSeite("/dashboard?page=new", "#ns-weight", viewport, opts);
const preisrechner = (viewport, opts) => neueSeite("/calculator", "#calc-to-zip", viewport, opts);

/** Feld, Beschriftung und Feldtext als gemessene Kästen. */
async function messung(page, id) {
  return page.evaluate((feldId) => {
    const input = document.getElementById(feldId);
    if (!input) return null;
    const label = document.querySelector(`label[for="${feldId}"]`);
    const cs = getComputedStyle(input);
    const ir = input.getBoundingClientRect();
    const lr = label.getBoundingClientRect();
    const wrap = input.closest(".ce-field--floating");
    return {
      input: { x: ir.x, y: ir.y, w: ir.width, h: ir.height, bottom: ir.bottom, right: ir.right },
      label: { x: lr.x, y: lr.y, w: lr.width, bottom: lr.bottom, right: lr.right },
      textTop: ir.y + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop),
      labelFont: parseFloat(getComputedStyle(label).fontSize),
      floating: wrap ? wrap.classList.contains("is-floating") : null,
      placeholder: input.getAttribute("placeholder") || "",
      wert: input.value,
    };
  }, id);
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
async function ueberlappungsfrei(page, id) {
  const m = await messung(page, id);
  assert.ok(m, `${id}: Feld fehlt`);
  assert.equal(m.floating, true, `${id}: Beschriftung schwebt nicht`);
  assert.ok(m.label.bottom <= m.textTop + 0.5, `${id}: Beschriftung (${m.label.bottom}) überdeckt den Text (${m.textTop})`);
  assert.ok(m.label.x >= m.input.x && m.label.right <= m.input.right, `${id}: Beschriftung ragt aus dem Feld`);
  return m;
}

const NS_TEXT = ["s-company", "s-firstName", "s-lastName", "s-street", "s-addition", "s-zip", "s-city", "s-phone", "s-email",
                 "r-company", "r-firstName", "r-lastName", "r-street", "r-addition", "r-zip", "r-city", "r-phone", "r-email"]
  .map((k) => `ns-${k}`);
const NS_PAKET = ["ns-weight", "ns-length", "ns-width", "ns-height"];
// Pflichtfelder eines leeren Formulars — das Absenderland ist vorausgewählt, die Anzahl trägt
// ihre Vorgabe, das Versanddatum ist heute. Die Empfänger-PLZ fehlt bewusst: ohne Land hat sie
// keine Regel, und ein fehlendes Land soll nicht als PLZ-Fehler erscheinen (getErrors).
const NS_PFLICHT_LEER = [
  "s_firstName", "s_lastName", "s_street", "s_zip", "s_city", "s_phone", "s_email",
  "r_firstName", "r_lastName", "r_country", "r_street", "r_city", "r_phone", "r_email",
  "weight", "length", "width", "height", "declaredContent", "declaredGoodsValue",
];

test.before(async () => {
  server = spawn("npm", ["run", "dev", "--", "--port", String(PORT), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], ...DEV_SERVER_SPAWN });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("Dev-Server startet nicht")), 60000);
    server.stdout.on("data", (d) => { if (String(d).includes("ready in") || String(d).includes("Local:")) { clearTimeout(t); setTimeout(res, 900); } });
  });
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.beforeEach(() => { calcAnfragen = 0; });

test.after(async () => {
  if (browser) await browser.close();
  stopDevServer(server, "SIGTERM");
});

test("1 — Nullzustand: leer bis auf Absenderland und Anzahl, keine Musterplatzhalter, keine Fehlerwand", async () => {
  const { ctx, page, fehler } = await neueSendung();
  for (const id of [...NS_TEXT, ...NS_PAKET, "ns-declaredContent", "ns-declaredGoodsValue"]) {
    const m = await messung(page, id);
    assert.equal(m.wert, "", `${id} ist vorbelegt`);
    assert.equal(m.placeholder, "", `${id} trägt einen Platzhalter: „${m.placeholder}“`);
  }
  assert.equal(await page.inputValue("#ns-s-country"), DEFAULT_ORIGIN_COUNTRY, "Deutschland ist nicht vorausgewählt");
  assert.equal(await page.inputValue("#ns-r-country"), "", "das Empfängerland ist vorbelegt");
  assert.equal(await page.inputValue("#ns-packageCount"), PACKAGE_COUNT_DEFAULT);
  assert.equal(await page.locator('[aria-invalid="true"]').count(), 0, "ein frisches Formular zeigt Fehler");
  assert.equal(await page.locator(".field-error").count(), 0);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("2 — Ruhezustand: die Beschriftung steht IM leeren Feld", async () => {
  const { ctx, page } = await neueSendung();
  for (const id of ["ns-s-firstName", "ns-s-street", "ns-r-city", "ns-weight", "ns-declaredContent"]) {
    const m = await messung(page, id);
    assert.equal(m.floating, false, `${id}: schwebt ohne Fokus und ohne Wert`);
    assert.ok(m.label.y >= m.input.y && m.label.bottom <= m.input.bottom, `${id}: Beschriftung steht nicht im Feld`);
  }
  await ctx.close();
});

test("3 — Fokus und Eingabe heben die Beschriftung an, ohne den Text zu überdecken", async () => {
  const { ctx, page } = await neueSendung();
  const ruhe = await messung(page, "ns-s-firstName");
  await page.click("#ns-s-firstName");
  await warte(350);
  const fokus = await ueberlappungsfrei(page, "ns-s-firstName");
  assert.ok(fokus.labelFont < ruhe.labelFont, "die Beschriftung wird beim Anheben nicht kleiner");
  await page.keyboard.type("Anna");
  await page.keyboard.press("Tab");
  await warte(350);
  await ueberlappungsfrei(page, "ns-s-firstName");
  await page.fill("#ns-s-firstName", "");
  await page.locator("#ns-s-lastName").focus();
  await warte(350);
  assert.equal((await messung(page, "ns-s-firstName")).floating, false, "ein geleertes Feld senkt die Beschriftung nicht");
  await ctx.close();
});

test("4 — gefüllte Felder: Beschriftung und Wert überschneiden sich nirgends", async () => {
  const { ctx, page } = await neueSendung();
  for (const id of NS_TEXT) await page.fill(`#${id}`, id.includes("zip") ? "70173" : "Wert mit etwas Länge");
  for (const id of NS_PAKET) await page.fill(`#${id}`, "12");
  await page.locator("#ns-declaredContent").focus();
  await warte(350);
  for (const id of [...NS_TEXT, ...NS_PAKET]) await ueberlappungsfrei(page, id);
  // Auswahlfelder tragen ihre Beschriftung immer oben — auch das leere Empfängerland.
  for (const id of ["ns-s-country", "ns-r-country"]) await ueberlappungsfrei(page, id);
  // Die Einheit erscheint im Schwebezustand rechts im Feld und liegt vollständig darin.
  const einheit = await page.evaluate(() => {
    const feld = document.getElementById("ns-weight");
    const u = feld.closest(".ce-field").querySelector(".ce-field-unit");
    const ur = u.getBoundingClientRect(), f = feld.getBoundingClientRect();
    return { opacity: getComputedStyle(u).opacity,
             innen: ur.left >= f.left && ur.right <= f.right && ur.top >= f.top && ur.bottom <= f.bottom };
  });
  assert.equal(einheit.opacity, "1");
  assert.ok(einheit.innen, "die Einheit liegt außerhalb des Feldes");
  await ctx.close();
});

test("5 — eine unvollständige Zahl („1e“) hält die Beschriftung oben und nennt den richtigen Fehler", async () => {
  const { ctx, page } = await neueSendung();
  await page.click("#ns-weight");
  await page.keyboard.type("1e");
  await page.keyboard.press("Tab");
  await warte(350);
  await ueberlappungsfrei(page, "ns-weight");
  assert.equal(await page.getAttribute("#ns-weight", "aria-invalid"), "true", "die unvollständige Zahl ist nicht markiert");
  const fehlerId = await page.getAttribute("#ns-weight", "aria-describedby");
  assert.equal((await page.locator(`#${fehlerId}`).innerText()).trim(), "Bitte geben Sie eine gültige Zahl ein.");
  await ctx.close();
});

test("6 — Klick auf ein leeres Formular: alle Pflichtfelder rot, Fokus aufs erste, KEIN Request", async () => {
  const { ctx, page, fehler } = await neueSendung();
  const cta = page.locator(".offers-calc-cta button.dft-cta-primary");
  assert.equal(await cta.isDisabled(), false, "der Knopf ist bei fehlenden Angaben gesperrt");
  await cta.click();
  await page.waitForFunction(() => document.activeElement?.id === "ns-s-firstName", null, { timeout: 5000 });
  for (const feld of NS_PFLICHT_LEER) {
    const el = page.locator(`[data-field="${feld}"]`);
    assert.equal(await el.getAttribute("aria-invalid"), "true", `${feld} ist nicht markiert`);
    const beschreibung = await el.getAttribute("aria-describedby");
    assert.ok(beschreibung, `${feld}: kein aria-describedby`);
    const text = (await page.locator(`#${beschreibung.split(" ")[0]}`).innerText()).trim();
    assert.ok(text.length > 0, `${feld}: kein Fehlertext`);
  }
  // Der sanfte Scroll bringt das Feld ins Bild.
  await page.waitForFunction(() => {
    const r = document.getElementById("ns-s-firstName").getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  }, null, { timeout: 4000 });
  await warte(300);
  assert.equal(calcAnfragen, 0, "ein unvollständiges Formular hat den Server erreicht");
  // Der Sammelhinweis nennt die Zahl der markierten Angaben.
  assert.match(await page.locator(".offers-calc-cta").innerText(), /markierte Angabe/);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("7 — Verlassen prüft nur das verlassene Feld; eine Korrektur nimmt die Markierung sofort weg", async () => {
  const { ctx, page } = await neueSendung();
  await page.click("#ns-r-street");
  await page.keyboard.press("Tab");
  await warte(150);
  assert.equal(await page.getAttribute("#ns-r-street", "aria-invalid"), "true", "das verlassene Feld ist nicht markiert");
  for (const id of ["ns-r-city", "ns-r-zip", "ns-s-firstName", "ns-weight"]) {
    assert.equal(await page.getAttribute(`#${id}`, "aria-invalid"), null, `${id} ist markiert, obwohl unberührt`);
  }
  await page.fill("#ns-r-street", "Hauptstraße 5");
  await warte(100);
  assert.equal(await page.getAttribute("#ns-r-street", "aria-invalid"), null, "die Markierung bleibt nach der Korrektur");
  // Eine einzelne Änderung löscht keine anderen Markierungen (die Absender-PLZ hat mit
  // Deutschland eine Regel).
  await page.click("#ns-s-zip");
  await page.keyboard.press("Tab");
  await page.fill("#ns-s-company", "Firma");
  await warte(100);
  assert.equal(await page.getAttribute("#ns-s-zip", "aria-invalid"), "true", "eine Änderung an einem anderen Feld löschte die Markierung");
  await ctx.close();
});

test("8 — die Vorschlagsliste bleibt 4 px unter dem schwebenden Feld", async () => {
  const { ctx, page } = await neueSendung();
  // Das Absenderland ist vorausgewählt — die Straßensuche läuft ohne weitere Angaben.
  await page.click("#ns-s-street");
  await page.keyboard.type("Königstr", { delay: 20 });
  await page.waitForSelector(".addr-suggest-pop", { timeout: 8000 });
  const abstand = await page.evaluate(() => {
    const f = document.getElementById("ns-s-street").getBoundingClientRect();
    const p = document.querySelector(".addr-suggest-pop").getBoundingClientRect();
    return { oben: p.top - f.bottom, links: p.left - f.left, breite: p.width - f.width };
  });
  assert.ok(Math.abs(abstand.oben - 4) <= 1.5, `die Liste steht ${abstand.oben} px unter dem Feld`);
  assert.ok(Math.abs(abstand.links) <= 1 && Math.abs(abstand.breite) <= 1, "die Liste ist nicht feldbündig");
  await ctx.close();
});

test("9 — die Autofill-Vorschau hebt die Beschriftung an (CSS-Regel geladen)", async () => {
  const { ctx, page } = await neueSendung();
  const regeln = await page.evaluate(() => {
    const treffer = [];
    for (const sheet of document.styleSheets) {
      let rules = [];
      try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) if (r.selectorText && r.selectorText.includes("autofill") && r.selectorText.includes(".ce-field-label")) treffer.push(r.selectorText);
    }
    return treffer;
  });
  assert.ok(regeln.some((s) => s.includes(":-webkit-autofill")), "die Autofill-Regel für Chromium fehlt");
  await ctx.close();
});

test("10 — Preisrechner: dieselben schwebenden Felder, bedienbarer Knopf, Fokus aufs erste Fehlerfeld", async () => {
  const { ctx, page, fehler } = await preisrechner();
  assert.equal(await page.inputValue("#calc-from-country"), DEFAULT_ORIGIN_COUNTRY);
  // PLZ der Herkunft kommt aus dem (deutschen) Profil.
  assert.equal(await page.inputValue("#calc-from-zip"), USER.zip);
  for (const id of ["calc-to-zip", "calc-weight", "calc-length"]) {
    const m = await messung(page, id);
    assert.equal(m.floating, false, `${id}: schwebt im Ruhezustand`);
    assert.equal(m.placeholder, "", `${id}: Platzhalter „${m.placeholder}“`);
  }
  const cta = page.getByRole("button", { name: /Angebote vergleichen/i }).first();
  assert.equal(await cta.isDisabled(), false, "der Knopf ist bei fehlenden Angaben gesperrt");
  await cta.click();
  await page.waitForFunction(() => document.activeElement?.id === "calc-to-zip", null, { timeout: 5000 });
  for (const feld of ["to_zip", "to_city", "weight", "length", "width", "height"]) {
    assert.equal(await page.getAttribute(`[data-field="${feld}"]`, "aria-invalid"), "true", `${feld} ist nicht markiert`);
  }
  await warte(300);
  assert.equal(calcAnfragen, 0, "ein unvollständiges Formular hat den Server erreicht");
  // Eine Korrektur nimmt die Markierung sofort weg — die übrigen bleiben.
  await page.fill("#calc-to-zip", "10115");
  await warte(100);
  assert.equal(await page.getAttribute("#calc-to-zip", "aria-invalid"), null);
  assert.equal(await page.getAttribute("#calc-weight", "aria-invalid"), "true");
  await ueberlappungsfrei(page, "calc-to-zip");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

for (const breite of [390, 320]) {
  test(`11 — ${breite} px Touch: kein Überlauf, 44-px-Ziele, Fehlerfokus erreicht das Feld`, async () => {
    const { ctx, page } = await neueSendung({ width: breite, height: 800 }, { hasTouch: true, isMobile: true });
    const ueberlauf = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    assert.ok(ueberlauf <= 0, `${ueberlauf} px waagrechter Überlauf`);
    for (const id of ["ns-s-firstName", "ns-s-zip", "ns-weight", "ns-height"]) {
      const m = await messung(page, id);
      assert.ok(m.input.h >= 44, `${id}: ${m.input.h} px hoch`);
      assert.ok(m.label.right <= m.input.right, `${id}: Beschriftung abgeschnitten`);
    }
    await page.fill("#ns-weight", "2");
    await page.fill("#ns-height", "15");
    await page.locator("#ns-declaredContent").focus();
    await warte(350);
    await ueberlappungsfrei(page, "ns-weight");
    await ueberlappungsfrei(page, "ns-height");
    await page.locator(".offers-calc-cta button.dft-cta-primary").tap();
    await page.waitForFunction(() => document.activeElement?.id === "ns-s-firstName", null, { timeout: 5000 });
    await page.waitForFunction(() => {
      const r = document.getElementById("ns-s-firstName").getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    }, null, { timeout: 4000 });
    await ctx.close();
  });
}
