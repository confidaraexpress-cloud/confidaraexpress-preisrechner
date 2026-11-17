// Governance der dunklen Gestaltungsebene des Adminpanels „Confidara Leitstand Nacht“ (Betreiberauftrag
// „Adminpanel-Redesign im Resend-Stil + Admin-Login Ultra-Premium“, 2026-11-17, Canonical v2.143). Die bereichs-
// übergreifenden Design-Tests (designSystemClosure, interfacePatterns, typography, premiumRedesign, kundeObsidian)
// führen admin-nacht.css als dokumentierte Ausnahme und verweisen für deren Grenzen hierher:
//   • jede Regel hängt an :root[data-ce-bereich="admin"] und gilt nur am Bildschirm; das Adminpanel gehört nicht mehr
//     zur Familie Blue Light (kunde-obsidian.css trägt keine Adminregel mehr);
//   • Foundation-Tokens werden nur im einen Tokenblock umgeordnet, Layout-Tokens gar nicht; die Typografie bleibt die
//     der Familie (gleiche Werte), Schriften nur über die beiden Rollen;
//   • Tiefe, Glas und Licht nur über Token; Glas nie auf Schleier oder Dialog;
//   • Bewegung nur ohne Wunsch nach reduzierter Bewegung, nur Deckkraft und Transformation;
//   • Lesbarkeit: Text- und Konturkontraste nach WCAG 2.2 AA, dazu Antworten auf erhöhten Kontrast und erzwungene Farben;
//   • keine fremde Quelle, kein @import, keine fremde Marke; nur das Hauptbündel lädt die Ebene, als letzte.
//
// Run: node --test src/styles/adminNacht.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const NACHT_ROH = read("./admin-nacht.css");
const NACHT = ohneKommentare(NACHT_ROH);
const ADMIN = ':root[data-ce-bereich="admin"]';

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

/** Eigenschaften eines Regelrumpfs als Map (letzter Wert gewinnt). */
function deklarationen(rumpf) {
  const m = new Map();
  for (const d of rumpf.matchAll(/(--?[\w-]+)\s*:\s*([^;]+);?/g)) m.set(d[1], d[2].trim());
  return m;
}

const REGELN = regeln(NACHT);
const STILREGELN = REGELN.filter((r) => !r.selektor.startsWith("@keyframes"));
const KEYFRAMES = REGELN.filter((r) => r.selektor.startsWith("@keyframes"));
const TOKENBLOECKE = STILREGELN.filter((r) => r.selektor === ADMIN && r.kontext.length === 1);
const TOKENS = deklarationen(TOKENBLOECKE[0]?.rumpf ?? "");

/** Löst var(--x) eines Tokens rekursiv auf (nur einfache Werte). */
function wert(name, tiefe = 0) {
  const v = TOKENS.get(name);
  assert.ok(v !== undefined, `Token ${name} fehlt`);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  return ref && tiefe < 8 ? wert(ref[1], tiefe + 1) : v;
}

