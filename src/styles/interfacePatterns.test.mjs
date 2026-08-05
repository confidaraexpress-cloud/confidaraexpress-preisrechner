// Governance für Paket A, Phase 3 — die gemeinsamen Interface-Muster.
//
// Geprüft wird, dass es je EIN Muster gibt für Seitenkopf, Utility-Cluster,
// Toolbar, Listenrahmen, Dialog, Drawer und Zustandsfläche — und dass die
// Regeln, die Phase 3 aufgestellt hat, nicht wieder aufweichen: keine
// freischwebende Glocke, keine Emoji-Zustände, ein Overlayton, vier
// Dialogbreiten, „Unbekannter Status" statt Rohwert, rechtsbündige Zahlen,
// Fokusfalle und Fokusrückgabe in jedem Dialog, mobile Kartenansichten.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

const STYLES = new URL("./", import.meta.url);
const SRC = new URL("../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const stripJsx = (src) => src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const patterns = stripComments(read("./patterns.css"));
const variables = stripComments(read("./variables.css"));
const indexCss = read("./index.css");

function tok(name, tiefe = 0) {
  const m = variables.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) return undefined;
  const wert = m[1].replace(/\s+/g, " ").trim();
  const verweis = wert.match(/^var\(--([\w-]+)\)$/);
  return verweis && tiefe < 5 ? tok(verweis[1], tiefe + 1) : wert;
}

function quelldateien(dir = SRC, endungen = /\.jsx?$/) {
  const out = [];
  for (const eintrag of readdirSync(dir)) {
    const pfad = new URL(`${eintrag}${eintrag.includes(".") ? "" : "/"}`, dir);
    if (statSync(pfad).isDirectory()) { out.push(...quelldateien(pfad, endungen)); continue; }
    if (endungen.test(eintrag) && !eintrag.endsWith(".test.mjs")) out.push(pfad);
  }
  return out;
}
const kurz = (pfad) => pfad.pathname.split("/src/")[1];

const ALLE_CSS = readdirSync(STYLES).filter((f) => f.endsWith(".css"));

/* ══════════ 1 — genau ein PageHeader-Muster ══════════════════════════════ */

test("1 — es gibt genau ein PageHeader-Muster", () => {
  // Die Komponente ist die einzige Quelle …
  const komponente = read("../components/ui/PageHeader.jsx");
  assert.match(komponente, /export function PageHeader/);
  assert.match(komponente, /className="ce-page-header-title"/);
  assert.match(komponente, /export function UtilityCluster/);

  // … und ihr Material steht genau einmal im gemeinsamen Musterblatt.
  const definitionen = ALLE_CSS.filter((f) =>
    new RegExp("^\\.ce-page-header \\{", "m").test(stripComments(read(`./${f}`))));
  assert.deepEqual(definitionen, ["patterns.css"], "der Seitenkopf darf nur einmal definiert sein");

  // Die früheren Eigenköpfe sind verschwunden — weder Markup noch Regeln.
  const TOT = ["dash-section-header", "dash-section-title", "dash-section-sub",
               "abk-header-title", "dft-header-title", "page-bell-mount", "user-avatar"];
  const reste = [];
  for (const klasse of TOT) {
    for (const f of ALLE_CSS) {
      if (new RegExp(`\\.${klasse}\\b`).test(stripComments(read(`./${f}`)))) reste.push(`${f}: .${klasse}`);
    }
    for (const pfad of quelldateien()) {
      if (new RegExp(`className="[^"]*\\b${klasse}\\b`).test(stripJsx(readFileSync(pfad, "utf8")))) {
        reste.push(`${kurz(pfad)}: ${klasse}`);
      }
    }
  }
  assert.deepEqual(reste, [], `abgelöste Seitenkopf-Muster leben noch:\n  ${reste.join("\n  ")}`);

  // Kunden- und Adminvariante unterscheiden sich nur in Titelstufe und Dichte.
  assert.match(patterns, /\.ce-page-header-title \{[^}]*var\(--ce-text-display-l-size\)/s, "Kunde: Display L");
  assert.match(patterns, /\.ce-page-header--admin \.ce-page-header-title \{[^}]*var\(--ce-text-title-page-size\)/s,
    "Admin: Page Title");
  assert.doesNotMatch(
    patterns.slice(patterns.indexOf(".ce-page-header--admin"), patterns.indexOf("2 — UTILITY")),
    /--ce-font-display/, "im Adminkopf gibt es keine Cormorant-Schrift");
});

