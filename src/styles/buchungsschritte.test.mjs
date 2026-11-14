// Buchungsschritte — Premium-Card-Stepper (Variante C, Betreiberentscheidung 2026-11-14): Stylesheet, Tokens, Markup.
// Der Browsertest tests/e2e/buchungsschritte.test.mjs misst dazu die gerenderte Leiste (Zustände, Fokus, Höhen,
// Farbton der aktiven Karte, Sendungsverfolgung unverändert).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const css = ohneKommentare(read("./buchungsschritte.css"));
const variables = ohneKommentare(read("./variables.css"));
const seite = read("../pages/BookingPage.jsx");

/** Regeln mit ihrem umschließenden @-Block: { sel, koerper, kontext }. */
function regeln(text) {
  const aus = [];
  const kontext = [];
  let kopf = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      const k = kopf.trim().replace(/\s+/g, " ");
      kopf = "";
      if (k.startsWith("@")) { kontext.push(k); continue; }
      const ende = text.indexOf("}", i);
      aus.push({ sel: k, koerper: text.slice(i + 1, ende), kontext: kontext.join(" ") });
      i = ende;
    } else if (c === "}") { kontext.pop(); kopf = ""; } else kopf += c;
  }
  return aus;
}
const REGELN = regeln(css);
const block = (kopf) => REGELN.filter((r) => r.kontext === kopf);

