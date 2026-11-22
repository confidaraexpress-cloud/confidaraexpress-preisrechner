// Governance der dunklen Gestaltungsebene des Partnerportals „Confidara Leitstand Nacht · Partnerportal“
// (Betreiberauftrag 2026-11-22, D3: Leitstand Nacht für Admin und das gesamte Partner-Dashboard, Rollenakzent Violett).
// Die bereichsübergreifenden Design-Tests (designSystemClosure, interfacePatterns, typography, premiumRedesign,
// kundeObsidian) führen partner-nacht.css wie admin-nacht.css als dokumentierte Ausnahme und verweisen hierher:
//   • jede Regel hängt an :root[data-ce-bereich="partner"] und gilt nur am Bildschirm; das Partnerportal gehört nicht
//     mehr zur Familie Blue Light (kunde-obsidian.css trägt keine Partnerregel mehr);
//   • ein Tokenblock am Anfang; die Foundation-Tokens werden dort genauso umgeordnet wie in der Adminebene (dieselben
//     Schlüssel), Layout-Tokens nie;
//   • Tiefe, Glas und Licht nur über Token; Glas nie auf Schleier oder Dialog;
//   • diese Ebene bewegt nichts von selbst: keine Animation, Übergänge nur auf Farbe, Schatten, Deckkraft und Lage;
//   • Lesbarkeit nach WCAG 2.2 AA, Antworten auf erhöhten Kontrast und erzwungene Farben;
//   • Schriften nur über die beiden Rollen; keine fremde Quelle, kein @import; geladen direkt vor der Adminebene;
//   • der Partnerbereich bleibt als Partnerbereich erkennbar: Violett als Rollenakzent, der Verdienst des Monats ist
//     die größte Zahl der Startseite.
//
// Run: node --test src/styles/partnerNacht.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const NACHT = ohneKommentare(read("./partner-nacht.css"));
const ADMIN_NACHT = ohneKommentare(read("./admin-nacht.css"));
const PARTNER = ':root[data-ce-bereich="partner"]';

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
/** Eigenschaften eines Regelrumpfs als Map (letzter Wert gewinnt), geteilt an Semikola der obersten Ebene. */
function deklarationen(rumpf) {
  const m = new Map();
  const stuecke = [];
  let tiefe = 0;
  let start = 0;
  for (let k = 0; k < rumpf.length; k++) {
    const c = rumpf[k];
    if (c === "(") tiefe++;
    else if (c === ")") tiefe--;
    else if (c === ";" && tiefe === 0) { stuecke.push(rumpf.slice(start, k)); start = k + 1; }
  }
  stuecke.push(rumpf.slice(start));
  for (const s of stuecke) {
    const p = s.indexOf(":");
    if (p < 0) continue;
    const name = s.slice(0, p).trim();
    if (!/^-{0,2}[a-zA-Z][\w-]*$/.test(name)) continue;
    m.set(name, s.slice(p + 1).trim().replace(/\s+/g, " "));
  }
  return m;
}
const REGELN = regeln(NACHT);
const STILREGELN = REGELN.filter((r) => !r.selektor.startsWith("@keyframes"));
const TOKENBLOECKE = STILREGELN.filter((r) => r.selektor === PARTNER && r.kontext.length === 1);
const TOKENS = deklarationen(TOKENBLOECKE[0]?.rumpf ?? "");
const ADMIN_TOKENS = deklarationen(regeln(ADMIN_NACHT)
  .find((r) => r.selektor === ':root[data-ce-bereich="admin"]' && r.kontext.length === 1)?.rumpf ?? "");

function wert(name, tiefe = 0) {
  const v = TOKENS.get(name);
  assert.ok(v !== undefined, `Token ${name} fehlt`);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  return ref && tiefe < 8 ? wert(ref[1], tiefe + 1) : v;
}
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

