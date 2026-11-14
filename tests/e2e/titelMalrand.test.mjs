// Titel-Malrand im Browser (Titel-Clipping, 2026-11-14).
//
// Die Titel mit Material (titelstile.css: Signatur, Relief, Bühne) malen ihre Füllung per background-clip: text. Der
// Browser malt das nur innerhalb der Rahmenbox; Instrument Sans ist höher als die Titelzeilen, deshalb blieben
// Unterlängen und Akzente durchsichtig. Der Malrand — 0,14 em Innenabstand oben und unten, ausgeglichen durch denselben
// negativen Außenabstand — vergrößert die Malfläche, ohne dass sich etwas bewegt. Geprüft an je einer Seite pro Material
// und Bereich, in 1440 und 390 px, mit doppelter Pixeldichte:
//
//   1. Vollständigkeit: Der Titel trägt den Prüftext „gjpqy ÄÖÜ Çß“ (Unterlängen, Akzente). Verglichen wird das Material
//      mit Malrand gegen dasselbe Material mit unbegrenzter Malfläche (Malrand 0,5 em) — gezählt werden abweichende
//      Gerätepixel, erwartet 0. Der Prägefilter ist dabei aus, sein Schatten überdeckte sonst Lücken. Gegenprobe ohne
//      Malrand: Ragt der Prüftext aus der Zeile, fehlen dort Pixel — die Messung greift also.
//      Bewusst nicht gegen den flach gemalten Text: Chromium verstärkt helle Schrift auf dunklem Grund an den Kanten,
//      die Textmaske von background-clip nicht. Auf der Bühne fehlten so Kantenpixel mitten in der Zeile, mit und ohne
//      Malrand gleich (gemessen: Partnerregistrierung 1440 px, 230 Pixel, flach 158 gegen Material 27).
//   2. Layoutneutralität: Lage des Texts, der Inhaltsbox und des folgenden Elements mit und ohne Malrand — gleich
//      (±0,05 px). Die Höhe des Elternelements wird bewusst nicht verglichen: Der negative Außenabstand fällt durch ein
//      Elternelement ohne Innenabstand hindurch (Margin-Collapsing); ohne eigenen Hintergrund ist das unsichtbar.
//   3. Werte: berechneter Innenabstand 0,14 em (oben zuzüglich --titel-polster-oben), Außenabstand −0,14 em, das
//      Material der Seite (Randband in seiner Kantenfarbe) und durchsichtige Schriftfüllung.
//
// Gemessen wird im selben Lauf gegen weitere Bilder desselben Ausschnitts — ohne Referenzbild, deshalb auf Windows und
// Linux gleich belastbar. Stile setzt die Suite per style.setProperty: Die CSP der Seiten
// sperrt eingefügte Stylesheets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { ohneDemoHinweis } from "./helpers/demoHinweis.mjs";
import { dekodierePng, tintenmaske } from "./helpers/pngPixel.mjs";

const PORT = 5793, BASE = `http://127.0.0.1:${PORT}`;
const PORT_RECHNER = 5794, BASE_RECHNER = `http://127.0.0.1:${PORT_RECHNER}`;
const API = "https://api.confidaraexpress.de";

const PRUEFTEXT = "gjpqy ÄÖÜ Çß";
const MALRAND_EM = 0.14;
const DPR = 2;
// Abweichung eines Gerätepixels: Summe der RGB-Abstände über 30. Bilder desselben Rasterwegs sind sonst gleich.
const ABWEICHUNG = 30;
const TOLERANZ_PX = 0.05;
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];

const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE" };

const SEITEN = [
  { id: "kunde-sendungen", name: "Kundenbereich, Sendungen", material: "signatur", basis: BASE,
    pfad: "/demo/dashboard?page=shipments", titel: ".main-content .ce-page-header-title" },
  { id: "sendungsverfolgung", name: "Sendungsverfolgung", material: "signatur", basis: BASE, pfad: "/tracking", titel: ".tracking-title" },
  { id: "versicherungsinfo", name: "Versicherungsinformationen", material: "signatur", basis: BASE,
    pfad: "/versicherungsinformationen", titel: ".insinfo-title" },
  { id: "admin", name: "Admin, Übersicht", material: "relief", basis: BASE, pfad: "/admin", titel: ".ce-page-header-title", admin: true },
  { id: "agb", name: "AGB", material: "relief", basis: BASE, pfad: "/agb", titel: ".legal-title" },
  { id: "anmeldung", name: "Anmeldung", material: "buehne", basis: BASE, pfad: "/login", titel: ".auth-title" },
  { id: "partnerregistrierung", name: "Partnerregistrierung", material: "buehne", basis: BASE,
    pfad: "/partner-registrieren", titel: ".auth-title" },
  // Zuletzt: der zweite Entwicklungsserver startet erst, wenn der erste seine Abhängigkeiten vorbereitet hat.
  // Die Headline des Preisrechners steht im statischen Seitengerüst, nicht in der Insel (kein React-Knoten).
  { id: "preisrechner", name: "Preisrechner", material: "buehne", basis: BASE_RECHNER, pfad: "/", titel: ".pc-display", rechner: true, statisch: true },
];

