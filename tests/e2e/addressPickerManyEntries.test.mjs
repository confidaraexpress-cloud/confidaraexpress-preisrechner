// E2E: „Adresse suchen“ mit vielen Einträgen (Startklar, Betreiberentscheidung 2026-11-23, Teil A).
//
// Befund vorher: Ab etwa vier Treffern schrumpfte jeder Eintrag der Auswahlliste auf 40 bzw. 44 px (Flex-Spalte mit
// fester Höchsthöhe, ausdrückliches min-height statt Inhaltsminimum) — die drei Zeilen je Adresse liefen übereinander.
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — kein echter Request, keine Bestellung.
//
//   P1  Desktop 1440 × 900 mit 2, 4, 12 und 20 Einträgen: kein Inhalt läuft über seinen Eintrag, keine zwei Einträge
//       überdecken sich, lange Firmennamen stehen vollständig, ab 12 Einträgen scrollt die Liste
//   P2  Smartphone 390 × 844 und 360 × 740 (Touch): dasselbe, jeder Eintrag mindestens 44 px, kein Querüberlauf
//   P3  Auswahl nach dem Scrollen in der Liste übernimmt genau die gewählte Adresse (Desktop und Smartphone)
//   P4  Tastatur: Pfeiltasten und Ende bewegen den Fokus durch die Liste, der fokussierte Eintrag ist sichtbar, Enter
//       übernimmt ihn
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5801, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 7, email: "einkauf@musterkunde.example", name: "Anna Berger", company_name: "Musterkunde GmbH", role: "customer",
  status: "approved", country: "DE", zip: "70173", city: "Stuttgart", street: "Königstraße 1", vat_id: "DE123456789",
};
const FIRMEN = [
  "Spedition und Logistikzentrum Müller-Lüdenscheidt Internationale Handelsgesellschaft mbH & Co. KG",
  "Ziel AG",
  "Krankenhausapotheke des Universitätsklinikums Schleswig-Holstein, Campus Lübeck",
  "Hafenlager Nord GmbH",
];
// Drei Zeilen je Eintrag (Bezeichnung oder Firma, Person, Anschrift), lange Firmennamen und Anschriften mit Zusatz.
function adressen(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: 500 + i, label: i % 3 === 0 ? `Lager ${i + 1}` : "", company: FIRMEN[i % FIRMEN.length],
    firstName: i % 2 ? "Maximiliane" : "Jo", lastName: i % 2 ? "von Hohenstein-Wartenberg" : "Kim", contactName: "",
    streetAndNumber: i % 4 === 1 ? `Industriestraße ${100 + i}, Halle 7, Rampe 3–5` : `Hafenstraße ${12 + i}`,
    addressAdd: i % 5 === 2 ? "Hinterhaus, 3. Obergeschoss, Warenannahme" : "", postalCode: "20457",
    city: i % 2 ? "Hamburg-Wilhelmsburg" : "Hamburg", state: "", country: "DE", phone: "+49401234567",
    email: `lager${i}@kunde.example`, role: "recipient", isDefaultSender: false, isDefaultRecipient: false, favorite: false,
  }));
}

let server, browser;

async function seite({ n, viewport = { width: 1440, height: 900 }, kontext = {} }) {
  const context = await browser.newContext({ viewport, ...kontext });
  const page = await context.newPage();
  const zustand = { fehler: [], fremd: [] };
  page.on("pageerror", (e) => zustand.fehler.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.includes("/addresses")) {
      if (url.searchParams.get("default")) return json({ items: [], nextCursor: null });
      return json({ items: adressen(n), nextCursor: null });
    }
    if (p.endsWith("/calculate-price") || p.endsWith("/book")) { zustand.fremd.push(p); return json({ error: "nicht erlaubt" }, 500); }
    if (p.includes("/address/")) return json({ status: "unsupported" });
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], summary: null, pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ns-weight", { timeout: 30000 });
  return { context, page, zustand };
}

