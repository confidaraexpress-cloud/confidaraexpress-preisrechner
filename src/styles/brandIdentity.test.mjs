// Markenintegration Web — Quelltext-Invarianten.
//
// Kernzusicherung: JEDE produktive Markendarstellung stammt aus der
// Originalgeometrie von `assets/brand/confidara-master.svg`. Es wird nichts
// nachgezeichnet, keine Schrift gesetzt, kein HTML-Text als Wortmarke
// verwendet und keine Komposition neu erfunden — angepasst sind ausschließlich
// Ausschnitt (viewBox) und Produktfarben.
//
// Drei Varianten, sechs Assets:
//   signet   nur C/E (350 247 506 424, 1,19:1)
//   wordmark nur der Schriftzug (39 725 1176 135, 8,71:1) — schmale Leisten
//   lockup   Originalkomposition, Signet über Schriftzug (39 247 1176 613,
//            1,92:1) — braucht Höhe statt Breite
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
const master = A("confidara-master");
const assets = {
  "signet-standard":   A("signet-standard"),
  "signet-reverse":    A("signet-reverse"),
  "wordmark-standard": A("wordmark-standard"),
  "wordmark-reverse":  A("wordmark-reverse"),
  "lockup-standard":   A("lockup-standard"),
  "lockup-reverse":    A("lockup-reverse"),
};
// Standard/Reverse-Paare je Variante — für die Geometrie- und Farbtests.
const PAARE = [
  ["signet-standard", "signet-reverse", "signet"],
  ["wordmark-standard", "wordmark-reverse", "wordmark"],
  ["lockup-standard", "lockup-reverse", "lockup"],
];

const favicon    = stripXml(readFileSync(new URL("../../public/favicon.svg", import.meta.url), "utf8"));
const brandLogo  = read("../components/ui/BrandLogo.jsx");
const primitives = read("./primitives.css");
const indexHtml  = stripXml(readFileSync(new URL("../../index.html", import.meta.url), "utf8"));

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
const SIGNET_SUBS = new Set(subpaths(assets["signet-standard"]));
const WORTMARKE_SUBS = new Set(subpaths(assets["wordmark-standard"]));

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

test("2 — jeder Pfad jedes Produktassets steht wörtlich so im Master", () => {
  for (const [name, svg] of Object.entries(assets)) {
    const subs = subpaths(svg);
    assert.ok(subs.length > 0, `${name}: keine Pfaddaten`);
    for (const s of subs) {
      assert.ok(MASTER_SUBS.has(s), `${name}: Pfad steht nicht wörtlich im Master — ${s.slice(0, 60)}…`);
    }
  }
});

test("3 — jedes Asset enthält genau die für seine Variante erwarteten Subpaths", () => {
  const erwartet = {
    "signet-standard": SIGNET_SUBS, "signet-reverse": SIGNET_SUBS,
    "wordmark-standard": WORTMARKE_SUBS, "wordmark-reverse": WORTMARKE_SUBS,
  };
  for (const [name, soll] of Object.entries(erwartet)) {
    assert.deepEqual(new Set(subpaths(assets[name])), soll, `${name}: unerwartete Geometrie`);
  }
  // Lockup = Signet + Wortmarke, sonst nichts — insbesondere kein Claim.
  for (const name of ["lockup-standard", "lockup-reverse"]) {
    const subs = new Set(subpaths(assets[name]));
    assert.equal(subs.size, SIGNET_SUBS.size + WORTMARKE_SUBS.size, `${name}: falsche Subpath-Anzahl`);
    for (const s of SIGNET_SUBS) assert.ok(subs.has(s), `${name}: Signetpfad fehlt`);
    for (const s of WORTMARKE_SUBS) assert.ok(subs.has(s), `${name}: Wortmarkenpfad fehlt`);
  }
});

test("4 — die reine Wortmarke enthält kein Signet und keinen Claim", () => {
  for (const name of ["wordmark-standard", "wordmark-reverse"]) {
    const subs = new Set(subpaths(assets[name]));
    for (const s of SIGNET_SUBS) assert.ok(!subs.has(s), `${name}: enthält Signetgeometrie`);
    for (const s of CLAIM_SUBS) assert.ok(!subs.has(s), `${name}: enthält Claimgeometrie`);
  }
});

