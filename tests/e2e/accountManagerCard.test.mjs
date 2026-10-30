// E2E: Persönlicher ConfidaraExpress-Ansprechpartner in der Seitenleiste (Betreiberentscheidung 2026-10-30,
// Canonical 1A, v2.90). Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — keine echte Person wird geladen.
//
//   A  Person: Name, „Ihr Ansprechpartner“, tel:/mailto:, Foto authentifiziert geladen, Karte in der Spalte
//   B  Puls: läuft dauerhaft, Pause und Fortsetzen über den Punkt, Vorliebe überlebt das Neuladen
//   C  reduzierte Bewegung: kein Puls, kein Schalter
//   D  ohne Zuordnung: Kundenservice ohne Person, ohne Kontaktlinks, ohne Fotoabruf
//   E  Foto nicht ladbar: Initialen der richtigen Person
//   F  Tastatur: Schalter, Telefon, E-Mail in dieser Reihenfolge mit sichtbarem Fokus
//   G  Telefon 390 px (Touch): Karte im Menü, kein Querüberlauf, Ziele 44 px
//   H  200 % Zoom und 24 px Browserschrift: kein Überlauf, Telefonnummer ungebrochen
//   I  lange E-Mail-Adresse: Umbruch vor dem „@“, kein Überlauf
//   J  Adminwechsel: nach dem nächsten Abruf von /kundenbereich die neue Person, neues Foto
//   K  öffentliche Demo: Kundenservice, keine Person, kein Fotoabruf
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5591, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// 2 × 2 PNG (deckend) — irgendein echtes Bild genügt; geprüft wird Abruf und Anzeige, nicht das Motiv.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DwHwyBGEGEMWBgYAAAI5gMDX0fF0IAAAAASUVORK5CYII=", "base64");

const KUNDE = {
  id: 7, email: "einkauf@musterkunde.example", name: "Anna Berger", company_name: "Musterkunde GmbH", role: "customer",
  status: "approved", country: "DE", zip: "70173", city: "Stuttgart", street: "Königstraße 1", vat_id: "DE123456789",
  customer_number: "CE-K-10031", payment_term: 14,
};
const PATRICK = {
  key: "patrick", name: "Patrick Werner", phone: { display: "0175 4167701", href: "tel:+491754167701" },
  email: "p.werner@confidaraexpress.de", photo: { version: "f9f2e8726f13" },
};
const MIGUEL = {
  key: "miguel", name: "Miguel Vance", phone: { display: "0160 92717124", href: "tel:+4916092717124" },
  email: "m.vance@confidaraexpress.de", photo: { version: "a9e5f27c281f" },
};

let server, browser;

