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
const premium   = read("../../styles/dashboard-premium.css");
const dashboard = read("../../styles/dashboard.css");
const adminCss  = read("../../styles/admin.css");
const authCss   = read("../../styles/auth.css");

const sidebarJsx   = read("./DashboardSidebar.jsx");
const footerJsx    = read("./LegalLinks.jsx");
const overviewJsx  = read("../dashboard/Overview.jsx");
const overviewCss  = read("../../styles/overview.css");
const layoutJsx    = read("./DashboardLayout.jsx");
const adminJsx     = read("./AdminLayout.jsx");
const navbarJsx    = read("./NavbarLayout.jsx");
const dashboardJsx = read("../../pages/DashboardPage.jsx");

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
    "ce-sidebar-card", "ce-sidebar-card-shadow", "ce-sidebar-well",
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
  const tok0 = (n) => variables.match(new RegExp(`--${n}:\\s*([^;]+);`))?.[1].trim();
  // Aktivzustand kommt weiterhin aus dem page-Vergleich, nicht aus der URL.
  assert.match(sidebarJsx, /page === "overview" \? "on" : ""/, "Aktivmarkierung der Übersicht fehlt");
  assert.match(sidebarJsx, /page === item\.id \? "on" : ""/, "Aktivmarkierung der Nav-Einträge fehlt");

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

test("8 — Navigationsstruktur und Aktionen sind unverändert", () => {
  for (const id of ["new", "calculator", "drafts", "shipments", "tracking", "addressbook", "invoices", "profile"]) {
    assert.ok(sidebarJsx.includes(`id: "${id}"`), `Navigationseintrag "${id}" fehlt`);
  }
  for (const label of ["Versand", "Verwaltung", "Abrechnung", "Konto"]) {
    assert.ok(sidebarJsx.includes(`label: "${label}"`), `Navigationsgruppe "${label}" fehlt`);
  }
  assert.match(sidebarJsx, /onClick=\{handleLogout\}/, "Abmelden-Aktion fehlt");
  assert.match(sidebarJsx, /Abmelden/, "Abmelden-Eintrag fehlt");
  assert.match(sidebarJsx, /onClick=\{\(\) => navigateTo\("overview"\)\}/, "Übersicht-Navigation fehlt");
});

test("9 — Firmenkarte bleibt vorhanden und bewusst nicht interaktiv", () => {
  assert.match(sidebarJsx, /className="pp-identity"/, "Firmenkarte fehlt");
  assert.match(sidebarJsx, /pp-identity-name/, "Firmenname fehlt");
  assert.match(sidebarJsx, /pp-identity-email/, "Kontokennung fehlt");
  assert.match(sidebarJsx, /user\?\.company_name \|\| user\?\.name/, "Datenquelle der Firmenkarte geändert");

  // Es gibt keinen Firmenwechsel/kein Dropdown → kein Chevron, keine
  // Hover-/Fokusaffordanz, die eine nicht vorhandene Funktion suggeriert.
  assert.ok(!stripJsxComments(sidebarJsx).includes("pp-identity-chev"),
    "Chevron suggeriert ein Dropdown, das es nicht gibt");
  assert.ok(!premiumRules.includes(".pp-identity:hover"),
    "nicht-interaktive Firmenkarte darf keinen Hover-Zustand haben");
});

test("10 — Firmen- und Supportkarte: eine Materialsprache, zwei Höhenlagen", () => {
  const identity = block(premium, ".pp-identity");
  const scard = block(premium, ".pp-scard");
  assert.ok(identity && scard, "Firmen- oder Supportkarte fehlt");
  // Gemeinsame Sprache: gleiche Rundung, gleiche Bordersprache.
  for (const [name, b] of [["Firmenkarte", identity], ["Supportkarte", scard]]) {
    assert.match(b, /border:\s*1px solid var\(--ce-sidebar-border\)/, `${name}: gemeinsame Border erwartet`);
    assert.match(b, /border-radius:\s*11px/, `${name}: gemeinsame Rundung erwartet`);
  }
  // Firmenkarte erhöht (heller Verlauf + Schatten) …
  assert.match(identity, /background:\s*var\(--ce-sidebar-card\)/, "Firmenkarte: erhöhte Fläche erwartet");
  assert.match(identity, /box-shadow:\s*var\(--ce-sidebar-card-shadow\)/, "Firmenkarte: Tiefe fehlt");
  assert.match(variables, /--ce-sidebar-card:\s*linear-gradient/, "Firmenkarte braucht einen Verlauf");
  // … Supportkarte vertieft (dunklere Eigenfläche, kein Schatten).
  assert.match(scard, /background:\s*var\(--ce-sidebar-well\)/, "Supportkarte: vertiefte Fläche erwartet");
  assert.match(scard, /box-shadow:\s*none/, "Supportkarte darf keinen Schatten tragen");
  // Kein Glassmorphism auf beiden.
  for (const [name, b] of [["Firmenkarte", identity], ["Supportkarte", scard]]) {
    // Kommentare entfernen: sie benennen die Regel („kein backdrop-filter"),
    // ohne sie zu setzen.
    assert.doesNotMatch(stripComments(b), /backdrop-filter/, `${name}: backdrop-filter verboten`);
  }
});

