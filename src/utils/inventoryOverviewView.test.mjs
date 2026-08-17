/* Lagerübersicht — Kennzahlen, Aufklappungen, Einstieg.
 *
 * Der Kern dieser Datei ist EINE Zusage: **die Zahl auf der Karte und die Liste
 * dahinter beschreiben dieselbe Menge.** Eine Kennzahl, hinter der beim Klicken
 * etwas anderes steht, ist schlimmer als gar kein Detail — der Nutzer zöge
 * daraus falsche Schlüsse und merkte es nicht.
 *
 * Zusätzlich: die Sprache muss für sehr unterschiedliche Firmen taugen
 * (Großhandel, Maschinenbau, Handwerk, Kanzlei — nicht nur Onlineshops), und
 * ein Bezug wird nie erfunden, wo keiner existiert.
 *
 * Reiner Logik-/Quelltexttest: kein Browser, keine API, keine Datenbank.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  OVERVIEW_METRICS, overviewMetric, overviewPreviewRows,
  positionLabel, dateTimeShort, isInventoryEmpty,
} from "./inventoryView.mjs";

const hier = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => readFileSync(path.join(hier, p), "utf8");
const seite = lies("../pages/inventory/InventoryOverviewPage.jsx");
const shared = lies("../components/inventory/InventoryShared.jsx");
const css = lies("../styles/inventory.css");
const dashboard = lies("../pages/DashboardPage.jsx");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/* Eine vollständige Antwort, wie der Endpunkt sie liefert. Die Zahlen sind so
   gewählt, dass jede Vorschau exakt zu ihrer Kennzahl summiert — genau das
   prüfen die Tests unten. */
const ANTWORT = {
  activeProducts: 3, activeWarehouses: 1, onHandUnits: 131, availableUnits: 118,
  reservedUnits: 7, lowStockCount: 1, openOrders: 2, shippedToday: 8,
  previewLimit: 6,
  previews: {
    activeProducts: [
      { productId: "1", sku: "SCH-001", name: "Schraubenset A", available: 84 },
      { productId: "2", sku: "FIL-020", name: "Filtereinsatz B", available: 12 },
      { productId: "3", sku: "ERS-004", name: "Ersatzteil C", available: 22 },
    ],
    availableProducts: [
      { productId: "1", sku: "SCH-001", name: "Schraubenset A", available: 84 },
      { productId: "3", sku: "ERS-004", name: "Ersatzteil C", available: 22 },
      { productId: "2", sku: "FIL-020", name: "Filtereinsatz B", available: 12 },
    ],
    reservedItems: [
      { reservationId: "10", productId: "1", sku: "SCH-001", name: "Schraubenset A", quantity: 5, orderNumber: "CE-AU26-00024" },
      { reservationId: "11", productId: "2", sku: "FIL-020", name: "Filtereinsatz B", quantity: 2, orderNumber: "CE-AU26-00031" },
    ],
    lowStockProducts: [
      { productId: "2", sku: "FIL-020", name: "Filtereinsatz B", warehouseName: "Hauptlager", available: 3, minStock: 10, missing: 7 },
    ],
    openOrders: [
      { orderId: "500", orderNumber: "CE-AU26-00024", status: "open", recipientCompany: "Muster GmbH", recipientName: "Erika Muster", createdAt: "2026-08-17T10:42:00Z", itemCount: 3 },
      { orderId: "501", orderNumber: "CE-AU26-00025", status: "open", recipientCompany: "Beispiel AG", recipientName: "Max Beispiel", createdAt: "2026-08-17T09:18:00Z", itemCount: 1 },
    ],
    shippedToday: [
      { movementId: "90", productId: "1", sku: "SCH-001", name: "Schraubenset A", quantity: 5, shipmentNumber: "CE-BS26-00007", orderNumber: "CE-AU26-00024", createdAt: "2026-08-17T11:00:00Z" },
      { movementId: "91", productId: "3", sku: "ERS-004", name: "Ersatzteil C", quantity: 3, shipmentNumber: "CE-BS26-00008", orderNumber: null, createdAt: "2026-08-17T11:30:00Z" },
    ],
  },
};

/* ══════════ 1 — Die sechs Kennzahlen ═══════════════════════════════════════ */