/** Erste Definition eines Tokens in variables.css (Grundblock). */
const token = (name) => variables.match(new RegExp(String.raw`(?<![\w-])${name}:\s*([^;]+);`))?.[1].trim();
function aufloesen(wert, tiefe = 0) {
  return wert.replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g, (_, name, rueckfall) => {
    const w = token(name);
    if (w !== undefined && tiefe < 8) return aufloesen(w, tiefe + 1);
    return rueckfall ?? "";
  });
}
const hexZuRgb = (h) => {
  const x = h.length === 4 ? [...h.slice(1)].map((c) => c + c).join("") : h.slice(1, 7);
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
};
function farben(wert) {
  return [
    ...[...wert.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map((m) => hexZuRgb(m[0])),
    ...[...wert.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)].map((m) => [+m[1], +m[2], +m[3]]),
    ...(/(?<![\w-])white\b/.test(wert) ? [[255, 255, 255]] : []),
  ];
}
// Blau: Blau ist der größte Kanal und Rot ≤ Grün — Farbton zwischen 180° und 240°, nie Richtung Violett. Weiß erlaubt.
const blau = ([r, g, b]) => (r === 255 && g === 255 && b === 255) || (b >= r && b >= g && r <= g);
function luminanz([r, g, b]) {
  const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const kontrast = (a, b) => { const [x, y] = [luminanz(a), luminanz(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const farbeAus = (name, welche = 0) => { const f = farben(aufloesen(`var(${name})`)); return welche < 0 ? f[f.length + welche] : f[welche]; };

test("1 — der aktive Schritt steht nur in Blautönen: jede Farbe seiner Regeln und Tokens, kein Violett", () => {
  const aktiv = REGELN.filter((r) => !r.kontext.includes("forced-colors")
    && (r.sel.includes(".bk-schritt--aktiv") || /(^|,\s*)\.bk-karte::before(\s*,|$)/.test(r.sel)));
  assert.ok(aktiv.length >= 8, `zu wenige Regeln des aktiven Schritts gefunden (${aktiv.length})`);
  const fremd = [];
  let gezaehlt = 0;
  for (const r of aktiv) {
    for (const rgb of farben(aufloesen(r.koerper))) {
      gezaehlt++;
      if (!blau(rgb)) fremd.push(`${r.kontext} ${r.sel}: rgb(${rgb.join(",")})`);
    }
  }
  assert.ok(gezaehlt >= 20, `zu wenige Farben aufgelöst (${gezaehlt}) — die Prüfung liefe ins Leere`);
  assert.deepEqual(fremd, [], "Nicht-Blau im aktiven Schritt");
  // Die Tokens des aktiven Schritts selbst, auch wo keine Regel sie (noch) liest.
  const aktivTokens = [...variables.matchAll(/(--ce-bk-aktiv-[\w-]+):\s*([^;]+);/g)];
  assert.ok(aktivTokens.length >= 9, "die Tokens des aktiven Schritts fehlen");
  for (const [, name, wert] of aktivTokens) {
    const f = /^\d+,\s*\d+,\s*\d+$/.test(wert.trim()) ? [wert.split(",").map(Number)] : farben(aufloesen(wert));
    for (const rgb of f) assert.ok(blau(rgb), `${name}: rgb(${rgb.join(",")}) ist kein Blauton`);
  }
  const bkTokens = [...variables.matchAll(/--ce-bk-[\w-]+:\s*[^;]+;/g)].map((m) => m[0]).join("\n");
  assert.doesNotMatch(css + bkTokens, /purple|violet|magenta|fuchsia|orchid|plum/i);
});

test("2 — die Sendungsverfolgung bleibt unberührt: nur .booking-wrap > .steps-bar und .bk-*", () => {
  assert.doesNotMatch(css, /\.(step-item|step-wrap|step-circle|step-label|step-line|tracking-steps)\b/);
  for (const r of REGELN) {
    if (r.kontext.startsWith("@keyframes")) continue;
    for (const s of r.sel.split(",").map((x) => x.trim())) {
      assert.match(s, /^(\.booking-wrap > \.steps-bar|\.bk-)/, `Regel außerhalb der Buchungsleiste: ${s}`);
    }
  }
  // Die buchungseigenen Regeln für die alte Leiste sind ersatzlos entfallen.
  for (const datei of readdirSync(new URL("./", import.meta.url)).filter((f) => f.endsWith(".css"))) {
    assert.doesNotMatch(ohneKommentare(read(`./${datei}`)), /\.booking-wrap \.steps-bar \.step-/, `${datei}: alte Buchungsleiste`);
  }
  // Eingebunden einmal im Hauptbündel, vor der Musterebene; der Preisrechner lädt sie nicht.
  const importe = [...ohneKommentare(read("./index.css")).matchAll(/@import '\.\/([\w-]+\.css)';/g)].map((m) => m[1]);
  assert.equal(importe.filter((f) => f === "buchungsschritte.css").length, 1);
  assert.ok(importe.indexOf("buchungsschritte.css") < importe.indexOf("patterns.css"), "steht nach der Musterebene");
  assert.doesNotMatch(read("./public-calculator.css"), /buchungsschritte/);
});

test("3 — Bewegung: ein einmaliger Lichtlauf nur mit transform; aus bei reduzierter Bewegung, Kontrast, erzwungenen Farben, Druck", () => {
  const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)];
  assert.deepEqual(keyframes.map((k) => k[1]), ["bk-licht"]);
  assert.doesNotMatch(keyframes[0][2].replace(/transform:[^;]*;/g, ""), /[a-z-]+\s*:/, "Lichtlauf nur mit transform");
  const animationen = [...css.matchAll(/(?<![\w-])animation:\s*([^;]+);/g)].map((m) => m[1].trim());
  const laeufe = animationen.filter((a) => a !== "none");
  assert.equal(laeufe.length, 1, `genau ein Lauf: ${laeufe.join(" | ")}`);
  assert.match(laeufe[0], /^bk-licht \d+ms cubic-bezier\([^)]*\) \d+ms 1 both$/, "einmalig");
  for (const kopf of ["@media (prefers-reduced-motion: reduce)", "@media (prefers-contrast: more)", "@media (forced-colors: active)", "@media print"]) {
    const b = block(kopf);
    assert.ok(b.length, `${kopf} fehlt`);
    assert.ok(b.some((r) => /animation:\s*none/.test(r.koerper) && /\.bk-schritt--aktiv \.bk-karte::after/.test(r.sel)), `${kopf}: Lichtlauf läuft weiter`);
  }
  assert.ok(block("@media (prefers-reduced-motion: reduce)").some((r) => /transition:\s*none/.test(r.koerper)), "Überblenden bei reduzierter Bewegung");
  // Kein Zeigerzustand: reine Anzeige.
  assert.doesNotMatch(css, /:hover|:focus|:active\b|cursor:/);
});

test("4 — kein farbiger Außenschein: Schatten nur über Navy-Tokens, kein Filter, kein backdrop-filter", () => {
  for (const m of css.matchAll(/(?:box|text)-shadow:\s*([^;]+);/g)) {
    assert.doesNotMatch(m[1], /#[0-9a-f]{3,8}\b|rgba?\(/i, `frei geschriebener Schatten: ${m[1]}`);
  }
  assert.doesNotMatch(css, /backdrop-filter|(?<![\w-])filter:/);
  const schatten = [...variables.matchAll(/(--ce-bk-shadow-[\w-]+):\s*([^;]+);/g)];
  assert.ok(schatten.length >= 6, "Schattentokens fehlen");
  for (const [, name, wert] of schatten) {
    for (const [r, g, b] of farben(aufloesen(wert))) {
      const neutral = Math.max(r, g, b) - Math.min(r, g, b) < 45;
      const navy = b > r && b < 90 && r < 40;
      assert.ok(neutral || navy, `${name}: rgb(${r},${g},${b}) ist weder neutral noch Navy`);
    }
  }
});

test("5 — erzwungene Farben ohne Systemakzent, Texte nur aus Tokens", () => {
  assert.doesNotMatch(css, /\b(Highlight|HighlightText|AccentColor|AccentColorText|SelectedItem)\b/);
  const erzwungen = block("@media (forced-colors: active)");
  assert.ok(erzwungen.some((r) => /border-width:\s*3px/.test(r.koerper) && r.sel === ".bk-schritt--aktiv .bk-karte"), "aktiver Schritt über die Rahmenstärke");
  for (const m of css.matchAll(/(?:^|[{;])\s*color:\s*([^;]+);/g)) {
    assert.match(m[1].trim(), /^(var\(--ce-[\w-]+\)|white|inherit|currentColor)$/, `Textfarbe ohne Token: ${m[1]}`);
  }
});

test("6 — Kontrast der Tokens: aktiver Schritt ≥ 6 : 1 (Titel) bzw. ≥ 4,5 : 1 auf dem hellsten Blau, alle Texte ≥ 4,5 : 1", () => {
  const weiss = [255, 255, 255];
  const elektrisch = farbeAus("--ce-bk-aktiv-elektrisch");
  assert.ok(kontrast(weiss, elektrisch) >= 6, `Titel auf elektrischem Blau ${kontrast(weiss, elektrisch).toFixed(2)}`);
  assert.ok(kontrast(farbeAus("--ce-bk-aktiv-zeile"), elektrisch) >= 4.5, "Unterzeile auf elektrischem Blau");
  assert.ok(kontrast(farbeAus("--ce-bk-aktiv-marke-schrift"), farbeAus("--ce-bk-aktiv-marke-grund", -1)) >= 4.5, "Zahl in der aktiven Marke");
  const offenGrund = farbeAus("--ce-bk-offen-flaeche", -1);
  assert.ok(kontrast(farbeAus("--ce-bk-offen-titel"), offenGrund) >= 4.5, "offener Titel");
  assert.ok(kontrast(farbeAus("--ce-bk-offen-zeile"), offenGrund) >= 4.5, "offene Unterzeile und Zahl");
  const erledigtGrund = farbeAus("--ce-bk-erledigt-flaeche", -1);
  assert.ok(kontrast(farbeAus("--ce-bk-text"), erledigtGrund) >= 4.5, "erledigter Titel");
  assert.ok(kontrast(farbeAus("--ce-bk-text-gedaempft"), erledigtGrund) >= 4.5, "erledigte Unterzeile");
  assert.ok(kontrast(weiss, farbeAus("--ce-bk-erledigt")) >= 4.5, "Haken auf Grün");
  assert.equal(token("--ce-bk-erledigt"), "var(--ce-color-success-solid)", "Grün aus der Statusfamilie");
});

test("7 — Markup: geordnete Liste ohne Bedienelement, aria-current nur am aktiven Schritt, Erfolgsseite ohne Leiste", () => {
  const start = seite.indexOf("{step !== 3 && (");
  const leiste = seite.slice(start, seite.indexOf("</ol>", start) + 5);
  assert.match(leiste, /^\{step !== 3 && \(\s*<div className="steps-bar mb-24">\s*<ol className="bk-schritte" aria-label="Buchungsfortschritt">/);
  assert.doesNotMatch(leiste, /<button|<a\s|onClick|onKey|tabIndex|href=|role="button"/, "die Leiste ist reine Anzeige");
  assert.equal((leiste.match(/aria-current=/g) || []).length, 1);
  assert.match(leiste, /aria-current=\{zustand === "aktiv" \? "step" : undefined\}/);
  assert.match(leiste, /const zustand = i \+ 1 < step \? "erledigt" : i \+ 1 === step \? "aktiv" : "offen";/);
  assert.match(leiste, /aria-hidden=\{zustand === "erledigt" \? "true" : undefined\}>\s*\{zustand === "erledigt" \? <Icon n="check" s=\{18\} \/> : i \+ 1\}/);
  assert.match(leiste, /\{zustand === "erledigt" && <span className="sr-only"> \(abgeschlossen\)<\/span>\}/);
  const schritte = seite.match(/const steps = \[([\s\S]*?)\];/)[1];
  assert.deepEqual([...schritte.matchAll(/\{ titel: "([^"]+)", zeile: "([^"]+)" \}/g)].map((m) => [m[1], m[2]]),
    [["Übersicht", "Daten prüfen"], ["Buchung", "Verbindlich buchen"], ["Fertig", "Bestätigung erhalten"]]);
  assert.doesNotMatch(seite, /step-item|step-circle|step-label|step-line/, "alte Klassen der Leiste in der Buchung");
  assert.match(seite, /import \{ Icon \} from "\.\.\/components\/ui\/Icon";/);
});