// Stilvarianten des gemessenen Titels (inline, mit Vorrang).
const LEER = { color: "transparent", "-webkit-text-fill-color": "transparent", "background-image": "none", filter: "none", "text-shadow": "none" };
const MATERIAL = { filter: "none" };
const OHNE_MALRAND = { "--titel-malrand": "0px" };
// Unbegrenzt: Malrand plus 32 px — mit Zeilenhöhe ab 1,0 ragt keine Glyphe von Instrument Sans so weit über die Zeile.
// Plus ganze Pixel statt eines anderen em-Werts: Die Rahmenbox beginnt dann im selben Bruchteil eines Gerätepixels, und
// die Kanten werden gleich gerastert. Mit 0,5 em wich helle Schrift auf Navy an einzelnen Kantenpixeln ab (Anmeldung
// 1440 px: 25 Pixel mitten in der Zeile), obwohl nichts abgeschnitten war.
const UNBEGRENZT = { "--titel-malrand": "calc(0.14em + 32px)" };

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

let server, serverRechner, browser;
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));

async function warteAufServer(basis) {
  const frist = Date.now() + 120000;
  for (;;) {
    try { const r = await fetch(`${basis}/`); if (r.ok) return; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error(`Vite-Dev-Server ${basis} nicht gestartet`);
    await kurz(250);
  }
}

async function starteRechner() {
  if (serverRechner) return;
  serverRechner = spawn("npx", ["vite", "--config", "vite.preisrechner.config.js", "--host", "127.0.0.1", "--port", String(PORT_RECHNER), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  await warteAufServer(BASE_RECHNER);
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore", ...DEV_SERVER_SPAWN });
  await warteAufServer(BASE);
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
  if (serverRechner) stopDevServer(serverRechner, "SIGKILL");
});

async function oeffne(seite, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: DPR, locale: "de-DE", timezoneId: "Europe/Berlin",
    colorScheme: "light", reducedMotion: "reduce" });
  if (seite.rechner) await ohneDemoHinweis(ctx);
  if (seite.admin) await ctx.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
  await ctx.route(`${API}/**`, (route) => {
    const pfad = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (seite.admin && pfad.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (pfad === "/api/public/price-quote/prepare") return json({ available: true });
    if (pfad === "/api/public/launch-scope") return json({ countries: ["DE", "AT"], destinationCountries: ["DE", "AT"], originCountries: ["DE"] });
    return json({});
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.goto(`${seite.basis}${seite.pfad}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(seite.titel, { state: "visible", timeout: 60000 });
  return { ctx, page, fehler };
}

/** Wartet, bis keine endliche Animation mehr läuft, dann zwei Bilder. */
async function ruhe(page) {
  await page.evaluate(() => new Promise((fertig) => {
    const frist = performance.now() + 5000;
    const pruefe = () => {
      const laufend = document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming().endTime !== Infinity);
      if (!laufend.length || performance.now() > frist) requestAnimationFrame(() => requestAnimationFrame(fertig));
      else setTimeout(pruefe, 50);
    };
    pruefe();
  }));
}

/** Markiert den ersten sichtbaren Titel, setzt den Prüftext und holt ihn in die Mitte des Fensters. Seiten mit statischem
 *  Gerüst (Anmeldung) ersetzen es beim Start von React — gemessen wird erst der Titel, den React gezeichnet hat. */
async function bereiteTitel(page, auswahl, statisch) {
  if (!statisch) {
    await page.waitForFunction((a) => {
      const el = [...document.querySelectorAll(a)].find((e) => e.getClientRects().length);
      return Boolean(el) && Object.keys(el).some((k) => k.startsWith("__reactFiber$"));
    }, auswahl, { timeout: 60000 });
  }
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => { /* Ruhe ist hier nur ein Komfort */ });
  const gefunden = await page.evaluate(([auswahl, text]) => {
    const el = [...document.querySelectorAll(auswahl)].find((e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden");
    if (!el) return false;
    el.setAttribute("data-e2e-titel", "");
    el.dataset.e2eStil = el.getAttribute("style") ?? "";
    el.textContent = text;
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    return true;
  }, [auswahl, PRUEFTEXT]);
  assert.ok(gefunden, `kein sichtbarer Titel ${auswahl}`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await ruhe(page);
}

async function setzeStil(page, werte) {
  await page.evaluate((werte) => {
    const el = document.querySelector("[data-e2e-titel]");
    if (el.dataset.e2eStil) el.setAttribute("style", el.dataset.e2eStil); else el.removeAttribute("style");
    el.style.setProperty("transition", "none", "important");
    for (const [k, v] of Object.entries(werte)) el.style.setProperty(k, v, "important");
  }, werte);
  await ruhe(page);
}

/** Geometrie und berechnete Werte des markierten Titels; Lagen in Dokumentkoordinaten, `fenster` im Fenster. */
const messe = (page) => page.evaluate(() => {
  const el = document.querySelector("[data-e2e-titel]");
  const cs = getComputedStyle(el);
  const px = (v) => parseFloat(v);
  const r = el.getBoundingClientRect();
  const bereich = document.createRange();
  bereich.selectNodeContents(el);
  const t = bereich.getBoundingClientRect();
  // Das folgende Element im Fluss: nächstes sichtbares Geschwister, sonst das eines Vorfahren.
  let folgend = null;
  for (let n = el; n && n !== document.body && !folgend; n = n.parentElement) {
    for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
      const scs = getComputedStyle(s);
      if (scs.display === "none" || scs.position === "absolute" || scs.position === "fixed" || !s.getClientRects().length) continue;
      folgend = s;
      break;
    }
  }
  const f = folgend && folgend.getBoundingClientRect();
  const inhaltOben = r.top + px(cs.borderTopWidth) + px(cs.paddingTop);
  const inhaltUnten = r.bottom - px(cs.borderBottomWidth) - px(cs.paddingBottom);
  return {
    fs: px(cs.fontSize), lh: px(cs.lineHeight),
    pt: px(cs.paddingTop), pb: px(cs.paddingBottom), mt: px(cs.marginTop), mb: px(cs.marginBottom),
    polster: px(cs.getPropertyValue("--titel-polster-oben")) || 0,
    bild: cs.backgroundImage, fuellung: cs.webkitTextFillColor,
    kanteOben: cs.getPropertyValue("--titel-kante-oben").trim().toLowerCase(),
    lage: {
      textX: t.left + scrollX, textY: t.top + scrollY, textB: t.width, textH: t.height,
      inhaltOben: inhaltOben + scrollY, inhaltUnten: inhaltUnten + scrollY,
      folgendX: f ? f.left + scrollX : null, folgendY: f ? f.top + scrollY : null,
    },
    folgend: folgend ? `${folgend.tagName.toLowerCase()}${[...folgend.classList].map((k) => `.${k}`).join("")}` : null,
    fenster: { boxOben: r.top, boxUnten: r.bottom, inhaltOben, inhaltUnten, textLinks: t.left, textRechts: t.right, vw: innerWidth, vh: innerHeight },
  };
});

/** Ausschnitt um den Text (Fensterkoordinaten, ganze CSS-Pixel): seitlich 12 px, oben und unten 0,6 em über die Zeile. */
function ausschnitt(m) {
  const rand = Math.max(12, Math.ceil(0.6 * m.fs));
  const x = Math.max(0, Math.floor(m.fenster.textLinks - 12));
  const y = Math.max(0, Math.floor(m.fenster.inhaltOben - rand));
  const x1 = Math.min(m.fenster.vw, Math.ceil(m.fenster.textRechts + 12));
  const y1 = Math.min(m.fenster.vh, Math.ceil(m.fenster.inhaltUnten + rand));
  return { x, y, width: x1 - x, height: y1 - y };
}

async function foto(page, clip, werte) {
  await setzeStil(page, werte);
  return dekodierePng(await page.screenshot({ clip, animations: "disabled" }));
}

/** Gesetzte Pixel einer Maske nach Lage zur Inhaltsbox (Gerätepixel). Außen zählt eine Zeile nur, wenn sie ganz
 *  außerhalb liegt; die angeschnittene Randzeile zählt innen. */
function nachLage(maske, w, grenzen) {
  const z = { oben: 0, innen: 0, unten: 0 };
  for (let i = 0; i < maske.length; i++) {
    if (!maske[i]) continue;
    const y = Math.floor(i / w);
    z[y + 1 <= grenzen.oben ? "oben" : y >= grenzen.unten ? "unten" : "innen"]++;
  }
  return z;
}

const summe = (z) => z.oben + z.innen + z.unten;
const nah = (a, b, toleranz) => Math.abs(a - b) <= toleranz;

for (const seite of SEITEN) {
  test(`${seite.name} (${seite.material}): Malrand malt den Prüftext vollständig, layoutneutral, Werte nach Vertrag`, async (t) => {
    if (seite.rechner) await starteRechner();
    let gegenproben = 0;
    for (const viewport of VIEWPORTS) {
      const fall = `${seite.id}/${viewport.width}`;
      const { ctx, page, fehler } = await oeffne(seite, viewport);
      try {
        await bereiteTitel(page, seite.titel, seite.statisch);
        await setzeStil(page, {});
        const mit = await messe(page);

        // 3. Werte und Material
        const malrand = MALRAND_EM * mit.fs;
        assert.ok(nah(mit.pt, malrand + mit.polster, 0.02), `${fall}: Innenabstand oben ${mit.pt} statt ${malrand + mit.polster}`);
        assert.ok(nah(mit.pb, malrand, 0.02), `${fall}: Innenabstand unten ${mit.pb} statt ${malrand}`);
        assert.ok(nah(mit.mt, -malrand, 0.02), `${fall}: Außenabstand oben ${mit.mt} statt ${-malrand}`);
        assert.ok(nah(mit.mb, -malrand, 0.02), `${fall}: Außenabstand unten ${mit.mb} statt ${-malrand}`);
        const kanteErwartet = await page.evaluate((m) => getComputedStyle(document.documentElement)
          .getPropertyValue(`--ce-titel-${m}-kante-oben`).trim().toLowerCase(), seite.material);
        assert.ok(kanteErwartet, `${fall}: Token --ce-titel-${seite.material}-kante-oben fehlt`);
        assert.equal(mit.kanteOben, kanteErwartet, `${fall}: Titel trägt nicht das Material ${seite.material}`);
        assert.equal((mit.bild.match(/linear-gradient\(/g) || []).length >= 2, true, `${fall}: Randband und Füllung fehlen: ${mit.bild}`);
        assert.equal(mit.fuellung, "rgba(0, 0, 0, 0)", `${fall}: Schriftfüllung nicht durchsichtig`);

        // 2. Layoutneutralität
        await setzeStil(page, OHNE_MALRAND);
        const ohne = await messe(page);
        assert.ok(nah(mit.pt - ohne.pt, malrand, 0.02), `${fall}: Malrand ließ sich für den Vergleich nicht abschalten`);
        for (const [k, v] of Object.entries(mit.lage)) {
          if (v === null) continue;
          assert.ok(nah(v, ohne.lage[k], TOLERANZ_PX), `${fall}: ${k} verschiebt sich um ${(v - ohne.lage[k]).toFixed(3)} px (folgend: ${mit.folgend})`);
        }

        // 1. Vollständigkeit
        const clip = ausschnitt(mit);
        const leer = await foto(page, clip, LEER);
        const unbegrenzt = await foto(page, clip, { ...MATERIAL, ...UNBEGRENZT });
        const material = await foto(page, clip, MATERIAL);
        const ohneMalrand = await foto(page, clip, { ...MATERIAL, ...OHNE_MALRAND });
        await setzeStil(page, {});
        const grenzen = { oben: (mit.fenster.inhaltOben - clip.y) * DPR, unten: (mit.fenster.inhaltUnten - clip.y) * DPR };
        const tinte = nachLage(tintenmaske(unbegrenzt, leer, ABWEICHUNG), leer.w, grenzen);
        const ausserhalb = tinte.oben + tinte.unten;
        const fehlt = nachLage(tintenmaske(material, unbegrenzt, ABWEICHUNG), leer.w, grenzen);
        const fehltOhne = nachLage(tintenmaske(ohneMalrand, unbegrenzt, ABWEICHUNG), leer.w, grenzen);
        t.diagnostic(`${fall}: ${mit.fs}px/${(mit.lh / mit.fs).toFixed(3)}, Tinte außerhalb der Zeile ${ausserhalb}, abweichend ${JSON.stringify(fehlt)}, ohne Malrand ${JSON.stringify(fehltOhne)}, folgend ${mit.folgend}${fehler.length ? `, Seitenfehler ${fehler.length}` : ""}`);
        if (ausserhalb > 0) {
          assert.ok(fehltOhne.oben + fehltOhne.unten > 0, `${fall}: Gegenprobe ohne Malrand findet keine Lücke — die Messung greift nicht`);
          gegenproben++;
        }
        assert.equal(summe(fehlt), 0,
          `${fall}: Material mit Malrand weicht in ${summe(fehlt)} Gerätepixeln von der unbegrenzten Malfläche ab (${JSON.stringify(fehlt)})`);
      } finally {
        await ctx.close();
      }
    }
    // Mindestens eine Breite je Seite, in der der Prüftext aus der Zeile ragt: Dort war ohne Malrand etwas abgeschnitten.
    assert.ok(gegenproben > 0, `${seite.id}: In keiner Breite ragt der Prüftext aus der Zeile — die Seite prüft den Malrand nicht`);
  });
}