// Öffnet „Adresse suchen“ des Empfängers und wartet auf die Liste.
async function oeffneEmpfaengerAuswahl(page) {
  const ausloeser = page.locator(".abk-pick-trigger").last();
  await ausloeser.scrollIntoViewIfNeeded();
  await ausloeser.click();
  await page.locator(".abk-pick-item").first().waitFor({ state: "visible", timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
}

// Geometrie der Liste: je Eintrag Rahmen, Inhaltshöhe und Text; dazu Scrollzustand und Querüberlauf.
async function liste(page) {
  return page.evaluate(() => {
    const l = document.querySelector(".abk-pick-list");
    const items = [...l.querySelectorAll(".abk-pick-item")].map((e) => {
      const r = e.getBoundingClientRect();
      return { t: r.top, b: r.bottom, h: r.height, inhalt: e.scrollHeight, box: e.clientHeight, text: e.innerText.replace(/\s+/g, " ").trim() };
    });
    return {
      items,
      scrollbar: l.scrollHeight > l.clientHeight + 1,
      listeQuer: l.scrollWidth - l.clientWidth,
      seiteQuer: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

function pruefeKeinUeberlauf(m, n, wo) {
  assert.equal(m.items.length, n, `${wo}: Anzahl`);
  const ueber = m.items.filter((x) => x.inhalt > x.box + 1);
  assert.equal(ueber.length, 0, `${wo}: Inhalt läuft aus ${ueber.length} Einträgen heraus (${JSON.stringify(ueber.slice(0, 2))})`);
  for (let i = 1; i < m.items.length; i++) {
    assert.ok(m.items[i].t >= m.items[i - 1].b - 0.5, `${wo}: Eintrag ${i} überdeckt Eintrag ${i - 1}`);
  }
  assert.ok(m.listeQuer <= 0, `${wo}: die Liste läuft quer über (${m.listeQuer})`);
  for (const x of m.items) {
    if (x.text.includes("Spedition")) assert.ok(x.text.includes(FIRMEN[0]), `${wo}: langer Firmenname gekürzt: ${x.text}`);
  }
}

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

test("P1 — Desktop mit 2, 4, 12 und 20 Einträgen: nichts überlappt, nichts wird gekürzt, ab 12 scrollt die Liste", async () => {
  for (const n of [2, 4, 12, 20]) {
    const { context, page, zustand } = await seite({ n });
    await oeffneEmpfaengerAuswahl(page);
    const m = await liste(page);
    pruefeKeinUeberlauf(m, n, `1440 / ${n}`);
    if (n >= 12) assert.ok(m.scrollbar, `${n} Einträge: die Liste muss scrollen`);
    // Drei Zeilen je Eintrag passen: jeder Eintrag ist mindestens so hoch wie sein Inhalt (vorher 40 px).
    assert.ok(Math.min(...m.items.map((x) => x.h)) >= 56, `${n}: Einträge zu niedrig (${Math.min(...m.items.map((x) => x.h))})`);
    assert.deepEqual(zustand.fehler, []);
    await context.close();
  }
});

test("P2 — Smartphone 390 und 360 px: nichts überlappt, Einträge mindestens 44 px, kein Querüberlauf", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    for (const n of [4, 20]) {
      const { context, page } = await seite({ n, viewport, kontext: { hasTouch: true, isMobile: true } });
      await oeffneEmpfaengerAuswahl(page);
      const m = await liste(page);
      pruefeKeinUeberlauf(m, n, `${viewport.width} / ${n}`);
      assert.ok(m.items.every((x) => x.h >= 44), `${viewport.width}: Touch-Ziele unter 44 px`);
      assert.ok(m.seiteQuer <= 0, `${viewport.width}: die Seite läuft quer über (${m.seiteQuer})`);
      await context.close();
    }
  }
});

test("P3 — Auswahl nach dem Scrollen übernimmt genau die gewählte Adresse", async () => {
  for (const [viewport, kontext] of [[{ width: 1440, height: 900 }, {}], [{ width: 390, height: 844 }, { hasTouch: true, isMobile: true }]]) {
    const { context, page } = await seite({ n: 20, viewport, kontext });
    await oeffneEmpfaengerAuswahl(page);
    const index = 17; // weit unten in der Liste: Ziel AG, Industriestraße 117, Hamburg-Wilhelmsburg
    const ziel = page.locator(".abk-pick-item").nth(index);
    await ziel.scrollIntoViewIfNeeded();
    // Mitte des Eintrags liegt wirklich auf diesem Eintrag (nicht auf einem Nachbarn darüber oder darunter).
    const frei = await ziel.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(oben && (oben === e || e.contains(oben)));
    });
    assert.ok(frei, `${viewport.width}: der Eintrag liegt nicht frei`);
    if (kontext.hasTouch) await ziel.tap(); else await ziel.click();
    await page.waitForFunction(() => document.querySelector("#ns-r-city")?.value === "Hamburg-Wilhelmsburg", null, { timeout: 5000 });
    const felder = await page.evaluate(() => ({
      firma: document.querySelector("#ns-r-company").value,
      strasse: document.querySelector("#ns-r-street").value,
      ort: document.querySelector("#ns-r-city").value,
    }));
    assert.deepEqual(felder, { firma: "Ziel AG", strasse: "Industriestraße 117, Halle 7, Rampe 3–5", ort: "Hamburg-Wilhelmsburg" },
      `${viewport.width}: falsche Adresse übernommen`);
    await context.close();
  }
});

test("P4 — Tastatur: Pfeiltasten und Ende bewegen den Fokus sichtbar durch die Liste, Enter übernimmt", async () => {
  const { context, page } = await seite({ n: 12 });
  await oeffneEmpfaengerAuswahl(page);
  // Der Fokus steht beim Öffnen im Suchfeld.
  assert.equal(await page.evaluate(() => document.activeElement?.type), "search");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => [...document.querySelectorAll(".abk-pick-item")].indexOf(document.activeElement)), 0);
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => [...document.querySelectorAll(".abk-pick-item")].indexOf(document.activeElement)), 1);
  await page.keyboard.press("End");
  const letzter = await page.evaluate(() => {
    const items = [...document.querySelectorAll(".abk-pick-item")];
    const l = document.querySelector(".abk-pick-list").getBoundingClientRect();
    const r = document.activeElement.getBoundingClientRect();
    return { index: items.indexOf(document.activeElement), sichtbar: r.top >= l.top - 1 && r.bottom <= l.bottom + 1,
      umriss: getComputedStyle(document.activeElement).outlineStyle !== "none" };
  });
  assert.deepEqual([letzter.index, letzter.sichtbar], [11, true], JSON.stringify(letzter));
  assert.ok(letzter.umriss, "kein sichtbarer Fokus am Eintrag");
  await page.keyboard.press("Enter");
  // Eintrag 11: Hafenlager Nord GmbH, Hafenstraße 23, Hamburg-Wilhelmsburg
  await page.waitForFunction(() => document.querySelector("#ns-r-street")?.value === "Hafenstraße 23", null, { timeout: 5000 });
  assert.equal(await page.inputValue("#ns-r-company"), "Hafenlager Nord GmbH");
  assert.equal(await page.locator(".abk-pick-item").count(), 0, "die Auswahl bleibt nach der Übernahme offen");
  await context.close();
});
