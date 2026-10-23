// Mobile Kopfleisten: Hamburger-Symbol und Glocke (Betreiberentscheidung 2026-10-17)
// und die Bedienung der Navigations-Drawer.
//
// Bis 2026-10-17 standen in den mobilen Kopfleisten die Textknöpfe „Menü“ und
// „Mitteilungen“ (Redesign #465). Der Betreiber hat das frühere Erscheinungsbild
// zurückbestellt: links das Hamburger-Symbol, rechts die Glocke. Was diese Datei
// absichert:
//   • alle vier Menüknöpfe (Kunde ×2, Admin, öffentliche Leiste) tragen das Symbol,
//     ihren unveränderten zugänglichen Namen, einen Tooltip, aria-expanded und
//     aria-controls auf ihren Drawer;
//   • die Drawer verhalten sich geöffnet wie ein Dialog (useDialog: Fokus hinein,
//     Escape schließt, Fokus zurück) und sind geschlossen unter der Drawer-Schwelle
//     unsichtbar — also nicht per Tab erreichbar; die feste Desktop-Spalte bleibt
//     unberührt;
//   • die Glocke ist nur in der mobilen Topbar ein Symbol, der Desktop behält das Wort;
//   • die Navigation selbst bleibt reine Textnavigation.
// Das Verhalten im echten Browser prüft tests/e2e/mobileNavigationIcons.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, "..", "..", rel), "utf8").replace(/\r\n/g, "\n");
const ohneKommentare = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const dashPage = ohneKommentare(read("pages/DashboardPage.jsx"));
const dashLayout = ohneKommentare(read("components/layout/DashboardLayout.jsx"));
const adminLayout = ohneKommentare(read("components/layout/AdminLayout.jsx"));
const navbar = ohneKommentare(read("components/layout/NavbarLayout.jsx"));
const sidebar = ohneKommentare(read("components/layout/DashboardSidebar.jsx"));
const adminSidebar = ohneKommentare(read("components/layout/AdminSidebar.jsx"));
const bell = ohneKommentare(read("components/notifications/NotificationBell.jsx"));
const premium = ohneKommentare(read("styles/dashboard-premium.css"));
const admin = ohneKommentare(read("styles/admin.css"));
const layoutCss = ohneKommentare(read("styles/layout.css"));

// Der Knopf ab seiner Klasse bis zum schließenden </button>.
function knopf(code, klasse) {
  const start = code.indexOf(`className="${klasse}"`);
  assert.ok(start > -1, `kein Knopf .${klasse}`);
  const auf = code.lastIndexOf("<button", start);
  return code.slice(auf, code.indexOf("</button>", start) + "</button>".length);
}

// Der Block eines @media-Abschnitts (bis zur passenden schließenden Klammer).
function mediaBlock(css, kopf) {
  const start = css.indexOf(kopf);
  assert.ok(start > -1, `kein ${kopf}`);
  let tiefe = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") tiefe++;
    if (css[i] === "}" && --tiefe === 0) return css.slice(start, i + 1);
  }
  throw new Error(`${kopf} nicht geschlossen`);
}

test("1 — jeder mobile Menüknopf ist das Hamburger-Symbol mit Namen, Tooltip und Zustand", () => {
  const faelle = [
    ["DashboardPage", knopf(dashPage, "hamburger-btn"), "Menü – Navigation öffnen", /aria-expanded=\{sidebarOpen\}/, /aria-controls=\{SIDEBAR_NAV_ID\}/],
    ["DashboardLayout", knopf(dashLayout, "hamburger-btn"), "Menü – Navigation öffnen", /aria-expanded=\{sidebarOpen\}/, /aria-controls=\{SIDEBAR_NAV_ID\}/],
    ["AdminLayout", knopf(adminLayout, "adm-topbar-burger"), "Menü öffnen", /aria-expanded=\{sidebarOpen\}/, /aria-controls=\{ADMIN_NAV_ID\}/],
    ["NavbarLayout", knopf(navbar, "hamburger-btn"), "Menü – Navigation öffnen", /aria-expanded=\{drawerOpen\}/, /aria-controls=\{drawerOpen \? DRAWER_ID : undefined\}/],
  ];
  for (const [name, k, label, expanded, controls] of faelle) {
    assert.match(k, /<Icon n="menu" s=\{ICON_SIZE\.lg\} \/>/, `${name}: kein Hamburger-Symbol`);
    assert.ok(k.includes(`aria-label="${label}"`), `${name}: der zugängliche Name hat sich geändert (E2E-Selektoren)`);
    assert.ok(k.includes(`title="${label}"`), `${name}: der Symbolknopf braucht einen Tooltip`);
    assert.match(k, expanded, `${name}: aria-expanded fehlt`);
    assert.match(k, controls, `${name}: aria-controls fehlt`);
    assert.doesNotMatch(k, />\s*Menü\s*</, `${name}: der Textknopf „Menü“ ist zurück`);
  }
});

