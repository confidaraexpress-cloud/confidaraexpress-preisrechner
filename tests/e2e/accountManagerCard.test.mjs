// E2E: Persönlicher ConfidaraExpress-Ansprechpartner als schwebende Karte unten rechts (Betreiberentscheidungen
// 2026-10-30, Canonical 1A, v2.90/v2.91 G3–G5). Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — keine echte
// Person wird geladen.
//
//   A  Großer Desktop (1920/1536/1440/1280 × 800): genau ein Dock, fest unten rechts, 24rem, Foto 80 px, E-Mail in
//      einer Zeile, Beschriftung, Links, Foto authentifiziert; nichts in der Seitenleiste. Kleiner Desktop (1366 × 768,
//      1280 × 720): kompakt zuerst, „Abmelden“ bei 1366 × 768 ohne Scrollen
//   B  Scrollen und Seitenwechsel: dieselbe Position, auf jeder Shell genau eine Karte
//   C  Puls: dauerhaft, Pause und Fortsetzen, Vorliebe überlebt das Neuladen; nur in der offenen Karte
//   D  reduzierte Bewegung: kein Puls, kein Schalter, keine Öffnungsbewegung
//   E  Einklappen (G3): Foto 56 px, Fokus folgt, Vorliebe je Gerät, Öffnen über das Foto
//   F  ohne Zuordnung (G4): Kundenservice im selben Dock, ohne Person, Links und Fotoabruf
//   G  Foto nicht ladbar: Initialen der richtigen Person in Karte und Foto
//   H  Tastatur: Punkt, Einklappen, Telefon, E-Mail — nach dem Seiteninhalt, mit sichtbarem Fokus
//   I  Telefon 390 und 360 px (Touch): kompakt, Öffnen über dem Foto (ohne zweites Foto, E-Mail in einer Zeile),
//      Escape und Klick daneben schließen, 44 px
//   J  200 % Zoom und 24 px Browserschrift: kompakt, geöffnet vollständig im Fenster, kein Querüberlauf
//   K  lange E-Mail-Adresse: Umbruch vor dem „@“
//   L  Nicht verdeckt: letzte Tabellenzeile und Kartenaktionen erreichbar, Tastaturfokus landet über der Karte
//   M  Ebenen: Dialog und Schublade liegen über der Karte
//   N  Adminwechsel und öffentliche Demo (über der Demo-Leiste, keine Person, kein Fotoabruf)
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
const ARTIKEL = Array.from({ length: 30 }, (_, i) => ({
  id: String(100 + i), sku: `VT-${String(i + 1).padStart(3, "0")}`, name: `Ventilsatz Edelstahl Größe ${i + 1}`,
  weightKg: 1.25, status: "active", minStock: null,
  stock: { onHand: 10, reserved: 0, blocked: 0, available: 10 }, createdAt: "2026-10-30T08:00:00Z",
}));

let server, browser;

async function seite({ am = PATRICK, foto = 200, viewport = { width: 1440, height: 900 }, kontext = {}, ziel = "/dashboard", schrift = null, vorher = null } = {}) {
  const context = await browser.newContext({ viewport, ...kontext });
  const page = await context.newPage();
  const zustand = { am, fotoAbrufe: [], fehler: [] };
  page.on("pageerror", (e) => zustand.fehler.push(String(e)));
  if (schrift) {
    // Browsereinstellung „Schriftgröße“ (nicht html { font-size }): nur sie verändert em in Medienabfragen.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: schrift, fixed: Math.round(schrift * 0.8125) } });
  }
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
    if (pfad.endsWith("/api/kunde/products")) return json({ products: ARTIKEL, nextCursor: null });
    const detail = pfad.match(/\/api\/kunde\/products\/(\d+)$/);
    if (detail) return json({ product: ARTIKEL.find((a) => a.id === detail[1]) || ARTIKEL[0], balances: [], movements: [], blocks: [] });
    if (pfad.includes("/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    return json({ items: [], users: [], shipments: [], invoices: [], drafts: [], addresses: [], warehouses: [], summary: null, nextCursor: null, pagination: { total: 0 } });
  });
  await page.addInitScript((v) => {
    localStorage.setItem("ce_token", "e2e-token");
    if (v) for (const [k, w] of Object.entries(v)) localStorage.setItem(k, w);
  }, vorher);
  await page.goto(`${BASE}${ziel}`, { waitUntil: "domcontentloaded" });
  await page.locator(".pp-ansprech-dock").waitFor({ state: "attached", timeout: 30000 });
  return { context, page, zustand };
}

