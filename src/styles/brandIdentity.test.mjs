// Markenintegration Web (Paket 1) — Quelltext-Invarianten.
//
// Geprüft wird, was bei künftigen Änderungen leicht unbemerkt kaputtgeht:
// dass es genau EINE Quelle für die Marke gibt, dass beide Farbfassungen
// dieselbe Geometrie tragen, dass die verbindlichen digitalen Markenfarben
// #111A33 / #5367E8 gelten, dass keine nachgebaute „CE"-Kachel zurückkehrt,
// dass der Claim NICHT produktiv eingebaut ist und dass kein seitenweites
// Wasserzeichen entsteht.
//
// Rein statisch — kein Rendering, keine neue Dependency. Das Verhalten im
// echten Browser deckt tests/e2e/brandIdentity.test.mjs ab.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const stripXml = (s) => s.replace(/<!--[\s\S]*?-->/g, "");

const NAVY = "#111A33";
const BLAU = "#5367E8";
const HELL = "#F7F8FC";

const markStandard = stripXml(read("../assets/brand/mark-primary.svg"));
const markReverse  = stripXml(read("../assets/brand/mark-reverse.svg"));
const favicon      = stripXml(readFileSync(new URL("../../public/favicon.svg", import.meta.url), "utf8"));
const brandLogo    = read("../components/ui/BrandLogo.jsx");
const primitives   = read("./primitives.css");
const variables    = read("./variables.css");
// Kommentare dürfen die abgelösten Werte nennen; geprüft wird das Markup.
const indexHtml    = stripXml(readFileSync(new URL("../../index.html", import.meta.url), "utf8"));

// Alle Quelldateien des Frontends (ohne Tests).
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
  .filter((f) => f.endsWith(".css"))
  .map((f) => [f, read(`./${f}`)]);

/* ══════════ 1 — vier Varianten aus einer Quelle ═════════════════════════ */

