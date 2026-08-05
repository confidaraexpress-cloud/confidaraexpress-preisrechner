// Struktur- und Gestaltungstests der drei Inhaltssektionen der Kundenübersicht:
// „01 Ablauf", „02 Vorteile", „03 Carrier-Netzwerk".
//
// Bewusst quelltextnah, wie overviewKpiCards.test.mjs: das Repository hat kein
// jsdom und keine Renderbibliothek. Die Zusicherungen greifen deshalb die
// konkreten Konstrukte an, die das Verhalten und das Bild tragen.
//
// Der Schwerpunkt liegt auf dem, was bei einer Umgestaltung tatsächlich
// kaputtgehen kann:
//   · Inhalte gehen verloren (Schritte, Vorteile, Carrier, alt-Texte)
//   · der CTA verliert seine Zielroute
//   · der Titel behauptet eine Carrier-Zahl, die die Daten nicht decken
//   · die dekorativen Ebenen werden für Screenreader sichtbar
//   · eine geschlitzte Null kehrt über die sichtbaren Abschnittszahlen zurück
//   · die KPI-Karten darüber werden als Nebenwirkung mitverändert
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const overview = src("./Overview.jsx");
const code = stripComments(overview);
const css = src("../../styles/overview.css");
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, "");
const variables = src("../../styles/variables.css").replace(/\/\*[\s\S]*?\*\//g, "");

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
const WHY = array("WHY");
const CARRIERS = array("CARRIERS");
const zaehle = (block, re) => (block.match(re) || []).length;

// ══════════ Gemeinsames Section-Header-System ══════════

test("1 — alle drei Sektionen nutzen denselben Abschnittskopf mit fortlaufender Nummer", () => {
  // Genau eine Komponente, dreimal verwendet — kein dreifach kopierter Kopf.
  assert.match(code, /function SectionHead\(/, "die gemeinsame Kopfkomponente fehlt");
  const einsaetze = [...code.matchAll(/<SectionHead\b/g)].length;
  assert.equal(einsaetze, 3, `erwartet 3 Abschnittsköpfe, gefunden ${einsaetze}`);

  for (const [no, label, titel] of [
    ["01", "Ablauf", "In vier Schritten versandbereit"],
    ["02", "Vorteile", "Weniger Aufwand. Mehr Kontrolle."],
    ["03", "Carrier-Netzwerk", "Acht Carrier. Eine zentrale Plattform."],
  ]) {
    assert.match(code, new RegExp(`no="${no}"`), `Abschnittsnummer ${no} fehlt`);
    assert.match(code, new RegExp(`label="${label}"`), `Label „${label}" fehlt`);
    assert.ok(code.includes(titel), `Überschrift „${titel}" fehlt`);
  }
});

test("2 — jeder Abschnittskopf trägt genau EINE erklärende Zeile", () => {
  const beschreibungen = [...code.matchAll(/desc="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(beschreibungen.length, 3, "erwartet genau drei Beschreibungszeilen (eine je Sektion)");
  for (const d of beschreibungen) {
    assert.ok(d.length > 20, `Beschreibung zu knapp: „${d}"`);
    // Eine Zeile heißt: ein Satz, kein zweiter Absatz.
    assert.ok(!/\n/.test(d), "die Beschreibung muss einzeilig bleiben");
  }
});

test("3 — Kopfstruktur: Indexmarke, dekorative Hairline, Label, h2, eine Zeile", () => {
  const komponente = code.slice(code.indexOf("function SectionHead("), code.indexOf("function NetworkPattern("));
  assert.match(komponente, /className="pp-shead-no"/, "die Indexmarke fehlt");
  assert.match(komponente, /className="pp-shead-rule" aria-hidden="true"/, "die Hairline muss dekorativ (aria-hidden) sein");
  assert.match(komponente, /className="pp-shead-label"/, "das Label fehlt");
  assert.match(komponente, /<h2 className="pp-shead-title"/, "die Überschrift muss ein <h2> bleiben");
  assert.match(komponente, /<p className="pp-shead-desc"/, "die Beschreibung fehlt");
  // Die Hairline darf keinen Text tragen (sonst liest ein Screenreader sie vor).
  assert.match(komponente, /<span className="pp-shead-rule" aria-hidden="true" \/>/, "die Hairline muss ein leeres Element bleiben");
});

test("4 — jede Sektion ist über aria-labelledby mit ihrer Überschrift verbunden", () => {
  for (const id of ["pp-sec-flow", "pp-sec-why", "pp-sec-net"]) {
    assert.match(code, new RegExp(`aria-labelledby="${id}"`), `aria-labelledby für ${id} fehlt`);
    assert.match(code, new RegExp(`id="${id}"`), `die zugehörige id ${id} fehlt`);
  }
});

// ══════════ 01 Ablauf ══════════

test("5 — alle vier Prozessschritte bleiben inhaltlich erhalten", () => {
  for (const titel of [
    "Paketdaten eingeben", "Angebote vergleichen", "Versand buchen", "Tracking verfolgen",
  ]) {
    assert.ok(STEPS.includes(titel), `Prozessschritt „${titel}" fehlt`);
  }
  assert.equal(zaehle(STEPS, /\{\s*icon:/g), 4, "es müssen genau vier Schritte sein");
});

test("6 — die Schritte sind eine echte Reihenfolge (<ol>) mit fortlaufender Nummer", () => {
  assert.match(code, /<ol className="pp-flow-track">/, "die Stationen sollen eine geordnete Liste sein");
  assert.match(code, /<li className="pp-flow-step"/, "die Stationen sollen <li> sein");
  // Die sichtbare Nummer wird aus dem Index abgeleitet, nicht je Schritt gepflegt.
  assert.match(code, /String\(i \+ 1\)\.padStart\(2, "0"\)/, "die Schrittzahl muss aus dem Index kommen");
  assert.match(code, /<h3 className="pp-flow-t">/, "der Schritttitel soll ein <h3> unter dem <h2> sein");
});

test("7 — die Prozesslinie ist an die Icon-Geometrie gebunden, nicht an feste Pixel", () => {
  const linie = rule(".pp-flow-step::after");
  assert.ok(linie, "die Verbindungslinie fehlt");
  // Waagerecht: von der rechten Icon-Kante über die Rasterlücke zum nächsten Icon.
  assert.match(linie, /top:\s*calc\(var\(--flow-ic\)\s*\/\s*2\)/, "die Linie muss auf der Icon-Mittelachse liegen");
  assert.match(linie, /left:\s*var\(--flow-ic\)/, "die Linie muss an der Icon-Kante beginnen");
  assert.match(linie, /right:\s*calc\(-1 \* var\(--flow-gap\)\)/, "die Linie muss exakt die Rasterlücke überbrücken");
  // Die alte Fassung positionierte mit festen Pixelwerten neben den Zentren.
  assert.ok(!/left:\s*\d+px/.test(linie), "keine festen Pixelwerte mehr für die Linienlage");
  // Hinter der letzten Station endet der Prozess.
  assert.match(rule(".pp-flow-step:last-child::after") || "", /content:\s*none/,
    "die letzte Station darf keine ins Leere laufende Linie tragen");
});

test("8 — die Verbindung erzeugt keinen DOM-Knoten und keinen Text", () => {
  // Früher ein <span class="pp-step-con">; jetzt ein Pseudo-Element, das im
  // Accessibility-Baum überhaupt nicht auftaucht.
  assert.ok(!code.includes("pp-step-con"), "das alte Verbindungs-<span> darf nicht zurückkehren");
  assert.match(rule(".pp-flow-step::after"), /content:\s*''/, "die Linie darf keinen Textinhalt tragen");
});

test("9 — unterhalb von 1120 px wird die Kette senkrecht statt 2×2", () => {
  // Es gibt mehrere 1120-px-Blöcke (u. a. das Trust-Wasserzeichen) — gesucht ist
  // der, der das Prozessraster umschaltet.
  const block = [...cssBare.matchAll(/@media \(max-width: 1120px\)\s*\{([\s\S]*?)\n\}/g)]
    .map((m) => m[1]).find((b) => b.includes(".pp-flow-track"));
  assert.ok(block, "der Tablet-Breakpoint des Prozessrasters fehlt");
  assert.match(block, /\.pp-flow-track\s*\{[^}]*grid-template-columns:\s*1fr/,
    "bei zwei Spalten müsste die Prozesslinie abbrechen oder zurückspringen — deshalb einspaltig");
  assert.match(block, /\.pp-flow-step::after\s*\{[^}]*width:\s*1px/, "die Linie muss senkrecht weiterlaufen");
});

// ══════════ 02 Vorteile ══════════

test("10 — alle vier Vorteile bleiben erhalten, aus EINER Datenquelle", () => {
  assert.equal(zaehle(WHY, /\{\s*key:/g), 4, "es müssen genau vier Vorteile sein");
  for (const titel of [
    "Für Geschäftskunden entwickelt", "Konditionen direkt vergleichen",
    "Express & Standard", "Vollständige Transparenz",
  ]) {
    assert.ok(WHY.includes(titel), `Vorteil „${titel}" fehlt`);
  }
  // Genau ein map() über WHY — das Bento entsteht aus Flags, nicht aus einer
  // zweiten, parallel gepflegten Liste.
  assert.equal([...code.matchAll(/WHY\.map\(/g)].length, 1, "die Karten dürfen nur aus einem einzigen map() kommen");
  assert.equal(zaehle(WHY, /hero:\s*true/g), 1, "genau eine Leitkarte");
  assert.equal(zaehle(WHY, /wide:\s*true/g), 1, "genau eine breite Nebenkarte");
});

test("11 — die unbelegte Superlativ-Werbung ist verschwunden", () => {
  assert.ok(!code.includes("Beste Preise"), "der Superlativ 'Beste Preise' ist eine unbelegte Werbeaussage");
  assert.ok(!code.includes("für das beste Angebot"), "'für das beste Angebot' sichert ein Ergebnis zu, das nicht zugesichert ist");
  // Ersetzt durch die tatsächlich vorhandene Funktion.
  assert.ok(WHY.includes("Konditionen direkt vergleichen"), "der sachliche Ersatztitel fehlt");
});

test("12 — die dunkle Leitkarte trägt die B2B-Positionierung", () => {
  const i = WHY.indexOf("hero: true");
  const leit = WHY.slice(Math.max(0, i - 200), i + 200);
  assert.ok(/Geschäftskunden/.test(leit), "die Leitkarte muss die B2B-Positionierung tragen");
  assert.match(rule(".pp-bento-item--hero"), /grid-row:\s*1 \/ span 2/, "die Leitkarte soll zwei Rasterzeilen einnehmen");
});

test("13 — die einzige Kennzahl der Sektion ist die echte Länge der Carrier-Liste", () => {
  assert.match(code, /className="pp-bento-fact-n">\{CARRIERS\.length\}</,
    "die Zahl muss aus den Daten kommen, nicht hartkodiert sein");
  // Keine erfundenen Prozente, Bewertungen oder Zeitversprechen.
  const bento = code.slice(code.indexOf('aria-labelledby="pp-sec-why"'), code.indexOf('aria-labelledby="pp-sec-net"'));
  assert.ok(!/\d+\s*%/.test(bento), "keine erfundene Prozentangabe");
  assert.ok(!/\b\d+(\.\d+)?\s*(Sterne|Bewertung|Mio|Mrd)/i.test(bento), "keine erfundene Kennzahl");
});

test("14 — mobil steht die Leitkarte zuerst und alles einspaltig", () => {
  // DOM-Reihenfolge = Lesereihenfolge: die Leitkarte ist der erste WHY-Eintrag.
  const ersterKey = WHY.match(/key:\s*"([^"]+)"/)[1];
  assert.equal(ersterKey, "b2b", "die Leitkarte muss der erste Eintrag sein, damit sie einspaltig oben steht");
  const block = cssBare.match(/@media \(max-width: 640px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(block, "der Mobil-Breakpoint des Bento fehlt");
  assert.match(block[1], /\.pp-bento\s*\{[^}]*grid-template-columns:\s*1fr/, "einspaltig auf schmalen Breiten");
});

// ══════════ 03 Carrier-Netzwerk ══════════

test("15 — die Carrier-Liste ist unverändert vollständig und der Titel deckt sich mit ihr", () => {
  const anzahl = zaehle(CARRIERS, /\{\s*key:/g);
  assert.equal(anzahl, 8, "die Carrier-Liste soll acht Einträge haben");
  for (const marke of ["DHL", "UPS", "DPD", "GLS", "FedEx", "TNT", "Emons", "trans-o-flex"]) {
    assert.ok(CARRIERS.includes(`"${marke}"`), `Carrier ${marke} fehlt`);
  }
  // Kopplung Text ↔ Daten: der Titel nennt die Zahl als Wort. Ändert sich die
  // Liste, schlägt dieser Test fehl, statt den Text still falsch werden zu lassen.
  assert.ok(code.includes("Acht Carrier. Eine zentrale Plattform."),
    `der Titel muss zur tatsächlichen Carrier-Zahl (${anzahl}) passen`);
});

test("16 — jedes Carrier-Logo behält einen sinnvollen Alternativtext", () => {
  assert.match(code, /<img src=\{c\.logo\} alt=\{c\.alt\}/, "das Logo muss seinen alt-Text aus den Daten ziehen");
  assert.equal(zaehle(CARRIERS, /alt:\s*"/g), 8, "jeder Carrier braucht einen alt-Text");
  assert.ok(!/alt:\s*""/.test(CARRIERS), "kein leerer alt-Text — die Logos tragen Information");
  // Originalproportion: keine feste Breite UND Höhe zugleich.
  assert.match(rule(".car-logo"), /object-fit:\s*contain/, "das Logo darf nicht verzerrt werden");
  assert.match(rule(".car-logo"), /width:\s*auto/, "die Breite muss frei bleiben");
});

test("17 — der CTA behält Funktion und Zielroute", () => {
  assert.match(code, /className="pp-net-cta" onClick=\{\(\) => navigate\("\/calculator"\)\}/,
    "der CTA muss weiterhin auf die bestehende Preisrechner-Route führen");
  assert.ok(code.includes("Carrier-Angebote vergleichen"), "der CTA-Text fehlt");
  // Genau ein Ziel — keine zweite, erfundene Route in dieser Sektion.
  const netz = code.slice(code.indexOf('aria-labelledby="pp-sec-net"'));
  assert.equal([...netz.matchAll(/navigate\(/g)].length, 1, "die Sektion darf nur dieses eine Ziel ansteuern");
});

test("18 — die dekorative Netzstruktur ist für Screenreader unsichtbar und ruhig", () => {
  const svg = code.slice(code.indexOf("function NetworkPattern("), code.indexOf("function getGreeting("));
  assert.match(svg, /aria-hidden="true"/, "die Netzstruktur muss aria-hidden sein");
  assert.match(svg, /focusable="false"/, "das SVG darf keinen Tabstopp erzeugen");
  assert.ok(!/<text|<title|<desc/.test(svg), "die dekorative Ebene darf keinen Text beitragen");
  // Farben über Tokens, keine Literale im Markup.
  assert.ok(!/#[0-9a-fA-F]{3,8}|rgba?\(/.test(svg), "keine Farbliterale im dekorativen SVG");
  // Sie liegt innerhalb der Karte und ist dort beschnitten — keine Seitenebene.
  assert.match(rule(".pp-net"), /overflow:\s*hidden/, "die Struktur muss an der Kartenrundung beschnitten werden");
  assert.match(rule(".pp-net-bg"), /position:\s*absolute/, "die Struktur muss hinter dem Inhalt liegen");
});

test("19 — keine Animation, kein Blur, kein backdrop-filter in den drei Sektionen", () => {
  const start = cssBare.indexOf("/* ══════════ Sektionen");
  const abschnitt = cssBare.slice(start > -1 ? start : cssBare.indexOf(".pp-sec {"));
  assert.ok(!/animation:/.test(abschnitt), "keine dauerhaft laufende Animation");
  assert.ok(!/backdrop-filter/.test(abschnitt), "kein backdrop-filter (siehe CLAUDE.md)");
  assert.ok(!/filter:\s*blur/.test(abschnitt), "kein Blur");
  // Hover verschiebt nichts.
  for (const sel of [".pp-bento-item:hover", ".pp-net-cta:hover", ".pp-car:hover .pp-car-chip"]) {
    const b = rule(sel);
    if (b) assert.ok(!/transform|translate|scale|margin|top:/.test(b), `${sel} darf das Layout nicht verschieben`);
  }
  // prefers-reduced-motion deckt die neuen Übergänge ab.
  const rm = cssBare.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(rm, "prefers-reduced-motion fehlt");
  for (const sel of [".pp-bento-item", ".pp-net-cta", ".pp-car-chip"]) {
    assert.match(rm[1], new RegExp(`\\${sel}\\s*\\{[^}]*transition:\\s*none`), `${sel} muss den Übergang abschalten`);
  }
});

// ══════════ Sichtbare Ziffern, Tokens, Nachbarschaft ══════════

test("20 — die sichtbaren Abschnitts- und Schrittzahlen nutzen die normale Zahlenschrift", () => {
  // Rückfallschutz gegen die geschlitzte Null (PR #286).
  for (const sel of [".pp-shead-no", ".pp-flow-step .pp-step-no", ".pp-bento-fact-n"]) {
    const b = rule(sel);
    assert.ok(b, `${sel} fehlt`);
    assert.match(b, /font-family:\s*var\(--ce-font-numeric\)/, `${sel} muss die zentrale Zahlenschrift nutzen`);
    assert.match(b, /font-variant-numeric:\s*tabular-nums/, `${sel} braucht gleich breite Ziffern`);
  }
  assert.ok(!/DM Mono|var\(--fm\)/.test(css), "DM Mono / --fm dürfen nicht zurückkehren");
  assert.ok(!/font-family:[^;]*monospace/.test(css), "kein generischer monospace-Fallback");
});

test("21 — die neuen Sektionen führen keine Farbliterale im Stylesheet", () => {
  // Dieselbe Disziplin wie bei Chrome und KPI-Karten: Farben stehen in
  // variables.css, overview.css referenziert sie nur.
  // cssBare ist kommentarfrei — als Anker dienen deshalb Selektoren, nicht
  // Kommentarüberschriften: vom ersten Kopf-Selektor bis zum Trust-Bereich.
  const start = cssBare.indexOf(".pp-shead {");
  const ende = cssBare.indexOf(".pp-trust {");
  assert.ok(start > -1 && ende > start, "der Sektionsabschnitt ist nicht auffindbar");
  const abschnitt = cssBare.slice(start, ende);
  const literale = abschnitt.match(/#[0-9a-fA-F]{3,8}\b|(?<!\w)rgba?\([^)]*\)/g) || [];
  assert.deepEqual(literale, [], `Farbliterale gehören nach variables.css: ${literale.join(", ")}`);
  // Und die Tokens existieren dort auch wirklich.
  for (const t of ["--ce-sec-accent", "--ce-flow-surface", "--ce-bento-hero-surface", "--ce-net-surface", "--ce-net-chip"]) {
    assert.ok(variables.includes(`${t}:`), `Token ${t} fehlt in variables.css`);
  }
});

test("22 — die KPI-Karten darüber bleiben unangetastet", () => {
  // Icons, Reihenfolge und Logik der vier Kennzahlkarten sind nicht Teil dieser
  // Umgestaltung — eine versehentliche Mitänderung fällt hier auf.
  for (const ic of ["packageMove", "routeArrow", "seal", "clockDelay"]) {
    assert.ok(code.includes(`icon: "${ic}"`), `KPI-Icon ${ic} wurde verändert`);
  }
  assert.match(code, /const k = useMemo\(\(\) => computeKpis\(shipments\), \[shipments\]\)/, "die KPI-Berechnung wurde verändert");
  assert.match(code, /ready \? kpi\.value : "—"/, "der Lade-/Fehlerzustand der KPI-Karten wurde verändert");
  // Die vier Kontextzeilen unverändert.
  for (const t of ["Noch nicht abgeschlossen", "Auf dem Weg zum Empfänger", "Im aktuellen Monat", "Über dem geplanten Liefertermin"]) {
    assert.ok(code.includes(t), `KPI-Kontextzeile „${t}" wurde verändert`);
  }
});

test("23 — Daten, Routing und Zustände der Übersicht sind unverändert", () => {
  // Keine neue API-Abfrage, kein Polling, keine neue Abhängigkeit.
  assert.ok(!/fetch\(|useEffect\(\s*\(\)\s*=>\s*\{[^}]*setInterval/.test(code), "die Sektionen dürfen keine Daten laden");
  assert.ok(!/lucide-react/.test(overview), "lucide-react ist im Projekt nicht zulässig (eigenes Icon-System)");
  // Alle Icons weiterhin über die bestehende Icon-Komponente.
  const iconNamen = [...code.matchAll(/<Icon n=\{?"?([a-zA-Z.]+)"?\}?/g)].map((m) => m[1]);
  assert.ok(iconNamen.length > 0, "die Icon-Komponente wird nicht mehr verwendet");
  // Die drei Trust-Einträge unterhalb bleiben unberührt.
  assert.ok(code.includes("pp-trust-item"), "der Trust-Bereich wurde versehentlich verändert");
});
