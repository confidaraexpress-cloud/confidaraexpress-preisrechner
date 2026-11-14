// Titelstile Signatur und Relief — Confidara Signature Typography (Betreiberentscheidungen D2/D3, 2026-11-13).
//
// Prüft den Vertrag von titelstile.css: welche Hauptüberschrift welches Material trägt, dass kein Titel unsichtbar
// werden kann (Füllung transparent nur zusammen mit einem Verlauf), dass erzwungene Farben, erhöhter Kontrast und
// Druck flach bleiben, dass markierter Text lesbar ist, dass nichts bewegt wird und dass die Admin-Anmeldung
// (Hologramm) keinen dieser Titel trägt.
//
// Run: node --test src/styles/titelstile.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const titel = ohneKommentare(read("./titelstile.css"));
const variables = ohneKommentare(read("./variables.css"));

/** Regeln einer Ebene als { sel, koerper } (verschachtelte @-Blöcke einzeln). */
function regeln(css) {
  const aus = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) aus.push({ sel: m[1].trim().replace(/\s+/g, " "), koerper: m[2] });
  return aus;
}
const liste = (sel) => sel.split(",").map((s) => s.trim()).filter(Boolean);
const block = (css, kopf) => {
  const i = css.indexOf(kopf);
  assert.ok(i >= 0, `${kopf} fehlt`);
  let tiefe = 0;
  for (let j = css.indexOf("{", i); j < css.length; j++) {
    if (css[j] === "{") tiefe++;
    if (css[j] === "}" && --tiefe === 0) return css.slice(css.indexOf("{", i) + 1, j);
  }
  throw new Error(`${kopf} nicht geschlossen`);
};

const TITEL = [".ce-page-header-title", ".legal-title", ".tracking-title", ".insinfo-title",
  ".booking-success-title", ".auth-title", ".pc-display"];

test("1 — beide Bündel laden die Datei genau einmal, das Hauptbündel vor der Musterebene", () => {
  const index = read("./index.css");
  const importe = [...index.matchAll(/@import '\.\/([\w-]+\.css)';/g)].map((m) => m[1]);
  assert.equal(importe.filter((f) => f === "titelstile.css").length, 1);
  assert.ok(importe.indexOf("titelstile.css") < importe.indexOf("patterns.css"), "titelstile.css steht nach patterns.css");
  assert.ok(importe.indexOf("titelstile.css") > importe.indexOf("variables.css"));
  const rechner = read("./public-calculator.css");
  const rechnerImporte = [...rechner.matchAll(/@import '\.\/([\w-]+\.css)';/g)].map((m) => m[1]);
  assert.equal(rechnerImporte.filter((f) => f === "titelstile.css").length, 1);
  assert.ok(rechnerImporte.indexOf("titelstile.css") > rechnerImporte.indexOf("variables.css"));
});

test("2 — die Mechanik greift nur mit background-clip: text und fällt ohne Zuordnung auf die Schriftfarbe zurück", () => {
  const supports = block(titel, "@supports ((background-clip: text) or (-webkit-background-clip: text))");
  const [mechanik] = regeln(supports);
  assert.deepEqual(liste(mechanik.sel), TITEL);
  // Zwei Ebenen (Titel-Clipping 2026-11-14): oben das Randband über die ganze Rahmenbox — im Malrand oben die erste,
  // unten die letzte Farbe der Füllung, dazwischen durchsichtig —, darunter die unveränderte Zeilenkachel.
  assert.match(mechanik.koerper, new RegExp(String.raw`background-image:\s*linear-gradient\(180deg,\s*`
    + String.raw`var\(--titel-kante-oben,\s*transparent\)\s+var\(--titel-malrand\),\s*transparent\s+var\(--titel-malrand\),\s*`
    + String.raw`transparent\s+calc\(100% - var\(--titel-malrand\)\),\s*`
    + String.raw`var\(--titel-kante-unten,\s*transparent\)\s+calc\(100% - var\(--titel-malrand\)\)\),\s*`
    + String.raw`var\(--titel-fuellung,\s*none\);`), "Randband über der Füllung");
  assert.match(mechanik.koerper, /-webkit-text-fill-color:\s*var\(--titel-schriftfuellung,\s*currentColor\);/);
  assert.match(mechanik.koerper, /filter:\s*var\(--titel-praegung,\s*none\);/);
  assert.match(mechanik.koerper, /-webkit-background-clip:\s*text;/);
  assert.match(mechanik.koerper, /(?<![\w-])background-clip:\s*text;/);
  assert.match(mechanik.koerper, /background-size:\s*100% 100%,\s*100% 1lh;/, "Randband ganz, je Zeile ein Verlauf");
  assert.match(mechanik.koerper, /background-repeat:\s*no-repeat,\s*repeat-y;/);
  assert.match(mechanik.koerper, /background-origin:\s*border-box,\s*content-box;/, "Band ab der Rahmenbox, Kachel ab dem Inhalt");
  // Außerhalb von @supports wird die Füllung nie transparent gesetzt.
  const aussen = titel.replace(supports, "");
  assert.doesNotMatch(aussen, /-webkit-text-fill-color:\s*transparent/);
});

