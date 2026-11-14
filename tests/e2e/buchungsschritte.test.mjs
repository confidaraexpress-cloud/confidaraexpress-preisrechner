// E2E: Buchungsschritte — Premium-Card-Stepper (Variante C, Betreiberentscheidung 2026-11-14) im echten Browser.
// Die Strecke läuft in der öffentlichen Demo: Beispielangebote, simulierte Buchung, kein Backend — jede Anfrage an den
// Server wird abgebrochen und lässt den Test scheitern. Keine Buchung, keine E-Mail, kein Provider. Die
// Sendungsverfolgung bekommt eine gemockte öffentliche Trackingantwort.
//
//   S1  Schritt 1 und 2 in 1440, 768, 390 und 360 px: drei Karten in einer Reihe, Zustände, aria-current nur am
//       aktiven Schritt, kein fokussierbares Element, kein Überlauf, gleich hohe Karten (≤ 64 px, kompakt ≤ 77 px),
//       Haken und „abgeschlossen“ am erledigten Schritt; die Erfolgsseite hat keine Leiste.
//   S2  Die aktive Karte rendert nur Blautöne: jeder gesättigte Bildpunkt im Farbton 195–240°, auch kompakt.
//   S3  Bewegung: je erreichtem Schritt genau ein einmaliger Lichtlauf (bk-licht, 1 Durchlauf), danach Ruhe; bei
//       reduzierter Bewegung kein Lichtlauf und kein Überblenden.
//   S4  Erhöhter Kontrast, erzwungene Farben und Druck: flach, der Zustand liegt im Rahmen, kein Lichtlauf.
//   S5  Die Sendungsverfolgung bleibt unverändert: Ohne die Regeln des Steppers berechnet der Browser für ihre
//       Stufenleiste exakt dieselben Werte (alle Eigenschaften), erreichte und aktuelle Stufe grün.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { zurBuchung } from "./helpers/newShipmentForm.mjs";
import { dekodierePng, farbe } from "./helpers/pngPixel.mjs";

const PORT = 5795, BASE = `http://127.0.0.1:${PORT}`;
const API = "https://api.confidaraexpress.de";
const BREITEN = [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 740 }];
const TRACKINGNUMMER = "07350000123456";

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
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore", ...DEV_SERVER_SPAWN });
  await warteAufServer(BASE);
  // Graustufen-Kantenglättung und sRGB: Die LCD-Glättung (ClearType) säumt Glyphen rot und violett — eine Eigenschaft
  // der Textdarstellung des Systems, nicht des Entwurfs; S2 misst die Farben des Entwurfs.
  browser = await chromium.launch({ executablePath: chromiumExecutablePath(), args: ["--disable-lcd-text", "--force-color-profile=srgb"] });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
});

/** Demo-Browser: jede Anfrage an den Server wird abgebrochen und gezählt (Muster aus premiumParityApp D2). */
async function demoBrowser(viewport, optionen = {}) {
  const ctx = await browser.newContext({ viewport, locale: "de-DE", timezoneId: "Europe/Berlin", colorScheme: "light", ...optionen });
  const serverAnfragen = [];
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const ziel = new URL(req.url());
    const serverziel = ziel.origin === API || /^\/(api|kunde|kundenbereich|login|register|auth)(\/|$)/.test(ziel.pathname) && req.resourceType() === "fetch";
    if (!serverziel) return route.continue();
    // Den Rechtskontext beantwortet in der Demo die Demo-Datenquelle; kommt er doch hier an, ist er aus.
    if (ziel.pathname === "/api/legal/booking-context") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false }) });
    serverAnfragen.push(`${req.method()} ${ziel.pathname}`);
    return route.abort();
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { ctx, page, fehler, serverAnfragen };
}