test("P1 — jede Regel hängt am Partnerbereich und gilt nur am Bildschirm; die Familie Blue Light ist ohne Partner", () => {
  assert.ok(STILREGELN.length > 80, "die Ebene wurde nicht vollständig gelesen");
  const fremd = [];
  for (const r of STILREGELN) for (const s of teile(r.selektor)) if (!s.startsWith(PARTNER)) fremd.push(s);
  assert.deepEqual(fremd, [], `Selektoren außerhalb des Partnerbereichs:\n  ${fremd.join("\n  ")}`);
  const ausserhalb = REGELN.filter((r) => r.kontext[0] !== "@media screen").map((r) => r.selektor.slice(0, 80));
  assert.deepEqual(ausserhalb, [], `Regeln außerhalb von @media screen:\n  ${ausserhalb.join("\n  ")}`);
  assert.doesNotMatch(NACHT, /@media[^{]*\bprint\b/, "eigene Druckregel");
  const hook = read("../hooks/useCeBereich.js");
  assert.match(hook, /BLUE_LIGHT_FAMILIE = Object\.freeze\(\["kunde", "oeffentlich"\]\)/);
  for (const seite of ["../components/layout/PartnerLayout.jsx", "../pages/PartnerAnmeldungPage.jsx"]) {
    assert.match(read(seite), /useCeBereich\("partner"\)/, seite);
  }
  assert.doesNotMatch(ohneKommentare(read("./kunde-obsidian.css")), /data-ce-bereich="partner"|\.spp-/,
    "die Ebene der Familie trägt noch eine Partnerregel");
});

test("P2 — ein Tokenblock am Anfang; Foundation wie die Adminebene, Layout-Tokens nie", () => {
  assert.equal(TOKENBLOECKE.length, 1, "genau ein Tokenblock des Partnerbereichs");
  assert.equal(STILREGELN.indexOf(TOKENBLOECKE[0]), 0, "der Tokenblock steht am Anfang der Ebene");
  const fremdeFoundation = [];
  for (const r of STILREGELN) {
    if (r === TOKENBLOECKE[0]) continue;
    for (const m of r.rumpf.matchAll(/(--ce-[\w-]+)\s*:/g)) fremdeFoundation.push(`${r.selektor.slice(0, 60)}: ${m[1]}`);
  }
  assert.deepEqual(fremdeFoundation, [], `Foundation-Tokens außerhalb des Tokenblocks:\n  ${fremdeFoundation.join("\n  ")}`);
  const layout = [...NACHT.matchAll(/(--ce-(?:space|radius|z|bp|size|layout|container|shell|gap|gutter)-[\w-]*)\s*:/g)].map((m) => m[1]);
  assert.deepEqual(layout, [], `Layout-Tokens umdefiniert: ${layout.join(", ")}`);
  // Dieselbe Nachtwelt: die Foundation wird mit denselben Schlüsseln umgeordnet wie im Adminbereich — eine neue
  // --ce-*-Zeile der Adminebene gehört auch hierher (sonst zeichnete eine Komponente hier hell).
  const ce = (map) => [...map.keys()].filter((k) => k.startsWith("--ce-")).sort();
  assert.ok(ce(ADMIN_TOKENS).length > 40, "Tokenblock der Adminebene nicht gefunden");
  assert.deepEqual(ce(TOKENS), ce(ADMIN_TOKENS), "die Foundation-Schlüssel weichen von der Adminebene ab");
  // Typografie gleich (Schnitte, Größen, Laufweiten) — nur Farben und Licht tragen die Rolle.
  const typo = ce(ADMIN_TOKENS).filter((k) => /^--ce-(?:text|weight|font)-/.test(k));
  const abweichend = typo.filter((k) => TOKENS.get(k) !== ADMIN_TOKENS.get(k).replace(/--adm-/g, "--pn-"));
  assert.deepEqual(abweichend, [], `Typografie weicht von der Adminebene ab: ${abweichend.join(", ")}`);
});

test("P3 — Tiefe, Glas und Licht nur über Token; kein Schleier und kein Dialog mit Weichzeichnung", () => {
  assert.equal(wert("--pn-glas-weichzeichnung"), "blur(var(--pn-glas-blur)) saturate(150%)");
  for (const r of STILREGELN) {
    if (r === TOKENBLOECKE[0]) continue;
    const d = deklarationen(r.rumpf);
    for (const eigenschaft of ["backdrop-filter", "-webkit-backdrop-filter"]) {
      if (!d.has(eigenschaft)) continue;
      assert.equal(d.get(eigenschaft), "var(--pn-glas-weichzeichnung)", `${r.selektor}: ${eigenschaft}`);
      assert.doesNotMatch(r.selektor, /overlay|dialog|modal|drawer/i, `${r.selektor}: Glas auf Schleier oder Dialog`);
      // Glas nie auf der Seitenleiste selbst: sie wäre sonst Bezugsrahmen der festen Leiste unten (partner.css).
      // Bewusste Ankeränderung (Sichtprüfung 2026-11-22): ihr Pseudoelement darf Glas tragen — es ist kein Vorfahre
      // der Leiste. Es liegt dann hinter dem Inhalt der Kopfzeile (absolut, Ebene -1).
      assert.doesNotMatch(r.selektor, /\.spp-seite(?![\w-]|::)/, `${r.selektor}: Glas auf .spp-seite`);
      if (/\.spp-seite::(?:before|after)$/.test(r.selektor.trim())) {
        assert.equal(d.get("position"), "absolute", `${r.selektor}: position`);
        assert.equal(d.get("z-index"), "-1", `${r.selektor}: z-index`);
      }
    }
    for (const eigenschaft of ["box-shadow", "filter", "text-shadow"]) {
      const v = d.get(eigenschaft);
      if (v === undefined) continue;
      assert.doesNotMatch(v, /#[0-9a-f]{3,8}\b|rgba?\(|blur\(/i, `${r.selektor}: ${eigenschaft} frei geschrieben (${v})`);
    }
  }
});

test("P4 — diese Ebene bewegt nichts von selbst; Übergänge nur auf Farbe, Schatten, Deckkraft und Lage", () => {
  assert.equal(REGELN.filter((r) => r.selektor.startsWith("@keyframes")).length, 0, "eigene Keyframes");
  const animiert = STILREGELN.filter((r) => /(?:^|[;\s])animation(?:-name)?\s*:\s*(?!none)/.test(r.rumpf));
  for (const r of animiert) {
    assert.ok(r.kontext.includes("@media (prefers-reduced-motion: no-preference)"), `${r.selektor}: Animation ohne Wunschabfrage`);
  }
  for (const r of STILREGELN) {
    const t = deklarationen(r.rumpf).get("transition");
    if (!t || t === "none") continue;
    for (const teil of t.split(",")) {
      const eigenschaft = teil.trim().split(/\s+/)[0];
      assert.ok(["background-color", "color", "box-shadow", "border-color", "opacity", "transform"].includes(eigenschaft),
        `${r.selektor}: Übergang auf ${eigenschaft}`);
    }
  }
  assert.ok(STILREGELN.some((r) => r.kontext.includes("@media (prefers-reduced-motion: reduce)")), "keine Antwort auf reduzierte Bewegung");
});

test("P5 — Lesbarkeit: Text- und Konturkontraste nach WCAG 2.2 AA; erhöhter Kontrast und erzwungene Farben", () => {
  const flaechen = ["--pn-grund", "--pn-flaeche-1", "--pn-flaeche-2"].map((t) => wert(t));
  for (const f of flaechen) {
    assert.ok(kontrast(wert("--pn-tinte"), f) >= 7, `Tinte auf ${f}`);
    for (const t of ["--pn-tinte-2", "--pn-tinte-3", "--pn-tinte-4", "--pn-signal-tinte", "--pn-violett-hell"]) {
      assert.ok(kontrast(wert(t), f) >= 4.5, `${t} auf ${f}: ${kontrast(wert(t), f).toFixed(2)}`);
    }
    assert.ok(kontrast(wert("--pn-kante-feld"), f) >= 3, `Feldkontur auf ${f}`);
    assert.ok(kontrast(wert("--pn-signal-kante"), f) >= 3, `Fokuskante auf ${f}: ${kontrast(wert("--pn-signal-kante"), f).toFixed(2)}`);
  }
  // Seitenleiste: Einträge auf dem dunkelsten und dem hellsten Ton des Verlaufs; die Kennzeichnung „Partnerbereich“.
  for (const f of ["#0a1226", "#040814"]) {
    assert.ok(kontrast(wert("--pn-seite-text"), f) >= 4.5, `Seitenleiste auf ${f}`);
    assert.ok(kontrast(wert("--pn-seite-text-leise"), f) >= 4.5, `leise Seitenleiste auf ${f}`);
    const tag = alsHex(ueber(farbe(wert("--pn-violett-ton")), farbe(f)));
    assert.ok(kontrast(wert("--pn-violett-hell"), tag) >= 4.5, `Partnerkennzeichnung auf ${f}`);
  }
  // Leiste unten (Telefon): kurze Namen auf der Leistenfläche über dem Grund.
  const leiste = alsHex(ueber(farbe(wert("--pn-leiste")), farbe(wert("--pn-grund"))));
  assert.ok(kontrast(wert("--pn-seite-text"), leiste) >= 4.5, "Leiste unten");
  // Weiß auf der Akzentfläche (Schalter, Auswahl) und die Hauptaktion: dunkle Schrift auf der hellen Fläche.
  assert.ok(kontrast("#ffffff", wert("--pn-signal")) >= 4.5, `Weiß auf ${wert("--pn-signal")}`);
  assert.ok(kontrast(wert("--pn-tinte-invers"), wert("--pn-tinte")) >= 7, "Anmeldeknopf: dunkle Schrift auf heller Fläche");
  for (const z of ["gruen", "bernstein", "rot", "blau", "grau"]) {
    const ton = alsHex(ueber(farbe(wert(`--pn-${z}-ton`)), farbe(wert("--pn-flaeche-1"))));
    assert.ok(kontrast(wert(`--pn-${z}`), ton) >= 4.5, `Zustand ${z}`);
  }
  const mehr = STILREGELN.find((r) => r.kontext.includes("@media (prefers-contrast: more)"));
  assert.ok(mehr, "keine Antwort auf erhöhten Kontrast");
  for (const t of ["--pn-kante", "--pn-linie", "--pn-tinte-2", "--pn-tinte-3", "--pn-seite-text"]) {
    assert.ok(deklarationen(mehr.rumpf).has(t), `erhöhter Kontrast ohne ${t}`);
  }
  const erzwungen = STILREGELN.filter((r) => r.kontext.includes("@media (forced-colors: active)"));
  assert.ok(erzwungen.some((r) => /::after/.test(r.selektor) && /content:\s*none/.test(r.rumpf)), "Lichtband bleibt");
  assert.ok(erzwungen.some((r) => /filter:\s*none/.test(r.rumpf)), "Leuchten bleibt");
  assert.ok(erzwungen.some((r) => /spp-nitem-on/.test(r.selektor) && /outline:/.test(r.rumpf)), "aktive Stelle ohne Kontur");
});

test("P6 — Schriften nur über die beiden Rollen", () => {
  assert.equal(TOKENS.get("--pn-schrift-text"), "var(--ce-font-sans)");
  assert.match(TOKENS.get("--pn-schrift-titel"), /^'Host Grotesk', var\(--ce-font-sans\)$/);
  for (const r of STILREGELN) {
    const f = deklarationen(r.rumpf).get("font-family");
    if (f === undefined) continue;
    assert.ok(["var(--pn-schrift-text)", "var(--pn-schrift-titel)", "inherit"].includes(f), `${r.selektor}: font-family ${f}`);
  }
});

test("P7 — keine fremde Quelle, kein @import; geladen genau einmal, direkt vor der Adminebene", () => {
  assert.doesNotMatch(NACHT, /url\(\s*['"]?(?:https?:)?\/\//i, "externe Quelle");
  assert.doesNotMatch(NACHT, /@import/i, "@import");
  assert.doesNotMatch(NACHT, /resend/i, "fremder Markenname");
  const importe = [...read("./index.css").matchAll(/@import '\.\/([\w-]+\.css)';/g)].map((m) => m[1]);
  assert.deepEqual(importe.slice(-2), ["partner-nacht.css", "admin-nacht.css"]);
  assert.equal(importe.filter((i) => i === "partner-nacht.css").length, 1);
  assert.doesNotMatch(ohneKommentare(read("./public-calculator.css")), /partner-nacht\.css/);
});

test("P8 — als Partnerbereich erkennbar: Violett als Rollenakzent, der Verdienst ist die größte Zahl der Startseite", () => {
  // Violett: Blau deutlich über Grün, Rot klar über Grün — und nicht der Akzent des Adminbereichs.
  for (const t of ["--pn-signal", "--pn-signal-tinte", "--pn-signal-kante"]) {
    const [r, g, b] = farbe(wert(t));
    assert.ok(b > g + 40 && r > g + 20, `${t}: ${wert(t)} ist kein Violett`);
    assert.notEqual(wert(t), ADMIN_TOKENS.get(t.replace("--pn-", "--adm-")), `${t} gleicht dem Adminakzent`);
  }
  // Startseite (Betreiberauftrag §4): Verdienst des Monats in der Kennzahlenstufe, die drei übrigen Kennzahlen darunter.
  const struktur = ohneKommentare(read("./partner.css"));
  const groesse = (sel) => {
    const m = struktur.match(new RegExp(`(?:^|\\n)${sel.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `${sel} fehlt in partner.css`);
    return deklarationen(m[1]).get("font-size");
  };
  assert.equal(groesse(".spp-held-zahl"), "var(--ce-text-numeric-display-size)");
  assert.equal(groesse(".spp-kpi-value"), "var(--ce-text-title-page-size)");
  const startseite = read("../components/partner/PartnerOverviewPanel.jsx");
  assert.match(startseite, /id="spp-month-amount"/, "der Verdienst des Monats fehlt auf der Startseite");
  assert.match(startseite, /\{held\}\{werben\}/, "Verdienst und Werben stehen nicht zuerst");
});
