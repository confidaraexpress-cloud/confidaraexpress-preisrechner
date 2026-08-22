/* Fehlergrenzen — Abdeckung, Verhalten und Nichtvermehrung.
 *
 * React 18 hängt bei einem unbehandelten Renderfehler den GESAMTEN Baum ab:
 * aus einem Fehler in einer Karte wird ein leerer, weißer <div id="root">.
 * `ContentErrorBoundary` deckte bis zum Härtungspaket nur das Kundendashboard
 * ab — Wurzel, Auth-Bereich, öffentliche Seiten und Adminportal waren offen.
 *
 * Diese Datei hält drei Dinge fest, die einzeln jeweils wieder verloren gehen
 * könnten:
 *   A) es gibt GENAU EINE Fehlergrenze im Projekt (kein zweites Muster),
 *   B) sie hängt an allen sechs Stellen, an denen ein Fehler sonst die
 *      Oberfläche leeren würde,
 *   C) sie unterscheidet die beiden Ursachen und lädt nie von selbst neu.
 *
 * Rein: kein Browser, kein Netz — Quelltextprüfung.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.resolve(HIER, "../..");
const lies = (p) => readFileSync(path.join(SRC, p), "utf8");

const GRENZE   = lies("components/common/ContentErrorBoundary.jsx");
const MAIN     = lies("main.jsx");
const APP      = lies("App.jsx");
const NAVBAR   = lies("components/layout/NavbarLayout.jsx");
const ADMIN    = lies("components/layout/AdminLayout.jsx");
const DASHLAY  = lies("components/layout/DashboardLayout.jsx");
const DASHPAGE = lies("pages/DashboardPage.jsx");

/* Kommentare entfernen, wo auf ABWESENHEIT geprüft wird: eine Regel, die ihre
   eigene Begründung als Verstoß liest, ist wertlos. */
const ohneKommentare = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── A) Genau eine Fehlergrenze ───────────────────────────────────────────────

test("1 — es gibt GENAU EINE Fehlergrenzen-Komponente im ganzen Projekt", () => {
  const treffer = [];
  (function lauf(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) { lauf(p); continue; }
      if (!/\.(jsx?|mjs)$/.test(e) || /\.test\./.test(e)) continue;
      const src = readFileSync(p, "utf8");
      // Eine Fehlergrenze ist per React-Definition genau das: eine Klasse mit
      // getDerivedStateFromError oder componentDidCatch. Am Namen zu suchen
      // fände eine umbenannte Zweitfassung nicht.
      if (/getDerivedStateFromError|componentDidCatch/.test(src)) {
        treffer.push(path.relative(SRC, p));
      }
    }
  })(SRC);
  assert.deepEqual(treffer, ["components/common/ContentErrorBoundary.jsx"],
    `zweite Fehlergrenze daneben gebaut statt die bestehende erweitert: ${treffer.join(", ")}`);
});