// Zustand des Docks: Form, sichtbare Teile, Maße relativ zum Fenster.
async function dock(page) {
  return page.evaluate(() => {
    const docks = document.querySelectorAll(".pp-ansprech-dock");
    const d = docks[0];
    const karte = d.querySelector(".pp-ansprech");
    const foto = d.querySelector(".pp-ansprech-foto-knopf");
    const sichtbar = (e) => Boolean(e) && e.getClientRects().length > 0;
    const rect = (e) => { if (!sichtbar(e)) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const bild = karte.querySelector(".pp-ansprech-bild--karte");
    const punkt = karte.querySelector(".pp-ansprech-punkt");
    const puls = karte.querySelector(".pp-ansprech-puls");
    return {
      anzahl: docks.length,
      inSeitenleiste: Boolean(document.querySelector(".pp-side-scroll .pp-ansprech, .sidebar .pp-ansprech-dock")),
      form: d.getAttribute("data-form"), offen: d.getAttribute("data-offen"), bereich: d.getAttribute("aria-label"),
      position: getComputedStyle(d).position, ebene: getComputedStyle(d).zIndex,
      dock: rect(d), karte: rect(karte), foto: rect(foto), bild: rect(bild),
      fenster: { w: document.documentElement.clientWidth, h: window.innerHeight },
      text: sichtbar(karte) ? karte.innerText.replace(/\s+/g, " ").trim() : null,
      klasse: karte.className,
      tel: karte.querySelector(".pp-ansprech-tel")?.getAttribute("href") ?? null,
      mail: karte.querySelector(".pp-ansprech-mail")?.getAttribute("href") ?? null,
      img: (() => { const i = karte.querySelector("img.pp-ansprech-foto"); return i ? { blob: (i.getAttribute("src") || "").startsWith("blob:"), geladen: i.complete && i.naturalWidth > 0, alt: i.getAttribute("alt") } : null; })(),
      initialen: [...d.querySelectorAll(".pp-ansprech-initialen")].map((e) => e.textContent),
      puls: puls ? { daten: puls.getAttribute("data-puls"), name: puls.getAttribute("aria-label") } : null,
      punktImFoto: Boolean(foto && foto.querySelector(".pp-ansprech-punkt")),
      animation: punkt ? (() => { const st = getComputedStyle(punkt, "::after"); return { name: st.animationName, wdh: st.animationIterationCount }; })() : null,
      fotoKnopf: foto ? { expanded: foto.getAttribute("aria-expanded"), name: foto.textContent.trim(), ariaLabel: foto.getAttribute("aria-label") } : null,
      ueberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hoeheVar: getComputedStyle(document.documentElement).getPropertyValue("--ce-ansprech-hoehe").trim(),
    };
  });
}

// html trägt scroll-behavior: smooth — Tests scrollen sofort und warten, bis die Position ruht.
async function scrolle(page, wohin) {
  await page.evaluate((y) => window.scrollTo({ top: y === "ende" ? document.documentElement.scrollHeight : y, behavior: "instant" }), wohin);
  await ruhig(page);
}
async function ruhig(page) {
  let vorher = -1;
  for (let i = 0; i < 40; i++) {
    const jetzt = await page.evaluate(() => window.scrollY);
    if (jetzt === vorher) return jetzt;
    vorher = jetzt;
    await page.waitForTimeout(60);
  }
  return vorher;
}

// Oberkante des lokalen Teils und der Domain der E-Mail-Adresse (gleich = eine Zeile), nach dem Laden der Schrift.
async function mailZeilen(page) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const r = document.createRange();
    return [...document.querySelector(".pp-ansprech-mail > span").childNodes]
      .filter((k) => k.nodeType === Node.TEXT_NODE)
      .map((k) => { r.selectNodeContents(k); return Math.round(r.getBoundingClientRect().top); });
  });
}

