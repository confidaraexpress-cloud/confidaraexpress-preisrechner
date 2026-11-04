// Struktur- und Gestaltungstests der Inhaltsabschnitte der Kundenübersicht
// (Redesign 2026-10).
//
// Bewusst quelltextnah, wie overviewKpiCards.test.mjs: das Repository hat kein
// jsdom und keine Renderbibliothek.
//
// Freigegebener Vertrag (Audit G/H01, Feinkorrektur 2026-10): Die Übersicht
// ist eine Arbeitsübersicht — Seitenkopf mit persönlicher Begrüßung „Guten
// Tag, [Name]", Datum/Einordnung und EINER Hauptaktion, Kennzahlenband,
// letzte Sendungen (mit Empfänger) und offene Rechnungen (≈ 2 : 1), Lager und
// Aufträge neben vorhandenen Meldungen, darunter „Ihre Versanddienstleister“.
//
// Komplettabschluss (Betreiberentscheidungen G1/G2, Audit B.4/B.5/B.10,
// 2026-10-27): die feste Navy-Werbefläche „Fünf Carrier. Eine zentrale
// Plattform.“ mit Laufzeiten ohne Beleg ist durch die Carrier aus
// GET /kunde/carriers ersetzt (keine feste Liste) — seit der UX-Korrektur C
// (Betreiberentscheidung 2026-10-27) wieder auf einer Navy-Fläche mit feinen
// Linien, ohne erfundene Angaben; „Lager und Aufträge“ zeigt
// den Stand des eigenen Lagers; die Onboarding-Abschnitte („Ablauf“ und die
// Funktionen Versand und Logistik) stehen ausschließlich für Konten OHNE
// operative Daten, als ruhiger Text ohne Symbole — die Zusicherungen ohne
// Beleg sind entfallen. Alle Daten lädt DashboardPage; Übersicht und Module
// laden nichts selbst.
//
// Geprüft wird weiterhin, was bei einer Umgestaltung tatsächlich kaputtgehen
// kann: Inhalte gehen verloren, die Vergleichsaktion verliert ihr Ziel, die
// Sichtbarkeitsregel der Onboardingtexte kippt, Daten/Routing ändern sich.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const overview = src("./Overview.jsx");
const code = stripComments(overview);
const modules = stripComments(src("./OverviewModules.jsx"));
const css = src("../../styles/overview.css");
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, "");

// Rumpf der ERSTEN Regel mit exakt diesem Selektor.
function rule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = cssBare.match(new RegExp(`(?:^|[};{])\\s*${esc}\\s*\\{([^}]*)\\}`, "m"));
  return m ? m[1] : null;
}
// Die Einträge eines Datenarrays aus Overview.jsx als Rohtext.
function array(name) {
  const start = code.indexOf(`const ${name} = [`);
  assert.ok(start > -1, `Datenarray ${name} nicht gefunden`);
  const ende = code.indexOf("\n];", start);
  assert.ok(ende > start, `Ende von ${name} nicht gefunden`);
  return code.slice(start, ende);
}
const STEPS = array("STEPS");
const FUNKTIONEN = array("FUNKTIONEN");
const zaehle = (block, re) => (block.match(re) || []).length;

// ══════════ Seitenaufbau ══════════

test("1 — Reihenfolge: Seitenkopf → Kennzahlen → Sendungen/Rechnungen → Lager und Meldungen → Versanddienstleister", () => {
  const pos = [
    code.indexOf("<PageHeader"),
    code.indexOf('<section className="ov-kpis"'),
    code.indexOf('<div className="ov-mod-grid">'),
    code.indexOf('<div className="ov-mod-grid ov-mod-grid--lager">'),
    code.indexOf("<InventorySnapshot"),
    code.indexOf("<OverviewNotifications"),
    code.indexOf("<CarrierPortfolio"),
  ];
  assert.ok(pos.every((p) => p > -1), `ein Baustein fehlt: ${JSON.stringify(pos)}`);
  assert.deepEqual([...pos].sort((a, b) => a - b), pos, "die Reihenfolge der Übersicht stimmt nicht");
});

test("2 — der Seitenkopf begrüßt persönlich, nennt Datum und Einordnung, GENAU eine Hauptaktion", () => {
  // Feinkorrektur 2026-10: „Guten Tag, [Name]" ist der Seitentitel. Der Name
  // kommt aus dem bestehenden Nutzerkontext (Name, sonst Firmenname); ohne
  // beides bleibt „Guten Tag" — kein Platzhaltername, keine Tageszeitlogik.
  assert.match(code, /const greetingName = String\(user\?\.name \|\| user\?\.company_name \|\| ""\)\.trim\(\);/,
    "der Name kommt nicht aus dem bestehenden Nutzerkontext");
  assert.match(code, /Guten Tag, <span className="ov-greeting-name">\{greetingName\}<\/span>/, "die Begrüßung mit Namen fehlt");
  assert.match(code, /: "Guten Tag"\}/, "ohne Namen fehlt die neutrale Begrüßung");
  assert.ok(!/Guten (Morgen|Abend)|getHours|"Kunde"/.test(code), "Tageszeitlogik oder Platzhaltername in der Begrüßung");
  // Komplettabschluss (G1, 2026-10-27): die Übersicht umfasst Versand UND Logistik — die Einordnung sagt beides.
  assert.match(code, /`\$\{todayLabel\} · Versand und Logistik im Überblick`/, "Datum und Einordnung fehlen in der Kontextzeile");
  assert.ok(!/Ihr Versand im Überblick/.test(code), "die Einordnung nennt nur den Versand");
  assert.equal(zaehle(code, /btn btn-primary/g), 1, "genau eine Hauptaktion erwartet");
  assert.match(code, /onClick=\{onNewShipment\}>\s*Neue Sendung/, "„Neue Sendung“ nutzt nicht den bestehenden Handler");
  // Kein Serifengruß, keine Chips: der Name ist nur über die Markentinte
  // hervorgehoben — dieselbe Schrift, dieselbe Größe, kein Kursiv.
  assert.ok(!/pp-pill|pp-h1|pp-hname/.test(code), "Serifengruß oder Chips sind zurück");
  const name = rule(".ov-greeting-name");
  assert.ok(name, ".ov-greeting-name fehlt");
  assert.match(name, /color:\s*var\(--ce-color-brand-ink\)/, "der Name trägt nicht die Markentinte");
  assert.ok(!/font-(family|style|size|weight)/.test(name), "der Name bekommt ein eigenes Schriftbild");
});

