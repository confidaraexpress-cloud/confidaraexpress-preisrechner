// Sidebar-Informationsarchitektur — Quelltextprüfung.
//
// Geprüft wird die fachliche Struktur, die diese Sidebar tragen soll, und die
// Regeln, an denen sie schon einmal gescheitert ist:
//   1. Reihenfolge und Zusammensetzung (Übersicht · Versand · Adressbuch ·
//      Lager & Aufträge · Konto · Abmelden)
//   2. Versandrechnungen gehören in den Versandblock — aber die Route bleibt
//   3. Keine Gruppe „Verwaltung", keine Gruppe „Abrechnung"
//   4. Ein Klappsystem für alle drei Gruppen, aktive Gruppe öffnet sich
//   5. Keine zweite optische Sidebar (keine Box um eine Gruppe)
//   6. Typografie, Trefferflächen, Icons, Fokus
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const sidebar    = lies("./DashboardSidebar.jsx");
const layout     = lies("./DashboardLayout.jsx");
const premium    = lies("../../styles/dashboard-premium.css");
const responsive = lies("../../styles/responsive.css");
const dashPage   = lies("../../pages/DashboardPage.jsx");

// Kommentare dürfen historische Namen nennen, ohne die Prüfungen zu stören.
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = ohneKommentare(sidebar);
const cssOhneKommentar = premium.replace(/\/\*[\s\S]*?\*\//g, "");
const regel = (sel) => {
  const m = cssOhneKommentar.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}"));
  return m ? m[1] : null;
};

/* ══════════ 1 — Struktur und Reihenfolge ═════════════════════════════════ */

