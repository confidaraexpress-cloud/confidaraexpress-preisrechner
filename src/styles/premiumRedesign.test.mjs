// Governance des Premium-Redesigns, Etappe 1 (Betreiberentscheidungen E1–E13 vom 2026-10-27).
//
// Was diese Datei festhält:
//   1. Jede Regel von premium-redesign.css hängt am Bereichsattribut — Admin, Partnerportal und
//      Partnerregistrierung setzen es nie und bleiben deshalb unverändert, obwohl alle Stylesheets im
//      selben Bündel liegen.
//   2. Den Bereich setzen genau die Kunden- und Auth-Seiten (hooks/useCeBereich.js) und statisch das
//      Seitengerüst des öffentlichen Preisrechners.
//   3. Farben nur über Tokens (Ausnahme: Alphamasken der Nachtkarte).
//   4. Knöpfe (E5): keine Bewegung, kein Verlauf, keine pauschale Deckkraft; Schatten nur über die
//      Knopf-Tokens.
//   5. Die Partnerregistrierung behält ihre Aurora; die Kunden-Anmeldung trägt die Nachtkarte.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HIER, "..");
const REPO = path.join(SRC, "..");
const lies = (p) => readFileSync(p, "utf8");
const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const CSS = ohneKommentare(lies(path.join(HIER, "premium-redesign.css")));

// Alle Regeln (Selektorliste, Körper) außerhalb von @keyframes; @media-Hüllen werden durchlaufen.
function regeln(css) {
  const out = [];
  const ohneKeyframes = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*\s*\}/g, "");
  const flach = ohneKeyframes.replace(/@media[^{]+\{/g, "").replace(/@supports[^{]+\{/g, "");
  for (const m of flach.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel) out.push({ sel, koerper: m[2] });
  }
  return out;
}
const REGELN = regeln(CSS);

// Selektorliste an den Kommas der obersten Ebene teilen — nicht innerhalb von :is(…), :not(…) oder :has(…).
function teile(sel) {
  const out = [];
  let tiefe = 0, start = 0;
  for (let i = 0; i < sel.length; i++) {
    if (sel[i] === "(") tiefe++;
    else if (sel[i] === ")") tiefe--;
    else if (sel[i] === "," && tiefe === 0) { out.push(sel.slice(start, i).trim()); start = i + 1; }
  }
  out.push(sel.slice(start).trim());
  return out.filter(Boolean);
}

function jsxDateien(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) jsxDateien(p, out);
    else if (/\.(jsx|js)$/.test(e) && !/\.test\./.test(e)) out.push(p);
  }
  return out;
}

test("1 — jede Regel von premium-redesign.css hängt am Bereichsattribut", () => {
  assert.ok(REGELN.length > 100, "die Regelliste wurde nicht gelesen");
  const frei = [];
  for (const { sel } of REGELN) {
    for (const teil of teile(sel)) {
      if (!/^(:root)?\[data-ce-bereich(="(kunde|auth)")?\]/.test(teil)) frei.push(teil);
    }
  }
  assert.deepEqual(frei, [], `Regeln ohne Bereich:\n  ${frei.join("\n  ")}`);
});

test("2 — den Bereich setzen genau die Kunden- und Auth-Seiten; Partner und Admin nie", () => {
  const aufrufe = {};
  for (const datei of jsxDateien(SRC)) {
    for (const m of lies(datei).matchAll(/useCeBereich\("(\w+)"\)/g)) {
      aufrufe[path.relative(SRC, datei).split(path.sep).join("/")] = m[1];
    }
  }
  assert.deepEqual(aufrufe, {
    "components/layout/DashboardLayout.jsx": "kunde",
    "pages/DashboardPage.jsx": "kunde",
    "pages/AuthPage.jsx": "auth",
    "pages/EmailChangeConfirmPage.jsx": "auth",
  });
  for (const datei of ["components/layout/PartnerLayout.jsx", "pages/PartnerRegisterPage.jsx", "components/layout/AdminLayout.jsx"]) {
    assert.doesNotMatch(lies(path.join(SRC, datei)), /data-ce-bereich|useCeBereich/, `${datei} setzt den Bereich`);
  }
  // Der Hook räumt nur auf, wenn ihm das Attribut noch gehört.
  const hook = lies(path.join(SRC, "hooks/useCeBereich.js"));
  assert.match(hook, /if \(root\.getAttribute\("data-ce-bereich"\) === bereich\) root\.removeAttribute\("data-ce-bereich"\);/);
  // Das Seitengerüst des Preisrechners trägt den Bereich statisch.
  for (const seite of ["preisrechner/index.html", "preisrechner/404.html"]) {
    assert.match(lies(path.join(REPO, seite)), /<html lang="de" data-ce-bereich="preisrechner">/, seite);
  }
});

