// Struktur- und Verhaltenstests der KPI-Karten der Kundenübersicht.
//
// Geprüft wird, was reine Logiktests nicht erreichen: wie viele Karten gerendert
// werden, wie sich das Grid über die Breakpoints verhält, wann eine Zahl statt
// „—" erscheint, welche Ereignisse einen Refetch auslösen — und vor allem, dass
// KEIN periodisches API-Polling eingeführt wurde.
//
// Bewusst quelltextnah: das Repository hat kein jsdom und keine Renderbibliothek
// für Komponenten. Die Zusicherungen greifen deshalb die konkreten Konstrukte an,
// die das Verhalten tragen (nicht bloß Stichwörter).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const overview = src("./Overview.jsx");
const overviewCode = stripComments(overview);
const dashboard = src("../../pages/DashboardPage.jsx");
const dashboardCode = stripComments(dashboard);
const css = src("../../styles/overview.css");

// ── Hilfen für die Prüfung des Kartenbildes ─────────────────────────────────
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, "");
const variables = src("../../styles/variables.css").replace(/\/\*[\s\S]*?\*\//g, "");
const iconSrc = src("../ui/Icon.jsx");
const fontsCss = src("../../styles/fonts.css");

// Rumpf der ERSTEN Regel mit exakt diesem Selektor (Grundstufe steht im
// Stylesheet vor den Media-Queries).
function rule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = cssBare.match(new RegExp(`(?:^|[};{])\\s*${esc}\\s*\\{([^}]*)\\}`, "m"));
  return m ? m[1] : null;
}
function decl(selector, prop) {
  const body = rule(selector);
  if (body == null) return null;
  const m = body.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`));
  return m ? m[1].trim() : null;
}
// Tokenwert aus variables.css, ein var()-Verweis wird aufgelöst.
function tok(name, tiefe = 0) {
  const m = variables.match(new RegExp(`--${name}:\\s*([\\s\\S]*?);`));
  if (!m) return null;
  const v = m[1].trim();
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  return ref && tiefe < 4 ? tok(ref[1], tiefe + 1) : v;
}

// ── Farbe: parsen, überlagern, Kontrast ─────────────────────────────────────
function parseColor(v) {
  if (Array.isArray(v)) return v;
  const s = String(v).trim();
  const hex = s.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i);
  if (rgba) return [+rgba[1], +rgba[2], +rgba[3], rgba[4] === undefined ? 1 : +rgba[4]];
  throw new Error(`nicht parsbare Farbe: ${v}`);
}
// Vordergrund mit Alpha über einen deckenden Hintergrund legen.
function over(fg, bg) {
  const [r, g, b, a] = parseColor(fg);
  const [R, G, B] = parseColor(bg);
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
}
function luminance(c) {
  const [r, g, b] = (Array.isArray(c) ? c : parseColor(c)).slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
// Der reale Untergrund einer KPI-Karte: Ivory-Grund, darüber die (leicht
// transparente) Kartenfläche. `stopp` ist der Farbstopp des Kartenverlaufs.
function kartenGrund(stopp) {
  return over(stopp, tok("ce-app-bg-top"));
}
// Der zusammenhängende KPI-Abschnitt des Stylesheets (Grundstufe, ohne die
// Feinstufen am Dateiende) — von .pp-kpis bis zur nächsten Sektion.
function kpiSektion() {
  const start = cssBare.indexOf(".pp-kpis");
  const ende = cssBare.indexOf(".pp-sec {", start);
  assert.ok(start > -1 && ende > start, "der KPI-Abschnitt ist nicht auffindbar");
  return cssBare.slice(start, ende);
}

const KARTEN = ["active", "transit", "delivered", "delayed"];
// Die Karten ziehen ihre Farbe aus dem Verlaufsstopp am Kopf (dort sitzen Label
// und Icon); der dunkelste Stopp am Fuß trägt die Kontextzeile.
const VERLAUF = (tok("ce-kpi-surface").match(/rgba?\([^)]*\)/g) || []);
const GRUND_KOPF = kartenGrund(VERLAUF[0]);
const GRUND_FUSS = kartenGrund(VERLAUF[VERLAUF.length - 1]);

// ── Genau vier Karten ────────────────────────────────────────────────────────
test("1 — die Übersicht rendert genau VIER KPI-Karten", () => {
  const block = overviewCode.slice(overviewCode.indexOf("const KPIS = ["));
  const arr = block.slice(0, block.indexOf("];") + 2);
  const keys = [...arr.matchAll(/key:\s*"([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["active", "transit", "delivered", "delayed"],
    `erwartet genau vier Karten in fester Reihenfolge, gefunden: ${JSON.stringify(keys)}`);
  // Die Ausgabenkarte ist restlos weg — weder Schlüssel noch Beschriftung.
  assert.ok(!arr.includes("spend"), "die Ausgabenkarte ist noch im Array");
  assert.ok(!overview.includes("Ausgaben (Monat)"), "die Beschriftung „Ausgaben (Monat)“ existiert noch");
});

test("2 — jede der vier Karten trägt ein Icon (kein Glyph-Zweig mehr)", () => {
  const block = overviewCode.slice(overviewCode.indexOf("const KPIS = ["));
  const arr = block.slice(0, block.indexOf("];") + 2);
  assert.equal((arr.match(/icon:\s*"/g) || []).length, 4, "alle vier Karten brauchen ein Icon");
  assert.ok(!overviewCode.includes("glyph"), "der Glyph-Zweig gehörte zur Euro-Karte und muss weg sein");
  assert.ok(!overviewCode.includes('className="eur"'), "die Euro-Klasse wird noch gerendert");
  assert.ok(!css.includes(".eur "), "die verwaiste .eur-Regel steht noch im Stylesheet");
});

// ── Gridverhalten 4 → 2 → 1 ─────────────────────────────────────────────────
test("3 — das KPI-Grid ist 4 → 2 → 1 ohne Zwischenstufe und ohne Restplatzregel", () => {
  // Basis: vier gleichmäßige Spalten.
  assert.match(css, /\.pp-kpis\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*1fr\)/,
    "Desktop muss vier gleichmäßige Spalten haben");

  // Alle Spaltenangaben für .pp-kpis in Reihenfolge einsammeln (Basis + Media Queries).
  const spalten = [...css.matchAll(/\.pp-kpis[^{}]*\{[^}]*grid-template-columns:\s*([^;]+);/g)]
    .map((m) => m[1].trim());
  assert.deepEqual(spalten, ["repeat(4, 1fr)", "repeat(2, 1fr)", "1fr"],
    `erwartet 4 → 2 → 1, gefunden: ${JSON.stringify(spalten)}`);

  // Die frühere Dreispalten-Zwischenstufe ist entfallen.
  assert.ok(!/\.pp-kpis[^{}]*\{[^}]*repeat\(3,\s*1fr\)/.test(css),
    "die 3-Spalten-Zwischenstufe darf es nicht mehr geben");

  // Keine Sonderbehandlung einer letzten/fünften Position.
  const kpiRegeln = [...css.matchAll(/\.pp-kpi[^\n]*\{[^}]*\}/g)].map((m) => m[0]).join("\n");
  for (const sel of [":nth-child", ":last-child", ":nth-of-type", ":last-of-type", "grid-column"]) {
    assert.ok(!kpiRegeln.includes(sel), `Restplatzregel ${sel} ist nicht zulässig`);
  }

  // Gleiche Kartenhöhe kommt vom Grid selbst — keine feste Höhe eingeführt.
  assert.ok(!/\.pp-kpi\s*\{[^}]*(?<!min-)height:\s*\d/.test(css), "keine feste Kartenhöhe setzen");
});

test("4 — die KPI-Breakpoints sind 1080 px und 560 px, unabhängig vom globalen 980-px-Wechsel", () => {
  // Jeden Media-Block einzeln betrachten und nur die .pp-kpis-Regel darin auswerten —
  // andere Raster (.pp-vals/.pp-steps/.pp-cars) nutzen dieselben Spaltenangaben und
  // dürfen die Zuordnung nicht verfälschen.
  const bloecke = [...css.matchAll(/@media \(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)]
    .map((m) => ({ breite: Number(m[1]), inhalt: m[2] }));
  const kpiRegel = (inhalt) => {
    const m = inhalt.match(/\.pp-kpis[^{}]*\{[^}]*grid-template-columns:\s*([^;]+);/);
    return m ? m[1].trim() : null;
  };
  const stufen = bloecke
    .map((b) => ({ breite: b.breite, spalten: kpiRegel(b.inhalt) }))
    .filter((b) => b.spalten !== null);
  assert.deepEqual(stufen, [
    { breite: 1080, spalten: "repeat(2, 1fr)" },
    { breite: 560, spalten: "1fr" },
  ], `erwartet genau zwei Stufen bei 1080/560, gefunden: ${JSON.stringify(stufen)}`);

  // Der globale 980-px-Wechsel bleibt bestehen (er betrifft .pp-main/.pp-top/
  // .pp-actions/.pp-cars) — er darf .pp-kpis nur nicht mehr anfassen.
  const global980 = bloecke.find((b) => b.breite === 980);
  assert.ok(global980, "der globale 980-px-Breakpoint fehlt — er wurde versehentlich entfernt statt nur .pp-kpis daraus zu lösen");
  assert.ok(!/\.pp-kpis\s*\{/.test(global980.inhalt),
    "der globale 980-px-Block darf .pp-kpis nicht mehr enthalten — das KPI-Raster hat jetzt seinen eigenen 1080-px-Breakpoint");
  for (const sel of [".pp-main", ".pp-top", ".pp-actions", ".pp-cars"]) {
    assert.ok(global980.inhalt.includes(sel), `der globale 980-px-Breakpoint darf ${sel} nicht verlieren`);
  }
});

test("31 — der 1080-px-Breakpoint ist ausschließlich für das KPI-Raster, keine Drittwirkung", () => {
  const block = cssBare.match(/@media \(max-width: 1080px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(block, "der KPI-eigene 1080-px-Breakpoint fehlt");
  const inhalt = block[1].trim();
  // Der Block darf NUR die Spaltenregel für .pp-kpis enthalten — keine
  // Padding-/Schrift-/Icongrößen-Änderung mehr. Die alten Feinstufen
  // verkleinerten Schrift und Abstand als Notbehelf gegen den Labelumbruch;
  // diese Sonderbehandlung ist entfallen. Ein Umbruch von „Aktive Sendungen"
  // bei 1081–1200 px (feste 252-px-Sidebar + gesperrte Icongröße lassen dort
  // nur rund 77–107 px für die Beschriftung) bleibt möglich — er ist aber
  // NICHT problematisch: `.pp-kpi-head` reserviert 36 px Mindesthöhe, wodurch
  // Kopfzeilenhöhe und Zahlengrundlinie über die Rasterzeile hinweg gleich
  // bleiben, unabhängig davon, ob eine Beschriftung ein- oder zweizeilig ist
  // (siehe Test 33 und die Kommentare in overview.css).
  const regeln = [...inhalt.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    sel: sel.trim(), body: body.trim(),
  }));
  assert.deepEqual(regeln.map((r) => r.sel), [".pp-kpis"],
    `der 1080-px-Block soll ausschließlich .pp-kpis regeln, gefunden: ${JSON.stringify(regeln.map((r) => r.sel))}`);
  assert.match(regeln[0].body, /grid-template-columns:\s*repeat\(2,\s*1fr\)/);

  // Keine verwaisten Bereichsabfragen (min-width…max-width) mehr, die früher
  // Innenabstand/Icon-/Schriftgröße der KPI-Karten zwischen 981 und 1240 px
  // verkleinert haben — sie sind mit dem neuen Breakpoint hinfällig.
  const bereiche = [...cssBare.matchAll(/@media \(min-width: \d+px\) and \(max-width: \d+px\)\s*\{([\s\S]*?)\n\}/g)];
  for (const [, inhalt] of bereiche) {
    assert.ok(!/\.pp-kpi\b|\.pp-kpis\b|\.knum\b|\.pp-kpi-icon\b|\.pp-kpi-label\b/.test(inhalt),
      "eine verwaiste Bereichsabfrage regelt noch KPI-Selektoren — mit dem 1080-px-Breakpoint nicht mehr nötig");
  }
});

// ── Lade-, Fehler- und Nullverhalten ────────────────────────────────────────
test("5 — eine Zahl erscheint erst nach erfolgreichem Laden, sonst „—“", () => {
  // Das Gate heißt `ready` und speist sich aus kpisReady (nicht aus loading allein).
  assert.match(overviewCode, /const ready = kpisReady === undefined \? !loading : kpisReady;/,
    "das Bereitschafts-Gate fehlt oder wurde umbenannt");
  assert.match(overviewCode, /<KpiNum v=\{ready \? kpi\.value : "—"\} \/>/,
    "die Kartenzahl muss am Bereitschafts-Gate hängen, nicht an loading");
  // Kein direkter loading-Ternary mehr auf dem Wert (das zeigte nach einem
  // Ladefehler eine echte 0).
  assert.ok(!/v=\{loading \? "—" : kpi\.value\}/.test(overviewCode),
    "der alte loading-Ternary würde nach einem Fehler eine falsche 0 zeigen");
});

test("6 — DashboardPage meldet Bereitschaft erst nach erfolgreicher Sendungsantwort", () => {
  assert.match(dashboardCode, /const \[shipmentsLoaded, setShipmentsLoaded\] = useState\(false\)/,
    "der Bereitschaftszustand fehlt");
  assert.match(dashboardCode, /kpisReady=\{shipmentsLoaded\}/, "kpisReady wird nicht an die Übersicht gereicht");
  // Gesetzt wird er ausschließlich im Erfolgsfall — nie im Fehlerpfad.
  assert.equal((dashboardCode.match(/setShipmentsLoaded\(true\)/g) || []).length, 2,
    "genau zwei Erfolgsstellen erwartet (vollständiges Laden + gezielter Refetch)");
  assert.ok(!/setShipmentsLoaded\(false\)/.test(dashboardCode),
    "einmal geladen bleibt geladen — bei einem späteren Fehler dürfen die Werte stehen bleiben");
});

test("7 — ein fehlgeschlagener Refetch überschreibt die Sendungen nicht", () => {
  const fn = dashboardCode.slice(dashboardCode.indexOf("const reloadShipments"));
  const koerper = fn.slice(0, fn.indexOf("}, []);") + 7);
  assert.match(koerper, /if \(!r\.ok\) return;/, "ein Fehlerstatus muss ohne setState zurückkehren");
  assert.match(koerper, /catch \{[^}]*\}/, "Netzwerkfehler müssen still bleiben");
  assert.ok(!/setShipments\(\[\]\)/.test(koerper), "ein Fehler darf die Liste nicht leeren");
});

// ── Refetch-Auslöser ────────────────────────────────────────────────────────
test("8 — der gezielte Refetch lädt NUR die Sendungen, nicht die Rechnungen", () => {
  const fn = dashboardCode.slice(dashboardCode.indexOf("const reloadShipments"));
  const koerper = fn.slice(0, fn.indexOf("}, []);") + 7);
  assert.ok(koerper.includes("/kunde/shipments"), "der Sendungsabruf fehlt");
  assert.ok(!koerper.includes("/kunde/invoices"), "der KPI-Refetch darf die Rechnungen nicht mitladen");
  assert.ok(!koerper.includes("setInvoices"), "keine Rechnungszustände im Sendungs-Refetch");
});

test("9 — Rückkehr auf die Übersicht lädt nach, der erste Mount aber nicht doppelt", () => {
  assert.match(dashboardCode, /const prevPageRef = useRef\(page\)/,
    "ohne die Vorseiten-Referenz entstünde beim Mount eine doppelte Anfrage");
  assert.match(dashboardCode, /if \(page === "overview" && prev !== "overview"\) reloadShipments\(\);/,
    "der Refetch bei Rückkehr auf die Übersicht fehlt");
});

test("10 — der Monatswechsel löst höchstens EINEN gezielten Refetch aus", () => {
  const start = dashboardCode.indexOf("let last = businessMonthKey();");
  assert.ok(start > -1, "die Monatsbeobachtung fehlt");
  const effekt = dashboardCode.slice(start, dashboardCode.indexOf("}, [reloadShipments]);", start));
  // Nachgeladen wird ausschließlich im Änderungszweig …
  assert.match(effekt, /if \(current && current !== last\) \{[\s\S]*?reloadShipments\(\);/,
    "es darf nur bei tatsächlichem Monatswechsel nachgeladen werden");
  // … und der Merker wird dabei fortgeschrieben, sonst feuerte es jede Minute erneut.
  assert.match(effekt, /last = current;/, "ohne Fortschreiben würde der Refetch pro Takt wiederholt");
  assert.equal((effekt.match(/reloadShipments\(\)/g) || []).length, 1,
    "genau ein Aufruf im Änderungszweig");
});

test("11 — Timer und Listener werden beim Unmount aufgeräumt", () => {
  const start = dashboardCode.indexOf("let last = businessMonthKey();");
  const effekt = dashboardCode.slice(start, dashboardCode.indexOf("}, [reloadShipments]);", start));
  assert.match(effekt, /return \(\) => clearInterval\(timer\);/, "der Intervalltimer wird nicht aufgeräumt");
  // Jedes setInterval der Datei hat ein zugehöriges clearInterval.
  const setzt = (dashboardCode.match(/setInterval\(/g) || []).length;
  const raeumt = (dashboardCode.match(/clearInterval\(/g) || []).length;
  assert.equal(setzt, raeumt, `jedes setInterval braucht ein clearInterval (${setzt} vs. ${raeumt})`);
});

// ── Kein API-Polling ────────────────────────────────────────────────────────
test("12 — es wurde KEIN periodisches API-Polling eingeführt", () => {
  const start = dashboardCode.indexOf("let last = businessMonthKey();");
  const effekt = dashboardCode.slice(start, dashboardCode.indexOf("}, [reloadShipments]);", start));
  // Der Takt selbst darf keinen Netzaufruf enthalten — nur den Stringvergleich.
  assert.ok(!effekt.includes("apiFetch"), "der Takt darf nicht direkt anfragen");
  assert.ok(!effekt.includes("/kunde/"), "der Takt darf keinen Endpunkt kennen");

  // Genau EIN Intervall in der Datei, und das ist die reine Monatsbeobachtung.
  assert.equal((dashboardCode.match(/setInterval\(/g) || []).length, 1,
    "es darf nur den einen Monats-Takt geben");

  // Kein generischer Fokus-/Sichtbarkeitsmechanismus, der dauerhaft Requests erzeugt.
  for (const verboten of ["visibilitychange", 'addEventListener("focus"', "window.onfocus"]) {
    assert.ok(!dashboardCode.includes(verboten),
      `${verboten} würde einen dauerhaften Auslöser einführen`);
  }
  // Und kein wiederkehrender Timeout als getarntes Polling.
  assert.ok(!/setTimeout\([^)]*fetchData/.test(dashboardCode), "kein verstecktes Nachladen per Timeout");
});

test("13 — der Monats-Takt ist ein LOKALER Vergleich mit gemäßigtem Intervall", () => {
  assert.match(dashboardCode, /const MONTH_WATCH_INTERVAL_MS = 60_000;/,
    "das Taktintervall muss benannt und nachvollziehbar sein");
  assert.match(dashboardCode, /setInterval\([\s\S]{0,400}?MONTH_WATCH_INTERVAL_MS\)/,
    "der Takt muss die benannte Konstante verwenden");
});

// ── Veraltete Antworten ─────────────────────────────────────────────────────
test("14 — überholte Sendungsantworten werden verworfen", () => {
  assert.match(dashboardCode, /const shipmentsReq = useRef\(0\)/, "die Sequenzreferenz fehlt");
  // GENAU die beiden ERSETZENDEN Abrufwege zählen die Sequenz hoch (fetchData +
  // reloadShipments). Das ANFÜGENDE Nachladen (Phase 1, loadMoreShipments) zählt
  // bewusst NICHT hoch — es erfindet keinen neuen Stand, sondern hängt an den
  // bestehenden an; hochzählen würde einen parallel laufenden Refetch entwerten.
  assert.equal((dashboardCode.match(/\+\+shipmentsReq\.current/g) || []).length, 2,
    "nur fetchData und reloadShipments dürfen die Sequenz hochzählen");
  // Alle Konsumenten prüfen vor dem Schreiben: die beiden ersetzenden Wege je
  // einmal, das Nachladen zweimal (Antwortpfad UND Fehlerpfad — eine veraltete
  // Nachladeantwort darf weder anfügen noch eine Fehlerzeile setzen).
  assert.equal((dashboardCode.match(/seq [=!]== shipmentsReq\.current/g) || []).length, 4,
    "alle Wege müssen vor setState auf Aktualität prüfen");
});

/* ═══════════════════════════════════════════════════════════════════════════
   Visuelles System der KPI-Karten („Executive Metric Cards")
   ═══════════════════════════════════════════════════════════════════════════ */

test("16 — Kopfzeile: Beschriftung links, Icon rechts", () => {
  const kopf = overviewCode.slice(overviewCode.indexOf('className="pp-kpi-head"'));
  const block = kopf.slice(0, kopf.indexOf("</div>"));
  const iLabel = block.indexOf("pp-kpi-label");
  const iIcon = block.indexOf("pp-kpi-icon");
  assert.ok(iLabel > -1 && iIcon > -1, "Beschriftung und Icon müssen in der Kopfzeile stehen");
  assert.ok(iLabel < iIcon, "die Beschriftung steht links, das Icon rechts — nicht umgekehrt");
  assert.equal(decl(".pp-kpi-head", "justify-content"), "space-between",
    "ohne space-between rückt das Icon nicht an den rechten Rand");
  // Ohne min-height wandert die Zahl nach unten, sobald eine Beschriftung
  // zweizeilig wird — die vier Zahlen stünden dann nicht mehr auf einer Grundlinie.
  assert.match(decl(".pp-kpi-head", "min-height") || "", /^\d/, "die Kopfzeile braucht eine min-height");
});

test("17 — der Wert ist Sans-Serif, 48–52 px, Gewicht 580–650, eng und tabellarisch", () => {
  const fam = decl(".knum", "font-family");
  assert.equal(fam, "var(--fs)", "der Wert muss die vorhandene Sans-Serif --fs nutzen");
  assert.ok(!/var\(--fd\)|Cormorant|serif/i.test(fam || ""), "kein Serifensatz im KPI-Wert");

  const size = parseFloat(decl(".knum", "font-size"));
  assert.ok(size >= 48 && size <= 52, `KPI-Wert Desktop soll 48–52 px sein, ist ${size}px`);

  const weight = Number(decl(".knum", "font-weight"));
  assert.ok(weight >= 580 && weight <= 650, `Gewicht soll 580–650 sein, ist ${weight}`);

  const ls = parseFloat(decl(".knum", "letter-spacing"));
  assert.ok(Math.abs(ls - -0.035) <= 0.006, `Letter-Spacing soll etwa -0.035em sein, ist ${ls}em`);

  assert.equal(decl(".knum", "font-variant-numeric"), "tabular-nums");
  assert.equal(decl(".knum", "color"), "var(--ce-kpi-value)");
  assert.equal(tok("ce-kpi-value"), tok("ce-kpi-navy"), "der Wert trägt das Marken-Navy");
  assert.equal(tok("ce-kpi-navy"), "#111a33", "Navy ist die vorgegebene Markenfarbe");
});

test("18 — das Gewicht 600 wird von der Schrift wirklich gerendert", () => {
  // Gemessen: Libre Franklin liegt nur als 700/800 vor und rendert bei 600
  // unverändert die 700er-Schnittstelle. DM Sans ist eine Variable Font, deren
  // wght-Achse über die @font-face-Deklarationen instanziiert wird. Fehlt die
  // 600er-Deklaration, fällt der Wert still auf 500 zurück — sichtbar dünner,
  // ohne dass irgendein anderer Test das bemerkt.
  const dm = fontsCss.match(/@font-face\s*\{[^}]*font-family:\s*'DM Sans'[^}]*\}/g) || [];
  const gewichte = dm.map((f) => Number((f.match(/font-weight:\s*(\d+)/) || [])[1]))
    .filter((w) => !Number.isNaN(w));
  assert.ok(gewichte.includes(600),
    `DM Sans braucht eine @font-face-Deklaration mit font-weight: 600, vorhanden: ${gewichte.join(", ")}`);
});

test("19 — die Beschriftung ist keine Versalzeile mehr", () => {
  assert.equal(decl(".pp-kpi-label", "text-transform"), "none", "Versalien sind ausdrücklich abgeschafft");
  const size = parseFloat(decl(".pp-kpi-label", "font-size"));
  assert.ok(size >= 12 && size <= 13, `Beschriftung soll 12–13 px sein, ist ${size}px`);
  const weight = Number(decl(".pp-kpi-label", "font-weight"));
  assert.ok(weight >= 500 && weight <= 600, `mittleres bis semibold Gewicht erwartet, ist ${weight}`);
  const ls = parseFloat(decl(".pp-kpi-label", "letter-spacing"));
  assert.ok(Math.abs(ls) <= 0.02, `nur sehr geringes Letter-Spacing erlaubt, ist ${ls}em`);
});

test("20 — in der KPI-Sektion kommt kein Serifensatz vor", () => {
  const sektion = kpiSektion();
  assert.ok(!/var\(--fd\)/.test(sektion), "--fd ist die Serifenschrift und gehört nicht in die KPI-Karten");
  assert.ok(!/Cormorant|Georgia/i.test(sektion), "keine dekorative Serifenschrift in der KPI-Sektion");
  // Die frühere Serifen-/Monolage der Zahlen ist weg.
  assert.notEqual(decl(".knum", "font-family"), "var(--fh)");
  assert.ok(!/var\(--fm\)/.test(sektion), "die Monoschrift der alten Chips ist nicht mehr nötig");
});

test("21 — vier optisch abgestimmte Line-Icons", () => {
  const erwartet = ["packageMove", "routeArrow", "seal", "clockDelay"];
  const block = overviewCode.slice(overviewCode.indexOf("const KPIS = ["));
  const arr = block.slice(0, block.indexOf("];") + 2);
  const benutzt = [...arr.matchAll(/icon:\s*"([A-Za-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(benutzt, erwartet, `erwartete Iconfolge, gefunden: ${JSON.stringify(benutzt)}`);

  for (const n of erwartet) {
    const m = iconSrc.match(new RegExp(`\\b${n}:\\s*"([^"]+)"`));
    assert.ok(m, `das Icon ${n} fehlt im paths-Objekt`);
    assert.ok(m[1].length > 20, `${n} sieht nicht wie ein echter Pfad aus`);
    // Alle vier müssen im selben Koordinatenraum gezeichnet sein, sonst wirken
    // sie trotz gleicher viewBox unterschiedlich groß. Geprüft wird der
    // Zahlenraum des Pfades — ein versehentlich in 32er- oder 48er-Einheiten
    // gezeichnetes Icon fällt damit sofort auf. Die feinere optische Abstimmung
    // ist eine Sichtprüfung und lässt sich hier ohne Pfad-Parser nicht messen:
    // die maximale LITERALE Zahl sagt wenig über die reale Ausdehnung (relative
    // Kurvenbefehle verschieben den Endpunkt, ohne als Zahl aufzutauchen).
    const zahlen = (m[1].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    assert.ok(Math.max(...zahlen) <= 24, `${n} verlässt den 24er-Koordinatenraum`);
    assert.ok(Math.min(...zahlen) >= -24, `${n} enthält eine unplausible Koordinate`);
  }
  // Der alte Sonderfall truck (Rechtecke + Kreise statt Pfad) wird nicht mehr
  // in den Karten verwendet — er war der Bruch im Icon-Satz.
  assert.ok(!arr.includes('"truck"'), "der Lieferwagen ist ersetzt");
  assert.ok(!arr.includes('"check"'), "der nackte Haken ist durch das Prüfsiegel ersetzt");

  // Gemeinsame Linienführung kommt aus der Komponente …
  assert.match(iconSrc, /strokeLinecap="round"/, "runde Linienenden");
  assert.match(iconSrc, /strokeLinejoin="round"/, "runde Linienverbindungen");
  assert.match(iconSrc, /viewBox="0 0 24 24"/, "gemeinsame viewBox");
  // … die Strichstärke 1.6 setzt das Stylesheet nur für die KPI-Karten.
  assert.equal(decl(".pp-kpi-icon svg", "stroke-width"), "1.6",
    "die einheitliche Strichstärke 1.6 fehlt");
  assert.match(overviewCode, /<Icon n=\{kpi\.icon\} s=\{19\} \/>/, "sichtbare Icongröße 19 px");
});

