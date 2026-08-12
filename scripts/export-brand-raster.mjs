// Rasterexport der ConfidaraExpress-Wortmarke aus der Mastergeometrie.
//
// Warum es dieses Script gibt: E-Mail-Clients (Outlook rendert über die
// Word-Engine, Gmail entfernt SVG beim Sanitizing) und pdf-lib können KEIN SVG
// verarbeiten. Beide brauchen ein Rasterbild — es darf aber nicht von Hand
// nachgebaut oder abfotografiert werden, sondern muss aus derselben
// Vektorgeometrie stammen wie die Webassets.
//
// Ablauf: confidara-master.svg → Subpath-Filterung auf das Wortmarken-Band
// (y 725–860, 23 Subpaths) → Rasterung über die bereits vorhandene
// Chromium-Instanz von Playwright → PNG mit transparenter Fläche.
//
// ACHTUNG: Die Produktfarben der WEB-Assets (#111A33/#5367E8) gelten hier
// NICHT. E-Mail und PDF tragen die ORIGINALFARBEN des Masters
// (#011B55 Navy / #004AFC Blau) — so festgelegt für Branding-Paket 2/3.
//
// Aufruf:  node scripts/export-brand-raster.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MASTER = path.join(ROOT, "src/assets/brand/confidara-master.svg");

// Band des Schriftzugs im Master. Identisch zu der Aufteilung, die
// styles/brandIdentity.test.mjs gegen den Master prüft.
const BAND = { y0: 700, y1: 870 };

function subpathsMitFarbe(svg) {
  const paths = [...svg.matchAll(/<path\s+d="([^"]+)"\s+fill="([^"]+)"\s+fill-rule="([^"]+)"\s*\/>/g)];
  if (paths.length !== 2) throw new Error(`Master erwartet 2 Compound-Paths, gefunden: ${paths.length}`);
  const out = [];
  for (const [, d, fill] of paths) {
    const starts = [...d.matchAll(/M /g)].map((m) => m.index);
    starts.forEach((s, i) => out.push({ sub: d.slice(s, starts[i + 1] ?? d.length).trim(), fill }));
  }
  return out;
}

const bbox = (sub) => {
  const n = [...sub.matchAll(/-?[\d.]+/g)].map((x) => Number(x[0]));
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};

// Wortmarken-SVG in ORIGINALFARBEN aufbauen — Pfadstrings wörtlich übernommen.
function wortmarkeSvg() {
  const master = readFileSync(MASTER, "utf8");
  const teile = subpathsMitFarbe(master).filter((t) => {
    const b = bbox(t.sub);
    return b.y0 >= BAND.y0 && b.y1 <= BAND.y1;
  });
  if (teile.length !== 23) throw new Error(`Wortmarke erwartet 23 Subpaths, gefunden: ${teile.length}`);

  const boxen = teile.map((t) => bbox(t.sub));
  const x0 = Math.min(...boxen.map((b) => b.x0)), y0 = Math.min(...boxen.map((b) => b.y0));
  const x1 = Math.max(...boxen.map((b) => b.x1)), y1 = Math.max(...boxen.map((b) => b.y1));

  const proFarbe = {};
  for (const t of teile) (proFarbe[t.fill] ||= []).push(t.sub);
  const pfade = Object.entries(proFarbe)
    .map(([fill, subs]) => `<path d="${subs.join(" ")}" fill="${fill}" fill-rule="evenodd"/>`)
    .join("");

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" fill="none">${pfade}</svg>`,
    breite: x1 - x0,
    hoehe: y1 - y0,
  };
}

function chromiumPfad() {
  const r = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return r && existsSync(path.join(r, "chromium")) ? path.join(r, "chromium") : undefined;
}

const ZIELE = [
  {
    // E-Mail: wird mit 196 px Breite angezeigt → 2× für Retina.
    datei: "public/brand/confidaraexpress-wordmark.png",
    breite: 392,
    zweck: "E-Mail-Header (Anzeige 196 px, 2× Dichte)",
  },
  {
    // PDF: wird im Rechnungskopf mit ~150 pt Breite gezeichnet. 1176 px darauf
    // entspricht ~564 dpi — deutlich über den 300 dpi, die Druck verlangt.
    // Native Größe des Masterbandes, also keinerlei Zwischenskalierung.
    datei: "public/brand/confidaraexpress-wordmark-print.png",
    breite: 1176,
    zweck: "Rechnungs-PDF (Zeichnung ~150 pt ≙ ~564 dpi)",
  },
];

const { svg, breite: vbBreite, hoehe: vbHoehe } = wortmarkeSvg();
const seite = vbBreite / vbHoehe;
console.log(`Master-Wortmarke: viewBox ${vbBreite}×${vbHoehe} (${seite.toFixed(4)}:1), 23 Subpaths`);

const browser = await chromium.launch({ executablePath: chromiumPfad() });
for (const ziel of ZIELE) {
  const hoehe = Math.round(ziel.breite / seite);
  const page = await browser.newPage({
    viewport: { width: ziel.breite, height: hoehe },
    deviceScaleFactor: 1,
  });
  // Transparente Fläche: kein Hintergrund im Markup, omitBackground beim Export.
  await page.setContent(
    `<body style="margin:0;background:transparent">
       <div id="m" style="width:${ziel.breite}px;height:${hoehe}px">${svg}</div>
     </body>`,
  );
  await page.locator("#m svg").evaluate((el, [w, h]) => {
    el.setAttribute("width", w);
    el.setAttribute("height", h);
    el.style.display = "block";
  }, [ziel.breite, hoehe]);
  const ziel_pfad = path.join(ROOT, ziel.datei);
  mkdirSync(path.dirname(ziel_pfad), { recursive: true });
  await page.locator("#m").screenshot({ path: ziel_pfad, omitBackground: true });
  await page.close();
  const kb = (readFileSync(ziel_pfad).length / 1024).toFixed(1);
  console.log(`  ${ziel.datei}  ${ziel.breite}×${hoehe}  ${kb} KB  — ${ziel.zweck}`);
}
await browser.close();