test("1 — es gibt genau ein Markenbauteil mit zwei Varianten und zwei Tonlagen", () => {
  assert.match(brandLogo, /export function BrandLogo/, "BrandLogo fehlt");
  // Beide Assets werden statisch importiert (Vite-Anforderung) …
  assert.match(brandLogo, /import markStandard from "\.\.\/\.\.\/assets\/brand\/mark-primary\.svg"/);
  assert.match(brandLogo, /import markReverse from "\.\.\/\.\.\/assets\/brand\/mark-reverse\.svg"/);
  // … und über eine Tonlagen-Zuordnung ausgewählt.
  assert.match(brandLogo, /const ASSET = \{ standard: markStandard, reverse: markReverse \}/);
  // Signet = nur Bildmarke, Wortmarke = Bildmarke + ausgeschriebener Text.
  assert.match(brandLogo, /variant = "wordmark"/, "Standardvariante ist nicht die Wortmarke");
  assert.match(brandLogo, /const isWordmark = variant === "wordmark"/);
  assert.match(brandLogo, /\{isWordmark && \(/, "Signet rendert die Wortmarke nicht ab");
  assert.match(brandLogo, /Confidara<b>Express<\/b>/, "Wortmarke fehlt");
});

test("2 — außer dem Markenbauteil importiert nur das Übersichts-Wasserzeichen ein Markenasset", () => {
  const importeure = QUELLEN.filter(([, src]) => /assets\/brand\//.test(src)).map(([f]) => f).sort();
  assert.deepEqual(importeure, ["BrandLogo.jsx", "Overview.jsx"],
    `unerwartete direkte Markenimporte: ${importeure.join(", ")}`);
});

/* ══════════ 2 — verbindliche Markenfarben ══════════════════════════════ */

test("3 — die Standardvariante trägt Primary Navy und Primary Blue", () => {
  assert.ok(markStandard.includes(`fill="${NAVY}"`), "C trägt nicht Primary Navy");
  assert.equal((markStandard.match(new RegExp(`fill="${BLAU}"`, "g")) ?? []).length, 3,
    "genau die drei E-Striche tragen Primary Blue");
  // Und die Farbwerte stimmen mit dem Designsystem überein — keine zweite Quelle.
  assert.match(variables, new RegExp(`--ce-color-text-primary:\\s*${NAVY}`, "i"));
  assert.match(variables, new RegExp(`--ce-color-brand:\\s*${BLAU}`, "i"));
});

test("4 — die Reverse-Variante steht einfarbig hell", () => {
  assert.equal((markReverse.match(new RegExp(`fill="${HELL}"`, "g")) ?? []).length, 4,
    "Reverse-Variante muss C und drei E-Striche einfarbig hell führen");
  assert.ok(!new RegExp(BLAU, "i").test(markReverse),
    "Primary Blue misst auf der dunklen Chipfläche 2,96:1 und gehört nicht in die Reverse-Variante");
  assert.ok(!new RegExp(NAVY, "i").test(markReverse), "Primary Navy ist auf dunklem Grund unsichtbar");
});

test("5 — beide Fassungen tragen exakt dieselbe Geometrie", () => {
  const pfad = (s) => s.match(/ d="([^"]+)"/)[1];
  const rechtecke = (s) => [...s.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" rx="(\d+)"/g)]
    .map((m) => m.slice(1).join(","));
  assert.equal(pfad(markStandard), pfad(markReverse), "C-Bogen weicht ab");
  assert.deepEqual(rechtecke(markStandard), rechtecke(markReverse), "E-Striche weichen ab");
  assert.equal(rechtecke(markStandard).length, 3, "die Marke hat drei E-Striche");
  for (const [name, svg] of [["standard", markStandard], ["reverse", markReverse]]) {
    assert.ok(svg.includes('viewBox="0 0 256 256"'), `${name}: viewBox verändert`);
  }
});

test("6 — die abgelösten Farbpaare kehren nicht zurück", () => {
  // Alte Markenfarben, alter Favicon-Verlauf und das ausgelaufene Legacy-Blau.
  const ALT = ["#0A1633", "#2C438C", "#8EA2F0", "#0B1F4D", "#2563eb", "#60a5fa", "#1D4ED8"];
  for (const wert of ALT) {
    const re = new RegExp(wert, "i");
    assert.ok(!re.test(markStandard + markReverse + favicon), `${wert} steht noch in einem Markenasset`);
    assert.ok(!re.test(indexHtml), `${wert} steht noch in index.html`);
  }
});

/* ══════════ 3 — keine nachgebaute Marke mehr ═══════════════════════════ */

test("7 — keine handgebaute CE-Kachel im produktiven Frontend", () => {
  // Eine Logo-Kachel ist ein Element, dessen SICHTBARER Inhalt genau „CE" ist.
  // Fachliche Textnennungen von „CE" bleiben davon unberührt.
  const treffer = [];
  for (const [datei, src] of QUELLEN) {
    for (const m of src.matchAll(/<(div|span|p)\b[^>]*>\s*CE\s*<\/\1>/g)) treffer.push(`${datei}: ${m[0]}`);
  }
  assert.deepEqual(treffer, [], `nachgebaute CE-Kachel gefunden:\n  ${treffer.join("\n  ")}`);
  // Und die zugehörigen Klassen sind samt Regeln verschwunden.
  for (const [datei, css] of ALLE_CSS) {
    for (const sel of [".logo-mark", ".logo-text", ".pp-brandmark-img", ".adm-brand-mark"]) {
      assert.ok(!stripComments(css).includes(sel), `${datei}: abgelöste Klasse ${sel} lebt noch`);
    }
  }
});

test("8 — das Favicon zeigt die echte Marke, nicht gesetzten Text", () => {
  assert.ok(!/<text/.test(favicon), "das Favicon enthält noch eine Textmarke");
  assert.ok(!/font-family/.test(favicon), "das Favicon zeichnet die Marke noch als Schrift");
  // Dieselbe Geometrie wie die Assets — nur transformiert.
  const pfad = (s) => s.match(/ d="([^"]+)"/)[1];
  assert.equal(pfad(favicon), pfad(markStandard), "das Favicon nutzt eine andere Geometrie");
  // Eigene Fläche in Primary Navy: ein Favicon steht je nach Browserthema auf
  // hellem ODER dunklem Grund; transparent wäre es in einem Fall unsichtbar.
  assert.match(favicon, new RegExp(`<rect width="64" height="64" rx="14" fill="${NAVY}"`, "i"));
  assert.ok(favicon.includes(`fill="${HELL}"`), "die Marke steht nicht in der hellen Fassung");
  assert.match(indexHtml, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/,
    "index.html verweist nicht auf das SVG-Favicon");
});

/* ══════════ 4 — Grenzen des Pakets ═════════════════════════════════════ */

test("9 — der Claim ist nicht produktiv integriert", () => {
  const CLAIM = /versandvermittlung/i;
  // Kommentare dürfen begründen, warum der Claim fehlt — gerendert wird er nicht.
  const ohneKommentar = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const [datei, src] of QUELLEN) {
    assert.ok(!CLAIM.test(ohneKommentar(src)), `${datei}: der Claim ist produktiv eingebaut`);
  }
  for (const [datei, css] of ALLE_CSS) assert.ok(!CLAIM.test(css), `${datei}: Claim im Stylesheet`);
  for (const [name, svg] of [["mark-primary", markStandard], ["mark-reverse", markReverse], ["favicon", favicon]]) {
    assert.ok(!CLAIM.test(svg), `${name}: der Claim steckt im Asset`);
    assert.ok(!/<text/.test(svg), `${name}: gesetzter Text im Markenasset`);
  }
  assert.ok(!CLAIM.test(indexHtml), "Claim in index.html");
});

test("10 — es entsteht kein seitenweites Wasserzeichen", () => {
  // Kein Markenasset als Hintergrundbild — an KEINER Stelle im CSS. Data-URIs
  // für Formularsteuerelemente (Haken, Pfeil) bleiben davon unberührt; geprüft
  // wird die Geometrie der MARKE, erkennbar am Beginn des C-Bogens.
  const MARKENPFAD = "M210 48C213 50";
  for (const [datei, css] of ALLE_CSS) {
    const regeln = stripComments(css);
    assert.ok(!/background[^;}]*url\([^)]*(mark-|brand\/|favicon)/i.test(regeln),
      `${datei}: Markenasset als Hintergrundbild`);
    assert.ok(!regeln.includes(MARKENPFAD) && !regeln.includes(encodeURIComponent(MARKENPFAD)),
      `${datei}: Data-URI-Kopie der Bildmarke`);
  }
  // Das einzige gerenderte Wasserzeichen bleibt das lokale Detail des
  // Trust-Tiles der Übersicht. Gesucht wird die tatsächlich gesetzte Klasse —
  // fachliche Erwähnungen des Worts (Testvermerk der Rechnungs-PDF) zählen nicht.
  const wasserzeichen = QUELLEN
    .filter(([, src]) => /className="[^"]*watermark/i.test(src))
    .map(([f]) => f).sort();
  assert.deepEqual(wasserzeichen, ["Overview.jsx"],
    `unerwartete Wasserzeichen: ${wasserzeichen.join(", ")}`);
  // Und es bleibt an seine Karte gebunden — nicht fixiert, nicht seitenweit.
  const wm = stripComments(read("./overview.css")).match(/\.pp-trust-watermark \{([^}]*)\}/)?.[1] ?? "";
  assert.match(wm, /position:\s*absolute/, "das Wasserzeichen muss in seiner Karte liegen");
  assert.doesNotMatch(wm, /position:\s*(fixed|sticky)/, "weder fixed noch sticky");
});

