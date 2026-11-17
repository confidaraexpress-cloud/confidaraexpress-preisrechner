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
      // Blue Light (2026-11-16): Admin, Partnerportal und öffentliche Seiten tragen ebenfalls ein Bereichsattribut —
      // eine Regel ohne bestimmten Bereich nennt deshalb die drei Bereiche dieser Ebene ausdrücklich.
      if (/^\[data-ce-bereich\](?!:where\(\[data-ce-bereich="kunde"\], \[data-ce-bereich="auth"\], \[data-ce-bereich="preisrechner"\]\))/.test(teil)) frei.push(`ohne Skala: ${teil}`);
    }
  }
  assert.deepEqual(frei, [], `Regeln ohne Bereich:\n  ${frei.join("\n  ")}`);
});

test("2 — den Bereich setzen genau diese Ansichten; die Familie Blue Light vergibt der Hook", () => {
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
    // Admin-Anmeldung (Canonical v2.130, bewusste Ankeränderung): eine Auth-Seite, nicht das Adminpanel —
    // AdminLayout setzt den Bereich weiterhin nie (unten).
    "pages/AdminAnmeldungPage.jsx": "auth",
    // Blue Light (Betreiberauftrag „Final Master Release“, 2026-11-16): die Partnerregistrierung steht auf der Bühne der
    // Anmeldung; Partnerportal und öffentliche Seiten gehören zur Designfamilie (kunde-obsidian.css). Das Adminpanel trägt
    // seit dem Betreiberauftrag vom 2026-11-17 die eigene dunkle Ebene Confidara Leitstand Nacht (admin-nacht.css).
    "pages/PartnerRegisterPage.jsx": "auth",
    "components/layout/AdminLayout.jsx": "admin",
    "components/layout/PartnerLayout.jsx": "partner",
    "components/layout/NavbarLayout.jsx": "oeffentlich",
  });
  // Der Hook räumt nur auf, wenn ihm das Attribut noch gehört — dann beide Attribute.
  const hook = lies(path.join(SRC, "hooks/useCeBereich.js"));
  assert.match(hook, /if \(root\.getAttribute\("data-ce-bereich"\) === bereich\) \{\s*root\.removeAttribute\("data-ce-bereich"\);\s*root\.removeAttribute\("data-ce-familie"\);/);
  // Anmeldung, Admin-Anmeldung, Adminpanel (eigene Ebene) und Preisrechner gehören nicht zur Familie.
  assert.match(hook, /BLUE_LIGHT_FAMILIE = Object\.freeze\(\["kunde", "partner", "oeffentlich"\]\)/);
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
  // Komplettabschluss (Abschnitt 5, 2026-10-27): Anmeldung und E-Mail-Bestätigung tragen DIESELBE gerahmte Karte —
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
  // Editorial Business Premium (2026-10-28): die Editorial-Ebene folgt direkt auf die Bereichsebene.
  // Confidara Obsidian (Betreiberauftrag 2026-11-15): danach nur noch Schrift- und Gestaltungsebene des
  // Kundenbereichs, die Gestaltungsebene als letzter Import (kundeObsidian.test.mjs).
  // Confidara Leitstand Nacht (Betreiberauftrag 2026-11-17): ganz zuletzt die Adminebene (adminNacht.test.mjs).
  const importe = [...index.matchAll(/@import '\.\/([\w-]+\.css)';/g)].map((m) => m[1]);
  assert.deepEqual(importe.slice(-5), ["premium-redesign.css", "premium-editorial.css", "kunde-schriften.css", "kunde-obsidian.css", "admin-nacht.css"],
    "Bereichs-, Editorial-, Obsidian- und Adminebene stehen nicht zuletzt");
  assert.ok(index.trim().endsWith("@import './admin-nacht.css';"), "admin-nacht.css ist nicht der letzte Import");
  const werte = lies(path.join(SRC, "components/ui/Werte.jsx"));
  assert.match(werte, /if \(!teile\.some\(\(s\) => s\.wert\)\) return children;/);
  assert.match(werte, /<span>\s*\{teile\.map/, "Werte liefert kein einzelnes umschließendes Element");
});

