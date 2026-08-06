// O1 — Trägt die ausgelieferte DM-Sans-Datei eine echte Gewichtsachse?
//
// Die Frage entscheidet, welches Schriftgewicht das Designsystem verbindlich
// als höchstes UI-Gewicht führen darf (Paket A, Typografiestufen). Sie lässt
// sich NICHT aus Dateinamen oder CSS-Deklarationen beantworten: `dmsans-300.woff2`
// heißt zwar „300", und fonts.css deklariert 300/400/500/600 — alle vier zeigen
// aber auf dieselbe Datei. Ob dahinter echte Instanzen oder viermal derselbe
// Schnitt stecken, sieht man erst an der gerenderten Form.
//
// Zwei unabhängige Messungen, beide ohne Dev-Server:
//
//   1. BINÄR — das WOFF2-Tabellenverzeichnis wird gelesen (es liegt vor dem
//      komprimierten Datenstrom und ist ohne Dekomprimierung auswertbar).
//      Eine Datei mit `fvar` + `gvar` ist ein echter Variable Font.
//
//   2. GERENDERT — dieselbe Datei wird im Browser einmal als Achse
//      (`font-weight: 100 1000`) und einmal gepinnt (`font-weight: 600`)
//      registriert. Gemessen wird die Vorschubbreite mit ABGESCHALTETER
//      Kunstfettung (`font-synthesis: none`): nur so lässt sich ein echter
//      Schnitt von einem synthetisch fettgerechneten unterscheiden.
//      • Achse  → 400/500/600/700 müssen paarweise verschiedene Breiten liefern.
//      • Gepinnt → 400/600/700 müssen IDENTISCHE Breiten liefern. Diese
//        Kontrollprobe belegt, dass die Messung ein „kein Unterschied" auch
//        wirklich erkennen würde, und erklärt zugleich, warum die heutigen
//        Einzelwert-Deklarationen kein 700 erreichen können.
//
// Ergebnis dieser Prüfung (Stand Phase 1): Die Achse trägt 300–800 in klar
// getrennten Instanzen. 700 ist damit in der Datei VORHANDEN, aber erst nutzbar,
// sobald fonts.css eine entsprechende Instanz deklariert — ohne neue Schriftdatei.
// Solange das nicht geschehen ist, bleibt 600 das höchste verbindliche UI-Gewicht.
//
// Run: npm run test:e2e
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const REPO_ROOT = new URL("../..", import.meta.url).pathname;
const FONT_DATEI = path.join(REPO_ROOT, "src/assets/fonts/dmsans-300.woff2");

function chromiumExecutablePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root) {
    const kandidat = path.join(root, "chromium");
    if (existsSync(kandidat)) return kandidat;
  }
  return undefined;
}

// Tabellenkennungen 0–62 der WOFF2-Spezifikation (Index 63 = beliebige Kennung).
const WOFF2_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm",
  "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern",
  "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC",
  "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty",
  "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
  "Gloc", "Feat", "Sill",
];

function woff2Tabellen(datei) {
  const buf = readFileSync(datei);
  assert.equal(buf.toString("ascii", 0, 4), "wOF2", "keine WOFF2-Datei");
  const anzahl = buf.readUInt16BE(12);
  let off = 48; // Länge des WOFF2-Headers
  const base128 = () => {
    let wert = 0;
    for (let i = 0; i < 5; i++) {
      const b = buf[off++];
      wert = (wert << 7) | (b & 0x7f);
      if (!(b & 0x80)) return wert;
    }
    throw new Error("ungültige UIntBase128-Zahl im Tabellenverzeichnis");
  };
  const tags = [];
  for (let i = 0; i < anzahl; i++) {
    const flags = buf[off++];
    const index = flags & 0x3f;
    const transform = (flags >> 6) & 0x03;
    let tag;
    if (index === 63) { tag = buf.toString("ascii", off, off + 4); off += 4; } else { tag = WOFF2_TAGS[index]; }
    base128(); // origLength
    const istGlyfLoca = tag === "glyf" || tag === "loca";
    if (istGlyfLoca ? transform === 0 : transform !== 0) base128(); // transformLength
    tags.push(tag);
  }
  return tags;
}

let browser = null;
before(async () => { browser = await chromium.launch({ executablePath: chromiumExecutablePath() }); });
after(async () => { if (browser) await browser.close(); });

test("1 — die ausgelieferte DM-Sans-Datei ist ein echter Variable Font (fvar + gvar)", () => {
  assert.ok(existsSync(FONT_DATEI), "dmsans-300.woff2 fehlt");
  const tags = woff2Tabellen(FONT_DATEI);
  assert.ok(tags.includes("fvar"), `keine Variationsachsen (fvar) in der Datei — Tabellen: ${tags.join(" ")}`);
  assert.ok(tags.includes("gvar"), `keine variablen Glyphen (gvar) in der Datei — Tabellen: ${tags.join(" ")}`);
});

