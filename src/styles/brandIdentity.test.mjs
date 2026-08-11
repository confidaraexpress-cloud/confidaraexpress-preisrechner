// Markenintegration Web — Quelltext-Invarianten.
//
// Kernzusicherung: JEDE produktive Markendarstellung stammt aus der
// Originalgeometrie von `assets/brand/confidara-master.svg`. Es wird nichts
// nachgezeichnet, keine Schrift gesetzt, kein HTML-Text als Wortmarke
// verwendet und keine Komposition neu erfunden — angepasst sind ausschließlich
// Ausschnitt (viewBox) und Produktfarben.
//
// Rein statisch — kein Rendering, keine neue Dependency. Das Verhalten im
// echten Browser deckt tests/e2e/brandIdentity.test.mjs ab.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const stripXml = (s) => s.replace(/<!--[\s\S]*?-->/g, "");

const NAVY = "#111A33";
const BLAU = "#5367E8";
const HELL = "#F7F8FC";
// Originalfarben des Masters — sie dürfen NICHT in die Produktassets wandern.
const MASTER_NAVY = "#011B55";
const MASTER_BLAU = "#004AFC";

const A = (name) => stripXml(read(`../assets/brand/${name}.svg`));
const master   = A("confidara-master");
const assets = {
  "signet-standard":   A("signet-standard"),
  "signet-reverse":    A("signet-reverse"),
  "wordmark-standard": A("wordmark-standard"),
  "wordmark-reverse":  A("wordmark-reverse"),
};
const favicon   = stripXml(readFileSync(new URL("../../public/favicon.svg", import.meta.url), "utf8"));
const brandLogo = read("../components/ui/BrandLogo.jsx");
const primitives = read("./primitives.css");
const indexHtml = stripXml(readFileSync(new URL("../../index.html", import.meta.url), "utf8"));

/* Zerlegt alle d-Attribute eines SVG in einzelne Subpaths („M … Z"). Die
   Teilstrings bleiben unverändert — verglichen wird Zeichen für Zeichen. */
function subpaths(svg) {
  const out = [];
  for (const m of svg.matchAll(/\sd="([^"]+)"/g)) {
    const d = m[1];
    const starts = [...d.matchAll(/M /g)].map((x) => x.index);
    starts.forEach((s, i) => out.push(d.slice(s, starts[i + 1] ?? d.length).trim()));
  }
  return out;
}
const bbox = (sub) => {
  const n = [...sub.matchAll(/-?[\d.]+/g)].map((x) => Number(x[0]));
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
  return { y0: Math.min(...ys), y1: Math.max(...ys) };
};
const MASTER_SUBS = new Set(subpaths(master));
// Bänder aus der Masteranalyse: Signet 247–671, Wortmarke 725–860, Claim 881–907.
const CLAIM_SUBS = subpaths(master).filter((s) => bbox(s).y0 >= 870);

const SRC = new URL("../", import.meta.url);
function quellen(dir = SRC, out = []) {
  for (const e of readdirSync(dir)) {
    const p = new URL(e, dir);
    if (statSync(p).isDirectory()) { quellen(new URL(`${e}/`, dir), out); continue; }
    if (!/\.(jsx|js|mjs)$/.test(e) || e.includes(".test.")) continue;
    out.push([e, readFileSync(p, "utf8")]);
  }
  return out;
}
const QUELLEN = quellen();
const ALLE_CSS = readdirSync(new URL("./", import.meta.url))
  .filter((f) => f.endsWith(".css")).map((f) => [f, read(`./${f}`)]);

/* ══════════ 1 — Herkunft: alles kommt aus dem Master ════════════════════ */

