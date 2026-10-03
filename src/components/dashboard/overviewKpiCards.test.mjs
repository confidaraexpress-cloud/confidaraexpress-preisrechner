// Struktur- und Verhaltenstests des Kennzahlenbands der Kundenübersicht.
//
// Geprüft wird, was reine Logiktests nicht erreichen: wie viele Kennzahlen
// gerendert werden, wie sich das Band über die Breakpoints verhält, wann eine
// Zahl statt „—" erscheint, welche Ereignisse einen Refetch auslösen — und vor
// allem, dass KEIN periodisches API-Polling eingeführt wurde.
//
// Redesign 2026-10: Aus den vier „Executive Metric Cards" (Verlauf, Schatten,
// farbiger Icon-Squircle je Karte) ist EIN kompaktes, flaches Kennzahlenband
// mit vier gleich breiten Zellen geworden (Audit G/H01). Die Tests zum Lade-,
// Refetch- und Polling-Verhalten sowie zu den Kontextzeilen sind unverändert
// übernommen; die Tests zur Optik sichern den neuen, freigegebenen Vertrag.
//
// Bewusst quelltextnah: das Repository hat kein jsdom und keine Renderbibliothek
// für Komponenten.
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
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, "");
const variables = src("../../styles/variables.css").replace(/\/\*[\s\S]*?\*\//g, "");

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
function rgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(c) {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(rgb(a)), luminance(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
// Der Abschnitt des Kennzahlenbands im Stylesheet (Grundstufe).
function bandSektion() {
  const start = cssBare.indexOf(".ov-kpis {");
  const ende = cssBare.indexOf(".ov-mod {", start);
  assert.ok(start > -1 && ende > start, "der Abschnitt des Kennzahlenbands ist nicht auffindbar");
  return cssBare.slice(start, ende);
}

// ── Genau vier Kennzahlen ───────────────────────────────────────────────────
test("1 — die Übersicht rendert genau VIER Kennzahlen in EINEM Band", () => {
  const block = overviewCode.slice(overviewCode.indexOf("const KPIS = ["));
  const arr = block.slice(0, block.indexOf("];") + 2);
  const keys = [...arr.matchAll(/key:\s*"([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["active", "transit", "delivered", "delayed"], "Bestand/Reihenfolge der Kennzahlen");
  const labels = [...arr.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Aktive Sendungen", "In Zustellung", "Zugestellt", "Verzögert"]);
  // EIN Band (section mit Bezeichnung), darin je Kennzahl eine Zelle.
  assert.match(overviewCode, /<section className="ov-kpis" aria-label="Betriebsüberblick">/, "das Band fehlt");
  assert.match(overviewCode, /\{KPIS\.map\(\(kpi\) => \(\s*<div className=\{`ov-kpi ov-kpi--\$\{kpi\.key\}`\} key=\{kpi\.key\}>/,
    "jede Kennzahl ist eine Zelle des Bands");
  assert.ok(!/pp-kpi\b|pp-kpis\b/.test(overviewCode), "die alten Kartenklassen sind zurück");
});

test("2 — keine Symbole im Kennzahlenband (Redesign 2026-10)", () => {
  const block = overviewCode.slice(overviewCode.indexOf("const KPIS = ["));
  const arr = block.slice(0, block.indexOf("];") + 2);
  assert.ok(!/icon:/.test(arr), "die Kennzahlen tragen wieder Iconnamen");
  assert.ok(!/<Icon\b/.test(overviewCode), "die Übersicht rendert wieder ein Symbol");
  assert.ok(!/from "\.\.\/ui\/Icon"/.test(overviewCode), "der Icon-Import der Übersicht ist überflüssig");
});

test("3 — das Band ist 4 Zellen breit, ab 1080 px 2 × 2 — nie ein vierfacher Stapel", () => {
  assert.equal(decl(".ov-kpis", "grid-template-columns"), "repeat(4, minmax(0, 1fr))");
  const stufe = cssBare.match(/@media \(max-width: 1080px\) \{([\s\S]*?)\n\}/);
  assert.ok(stufe, "die 1080-px-Stufe fehlt");
  assert.match(stufe[1], /\.ov-kpis \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/,
    "unter 1080 px steht das Band nicht 2 × 2");
  // Auf dem Telefon bleibt es 2 × 2 (Audit: „KPI 2 × 2") — keine einspaltige Stufe.
  const einspaltig = [...cssBare.matchAll(/\.ov-kpis \{[^}]*grid-template-columns:\s*(?:1fr|minmax\(0, 1fr\))\s*;/g)];
  assert.equal(einspaltig.length, 0, "das Band darf auf keiner Breite einspaltig werden");
  // Zellen geben ihre Mindestbreite ab, damit eine Zelle mit Nachsatz die
  // anderen nicht verdrängt.
  assert.equal(decl(".ov-kpi", "min-width"), "0");
});

test("4 — Trennung der Zellen über Haarlinien, nicht über Karten", () => {
  assert.match(rule(".ov-kpi + .ov-kpi"), /border-left:\s*1px solid var\(--ce-kpi-divider\)/,
    "die Zellen sind nicht durch Haarlinien getrennt");
  const stufe = cssBare.match(/@media \(max-width: 1080px\) \{([\s\S]*?)\n\}/)[1];
  assert.match(stufe, /\.ov-kpi:nth-child\(odd\) \{ border-left: 0; \}/, "2 × 2: linke Spalte ohne Linie");
  assert.match(stufe, /\.ov-kpi:nth-child\(n \+ 3\) \{ border-top: 1px solid var\(--ce-kpi-divider\); \}/,
    "2 × 2: zweite Zeile mit Linie");
});

// ── Lade-, Fehler- und Nullverhalten ────────────────────────────────────────
test("5 — eine Zahl erscheint erst nach erfolgreichem Laden, sonst „—“", () => {
  assert.match(overviewCode, /const ready = kpisReady === undefined \? !loading : kpisReady;/,
    "das Bereitschafts-Gate fehlt oder wurde umbenannt");
  assert.match(overviewCode, /<span className="ov-kpi-value">\{ready \? kpi\.value : "—"\}<\/span>/,
    "die Kennzahl muss am Bereitschafts-Gate hängen, nicht an loading");
  assert.ok(!/\{loading \? "—" : kpi\.value\}/.test(overviewCode),
    "der alte loading-Ternary würde nach einem Fehler eine falsche 0 zeigen");
  // Solange nicht bereit: Statustext statt Kontextzeile.
  assert.match(overviewCode, /\{!ready \? \(loading \? "Wird geladen…" : "Noch nicht verfügbar"\) : \(/,
    "der Lade-/Nichtverfügbar-Text fehlt");
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

/* ═══════════════════════════════════════════════════════════════════════════
   Visuelles System des Kennzahlenbands (Redesign 2026-10)
   ═══════════════════════════════════════════════════════════════════════════ */

test("16 — Lesereihenfolge: Beschriftung → Zahl → Kontext", () => {
  const zelle = overviewCode.slice(overviewCode.indexOf("{KPIS.map((kpi) => ("));
  const l = zelle.indexOf('className="ov-kpi-label"');
  const v = zelle.indexOf('className="ov-kpi-value"');
  const c = zelle.indexOf('className="ov-kpi-context"');
  assert.ok(l > -1 && v > l && c > v, "Reihenfolge Beschriftung → Zahl → Kontext verletzt");
});

test("17 — die Zahl ist DM Sans 32/38, Gewicht 600, eng und tabellarisch", () => {
  assert.equal(decl(".ov-kpi-value", "font-family"), "var(--ce-font-numeric)");
  assert.equal(decl(".ov-kpi-value", "font-size"), "var(--ce-text-numeric-display-size)");
  assert.equal(decl(".ov-kpi-value", "font-weight"), "var(--ce-text-numeric-display-weight)");
  assert.equal(tok("ce-text-numeric-display-size"), "32px");
  assert.equal(tok("ce-text-numeric-display-weight"), "600");
  assert.equal(tok("ce-text-numeric-display-tracking"), "-0.02em");
  assert.match(rule(".ov-kpi-value"), /font-variant-numeric:\s*tabular-nums/, "Zahlen tabellarisch");
  // Mobil eine Stufe kleiner, aber nicht winzig.
  assert.equal(tok("ce-text-numeric-display-size-mobile"), "28px");
  assert.match(cssBare, /\.ov-kpi-value \{ font-size: var\(--ce-text-numeric-display-size-mobile\); \}/);
});

test("18 — Beschriftung 13/18 500, keine Versalien; Kontext 12/18", () => {
  assert.equal(decl(".ov-kpi-label", "font-size"), "var(--ce-text-label-size)");
  assert.equal(decl(".ov-kpi-label", "font-weight"), "var(--ce-text-label-weight)");
  assert.equal(tok("ce-text-label-size"), "13px");
  assert.equal(tok("ce-text-label-weight"), "500");
  assert.ok(!/text-transform|letter-spacing/.test(rule(".ov-kpi-label")), "keine Versalzeile");
  assert.equal(decl(".ov-kpi-context", "font-size"), "var(--ce-text-caption-size)");
});

test("19 — in der Übersicht kommt kein Serifensatz mehr vor", () => {
  assert.ok(!/--fd\b|ce-font-display|Cormorant/.test(cssBare), "Serifensatz in overview.css");
  assert.ok(!/pp-h1|pp-hname|getGreeting/.test(overviewCode), "der Serifengruß ist zurück");
});

test("20 — ruhige Fläche: weiß, 1-px-Kante, Radius 12, sehr leichter Schatten, kein Verlauf", () => {
  const band = rule(".ov-kpis");
  assert.match(band, /background:\s*var\(--ce-kpi-surface\)/);
  assert.match(band, /border:\s*1px solid var\(--ce-kpi-border\)/);
  assert.match(band, /border-radius:\s*var\(--ce-radius-lg\)/);
  assert.equal(tok("ce-radius-lg"), "12px");
  assert.equal(tok("ce-kpi-surface"), "#ffffff");
  const sektion = bandSektion();
  // Veredelung 2026-10: das Band löst sich mit der leichten Tiefe der
  // Arbeitsflächen vom Grund — aus der Skala, kein freier oder stärkerer Wert.
  assert.match(band, /box-shadow:\s*var\(--ce-elevation-1\)/, "das Band trägt nicht die leichte Tiefe der Arbeitsflächen");
  assert.ok(!/box-shadow:(?!\s*var\(--ce-elevation-1\))/.test(sektion), "das Band trägt einen freien oder stärkeren Schatten");
  assert.ok(!/gradient\(/.test(sektion), "das Band trägt keinen Verlauf");
});

test("21 — im Band stehen keine Farbliterale", () => {
  const literale = bandSektion().match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) || [];
  assert.deepEqual(literale, [], `Farbliterale im Kennzahlenband: ${literale.join(", ")}`);
});

test("22 — die Zellen geben sich nicht als bedienbar aus", () => {
  const sektion = bandSektion();
  assert.ok(!/cursor:\s*pointer/.test(sektion), "kein Zeigercursor auf Informationszellen");
  assert.ok(!/\.ov-kpi:hover/.test(cssBare), "keine Hover-Reaktion auf Informationszellen");
  const zelle = overviewCode.slice(overviewCode.indexOf("{KPIS.map((kpi) => ("),
    overviewCode.indexOf("</section>", overviewCode.indexOf("{KPIS.map((kpi) => (")));
  assert.ok(!/onClick|role="button"|tabIndex|<button/.test(zelle), "eine Kennzahl ist bedienbar geworden");
});

test("23 — Textfarben erfüllen WCAG AA auf der Bandfläche", () => {
  const flaeche = tok("ce-kpi-surface");
  for (const [rolle, min] of [["ce-kpi-value", 4.5], ["ce-kpi-label", 4.5], ["ce-kpi-context", 4.5]]) {
    const c = contrast(tok(rolle), flaeche);
    assert.ok(c >= min, `${rolle}: ${c.toFixed(2)}:1 unterschreitet ${min}:1`);
  }
});

test("29 — keine erfundenen Trends, Chips, Diagramme oder Statuspunkte", () => {
  const start = overviewCode.indexOf('<section className="ov-kpis"');
  const ende = overviewCode.indexOf("</section>", start);
  const block = overviewCode.slice(start, ende);
  for (const verboten of ["kchip", "trendingUp", "ce-live", "%", "<svg", "chart"]) {
    assert.ok(!block.includes(verboten), `${verboten} gehört nicht ins Kennzahlenband`);
  }
  // Die 24-Stunden-Angabe bleibt, sie ist eine echte Zahl aus computeKpis —
  // als schlichter Nachsatz, nicht als Trendabzeichen.
  assert.match(overviewCode, /const activeNote = k\.hasCreatedAt && k\.new24 > 0/,
    "die echte 24-Stunden-Angabe darf nicht stillschweigend verschwinden");
  assert.match(overviewCode, /\{kpi\.note && <span className="ov-kpi-note"> · \{kpi\.note\}<\/span>\}/);
  assert.equal(decl(".ov-kpi-note", "white-space"), "normal", "der Nachsatz bricht bei Bedarf um");
});

test("30 — die KPI-Berechnung ist unverändert (Serveraggregat, sonst computeKpis)", () => {
  assert.match(overviewCode, /kpisFromServerStats\(serverStats\) \|\| computeKpis\(shipments\)/,
    "die Quelle der Kennzahlen wurde verändert");
  assert.match(overviewCode, /value: String\(k\.active\)/);
  assert.match(overviewCode, /value: String\(k\.inTransit\)/);
  assert.match(overviewCode, /value: String\(k\.delivered\)/);
  assert.match(overviewCode, /value: String\(k\.delayed\)/);
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
