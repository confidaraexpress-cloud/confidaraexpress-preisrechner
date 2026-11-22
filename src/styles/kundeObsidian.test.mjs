// Governance der Gestaltungsebene des Kundenbereichs — eingeführt als „Confidara Obsidian“ (Betreiberauftrag
// „Resend-inspired Total Dashboard Redesign“, 2026-11-15), seit dem Betreiberauftrag „Premium Blue Light Edition“
// (2026-11-16) in der hellen Fassung „Confidara Premium Blue Light“; Datei- und Tokenname blieben. Die
// bereichsübergreifenden Design-Tests (designSystemClosure, designTokens, interfacePatterns, typography,
// premiumRedesign) führen kunde-obsidian.css und kunde-schriften.css als dokumentierte Ausnahme und verweisen für
// deren Grenzen hierher:
//   • jede Regel hängt an der Designfamilie (:root[data-ce-familie="blue-light"]: Kundenbereich, Partnerportal,
//     öffentliche Seiten — Betreiberauftrag „Final Master Release“, 2026-11-16; das Adminpanel trägt seit dem
//     2026-11-17 die eigene Ebene admin-nacht.css, adminNacht.test.mjs) oder an einem ihrer Bereiche; Anmeldung,
//     Admin-Anmeldung, Adminpanel und Preisrechner lesen die Ebene nie; einzige Ausnahme ist der Ladebildschirm der
//     Kundenpfade;
//   • Foundation-Tokens werden nur in den Tokenblöcken der Familie und des Kundenbereichs umgeordnet, Layout-Tokens
//     gar nicht;
//   • Tiefe, Glas und Unschärfe nur über Token, Schatten kühl (neutral oder Confidara-Blau), kein Schleier mit
//     Weichzeichnung;
//   • jede Animation nur ohne Wunsch nach reduzierter Bewegung; die ganze Ebene nur für den Bildschirm;
//   • Geometrie (Radien) und Produktschrift bleiben die des Bereichs;
//   • zwei zusätzliche OFL-Schriften, lokal, mit Lizenztext; keine fremde Quelle, keine fremde Marke;
//   • nur das Hauptbündel lädt die Ebene, der öffentliche Preisrechner nicht (Host Grotesk lädt er über fonts.css).
//
// Run: node --test src/styles/kundeObsidian.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const OBSIDIAN = ohneKommentare(read("./kunde-obsidian.css"));
const SCHRIFTEN = ohneKommentare(read("./kunde-schriften.css"));
const BEREICH = ':root[data-ce-bereich="kunde"]';
const FAMILIE = ':root[data-ce-familie="blue-light"]';
// Die Bereiche der Familie (hooks/useCeBereich.js, BLUE_LIGHT_FAMILIE) — nur sie tragen eigene Regeln der Ebene.
// Das Adminpanel gehört seit dem Betreiberauftrag vom 2026-11-17 nicht mehr zur Familie (eigene Ebene admin-nacht.css):
// Eine Regel am Adminbereich wäre hier ein fremder Selektor. Bewusste Ankeränderung (Betreiberauftrag 2026-11-22, D3):
// auch das Partnerportal trägt seither die Nachtwelt (partner-nacht.css) — eine Partnerregel wäre hier ebenso fremd.
const FAMILIENBEREICHE = ["kunde", "oeffentlich"].map((b) => `:root[data-ce-bereich="${b}"]`);

/** Zerlegt CSS in Regeln { selektor, rumpf, kontext }: @media/@supports werden geöffnet, @keyframes bleibt ganz. */
function regeln(css, kontext = []) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const auf = css.indexOf("{", i);
    if (auf < 0) break;
    const kopf = css.slice(i, auf).trim();
    let tiefe = 1;
    let j = auf + 1;
    while (j < css.length && tiefe > 0) {
      if (css[j] === "{") tiefe++;
      else if (css[j] === "}") tiefe--;
      j++;
    }
    const rumpf = css.slice(auf + 1, j - 1);
    if (/^@(media|supports|container|layer)\b/.test(kopf)) out.push(...regeln(rumpf, [...kontext, kopf]));
    else out.push({ selektor: kopf, rumpf, kontext });
    i = j;
  }
  return out;
}

