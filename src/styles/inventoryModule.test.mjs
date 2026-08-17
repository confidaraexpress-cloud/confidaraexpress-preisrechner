/* Lager & Aufträge — Oberfläche, Navigation und Abgrenzung zum Versand.
 *
 * Reiner Quelltexttest (kein Browser, keine Abhängigkeiten). Geprüft wird, dass
 * der neue Bereich sich wie ein Teil des bestehenden Produkts verhält:
 *   · EINE Sidebar mit einem erkennbaren Modulblock — keine zweite Navigation
 *   · dieselben Primitives und Muster, kein zweites Karten-/Badge-/Dialogsystem
 *   · Detailseiten über echte Routen, Listen weiter über den page-State
 *   · Bestandswerte werden angezeigt, nie clientseitig als Wahrheit gesetzt
 *   · der bestehende Versandprozess bleibt unangetastet
 *
 * Run: node --test src/styles/inventoryModule.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hier = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => fs.readFileSync(path.join(hier, rel), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const inventoryCss = lies("./inventory.css");
const indexCss = lies("./index.css");
const sidebar = lies("../components/layout/DashboardSidebar.jsx");
const dashboardCss = lies("./dashboard-premium.css");
const app = lies("../App.jsx");
const dashPage = lies("../pages/DashboardPage.jsx");
const layout = lies("../components/layout/DashboardLayout.jsx");

const SEITEN = [
  "../pages/inventory/InventoryOverviewPage.jsx",
  "../pages/inventory/ProductsPage.jsx",
  "../pages/inventory/StockPage.jsx",
  "../pages/inventory/OrdersPage.jsx",
  "../pages/inventory/MovementsPage.jsx",
  "../pages/inventory/ProductDetailPage.jsx",
  "../pages/inventory/OrderDetailPage.jsx",
];
const BAUTEILE = [
  "../components/inventory/InventoryShared.jsx",
  "../components/inventory/ProductForm.jsx",
  "../components/inventory/OrderCreateForm.jsx",
];

/* ══════════ 1 — Sidebar: ein Modulblock, keine zweite Navigation ═════════ */

test("1 — der Lagerblock steht direkt unter „Übersicht“ und trägt fünf Einträge", () => {
  const code = ohneKommentare(sidebar);
  const idxUebersicht = code.indexOf('navigateTo("overview")');
  const idxModul = code.indexOf("pp-nav-module");
  const idxGruppen = code.indexOf("NAV_GROUPS.map");
  assert.ok(idxUebersicht > 0 && idxModul > 0 && idxGruppen > 0, "Ankerpunkte nicht gefunden");
  assert.ok(idxUebersicht < idxModul, "der Lagerblock muss NACH der Übersicht stehen");
  assert.ok(idxModul < idxGruppen, "der Lagerblock muss VOR den übrigen Gruppen stehen");

  for (const id of ["inventory", "products", "stock", "orders", "movements"]) {
    assert.ok(code.includes(`id: "${id}"`), `Sidebar-Eintrag ${id} fehlt`);
  }
  for (const label of ["Lagerübersicht", "Artikel", "Bestand", "Aufträge", "Bewegungen"]) {
    assert.ok(sidebar.includes(label), `Beschriftung „${label}“ fehlt`);
  }
});

test("2 — es bleibt bei EINER Sidebar und EINEM Navigationsbauteil", () => {
  const code = ohneKommentare(sidebar);
  // Genau ein <aside> und ein <nav> — keine zweite Navigation, keine rechte Leiste.
  assert.equal((code.match(/<aside/g) || []).length, 1, "es darf nur eine Sidebar geben");
  assert.equal((code.match(/<nav\b/g) || []).length, 1, "es darf nur eine Navigation geben");
  // Die Lagereinträge nutzen dieselbe .nitem-Klasse wie jeder andere Eintrag.
  const block = code.slice(code.indexOf("pp-nav-module"), code.indexOf("NAV_GROUPS.map"));
  assert.ok(block.includes('className={`nitem'), "die Lagereinträge nutzen nicht das bestehende Eintragsbauteil");
});

