// Sichtprüfung „Versandpreise optimieren“ (Admin-Kundendetail, eine Tarifübersicht seit 2026-11-17): Standbilder der
// Karte bei 1440/1280/768/390 px und 200 % Zoom gegen den Dev-Server mit DEMSELBEN gemockten Backend wie die E2E-Suite
// (helpers/tariffMarkupsMock.mjs — synthetische Werte, keine Produktivdaten, keine echten Kundenkonten). Dazu je Breite:
// Querüberlauf je Zustand, kleine Ziele (unter 24 px; mobil unter 44 px Höhe), Konsolenfehler und — mit --axe — axe-core
// (WCAG 2 A/AA) über Karte und Dialog. Headless, ohne Fenster (DEV_SERVER_SPAWN), ein Browserprozess, Viewports nacheinander.
//
//   node tests/e2e/helpers/tariffMarkupsCapture.mjs --out <ordner> [--port 5773] [--axe <pfad/zu/axe.min.js>]
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { DEV_SERVER_SPAWN, stopDevServer } from "./devServer.mjs";
import { createTariffMock } from "./tariffMarkupsMock.mjs";

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const OUT = path.resolve(arg("--out", ".visual-qa/versandpreise"));
const PORT = Number(arg("--port", "5773"));
const AXE = arg("--axe", null);
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });
if (AXE && !existsSync(AXE)) throw new Error(`axe-core nicht gefunden: ${AXE}`);

const KARTE = "#adm-tariff-section";
// [Name, Viewport, Pixeldichte, Zustände mit Bild ("alle" = jeder Zustand)]. 200 % Zoom auf einem 1280er Fenster
// = 640 CSS-Pixel bei doppelter Pixeldichte. 360 px nur als Messung (Überlauf, kleine Ziele).
const BREITEN = [
  ["desktop-1280", { width: 1280, height: 1000 }, 1, "alle"],
  ["desktop-1440", { width: 1440, height: 1000 }, 1, ["2-verglichen", "3-tarif-ups-standard", "4-uebernommen"]],
  ["tablet-768", { width: 768, height: 1024 }, 1, ["2-verglichen", "3-tarif-ups-standard", "4-uebernommen"]],
  ["mobil-390", { width: 390, height: 844 }, 1, ["2-verglichen", "3-tarif-ups-standard", "4-uebernommen", "5-details", "6-dialog", "7-gespeichert-verlauf", "8-formfehler", "11-kandidaten", "13-kein-vergleich"]],
  ["zoom-200", { width: 640, height: 500 }, 2, ["2-verglichen", "3-tarif-ups-standard", "4-uebernommen", "5-details", "6-dialog"]],
  ["mobil-360", { width: 360, height: 780 }, 1, []],
];
const KOPF_BIS_LISTE = [`${KARTE} > summary`, `${KARTE} .adm-po-compare`, `${KARTE} .adm-po-tariffs--main`, "#adm-po-more"];
const OFFENER_TARIF = [`${KARTE} li.adm-po-tarif.is-open`];

