// Governance: Navigation, White-Screen-Schutz und Formular-Persistenz.
//
// ─── Warum diese Datei existiert ─────────────────────────────────────────────
// Reine Quelltextprüfung (konsistent zu den übrigen Governance-Tests dieses
// Repos), die drei Audit-Ergebnisse dauerhaft festhält:
//
//   1. Die App hatte KEINE Fehlergrenze — ein unbehandelter Renderfehler ließ
//      React 18 den gesamten Baum auf ein leeres <div id="root"> abhängen.
//      ContentErrorBoundary schließt das je EINMAL in DashboardPage (page-State-
//      Welt) und DashboardLayout (routenbasierte Welt), jeweils mit `key` auf
//      den aktuellen Seitenwert — ein Seitenwechsel remountet die Grenze damit
//      automatisch, ein hängen gebliebener Fehler blockiert nie die nächste
//      Seite. Sidebar/Shell bleiben bewusst AUSSERHALB der Grenze, damit ein
//      Inhaltsfehler nie die Navigation mit abhängt.
//   2. Der bereits einmal behobene Race (ein Startwert wird synchron im
//      useState-Initialisierer berechnet, ein fachlich zusammengehöriger Wert
//      dagegen erst in einem späteren useEffect) betraf `inventoryFilter`
//      gegenüber `page`/`waehleStartbereich`. Beide müssen dauerhaft aus
//      DEMSELBEN synchronen Initialisierer kommen.
//   3. Die „einfachen" Lager-Formulare (Artikel anlegen/bearbeiten,
//      Wareneingang, Bestandskorrektur, Bestand sperren, Auftrag erstellen)
//      sind reiner Komponenten-State ohne jede Storage-Anbindung — ein
//      Browser-Reload räumt sie dadurch zwangsläufig auf. Dieser Test hält
//      fest, dass niemand künftig eine Persistenz für diese Dialoge einführt.
//
// Empirisch zusätzlich abgesichert (echter Dev-Server, gemocktes Backend,
// scratchpad/verify.mjs, 23/23 PASS): F5 bleibt auf der aktuellen Seite,
// die sechs genannten Dialoge überleben kein F5, und Auftrag/Artikel →
// „Versand vorbereiten" → Reload sowie „Eingaben zurücksetzen" verhalten sich
// wie hier festgehalten.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const dashboardPage   = read("../pages/DashboardPage.jsx");
const dashboardLayout = read("../components/layout/DashboardLayout.jsx");
const boundarySrc     = read("../components/common/ContentErrorBoundary.jsx");
const productsPage    = read("../pages/inventory/ProductsPage.jsx");
const stockPage       = read("../pages/inventory/StockPage.jsx");
const ordersPage      = read("../pages/inventory/OrdersPage.jsx");

/* ══════════ 1 — Content-Error-Boundary als letzte Schutzschicht ══════════ */