test("3 — keine Farbliterale; nur die Alphamasken der Nachtkarte nennen Schwarz und Transparenz", () => {
  const treffer = [];
  for (const { sel, koerper } of REGELN) {
    for (const dekl of koerper.split(";")) {
      if (/^\s*(-webkit-)?mask-image\s*:/.test(dekl)) continue;
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(dekl)) treffer.push(`${sel.slice(0, 60)} → ${dekl.trim()}`);
    }
  }
  assert.deepEqual(treffer, [], `Farbliterale:\n  ${treffer.join("\n  ")}`);
});

test("4 — Knöpfe (E5): keine Bewegung, kein Verlauf, keine Deckkraft; Schatten nur über die Knopf-Tokens", () => {
  const KNOPF = /\.(btn|auth-cta|offer-cta-btn)\b/;
  const verstoesse = [];
  for (const { sel, koerper } of REGELN) {
    if (!KNOPF.test(sel)) continue;
    for (const m of koerper.matchAll(/(?:^|;)\s*transform\s*:\s*([^;]+)/g)) {
      if (m[1].trim() !== "none") verstoesse.push(`${sel}: transform ${m[1].trim()}`);
    }
    if (/gradient\(/.test(koerper)) verstoesse.push(`${sel}: Verlauf`);
    const deckkraft = koerper.match(/opacity\s*:\s*([\d.]+)/);
    if (deckkraft && Number(deckkraft[1]) !== 1) verstoesse.push(`${sel}: opacity ${deckkraft[1]}`);
    for (const m of koerper.matchAll(/box-shadow\s*:\s*([^;]+)/g)) {
      const v = m[1].trim();
      if (v !== "none" && !/^var\(--ce-pr-btn-shadow(-hover|-secondary)?\)$/.test(v)) verstoesse.push(`${sel}: Schatten ${v}`);
    }
  }
  assert.deepEqual(verstoesse, [], verstoesse.join("\n"));
});

test("5 — Partnerregistrierung behält die Aurora, die Kunden-Anmeldung trägt die Nachtkarte", () => {
  const partner = lies(path.join(SRC, "pages/PartnerRegisterPage.jsx"));
  const auth = lies(path.join(SRC, "pages/AuthPage.jsx"));
  assert.match(partner, /<AuthAurora \/>/, "die Partnerregistrierung hat ihre Aurora verloren");
  assert.doesNotMatch(auth, /AuthAurora/, "die Kunden-Anmeldung rendert noch die Aurora");
  const bestaetigung = lies(path.join(SRC, "pages/EmailChangeConfirmPage.jsx"));
  assert.doesNotMatch(bestaetigung, /AuthAurora/, "die E-Mail-Bestätigung rendert noch die Aurora");
  // Komplettabschluss (Abschnitt 5, 2026-10-28): Anmeldung und E-Mail-Bestätigung tragen DIESELBE gerahmte Karte —
  // eine Komponente; ihre Lichter starten erst, wenn das Bild dekodiert ist.
  const karte = lies(path.join(SRC, "components/auth/AuthKarte.jsx"));
  assert.match(karte, /import nachtkarte from "\.\.\/\.\.\/assets\/illustrations\/nachtkarte-eu\.svg";/);
  assert.match(karte, /<NachtkartenLichter welle aktiv=\{bereit\} \/>/);
  assert.match(karte, /bild\.decode\(\)\.then\(los, los\)/, "die Lichter warten nicht auf das dekodierte Bild");
  for (const seite of [auth, bestaetigung]) assert.match(seite, /<AuthKarte \/>/);
  // Unternehmensangaben nur aus der zentralen Quelle.
  assert.match(auth, /import \{ COMPANY_PROFILE \} from "\.\.\/config\/companyProfile";/);
  assert.doesNotMatch(auth, /Miguel Vance|support@confidaraexpress\.de|016092717124/);
});

test("6 — die Bereichsebene steht zuletzt im Bündel und die Werte halten zusammen", () => {
  const index = lies(path.join(HIER, "index.css"));
  assert.ok(index.trim().endsWith("@import './premium-redesign.css';"), "premium-redesign.css ist nicht der letzte Import");
  const werte = lies(path.join(SRC, "components/ui/Werte.jsx"));
  assert.match(werte, /if \(!teile\.some\(\(s\) => s\.wert\)\) return children;/);
  assert.match(werte, /<span>\s*\{teile\.map/, "Werte liefert kein einzelnes umschließendes Element");
});

test("7 — Umbruch nur über text-wrap-style: die Kurzform text-wrap höbe gesetzte nowrap-Regeln auf", () => {
  // text-wrap ist die Kurzform aus text-wrap-mode und text-wrap-style. Sie setzt den Modus auf wrap zurück und
  // schlägt damit jedes white-space: nowrap mit geringerer Spezifität (Route der Entwurfstabelle, Beträge).
  const kurzform = [...CSS.matchAll(/text-wrap\s*:[^;}]*/g)].map((m) => m[0].trim());
  assert.deepEqual(kurzform, [], `Kurzform text-wrap in premium-redesign.css: ${kurzform.join(", ")}`);
  assert.match(CSS, /\[data-ce-bereich\] body \{ text-wrap-style: pretty; \}/);
});

test("8 — Touch-Ziele (R9): mit grobem Zeiger bleiben die Kontrollkästchen-Zeilen der Anmeldung 44 px hoch", () => {
  // Die Bereichsregel „.auth-check { min-height: 24px }“ schlägt mit höherer Spezifität die 44 px aus auth.css;
  // deshalb setzt der Bereich sie mit grobem Zeiger selbst wieder auf die Touch-Größe.
  const grob = [...CSS.matchAll(/@media \(pointer: coarse\) \{([\s\S]*?\})\s*\}/g)].map((m) => m[1]);
  assert.ok(grob.some((b) => /\[data-ce-bereich="auth"\] \.auth-check[^{]*\{\s*min-height: var\(--ce-size-touch-target\);/.test(b)),
    "die Kontrollkästchen-Zeilen der Anmeldung verlieren mit grobem Zeiger die 44 px");
});

// ── Premium-Redesign, Abschluss (Betreiberentscheidung 2026-10-27): Paketbühne, Lichter der Nachtkarte, Demo ──
test("9 — Paketbühne und Nachtkarte gehören zur Bereichsebene: jede Regel am Bereichsattribut, Farben nur als Token", () => {
  for (const datei of ["paketbuehne.css", "nachtkarte.css"]) {
    const css = ohneKommentare(lies(path.join(HIER, datei))).replace(/@property[^{]+\{[^}]*\}/g, "").replace(/@container[^{]+\{/g, "");
    const r = regeln(css);
    assert.ok(r.length > 5, `${datei}: keine Regeln gelesen`);
    const frei = [];
    const literale = [];
    for (const { sel, koerper } of r) {
      for (const teil of teile(sel)) if (!/^\[data-ce-bereich\]/.test(teil)) frei.push(`${datei}: ${teil}`);
      for (const dekl of koerper.split(";")) {
        if (/^\s*(-webkit-)?mask-image\s*:/.test(dekl)) continue;
        if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(dekl)) literale.push(`${datei}: ${dekl.trim()}`);
      }
    }
    assert.deepEqual(frei, [], `Regeln ohne Bereich:\n  ${frei.join("\n  ")}`);
    assert.deepEqual(literale, [], `Farbliterale:\n  ${literale.join("\n  ")}`);
    // Bewegung nur mit Ausweg: reduzierte Bewegung schaltet sie ab.
    assert.match(lies(path.join(HIER, datei)), /@media \(prefers-reduced-motion: reduce\)/, `${datei}: ohne Reduced Motion`);
  }
  // Beide Dateien stehen in beiden Bündeln: Kundenbereich (index.css) und öffentlicher Preisrechner.
  for (const buendel of ["index.css", "public-calculator.css"]) {
    const src = lies(path.join(HIER, buendel));
    assert.match(src, /@import '\.\/paketbuehne\.css';/, `${buendel}: Paketbühne fehlt`);
    assert.match(src, /@import '\.\/nachtkarte\.css';/, `${buendel}: Nachtkarte fehlt`);
  }
});

test("10 — die Demo-Leiste lebt nur in der Demo-Welt und nutzt ausschließlich Tokens", () => {
  const css = ohneKommentare(lies(path.join(HIER, "demo.css")));
  const r = regeln(css);
  const frei = [];
  for (const { sel, koerper } of r) {
    for (const teil of teile(sel)) if (!/^(\[data-ce-demo\]|\.demo-ende)/.test(teil)) frei.push(teil);
    if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(koerper)) frei.push(`${sel}: Farbliteral`);
  }
  assert.deepEqual(frei, [], `außerhalb der Demo oder mit Farbliteral:\n  ${frei.join("\n  ")}`);
  assert.match(lies(path.join(HIER, "index.css")), /@import '\.\/demo\.css';/);
});

test("11 — die Kopfleiste schneidet ihre Aufklapper nicht ab (Mitteilungen, Suche, Benutzermenü)", () => {
  // Regression 2026-10-28: ein clip-path auf der Leiste (für das seitliche Weiß) schnitt das Mitteilungspanel
  // vollständig ab — es lag unsichtbar unter den Kennzahlen der Übersicht.
  const leiste = REGELN.filter(({ sel }) => teile(sel).some((t) => /\.ce-page-header-utility$/.test(t)));
  assert.ok(leiste.length > 0, "die Regel der Kopfleiste fehlt");
  for (const { sel, koerper } of leiste) {
    assert.doesNotMatch(koerper, /clip-path|(^|[\s;])overflow(-[xy])?\s*:\s*(hidden|clip|auto|scroll)|contain\s*:\s*(paint|strict|content)/,
      `${sel} schneidet die Aufklapper ab`);
  }
  assert.ok(leiste.some(({ koerper }) => /border-image:[^;]*fill 0 \/ 0 \/ 0 100vmax/.test(koerper)),
    "das Weiß der Leiste reicht nicht seitlich über die Inhaltsbreite");
});