// Liegt an der Mitte des Elements wirklich dieses Element (oder ein Kind) oben — nicht die Karte?
async function frei(locator) {
  return locator.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { frei: Boolean(oben) && (oben === e || e.contains(oben)), imDock: Boolean(oben && oben.closest(".pp-ansprech-dock")), unten: r.bottom, h: window.innerHeight };
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

test("A — großer Desktop voll, kleiner Desktop kompakt: genau ein Dock fest unten rechts, Foto 80 px, Links", async () => {
  for (const [w, h] of [[1920, 1080], [1536, 864], [1440, 900], [1280, 800]]) {
    const { context, page, zustand } = await seite({ viewport: { width: w, height: h } });
    await page.waitForFunction(() => { const i = document.querySelector(".pp-ansprech-bild--karte img.pp-ansprech-foto"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 });
    const m = await dock(page);
    assert.deepEqual([m.anzahl, m.inSeitenleiste, m.form, m.offen, m.position], [1, false, "voll", "ja", "fixed"], `${w}×${h}`);
    assert.equal(m.ebene, "10", "Ebene --ce-z-raised");
    assert.ok(Math.abs(m.fenster.w - m.dock.r - 24) <= 1 && Math.abs(m.fenster.h - m.dock.b - 24) <= 1, `${w}×${h} Abstand ${JSON.stringify(m.dock)}`);
    assert.ok(Math.abs(m.karte.w - 384) <= 1, `Breite ${m.karte.w}`);
    assert.deepEqual([Math.round(m.bild.w), Math.round(m.bild.h)], [80, 80]);
    const [lokal, domain] = await mailZeilen(page);
    assert.equal(domain, lokal, `${w}×${h}: die E-Mail-Adresse steht neben dem Foto in einer Zeile`);
    assert.equal(m.foto, null, "kein zweites Foto neben der offenen Karte");
    assert.equal(m.text, "Ihr persönlicher Ansprechpartner Patrick Werner Anrufen: 0175 4167701 E-Mail an p.werner@confidaraexpress.de");
    assert.deepEqual([m.tel, m.mail], ["tel:+491754167701", "mailto:p.werner@confidaraexpress.de"]);
    assert.deepEqual([m.img.blob, m.img.geladen, m.img.alt], [true, true, ""]);
    assert.deepEqual(zustand.fotoAbrufe, ["Bearer e2e-token"], "genau ein Abruf mit Anmeldung");
    assert.equal(m.bereich, "Ihr persönlicher Ansprechpartner");
    assert.ok(m.ueberlauf <= 0);
    assert.equal(m.hoeheVar, `${Math.ceil(m.dock.h)}px`, "belegte Höhe am Wurzelelement");
    assert.doesNotMatch(m.text, /online|verfügbar|erreichbar/i, "keine Aussage über Erreichbarkeit");
    assert.deepEqual(zustand.fehler, []);
    await context.close();
  }
  // Kleiner Desktop: die offene Karte deckte ein Viertel der Fensterhöhe ab — zuerst steht das runde Foto.
  for (const [w, h] of [[1366, 768], [1280, 720]]) {
    const { context, page, zustand } = await seite({ viewport: { width: w, height: h } });
    const m = await dock(page);
    assert.deepEqual([m.anzahl, m.inSeitenleiste, m.form, m.offen, m.karte, Math.round(m.foto.w)], [1, false, "kompakt", "nein", null, 56], `${w}×${h}`);
    assert.ok(Math.abs(m.fenster.w - m.foto.r - 16) <= 1 && Math.abs(m.fenster.h - m.foto.b - 16) <= 1, `${w}×${h} Abstand ${JSON.stringify(m.foto)}`);
    if (w === 1366) {
      const abmelden = await page.locator(".pp-side-actions").getByRole("button", { name: "Abmelden" }).boundingBox();
      assert.ok(abmelden && abmelden.y + abmelden.height <= h, `Abmelden ohne Scrollen sichtbar (${abmelden && abmelden.y + abmelden.height})`);
    }
    assert.deepEqual(zustand.fehler, []);
    await context.close();
  }
});

test("B — Scrollen und Seitenwechsel: dieselbe Position, auf jeder Shell genau eine Karte", async () => {
  const { context, page } = await seite({ ziel: "/dashboard?page=products" });
  await page.locator(".inv-list-table--artikel, .inv-list-cards--artikel").first().waitFor({ state: "attached" });
  const vorher = (await dock(page)).dock;
  await scrolle(page, "ende");
  assert.ok(await page.evaluate(() => window.scrollY) > 200, "die Seite ist gescrollt");
  const nachher = await dock(page);
  assert.ok(nachher.dock && Math.abs(nachher.dock.t - vorher.t) < 1 && Math.abs(nachher.dock.l - vorher.l) < 1, "fest beim Scrollen");
  for (const ziel of ["/calculator", "/inventory/products/101", "/dashboard"]) {
    await page.goto(`${BASE}${ziel}`, { waitUntil: "domcontentloaded" });
    await page.locator(".pp-ansprech-dock").waitFor({ state: "attached", timeout: 30000 });
    await page.waitForTimeout(150);
    const m = await dock(page);
    assert.deepEqual([m.anzahl, m.offen, m.inSeitenleiste], [1, "ja", false], ziel);
  }
  await context.close();
});

test("C — Puls: dauerhaft, Pause und Fortsetzen, Vorliebe überlebt das Neuladen; nur in der offenen Karte", async () => {
  const { context, page } = await seite();
  let m = await dock(page);
  assert.deepEqual([m.puls.daten, m.animation.name, m.animation.wdh], ["an", "ce-ansprech-puls", "infinite"]);
  await page.getByRole("button", { name: "Pulsieren des Punkts anhalten" }).click();
  m = await dock(page);
  assert.deepEqual([m.puls.daten, m.animation.name], ["aus", "none"]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".pp-ansprech-puls").waitFor();
  m = await dock(page);
  assert.deepEqual([m.puls.daten, m.animation.name], ["aus", "none"], "Vorliebe dieses Geräts bleibt");
  await page.getByRole("button", { name: "Pulsieren des Punkts fortsetzen" }).click();
  assert.equal((await dock(page)).puls.daten, "an");
  await page.getByRole("button", { name: "Karte einklappen" }).first().click();
  m = await dock(page);
  assert.equal(m.punktImFoto, false, "G5: kein Punkt am eingeklappten Foto");
  await context.close();
});

test("D — reduzierte Bewegung: kein Puls, kein Schalter, keine Öffnungsbewegung", async () => {
  const { context, page } = await seite({ kontext: { reducedMotion: "reduce" } });
  let m = await dock(page);
  assert.equal(m.puls, null);
  assert.equal(m.animation.name, "none");
  await page.getByRole("button", { name: "Karte einklappen" }).click();
  await page.locator(".pp-ansprech-foto-knopf").click();
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector(".pp-ansprech")).animationName);
  assert.equal(anim, "none");
  m = await dock(page);
  assert.equal(m.offen, "ja");
  await context.close();
});