test("1 — der Master liegt im Repo und trägt Signet, Wortmarke und Claim", () => {
  assert.ok(existsSync(new URL("../assets/brand/confidara-master.svg", import.meta.url)));
  assert.match(master, /viewBox="0 0 1254 1254"/, "viewBox des Masters verändert");
  assert.ok(master.includes(MASTER_NAVY) && master.includes(MASTER_BLAU),
    "der Master muss seine Originalfarben behalten");
  const baender = { signet: 0, wortmarke: 0, claim: 0 };
  for (const s of subpaths(master)) {
    const { y0, y1 } = bbox(s);
    if (y0 >= 240 && y1 <= 700) baender.signet++;
    else if (y0 >= 700 && y1 <= 870) baender.wortmarke++;
    else if (y0 >= 870 && y1 <= 915) baender.claim++;
    else assert.fail(`Subpath außerhalb der bekannten Bänder: y ${y0}–${y1}`);
  }
  assert.deepEqual(baender, { signet: 5, wortmarke: 23, claim: 29 },
    "die Bandaufteilung des Masters hat sich verändert");
});

test("2 — jeder Pfad der Produktassets steht wörtlich so im Master", () => {
  for (const [name, svg] of Object.entries(assets)) {
    const subs = subpaths(svg);
    assert.ok(subs.length > 0, `${name}: keine Pfaddaten`);
    for (const s of subs) {
      assert.ok(MASTER_SUBS.has(s),
        `${name}: Pfad steht nicht wörtlich im Master — ${s.slice(0, 60)}…`);
    }
  }
});

test("3 — die Produktassets enthalten genau die erwarteten Bestandteile", () => {
  assert.equal(subpaths(assets["signet-standard"]).length, 5, "Signet: 5 Subpaths");
  assert.equal(subpaths(assets["signet-reverse"]).length, 5, "Signet reverse: 5 Subpaths");
  // Wortmarke = Originalkomposition: Signet (5) + Schriftzug (23).
  assert.equal(subpaths(assets["wordmark-standard"]).length, 28, "Wortmarke: 5 + 23 Subpaths");
  assert.equal(subpaths(assets["wordmark-reverse"]).length, 28, "Wortmarke reverse: 5 + 23 Subpaths");
});

/* ══════════ 2 — Standard und Reverse: nur die Farbe trennt sie ═════════ */

test("4 — Standard- und Reverse-Signet haben identische Geometrie", () => {
  const a = subpaths(assets["signet-standard"]).sort();
  const b = subpaths(assets["signet-reverse"]).sort();
  assert.deepEqual(a, b, "die Signet-Geometrie weicht zwischen den Tonlagen ab");
  const vb = (s) => s.match(/viewBox="([^"]+)"/)[1];
  assert.equal(vb(assets["signet-standard"]), vb(assets["signet-reverse"]), "viewBox weicht ab");
});

test("5 — Standard- und Reverse-Wortmarke haben identische Geometrie", () => {
  const a = subpaths(assets["wordmark-standard"]).sort();
  const b = subpaths(assets["wordmark-reverse"]).sort();
  assert.deepEqual(a, b, "die Wortmarken-Geometrie weicht zwischen den Tonlagen ab");
  const vb = (s) => s.match(/viewBox="([^"]+)"/)[1];
  assert.equal(vb(assets["wordmark-standard"]), vb(assets["wordmark-reverse"]), "viewBox weicht ab");
});

