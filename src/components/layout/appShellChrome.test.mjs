// Source-Structure-Tests für das Chrome des eingeloggten Bereichs:
// gemeinsame Shell (.app-shell / Porcelain-Hintergrund) und gemeinsame Sidebar
// (.sidebar.pp-side / Executive Graphite).
//
// Rein statische Prüfungen der Quell-Invarianten — kein Rendering, keine neue
// Dependency, bewusst KEINE Assertions auf exakte Pixelwerte oder Farbwerte
// einzelner Deklarationen. Geprüft wird, was leicht versehentlich kaputtgeht:
// dass es genau eine Shell und eine Sidebar gibt, dass keine seitenabhängige
// Sondervariante zurückkehrt, dass Chrome-Farben ausschließlich über Tokens
// laufen, dass keine Dauereffekte entstehen, dass Admin- und Auth-Bereich
// getrennt bleiben — und dass die Sidebar-Kontraste WCAG AA erfüllen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const variables = read("../../styles/variables.css");

// Tokenwert aus variables.css. Seit Paket A / Phase 1 zeigen die Legacy-Tokens
// per var() auf die semantischen Foundation-Tokens (--ce-color-*); ein solcher
// Verweis wird hier aufgelöst, damit die Kontrast- und Rampenprüfungen weiterhin
// mit echten Farbwerten rechnen. Gleiche Auflösung wie in
// overviewKpiCards.test.mjs — die Zusicherungen selbst bleiben unverändert.
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

const primitives   = read("../../styles/primitives.css");
const sidebarJsx   = read("./DashboardSidebar.jsx");
const brandLogoJsx = read("../ui/BrandLogo.jsx");
const footerJsx    = read("./LegalLinks.jsx");
const overviewJsx  = read("../dashboard/Overview.jsx");
const overviewCss  = read("../../styles/overview.css");
const layoutJsx    = read("./DashboardLayout.jsx");
const adminJsx     = read("./AdminLayout.jsx");
const navbarJsx    = read("./NavbarLayout.jsx");
const dashboardJsx = read("../../pages/DashboardPage.jsx");
// Wortlaut der Supportkarte — er steht zentral im Logikmodul, nicht in der Sidebar.
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

/* ── Shell ──────────────────────────────────────────────────────────────── */

