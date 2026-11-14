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
// Die Optiktests 3, 4 und 17–23 prüfen die Grundebene overview.css. Sichtbar ist
// im Kundenbereich die Editorial-Ebene (premium-editorial.css): seit der
// Betreiberentscheidung vom 2026-11-01 vier helle Karten statt des Navy-Bands
// (Test 31).
//
// Bewusst quelltextnah: das Repository hat kein jsdom und keine Renderbibliothek
// für Komponenten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { SHIPMENT_KPIS } from "../../utils/kpis.mjs";

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
  // Seit E1–E4 (2026-11-06) stehen Schlüssel, Bezeichnungen und Kontexte an EINER Stelle (utils/kpis.mjs).
  assert.deepEqual(SHIPMENT_KPIS.map((k) => k.key), ["active", "in_transit", "delivered_this_month", "delayed"], "Bestand/Reihenfolge der Kennzahlen");
  assert.deepEqual(SHIPMENT_KPIS.map((k) => k.label), ["Aktive Sendungen", "Unterwegs", "Zugestellt", "Verzögert"]);
  // EIN Band (section mit Bezeichnung), darin je Kennzahl eine Karte.
  assert.match(overviewCode, /<section className="ov-kpis" aria-label="Betriebsüberblick">/, "das Band fehlt");
  assert.match(overviewCode, /\{SHIPMENT_KPIS\.map\(\(kpi\) => \(\s*<KennzahlKarte/, "jede Kennzahl ist eine Karte des Abschnitts");
  // Seit 2026-11-07 ein Knopf, der das Detailfenster der Kennzahl öffnet (bis dahin ein Link, Test 22).
  assert.match(overviewCode, /<button\s+type="button"\s+ref=\{karteRef\}\s+className=\{`ov-kpi ov-kpi--\$\{kpi\.cls\}`\}\s+data-kpi=\{kpi\.key\}/,
    "die Karte ist ein Knopf mit der Kennzahl-Klasse");
  // Die Klassenmodifikatoren bleiben die seit 2026-10 bekannten (Stil- und Testanker); der Filter steht in data-kpi.
  assert.deepEqual(SHIPMENT_KPIS.map((k) => k.cls), ["active", "transit", "delivered", "delayed"]);
  assert.ok(!/data-null/.test(overviewCode), "der Marker der früheren Akzentfarbe ist zurück");
  assert.ok(!/pp-kpi\b|pp-kpis\b/.test(overviewCode), "die alten Kartenklassen sind zurück");
});


test("2 — einziges Symbol im Kennzahlenband: der dekorative Pfeil der Kennzahlkarten (E1–E4)", () => {
  // Bis 2026-11-06 trugen die Karten kein Symbol. Seit sie in ihre gefilterte Liste führen, zeigt ein kleiner Pfeil
  // (16 px, ohne Text, für Screenreader verborgen) die Bedienbarkeit — sonst bleibt die Übersicht ohne Symbole.
  assert.equal((overviewCode.match(/<Icon\b/g) || []).length, 1, "genau EIN Symbol in der Übersicht");
  assert.match(overviewCode, /<span className="ov-kpi-pfeil"><Icon n="arrowRight" s=\{16\} \/><\/span>/, "der Pfeil der Karte");
  assert.ok(!/<Icon[^>]*title=/.test(overviewCode), "der Pfeil ist Schmuck (ohne title → aria-hidden)");
  assert.ok(!/icon:/.test(overviewCode), "die Kennzahlen tragen wieder Iconnamen");
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

test("5 — eine Zahl erscheint erst nach erfolgreichem Laden UND mit gültigem Aggregat, sonst „—“", () => {
  assert.match(overviewCode, /const ready = kpisReady === undefined \? !loading : kpisReady;/,
    "das Bereitschafts-Gate fehlt oder wurde umbenannt");
  assert.match(overviewCode, /const zahlen = ready && k !== null;/, "ohne gültiges Aggregat keine Zahl (E1–E4: kein Rückfall)");
  assert.match(overviewCode, /wert=\{zahlen \? String\(k\.byKey\[kpi\.key\]\) : "—"\}/,
    "die Kennzahl muss am Bereitschafts-Gate hängen, nicht an loading");
  assert.ok(!/\{loading \? "—" : /.test(overviewCode),
    "der alte loading-Ternary würde nach einem Fehler eine falsche 0 zeigen");
  // Solange nicht bereit: Statustext statt Kontextzeile.
  assert.match(overviewCode, /kontext=\{zahlen \? kpi\.context : \(loading \? "Wird geladen…" : "Noch nicht verfügbar"\)\}/,
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

test("28 — die vier Kontextzeilen nach E3 sind gesetzt und wiederholen sich nicht", () => {
  const texte = SHIPMENT_KPIS.map((k) => k.context);
  assert.deepEqual(texte, [
    "Gebucht, noch nicht zugestellt",
    "Beim Versanddienstleister unterwegs",
    "Im aktuellen Monat",
    "Voraussichtlicher Liefertermin überschritten",
  ], `erwartete Kontextzeilen, gefunden: ${JSON.stringify(texte)}`);
  assert.equal(new Set(texte).size, 4, "keine wiederholte generische Angabe");
  // Die Fassungen vor E3 sind bewusst ersetzt — Regressionsschutz.
  const kpisQuelle = src("../../utils/kpis.mjs");
  for (const alt of ["Noch nicht abgeschlossen", "Auf dem Weg zum Empfänger", "Über dem geplanten Liefertermin", "Aktueller Stand", "Aktuell laufend"]) {
    assert.ok(!overview.includes(alt) && !kpisQuelle.includes(`"${alt}"`), `die alte Kontextzeile „${alt}“ ist zurück`);
  }
  assert.ok(!kpisQuelle.includes('"In Zustellung"'), "„In Zustellung“ ist durch „Unterwegs“ ersetzt");
});

/* ═══════════════════════════════════════════════════════════════════════════
   Visuelles System des Kennzahlenbands (Redesign 2026-10)
   ═══════════════════════════════════════════════════════════════════════════ */


test("16 — Lesereihenfolge: Beschriftung → Zahl → Kontext", () => {
  const zelle = overviewCode.slice(overviewCode.indexOf("function KennzahlKarte"));
  const l = zelle.indexOf('className="ov-kpi-label"');
  const v = zelle.indexOf('className="ov-kpi-value"');
  const c = zelle.indexOf('className="ov-kpi-context"');
  assert.ok(l > -1 && v > l && c > v, "Reihenfolge Beschriftung → Zahl → Kontext verletzt");
});

test("17 — die Zahl steht in der Zahlenrolle 32/38, Gewicht 600, eng und tabellarisch", () => {
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

test("18 — Beschriftung auf der Label-Stufe, keine Versalien; Kontext auf der Caption-Stufe", () => {
  assert.equal(decl(".ov-kpi-label", "font-size"), "var(--ce-text-label-size)");
  assert.equal(decl(".ov-kpi-label", "font-weight"), "var(--ce-text-label-weight)");
  // Betreiberentscheidung 2026-11-13: Lesestufen der Grundskala +1 px (D4); Premium-Typografie 2.0
  // (Betreiberauftrag 2026-11-13, Zielwert „Formularbeschriftungen 600“): die Label-Rolle trägt 600.
  assert.equal(tok("ce-text-label-size"), "14px");
  assert.equal(tok("ce-text-label-weight"), "600");
  // Die KPI-Erklärung steht in der Caption-Stufe — seit Premium-Typografie 2.0 14 px statt 13 px.
  assert.equal(tok("ce-text-caption-size"), "14px");
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


test("22 — die Karten öffnen ihr Detailfenster an der Karte (2026-11-07, bewusst umgekehrt: vorher Links)", () => {
  // Bis 2026-11-06 reine Informationsflächen, von E1–E4 bis 2026-11-06 Links in die gefilterte Sendungsliste. Seit der
  // Betreiberentscheidung vom 2026-11-07 öffnet ein Klick ein Fenster an der Karte — keine Navigation. Die Karte ist
  // deshalb ein Knopf mit aria-expanded/aria-controls (aria-haspopup="dialog"); der Link wandert als „Alle anzeigen“ ins
  // Fenster (kpiDetailFenster.test.mjs).
  const karte = overviewCode.slice(overviewCode.indexOf("function KennzahlKarte"), overviewCode.indexOf("export function Overview"));
  assert.match(karte, /aria-haspopup="dialog"/);
  assert.match(karte, /aria-expanded=\{offen\}/);
  assert.match(karte, /aria-controls=\{offen \? fensterId : undefined\}/, "aria-controls nur, solange das Fenster existiert");
  assert.match(karte, /onClick=\{\(\) => onUmschalten\(kpi\.key\)\}/);
  assert.ok(!/useHref|href=|navigate\(|onOpen\b|role="button"|tabIndex/.test(karte), "die Karte navigiert nicht mehr und ist kein Ersatzknopf");
  // Zugänglicher Name aus dem sichtbaren Text plus „Sendungen anzeigen“.
  assert.match(karte, /<span className="sr-only"> – \{KPI_TEXT\.openSuffix\}<\/span>/);
  assert.ok(!/aria-label/.test(karte), "der Name entsteht aus dem sichtbaren Text");
  // Höchstens EIN Fenster: dieselbe Karte schließt, eine andere wechselt (Schlüssel = Kennzahl → neuer Abruf).
  assert.match(overviewCode, /setOffeneKennzahl\(\(offen\) => \(offen === key \? null : key\)\)/);
  assert.match(overviewCode, /\{offeneKennzahl && \(\s*<KpiDetailFenster\s+key=\{offeneKennzahl\}/);
  assert.match(overviewCode, /onAlleAnzeigen=\{onOpenKpi\}/, "„Alle anzeigen“ nutzt den bestehenden Weg in die gefilterte Liste");
  assert.equal((overviewCode.match(/<KpiDetailFenster\b/g) || []).length, 1);
  // Grundebene: die Vorgaben des Browsers für Knöpfe zurückgesetzt; die Zustände setzt die Editorial-Ebene (Test 31).
  assert.equal(decl("button.ov-kpi", "font"), "inherit");
  assert.equal(decl("button.ov-kpi", "color"), "inherit");
  assert.equal(decl("button.ov-kpi", "text-align"), "start");
  assert.equal(decl("button.ov-kpi", "width"), "100%");
  assert.ok(rule("a.ov-kpi") === null, "die Grundebene kennt keine Link-Karte mehr");
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
  // Der Zusatz „davon n neu (24 h)“ ist eine echte Teilmenge der aktiven Sendungen (E3) — als schlichte eigene
  // Zeile unter dem Kontext (Screenreader hören „, davon …“), nicht als Trendabzeichen.
  assert.match(overviewCode, /const activeNote = zahlen \? activeNewNote\(k\) : null;/,
    "die echte 24-Stunden-Angabe darf nicht stillschweigend verschwinden");
  assert.match(overviewCode, /\{note && <span className="ov-kpi-note"><span className="sr-only">, <\/span>\{note\}<\/span>\}/);
  assert.match(editorial, /:root\[data-ce-bereich="kunde"\] \.ov-kpi-note \{ display: block; margin-top: 2px; \}/);
  // Silbentrennung der Kontextzeile erst in der Telefonstufe (keine „Versanddienstleis-ter“-Trennung auf dem Desktop).
  assert.match(editorial, /:root\[data-ce-bereich="kunde"\] \.ov-kpi-context \{ hyphens: manual; \}/);
  assert.equal(decl(".ov-kpi-note", "white-space"), "normal", "der Nachsatz bricht bei Bedarf um");
});


test("30 — die Kennzahlen kommen allein aus dem Serveraggregat (E1–E4: kein Rückfall auf die geladene Seite)", () => {
  assert.match(overviewCode, /const k = useMemo\(\(\) => kpisFromServerStats\(serverStats\), \[serverStats\]\);/,
    "die Quelle der Kennzahlen wurde verändert");
  assert.ok(!/computeKpis/.test(overviewCode), "die Ersatzrechnung über die geladene Seite ist zurück");
  assert.match(overviewCode, /\{SHIPMENT_KPIS\.map\(\(kpi\) => \(/);
});

// ── Editorial-Ebene: vier helle Karten (Betreiberentscheidung 2026-11-01) ───
const editorial = src("../../styles/premium-editorial.css").replace(/\/\*[\s\S]*?\*\//g, "");
const ED = ':root[data-ce-bereich="kunde"] ';
// Rumpf der ERSTEN Regel mit exakt diesem Selektor der Editorial-Ebene (Grundstufe vor den Container-Abfragen).
function edRegel(selector) {
  const kopf = `${ED}${selector} {`;
  const start = editorial.indexOf(kopf);
  return start < 0 ? null : editorial.slice(start + kopf.length, editorial.indexOf("}", start));
}
function edDecl(selector, prop) {
  const m = (edRegel(selector) ?? "").match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`));
  return m ? m[1].trim() : null;
}
// Ein ganzer At-Block (Medien- oder Container-Abfrage) samt geschachtelter Regeln.
function edBlock(kopf) {
  const start = editorial.indexOf(kopf);
  if (start < 0) return null;
  let tiefe = 0;
  for (let i = editorial.indexOf("{", start); i < editorial.length; i++) {
    if (editorial[i] === "{") tiefe++;
    else if (editorial[i] === "}" && --tiefe === 0) return editorial.slice(start, i + 1);
  }
  return null;
}

test("31 — Editorial (2026-11-01, Premium-Dashboard V2, Flow Signature): vier helle Karten im Licht, ohne farbige Akzentstriche", () => {
  // Der Abschnitt ist keine Fläche: kein Grund, kein Schatten, nichts wird abgeschnitten (Kartenschatten).
  assert.equal(edDecl(".ov-kpis", "grid-template-columns"), "repeat(4, minmax(0, 1fr))");
  assert.equal(edDecl(".ov-kpis", "background"), "transparent");
  assert.equal(edDecl(".ov-kpis", "box-shadow"), "none");
  assert.equal(edDecl(".ov-kpis", "overflow"), "visible");
  assert.equal(edDecl(".ov-kpis", "gap"), "0 var(--ce-space-4)", "Abstand zwischen den Karten, Reihen über das Subgrid");
  // Ein Kartensystem in zwei Gewichten (Flow Signature): Kennzahl- und Modulkarten teilen Radius und weißen Grund; die
  // Kennzahlkarten stehen im Licht der oberen Zone — ihre Kante ist oben vom Kobaltlicht getönt und läuft in die Haarlinie
  // aus, ihr Schatten ist leicht blau. Die Module behalten die ruhige Fassung mit Haarlinie und neutralem Schatten.
  const material = edRegel(".ov-page .ov-mod > .ov-card");
  assert.ok(material, "das gemeinsame Kartenmaterial der Module fehlt");
  const imModul = (prop) => material.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`))[1].trim();
  assert.equal(edDecl(".ov-kpi", "border-radius"), imModul("border-radius"), "Kennzahlkarte und Modulkarte haben verschiedene Radien");
  assert.equal(edDecl(".ov-kpi", "background-color"), imModul("background"), "die Kennzahlkarte steht nicht auf dem weißen Grund der Module");
  assert.equal(imModul("border"), "1px solid var(--ce-pr-hairline)");
  assert.equal(imModul("box-shadow"), "var(--ce-pr-ed-shadow-flaeche)");
  assert.equal(edDecl(".ov-kpi", "border"), "1px solid transparent");
  assert.equal(edDecl(".ov-kpi", "background"), "var(--ce-pr-ed-karte-licht) padding-box, var(--ce-pr-ed-kante-licht) border-box");
  assert.equal(edDecl(".ov-kpi", "box-shadow"), "var(--ce-pr-ed-shadow-kennzahl)");
  assert.match(variables, /--ce-pr-ed-kante-licht: linear-gradient\(180deg, rgba\(0, 74, 252, [0-9.]+\)/, "die Kante ist oben nicht vom Kobaltlicht getönt");
  assert.match(editorial, /@media \(forced-colors: active\) \{\s*:root\[data-ce-bereich="kunde"\] \.ov-kpi \{ border-color: CanvasText; \}/,
    "im Kontrastmodus verliert die Karte ihre Kante");
  assert.equal(edDecl(".ov-kpi", "padding"), "var(--ce-space-6)", "großzügiger, gleichmäßiger Innenabstand");
  assert.equal(edDecl(".ov-kpi", "grid-template-rows"), "subgrid", "Bezeichnung, Zahl und Kontext einer Reihe auf gemeinsamen Linien");
  // Die Zahl in dunklem Navy in normaler Breite (38/32 px, Gewicht 560), die Bezeichnung klar in eigener Tinte (600, Größe
  // unverändert), der Kontext im Nebentext — dezent, nicht blass.
  assert.equal(edDecl(".ov-kpi-value", "color"), "var(--ce-pr-ed-kennzahl-zahl)");
  assert.equal(tok("ce-pr-ed-kennzahl-zahl"), "#011b55");
  assert.equal(edDecl(".ov-kpi-value", "font-stretch"), "100%");
  assert.equal(edDecl(".ov-kpi-value", "font-weight"), "560");
  assert.equal(tok("ce-pr-ed-figure-size"), "2.375rem");
  assert.equal(tok("ce-pr-ed-figure-size-mobile"), "2rem");
  assert.equal(edDecl(".ov-kpi-label", "color"), "var(--ce-pr-ed-kennzahl-tinte)");
  assert.equal(edDecl(".ov-kpi-label", "font-weight"), "600");
  assert.equal(edDecl(".ov-kpi-label", "font-size"), "var(--ce-text-label-size)", "die Bezeichnung wird nicht größer");
  assert.ok(contrast(tok("ce-pr-ed-kennzahl-tinte"), "#ffffff") >= 7, "die Bezeichnung liegt unter 7:1");
  assert.equal(edDecl(".ov-kpi-context", "color"), "var(--ce-color-text-secondary)");
  // Reduzierte Palette: keine farbigen Kanten mehr, weder an den Karten noch als Tokens. Alle vier Zahlen in demselben
  // dunklen Navy (Betreiberauftrag 2026-11-02): „Verzögert“ trägt bei keinem Wert eine Sonderfarbe — keine Regel in
  // irgendeinem Stylesheet färbt die Zahl einer einzelnen Kennzahl, und das Bernstein-Token ist entfernt.
  assert.ok(!/\.ov-kpi(?:--[a-z]+)?::before/.test(editorial), "eine Kennzahlkarte trägt wieder eine Kante");
  for (const alt of ["aktiv", "zustellung", "zugestellt", "verzoegert"]) {
    assert.ok(!new RegExp(`--ce-pr-ed-kennzahl-${alt}[:-]`).test(variables + editorial), `das Token ${alt} ist noch vorhanden`);
  }
  const alleStile = readdirSync(new URL("../../styles/", import.meta.url)).filter((f) => f.endsWith(".css"))
    .map((f) => src(`../../styles/${f}`).replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");
  const eigeneFarbe = [...alleStile.matchAll(/([^{}]*\.ov-kpi--[a-z]+[^{}]*)\{([^{}]*)\}/g)]
    .filter(([, , rumpf]) => /(?:^|;)\s*color\s*:/.test(rumpf)).map(([, sel]) => sel.trim());
  assert.deepEqual(eigeneFarbe, [], "eine Kennzahl färbt ihre Zahl wieder eigen");
  // Unter 51.5625rem Inhaltsbreite 2 × 2 — dieselbe Stufe, an der die Module untereinander rücken; nie einspaltig.
  const zweiMalZwei = edBlock("@container ce-seite (width < 51.5625rem) {");
  assert.ok(zweiMalZwei && /\.ov-kpis \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(zweiMalZwei), "2 × 2 fehlt");
  assert.ok(!/\.ov-kpis \{[^}]*grid-template-columns:\s*(?:1fr|minmax\(0, 1fr\))\s*;/.test(editorial), "die Karten stehen einspaltig");
  // Seit E1–E4 (2026-11-06) bedienbar, seit 2026-11-07 als Knopf des Detailfensters: Zeiger, beim Zeigen nur Deckkraft
  // der Signalkante (Ebene über der Karte) und Farbe des Pfeils — keine Bewegung, kein transform, keine Größenänderung;
  // Fokus im Fokuspaar des Systems. Offen (aria-expanded) bleibt die Signalkante stehen.
  assert.match(edRegel("button.ov-kpi") || "", /cursor: pointer/, "die Karte zeigt sich nicht als bedienbar");
  const zeigen = (editorial.match(/@media \(hover: hover\) and \(pointer: fine\) \{\s*:root\[data-ce-bereich="kunde"\] button\.ov-kpi:hover::after[^}]*\}/) || [""])[0];
  assert.ok(zeigen && /button\.ov-kpi:hover::after \{ opacity: 1; \}/.test(zeigen), "Hover nur über die Deckkraft der Ebene");
  assert.match(editorial, /button\.ov-kpi\[aria-expanded="true"\]::after \{ opacity: 1; \}/, "die offene Karte zeigt ihre Signalkante");
  // Die einzige Bewegung an der Karte: der Pfeil dreht sich zum geöffneten Fenster (Antwort auf den Klick, nicht aufs Zeigen).
  const ohneKeyframes = editorial.replace(/@keyframes[\s\S]*?\}\s*\}/g, "");
  const kartenBewegung = [...ohneKeyframes.matchAll(/([^{}]*\.ov-kpi[^{}]*)\{([^{}]*transform[^{}]*)\}/g)]
    .map(([, sel, rumpf]) => `${sel.trim()} { ${rumpf.trim()} }`);
  assert.deepEqual(kartenBewegung, [
    ':root[data-ce-bereich="kunde"] .ov-kpi-pfeil svg { transition: transform var(--ce-motion-fast) ease; }',
    ':root[data-ce-bereich="kunde"] button.ov-kpi[aria-expanded="true"] .ov-kpi-pfeil svg { transform: rotate(90deg); }',
  ], "Bewegung an der Karte nur als Drehung des Pfeils zum geöffneten Fenster");
  assert.match(editorial, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.ov-kpi-pfeil svg \{ transition: none; \}/, "reduzierte Bewegung: ohne Übergang");
  assert.equal(edDecl(".ov-kpi::after", "border"), "1px solid var(--ce-pr-ed-kante-signal)");
  assert.equal(edDecl(".ov-kpi::after", "box-shadow"), "var(--ce-pr-ed-shadow-kennzahl-hover)");
  assert.equal(edDecl(".ov-kpi::after", "opacity"), "0");
  assert.match(editorial, /button\.ov-kpi:focus-visible \{\s*outline: var\(--ce-focus-ring\);\s*outline-offset: var\(--ce-focus-ring-offset\);/);
  assert.ok(!/(^|[\s,}])a\.ov-kpi\b/.test(editorial), "die Editorial-Ebene kennt keine Link-Karte mehr");
  // Das Band ist vollständig entfernt, samt seiner Tokens.
  for (const alt of ["--ce-pr-ed-band", "--ce-pr-ed-band-line", "--ce-pr-ed-shadow-band", "--ce-pr-ed-mark-active", "--ce-pr-ed-mark-transit", "--ce-pr-ed-mark-delayed"]) {
    assert.ok(!new RegExp(`${alt}\\b(?!-)`).test(editorial + variables), `${alt} ist noch vorhanden`);
  }
  // Kontrast auf Weiß: die Navy-Zahl — dieselbe für alle vier Kennzahlen — mindestens 7:1.
  assert.ok(contrast(tok("ce-pr-ed-kennzahl-zahl"), "#ffffff") >= 7, "die Zahl liegt unter 7:1");
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