test("3 — der Modulblock ist kein Bedienelement (bewusst nicht einklappbar)", () => {
  const code = ohneKommentare(sidebar);
  const block = code.slice(code.indexOf("pp-nav-module"), code.indexOf("NAV_GROUPS.map"));
  // Der Kopf ist eine Überschrift, kein <button>: ein einklappbarer Block
  // bräuchte einen seitenübergreifend erhaltenen Zustand für fünf Zeilen ganz
  // oben — das wäre Komplexität ohne Nutzen.
  const kopf = block.slice(block.indexOf("pp-nav-module-head"), block.indexOf("</div>"));
  assert.ok(!kopf.includes("<button"), "der Blockkopf darf kein Bedienelement sein");
});

test("4 — der Modulblock nutzt ausschließlich vorhandene Sidebar-Tokens", () => {
  const start = dashboardCss.indexOf(".pp-nav-module {");
  assert.ok(start > 0, "die Modulblock-Regeln fehlen");
  const block = dashboardCss.slice(start, dashboardCss.indexOf(".nitem {", start));
  // Keine eigene Farbe, kein Verlauf, kein Schatten, kein Glow, keine Bewegung
  // als Ambiente — der Bereich hebt sich durch Material ab, nicht durch Signal.
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), "der Modulblock trägt ein Farbliteral");
  assert.ok(!/rgba?\(/.test(block), "der Modulblock trägt einen freien Farbwert");
  assert.ok(!/gradient/.test(block), "der Modulblock trägt einen Verlauf");
  assert.ok(!/box-shadow/.test(block), "der Modulblock trägt einen Schatten");
  assert.ok(!/backdrop-filter/.test(block), "backdrop-filter ist systemweit unzulässig");
  assert.ok(block.includes("var(--ce-sidebar-well)"), "der Blockgrund nutzt nicht die vorhandene vertiefte Fläche");
  assert.ok(block.includes("var(--ce-radius-lg)"), "der Radius kommt nicht aus der Foundation");
});

/* ══════════ 2 — Navigationsmodell ════════════════════════════════════════ */