/** Farbe als [r, g, b, a] aus #rgb, #rrggbb oder rgba(). */
function farbe(text) {
  const t = text.trim();
  const hex = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const x = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)).concat(1);
  }
  const f = t.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  assert.ok(f, `keine einfache Farbe: ${t}`);
  return [+f[1], +f[2], +f[3], f[4] === undefined ? 1 : +f[4]];
}
const ueber = ([r, g, b, a], [r2, g2, b2]) => [r * a + r2 * (1 - a), g * a + g2 * (1 - a), b * a + b2 * (1 - a), 1];
const alsHex = (rgb) => `#${rgb.slice(0, 3).map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
function leuchtdichte([r, g, b]) {
  const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function kontrast(vorne, hinten) {
  const h = farbe(hinten);
  const v = ueber(farbe(vorne), h);
  const [l1, l2] = [leuchtdichte(v), leuchtdichte(h)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

test("N1 — jede Regel hängt am Adminbereich und gilt nur am Bildschirm; die Familie Blue Light ist ohne Admin", () => {
  assert.ok(STILREGELN.length > 80, "die Ebene wurde nicht vollständig gelesen");
  const fremd = [];
  for (const r of STILREGELN) for (const s of teile(r.selektor)) if (!s.startsWith(ADMIN)) fremd.push(s);
  assert.deepEqual(fremd, [], `Selektoren außerhalb des Adminbereichs:\n  ${fremd.join("\n  ")}`);
  const ausserhalb = REGELN.filter((r) => r.kontext[0] !== "@media screen").map((r) => r.selektor.slice(0, 80));
  assert.deepEqual(ausserhalb, [], `Regeln außerhalb von @media screen:\n  ${ausserhalb.join("\n  ")}`);
  assert.doesNotMatch(NACHT, /@media[^{]*\bprint\b/, "eigene Druckregel");
  // Der Bereich kommt vom Layout des Adminpanels; die Familie vergibt der Hook nur an Kunde, Partner, Öffentlich.
  const hook = read("../hooks/useCeBereich.js");
  assert.match(hook, /BLUE_LIGHT_FAMILIE = Object\.freeze\(\["kunde", "partner", "oeffentlich"\]\)/);
  assert.match(read("../components/layout/AdminLayout.jsx"), /useCeBereich\("admin"\)/);
  // Die Ebene der Familie trägt keine Adminregel mehr (sie liefe sonst gegen undefinierte Familientokens).
  assert.doesNotMatch(ohneKommentare(read("./kunde-obsidian.css")), /data-ce-bereich="admin"|\.adm-/);
});

test("N2 — Foundation-Tokens nur im einen Tokenblock, Layout-Tokens nie; die Typografie bleibt die der Familie", () => {
  assert.equal(TOKENBLOECKE.length, 1, "genau ein Tokenblock des Adminbereichs");
  assert.equal(STILREGELN.indexOf(TOKENBLOECKE[0]), 0, "der Tokenblock steht am Anfang der Ebene");
  const fremdeFoundation = [];
  for (const r of STILREGELN) {
    if (r === TOKENBLOECKE[0]) continue;
    for (const m of r.rumpf.matchAll(/(--ce-[\w-]+)\s*:/g)) fremdeFoundation.push(`${r.selektor.slice(0, 60)}: ${m[1]}`);
  }
  assert.deepEqual(fremdeFoundation, [], `Foundation-Tokens außerhalb des Tokenblocks:\n  ${fremdeFoundation.join("\n  ")}`);
  const layout = [...NACHT.matchAll(/(--ce-(?:space|radius|z|bp|size|layout|container|shell|gap|gutter)-[\w-]*)\s*:/g)].map((m) => m[1]);
  assert.deepEqual(layout, [], `Layout-Tokens umdefiniert: ${layout.join(", ")}`);
  // Die Adminebene ersetzt die Familie für das Adminpanel — Schriftgrößen, Zeilenhöhen und Gewichte bleiben dieselben.
  const familienblock = regeln(ohneKommentare(read("./kunde-obsidian.css")))
    .find((r) => r.selektor === ':root[data-ce-familie="blue-light"]');
  assert.ok(familienblock, "Tokenblock der Familie nicht gefunden");
  const familie = deklarationen(familienblock.rumpf);
  // Verweise auf die eigenen Schriftrollen (--adm-schrift-* hier, --ce-ob-schrift-* dort) werden aufgelöst verglichen.
  const aufgeloest = (map, name, tiefe = 0) => {
    const v = map.get(name);
    const ref = v?.match(/^var\((--[\w-]+)\)$/);
    return ref && map.has(ref[1]) && tiefe < 8 ? aufgeloest(map, ref[1], tiefe + 1) : v;
  };
  const typo = [...TOKENS.keys()].filter((k) => /^--ce-(?:text|weight|font)-/.test(k));
  assert.ok(typo.length >= 10, "die Typografie der Familie wurde nicht übernommen");
  const abweichend = typo.filter((k) => familie.has(k) && aufgeloest(familie, k) !== aufgeloest(TOKENS, k))
    .map((k) => `${k}: ${aufgeloest(TOKENS, k)} ≠ ${aufgeloest(familie, k)}`);
  assert.deepEqual(abweichend, [], `Typografie weicht von der Familie ab:\n  ${abweichend.join("\n  ")}`);
  const fehlend = typo.filter((k) => !familie.has(k));
  assert.deepEqual(fehlend, [], `Typografie-Tokens ohne Gegenstück in der Familie: ${fehlend.join(", ")}`);
});

test("N3 — Tiefe, Glas und Licht nur über Token; kein Schleier und kein Dialog mit Weichzeichnung", () => {
  assert.equal(wert("--adm-glas-weichzeichnung"), "blur(var(--adm-glas-blur)) saturate(150%)");
  assert.match(wert("--adm-glas-blur"), /^\d+px$/);
  for (const r of STILREGELN) {
    if (r === TOKENBLOECKE[0]) continue;
    const d = deklarationen(r.rumpf);
    for (const eigenschaft of ["backdrop-filter", "-webkit-backdrop-filter"]) {
      if (!d.has(eigenschaft)) continue;
      assert.equal(d.get(eigenschaft), "var(--adm-glas-weichzeichnung)", `${r.selektor}: ${eigenschaft}`);
      assert.doesNotMatch(r.selektor, /overlay|dialog|modal|drawer/i, `${r.selektor}: Glas auf Schleier oder Dialog`);
    }
    for (const eigenschaft of ["box-shadow", "filter"]) {
      const v = d.get(eigenschaft);
      if (v === undefined) continue;
      assert.doesNotMatch(v, /#[0-9a-f]{3,8}\b|rgba?\(|blur\(/i, `${r.selektor}: ${eigenschaft} frei geschrieben (${v})`);
    }
  }
});

test("N4 — Bewegung nur auf Wunsch, nur Deckkraft und Transformation, ruhig getaktet", () => {
  const animiert = STILREGELN.filter((r) => /(?:^|[;\s])animation(?:-name)?\s*:\s*(?!none)/.test(r.rumpf));
  assert.ok(animiert.length >= 1, "die Dialoge öffnen ohne Bewegung");
  for (const r of animiert) {
    assert.ok(r.kontext.includes("@media (prefers-reduced-motion: no-preference)"), `${r.selektor}: Animation ohne Wunschabfrage`);
  }
  assert.ok(KEYFRAMES.length >= 1);
  for (const k of KEYFRAMES) {
    assert.match(k.selektor, /^@keyframes ce-adm-[\w-]+$/, `${k.selektor}: Name außerhalb des Namensraums`);
    const eigenschaften = [...k.rumpf.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
    for (const e of eigenschaften) assert.ok(["opacity", "transform"].includes(e), `${k.selektor}: animiert ${e}`);
  }
  // Übergänge nur auf Farben, Schatten, Deckkraft und Lage — nie auf Maße.
  for (const r of STILREGELN) {
    const t = deklarationen(r.rumpf).get("transition");
    if (!t || t === "none") continue;
    for (const teil of t.split(",")) {
      const eigenschaft = teil.trim().split(/\s+/)[0];
      assert.ok(["background-color", "color", "box-shadow", "border-color", "opacity", "transform", "background-position"].includes(eigenschaft),
        `${r.selektor}: Übergang auf ${eigenschaft}`);
    }
  }
  assert.ok(STILREGELN.some((r) => r.kontext.includes("@media (prefers-reduced-motion: reduce)")), "keine Antwort auf reduzierte Bewegung");
  assert.match(wert("--adm-dauer"), /^\d+ms$/);
  assert.ok(parseInt(wert("--adm-dauer-lang"), 10) <= 320, "Dialoge öffnen zu langsam");
});

test("N5 — Lesbarkeit: Text- und Konturkontraste nach WCAG 2.2 AA; erhöhter Kontrast und erzwungene Farben", () => {
  const grund = wert("--adm-grund");
  const flaechen = ["--adm-grund", "--adm-flaeche-1", "--adm-flaeche-2"].map((t) => wert(t));
  // Fließtext, Zweittext, gedämpfter Text und Platzhalter auf jeder Arbeitsfläche ≥ 4,5:1 (Haupttext ≥ 7:1).
  for (const f of flaechen) {
    assert.ok(kontrast(wert("--adm-tinte"), f) >= 7, `Tinte auf ${f}`);
    for (const t of ["--adm-tinte-2", "--adm-tinte-3", "--adm-tinte-4", "--adm-signal-tinte"]) {
      assert.ok(kontrast(wert(t), f) >= 4.5, `${t} auf ${f}: ${kontrast(wert(t), f).toFixed(2)}`);
    }
    // Kontur von Feldern und Zweitaktionen ≥ 3:1 (WCAG 1.4.11), beim Zeigen deutlicher.
    assert.ok(kontrast(wert("--adm-kante-feld"), f) >= 3, `Feldkontur auf ${f}: ${kontrast(wert("--adm-kante-feld"), f).toFixed(2)}`);
    assert.ok(kontrast(wert("--adm-kante-feld-zeigen"), f) > kontrast(wert("--adm-kante-feld"), f));
  }
  // Seitenleiste: Einträge und Gruppen auf dem dunkelsten und dem hellsten Ton des Verlaufs.
  for (const f of ["#0a1226", "#040814"]) {
    assert.ok(kontrast(wert("--adm-seite-text"), f) >= 4.5, `Seitenleiste auf ${f}`);
    assert.ok(kontrast(wert("--adm-seite-text-leise"), f) >= 4.5, `leise Seitenleiste auf ${f}`);
    const gruppe = alsHex(ueber(farbe(wert("--adm-seite-gruppe-flaeche")), farbe(f)));
    assert.ok(kontrast(wert("--adm-seite-gruppe"), gruppe) >= 4.5, `Gruppe auf ${f}: ${kontrast(wert("--adm-seite-gruppe"), gruppe).toFixed(2)}`);
  }
  // Zustände: helle Schrift auf getönter Fläche über der Karte.
  for (const z of ["gruen", "bernstein", "rot", "blau", "grau"]) {
    const ton = alsHex(ueber(farbe(wert(`--adm-${z}-ton`)), farbe(wert("--adm-flaeche-1"))));
    assert.ok(kontrast(wert(`--adm-${z}`), ton) >= 4.5, `Zustand ${z}: ${kontrast(wert(`--adm-${z}`), ton).toFixed(2)}`);
  }
  assert.ok(kontrast(wert("--adm-tinte-invers"), "#ffffff") >= 7, "Hauptaktion: dunkle Schrift auf Weiß");
  assert.ok(kontrast(wert("--adm-tinte"), grund) >= 15);
  // Erhöhter Kontrast hebt Kanten, Linien und Zweittexte an; erzwungene Farben nehmen Lichtband und Leuchten weg.
  const mehr = STILREGELN.find((r) => r.kontext.includes("@media (prefers-contrast: more)"));
  assert.ok(mehr, "keine Antwort auf erhöhten Kontrast");
  for (const t of ["--adm-kante", "--adm-linie", "--adm-tinte-2", "--adm-tinte-3", "--adm-seite-text"]) {
    assert.ok(deklarationen(mehr.rumpf).has(t), `erhöhter Kontrast ohne ${t}`);
  }
  const erzwungen = STILREGELN.filter((r) => r.kontext.includes("@media (forced-colors: active)"));
  assert.ok(erzwungen.some((r) => /::after/.test(r.selektor) && /content:\s*none/.test(r.rumpf)));
  assert.ok(erzwungen.some((r) => /filter:\s*none/.test(r.rumpf)));
});

test("N6 — Schriften nur über die beiden Rollen: Arbeit in der Produktschrift, Überschriften in Host Grotesk", () => {
  assert.equal(TOKENS.get("--adm-schrift-text"), "var(--ce-font-sans)");
  assert.match(TOKENS.get("--adm-schrift-titel"), /^'Host Grotesk', var\(--ce-font-sans\)$/);
  for (const r of STILREGELN) {
    const f = deklarationen(r.rumpf).get("font-family");
    if (f === undefined) continue;
    assert.ok(["var(--adm-schrift-text)", "var(--adm-schrift-titel)", "inherit"].includes(f), `${r.selektor}: font-family ${f}`);
  }
  assert.doesNotMatch(NACHT, /@font-face/, "eigene Schriftdatei");
});

test("N7 — keine fremde Quelle, kein @import, keine fremde Marke; nur das Hauptbündel lädt die Ebene, als letzte", () => {
  assert.doesNotMatch(NACHT, /url\(\s*['"]?(?:https?:)?\/\//i, "externe Quelle");
  assert.doesNotMatch(NACHT, /@import/i, "@import");
  assert.doesNotMatch(NACHT, /resend/i, "fremder Markenname außerhalb der Kommentare");
  const index = read("./index.css");
  const importe = [...index.matchAll(/@import '\.\/([\w-]+\.css)';/g)].map((m) => m[1]);
  assert.equal(importe.at(-1), "admin-nacht.css", "die Adminebene ist nicht der letzte Import");
  assert.equal(importe.filter((i) => i === "admin-nacht.css").length, 1);
  assert.doesNotMatch(ohneKommentare(read("./public-calculator.css")), /admin-nacht\.css/);
  for (const f of readdirSync(new URL("./", import.meta.url)).filter((f) => f.endsWith(".css") && f !== "index.css")) {
    assert.doesNotMatch(ohneKommentare(read(`./${f}`)), /@import\s+['"]\.\/admin-nacht/, `${f} importiert die Adminebene`);
  }
});
