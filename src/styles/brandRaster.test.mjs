// Rasterassets der Marke für E-Mail und Rechnungs-PDF — Quelltext- und
// Pixelinvarianten.
//
// Warum es diese Assets überhaupt gibt: E-Mail-Clients (Outlook rendert über
// die Word-Engine, Gmail entfernt SVG beim Sanitizing) und pdf-lib können KEIN
// SVG verarbeiten. Beide brauchen ein Rasterbild — es darf aber nicht von Hand
// nachgebaut, nachgezeichnet oder von einer gerenderten Oberfläche
// abfotografiert werden, sondern muss aus derselben Vektorgeometrie stammen
// wie die Webassets. `scripts/export-brand-raster.mjs` leistet genau das.
//
// Der entscheidende Unterschied zu den Webassets: E-Mail und PDF tragen die
// ORIGINALFARBEN des Masters (#011B55 Navy / #004AFC Blau), nicht die
// Produktfarben des Webs (#111A33 / #5367E8). Das ist so festgelegt und wird
// hier in beide Richtungen geprüft — die Webfarben dürfen dort NICHT stehen.
//
// Die Pixelprüfung läuft ohne neue Abhängigkeit: ein minimaler PNG-Dekoder auf
// Basis des eingebauten `zlib`. Damit misst dieser Test die echte Bilddatei,
// nicht bloß ihre Kopfdaten.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const bin = (rel) => readFileSync(new URL(rel, import.meta.url));
const stripXml = (s) => s.replace(/<!--[\s\S]*?-->/g, "");
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// Originalfarben des Masters — genau diese gehören in E-Mail und PDF.
const MASTER_NAVY = "#011b55";
const MASTER_BLAU = "#004afc";
// Produktfarben des Webs — sie gehören NICHT in die Rasterassets.
const WEB_NAVY = "#111a33";
const WEB_BLAU = "#5367e8";

const master = stripXml(read("../assets/brand/confidara-master.svg"));
const script = read("../../scripts/export-brand-raster.mjs");

const PNGS = [
  { rel: "../../public/brand/confidaraexpress-wordmark.png", w: 392, h: 45, zweck: "E-Mail" },
  { rel: "../../public/brand/confidaraexpress-wordmark-print.png", w: 1176, h: 135, zweck: "PDF" },
];

/* ── Minimaler PNG-Dekoder (8 bit, RGBA, nicht interlaced) ─────────────────
   Reicht exakt für die beiden hier geprüften Dateien; alles andere lässt er
   bewusst laut scheitern, statt still etwas Falsches zu messen. */
function dekodiere(buf) {
  assert.equal(buf.readUInt32BE(0), 0x89504e47, "keine PNG-Signatur");
  let off = 8, ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const typ = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (typ === "IHDR") {
      ihdr = {
        w: data.readUInt32BE(0), h: data.readUInt32BE(4),
        tiefe: data[8], farbtyp: data[9], interlace: data[12],
      };
    } else if (typ === "IDAT") idat.push(data);
    else if (typ === "IEND") break;
    off += 12 + len;
  }
  assert.equal(ihdr.tiefe, 8, "erwartet 8 bit je Kanal");
  assert.equal(ihdr.farbtyp, 6, "erwartet Farbtyp 6 (RGBA)");
  assert.equal(ihdr.interlace, 0, "erwartet nicht interlaced");

  const bpp = 4, stride = ihdr.w * bpp;
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
  return { ...ihdr, px, stride };
}

/* Deckende Farben (Alpha 255) mit ihrer Häufigkeit; Kantenglättung (Alpha
   dazwischen) und volle Transparenz werden getrennt gezählt. */
function farbprofil(img) {
  const zaehler = new Map();
  let transparent = 0, weich = 0, deckend = 0;
  for (let i = 0; i < img.px.length; i += 4) {
    const a = img.px[i + 3];
    if (a === 0) { transparent++; continue; }
    if (a < 255) { weich++; continue; }
    deckend++;
    const hex = "#" + [img.px[i], img.px[i + 1], img.px[i + 2]]
      .map((v) => v.toString(16).padStart(2, "0")).join("");
    zaehler.set(hex, (zaehler.get(hex) || 0) + 1);
  }
  return { zaehler, transparent, weich, deckend };
}

const bilder = PNGS.map((p) => ({ ...p, img: dekodiere(bin(p.rel)) }));

/* Bandgrenzen des Schriftzugs direkt aus dem Master — dieselbe Ableitung, die
   das Exportscript fährt. Damit misst der Test gegen die Quelle, nicht gegen
   eine im Test wiederholte Zahl. */
function wortmarkeAusMaster() {
  const paths = [...master.matchAll(/<path\s+d="([^"]+)"\s+fill="([^"]+)"/g)];
  const subs = [];
  for (const [, d, fill] of paths) {
    const starts = [...d.matchAll(/M /g)].map((m) => m.index);
    starts.forEach((s, i) => subs.push({ sub: d.slice(s, starts[i + 1] ?? d.length).trim(), fill }));
  }
  const bbox = (sub) => {
    const n = [...sub.matchAll(/-?[\d.]+/g)].map((x) => Number(x[0]));
    const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  };
  const band = subs.filter((t) => { const b = bbox(t.sub); return b.y0 >= 700 && b.y1 <= 870; });
  const boxen = band.map((t) => bbox(t.sub));
  return {
    anzahl: band.length,
    farben: [...new Set(band.map((t) => t.fill.toLowerCase()))].sort(),
    breite: Math.max(...boxen.map((b) => b.x1)) - Math.min(...boxen.map((b) => b.x0)),
    hoehe: Math.max(...boxen.map((b) => b.y1)) - Math.min(...boxen.map((b) => b.y0)),
  };
}
const bandMaster = wortmarkeAusMaster();

