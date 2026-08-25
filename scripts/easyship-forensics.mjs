#!/usr/bin/env node
/* ── Easyship Design-Forensik ─────────────────────────────────────────────────
   Einmalwerkzeug für den Design-Audit. Es gehört NICHT zum Produkt: es wird
   nicht gebündelt, nicht importiert, nicht von `npm test` oder `npm run test:e2e`
   gefunden (kein `.test.mjs`) und ändert keine einzige Zeile ConfidaraExpress.

   ── Warum es dieses Skript gibt ────────────────────────────────────────────
   Der Design-Audit konnte die Easyship-Schrift nicht verifizieren, weil die
   Cloud-Session easyship.com per Egress-Policy blockiert (403 auf CONNECT).
   Dieses Skript führt genau die Messung durch, die dort unmöglich war — auf
   einem Rechner mit normalem Netzzugang.

   ── Was gemessen wird: DREI unabhängige Beweiswege für die Schrift ─────────
     1. COMPUTED STYLE  — was die Seite anfordert (`font-family`-Stack)
     2. @font-face + document.fonts + Netzwerk — was tatsächlich GELADEN wurde
     3. CDP `CSS.getPlatformFontsForNode` — was der Renderer tatsächlich
        GEZEICHNET hat, inklusive Glyphenzahl je Familie

   Weg 3 ist der entscheidende: ein `font-family`-Stack sagt nur, was gewünscht
   ist. Erst die Platform-Font-Abfrage sagt, welche Datei die Glyphen wirklich
   gestellt hat. Stimmen alle drei überein, ist die Schrift bewiesen.
   Zusätzlich werden die Fontdateien heruntergeladen — damit lassen sich
   Achsen, Gewichte und OpenType-Features (z. B. `tnum`) später offline prüfen.

   ── Sicherheit: das Skript ist LESEND ──────────────────────────────────────
   Es klickt nichts, tippt nichts, sendet kein Formular ab und löst keine
   Bestellung aus. Es navigiert ausschließlich zu URLs, die unten im Klartext
   stehen, und liest danach das DOM. Jede Interaktion im App-Bereich machen
   SIE selbst im sichtbaren Browserfenster.

   ── Aufruf ────────────────────────────────────────────────────────────────
     node scripts/easyship-forensics.mjs

   Ergebnis: easyship-forensics/<Zeitstempel>/ mit BERICHT.md, raw.json,
   Screenshots und den heruntergeladenen Fontdateien.
   ────────────────────────────────────────────────────────────────────────── */

import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STEMPEL = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const AUSGABE = path.join(WURZEL, "easyship-forensics", STEMPEL);
const PROFIL = path.join(WURZEL, "easyship-forensics", ".browser-profile");

// Öffentliche Marketingseiten — reine GET-Navigation, kein Login nötig.
const MARKETING = [
  { id: "marketing-home", url: "https://www.easyship.com/" },
  { id: "marketing-pricing", url: "https://www.easyship.com/pricing" },
];
const APP_START = "https://app.easyship.com/";

// Playwright dynamisch laden: ohne node_modules soll eine verständliche
// Anweisung erscheinen und kein MODULE_NOT_FOUND-Stacktrace.
let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.error("\n  Playwright ist nicht installiert.\n" +
                "  Bitte einmalig im Projektordner ausführen:\n\n" +
                "      npm install\n");
  process.exit(1);
}

const frage = (text) => new Promise((auf) => {
  if (!process.stdin.isTTY) { console.log(text + "(kein Terminal — überspringe)"); return auf("q"); }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on("close", () => auf("q"));            // sonst hängt der Lauf stumm, wenn stdin endet
  rl.question(text, (a) => { rl.close(); auf(a.trim()); });
});
const linie = (z = "─") => console.log(z.repeat(74));
const banner = (titel, zeilen = []) => {
  console.log(""); linie("═"); console.log("  " + titel); linie("═");
  for (const z of zeilen) console.log("  " + z);
  console.log("");
};