test("1a — ContentErrorBoundary fängt nie den ganzen Baum, nur den Seiteninhalt", () => {
  assert.match(boundarySrc, /class ContentErrorBoundary extends React\.Component/,
    "ContentErrorBoundary ist keine Klassenkomponente (getDerivedStateFromError braucht eine)");
  assert.match(boundarySrc, /static getDerivedStateFromError/);
  assert.match(boundarySrc, /componentDidCatch\(error, info\)/);
  // Der Fehler wird nie verschluckt: er muss geloggt werden.
  assert.match(boundarySrc, /console\.error\(/, "componentDidCatch darf den Fehler nicht verschlucken");
});

test("1b — DashboardPage umschließt den page-State-Inhalt mit ContentErrorBoundary, Sidebar bleibt außerhalb", () => {
  assert.match(dashboardPage, /import \{ ContentErrorBoundary \} from "\.\.\/components\/common\/ContentErrorBoundary"/);
  assert.match(dashboardPage, /<ContentErrorBoundary key=\{page\}>/,
    "die Grenze muss mit key={page} remounten, sonst überlebt ein Fehler den Seitenwechsel");
  // Sidebar/Mobile-Topbar müssen VOR der öffnenden Grenze stehen (also außerhalb).
  const sidebarIdx  = dashboardPage.indexOf("<DashboardSidebar");
  const boundaryIdx = dashboardPage.indexOf("<ContentErrorBoundary key={page}>");
  const closeIdx    = dashboardPage.indexOf("</ContentErrorBoundary>");
  assert.ok(sidebarIdx > -1 && boundaryIdx > -1 && closeIdx > -1, "Sidebar/Grenze nicht gefunden");
  assert.ok(sidebarIdx < boundaryIdx, "DashboardSidebar muss außerhalb (vor) der ContentErrorBoundary liegen");
  // LegalLinks (Footer) muss NACH der schließenden Grenze stehen (ebenfalls außerhalb).
  const legalIdx = dashboardPage.indexOf("<LegalLinks />");
  assert.ok(legalIdx > closeIdx, "LegalLinks (Footer) muss außerhalb der ContentErrorBoundary liegen");
});

test("1c — DashboardLayout umschließt den Outlet mit ContentErrorBoundary, Sidebar bleibt außerhalb", () => {
  assert.match(dashboardLayout, /import \{ ContentErrorBoundary \} from "\.\.\/common\/ContentErrorBoundary"/);
  assert.match(dashboardLayout, /<ContentErrorBoundary key=\{location\.pathname\}>/,
    "die Grenze muss mit key={location.pathname} remounten, sonst überlebt ein Fehler den Routenwechsel");
  const sidebarIdx  = dashboardLayout.indexOf("<DashboardSidebar");
  const boundaryIdx = dashboardLayout.indexOf("<ContentErrorBoundary key={location.pathname}>");
  const closeIdx    = dashboardLayout.indexOf("</ContentErrorBoundary>");
  assert.ok(sidebarIdx > -1 && boundaryIdx > -1 && closeIdx > -1, "Sidebar/Grenze nicht gefunden");
  assert.ok(sidebarIdx < boundaryIdx, "DashboardSidebar muss außerhalb (vor) der ContentErrorBoundary liegen");
  const legalIdx = dashboardLayout.indexOf("<LegalLinks />");
  assert.ok(legalIdx > closeIdx, "LegalLinks (Footer) muss außerhalb der ContentErrorBoundary liegen");
  assert.match(dashboardLayout, /<Outlet context=\{\{/, "Outlet muss weiterhin gerendert werden");
});

/* ══════════ 2 — Startwert-Race: synchron berechnete Geschwisterwerte ═════ */

test("2 — page und inventoryFilter kommen aus DEMSELBEN synchronen useState-Initialisierer", () => {
  assert.match(dashboardPage, /const \[page, setPage\] = useState\(\(\) => waehleStartbereich\(location\)\)/,
    "page muss synchron aus waehleStartbereich(location) kommen (kein Effekt)");
  assert.match(dashboardPage, /const \[inventoryFilter, setInventoryFilter\] = useState\(\(\) => waehleStartfilter\(location\)\)/,
    "inventoryFilter muss synchron aus waehleStartfilter(location) kommen — sonst reproduziert sich der " +
    "bereits behobene Warm-Chunk-Race (Deep-Link filtert beim ersten Aufruf, beim zweiten nicht mehr)");
  // Beide Funktionen müssen tatsächlich rein/synchron sein (keine async/Promise-Signatur).
  assert.doesNotMatch(dashboardPage, /async function waehleStartbereich/);
  assert.doesNotMatch(dashboardPage, /async function waehleStartfilter/);
});

/* ══════════ 3 — Einfache Lager-Dialoge bleiben ohne Storage-Anbindung ════ */

test("3 — Artikel-/Bestand-/Auftrag-Dialoge fassen keinen Storage-Mechanismus an", () => {
  for (const [name, src] of [["ProductsPage", productsPage], ["StockPage", stockPage], ["OrdersPage", ordersPage]]) {
    assert.doesNotMatch(src, /localStorage/, `${name} darf keine localStorage-Anbindung haben (Dialoge müssen F5 nicht überleben)`);
    assert.doesNotMatch(src, /sessionStorage/, `${name} darf keine sessionStorage-Anbindung haben (Dialoge müssen F5 nicht überleben)`);
  }
});

test("3b — die Dialog-Öffnungszustände sind reiner useState, nicht aus location abgeleitet", () => {
  // formOpen/dialog/editing dürfen nicht aus location.search/location.state gespeist werden —
  // sonst würde ein Deep-Link versehentlich einen Dialog offen starten lassen.
  assert.doesNotMatch(productsPage, /setFormOpen\([^)]*location/);
  assert.doesNotMatch(stockPage, /setDialog\([^)]*location/);
  assert.doesNotMatch(ordersPage, /setFormOpen\([^)]*location/);
});
