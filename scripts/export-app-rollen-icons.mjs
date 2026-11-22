// Icons der Admin- und der Partner-App (Betreiberauftrag 2026-11-22, FE-2) aus dem produktiven Favicon-Signet.
//
// Drei Apps liegen nebeneinander auf demselben Startbildschirm: der Kundenbereich (Trägerfläche Master-Navy #011B55),
// die Admin-App und die Partner-App. Unterscheidbar müssen sie auf einen Blick sein — auch in 16 px, auch unter jeder
// Maske eines Android-Launchers (Kreis, Squircle) und unter der Eckmaske von iOS. Ein Band, ein Ring oder ein Eckpunkt
// läge teils außerhalb der sicheren Zone und verschwände je nach Maske. Deshalb trägt die App ihre Rollenfarbe auf der
// GANZEN Trägerfläche — dieselben Farben wie die Oberfläche (D3):
//   Admin    #004AFC  Signalblau (admin-nacht.css --adm-signal; Off-White darauf 6,1:1)
//   Partner  #6A3DF0  Violett    (partner-nacht.css --pn-signal; Off-White darauf 5,6:1)
// Das Signet selbst bleibt unverändert: Geometrie und Off-White wörtlich aus public/favicon-v2.svg. Verändert werden nur
// die Farbe der Trägerfläche, der Eckradius (maskable, Apple) und die zentrierte Skalierung des Signets (maskable) —
// dieselben Ableitungen wie scripts/export-app-icons.mjs und scripts/export-apple-touch-icon.mjs.
//
// Dateinamen sind versioniert (-v1); bei einer sichtbaren Änderung die Zahl hochzählen und die Manifeste nachziehen.
// Kein neues Paket: Playwright liegt als devDependency vor. Headless Chromium, ein Browserprozess, nacheinander.
//
// Aufruf:  node scripts/export-app-rollen-icons.mjs
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUELLE = path.join(ROOT, "public/favicon-v2.svg");

export const ROLLEN = Object.freeze({
  admin: "#004AFC",
  partner: "#6A3DF0",
});
const MARKEN_NAVY = 'fill="#011B55"';
const MASKABLE_SCALE = 0.7; // wie scripts/export-app-icons.mjs: Signetecken bei ≈ 0,385 × Kante (< 0,40)

function chromiumPfad() {
  const r = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return r && existsSync(path.join(r, "chromium")) ? path.join(r, "chromium") : undefined;
}

export function rollenSvg(favicon, farbe) {
  if ((favicon.match(/fill="#011B55"/g) || []).length !== 1) throw new Error("Trägerfläche nicht eindeutig — Favicon-Aufbau geändert?");
  return favicon.replace(MARKEN_NAVY, `fill="${farbe}"`);
}

export function ohneEckradius(svg) {
  const ohne = svg.replace(/\srx="\d+"/, "");
  if (ohne === svg) throw new Error("Eckradius nicht gefunden — Favicon-Aufbau geändert?");
  return ohne;
}

export function maskableSvg(svg) {
  const mitSkalierung = ohneEckradius(svg).replace(
    /(<path\b[^>]*\stransform=")([^"]+)(")/,
    (_, a, t, b) => `${a}translate(32 32) scale(${MASKABLE_SCALE}) translate(-32 -32) ${t}${b}`
  );
  if (!mitSkalierung.includes(`scale(${MASKABLE_SCALE})`)) throw new Error("Signetpfad mit transform nicht gefunden — Favicon-Aufbau geändert?");
  return mitSkalierung;
}

export function ziele(rolle) {
  return [
    { datei: `public/app-icon-${rolle}-192-v1.png`, kante: 192, zweck: "any" },
    { datei: `public/app-icon-${rolle}-512-v1.png`, kante: 512, zweck: "any" },
    { datei: `public/app-icon-${rolle}-maskable-192-v1.png`, kante: 192, zweck: "maskable" },
    { datei: `public/app-icon-${rolle}-maskable-512-v1.png`, kante: 512, zweck: "maskable" },
    { datei: `public/apple-touch-icon-${rolle}-v1.png`, kante: 180, zweck: "apple" },
  ];
}

async function exportieren() {
  const favicon = readFileSync(QUELLE, "utf8");
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPfad() });
  try {
    for (const [rolle, farbe] of Object.entries(ROLLEN)) {
      const basis = rollenSvg(favicon, farbe);
      for (const ziel of ziele(rolle)) {
        const svg = ziel.zweck === "maskable" ? maskableSvg(basis) : ziel.zweck === "apple" ? ohneEckradius(basis) : basis;
        const page = await browser.newPage({ viewport: { width: ziel.kante, height: ziel.kante }, deviceScaleFactor: 1 });
        await page.setContent(`<body style="margin:0;background:transparent"><div id="m" style="width:${ziel.kante}px;height:${ziel.kante}px">${svg}</div></body>`);
        await page.locator("#m svg").evaluate((el, k) => {
          el.setAttribute("width", k);
          el.setAttribute("height", k);
          el.style.display = "block";
        }, ziel.kante);
        // "any": die Ecken außerhalb der Rundung bleiben transparent; maskable und Apple sind vollflächig deckend.
        await page.locator("#m").screenshot({ path: path.join(ROOT, ziel.datei), omitBackground: ziel.zweck === "any" });
        await page.close();
        const kb = (readFileSync(path.join(ROOT, ziel.datei)).length / 1024).toFixed(1);
        console.log(`${path.basename(ziel.datei)}  ${ziel.kante}×${ziel.kante}  ${ziel.zweck}  ${kb} KB`);
      }
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await exportieren();
