// ConfidaraExpress als App — Governance der ausgelieferten Dateien:
// Manifest, App-Icons (inklusive Pixelprüfung der sicheren Zone), Service
// Worker, Offline-Seite, Manifest-Link und nginx-Regeln.
//
// Die harten Grenzen des Service Workers stehen hier als Quelltextprüfung —
// was der Browser daraus macht, prüft tests/e2e/pwaCore.test.mjs am echten
// Produktionsbuild.
//
// Run: node --test src/styles/pwaGovernance.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(path.join(WURZEL, rel), "utf8");
const bin = (rel) => readFileSync(path.join(WURZEL, rel));
const ohneJsKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ohneXmlKommentare = (s) => s.replace(/<!--[\s\S]*?-->/g, "");

const manifest = JSON.parse(read("public/manifest.webmanifest"));
const sw = ohneJsKommentare(read("public/sw.js"));
const offline = read("public/offline.html");
const offlineOhneKommentar = ohneXmlKommentare(offline);
const indexHtml = ohneXmlKommentare(read("index.html"));
const nginx = read("nginx.conf").replace(/^\s*#.*$/gm, "");
const favicon = ohneXmlKommentare(read("public/favicon-v2.svg"));

const ICONS = [
  { src: "/app-icon-192-v1.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/app-icon-512-v1.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/app-icon-maskable-192-v1.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
  { src: "/app-icon-maskable-512-v1.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

/* ══════════ 1 — Manifest ════════════════════════════════════════════════ */

test("1 — das Manifest trägt exakt den vereinbarten Vertrag, keine Zusatzfunktionen", () => {
  assert.deepEqual(manifest, {
    id: "/",
    name: "ConfidaraExpress",
    short_name: "ConfidaraExpress",
    description: "ConfidaraExpress – Ihr B2B-Versandportal. Preise vergleichen, Sendungen buchen und verwalten.",
    lang: "de",
    dir: "ltr",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    theme_color: "#111A33",
    background_color: "#eff0f2",
    icons: ICONS,
  });
  // Bewusst NICHT: Shortcuts, Screenshots, Share Target, verwandte Apps usw.
  for (const feld of ["shortcuts", "screenshots", "share_target", "file_handlers", "protocol_handlers",
    "related_applications", "prefer_related_applications", "display_override", "orientation", "categories"]) {
    assert.ok(!(feld in manifest), `Manifestfeld ${feld} ist nicht Teil des Vertrags`);
  }
});

test("2 — Manifest-Werte sind an die Produktquellen gekoppelt", () => {
  // Beschreibung = Metabeschreibung der Seite, Themenfarbe = theme-color der Seite.
  const meta = indexHtml.match(/<meta name="description" content="([^"]+)"/);
  assert.equal(manifest.description, meta && meta[1]);
  const themen = indexHtml.match(/<meta name="theme-color" content="([^"]+)"/);
  assert.equal(manifest.theme_color, themen && themen[1]);
  // Hintergrund = Fläche des Ladebildschirms (nahtloser Start).
  const variablen = read("src/styles/variables.css");
  assert.match(variablen, /--ce-color-bg-canvas-bottom:\s*#eff0f2;/);
  assert.match(read("src/styles/layout.css"), /\.loading-screen \{[^}]*background: var\(--ce-app-bg-bottom\);/);
  // Kein Anbietername.
  assert.doesNotMatch(read("public/manifest.webmanifest"), /jumingo|transglobal|\bTG\b/i);
});

test("3 — index.html verlinkt das Manifest genau einmal, ohne Credentials", () => {
  const links = indexHtml.match(/<link rel="manifest"[^>]*>/g) || [];
  assert.deepEqual(links, ['<link rel="manifest" href="/manifest.webmanifest" />']);
  // Apple Touch Icon bleibt erhalten.
  assert.match(indexHtml, /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon-v1\.png" \/>/);
});

/* ══════════ 2 — App-Icons ═══════════════════════════════════════════════ */

/* Minimaler PNG-Dekoder (8 bit, RGB oder RGBA, nicht interlaced) — dieselbe
   Bauart wie in brandRaster.test.mjs, zusätzlich für Farbtyp 2 (RGB), den
   Chromium für vollständig deckende Screenshots schreibt. */
function dekodiere(buf) {
  assert.equal(buf.readUInt32BE(0), 0x89504e47, "keine PNG-Signatur");
  let off = 8, ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const typ = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (typ === "IHDR") {
      ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), tiefe: data[8], farbtyp: data[9], interlace: data[12] };
    } else if (typ === "IDAT") idat.push(data);
    else if (typ === "IEND") break;
    off += 12 + len;
  }
  assert.equal(ihdr.tiefe, 8, "erwartet 8 bit je Kanal");
  assert.ok(ihdr.farbtyp === 6 || ihdr.farbtyp === 2, `erwartet RGB oder RGBA, war Farbtyp ${ihdr.farbtyp}`);
  assert.equal(ihdr.interlace, 0, "erwartet nicht interlaced");
  const bpp = ihdr.farbtyp === 6 ? 4 : 3, stride = ihdr.w * bpp;
  const roh = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(ihdr.h * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < ihdr.h; y++) {
    const filter = roh[y * (stride + 1)];
    const zeile = roh.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      const v = zeile[x];
      px[y * stride + x] =
        filter === 0 ? v
        : filter === 1 ? (v + a) & 255
        : filter === 2 ? (v + b) & 255
        : filter === 3 ? (v + ((a + b) >> 1)) & 255
        : filter === 4 ? (v + paeth(a, b, c)) & 255
        : (() => { throw new Error(`unbekannter Zeilenfilter ${filter}`); })();
    }
  }
  const pixel = (x, y) => {
    const i = y * stride + x * bpp;
    return { r: px[i], g: px[i + 1], b: px[i + 2], a: bpp === 4 ? px[i + 3] : 255 };
  };
  return { ...ihdr, pixel };
}