/* ══════════ 2 — Standard und Reverse: nur die Farbe trennt sie ═════════ */

test("5 — jede Variante hat in Standard und Reverse identische Geometrie", () => {
  for (const [std, rev, name] of PAARE) {
    const a = subpaths(assets[std]).sort();
    const b = subpaths(assets[rev]).sort();
    assert.deepEqual(a, b, `${name}: die Geometrie weicht zwischen den Tonlagen ab`);
    const vb = (s) => s.match(/viewBox="([^"]+)"/)[1];
    assert.equal(vb(assets[std]), vb(assets[rev]), `${name}: viewBox weicht ab`);
  }
});

test("6 — die Lockup-Komposition enthält das Signet in unveränderter Originalposition", () => {
  const y = (s) => Number(s.match(/viewBox="[\d.-]+ ([\d.-]+)/)[1]);
  assert.equal(y(assets["lockup-standard"]), y(assets["signet-standard"]),
    "die Lockup-Komposition beginnt nicht an der Oberkante des Signets");
});

/* ══════════ 3 — Farben ═════════════════════════════════════════════════ */

test("7 — Standardassets tragen Primary Navy und Primary Blue", () => {
  for (const name of ["signet-standard", "wordmark-standard", "lockup-standard"]) {
    const fills = [...assets[name].matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase());
    assert.deepEqual([...new Set(fills)].sort(), [NAVY, BLAU].sort(), `${name}: falsche Farben`);
  }
});

test("8 — Reverseassets stehen einfarbig hell", () => {
  for (const name of ["signet-reverse", "wordmark-reverse", "lockup-reverse"]) {
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
  for (const [datei, css] of ALLE_CSS) {
    for (const sel of [".ce-brand-word", ".ce-brand-text", ".logo-text", ".logo-mark", ".pp-brand "]) {
      assert.ok(!stripComments(css).includes(sel), `${datei}: abgelöste Klasse ${sel} lebt noch`);
    }
  }
  const bl = QUELLEN.find(([f]) => f === "BrandLogo.jsx")[1]
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/>\s*Confidara/.test(bl), "BrandLogo setzt die Wortmarke noch als Text");
  assert.ok(!/<b>/.test(bl), "BrandLogo trägt noch die getippte Zweifarbigkeit");
  assert.match(bl, /<img\s+className="ce-brandmark-img"/, "BrandLogo rendert kein Bild");
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
    for (const c of CLAIM_SUBS) assert.ok(!subs.has(c), `${name}: enthält Claimgeometrie`);
  }
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

test("13 — es gibt genau ein Markenbauteil mit drei Varianten und sechs Assets", () => {
  assert.match(brandLogo, /export function BrandLogo/);
  for (const n of Object.keys(assets)) {
    assert.ok(brandLogo.includes(`assets/brand/${n}.svg`), `${n} wird nicht importiert`);
  }
  assert.match(brandLogo, /signet:\s*\{/);
  assert.match(brandLogo, /wordmark:\s*\{/);
  assert.match(brandLogo, /lockup:\s*\{/);
  assert.match(brandLogo, /tone = "standard"/);
  // Außer dem Bauteil greift nur das Übersichts-Wasserzeichen direkt auf ein Asset zu.
  const direkt = QUELLEN.filter(([, s]) => /assets\/brand\//.test(s)).map(([f]) => f).sort();
  assert.deepEqual(direkt, ["BrandLogo.jsx", "Overview.jsx"], `unerwartete Markenimporte: ${direkt}`);
  for (const [datei, src] of QUELLEN) {
    const rein = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!rein.includes("confidara-master"), `${datei}: der Master gehört nicht ins Bundle`);
  }
});

test("14 — das Favicon nutzt exakt die Signet-Geometrie", () => {
  const fav = subpaths(favicon).sort();
  assert.deepEqual(fav, [...SIGNET_SUBS].sort(), "das Favicon zeigt eine andere Geometrie als das Signet");
  assert.match(favicon, new RegExp(`<rect width="64" height="64" rx="14" fill="${NAVY}"`, "i"));
  assert.ok(favicon.includes(`fill="${HELL}"`), "die Marke steht nicht in der hellen Fassung");
  assert.match(indexHtml, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);
});

test("15 — jede Fläche wählt Variante und Tonlage nach ihrer echten Größe", () => {
  const holen = (n) => QUELLEN.find(([f]) => f === n)?.[1] ?? "";
  const rufe = (src) => [...src.matchAll(/<BrandLogo[\s\S]*?\/>/g)].map((m) => m[0]);
  // Dunkle, hohe Flächen → lockup + reverse.
  for (const d of ["DashboardSidebar.jsx", "AdminSidebar.jsx", "AuthPage.jsx"]) {
    for (const r of rufe(holen(d))) assert.match(r, /variant="lockup"/, `${d}: braucht die Lockup-Komposition`);
  }
  for (const d of ["DashboardSidebar.jsx", "AuthPage.jsx"]) {
    for (const r of rufe(holen(d))) assert.match(r, /tone="reverse"/, `${d}: dunkle Fläche braucht reverse`);
  }
  assert.match(rufe(holen("AdminSidebar.jsx"))[0], /tone="standard"/, "AdminSidebar: helle Fläche braucht standard");
  // Flache Leisten der EINGELOGGTEN App (Topbar, Ladebildschirm) bleiben beim Signet.
  for (const d of ["DashboardLayout.jsx", "DashboardPage.jsx", "LoadingScreen.jsx"]) {
    for (const r of rufe(holen(d))) {
      assert.match(r, /variant="signet"/, `${d}: braucht das Signet`);
      assert.match(r, /tone="standard"/, `${d}: braucht standard`);
    }
  }
  // Die öffentliche Navigation: flache helle Leiste → reine Wortmarke; hoher
  // dunkler Drawer → volle Komposition.
  const nav = rufe(holen("NavbarLayout.jsx"));
  assert.equal(nav.length, 2, "die öffentliche Navigation hat zwei Markenstellen");
  assert.ok(nav.some((r) => /variant="wordmark"[^/]*tone="standard"/.test(r)),
    "die öffentliche Leiste braucht die reine Wortmarke in Standardfarbe");
  assert.ok(nav.some((r) => /variant="lockup"[^/]*tone="reverse"/.test(r)),
    "der Drawer braucht die volle Komposition in Reverse");
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
  assert.match(grund, /\.ce-brand--signet \.ce-brandmark-img \{[^}]*width:\s*\d+px/);
  assert.match(grund, /\.ce-brand--lockup \.ce-brandmark-img \{[^}]*width:\s*\d+px/);
  // Die pure Wortmarke setzt ihre Breite kontextabhängig (aktuell nur die
  // öffentliche Leiste) — geprüft dort, nicht global.
  assert.match(read("./layout.css"), /\.navbar-logo \.ce-brandmark-img \{[^}]*width:\s*\d+px/,
    "die öffentliche Leiste setzt keine Markenbreite");
  assert.match(brandLogo, /alt !== undefined \? alt : "ConfidaraExpress"/);
  assert.match(brandLogo, /\.\.\.\(decorative \? \{ "aria-hidden": "true" \} : \{\}\)/);
});

test("18 — es entsteht kein seitenweites Wasserzeichen", () => {
  for (const [datei, css] of ALLE_CSS) {
    const regeln = stripComments(css);
    assert.ok(!/background[^;}]*url\([^)]*(signet|wordmark|lockup|brand\/|favicon)/i.test(regeln),
      `${datei}: Markenasset als Hintergrundbild`);
  }
  const wm = QUELLEN.filter(([, s]) => /className="[^"]*watermark/i.test(s)).map(([f]) => f).sort();
  assert.deepEqual(wm, ["Overview.jsx"], `unerwartete Wasserzeichen: ${wm}`);
  const block = stripComments(read("./overview.css")).match(/\.pp-trust-watermark \{([^}]*)\}/)?.[1] ?? "";
  assert.match(block, /position:\s*absolute/);
  assert.doesNotMatch(block, /position:\s*(fixed|sticky)/);
});