/* ── Erhebung im Seitenkontext ──────────────────────────────────────────────
   Läuft im Browser, nicht in Node. Fasst nichts an, liest nur. */
function erhebe() {
  const sichtbar = (el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  };
  const bezeichne = (el) => {
    let d = el.tagName.toLowerCase();
    if (el.id) d += "#" + el.id;
    const c = typeof el.className === "string" ? el.className.trim() : "";
    if (c) d += "." + c.split(/\s+/).slice(0, 3).join(".");
    return d.slice(0, 120);
  };

  // 1 — @font-face aus allen LESBAREN Stylesheets (fremde Origins werfen).
  const fontFaces = []; const unlesbar = [];
  for (const ss of document.styleSheets) {
    let regeln; try { regeln = ss.cssRules; } catch { unlesbar.push(ss.href || "(inline)"); continue; }
    const lauf = (rs) => { for (const r of rs) {
      if (r.type === 5) fontFaces.push({
        family: r.style.fontFamily, weight: r.style.fontWeight, style: r.style.fontStyle,
        display: r.style.fontDisplay, unicodeRange: r.style.unicodeRange,
        src: (r.style.src || "").slice(0, 500), stylesheet: ss.href || "(inline)",
      });
      if (r.cssRules) { try { lauf(r.cssRules); } catch { /* verschachtelt, egal */ } }
    }};
    try { lauf(regeln); } catch { /* ignorieren */ }
  }

  // 2 — Tatsächlich geladene FontFace-Objekte.
  let geladeneFonts = [];
  try {
    geladeneFonts = [...document.fonts].map((f) => ({
      family: f.family, weight: f.weight, style: f.style, stretch: f.stretch,
      status: f.status, unicodeRange: (f.unicodeRange || "").slice(0, 60),
    }));
  } catch { geladeneFonts = [{ error: "document.fonts nicht lesbar" }]; }

  // 3 — Custom Properties auf :root/html/body.
  const rootProps = {};
  for (const ss of document.styleSheets) {
    let regeln; try { regeln = ss.cssRules; } catch { continue; }
    const lauf = (rs) => { for (const r of rs) {
      if (r.type === 1 && /(^|,)\s*(:root|html|body)\s*(,|$)/.test(r.selectorText || "")) {
        for (const p of r.style) if (p.startsWith("--")) rootProps[p] = r.style.getPropertyValue(p).trim();
      }
      if (r.cssRules) { try { lauf(r.cssRules); } catch { /* egal */ } }
    }};
    try { lauf(regeln); } catch { /* egal */ }
  }

  // 4 — Typografie-, Farb- und Materialinventar über sichtbare Elemente.
  const gesehen = new Set(); const proben = [];
  const farben = {}; const radien = {}; const schatten = {}; const abstaende = {};
  const zaehle = (o, k) => { if (k && k !== "none" && k !== "0px" && k !== "rgba(0, 0, 0, 0)") o[k] = (o[k] || 0) + 1; };

  for (const el of document.querySelectorAll("body *")) {
    if (!sichtbar(el)) continue;
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    zaehle(farben, s.color); zaehle(farben, s.backgroundColor);
    zaehle(radien, s.borderRadius); zaehle(schatten, s.boxShadow.slice(0, 90));
    zaehle(abstaende, s.padding); zaehle(abstaende, s.gap);

    const tag = el.tagName.toLowerCase();
    const relevant = ["h1","h2","h3","h4","h5","h6","p","a","button","input","select","textarea",
                      "label","th","td","li","span","div","small","strong","em"].includes(tag);
    if (!relevant || proben.length > 900) continue;
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (!txt && !["input","select","textarea","button"].includes(tag)) continue;

    const key = [tag, s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing, s.color, s.textTransform].join("|");
    if (gesehen.has(key)) continue; gesehen.add(key);
    proben.push({
      el: bezeichne(el), tag, text: txt.slice(0, 50),
      fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight,
      lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, textTransform: s.textTransform,
      color: s.color, background: s.backgroundColor,
      border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      borderRadius: s.borderRadius, padding: s.padding, boxShadow: s.boxShadow.slice(0, 90),
      height: Math.round(r.height), width: Math.round(r.width),
    });
  }

  const html = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  const top = (o, n = 25) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n));

  return {
    url: location.href, title: document.title, viewport: { w: innerWidth, h: innerHeight },
    basis: {
      htmlFontFamily: html.fontFamily, htmlFontSize: html.fontSize, htmlBackground: html.backgroundColor,
      bodyFontFamily: body.fontFamily, bodyFontSize: body.fontSize, bodyFontWeight: body.fontWeight,
      bodyLineHeight: body.lineHeight, bodyColor: body.color, bodyBackground: body.backgroundColor,
    },
    fontFaces, geladeneFonts, unlesbareStylesheets: unlesbar,
    stylesheets: [...document.styleSheets].map((s) => s.href).filter(Boolean),
    rootCustomProperties: rootProps,
    proben,
    inventar: { farben: top(farben, 40), radien: top(radien), schatten: top(schatten), abstaende: top(abstaende, 30) },
  };
}