test("2 — aria-controls trifft eine echte Kennung", () => {
  assert.match(sidebar, /export const SIDEBAR_NAV_ID = "ce-kundennavigation";/);
  assert.match(sidebar, /id=\{SIDEBAR_NAV_ID\}/, "die Kunden-Sidebar trägt die Kennung nicht");
  assert.match(adminSidebar, /export const ADMIN_NAV_ID = "ce-adminnavigation";/);
  assert.match(adminSidebar, /id=\{ADMIN_NAV_ID\}/, "die Adminsidebar trägt die Kennung nicht");
  assert.match(navbar, /const DRAWER_ID = "ce-oeffentliche-navigation";/);
  assert.match(navbar, /id=\{DRAWER_ID\}/, "der öffentliche Drawer trägt die Kennung nicht");
  // Beide Kundenkopfleisten lesen dieselbe Konstante — keine zweite Schreibweise.
  for (const code of [dashPage, dashLayout]) {
    assert.match(code, /import \{ DashboardSidebar, SIDEBAR_NAV_ID \} from/);
    assert.doesNotMatch(code, /aria-controls="ce-kundennavigation"/);
  }
});

test("3 — geöffnete Drawer: Fokus hinein, Escape schließt, Fokus zurück (useDialog)", () => {
  assert.match(sidebar, /const drawerRef = useNavigationDrawer\(\{ open: sidebarOpen, onClose: \(\) => setSidebarOpen\(false\), drawerMaxPx: DRAWER_BIS_PX \}\);/,
    "die Kunden-Sidebar nutzt das gemeinsame Dialogverhalten nicht");
  assert.match(sidebar, /ref=\{drawerRef\}/);
  assert.match(adminSidebar, /const drawerRef = useNavigationDrawer\(\{ open, onClose, drawerMaxPx: DRAWER_BIS_PX \}\);/,
    "die Adminsidebar nutzt das gemeinsame Dialogverhalten nicht");
  // Der Drawer-Hook baut auf useDialog auf — kein zweites Fokus-/Escape-Verhalten.
  assert.match(read("hooks/useNavigationDrawer.js"), /const ref = useDialog\(\{ open: Boolean\(open\), onClose \}\);/);
  assert.match(adminSidebar, /ref=\{drawerRef\}/);
  assert.match(navbar, /const drawerRef = useDialog\(\{ open: drawerOpen, onClose: \(\) => setDrawerOpen\(false\) \}\);/,
    "der öffentliche Drawer nutzt das gemeinsame Dialogverhalten nicht");
  assert.match(navbar, /<div ref=\{drawerRef\} id=\{DRAWER_ID\} className="mobile-drawer open"/);
  // useDialog selbst: Fokus auf das erste Element, Escape → onClose, Fokusrückgabe.
  const hook = read("hooks/useDialog.js");
  assert.match(hook, /if \(erste\) erste\.focus\(\);/);
  assert.match(hook, /e\.key === "Escape" && closeOnEscape/);
  assert.match(hook, /ziel\.focus\(\)/);
});

test("4 — wird das Fenster bei offenem Drawer breit, schließt er (keine Fokusfalle auf der festen Spalte)", () => {
  assert.match(sidebar, /const DRAWER_BIS_PX = 860;/);
  assert.match(adminSidebar, /const DRAWER_BIS_PX = 900;/);
  // Der Schließpfad liegt im gemeinsamen Hook; die Sidebars selbst bleiben ohne Effekt
  // (sidebarNavigation 3/8, adminNavigation 1).
  const drawerHook = read("hooks/useNavigationDrawer.js");
  assert.match(drawerHook, /window\.matchMedia\(`\(min-width: \$\{drawerMaxPx \+ 1\}px\)`\)/);
  assert.match(drawerHook, /if \(breit\.matches\) onCloseRef\.current\?\.\(\);/);
  for (const code of [sidebar, adminSidebar]) assert.doesNotMatch(code, /useEffect/);
  // Die Schwellen stimmen mit dem CSS überein.
  assert.ok(premium.includes("@media (max-width: 860px)"));
  assert.ok(admin.includes("@media (max-width: 900px)"));
});