test("6 — die Wortmarke enthält das Signet in unveränderter Originalposition", () => {
  // Der Ausschnitt beginnt bei derselben Oberkante wie das Signet: Signet und
  // Schriftzug behalten dadurch Abstand und Größenverhältnis des Masters.
  const sig = subpaths(assets["signet-standard"]);
  const wort = new Set(subpaths(assets["wordmark-standard"]));
  for (const s of sig) assert.ok(wort.has(s), "Signetpfad fehlt in der Wortmarke");
  const y = (s) => Number(s.match(/viewBox="[\d.-]+ ([\d.-]+)/)[1]);
  assert.equal(y(assets["wordmark-standard"]), y(assets["signet-standard"]),
    "die Wortmarke beginnt nicht an der Oberkante des Signets");
});

/* ══════════ 3 — Farben ═════════════════════════════════════════════════ */

test("7 — Standardassets tragen Primary Navy und Primary Blue", () => {
  for (const name of ["signet-standard", "wordmark-standard"]) {
    const fills = [...assets[name].matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase());
    assert.deepEqual([...new Set(fills)].sort(), [NAVY, BLAU].sort(), `${name}: falsche Farben`);
  }
});

test("8 — Reverseassets stehen einfarbig hell", () => {
  for (const name of ["signet-reverse", "wordmark-reverse"]) {
    const fills = [...assets[name].matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase());
    assert.deepEqual([...new Set(fills)], [HELL], `${name}: nicht einfarbig hell`);
  }
});

test("9 — die Originalfarben des Masters bleiben in den Produktassets außen vor", () => {
  for (const [name, svg] of Object.entries(assets)) {
    for (const alt of [MASTER_NAVY, MASTER_BLAU]) {
      assert.ok(!new RegExp(alt, "i").test(svg), `${name}: Masterfarbe ${alt} steht noch drin`);
    }
  }
  // Und die vor der Markenintegration abgelösten Paare kehren nirgends zurück.
  for (const alt of ["#0A1633", "#2C438C", "#8EA2F0", "#0B1F4D", "#2563eb", "#60a5fa"]) {
    const re = new RegExp(alt, "i");
    assert.ok(!re.test(Object.values(assets).join("") + favicon), `${alt} steht in einem Asset`);
    assert.ok(!re.test(indexHtml), `${alt} steht in index.html`);
  }
});

/* ══════════ 4 — kein Nachbau, kein Claim ═══════════════════════════════ */

test("10 — die Wortmarke wird nirgends als HTML-Text nachgebaut", () => {
  const ohneKommentar = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const [datei, src] of QUELLEN) {
    const rein = ohneKommentar(src);
    assert.ok(!/Confidara<b>Express<\/b>/.test(rein), `${datei}: getippte Wortmarke im Markup`);
    assert.ok(!/<(span|div|b)[^>]*>\s*Confidara\s*</.test(rein), `${datei}: Wortmarke als Textelement`);
  }
  // Die zugehörigen Textklassen sind mitsamt Regeln verschwunden.
  for (const [datei, css] of ALLE_CSS) {
    for (const sel of [".ce-brand-word", ".ce-brand-text", ".logo-text", ".logo-mark", ".pp-brand "]) {
      assert.ok(!stripComments(css).includes(sel), `${datei}: abgelöste Klasse ${sel} lebt noch`);
    }
  }
  // Das Markenbauteil rendert ein Bild, keine Buchstaben. Der Markenname darf
  // ausschließlich als alt-Text vorkommen, nie als sichtbarer Textknoten.
  const bl = ohneKommentar(brandLogo);
  assert.ok(!/>\s*Confidara/.test(bl), "BrandLogo setzt die Wortmarke noch als Text");
  assert.ok(!/<b>/.test(bl), "BrandLogo trägt noch die getippte Zweifarbigkeit");
  assert.match(brandLogo, /<img\s+className="ce-brandmark-img"/, "BrandLogo rendert kein Bild");
});

test("11 — keine handgebaute CE-Kachel im produktiven Frontend", () => {
  const treffer = [];
  for (const [datei, src] of QUELLEN) {
    for (const m of src.matchAll(/<(div|span|p)\b[^>]*>\s*CE\s*<\/\1>/g)) treffer.push(`${datei}: ${m[0]}`);
  }
  assert.deepEqual(treffer, [], `nachgebaute CE-Kachel gefunden:\n  ${treffer.join("\n  ")}`);
  for (const [name, svg] of [...Object.entries(assets), ["favicon", favicon]]) {
    assert.ok(!/<text/.test(svg), `${name}: gesetzter Text statt Geometrie`);
    assert.ok(!/font-family/.test(svg), `${name}: Schrift statt Pfaden`);
  }
});

test("12 — der Claim steht im Master, aber in keinem Produktasset", () => {
  assert.equal(CLAIM_SUBS.length, 29, "die Claimgeometrie des Masters hat sich verändert");
  for (const [name, svg] of [...Object.entries(assets), ["favicon", favicon]]) {
    const subs = new Set(subpaths(svg));
    for (const c of CLAIM_SUBS) {
      assert.ok(!subs.has(c), `${name}: enthält Claimgeometrie`);
    }
  }
  // Und auch nicht als Text irgendwo im Produkt.
  const ohneKommentar = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const [datei, src] of QUELLEN) {
    assert.ok(!/versandvermittlung/i.test(ohneKommentar(src)), `${datei}: Claim produktiv`);
  }
  for (const [datei, css] of ALLE_CSS) {
    assert.ok(!/versandvermittlung/i.test(stripComments(css)), `${datei}: Claim im Stylesheet`);
  }
  assert.ok(!/versandvermittlung/i.test(indexHtml), "Claim in index.html");
});