test("E — Einklappen: Foto 56 px, Fokus folgt der Handlung, Vorliebe je Gerät, Öffnen über das Foto", async () => {
  const { context, page } = await seite();
  await page.getByRole("button", { name: "Karte einklappen" }).click();
  let m = await dock(page);
  assert.deepEqual([m.offen, m.karte, Math.round(m.foto.w), Math.round(m.foto.h)], ["nein", null, 56, 56]);
  assert.ok(Math.abs(m.fenster.w - m.foto.r - 24) <= 1 && Math.abs(m.fenster.h - m.foto.b - 24) <= 1, JSON.stringify(m.foto));
  assert.deepEqual([m.fotoKnopf.expanded, m.fotoKnopf.ariaLabel, m.fotoKnopf.name], ["false", null, "Ihr persönlicher Ansprechpartner: Patrick Werner"]);
  assert.equal(await page.evaluate(() => document.activeElement.className), "pp-ansprech-foto-knopf", "Fokus auf dem Foto");
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_ansprechpartner_karte")), "zu");
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--ce-ansprech-hoehe").trim() === "56px", null, { timeout: 3000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".pp-ansprech-foto-knopf").waitFor();
  assert.equal((await dock(page)).offen, "nein", "eingeklappt bleibt eingeklappt");
  await page.locator(".pp-ansprech-foto-knopf").click();
  m = await dock(page);
  assert.equal(m.offen, "ja");
  assert.equal(await page.evaluate(() => document.activeElement.className), "pp-ansprech-einklappen", "Fokus in der Karte");
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_ansprechpartner_karte")), null);
  await context.close();
});

