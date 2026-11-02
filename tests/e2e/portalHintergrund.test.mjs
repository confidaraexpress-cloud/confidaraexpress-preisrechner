// E2E: Portal-Hintergrundsystem (Betreiberauftrag 2026-11-02) — echter Dev-Server.
//
// Zwei Stufen derselben Markenfläche: die Übersicht trägt die kräftige Fassung („Signature Overview“), jede übrige Seite des
// Kundenbereichs die leise Arbeitsfläche („Premium Workspace“). Geprüft wird, was eine Quelltextprüfung nicht erreicht:
// welche Fläche der Browser auf jeder Kundenseite tatsächlich malt (beide Kunden-Shells, Desktop und Telefon), dass ein
// Seitenwechsel ohne Neuladen nie einen falschen oder doppelten Hintergrund stehen lässt, dass Anmeldung, öffentliche
// Seiten, Admin und Partnerportal keine der beiden Flächen bekommen, dass alle vier Kennzahlen der Übersicht exakt
// dieselbe Zahlenfarbe tragen — auch „Verzögert“, bei 0, über 0 und ohne Wert —, und dass die Übersicht seit dem Abschluss
// (Betreiberentscheidung 2026-11-02) kein dekoratives CE-Monogramm mehr trägt, das offizielle Logo aber unverändert steht.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PORT = 5714, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

// Alle Kundenseiten der Demo (dieselben Komponenten und Shells wie der echte Kundenbereich, demo/DemoApp.jsx).
const ARBEITSSEITEN = {
  "Neue Sendung": "/demo/dashboard?page=new",
  Versandkostenrechner: "/demo/calculator",
  Sendungen: "/demo/dashboard?page=shipments",
  Entwürfe: "/demo/dashboard?page=drafts",
  Sendungsverfolgung: "/demo/dashboard?page=tracking",
  Adressbuch: "/demo/dashboard?page=addressbook",
  Rechnungen: "/demo/dashboard?page=invoices",
  Lagerübersicht: "/demo/dashboard?page=inventory",
  Artikel: "/demo/dashboard?page=products",
  Artikeldetail: "/demo/inventory/products/101",
  Bestand: "/demo/dashboard?page=stock",
  Aufträge: "/demo/dashboard?page=orders",
  Auftragsdetail: "/demo/inventory/orders/501",
  Lieferscheine: "/demo/dashboard?page=deliverynotes",
  Bewegungen: "/demo/dashboard?page=movements",
  Kontoeinstellungen: "/demo/dashboard?page=profile",
  Supportanfragen: "/demo/dashboard?page=support",
};
// Die Übersicht ausdrücklich: Ein erneutes Öffnen derselben Adresse behält in Chromium den Verlaufszustand, und
// DashboardPage öffnet dann den zuletzt gezeigten Bereich.
const UEBERSICHT = "/demo/dashboard?page=overview";

let server, browser;

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