/* ── 1 · Herkunft: aus dem Master gefiltert, nicht nachgebaut ─────────────── */

test("Exportscript liest den Master und zeichnet nichts selbst", () => {
  assert.match(script, /confidara-master\.svg/, "Master ist nicht die Quelle des Exports");
  const code = stripJs(script);
  // Kein eigenes Pfadliteral: im Code steht kein SVG-Pfadbefehl als Nutzlast.
  assert.equal(
    /["'`]\s*M\s+\d+(\.\d+)?\s+\d/.test(code), false,
    "Exportscript enthält eine eigene Pfadgeometrie — Marke muss gefiltert, nicht gezeichnet werden",
  );
  // Keine Rasterquelle außer dem gefilterten Master (kein Screenshot einer Seite).
  assert.equal(/goto\s*\(/.test(code), false, "Export lädt eine Seite — der Master ist die einzige zulässige Quelle");
});

test("Exportscript filtert genau das Wortmarkenband des Masters", () => {
  assert.equal(bandMaster.anzahl, 23, "Wortmarkenband des Masters hat nicht 23 Subpaths");
  assert.match(stripJs(script), /!==\s*23/, "Exportscript sichert die Subpath-Anzahl nicht ab");
});

/* ── 2 · Farben: Originalmaster, ausdrücklich NICHT die Webfarben ─────────── */

test("Master liefert für die Wortmarke genau die beiden Originalfarben", () => {
  assert.deepEqual(bandMaster.farben, [MASTER_BLAU, MASTER_NAVY].sort());
});

for (const { rel, zweck, img } of bilder) {
  test(`${zweck}-PNG trägt ausschließlich die Originalfarben des Masters`, () => {
    const { zaehler } = farbprofil(img);
    const gefunden = [...zaehler.keys()].sort();
    assert.deepEqual(
      gefunden, [MASTER_BLAU, MASTER_NAVY].sort(),
      `${rel} enthält andere deckende Farben als der Master: ${gefunden.join(", ")}`,
    );
  });

  test(`${zweck}-PNG enthält keine Webproduktfarbe`, () => {
    const { zaehler } = farbprofil(img);
    for (const web of [WEB_NAVY, WEB_BLAU]) {
      assert.equal(zaehler.has(web), false, `${rel} trägt die Webfarbe ${web} statt der Masterfarbe`);
    }
  });

  test(`${zweck}-PNG hat eine transparente Fläche`, () => {
    const { transparent, deckend } = farbprofil(img);
    assert.ok(transparent > 0, `${rel} hat keinen einzigen transparenten Pixel — Fläche ist eingebrannt`);
    // Die vier Ecken müssen frei sein, sonst liegt ein Kasten unter der Marke.
    const at = (x, y) => img.px[y * img.stride + x * 4 + 3];
    for (const [x, y] of [[0, 0], [img.w - 1, 0], [0, img.h - 1], [img.w - 1, img.h - 1]]) {
      assert.equal(at(x, y), 0, `${rel}: Ecke ${x}/${y} ist nicht transparent`);
    }
    assert.ok(deckend > 0, `${rel} ist vollständig leer`);
  });

  test(`${zweck}-PNG hält das Seitenverhältnis des Masters`, () => {
    const soll = bandMaster.breite / bandMaster.hoehe;
    const ist = img.w / img.h;
    assert.ok(
      Math.abs(ist - soll) < 0.01,
      `${rel}: ${ist.toFixed(4)}:1 weicht vom Master (${soll.toFixed(4)}:1) ab — die Marke ist verzerrt`,
    );
  });
}

test("Auflösungen decken beide Zwecke ab", () => {
  const [mail, print] = bilder;
  // E-Mail wird mit 196 px angezeigt → 2× für Bildschirme mit hoher Dichte.
  assert.equal(mail.img.w, 392, "E-Mail-Asset ist nicht 2× der Anzeigebreite");
  // PDF zeichnet mit ~150 pt → 1176 px entspricht ~564 dpi, klar über 300 dpi.
  assert.ok(print.img.w / (150 / 72) >= 300, "Druckasset liegt unter 300 dpi bei 150 pt Zeichenbreite");
  assert.equal(print.img.w, bandMaster.breite, "Druckasset ist nicht die native Bandbreite des Masters");
});

test("Rasterassets bleiben klein genug für E-Mail und PDF", () => {
  for (const { rel, zweck } of PNGS) {
    const kb = bin(rel).length / 1024;
    assert.ok(kb < 40, `${rel} ist mit ${kb.toFixed(1)} KB zu groß für ${zweck}`);
  }
});

/* ── 3 · Kein Claim im Rasterasset ────────────────────────────────────────── */

test("Exportscript schließt Signet und Claim aus", () => {
  // Das Band endet vor dem Claim (y ab 881) und beginnt nach dem Signet
  // (y bis 671) — die Grenzen stehen im Script, nicht bloß hier.
  assert.match(stripJs(script), /y0:\s*700/, "untere Bandgrenze fehlt");
  assert.match(stripJs(script), /y1:\s*870/, "obere Bandgrenze fehlt");
  assert.ok(bandMaster.anzahl === 23, "Bandfilter trifft nicht genau die Wortmarke");
});