test("2b — Begrüßung (Betreiberentscheidung 2026-11-01): ein Satz in der Gruß-Skala, in jeder Stufe kleiner als die Seitentitel", () => {
  const editorial = src("../../styles/premium-editorial.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const variablen = src("../../styles/variables.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const kopf = ':root[data-ce-bereich="kunde"] .main-content:has(.ov-page) .ce-page-header-title {';
  const start = editorial.indexOf(kopf);
  assert.ok(start > -1, "die Regel der Begrüßung fehlt");
  const regel = editorial.slice(start, editorial.indexOf("}", start));
  assert.match(regel, /font-size: var\(--ce-pr-ed-gruss-size\);/, "die Begrüßung steht nicht in der Gruß-Skala");
  assert.match(regel, /font-weight: 500;/, "die Begrüßung ist wieder ein fetter Titel");
  assert.match(regel, /font-stretch: 100%;/, "die Begrüßung steht nicht in normaler Breite");
  // Jede Stufe der Titelskala hat ihre Gruß-Stufe in derselben Medienabfrage (em: greift auch bei großer Grundschrift).
  for (const [stufe, gruss] of [["68.75em", "tablet"], ["37.5em", "mobile"]]) {
    const block = editorial.slice(editorial.indexOf(`@media (max-width: ${stufe}) {`));
    assert.match(block.slice(0, block.indexOf("\n}")),
      new RegExp(`\\.main-content:has\\(\\.ov-page\\) \\.ce-page-header-title \\{ font-size: var\\(--ce-pr-ed-gruss-size-${gruss}\\); \\}`),
      `die Gruß-Stufe ${gruss} fehlt`);
  }
  // Kleiner als der Seitentitel derselben Stufe; die übrigen Seiten behalten die Titelskala.
  const rem = (name) => parseFloat(variablen.match(new RegExp(`--${name}:\\s*([\\d.]+)rem;`))[1]);
  for (const stufe of ["", "-tablet", "-mobile"]) {
    assert.ok(rem(`ce-pr-ed-gruss-size${stufe}`) < rem(`ce-pr-ed-headline-size${stufe}`), `Gruß${stufe} ist nicht kleiner als der Seitentitel`);
  }
  // Gruß und Name sprechen mit einer Stimme: der Name erbt Farbe und Gewicht.
  assert.match(editorial, /\.ce-page-header-title \.ov-greeting-name \{ color: inherit; font-weight: inherit; \}/);
  // Feinschliff (2026-11-01): Die Datums- und Einordnungszeile steht im Nebentext statt im gedämpften Ton, in derselben Größe.
  const zeileKopf = ':root[data-ce-bereich="kunde"] .main-content:has(.ov-page) .ce-page-header-sub {';
  const zeile = editorial.slice(editorial.indexOf(zeileKopf), editorial.indexOf("}", editorial.indexOf(zeileKopf)));
  assert.match(zeile, /color: var\(--ce-color-text-secondary\);/, "die Datumszeile steht nicht im Nebentext");
  assert.match(zeile, /font-size: var\(--ce-text-label-size\);/, "die Datumszeile hat ihre Größe geändert");
});

test("2c — Premium-Dashboard V2 (2026-11-01): getönte Fläche nur auf der Übersicht, ein Kartenmaterial, Köpfe ohne Linie", () => {
  const editorial = src("../../styles/premium-editorial.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const variablen = src("../../styles/variables.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const regel = (sel) => {
    const kopf = `:root[data-ce-bereich="kunde"] ${sel} {`;
    const i = editorial.indexOf(kopf);
    return i < 0 ? "" : editorial.slice(i + kopf.length, editorial.indexOf("}", i));
  };
  // Die kräftige Fläche gilt nur für den Inhaltsbereich der Übersicht; Seitenleiste und Navigation bleiben, wie sie sind, die
  // übrigen Kundenseiten tragen seit dem Betreiberauftrag 2026-11-02 die leise Arbeitsfläche (Test 2f).
  // Seit Flow Signature V2 (Betreiberauftrag 2026-11-01: „weniger blass“) ein kühles, helles Blau statt Grau-Blau, seit V3
  // (2026-11-02: „Hintergrund etwas stärker“) eine Stufe blauer, seit der Betreiberentscheidung vom 2026-11-04 (Ü-V1) im
  // Verhältnis der Arbeitsfläche dezent heller — gedämpfter Text darauf ≥ 4,6:1 (4,81:1).
  assert.match(regel(".main-content:has(.ov-page)"), /background: var\(--ce-pr-ed-flaeche-uebersicht\);/);
  assert.match(variablen, /--ce-pr-ed-flaeche-uebersicht:\s*#eef3fc;/);
  assert.equal((editorial.match(/var\(--ce-pr-ed-flaeche-uebersicht\)/g) || []).length, 1, "die Fläche hängt an einem weiteren Selektor");
  // Die Suche steht auf jeder getönten Fläche sichtbar als weiße Kapsel mit Haarlinie statt der Mulde — seit 2026-11-02 in
  // einer Regel für den ganzen Kundenbereich (die Mulde wäre auf der Arbeitsfläche heller als der Grund und ohne Kante).
  assert.match(regel(".ce-suche"), /border-color: var\(--ce-pr-hairline\);/);
  assert.match(regel(".ce-suche"), /background: var\(--ce-color-surface\);/);
  assert.ok(!editorial.includes(".main-content:has(.ov-page) .ce-suche"), "die Übersicht trägt wieder eine eigene Suche");
  // Modulköpfe ohne Linie, alle Modultitel in einer Größe.
  assert.match(regel(".ov-mod-head"), /border-bottom: 0;/, "ein Modulkopf trägt wieder eine Linie");
  assert.match(regel(".ov-mod-title"), /font-size: var\(--ce-pr-ed-modul-titel\);/);
  assert.ok(!editorial.includes(".ov-mod-grid--lager .ov-mod-title {"), "die zweite Reihe hat wieder eine eigene Titelgröße");
  // Jede vorhandene Modulkarte im gemeinsamen Material; keine Mulde mehr in der zweiten Reihe.
  const material = regel(".ov-page .ov-mod > .ov-card");
  for (const d of ["border: 1px solid var(--ce-pr-hairline);", "border-radius: var(--ce-pr-radius-card);",
    "background: var(--ce-color-surface);", "box-shadow: var(--ce-pr-ed-shadow-flaeche);"]) {
    assert.ok(material.includes(d), `Modulkarte ohne ${d}`);
  }
  assert.ok(!/\.ov-mod-grid--lager \.ov-card \{[^}]*--ce-pr-inset/.test(editorial), "die zweite Reihe steht wieder als Mulde");
  // Die Sendungsliste bleibt eine Liste: Zeilen zwischen Haarlinien, keine Karte je Sendung.
  assert.match(regel(".ov-list--sendungen .ov-list-row"), /border-bottom: 1px solid var\(--ce-pr-hairline\);/);
  assert.ok(!/\.ov-list--sendungen \.ov-list-row \{[^}]*(box-shadow|border-radius)/.test(editorial), "eine Sendung steht als eigene Karte");
  // Kein zusätzliches Markup: dieselben vier Kartenhüllen wie bisher.
  assert.equal((src("./OverviewModules.jsx").match(/className="ce-card ov-card/g) || []).length, 4, "die Zahl der Kartenhüllen hat sich geändert");
});

test("2d — Confidara Flow Signature, Abschluss (2026-11-02): blaue Markenatmosphäre nur auf der Übersicht, ohne Ebene und Bewegung; keine CE-Monogramme, das Licht an den Aktionen", () => {
  const editorial = src("../../styles/premium-editorial.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const variablen = src("../../styles/variables.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const regeln = [...editorial.replace(/@(media|supports|container)[^{]+\{/g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim(), koerper: m[2] }));
  const ÜBERSICHT = /^:root\[data-ce-bereich="kunde"\] (\.main-content:has\(\.ov-page\)|\.ov-page \.ov-carrier-(zeile|eintrag|liste)|\.ov-page :is\(\.ov-carrier-logo)/;

  // Jede Regel, die ein Flow-Token liest, gehört zur Übersicht: ihre Fläche, Kopfleiste, Seitenkopf, Fuß oder Navy-Bühne.
  const flow = regeln.filter((r) => r.koerper.includes("--ce-pr-ed-flow-"));
  assert.ok(flow.length >= 8, "die Flow-Regeln fehlen");
  for (const { sel, koerper } of flow) {
    assert.match(sel, ÜBERSICHT, `${sel}: Flow-Token außerhalb der Übersicht`);
    assert.doesNotMatch(koerper, /\b(animation|transition)\s*:/, `${sel}: Bewegung im Hintergrund`);
  }
  // Die Fläche bleibt reine Hintergrundmalerei: kein Stapelkontext (feste Dialoge, Aufklapper der Kopfleiste).
  for (const { koerper } of regeln.filter((r) => r.sel === ':root[data-ce-bereich="kunde"] .main-content:has(.ov-page)')) {
    assert.doesNotMatch(koerper, /\b(isolation|transform|filter|opacity|z-index|contain|will-change|mask(-image)?|position)\s*:/,
      "die Fläche der Übersicht öffnet einen Stapelkontext oder eine Ebene");
  }
  // Drei Zonen in den Blautönen der Marke: oben Band, Wolke, Azur-Himmel, Kobaltfeld an der Aktion und eine flache Weite
  // über den Kennzahlen; die Mitte bindet die Zonen mit Lichtbahn, Flanke an der Seitenleiste, Lichtwolke, Azurlicht und
  // Azur-Säule; unten Kobalthof und Schein um die Bühne und Navy-Boden. Radiale Verläufe statt waagrechter Kanten.
  const flaeche = regeln.find((r) => r.sel === ':root[data-ce-bereich="kunde"] .main-content:has(.ov-page)' && r.koerper.includes("background-image"));
  for (const t of ["schein", "weite", "azur", "wolke", "nebel", "bahn", "flanke", "licht", "mitte", "rand", "hof", "glut", "boden"]) {
    assert.ok(flaeche.koerper.includes(`var(--ce-pr-ed-flow-${t})`), `die Fläche liest --ce-pr-ed-flow-${t} nicht`);
  }
  // Abschluss (Betreiberentscheidung 2026-11-02): Ohne CE gibt es keinen Lichtkern mehr — im freien Feld läse er sich als
  // leuchtende Blase an der früheren Stelle des Zeichens. Das Kobaltfeld steht auf der Mitte von „Neue Sendung“, Weite und
  // Lichtbahn auf ihrer Achse; beide hängen am rechten Inhaltsrand aus Rahmen und Seitenrand, nicht an einer Prozentlage.
  assert.doesNotMatch(editorial + variablen, /--ce-pr-ed-flow-(kern|licht-oben|buehne-kern)\b/, "ein Lichtkern der früheren CE-Monogramme ist zurück");
  for (const [name, token] of [["--ov-licht-x", "licht-rechts"], ["--ov-aktion-x", "licht-aktion"]]) {
    assert.ok(flaeche.koerper.includes(`${name}: calc(100% - max(var(--shell-gutter, var(--ce-page-gutter)), (100% - var(--ce-size-content)) / 2) - var(--ce-pr-ed-flow-${token}));`),
      `${name} hängt nicht am rechten Inhaltsrand`);
  }
  for (const [x, hoehe] of [["--ov-aktion-x", "schein-oben"], ["--ov-licht-x", "weite-oben"]]) {
    assert.equal((flaeche.koerper.match(new RegExp(`at var\\(${x}\\) var\\(--ce-pr-ed-flow-${hoehe}\\)`, "g")) || []).length, 1,
      `Kobaltfeld bzw. Weite stehen nicht an ihrer Achse (${x}, ${hoehe})`);
  }
  const schmalStart = editorial.indexOf("@media (min-width: 1024px) and (max-width: 85.3125em) {");
  const schmalerDesktop = editorial.slice(schmalStart, editorial.indexOf("@media (min-width: 1024px) and (max-width: 68.75em) {", schmalStart));
  assert.ok(schmalStart > -1 && schmalerDesktop.length > 0, "die Fassung des schmalen Desktops fehlt");
  assert.match(schmalerDesktop, /radial-gradient\(22rem 12rem at var\(--ov-aktion-x\) var\(--ce-pr-ed-flow-schein-oben\), var\(--ce-pr-ed-flow-schein-schmal\)/,
    "auf dem schmalen Desktop steht das Kobaltfeld nicht an der Aktion");
  // Chromium verwirft min(), max(), clamp() und calc() mit gemischten Einheiten in der Größe eines radialen Verlaufs — mit
  // var() in derselben Deklaration fiele der ganze Hintergrund still weg (gemessen: nur noch die Flächenfarbe).
  for (const { sel, koerper } of flow) {
    for (const [, groesse] of koerper.matchAll(/radial-gradient\(([^,]*?) at /g)) {
      assert.doesNotMatch(groesse, /\b(min|max|clamp|calc)\(/, `${sel}: Rechenfunktion in der Größe eines radialen Verlaufs`);
    }
  }
  // Präziser Glow (V4): Kobaltfelder, Weiten, Lichtbahn und Bühnenlicht sind Verlaufslisten mit weichem Auslauf
  // (Farbe und Zwischenstopps) statt einer Farbe mit linearem Abfall — und jeder Verlauf endet danach transparent.
  for (const t of ["schein", "weite", "weite-schmal", "schein-schmal", "schein-aktion", "schein-mobil", "bahn", "bahn-schmal", "buehne-schein"]) {
    const wert = (variablen.match(new RegExp(`--ce-pr-ed-flow-${t}:([^;]*);`)) || [])[1] || "";
    assert.ok((wert.match(/rgba\(/g) || []).length >= 2, `--ce-pr-ed-flow-${t} ist keine Verlaufsliste mit weichem Auslauf`);
    const nutzungen = [...editorial.matchAll(new RegExp(`var\\(--ce-pr-ed-flow-${t}\\)([^)]*\\))`, "g"))].map((m) => m[1]);
    assert.ok(nutzungen.length > 0, `--ce-pr-ed-flow-${t} wird nicht gelesen`);
    for (const rest of nutzungen) assert.match(rest, /^, transparent \d+%\)$/, `--ce-pr-ed-flow-${t}: der Verlauf endet nicht transparent`);
  }
  // Tokens nur in der Familie --ce-pr-ed-* (der Preisrechner-Build filtert sie heraus).
  for (const name of ["nebel-oben", "nebel", "nebel-mobil", "stahl", "wolke", "wolke-mobil", "schein", "weite", "weite-schmal", "schein-schmal",
    "schein-aktion", "schein-mobil", "azur", "azur-schmal", "bahn", "bahn-schmal", "flanke", "flanke-schmal", "licht", "mitte", "mitte-mobil", "rand", "hof",
    "hof-schmal", "glut", "boden", "boden-schmal", "licht-aktion", "licht-rechts", "schein-oben", "weite-oben",
    "kopf-linie", "buehne-grund", "buehne-schein", "buehne-tiefe", "buehne-horizont", "buehne-glanz", "buehne-licht-rechts", "route", "kachel"]) {
    assert.match(variablen, new RegExp(`--ce-pr-ed-flow-${name}:`), `--ce-pr-ed-flow-${name} fehlt`);
  }
  assert.doesNotMatch(variablen, /--ce-flow-|--flow-/, "Flow-Tokens außerhalb der Familie --ce-pr-ed-*");

  // Keine dekorativen CE-Monogramme (Betreiberentscheidung 2026-11-02): kein Zeichen im Kopf und auf der Bühne, keine
  // Marke auf schmalen Seiten, keine Ankerfläche, keine Zeichnungsdateien. Das offizielle Logo (assets/brand, BrandLogo)
  // ist davon nicht berührt und steht weiter in Seiten- und Mobilleiste.
  const roh = src("../../styles/premium-editorial.css");
  assert.doesNotMatch(editorial, /anchor-name|anchor\(|--ov-flow/, "das Ankerfeld des früheren CE im Kopf ist zurück");
  assert.ok(!regeln.some((r) => /\.ce-page-header-main::(before|after)$/.test(r.sel) && r.sel.includes(".ov-page")),
    "der Seitenkopf der Übersicht trägt wieder eine Ebene");
  assert.ok(!regeln.some((r) => /\.ov-carrier-zeile::(before|after)$/.test(r.sel)), "die Navy-Bühne trägt wieder eine Ebene (CE oder Marke)");
  assert.doesNotMatch(editorial, /signatur-ce|assets\/overview\//, "eine CE-Zeichnung wird wieder geladen");
  assert.equal(existsSync(new URL("../../assets/overview/", import.meta.url)), false, "der Ordner der CE-Zeichnungen ist zurück");
  for (const datei of readdirSync(new URL("../../styles/", import.meta.url)).filter((d) => d.endsWith(".css"))) {
    assert.doesNotMatch(src(`../../styles/${datei}`), /signatur-ce|assets\/overview\//, `${datei}: lädt eine CE-Zeichnung`);
  }
  // Kopflinie: auf dem Blau in Navy statt hellem Grau, über die ganze Breite (kein Auslauf vor einem Zeichen).
  const kopf = regeln.filter((r) => r.sel === ':root[data-ce-bereich="kunde"] .main-content:has(.ov-page) .ce-page-header-main');
  assert.ok(kopf.some((r) => r.koerper.includes("border-bottom-color: var(--ce-pr-ed-flow-kopf-linie);")), "die Kopflinie steht hell auf dem Blau");
  assert.ok(!kopf.some((r) => /border-bottom-color: transparent|background:/.test(r.koerper)), "die Kopflinie läuft vor einem früheren Zeichen aus");

  // Unten: die Navy-Bühne in abgestuftem Navy mit Kobaltlicht an „Preise vergleichen“ (Achse 85 px) und Azur-Horizont —
  // ohne Kern und ohne Zeichen.
  const buehnen = regeln.filter((r) => r.sel === ':root[data-ce-bereich="kunde"] .ov-page .ov-carrier-zeile' && r.koerper.includes("--ce-pr-ed-flow-buehne-grund"));
  const buehne = buehnen[0];
  for (const t of ["buehne-grund", "buehne-schein", "buehne-horizont"]) {
    assert.ok(buehne && buehne.koerper.includes(`var(--ce-pr-ed-flow-${t})`), `die Navy-Bühne verliert --ce-pr-ed-flow-${t}`);
  }
  assert.ok(buehne.koerper.includes("radial-gradient(24rem 14rem at calc(100% - var(--ce-pr-ed-flow-buehne-licht-rechts)) 5.3125rem, var(--ce-pr-ed-flow-buehne-schein), transparent 72%)"),
    "das Bühnenlicht steht nicht auf der Achse von „Preise vergleichen“");
  // Die Mitte von „Preise vergleichen“ liegt knapp 8rem vor der rechten Kante (gemessen 7,9rem); das frühere Licht am C
  // (17,75rem) stand im freien Feld neben dem Hinweis.
  const lichtRechts = Number((variablen.match(/--ce-pr-ed-flow-buehne-licht-rechts:\s*([\d.]+)rem;/) || [])[1]);
  assert.ok(lichtRechts >= 6 && lichtRechts <= 10, `das Bühnenlicht steht ${lichtRechts}rem vor der Kante statt auf der Aktion`);
  // Jede Fassung der Bühne (breit, schmal, gestapelt) setzt nach der Kurzschreibweise ihre Flächenfarbe: ohne sie prüft
  // axe den Kontrast gegen Weiß.
  assert.ok(buehnen.length >= 3, "eine Fassung der Bühne fehlt");
  for (const b of buehnen) assert.match(b.koerper, /background-color: var\(--ce-pr-navy-900\);/, "ohne Flächenfarbe prüft axe den Kontrast gegen Weiß");
  // Schmaler als 65,75rem steht das Bühnenlicht in der Ecke über der Aktion (auf der Aktion läge es hinter dem Hinweis:
  // in V2 gemessen 3,9:1), gestapelt (bis 720 px) ebenfalls in der Ecke — nach der Containerregel, damit sie sie überstimmt.
  const schmal = roh.slice(roh.indexOf("@container ce-seite (width < 65.75rem) {"), roh.indexOf("@container ce-seite (width >= 65.75rem) {"));
  assert.ok(schmal.includes("at calc(100% - 2.05rem) 1.55rem, var(--ce-pr-ed-flow-buehne-schein)"), "schmale Bühne ohne Licht in der Ecke");
  assert.ok(roh.lastIndexOf("at calc(100% - 1.8rem) 1.1rem, var(--ce-pr-ed-flow-buehne-schein)") > roh.indexOf("(width < 65.75rem)"),
    "die gestapelte Bühne steht vor der Containerregel oder ohne Licht in der Ecke");
  // Route durch die Kacheln: eine Lichtlinie hinter den Kacheln, nur in der einreihigen Bühne, nie klickbar.
  assert.match(roh, /@container ce-seite \(width >= 65\.75rem\) \{\s*:root\[data-ce-bereich="kunde"\] \.ov-page \.ov-carrier-liste \{ position: relative; \}/,
    "die Route durch die Kacheln hängt nicht an der einreihigen Bühne");
  const route = regeln.find((r) => r.sel === ':root[data-ce-bereich="kunde"] .ov-page .ov-carrier-liste::before');
  for (const d of ['content: "";', "position: absolute;", "height: 1px;", "z-index: -1;", "pointer-events: none;", "background: var(--ce-pr-ed-flow-route);"]) {
    assert.ok(route && route.koerper.includes(d), `Route durch die Kacheln ohne ${d}`);
  }
  // Daneben die feinen geschwungenen Linien der früheren Fläche (Betreiberentscheidung 2026-11-04): genau die Geometrie
  // bis zum Abschluss (c00a87e^, aus 38d6f10) — drei Routen, drei Lichtknoten, statisch, keine Bewegung (Test 14).
  const linien = modules.slice(modules.indexOf("function CarrierLinien"), modules.indexOf("export function CarrierPortfolio"));
  for (const d of ["M-40 318 C 220 250, 340 120, 620 150 S 1000 250, 1260 118", "M-40 178 C 260 128, 420 300, 700 300 S 1020 158, 1260 212",
    "M120 430 C 300 330, 560 380, 780 250 S 1080 60, 1240 38"]) {
    assert.ok(linien.includes(`d="${d}"`), `die Route ${d.slice(0, 14)}… fehlt oder ist verändert`);
  }
  for (const k of ['cx="620" cy="150" r="3"', 'cx="700" cy="300" r="3"', 'cx="780" cy="250" r="3.5"']) {
    assert.ok(linien.includes(`<circle ${k} />`), `der Lichtknoten ${k} fehlt oder ist verändert`);
  }
  assert.equal((linien.match(/<path /g) || []).length, 3, "nicht genau drei Routen");
  assert.equal((linien.match(/<circle /g) || []).length, 3, "nicht genau drei Lichtknoten");
  assert.doesNotMatch(linien, /<animate|<set |animation|transition/, "die Linien bewegen sich");
  assert.doesNotMatch(cssBare.slice(cssBare.indexOf(".ov-carrier-linien {"), cssBare.indexOf(".ov-carrier-kopf {")), /animation|transition|transform/,
    "die Linien bewegen sich");
});

test("2e — Confidara Flow Signature (2026-11-01): Datenflächen ruhig und einheitlich, Fuß und Kopfleiste ohne harte Kante", () => {
  const editorial = src("../../styles/premium-editorial.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const regel = (sel) => (editorial.match(new RegExp(`:root\\[data-ce-bereich="kunde"\\] ${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`)) || [])[1] || "";
  // Status in einer Form: jede Angabe der Sendungsliste als Kapsel mit Haarlinie; Ausnahmen behalten ihre Tönung
  // (die weiße Fläche gilt nur für die ruhigen Angaben), die Kante steht im eigenen Ton.
  const kapsel = regel(".ov-page .ov-list--sendungen .badge");
  for (const d of ["border: 1px solid var(--ce-pr-hairline);", "border-radius: var(--ce-radius-full);"]) assert.ok(kapsel.includes(d), `Statuskapsel ohne ${d}`);
  assert.ok(!/background:/.test(kapsel), "die weiße Fläche überdeckt die Tönung der Ausnahmen");
  assert.match(editorial, /\.ov-page \.ov-list--sendungen \.badge:not\(\.badge--warning, \.badge-yellow, \.badge--overdue, \.badge--error, \.badge-red, \.badge--blocked\) \{\s*background: var\(--ce-color-surface\);/);
  // Carrier-Logos optisch gleich groß — dieselben Faktoren wie auf der Bühne, die Marke kommt aus der Zuordnung.
  assert.match(modules, /<span className="ov-list-carrier" data-marke=\{c\.name\}>/, "die Logoangleichung braucht die Marke am Eintrag");
  for (const [marke, faktor] of [["UPS", "1.3"], ["DPD", "1.15"], ["TNT", "1.25"]]) {
    assert.ok(regel(`.ov-page .ov-list-carrier[data-marke="${marke}"] .ov-list-carrier-logo`).includes(`scale: ${faktor};`), `${marke}: Logo nicht angeglichen`);
    assert.match(css, new RegExp(`\\.ov-carrier-eintrag\\[data-carrier="${marke.toLowerCase()}"\\] \\{ --ov-logo-optik: ${faktor.replace(".", "\\.")}; \\}`), `${marke}: Faktor weicht von der Bühne ab`);
  }
  // „Neu“ als leise Signal-Marke (kein Navy-Block), Überfälligkeit deutlicher als Kapsel mit Kante.
  const neu = regel(".ov-ntf-new");
  assert.ok(neu.includes("background: var(--ce-pr-signal-soft);") && neu.includes("color: var(--ce-pr-signal-ink);"), "„Neu“ ist keine Signal-Marke");
  assert.ok(!neu.includes("--ce-pr-navy-800"), "„Neu“ steht wieder als Navy-Block");
  assert.ok(regel(".ov-page .ov-inv-overdue .badge--overdue").includes("border: 1px solid color-mix(in srgb, currentColor 24%, transparent);"));
  // Kopfleiste und Fuß: leise statt harter Kante quer durch das Licht.
  assert.ok(regel(".main-content:has(.ov-page) .ce-page-header-utility").includes("border-bottom-color: var(--ce-pr-ed-flow-kopfleiste-linie);"));
  const fuss = regel(".main-content:has(.ov-page) > .app-footer");
  assert.ok(fuss.includes("border-top-color: transparent;") && fuss.includes("background: var(--ce-pr-ed-flow-fuss-linie) top / 100% 1px no-repeat;"), "der Fuß trägt wieder eine Kante über die ganze Breite");
});

test("2f — Premium Workspace (Betreiberauftrag 2026-11-02): jede übrige Kundenseite auf der leisen blauen Arbeitsfläche, die Übersicht ersetzt sie vollständig", () => {
  const editorial = src("../../styles/premium-editorial.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const variablen = src("../../styles/variables.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const bereich = variablen.slice(variablen.indexOf(':root[data-ce-bereich="kunde"],'));
  const tok = (name) => ((bereich.match(new RegExp(`--${name}:\\s*([^;]+);`)) || [])[1] || "").trim();
  const KUNDE = ':root[data-ce-bereich="kunde"]';
  const regeln = [...editorial.replace(/@(media|supports|container)[^{]+\{/g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim(), koerper: m[2] }));

  // Eine Fläche für den ganzen Kundenbereich: .main-content beider Kunden-Shells, nur unter data-ce-bereich="kunde" — Admin,
  // Partnerportal, Anmeldung und öffentlicher Preisrechner setzen diesen Bereich nie (hooks/useCeBereich.js).
  const raum = regeln.filter((r) => r.sel === `${KUNDE} .main-content`);
  assert.equal(raum.length, 2, "Arbeitsfläche und ihre schmale Fassung (unter 1024 px) erwartet");
  assert.match(raum[0].koerper, /background: var\(--ce-pr-ed-raum-flaeche\);/);
  assert.match(raum[0].koerper, /background-repeat: no-repeat;/);
  for (const shell of ["../layout/DashboardLayout.jsx", "../../pages/DashboardPage.jsx"]) {
    const shellCode = stripComments(src(shell));
    assert.match(shellCode, /useCeBereich\("kunde"\)/, `${shell}: ohne Bereich „kunde“`);
    assert.match(shellCode, /<main className="main-content">/, `${shell}: ohne .main-content`);
  }
  // Dokument und Shell bleiben weiß, getönt ist nur die Inhaltsfläche; Raum-Tokens liest nur die Arbeitsfläche selbst und
  // ihre Kopfleiste — keine Seite bekommt eine eigene Fassung.
  assert.ok(regeln.some((r) => r.sel === `${KUNDE} :is(body, .app-shell)` && r.koerper.includes("background: var(--ce-color-surface);")));
  assert.ok(!regeln.some((r) => r.sel.includes(":is(body, .app-shell, .main-content)")), "die Inhaltsfläche ist wieder weißes Papier");
  for (const { sel } of regeln.filter((r) => r.koerper.includes("--ce-pr-ed-raum-"))) {
    assert.ok([`${KUNDE} .main-content`, `${KUNDE} .ce-page-header-utility`].includes(sel), `${sel}: Raum-Token außerhalb der Arbeitsfläche`);
  }
  assert.ok(regeln.some((r) => r.sel === `${KUNDE} .ce-page-header-utility` && r.koerper.includes("border-bottom: 1px solid var(--ce-pr-ed-raum-kopfleiste-linie);")),
    "die Kopfleiste trägt wieder die graue Haarlinie (im Band ein Lichtstreifen)");

  // Reine Hintergrundmalerei: keine Ebene, kein Stapelkontext, keine Bewegung, keine Zeichnung (kein CE, keine Route).
  for (const { koerper } of raum) {
    assert.doesNotMatch(koerper, /\b(isolation|transform|filter|opacity|z-index|contain|will-change|mask(-image)?|position|animation|transition)\s*:/,
      "die Arbeitsfläche öffnet einen Stapelkontext, eine Ebene oder bewegt sich");
    assert.doesNotMatch(koerper, /url\(/, "eine Zeichnung auf der Arbeitsfläche");
    for (const [, groesse] of koerper.matchAll(/radial-gradient\(([^,]*?) at /g)) {
      assert.doesNotMatch(groesse, /\b(min|max|clamp|calc)\(/, "Rechenfunktion in der Größe eines radialen Verlaufs (Test 2d)");
    }
  }
  // Wenige große, weiche Lichtflächen: Band oben, Schimmer rechts oben, Wolke links oben, Auslauf unten — in beiden
  // Fassungen genau diese vier. Kein Licht mitten in der Seite hinter Formularen und Tabellen: Lagen nur oben (rem) oder am
  // unteren Rand (100 %). Jede Lichtfläche ist eine Verlaufsliste, die transparent endet.
  for (const { koerper } of raum) {
    const bilder = koerper.slice(koerper.indexOf("background-image:"));
    assert.equal((bilder.match(/(radial|linear)-gradient\(/g) || []).length, 4, "nicht genau vier Lichtflächen");
    for (const t of ["schimmer", "wolke", "band", "auslauf"]) assert.ok(bilder.includes(`var(--ce-pr-ed-raum-${t})`), `--ce-pr-ed-raum-${t} fehlt`);
    for (const [, lage] of bilder.matchAll(/ at ([^,]+),/g)) {
      const y = lage.trim().split(/\s+/)[1];
      assert.ok(y === "100%" || /^-?[\d.]+rem$/.test(y), `Licht mitten in der Seite (${lage.trim()})`);
    }
  }
  for (const t of ["schimmer", "wolke", "auslauf"]) {
    assert.ok((tok(`ce-pr-ed-raum-${t}`).match(/rgba\(/g) || []).length >= 2, `--ce-pr-ed-raum-${t} ist keine Verlaufsliste`);
    for (const [, rest] of editorial.matchAll(new RegExp(`var\\(--ce-pr-ed-raum-${t}\\)([^)]*\\))`, "g"))) {
      assert.match(rest, /^, transparent \d+%\)$/, `--ce-pr-ed-raum-${t}: der Verlauf endet nicht transparent`);
    }
  }
  // Dieselbe Familie, jede Zone leiser als ihre Entsprechung auf der Übersicht; nur die Blautöne der Marke; der Grund
  // heller als die Fläche der Übersicht und doch nicht weiß.
  const dichte = (wert) => Math.max(...[...wert.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map((m) => Number(m[1])));
  for (const [r, f] of [["schimmer", "azur"], ["wolke", "wolke"], ["auslauf", "glut"]]) {
    assert.ok(dichte(tok(`ce-pr-ed-raum-${r}`)) < dichte(tok(`ce-pr-ed-flow-${f}`)), `--ce-pr-ed-raum-${r} ist nicht leiser als --ce-pr-ed-flow-${f}`);
    for (const [, rot, gruen, blau] of tok(`ce-pr-ed-raum-${r}`).matchAll(/rgba\((\d+), (\d+), (\d+),/g)) {
      assert.ok(["0,74,252", "77,132,255", "127,156,207"].includes(`${rot},${gruen},${blau}`), `--ce-pr-ed-raum-${r}: Farbe außerhalb der Markenblautöne`);
    }
  }
  const summe = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255); };
  const grund = tok("ce-pr-ed-raum-flaeche");
  assert.match(grund, /^#[0-9a-f]{6}$/);
  assert.ok(summe(grund) > summe(tok("ce-pr-ed-flaeche-uebersicht")) && summe(grund) < 3 * 255, "der Grund ist nicht heller als die Übersicht oder schon weiß");
  // Text auf Grund und Band: Tinte, Nebentext und gedämpfter Text mindestens 4,6:1 (im Browser über alle Textzeilen der
  // Kundenseiten gemessen: schlechtester Wert 4,69:1).
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return [16, 8, 0].map((s) => ((n >> s) & 255) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
  const kontrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const flaeche of [grund, tok("ce-pr-ed-raum-band")]) {
    for (const text of ["ce-color-text-primary", "ce-color-text-secondary", "ce-color-text-muted"]) {
      assert.ok(kontrast(tok(text), flaeche) >= 4.6, `${text} auf ${flaeche} unter 4,6:1`);
    }
  }
  // Die Übersicht ersetzt die Fläche vollständig: Ihre Regel setzt den Grund in der Kurzform (sie löscht damit jedes Bild der
  // Arbeitsfläche) und ihre eigenen Bilder — nie zwei Fassungen übereinander; den Wechsel trägt :has(), keine Klasse.
  const signatur = regeln.find((r) => r.sel === `${KUNDE} .main-content:has(.ov-page)` && r.koerper.includes("background-image"));
  assert.match(signatur.koerper, /background: var\(--ce-pr-ed-flaeche-uebersicht\);\s*background-image:/);
});

test("3 — Sendungen und Rechnungen stehen ≈ 2 : 1 nebeneinander, darunter einspaltig", () => {
  assert.equal(rule(".ov-mod-grid").match(/grid-template-columns:\s*([^;]+)/)[1].trim(),
    "minmax(0, 2fr) minmax(0, 1fr)");
  assert.match(cssBare, /@media \(max-width: 1120px\) \{[\s\S]*?\.ov-mod-grid \{ grid-template-columns: minmax\(0, 1fr\);/,
    "unterhalb von 1120 px stehen die Module nicht untereinander");
});

test("4 — jedes Modul ist über aria-labelledby mit seiner Überschrift verbunden", () => {
  for (const id of ["ov-ship-title", "ov-inv-title", "ov-ntf-title", "ov-lager-title", "ov-car-title"]) {
    assert.ok(modules.includes(`aria-labelledby="${id}"`), `aria-labelledby ${id} fehlt`);
    assert.ok(modules.includes(`id="${id}"`), `Überschrift mit id ${id} fehlt`);
  }
});

// ══════════ Letzte Sendungen ══════════

test("5 — Letzte Sendungen: Nummer/Datum, Empfänger, Carrier, Status, Preis — keine redundante „Öffnen“-Aktion", () => {
  const block = modules.slice(modules.indexOf("export function RecentShipments"), modules.indexOf("export function OpenInvoices"));
  assert.match(block, /recentShipments\(shipments, 4\)/, "die Auswahl der letzten vier Sendungen hat sich geändert");
  // Audit B.4 (2026-10-27): der Empfänger steht mit in der Zeile — aus recipient_address der Kundenliste
  // (utils/shipmentRecipientView.mjs), ohne Angabe „—“; der Carrier mit Logo (CarrierMarke).
  for (const teil of ["orderConfirmationNumber", "<CarrierMarke raw={s.selected_carrier} />", "dateDE(s.created_at)",
    "<StatusBadge status={s.status} />", "money(s.price_final)", "shipmentRecipient(s)", 'empfaenger?.name || "—"']) {
    assert.ok(block.includes(teil), `${teil} fehlt in der Zeile`);
  }
  // Die frühere Zeilenaktion führte zur ganzen Liste — dasselbe Ziel wie
  // „Alle Sendungen". Sie ist entfallen (Audit P1 Aktionssemantik).
  assert.ok(!/Öffnen/.test(block), "die redundante „Öffnen“-Aktion ist zurück");
  assert.ok(!/onOpen/.test(block), "eine Zeilenaktion ohne eigenes Ziel ist zurück");
  assert.match(block, /actionLabel="Alle Sendungen"/, "„Alle Sendungen“ fehlt");
  // Kein eigener Empfängertext: die Zeile liest nur die gemeinsame Abbildung, nie die Rohfelder.
  assert.ok(!/recipient_address|recipientAddress/.test(block), "die Zeile liest die Empfängerfelder wieder direkt");
});

test("6 — Status und Betrag stehen als ganze Einheiten (kein Umbruch im Wort)", () => {
  assert.match(rule(".ov-list-status"), /flex:\s*none/, "der Status darf nicht gestaucht werden");
  assert.match(rule(".ov-list-num"), /flex:\s*none/, "der Betrag darf nicht gestaucht werden");
  assert.match(modules, /className="ov-list-num ce-num"/, "der Betrag ist keine Zahlenspalte");
});

// ══════════ Offene Rechnungen und Meldungen ══════════

test("7 — Offene Rechnungen kommen unverändert aus der Serversummary", () => {
  const block = modules.slice(modules.indexOf("export function OpenInvoices"), modules.indexOf("export function OverviewNotifications"));
  assert.match(block, /overviewInvoiceFacts\(invoices, summary\)/, "die Rechnungsquelle wurde verändert");
  assert.match(block, /actionLabel="Alle Rechnungen"/, "„Alle Rechnungen“ fehlt");
  assert.match(block, /badge badge--overdue/, "Überfälligkeit ist nicht mehr als Status erkennbar");
});

test("8 — Meldungen: höchstens drei, ungelesen als Wort „Neu“, kein Punkt, keine Symbole", () => {
  const block = modules.slice(modules.indexOf("export function OverviewNotifications"));
  assert.match(block, /topNotifications\(items, 3\)/, "die Auswahl der Meldungen hat sich geändert");
  assert.match(block, /if \(rows\.length === 0\) return null;/, "ohne Meldungen darf keine leere Karte stehen");
  assert.match(block, /\{!n\.read && <span className="ov-ntf-new">Neu<\/span>\}/, "ungelesen steht nicht als Wort da");
  assert.ok(!/ov-ntf-dot|<Icon\b/.test(block), "Punkt oder Symbol ist zurück");
});

// ══════════ Onboarding (nur ohne operative Daten) ══════════

test("9 — Onboarding-Abschnitte erscheinen ausschließlich ohne operative Daten", () => {
  assert.match(code, /const operational = hasOperationalData\(\{ shipments, invoices, ready \}\);/,
    "die Sichtbarkeitsregel wurde verändert");
  for (const id of ["ov-sec-flow", "ov-sec-why"]) {
    const pos = code.indexOf(`id="${id}"`);
    assert.ok(pos > -1, `Abschnitt ${id} fehlt`);
    const davor = code.slice(code.lastIndexOf("{!operational && (", pos), pos);
    assert.ok(davor.length > 0 && davor.length < 300, `Abschnitt ${id} hängt nicht an !operational`);
  }
  // Die operativen Module erscheinen umgekehrt NUR mit Daten.
  assert.match(code, /\{operational && \(\s*<div className="ov-mod-grid">/);
});

test("10 — alle vier Prozessschritte bleiben inhaltlich erhalten, als echte Reihenfolge", () => {
  for (const t of ["Paketdaten eingeben", "Angebote vergleichen", "Versand buchen", "Tracking verfolgen"]) {
    assert.ok(STEPS.includes(`title: "${t}"`), `Schritt „${t}“ fehlt`);
  }
  assert.equal(zaehle(STEPS, /title:/g), 4);
  assert.match(code, /<ol className="ov-steps">/, "die Schritte sind keine geordnete Liste");
  assert.match(code, /<span className="ov-step-no">\{i \+ 1\}<\/span>/, "die Schrittnummer fehlt");
});

test("11 — Funktionen statt Werbezeilen: Versand, Rechnungen und Adressbuch, Lager und Aufträge (G1)", () => {
  // Komplettabschluss (G1, Audit B.10, 2026-10-27): „Weniger Aufwand. Mehr Kontrolle.“ mit vier Werbezeilen ist
  // durch die tatsächlichen Funktionen ersetzt — Versand UND Logistik, aus EINER Datenquelle.
  for (const t of ["Versand", "Rechnungen und Adressbuch", "Lager und Aufträge"]) {
    assert.ok(FUNKTIONEN.includes(`title: "${t}"`), `Funktion „${t}“ fehlt`);
  }
  assert.equal(zaehle(FUNKTIONEN, /title:/g), 3);
  assert.match(code, /\{FUNKTIONEN\.map\(\(w\) => \(/, "die Funktionen laufen nicht über EINE Datenquelle");
  assert.match(code, /<h2 className="ov-section-title" id="ov-sec-why">Versand und Logistik in Ihrem Kundenbereich<\/h2>/);
  assert.ok(!/Beste Preise|für das beste Angebot|Weniger Aufwand\. Mehr Kontrolle\./.test(code), "die Werbezeilen sind zurück");
  // Ehrlichkeitsgrenze: das eigene Lager des Kunden — ConfidaraExpress lagert nicht ein.
  assert.ok(FUNKTIONEN.includes("Ihres eigenen Lagers"), "die Lagerfunktion nennt nicht das eigene Lager");
  assert.ok(!/Fulfillment|einlager|Lagerhaltung für/i.test(code), "ein Fulfillment-Versprechen ist entstanden");
});

test("12 — keine Zusicherungen ohne Beleg; keine Preisgarantie, keine Konformitäts- oder Echtzeitbehauptung", () => {
  // Komplettabschluss (Audit B.10, 2026-10-27): die drei Zusicherungen („Verschlüsselte Übertragung“, „Persönlicher
  // Support — schnell und zuverlässig“, „Preise im Vergleich“) sind entfallen — Behauptung statt Beweis. Go-Live
  // (Paket E): weder „Tiefpreisgarantie“ noch „DSGVO-konform“ noch „in Echtzeit“.
  assert.ok(!/const TRUST = \[|ov-trust|schnell und zuverlässig/.test(code), "die Zusicherungen sind zurück");
  for (const block of [STEPS, FUNKTIONEN]) {
    assert.ok(!/garantier|Tiefpreis|DSGVO-konform|Echtzeit|aller führenden/i.test(block), `unbelegte Werbeaussage zurück: ${block.slice(0, 80)}`);
  }
});

test("13 — Onboarding ist ruhiger Text: keine Symbole, keine dunklen Flächen, kein Wasserzeichen", () => {
  for (const verboten of ["icon:", "<Icon", "pp-bento", "pp-flow", "pp-medal", "pp-trust-watermark", "signet-standard"]) {
    assert.ok(!code.includes(verboten), `${verboten} gehört nicht mehr in die Übersicht`);
  }
  // Schritte und Vorteile teilen sich EINE Grundregel (gruppierter Selektor).
  const r = cssBare.match(/\.ov-steps,\s*\.ov-facts \{([^}]*)\}/)?.[1];
  assert.ok(r, "die gemeinsame Grundregel von .ov-steps/.ov-facts fehlt");
  assert.match(r, /background:\s*var\(--ce-color-surface\)/, "helle Fläche erwartet");
  assert.match(r, /border:\s*1px solid var\(--ce-color-border-subtle\)/, "ruhige 1-px-Kante erwartet");
  assert.match(r, /box-shadow:\s*var\(--ce-elevation-1\)/, "die leichte Tiefe der Arbeitsflächen fehlt");
  assert.ok(!/gradient/.test(r), "kein Verlauf");
});

// ══════════ Carrier-Bereich ══════════

test("14 — „Ihre Versanddienstleister“: Navy-Fläche mit Linien, nur aus GET /kunde/carriers, mit der Vergleichsaktion (G2, UX-Korrektur C)", () => {
  // Betreiberentscheidung G2 (2026-10-27): alle aktuell angebotenen Carrier, keine feste Liste, nicht nur die
  // bisher gebuchten; keine Laufzeiten, keine Dienstnamen, keine Zahl im Titel. UX-Korrektur C (Betreiberentscheidung
  // 2026-10-27): die Fläche trägt wieder Navy mit feinen geschwungenen Linien — in den Farben der Navy-Bühne
  // (--ce-pr-*), nicht der früheren Familie --ce-net-*, und ohne „Fünf Carrier. Eine zentrale Plattform.“ samt
  // erfundenen Diensten und Laufzeiten (Audit B.5, D8).
  assert.ok(!/const CARRIERS = \[|assets\/carriers\//.test(code), "die feste Carrierliste ist zurück");
  for (const tot of ["Fünf Carrier", "Eine zentrale Plattform", "ov-carrier-time", "ov-carrier-service", "--ce-net-"]) {
    assert.ok(!(code + modules).includes(tot), `${tot}: der frühere Carrier-Bereich mit erfundenen Angaben ist zurück`);
  }
  assert.ok(!/--ce-net-/.test(cssBare), "die Farbfamilie der früheren Navy-Fläche lebt noch in overview.css");
  assert.match(code, /<CarrierPortfolio carriers=\{carriers\} onCompare=\{\(\) => navigate\("\/calculator"\)\} \/>/,
    "die Vergleichsaktion führt nicht zum Versandkostenrechner");
  const block = modules.slice(modules.indexOf("export function CarrierPortfolio"));
  assert.match(block, /if \(!Array\.isArray\(carriers\) \|\| carriers\.length === 0\) return null;/,
    "ohne Serverliste darf keine Fläche stehen");
  assert.match(block, /resolvePublicCarrier\(c\.id\)\.logo/, "das Logo kommt nicht aus der öffentlichen Carrierzuordnung");
  assert.match(block, /<span className="ov-carrier-name">\{c\.name\}<\/span>/, "der Name fehlt");
  assert.match(block, /data-carrier=\{c\.id\}/, "die optische Logoangleichung braucht die öffentliche Carrier-ID");
  assert.match(block, /onClick=\{onCompare\}>\s*\{CARRIER_PORTFOLIO_TEXT\.action\}/, "die Vergleichsaktion fehlt");
  assert.ok(!/service|Laufzeit|Tage|time/.test(block), "Laufzeiten oder Dienste in der Carrierfläche");
  // Die Linien (Betreiberentscheidung 2026-11-04, zurück wie bis zum Abschluss 2026-11-02): dekorativ, statisch, nur in
  // der Fläche und hinter dem Inhalt; die gerade Route durch die Kacheln bleibt daneben eine Ebene ohne Markup (Test 2d).
  const linien = modules.slice(modules.indexOf("function CarrierLinien"), modules.indexOf("export function CarrierPortfolio"));
  assert.match(linien, /<svg className="ov-carrier-linien" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">/);
  assert.match(block, /<section className="ov-carrier-zeile" aria-labelledby="ov-car-title">\s*<CarrierLinien \/>/,
    "die Linien stehen nicht als erstes, hinterstes Element in der Fläche");
  assert.equal((block.match(/<svg/g) || []).length, 0, "eine weitere Zeichnung steht im Inhalt der Fläche");
  assert.match(rule(".ov-carrier-zeile"), /background:\s*var\(--ce-pr-stage\)/, "die Fläche ist nicht Navy");
  assert.match(rule(".ov-carrier-zeile"), /isolation:\s*isolate/, "die Ebene der Linien läge nicht hinter dem Inhalt der Fläche");
  assert.match(rule(".ov-carrier-zeile"), /overflow:\s*hidden/, "die Linien laufen über die Fläche hinaus");
  assert.match(rule(".ov-carrier-linien"), /position:\s*absolute;[\s\S]*z-index:\s*-1;[\s\S]*pointer-events:\s*none/);
  assert.match(rule(".ov-carrier-routen path"), /vector-effect:\s*non-scaling-stroke/, "die Linien werden mit der Fläche dicker");
  assert.match(rule(".ov-carrier-routen path"), /stroke:\s*var\(--ce-pr-on-navy-line\)/, "die Routen tragen nicht die Linienfarbe der Bühne");
  assert.match(rule(".ov-carrier-knoten circle"), /fill:\s*var\(--ce-pr-signal-on-navy\)/, "die Lichtknoten tragen nicht das Signal auf Navy");
  assert.match(rule(".ov-carrier-titel"), /color:\s*var\(--ce-color-text-inverse\)/);
  assert.match(rule(".ov-carrier-zeile .ov-carrier-aktion:focus-visible"), /outline:\s*2px solid var\(--ce-pr-signal-on-navy\)/,
    "der Fokus ist auf Navy nicht sichtbar");
  // Die Kacheln sind keine Aktion — kein Hover.
  assert.doesNotMatch(cssBare, /\.ov-carrier-(eintrag|logo|liste)[^{]*:hover/, "Hover auf einer Kachel ohne Aktion");
  // Das Laden liegt bei DashboardPage — die Übersicht und ihre Module laden nichts.
  const dash = src("../../pages/DashboardPage.jsx");
  assert.match(dash, /fetchCarrierPortfolio\(\),/);
  assert.match(dash, /carriers=\{carrierPortfolio\}/);
  // Logos in Originalproportion — eingepasst, nie verzerrt.
  assert.match(rule(".ov-carrier-logo img"), /object-fit:\s*contain/, "Logos werden nicht eingepasst");
});

test("14b — Lager und Aufträge (G1/D7): Stand aus DashboardPage, Einstieg ohne Artikel, Fehler mit Wiederholung", () => {
  const block = modules.slice(modules.indexOf("export function InventorySnapshot"), modules.indexOf("export function CarrierPortfolio"));
  assert.match(block, /export function InventorySnapshot\(\{ stand: standProp = null, onRetry = null, onNavigate \}\)/);
  for (const teil of ['stand.status === "laden"', 'stand.status === "fehler"', "isInventoryEmpty(stats)",
    'gehe("orders", "open")', 'gehe("stock", "low")', 'gehe("inventory")']) {
    assert.ok(block.includes(teil), `${teil} fehlt im Lagermodul`);
  }
  assert.match(code, /<InventorySnapshot stand=\{lagerStand\} onRetry=\{onLagerRetry\} onNavigate=\{onNavigate\} \/>/);
  // Geladen wird mit derselben Abfrage wie die Lagerübersicht — jedes Mal, wenn die Übersicht geöffnet wird.
  const dash = src("../../pages/DashboardPage.jsx");
  assert.match(dash, /if \(page !== "overview"\) return undefined;/);
  assert.match(dash, /getInventoryOverview\(\{ signal \}\)/);
  assert.match(dash, /lagerStand=\{lagerStand\}/);
});

// ══════════ Ruhe und Daten ══════════

test("15 — keine Animation, kein Blur, kein backdrop-filter, keine Farbliterale in der Übersicht", () => {
  assert.doesNotMatch(cssBare, /@keyframes|animation:|backdrop-filter|filter:\s*blur/, "Effekte in overview.css");
  const literale = cssBare.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) || [];
  assert.deepEqual(literale, [], `Farbliterale in overview.css: ${literale.join(", ")}`);
});

test("16 — sichtbare Zahlen nutzen die normale Zahlenschrift", () => {
  assert.match(rule(".ov-step-no"), /font-family:\s*var\(--ce-font-numeric\)/, "Schrittnummer");
  assert.match(rule(".ov-kpi-value"), /font-family:\s*var\(--ce-font-numeric\)/, "Kennzahl");
  assert.match(rule(".ov-inv-amount"), /font-family:\s*var\(--ce-font-numeric\)/, "Rechnungsbetrag");
});

test("17 — Daten, Routing und Zustände der Übersicht sind unverändert", () => {
  // Keine neue API-Abfrage, kein Polling, keine neue Abhängigkeit.
  assert.ok(!/fetch\(|apiFetch|setInterval/.test(code), "die Übersicht darf keine eigenen Daten laden");
  assert.ok(!/lucide-react/.test(overview), "lucide-react ist im Projekt nicht zulässig");
  assert.match(code, /kpisFromServerStats\(serverStats\) \|\| computeKpis\(shipments\)/, "die KPI-Berechnung wurde verändert");
  assert.match(code, /notificationTarget\(n\)/, "das Ziel einer Meldung wird nicht mehr aus der bestehenden Zuordnung abgeleitet");
  for (const t of ["Noch nicht abgeschlossen", "Auf dem Weg zum Empfänger", "Im aktuellen Monat", "Über dem geplanten Liefertermin"]) {
    assert.ok(code.includes(t), `KPI-Kontextzeile „${t}“ wurde verändert`);
  }
});
