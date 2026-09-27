// App-Icons des Web-App-Manifests aus dem produktiven Favicon-Signet.
//
// Warum es dieses Script gibt: Das Manifest braucht Rasterbilder in festen
// Größen (192 und 512 px), und zwar in zwei Zwecken:
//
//   • "any"      — so, wie das Icon auf dem Desktop (Startmenü, Taskleiste,
//                  Dock) erscheint. Das ist exakt die Komposition des
//                  Favicons: Trägerfläche mit abgerundeten Ecken, Signet mit
//                  Rand 5/64. Die Ecken außerhalb der Rundung bleiben
//                  transparent.
//   • "maskable" — für Android-Launcher, die das Icon selbst beschneiden
//                  (Kreis, Squircle, Tropfen). Dafür ist die Trägerfläche
//                  vollflächig (keine eigene Rundung), und das Signet liegt
//                  vollständig in der sicheren Zone: einem Kreis mit dem
//                  Radius 40 % der Kantenlänge um die Mitte (W3C Manifest,
//                  „safe zone"). Das Favicon selbst erfüllt das NICHT — seine
//                  Signetecken liegen bei rund 55 % —, deshalb wird das Signet
//                  hier um die Mitte auf MASKABLE_SCALE verkleinert.
//
// Es wird nichts nachgezeichnet: Geometrie und Farben kommen wörtlich aus
// public/favicon-v2.svg; verändert werden nur der Eckradius (maskable) und
// eine zentrierte Skalierung des Signets (maskable).
//
// Dateinamen sind versioniert (-v1). nginx liefert sie mit einer Stunde
// Cache aus; bei einer sichtbaren Änderung die Zahl hochzählen und das
// Manifest nachziehen.
//
// Kein neues Paket: Playwright liegt bereits als devDependency vor und wird
// von scripts/export-apple-touch-icon.mjs genauso genutzt.
//
// Aufruf:  node scripts/export-app-icons.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUELLE = path.join(ROOT, "public/favicon-v2.svg");

// Signetbreite im maskable Icon: 84 % × 0,70 ≈ 59 % der Kante; die Ecken des
// Signetrahmens liegen dann bei ≈ 0,385 × Kante vom Mittelpunkt (< 0,40).
const MASKABLE_SCALE = 0.7;

const ZIELE = [
  { datei: "public/app-icon-192-v1.png", kante: 192, zweck: "any" },
  { datei: "public/app-icon-512-v1.png", kante: 512, zweck: "any" },
  { datei: "public/app-icon-maskable-192-v1.png", kante: 192, zweck: "maskable" },
  { datei: "public/app-icon-maskable-512-v1.png", kante: 512, zweck: "maskable" },
];

function chromiumPfad() {
  const r = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return r && existsSync(path.join(r, "chromium")) ? path.join(r, "chromium") : undefined;
}

const favicon = readFileSync(QUELLE, "utf8");

function maskableSvg(svg) {
  // Vollflächig: den Eckradius der Trägerfläche entfernen.
  const ohneRadius = svg.replace(/\srx="\d+"/, "");
  if (ohneRadius === svg) throw new Error("Eckradius nicht gefunden — Favicon-Aufbau geändert?");
  // Das Signet um die Mitte (32/32 im 64er-Raster) verkleinern.
  const mitSkalierung = ohneRadius.replace(
    /(<path\b[^>]*\stransform=")([^"]+)(")/,
    (_, a, t, b) => `${a}translate(32 32) scale(${MASKABLE_SCALE}) translate(-32 -32) ${t}${b}`
  );
  if (mitSkalierung === ohneRadius) throw new Error("Signetpfad mit transform nicht gefunden — Favicon-Aufbau geändert?");
  return mitSkalierung;
}

const browser = await chromium.launch({ executablePath: chromiumPfad() });
try {
  for (const ziel of ZIELE) {
    const svg = ziel.zweck === "maskable" ? maskableSvg(favicon) : favicon;
    const page = await browser.newPage({ viewport: { width: ziel.kante, height: ziel.kante }, deviceScaleFactor: 1 });
    await page.setContent(`<body style="margin:0;background:transparent"><div id="m" style="width:${ziel.kante}px;height:${ziel.kante}px">${svg}</div></body>`);
    await page.locator("#m svg").evaluate((el, k) => {
      el.setAttribute("width", k);
      el.setAttribute("height", k);
      el.style.display = "block";
    }, ziel.kante);
    // omitBackground: die Ecken des "any"-Icons bleiben transparent; das
    // maskable Icon ist durch seine vollflächige Trägerfläche ohnehin deckend.
    await page.locator("#m").screenshot({ path: path.join(ROOT, ziel.datei), omitBackground: true });
    await page.close();
    const kb = (readFileSync(path.join(ROOT, ziel.datei)).length / 1024).toFixed(1);
    console.log(`${path.basename(ziel.datei)}  ${ziel.kante}×${ziel.kante}  ${ziel.zweck}  ${kb} KB`);
  }
} finally {
  await browser.close();
}