test("1 — es bleiben genau die sechs vorhandenen Kennzahlen, keine erfundene", () => {
  assert.deepEqual(OVERVIEW_METRICS.map((m) => m.key), [
    "activeProducts", "availableUnits", "reservedUnits", "lowStockCount", "openOrders", "shippedToday",
  ]);
  // Kein Lagerwert, keine Inventur, keine Prognose — das System führt keine
  // Einstandspreise, eine Bewertung wäre eine Behauptung.
  const verboten = /lagerwert|inventurwert|prognose|forecast|umschlag/i;
  for (const m of OVERVIEW_METRICS) {
    assert.ok(!verboten.test(m.label), `erfundene Kennzahl: ${m.label}`);
  }
});

test("2 — jede Kennzahl trägt Beschriftung, Erklärung, Vorschau und Ziel", () => {
  for (const m of OVERVIEW_METRICS) {
    for (const feld of ["key", "previewKey", "icon", "label", "hint", "dialogTitle", "dialogLead", "emptyText", "linkLabel", "target"]) {
      assert.ok(typeof m[feld] === "string" && m[feld].trim(), `${m.key}: ${feld} fehlt`);
    }
    assert.ok(["products", "stock", "orders", "movements"].includes(m.target),
      `${m.key} zeigt auf einen Bereich, den es nicht gibt: ${m.target}`);
  }
});

test("3 — die Beschriftungen sind eindeutig, nicht abgekürzt", () => {
  const nach = Object.fromEntries(OVERVIEW_METRICS.map((m) => [m.key, m.label]));
  // „Reserviert" und „Niedriger Bestand" ließen offen, WAS reserviert und WAS
  // niedrig ist. Beides sagt die Beschriftung jetzt selbst.
  assert.equal(nach.reservedUnits, "Reservierte Einheiten");
  assert.equal(nach.lowStockCount, "Artikel mit niedrigem Bestand");
  assert.equal(nach.availableUnits, "Verfügbare Einheiten");
});

test("4 — die Sprache taugt für jede Branche, nicht nur für Onlineshops", () => {
  // ConfidaraExpress-Kunden sind Großhändler, Maschinenbauer, Handwerksbetriebe
  // und Kanzleien. Shopvokabular und Lagerfachjargon schließen sie aus.
  const verboten = /shop|bestellung|e-?commerce|fulfillment|allocation|ledger|picking|bin\b|warehouse bin|sku-?nummer/i;
  const texte = OVERVIEW_METRICS.flatMap((m) => [m.label, m.hint, m.dialogTitle, m.dialogLead, m.emptyText, m.linkLabel]);
  for (const t of texte) {
    assert.ok(!verboten.test(t), `unpassender Begriff im Text: „${t}“`);
  }
  // Auch die Seite selbst — inklusive Einstieg.
  const sichtbar = ohneKommentare(seite);
  assert.ok(!/Shop-?Bestellung|E-?Commerce|Endkundenbestellung|Fulfillment/i.test(sichtbar),
    "Shopvokabular in der Seite");
});

/* ══════════ 2 — Zahl und Aufklappung beschreiben dieselbe Menge ═════════════ */

test("5 — verfügbare Einheiten: die Vorschau summiert sich auf die Kennzahl", () => {
  const rows = overviewPreviewRows("availableUnits", ANTWORT.previews);
  const summe = ANTWORT.previews.availableProducts.reduce((s, e) => s + e.available, 0);
  assert.equal(summe, ANTWORT.availableUnits, "Testdaten selbst sind schon inkonsistent");
  assert.equal(rows.length, 3);
  assert.match(rows[0].value, /84/);
});

test("6 — reservierte Einheiten: die Vorschau summiert sich auf die Kennzahl", () => {
  const summe = ANTWORT.previews.reservedItems.reduce((s, e) => s + e.quantity, 0);
  assert.equal(summe, ANTWORT.reservedUnits);
  const rows = overviewPreviewRows("reservedUnits", ANTWORT.previews);
  assert.equal(rows.length, 2);
  // Genau die Frage, die „Reserviert: 7" offen ließ: welche Einheiten, welcher Auftrag.
  assert.equal(rows[0].primary, "Schraubenset A");
  assert.equal(rows[0].meta, "Auftrag CE-AU26-00024");
  assert.match(rows[0].value, /5 reserviert/);
});