test("2 — die Gewichtsachse rendert 400/500/600/700 als eigenständige Schnitte", async () => {
  const page = await browser.newPage();
  await page.goto("about:blank");
  const dataUri = `data:font/woff2;base64,${readFileSync(FONT_DATEI).toString("base64")}`;

  const messung = await page.evaluate(async (uri) => {
    const registriere = async (familie, gewicht) => {
      const face = new FontFace(familie, `url(${uri})`, { weight: gewicht });
      await face.load();
      document.fonts.add(face);
    };
    await registriere("AchsenProbe", "100 1000");
    await registriere("GepinnteProbe", "600");

    const PROBE = "Beträge 0123456789 Sendung";
    const breite = (familie, gewicht) => {
      const s = document.createElement("span");
      s.textContent = PROBE;
      // font-synthesis: none verhindert Kunstfettung — ohne das könnte der
      // Browser ein fehlendes 700 selbst „fett rechnen" und die Messung wäre
      // wertlos.
      s.style.cssText =
        "position:absolute;left:-9999px;white-space:pre;font-size:100px;" +
        "font-synthesis:none;-webkit-font-synthesis:none;" +
        `font-family:"${familie}";font-weight:${gewicht};`;
      document.body.appendChild(s);
      const w = s.getBoundingClientRect().width;
      s.remove();
      return Math.round(w * 1000) / 1000;
    };

    const achse = {}, gepinnt = {};
    for (const g of [400, 500, 600, 700]) {
      await document.fonts.load(`${g} 100px "AchsenProbe"`);
      achse[g] = breite("AchsenProbe", g);
    }
    for (const g of [400, 600, 700]) {
      await document.fonts.load(`${g} 100px "GepinnteProbe"`);
      gepinnt[g] = breite("GepinnteProbe", g);
    }
    return { achse, gepinnt };
  }, dataUri);

  const { achse, gepinnt } = messung;

  // Kontrollprobe zuerst: Eine Einzelwert-Deklaration pinnt die Instanz. Wenn
  // das NICHT gilt, misst der Test etwas anderes als gedacht.
  assert.equal(gepinnt[400], gepinnt[600],
    `Kontrollprobe verletzt: gepinnte Deklaration liefert für 400 und 600 verschiedene Breiten (${gepinnt[400]} vs ${gepinnt[600]})`);
  assert.equal(gepinnt[700], gepinnt[600],
    `Kontrollprobe verletzt: gepinnte Deklaration liefert für 700 und 600 verschiedene Breiten (${gepinnt[700]} vs ${gepinnt[600]})`);

  // Die eigentliche Aussage: über die Achse sind die vier Gewichte getrennt.
  const paare = [[400, 500], [500, 600], [600, 700]];
  for (const [a, b] of paare) {
    assert.notEqual(achse[a], achse[b],
      `Gewicht ${a} und ${b} rendern identisch (${achse[a]}px) — die Achse trägt diesen Bereich nicht`);
  }
  // Monoton steigend: schwerer heißt breiter. Schützt davor, dass zufällige
  // Unterschiede (etwa durch Fallback auf eine andere Familie) als Achse gelten.
  assert.ok(achse[400] < achse[500] && achse[500] < achse[600] && achse[600] < achse[700],
    `Breiten steigen nicht monoton mit dem Gewicht: ${JSON.stringify(achse)}`);

  await page.close();
});

test("3 — keine externe Schriftquelle, keine zusätzliche Schriftdatei", () => {
  const fonts = readFileSync(path.join(REPO_ROOT, "src/styles/fonts.css"), "utf8");
  assert.ok(!/https?:\/\//.test(fonts),
    "fonts.css darf keine externe Schriftquelle laden (DSGVO: keine Google-Fonts-Anfrage)");
  // GENAU diese Dateien liegen im Verzeichnis — keine mehr und keine weniger.
  // Libre Franklin ist mit dem Abschlusspaket entfallen (Familie ausgelaufen,
  // keine Referenz, keine @font-face-Regel). Der Vergleich läuft deshalb in
  // beide Richtungen statt nur auf Existenz: er fällt jetzt auch dann, wenn
  // jemand eine dritte Familie hinzulegt.
  const erwartet = [
    "cormorantgaramond-400-italic.woff2", "cormorantgaramond-400.woff2",
    "dmsans-300-italic.woff2", "dmsans-300.woff2",
  ];
  const vorhanden = readdirSync(path.join(REPO_ROOT, "src/assets/fonts"))
    .filter((f) => f.endsWith(".woff2")).sort();
  assert.deepEqual(vorhanden, [...erwartet].sort(), "der Bestand an Schriftdateien hat sich verändert");
  // Und fonts.css lädt genau die beiden Familien, die das Produkt benutzt.
  const familien = [...new Set([...fonts.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(familien, ["Cormorant Garamond", "DM Sans"]);
});