async function seite({ am = PATRICK, foto = 200, viewport = { width: 1440, height: 900 }, kontext = {}, ziel = "/dashboard" } = {}) {
  const context = await browser.newContext({ viewport, ...kontext });
  const page = await context.newPage();
  const zustand = { am, fotoAbrufe: [], fehler: [] };
  page.on("pageerror", (e) => zustand.fehler.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const pfad = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/kundenbereich")) return json({ user: KUNDE, pendingEmailChange: null, companyLogo: null, accountManager: zustand.am });
    if (pfad.endsWith("/api/kunde/account-manager/photo")) {
      zustand.fotoAbrufe.push(req.headers().authorization || "");
      if (foto !== 200) return json({ error: "Kein Foto vorhanden.", code: "ACCOUNT_MANAGER_NOT_ASSIGNED" }, foto);
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG, headers: { "cache-control": "private, no-store" } });
    }
    if (pfad.includes("/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    return json({ items: [], users: [], shipments: [], invoices: [], drafts: [], addresses: [], summary: null, nextCursor: null, pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await page.goto(`${BASE}${ziel}`, { waitUntil: "domcontentloaded" });
  // „attached“: im Menü (unter 861 px) ist die Seitenleiste bis zum Öffnen unsichtbar.
  await page.locator(".pp-ansprech").first().waitFor({ state: "attached", timeout: 30000 });
  return { context, page, zustand };
}

// Maße und Zustände der sichtbaren Karte (im Menü die geöffnete Fassung).
async function messen(page) {
  return page.evaluate(() => {
    const karte = [...document.querySelectorAll(".pp-ansprech")].find((k) => k.getClientRects().length > 0);
    const spalte = karte.closest(".pp-side-scroll");
    const r = karte.getBoundingClientRect(), s = spalte.getBoundingClientRect();
    const box = (sel) => { const e = karte.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { w: b.width, h: b.height, rechts: b.right, unten: b.bottom }; };
    const puls = karte.querySelector(".pp-ansprech-puls");
    const punkt = karte.querySelector(".pp-ansprech-punkt");
    return {
      text: karte.innerText.replace(/\s+/g, " ").trim(),
      klasse: karte.className,
      karte: { links: r.left, rechts: r.right, breite: r.width, hoehe: r.height },
      spalte: { links: s.left, rechts: s.right },
      ueberlauf: { karte: karte.scrollWidth - karte.clientWidth, spalte: spalte.scrollWidth - spalte.clientWidth, seite: document.documentElement.scrollWidth - document.documentElement.clientWidth },
      tel: karte.querySelector(".pp-ansprech-tel")?.getAttribute("href") ?? null,
      mail: karte.querySelector(".pp-ansprech-mail")?.getAttribute("href") ?? null,
      telBox: box(".pp-ansprech-tel"), mailBox: box(".pp-ansprech-mail"), pulsBox: box(".pp-ansprech-puls"),
      telZeilen: (() => { const e = karte.querySelector(".pp-ansprech-tel"); return e ? e.getClientRects().length : 0; })(),
      foto: (() => { const i = karte.querySelector("img.pp-ansprech-foto"); return i ? { src: i.getAttribute("src") || "", geladen: i.complete && i.naturalWidth > 0, alt: i.getAttribute("alt") } : null; })(),
      initialen: karte.querySelector(".pp-ansprech-initialen")?.textContent ?? null,
      puls: puls ? { daten: puls.getAttribute("data-puls"), name: puls.getAttribute("aria-label") } : null,
      animation: punkt ? (() => { const st = getComputedStyle(punkt, "::after"); return { name: st.animationName, wdh: st.animationIterationCount }; })() : null,
      punktVersteckt: punkt ? punkt.getAttribute("aria-hidden") : null,
    };
  });
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

test("A — Person: Name, Rolle, Links, authentifiziertes Foto, Karte vollständig in der Spalte", async () => {
  const { context, page, zustand } = await seite();
  await page.locator(".pp-ansprech-foto").waitFor({ timeout: 15000 });
  await page.waitForFunction(() => { const i = document.querySelector(".pp-ansprech-foto"); return i && i.complete && i.naturalWidth > 0; });
  const m = await messen(page);
  assert.match(m.text, /^Patrick Werner Ihr Ansprechpartner Anrufen: 0175 4167701 E-Mail an p\.werner@confidaraexpress\.de$/);
  assert.deepEqual([m.tel, m.mail], ["tel:+491754167701", "mailto:p.werner@confidaraexpress.de"]);
  assert.deepEqual([m.foto.geladen, m.foto.alt, m.foto.src.startsWith("blob:")], [true, "", true]);
  assert.deepEqual(zustand.fotoAbrufe, ["Bearer e2e-token"], "genau ein Abruf mit Anmeldung");
  assert.ok(m.karte.links >= m.spalte.links - 0.5 && m.karte.rechts <= m.spalte.rechts + 0.5, JSON.stringify(m));
  assert.deepEqual([m.ueberlauf.karte <= 0, m.ueberlauf.spalte <= 0, m.ueberlauf.seite <= 0], [true, true, true]);
  // Eine Zeile: die Mindesthöhe des Links (24 px, WCAG 2.5.8) — zwei Zeilen wären 36 px.
  assert.ok(m.mailBox.h <= 24 && m.telBox.h >= 24 && m.mailBox.h >= 24, `E-Mail in einer Zeile, Ziele 24 px (Höhe ${m.telBox.h} / ${m.mailBox.h})`);
  assert.equal(m.telZeilen, 1);
  assert.doesNotMatch(m.text, /online|verfügbar|erreichbar/i, "keine Aussage über Erreichbarkeit");
  // Die Karte verdrängt die Aktionen darunter nicht: „Abmelden“ bleibt bei 1440 × 900 ohne Scrollen sichtbar.
  const abmelden = await page.locator(".pp-side-actions").getByRole("button", { name: "Abmelden" }).boundingBox();
  assert.ok(abmelden && abmelden.y + abmelden.height <= 900, `Abmelden unten bei ${abmelden && abmelden.y + abmelden.height}`);
  assert.deepEqual(zustand.fehler, []);
  await context.close();
});

test("B — Puls: läuft dauerhaft; Pause und Fortsetzen über den Punkt; die Vorliebe überlebt das Neuladen", async () => {
  const { context, page } = await seite();
  let m = await messen(page);
  assert.deepEqual([m.puls.daten, m.animation.name, m.animation.wdh, m.punktVersteckt], ["an", "ce-ansprech-puls", "infinite", "true"]);
  assert.equal(m.puls.name, "Pulsieren des Punkts anhalten");
  assert.ok(m.pulsBox.w >= 24 && m.pulsBox.h >= 24, "Schalter mindestens 24 × 24 px");
  await page.getByRole("button", { name: "Pulsieren des Punkts anhalten" }).click();
  m = await messen(page);
  assert.deepEqual([m.puls.daten, m.animation.name, m.puls.name], ["aus", "none", "Pulsieren des Punkts fortsetzen"]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".pp-ansprech-puls").waitFor();
  m = await messen(page);
  assert.deepEqual([m.puls.daten, m.animation.name], ["aus", "none"], "Vorliebe dieses Geräts bleibt");
  await page.getByRole("button", { name: "Pulsieren des Punkts fortsetzen" }).click();
  m = await messen(page);
  assert.deepEqual([m.puls.daten, m.animation.name], ["an", "ce-ansprech-puls"]);
  await context.close();
});

test("C — reduzierte Bewegung: der Punkt steht still, es gibt keinen Schalter", async () => {
  const { context, page } = await seite({ kontext: { reducedMotion: "reduce" } });
  const m = await messen(page);
  assert.equal(m.puls, null, "kein Schalter");
  assert.deepEqual([m.animation.name, m.punktVersteckt], ["none", "true"]);
  assert.match(m.text, /Patrick Werner Ihr Ansprechpartner/);
  await context.close();
});

test("D — ohne Zuordnung: Kundenservice ohne Person, ohne Kontaktlinks, ohne Fotoabruf", async () => {
  const { context, page, zustand } = await seite({ am: null });
  const m = await messen(page);
  assert.match(m.klasse, /pp-ansprech--service/);
  assert.equal(m.text, "ConfidaraExpress Kundenservice");
  assert.deepEqual([m.tel, m.mail, m.foto, m.puls], [null, null, null, null]);
  assert.equal(await page.locator(".pp-ansprech a").count(), 0, "kein Link, auch nicht ins Supportpostfach");
  assert.deepEqual(zustand.fotoAbrufe, []);
  await context.close();
});

test("E — Foto nicht ladbar: Initialen der richtigen Person, kein kaputtes Bild", async () => {
  const { context, page, zustand } = await seite({ foto: 404 });
  await page.waitForFunction(() => document.querySelector(".pp-ansprech-initialen"));
  await page.waitForTimeout(300);
  const m = await messen(page);
  assert.deepEqual([m.initialen, m.foto], ["PW", null]);
  assert.equal(zustand.fotoAbrufe.length, 1);
  await context.close();
});

test("F — Tastatur: Schalter, Telefon und E-Mail nacheinander erreichbar, mit sichtbarem Fokus", async () => {
  const { context, page } = await seite();
  await page.locator(".pp-ansprech-puls").focus();
  const reihe = [];
  for (let i = 0; i < 3; i++) {
    reihe.push(await page.evaluate(() => {
      const e = document.activeElement;
      const st = getComputedStyle(e);
      return { klasse: e.className, umriss: st.outlineStyle !== "none" && parseFloat(st.outlineWidth) >= 2 };
    }));
    await page.keyboard.press("Tab");
  }
  assert.deepEqual(reihe.map((r) => r.klasse.split(" ").pop()), ["pp-ansprech-puls", "pp-ansprech-tel", "pp-ansprech-mail"]);
  assert.ok(reihe.every((r) => r.umriss), JSON.stringify(reihe));
  await context.close();
});

test("G — Telefon 390 px mit Touch: Karte im Menü, kein Querüberlauf, Ziele 44 px", async () => {
  const { context, page } = await seite({ viewport: { width: 390, height: 844 }, kontext: { hasTouch: true, isMobile: true, deviceScaleFactor: 3 } });
  await page.getByRole("button", { name: "Menü – Navigation öffnen" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".pp-ansprech")].some((k) => k.getClientRects().length > 0 && k.getBoundingClientRect().width > 0));
  const m = await messen(page);
  assert.deepEqual([m.ueberlauf.karte <= 0, m.ueberlauf.spalte <= 0, m.ueberlauf.seite <= 0], [true, true, true], JSON.stringify(m.ueberlauf));
  assert.ok(m.telBox.h >= 44 && m.mailBox.h >= 44, `Touch-Ziele: ${m.telBox.h} / ${m.mailBox.h}`);
  assert.equal(m.telZeilen, 1);
  const treffer = await page.evaluate(() => { const b = document.querySelector(".pp-ansprech-puls"); const r = b.getBoundingClientRect(); const ab = getComputedStyle(b, "::before"); return { inset: ab.top, w: r.width }; });
  assert.equal(treffer.inset, "-10px", "Trefferfläche des Schalters 44 px");
  await context.close();
});

test("H — 200 % Zoom und 24 px Browserschrift: kein Überlauf, Telefonnummer ungebrochen", async () => {
  // 200 % auf einem 1440er Fenster = 720 CSS-Pixel: Seitenleiste als Menü.
  let { context, page } = await seite({ viewport: { width: 720, height: 450 }, kontext: { deviceScaleFactor: 2 } });
  await page.getByRole("button", { name: "Menü – Navigation öffnen" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".pp-ansprech")].some((k) => k.getClientRects().length > 0 && k.getBoundingClientRect().width > 0));
  let m = await messen(page);
  assert.deepEqual([m.ueberlauf.karte <= 0, m.ueberlauf.spalte <= 0, m.telZeilen], [true, true, 1], JSON.stringify(m));
  await context.close();
  ({ context, page } = await seite());
  await page.addStyleTag({ content: "html { font-size: 24px !important; }" });
  await page.waitForTimeout(100);
  m = await messen(page);
  assert.deepEqual([m.ueberlauf.karte <= 0, m.ueberlauf.spalte <= 0, m.ueberlauf.seite <= 0, m.telZeilen], [true, true, true, 1], JSON.stringify(m));
  assert.ok(m.karte.rechts <= m.spalte.rechts + 0.5);
  await context.close();
});