test("7 — heute versendet: Kennzahl und Vorschau zählen beide EINHEITEN", () => {
  // Zwei Sendungen, acht Einheiten. Eine Vorschau, die still auf „Anzahl
  // Sendungen" umschwenkte, ergäbe 2 — und wäre unbemerkt falsch.
  const summe = ANTWORT.previews.shippedToday.reduce((s, e) => s + e.quantity, 0);
  assert.equal(summe, ANTWORT.shippedToday);
  const rows = overviewPreviewRows("shippedToday", ANTWORT.previews);
  assert.equal(rows.length, 2);
  assert.match(rows[0].value, /5 Einheiten/);
});

test("8 — niedriger Bestand: die Zeile nennt verfügbar, Mindestbestand UND Fehlmenge", () => {
  const rows = overviewPreviewRows("lowStockCount", ANTWORT.previews);
  assert.equal(rows.length, ANTWORT.lowStockCount, "Vorschaulänge und Kennzahl weichen ab");
  assert.equal(rows[0].primary, "Filtereinsatz B");
  assert.match(rows[0].value, /3 von 10/);
  assert.match(rows[0].value, /7 fehlen/);
  // Das Lager gehört dazu: derselbe Artikel kann in zwei Lagern liegen und dann
  // zweimal zählen — ohne Lagername wäre das unerklärlich.
  assert.equal(rows[0].meta, "Hauptlager");
});

test("9 — offene Aufträge: Nummer, Empfänger, Positionszahl und Zeitpunkt", () => {
  const rows = overviewPreviewRows("openOrders", ANTWORT.previews);
  assert.equal(rows.length, ANTWORT.openOrders);
  assert.equal(rows[0].primary, "CE-AU26-00024");
  assert.equal(rows[0].secondary, "Muster GmbH");
  assert.equal(rows[0].value, "3 Positionen");
  assert.equal(rows[1].value, "1 Position", "Einzahl/Mehrzahl stimmt nicht");
  assert.ok(rows[0].meta, "Zeitpunkt fehlt");
});

/* ══════════ 3 — Nichts erfinden ════════════════════════════════════════════ */

test("10 — ohne Auftrag wird kein Auftrag behauptet", () => {
  const rows = overviewPreviewRows("shippedToday", ANTWORT.previews);
  const direkt = rows.find((r) => r.value.startsWith("3 "));
  assert.equal(direkt.meta, null, "für eine Direktsendung wurde ein Auftrag erfunden");
  assert.equal(direkt.secondary, "Sendung CE-BS26-00008", "die vorhandene Sendungsnummer fehlt");
});

test("11 — fehlende oder kaputte Vorschauen ergeben eine leere Liste, keinen Absturz", () => {
  for (const previews of [null, undefined, {}, { activeProducts: null }, { activeProducts: "viele" }]) {
    for (const m of OVERVIEW_METRICS) {
      assert.deepEqual(overviewPreviewRows(m.key, previews), [], `${m.key} bei ${JSON.stringify(previews)}`);
    }
  }
  assert.deepEqual(overviewPreviewRows("gibtEsNicht", ANTWORT.previews), []);
  assert.equal(overviewMetric("gibtEsNicht"), null);
});

test("12 — fehlende Einzelwerte werden nicht zu 0 oder „undefined“", () => {
  const rows = overviewPreviewRows("activeProducts", { activeProducts: [{ productId: "9", name: "Ohne Bestand" }] });
  assert.equal(rows[0].primary, "Ohne Bestand");
  assert.equal(rows[0].secondary, null, "eine fehlende SKU darf keine leere Beschriftung erzeugen");
  // Number(null) ist 0 — ein fehlender Bestand darf nicht als „0 verfügbar“
  // erscheinen, das wäre von echtem Nullbestand nicht zu unterscheiden.
  assert.match(rows[0].value, /—/);
  assert.ok(!/undefined|null|NaN/.test(rows[0].value));
});