test("F — ohne Zuordnung: Kundenservice im selben Dock, ohne Person, Links und Fotoabruf", async () => {
  const { context, page, zustand } = await seite({ am: null });
  const m = await dock(page);
  assert.match(m.klasse, /pp-ansprech--service/);
  assert.equal(m.text, "Kundenservice ConfidaraExpress");
  assert.equal(m.bereich, "ConfidaraExpress Kundenservice");
  assert.deepEqual([m.tel, m.mail, m.img, m.puls], [null, null, null, null]);
  assert.equal(await page.locator(".pp-ansprech-dock a").count(), 0, "kein Link, auch nicht ins Supportpostfach");
  assert.deepEqual(zustand.fotoAbrufe, []);
  await page.getByRole("button", { name: "Karte einklappen" }).click();
  assert.equal((await dock(page)).fotoKnopf.name, "ConfidaraExpress Kundenservice");
  await context.close();
});

test("G — Foto nicht ladbar: Initialen der richtigen Person in Karte und Foto", async () => {
  const { context, page, zustand } = await seite({ foto: 404 });
  await page.waitForTimeout(400);
  const m = await dock(page);
  assert.deepEqual([m.img, m.initialen], [null, ["PW", "PW"]]);
  assert.equal(zustand.fotoAbrufe.length, 1);
  await context.close();
});

test("H — Tastatur: Punkt, Einklappen, Telefon, E-Mail — nach dem Seiteninhalt, mit sichtbarem Fokus", async () => {
  const { context, page } = await seite();
  // Die Karte steht am Ende von <body>: nach ihr kommt kein Bedienelement des Inhalts mehr.
  const reihenfolge = await page.evaluate(() => {
    const alle = [...document.querySelectorAll("a[href], button, input, select, textarea")].filter((e) => e.getClientRects().length > 0 && !e.disabled);
    return alle.slice(-4).map((e) => e.className.split(" ").pop());
  });
  assert.deepEqual(reihenfolge, ["pp-ansprech-puls", "pp-ansprech-einklappen", "pp-ansprech-tel", "pp-ansprech-mail"]);
  await page.locator(".pp-ansprech-puls").focus();
  const reihe = [];
  for (let i = 0; i < 4; i++) {
    reihe.push(await page.evaluate(() => {
      const e = document.activeElement;
      const st = getComputedStyle(e);
      return { klasse: e.className.split(" ").pop(), umriss: st.outlineStyle !== "none" && parseFloat(st.outlineWidth) >= 2 };
    }));
    await page.keyboard.press("Tab");
  }
  assert.deepEqual(reihe.map((r) => r.klasse), ["pp-ansprech-puls", "pp-ansprech-einklappen", "pp-ansprech-tel", "pp-ansprech-mail"]);
  assert.ok(reihe.every((r) => r.umriss), JSON.stringify(reihe));
  await context.close();
});