/* ── Weg 3: was der Renderer WIRKLICH gezeichnet hat (CDP) ────────────────── */
async function plattformSchriften(cdp, selektoren) {
  const out = [];
  try {
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
    for (const sel of selektoren) {
      try {
        const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
        if (!nodeId) continue;
        const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
        if (fonts?.length) out.push({
          selektor: sel,
          gerendert: fonts.map((f) => ({ familyName: f.familyName, postScriptName: f.postScriptName,
                                         isCustomFont: f.isCustomFont, glyphCount: f.glyphCount })),
        });
      } catch { /* Selektor nicht vorhanden — überspringen */ }
    }
  } catch (e) { out.push({ fehler: String(e).slice(0, 200) }); }
  return out;
}

const SELEKTOREN = ["body","h1","h2","h3","p","a","button","input","label","th","td",
                    "nav a","[class*=price]","[class*=btn]","[class*=table] td","li"];

/* ── Eine Seite vollständig vermessen ──────────────────────────────────────── */
let netzMarke = 0;                       // wie viele Fontrequests bereits zugeordnet sind

async function vermesse(ctx, page, id, netz) {
  await page.waitForTimeout(1200);
  try { await page.evaluate(() => document.fonts.ready); } catch { /* egal */ }
  await page.waitForTimeout(400);

  const daten = await page.evaluate(erhebe);
  const cdp = await ctx.newCDPSession(page);
  daten.plattformSchriften = await plattformSchriften(cdp, SELEKTOREN);
  await cdp.detach().catch(() => {});
  // Zuwachs seit der letzten Messung — die Requests entstehen WÄHREND der
  // Navigation, nicht währenddessen hier gemessen wird.
  daten.netzwerkFonts = netz.slice(netzMarke).map((n) => ({ ...n }));
  netzMarke = netz.length;
  daten.id = id;

  const shot = path.join(AUSGABE, `${id}.png`);
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
  console.log(`   ✓ ${id.padEnd(24)} ${daten.proben.length} Typo-Stile · ${daten.fontFaces.length} @font-face · ${daten.netzwerkFonts.length} Fontdateien`);
  return daten;
}