test("3 — wer die Füllung transparent macht, setzt immer auch Verlauf und Prägung", () => {
  const zuordnungen = regeln(titel).filter((r) => r.koerper.includes("--titel-"));
  assert.ok(zuordnungen.length >= 4);
  for (const { sel, koerper } of zuordnungen) {
    if (!/--titel-schriftfuellung:\s*transparent/.test(koerper)) continue;
    assert.match(koerper, /--titel-fuellung:\s*var\(--ce-titel-[\w-]+-fuellung\);/, `${sel}: transparent ohne Verlauf`);
    assert.match(koerper, /--titel-praegung:\s*var\(--ce-titel-[\w-]+-praegung\);/, `${sel}: ohne Prägung`);
  }
  // Jede verwendete Titelgröße ist definiert.
  for (const [, name] of titel.matchAll(/var\((--ce-titel-[\w-]+)\)/g)) {
    assert.match(variables, new RegExp(`${name}:`), `${name} ist nicht definiert`);
  }
});

test("4 — Zuordnung nach D2/D3: Signatur Kunde und Einstieg, Relief Admin/Partner/Recht, Bühne auf dunklen Flächen", () => {
  const zuordnung = new Map();
  for (const { sel, koerper } of regeln(titel)) {
    const f = koerper.match(/--titel-fuellung:\s*var\(--ce-titel-([\w]+)-fuellung\)/);
    const p = koerper.match(/--titel-praegung:\s*var\(--ce-titel-([\w]+)-praegung\)/);
    if (!f && !p) continue;                                              // Mechanik, Markierung, Rückfall
    for (const s of liste(sel)) zuordnung.set(s, { fuellung: f?.[1], praegung: p?.[1] });
  }
  const erwartet = {
    ".ce-page-header-title": "relief",                                   // Admin, Partnerportal (ohne Bereich)
    ".legal-title": "relief",                                            // Rechtstexte
    ':root[data-ce-bereich="kunde"] .ce-page-header-title': "signatur",  // Kundenbereich
    ':root[data-ce-bereich="kunde"] .bsx .booking-success-title': "signatur",
    ".tracking-title": "signatur",
    ".insinfo-title": "signatur",
    ".auth-title": "buehne",                                             // Anmeldung, Registrierung, Partnerregistrierung (D3)
    ".pc-display": "buehne",                                             // Preisrechner
  };
  for (const [sel, stil] of Object.entries(erwartet)) {
    assert.equal(zuordnung.get(sel)?.fuellung, stil, `${sel}: Füllung ${zuordnung.get(sel)?.fuellung} statt ${stil}`);
    assert.equal(zuordnung.get(sel)?.praegung, stil, `${sel}: Prägung ${zuordnung.get(sel)?.praegung} statt ${stil}`);
  }
  // Der Gruß der Übersicht trägt dieselbe Füllung, eine ruhigere Prägung.
  assert.equal(zuordnung.get(':root[data-ce-bereich="kunde"] .main-content:has(.ov-page) .ce-page-header-title')?.praegung, "gruss");
});

test("5 — erzwungene Farben, erhöhter Kontrast und Druck: flach, ohne Verlauf und Schatten", () => {
  const rueckfall = block(titel, "@media (forced-colors: active), (prefers-contrast: more), print");
  const [regel] = regeln(rueckfall);
  assert.deepEqual(liste(regel.sel), TITEL, "jeder Titel der Mechanik hat einen Rückfall");
  assert.match(regel.koerper, /background-image:\s*none;/);
  assert.match(regel.koerper, /-webkit-text-fill-color:\s*currentColor;/);
  assert.match(regel.koerper, /filter:\s*none;/);
  // Gleiche Spezifität wie die Mechanik und später im Blatt.
  assert.ok(titel.indexOf("@media (forced-colors: active)") > titel.indexOf("@supports"));
});