test("1 — genau zwei direkte Einträge und drei Gruppen", () => {
  assert.ok(/OVERVIEW_ITEM = \{ id: "overview"/.test(code), "Übersicht fehlt als direkter Eintrag");
  assert.ok(/ADDRESSBOOK_ITEM = \{ id: "addressbook"/.test(code), "Adressbuch fehlt als direkter Eintrag");
  assert.equal((code.match(/<SidebarGroup/g) || []).length, 3, "es müssen genau drei Gruppen sein");
  // Adressbuch bleibt bewusst EIGENSTÄNDIG: es ist eine gemeinsam genutzte
  // Ressource (Versand, Empfänger, Aufträge) und gehört unter keine der Gruppen.
  for (const gruppe of ["shipping", "warehouse", "account"]) {
    const start = code.indexOf(`id: "${gruppe}"`);
    const ende = code.indexOf("],", start);
    assert.ok(!code.slice(start, ende).includes('"addressbook"'),
      `Adressbuch darf nicht in der Gruppe ${gruppe} liegen`);
  }
});

test("2 — die Reihenfolge im <nav> ist Übersicht → Versand → Adressbuch → Lager → Konto → Abmelden", () => {
  const nav = code.slice(code.indexOf('<nav className="pp-nav">'), code.indexOf("</nav>"));
  const marken = ["OVERVIEW_ITEM", '"shipping"', "ADDRESSBOOK_ITEM", '"warehouse"', '"account"', "handleLogout"];
  const pos = marken.map((m) => nav.indexOf(m));
  assert.ok(pos.every((v) => v >= 0), `nicht alle Bausteine gefunden: ${JSON.stringify(marken.map((m, i) => [m, pos[i]]))}`);
  assert.deepEqual([...pos].sort((a, b) => a - b), pos, "die Reihenfolge im <nav> stimmt nicht");
});

test("3 — der Versandblock trägt genau sechs Einträge in fester Reihenfolge", () => {
  const start = code.indexOf('id: "shipping"');
  const block = code.slice(start, code.indexOf("],", start));
  const ids = [...block.matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]).filter((id) => id !== "shipping");
  assert.deepEqual(ids, ["new", "calculator", "drafts", "shipments", "tracking", "invoices"],
    "Bestand oder Reihenfolge des Versandblocks stimmt nicht");
});

/* ══════════ 2 — Versandrechnungen: Label neu, Route unverändert ══════════ */

test("4 — „Rechnungen“ heißt sichtbar „Versandrechnungen“ und liegt im Versandblock", () => {
  assert.ok(code.includes('label: "Versandrechnungen"'), "das neue Label fehlt");
  assert.ok(!code.includes('label: "Rechnungen"'), "das alte Label steht noch in der Sidebar");
  const start = code.indexOf('id: "shipping"');
  const block = code.slice(start, code.indexOf("],", start));
  assert.ok(block.includes('id: "invoices"'), "Versandrechnungen liegen nicht im Versandblock");
});

test("5 — der page-Wert bleibt „invoices“ — es wurde nichts umbenannt", () => {
  // Die Umbenennung ist eine Beschriftung, kein Routing-Refactor. Der
  // Dashboard-Bereich heißt weiterhin „invoices"; Seite und Rechnungslogik
  // sind unangetastet.
  assert.ok(code.includes('id: "invoices"'), "der page-Wert wurde verändert");
  assert.match(dashPage, /"invoices"/, "DashboardPage kennt den Bereich invoices nicht mehr");
});

/* ══════════ 3 — Entfallene Gruppen ══════════════════════════════════════ */

test("6 — es gibt keine Gruppe „Verwaltung“ und keine Gruppe „Abrechnung“ mehr", () => {
  // Beide waren Überschriften über einer EINZIGEN Zeile — „Verwaltung" über
  // dem Adressbuch, „Abrechnung" über den Rechnungen. Eine Gruppenüberschrift
  // für einen Eintrag ist Gliederung ohne Gliederungsnutzen.
  for (const weg of ["Verwaltung", "Abrechnung"]) {
    assert.ok(!code.includes(`label: "${weg}"`), `die Gruppe „${weg}“ existiert noch`);
    assert.ok(!code.includes(`>${weg}<`), `„${weg}“ steht noch im sichtbaren Markup`);
  }
  // Und es bleibt keine leere Sektion zurück: die alte Überschriftenklasse ist weg.
  assert.ok(!/className="nsec/.test(code), "die alte Überschriftenklasse .nsec steht noch im Markup");
  assert.ok(!/^\.nsec[\s,{]/m.test(cssOhneKommentar), "die Regeln von .nsec sind noch vorhanden");
});

/* ══════════ 4 — Ein Klappsystem, aktive Gruppe öffnet ═══════════════════ */

test("7 — alle drei Gruppen laufen durch DASSELBE Bauteil", () => {
  assert.ok(/function SidebarGroup\(/.test(code), "das gemeinsame Gruppenbauteil fehlt");
  // Kein zweites Klappmuster daneben: genau ein Klappkopf im Quelltext.
  assert.equal((code.match(/className="pp-nav-group-head"/g) || []).length, 1,
    "es darf nur eine Stelle geben, die einen Gruppenkopf zeichnet");
  // Ein gemeinsamer Zustand für alle Gruppen statt dreier Einzel-States.
  assert.ok(/const \[openGroups, setOpenGroups\]/.test(code), "der gemeinsame Klappzustand fehlt");
  assert.ok(!/setVersandOpen|setKontoOpen|setInventoryOpen/.test(code),
    "es gibt noch gruppenspezifische Einzelzustände");
});

test("8 — die aktive Gruppe öffnet sich, egal welcher Bereich aktiv ist", () => {
  // Der Nutzer darf nie auf einer Seite landen, deren aktiver Eintrag in einer
  // geschlossenen Gruppe verborgen ist.
  assert.ok(/activeGroupId = NAV_GROUPS\.find\(\(g\) => g\.items\.some\(\(i\) => i\.id === page\)\)/.test(code),
    "die aktive Gruppe wird nicht generisch aus dem page-Wert abgeleitet");
  assert.ok(/\}, \[activeGroupId\]\)/.test(code),
    "die Öffnung hängt nicht am Wechsel der aktiven Gruppe");
  // Bewusst an den WECHSEL gebunden, nicht an jeden Render: innerhalb einer
  // Gruppe muss das Zuklappen möglich bleiben.
  assert.ok(!/\}, \[page\]\)/.test(code),
    "die Öffnung darf nicht an jedem page-Wechsel hängen — sonst ließe sich die aktive Gruppe nie zuklappen");
  // Auch die route-basierten Seiten markieren ihren Bereich (Preisrechner →
  // Versand, /inventory/orders/:id → Lager & Aufträge).
  assert.match(layout, /"\/calculator" \? "calculator"/, "der Preisrechner markiert seinen Bereich nicht");
  assert.match(layout, /startsWith\("\/inventory\/orders"\)\s*\?\s*"orders"/, "das Auftragsdetail markiert seinen Bereich nicht");
});