test("22 — der Icon-Squircle ist 36 × 36 mit Radius 11–12 px und kein Kreis", () => {
  assert.equal(decl(".pp-kpi-icon", "width"), "36px");
  assert.equal(decl(".pp-kpi-icon", "height"), "36px");
  const r = parseFloat(decl(".pp-kpi-icon", "border-radius"));
  assert.ok(r >= 11 && r <= 12, `Radius soll 11–12 px sein, ist ${r}px`);
  assert.notEqual(decl(".pp-kpi-icon", "border-radius"), "50%", "ausdrücklich keine kreisförmige Umrandung");
  // Fläche und Kante tragen die Kartenfarbe, gefüllt wird nichts.
  assert.equal(decl(".pp-kpi-icon", "background"), "var(--kf)");
  assert.equal(decl(".pp-kpi-icon", "color"), "var(--kc)");
  for (const k of KARTEN) {
    const face = tok(`ce-kpi-${k}-face`);
    const alpha = parseColor(face)[3];
    assert.ok(alpha <= 0.12, `${k}: die Squircle-Fläche darf keine Vollfarbe sein (Alpha ${alpha})`);
  }
  // Die KPI-Karten benutzen das runde .pp-medal nicht mehr.
  assert.ok(!overviewCode.includes("pp-medal m-hero") && !/pp-kpi[^"]*pp-medal/.test(overviewCode),
    "die Karten tragen kein Medaillon mehr");
});

test("23 — Kartenoberfläche: Radius, Rahmen, Verlauf, Innenkante, Schatten, Eckschimmer", () => {
  assert.equal(decl(".pp-kpi", "border-radius"), "20px");
  assert.equal(decl(".pp-kpi", "border"), "1px solid var(--ce-kpi-border)");

  // Feiner Rahmen mit geringer Navy-Deckkraft.
  const [br, bg, bb, ba] = parseColor(tok("ce-kpi-border"));
  assert.ok(ba <= 0.14, `der Rahmen ist zu deckend (Alpha ${ba})`);
  assert.ok(bb > br, "der Rahmen muss Navy sein, nicht neutralgrau");

  // Verlauf von (fast) Weiß zu sehr hellem Blau-Grau, leicht transparent.
  const verlauf = tok("ce-kpi-surface");
  assert.match(verlauf, /^linear-gradient/, "die Fläche braucht den zurückhaltenden linearen Verlauf");
  const stopps = verlauf.match(/rgba?\([^)]*\)/g) || [];
  assert.ok(stopps.length >= 2, "der Verlauf braucht mindestens zwei Stopps");
  assert.ok(parseColor(stopps[0])[3] < 1, "die Fläche ist bewusst leicht transparent");
  const kopf = parseColor(stopps[0]), fuss = parseColor(stopps[stopps.length - 1]);
  assert.ok(luminance(kopf) > luminance(fuss), "der Verlauf läuft von hell nach etwas dunkler");
  assert.ok(fuss[2] > fuss[0], "der Fuß liegt im Blau-Grau, nicht im Warmton");

  // Innerer Lichtreflex oben + weicher, großflächiger Schatten.
  const schatten = tok("ce-kpi-shadow");
  assert.match(schatten, /inset 0 1px 0 rgba\(255, 255, 255/, "die innere Lichtkante oben fehlt");
  const weit = [...schatten.matchAll(/0 (\d+)px (\d+)px/g)].map((m) => Number(m[2]));
  assert.ok(Math.max(...weit) >= 20, "der Schatten soll weich und großflächig sein");
  for (const a of schatten.match(/rgba\([^)]*\)/g) || []) {
    const al = parseColor(a)[3];
    if (parseColor(a)[0] < 100) assert.ok(al <= 0.3, `Schattenanteil zu deckend (${al}) — kein harter Standardschatten`);
  }

  // Sehr schwacher, kartenspezifischer Farbschimmer rechts oben.
  const bgDecl = rule(".pp-kpi").match(/background:([\s\S]*?);/)[1];
  assert.match(bgDecl, /radial-gradient\([^)]*at 100% 0%/, "der Eckschimmer sitzt rechts oben");
  assert.ok(bgDecl.includes("var(--kt)"), "der Eckschimmer muss kartenspezifisch sein");
  const toene = new Set();
  for (const k of KARTEN) {
    const t = tok(`ce-kpi-${k}-tint`);
    assert.ok(parseColor(t)[3] <= 0.09, `${k}: der Schimmer ist zu kräftig — kein Glow, kein Neon`);
    toene.add(t);
  }
  assert.equal(toene.size, 4, "jede Karte braucht ihren eigenen Schimmer");
});

