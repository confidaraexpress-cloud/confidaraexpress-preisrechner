// Sidebar-Informationsarchitektur — Quelltextprüfung.
//
// Redesign 2026-10: Die Sidebar ist Deep Navy und reiner Text (keine Icons),
// der aktive Eintrag trägt Fläche und blaue Akzentkante. Feinkorrektur
// 2026-10: Navigation 15/22 (Hauptpunkte 600, Unterpunkte 500), EIN
// 44-px-Zeilenrhythmus mit 4 px Abstand, Unterzeile unter der Marke, leise
// Lichtfläche, helle Innenkante und weicher Kantenschatten.
// Informationsarchitektur, Reihenfolge, Accordion-Vertrag, Nicht-Persistenz,
// Trefferflächen, weiches Öffnen und Fokus sind unverändert — die Tests dazu
// sind übernommen; die Tests zu Typografie, Rhythmus und Fläche sichern den
// aktuellen, freigegebenen Vertrag.
//
// Geprüft wird die fachliche Struktur, die diese Sidebar tragen soll, und die
// Regeln, an denen sie schon einmal gescheitert ist:
//   1. Reihenfolge und Zusammensetzung (Übersicht · Versand · Adressbuch ·
//      Rechnungen · Lager & Aufträge · Konto · Abmelden)
//   2. Rechnungen sind ein eigenständiger Hauptpunkt — aber die Route bleibt
//   3. Keine Gruppe „Verwaltung", keine Gruppe „Abrechnung"
//   4. Accordion: EIN Wert trägt den Klappzustand, nichts öffnet sich von
//      selbst, der aktive Bereich wird nur markiert
//   5. Keine zweite optische Sidebar (keine Box um eine Gruppe)
//   6. Typografie zweier Ebenen, Trefferflächen, Icons, Fokus
//   7. Weiches Öffnen ohne height:auto-Falle, ohne Bedienbarkeitsverlust
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