test("I — lange E-Mail-Adresse: Umbruch vor dem „@“, kein Überlauf", async () => {
  const lang = { ...PATRICK, email: "patrick.werner.kundenbetreuung@confidaraexpress.de" };
  const { context, page } = await seite({ am: lang });
  const m = await messen(page);
  assert.ok(m.ueberlauf.karte <= 0 && m.ueberlauf.spalte <= 0, JSON.stringify(m.ueberlauf));
  const zeilen = await page.evaluate(() => {
    const a = document.querySelector(".pp-ansprech-mail");
    const r = document.createRange();
    const ergebnis = [];
    for (const knoten of a.childNodes) {
      if (knoten.nodeType !== Node.TEXT_NODE) continue;
      r.selectNodeContents(knoten);
      ergebnis.push({ text: knoten.textContent, zeilen: r.getClientRects().length, oben: r.getBoundingClientRect().top });
    }
    return ergebnis;
  });
  const [lokal, domain] = zeilen;
  assert.deepEqual([lokal.text, domain.text], ["patrick.werner.kundenbetreuung", "@confidaraexpress.de"]);
  assert.ok(domain.oben > lokal.oben, "die Domain steht in der nächsten Zeile");
  assert.equal(domain.zeilen, 1, "die Domain bricht nicht");
  await context.close();
});