async function zuSchritt1(page) {
  await page.goto(`${BASE}/demo/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await zurBuchung(page, { warteAuf: ".booking-wrap > .steps-bar ol.bk-schritte" });
  await page.evaluate(() => document.fonts.ready);
}
async function zuSchritt2(page) {
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(".booking-blatt--buchung", { timeout: 20000 });
  await page.waitForSelector(".bk-schritt:nth-child(2).bk-schritt--aktiv", { timeout: 10000 });
}
const zweiBilder = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Alles, was S1 an der Leiste misst. */
function vermesse(page) {
  return page.evaluate(() => {
    const leiste = document.querySelector(".booking-wrap > .steps-bar");
    const liste = leiste.querySelector("ol.bk-schritte");
    const li = [...liste.children];
    const karten = li.map((e) => e.querySelector(".bk-karte").getBoundingClientRect());
    const l = leiste.getBoundingClientRect();
    const sichtbar = (e) => getComputedStyle(e).display !== "none";
    return {
      tags: li.map((e) => e.tagName),
      name: liste.getAttribute("aria-label"),
      zustaende: li.map((e) => [...e.classList].find((k) => k.startsWith("bk-schritt--"))?.slice("bk-schritt--".length)),
      aktuell: li.map((e) => e.getAttribute("aria-current")),
      titel: li.map((e) => e.querySelector(".bk-titel").firstChild.textContent),
      zusatz: li.map((e) => e.querySelector(".bk-titel .sr-only")?.textContent ?? null),
      haken: li.map((e) => Boolean(e.querySelector(".bk-marke svg"))),
      markeVerborgen: li.map((e) => e.querySelector(".bk-marke").getAttribute("aria-hidden")),
      marke: li.map((e) => e.querySelector(".bk-marke").textContent),
      fokussierbar: leiste.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]').length,
      kompakt: getComputedStyle(li[0].querySelector(".bk-karte")).flexDirection === "column",
      radien: li.map((e) => getComputedStyle(e.querySelector(".bk-karte")).borderTopLeftRadius),
      zeilen: li.map((e) => sichtbar(e.querySelector(".bk-zeile"))),
      oben: karten.map((r) => r.top),
      hoehen: karten.map((r) => r.height),
      innerhalb: karten.every((r) => r.left >= l.left - 0.5 && r.right <= l.right + 0.5),
      leistenBreite: l.width,
      emPx: parseFloat(getComputedStyle(leiste).fontSize),
      seitenUeberlauf: document.documentElement.scrollWidth - innerWidth,
      leistenUeberlauf: leiste.scrollWidth - leiste.clientWidth,
      abgeschnitten: li.flatMap((e) => [...e.querySelectorAll(".bk-titel, .bk-zeile")])
        .filter((e) => sichtbar(e) && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
    };
  });
}

function pruefeLeiste(m, schritt, vp) {
  const wo = `${vp.width} px, Schritt ${schritt}`;
  assert.deepEqual(m.tags, ["LI", "LI", "LI"], `${wo}: drei Listeneinträge`);
  assert.equal(m.name, "Buchungsfortschritt");
  assert.deepEqual(m.titel, ["Übersicht", "Buchung", "Fertig"]);
  const zustaende = schritt === 1 ? ["aktiv", "offen", "offen"] : ["erledigt", "aktiv", "offen"];
  assert.deepEqual(m.zustaende, zustaende, wo);
  assert.deepEqual(m.aktuell, zustaende.map((z) => (z === "aktiv" ? "step" : null)), `${wo}: aria-current nur am aktiven Schritt`);
  assert.deepEqual(m.haken, zustaende.map((z) => z === "erledigt"), `${wo}: Haken nur am erledigten Schritt`);
  assert.deepEqual(m.markeVerborgen, zustaende.map((z) => (z === "erledigt" ? "true" : null)), `${wo}: Haken für Screenreader verborgen`);
  assert.deepEqual(m.zusatz, zustaende.map((z) => (z === "erledigt" ? " (abgeschlossen)" : null)), `${wo}: Zusatz „abgeschlossen“`);
  assert.deepEqual(m.marke, zustaende.map((z, i) => (z === "erledigt" ? "" : String(i + 1))), `${wo}: Nummern der übrigen Schritte`);
  assert.equal(m.fokussierbar, 0, `${wo}: die Leiste ist reine Anzeige`);
  // Kompakt genau dann, wenn die Leiste schmaler als 34 em ist (Containerabfrage, keine Viewportweiche).
  assert.equal(m.kompakt, m.leistenBreite < 34 * m.emPx, `${wo}: kompakt bei ${m.leistenBreite.toFixed(1)} px Leistenbreite`);
  assert.deepEqual(m.zeilen, [!m.kompakt, !m.kompakt, !m.kompakt], `${wo}: Unterzeile nur in der breiten Fassung`);
  // Radius: breit der Abschnittsradius des Kundenbereichs (14 px), kompakt die Skala (12 px).
  assert.deepEqual(m.radien, Array(3).fill(m.kompakt ? "12px" : "14px"), `${wo}: Kartenradius`);
  assert.ok(Math.max(...m.oben) - Math.min(...m.oben) < 0.5, `${wo}: drei Karten in einer Reihe`);
  assert.ok(Math.max(...m.hoehen) - Math.min(...m.hoehen) < 0.5, `${wo}: gleich hohe Karten ${m.hoehen.join("/")}`);
  assert.ok(Math.max(...m.hoehen) <= (m.kompakt ? 77 : 64) + 0.5, `${wo}: Kartenhöhe ${Math.max(...m.hoehen).toFixed(1)} px`);
  assert.ok(m.innerhalb, `${wo}: Karten innerhalb der Leiste`);
  assert.ok(m.seitenUeberlauf <= 0, `${wo}: Seite läuft um ${m.seitenUeberlauf} px über`);
  assert.ok(m.leistenUeberlauf <= 0, `${wo}: Leiste läuft um ${m.leistenUeberlauf} px über`);
  assert.deepEqual(m.abgeschnitten, [], `${wo}: abgeschnittener Text`);
}

/** Farbtöne der gesättigten Bildpunkte innerhalb der gerundeten Fläche (2 px eingerückt: ohne Seitengrund, ohne Kante). */
async function farbtoene(page, auswahl) {
  const karte = page.locator(auswahl);
  const radius = await karte.evaluate((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius));
  const bild = dekodierePng(await karte.screenshot({ animations: "disabled" }));
  const innen = (x, y) => {
    const px = x + 0.5, py = y + 0.5, e = 2, r = Math.max(0, radius - e);
    if (px < e || py < e || px > bild.w - e || py > bild.h - e) return false;
    const cx = Math.min(Math.max(px, e + r), bild.w - e - r), cy = Math.min(Math.max(py, e + r), bild.h - e - r);
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  };
  let flaeche = 0, gesaettigt = 0;
  const ausserhalb = [];
  let min = 360, max = 0;
  for (let y = 0; y < bild.h; y++) for (let x = 0; x < bild.w; x++) {
    if (!innen(x, y)) continue;
    flaeche++;
    const [r, g, b] = farbe(bild, x, y);
    const hoch = Math.max(r, g, b), tief = Math.min(r, g, b), c = hoch - tief;
    if (c < 20) continue;
    gesaettigt++;
    let h = hoch === r ? 60 * (((g - b) / c) % 6) : hoch === g ? 60 * ((b - r) / c + 2) : 60 * ((r - g) / c + 4);
    if (h < 0) h += 360;
    min = Math.min(min, h); max = Math.max(max, h);
    if (h < 195 || h > 240) ausserhalb.push(`(${x},${y}) rgb(${r},${g},${b}) ${h.toFixed(0)}°`);
  }
  return { flaeche, gesaettigt, ausserhalb, min, max };
}

test("S1/S2 — Schritte 1 und 2 in vier Breiten: Zustände, reine Anzeige, eine Reihe, nur Blau aktiv; Erfolgsseite ohne Leiste", { timeout: 240000 }, async () => {
  const { ctx, page, fehler, serverAnfragen } = await demoBrowser(BREITEN[0], { reducedMotion: "reduce" });
  try {
    await zuSchritt1(page);
    for (const schritt of [1, 2]) {
      if (schritt === 2) await zuSchritt2(page);
      for (const vp of BREITEN) {
        await page.setViewportSize(vp);
        await zweiBilder(page);
        await page.locator(".booking-wrap > .steps-bar").scrollIntoViewIfNeeded();
        pruefeLeiste(await vermesse(page), schritt, vp);
        const t = await farbtoene(page, ".bk-schritt--aktiv .bk-karte");
        const wo = `${vp.width} px, Schritt ${schritt}`;
        assert.ok(t.gesaettigt > 0.5 * t.flaeche, `${wo}: aktive Fläche kaum gesättigt (${t.gesaettigt}/${t.flaeche})`);
        assert.deepEqual(t.ausserhalb.slice(0, 8), [], `${wo}: Farbton außerhalb 195–240° (${t.ausserhalb.length} Punkte, Spanne ${t.min.toFixed(0)}–${t.max.toFixed(0)}°)`);
      }
    }
    // Abschluss: simulierte Buchung (Demo, kein Server) — die Erfolgsseite trägt keine Leiste.
    await page.setViewportSize(BREITEN[0]);
    for (const feld of await page.locator(".booking-blatt input[type=checkbox]").all()) {
      if (!(await feld.isChecked())) await feld.check();
    }
    await page.getByRole("button", { name: /Kostenpflichtig buchen/ }).click();
    await page.waitForSelector(".booking-success-title", { timeout: 20000 });
    assert.equal(await page.locator(".steps-bar").count(), 0, "Leiste auf der Erfolgsseite");
    assert.equal(await page.locator(".bk-schritte").count(), 0);
    assert.deepEqual(serverAnfragen, [], "die Demo hat den Server angefragt");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

const pseudo = (page, auswahl, art) => page.$eval(auswahl, (e, art) => {
  const s = getComputedStyle(e, art);
  return { content: s.content, animation: s.animationName, durchlaeufe: s.animationIterationCount, uebergang: s.transitionProperty };
}, art);
const lichtlaeufe = (page) => page.evaluate(() => document.getAnimations()
  .filter((a) => a.animationName === "bk-licht")
  .map((a) => ({
    ziel: [...document.querySelectorAll(".bk-schritt")].indexOf(a.effect.target.closest(".bk-schritt")),
    pseudo: a.effect.pseudoElement, zustand: a.playState,
    durchlaeufe: a.effect.getTiming().iterations, dauer: a.effect.getTiming().duration,
  })));
/** Medienwechsel und Ende des Überblendens (Farbe und Schatten der Karte gehen 220 ms weich über). */
async function medien(page, einstellung) {
  await page.emulateMedia(einstellung);
  await zweiBilder(page);
  await page.waitForFunction(() => document.querySelector(".booking-wrap > .steps-bar").getAnimations({ subtree: true })
    .every((a) => a.playState !== "running"), null, { timeout: 5000 });
}
async function warteBisRuhig(page) {
  await page.waitForFunction(() => {
    const l = document.getAnimations().filter((a) => a.animationName === "bk-licht");
    return l.length > 0 && l.every((a) => a.playState === "finished");
  }, null, { timeout: 8000 });
}

test("S3/S4 — einmaliger Lichtlauf je Schritt, aus bei reduzierter Bewegung, Kontrast, erzwungenen Farben und im Druck", { timeout: 240000 }, async () => {
  const { ctx, page, fehler, serverAnfragen } = await demoBrowser(BREITEN[0]);
  try {
    await zuSchritt1(page);
    const k1 = ".bk-schritt:nth-child(1) .bk-karte", k2 = ".bk-schritt:nth-child(2) .bk-karte", k3 = ".bk-schritt:nth-child(3) .bk-karte";
    assert.deepEqual(await pseudo(page, k1, "::after"), { content: '""', animation: "bk-licht", durchlaeufe: "1", uebergang: "all" });
    const l1 = await lichtlaeufe(page);
    assert.equal(l1.length, 1, `Schritt 1: ${JSON.stringify(l1)}`);
    assert.deepEqual({ ...l1[0], zustand: undefined }, { ziel: 0, pseudo: "::after", zustand: undefined, durchlaeufe: 1, dauer: 1600 });
    await warteBisRuhig(page);
    // Schritt 2: der Lichtlauf läuft einmal über die neue aktive Karte, die erste trägt keinen mehr.
    await zuSchritt2(page);
    const l2 = await lichtlaeufe(page);
    assert.deepEqual(l2.map((l) => [l.ziel, l.durchlaeufe]), [[1, 1]], `Schritt 2: ${JSON.stringify(l2)}`);
    assert.equal((await pseudo(page, k1, "::after")).animation, "none");
    await warteBisRuhig(page);
    // Weiches Überblenden der aktiven Fläche, sonst nichts in Bewegung.
    assert.match((await pseudo(page, k2, "::before")).uebergang, /^opacity$/);

    await medien(page, { reducedMotion: "reduce" });
    assert.deepEqual(await pseudo(page, k2, "::after"), { content: "none", animation: "none", durchlaeufe: "1", uebergang: "all" });
    assert.equal((await pseudo(page, k2, "::before")).uebergang, "none");
    assert.equal(await page.$eval(k2, (e) => getComputedStyle(e).transitionProperty), "none");

    const stil = (auswahl) => page.$eval(auswahl, (e) => {
      const s = getComputedStyle(e), z = e.querySelector(".bk-zeile");
      return { rand: s.borderTopWidth, randfarbe: s.borderTopColor, bild: s.backgroundImage, farbe: s.color, schatten: s.boxShadow,
        zeile: z ? getComputedStyle(z).color : null, vorne: getComputedStyle(e, "::before").content, hinten: getComputedStyle(e, "::after").content };
    });
    // Erhöhter Kontrast: flache Flächen, Nebenzeilen in Textfarbe, kein Lichtlauf.
    await medien(page, { reducedMotion: null, contrast: "more" });
    const kAktiv = await stil(k2), kOffen = await stil(k3);
    assert.equal(kAktiv.hinten, "none", "Kontrast: Lichtlauf");
    assert.equal(kAktiv.zeile, "rgb(255, 255, 255)");
    assert.equal(kOffen.zeile, "rgb(22, 34, 63)");
    assert.match(kAktiv.schatten, /0px 0px 0px 2px/);
    assert.equal(await page.$eval(k2, (e) => getComputedStyle(e, "::before").backgroundImage), "none");
    // Erzwungene Farben: Zustand in der Rahmenstärke, keine Ebenen.
    await medien(page, { contrast: null, forcedColors: "active" });
    const fAktiv = await stil(k2), fErledigt = await stil(k1), fOffen = await stil(k3);
    assert.deepEqual([fErledigt.rand, fAktiv.rand, fOffen.rand], ["1px", "3px", "1px"]);
    assert.deepEqual([fAktiv.vorne, fAktiv.hinten, fErledigt.vorne], ["none", "none", "none"]);
    assert.equal(await page.locator(".bk-schritt:nth-child(1) .bk-marke svg").count(), 1, "Haken auch bei erzwungenen Farben");
    // Druck: ohne Hintergrundgrafik lesbar — dunkle Schrift, Rahmen zeigt den aktiven Schritt.
    await medien(page, { forcedColors: null, media: "print" });
    const dAktiv = await stil(k2), dOffen = await stil(k3);
    assert.deepEqual([dAktiv.rand, dOffen.rand], ["2px", "1px"]);
    assert.deepEqual([dAktiv.bild, dAktiv.farbe, dAktiv.hinten], ["none", "rgb(22, 34, 63)", "none"]);
    await page.emulateMedia({ media: null });

    assert.deepEqual(serverAnfragen, [], "die Demo hat den Server angefragt");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

// Öffentliche Trackingantwort im neutralen Vertrag (Muster aus publicTrackingLink): Stand „unterwegs“ → Stufe 2 aktiv.
const TRACKING_OK = {
  tracking: null, trackingAvailable: true, trackingNumber: TRACKINGNUMMER, trackingStatus: "in_transit", trackingStatusText: null,
  carrier: "DPD", carrierTrackingPage: "https://carrier.example/track/07350000123456", liveTracking: true, source: "live",
  trackingLegs: [{
    carrier: "DPD", trackingReference: TRACKINGNUMMER, status: "in_transit", carrierTrackingPage: "https://carrier.example/track/07350000123456",
    events: [
      { status: "pending", description: "Sendung übernommen", location: "DE", dateTime: { date: "2026-08-20", time: "09:15" } },
      { status: "in_transit", description: "Unterwegs", location: "AT", dateTime: { date: "2026-08-21", time: "07:40" } },
    ],
  }],
};

test("S5 — die Stufenleiste der Sendungsverfolgung bleibt unverändert (Regeln des Steppers abgezogen: identisch)", { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "de-DE", timezoneId: "Europe/Berlin" });
  const fremd = [];
  await ctx.route(`${API}/**`, (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === `/api/tracking/public/${TRACKINGNUMMER}`) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TRACKING_OK) });
    fremd.push(p);
    return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "unauthorized" }) });
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  const abdruck = () => page.evaluate(() => {
    const leiste = document.querySelector(".steps-bar.tracking-steps");
    return [leiste, ...leiste.querySelectorAll("*")].map((e) => {
      const s = getComputedStyle(e), o = { klasse: e.className };
      for (const p of s) o[p] = s.getPropertyValue(p);
      for (const art of ["::before", "::after"]) { const q = getComputedStyle(e, art); o[art] = `${q.content}|${q.display}|${q.borderTopWidth}`; }
      return o;
    });
  });
  try {
    await page.goto(`${BASE}/tracking?nummer=${TRACKINGNUMMER}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".steps-bar.tracking-steps .step-circle.active", { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await zweiBilder(page);
    const breit = await abdruck();
    await page.setViewportSize({ width: 390, height: 844 });
    await zweiBilder(page);
    const schmal = await abdruck();
    // Die Stufenleiste selbst: erreichte und aktuelle Stufe grün, auf dem Telefon ohne Beschriftung.
    const kreis = breit.filter((o) => /\bstep-circle\b/.test(o.klasse));
    assert.deepEqual(kreis.map((o) => o.klasse.replace("step-circle", "").trim()), ["done", "active", "", ""]);
    assert.deepEqual(kreis.slice(0, 2).map((o) => o["background-color"]), ["rgb(47, 107, 82)", "rgb(47, 107, 82)"]);
    assert.equal(breit[0].display, "flex");
    assert.equal(kreis[0].width, "32px");
    assert.equal(schmal.find((o) => /\bstep-label\b/.test(o.klasse)).display, "none");
    assert.equal(schmal.find((o) => /\bstep-circle\b/.test(o.klasse)).width, "28px");
    assert.equal(await page.locator(".bk-schritte, .bk-karte").count(), 0);

    // Gegenprobe: alle Regeln des Steppers aus den Stylesheets entfernen — die Werte bleiben in beiden Breiten gleich.
    const entfernt = await page.evaluate(() => {
      let n = 0;
      // Nur die Klassen des Steppers — .bk-savedraft* (Entwurf speichern, calculator.css) gehört nicht dazu.
      const vomStepper = (sel) => /\.bk-(schritte|schritt|karte|marke|text|titel|zeile)(?!\w)|\.booking-wrap > \.steps-bar/.test(sel);
      const durch = (liste) => {
        for (let i = liste.cssRules.length - 1; i >= 0; i--) {
          const r = liste.cssRules[i];
          if (r instanceof CSSStyleRule) { if (vomStepper(r.selectorText)) { liste.deleteRule(i); n++; } } else if (r.cssRules) durch(r);
        }
      };
      for (const blatt of document.styleSheets) { try { durch(blatt); } catch { /* fremdes Blatt */ } }
      return n;
    });
    assert.ok(entfernt >= 30, `zu wenige Regeln des Steppers gefunden (${entfernt}) — die Gegenprobe liefe ins Leere`);
    await zweiBilder(page);
    assert.deepEqual(await abdruck(), schmal, "390 px: der Stepper verändert die Sendungsverfolgung");
    await page.setViewportSize({ width: 1280, height: 1000 });
    await zweiBilder(page);
    assert.deepEqual(await abdruck(), breit, "1280 px: der Stepper verändert die Sendungsverfolgung");
    assert.deepEqual(fremd, [], "die öffentliche Seite fragt geschützte Endpunkte an");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});
