// Sidebar-Informationsarchitektur — Quelltextprüfung.
//
// Geprüft wird die fachliche Struktur, die diese Sidebar tragen soll, und die
// Regeln, an denen sie schon einmal gescheitert ist:
//   1. Reihenfolge und Zusammensetzung (Übersicht · Versand · Adressbuch ·
//      Lager & Aufträge · Konto · Abmelden)
//   2. Versandrechnungen gehören in den Versandblock — aber die Route bleibt
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
  // Zwei bewusste Umkehrungen gegenüber den Vorfassungen: es öffnet sich nichts
  // von selbst, UND aus der Route wird auch keine Hervorhebung mehr abgeleitet.
  // Vorher leuchtete „Lager & Aufträge" auf /stock, während die Gruppe nach
  // einem Reload zu war — die Sidebar behauptete einen geöffneten Bereich, den
  // es nicht gab. Jetzt gibt es genau EINE Aussage: hervorgehoben ist, was der
  // Nutzer geöffnet hat.
  assert.ok(!/useEffect/.test(code), "die Sidebar darf keinen Klappzustand per Effekt setzen");

  // Aus dem page-Wert entsteht KEIN Gruppenzustand mehr — weder Klappzustand
  // noch Hervorhebung. Er markiert nur noch den einzelnen aktiven Eintrag.
  assert.ok(!/activeGroupId/.test(code),
    "aus dem page-Wert darf keine Gruppenmarkierung mehr abgeleitet werden");
  assert.ok(!/pp-nav-group--active/.test(code), "die routenabhängige Gruppenklasse ist noch vorhanden");
  assert.match(code, /"pp-nav-group" \+ \(open \? " pp-nav-group--open" : ""\)/,
    "die Gruppenklasse hängt nicht allein am Klappzustand");

  // Es gibt GENAU EINE Regel, die den Kopf hervorhebt, und die hängt am
  // Klappzustand. Eine zweite Quelle würde die Aussage wieder aufweichen.
  // Den WERT prüfen, nicht per Lookahead überspringen: `\s*(?!none)` gibt beim
  // Backtracking das Leerzeichen frei und greift dann auf ihm — `background: none`
  // rutschte damit durch.
  const kopfFlaechen = [...cssOhneKommentar.matchAll(/^([^{}\n]*\.pp-nav-group-head)\s*\{([^}]*)\}/gm)]
    .filter(([, , decls]) => (decls.match(/^\s*background:\s*([^;]+)/m)?.[1] ?? "none").trim() !== "none")
    .map(([, sel]) => sel.trim());
  assert.deepEqual(kopfFlaechen, [".pp-nav-group--open .pp-nav-group-head"],
    `die Hervorhebung des Kopfes kommt aus mehr als einer Quelle: ${kopfFlaechen.join(" | ")}`);

  // Die Markierung ist SUBTIL — deutlich schwächer als ein aktiver Eintrag:
  // flache Fläche statt Verlauf, schmalere Kante, keine Border.
  const kopfAktiv = regel(".pp-nav-group--open .pp-nav-group-head");
  const eintragAktiv = regel(".nitem.on");
  assert.ok(kopfAktiv && eintragAktiv, "eine der beiden Aktivregeln fehlt");
  assert.match(kopfAktiv, /background:\s*var\(--ce-sidebar-active-bg-soft\)/,
    "der aktive Kopf trägt nicht die schwache Eigenfläche");
  assert.ok(!/gradient/.test(kopfAktiv), "der aktive Kopf darf keinen Verlauf tragen");
  assert.ok(!/border-color/.test(kopfAktiv), "der aktive Kopf darf keine Border tragen — sonst zwei gleich starke Karten");
  // Die Akzentkante des Kopfes ist schmaler als die des aktiven Eintrags. Die
  // des Eintrags steckt im Token (--ce-sidebar-active-shadow), nicht in der Regel.
  const variables = lies("../../styles/variables.css");
  const kopfKante = Number(kopfAktiv.match(/inset (\d+)px 0 0/)?.[1] ?? 0);
  const eintragKante = Number(variables.match(/--ce-sidebar-active-shadow:\s*inset (\d+)px 0 0/)?.[1] ?? 0);
  assert.ok(kopfKante > 0, "die Akzentkante des aktiven Kopfes fehlt");
  assert.ok(kopfKante < eintragKante,
    `Kopfkante ${kopfKante}px ist nicht schmaler als die Eintragskante ${eintragKante}px`);
  assert.match(eintragAktiv, /box-shadow:\s*var\(--ce-sidebar-active-shadow\)/,
    "der aktive Eintrag trägt seine Kante nicht mehr aus dem Token");

  // Auch die route-basierten Seiten markieren ihren Bereich (Preisrechner →
  // Versand, /inventory/products/:id → Lager & Aufträge).
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