test("24 — keine hervorgehobene erste Karte mehr", () => {
  assert.ok(!css.includes(".pp-kpi-hero"), "die Sonderregel der ersten Karte ist entfallen");
  assert.ok(!overview.includes("pp-kpi-hero"), "die Sonderklasse wird nicht mehr gerendert");
  assert.ok(!overviewCode.includes('kpi.key === "active" ?'),
    "es darf keine Verzweigung mehr auf die erste Karte geben");
  // Auch nicht über die generische Kachel: .tile brächte wieder eine zweite,
  // abweichende Oberfläche auf dieselben Karten.
  assert.ok(!/pp-kpi tile|tile pp-kpi/.test(overviewCode), "die KPI-Karte trägt ihre Fläche selbst");
  // Alle vier Karten laufen durch dieselben Regeln, nur --kc/--kf/--ke/--kt
  // unterscheiden sich.
  for (const k of KARTEN) {
    const body = rule(`.kt-${k}`);
    assert.ok(body, `die Kartenklasse .kt-${k} fehlt`);
    for (const v of ["--kc", "--kf", "--ke", "--kt"]) {
      assert.ok(body.includes(v), `.kt-${k} setzt ${v} nicht`);
    }
    assert.ok(!/border|box-shadow|background|font/.test(body),
      `.kt-${k} darf nur Farben setzen, keine eigene Oberfläche`);
  }
});

