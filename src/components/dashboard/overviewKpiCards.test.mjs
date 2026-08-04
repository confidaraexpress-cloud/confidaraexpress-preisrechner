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

test("4 — die Breakpoints sind die bestehenden (980 px und 560 px)", () => {
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
    { breite: 980, spalten: "repeat(2, 1fr)" },
    { breite: 560, spalten: "1fr" },
  ], `erwartet genau zwei Stufen in den bestehenden Breakpoints, gefunden: ${JSON.stringify(stufen)}`);
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
  // Beide Abrufwege nehmen an der Sequenz teil …
  assert.equal((dashboardCode.match(/\+\+shipmentsReq\.current/g) || []).length, 2,
    "sowohl fetchData als auch reloadShipments müssen die Sequenz hochzählen");
  // … und beide prüfen sie vor dem Schreiben.
  assert.equal((dashboardCode.match(/seq [=!]== shipmentsReq\.current/g) || []).length, 2,
    "beide Wege müssen vor setState auf Aktualität prüfen");
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