/* ══════════ 5 — Einbindung je Fläche ═══════════════════════════════════ */

test("11 — jede Fläche wählt die Tonlage ihrer tatsächlichen Hintergrundfarbe", () => {
  const holen = (name) => QUELLEN.find(([f]) => f === name)?.[1] ?? "";
  const aufruf = (src) => [...src.matchAll(/<BrandLogo[\s\S]*?\/>/g)].map((m) => m[0]);

  // Dunkle Flächen → reverse.
  for (const datei of ["DashboardSidebar.jsx", "AuthPage.jsx"]) {
    const rufe = aufruf(holen(datei));
    assert.ok(rufe.length >= 1, `${datei}: kein BrandLogo`);
    for (const r of rufe) assert.match(r, /tone="reverse"/, `${datei}: dunkle Fläche braucht reverse`);
  }
  // Helle Flächen → standard.
  for (const datei of ["AdminSidebar.jsx", "DashboardLayout.jsx", "DashboardPage.jsx", "LoadingScreen.jsx"]) {
    const rufe = aufruf(holen(datei));
    assert.ok(rufe.length >= 1, `${datei}: kein BrandLogo`);
    for (const r of rufe) assert.match(r, /tone="standard"/, `${datei}: helle Fläche braucht standard`);
  }
  // Die öffentliche Navigation trägt beides: helle Leiste, dunkler Drawer.
  const navbar = aufruf(holen("NavbarLayout.jsx"));
  assert.equal(navbar.length, 2, "die öffentliche Navigation hat zwei Markenstellen");
  assert.ok(navbar.some((r) => /tone="standard"/.test(r)), "die helle Leiste braucht standard");
  assert.ok(navbar.some((r) => /tone="reverse"/.test(r)), "der dunkle Drawer braucht reverse");
});