test("25 — im KPI-Block stehen keine Farbliterale", () => {
  const sektion = kpiSektion();
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(sektion),
    "Farben gehören als --ce-kpi-* nach variables.css, nicht als Hex in overview.css");
  // Einzige zulässige rgba-Angabe ist der transparente Endstopp des Schimmers.
  const rgbas = (sektion.match(/rgba?\([^)]*\)/g) || []).filter((v) => parseColor(v)[3] !== 0);
  assert.deepEqual(rgbas, [], `unerwartete Farbliterale: ${rgbas.join(", ")}`);
});

test("26 — die Karten geben sich nicht als bedienbar aus", () => {
  const body = rule(".pp-kpi");
  assert.ok(!/cursor:\s*pointer/.test(body), "kein pointer-Cursor auf einer reinen Informationsfläche");
  assert.ok(!/onClick|role="button"|tabIndex/.test(
    overviewCode.slice(overviewCode.indexOf('className={`pp-kpi'), overviewCode.indexOf("pp-kpi-head"))),
    "die Karte darf nicht klickbar werden");
  // Höchstens Rahmen und Schatten dürfen sich bewegen — kein Anheben, kein Zoom.
  const hover = rule(".pp-kpi:hover");
  assert.ok(hover, "die zurückhaltende Hover-Rückmeldung fehlt");
  assert.ok(!/transform|translate|scale|margin|top:/.test(hover),
    "kein Hochspringen und keine Skalierung beim Hover");
  for (const prop of hover.split(";").map((s) => s.split(":")[0].trim()).filter(Boolean)) {
    assert.ok(["border-color", "box-shadow"].includes(prop), `Hover darf ${prop} nicht verändern`);
  }
  // Keine Dauer-Animation.
  const sektion = kpiSektion();
  assert.ok(!/animation:/.test(sektion), "keine dauerhaft laufende Animation");
  // prefers-reduced-motion schaltet den Übergang ab.
  const rm = cssBare.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(rm, "prefers-reduced-motion wird nicht respektiert");
  assert.match(rm[1], /\.pp-kpi\s*\{[^}]*transition:\s*none/, "der Übergang muss dort abgeschaltet werden");
});