test("2 — die Grenze rendert die gemeinsame Zustandsfläche, kein eigenes Fehlerlayout", () => {
  assert.match(GRENZE, /import \{ ErrorState \} from "\.\.\/ui\/StateView"/,
    "die Fehlerfläche muss aus dem gemeinsamen Zustandssystem kommen");
  assert.match(GRENZE, /<ErrorState/);
  const code = ohneKommentare(GRENZE);
  assert.doesNotMatch(code, /alert-error|ce-state-title["']/,
    "kein handgebautes Fehlerlayout neben ErrorState");
});

// ── B) Abdeckung aller sechs Montagepunkte ───────────────────────────────────

test("3 — die Wurzel ist abgedeckt, und zwar ÜBER Router und AuthProvider", () => {
  assert.match(MAIN, /<ContentErrorBoundary bereich="wurzel">/,
    "ohne Wurzelgrenze erzeugt ein Fehler im Router oder AuthProvider weiter eine weiße Seite");
  // Die Reihenfolge ist die ganze Aussage: läge die Grenze innerhalb des
  // Routers, könnte sie einen Fehler des Routers selbst nicht sehen.
  const grenze = MAIN.indexOf("<ContentErrorBoundary");
  const router = MAIN.indexOf("<BrowserRouter>");
  const auth   = MAIN.indexOf("<AuthProvider>");
  assert.ok(grenze >= 0 && router > grenze && auth > grenze,
    "die Wurzelgrenze muss BrowserRouter und AuthProvider umschließen, nicht umgekehrt");
});

test("4 — alle vier Bereiche tragen ihre eigene Grenze", () => {
  const erwartet = [
    ["Auth-Bereich",     APP,      /bereich="auth"/],
    ["öffentliche Seiten", NAVBAR, /bereich="oeffentlich"/],
    ["Adminportal",      ADMIN,    /bereich="admin"/],
  ];
  for (const [name, src, muster] of erwartet) {
    assert.match(src, muster, `Bereich ohne Fehlergrenze: ${name}`);
    assert.match(src, /import \{ ContentErrorBoundary \}/, `Import fehlt: ${name}`);
  }
  // Die beiden Kundendashboard-Grenzen bestanden bereits und dürfen nicht
  // beim Nachrüsten der anderen verloren gehen.
  assert.match(DASHLAY,  /<ContentErrorBoundary key=\{location\.pathname\}/,
    "die Grenze des DashboardLayouts ist verschwunden");
  assert.match(DASHPAGE, /<ContentErrorBoundary key=\{page\}/,
    "die Grenze der DashboardPage ist verschwunden");
});

test("5 — jede Bereichsgrenze wird bei Navigation zurückgesetzt", () => {
  // Ohne Schlüssel bliebe die Fehlerfläche einer verlassenen Seite stehen und
  // blockierte die nächste — der Nutzer käme aus dem Fehler nicht heraus.
  for (const [name, src] of [["Auth", APP], ["öffentlich", NAVBAR], ["Admin", ADMIN]]) {
    const m = src.match(/<ContentErrorBoundary[^>]*>/g) || [];
    assert.ok(m.length > 0, `keine Grenze in ${name}`);
    assert.ok(m.every((tag) => /key=\{pathname\}/.test(tag)),
      `Bereichsgrenze ohne Rücksetzschlüssel in ${name}: ${m.join(" | ")}`);
  }
});

test("6 — jede Grenze außerhalb der App-Shell bringt einen passenden Rahmen mit", () => {
  // `.page-body` ist der Rahmen der App-Shell. Auth, öffentliche Seiten und
  // Admin laufen NICHT dadurch — ohne eigenen Rahmen klebte die Fehlerfläche
  // dort am Bildrand.
  assert.match(APP,    /bereich="auth" wrapperClassName="container"/);
  assert.match(NAVBAR, /bereich="oeffentlich" wrapperClassName="container"/);
  assert.match(ADMIN,  /bereich="admin" wrapperClassName="adm-page"/);
  // Und die Voreinstellung bleibt der Shell-Rahmen, damit die beiden
  // bestehenden Aufrufer unverändert richtig liegen.
  assert.match(GRENZE, /this\.props\.wrapperClassName \?\? "page-body"/,
    "die Voreinstellung muss `page-body` bleiben (?? statt ||: \"\" ist ein gültiger Wert)");
});

// ── C) Verhalten: zwei Ursachen, kein Selbstlauf, kein Datenleck ─────────────

test("7 — der Ladefehler eines Codeabschnitts wird an allen bekannten Wortlauten erkannt", () => {
  // Die Datei ist JSX und lässt sich von `node --test` nicht importieren. Die
  // Regel wird deshalb aus dem Quelltext GELESEN und dann mit echten
  // Fehlermeldungen ausgeführt — das prüft die tatsächliche Regel, nicht eine
  // hier nachgebaute Kopie davon.
  const regexZeile = GRENZE.match(/return \/(.+?)\/i\.test\(text\)/);
  assert.ok(regexZeile, "die Erkennung muss als eine benannte, prüfbare Regel vorliegen");
  const erkenner = new RegExp(regexZeile[1], "i");
  for (const echt of [
    "ChunkLoadError: Loading chunk 42 failed.",                              // Chromium/webpack
    "TypeError: Failed to fetch dynamically imported module: /assets/x.js",  // Chromium/Vite
    "TypeError: error loading dynamically imported module",                  // Firefox
    "TypeError: Importing a module script failed.",                          // Safari
  ]) {
    assert.ok(erkenner.test(echt), `Ladefehler nicht erkannt: ${echt}`);
  }
  // Fail-safe in die andere Richtung: ein gewöhnlicher Renderfehler darf NICHT
  // als Ladefehler gelten, sonst verspräche die Fläche, ein Neuladen behebe ihn.
  for (const harmlos of [
    "TypeError: Cannot read properties of undefined (reading 'map')",
    "Error: Objects are not valid as a React child",
  ]) {
    assert.ok(!erkenner.test(harmlos), `Renderfehler fälschlich als Ladefehler: ${harmlos}`);
  }
});

test("8 — die beiden Ursachen führen zu VERSCHIEDENEN Handlungen", () => {
  // Der Kern der Änderung: „Erneut versuchen" rendert denselben, weiterhin
  // fehlenden Codeabschnitt erneut an — es hilft beim Ladefehler nicht.
  assert.match(GRENZE, /onClick=\{chunk \? this\.reload : this\.reset\}/,
    "Ladefehler und Renderfehler brauchen verschiedene Handlungen");
  assert.match(GRENZE, /this\.reload = \(\) => window\.location\.reload\(\)/);
  assert.match(GRENZE, /this\.reset = \(\) => this\.setState\(\{ error: null \}\)/);
  assert.match(GRENZE, /aktion: "Seite neu laden"/);
  assert.match(GRENZE, /aktion: "Erneut versuchen"/);
});

test("9 — es wird NIE von selbst neu geladen", () => {
  const code = ohneKommentare(GRENZE);
  // Jedes reload/href muss an einem Ereignis hängen. Ein Aufruf im Render, im
  // Konstruktorrumpf oder in componentDidCatch wäre eine Schleife, die der
  // Nutzer nicht anhalten kann.
  const reloads = [...code.matchAll(/window\.location\.(reload\(\)|href\s*=)/g)];
  assert.equal(reloads.length, 1, `unerwartete Anzahl Reload-Stellen: ${reloads.length}`);
  assert.match(code, /this\.reload = \(\) => window\.location\.reload\(\)/,
    "der Reload darf nur als Handler existieren, nie als Anweisung im Ablauf");
  assert.doesNotMatch(code, /useEffect|componentDidMount/,
    "ein Effekt in der Grenze wäre der Weg zurück zum automatischen Neuladen");
});

test("10 — der Fehler wird geloggt, aber keine Nutzerdaten und keine Tokens", () => {
  assert.match(GRENZE, /console\.error\(/, "ein verschluckter Fehler ist unauffindbar");
  const code = ohneKommentare(GRENZE);
  for (const verboten of ["localStorage", "ce_token", "this.props.children", "user", "JSON.stringify"]) {
    assert.ok(!new RegExp(`console\\.error\\([^)]*${verboten}`, "s").test(code),
      `im Log darf ${verboten} nicht auftauchen`);
  }
});

test("11 — die sichtbare Fläche nennt keinen technischen Rohwert", () => {
  // Designsystemregel: „Kein roher Backendwert im sichtbaren Text." Die
  // Meldung des Fehlers gehört in die Konsole, nicht auf die Seite.
  const render = GRENZE.slice(GRENZE.indexOf("  render()"));
  assert.doesNotMatch(render, /error\.message|error\.stack|error\.name|\{error\}/,
    "die Fehlermeldung darf nicht in der sichtbaren Fläche stehen");
});

test("12 — beide Texte sagen zu, dass gespeicherte Daten unberührt bleiben, ohne etwas zu erfinden", () => {
  assert.match(GRENZE, /gespeicherten Daten sind davon nicht betroffen/);
  // Keine Emojis als Zustandsfläche (Designsystem-Abschluss).
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}]/u.test(GRENZE),
    "Emojis sind als Zustandsfläche systemweit ausgeschlossen");
});