// Die gemalte Fläche: Bereich, Zahl der Inhaltsflächen, Grund und Bilder von .main-content, dazu die beiden Sollfarben aus
// den Tokens (in rgb umgerechnet) — der Test hängt an den Tokens, nicht an abgeschriebenen Werten.
async function flaeche(page) {
  return page.evaluate(() => {
    const rgb = (hex) => { const n = parseInt(hex.trim().slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
    const root = getComputedStyle(document.documentElement);
    const main = document.querySelectorAll(".main-content");
    const cs = main.length ? getComputedStyle(main[0]) : null;
    return {
      bereich: document.documentElement.getAttribute("data-ce-bereich"),
      inhaltsflaechen: main.length,
      uebersicht: !!document.querySelector(".ov-page"),
      grund: cs ? cs.backgroundColor : null,
      verlaeufe: cs ? (cs.backgroundImage.match(/(radial|linear)-gradient\(/g) || []).length : 0,
      bild: cs ? /url\(/.test(cs.backgroundImage) : false,
      body: getComputedStyle(document.body).backgroundColor,
      sollArbeit: root.getPropertyValue("--ce-pr-ed-raum-flaeche") ? rgb(root.getPropertyValue("--ce-pr-ed-raum-flaeche")) : null,
      sollSignatur: root.getPropertyValue("--ce-pr-ed-flaeche-uebersicht") ? rgb(root.getPropertyValue("--ce-pr-ed-flaeche-uebersicht")) : null,
      ueberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

async function bereit(page, selektor = ".main-content") {
  await page.waitForSelector(selektor, { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".loading-center"), null, { timeout: 30000 });
}

function istSignatur(f, wo) {
  assert.equal(f.bereich, "kunde", `${wo}: nicht im Kundenbereich`);
  assert.equal(f.inhaltsflaechen, 1, `${wo}: ${f.inhaltsflaechen} Inhaltsflächen`);
  assert.ok(f.uebersicht, `${wo}: keine Übersicht`);
  assert.equal(f.grund, f.sollSignatur, `${wo}: Grund ${f.grund} statt der Übersichtsfläche ${f.sollSignatur}`);
  assert.ok(f.verlaeufe >= 8, `${wo}: nur ${f.verlaeufe} Lichtflächen — die Signature-Fassung fehlt`);
}
function istArbeitsflaeche(f, wo) {
  assert.equal(f.bereich, "kunde", `${wo}: nicht im Kundenbereich`);
  assert.equal(f.inhaltsflaechen, 1, `${wo}: ${f.inhaltsflaechen} Inhaltsflächen`);
  assert.ok(!f.uebersicht, `${wo}: zeigt die Übersicht`);
  assert.ok(f.sollArbeit && f.sollArbeit !== f.sollSignatur, "die Tokens der Arbeitsfläche fehlen");
  assert.equal(f.grund, f.sollArbeit, `${wo}: Grund ${f.grund} statt der Arbeitsfläche ${f.sollArbeit}`);
  assert.equal(f.verlaeufe, 4, `${wo}: ${f.verlaeufe} statt vier Lichtflächen`);
  assert.equal(f.bild, false, `${wo}: eine Zeichnung (CE) auf der Arbeitsfläche`);
}

test("A — Desktop: die Übersicht trägt die Signature-Fläche, jede übrige Kundenseite die Arbeitsfläche", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE", timezoneId: "Europe/Berlin" });
  try {
    await page.goto(`${BASE}${UEBERSICHT}`, { waitUntil: "domcontentloaded" });
    await bereit(page, ".ov-kpis");
    const start = await flaeche(page);
    istSignatur(start, "Übersicht");
    assert.equal(start.body, "rgb(255, 255, 255)", "das Dokument ist nicht mehr weiß");
    for (const [name, ziel] of Object.entries(ARBEITSSEITEN)) {
      await page.goto(`${BASE}${ziel}`, { waitUntil: "domcontentloaded" });
      await bereit(page);
      const f = await flaeche(page);
      istArbeitsflaeche(f, name);
      assert.equal(f.body, "rgb(255, 255, 255)", `${name}: das Dokument ist nicht mehr weiß`);
      assert.equal(f.ueberlauf, 0, `${name}: waagrechter Überlauf`);
    }
  } finally { await page.close(); }
});

test("B — Telefon (390 px): dieselbe Zuordnung in der schmalen Fassung", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "de-DE" });
  try {
    await page.goto(`${BASE}${UEBERSICHT}`, { waitUntil: "domcontentloaded" });
    await bereit(page, ".ov-kpis");
    istSignatur(await flaeche(page), "Übersicht 390");
    for (const name of ["Neue Sendung", "Rechnungen", "Artikel", "Auftragsdetail", "Kontoeinstellungen"]) {
      await page.goto(`${BASE}${ARBEITSSEITEN[name]}`, { waitUntil: "domcontentloaded" });
      await bereit(page);
      const f = await flaeche(page);
      istArbeitsflaeche(f, `${name} 390`);
      assert.equal(f.ueberlauf, 0, `${name} 390: waagrechter Überlauf`);
    }
  } finally { await page.close(); }
});

test("C — Seitenwechsel ohne Neuladen: der Hintergrund folgt jeder Seite, nie doppelt, nie zurückgeblieben", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  const seitenleiste = (text) => page.locator("#ce-kundennavigation a, #ce-kundennavigation button")
    .filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) }).first();
  try {
    await page.goto(`${BASE}${UEBERSICHT}`, { waitUntil: "domcontentloaded" });
    await bereit(page, ".ov-kpis");
    istSignatur(await flaeche(page), "Start");
    // page-State innerhalb von DashboardPage
    await seitenleiste("Rechnungen").click();
    await page.waitForFunction(() => !document.querySelector(".ov-page") && document.querySelector(".ce-page-header-title")?.textContent.includes("Rechnungen"));
    istArbeitsflaeche(await flaeche(page), "Übersicht → Rechnungen");
    await seitenleiste("Übersicht").click();
    await page.waitForSelector(".ov-kpis");
    istSignatur(await flaeche(page), "Rechnungen → Übersicht");
    await seitenleiste("Adressbuch").click();
    await page.waitForFunction(() => !document.querySelector(".ov-page"));
    istArbeitsflaeche(await flaeche(page), "Übersicht → Adressbuch");
    // Wechsel der Shell: eine echte Route in DashboardLayout und zurück über den Verlauf
    await page.goto(`${BASE}${UEBERSICHT}`, { waitUntil: "domcontentloaded" });
    await bereit(page, ".ov-kpis");
    await page.evaluate(() => { window.history.pushState({}, "", "/demo/calculator"); window.dispatchEvent(new PopStateEvent("popstate")); });
    await page.waitForFunction(() => location.pathname.endsWith("/calculator") && !document.querySelector(".ov-page"));
    await bereit(page);
    istArbeitsflaeche(await flaeche(page), "Übersicht → Versandkostenrechner (Route)");
    await page.goBack();
    await page.waitForSelector(".ov-kpis");
    istSignatur(await flaeche(page), "Versandkostenrechner → zurück zur Übersicht");
  } finally { await page.close(); }
});