test("27 — Textfarben erfüllen WCAG AA, Icon-Striche erreichen 3:1", () => {
  const label = contrast(tok("ce-kpi-label"), GRUND_FUSS);
  const kontext = contrast(tok("ce-kpi-context"), GRUND_FUSS);
  const wert = contrast(tok("ce-kpi-value"), GRUND_FUSS);
  assert.ok(label >= 4.5, `Beschriftung nur ${label.toFixed(2)}:1`);
  assert.ok(kontext >= 4.5, `Kontextzeile nur ${kontext.toFixed(2)}:1`);
  assert.ok(wert >= 7, `Wert nur ${wert.toFixed(2)}:1 — die dominante Zahl soll klar über AA liegen`);

  // Icon: Strich gegen die eigene Squircle-Fläche, die ihrerseits auf dem
  // Kartenkopf INKLUSIVE Eckschimmer liegt (das Icon sitzt rechts oben).
  for (const k of KARTEN) {
    const mitSchimmer = over(tok(`ce-kpi-${k}-tint`), GRUND_KOPF);
    const flaeche = over(tok(`ce-kpi-${k}-face`), mitSchimmer);
    const c = contrast(tok(`ce-kpi-${k}`), flaeche);
    assert.ok(c >= 3, `${k}: Icon-Strich nur ${c.toFixed(2)}:1 gegen die eigene Fläche`);
  }
});

