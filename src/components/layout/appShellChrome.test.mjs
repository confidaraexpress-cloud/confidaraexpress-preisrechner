// Source-Structure-Tests für das Chrome des eingeloggten Bereichs:
// gemeinsame Shell (.app-shell, kühler Grund) und gemeinsame Sidebar
// (.sidebar.pp-side, Deep Navy und textbasiert) — Stand Redesign 2026-10 in
// der ursprünglichen ConfidaraExpress-Farbwelt.
//
// Rein statische Prüfungen der Quell-Invarianten — kein Rendering, keine neue
// Dependency. Geprüft wird, was leicht versehentlich kaputtgeht: dass es genau
// eine Shell und eine Sidebar gibt, dass keine seitenabhängige Sondervariante
// zurückkehrt, dass Chrome-Farben ausschließlich über Tokens laufen, dass die
// Navigation reiner Text bleibt, dass keine Dauereffekte entstehen, dass
// Admin- und Auth-Bereich getrennt bleiben — und dass die Kontraste der
// Navy-Sidebar WCAG AA erfüllen (gerechnet, nicht geschätzt).
//
// Redesign 2026-10: Struktur neu (reine Textnavigation, 248 px, sekundäre
// Aktionen unter einer Trennlinie, keine Supportkarte, kein Wasserzeichen),
// Farbwelt und Marke ursprünglich (Navy-Sidebar mit blauer Akzentkante,
// Original-Lockup in der Reverse-Fassung). Veredelung 2026-10: der Grund ist
// eine kühle Rampe aus den Flächentönen der Farbwelt mit zwei Lichtflächen
// (Indigo, Violett), Arbeitsflächen tragen eine sehr leichte Tiefe. Die zwischenzeitliche Petrol-Richtung ist
// zurückgenommen. Feinkorrektur 2026-10: Navigation 15/22 mit einem
// 44-px-Rhythmus, Unterzeile „B2B Logistik- und Versandplattform" unter der
// Marke, zweite Lichtfläche im Markenindigo, in der Sidebar eine leise
// Lichtfläche, helle Innenkante und der weiche Kantenschatten der
// ursprünglichen Shell. Die funktionalen Zusicherungen (Navigationsbestand,
// Drawer, Scrollbereich, Fokus, Footer, Bereichstrennung) sind unverändert.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const variables = read("../../styles/variables.css");

// Tokenwert aus variables.css; ein var()-Verweis wird aufgelöst, damit die
// Kontrastprüfungen mit echten Farbwerten rechnen.
function tok(name, tiefe = 0) {
  const m = variables.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) return undefined;
  const wert = m[1].trim();
  const verweis = wert.match(/^var\(--([\w-]+)\)$/);
  return verweis && tiefe < 4 ? tok(verweis[1], tiefe + 1) : wert;
}
const premium   = read("../../styles/dashboard-premium.css");
const dashboard = read("../../styles/dashboard.css");
const adminCss  = read("../../styles/admin.css");
const authCss   = read("../../styles/auth.css");

const sidebarJsx   = read("./DashboardSidebar.jsx");
const brandLogoJsx = read("../ui/BrandLogo.jsx");
const footerJsx    = read("./LegalLinks.jsx");
const overviewJsx  = read("../dashboard/Overview.jsx");
const overviewCss  = read("../../styles/overview.css");
const layoutJsx    = read("./DashboardLayout.jsx");
const adminJsx     = read("./AdminLayout.jsx");
const navbarJsx    = read("./NavbarLayout.jsx");
const dashboardJsx = read("../../pages/DashboardPage.jsx");
// Wortlaut der Supportaktion — er steht zentral im Logikmodul, nicht in der Sidebar.
const supportRequestMjs = read("../../utils/supportRequest.mjs");

// Deklarationsblock eines Selektors extrahieren (erste Übereinstimmung).
function block(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(esc + "\\s*\\{([^}]*)\\}"));
  return m ? m[1] : null;
}

// Kommentare entfernen — Kommentartexte dürfen historische Klassennamen nennen,
// ohne dass die Regel-Prüfungen darüber stolpern.
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const stripJsxComments = (jsx) =>
  jsx.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const premiumRules   = stripComments(premium);
const dashboardRules = stripComments(dashboard);

// Bereich der Shell-/Sidebar-Regeln in dashboard-premium.css.
const chromeStart = premiumRules.indexOf(".app-shell");
const chromeEnd = premiumRules.indexOf(".ce-mail-dialog");
const chrome = premiumRules.slice(chromeStart, chromeEnd);

