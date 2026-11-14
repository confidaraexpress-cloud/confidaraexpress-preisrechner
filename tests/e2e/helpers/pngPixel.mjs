// Bildpunkte aus Playwright-Bildschirmfotos für Pixelmessungen der E2E-Suiten (Titel-Malrand, Buchungsschritte;
// 2026-11-14).
//
// Gemessen wird immer gegen ein zweites Foto desselben Ausschnitts aus demselben Lauf, nie gegen ein Referenzbild.
// Die Messungen sind deshalb auf Windows und Linux gleich belastbar, obwohl die Schriftglättung dort verschieden ist.
//
// Der Dekoder kann genau das, was Chromium schreibt: 8 bit je Kanal, RGB oder RGBA, ohne Interlace. Alles andere
// scheitert laut, statt still etwas Falsches zu messen.
import { inflateSync } from "node:zlib";

const PNG_SIGNATUR = 0x89504e47;

/** PNG-Puffer → { w, h, kanaele, px } mit px als Bytefolge Zeile für Zeile (RGB oder RGBA). */
export function dekodierePng(buf) {
  if (buf.readUInt32BE(0) !== PNG_SIGNATUR) throw new Error("keine PNG-Signatur");
  let off = 8, kopf = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const typ = buf.toString("ascii", off + 4, off + 8);
    const daten = buf.subarray(off + 8, off + 8 + len);
    if (typ === "IHDR") {
      kopf = { w: daten.readUInt32BE(0), h: daten.readUInt32BE(4), tiefe: daten[8], farbtyp: daten[9], interlace: daten[12] };
    } else if (typ === "IDAT") idat.push(daten);
    else if (typ === "IEND") break;
    off += 12 + len;
  }
  if (!kopf) throw new Error("PNG ohne IHDR");
  if (kopf.tiefe !== 8) throw new Error(`PNG mit ${kopf.tiefe} bit je Kanal (erwartet 8)`);
  if (kopf.farbtyp !== 2 && kopf.farbtyp !== 6) throw new Error(`PNG-Farbtyp ${kopf.farbtyp} (erwartet 2 RGB oder 6 RGBA)`);
  if (kopf.interlace !== 0) throw new Error("PNG mit Interlace");

  const kanaele = kopf.farbtyp === 6 ? 4 : 3;
  const zeilenlaenge = kopf.w * kanaele;
  const roh = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(kopf.h * zeilenlaenge);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < kopf.h; y++) {
    const start = y * (zeilenlaenge + 1);
    const filter = roh[start];
    if (filter > 4) throw new Error(`unbekannter Zeilenfilter ${filter}`);
    for (let x = 0; x < zeilenlaenge; x++) {
      const a = x >= kanaele ? px[y * zeilenlaenge + x - kanaele] : 0;
      const b = y > 0 ? px[(y - 1) * zeilenlaenge + x] : 0;
      const c = x >= kanaele && y > 0 ? px[(y - 1) * zeilenlaenge + x - kanaele] : 0;
      const v = roh[start + 1 + x];
      px[y * zeilenlaenge + x] = filter === 0 ? v
        : filter === 1 ? (v + a) & 255
        : filter === 2 ? (v + b) & 255
        : filter === 3 ? (v + ((a + b) >> 1)) & 255
        : (v + paeth(a, b, c)) & 255;
    }
  }
  return { w: kopf.w, h: kopf.h, kanaele, px };
}

/** Farbe eines Bildpunkts als [r, g, b]. */
export function farbe(bild, x, y) {
  const o = (y * bild.w + x) * bild.kanaele;
  return [bild.px[o], bild.px[o + 1], bild.px[o + 2]];
}

/**
 * Tintenmaske: 1, wo sich `bild` von `leer` (derselbe Ausschnitt ohne das gemessene Element) um mehr als `schwelle`
 * unterscheidet — gemessen als Summe der Abstände in Rot, Grün und Blau (0 bis 765). Beide Bilder müssen gleich groß sein.
 */
export function tintenmaske(bild, leer, schwelle) {
  if (bild.w !== leer.w || bild.h !== leer.h) throw new Error(`Bildgrößen verschieden: ${bild.w}×${bild.h} / ${leer.w}×${leer.h}`);
  const maske = new Uint8Array(bild.w * bild.h);
  for (let i = 0; i < maske.length; i++) {
    const o = i * bild.kanaele, q = i * leer.kanaele;
    const abstand = Math.abs(bild.px[o] - leer.px[q]) + Math.abs(bild.px[o + 1] - leer.px[q + 1]) + Math.abs(bild.px[o + 2] - leer.px[q + 2]);
    if (abstand > schwelle) maske[i] = 1;
  }
  return maske;
}