test("12 — die Anmeldung trägt genau einen Markenanker", () => {
  const auth = QUELLEN.find(([f]) => f === "AuthPage.jsx")[1];
  assert.equal([...auth.matchAll(/<BrandLogo/g)].length, 1, "genau ein Markenanker erwartet");
  assert.match(auth, /<BrandLogo variant="wordmark" tone="reverse" className="auth-brand/);
  // Das Formular bleibt unangetastet.
  for (const marker of ["<LoginForm", "<RegisterForm", "<ForgotPasswordForm", "<ResetPasswordForm", "handleLogin"]) {
    assert.ok(auth.includes(marker), `AuthPage: ${marker} wurde entfernt`);
  }
});

test("13 — das Markenbauteil färbt nichts um und setzt immer eine Größe", () => {
  const grund = stripComments(primitives);
  // Die Assets liegen in Zielfarbe vor — kein Filter, keine Einfärbung.
  const block = grund.match(/\.ce-brandmark-img \{([^}]*)\}/)?.[1] ?? "";
  assert.ok(block, ".ce-brandmark-img fehlt");
  assert.match(block, /filter:\s*none/, "filter: none fehlt");
  assert.match(block, /width:\s*\d+px/, "die Bildmarke braucht eine gesetzte Breite");
  assert.match(block, /height:\s*\d+px/, "die Bildmarke braucht eine gesetzte Höhe");
  // Die Wortmarke ist echter Text und trägt auf hellem Grund beide Markenfarben.
  assert.match(grund, /\.ce-brand-word \{[^}]*color:\s*var\(--ce-color-text-primary\)/);
  assert.match(grund, /\.ce-brand-word b \{[^}]*color:\s*var\(--ce-color-brand\)/);
  // Auf dunklem Grund steht sie durchgehend hell.
  assert.match(grund, /\.ce-brand--reverse \.ce-brand-word b \{ color: var\(--ce-color-text-inverse\)/);
});

test("14 — die Marke ist nie doppelt vorlesbar", () => {
  // Wortmarke sichtbar → Bildmarke dekorativ; Signet allein → Bildmarke benannt.
  assert.match(brandLogo, /alt !== undefined \? alt : \(isWordmark \? "" : "ConfidaraExpress"\)/,
    "die alt-Regel des Markenbauteils wurde verändert");
  assert.match(brandLogo, /const decorative = altText === ""/);
  assert.match(brandLogo, /\.\.\.\(decorative \? \{ "aria-hidden": "true" \} : \{\}\)/,
    "dekorative Bildmarken brauchen aria-hidden");
});