test("11 — Supportkarte behält Inhalt und statischen Statuspunkt", () => {
  assert.match(sidebarJsx, /Ihr persönlicher Kontakt/, "Support-Kicker fehlt");
  assert.match(sidebarJsx, /Live Support/, "Support-Titel fehlt");
  assert.match(sidebarJsx, /className="ce-live"/, "Statuspunkt fehlt");
  assert.match(sidebarJsx, /scard-ic/, "Headset-Iconfläche fehlt");
  assert.match(sidebarJsx, /mailto:support@confidaraexpress\.de/, "Support-Kontakt geändert");

  const live = block(premium, ".ce-live");
  assert.ok(live, ".ce-live fehlt");
  assert.doesNotMatch(live, /animation/, "Statuspunkt darf nicht pulsieren");
  assert.match(live, /box-shadow:\s*none/, "Statuspunkt darf keinen Glow tragen");
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

test("14 — die gesamte Sidebarspalte scrollt, nicht nur die Navigation", () => {
  const inner = block(premium, ".pp-side-in");
  const nav = block(premium, ".pp-nav");
  assert.ok(inner && nav, ".pp-side-in oder .pp-nav fehlt");
  assert.match(inner, /overflow-y:\s*auto/, "Scrollcontainer muss die gesamte Spalte sein");
  // Kein zweiter Scrollbereich: sonst wird Abmelden/Support/Footer abgeschnitten.
  assert.doesNotMatch(nav, /overflow-y:\s*auto/, "kein doppelter Scrollbereich in der Navigation");
  assert.match(nav, /flex:\s*1 0 auto/, "Navigation darf nie unter ihre Inhaltshöhe schrumpfen");
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
  for (const [name, css] of [["admin.css", adminCss], ["auth.css", authCss]]) {
    for (const t of ["ce-sidebar-", "ce-app-"]) {
      assert.ok(!css.includes(`var(--${t}`), `${name} darf keine ${t}*-Tokens verwenden`);
    }
  }
  // Auth-Tokens bleiben ihrerseits aus dem Chrome heraus.
  const start = premiumRules.indexOf(".app-shell");
  const end = premiumRules.indexOf(".ce-mail-dialog");
  assert.ok(!premiumRules.slice(start, end).includes("var(--auth-"),
    "Chrome darf keine --auth-*-Tokens verwenden");
});

/* ── Accessibility: gemessene Kontraste ─────────────────────────────────── */

test("18 — Sidebar-Kontraste erfüllen WCAG AA", () => {
  const tok = (n) => variables.match(new RegExp(`--${n}:\\s*([^;]+);`))?.[1].trim();
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

  // Firmenkarte: Verlauf mit zwei Stops → beide Enden prüfen (ungünstigster Fall).
  const cardStops = tok("ce-sidebar-card").match(/rgba?\([^)]+\)/g).map((x) => over(rgba(x), bgTop));
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
    ["Firmenname auf Karte (hellster Stop)", hex(tok("ce-sidebar-text")), cardStops[0], 4.5],
    ["Konto-E-Mail auf Karte (hellster Stop)", hex(tok("ce-sidebar-text-muted")), cardStops[0], 4.5],
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
  const tok = (n) => variables.match(new RegExp(`--${n}:\\s*([^;]+);`))?.[1].trim();
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
  const tok = (n) => variables.match(new RegExp(`--${n}:\\s*([^;]+);`))?.[1].trim();
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
  const tok = (n) => variables.match(new RegExp(`--${n}:\\s*([^;]+);`))?.[1].trim();
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
  const sheen = variables.match(/--ce-app-sheen:\s*rgba\(([^)]+)\)/);
  assert.ok(sheen, "--ce-app-sheen fehlt");
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
  // Jeder gelesene Sekundärtext mindestens 11 px (vorher 10 / 10,5 px) und mit
  // gesetzter Zeilenhöhe. Ausgenommen sind bewusst NUR die Gruppenlabels
  // (.nsec): Versalien mit weiter Laufweite, die als Struktur gelesen werden —
  // auf 11 px gebracht würden sie mit den Navigationseinträgen konkurrieren.
  for (const sel of [".pp-brand-sub", ".pp-identity-email", ".scard-k", ".scard-s", ".pp-foot"]) {
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
  assert.deepEqual(small, [".nsec (9.5px)"],
    `unerwartete Kleinschrift in der Sidebar: ${small.join(", ")}`);
  // Das Gruppenlabel bleibt nur wegen seiner Laufweite lesbar — die muss bleiben.
  const nsec = block(premium, ".nsec");
  assert.match(nsec, /letter-spacing:\s*0\.1[5-9]em/, ".nsec braucht weite Laufweite");
  assert.match(nsec, /text-transform:\s*uppercase/, ".nsec ist ein Versalien-Strukturlabel");
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

test("32 — die Sidebar nutzt die Reverse-Bildmarke als statisches Asset", () => {
  assert.match(sidebarJsx, /import\s+markReverse\s+from\s+"\.\.\/\.\.\/assets\/brand\/mark-reverse\.svg"/,
    "statischer Import von mark-reverse.svg fehlt");
  assert.match(sidebarJsx, /<img[\s\S]*?src=\{markReverse\}/, "Bildmarke wird nicht als <img> gerendert");
  // Sie sitzt weiterhin in der bestehenden 36×36-Fläche.
  assert.match(sidebarJsx, /className="ce-brandmark">[\s\S]*?<img/, "Bildmarke liegt nicht in .ce-brandmark");

  const reverse = read("../../assets/brand/mark-reverse.svg");
  const white   = read("../../assets/brand/mark-primary.svg");
  assert.ok(reverse.includes('viewBox="0 0 256 256"'), "viewBox der Reverse-Variante geändert");
  // C hell, drei E-Striche in der zugelassenen Kontrast-Akzentfarbe.
  assert.ok(reverse.includes('fill="#F7F8FC"'), "C muss #F7F8FC bleiben");
  assert.equal((reverse.match(/fill="#8EA2F0"/g) ?? []).length, 3,
    "genau die drei E-Striche tragen #8EA2F0");
  // #8EA2F0 ist ausschließlich der Reverse-Variante vorbehalten.
  assert.ok(!/fill="#8EA2F0"/.test(white),
    "#8EA2F0 darf nicht in der Primärvariante für helle Flächen auftauchen");
  assert.ok(white.includes("#0A1633") && white.includes("#2C438C"),
    "Primärvariante muss Navy und Sapphire führen");
});

test("33 — Bildmarke und Wasserzeichen sind dekorativ und nicht umgefärbt", () => {
  // Kein doppeltes Vorlesen: die Wortmarke steht als echter Text daneben.
  const markImg = sidebarJsx.match(/<img[\s\S]*?src=\{markReverse\}[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(markImg, /alt=""/, "Bildmarke braucht alt=\"\"");
  assert.match(markImg, /aria-hidden="true"/, "Bildmarke braucht aria-hidden");
  assert.match(sidebarJsx, /Confidara<b>Express<\/b>/, "HTML-Wortmarke wurde verändert");
  assert.match(sidebarJsx, /B2B Versandplattform\./, "Unterzeile wurde verändert");

  const wmImg = overviewJsx.match(/<img[\s\S]*?className="pp-trust-watermark"[\s\S]*?\/>/)?.[0]
    ?? overviewJsx.match(/<img[\s\S]*?pp-trust-watermark[\s\S]*?\/>/)?.[0] ?? "";
  assert.ok(wmImg, "Trust-Wasserzeichen nicht als <img> gefunden");
  assert.match(wmImg, /alt=""/, "Wasserzeichen braucht alt=\"\"");
  assert.match(wmImg, /aria-hidden="true"/, "Wasserzeichen braucht aria-hidden");

  // Keine Einfärbung per CSS — beide Assets liegen bereits in Zielfarbe vor.
  for (const [sel, css] of [[".pp-brandmark-img", premium], [".pp-trust-watermark", overviewCss]]) {
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