test("7 — Umbruch nur über text-wrap-style: die Kurzform text-wrap höbe gesetzte nowrap-Regeln auf", () => {
  // text-wrap ist die Kurzform aus text-wrap-mode und text-wrap-style. Sie setzt den Modus auf wrap zurück und
  // schlägt damit jedes white-space: nowrap mit geringerer Spezifität (Route der Entwurfstabelle, Beträge).
  const kurzform = [...CSS.matchAll(/text-wrap\s*:[^;}]*/g)].map((m) => m[0].trim());
  assert.deepEqual(kurzform, [], `Kurzform text-wrap in premium-redesign.css: ${kurzform.join(", ")}`);
  assert.match(CSS, /\[data-ce-bereich\]:where\(\[data-ce-bereich="kunde"\], \[data-ce-bereich="auth"\], \[data-ce-bereich="preisrechner"\]\) body \{ text-wrap-style: pretty; \}/);
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
  // Regression 2026-10-27: ein clip-path auf der Leiste (für das seitliche Weiß) schnitt das Mitteilungspanel
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

/* ══════════ 12 — Editorial Business Premium (Betreiberentscheidung 2026-10-28) ══════════
   premium-editorial.css ist die letzte Ebene im Bündel. Sie hängt ausschließlich am Kundenbereich — strenger
   als die Bereichsebene: auch die Anmeldung (Auth) und der Preisrechner lesen sie nie. Es gelten dieselben
   Regeln wie oben: Farben nur über Tokens, Knöpfe ohne Bewegung, Verlauf und Deckkraft, Schatten der Knöpfe
   nur über die Knopf-Tokens, Umbruch nur über text-wrap-style.
   Bediensystem (Betreiberentscheidungen D1/D6, 2026-11-14): Im Kundenbereich tragen Knöpfe dezente Tiefe — die
   Schatten kommen dann aus der Familie --ce-pr-bs-schatten-* (variables.css). Bewegung, Verlauf und Deckkraft
   bleiben an Knöpfen ausgeschlossen. */
const EDITORIAL = ohneKommentare(lies(path.join(HIER, "premium-editorial.css")));
const EDITORIAL_REGELN = regeln(EDITORIAL);

test("12 — Editorial-Ebene: nur Kundenbereich, keine Farbliterale, Knöpfe nach E5, keine Kurzform text-wrap", () => {
  assert.ok(EDITORIAL_REGELN.length > 50, "die Regelliste der Editorial-Ebene wurde nicht gelesen");
  const frei = [];
  for (const { sel } of EDITORIAL_REGELN) {
    for (const teil of teile(sel)) if (!/^:root\[data-ce-bereich="kunde"\]/.test(teil)) frei.push(teil);
  }
  assert.deepEqual(frei, [], `Regeln außerhalb des Kundenbereichs:\n  ${frei.join("\n  ")}`);

  const literale = [];
  for (const { sel, koerper } of EDITORIAL_REGELN) {
    for (const dekl of koerper.split(";")) {
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(dekl)) literale.push(`${sel.slice(0, 60)} → ${dekl.trim()}`);
    }
  }
  assert.deepEqual(literale, [], `Farbliterale:\n  ${literale.join("\n  ")}`);

  const KNOPF = /\.(btn|auth-cta|offer-cta-btn)\b/;
  const knopf = [];
  for (const { sel, koerper } of EDITORIAL_REGELN) {
    if (!KNOPF.test(sel)) continue;
    for (const m of koerper.matchAll(/(?:^|;)\s*transform\s*:\s*([^;]+)/g)) {
      if (m[1].trim() !== "none") knopf.push(`${sel}: transform ${m[1].trim()}`);
    }
    if (/gradient\(/.test(koerper)) knopf.push(`${sel}: Verlauf`);
    const deckkraft = koerper.match(/opacity\s*:\s*([\d.]+)/);
    if (deckkraft && Number(deckkraft[1]) !== 1) knopf.push(`${sel}: opacity ${deckkraft[1]}`);
    for (const m of koerper.matchAll(/box-shadow\s*:\s*([^;]+)/g)) {
      const v = m[1].trim();
      if (v !== "none" && !/^var\(--ce-pr-(btn-shadow(-hover|-secondary)?|bs-schatten-[a-z-]+)\)$/.test(v)) knopf.push(`${sel}: Schatten ${v}`);
    }
  }
  assert.deepEqual(knopf, [], knopf.join("\n"));
  // Die Schattenfamilie des Bediensystems ist definiert und navygetönt — kein Leuchten in der Signalfarbe.
  const tokens = lies(path.join(HIER, "variables.css"));
  for (const name of ["primaer", "primaer-zeigen", "gedrueckt", "sekundaer", "sekundaer-zeigen", "gefahr", "menue"]) {
    const m = tokens.match(new RegExp(`--ce-pr-bs-schatten-${name}:\\s*([^;]+);`));
    assert.ok(m, `--ce-pr-bs-schatten-${name} fehlt`);
    assert.doesNotMatch(m[1], /rgba\(0, 74, 252/, `--ce-pr-bs-schatten-${name}: Leuchten in der Signalfarbe`);
  }

  const kurzform = [...EDITORIAL.matchAll(/text-wrap\s*:[^;}]*/g)].map((m) => m[0].trim());
  assert.deepEqual(kurzform, [], `Kurzform text-wrap in premium-editorial.css: ${kurzform.join(", ")}`);
});

/* ══════════ 12b — keine Kurzform „border-image: none“ in der Editorial-Ebene (Befund 2026-11-01) ══════════
   Der Build minifiziert „border-image: none“ zu „border-image:“ — eine leere Deklaration, die der Browser verwirft. Das
   weiße Vollbreitenband der Kopfleiste (border-image der Bereichsebene) blieb dadurch im ausgelieferten Bündel stehen,
   im Dev-Server nicht; sichtbar wurde es erst auf der getönten Fläche der Übersicht. Aufheben nur über die Langform. */
test("12b — Editorial-Ebene hebt border-image nur über die Langform auf (die Kurzform none fällt im Build weg)", () => {
  const kurz = [...EDITORIAL.matchAll(/(?:^|[;{\s])border-image\s*:\s*none\b[^;}]*/g)].map((m) => m[0].trim());
  assert.deepEqual(kurz, [], `Kurzform border-image: none in premium-editorial.css: ${kurz.join(", ")}`);
  const kopf = EDITORIAL_REGELN.find(({ sel }) => sel === ':root[data-ce-bereich="kunde"] .ce-page-header-utility');
  assert.ok(kopf && /border-image-source:\s*none/.test(kopf.koerper), "die Kopfleiste hebt das weiße Band nicht mehr auf");
});

/* ══════════ 13 — Plus-Drehung der Anlegen-Aktionen (Betreiberentscheidung 2026-10-28) ══════════
   Einzige Ausnahme zu E5: Beim Zeigen dreht sich nur das Pluszeichen (::before) der Anlegen-Aktionen zweimal und
   endet in der Ruhelage — einmal je Zeigen, nur mit echtem Zeiger, über die Tastatur beim sichtbaren Fokus, nie bei
   reduzierter Bewegung. Der Knopf selbst bewegt sich nicht (Test 12 prüft weiter transform an jedem Knopf). */
test("13 — Plus-Drehung: nur das Pluszeichen, ein Lauf, zwei volle Umdrehungen, nur echter Zeiger oder Tastaturfokus", () => {
  const KNOPF = /\.(btn|auth-cta|offer-cta-btn)\b/;
  const animiert = EDITORIAL_REGELN.filter(({ sel, koerper }) => KNOPF.test(sel) && /(?:^|;)\s*animation(-name)?\s*:/.test(koerper));
  assert.equal(animiert.length, 2, "erwartet: genau die Drehung beim Zeigen und beim Tastaturfokus");
  for (const { sel, koerper } of animiert) {
    for (const teil of teile(sel)) {
      assert.match(teil, /\.btn\.ce-aktion-neu:(hover:not\(:disabled\)|focus-visible)::before$/, `Bewegung an einem Knopf außerhalb des Pluszeichens: ${teil}`);
    }
    assert.match(koerper, /animation:\s*ce-plus-drehung var\(--ce-pr-ed-plus-dauer\) var\(--ce-pr-ed-plus-kurve\) 1 both/, `${sel}: nicht genau ein Lauf`);
  }
  const zeigen = EDITORIAL.match(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*and\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{\s*([^{}]+)\{[^{}]*ce-plus-drehung/);
  assert.ok(zeigen && /:hover/.test(zeigen[1]), "die Drehung beim Zeigen braucht (hover: hover), (pointer: fine) und (prefers-reduced-motion: no-preference)");
  const fokus = EDITORIAL.match(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{\s*([^{}]+)\{[^{}]*ce-plus-drehung/);
  assert.ok(fokus && /:focus-visible/.test(fokus[1]), "die Drehung beim Tastaturfokus braucht (prefers-reduced-motion: no-preference)");
  // Zwei volle Umdrehungen: Die Endlage gleicht der Ruhelage, kein Zwischenstand bleibt stehen.
  assert.match(EDITORIAL, /@keyframes ce-plus-drehung\s*\{\s*from\s*\{\s*rotate:\s*0deg;?\s*\}\s*to\s*\{\s*rotate:\s*720deg;?\s*\}\s*\}/);
  const tokens = lies(path.join(HIER, "variables.css"));
  assert.match(tokens, /--ce-pr-ed-plus-dauer:\s*1150ms;/);
  assert.match(tokens, /--ce-pr-ed-plus-kurve:\s*cubic-bezier\(0\.4, 0, 0\.2, 1\);/);
  // Das Plus und damit die Drehung tragen genau die Anlegen-Aktionen der Kundenseiten.
  for (const datei of ["components/dashboard/Overview.jsx", "components/drafts/DraftsHeader.jsx", "components/addressbook/AddressBookHeader.jsx",
    "components/support/SupportRequestsView.jsx", "pages/inventory/InventoryOverviewPage.jsx", "pages/inventory/OrdersPage.jsx", "pages/inventory/ProductsPage.jsx"]) {
    assert.match(lies(path.join(SRC, datei)), /className="btn btn-primary ce-aktion-neu"/, `${datei}: Anlegen-Aktion ohne Plus`);
  }
  // Das Plus ist Schmuck: leerer Alternativtext, damit der zugängliche Name „Neue Sendung“ bleibt (gemessen im
  // Chrome-AX-Baum: ohne ihn „+ Neue Sendung“). Die erste Zeile bleibt für Browser ohne Alternativtext-Syntax.
  const plusRegel = EDITORIAL_REGELN.find((r) => r.sel.endsWith(".btn.ce-aktion-neu::before"));
  assert.ok(plusRegel, "die Regel des Pluszeichens fehlt");
  assert.ok(plusRegel.koerper.includes('content: "+";') && plusRegel.koerper.includes('content: "+" / "";'),
    "das Pluszeichen braucht den leeren Alternativtext (und davor die Rückfallzeile)");
});

/* ══════════ 14 — Auswahl: Navy-Wahl (B) und Segmente (C) (Betreiberentscheidung 2026-10-28) ══════════
   Die runden Radiopunkte des Kundenbereichs sind ersetzt: Optionen mit Erklärung als Navy-Wahl (`ce-wahl`), kurze
   Optionen als Segmentsteuerung (`ce-segment`/`ce-segment-option`). Reine Darstellung: Die Eingaben bleiben native
   Radios bzw. Knöpfe mit role="radio"/aria-pressed; sie werden nie aus dem Zugänglichkeitsbaum genommen. Zeigen nur
   mit echtem Zeiger — eine Zeige-Regel außerhalb von (hover: hover) darf den Ruhezustand nicht verändern. */
const ohneJsKommentare = (q) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// Oberste @media-Blöcke mit ihrem Inhalt (Klammern gezählt).
function mediaBloecke(css) {
  const out = [];
  for (const m of css.matchAll(/@media([^{]+)\{/g)) {
    let tiefe = 1, i = m.index + m[0].length;
    for (; i < css.length && tiefe > 0; i++) { if (css[i] === "{") tiefe++; else if (css[i] === "}") tiefe--; }
    out.push({ bedingung: m[1].trim(), inhalt: css.slice(m.index + m[0].length, i - 1), von: m.index, bis: i });
  }
  return out;
}

test("14 — Auswahl: jede Gruppe trägt ihre Variante, die Bedienung bleibt nativ und zugänglich", () => {
  const ANKER = [
    // Premium Control System 2.0 (Betreiberauftrag 2026-11-14): Abrechnung, Lieferscheine, Transportabsicherung und
    // Art der Lieferadresse wählen über das kompakte Auswahlmenü (AuswahlMenue.jsx) statt über große Karten.
    ["components/dashboard/BillingModeCard.jsx", [/<AuswahlMenue\s+name="billingMode"\s+id="bm-mode"\s+labelId="bm-mode-label"/]],
    ["components/dashboard/DeliveryNoteCard.jsx", [/<AuswahlMenue\s+name="deliveryNoteMode"\s+id="dn-mode"\s+labelId="dn-mode-label"/]],
    ["components/booking/CustomsInvoiceModeSection.jsx", [/className="ci-mode-option ce-wahl" htmlFor="ci-mode-proforma"/, /className="ci-mode-option ce-wahl" htmlFor="ci-mode-commercial"/]],
    ["components/booking/InsuranceModule.jsx", [/<AuswahlMenue\s+name="insuranceType"\s+id="ins-auswahl"\s+labelId="ins-auswahl-label"/, /<div className="ce-segment">/, /className="ci-mode-option ce-segment-option" htmlFor=\{`ins-\$\{feld\}-ja`\}/, /className="ci-mode-option ce-segment-option" htmlFor=\{`ins-\$\{feld\}-nein`\}/]],
    ["components/booking/ResidentialPriceInputModule.jsx", [/<AuswahlMenue\s+name="residential-delivery"\s+id="residential-delivery"\s+labelId="residential-price-inputs-title"/]],
    // Das Auswahlmenü selbst: select-only combobox nach WAI-ARIA 1.2 — Fokus am Auslöser, Optionen mit Zustand.
    ["components/ui/AuswahlMenue.jsx", [/role="combobox"/, /aria-haspopup="listbox"/, /aria-expanded=\{offen\}/, /aria-activedescendant=/, /role="listbox"/, /role="option"/, /aria-selected=\{o\.value === value\}/, /aria-disabled=\{o\.disabled \? true : undefined\}/]],
    ["components/booking/AdditionalOptionsModule.jsx", [/className="labelfmt-group ce-segment" role="radiogroup"/, /className=\{`labelfmt-card ce-segment-option\$\{/, /type="radio"/]],
    ["components/offers/ShipmentFilterBar.jsx", [/service-filter-option--radio ce-wahl ce-wahl--zeile \$\{serviceFilter === opt\.id/, /service-filter-option--radio ce-wahl ce-wahl--zeile \$\{shippingModeFilter === opt\.id/, /role="radio"/, /aria-checked=\{serviceFilter === opt\.id\}/]],
    ["components/offers/OffersList.jsx", [/className="offers-segment offers-segment--primary ce-segment" role="group"/, /offers-segment-item ce-segment-option\$\{sortMode === o\.id/, /aria-pressed=\{sortMode === o\.id\}/, /className="date-quick-options ce-segment"/]],
    ["components/offers/VatModeToggle.jsx", [/offers-segment--secondary ce-segment"/, /aria-pressed=\{!brutto\}/, /aria-pressed=\{brutto\}/]],
    ["components/dashboard/InvoicesList.jsx", [/className="inv-filters ce-segment" role="group"/, /inv-filter-chip ce-segment-option\$\{/, /aria-pressed=\{filter === f\.value\}/]],
    ["components/addressbook/AddressFormDrawer.jsx", [/className="abk-role-options ce-segment" role="radiogroup"/, /abk-role-option ce-segment-option\$\{/, /type="radio" name="abk-role"/]],
  ];
  for (const [datei, muster] of ANKER) {
    const quelle = ohneJsKommentare(lies(path.join(SRC, datei)));
    for (const m of muster) assert.match(quelle, m, `${datei}: ${m}`);
  }
  // Datumsschnellwahl in der Filterleiste: beide Spuren, vier Segmente.
  const filter = ohneJsKommentare(lies(path.join(SRC, "components/offers/ShipmentFilterBar.jsx")));
  assert.equal((filter.match(/className="date-quick-options ce-segment"/g) || []).length, 2);
  assert.equal((filter.match(/date-quick-btn ce-segment-option/g) || []).length, 4);

  // Eingaben in einer Auswahl bleiben bedienbar und hörbar: unsichtbar nur über die Deckkraft, nie weggeschaltet.
  const eingaben = EDITORIAL_REGELN.filter(({ sel }) => /ce-wahl|ce-segment/.test(sel) && /input/.test(sel));
  assert.ok(eingaben.length >= 2, "die Regeln für die Eingaben der Auswahl fehlen");
  for (const { sel, koerper } of eingaben) {
    assert.doesNotMatch(koerper, /display:\s*none|visibility:\s*hidden|pointer-events:\s*none/, `${sel}: Eingabe weggeschaltet`);
    if (/opacity/.test(koerper)) assert.match(koerper, /inset:\s*0/, `${sel}: unsichtbare Eingabe muss die ganze Option abdecken`);
  }
  // Gewählt erkennt jede Variante an allen Zustandsformen, die die Gruppen tragen.
  assert.match(EDITORIAL, /\.ce-wahl:is\(:has\(> input:checked\), \[aria-checked="true"\]\)/);
  assert.match(EDITORIAL, /\.ce-segment \.ce-segment-option:is\(\[aria-pressed="true"\], :has\(> input:checked\), \.active\)/);

  // Zeigen nur mit echtem Zeiger: Außerhalb von (hover: hover) setzen :hover-Regeln der Auswahl nur den Ruhezustand.
  const zeigeBloecke = mediaBloecke(EDITORIAL).filter((b) => /\(hover:\s*hover\)/.test(b.bedingung));
  let ausserhalb = EDITORIAL;
  for (const b of [...zeigeBloecke].reverse()) ausserhalb = ausserhalb.slice(0, b.von) + ausserhalb.slice(b.bis);
  const lose = regeln(ausserhalb).filter(({ sel }) => /ce-wahl|ce-segment-option/.test(sel) && /:hover/.test(sel));
  for (const { sel } of lose) assert.match(sel, /:where\(\.ce-(wahl|segment-option)\):hover/, `Zeige-Regel ohne (hover: hover): ${sel}`);
  assert.ok(zeigeBloecke.some((b) => /ce-wahl/.test(b.inhalt)) && zeigeBloecke.some((b) => /ce-segment-option/.test(b.inhalt)),
    "das Zeigen der Auswahl fehlt in (hover: hover)");
});

test("15 — Überlagerte Auswahl: unter dem unsichtbaren Radio steht kein weiteres Bedienelement", () => {
  // Das Radio liegt unsichtbar über der ganzen Option (inset: 0, Abschnitte 21 und 22). Ein Link oder Knopf darin wäre
  // nicht mehr erreichbar — ein Klick wählte die Option (Härtung aus dem Security-Review 2026-10-28). Abrechnung,
  // Lieferscheine, Absicherung und Adressart wählen seit 2026-11-14 über das Auswahlmenü (keine Überlagerung); der
  // Details-Knopf der Absicherung steht im Infofeld unter dem Menü, nie in einer Option (geprüft unten).
  const dateien = ["components/booking/CustomsInvoiceModeSection.jsx", "components/booking/InsuranceModule.jsx",
    "components/booking/AdditionalOptionsModule.jsx", "components/addressbook/AddressFormDrawer.jsx"];
  let geprueft = 0;
  for (const datei of dateien) {
    const quelle = lies(path.join(SRC, datei));
    for (const m of quelle.matchAll(/<label\b[^>]*className=[^>]*(?:(?:dn|ci)-mode-option ce-wahl|ce-segment-option)[^>]*>([\s\S]*?)<\/label>/g)) {
      geprueft++;
      assert.match(m[1], /type="radio"/, `${datei}: überlagerte Option ohne natives Radio`);
      assert.doesNotMatch(m[1], /<(a|button|Link)\b/, `${datei}: Bedienelement unter dem unsichtbaren Radio`);
    }
  }
  assert.ok(geprueft >= 6, `nur ${geprueft} überlagerte Optionen gefunden — Anker verschoben?`);

  // Optionen des Auswahlmenüs enthalten kein Bedienelement: Das <li role="option"> wird als Ganzes gewählt.
  const menue = ohneJsKommentare(lies(path.join(SRC, "components/ui/AuswahlMenue.jsx")));
  const option = menue.match(/<li\b[\s\S]*?<\/li>/);
  assert.ok(option, "die Option des Auswahlmenüs fehlt");
  assert.doesNotMatch(option[0], /<(a|button|Link|input)\b/, "Bedienelement in einer Option des Auswahlmenüs");
});

test("16 — Sehr schmal im Verhältnis zur Schrift: Kennungen brechen nur dort und nur nach einem Bindestrich", () => {
  // Werte setzt Bruchstellen (<wbr>) nur in langen Kennungen mit Ziffer und Bindestrich; ein Datum bleibt ganz.
  const werte = ohneJsKommentare(lies(path.join(SRC, "components/ui/Werte.jsx")));
  assert.match(werte, /const istKennung = \(text\) => text\.length >= 12 && text\.includes\("-"\) && \/\\d\/\.test\(text\);/);
  assert.match(werte, /\{stueck\}-<wbr \/>/, "die Bruchstelle steht nicht nach dem Bindestrich");
  assert.match(werte, /className="ce-wert ce-wert--kennung"/);
  // Gelöst wird .ce-wert--kennung ausschließlich im Block unter 20em — sonst hält .ce-wert jede Kennung zusammen.
  const block = EDITORIAL.match(/@media \(width < 20em\) \{([\s\S]*?)\n\}/);
  assert.ok(block, "der Block „sehr schmal“ fehlt in premium-editorial.css");
  assert.match(block[1], /\.ce-wert--kennung, \.inv-cell-sku\) \{ white-space: normal; \}/);
  assert.equal(EDITORIAL.replace(block[0], "").includes("ce-wert--kennung"), false, "eine Kennung bricht auch außerhalb des Blocks");
});

/* ══════════ 17 — Seitenkante und Menütaste (Betreiberentscheidung 2026-10-29) ══════════
   Die kurze Kante unter Seitenkopf, Angebotsblatt und Sendungsverfolgung und an der Oberkante der Dialoge ist grau
   (--ce-color-border-strong) — keine Kante aus Navy und Signal mehr. Die Menütaste „Weitere Aktionen“ ist ein Block
   für Entwürfe, Adressbuch, Lager und Sendungen: Größe aus einer Variablen, drei Punkte auch im Kontrastmodus,
   Zeigen nur mit echtem Zeiger, keine Bewegung und keine Deckkraft.
   Bediensystem (Betreiberentscheidungen D3/D7, 2026-11-14): Die Taste ist eine Symboltaste in der Sprache der
   Sekundäraktion — leicht gerundetes Quadrat (Radius des Bediensystems), feine Kontur, Navy-Punkte — und so hoch wie
   die kompakte Aktion daneben (36 px; Touch, schmal und Entwurfskarten 44 px).
   Größe und Mitte im Browser: tests/e2e/premiumParityApp.test.mjs D8. */
test("17 — Seitenkante grau; die Menütaste spricht die Sprache der Aktion daneben", () => {
  assert.doesNotMatch(EDITORIAL, /linear-gradient\([^;]*--ce-pr-navy-800[^;]*--ce-pr-signal/, "eine Kante aus Navy und Signal ist zurück");
  for (const kante of [".ce-page-header-main::after", ".offers-result-header::after", ".tracking-head::after", ".price-drift-card)::before"]) {
    const regel = EDITORIAL_REGELN.find(({ sel }) => sel.endsWith(kante));
    assert.ok(regel, `die Kante ${kante} fehlt`);
    assert.match(regel.koerper, /background:\s*var\(--ce-color-border-strong\);/, `${kante}: nicht grau`);
  }

  const K = ':root[data-ce-bereich="kunde"] ';
  const TASTEN = ":is(.dft-actions-trigger, .abk-actions-trigger, .inv-actions-trigger)";
  const basis = EDITORIAL_REGELN.find(({ sel }) => sel === K + TASTEN);
  assert.ok(basis, "der gemeinsame Block der Menütaste fehlt");
  for (const mass of ["width", "height", "min-width", "min-height"]) {
    assert.match(basis.koerper, new RegExp(`(^|;)\\s*${mass}: var\\(--ce-menue-groesse\\);`), `${mass} nicht aus --ce-menue-groesse`);
  }
  assert.match(basis.koerper, /--ce-menue-groesse: var\(--ce-pr-bs-hoehe-kompakt\);/, "Tabellenzeilen: nicht so hoch wie die kompakte Aktion daneben");
  assert.match(basis.koerper, /border: 1px solid var\(--ce-pr-bs-kontur\);/, "keine feine Kontur wie die Sekundäraktion");
  assert.match(basis.koerper, /border-radius: var\(--ce-pr-bs-radius\);/, "nicht der Radius des Bediensystems");
  assert.doesNotMatch(basis.koerper, /--ce-radius-full/, "die Taste ist wieder rund");
  assert.match(basis.koerper, /(^|;)\s*color: var\(--ce-pr-navy-800\);/, "die Punkte sind nicht Navy");
  assert.match(basis.koerper, /box-shadow: var\(--ce-pr-bs-schatten-sekundaer\);/, "nicht der leise Schatten der Sekundäraktion");
  const grob = mediaBloecke(EDITORIAL).find((b) => b.bedingung === "(pointer: coarse), (max-width: 860px)" && b.inhalt.includes(TASTEN));
  assert.ok(grob && /--ce-menue-groesse: var\(--ce-size-touch-target\);/.test(grob.inhalt), "Touch und schmal: nicht 44 px");
  // Die kompakte Aktion daneben ist genauso hoch. D2: kompakt nur mit nachgewiesenem Platzbedarf — Tabellenzeilen und
  // Zeilenaktionen neben der Taste stehen auf 36 px, schmal und mit grobem Zeiger auf 44 px; freistehende kleine Knöpfe
  // tragen das Standardmaß, keine Bereichsregel setzt .btn-sm pauschal kompakt.
  const ZEILEN = ":is(td, th, .abk-row-actions, .inv-actions-row, .inv-warehouse-actions, .sdoc-row) :is(.btn-sm, .btn-xs)";
  const kompakt = EDITORIAL_REGELN.filter(({ koerper }) => /--ce-btn-height: var\(--ce-pr-bs-hoehe-kompakt\);/.test(koerper));
  assert.ok(kompakt.some(({ sel }) => teile(sel).includes(K + ZEILEN)), "die kompakte Aktion in Zeilen steht nicht auf 36 px");
  assert.ok(!kompakt.some(({ sel }) => teile(sel).includes(K + ":is(.btn-sm, .btn-xs)")), "D2: .btn-sm steht pauschal auf 36 px");
  for (const bedingung of ["(max-width: 860px)", "(pointer: coarse)"]) {
    const block = mediaBloecke(EDITORIAL).find((b) => b.bedingung === bedingung && b.inhalt.includes(K + ZEILEN));
    assert.ok(block && /--ce-btn-height: var\(--ce-size-touch-target\);/.test(block.inhalt), `${bedingung}: die Zeilenaktion erreicht nicht 44 px`);
  }
  assert.ok(EDITORIAL_REGELN.some(({ sel, koerper }) => sel === K + ".dft-card-actions .dft-actions-trigger"
    && /--ce-menue-groesse: var\(--ce-size-touch-target\);/.test(koerper)), "Entwurfskarten: nicht 44 px");

  const punkte = EDITORIAL_REGELN.find(({ sel }) => sel === K + TASTEN + "::before");
  assert.ok(punkte, "die Punkte der Menütaste fehlen");
  assert.equal((punkte.koerper.match(/radial-gradient\(/g) || []).length, 3, "nicht genau drei Punkte");
  // Kontrastmodus: Die Punkte bleiben (none als Rückfall) und tragen die vom System erzwungene Schriftfarbe der Taste —
  // Navy wäre auf einem dunklen Kontrastschema unsichtbar.
  assert.match(punkte.koerper, /forced-color-adjust: none;\s*forced-color-adjust: preserve-parent-color;/, "im Kontrastmodus verschwänden die Punkte oder blieben Navy");

  // Zeigen nur mit echtem Zeiger: außerhalb von (hover: hover) kein :hover an der Menütaste.
  let ohneZeigen = EDITORIAL;
  for (const b of mediaBloecke(EDITORIAL).filter((b) => b.bedingung === "(hover: hover)")) ohneZeigen = ohneZeigen.replace(b.inhalt, "");
  assert.doesNotMatch(ohneZeigen, /actions-trigger[^{},]*:hover/, "Zeigen der Menütaste außerhalb von (hover: hover)");
  for (const { sel, koerper } of EDITORIAL_REGELN.filter(({ sel }) => /actions-trigger/.test(sel))) {
    assert.doesNotMatch(koerper, /(^|;)\s*(transform|animation|opacity)\s*:/, `${sel}: Bewegung oder Deckkraft`);
  }
});

/* ══════════ 18 — Seiteneinblendung: keine feste Ebene bleibt darin gefangen (Befund 2026-11-01) ══════════
   Die Einblendung einer Seite (nur Deckkraft, 180 ms) bildet währenddessen einen Stapelkontext. Ein in dieser Zeit
   geöffneter Dialog lag darin unter der Ansprechpartnerkarte (accountManagerCard M, gelegentlich rot; Kopfleiste und
   Seitenleiste ebenso). Enthält die Seite eine feste Ebene, endet die Einblendung deshalb sofort — über die Dauer, nicht
   über den Namen (ein Namenswechsel startete sie beim Schließen neu) und ohne Ebenenänderung (eine angehobene Seite malte
   durch den halbtransparenten Dialoghintergrund über die Karte). */
test("18 — Seiteneinblendung: nur Deckkraft und „backwards“; jede feste Ebene der Seite beendet sie sofort", () => {
  const SEITE = '[data-ce-bereich="kunde"] .main-content > :is(.page-body, .page-with-navbar)';
  const einblendung = REGELN.find(({ sel }) => sel === SEITE);
  assert.ok(einblendung, "die Regel der Seiteneinblendung fehlt");
  assert.match(einblendung.koerper, /animation:\s*ce-pr-seite\s+180ms\s+[^;]*\bbackwards\b/);
  assert.match(CSS, /@keyframes ce-pr-seite\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*\}/, "die Einblendung animiert mehr als die Deckkraft");

  const anheben = REGELN.find(({ sel }) => sel.startsWith(`${SEITE}:has(`));
  assert.ok(anheben, "eine offene Ebene beendet die Einblendung nicht");
  assert.match(anheben.koerper, /^\s*animation-duration:\s*0s;\s*$/, "erwartet: genau animation-duration: 0s");
  assert.match(anheben.sel, /\[aria-modal="true"\]/, "modale Ebenen (auch das Mitteilungsfenster) beenden die Einblendung nicht");

  // Jede fensterfüllende Ebene aus patterns.css (Dialoge, Schubladen) und die Ladeschicht des Angebotsvergleichs.
  const muster = ohneKommentare(lies(path.join(HIER, "patterns.css")));
  const gruppe = (anker) => {
    const m = muster.match(new RegExp(`([^{}]*\\.${anker}[^{]*)\\{[^}]*position:\\s*fixed;[^}]*inset:\\s*0`));
    return m ? [...m[1].matchAll(/\.([a-z-]+overlay)\b/g)].map((x) => x[1]) : [];
  };
  const ebenen = [...new Set([...gruppe("ce-dialog-overlay"), ...gruppe("ce-drawer-overlay"), "cmp-loading-overlay"])];
  assert.ok(ebenen.length >= 12, `fensterfüllende Ebenen nicht gelesen: ${ebenen.join(", ")}`);
  const fehlt = ebenen.filter((k) => !new RegExp(`\\.${k}\\b`).test(anheben.sel));
  assert.deepEqual(fehlt, [], `diese Ebenen blieben in der Einblendung gefangen: ${fehlt.join(", ")}`);
});