// Kundenkonto ohne Demo: die Kennzahlen kommen als serverseitiges Aggregat mit der Sendungsliste (utils/kpis.mjs).
const USER = { id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann", role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030" };
async function konto(page, { verzoegert, fehler = false }) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) {
      if (fehler) return json({ error: "Fehler" }, 500);
      return json({ shipments: [], stats: { total: 6, active: 4, in_transit: 2, delivered_this_month: 5, delayed: verzoegert, new_24h: 1 } });
    }
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "2026-11-02T10:00:00Z" });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.endsWith("/kunde/carriers")) return json({ carriers: [] });
    if (p.includes("/api/kunde/")) return json({ items: [], drafts: [], nextCursor: null, pagination: { total: 0 } });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}
async function kennzahlen(page) {
  return page.evaluate(() => {
    const navy = getComputedStyle(document.documentElement).getPropertyValue("--ce-pr-ed-kennzahl-zahl").trim();
    return {
      navy,
      werte: [...document.querySelectorAll(".ov-kpi")].map((k) => ({
        art: [...k.classList].find((c) => c.startsWith("ov-kpi--")),
        text: k.querySelector(".ov-kpi-value").textContent.trim(),
        farbe: getComputedStyle(k.querySelector(".ov-kpi-value")).color,
      })),
    };
  });
}
function gleicheFarbe({ werte }, wo) {
  assert.equal(werte.length, 4, `${wo}: nicht vier Kennzahlen`);
  assert.deepEqual(werte.map((w) => w.art), ["ov-kpi--active", "ov-kpi--transit", "ov-kpi--delivered", "ov-kpi--delayed"]);
  // Exakt dieselbe Farbe für alle vier, und es ist das dunkle Navy der Zahlen (#011b55), kein Bernstein.
  assert.deepEqual(new Set(werte.map((w) => w.farbe)).size, 1, `${wo}: verschiedene Zahlenfarben ${werte.map((w) => w.farbe).join(" / ")}`);
  assert.equal(werte[3].farbe, "rgb(1, 27, 85)", `${wo}: „Verzögert“ in ${werte[3].farbe}`);
}

test("D — Kennzahlen: alle vier Zahlen exakt in derselben dunklen Navy-Farbe, „Verzögert“ bei 0, über 0 und ohne Wert", async () => {
  const demo = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  try {
    await demo.goto(`${BASE}${UEBERSICHT}`, { waitUntil: "domcontentloaded" });
    await bereit(demo, ".ov-kpis");
    const k = await kennzahlen(demo);
    assert.notEqual(k.werte[3].text, "0", "die Demo zeigt keine Verzögerung über 0");
    gleicheFarbe(k, `Demo (Verzögert ${k.werte[3].text})`);
  } finally { await demo.close(); }
  for (const [verzoegert, fehler] of [[0, false], [3, false], [0, true]]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
    try {
      await konto(page, { verzoegert, fehler });
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".ov-kpis", { timeout: 30000 });
      const soll = fehler ? "—" : String(verzoegert);
      await page.waitForFunction((s) => document.querySelector(".ov-kpi--delayed .ov-kpi-value")?.textContent.trim() === s, soll, { timeout: 30000 });
      const k = await kennzahlen(page);
      gleicheFarbe(k, fehler ? "Konto nach Ladefehler („—“)" : `Konto (Verzögert ${verzoegert})`);
      // Auch der echte Kundenbereich (App.jsx, nicht die Demo) trägt die Signature-Fläche.
      istSignatur(await flaeche(page), "Übersicht des Kundenkontos");
    } finally { await page.close(); }
  }
});