test("J — Adminwechsel: nach dem nächsten Abruf von /kundenbereich die neue Person mit eigenem Foto", async () => {
  const { context, page, zustand } = await seite({ am: MIGUEL });
  // Bis das Foto da ist, stehen die Initialen dieser Person („MV“) im Bild — gewollt, deshalb ohne Anker am Anfang.
  assert.match((await messen(page)).text, /Miguel Vance Ihr Ansprechpartner Anrufen: 0160 92717124/);
  zustand.am = PATRICK;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector(".pp-ansprech")?.innerText.includes("Patrick Werner"));
  const m = await messen(page);
  assert.deepEqual([m.tel, m.mail], ["tel:+491754167701", "mailto:p.werner@confidaraexpress.de"]);
  assert.doesNotMatch(m.text, /Miguel/);
  await context.close();
});

test("K — öffentliche Demo: Kundenservice, keine Person, kein Fotoabruf", async () => {
  const { context, page, zustand } = await seite({ ziel: "/demo/dashboard", am: PATRICK });
  const m = await messen(page);
  assert.match(m.klasse, /pp-ansprech--service/);
  assert.equal(m.text, "ConfidaraExpress Kundenservice");
  assert.deepEqual(zustand.fotoAbrufe, [], "die Demo erreicht den Server nie");
  await context.close();
});