test("I — Telefon 390 und 360 px mit Touch: kompakt, Öffnen über dem Foto, Escape und Klick daneben schließen", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    const { context, page } = await seite({ viewport, kontext: { hasTouch: true, isMobile: true, deviceScaleFactor: 3 } });
    let m = await dock(page);
    assert.deepEqual([m.form, m.offen, m.karte, Math.round(m.foto.w)], ["kompakt", "nein", null, 56], JSON.stringify(viewport));
    assert.ok(Math.abs(m.fenster.w - m.foto.r - 16) <= 1 && Math.abs(m.fenster.h - m.foto.b - 16) <= 1, JSON.stringify(m.foto));
    await page.locator(".pp-ansprech-foto-knopf").tap();
    m = await dock(page);
    assert.equal(m.offen, "ja");
    assert.ok(m.karte.l >= 0 && m.karte.r <= m.fenster.w && m.karte.t >= 56 && m.karte.b <= m.foto.t, `Karte im Fenster über dem Foto: ${JSON.stringify(m.karte)}`);
    assert.equal(m.bild, null, "kein zweites Foto in der Karte über dem Foto");
    const [lokal, domain] = await mailZeilen(page);
    assert.equal(domain, lokal, `${viewport.width} px: die E-Mail-Adresse steht in einer Zeile`);
    assert.equal(m.hoeheVar, "56px", "kompakt geöffnet bleibt der Freiraum beim Foto");
    assert.ok(m.ueberlauf <= 0);
    const ziele = await page.evaluate(() => [".pp-ansprech-tel", ".pp-ansprech-mail", ".pp-ansprech-foto-knopf"].map((s) => document.querySelector(s).getBoundingClientRect().height));
    assert.ok(ziele.every((hh) => hh >= 44), `Touch-Ziele ${ziele}`);
    await page.keyboard.press("Escape");
    m = await dock(page);
    assert.equal(m.offen, "nein", "Escape schließt");
    assert.equal(await page.evaluate(() => document.activeElement.className), "pp-ansprech-foto-knopf");
    await page.locator(".pp-ansprech-foto-knopf").tap();
    await page.mouse.click(40, Math.round(viewport.height / 2));
    assert.equal((await dock(page)).offen, "nein", "Klick daneben schließt");
    await context.close();
  }
});

test("J — 200 % Zoom und 24 px Browserschrift: kompakt, geöffnet vollständig im Fenster, kein Querüberlauf", async () => {
  // 200 % auf 1440 × 900 = 720 × 450 CSS-Pixel; 200 % auf 1920 × 1080 = 960 × 540.
  for (const viewport of [{ width: 720, height: 450 }, { width: 960, height: 540 }]) {
    const { context, page } = await seite({ viewport, kontext: { deviceScaleFactor: 2 } });
    assert.equal((await dock(page)).form, "kompakt", JSON.stringify(viewport));
    await page.locator(".pp-ansprech-foto-knopf").click();
    const m = await dock(page);
    const innen = await page.evaluate(() => { const k = document.querySelector(".pp-ansprech"); return { scroll: k.scrollHeight, client: k.clientHeight }; });
    assert.ok(m.karte.t >= 0 && m.karte.b <= m.fenster.h && m.karte.r <= m.fenster.w, JSON.stringify(m.karte));
    assert.ok(innen.scroll <= innen.client || innen.client > 0, "zu hoch: scrollt innen statt abgeschnitten");
    assert.ok(m.ueberlauf <= 0);
    await context.close();
  }
  const { context, page } = await seite({ schrift: 24 });
  const m = await dock(page);
  assert.equal(m.form, "kompakt", "24 px Browserschrift auf 1440 px: kompakt");
  await page.locator(".pp-ansprech-foto-knopf").click();
  const n = await dock(page);
  assert.ok(n.karte.t >= 0 && n.karte.r <= n.fenster.w && n.ueberlauf <= 0, JSON.stringify(n.karte));
  const telZeilen = await page.evaluate(() => document.querySelector(".pp-ansprech-tel > span").getClientRects().length);
  assert.equal(telZeilen, 1, "die Telefonnummer bricht nie");
  await context.close();
});

test("K — lange E-Mail-Adresse: Umbruch vor dem „@“, kein Überlauf", async () => {
  const lang = { ...PATRICK, email: "patrick.werner.kundenbetreuung@confidaraexpress.de" };
  const { context, page } = await seite({ am: lang });
  const zeilen = await page.evaluate(() => {
    const span = document.querySelector(".pp-ansprech-mail > span");
    const r = document.createRange();
    const ergebnis = [];
    for (const knoten of span.childNodes) {
      if (knoten.nodeType !== Node.TEXT_NODE) continue;
      r.selectNodeContents(knoten);
      ergebnis.push({ text: knoten.textContent, zeilen: r.getClientRects().length, oben: r.getBoundingClientRect().top });
    }
    const k = document.querySelector(".pp-ansprech");
    return { ergebnis, ueberlauf: k.scrollWidth - k.clientWidth };
  });
  const [lokal, domain] = zeilen.ergebnis;
  assert.deepEqual([lokal.text, domain.text], ["patrick.werner.kundenbetreuung", "@confidaraexpress.de"]);
  assert.ok(domain.oben > lokal.oben, "die Domain steht in der nächsten Zeile");
  assert.equal(domain.zeilen, 1, "die Domain bricht nicht");
  assert.ok(zeilen.ueberlauf <= 0);
  await context.close();
});