test("5 — geschlossene Drawer sind unter der Schwelle unsichtbar und damit nicht per Tab erreichbar", () => {
  const kunde = mediaBlock(premium, "@media (max-width: 860px)");
  assert.match(kunde, /\.sidebar\.pp-side \{\s*visibility: hidden;\s*transition: transform var\(--ce-motion-slow\) var\(--ce-motion-ease-standard\), visibility 0s linear var\(--ce-motion-slow\);/,
    "die geschlossene Kunden-Sidebar bleibt fokussierbar");
  assert.match(kunde, /\.sidebar\.pp-side\.sidebar-open \{\s*visibility: visible;/, "die geöffnete Kunden-Sidebar ist unsichtbar");
  const adm = mediaBlock(read("styles/admin.css"), "@media (max-width: 900px) {\n  /* Drawer höchstens 320 px");
  assert.match(adm, /\.adm-side \{[^}]*visibility: hidden;/, "die geschlossene Adminsidebar bleibt fokussierbar");
  assert.match(adm, /\.adm-side-open \{[^}]*visibility: visible;/, "die geöffnete Adminsidebar ist unsichtbar");
  // Außerhalb der Drawer-Schwelle bleibt die feste Spalte unberührt: keine Sichtbarkeitsregel
  // auf .sidebar/.adm-side vor den Media-Blöcken.
  const vorKunde = premium.slice(0, premium.indexOf("@media (max-width: 860px)"));
  assert.doesNotMatch(vorKunde.replace(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g, ""),
    /\.sidebar[^{]*\{[^}]*visibility:/, "die Desktop-Spalte wird versteckt");
  // Ohne Bewegung schaltet der Drawer sofort (keine verzögerte, fokussierbare Phase).
  assert.match(premium, /\.app-shell \.sidebar\.pp-side,\s*\.app-shell \.sidebar\.pp-side\.sidebar-open \{ transition: none; \}/);
  assert.match(admin, /@media \(prefers-reduced-motion: reduce\) \{\s*\.adm-side,/);
});

test("6 — die Glocke: auf jeder Seite das Symbol (Paket G, D9); die Variante steuert nur Fläche und Größe", () => {
  assert.match(bell, /<Icon n="bell" s=\{ICON_SIZE\.lg\} \/>/);
  assert.doesNotMatch(bell, /variant === "topbar"\s*\?/, "der Inhalt hängt wieder an der Variante");
  assert.match(bell, /aria-label=\{knopfName\(unread\)\}/);
  assert.match(bell, /title=\{knopfName\(unread\)\}/);
  // Desktop-Mounts behalten ihre Variante (Soft-Button-Fläche): Übersicht und Seitenkopf rufen nicht die Topbar-Variante.
  assert.match(dashPage, /<NotificationBell variant="page"/);
  assert.match(dashLayout, /<NotificationBell variant="page"/);
});

test("7 — die Symbolknöpfe sind quadratische 44-px-Ziele ohne Textpolster", () => {
  const block = (css, sel) => {
    const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}"));
    return m ? m[1] : "";
  };
  for (const [css, sel] of [[premium, ".app-shell .hamburger-btn"], [layoutCss, ".hamburger-btn"], [admin, ".adm-topbar-burger"]]) {
    const b = block(css, sel);
    assert.match(b, /padding: 0;/, `${sel}: Textpolster statt Symbolknopf`);
    assert.doesNotMatch(b, /font-size/, `${sel}: Schriftregeln eines Textknopfs sind übrig`);
  }
  assert.match(block(premium, ".app-shell .hamburger-btn"), /min-width: var\(--ce-size-touch-target\);/);
  assert.match(block(premium, ".app-shell .hamburger-btn"), /min-height: var\(--ce-size-touch-target\);/);
});

test("8 — die Navigation selbst bleibt reine Textnavigation, ohne fremde Iconbibliothek", () => {
  for (const [name, code] of [["DashboardSidebar", sidebar], ["AdminSidebar", adminSidebar]]) {
    assert.doesNotMatch(code, /<Icon\b/, `${name}: Symbole in der Navigation`);
  }
  for (const code of [dashPage, dashLayout, adminLayout, navbar, bell]) {
    assert.doesNotMatch(code, /lucide-react|react-icons|@heroicons/, "fremde Iconbibliothek");
    assert.match(code, /import \{ Icon, ICON_SIZE \} from "\.\.?\/(?:\.\.\/)?(?:components\/)?ui\/Icon";/, "Icon nicht aus dem eigenen System");
  }
});
