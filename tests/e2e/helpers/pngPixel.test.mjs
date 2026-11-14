// Prüft den PNG-Dekoder der Pixelmessungen (pngPixel.mjs) an selbst kodierten Bildern: alle fünf Zeilenfilter, RGB
// und RGBA, Tintenmaske, laute Fehler bei Formaten, die Chromium nicht schreibt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { dekodierePng, farbe, tintenmaske } from "./pngPixel.mjs";

const CRC_TABELLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABELLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function block(typ, daten) {
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(daten.length, 0);
  kopf.write(typ, 4, "ascii");
  const pruefsumme = Buffer.alloc(4);
  pruefsumme.writeUInt32BE(crc32(Buffer.concat([Buffer.from(typ, "ascii"), daten])), 0);
  return Buffer.concat([kopf, daten, pruefsumme]);
}

/** Kodiert `zeilen` (je Zeile ein Array von Bytes) mit dem je Zeile angegebenen Filter (0 bis 4). */
function kodiere({ w, h, kanaele, zeilen, filter, tiefe = 8 }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = tiefe;
  ihdr[9] = kanaele === 4 ? 6 : 2;
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const roh = [];
  zeilen.forEach((zeile, y) => {
    const f = filter[y];
    roh.push(f);
    zeile.forEach((v, x) => {
      const a = x >= kanaele ? zeile[x - kanaele] : 0;
      const b = y > 0 ? zeilen[y - 1][x] : 0;
      const c = x >= kanaele && y > 0 ? zeilen[y - 1][x - kanaele] : 0;
      const vorhersage = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      roh.push((v - vorhersage) & 255);
    });
  });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    block("IHDR", ihdr),
    block("IDAT", deflateSync(Buffer.from(roh))),
    block("IEND", Buffer.alloc(0)),
  ]);
}

const zufallszeilen = (w, h, kanaele, saat) => {
  let s = saat;
  const naechste = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s & 255; };
  return Array.from({ length: h }, () => Array.from({ length: w * kanaele }, naechste));
};

for (const kanaele of [3, 4]) {
  test(`dekodiert ${kanaele === 4 ? "RGBA" : "RGB"} mit allen fünf Zeilenfiltern bytegenau`, () => {
    const w = 7, h = 5;
    const zeilen = zufallszeilen(w, h, kanaele, 20261114 + kanaele);
    const bild = dekodierePng(kodiere({ w, h, kanaele, zeilen, filter: [0, 1, 2, 3, 4] }));
    assert.equal(bild.w, w);
    assert.equal(bild.h, h);
    assert.equal(bild.kanaele, kanaele);
    assert.deepEqual([...bild.px], zeilen.flat());
    assert.deepEqual(farbe(bild, 6, 4), zeilen[4].slice(6 * kanaele, 6 * kanaele + 3));
  });
}

test("Tintenmaske: Summe der RGB-Abstände über der Schwelle; der Alphakanal zählt nicht", () => {
  const leer = { w: 3, h: 1, kanaele: 4, px: Buffer.from([255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]) };
  const bild = { w: 3, h: 1, kanaele: 4, px: Buffer.from([255, 255, 255, 0, 205, 255, 255, 255, 0, 0, 0, 255]) };
  assert.deepEqual([...tintenmaske(bild, leer, 30)], [0, 1, 1]);
  assert.deepEqual([...tintenmaske(bild, leer, 50)], [0, 0, 1]);
  assert.throws(() => tintenmaske(bild, { ...leer, w: 2 }, 30), /Bildgrößen verschieden/);
});

test("scheitert laut bei Formaten, die Chromium nicht schreibt", () => {
  const zeilen = zufallszeilen(2, 2, 3, 7);
  assert.throws(() => dekodierePng(Buffer.from("kein Bild, nur Text")), /keine PNG-Signatur/);
  assert.throws(() => dekodierePng(kodiere({ w: 2, h: 2, kanaele: 3, zeilen, filter: [0, 0], tiefe: 16 })), /16 bit/);
  const unbekannterFilter = kodiere({ w: 2, h: 2, kanaele: 3, zeilen, filter: [0, 0] });
  const idat = unbekannterFilter.indexOf("IDAT");
  const laenge = unbekannterFilter.readUInt32BE(idat - 4);
  const kaputt = deflateSync(Buffer.from([5, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]));
  const ersetzt = Buffer.concat([unbekannterFilter.subarray(0, idat - 4), block("IDAT", kaputt), unbekannterFilter.subarray(idat + 4 + laenge + 4)]);
  assert.throws(() => dekodierePng(ersetzt), /unbekannter Zeilenfilter 5/);
});