test("28 — die vier Kontextzeilen sind gesetzt und wiederholen sich nicht", () => {
  const block = overviewCode.slice(overviewCode.indexOf("const KPIS = ["));
  const arr = block.slice(0, block.indexOf("];") + 2);
  const texte = [...arr.matchAll(/context:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(texte, [
    "Noch nicht abgeschlossen",
    "Auf dem Weg zum Empfänger",
    "Im aktuellen Monat",
    "Über dem geplanten Liefertermin",
  ], `erwartete Kontextzeilen, gefunden: ${JSON.stringify(texte)}`);
  assert.equal(new Set(texte).size, 4, "keine wiederholte generische Angabe");
  assert.ok(!overview.includes("Aktueller Stand"), "„Aktueller Stand“ stand dreimal identisch da");

  // Die vorige Fassung „Aktuell laufend" ist bewusst ersetzt — Regressionsschutz,
  // damit sie nicht versehentlich zurückkehrt.
  assert.ok(!overview.includes("Aktuell laufend"),
    "die vorige Kontextzeile „Aktuell laufend“ soll nicht mehr vorkommen");

  // „Aktuell im Versandprozess" wäre für isActive() zu viel behauptet: dort
  // zählen auch pending/approved, also noch nicht übergebene Sendungen. Der
  // Auftrag sieht für genau diesen Fall den neutralen Text vor.
  assert.ok(!overview.includes("Aktuell im Versandprozess"),
    "der Text passt nicht zur Definition aktiver Sendungen");
  const kpis = src("../../utils/kpis.mjs");
  assert.match(kpis, /ACTIVE_BUSINESS_STATUSES = \[[\s\S]*?"pending"/,
    "Grundlage der Entscheidung: pending zählt als aktiv");
});

test("29 — keine erfundenen Trends, Chips, Diagramme oder Statuspunkte", () => {
  const start = overviewCode.indexOf('<div className="pp-kpis">');
  const ende = overviewCode.indexOf("{/* ── Ablauf ── */}");
  const block = overviewCode.slice(start, ende);
  for (const verboten of ["kchip", "trendingUp", "ce-live", "d-blue", "d-green", "d-amber", "%"]) {
    assert.ok(!block.includes(verboten), `${verboten} gehört nicht mehr in die KPI-Karten`);
  }
  assert.ok(!css.includes(".kchip"), "die Chip-Regeln sind entfallen");
  // Die 24-Stunden-Angabe bleibt, sie ist eine echte Zahl aus computeKpis —
  // aber als schlichter Nachsatz, nicht als Trendabzeichen.
  assert.match(overviewCode, /const activeNote = k\.hasCreatedAt && k\.new24 > 0/,
    "die echte 24-Stunden-Angabe darf nicht stillschweigend verschwinden");
  assert.match(overviewCode, /\{kpi\.note && <span className="pp-kpi-note"> · \{kpi\.note\}<\/span>\}/);
});

test("30 — die gesamte Vierspaltenreihe teilt sich EINE Typografie- und Abstandsstufe", () => {
  // Die früheren Feinabstimmungs-Bereiche (981–1240 px) verkleinerten Schrift
  // und Abstand als Notbehelf gegen den Labelumbruch. Diese Sonderbehandlung
  // ist entfallen — nicht weil der Umbruch jetzt unmöglich wäre (er bleibt bei
  // 1081–1200 px bestehen, siehe Test 31), sondern weil die Vorgabe „keine
  // künstlich verkleinerte Schrift" verbietet, ihn auf diesem Weg zu
  // kaschieren. Innenabstand, Icon- und Wertgröße kommen deshalb in der
  // GESAMTEN Vierspaltenreihe (> 1080 px) nur noch aus der Grundstufe.
  assert.equal(decl(".pp-kpi", "padding"), "22px 22px 20px");
  assert.equal(decl(".pp-kpi-icon", "width"), "36px");
  // Paket A, Phase 2.5: der KPI-Wert liegt jetzt exakt auf der Numeric-Display-
  // Stufe (48px) statt auf dem freien Zwischenwert 50px. Test 17 (48–52 px)
  // bleibt die inhaltliche Zusicherung, diese Zeile pinnt nur den Istwert.
  assert.equal(decl(".knum", "font-size"), "48px");

  // Nur noch eine einzige Bereichsabfrage-Art ist zulässig: keine — die
  // gesamte KPI-Feinabstimmung läuft jetzt über zwei einfache max-width-Stufen
  // (1080/560, siehe Test 4 und 31).
  const bereiche = [...cssBare.matchAll(/@media \(min-width: \d+px\) and \(max-width: \d+px\)\s*\{/g)];
  assert.equal(bereiche.length, 0,
    "es sollte keine min-width/max-width-Bereichsabfrage mehr geben — mit dem 1080-px-Breakpoint hinfällig");

  // Und die tote Tonpalette der alten Medaillons ist weg.
  for (const tot of [".m-mint", ".m-green", ".m-amber", ".m-hero", ".m-lav", ".m-violet"]) {
    assert.ok(!css.includes(tot), `${tot} wird von keinem Markup mehr referenziert`);
  }
});

test("32 — Icon.jsx ist durch den Oberflächen-Feinschliff unverändert (Icon-Sperre)", () => {
  // Strikte Sperre: die vier KPI-Icons sind freigegeben und dürfen sich in
  // diesem Auftrag nicht ändern — weder Pfad noch viewBox noch Linienstil.
  // Exakte Locked-Reference statt eines Hashs, damit ein Fehlschlag sofort
  // zeigt, WAS sich geändert hat.
  const GESPERRT = {
    packageMove: "M14.5 4.2 21.2 8.1v7.8l-6.7 3.9-6.7-3.9V8.1zM7.8 8.1 14.5 12l6.7-3.9M14.5 12v7.8M1.6 8.4h4M1 12h3.4M1.6 15.6h4",
    routeArrow: "M4.8 16.5a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2zM17.1 3.3a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2zM6.9 18.6h5.6a4.6 4.6 0 0 0 4.6-4.6v-3.1M14.9 13.1 17.1 10.9l2.2 2.2",
    seal: "M12 2.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM9 9.6l2.1 2.1 3.9-3.9M8.6 15.7 7 21.5l5-2.4 5 2.4-1.6-5.8",
    clockDelay: "M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8.6V13l3 1.8M12 2.5a10.5 10.5 0 0 1 7 2.7",
  };
  for (const [name, pfad] of Object.entries(GESPERRT)) {
    const m = iconSrc.match(new RegExp(`\\b${name}:\\s*"([^"]+)"`));
    assert.ok(m, `${name} fehlt in Icon.jsx`);
    assert.equal(m[1], pfad, `${name}: der SVG-Pfad hat sich geändert — die Icons sind gesperrt`);
  }
  // Größe/Position/Strichstärke der Icons kommen aus overview.css (KPI-Squircle)
  // bzw. aus dem Icon-Aufruf in Overview.jsx — beide bleiben unverändert.
  assert.equal(decl(".pp-kpi-icon", "width"), "36px");
  assert.equal(decl(".pp-kpi-icon", "height"), "36px");
  assert.equal(parseFloat(decl(".pp-kpi-icon", "border-radius")).toFixed(1), "11.5");
  assert.equal(decl(".pp-kpi-icon svg", "stroke-width"), "1.6");
  assert.match(overviewCode, /<Icon n=\{kpi\.icon\} s=\{19\} \/>/, "sichtbare Icongröße 19 px");
  assert.match(iconSrc, /viewBox="0 0 24 24"/);
  assert.match(iconSrc, /strokeLinecap="round"/);
  assert.match(iconSrc, /strokeLinejoin="round"/);
  // Die Icon-Farben (Strich/Fläche/Kante des Squircles) sind Teil der Sperre —
  // nur der kartenspezifische Eckschimmer (-tint) durfte sich ändern.
  for (const k of KARTEN) {
    assert.match(tok(`ce-kpi-${k}-face`), /^rgba\(/);
    assert.match(tok(`ce-kpi-${k}-edge`), /^rgba\(/);
  }
  assert.equal(tok("ce-kpi-active-face"), "rgba(83, 103, 232, 0.08)");
  assert.equal(tok("ce-kpi-active-edge"), "rgba(83, 103, 232, 0.18)");
  assert.equal(tok("ce-kpi-transit-face"), "rgba(63, 111, 166, 0.08)");
  assert.equal(tok("ce-kpi-transit-edge"), "rgba(63, 111, 166, 0.2)");
  assert.equal(tok("ce-kpi-delivered-face"), "rgba(18, 128, 105, 0.08)");
  assert.equal(tok("ce-kpi-delivered-edge"), "rgba(18, 128, 105, 0.2)");
  assert.equal(tok("ce-kpi-delayed-face"), "rgba(176, 122, 24, 0.09)");
  assert.equal(tok("ce-kpi-delayed-edge"), "rgba(176, 122, 24, 0.22)");
  // Und die Statusfarben (Icon-Strich) selbst — unverändert.
  assert.equal(tok("ce-kpi-active"), "#5367e8");
  assert.equal(tok("ce-kpi-transit"), "#3f6fa6");
  assert.equal(tok("ce-kpi-delivered"), "#128069");
  assert.equal(tok("ce-kpi-delayed"), "#b07a18");
});

test("33 — Oberflächen-Feinschliff: Rahmen, Verlauf und Schatten in den vorgegebenen Zielkorridoren", () => {
  // Rahmen: von ~9 % auf 11–12 % angehoben.
  const rahmenAlpha = parseColor(tok("ce-kpi-border"))[3];
  assert.ok(rahmenAlpha >= 0.11 && rahmenAlpha <= 0.12,
    `Rahmen soll 11–12 % Deckkraft haben, ist ${(rahmenAlpha * 100).toFixed(1)}%`);
  const hoverAlpha = parseColor(tok("ce-kpi-border-hover"))[3];
  assert.ok(hoverAlpha > rahmenAlpha, "der Hover-Rahmen muss sichtbar über der Grundstufe liegen");

  // Verlauf: Kopf/Fuß-Differenz erkennbar, aber nicht schwer — geprüft an der
  // literalen RGB-Differenz zwischen erstem und letztem Stopp (mehr als vorher,
  // aber einstellig bis niedrig-zweistellig pro Kanal, kein harter Sprung).
  const kopf = parseColor(VERLAUF[0]), fuss = parseColor(VERLAUF[VERLAUF.length - 1]);
  const delta = Math.abs(kopf[0] - fuss[0]) + Math.abs(kopf[1] - fuss[1]) + Math.abs(kopf[2] - fuss[2]);
  assert.ok(delta >= 15, `Kopf/Fuß-Differenz zu schwach für „besser erkennbar“ (Summe ${delta})`);
  assert.ok(delta <= 60, `Kopf/Fuß-Differenz zu stark — Vorgabe verlangt „nicht schwer“ (Summe ${delta})`);
  assert.ok(fuss[2] > fuss[0], "der Fuß bleibt im Blau-Grau, nicht im Warm- oder Neutralton");

  // Schatten: zweistufig — ein knapper Kontaktschatten (Blur ≤ 3px) UND ein
  // größerer, weicher Umgebungsschatten (Blur ≥ 20px), beide niedrig deckend.
  const schatten = tok("ce-kpi-shadow");
  const ebenen = [...schatten.matchAll(/0 (\d+)px (\d+)px(?: (-?\d+)px)? (rgba\([^)]*\))/g)]
    .map(([, , blur, , farbe]) => ({ blur: Number(blur), alpha: parseColor(farbe)[3] }));
  assert.ok(ebenen.some((e) => e.blur <= 3), "der Kontaktschatten fehlt (Blur ≤ 3px erwartet)");
  assert.ok(ebenen.some((e) => e.blur >= 20), "der weiche Umgebungsschatten fehlt (Blur ≥ 20px erwartet)");
  for (const e of ebenen) assert.ok(e.alpha <= 0.3, `Schattenebene zu deckend (${e.alpha})`);

  // Eckschimmer: höchstens minimal angehoben, bleibt klar unter der 0.09-Grenze.
  for (const k of KARTEN) {
    const alpha = parseColor(tok(`ce-kpi-${k}-tint`))[3];
    assert.ok(alpha > 0.07 && alpha <= 0.085,
      `${k}: Eckschimmer soll nur minimal über der vorigen 0.07 liegen, ist ${alpha}`);
  }
});

test("34 — .pp-kpi hat min-width:0 gegen ungleiche Spaltenbreiten im Grid", () => {
  // Ohne min-width:0 bleibt der Browser-Default min-width:auto in Kraft: eine
  // `1fr`-Spalte darf dann nicht unter den Inhalts-Mindestbedarf ihrer Karte
  // schrumpfen. Card „active" trägt gelegentlich den 24-h-Nachsatz und wird
  // dadurch im Inhalt minimal breiter als die anderen drei — im echten Browser
  // gemessen: 205.7 px vs. 159.1 px bei 1081 px Fensterbreite, ohne dieses
  // Gegenmittel. Dasselbe Muster wie bei `.main-content > *` in
  // dashboard-premium.css (dort für Flex, hier für Grid).
  assert.equal(decl(".pp-kpi", "min-width"), "0");
});

test("35 — .pp-kpi-note bricht bei Bedarf um, statt die Karte zu überlaufen", () => {
  // Der Nachsatz ist ein dynamischer, unbegrenzt langer Text — „128 neu in
  // 24 h" ist länger als „1 neu in 24 h". white-space:nowrap hielt ihn zwar
  // als eine visuelle Einheit zusammen, lief aber im schmalen Vierspalten-
  // raster (1085–1240 px) über die Kartenbreite hinaus (im echten Browser
  // gemessen: scrollWidth 160 px bei 130 px verfügbarer Breite) — ein
  // abgeschnittener Inhalt, den die Vorgabe ausdrücklich verbietet.
  assert.equal(decl(".pp-kpi-note", "white-space"), "normal");
});

test("15 — reloadShipments ist VOR den Effekten deklariert, die es referenzieren", () => {
  // Regression: `const`-Deklarationen liegen in der temporalen Todzone. Standen die
  // beiden Effekte (Seitenwechsel, Monatswechsel) VOR `const reloadShipments`, warf
  // die Komponente beim Rendern „Cannot access 'reloadShipments' before
  // initialization" — die gesamte Dashboardseite blieb leer. Ein reiner Logiktest
  // sieht das nicht; erst der Browser (bzw. die E2E-Suite) deckt es auf.
  const deklaration = dashboardCode.indexOf("const reloadShipments = useCallback");
  assert.ok(deklaration > -1, "reloadShipments fehlt");
  for (const [name, muster] of [
    ["Seitenwechsel", "}, [page, reloadShipments]);"],
    ["Monatswechsel", "}, [reloadShipments]);"],
  ]) {
    const nutzung = dashboardCode.indexOf(muster);
    assert.ok(nutzung > -1, `der Effekt „${name}“ fehlt`);
    assert.ok(nutzung > deklaration,
      `der Effekt „${name}“ steht vor der Deklaration von reloadShipments (temporale Todzone)`);
  }
});