test("13 — Hilfsformate: Einzahl/Mehrzahl und Zeitpunkt ohne Sekunden", () => {
  assert.equal(positionLabel(1), "1 Position");
  assert.equal(positionLabel(3), "3 Positionen");
  assert.equal(positionLabel(0), "0 Positionen");
  assert.equal(positionLabel(null), "—");
  assert.equal(positionLabel("abc"), "—");
  assert.equal(dateTimeShort(null), null);
  assert.equal(dateTimeShort("kein datum"), null);
  const t = dateTimeShort("2026-08-17T10:42:00Z");
  assert.ok(/^\d{2}\.\d{2}\.\d{4}/.test(t), `unerwartetes Format: ${t}`);
  assert.ok(!/:\d{2}:\d{2}/.test(t), "Sekunden gehören nicht in die Anzeige");
});

/* ══════════ 4 — Einstieg für ein leeres Lager ══════════════════════════════ */

test("14 — der Einstieg erscheint bei „kein Artikel“, aber nie beim Laden", () => {
  assert.equal(isInventoryEmpty({ activeProducts: 0 }), true);
  assert.equal(isInventoryEmpty({ activeProducts: 3 }), false);
  // Solange nichts geladen ist, gilt das Lager als eingerichtet — sonst blitzt
  // beim ersten Rendern das Onboarding auf.
  assert.equal(isInventoryEmpty(null), false);
  assert.equal(isInventoryEmpty(undefined), false);
  // Ein Konto MIT Artikeln, aber ohne Bestand, bekommt kein Onboarding: dort ist
  // der nächste Schritt offensichtlich.
  assert.equal(isInventoryEmpty({ activeProducts: 2, availableUnits: 0 }), false);
});

test("15 — die Kennzahlen bleiben auch im leeren Zustand sichtbar", () => {
  const code = ohneKommentare(seite);
  const gridIdx = code.indexOf("inv-stat-grid");
  const onboardingIdx = code.indexOf("InventoryOnboarding");
  assert.ok(gridIdx > 0 && onboardingIdx > 0, "Ankerpunkte nicht gefunden");
  assert.ok(gridIdx < onboardingIdx, "der Einstieg steht über den Kennzahlen");
  // Das Raster darf NICHT an `leer` hängen — sonst verschwänden die Karten.
  const rasterZeile = code.slice(gridIdx - 120, gridIdx);
  assert.ok(!/leer \?|!leer/.test(rasterZeile), "die Kennzahlen sind an den Leerzustand gekoppelt");
});

test("16 — der Einstieg nennt drei Schritte, eine Hauptaktion und den Weg ohne Lager", () => {
  const code = seite;
  assert.match(code, /Lagerverwaltung starten/);
  for (const schritt of ["Artikel anlegen", "Bestand einbuchen", "Direkt versenden oder Auftrag erstellen"]) {
    assert.ok(code.includes(schritt), `Schritt fehlt: ${schritt}`);
  }
  assert.match(code, /Ersten Artikel anlegen/);
  // Der dezente zweite Weg ist der Kern der Aussage „das Lager ist optional“.
  assert.match(code, /Neue Sendung ohne Lager/);
  assert.match(code, /onNewShipment/);
  // Keine Tour, keine Illustrationsorgie. Gemessen wird der CODE, nicht die
  // Begründung darüber — ein Kommentar, der erklärt WARUM es keine Tour gibt,
  // ist keine Tour.
  assert.ok(!/Tooltip|Tour|Schritt-für-Schritt-Assistent/i.test(ohneKommentare(code)));
});

/* ══════════ 5 — Schnellaktionen ════════════════════════════════════════════ */