test("E — Anmeldung, öffentliche Seiten, Admin und Partnerportal bekommen keine der beiden Flächen", async () => {
  const ohneFlaeche = async (page, wo) => {
    const befund = await page.evaluate(() => {
      const rgb = (hex) => { const n = parseInt(hex.trim().slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
      const root = getComputedStyle(document.documentElement);
      // Die Sollfarben stehen nur im Bereichs-Scope; außerhalb davon die bekannten Werte (Gegenprobe gegen die Tokens im Test C).
      const arbeit = root.getPropertyValue("--ce-pr-ed-raum-flaeche") ? rgb(root.getPropertyValue("--ce-pr-ed-raum-flaeche")) : "rgb(240, 244, 252)";
      const signatur = root.getPropertyValue("--ce-pr-ed-flaeche-uebersicht") ? rgb(root.getPropertyValue("--ce-pr-ed-flaeche-uebersicht")) : "rgb(233, 240, 251)";
      const treffer = [...document.querySelectorAll("body, body *")].filter((e) => [arbeit, signatur].includes(getComputedStyle(e).backgroundColor))
        .map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")}`);
      return { bereich: document.documentElement.getAttribute("data-ce-bereich"), treffer, ov: !!document.querySelector(".ov-page") };
    });
    assert.notEqual(befund.bereich, "kunde", `${wo}: trägt den Kundenbereich`);
    assert.deepEqual(befund.treffer, [], `${wo}: Fläche des Kundenbereichs auf ${befund.treffer.join(", ")}`);
    assert.equal(befund.ov, false);
  };
  const oeffentlich = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  try {
    for (const [wo, ziel, sel] of [["Anmeldung", "/login", "form"], ["Registrierung", "/register", "form"], ["Sendungsverfolgung (öffentlich)", "/tracking", "h1"], ["Partnerregistrierung", "/partner-registrieren", "h1"]]) {
      await oeffentlich.goto(`${BASE}${ziel}`, { waitUntil: "domcontentloaded" });
      await oeffentlich.waitForSelector(sel, { timeout: 30000 });
      await oeffentlich.waitForTimeout(300);
      await ohneFlaeche(oeffentlich, wo);
    }
    // Die Demo verlassen: „Abmelden“ beendet sie — der Bereich und seine Fläche gehen mit.
    await oeffentlich.goto(`${BASE}${ARBEITSSEITEN.Rechnungen}`, { waitUntil: "domcontentloaded" });
    await bereit(oeffentlich);
    istArbeitsflaeche(await flaeche(oeffentlich), "Demo vor dem Abmelden");
    await oeffentlich.locator("#ce-kundennavigation button, #ce-kundennavigation a").filter({ hasText: /^\s*Abmelden\s*$/ }).first().click();
    await oeffentlich.waitForSelector(".demo-ende", { timeout: 30000 });
    await ohneFlaeche(oeffentlich, "Ende der Demo");
  } finally { await oeffentlich.close(); }

  for (const [wo, rolle, ziel, warte] of [["Admin", "admin", "/admin", "main.adm-main"], ["Partnerportal", "sales_partner", "/partner", ".spp-tabs"]]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
    try {
      await page.route("**/api.confidaraexpress.de/**", (route) => {
        const p = new URL(route.request().url()).pathname;
        const body = p.endsWith("/kundenbereich") ? { user: { ...USER, role: rolle } } : {};
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      });
      await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
      await page.goto(`${BASE}${ziel}`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(new RegExp(`${ziel}$`), { timeout: 30000 });
      await page.waitForSelector(warte, { timeout: 30000 });
      await page.waitForTimeout(500);
      await ohneFlaeche(page, wo);
    } finally { await page.close(); }
  }
});

test("F — Übersicht ohne dekorative CE-Monogramme (Kopf, Bühne, Marke); das offizielle Logo steht unverändert", async () => {
  // Jede Zeichnung, die das CSS der Übersicht malen könnte: Hintergrund, Maske, Rahmenbild und Inhalt jedes Elements im
  // Inhaltsbereich samt ::before/::after. Die Carrier-Logos sind <img> (Daten), keine Dekoration, und zählen hier nicht.
  const zeichnungen = (page) => page.evaluate(() => {
    const treffer = [];
    for (const e of document.querySelectorAll(".main-content, .main-content *")) {
      for (const pseudo of [null, "::before", "::after"]) {
        const cs = getComputedStyle(e, pseudo);
        const werte = [cs.backgroundImage, cs.maskImage || "", cs.borderImageSource, pseudo ? cs.content : ""].join(" ");
        if (/url\(/.test(werte)) treffer.push(`${e.tagName.toLowerCase()}.${[...e.classList].join(".")}${pseudo || ""}`);
      }
    }
    const kopf = document.querySelector(".ce-page-header-main");
    const buehne = document.querySelector(".ov-carrier-zeile");
    return {
      treffer,
      kopfVor: kopf ? getComputedStyle(kopf, "::before").content : null,
      buehneVor: buehne ? getComputedStyle(buehne, "::before").content : null,
      buehne: !!buehne,
    };
  });
  // Das offizielle Logo (BrandLogo, assets/brand): Lockup in der Seitenleiste, auf dem Telefon das Signet der Mobilleiste.
  // Vite liefert kleine SVGs als Daten-URI aus, größere als Datei: geprüft wird deshalb, dass das Bild genau die
  // Pfadgeometrie der offiziellen Datei trägt (dieselben Subpaths), nicht nur einen Dateinamen.
  const logo = (page, selektor) => page.evaluate(async (sel) => {
    const img = document.querySelector(sel);
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const src = img.getAttribute("src");
    const svg = src.startsWith("data:") ? decodeURIComponent(src.replace(/^data:image\/svg\+xml(;utf8)?,/, "")) : await (await fetch(src)).text();
    return { alt: img.alt, svg, geladen: img.complete && img.naturalWidth > 0, breite: r.width, hoehe: r.height,
      sichtbar: getComputedStyle(img).visibility !== "hidden" && r.width > 0 && r.height > 0 };
  }, selektor);
  const pfade = (svg) => [...svg.matchAll(/\sd=["']([^"']+)["']/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  const offiziell = (datei) => pfade(readFileSync(new URL(`../../src/assets/brand/${datei}`, import.meta.url), "utf8"));
  for (const [breite, hoehe, mobil] of [[1920, 1080], [1440, 900], [1366, 768], [1024, 768], [390, 844, true]]) {
    const page = await browser.newPage({ viewport: { width: breite, height: hoehe }, locale: "de-DE",
      ...(mobil ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
    try {
      await page.goto(`${BASE}${UEBERSICHT}`, { waitUntil: "domcontentloaded" });
      await bereit(page, ".ov-kpis");
      await page.waitForSelector(".ov-carrier-zeile", { timeout: 30000 });
      const z = await zeichnungen(page);
      assert.ok(z.buehne, `${breite} px: die Navy-Bühne fehlt`);
      assert.deepEqual(z.treffer, [], `${breite} px: eine Zeichnung auf der Übersicht (${z.treffer.join(", ")})`);
      assert.equal(z.kopfVor, "none", `${breite} px: der Seitenkopf trägt eine Ebene`);
      assert.equal(z.buehneVor, "none", `${breite} px: die Navy-Bühne trägt eine Ebene`);
      istSignatur(await flaeche(page), `Übersicht ${breite} px`);
      const marke = await logo(page, mobil ? ".topbar-brand img.ce-brandmark-img" : ".pp-logo img.ce-brandmark-img");
      assert.ok(marke, `${breite} px: das offizielle Logo fehlt`);
      assert.equal(marke.alt, "ConfidaraExpress", `${breite} px: das Logo trägt nicht den Markennamen`);
      const soll = offiziell(mobil ? "signet-standard.svg" : "lockup-reverse.svg");
      assert.ok(soll.length > 0, "die offizielle Logodatei hat keine Pfade");
      assert.deepEqual(pfade(marke.svg), soll, `${breite} px: ein anderes Logo als das offizielle`);
      assert.ok(marke.geladen && marke.sichtbar, `${breite} px: das Logo ist nicht geladen oder nicht sichtbar (${JSON.stringify(marke)})`);
    } finally { await page.close(); }
  }
});
