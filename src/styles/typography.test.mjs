// Governance für Paket A, Phase 2.5 — systemweite Typografie und Textfarben.
//
// Geprüft wird, dass die gesamte Oberfläche aus EINER Skala kommt: die
// Typografiestufen der Foundation, eine Schriftfamilie, höchstens Gewicht 700
// (die Achse der Schriftdatei — kein künstlicher Fettdruck), Textfarben
// ausschließlich aus den Foundation-Rollen und präzise, rechtsbündige Zahlen.
//
// Bewusst NICHT geprüft: Abstände, Layout, Kartenmaterial, Radien, Schatten —
// die gehören zu Phase 1/2 und haben dort ihre eigene Governance.
//
// Redesign 2026-10: die Skala folgt den freigegebenen Typografierollen. Seit der
// Betreiberentscheidung vom 2026-11-13 (Confidara Signature Typography, D1–D4)
// gilt: eine Familie (Instrument Sans) für die ganze Plattform, die Lesestufen
// der Grundskala +1 px (Seitentitel 34/40, mobil 28/34 · Abschnitt 18/26 ·
// Karte 16/24 · Fließtext 15/23 · klein 14/21 · Label 14/20 · Caption 13/20 ·
// Tabellenkopf 12/18 · Kennzahl 32/38 · Display S 24), Gewichte bis 700 (die
// Obergrenze der Schriftdatei). Cormorant und DM Sans sind entfernt. Der
// Auth-Bereich ist ausdrücklich eingefroren — seine eigenen Größen (11 px
// Versalzeilen) bleiben unverändert und sind die EINZIGE Ausnahme von der
// Untergrenze 12 px.
import test from "node:test";
import assert from "node:assert/strict";
import { pruefeImTestlauf } from "../../scripts/governance.mjs";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const STYLES = new URL("./", import.meta.url);
const SRC = new URL("../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const variables = stripComments(read("./variables.css"));

function tok(name, tiefe = 0) {
  const m = variables.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) return undefined;
  const wert = m[1].replace(/\s+/g, " ").trim();
  const verweis = wert.match(/^var\(--([\w-]+)\)$/);
  return verweis && tiefe < 5 ? tok(verweis[1], tiefe + 1) : wert;
}

// Alle Stylesheets außer den beiden, die die Foundation selbst definieren.
const DATEIEN = readdirSync(STYLES)
  .filter((f) => f.endsWith(".css") && f !== "variables.css" && f !== "fonts.css")
  .sort();
const css = Object.fromEntries(DATEIEN.map((f) => [f, stripComments(read(`./${f}`))]));