const server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
const bericht = { out: OUT, synthetisch: true, bilder: [], breiten: {} };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const frist = Date.now() + 90000;
  for (;;) { try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* warten */ } if (Date.now() > frist) throw new Error("Dev-Server nicht gestartet"); await pause(250); }
  const browser = await chromium.launch();
  for (const [name, viewport, dpr, bildZustaende] of BREITEN) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: dpr, timezoneId: "Europe/Berlin", locale: "de-DE", colorScheme: "light", bypassCSP: true });
    const mock = createTariffMock();
    await page.route("**/api.confidaraexpress.de/**", (route) => mock.handle(route));
    await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-admin-token"));
    const konsole = [];
    page.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
    page.on("pageerror", (e) => konsole.push(`pageerror: ${e.message}`));
    const messung = { ueberlauf: {}, kleineZiele: {}, axe: {}, konsole };
    const mitBild = (z) => bildZustaende === "alle" || bildZustaende.includes(z);

    // Bild eines Bereichs (Vereinigung mehrerer Elemente, Seitenkoordinaten) und Messung des Zustands.
    const zustand = async (z, selektoren, { viewportBild = false } = {}) => {
      await pause(350);
      messung.ueberlauf[z] = await page.evaluate(() => ({ seite: document.documentElement.scrollWidth, fenster: document.documentElement.clientWidth }));
      messung.kleineZiele[z] = await page.evaluate(({ karte, mobil }) => {
        const wurzeln = [document.querySelector(karte), document.querySelector('[role="dialog"]')].filter(Boolean);
        const ziele = wurzeln.flatMap((w) => [...w.querySelectorAll("button, input, select, summary, a[href], label.adm-po-radio, label.adm-po-cand")]);
        return ziele.filter((el) => {
          const ueberLabel = el.matches("input[type=radio], input[type=checkbox]") && el.closest("label");
          const b = (ueberLabel || el).getBoundingClientRect();
          return b.width > 0 && b.height > 0 && (b.height < 24 || b.width < 24 || (mobil && (ueberLabel || el.tagName !== "INPUT") && b.height < 44));
        })
          .map((el) => `${el.id || el.className || el.tagName} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
      }, { karte: KARTE, mobil: viewport.width < 768 });
      if (!mitBild(z)) return;
      const datei = path.join(OUT, `${name}-${z}.png`);
      if (viewportBild) { await page.screenshot({ path: datei }); }
      else {
        const clip = await page.evaluate((sels) => {
          const rs = sels.map((s) => document.querySelector(s)).filter(Boolean).map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
          if (rs.length === 0) return null;
          const x = Math.max(0, Math.min(...rs.map((r) => r.left)) + window.scrollX - 8);
          const y = Math.max(0, Math.min(...rs.map((r) => r.top)) + window.scrollY - 8);
          const rechts = Math.min(document.documentElement.scrollWidth, Math.max(...rs.map((r) => r.right)) + window.scrollX + 8);
          const unten = Math.max(...rs.map((r) => r.bottom)) + window.scrollY + 8;
          return { x, y, width: rechts - x, height: unten - y };
        }, selektoren);
        if (!clip) throw new Error(`${name}/${z}: kein Bereich gefunden`);
        await page.screenshot({ path: datei, clip, fullPage: true });
      }
      bericht.bilder.push(path.basename(datei));
    };
    const axe = async (z, include) => {
      if (!AXE) return;
      if (!(await page.evaluate(() => typeof window.axe !== "undefined"))) await page.addScriptTag({ path: AXE });
      messung.axe[z] = await page.evaluate(async (inc) => {
        const r = await window.axe.run({ include: inc }, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
        return { verstoesse: r.violations.map((v) => ({ id: v.id, impact: v.impact, knoten: v.nodes.length, ziele: v.nodes.slice(0, 4).map((n) => n.target.join(" ")), hilfe: v.help })), bestanden: r.passes.length, unvollstaendig: r.incomplete.map((v) => v.id) };
      }, include);
    };
    const kopf = (id) => page.locator(`#adm-po-head-${id}`);
    const reiter = (id, wc) => page.locator(`#adm-po-tab-${id}-${wc}`);
    const spalte = (id, provider) => page.locator(`#adm-po-tabpanel-${id} section.adm-po-col[data-provider="${provider}"]`);
    const oeffneBereich = async (id) => {
      if ((await kopf(id).getAttribute("aria-expanded")) !== "true") await kopf(id).click();
    };

    await page.goto(`${BASE}/admin/users/7`, { waitUntil: "domcontentloaded" });
    const karte = page.locator(KARTE);
    await karte.locator(":scope > summary").waitFor({ timeout: 30000 });
    if (!(await karte.evaluate((d) => d.open))) await karte.locator(":scope > summary").click();
    await kopf("transglobal-22").waitFor({ timeout: 30000 });
    await zustand("1-geoeffnet", KOPF_BIS_LISTE);

    await page.locator("#adm-tarif-refresh").click();
    await karte.locator(".adm-tarif-stand", { hasText: "Stand:" }).waitFor({ timeout: 10000 });
    await zustand("2-verglichen", KOPF_BIS_LISTE);
    await axe("2-verglichen", [[KARTE]]);

    await oeffneBereich("transglobal-22");
    await zustand("3-tarif-ups-standard", OFFENER_TARIF);

    // UPS Express Saver: „Empfehlung übernehmen“ für Transglobal (Über 20 kg, Bis 5 kg) — füllt nur die Felder, gespeichert
    // wird erst nach dem Dialog. JUMiNGO (Bis 5 kg) hat keinen sicheren Spielraum, also keine Empfehlung: dort 0 % über
    // „Selbst festlegen“ — ein gewöhnlicher Satz (keine Untergrenze, v2.142) mit dem Hinweis „Kein Verdienst“.
    await oeffneBereich("transglobal-23");
    await reiter("transglobal-23", 4).click();
    await spalte("transglobal-23", "transglobal").locator(".adm-po-adopt").click();
    await reiter("transglobal-23", 1).click();
    await spalte("transglobal-23", "transglobal").locator(".adm-po-adopt").click();
    await spalte("transglobal-23", "jumingo").locator(".adm-po-custom").click();
    await page.locator("#adm-tarif-input-jumingo-2-1").fill("0");
    await spalte("transglobal-23", "jumingo").locator(".adm-po-figure-new").first().waitFor({ timeout: 5000 });
    await zustand("4-uebernommen", OFFENER_TARIF);
    await axe("4-uebernommen", [[KARTE]]);

    if (name === "desktop-1280") {
      // Hover und Fokus: Tarifkopf (Maus), Reiter, „Empfehlung übernehmen“ und „Änderungen prüfen“ (Tastatur).
      await kopf("transglobal-29").hover();
      await pause(250);
      await kopf("transglobal-29").screenshot({ path: path.join(OUT, `${name}-hover-tarifkopf.png`) });
      bericht.bilder.push(`${name}-hover-tarifkopf.png`);
      await page.mouse.move(0, 0);
      await reiter("transglobal-23", 4).focus();
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await pause(200);
      await page.locator('#adm-po-panel-transglobal-23 [role="tablist"]').screenshot({ path: path.join(OUT, `${name}-fokus-reiter.png`) });
      bericht.bilder.push(`${name}-fokus-reiter.png`);
      await page.keyboard.press("Tab");
      await pause(200);
      await spalte("transglobal-23", "transglobal").locator(".adm-po-actions").screenshot({ path: path.join(OUT, `${name}-fokus-uebernehmen.png`) });
      bericht.bilder.push(`${name}-fokus-uebernehmen.png`);
      await page.locator("#adm-tarif-discard").focus();
      await page.keyboard.press("Tab");
      await pause(200);
      await page.locator(`${KARTE} .adm-tarif-savebar`).screenshot({ path: path.join(OUT, `${name}-fokus-speichern.png`) });
      bericht.bilder.push(`${name}-fokus-speichern.png`);
      await reiter("transglobal-23", 1).click();
    }
    // Details der Klasse „Bis 5 kg“: Beispielpaket, Bedingungen, Einkauf, Vergleich, Einkaufsvorteil, Datenbasis.
    await page.locator("#adm-po-details-transglobal-23 > summary").click();
    await zustand("5-details", ["#adm-po-tabpanel-transglobal-23"]);

    await page.locator("#adm-tarif-save").click();
    await page.getByRole("dialog").waitFor();
    await zustand("6-dialog", [], { viewportBild: true });
    await axe("6-dialog", [['[role="dialog"]']]);
    await page.locator("#adm-tarif-confirm").click();
    await karte.locator(".alert-success").waitFor({ timeout: 5000 });
    await page.locator("#adm-po-history > summary").click();
    await page.locator("#adm-po-history li.adm-po-history-item").first().waitFor({ timeout: 5000 });
    await zustand("7-gespeichert-verlauf", [`${KARTE} .adm-po-save`, "#adm-po-history"]);

    // „Alle Gewichte“ über die eigene Zeile ändern — gesperrt sind nur Formfehler (hier über 100 %), keine Untergrenze.
    await oeffneBereich("transglobal-22");
    await spalte("transglobal-22", "transglobal").locator(".adm-po-all-change").click();
    await page.locator("#adm-tarif-input-transglobal-22-0").fill("100,01");
    await page.keyboard.press("Tab");
    await page.locator("#adm-tarif-input-transglobal-22-0-error").waitFor({ timeout: 5000 });
    await zustand("8-formfehler", [`#adm-po-tabpanel-transglobal-22 section.adm-po-col[data-provider="transglobal"] .adm-po-all`, `${KARTE} .adm-po-save`]);
    // Ein ungültiger Wert ist keine speicherbare Änderung (kein „Verwerfen“): den gespeicherten Wert wieder eintragen.
    await page.locator("#adm-tarif-input-transglobal-22-0").fill("0");
    await page.keyboard.press("Tab");

    mock.state.refreshStatus = 429;
    await page.locator("#adm-tarif-refresh").click();
    await karte.locator('.adm-po-compare [role="alert"]').waitFor({ timeout: 5000 });
    await zustand("9-abruf-limit", [`${KARTE} .adm-po-compare`]);
    mock.state.refreshStatus = null;
    mock.state.verzoegerungMs = 2500;
    await page.locator("#adm-tarif-refresh").click();
    await page.locator('#adm-tarif-refresh[aria-busy="true"]').waitFor({ timeout: 3000 });
    await zustand("10-laden", [`${KARTE} .adm-po-compare`]);
    await karte.locator(".adm-tarif-stand", { hasText: "Stand:" }).waitFor({ timeout: 15000 });
    mock.state.verzoegerungMs = 0;

    // Zuordnung und Zustände: mehrere JUMiNGO-Kandidaten (ähnlicher Tarif), JUMiNGO kauft günstiger ein,
    // kein direkter Vergleich (Abruffehler), weitere JUMiNGO-Tarife.
    await oeffneBereich("transglobal-84");
    await reiter("transglobal-84", 1).click();
    await spalte("transglobal-84", "jumingo").locator('input[value="jumingo:8"]').check();
    await zustand("11-kandidaten", OFFENER_TARIF);
    await spalte("transglobal-84", "jumingo").locator('input[value="jumingo:4"]').check();
    await oeffneBereich("transglobal-85");
    await reiter("transglobal-85", 1).click();
    await zustand("12-jumingo-guenstiger", OFFENER_TARIF);
    await oeffneBereich("transglobal-86");
    await reiter("transglobal-86", 3).click();
    await zustand("13-kein-vergleich", OFFENER_TARIF);
    await reiter("transglobal-86", 1).click();
    if (!(await page.locator("#adm-po-more").evaluate((d) => d.open))) await page.locator("#adm-po-more > summary").click();
    await oeffneBereich("jumingo-9");
    await zustand("14-weitere-jumingo", ["#adm-po-more"]);
    await axe("14-weitere-jumingo", [[KARTE]]);

    messung.netz = { refreshes: mock.state.refreshes.length, previews: mock.state.previews.length, puts: mock.state.puts.length, audits: mock.state.audits.length };
    bericht.breiten[name] = messung;
    await page.close();
  }
  await browser.close();
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(bericht, null, 2));
  console.log(JSON.stringify({ bilder: bericht.bilder.length, breiten: Object.fromEntries(Object.entries(bericht.breiten).map(([n, m]) => [n, {
    ueberlauf: Object.entries(m.ueberlauf).filter(([, v]) => v.seite > v.fenster).map(([z, v]) => `${z} ${v.seite}>${v.fenster}`),
    kleineZiele: [...new Set(Object.values(m.kleineZiele).flat())],
    axe: Object.fromEntries(Object.entries(m.axe).map(([z, a]) => [z, a.verstoesse.map((v) => `${v.id}(${v.impact}, ${v.knoten})`)])),
    konsole: m.konsole.slice(0, 5), netz: m.netz,
  }])) }, null, 2));
} finally {
  stopDevServer(server, "SIGKILL");
}
