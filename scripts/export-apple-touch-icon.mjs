// Apple Touch Icon aus dem produktiven Favicon-Signet.
//
// Warum es dieses Script gibt: Safari/iOS unterstützt für `apple-touch-icon`
// KEIN SVG — dort muss ein PNG liegen. Das Bild wird deshalb aus derselben
// Datei gerastert, die auch der Browser-Tab zeigt (`public/favicon-v2.svg`);
// es wird nichts nachgezeichnet und keine zweite Geometrie gepflegt.
//
// Warum vollflächig statt mit eigenen runden Ecken: iOS legt seine eigene
// Maske über das Icon. Ein Bild mit eigenen Rundungen bekäme dadurch einen
// doppelten Rand. Der Radius des Favicons wird hier also bewusst entfernt —
// die Fläche und die Marke darauf bleiben identisch.
//
// 180 px ist die größte Kantenlänge, die iOS anfordert (@3×-Geräte).
//
// Kein neues Paket: Playwright liegt bereits als devDependency vor und wird
// von scripts/export-brand-raster.mjs genauso genutzt.
//
// Aufruf:  node scripts/export-apple-touch-icon.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUELLE = path.join(ROOT, "public/favicon-v2.svg");
const ZIEL = path.join(ROOT, "public/apple-touch-icon-v1.png");
const KANTE = 180;

function chromiumPfad() {
  const r = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return r && existsSync(path.join(r, "chromium")) ? path.join(r, "chromium") : undefined;
}

const favicon = readFileSync(QUELLE, "utf8");
// Nur der Eckradius fällt weg (siehe oben). Geometrie und Farben unverändert.
const svg = favicon.replace(/\srx="\d+"/, "");
if (svg === favicon) throw new Error("Eckradius nicht gefunden — Favicon-Aufbau geändert?");

const browser = await chromium.launch({ executablePath: chromiumPfad() });
const page = await browser.newPage({ viewport: { width: KANTE, height: KANTE }, deviceScaleFactor: 1 });
await page.setContent(`<body style="margin:0"><div id="m" style="width:${KANTE}px;height:${KANTE}px">${svg}</div></body>`);
await page.locator("#m svg").evaluate((el, k) => {
  el.setAttribute("width", k);
  el.setAttribute("height", k);
  el.style.display = "block";
}, KANTE);
mkdirSync(path.dirname(ZIEL), { recursive: true });
// Kein omitBackground: das Icon trägt seine eigene deckende Fläche. iOS setzt
// ein transparentes Icon sonst auf Schwarz.
await page.locator("#m").screenshot({ path: ZIEL });
await browser.close();

const kb = (readFileSync(ZIEL).length / 1024).toFixed(1);
console.log(`apple-touch-icon-v1.png  ${KANTE}×${KANTE}  ${kb} KB  — aus favicon-v2.svg gerastert`);