test("6 — markierter Text bekommt eine echte Schriftfarbe, hell auf Blau bzw. Navy auf Weiß", () => {
  for (const sel of TITEL) {
    const r = regeln(titel).find((x) => liste(x.sel).includes(`${sel}::selection`));
    assert.ok(r, `${sel}: keine Markierungsregel`);
    assert.ok(liste(r.sel).includes(`${sel} *::selection`), `${sel}: Nachfahren ohne Markierungsregel`);
    assert.match(r.koerper, /-webkit-text-fill-color:\s*var\(--ce-titel-(buehne-)?auswahl-text\);/);
    assert.match(r.koerper, /(?<![\w-])color:\s*var\(--ce-titel-(buehne-)?auswahl-text\);/);
    assert.match(r.koerper, /background-color:\s*var\(--ce-titel-(buehne-)?auswahl-grund\);/);
  }
  const hex = (name) => variables.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))[1];
  assert.ok(kontrast(hex("--ce-titel-auswahl-text"), hex("--ce-titel-auswahl-grund")) >= 7);
  assert.ok(kontrast(hex("--ce-titel-buehne-auswahl-text"), hex("--ce-titel-buehne-auswahl-grund")) >= 7);
});

test("7 — die Füllung hält den Kontrast: hellste Stufe auf Weiß, dunkelste Bühnenstufe auf Navy", () => {
  const stufen = (name) => [...variables.match(new RegExp(`${name}:\\s*linear-gradient\\(([^;]+)\\);`))[1]
    .matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
  for (const name of ["--ce-titel-signatur-fuellung", "--ce-titel-relief-fuellung"]) {
    for (const s of stufen(name)) assert.ok(kontrast(s, "#ffffff") >= 7, `${name} ${s}: ${kontrast(s, "#ffffff").toFixed(2)}:1`);
  }
  for (const s of stufen("--ce-titel-buehne-fuellung")) {
    assert.ok(kontrast(s, "#0a1636") >= 7, `Bühne ${s}: ${kontrast(s, "#0a1636").toFixed(2)}:1 auf #0a1636`);
  }
});

test("8 — nur CSS: kein Pseudoelement mit Text, keine Bewegung, kein Blur", () => {
  assert.doesNotMatch(titel, /(?<![\w-])content\s*:/, "Pseudoelement mit Inhalt");
  assert.doesNotMatch(titel, /::?(before|after)\b/, "Pseudoelement am Titel");
  assert.doesNotMatch(titel, /@keyframes|animation|transition|will-change/, "Bewegung im Titelstil");
  assert.doesNotMatch(titel, /blur\(|backdrop-filter/);
  assert.doesNotMatch(titel, /#[0-9a-f]{3,8}\b|rgba?\(/i, "Farbwerte gehören nach variables.css");
  assert.doesNotMatch(titel, /url\(/, "kein Bild");
});

test("9 — die Admin-Anmeldung (Hologramm) trägt keinen Titelstil und bleibt unverändert", () => {
  assert.doesNotMatch(titel, /auth-admin/);
  const seite = read("../pages/AdminAnmeldungPage.jsx");
  for (const klasse of TITEL.map((s) => s.slice(1))) {
    assert.doesNotMatch(seite, new RegExp(`className="[^"]*\\b${klasse}\\b`), `Admin-Anmeldung nutzt ${klasse}`);
  }
  const geruest = readFileSync(new URL("../../admin-login.html", import.meta.url), "utf8");
  for (const klasse of TITEL.map((s) => s.slice(1))) {
    assert.doesNotMatch(geruest, new RegExp(`class="[^"]*\\b${klasse}\\b`), `admin-login.html nutzt ${klasse}`);
  }
  // Der Schutz der Seite: altes Grundgewicht, auch für Knöpfe und Felder ohne eigene Angabe.
  const auth = ohneKommentare(read("./auth.css"));
  const seitenRegel = auth.match(/\.auth-admin-seite \{([^}]*)\}/)[1];
  assert.match(seitenRegel, /font-weight:\s*400;/);
  assert.match(seitenRegel, /--ce-steuerelement-gewicht:\s*400;/);
  const titelRegel = auth.match(/\.auth-admin-titel \{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(titelRegel, /background-clip|text-fill|filter/, "der Admintitel trägt kein Titelmaterial");
});

test("10 — große Titel stehen auf 700, dem höchsten Gewicht der Schriftdatei", () => {
  for (const t of ["ce-text-title-page-weight", "ce-text-display-xl-weight"]) {
    const werte = [...variables.matchAll(new RegExp(`--${t}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());
    assert.ok(werte.length >= 2, `${t}: Grund- und Bereichsblock`);
    assert.ok(werte.every((w) => w === "700"), `${t}: ${werte.join(", ")}`);
  }
  const kunde = ohneKommentare(read("./premium-editorial.css")).match(/:root\[data-ce-bereich="kunde"\] \.ce-page-header-title \{([^}]*)\}/)[1];
  assert.match(kunde, /font-weight:\s*var\(--ce-text-title-page-weight\);/);
  const buehne = ohneKommentare(read("./premium-redesign.css")).match(/\[data-ce-bereich="auth"\] \.auth-title \{([^}]*)\}/)[1];
  assert.match(buehne, /font-weight:\s*var\(--ce-text-display-xl-weight\);/);
  const rechner = ohneKommentare(read("./public-calculator.css")).match(/\.pc-display \{([^}]*)\}/)[1];
  assert.match(rechner, /font-weight:\s*var\(--ce-text-display-xl-weight\);/);
  const partner = ohneKommentare(read("./auth.css")).match(/\.auth-title \{([^}]*)\}/)[1];
  assert.match(partner, /font-weight:\s*var\(--ce-text-display-xl-weight\);/);
  // Der Gruß bleibt ein Satz (2026-11-01): mittlere Stufe.
  const gruss = ohneKommentare(read("./premium-editorial.css"))
    .match(/:root\[data-ce-bereich="kunde"\] \.main-content:has\(\.ov-page\) \.ce-page-header-title \{([^}]*)\}/)[1];
  assert.match(gruss, /font-weight:\s*var\(--ce-weight-medium\);/);
});

test("11 — die Prüflogik greift tatsächlich", () => {
  // Ein Titel, der transparent würde, ohne einen Verlauf zu setzen, fiele in Test 3 auf.
  const kaputt = ".x { --titel-schriftfuellung: transparent; }";
  const r = regeln(kaputt)[0];
  assert.doesNotMatch(r.koerper, /--titel-fuellung:/);
  // Die Kontrastfunktion rechnet richtig (Schwarz auf Weiß 21:1, gleiche Farben 1:1).
  assert.equal(Math.round(kontrast("#000000", "#ffffff")), 21);
  assert.equal(kontrast("#5367e8", "#5367e8"), 1);
  // Test 14 fände einen eigenen Titelrand — auch im Medienblock, als Kurzform und mit Zusatzklasse —, nicht aber einen
  // Nachfahren, ein Pseudoelement, ein :has()-Subjekt oder die lokale Größe --titel-polster-oben.
  const verstoesse = eigeneAbstaende({ "x.css": [
    ".legal-title { margin-top: 4px; }",
    "@media (max-width: 640px) { .auth-title.auth-anim { padding: 0 0 2px; } }",
    ".pc-hero > .pc-display { margin-block: 12px; }",
    ".auth-title em { margin: 0; } .tracking-title::after { padding: 0; } .x:has(.insinfo-title) { margin: 0; }",
    ".bsx .booking-success-title { --titel-polster-oben: 2px; } .ce-page-header-title-x { margin: 0; }",
  ].join("\n") });
  assert.deepEqual(verstoesse.map((v) => v.split(" → ")[0]),
    ["x.css: .legal-title", "x.css: .auth-title.auth-anim", "x.css: .pc-hero > .pc-display"]);
  // … und eine Element- oder Allregel mit Gewicht, die den Malrand überschriebe — nicht aber dieselbe Regel in :where(),
  // ohne Gewicht, nur seitlich, für h2 oder für ein Pseudoelement.
  const element = ueberschreibendeElementregeln({ "x.css": [
    "@import './y.css'; .pc-page h1, .pc-page p { margin: 0; }",
    "@media print { [data-ce-bereich=\"kunde\"] .stapel > * + * { margin-top: 8px; } }",
    "h1:first-child { padding-block-start: 0; }",
    ":where(.pc-page) h1 { margin: 0; } h1 { margin: 0; } * { padding: 0; } .x > * { padding-left: 4px; }",
    ".adm h2 { margin: 0; } .x h1::before { margin: 0; } .x h1 { color: red; }",
  ].join("\n") });
  assert.deepEqual(element.map((v) => v.split(" → ")[0]),
    ["x.css: .pc-page h1", "x.css: [data-ce-bereich=\"kunde\"] .stapel > * + *", "x.css: h1:first-child"]);
  // Test 15 fände ein Randband, das nicht mehr zur Füllung passt, und eine Zuordnung mit fremder Kante.
  const fremd = kantenAbweichungen(
    "--ce-titel-relief-fuellung: linear-gradient(180deg, #1a3aa8 0%, #0d1a4a 100%); "
    + "--ce-titel-relief-kante-oben: #1a3aa8; --ce-titel-relief-kante-unten: #0b1b50;",
    ".legal-title { --titel-fuellung: var(--ce-titel-relief-fuellung); --titel-kante-oben: var(--ce-titel-signatur-kante-oben); "
    + "--titel-kante-unten: var(--ce-titel-relief-kante-unten); }");
  assert.equal(fremd.length, 2, fremd.join(" | "));
  // Test 13 fände eine Titelzeilenhöhe unter 1,0, für die der Malrand nicht reicht.
  assert.deepEqual(zuEngeZeilen({ "x.css": ".legal-title { line-height: 0.96; } .tracking-title { line-height: 1.04; }" }),
    ["x.css: .legal-title line-height 0.96"]);
});

/* Premium-Typografie 2.0 (Betreiberauftrag 2026-11-13): „Wirkung erhalten, aber weniger dunkler Schattenhof, feinere
   Schattenabstufungen, elegantere Lichtkanten; keine überladene Extrusion; Signatur markanter, Relief zurückhaltender“.
   Dieser Test hält das als Messgrößen fest — Extrusionstiefe, Deckkraft und Versatz des Schattenhofs. */
function praegung(wert) {
  const teile = [...wert.matchAll(/drop-shadow\(\s*(-?[\d.]+)\s+(-?[\d.]+)em\s+(-?[\d.]+)(?:em)?\s+(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*\)/gi)]
    .map(([, x, y, unschaerfe, farbe]) => ({
      x: Number(x), y: Number(y), unschaerfe: Number(unschaerfe), farbe,
      deckkraft: /^rgba/i.test(farbe) ? Number(farbe.match(/,\s*([\d.]+)\s*\)$/)[1]) : 1,
    }));
  assert.equal(teile.length, (wert.match(/drop-shadow\(/g) || []).length, `Prägung nicht vollständig gelesen: ${wert}`);
  return teile;
}
const praegungAus = (name) => {
  const m = variables.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(m, `--${name} fehlt`);
  return praegung(m[1]);
};
const hart = (s) => s.filter((d) => d.unschaerfe === 0 && d.y > 0);
const tiefe = (s) => Math.round(hart(s).reduce((a, d) => a + d.y, 0) * 1000) / 1000;
const navyHof = (s) => s.filter((d) => d.unschaerfe > 0 && /^rgba\(\s*1,\s*27,\s*85,/i.test(d.farbe));
const violettHof = (s) => s.filter((d) => d.unschaerfe > 0 && /^rgba\(\s*122,\s*92,\s*230,/i.test(d.farbe));

test("12 — Premium-Typografie 2.0: die Prägung bleibt fein — wenig Extrusion, kleiner und heller Schattenhof", () => {
  const signatur = praegungAus("ce-titel-signatur-praegung");
  const relief = praegungAus("ce-titel-relief-praegung");
  const gruss = praegungAus("ce-titel-gruss-praegung");
  for (const [name, s] of [["Signatur", signatur], ["Relief", relief], ["Gruß", gruss]]) {
    // Höchstens zwei Extrusionsstufen plus die haarfeine Kante in Logo-Blau, zusammen höchstens 0,035 em
    // (zuvor drei Navy-Stufen plus Kante: 0,06 em — der „massive“ Unterrand).
    assert.ok(hart(s).length <= 3, `${name}: ${hart(s).length} harte Stufen unter dem Titel`);
    assert.ok(tiefe(s) <= 0.035, `${name}: Extrusion ${tiefe(s)} em`);
    // Lichtkante oben: weiß, höchstens 0,014 em.
    assert.ok(s.some((d) => d.y < 0 && d.y >= -0.014 && /255,\s*255,\s*255/.test(d.farbe)), `${name}: keine feine Lichtkante`);
    // Schattenhof: Navy höchstens 15 % Deckkraft und 0,1 em Versatz (zuvor 22 % und 0,16 em); Violett nur als Hauch.
    for (const d of navyHof(s)) {
      assert.ok(d.deckkraft <= 0.15, `${name}: Schattenhof ${d.deckkraft * 100} % Deckkraft`);
      assert.ok(d.y <= 0.1 && d.unschaerfe <= 0.12, `${name}: Schattenhof ${d.y}/${d.unschaerfe} em`);
    }
    for (const d of violettHof(s)) assert.ok(d.deckkraft <= 0.1, `${name}: Violettreflexion ${d.deckkraft * 100} %`);
  }
  // Signatur bleibt die markantere Fassung, Relief und Gruß sind ruhiger.
  assert.ok(tiefe(relief) <= tiefe(signatur) && tiefe(gruss) <= tiefe(signatur), "Relief/Gruß tiefer geprägt als Signatur");
  const staerksterHof = (s) => Math.max(0, ...navyHof(s).map((d) => d.deckkraft));
  assert.ok(staerksterHof(relief) <= staerksterHof(signatur), "Relief mit dunklerem Schattenhof als Signatur");
  // Balance Navy / elektrisches Blau: Signatur beginnt oben im elektrischen Blau, Relief sachlicher und dunkler.
  const ersteStufe = (name) => variables.match(new RegExp(`--${name}:\\s*linear-gradient\\([^#]*(#[0-9a-f]{6})`, "i"))[1];
  const sigOben = ersteStufe("ce-titel-signatur-fuellung");
  assert.ok(parseInt(sigOben.slice(5, 7), 16) >= 0xc0, `Signatur beginnt nicht im elektrischen Blau: ${sigOben}`);
  assert.ok(kontrast(ersteStufe("ce-titel-relief-fuellung"), "#ffffff") > kontrast(sigOben, "#ffffff"),
    "Relief beginnt nicht dunkler als Signatur");
  // Die Prüfung greift: die frühere Signatur-Prägung fiele durch.
  const frueher = praegung("drop-shadow(0 -0.014em 0 rgba(255, 255, 255, 0.95)) drop-shadow(0 0.016em 0 #10246a) "
    + "drop-shadow(0 0.016em 0 #0a1a52) drop-shadow(0 0.016em 0 #071440) drop-shadow(0 0.012em 0 rgba(0, 74, 252, 0.5)) "
    + "drop-shadow(0 0.16em 0.2em rgba(1, 27, 85, 0.22)) drop-shadow(0 0.26em 0.42em rgba(122, 92, 230, 0.12))");
  assert.ok(tiefe(frueher) > 0.035 && hart(frueher).length > 3 && navyHof(frueher)[0].deckkraft > 0.15);
});

function kontrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/* ══════════ Malrand (Titel-Clipping, 2026-11-14) ═══════════════════════════════════════════════════════════════════
   background-clip: text malt nur in der Rahmenbox. Bei Zeilenhöhe 1,04 ragen Unterlängen von Instrument Sans bis
   0,06 em unter und Akzente großer Buchstaben bis 0,11 em über die Box; ein Malrand von 0,14 em (Innenabstand,
   ausgeglichen durch denselben negativen Außenabstand) holt sie in den Malbereich, ohne dass sich eine Zeile bewegt.
   Neutral ist der Ausgleich nur, solange kein Titel einen eigenen Außen- oder Innenabstand trägt (Test 14). */
const STIL_DATEIEN = Object.fromEntries(readdirSync(new URL("./", import.meta.url))
  .filter((f) => f.endsWith(".css") && f !== "titelstile.css")
  .map((f) => [f, ohneKommentare(read(`./${f}`))]));
const TITEL_KLASSE = new RegExp(String.raw`\.(${TITEL.map((s) => s.slice(1)).join("|")})(?![\w-])`);

/** Subjekt eines Selektors: der letzte zusammengesetzte Selektor, ohne Klammerinhalte (:has, :is, :not). */
function subjekt(selektor) {
  let s = selektor;
  for (let alt = ""; alt !== s;) { alt = s; s = s.replace(/\([^()]*\)/g, "()"); }
  return s.trim().split(/\s*[\s>+~]\s*/).filter(Boolean).pop() || "";
}
/** Regeln, deren Subjekt ein Titel ist (ohne Pseudoelemente), je Datei. */
function titelRegeln(dateien) {
  const aus = [];
  for (const [datei, text] of Object.entries(dateien)) {
    for (const { sel, koerper } of regeln(text)) {
      if (sel.startsWith("@")) continue;
      for (const s of liste(sel.replace(/^.*@[^{]*$/, ""))) {
        const sub = subjekt(s);
        if (TITEL_KLASSE.test(sub) && !sub.includes("::")) aus.push({ datei, sel: s, koerper });
      }
    }
  }
  return aus;
}
function eigeneAbstaende(dateien) {
  return titelRegeln(dateien)
    .filter((r) => /(?<![\w-])(margin|padding)(-[a-z]+)*\s*:/.test(r.koerper))
    .map((r) => `${r.datei}: ${r.sel} → ${r.koerper.trim().replace(/\s+/g, " ").slice(0, 80)}`);
}
/** Regeln ohne Titelklasse, die einen Titel trotzdem treffen und seinen Malrand überschreiben: Subjekt h1 (alle sieben
    Titel sind h1) oder *, mit Gewicht aus Klasse, Attribut, ID oder Pseudoklasse außerhalb von :where() — also
    mindestens so spezifisch wie die Titelklasse — und mit einem Außen- oder Innenabstand in Blockrichtung. */
function ueberschreibendeElementregeln(dateien) {
  const aus = [];
  for (const [datei, text] of Object.entries(dateien)) {
    for (const { sel, koerper } of regeln(text)) {
      const kopf = sel.replace(/^(?:@[^;{]*;\s*)+/, "");
      if (kopf.startsWith("@") || !/(?<![\w-])(margin|padding)(-top|-bottom|-block|-block-start|-block-end)?\s*:/.test(koerper)) continue;
      for (const s of liste(kopf)) {
        if (!/^(h1|\*)(:[\w-]+(\(\))?)*$/.test(subjekt(s))) continue;
        let gefaltet = s;
        for (let alt = ""; alt !== gefaltet;) { alt = gefaltet; gefaltet = gefaltet.replace(/\([^()]*\)/g, "()"); }
        if (/[.#[]|:(?!where\(\))/.test(gefaltet)) aus.push(`${datei}: ${s} → ${koerper.trim().replace(/\s+/g, " ").slice(0, 80)}`);
      }
    }
  }
  return aus;
}
function zuEngeZeilen(dateien) {
  const aus = [];
  for (const r of titelRegeln(dateien)) {
    for (const [, wert] of r.koerper.matchAll(/(?<![\w-])line-height:\s*([^;]+);/g)) {
      const v = wert.trim();
      const tokens = [...v.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
      const zahlen = /^[\d.]+$/.test(v) ? [Number(v)]
        : tokens.flatMap((t) => [...variables.matchAll(new RegExp(String.raw`${t}:\s*([\d.]+)\s*;`, "g"))].map((m) => Number(m[1])));
      for (const z of zahlen) if (z < 1) aus.push(`${r.datei}: ${r.sel} line-height ${z}`);
    }
  }
  return aus;
}
function stufen(vars, name) {
  const m = vars.match(new RegExp(String.raw`${name}:\s*linear-gradient\(([^;]+)\);`));
  return m ? [...m[1].matchAll(/#[0-9a-f]{6}/gi)].map((x) => x[0].toLowerCase()) : [];
}
function kantenAbweichungen(vars, titelCss) {
  const aus = [];
  for (const material of [...vars.matchAll(/--ce-titel-([a-z]+)-fuellung:/g)].map((m) => m[1])) {
    const s = stufen(vars, `--ce-titel-${material}-fuellung`);
    const oben = vars.match(new RegExp(String.raw`--ce-titel-${material}-kante-oben:\s*(#[0-9a-f]{6})`, "i"))?.[1]?.toLowerCase();
    const unten = vars.match(new RegExp(String.raw`--ce-titel-${material}-kante-unten:\s*(#[0-9a-f]{6})`, "i"))?.[1]?.toLowerCase();
    if (oben !== s[0]) aus.push(`${material}: Kante oben ${oben} statt erster Stufe ${s[0]}`);
    if (unten !== s[s.length - 1]) aus.push(`${material}: Kante unten ${unten} statt letzter Stufe ${s[s.length - 1]}`);
  }
  for (const { sel, koerper } of regeln(titelCss)) {
    const f = koerper.match(/--titel-fuellung:\s*var\(--ce-titel-([a-z]+)-fuellung\)/);
    if (!f) continue;
    for (const seite of ["oben", "unten"]) {
      if (!new RegExp(String.raw`--titel-kante-${seite}:\s*var\(--ce-titel-${f[1]}-kante-${seite}\)`).test(koerper)) {
        aus.push(`${sel}: Füllung ${f[1]} ohne passende Kante ${seite}`);
      }
    }
  }
  return aus;
}

test("13 — Malrand: alle sieben Titel, unbedingt (auch im Rückfall), ausgeglichen; jede Titelzeilenhöhe ist gedeckt", () => {
  const supports = block(titel, "@supports ((background-clip: text) or (-webkit-background-clip: text))");
  const rueckfall = block(titel, "@media (forced-colors: active), (prefers-contrast: more), print");
  const aussen = titel.replace(supports, "").replace(rueckfall, "");
  const malrand = regeln(aussen).filter((r) => r.koerper.includes("--titel-malrand:"));
  assert.equal(malrand.length, 1, "genau eine Malrand-Regel außerhalb von @supports und @media");
  assert.deepEqual(liste(malrand[0].sel), TITEL);
  assert.match(malrand[0].koerper, /--titel-malrand:\s*0\.14em;/);
  assert.match(malrand[0].koerper,
    /padding-block:\s*calc\(var\(--titel-polster-oben,\s*0px\) \+ var\(--titel-malrand\)\)\s+var\(--titel-malrand\);/);
  assert.match(malrand[0].koerper, /margin-block:\s*calc\(-1 \* var\(--titel-malrand\)\);/, "Ausgleich per negativem Außenabstand");
  assert.doesNotMatch(supports + rueckfall, /--titel-malrand:|padding|margin/, "der Malrand hängt an keinem Zweig");
  // 0,14 em reicht für Zeilenhöhen ab 1,0 (Akzent „Å“ oben 0,99 − 0,86 = 0,13 em). Keine Titelregel setzt weniger.
  assert.deepEqual(zuEngeZeilen(STIL_DATEIEN), [], "Titelzeilenhöhe unter 1,0");
});

test("14 — Titel tragen keine eigenen Außen- oder Innenabstände (der Malrand-Ausgleich bleibt neutral)", () => {
  // Ein eigener positiver Außenabstand fiele per Margin-Collapsing mit dem negativen Ausgleich zusammen und verschöbe
  // die Nachbarn (gemessen: Partnerregistrierung +10 px). Abstände stehen an den Nachbarn; ein Innenabstand oben als
  // --titel-polster-oben. Geprüft wird jede Regel, deren Subjekt eine der sieben Titelklassen ist.
  assert.ok(titelRegeln(STIL_DATEIEN).length >= 7, "die Titelregeln wurden nicht gefunden");
  assert.deepEqual(eigeneAbstaende(STIL_DATEIEN), [], "Titel mit eigenem Abstand");
  // Dasselbe über Element- und Allregeln: .pc-page h1 { margin: 0 } (0,1,1) schlug .pc-display (0,1,0) — der Preisrechner
  // behielt den Innenabstand ohne Ausgleich, alles darunter rückte 0,28 em tiefer (gemessen in tests/e2e/titelMalrand).
  assert.deepEqual(ueberschreibendeElementregeln(STIL_DATEIEN), [], "Element- oder Allregel überschreibt den Malrand");
  assert.match(STIL_DATEIEN["public-calculator.css"], /:where\(\.pc-page\) h1 \{\s*margin: 0;\s*\}/, "Rücksatz der h1 ohne Klassengewicht");
  // Die zwei früheren Titelabstände stehen jetzt an den Nachbarn.
  const auth = STIL_DATEIEN["auth.css"];
  assert.match(auth, /\.auth-hero > \.auth-brand \{ margin-bottom: 28px; \}/, "Partnerregistrierung: Marke → Titel 28 px");
  assert.match(auth, /\.auth-sub-2 \{[^}]*margin-top: 18px;/, "Partnerregistrierung: Titel → Unterzeile 18 px");
  assert.match(STIL_DATEIEN["insurance-info.css"], /\.insinfo-lead \{\s*margin: var\(--ce-space-2\) 0 0;/,
    "Versicherungsinfo: Titel → Einleitung 8 px");
  assert.match(STIL_DATEIEN["premium-redesign.css"],
    /\[data-ce-bereich="kunde"\] \.bsx \.booking-success-title \{\s*--titel-polster-oben: 2px;/, "Buchungserfolg: 2 px oben");
});

test("15 — das Randband trägt die erste und letzte Farbe der jeweiligen Füllung, die Zuordnung passt zum Material", () => {
  assert.deepEqual(kantenAbweichungen(variables, titel), []);
  for (const material of ["signatur", "relief", "buehne"]) {
    assert.ok(stufen(variables, `--ce-titel-${material}-fuellung`).length >= 2, `${material}: Füllung nicht gelesen`);
  }
});