test("17 — ohne Artikel führt keine Schnellaktion ins Leere", () => {
  const code = ohneKommentare(seite);
  // Die drei Schnellaktionen hängen am eingerichteten Zustand: „Bestand
  // einbuchen“ und „Auftrag erstellen“ brauchen beide einen Artikel und
  // erscheinen erst, sobald es einen gibt.
  const idxLeer = code.indexOf("{leer ?");
  const idxQuick = code.indexOf("inv-quick-row");
  assert.ok(idxLeer > 0 && idxQuick > idxLeer, "die Schnellaktionen hängen nicht am eingerichteten Zustand");
  for (const ziel of ["products", "stock", "orders"]) {
    assert.ok(code.includes(`onNavigate("${ziel}")`), `Schnellaktion fehlt: ${ziel}`);
  }
  // Im leeren Zustand steht die Hauptaktion GENAU EINMAL — nicht zusätzlich in
  // einer zweiten Karte darüber. Zwei identische Hauptaktionen nebeneinander
  // sind kein Angebot, sondern eine Dopplung.
  assert.equal((code.match(/Ersten Artikel anlegen/g) || []).length, 1,
    "„Ersten Artikel anlegen“ steht mehr als einmal auf der Seite");
  // Kein störendes Popup als Erklärung.
  assert.ok(!/window\.alert|alert\(/.test(code), "keine störenden Alert-Popups");
});

/* ══════════ 6 — Bedienbarkeit ══════════════════════════════════════════════ */

test("18 — die Kennzahlkarte ist ein echtes Bedienelement, kein <div onClick>", () => {
  const code = ohneKommentare(shared);
  const block = code.slice(code.indexOf("export function InventoryStatCard"), code.indexOf("export function InventoryPreviewList"));
  assert.match(block, /<button type="button"/, "die aufklappbare Karte ist kein <button>");
  assert.ok(!/<div[^>]*onClick/.test(block), "Klickfunktion auf einem <div>");
  // Ansage für Screenreader: „128“ allein ist keine Handlungsaufforderung.
  assert.match(block, /aria-label=\{detailLabel\}/);
  // Hover, Kante, Tiefe und Fokusring kommen aus dem vorhandenen Primitive.
  assert.match(block, /ce-card-interactive/);
});

test("19 — eine Karte ohne Inhalt ist nicht klickbar (kein leerer Dialog)", () => {
  const code = ohneKommentare(seite);
  assert.match(code, /const klickbar = zeilen\.length > 0/);
  assert.match(code, /onClick=\{klickbar \? \(\) => setOpenMetric\(m\.key\) : undefined\}/);
});

test("20 — der Aufklappdialog nutzt den bestehenden Dialog, kein zweites Panel", () => {
  const code = ohneKommentare(seite);
  assert.match(code, /<InventoryDialog/);
  // Kein Seitenpanel, kein zweites Sideboard.
  assert.ok(!/drawer|sidepanel|side-panel|inv-detail-drawer/i.test(code), "es wurde ein zweites Panel gebaut");
  // Fokusfalle/Escape kommen aus useDialog — hier darf keine zweite entstehen.
  assert.ok(!/addEventListener\("keydown"/.test(code), "eigene Escape-Behandlung statt useDialog");
});

/* ══════════ 7 — „Alle anzeigen“ führt wirklich irgendwohin ═════════════════ */

test("21 — jede Aufklappung führt auf eine bestehende Seite mit passendem Filter", () => {
  const ziele = Object.fromEntries(OVERVIEW_METRICS.map((m) => [m.key, [m.target, m.targetFilter || null]]));
  assert.deepEqual(ziele.activeProducts, ["products", null]);
  assert.deepEqual(ziele.availableUnits, ["stock", null]);
  assert.deepEqual(ziele.reservedUnits, ["orders", null]);
  assert.deepEqual(ziele.lowStockCount, ["stock", "low"]);
  assert.deepEqual(ziele.openOrders, ["orders", "open"]);
  assert.deepEqual(ziele.shippedToday, ["movements", "shipmentsToday"]);
});

test("22 — der Startfilter wirkt genau einmal und ändert das Navigationsmodell nicht", () => {
  const code = ohneKommentare(dashboard);
  // Zweiter Parameter von navigateTo — kein neuer Routenbestand, keine URL.
  assert.match(code, /const navigateTo = \(id, filter = null\) =>/);
  assert.match(code, /setInventoryFilter\(filter \? \{ page: id, filter \} : null\)/);
  // Der Filter trägt seine Zielseite mit, damit er nicht auf einer anderen landet.
  for (const seiteName of ["stock", "orders", "movements"]) {
    assert.ok(code.includes(`inventoryFilter?.page === "${seiteName}"`), `${seiteName} prüft die Zielseite nicht`);
  }
  // Und er wird nach der Anwendung verworfen.
  assert.ok((code.match(/onFilterApplied=\{\(\) => setInventoryFilter\(null\)\}/g) || []).length === 3);
  // Keine neue Route, kein neuer page-Wert.
  assert.ok(!/\/inventory\/(stock|orders|movements)/.test(code), "es wurde eine neue Route eingeführt");
});

/* ══════════ 8 — Raster und Responsivität ══════════════════════════════════ */

test("23 — sechs Karten in 3/2/1 Spalten — keine verwaiste Einzelkarte", () => {
  const regeln = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // auto-fit war die Ursache: bei 200px-Minimum passten fünf Karten in die
  // erste Reihe, die sechste stand allein darunter.
  const grid = regeln.slice(regeln.indexOf(".inv-stat-grid"), regeln.indexOf(".inv-stat ", regeln.indexOf(".inv-stat-grid")));
  assert.ok(!/auto-fit|auto-fill/.test(grid), "das Raster nutzt wieder auto-fit");
  assert.match(regeln, /@media \(min-width: 620px\)\s*\{\s*\.inv-stat-grid \{ grid-template-columns: repeat\(2/);
  assert.match(regeln, /@media \(min-width: 1100px\)\s*\{\s*\.inv-stat-grid \{ grid-template-columns: repeat\(3/);
  assert.equal(OVERVIEW_METRICS.length % 3, 0, "die Kennzahlzahl teilt sich nicht mehr restlos durch 3");
  assert.equal(OVERVIEW_METRICS.length % 2, 0, "die Kennzahlzahl teilt sich nicht mehr restlos durch 2");
});

test("24 — die neuen Flächen bleiben im Designsystem", () => {
  const regeln = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const neu = ["inv-preview-item", "inv-onboarding-lead", "inv-step-num", "inv-ops-grid", "inv-stat-chevron"];
  for (const k of neu) assert.ok(regeln.includes(`.${k}`), `Regel fehlt: .${k}`);
  // Keine eigenen Farb-, Radius- oder Schattenwerte (der Bereichstest prüft das
  // für die ganze Datei; hier zusätzlich der Blick auf die neuen Blöcke).
  const block = regeln.slice(regeln.indexOf(".inv-preview-lead"), regeln.indexOf(".inv-ops-all") + 60);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), "Farbliteral in den neuen Regeln");
  assert.ok(!/rgba?\(/.test(block), "freier Farbwert in den neuen Regeln");
  assert.ok(!/box-shadow:\s*(?!var\()/.test(block), "freier Schatten in den neuen Regeln");
});

test("25 — auch die neuen Bedienelemente erreichen unter 860 px 44 px", () => {
  const regeln = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const mobil = regeln.slice(regeln.indexOf("@media (max-width: 860px)"));
  for (const k of ["inv-onboarding-actions .btn", "inv-ops-all", "inv-stat--action"]) {
    assert.ok(mobil.includes(`.${k}`), `${k} fehlt in der Trefferflächenregel`);
  }
});

/* ══════════ 9 — Ehrlichkeit über den Ausschnitt ═══════════════════════════ */

test("26 — der Dialog sagt, dass er nur eine Vorschau zeigt", () => {
  const code = seite;
  assert.match(code, /Vorschau der ersten/);
  // Und er lädt nichts nach: alles kommt aus der einen Übersichtsantwort.
  const ohne = ohneKommentare(code);
  assert.ok(!/getProducts\(|getBalances\(|getOrders\(|getMovements\(/.test(ohne),
    "der Dialog lädt Daten nach, statt die vorhandene Antwort zu nutzen");
});

test("27 — die operativen Karten erscheinen nur mit Inhalt und laden nichts nach", () => {
  const code = ohneKommentare(seite);
  const block = code.slice(code.indexOf("function OperationalPanels"));
  assert.match(block, /if \(niedrig\.length === 0 && auftraege\.length === 0\) return null/);
  assert.ok(!/useEffect|fetch|get[A-Z]/.test(block), "die operativen Karten setzen einen eigenen Aufruf ab");
  // Sie leben von denselben Vorschauen wie die Kennzahlen — eine Quelle.
  assert.match(block, /overviewPreviewRows\("lowStockCount", previews\)/);
  assert.match(block, /overviewPreviewRows\("openOrders", previews\)/);
});