test("9 — der Klappzustand wird nicht persistiert", () => {
  assert.ok(!/localStorage|sessionStorage/.test(code), "der Klappzustand darf nicht persistiert werden");
});

/* ══════════ 5 — Keine zweite optische Sidebar ═══════════════════════════ */

test("10 — keine Gruppe trägt eine eigene Fläche, Kante oder Rundung", () => {
  const gruppe = regel(".pp-nav-group");
  assert.ok(gruppe, ".pp-nav-group fehlt");
  for (const verboten of ["background", "border:", "border-radius", "box-shadow", "backdrop-filter"]) {
    assert.ok(!gruppe.includes(verboten), `.pp-nav-group darf kein ${verboten} tragen`);
  }
  // Und die alte Modulklasse ist restlos verschwunden — nicht nur entrahmt.
  assert.ok(!/pp-nav-module/.test(ohneKommentare(sidebar) + cssOhneKommentar),
    "die alte Modulblock-Klasse ist noch vorhanden");
});

test("11 — die Hierarchie entsteht aus Abstand und Einrückung", () => {
  assert.match(regel(".pp-nav-group"), /margin-top:\s*\d+px/, "der Abstand vor einer Gruppe fehlt");
  assert.match(regel(".pp-nav-group + .nitem"), /margin-top:\s*\d+px/,
    "ein direkter Eintrag nach einer Gruppe braucht denselben Abstand");
  assert.match(regel(".pp-nav-group-items .nitem"), /padding-inline-start:\s*\d+px/,
    "die Einrückung der Gruppeneinträge fehlt");
  // Genau EINE Linie in der Navigation: vor „Abmelden". Keine Trenner zwischen
  // den Inhaltsbereichen — dort trägt der Weißraum.
  const nav = cssOhneKommentar.slice(cssOhneKommentar.indexOf(".pp-nav {"), cssOhneKommentar.indexOf(".nitem.on"));
  const linien = [...nav.matchAll(/border-top:|border-bottom:/g)];
  assert.equal(linien.length, 0, "die Navigation trägt Trennlinien zwischen den Bereichen");
  assert.ok(cssOhneKommentar.includes(".pp-nav-utility-divider"), "die Trennung vor „Abmelden“ fehlt");
});

/* ══════════ 6 — Typografie, Trefferfläche, Icons, Fokus ═════════════════ */

test("12 — Navigationseinträge sind 14 px und mindestens 42 px hoch", () => {
  const item = regel("\n.nitem");
  assert.ok(item, ".nitem fehlt");
  assert.match(item, /font-size:\s*14px/, "die Einträge sind nicht auf die Body-Stufe gewachsen");
  const hoehe = parseFloat(item.match(/min-height:\s*([\d.]+)px/)?.[1] ?? "0");
  assert.ok(hoehe >= 42, `Eintragshöhe ${hoehe}px — mindestens 42px erwartet`);
});

test("13 — der Gruppenkopf bleibt kleiner als die Einträge, aber über 11 px", () => {
  const head = regel(".pp-nav-group-head");
  assert.ok(head, ".pp-nav-group-head fehlt");
  const groesse = parseFloat(head.match(/font-size:\s*([\d.]+)px/)?.[1] ?? "0");
  assert.ok(groesse >= 11 && groesse < 14, `Gruppenkopf ${groesse}px — erwartet 11…13px`);
  assert.match(head, /text-transform:\s*uppercase/, "der Gruppenkopf ist kein Versalienlabel");
  assert.match(head, /letter-spacing:/, "dem Gruppenkopf fehlt die Laufweite");
});

test("14 — unter 860 px erreicht jedes Bedienelement 44 px", () => {
  assert.match(responsive, /\.pp-side \.nitem,/, "die Einträge fallen nicht unter die Touch-Regel");
  assert.match(responsive, /\.pp-side \.pp-nav-group-head \{ min-height: 44px; \}/,
    "die Klappköpfe fallen nicht unter die Touch-Regel");
});