test("12 — die fünf Einträge der ersten Ebene sind gleichrangig", () => {
  // Übersicht · Versand · Adressbuch · Lager & Aufträge · Konto bilden EIN
  // Hauptmenü. Ob ein Eintrag eine Gruppe ist, sagt der Chevron — nicht die
  // Schriftgröße, nicht die Höhe, nicht der Innenabstand.
  const item = regel("\n.nitem");
  const head = regel(".pp-nav-group-head");
  assert.ok(item && head, ".nitem oder .pp-nav-group-head fehlt");
  const wert = (b, prop) => b.match(new RegExp(prop + ":\\s*([^;]+);"))?.[1]?.trim();
  for (const prop of ["font-size", "font-weight", "min-height", "padding-block", "padding-inline", "gap", "border-radius"]) {
    assert.equal(wert(head, prop), wert(item, prop),
      `${prop}: Gruppenkopf (${wert(head, prop)}) ≠ Ebene-1-Eintrag (${wert(item, prop)})`);
  }
  assert.match(item, /font-size:\s*15px/, "die erste Ebene ist nicht auf 15px gewachsen");
  assert.match(item, /font-weight:\s*600/, "die erste Ebene trägt nicht das kräftigere Gewicht");
  const hoehe = parseFloat(item.match(/min-height:\s*([\d.]+)px/)?.[1] ?? "0");
  assert.ok(hoehe >= 44, `Eintragshöhe ${hoehe}px — mindestens 44px erwartet`);
  // Auch die Icons: gleiche Größe auf der ersten Ebene.
  assert.match(regel(".pp-nav-group-head svg"), /flex:\s*0 0 18px/, "das Gruppenkopf-Icon misst nicht 18px");
  assert.match(regel("\n.nitem svg"), /flex:\s*0 0 18px/, "das Eintrags-Icon misst nicht 18px");
});

test("13 — die zweite Ebene ist ruhiger, aber weder klein noch grau", () => {
  const sub = regel(".pp-nav-group-items .nitem");
  assert.ok(sub, ".pp-nav-group-items .nitem fehlt");
  const groesse = parseFloat(sub.match(/font-size:\s*([\d.]+)px/)?.[1] ?? "0");
  assert.ok(groesse >= 14 && groesse < 15, `Unterpunkt ${groesse}px — erwartet 14px`);
  assert.match(sub, /font-weight:\s*500/, "der Unterpunkt trägt nicht das leichtere Gewicht");
  assert.match(sub, /padding-inline-start:\s*\d+px/, "die Einrückung der Unterpunkte fehlt");
  const hoehe = parseFloat(sub.match(/min-height:\s*([\d.]+)px/)?.[1] ?? "0");
  assert.ok(hoehe >= 38 && hoehe < 44, `Unterpunkthöhe ${hoehe}px — erwartet knapp unter der ersten Ebene`);
  // Icons minimal leichter, nicht winzig.
  assert.match(regel(".pp-nav-group-items .nitem svg"), /flex:\s*0 0 17px/, "das Unterpunkt-Icon misst nicht 17px");
  // „Abmelden" ist eine Aktion, kein Produktbereich — zweite Ebene, ohne Einrückung.
  const abmelden = regel(".nitem--utility");
  assert.ok(abmelden, ".nitem--utility fehlt");
  assert.match(abmelden, /font-size:\s*14px/, "„Abmelden“ trägt das Gewicht der ersten Ebene");
  assert.ok(!/padding-inline-start/.test(abmelden), "„Abmelden“ darf nicht eingerückt sein");
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

test("16 — Öffnen läuft weich, robust und in EINEM Takt", () => {
  const variables = lies("../../styles/variables.css");
  // Ein gemeinsamer Takt für Rasterspur, Einblendung und Chevron — sonst
  // zerfällt das Öffnen in drei Bewegungen mit drei Geschwindigkeiten.
  const dauer = Number(variables.match(/--ce-sidebar-expand-duration:\s*(\d+)ms/)?.[1] ?? 0);
  assert.ok(dauer >= 180 && dauer <= 240, `Dauer ${dauer}ms — erwartet 180…240ms`);
  assert.match(variables, /--ce-sidebar-expand-ease:/, "die gemeinsame Beschleunigungskurve fehlt");

  // Robuste Technik: Rasterspur 0fr → 1fr. KEINE height:auto-Animation (läuft
  // in keinem Browser verlässlich) und keine gemessene Pixelhöhe.
  const panel = regel(".pp-nav-group-panel");
  assert.match(panel, /display:\s*grid/, "der Panel-Container ist kein Raster");
  assert.match(panel, /grid-template-rows:\s*0fr/, "der geschlossene Zustand hat keine 0fr-Spur");
  assert.match(panel, /transition: grid-template-rows var\(--ce-sidebar-expand-duration\)/,
    "die Höhe wird nicht im gemeinsamen Takt animiert");
  assert.match(cssOhneKommentar, /\.pp-nav-group--open \.pp-nav-group-panel \{ grid-template-rows: 1fr; \}/,
    "der geöffnete Zustand setzt keine 1fr-Spur");
  assert.ok(!/height:\s*auto/.test(cssOhneKommentar.slice(
    cssOhneKommentar.indexOf(".pp-nav-group {"), cssOhneKommentar.indexOf("\n.nitem {"))),
    "es darf keine height:auto-Animation geben");

  // Der Überstand wird gekappt, und die Einträge erscheinen dezent.
  const items = regel(".pp-nav-group-items");
  assert.match(items, /overflow:\s*hidden/, "der Überstand wird nicht gekappt");
  assert.match(items, /min-height:\s*0/, "ohne min-height:0 kollabiert die Rasterspur nicht");
  assert.match(items, /opacity:\s*0/, "die Unterpunkte blenden nicht ein");
  assert.match(items, /transform:\s*translateY\(-\d+px\)/, "die Unterpunkte erscheinen ohne Bewegung");

  // Der Chevron dreht im selben Takt.
  const chevron = regel(".pp-nav-group-chevron");
  assert.match(chevron, /transform:\s*rotate\(-90deg\)/, "der geschlossene Chevron zeigt nicht zur Seite");
  assert.match(chevron, /transition: transform var\(--ce-sidebar-expand-duration\)/,
    "der Chevron läuft nicht im gemeinsamen Takt");
  assert.match(cssOhneKommentar, /\.pp-nav-group--open \.pp-nav-group-chevron \{ transform: rotate\(0deg\); \}/,
    "der geöffnete Chevron zeigt nicht nach unten");
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