test("L — nicht verdeckt: letzte Zeilen und Fokus liegen über der Karte", async () => {
  for (const [viewport, kontext] of [[{ width: 1366, height: 768 }, {}], [{ width: 390, height: 844 }, { hasTouch: true, isMobile: true }]]) {
    const { context, page } = await seite({ viewport, kontext, ziel: "/dashboard?page=products" });
    const ansicht = viewport.width > 900 ? ".inv-list-table--artikel" : ".inv-list-cards--artikel";
    const aktionen = page.locator(`${ansicht} :is(.inv-row-actions, .inv-card-actions)`);
    await aktionen.first().waitFor({ timeout: 30000 });
    const letzte = aktionen.last();
    // Ganz nach unten gescrollt: jede Aktion der letzten Zeile ist frei.
    await scrolle(page, "ende");
    for (const name of ["Bearbeiten", "Versenden", "Löschen"]) {
      const f = await frei(letzte.getByRole("button", { name: new RegExp(`^${name}`) }));
      assert.ok(f.frei && !f.imDock, `${JSON.stringify(viewport)} ${name} verdeckt: ${JSON.stringify(f)}`);
    }
    // Tastatur: der Fokus auf einer Aktion weiter unten landet über der Karte (scroll-padding, WCAG 2.4.11).
    await scrolle(page, 0);
    const ziel = aktionen.nth(Math.max(0, (await aktionen.count()) - 3)).getByRole("button", { name: /^Löschen/ });
    await ziel.focus();
    await ruhig(page);
    const f = await frei(ziel);
    assert.ok(f.frei && !f.imDock && f.unten <= f.h, `Fokus verdeckt: ${JSON.stringify(f)}`);
    await context.close();
  }
});

test("M — Ebenen: Dialog und Schublade liegen über der Karte", async () => {
  let { context, page } = await seite({ ziel: "/dashboard?page=products" });
  await page.getByRole("button", { name: "Artikel anlegen" }).first().click();
  await page.locator('[role="dialog"]').waitFor();
  let oben = await page.evaluate(() => { const r = document.querySelector(".pp-ansprech").getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(e && e.closest(".pp-ansprech-dock")); });
  assert.equal(oben, false, "der Dialog liegt über der Karte");
  await context.close();
  ({ context, page } = await seite({ viewport: { width: 390, height: 844 }, kontext: { hasTouch: true, isMobile: true } }));
  await page.getByRole("button", { name: "Menü – Navigation öffnen" }).click();
  await page.waitForTimeout(400);
  oben = await page.evaluate(() => { const r = document.querySelector(".pp-ansprech-foto-knopf").getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(e && e.closest(".pp-ansprech-dock")); });
  assert.equal(oben, false, "die Schublade liegt über dem Foto");
  await context.close();
});

test("N — Adminwechsel und öffentliche Demo (über der Demo-Leiste, keine Person, kein Fotoabruf)", async () => {
  let { context, page, zustand } = await seite({ am: MIGUEL });
  assert.match((await dock(page)).text, /Miguel Vance Anrufen: 0160 92717124/);
  zustand.am = PATRICK;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector(".pp-ansprech")?.innerText.includes("Patrick Werner"));
  assert.doesNotMatch((await dock(page)).text, /Miguel/);
  await context.close();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    ({ context, page, zustand } = await seite({ ziel: "/demo/dashboard", am: PATRICK, viewport }));
    await page.locator(".demo-leiste").waitFor();
    const m = await dock(page);
    assert.match(m.klasse, /pp-ansprech--service/);
    const leiste = await page.locator(".demo-leiste").boundingBox();
    const unten = (m.karte || m.foto).b;
    assert.ok(unten <= leiste.y - 8, `${JSON.stringify(viewport)}: Karte (${unten}) über der Demo-Leiste (${leiste.y})`);
    assert.deepEqual(zustand.fotoAbrufe, [], "die Demo erreicht den Server nie");
    await context.close();
  }
});
