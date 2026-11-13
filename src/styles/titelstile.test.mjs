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
import { readFileSync } from "node:fs";

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
  assert.match(mechanik.koerper, /background-image:\s*var\(--titel-fuellung,\s*none\);/);
  assert.match(mechanik.koerper, /-webkit-text-fill-color:\s*var\(--titel-schriftfuellung,\s*currentColor\);/);
  assert.match(mechanik.koerper, /filter:\s*var\(--titel-praegung,\s*none\);/);
  assert.match(mechanik.koerper, /-webkit-background-clip:\s*text;/);
  assert.match(mechanik.koerper, /(?<![\w-])background-clip:\s*text;/);
  assert.match(mechanik.koerper, /background-size:\s*100% 1lh;/, "je Zeile ein Verlauf");
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