test("1 — genau drei direkte Einträge und drei Gruppen", () => {
  assert.ok(/OVERVIEW_ITEM = \{ id: "overview"/.test(code), "Übersicht fehlt als direkter Eintrag");
  assert.ok(/ADDRESSBOOK_ITEM = \{ id: "addressbook"/.test(code), "Adressbuch fehlt als direkter Eintrag");
  assert.ok(/INVOICES_ITEM = \{ id: "invoices"/.test(code), "Rechnungen fehlt als direkter Eintrag");
  assert.equal((code.match(/<SidebarGroup/g) || []).length, 3, "es müssen genau drei Gruppen sein");
  // Adressbuch und Rechnungen bleiben bewusst EIGENSTÄNDIG: das Adressbuch ist
  // eine gemeinsam genutzte Ressource (Versand, Empfänger, Aufträge), und der
  // Rechnungsbereich soll später auch Abo- und andere Abrechnungen aufnehmen —
  // unter „Versand" wäre er dann falsch einsortiert.
  for (const gruppe of ["shipping", "warehouse", "account"]) {
    const start = code.indexOf(`id: "${gruppe}"`);
    const ende = code.indexOf("],", start);
    for (const frei of ["addressbook", "invoices"]) {
      assert.ok(!code.slice(start, ende).includes(`"${frei}"`),
        `${frei} darf nicht in der Gruppe ${gruppe} liegen`);
    }
  }
});

test("2 — die Reihenfolge ist Übersicht → Versand → Adressbuch → Rechnungen → Lager → Konto, Abmelden darunter", () => {
  const nav = code.slice(code.indexOf('<nav className="pp-nav"'), code.indexOf("</nav>"));
  const marken = ["OVERVIEW_ITEM", '"shipping"', "ADDRESSBOOK_ITEM", "INVOICES_ITEM", '"warehouse"', '"account"'];
  const pos = marken.map((m) => nav.indexOf(m));
  assert.ok(pos.every((v) => v >= 0), `nicht alle Bausteine gefunden: ${JSON.stringify(marken.map((m, i) => [m, pos[i]]))}`);
  assert.deepEqual([...pos].sort((a, b) => a - b), pos, "die Reihenfolge im <nav> stimmt nicht");
  // „Abmelden" ist eine Sitzungsaktion und steht in den sekundären Aktionen
  // UNTER der Navigation — nicht als Inhaltsziel im <nav>.
  assert.ok(!nav.includes("handleLogout"), "Abmelden gehört nicht in die Inhaltsnavigation");
  const nachNav = code.slice(code.indexOf("</nav>"));
  assert.ok(nachNav.indexOf("handleLogout") > 0, "Abmelden fehlt unter der Navigation");
});

test("3 — der Versandblock trägt genau fünf Einträge in fester Reihenfolge", () => {
  const start = code.indexOf('id: "shipping"');
  const block = code.slice(start, code.indexOf("],", start));
  const ids = [...block.matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]).filter((id) => id !== "shipping");
  assert.deepEqual(ids, ["new", "calculator", "drafts", "shipments", "tracking"],
    "Bestand oder Reihenfolge des Versandblocks stimmt nicht");
  // Rechnungen sind hier ausdrücklich NICHT mehr enthalten.
  assert.ok(!block.includes('"invoices"'), "Rechnungen dürfen nicht mehr im Versandblock stehen");
});

/* ══════════ 2 — Rechnungen: eigenständig, Route unverändert ═════════════ */

test("4 — „Rechnungen“ ist ein eigenständiger Hauptpunkt zwischen Adressbuch und Lager", () => {
  assert.ok(code.includes('label: "Rechnungen"'), "das Label „Rechnungen“ fehlt");
  assert.ok(!code.includes("Versandrechnungen"), "das alte Label „Versandrechnungen“ steht noch in der Sidebar");
  // Kein Gruppenkopf, sondern ein direkter Eintrag — er wird über NavItem
  // gerendert, nicht über SidebarGroup.
  const nav = code.slice(code.indexOf('<nav className="pp-nav"'), code.indexOf("</nav>"));
  assert.match(nav, /<NavItem item=\{INVOICES_ITEM\}/, "Rechnungen wird nicht als direkter Eintrag gerendert");
  const posAdressbuch = nav.indexOf("ADDRESSBOOK_ITEM");
  const posRechnungen = nav.indexOf("INVOICES_ITEM");
  const posLager = nav.indexOf('"warehouse"');
  assert.ok(posAdressbuch < posRechnungen && posRechnungen < posLager,
    "Rechnungen steht nicht zwischen Adressbuch und Lager & Aufträge");
});

test("5 — der page-Wert bleibt „invoices“ — es wurde nichts umbenannt", () => {
  // Die Umbenennung ist eine Beschriftung, kein Routing-Refactor. Der
  // Dashboard-Bereich heißt weiterhin „invoices"; Seite und Rechnungslogik
  // sind unangetastet.
  assert.ok(code.includes('id: "invoices"'), "der page-Wert wurde verändert");
  assert.match(dashPage, /"invoices"/, "DashboardPage kennt den Bereich invoices nicht mehr");
});

test("5b — die beiden umbenannten Einträge sind NUR umbenannt", () => {
  // „Preisrechner" → „Versandkostenrechner", „Unternehmen & Konto" →
  // „Kontoeinstellungen". Beides sind sichtbare Beschriftungen. Die
  // page-/Routenwerte (`calculator`, `profile`) und die Route /calculator
  // bleiben unverändert — wer den sichtbaren Namen ändert, benennt keine Route um.
  assert.ok(code.includes('label: "Versandkostenrechner"'), "das neue Label des Rechners fehlt");
  assert.ok(code.includes('label: "Kontoeinstellungen"'), "das neue Label der Kontoseite fehlt");
  assert.ok(!code.includes('label: "Preisrechner"'), "das alte Label „Preisrechner“ steht noch");
  assert.ok(!/label: "Unternehmen/.test(code), "das alte Label „Unternehmen & Konto“ steht noch");
  assert.ok(code.includes('id: "calculator"'), "der page-Wert calculator wurde verändert");
  assert.ok(code.includes('id: "profile"'), "der page-Wert profile wurde verändert");
  // Die Route selbst ist unangetastet. Sie ist die einzige Ausnahme des
  // page-State-Modells — die Sidebar setzt auch hier nur den page-Wert,
  // die Weiche steht in DashboardPage.navigateTo.
  assert.match(dashPage, /if \(target\.page === "calculator"\) \{ navigate\("\/calculator"\)/,
    "die Route /calculator wurde verändert");
  // Und der Seitenkopf der Route trägt denselben neuen Namen: zwei Beschriftungen
  // für dieselbe Seite wären ein Widerspruch für den Nutzer.
  assert.match(layout, /calculator:\s*\{[^}]*title:\s*"Versandkostenrechner"/,
    "der Seitenkopf von /calculator trägt nicht den neuen Namen");
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

/* ══════════ 4 — Accordion, kein Selbstöffnen ════════════════════════════ */

test("7 — ein Wert trägt den gesamten Klappzustand (Accordion by construction)", () => {
  assert.ok(/function SidebarGroup\(/.test(code), "das gemeinsame Gruppenbauteil fehlt");
  // Kein zweites Klappmuster daneben: genau ein Klappkopf im Quelltext.
  assert.equal((code.match(/className="pp-nav-group-head"/g) || []).length, 1,
    "es darf nur eine Stelle geben, die einen Gruppenkopf zeichnet");

  // EIN Wert (null oder eine Gruppen-id) statt dreier Booleans. Damit ist
  // „höchstens eine Gruppe offen" eine Eigenschaft des Datentyps und keine
  // Regel, die irgendwo durchgesetzt werden müsste — drei Booleans könnten
  // einen ungültigen Zustand überhaupt erst darstellen.
  assert.ok(/const \[openGroup, setOpenGroupState\] = useState\(/.test(code),
    "der Klappzustand ist kein Einzelwert");
  assert.ok(!/openGroups|setVersandOpen|setKontoOpen|setInventoryOpen/.test(code),
    "es gibt noch gruppenspezifische Einzelzustände");
  // Jede Gruppe leitet ihr Offensein aus demselben Wert ab.
  assert.equal((code.match(/open=\{openGroup === "/g) || []).length, 3,
    "nicht alle drei Gruppen lesen denselben Wert");
  // Ein Klick auf die offene Gruppe schließt sie; ein Klick auf eine andere
  // wechselt — beides in einer Zeile, ohne Sonderfall.
  assert.match(code, /toggleGroup = \(id\) => setOpenGroup\(\(aktuell\) => \(aktuell === id \? null : id\)\)/,
    "das Accordion-Umschalten fehlt");
});

test("8 — die Hervorhebung folgt AUSSCHLIESSLICH dem Klappzustand", () => {
  // Es öffnet sich nichts von selbst, UND aus der Route wird keine
  // Gruppen-Hervorhebung abgeleitet: hervorgehoben ist, was der Nutzer geöffnet hat.
  assert.ok(!/useEffect/.test(code), "die Sidebar darf keinen Klappzustand per Effekt setzen");
  assert.ok(!/activeGroupId/.test(code),
    "aus dem page-Wert darf keine Gruppenmarkierung mehr abgeleitet werden");
  assert.ok(!/pp-nav-group--active/.test(code), "die routenabhängige Gruppenklasse ist noch vorhanden");
  assert.match(code, /"pp-nav-group" \+ \(open \? " pp-nav-group--open" : ""\)/,
    "die Gruppenklasse hängt nicht allein am Klappzustand");

  // Kein Ruhezustand des Kopfes trägt eine eigene Fläche — Fläche gibt es nur
  // beim Hover. Den WERT prüfen, nicht per Lookahead überspringen.
  const kopfFlaechen = [...cssOhneKommentar.matchAll(/^([^{}\n]*\.pp-nav-group-head)\s*\{([^}]*)\}/gm)]
    .filter(([, , decls]) => (decls.match(/^\s*background:\s*([^;]+)/m)?.[1] ?? "none").trim() !== "none")
    .map(([, sel]) => sel.trim());
  assert.deepEqual(kopfFlaechen, [], `ein Gruppenkopf trägt im Ruhezustand eine Fläche: ${kopfFlaechen.join(" | ")}`);

  // Die geöffnete Gruppe ist LEISER markiert als die aktive Seite: reines
  // Weiß statt Fläche (Feinkorrektur 2026-10 — alle Hauptpunkte tragen
  // dasselbe Gewicht). Die aktive Seite trägt Fläche, Akzentkante, hellen
  // Text und Gewicht.
  const kopfAktiv = regel(".pp-nav-group--open .pp-nav-group-head");
  const eintragAktiv = regel(".nitem.on");
  assert.ok(kopfAktiv && eintragAktiv, "eine der beiden Aktivregeln fehlt");
  assert.match(kopfAktiv, /color:\s*var\(--ce-sidebar-text-strong\)/,
    "die geöffnete Gruppe ist nicht über den hellsten Textton markiert");
  assert.ok(!/background|box-shadow|border/.test(kopfAktiv),
    "die geöffnete Gruppe darf keine Fläche, Kante oder Rahmen tragen — sonst konkurriert sie mit der aktiven Seite");
  assert.match(eintragAktiv, /background:\s*var\(--ce-sidebar-active-bg\)/, "die aktive Seite trägt keine Fläche");
  assert.match(eintragAktiv, /color:\s*var\(--ce-sidebar-active-text\)/, "die aktive Seite trägt keine eigene Textfarbe");

  // Auch die route-basierten Seiten markieren ihren Eintrag.
  assert.match(layout, /"\/calculator" \? "calculator"/, "der Preisrechner markiert seinen EINTRAG nicht");
  assert.match(layout, /startsWith\("\/inventory\/products"\)\s*\?\s*"products"/, "das Artikeldetail markiert seinen EINTRAG nicht");
});

test("9 — der Klappzustand wird nicht persistiert und überlebt keinen Reload", () => {
  assert.ok(!/localStorage|sessionStorage/.test(code), "der Klappzustand darf nicht persistiert werden");
  // Der Modulwert überlebt bewusst einen Remount der Sidebar beim
  // Routenwechsel (zwei Routen-Teilbäume) — aber nie einen Reload: ein Reload
  // wertet das Modul neu aus und setzt ihn zwangsläufig auf null.
  assert.match(code, /^let sitzungsOffeneGruppe = null;$/m,
    "der Sitzungswert fehlt oder startet nicht bei null");
  assert.match(code, /useState\(sitzungsOffeneGruppe\)/, "der Startwert kommt nicht aus dem Sitzungswert");
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

test("11 — EIN gleichmäßiger Rhythmus; die Hierarchie tragen Einrückung und Gewicht", () => {
  // Feinkorrektur 2026-10: zwischen ALLEN Zeilen 4 px — Einträge,
  // Gruppenköpfe, Unterpunkte. Die Gruppe selbst trägt keinen Abstand: der
  // Abstand zum ersten Unterpunkt liegt im Klappbereich und verschwindet mit
  // ihm, eine geschlossene Gruppe steht im selben Takt wie jeder Eintrag.
  assert.match(regel(".pp-nav"), /gap:\s*var\(--ce-space-1\)/, "der Zeilenabstand (4 px) zwischen den Einträgen fehlt");
  assert.match(regel(".pp-nav-block"), /gap:\s*var\(--ce-space-1\)/, "der Zeilenabstand (4 px) im Block fehlt");
  assert.match(regel(".pp-nav-group"), /gap:\s*0/,
    "die Gruppe trägt einen eigenen Abstand — eine geschlossene Gruppe stünde aus dem Takt");
  assert.match(regel(".pp-nav-group-items"), /gap:\s*var\(--ce-space-1\)/, "der Zeilenabstand (4 px) der Unterpunkte fehlt");
  assert.match(regel(".pp-nav-group-items > :first-child"), /margin-top:\s*var\(--ce-space-1\)/,
    "der Abstand zum ersten Unterpunkt liegt nicht im Klappbereich");
  assert.match(regel(".pp-nav-group-items .nitem"), /padding-inline-start:/,
    "die Einrückung der Gruppeneinträge fehlt");
  // KEINE Linie zwischen den Inhaltsbereichen — dort trägt der Weißraum. Die
  // einzige Linie der Spalte steht vor den sekundären Aktionen.
  // Die Klappmarke zeichnet sich selbst über zwei Kanten — sie ist keine
  // Trennlinie und wird deshalb vor der Prüfung herausgenommen.
  const nav = cssOhneKommentar.slice(cssOhneKommentar.indexOf(".pp-nav {"), cssOhneKommentar.indexOf(".nitem.on"))
    .replace(/\.pp-nav-group-chevron\s*\{[^}]*\}/g, "");
  const linien = [...nav.matchAll(/border-top:|border-bottom:/g)];
  assert.equal(linien.length, 0, "die Navigation trägt Trennlinien zwischen den Bereichen");
  assert.match(regel(".pp-side-actions"), /border-top:\s*1px solid var\(--ce-sidebar-divider\)/,
    "die Trennung vor den sekundären Aktionen fehlt");
});

/* ══════════ 6 — Typografie, Trefferfläche, Icons, Fokus ═════════════════ */

test("12 — die Einträge der ersten Ebene sind gleichrangig", () => {
  // Übersicht · Versand · Adressbuch · Rechnungen · Lager & Aufträge · Konto
  // bilden EIN Hauptmenü. Ob ein Eintrag eine Gruppe ist, sagt die kleine
  // Klappmarke — nicht Schrift, Höhe oder Innenabstand. Beide teilen sich
  // deshalb EINE Regel.
  assert.match(cssOhneKommentar, /\.nitem,\s*\.pp-nav-group-head\s*\{/,
    "Gruppenkopf und Eintrag der ersten Ebene teilen sich keine gemeinsame Regel");
  const gemeinsam = regel(".pp-nav-group-head");
  assert.ok(gemeinsam, ".pp-nav-group-head fehlt");
  // Feinkorrektur 2026-10: die Kunden-Sidebar hat ihre eigene Stufe
  // (--ce-sidebar-nav-*); die allgemeine Navigationsrolle (--ce-text-nav-*,
  // Adminbereich und öffentlicher Drawer) bleibt 14/20, 500.
  assert.match(gemeinsam, /font-size:\s*var\(--ce-sidebar-nav-size\)/, "Navigationsgröße 15 px aus dem Sidebar-Token erwartet");
  assert.match(gemeinsam, /font-weight:\s*var\(--ce-sidebar-nav-weight\)/, "Navigationsgewicht 600 aus dem Sidebar-Token erwartet");
  assert.match(gemeinsam, /min-height:\s*var\(--ce-sidebar-nav-row\)/, "Zeilenhöhe 44 px aus dem Sidebar-Token erwartet");
  assert.match(gemeinsam, /border-radius:\s*var\(--ce-radius-sm\)/, "Radius 8 px erwartet");
  const variables = lies("../../styles/variables.css");
  assert.match(variables, /--ce-sidebar-nav-size:\s*var\(--ce-text-body-l-size\)/, "Kunden-Sidebar auf der Stufe body-l (15 px)");
  assert.match(variables, /--ce-sidebar-nav-weight:\s*600/, "Hauptpunkte Gewicht 600");
  assert.match(variables, /--ce-sidebar-nav-weight-sub:\s*500/, "Unterpunkte und sekundäre Aktionen Gewicht 500");
  assert.match(variables, /--ce-sidebar-nav-row:\s*44px/, "Zeilenhöhe der Kunden-Sidebar 44 px");
  assert.match(variables, /--ce-text-nav-weight-active:\s*600/, "aktiv Gewicht 600");
  assert.match(variables, /--ce-text-nav-size:\s*14px/, "die allgemeine Navigationsrolle bleibt 14 px (Adminbereich)");
});

test("13 — die zweite Ebene unterscheidet sich durch Einrückung und eine Gewichtsstufe", () => {
  // Feinkorrektur 2026-10: dieselbe Größe und Zeilenhöhe wie die erste Ebene
  // (15/22, 44 px), um 12 px eingerückt und eine Gewichtsstufe ruhiger (500
  // statt 600) — weder kleiner noch grauer. Der aktive Unterpunkt trägt
  // wieder 600 (.nitem.on steht später in der Datei).
  const sub = regel(".pp-nav-group-items .nitem");
  assert.ok(sub, ".pp-nav-group-items .nitem fehlt");
  assert.match(sub, /padding-inline-start:\s*calc\(var\(--ce-space-3\) \+ 12px\)/, "Einrückung 12 px erwartet");
  assert.match(sub, /font-weight:\s*var\(--ce-sidebar-nav-weight-sub\)/, "die zweite Ebene trägt nicht das Gewicht 500");
  for (const prop of ["font-size", "color", "min-height"]) {
    assert.ok(!new RegExp(prop + ":").test(sub), `die zweite Ebene darf ${prop} nicht eigens setzen`);
  }
  assert.ok(cssOhneKommentar.indexOf(".nitem.on {") > cssOhneKommentar.indexOf(".pp-nav-group-items .nitem {"),
    "der aktive Unterpunkt verlöre sein Gewicht 600 an die Regel der zweiten Ebene");
  // „Abmelden" ist eine Aktion, kein Produktbereich — leiserer Ton, nicht eingerückt.
  const abmelden = regel(".nitem--utility");
  assert.ok(abmelden, ".nitem--utility fehlt");
  assert.match(abmelden, /color:\s*var\(--ce-sidebar-text-muted\)/, "die sekundären Aktionen tragen den leiseren Ton nicht");
  assert.match(abmelden, /font-weight:\s*var\(--ce-sidebar-nav-weight-sub\)/, "die sekundären Aktionen tragen nicht das ruhigere Gewicht");
  assert.ok(!/padding-inline-start/.test(abmelden), "„Abmelden“ darf nicht eingerückt sein");
});

test("14 — unter 860 px erreicht jedes Bedienelement 44 px", () => {
  assert.match(responsive, /\.pp-side \.nitem,/, "die Einträge fallen nicht unter die Touch-Regel");
  assert.match(responsive, /\.pp-side \.pp-nav-group-head \{ min-height: 44px; \}/,
    "die Klappköpfe fallen nicht unter die Touch-Regel");
});

test("15 — die Sidebar ist symbolfrei; die Klappmarke ist eine CSS-Form", () => {
  // Redesign 2026-10: keine Iconleiste, keine Symbole vor Einträgen. Damit
  // entfällt auch die Icon-Komponente in dieser Datei; lucide-react bleibt verboten.
  assert.ok(!/from\s+["']lucide-react["']/.test(sidebar), "lucide-react darf nicht zurückkehren");
  assert.ok(!/<Icon\b/.test(code), "die Sidebar rendert wieder ein Symbol");
  assert.ok(!/import \{ Icon \}/.test(code), "der Icon-Import ist überflüssig");
  // Keine Emojis oder Textzeichen als Klappmarke.
  assert.ok(!/[˅›▸▾]/.test(code), "Textzeichen als Klappmarke gefunden");
  assert.match(code, /<span className="pp-nav-group-chevron" aria-hidden="true" \/>/,
    "die Klappmarke ist kein leeres, aria-hidden Element");
});

test("16 — Öffnen läuft weich, robust und in EINEM Takt", () => {
  const variables = lies("../../styles/variables.css");
  const dauer = Number(variables.match(/--ce-sidebar-expand-duration:\s*(\d+)ms/)?.[1] ?? 0);
  assert.ok(dauer >= 180 && dauer <= 240, `Dauer ${dauer}ms — erwartet 180…240ms`);
  assert.match(variables, /--ce-sidebar-expand-ease:/, "die gemeinsame Beschleunigungskurve fehlt");

  // Robuste Technik: Rasterspur 0fr → 1fr. KEINE height:auto-Animation.
  const panel = regel(".pp-nav-group-panel");
  assert.match(panel, /display:\s*grid/, "der Panel-Container ist kein Raster");
  assert.match(panel, /grid-template-rows:\s*0fr/, "der geschlossene Zustand hat keine 0fr-Spur");
  assert.match(panel, /transition: grid-template-rows var\(--ce-sidebar-expand-duration\)/,
    "die Höhe wird nicht im gemeinsamen Takt animiert");
  assert.match(cssOhneKommentar, /\.pp-nav-group--open \.pp-nav-group-panel \{ grid-template-rows: 1fr; \}/,
    "der geöffnete Zustand setzt keine 1fr-Spur");
  assert.ok(!/height:\s*auto/.test(cssOhneKommentar.slice(
    cssOhneKommentar.indexOf(".pp-nav-group {"), cssOhneKommentar.indexOf(".nitem.on"))),
    "es darf keine height:auto-Animation geben");

  // Der Überstand wird gekappt, die Einträge blenden ruhig ein (ohne Versatz).
  const items = regel(".pp-nav-group-items");
  assert.match(items, /overflow:\s*hidden/, "der Überstand wird nicht gekappt");
  assert.match(items, /min-height:\s*0/, "ohne min-height:0 kollabiert die Rasterspur nicht");
  assert.match(items, /opacity:\s*0/, "die Unterpunkte blenden nicht ein");

  // Die Klappmarke dreht im selben Takt: geschlossen nach rechts, offen nach unten.
  const chevron = regel(".pp-nav-group-chevron");
  assert.match(chevron, /transform:\s*rotate\(-45deg\)/, "die geschlossene Klappmarke zeigt nicht zur Seite");
  assert.match(chevron, /transition: transform var\(--ce-sidebar-expand-duration\)/,
    "die Klappmarke läuft nicht im gemeinsamen Takt");
  assert.match(cssOhneKommentar, /\.pp-nav-group--open \.pp-nav-group-chevron \{ transform: rotate\(45deg\)/,
    "die geöffnete Klappmarke zeigt nicht nach unten");
});

test("16b — eingeklappte Unterpunkte sind nicht bedienbar", () => {
  // Die Einträge bleiben eingeklappt IM DOM (ohne Inhalt gäbe es nichts zu
  // animieren). Damit sie trotzdem nicht per Tabulator erreichbar sind und
  // nicht angesagt werden, trägt der Behälter `visibility: hidden` — das nimmt
  // ihn aus Fokusreihenfolge UND Accessibility-Baum. Der Wechsel ist beim
  // Schließen verzögert, damit die Einträge während der Animation sichtbar
  // bleiben; beim Öffnen greift er sofort.
  const items = regel(".pp-nav-group-items");
  assert.match(items, /visibility:\s*hidden/, "eingeklappte Unterpunkte sind nicht aus dem Fokusfluss genommen");
  assert.match(items, /transition:[\s\S]*visibility 0s linear var\(--ce-sidebar-expand-duration\)/,
    "der Sichtbarkeitswechsel ist beim Schließen nicht verzögert");
  const offen = regel(".pp-nav-group--open .pp-nav-group-items");
  assert.match(offen, /visibility:\s*visible/, "geöffnete Unterpunkte werden nicht sichtbar");
  assert.match(offen, /visibility 0s(?!\s+linear)/, "beim Öffnen darf die Sichtbarkeit nicht verzögert werden");
});

test("16c — reduzierte Bewegung schaltet die Animation ab, ohne die Bedienbarkeit zu brechen", () => {
  const block = cssOhneKommentar.slice(cssOhneKommentar.indexOf("@media (prefers-reduced-motion: reduce)"));
  const ende = block.indexOf("\n}\n", block.indexOf("{")) + 3;
  const regeln = block.slice(0, ende);
  for (const sel of [".pp-nav-group-chevron", ".pp-nav-group-panel", ".pp-nav-group-items"]) {
    assert.ok(regeln.includes(sel), `${sel} wird bei reduzierter Bewegung nicht stillgelegt`);
  }
  // Ohne Bewegung darf die Sichtbarkeit NICHT verzögert umschalten — sonst
  // bliebe der zugeklappte Bereich für die Dauer der Verzögerung fokussierbar.
  assert.match(regeln, /\.pp-nav-group-items \{ transition: visibility 0s; \}/,
    "bei reduzierter Bewegung bleibt die verzögerte Sichtbarkeit stehen");
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

test("19 — die Grundfläche ist Deep Navy; getrennt über Kante, Innenkante und weichen Schatten", () => {
  // ConfidaraExpress-Farbwelt: die Kunden-Sidebar trägt den Deep-Navy-Verlauf
  // (Redesign 2026-10 in der ursprünglichen Farbwelt). Feinkorrektur 2026-10:
  // darüber eine Lichtfläche hinter der Marke (oben luminöser) und ein
  // Navy-Schleier nach unten (Veredelung 2026-10: unten tiefer); zur
  // Hauptfläche trennen die feine Außenkante, eine helle Innenkante und ein
  // weicher, statischer Schatten — keine Leuchtaura, kein Farbton.
  const variables = lies("../../styles/variables.css");
  for (const stop of ["top", "mid", "bottom"]) {
    const hex = variables.match(new RegExp(`--ce-sidebar-bg-${stop}:\\s*#([0-9a-fA-F]{6})`))?.[1];
    assert.ok(hex, `--ce-sidebar-bg-${stop} fehlt`);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(Math.max(r, g, b) <= 0x50, `--ce-sidebar-bg-${stop} ist nicht dunkel`);
    assert.ok(b - r >= 8, `--ce-sidebar-bg-${stop} wirkt neutralschwarz statt Navy`);
  }
  assert.match(variables,
    /--ce-sidebar-bg:\s*linear-gradient\([^;]*var\(--ce-sidebar-depth\)[^;]*radial-gradient\([^;]*var\(--ce-sidebar-light\)[^;]*linear-gradient\(/,
    "--ce-sidebar-bg ist nicht Schleier + Lichtfläche über dem Navy-Verlauf");
  const licht = variables.match(/--ce-sidebar-light:\s*rgba\(([^)]+)\)/)?.[1].split(",").map(Number);
  assert.ok(licht && licht[3] <= 0.2, "die Lichtfläche der Sidebar ist zu stark");
  // Der Schleier ist Navy (kein Schwarz, kein Farbton) und bleibt ein Hauch.
  const tiefe = variables.match(/--ce-sidebar-depth:\s*rgba\(([^)]+)\)/)?.[1].split(",").map(Number);
  assert.ok(tiefe, "--ce-sidebar-depth fehlt");
  assert.ok(tiefe[2] > tiefe[0] && tiefe[3] <= 0.35, "der Schleier ist nicht Navy oder zu dicht");
  const sb = regel(".sidebar.pp-side");
  assert.match(sb, /border-right:\s*1px solid var\(--ce-app-divider\)/, "die feine Trennkante fehlt");
  assert.match(sb, /box-shadow:\s*inset -1px 0 0 var\(--ce-sidebar-edge\), var\(--ce-sidebar-shadow\)/,
    "Innenkante und Kantenschatten fehlen");
  // Der Schatten bleibt weich und neutral: höchstens 10 % Deckkraft, kein Farbton.
  const schatten = variables.match(/--ce-sidebar-shadow:\s*[^;]*rgba\(([^)]+)\)/)?.[1].split(",").map(Number);
  assert.ok(schatten, "--ce-sidebar-shadow fehlt");
  assert.ok(schatten[3] <= 0.14, `Kantenschatten zu kräftig (${schatten[3]})`);
  assert.ok(Math.max(...schatten.slice(0, 3)) - Math.min(...schatten.slice(0, 3)) < 45, "Kantenschatten ist farbig");
  // Geschlossen liegt der Drawer außerhalb — sein Schatten darf nicht als Streifen hereinragen.
  assert.match(cssOhneKommentar, /@media \(max-width: 860px\) \{[\s\S]*?\.sidebar\.pp-side \{ box-shadow: none; \}/,
    "der geschlossene Drawer wirft seinen Kantenschatten in den Bildschirm");
});