/* ══════════ 5 — Bauteil, Favicon, Einbindung ═══════════════════════════ */

test("13 — es gibt genau ein Markenbauteil mit vier Assets", () => {
  assert.match(brandLogo, /export function BrandLogo/);
  for (const n of ["signet-standard", "signet-reverse", "wordmark-standard", "wordmark-reverse"]) {
    assert.ok(brandLogo.includes(`assets/brand/${n}.svg`), `${n} wird nicht importiert`);
  }
  assert.match(brandLogo, /variant = "wordmark"/);
  assert.match(brandLogo, /tone = "standard"/);
  // Außer dem Bauteil greift nur das Übersichts-Wasserzeichen direkt auf ein Asset zu.
  const direkt = QUELLEN.filter(([, s]) => /assets\/brand\//.test(s)).map(([f]) => f).sort();
  assert.deepEqual(direkt, ["BrandLogo.jsx", "Overview.jsx"], `unerwartete Markenimporte: ${direkt}`);
  // Der Master selbst wird von keiner Komponente eingebunden — er ist reine Quelle.
  for (const [datei, src] of QUELLEN) {
    const rein = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!rein.includes("confidara-master"), `${datei}: der Master gehört nicht ins Bundle`);
  }
});

test("14 — das Favicon nutzt exakt die Signet-Geometrie", () => {
  const sig = subpaths(assets["signet-reverse"]).sort();
  const fav = subpaths(favicon).sort();
  assert.deepEqual(fav, sig, "das Favicon zeigt eine andere Geometrie als das Signet");
  // Eigene Fläche in Primary Navy — ein Favicon steht je nach Browserthema auf
  // hellem ODER dunklem Grund; transparent wäre es in einem Fall unsichtbar.
  assert.match(favicon, new RegExp(`<rect width="64" height="64" rx="14" fill="${NAVY}"`, "i"));
  assert.ok(favicon.includes(`fill="${HELL}"`), "die Marke steht nicht in der hellen Fassung");
  assert.match(indexHtml, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);
});