// Master-Navy der Trägerfläche (#011B55) — Referenz für „Hintergrund".
const NAVY = { r: 0x01, g: 0x1b, b: 0x55 };
const abstand = (p, q) => Math.abs(p.r - q.r) + Math.abs(p.g - q.g) + Math.abs(p.b - q.b);

test("4 — alle vier Icons existieren in der deklarierten Größe", () => {
  for (const icon of ICONS) {
    const rel = `public${icon.src}`;
    assert.ok(existsSync(path.join(WURZEL, rel)), `${rel} fehlt`);
    const img = dekodiere(bin(rel));
    const [w, h] = icon.sizes.split("x").map(Number);
    assert.equal(img.w, w, `${rel}: Breite`);
    assert.equal(img.h, h, `${rel}: Höhe`);
  }
});

test("5 — „any“: die Favicon-Kachel mit transparenten Ecken und deckender Mitte", () => {
  for (const icon of ICONS.filter((i) => i.purpose === "any")) {
    const img = dekodiere(bin(`public${icon.src}`));
    assert.equal(img.farbtyp, 6, `${icon.src}: braucht Alpha für die gerundeten Ecken`);
    for (const [x, y] of [[0, 0], [img.w - 1, 0], [0, img.h - 1], [img.w - 1, img.h - 1]]) {
      assert.equal(img.pixel(x, y).a, 0, `${icon.src}: Ecke ${x}/${y} ist nicht transparent`);
    }
    // Rand der Trägerfläche (Mitte der linken Kante) ist deckendes Navy.
    const kante = img.pixel(2, Math.floor(img.h / 2));
    assert.equal(kante.a, 255);
    assert.ok(abstand(kante, NAVY) < 12, `${icon.src}: Trägerfläche ist nicht Master-Navy`);
  }
});

test("6 — „maskable“: vollflächig deckend, das Signet liegt vollständig in der sicheren Zone", () => {
  for (const icon of ICONS.filter((i) => i.purpose === "maskable")) {
    const img = dekodiere(bin(`public${icon.src}`));
    const cx = (img.w - 1) / 2, cy = (img.h - 1) / 2;
    let maxRadius = 0, signetPixel = 0;
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const p = img.pixel(x, y);
        assert.equal(p.a, 255, `${icon.src}: Pixel ${x}/${y} nicht deckend`);
        if (abstand(p, NAVY) > 60) {
          signetPixel++;
          maxRadius = Math.max(maxRadius, Math.hypot(x - cx, y - cy));
        }
      }
    }
    const anteil = maxRadius / img.w;
    // W3C Manifest: sichere Zone = Kreis mit Radius 40 % der Kantenlänge.
    assert.ok(anteil <= 0.4, `${icon.src}: Signet reicht bis ${(anteil * 100).toFixed(1)} % — außerhalb der sicheren Zone`);
    // …und ist trotzdem gut sichtbar, nicht auf eine Briefmarke geschrumpft.
    assert.ok(anteil >= 0.3, `${icon.src}: Signet zu klein (${(anteil * 100).toFixed(1)} %)`);
    assert.ok(signetPixel > img.w * img.h * 0.08, `${icon.src}: kaum Signetfläche`);
  }
});