// Zeichenbereiche aller @media-Blöcke einer Datei.
function medienbereiche(text) {
  const out = [];
  for (const m of text.matchAll(/@media[^{]*\{/g)) {
    let tiefe = 0, i = m.index + m[0].length - 1;
    while (i < text.length) {
      if (text[i] === "{") tiefe++;
      else if (text[i] === "}") { tiefe--; if (tiefe === 0) { out.push([m.index, i]); break; } }
      i++;
    }
  }
  return out;
}

// Selektor der Regel, in der eine Fundstelle steht.
function selektorVor(text, index) {
  const auf = text.lastIndexOf("{", index);
  const davor = Math.max(text.lastIndexOf("}", auf), text.lastIndexOf("{", auf - 1));
  return text.slice(davor + 1, auf).replace(/\s+/g, " ").trim();
}

// Der eingefrorene Auth-Bereich: auth.css vollständig und jede Regel, deren
// Selektoren ausschließlich .auth-* ansprechen (z. B. dessen mobile Varianten
// in responsive.css).
const AUTH_DATEI = "auth.css";
const istAuth = (g) => g.datei === AUTH_DATEI
  || g.selektor.split(",").every((t) => /^\.auth-[\w-]+/.test(t.trim()));

// Öffentlicher Preisrechner (Betreiberentscheidung 2026-10-16): eine eigene, statische Seite mit
// Premium-Auftritt. Ihre Headline ist die EINZIGE Stelle außerhalb von Auth mit einer Display-Größe
// jenseits der Skala (ganze Pixel, 36/44/48 px je Breite). Alles andere dort bleibt auf der Skala.
const PREISRECHNER_DATEI = "public-calculator.css";
const istPreisrechnerDisplay = (g) => g.datei === PREISRECHNER_DATEI && g.selektor.trim() === ".pc-display";

// Alle font-size-Vorkommen als { datei, zeile, wert, media, selektor }. Premium-Redesign (E13): rem-Werte
// zählen mit ihrem Pixelwert bei 16 px Grundgröße — sie unterliegen derselben Skala und denselben Grenzen.
function alleGroessen() {
  const out = [];
  for (const [datei, text] of Object.entries(css)) {
    const bereiche = medienbereiche(text);
    for (const m of text.matchAll(/font-size:\s*([0-9]+(?:\.[0-9]+)?)(px|rem)/g)) {
      out.push({
        datei,
        zeile: text.slice(0, m.index).split("\n").length,
        wert: m[2] === "rem" ? Math.round(parseFloat(m[1]) * 16 * 1000) / 1000 : parseFloat(m[1]),
        media: bereiche.some(([a, b]) => a <= m.index && m.index <= b),
        selektor: selektorVor(text, m.index),
      });
    }
  }
  return out;
}
const GROESSEN = alleGroessen();

// Die zulässigen Stufen sind exakt die Werte der --ce-text-*-size(-mobile)-Tokens.
const SKALA = new Set([
  ...[...variables.matchAll(/--ce-text-[\w-]+-size(?:-mobile)?:\s*(\d+)px/g)].map((m) => Number(m[1])),
  // Premium-Redesign (E13): die Stufen des Bereichsblocks stehen in rem und zählen mit ihrem Pixelwert.
  ...[...variables.matchAll(/--ce-text-[\w-]+-size(?:-mobile)?:\s*(\d+(?:\.\d+)?)rem/g)].map((m) => Number(m[1]) * 16),
]);

/* ══════════ 1 — keine Halb-Pixel ═════════════════════════════════════════ */

test("1 — es gibt keine Halb-Pixel-Schriftgrößen mehr", () => {
  const treffer = GROESSEN.filter((g) => !Number.isInteger(g.wert))
    .map((g) => `${g.datei}:${g.zeile} (${g.wert}px)`);
  assert.deepEqual(treffer, [], `Halb-Pixel-Größen:\n  ${treffer.join("\n  ")}`);
  // Auch die Skala selbst enthält keine.
  for (const [, v] of variables.matchAll(/--ce-text-[\w-]+-size(?:-mobile)?:\s*([^;]+);/g)) {
    // Premium-Redesign Etappe 1 (E13): im Bereichs-Scope in rem, bei 16 px Grundgröße weiterhin ganze Pixel.
    const rem = v.trim().match(/^(\d+(?:\.\d+)?)rem$/);
    if (rem) assert.ok(Number.isInteger(Number(rem[1]) * 16), `rem-Wert ergibt keine ganze Pixelzahl: ${v}`);
    else assert.match(v.trim(), /^\d+px$/, `Skalenwert ist keine ganze Pixelzahl: ${v}`);
  }
  // Inline-Styles im JSX ebenfalls.
  const jsx = [];
  for (const pfad of quelldateien()) {
    const inhalt = readFileSync(pfad, "utf8");
    for (const m of inhalt.matchAll(/fontSize:\s*([0-9]+\.[0-9]+)/g)) {
      jsx.push(`${kurz(pfad)}: ${m[1]}`);
    }
  }
  assert.deepEqual(jsx, [], `Halb-Pixel in Inline-Styles: ${jsx.join(", ")}`);
});

/* ══════════ 2 — Untergrenze 11 px ════════════════════════════════════════ */

test("2 — nichts unter 11 px; außerhalb des Auth-Bereichs nichts unter 12 px", () => {
  const treffer = GROESSEN.filter((g) => g.wert < 11)
    .map((g) => `${g.datei}:${g.zeile} (${g.wert}px)`);
  assert.deepEqual(treffer, [], `zu kleine Schrift:\n  ${treffer.join("\n  ")}`);
  // Die kleinste Stufe ist Micro mit 12 px (Tabellenkopf, Gewicht 600). Caption
  // und Badge liegen seit D4 (Betreiberentscheidung 2026-11-13, Lesbarkeit der
  // Grundskala +1 px) auf 13 px. 11 px bleibt allein dem eingefrorenen Auth-Bereich.
  assert.equal(tok("ce-text-micro-size"), "12px", "die kleinste Stufe ist Micro (12px)");
  assert.equal(tok("ce-text-caption-size"), "13px", "Caption liegt auf 13px (D4)");
  assert.equal(tok("ce-text-badge-size"), "13px", "Badges liegen auf 13px (D4)");
  const klein = GROESSEN.filter((g) => g.wert < 12 && !istAuth(g))
    .map((g) => `${g.datei}:${g.zeile} ${g.selektor} (${g.wert}px)`);
  assert.deepEqual(klein, [], `unter 12 px außerhalb von Auth:\n  ${klein.join("\n  ")}`);

  const jsx = [];
  for (const pfad of quelldateien()) {
    const inhalt = readFileSync(pfad, "utf8");
    for (const m of inhalt.matchAll(/fontSize:\s*(\d+)(?![\d.])/g)) {
      if (Number(m[1]) < 12) jsx.push(`${kurz(pfad)}: ${m[1]}px`);
    }
  }
  assert.deepEqual(jsx, [], `zu kleine Inline-Größen: ${jsx.join(", ")}`);
});

/* ══════════ 3 — nur definierte Stufen ════════════════════════════════════ */

test("3 — jede Schriftgröße liegt auf einer definierten Stufe der Skala", () => {
  // Die Skala kennt Desktop- und Mobilwerte; beide sind zulässige Stufen.
  // Der eingefrorene Auth-Bereich behält seine eigenen Größen (Redesign 2026-10).
  const erlaubt = new Set([...SKALA]);
  const treffer = GROESSEN.filter((g) => !erlaubt.has(g.wert) && !istAuth(g) && !istPreisrechnerDisplay(g))
    .map((g) => `${g.datei}:${g.zeile} ${g.selektor} (${g.wert}px)`);
  assert.deepEqual(treffer, [], `Größen außerhalb der Skala:\n  ${treffer.join("\n  ")}`);
  // Die Skala selbst ist vollständig und trägt die freigegebenen Werte. Die
  // beiden Display-Stufen sind mit dem Redesign auf den Seitentitel
  // zurückgeführt — es gibt keine größere Überschrift als den Seitentitel.
  // D4 (Betreiberentscheidung 2026-11-13): Seitentitel 34/28 und die Lesestufen
  // +1 px. Display S (24 px) hält die bisherige Zwischenstufe der Kennwerte,
  // Beträge und Bühnentitel als eigene Stufe — deren Größe ändert sich nicht.
  for (const [stufe, desktop, mobil] of [
    ["display-xl", "34px", "28px"], ["display-l", "34px", "28px"],
    ["title-page", "34px", "28px"], ["title-section", "18px", "18px"],
    ["title-card", "16px", "16px"], ["body-l", "16px", "16px"],
    ["body", "15px", "15px"], ["body-s", "14px", "14px"],
    ["label", "14px", "14px"], ["micro", "12px", "12px"],
    ["numeric-display", "32px", "28px"], ["display-s", "24px", "24px"],
  ]) {
    assert.equal(tok(`ce-text-${stufe}-size`), desktop, `--ce-text-${stufe}-size`);
    assert.equal(tok(`ce-text-${stufe}-size-mobile`), mobil, `--ce-text-${stufe}-size-mobile`);
  }
  // Rollen ohne Mobilwert.
  for (const [rolle, wert] of [["caption", "13px"], ["badge", "13px"], ["button", "14px"], ["nav", "14px"]]) {
    assert.equal(tok(`ce-text-${rolle}-size`), wert, `--ce-text-${rolle}-size`);
  }
  assert.equal(tok("ce-text-button-weight"), "600", "Buttons 14/20 600");
  // Gewichtsleiter (Betreiberentscheidung 2026-11-13): Fließtext 450, mittlere Stufe 550.
  assert.equal(tok("ce-weight-text"), "450", "Fließtext 450");
  assert.equal(tok("ce-weight-medium"), "550", "mittlere Stufe 550");
  assert.equal(tok("ce-text-nav-weight"), "550", "Navigation 14/20 550 (Adminbereich, öffentlicher Drawer)");
  assert.equal(tok("ce-text-nav-weight-active"), "600", "aktive Navigation 600");
  // Die Kunden-Sidebar trägt seit der Feinkorrektur 2026-10 eine eigene,
  // präsentere Stufe — auf der Skala, nicht daneben. Die Navigation wächst mit
  // der Lesestufe D4 ausdrücklich NICHT mit: ihre 15 px liegen seitdem auf body.
  assert.equal(tok("ce-sidebar-nav-size"), tok("ce-text-body-size"), "Kunden-Sidebar auf der Stufe body");
  assert.equal(tok("ce-sidebar-nav-size"), "15px", "Kunden-Sidebar 15 px");
  assert.equal(tok("ce-sidebar-nav-weight"), "600", "Hauptpunkte der Kunden-Sidebar 600");
  assert.equal(tok("ce-sidebar-nav-weight-sub"), "550", "Unterpunkte und sekundäre Aktionen 550");
});

/* ══════════ 4 — Gewicht ══════════════════════════════════════════════════ */

// Premium-Redesign (Betreiberentscheidung 2026-10-27): Instrument Sans trägt in Kunde, Anmeldung und
// Preisrechner Titel und Preise bis 700. Seit D1 (Betreiberentscheidung 2026-11-13) liest die ganze Plattform
// Instrument Sans; die Grenze ist überall die Achse der Schriftdatei (400–700). Mehr wäre künstlicher
// Fettdruck. Die Hierarchie schützt der Teil unten: Lesestufen tragen das Fließtextgewicht, keine Titelgewichte.
const GEWICHT_MAX = 700;

test("4 — kein font-weight über 700 (Achse der Schriftdatei) außerhalb der @font-face-Deklarationen", () => {
  const treffer = [];
  for (const [datei, text] of Object.entries(css)) {
    for (const m of text.matchAll(/font-weight:\s*(\d+|bold|bolder)/g)) {
      const wert = m[1] === "bold" || m[1] === "bolder" ? 700 : Number(m[1]);
      if (wert > GEWICHT_MAX) treffer.push(`${datei}:${text.slice(0, m.index).split("\n").length} (${m[1]})`);
    }
  }
  assert.deepEqual(treffer, [], `zu fette Schrift:\n  ${treffer.join("\n  ")}`);

  // Inline-Styles und SVG-Attribute im JSX.
  const jsx = [];
  for (const pfad of quelldateien()) {
    const inhalt = readFileSync(pfad, "utf8");
    for (const m of inhalt.matchAll(/fontWeight[:=]\s*"?(\d+)"?/g)) {
      if (Number(m[1]) > GEWICHT_MAX) jsx.push(`${kurz(pfad)}: ${m[1]}`);
    }
  }
  assert.deepEqual(jsx, [], `zu fette Inline-Gewichte: ${jsx.join(", ")}`);

  // Die Skala selbst bleibt in jedem Block bei höchstens 700. Die Lesestufen tragen das Fließtextgewicht —
  // keine pauschale Anhebung (Auftrag 2026-11-13: „nicht sämtliche Texte auf 700“).
  for (const m of variables.matchAll(/--ce-text-[\w-]+-weight:\s*(\d+)/g)) {
    assert.ok(Number(m[1]) <= GEWICHT_MAX, `Skalengewicht ${m[1]} überschreitet ${GEWICHT_MAX}`);
  }
  for (const rolle of ["body-l", "body", "body-s", "caption"]) {
    assert.equal(tok(`ce-text-${rolle}-weight`), "450", `--ce-text-${rolle}-weight trägt das Fließtextgewicht 450`);
  }
  // Kein künstlicher Fettdruck.
  for (const [datei, text] of Object.entries(css)) {
    assert.doesNotMatch(text, /font-synthesis:\s*(?!none)/,
      `${datei}: font-synthesis darf nur abgeschaltet werden`);
  }
});

/* ══════════ 5 — Libre Franklin läuft aus ═════════════════════════════════ */

test("5 — keine neue Verwendung von Libre Franklin", () => {
  const treffer = [];
  for (const [datei, text] of Object.entries(css)) {
    for (const m of text.matchAll(/font-family:[^;]*Libre Franklin/g)) {
      treffer.push(`${datei}: ${m[0].trim()}`);
    }
  }
  for (const pfad of quelldateien()) {
    const inhalt = readFileSync(pfad, "utf8");
    // Der Fließtext der Datenschutzerklärung nennt die Schrift als Sachangabe.
    if (kurz(pfad) === "pages/DatenschutzPage.jsx") continue;
    if (/Libre Franklin/.test(inhalt)) treffer.push(kurz(pfad));
  }
  assert.deepEqual(treffer, [], `Libre Franklin wird noch verwendet: ${treffer.join(" | ")}`);
  // Die Fontdateien sind im Abschlusspaket entfernt — die Zusicherung dreht
  // sich damit um und ist strenger als vorher: sie verbietet, was sie vorher
  // verlangte.
  assert.doesNotMatch(read("./fonts.css"), /librefranklin/i,
    "fonts.css lädt Libre Franklin wieder");
  for (const d of ["librefranklin-700.woff2", "librefranklin-800.woff2"]) {
    assert.equal(existsSync(new URL(`../assets/fonts/${d}`, import.meta.url)), false,
      `${d} ist wieder im Repository`);
  }
  // Die dritte Schriftrolle --fh ist aufgelöst.
  for (const [datei, text] of Object.entries(css)) {
    assert.doesNotMatch(text, /var\(--fh\)/, `${datei}: --fh ist entfallen`);
  }
});

/* ══════════ 6/7 — keine Serifenschrift, die Displayrolle nur an einer Stelle ═ */

// Betreiberentscheidung 2026-11-13 (D1, D3): Cormorant ist vollständig entfernt. Die Displayrolle
// (--ce-font-display) bleibt als Name bestehen und zeigt auf Instrument Sans — benutzt wird sie nur noch vom
// Titel der Partnerregistrierung, der seitdem im Titelstil „Signatur“ steht.
const DISPLAYROLLE_ERLAUBT = new Set([
  // Redesign 2026-10: der Kundenseitentitel (.ce-page-header-title) und die
  // Begrüßung der Übersicht (.pp-h1, entfallen) laufen in der Sans-Schrift.
  // Die beiden früheren Erlaubnisse sind entfallen — eine Erlaubnis für etwas
  // Nichtvorhandenes erlaubt still auch seine Wiedereinführung (siehe unten).
  ".auth-title",           // Partnerregistrierung (auth.css); die Kunden-Anmeldung setzt ihre Stimme seit dem
                           // Premium-Redesign über premium-redesign.css.
  // Der öffentliche Preisrechner trug bis 2026-10-27 Cormorant in Headline und Abschnittstiteln; seit dem
  // Premium-Redesign (Betreiberentscheidung 2026-10-27) Instrument Sans. Die Erlaubnis ist entfallen — eine
  // Erlaubnis für etwas Nichtvorhandenes erlaubt still auch seine Wiedereinführung.
]);
// Abschlusspaket: `.auth-hero-title` stand hier als Erlaubnis, obwohl die Klasse
// weder in einem Stylesheet noch in einem Markup existiert. Eine Erlaubnis für
// etwas Nichtvorhandenes erlaubt still auch ihre Wiedereinführung — deshalb ist
// sie entfallen. Die Liste ist damit um einen Eintrag KÜRZER und um genau
// diesen Fall STRENGER.

function displayrolleSelektoren(text) {
  const out = [];
  for (const m of text.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const body = m[2];
    if (!/font-family:[^;]*(--ce-font-display|--fd|Cormorant)/.test(body)) continue;
    for (const sel of m[1].split(",")) out.push(sel.replace(/\s+/g, " ").trim());
  }
  return out;
}

test("6 — keine Serifenschrift; die Displayrolle steht nur an der freigegebenen Stelle", () => {
  const treffer = [];
  for (const [datei, text] of Object.entries(css)) {
    for (const sel of displayrolleSelektoren(text)) {
      // Die Rollendefinition selbst (--fd: …) ist keine Verwendung.
      if (/^\.app-shell$/.test(sel)) continue;
      if (!DISPLAYROLLE_ERLAUBT.has(sel)) treffer.push(`${datei}: ${sel}`);
    }
  }
  assert.deepEqual(treffer, [],
    `Displayrolle außerhalb der freigegebenen Stelle:\n  ${treffer.join("\n  ")}`);
  // D1/D3 (2026-11-13): die Displayrolle ist Instrument Sans, Cormorant kommt in keinem Stylesheet mehr vor.
  assert.match(tok("ce-font-display"), /^'Instrument Sans'/);
  for (const [datei, text] of Object.entries(css)) {
    assert.doesNotMatch(text, /Cormorant/, `${datei}: Cormorant ist entfernt`);
  }
  assert.doesNotMatch(stripComments(read("./fonts.css")), /Cormorant|DM Sans/, "fonts.css lädt eine entfernte Familie");
});

test("7 — das Adminportal ist vollständig Sans", () => {
  const admin = css["admin.css"];
  assert.doesNotMatch(admin, /Cormorant|--ce-font-display|var\(--fd\)/,
    "im Adminbereich gibt es keine Serifen-Titel");
  // Redesign 2026-10: Kunden- und Adminbereich teilen EINEN Seitentitel —
  // .ce-page-header-title auf der Page-Title-Stufe. Seit D4 (Betreiberentscheidung
  // 2026-11-13) 34/40, mobil 28/34; Gewicht 700 (Richtwert des Auftrags vom
  // 2026-11-13 für große Titel 750–800, soweit die Schrift es trägt — die Datei
  // endet bei 700). Die Adminvariante ändert nur den Rahmen, keine Schriftrolle.
  const muster = css["patterns.css"];
  const titel = muster.match(/\.ce-page-header-title \{([^}]*)\}/)[1];
  assert.match(titel, /font-family:\s*var\(--ce-font-sans\)/);
  assert.match(titel, /font-size:\s*var\(--ce-text-title-page-size\)/);
  assert.equal(tok("ce-text-title-page-size"), "34px");
  assert.equal(tok("ce-text-title-page-size-mobile"), "28px");
  assert.equal(tok("ce-text-title-page-weight"), "700");
  assert.match(muster, /\.ce-page-header-title \{\s*font-size: var\(--ce-text-title-page-size-mobile\);/,
    "mobil 28px");
  assert.doesNotMatch(muster, /\.ce-page-header--admin \.ce-page-header-title \{[^}]*font-(family|size)/,
    "der Admintitel trägt keine eigene Schriftrolle");
  assert.doesNotMatch(admin, /\.adm-title[\s{]/, "die abgelöste Eigenregel .adm-title ist noch da");
  // Filterbeschriftungen liegen auf der Label-Stufe (seit D4 14/20, 550).
  assert.match(admin, /\.adm-filter-field label \{[^}]*font-size:\s*var\(--ce-text-label-size\)/);
});

/* ══════════ 8/9 — Textfarben ═════════════════════════════════════════════ */

// Alias-Tokens aus Phase 1, die auf eine Foundation-Textrolle auflösen.
const FARB_ALIASE = new Set(["navy", "text-primary", "text-secondary", "text-tertiary", "white"]);

test("8 — die Legacy-Graustufen tragen keine Textrolle mehr", () => {
  const treffer = [];
  for (const [datei, text] of Object.entries(css)) {
    for (const m of text.matchAll(/color:\s*var\(--(gray\d00)\)/g)) {
      treffer.push(`${datei}:${text.slice(0, m.index).split("\n").length} --${m[1]}`);
    }
  }
  assert.deepEqual(treffer, [], `Graustufen als Textfarbe:\n  ${treffer.join("\n  ")}`);
  // --gray400 (#94a3b8) misst 2,4:1 auf Weiß und war die Hauptquelle unlesbarer
  // Metatexte. Der Nachfolger erfüllt AA. Seit der Betreiberentscheidung vom
  // 2026-11-13 stehen die drei Nebenrollen in der Navy-Familie und deutlich
  // dunkler: Nebentext mindestens 9:1, gedämpft mindestens 7:1, Platzhalter
  // mindestens 4,5:1 auf Weiß.
  assert.equal(tok("ce-color-text-muted"), "#4a5672");
  assert.equal(tok("ce-color-text-secondary"), "#3a4662");
  assert.equal(tok("ce-color-text-placeholder"), "#5a6681");
  assert.ok(kontrast(tok("ce-color-text-secondary"), "#ffffff") >= 9, "Nebentext auf Weiß mindestens 9:1");
  assert.ok(kontrast(tok("ce-color-text-muted"), "#ffffff") >= 7, "gedämpfter Text auf Weiß mindestens 7:1");
  assert.ok(kontrast(tok("ce-color-text-placeholder"), "#ffffff") >= 4.5, "Platzhalter auf Weiß mindestens 4,5:1");
  assert.ok(kontrast(tok("ce-color-text-muted"), "#ffffff") >= 4.5,
    "Muted-Text muss auf Weiß mindestens 4,5:1 erreichen");
  assert.ok(kontrast(tok("ce-color-text-secondary"), "#ffffff") >= 4.5);
  assert.ok(kontrast(tok("ce-color-text-primary"), "#ffffff") >= 4.5);
  // Auch gegen den warmen Rampenkopf der App-Fläche (Ivory).
  for (const rolle of ["ce-color-text-primary", "ce-color-text-secondary", "ce-color-text-muted"]) {
    assert.ok(kontrast(tok(rolle), tok("ce-color-bg-canvas-top")) >= 4.5,
      `--${rolle} unterschreitet auf der Ivory-Fläche 4,5:1`);
  }
});

test("9 — Textfarben kommen aus den Foundation-Rollen, nicht aus Literalen", () => {
  // Die Auth-Welt hat ihr eigenes, isoliertes --auth-*-System (dunkles Theme).
  const AUSNAHME = new Set(["auth.css", "email-change.css"]);
  const treffer = [];
  for (const [datei, text] of Object.entries(css)) {
    if (AUSNAHME.has(datei)) continue;
    for (const m of text.matchAll(/(?:^|[{;])\s*color:\s*([^;]+);/g)) {
      const wert = m[1].trim();
      const zeile = text.slice(0, m.index).split("\n").length;
      if (/^var\(--ce-color-/.test(wert)) continue;
      if (/^var\(--(\w[\w-]*)/.test(wert)) {
        const name = wert.match(/^var\(--([\w-]+)/)[1];
        // Bereichseigene Rollen (Sidebar, KPI, Bento, Netz …) sind eigene,
        // getestete Familien und bleiben zulässig.
        if (name.startsWith("ce-") || FARB_ALIASE.has(name) || /^(mc|kc|inv-|adm-|auth-)/.test(name)) continue;
        if (["accent-blue", "blue", "blue2", "blue3", "accent", "success", "warn", "danger"].includes(name)) continue;
        treffer.push(`${datei}:${zeile} ${wert}`);
        continue;
      }
      // Erlaubt bleiben nur currentColor, inherit und Weiß auf dunklem Grund.
      if (/^(currentColor|inherit|#fff|#ffffff|white)$/i.test(wert)) continue;
      // Weiß mit Deckkraft auf dunklen Flächen (Drawer, Angebots-Hero).
      if (/^rgba\(255,\s*255,\s*255,/.test(wert)) continue;
      // Das violette Angebots-Badge trug hier zuvor seinen gemessenen Wert
      // als Literal (Marken-Violettton fiele unter AA) — mit Paket B als
      // --ce-color-brand-violet-ink in die Foundation gehoben, keine
      // Ausnahme mehr nötig.
      treffer.push(`${datei}:${zeile} ${wert}`);
    }
  }
  assert.deepEqual(treffer, [], `Textfarben außerhalb der Tokens:\n  ${treffer.join("\n  ")}`);
});

/* ══════════ 10/11 — Zahlen ═══════════════════════════════════════════════ */

test("10 — Zahlenspalten in Tabellen sind rechtsbündig", () => {
  // Zwei Mechaniken, beide getestet: eine Marker-Klasse (.ce-num/.adm-num) und
  // — wo die Tabelle bewusst ohne Marker auskommt — nth-child.
  assert.match(css["primitives.css"], /\.ce-num \{[^}]*text-align:\s*right/);
  assert.match(css["admin.css"], /\.adm-num \{[^}]*text-align:\s*right/);
  assert.match(css["dashboard.css"],
    /\.inv-table th:nth-child\(3\), \.inv-table td:nth-child\(3\) \{ text-align: right; \}/,
    "die Betragsspalte der Kundenrechnungen fehlt");

  // Die Geldspalten der Haupttabellen tragen den Marker auf Kopf UND Zelle. Sendungen (Audit B.4, Komplettabschluss
  // 2026-10-27): Sendung · Empfänger · Versand (Carrier, Dienst und Gewicht) · Status · Preis · Aktionen — das
  // Gewicht steht in der Versandzelle, die einzige Zahlenspalte ist der Preis.
  const sendungen = read("../components/dashboard/ShipmentsList.jsx");
  assert.match(sendungen, /<th scope="col">Status<\/th>\s*<th[^>]*className="ce-num"[^>]*>Preis<\/th>/,
    "Preis muss als Zahlenspalte markiert sein");
  assert.doesNotMatch(sendungen, /<th[^>]*>Gewicht<\/th>/, "das Gewicht steht in der Versandzelle");
  assert.equal((sendungen.match(/<td className="[^"]*ce-num"/g) || []).length, 1,
    "genau die Preiszelle trägt den Marker");

  const admShip = read("../pages/admin/AdminShipmentsPage.jsx");
  assert.match(admShip, /<th scope="col" className="adm-num">Preis<\/th>/);
  assert.match(admShip, /<td className="adm-num">/);

  const admInv = read("../pages/admin/AdminInvoicesPage.jsx");
  assert.match(admInv, /<th scope="col" className="adm-num">Betrag/);
  assert.match(admInv, /<td className="adm-num"><AmountCell/);
});

test("11 — Zahlen laufen tabellarisch und in Instrument Sans", () => {
  // Jede tabular-nums-Deklaration trägt zusätzlich das Feature-Tag.
  const treffer = [];
  for (const [datei, text] of Object.entries(css)) {
    for (const m of text.matchAll(/font-variant-numeric:\s*tabular-nums;/g)) {
      const rest = text.slice(m.index, m.index + 120);
      if (!/font-feature-settings:\s*"tnum"/.test(rest)) {
        treffer.push(`${datei}:${text.slice(0, m.index).split("\n").length}`);
      }
    }
  }
  assert.deepEqual(treffer, [], `tabular-nums ohne "tnum": ${treffer.join(", ")}`);
  // Der Zahlentoken zeigt seit D1 (2026-11-13) auf Instrument Sans — dieselbe Datei wie die
  // Textschrift —, nie auf eine Serifenschrift.
  assert.match(tok("ce-font-numeric"), /^'Instrument Sans'/);
  assert.doesNotMatch(tok("ce-font-numeric"), /Cormorant|Georgia|Times|\bserif\b(?<!sans-serif)/,
    "Zahlen laufen nie in einer Serifenschrift");
  // Der KPI-Wert steht exakt auf der Numeric-Display-Stufe (Redesign 2026-10:
  // 32/38 600, mobil 28 — das kompakte Kennzahlband).
  const wert = css["overview.css"].match(/\.ov-kpi-value \{([^}]*)\}/)[1];
  assert.match(wert, /font-size:\s*var\(--ce-text-numeric-display-size\)/);
  assert.match(wert, /font-weight:\s*var\(--ce-text-numeric-display-weight\)/);
  assert.match(wert, /font-variant-numeric:\s*tabular-nums/);
  assert.equal(tok("ce-text-numeric-display-size"), "32px");
  assert.equal(tok("ce-text-numeric-display-weight"), "600");
  assert.match(css["overview.css"], /\.ov-kpi-value \{ font-size: var\(--ce-text-numeric-display-size-mobile\); \}/,
    "Numeric Display mobil");
});

/* ══════════ 12 — keine Layout- oder Routingänderung ══════════════════════ */

test("12 — Phase 2.5 fasst nur Typografie an", () => {
  // Die Skala definiert keine Abstände, Radien, Tiefen oder Ebenen um.
  for (const [datei, text] of Object.entries(css)) {
    const fremd = [...text.matchAll(/--(ce-(?:space|radius|elevation|z|bp|size|color)-[\w-]+):/g)]
      .map((m) => m[1]);
    assert.deepEqual(fremd, [], `${datei} darf keine Foundation-Tokens umdefinieren: ${fremd.join(", ")}`);
  }
  // Keine neue Abhängigkeit, kein verändertes Lockfile-Profil.
  const pkg = JSON.parse(read("../../package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(),
    ["@vitejs/plugin-react", "fflate", "maplibre-gl", "react", "react-dom", "react-router-dom", "read-excel-file", "saxen", "vite"]);
  assert.deepEqual(Object.keys(pkg.devDependencies), ["playwright"]);
  // Keine Routendefinition angefasst.
  const app = read("../App.jsx");
  // Momentaufnahme. Eine Routenänderung ist in dieser Phase ausgeschlossen und
  // muss hier bewusst nachgezogen werden — zuletzt +2 für die beiden
  // Detailseiten des Lagermoduls (/inventory/products/:id, /inventory/orders/:id).
  // Sie sind echte Routen, weil eine Entitäts-ID nicht in einen page-String
  // gehört; die fünf LISTENbereiche des Moduls bleiben page-State.
  //
  // GEMESSEN WIRD DIE ROUTENOBERFLÄCHE, nicht die Zahl der <Route>-Knoten.
  // Der frühere Zähler über alle <Route> vermischte zwei verschiedene Dinge:
  // eine ansteuerbare URL und eine pfadlose Layoutroute, die gar keine URL
  // hinzufügt (React-Router-Muster für einen gemeinsamen Rahmen — so hängen
  // DashboardLayout, NavbarLayout, AdminLayout und die Fehlergrenze des
  // Auth-Bereichs an ihren Kindern). Beide Zahlen stehen deshalb einzeln:
  // eine neue erreichbare Seite fällt weiterhin sofort auf, ein zusätzlicher
  // Rahmen ohne eigene Adresse ebenfalls — nur eben als das, was er ist.
  const mitPfad = (app.match(/<Route [^>]*\bpath=/g) || []).length;
  const indexRt = (app.match(/<Route index\b/g) || []).length;
  const pfadlos = (app.match(/<Route /g) || []).length - mitPfad - indexRt;
  // Package C (dokumentierte Ankeränderung): +2 für die Buchungsklärung
  // (/admin/reconciliation und /admin/reconciliation/:attemptId).
  // Vertriebspartnerprogramm (dokumentierte Ankeränderung): +7 —
  // /partner-registrieren, /registrieren (Alias), /partner sowie
  // /admin/partners, /admin/partners/settings, /admin/partners/dispatch-evidence
  // und /admin/partners/:id. Keine neue Layoutroute: das Partnerportal bringt
  // seine Hülle in der Seite mit, die übrigen hängen an bestehenden Rahmen.
  // Vertriebspartnervereinbarung (dokumentierte Ankeränderung): +1 —
  // /partnervereinbarung, eine öffentliche Leseseite am bestehenden Rahmen
  // der Rechtsseiten (NavbarLayout); keine neue Layoutroute.
  // Abrechnungslauf (dokumentierte Ankeränderung): +1 —
  // /admin/partners/credit-notes am bestehenden Adminrahmen.
  // Pre-Live-Testmodus (dokumentierte Ankeränderung): +1 —
  // /admin/partners/prelive am bestehenden Adminrahmen.
  // Neue Admin-Lesevorschau der G1–G9-Dokumente: +1 ansteuerbare Route.
  // Geschützte Seitenvorschau der Rechtstexte (/vorschau/rechtstexte/:seite,
  // dokumentierte Ankeränderung): +1 im öffentlichen Rahmen hinter AdminRoute.
  // Öffentlicher Preisrechner (dokumentierte Ankeränderung): +2 — die Übernahmeseite
  // /preisrechner-uebernahme im öffentlichen Rahmen und /admin/public-calculator am Adminrahmen.
  // Manuell erstellte Rechnungen (Auftrag 2 / P1, dokumentierte Ankeränderung): +1 —
  // /admin/invoices/manual/:draftId am bestehenden Adminrahmen; keine neue Layoutroute.
  // Öffentliche Kundenbereich-Demo (Betreiberentscheidung 2026-10-27, dokumentierte Ankeränderung): +1 — /demo/* lädt
  // die Seite neu; die Demo selbst läuft in einer eigenen Seitenladung mit eigenem Router (src/demo/DemoApp.jsx).
  // Sammelrechnungsanträge (P5, Betreiberentscheidung 2026-11-04, dokumentierte Ankeränderung): +1 —
  // /admin/billing-mode-requests am bestehenden Adminrahmen, nur über Übersichtskachel und „Zu erledigen“ erreichbar.
  // Admin-Anmeldung (Canonical v2.130, dokumentierte Ankeränderung): +1 — /admin/login im Auth-Bereich, außerhalb von
  // AdminRoute und AdminLayout; keine neue Layoutroute.
  assert.equal(mitPfad + indexRt, 49,
    "49 Routen einschliesslich der Admin-Rechtstextvorschau, der Seitenvorschau, des öffentlichen Preisrechners, des Rechnungseditors, der Demo, der Sammelrechnungsanträge und der Admin-Anmeldung");
  assert.equal(pfadlos, 4,
    "die Zahl der pfadlosen Layoutrouten ist unverändert (4: Dashboard, öffentlich, Admin, Auth)");
});

/* ══════════ 13 — bestehende Governance ═══════════════════════════════════ */

test("13 — die Governance aus Phase 1 und 2 bleibt registriert", () => {
  const pkg = JSON.parse(read("../../package.json"));
  for (const t of [
    "src/styles/designTokens.test.mjs",           // Phase 1
    "src/styles/interfacePrimitives.test.mjs",    // Phase 2
    "src/styles/numericFontAudit.test.mjs",
    "src/components/layout/appShellChrome.test.mjs",
    "src/components/dashboard/overviewKpiCards.test.mjs",
    "src/styles/typography.test.mjs",             // diese Phase
  ]) {
    assert.ok(pruefeImTestlauf(t), `${t} muss im Testlauf bleiben`);
  }
  // Die Phase-2-Primitives lesen weiterhin die Typografietokens — Feldlabels
  // die Label-Rolle, Badges (Redesign 2026-10) die eigene Badge-Rolle.
  assert.match(css["forms.css"], /font-size:\s*var\(--ce-text-label-size\)/);
  assert.match(css["primitives.css"], /font-size:\s*var\(--ce-text-badge-size\)/);
});

/* ── Hilfsmittel ──────────────────────────────────────────────────────────── */

function quelldateien(dir = SRC) {
  const out = [];
  for (const eintrag of readdirSync(dir)) {
    const pfad = new URL(`${eintrag}${eintrag.includes(".") ? "" : "/"}`, dir);
    if (statSync(pfad).isDirectory()) { out.push(...quelldateien(pfad)); continue; }
    if (/\.jsx?$/.test(eintrag) && !eintrag.endsWith(".test.mjs")) out.push(pfad);
  }
  return out;
}
const kurz = (pfad) => pfad.pathname.split("/src/")[1];

function luminanz(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function kontrast(a, b) {
  const [la, lb] = [luminanz(a), luminanz(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}