test("1 — beide Shell-Renderer nutzen unverändert .app-shell ohne Seiten-Scope", () => {
  for (const [name, jsx] of [["DashboardPage", dashboardJsx], ["DashboardLayout", layoutJsx]]) {
    const src = stripJsxComments(jsx);
    assert.match(src, /className="app-shell"/, `${name}: statisches className="app-shell" erwartet`);
    // Kein Template-Literal auf der Shell → keine seitenabhängige Theme-Klasse.
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
  assert.match(shell, /background-image:/, "Porcelain-Hintergrund fehlt auf .app-shell");
  assert.match(shell, /min-height:\s*100dvh/, "Shell muss mindestens die Viewporthöhe füllen");
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
  // Alle --ce-app-* / --ce-sidebar-* Tokens stammen aus variables.css …
  for (const t of [
    "ce-app-bg-top", "ce-app-bg-mid", "ce-app-bg-bottom", "ce-app-divider", "ce-app-overlay",
    "ce-sidebar-bg-top", "ce-sidebar-bg-mid", "ce-sidebar-bg-bottom",
    "ce-sidebar-surface", "ce-sidebar-surface-hover",
    "ce-sidebar-border", "ce-sidebar-divider",
    "ce-sidebar-well",
    "ce-sidebar-active-bg", "ce-sidebar-active-border", "ce-sidebar-active-shadow",
    "ce-sidebar-text", "ce-sidebar-text-strong", "ce-sidebar-text-muted",
    "ce-sidebar-section", "ce-sidebar-icon",
    "ce-sidebar-active-accent", "ce-sidebar-active-icon",
  ]) {
    assert.match(variables, new RegExp(`--${t}:`), `Token --${t} fehlt in variables.css`);
    assert.ok(!premiumRules.includes(`--${t}:`),
      `Token --${t} darf nicht zusätzlich in dashboard-premium.css definiert werden`);
  }

  // … und im Sidebar-Block stehen keine Farbliterale mehr.
  const start = premiumRules.indexOf(".sidebar.pp-side");
  const end = premiumRules.indexOf(".ce-mail-dialog");
  assert.ok(start > -1 && end > start, "Sidebar-Block nicht auffindbar");
  const sidebarBlock = premiumRules.slice(start, end);
  const literals = sidebarBlock.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(literals, [],
    `Sidebar-Regeln müssen Farben über Tokens beziehen, gefunden: ${literals.join(", ")}`);
});

test("5 — keine toten Tokens der Chrome-Familie", () => {
  const allSources = [variables, premium, dashboard, read("../../styles/overview.css")].join("\n");
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
  }
  // Beide übergeben page + navigateTo, damit die Aktivmarkierung überall greift.
  for (const [name, jsx] of [["DashboardPage", dashboardJsx], ["DashboardLayout", layoutJsx]]) {
    assert.match(jsx, /page=\{/, `${name}: page-Prop fehlt`);
    assert.match(jsx, /navigateTo=\{/, `${name}: navigateTo-Prop fehlt`);
  }
  assert.match(sidebarJsx, /className=\{`sidebar pp-side/, "Sidebar-Wurzelklassen geändert");
});

test("7 — aktiver Menüpunkt bleibt zustandsbasiert und mehrfach codiert", () => {
  const tok0 = tok;
  // Aktivzustand kommt weiterhin aus dem page-Vergleich, nicht aus der URL.
  // Seit der Sidebar-Neustrukturierung gibt es dafür GENAU EINE Stelle: alle
  // Einträge — erste Ebene, Gruppeneinträge, Abmelden — laufen durch dasselbe
  // <NavItem>.
  assert.match(sidebarJsx, /const aktiv = page === item\.id;/, "Aktivmarkierung der Nav-Einträge fehlt");
  assert.match(sidebarJsx, /\$\{aktiv \? " on" : ""\}/, "der aktive Eintrag trägt keine Zustandsklasse");
  assert.match(sidebarJsx, /aria-current=\{aktiv \? "page" : undefined\}/,
    "der aktive Eintrag muss auch angesagt werden, nicht nur gezeichnet");

  const on = block(premium, ".nitem.on");
  assert.ok(on, ".nitem.on fehlt");
  // Nicht allein farbcodiert: Fläche + Border + Akzentkante + Schriftschnitt.
  assert.match(on, /background:\s*var\(--ce-sidebar-active-bg\)/, "aktive Fläche fehlt");
  assert.match(on, /border-color:\s*var\(--ce-sidebar-active-border\)/, "aktive Border fehlt");
  assert.match(on, /font-weight:\s*600/, "aktiver Schriftschnitt fehlt");
  assert.match(on, /box-shadow:\s*var\(--ce-sidebar-active-shadow\)/, "Akzentkante fehlt");
  // Die Kante selbst steckt im Token und bleibt ein linker Inset-Streifen.
  assert.match(variables, /--ce-sidebar-active-shadow:\s*inset\s+3px\s+0\s+0/,
    "linke Akzentkante (inset) fehlt im Token");
  // Der aktive Zustand muss sich klar vom Hover unterscheiden — sonst ist er
  // faktisch unsichtbar (genau das war vor diesem Paket der Fall).
  const activeStops = tok0("ce-sidebar-active-bg").match(/rgba?\([^)]+\)/g) ?? [];
  const coloured = activeStops.some((st) => {
    const [r, g, b] = st.match(/[\d.]+/g).map(Number);
    return Math.max(r, g, b) - Math.min(r, g, b) > 20; // echter Farbstich, nicht nur Weiß/Grau
  });
  assert.ok(coloured,
    "aktive Fläche braucht einen farbigen Stop — eine reine Weiß-Aufhellung ist vom Hover nicht zu unterscheiden");
  // Die Kante ist ein Inset-Schatten, KEIN absolut positioniertes ::before —
  // sonst zerstört sie die Rundung bzw. verschiebt Layout.
  assert.ok(!premiumRules.includes(".nitem.on::before"),
    "Aktivkante darf nicht als absolut positioniertes ::before umgesetzt werden");
});

test("8 — der Navigationsbestand bleibt vollständig erhalten", () => {
  // Jeder page-Wert, den es vor der Neustrukturierung gab, existiert weiter.
  // Umgeordnet wurde die Informationsarchitektur, nicht das Routing.
  for (const id of ["overview", "new", "calculator", "drafts", "shipments", "tracking",
                    "addressbook", "invoices", "profile", "support"]) {
    assert.ok(sidebarJsx.includes(`id: "${id}"`), `Navigationseintrag "${id}" fehlt`);
  }
  // Drei Gruppen — „Verwaltung" (nur Adressbuch) und „Abrechnung" (nur
  // Rechnungen) waren Überschriften über einer einzigen Zeile und sind entfallen.
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

test("9 — die Firmenkarte ist restlos entfernt und hinterlässt keinen Ersatzblock", () => {
  // Weder Markup noch Klassen noch die Datenquelle, die sie füllte.
  const jsxNoComments = stripJsxComments(sidebarJsx);
  for (const spur of ["pp-identity", "pp-identity-avatar", "pp-identity-text", "pp-identity-name", "pp-identity-email"]) {
    assert.ok(!jsxNoComments.includes(spur), `Spur der Firmenkarte lebt noch im Markup: ${spur}`);
  }
  assert.ok(!/accountInitials\(user\)/.test(sidebarJsx), "die Initialenquelle wird noch aufgerufen");
  assert.ok(!/accountDisplayName\(user\)/.test(sidebarJsx), "die Namensquelle wird noch aufgerufen");
  assert.ok(!/from ["']\.\.\/\.\.\/utils\/accountIdentity\.mjs["']/.test(sidebarJsx),
    "der Import der Identitätsquelle lebt noch, obwohl nichts ihn mehr braucht");
  // Kein Ersatzblock zwischen Marke und Navigation. Erlaubt ist dort GENAU EIN
  // Element: der Scrollbereich .pp-side-scroll — ein reiner Layoutbehälter ohne
  // eigenen Inhalt. Alles andere wäre der Platzhalter, den es nicht geben darf.
  const logoEndeBisNav = stripJsxComments(sidebarJsx.slice(
    sidebarJsx.indexOf("</button>", sidebarJsx.indexOf("pp-close")),
    sidebarJsx.indexOf('<nav className="pp-nav">'),
  ));
  const oeffnendeTags = logoEndeBisNav.match(/<[a-zA-Z]/g) || [];
  assert.equal(oeffnendeTags.length, 1,
    "zwischen Logo und Navigation steht mehr als der Scrollbereich — kein Platzhalter erlaubt");
  assert.match(logoEndeBisNav, /<div className="pp-side-scroll">/,
    "das Element zwischen Logo und Navigation ist nicht der Scrollbereich");
  // Und kein Text: der Behälter ist reines Layout. (Die schließenden Tags der
  // Logozeile liegen zwangsläufig mit im Ausschnitt und zählen nicht als Inhalt.)
  assert.doesNotMatch(logoEndeBisNav.replace(/<[^>]*>/g, ""), /\w/,
    "zwischen Logo und Navigation steht Text — kein Ersatzblock erlaubt");

  // Und die zugehörige Fläche ist ebenfalls weg, nicht nur unbenutzt.
  assert.equal(block(premium, ".pp-identity"), null, "die CSS-Regel der Firmenkarte lebt noch");
  for (const t of ["ce-sidebar-card", "ce-sidebar-card-shadow"]) {
    assert.ok(!variables.includes(`--${t}:`), `totes Token --${t} lebt noch in variables.css`);
  }
});

test("10 — die Supportkarte trägt ihr Material jetzt allein", () => {
  // Nach der Entfernung der Firmenkarte ist sie die einzige Karte der Sidebar —
  // ihre eigene Materialsprache bleibt unverändert: vertiefte Eigenfläche,
  // kein Schatten, kein Glassmorphism.
  const scard = block(premium, ".pp-scard");
  assert.ok(scard, "Supportkarte fehlt");
  assert.match(scard, /border:\s*1px solid var\(--ce-sidebar-border\)/, "Supportkarte: Border erwartet");
  assert.match(scard, /border-radius:\s*11px/, "Supportkarte: Rundung erwartet");
  assert.match(scard, /background:\s*var\(--ce-sidebar-well\)/, "Supportkarte: vertiefte Fläche erwartet");
  assert.match(scard, /box-shadow:\s*none/, "Supportkarte darf keinen Schatten tragen");
  assert.doesNotMatch(stripComments(scard), /backdrop-filter/, "Supportkarte: backdrop-filter verboten");
});

test("11 — Supportkarte führt in den Anfragedialog, nicht ins Postfach", () => {
  // Wortlaut zentral in utils/supportRequest.mjs — die Karte darf ihn nicht
  // dupliziert als Literal tragen (sonst laufen Karte und Mailtexte auseinander).
  assert.match(supportRequestMjs, /kicker:\s*"Ihr persönlicher Kontakt"/, "Support-Kicker fehlt");
  assert.match(supportRequestMjs, /title:\s*"Wir helfen Ihnen weiter"/, "Support-Titel fehlt");
  assert.match(supportRequestMjs, /action:\s*"Support kontaktieren"/, "Support-Aktion fehlt");
  assert.match(supportRequestMjs, /hint:\s*"Ihre Anfrage wird zeitnah beantwortet\."/, "Support-Hinweis fehlt");
  assert.match(sidebarJsx, /SUPPORT_CARD\.kicker/, "Karte nutzt den zentralen Kicker nicht");
  assert.match(sidebarJsx, /SUPPORT_CARD\.title/, "Karte nutzt den zentralen Titel nicht");
  assert.match(sidebarJsx, /SUPPORT_CARD\.action/, "Karte nutzt die zentrale Aktion nicht");
  assert.match(sidebarJsx, /SUPPORT_CARD\.hint/, "Karte nutzt den zentralen Hinweis nicht");
  assert.match(sidebarJsx, /scard-ic/, "Iconfläche fehlt");

  // Die GESAMTE Karte ist die Aktion: ein <button>, kein Link und kein mailto.
  assert.match(sidebarJsx, /<button type="button" className="pp-scard" onClick=\{\(\) => setSupportOpen\(true\)\}>/,
    "Supportkarte ist keine Schaltfläche mehr");
  assert.doesNotMatch(sidebarJsx, /mailto:/, "Supportkarte darf nicht mehr ins Postfach führen");
  assert.match(sidebarJsx, /SupportRequestDialog/, "Supportdialog wird nicht gerendert");

  // Bewusst entfernt: „Live Support", grüner Statuspunkt, Headset-Icon. Gegen den
  // kommentarfreien Quelltext geprüft — der Kommentar der Karte benennt genau diese
  // entfernten Elemente und darf den Test nicht auslösen.
  const sidebarCode = stripJsxComments(sidebarJsx);
  assert.doesNotMatch(sidebarCode, /Live Support/, "„Live Support“ wurde nicht entfernt");
  assert.doesNotMatch(sidebarCode, /ce-live/, "Statuspunkt wurde nicht entfernt");
  assert.doesNotMatch(sidebarCode, /n="headset"/, "Headset-Icon wurde nicht entfernt");
  // Nur das bestehende Icon-System — kein lucide-react.
  assert.doesNotMatch(sidebarCode, /lucide-react/, "lucide-react ist im Projekt nicht zulässig");
  assert.match(sidebarCode, /n="mail"/, "das vorhandene mail-Icon fehlt");

  // Der Statuspunkt selbst bleibt als Klasse erhalten (Übersichtsseite) und
  // darf weiterhin nicht pulsieren oder glühen.
  const live = block(premium, ".ce-live");
  assert.ok(live, ".ce-live fehlt");
  assert.doesNotMatch(live, /animation/, "Statuspunkt darf nicht pulsieren");
  assert.match(live, /box-shadow:\s*none/, "Statuspunkt darf keinen Glow tragen");
});

test("11b — Supportkarte behält Geometrie und Materialsprache trotz Button-Auszeichnung", () => {
  const scard = block(premium, ".pp-scard");
  assert.ok(scard, ".pp-scard fehlt");
  // Unveränderte Geometrie/Abstände (Test 10 prüft Border und Rundung).
  assert.match(scard, /padding:\s*12px 12px/, "Innenabstand der Supportkarte geändert");
  assert.match(scard, /margin-top:\s*14px/, "Außenabstand der Supportkarte geändert");
  // Button-Defaults müssen zurückgesetzt sein, sonst bricht die Karte optisch.
  assert.match(scard, /width:\s*100%/, "Button füllt die Spalte nicht");
  assert.match(scard, /text-align:\s*left/, "Button zentriert den Text");
  assert.match(scard, /font:\s*inherit/, "Button erbt die Schrift nicht");
  assert.match(scard, /cursor:\s*pointer/, "Zeigerform fehlt");

  // Die Aktionszeile nutzt Blau als AKZENT (Text/Icon), nie als Fläche.
  const action = block(premium, ".scard-a");
  assert.ok(action, ".scard-a fehlt");
  assert.match(action, /color:\s*var\(--ce-sidebar-active-icon\)/, "Aktionszeile nutzt den Akzenttoken nicht");
  assert.doesNotMatch(action, /background/, "die Aktionszeile darf keine Fläche tragen");
});

test("12 — Sidebar-Fußzeile bleibt vorhanden", () => {
  assert.match(sidebarJsx, /className="pp-foot"/, "Sidebar-Fußzeile fehlt");
  const foot = block(premium, ".pp-foot");
  assert.ok(foot, ".pp-foot fehlt");
  assert.match(foot, /color:\s*var\(--ce-sidebar-section\)/, "Fußzeile muss den Token-Farbwert nutzen");
});

/* ── Mobile / kurze Viewports ───────────────────────────────────────────── */

test("13 — mobile Sidebar öffnet und schließt weiterhin", () => {
  assert.match(dashboardJsx, /setSidebarOpen\(true\)/, "Öffnen über die Topbar fehlt");
  assert.match(layoutJsx, /setSidebarOpen\(true\)/, "Öffnen über die Topbar fehlt (Preisrechner)");
  assert.match(sidebarJsx, /sidebarOpen \? "sidebar-open" : ""/, "Drawer-Zustandsklasse fehlt");
  assert.match(sidebarJsx, /onClick=\{\(\) => setSidebarOpen\(false\)\}/, "Schließen fehlt");
  assert.match(sidebarJsx, /className="sidebar-overlay open"/, "Drawer-Overlay fehlt");

  // Overlay-Farbe ist auf den eingeloggten Bereich gescoped — der öffentliche
  // NavbarLayout-Drawer nutzt dieselbe Klasse und darf sich nicht mitändern.
  assert.match(premiumRules, /\.app-shell \.sidebar-overlay\s*\{/,
    "Overlay-Farbe muss auf .app-shell gescoped sein");
  assert.match(navbarJsx, /className="sidebar-overlay open"/,
    "öffentlicher Drawer nutzt weiterhin .sidebar-overlay — Scope ist zwingend");
});

test("14 — die Marke steht fest, alles darunter liegt in EINEM Scrollbereich", () => {
  // Frühere Fassung: die gesamte Spalte (.pp-side-in) scrollte, Marke inklusive.
  // Das war die Korrektur eines noch älteren Fehlers — damals scrollte nur
  // .pp-nav, während Supportkarte und Fußzeile AUSSERHALB des Scrollbereichs
  // unbeweglich darunter standen und den letzten Eintrag abschnitten.
  // Jetzt: die Marke ist der feste Kopf, und der Scrollbereich umfasst alles
  // andere. Die Lehre von damals bleibt der Kern dieses Tests — nichts darf
  // unterhalb des Scrollbereichs stranden.
  const inner = block(premium, ".pp-side-in");
  const scroll = block(premium, ".pp-side-scroll");
  const nav = block(premium, ".pp-nav");
  const logo = block(premium, ".pp-logo");
  assert.ok(inner && scroll && nav && logo, "eine der Sidebar-Regeln fehlt");

  // Der Rahmen scrollt nicht mehr — sonst entstünden zwei Scrollachsen übereinander.
  assert.doesNotMatch(inner, /overflow-y:\s*auto/, ".pp-side-in darf nicht mehr selbst scrollen");
  assert.match(scroll, /overflow-y:\s*auto/, "der Scrollbereich scrollt nicht");
  // min-height:0 ist tragend: ein Flex-Kind bekommt sonst min-height:auto,
  // wächst über den Container hinaus und die Leiste erschiene nie.
  assert.match(scroll, /min-height:\s*0/, "ohne min-height:0 scrollt der Bereich nicht, er wächst");
  // Genau EIN Scrollbereich in der Spalte.
  assert.doesNotMatch(nav, /overflow-y:\s*auto/, "kein doppelter Scrollbereich in der Navigation");
  assert.match(nav, /flex:\s*1 0 auto/, "Navigation darf nie unter ihre Inhaltshöhe schrumpfen");
  assert.match(logo, /flex:\s*0 0 auto/, "die Marke darf als fester Kopf weder wachsen noch schrumpfen");

  // Und das Entscheidende: Navigation, Supportkarte UND Fußzeile liegen INNERHALB
  // des Scrollbereichs. Läge eines davon darunter, wäre der alte Fehler zurück.
  const jsx = stripJsxComments(sidebarJsx);
  const start = jsx.indexOf('<div className="pp-side-scroll">');
  assert.ok(start > 0, "der Scrollbereich fehlt im Markup");
  const bereich = jsx.slice(start);
  for (const [marke, was] of [['className="pp-nav"', "Navigation"], ['className="pp-scard"', "Supportkarte"], ['className="pp-foot"', "Fußzeile"]]) {
    assert.ok(bereich.includes(marke), `${was} liegt nicht im Scrollbereich`);
  }

  // Kein Querbalken durch den neuen Bereich.
  assert.match(scroll, /overflow-x:\s*hidden/, "der Scrollbereich darf keinen Querbalken bekommen");

  // Die Leiste ist gestaltet und nutzt ausschließlich Tokens — Farbliterale
  // stehen im Chrome nirgends (siehe Test 1).
  assert.match(scroll, /scrollbar-width:\s*thin/, "die Scrollleiste ist nicht schmal gestellt");
  assert.match(scroll, /scrollbar-color:\s*var\(--ce-sidebar-scroll-thumb\)/, "die Leiste nutzt den Sidebar-Token nicht");
});

/* ── Effekte / Performance ──────────────────────────────────────────────── */

test("15 — keine Dauereffekte im Chrome des eingeloggten Bereichs", () => {
  const start = premiumRules.indexOf(".app-shell");
  const end = premiumRules.indexOf(".ce-mail-dialog");
  const chrome = premiumRules.slice(start, end);
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
  const nitem = block(premium, ".nitem");
  assert.ok(nitem, ".nitem fehlt");
  const transition = nitem.match(/transition:([^;]*);/s)?.[1] ?? "";
  for (const prop of ["transform", "filter", "box-shadow", "blur"]) {
    assert.ok(!transition.includes(prop), `.nitem darf ${prop} nicht animieren`);
  }
});

test("16 — alle interaktiven Sidebarbereiche haben einen sichtbaren Fokuszustand", () => {
  assert.match(premiumRules, /\.pp-side :focus-visible\s*\{[^}]*outline:/,
    "Sammelregel für Fokusringe in der Sidebar fehlt");
  assert.match(premiumRules, /\.mobile-topbar \.hamburger-btn:focus-visible\s*\{[^}]*outline:/,
    "Fokuszustand der mobilen Menüschaltfläche fehlt");
  // outline darf nirgends im Chrome ersatzlos entfernt werden.
  const start = premiumRules.indexOf(".app-shell");
  const end = premiumRules.indexOf(".ce-mail-dialog");
  const chrome = premiumRules.slice(start, end);
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
  // Das SIDEBAR-Chrome (Midnight Slate) bleibt dem Kundenportal vorbehalten —
  // die Adminnavigation ist bewusst hell, damit der Bereichswechsel sichtbar
  // bleibt. Der GRUND dagegen ist seit Paket E derselbe (siehe unten): eine
  // gemeinsame Ivory-Rampe statt einer zweiten, eigenen Flächenfarbe.
  for (const [name, css] of [["admin.css", adminCss], ["auth.css", authCss]]) {
    assert.ok(!css.includes("var(--ce-sidebar-"), `${name} darf keine ce-sidebar-*-Tokens verwenden`);
  }
  assert.ok(!authCss.includes("var(--ce-app-"), "auth.css darf keine ce-app-*-Tokens verwenden");
  // Der Adminbereich liest exakt dieselbe Rampe wie .app-shell — kein zweites
  // Grau, kein eigener Hintergrundverlauf.
  const admShell = adminCss.slice(adminCss.indexOf(".adm-shell {"), adminCss.indexOf(".adm-side {"));
  for (const t of ["--ce-app-bg-top", "--ce-app-bg-mid", "--ce-app-bg-bottom"]) {
    assert.ok(admShell.includes(`var(${t})`), `.adm-shell nutzt ${t} nicht`);
  }
  assert.doesNotMatch(admShell, /background(-color)?:\s*(#|rgb)/, ".adm-shell trägt eine eigene Flächenfarbe");
  // Auth-Tokens bleiben ihrerseits aus dem Chrome heraus.
  const start = premiumRules.indexOf(".app-shell");
  const end = premiumRules.indexOf(".ce-mail-dialog");
  assert.ok(!premiumRules.slice(start, end).includes("var(--auth-"),
    "Chrome darf keine --auth-*-Tokens verwenden");
});

/* ── Accessibility: gemessene Kontraste ─────────────────────────────────── */

test("18 — Sidebar-Kontraste erfüllen WCAG AA", () => {
  const hex = (h) => {
    const v = h.replace("#", "");
    const full = v.length === 3 ? [...v].map((c) => c + c).join("") : v;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  const rgba = (s) => {
    const p = s.match(/rgba?\(([^)]+)\)/)[1].split(",").map((x) => parseFloat(x.trim()));
    return { c: [p[0], p[1], p[2]], a: p[3] ?? 1 };
  };
  // Halbtransparente Sidebar-Flächen liegen auf dem Verlauf → vorher mischen.
  const over = (fg, bg) => fg.c.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
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

  const bgTop = hex(tok("ce-sidebar-bg-top"));
  const bgMid = hex(tok("ce-sidebar-bg-mid"));
  const bgBot = hex(tok("ce-sidebar-bg-bottom"));

  // Supportkarte: dunklere Eigenfläche über dem unteren Verlaufsende.
  const well = over(rgba(tok("ce-sidebar-well")), bgBot);
  // Aktiver Eintrag: blau getönter Verlauf. Der DUNKELSTE Punkt ist maßgeblich —
  // dort ist der Kontrast zum weißen Text am knappsten.
  const activeStops = tok("ce-sidebar-active-bg").match(/rgba?\([^)]+\)/g).map((x) => over(rgba(x), bgTop));
  const activeDark = activeStops.reduce((a, b) => (lum(a) < lum(b) ? a : b));

  // Text: AA = 4.5:1. Nicht-Text (Icons, Kanten, Fokusring): AA = 3:1.
  const cases = [
    ["Navigationstext auf hellstem Verlaufspunkt", hex(tok("ce-sidebar-text")), bgTop, 4.5],
    ["Navigationstext auf Verlaufsmitte", hex(tok("ce-sidebar-text")), bgMid, 4.5],
    ["aktiver Eintrag (dunkelster Verlaufspunkt)", hex(tok("ce-sidebar-text-strong")), activeDark, 4.5],
    ["Gruppenüberschrift", hex(tok("ce-sidebar-section")), bgTop, 4.5],
    ["Fußzeile", hex(tok("ce-sidebar-section")), bgBot, 4.5],
    ["Supporttitel auf vertiefter Fläche", hex(tok("ce-sidebar-text-strong")), well, 4.5],
    ["Support-Hinweistext", hex(tok("ce-sidebar-text-muted")), well, 4.5],
    ["Icon inaktiv", hex(tok("ce-sidebar-icon")), bgMid, 3],
    ["Icon aktiv", hex(tok("ce-sidebar-active-icon")), activeDark, 3],
    ["Aktivkante", hex(tok("ce-sidebar-active-accent")), activeDark, 3],
    ["Fokusring", hex(tok("ce-sidebar-active-icon")), bgMid, 3],
  ];
  for (const [label, fg, bg, min] of cases) {
    const r = ratio(fg, bg);
    assert.ok(r >= min, `${label}: Kontrast ${r.toFixed(2)}:1 unterschreitet ${min}:1`);
  }
});

test("19 — Inhaltstexte bleiben auf der Ivory-Fläche lesbar", () => {
  const hex = (h) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
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
  // Gegen den HELLSTEN Punkt der Rampe prüfen (ungünstigster Fall für Text).
  const top = hex(tok("ce-app-bg-top"));
  assert.ok(ratio(hex(tok("text-primary")), top) >= 4.5, "Primärtext unter AA");
  assert.ok(ratio(hex(tok("text-secondary")), top) >= 4.5, "Sekundärtext unter AA");

  // Weiße Karten müssen sich vom Grund abheben. Der Grund darf deshalb nicht
  // bis an Weiß heranlaufen — genau daran krankte die vorige Fassung, in der
  // Karte und Untergrund praktisch gleich hell waren.
  const white = [255, 255, 255];
  for (const stop of ["ce-app-bg-top", "ce-app-bg-mid", "ce-app-bg-bottom"]) {
    const c = hex(tok(stop));
    const delta = Math.max(...white.map((w, i) => w - c[i]));
    assert.ok(delta >= 4, `--${stop} liegt zu nah an Kartenweiß (max. Kanaldifferenz ${delta})`);
  }
});

test("20 — Sidebar und Hauptfläche bilden einen deutlichen Helligkeitskontrast", () => {
  const hex = (h) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
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
  // Der Premiumkontrast Sidebar↔Hauptfläche ist die tragende Idee dieses
  // Layouts. Fällt er unter ~12:1, verwässert die Trennung.
  const r = ratio(hex(tok("ce-sidebar-bg-mid")), hex(tok("ce-app-bg-mid")));
  assert.ok(r >= 12, `Sidebar↔Hauptfläche nur ${r.toFixed(1)}:1 — zu schwach für die Trennung`);

  // Die Sidebar darf dunkel sein, aber nicht schwarz: der Blaukanal muss
  // deutlich über dem Rotkanal liegen (Navy/Slate statt Neutralschwarz).
  for (const stop of ["ce-sidebar-bg-top", "ce-sidebar-bg-mid", "ce-sidebar-bg-bottom"]) {
    const [r0, , b0] = hex(tok(stop));
    assert.ok(b0 - r0 >= 8, `--${stop} wirkt neutralschwarz statt Navy/Slate (B−R = ${b0 - r0})`);
  }
});

/* ── Fachliche Komponenten ──────────────────────────────────────────────── */

test("21 — das Chrome greift nicht in fachliche Komponenten ein", () => {
  const start = premiumRules.indexOf(".app-shell");
  const end = premiumRules.indexOf(".ce-mail-dialog");
  const chrome = premiumRules.slice(start, end);
  // Selektoren fachlicher Module haben im Shell-/Sidebar-Block nichts verloren.
  for (const sel of [
    ".table-card", ".field-", ".btn", ".offer-", ".calc-", ".ins-",
    ".kpi-", ".inv-", ".abk-", ".dft-", ".profile-", ".pp-kpi", ".pp-main",
  ]) {
    assert.ok(!chrome.includes(sel), `Chrome darf ${sel} nicht anfassen`);
  }
});

/* ── Footer der App-Shell ───────────────────────────────────────────────── */

test("22 — die werbliche Selbstbeschreibung im Footer ist restlos entfernt", () => {
  // Der frühere Übersicht-Footer beschrieb das Design, statt Rechtliches zu
  // verlinken. Weder Markup noch Stil dürfen zurückkehren.
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

  // Genau die bereits bestehenden Routen aus App.jsx — keine neuen Ziele.
  const routes = [["Impressum", "/impressum"], ["Datenschutz", "/datenschutz"],
                  ["AGB", "/agb"], ["Widerruf", "/widerruf"]];
  const app = read("../../App.jsx");
  for (const [label, to] of routes) {
    assert.ok(footerJsx.includes(`to="${to}"`), `Footer-Link ${to} fehlt`);
    assert.ok(footerJsx.includes(`>${label}<`), `Footer-Label ${label} fehlt`);
    assert.ok(app.includes(`path="${to}"`), `Route ${to} existiert nicht in App.jsx — kein erfundenes Ziel erlaubt`);
  }
  // Neuer Tab: der Seitenzustand (z. B. Preisrechner-Formular) bleibt erhalten.
  assert.ok(!/target="_blank"(?![\s\S]{0,80}rel="noopener noreferrer")/.test(footerJsx),
    "target=_blank braucht rel=noopener noreferrer");
});

test("24 — es gibt genau einen Footer im eingeloggten Bereich", () => {
  // Beide Shell-Renderer nutzen dieselbe Komponente …
  for (const [name, jsx] of [["DashboardPage", dashboardJsx], ["DashboardLayout", layoutJsx]]) {
    assert.match(jsx, /<LegalLinks \/>/, `${name}: zentraler Footer fehlt`);
  }
  // … und die Übersicht ist nicht mehr ausgenommen.
  assert.ok(!/page !== "overview" && <LegalLinks/.test(stripJsxComments(dashboardJsx)),
    "die Übersicht darf nicht vom gemeinsamen Footer ausgenommen sein");
  // Der öffentliche Footer bleibt eine getrennte Komponente.
  assert.match(navbarJsx, /<Footer \/>/, "öffentlicher Footer (NavbarLayout) wurde angetastet");
  assert.ok(!footerJsx.includes("app-shell"), "der Shell-Footer darf die Shell nicht selbst scopen");
});

test("25 — Footer: Desktop nebeneinander, mobil untereinander, sichtbarer Fokus", () => {
  const f = block(premium, ".app-footer");
  assert.ok(f, ".app-footer fehlt");
  assert.match(f, /justify-content:\s*space-between/, "Copyright links / Links rechts erwartet");
  assert.match(f, /align-items:\s*baseline/, "gemeinsame Grundlinie erwartet");
  assert.match(f, /margin-top:\s*auto/, "Footer muss auf kurzen Seiten nach unten rutschen");
  assert.match(f, /max-width:\s*1240px/, "gleicher Inhaltsrahmen wie .page-body erwartet");

  // Mobiler Umbruch
  const mobile = premiumRules.match(/@media \(max-width: 620px\) \{([\s\S]*?)\n\}/);
  assert.ok(mobile, "mobiler Footer-Breakpoint fehlt");
  assert.match(mobile[1], /\.app-footer\s*\{[^}]*flex-direction:\s*column/,
    "mobil müssen Copyright und Links untereinander stehen");
  assert.match(mobile[1], /\.app-footer-legal a\s*\{[^}]*padding/,
    "mobil brauchen die Links eine größere Trefferfläche");

  // Zustände nicht rein farblich codiert + Fokus sichtbar
  assert.match(premiumRules, /\.app-footer-legal a:hover\s*\{[^}]*text-decoration:\s*underline/,
    "Hover darf nicht allein farblich codiert sein");
  assert.match(premiumRules, /\.app-footer-legal a:focus-visible\s*\{[^}]*outline:/,
    "Fokuszustand der Footer-Links fehlt");
});

test("26 — die Hauptfläche trägt den Footer, ohne schmale Viewports zu sprengen", () => {
  const main = block(premium, ".main-content");
  assert.match(main, /flex-direction:\s*column/, "Flex-Spalte nötig, damit margin-top:auto greift");
  assert.match(main, /min-height:\s*100dvh/, "Hauptfläche muss mindestens den Viewport füllen");
  // Ohne dieses Reset drückt die Min-Content-Breite der Tabelle die Seite auf
  // schmalen Viewports auseinander (Flex: min-width:auto + auto-Margins).
  assert.match(premiumRules, /\.main-content > \*\s*\{[^}]*min-width:\s*0/,
    "min-width-Reset für Flex-Kinder fehlt");
  assert.match(premiumRules, /\.main-content > \*\s*\{[^}]*width:\s*100%/,
    "width:100% fehlt — Kinder mit auto-Margins verlieren sonst die Vollbreite");
});

/* ── Feinschliff-Werte ──────────────────────────────────────────────────── */

test("27 — Hintergrundrampe läuft harmonisch durch", () => {
  const hex = (h) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
  const [top, mid, bot] = ["ce-app-bg-top", "ce-app-bg-mid", "ce-app-bg-bottom"].map((t) => hex(tok(t)));

  // Monoton fallende Helligkeit — kein Auf und Ab im Verlauf.
  const bright = (c) => (c[0] + c[1] + c[2]) / 3;
  assert.ok(bright(top) > bright(mid) && bright(mid) > bright(bot),
    "die Rampe muss von oben nach unten gleichmäßig dunkler werden");

  // Warm→kühl ist gewollt, darf aber keinen Themenwechsel erzeugen. Maßgeblich
  // ist nicht der Einzelschritt, sondern wie weit die Rampe insgesamt über die
  // Warm-kalt-Achse (Rot minus Blau) schwingt — und wie kühl sie unten endet.
  const warmth = (c) => c[0] - c[2];
  assert.ok(warmth(top) > 0, "die Rampe muss oben warm beginnen");
  assert.ok(warmth(bot) <= 0 && warmth(bot) >= -4,
    `Endton zu kühl (Rot−Blau = ${warmth(bot)}) — „nur leicht kühler" erwartet, sonst liest sich der untere Seitenbereich als zweite Zone`);
  const swing = warmth(top) - warmth(bot);
  assert.ok(swing <= 10, `Gesamtschwung über die Warm-kalt-Achse zu groß (${swing})`);
});

test("28 — Lichtfläche ist wahrnehmbar, aber zurückgenommen", () => {
  // Der Token zeigt seit Paket A / Phase 1 per var() auf --ce-color-bg-sheen —
  // der aufgelöste Wert muss weiterhin eine rgba-Farbe im Zielband sein.
  const sheenWert = tok("ce-app-sheen");
  assert.ok(sheenWert, "--ce-app-sheen fehlt");
  const sheen = sheenWert.match(/^rgba\(([^)]+)\)$/);
  assert.ok(sheen, `--ce-app-sheen muss zu einer rgba-Farbe auflösen, ist: ${sheenWert}`);
  const alpha = parseFloat(sheen[1].split(",")[3]);
  // Unter ~0.04 war sie unsichtbar, über ~0.06 zu präsent.
  assert.ok(alpha >= 0.04 && alpha <= 0.06,
    `Lichtflächen-Alpha ${alpha} liegt außerhalb des Zielbands 0.04–0.06`);
  assert.match(premiumRules, /radial-gradient\([^)]*var\(--ce-app-sheen\)/,
    "Lichtfläche muss über das Token laufen");
});

test("29 — aktiver Menüpunkt: neutrale Außenborder, blaue Identität links", () => {
  const border = variables.match(/--ce-sidebar-active-border:\s*(rgba?\([^)]+\))/)?.[1];
  assert.ok(border, "--ce-sidebar-active-border fehlt");
  const [r, g, b] = border.match(/[\d.]+/g).map(Number);
  // Neutral heißt: kein Farbstich in der Border — sonst wirkt der Eintrag
  // zusammen mit blauer Fläche und blauer Kante vollständig blau gerahmt.
  assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 6,
    `Außenborder ist farbig (${border}) — neutral erwartet`);
  // Die blaue Identität bleibt der linke Inset-Streifen.
  assert.match(variables, /--ce-sidebar-active-shadow:\s*inset\s+3px\s+0\s+0/,
    "linke Akzentkante fehlt");
});

test("30 — Sidebar-Sekundärtexte sind lesbar dimensioniert", () => {
  // Jeder gelesene Sekundärtext mindestens 11 px und mit gesetzter Zeilenhöhe.
  // Seit Paket A, Phase 2.5 gilt die 11-px-Untergrenze AUSNAHMSLOS; mit der
  // Sidebar-Neustrukturierung ist der Gruppenkopf zusätzlich von 11 auf 12 px
  // gewachsen. Seine weite Laufweite und die Versalien halten ihn weiterhin
  // klar von den Navigationseinträgen (14 px) getrennt.
  for (const sel of [".pp-brand-sub", ".scard-k", ".scard-s", ".pp-foot"]) {
    const b = block(premium, sel);
    assert.ok(b, `${sel} fehlt`);
    const size = parseFloat(b.match(/font-size:\s*([\d.]+)px/)?.[1] ?? "0");
    assert.ok(size >= 11, `${sel}: ${size}px ist zu klein (mindestens 11px erwartet)`);
    assert.match(b, /line-height:/, `${sel}: Zeilenhöhe fehlt`);
  }

  // Sonst gibt es im Sidebar-Block keinen weiteren Text unter 11 px.
  const start = premiumRules.indexOf(".sidebar.pp-side");
  const end = premiumRules.indexOf(".ce-mail-dialog");
  const sidebar = premiumRules.slice(start, end);
  const small = [...sidebar.matchAll(/([.\w-]+)\s*\{[^}]*?font-size:\s*([\d.]+)px/g)]
    .filter((m) => parseFloat(m[2]) < 11)
    .map((m) => `${m[1]} (${m[2]}px)`);
  assert.deepEqual(small, [],
    `unerwartete Kleinschrift in der Sidebar: ${small.join(", ")}`);

  // Der Gruppenkopf ist KEIN Strukturlabel mehr, sondern ein vollwertiger
  // Eintrag der ersten Ebene. Er muss deshalb mit „Übersicht"/„Adressbuch"
  // übereinstimmen — nicht kleiner, nicht leichter, nicht weit gesperrt.
  // Zeilenanfang als Anker: „.pp-nav-group-items .nitem {" enthält ebenfalls
  // die Zeichenfolge „.nitem {" und würde sonst zuerst greifen.
  const head = block(premium, ".pp-nav-group-head");
  const item = block(premium, "\n.nitem");
  assert.ok(head && item, ".pp-nav-group-head oder .nitem fehlt");
  const wert = (b, prop) => b.match(new RegExp(prop + ":\\s*([^;]+);"))?.[1]?.trim();
  for (const prop of ["font-size", "font-weight", "min-height", "padding-block", "padding-inline", "gap"]) {
    assert.equal(wert(head, prop), wert(item, prop),
      `${prop}: Gruppenkopf (${wert(head, prop)}) und Ebene-1-Eintrag (${wert(item, prop)}) müssen übereinstimmen`);
  }
  // KEINE Versalien und keine Sperrung: für das Label bleiben in der 252-px-
  // Spalte 137 px, „LAGER & AUFTRÄGE" braucht in Versalien bei 15 px 143–153 px
  // und bricht damit zwingend auf zwei Zeilen. Ein 62 px hoher Kopf neben
  // 44-px-Nachbarn ist keine Gleichrangigkeit.
  assert.ok(!/text-transform:\s*uppercase/.test(head),
    "Versalien passen bei gleicher Schriftgröße nicht in die Spalte (gemessen)");
  assert.ok(!/letter-spacing:/.test(head), "der Gruppenkopf braucht keine eigene Laufweite mehr");
  // Die zweite Ebene steht darunter, aber nicht weit darunter.
  const sub = block(premium, ".pp-nav-group-items .nitem");
  const subSize = parseFloat(sub.match(/font-size:\s*([\d.]+)px/)?.[1] ?? "0");
  const itemSize = parseFloat(item.match(/font-size:\s*([\d.]+)px/)?.[1] ?? "0");
  assert.ok(itemSize >= 15, `erste Ebene misst ${itemSize}px — mindestens 15px erwartet`);
  assert.ok(subSize >= 14 && subSize < itemSize,
    `zweite Ebene misst ${subSize}px — erwartet mindestens 14px und kleiner als ${itemSize}px`);
});

/* ── Markenassets (Sidebar-Bildmarke + lokales Trust-Wasserzeichen) ─────── */

test("31 — die generische CubeMark samt Inline-Verlauf ist restlos entfernt", () => {
  for (const [file, src] of [["DashboardSidebar.jsx", sidebarJsx], ["dashboard-premium.css", premium]]) {
    for (const token of ["CubeMark", "ppCubeSb", "pp-brandmark-svg"]) {
      assert.ok(!src.includes(token), `${file}: "${token}" darf nicht zurückkehren`);
    }
  }
  // Kein Inline-<svg> mehr im Sidebar-Markenbereich — die Geometrie liegt
  // ausschließlich in der Assetdatei, nicht dupliziert im JSX.
  assert.ok(!/<linearGradient/.test(sidebarJsx), "Inline-Verlauf in der Sidebar gefunden");
  assert.ok(!/<svg[^>]*pp-brandmark/.test(sidebarJsx), "Inline-SVG der Bildmarke gefunden");
});

test("32 — die Sidebar nutzt die Reverse-Marke als statisches Asset", () => {
  // Die Marke wird an EINER Stelle ausgewählt (components/ui/BrandLogo.jsx);
  // die Sidebar fordert dort nur Variante und Tonlage an. Geometrie, Farben und
  // Herkunft aus dem Master prüft styles/brandIdentity.test.mjs vollständig —
  // hier steht, was die SIDEBAR garantiert.
  assert.match(sidebarJsx, /<BrandLogo[\s\S]*?tone="reverse"/,
    "die Sidebar fordert nicht die Reverse-Variante an");
  assert.match(sidebarJsx, /<BrandLogo[\s\S]*?variant="lockup"/,
    "die Sidebar zeigt nicht die volle Originalkomposition");
  // Statische Vite-Importe, gerendert als <img> — keine inline duplizierte Geometrie.
  for (const datei of ["signet-standard", "signet-reverse", "wordmark-standard", "wordmark-reverse", "lockup-standard", "lockup-reverse"]) {
    assert.ok(brandLogoJsx.includes(`assets/brand/${datei}.svg`),
      `statischer Import von ${datei}.svg fehlt`);
  }
  assert.match(brandLogoJsx, /<img[\s\S]*?src=\{quelle\}/, "die Marke wird nicht als <img> gerendert");
  assert.ok(!/<svg/.test(brandLogoJsx), "Inline-SVG im Markenbauteil gefunden");
  // Die Sidebar setzt eine eigene Breite — ein <img> ohne Intrinsikmaß fiele
  // sonst auf die Ersatzbreite des Browsers zurück.
  assert.match(premium, /\.pp-logo \.ce-brandmark-img \{[^}]*width:\s*\d+px/,
    "die Sidebar setzt keine Markenbreite");
});

test("33 — Marke und Wasserzeichen sind korrekt ausgezeichnet und nicht umgefärbt", () => {
  // Die Marke ist ein Bild OHNE begleitenden Text und trägt deshalb den
  // Markennamen; rein dekorative Aufrufer überschreiben mit alt="".
  assert.match(brandLogoJsx, /alt !== undefined \? alt : "ConfidaraExpress"/,
    "die alt-Regel des Markenbauteils wurde verändert");
  assert.match(brandLogoJsx, /"aria-hidden": "true"/, "dekorative Marken brauchen aria-hidden");
  // Kein typografischer Nachbau mehr — die Wortmarke ist Originalgeometrie.
  assert.ok(!/Confidara<b>Express<\/b>/.test(brandLogoJsx), "die getippte Wortmarke ist zurück");
  assert.match(sidebarJsx, /B2B Versandplattform\./, "Unterzeile wurde verändert");

  const wmImg = overviewJsx.match(/<img[\s\S]*?className="pp-trust-watermark"[\s\S]*?\/>/)?.[0]
    ?? overviewJsx.match(/<img[\s\S]*?pp-trust-watermark[\s\S]*?\/>/)?.[0] ?? "";
  assert.ok(wmImg, "Trust-Wasserzeichen nicht als <img> gefunden");
  assert.match(wmImg, /alt=""/, "Wasserzeichen braucht alt=\"\"");
  assert.match(wmImg, /aria-hidden="true"/, "Wasserzeichen braucht aria-hidden");

  // Keine Einfärbung per CSS — beide Assets liegen bereits in Zielfarbe vor.
  for (const [sel, css] of [[".ce-brandmark-img", primitives], [".pp-trust-watermark", overviewCss]]) {
    const b = block(css, sel);
    assert.ok(b, `${sel} fehlt`);
    const filters = [...stripComments(b).matchAll(/(?:^|[;{\s])filter:\s*([^;}]+)/g)].map((m) => m[1].trim());
    for (const f of filters) assert.equal(f, "none", `${sel}: CSS-Filter "${f}" verboten`);
  }
});

test("34 — das Wasserzeichen ist ein lokales Detail des Trust-Tiles", () => {
  // Existiert ausschließlich in der Übersicht …
  assert.ok(overviewJsx.includes("pp-trust-watermark"), "Wasserzeichen fehlt in Overview.jsx");
  for (const [file, src] of [
    ["DashboardPage.jsx", dashboardJsx], ["DashboardLayout.jsx", layoutJsx],
    ["DashboardSidebar.jsx", sidebarJsx], ["LegalLinks.jsx", footerJsx],
    ["dashboard-premium.css", premium], ["dashboard.css", dashboard],
  ]) {
    assert.ok(!src.includes("pp-trust-watermark"), `${file}: Wasserzeichen gehört nur in die Übersicht`);
  }

  const wm = block(overviewCss, ".pp-trust-watermark");
  assert.ok(wm, ".pp-trust-watermark fehlt");
  assert.match(wm, /position:\s*absolute/, "muss absolut im Tile liegen");
  assert.doesNotMatch(wm, /position:\s*(fixed|sticky)/, "weder fixed noch sticky");
  assert.match(wm, /pointer-events:\s*none/, "darf keine Pointer-Ereignisse blockieren");
  assert.match(wm, /user-select:\s*none/, "user-select: none fehlt");
  assert.match(wm, /z-index:\s*0/, "muss hinter dem Inhalt liegen");
  assert.doesNotMatch(wm, /animation|transition|box-shadow/, "keine Animation, kein Glow");

  // Opazität an jedem Breakpoint innerhalb der Grenze.
  const ops = [...overviewCss.matchAll(/\.pp-trust-watermark\s*\{[^}]*opacity:\s*([\d.]+)/g)]
    .map((m) => parseFloat(m[1]));
  assert.ok(ops.length > 0, "keine Opazität gefunden");
  for (const o of ops) assert.ok(o <= 0.08, `Opazität ${o} überschreitet 0.08`);

  // Der Container trägt das Wasserzeichen und schneidet es an; der fachliche
  // Inhalt bleibt darüber.
  const trust = block(overviewCss, ".pp-trust");
  assert.match(trust, /position:\s*relative/, ".pp-trust braucht position: relative");
  assert.match(trust, /overflow:\s*hidden/, ".pp-trust braucht overflow: hidden");
  assert.match(block(overviewCss, ".pp-trust-item"), /z-index:\s*1/, "Trust-Inhalt muss über der Marke liegen");
});

test("35 — die Markenintegration führt keine neue Hintergrundebene ein", () => {
  // .app-shell behält genau eine Hintergrundebene, .main-content und .pp-main
  // bekommen keine.
  const shell = stripComments(block(premium, ".app-shell"));
  assert.equal((shell.match(/background-image:/g) ?? []).length, 1,
    ".app-shell darf nur eine background-image-Deklaration führen");
  assert.ok(!/mark-|brand\//.test(shell), ".app-shell darf kein Markenasset als Hintergrund führen");

  for (const [sel, css] of [[".main-content", premium], [".pp-main", overviewCss]]) {
    const b = stripComments(block(css, sel));
    assert.ok(b, `${sel} fehlt`);
    assert.doesNotMatch(b, /background(-color|-image)?:/, `${sel}: keine Hintergrundebene zulässig`);
  }
  // Kein SVG als CSS-Data-URI-Kopie — die Assets werden importiert.
  for (const [file, css] of [["overview.css", overviewCss], ["dashboard-premium.css", premium]]) {
    assert.ok(!/data:image\/svg/.test(css), `${file}: Data-URI-Kopie eines SVG gefunden`);
  }
});