test("5 — Listen bleiben page-State, nur die Detailseiten sind echte Routen", () => {
  // Fünf Listenbereiche im page-State …
  assert.match(dashPage, /"inventory", "products", "stock", "orders", "movements"/,
    "die Listenbereiche fehlen im page-State");
  // … und GENAU zwei neue Routen, beide mit Entitäts-ID.
  const routen = [...app.matchAll(/<Route\s+path="(\/inventory[^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(routen.sort(), ["/inventory/orders/:id", "/inventory/products/:id"],
    "der Routenbestand des Lagermoduls stimmt nicht");
  // Keine Listenroute — eine ID gehört nicht in einen page-String, eine Liste
  // aber sehr wohl in den bestehenden page-State.
  for (const falsch of ['path="/inventory"', 'path="/inventory/products"', 'path="/inventory/orders"']) {
    assert.ok(!app.includes(falsch + ' '), `${falsch} darf keine eigene Route sein`);
  }
});

test("6 — die Detailseiten liegen in der App-Shell (dieselbe Sidebar, derselbe Rahmen)", () => {
  const gruppe = app.slice(app.indexOf("<DashboardLayout />"), app.indexOf("{/* Public: tracking"));
  assert.ok(gruppe.includes("/inventory/products/:id"), "die Artikeldetailseite liegt außerhalb der App-Shell");
  assert.ok(gruppe.includes("/inventory/orders/:id"), "die Auftragsdetailseite liegt außerhalb der App-Shell");
});

test("7 — die Detailseiten markieren ihren Listenbereich in der Sidebar", () => {
  assert.match(layout, /startsWith\("\/inventory\/products"\)\s*\?\s*"products"/);
  assert.match(layout, /startsWith\("\/inventory\/orders"\)\s*\?\s*"orders"/);
});

test("8 — jede Seite bringt GENAU EINEN Seitenkopf mit", () => {
  for (const d of SEITEN) {
    const src = lies(d);
    assert.ok(src.includes("<PageHeader"), `${d} hat keinen Seitenkopf`);
    // Gezählt wird JE RENDERPFAD, nicht je Datei: die Detailseiten haben einen
    // frühen `return` für „nicht gefunden“ mit eigenem, reduziertem Kopf. Auf
    // dem Bildschirm steht dadurch immer genau einer — eine reine Dateizählung
    // würde diesen korrekten Aufbau fälschlich als doppelten Kopf werten.
    for (const pfad of src.split(/\breturn \(/)) {
      const n = (pfad.match(/<PageHeader\b/g) || []).length;
      assert.ok(n <= 1, `${d}: ein Renderpfad zeigt ${n} Seitenköpfe`);
    }
    assert.ok(!/<h1\b/.test(src), `${d} rendert einen eigenen <h1> neben dem Seitenkopf`);
  }
  // Und DashboardLayout gibt den Detailseiten KEINEN zweiten Kopf mit.
  assert.ok(!/ROUTE_HEADERS\s*=\s*\{[^}]*inventory/s.test(layout),
    "die Detailseiten dürfen keinen zusätzlichen ROUTE_HEADERS-Eintrag bekommen");
});

/* ══════════ 3 — Bestehende Primitives, kein zweites System ═══════════════ */

test("9 — kein zweites Karten-, Badge-, Button- oder Dialogsystem", () => {
  for (const d of [...SEITEN, ...BAUTEILE]) {
    const src = lies(d);
    // Karten laufen über .ce-card, Badges über .badge, Buttons über .btn.
    for (const m of src.matchAll(/className="([^"{]*)"/g)) {
      const klassen = m[1].split(/\s+/);
      for (const k of klassen) {
        if (k.startsWith("inv-") || k === "" ) continue;
        assert.ok(
          /^(ce-|btn|badge|field-|page-body|sr-only|loading-center|spinner|adm-back|dft-)/.test(k),
          `${d}: unbekannte Klasse „${k}“ — es gibt kein zweites Designsystem`
        );
      }
    }
  }
});

test("10 — Dialoge laufen über den globalen Mechanismus (Fokusfalle, Escape, Fokusrückgabe)", () => {
  const shared = lies("../components/inventory/InventoryShared.jsx");
  assert.ok(shared.includes('from "../../hooks/useDialog"'), "der globale Dialog-Hook wird nicht genutzt");
  assert.ok(shared.includes("useDialog({ open, onClose"), "useDialog wird nicht eingebunden");
  assert.ok(shared.includes('role="dialog"') && shared.includes('aria-modal="true"'));
  // Und keine Seite baut sich einen eigenen Dialog daneben.
  for (const d of SEITEN) {
    const src = lies(d);
    assert.ok(!src.includes('role="dialog"'), `${d} baut einen eigenen Dialog statt InventoryDialog zu nutzen`);
  }
});

test("11 — Statusbadges tragen IMMER Punkt und Text (nie nur Farbe)", () => {
  for (const d of [...SEITEN, ...BAUTEILE]) {
    const src = lies(d);
    for (const m of src.matchAll(/<span className={?`?badge[^>]*>/g)) {
      const rest = src.slice(m.index, m.index + 260);
      assert.ok(rest.includes("badge-dot"), `${d}: ein Badge ohne Punkt bei „${m[0].slice(0, 60)}“`);
    }
  }
});

test("12 — der Sendungsstatus kommt aus dem BESTEHENDEN Bauteil", () => {
  const detail = lies("../pages/inventory/OrderDetailPage.jsx");
  assert.ok(detail.includes('from "../../components/ui/StatusBadge"'),
    "der Lagerbereich führt ein zweites Statusmodell für Sendungen");
  assert.ok(detail.includes("<StatusBadge status={s.status} />"));
});

/* ══════════ 4 — CSS-Disziplin ════════════════════════════════════════════ */

test("13 — inventory.css trägt kein Farb-, Radius- oder Schattenliteral", () => {
  const regeln = inventoryCss.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(regeln), "Farbliteral in inventory.css");
  assert.ok(!/rgba?\(/.test(regeln), "freier Farbwert in inventory.css");
  assert.ok(!/box-shadow:\s*(?!var\()/.test(regeln), "freier Schatten in inventory.css");
  assert.ok(!/backdrop-filter/.test(regeln), "backdrop-filter ist systemweit unzulässig");
  // Jeder Radius aus der Foundation.
  for (const m of regeln.matchAll(/border-radius:\s*([^;]+);/g)) {
    assert.ok(/var\(--ce-radius-/.test(m[1]), `freier Radius „${m[1].trim()}“ in inventory.css`);
  }
});

test("14 — höchstes Schriftgewicht 600, nichts unter 11 px, keine Halbpixel", () => {
  const regeln = inventoryCss.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of regeln.matchAll(/font-weight:\s*(\d+)/g)) {
    assert.ok(Number(m[1]) <= 600, `Schriftgewicht ${m[1]} überschreitet 600`);
  }
  for (const m of regeln.matchAll(/font-size:\s*([\d.]+)px/g)) {
    const px = Number(m[1]);
    assert.ok(px >= 11, `Schriftgröße ${px}px liegt unter 11px`);
    assert.ok(Number.isInteger(px), `Halbpixel ${px}px`);
  }
});

test("15 — das Stylesheet ist eingebunden und steht VOR patterns.css", () => {
  const inv = indexCss.indexOf("./inventory.css");
  const pat = indexCss.indexOf("./patterns.css");
  assert.ok(inv > 0, "inventory.css ist nicht eingebunden");
  assert.ok(inv < pat, "patterns.css muss als EINZIGE Ebene nach den Bereichs-Stylesheets stehen");
});

test("16 — Tabelle und Karten schalten bei realer Contentbreite um, nicht bei 768 px", () => {
  assert.ok(inventoryCss.includes("@media (max-width: 1100px)"),
    "die Umschaltung muss die reale Contentbreite berücksichtigen (Sidebar + Rahmen)");
  assert.ok(inventoryCss.includes(".inv-list-table { display: none; }"));
  assert.ok(inventoryCss.includes(".inv-list-cards { display: none; }"));
});

test("17 — unter 860 px erreicht jedes Bedienelement 44 px (WCAG 2.5.5)", () => {
  const block = inventoryCss.slice(inventoryCss.indexOf("@media (max-width: 860px)"));
  assert.ok(block.includes("min-height: 44px"), "die Trefferflächenregel fehlt");
  for (const sel of ["inv-row-actions", "inv-card-actions", "inv-form-actions", "inv-quick-row"]) {
    assert.ok(block.includes(sel), `${sel} bleibt unter 44 px`);
  }
});

/* ══════════ 5 — Tabellen und Zahlen ══════════════════════════════════════ */

test("18 — jede Tabelle ist beschriftet, Zahlenspalten sind rechtsbündig", () => {
  for (const d of SEITEN) {
    const src = lies(d);
    const tabellen = (src.match(/<table\b/g) || []).length;
    const captions = (src.match(/<caption\b/g) || []).length;
    assert.equal(captions, tabellen, `${d}: ${tabellen} Tabellen, aber ${captions} Beschriftungen`);
    // ce-num muss auf <th> UND <td> stehen — die Marker sind die Grundlage der
    // rechtsbündigen, tabellarischen Zahlendarstellung.
    if (tabellen > 0 && src.includes('scope="col" className="ce-num"')) {
      assert.ok(src.includes('<td className="ce-num"') || src.includes('className={`ce-num'),
        `${d}: ce-num steht nur auf dem Kopf, nicht auf den Zellen`);
    }
  }
});

/* ══════════ 6 — Abgrenzung zum Versandprozess ════════════════════════════ */

test("19 — der Lagerbereich startet den Versand nur über den bestehenden Prefill", () => {
  const produkte = lies("../pages/inventory/ProductsPage.jsx");
  const auftraege = lies("../pages/inventory/OrdersPage.jsx");
  // Beide reichen einen Prefill nach oben — sie navigieren nicht selbst in die
  // Buchung und rufen keine Preisberechnung auf.
  assert.ok(produkte.includes("onShipProduct?.(payload)"), "der Artikelversand reicht keinen Prefill weiter");
  assert.ok(auftraege.includes("onPrepareShipment?.(payload)"), "die Versandvorbereitung reicht keinen Prefill weiter");
  for (const src of [produkte, auftraege]) {
    assert.ok(!src.includes('navigate("/booking")'), "der Lagerbereich darf nicht direkt in die Buchung springen");
  }
});

test("20 — DashboardPage verdrahtet den Lager-Prefill über denselben Weg wie das Adressbuch", () => {
  assert.ok(dashPage.includes("prefillAddress={addressPrefill}"), "das Adressbuch-Prefill wurde beschädigt");
  assert.ok(dashPage.includes("prefillInventory={inventoryPrefill}"), "der Lager-Prefill ist nicht verdrahtet");
  assert.ok(dashPage.includes("onInventoryPrefillApplied={() => setInventoryPrefill(null)}"),
    "der Lager-Prefill wird nach der Anwendung nicht zurückgesetzt");
  // Und beide führen über navigateTo("new") in denselben Prozess.
  assert.ok(dashPage.includes('navigateTo("new")'));
});

test("21 — der Prefill aus den Detailseiten wird EINMAL gelesen und aus der History entfernt", () => {
  // Bliebe er im History-Eintrag stehen, würde ein Browser-Zurück ihn erneut
  // anwenden — genau das darf nicht passieren.
  assert.ok(dashPage.includes("location.state?.inventoryPrefill"), "der Prefill wird nicht aus dem History-State gelesen");
  assert.ok(/const \{ inventoryPrefill: _weg, \.\.\.rest \} = location\.state \|\| \{\};/.test(dashPage),
    "der Prefill wird nicht aus dem History-Eintrag entfernt");
  assert.ok(dashPage.includes('navigate("/dashboard", { replace: true, state: { ...rest, page: "new" } })'),
    "der bereinigte Eintrag wird nicht per replace gesetzt");
});

test("22 — kein Lagerbauteil fasst Preis, Tarif oder Buchung an", () => {
  for (const d of [...SEITEN, ...BAUTEILE, "../api/inventoryApi.js"]) {
    // Gemessen wird CODE, nicht Prosa: die Erklärung, warum eine Seite den
    // Versand NICHT anfasst, nennt Tarif und Preis zwangsläufig beim Namen.
    // Ein Test, der Kommentare mitzählt, erzwingt schlechtere Kommentare.
    const src = ohneKommentare(lies(d));
    for (const verboten of ["price", "Tarif", "tariff", "shipperTariffId", "calculate-price", "jumingo", "JUMiNGO"]) {
      assert.ok(!src.includes(verboten), `${d} berührt den Versand („${verboten}“)`);
    }
  }
});

test("23 — der Bestand ist nie client-authoritativ", () => {
  const api = lies("../api/inventoryApi.js");
  // Es gibt keinen Endpunkt-Wrapper, der einen Bestand setzt.
  for (const verboten of ["setStock", "putStock", "setBalance", "updateBalance"]) {
    assert.ok(!api.includes(verboten), `${verboten} darf es nicht geben`);
  }
  // Und die Auftragsanlage schickt nur productId + Menge, keine Bestandswerte.
  const form = lies("../components/inventory/OrderCreateForm.jsx");
  assert.ok(form.includes("items: positions.map(p => ({ productId: p.product.id, quantity: Number(p.quantity) }))"),
    "die Auftragsanlage sendet mehr als IDs und Mengen");
  // Die knappe Menge ist ein HINWEIS, keine Sperre — die Entscheidung liegt beim Server.
  assert.ok(form.includes("inv-position-warn"), "der Verfügbarkeitshinweis fehlt");
  assert.ok(!/disabled=\{knapp\}/.test(form), "der Client darf die Anlage nicht selbst blockieren");
});

test("24 — keine Emojis als Zustandsfläche, keine technischen Rohwerte im Text", () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const d of [...SEITEN, ...BAUTEILE]) {
    const src = lies(d);
    assert.ok(!emoji.test(src), `${d} enthält ein Emoji — Zustände tragen ein Icon aus Icon.jsx`);
    // Zustandsflächen kommen aus StateView, nicht aus eigenem Markup.
    if (src.includes("EmptyState") || src.includes("NoResultsState")) {
      assert.ok(src.includes('from "../../components/ui/StateView"'), `${d} nutzt nicht die gemeinsamen Zustandsflächen`);
    }
  }
});