test("7 — die Icons entstehen reproduzierbar aus dem Favicon, nichts wird nachgezeichnet", () => {
  const skript = read("scripts/export-app-icons.mjs");
  assert.match(skript, /public\/favicon-v2\.svg/);
  assert.match(skript, /const MASKABLE_SCALE = 0\.7;/);
  for (const icon of ICONS) assert.ok(skript.includes(`public${icon.src}`), `${icon.src} wird nicht erzeugt`);
  assert.doesNotMatch(skript, /<path\s+d="/, "das Script darf keine eigene Geometrie zeichnen");
});

/* ══════════ 3 — Service Worker ══════════════════════════════════════════ */

test("8 — genau ein Cache („ce-offline-v1“) mit genau einer Datei (/offline.html)", () => {
  const cacheNamen = [...new Set(sw.match(/"ce-[a-z-]+-v\d+"/g) || [])];
  assert.deepEqual(cacheNamen, ['"ce-offline-v1"']);
  assert.match(sw, /const OFFLINE_CACHE = "ce-offline-v1";/);
  assert.match(sw, /const OFFLINE_URL = "\/offline\.html";/);
  // Geschrieben wird genau einmal — die Offline-Seite beim Installieren.
  assert.equal((sw.match(/cache\.add\(/g) || []).length, 1);
  assert.doesNotMatch(sw, /cache\.put\(|cache\.addAll\(|caches\.open\((?!OFFLINE_CACHE)/,
    "kein weiterer Schreibweg in einen Cache");
  assert.match(sw, /cache\.add\(new Request\(OFFLINE_URL, \{ cache: "reload" \}\)\)/);
  // Aufgeräumt werden nur eigene Altstände, keine fremden Caches.
  assert.match(sw, /name\.startsWith\("ce-offline-"\) && name !== OFFLINE_CACHE/);
});

test("9 — nur Navigationen derselben Origin, Netz zuerst, Offline-Seite nur bei Netzfehler", () => {
  assert.equal((sw.match(/respondWith\(/g) || []).length, 1, "genau eine Antwortstelle");
  const handler = sw.slice(sw.indexOf('addEventListener("fetch"'));
  const pruefungNavigate = handler.indexOf('if (request.mode !== "navigate" || request.method !== "GET") return;');
  const pruefungOrigin = handler.indexOf("if (new URL(request.url).origin !== self.location.origin) return;");
  const antwort = handler.indexOf("respondWith(");
  assert.ok(pruefungNavigate > -1 && pruefungOrigin > -1, "Navigations- und Origin-Grenze fehlen");
  assert.ok(pruefungNavigate < antwort && pruefungOrigin < antwort, "die Grenzen müssen VOR der Antwort stehen");
  // Netz zuerst: Vorladeantwort bzw. fetch — der Cache nur im catch-Zweig.
  const versuch = handler.slice(handler.indexOf("try {"), handler.indexOf("} catch"));
  assert.match(versuch, /await event\.preloadResponse/);
  assert.match(versuch, /return await fetch\(request\);/);
  assert.doesNotMatch(versuch, /caches\./, "der Cache darf nie vor dem Netz stehen");
  assert.match(handler.slice(handler.indexOf("} catch")), /caches\.match\(OFFLINE_URL, \{ cacheName: OFFLINE_CACHE \}\)/);
});

test("10 — der Service Worker kennt keine Anmeldedaten, keine API und kein Fremdskript", () => {
  for (const verboten of [
    /localStorage/, /sessionStorage/, /indexedDB/, /Authorization/i, /ce_token/, /api\.confidaraexpress/,
    /VITE_/, /importScripts/, /\/kunde\//, /\/api\//, /jumingo|transglobal/i, /setTimeout|setInterval/,
  ]) {
    assert.doesNotMatch(sw, verboten, `sw.js: ${verboten}`);
  }
  // Updates: sofort übernehmen ist gefahrlos, weil kein App-Code im Cache liegt.
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
});

/* ══════════ 4 — Offline-Seite ═══════════════════════════════════════════ */

test("11 — die Offline-Seite funktioniert vollständig ohne Netz", () => {
  assert.doesNotMatch(offlineOhneKommentar, /<script/i, "kein JavaScript");
  assert.doesNotMatch(offlineOhneKommentar, /<link\b/i, "kein externes Stylesheet/Icon");
  assert.doesNotMatch(offlineOhneKommentar, /<img\b|<iframe\b|<object\b/i, "keine externen Bilder/Einbettungen");
  assert.doesNotMatch(offlineOhneKommentar, /@import|@font-face|url\(/i, "keine nachgeladenen Ressourcen");
  assert.doesNotMatch(offlineOhneKommentar, /(src|href)="https?:/i, "keine absoluten Fremdadressen");
  assert.match(offlineOhneKommentar, /<html lang="de">/);
  assert.match(offlineOhneKommentar, /<meta name="robots" content="noindex">/);
});

test("12 — Offline-Text sachlich, ohne alte Geschäftsdaten, mit normalem Wiederholen-Link", () => {
  assert.match(offlineOhneKommentar, /<h1>Keine Internetverbindung<\/h1>/);
  assert.ok(offlineOhneKommentar.includes(
    "Für aktuelle Versandpreise, Buchungen und Dokumente benötigt ConfidaraExpress eine Internetverbindung."));
  assert.match(offlineOhneKommentar, /<a class="retry" href="">Erneut versuchen<\/a>/);
  for (const verboten of [/€|EUR/, /CE-(BS|RE|AB|K)-?/, /jumingo|transglobal|\bTG\b/i, /@[a-z0-9-]+\./i]) {
    assert.doesNotMatch(offlineOhneKommentar, verboten, `Offline-Seite: ${verboten}`);
  }
});

test("13 — das Signet der Offline-Seite ist die Geometrie des Favicons (wörtlich)", () => {
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const faviconPfad = favicon.match(/<path\b[\s\S]*?\/>/);
  const offlinePfad = offlineOhneKommentar.match(/<path\b[\s\S]*?\/>/);
  assert.ok(faviconPfad && offlinePfad);
  assert.equal(norm(offlinePfad[0]), norm(faviconPfad[0]));
  assert.equal(offlineOhneKommentar.match(/<rect\b[^>]*\/>/)[0], favicon.match(/<rect\b[^>]*\/>/)[0]);
  assert.match(offlineOhneKommentar, /<svg class="mark"[^>]*aria-hidden="true"/);
});

/* ══════════ 5 — nginx ═══════════════════════════════════════════════════ */

// Der Sicherheitsheaderblock der Serverebene — er muss in JEDER neuen Location
// vollständig wiederholt werden (add_header wird nicht vererbt).
const serverKopf = nginx.slice(0, nginx.indexOf("location "));
const SICHERHEIT = (serverKopf.match(/^\s*add_header .+ always;$/gm) || []).map((z) => z.trim());

function block(kopf) {
  const start = nginx.indexOf(kopf);
  assert.ok(start > -1, `nginx-Location fehlt: ${kopf}`);
  const ende = nginx.indexOf("\n    }", start);
  return nginx.slice(start, ende);
}

test("14 — sw.js, Manifest und Offline-Seite: no-cache, eigener Typ, volle Sicherheitsheader", () => {
  assert.equal(SICHERHEIT.length, 5, "Sicherheitsheaderblock der Serverebene nicht gefunden");
  for (const kopf of ["location = /sw.js {", "location = /manifest.webmanifest {", "location = /offline.html {"]) {
    const b = block(kopf);
    assert.match(b, /add_header Cache-Control "no-cache" always;/, `${kopf} ohne no-cache`);
    assert.doesNotMatch(b, /expires|immutable/, `${kopf}: Langzeit-Caching`);
    for (const zeile of SICHERHEIT) assert.ok(b.includes(zeile), `${kopf}: fehlt ${zeile.slice(0, 60)}…`);
  }
  const m = block("location = /manifest.webmanifest {");
  assert.match(m, /types \{ \}\s+default_type application\/manifest\+json;/, "Manifest ohne eigenen MIME-Typ");
});

test("15 — App-Icons: kurz cachen wie die Browser-Icons, mit Präfix-Vorrang vor dem Assetblock", () => {
  const b = block("location ^~ /app-icon {");
  assert.match(b, /add_header Cache-Control "public, max-age=3600, must-revalidate" always;/);
  assert.doesNotMatch(b, /expires|immutable/);
  for (const zeile of SICHERHEIT) assert.ok(b.includes(zeile), `/app-icon: fehlt ${zeile.slice(0, 60)}…`);
  // index.html und die gehashten Bündel bleiben unverändert.
  assert.match(block("location = /index.html {"), /add_header Cache-Control "no-cache, must-revalidate" always;/);
  assert.match(nginx, /location ~\* \\\.\(js\|css\|png\|jpg\|jpeg\|gif\|ico\|svg\|woff\|woff2\|ttf\|eot\)\$ \{\s+expires 1y;/);
});