/* ── Fontdateien sichern, damit Achsen/Features offline prüfbar sind ───────── */
async function sichereFonts(ctx, seiten) {
  const urls = [...new Set(seiten.flatMap((s) => (s.netzwerkFonts || []).map((f) => f.url)))];
  if (!urls.length) return [];
  const ziel = path.join(AUSGABE, "fonts"); mkdirSync(ziel, { recursive: true });
  const gespeichert = [];
  for (const url of urls) {
    try {
      const res = await ctx.request.get(url, { timeout: 20000 });
      if (!res.ok()) continue;
      const buf = await res.body();
      const name = (url.split("/").pop() || "font").split("?")[0].slice(-80) || "font.woff2";
      writeFileSync(path.join(ziel, name), buf);
      gespeichert.push({ datei: name, bytes: buf.length, url });
    } catch { /* einzelne Datei nicht ladbar — weiter */ }
  }
  console.log(`   ✓ ${gespeichert.length} Fontdatei(en) gesichert nach easyship-forensics/${STEMPEL}/fonts/`);
  return gespeichert;
}

/* ── Auswertung: stimmen die drei Beweiswege überein? ──────────────────────── */
function urteil(seite) {
  const ersteFamilie = (stack) => (stack || "").split(",")[0].replace(/["']/g, "").trim();
  const angefordert = [...new Set(seite.proben.map((p) => ersteFamilie(p.fontFamily)).filter(Boolean))];
  const deklariert = [...new Set(seite.fontFaces.map((f) => (f.family || "").replace(/["']/g, "").trim()).filter(Boolean))];
  const geladen = [...new Set((seite.geladeneFonts || []).filter((f) => f.status === "loaded")
                    .map((f) => (f.family || "").replace(/["']/g, "").trim()).filter(Boolean))];
  const gerendert = [...new Set((seite.plattformSchriften || []).flatMap((p) => (p.gerendert || [])
                      .filter((g) => g.isCustomFont).map((g) => g.familyName)).filter(Boolean))];

  const body = ersteFamilie(seite.basis.bodyFontFamily);
  const treffer = [
    deklariert.some((d) => d.toLowerCase() === body.toLowerCase()) || geladen.some((g) => g.toLowerCase() === body.toLowerCase()),
    gerendert.length > 0,
  ];
  let confidence = "LOW", satz;
  if (treffer[0] && treffer[1]) { confidence = "HIGH";
    satz = `Body fordert „${body}" an; dieselbe Familie ist als @font-face/FontFace nachweisbar UND der Renderer meldet eine eingebettete Schrift (${gerendert.join(", ") || "—"}).`;
  } else if (treffer[0] || treffer[1]) { confidence = "MEDIUM";
    satz = `Nur EIN Beweisweg trägt. Angefordert „${body}"; deklariert/geladen: ${[...deklariert, ...geladen].join(", ") || "—"}; gerendert: ${gerendert.join(", ") || "—"}. Widerspruch prüfen.`;
  } else {
    satz = `Kein Beweisweg bestätigt eine eingebettete Schrift — vermutlich Systemschrift oder Stylesheets sind cross-origin gesperrt (${seite.unlesbareStylesheets.length} unlesbar).`;
  }
  return { bodyFamilie: body, angefordert: angefordert.slice(0, 12), deklariert, geladen, gerendert, confidence, satz };
}

/* ── Markdown-Bericht ─────────────────────────────────────────────────────── */
function bericht(seiten, fonts) {
  const z = [];
  z.push(`# Easyship — Design-Forensik`, ``, `Erhoben: ${new Date().toISOString()}`,
    `Werkzeug: \`scripts/easyship-forensics.mjs\` · Playwright + Chromium DevTools Protocol`,
    ``, `> Rein lesende Erhebung. Es wurde nichts geklickt, nichts abgesendet, nichts bestellt.`, ``);

  z.push(`## Schriftbefund je Seite`, ``);
  for (const s of seiten) {
    const u = urteil(s);
    z.push(`### ${s.id} — \`${s.url}\``, ``,
      `| Beweisweg | Ergebnis |`, `|---|---|`,
      `| 1 · Computed Style (\`body\`) | \`${s.basis.bodyFontFamily}\` |`,
      `| 1 · angeforderte Familien | ${u.angefordert.map((x) => `\`${x}\``).join(", ") || "—"} |`,
      `| 2 · \`@font-face\`-Familien | ${u.deklariert.map((x) => `\`${x}\``).join(", ") || "— (keine lesbare Regel)"} |`,
      `| 2 · geladene FontFaces | ${u.geladen.map((x) => `\`${x}\``).join(", ") || "—"} |`,
      `| 2 · Fontdateien im Netzwerk | ${s.netzwerkFonts.length} |`,
      `| 3 · **tatsächlich gerendert (CDP)** | ${u.gerendert.map((x) => `**\`${x}\`**`).join(", ") || "—"} |`,
      `| **Confidence** | **${u.confidence}** |`, ``, u.satz, ``);
    if (s.netzwerkFonts.length) {
      z.push(`<details><summary>Fontdateien (${s.netzwerkFonts.length})</summary>`, ``);
      for (const f of s.netzwerkFonts) z.push(`- \`${f.url}\` — ${f.status} · ${f.contentType || "?"} · ${f.bytes ?? "?"} B`);
      z.push(``, `</details>`, ``);
    }
    if (s.plattformSchriften?.length) {
      z.push(`<details><summary>Gerenderte Schriften je Element (CDP)</summary>`, ``, "```");
      for (const p of s.plattformSchriften)
        z.push(`${(p.selektor || "").padEnd(22)} ${(p.gerendert || []).map((g) => `${g.familyName} (${g.glyphCount} Glyphen${g.isCustomFont ? ", Webfont" : ", System"})`).join(" | ")}`);
      z.push("```", ``, `</details>`, ``);
    }
  }

  z.push(`## Typografische Skala je Seite`, ``);
  for (const s of seiten) {
    z.push(`### ${s.id}`, ``, `| Element | Familie | Größe | Gewicht | Zeilenhöhe | Laufweite | Farbe | Text |`, `|---|---|---|---|---|---|---|---|`);
    const sortiert = [...s.proben].sort((a, b) => parseFloat(b.fontSize) - parseFloat(a.fontSize)).slice(0, 45);
    for (const p of sortiert)
      z.push(`| \`${p.el}\` | ${p.fontFamily.split(",")[0].replace(/"/g, "")} | ${p.fontSize} | ${p.fontWeight} | ${p.lineHeight} | ${p.letterSpacing} | ${p.color} | ${(p.text || "").replace(/\|/g, "\\|").slice(0, 26)} |`);
    z.push(``, `**${s.proben.length} unterschiedliche Typo-Stile gemessen.**`, ``);
  }

  z.push(`## Farb-, Radius- und Abstandsinventar`, ``);
  for (const s of seiten) {
    z.push(`### ${s.id}`, ``, "```",
      `Farben (Top 20):    ${Object.entries(s.inventar.farben).slice(0, 20).map(([k, v]) => `${k} ×${v}`).join("  ")}`,
      `Radien:             ${Object.entries(s.inventar.radien).map(([k, v]) => `${k} ×${v}`).join("  ")}`,
      `Abstände (Top 15):  ${Object.entries(s.inventar.abstaende).slice(0, 15).map(([k, v]) => `${k} ×${v}`).join("  ")}`,
      `Schatten:           ${Object.entries(s.inventar.schatten).slice(0, 8).map(([k, v]) => `${k} ×${v}`).join("  |  ")}`, "```", ``);
    const cp = Object.keys(s.rootCustomProperties || {});
    if (cp.length) {
      z.push(`<details><summary>CSS Custom Properties auf \`:root\` (${cp.length})</summary>`, ``, "```");
      for (const [k, v] of Object.entries(s.rootCustomProperties)) z.push(`${k}: ${v}`);
      z.push("```", ``, `</details>`, ``);
    }
  }

  if (fonts.length) {
    z.push(`## Gesicherte Fontdateien`, ``, `Liegen unter \`fonts/\`. Achsen, Gewichtsbereiche und OpenType-Features`,
      `(insbesondere \`tnum\` für Tabellenziffern) lassen sich damit offline prüfen:`, ``, "```bash",
      `pip install fonttools brotli`,
      `python -c "from fontTools.ttLib import TTFont; import sys; f=TTFont(sys.argv[1]); n=f['name'];`,
      `print(n.getDebugName(16) or n.getDebugName(1));`,
      `print([(a.axisTag,a.minValue,a.maxValue) for a in f['fvar'].axes] if 'fvar' in f else 'statisch');`,
      `print(sorted({r.FeatureTag for r in f['GSUB'].table.FeatureList.FeatureRecord}))" fonts/DATEINAME.woff2`,
      "```", ``, `| Datei | Bytes | Quelle |`, `|---|---|---|`);
    for (const f of fonts) z.push(`| \`${f.datei}\` | ${f.bytes} | \`${f.url}\` |`);
    z.push(``);
  }

  z.push(`## Wichtige Einordnung`, ``,
    `- **Marketing-Site und App getrennt bewerten.** Beide können unterschiedliche Schriften,`,
    `  Skalen und Dichten benutzen. Die Seiten-IDs oben halten die Trennung fest.`,
    `- **Weg 3 schlägt Weg 1.** Widersprechen sich \`font-family\` und die gerenderte Familie,`,
    `  gilt die gerenderte — der Stack sagt nur, was gewünscht war.`,
    `- **Cross-Origin-Stylesheets sind für JS gesperrt.** Ist \`@font-face\` leer, aber es wurden`,
    `  Fontdateien geladen, liegt das daran und nicht am Fehlen der Regel.`, ``);
  return z.join("\n");
}

/* ── Browser starten: echtes Chrome bevorzugt, sonst gebündeltes Chromium ──── */
async function starteBrowser() {
  const opt = { headless: false, viewport: { width: 1440, height: 960 }, acceptDownloads: false,
                args: ["--disable-blink-features=AutomationControlled"] };
  try { return await chromium.launchPersistentContext(PROFIL, { ...opt, channel: "chrome" }); }
  catch { console.log("   (kein installiertes Chrome gefunden — nutze gebündeltes Chromium)"); }
  try { return await chromium.launchPersistentContext(PROFIL, opt); }
  catch {
    console.log("   Chromium fehlt, wird einmalig installiert …");
    execFileSync(process.platform === "win32" ? "npx.cmd" : "npx",
                 ["playwright", "install", "chromium"], { stdio: "inherit", cwd: WURZEL });
    return await chromium.launchPersistentContext(PROFIL, opt);
  }
}

/* ── Hauptlauf ────────────────────────────────────────────────────────────── */
mkdirSync(AUSGABE, { recursive: true });
// Ausgabeordner ignoriert sich selbst — hält `git status` sauber, ohne die
// getrackte .gitignore anzufassen.
const ignoreDatei = path.join(WURZEL, "easyship-forensics", ".gitignore");
if (!existsSync(ignoreDatei)) writeFileSync(ignoreDatei, "*\n");

banner("EASYSHIP DESIGN-FORENSIK", [
  "Rein lesend. Es wird nichts geklickt, abgesendet oder bestellt.",
  `Ergebnisse: easyship-forensics${path.sep}${STEMPEL}${path.sep}`,
]);

const ctx = await starteBrowser();
const netz = [];
ctx.on("response", (r) => {
  const u = r.url(); const ct = r.headers()["content-type"] || "";
  if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u) || /font\//i.test(ct))
    netz.push({ url: u, status: r.status(), contentType: ct, bytes: Number(r.headers()["content-length"]) || null });
});
const page = ctx.pages()[0] || (await ctx.newPage());
const seiten = [];

// ── Phase 1: Marketing (öffentlich) ────────────────────────────────────────
banner("PHASE 1 · MARKETING-WEBSITE", ["Öffentlich, kein Login nötig."]);
for (const { id, url } of MARKETING) {
  console.log(`   → ${url}`);
  try { await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }); }
  catch { console.log("     (networkidle nicht erreicht — messe trotzdem)"); }
  await frage("   Cookie-Banner ggf. wegklicken, dann ENTER zum Messen … ");
  seiten.push(await vermesse(ctx, page, id, netz));
}

// ── Phase 2: App (Login durch Sie) ─────────────────────────────────────────
banner("PHASE 2 · EASYSHIP-APP", [`Öffne ${APP_START}`]);
try { await page.goto(APP_START, { waitUntil: "domcontentloaded", timeout: 60000 }); } catch { /* egal */ }
await page.waitForTimeout(2500);

const brauchtLogin = await page.evaluate(() =>
  /login|signin|sign-in/i.test(location.pathname) || !!document.querySelector('input[type="password"]'));

if (brauchtLogin) {
  banner("👉 BITTE JETZT IM BROWSER EINLOGGEN", [
    "Das Browserfenster ist geöffnet und bleibt offen.",
    "Melden Sie sich dort ganz normal bei Easyship an.",
    "Das Skript wartet und fasst nichts an.",
    "",
    "Sobald das Dashboard sichtbar ist: hier im Terminal ENTER drücken.",
  ]);
  await frage("   ENTER, wenn Sie eingeloggt sind (oder 'q' + ENTER zum Überspringen) … ");
} else {
  console.log("   ✓ Bereits eingeloggt (Profil aus einem früheren Lauf wiederverwendet).\n");
}

banner("APP-SEITEN AUFNEHMEN", [
  "Navigieren Sie im Browser zu der Seite, die gemessen werden soll",
  "— z. B. Dashboard, Sendungsliste, Tarifauswahl, Formular.",
  "",
  "Dann ENTER hier im Terminal = diese Seite messen.",
  "'q' + ENTER = fertig, Bericht schreiben.",
]);
let n = 1;
while (true) {
  const a = await frage(`   [App-Seite ${n}] ENTER = messen · q = fertig … `);
  if (a.toLowerCase() === "q") break;
  const id = `app-${String(n).padStart(2, "0")}`;
  try { seiten.push(await vermesse(ctx, page, id, netz)); n++; }
  catch (e) { console.log(`   ✗ Messung fehlgeschlagen: ${String(e).slice(0, 140)}`); }
  if (n > 20) { console.log("   (20 Seiten erreicht — Schluss)"); break; }
}

// ── Phase 3: Sichern ───────────────────────────────────────────────────────
banner("PHASE 3 · ERGEBNISSE SICHERN");
const fonts = await sichereFonts(ctx, seiten);
const roh = { erhoben: new Date().toISOString(), werkzeug: "scripts/easyship-forensics.mjs",
              hinweis: "Rein lesende Erhebung.", seiten, fontdateien: fonts,
              auswertung: Object.fromEntries(seiten.map((s) => [s.id, urteil(s)])) };
writeFileSync(path.join(AUSGABE, "raw.json"), JSON.stringify(roh, null, 1));
writeFileSync(path.join(AUSGABE, "BERICHT.md"), bericht(seiten, fonts));
await ctx.close();

linie("═");
console.log(`  FERTIG — ${seiten.length} Seite(n) gemessen`);
linie("═");
console.log(`  Bericht      : easyship-forensics${path.sep}${STEMPEL}${path.sep}BERICHT.md`);
console.log(`  Rohdaten     : easyship-forensics${path.sep}${STEMPEL}${path.sep}raw.json`);
console.log(`  Screenshots  : easyship-forensics${path.sep}${STEMPEL}${path.sep}*.png`);
if (fonts.length) console.log(`  Fontdateien  : easyship-forensics${path.sep}${STEMPEL}${path.sep}fonts${path.sep}`);
console.log("");
for (const s of seiten) {
  const u = urteil(s);
  console.log(`  ${s.id.padEnd(20)} gerendert: ${(u.gerendert.join(", ") || "—").padEnd(30)} [${u.confidence}]`);
}
console.log("");