/** Teilt eine Selektorliste an den Kommas der obersten Ebene (nicht in :is(…) oder […]). */
function teile(selektor) {
  const liste = [];
  let tiefe = 0;
  let start = 0;
  for (let k = 0; k < selektor.length; k++) {
    const c = selektor[k];
    if (c === "(" || c === "[") tiefe++;
    else if (c === ")" || c === "]") tiefe--;
    else if (c === "," && tiefe === 0) { liste.push(selektor.slice(start, k).trim()); start = k + 1; }
  }
  liste.push(selektor.slice(start).trim());
  return liste.filter(Boolean);
}

const REGELN = regeln(OBSIDIAN);
const KEYFRAMES = REGELN.filter((r) => r.selektor.startsWith("@keyframes"));
const STILREGELN = REGELN.filter((r) => !r.selektor.startsWith("@keyframes"));

test("O1 — jede Regel hängt an der Familie Blue Light oder einem ihrer Bereiche; einzige Ausnahme ist der Ladebildschirm", () => {
  // Der Leser erfasst die Datei vollständig: vom Tokenblock der Familie bis zur letzten Regel (Ladebildschirm).
  assert.ok(STILREGELN.length > 100, "die Ebene wurde nicht vollständig gelesen");
  assert.equal(STILREGELN[0].selektor, FAMILIE);
  assert.equal(STILREGELN.filter((r) => r.selektor === BEREICH).length, 1, "genau ein Tokenblock des Kundenbereichs");
  // Die hook-gesetzten Werte und die der Ebene laufen nicht auseinander.
  const hook = readFileSync(new URL("../hooks/useCeBereich.js", import.meta.url), "utf8");
  assert.match(hook, /BLUE_LIGHT_FAMILIE = Object\.freeze\(\["kunde", "oeffentlich"\]\)/);
  assert.match(hook, /setAttribute\("data-ce-familie", "blue-light"\)/);
  assert.equal(STILREGELN.at(-1).selektor, ".loading-screen.loading-screen--kunde");
  const fremd = [];
  const ladeschirm = [];
  for (const r of STILREGELN) {
    for (const s of teile(r.selektor)) {
      if (s.startsWith(FAMILIE) || FAMILIENBEREICHE.some((b) => s.startsWith(b))) continue;
      if (s === ".loading-screen.loading-screen--kunde") { ladeschirm.push(r.rumpf.trim()); continue; }
      fremd.push(s);
    }
  }
  assert.deepEqual(fremd, [], `Selektoren außerhalb der Familie:\n  ${fremd.join("\n  ")}`);
  // Nur für den Bildschirm: Gedruckt gelten die Druckregeln der Plattform (helles Blatt, dunkle Schrift) — sonst
  // druckte die helle Tinte auf weißes Papier (E2E buchungsschritte S3/S4). Darum keine eigene Druckregel.
  const ausserhalbBildschirm = REGELN.filter((r) => r.kontext[0] !== "@media screen").map((r) => r.selektor.slice(0, 80));
  assert.deepEqual(ausserhalbBildschirm, [], `Regeln außerhalb von @media screen:\n  ${ausserhalbBildschirm.join("\n  ")}`);
  assert.doesNotMatch(OBSIDIAN, /@media[^{]*\bprint\b/, "eigene Druckregel");
  // Die Ausnahme setzt nur den Grund — die Klasse vergibt LoadingScreen.jsx allein auf den Kundenpfaden
  // (utils/kundenBereichPfad.test.mjs, K4). Premium Blue Light (2026-11-16): das Blauweiß des Seitengrunds.
  assert.deepEqual(ladeschirm, ["background: #f5f8ff;"]);
  assert.match(OBSIDIAN, /--ce-ob-grund:\s*#f5f8ff;/, "Ladebildschirm und Seitengrund laufen auseinander");
  // Eigene Bewegungen tragen den Namensraum der Ebene.
  for (const k of KEYFRAMES) assert.match(k.selektor, /^@keyframes ce-ob-[\w-]+$/, k.selektor);
});

test("O2 — Foundation-Tokens werden nur in den Tokenblöcken der Familie und des Kundenbereichs umgeordnet, Layout-Tokens gar nicht", () => {
  const FOUNDATION = /--(ce-(?:color|radius|elevation|space|size|z|bp|font|text)-[\w-]+)\s*:/g;
  const ausserhalb = [];
  let umgeordnet = 0;
  for (const r of STILREGELN) {
    const treffer = [...r.rumpf.matchAll(FOUNDATION)].map((m) => m[1]);
    if (!treffer.length) continue;
    if ((r.selektor === FAMILIE || r.selektor === BEREICH) && r.kontext.join("|") === "@media screen") { umgeordnet += treffer.length; continue; }
    ausserhalb.push(`${r.selektor.slice(0, 80)}: ${treffer.join(", ")}`);
  }
  assert.deepEqual(ausserhalb, [], `Foundation-Tokens außerhalb des Tokenblocks:\n  ${ausserhalb.join("\n  ")}`);
  assert.ok(umgeordnet > 50, "der Tokenblock ordnet die Foundation-Rollen nicht mehr um");
  // Obsidian ändert Material, Farbe und Schrift — nie Abstände, Größen, Ebenen oder Umbruchpunkte.
  assert.doesNotMatch(OBSIDIAN, /--ce-(?:space|size|z|bp)-[\w-]+\s*:/, "Layout-Tokens umdefiniert");
  // Auch die Geometrie bleibt die des Bereichs: Radius-Skala und Bediensystem-Radien (E2E deliveryTimeFilter 7,
  // buchungsschritte S1/S2 messen sie).
  assert.doesNotMatch(OBSIDIAN, /--ce-(?:pr-)?radius-[\w-]+\s*:|--ce-pr-bs-radius[\w-]*\s*:/, "Radius-Skala umdefiniert");
});

test("O3 — Tiefe, Glas und Unschärfe nur über Token; kein Schleier mit Weichzeichnung; Bewegung nur auf Wunsch", () => {
  const frei = [];
  for (const r of STILREGELN) {
    for (const m of r.rumpf.matchAll(/(?:^|;)\s*((?:-webkit-)?(?:box-shadow|backdrop-filter|filter))\s*:\s*([^;]+)/g)) {
      const [, eigenschaft, wert] = m;
      const v = wert.trim();
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v)) frei.push(`${r.selektor.slice(0, 70)} → ${eigenschaft}: ${v}`);
      if (/backdrop-filter$/.test(eigenschaft)) {
        assert.equal(v, "var(--ce-ob-glas-weichzeichnung)", `${r.selektor.slice(0, 70)}: ${eigenschaft} ${v}`);
        assert.doesNotMatch(r.selektor, /overlay|dialog/i, `Weichzeichnung auf einem Schleier: ${r.selektor}`);
      }
      if (eigenschaft === "filter") assert.doesNotMatch(v, /blur\(/, `Unschärfe außerhalb der Begrüßung: ${r.selektor}`);
    }
  }
  assert.deepEqual(frei, [], `frei geschriebene Tiefe:\n  ${frei.join("\n  ")}`);
  assert.match(OBSIDIAN, /--ce-ob-glas-weichzeichnung:\s*blur\(var\(--ce-ob-glas-blur\)\) saturate\(140%\);/);

  // Glas, Filter und Transformation machen einen Baustein zum Bezugsrahmen seiner festen Kinder. Die mobile Kopfleiste
  // trägt solche Kinder (Klickfang und Mitteilungsfeld, notifications.css) — ihr Glas liegt auf ::before.
  for (const r of STILREGELN.filter((r) => /backdrop-filter\s*:/.test(r.rumpf))) {
    for (const s of teile(r.selektor)) {
      if (/\.mobile-topbar\b/.test(s)) assert.match(s, /\.mobile-topbar::before$/, `Glas an der Kopfleiste selbst: ${s}`);
    }
  }
  // Endet eine Bewegung mit stehendem Filter oder stehender Transformation, bewegt sie nur Pseudo-Elemente — sonst
  // bliebe nach der Animation (fill-mode both) ein Bezugsrahmen samt Stapelkontext am Baustein stehen.
  for (const k of KEYFRAMES) {
    const name = k.selektor.replace("@keyframes ", "");
    const ende = [...k.rumpf.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => m[1].split(",").map((x) => x.trim()).some((x) => x === "to" || x === "100%"))
      .map((m) => m[2]).join(";");
    const stehend = [...ende.matchAll(/(?:^|;)\s*(filter|transform|translate|scale|rotate)\s*:\s*([^;]+)/g)]
      .filter((m) => m[2].trim() !== "none").map((m) => m[1]);
    if (!stehend.length) continue;
    for (const r of STILREGELN.filter((r) => new RegExp(`animation(?:-name)?\\s*:\\s*${name}\\b`).test(r.rumpf))) {
      for (const s of teile(r.selektor)) {
        assert.match(s, /::(before|after)$/, `${name} lässt ${stehend.join(", ")} an ${s.slice(0, 80)} stehen`);
      }
    }
  }

  // Die Unschärfe gehört allein der einmaligen Begrüßung der Übersicht.
  assert.deepEqual(KEYFRAMES.filter((k) => /filter:\s*blur\(/.test(k.rumpf)).map((k) => k.selektor), ["@keyframes ce-ob-gruss"]);
  // Jede Animation der Ebene läuft nur ohne Wunsch nach reduzierter Bewegung; Übergänge schaltet „reduce“ ab.
  const animiert = STILREGELN.filter((r) => /(?:^|;)\s*animation(?:-name)?\s*:/.test(r.rumpf));
  assert.ok(animiert.length >= 3, "die Bewegungen der Ebene fehlen");
  for (const r of animiert) {
    assert.ok(r.kontext.some((k) => /prefers-reduced-motion:\s*no-preference/.test(k)),
      `Animation ohne Rücksicht auf reduzierte Bewegung: ${r.selektor.slice(0, 80)}`);
  }
  assert.ok(STILREGELN.some((r) => r.kontext.some((k) => /prefers-reduced-motion:\s*reduce/.test(k)) && /transition:\s*none/.test(r.rumpf)),
    "bei reduzierter Bewegung bleiben die Übergänge an");
  assert.ok(STILREGELN.some((r) => r.kontext.some((k) => /prefers-contrast:\s*more/.test(k))), "höherer Kontrast hat keine Antwort");
});

test("O4 — Schattentöne sind kühl; farbiges Licht gibt es nur als Zustand der Kennzahlkarten", () => {
  // Premium Blue Light (Betreiberauftrag 2026-11-16): Tiefe aus dem Navy der Tinte und dem Confidara-Blau. Erlaubt
  // ist neutral (Spreizung ≤ 12) oder die blaue Familie (Blau ≥ Grün ≥ Rot) — nie warm, grün oder violett.
  const bunt = [];
  const hexZuRgb = (h) => {
    const x = h.length <= 5 ? [...h.slice(1, 4)].map((c) => c + c).join("") : h.slice(1, 7);
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  };
  for (const m of OBSIDIAN.matchAll(/(--[\w-]*(?:schatten|lichtkante|elevation|shadow)[\w-]*)\s*:\s*([^;]+);/g)) {
    const farben = [...m[2].matchAll(/#[0-9a-f]{3,8}\b/gi)].map((h) => hexZuRgb(h[0]))
      .concat([...m[2].matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)].map((c) => [+c[1], +c[2], +c[3]]));
    for (const [r, g, b] of farben) {
      const neutral = Math.max(r, g, b) - Math.min(r, g, b) <= 12;
      const blau = b >= g && g >= r;
      if (!neutral && !blau) bunt.push(`${m[1]}: rgb(${r},${g},${b})`);
    }
  }
  assert.deepEqual(bunt, [], `Schatten außerhalb der kühlen Familie:\n  ${bunt.join("\n  ")}`);
  // Der Fokusring liest die eine Fokusfarbe des Bereichs (Confidara-Blau auf Blauweiß).
  assert.match(OBSIDIAN, /--ce-color-focus-ring:\s*rgba\(0, 74, 252, 0\.28\);/);
  // Der Lichthof der Kennzahlkarten trägt die Zustandsfarbe — gesetzt nur von den Zustandsklassen der Karte.
  const schein = STILREGELN.filter((r) => /--ce-ob-kpi-schein\s*:/.test(r.rumpf)).map((r) => r.selektor);
  assert.ok(schein.length >= 4, "die Zustände der Kennzahlkarten fehlen");
  for (const s of schein) assert.match(s, /^:root\[data-ce-bereich="kunde"\] \.ov-kpi(--[a-z]+)?$/, s);
});

test("O5 — Schriften: Arbeit in Instrument Sans, dazu zwei OFL-Familien, lokal, mit Lizenztext; Rollen über Tokens", () => {
  // Blue Light (2026-11-16): Host Grotesk ist Titelschrift der Plattform und steht in fonts.css (beide Bündel);
  // kunde-schriften.css trägt nur noch Instrument Serif (Begrüßung, Buchungserfolg).
  const plattform = regeln(ohneKommentare(read("./fonts.css"))).filter((r) => /font-family:\s*'Host Grotesk'/.test(r.rumpf));
  assert.equal(plattform.length, 2, "Host Grotesk: zwei Schnitte (latin, latin-ext) in fonts.css");
  const bloecke = [...regeln(SCHRIFTEN), ...plattform];
  assert.equal(regeln(SCHRIFTEN).length, 2, "kunde-schriften.css: Instrument Serif in zwei Schnitten");
  assert.deepEqual([...new Set(bloecke.map((r) => r.rumpf.match(/font-family:\s*'([^']+)'/)[1]))].sort(),
    ["Host Grotesk", "Instrument Serif"]);
  for (const r of bloecke) {
    assert.equal(r.selektor, "@font-face", `kunde-schriften.css trägt nur @font-face: ${r.selektor}`);
    assert.match(r.rumpf, /font-display:\s*swap;/);
    const quellen = [...r.rumpf.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ""));
    assert.equal(quellen.length, 1);
    for (const q of quellen) {
      assert.match(q, /^\.\.\/assets\/fonts\/[\w-]+\.woff2$/, `fremde Quelle: ${q}`);
      assert.ok(existsSync(new URL(q, import.meta.url)), `${q} fehlt`);
    }
  }
  for (const lizenz of ["OFL-HostGrotesk.txt", "OFL-InstrumentSerif.txt"]) {
    assert.match(read(`../../docs/lizenzen/${lizenz}`), /SIL OPEN FONT LICENSE/, `${lizenz}: kein OFL-Text`);
  }
  // Rollen: Arbeit, Zahlen und Beträge in der Produktschrift Instrument Sans (fonts.css), Überschriften und Kennzahlen
  // in Host Grotesk, die Begrüßung in Instrument Serif.
  assert.match(OBSIDIAN, /--ce-ob-schrift-text:\s*var\(--ce-font-sans\);/);
  assert.match(OBSIDIAN, /--ce-ob-schrift-titel:\s*'Host Grotesk', var\(--ce-font-sans\);/);
  assert.match(OBSIDIAN, /--ce-ob-schrift-editorial:\s*'Instrument Serif',/);
  // Die Breitenachse bleibt wirksam: Das Layout ist auf Instrument Sans mit 78/88 % vermessen (Unterzeile der Marke,
  // Zeitleiste bei 390 px, Beträge in Tabellen — E2E brandIdentity 1, deliveryTimeOfDay R).
  assert.doesNotMatch(OBSIDIAN, /--ce-font-(?:sans|numeric)\s*:/, "die Produktschrift ist ersetzt");
  assert.doesNotMatch(OBSIDIAN, /--ce-pr-ed-(?:figure|amount|tagline)-stretch\s*:/, "die Breitenachse ist abgeschaltet");
  for (const m of OBSIDIAN.matchAll(/(?:^|[{;])\s*font-family:\s*([^;}]+)/g)) {
    assert.match(m[1].trim(), /^(var\(--ce-ob-schrift-(text|titel|editorial)\)|inherit)$/, `freie Schriftangabe: ${m[1]}`);
  }
  assert.equal([...OBSIDIAN.matchAll(/font-family:\s*var\(--ce-ob-schrift-editorial\)/g)].length, 1,
    "die Serife bleibt der Begrüßung vorbehalten");
  // Resends kommerzielle Schriften sind weder geladen noch genannt.
  assert.doesNotMatch(`${OBSIDIAN}\n${SCHRIFTEN}`, /Favorit|Domaine/i);
});

test("O6 — nur das Hauptbündel lädt die Ebene; der öffentliche Preisrechner nicht", () => {
  const index = read("./index.css");
  // Danach nur noch die Adminebene (Confidara Leitstand Nacht, 2026-11-17; adminNacht.test.mjs).
  assert.match(index, /@import '\.\/kunde-schriften\.css';\s*@import '\.\/kunde-obsidian\.css';\s*(?:\/\*[\s\S]*?\*\/\s*)?@import '\.\/partner-nacht\.css';\s*(?:\/\*[\s\S]*?\*\/\s*)?@import '\.\/admin-nacht\.css';\s*$/);
  // Blue Light (2026-11-16): Host Grotesk für die Displayrolle des Rechners kommt aus fonts.css; Instrument Serif und
  // die Gestaltungsebene bleiben draußen (Bündelbudget, E2E publicCalculatorBuild B2).
  assert.doesNotMatch(ohneKommentare(read("./public-calculator.css")), /kunde-(?:obsidian|schriften)\.css|index\.css/);
  assert.doesNotMatch(read("../public-calculator/main.jsx"), /styles\/index\.css|kunde-/);
  for (const f of readdirSync(new URL("./", import.meta.url)).filter((f) => f.endsWith(".css") && f !== "index.css")) {
    assert.doesNotMatch(ohneKommentare(read(`./${f}`)), /@import\s+['"]\.\/kunde-/, `${f} importiert die Obsidian-Ebene`);
  }
});

test("O7 — keine fremde Quelle, keine fremde Marke", () => {
  for (const [name, css] of [["kunde-obsidian.css", OBSIDIAN], ["kunde-schriften.css", SCHRIFTEN]]) {
    assert.doesNotMatch(css, /url\(\s*['"]?(?:https?:)?\/\//i, `${name}: externe Quelle`);
    assert.doesNotMatch(css, /@import/i, `${name}: @import`);
    assert.doesNotMatch(css, /resend/i, `${name}: fremder Markenname außerhalb der Kommentare`);
  }
  const assets = readdirSync(new URL("../assets/", import.meta.url), { recursive: true }).map(String);
  assert.deepEqual(assets.filter((a) => /resend/i.test(a)), [], "fremde Markendatei unter src/assets");
});