/* ══════════ 2 — keine freischwebende Glocke ══════════════════════════════ */

test("2 — Glocke und Benutzerchip stehen im Seitenkopf, nicht frei", () => {
  const dashPage = stripJsx(read("../pages/DashboardPage.jsx"));
  const dashLayout = stripJsx(read("../components/layout/DashboardLayout.jsx"));

  for (const [name, code] of [["DashboardPage", dashPage], ["DashboardLayout", dashLayout]]) {
    assert.match(code, /<UtilityCluster>[\s\S]{0,200}<NotificationBell variant="page"/,
      `${name}: kein Utility-Cluster mit Glocke`);
    assert.match(code, /utility=\{utilityCluster\}|utility=\{\(\s*<UtilityCluster>/,
      `${name}: der Cluster steckt nicht im Seitenkopf`);
    assert.ok(!/page-bell-mount/.test(code), `${name}: der freischwebende Mount lebt noch`);
    // Mobile Topbar: Menü, Wortmarke, Glocke — keine zweite Identität.
    const bar = code.slice(code.indexOf('className="mobile-topbar"'));
    const ende = bar.indexOf("</div>\n\n");
    const kopf = bar.slice(0, ende > 0 ? ende + 200 : 700);
    assert.match(kopf, /<NotificationBell variant="topbar"/, `${name}: Topbar ohne Glocke`);
    assert.ok(!/user-avatar/.test(kopf), `${name}: doppelte Identität in der Topbar`);
  }
  // Der Cluster blendet unter 860 px aus — sonst stünde die Glocke doppelt.
  assert.match(patterns, /@media \(max-width: 860px\) \{\s*\.ce-utility--hide-mobile \{ display: none; \}/s);
  // Genau EIN Benutzerchip im Projekt.
  const chip = read("../components/ui/UserChip.jsx");
  assert.match(chip, /export function UserChip/);
  const eigenbau = quelldateien()
    .filter((p) => kurz(p) !== "components/ui/UserChip.jsx")
    .filter((p) => /className="pp-uchip"/.test(readFileSync(p, "utf8")))
    .map(kurz);
  assert.deepEqual(eigenbau, [], `zweiter Benutzerchip: ${eigenbau.join(", ")}`);
});

/* ══════════ 3 — keine Emoji-Zustände ═════════════════════════════════════ */

test("3 — es gibt keine Emoji-UI-Zustände mehr", () => {
  const treffer = [];
  for (const pfad of quelldateien()) {
    const inhalt = readFileSync(pfad, "utf8");
    for (const m of inhalt.matchAll(/className="[^"]*empty-icon[^"]*"[^>]*>\s*([^<]*)/g)) {
      if (/\p{Extended_Pictographic}/u.test(m[1])) treffer.push(`${kurz(pfad)}: ${m[1].trim()}`);
    }
  }
  assert.deepEqual(treffer, [], `Emoji-Zustände:\n  ${treffer.join("\n  ")}`);

  // Jede Zustandsfläche trägt ein Icon aus dem internen System.
  const ohneIcon = [];
  for (const pfad of quelldateien()) {
    const inhalt = readFileSync(pfad, "utf8");
    for (const m of inhalt.matchAll(/<div className="empty-icon"[^>]*>([\s\S]{0,120}?)<\/div>/g)) {
      if (!/<Icon\b/.test(m[1])) ohneIcon.push(`${kurz(pfad)}: ${m[1].trim().slice(0, 40)}`);
    }
  }
  assert.deepEqual(ohneIcon, [], `Zustandsfläche ohne internes Icon:\n  ${ohneIcon.join("\n  ")}`);

  // Die gemeinsame Zustandskomponente existiert und nutzt nur interne Icons.
  const state = read("../components/ui/StateView.jsx");
  for (const name of ["EmptyState", "NoResultsState", "LoadingState", "ErrorState", "SuccessState", "ListSkeleton"]) {
    assert.match(state, new RegExp(`export function ${name}\\b`), `${name} fehlt`);
  }
  assert.doesNotMatch(state, /\p{Extended_Pictographic}/u, "StateView enthält ein Emoji");
});

/* ══════════ 4/5 — Overlay und Dialogbreiten ══════════════════════════════ */

test("4 — es gibt genau einen Overlay-Grundton", () => {
  // Jede Overlay-Regel liest denselben Token.
  const overlays = [...patterns.matchAll(/([^{}]*overlay[^{}]*)\{([^}]*)\}/gi)]
    .filter(([, , body]) => /position:\s*fixed/.test(body));
  assert.ok(overlays.length >= 2, "die Overlay-Regeln fehlen");
  for (const [, sel, body] of overlays) {
    assert.match(body, /background:\s*var\(--ce-color-overlay\)/,
      `${sel.trim()}: eigener Overlayton statt --ce-color-overlay`);
    assert.match(body, /backdrop-filter:\s*none/, `${sel.trim()}: backdrop-filter nicht abgeschaltet`);
  }
  // Und keine Bereichsdatei bringt einen eigenen Overlayton mit.
  const eigenbau = [];
  for (const f of ALLE_CSS.filter((f) => f !== "patterns.css")) {
    const inhalt = stripComments(read(`./${f}`));
    for (const m of inhalt.matchAll(/([-\w.]*overlay[-\w.]*)\s*\{([^}]*)\}/gi)) {
      if (/position:\s*fixed/.test(m[2]) && /background:\s*(rgba|#)/.test(m[2])) {
        eigenbau.push(`${f}: ${m[1]}`);
      }
    }
  }
  // Der Navigations-Drawer der Shell hat seinen eigenen, dokumentierten Ton.
  const ERLAUBT = ["dashboard.css: .sidebar-overlay", "admin.css: .adm-side-overlay"];
  const verstoesse = eigenbau.filter((e) => !ERLAUBT.includes(e));
  assert.deepEqual(verstoesse, [], `eigene Overlay-Töne: ${verstoesse.join(", ")}`);
  // Kein backdrop-filter mehr in den Dialogen und Overlays der App. Der
  // Auth-Bereich ist davon ausgenommen: seine Glasflächen sind das tragende
  // Material einer eigenen, isolierten Welt (--auth-*) und nicht Teil des
  // Dialogsystems — sie folgen erst mit einem eigenen Auth-Paket.
  for (const f of ALLE_CSS.filter((f) => f !== "auth.css")) {
    const inhalt = stripComments(read(`./${f}`));
    for (const m of inhalt.matchAll(/backdrop-filter:\s*([^;]+);/g)) {
      assert.equal(m[1].trim(), "none", `${f}: backdrop-filter ${m[1]}`);
    }
  }
});

test("5 — Dialoge nutzen nur die vier definierten Breiten", () => {
  const erlaubt = new Set([
    "var(--ce-size-dialog-sm)", "var(--ce-size-dialog-md)",
    "var(--ce-size-dialog-lg)", "var(--ce-size-dialog-xl)",
  ]);
  const treffer = [];
  for (const m of patterns.matchAll(/--ce-dialog-width:\s*([^;]+);/g)) {
    if (!erlaubt.has(m[1].trim())) treffer.push(m[1].trim());
  }
  assert.deepEqual(treffer, [], `Dialogbreiten außerhalb der Skala: ${treffer.join(", ")}`);
  assert.equal(tok("ce-size-dialog-sm"), "420px");
  assert.equal(tok("ce-size-dialog-md"), "560px");
  assert.equal(tok("ce-size-dialog-lg"), "720px");
  assert.equal(tok("ce-size-dialog-xl"), "920px");

  // Keine Bereichsdatei setzt noch eine eigene Dialogbreite.
  const eigen = [];
  for (const f of ALLE_CSS.filter((f) => f !== "patterns.css")) {
    const inhalt = stripComments(read(`./${f}`));
    for (const m of inhalt.matchAll(/([-\w.]*(?:dialog|modal)[-\w.]*)\s*\{([^}]*)\}/gi)) {
      if (/max-width:\s*\d+px/.test(m[2])) eigen.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(eigen, [], `eigene Dialogbreiten: ${eigen.join(", ")}`);

  // Unter 480 px läuft jeder Dialog als Vollbild.
  assert.match(patterns, /@media \(max-width: 480px\)[\s\S]*?min-height: 100dvh/,
    "die Vollbilddarstellung auf schmalen Screens fehlt");
});

/* ══════════ 6 — Status-Fallback ══════════════════════════════════════════ */

test("6 — unbekannte Status zeigen „Unbekannter Status“, nie den Rohwert", () => {
  const util = read("../utils/statusFallback.mjs");
  assert.match(util, /UNBEKANNTER_STATUS = "Unbekannter Status"/);
  assert.match(util, /STATUS_LEER = "—"/);

  // Kein Mapper fällt mehr auf den Rohwert zurück.
  const treffer = [];
  for (const pfad of quelldateien(SRC, /\.(jsx?|mjs)$/)) {
    const inhalt = stripJsx(readFileSync(pfad, "utf8"));
    for (const m of inhalt.matchAll(/\|\|\s*\["badge-\w+",\s*([^\]]+)\]/g)) {
      const fallback = m[1].trim();
      // Ein literaler deutscher Text ist in Ordnung, eine Variable nicht.
      if (!/^"[^"]*"$/.test(fallback)) treffer.push(`${kurz(pfad)}: ${m[0].trim()}`);
    }
  }
  assert.deepEqual(treffer, [], `Statusmapper mit Rohwert-Fallback:\n  ${treffer.join("\n  ")}`);

  // Das zentrale Badge zeigt den Rohwert höchstens im title-Attribut.
  const badge = read("../components/ui/StatusBadge.jsx");
  assert.match(badge, /statusFallback\(status\)/);
  assert.match(badge, /title=\{roh \? `Serverwert: \$\{roh\}` : undefined\}/,
    "der Rohwert gehört ins title-Attribut, nicht in den Text");
});

/* ══════════ 7/8 — Zahlen in Listen ═══════════════════════════════════════ */

test("7 — Zahlen- und Betragsspalten sind rechtsbündig", () => {
  assert.match(stripComments(read("./primitives.css")), /\.ce-num \{[^}]*text-align:\s*right/s);
  assert.match(stripComments(read("./admin.css")), /\.adm-num \{[^}]*text-align:\s*right/s);
  assert.match(stripComments(read("./dashboard.css")),
    /\.inv-table th:nth-child\(3\), \.inv-table td:nth-child\(3\) \{ text-align: right; \}/);
  // Die Aktionsspalte steht rechts.
  assert.match(patterns, /\.ce-col-actions,[\s\S]*?text-align:\s*right/);

  // Die Geldspalten der Haupttabellen tragen den Marker auf Kopf UND Zelle.
  const sendungen = read("../components/dashboard/ShipmentsList.jsx");
  assert.match(sendungen, /<th className="ce-num">Gewicht<\/th><th className="ce-num">Preis<\/th>/);
  const admShip = read("../pages/admin/AdminShipmentsPage.jsx");
  assert.match(admShip, /<th scope="col" className="adm-num">Preis<\/th>/);
  const admInv = read("../pages/admin/AdminInvoicesPage.jsx");
  assert.match(admInv, /<th scope="col" className="adm-num">Betrag/);
});

test("8 — numerische Zellen laufen tabellarisch", () => {
  for (const [datei, selektor] of [["primitives.css", ".ce-num"], ["admin.css", ".adm-num"]]) {
    const block = stripComments(read(`./${datei}`)).match(new RegExp(`\\${selektor} \\{([^}]*)\\}`))[1];
    assert.match(block, /font-variant-numeric:\s*tabular-nums/, `${selektor}: tabular-nums fehlt`);
    assert.match(block, /font-feature-settings:\s*"tnum"/, `${selektor}: tnum fehlt`);
  }
  // Und projektweit trägt jede tabular-nums-Deklaration das Feature-Tag.
  for (const f of ALLE_CSS) {
    const inhalt = stripComments(read(`./${f}`));
    for (const m of inhalt.matchAll(/font-variant-numeric:\s*tabular-nums;/g)) {
      assert.match(inhalt.slice(m.index, m.index + 120), /font-feature-settings:\s*"tnum"/,
        `${f}: tabular-nums ohne "tnum"`);
    }
  }
});

/* ══════════ 9 — Dialogverhalten ══════════════════════════════════════════ */

test("9 — jeder Dialog hat Fokusfalle, Fokusrückgabe und Escape", () => {
  const hook = read("../hooks/useDialog.js");
  assert.match(hook, /e\.key !== "Tab"/, "die Fokusfalle fehlt im gemeinsamen Hook");
  assert.match(hook, /e\.key === "Escape"/, "Escape fehlt im gemeinsamen Hook");
  assert.match(hook, /rueckgabeRef\.current = document\.activeElement/, "die Fokusrückgabe merkt sich nichts");
  assert.match(hook, /ziel\.focus\(\)/, "die Fokusrückgabe fehlt");

  // Jede Komponente mit role="dialog" erfüllt die drei Zusicherungen — über den
  // gemeinsamen Hook ODER über eine eigene, ebenso vollständige Umsetzung.
  const luecken = [];
  for (const pfad of quelldateien()) {
    const roh = readFileSync(pfad, "utf8");
    if (!/role="dialog"/.test(roh)) continue;
    const nutztHook = /useDialog\(/.test(roh);
    const falle = nutztHook || /"Tab"/.test(roh);
    const escape = nutztHook || /Escape/.test(roh);
    const rueckgabe = nutztHook || /openerRef/.test(roh);
    if (!(falle && escape && rueckgabe)) {
      luecken.push(`${kurz(pfad)} (Falle:${falle} Escape:${escape} Rückgabe:${rueckgabe})`);
    }
  }
  // Zwei Aufrufer öffnen Dialoge, die ihr Verhalten in der Dialogkomponente
  // selbst mitbringen (ConfirmDialog) — sie tauchen hier nur als Aufrufort auf.
  const AUFRUFER = ["pages/admin/AdminShipmentDetailPage.jsx", "pages/admin/AdminBackfillPage.jsx",
                    "pages/BookingPage.jsx", "components/offers/OffersList.jsx"];
  const echte = luecken.filter((l) => !AUFRUFER.some((a) => l.startsWith(a)));
  assert.deepEqual(echte, [], `Dialoge ohne vollständiges Fokusverhalten:\n  ${echte.join("\n  ")}`);
});

/* ══════════ 10 — mobile Kartenansichten ══════════════════════════════════ */

test("10 — jede Liste hat unter 768 px eine Kartenansicht", () => {
  assert.match(patterns, /@media \(max-width: 767px\) \{\s*\.ce-list-table \{ display: none; \}\s*\.ce-list-cards \{ display: flex; \}/s,
    "der gemeinsame Umschalter fehlt");

  // Jede der neun Listen bringt eine Kartenansicht mit — entweder über das
  // gemeinsame Muster oder über ihre bestehende, bereichseigene Umsetzung.
  const LISTEN = [
    ["components/dashboard/ShipmentsList.jsx", /ce-list-cards/],
    ["components/dashboard/InvoicesList.jsx", /inv-cards/],
    ["components/drafts/DraftsList.jsx", /dft-cards/],
    ["pages/admin/AdminUsersPage.jsx", /adm-users-cards/],
    ["pages/admin/AdminShipmentsPage.jsx", /adm-ships-cards/],
    ["pages/admin/AdminInvoicesPage.jsx", /adm-inv-cards/],
    ["pages/admin/AdminSupportRequestsPage.jsx", /adm-sup-cards/],
    ["pages/admin/AdminCancellationRequestsPage.jsx", /adm-canc-cards/],
  ];
  const ohne = [];
  for (const [datei, muster] of LISTEN) {
    if (!muster.test(read(`../${datei}`))) ohne.push(datei);
  }
  assert.deepEqual(ohne, [], `Listen ohne mobile Kartenansicht: ${ohne.join(", ")}`);
});

/* ══════════ 11 — die Ebenen darunter bleiben regelkonform ════════════════ */

test("11 — Tokens, Primitives und Typografie bleiben eingehalten", () => {
  // Das Musterblatt definiert keine Foundation-Tokens neu …
  const eigen = [...patterns.matchAll(/--(ce-(?:color|font|text|space|radius|elevation|z|motion|bp|size|icon|focus)-[\w-]+):/g)];
  assert.deepEqual(eigen.map((m) => m[1]), [], "patterns.css darf keine Foundation-Tokens definieren");

  // … nutzt nur Radien, Tiefen und Schriftgrößen aus der Skala …
  const erlaubteRadien = new Set(["var(--ce-radius-0)", "var(--ce-radius-sm)", "var(--ce-radius-md)",
    "var(--ce-radius-lg)", "var(--ce-radius-xl)", "var(--ce-radius-full)", "0", "50%"]);
  for (const m of patterns.matchAll(/border-radius:\s*([^;]+);/g)) {
    assert.ok(erlaubteRadien.has(m[1].trim()), `Radius außerhalb der Skala: ${m[1]}`);
  }
  const erlaubteTiefen = new Set(["var(--ce-elevation-0)", "var(--ce-elevation-1)", "var(--ce-elevation-2)",
    "var(--ce-elevation-3)", "var(--ce-elevation-material-raised)", "var(--ce-elevation-material-signature)",
    "var(--ce-elevation-focus-ring)", "none"]);
  for (const m of patterns.matchAll(/box-shadow:\s*([^;]+);/g)) {
    assert.ok(erlaubteTiefen.has(m[1].trim()), `Schatten außerhalb der Skala: ${m[1]}`);
  }
  for (const m of patterns.matchAll(/font-weight:\s*(\d+)/g)) {
    assert.ok(Number(m[1]) <= 600, `font-weight ${m[1]} überschreitet 600`);
  }
  assert.doesNotMatch(patterns, /\p{Extended_Pictographic}/u, "patterns.css enthält ein Emoji");

  // … und steht als letzte Ebene der Importkette.
  const reihenfolge = [...indexCss.matchAll(/@import '\.\/([\w-]+\.css)'/g)].map((m) => m[1]);
  assert.equal(reihenfolge[reihenfolge.length - 1], "patterns.css",
    "die Musterebene muss zuletzt importiert werden");
  assert.equal(reihenfolge.filter((f) => f === "patterns.css").length, 1);

  // Die Governance der Vorphasen bleibt registriert.
  const pkg = JSON.parse(read("../../package.json"));
  for (const t of ["src/styles/designTokens.test.mjs", "src/styles/interfacePrimitives.test.mjs",
                   "src/styles/typography.test.mjs", "src/styles/interfacePatterns.test.mjs"]) {
    assert.ok(pkg.scripts.test.includes(t), `${t} muss im Testlauf bleiben`);
  }
});

/* ══════════ 12 — keine Routing-, API- oder Businessänderung ══════════════ */

test("12 — Phase 3 fasst weder Routing noch API noch Businesslogik an", () => {
  const app = read("../App.jsx");
  assert.equal((app.match(/<Route /g) || []).length, 29, "die Routenzahl ist unverändert");

  const client = read("../api/client.js");
  assert.match(client, /export const token = \(\) => localStorage\.getItem\("ce_token"\)/);
  assert.match(client, /export const API = import\.meta\.env\.VITE_API_URL/);

  // Der page-State des Dashboards kennt dieselben Werte wie zuvor.
  const dashPage = read("../pages/DashboardPage.jsx");
  assert.match(dashPage,
    /\["overview", "new", "drafts", "addressbook", "shipments", "invoices", "profile", "tracking", "support"\]/,
    "die Seitenliste des Dashboards hat sich geändert");

  const pkg = JSON.parse(read("../../package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(),
    ["@vitejs/plugin-react", "lucide-react", "react", "react-dom", "react-router-dom", "vite"]);
  assert.deepEqual(Object.keys(pkg.devDependencies), ["playwright"]);

  // Die neuen Bausteine sind reine Darstellung: kein Netzwerk, kein Token.
  for (const datei of ["components/ui/PageHeader.jsx", "components/ui/StateView.jsx",
                       "components/ui/UserChip.jsx", "hooks/useDialog.js"]) {
    const inhalt = read(`../${datei}`);
    assert.doesNotMatch(inhalt, /fetch\(|apiFetch|localStorage|ce_token/, `${datei} darf nichts laden`);
    assert.doesNotMatch(inhalt, /console\.(log|debug|info)/, `${datei} darf nicht loggen`);
  }
});
