// Governance für Paket A, Phase 2.5 — systemweite Typografie und Textfarben.
//
// Geprüft wird, dass die gesamte Oberfläche aus EINER Skala kommt: die elf
// Typografiestufen der Foundation, drei Schriftrollen (davon eine im Auslauf),
// höchstens Gewicht 600, Textfarben ausschließlich aus den Foundation-Rollen
// und präzise, rechtsbündige Zahlen.
//
// Bewusst NICHT geprüft: Abstände, Layout, Kartenmaterial, Radien, Schatten —
// die gehören zu Phase 1/2 und haben dort ihre eigene Governance.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

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

// Alle font-size-Vorkommen als { datei, zeile, wert, media }.
function alleGroessen() {
  const out = [];
  for (const [datei, text] of Object.entries(css)) {
    const bereiche = medienbereiche(text);
    for (const m of text.matchAll(/font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g)) {
      out.push({
        datei,
        zeile: text.slice(0, m.index).split("\n").length,
        wert: parseFloat(m[1]),
        media: bereiche.some(([a, b]) => a <= m.index && m.index <= b),
      });
    }
  }
  return out;
}
const GROESSEN = alleGroessen();

// Die zulässigen Stufen sind exakt die Werte der --ce-text-*-size(-mobile)-Tokens.
const SKALA = new Set(
  [...variables.matchAll(/--ce-text-[\w-]+-size(?:-mobile)?:\s*(\d+)px/g)].map((m) => Number(m[1])),
);

/* ══════════ 1 — keine Halb-Pixel ═════════════════════════════════════════ */