test("15 — Icons kommen aus EINER Quelle, in zwei festen Größen", () => {
  // Keine zweite Iconbibliothek: lucide-react ist als Abhängigkeit entfernt und
  // durch designSystemClosure.test.mjs verboten. Icon.jsx trägt dieselbe
  // Lucide-Geometrie (stroke 1.75, currentColor).
  assert.ok(!/from\s+["']lucide-react["']/.test(sidebar), "lucide-react darf nicht zurückkehren");
  assert.match(sidebar, /import \{ Icon \} from "\.\.\/ui\/Icon"/, "die gemeinsame Icon-Komponente fehlt");
  // Einträge 18, Gruppenköpfe 16 — konsequent, nicht zufällig.
  const groessen = [...code.matchAll(/<Icon n=\{?[^}>]*?\}? s=\{(\d+)\}/g)].map((m) => Number(m[1]));
  assert.ok(groessen.length >= 3, "zu wenige Icons gefunden");
  assert.ok(groessen.every((g) => [14, 16, 17, 18].includes(g)),
    `unerwartete Icongrößen: ${[...new Set(groessen)].join(", ")}`);
  // Keine Emojis oder Textzeichen als Chevron.
  assert.ok(!/[˅›▸▾]/.test(code), "Textzeichen statt Icon als Chevron gefunden");
  assert.match(code, /className="pp-nav-group-chevron"[\s\S]{0,80}<Icon n="chevron"/,
    "der Chevron ist kein Icon aus Icon.jsx");
});

test("16 — der Chevron dreht kurz und respektiert reduzierte Bewegung", () => {
  assert.match(cssOhneKommentar, /\.pp-nav-group--collapsed \.pp-nav-group-chevron \{ transform: rotate\(-90deg\); \}/,
    "der geschlossene Zustand dreht den Chevron nicht");
  const chevron = regel(".pp-nav-group-chevron");
  assert.match(chevron, /transition: transform 1\d\dms/, "die Drehung ist keine kurze Zustandsreaktion");
  assert.match(cssOhneKommentar, /@media \(prefers-reduced-motion: reduce\) \{\s*\.pp-nav-group-chevron \{ transition: none; \}/,
    "reduzierte Bewegung wird nicht respektiert");
});

test("17 — der Fokus bleibt sichtbar und gilt für die ganze Sidebar", () => {
  assert.match(cssOhneKommentar, /\.pp-side :focus-visible \{[^}]*outline:/,
    "der gemeinsame Fokusring der Sidebar fehlt");
  // Kein outline:none ohne Ersatz irgendwo im Sidebarbereich.
  const sidebarCss = cssOhneKommentar.slice(
    cssOhneKommentar.indexOf(".sidebar.pp-side"), cssOhneKommentar.indexOf(".ce-mail-dialog"));
  assert.ok(!/outline:\s*none/.test(sidebarCss), "outline:none ohne gleichwertigen Ersatz gefunden");
});

/* ══════════ 7 — Farbwelt: Navy, aus Tokens, ohne Effekte ════════════════ */

test("18 — die Sidebar-Regeln tragen weiterhin KEIN Farbliteral", () => {
  const sidebarCss = cssOhneKommentar.slice(
    cssOhneKommentar.indexOf(".sidebar.pp-side"), cssOhneKommentar.indexOf(".ce-mail-dialog"));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(sidebarCss), "ein Farbliteral steht in dashboard-premium.css");
  assert.ok(!/backdrop-filter/.test(sidebarCss), "backdrop-filter ist systemweit unzulässig");
});

test("19 — die Grundfläche ist Navy: der Blaukanal liegt klar über dem Rotkanal", () => {
  const variables = lies("../../styles/variables.css");
  const stufen = ["top", "mid", "bottom"].map((s) => {
    const hex = variables.match(new RegExp(`--ce-sidebar-bg-${s}:\\s*#([0-9a-fA-F]{6})`))?.[1];
    assert.ok(hex, `--ce-sidebar-bg-${s} fehlt`);
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  });
  for (const [i, [r, , b]] of stufen.entries()) {
    // Der Vorzustand lag bei 24/22/20 Punkten und las als mattes Anthrazit.
    // Ein sattes Navy braucht spürbar mehr — sonst ist die Farbwelt nur behauptet.
    assert.ok(b - r >= 30,
      `Stufe ${i}: Blauüberschuss nur ${b - r} Punkte — mindestens 30 erwartet (sattes Navy)`);
  }
  // Und weiterhin nicht schwarz: die hellste Stufe trägt echte Helligkeit.
  assert.ok(Math.max(...stufen[0]) >= 55, "die Sidebar ist zu dunkel — sie soll Navy sein, nicht schwarz");
});
