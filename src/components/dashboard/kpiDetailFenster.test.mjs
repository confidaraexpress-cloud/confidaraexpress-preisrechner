// Kennzahl-Detailfenster (Betreiberentscheidung 2026-11-07) — Quelltextanker der Komponente, der Übersicht, der Seite
// und des Stylesheets. Das Repository hat keine Renderschicht; das Verhalten im Browser prüft
// tests/e2e/kpiDetailFenster.test.mjs, die reine Logik utils/kpiDetailView.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const fenster = ohneKommentare(src("./KpiDetailFenster.jsx"));
const overview = ohneKommentare(src("./Overview.jsx"));
const seite = ohneKommentare(src("../../pages/DashboardPage.jsx"));
const editorial = src("../../styles/premium-editorial.css").replace(/\/\*[\s\S]*?\*\//g, "");
const variablen = src("../../styles/variables.css").replace(/\/\*[\s\S]*?\*\//g, "");
const ED = ':root[data-ce-bereich="kunde"] ';
function edRegel(selector) {
  const kopf = `${ED}${selector} {`;
  const start = editorial.indexOf(kopf);
  return start < 0 ? null : editorial.slice(start + kopf.length, editorial.indexOf("}", start));
}

test("1 — ein Dialog im Portal an <body>: beschriftet, beschrieben, Fokus nach dem Muster des Projekts", () => {
  assert.match(fenster, /return createPortal\(/);
  assert.match(fenster, /document\.body,\s*\);/);
  assert.match(fenster, /role="dialog"/);
  assert.match(fenster, /aria-modal="true"/);
  assert.match(fenster, /aria-labelledby=\{titelId\}/);
  assert.match(fenster, /aria-describedby=\{textId\}/);
  assert.match(fenster, /<h2 className="kpf-titel" id=\{titelId\}>\{kopf\.titel\}<\/h2>/);
  assert.match(fenster, /<p className="kpf-erklaerung" id=\{textId\}>\{def\.context\}<\/p>/, "die Erklärung ist die Kontextzeile der Karte");
  // Fokus hinein, Tab-Falle, Escape, Rückgabe auf die Karte — erst, wenn das Fenster sichtbar steht.
  assert.match(fenster, /useDialog\(\{ open: sheet \|\| lage !== null, onClose, returnFocusTo: ankerRef \}\)/);
  assert.match(fenster, /aria-label=\{KPI_FENSTER_TEXT\.schliessen\}/, "Schließen-Symbol mit Namen");
});

test("2 — Daten: genau ein Abruf beim Öffnen, abgebrochen beim Schließen und beim Wechsel; keine verspätete Anzeige", () => {
  assert.equal((fenster.match(/apiFetch\(/g) || []).length, 1, "genau ein Abruf");
  assert.match(fenster, /const url = kpiFensterUrl\(kpi\);/);
  assert.match(fenster, /apiFetch\(url, \{ auth: true, signal: ac\.signal \}\)/);
  assert.match(fenster, /return \(\) => ac\.abort\(\);/);
  assert.equal((fenster.match(/if \(ac\.signal\.aborted\) return;/g) || []).length, 2, "vor und nach dem JSON");
  assert.match(fenster, /\}, \[kpi, versuch\]\);/, "neu nur bei anderer Kennzahl oder „Erneut versuchen“");
  assert.match(fenster, /const antwort = kpiFensterAntwort\(kpi, body\);/, "fail-closed geprüft");
  // 401/403 meldet apiFetch zentral ab — kein zweiter Fehlerweg, keine erfundene 0.
  assert.match(fenster, /if \(r\.status !== 401 && r\.status !== 403\) setStand\(\{ status: "fehler" \}\);/);
  // Kein Trackingabruf, kein Polling, kein Storage, kein Rohtext eines Anbieters.
  for (const verboten of [/getTracking/, /setInterval/, /localStorage|sessionStorage|indexedDB/, /tracking_status_text/, /dangerouslySetInnerHTML/]) {
    assert.ok(!verboten.test(fenster), `verboten: ${verboten}`);
  }
  // Die Karten übernehmen das Aggregat derselben Antwort nur geprüft.
  assert.match(fenster, /const stats = kpiFensterStats\(kpi, antwort\);\s*if \(stats && onStandRef\.current\) onStandRef\.current\(stats\);/);
});

test("3 — Wiederverwendung nur innerhalb derselben Übersicht und nur frisch; „Erneut versuchen“ fragt immer neu", () => {
  assert.match(fenster, /if \(versuch === 0 && kpiFensterFrisch\(cache \? cache\.get\(kpi\) : null\)\) return undefined;/);
  assert.match(fenster, /if \(cache\) cache\.set\(kpi, \{ zeit: Date\.now\(\), antwort \}\);/);
  assert.match(fenster, /onClick=\{\(\) => setVersuch\(\(v\) => v \+ 1\)\}>\{KPI_FENSTER_TEXT\.erneut\}/);
  assert.match(overview, /const fensterStand = useRef\(new Map\(\)\);/, "der Stand lebt nur in der gemounteten Übersicht");
});

test("4 — Schließen: Symbol, Escape, Klick daneben; ein Klick auf eine Karte schaltet über die Übersicht um", () => {
  assert.match(fenster, /document\.addEventListener\("pointerdown", daneben\);/);
  assert.match(fenster, /if \(ziel instanceof Element && ziel\.closest\("\.ov-kpi"\)\) return;/);
  assert.match(fenster, /const taste = \(e\) => \{ if \(e\.key === "Escape"\) onCloseRef\.current\?\.\(\); \};/);
  assert.match(fenster, /document\.removeEventListener\("pointerdown", daneben\);/);
  assert.match(fenster, /<button type="button" className="kpf-schliessen" onClick=\{onClose\}/);
});

test("5 — Zeilen: aufklappbar im Fenster, höchstens eine offen, mit aria-expanded und aria-controls", () => {
  assert.match(fenster, /<button type="button" className="kpf-zeile-knopf" aria-expanded=\{offen\} aria-controls=\{detailId\} onClick=\{onUmschalten\}>/);
  assert.match(fenster, /<div id=\{detailId\} className="kpf-details" hidden=\{!offen\}>/);
  assert.match(fenster, /onUmschalten=\{\(\) => setOffen\(\(o\) => \(o === i \? null : i\)\)\}/, "eine andere Zeile schließt die erste");
  assert.match(fenster, /offen=\{offen === i\}/);
  // Im DOM steht der Zeilenindex, nie die interne Sendungs-ID (Security-Review 2026-11-07, Hinweis).
  assert.match(fenster, /data-zeile=\{index\}/);
  assert.ok(!/data-sendung|CSS\.escape/.test(fenster), "keine interne Sendungs-ID im DOM");
  assert.match(fenster, /<dl className="kpf-angaben">/);
  assert.match(fenster, /<ShipmentStatus shipment=\{sendung\} \/>/, "derselbe Kundenstand samt TEST-Marke wie in den Listen");
  assert.match(fenster, /<span className="kpf-nummer kpf-nummer--ohne">\{NO_ORDER_CONFIRMATION_TEXT\}<\/span>/, "ohne Ersatznummer");
});

test("6 — „Alle anzeigen“: der bestehende Deep-Link, Zusatztasten folgen dem href, ein Klick bleibt in der App", () => {
  assert.match(fenster, /const href = useHref\(`\/dashboard\?page=shipments&kpi=\$\{kpi\}`\);/);
  assert.match(fenster, /e\.button !== 0 \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/);
  assert.match(fenster, /e\.preventDefault\(\);\s*onAlleAnzeigen\(kpi\);/);
  assert.match(fenster, /<a className="kpf-alle" href=\{href\} onClick=\{alleAnzeigen\}>/);
  // DashboardPage: derselbe Weg wie bis 2026-11-06 der Kartenklick (eigener History-Eintrag), dazu der Kartenstand.
  assert.match(seite, /onOpenKpi=\{oeffneKennzahl\}/);
  assert.match(seite, /onKpiStand=\{uebernehmeKennzahlStand\}/);
  assert.match(seite, /const uebernehmeKennzahlStand = useCallback\(\(stats\) => \{ if \(stats\) setShipmentsStats\(stats\); \}, \[\]\);/);
});

test("7 — Lage: gemessen und berechnet in utils/kpiDetailView.mjs; vor der Messung unsichtbar; Sheet ohne Lage", () => {
  assert.match(fenster, /const neu = kpiFensterLage\(\{/);
  assert.match(fenster, /const bedarf = kpiFensterScrollBedarf\(\{/);
  assert.match(fenster, /wurzel\.style\.scrollBehavior = "auto";/, "ohne weiches Scrollen, sonst mäße die Lage den alten Stand");
  assert.match(fenster, /: \{ visibility: "hidden" \};/, "kein Aufblitzen an falscher Stelle");
  assert.match(fenster, /const sheet = useSyncExternalStore\(abonniereSheet, sheetStand, \(\) => false\);/);
  assert.match(fenster, /\{sheet && <div className="kpf-schleier" aria-hidden="true" \/>\}/);
  assert.match(fenster, /new ResizeObserver\(nach\)/);
  assert.match(fenster, /window\.removeEventListener\("resize", nach\);/);
});

test("8 — Stylesheet: Material der Karte, Ebenen, Sheet über der Demo-Leiste, Ziele und reduzierte Bewegung", () => {
  const kpf = edRegel(".kpf");
  assert.ok(kpf, "die Fensterregel fehlt");
  assert.match(kpf, /z-index: var\(--ce-z-dropdown\);/, "über der Ansprechpartnerkarte, unter Schublade und Dialogen");
  assert.match(kpf, /background: var\(--ce-pr-ed-karte-licht\) padding-box, var\(--ce-pr-ed-kante-licht\) border-box;/, "Material der Kennzahlkarte");
  assert.match(kpf, /box-shadow: var\(--ce-pr-ed-shadow-fenster\);/);
  assert.match(edRegel(".kpf--sheet") || "", /z-index: calc\(var\(--ce-z-overlay\) \+ 1\);/, "das Sheet liegt über der Demo-Leiste (400)");
  assert.match(edRegel(".kpf-schleier") || "", /touch-action: none;/, "der Schleier scrollt die Seite nicht");
  assert.match(edRegel(".kpf-inhalt") || "", /overscroll-behavior: contain;/);
  assert.match(edRegel(".kpf--sheet .kpf-schliessen") || "", /width: 2\.75rem; height: 2\.75rem;/, "44 px auf dem Telefon");
  assert.match(edRegel(".kpf--sheet .kpf-alle") || "", /min-height: 2\.75rem;/);
  assert.match(editorial, /@media \(prefers-reduced-motion: no-preference\) \{\s*:root\[data-ce-bereich="kunde"\] \.kpf--fenster\[data-seite="unten"\] \{ animation: kpf-auf 180ms/);
  assert.match(editorial, /@keyframes kpf-auf \{\s*from \{ opacity: 0; transform: translateY\(4px\); \}/, "nur Deckkraft und wenige Pixel");
  assert.match(editorial, /@media print \{\s*:root\[data-ce-bereich="kunde"\] :is\(\.kpf, \.kpf-schleier\) \{ display: none; \}/);
  for (const t of ["--ce-pr-ed-shadow-fenster", "--ce-pr-ed-shadow-sheet", "--ce-pr-ed-schleier", "--ce-pr-ed-zeile-offen", "--ce-pr-ed-griff"]) {
    assert.match(variablen, new RegExp(`${t}:`), `Token ${t} fehlt`);
  }
});

test("9 — die Übersicht lädt beim Start nichts zusätzlich: das Fenster existiert erst nach dem Klick", () => {
  assert.match(overview, /const \[offeneKennzahl, setOffeneKennzahl\] = useState\(null\);/);
  assert.ok(!/apiFetch|kpiFensterUrl/.test(overview), "die Übersicht fragt die Kennzahllisten nicht selbst an");
  assert.match(overview, /anker=\{kartenRefs\.current\[offeneKennzahl\] \|\| null\}/);
});