test("15 — jede Fläche wählt Tonlage und Variante nach ihrer echten Größe", () => {
  const holen = (n) => QUELLEN.find(([f]) => f === n)?.[1] ?? "";
  const rufe = (src) => [...src.matchAll(/<BrandLogo[\s\S]*?\/>/g)].map((m) => m[0]);
  // Dunkle Flächen → reverse.
  for (const d of ["DashboardSidebar.jsx", "AuthPage.jsx"]) {
    for (const r of rufe(holen(d))) assert.match(r, /tone="reverse"/, `${d}: braucht reverse`);
  }
  // Helle Flächen → standard.
  for (const d of ["AdminSidebar.jsx", "DashboardLayout.jsx", "DashboardPage.jsx", "LoadingScreen.jsx"]) {
    for (const r of rufe(holen(d))) assert.match(r, /tone="standard"/, `${d}: braucht standard`);
  }
  // Flache Leisten tragen das Signet — die Wortmarke bräuchte dort Höhe.
  for (const d of ["DashboardLayout.jsx", "DashboardPage.jsx", "LoadingScreen.jsx"]) {
    for (const r of rufe(holen(d))) assert.match(r, /variant="signet"/, `${d}: braucht das Signet`);
  }
  // Flächen mit Höhe tragen die volle Originalkomposition.
  for (const d of ["DashboardSidebar.jsx", "AdminSidebar.jsx", "AuthPage.jsx"]) {
    for (const r of rufe(holen(d))) assert.match(r, /variant="wordmark"/, `${d}: braucht die Wortmarke`);
  }
  // Die öffentliche Navigation trägt beides: flache helle Leiste, hoher dunkler Drawer.
  const nav = rufe(holen("NavbarLayout.jsx"));
  assert.equal(nav.length, 2, "die öffentliche Navigation hat zwei Markenstellen");
  assert.ok(nav.some((r) => /variant="signet"[^/]*tone="standard"/.test(r)), "Leiste: Signet standard");
  assert.ok(nav.some((r) => /variant="wordmark"[^/]*tone="reverse"/.test(r)), "Drawer: Wortmarke reverse");
});

test("16 — die Anmeldung trägt genau einen Markenanker, das Formular bleibt", () => {
  const auth = QUELLEN.find(([f]) => f === "AuthPage.jsx")[1];
  assert.equal([...auth.matchAll(/<BrandLogo/g)].length, 1);
  for (const m of ["<LoginForm", "<RegisterForm", "<ForgotPasswordForm", "<ResetPasswordForm", "handleLogin"]) {
    assert.ok(auth.includes(m), `AuthPage: ${m} wurde entfernt`);
  }
});

test("17 — das Bauteil färbt nichts um, verzerrt nichts und liest sich einmal", () => {
  const grund = stripComments(primitives);
  const block = grund.match(/\.ce-brandmark-img \{([^}]*)\}/)?.[1] ?? "";
  assert.ok(block, ".ce-brandmark-img fehlt");
  assert.match(block, /filter:\s*none/, "die Assets liegen in Zielfarbe vor — kein Filter");
  assert.match(block, /height:\s*auto/, "height: auto hält die Originalproportionen");
  // Breite je Variante gesetzt: ein <img> ohne Intrinsikmaß fiele sonst auf die
  // Ersatzbreite des Browsers zurück.
  assert.match(grund, /\.ce-brand--signet \.ce-brandmark-img \{[^}]*width:\s*\d+px/);
  assert.match(grund, /\.ce-brand--wordmark \.ce-brandmark-img \{[^}]*width:\s*\d+px/);
  // Die Marke ist ein Bild ohne begleitenden Text und trägt deshalb ihren Namen.
  assert.match(brandLogo, /alt !== undefined \? alt : "ConfidaraExpress"/);
  assert.match(brandLogo, /\.\.\.\(decorative \? \{ "aria-hidden": "true" \} : \{\}\)/);
});

test("18 — es entsteht kein seitenweites Wasserzeichen", () => {
  for (const [datei, css] of ALLE_CSS) {
    const regeln = stripComments(css);
    assert.ok(!/background[^;}]*url\([^)]*(signet|wordmark|brand\/|favicon)/i.test(regeln),
      `${datei}: Markenasset als Hintergrundbild`);
  }
  const wm = QUELLEN.filter(([, s]) => /className="[^"]*watermark/i.test(s)).map(([f]) => f).sort();
  assert.deepEqual(wm, ["Overview.jsx"], `unerwartete Wasserzeichen: ${wm}`);
  const block = stripComments(read("./overview.css")).match(/\.pp-trust-watermark \{([^}]*)\}/)?.[1] ?? "";
  assert.match(block, /position:\s*absolute/);
  assert.doesNotMatch(block, /position:\s*(fixed|sticky)/);
});