// ── Farbmathematik (WCAG 2.1, relative Luminanz) ──
const hex = (h) => {
  const v = h.replace("#", "");
  const full = v.length === 3 ? [...v].map((c) => c + c).join("") : v;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const lum = (c) => {
  const f = c.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/* ── Shell ──────────────────────────────────────────────────────────────── */

test("1 — beide Shell-Renderer nutzen unverändert .app-shell ohne Seiten-Scope", () => {
  for (const [name, jsx] of [["DashboardPage", dashboardJsx], ["DashboardLayout", layoutJsx]]) {
    const src = stripJsxComments(jsx);
    assert.match(src, /className="app-shell"/, `${name}: statisches className="app-shell" erwartet`);
    assert.doesNotMatch(
      src,
      /className=\{`app-shell/,
      `${name}: seitenabhängiger Shell-Scope (Template-Literal) ist nicht zulässig`,
    );
  }
});

test("2 — keine seitenabhängige Hintergrund-/Sidebar-Sondervariante kehrt zurück", () => {
  const forbidden = [
    "dashboard-vapor",
    "dashboard-soft-premium",
    "dashboard-neutral-premium",
    "dashboard-profile-premium",
    "ce-dark",
    "pp-side-glow",
    "pbg-",
  ];
  const sources = [
    ["dashboard-premium.css", premiumRules],
    ["dashboard.css", dashboardRules],
    ["DashboardPage.jsx", stripJsxComments(dashboardJsx)],
    ["DashboardLayout.jsx", stripJsxComments(layoutJsx)],
    ["DashboardSidebar.jsx", stripJsxComments(sidebarJsx)],
  ];
  for (const [file, src] of sources) {
    for (const token of forbidden) {
      assert.ok(!src.includes(token), `${file}: alte Sondervariante "${token}" darf nicht zurückkehren`);
    }
  }
});

test("3 — der Seitenhintergrund liegt genau einmal auf der Shell", () => {
  const shell = block(premium, ".app-shell");
  assert.ok(shell, ".app-shell fehlt in dashboard-premium.css");
  assert.match(shell, /min-height:\s*100dvh/, "Shell muss mindestens die Viewporthöhe füllen");
  // Der gemeinsame Grund (kühle Rampe mit zwei Lichtflächen, Veredelung 2026-10).
  assert.match(shell, /background-image:\s*var\(--ce-app-bg\)/, "der gemeinsame Grund fehlt auf .app-shell");
  // background-color = Endton der Rampe → lange Seiten laufen ohne Kante weiter.
  assert.match(shell, /background-color:\s*var\(--ce-app-bg-bottom\)/,
    "Grundfarbe muss der Endton der Rampe sein, sonst entsteht unter dem Verlauf eine Kante");

  // .main-content darf keine eigene Flächenfarbe tragen (zweite Hintergrundebene).
  const main = block(premium, ".main-content");
  assert.ok(main, ".main-content fehlt");
  assert.doesNotMatch(main, /background(-color|-image)?:/,
    ".main-content darf keine zweite Hintergrundebene einführen");
});

test("4 — Sidebar und Hintergrund sind zentral über Tokens geführt", () => {
  for (const t of [
    "ce-app-bg", "ce-app-bg-mid", "ce-app-bg-bottom", "ce-app-overlay",
    "ce-sidebar-bg", "ce-sidebar-light", "ce-sidebar-edge", "ce-sidebar-shadow",
    "ce-sidebar-border", "ce-sidebar-divider", "ce-sidebar-hover",
    "ce-sidebar-active-bg", "ce-sidebar-active-text",
    "ce-sidebar-text", "ce-sidebar-text-muted", "ce-sidebar-section",
    "ce-sidebar-scroll-thumb", "ce-sidebar-scroll-thumb-hover",
  ]) {
    assert.match(variables, new RegExp(`--${t}:`), `Token --${t} fehlt in variables.css`);
    assert.ok(!premiumRules.includes(`--${t}:`),
      `Token --${t} darf nicht zusätzlich in dashboard-premium.css definiert werden`);
  }

  // Im Sidebar-Block stehen keine Farbliterale.
  const start = premiumRules.indexOf(".sidebar.pp-side");
  const end = premiumRules.indexOf(".ce-mail-dialog");
  assert.ok(start > -1 && end > start, "Sidebar-Block nicht auffindbar");
  const sidebarBlock = premiumRules.slice(start, end);
  const literals = sidebarBlock.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(literals, [],
    `Sidebar-Regeln müssen Farben über Tokens beziehen, gefunden: ${literals.join(", ")}`);
});

test("5 — keine toten Tokens der Chrome-Familie", () => {
  // Tot ist ein Token erst, wenn KEIN Stylesheet ihn liest. Seit dem Redesign
  // 2026-10 ist die App-Fläche flach — die Shell liest nur noch den Kopfton,
  // die Buchungsleiste (calculator.css) weiterhin den Mittelton als Seitenfläche.
  const allSources = readdirSync(new URL("../../styles/", import.meta.url))
    .filter((f) => f.endsWith(".css"))
    .map((f) => read(`../../styles/${f}`))
    .join("\n");
  const defined = [...variables.matchAll(/--(ce-(?:app|sidebar)-[a-z-]+):/g)].map((m) => m[1]);
  assert.ok(defined.length > 0, "keine Chrome-Tokens gefunden");
  for (const t of defined) {
    assert.ok(allSources.includes(`var(--${t})`), `Token --${t} ist definiert, wird aber nirgends genutzt`);
  }
});

/* ── Sidebar ────────────────────────────────────────────────────────────── */

test("6 — es gibt genau eine Sidebar-Komponente auf allen Kundenrouten", () => {
  for (const [name, jsx] of [["DashboardPage", dashboardJsx], ["DashboardLayout", layoutJsx]]) {
    assert.match(jsx, /<DashboardSidebar\b/, `${name}: DashboardSidebar muss gerendert werden`);
    assert.match(jsx, /page=\{/, `${name}: page-Prop fehlt`);
    assert.match(jsx, /navigateTo=\{/, `${name}: navigateTo-Prop fehlt`);
  }
  assert.match(sidebarJsx, /className=\{`sidebar pp-side/, "Sidebar-Wurzelklassen geändert");
});

test("7 — aktiver Menüpunkt bleibt zustandsbasiert und mehrfach codiert", () => {
  // Aktivzustand kommt weiterhin aus dem page-Vergleich, nicht aus der URL —
  // an GENAU EINER Stelle (<NavItem>).
  assert.match(sidebarJsx, /const aktiv = page === item\.id;/, "Aktivmarkierung der Nav-Einträge fehlt");
  assert.match(sidebarJsx, /\$\{aktiv \? " on" : ""\}/, "der aktive Eintrag trägt keine Zustandsklasse");
  assert.match(sidebarJsx, /aria-current=\{aktiv \? "page" : undefined\}/,
    "der aktive Eintrag muss auch angesagt werden, nicht nur gezeichnet");

  const on = block(premium, ".nitem.on");
  assert.ok(on, ".nitem.on fehlt");
  // Nicht allein farbcodiert: Fläche + Akzentkante + Textfarbe + Schriftschnitt.
  assert.match(on, /background:\s*var\(--ce-sidebar-active-bg\)/, "aktive Fläche fehlt");
  assert.match(on, /box-shadow:\s*inset 3px 0 0 var\(--ce-sidebar-active-accent\)/, "blaue Akzentkante links fehlt");
  assert.match(on, /color:\s*var\(--ce-sidebar-active-text\)/, "aktiver Text fehlt");
  assert.match(on, /font-weight:\s*var\(--ce-text-nav-weight-active\)/, "aktiver Schriftschnitt fehlt");
  assert.equal(tok("ce-text-nav-weight-active"), "600", "aktiver Schriftschnitt muss 600 sein");
  // Aktiv und Hover sind verschiedene Flächen.
  assert.notEqual(tok("ce-sidebar-active-bg"), tok("ce-sidebar-hover"),
    "aktive Fläche darf nicht der Hoverfläche entsprechen");
  // Die Akzentkante ist ein Inset-Streifen, kein Schattenaufbau und kein ::before.
  assert.doesNotMatch(on, /box-shadow:[^;]*\d+px\s+\d+px\s+\d+px\s+rgba/, "kein Schatten am aktiven Eintrag");
  assert.ok(!premiumRules.includes(".nitem.on::before"),
    "Aktivkante darf nicht als absolut positioniertes ::before umgesetzt werden");
});

test("8 — der Navigationsbestand bleibt vollständig erhalten", () => {
  for (const id of ["overview", "new", "calculator", "drafts", "shipments", "tracking",
                    "addressbook", "invoices", "profile", "support",
                    "inventory", "products", "stock", "orders", "movements"]) {
    assert.ok(sidebarJsx.includes(`id: "${id}"`), `Navigationseintrag "${id}" fehlt`);
  }
  for (const label of ["Versand", "Lager & Aufträge", "Konto"]) {
    assert.ok(sidebarJsx.includes(`label: "${label}"`), `Navigationsgruppe "${label}" fehlt`);
  }
  for (const weg of ["Verwaltung", "Abrechnung"]) {
    assert.ok(!sidebarJsx.includes(`label: "${weg}"`), `Gruppe "${weg}" darf nicht zurückkehren`);
  }
  assert.match(sidebarJsx, /onClick=\{handleLogout\}/, "Abmelden-Aktion fehlt");
  assert.match(sidebarJsx, /Abmelden/, "Abmelden-Eintrag fehlt");
  assert.match(sidebarJsx, /item=\{OVERVIEW_ITEM\}/, "Übersicht steht nicht mehr als direkter Eintrag");
});

test("9 — die Firmenkarte bleibt entfernt; zwischen Marke und Navigation steht nur der Scrollbereich", () => {
  const jsxNoComments = stripJsxComments(sidebarJsx);
  for (const spur of ["pp-identity", "pp-identity-avatar", "pp-identity-text", "pp-identity-name", "pp-identity-email"]) {
    assert.ok(!jsxNoComments.includes(spur), `Spur der Firmenkarte lebt noch im Markup: ${spur}`);
  }
  assert.ok(!/accountInitials\(user\)/.test(sidebarJsx), "die Initialenquelle wird noch aufgerufen");
  assert.ok(!/from ["']\.\.\/\.\.\/utils\/accountIdentity\.mjs["']/.test(sidebarJsx),
    "der Import der Identitätsquelle lebt noch, obwohl nichts ihn mehr braucht");
  const logoEndeBisNav = stripJsxComments(sidebarJsx.slice(
    sidebarJsx.indexOf("</button>", sidebarJsx.indexOf("pp-close")),
    sidebarJsx.indexOf('<nav className="pp-nav"'),
  ));
  const oeffnendeTags = logoEndeBisNav.match(/<[a-zA-Z]/g) || [];
  assert.equal(oeffnendeTags.length, 1,
    "zwischen Logo und Navigation steht mehr als der Scrollbereich — kein Platzhalter erlaubt");
  assert.match(logoEndeBisNav, /<div className="pp-side-scroll">/,
    "das Element zwischen Logo und Navigation ist nicht der Scrollbereich");
  assert.equal(block(premium, ".pp-identity"), null, "die CSS-Regel der Firmenkarte lebt noch");
});

test("10 — die Navigation ist reiner Text: keine Symbole, keine Iconleiste", () => {
  const code = stripJsxComments(sidebarJsx);
  assert.doesNotMatch(code, /<Icon\b/, "die Sidebar rendert wieder ein Symbol");
  assert.doesNotMatch(code, /from ["']\.\.\/ui\/Icon["']/, "Icon-Import in der Sidebar ist überflüssig");
  assert.doesNotMatch(code, /icon:\s*"/, "die Navigationskonfiguration trägt wieder Iconnamen");
  assert.doesNotMatch(code, /lucide-react/, "lucide-react ist im Projekt nicht zulässig");
  // Die Klappmarke der Gruppen ist eine reine CSS-Form ohne Glyphe.
  assert.match(code, /<span className="pp-nav-group-chevron" aria-hidden="true" \/>/,
    "die Klappmarke muss ein leeres, aria-hidden Element sein");
  const chev = block(premium, ".pp-nav-group-chevron");
  assert.ok(chev, ".pp-nav-group-chevron fehlt");
  assert.match(chev, /border-right:/, "die Klappmarke wird per CSS-Kante gezeichnet");
  // Die Klappgruppen bleiben echte Knöpfe mit Zustand.
  assert.match(sidebarJsx, /aria-expanded=\{open\}/, "aria-expanded am Gruppenkopf fehlt");
  assert.match(sidebarJsx, /aria-controls=\{itemsId\}/, "aria-controls am Gruppenkopf fehlt");
});

test("11 — „Support kontaktieren“ ist eine Textaktion und öffnet den Anfragedialog", () => {
  // Wortlaut zentral in utils/supportRequest.mjs.
  assert.match(supportRequestMjs, /action:\s*"Support kontaktieren"/, "Support-Aktion fehlt");
  assert.match(sidebarJsx, /SUPPORT_CARD\.action/, "die Aktion nutzt den zentralen Wortlaut nicht");
  // Derselbe Handler wie zuvor die Karte: der Anfragedialog, kein mailto.
  assert.match(sidebarJsx, /className="nitem nitem--utility pp-support-link" onClick=\{\(\) => setSupportOpen\(true\)\}/,
    "„Support kontaktieren“ öffnet den Anfragedialog nicht mehr");
  assert.doesNotMatch(sidebarJsx, /mailto:/, "Support darf nicht ins Postfach führen");
  assert.match(sidebarJsx, /SupportRequestDialog/, "Supportdialog wird nicht gerendert");
  // Die große Supportkarte ist entfallen — Markup UND Stil.
  const code = stripJsxComments(sidebarJsx);
  assert.doesNotMatch(code, /pp-scard|scard-/, "die Supportkarte lebt noch im Markup");
  assert.equal(block(premium, ".pp-scard"), null, "die CSS-Regel der Supportkarte lebt noch");
  assert.doesNotMatch(code, /Live Support|ce-live/, "„Live Support“/Statuspunkt sind zurück");

  // Der Statuspunkt bleibt als Klasse flach und ohne Animation erhalten.
  const live = block(premium, ".ce-live");
  assert.ok(live, ".ce-live fehlt");
  assert.doesNotMatch(live, /animation/, "Statuspunkt darf nicht pulsieren");
  assert.match(live, /box-shadow:\s*none/, "Statuspunkt darf keinen Glow tragen");
});

test("11b — sekundäre Aktionen stehen getrennt unter der Navigation", () => {
  const code = stripJsxComments(sidebarJsx);
  const actionsStart = code.indexOf('className="pp-side-actions"');
  assert.ok(actionsStart > code.indexOf("</nav>"), "die sekundären Aktionen stehen nicht unter der Navigation");
  const actions = code.slice(actionsStart, code.indexOf('className="pp-foot"'));
  // Reihenfolge: App installieren (bedingt) → Support kontaktieren → Abmelden.
  const pwa = actions.indexOf("pwa.showNavItem");
  const support = actions.indexOf("SUPPORT_CARD.action");
  const logout = actions.indexOf("Abmelden");
  assert.ok(pwa > -1 && support > pwa && logout > support,
    "Reihenfolge App installieren → Support kontaktieren → Abmelden verletzt");
  const b = block(premium, ".pp-side-actions");
  assert.ok(b, ".pp-side-actions fehlt");
  assert.match(b, /border-top:\s*1px solid var\(--ce-sidebar-divider\)/,
    "die eine Trennlinie vor den sekundären Aktionen fehlt");
});

test("12 — Sidebar-Fußzeile bleibt vorhanden", () => {
  assert.match(sidebarJsx, /className="pp-foot"/, "Sidebar-Fußzeile fehlt");
  const foot = block(premium, ".pp-foot");
  assert.ok(foot, ".pp-foot fehlt");
  assert.match(foot, /color:\s*var\(--ce-sidebar-section\)/, "Fußzeile muss den Token-Farbwert nutzen");
});

/* ── Mobile / kurze Viewports ───────────────────────────────────────────── */

test("13 — mobile Sidebar öffnet und schließt weiterhin — per Textknopf „Menü“", () => {
  assert.match(dashboardJsx, /setSidebarOpen\(true\)/, "Öffnen über die Topbar fehlt");
  assert.match(layoutJsx, /setSidebarOpen\(true\)/, "Öffnen über die Topbar fehlt (Preisrechner)");
  for (const [name, jsx] of [["DashboardPage", dashboardJsx], ["DashboardLayout", layoutJsx]]) {
    assert.match(stripJsxComments(jsx), /className="hamburger-btn"[\s\S]{0,200}?\}>\s*Menü\s*</,
      `${name}: die Topbar öffnet die Navigation über den Textknopf „Menü“`);
  }
  assert.match(sidebarJsx, /sidebarOpen \? "sidebar-open" : ""/, "Drawer-Zustandsklasse fehlt");
  assert.match(sidebarJsx, /onClick=\{\(\) => setSidebarOpen\(false\)\}/, "Schließen fehlt");
  assert.match(stripJsxComments(sidebarJsx), /pp-close"[\s\S]{0,200}?\}>\s*Schließen\s*</,
    "Schließen des Drawers ist ein Textknopf");
  assert.match(sidebarJsx, /className="sidebar-overlay open"/, "Drawer-Overlay fehlt");

  // Overlay-Farbe ist auf den eingeloggten Bereich gescoped.
  assert.match(premiumRules, /\.app-shell \.sidebar-overlay\s*\{/,
    "Overlay-Farbe muss auf .app-shell gescoped sein");
  assert.match(navbarJsx, /className="sidebar-overlay open"/,
    "öffentlicher Drawer nutzt weiterhin .sidebar-overlay — Scope ist zwingend");
  // Drawerbreite: höchstens 320 px und höchstens calc(100vw - 32px).
  assert.match(premiumRules, /\.sidebar\s*\{[^}]*width:\s*min\(320px,\s*calc\(100vw - 32px\)\)/,
    "mobile Drawerbreite (min(320px, 100vw − 32px)) fehlt");
});

test("14 — die Marke steht fest, alles darunter liegt in EINEM Scrollbereich", () => {
  const inner = block(premium, ".pp-side-in");
  const scroll = block(premium, ".pp-side-scroll");
  const nav = block(premium, ".pp-nav");
  const logo = block(premium, ".pp-logo");
  assert.ok(inner && scroll && nav && logo, "eine der Sidebar-Regeln fehlt");

  assert.doesNotMatch(inner, /overflow-y:\s*auto/, ".pp-side-in darf nicht selbst scrollen");
  assert.match(scroll, /overflow-y:\s*auto/, "der Scrollbereich scrollt nicht");
  assert.match(scroll, /min-height:\s*0/, "ohne min-height:0 scrollt der Bereich nicht, er wächst");
  assert.doesNotMatch(nav, /overflow-y:\s*auto/, "kein doppelter Scrollbereich in der Navigation");
  assert.match(nav, /flex:\s*1 0 auto/, "Navigation darf nie unter ihre Inhaltshöhe schrumpfen");
  assert.match(logo, /flex:\s*0 0 auto/, "die Marke darf als fester Kopf weder wachsen noch schrumpfen");

  // Navigation, sekundäre Aktionen UND Fußzeile liegen INNERHALB des Scrollbereichs.
  const jsx = stripJsxComments(sidebarJsx);
  const start = jsx.indexOf('<div className="pp-side-scroll">');
  assert.ok(start > 0, "der Scrollbereich fehlt im Markup");
  const bereich = jsx.slice(start);
  for (const [marke, was] of [['className="pp-nav"', "Navigation"], ['className="pp-side-actions"', "sekundäre Aktionen"], ['className="pp-foot"', "Fußzeile"]]) {
    assert.ok(bereich.includes(marke), `${was} liegt nicht im Scrollbereich`);
  }
  assert.match(scroll, /overflow-x:\s*hidden/, "der Scrollbereich darf keinen Querbalken bekommen");
  assert.match(scroll, /scrollbar-width:\s*thin/, "die Scrollleiste ist nicht schmal gestellt");
  assert.match(scroll, /scrollbar-color:\s*var\(--ce-sidebar-scroll-thumb\)/, "die Leiste nutzt den Sidebar-Token nicht");
});

/* ── Effekte / Performance ──────────────────────────────────────────────── */

test("15 — keine Dauereffekte im Chrome des eingeloggten Bereichs", () => {
  for (const [pattern, why] of [
    [/animation/, "keine Sidebar-/Hintergrundanimation"],
    [/@keyframes/, "keine Keyframes"],
    [/backdrop-filter/, "kein backdrop-filter"],
    [/\bfilter:\s*blur/, "kein Blur"],
    [/will-change/, "kein dauerhaftes will-change"],
  ]) {
    assert.doesNotMatch(chrome, pattern, why);
  }
  // Übergänge nur auf Farben — kein transform/filter/Schattenaufbau.
  const nitem = block(premium, ".pp-nav-group-head");
  assert.ok(nitem, "Regel der Navigationseinträge fehlt");
  const transition = nitem.match(/transition:([^;]*);/s)?.[1] ?? "";
  for (const prop of ["transform", "filter", "box-shadow", "blur"]) {
    assert.ok(!transition.includes(prop), `Navigationseinträge dürfen ${prop} nicht animieren`);
  }
});

test("16 — alle interaktiven Sidebarbereiche haben einen sichtbaren Fokuszustand", () => {
  assert.match(premiumRules, /\.pp-side :focus-visible\s*\{[^}]*outline:/,
    "Sammelregel für Fokusringe in der Sidebar fehlt");
  assert.match(premiumRules, /\.mobile-topbar \.hamburger-btn:focus-visible\s*\{[^}]*outline:/,
    "Fokuszustand der mobilen Menüschaltfläche fehlt");
  for (const m of chrome.matchAll(/outline:\s*none/g)) {
    const tail = chrome.slice(m.index, m.index + 200);
    assert.match(tail, /box-shadow:|outline:/, "outline: none ohne gleichwertigen Ersatz");
  }
});

/* ── Abgrenzung zu Admin- und Auth-Bereich ──────────────────────────────── */

test("17 — Admin- und Auth-Bereich bleiben vom Chrome unberührt", () => {
  assert.match(adminJsx, /className="adm-shell"/, "Adminbereich muss seine eigene Shell behalten");
  assert.ok(!adminJsx.includes("app-shell") || adminJsx.includes("adm-shell"),
    "Adminbereich darf die Kunden-Shell nicht verwenden");
  // Der Auth-Bereich liest keine Chrome-Tokens — er bleibt unverändert.
  assert.ok(!authCss.includes("var(--ce-sidebar-"), "auth.css darf keine ce-sidebar-*-Tokens verwenden");
  assert.ok(!authCss.includes("var(--ce-app-"), "auth.css darf keine ce-app-*-Tokens verwenden");
  // Die Adminshell trägt keine eigene Literal-Flächenfarbe.
  const admShell = stripComments(adminCss.slice(adminCss.indexOf(".adm-shell {"), adminCss.indexOf(".adm-side {")));
  assert.doesNotMatch(admShell, /background(-color)?:\s*(#|rgb)/, ".adm-shell trägt eine eigene Flächenfarbe");
  // Auth-Tokens bleiben ihrerseits aus dem Chrome heraus.
  assert.ok(!chrome.includes("var(--auth-"), "Chrome darf keine --auth-*-Tokens verwenden");
});

/* ── Accessibility: gemessene Kontraste ─────────────────────────────────── */

test("18 — Kontraste der Navy-Sidebar erfüllen WCAG AA", () => {
  const hexW = (h) => {
    const v = h.replace("#", "");
    const full = v.length === 3 ? [...v].map((c) => c + c).join("") : v;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  const rgba = (s) => {
    const p = s.match(/rgba?\(([^)]+)\)/)[1].split(",").map((x) => parseFloat(x.trim()));
    return { c: [p[0], p[1], p[2]], a: p[3] ?? 1 };
  };
  // Halbtransparente Flächen liegen auf dem Verlauf → vorher mischen.
  const over = (fg, bg) => fg.c.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
  const lumW = (c) => {
    const f = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ratioW = (a, b) => {
    const [hi, lo] = [lumW(a), lumW(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const bgTop = hexW(tok("ce-sidebar-bg-top"));
  const bgMid = hexW(tok("ce-sidebar-bg-mid"));
  const bgBot = hexW(tok("ce-sidebar-bg-bottom"));
  // Hellster Punkt der Fläche: die Lichtfläche hinter der Marke über dem
  // Kopfton (Feinkorrektur 2026-10) — dort stehen Unterzeile und Übersicht.
  const bgLicht = over(rgba(tok("ce-sidebar-light")), bgTop);
  // Aktiver Eintrag: blau getönter Verlauf. Der DUNKELSTE Punkt ist maßgeblich.
  const activeStops = tok("ce-sidebar-active-bg").match(/rgba?\([^)]+\)/g).map((x) => over(rgba(x), bgTop));
  const activeDark = activeStops.reduce((a, b) => (lumW(a) < lumW(b) ? a : b));
  const hover = over(rgba(tok("ce-sidebar-hover")), bgMid);

  // Text: AA = 4.5:1. Nicht-Text (Kante, Fokusring): AA = 3:1.
  const cases = [
    ["Navigationstext auf hellstem Verlaufspunkt", hexW(tok("ce-sidebar-text")), bgTop, 4.5],
    ["Navigationstext auf der Lichtfläche", hexW(tok("ce-sidebar-text")), bgLicht, 4.5],
    ["Unterzeile der Marke auf der Lichtfläche", hexW(tok("ce-sidebar-text-muted")), bgLicht, 4.5],
    ["Navigationstext auf Verlaufsmitte", hexW(tok("ce-sidebar-text")), bgMid, 4.5],
    ["Navigationstext auf Hoverfläche", hexW(tok("ce-sidebar-text-strong")), hover, 4.5],
    ["aktiver Eintrag (dunkelster Verlaufspunkt)", hexW(tok("ce-sidebar-active-text")), activeDark, 4.5],
    ["sekundäre Aktionen", hexW(tok("ce-sidebar-text-muted")), bgBot, 4.5],
    ["Fußzeile", hexW(tok("ce-sidebar-section")), bgBot, 4.5],
    ["Klappmarke", hexW(tok("ce-sidebar-section")), bgTop, 3],
    ["Aktivkante", hexW(tok("ce-sidebar-active-accent")), activeDark, 3],
    ["Fokusring", hexW(tok("ce-sidebar-active-icon")), bgMid, 3],
  ];
  for (const [label, fg, back, min] of cases) {
    const r = ratioW(fg, back);
    assert.ok(r >= min, `${label}: Kontrast ${r.toFixed(2)}:1 unterschreitet ${min}:1`);
  }
});

test("19 — Inhaltstexte bleiben auf dem Canvas lesbar, Karten heben sich ab", () => {
  const canvas = hex(tok("ce-color-bg-canvas-top"));
  assert.ok(ratio(hex(tok("text-primary")), canvas) >= 4.5, "Primärtext unter AA");
  assert.ok(ratio(hex(tok("text-secondary")), canvas) >= 4.5, "Sekundärtext unter AA");
  assert.ok(ratio(hex(tok("ce-color-text-muted")), canvas) >= 4.5, "gedämpfter Text unter AA");
  // Weiße Karten müssen sich vom Grund abheben — der Canvas darf nicht Weiß sein.
  const white = [255, 255, 255];
  const delta = Math.max(...white.map((w, i) => w - canvas[i]));
  assert.ok(delta >= 4, `Canvas liegt zu nah an Kartenweiß (max. Kanaldifferenz ${delta})`);
});

test("20 — Sidebar und Hauptfläche bilden einen deutlichen Helligkeitskontrast", () => {
  // Der Kontrast Deep-Navy-Sidebar ↔ Ivory-Hauptfläche ist die tragende Idee
  // der ConfidaraExpress-Shell. Fällt er unter ~12:1, verwässert die Trennung.
  const r = ratio(hex(tok("ce-sidebar-bg-mid")), hex(tok("ce-app-bg-mid")));
  assert.ok(r >= 12, `Sidebar↔Hauptfläche nur ${r.toFixed(1)}:1 — zu schwach für die Trennung`);
  // Dunkel, aber nicht schwarz: der Blaukanal liegt deutlich über dem Rotkanal.
  for (const stop of ["ce-sidebar-bg-top", "ce-sidebar-bg-mid", "ce-sidebar-bg-bottom"]) {
    const [r0, , b0] = hex(tok(stop));
    assert.ok(b0 - r0 >= 8, `--${stop} wirkt neutralschwarz statt Navy (B−R = ${b0 - r0})`);
  }
  const sb = block(premium, ".sidebar.pp-side");
  assert.ok(sb, ".sidebar.pp-side fehlt");
  assert.match(sb, /background:\s*var\(--ce-sidebar-bg\)/, "die Sidebarfläche läuft nicht über das Token");
  assert.match(sb, /border-right:\s*1px solid var\(--ce-app-divider\)/, "die feine Trennkante fehlt");
  // Feinkorrektur 2026-10: helle Innenkante und der weiche, statische
  // Kantenschatten der ursprünglichen Shell — keine Leuchtaura.
  assert.match(sb, /box-shadow:\s*inset -1px 0 0 var\(--ce-sidebar-edge\), var\(--ce-sidebar-shadow\)/,
    "Innenkante und Kantenschatten der Sidebar fehlen");
  // Zielmaß des Redesigns: 248 px.
  assert.equal(tok("ce-size-sidebar"), "248px", "Sidebarbreite 248 px erwartet");
});

/* ── Fachliche Komponenten ──────────────────────────────────────────────── */

test("21 — das Chrome greift nicht in fachliche Komponenten ein", () => {
  for (const sel of [
    ".table-card", ".field-", ".btn", ".offer-", ".calc-", ".ins-",
    ".kpi-", ".inv-", ".abk-", ".dft-", ".profile-", ".pp-kpi", ".ov-",
  ]) {
    assert.ok(!chrome.includes(sel), `Chrome darf ${sel} nicht anfassen`);
  }
});

/* ── Footer der App-Shell ───────────────────────────────────────────────── */

test("22 — die werbliche Selbstbeschreibung im Footer ist restlos entfernt", () => {
  const sources = [
    ["Overview.jsx", overviewJsx], ["DashboardPage.jsx", dashboardJsx],
    ["LegalLinks.jsx", footerJsx], ["overview.css", overviewCss],
  ];
  for (const [file, src] of sources) {
    assert.ok(!src.includes("pp-pagefoot"), `${file}: .pp-pagefoot ist entfallen`);
    for (const word of ["luxuriös", "Premium-Übersicht"]) {
      assert.ok(!src.includes(word), `${file}: werbliche Formulierung "${word}" gehört nicht in den Footer`);
    }
  }
});

test("23 — der Footer trägt Copyright und alle vier Rechtlinks", () => {
  assert.match(footerJsx, /<footer className="app-footer">/, "Footer-Element fehlt");
  assert.match(footerJsx, /app-footer-copy/, "Copyright-Bereich fehlt");
  assert.match(footerJsx, /©\s*2026 ConfidaraExpress/, "Copyright-Text fehlt");
  const routes = [["Impressum", "/impressum"], ["Datenschutz", "/datenschutz"],
                  ["AGB", "/agb"], ["Widerruf", "/widerruf"]];
  const app = read("../../App.jsx");
  for (const [label, to] of routes) {
    assert.ok(footerJsx.includes(`to="${to}"`), `Footer-Link ${to} fehlt`);
    assert.ok(footerJsx.includes(`>${label}<`), `Footer-Label ${label} fehlt`);
    assert.ok(app.includes(`path="${to}"`), `Route ${to} existiert nicht in App.jsx — kein erfundenes Ziel erlaubt`);
  }
  assert.ok(!/target="_blank"(?![\s\S]{0,80}rel="noopener noreferrer")/.test(footerJsx),
    "target=_blank braucht rel=noopener noreferrer");
});

test("24 — es gibt genau einen Footer im eingeloggten Bereich", () => {
  for (const [name, jsx] of [["DashboardPage", dashboardJsx], ["DashboardLayout", layoutJsx]]) {
    assert.match(jsx, /<LegalLinks \/>/, `${name}: zentraler Footer fehlt`);
  }
  assert.ok(!/page !== "overview" && <LegalLinks/.test(stripJsxComments(dashboardJsx)),
    "die Übersicht darf nicht vom gemeinsamen Footer ausgenommen sein");
  assert.match(navbarJsx, /<Footer \/>/, "öffentlicher Footer (NavbarLayout) wurde angetastet");
  assert.ok(!footerJsx.includes("app-shell"), "der Shell-Footer darf die Shell nicht selbst scopen");
});

test("25 — Footer: Desktop nebeneinander, mobil untereinander, sichtbarer Fokus, gleiche Kante", () => {
  const f = block(premium, ".app-footer");
  assert.ok(f, ".app-footer fehlt");
  assert.match(f, /justify-content:\s*space-between/, "Copyright links / Links rechts erwartet");
  assert.match(f, /align-items:\s*baseline/, "gemeinsame Grundlinie erwartet");
  assert.match(f, /margin-top:\s*auto/, "Footer muss auf kurzen Seiten nach unten rutschen");
  // Derselbe Inhaltsrahmen wie .page-body: 1200 px Inhalt + Seitenrand.
  assert.match(f, /max-width:\s*calc\(var\(--ce-size-content\) \+ 2 \* var\(--shell-gutter\)\)/,
    "gleicher Inhaltsrahmen wie .page-body erwartet");
  assert.match(f, /padding:[^;]*var\(--shell-gutter\)/, "gleicher Seitenrand wie .page-body erwartet");

  const mobile = premiumRules.match(/@media \(max-width: 620px\) \{([\s\S]*?)\n\}/);
  assert.ok(mobile, "mobiler Footer-Breakpoint fehlt");
  assert.match(mobile[1], /\.app-footer\s*\{[^}]*flex-direction:\s*column/,
    "mobil müssen Copyright und Links untereinander stehen");
  assert.match(mobile[1], /\.app-footer-legal a\s*\{[^}]*padding/,
    "mobil brauchen die Links eine größere Trefferfläche");

  assert.match(premiumRules, /\.app-footer-legal a:hover\s*\{[^}]*text-decoration:\s*underline/,
    "Hover darf nicht allein farblich codiert sein");
  assert.match(premiumRules, /\.app-footer-legal a:focus-visible\s*\{[^}]*outline:/,
    "Fokuszustand der Footer-Links fehlt");
});

test("26 — die Hauptfläche trägt den Footer, ohne schmale Viewports zu sprengen", () => {
  const main = block(premium, ".main-content");
  assert.match(main, /flex-direction:\s*column/, "Flex-Spalte nötig, damit margin-top:auto greift");
  assert.match(main, /min-height:\s*100dvh/, "Hauptfläche muss mindestens den Viewport füllen");
  assert.match(premiumRules, /\.main-content > \*\s*\{[^}]*min-width:\s*0/,
    "min-width-Reset für Flex-Kinder fehlt");
  assert.match(premiumRules, /\.main-content > \*\s*\{[^}]*width:\s*100%/,
    "width:100% fehlt — Kinder mit auto-Margins verlieren sonst die Vollbreite");
});

/* ── Seitenrand und Canvas ──────────────────────────────────────────────── */

test("27 — die Rampe ist kühl, hell und läuft gleichmäßig nach unten", () => {
  const [top, mid, bot] = ["ce-color-bg-canvas-top", "ce-color-bg-canvas-mid", "ce-color-bg-canvas-bottom"]
    .map((t) => hex(tok(t)));
  // Monoton fallende Helligkeit — kein Auf und Ab im Verlauf.
  const bright = (c) => (c[0] + c[1] + c[2]) / 3;
  assert.ok(bright(top) > bright(mid) && bright(mid) > bright(bot),
    "die Rampe muss von oben nach unten gleichmäßig dunkler werden");
  // Kühl (Veredelung 2026-10): an jedem Stopp liegt Blau mindestens auf Rot.
  for (const [name, c] of [["Kopf", top], ["Mitte", mid], ["Ende", bot]]) {
    assert.ok(c[2] >= c[0], `${name} der Rampe ist warm (Rot ${c[0]} > Blau ${c[2]})`);
  }
  // Hell: der Kopf liegt nah am Kartenweiß (Abstand dazu prüft Test 19).
  assert.ok(bright(top) >= 245, "der Kopf der Rampe ist zu dunkel");
  // Lange Seiten dehnen den Verlauf nicht: die Stopps stehen in Pixeln.
  assert.match(variables, /--ce-color-bg-atmosphere:[^;]*var\(--ce-color-bg-canvas-bottom\) 1400px\)/,
    "der Endton der Rampe steht nicht bei 1400 px");
});

test("28 — zwei Lichtflächen in Markentönen: sichtbar, ruhig und AA-sicher", () => {
  // Veredelung 2026-10: oben links Markenindigo, oben rechts Markenviolett —
  // keine neuen Töne, keine Form, kein Blur.
  const licht = (name) => tok(name)?.match(/^rgba\(([^)]+)\)$/)?.[1].split(",").map(Number);
  const indigo = licht("ce-color-bg-light-brand");
  const violett = licht("ce-color-bg-light-violet");
  assert.ok(indigo && violett, "die Lichtflächen müssen rgba-Farben sein");
  assert.deepEqual(indigo.slice(0, 3), hex(tok("ce-color-brand")), "die erste Lichtfläche trägt nicht das Markenindigo");
  assert.deepEqual(violett.slice(0, 3), hex(tok("ce-color-brand-violet")), "die zweite Lichtfläche trägt nicht das Markenviolett");
  // Sichtbar, aber ruhig — und so bemessen, dass Sekundärtext selbst im
  // Zentrum einer Lichtfläche auf dem Rampenkopf WCAG AA hält.
  const kopf = hex(tok("ce-color-bg-canvas-top"));
  for (const [name, l] of [["Indigo", indigo], ["Violett", violett]]) {
    assert.ok(l[3] >= 0.05 && l[3] <= 0.1, `${name}: Deckkraft ${l[3]} außerhalb 0.05–0.10`);
    const misch = kopf.map((v, i) => l[i] * l[3] + v * (1 - l[3]));
    const r = ratio(hex(tok("ce-color-text-secondary")), misch);
    assert.ok(r >= 4.5, `${name}: Sekundärtext im Lichtzentrum nur ${r.toFixed(2)}:1`);
  }
  // Genau zwei Lichtflächen über genau einer Rampe — Atmosphäre, kein Muster.
  const atmo = variables.match(/--ce-color-bg-atmosphere:([^;]+);/)?.[1] ?? "";
  assert.equal((atmo.match(/radial-gradient\(/g) || []).length, 2, "genau zwei Lichtflächen erwartet");
  assert.equal((atmo.match(/linear-gradient\(/g) || []).length, 1, "genau eine Rampe erwartet");
  assert.ok(!/url\(|repeating-|conic-gradient/.test(atmo), "Muster, Bild oder Form im Grund");
  // Shell, Adminbereich und öffentliche Seiten lesen DENSELBEN Grund.
  assert.match(variables, /--ce-app-bg:\s*var\(--ce-color-bg-atmosphere\)/, "--ce-app-bg zeigt nicht auf die Atmosphäre");
  assert.match(adminCss, /\.adm-shell \{[^}]*background-image:\s*var\(--ce-app-bg\)/, "der Adminbereich liest den gemeinsamen Grund nicht");
  assert.match(read("../../styles/layout.css"), /\.page-with-navbar \{[^}]*background-image:\s*var\(--ce-color-bg-atmosphere\)/,
    "die öffentlichen Seiten lesen den gemeinsamen Grund nicht");
});

test("29 — Seitenrand 32 / 24 / 16 px aus EINER Quelle", () => {
  assert.equal(tok("ce-page-gutter"), "32px");
  assert.equal(tok("ce-page-gutter-tablet"), "24px");
  assert.equal(tok("ce-page-gutter-mobile"), "16px");
  assert.match(block(premium, ".app-shell"), /--shell-gutter:\s*var\(--ce-page-gutter\)/,
    "die Shell setzt den Seitenrand nicht aus dem Token");
  assert.match(premiumRules, /@media \(max-width: 1199px\) \{\s*\.app-shell \{ --shell-gutter: var\(--ce-page-gutter-tablet\); \}/,
    "Tabletstufe des Seitenrands fehlt");
  assert.match(premiumRules, /@media \(max-width: 860px\) \{\s*\.app-shell \{ --shell-gutter: var\(--ce-page-gutter-mobile\); \}/,
    "Mobilstufe des Seitenrands fehlt");
  // Inhaltsrahmen und Seitenkopf lesen denselben Wert.
  assert.match(dashboardRules, /\.page-body\s*\{[^}]*var\(--shell-gutter/, ".page-body liest den Seitenrand nicht");
});

test("30 — Navigationstypografie: 15/22, Hauptpunkte 600, Unterpunkte 500 — Gruppenkopf gleichrangig", () => {
  // Feinkorrektur 2026-10: die Kunden-Sidebar trägt eine eigene, präsentere
  // Stufe — die allgemeine Navigationsrolle (Adminbereich) bleibt 14/20, 500.
  assert.equal(tok("ce-sidebar-nav-size"), "15px");
  assert.equal(tok("ce-sidebar-nav-weight"), "600");
  assert.equal(tok("ce-sidebar-nav-weight-sub"), "500");
  assert.equal(tok("ce-sidebar-nav-row"), "44px");
  assert.equal(tok("ce-text-nav-size"), "14px");
  assert.equal(tok("ce-text-nav-weight"), "500");
  // Gruppenkopf und Eintrag der ersten Ebene teilen sich EINE Regel.
  assert.match(premiumRules, /\.nitem,\s*\.pp-nav-group-head\s*\{/,
    "Gruppenkopf und Eintrag der ersten Ebene teilen sich keine gemeinsame Regel mehr");
  const head = block(premium, ".pp-nav-group-head");
  assert.match(head, /font-size:\s*var\(--ce-sidebar-nav-size\)/, "Navigationsgröße nicht aus dem Sidebar-Token");
  assert.match(head, /min-height:\s*var\(--ce-sidebar-nav-row\)/, "Zeilenhöhe 44 px erwartet");
  assert.match(head, /border-radius:\s*var\(--ce-radius-sm\)/, "Radius 8 px erwartet");
  assert.ok(!/text-transform:\s*uppercase/.test(head), "keine Versalien im Gruppenkopf");
  // Zweite Ebene: dieselbe Schrift, 12 px eingerückt.
  const sub = block(premium, ".pp-nav-group-items .nitem");
  assert.ok(sub, "Regel der zweiten Ebene fehlt");
  assert.match(sub, /padding-inline-start:\s*calc\(var\(--ce-space-3\) \+ 12px\)/, "Einrückung 12 px erwartet");
  // Keine Kleinschrift im Sidebar-Block.
  const start = premiumRules.indexOf(".sidebar.pp-side");
  const sidebar = premiumRules.slice(start, chromeEnd);
  const small = [...sidebar.matchAll(/([.\w-]+)\s*\{[^}]*?font-size:\s*([\d.]+)px/g)]
    .filter((m) => parseFloat(m[2]) < 12)
    .map((m) => `${m[1]} (${m[2]}px)`);
  assert.deepEqual(small, [], `unerwartete Kleinschrift in der Sidebar: ${small.join(", ")}`);
});

/* ── Marke ──────────────────────────────────────────────────────────────── */

test("31 — die generische CubeMark samt Inline-Verlauf bleibt entfernt", () => {
  for (const [file, src] of [["DashboardSidebar.jsx", sidebarJsx], ["dashboard-premium.css", premium]]) {
    for (const token of ["CubeMark", "ppCubeSb", "pp-brandmark-svg"]) {
      assert.ok(!src.includes(token), `${file}: "${token}" darf nicht zurückkehren`);
    }
  }
  assert.ok(!/<linearGradient/.test(sidebarJsx + brandLogoJsx), "Inline-Verlauf in der Marke gefunden");
  assert.ok(!/<svg/.test(sidebarJsx), "die Sidebar zeichnet keine eigene Marke");
});

test("32 — die Sidebar trägt die Originalmarke als Reverse-Asset", () => {
  // Redesign 2026-10: die provisorische Marke ist zurückgenommen — die
  // Sidebar trägt wieder die Originalkomposition (Signet über Schriftzug) in
  // der Reverse-Fassung für die Navy-Fläche.
  // Feinkorrektur 2026-10: darunter die Unterzeile, wörtlich wie freigegeben.
  assert.match(sidebarJsx,
    /<BrandLogo\s+variant="lockup"\s+tone="reverse"\s+sub=\{<span className="pp-brand-sub">B2B Logistik- und Versandplattform<\/span>\}\s*\/>/,
    "die Sidebar fordert nicht die Original-Lockup-Reverse mit Unterzeile an");
  for (const datei of ["signet-standard", "signet-reverse", "wordmark-standard", "wordmark-reverse", "lockup-standard", "lockup-reverse"]) {
    assert.ok(brandLogoJsx.includes(`assets/brand/${datei}.svg`),
      `statischer Import von ${datei}.svg fehlt`);
  }
  assert.match(brandLogoJsx, /<img[\s\S]*?src=\{quelle\}/, "die Marke wird nicht als <img> gerendert");
  assert.ok(!/connect|ConnectMark/.test(brandLogoJsx), "die provisorische Markenvariante lebt noch");
  // Kein Claim aus dem Master und nicht die frühere Unterzeile.
  assert.doesNotMatch(stripJsxComments(sidebarJsx), /B2B Versandplattform\.|IHRE VERSANDVERMITTLUNG/i,
    "unter der Marke steht ein Claim oder die frühere Unterzeile");
  // Die Unterzeile ist klein, ruhig und der Wortmarke untergeordnet: Caption-
  // Stufe (12 px), gedämpfter Sidebarton, einzeilig.
  const unterzeile = block(premium, ".pp-brand-sub");
  assert.ok(unterzeile, ".pp-brand-sub fehlt");
  assert.match(unterzeile, /font-size:\s*var\(--ce-text-caption-size\)/, "die Unterzeile steht nicht in der Caption-Stufe");
  assert.match(unterzeile, /color:\s*var\(--ce-sidebar-text-muted\)/, "die Unterzeile trägt nicht den gedämpften Ton");
  assert.match(unterzeile, /white-space:\s*nowrap/, "die Unterzeile darf nicht umbrechen");
  // Feste Breite in der Sidebar (das Asset trägt keine eigene Größe).
  assert.match(premiumRules, /\.pp-logo \.ce-brandmark-img \{ width: 168px; \}/, "die Markenbreite fehlt");
});

test("33 — die Marke ist korrekt ausgezeichnet und nicht umgefärbt", () => {
  // Bild mit alt-Text; dekorative Aufrufer überschreiben mit alt="".
  assert.match(brandLogoJsx, /alt !== undefined \? alt : "ConfidaraExpress"/,
    "die alt-Regel des Markenbauteils wurde verändert");
  assert.match(brandLogoJsx, /"aria-hidden": "true"/, "dekorative Marken brauchen aria-hidden");
  // Die Reverse-Fassung ist im Asset selbst hell — kein filter, keine Einfärbung.
  assert.ok(!/filter:\s*(?!none)/.test(stripComments(block(premium, ".pp-logo .ce-brandmark-img") ?? "")),
    "die Marke wird per filter umgefärbt");
});

test("34 — kein Wasserzeichen und keine Markendekoration mehr auf Arbeitsflächen", () => {
  for (const [file, src] of [
    ["Overview.jsx", overviewJsx], ["overview.css", overviewCss],
    ["DashboardPage.jsx", dashboardJsx], ["DashboardLayout.jsx", layoutJsx],
    ["DashboardSidebar.jsx", sidebarJsx], ["dashboard-premium.css", premium],
  ]) {
    assert.ok(!src.includes("pp-trust-watermark"), `${file}: das Trust-Wasserzeichen ist entfallen`);
  }
  assert.doesNotMatch(overviewJsx, /signet-standard\.svg/, "die Übersicht importiert kein Markenasset als Dekoration");
});

test("35 — keine neue Hintergrundebene", () => {
  const shell = stripComments(block(premium, ".app-shell"));
  // Genau der gemeinsame Grund — keine Bild-URL, kein Markenasset.
  assert.doesNotMatch(shell, /url\(/, ".app-shell führt eine Bildebene");
  assert.ok(!/mark-|brand\//.test(shell), ".app-shell darf kein Markenasset als Hintergrund führen");
  for (const [sel, css] of [[".main-content", premium], [".ov-kpis", overviewCss]]) {
    const b = stripComments(block(css, sel) ?? "");
    assert.ok(b, `${sel} fehlt`);
    assert.doesNotMatch(b, /background-image:|gradient\(/, `${sel}: keine Verlaufs- oder Bildebene zulässig`);
  }
  for (const [file, css] of [["overview.css", overviewCss], ["dashboard-premium.css", premium]]) {
    assert.ok(!/data:image\/svg/.test(css), `${file}: Data-URI-Kopie eines SVG gefunden`);
  }
});