test("1 — es gibt keine Halb-Pixel-Schriftgrößen mehr", () => {
  const treffer = GROESSEN.filter((g) => !Number.isInteger(g.wert))
    .map((g) => `${g.datei}:${g.zeile} (${g.wert}px)`);
  assert.deepEqual(treffer, [], `Halb-Pixel-Größen:\n  ${treffer.join("\n  ")}`);
  // Auch die Skala selbst enthält keine.
  for (const [, v] of variables.matchAll(/--ce-text-[\w-]+-size(?:-mobile)?:\s*([^;]+);/g)) {
    assert.match(v.trim(), /^\d+px$/, `Skalenwert ist keine ganze Pixelzahl: ${v}`);
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

test("2 — keine Schriftgröße unter 11 px", () => {
  const treffer = GROESSEN.filter((g) => g.wert < 11)
    .map((g) => `${g.datei}:${g.zeile} (${g.wert}px)`);
  assert.deepEqual(treffer, [], `zu kleine Schrift:\n  ${treffer.join("\n  ")}`);
  assert.equal(tok("ce-text-micro-size"), "11px", "die kleinste Stufe ist Micro (11px)");

  const jsx = [];
  for (const pfad of quelldateien()) {
    const inhalt = readFileSync(pfad, "utf8");
    for (const m of inhalt.matchAll(/fontSize:\s*(\d+)(?![\d.])/g)) {
      if (Number(m[1]) < 11) jsx.push(`${kurz(pfad)}: ${m[1]}px`);
    }
  }
  assert.deepEqual(jsx, [], `zu kleine Inline-Größen: ${jsx.join(", ")}`);
});

/* ══════════ 3 — nur definierte Stufen ════════════════════════════════════ */

test("3 — jede Schriftgröße liegt auf einer definierten Stufe der Skala", () => {
  // Die Skala kennt Desktop- und Mobilwerte; beide sind zulässige Stufen.
  // Zusätzlich erlaubt: 40px — der Mobilwert der Numeric-Display-Stufe.
  const erlaubt = new Set([...SKALA]);
  const treffer = GROESSEN.filter((g) => !erlaubt.has(g.wert))
    .map((g) => `${g.datei}:${g.zeile} (${g.wert}px)`);
  assert.deepEqual(treffer, [], `Größen außerhalb der Skala:\n  ${treffer.join("\n  ")}`);
  // Die Skala selbst ist vollständig und trägt die vorgegebenen Werte.
  for (const [stufe, desktop, mobil] of [
    ["display-xl", "52px", "38px"], ["display-l", "36px", "28px"],
    ["title-page", "24px", "20px"], ["title-section", "20px", "18px"],
    ["title-card", "16px", "16px"], ["body-l", "15px", "15px"],
    ["body", "14px", "14px"], ["body-s", "13px", "13px"],
    ["label", "12px", "12px"], ["micro", "11px", "11px"],
    ["numeric-display", "48px", "40px"],
  ]) {
    assert.equal(tok(`ce-text-${stufe}-size`), desktop, `--ce-text-${stufe}-size`);
    assert.equal(tok(`ce-text-${stufe}-size-mobile`), mobil, `--ce-text-${stufe}-size-mobile`);
  }
});

/* ══════════ 4 — Gewicht ══════════════════════════════════════════════════ */

test("4 — kein font-weight über 600 außerhalb der @font-face-Deklarationen", () => {
  const treffer = [];
  for (const [datei, text] of Object.entries(css)) {
    for (const m of text.matchAll(/font-weight:\s*(\d+|bold|bolder)/g)) {
      const wert = m[1] === "bold" || m[1] === "bolder" ? 700 : Number(m[1]);
      if (wert > 600) treffer.push(`${datei}:${text.slice(0, m.index).split("\n").length} (${m[1]})`);
    }
  }
  assert.deepEqual(treffer, [], `zu fette Schrift:\n  ${treffer.join("\n  ")}`);

  // Inline-Styles und SVG-Attribute im JSX.
  const jsx = [];
  for (const pfad of quelldateien()) {
    const inhalt = readFileSync(pfad, "utf8");
    for (const m of inhalt.matchAll(/fontWeight[:=]\s*"?(\d+)"?/g)) {
      if (Number(m[1]) > 600) jsx.push(`${kurz(pfad)}: ${m[1]}`);
    }
  }
  assert.deepEqual(jsx, [], `zu fette Inline-Gewichte: ${jsx.join(", ")}`);

  // Die Skala selbst bleibt bei höchstens 600.
  for (const m of variables.matchAll(/--ce-text-[\w-]+-weight:\s*(\d+)/g)) {
    assert.ok(Number(m[1]) <= 600, `Skalengewicht ${m[1]} überschreitet 600`);
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
  // Die Fontdateien bleiben in dieser Phase bewusst erhalten.
  assert.match(read("./fonts.css"), /librefranklin-700\.woff2/,
    "die Fontdateien werden erst in einer späteren Phase entfernt");
  // Die dritte Schriftrolle --fh ist aufgelöst.
  for (const [datei, text] of Object.entries(css)) {
    assert.doesNotMatch(text, /var\(--fh\)/, `${datei}: --fh ist entfallen`);
  }
});

/* ══════════ 6/7 — Cormorant nur im Kundendisplay ═════════════════════════ */

const CORMORANT_ERLAUBT = new Set([
  // Seit Paket A, Phase 3 gibt es genau EINEN Kundenseitentitel — die früheren
  // Eigenköpfe von Adressbuch, Entwürfen und Dashboard-Unterseiten sind auf das
  // gemeinsame PageHeader-Muster zusammengeführt.
  ".ce-page-header-title",
  ".pp-h1",                // Begrüßung der Übersicht
  ".auth-hero-title",      // Auth-Hero (eigene Welt)
  ".auth-title",
]);

function cormorantSelektoren(text) {
  const out = [];
  for (const m of text.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const body = m[2];
    if (!/font-family:[^;]*(--ce-font-display|--fd|Cormorant)/.test(body)) continue;
    for (const sel of m[1].split(",")) out.push(sel.replace(/\s+/g, " ").trim());
  }
  return out;
}

test("6 — Cormorant steht nur an den freigegebenen Display-Stellen", () => {
  const treffer = [];
  for (const [datei, text] of Object.entries(css)) {
    for (const sel of cormorantSelektoren(text)) {
      // Die Rollendefinition selbst (--fd: …) ist keine Verwendung.
      if (/^\.app-shell$/.test(sel)) continue;
      if (!CORMORANT_ERLAUBT.has(sel)) treffer.push(`${datei}: ${sel}`);
    }
  }
  assert.deepEqual(treffer, [],
    `Cormorant außerhalb der Display-Momente:\n  ${treffer.join("\n  ")}`);
  assert.match(tok("ce-font-display"), /Cormorant Garamond/);
});

test("7 — das Adminportal ist vollständig Sans", () => {
  const admin = css["admin.css"];
  assert.doesNotMatch(admin, /Cormorant|--ce-font-display|var\(--fd\)/,
    "im Adminbereich gibt es keine Serifen-Titel");
  // Der Adminseitentitel liegt auf der Page-Title-Stufe (24/20), nicht auf
  // Display. Seit Paket E kommt er aus dem gemeinsamen Seitenkopf
  // (.ce-page-header--admin, patterns.css) — die frühere Eigenregel .adm-title
  // ist mit ihrem letzten Aufrufer entfallen.
  const muster = css["patterns.css"];
  const titel = muster.match(/\.ce-page-header--admin \.ce-page-header-title \{([^}]*)\}/)[1];
  assert.match(titel, /font-family:\s*var\(--ce-font-sans\)/);
  assert.match(titel, /font-size:\s*var\(--ce-text-title-page-size\)/);
  assert.equal(tok("ce-text-title-page-size"), "24px");
  assert.equal(tok("ce-text-title-page-size-mobile"), "20px");
  assert.equal(tok("ce-text-title-page-weight"), "600");
  assert.match(muster, /\.ce-page-header--admin \.ce-page-header-title \{ font-size: var\(--ce-text-title-page-size-mobile\); \}/,
    "mobil 20px");
  assert.doesNotMatch(admin, /\.adm-title[\s{]/, "die abgelöste Eigenregel .adm-title ist noch da");
  // Admin-Tabellen und -Filter bleiben auf der dichten Stufe.
  assert.match(admin, /\.adm-filter-field label \{[^}]*font-size:\s*11px/);
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
  // Metatexte. Der Nachfolger erfüllt AA.
  assert.equal(tok("ce-color-text-muted"), "#667284");
  assert.ok(kontrast(tok("ce-color-text-muted"), "#ffffff") >= 4.5,
    "Muted-Text muss auf Weiß mindestens 4,5:1 erreichen");
  assert.ok(kontrast(tok("ce-color-text-secondary"), "#ffffff") >= 4.5);
  assert.ok(kontrast(tok("ce-color-text-primary"), "#ffffff") >= 4.5);
  // Auch gegen den warmen Rampenkopf der App-Fläche.
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

  // Die Geldspalten der Haupttabellen tragen den Marker auf Kopf UND Zelle.
  const sendungen = read("../components/dashboard/ShipmentsList.jsx");
  assert.match(sendungen, /<th className="ce-num">Gewicht<\/th><th className="ce-num">Preis<\/th>/,
    "Gewicht/Preis müssen als Zahlenspalten markiert sein");
  assert.equal((sendungen.match(/<td className="[^"]*ce-num"/g) || []).length, 2,
    "genau die beiden Zahlenzellen tragen den Marker");

  const admShip = read("../pages/admin/AdminShipmentsPage.jsx");
  assert.match(admShip, /<th scope="col" className="adm-num">Preis<\/th>/);
  assert.match(admShip, /<td className="adm-num">/);

  const admInv = read("../pages/admin/AdminInvoicesPage.jsx");
  assert.match(admInv, /<th scope="col" className="adm-num">Betrag/);
  assert.match(admInv, /<td className="adm-num"><AmountCell/);
});

test("11 — Zahlen laufen tabellarisch und in DM Sans", () => {
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
  // Der Zahlentoken zeigt auf DM Sans, nicht auf eine Serifenschrift.
  assert.match(tok("ce-font-numeric"), /DM Sans/);
  assert.doesNotMatch(tok("ce-font-numeric"), /Cormorant|Georgia|Times|\bserif\b(?<!sans-serif)/,
    "Zahlen laufen nie in einer Serifenschrift");
  // Der KPI-Wert steht exakt auf der Numeric-Display-Stufe.
  const knum = css["overview.css"].match(/\.knum \{([^}]*)\}/)[1];
  assert.match(knum, /font-size:\s*48px/);
  assert.match(knum, /font-weight:\s*600/);
  assert.match(knum, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css["overview.css"], /\.knum \{ font-size: 40px; \}/, "Numeric Display mobil");
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
    ["@vitejs/plugin-react", "lucide-react", "react", "react-dom", "react-router-dom", "vite"]);
  assert.deepEqual(Object.keys(pkg.devDependencies), ["playwright"]);
  // Keine Routendefinition angefasst.
  const app = read("../App.jsx");
  // Momentaufnahme: 29 Routen. Eine Routenänderung ist in dieser Phase
  // ausgeschlossen und müsste hier bewusst nachgezogen werden.
  assert.equal((app.match(/<Route /g) || []).length, 29, "die Routenzahl ist unverändert");
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
    assert.ok(pkg.scripts.test.includes(t), `${t} muss im Testlauf bleiben`);
  }
  // Die Phase-2-Primitives lesen weiterhin die Typografietokens.
  assert.match(css["forms.css"], /font-size:\s*var\(--ce-text-label-size\)/);
  assert.match(css["primitives.css"], /font-size:\s*var\(--ce-text-label-size\)/);
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
